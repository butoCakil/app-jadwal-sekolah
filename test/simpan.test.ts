import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { dariJson, hapusDraf, keJson, muatDraf, simpanDraf } from '../src/io/simpan';
import { proyekContoh } from '../src/model/contoh';

describe('penyimpanan', () => {
  it('bolak-balik JSON tanpa kehilangan data', () => {
    const p = proyekContoh();
    const h = dariJson(keJson(p));
    expect(h.ok).toBe(true);
    if (h.ok) expect(h.proyek).toEqual(p);
  });
  it('JSON rusak dan versi asing ditolak dengan pesan, tanpa melempar', () => {
    expect(dariJson('{bukan json').ok).toBe(false);
    const h = dariJson('{"versiSkemaData": 7}');
    expect(h.ok).toBe(false);
  });
  it('IndexedDB: simpan, muat, hapus', async () => {
    expect(await muatDraf()).toBeNull();
    const p = proyekContoh();
    await simpanDraf(p);
    expect(await muatDraf()).toEqual(p);
    await hapusDraf();
    expect(await muatDraf()).toBeNull();
  });
});
