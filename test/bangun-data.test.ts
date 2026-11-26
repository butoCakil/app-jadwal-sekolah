import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import type { Proyek } from '../src/model/tipe';
import { isiJenisRuangMapel } from '../src/model/sekolah';
import { terapkanRegulerAsc, type SumberAsc } from '../src/io/imporAsc';

/**
 * Pembangun data/sekolah/proyek.json: memasang jadwal reguler aSc (data/sekolah/sumber/reguler-gasal-2026.json) ke data sekolah.
 * Dijalankan manual:  TULIS_DATA=1 npx vitest run test/bangun-data.test.ts
 * Tanpa TULIS_DATA, tes ini hanya memastikan proyek.json sama dengan hasil pembangunan (data tidak diedit tangan sebagian).
 */
describe('bangun data sekolah', () => {
  const baca = <T>(f: string): T => JSON.parse(readFileSync(new URL(f, import.meta.url), 'utf8')) as T;
  it('proyek.json = hasil terapkanRegulerAsc', () => {
    const p = baca<Proyek>('../data/sekolah/proyek.json');
    const sumber = baca<SumberAsc>('../data/sekolah/sumber/reguler-gasal-2026.json');
    const lap = terapkanRegulerAsc(p, sumber);
    isiJenisRuangMapel(p);
    p.nama = 'SMK Negeri Bansari - Gasal 2026/2027 (jadwal reguler dari aSc)';
    if (process.env.TULIS_DATA) {
      writeFileSync(new URL('../data/sekolah/proyek.json', import.meta.url), JSON.stringify(p));
      console.log(JSON.stringify(lap, null, 1));
    }
    expect(JSON.parse(readFileSync(new URL('../data/sekolah/proyek.json', import.meta.url), 'utf8'))).toEqual(JSON.parse(JSON.stringify(p)));
  });
});
