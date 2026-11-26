import { describe, expect, it } from 'vitest';
import { hitungSkema, kapasitasKbm, skemaBawaan, jumlahJamTampil, cekSkema } from '../src/model/skema';
import { hariPekan, kapasitasPola, polaUntukTanggal, rombelAktif, selisihKapasitas, skemaUntukTanggal } from '../src/model/kalender';
import { petakanSlot } from '../src/model/jadwal';
import { proyekContoh } from '../src/model/contoh';
import { validasiProyek } from '../src/model/validasi';

const [s11, s10, s9] = skemaBawaan() as [ReturnType<typeof skemaBawaan>[0], ReturnType<typeof skemaBawaan>[0], ReturnType<typeof skemaBawaan>[0]];

describe('skema bawaan = poster resmi', () => {
  it('waktu tiap baris cocok dengan poster', () => {
    const w = (s: typeof s11) => hitungSkema(s).map((b) => `${b.label} ${b.mulai}-${b.selesai}`);
    expect(w(s11)).toEqual([
      '1 07:00-07:40', '2 07:40-08:20', '3 08:20-09:00', '4 09:00-09:40', 'B1 09:40-09:55',
      '5 09:55-10:35', '6 10:35-11:15', '7 11:15-11:55', 'B2 11:55-12:35',
      '8 12:35-13:15', '9 13:15-13:55', '10 13:55-14:35', '11 14:35-15:15',
    ]);
    expect(w(s10)).toEqual([
      '1 07:00-07:45', '2 07:45-08:30', '3 08:30-09:15', 'B1 09:15-09:30',
      '4 09:30-10:15', '5 10:15-11:00', '6 11:00-11:45', 'B2 11:45-12:35',
      '7 12:35-13:15', '8 13:15-13:55', '9 13:55-14:35', '10 14:35-15:15',
    ]);
    expect(w(s9)).toEqual([
      '1 07:00-07:40', '2 07:40-08:20', '3 08:20-09:00', '4 09:00-09:40', 'B1 09:40-10:00',
      '5 10:00-10:40', '6 10:40-11:20', '7 11:20-12:00', 'B2 12:00-12:50',
      '8 12:50-13:30', '9 13:30-14:10',
    ]);
  });

  it('penomoran ganda: Pembiasaan = jam ke-0 internal tetapi tampil 1; skema 10 mulai dari 1', () => {
    const h11 = hitungSkema(s11).filter((b) => b.nomorKbm !== null);
    expect(h11[0]).toMatchObject({ nomorKbm: 0, label: '1' });
    expect(h11[1]).toMatchObject({ nomorKbm: 1, label: '2' });
    expect(h11.at(-1)).toMatchObject({ nomorKbm: 10, label: '11' });
    const h10 = hitungSkema(s10).filter((b) => b.nomorKbm !== null);
    expect(h10[0]).toMatchObject({ nomorKbm: 1, label: '1' });
    expect(h10.at(-1)).toMatchObject({ nomorKbm: 10, label: '10' });
  });

  it('kapasitas KBM dan jumlah jam tampil', () => {
    expect([s11, s10, s9].map(kapasitasKbm)).toEqual([10, 10, 8]);
    expect([s11, s10, s9].map(jumlahJamTampil)).toEqual([11, 10, 9]);
    expect([s11, s10, s9].flatMap(cekSkema)).toEqual([]);
  });
});

describe('pola mingguan', () => {
  const sk = skemaBawaan();
  it('[11,10,10,11,9] = 48 JP KBM', () => {
    const k = kapasitasPola(['skema11', 'skema10', 'skema10', 'skema11', 'skema9'], sk);
    expect(k.perHari).toEqual([10, 10, 10, 10, 8]);
    expect(k.total).toBe(48);
  });
  it('[10,10,11,11,9] = 48 JP KBM', () => {
    expect(kapasitasPola(['skema10', 'skema10', 'skema11', 'skema11', 'skema9'], sk).total).toBe(48);
  });
  it('selisih terhadap kebutuhan sumber ditandai (51 dan 49 vs 48)', () => {
    const p = proyekContoh();
    const sel = selisihKapasitas(p.master.rombel, kapasitasPola(p.polaReguler, p.skema));
    expect(sel.map((s) => [s.rombelId, s.selisih])).toEqual([['r1', 3], ['r2', 1]]);
  });
});

describe('kalender', () => {
  const p = proyekContoh();
  it('hari dalam pekan', () => {
    expect(hariPekan('2026-11-26')).toBe(3); // Kamis
    expect(hariPekan('2026-11-30')).toBe(0); // Senin
    expect(hariPekan('2026-11-29')).toBe(6); // Minggu
    expect(() => hariPekan('2026-02-30')).toThrow();
  });
  it('di luar kegiatan memakai pola reguler', () => {
    expect(polaUntukTanggal('2026-11-26', p).sumber).toBe('reguler');
    expect(skemaUntukTanggal('2026-11-26', p).skemaId).toBe('skema11'); // Kamis
    expect(skemaUntukTanggal('2026-11-24', p).skemaId).toBe('skema10'); // Selasa
  });
  it('pekan kegiatan memakai pola kegiatan', () => {
    expect(skemaUntukTanggal('2026-11-30', p)).toMatchObject({ skemaId: 'skema10', sumber: 'kegiatan' }); // Senin: reguler 11 -> 10
    expect(skemaUntukTanggal('2026-12-02', p).skemaId).toBe('skema11'); // Rabu: reguler 10 -> 11
    expect(skemaUntukTanggal('2026-12-04', p).skemaId).toBe('skema9');
  });
  it('libur dan akhir pekan tidak punya skema', () => {
    expect(skemaUntukTanggal('2026-12-25', p)).toMatchObject({ skemaId: null, alasan: 'libur' });
    expect(skemaUntukTanggal('2026-11-28', p)).toMatchObject({ skemaId: null, alasan: 'akhirPekan' });
  });
  it('penggantian manual menang atas kalender dan reguler', () => {
    const m = { ...p, penggantiManual: { pola: ['skema9', 'skema9', 'skema9', 'skema9', 'skema9'] as never } };
    expect(skemaUntukTanggal('2026-11-30', m)).toMatchObject({ skemaId: 'skema9', sumber: 'manual' });
    const berentang = { ...p, penggantiManual: { pola: m.penggantiManual.pola, mulai: '2026-12-01', selesai: '2026-12-01' } };
    expect(skemaUntukTanggal('2026-11-30', berentang).sumber).toBe('kegiatan');
    expect(skemaUntukTanggal('2026-12-01', berentang).sumber).toBe('manual');
  });
  it('kegiatan tumpang tindih: yang mulai paling akhir dipakai', () => {
    const q = proyekContoh();
    q.kalender.push({
      id: 'k3', nama: 'UKK', jenis: 'UKK', mulai: '2026-12-02', selesai: '2026-12-03',
      pola: ['skema9', 'skema9', 'skema9', 'skema9', 'skema9'], rombelTidakAktif: ['r2'],
    });
    expect(polaUntukTanggal('2026-12-02', q)).toMatchObject({ sumber: 'kegiatan', kegiatanId: 'k3' });
    expect(polaUntukTanggal('2026-12-01', q).kegiatanId).toBe('k1');
    expect(rombelAktif('2026-12-02', q.kalender, q.master.rombel).map((r) => r.id)).toEqual(['r1']);
    expect(rombelAktif('2026-12-01', q.kalender, q.master.rombel).map((r) => r.id)).toEqual(['r1', 'r2']);
  });
});

describe('petakan slot ke skema (tampungan)', () => {
  const p = proyekContoh();
  const slots = p.versi[0]!.slots;
  const r1 = slots.filter((s) => s.rombelId === 'r1');
  it('pola [11,10,10,11,9]: hanya Jum\'at jam 9 masuk tampungan', () => {
    const h = petakanSlot(r1, ['skema11', 'skema10', 'skema10', 'skema11', 'skema9'], p.skema);
    expect(h.tampungan.map((s) => s.id)).toEqual(['a7']);
    expect(h.ditempatkan).toHaveLength(r1.length - 1);
  });
  it('pola [10,10,11,11,9]: hasil sama karena jam 10 masih muat di skema 10 dan 11', () => {
    const h = petakanSlot(r1, ['skema10', 'skema10', 'skema11', 'skema11', 'skema9'], p.skema);
    expect(h.tampungan.map((s) => s.id)).toEqual(['a7']);
  });
  it('hari tanpa skema (libur) memindahkan semua slot hari itu ke tampungan', () => {
    const h = petakanSlot(r1, [null, 'skema10', 'skema10', 'skema11', 'skema9'], p.skema);
    expect(h.tampungan.map((s) => s.id).sort()).toEqual(['a1', 'a2', 'a3', 'a7']);
  });
  it('tidak ada slot yang hilang', () => {
    const h = petakanSlot(slots, ['skema9', 'skema9', 'skema9', 'skema9', 'skema9'], p.skema);
    expect(h.ditempatkan.length + h.tampungan.length).toBe(slots.length);
  });
});

describe('validasi proyek', () => {
  it('contoh lolos', () => expect(validasiProyek(proyekContoh())).toEqual([]));
  it('menolak versi asing, pola dengan skema tak dikenal, dan tanggal rusak', () => {
    expect(validasiProyek({ versiSkemaData: 99 })[0]).toMatch(/tidak didukung/);
    const a = proyekContoh();
    a.polaReguler[0] = 'tidakAda';
    expect(validasiProyek(a).join(' ')).toMatch(/tidakAda/);
    const b = proyekContoh();
    b.kalender[0]!.mulai = '2026-13-01';
    expect(validasiProyek(b).length).toBeGreaterThan(0);
  });
});
