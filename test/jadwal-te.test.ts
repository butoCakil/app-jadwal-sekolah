import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dariJadwalTe, type BerkasJadwalTe } from '../src/io/imporJadwalTe';
import { proyekSekolah } from '../src/model/sekolahData';
import { validasiProyek } from '../src/model/validasi';
import { bebanUntukVersi, proyekUntukVersi, rombelTidakAktifIds, tambahVersi, versiUntukTanggal } from '../src/model/kalender';
import { kategoriMapel } from '../src/model/kategoriMapel';
import { adalahPelanggaran, periksa } from '../src/mesin/validator';
import { tanggalUntukPeriode } from '../src/ui/kalenderTab';

const sumber = JSON.parse(readFileSync(new URL('../data/sekolah/sumber/jadwal-te-gasal-2026.json', import.meta.url), 'utf8')) as BerkasJadwalTe;

describe('impor jadwal-te → Gasal 2026/2027', () => {
  const { proyek, laporan } = dariJadwalTe(sumber, 'uji');

  it('proyek sah', () => {
    expect(validasiProyek(proyek)).toEqual([]);
  });

  it('periode berisi sama berbagi satu versi; tiap versi punya beban sendiri', () => {
    expect(laporan.versi.map((v) => v.periode)).toEqual([['p_tka', 'p_tka2'], ['p_asaj'], ['p_genap'], ['p_asas']]);
    const ids = proyek.versi.map((v) => v.id);
    expect(new Set(proyek.beban.map((b) => b.versiId))).toEqual(new Set(ids));
    expect(proyek.kalender.map((k) => k.versiId)).toEqual(['v-reguler', 'v-asaj', 'v-reguler', 'v-genap', 'v-asas']);
  });

  it('jadwal tiap versi tidak bentrok (guru, rombel, ruang) menurut pemeriksa', () => {
    for (const v of proyek.versi) {
      const pv = proyekUntukVersi(proyek, v.id);
      const aktif = new Set(proyek.kalender.find((k) => k.versiId === v.id)?.rombelTidakAktif);
      const m = periksa(pv, v.slots, { skemaPerHari: proyek.polaReguler, rombelTidakAktif: aktif });
      const bentrok = m.filter((x) => adalahPelanggaran(x) && x.kategori === 'bentrok');
      console.log(v.id, 'slot', v.slots.length, 'bentrok', bentrok.length, bentrok.slice(0, 3).map((x) => x.pesan));
      expect(v.slots.every((s) => pv.beban.some((b) => b.id === s.bebanId))).toBe(true);
    }
  });

  it('beban versi ASAS hanya terlihat pada versi ASAS', () => {
    expect(bebanUntukVersi(proyek.beban, 'v-asas').every((b) => b.versiId === 'v-asas')).toBe(true);
    expect(bebanUntukVersi(proyek.beban, 'v-reguler').some((b) => b.versiId === 'v-asas')).toBe(false);
  });

  it('data bawaan gasal memuat catatan', () => {
    console.log(laporan.catatan.join('\n'));
    console.log(JSON.stringify(laporan.versi));
    const p = proyekSekolah('gasal');
    expect(p.periodeAktifId).toBe('k-asas');
    expect(versiUntukTanggal('2026-12-01', p)?.id).toBe('v-asas');
    expect(rombelTidakAktifIds('2026-12-01', p.kalender).has('k2')).toBe(true);
  });

  it('tanggal acuan periode maju ke hari kerja pertama', () => {
    const g = { id: 'x', nama: 'x', jenis: 'lain', mulai: '2027-01-03', selesai: '2027-06-18', rombelTidakAktif: [] } as const;
    expect(tanggalUntukPeriode(g as never, '2026-01-01')).toBe('2027-01-04');
    expect(tanggalUntukPeriode({ ...g, mulai: '2027-01-04' } as never, '2026-01-01')).toBe('2027-01-04');
  });

  it('versi baru menyalin beban khusus versi sumber beserta slotnya, tanpa menggandakan beban umum', () => {
    const p = proyekSekolah('gasal');
    const asas = p.versi.find((v) => v.id === 'v-asas');
    const nBeban = p.beban.length;
    const salin = tambahVersi(p, asas, 'v-uji', 'Uji', true);
    expect(p.beban.length).toBe(nBeban + p.beban.filter((b) => b.versiId === 'v-asas').length);
    expect(salin.slots.length).toBe(asas?.slots.length);
    const ids = new Set(bebanUntukVersi(p.beban, 'v-uji').map((b) => b.id));
    expect(salin.slots.every((s) => ids.has(s.bebanId))).toBe(true);
    expect(validasiProyek(p)).toEqual([]);
    const kosong = tambahVersi(p, asas, 'v-kosong', 'Kosong', false);
    expect(kosong.slots).toEqual([]);
    expect(bebanUntukVersi(p.beban, 'v-kosong').length).toBe(ids.size);
  });

  it('kategori mapel: manual menang, elemen mengikuti induk, sisanya dari kode', () => {
    const p = proyekSekolah('gasal');
    const kat = (kode: string) => kategoriMapel(p.master.mapel.find((m) => m.kode === kode) as never, p.master.mapel);
    expect(kat('BI')).toBe('Normatif');
    expect(kat('MTK')).toBe('Adaptif');
    expect(kat('DLE')).toBe('Jurusan TE');
    expect(kat('kk.DKV')).toBe('Jurusan DKV');
    expect(kat('ASAJ')).toBe('Belum dikategorikan');
    expect(kategoriMapel({ kode: 'MTK', kategori: 'Jurusan TE' }, [])).toBe('Jurusan TE');
  });
});

describe('periode bersarang', () => {
  it('ASAS di dalam TKA lanjutan: kelas PKL milik TKA lanjutan aktif kembali saat ASAS', () => {
    const p = proyekSekolah('gasal');
    const id = (kode: string) => p.master.rombel.find((r) => r.kode === kode)!.id;
    const tdk = rombelTidakAktifIds('2026-11-30', p.kalender);
    expect(tdk.has(id('XI AT 1'))).toBe(false);
    expect(tdk.has(id('XI DKV 3'))).toBe(false);
    expect(tdk.has(id('X TE 1'))).toBe(true);
    expect(rombelTidakAktifIds('2026-12-08', p.kalender, p.semesters?.[0]).has(id('XI AT 1'))).toBe(true);
  });
});
