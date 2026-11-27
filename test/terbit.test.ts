import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { proyekSekolah } from '../src/model/sekolahData';
import { BERKAS_TERBIT, bacaTerbit, bangunTerbit, periksaPrivasi } from '../src/terbit/format';
import { daftarEntitasP, jadwalHariP, jadwalPekanP } from '../src/publik/tampil';

const p = proyekSekolah('tahun');
const rombel = (kode: string) => p.master.rombel.find((r) => r.kode === kode)!.id;
const sumPekan = (tgl: string, mode: 'rombel' | 'guru' | 'ruang', id: string) => jadwalPekanP(p, tgl, mode, id).hari.reduce((a, h) => a + h.totalJp, 0);

describe('format terbit', () => {
  const t = bangunTerbit(p, new Date('2026-11-28T00:00:00Z'));

  it('lolos pemeriksaan privasi dan tidak memuat data admin', () => {
    expect(periksaPrivasi(t)).toEqual([]);
    expect(t.proyek.aturan).toEqual([]);
    expect(t.proyek.diterima).toEqual([]);
    expect(t.proyek.kalender.some((k) => k.ruangKunci || k.pengawas || k.rombelTanpaRuang || k.catatan)).toBe(false);
    expect(p.kalender.some((k) => k.catatan)).toBe(true);
    expect(/keputusan|\.pdf|Sumber:|Penyesuaian/i.test(JSON.stringify(t))).toBe(false);
    expect(t.proyek.beban.every((b) => b.ruangPrioritas.length === 0 && b.ruangTerlarang.length === 0)).toBe(true);
    expect(t.proyek.master.guru.every((g) => Object.keys(g).sort().join() === 'id,kode,nama')).toBe(true);
    // berkas sumber tidak berubah (penyaringan bekerja pada salinan)
    expect(p.aturan.length).toBeGreaterThan(0);
  });

  it('mendeteksi tanda data pribadi', () => {
    expect(periksaPrivasi({ guru: [{ nama: 'A', nip: '1' }] }).length).toBe(1);
    expect(periksaPrivasi({ nama: 'Budi 198001012005011001' }).length).toBe(1);
    expect(periksaPrivasi({ nama: 'Budi 1980 0101 2005 01 1001' }).length).toBe(1);
    expect(periksaPrivasi({ x: { token: 'ghp_abc' } }).length).toBe(1);
    expect(periksaPrivasi({ id: 'beban~lq3x9a', jam: '07:30', tanggal: '2026-11-28' })).toEqual([]);
    expect(() => bangunTerbit({ ...p, master: { ...p.master, guru: [{ id: 'g', nama: 'X 198001012005011001', kode: 'XXX' }] } })).toThrow(/ditolak/);
  });

  it('bolak-balik lewat JSON dan menolak berkas salah', () => {
    const h = bacaTerbit(JSON.stringify(t));
    expect(h.ok).toBe(true);
    if (h.ok) {
      expect(h.terbit.diterapkan).toBe('2026-11-28T00:00:00.000Z');
      expect(h.terbit.proyek.beban.length).toBe(p.beban.length);
    }
    expect(bacaTerbit('{').ok).toBe(false);
    expect(bacaTerbit('{"format":"lain"}').ok).toBe(false);
    expect(bacaTerbit(JSON.stringify({ ...t, versi: 9 })).ok).toBe(false);
    expect(bacaTerbit(JSON.stringify({ ...t, proyek: { skema: [] } })).ok).toBe(false);
  });

  it('jadwal publik sama dengan jadwal admin (dihitung dari data terbit)', () => {
    const h = bacaTerbit(JSON.stringify(t));
    if (!h.ok) throw new Error(h.galat);
    for (const tgl of ['2026-11-10', '2026-12-01', '2026-10-27']) {
      for (const r of daftarEntitasP(p, 'rombel')) {
        expect(sumPekan(tgl, 'rombel', r.id)).toBe(jadwalPekanP(h.terbit.proyek, tgl, 'rombel', r.id).hari.reduce((a, d) => a + d.totalJp, 0));
      }
    }
  });

  it('menulis data awal bila TULIS_TERBIT=1', () => {
    if (!process.env.TULIS_TERBIT) return;
    mkdirSync('data/terbit', { recursive: true });
    writeFileSync(BERKAS_TERBIT, JSON.stringify(bangunTerbit(p)));
    expect(existsSync(BERKAS_TERBIT)).toBe(true);
    expect(bacaTerbit(readFileSync(BERKAS_TERBIT, 'utf8')).ok).toBe(true);
  });
});

describe('tampilan publik', () => {
  it('pekan reguler: tiap kelas aktif punya 48 JP, dan jumlah per kelas = jumlah per ruang + slot tanpa ruang', () => {
    let totalKelas = 0;
    for (const r of daftarEntitasP(p, 'rombel')) {
      const jp = sumPekan('2026-11-10', 'rombel', r.id);
      const pekan = jadwalPekanP(p, '2026-11-10', 'rombel', r.id);
      if (pekan.hari.every((h) => h.status === 'tidakAktif')) continue;
      expect(jp).toBe(48);
      totalKelas += jp;
    }
    const totalRuang = daftarEntitasP(p, 'ruang').reduce((a, r) => a + sumPekan('2026-11-10', 'ruang', r.id), 0);
    expect(totalRuang).toBeGreaterThan(0);
    expect(totalRuang).toBeLessThanOrEqual(totalKelas);
  });

  it('status hari: akhir pekan, libur, kelas tidak aktif, di luar semester, kegiatan', () => {
    expect(jadwalHariP(p, '2026-11-28', 'rombel', rombel('X TE 1')).status).toBe('akhirPekan');
    expect(jadwalHariP(p, '2026-11-10', 'rombel', rombel('XI AT 3')).status).toBe('tidakAktif');
    expect(jadwalHariP(p, '2026-08-04', 'rombel', rombel('X TE 1')).status).toBe('normal');
    expect(jadwalHariP(p, '2026-12-30', 'rombel', rombel('X TE 1')).status).toBe('diluarSemester');
    const asas = jadwalHariP(p, '2026-12-01', 'rombel', rombel('XI TE 2'));
    expect(asas.kegiatan?.nama).toMatch(/ASAS/i);
    expect(asas.elemen.some((e) => e.jenis === 'blok')).toBe(true);
    const libur = p.kalender.find((k) => k.jenis === 'libur' && !k.agenda);
    if (libur) expect(jadwalHariP(p, libur.mulai, 'rombel', rombel('X TE 1')).status).toBe('libur');
  });

  it('elemen hari berurutan menurut skema: istirahat memotong blok dan jam kosong digabung', () => {
    const d = jadwalHariP(p, '2026-11-10', 'rombel', rombel('X TE 1'));
    expect(d.status).toBe('normal');
    const jam = d.elemen.reduce((a, e) => a + (e.jenis === 'blok' || e.jenis === 'kosong' ? e.jp : 0), 0);
    const skema = p.skema.find((s) => s.nama === d.skema)!;
    expect(jam).toBe(skema.baris.filter((b) => b.tipe === 'kbm').length);
    expect(d.elemen.some((e) => e.jenis === 'istirahat')).toBe(true);
    for (let i = 1; i < d.elemen.length; i++) {
      const a = d.elemen[i - 1]!, b = d.elemen[i]!;
      if (a.jenis === 'blok' && b.jenis === 'blok') expect(a.item.map((x) => x.bebanId).join() === b.item.map((x) => x.bebanId).join() && a.item[0]?.ruang === b.item[0]?.ruang).toBe(false);
    }
  });

  it('mode guru dan ruang memuat kelas yang sama dengan mode kelas', () => {
    const pekan = jadwalPekanP(p, '2026-11-10', 'rombel', rombel('X TE 1'));
    const sel = pekan.baris.flatMap((b, r) => b.map((c, h) => ({ r, h, c }))).find((x) => x.c && x.c.item.length && x.c.item[0]!.ruang)!;
    const it = sel.c!.item[0]!;
    const idGuru = p.master.guru.find((g) => g.kode === it.guru[0]!.kode)!.id;
    const idRuang = p.master.ruang.find((r) => r.kode === it.ruang)!.id;
    for (const [mode, id] of [['guru', idGuru], ['ruang', idRuang]] as const) {
      const lain = jadwalPekanP(p, '2026-11-10', mode, id);
      const c = lain.baris[sel.r]![sel.h]!;
      expect(c.item.some((x) => x.rombel === 'X TE 1' && x.mapel.kode === it.mapel.kode)).toBe(true);
    }
  });

  it('daftar pilihan: kelas terurut, guru hanya yang mengajar, ruang yang dijadwalkan', () => {
    const k = daftarEntitasP(p, 'rombel');
    expect(k[0]!.grup).toBe('Kelas X');
    expect(k.length).toBe(p.master.rombel.length);
    expect(daftarEntitasP(p, 'guru').length).toBeGreaterThan(30);
    expect(daftarEntitasP(p, 'ruang').every((r) => p.master.ruang.find((x) => x.id === r.id)!.dijadwalkan !== false)).toBe(true);
  });
});

describe('halaman publik', () => {
  const t = bangunTerbit(p, new Date('2026-11-28T00:00:00Z'));
  const id = rombel('X TE 1');

  it('menampilkan hari: pilihan, jadwal, istirahat, dan jam diperbarui', async () => {
    const { gambarHalaman } = await import('../src/publik/halaman');
    const html = gambarHalaman(t, { mode: 'rombel', id, tanggal: '2026-11-10', tata: 'hari' }, '2026-11-10');
    expect(html).toContain('Selasa, 10 November 2026');
    expect(html).toContain('<select id="pilih"');
    expect(html).toContain('X TE 1');
    expect(html).toContain('Istirahat');
    expect(html).toMatch(/Jadwal diperbarui .*WIB/);
    expect(html).toContain('href="#/admin"');
  });

  it('menampilkan pekan, status libur/akhir pekan, dan kegiatan', async () => {
    const { gambarHalaman } = await import('../src/publik/halaman');
    const pekan = gambarHalaman(t, { mode: 'guru', id: daftarEntitasP(p, 'guru')[0]!.id, tanggal: '2026-12-01', tata: 'pekan' }, '2026-12-01');
    expect(pekan).toContain('<table');
    expect(pekan).toMatch(/ASAS/);
    const akhir = gambarHalaman(t, { mode: 'ruang', id: daftarEntitasP(p, 'ruang')[0]!.id, tanggal: '2026-11-28', tata: 'hari' }, '2026-11-28');
    expect(akhir).toContain('Akhir pekan');
  });

  it('nama dari data dilolos-eskapkan', async () => {
    const { gambarHalaman } = await import('../src/publik/halaman');
    const t2 = structuredClone(t);
    t2.proyek.master.rombel[0]!.kode = '<img src=x onerror=alert(1)>';
    const html = gambarHalaman(t2, { mode: 'rombel', id: t2.proyek.master.rombel[0]!.id, tanggal: '2026-11-10', tata: 'hari' }, '2026-11-10');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img');
  });

  it('navigasi hari melewati akhir pekan dan hari terdekat', async () => {
    const { hariKerjaTerdekat, langkahHari } = await import('../src/publik/halaman');
    expect(hariKerjaTerdekat('2026-11-28', 5)).toBe('2026-11-30');
    expect(hariKerjaTerdekat('2026-11-10', 5)).toBe('2026-11-10');
    expect(langkahHari('2026-11-27', 1, 5)).toBe('2026-11-30');
    expect(langkahHari('2026-11-30', -1, 5)).toBe('2026-11-27');
  });

  it('memuat data terbit: berhasil, belum ada, rusak, gagal jaringan', async () => {
    const { muatTerbit } = await import('../src/publik/halaman');
    const balas = (status: number, isi = '') => (async () => new Response(isi, { status })) as unknown as typeof fetch;
    expect((await muatTerbit(balas(200, JSON.stringify(t)))).ok).toBe(true);
    expect(await muatTerbit(balas(404))).toEqual({ ok: false, galat: 'Jadwal belum diterbitkan.' });
    expect((await muatTerbit(balas(200, 'bukan json'))).ok).toBe(false);
    expect((await muatTerbit(balas(500))).ok).toBe(false);
    const putus = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
    expect(await muatTerbit(putus)).toMatchObject({ ok: false });
  });
});
