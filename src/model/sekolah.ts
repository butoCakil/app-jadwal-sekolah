import type { Aturan, Proyek } from './tipe';
import { usulKodeGuru } from './kode';
import { terapkanRuangSekolah } from './ruangSekolah';
import { terapkanImpor, type HasilImpor } from '../io/imporTugas';

/** Dua kata pertama nama (tanpa gelar), huruf kecil: kunci pencocokan nama guru. */
export function kunciNama(nama: string): string {
  return ((nama.split(',')[0] ?? '').toLowerCase().replace(/[^a-z ]/g, ' ').trim().split(/\s+/).slice(0, 2)).join(' ');
}

/**
 * Kode guru 3 huruf yang sudah dipakai di jadwal-te (berkas jadwal-te-20261126-revisi-eng.json), dicocokkan lewat
 * dua kata pertama nama. Ejaan Excel dan jadwal-te berbeda pada beberapa nama, jadi ejaan Excel ditulis di sini.
 * "ahmat arifin" sengaja tidak ada: kodenya di jadwal-te (ARF) bentrok dengan Arif Indra Nugroho, jadi ia memakai usulan otomatis.
 */
const KODE_GURU: Record<string, string> = {
  'sri yumiyati': 'YUM', azaetun: 'AZT', 'erni hastuti': 'ERN', 'woro raharjanti': 'WOR', 'ari nur': 'ARN', 'dadang kurniawan': 'DDG',
  'dwiani lindawati': 'LIN', nurjati: 'NJT', 'yudha hardiyanto': 'YDH', 'mochamad sugeng': 'SGG', 'aprillia palupi': 'APL',
  'adin hartoyo': 'ADN', budiman: 'BUD', 'efi kusmiati': 'EFI', 'nur laila': 'NLW', 'anang hariyarta': 'ANG', 'edward harlin': 'EDW',
  'tety ardiyani': 'TET', 'wiwit nurohati': 'WIW', 'okta nofiyanto': 'OKN', daryatmi: 'DRY', 'ika prasetyanti': 'IKA',
  'muhammad harizka': 'HRZ', 'desiana anggraeni': 'DSN', 'aprisia khairunnisa': 'APR', 'dani mardianto': 'DNI', 'benny surahman': 'BEN',
  'tafakur khoirot': 'TFK', 'fitrotul khoiriyah': 'FIT', 'dewinta arya': 'DWT', 'arif indra': 'ARF', 'chintya febrie': 'CHN',
  'setyo purnawan': 'STY', pariyadi: 'PAR', 'ahmad najahu': 'ANT', 'widya pratiwi': 'WID', 'sofyan reza': 'SOF', 'galih setyagus': 'GAL',
  'muhammad agung': 'MAP', 'bangun wijayanto': 'BWJ', 'yeni hanifah': 'YNH', 'okta wulan': 'OWN', 'aziz sofian': 'AZZ',
  'drajat nugroho': 'DRJ', 'tommy farid': 'TOM', 'arfan sodik': 'AFN', 'novengga hendrasinta': 'NOV', 'restin ardelia': 'RES',
};

/** Kode guru untuk impor Excel: kode jadwal-te bila ada dan belum terpakai, selain itu usulan 3 huruf dari nama. */
export function kodeGuruSekolah(nama: string, dipakai: string[]): string {
  const ada = new Set(dipakai.map((k) => k.toUpperCase()));
  const tetap = KODE_GURU[kunciNama(nama)];
  return tetap && !ada.has(tetap) ? tetap : usulKodeGuru(nama, dipakai);
}

/** Kode ruang milik tiap jurusan (praktik/lab), menurut keterangan gedung pada site plan 2026. */
const RUANG_TE = ['B2', 'B3', 'C1', 'C2', 'D1', 'D2'];
const RUANG_DKV = ['G2', 'G3', 'I3', 'I4', 'Q'];
const RUANG_AT = ['M1', 'M2', 'M3', 'N1', 'N2', 'N3', 'O1', 'O3'];
/** Lab DKV yang boleh dipakai TE dalam kondisi tertentu (keterangan Benny, 26 Nov 2026): G3 dan I3 (I1 memang tidak dilarang). */
const DKV_BOLEH_TE = ['G3', 'I3'];

/** Aturan ruang terlarang per jurusan: tiap jurusan tidak memakai ruang praktik/lab jurusan lain. Bisa diubah di tab Aturan. */
export function aturanRuangJurusan(p: Proyek): Aturan[] {
  const id = new Map(p.master.ruang.map((r) => [r.kode.toUpperCase(), r.id]));
  const ids = (kode: string[]) => kode.map((k) => id.get(k)).filter((x): x is string => !!x);
  const buat = (jurusan: string, kode: string[], catatan: string): Aturan => ({ id: `ar-${jurusan.toLowerCase()}`, jenis: 'ruangTerlarang', jurusan, ruangIds: ids(kode), catatan });
  return [
    buat('TE', [...RUANG_AT, ...RUANG_DKV.filter((k) => !DKV_BOLEH_TE.includes(k))], 'TE tidak memakai lab AT dan DKV (kecuali G3, I3 untuk kondisi tertentu)'),
    buat('AT', [...RUANG_TE, ...RUANG_DKV], 'AT tidak memakai ruang praktik TE dan DKV'),
    buat('DKV', [...RUANG_TE, ...RUANG_AT], 'DKV tidak memakai ruang praktik TE dan AT'),
  ];
}

/**
 * Urutan jenis ruang per kode mapel (kode Excel). Mapel yang tidak tercantum memakai bawaan (teori, praktik, lab).
 * Dasar: jadwal aSc 9-13 Nov 2026 (mapel kejuruan selalu di bengkel/lab, informatika di lab komputer).
 */
const JENIS_RUANG_MAPEL: Record<string, ('praktik' | 'lab' | 'teori')[]> = {
  DTE: ['praktik', 'lab'], TAV: ['praktik', 'lab'], P4E: ['praktik', 'lab'], DKV: ['praktik', 'lab'], DDK: ['praktik', 'lab'],
  BC: ['praktik', 'lab'], AT: ['praktik', 'lab'], DAT: ['praktik', 'lab'], PTP: ['praktik', 'lab'],
  IT: ['lab', 'teori'], KKA: ['lab', 'teori'],
  // elemen KK TE (dari jadwal reguler aSc Gasal 2026): DLE kadang di ruang teori, elemen lain di bengkel/lab TE
  DLE: ['praktik', 'teori', 'lab'], DRE: ['praktik', 'lab'], TKB: ['praktik', 'lab'], PRE: ['praktik', 'lab'], PMM: ['praktik', 'lab'],
  PSRT: ['praktik', 'lab'], PISAV: ['praktik', 'lab'], PISS: ['praktik', 'lab'],
};

/** Mengisi urutan jenis ruang mapel yang dikenal (lihat JENIS_RUANG_MAPEL); mapel lain tidak diubah. */
export function isiJenisRuangMapel(p: Proyek): void {
  for (const m of p.master.mapel) {
    const j = JENIS_RUANG_MAPEL[m.kode.toUpperCase()];
    if (j) m.jenisRuang = [...j];
  }
}

/** Menerapkan data sekolah ke proyek: hasil impor Excel, daftar ruang site plan, dan aturan ruang per jurusan. */
export function terapkanDataSekolah(p: Proyek, h: HasilImpor): void {
  terapkanImpor(p, h);
  terapkanRuangSekolah(p);
  isiJenisRuangMapel(p);
  p.aturan = [...p.aturan.filter((a) => a.jenis !== 'ruangTerlarang' || !a.jurusan), ...aturanRuangJurusan(p)];
}
