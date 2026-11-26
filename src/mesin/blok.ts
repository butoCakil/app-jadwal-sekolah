import type { Slot } from '../model/tipe';

/** Sekumpulan slot satu beban pada satu hari yang jamnya berurutan (satu "kartu" di layar). */
export interface Blok {
  bebanId: string;
  hari: number;
  /** terurut menurut jam */
  slots: Slot[];
  jamAwal: number;
  jamAkhir: number;
}

/** Mengelompokkan slot menjadi blok: beban sama, hari sama, nomor pelajaran berurutan. */
export function susunBlok(slots: Slot[]): Blok[] {
  const urut = [...slots].sort((a, b) => a.hari - b.hari || a.bebanId.localeCompare(b.bebanId) || a.jam - b.jam);
  const hasil: Blok[] = [];
  let kini: Blok | null = null;
  for (const s of urut) {
    if (kini && kini.bebanId === s.bebanId && kini.hari === s.hari && s.jam === kini.jamAkhir + 1) {
      kini.slots.push(s);
      kini.jamAkhir = s.jam;
    } else {
      kini = { bebanId: s.bebanId, hari: s.hari, slots: [s], jamAwal: s.jam, jamAkhir: s.jam };
      hasil.push(kini);
    }
  }
  return hasil;
}

/**
 * Memecah blok di tempat istirahat pada hari itu. `istirahatSetelah` berisi nomor pelajaran yang diikuti istirahat.
 * Blok yang tidak terpotong menghasilkan satu bagian.
 */
export function potongBlok(blok: Blok, istirahatSetelah: ReadonlySet<number>): { a: number; b: number }[] {
  const hasil: { a: number; b: number }[] = [];
  let a = blok.jamAwal;
  for (let j = blok.jamAwal; j < blok.jamAkhir; j++) {
    if (istirahatSetelah.has(j)) {
      hasil.push({ a, b: j });
      a = j + 1;
    }
  }
  hasil.push({ a, b: blok.jamAkhir });
  return hasil;
}
