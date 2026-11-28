// Bagian tampilan jadwal yang dipakai bersama halaman web dan cetak PDF.

import type { ItemP, ModeP } from './tampil';

const WARNA_ALASAN: Record<string, { bg: string; fg: string }> = {
  PKL: { bg: '#e0f2fe', fg: '#075985' },
  UKK: { bg: '#ede9fe', fg: '#5b21b6' },
  ASAS: { bg: '#ffedd5', fg: '#9a3412' },
  ASAJ: { bg: '#fce7f3', fg: '#9d174d' },
  TKA: { bg: '#dcfce7', fg: '#166534' },
};

/** Warna latar dan huruf untuk alasan kelas tidak belajar di sekolah (PKL, UKK, ...). */
export function warnaAlasan(kode: string): { bg: string; fg: string } {
  return WARNA_ALASAN[kode] ?? { bg: '#fef3c7', fg: '#92400e' };
}

/** Tiga baris teks pada satu kotak jadwal, sesuai mode tabel. */
export function barisKotak(mode: ModeP, x: ItemP, paralel: boolean): string[] {
  const rombel = x.rombel.replace(/\s+/g, '');
  const guru = x.guru.map((g) => g.kode).join('/');
  const mapel = x.mapel.kode + (paralel ? '+' : '');
  if (mode === 'rombel') return [mapel, guru, x.ruang];
  if (mode === 'guru') return [rombel, mapel, x.ruang];
  return [rombel, mapel, guru];
}
