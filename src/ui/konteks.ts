import type { Proyek, Slot } from '../model/tipe';
import type { Kategori, Masalah } from '../mesin/validator';
import type { SkemaHari } from '../model/kalender';

export type Tab = 'grid' | 'inspektur' | 'beban' | 'master' | 'skema';
export type Tata = 'hari' | 'semua';
export type ModeLihat = 'rombel' | 'guru' | 'ruang';

export type Modal = { jenis: 'sel'; hari: number; jam: number } | { jenis: 'slot'; slotId: string };

export interface StatusUI {
  tab: Tab;
  tanggal: string;
  mode: ModeLihat;
  /** 'hari' = satu entitas, kolom per hari; 'semua' = semua baris sekaligus dalam satu matriks. */
  tata: Tata;
  entitasId: string;
  modal: Modal | null;
  bebanRombel: string;
  bebanTerbuka: Set<string>;
  saring: Kategori | 'semua';
}

/** Hasil turunan dari data + tanggal acuan; dihitung ulang tiap gambar. */
export interface Turunan {
  senin: string;
  hari: { tgl: string; info: SkemaHari }[];
  skemaPerHari: (string | null)[];
  slots: Slot[];
  masalah: Masalah[];
  peta: Map<string, Masalah[]>;
  jumlahPelanggaran: number;
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
  ke(tab: Tab): void;
}
