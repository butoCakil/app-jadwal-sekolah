import { describe, expect, it } from 'vitest';
import { klienGemini, pilahGalat, uraiKuota, type HasilPanggilAi, type KlienAi, type PermintaanAi } from '../src/ai/klien';
import { PengaturRotasi, resetKuotaBerikut, statusKosong, tanggalKuota, type KunciAi, type PengaturanAi, type StatusRotasi } from '../src/ai/rotasi';

const REQ: PermintaanAi = { sistem: 'aturan', pesan: [{ peran: 'user', teks: 'halo' }] };
const kunci = (...id: string[]): KunciAi[] => id.map((x) => ({ id: x, label: `Kunci ${x}`, nilai: `rahasia-${x}`, aktif: true }));
const png = (model: string, cadangan: string[], rpm = 15, rpd = 500): PengaturanAi => ({ model, cadangan, rpm, rpd });
const ok = (teks = '{}'): HasilPanggilAi => ({ ok: true, teks, token: { masuk: 10, keluar: 5 } });
const gagal = (jenis: 'menit' | 'harian' | 'kunci' | 'sibuk' | 'model' | 'lain', status: number, extra: Partial<Extract<HasilPanggilAi, { ok: false }>> = {}): HasilPanggilAi => ({ ok: false, jenis, status, pesan: `galat ${status}`, ...extra });

/** Klien palsu: skrip jawaban per pasangan `rahasia|model`, atau fungsi; mencatat urutan panggilan. */
function klienPalsu(skrip: (kunci: string, model: string, n: number) => HasilPanggilAi) {
  const panggilan: string[] = [];
  const hitung = new Map<string, number>();
  const klien: KlienAi = {
    async hasilkan(k, m) {
      const key = `${k.replace('rahasia-', '')}|${m}`;
      panggilan.push(key);
      const n = (hitung.get(key) ?? 0) + 1;
      hitung.set(key, n);
      return skrip(k.replace('rahasia-', ''), m, n);
    },
    async daftarModel() {
      return { ok: true, model: [] };
    },
  };
  return { klien, panggilan };
}

function dasar(opts: { skrip: Parameters<typeof klienPalsu>[0]; kunci?: KunciAi[]; png?: PengaturanAi; tungguMaksMs?: number }) {
  const { klien, panggilan } = klienPalsu(opts.skrip);
  let kini = Date.UTC(2026, 10, 27, 12, 0, 0);
  const tidurLog: number[] = [];
  const disimpan: StatusRotasi[] = [];
  const r = new PengaturRotasi({
    pengaturan: () => opts.png ?? png('A', ['B']),
    kunci: () => opts.kunci ?? kunci('1', '2'),
    klien,
    kini: () => kini,
    tidur: async (ms) => {
      tidurLog.push(ms);
      kini += ms;
    },
    penyimpan: { baca: () => null, tulis: (s) => void disimpan.push(structuredClone(s)) },
    ...(opts.tungguMaksMs !== undefined ? { tungguMaksMs: opts.tungguMaksMs } : {}),
  });
  return { r, panggilan, tidurLog, disimpan, maju: (ms: number) => void (kini += ms), sekarang: () => kini };
}

describe('AI: rotasi kunci × model', () => {
  it('model utama dicoba di semua kunci dulu; jatah harian habis memindahkan ke kunci berikutnya, bukan ke model lain', async () => {
    const { r, panggilan } = dasar({ skrip: (k, m) => (k === '1' && m === 'A' ? gagal('harian', 429) : ok()) });
    const h1 = await r.panggil(REQ);
    expect(h1.ok && h1.kunciLabel).toBe('Kunci 2');
    expect(panggilan).toEqual(['1|A', '2|A']);
    const h2 = await r.panggil(REQ);
    expect(h2.ok && h2.model).toBe('A');
    expect(panggilan.slice(2)).toEqual(['2|A']); // kunci 1 sudah ditandai habis untuk model A
  });

  it('setelah model utama habis di semua kunci, turun ke model cadangan', async () => {
    const { r, panggilan } = dasar({ skrip: (_k, m) => (m === 'A' ? gagal('harian', 429) : ok()) });
    const h = await r.panggil(REQ);
    expect(h.ok && h.model).toBe('B');
    expect(panggilan).toEqual(['1|A', '2|A', '1|B']);
  });

  it('batas per menit dari Google: menunggu sesuai saran lalu mengulang bila singkat', async () => {
    const d = dasar({ kunci: kunci('1'), png: png('A', []), skrip: (_k, _m, n) => (n === 1 ? gagal('menit', 429, { tungguDetik: 7, batas: [{ jenis: 'rpm', nilai: 5 }] }) : ok()) });
    const h = await d.r.panggil(REQ);
    expect(h.ok).toBe(true);
    expect(d.tidurLog).toEqual([7250]);
    expect(d.panggilan).toEqual(['1|A', '1|A']);
  });

  it('jeda per menit yang terlalu lama tidak ditunggu: dilaporkan', async () => {
    const d = dasar({ kunci: kunci('1'), png: png('A', []), tungguMaksMs: 5000, skrip: () => gagal('menit', 429, { tungguDetik: 40 }) });
    const h = await d.r.panggil(REQ);
    expect(h.ok).toBe(false);
    expect(!h.ok && h.alasan).toBe('menit');
    expect(d.tidurLog).toEqual([]);
  });

  it('kunci yang tidak sah dinonaktifkan dan dilewati seterusnya', async () => {
    const d = dasar({ skrip: (k) => (k === '1' ? gagal('kunci', 400) : ok()) });
    const h = await d.r.panggil(REQ);
    expect(h.ok && h.kunciLabel).toBe('Kunci 2');
    expect(Object.keys(d.r.status.tidakSah)).toEqual(['1']);
    await d.r.panggil(REQ);
    expect(d.panggilan.filter((x) => x.startsWith('1|')).length).toBe(1);
  });

  it('model tidak tersedia (404) dilewati untuk kunci itu', async () => {
    const d = dasar({ kunci: kunci('1'), skrip: (_k, m) => (m === 'A' ? gagal('model', 404) : ok()) });
    const h = await d.r.panggil(REQ);
    expect(h.ok && h.model).toBe('B');
    await d.r.panggil(REQ);
    expect(d.panggilan).toEqual(['1|A', '1|B', '1|B']);
  });

  it('galat permintaan (400 lain) tidak diulang di kunci lain', async () => {
    const d = dasar({ skrip: () => gagal('lain', 400) });
    const h = await d.r.panggil(REQ);
    expect(h.ok).toBe(false);
    expect(!h.ok && h.alasan).toBe('galat');
    expect(d.panggilan.length).toBe(1);
  });

  it('batas harian lokal (rpd) menggeser ke model cadangan tanpa memanggil Google', async () => {
    const d = dasar({ kunci: kunci('1'), png: png('A', ['B'], 15, 2), skrip: () => ok() });
    await d.r.panggil(REQ);
    d.maju(61_000);
    await d.r.panggil(REQ);
    d.maju(61_000);
    const h = await d.r.panggil(REQ);
    expect(h.ok && h.model).toBe('B');
    expect(d.panggilan).toEqual(['1|A', '1|A', '1|B']);
  });

  it('batas per menit lokal (rpm) menunggu jendela semenit lalu lanjut', async () => {
    const d = dasar({ kunci: kunci('1'), png: png('A', [], 2, 500), tungguMaksMs: 70_000, skrip: () => ok() });
    await d.r.panggil(REQ);
    await d.r.panggil(REQ);
    const h = await d.r.panggil(REQ);
    expect(h.ok).toBe(true);
    expect(d.tidurLog.length).toBe(1);
    expect(d.tidurLog[0]).toBeGreaterThan(50_000);
  });

  it('tanpa kunci aktif dilaporkan jelas; status tersimpan dan dapat dimuat lagi', async () => {
    const d = dasar({ kunci: [], skrip: () => ok() });
    const h = await d.r.panggil(REQ);
    expect(!h.ok && h.alasan).toBe('tanpa_kunci');
    const e = dasar({ skrip: (k, m) => (k === '1' && m === 'A' ? gagal('harian', 429) : ok()) });
    await e.r.panggil(REQ);
    expect(e.disimpan.length).toBeGreaterThan(0);
    const simpanan = e.disimpan.at(-1) as StatusRotasi;
    const { klien, panggilan } = klienPalsu(() => ok());
    const baru = new PengaturRotasi({ pengaturan: () => png('A', ['B']), kunci: () => kunci('1', '2'), klien, kini: () => e.sekarang(), penyimpan: { baca: () => simpanan, tulis: () => undefined } });
    await baru.panggil(REQ);
    expect(panggilan).toEqual(['2|A']); // ingatan "kunci 1 habis untuk A" ikut terbawa
  });

  it('ringkasan pemakaian per kunci × model', async () => {
    const d = dasar({ skrip: () => ok() });
    await d.r.panggil(REQ);
    const baris = d.r.ringkas().find((x) => x.kunciId === '1' && x.model === 'A');
    expect(baris).toMatchObject({ permintaanHariIni: 1, semenitTerakhir: 1, habis: false });
    expect(statusKosong().tidakSah).toEqual({});
  });
});

describe('AI: klien Gemini', () => {
  const respons = (status: number, badan: unknown) => new Response(typeof badan === 'string' ? badan : JSON.stringify(badan), { status });

  it('mengirim instruksi sistem, riwayat, kunci di header, dan keluaran JSON', async () => {
    let diminta: { url: string; init: RequestInit } | undefined;
    const k = klienGemini(async (url, init) => {
      diminta = { url, init: init as RequestInit };
      return respons(200, { candidates: [{ content: { parts: [{ text: '{"jawaban":"ok"}' }] } }], usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 4 } });
    });
    const h = await k.hasilkan('KUNCI', 'gemini-x', { sistem: 'aturan', pesan: [{ peran: 'user', teks: 'a' }, { peran: 'model', teks: 'b' }, { peran: 'user', teks: 'c' }] });
    expect(h).toEqual({ ok: true, teks: '{"jawaban":"ok"}', token: { masuk: 12, keluar: 4 } });
    expect(diminta?.url).toContain('/models/gemini-x:generateContent');
    expect((diminta?.init.headers as Record<string, string>)['x-goog-api-key']).toBe('KUNCI');
    const badan = JSON.parse(diminta?.init.body as string);
    expect(badan.systemInstruction.parts[0].text).toBe('aturan');
    expect(badan.contents.map((c: { role: string }) => c.role)).toEqual(['user', 'model', 'user']);
    expect(badan.generationConfig.responseMimeType).toBe('application/json');
  });

  it('memilah galat: harian, per menit (dengan saran tunggu dan batas), kunci, model, sibuk, jaringan', async () => {
    const harian = { error: { message: 'quota', details: [{ violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier', quotaValue: '500' }] }] } };
    const menit = { error: { message: 'quota', details: [{ violations: [{ quotaId: 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier', quotaValue: '15' }] }, { retryDelay: '23s' }] } };
    const cek = async (status: number, badan: unknown) => klienGemini(async () => respons(status, badan)).hasilkan('k', 'm', REQ);
    expect(await cek(429, harian)).toMatchObject({ ok: false, jenis: 'harian', batas: [{ jenis: 'rpd', nilai: 500 }] });
    expect(await cek(429, menit)).toMatchObject({ ok: false, jenis: 'menit', tungguDetik: 23, batas: [{ jenis: 'rpm', nilai: 15 }] });
    expect(await cek(400, { error: { message: 'API key not valid' } })).toMatchObject({ jenis: 'kunci' });
    expect(await cek(403, { error: { message: 'free tier is not available' } })).toMatchObject({ jenis: 'kunci', pesan: expect.stringContaining('Gmail pribadi') });
    expect(await cek(404, { error: { message: 'no model' } })).toMatchObject({ jenis: 'model' });
    expect(await cek(503, 'x')).toMatchObject({ jenis: 'sibuk' });
    const putus = await klienGemini(async () => { throw new Error('Failed to fetch'); }).hasilkan('k', 'm', REQ);
    expect(putus).toMatchObject({ ok: false, jenis: 'sibuk', status: 0 });
    expect(pilahGalat(429, 'per day')).toBe('harian');
    expect(uraiKuota('bukan json')).toEqual({ batas: [] });
  });

  it('daftar model hanya yang mendukung generateContent', async () => {
    const k = klienGemini(async () => respons(200, { models: [{ name: 'models/a', supportedGenerationMethods: ['generateContent'] }, { name: 'models/b', supportedGenerationMethods: ['embedContent'] }] }));
    expect(await k.daftarModel('k')).toEqual({ ok: true, model: ['a'] });
  });

  it('tanggal kuota mengikuti waktu Pasifik dan reset berikutnya dalam 24 jam', () => {
    const d = new Date(Date.UTC(2026, 10, 27, 3, 0, 0)); // 27 Nov 03:00 UTC = 26 Nov 19:00 Pasifik
    expect(tanggalKuota(d)).toBe('2026-11-26');
    const s = resetKuotaBerikut(d) - d.getTime();
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThanOrEqual(24 * 3600 * 1000 + 60_000);
  });
});
