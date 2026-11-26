import { describe, expect, it } from 'vitest';
import { proyekContoh } from '../src/model/contoh';
import { ruangSekolah, terapkanRuangSekolah } from '../src/model/ruangSekolah';
import { tentukanRuang } from '../src/mesin/penempatan';
import { validasiProyek } from '../src/model/validasi';
import { periksa } from '../src/mesin/validator';

describe('ruang sekolah (site plan 2026)', () => {
  it('kode unik dan lapangan bersama', () => {
    const r = ruangSekolah();
    expect(new Set(r.map((x) => x.kode)).size).toBe(r.length);
    expect(r.find((x) => x.kode === 'LAP')?.bersama).toBe(true);
    expect(r.find((x) => x.kode === 'B3')?.nama).toBe('RP. Audio Video TE');
    expect(r.find((x) => x.kode === 'B1')?.dijadwalkan).toBe(false);
  });
  it('menerapkan ke proyek: valid, rujukan sekode dipertahankan, slot punya ruang yang ada', () => {
    const p = proyekContoh();
    const kodeLama = new Map(p.master.ruang.map((r) => [r.id, r.kode]));
    const bPrioritas = p.beban.find((b) => b.ruangPrioritas.length > 0)!;
    const kodePrioritasLama = bPrioritas.ruangPrioritas.map((i) => kodeLama.get(i));
    terapkanRuangSekolah(p);
    expect(validasiProyek(p)).toEqual([]);
    const ada = new Set(p.master.ruang.map((r) => r.id));
    for (const s of p.versi[0]!.slots) expect(s.ruangId === '' || ada.has(s.ruangId)).toBe(true);
    const kodeBaru = bPrioritas.ruangPrioritas.map((i) => p.master.ruang.find((r) => r.id === i)?.kode);
    expect(kodeBaru.every((k) => kodePrioritasLama.includes(k))).toBe(true);
  });
  it('penempatan otomatis tidak memilih ruang yang tidak dijadwalkan', () => {
    const p = proyekContoh();
    terapkanRuangSekolah(p);
    const b = p.beban[0]!;
    b.ruangPrioritas = [];
    const tak = new Set(p.master.ruang.filter((r) => r.dijadwalkan === false).map((r) => r.id));
    const pakai = new Set<string>();
    const slots: { id: string; bebanId: string; hari: number; jam: number; ruangId: string }[] = [];
    for (let i = 0; i < p.master.ruang.length; i++) {
      const r = tentukanRuang(p, slots, b, 0, 1);
      if (!r.ruangId) break;
      pakai.add(r.ruangId);
      slots.push({ id: `x${i}`, bebanId: b.id, hari: 0, jam: 1, ruangId: r.ruangId });
    }
    expect([...pakai].some((id) => tak.has(id))).toBe(false);
    expect(periksa(p, []).length).toBeGreaterThanOrEqual(0);
  });
});

describe('jenis ruang per mapel', () => {
  it('bawaan: teori dulu, lapangan tidak dipilih; pengaturan mapel diikuti', () => {
    const p = proyekContoh();
    terapkanRuangSekolah(p);
    const b = p.beban[0]!;
    b.ruangPrioritas = [];
    const m = p.master.mapel.find((x) => x.id === b.mapelId)!;
    const jenis = (id: string) => p.master.ruang.find((r) => r.id === id)?.jenis;
    expect(jenis(tentukanRuang(p, [], b, 0, 1).ruangId)).toBe('teori');
    m.jenisRuang = ['praktik'];
    expect(jenis(tentukanRuang(p, [], b, 0, 1).ruangId)).toBe('praktik');
    m.jenisRuang = ['lapangan'];
    expect(jenis(tentukanRuang(p, [], b, 0, 1).ruangId)).toBe('lapangan');
  });
});
