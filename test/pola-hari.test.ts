import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { proyekContoh } from '../src/model/contoh';
import { proyekSekolah } from '../src/model/sekolahData';
import { validasiProyek } from '../src/model/validasi';
import { daftarPola, jadikanDefault, jumlahHariKerja, migrasiPola, pemakaiPola, polaUntukTanggal, skemaUntukTanggal, tambahPola, ubahJumlahHari } from '../src/model/kalender';
import { hitungTurunan } from '../src/ui/turunan';
import { susun } from '../src/mesin/solver';
import { periksa, adalahPelanggaran } from '../src/mesin/validator';
import { daftarDataset, hapusDataset, simpanDataset } from '../src/io/simpan';
import { seninPekan } from '../src/ui/util';

describe('pola mingguan bernama', () => {
  it('pola baru dari kosong memakai skema pertama; salinan sama dengan sumber', () => {
    const p = proyekContoh();
    const a = tambahPola(p, 'Puasa');
    expect(p.polaLain?.find((x) => x.id === a)?.pola).toEqual(Array(5).fill(p.skema[0]?.id));
    const b = tambahPola(p, 'Salinan', p.polaRegulerId ?? 'reguler');
    expect(p.polaLain?.find((x) => x.id === b)?.pola).toEqual(p.polaReguler);
    expect(new Set(daftarPola(p).map((x) => x.id)).size).toBe(4); // default + ASAS contoh + 2 baru
    expect(validasiProyek(p)).toEqual([]);
  });
  it('menjadikan pola default menukar identitas dan isi; periode yang memakai pola tetap benar', () => {
    const p = proyekContoh();
    const lamaIsi = [...p.polaReguler];
    const asas = daftarPola(p).find((x) => x.nama.startsWith('Pola ASAS'))!;
    // 1 Des 2026 (Selasa) ada di periode ASAS yang memakai pola_asas
    const sebelum = polaUntukTanggal('2026-12-01', p);
    expect(sebelum).toMatchObject({ sumber: 'kegiatan' });
    jadikanDefault(p, asas.id);
    expect(p.polaReguler).toEqual(asas.pola);
    expect(p.polaRegulerId).toBe(asas.id);
    const lama = daftarPola(p).find((x) => !x.default && x.pola.join() === lamaIsi.join());
    expect(lama?.nama).toBe('Pola reguler');
    // tanggal di luar periode memakai default baru; periode tetap memakai pola yang sama isinya
    expect(polaUntukTanggal('2026-12-01', p).pola).toEqual(sebelum.pola);
    expect(polaUntukTanggal('2026-11-24', p).pola).toEqual(asas.pola);
    expect(validasiProyek(p)).toEqual([]);
  });
  it('pola yang dipakai kegiatan terdaftar sebagai pemakai; kegiatan menunjuk pola yang tidak ada ditolak validasi', () => {
    const p = proyekContoh();
    expect(pemakaiPola(p, 'pola_asas')).toEqual(['Pekan ASAS (contoh)']);
    p.kalender[0]!.polaId = 'tidak-ada';
    expect(validasiProyek(p).some((g) => g.includes('pola mingguan tidak ada'))).toBe(true);
  });
  it('migrasi memindahkan pola tertanam format lama ke daftar pola', () => {
    const p = proyekContoh();
    p.polaLain = [];
    delete p.kalender[0]!.polaId;
    p.kalender[0]!.pola = ['skema9', 'skema9', 'skema9', 'skema9', 'skema9'];
    migrasiPola(p);
    expect(p.kalender[0]!.pola).toBeUndefined();
    const id = p.kalender[0]!.polaId!;
    expect(daftarPola(p).find((x) => x.id === id)?.pola).toEqual(['skema9', 'skema9', 'skema9', 'skema9', 'skema9']);
    expect(validasiProyek(p)).toEqual([]);
  });
});

describe('hari kerja 5 atau 6', () => {
  it('6 hari: Sabtu berskema, Minggu bukan hari kerja; kembali ke 5 hari memotong pola', () => {
    const p = proyekContoh();
    expect(skemaUntukTanggal('2026-12-12', p)).toMatchObject({ skemaId: null, alasan: 'akhirPekan' }); // Sabtu
    ubahJumlahHari(p, 6);
    expect(jumlahHariKerja(p)).toBe(6);
    expect(p.polaReguler).toHaveLength(6);
    expect(p.polaLain?.every((x) => x.pola.length === 6)).toBe(true);
    expect(validasiProyek(p)).toEqual([]);
    expect(skemaUntukTanggal('2026-12-12', p).skemaId).toBe(p.skema[0]?.id);
    expect(skemaUntukTanggal('2026-12-13', p)).toMatchObject({ skemaId: null, alasan: 'akhirPekan' }); // Minggu
    ubahJumlahHari(p, 5);
    expect(p.polaReguler).toHaveLength(5);
    expect(validasiProyek(p)).toEqual([]);
  });
  it('turunan memuat 6 kolom hari; pekan Sabtu tetap pekan yang sama', () => {
    const p = proyekContoh();
    ubahJumlahHari(p, 6);
    expect(hitungTurunan(p, '2026-12-12').hari).toHaveLength(6);
    expect(hitungTurunan(p, '2026-12-12').senin).toBe('2026-12-07');
    expect(seninPekan('2026-12-12', 6)).toBe('2026-12-07');
    expect(seninPekan('2026-12-12', 5)).toBe('2026-12-14'); // 5 hari: Sabtu dianggap pekan berikutnya
  });
  it('solver memakai hari Sabtu bila 6 hari kerja', () => {
    const p = proyekSekolah('genap');
    ubahJumlahHari(p, 6);
    const kl = structuredClone(p);
    const per = kl.kalender.find((g) => g.id === kl.periodeAktifId)!;
    kl.beban = kl.beban.filter((b) => !per.rombelTidakAktif.includes(b.rombelId));
    const h = susun(kl, { skemaPerHari: kl.polaReguler, batasMs: 3000, benih: 2 });
    expect(h.slots.some((s) => s.hari === 5)).toBe(true);
    expect(periksa(kl, h.slots, { skemaPerHari: kl.polaReguler }).filter(adalahPelanggaran)).toEqual([]);
    // kapasitas 6 hari lebih besar: JP yang tidak muat lebih sedikit daripada 5 hari (40 JP)
    expect(h.total - h.terjadwal).toBeLessThan(40);
  }, 30000);
});

describe('dataset tersimpan', () => {
  it('simpan, daftar (terbaru dulu), dan hapus', async () => {
    const a = proyekSekolah('gasalAsc');
    const b = proyekContoh();
    await simpanDataset({ id: 'a', nama: 'Gasal', disimpan: '2026-11-01T00:00:00.000Z', proyek: a });
    await simpanDataset({ id: 'b', nama: 'Contoh', disimpan: '2026-11-02T00:00:00.000Z', proyek: b });
    const d = await daftarDataset();
    expect(d.map((x) => x.id)).toEqual(['b', 'a']);
    expect(d[1]?.proyek.beban).toHaveLength(a.beban.length);
    await hapusDataset('b');
    expect((await daftarDataset()).map((x) => x.id)).toEqual(['a']);
    await hapusDataset('a');
    expect(await daftarDataset()).toEqual([]);
  });
});
