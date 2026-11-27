import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { Proyek } from '../src/model/tipe';
import { bacaLembar } from '../src/io/xlsx';
import { tafsirTugas } from '../src/io/imporTugas';
import { kodeGuruSekolah } from '../src/model/sekolah';
import { bangunGasal, bangunGenap } from '../src/model/bangunData';

/**
 * Pembangun data sekolah. Dijalankan manual untuk menulis ulang berkasnya:
 *   TULIS_DATA=1 XL_TUGAS=/jalur/PEMBAGIAN_TUGAS.xlsx npx vitest run test/bangun-data.test.ts
 * - data/sekolah/gasal-2026.json: dibangun dari dirinya sendiri (bangunGasal bersifat idempoten).
 * - data/sekolah/genap-2027.json: dari sheet Genap_Harizka (butuh XL_TUGAS; berkas Excel tidak ada di repo karena memuat NIP).
 * Tanpa TULIS_DATA, tes hanya memastikan berkas yang ada sama dengan hasil pembangunan.
 */
const baca = <T>(f: string): T => JSON.parse(readFileSync(new URL(f, import.meta.url), 'utf8')) as T;
const jalur = (f: string) => new URL(f, import.meta.url);

describe('bangun data sekolah', () => {
  it('gasal-2026.json = hasil bangunGasal', () => {
    const p = baca<Proyek>('../data/sekolah/gasal-2026.json');
    bangunGasal(p);
    if (process.env.TULIS_DATA) writeFileSync(jalur('../data/sekolah/gasal-2026.json'), JSON.stringify(p));
    expect(baca('../data/sekolah/gasal-2026.json')).toEqual(JSON.parse(JSON.stringify(p)));
  });

  it('genap-2027.json = hasil bangunGenap dari sheet Genap', () => {
    const xl = process.env.XL_TUGAS;
    if (!xl) {
      if (!existsSync(jalur('../data/sekolah/genap-2027.json'))) throw new Error('genap-2027.json belum ada; jalankan dengan XL_TUGAS.');
      return; // tanpa Excel: cukup tes invarian di sekolah.test.ts
    }
    const l = bacaLembar(new Uint8Array(readFileSync(xl)), 'Genap_Harizka');
    const h = tafsirTugas(l, { kodeGuru: kodeGuruSekolah });
    const p = bangunGenap(h, baca<Proyek>('../data/sekolah/gasal-2026.json'));
    if (process.env.TULIS_DATA) writeFileSync(jalur('../data/sekolah/genap-2027.json'), JSON.stringify(p));
    expect(baca('../data/sekolah/genap-2027.json')).toEqual(JSON.parse(JSON.stringify(p)));
  });
});
