import { describe, expect, it } from 'vitest';
import { proyekSekolah } from '../src/model/sekolahData';
import { validasiProyek } from '../src/model/validasi';
import { kembalikanBagian } from '../src/ui/bawaan';
import { bandingkan, type Bagian } from '../src/sinkron/banding';

const bawaan = proyekSekolah('tahun');

describe('kembali ke bawaan per bagian', () => {
  it('data bawaan memuat skema mingguan buatan admin dan ASAS memakainya', () => {
    expect(bawaan.polaLain?.map((q) => q.nama)).toEqual(['Skema Pemadatan TKA', 'Skema TKA Gelombang 1', 'Skema TKA Gelombang 2', 'Skema UKK Kelas XII', 'Skema Tanpa Pembiasaan', 'Skema Full Pembiasaan']);
    expect(bawaan.kalender.find((k) => k.id === 'k-asas')?.polaId).toBe('pola_5');
  });

  it('hanya bagian terpilih yang kembali; yang lain tetap persis seperti di sini', () => {
    const lokal = structuredClone(bawaan);
    lokal.skema[0]!.nama = 'Skema saya';
    lokal.polaLain![0]!.nama = 'Nama pola saya';
    lokal.master.guru[0]!.nama = 'Guru saya';
    lokal.kalender.pop();
    const h = kembalikanBagian(lokal, new Set<Bagian>(['Skema jam', 'Kalender dan kegiatan']));
    expect(h.ok).toBe(true);
    if (!h.ok) return;
    expect(h.proyek.skema[0]!.nama).toBe(bawaan.skema[0]!.nama);
    expect(h.proyek.kalender.map((k) => k.id)).toEqual(bawaan.kalender.map((k) => k.id));
    expect(h.proyek.polaLain![0]!.nama).toBe('Nama pola saya');
    expect(h.proyek.master.guru[0]!.nama).toBe('Guru saya');
    expect(validasiProyek(h.proyek)).toEqual([]);
  });

  it('semua bagian dipilih = sama dengan bawaan', () => {
    const lokal = structuredClone(bawaan);
    lokal.skema[0]!.nama = 'X';
    lokal.beban[0]!.jp += 2;
    lokal.versi[0]!.slots.pop();
    lokal.polaLain!.pop();
    const semua = new Set(bandingkan(lokal, bawaan, null).map((b) => b.bagian));
    const h = kembalikanBagian(lokal, semua);
    expect(h.ok).toBe(true);
    if (h.ok) expect(bandingkan(h.proyek, bawaan, null)).toEqual([]);
  });

  it('data yang tidak berbeda tidak diubah sama sekali', () => {
    const h = kembalikanBagian(structuredClone(bawaan), new Set<Bagian>(['Jadwal']));
    expect(h.ok).toBe(true);
    if (h.ok) expect(bandingkan(h.proyek, bawaan, null)).toEqual([]);
  });
});
