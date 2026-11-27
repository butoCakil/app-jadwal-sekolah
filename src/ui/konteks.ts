import type { Beban, JenisKegiatan, Kegiatan, Proyek, Semester, Slot, VersiJadwal } from '../model/tipe';
import type { Kategori, Masalah } from '../mesin/validator';
import type { SkemaHari } from '../model/kalender';
import type { Fokus, JadwalPekan } from '../model/simpul';
import type { AturanPekan } from '../model/aturanKegiatan';

export type SubMaster = 'guru' | 'mapel' | 'rombel' | 'ruang' | 'aturan' | 'data';
export type Tab = 'langsung' | 'grid' | 'info' | 'kelas' | 'inspektur' | 'beban' | 'master' | 'skema' | 'impor' | 'susun';
/** Sub-tab halaman Periode & Jadwal. */
export const TAB_HUB: Tab[] = ['info', 'kelas', 'beban', 'grid'];
export type Tata = 'hari' | 'semua';
export type ModeLihat = 'rombel' | 'guru' | 'ruang';

/** Modal daftar centang untuk memilih banyak ruang/mapel sekaligus. */
export interface Pemilih {
  /** Siapa yang diatur: tabel master + id barisnya, atau aturan (a) / beban (b) */
  sasaran: 'mapelRuang' | 'rombelRuang' | 'guruMapel' | 'aturanRuang' | 'bebanPrio' | 'bebanLarang' | 'bebanTim' | 'kegiatanRombel' | 'kegiatanKunci' | 'kegiatanTanpaRuang';
  id: string;
  /** pilihan sementara selama modal terbuka */
  pilih: Set<string>;
  cari: string;
}

/** Isian sementara pada modal kegiatan; baru masuk ke data setelah Simpan. */
export interface DlgKegiatan {
  id: string;
  baru: boolean;
  nama: string;
  jenis: JenisKegiatan;
  mulai: string;
  selesai: string;
  /** rombel tidak aktif (mis. PKL) */
  tdk: Set<string>;
  /** '' = pola default */
  polaId: string;
  /** hari berlaku (0 = Senin); kosong = setiap hari kerja */
  hari: Set<number>;
  /** agenda referensi (tidak mengubah jadwal) */
  agenda: boolean;
  untuk: string;
  catatan: string;
  aktifkan: boolean;
  galat: string;
}

export type Modal = { jenis: 'sel'; hari: number; jam: number } | { jenis: 'slot'; slotId: string };

export interface StatusUI {
  tab: Tab;
  /** sasaran yang dikerjakan di halaman Periode & Jadwal */
  fokus: Fokus;
  /** sasaran terakhir di halaman Periode & Jadwal (dipulihkan setelah melihat Jadwal Berlangsung) */
  fokusHub: Fokus;
  /** semester yang diciutkan di pohon */
  tutup: Set<string>;
  /** pohon periode disembunyikan (grid selebar layar) */
  pohonTutup: boolean;
  tanggal: string;
  mode: ModeLihat;
  /** 'hari' = satu entitas, kolom per hari; 'semua' = semua baris sekaligus dalam satu matriks. */
  tata: Tata;
  entitasId: string;
  modal: Modal | null;
  masterTab: SubMaster;
  bebanRombel: string;
  /** tab kalender: bulan yang ditampilkan (YYYY-MM) dan tanggal terpilih */
  kalBulan: string;
  /** sub-tab pada tab Skema & Kalender */
  skemaSub: 'kalender' | 'pola' | 'skema';
  kalTanggal: string;
  /** modal pemilih centang (ruang/mapel) */
  pemilih: Pemilih | null;
  /** modal ubah/tambah kegiatan kalender */
  dlg: DlgKegiatan | null;
  bebanTerbuka: Set<string>;
  saring: Kategori | 'semua';
}

/** Hasil turunan dari data + tanggal acuan; dihitung ulang tiap gambar. */
export interface Turunan {
  senin: string;
  hari: { tgl: string; info: SkemaHari }[];
  skemaPerHari: (string | null)[];
  slots: Slot[];
  /** beban yang berlaku pada versi jadwal tanggal acuan */
  beban: Beban[];
  masalah: Masalah[];
  peta: Map<string, Masalah[]>;
  jumlahPelanggaran: number;
  /** versi jadwal yang berlaku pada tanggal acuan */
  versi: VersiJadwal | undefined;
  periode: Kegiatan | undefined;
  /** semester induk pekan ini (atau kegiatan yang difokuskan) */
  semester: Semester | undefined;
  rombelTidakAktif: ReadonlySet<string>;
  /** slot tampil per hari beserta asal versinya (untuk mengalihkan perubahan) */
  pekan: JadwalPekan;
  fokus: Fokus;
  /** aturan kegiatan pekan ini: ruang terkunci, tugas mengawas, rombel tanpa ruang */
  aturan: AturanPekan;
}

export interface Konteks {
  readonly p: Proyek;
  readonly turunan: Turunan;
  ui: StatusUI;
  /** Mengubah proyek (dicatat untuk undo, disimpan, digambar ulang). */
  ubah(fn: (p: Proyek) => void): void;
  /** Mengubah daftar slot versi aktif. */
  ubahSlots(fn: (slots: Slot[]) => Slot[]): void;
  gambar(): void;
  lapor(pesan: string): void;
  /** Mengganti seluruh draf dengan proyek lain (data bawaan, dataset tersimpan, semester baru). */
  ganti(baru: Proyek, pesan?: string): void;
  ke(tab: Tab): void;
}
