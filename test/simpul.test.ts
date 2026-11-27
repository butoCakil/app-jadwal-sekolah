import { describe, expect, it } from 'vitest';
import { proyekSekolah } from '../src/model/sekolahData';
import { validasiProyek } from '../src/model/validasi';
import { versiReguler } from '../src/model/kalender';
import { adalahPelanggaran } from '../src/mesin/validator';
import { alihkanPerubahan, bebanKegiatan, bebanUntukDiubah, hapusBebanKegiatan, ikutInduk, kembalikanBeban, terdampak } from '../src/model/simpul';
import { hitungTurunan } from '../src/ui/turunan';
import type { Kegiatan, Proyek } from '../src/model/tipe';

const kodeKe = (p: Proyek, kode: string) => p.master.rombel.find((r) => r.kode === kode)!.id;

/** Kegiatan model warisan baru pada pekan 7-11 Des 2026 (semua kelas mula-mula ikut induk). */
function kegiatanBaru(p: Proyek, hariBerlaku?: number[]): Kegiatan {
  p.versi.push({ id: 'v-uji', nama: 'Uji', jenis: 'varian', slots: [] });
  const g: Kegiatan = { id: 'k-uji', nama: 'Uji', jenis: 'TKA', mulai: '2026-12-07', selesai: '2026-12-11', rombelTidakAktif: [...(p.semesters?.[0]?.rombelTidakAktif ?? [])], versiId: 'v-uji', rombelTerdampak: [], ...(hariBerlaku ? { hariBerlaku } : {}) };
  p.kalender.push(g);
  return g;
}

describe('data Gasal: induk dan kegiatan', () => {
  const p = proyekSekolah('gasal');
  it('punya semester induk dan dua kegiatan model warisan; valid', () => {
    expect(p.semesters?.[0]).toMatchObject({ nama: 'Gasal 2026/2027', mulai: '2026-07-12', selesai: '2026-12-18' });
    expect(p.kalender.map((g) => [g.id, g.jenis])).toEqual([['k-asaj', 'ASAJ'], ['k-asas', 'ASAS']]);
    expect(p.kalender.every((g) => Array.isArray(g.rombelTerdampak))).toBe(true);
    expect(validasiProyek(p)).toEqual([]);
  });
  it('ASAS (30 Nov): 5 kelas XI belajar, 240 JP, tanpa bentrok', () => {
    const t = hitungTurunan(p, '2026-11-30');
    expect(t.periode?.id).toBe('k-asas');
    expect(t.slots.length).toBe(240);
    expect(t.jumlahPelanggaran).toBe(0);
    const g = p.kalender.find((x) => x.id === 'k-asas')!;
    expect(['XI TE 2', 'XI TE 3', 'XI AT 1', 'XI AT 2', 'XI DKV 3'].every((k) => terdampak(g, kodeKe(p, k)))).toBe(true);
  });
  it('ASAJ (16 Nov) dan induk (7 Des): tanpa bentrok', () => {
    // data sumber ASAJ: satu tugas (XI TE 2 PMM) terjadwal 1 JP lebih dari bebannya; selain itu tanpa pelanggaran
    expect(hitungTurunan(p, '2026-11-16').masalah.filter(adalahPelanggaran).map((m) => m.jenis)).toEqual(['jp-lebih']);
    const t = hitungTurunan(p, '2026-12-07');
    expect(t.periode).toBeUndefined();
    expect(t.slots.length).toBe(versiReguler(p)!.slots.length);
    // data sumber reguler: X TE 1 IPAS Selasa jam 6-10 di N2 (ruang lab yang terlarang untuk TE); sudah ada sejak jadwal-te
    expect(new Set(t.masalah.filter(adalahPelanggaran).map((m) => m.pesan.replace(/pelajaran ke-\d+/, '')))).toEqual(new Set(['X TE 1 IPAS pada Selasa,  memakai ruang N2 yang terlarang untuk beban ini.']));
  });
  it('fokus induk pada pekan ASAS menampilkan jadwal reguler', () => {
    const t = hitungTurunan(p, '2026-11-30', 'sem:gasal');
    expect(t.periode).toBeUndefined();
    expect(t.slots.length).toBe(versiReguler(p)!.slots.length);
  });
});

describe('kegiatan model warisan', () => {
  it('kelas yang ikut induk tampil dari induk; mengubahnya menjadikannya khusus (induk tidak berubah)', () => {
    const p = proyekSekolah('gasal');
    const g = kegiatanBaru(p);
    const reg = versiReguler(p)!;
    const sebelum = JSON.stringify(reg.slots);
    const t = hitungTurunan(p, '2026-12-07');
    expect(t.periode?.id).toBe('k-uji');
    expect(t.slots.length).toBe(reg.slots.length);
    const r = kodeKe(p, 'X TE 1');
    const s = t.slots.find((x) => p.beban.find((b) => b.id === x.bebanId)?.rombelId === r)!;
    const h = alihkanPerubahan(p, t.pekan, t.slots.filter((x) => x.id !== s.id), 'auto');
    expect(h).toMatchObject({ ok: true, baruTerdampak: [r] });
    expect(JSON.stringify(reg.slots)).toBe(sebelum);
    const t2 = hitungTurunan(p, '2026-12-07');
    expect(t2.slots.length).toBe(reg.slots.length - 1);
    expect(terdampak(g, r)).toBe(true);
    // kembali ikut induk
    ikutInduk(p, g, r);
    expect(hitungTurunan(p, '2026-12-07').slots.length).toBe(reg.slots.length);
  });

  it('beban: diubah di kegiatan menjadi pengecualian; dihapus; dikembalikan', () => {
    const p = proyekSekolah('gasal');
    const g = kegiatanBaru(p);
    const r = kodeKe(p, 'XI TE 2');
    const asli = p.beban.find((b) => b.rombelId === r && !b.versiId)!;
    const id = bebanUntukDiubah(p, g, asli.id);
    expect(id).not.toBe(asli.id);
    p.beban.find((b) => b.id === id)!.jp += 2;
    expect(p.beban.find((b) => b.id === asli.id)!.jp).toBe(asli.jp);
    expect(bebanKegiatan(p, g).some((b) => b.id === id)).toBe(true);
    expect(bebanKegiatan(p, g).some((b) => b.id === asli.id)).toBe(false);
    // slot kegiatan dialihkan ke salinan
    const v = p.versi.find((x) => x.id === 'v-uji')!;
    expect(v.slots.some((s) => s.bebanId === id)).toBe(true);
    kembalikanBeban(p, g, id);
    expect(bebanKegiatan(p, g).some((b) => b.id === asli.id)).toBe(true);
    hapusBebanKegiatan(p, g, asli.id);
    expect(bebanKegiatan(p, g).some((b) => b.id === asli.id || b.asal === asli.id)).toBe(false);
    expect(p.beban.some((b) => b.id === asli.id)).toBe(true);
    expect(validasiProyek(p)).toEqual([]);
  });

  it('hari tertentu: kegiatan hanya Senin; Selasa mengikuti induk dan perubahan di sana ditolak saat fokus kegiatan', () => {
    const p = proyekSekolah('gasal');
    kegiatanBaru(p, [0]);
    const t = hitungTurunan(p, '2026-12-07', 'k-uji');
    expect(t.pekan.kegiatanHari.map((g) => g?.id ?? '')).toEqual(['k-uji', '', '', '', '']);
    const selasa = t.slots.find((s) => s.hari === 1)!;
    const h = alihkanPerubahan(p, t.pekan, t.slots.filter((x) => x.id !== selasa.id), 'k-uji');
    expect(h.ok).toBe(false);
    const senin = t.slots.find((s) => s.hari === 0)!;
    expect(alihkanPerubahan(p, t.pekan, t.slots.filter((x) => x.id !== senin.id), 'k-uji').ok).toBe(true);
    const v = p.versi.find((x) => x.id === 'v-uji')!;
    expect(v.slots.every((s) => s.hari === 0)).toBe(true);
  });
});

describe('data Tahun 2026/2027: dua semester induk dan kegiatan dari PDF aSc', () => {
  const p = proyekSekolah('tahun');
  it('dua semester, enam kegiatan Gasal, valid', () => {
    expect(p.semesters?.map((s) => [s.id, s.mulai, s.selesai])).toEqual([['gasal', '2026-07-13', '2026-12-18'], ['genap', '2027-01-04', '2027-06-18']]);
    expect(p.kalender.filter((g) => !g.agenda).map((g) => g.id)).toEqual(['k-pemadatan', 'k-tka1', 'k-tka2', 'k-asaj', 'k-ukk', 'k-asas', 'k-pkl-xii-gasal', 'k-pkl-xii-genap']);
    expect(p.kalender.filter((g) => g.agenda).length).toBe(56);
    expect(validasiProyek(p)).toEqual([]);
  });
  it('tiap pekan memakai jadwal yang benar', () => {
    const cek = (tgl: string) => {
      const t = hitungTurunan(p, tgl);
      return [t.periode?.id ?? t.semester?.id, t.slots.length];
    };
    expect(cek('2026-11-09')).toEqual(['gasal', 1200]);
    expect(cek('2026-10-05')).toEqual(['k-pemadatan', 1200]);
    expect(cek('2026-10-26')).toEqual(['k-tka1', 595]);
    expect(cek('2026-11-02')).toEqual(['k-tka2', 1000]);
    expect(cek('2026-11-16')).toEqual(['k-asaj', 720]);
    expect(cek('2026-11-23')).toEqual(['k-ukk', 720]);
    expect(cek('2026-11-30')).toEqual(['k-asas', 239]);
    expect(cek('2026-12-07')).toEqual(['gasal', 1200]);
    expect(cek('2026-12-14')).toEqual(['k-pkl-xii-gasal', 1200 - 48 * 10]);
    expect(cek('2027-01-04')).toEqual(['k-pkl-xii-genap', 0]);
    expect(cek('2027-04-19')).toEqual(['genap', 0]);
  });
  it('agenda kalender akademik tidak mengubah jadwal (mis. libur Maulid 25 Agu tetap ada KBM)', () => {
    const t = hitungTurunan(p, '2026-08-24');
    expect(t.periode).toBeUndefined();
    expect(t.hari[1]?.info.alasan).toBe('normal');
    expect(t.slots.length).toBe(1200);
  });
  it('beban Genap terpisah dari Gasal; pola UKK 10,10,11,11,9', () => {
    const gasal = hitungTurunan(p, '2026-12-07').beban.length;
    const genap = hitungTurunan(p, '2027-01-04').beban.length;
    expect(gasal).toBeGreaterThan(0);
    expect(genap).toBeGreaterThan(0);
    expect(hitungTurunan(p, '2027-01-04').beban.every((b) => b.versiId === 'v-genap')).toBe(true);
    const ukk = p.kalender.find((g) => g.id === 'k-ukk')!;
    expect(p.polaLain?.find((x) => x.id === ukk.polaId)?.pola).toEqual(['skema10', 'skema10', 'skema11', 'skema11', 'skema9']);
  });
  it('tanpa bentrok kecuali temuan data sumber Pemadatan', () => {
    for (const t of ['2026-11-09', '2026-10-26', '2026-11-02', '2026-11-16', '2026-11-23']) expect(hitungTurunan(p, t).jumlahPelanggaran).toBe(0);
    // ASAS: PSRT XI TE 2 dipindah dari D1 (ruang ujian) ke B3; bentrok dengan pengawas sudah diterima (keputusan lapangan)
    const asas = hitungTurunan(p, '2026-11-30');
    expect(asas.jumlahPelanggaran).toBe(0);
    expect(asas.masalah.filter((m) => m.diterima).map((m) => m.jenis)).toEqual(Array(4).fill('pengawas-bentrok'));
    const pem = hitungTurunan(p, '2026-10-05').masalah.filter(adalahPelanggaran);
    expect(new Set(pem.map((m) => m.jenis))).toEqual(new Set(['bentrok-guru', 'ruang-terlarang']));
  });
  it('mengubah induk Genap tidak menyentuh Gasal', () => {
    const q = proyekSekolah('tahun');
    const t = hitungTurunan(q, '2027-01-04', 'sem:genap');
    const b = t.beban.find((x) => !x.nonTatapMuka)!;
    const h = alihkanPerubahan(q, t.pekan, [{ id: 'baru1', bebanId: b.id, hari: 0, jam: 1, ruangId: '' }], 'sem:genap');
    expect(h.ok).toBe(true);
    expect(q.versi.find((v) => v.id === 'v-genap')!.slots.length).toBe(1);
    expect(q.versi.find((v) => v.id === 'v-gasal')!.slots.length).toBe(1200);
  });
});
