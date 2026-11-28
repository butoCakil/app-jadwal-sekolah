import { describe, expect, it } from 'vitest';
import { formatTeks, hitungPilihan, kartuUsulan, namaOp } from '../src/ui/aiKartu';
import type { Giliran } from '../src/ai/sesi';

const giliran = (status: 'menunggu' | 'diterapkan' | 'ditolak' | 'diurungkan', extra: Partial<Giliran['rencana'] & object> = {}): Giliran =>
  ({
    id: 7,
    peran: 'ai',
    teks: 'ok',
    galat: [],
    rencana: {
      status,
      balasan: { jawaban: 'ok', instruksi: [{ op: 'ubahJp', sasaran: { rombel: ['XII TE 1'], mapel: ['PRE'] }, jp: 6 }, { op: 'susun', cara: 'lengkapi' }], pertanyaan: null, tidakBisa: [] },
      hasil: { ok: true, perubahan: [{ teks: 'XII TE 1 · PRE (BEN): 4 → 6 JP', jenis: 'ubah', instruksi: 0 }], peringatan: ['JP melebihi rata-rata'], galat: [], susun: { cara: 'lengkapi' } },
      ...extra,
    },
  }) as unknown as Giliran;
const o = { dikecualikan: new Set<number>(), bisaUrungkan: false, waktu: () => '16.52' };

describe('formatTeks', () => {
  it('menampilkan tebal, kode, dan daftar; HTML disaring', () => {
    const h = formatTeks('**Penting** `k-ukk`\n- satu\n- dua\n<script>x</script>');
    expect(h).toContain('<b>Penting</b>');
    expect(h).toContain('<code');
    expect(h).toContain('<ul');
    expect((h.match(/<li>/g) ?? []).length).toBe(2);
    expect(h).not.toContain('<script>');
  });
});

describe('kartuUsulan', () => {
  it('menunggu: butir bercentang, tombol Terapkan jelas, peringatan tampil, tanpa Urungkan', () => {
    const h = kartuUsulan(giliran('menunggu'), o);
    expect(h).toContain('Menunggu keputusan Anda');
    expect(h).toContain('Terapkan semua (2)');
    expect(h).toContain('data-aksi="aiTolak"');
    expect(h).toContain('JP melebihi rata-rata');
    expect((h.match(/data-aksi="aiPilih"/g) ?? []).length).toBe(2);
    expect(h).not.toContain('aiUrungkan');
    expect(h).toContain('Belum ada yang berubah');
  });

  it('sebagian dicentang: label tombol menyebut jumlah, semua dicabut: tombol nonaktif', () => {
    const g = giliran('menunggu');
    expect(kartuUsulan(g, { ...o, dikecualikan: new Set([1]) })).toContain('Terapkan 1 dari 2');
    expect(hitungPilihan(g, new Set([0, 1]))).toEqual({ dipilih: 0, total: 2 });
    expect(kartuUsulan(g, { ...o, dikecualikan: new Set([0, 1]) })).toMatch(/data-aksi="aiTerapkan"[^>]*disabled/);
  });

  it('diterapkan: lencana dan waktu; Urungkan hanya bila masih bisa', () => {
    const g = giliran('diterapkan', { diputuskan: 1, dikecualikan: [1] });
    expect(kartuUsulan(g, o)).toContain('✓ Diterapkan 16.52');
    expect(kartuUsulan(g, o)).not.toContain('aiUrungkan');
    expect(kartuUsulan(g, { ...o, bisaUrungkan: true })).toContain('data-aksi="aiUrungkan"');
    expect(kartuUsulan(g, o)).toContain('tidak diterapkan');
    expect(kartuUsulan(g, o)).not.toContain('data-aksi="aiTerapkan"');
  });

  it('ditolak dan diurungkan punya lencana sendiri', () => {
    expect(kartuUsulan(giliran('ditolak'), o)).toContain('Ditolak');
    expect(kartuUsulan(giliran('diurungkan'), o)).toContain('Diurungkan');
  });

  it('namaOp mencakup semua operasi', () => {
    expect(namaOp({ op: 'susun', cara: 'nol' } as never)).toBe('Susun otomatis');
  });
});
