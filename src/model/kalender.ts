import type { Kegiatan, KeteranganTingkat, PolaBernama, PolaMinggu, Proyek, Rombel, Skema, VersiJadwal } from './tipe';
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

/** Kegiatan berlaku pada tanggal (agenda referensi tidak pernah berlaku untuk jadwal): di dalam rentang dan (bila `hariBerlaku` diisi) jatuh pada salah satu hari itu. */
export function berlakuPada(k: Pick<Kegiatan, 'mulai' | 'selesai' | 'hariBerlaku' | 'agenda'>, tanggal: string): boolean {
  if (k.agenda || !dalamRentang(tanggal, k.mulai, k.selesai)) return false;
  return !k.hariBerlaku?.length || k.hariBerlaku.includes(hariPekan(tanggal));
}

/**
 * Agenda libur untuk semua kelas ikut meniadakan KBM pada tanggalnya. Tanggal merah yang siswanya tetap berangkat
 * (mis. upacara 17 Agustus) tidak berjenis libur, sehingga jadwal tetap berjalan.
 */
export function liburUmum(k: Pick<Kegiatan, 'jenis' | 'agenda' | 'untuk'>): boolean {
  return !!k.agenda && k.jenis === 'libur' && (!k.untuk || k.untuk.trim().toLowerCase() === 'semua');
}

export type SumberPola = 'manual' | 'kegiatan' | 'reguler';

type DataPola = Pick<Proyek, 'polaReguler' | 'penggantiManual' | 'kalender'> & Partial<Pick<Proyek, 'polaRegulerId' | 'polaRegulerNama' | 'polaLain'>>;

export const ID_POLA_DEFAULT = 'reguler';
export const NAMA_POLA_DEFAULT = 'Skema reguler';

/** Jumlah hari kerja per pekan (5 atau 6) = panjang pola default. */
export const jumlahHariKerja = (p: Pick<Proyek, 'polaReguler'>): number => p.polaReguler.length;

export interface InfoPola extends PolaBernama {
  /** true = pola default */
  default: boolean;
}

/** Semua pola mingguan: default di urutan pertama, lalu pola lain. */
export function daftarPola(p: DataPola): InfoPola[] {
  return [
    { id: p.polaRegulerId ?? ID_POLA_DEFAULT, nama: p.polaRegulerNama ?? NAMA_POLA_DEFAULT, pola: p.polaReguler, default: true },
    ...(p.polaLain ?? []).map((x) => ({ ...x, default: false })),
  ];
}

export function polaDariId(p: DataPola, id: string | undefined): PolaMinggu | undefined {
  if (!id) return undefined;
  return daftarPola(p).find((x) => x.id === id)?.pola;
}

/** Nama kegiatan/ketentuan yang memakai pola ini (pola yang dipakai tidak boleh dihapus). */
export function pemakaiPola(p: DataPola, id: string): string[] {
  const hasil: string[] = [];
  if ((p.polaRegulerId ?? ID_POLA_DEFAULT) === id) hasil.push('skema mingguan default');
  for (const k of p.kalender) if (k.polaId === id) hasil.push(k.nama);
  return hasil;
}

const idBaru = (p: Pick<Proyek, 'polaLain' | 'polaRegulerId'>): string => {
  const ada = new Set([p.polaRegulerId ?? ID_POLA_DEFAULT, ...(p.polaLain ?? []).map((x) => x.id)]);
  let n = (p.polaLain?.length ?? 0) + 1;
  while (ada.has(`pola_${n}`)) n++;
  return `pola_${n}`;
};

/** Menambah pola baru: `dari` = id pola yang disalin, kosong = semua hari memakai skema pertama. Mengembalikan id pola baru. */
export function tambahPola(p: Proyek, nama: string, dari?: string): string {
  const sumber = dari ? polaDariId(p, dari) : undefined;
  const awal = (p.skema[0]?.id ?? '') as string;
  const id = idBaru(p);
  (p.polaLain ??= []).push({ id, nama, pola: sumber ? [...sumber] : p.polaReguler.map(() => awal) });
  return id;
}

/** Menjadikan pola ini default: isi dan identitas pola default lama pindah ke daftar pola lain. */
export function jadikanDefault(p: Proyek, id: string): void {
  const idLama = p.polaRegulerId ?? ID_POLA_DEFAULT;
  if (id === idLama) return;
  const lain = p.polaLain ?? [];
  const i = lain.findIndex((x) => x.id === id);
  const baru = lain[i];
  if (!baru) return;
  lain[i] = { id: idLama, nama: p.polaRegulerNama ?? NAMA_POLA_DEFAULT, pola: p.polaReguler };
  p.polaReguler = baru.pola;
  p.polaRegulerId = baru.id;
  p.polaRegulerNama = baru.nama;
  p.polaLain = lain;
}

/** Mengganti jumlah hari kerja (5 atau 6) pada semua pola; hari baru memakai skema pertama. */
export function ubahJumlahHari(p: Proyek, n: number): void {
  const awal = (p.skema[0]?.id ?? '') as string;
  const sesuaikan = (pola: PolaMinggu): PolaMinggu => (pola.length >= n ? pola.slice(0, n) : [...pola, ...Array.from({ length: n - pola.length }, () => awal)]);
  p.polaReguler = sesuaikan(p.polaReguler);
  for (const x of p.polaLain ?? []) x.pola = sesuaikan(x.pola);
  if (p.penggantiManual) p.penggantiManual.pola = sesuaikan(p.penggantiManual.pola);
  for (const k of p.kalender) if (k.pola) k.pola = sesuaikan(k.pola);
}

const KET = {
  PKL: { kode: 'PKL', nama: 'Praktik Kerja Lapangan' },
  UKK: { kode: 'UKK', nama: 'Uji Kompetensi Keahlian' },
  ASAS: { kode: 'ASAS', nama: 'Asesmen Sumatif Akhir Semester' },
  ASAJ: { kode: 'ASAJ', nama: 'Asesmen Sumatif Akhir Jenjang' },
};
/** Alasan tidak aktif data sekolah bawaan (menurut nama kegiatan dan keterangan Benny: kelas XI PKL sepanjang Gasal). Hanya mengisi yang belum ada. */
const KETERANGAN_KEGIATAN: Record<string, KeteranganTingkat> = {
  'k-asaj': { XII: KET.ASAJ },
  'k-ukk': { XII: KET.UKK },
  'k-asas': { X: KET.ASAS, XII: KET.ASAJ },
  'k-pkl-xii-gasal': { XII: KET.PKL },
  'k-pkl-xii-genap': { XII: KET.PKL },
};
const KETERANGAN_SEMESTER: Record<string, KeteranganTingkat> = { gasal: { XI: KET.PKL } };

function lengkapiKeterangan(p: Proyek): void {
  for (const k of p.kalender) {
    const t = KETERANGAN_KEGIATAN[k.id];
    if (t && !k.keteranganTingkat) k.keteranganTingkat = structuredClone(t);
  }
  for (const s of p.semesters ?? []) {
    const t = KETERANGAN_SEMESTER[s.id];
    if (t && !s.keteranganTingkat) s.keteranganTingkat = structuredClone(t);
  }
}

/** Memindahkan pola tertanam pada kegiatan (format lama) ke daftar pola bernama. Data tanpa format lama tidak diubah. */
export function migrasiPola<T extends Proyek>(p: T): T {
  for (const k of p.kalender) {
    if (!k.pola) continue;
    const sama = daftarPola(p).find((x) => x.pola.join('|') === (k.pola as PolaMinggu).join('|'));
    if (sama) k.polaId = sama.id;
    else {
      k.polaId = tambahPola(p, `Pola ${k.nama}`);
      (p.polaLain as PolaBernama[]).find((x) => x.id === k.polaId)!.pola = [...k.pola];
    }
    delete k.pola;
  }
  // satu semester format lama -> daftar semester
  if (p.semester && !p.semesters) {
    p.semesters = [{ ...p.semester, id: p.semester.id ?? 'sem1', ...(versiReguler(p) ? { versiId: versiReguler(p)!.id } : {}) }];
  }
  delete p.semester;
  lengkapiKeterangan(p);
  return p;
}

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
export function polaUntukTanggal(tanggal: string, p: DataPola): PolaTanggal {
  const m = p.penggantiManual;
  if (m && (!m.mulai || tanggal >= m.mulai) && (!m.selesai || tanggal <= m.selesai)) {
    return { pola: m.pola, sumber: 'manual' };
  }
  let terpilih: Kegiatan | undefined;
  let polaTerpilih: PolaMinggu | undefined;
  for (const k of p.kalender) {
    const pk = k.polaId ? polaDariId(p, k.polaId) : k.pola;
    if (!pk || !berlakuPada(k, tanggal)) continue;
    if (!terpilih || k.mulai >= terpilih.mulai) {
      terpilih = k;
      polaTerpilih = pk;
    }
  }
  if (terpilih && polaTerpilih) return { pola: polaTerpilih, sumber: 'kegiatan', kegiatanId: terpilih.id };
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
export function skemaUntukTanggal(tanggal: string, p: DataPola): SkemaHari {
  const h = hariPekan(tanggal);
  if (h >= p.polaReguler.length) return { skemaId: null, alasan: 'akhirPekan' };
  const libur = p.kalender.find((k) => k.jenis === 'libur' && (berlakuPada(k, tanggal) || (liburUmum(k) && dalamRentang(tanggal, k.mulai, k.selesai))));
  if (libur) return { skemaId: null, alasan: 'libur', kegiatanLibur: libur.nama };
  const pt = polaUntukTanggal(tanggal, p);
  const id = pt.pola[h];
  return { skemaId: id ?? null, alasan: 'normal', sumber: pt.sumber };
}

/** Rombel yang aktif pada tanggal tertentu (tidak masuk `rombelTidakAktif` pada periode yang berlaku). */
export function rombelAktif(tanggal: string, kalender: Kegiatan[], semua: Rombel[], semester?: { rombelTidakAktif: string[] }): Rombel[] {
  const tidakAktif = rombelTidakAktifIds(tanggal, kalender, semester);
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

export function cekPola(pola: PolaMinggu, skema: Skema[], jumlah?: number): string[] {
  const ada = new Set(skema.map((s) => s.id));
  const galat: string[] = [];
  if (jumlah !== undefined ? pola.length !== jumlah : pola.length !== 5 && pola.length !== 6) galat.push(`Skema mingguan harus berisi ${jumlah ?? '5 atau 6'} hari kerja.`);
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

/**
 * Id rombel yang tidak aktif pada tanggal. Mengikuti periode terspesifik yang mencakup tanggal itu (sama seperti pola dan versi jadwal):
 * periode yang berada di dalam periode lain menggantikan daftarnya, bukan menggabungkannya. Contoh: ASAS (30 Nov-4 Des) di dalam
 * "TKA lanjutan" (21 Nov-18 Des), kelas PKL milik TKA lanjutan kembali aktif selama ASAS.
 * Kegiatan libur tidak ikut dihitung (tidak punya daftar rombel).
 */
export function rombelTidakAktifIds(tanggal: string, kalender: Kegiatan[], semester?: { rombelTidakAktif: string[] }): Set<string> {
  const g = periodeUntukTanggal(tanggal, kalender);
  return new Set(g ? g.rombelTidakAktif : (semester?.rombelTidakAktif ?? []));
}

/**
 * Periode yang berlaku pada tanggal: kegiatan bukan libur yang mencakup tanggal itu; bila beberapa, yang `mulai`-nya paling akhir
 * (paling spesifik), dan bila sama yang tertulis paling belakang.
 */
export function periodeUntukTanggal(tanggal: string, kalender: Kegiatan[]): Kegiatan | undefined {
  let terpilih: Kegiatan | undefined;
  for (const k of kalender) {
    if (k.jenis === 'libur' || !berlakuPada(k, tanggal)) continue;
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
    if (!k.versiId || !berlakuPada(k, tanggal)) continue;
    if (!terpilih || k.mulai >= terpilih.mulai) terpilih = k;
  }
  return (terpilih && p.versi.find((v) => v.id === terpilih.versiId)) ?? versiReguler(p);
}

// ------------------------------------------------------------------ beban per versi jadwal

/** Beban yang berlaku pada satu versi jadwal: yang tanpa `versiId` (berlaku di semua versi) dan yang khusus versi itu. */
export function bebanUntukVersi<T extends { versiId?: string }>(beban: T[], versiId: string | undefined): T[] {
  return beban.filter((b) => !b.versiId || b.versiId === versiId);
}

/** Proyek sebagaimana dilihat pada satu versi: beban dipersempit; bila tak ada beban khusus versi, proyek apa adanya. */
export function proyekUntukVersi(p: Proyek, versiId: string | undefined): Proyek {
  return p.beban.some((b) => b.versiId) ? { ...p, beban: bebanUntukVersi(p.beban, versiId) } : p;
}

/**
 * Menambah versi baru dari versi sumber. Beban khusus versi sumber ikut disalin (id baru, `versiId` baru) bersama slotnya
 * (denganSlot) atau tanpa slot. Beban yang berlaku di semua versi tidak digandakan.
 */
export function tambahVersi(p: Proyek, sumber: VersiJadwal | undefined, id: string, nama: string, denganSlot: boolean): VersiJadwal {
  const peta = new Map<string, string>();
  if (sumber) {
    for (const b of p.beban.filter((x) => x.versiId === sumber.id)) {
      const baru = `${b.id}~${id}`;
      peta.set(b.id, baru);
      p.beban.push({ ...structuredClone(b), id: baru, versiId: id });
    }
  }
  const slots = denganSlot && sumber ? sumber.slots.map((s) => ({ ...structuredClone(s), id: peta.has(s.bebanId) ? `${s.id}~${id}` : s.id, bebanId: peta.get(s.bebanId) ?? s.bebanId })) : [];
  const v: VersiJadwal = { id, nama, jenis: 'varian', slots };
  p.versi.push(v);
  return v;
}
