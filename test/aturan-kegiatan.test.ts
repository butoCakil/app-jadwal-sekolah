import { describe, expect, it } from 'vitest';
import { proyekContoh } from '../src/model/contoh';
import { proyekSekolah } from '../src/model/sekolahData';
import { validasiProyek } from '../src/model/validasi';
import { aturanPekan, jpBeririsan, ruangTerkunciPada, type AturanPekan } from '../src/model/aturanKegiatan';
import { ruangDiluarPrioritas, susun } from '../src/mesin/solver';
import { adalahPelanggaran, periksa } from '../src/mesin/validator';
import { rencanaPindah, tentukanRuang } from '../src/mesin/penempatan';
import { hitungTurunan } from '../src/ui/turunan';
import { polaUntukTanggal } from '../src/model/kalender';
import { kalenderFokus, terdampak, versiSemester } from '../src/model/simpul';
import type { Kegiatan, Proyek, Slot } from '../src/model/tipe';

const HARI = ['2026-12-07', '2026-12-08', '2026-12-09', '2026-12-10', '2026-12-11'];
const kegiatan = (ekstra: Partial<Kegiatan>): Kegiatan => ({ id: 'kg', nama: 'Kegiatan uji', jenis: 'ujian', mulai: HARI[0] as string, selesai: HARI[4] as string, rombelTidakAktif: [], ...ekstra });
const slot = (bebanId: string, hari: number, jam: number, ruangId: string): Slot => ({ id: `${bebanId}-${hari}-${jam}`, bebanId, hari, jam, ruangId });
const kosong = (p: Proyek) => {
  for (const v of p.versi) v.slots = [];
  return p;
};

describe('jpBeririsan', () => {
  const p = proyekContoh();
  it('JP yang waktunya beririsan dengan rentang jam dinding', () => {
    // skema 10 jam: JP1 07:00-07:45, JP2 -08:30, JP3 -09:15, istirahat 15 menit, JP4 mulai 09:30
    expect(jpBeririsan(p.skema.find((s) => s.id === 'skema10'), '07:30', '09:30')).toEqual([1, 2, 3]);
    expect(jpBeririsan(p.skema.find((s) => s.id === 'skema10'), '09:15', '09:30')).toEqual([]);
    expect(jpBeririsan(p.skema.find((s) => s.id === 'skema10'), '09:29', '09:31')).toEqual([4]);
  });
  it('tanpa skema = tidak ada JP', () => {
    expect(jpBeririsan(undefined, '07:30', '09:30')).toEqual([]);
  });
});

describe('aturanPekan', () => {
  const p = proyekContoh();
  const g = kegiatan({
    ruangKunci: [{ id: 'k1', ruangIds: ['u1'], hari: [0, 1] }, { id: 'k2', ruangIds: ['u2'] }],
    rombelTanpaRuang: ['r1'],
    pengawas: [{ id: 't1', guruId: 'g1', tanggal: HARI[1] as string, mulai: '07:30', selesai: '09:30' }, { id: 't2', guruId: 'g2', tanggal: '2026-12-20', mulai: '07:30', selesai: '09:30' }],
  });
  const a = aturanPekan(p, [g, g, g, g, undefined], HARI, ['skema11', 'skema10', 'skema10', 'skema11', 'skema9']);
  it('ruang terkunci dibatasi hari yang dipilih; tanpa pilihan = semua hari kegiatan', () => {
    expect([...ruangTerkunciPada(a, 0)].sort()).toEqual(['u1', 'u2']);
    expect([...ruangTerkunciPada(a, 1)].sort()).toEqual(['u1', 'u2']);
    expect([...ruangTerkunciPada(a, 2)]).toEqual(['u2']);
    expect([...ruangTerkunciPada(a, 4)]).toEqual([]); // hari tanpa kegiatan
  });
  it('tugas mengawas diubah menjadi nomor JP pada skema hari itu, dan hanya pada tanggalnya', () => {
    expect(a.pengawas).toHaveLength(1);
    expect(a.pengawas[0]).toMatchObject({ guruId: 'g1', hari: 1, jam: [1, 2, 3] });
  });
  it('rombel tanpa ruang per hari', () => {
    expect(a.tanpaRuang.map((x) => x.hari)).toEqual([0, 1, 2, 3]);
  });
});

describe('validator dengan aturan kegiatan', () => {
  const p = kosong(proyekContoh());
  const a: AturanPekan = {
    kunci: [{ hari: 0, ruangId: 'u1', kegiatan: 'TKA' }],
    pengawas: [{ guruId: 'g1', hari: 1, jam: [1, 2, 3], kegiatan: 'ASAS', waktu: '07:30–09:30' }],
    tanpaRuang: [{ hari: 2, rombelId: 'r1', kegiatan: 'TKA' }],
  };
  const jenis = (slots: Slot[], opsi = { aturan: a }) => periksa(p, slots, opsi).map((m) => m.jenis);
  it('slot di ruang terkunci pada hari itu = pelanggaran; hari lain tidak', () => {
    expect(jenis([slot('b1', 0, 1, 'u1')])).toContain('ruang-dikunci');
    expect(jenis([slot('b1', 1, 1, 'u1')])).not.toContain('ruang-dikunci');
    expect(jenis([slot('b1', 0, 1, 'u1')], { aturan: { kunci: [], pengawas: [], tanpaRuang: [] } })).not.toContain('ruang-dikunci');
  });
  it('guru yang mengawas tidak boleh mengajar pada JP tugasnya (pelanggaran), tetapi boleh di luar JP itu', () => {
    const m = periksa(p, [slot('b1', 1, 2, 'u2')], { aturan: a });
    expect(m.map((x) => x.jenis)).toContain('pengawas-bentrok');
    expect(m.filter((x) => x.jenis === 'pengawas-bentrok').every(adalahPelanggaran)).toBe(true);
    expect(jenis([slot('b1', 1, 4, 'u2')])).not.toContain('pengawas-bentrok');
  });
  it('rombel tanpa ruang tidak dilaporkan belum punya ruang pada hari itu saja', () => {
    expect(jenis([slot('b1', 2, 1, '')])).not.toContain('ruang-belum');
    expect(jenis([slot('b1', 3, 1, '')])).toContain('ruang-belum');
  });
  it('tentukanRuang menghindari ruang terkunci dan seret jadwal ke ruang terkunci ditolak', () => {
    const b1 = p.beban.find((x) => x.id === 'b1')!;
    expect(b1.ruangPrioritas).toEqual(['u1', 'u2']);
    expect(tentukanRuang(p, [], b1, 0, 1, undefined).ruangId).toBe('u1');
    expect(tentukanRuang(p, [], b1, 0, 1, undefined, a).ruangId).toBe('u2');
    expect(tentukanRuang(p, [], b1, 0, 1, 'u1', a).ruangId).toBe('u2');
    const b2 = p.beban.find((x) => x.id === 'b2')!; // hanya boleh u1
    expect(b2.ruangPrioritas).toEqual(['u1']);
    const r = rencanaPindah(p, [], { bebanId: 'b2' }, 0, 1, a);
    expect(r.ok).toBe(false);
  });
});

describe('susun dengan aturan kegiatan', () => {
  it('tidak menaruh pelajaran di ruang terkunci atau pada JP guru yang mengawas', () => {
    const p = kosong(proyekContoh());
    const a: AturanPekan = {
      kunci: [{ hari: 0, ruangId: 'u1', kegiatan: 'TKA' }, { hari: 0, ruangId: 'u2', kegiatan: 'TKA' }],
      pengawas: [{ guruId: 'g1', hari: 1, jam: [1, 2, 3, 4], kegiatan: 'ASAS', waktu: '07:00–10:00' }],
      tanpaRuang: [],
    };
    const h = susun(p, { skemaPerHari: p.polaReguler, aturan: a, batasMs: 800 });
    expect(h.slots.some((s) => s.hari === 0 && (s.ruangId === 'u1' || s.ruangId === 'u2'))).toBe(false);
    const guruG1 = new Set(p.beban.filter((b) => b.guruId === 'g1' || b.timGuruIds.includes('g1')).map((b) => b.id));
    expect(h.slots.some((s) => guruG1.has(s.bebanId) && s.hari === 1 && s.jam <= 4)).toBe(false);
    expect(periksa(p, h.slots, { aturan: a }).filter(adalahPelanggaran)).toEqual([]);
  });
});

describe('validasi data aturan kegiatan', () => {
  it('menolak rujukan yang tidak ada dan waktu tidak berurutan', () => {
    const p = proyekContoh();
    p.kalender.push(kegiatan({
      ruangKunci: [{ id: 'k1', ruangIds: ['tidak-ada'], hari: [9] }],
      pengawas: [{ id: 't1', guruId: 'tidak-ada', tanggal: HARI[0] as string, mulai: '10:00', selesai: '09:00' }],
      rombelTanpaRuang: ['tidak-ada'],
    }));
    const galat = validasiProyek(p).join('\n');
    expect(galat).toContain('ruang terkunci yang tidak ada');
    expect(galat).toContain('hari kunci ruang di luar hari kerja');
    expect(galat).toContain('pengawas bukan guru yang ada');
    expect(galat).toContain('tidak berurutan');
    expect(galat).toContain('rombel tanpa ruang yang tidak ada');
  });
  it('data valid lolos', () => {
    const p = proyekContoh();
    p.kalender.push(kegiatan({ ruangKunci: [{ id: 'k1', ruangIds: ['u1'] }], pengawas: [{ id: 't1', guruId: 'g1', tanggal: HARI[0] as string, mulai: '07:30', selesai: '09:30' }], rombelTanpaRuang: ['r1'] }));
    expect(validasiProyek(p)).toEqual([]);
  });
});

describe('data Tahun 2026: aturan kegiatan pada pekan ASAS', () => {
  it('ruang terkunci dan tugas mengawas muncul sebagai pelanggaran pada pekan 30 Nov', () => {
    const p = proyekSekolah('tahun');
    const asas = p.kalender.find((x) => x.id === 'k-asas')!;
    const awal = hitungTurunan(p, '2026-11-30');
    const ruangB3 = p.master.ruang.find((r) => r.kode === 'B3')!.id;
    const dipakaiB3 = awal.slots.filter((s) => s.hari === 0 && s.ruangId === ruangB3);
    expect(dipakaiB3.length).toBeGreaterThan(0);
    const sebelum = awal.jumlahPelanggaran;

    asas.ruangKunci = [...(asas.ruangKunci ?? []), { id: 'kx', ruangIds: [ruangB3], hari: [0] }];
    const t = hitungTurunan(p, '2026-11-30');
    expect(t.jumlahPelanggaran).toBe(sebelum + dipakaiB3.length);

    // guru yang mengajar Senin jam 1 diberi tugas mengawas 07:00-07:30 (beririsan dengan JP pertama pada pola hari itu)
    const bebanById = new Map(p.beban.map((b) => [b.id, b]));
    const s1 = awal.slots.find((s) => s.hari === 0 && s.jam === 1)!;
    const guruId = bebanById.get(s1.bebanId)!.guruId;
    asas.pengawas = [...(asas.pengawas ?? []), { id: 'tx', guruId, tanggal: '2026-11-30', mulai: '07:00', selesai: '08:00' }];
    const t2 = hitungTurunan(p, '2026-11-30');
    expect(t2.aturan.pengawas.some((x) => x.guruId === guruId && x.hari === 0 && x.jam.length > 0)).toBe(true);
    expect(t2.masalah.some((m) => m.jenis === 'pengawas-bentrok' && !m.diterima && m.pesan.includes('07:00–08:00'))).toBe(true);
    // pekan lain tidak terpengaruh
    expect(hitungTurunan(p, '2026-12-07').masalah.some((m) => m.jenis === 'pengawas-bentrok' || m.jenis === 'ruang-dikunci')).toBe(false);
  });
});

describe('data Tahun 2026: jadwal pengawas ASAS dan keputusan diterima', () => {
  const p = proyekSekolah('tahun');
  const t = hitungTurunan(p, '2026-11-30');
  it('jadwal pengawas ASAS termuat: 286 tugas, 22 ruang ujian terkunci pada tiga jendela waktu', () => {
    const g = p.kalender.find((x) => x.id === 'k-asas')!;
    expect(g.pengawas).toHaveLength(286);
    expect(g.ruangKunci?.map((x) => [x.mulai, x.selesai, x.hari])).toEqual([['07:30', '09:30', [0, 1, 2, 3, 4]], ['10:00', '11:30', [0, 1, 2, 3, 4]], ['13:00', '14:30', [0, 1, 2]]]);
    expect(g.ruangKunci?.every((x) => x.ruangIds.length === 22)).toBe(true);
    expect(validasiProyek(p)).toEqual([]);
  });
  it('satu-satunya bentrok pengawas pada pekan ASAS adalah PSRT XI TE 2 (guru EDW, satu pertemuan), dan sudah diterima', () => {
    const pw = t.masalah.filter((m) => m.jenis === 'pengawas-bentrok');
    expect(pw).toHaveLength(4); // satu pertemuan 4 JP: Kamis jam 3-6
    expect(pw.every((m) => m.pesan.includes('Guru EDW') && m.pesan.includes('(XI TE 2 PSRT)') && m.pesan.includes('Kamis'))).toBe(true);
    expect(pw.every((m) => !!m.diterima)).toBe(true);
    expect(t.jumlahPelanggaran).toBe(t.masalah.filter((m) => adalahPelanggaran(m) && !m.diterima).length);
    expect(t.masalah.filter((m) => m.jenis !== 'pengawas-bentrok' && adalahPelanggaran(m))).toEqual([]); // PSRT sudah pindah dari D1 ke B3
    expect(pw.every((m) => m.diterima === 'EDW memberi tugas ke siswa saat mengawas ASAS (keputusan lapangan).')).toBe(true);
    expect(t.diterimaPeta.size).toBe(4);
  });
  it('membatalkan penerimaan mengembalikan hitungan bentrok', () => {
    const q = structuredClone(p);
    const sebelum = hitungTurunan(q, '2026-11-30').jumlahPelanggaran;
    delete q.diterima;
    expect(hitungTurunan(q, '2026-11-30').jumlahPelanggaran).toBe(sebelum + 4);
    expect(hitungTurunan(q, '2026-11-30').diterimaPeta.size).toBe(0);
  });
  it('pekan TKA gelombang 2: rombel PJJ tidak dilaporkan belum punya ruang', () => {
    const tka = hitungTurunan(p, '2026-11-02');
    expect(tka.masalah.filter((m) => m.jenis === 'ruang-belum')).toEqual([]);
    const q = structuredClone(p);
    delete q.kalender.find((x) => x.id === 'k-tka2')!.rombelTanpaRuang;
    expect(hitungTurunan(q, '2026-11-02').masalah.filter((m) => m.jenis === 'ruang-belum').length).toBe(400);
  });
});

describe('alasan sisa solver menyebut penyebab sebenarnya', () => {
  it('sintetis: guru mengawas dan ruang prioritas terkunci pada semua waktu', () => {
    const p = kosong(proyekContoh());
    const b = p.beban.find((x) => !x.nonTatapMuka && x.jp > 0)!;
    const ruang = p.master.ruang[0]!.id;
    b.ruangPrioritas = [ruang];
    const hari = Array.from({ length: 5 }, (_, i) => i);
    const a: AturanPekan = {
      kunci: hari.map((h) => ({ hari: h, ruangId: ruang, kegiatan: 'ASAS' })),
      pengawas: hari.map((h) => ({ guruId: b.guruId, hari: h, jam: Array.from({ length: 14 }, (_, i) => i + 1), kegiatan: 'ASAS', waktu: '07:00–15:00' })),
      tanpaRuang: [],
    };
    const h = susun(p, { skemaPerHari: p.polaReguler, aturan: a, batasMs: 800 });
    const sisa = h.sisa.find((x) => x.bebanId === b.id);
    expect(sisa).toBeTruthy();
    expect(sisa!.alasan).toMatch(/sedang mengawas pada \d+/);
    expect(sisa!.alasan).toMatch(/dibatasi ke/);
  });

  it('sintetis: tanpa penghalang aturan, alasan tidak menyebut mengawas atau terkunci', () => {
    const p = kosong(proyekContoh());
    const b = p.beban.find((x) => !x.nonTatapMuka && x.jp > 0)!;
    b.jp = 60; // melebihi kapasitas pekan -> sisa
    const h = susun(p, { skemaPerHari: p.polaReguler, batasMs: 800 });
    const sisa = h.sisa.find((x) => x.bebanId === b.id);
    expect(sisa).toBeTruthy();
    expect(sisa!.alasan).not.toMatch(/mengawas|terkunci/);
  });

  it('data Tahun 2026: PSRT XI TE 2 dikosongkan, solver melapor guru EDW mengawas, tidak memaksa', () => {
    const p = proyekSekolah('tahun');
    const t = hitungTurunan(p, '2026-11-30');
    const psrt = new Set(t.beban.filter((b) => b.mapelId === p.master.mapel.find((m) => m.kode === 'PSRT')!.id && b.rombelId === p.master.rombel.find((r) => r.kode === 'XI TE 2')!.id).map((b) => b.id));
    expect(psrt.size).toBeGreaterThan(0);
    const kloning = structuredClone(p);
    kloning.beban = structuredClone(t.beban).filter((b) => !t.rombelTidakAktif.has(b.rombelId));
    for (const v of kloning.versi) v.slots = [];
    const tetap = t.slots.filter((s) => !psrt.has(s.bebanId));
    const pola = polaUntukTanggal('2026-11-30', { ...p, kalender: kalenderFokus(p, 'auto') }).pola;
    const h = susun(kloning, { skemaPerHari: pola, tetap, aturan: t.aturan, batasMs: 3000 });
    const sisa = h.sisa.filter((x) => psrt.has(x.bebanId));
    expect(sisa).toHaveLength(1);
    expect(sisa[0]!.jpSisa).toBe(4);
    expect(sisa[0]!.alasan).toMatch(/EDW sedang mengawas pada \d+/);
    expect(periksa({ ...kloning }, h.slots, { skemaPerHari: pola, rombelTidakAktif: t.rombelTidakAktif, aturan: t.aturan }).filter(adalahPelanggaran)).toEqual([]);
  });
});

describe('solver: prioritas lunak, jadwal awal, rantai geser', () => {
  it('ruang prioritas yang terkunci: wajib = tidak muat; lunak = pindah ke ruang lain yang diizinkan', () => {
    const p = kosong(proyekContoh());
    const b = p.beban.find((x) => !x.nonTatapMuka && x.jp > 0)!;
    const ruang = p.master.ruang.find((r) => r.dijadwalkan !== false)!.id;
    b.ruangPrioritas = [ruang];
    const hari = [0, 1, 2, 3, 4];
    const a: AturanPekan = { kunci: hari.map((h) => ({ hari: h, ruangId: ruang, kegiatan: 'ASAS' })), pengawas: [], tanpaRuang: [] };
    const ketat = susun(p, { skemaPerHari: p.polaReguler, aturan: a, batasMs: 800 });
    expect(ketat.sisa.some((x) => x.bebanId === b.id)).toBe(true);
    const lunak = susun(p, { skemaPerHari: p.polaReguler, aturan: a, prioritasLunak: true, batasMs: 800 });
    expect(lunak.sisa.some((x) => x.bebanId === b.id)).toBe(false);
    const sl = lunak.slots.filter((x) => x.bebanId === b.id);
    expect(sl.length).toBe(b.jp);
    expect(sl.every((x) => x.ruangId !== ruang)).toBe(true);
    expect(periksa(p, lunak.slots, { aturan: a }).filter(adalahPelanggaran)).toEqual([]);
  });

  it('mode bilaPerlu: tanpa kendala ruang prioritas tetap dipakai; bila terkunci, baru pindah dan tercatat', () => {
    const p = kosong(proyekContoh());
    const b = p.beban.find((x) => !x.nonTatapMuka && x.jp > 0)!;
    const ruang = p.master.ruang.find((r) => r.dijadwalkan !== false)!.id;
    b.ruangPrioritas = [ruang];
    const bebas = susun(p, { skemaPerHari: p.polaReguler, prioritasLunak: 'bilaPerlu', batasMs: 800 });
    expect(ruangDiluarPrioritas(p, bebas.slots)).toEqual([]);
    expect(bebas.slots.filter((x) => x.bebanId === b.id).every((x) => x.ruangId === ruang)).toBe(true);
    const a: AturanPekan = { kunci: [0, 1, 2, 3, 4].map((h) => ({ hari: h, ruangId: ruang, kegiatan: 'ASAS' })), pengawas: [], tanpaRuang: [] };
    const terkunci = susun(p, { skemaPerHari: p.polaReguler, aturan: a, prioritasLunak: 'bilaPerlu', batasMs: 1500 });
    expect(terkunci.sisa.some((x) => x.bebanId === b.id)).toBe(false);
    const pindah = ruangDiluarPrioritas(p, terkunci.slots).find((x) => x.bebanId === b.id);
    expect(pindah?.jp).toBe(b.jp);
    expect(pindah?.ruangIds.includes(ruang)).toBe(false);
  });

  it('jadwal awal yang sudah sah hampir seluruhnya dipertahankan (hanya perbaikan kerapian yang jelas untung)', () => {
    const p = kosong(proyekContoh());
    const dasar = susun(p, { skemaPerHari: p.polaReguler, batasMs: 800 });
    const lagi = susun(p, { skemaPerHari: p.polaReguler, awal: dasar.slots, batasMs: 800 });
    expect(lagi.terjadwal).toBe(dasar.terjadwal);
    const kunci = (x: Slot) => `${x.bebanId}|${x.hari}|${x.jam}`;
    const awal = new Set(dasar.slots.map(kunci));
    expect(lagi.slots.filter((x) => !awal.has(kunci(x))).length).toBeLessThanOrEqual(Math.ceil(dasar.slots.length * 0.1));
  });

  it('jadwal awal yang melanggar aturan baru: hanya yang melanggar bergeser, hasil tetap sah', () => {
    const p = kosong(proyekContoh());
    const dasar = susun(p, { skemaPerHari: p.polaReguler, batasMs: 800 });
    const s0 = dasar.slots.find((x) => x.ruangId)!;
    const a: AturanPekan = { kunci: [{ hari: s0.hari, ruangId: s0.ruangId, kegiatan: 'ASAS' }], pengawas: [], tanpaRuang: [] };
    const baru = susun(p, { skemaPerHari: p.polaReguler, awal: dasar.slots, aturan: a, prioritasLunak: true, kedalaman: 3, batasMs: 1500 });
    expect(baru.terjadwal).toBe(dasar.terjadwal);
    expect(periksa(p, baru.slots, { aturan: a }).filter(adalahPelanggaran)).toEqual([]);
    const kunci = (x: Slot) => `${x.bebanId}|${x.hari}|${x.jam}|${x.ruangId}`; // pindah ruang juga dihitung bergeser
    const lama = new Set(dasar.slots.map(kunci));
    const bergeser = baru.slots.filter((x) => !lama.has(kunci(x))).length;
    const terkunci = dasar.slots.filter((x) => x.hari === s0.hari && x.ruangId === s0.ruangId).length;
    expect(bergeser).toBeGreaterThan(0);
    expect(bergeser).toBeLessThan(dasar.slots.length / 2); // bukan susun ulang total
    expect(terkunci).toBeGreaterThan(0);
  });

  it('data Tahun 2026: ASAS tersusun penuh tanpa pelanggaran (ruang prioritas lunak + rantai geser), dari nol maupun dari jadwal induk', () => {
    const p = proyekSekolah('tahun');
    const g = p.kalender.find((x) => x.id === 'k-asas')!;
    const t = hitungTurunan(p, g.mulai, g.id);
    const dampak = new Set(p.master.rombel.filter((r) => terdampak(g, r.id) && !t.rombelTidakAktif.has(r.id)).map((r) => r.id));
    const rb = new Map(t.beban.map((b) => [b.id, b.rombelId]));
    const aktif = t.beban.filter((b) => !t.rombelTidakAktif.has(b.rombelId));
    const kloning = structuredClone(p);
    kloning.beban = structuredClone(aktif);
    for (const v of kloning.versi) v.slots = [];
    const tetap = t.slots.filter((s) => !dampak.has(rb.get(s.bebanId) ?? ''));
    const pola = polaUntukTanggal(g.mulai, { ...p, kalender: kalenderFokus(p, g.id) }).pola;
    const peta = new Map(aktif.map((b) => [b.asal ?? b.id, b.id]));
    const awal = (versiSemester(p, t.semester)?.slots ?? []).flatMap((s) => { const id = peta.get(s.bebanId); return id && dampak.has(rb.get(id) ?? '') ? [{ ...s, bebanId: id }] : []; });
    for (const a of [undefined, awal]) {
      const h = susun(kloning, { skemaPerHari: pola, tetap, awal: a, aturan: t.aturan, prioritasLunak: true, kedalaman: 3, batasMs: 4000 });
      expect(h.sisa.filter((x) => dampak.has(rb.get(x.bebanId) ?? ''))).toEqual([]);
      expect(periksa(kloning, h.slots, { skemaPerHari: pola, rombelTidakAktif: t.rombelTidakAktif, aturan: t.aturan }).filter(adalahPelanggaran)).toEqual([]);
    }
  }, 30000);
});
