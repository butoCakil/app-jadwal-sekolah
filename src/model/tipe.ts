// Tipe data inti. Hari memakai indeks 0..5 (Senin..Sabtu); jumlah hari kerja = panjang pola reguler (5 atau 6). Tanggal memakai string ISO "YYYY-MM-DD".

export const NAMA_HARI = ['Senin', 'Selasa', 'Rabu', 'Kamis', "Jum'at", 'Sabtu'] as const;
/** Jumlah hari kerja yang boleh dipilih. */
export const PILIHAN_HARI_KERJA = [5, 6] as const;

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

/** Id skema per hari kerja (Senin dst); panjangnya = jumlah hari kerja (5 atau 6). */
export type PolaMinggu = string[];

/** Pola mingguan selain pola reguler (default). */
export interface PolaBernama {
  id: string;
  nama: string;
  pola: PolaMinggu;
}

export type JenisKegiatan = 'TKA' | 'PKL' | 'ASAS' | 'ASAJ' | 'UKK' | 'ujian' | 'upacara' | 'rapor' | 'libur' | 'lain';

export interface Kegiatan {
  id: string;
  nama: string;
  jenis: JenisKegiatan;
  mulai: string;
  selesai: string;
  /** Pola mingguan yang dipakai pada periode ini (id pola; kosong = pola default). */
  polaId?: string;
  /** Format lama (pola tertanam); dipindah ke `polaLain` saat data dimuat. */
  pola?: PolaMinggu;
  rombelTidakAktif: string[];
  /** Versi jadwal yang dipakai pada periode ini (kosong = reguler) */
  versiId?: string;
  /**
   * Rombel yang punya jadwal dan beban khusus pada kegiatan ini; rombel aktif lain mengikuti jadwal induk (reguler) secara langsung.
   * Kosong (undefined) = data lama: semua rombel aktif memakai versi kegiatan ini apa adanya.
   */
  rombelTerdampak?: string[];
  /** Semester induk kegiatan ini. Kosong = semester yang memuat tanggal mulainya. */
  semesterId?: string;
  /**
   * Agenda kalender akademik (referensi): tampil di kalender dan Jadwal Berlangsung, tetapi tidak mengubah jadwal, pola jam,
   * kelas aktif, atau KBM (termasuk agenda berjenis libur).
   */
  agenda?: boolean;
  /** Sasaran agenda menurut kalender akademik, mis. "X, XII" atau "semua". */
  untuk?: string;
  /** Hari dalam pekan (0 = Senin) tempat kegiatan berlaku di dalam rentang tanggal. Kosong = setiap hari kerja. */
  hariBerlaku?: number[];
  catatan?: string;
}

/** Periode induk (satu semester): jadwal reguler, beban, dan kelas yang tidak aktif di luar kegiatan. */
export interface Semester {
  id: string;
  nama: string;
  mulai: string;
  selesai: string;
  /** Rombel tidak aktif di luar kegiatan (mis. PKL sepanjang semester). */
  rombelTidakAktif: string[];
  /** Versi jadwal reguler semester ini; beban induknya bertanda versiId ini. Kosong = versi reguler pertama. */
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
  /** Pengelompokan di pemilih mapel (Normatif, Adaptif, Jurusan TE, …); kosong = diturunkan dari kode. */
  kategori?: string;
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
  /** Bila diisi, beban hanya berlaku pada versi jadwal itu (mis. beban periode ASAS yang berbeda dari reguler). Kosong = berlaku di semua versi. */
  versiId?: string;
  /** Pada beban khusus kegiatan (model warisan): id beban induk yang digantikan. Kosong = beban tambahan kegiatan itu. */
  asal?: string;
  /** Pada beban khusus kegiatan: beban induk `asal` tidak dipakai pada kegiatan itu. */
  dihapus?: boolean;
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
  /** Pola default (berlaku bila periode tidak memilih pola lain). Jumlah hari kerja = panjangnya. */
  polaReguler: PolaMinggu;
  /** Id dan nama pola default (bawaan 'reguler' / 'Pola reguler'). */
  polaRegulerId?: string;
  polaRegulerNama?: string;
  /** Pola mingguan lain yang bisa dipasang pada periode di kalender. */
  polaLain?: PolaBernama[];
  penggantiManual: PenggantiManual | null;
  kalender: Kegiatan[];
  master: { guru: Guru[]; mapel: Mapel[]; rombel: Rombel[]; ruang: Ruang[] };
  beban: Beban[];
  aturan: Aturan[];
  versi: VersiJadwal[];
  /** Periode induk (semester gasal, genap, ...). Kosong = data lama tanpa rentang semester. */
  semesters?: Semester[];
  /** Format lama (satu semester); dipindah ke `semesters` saat data dimuat. */
  semester?: Omit<Semester, 'id'> & { id?: string };
  /** Periode (kegiatan kalender) yang sedang dikerjakan; tanggal acuan awal aplikasi mengikuti periode ini. */
  periodeAktifId?: string;
}

export const VERSI_DATA_SAAT_INI = 2;
