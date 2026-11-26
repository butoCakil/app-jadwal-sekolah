import type { Proyek } from './tipe';
import data from '../../data/sekolah/proyek.json';

/**
 * Data awal aplikasi: data sekolah (guru, rombel, ruang site plan 2026, aturan ruang per jurusan) dan jadwal reguler Gasal 2026/2027
 * dari aSc beserta beban turunannya (lihat terapkanRegulerAsc). Master awal dari PEMBAGIAN TUGAS lewat tafsirTugas + terapkanDataSekolah;
 * tidak memuat NIP maupun tanggal lahir.
 */
export function proyekSekolah(): Proyek {
  return structuredClone(data) as unknown as Proyek;
}
