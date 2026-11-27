import { describe, expect, it } from 'vitest';
import { proyekContoh } from '../src/model/contoh';
import { proyekSekolah } from '../src/model/sekolahData';
import { pecahJp, susun } from '../src/mesin/solver';
import { adalahPelanggaran, periksa } from '../src/mesin/validator';
import type { Proyek } from '../src/model/tipe';

const kosong = (p: Proyek) => {
  for (const v of p.versi) v.slots = [];
  return p;
};
const pelanggaran = (p: Proyek, slots: ReturnType<typeof susun>['slots']) => periksa(p, slots).filter(adalahPelanggaran);

describe('pecahJp', () => {
  it('pola dipakai bila jumlahnya cocok', () => {
    expect(pecahJp(4, [3, 1])).toEqual([3, 1]);
    expect(pecahJp(4, [3, 2])).toEqual([2, 2]);
  });
  it('pecahan bawaan', () => {
    expect(pecahJp(1)).toEqual([1]);
    expect(pecahJp(3)).toEqual([3]);
    expect(pecahJp(4)).toEqual([2, 2]);
    expect(pecahJp(5)).toEqual([3, 2]);
    expect(pecahJp(6)).toEqual([3, 3]);
    expect(pecahJp(12)).toEqual([4, 4, 4]);
    expect(pecahJp(18).reduce((a, b) => a + b, 0)).toBe(18);
  });
});

describe('susun (data contoh)', () => {
  it('tanpa pelanggaran, JP sesuai beban', () => {
    const p = kosong(proyekContoh());
    const h = susun(p, { skemaPerHari: p.polaReguler, batasMs: 600 });
    expect(pelanggaran(p, h.slots)).toEqual([]);
    expect(h.terjadwal).toBe(h.total);
    expect(h.sisa).toEqual([]);
    for (const b of p.beban) expect(h.slots.filter((s) => s.bebanId === b.id)).toHaveLength(b.jp);
  });
  it('kelompok paralel berjalan bersamaan', () => {
    const p = kosong(proyekContoh());
    const h = susun(p, { skemaPerHari: p.polaReguler, batasMs: 400 });
    const a = h.slots.filter((s) => s.bebanId === 'b6').map((s) => `${s.hari}:${s.jam}`).sort();
    const b = h.slots.filter((s) => s.bebanId === 'b7').map((s) => `${s.hari}:${s.jam}`).sort();
    expect(a).toEqual(b);
    expect(a.length).toBe(3);
  });
  it('guru tidak tersedia dihormati', () => {
    const p = kosong(proyekContoh());
    p.aturan.push({ id: 'x', jenis: 'guruTidakTersedia', guruId: 'g1', hari: 0, jam: [] });
    const h = susun(p, { skemaPerHari: p.polaReguler, batasMs: 400 });
    const guruBeban = new Set(p.beban.filter((b) => b.guruId === 'g1').map((b) => b.id));
    expect(h.slots.filter((s) => guruBeban.has(s.bebanId) && s.hari === 0)).toEqual([]);
    expect(pelanggaran(p, h.slots)).toEqual([]);
  });
  it('pertemuan satu beban berurutan di satu hari', () => {
    const p = kosong(proyekContoh());
    const h = susun(p, { skemaPerHari: p.polaReguler, batasMs: 400 });
    const b = p.beban.find((x) => x.pola?.join() === '2,2');
    expect(b).toBeDefined();
    const s = h.slots.filter((x) => x.bebanId === b?.id);
    expect(s).toHaveLength(4);
  });
  it('mode lengkapi mempertahankan slot yang ada', () => {
    const p = kosong(proyekContoh());
    const a = susun(p, { skemaPerHari: p.polaReguler, batasMs: 300 });
    const separuh = a.slots.filter((_, i) => i % 2 === 0);
    const h = susun(p, { skemaPerHari: p.polaReguler, tetap: separuh, batasMs: 400 });
    for (const s of separuh) expect(h.slots.some((x) => x.id === s.id && x.hari === s.hari && x.jam === s.jam)).toBe(true);
    expect(pelanggaran(p, h.slots)).toEqual([]);
    expect(h.terjadwal).toBe(h.total);
  });
  it('hari tanpa KBM tidak diisi', () => {
    const p = kosong(proyekContoh());
    const h = susun(p, { skemaPerHari: ['skema11', 'skema10', null, 'skema11', 'skema9'], batasMs: 400 });
    expect(h.slots.filter((s) => s.hari === 2)).toEqual([]);
  });
});

describe('susun (data sekolah, jadwal reguler aSc Gasal 2026)', () => {
  // XI AT 1, XI AT 2, XI DKV 3, XI TE 2, XI TE 3 butuh 49 JP padahal kapasitas pekan 48 JP: 5 JP pasti tidak muat
  const PASTI_SISA = 5;
  it('dari nol: tanpa bentrok, semua slot beruang, hampir semua JP tertempatkan', () => {
    const p = kosong(proyekSekolah('gasalAsc'));
    const h = susun(p, { skemaPerHari: p.polaReguler, batasMs: 3000, benih: 1 });
    expect(pelanggaran(p, h.slots)).toEqual([]);
    expect(h.slots.every((s) => s.ruangId)).toBe(true);
    expect(h.total - h.terjadwal).toBeGreaterThanOrEqual(PASTI_SISA);
    expect(h.total - h.terjadwal).toBeLessThanOrEqual(25);
    expect(h.peringatan.some((x) => x.includes('XI AT 1'))).toBe(true);
  }, 20000);
  it('lengkapi: 1200 JP jadwal reguler tetap di tempatnya, lima rombel XI yang belum terjadwal diisi di sekitarnya', () => {
    const p = proyekSekolah('gasalAsc');
    const reguler = p.versi[0]?.slots ?? [];
    expect(reguler).toHaveLength(1200);
    const h = susun(p, { skemaPerHari: p.polaReguler, tetap: reguler, batasMs: 3000, benih: 1 });
    for (const s of reguler) expect(h.slots.some((x) => x.id === s.id && x.hari === s.hari && x.jam === s.jam && x.ruangId === s.ruangId)).toBe(true);
    expect(pelanggaran(p, h.slots)).toEqual([]);
    expect(h.total - h.terjadwal).toBeGreaterThanOrEqual(PASTI_SISA);
    expect(h.total - h.terjadwal).toBeLessThanOrEqual(12);
  }, 20000);
});
