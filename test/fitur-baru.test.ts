import { describe, expect, it } from 'vitest';
import { proyekSekolah } from '../src/model/sekolahData';
import { proyekContoh } from '../src/model/contoh';
import { validasiProyek } from '../src/model/validasi';
import { ruangDilarang, periksa, adalahPelanggaran } from '../src/mesin/validator';
import { tentukanRuang } from '../src/mesin/penempatan';
import { susun } from '../src/mesin/solver';
import { periodeUntukTanggal, rombelTidakAktifIds, versiUntukTanggal } from '../src/model/kalender';
import { hitungTurunan } from '../src/ui/turunan';
import { kategoriRuang, kelompokRuang } from '../src/model/ruang';
import { simpanCek } from '../src/ui/util';
import { jpRombel } from '../src/model/jp';
import { terapkanRuangSekolah } from '../src/model/ruangSekolah';
import type { Proyek } from '../src/model/tipe';

const idRuang = (p: Proyek, kode: string) => p.master.ruang.find((r) => r.kode === kode)?.id ?? '';

describe('data Genap 2026/2027', () => {
  const p = proyekSekolah('genap');
  it('valid; guru dari sheet Genap (tanpa Laila Zuhaida); 30 rombel; 42 ruang; jadwal kosong', () => {
    expect(validasiProyek(p)).toEqual([]);
    expect(p.master.guru).toHaveLength(61);
    expect(p.master.guru.some((g) => /zuhaida/i.test(g.nama))).toBe(false);
    expect(p.master.rombel).toHaveLength(30);
    expect(p.master.ruang).toHaveLength(42);
    expect(p.beban).toHaveLength(316);
    expect(p.versi[0]?.slots).toEqual([]);
    expect(JSON.stringify(p)).not.toMatch(/\d{10,}/); // tanpa NIP
  });
  it('mapel punya elemen berinduk KK (DTE dan TAV) dan MPP TE = P4E', () => {
    const kode = (id: string | undefined) => p.master.mapel.find((m) => m.id === id)?.kode;
    const induk = (k: string) => kode(p.master.mapel.find((m) => m.kode === k)?.induk);
    for (const e of ['DLE', 'DRE', 'TKB']) expect(induk(e)).toBe('DTE');
    for (const e of ['PRE', 'PMM', 'PSRT', 'PISAV', 'PISS']) expect(induk(e)).toBe('TAV');
    expect(p.master.mapel.some((m) => m.kode === 'P4E')).toBe(true);
  });
  it('kategori ruang terisi: Ruang teori, Lab TE, Lab DKV, Lab AT', () => {
    const kat = new Set(p.master.ruang.map(kategoriRuang));
    for (const k of ['Ruang teori', 'Lab TE', 'Lab DKV', 'Lab AT']) expect(kat.has(k)).toBe(true);
    expect(kelompokRuang(p.master.ruang).find((x) => x.kategori === 'Lab TE')?.ruang.map((r) => r.kode)).toEqual(['B2', 'B3', 'C1', 'C2', 'D1', 'D2']);
  });
  it('guru punya daftar mapel yang diampu dari bebannya', () => {
    const ben = p.master.guru.find((g) => g.nama.startsWith('Benny'));
    const kode = (ben?.mapelIds ?? []).map((i) => p.master.mapel.find((m) => m.id === i)?.kode);
    expect(kode.length).toBeGreaterThan(0);
    for (const b of p.beban.filter((x) => x.guruId === ben?.id)) expect(ben?.mapelIds).toContain(b.mapelId);
  });
  it('kelas XII PKL pada periode aktif: slot dan JP kurang mereka tidak dihitung', () => {
    const per = p.kalender.find((g) => g.id === p.periodeAktifId);
    expect(per?.jenis).toBe('PKL');
    const xii = p.master.rombel.filter((r) => r.tingkat === 'XII').map((r) => r.id);
    expect(per?.rombelTidakAktif.sort()).toEqual(xii.sort());
    const t = hitungTurunan(p, per!.mulai);
    expect(t.rombelTidakAktif.size).toBe(10);
    const kurangXII = t.masalah.filter((m) => m.jenis === 'jp-kurang' && xii.includes(m.rombelId ?? ''));
    expect(kurangXII).toEqual([]);
  });
  it('Susun Otomatis pada Genap (tanpa kelas XII): tanpa bentrok dan hampir semua JP tertempatkan', () => {
    const per = p.kalender.find((g) => g.id === p.periodeAktifId)!;
    const kl = structuredClone(p);
    kl.beban = kl.beban.filter((b) => !per.rombelTidakAktif.includes(b.rombelId));
    const h = susun(kl, { skemaPerHari: kl.polaReguler, batasMs: 4000, benih: 3 });
    const m = periksa(kl, h.slots, { skemaPerHari: kl.polaReguler });
    expect(m.filter(adalahPelanggaran).map((x) => x.pesan)).toEqual([]);
    expect(h.slots.every((s) => s.ruangId)).toBe(true);
    // kelas X butuh 51 JP (sebagian 54/57 menurut Excel) dan XI 49 JP padahal kapasitas pekan 48 JP: selebihnya pasti tidak muat
    const pasti = kl.master.rombel.reduce((a, r) => a + Math.max(0, jpRombel(kl.beban.filter((b) => b.rombelId === r.id && !b.nonTatapMuka)) - 48), 0);
    expect(h.total - h.terjadwal).toBeGreaterThanOrEqual(pasti);
    expect(h.total - h.terjadwal - pasti).toBeLessThanOrEqual(15);
  }, 30000);
});

describe('aturan ruang: guru hanya di ruang tertentu, daftar putih mapel dan rombel', () => {
  const siap = () => {
    const p = proyekContoh();
    terapkanRuangSekolah(p);
    for (const b of p.beban) b.ruangPrioritas = [];
    return p;
  };
  it('guru hanya boleh di beberapa ruang (lebih dari satu)', () => {
    const p = siap();
    const b = p.beban[0]!;
    const boleh = [idRuang(p, 'RK.J1'), idRuang(p, 'RK.J2')];
    p.aturan.push({ id: 'ag', jenis: 'guruRuang', guruId: b.guruId, ruangIds: boleh });
    const dilarang = ruangDilarang(p, b);
    for (const u of p.master.ruang) expect(dilarang.has(u.id)).toBe(!boleh.includes(u.id));
    // penempatan: dua beban guru yang sama? gunakan dua jam berbeda; ruang pertama habis -> ruang kedua
    const r1 = tentukanRuang(p, [], b, 0, 1);
    expect(boleh).toContain(r1.ruangId);
    const r2 = tentukanRuang(p, [{ id: 'x', bebanId: p.beban[1]!.id, hari: 0, jam: 1, ruangId: r1.ruangId }], b, 0, 1);
    expect(boleh).toContain(r2.ruangId);
    expect(r2.ruangId).not.toBe(r1.ruangId);
  });
  it('validator menandai slot guru di ruang di luar daftar', () => {
    const p = siap();
    const b = p.beban[0]!;
    p.aturan.push({ id: 'ag', jenis: 'guruRuang', guruId: b.guruId, ruangIds: [idRuang(p, 'RK.J1')] });
    const m = periksa(p, [{ id: 's1', bebanId: b.id, hari: 0, jam: 1, ruangId: idRuang(p, 'RK.J2') }]);
    expect(m.some((x) => x.jenis === 'ruang-terlarang')).toBe(true);
    const ok = periksa(p, [{ id: 's1', bebanId: b.id, hari: 0, jam: 1, ruangId: idRuang(p, 'RK.J1') }]);
    expect(ok.some((x) => x.jenis === 'ruang-terlarang')).toBe(false);
  });
  it('daftar putih mapel dan rombel berlaku bersamaan (harus lolos keduanya)', () => {
    const p = siap();
    const b = p.beban[0]!;
    const mapel = p.master.mapel.find((m) => m.id === b.mapelId)!;
    const rombel = p.master.rombel.find((r) => r.id === b.rombelId)!;
    mapel.ruangIds = [idRuang(p, 'RK.J1'), idRuang(p, 'RK.J2')];
    rombel.ruangIds = [idRuang(p, 'RK.J2'), idRuang(p, 'RK.J3')];
    const boleh = p.master.ruang.filter((u) => !ruangDilarang(p, b).has(u.id)).map((u) => u.kode);
    expect(boleh).toEqual(['RK.J2']);
  });
  it('guru tim ikut membatasi', () => {
    const p = siap();
    const b = p.beban.find((x) => x.timGuruIds.length)!;
    p.aturan.push({ id: 'ag', jenis: 'guruRuang', guruId: b.timGuruIds[0]!, ruangIds: [idRuang(p, 'RK.K1')] });
    expect(p.master.ruang.filter((u) => !ruangDilarang(p, b).has(u.id)).map((u) => u.kode)).toEqual(['RK.K1']);
  });
  it('validasi proyek menolak aturan yang menunjuk guru atau ruang yang tidak ada', () => {
    const p = siap();
    p.aturan.push({ id: 'ag', jenis: 'guruRuang', guruId: 'tidak-ada', ruangIds: ['tidak-ada'] });
    const galat = validasiProyek(p);
    expect(galat.some((g) => g.includes('guru tidak ada'))).toBe(true);
    expect(galat.some((g) => g.includes('ruang yang tidak ada'))).toBe(true);
  });
  it('solver menghormati ruang khusus guru', () => {
    const p = siap();
    for (const v of p.versi) v.slots = [];
    const g = p.beban[0]!.guruId;
    const boleh = [idRuang(p, 'RK.J1'), idRuang(p, 'RK.J2')];
    p.aturan.push({ id: 'ag', jenis: 'guruRuang', guruId: g, ruangIds: boleh });
    const h = susun(p, { skemaPerHari: p.polaReguler, batasMs: 500, benih: 1 });
    const milik = new Set(p.beban.filter((b) => b.guruId === g).map((b) => b.id));
    const slot = h.slots.filter((s) => milik.has(s.bebanId));
    expect(slot.length).toBeGreaterThan(0);
    for (const s of slot) expect(boleh).toContain(s.ruangId);
  });
});

describe('centang master', () => {
  it('"ikut dijadwalkan" bisa dihilangkan: false disimpan, true menghapus', () => {
    const r: Record<string, unknown> = { id: 'u', kode: 'B1' };
    simpanCek(r, 'dijadwalkan', false, true);
    expect(r.dijadwalkan).toBe(false);
    simpanCek(r, 'dijadwalkan', true, true);
    expect('dijadwalkan' in r).toBe(false);
  });
  it('"dipakai bersama" (bawaan false): true disimpan, false menghapus', () => {
    const r: Record<string, unknown> = { id: 'u' };
    simpanCek(r, 'bersama', true, false);
    expect(r.bersama).toBe(true);
    simpanCek(r, 'bersama', false, false);
    expect('bersama' in r).toBe(false);
  });
});

describe('periode: versi, rombel tidak aktif, aktif', () => {
  it('versi dan rombel tidak aktif mengikuti tanggal; periode terspesifik menang', () => {
    const p = proyekSekolah('gasal');
    expect(p.periodeAktifId).toBe('k-asas');
    expect(periodeUntukTanggal('2026-12-01', p.kalender)?.id).toBe('k-asas'); // menimpa pemadatan TKA lanjutan
    expect(periodeUntukTanggal('2026-12-08', p.kalender)?.id).toBe('k-tka2');
    expect(rombelTidakAktifIds('2026-12-01', p.kalender).size).toBe(20); // 10 kelas X + 10 kelas XII
    expect(rombelTidakAktifIds('2026-12-08', p.kalender).size).toBe(0);
    expect(versiUntukTanggal('2026-12-01', p)?.nama).toContain('Reguler');
  });
  it('versi khusus dipakai pada tanggal periodenya', () => {
    const p = proyekSekolah('gasal');
    p.versi.push({ id: 'vx', nama: 'Jadwal ASAS', jenis: 'varian', slots: [] });
    p.kalender.find((g) => g.id === 'k-asas')!.versiId = 'vx';
    expect(versiUntukTanggal('2026-12-01', p)?.id).toBe('vx');
    expect(versiUntukTanggal('2026-12-08', p)?.id).not.toBe('vx');
    expect(hitungTurunan(p, '2026-12-01').slots).toEqual([]);
    expect(validasiProyek(p)).toEqual([]);
  });
  it('turunan: slot milik rombel tidak aktif disembunyikan dan tidak diperiksa', () => {
    const p = proyekSekolah('gasal');
    const penuh = hitungTurunan(p, '2026-12-08'); // pemadatan TKA: semua aktif
    const asas = hitungTurunan(p, '2026-12-01'); // X dan XII tidak aktif
    expect(penuh.slots).toHaveLength(1200);
    expect(asas.slots.length).toBeLessThan(penuh.slots.length);
    const rb = new Map(p.beban.map((b) => [b.id, b.rombelId]));
    expect(asas.slots.every((s) => !asas.rombelTidakAktif.has(rb.get(s.bebanId) ?? ''))).toBe(true);
    expect(asas.jumlahPelanggaran).toBe(0);
  });
});
