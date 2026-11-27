import type { Proyek } from '../model/tipe';
import { hitungTurunan } from './turunan';

/** Keputusan lapangan yang sudah diterima untuk data sumber: pelanggaran jenis tertentu pada tanggal, guru, rombel, dan mapel itu. */
export interface KeputusanDiterima {
  tanggal: string;
  jenis: 'pengawas-bentrok';
  guru: string;
  rombel: string;
  mapel: string;
  catatan: string;
}

/**
 * Menandai pelanggaran yang cocok dengan `keputusan` sebagai diterima pada `p.diterima`. Mengembalikan jumlah pesan yang diterima
 * (0 untuk satu keputusan berarti tidak ada pelanggaran yang cocok; pemanggil perlu memperlakukannya sebagai galat).
 */
export function terimaKeputusan(p: Proyek, keputusan: KeputusanDiterima[]): number[] {
  return keputusan.map((x) => {
    const t = hitungTurunan(p, x.tanggal);
    const cocok = t.masalah.filter((m) => m.jenis === x.jenis && m.pesan.includes(`Guru ${x.guru} `) && m.pesan.includes(`(${x.rombel} ${x.mapel})`));
    const ada = new Set((p.diterima ?? []).map((y) => y.pesan));
    for (const m of cocok) if (!ada.has(m.pesan)) p.diterima = [...(p.diterima ?? []), { pesan: m.pesan, catatan: x.catatan }];
    return cocok.length;
  });
}
