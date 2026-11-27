import type { Kegiatan } from './tipe';

/**
 * Kegiatan semester Gasal 2026/2027 dan berkas PDF aSc sumbernya (diekstrak oleh tools/ekstrak-asc-kelas.py ke
 * data/sekolah/sumber/asc-2026/<berkas>.json). Tanggal dari keterangan Benny (27 Nov 2026).
 */
export const SUMBER_TAHUN_2026: { id: string; nama: string; jenis: Kegiatan['jenis']; mulai: string; selesai: string; berkas: string; catatan?: string }[] = [
  { id: 'k-pemadatan', nama: 'Pemadatan TKA', jenis: 'TKA', mulai: '2026-09-29', selesai: '2026-10-23', berkas: 'pem', catatan: 'Sejak 29 September sampai Jumat sebelum TKA. PDF: JADWAL KELAS/GURU - PEMADATAN revisi 2.' },
  { id: 'k-tka1', nama: 'TKA Gelombang 1', jenis: 'TKA', mulai: '2026-10-26', selesai: '2026-10-30', berkas: 'tka1', catatan: 'PDF: 3. JADWAL KELAS/GURU 26-30 OKTOBER (TKA GELOMBANG 1).' },
  { id: 'k-tka2', nama: 'TKA Gelombang 2', jenis: 'TKA', mulai: '2026-11-02', selesai: '2026-11-06', berkas: 'tka2', catatan: 'PDF: JADWAL KELAS/GURU SELAMA TKA GELOMBANG 2 (2-6 NOV 2026).' },
  { id: 'k-asaj', nama: 'ASAJ Praktik Kelas XII', jenis: 'ASAJ', mulai: '2026-11-16', selesai: '2026-11-20', berkas: 'asaj', catatan: 'PDF: 8. JADWAL KELAS X, XI / GURU (16-20 NOV 2026).' },
  { id: 'k-ukk', nama: 'UKK Kelas XII', jenis: 'UKK', mulai: '2026-11-23', selesai: '2026-11-27', berkas: 'ukk', catatan: 'PDF: 9. JADWAL KELAS/GURU SELAMA UKK.' },
  { id: 'k-asas', nama: 'ASAS Kelas X dan ASAJ Kelas XII', jenis: 'ASAS', mulai: '2026-11-30', selesai: '2026-12-04', berkas: 'asas', catatan: 'Pelajaran reguler hanya kelas XI. PDF: JADWAL KELAS/GURU 30 NOV-4 DES 2026.' },
];

/** Rentang semester (dari jadwal-te: p_tka 12 Jul s.d. p_tka2 18 Des; p_genap 3 Jan s.d. 18 Jun 2027). */
export const SEMESTER_2026: { gasal: [string, string]; genap: [string, string] } = { gasal: ['2026-07-12', '2026-12-18'], genap: ['2027-01-03', '2027-06-18'] };
