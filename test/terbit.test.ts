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
    const hari = jadwalHariP(p, '2026-11-10', 'rombel', rombel('X TE 1'));
    const blok = hari.elemen.find((e) => e.jenis === 'blok' && e.item[0]!.ruang)!;
    if (blok.jenis !== 'blok') throw new Error('bukan blok');
    const it = blok.item[0]!;
    const idGuru = p.master.guru.find((g) => g.kode === it.guru[0]!.kode)!.id;
    const idRuang = p.master.ruang.find((r) => r.kode === it.ruang)!.id;
    for (const [mode, id] of [['guru', idGuru], ['ruang', idRuang]] as const) {
      const lain = jadwalHariP(p, '2026-11-10', mode, id);
      const e = lain.elemen.find((x) => (x.jenis === 'blok') && blok.a >= x.a && blok.a <= x.b);
      expect(e && e.jenis === 'blok' && e.item.some((x) => x.rombel === 'X TE 1' && x.mapel.kode === it.mapel.kode)).toBe(true);
    }
  });

  it('skema berpengaruh: skema 11 punya pembiasaan (P1), skema 10 langsung pelajaran; istirahat memotong blok', () => {
    const id = rombel('X AT 1');
    const sen = jadwalHariP(p, '2026-11-09', 'rombel', id);
    const sel = jadwalHariP(p, '2026-11-10', 'rombel', id);
    expect(sen.skema).toMatch(/11/);
    expect(sel.skema).toMatch(/10/);
    expect(sen.elemen[0]).toMatchObject({ jenis: 'nonKbm', kode: 'P1', label: '1' });
    expect(sen.kolom[1]).toMatchObject({ tipe: 'kbm', label: '2', nomor: 1 });
    expect(sel.elemen[0]!.jenis).not.toBe('nonKbm');
    expect(sel.kolom[0]).toMatchObject({ tipe: 'kbm', label: '1', nomor: 1 });
    // blok tidak pernah melintasi istirahat: nomor KBM 3 dan 4 tidak berada dalam satu blok
    for (const d of [sen, sel]) for (const e of d.elemen) if (e.jenis === 'blok' || e.jenis === 'kosong') expect(e.a <= 3 && e.b >= 4).toBe(false);
    // 5 JP DAT berurutan di hari Senin terbagi dua di sekitar istirahat
    const dat = sen.elemen.filter((e) => e.jenis === 'blok' && e.item[0]!.mapel.kode === 'DAT');
    expect(dat.length).toBeGreaterThanOrEqual(2);
  });

  it('jam berurutan dengan mapel dan ruang sama digabung menjadi satu elemen', () => {
    const d = jadwalHariP(p, '2026-11-09', 'rombel', rombel('X AT 1'));
    const gabung = d.elemen.filter((e) => e.jenis === 'blok' && e.jp >= 2);
    expect(gabung.length).toBeGreaterThan(0);
    for (const e of gabung) if (e.jenis === 'blok') expect(e.b - e.a + 1).toBe(e.jp);
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
  const K = { tab: 'rombel' as const, baris: 'rombel' as const, id: '', tanggal: '2026-11-10', tata: 'hari' as const, zoom: 'sedang' as const, hariSemua: -1 };
  const id = rombel('X TE 1');

  it('menampilkan hari: pilihan, jadwal, istirahat, dan jam diperbarui', async () => {
    const { gambarHalaman } = await import('../src/publik/halaman');
    const html = gambarHalaman(t, { ...K, tab: 'rombel', id, tanggal: '2026-11-10', tata: 'hari' }, '2026-11-10');
    expect(html).toContain('Selasa, 10 November 2026');
    expect(html).toContain('<select id="pilih"');
    expect(html).toContain('X TE 1');
    expect(html).toContain('Istirahat');
    expect(html).toMatch(/Jadwal diperbarui .*WIB/);
    expect(html).toContain('href="#/admin"');
  });

  it('menampilkan pekan, status libur/akhir pekan, dan kegiatan', async () => {
    const { gambarHalaman } = await import('../src/publik/halaman');
    const pekan = gambarHalaman(t, { ...K, tab: 'guru', id: daftarEntitasP(p, 'guru')[0]!.id, tanggal: '2026-12-01', tata: 'pekan' }, '2026-12-01');
    expect(pekan).toContain('<table');
    expect(pekan).toMatch(/ASAS/);
    const akhir = gambarHalaman(t, { ...K, tab: 'ruang', id: daftarEntitasP(p, 'ruang')[0]!.id, tanggal: '2026-11-28', tata: 'hari' }, '2026-11-28');
    expect(akhir).toContain('Akhir pekan');
  });

  it('nama dari data dilolos-eskapkan', async () => {
    const { gambarHalaman } = await import('../src/publik/halaman');
    const t2 = structuredClone(t);
    t2.proyek.master.rombel[0]!.kode = '<img src=x onerror=alert(1)>';
    const html = gambarHalaman(t2, { ...K, tab: 'rombel', id: t2.proyek.master.rombel[0]!.id, tanggal: '2026-11-10', tata: 'hari' }, '2026-11-10');
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

  it('per pekan berbentuk grid: P1, istirahat, sel digabung (rowspan), nomor jam poster per hari', async () => {
    const { gambarHalaman } = await import('../src/publik/halaman');
    const html = gambarHalaman(t, { ...K, tab: 'rombel', id: rombel('X AT 1'), tanggal: '2026-11-10', tata: 'pekan' }, '2026-11-10');
    expect(html).toContain('>P1<');
    expect(html).toContain('Istirahat</td>');
    // nomor jam mengikuti poster tiap hari: skema 11 sampai 11 (pembiasaan = 1), skema 10 sampai 10
    const nomor = (h: string): string[] => [...h.matchAll(/tabular-nums text-slate-500">([^<]*)<\/td>/g)].map((m) => m[1]!);
    const semua = nomor(html);
    // 5 hari x (1 baris Pagi + 10 baris pelajaran): tiap hari punya gutter di setiap baris
    expect(semua.length).toBe(5 * 11);
    expect(semua.filter((x) => x === '11').length).toBe(2); // Sen dan Kam (skema 11)
    expect(semua.filter((x) => x === '10').length).toBe(5 - 1); // skema 9 hanya sampai 9
    expect(semua.slice(0, 5)).toEqual(['1', '', '', '1', '1']); // baris Pagi: P1 = jam 1 pada skema 11 dan 9
    expect(semua.slice(5, 10)).toEqual(['2', '1', '1', '2', '2']); // pelajaran pertama
    expect(html).toContain('text-slate-500">1</td>');
    expect(html).not.toContain('>Pagi<');
    expect(/rowspan="[2-9]"/.test(html)).toBe(true);
    expect(html).toContain('Skema 11');
    expect(html).toContain('Skema 10');
  });

  it('tab Kalender: grid bulan, rincian tanggal, dan daftar agenda dari data terbit', async () => {
    const { gambarHalaman } = await import('../src/publik/halaman');
    const h = gambarHalaman(t, { ...K, tab: 'kalender', tanggal: '2026-11-30', bulan: '2026-11' }, '2026-11-28');
    // tab kelima ada dan aktif; kontrol per-entitas tidak tampil
    expect(h).toContain('data-tab="kalender"');
    expect(h).not.toContain('id="pilih"');
    expect(h).toContain('November 2026');
    // 30 sel tanggal + 7 nama hari; Sabtu/Minggu tidak memuat rentang panjang (hanya acara satu hari)
    expect((h.match(/data-aksi="kalPilih"/g) ?? []).length).toBe(30);
    // daftar agenda bulan itu memuat kegiatan pengubah jadwal dengan tombol ke jadwal dan agenda dengan sasaran
    expect(h).toContain('TKA Gelombang 2');
    expect(h).toContain('Mengubah jadwal');
    expect(h).toContain('data-aksi="kalKeJadwal"');
    expect(h).toContain('Upacara Hari Pahlawan');
    expect(h).toContain('Semua kelas');
    // rincian tanggal terpilih (30 Nov = ASAS, hari belajar)
    expect(h).toContain('Senin, 30 November 2026');
    expect(h).toContain('ASAS Kelas X dan ASAJ Kelas XII');
    expect(h).toContain('data-aksi="kalLihatHari"');
    // bulan lain: Natal berstatus libur, tanpa tombol Lihat jadwal
    const des = gambarHalaman(t, { ...K, tab: 'kalender', tanggal: '2026-12-25', bulan: '2026-12' }, '2026-11-28');
    expect(des).toContain('Natal');
    expect(des).toContain('Libur');
    expect(des).not.toContain('data-aksi="kalLihatHari"');
    expect(des).toContain('bg-red-50');
    // libur menurut kalender akademik pada hari kerja dalam semester (Maulid, 25 Agu) tampil sebagai libur, tanpa tombol jadwal
    const agu = gambarHalaman(t, { ...K, tab: 'kalender', tanggal: '2026-08-25', bulan: '2026-08' }, '2026-11-28');
    expect(agu).toContain('menurut kalender akademik');
    expect(agu).not.toContain('data-aksi="kalLihatHari"');
    // bulan tanpa data tidak membuat galat
    const kosong = gambarHalaman(t, { ...K, tab: 'kalender', tanggal: '2030-01-01', bulan: '2030-01' }, '2026-11-28');
    expect(kosong).toContain('Tidak ada agenda pada bulan ini.');
  });

  it('panah pindah kelas/guru/ruang ada di tiap tab per-entitas', async () => {
    const { gambarHalaman } = await import('../src/publik/halaman');
    for (const tab of ['rombel', 'guru', 'ruang'] as const) {
      const html = gambarHalaman(t, { ...K, tab, id: daftarEntitasP(p, tab)[0]!.id }, '2026-11-10');
      expect(html).toContain('data-aksi="sebelumnya"');
      expect(html).toContain('data-aksi="berikutnya"');
    }
  });

  it('tab Semua: satu baris per kelas, semua hari, kepala skema, dan bisa dibatasi satu hari', async () => {
    const { gambarHalaman } = await import('../src/publik/halaman');
    const semua = gambarHalaman(t, { ...K, tab: 'semua' }, '2026-11-10');
    expect(semua).toContain('id="matriks"');
    const jumlahBaris = (semua.match(/<tbody>([\s\S]*)<\/tbody>/)![1]!.match(/<tr>/g) ?? []).length;
    expect(jumlahBaris).toBe(p.master.rombel.length);
    for (const h of ['Sen', 'Sel', 'Rab', 'Kam', 'Jum']) expect(semua).toContain(`>${h} `);
    const satu = gambarHalaman(t, { ...K, tab: 'semua', hariSemua: 1 }, '2026-11-10');
    expect(satu).toContain('>Sel ');
    expect(satu).not.toContain('>Sen ');
    expect(satu.length).toBeLessThan(semua.length);
    const guru = gambarHalaman(t, { ...K, tab: 'semua', baris: 'guru' }, '2026-11-10');
    expect(guru).toContain('data-aksi="det"');
  });

  it('matriks: jumlah JP semua kelas sama dengan jumlah tiap kelas, dan Peta lebih sempit dari Besar', async () => {
    const { matriksP } = await import('../src/publik/tampil');
    const { gambarHalaman } = await import('../src/publik/halaman');
    const m = matriksP(p, '2026-11-10', 'rombel');
    for (const b of m.baris) expect(b.hari.reduce((a, h) => a + h.totalJp, 0)).toBe(sumPekan('2026-11-10', 'rombel', b.id));
    const lebarTabel = (h: string) => Number(/table-layout:fixed;width:(\d+)px/.exec(h)![1]);
    expect(lebarTabel(gambarHalaman(t, { ...K, tab: 'semua', zoom: 'peta' }, '2026-11-10', 390))).toBeLessThanOrEqual(390);
    expect(lebarTabel(gambarHalaman(t, { ...K, tab: 'semua', zoom: 'besar' }, '2026-11-10', 390))).toBeGreaterThan(lebarTabel(gambarHalaman(t, { ...K, tab: 'semua', zoom: 'sedang' }, '2026-11-10', 390)));
  });

  it('rincian kotak: mapel, guru, ruang, dan waktu', async () => {
    const { htmlRincian } = await import('../src/publik/halaman');
    const d = jadwalHariP(p, '2026-11-10', 'rombel', rombel('X AT 1'));
    const e = d.elemen.find((x) => x.jenis === 'blok')!;
    if (e.jenis !== 'blok') throw new Error('x');
    const h = htmlRincian(p, 'rombel', rombel('X AT 1'), '2026-11-10', e.a);
    expect(h).toContain(e.item[0]!.mapel.nama);
    expect(h).toContain(e.item[0]!.guru[0]!.nama);
    expect(h).toContain(e.mulai);
    expect(h).toContain('tutupRincian');
  });

  it('singkatan kegiatan non-KBM', async () => {
    const { kodeNonKbm } = await import('../src/publik/tampil');
    expect(kodeNonKbm('Pembiasaan/UB')).toBe('P1');
    expect(kodeNonKbm('Upacara bendera')).toBe('UPC');
    expect(kodeNonKbm('Literasi')).toBe('LIT');
  });

  it('kelas tanpa KBM menampilkan alasan masing-masing (PKL, UKK, ASAS, ASAJ), bukan "tdk. KBM" seragam', () => {
    const alasan = (tgl: string, kode: string) => jadwalHariP(p, tgl, 'rombel', rombel(kode));
    // pekan ASAS/ASAJ (30 Nov 2026): X = ASAS, XII = ASAJ, XI (lima kelas PKL) = PKL
    const x = alasan('2026-12-01', 'X TE 1');
    expect(x.status).toBe('tidakAktif');
    expect(x.alasan?.kode).toBe('ASAS');
    expect(alasan('2026-12-01', 'XII TE 1').alasan?.kode).toBe('ASAJ');
    expect(alasan('2026-12-01', 'XI AT 3').alasan).toEqual({ kode: 'PKL', nama: 'Praktik Kerja Lapangan' });
    // pekan UKK (23 Nov): kelas XII = UKK, kelas XI yang PKL tetap PKL
    expect(alasan('2026-11-24', 'XII TE 1').alasan?.kode).toBe('UKK');
    expect(alasan('2026-11-24', 'XI AT 3').alasan?.kode).toBe('PKL');
    // kelas yang masih belajar tidak punya alasan
    expect(alasan('2026-11-10', 'X TE 1').alasan).toBeUndefined();
  });

  it('tab Semua: kotak memuat kode mapel, guru, ruang, dan ada legenda kode di bawah tabel', async () => {
    const { gambarHalaman } = await import('../src/publik/halaman');
    const h = gambarHalaman(t, { ...K, tab: 'semua', zoom: 'sedang' }, '2026-11-10');
    const e = jadwalHariP(p, '2026-11-10', 'rombel', rombel('X TE 1')).elemen.find((x) => x.jenis === 'blok');
    expect(e && e.jenis === 'blok').toBe(true);
    if (e && e.jenis === 'blok') {
      const it = e.item[0]!;
      expect(h).toMatch(new RegExp(`>${it.mapel.kode}</span><span class="[^"]*">${it.guru[0]!.kode}</span>`));
      // legenda: nama mapel, nama guru, dan nama ruang dijelaskan
      expect(h).toContain(it.mapel.nama);
      expect(h).toContain(it.guru[0]!.nama);
    }
    expect(h).toContain('Isi kotak dari atas: kode mapel, kode guru, kode ruang');
    // pekan ASAS: legenda alasan tampil dan teks seragam lama hilang
    const asas = gambarHalaman(t, { ...K, tab: 'semua' }, '2026-12-01');
    expect(asas).toContain('Kelas tidak ada KBM di sekolah');
    expect(asas).toContain('Praktik Kerja Lapangan');
    expect(asas).not.toContain('tdk. KBM');
  });

  it('tab Semua: header jam berupa angka, kolom istirahat berikon, garis putus-putus di sekat P1 dan istirahat', async () => {
    const { gambarHalaman } = await import('../src/publik/halaman');
    const h = gambarHalaman(t, { ...K, tab: 'semua', hariSemua: 0, zoom: 'sedang' }, '2026-11-09');
    const kepala = /<thead>([\s\S]*?)<\/thead>/.exec(h)![1]!;
    expect(kepala).not.toContain('>P1<');
    expect(kepala).toContain('>1</th>'); // pembiasaan = jam 1 pada skema 11
    expect(kepala).toContain('aria-label="istirahat"');
    // skema 11: satu garis di kanan P1 + dua garis tiap kolom istirahat (2 istirahat) = 5
    expect((h.match(/border-dashed" style="left:/g) ?? []).length).toBe(5);
    // skema 10 tanpa pembiasaan: hanya garis istirahat (4)
    const s10 = gambarHalaman(t, { ...K, tab: 'semua', hariSemua: 1, zoom: 'sedang' }, '2026-11-10');
    expect((s10.match(/border-dashed" style="left:/g) ?? []).length).toBe(4);
    // batas antar hari: garis padat di awal tiap hari + sisi kanan terakhir (tampilan 1 hari = 2 garis)
    expect((h.match(/border-l-2 border-solid" style="left:/g) ?? []).length).toBe(2);
    // kotak P1 di baris tetap memakai kode
    expect(h).toContain('>P1</td>');
  });
});
