import { describe, expect, it } from 'vitest';
import { proyekSekolah } from '../src/model/sekolahData';
import { adalahPelanggaran, periksa } from '../src/mesin/validator';
import { kunciLonggar } from '../src/io/imporAsc';
import { tentukanRuang } from '../src/mesin/penempatan';

const SEMUA_ROMBEL_DI_ASC = 25;

describe('jadwal reguler Gasal 2026 (aSc) pada data sekolah', () => {
  const p = proyekSekolah('gasal');
  const reguler = p.versi[0]!;
  const rombel = (id: string) => p.master.rombel.find((r) => r.id === id)?.kode ?? '?';
  const masalah = periksa(p, reguler.slots, { skemaPerHari: p.polaReguler });

  it('1200 JP = 25 rombel x 48 JP, tanpa bentrok, aturan, kapasitas, atau ruang kosong', () => {
    expect(reguler.slots).toHaveLength(SEMUA_ROMBEL_DI_ASC * 48);
    const parah = masalah.filter((m) => adalahPelanggaran(m) || m.kategori === 'kapasitas' || m.jenis === 'ruang-belum');
    expect(parah.map((m) => m.pesan)).toEqual([]);
  });

  it('JP yang kurang hanya pada lima rombel XI yang tidak ada di PDF aSc', () => {
    const kurang = new Set(masalah.filter((m) => m.jenis === 'jp-kurang').map((m) => rombel(m.rombelId ?? '')));
    expect([...kurang].sort()).toEqual(['XI AT 1', 'XI AT 2', 'XI DKV 3', 'XI TE 2', 'XI TE 3']);
  });

  it('beban: pola berjumlah JP, JP sama dengan slot, elemen KK TE punya induk DTE atau TAV', () => {
    for (const b of p.beban) {
      if (b.pola?.length) expect(b.pola.reduce((a, x) => a + x, 0)).toBe(b.jp);
    }
    const kode = (id: string | undefined) => p.master.mapel.find((m) => m.id === id)?.kode;
    const induk = (k: string) => kode(p.master.mapel.find((m) => m.kode === k)?.induk);
    for (const k of ['DLE', 'DRE', 'TKB']) expect(induk(k)).toBe('DTE');
    for (const k of ['PRE', 'PMM', 'PSRT', 'PISAV', 'PISS']) expect(induk(k)).toBe('TAV');
    expect(p.master.mapel.find((m) => m.kode === 'P4E')?.induk).toBeUndefined();
  });

  it('PKL tetap menjadi mapel (dipakai semester genap)', () => {
    expect(p.master.mapel.some((m) => m.kode === 'PKL')).toBe(true);
  });

  it('jpButuh dari Excel tetap ada, jadi selisih 51/49 dengan 48 JP jadwal terlihat', () => {
    const x = p.master.rombel.find((r) => r.kode === 'X AT 1');
    expect(x?.jpButuh).toBe(51);
    const jp = p.beban.filter((b) => b.rombelId === x?.id).reduce((a, b) => a + b.jp, 0);
    expect(jp).toBe(48);
  });

  it('nama guru aSc dicocokkan dengan ejaan Excel', () => {
    expect(kunciLonggar('Sri Yumiati, S.Pd')).toBe(kunciLonggar('Sri Yumiyati, S.Pd'));
    expect(kunciLonggar('Efry Widiyanti, S.Kom')).toBe(kunciLonggar('Efry Widyanti, S.Kom'));
    expect(kunciLonggar('M Agung Prabowo, S.Kom')).toBe(kunciLonggar('Muhammad Agung Prabowo, S.Kom'));
  });

  it('PJOK dapat dipindah ke lapangan lewat jenis ruang mapel, dan lapangan boleh dipakai bersama', () => {
    const q = structuredClone(p);
    const pjok = q.master.mapel.find((m) => m.kode === 'PJO')!;
    pjok.jenisRuang = ['lapangan'];
    const beban = q.beban.filter((b) => b.mapelId === pjok.id).slice(0, 2);
    expect(beban).toHaveLength(2);
    const lap = q.master.ruang.find((r) => r.jenis === 'lapangan')!;
    const a = tentukanRuang(q, [], beban[0]!, 0, 1);
    expect(a.ruangId).toBe(lap.id);
    const b = tentukanRuang(q, [{ id: 'x', bebanId: beban[0]!.id, hari: 0, jam: 1, ruangId: lap.id }], beban[1]!, 0, 1);
    expect(b.ruangId).toBe(lap.id);
  });
});
