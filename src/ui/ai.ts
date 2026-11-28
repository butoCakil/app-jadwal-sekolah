import type { HasilSusun } from '../mesin/solver';
import { bacaAi, tulisAi } from '../io/simpan';
import { PIN_MINIMAL, samarkan } from '../ai/brankas';
import { brankasSesi, bukaDenganPin, buatBrankas, hapusBrankasSesi, kunciSesi, muatBrankas, simpanBrankas } from './brankasSesi';
import { klienGemini } from '../ai/klien';
import { MODEL_REKOMENDASI, PENGATURAN_BAWAAN, PengaturRotasi, statusKosong, type PengaturanAi, type StatusRotasi } from '../ai/rotasi';
import { SesiAi, type Giliran } from '../ai/sesi';
import { rencanakan, terapkanInstruksi, type KonteksInstruksi } from '../ai/instruksi';
import { fokusInduk, modelWarisan } from '../model/simpul';
import { aturSusun, mulaiSusun, pasangPengamatSusun } from './susun';
import { esc } from './util';
import type { Konteks } from './konteks';

/**
 * Tab Asisten AI: ruang chat dengan memori sesi. AI hanya mengusulkan instruksi terstruktur; usulan diperiksa validator, lalu
 * admin melihat daftar perubahan dan memutuskan Terapkan atau Tolak. Kunci API tersimpan terenkripsi PIN di peramban ini.
 */

interface StatusAi {
  dimuat: boolean;
  memuat: boolean;
  sub: 'chat' | 'pengaturan';
  pengaturan: PengaturanAi;
  rotasi: PengaturRotasi | null;
  sesi: SesiAi;
  teks: string;
  kirim: boolean;
  galat: string;
  info: string;
  uji: Record<string, string>;
}

const vs = brankasSesi;
const st: StatusAi = {
  dimuat: false,
  memuat: false,
  sub: 'chat',
  pengaturan: { ...PENGATURAN_BAWAAN, cadangan: [...PENGATURAN_BAWAAN.cadangan] },
  rotasi: null,
  sesi: new SesiAi({ panggil: (req) => (st.rotasi ? st.rotasi.panggil(req) : Promise.resolve({ ok: false as const, alasan: 'tanpa_kunci' as const, pesan: 'Brankas kunci belum dibuka.' })) }),
  teks: '',
  kirim: false,
  galat: '',
  info: '',
  uji: {},
};

const nilai = (id: string) => (document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | null)?.value ?? '';

/** Kegiatan atau semester tempat instruksi diterapkan: sasaran yang sedang dipilih di Periode & Jadwal. */
export function konteksInstruksi(k: Konteks): KonteksInstruksi {
  const g = fokusInduk(k.ui.fokus) ? undefined : k.turunan.periode;
  return g ? { kegiatanId: g.id } : { ...(k.turunan.semester ? { semesterId: k.turunan.semester.id } : {}) };
}

async function muat(k: Konteks): Promise<void> {
  if (st.memuat) return;
  st.memuat = true;
  try {
    await muatBrankas();
    const png = await bacaAi<PengaturanAi>('pengaturan');
    if (png) st.pengaturan = { ...PENGATURAN_BAWAAN, ...png };
  } catch (e) {
    st.galat = `Tidak bisa membaca pengaturan AI: ${e instanceof Error ? e.message : String(e)}`;
  }
  st.dimuat = true;
  k.gambar();
}

function buatRotasi(): void {
  st.rotasi = new PengaturRotasi({
    pengaturan: () => st.pengaturan,
    kunci: () => vs.kunci,
    klien: klienGemini(),
    penyimpan: { baca: async () => (await bacaAi<StatusRotasi>('status')) ?? null, tulis: (s) => tulisAi('status', s) },
  });
}

const ringkasHasil = (h: HasilSusun) => `${h.terjadwal} dari ${h.total} JP tertempatkan, ${h.sisa.length} beban belum penuh${h.sisa.length ? ` (${h.sisa.slice(0, 5).map((s) => `${s.jpSisa} JP: ${s.alasan.slice(0, 80)}`).join(' | ')})` : ''}. Hasil belum diterapkan ke jadwal; admin memutuskan.`;

const simpanPengaturan = () => tulisAi('pengaturan', st.pengaturan);

// ------------------------------------------------------------------------------------------------------ tampilan

const nl = (s: string) => esc(s).replace(/\n/g, '<br>');
const KELAS_KOTAK = 'kartu mx-auto max-w-md p-5';

function formBuat(): string {
  return `<div class="${KELAS_KOTAK}"><h2 class="mb-1 text-lg font-bold">Siapkan Asisten AI</h2>
    <p class="text-sm text-slate-600">Asisten memakai Gemini dari akun Google Anda sendiri. Kunci API disimpan <b>terenkripsi dengan PIN di peramban ini</b>; tidak pernah dikirim ke repo atau ke orang lain. Kunci gratis dibuat di <b>aistudio.google.com/apikey</b> (akun Gmail pribadi; akun Google Workspace sekolah sering tidak mendapat tingkat gratis).</p>
    <div class="mt-3 grid gap-2">
      <label class="text-sm">PIN (minimal ${PIN_MINIMAL} karakter)<input id="aiPin" type="password" class="isian mt-1 w-full" autocomplete="new-password"></label>
      <label class="text-sm">Ulangi PIN<input id="aiPin2" type="password" class="isian mt-1 w-full" autocomplete="new-password"></label>
      <label class="text-sm">Label kunci pertama<input id="aiLabel" class="isian mt-1 w-full" placeholder="mis. Akun Benny"></label>
      <label class="text-sm">Kunci API Gemini<input id="aiKunciBaru" type="password" class="isian mt-1 w-full" autocomplete="off"></label></div>
    <div class="mt-3"><button class="tombol !bg-[#2347b8] !text-white" data-aksi="aiBuat">Simpan dan buka</button></div>
    <p class="mt-2 text-xs text-slate-500">PIN tidak bisa dipulihkan. Bila lupa, brankas dihapus dan kunci dimasukkan lagi.</p></div>`;
}

function formBuka(): string {
  return `<div class="${KELAS_KOTAK}"><h2 class="mb-1 text-lg font-bold">Buka brankas kunci</h2>
    <p class="text-sm text-slate-600">Masukkan PIN untuk memakai Asisten AI pada sesi ini.</p>
    <div class="mt-3 flex gap-2"><input id="aiPin" type="password" class="isian w-full" autocomplete="current-password"><button class="tombol !bg-[#2347b8] !text-white" data-aksi="aiBuka">Buka</button></div>
    <div class="mt-3"><button class="text-xs text-red-700 underline" data-aksi="aiHapusBrankas">Lupa PIN: hapus brankas</button></div></div>`;
}

function kartuRencana(g: Giliran): string {
  const r = g.rencana;
  if (!r) return '';
  const h = r.hasil;
  const status = r.status === 'diterapkan' ? '<span class="lencana bg-emerald-100 text-emerald-800">Sudah diterapkan</span>' : r.status === 'ditolak' ? '<span class="lencana bg-slate-200 text-slate-700">Ditolak</span>' : '';
  const tombol = r.status === 'menunggu' ? `<div class="mt-2 flex gap-2"><button class="tombol !bg-emerald-600 !text-white" data-aksi="aiTerapkan" data-id="${g.id}">Terapkan${h.susun ? ' dan susun' : ''}</button><button class="tombol" data-aksi="aiTolak" data-id="${g.id}">Tolak</button></div>` : '';
  const susun = h.susun ? `<div class="mt-1 text-xs text-slate-700">Lalu menjalankan penyusunan otomatis${h.susun.cara ? ` (cara: ${esc(h.susun.cara)})` : ''}${h.susun.detik ? `, ${h.susun.detik} detik` : ''}. Hasilnya tetap harus Anda terapkan sendiri di tab Susun Otomatis.</div>` : '';
  return `<div class="mt-2 rounded-lg border border-sky-200 bg-sky-50 p-3"><div class="flex items-center gap-2 text-sm font-semibold text-sky-900">Usulan perubahan ${status}</div>
    ${h.perubahan.length ? `<ul class="mt-1 list-disc space-y-0.5 pl-5 text-sm">${h.perubahan.map((x) => `<li>${esc(x.teks)}</li>`).join('')}</ul>` : '<div class="mt-1 text-sm text-slate-600">Tidak ada perubahan data.</div>'}
    ${h.peringatan.length ? `<div class="mt-2 rounded bg-amber-50 p-2 text-xs text-amber-900">${h.peringatan.map((x) => `<div>${esc(x)}</div>`).join('')}</div>` : ''}
    ${susun}${tombol}</div>`;
}

function giliranHtml(g: Giliran): string {
  if (g.peran === 'admin') return `<div class="flex justify-end"><div class="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-[#2347b8] px-3 py-2 text-sm text-white">${esc(g.teks)}</div></div>`;
  if (g.peran === 'sistem') return `<div class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">${nl(g.teks)}</div>`;
  const galat = g.galat.length ? `<div class="mt-2 rounded bg-red-50 p-2 text-xs text-red-800">${g.galat.map((x) => `<div>${esc(x)}</div>`).join('')}</div>` : '';
  const tanya = g.pertanyaan ? `<div class="mt-2 rounded bg-amber-50 p-2 text-sm text-amber-900">Pertanyaan: ${esc(g.pertanyaan)}</div>` : '';
  const tb = g.tidakBisa?.length ? `<div class="mt-2 rounded bg-slate-100 p-2 text-xs text-slate-700"><div class="font-semibold">Belum didukung:</div>${g.tidakBisa.map((x) => `<div>• ${esc(x)}</div>`).join('')}</div>` : '';
  return `<div class="flex"><div class="max-w-[88%] rounded-2xl rounded-bl-sm border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm"><div>${nl(g.teks)}</div>${tanya}${tb}${kartuRencana(g)}${galat}${g.sumber ? `<div class="mt-1 text-[10px] text-slate-400">${esc(g.sumber)}</div>` : ''}</div></div>`;
}

function renderChat(k: Konteks): string {
  const ktx = konteksInstruksi(k);
  const g = ktx.kegiatanId ? k.p.kalender.find((x) => x.id === ktx.kegiatanId) : undefined;
  const sasaran = g ? `kegiatan ${g.nama}` : `jadwal induk ${k.turunan.semester?.nama ?? ''}`;
  const contoh = g
    ? ['Gandakan jam MTK, BI, dan ENG untuk kelas XII', 'Kurangi mapel kejuruan XII TE jadi 2 JP lalu susun dari jadwal induk', 'Kunci lab G1 dan G2 pada hari Senin jam 07:00 sampai 10:00']
    : ['Jadikan PRE kelas XII TE 1 enam JP', 'Guru BEN tidak tersedia Senin jam 1 dan 2', 'Kelas jurusan TE tidak boleh memakai ruang G3'];
  const contohKalender = ['Kapan ASAS dimulai dan kelas apa saja yang libur saat itu?', 'Tanggal 5 Desember ada rapat dinas', 'UKK diundur 1 minggu', 'Buat kegiatan ASTS dari 7 sampai 11 Desember, kelas XII tidak aktif'];
  const riwayat = st.sesi.tampil.length
    ? st.sesi.tampil.map(giliranHtml).join('')
    : `<div class="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">Tulis permintaan dalam bahasa sehari-hari. Asisten menjawab pertanyaan dari data yang tersimpan (jadwal, kalender, kegiatan), mengusulkan perubahan data (JP, ruang, aturan, kegiatan dan agenda kalender) dan, bila diminta, menjalankan penyusunan. <b>Tidak ada yang berubah sebelum Anda menekan Terapkan.</b>${[...contoh, ...contohKalender].map((c) => `<div class="mt-1"><button class="text-left text-[#2347b8] underline" data-aksi="aiContoh" data-teks="${esc(c)}">${esc(c)}</button></div>`).join('')}</div>`;
  return `<div class="kartu p-4">
    <div class="mb-2 flex flex-wrap items-center gap-2 text-sm"><span class="text-slate-600">Perubahan beban dan aturan diterapkan pada <b>${esc(sasaran)}</b>; perubahan kalender berlaku untuk seluruh tahun.</span><span class="ml-auto"></span>
      <button class="tombol !text-xs" data-aksi="aiBaru" ${st.sesi.tampil.length ? '' : 'disabled'}>Percakapan baru</button></div>
    <div id="aiRiwayat" class="max-h-[55vh] min-h-[160px] space-y-3 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3">${riwayat}${st.kirim ? '<div class="text-sm text-slate-500">Asisten sedang berpikir…</div>' : ''}</div>
    ${st.galat ? `<div class="mt-2 rounded-lg bg-red-50 p-2 text-sm text-red-800">${esc(st.galat)}</div>` : ''}
    <div class="mt-3 flex gap-2"><textarea id="aiTeks" rows="3" class="isian w-full" placeholder="Tulis permintaan… (Ctrl+Enter untuk kirim)" ${st.kirim ? 'disabled' : ''}>${esc(st.teks)}</textarea>
      <button class="tombol !bg-[#2347b8] !text-white self-end" data-aksi="aiKirim" ${st.kirim ? 'disabled' : ''}>Kirim</button></div>
    <div class="mt-2 text-xs text-slate-500">Yang dikirim ke Google hanya kode guru, mapel, kelas, dan ruang beserta beban dan aturan; nama lengkap, NIP, dan tanggal lahir tidak ikut.</div></div>`;
}

function renderPengaturan(): string {
  const ringkas = st.rotasi?.ringkas() ?? [];
  const tidakSah = st.rotasi?.status.tidakSah ?? {};
  const barisKunci = vs.kunci
    .map((x) => `<div class="border-t border-slate-100 py-2 text-sm">
      <div class="flex flex-wrap items-center gap-x-2 gap-y-1"><span class="min-w-0 max-w-full break-words font-semibold">${esc(x.label)}</span><span class="font-mono text-xs text-slate-500">${esc(samarkan(x.nilai))}</span>${tidakSah[x.id] ? `<span class="lencana bg-red-100 text-red-800" title="${esc(tidakSah[x.id] ?? '')}">ditolak Google</span>` : x.aktif ? '<span class="lencana bg-emerald-100 text-emerald-800">aktif</span>' : '<span class="lencana bg-slate-200 text-slate-700">nonaktif</span>'}</div>
      ${st.uji[x.id] ? `<div class="mt-0.5 break-words text-xs text-slate-600">${esc(st.uji[x.id] ?? '')}</div>` : ''}
      <div class="mt-1.5 flex flex-wrap gap-1.5"><button class="tombol !py-0.5 !text-xs" data-aksi="aiUji" data-id="${esc(x.id)}">Uji</button><button class="tombol !py-0.5 !text-xs" data-aksi="aiAktif" data-id="${esc(x.id)}">${x.aktif ? 'Nonaktifkan' : 'Aktifkan'}</button><button class="tombol !py-0.5 !text-xs" data-aksi="aiHapusKunci" data-id="${esc(x.id)}">Hapus</button></div></div>`)
    .join('');
  const pakai = ringkas
    .map((r) => `<tr class="border-t border-slate-100"><td class="py-0.5 pr-2">${esc(r.label)}</td><td class="pr-2 font-mono text-xs">${esc(r.model)}</td><td class="pr-2 text-right">${r.permintaanHariIni} / ${r.batasHarian}</td><td class="pr-2 text-right">${r.semenitTerakhir}</td><td class="text-xs">${[r.habis ? 'habis hari ini' : '', r.jeda ? 'jeda' : '', r.tidakTersedia ? 'model tidak tersedia' : ''].filter(Boolean).join(', ') || 'siap'}</td></tr>`)
    .join('');
  const galat = (st.rotasi?.status.galat ?? []).slice(0, 5).map((g) => `<div>${esc(new Date(g.t).toLocaleTimeString('id-ID'))} · ${esc(g.kunci)} · ${esc(g.model)} · ${g.status}: ${esc(g.pesan)}</div>`).join('');
  return `<div class="grid gap-4 lg:grid-cols-2">
    <div class="kartu min-w-0 p-4"><h3 class="mb-2 font-bold">Kunci API</h3>
      <div>${barisKunci || '<p class="text-sm text-slate-500">Belum ada kunci.</p>'}</div>
      <div class="mt-3 grid min-w-0 gap-2 border-t border-slate-100 pt-3 sm:grid-cols-[1fr_2fr_auto]"><input id="aiLabel" class="isian min-w-0" placeholder="Label"><input id="aiKunciBaru" type="password" class="isian min-w-0" placeholder="Kunci API Gemini" autocomplete="off"><button class="tombol" data-aksi="aiTambahKunci">Tambah</button></div>
      <p class="mt-1 text-xs text-slate-500">Banyak kunci dari akun berbeda memperbesar jatah gratis: model utama dicoba di semua kunci dulu sebelum turun ke model cadangan.</p></div>
    <div class="kartu p-4"><h3 class="mb-2 font-bold">Model dan batas</h3>
      <label class="text-sm">Model utama<input id="aiModel" list="aiDaftarModel" class="isian mt-1 w-full" value="${esc(st.pengaturan.model)}"></label>
      <datalist id="aiDaftarModel">${MODEL_REKOMENDASI.map((m) => `<option value="${esc(m.model)}">`).join('')}</datalist>
      <label class="mt-2 block text-sm">Model cadangan (satu per baris, berurutan)<textarea id="aiCadangan" rows="5" class="isian mt-1 w-full font-mono text-xs">${esc(st.pengaturan.cadangan.join('\n'))}</textarea></label>
      <div class="mt-2 grid grid-cols-2 gap-2"><label class="text-sm">Batas per menit<input id="aiRpm" type="number" min="1" class="isian mt-1 w-full" value="${st.pengaturan.rpm}"></label><label class="text-sm">Batas per hari<input id="aiRpd" type="number" min="1" class="isian mt-1 w-full" value="${st.pengaturan.rpd}"></label></div>
      <div class="mt-2 flex gap-2"><button class="tombol" data-aksi="aiSimpanModel">Simpan</button><button class="tombol" data-aksi="aiBawaan">Kembalikan bawaan</button></div>
      <p class="mt-1 text-xs text-slate-500">Batas per menit dan per hari per kunci per model. Bila Google melaporkan batas yang lebih kecil, batas itu yang dipakai.</p></div>
    <div class="kartu p-4 lg:col-span-2"><h3 class="mb-2 font-bold">Pemakaian hari ini</h3>
      <table class="w-full text-sm"><thead class="text-left text-xs text-slate-500"><tr><th>Kunci</th><th>Model</th><th class="text-right">Permintaan / batas</th><th class="text-right">Semenit terakhir</th><th>Keadaan</th></tr></thead><tbody>${pakai || '<tr><td colspan="5" class="py-1 text-slate-500">Belum ada.</td></tr>'}</tbody></table>
      ${galat ? `<div class="mt-2 rounded bg-slate-50 p-2 text-xs text-slate-600"><div class="font-semibold">Galat terakhir</div>${galat}</div>` : ''}
      <div class="mt-2"><button class="tombol !text-xs" data-aksi="aiResetStatus">Reset catatan batas</button></div></div>
    <div class="kartu p-4 lg:col-span-2"><h3 class="mb-2 font-bold">Brankas</h3>
      <div class="flex flex-wrap items-end gap-2"><label class="text-sm">PIN baru<input id="aiPinBaru" type="password" class="isian mt-1" autocomplete="new-password"></label><button class="tombol" data-aksi="aiGantiPin">Ganti PIN</button>
        <button class="tombol" data-aksi="aiKunci">Kunci brankas sekarang</button><button class="tombol !text-red-700" data-aksi="aiHapusBrankas">Hapus brankas</button></div></div></div>`;
}

export function renderAi(k: Konteks): string {
  if (!st.dimuat) {
    void muat(k);
    return '<div class="kartu p-4 text-sm text-slate-500">Memuat…</div>';
  }
  const banner = `${st.info ? `<div class="mb-3 rounded-lg bg-emerald-50 p-2 text-sm text-emerald-800">${esc(st.info)}</div>` : ''}${!vs.terbuka && st.galat ? `<div class="mb-3 rounded-lg bg-red-50 p-2 text-sm text-red-800">${esc(st.galat)}</div>` : ''}`;
  selaraskan();
  if (!vs.brankas) return `${banner}${formBuat()}`;
  if (!vs.terbuka) return `${banner}${formBuka()}`;
  const sub = (id: 'chat' | 'pengaturan', teks: string) => `<button class="tombol ${st.sub === id ? '!bg-[#2347b8] !text-white' : ''}" data-aksi="aiSub" data-sub="${id}">${teks}</button>`;
  return `<div class="mb-3 flex items-center gap-2"><h2 class="text-lg font-bold">Asisten AI</h2><span class="ml-auto"></span>${sub('chat', 'Percakapan')}${sub('pengaturan', 'Pengaturan')}</div>${banner}${st.sub === 'chat' ? renderChat(k) : renderPengaturan()}`;
}

const gulir = () => requestAnimationFrame(() => {
  const el = document.getElementById('aiRiwayat');
  if (el) el.scrollTop = el.scrollHeight;
});

// --------------------------------------------------------------------------------------------------- aksi

/** Brankas bisa dibuka dari tab Terapkan; sinkronkan rotasi dan pengamat bila perlu (dan buang bila sudah dikunci di sana). */
function selaraskan(): void {
  if (vs.terbuka && !st.rotasi) {
    buatRotasi();
    pasangPengamatSusun((h) => st.sesi.catatHasilSusun(ringkasHasil(h)));
  } else if (!vs.terbuka && st.rotasi) {
    st.rotasi = null;
    pasangPengamatSusun(null);
  }
}

async function bukaDengan(k: Konteks, pin: string): Promise<void> {
  await bukaDenganPin(pin);
  selaraskan();
  st.galat = '';
  k.gambar();
}

async function kirim(k: Konteks): Promise<void> {
  const teks = st.teks.trim();
  if (!teks || st.kirim) return;
  st.teks = '';
  st.kirim = true;
  st.galat = '';
  const janji = st.sesi.kirim(teks, k.p, konteksInstruksi(k));
  k.gambar();
  gulir();
  try {
    await janji;
  } catch (e) {
    st.galat = `Gagal: ${e instanceof Error ? e.message : String(e)}`;
  }
  st.kirim = false;
  k.gambar();
  gulir();
}

function terapkan(k: Konteks, g: Giliran): void {
  const r = g.rencana;
  if (!r || r.status !== 'menunggu') return;
  const ktx = konteksInstruksi(k);
  // data bisa berubah sejak usulan dibuat: periksa lagi pada keadaan sekarang
  const cek = rencanakan(k.p, ktx, r.balasan.instruksi);
  if (!cek.ok) {
    g.galat = [`Usulan tidak bisa diterapkan pada keadaan sekarang (data atau sasaran berubah sejak usulan dibuat): ${cek.galat.join(' | ')}`];
    k.gambar();
    return;
  }
  k.ubah((p) => void terapkanInstruksi(p, ktx, r.balasan.instruksi));
  st.sesi.catatDiterapkan(g, cek);
  st.sesi.segarkanPotret(k.p, ktx);
  k.lapor(cek.perubahan.length ? `Diterapkan: ${cek.perubahan.length} perubahan.` : 'Diterapkan.');
  if (cek.susun) {
    const kegiatanAktif = !!k.turunan.periode && modelWarisan(k.turunan.periode) && !fokusInduk(k.ui.fokus);
    aturSusun(cek.susun, kegiatanAktif);
    k.ke('susun');
    mulaiSusun(k);
  }
}

export function klikAi(k: Konteks, el: HTMLElement): boolean {
  const a = el.dataset.aksi ?? '';
  if (!a.startsWith('ai')) return false;
  const lakukan = (f: () => Promise<void>) => {
    void f().catch((e) => {
      st.galat = e instanceof Error ? e.message : String(e);
      k.gambar();
    });
  };
  switch (a) {
    case 'aiBuat':
      lakukan(async () => {
        const pin = nilai('aiPin');
        const kunci = nilai('aiKunciBaru').trim();
        if (pin.length < PIN_MINIMAL) throw new Error(`PIN minimal ${PIN_MINIMAL} karakter.`);
        if (pin !== nilai('aiPin2')) throw new Error('Kedua PIN tidak sama.');
        if (kunci.length < 20) throw new Error('Kunci API terlalu pendek.');
        await buatBrankas(pin, { kunci: [{ id: `k${Date.now().toString(36)}`, label: nilai('aiLabel').trim() || 'Kunci 1', nilai: kunci, aktif: true }] });
        await simpanPengaturan();
        selaraskan();
        st.info = 'Brankas dibuat. Kunci tersimpan terenkripsi di peramban ini.';
        k.gambar();
      });
      return true;
    case 'aiBuka':
      lakukan(async () => bukaDengan(k, nilai('aiPin')));
      return true;
    case 'aiKunci':
      kunciSesi();
      selaraskan();
      st.info = 'Brankas dikunci.';
      k.gambar();
      return true;
    case 'aiHapusBrankas':
      if (!confirm('Brankas, semua kunci API, dan token GitHub di peramban ini akan dihapus. Lanjutkan?')) return true;
      lakukan(async () => {
        await hapusBrankasSesi();
        selaraskan();
        st.info = 'Brankas dihapus.';
        k.gambar();
      });
      return true;
    case 'aiSub':
      st.sub = el.dataset.sub === 'pengaturan' ? 'pengaturan' : 'chat';
      st.info = '';
      k.gambar();
      if (st.sub === 'chat') gulir();
      return true;
    case 'aiContoh':
      st.teks = el.dataset.teks ?? '';
      k.gambar();
      document.getElementById('aiTeks')?.focus();
      return true;
    case 'aiBaru':
      st.sesi.reset();
      st.galat = '';
      k.gambar();
      return true;
    case 'aiKirim':
      st.teks = nilai('aiTeks') || st.teks;
      void kirim(k);
      return true;
    case 'aiTerapkan':
    case 'aiTolak': {
      const g = st.sesi.tampil.find((x) => x.id === Number(el.dataset.id));
      if (!g) return true;
      if (a === 'aiTerapkan') terapkan(k, g);
      else {
        st.sesi.catatDitolak(g);
        k.gambar();
      }
      return true;
    }
    case 'aiTambahKunci':
      lakukan(async () => {
        const kunci = nilai('aiKunciBaru').trim();
        if (kunci.length < 20) throw new Error('Kunci API terlalu pendek.');
        if (vs.kunci.some((x) => x.nilai === kunci)) throw new Error('Kunci itu sudah ada.');
        vs.kunci = [...vs.kunci, { id: `k${Date.now().toString(36)}`, label: nilai('aiLabel').trim() || `Kunci ${vs.kunci.length + 1}`, nilai: kunci, aktif: true }];
        await simpanBrankas();
        st.galat = '';
        k.gambar();
      });
      return true;
    case 'aiHapusKunci':
      if (!confirm('Hapus kunci ini dari brankas?')) return true;
      lakukan(async () => {
        vs.kunci = vs.kunci.filter((x) => x.id !== el.dataset.id);
        await simpanBrankas();
        k.gambar();
      });
      return true;
    case 'aiAktif':
      lakukan(async () => {
        const x = vs.kunci.find((y) => y.id === el.dataset.id);
        if (x) {
          x.aktif = !x.aktif;
          if (x.aktif && st.rotasi) delete st.rotasi.status.tidakSah[x.id];
        }
        await simpanBrankas();
        k.gambar();
      });
      return true;
    case 'aiUji':
      lakukan(async () => {
        const x = vs.kunci.find((y) => y.id === el.dataset.id);
        if (!x) return;
        st.uji[x.id] = 'menguji…';
        k.gambar();
        const h = await klienGemini().daftarModel(x.nilai);
        st.uji[x.id] = h.ok ? `sah (${h.model.length} model)` : `gagal: ${h.pesan.slice(0, 80)}`;
        if (h.ok && st.rotasi) delete st.rotasi.status.tidakSah[x.id];
        k.gambar();
      });
      return true;
    case 'aiSimpanModel':
      lakukan(async () => {
        const model = nilai('aiModel').trim();
        const cadangan = nilai('aiCadangan').split('\n').map((x) => x.trim()).filter(Boolean);
        const rpm = Number(nilai('aiRpm'));
        const rpd = Number(nilai('aiRpd'));
        if (!/^[A-Za-z0-9._-]{3,80}$/.test(model) || cadangan.some((x) => !/^[A-Za-z0-9._-]{3,80}$/.test(x))) throw new Error('Nama model hanya huruf, angka, titik, garis bawah, atau strip.');
        if (!Number.isInteger(rpm) || rpm < 1 || !Number.isInteger(rpd) || rpd < 1) throw new Error('Batas per menit dan per hari harus bilangan bulat positif.');
        st.pengaturan = { model, cadangan, rpm, rpd };
        await simpanPengaturan();
        st.info = 'Pengaturan disimpan.';
        st.galat = '';
        k.gambar();
      });
      return true;
    case 'aiBawaan':
      lakukan(async () => {
        st.pengaturan = { ...PENGATURAN_BAWAAN, cadangan: [...PENGATURAN_BAWAAN.cadangan] };
        await simpanPengaturan();
        k.gambar();
      });
      return true;
    case 'aiResetStatus':
      lakukan(async () => {
        if (st.rotasi) st.rotasi.status = statusKosong();
        await tulisAi('status', statusKosong());
        k.gambar();
      });
      return true;
    case 'aiGantiPin':
      lakukan(async () => {
        const baru = nilai('aiPinBaru');
        if (baru.length < PIN_MINIMAL) throw new Error(`PIN minimal ${PIN_MINIMAL} karakter.`);
        vs.pin = baru;
        await simpanBrankas();
        st.info = 'PIN diganti.';
        st.galat = '';
        k.gambar();
      });
      return true;
  }
  return false;
}

/** Ketikan di kolom pesan disimpan tanpa menggambar ulang halaman. */
export function masukanAi(el: HTMLInputElement): boolean {
  if (el.id !== 'aiTeks') return false;
  st.teks = el.value;
  return true;
}

/** Ctrl+Enter pada kolom pesan mengirim. */
export function tombolAi(k: Konteks, e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement;
  if (t.id === 'aiTeks' && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    st.teks = (t as HTMLTextAreaElement).value;
    void kirim(k);
    return true;
  }
  if (t.id === 'aiPin' && e.key === 'Enter' && vs.brankas && !vs.terbuka) {
    e.preventDefault();
    void bukaDengan(k, (t as HTMLInputElement).value).catch((err) => {
      st.galat = err instanceof Error ? err.message : String(err);
      k.gambar();
    });
    return true;
  }
  return false;
}
