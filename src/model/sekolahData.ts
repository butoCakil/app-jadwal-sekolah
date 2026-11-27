import type { Proyek } from './tipe';
import { migrasiPola } from './kalender';
import gasal from '../../data/sekolah/gasal-2026.json';
import tahun from '../../data/sekolah/tahun-2026.json';
import gasalAsc from '../../data/sekolah/gasal-asc-2026.json';
import genap from '../../data/sekolah/genap-2027.json';

export type IdDataSekolah = 'tahun' | 'gasal' | 'gasalAsc' | 'genap';

/** Data sekolah yang tersedia. Urutan = urutan tampil di Master Data > Data. */
export const DAFTAR_DATA: { id: IdDataSekolah; judul: string; keterangan: string }[] = [
  {
    id: 'tahun',
    judul: 'Tahun Pelajaran 2026/2027 (Gasal + Genap, semua jurusan)',
    keterangan: 'Induk Gasal: jadwal reguler aSc 9–13 Nov 2026 (25 rombel). Kegiatan Gasal dari PDF aSc: Pemadatan TKA (29 Sep–23 Okt), TKA Gelombang 1 (26–30 Okt) dan 2 (2–6 Nov), ASAJ Praktik XII (16–20 Nov), UKK XII (23–27 Nov), ASAS X & ASAJ XII (30 Nov–4 Des). Induk Genap: beban sheet Genap, jadwal belum disusun, kelas XII PKL.',
  },
  {
    id: 'genap',
    judul: 'Genap 2026/2027 (untuk diuji)',
    keterangan: 'Guru, mapel & elemen, rombel, dan beban JP menurut sheet Genap; jadwal masih kosong untuk diuji Susun Otomatis dan AI. Kelas XII sedang PKL.',
  },
  {
    id: 'gasal',
    judul: 'Gasal 2026/2027 dari jadwal-te (jurusan TE, referensi)',
    keterangan: 'Jadwal jadi dari jadwal-te (jadwal-te-20261126-revisi-eng.json). Induk: jadwal reguler 12 Jul–18 Des 2026. Kegiatan: ASAJ Praktik XII (16–20 Nov) dan ASAS X & ASAJ XII (30 Nov–4 Des) dengan kelas khusus, ikut induk, atau tidak aktif.',
  },
  {
    id: 'gasalAsc',
    judul: 'Gasal 2026/2027 awal semester (referensi aSc, Juli)',
    keterangan: 'Jadwal reguler awal semester dari aSc (PDF dibuat 16 Jul 2026; kelas XI AT 3, XI AT 4, XI DKV 1, XI DKV 2, XI TE 1 belajar di sekolah), 1200 JP. Dipakai sebagai referensi dan untuk menurunkan data Genap.',
  },
];

/**
 * Data sekolah (tanpa NIP maupun tanggal lahir). Bawaan: Tahun Pelajaran 2026/2027 (Gasal dengan kegiatannya, Genap).
 * Pembangun datanya ada di test/bangun-data.test.ts.
 */
export function proyekSekolah(id: IdDataSekolah = 'tahun'): Proyek {
  return migrasiPola(structuredClone(id === 'tahun' ? tahun : id === 'gasal' ? gasal : id === 'gasalAsc' ? gasalAsc : genap) as unknown as Proyek);
}
