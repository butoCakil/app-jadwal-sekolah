import { describe, expect, it } from 'vitest';
import { proyekContoh } from '../src/model/contoh';
import type { Beban, Proyek, Slot } from '../src/model/tipe';
import { adalahPelanggaran, masalahPerSlot, periksa } from '../src/mesin/validator';
import { cekPenempatan, rencanaPindah, tentukanRuang, terapkanRencana } from '../src/mesin/penempatan';
import { Riwayat } from '../src/mesin/riwayat';

const dasar = () => proyekContoh();
const slotsDari = (p: Proyek) => p.versi[0]!.slots;
const jenis = (p: Proyek, slots: Slot[], skemaPerHari?: (string | null)[]) =>
  periksa(p, slots, { skemaPerHari }).map((m) => m.jenis).sort();

describe('validator', () => {
  it('data contoh: tidak ada pelanggaran, hanya gap dan kapasitas yang diharapkan', () => {
    const p = dasar();
    const m = periksa(p, slotsDari(p), { skemaPerHari: p.polaReguler });
    expect(m.filter(adalahPelanggaran)).toEqual([]);
    // ENG X TE 1: 3 JP, terjadwal 2 (kurang 1); salah satunya Jum'at pelajaran ke-9 tidak muat di skema 9
    expect(m.map((x) => x.jenis).sort()).toEqual(['di-luar-kapasitas', 'jp-kurang']);
    expect(m.find((x) => x.jenis === 'jp-kurang')?.bebanId).toBe('b3');
  });

  it('bentrok guru, termasuk guru tim teaching', () => {
    const p = dasar();
    const slots = [...slotsDari(p)];
    // guru E (tim teaching b12) dijadwalkan b5 pada Selasa pelajaran 7 (b12 ada di Selasa 7)
    slots.push({ id: 'x1', bebanId: 'b5', hari: 1, jam: 7, ruangId: 'u5' });
    const m = periksa(p, slots);
    expect(m.map((x) => x.jenis)).toContain('bentrok-guru');
    expect(m.find((x) => x.jenis === 'bentrok-guru')!.slotIds).toContain('x1');
  });

  it('bentrok rombel dan bentrok ruang terdeteksi', () => {
    const p = dasar();
    const slots = [...slotsDari(p), { id: 'x2', bebanId: 'b2', hari: 0, jam: 1, ruangId: 'u2' }]; // r1 Senin 1 sudah ada b1
    expect(jenis(p, slots)).toContain('bentrok-rombel');
    const slots2 = [...slotsDari(p), { id: 'x3', bebanId: 'b11', hari: 0, jam: 1, ruangId: 'u1' }]; // B3 dipakai b1 Senin 1
    expect(jenis(p, slots2)).toContain('bentrok-ruang');
  });

  it('kelompok paralel (PA) di rombel sama tidak dianggap bentrok rombel, tetapi bentrok ruang tetap', () => {
    const p = dasar();
    const slots = slotsDari(p);
    expect(periksa(p, slots).some((m) => m.jenis === 'bentrok-rombel')).toBe(false);
    const rusak = slots.map((s) => (s.id === 'b7-4-3' ? { ...s, ruangId: 'u2' } : s)); // sama dengan ruang b6
    expect(jenis(p, rusak)).toContain('bentrok-ruang');
    expect(jenis(p, rusak)).not.toContain('bentrok-rombel');
  });

  it('paralel hanya berlaku bila kelompoknya sama', () => {
    const p = dasar();
    p.beban.find((b) => b.id === 'b7')!.paralel = 'LAIN';
    expect(periksa(p, slotsDari(p)).some((m) => m.jenis === 'bentrok-rombel')).toBe(true);
  });

  it('ruang terlarang (aturan jurusan) dan guru tidak tersedia', () => {
    const p = dasar();
    const slots = slotsDari(p).map((s) => (s.id === 'b4-0-5' ? { ...s, ruangId: 'u6' } : s));
    expect(jenis(p, slots)).toContain('ruang-terlarang');
    const slots2 = [...slotsDari(p), { id: 'x4', bebanId: 'b3', hari: 2, jam: 9, ruangId: 'u1' }];
    expect(jenis(p, slots2)).toContain('guru-tidak-tersedia');
  });

  it('ruang bersama tidak dihitung bentrok', () => {
    const p = dasar();
    p.master.ruang.find((r) => r.id === 'u1')!.bersama = true;
    const slots = [...slotsDari(p), { id: 'x5', bebanId: 'b11', hari: 0, jam: 1, ruangId: 'u1' }];
    expect(jenis(p, slots)).not.toContain('bentrok-ruang');
  });

  it('JP lebih dan kurang', () => {
    const p = dasar();
    const slots = slotsDari(p).filter((s) => s.id !== 'b1-0-1');
    expect(periksa(p, slots).find((m) => m.jenis === 'jp-kurang')?.bebanId).toBe('b1');
    const lebih = [...slotsDari(p), { id: 'x6', bebanId: 'b1', hari: 4, jam: 7, ruangId: 'u1' }];
    expect(periksa(p, lebih).find((m) => m.jenis === 'jp-lebih')?.bebanId).toBe('b1');
  });

  it('beban non-tatap-muka tidak dihitung kurang', () => {
    const p = dasar();
    const pkl: Beban = { id: 'pkl', guruId: 'g1', mapelId: 'm1', rombelId: 'r3', jp: 6, timGuruIds: [], ruangPrioritas: [], ruangTerlarang: [], nonTatapMuka: true };
    p.beban.push(pkl);
    expect(periksa(p, slotsDari(p)).some((m) => m.bebanId === 'pkl')).toBe(false);
  });

  it('slot yang bebannya hilang dilaporkan', () => {
    const p = dasar();
    const slots = [...slotsDari(p), { id: 'x7', bebanId: 'hilang', hari: 0, jam: 1, ruangId: '' }];
    expect(jenis(p, slots)).toContain('beban-tidak-ada');
  });

  it('di-luar-kapasitas hanya muncul bila skemaPerHari diberikan', () => {
    const p = dasar();
    expect(periksa(p, slotsDari(p)).some((m) => m.jenis === 'di-luar-kapasitas')).toBe(false);
    expect(periksa(p, slotsDari(p), { skemaPerHari: p.polaReguler }).filter((m) => m.jenis === 'di-luar-kapasitas')).toHaveLength(1);
  });

  it('masalahPerSlot memetakan tiap slot ke masalahnya', () => {
    const p = dasar();
    const slots = [...slotsDari(p), { id: 'x2', bebanId: 'b2', hari: 0, jam: 1, ruangId: 'u2' }];
    const peta = masalahPerSlot(periksa(p, slots));
    expect(peta.get('x2')?.length).toBeGreaterThan(0);
    expect(peta.get('b1-0-1')?.length).toBeGreaterThan(0);
    expect(peta.get('b4-0-5')).toBeUndefined();
  });

  it('cepat untuk data besar (1500 slot)', () => {
    const p = dasar();
    const banyak: Slot[] = [];
    for (let i = 0; i < 1500; i++) banyak.push({ id: `n${i}`, bebanId: 'b1', hari: i % 5, jam: 1 + (i % 10), ruangId: '' });
    const t = performance.now();
    periksa(p, banyak, { skemaPerHari: p.polaReguler });
    expect(performance.now() - t).toBeLessThan(500);
  });
});

describe('penempatan ruang', () => {
  it('mengikuti urutan prioritas lalu pindah ke ruang berikutnya bila terpakai', () => {
    const p = dasar();
    const b8 = p.beban.find((b) => b.id === 'b8')!; // prioritas B3, B4
    // Senin pelajaran 1: B3 dipakai b1 -> harus B4
    expect(tentukanRuang(p, slotsDari(p), b8, 0, 1).ruangId).toBe('u2');
    // Senin pelajaran 7: bebas -> B3
    expect(tentukanRuang(p, slotsDari(p), b8, 0, 7).ruangId).toBe('u1');
  });
  it('semua ruang prioritas terpakai -> kosong dengan alasan (ruang kurang)', () => {
    const p = dasar();
    const b2 = p.beban.find((b) => b.id === 'b2')!; // hanya B3
    const r = tentukanRuang(p, slotsDari(p), b2, 0, 1);
    expect(r.ruangId).toBe('');
    expect(r.alasan).toMatch(/prioritas/);
  });
  it('tanpa prioritas, memakai ruang yang tidak terlarang; Lab AT tidak pernah dipilih untuk TE', () => {
    const p = dasar();
    const b = { ...p.beban[0]!, id: 'tmp', ruangPrioritas: [] };
    const slots = slotsDari(p);
    for (let jam = 1; jam <= 10; jam++) expect(tentukanRuang(p, slots, b, 3, jam).ruangId).not.toBe('u6');
  });
  it('pilihan ruang dihormati bila bebas', () => {
    const p = dasar();
    const b = p.beban.find((x) => x.id === 'b8')!;
    expect(tentukanRuang(p, slotsDari(p), b, 0, 7, 'u2').ruangId).toBe('u2');
  });
});

describe('rencana pindah (drag & drop)', () => {
  it('menaruh beban baru di sel kosong yang aman', () => {
    const p = dasar();
    const r = rencanaPindah(p, slotsDari(p), { bebanId: 'b1' }, 0, 8); // b1 sudah penuh (4 dari 4 JP)
    expect(r.ok).toBe(false);
    expect(r.alasan.join(' ')).toMatch(/melebihi beban/);
  });
  it('menaruh beban yang masih punya sisa JP', () => {
    const p = dasar();
    const slots = slotsDari(p).filter((s) => s.id !== 'b3-4-9');
    const r = rencanaPindah(p, slots, { bebanId: 'b3' }, 3, 8);
    expect(r.ok).toBe(true);
    expect(r.ubahan[0]).toMatchObject({ bebanId: 'b3', hari: 3, jam: 8, ruangId: 'u1' });
  });
  it('menolak sel yang membuat bentrok guru atau rombel beserta alasannya', () => {
    const p = dasar();
    const r = rencanaPindah(p, slotsDari(p), { slotId: 'b2-1-1' }, 0, 1); // r1 Senin 1 sudah ada MTK
    expect(r.ok).toBe(false);
    expect(r.alasan.join(' ')).toMatch(/Rombel X TE 1/);
  });
  it('memindah slot ke sel kosong aman memperbarui posisi dan mempertahankan ruang bebas', () => {
    const p = dasar();
    const r = rencanaPindah(p, slotsDari(p), { slotId: 'b3-4-1' }, 4, 6);
    expect(r.ok).toBe(true);
    expect(terapkanRencana(slotsDari(p), r).find((s) => s.id === 'b3-4-1')).toMatchObject({ hari: 4, jam: 6, ruangId: 'u1' });
  });
  it('menukar dua pelajaran satu rombel bila perpindahan biasa bentrok', () => {
    const p = dasar();
    // b2-1-1 (BI Selasa 1) <-> b2-1-2 tidak berguna; tukar BI Selasa 1 dengan MTK Rabu 1
    const r = rencanaPindah(p, slotsDari(p), { slotId: 'b2-1-1' }, 2, 1);
    expect(r.ok).toBe(true);
    expect(r.tukar).toBe(true);
    const baru = terapkanRencana(slotsDari(p), r);
    expect(baru.find((s) => s.id === 'b2-1-1')).toMatchObject({ hari: 2, jam: 1 });
    expect(baru.find((s) => s.id === 'b1-2-1')).toMatchObject({ hari: 1, jam: 1 });
    expect(periksa(p, baru).filter(adalahPelanggaran)).toEqual([]);
  });
  it('menolak menaruh pada guru yang tidak tersedia', () => {
    const p = dasar();
    const slots = slotsDari(p).filter((s) => s.id !== 'b3-4-9');
    const r = rencanaPindah(p, slots, { bebanId: 'b3' }, 2, 9);
    expect(r.ok).toBe(false);
    expect(r.alasan.join(' ')).toMatch(/tidak tersedia/);
  });
  it('slot yang dijatuhkan di sel yang sama ditolak', () => {
    const p = dasar();
    expect(rencanaPindah(p, slotsDari(p), { slotId: 'b1-0-1' }, 0, 1).ok).toBe(false);
  });
  it('beban non-tatap-muka tidak bisa ditaruh', () => {
    const p = dasar();
    p.beban.push({ id: 'pkl', guruId: 'g1', mapelId: 'm1', rombelId: 'r3', jp: 2, timGuruIds: [], ruangPrioritas: [], ruangTerlarang: [], nonTatapMuka: true });
    expect(rencanaPindah(p, slotsDari(p), { bebanId: 'pkl' }, 0, 9).ok).toBe(false);
  });
  it('cekPenempatan kosong untuk slot yang sudah ada apa adanya', () => {
    const p = dasar();
    expect(cekPenempatan(p, slotsDari(p), [slotsDari(p)[0]!])).toEqual([]);
  });
});

describe('riwayat undo/redo', () => {
  it('undo dan redo bolak-balik; perubahan baru menghapus jalur redo', () => {
    const r = new Riwayat<{ n: number }>();
    let x = { n: 0 };
    r.catat(x); x = { n: 1 };
    r.catat(x); x = { n: 2 };
    expect(r.bisaUndo()).toBe(true);
    x = r.undo(x)!; expect(x.n).toBe(1);
    x = r.undo(x)!; expect(x.n).toBe(0);
    expect(r.undo(x)).toBeNull();
    x = r.redo(x)!; expect(x.n).toBe(1);
    r.catat(x); x = { n: 9 };
    expect(r.bisaRedo()).toBe(false);
  });
  it('batas riwayat dijaga', () => {
    const r = new Riwayat<number>(3);
    for (let i = 0; i < 10; i++) r.catat(i);
    let x = 10, n = 0;
    while (r.bisaUndo()) { x = r.undo(x)!; n++; }
    expect(n).toBe(3);
    expect(x).toBe(7);
  });
});
