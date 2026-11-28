import { PIN_MINIMAL, samarkan } from '../ai/brankas';
import { bangunTerbit, bacaTerbit, type Terbit } from '../terbit/format';
import { TARGET_BAWAAN, terapkanKeRepo, type HasilTerapkan } from '../terbit/github';
import { periksaSemuaPekan } from '../terbit/gerbang';
import { brankasSesi, bukaDenganPin, buatBrankas, kunciSesi, muatBrankas, simpanBrankas } from './brankasSesi';
import type { Konteks } from './konteks';
import { esc, isoLokal } from './util';

/**
 * Tab Terapkan: membuat berkas terbit (tersaring, tanpa data pribadi) dari draf lalu menyimpannya ke repo lewat GitHub API.
 * Gerbang: semua pekan yang belum berakhir diperiksa validator; bentrok wajib yang belum diterima memblokir (bisa dilewati dengan sadar).
 * Token GitHub disimpan terenkripsi PIN di brankas yang sama dengan kunci Gemini.
 */

interface StatusTerapkan {
  memuatPublik: boolean;
  /** waktu `diterapkan` pada versi yang sedang tayang di situs; null = belum ada / tidak terbaca */
  publik: string | null | undefined;
  semuaPekan: boolean;
  paksa: boolean;
  catatan: string;
  sibuk: boolean;
  hasil: HasilTerapkan | null;
  galat: string;
  info: string;
}

const st: StatusTerapkan = { memuatPublik: false, publik: undefined, semuaPekan: false, paksa: false, catatan: '', sibuk: false, hasil: null, galat: '', info: '' };
const vs = brankasSesi;
const nilai = (id: string) => (document.getElementById(id) as HTMLInputElement | null)?.value ?? '';
const KOTAK = 'kartu p-4';

const waktuLokal = (iso: string): string => new Date(iso).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' });
const tglPanjang = (iso: string): string => new Date(`${iso}T00:00:00`).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

/** Isi berkas terbit tanpa waktu penerapan: dipakai membandingkan dengan yang sudah ada di repo. */
export function isiTanpaWaktu(teks: string): string {
  const h = bacaTerbit(teks);
  return h.ok ? JSON.stringify({ ...h.terbit, diterapkan: '' }) : teks;
}

export const serialTerbit = (t: Terbit): string => JSON.stringify(t);

async function muatPublik(k: Konteks): Promise<void> {
  if (st.memuatPublik) return;
  st.memuatPublik = true;
  try {
    const r = await fetch(`./terbit/jadwal.json?t=${Date.now()}`, { cache: 'no-store' });
    const h = r.ok ? bacaTerbit(await r.text()) : null;
    st.publik = h && h.ok ? h.terbit.diterapkan : null;
  } catch {
    st.publik = null;
  }
  k.gambar();
}

function kartuBrankas(): string {
  if (!vs.dimuat) return `<div class="${KOTAK} text-sm text-slate-500">Memuat…</div>`;
  const petunjukToken = `<ol class="mt-2 list-decimal space-y-0.5 pl-5 text-xs text-slate-600">
      <li>Buka <b>github.com/settings/personal-access-tokens/new</b> (Fine-grained token).</li>
      <li>Repository access: <b>Only select repositories</b>, pilih <b>${esc(TARGET_BAWAAN.repo)}</b>.</li>
      <li>Permissions &gt; Repository permissions &gt; <b>Contents: Read and write</b>. Tidak ada izin lain.</li>
      <li>Atur masa berlaku (mis. 90 hari), buat token, lalu tempel di sini. Token hanya muncul sekali di GitHub.</li></ol>`;
  if (!vs.brankas) {
    return `<div class="${KOTAK}"><h3 class="mb-1 font-bold">Siapkan akses ke repo</h3>
      <p class="text-sm text-slate-600">Token GitHub disimpan <b>terenkripsi dengan PIN di peramban ini</b> (brankas yang sama dengan kunci Gemini). Tidak pernah masuk ke repo atau dikirim ke tempat lain selain GitHub.</p>
      ${petunjukToken}
      <div class="mt-3 grid gap-2 sm:grid-cols-3"><label class="text-sm">PIN (minimal ${PIN_MINIMAL} karakter)<input id="tpPin" type="password" class="isian mt-1 w-full" autocomplete="new-password"></label>
        <label class="text-sm">Ulangi PIN<input id="tpPin2" type="password" class="isian mt-1 w-full" autocomplete="new-password"></label>
        <label class="text-sm">Token GitHub<input id="tpToken" type="password" class="isian mt-1 w-full" autocomplete="off"></label></div>
      <div class="mt-3"><button class="tombol !bg-[#2347b8] !text-white" data-aksi="tpBuat">Simpan dan buka</button></div>
      <p class="mt-2 text-xs text-slate-500">PIN tidak bisa dipulihkan. Bila lupa, brankas dihapus dan token (dan kunci Gemini) dimasukkan lagi.</p></div>`;
  }
  if (!vs.terbuka) {
    return `<div class="${KOTAK}"><h3 class="mb-1 font-bold">Buka brankas</h3><p class="text-sm text-slate-600">Masukkan PIN untuk memakai token GitHub pada sesi ini.</p>
      <div class="mt-3 flex gap-2"><input id="tpPin" type="password" class="isian w-full max-w-xs" autocomplete="current-password"><button class="tombol !bg-[#2347b8] !text-white" data-aksi="tpBuka">Buka</button></div></div>`;
  }
  if (!vs.token) {
    return `<div class="${KOTAK}"><h3 class="mb-1 font-bold">Token GitHub belum diisi</h3>${petunjukToken}
      <div class="mt-3 flex gap-2"><input id="tpToken" type="password" class="isian w-full max-w-md" autocomplete="off" placeholder="Tempel token di sini"><button class="tombol !bg-[#2347b8] !text-white" data-aksi="tpSimpanToken">Simpan token</button></div></div>`;
  }
  return `<div class="${KOTAK}"><div class="flex flex-wrap items-center gap-2 text-sm"><span class="lencana bg-emerald-100 text-emerald-800">Brankas terbuka</span><span>Token: <span class="font-mono text-xs text-slate-500">${esc(samarkan(vs.token))}</span></span>
      <span class="ml-auto"></span><button class="tombol !text-xs" data-aksi="tpGantiToken">Ganti token</button><button class="tombol !text-xs" data-aksi="tpHapusToken">Hapus token</button><button class="tombol !text-xs" data-aksi="tpKunci">Kunci brankas</button></div></div>`;
}

export function renderTerapkan(k: Konteks): string {
  if (!vs.dimuat) void muatBrankas().then(() => k.gambar());
  if (st.publik === undefined) void muatPublik(k);
  const p = k.p;
  const n = p.polaReguler.length;
  const hariIni = isoLokal(new Date());

  let terbit: Terbit | null = null;
  let galatBangun = '';
  try {
    terbit = bangunTerbit(p, new Date());
  } catch (e) {
    galatBangun = e instanceof Error ? e.message : String(e);
  }
  const ukuran = terbit ? Math.round(serialTerbit(terbit).length / 1024) : 0;
  const gerbang = periksaSemuaPekan(p, st.semuaPekan ? undefined : hariIni);
  const ringkasProyek = terbit
    ? `${terbit.proyek.master.rombel.length} kelas, ${terbit.proyek.master.guru.length} guru, ${terbit.proyek.master.ruang.length} ruang, ${terbit.proyek.semesters?.length ?? 0} semester, ${terbit.proyek.kalender.length} kegiatan, sekitar ${ukuran} kB`
    : '';

  const kartuGerbang = gerbang.total === 0
    ? `<div class="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">Tidak ada bentrok atau pelanggaran aturan yang belum diterima pada ${gerbang.pekanDiperiksa} pekan yang diperiksa.</div>`
    : `<div class="rounded-lg bg-red-50 p-3 text-sm text-red-900"><div class="font-semibold">${gerbang.total} pelanggaran belum diputuskan pada ${gerbang.masalah.length} pekan</div>
        <ul class="mt-1 space-y-1 text-xs">${gerbang.masalah.slice(0, 8).map((m) => `<li><b>Pekan ${esc(tglPanjang(m.senin))}</b> (${esc(m.semester)}): ${m.jumlah} pelanggaran. ${esc(m.contoh[0] ?? '')}${m.contoh.length > 1 ? ` <span class="text-red-700">(+${m.jumlah - 1} lainnya)</span>` : ''}</li>`).join('')}${gerbang.masalah.length > 8 ? `<li>… dan ${gerbang.masalah.length - 8} pekan lain.</li>` : ''}</ul>
        <div class="mt-2 text-xs">Perbaiki di Conflict Inspector, atau tandai Terima bila itu keputusan lapangan. Bentrok yang diterima tidak memblokir.</div></div>`;

  const siap = !!terbit && vs.terbuka && !!vs.token && !st.sibuk && (gerbang.total === 0 || st.paksa);
  const alasanNonaktif = !terbit ? 'Data terbit ditolak (lihat di atas).' : !vs.terbuka ? 'Buka brankas dulu.' : !vs.token ? 'Isi token GitHub dulu.' : gerbang.total > 0 && !st.paksa ? 'Masih ada pelanggaran yang belum diputuskan.' : '';

  let hasil = '';
  if (st.hasil) {
    const h = st.hasil;
    if (h.ok) {
      const kata = h.status === 'tanpaPerubahan' ? 'Isi sama dengan yang sudah ada di repo, jadi tidak ada commit baru.' : `Berkas terbit ${h.status === 'dibuat' ? 'dibuat' : 'diperbarui'} di repo.${h.urlCommit ? ` <a class="underline" target="_blank" rel="noopener" href="${esc(h.urlCommit)}">Lihat commit</a>.` : ''} Situs memperbarui diri setelah proses deploy selesai (biasanya 1 sampai 2 menit); <a class="underline" target="_blank" rel="noopener" href="https://github.com/${esc(TARGET_BAWAAN.pemilik)}/${esc(TARGET_BAWAAN.repo)}/actions">pantau di GitHub Actions</a>.`;
      hasil = `<div class="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">${kata}</div>`;
    } else hasil = `<div class="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">${esc(h.galat)}</div>`;
  }

  const publik = st.publik === undefined ? 'memeriksa…' : st.publik ? `${waktuLokal(st.publik)} WIB` : 'belum ada atau tidak terbaca';
  return `<div class="mx-auto grid max-w-3xl gap-4">
    <div><h2 class="text-lg font-bold">Terapkan ke halaman publik</h2>
      <p class="mt-1 text-sm text-slate-600">Menyimpan versi terbit ke repo <b>${esc(TARGET_BAWAAN.pemilik)}/${esc(TARGET_BAWAAN.repo)}</b> (cabang ${esc(TARGET_BAWAAN.cabang)}, berkas <span class="font-mono text-xs">${esc(TARGET_BAWAAN.berkas)}</span>). Selama belum diterapkan, publik tetap melihat versi sebelumnya.</p></div>
    ${st.info ? `<div class="rounded-lg bg-emerald-50 p-2 text-sm text-emerald-800">${esc(st.info)}</div>` : ''}${st.galat ? `<div class="rounded-lg bg-red-50 p-2 text-sm text-red-800">${esc(st.galat)}</div>` : ''}
    <div class="${KOTAK}"><h3 class="mb-2 font-bold">1. Yang akan terbit</h3>
      ${terbit ? `<div class="text-sm">${esc(ringkasProyek)}.</div><div class="mt-1 text-xs text-slate-500">Tanpa NIP, tanggal lahir, aturan, catatan, dan data kerja admin (disaring dan diperiksa otomatis).</div>` : `<div class="rounded-lg bg-red-50 p-2 text-sm text-red-800">${esc(galatBangun)}</div>`}
      <div class="mt-2 text-sm text-slate-600">Versi yang sedang tayang: <b>${esc(publik)}</b></div></div>
    <div class="${KOTAK}"><h3 class="mb-2 font-bold">2. Pemeriksaan</h3>${kartuGerbang}
      <label class="mt-2 flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" id="tpSemua" ${st.semuaPekan ? 'checked' : ''}> Periksa juga pekan yang sudah lewat (bawaan: hanya pekan dari ${esc(tglPanjang(hariIni))} dan seterusnya; ${n} hari kerja per pekan)</label></div>
    <div><h3 class="mb-2 font-bold">3. Akses ke repo</h3>${kartuBrankas()}</div>
    <div class="${KOTAK}"><h3 class="mb-2 font-bold">4. Terapkan</h3>
      <label class="block text-sm">Catatan perubahan (opsional, masuk ke pesan commit)<input id="tpCatatan" class="isian mt-1 w-full" value="${esc(st.catatan)}" placeholder="mis. Pekan ASAS: revisi ruang Kamis"></label>
      ${gerbang.total > 0 ? `<label class="mt-2 flex items-start gap-2 text-sm text-red-800"><input type="checkbox" id="tpPaksa" class="mt-1" ${st.paksa ? 'checked' : ''}> Terapkan meskipun masih ada ${gerbang.total} pelanggaran yang belum diputuskan (keputusan saya)</label>` : ''}
      <div class="mt-3 flex flex-wrap items-center gap-3"><button class="tombol !bg-emerald-600 !text-white disabled:opacity-40" data-aksi="tpTerapkan" ${siap ? '' : 'disabled'}>${st.sibuk ? 'Menyimpan ke repo…' : 'Terapkan'}</button>${siap ? '' : `<span class="text-xs text-slate-500">${esc(alasanNonaktif)}</span>`}</div>
      ${hasil}</div></div>`;
}

export function ubahTerapkan(k: Konteks, el: HTMLInputElement): boolean {
  if (el.id === 'tpSemua') st.semuaPekan = el.checked;
  else if (el.id === 'tpPaksa') st.paksa = el.checked;
  else return false;
  k.gambar();
  return true;
}

/** Ketikan di kolom catatan disimpan tanpa menggambar ulang halaman. */
export function masukanTerapkan(el: HTMLInputElement): boolean {
  if (el.id !== 'tpCatatan') return false;
  st.catatan = el.value;
  return true;
}

const tokenSah = (t: string): boolean => t.trim().length >= 20 && !/\s/.test(t.trim());

export function klikTerapkan(k: Konteks, el: HTMLElement): boolean {
  const a = el.dataset.aksi ?? '';
  if (!a.startsWith('tp')) return false;
  const lakukan = (f: () => Promise<void>) => {
    st.galat = '';
    st.info = '';
    void f().catch((e) => {
      st.galat = e instanceof Error ? e.message : String(e);
      k.gambar();
    });
  };
  switch (a) {
    case 'tpBuat':
      lakukan(async () => {
        const pin = nilai('tpPin');
        const token = nilai('tpToken').trim();
        if (pin.length < PIN_MINIMAL) throw new Error(`PIN minimal ${PIN_MINIMAL} karakter.`);
        if (pin !== nilai('tpPin2')) throw new Error('Kedua PIN tidak sama.');
        if (!tokenSah(token)) throw new Error('Token GitHub terlihat tidak sah (terlalu pendek atau memuat spasi).');
        await buatBrankas(pin, { token });
        st.info = 'Brankas dibuat. Token tersimpan terenkripsi di peramban ini.';
        k.gambar();
      });
      return true;
    case 'tpBuka':
      lakukan(async () => {
        await bukaDenganPin(nilai('tpPin'));
        k.gambar();
      });
      return true;
    case 'tpSimpanToken':
      lakukan(async () => {
        const token = nilai('tpToken').trim();
        if (!tokenSah(token)) throw new Error('Token GitHub terlihat tidak sah (terlalu pendek atau memuat spasi).');
        vs.token = token;
        await simpanBrankas();
        st.info = 'Token tersimpan di brankas.';
        k.gambar();
      });
      return true;
    case 'tpGantiToken':
    case 'tpHapusToken':
      lakukan(async () => {
        vs.token = '';
        await simpanBrankas();
        st.info = a === 'tpHapusToken' ? 'Token dihapus dari brankas.' : '';
        k.gambar();
      });
      return true;
    case 'tpKunci':
      kunciSesi();
      st.info = 'Brankas dikunci.';
      k.gambar();
      return true;
    case 'tpTerapkan':
      lakukan(async () => {
        if (st.sibuk || !vs.token) return;
        const t = bangunTerbit(k.p, new Date());
        const isi = serialTerbit(t);
        const baru = isiTanpaWaktu(isi);
        const catatan = st.catatan.trim();
        const pesan = `Terapkan jadwal (${waktuLokal(t.diterapkan)} WIB)${catatan ? `\n\n${catatan}` : ''}`;
        st.sibuk = true;
        st.hasil = null;
        k.gambar();
        st.hasil = await terapkanKeRepo({ token: vs.token, isi, pesan, samaDengan: (lama) => isiTanpaWaktu(lama) === baru });
        st.sibuk = false;
        if (st.hasil.ok && st.hasil.status !== 'tanpaPerubahan') {
          st.publik = undefined;
          st.memuatPublik = false;
          k.lapor('Jadwal diterapkan ke repo.');
        }
        // token ditolak: jangan biarkan token yang salah terus dipakai
        if (!st.hasil.ok && st.hasil.kode === 'token') st.galat = '';
        k.gambar();
      });
      return true;
  }
  return false;
}
