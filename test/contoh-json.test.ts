import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { proyekContoh } from '../src/model/contoh';
import { dariJson } from '../src/io/simpan';

// data/contoh/contoh.json harus selalu sama dengan proyekContoh() (dipakai lewat tombol "Impor JSON").
// Jika tes ini gagal setelah mengubah contoh.ts: buka aplikasi, klik "Kembalikan ke data contoh", lalu "Ekspor JSON"
// dan simpan hasilnya sebagai data/contoh/contoh.json.
describe('data/contoh/contoh.json', () => {
  it('valid dan sama dengan proyekContoh()', () => {
    const h = dariJson(readFileSync(new URL('../data/contoh/contoh.json', import.meta.url), 'utf8'));
    expect(h.ok).toBe(true);
    if (h.ok) expect(h.proyek).toEqual(proyekContoh());
  });
});
