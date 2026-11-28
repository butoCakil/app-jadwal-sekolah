import type { PesanAi } from './klien';
import type { Giliran } from './sesi';
import type { PengaturanAi } from './rotasi';

/**
 * Riwayat percakapan Asisten AI. Banyak percakapan, masing-masing menyimpan sasarannya, memori sesi (riwayat teks), dan
 * giliran yang tampil (termasuk usulan beserta statusnya). Dapat digabung antar perangkat per percakapan: yang terakhir diubah
 * menang, penghapusan dicatat sebagai batu nisan supaya tidak hidup lagi saat digabung. Kunci API dan token tidak pernah
 * menjadi bagian dari berkas ini.
 */

export interface SasaranAi {
  /** 'ikut' = mengikuti sasaran yang sedang dilihat di aplikasi; 'tetap' = kegiatan atau semester tertentu */
  mode: 'ikut' | 'tetap';
  kegiatanId?: string;
  semesterId?: string;
}

export interface Percakapan {
  id: string;
  judul: string;
  dibuat: number;
  /** waktu perubahan terakhir (ms); untuk batu nisan = waktu dihapus */
  diubah: number;
  /** ada = percakapan dihapus (batu nisan); isi dikosongkan */
  dihapus?: number;
  sasaran: SasaranAi;
  riwayat: PesanAi[];
  tampil: Giliran[];
  urut: number;
  /** catatan sistem yang belum terkirim ke AI (mis. keputusan terapkan/tolak) */
  catatan?: string[];
}

export const FORMAT_AI = 'jadwal-smkn-bansari-ai';
export const MAKS_PERCAKAPAN = 150;
export const MAKS_GILIRAN = 300;
/** batu nisan disimpan selama ini sebelum dibuang (ms) */
export const UMUR_BATU_NISAN = 90 * 86_400_000;

export interface PengaturanBertanda {
  nilai: PengaturanAi;
  diubah: number;
}

export interface BerkasAi {
  format: typeof FORMAT_AI;
  versi: 1;
  disimpan: string;
  pengaturan?: PengaturanBertanda;
  percakapan: Percakapan[];
}

export const idPercakapan = (): string => `p${Date.now().toString(36)}${Math.floor(Math.random() * 46656).toString(36)}`;

export function percakapanBaru(sekarang = Date.now(), sasaran: SasaranAi = { mode: 'ikut' }): Percakapan {
  return { id: idPercakapan(), judul: '', dibuat: sekarang, diubah: sekarang, sasaran, riwayat: [], tampil: [], urut: 0 };
}

/** Judul dari pesan admin pertama (dipotong); kosong bila belum ada pesan. */
export function judulDari(c: Pick<Percakapan, 'tampil'>): string {
  const t = c.tampil.find((g) => g.peran === 'admin')?.teks.replace(/\s+/g, ' ').trim() ?? '';
  return t.length > 56 ? `${t.slice(0, 55).trimEnd()}…` : t;
}

export const judulTampil = (c: Percakapan): string => c.judul.trim() || judulDari(c) || 'Percakapan baru';

export const jumlahMenunggu = (c: Percakapan): number => c.tampil.filter((g) => g.rencana?.status === 'menunggu').length;

/** Percakapan yang masih berisi (bukan batu nisan, ada pesan), terbaru lebih dulu. */
export const daftarAktif = (semua: Percakapan[]): Percakapan[] => semua.filter((c) => c.dihapus === undefined).sort((a, b) => b.diubah - a.diubah);

export function batuNisan(c: Percakapan, sekarang = Date.now()): Percakapan {
  return { id: c.id, judul: '', dibuat: c.dibuat, diubah: sekarang, dihapus: sekarang, sasaran: { mode: 'ikut' }, riwayat: [], tampil: [], urut: 0 };
}

/** Menggabung dua daftar: per id, yang `diubah`-nya lebih baru menang (sama = `a`). Batu nisan lama dan kelebihan percakapan dibuang. */
export function gabungPercakapan(a: Percakapan[], b: Percakapan[], sekarang = Date.now()): Percakapan[] {
  const peta = new Map<string, Percakapan>();
  for (const c of a) peta.set(c.id, c);
  for (const c of b) {
    const ada = peta.get(c.id);
    if (!ada || c.diubah > ada.diubah) peta.set(c.id, c);
  }
  const semua = [...peta.values()].filter((c) => c.dihapus === undefined || sekarang - c.dihapus < UMUR_BATU_NISAN);
  const aktif = semua.filter((c) => c.dihapus === undefined).sort((x, y) => y.diubah - x.diubah);
  const lebih = new Set(aktif.slice(MAKS_PERCAKAPAN).map((c) => c.id));
  return semua.filter((c) => !lebih.has(c.id)).sort((x, y) => y.diubah - x.diubah || x.id.localeCompare(y.id));
}

export function gabungPengaturan(a: PengaturanBertanda | undefined, b: PengaturanBertanda | undefined): PengaturanBertanda | undefined {
  if (!a) return b;
  if (!b) return a;
  return b.diubah > a.diubah ? b : a;
}

// ------------------------------------------------------------------------------------------------ berkas

const adaObjek = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

export function sahPercakapan(x: unknown): x is Percakapan {
  if (!adaObjek(x)) return false;
  if (typeof x.id !== 'string' || !x.id || typeof x.diubah !== 'number' || typeof x.dibuat !== 'number') return false;
  if (x.dihapus !== undefined) return typeof x.dihapus === 'number';
  return typeof x.judul === 'string' && adaObjek(x.sasaran) && (x.sasaran.mode === 'ikut' || x.sasaran.mode === 'tetap') && Array.isArray(x.riwayat) && Array.isArray(x.tampil) && typeof x.urut === 'number';
}

export function sahPengaturan(x: unknown): x is PengaturanAi {
  return adaObjek(x) && typeof x.model === 'string' && Array.isArray(x.cadangan) && x.cadangan.every((m) => typeof m === 'string') && typeof x.rpm === 'number' && typeof x.rpd === 'number';
}

export function buatBerkasAi(percakapan: Percakapan[], pengaturan: PengaturanBertanda | undefined, sekarang = new Date()): string {
  const berkas: BerkasAi = { format: FORMAT_AI, versi: 1, disimpan: sekarang.toISOString(), ...(pengaturan ? { pengaturan } : {}), percakapan: percakapan.map((c) => (c.tampil.length > MAKS_GILIRAN ? { ...c, tampil: c.tampil.slice(-MAKS_GILIRAN) } : c)) };
  return `${JSON.stringify(berkas, null, 1)}\n`;
}

/** Mengurai berkas; bentuk yang salah ditolak seluruhnya (tidak ditebak). Butir percakapan yang rusak dilewati dan dihitung. */
export function uraiBerkasAi(teks: string): { ok: true; percakapan: Percakapan[]; pengaturan?: PengaturanBertanda; dilewati: number } | { ok: false; galat: string } {
  let j: unknown;
  try {
    j = JSON.parse(teks);
  } catch {
    return { ok: false, galat: 'Berkas AI di GitHub bukan JSON yang sah.' };
  }
  if (!adaObjek(j) || j.format !== FORMAT_AI) return { ok: false, galat: 'Berkas AI di GitHub bukan berkas riwayat asisten (format tidak dikenal).' };
  if (j.versi !== 1) return { ok: false, galat: `Versi berkas AI tidak dikenal (${String(j.versi)}).` };
  if (!Array.isArray(j.percakapan)) return { ok: false, galat: 'Berkas AI tidak memuat daftar percakapan.' };
  const percakapan = j.percakapan.filter(sahPercakapan);
  let pengaturan: PengaturanBertanda | undefined;
  if (adaObjek(j.pengaturan) && typeof j.pengaturan.diubah === 'number' && sahPengaturan(j.pengaturan.nilai)) pengaturan = { nilai: j.pengaturan.nilai, diubah: j.pengaturan.diubah };
  return { ok: true, percakapan, ...(pengaturan ? { pengaturan } : {}), dilewati: j.percakapan.length - percakapan.length };
}

/** Isi yang menentukan perbedaan (tanpa waktu simpan), untuk memutuskan perlu tidaknya commit. */
export const kunciIsi = (percakapan: Percakapan[], pengaturan: PengaturanBertanda | undefined): string => JSON.stringify([[...percakapan].sort((a, b) => a.id.localeCompare(b.id)), pengaturan ?? null]);
