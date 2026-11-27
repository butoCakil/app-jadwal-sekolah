import { describe, expect, it } from 'vitest';
import { proyekSekolah } from '../src/model/sekolahData';
import { kodeGuruSekolah, kunciNama } from '../src/model/sekolah';
import { usulKodeGuru } from '../src/model/kode';
import { validasiProyek } from '../src/model/validasi';
import { ruangDilarang } from '../src/mesin/validator';

describe('data sekolah (Gasal 2026/2027)', () => {
  const p = proyekSekolah('gasalAsc');
  it('valid dan lengkap', () => {
    expect(validasiProyek(p)).toEqual([]);
    expect(p.master.guru).toHaveLength(62);
    expect(p.master.rombel).toHaveLength(30);
    expect(p.master.ruang).toHaveLength(42);
    expect(p.beban).toHaveLength(406);
    expect(new Set(p.master.guru.map((g) => g.kode)).size).toBe(62);
  });
  it('tidak memuat NIP', () => {
    expect(JSON.stringify(p)).not.toMatch(/\d{10,}/);
  });
  it('kode guru memakai kode jadwal-te, Ahmat Arifin tidak bentrok dengan Arif Indra', () => {
    const kode = (n: string) => p.master.guru.find((g) => g.nama.startsWith(n))?.kode;
    expect(kode('Benny Surahman')).toBe('BEN');
    expect(kode('Arif Indra')).toBe('ARF');
    expect(kode('Ahmat Arifin')).toBe('AHM');
  });
  it('ruang: B2, C2, D2 bukan ruang belajar; ruang kelas berkode RK.', () => {
    const r = (k: string) => p.master.ruang.find((x) => x.kode === k);
    for (const k of ['B2', 'C2', 'D2']) expect(r(k)?.dijadwalkan).toBe(false);
    expect(r('RK.J1')?.jenis).toBe('teori');
    expect(r('B3')?.dijadwalkan).toBe(true);
  });
  it('aturan jurusan: TE tidak memakai lab AT, boleh G3 dan I3', () => {
    const b = p.beban.find((x) => p.master.rombel.find((r) => r.id === x.rombelId)?.jurusan === 'TE');
    expect(b).toBeDefined();
    const dilarang = ruangDilarang(p, b!);
    const id = (k: string) => p.master.ruang.find((x) => x.kode === k)?.id ?? '';
    expect(dilarang.has(id('M1'))).toBe(true);
    expect(dilarang.has(id('G2'))).toBe(true);
    expect(dilarang.has(id('G3'))).toBe(false);
    expect(dilarang.has(id('I3'))).toBe(false);
  });
});

describe('kode guru', () => {
  it('kunci nama dan pencocokan ejaan Excel', () => {
    expect(kunciNama('Sri Yumiyati, S.Pd')).toBe('sri yumiyati');
    expect(kodeGuruSekolah('Sri Yumiyati, S.Pd', [])).toBe('YUM');
  });
  it('usulan otomatis unik', () => {
    expect(usulKodeGuru('Ahmat Arifin, S.Pd', [])).toBe('AHM');
    expect(usulKodeGuru('Ahmat Arifin, S.Pd', ['AHM'])).toBe('AHA');
    expect(usulKodeGuru('Ahmat Arifin, S.Pd', ['AHM', 'AHA'])).toMatch(/^[A-Z]{2}[A-Z0-9]$/);
  });
});
