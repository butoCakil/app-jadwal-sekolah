import type { Aturan, Beban, Kegiatan, Proyek, Semester } from '../model/tipe';
import { NAMA_HARI } from '../model/tipe';
import { kategoriMapel } from '../model/kategoriMapel';
import { DAFTAR_OP_KALENDER, terapkanKalender, uraiKalender, type OpKalender } from './kalenderAi';
import { bebanInduk, bebanKegiatan, bebanUntukDiubah, hapusBebanKegiatan, jadikanTerdampak, modelWarisan, semesterKegiatan, tandaBebanInduk, daftarSemester } from '../model/simpul';

/**
 * Instruksi terstruktur: satu-satunya cara AI mengubah data. AI tidak pernah menulis slot jadwal; ia hanya mengusulkan daftar
 * instruksi ini (memakai KODE guru, mapel, rombel, ruang). Kode di sini menerjemahkan kode menjadi id, memvalidasi semuanya,
 * lalu menerapkannya dengan fungsi yang sama dengan yang dipakai tab Beban (salin-saat-diubah pada kegiatan). Bila satu saja
 * instruksi gagal, tidak ada yang diterapkan.
 */

/** Pilihan beban menurut kode. Beberapa nilai dalam satu bidang = salah satu; antarbidang = semuanya harus cocok. Wajib minimal satu bidang. */
export interface Sasaran {
  rombel?: string[];
  tingkat?: string[];
  jurusan?: string[];
  mapel?: string[];
  /** kategori mapel, mis. "Normatif", "Adaptif", "Jurusan TE" */
  kategori?: string[];
  guru?: string[];
}

export type Instruksi =
  | { op: 'ubahJp'; sasaran: Sasaran; jp?: number; kali?: number; tambah?: number }
  | { op: 'hapusBeban'; sasaran: Sasaran }
  | { op: 'tambahBeban'; rombel: string[]; mapel: string; guru: string; jp: number }
  | { op: 'ruangBeban'; sasaran: Sasaran; prioritas?: string[]; terlarang?: string[] }
  | { op: 'guruTidakTersedia'; guru: string; hari: string[]; jam?: number[] }
  | { op: 'ruangTerlarang'; rombel?: string; jurusan?: string; ruang: string[] }
  | { op: 'kunciRuang'; ruang: string[]; hari?: string[]; mulai?: string; selesai?: string }
  | { op: 'susun'; cara?: 'nol' | 'lengkapi' | 'induk'; detik?: number; lunak?: boolean }
  | OpKalender;

export const DAFTAR_OP = ['ubahJp', 'hapusBeban', 'tambahBeban', 'ruangBeban', 'guruTidakTersedia', 'ruangTerlarang', 'kunciRuang', 'susun', ...DAFTAR_OP_KALENDER] as const;

/** Di mana instruksi diterapkan: kegiatan (bila diisi) atau induk semester. */
export interface KonteksInstruksi {
  kegiatanId?: string;
  semesterId?: string;
}

export const MAKS_JP_BEBAN = 20;

// ----------------------------------------------------------------------------------------------------- penguraian

const adaObjek = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const daftarTeks = (x: unknown): string[] | null => (Array.isArray(x) && x.every((v) => typeof v === 'string' && v.trim() !== '') ? x.map((v) => (v as string).trim()) : null);
const daftarAngka = (x: unknown): number[] | null => (Array.isArray(x) && x.every((v) => typeof v === 'number' && Number.isInteger(v)) ? (x as number[]) : null);

function uraiSasaran(x: unknown, tempat: string, galat: string[]): Sasaran | null {
  if (!adaObjek(x)) {
    galat.push(`${tempat}: sasaran harus berupa objek.`);
    return null;
  }
  const s: Sasaran = {};
  for (const k of ['rombel', 'tingkat', 'jurusan', 'mapel', 'kategori', 'guru'] as const) {
    if (x[k] === undefined) continue;
    const d = daftarTeks(x[k]);
    if (!d) {
      galat.push(`${tempat}: sasaran.${k} harus daftar teks (kode).`);
      return null;
    }
    if (d.length) s[k] = d;
  }
  for (const k of Object.keys(x)) if (!['rombel', 'tingkat', 'jurusan', 'mapel', 'kategori', 'guru'].includes(k)) galat.push(`${tempat}: bidang sasaran tidak dikenal "${k}".`);
  if (Object.keys(s).length === 0) {
    galat.push(`${tempat}: sasaran kosong (wajib menyebut minimal satu bidang: rombel, tingkat, jurusan, mapel, kategori, atau guru).`);
    return null;
  }
  return s;
}

/** Mengurai instruksi mentah (hasil JSON AI) menjadi instruksi bertipe; bentuk yang salah dilaporkan, tidak ditebak. */
export function uraiInstruksi(mentah: unknown): { instruksi: Instruksi[]; galat: string[] } {
  const galat: string[] = [];
  const hasil: Instruksi[] = [];
  if (!Array.isArray(mentah)) return { instruksi: [], galat: ['"instruksi" harus berupa daftar.'] };
  mentah.forEach((x, i) => {
    const t = `Instruksi ${i + 1}`;
    if (!adaObjek(x) || typeof x.op !== 'string') {
      galat.push(`${t}: bentuk tidak sah (wajib objek dengan "op").`);
      return;
    }
    const tolakBidang = (boleh: string[]) => {
      for (const k of Object.keys(x)) if (k !== 'op' && k !== 'alasan' && !boleh.includes(k)) galat.push(`${t} (${x.op}): bidang tidak dikenal "${k}".`);
    };
    switch (x.op) {
      case 'ubahJp': {
        tolakBidang(['sasaran', 'jp', 'kali', 'tambah']);
        const s = uraiSasaran(x.sasaran, `${t} (ubahJp)`, galat);
        const dipakai = (['jp', 'kali', 'tambah'] as const).filter((k) => x[k] !== undefined);
        if (dipakai.length !== 1) galat.push(`${t} (ubahJp): isi tepat satu dari jp, kali, atau tambah.`);
        else if (typeof x[dipakai[0] as string] !== 'number' || !Number.isFinite(x[dipakai[0] as string] as number)) galat.push(`${t} (ubahJp): ${dipakai[0]} harus angka.`);
        else if (dipakai[0] !== 'kali' && !Number.isInteger(x[dipakai[0] as string])) galat.push(`${t} (ubahJp): ${dipakai[0]} harus bilangan bulat.`);
        if (s && dipakai.length === 1) hasil.push({ op: 'ubahJp', sasaran: s, ...Object.fromEntries(dipakai.map((k) => [k, x[k]])) });
        break;
      }
      case 'hapusBeban': {
        tolakBidang(['sasaran']);
        const s = uraiSasaran(x.sasaran, `${t} (hapusBeban)`, galat);
        if (s) hasil.push({ op: 'hapusBeban', sasaran: s });
        break;
      }
      case 'tambahBeban': {
        tolakBidang(['rombel', 'mapel', 'guru', 'jp']);
        const rombel = daftarTeks(x.rombel);
        if (!rombel?.length) galat.push(`${t} (tambahBeban): rombel harus daftar kode, minimal satu.`);
        if (typeof x.mapel !== 'string' || !x.mapel.trim()) galat.push(`${t} (tambahBeban): mapel wajib (kode).`);
        if (typeof x.guru !== 'string' || !x.guru.trim()) galat.push(`${t} (tambahBeban): guru wajib (kode).`);
        if (typeof x.jp !== 'number' || !Number.isInteger(x.jp)) galat.push(`${t} (tambahBeban): jp harus bilangan bulat.`);
        if (rombel?.length && typeof x.mapel === 'string' && x.mapel.trim() && typeof x.guru === 'string' && x.guru.trim() && typeof x.jp === 'number' && Number.isInteger(x.jp))
          hasil.push({ op: 'tambahBeban', rombel, mapel: x.mapel.trim(), guru: x.guru.trim(), jp: x.jp });
        break;
      }
      case 'ruangBeban': {
        tolakBidang(['sasaran', 'prioritas', 'terlarang']);
        const s = uraiSasaran(x.sasaran, `${t} (ruangBeban)`, galat);
        const prioritas = x.prioritas === undefined ? undefined : daftarTeks(x.prioritas);
        const terlarang = x.terlarang === undefined ? undefined : daftarTeks(x.terlarang);
        if (prioritas === null) galat.push(`${t} (ruangBeban): prioritas harus daftar kode ruang.`);
        if (terlarang === null) galat.push(`${t} (ruangBeban): terlarang harus daftar kode ruang.`);
        if (x.prioritas === undefined && x.terlarang === undefined) galat.push(`${t} (ruangBeban): isi prioritas dan/atau terlarang.`);
        if (s && prioritas !== null && terlarang !== null && (prioritas || terlarang)) hasil.push({ op: 'ruangBeban', sasaran: s, ...(prioritas ? { prioritas } : {}), ...(terlarang ? { terlarang } : {}) });
        break;
      }
      case 'guruTidakTersedia': {
        tolakBidang(['guru', 'hari', 'jam']);
        const hari = daftarTeks(x.hari);
        const jam = x.jam === undefined ? undefined : daftarAngka(x.jam);
        if (typeof x.guru !== 'string' || !x.guru.trim()) galat.push(`${t} (guruTidakTersedia): guru wajib (kode).`);
        if (!hari?.length) galat.push(`${t} (guruTidakTersedia): hari harus daftar nama hari, minimal satu.`);
        if (jam === null) galat.push(`${t} (guruTidakTersedia): jam harus daftar bilangan bulat (nomor jam pelajaran).`);
        if (typeof x.guru === 'string' && x.guru.trim() && hari?.length && jam !== null) hasil.push({ op: 'guruTidakTersedia', guru: x.guru.trim(), hari, ...(jam?.length ? { jam } : {}) });
        break;
      }
      case 'ruangTerlarang': {
        tolakBidang(['rombel', 'jurusan', 'ruang']);
        const ruang = daftarTeks(x.ruang);
        if (!ruang?.length) galat.push(`${t} (ruangTerlarang): ruang harus daftar kode, minimal satu.`);
        const ada = [x.rombel, x.jurusan].filter((v) => v !== undefined);
        if (ada.length !== 1 || typeof ada[0] !== 'string' || !(ada[0] as string).trim()) galat.push(`${t} (ruangTerlarang): isi tepat satu dari rombel atau jurusan (kode).`);
        else if (ruang?.length) hasil.push({ op: 'ruangTerlarang', ...(typeof x.rombel === 'string' ? { rombel: x.rombel.trim() } : { jurusan: (x.jurusan as string).trim() }), ruang });
        break;
      }
      case 'kunciRuang': {
        tolakBidang(['ruang', 'hari', 'mulai', 'selesai']);
        const ruang = daftarTeks(x.ruang);
        const hari = x.hari === undefined ? undefined : daftarTeks(x.hari);
        if (!ruang?.length) galat.push(`${t} (kunciRuang): ruang harus daftar kode, minimal satu.`);
        if (hari === null) galat.push(`${t} (kunciRuang): hari harus daftar nama hari.`);
        const jam = /^\d{1,2}:\d{2}$/;
        if ((x.mulai === undefined) !== (x.selesai === undefined)) galat.push(`${t} (kunciRuang): mulai dan selesai harus diisi bersama.`);
        else if (x.mulai !== undefined && !(typeof x.mulai === 'string' && typeof x.selesai === 'string' && jam.test(x.mulai) && jam.test(x.selesai))) galat.push(`${t} (kunciRuang): mulai dan selesai berbentuk "HH:MM".`);
        else if (ruang?.length && hari !== null) hasil.push({ op: 'kunciRuang', ruang, ...(hari?.length ? { hari } : {}), ...(x.mulai !== undefined ? { mulai: x.mulai as string, selesai: x.selesai as string } : {}) });
        break;
      }
      case 'susun': {
        tolakBidang(['cara', 'detik', 'lunak']);
        if (x.cara !== undefined && x.cara !== 'nol' && x.cara !== 'lengkapi' && x.cara !== 'induk') galat.push(`${t} (susun): cara harus nol, lengkapi, atau induk.`);
        else if (x.detik !== undefined && !(typeof x.detik === 'number' && x.detik >= 1 && x.detik <= 120)) galat.push(`${t} (susun): detik harus 1 sampai 120.`);
        else if (x.lunak !== undefined && typeof x.lunak !== 'boolean') galat.push(`${t} (susun): lunak harus true atau false.`);
        else hasil.push({ op: 'susun', ...(x.cara ? { cara: x.cara } : {}), ...(typeof x.detik === 'number' ? { detik: x.detik } : {}), ...(typeof x.lunak === 'boolean' ? { lunak: x.lunak } : {}) });
        break;
      }
      case 'tambahKegiatan':
      case 'ubahKegiatan':
      case 'geserKegiatan':
      case 'hapusKegiatan': {
        const k = uraiKalender(x, t, galat);
        if (k) hasil.push(k);
        break;
      }
      default:
        galat.push(`${t}: op tidak dikenal "${x.op}" (yang ada: ${DAFTAR_OP.join(', ')}).`);
    }
  });
  return { instruksi: hasil, galat };
}

/** Balasan AI: penjelasan, instruksi, pertanyaan balik, dan hal yang diminta tetapi tidak didukung. */
export interface BalasanAi {
  jawaban: string;
  instruksi: Instruksi[];
  pertanyaan?: string;
  tidakBisa: string[];
  galat: string[];
}

/** Mengurai teks balasan AI (JSON, boleh dibungkus pagar kode). Teks yang bukan JSON dianggap jawaban biasa tanpa instruksi. */
export function uraiBalasan(teks: string): BalasanAi {
  let isi = teks.trim();
  const pagar = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(isi);
  if (pagar) isi = (pagar[1] ?? '').trim();
  let j: unknown;
  try {
    j = JSON.parse(isi);
  } catch {
    return { jawaban: teks.trim(), instruksi: [], tidakBisa: [], galat: ['Balasan AI bukan JSON; ditampilkan apa adanya dan tidak ada yang diterapkan.'] };
  }
  if (!adaObjek(j)) return { jawaban: teks.trim(), instruksi: [], tidakBisa: [], galat: ['Balasan AI bukan objek JSON.'] };
  const galat: string[] = [];
  const jawaban = typeof j.jawaban === 'string' ? j.jawaban.trim() : '';
  let instruksi: Instruksi[] = [];
  if (j.instruksi !== undefined) {
    const u = uraiInstruksi(j.instruksi);
    instruksi = u.instruksi;
    galat.push(...u.galat);
  }
  const tidakBisa = j.tidakBisa === undefined ? [] : (daftarTeks(j.tidakBisa) ?? (galat.push('"tidakBisa" harus daftar teks.'), []));
  const pertanyaan = typeof j.pertanyaan === 'string' && j.pertanyaan.trim() ? j.pertanyaan.trim() : undefined;
  return { jawaban, instruksi, ...(pertanyaan ? { pertanyaan } : {}), tidakBisa, galat };
}

// ------------------------------------------------------------------------------------------------- pencocokan kode

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

interface Peta {
  guru: Map<string, string>;
  mapel: Map<string, string>;
  rombel: Map<string, string>;
  ruang: Map<string, string>;
}
function petaKode(p: Proyek): Peta {
  const bikin = <T extends { id: string; kode: string }>(l: T[]) => new Map(l.map((x) => [norm(x.kode), x.id]));
  return { guru: bikin(p.master.guru), mapel: bikin(p.master.mapel), rombel: bikin(p.master.rombel), ruang: bikin(p.master.ruang) };
}

function idDari(peta: Map<string, string>, kode: string, jenis: string, galat: string[]): string | undefined {
  const id = peta.get(norm(kode));
  if (!id) galat.push(`Kode ${jenis} tidak dikenal: "${kode}".`);
  return id;
}

/** Kegiatan dan semester sasaran instruksi. */
export function bacaKonteks(p: Proyek, ktx: KonteksInstruksi): { g?: Kegiatan; sem?: Semester; galat?: string } {
  if (ktx.kegiatanId) {
    const g = p.kalender.find((x) => x.id === ktx.kegiatanId && !x.agenda);
    if (!g) return { galat: `Kegiatan "${ktx.kegiatanId}" tidak ditemukan.` };
    return { g, sem: semesterKegiatan(p, g) };
  }
  const sem = daftarSemester(p).find((s) => s.id === ktx.semesterId) ?? daftarSemester(p)[0];
  return sem ? { sem } : {};
}

/** Beban yang berlaku pada konteks (kegiatan: beban kegiatan; induk: beban induk semester). Rombel yang tidak aktif dibuang. */
export function bebanKonteks(p: Proyek, ktx: KonteksInstruksi): Beban[] {
  const { g, sem } = bacaKonteks(p, ktx);
  const tidakAktif = new Set(g ? g.rombelTidakAktif : (sem?.rombelTidakAktif ?? []));
  return (g ? bebanKegiatan(p, g) : bebanInduk(p, sem)).filter((b) => !tidakAktif.has(b.rombelId));
}

/** Beban yang cocok dengan sasaran. Kode yang tidak dikenal atau sasaran yang tidak cocok dengan beban mana pun dilaporkan sebagai galat. */
export function cocokkanBeban(p: Proyek, ktx: KonteksInstruksi, s: Sasaran): { beban: Beban[]; galat: string[] } {
  const galat: string[] = [];
  const peta = petaKode(p);
  const rombelIds = s.rombel ? new Set(s.rombel.map((k) => idDari(peta.rombel, k, 'rombel', galat)).filter((x): x is string => !!x)) : undefined;
  const mapelIds = s.mapel ? new Set(s.mapel.map((k) => idDari(peta.mapel, k, 'mapel', galat)).filter((x): x is string => !!x)) : undefined;
  const guruIds = s.guru ? new Set(s.guru.map((k) => idDari(peta.guru, k, 'guru', galat)).filter((x): x is string => !!x)) : undefined;
  const tingkat = s.tingkat?.map((t) => t.trim().toUpperCase());
  for (const t of tingkat ?? []) if (!['X', 'XI', 'XII'].includes(t)) galat.push(`Tingkat tidak dikenal: "${t}" (X, XI, atau XII).`);
  const jurusan = s.jurusan ? new Set(s.jurusan.map((j) => norm(j))) : undefined;
  for (const j of s.jurusan ?? []) if (!p.master.rombel.some((r) => norm(r.jurusan) === norm(j))) galat.push(`Jurusan tidak dikenal: "${j}".`);
  const kategori = s.kategori ? new Set(s.kategori.map((k) => norm(k))) : undefined;
  if (kategori) {
    const ada = new Set(p.master.mapel.map((m) => norm(kategoriMapel(m, p.master.mapel))));
    for (const k of s.kategori ?? []) if (!ada.has(norm(k))) galat.push(`Kategori mapel tidak dikenal: "${k}".`);
  }
  if (galat.length) return { beban: [], galat };
  const rombel = new Map(p.master.rombel.map((r) => [r.id, r]));
  const mapel = new Map(p.master.mapel.map((m) => [m.id, m]));
  const cocok = bebanKonteks(p, ktx).filter((b) => {
    const r = rombel.get(b.rombelId);
    const m = mapel.get(b.mapelId);
    if (rombelIds && !rombelIds.has(b.rombelId)) return false;
    if (mapelIds && !mapelIds.has(b.mapelId)) return false;
    if (guruIds && !guruIds.has(b.guruId) && !b.timGuruIds.some((x) => guruIds.has(x))) return false;
    if (tingkat && !(r && tingkat.includes(r.tingkat))) return false;
    if (jurusan && !(r && jurusan.has(norm(r.jurusan)))) return false;
    if (kategori && !(m && kategori.has(norm(kategoriMapel(m, p.master.mapel))))) return false;
    return true;
  });
  if (cocok.length === 0) galat.push('Tidak ada beban yang cocok dengan sasaran itu pada periode ini.');
  return { beban: cocok, galat };
}

// ------------------------------------------------------------------------------------------------------ penerapan

export interface TindakanSusun {
  cara?: 'nol' | 'lengkapi' | 'induk';
  detik?: number;
  lunak?: boolean;
}

export type JenisPerubahan = 'tambah' | 'ubah' | 'hapus' | 'geser';

export interface BarisPerubahan {
  /** ringkas, mis. "XI TE 1 · PRE (ABC): 4 → 8 JP" */
  teks: string;
  /** sifat perubahan, untuk penandaan di tinjauan */
  jenis?: JenisPerubahan;
  /** nomor urut instruksi asal (mulai 0), supaya tinjauan bisa dikelompokkan dan diterapkan sebagian */
  instruksi?: number;
}

const JENIS_OP: Partial<Record<Instruksi['op'], JenisPerubahan>> = {
  ubahJp: 'ubah',
  hapusBeban: 'hapus',
  tambahBeban: 'tambah',
  ruangBeban: 'ubah',
  guruTidakTersedia: 'tambah',
  ruangTerlarang: 'tambah',
  kunciRuang: 'tambah',
  tambahKegiatan: 'tambah',
  ubahKegiatan: 'ubah',
  geserKegiatan: 'geser',
  hapusKegiatan: 'hapus',
};

export interface HasilTerapkan {
  ok: boolean;
  galat: string[];
  peringatan: string[];
  perubahan: BarisPerubahan[];
  susun?: TindakanSusun;
}

const kodeBeban = (p: Proyek, b: Beban) => {
  const r = p.master.rombel.find((x) => x.id === b.rombelId)?.kode ?? '?';
  const m = p.master.mapel.find((x) => x.id === b.mapelId)?.kode ?? '?';
  const g = p.master.guru.find((x) => x.id === b.guruId)?.kode ?? '?';
  return `${r} · ${m} (${g})`;
};
const kodeRuang = (p: Proyek, ids: string[]) => (ids.length ? ids.map((i) => p.master.ruang.find((r) => r.id === i)?.kode ?? '?').join(', ') : '—');

function hariKeIndeks(nama: string, jumlah: number): number {
  const i = NAMA_HARI.findIndex((h) => norm(h).replace(/['’]/g, '') === norm(nama).replace(/['’]/g, ''));
  return i >= 0 && i < jumlah ? i : -1;
}

const idAturan = () => `ar${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

/**
 * Menerapkan instruksi pada `p` (diubah di tempat, seperti pemanggilan k.ubah). Semua-atau-tidak-sama-sekali: bila ada galat,
 * `p` dikembalikan ke keadaan semula dan hasilnya `ok: false`.
 */
export function terapkanInstruksi(p: Proyek, ktx: KonteksInstruksi, daftar: Instruksi[]): HasilTerapkan {
  const cadangan = structuredClone(p);
  const hasil: HasilTerapkan = { ok: true, galat: [], peringatan: [], perubahan: [] };
  const { g, sem, galat: galatKtx } = bacaKonteks(p, ktx);
  if (galatKtx) return { ...hasil, ok: false, galat: [galatKtx] };
  const warisan = !!g && modelWarisan(g);
  const hariKerja = p.polaReguler.length;
  const peta = petaKode(p);
  const slotLama = new Set<string>();
  let adaUbahJp = false;

  const ubahSatu = (id: string, fn: (b: Beban) => void) => {
    const nid = bebanUntukDiubah(p, g, id);
    const b = p.beban.find((x) => x.id === nid);
    if (b) fn(b);
    return nid;
  };
  const kegiatanSaja = (t: string) => {
    if (!g) hasil.galat.push(`${t}: hanya berlaku pada kegiatan (kunci ruang kegiatan). Pilih kegiatan dulu.`);
    return !!g;
  };
  const indukSaja = (t: string) => {
    if (g) hasil.galat.push(`${t}: aturan ini berlaku untuk semua periode (belum ada aturan khusus per kegiatan), jadi hanya bisa diterapkan pada jadwal induk semester.`);
    return !g;
  };

  const proses = (ins: Instruksi, idx: number): void => {
    const t = `Instruksi ${idx + 1} (${ins.op})`;
    switch (ins.op) {
      case 'ubahJp': {
        const c = cocokkanBeban(p, ktx, ins.sasaran);
        if (c.galat.length) return void hasil.galat.push(...c.galat.map((x) => `${t}: ${x}`));
        for (const b of c.beban) {
          const baru = ins.jp !== undefined ? ins.jp : ins.kali !== undefined ? Math.round(b.jp * ins.kali) : b.jp + (ins.tambah ?? 0);
          if (!Number.isInteger(baru) || baru < 0 || baru > MAKS_JP_BEBAN) {
            hasil.galat.push(`${t}: ${kodeBeban(p, b)} akan menjadi ${baru} JP (harus bilangan bulat 0 sampai ${MAKS_JP_BEBAN}).`);
            continue;
          }
          if (baru === b.jp) continue;
          const label = kodeBeban(p, b);
          const lama = b.jp;
          const tandaRombel = g && warisan && !g.rombelTerdampak?.includes(b.rombelId);
          const nid = ubahSatu(b.id, (x) => {
            x.jp = baru;
            if (x.pola && x.pola.reduce((a, n) => a + n, 0) !== baru) {
              delete x.pola;
              hasil.peringatan.push(`${label}: pola pertemuan dihapus karena tidak cocok dengan ${baru} JP.`);
            }
          });
          hasil.perubahan.push({ teks: `${label}: ${lama} → ${baru} JP${tandaRombel ? ` (kelas ${p.master.rombel.find((r) => r.id === b.rombelId)?.kode ?? '?'} menjadi kelas terdampak kegiatan)` : ''}` });
          adaUbahJp = true;
          for (const v of p.versi) for (const s of v.slots) if (s.bebanId === b.id || s.bebanId === nid) slotLama.add(s.id);
        }
        break;
      }
      case 'hapusBeban': {
        const c = cocokkanBeban(p, ktx, ins.sasaran);
        if (c.galat.length) return void hasil.galat.push(...c.galat.map((x) => `${t}: ${x}`));
        for (const b of c.beban) {
          hasil.perubahan.push({ teks: `${kodeBeban(p, b)}: dihapus (${b.jp} JP)` });
          if (g && warisan) hapusBebanKegiatan(p, g, b.id);
          else {
            p.beban = p.beban.filter((x) => x.id !== b.id);
            for (const v of p.versi) v.slots = v.slots.filter((s) => s.bebanId !== b.id);
          }
        }
        break;
      }
      case 'tambahBeban': {
        const galatLokal: string[] = [];
        const mapelId = idDari(peta.mapel, ins.mapel, 'mapel', galatLokal);
        const guruId = idDari(peta.guru, ins.guru, 'guru', galatLokal);
        const rombelIds = ins.rombel.map((k) => idDari(peta.rombel, k, 'rombel', galatLokal));
        if (ins.jp < 0 || ins.jp > MAKS_JP_BEBAN) galatLokal.push(`jp harus 0 sampai ${MAKS_JP_BEBAN}.`);
        if (galatLokal.length || !mapelId || !guruId) return void hasil.galat.push(...galatLokal.map((x) => `${t}: ${x}`));
        const tdk = new Set(g ? g.rombelTidakAktif : (sem?.rombelTidakAktif ?? []));
        for (const rombelId of rombelIds) {
          if (!rombelId) continue;
          const kodeR = p.master.rombel.find((r) => r.id === rombelId)?.kode ?? '?';
          if (tdk.has(rombelId)) {
            hasil.galat.push(`${t}: kelas ${kodeR} tidak aktif pada periode ini.`);
            continue;
          }
          const versiId = g?.versiId && (warisan || p.beban.some((b) => b.versiId)) ? g.versiId : g ? undefined : tandaBebanInduk(p, sem);
          if (g && warisan) jadikanTerdampak(p, g, rombelId);
          const b: Beban = { id: `b${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`, rombelId, mapelId, guruId, jp: ins.jp, timGuruIds: [], ruangPrioritas: [], ruangTerlarang: [], ...(versiId ? { versiId } : {}) };
          p.beban.push(b);
          hasil.perubahan.push({ teks: `${kodeBeban(p, b)}: beban baru ${ins.jp} JP` });
        }
        break;
      }
      case 'ruangBeban': {
        const c = cocokkanBeban(p, ktx, ins.sasaran);
        const gl: string[] = [...c.galat];
        const prioritas = ins.prioritas?.map((k) => idDari(peta.ruang, k, 'ruang', gl));
        const terlarang = ins.terlarang?.map((k) => idDari(peta.ruang, k, 'ruang', gl));
        if (gl.length) return void hasil.galat.push(...gl.map((x) => `${t}: ${x}`));
        const pr = prioritas?.filter((x): x is string => !!x);
        const tl = terlarang?.filter((x): x is string => !!x);
        if (pr && tl && pr.some((x) => tl.includes(x))) return void hasil.galat.push(`${t}: ruang yang sama tidak boleh menjadi prioritas sekaligus terlarang.`);
        for (const b of c.beban) {
          const label = kodeBeban(p, b);
          const bagian: string[] = [];
          if (pr) bagian.push(`prioritas ${kodeRuang(p, b.ruangPrioritas)} → ${kodeRuang(p, pr)}`);
          if (tl) bagian.push(`terlarang ${kodeRuang(p, b.ruangTerlarang)} → ${kodeRuang(p, tl)}`);
          ubahSatu(b.id, (x) => {
            if (pr) x.ruangPrioritas = [...pr];
            if (tl) x.ruangTerlarang = [...tl];
          });
          hasil.perubahan.push({ teks: `${label}: ${bagian.join('; ')}` });
        }
        break;
      }
      case 'guruTidakTersedia': {
        if (!indukSaja(t)) return;
        const gl: string[] = [];
        const guruId = idDari(peta.guru, ins.guru, 'guru', gl);
        const hari = ins.hari.map((h) => {
          const i = hariKeIndeks(h, hariKerja);
          if (i < 0) gl.push(`Hari tidak dikenal atau di luar hari kerja: "${h}".`);
          return i;
        });
        for (const j of ins.jam ?? []) if (j < 1 || j > 14) gl.push(`Nomor jam harus 1 sampai 14 (nomor jam pelajaran), bukan ${j}.`);
        if (gl.length || !guruId) return void hasil.galat.push(...gl.map((x) => `${t}: ${x}`));
        for (const h of hari) {
          const a: Aturan = { id: idAturan(), jenis: 'guruTidakTersedia', guruId, hari: h, jam: ins.jam ? [...ins.jam] : [] };
          p.aturan.push(a);
          hasil.perubahan.push({ teks: `Guru ${ins.guru} tidak tersedia ${NAMA_HARI[h]}${ins.jam?.length ? ` jam ${ins.jam.join(', ')}` : ' sehari penuh'}` });
        }
        break;
      }
      case 'ruangTerlarang': {
        if (!indukSaja(t)) return;
        const gl: string[] = [];
        const ruangIds = ins.ruang.map((k) => idDari(peta.ruang, k, 'ruang', gl)).filter((x): x is string => !!x);
        let rombelId: string | undefined;
        if (ins.rombel) rombelId = idDari(peta.rombel, ins.rombel, 'rombel', gl);
        if (ins.jurusan && !p.master.rombel.some((r) => norm(r.jurusan) === norm(ins.jurusan as string))) gl.push(`Jurusan tidak dikenal: "${ins.jurusan}".`);
        if (gl.length) return void hasil.galat.push(...gl.map((x) => `${t}: ${x}`));
        const jur = ins.jurusan ? (p.master.rombel.find((r) => norm(r.jurusan) === norm(ins.jurusan as string))?.jurusan as string) : undefined;
        p.aturan.push({ id: idAturan(), jenis: 'ruangTerlarang', ...(rombelId ? { rombelId } : { jurusan: jur as string }), ruangIds });
        hasil.perubahan.push({ teks: `Ruang terlarang untuk ${ins.rombel ?? `jurusan ${ins.jurusan}`}: ${ins.ruang.join(', ')}` });
        break;
      }
      case 'kunciRuang': {
        if (!kegiatanSaja(t) || !g) return;
        const gl: string[] = [];
        const ruangIds = ins.ruang.map((k) => idDari(peta.ruang, k, 'ruang', gl)).filter((x): x is string => !!x);
        const hari = ins.hari?.map((h) => {
          const i = hariKeIndeks(h, hariKerja);
          if (i < 0) gl.push(`Hari tidak dikenal atau di luar hari kerja: "${h}".`);
          return i;
        });
        if (gl.length) return void hasil.galat.push(...gl.map((x) => `${t}: ${x}`));
        g.ruangKunci = [...(g.ruangKunci ?? []), { id: `kr${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`, ruangIds, ...(hari?.length ? { hari } : {}), ...(ins.mulai ? { mulai: ins.mulai, selesai: ins.selesai } : {}) }];
        hasil.perubahan.push({ teks: `Ruang dikunci selama ${g.nama}: ${ins.ruang.join(', ')}${ins.hari?.length ? ` (${ins.hari.join(', ')})` : ''}${ins.mulai ? ` ${ins.mulai}–${ins.selesai}` : ''}` });
        break;
      }
      case 'tambahKegiatan':
      case 'ubahKegiatan':
      case 'geserKegiatan':
      case 'hapusKegiatan':
        terapkanKalender(p, ins, t, hasil);
        break;
      case 'susun':
        if (ins.cara === 'induk' && !(g && warisan)) return void hasil.galat.push(`${t}: cara "induk" (mulai dari jadwal induk) hanya untuk kegiatan; pada jadwal induk pakai "nol" atau "lengkapi".`);
        hasil.susun = { ...(ins.cara ? { cara: ins.cara } : {}), ...(ins.detik ? { detik: ins.detik } : {}), ...(ins.lunak !== undefined ? { lunak: ins.lunak } : {}) };
        break;
    }
  };
  daftar.forEach((ins, idx) => {
    const awal = hasil.perubahan.length;
    proses(ins, idx);
    for (let i = awal; i < hasil.perubahan.length; i++) {
      const b = hasil.perubahan[i] as BarisPerubahan;
      b.instruksi = idx;
      b.jenis ??= JENIS_OP[ins.op];
    }
  });

  if (adaUbahJp && slotLama.size) hasil.peringatan.push('Slot jadwal yang sudah ada tidak diubah oleh perubahan JP. Jalankan Susun Otomatis (Lengkapi atau Mulai dari jadwal induk) agar jadwal mengikuti JP baru.');
  if (hasil.galat.length) {
    // semua-atau-tidak-sama-sekali: kembalikan keadaan semula
    for (const k of Object.keys(p) as (keyof Proyek)[]) delete (p as unknown as Record<string, unknown>)[k];
    Object.assign(p, cadangan);
    return { ...hasil, ok: false, perubahan: [] };
  }
  return hasil;
}

/** Pratinjau: menerapkan instruksi pada salinan, `p` tidak berubah. `proyek` hanya ada bila berhasil. */
export function rencanakan(p: Proyek, ktx: KonteksInstruksi, daftar: Instruksi[]): HasilTerapkan & { proyek?: Proyek } {
  const salinan = structuredClone(p);
  const h = terapkanInstruksi(salinan, ktx, daftar);
  return h.ok ? { ...h, proyek: salinan } : h;
}
