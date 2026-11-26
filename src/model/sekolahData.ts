import type { Proyek } from './tipe';
import data from '../../data/sekolah/proyek.json';

/**
 * Data awal aplikasi: data sekolah (guru, mapel, rombel, beban dari PEMBAGIAN TUGAS sheet Genap_Harizka, ruang site plan 2026,
 * aturan ruang per jurusan). Dibuat dengan tafsirTugas + terapkanDataSekolah; tidak memuat NIP maupun tanggal lahir.
 */
export function proyekSekolah(): Proyek {
  return structuredClone(data) as unknown as Proyek;
}
