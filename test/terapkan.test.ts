// @vitest-environment node
import 'fake-indexeddb/auto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { proyekSekolah } from '../src/model/sekolahData';
import { bukaBrankas, kunciBrankas } from '../src/ai/brankas';
import { dariBase64Utf8, keBase64Utf8, shaBlobGit, terapkanKeRepo, TARGET_BAWAAN } from '../src/terbit/github';
import { periksaSemuaPekan } from '../src/terbit/gerbang';
import { bacaTerbit, periksaPrivasi } from '../src/terbit/format';
import { hitungTurunan } from '../src/ui/turunan';
import { klikTerapkan, renderTerapkan, ubahTerapkan } from '../src/ui/terapkan';
import { brankasSesi } from '../src/ui/brankasSesi';
import type { Konteks, StatusUI } from '../src/ui/konteks';

const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status });

describe('GitHub: menyimpan berkas terbit', () => {
  it('base64 UTF-8 bolak-balik dan SHA blob git sesuai nilai yang dikenal git', async () => {
    const teks = 'Jadwal é ñ 日本 😀 — ok';
    expect(dariBase64Utf8(keBase64Utf8(teks))).toBe(teks);
    expect(dariBase64Utf8(keBase64Utf8(teks).replace(/(.{10})/g, '$1\n'))).toBe(teks);
    // `printf 'hello world' | git hash-object --stdin`
    expect(await shaBlobGit('hello world')).toBe('95d09f2b10159347eece71399a7e2e907ea3df4f');
    // berkas besar (di atas 32 KB) tidak merusak base64
    const besar = 'a'.repeat(200_000);
    expect(dariBase64Utf8(keBase64Utf8(besar))).toBe(besar);
  });

  it('berkas belum ada: membuat (tanpa sha), memakai token Bearer, cabang, dan isi base64', async () => {
    const panggilan: { url: string; init?: RequestInit }[] = [];
    const ambil = (async (url: string, init?: RequestInit) => {
      panggilan.push({ url, init });
      if (!init?.method) return json({ message: 'Not Found' }, 404);
      return json({ commit: { sha: 'abc123', html_url: 'https://github.com/x/y/commit/abc123' } }, 201);
    }) as unknown as typeof fetch;
    const h = await terapkanKeRepo({ token: 'TOKEN-UJI', isi: '{"a":"é"}', pesan: 'Terapkan jadwal' }, ambil);
    expect(h).toEqual({ ok: true, status: 'dibuat', urlCommit: 'https://github.com/x/y/commit/abc123', shaCommit: 'abc123' });
    expect(panggilan[0]!.url).toBe(`https://api.github.com/repos/${TARGET_BAWAAN.pemilik}/${TARGET_BAWAAN.repo}/contents/data/terbit/jadwal.json?ref=main`);
    expect((panggilan[0]!.init!.headers as Record<string, string>).Authorization).toBe('Bearer TOKEN-UJI');
    const tulis = panggilan[1]!;
    expect(tulis.init!.method).toBe('PUT');
    const badan = JSON.parse(String(tulis.init!.body)) as Record<string, unknown>;
    expect(badan.sha).toBeUndefined();
    expect(badan.branch).toBe('main');
    expect(badan.message).toBe('Terapkan jadwal');
    expect(dariBase64Utf8(badan.content as string)).toBe('{"a":"é"}');
  });

  it('berkas sudah ada: memperbarui dengan sha lama; isi sama (sha atau pembanding) tidak membuat commit', async () => {
    const isi = '{"b":2}';
    const sha = await shaBlobGit(isi);
    let tulisan = 0;
    const ambil = (shaServer: string, content?: string) => (async (_u: string, init?: RequestInit) => {
      if (!init?.method) return json({ sha: shaServer, encoding: 'base64', ...(content ? { content } : {}) });
      tulisan++;
      expect(JSON.parse(String(init.body)).sha).toBe(shaServer);
      return json({ commit: { sha: 'k1' } }, 200);
    }) as unknown as typeof fetch;
    // isi byte-per-byte sama -> sha sama
    expect(await terapkanKeRepo({ token: 't', isi, pesan: 'm' }, ambil(sha))).toEqual({ ok: true, status: 'tanpaPerubahan' });
    expect(tulisan).toBe(0);
    // beda isi -> diperbarui dan membawa sha lama
    const h = await terapkanKeRepo({ token: 't', isi, pesan: 'm' }, ambil('sha-lama'));
    expect(h.ok && h.status).toBe('diperbarui');
    expect(tulisan).toBe(1);
    // isi lama dianggap sama oleh pemanggil (mis. beda hanya di waktu penerapan)
    const h2 = await terapkanKeRepo({ token: 't', isi, pesan: 'm', samaDengan: (lama) => lama === '{"b":1}' }, ambil('sha-lama', keBase64Utf8('{"b":1}')));
    expect(h2).toEqual({ ok: true, status: 'tanpaPerubahan' });
    expect(tulisan).toBe(1);
  });

  it('galat dipetakan ke pesan yang jelas dan tidak membocorkan token', async () => {
    const jawab = (statusBaca: number, statusTulis: number | null, pesan = '') => (async (_u: string, init?: RequestInit) => {
      if (!init?.method) return json({ message: pesan }, statusBaca);
      return json({ message: pesan }, statusTulis ?? 500);
    }) as unknown as typeof fetch;
    const kode = async (ambil: typeof fetch) => {
      const h = await terapkanKeRepo({ token: 'RAHASIA-123', isi: 'x', pesan: 'm' }, ambil);
      expect(JSON.stringify(h)).not.toContain('RAHASIA-123');
      return h.ok ? 'ok' : h.kode;
    };
    expect(await kode(jawab(401, null))).toBe('token');
    expect(await kode(jawab(403, null, 'Resource not accessible by personal access token'))).toBe('izin');
    expect(await kode(jawab(403, null, 'API rate limit exceeded'))).toBe('batas');
    expect(await kode(jawab(404, 404))).toBe('tidakAda'); // berkas belum ada lalu PUT 404 = repo/akses
    expect(await kode(jawab(200, 409))).toBe('bentrok');
    expect(await kode(jawab(200, 422))).toBe('bentrok');
    expect(await kode(jawab(500, null))).toBe('lain');
    expect(await kode((async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch)).toBe('jaringan');
    const kosong = await terapkanKeRepo({ token: '  ', isi: 'x', pesan: 'm' }, (async () => json({})) as unknown as typeof fetch);
    expect(kosong.ok).toBe(false);
  });
});

describe('brankas: token ikut terenkripsi', () => {
  it('token bolak-balik, brankas lama tanpa token tetap terbuka, PIN salah ditolak', async () => {
    const b = await kunciBrankas('2468', { kunci: [], token: 'github_pat_UJI' }, 1000);
    expect(JSON.stringify(b)).not.toContain('github_pat_UJI');
    expect((await bukaBrankas('2468', b)).token).toBe('github_pat_UJI');
    await expect(bukaBrankas('0000', b)).rejects.toThrow(/PIN salah/);
    const lama = await kunciBrankas('2468', { kunci: [{ id: 'k1', label: 'a', nilai: 'x'.repeat(30), aktif: true }] }, 1000);
    const isi = await bukaBrankas('2468', lama);
    expect(isi.token).toBeUndefined();
    expect(isi.kunci).toHaveLength(1);
  });
});

describe('gerbang: pemeriksaan semua pekan', () => {
  it('menemukan pelanggaran sumber di pekan lampau, tetapi pekan yang akan datang bersih', () => {
    const p = proyekSekolah('tahun');
    const semua = periksaSemuaPekan(p);
    expect(semua.pekanDiperiksa).toBeGreaterThan(40);
    expect(semua.total).toBeGreaterThan(0);
    expect(semua.masalah[0]!.contoh.length).toBeGreaterThan(0);
    const mendatang = periksaSemuaPekan(p, '2026-11-23');
    expect(mendatang.pekanDiperiksa).toBeLessThan(semua.pekanDiperiksa);
    expect(mendatang.total).toBe(0);
    expect(periksaSemuaPekan(p, '2099-01-01').pekanDiperiksa).toBe(0);
  });

  it('pelanggaran yang diterima tidak memblokir', () => {
    const p = proyekSekolah('tahun');
    const sebelum = periksaSemuaPekan(p);
    const pesan = hitungTurunan(p, sebelum.masalah[0]!.senin, 'auto').masalah.filter((m) => !m.diterima && /mengajar ganda|terlarang/.test(m.pesan)).map((m) => m.pesan);
    p.diterima = [...(p.diterima ?? []), ...pesan.map((x) => ({ pesan: x, catatan: 'uji' }))];
    expect(periksaSemuaPekan(p).total).toBeLessThan(sebelum.total);
  });
});

describe('tab Terapkan: alur dari membuat brankas sampai tersimpan ke repo', () => {
  const nilaiForm: Record<string, string> = {};
  const tombol = (aksi: string) => ({ dataset: { aksi } }) as unknown as HTMLElement;
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-29T00:00:00+07:00'));
    vi.stubGlobal('document', { getElementById: (id: string) => (id in nilaiForm ? { value: nilaiForm[id] } : null) });
  });
  afterAll(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  const tunggu = async (kondisi: () => boolean) => {
    for (let i = 0; i < 300 && !kondisi(); i++) await new Promise((r) => setTimeout(r, 10));
    expect(kondisi()).toBe(true);
  };

  it('PIN dan token, gerbang, penyimpanan, dan token tidak pernah tampil utuh', async () => {
    const p = proyekSekolah('tahun');
    const ui = { fokus: 'auto', tanggal: '2026-11-30', tab: 'terapkan' } as unknown as StatusUI;
    const k = { get p() { return p; }, get turunan() { return hitungTurunan(p, ui.tanggal, ui.fokus); }, ui, gambar: vi.fn(), lapor: vi.fn(), ke: vi.fn(), ubah() {}, ubahSlots() {}, ganti() {} } as unknown as Konteks;
    const TOKEN = 'github_pat_RAHASIA_UJI_1234567890';

    const permintaan: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      permintaan.push({ url, init });
      if (url.startsWith('./terbit/')) return json({}, 404);
      if (!init?.method) return json({ message: 'Not Found' }, 404);
      return json({ commit: { sha: 'k1', html_url: 'https://github.com/butoCakil/app-jadwal-sekolah/commit/k1' } }, 201);
    });

    await tunggu(() => renderTerapkan(k).includes('Siapkan akses ke repo'));
    let html = renderTerapkan(k);
    expect(html).toContain('Contents: Read and write');
    expect(html).toContain('Tidak ada bentrok'); // pekan mendatang bersih
    expect(html).toMatch(/data-aksi="tpTerapkan"[^>]*disabled/); // belum ada token

    // PIN tidak sama / token tidak sah ditolak
    Object.assign(nilaiForm, { tpPin: '2468', tpPin2: '1111', tpToken: TOKEN });
    klikTerapkan(k, tombol('tpBuat'));
    await tunggu(() => renderTerapkan(k).includes('Kedua PIN tidak sama'));
    Object.assign(nilaiForm, { tpPin2: '2468', tpToken: 'pendek' });
    klikTerapkan(k, tombol('tpBuat'));
    await tunggu(() => renderTerapkan(k).includes('tidak sah'));
    Object.assign(nilaiForm, { tpToken: TOKEN });
    klikTerapkan(k, tombol('tpBuat'));
    await tunggu(() => renderTerapkan(k).includes('Brankas terbuka'));
    html = renderTerapkan(k);
    expect(html).not.toContain(TOKEN); // hanya bentuk tersamar
    expect(html).toContain('gith…7890');
    expect(brankasSesi.token).toBe(TOKEN);
    expect(html).not.toMatch(/data-aksi="tpTerapkan"[^>]*disabled/);

    // terapkan
    nilaiForm.tpCatatan = 'uji';
    klikTerapkan(k, tombol('tpTerapkan'));
    await tunggu(() => renderTerapkan(k).includes('Berkas terbit dibuat'));
    const tulis = permintaan.find((x) => x.init?.method === 'PUT')!;
    expect((tulis.init!.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
    const badan = JSON.parse(String(tulis.init!.body)) as { message: string; content: string; branch: string };
    expect(badan.branch).toBe('main');
    expect(badan.message).toMatch(/^Terapkan jadwal \(/);
    const isi = dariBase64Utf8(badan.content);
    expect(bacaTerbit(isi).ok).toBe(true);
    expect(periksaPrivasi(JSON.parse(isi))).toEqual([]);
    expect(isi).not.toContain(TOKEN);
    expect(renderTerapkan(k)).toContain('github.com/butoCakil/app-jadwal-sekolah/commit/k1');
    expect(renderTerapkan(k)).not.toContain(TOKEN);

    // kunci brankas: token dibuang dari memori; tombol Terapkan nonaktif lagi
    klikTerapkan(k, tombol('tpKunci'));
    expect(brankasSesi.token).toBe('');
    expect(renderTerapkan(k)).toContain('Buka brankas');
    // pemeriksa pekan lampau dapat dinyalakan dan memunculkan pelanggaran yang memblokir
    ubahTerapkan(k, { id: 'tpSemua', checked: true } as unknown as HTMLInputElement);
    expect(renderTerapkan(k)).toContain('belum diputuskan');
  });
});
