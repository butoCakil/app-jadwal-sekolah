import type { Proyek } from '../model/tipe';
import { adalahPelanggaran } from '../mesin/validator';
import { hitungTurunan } from '../ui/turunan';
import { seninPekan, tambahHari } from '../ui/util';

export interface MasalahPekan {
  /** Senin pekan yang bermasalah */
  senin: string;
  semester: string;
  jumlah: number;
  /** beberapa pesan pertama */
  contoh: string[];
}

export interface HasilGerbang {
  pekanDiperiksa: number;
  masalah: MasalahPekan[];
  /** total pelanggaran yang belum diterima, di semua pekan */
  total: number;
}

/**
 * Memeriksa semua pekan di semua semester dengan validator yang sama dengan Conflict Inspector (termasuk aturan kegiatan).
 * Pelanggaran yang sudah ditandai "diterima" tidak dihitung. Dipakai sebagai gerbang sebelum Terapkan.
 * `dari` (tanggal ISO): lewati pekan yang sudah berakhir sebelum tanggal itu (pekan lampau tidak perlu memblokir terbit).
 */
export function periksaSemuaPekan(p: Proyek, dari?: string): HasilGerbang {
  const n = p.polaReguler.length;
  const hasil: HasilGerbang = { pekanDiperiksa: 0, masalah: [], total: 0 };
  const sudah = new Set<string>();
  for (const sem of p.semesters ?? []) {
    for (let senin = seninPekan(sem.mulai, n); senin <= sem.selesai; senin = tambahHari(senin, 7)) {
      if (sudah.has(senin)) continue;
      if (dari && tambahHari(senin, n - 1) < dari) continue;
      sudah.add(senin);
      const t = hitungTurunan(p, senin, 'auto');
      hasil.pekanDiperiksa++;
      if (t.jumlahPelanggaran > 0) {
        hasil.total += t.jumlahPelanggaran;
        hasil.masalah.push({
          senin,
          semester: sem.nama,
          jumlah: t.jumlahPelanggaran,
          contoh: t.masalah.filter((m) => adalahPelanggaran(m) && !m.diterima).slice(0, 3).map((m) => m.pesan),
        });
      }
    }
  }
  return hasil;
}
