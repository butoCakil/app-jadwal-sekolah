import type { Skema, Slot } from './tipe';
import { kapasitasKbm } from './skema';

export interface HasilPetaSlot {
  /** Slot yang masih muat pada skema hari itu */
  ditempatkan: Slot[];
  /** Slot yang jamnya melebihi kapasitas hari itu atau harinya tidak punya KBM; menunggu keputusan */
  tampungan: Slot[];
}

/**
 * Memetakan slot ke skema per hari. Slot yang nomor KBM-nya melebihi kapasitas skema hari itu
 * (atau hari tanpa skema) masuk tampungan. Tidak ada slot yang dibuang diam-diam.
 * `skemaPerHari` berisi id skema (atau null bila tidak ada KBM) untuk Senin..Jumat.
 */
export function petakanSlot(slots: Slot[], skemaPerHari: (string | null)[], daftarSkema: Skema[]): HasilPetaSlot {
  const byId = new Map(daftarSkema.map((s) => [s.id, s]));
  const ditempatkan: Slot[] = [];
  const tampungan: Slot[] = [];
  for (const s of slots) {
    const id = skemaPerHari[s.hari];
    const skema = id ? byId.get(id) : undefined;
    if (skema && s.jam >= 1 && s.jam <= kapasitasKbm(skema)) ditempatkan.push(s);
    else tampungan.push(s);
  }
  return { ditempatkan, tampungan };
}
