import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { proyekContoh } from '../src/model/contoh';
import { keJson } from '../src/io/simpan';

// Menjaga data/contoh/contoh.json selalu sama dengan proyekContoh() (impor lewat tombol "Impor JSON").
describe('data/contoh', () => {
  it('menulis contoh.json', () => {
    writeFileSync(new URL('../data/contoh/contoh.json', import.meta.url), keJson(proyekContoh()) + '\n');
    expect(true).toBe(true);
  });
});
