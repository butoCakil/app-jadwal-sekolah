import type { Beban } from '../model/tipe';

/**
 * JP tatap muka satu rombel per pekan. Beban paralel dengan nama kelompok yang sama
 * (mis. PA Islam/Katolik/Kristen) berjalan bersamaan sehingga dihitung sekali (nilai terbesar).
 * Beban non-tatap-muka (PKL) tidak dihitung.
 */
export function jpRombel(beban: Beban[]): number {
  let total = 0;
  const kelompok = new Map<string, number>();
  for (const b of beban) {
    if (b.nonTatapMuka) continue;
    if (b.paralel) kelompok.set(b.paralel, Math.max(kelompok.get(b.paralel) ?? 0, b.jp));
    else total += b.jp;
  }
  for (const v of kelompok.values()) total += v;
  return total;
}
