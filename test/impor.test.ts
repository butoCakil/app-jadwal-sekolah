import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { bacaLembar, daftarLembar, kolomKeIndeks } from '../src/io/xlsx';
import type { Sel } from '../src/io/xlsx';
import { tafsirTugas, terapkanImpor } from '../src/io/imporTugas';
import { proyekContoh } from '../src/model/contoh';
import { validasiProyek } from '../src/model/validasi';

const huruf = (i: number) => (i < 26 ? String.fromCharCode(65 + i) : String.fromCharCode(64 + Math.floor(i / 26)) + String.fromCharCode(65 + (i % 26)));

/** Membuat paket xlsx minimal dari tabel sel (teks lewat inlineStr, angka biasa). */
function buatXlsx(nama: string, baris: Sel[][]): Uint8Array {
  const xml = baris
    .map((b, r) =>
      `<row r="${r + 1}">${b
        .map((v, c) => {
          if (v === null || v === undefined) return '';
          const ref = `${huruf(c)}${r + 1}`;
          return typeof v === 'number'
            ? `<c r="${ref}"><v>${v}</v></c>`
            : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${v.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</t></is></c>`;
        })
        .join('')}</row>`,
    )
    .join('');
  return zipSync({
    'xl/workbook.xml': strToU8(`<workbook><sheets><sheet name="${nama}" sheetId="1" r:id="rId1"/></sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'),
    'xl/worksheets/sheet1.xml': strToU8(`<worksheet><sheetData>${xml}</sheetData></worksheet>`),
  });
}

const n = null;
// kolom: A=NO B=NAMA C=MAPEL D=KODE | E,F=X TE 1,2 | G,H=XI TE 1,2 | I=JJM MAPEL
const TABEL: Sel[][] = [
  ['Lampiran', n, n, n, n, n, n, n, n],
  [n, n, n, n, n, n, n, n, n],
  ['NO', 'NAMA / NIP / TANGGAL LAHIR', 'MATA PELAJARAN', 'KODE', 'KELAS X', n, 'KELAS XI', n, 'JJM MAPEL'],
  [n, n, n, n, 'TE', n, 'TE', n, n],
  [n, n, n, n, 1, 2, 1, 2, n],
  [1, 'Sri Yumiyati, S.Pd\n19700101 199001 2 001\nKlaten, 1 Januari 1970', 'Bahasa Inggris', 'ENG', 4, 4, n, n, 8],
  [2, 'Ahmad, S.Pd', 'Pendidikan Agama Islam dan Budi Pekerti', 'PABP', 3, n, 3, n, 6],
  [n, n, 'Praktik Kerja Lapangan', 'PKL', n, n, 12, n, 12],
  [3, 'Budi, S.Pd', 'Pendidikan Agama Kristen dan Budi Pekerti', 'PABP', 3, n, n, n, 3],
  [4, 'Citra, S.Pd', 'Bahasa Indonesia', 'INDO', 2, 2, 2, 2, 7],
  [5, '\n', n, n, 9, 6, 5, 2, n],
];

describe('pembaca xlsx', () => {
  it('kolomKeIndeks', () => {
    expect(kolomKeIndeks('A')).toBe(0);
    expect(kolomKeIndeks('Z')).toBe(25);
    expect(kolomKeIndeks('AA')).toBe(26);
    expect(kolomKeIndeks('AK')).toBe(36);
  });
  it('membaca nama sheet dan isi sel', () => {
    const d = buatXlsx('Genap_Harizka', TABEL);
    expect(daftarLembar(d)).toEqual(['Genap_Harizka']);
    const l = bacaLembar(d, 'Genap_Harizka');
    expect(l.baris[5]?.[2]).toBe('Bahasa Inggris');
    expect(l.baris[5]?.[4]).toBe(4);
  });
});

describe('tafsir PEMBAGIAN TUGAS', () => {
  const h = tafsirTugas(bacaLembar(buatXlsx('Genap_Harizka', TABEL), 'Genap_Harizka'));
  it('menemukan guru (tanpa NIP), mapel, rombel', () => {
    expect(h.guru.map((g) => [g.kode, g.nama])).toEqual([['A', 'Sri Yumiyati, S.Pd'], ['B', 'Ahmad, S.Pd'], ['C', 'Budi, S.Pd'], ['D', 'Citra, S.Pd']]);
    expect(h.mapel.map((m) => m.kode)).toEqual(['ENG', 'PA', 'PKL', 'BI']);
    expect(h.rombel.map((r) => r.kode)).toEqual(['X TE 1', 'X TE 2', 'XI TE 1', 'XI TE 2']);
  });
  it('nama mapel PABP memakai awalan kata yang sama', () => {
    expect(h.mapel.find((m) => m.kode === 'PA')?.nama).toBe('Pendidikan Agama');
  });
  it('PKL non-tatap-muka dan PABP berbeda guru menjadi paralel', () => {
    const pkl = h.beban.filter((b) => b.nonTatapMuka);
    expect(pkl).toHaveLength(1);
    expect(pkl[0]?.jp).toBe(12);
    const pa = h.beban.filter((b) => b.mapelId === h.mapel.find((m) => m.kode === 'PA')?.id && b.rombelId === 'r1');
    expect(pa).toHaveLength(2);
    expect(pa.every((b) => b.paralel === 'PA')).toBe(true);
  });
  it('baris jumlah dibaca sebagai jpButuh dan dicocokkan', () => {
    expect(h.rombel.map((r) => r.jpButuh)).toEqual([9, 6, 5, 2]);
    // X TE 1: ENG 4 + PA (Islam 3 + Kristen 3, paralel dihitung sekali = 3) + BI 2 = 9 -> cocok dengan baris jumlah
    expect(h.peringatan.filter((x) => x.includes('jumlah beban'))).toEqual([]);
  });
  it('menandai JJM MAPEL yang tidak cocok', () => {
    expect(h.peringatan.some((x) => x.includes('Citra') && x.includes('JJM MAPEL 7'))).toBe(true);
  });
  it('menolak sheet tanpa baris judul', () => {
    expect(() => tafsirTugas({ nama: 'x', baris: [['a']] })).toThrow(/MATA PELAJARAN/);
  });
  it('hasil terapkan menghasilkan proyek yang valid dan jadwal kosong', () => {
    const p = proyekContoh();
    terapkanImpor(p, h);
    expect(p.versi.every((v) => v.slots.length === 0)).toBe(true);
    expect(p.aturan.some((a) => a.jenis === 'guruTidakTersedia')).toBe(false);
    expect(validasiProyek(p)).toEqual([]);
  });
});
