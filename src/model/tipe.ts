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

export type JenisKegiatan = 'TKA' | 'PKL' | 'ASAS' | 'ASAJ' | 'UKK' | 'libur' | 'lain';

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
  catatan?: string;
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
  /** Mapel/elemen yang diampu (kompetensi). Dipakai untuk menyaring pilihan mapel dan memberi peringatan; kosong = tidak dibatasi. */
  mapelIds?: string[];
}
export interface Mapel {
  id: string;
  nama: string;
  kode: string;
  /** id mapel induk untuk elemen/sub-mapel */
  induk?: string;
  /** Jenis ruang yang boleh dipakai, berurutan (yang pertama dicoba dulu). Kosong = teori, praktik, lab. */
  jenisRuang?: Ruang['jenis'][];
  /** Ruang yang boleh dipakai mapel ini (daftar putih). Kosong = tidak dibatasi. */
  ruangIds?: string[];
}
export interface Rombel {
  id: string;
  tingkat: 'X' | 'XI' | 'XII';
  jurusan: string;
  nomor: number;
  kode: string;
  /** Kebutuhan JP pelajaran per pekan menurut data sumber (opsional; diisi dari impor Excel) */
  jpButuh?: number;
  /** Ruang yang boleh dipakai rombel ini (daftar putih). Kosong = tidak dibatasi. */
  ruangIds?: string[];
}
export interface Ruang {
  id: string;
  kode: string;
  nama: string;
  jenis: 'teori' | 'praktik' | 'lab' | 'lapangan';
  /** true = boleh dipakai beberapa rombel sekaligus (mis. lapangan); tidak dihitung bentrok ruang */
  bersama?: boolean;
  /** false = bukan ruang belajar (mis. ruang guru/instruktur); tidak dipilih otomatis. Kosong = true. */
  dijadwalkan?: boolean;
  /** Kelompok ruang untuk pemilihan massal, mis. "Ruang teori", "Lab AT", "Lab DKV", "Lab TE". Kosong = turunan dari jenis. */
  kategori?: string;
}

/** Beban mengajar: satu guru mengajar satu mapel di satu rombel sebanyak `jp` JP per pekan. */
export interface Beban {
  id: string;
  guruId: string;
  mapelId: string;
  rombelId: string;
  jp: number;
  /** Cara JP dipecah per pertemuan, mis. [2,2]. Kosong = bebas. Belum dipakai validator (solver tahap 4). */
  pola?: number[];
  /** Guru tambahan yang ikut mengajar pada slot yang sama (team teaching) */
  timGuruIds: string[];
  /** Beban di rombel yang sama dengan nama kelompok paralel yang sama boleh berjalan bersamaan (mis. PA) */
  paralel?: string;
  /** Urutan ruang yang dipakai: ruang pertama dulu, kalau terpakai ruang berikutnya. Kosong = semua ruang yang tidak terlarang. */
  ruangPrioritas: string[];
  ruangTerlarang: string[];
  /** Beban yang tidak menempati slot (mis. pembimbing PKL); dihitung di beban guru saja */
  nonTatapMuka?: boolean;
}

export type Aturan =
  | { id: string; jenis: 'guruTidakTersedia'; guruId: string; hari: number; /** nomor KBM; kosong = sehari penuh */ jam: number[]; catatan?: string }
  | { id: string; jenis: 'guruRuang'; guruId: string; /** guru ini hanya boleh memakai ruang-ruang ini */ ruangIds: string[]; catatan?: string }
  | { id: string; jenis: 'ruangTerlarang'; /** salah satu terisi */ rombelId?: string; jurusan?: string; ruangIds: string[]; catatan?: string };

/** Satu sel jadwal. `jam` = nomor KBM internal (1 = pelajaran pertama; jam 0 = non-KBM tidak dijadwalkan). */
export interface Slot {
  id: string;
  bebanId: string;
  hari: number;
  jam: number;
  /** kosong = belum ada ruang */
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
  beban: Beban[];
  aturan: Aturan[];
  versi: VersiJadwal[];
  /** Periode (kegiatan kalender) yang sedang dikerjakan; tanggal acuan awal aplikasi mengikuti periode ini. */
  periodeAktifId?: string;
}

export const VERSI_DATA_SAAT_INI = 2;
