// Tipe data inti. Hari memakai indeks 0..4 (Senin..Jumat). Tanggal memakai string ISO "YYYY-MM-DD".

export const NAMA_HARI = ['Senin', 'Selasa', 'Rabu', 'Kamis', "Jum'at"] as const;

export type JenisBaris = 'nonKbm' | 'kbm' | 'istirahat';

export interface BarisSkema {
  id: string;
  tipe: JenisBaris;
  kegiatan: string;
  /** menit */
  durasi: number;
}

export interface Skema {
  id: string;
  nama: string;
  /** "HH:MM" */
  jamMulai: string;
  warna: string;
  baris: BarisSkema[];
}

/** Id skema untuk Senin..Jumat */
export type PolaMinggu = [string, string, string, string, string];

export type JenisKegiatan = 'TKA' | 'PKL' | 'ASAS' | 'UKK' | 'libur' | 'lain';

export interface Kegiatan {
  id: string;
  nama: string;
  jenis: JenisKegiatan;
  mulai: string;
  selesai: string;
  /** Kosong = tidak mengubah pola */
  pola?: PolaMinggu;
  rombelTidakAktif: string[];
  /** Versi jadwal yang dipakai pada periode ini (kosong = reguler) */
  versiId?: string;
}

/** Penggantian manual oleh admin. Tanpa rentang tanggal = berlaku untuk semua tanggal. */
export interface PenggantiManual {
  pola: PolaMinggu;
  mulai?: string;
  selesai?: string;
}

export interface Guru {
  id: string;
  nama: string;
  kode: string;
}
export interface Mapel {
  id: string;
  nama: string;
  kode: string;
  /** id mapel induk untuk elemen/sub-mapel */
  induk?: string;
}
export interface Rombel {
  id: string;
  tingkat: 'X' | 'XI' | 'XII';
  jurusan: string;
  nomor: number;
  kode: string;
  /** Kebutuhan JP pelajaran per pekan menurut data sumber (opsional; diisi dari impor Excel) */
  jpButuh?: number;
}
export interface Ruang {
  id: string;
  kode: string;
  nama: string;
  jenis: 'teori' | 'praktik' | 'lab' | 'lapangan';
}

/** Satu sel jadwal. `jam` = nomor KBM internal (1 = pelajaran pertama; jam 0 = non-KBM tidak dijadwalkan). */
export interface Slot {
  id: string;
  rombelId: string;
  hari: number;
  jam: number;
  guruId: string;
  mapelId: string;
  ruangId: string;
}

export interface VersiJadwal {
  id: string;
  nama: string;
  jenis: 'reguler' | 'varian';
  slots: Slot[];
}

export interface Proyek {
  versiSkemaData: number;
  nama: string;
  skema: Skema[];
  polaReguler: PolaMinggu;
  penggantiManual: PenggantiManual | null;
  kalender: Kegiatan[];
  master: { guru: Guru[]; mapel: Mapel[]; rombel: Rombel[]; ruang: Ruang[] };
  versi: VersiJadwal[];
}

export const VERSI_DATA_SAAT_INI = 1;
