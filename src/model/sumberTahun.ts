import type { Kegiatan } from './tipe';

/**
 * Kegiatan semester Gasal 2026/2027 dan berkas PDF aSc sumbernya (diekstrak oleh tools/ekstrak-asc-kelas.py ke
 * data/sekolah/sumber/asc-2026/<berkas>.json). Tanggal dari keterangan Benny (27 Nov 2026).
 */
export const SUMBER_TAHUN_2026: { id: string; nama: string; jenis: Kegiatan['jenis']; mulai: string; selesai: string; berkas: string; catatan?: string; pengawas?: string }[] = [
  { id: 'k-pemadatan', nama: 'Pemadatan TKA', jenis: 'TKA', mulai: '2026-09-29', selesai: '2026-10-23', berkas: 'pem', catatan: 'Sejak 29 September sampai Jumat sebelum TKA. PDF: JADWAL KELAS/GURU - PEMADATAN revisi 2.' },
  { id: 'k-tka1', nama: 'TKA Gelombang 1', jenis: 'TKA', mulai: '2026-10-26', selesai: '2026-10-30', berkas: 'tka1', catatan: 'PDF: 3. JADWAL KELAS/GURU 26-30 OKTOBER (TKA GELOMBANG 1).' },
  { id: 'k-tka2', nama: 'TKA Gelombang 2', jenis: 'TKA', mulai: '2026-11-02', selesai: '2026-11-06', berkas: 'tka2', catatan: 'PDF: JADWAL KELAS/GURU SELAMA TKA GELOMBANG 2 (2-6 NOV 2026).' },
  { id: 'k-asaj', nama: 'ASAJ Praktik Kelas XII', jenis: 'ASAJ', mulai: '2026-11-16', selesai: '2026-11-20', berkas: 'asaj', catatan: 'PDF: 8. JADWAL KELAS X, XI / GURU (16-20 NOV 2026).' },
  { id: 'k-ukk', nama: 'UKK Kelas XII', jenis: 'UKK', mulai: '2026-11-23', selesai: '2026-11-27', berkas: 'ukk', catatan: 'PDF: 9. JADWAL KELAS/GURU SELAMA UKK.' },
  { id: 'k-asas', nama: 'ASAS Kelas X dan ASAJ Kelas XII', jenis: 'ASAS', mulai: '2026-11-30', selesai: '2026-12-04', berkas: 'asas', pengawas: 'pengawas-asas-2026', catatan: 'Pelajaran reguler hanya kelas XI. PDF: JADWAL KELAS/GURU 30 NOV-4 DES 2026.' },
];

/** Rentang semester menurut kalender akademik: hari pertama masuk sampai pembagian rapor. */
export const SEMESTER_2026: { gasal: [string, string]; genap: [string, string] } = { gasal: ['2026-07-13', '2026-12-18'], genap: ['2027-01-04', '2027-06-18'] };

/**
 * Pergantian PKL (keterangan Benny, 27 Nov 2026): kelas XI berstatus PKL sampai 12 Des 2026 (di induk Gasal: rombel XI yang tidak ada
 * di jadwal 9-13 Nov), lalu sekitar 14 Des kelas XII yang PKL. Di Genap, PKL XII 4 Jan - 16 Apr 2027 (kalender akademik).
 * Kegiatan ini tanpa jadwal sendiri: kelas aktif lain mengikuti induk.
 */
export const PKL_2026: { id: string; nama: string; mulai: string; selesai: string; semesterId: string; tingkatTidakAktif: string[]; catatan: string }[] = [
  { id: 'k-pkl-xii-gasal', nama: 'PKL kelas XII (gelombang berikutnya)', mulai: '2026-12-14', selesai: '2026-12-18', semesterId: 'gasal', tingkatTidakAktif: ['XII'], catatan: 'PKL kelas XI berakhir 12 Des; sekitar 14 Des kelas XII mulai PKL (keterangan Benny). Kelas XI yang baru kembali belum punya jadwal di induk.' },
  { id: 'k-pkl-xii-genap', nama: 'PKL kelas XII', mulai: '2027-01-04', selesai: '2027-04-16', semesterId: 'genap', tingkatTidakAktif: ['XII'], catatan: 'Kalender akademik: PKL mulai 4 Jan, akhir PKL 16 Apr 2027.' },
];

/** Kalender akademik 2026/2027 (agenda referensi; tidak mengubah jadwal): [mulai, selesai, jenis, judul, tingkat, semester]. */
export const AGENDA_2026: [string, string, string, string, string, string][] = [
  ['2026-07-13', '2026-07-17', 'kegiatan', 'MPLS kelas X', 'X', 'Gasal'],
  ['2026-07-13', '2026-07-13', 'kegiatan', 'Hari pertama masuk sekolah', 'XI, XII', 'Gasal'],
  ['2026-08-17', '2026-08-17', 'kegiatan', 'Upacara HUT Kemerdekaan RI', 'semua', 'Gasal'],
  ['2026-08-18', '2026-08-19', 'kegiatan', 'Kegiatan sekolah', 'semua', 'Gasal'],
  ['2026-08-25', '2026-08-25', 'libur', 'Maulid Nabi Muhammad SAW', 'semua', 'Gasal'],
  ['2026-09-15', '2026-09-16', 'ujian', 'PSTS', 'X, XII', 'Gasal'],
  ['2026-09-18', '2026-09-18', 'ujian', 'PSTS', 'X, XII', 'Gasal'],
  ['2026-10-01', '2026-10-01', 'kegiatan', 'Upacara Hari Kesaktian Pancasila', 'semua', 'Gasal'],
  ['2026-10-13', '2026-10-16', 'ujian', 'PSAS kelas XII', 'XII', 'Gasal'],
  ['2026-10-19', '2026-10-20', 'kegiatan', 'Pemadatan materi', 'XII', 'Gasal'],
  ['2026-10-22', '2026-10-22', 'kegiatan', 'Kegiatan sekolah / pemadatan materi', 'semua', 'Gasal'],
  ['2026-10-26', '2026-10-27', 'ujian', 'TKA', 'XII', 'Gasal'],
  ['2026-10-28', '2026-10-28', 'kegiatan', 'Upacara Hari Sumpah Pemuda', 'semua', 'Gasal'],
  ['2026-10-29', '2026-10-30', 'ujian', 'TKA', 'XII', 'Gasal'],
  ['2026-11-02', '2026-11-05', 'ujian', 'TKA', 'XII', 'Gasal'],
  ['2026-11-10', '2026-11-10', 'kegiatan', 'Upacara Hari Pahlawan', 'semua', 'Gasal'],
  ['2026-11-16', '2026-11-20', 'ujian', 'ASAJ Praktik', 'XII', 'Gasal'],
  ['2026-11-17', '2026-11-17', 'kegiatan', 'Upacara tanggal 17', 'X, XI, XII', 'Gasal'],
  ['2026-11-23', '2026-11-27', 'ujian', 'UK3 (uji kompetensi keahlian)', 'XII', 'Gasal'],
  ['2026-11-30', '2026-12-04', 'ujian', 'ASAJ Teori', 'XII', 'Gasal'],
  ['2026-12-01', '2026-12-04', 'ujian', 'PSAS', 'X, XI', 'Gasal'],
  ['2026-12-08', '2026-12-11', 'kegiatan', 'Remedial', 'X, XI', 'Gasal'],
  ['2026-12-14', '2026-12-17', 'kegiatan', 'Kegiatan sekolah', 'semua', 'Gasal'],
  ['2026-12-18', '2026-12-18', 'rapor', 'Laporan hasil belajar semester gasal', 'semua', 'Gasal'],
  ['2026-12-21', '2026-12-31', 'libur', 'Libur semester gasal (LS1)', 'X, XI', 'di luar semester'],
  ['2026-12-24', '2026-12-24', 'libur', 'Cuti bersama Natal', 'semua', 'di luar semester'],
  ['2026-12-25', '2026-12-25', 'libur', 'Natal', 'semua', 'di luar semester'],
  ['2027-01-01', '2027-01-01', 'libur', 'Tahun Baru Masehi 2027', 'semua', 'di luar semester'],
  ['2027-01-04', '2027-01-04', 'kegiatan', 'Hari pertama masuk semester genap', 'X, XI', 'di luar semester'],
  ['2027-01-04', '2027-01-04', 'pkl', 'PKL Mulai Kelas XII', 'XII', 'Genap'],
  ['2027-01-05', '2027-01-05', 'libur', "Isra Mi'raj 1448 H", 'semua', 'di luar semester'],
  ['2027-02-06', '2027-02-06', 'libur', 'Tahun Baru Imlek 2578', 'semua', 'Genap'],
  ['2027-02-10', '2027-02-10', 'libur', 'Libur awal Ramadan', 'semua', 'Genap'],
  ['2027-03-02', '2027-03-05', 'kegiatan', 'Pesantren Ramadan', 'X, XI', 'Genap'],
  ['2027-03-08', '2027-03-08', 'libur', 'Libur nasional', 'semua', 'Genap'],
  ['2027-03-09', '2027-03-09', 'libur', 'Libur menjelang Idul Fitri', 'semua', 'Genap'],
  ['2027-03-10', '2027-03-12', 'libur', 'Idul Fitri 1448 H', 'semua', 'Genap'],
  ['2027-03-26', '2027-03-26', 'libur', 'Hari Paskah', 'semua', 'Genap'],
  ['2027-04-06', '2027-04-09', 'ujian', 'PSTS', 'X, XI', 'Genap'],
  ['2027-04-16', '2027-04-16', 'pkl', 'Akhir PKL Kelas XII', 'XII', 'Genap'],
  ['2027-04-21', '2027-04-21', 'kegiatan', 'Upacara', 'semua', 'Genap'],
  ['2027-04-28', '2027-04-30', 'kegiatan', 'Kegiatan sekolah', 'semua', 'Genap'],
  ['2027-05-01', '2027-05-01', 'libur', 'Hari Buruh', 'semua', 'Genap'],
  ['2027-05-03', '2027-05-03', 'kegiatan', 'Perkiraan pengumuman kelulusan', 'XII', 'Genap'],
  ['2027-05-06', '2027-05-06', 'libur', 'Kenaikan Yesus Kristus', 'semua', 'Genap'],
  ['2027-05-12', '2027-05-12', 'kegiatan', 'Kegiatan sekolah', 'semua', 'Genap'],
  ['2027-05-20', '2027-05-20', 'kegiatan', 'Upacara Hari Kebangkitan Nasional & Hari Raya Waisak', 'semua', 'Genap'],
  ['2027-05-27', '2027-05-27', 'libur', 'Idul Adha', 'semua', 'Genap'],
  ['2027-06-01', '2027-06-01', 'kegiatan', 'Upacara Hari Lahir Pancasila', 'semua', 'Genap'],
  ['2027-06-02', '2027-06-04', 'ujian', 'PSAT', 'X, XI', 'Genap'],
  ['2027-06-07', '2027-06-07', 'ujian', 'PSAT', 'X, XI', 'Genap'],
  ['2027-06-08', '2027-06-10', 'kegiatan', 'Remedial', 'X, XI', 'Genap'],
  ['2027-06-14', '2027-06-15', 'kegiatan', 'Kegiatan sekolah', 'semua', 'Genap'],
  ['2027-06-17', '2027-06-17', 'libur', 'Libur nasional', 'semua', 'Genap'],
  ['2027-06-18', '2027-06-18', 'rapor', 'Laporan hasil belajar semester genap', 'semua', 'Genap'],
  ['2027-06-21', '2027-07-09', 'libur', 'Libur semester genap (LS2)', 'X, XI', 'di luar semester'],
];

/**
 * Keputusan lapangan yang sudah diterima (keterangan Benny, 27 Nov 2026): PSRT XI TE 2 bertabrakan satu pertemuan dengan tugas mengawas
 * ASAS; guru memberi tugas di kelas saat mengawas. Tidak bisa diselesaikan penyusunan otomatis.
 */
export const DITERIMA_2026: { tanggal: string; jenis: 'pengawas-bentrok'; guru: string; rombel: string; mapel: string; catatan: string }[] = [
  { tanggal: '2026-11-30', jenis: 'pengawas-bentrok', guru: 'EDW', rombel: 'XI TE 2', mapel: 'PSRT', catatan: 'EDW memberi tugas ke siswa saat mengawas ASAS (keputusan lapangan).' },
];

/**
 * Penyesuaian jadwal ASAS (keputusan Benny, 27 Nov 2026): D1 ternyata ruang ujian (kolom D.1 pada jadwal pengawas), jadi PSRT XI TE 2
 * pada hari Kamis (jam 3-6) pindah ke B3, yang kosong pada jam itu.
 */
export const PENYESUAIAN_2026: { versiId: string; rombel: string; mapel: string; hari: number; ruang: string; catatan: string }[] = [
  { versiId: 'v-asas', rombel: 'XI TE 2', mapel: 'PSRT', hari: 3, ruang: 'B3', catatan: 'PSRT XI TE 2 Kamis pindah dari D1 (ruang ujian) ke B3 (keputusan Benny, 27 Nov 2026).' },
];
