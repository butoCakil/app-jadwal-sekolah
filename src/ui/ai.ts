import { bacaAi, tulisAi } from '../io/simpan';
import { PIN_MINIMAL, samarkan } from '../ai/brankas';
import { aturIngat, brankasSesi, bukaDenganPin, buatBrankas, gantiPin, hapusBrankasSesi, kunciSesi, muatBrankas, PILIHAN_INGAT_HARI, simpanBrankas } from './brankasSesi';
import { klienGemini } from '../ai/klien';
import { MODEL_REKOMENDASI, PENGATURAN_BAWAAN, PengaturRotasi, statusKosong, type PengaturanAi, type StatusRotasi } from '../ai/rotasi';
import { SesiAi, type Giliran } from '../ai/sesi';
import { rencanakan, terapkanInstruksi, type KonteksInstruksi } from '../ai/instruksi';
import { batuNisan, daftarAktif, gabungPercakapan, jumlahMenunggu, judulTampil, percakapanBaru, type Percakapan, type SasaranAi } from '../ai/percakapan';
import { sinkronkanAi } from '../ai/sinkronAi';
import { daftarSemester, fokusInduk, fokusSemester, semesterKegiatan } from '../model/simpul';
import { bukaSimpul, tanggalUntukFokus } from './hub';
import { ruangDiluarPrioritas } from '../mesin/solver';
import { jalankanPekerja, pasangPengamatSusun, siapkanSusun, type PekerjaSusun } from './susun';
import { hitungTurunan } from './turunan';
import type { Beban, Slot } from '../model/tipe';
import type { Fokus } from '../model/simpul';
import type { HasilSusun, Kemajuan } from '../mesin/solver';
import type { Instruksi } from '../ai/instruksi';
import { esc, isoLokal } from './util';
import { IKON, logoAi } from './aiLogo';
import { formatTeks, kartuUsulan } from './aiKartu';
import type { Konteks } from './konteks';

/**
 * Asisten Jadwal: balon mengambang di semua halaman admin yang membuka jendela percakapan. AI hanya mengusulkan instruksi
 * terstruktur; usulan diperiksa validator, lalu admin meninjau butir demi butir dan memutuskan Terapkan atau Tolak. Riwayat
 * percakapan tersimpan di peramban dan bisa disinkronkan ke GitHub; kunci API dan token tetap di brankas ber-PIN (perangkat
 * mengingatnya beberapa hari agar PIN tidak diminta berulang).
 */

type Layar = 'chat' | 'riwayat' | 'pengaturan';

interface StatusSinkron {
  fase: 'diam' | 'jalan' | 'ok' | 'galat';
  waktu?: number;
  pesan?: string;
  otomatis: boolean;
}

interface StatusAi {
  dimuat: boolean;
  memuat: boolean;
  buka: boolean;
  lebar: boolean;
  layar: Layar;
  pengaturan: PengaturanAi;
  pengaturanDiubah: number;
  rotasi: PengaturRotasi | null;
  sesi: SesiAi;
  daftar: Percakapan[];
  aktifId: string;
  teks: string;
  kirim: boolean;
  galat: string;
  info: string;
  uji: Record<string, string>;
  cari: string;
  /** butir usulan yang dicabut centangnya, per nomor giliran */
  dikecualikan: Map<number, Set<number>>;
  terakhir: { id: number; snap: string } | null;
  sinkron: StatusSinkron;
  gulirBawah: boolean;
}

const vs = brankasSesi;
const st: StatusAi = {
  dimuat: false,
  memuat: false,
  buka: false,
  lebar: false,
  layar: 'chat',
  pengaturan: { ...PENGATURAN_BAWAAN, cadangan: [...PENGATURAN_BAWAAN.cadangan] },
  pengaturanDiubah: 0,
  rotasi: null,
  sesi: new SesiAi({ panggil: (req) => (st.rotasi ? st.rotasi.panggil(req) : Promise.resolve({ ok: false as const, alasan: 'tanpa_kunci' as const, pesan: 'Brankas kunci belum dibuka.' })) }),
  daftar: [percakapanBaru()],
  aktifId: '',
  teks: '',
  kirim: false,
  galat: '',
  info: '',
  uji: {},
  cari: '',
  dikecualikan: new Map(),
  terakhir: null,
  sinkron: { fase: 'diam', otomatis: true },
  gulirBawah: true,
};
st.aktifId = st.daftar[0]?.id ?? '';

let kRef: Konteks | null = null;
let akar: HTMLElement | null = null;

const nilai = (id: string) => (document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | null)?.value ?? '';
const aktif = (): Percakapan => {
  let c = st.daftar.find((x) => x.id === st.aktifId && x.dihapus === undefined);
  if (!c) {
    c = st.daftar.find((x) => x.dihapus === undefined) ?? percakapanBaru();
    if (!st.daftar.includes(c)) st.daftar.unshift(c);
    st.aktifId = c.id;
  }
  return c;
};

const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const jam = (ms: number) => new Date(ms).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
const tanggalPendek = (ms: number) => {
  const d = new Date(ms);
  return `${d.getDate()} ${BULAN[d.getMonth()]} ${jam(ms)}`;
};
function rentang(mulai: string, selesai: string): string {
  const [, m1, d1] = mulai.split('-').map(Number) as [number, number, number];
  const [, m2, d2] = selesai.split('-').map(Number) as [number, number, number];
  if (mulai === selesai) return `${d1} ${BULAN[m1 - 1]}`;
  return m1 === m2 ? `${d1}–${d2} ${BULAN[m1 - 1]}` : `${d1} ${BULAN[m1 - 1]} – ${d2} ${BULAN[m2 - 1]}`;
}

// ------------------------------------------------------------------------------------------------- sasaran

/** Kegiatan atau semester tempat instruksi diterapkan menurut tampilan aplikasi (dipakai bila sasaran percakapan = ikuti tampilan). */
export function konteksInstruksi(k: Konteks): KonteksInstruksi {
  const g = fokusInduk(k.ui.fokus) ? undefined : k.turunan.periode;
  return g ? { kegiatanId: g.id } : { ...(k.turunan.semester ? { semesterId: k.turunan.semester.id } : {}) };
}

/** Sasaran percakapan aktif; sasaran tetap yang sudah tidak ada (kegiatan dihapus) kembali mengikuti tampilan. */
function ktxAktif(k: Konteks): KonteksInstruksi {
  const s = aktif().sasaran;
  if (s.mode === 'tetap') {
    if (s.kegiatanId && k.p.kalender.some((g) => g.id === s.kegiatanId && !g.agenda)) return { kegiatanId: s.kegiatanId };
    if (s.semesterId && daftarSemester(k.p).some((x) => x.id === s.semesterId)) return { semesterId: s.semesterId };
  }
  return konteksInstruksi(k);
}

function labelKtx(k: Konteks, ktx: KonteksInstruksi): string {
  const g = ktx.kegiatanId ? k.p.kalender.find((x) => x.id === ktx.kegiatanId) : undefined;
  if (g) return `kegiatan ${g.nama}`;
  const sem = daftarSemester(k.p).find((x) => x.id === ktx.semesterId) ?? daftarSemester(k.p)[0];
  return `jadwal induk ${sem?.nama ?? ''}`.trim();
}

function opsiSasaran(k: Konteks): string {
  const s = aktif().sasaran;
  const tetap = s.mode === 'tetap' ? (s.kegiatanId ? `keg:${s.kegiatanId}` : s.semesterId ? `sem:${s.semesterId}` : 'ikut') : 'ikut';
  const sel = (v: string) => (v === tetap ? ' selected' : '');
  const ikut = `<option value="ikut"${sel('ikut')}>Ikuti tampilan · ${esc(labelKtx(k, konteksInstruksi(k)))}</option>`;
  const grup = daftarSemester(k.p)
    .map((sem) => {
      const kegiatan = k.p.kalender.filter((g) => !g.agenda && semesterKegiatan(k.p, g)?.id === sem.id).sort((a, b) => a.mulai.localeCompare(b.mulai));
      return `<optgroup label="${esc(sem.nama)}"><option value="sem:${esc(sem.id)}"${sel(`sem:${sem.id}`)}>Jadwal induk ${esc(sem.nama)}</option>${kegiatan.map((g) => `<option value="keg:${esc(g.id)}"${sel(`keg:${g.id}`)}>${esc(g.nama)} · ${esc(rentang(g.mulai, g.selesai))}</option>`).join('')}</optgroup>`;
    })
    .join('');
  return ikut + grup;
}

// -------------------------------------------------------------------------------------------- simpan dan sinkron

interface PenyimpanPercakapan {
  daftar: Percakapan[];
  aktifId?: string;
}

const adaIsi = (c: Percakapan) => c.dihapus !== undefined || c.tampil.length > 0;
const untukDisimpan = () => st.daftar.filter(adaIsi);

let pewaktuSimpan: ReturnType<typeof setTimeout> | undefined;
let pewaktuSinkron: ReturnType<typeof setTimeout> | undefined;

/** Menyalin keadaan sesi ke percakapan aktif dan menjadwalkan penyimpanan. */
function tandaiUbah(): void {
  const c = aktif();
  const e = st.sesi.ekspor();
  if (e.tampil.length === 0 && c.tampil.length === 0) return;
  Object.assign(c, { riwayat: e.riwayat, tampil: e.tampil, urut: e.urut, catatan: e.catatan, diubah: Date.now() });
  simpanSegera();
}

function simpanSegera(): void {
  if (pewaktuSimpan) clearTimeout(pewaktuSimpan);
  pewaktuSimpan = setTimeout(() => void simpanLokal(), 300);
}

async function simpanLokal(): Promise<void> {
  const data: PenyimpanPercakapan = { daftar: untukDisimpan(), aktifId: st.aktifId };
  await tulisAi('percakapan', data).catch(() => undefined);
  jadwalkanSinkron();
}

function jadwalkanSinkron(): void {
  if (!st.sinkron.otomatis || !vs.terbuka || !vs.token) return;
  if (pewaktuSinkron) clearTimeout(pewaktuSinkron);
  pewaktuSinkron = setTimeout(() => void jalankanSinkron(false), 45_000);
}

async function jalankanSinkron(manual: boolean): Promise<void> {
  if (st.sinkron.fase === 'jalan') return;
  if (!vs.terbuka || !vs.token) {
    if (manual) {
      st.sinkron = { ...st.sinkron, fase: 'galat', pesan: 'Token GitHub belum diisi atau brankas terkunci. Isi token di Pengaturan.' };
      gambarAi();
    }
    return;
  }
  st.sinkron = { ...st.sinkron, fase: 'jalan' };
  gambarAi();
  const h = await sinkronkanAi({ token: vs.token, lokal: { percakapan: untukDisimpan(), pengaturan: { nilai: st.pengaturan, diubah: st.pengaturanDiubah } } });
  if (!h.ok) {
    st.sinkron = { ...st.sinkron, fase: 'galat', pesan: h.galat };
    gambarAi();
    return;
  }
  const kosong = st.daftar.filter((c) => !adaIsi(c));
  const lama = aktif();
  const gabung = gabungPercakapan(untukDisimpan(), h.data.percakapan);
  st.daftar = [...gabung, ...kosong];
  const baru = st.daftar.find((c) => c.id === lama.id);
  if (baru && baru !== lama && !st.kirim) {
    if (baru.dihapus !== undefined) st.aktifId = '';
    else st.sesi.pulihkan(baru);
  } else if (baru && baru !== lama && st.kirim) st.daftar = st.daftar.map((c) => (c.id === lama.id ? lama : c));
  aktif();
  if (h.data.pengaturan && h.data.pengaturan.diubah > st.pengaturanDiubah) {
    st.pengaturan = { ...PENGATURAN_BAWAAN, ...h.data.pengaturan.nilai };
    st.pengaturanDiubah = h.data.pengaturan.diubah;
    await tulisAi('pengaturan', st.pengaturan).catch(() => undefined);
    await tulisAi('pengaturanDiubah', st.pengaturanDiubah).catch(() => undefined);
  }
  await tulisAi('percakapan', { daftar: untukDisimpan(), aktifId: st.aktifId } satisfies PenyimpanPercakapan).catch(() => undefined);
  st.sinkron = { ...st.sinkron, fase: 'ok', waktu: Date.now(), pesan: h.dilewati ? `${h.dilewati} butir rusak di GitHub dilewati.` : '' };
  if (manual) st.info = h.baruDariRemote ? `Sinkron selesai: ${h.baruDariRemote} percakapan diperbarui dari GitHub.` : 'Sinkron selesai.';
  gambarAi();
}

function buatRotasi(): void {
  st.rotasi = new PengaturRotasi({
    pengaturan: () => st.pengaturan,
    kunci: () => vs.kunci,
    klien: klienGemini(),
    penyimpan: { baca: async () => (await bacaAi<StatusRotasi>('status')) ?? null, tulis: (s) => tulisAi('status', s) },
  });
}

const ringkasHasil = (h: HasilSusun) => `${h.terjadwal} dari ${h.total} JP tertempatkan, ${h.sisa.length} beban belum penuh${h.sisa.length ? ` (${h.sisa.slice(0, 5).map((s) => `${s.jpSisa} JP: ${s.alasan.slice(0, 80)}`).join(' | ')})` : ''}`;

/** Brankas bisa dibuka dari tab Terapkan atau otomatis saat dimuat; sinkronkan rotasi dan pengamat bila perlu. */
function selaraskan(): void {
  if (vs.terbuka && !st.rotasi) {
    buatRotasi();
    pasangPengamatSusun((h) => st.sesi.catatHasilSusun(ringkasHasil(h)));
  } else if (!vs.terbuka && st.rotasi) {
    st.rotasi = null;
    pasangPengamatSusun(null);
  }
}

const simpanPengaturan = async () => {
  st.pengaturanDiubah = Date.now();
  await tulisAi('pengaturan', st.pengaturan);
  await tulisAi('pengaturanDiubah', st.pengaturanDiubah);
  jadwalkanSinkron();
};

function bacaPrefJendela(): { buka: boolean; lebar: boolean } {
  try {
    const j = JSON.parse(localStorage.getItem('aiJendela') ?? '{}') as { buka?: unknown; lebar?: unknown };
    return { buka: j.buka === true, lebar: j.lebar === true };
  } catch {
    return { buka: false, lebar: false };
  }
}
function simpanPrefJendela(): void {
  try {
    localStorage.setItem('aiJendela', JSON.stringify({ buka: st.buka, lebar: st.lebar }));
  } catch {
    /* peramban menolak penyimpanan: pilihan jendela tidak diingat */
  }
}

async function muat(k: Konteks): Promise<void> {
  if (st.memuat || st.dimuat) return;
  st.memuat = true;
  try {
    await muatBrankas();
    const png = await bacaAi<PengaturanAi>('pengaturan');
    if (png) st.pengaturan = { ...PENGATURAN_BAWAAN, ...png };
    st.pengaturanDiubah = (await bacaAi<number>('pengaturanDiubah')) ?? 0;
    const simpan = await bacaAi<PenyimpanPercakapan>('percakapan');
    if (simpan && Array.isArray(simpan.daftar)) {
      const kosong = st.daftar.filter((c) => !adaIsi(c));
      st.daftar = [...simpan.daftar, ...kosong];
      const pilih = st.daftar.find((c) => c.id === simpan.aktifId && c.dihapus === undefined) ?? daftarAktif(st.daftar).find(adaIsi);
      if (pilih) {
        st.aktifId = pilih.id;
        st.sesi.pulihkan(pilih);
      }
    }
    const sk = await bacaAi<{ otomatis?: boolean }>('sinkronAi');
    if (sk && typeof sk.otomatis === 'boolean') st.sinkron.otomatis = sk.otomatis;
  } catch (e) {
    st.galat = `Tidak bisa membaca data asisten: ${e instanceof Error ? e.message : String(e)}`;
  }
  st.dimuat = true;
  st.memuat = false;
  selaraskan();
  gambarAi();
  if (vs.terbuka && vs.token && st.sinkron.otomatis) void jalankanSinkron(false);
  void k;
}

// ------------------------------------------------------------------------------------------------------ tampilan

const KELAS_TOMBOL_IKON = 'grid h-9 w-9 place-items-center rounded-lg text-slate-200 hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60';

function tombolIkon(aksi: string, ikon: string, judul: string, tambahan = ''): string {
  return `<button class="${KELAS_TOMBOL_IKON}" data-aksi="${aksi}" title="${esc(judul)}" aria-label="${esc(judul)}" ${tambahan}>${ikon}</button>`;
}

function statusKepala(): string {
  if (!st.dimuat) return 'Memuat…';
  if (!vs.brankas) return 'Belum disiapkan';
  if (!vs.terbuka) return 'Terkunci';
  return `<span class="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-400 align-middle"></span>Siap · ${esc(st.pengaturan.model)}`;
}

function chipSinkron(): string {
  if (!st.dimuat || !vs.terbuka) return '';
  const s = st.sinkron;
  const teks =
    s.fase === 'jalan' ? 'Menyinkronkan…'
    : s.fase === 'ok' ? `Tersinkron ${jam(s.waktu ?? Date.now())}`
    : s.fase === 'galat' ? 'Gagal sinkron'
    : vs.token ? 'Belum disinkron' : 'Lokal saja';
  const warna = s.fase === 'galat' ? 'bg-red-500/20 text-red-100' : s.fase === 'ok' ? 'bg-emerald-500/20 text-emerald-100' : 'bg-white/10 text-slate-200';
  return `<button class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${warna} hover:bg-white/20" data-aksi="aiSinkron" title="${esc(s.pesan || 'Sinkronkan riwayat dan pengaturan dengan GitHub')}">${IKON.sinkron}${esc(teks)}</button>`;
}

function kepala(): string {
  const dalam = st.layar !== 'chat';
  const kiri = dalam
    ? `<button class="${KELAS_TOMBOL_IKON}" data-aksi="aiLayar" data-layar="chat" title="Kembali ke percakapan" aria-label="Kembali ke percakapan">${IKON.kembali}</button>`
    : logoAi(34, 'shrink-0');
  const judul = st.layar === 'riwayat' ? 'Riwayat percakapan' : st.layar === 'pengaturan' ? 'Pengaturan asisten' : 'Asisten Jadwal';
  return `<div class="flex shrink-0 items-center gap-2 bg-[#0d1e33] px-3 py-2.5 text-white">
    ${kiri}
    <div class="min-w-0 flex-1"><div class="truncate text-[15px] font-bold leading-tight">${judul}</div><div class="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-300"><span class="min-w-0 truncate">${statusKepala()}</span>${chipSinkron()}</div></div>
    ${vs.terbuka && st.layar !== 'riwayat' ? tombolIkon('aiLayar', IKON.riwayat, 'Riwayat percakapan', 'data-layar="riwayat"') : ''}
    ${vs.terbuka ? tombolIkon('aiBaru', IKON.baru, 'Percakapan baru') : ''}
    ${vs.terbuka && st.layar !== 'pengaturan' ? tombolIkon('aiLayar', IKON.atur, 'Pengaturan', 'data-layar="pengaturan"') : ''}
    <span class="hidden sm:inline-grid">${tombolIkon('aiLebar', IKON.lebar, st.lebar ? 'Persempit jendela' : 'Lebarkan jendela')}</span>
    ${tombolIkon('aiTutupJendela', IKON.tutup, 'Tutup (percakapan tersimpan)')}
  </div>`;
}

const KELAS_KOTAK = 'mx-auto w-full max-w-md p-4';

function formBuat(): string {
  const opsi = PILIHAN_INGAT_HARI.map((h) => `<option value="${h}" ${h === vs.ingatHari ? 'selected' : ''}>${h === 0 ? 'Jangan ingat (PIN setiap sesi)' : `Ingat ${h} hari`}</option>`).join('');
  return `<div class="${KELAS_KOTAK}"><div class="mb-3 flex items-center gap-3">${logoAi(44)}<div><h2 class="text-lg font-bold leading-tight">Siapkan Asisten Jadwal</h2><p class="text-xs text-slate-500">Sekali saja di perangkat ini</p></div></div>
    <p class="text-sm text-slate-600">Asisten memakai Gemini dari akun Google Anda sendiri. Kunci API disimpan <b>terenkripsi dengan PIN di peramban ini</b>; tidak pernah dikirim ke repo atau ke orang lain. Kunci gratis dibuat di <b>aistudio.google.com/apikey</b>.</p>
    <div class="mt-3 grid gap-2">
      <label class="text-sm">PIN (minimal ${PIN_MINIMAL} karakter)<input id="aiPin" type="password" class="isian mt-1 w-full" autocomplete="new-password"></label>
      <label class="text-sm">Ulangi PIN<input id="aiPin2" type="password" class="isian mt-1 w-full" autocomplete="new-password"></label>
      <label class="text-sm">Label kunci pertama<input id="aiLabel" class="isian mt-1 w-full" placeholder="mis. Akun Benny"></label>
      <label class="text-sm">Kunci API Gemini<input id="aiKunciBaru" type="password" class="isian mt-1 w-full" autocomplete="off"></label>
      <label class="text-sm">PIN diingat perangkat ini<select id="aiIngat" class="isian mt-1 w-full">${opsi}</select></label></div>
    <div class="mt-3"><button class="tombol !bg-[#2347b8] !text-white" data-aksi="aiBuat">Simpan dan buka</button></div>
    <p class="mt-2 text-xs text-slate-500">PIN tidak bisa dipulihkan. Bila lupa, brankas dihapus dan kunci dimasukkan lagi.</p></div>`;
}

function formBuka(): string {
  const opsi = PILIHAN_INGAT_HARI.map((h) => `<option value="${h}" ${h === vs.ingatHari ? 'selected' : ''}>${h === 0 ? 'Jangan ingat' : `Ingat ${h} hari`}</option>`).join('');
  return `<div class="${KELAS_KOTAK}"><div class="mb-3 flex items-center gap-3">${logoAi(44)}<div><h2 class="text-lg font-bold leading-tight">Buka brankas kunci</h2><p class="text-xs text-slate-500">Masukkan PIN sekali; perangkat ini mengingatnya sesuai pilihan.</p></div></div>
    <div class="grid gap-2"><input id="aiPin" type="password" class="isian w-full" placeholder="PIN" autocomplete="current-password"><select id="aiIngat" class="isian w-full" aria-label="Lama PIN diingat">${opsi}</select><button class="tombol !bg-[#2347b8] !text-white" data-aksi="aiBuka">Buka</button></div>
    <div class="mt-3"><button class="text-xs text-red-700 underline" data-aksi="aiHapusBrankas">Lupa PIN: hapus brankas</button></div></div>`;
}

const CONTOH = [
  { judul: 'Tanya data', daftar: ['Kapan ASAS dimulai dan kelas apa saja yang libur saat itu?', 'Kegiatan apa saja yang ada di bulan Desember?'] },
  { judul: 'Ubah kalender', daftar: ['Tanggal 5 Desember ada rapat dinas', 'UKK diundur 1 minggu', 'Buat kegiatan ASTS dari 7 sampai 11 Desember, kelas XII tidak aktif'] },
  { judul: 'Ubah jadwal', daftar: ['Jadikan PRE kelas XII TE 1 enam JP', 'Guru BEN tidak tersedia Senin jam 1 dan 2', 'Susun rekomendasi jadwal untuk semester ini'] },
];

function keadaanKosong(): string {
  return `<div class="px-3 py-4 text-center">${logoAi(56, 'mx-auto')}<h3 class="mt-2 text-base font-bold">Apa yang ingin Anda ketahui atau ubah?</h3>
    <p class="mx-auto mt-1 max-w-xs text-xs text-slate-500">Tulis dengan bahasa sehari-hari. Asisten menjawab dari data tersimpan dan mengusulkan perubahan. <b>Tidak ada yang berubah sebelum Anda menekan Terapkan.</b></p>
    <div class="mt-3 space-y-3 text-left">${CONTOH.map((c) => `<div><div class="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">${c.judul}</div><div class="flex flex-wrap gap-1.5">${c.daftar.map((t) => `<button class="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-left text-xs text-slate-700 shadow-sm hover:border-[#2347b8] hover:text-[#2347b8]" data-aksi="aiContoh" data-teks="${esc(t)}">${esc(t)}</button>`).join('')}</div></div>`).join('')}</div></div>`;
}

function giliranHtml(g: Giliran, terakhir: boolean): string {
  const waktu = g.waktu ? `<div class="mt-0.5 text-[10px] text-slate-400">${jam(g.waktu)}</div>` : '';
  if (g.peran === 'admin') return `<div class="flex flex-col items-end"><div class="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-sm bg-[#2347b8] px-3 py-2 text-sm text-white">${esc(g.teks)}</div>${waktu}</div>`;
  if (g.peran === 'sistem')
    return `<div class="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"><div class="font-semibold">Pesan belum terkirim</div><div class="mt-0.5">${formatTeks(g.teks)}</div>${terakhir ? '<div class="mt-2"><button class="rounded-lg border border-red-300 bg-white px-3 py-1 text-xs font-medium text-red-800 hover:bg-red-100" data-aksi="aiUlang">Coba lagi</button></div>' : ''}</div>`;
  const galat = g.galat.length ? `<div class="mt-2 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-800"><div class="font-semibold">Usulan belum bisa dipakai</div>${g.galat.map((x) => `<div>${esc(x)}</div>`).join('')}</div>` : '';
  const tanya = g.pertanyaan ? `<div class="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-sm text-amber-900"><span class="font-semibold">Asisten bertanya:</span> ${esc(g.pertanyaan)}</div>` : '';
  const tb = g.tidakBisa?.length ? `<div class="mt-2 rounded-lg bg-slate-100 p-2 text-xs text-slate-700"><div class="font-semibold">Belum didukung:</div>${g.tidakBisa.map((x) => `<div>• ${esc(x)}</div>`).join('')}</div>` : '';
  const kartu = g.rencana
    ? kartuUsulan(g, { dikecualikan: st.dikecualikan.get(g.id) ?? new Set(), bisaUrungkan: st.terakhir?.id === g.id && !!kRef && JSON.stringify(kRef.p) === st.terakhir.snap, waktu: jam })
    : '';
  const susun = kRef ? panelSusun(kRef, g) : '';
  return `<div class="flex items-start gap-2">${logoAi(24, 'mt-1 shrink-0')}<div class="min-w-0 max-w-[92%]"><div class="rounded-2xl rounded-tl-sm border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm"><div class="break-words">${formatTeks(g.teks)}</div>${tanya}${tb}${kartu}${susun}${galat}</div><div class="mt-0.5 text-[10px] text-slate-400">${g.waktu ? `${jam(g.waktu)} · ` : ''}${esc(g.sumber ?? '')}</div></div></div>${waktu ? '' : ''}`;
}

function renderChat(k: Konteks): string {
  const c = aktif();
  const ktx = ktxAktif(k);
  const adaTampil = st.sesi.tampil.length > 0;
  const terakhirId = st.sesi.tampil.at(-1)?.id;
  const riwayat = adaTampil ? st.sesi.tampil.map((g) => giliranHtml(g, g.id === terakhirId)).join('') : keadaanKosong();
  const berpikir = st.kirim
    ? `<div class="flex items-center gap-2 text-sm text-slate-500">${logoAi(24, 'shrink-0')}<span class="rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm">Asisten sedang menyusun jawaban<span class="animate-pulse">…</span></span></div>`
    : '';
  return `<div class="shrink-0 border-b border-slate-200 bg-slate-50 px-3 py-2"><label class="flex items-center gap-2 text-xs text-slate-600"><span class="shrink-0 font-semibold">Sasaran</span>
      <select id="aiSasaran" class="isian min-w-0 flex-1 !py-1 text-xs" aria-label="Sasaran perubahan beban dan aturan">${opsiSasaran(k)}</select></label>
      <div class="mt-1 text-[11px] leading-snug text-slate-500">Beban dan aturan diterapkan pada <b>${esc(labelKtx(k, ktx))}</b>; kalender berlaku untuk seluruh tahun.${c.sasaran.mode === 'tetap' ? '' : ' Sasaran mengikuti tampilan di belakang.'}</div></div>
    <div id="aiRiwayat" class="min-h-0 flex-1 space-y-3 overflow-y-auto bg-slate-100/70 p-3" aria-live="polite">${riwayat}${berpikir}</div>
    ${st.galat ? `<div class="shrink-0 bg-red-50 px-3 py-1.5 text-xs text-red-800">${esc(st.galat)}</div>` : ''}
    <div class="shrink-0 border-t border-slate-200 bg-white p-2"><div class="flex items-end gap-2"><textarea id="aiTeks" rows="2" class="isian max-h-40 min-h-[44px] w-full resize-none" placeholder="Tulis permintaan atau pertanyaan…" ${st.kirim ? 'disabled' : ''}>${esc(st.teks)}</textarea>
      <button class="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#2347b8] text-white shadow-sm hover:bg-[#1c3a98] disabled:opacity-40" data-aksi="aiKirim" ${st.kirim ? 'disabled' : ''} title="Kirim (Ctrl+Enter)" aria-label="Kirim">${IKON.kirim}</button></div>
      <div class="mt-1 text-[10px] leading-snug text-slate-400">Yang dikirim ke Google hanya kode guru, mapel, kelas, ruang, beban, aturan, dan kalender; nama lengkap, NIP, dan tanggal lahir tidak ikut.</div></div>`;
}

function renderRiwayat(): string {
  const q = st.cari.trim().toLowerCase();
  const semua = daftarAktif(st.daftar).filter(adaIsi).filter((c) => !q || judulTampil(c).toLowerCase().includes(q) || c.tampil.some((g) => g.teks.toLowerCase().includes(q)));
  const baris = semua
    .map((c) => {
      const menunggu = jumlahMenunggu(c);
      const pesan = c.tampil.filter((g) => g.peran === 'admin').length;
      const sama = c.id === st.aktifId;
      return `<div class="group flex items-stretch gap-1 rounded-xl border ${sama ? 'border-[#2347b8] bg-sky-50' : 'border-slate-200 bg-white'} shadow-sm">
        <button class="min-w-0 flex-1 px-3 py-2 text-left" data-aksi="aiBukaPercakapan" data-id="${esc(c.id)}"><div class="truncate text-sm font-semibold">${esc(judulTampil(c))}</div><div class="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-slate-500"><span>${esc(tanggalPendek(c.diubah))}</span><span>${pesan} pesan</span>${menunggu ? `<span class="rounded-full bg-amber-100 px-1.5 text-amber-800">${menunggu} usulan menunggu</span>` : ''}${sama ? '<span class="rounded-full bg-[#2347b8] px-1.5 text-white">aktif</span>' : ''}</div></button>
        <div class="flex shrink-0 flex-col justify-center border-l border-slate-100 px-1"><button class="rounded p-1 text-xs text-slate-500 hover:bg-slate-100" data-aksi="aiGantiNama" data-id="${esc(c.id)}" title="Ganti nama" aria-label="Ganti nama">✎</button><button class="rounded p-1 text-xs text-red-600 hover:bg-red-50" data-aksi="aiHapusPercakapan" data-id="${esc(c.id)}" title="Hapus percakapan" aria-label="Hapus percakapan">✕</button></div></div>`;
    })
    .join('');
  return `<div class="shrink-0 border-b border-slate-200 p-3"><div class="flex gap-2"><input id="aiCari" class="isian min-w-0 flex-1" placeholder="Cari percakapan…" value="${esc(st.cari)}"><button class="tombol !bg-[#2347b8] !text-white" data-aksi="aiBaru">+ Baru</button></div>
      <div class="mt-1 text-[11px] text-slate-500">${semua.length} percakapan${st.sinkron.fase === 'ok' ? ` · tersinkron ${jam(st.sinkron.waktu ?? Date.now())}` : vs.token ? ' · belum disinkron' : ''}</div></div>
    <div class="min-h-0 flex-1 space-y-2 overflow-y-auto bg-slate-100/70 p-3">${baris || '<p class="py-6 text-center text-sm text-slate-500">Belum ada percakapan tersimpan.</p>'}</div>`;
}

function renderPengaturan(): string {
  const ringkas = st.rotasi?.ringkas() ?? [];
  const tidakSah = st.rotasi?.status.tidakSah ?? {};
  const barisKunci = vs.kunci
    .map((x) => `<div class="border-t border-slate-100 py-2 text-sm">
      <div class="flex flex-wrap items-center gap-x-2 gap-y-1"><span class="min-w-0 max-w-full break-words font-semibold">${esc(x.label)}</span><span class="font-mono text-xs text-slate-500">${esc(samarkan(x.nilai))}</span>${tidakSah[x.id] ? '<span class="lencana bg-red-100 text-red-800">tidak sah</span>' : x.aktif ? '<span class="lencana bg-emerald-100 text-emerald-800">aktif</span>' : '<span class="lencana bg-slate-200 text-slate-700">nonaktif</span>'}</div>
      ${st.uji[x.id] ? `<div class="mt-0.5 break-words text-xs text-slate-600">${esc(st.uji[x.id] ?? '')}</div>` : ''}
      <div class="mt-1.5 flex flex-wrap gap-1.5"><button class="tombol !py-0.5 !text-xs" data-aksi="aiUji" data-id="${esc(x.id)}">Uji</button><button class="tombol !py-0.5 !text-xs" data-aksi="aiAktif" data-id="${esc(x.id)}">${x.aktif ? 'Nonaktifkan' : 'Aktifkan'}</button><button class="tombol !py-0.5 !text-xs !text-red-700" data-aksi="aiHapusKunci" data-id="${esc(x.id)}">Hapus</button></div></div>`)
    .join('');
  const pakai = ringkas
    .map((r) => `<tr class="border-t border-slate-100"><td class="py-0.5 pr-2">${esc(r.label)}</td><td class="pr-2 font-mono text-xs">${esc(r.model)}</td><td class="pr-2 text-right">${r.permintaanHariIni} / ${r.batasHarian}</td></tr>`)
    .join('');
  const galat = (st.rotasi?.status.galat ?? []).slice(0, 5).map((g) => `<div>${esc(new Date(g.t).toLocaleTimeString('id-ID'))} · ${esc(g.kunci)} · ${esc(g.model)} · ${g.status}: ${esc(g.pesan)}</div>`).join('');
  const opsiIngat = PILIHAN_INGAT_HARI.map((h) => `<option value="${h}" ${h === vs.ingatHari ? 'selected' : ''}>${h === 0 ? 'Jangan ingat (PIN setiap sesi)' : `Ingat ${h} hari`}</option>`).join('');
  const sk = st.sinkron;
  const kartu = 'rounded-xl border border-slate-200 bg-white p-3 shadow-sm';
  return `<div class="min-h-0 flex-1 space-y-3 overflow-y-auto bg-slate-100/70 p-3">
    ${st.info ? `<div class="rounded-lg bg-emerald-50 p-2 text-sm text-emerald-800">${esc(st.info)}</div>` : ''}
    <div class="${kartu}"><h3 class="mb-1 font-bold">Perangkat ini</h3>
      <p class="text-xs text-slate-500">${vs.ingatSampai ? `PIN diingat sampai ${esc(new Date(vs.ingatSampai).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }))}.` : 'PIN tidak diingat; diminta setiap peramban dibuka.'} Yang tersimpan hanya kunci turunan yang tidak bisa diekspor, bukan PIN dan bukan isi brankas.</p>
      <label class="mt-2 block text-sm">Lama PIN diingat<select id="aiIngat" class="isian mt-1 w-full">${opsiIngat}</select></label>
      <div class="mt-2 flex flex-wrap items-end gap-2"><button class="tombol" data-aksi="aiKunci">Kunci sekarang</button><button class="tombol !text-red-700" data-aksi="aiHapusBrankas">Hapus brankas</button></div>
      <div class="mt-2 flex flex-wrap items-end gap-2"><label class="min-w-0 flex-1 text-sm">PIN baru<input id="aiPinBaru" type="password" class="isian mt-1 w-full" autocomplete="new-password"></label><button class="tombol" data-aksi="aiGantiPin">Ganti PIN</button></div></div>
    <div class="${kartu}"><h3 class="mb-1 font-bold">Sinkron ke GitHub</h3>
      <p class="text-xs text-slate-600">Riwayat percakapan dan pengaturan model disalin ke <span class="font-mono">data/admin/ai.json</span> di repo (digabung per percakapan; yang terakhir diubah menang). Kunci API dan token tidak ikut. <b>Repo ini publik: isi percakapan dapat dibaca siapa pun yang tahu alamatnya, jadi jangan menulis data pribadi di chat.</b></p>
      <label class="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" id="aiOtomatis" ${sk.otomatis ? 'checked' : ''}> Sinkron otomatis setelah percakapan berubah</label>
      <div class="mt-2 flex flex-wrap items-center gap-2"><button class="tombol !bg-[#2347b8] !text-white" data-aksi="aiSinkron" ${sk.fase === 'jalan' ? 'disabled' : ''}>${sk.fase === 'jalan' ? 'Menyinkronkan…' : 'Sinkron sekarang'}</button><span class="text-xs ${sk.fase === 'galat' ? 'text-red-700' : 'text-slate-500'}">${esc(sk.fase === 'galat' ? (sk.pesan ?? '') : sk.fase === 'ok' ? `Terakhir ${jam(sk.waktu ?? Date.now())}${sk.pesan ? ` · ${sk.pesan}` : ''}` : '')}</span></div>
      <div class="mt-2 border-t border-slate-100 pt-2 text-xs text-slate-600">${vs.token ? `Token GitHub tersimpan di brankas (<span class="font-mono">${esc(samarkan(vs.token))}</span>), dipakai juga oleh tab Terapkan dan tombol Sinkron.` : 'Belum ada token GitHub di brankas.'}
        <div class="mt-1 flex flex-wrap gap-2"><input id="aiToken" type="password" class="isian min-w-0 flex-1" placeholder="${vs.token ? 'Ganti token (github_pat_…)' : 'Token GitHub (github_pat_…)'}" autocomplete="off"><button class="tombol" data-aksi="aiSimpanToken">Simpan token</button></div></div></div>
    <div class="${kartu}"><h3 class="mb-2 font-bold">Kunci API</h3>
      <div>${barisKunci || '<p class="text-sm text-slate-500">Belum ada kunci.</p>'}</div>
      <div class="mt-3 grid min-w-0 gap-2 border-t border-slate-100 pt-3"><input id="aiLabel" class="isian min-w-0" placeholder="Label"><input id="aiKunciBaru" type="password" class="isian min-w-0" placeholder="Kunci API Gemini" autocomplete="off"><button class="tombol" data-aksi="aiTambahKunci">Tambah kunci</button></div>
      <p class="mt-1 text-xs text-slate-500">Banyak kunci dari akun berbeda memperbesar jatah gratis: model utama dicoba di semua kunci dulu sebelum turun ke model cadangan.</p></div>
    <div class="${kartu}"><h3 class="mb-2 font-bold">Model dan batas</h3>
      <label class="text-sm">Model utama<input id="aiModel" list="aiDaftarModel" class="isian mt-1 w-full" value="${esc(st.pengaturan.model)}"></label>
      <datalist id="aiDaftarModel">${MODEL_REKOMENDASI.map((m) => `<option value="${esc(m.model)}">`).join('')}</datalist>
      <label class="mt-2 block text-sm">Model cadangan (satu per baris, berurutan)<textarea id="aiCadangan" rows="4" class="isian mt-1 w-full font-mono text-xs">${esc(st.pengaturan.cadangan.join('\n'))}</textarea></label>
      <div class="mt-2 grid grid-cols-2 gap-2"><label class="text-sm">Batas per menit<input id="aiRpm" type="number" min="1" class="isian mt-1 w-full" value="${st.pengaturan.rpm}"></label><label class="text-sm">Batas per hari<input id="aiRpd" type="number" min="1" class="isian mt-1 w-full" value="${st.pengaturan.rpd}"></label></div>
      <div class="mt-2 flex gap-2"><button class="tombol" data-aksi="aiSimpanModel">Simpan</button><button class="tombol" data-aksi="aiBawaan">Kembalikan bawaan</button></div>
      <p class="mt-1 text-xs text-slate-500">Batas per kunci per model. Bila Google melaporkan batas yang lebih kecil, batas itu yang dipakai. Pengaturan ini ikut tersinkron.</p></div>
    <div class="${kartu}"><h3 class="mb-2 font-bold">Pemakaian hari ini</h3>
      <table class="w-full text-sm"><thead class="text-left text-xs text-slate-500"><tr><th>Kunci</th><th>Model</th><th class="text-right">Permintaan / batas</th></tr></thead><tbody>${pakai || '<tr><td colspan="3" class="py-1 text-slate-500">Belum ada pemakaian.</td></tr>'}</tbody></table>
      ${galat ? `<div class="mt-2 rounded bg-slate-50 p-2 text-xs text-slate-600"><div class="font-semibold">Galat terakhir</div>${galat}</div>` : ''}
      <div class="mt-2"><button class="tombol !text-xs" data-aksi="aiResetStatus">Reset catatan batas</button></div></div></div>`;
}

/** Isi jendela (kepala dan badan) menurut keadaan sekarang; dipakai juga oleh uji. */
export function renderAi(k: Konteks): string {
  kRef = k;
  if (!st.dimuat) {
    void muat(k);
    return '<div class="p-4 text-sm text-slate-500">Memuat…</div>';
  }
  selaraskan();
  const banner = !vs.terbuka && (st.galat || st.info) ? `<div class="mx-auto w-full max-w-md px-4 pt-3"><div class="rounded-lg ${st.galat ? 'bg-red-50 text-red-800' : 'bg-emerald-50 text-emerald-800'} p-2 text-sm">${esc(st.galat || st.info)}</div></div>` : '';
  let badan: string;
  if (!vs.brankas) badan = `<div class="min-h-0 flex-1 overflow-y-auto">${banner}${formBuat()}</div>`;
  else if (!vs.terbuka) badan = `<div class="min-h-0 flex-1 overflow-y-auto">${banner}${formBuka()}</div>`;
  else if (st.layar === 'pengaturan') badan = renderPengaturan();
  else if (st.layar === 'riwayat') badan = renderRiwayat();
  else badan = renderChat(k);
  return `${kepala()}${badan}`;
}

function balon(): string {
  const menunggu = jumlahMenunggu(aktif()) + kerjaMenunggu();
  return `<button class="pointer-events-auto fixed bottom-4 right-4 z-[70] grid h-14 w-14 place-items-center rounded-full bg-[#0d1e33] shadow-xl ring-2 ring-white hover:scale-105 focus:outline-none focus-visible:ring-4 focus-visible:ring-[#2347b8] ${st.kirim || kerjaJalan() ? 'animate-pulse' : ''}" data-aksi="aiBalon" title="Asisten Jadwal" aria-label="Buka Asisten Jadwal">${logoAi(46)}${menunggu ? `<span class="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-amber-400 px-1 text-[11px] font-bold text-slate-900 ring-2 ring-white">${menunggu}</span>` : ''}</button>`;
}

function jendela(k: Konteks): string {
  const lebar = st.lebar ? 'sm:w-[min(55vw,860px)]' : 'sm:w-[min(32vw,520px)]';
  return `<section id="aiJendela" role="dialog" aria-label="Asisten Jadwal" class="pointer-events-auto fixed inset-x-2 bottom-2 top-14 z-[70] flex flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/15 sm:inset-x-auto sm:bottom-4 sm:right-4 sm:top-[4.5rem] sm:min-w-[380px] ${lebar}">${renderAi(k)}</section>`;
}

const layarKecil = () => typeof matchMedia === 'function' && matchMedia('(max-width: 639px)').matches;

/** Di ponsel, jendela mengikuti area yang terlihat (papan ketik tidak menutupi kolom pesan). */
function aturViewport(): void {
  const el = document.getElementById('aiJendela');
  if (!el) return;
  const vv = typeof visualViewport !== 'undefined' ? visualViewport : null;
  if (vv && layarKecil()) {
    el.style.top = `${Math.round(vv.offsetTop + 56)}px`;
    el.style.bottom = 'auto';
    el.style.height = `${Math.max(240, Math.round(vv.height - 56 - 8))}px`;
  } else {
    el.style.top = '';
    el.style.bottom = '';
    el.style.height = '';
  }
}

/** Menggambar ulang balon dan jendela sambil mempertahankan fokus, kursor, dan posisi gulir. */
function gambarAi(): void {
  if (!akar || !kRef) return;
  const k = kRef;
  const aktifEl = document.activeElement as (HTMLInputElement | HTMLTextAreaElement | null);
  const idFokus = aktifEl && akar.contains(aktifEl) ? aktifEl.id : '';
  const awal = idFokus ? aktifEl?.selectionStart : null;
  const akhir = idFokus ? aktifEl?.selectionEnd : null;
  const lama = document.getElementById('aiRiwayat');
  const gulirLama = lama?.scrollTop ?? 0;
  const dasarLama = lama ? lama.scrollHeight - lama.clientHeight - lama.scrollTop < 40 : true;
  const gulirIsi = akar.querySelector<HTMLElement>('#aiJendela > .overflow-y-auto')?.scrollTop ?? 0;
  akar.innerHTML = st.buka ? jendela(k) : balon();
  aturViewport();
  const baru = document.getElementById('aiRiwayat');
  if (baru) baru.scrollTop = st.gulirBawah || dasarLama ? baru.scrollHeight : gulirLama;
  const isi = akar.querySelector<HTMLElement>('#aiJendela > .overflow-y-auto');
  if (isi) isi.scrollTop = gulirIsi;
  st.gulirBawah = false;
  const ta = document.getElementById('aiTeks') as HTMLTextAreaElement | null;
  if (ta) aturTinggi(ta);
  if (idFokus) {
    const el = document.getElementById(idFokus) as HTMLInputElement | HTMLTextAreaElement | null;
    if (el) {
      el.focus();
      if (awal !== null && awal !== undefined && akhir !== null && akhir !== undefined && 'setSelectionRange' in el && el.type !== 'password' && el.type !== 'checkbox') {
        try {
          el.setSelectionRange(awal, akhir);
        } catch {
          /* jenis isian tanpa seleksi */
        }
      }
    }
  }
}

function aturTinggi(ta: HTMLTextAreaElement): void {
  ta.style.height = 'auto';
  ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
}

let tandaTerakhir = '';
/** Dipanggil setelah aplikasi menggambar ulang: memperbarui jendela hanya bila sasaran atau lencana berubah (tidak mengganggu pengetikan). */
export function segarkanAi(): void {
  if (!akar || !kRef || !st.dimuat) return;
  const k = kRef;
  const tanda = [st.buka, st.layar, labelKtx(k, konteksInstruksi(k)), vs.terbuka, aktif().sasaran.mode, jumlahMenunggu(aktif()), daftarSemester(k.p).length, k.p.kalender.length].join('|');
  if (tanda === tandaTerakhir) return;
  tandaTerakhir = tanda;
  if (document.activeElement && akar.contains(document.activeElement) && (document.activeElement as HTMLElement).id === 'aiTeks') return;
  gambarAi();
}

function bukaJendela(buka: boolean): void {
  st.buka = buka;
  simpanPrefJendela();
  st.gulirBawah = true;
  gambarAi();
  if (buka && !layarKecil()) document.getElementById('aiTeks')?.focus();
}

// --------------------------------------------------------------------------------------------------- aksi

async function bukaDengan(k: Konteks, pin: string): Promise<void> {
  const hari = Number(nilai('aiIngat'));
  if (Number.isInteger(hari) && PILIHAN_INGAT_HARI.includes(hari as (typeof PILIHAN_INGAT_HARI)[number])) await aturIngat(hari);
  await bukaDenganPin(pin);
  selaraskan();
  st.galat = '';
  gambarAi();
  if (vs.token && st.sinkron.otomatis) void jalankanSinkron(false);
  void k;
}

async function kirim(k: Konteks, teksUlang?: string): Promise<void> {
  const teks = (teksUlang ?? st.teks).trim();
  if (!teks || st.kirim) return;
  st.teks = '';
  st.kirim = true;
  st.galat = '';
  st.gulirBawah = true;
  const janji = st.sesi.kirim(teks, k.p, ktxAktif(k));
  gambarAi();
  try {
    await janji;
  } catch (e) {
    st.galat = `Gagal: ${e instanceof Error ? e.message : String(e)}`;
    st.teks = teks;
  }
  st.kirim = false;
  st.gulirBawah = true;
  tandaiUbah();
  gambarAi();
}

function terapkan(k: Konteks, g: Giliran): void {
  const r = g.rencana;
  if (!r || r.status !== 'menunggu') return;
  const ktx = ktxAktif(k);
  const dik = st.dikecualikan.get(g.id) ?? new Set<number>();
  const pilih = r.balasan.instruksi.filter((_, i) => !dik.has(i));
  if (!pilih.length) return;
  // data bisa berubah sejak usulan dibuat: periksa lagi pada keadaan sekarang
  const cek = rencanakan(k.p, ktx, pilih);
  if (!cek.ok) {
    g.galat = [`Usulan tidak bisa diterapkan pada keadaan sekarang (data atau sasaran berubah sejak usulan dibuat): ${cek.galat.join(' | ')}`];
    gambarAi();
    return;
  }
  const adaDataBerubah = pilih.some((x) => x.op !== 'susun');
  if (adaDataBerubah) k.ubah((p) => void terapkanInstruksi(p, ktx, pilih));
  st.sesi.catatDiterapkan(g, cek, [...dik]);
  st.sesi.segarkanPotret(k.p, ktx);
  st.terakhir = adaDataBerubah ? { id: g.id, snap: JSON.stringify(k.p) } : null;
  st.dikecualikan.delete(g.id);
  tandaiUbah();
  k.lapor(cek.perubahan.length ? `Diterapkan: ${cek.perubahan.length} perubahan.` : 'Diterapkan.');
  const susun = pilih.find((x): x is Extract<Instruksi, { op: 'susun' }> => x.op === 'susun');
  if (cek.susun && susun) mulaiSusunChat(k, g, ktx, susun);
  gambarAi();
}

// ---------------------------------------------------------------------------------- penyusunan di dalam chat

interface KerjaSusun {
  fase: 'jalan' | 'selesai' | 'galat' | 'diterapkan' | 'dibuang';
  pid: string;
  gid: number;
  fokus: Fokus;
  tanggal: string;
  label: string;
  snapData: string;
  snapSesudah?: string;
  kemajuan: Kemajuan | null;
  terbaik: { slots: Slot[]; nilai: number; terjadwal: number; total: number; biaya: number } | null;
  hasil: HasilSusun | null;
  dihentikan: boolean;
  beban: Beban[];
  galat: string;
  pekerja: PekerjaSusun | null;
  mulai: number;
}
const kerja = new Map<string, KerjaSusun>();
const kunciKerja = (gid: number, pid = st.aktifId) => `${pid}:${gid}`;
const kerjaJalan = (): boolean => [...kerja.values()].some((x) => x.fase === 'jalan');
const kerjaMenunggu = (): number => [...kerja.values()].filter((x) => x.fase === 'selesai').length;

/** Menggulir daftar chat agar panel penyusunan terakhir terlihat dari atasnya (hasil baru tidak tersembunyi di bawah). */
function tampilkanPanelSusun(): void {
  if (typeof document === 'undefined' || !document.querySelectorAll) return;
  const semua = document.querySelectorAll('[data-panel-susun]');
  (semua[semua.length - 1] as HTMLElement | undefined)?.scrollIntoView?.({ block: 'start' });
}

function cariGiliran(kj: KerjaSusun): Giliran | undefined {
  if (kj.pid === st.aktifId) return st.sesi.tampil.find((x) => x.id === kj.gid);
  return st.daftar.find((c) => c.id === kj.pid)?.tampil.find((x) => x.id === kj.gid);
}

/** Mengubah catatan penyusunan pada usulan asal dan menyimpannya (juga bila percakapan itu sedang tidak dibuka). */
function catatRencana(kj: KerjaSusun, f: (r: NonNullable<Giliran['rencana']>) => void): void {
  const g = cariGiliran(kj);
  if (g?.rencana) f(g.rencana);
  if (kj.pid === st.aktifId) tandaiUbah();
  else {
    const c = st.daftar.find((x) => x.id === kj.pid);
    if (c) c.diubah = Date.now();
    simpanSegera();
  }
}

function ringkasSusun(h: Pick<HasilSusun, 'terjadwal' | 'total' | 'sisa'>, dihentikan = false): string {
  return `${h.terjadwal} dari ${h.total} JP tertempatkan, ${h.sisa.length} beban belum penuh${dihentikan ? ' (dihentikan lebih awal)' : ''}`;
}

function mulaiSusunChat(k: Konteks, g: Giliran, ktx: KonteksInstruksi, op: Extract<Instruksi, { op: 'susun' }>): void {
  if (kerjaJalan()) {
    st.galat = 'Penyusunan lain masih berjalan. Tunggu selesai atau hentikan dulu.';
    return;
  }
  const fokus: Fokus = ktx.kegiatanId ?? (ktx.semesterId ? fokusSemester(ktx.semesterId) : k.ui.fokus);
  const tanggal = fokus === 'auto' ? k.ui.tanggal : tanggalUntukFokus(k.p, fokus, isoLokal(new Date()));
  const t = hitungTurunan(k.p, tanggal, fokus);
  const kj: KerjaSusun = { fase: 'jalan', pid: st.aktifId, gid: g.id, fokus, tanggal, label: labelKtx(k, ktx), snapData: JSON.stringify(k.p), kemajuan: null, terbaik: null, hasil: null, dihentikan: false, beban: [], galat: '', pekerja: null, mulai: Date.now() };
  kerja.set(kunciKerja(g.id), kj);
  if (t.beban.filter((b) => !b.nonTatapMuka).length === 0) {
    kj.fase = 'galat';
    kj.galat = 'Tidak ada beban tatap muka pada sasaran ini, jadi tidak ada yang disusun.';
    return;
  }
  const { pesan, beban } = siapkanSusun(k.p, t, fokus, tanggal, { mode: op.cara ?? 'lengkapi', detik: op.detik ?? 0, lunak: op.lunak ?? true, sertakanSlot: true });
  kj.beban = beban;
  const sendiri = jalankanPekerja(pesan, {
    kemajuan: (m) => {
      kj.kemajuan = m;
      if (m.slots) {
        const nilai = (m.total - m.terjadwal) * 1000 + m.biaya;
        if (!kj.terbaik || nilai < kj.terbaik.nilai) kj.terbaik = { slots: m.slots, nilai, terjadwal: m.terjadwal, total: m.total, biaya: m.biaya };
      }
      const kotak = typeof document !== 'undefined' ? document.getElementById('aiKemajuan') : null;
      if (kotak) kotak.innerHTML = batangSusun(kj);
    },
    hasil: (h) => {
      kj.fase = 'selesai';
      kj.hasil = h;
      kj.pekerja = null;
      const ringkas = ringkasSusun(h);
      if (kj.pid === st.aktifId) st.sesi.catatHasilSusun(ringkas);
      catatRencana(kj, (r) => {
        r.susunRingkas = ringkas;
      });
      gambarAi();
      tampilkanPanelSusun();
    },
    galat: (pesanGalat) => {
      kj.fase = 'galat';
      kj.galat = pesanGalat;
      kj.pekerja = null;
      gambarAi();
      tampilkanPanelSusun();
    },
  });
  if (kj.fase === 'jalan') kj.pekerja = sendiri;
}

/** Menghentikan penyusunan dan memakai jadwal terbaik sementara. */
function hentikanSusun(kj: KerjaSusun): void {
  if (kj.fase !== 'jalan') return;
  kj.pekerja?.batal();
  kj.pekerja = null;
  const b = kj.terbaik;
  if (!b) {
    kj.fase = 'galat';
    kj.galat = 'Dihentikan sebelum ada hasil yang bisa dipakai. Jalankan lagi dan beri waktu sedikit lebih lama.';
    return;
  }
  const hitung = new Map<string, number>();
  for (const sl of b.slots) hitung.set(sl.bebanId, (hitung.get(sl.bebanId) ?? 0) + 1);
  const sisa = kj.beban
    .filter((x) => !x.nonTatapMuka)
    .flatMap((x) => {
      const kurang = x.jp - (hitung.get(x.id) ?? 0);
      return kurang > 0 ? [{ bebanId: x.id, jpSisa: kurang, alasan: 'Penyusunan dihentikan sebelum selesai; bisa ditempatkan bila dijalankan lebih lama.' }] : [];
    });
  kj.hasil = { slots: b.slots, sisa, terjadwal: b.terjadwal, total: b.total, biaya: b.biaya, peringatan: [], ms: Date.now() - kj.mulai };
  kj.dihentikan = true;
  kj.fase = 'selesai';
  const ringkas = ringkasSusun(kj.hasil, true);
  if (kj.pid === st.aktifId) st.sesi.catatHasilSusun(ringkas);
  catatRencana(kj, (r) => {
    r.susunRingkas = ringkas;
  });
}

function terapkanSusun(k: Konteks, kj: KerjaSusun): void {
  const h = kj.hasil;
  if (kj.fase !== 'selesai' || !h) return;
  if (JSON.stringify(k.p) !== kj.snapData) {
    kj.galat = 'Data berubah sejak penyusunan dimulai, jadi hasil ini tidak diterapkan. Minta asisten menyusun lagi.';
    return;
  }
  const r = k.terapkanSlotsDi(kj.fokus, kj.tanggal, h.slots);
  if (!r.ok) {
    kj.galat = r.pesan;
    return;
  }
  kj.fase = 'diterapkan';
  kj.galat = '';
  kj.snapSesudah = JSON.stringify(k.p);
  if (kj.pid === st.aktifId) st.sesi.catatSistem(`Admin MENERAPKAN hasil penyusunan otomatis: ${ringkasSusun(h, kj.dihentikan)}.`);
  catatRencana(kj, (x) => {
    x.susunStatus = 'diterapkan';
    x.susunDiputuskan = Date.now();
  });
  k.lapor(`Jadwal diterapkan: ${h.terjadwal} dari ${h.total} JP${h.sisa.length ? `, ${h.sisa.length} beban belum penuh` : ''}.`);
  if (r.baruTerdampak.length) k.lapor(`${r.baruTerdampak.join(', ')} kini punya jadwal khusus untuk kegiatan ini (tidak lagi ikut induk).`);
}

function urungkanSusun(k: Konteks, kj: KerjaSusun): void {
  if (kj.fase !== 'diterapkan' || JSON.stringify(k.p) !== kj.snapSesudah) return;
  k.urungkan();
  kj.fase = 'selesai';
  kj.snapSesudah = undefined;
  if (kj.pid === st.aktifId) st.sesi.catatSistem('Admin MENGURUNGKAN penerapan hasil penyusunan otomatis; jadwal kembali seperti sebelumnya.');
  catatRencana(kj, (x) => {
    x.susunStatus = 'diurungkan';
  });
  k.lapor('Penerapan hasil penyusunan diurungkan.');
}

const batangSusun = (kj: KerjaSusun): string => {
  const m = kj.kemajuan;
  const pct = m && m.total ? Math.round((m.terjadwal / m.total) * 100) : 0;
  const detik = ((m?.ms ?? Date.now() - kj.mulai) / 1000).toFixed(0);
  return `<div class="h-2 overflow-hidden rounded-full bg-slate-200"><div class="h-full bg-emerald-500 transition-all" style="width:${pct}%"></div></div>
    <div class="mt-1 text-xs text-slate-600">${m ? `${m.terjadwal} dari ${m.total} JP tertempatkan (${pct}%) · ${detik} dtk` : 'Memulai…'}</div>`;
};

/** Panel penyusunan di bawah kartu usulan: progres, hasil, tombol terapkan, dan urungkan. */
function panelSusun(k: Konteks, g: Giliran): string {
  const kj = kerja.get(kunciKerja(g.id));
  const r = g.rencana;
  if (!kj) {
    if (!r?.susunRingkas) return '';
    const status = r.susunStatus === 'diterapkan' ? ' · hasil diterapkan' : r.susunStatus === 'diurungkan' ? ' · penerapan diurungkan' : r.susunStatus === 'dibuang' ? ' · hasil dibuang' : '';
    return `<div class="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600"><b>Penyusunan otomatis:</b> ${esc(r.susunRingkas)}${status}</div>`;
  }
  const id = g.id;
  const tombolSekunder = 'rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50';
  const kepala = `<div class="text-sm font-bold text-slate-900">Penyusunan otomatis · ${esc(kj.label)}</div>`;
  const bungkus = (isi: string, warna = 'border-violet-200 bg-violet-50/60') => `<div data-panel-susun class="mt-2 rounded-xl border ${warna} p-3">${kepala}${isi}</div>`;
  if (kj.fase === 'jalan')
    return bungkus(`<div id="aiKemajuan" class="mt-2">${batangSusun(kj)}</div>
      <div class="mt-2 flex flex-wrap gap-2"><button class="rounded-lg bg-[#2347b8] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1c3a98]" data-aksi="aiSusunHenti" data-id="${id}">Hentikan dan pakai hasil terbaik</button><button class="${tombolSekunder}" data-aksi="aiSusunBatal" data-id="${id}">Batalkan</button></div>
      <div class="mt-1.5 text-[11px] text-slate-500">Berhenti sendiri bila sudah tidak membaik. Jendela boleh ditutup; penyusunan tetap berjalan di latar.</div>`);
  if (kj.fase === 'galat') return bungkus(`<div class="mt-1 rounded-lg bg-red-50 p-2 text-xs text-red-800">${esc(kj.galat)}</div>`, 'border-red-200 bg-red-50/40');
  if (kj.fase === 'dibuang') return bungkus('<div class="mt-1 text-xs text-slate-600">Hasil dibuang; jadwal tidak berubah.</div>', 'border-slate-200 bg-slate-50');
  const h = kj.hasil as HasilSusun;
  const rb = new Map(k.p.master.rombel.map((x) => [x.id, x.kode]));
  const mp = new Map(k.p.master.mapel.map((x) => [x.id, x.kode]));
  const gr = new Map(k.p.master.guru.map((x) => [x.id, x.kode]));
  const bebanById = new Map(kj.beban.map((x) => [x.id, x]));
  const sisaTampil = h.sisa
    .map((x) => ({ x, b: bebanById.get(x.bebanId) }))
    .filter((y) => y.b)
    .sort((a, b) => (rb.get(a.b?.rombelId ?? '') ?? '').localeCompare(rb.get(b.b?.rombelId ?? '') ?? ''));
  const sisaHtml = sisaTampil.length
    ? `<div class="mt-2 text-xs font-semibold text-slate-700">${sisaTampil.length} beban belum penuh (${h.total - h.terjadwal} JP)</div><div class="mt-1 max-h-40 overflow-auto rounded-lg border border-slate-200 bg-white"><table class="w-full text-[11px]">${sisaTampil
        .slice(0, 12)
        .map(({ x, b }) => `<tr class="border-t border-slate-100 first:border-0"><td class="px-2 py-1 font-semibold">${esc(rb.get(b?.rombelId ?? '') ?? '?')}</td><td class="px-2 py-1 font-mono">${esc(mp.get(b?.mapelId ?? '') ?? '?')}</td><td class="px-2 py-1 font-mono text-slate-500">${esc(gr.get(b?.guruId ?? '') ?? '?')}</td><td class="px-2 py-1 text-right">${x.jpSisa} JP</td></tr>`)
        .join('')}</table></div>${sisaTampil.length > 12 ? `<div class="mt-0.5 text-[11px] text-slate-500">…dan ${sisaTampil.length - 12} beban lain. Alasan lengkap ada di tab Susun Otomatis bila dijalankan dari sana.</div>` : ''}`
    : '<div class="mt-2 rounded-lg bg-emerald-50 p-2 text-xs text-emerald-800">Semua JP tertempatkan.</div>';
  const pindah = ruangDiluarPrioritas({ ...k.p, beban: kj.beban }, h.slots);
  const pindahHtml = pindah.length ? `<div class="mt-1 text-[11px] text-amber-800">⚠ ${pindah.length} beban memakai ruang di luar prioritas (${pindah.reduce((a, y) => a + y.jp, 0)} JP); periksa di Grid setelah diterapkan.</div>` : '';
  const kapasitas = h.peringatan.length ? `<div class="mt-1 rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-900">${h.peringatan.slice(0, 3).map((x) => `<div>${esc(x)}</div>`).join('')}</div>` : '';
  const ringkasan = `<div class="mt-1 text-sm"><b>${h.terjadwal} dari ${h.total} JP</b> tertempatkan${kj.dihentikan ? ' <span class="text-xs text-slate-500">(dihentikan lebih awal)</span>' : ''}</div><div class="text-[11px] text-slate-500">0 bentrok · ${(h.ms / 1000).toFixed(0)} dtk · biaya kerapian ${h.biaya} (makin kecil makin rapi)</div>`;
  if (kj.fase === 'diterapkan') {
    const bisa = JSON.stringify(k.p) === kj.snapSesudah;
    return bungkus(`${ringkasan}<div class="mt-1"><span class="lencana bg-emerald-100 text-emerald-800">✓ Jadwal diterapkan</span></div>${sisaHtml}${pindahHtml}
      <div class="mt-2 flex flex-wrap gap-2">${bisa ? `<button class="${tombolSekunder}" data-aksi="aiSusunUrungkan" data-id="${id}">↶ Urungkan penerapan</button>` : ''}<button class="${tombolSekunder}" data-aksi="aiSusunLihat" data-id="${id}">Lihat di Grid</button></div>`, 'border-emerald-200 bg-emerald-50/60');
  }
  const usang = JSON.stringify(k.p) !== kj.snapData;
  return bungkus(`${ringkasan}${kapasitas}${sisaHtml}${pindahHtml}
    ${kj.galat ? `<div class="mt-2 rounded-lg bg-red-50 p-2 text-xs text-red-800">${esc(kj.galat)}</div>` : ''}${usang ? '<div class="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">Data berubah sejak penyusunan dimulai; hasil ini sudah tidak cocok dan tidak bisa diterapkan.</div>' : ''}
    <div class="sticky bottom-0 -mx-3 -mb-3 mt-2 flex flex-wrap items-center gap-2 rounded-b-xl border-t border-violet-200 bg-violet-50 px-3 py-2"><button class="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40" data-aksi="aiSusunTerapkan" data-id="${id}" ${usang ? 'disabled' : ''}>Terapkan jadwal ini</button><button class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" data-aksi="aiSusunBuang" data-id="${id}">Buang</button><span class="text-[11px] text-slate-500">Belum ada yang berubah sebelum Anda menerapkan.</span></div>`);
}

function bukaPercakapan(id: string): void {
  if (st.kirim) return;
  tandaiUbah();
  const c = st.daftar.find((x) => x.id === id && x.dihapus === undefined);
  if (!c) return;
  st.aktifId = c.id;
  st.sesi.pulihkan(c);
  st.layar = 'chat';
  st.teks = '';
  st.galat = '';
  st.terakhir = null;
  st.gulirBawah = true;
  simpanSegera();
  gambarAi();
}

function percakapanBaruAktif(): void {
  if (st.kirim) return;
  tandaiUbah();
  const kosong = st.daftar.find((c) => c.dihapus === undefined && c.tampil.length === 0);
  const c = kosong ?? percakapanBaru(Date.now(), { mode: 'ikut' });
  if (!kosong) st.daftar.unshift(c);
  st.aktifId = c.id;
  st.sesi.reset();
  st.layar = 'chat';
  st.teks = '';
  st.galat = '';
  st.terakhir = null;
  st.gulirBawah = true;
  simpanSegera();
  gambarAi();
  if (!layarKecil()) document.getElementById('aiTeks')?.focus();
}

export function klikAi(k: Konteks, el: HTMLElement): boolean {
  const a = el.dataset.aksi ?? '';
  if (!a.startsWith('ai')) return false;
  const lakukan = (f: () => Promise<void>) => {
    void f().catch((e) => {
      st.galat = e instanceof Error ? e.message : String(e);
      gambarAi();
    });
  };
  switch (a) {
    case 'aiBalon':
      bukaJendela(true);
      return true;
    case 'aiTutupJendela':
      tandaiUbah();
      bukaJendela(false);
      return true;
    case 'aiLebar':
      st.lebar = !st.lebar;
      simpanPrefJendela();
      gambarAi();
      return true;
    case 'aiBuat':
      lakukan(async () => {
        const pin = nilai('aiPin');
        const kunci = nilai('aiKunciBaru').trim();
        if (pin.length < PIN_MINIMAL) throw new Error(`PIN minimal ${PIN_MINIMAL} karakter.`);
        if (pin !== nilai('aiPin2')) throw new Error('Kedua PIN tidak sama.');
        if (kunci.length < 20) throw new Error('Kunci API terlalu pendek.');
        const hari = Number(nilai('aiIngat'));
        if (PILIHAN_INGAT_HARI.includes(hari as (typeof PILIHAN_INGAT_HARI)[number])) await aturIngat(hari);
        await buatBrankas(pin, { kunci: [{ id: `k${Date.now().toString(36)}`, label: nilai('aiLabel').trim() || 'Kunci 1', nilai: kunci, aktif: true }] });
        await simpanPengaturan();
        selaraskan();
        st.info = 'Brankas dibuat. Kunci tersimpan terenkripsi di peramban ini.';
        st.galat = '';
        gambarAi();
      });
      return true;
    case 'aiBuka':
      lakukan(async () => bukaDengan(k, nilai('aiPin')));
      return true;
    case 'aiKunci':
      kunciSesi();
      selaraskan();
      st.layar = 'chat';
      st.info = 'Brankas dikunci dan ingatan PIN di perangkat ini dihapus.';
      gambarAi();
      return true;
    case 'aiHapusBrankas':
      if (!confirm('Brankas, semua kunci API, dan token GitHub di peramban ini akan dihapus. Lanjutkan?')) return true;
      lakukan(async () => {
        await hapusBrankasSesi();
        selaraskan();
        st.layar = 'chat';
        st.info = 'Brankas dihapus.';
        gambarAi();
      });
      return true;
    case 'aiLayar':
    case 'aiSub': {
      const tujuan = el.dataset.layar ?? el.dataset.sub;
      st.layar = tujuan === 'pengaturan' ? 'pengaturan' : tujuan === 'riwayat' ? 'riwayat' : 'chat';
      st.info = '';
      st.gulirBawah = st.layar === 'chat';
      gambarAi();
      return true;
    }
    case 'aiContoh':
      st.teks = el.dataset.teks ?? '';
      gambarAi();
      document.getElementById('aiTeks')?.focus();
      return true;
    case 'aiBaru':
      percakapanBaruAktif();
      return true;
    case 'aiKirim':
      st.teks = nilai('aiTeks') || st.teks;
      void kirim(k);
      return true;
    case 'aiUlang': {
      const teks = st.sesi.batalkanGagal();
      if (teks) void kirim(k, teks);
      return true;
    }
    case 'aiPilih': {
      const id = Number(el.dataset.id);
      const i = Number(el.dataset.i);
      const dik = st.dikecualikan.get(id) ?? new Set<number>();
      if ((el as HTMLInputElement).checked) dik.delete(i);
      else dik.add(i);
      st.dikecualikan.set(id, dik);
      gambarAi();
      return true;
    }
    case 'aiTerapkan':
    case 'aiTolak': {
      const g = st.sesi.tampil.find((x) => x.id === Number(el.dataset.id));
      if (!g) return true;
      if (a === 'aiTerapkan') terapkan(k, g);
      else {
        st.sesi.catatDitolak(g);
        st.dikecualikan.delete(g.id);
        tandaiUbah();
        gambarAi();
      }
      return true;
    }
    case 'aiUrungkan': {
      const t = st.terakhir;
      const g = t ? st.sesi.tampil.find((x) => x.id === t.id) : undefined;
      if (!t || !g || JSON.stringify(k.p) !== t.snap) return true;
      k.urungkan();
      st.sesi.catatDiurungkan(g);
      st.terakhir = null;
      tandaiUbah();
      k.lapor('Perubahan dari asisten diurungkan.');
      gambarAi();
      return true;
    }
    case 'aiSusunHenti':
    case 'aiSusunBatal':
    case 'aiSusunTerapkan':
    case 'aiSusunBuang':
    case 'aiSusunUrungkan':
    case 'aiSusunLihat': {
      const kj = kerja.get(kunciKerja(Number(el.dataset.id)));
      if (!kj) return true;
      if (a === 'aiSusunHenti') {
        hentikanSusun(kj);
        queueMicrotask(tampilkanPanelSusun);
      }
      else if (a === 'aiSusunBatal') {
        kj.pekerja?.batal();
        kj.pekerja = null;
        kj.fase = 'dibuang';
        catatRencana(kj, (r) => {
          r.susunRingkas = 'dibatalkan sebelum selesai';
          r.susunStatus = 'dibuang';
        });
      } else if (a === 'aiSusunTerapkan') terapkanSusun(k, kj);
      else if (a === 'aiSusunBuang') {
        kj.fase = 'dibuang';
        catatRencana(kj, (r) => {
          r.susunStatus = 'dibuang';
        });
        if (kj.pid === st.aktifId) st.sesi.catatSistem('Admin MEMBUANG hasil penyusunan otomatis; jadwal tidak berubah.');
      } else if (a === 'aiSusunUrungkan') urungkanSusun(k, kj);
      else {
        bukaSimpul(k, kj.fokus, 'grid');
        if (layarKecil()) bukaJendela(false);
      }
      gambarAi();
      return true;
    }
    case 'aiBukaPercakapan':
      bukaPercakapan(el.dataset.id ?? '');
      return true;
    case 'aiGantiNama': {
      const c = st.daftar.find((x) => x.id === el.dataset.id);
      if (!c) return true;
      const baru = prompt('Nama percakapan', judulTampil(c));
      if (baru === null) return true;
      c.judul = baru.trim();
      c.diubah = Date.now();
      simpanSegera();
      gambarAi();
      return true;
    }
    case 'aiHapusPercakapan': {
      const c = st.daftar.find((x) => x.id === el.dataset.id);
      if (!c || !confirm(`Hapus percakapan “${judulTampil(c)}”? Penghapusan ikut tersinkron ke GitHub.`)) return true;
      st.daftar = st.daftar.map((x) => (x.id === c.id ? batuNisan(c) : x));
      if (st.aktifId === c.id) {
        const lain = daftarAktif(st.daftar).find(adaIsi);
        if (lain) {
          st.aktifId = lain.id;
          st.sesi.pulihkan(lain);
        } else {
          const baru = percakapanBaru();
          st.daftar.unshift(baru);
          st.aktifId = baru.id;
          st.sesi.reset();
        }
      }
      simpanSegera();
      gambarAi();
      return true;
    }
    case 'aiSinkron':
      void jalankanSinkron(true);
      return true;
    case 'aiSimpanToken':
      lakukan(async () => {
        const t = nilai('aiToken').trim();
        if (t.length < 20) throw new Error('Token GitHub terlalu pendek.');
        vs.token = t;
        await simpanBrankas();
        st.info = 'Token GitHub disimpan di brankas.';
        st.galat = '';
        gambarAi();
        void jalankanSinkron(false);
      });
      return true;
    case 'aiTambahKunci':
      lakukan(async () => {
        const kunci = nilai('aiKunciBaru').trim();
        if (kunci.length < 20) throw new Error('Kunci API terlalu pendek.');
        if (vs.kunci.some((x) => x.nilai === kunci)) throw new Error('Kunci itu sudah ada.');
        vs.kunci = [...vs.kunci, { id: `k${Date.now().toString(36)}`, label: nilai('aiLabel').trim() || `Kunci ${vs.kunci.length + 1}`, nilai: kunci, aktif: true }];
        await simpanBrankas();
        st.galat = '';
        gambarAi();
      });
      return true;
    case 'aiHapusKunci':
      if (!confirm('Hapus kunci ini dari brankas?')) return true;
      lakukan(async () => {
        vs.kunci = vs.kunci.filter((x) => x.id !== el.dataset.id);
        await simpanBrankas();
        gambarAi();
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
        gambarAi();
      });
      return true;
    case 'aiUji':
      lakukan(async () => {
        const x = vs.kunci.find((y) => y.id === el.dataset.id);
        if (!x) return;
        st.uji[x.id] = 'menguji…';
        gambarAi();
        const h = await klienGemini().daftarModel(x.nilai);
        st.uji[x.id] = h.ok ? `sah (${h.model.length} model)` : `gagal: ${h.pesan.slice(0, 80)}`;
        if (h.ok && st.rotasi) delete st.rotasi.status.tidakSah[x.id];
        gambarAi();
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
        gambarAi();
      });
      return true;
    case 'aiBawaan':
      lakukan(async () => {
        st.pengaturan = { ...PENGATURAN_BAWAAN, cadangan: [...PENGATURAN_BAWAAN.cadangan] };
        await simpanPengaturan();
        gambarAi();
      });
      return true;
    case 'aiResetStatus':
      lakukan(async () => {
        if (st.rotasi) st.rotasi.status = statusKosong();
        await tulisAi('status', statusKosong());
        gambarAi();
      });
      return true;
    case 'aiGantiPin':
      lakukan(async () => {
        const baru = nilai('aiPinBaru');
        if (baru.length < PIN_MINIMAL) throw new Error(`PIN minimal ${PIN_MINIMAL} karakter.`);
        await gantiPin(baru);
        st.info = 'PIN diganti.';
        st.galat = '';
        gambarAi();
      });
      return true;
  }
  return false;
}

/** Perubahan isian (pilihan sasaran, lama PIN diingat, sinkron otomatis). */
export function ubahAi(k: Konteks, el: HTMLInputElement & HTMLSelectElement): boolean {
  switch (el.id) {
    case 'aiSasaran': {
      const v = el.value;
      const s: SasaranAi = v.startsWith('keg:') ? { mode: 'tetap', kegiatanId: v.slice(4) } : v.startsWith('sem:') ? { mode: 'tetap', semesterId: v.slice(4) } : { mode: 'ikut' };
      aktif().sasaran = s;
      tandaiUbah();
      if (aktif().tampil.length === 0) simpanSegera();
      gambarAi();
      void k;
      return true;
    }
    case 'aiIngat':
      if (vs.terbuka) {
        const hari = Number(el.value);
        void aturIngat(hari).then(() => {
          st.info = hari > 0 ? `PIN diingat ${hari} hari di perangkat ini.` : 'PIN tidak lagi diingat; diminta setiap peramban dibuka.';
          gambarAi();
        });
      }
      return true;
    case 'aiOtomatis':
      st.sinkron = { ...st.sinkron, otomatis: el.checked };
      void tulisAi('sinkronAi', { otomatis: el.checked });
      if (el.checked) jadwalkanSinkron();
      return true;
  }
  return false;
}

/** Ketikan di kolom pesan dan pencarian disimpan tanpa menggambar ulang jendela. */
export function masukanAi(el: HTMLInputElement): boolean {
  if (el.id === 'aiTeks') {
    st.teks = el.value;
    aturTinggi(el as unknown as HTMLTextAreaElement);
    return true;
  }
  if (el.id === 'aiCari') {
    st.cari = el.value;
    gambarAi();
    return true;
  }
  return false;
}

/** Ctrl+Enter pada kolom pesan mengirim; Enter pada kolom PIN membuka brankas; Escape menutup jendela. */
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
      gambarAi();
    });
    return true;
  }
  if (e.key === 'Escape' && st.buka && akar?.contains(t)) {
    bukaJendela(false);
    return true;
  }
  return false;
}

/** Memasang balon dan jendela di halaman admin (satu kali) dan memuat riwayat serta brankas. */
export function pasangAi(k: Konteks): void {
  if (akar) return;
  kRef = k;
  const pref = bacaPrefJendela();
  st.buka = pref.buka;
  st.lebar = pref.lebar;
  akar = document.createElement('div');
  akar.id = 'aiAkar';
  akar.className = 'pointer-events-none';
  document.body.appendChild(akar);
  akar.addEventListener('click', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-aksi]');
    if (el) klikAi(k, el);
  });
  akar.addEventListener('change', (e) => void ubahAi(k, e.target as HTMLInputElement & HTMLSelectElement));
  akar.addEventListener('input', (e) => void masukanAi(e.target as HTMLInputElement));
  akar.addEventListener('keydown', (e) => void tombolAi(k, e));
  if (typeof visualViewport !== 'undefined' && visualViewport) {
    visualViewport.addEventListener('resize', aturViewport);
    visualViewport.addEventListener('scroll', aturViewport);
  }
  gambarAi();
  void muat(k);
}
