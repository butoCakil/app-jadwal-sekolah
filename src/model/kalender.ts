import type { Kegiatan, PolaMinggu, Proyek, Rombel, Skema, VersiJadwal } from './tipe';
import { kapasitasKbm } from './skema';

/** Hari dalam pekan dari tanggal ISO: 0 = Senin .. 6 = Minggu. Memakai UTC agar tidak terpengaruh zona waktu. */
export function hariPekan(tanggal: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(tanggal);
  if (!m) throw new Error(`Tanggal tidak valid: "${tanggal}" (harus YYYY-MM-DD)`);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (d.getUTCMonth() !== Number(m[2]) - 1) throw new Error(`Tanggal tidak ada: "${tanggal}"`);
  return (d.getUTCDay() + 6) % 7;
}

export function dalamRentang(tanggal: string, mulai: string, selesai: string): boolean {
  return tanggal >= mulai && tanggal <= selesai; // string ISO bisa dibandingkan leksikal
}

export type SumberPola = 'manual' | 'kegiatan' | 'reguler';

export interface PolaTanggal {
  pola: PolaMinggu;
  sumber: SumberPola;
  kegiatanId?: string;
}

/**
 * Pola yang berlaku pada suatu tanggal. Urutan prioritas:
 * 1. penggantian manual admin (jika tanggal masuk rentangnya, atau tanpa rentang),
 * 2. kegiatan kalender yang punya pola dan mencakup tanggal itu. Bila beberapa kegiatan
 *    tumpang tindih, dipakai yang `mulai`-nya paling akhir (paling spesifik); jika sama,
 *    yang tertulis paling belakang di daftar,
 * 3. pola reguler.
 */
export function polaUntukTanggal(tanggal: string, p: Pick<Proyek, 'polaReguler' | 'penggantiManual' | 'kalender'>): PolaTanggal {
  const m = p.penggantiManual;
  if (m && (!m.mulai || tanggal >= m.mulai) && (!m.selesai || tanggal <= m.selesai)) {
    return { pola: m.pola, sumber: 'manual' };
  }
  let terpilih: Kegiatan | undefined;
  for (const k of p.kalender) {
    if (!k.pola || !dalamRentang(tanggal, k.mulai, k.selesai)) continue;
    if (!terpilih || k.mulai >= terpilih.mulai) terpilih = k;
  }
  if (terpilih?.pola) return { pola: terpilih.pola, sumber: 'kegiatan', kegiatanId: terpilih.id };
  return { pola: p.polaReguler, sumber: 'reguler' };
}

export interface SkemaHari {
  /** null = tidak ada KBM (libur atau akhir pekan) */
  skemaId: string | null;
  alasan: 'normal' | 'libur' | 'akhirPekan';
  sumber?: SumberPola;
  kegiatanLibur?: string;
}

/** Skema yang dipakai pada satu tanggal; libur dan akhir pekan menghasilkan `skemaId: null`. */
export function skemaUntukTanggal(tanggal: string, p: Pick<Proyek, 'polaReguler' | 'penggantiManual' | 'kalender'>): SkemaHari {
  const h = hariPekan(tanggal);
  if (h > 4) return { skemaId: null, alasan: 'akhirPekan' };
  const libur = p.kalender.find((k) => k.jenis === 'libur' && dalamRentang(tanggal, k.mulai, k.selesai));
  if (libur) return { skemaId: null, alasan: 'libur', kegiatanLibur: libur.nama };
  const pt = polaUntukTanggal(tanggal, p);
  const id = pt.pola[h];
  return { skemaId: id ?? null, alasan: 'normal', sumber: pt.sumber };
}

/** Rombel yang aktif pada tanggal tertentu (tidak masuk `rombelTidakAktif` pada kegiatan yang berlaku). */
export function rombelAktif(tanggal: string, kalender: Kegiatan[], semua: Rombel[]): Rombel[] {
  const tidakAktif = new Set<string>();
  for (const k of kalender) {
    if (dalamRentang(tanggal, k.mulai, k.selesai)) k.rombelTidakAktif.forEach((r) => tidakAktif.add(r));
  }
  return semua.filter((r) => !tidakAktif.has(r.id));
}

export interface KapasitasPekan {
  perHari: number[];
  total: number;
}

/** Jumlah jam pelajaran (KBM) per hari dan total pekan untuk suatu pola. Skema tak dikenal dihitung 0. */
export function kapasitasPola(pola: PolaMinggu, skema: Skema[]): KapasitasPekan {
  const byId = new Map(skema.map((s) => [s.id, s]));
  const perHari = pola.map((id) => {
    const s = byId.get(id);
    return s ? kapasitasKbm(s) : 0;
  });
  return { perHari, total: perHari.reduce((a, b) => a + b, 0) };
}

export function cekPola(pola: PolaMinggu, skema: Skema[]): string[] {
  const ada = new Set(skema.map((s) => s.id));
  const galat: string[] = [];
  if (pola.length !== 5) galat.push('Pola harus berisi 5 hari (Senin–Jumat).');
  pola.forEach((id, i) => {
    if (!ada.has(id)) galat.push(`Hari ke-${i + 1}: skema "${id}" tidak ada.`);
  });
  return galat;
}

export function cekKegiatan(k: Kegiatan): string[] {
  const galat: string[] = [];
  try {
    hariPekan(k.mulai);
    hariPekan(k.selesai);
    if (k.selesai < k.mulai) galat.push('Tanggal selesai lebih awal dari tanggal mulai.');
  } catch (e) {
    galat.push((e as Error).message);
  }
  return galat;
}

/** Selisih kebutuhan JP rombel terhadap kapasitas pola (hanya untuk rombel yang `jpButuh`-nya terisi). */
export interface SelisihKapasitas {
  rombelId: string;
  butuh: number;
  kapasitas: number;
  /** butuh − kapasitas; > 0 berarti kurang slot */
  selisih: number;
}

export function selisihKapasitas(rombel: Rombel[], kapasitas: KapasitasPekan): SelisihKapasitas[] {
  return rombel
    .filter((r) => typeof r.jpButuh === 'number')
    .map((r) => ({
      rombelId: r.id,
      butuh: r.jpButuh as number,
      kapasitas: kapasitas.total,
      selisih: (r.jpButuh as number) - kapasitas.total,
    }))
    .filter((s) => s.selisih !== 0);
}

/** Id rombel yang tidak aktif pada tanggal (gabungan semua kegiatan yang mencakup tanggal itu, mis. PKL). */
export function rombelTidakAktifIds(tanggal: string, kalender: Kegiatan[]): Set<string> {
  const hasil = new Set<string>();
  for (const k of kalender) if (dalamRentang(tanggal, k.mulai, k.selesai)) k.rombelTidakAktif.forEach((r) => hasil.add(r));
  return hasil;
}

/**
 * Periode yang berlaku pada tanggal: kegiatan bukan libur yang mencakup tanggal itu; bila beberapa, yang `mulai`-nya paling akhir
 * (paling spesifik), dan bila sama yang tertulis paling belakang.
 */
export function periodeUntukTanggal(tanggal: string, kalender: Kegiatan[]): Kegiatan | undefined {
  let terpilih: Kegiatan | undefined;
  for (const k of kalender) {
    if (k.jenis === 'libur' || !dalamRentang(tanggal, k.mulai, k.selesai)) continue;
    if (!terpilih || k.mulai >= terpilih.mulai) terpilih = k;
  }
  return terpilih;
}

/** Versi reguler: yang berjenis reguler, selain itu versi pertama. */
export function versiReguler(p: Pick<Proyek, 'versi'>): VersiJadwal | undefined {
  return p.versi.find((v) => v.jenis === 'reguler') ?? p.versi[0];
}

/** Versi jadwal yang berlaku pada tanggal: versi milik kegiatan terspesifik yang mencakup tanggal dan punya `versiId`, selain itu reguler. */
export function versiUntukTanggal(tanggal: string, p: Pick<Proyek, 'versi' | 'kalender'>): VersiJadwal | undefined {
  let terpilih: Kegiatan | undefined;
  for (const k of p.kalender) {
    if (!k.versiId || !dalamRentang(tanggal, k.mulai, k.selesai)) continue;
    if (!terpilih || k.mulai >= terpilih.mulai) terpilih = k;
  }
  return (terpilih && p.versi.find((v) => v.id === terpilih.versiId)) ?? versiReguler(p);
}
