import type { Proyek } from './tipe';
import { migrasiPola } from './kalender';
import gasal from '../../data/sekolah/gasal-2026.json';
import gasalAsc from '../../data/sekolah/gasal-asc-2026.json';
import genap from '../../data/sekolah/genap-2027.json';

export type IdDataSekolah = 'gasal' | 'gasalAsc' | 'genap';

/** Data sekolah yang tersedia. Urutan = urutan tampil di Master Data > Data. */
export const DAFTAR_DATA: { id: IdDataSekolah; judul: string; keterangan: string }[] = [
  {
    id: 'genap',
    judul: 'Genap 2026/2027 (untuk diuji)',
    keterangan: 'Guru, mapel & elemen, rombel, dan beban JP menurut sheet Genap; jadwal masih kosong untuk diuji Susun Otomatis dan AI. Kelas XII sedang PKL.',
  },
  {
    id: 'gasal',
    judul: 'Gasal 2026/2027 (induk + kegiatan ASAJ, ASAS)',
    keterangan: 'Jadwal jadi dari jadwal-te (jadwal-te-20261126-revisi-eng.json). Induk: jadwal reguler 12 Jul–18 Des 2026. Kegiatan: ASAJ Praktik XII (16–20 Nov) dan ASAS X & ASAJ XII (30 Nov–4 Des) dengan kelas khusus, ikut induk, atau tidak aktif.',
  },
  {
    id: 'gasalAsc',
    judul: 'Gasal 2026/2027 (referensi aSc, semua jurusan)',
    keterangan: 'Jadwal reguler dari aSc (30 rombel semua jurusan, 1200 JP, tanpa bentrok) dengan satu set beban. Dipakai sebagai referensi dan untuk menurunkan data Genap.',
  },
];

/**
 * Data sekolah (tanpa NIP maupun tanggal lahir). Bawaan: Genap 2026/2027, semester berikutnya yang akan diuji.
 * Pembangun datanya ada di test/bangun-data.test.ts.
 */
export function proyekSekolah(id: IdDataSekolah = 'genap'): Proyek {
  return migrasiPola(structuredClone(id === 'gasal' ? gasal : id === 'gasalAsc' ? gasalAsc : genap) as unknown as Proyek);
}
