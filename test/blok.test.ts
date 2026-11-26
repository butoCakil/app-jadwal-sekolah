import { describe, expect, it } from 'vitest';
import { potongBlok, susunBlok } from '../src/mesin/blok';
import { rencanaPindahBlok } from '../src/mesin/penempatan';
import { proyekContoh } from '../src/model/contoh';
import type { Slot } from '../src/model/tipe';

const s = (id: string, bebanId: string, hari: number, jam: number): Slot => ({ id, bebanId, hari, jam, ruangId: 'B3' });

describe('blok', () => {
  it('menggabungkan jam berurutan beban sama dan hari sama', () => {
    const b = susunBlok([s('1', 'b1', 0, 2), s('2', 'b1', 0, 1), s('3', 'b1', 0, 4), s('4', 'b1', 1, 2), s('5', 'b2', 0, 3)]);
    expect(b.map((x) => [x.bebanId, x.hari, x.jamAwal, x.jamAkhir])).toEqual([['b1', 0, 1, 2], ['b1', 0, 4, 4], ['b1', 1, 2, 2], ['b2', 0, 3, 3]]);
  });
  it('memotong blok di istirahat', () => {
    const [b] = susunBlok([s('1', 'b1', 0, 2), s('2', 'b1', 0, 3), s('3', 'b1', 0, 4)]);
    expect(potongBlok(b!, new Set([3]))).toEqual([{ a: 2, b: 3 }, { a: 4, b: 4 }]);
    expect(potongBlok(b!, new Set())).toEqual([{ a: 2, b: 4 }]);
  });
  it('memindah blok utuh ke jam baru, dan menolak bila bentrok', () => {
    const p = proyekContoh();
    const slots = p.versi[0]!.slots;
    const mtk = susunBlok(slots).find((x) => x.slots.length === 2 && x.hari === 0)!;
    const r = rencanaPindahBlok(p, slots, mtk.slots, 0, 6);
    expect(r.ubahan.map((x) => x.jam)).toEqual(r.ok ? [6, 7] : []);
    const sama = rencanaPindahBlok(p, slots, mtk.slots, mtk.hari, mtk.jamAwal);
    expect(sama.ok).toBe(false);
  });
});
