import { bacaSinkron, tulisSinkron, type KeadaanDraf } from '../io/simpan';
import { ambilTinjauan, dariRemoteUntukLokal, kirimKeGitHub, penandaDariRemote, type PenandaDasar, type Tinjauan } from '../sinkron/alur';
import { bandingkan, belumDipilih, gabung, pilihanAwal, ringkas, URUT_BAGIAN, type Bagian, type Perbedaan, type Pilihan } from '../sinkron/banding';
import { TARGET_ADMIN } from '../terbit/github';
import { brankasSesi, bukaDenganPin, muatBrankas } from './brankasSesi';
import type { Konteks } from './konteks';
import type { Proyek } from '../model/tipe';
import { esc } from './util';

/**
 * Sinkron data admin dengan GitHub: tombol "Sinkron" membuka modal yang membandingkan draf di peramban ini dengan berkas
 * data/admin/proyek.json di repo, per bagian, lalu admin memilih arah: ambil semua dari GitHub, kirim semua dari sini,
 * gabung otomatis (yang hanya berubah di satu sisi diambil), atau pilih per bagian/per butir. Tidak ada yang tertimpa diam-diam.
 */

type Tahap = 'memuat' | 'tinjau' | 'selesai' | 'galat';

interface Status {
  terbuka: boolean;
  tahap: Tahap;
  tinj: Tinjauan | null;
  pilih: Map<string, Pilihan>;
  rinci: Set<Bagian>;
  sibuk: boolean;
  galat: string;
  info: string;
  /** penanda sinkron terakhir di peramban ini (dibaca saat modal dibuka) */
  penanda: PenandaDasar | undefined;
  /** spanduk di atas halaman bila draf lokal kosong/rusak */
  spanduk: 'kosong' | 'rusak' | null;
  galatDrafRusak: string;
  /** sha berkas GitHub yang tidak terbaca, bila admin memilih menimpanya */
  shaRusak: string;
}

const st: Status = { terbuka: false, tahap: 'memuat', tinj: null, pilih: new Map(), rinci: new Set(), sibuk: false, galat: '', info: '', penanda: undefined, spanduk: null, galatDrafRusak: '', shaRusak: '' };
const vs = brankasSesi;
const BATAS_RINCI = 300;
const waktuLokal = (iso: string): string => (iso ? `${new Date(iso).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' })} WIB` : '-');

/** Dipanggil saat aplikasi mulai: menandai spanduk bila draf lokal kosong atau rusak. */
export function aturKeadaanDraf(d: KeadaanDraf): void {
  st.spanduk = d.status === 'ok' ? null : d.status;
  st.galatDrafRusak = d.status === 'rusak' ? d.galat.slice(0, 3).join(' | ') : '';
}

export function spandukSinkron(): string {
  if (!st.spanduk) return '';
  const teks = st.spanduk === 'kosong'
    ? 'Belum ada draf di peramban ini, jadi yang tampil adalah data bawaan aplikasi. Bila data admin Anda sudah disinkron ke GitHub, muat dari sana supaya tidak memulai dari bawaan.'
    : `Draf yang tersimpan di peramban ini tidak lolos pemeriksaan (${esc(st.galatDrafRusak)}). Salinannya diamankan dan yang tampil adalah data bawaan. Muat dari GitHub bila sudah pernah disinkron.`;
  return `<div class="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><span class="min-w-0 flex-1">${teks}</span>
    <button class="tombol !bg-[#2347b8] !text-white" data-aksi="snBuka">Muat dari GitHub</button><button class="tombol" data-aksi="snSpandukTutup">Pakai data bawaan</button></div>`;
}

async function muatTinjauan(k: Konteks): Promise<void> {
  st.tahap = 'memuat';
  st.galat = '';
  st.tinj = null;
  st.shaRusak = '';
  st.pilih = new Map();
  k.gambar();
  st.penanda = await bacaSinkron().catch(() => undefined);
  const h = await ambilTinjauan({ lokal: k.p, ...(vs.terbuka && vs.token ? { token: vs.token } : {}), ...(st.penanda ? { penanda: st.penanda } : {}) });
  if (!h.ok) {
    st.tahap = 'galat';
    st.galat = h.galat;
    st.shaRusak = h.shaRemote ?? '';
  } else {
    st.tinj = h.tinjauan;
    st.pilih = pilihanAwal(h.tinjauan.beda);
    st.tahap = 'tinjau';
  }
  k.gambar();
}

const lencana = (teks: string, warna: string): string => `<span class="lencana ${warna}">${esc(teks)}</span>`;

function kartuAkses(): string {
  if (vs.terbuka && vs.token) return '';
  if (vs.dimuat && vs.brankas && !vs.terbuka) {
    return `<div class="mt-3 rounded-lg bg-slate-50 p-3 text-sm">Mengirim ke GitHub memerlukan token. Buka brankas dengan PIN:
      <div class="mt-2 flex gap-2"><input id="snPin" type="password" class="isian w-full max-w-xs" autocomplete="current-password"><button class="tombol !bg-[#2347b8] !text-white" data-aksi="snBukaBrankas">Buka</button></div></div>`;
  }
  return `<div class="mt-3 rounded-lg bg-slate-50 p-3 text-sm">Mengirim ke GitHub memerlukan token. Siapkan token di tab Terapkan (bagian Akses ke repo), lalu kembali ke sini. <button class="underline" data-aksi="snKeTerapkan">Buka tab Terapkan</button></div>`;
}

const adaToken = (): boolean => vs.terbuka && !!vs.token;

const NAMA_STATUS: Record<Perbedaan['status'], string> = { lokal: 'hanya diubah di sini', remote: 'hanya diubah di GitHub', bentrok: 'diubah di kedua tempat', beda: 'berbeda' };
const WARNA_STATUS: Record<Perbedaan['status'], string> = { lokal: 'bg-sky-100 text-sky-800', remote: 'bg-violet-100 text-violet-800', bentrok: 'bg-red-100 text-red-800', beda: 'bg-amber-100 text-amber-800' };

function barisRinci(b: Perbedaan): string {
  const dipilih = st.pilih.get(b.kunci);
  const kata = !b.ada.remote ? ' (tidak ada di GitHub)' : !b.ada.lokal ? ' (tidak ada di sini)' : '';
  const nama = `snp-${esc(b.kunci)}`;
  const radio = (sisi: Pilihan, teks: string) => `<label class="flex items-center gap-1"><input type="radio" name="${nama}" data-aksi="snPilihItem" data-kunci="${esc(b.kunci)}" value="${sisi}" ${dipilih === sisi ? 'checked' : ''}> ${teks}</label>`;
  return `<li class="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-100 py-1.5 text-xs"><span class="min-w-0 flex-1 break-words">${esc(b.label)}${esc(kata)}</span>${lencana(NAMA_STATUS[b.status], WARNA_STATUS[b.status])}
    <span class="flex gap-3">${radio('lokal', 'di sini')}${radio('remote', 'GitHub')}</span></li>`;
}

function tabelBagian(t: Tinjauan): string {
  const baris = ringkas(t.beda).map((r) => {
    const sisa = r.bentrok + r.beda;
    const terbuka = st.rinci.has(r.bagian);
    const butir = t.beda.filter((b) => b.bagian === r.bagian);
    const daftar = terbuka
      ? `<tr><td colspan="5" class="bg-slate-50 px-3 pb-2"><ul>${butir.slice(0, BATAS_RINCI).map(barisRinci).join('')}</ul>${butir.length > BATAS_RINCI ? `<div class="py-1 text-xs text-slate-500">${butir.length - BATAS_RINCI} butir lain tidak ditampilkan; ikut pilihan bagian (tombol di kanan).</div>` : ''}</td></tr>`
      : '';
    return `<tr class="border-t border-slate-100"><td class="px-3 py-2 font-medium">${esc(r.bagian)}</td><td class="px-2 text-center">${r.lokal || ''}</td><td class="px-2 text-center">${r.remote || ''}</td><td class="px-2 text-center ${sisa ? 'font-semibold text-red-700' : ''}">${sisa || ''}</td>
      <td class="px-2 py-1 text-right whitespace-nowrap"><button class="tombol !px-2 !py-0.5 !text-xs" data-aksi="snBagian" data-bagian="${esc(r.bagian)}" data-sisi="remote">Pakai GitHub</button> <button class="tombol !px-2 !py-0.5 !text-xs" data-aksi="snBagian" data-bagian="${esc(r.bagian)}" data-sisi="lokal">Pakai di sini</button> <button class="tombol !px-2 !py-0.5 !text-xs" data-aksi="snRinci" data-bagian="${esc(r.bagian)}">${terbuka ? 'Tutup' : 'Rincian'}</button></td></tr>${daftar}`;
  });
  return `<div class="overflow-x-auto rounded-lg border border-slate-200"><table class="w-full text-sm"><thead class="bg-slate-50 text-xs text-slate-600"><tr><th class="px-3 py-2 text-left">Bagian</th><th class="px-2">Hanya di sini</th><th class="px-2">Hanya di GitHub</th><th class="px-2">Bentrok / berbeda</th><th></th></tr></thead><tbody>${baris.join('')}</tbody></table></div>`;
}

function isiModal(k: Konteks): string {
  if (st.tahap === 'memuat') return '<div class="py-8 text-center text-sm text-slate-500">Membaca data dari GitHub…</div>';
  if (st.tahap === 'galat') {
    return `<div class="rounded-lg bg-red-50 p-3 text-sm text-red-800">${esc(st.galat)}</div><div class="mt-3 flex gap-2"><button class="tombol" data-aksi="snMuatUlang">Coba lagi</button>${st.shaRusak ? `<button class="tombol !text-red-700" data-aksi="snKirimSemua">Timpa berkas GitHub dengan data di sini</button>` : ''}</div>${kartuAkses()}`;
  }
  if (st.tahap === 'selesai') return `<div class="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">${esc(st.info)}</div><div class="mt-3"><button class="tombol" data-aksi="snTutup">Tutup</button></div>`;
  const t = st.tinj as Tinjauan;
  const info = `<div class="text-xs text-slate-600">Sinkron terakhir di peramban ini: <b>${esc(waktuLokal(st.penanda?.waktu ?? ''))}</b>${t.remote ? ` · Data di GitHub disimpan: <b>${esc(waktuLokal(t.waktuRemote))}</b>` : ''}${st.penanda ? '' : ' · belum pernah sinkron (tanpa acuan, semua perbedaan harus dipilih)'}</div>`;
  if (!t.remote) {
    return `${info}<div class="mt-3 rounded-lg bg-slate-50 p-3 text-sm">Belum ada data admin di GitHub (<span class="font-mono text-xs">${esc(TARGET_ADMIN.berkas)}</span>). Kirim data di peramban ini sebagai yang pertama.</div>
      <div class="mt-3"><button class="tombol !bg-emerald-600 !text-white disabled:opacity-40" data-aksi="snKirimSemua" ${adaToken() && !st.sibuk ? '' : 'disabled'}>${st.sibuk ? 'Mengirim…' : 'Kirim ke GitHub'}</button></div>${kartuAkses()}`;
  }
  if (t.beda.length === 0) {
    return `${info}<div class="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">Data di peramban ini sudah sama dengan yang di GitHub.</div><div class="mt-3"><button class="tombol" data-aksi="snCatatSama">Catat sebagai sudah sinkron</button></div>`;
  }
  const sisa = belumDipilih(t.beda, st.pilih).length;
  const adaKirim = [...st.pilih.values()].includes('lokal') || t.beda.some((b) => !st.pilih.has(b.kunci));
  return `${info}<div class="mt-3">${tabelBagian(t)}</div>
    <div class="mt-3 grid gap-2 sm:grid-cols-3">
      <button class="tombol !justify-start !text-left" data-aksi="snAmbilSemua" ${st.sibuk ? 'disabled' : ''}><b>Ambil semua dari GitHub</b><br><span class="text-xs font-normal text-slate-600">Data di sini diganti sama persis dengan GitHub.</span></button>
      <button class="tombol !justify-start !text-left disabled:opacity-40" data-aksi="snKirimSemua" ${adaToken() && !st.sibuk ? '' : 'disabled'}><b>Kirim semua dari sini</b><br><span class="text-xs font-normal text-slate-600">Data di GitHub diganti sama persis dengan yang di sini.</span></button>
      <button class="tombol !justify-start !text-left" data-aksi="snGabung" ${st.sibuk || !st.penanda ? 'disabled' : ''}><b>Gabung otomatis</b><br><span class="text-xs font-normal text-slate-600">${st.penanda ? 'Yang hanya berubah di satu sisi diambil; bentrok dipilih satu per satu.' : 'Perlu acuan sinkron; belum ada. Pilih per bagian di tabel.'}</span></button></div>
    <div class="mt-3 flex flex-wrap items-center gap-3 rounded-lg bg-slate-50 p-3 text-sm"><span>${sisa === 0 ? 'Semua perbedaan sudah dipilih.' : `<b>${sisa}</b> perbedaan belum dipilih (di bagian bertanda merah atau lewat tombol di tabel).`}</span>
      <button class="tombol !bg-emerald-600 !text-white disabled:opacity-40" data-aksi="snTerapkanPilihan" ${sisa === 0 && !st.sibuk && (!adaKirim || adaToken() || !perluKirimKe(k)) ? '' : 'disabled'}>${st.sibuk ? 'Memproses…' : 'Terapkan pilihan'}</button></div>${kartuAkses()}`;
}

/** Apakah hasil pilihan perlu dikirim ke GitHub (hasil gabungan berbeda dengan isi GitHub). */
function perluKirimKe(k: Konteks): boolean {
  const t = st.tinj;
  if (!t?.remote) return true;
  return bandingkan(gabung(k.p, t.remote, st.pilih), t.remote).length > 0;
}

export function renderSinkron(k: Konteks): string {
  if (!st.terbuka) return '';
  return `<div class="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4" data-aksi="snTutupLatar">
    <div id="snIsi" class="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl" data-aksi="snDiam">
      <div class="mb-1 flex items-center gap-2"><h2 class="text-lg font-bold">Sinkron dengan GitHub</h2><button class="tombol ml-auto !px-2" data-aksi="snTutup" aria-label="Tutup">✕</button></div>
      <p class="mb-3 text-xs text-slate-500">Berkas <span class="font-mono">${esc(TARGET_ADMIN.berkas)}</span> di repo ${esc(TARGET_ADMIN.pemilik)}/${esc(TARGET_ADMIN.repo)}. Berisi data kerja admin (tanpa token dan kunci AI), terpisah dari berkas terbit yang dilihat publik.</p>
      ${st.galat && st.tahap !== 'galat' ? `<div class="mb-3 rounded-lg bg-red-50 p-2 text-sm text-red-800">${esc(st.galat)}</div>` : ''}${isiModal(k)}</div></div>`;
}

const bagianDari = (s: string | undefined): Bagian | undefined => URUT_BAGIAN.find((b) => b === s);

async function simpanPenanda(m: PenandaDasar): Promise<void> {
  st.penanda = m;
  st.spanduk = null;
  await tulisSinkron(m).catch(() => undefined);
}

/** Menerapkan hasil: bila perlu mengganti draf di sini dan/atau mengirim ke GitHub, lalu mencatat penanda sinkron. */
async function selesaikan(k: Konteks, hasil: Proyek, ringkasan: string): Promise<void> {
  const t = st.tinj as Tinjauan;
  const perluKirim = !t.remote || bandingkan(hasil, t.remote).length > 0;
  if (perluKirim && !adaToken()) throw new Error('Mengirim ke GitHub memerlukan token. Buka brankas atau siapkan token di tab Terapkan.');
  const berubahDiSini = bandingkan(k.p, hasil).length > 0;
  if (perluKirim) {
    const h = await kirimKeGitHub({ token: vs.token, proyek: hasil, shaDiharapkan: t.shaRemote, pesan: `Sinkron data admin (${waktuLokal(new Date().toISOString())})` });
    if (!h.ok) {
      if (h.kode === 'bentrok') {
        st.galat = 'Data di GitHub berubah sejak dibandingkan (mungkin disimpan admin lain). Perbandingan dimuat ulang; tidak ada yang ditimpa.';
        await muatTinjauan(k);
        return;
      }
      throw new Error(h.galat);
    }
    await simpanPenanda(h.penanda);
  } else await simpanPenanda(penandaDariRemote(t));
  if (berubahDiSini) k.ganti(hasil, ringkasan);
  st.tahap = 'selesai';
  st.info = `${ringkasan}${perluKirim ? ' Data di GitHub ikut diperbarui.' : ''}`;
}

export function klikSinkron(k: Konteks, el: HTMLElement): boolean {
  const a = el.dataset.aksi ?? '';
  if (!a.startsWith('sn')) return false;
  const jalan = (f: () => Promise<void>) => {
    st.sibuk = true;
    st.galat = '';
    k.gambar();
    void f()
      .catch((e) => {
        st.galat = e instanceof Error ? e.message : String(e);
      })
      .finally(() => {
        st.sibuk = false;
        k.gambar();
      });
  };
  switch (a) {
    case 'snBuka':
      st.terbuka = true;
      st.info = '';
      st.rinci = new Set();
      void muatBrankas().then(() => muatTinjauan(k));
      return true;
    case 'snTutup':
    case 'snTutupLatar':
      st.terbuka = false;
      k.gambar();
      return true;
    case 'snDiam':
      return true;
    case 'snSpandukTutup':
      st.spanduk = null;
      k.gambar();
      return true;
    case 'snMuatUlang':
      void muatTinjauan(k);
      return true;
    case 'snKeTerapkan':
      st.terbuka = false;
      k.ke('terapkan');
      return true;
    case 'snBukaBrankas':
      jalan(async () => {
        await bukaDenganPin((document.getElementById('snPin') as HTMLInputElement | null)?.value ?? '');
      });
      return true;
    case 'snRinci': {
      const b = bagianDari(el.dataset.bagian);
      if (b) {
        if (st.rinci.has(b)) st.rinci.delete(b);
        else st.rinci.add(b);
        k.gambar();
      }
      return true;
    }
    case 'snBagian': {
      const b = bagianDari(el.dataset.bagian);
      const sisi = el.dataset.sisi === 'lokal' ? 'lokal' : 'remote';
      if (b && st.tinj) {
        for (const x of st.tinj.beda) if (x.bagian === b) st.pilih.set(x.kunci, sisi);
        k.gambar();
      }
      return true;
    }
    case 'snPilihItem':
      return true;
    case 'snCatatSama':
      jalan(async () => {
        if (!st.tinj?.remote) return;
        await simpanPenanda(penandaDariRemote(st.tinj));
        st.tahap = 'selesai';
        st.info = 'Dicatat: data di sini sama dengan GitHub.';
      });
      return true;
    case 'snGabung':
      if (!st.tinj) return true;
      st.pilih = pilihanAwal(st.tinj.beda);
      for (const b of new Set(st.tinj.beda.filter((x) => !st.pilih.has(x.kunci)).map((x) => x.bagian))) st.rinci.add(b);
      k.gambar();
      return true;
    case 'snAmbilSemua':
      if (!st.tinj?.remote) return true;
      if (!confirm('Data di peramban ini akan diganti sama persis dengan yang di GitHub. Perubahan di sini yang belum dikirim hilang (masih bisa diurungkan dengan Ctrl+Z). Lanjutkan?')) return true;
      jalan(async () => {
        const t = st.tinj as Tinjauan;
        const baru = dariRemoteUntukLokal(k.p, t.remote as Proyek);
        await simpanPenanda(penandaDariRemote(t));
        k.ganti(baru, 'Data diganti dengan yang di GitHub.');
        st.tahap = 'selesai';
        st.info = 'Data di peramban ini sekarang sama dengan GitHub.';
        st.spanduk = null;
      });
      return true;
    case 'snKirimSemua':
      if (!confirm('Data di GitHub akan diganti sama persis dengan yang di peramban ini. Perubahan orang lain di GitHub yang belum Anda ambil hilang dari berkas (riwayat commit tetap menyimpannya). Lanjutkan?')) return true;
      jalan(async () => {
        const t = st.tinj;
        if (!adaToken()) throw new Error('Mengirim ke GitHub memerlukan token.');
        const h = await kirimKeGitHub({ token: vs.token, proyek: k.p, shaDiharapkan: t?.shaRemote ?? st.shaRusak, pesan: `Sinkron data admin: kirim dari peramban (${waktuLokal(new Date().toISOString())})` });
        if (!h.ok) {
          if (h.kode === 'bentrok') {
            st.galat = 'Data di GitHub berubah sejak dibandingkan. Perbandingan dimuat ulang; tidak ada yang ditimpa.';
            await muatTinjauan(k);
            return;
          }
          throw new Error(h.galat);
        }
        await simpanPenanda(h.penanda);
        st.tahap = 'selesai';
        st.info = 'Data di GitHub sekarang sama dengan yang di peramban ini.';
      });
      return true;
    case 'snTerapkanPilihan':
      if (!st.tinj?.remote) return true;
      jalan(async () => {
        const t = st.tinj as Tinjauan;
        const hasil = gabung(k.p, t.remote as Proyek, st.pilih);
        await selesaikan(k, hasil, 'Pilihan diterapkan.');
      });
      return true;
  }
  return false;
}

export function ubahSinkron(k: Konteks, el: HTMLInputElement): boolean {
  if (el.dataset.aksi !== 'snPilihItem') return false;
  const kunci = el.dataset.kunci;
  if (kunci && el.checked) st.pilih.set(kunci, el.value === 'lokal' ? 'lokal' : 'remote');
  k.gambar();
  return true;
}

/** Menutup modal (tombol Esc). Mengembalikan true bila modal memang terbuka. */
export function tutupSinkron(): boolean {
  if (!st.terbuka) return false;
  st.terbuka = false;
  return true;
}
