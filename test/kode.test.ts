import { describe, expect, it } from 'vitest';
import { kodeGuruBerikut, kodeGuruKe, usulKodeMapel } from '../src/model/kode';

describe('kode guru', () => {
  it('A-Z lalu AA-ZZ', () => {
    expect([0, 1, 25, 26, 27, 51, 52].map(kodeGuruKe)).toEqual(['A', 'B', 'Z', 'AA', 'AB', 'AZ', 'BA']);
    expect(kodeGuruKe(26 + 26 * 26 - 1)).toBe('ZZ');
  });
  it('mengisi kode kosong paling awal', () => {
    expect(kodeGuruBerikut(['A', 'B', 'D'])).toBe('C');
    expect(kodeGuruBerikut([])).toBe('A');
    expect(kodeGuruBerikut('ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''))).toBe('AA');
  });
});

describe('usul kode mapel', () => {
  it('inisial untuk banyak kata, tiga huruf untuk satu kata', () => {
    expect(usulKodeMapel('Bahasa Indonesia', [])).toBe('BI');
    expect(usulKodeMapel('Matematika', [])).toBe('MAT');
    expect(usulKodeMapel('Pendidikan Agama dan Budi Pekerti', [])).toBe('PAB');
  });
  it('selalu unik dan maksimal 3 karakter', () => {
    const k = usulKodeMapel('Bahasa Inggris', ['BI']);
    expect(k).not.toBe('BI');
    expect(k.length).toBeLessThanOrEqual(3);
    expect(usulKodeMapel('', [])).toBe('MPL');
  });
});
