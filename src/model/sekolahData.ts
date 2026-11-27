import type { Proyek } from './tipe';
import gasal from '../../data/sekolah/gasal-2026.json';
import genap from '../../data/sekolah/genap-2027.json';

export type IdDataSekolah = 'gasal' | 'genap';

/** Data sekolah yang tersedia. Urutan = urutan tampil di Master Data > Data. */
export const DAFTAR_DATA: { id: IdDataSekolah; judul: string; keterangan: string }[] = [
  {
    id: 'genap',
    judul: 'Genap 2026/2027 (untuk diuji)',
    keterangan: 'Guru, mapel & elemen, rombel, dan beban JP menurut sheet Genap; jadwal masih kosong untuk diuji Susun Otomatis dan AI. Kelas XII sedang PKL.',
  },
  {
    id: 'gasal',
    judul: 'Gasal 2026/2027 (fase ASAJ)',
    keterangan: 'Jadwal reguler dari aSc (25 rombel, 1200 JP, tanpa bentrok) beserta periode TKA, ASAJ, dan ASAS. Periode aktif: ASAS X dan ASAJ XII.',
  },
];

/**
 * Data sekolah (tanpa NIP maupun tanggal lahir). Bawaan: Genap 2026/2027, semester berikutnya yang akan diuji.
 * Pembangun datanya ada di test/bangun-data.test.ts.
 */
export function proyekSekolah(id: IdDataSekolah = 'genap'): Proyek {
  return structuredClone(id === 'gasal' ? gasal : genap) as unknown as Proyek;
}
