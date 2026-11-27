import type { Mapel } from './tipe';

/** Kategori bawaan untuk pengelompokan mapel; kategori lain (mis. "Jurusan TE") boleh diketik sendiri di Master Data. */
export const KATEGORI_MAPEL_BAWAAN = ['Normatif', 'Adaptif'] as const;
export const BELUM_DIKATEGORIKAN = 'Belum dikategorikan';

const NORMATIF = new Set(['PA', 'PABP', 'PP', 'BI', 'PJO', 'PJOK', 'SJR', 'SJ', 'SEN', 'SB', 'JAW', 'JW']);
const ADAPTIF = new Set(['MTK', 'ENG', 'IPA', 'IPAS', 'IT', 'KKA']);
/** Kode mapel jurusan yang dikenal pada data sekolah; yang tidak ada di sini jatuh ke "Belum dikategorikan" sampai diisi manual. */
const JURUSAN: Record<string, string> = {
  AT: 'AT', DAT: 'AT', TAT: 'AT', PTP: 'AT',
  DKV: 'DKV', DDK: 'DKV', BC: 'DKV',
  DTE: 'TE', TAV: 'TE', P4E: 'TE', DLE: 'TE', DRE: 'TE', TKB: 'TE', PSRT: 'TE', PRE: 'TE', PMM: 'TE', PISS: 'TE', PISAV: 'TE',
};

/** Kategori mapel: isian manual bila ada; elemen mengikuti mapel induknya; selain itu diturunkan dari kode. */
export function kategoriMapel(m: Pick<Mapel, 'kode' | 'induk' | 'kategori'>, semua: Pick<Mapel, 'id' | 'kode' | 'induk' | 'kategori'>[] = []): string {
  if (m.kategori) return m.kategori;
  const induk = m.induk ? semua.find((x) => x.id === m.induk) : undefined;
  if (induk) return kategoriMapel(induk, []);
  const kode = m.kode.trim().toUpperCase();
  if (NORMATIF.has(kode)) return 'Normatif';
  if (ADAPTIF.has(kode)) return 'Adaptif';
  const j = JURUSAN[kode] ?? /^(?:KK|MPP)\.?(AT|DKV|TE)$/.exec(kode)?.[1];
  return j ? `Jurusan ${j}` : BELUM_DIKATEGORIKAN;
}

/** Urutan tampil: Normatif, Adaptif, lalu jurusan (mengikuti urutan jurusan rombel), kategori lain, terakhir yang belum dikategorikan. */
export function urutKategori(nama: string, jurusan: string[]): number {
  if (nama === 'Normatif') return 0;
  if (nama === 'Adaptif') return 1;
  const i = jurusan.findIndex((j) => nama === `Jurusan ${j}`);
  if (i >= 0) return 2 + i;
  return nama === BELUM_DIKATEGORIKAN ? 1000 : 500;
}
