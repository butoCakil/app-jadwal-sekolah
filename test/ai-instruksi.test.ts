import { describe, expect, it } from 'vitest';
import { proyekSekolah } from '../src/model/sekolahData';
import { cocokkanBeban, rencanakan, terapkanInstruksi, uraiBalasan, uraiInstruksi, type Instruksi } from '../src/ai/instruksi';
import { bebanInduk, bebanKegiatan, semesterKegiatan } from '../src/model/simpul';
import { kategoriMapel } from '../src/model/kategoriMapel';

const kodeRombel = (p: ReturnType<typeof proyekSekolah>, id: string) => p.master.rombel.find((r) => r.id === id)?.kode;
const kodeMapel = (p: ReturnType<typeof proyekSekolah>, id: string) => p.master.mapel.find((m) => m.id === id)?.kode;

describe('AI: penguraian balasan dan instruksi', () => {
  it('JSON dalam pagar kode diurai; instruksi dengan op tidak dikenal atau bidang salah dilaporkan', () => {
    const b = uraiBalasan('```json\n{"jawaban":"Siap","instruksi":[{"op":"ubahJp","sasaran":{"mapel":["PRE"]},"kali":2},{"op":"terbang"},{"op":"ubahJp","sasaran":{}},{"op":"ubahJp","sasaran":{"mapel":["PRE"]},"jp":3,"kali":2}]}\n```');
    expect(b.jawaban).toBe('Siap');
    expect(b.instruksi).toEqual([{ op: 'ubahJp', sasaran: { mapel: ['PRE'] }, kali: 2 }]);
    expect(b.galat.length).toBe(4); // op asing, sasaran kosong, dan jp tidak diisi pada instruksi itu, serta jp+kali bersamaan
    expect(b.galat.join('\n')).toMatch(/op tidak dikenal "terbang"/);
    expect(b.galat.join('\n')).toMatch(/sasaran kosong/);
    expect(b.galat.join('\n')).toMatch(/tepat satu dari jp, kali, atau tambah/);
  });

  it('teks yang bukan JSON menjadi jawaban biasa tanpa instruksi', () => {
    const b = uraiBalasan('Maaf, saya belum paham maksudnya.');
    expect(b.instruksi).toEqual([]);
    expect(b.jawaban).toContain('Maaf');
    expect(b.galat.length).toBe(1);
  });

  it('bidang tidak dikenal ditolak (AI tidak boleh menyelipkan bidang sendiri)', () => {
    const u = uraiInstruksi([{ op: 'hapusBeban', sasaran: { mapel: ['PRE'] }, paksa: true }]);
    expect(u.galat.join()).toMatch(/bidang tidak dikenal "paksa"/);
  });
});

describe('AI: penerapan instruksi pada data Tahun 2026', () => {
  it('induk: JP berubah, pola yang tak cocok dihapus, dan pratinjau tidak mengubah data asli', () => {
    const p = proyekSekolah('tahun');
    const awal = JSON.stringify(p);
    const ins: Instruksi[] = [{ op: 'ubahJp', sasaran: { rombel: ['XII TE 1'], mapel: ['PRE'] }, jp: 6 }];
    const r = rencanakan(p, {}, ins);
    expect(r.ok).toBe(true);
    expect(JSON.stringify(p)).toBe(awal);
    expect(r.perubahan[0]?.teks).toBe('XII TE 1 · PRE (BEN): 4 → 6 JP');
    expect(r.peringatan.join(' ')).toMatch(/pola pertemuan dihapus/);
    const b = bebanInduk(r.proyek!).find((x) => kodeRombel(r.proyek!, x.rombelId) === 'XII TE 1' && kodeMapel(r.proyek!, x.mapelId) === 'PRE');
    expect(b?.jp).toBe(6);
    expect(b?.pola).toBeUndefined();
  });

  it('kegiatan: beban induk disalin khusus kegiatan, kelas menjadi terdampak, induk tidak berubah', () => {
    const p = proyekSekolah('tahun');
    const g = p.kalender.find((x) => x.id === 'k-asaj')!;
    const sem = bebanInduk(p, semesterKegiatan(p, g));
    const rb = p.master.rombel.find((x) => !g.rombelTerdampak?.includes(x.id) && !g.rombelTidakAktif.includes(x.id) && sem.some((b) => b.rombelId === x.id && !b.nonTatapMuka && b.jp > 0))!;
    expect(rb).toBeTruthy();
    const target = sem.find((b) => b.rombelId === rb.id && !b.nonTatapMuka && b.jp > 0)!;
    const mapelKode = kodeMapel(p, target.mapelId)!;
    const indukSebelum = JSON.stringify(bebanInduk(p, semesterKegiatan(p, g)));
    const r = rencanakan(p, { kegiatanId: 'k-asaj' }, [{ op: 'ubahJp', sasaran: { rombel: [rb.kode], mapel: [mapelKode], guru: [p.master.guru.find((x) => x.id === target.guruId)!.kode] }, tambah: 1 }]);
    expect(r.ok).toBe(true);
    expect(r.perubahan[0]?.teks).toMatch(/menjadi kelas terdampak/);
    const g2 = r.proyek!.kalender.find((x) => x.id === 'k-asaj')!;
    expect(g2.rombelTerdampak).toContain(rb.id);
    const khusus = bebanKegiatan(r.proyek!, g2).find((x) => x.asal === target.id);
    expect(khusus?.jp).toBe(target.jp + 1);
    expect(khusus?.versiId).toBe(g.versiId);
    expect(JSON.stringify(bebanInduk(r.proyek!, semesterKegiatan(r.proyek!, g2)))).toBe(indukSebelum);
  });

  it('semua atau tidak sama sekali: satu instruksi salah membatalkan semuanya', () => {
    const p = proyekSekolah('tahun');
    const awal = JSON.stringify(p);
    const h = terapkanInstruksi(p, {}, [
      { op: 'ubahJp', sasaran: { rombel: ['XII TE 1'], mapel: ['PRE'] }, jp: 6 },
      { op: 'ubahJp', sasaran: { rombel: ['XII TE 1'], mapel: ['XXX'] }, jp: 2 },
    ]);
    expect(h.ok).toBe(false);
    expect(h.galat.join()).toMatch(/Kode mapel tidak dikenal: "XXX"/);
    expect(JSON.stringify(p)).toBe(awal);
  });

  it('batas JP dan hasil pembulatan dijaga', () => {
    const p = proyekSekolah('tahun');
    const h = terapkanInstruksi(p, {}, [{ op: 'ubahJp', sasaran: { rombel: ['XII TE 1'], mapel: ['PRE'] }, kali: 10 }]);
    expect(h.ok).toBe(false);
    expect(h.galat.join()).toMatch(/harus bilangan bulat 0 sampai 20/);
  });

  it('aturan guru: berlaku untuk semua periode, jadi ditolak pada kegiatan tetapi diterima pada induk', () => {
    const p = proyekSekolah('tahun');
    const ins: Instruksi[] = [{ op: 'guruTidakTersedia', guru: 'BEN', hari: ['Jumat', 'Senin'], jam: [1, 2] }];
    const tolak = rencanakan(p, { kegiatanId: 'k-asas' }, ins);
    expect(tolak.ok).toBe(false);
    expect(tolak.galat.join()).toMatch(/hanya bisa diterapkan pada jadwal induk/);
    const ok = rencanakan(p, {}, ins);
    expect(ok.ok).toBe(true);
    expect(ok.proyek!.aturan.length).toBe(p.aturan.length + 2);
    const baru = ok.proyek!.aturan.filter((a) => a.jenis === 'guruTidakTersedia' && a.jam.length === 2 && a.guruId === p.master.guru.find((x) => x.kode === 'BEN')!.id);
    expect(baru.map((a) => a.jenis === 'guruTidakTersedia' && a.hari).sort()).toEqual([0, 4]);
  });

  it('kunci ruang hanya pada kegiatan dan tercatat di kegiatan itu', () => {
    const p = proyekSekolah('tahun');
    const ins: Instruksi[] = [{ op: 'kunciRuang', ruang: ['G1', 'G2'], hari: ['Senin'], mulai: '07:00', selesai: '10:00' }];
    expect(rencanakan(p, {}, ins).ok).toBe(false);
    const r = rencanakan(p, { kegiatanId: 'k-tka1' }, ins);
    expect(r.ok).toBe(true);
    const g = r.proyek!.kalender.find((x) => x.id === 'k-tka1')!;
    const lama = p.kalender.find((x) => x.id === 'k-tka1')!;
    expect(g.ruangKunci?.length).toBe((lama.ruangKunci?.length ?? 0) + 1);
    expect(g.ruangKunci?.at(-1)).toMatchObject({ hari: [0], mulai: '07:00', selesai: '10:00' });
  });

  it('ruang beban: prioritas dan terlarang diganti, dan tidak boleh bertabrakan', () => {
    const p = proyekSekolah('tahun');
    const ok = rencanakan(p, {}, [{ op: 'ruangBeban', sasaran: { rombel: ['XII TE 1'], mapel: ['PRE'] }, prioritas: ['B2', 'B3'], terlarang: ['I1'] }]);
    expect(ok.ok).toBe(true);
    expect(ok.perubahan[0]?.teks).toMatch(/prioritas .* → B2, B3; terlarang .* → I1/);
    const bentrok = rencanakan(p, {}, [{ op: 'ruangBeban', sasaran: { rombel: ['XII TE 1'], mapel: ['PRE'] }, prioritas: ['B2'], terlarang: ['B2'] }]);
    expect(bentrok.ok).toBe(false);
  });

  it('hapus dan tambah beban mengikuti cara tab Beban', () => {
    const p = proyekSekolah('tahun');
    const r = rencanakan(p, {}, [
      { op: 'hapusBeban', sasaran: { rombel: ['XII TE 1'], mapel: ['BK'] } },
      { op: 'tambahBeban', rombel: ['XII TE 1'], mapel: 'BK', guru: 'MIF', jp: 2 },
    ]);
    expect(r.ok).toBe(true);
    const bk = bebanInduk(r.proyek!).filter((x) => kodeRombel(r.proyek!, x.rombelId) === 'XII TE 1' && kodeMapel(r.proyek!, x.mapelId) === 'BK');
    expect(bk.map((x) => x.jp)).toEqual([2]);
  });

  it('sasaran: kategori dan tingkat dicocokkan, kode asing dilaporkan', () => {
    const p = proyekSekolah('tahun');
    const c = cocokkanBeban(p, {}, { kategori: ['Jurusan TE'], tingkat: ['XII'] });
    expect(c.beban.length).toBeGreaterThan(0);
    expect(c.beban.every((b) => p.master.rombel.find((r) => r.id === b.rombelId)?.tingkat === 'XII')).toBe(true);
    expect(c.beban.every((b) => kategoriMapel(p.master.mapel.find((m) => m.id === b.mapelId)!, p.master.mapel) === 'Jurusan TE')).toBe(true);
    expect(cocokkanBeban(p, {}, { jurusan: ['ZZ'] }).galat.join()).toMatch(/Jurusan tidak dikenal/);
    expect(cocokkanBeban(p, {}, { guru: ['QQQ'] }).galat.join()).toMatch(/Kode guru tidak dikenal/);
  });

  it('susun cara "induk" hanya untuk kegiatan', () => {
    const p = proyekSekolah('tahun');
    const r = rencanakan(p, {}, [{ op: 'susun', cara: 'induk' }]);
    expect(r.ok).toBe(false);
    expect(r.galat.join()).toMatch(/hanya untuk kegiatan/);
    expect(rencanakan(p, {}, [{ op: 'susun', cara: 'lengkapi' }]).ok).toBe(true);
  });

  it('susun tidak mengubah data; hanya dicatat sebagai tindakan', () => {
    const p = proyekSekolah('tahun');
    const awal = JSON.stringify(p);
    const r = rencanakan(p, { kegiatanId: 'k-asas' }, [{ op: 'susun', cara: 'induk', detik: 20 }]);
    expect(r.ok).toBe(true);
    expect(r.susun).toEqual({ cara: 'induk', detik: 20 });
    expect(JSON.stringify(r.proyek)).toBe(awal);
  });
});
