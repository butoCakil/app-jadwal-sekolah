import type { Ruang } from './tipe';

/** Kategori bawaan untuk pemilihan ruang massal; kategori lain boleh diketik sendiri di Master Data. */
export const KATEGORI_BAWAAN = ['Ruang teori', 'Lab TE', 'Lab DKV', 'Lab AT', 'Lab umum', 'Lapangan', 'Non-kelas'] as const;

/** Kategori ruang; bila belum diisi diturunkan dari jenis (teori = Ruang teori, lapangan = Lapangan, lainnya = Tanpa kategori). */
export function kategoriRuang(r: Pick<Ruang, 'kategori' | 'jenis'>): string {
  if (r.kategori) return r.kategori;
  return r.jenis === 'teori' ? 'Ruang teori' : r.jenis === 'lapangan' ? 'Lapangan' : 'Tanpa kategori';
}

/** Ruang dikelompokkan per kategori (urutan kategori mengikuti kemunculan pertama di master). */
export function kelompokRuang(ruang: Ruang[]): { kategori: string; ruang: Ruang[] }[] {
  const peta = new Map<string, Ruang[]>();
  for (const r of ruang) {
    const k = kategoriRuang(r);
    const l = peta.get(k);
    if (l) l.push(r);
    else peta.set(k, [r]);
  }
  return [...peta].map(([kategori, daftar]) => ({ kategori, ruang: daftar }));
}
