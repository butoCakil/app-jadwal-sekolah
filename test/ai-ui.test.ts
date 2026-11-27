// @vitest-environment node
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { proyekSekolah } from '../src/model/sekolahData';
import { hitungTurunan } from '../src/ui/turunan';
import { klikAi, renderAi } from '../src/ui/ai';
import type { Konteks, StatusUI } from '../src/ui/konteks';
import { bebanInduk } from '../src/model/simpul';

/** Uji alur lengkap tab Asisten AI tanpa peramban: DOM minimal dan fetch palsu menggantikan Google. */
const nilaiForm: Record<string, string> = {};
const tombol = (aksi: string, data: Record<string, string> = {}) => ({ dataset: { aksi, ...data } }) as unknown as HTMLElement;

beforeAll(() => {
  vi.stubGlobal('document', { getElementById: (id: string) => (id in nilaiForm ? { value: nilaiForm[id], focus() {} } : null) });
  vi.stubGlobal('requestAnimationFrame', (f: () => void) => f());
  vi.stubGlobal('confirm', () => true);
});
afterEach(() => vi.restoreAllMocks());

function buatKonteks() {
  const p = proyekSekolah('tahun');
  const ui = { fokus: 'auto', tanggal: '2026-08-24', tab: 'ai' } as unknown as StatusUI;
  const gambar = vi.fn();
  const k = {
    get p() { return p; },
    get turunan() { return hitungTurunan(p, ui.tanggal, ui.fokus); },
    ui,
    ubah(fn: (x: typeof p) => void) { fn(p); },
    ubahSlots() {},
    gambar,
    lapor: vi.fn(),
    ganti() {},
    ke: vi.fn(),
  } as unknown as Konteks;
  return { k, p, gambar };
}
const tunggu = async (kondisi: () => boolean) => {
  for (let i = 0; i < 200 && !kondisi(); i++) await new Promise((r) => setTimeout(r, 10));
  expect(kondisi()).toBe(true);
};
const balasanGemini = (isi: unknown) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(isi) }] } }], usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20 } }), { status: 200 });

describe('tab Asisten AI: alur dari brankas sampai usulan diterapkan', () => {
  it('memuat, membuat brankas, mengirim pesan, menampilkan usulan, dan menerapkannya', async () => {
    const { k, p } = buatKonteks();
    expect(renderAi(k)).toContain('Memuat');
    await tunggu(() => renderAi(k).includes('Siapkan Asisten AI'));
    expect(renderAi(k)).toContain('terenkripsi');

    // PIN tidak sama ditolak, lalu dibuat dengan benar
    Object.assign(nilaiForm, { aiPin: '2468', aiPin2: '1111', aiLabel: 'Uji', aiKunciBaru: 'KUNCI-PALSU-UNTUK-UJI-1234567890' });
    klikAi(k, tombol('aiBuat'));
    await tunggu(() => renderAi(k).includes('Kedua PIN tidak sama'));
    nilaiForm.aiPin2 = '2468';
    klikAi(k, tombol('aiBuat'));
    await tunggu(() => renderAi(k).includes('Percakapan baru'));
    expect(renderAi(k)).toContain('jadwal induk');
    expect(renderAi(k)).not.toContain('KUNCI-PALSU'); // kunci tidak tampil di mana pun pada percakapan

    // kirim pesan; Gemini palsu mengembalikan usulan
    const fetchPalsu = vi.fn(async () => balasanGemini({ jawaban: 'PRE jadi 6 JP.', instruksi: [{ op: 'ubahJp', sasaran: { rombel: ['XII TE 1'], mapel: ['PRE'] }, jp: 6 }] }));
    vi.stubGlobal('fetch', fetchPalsu);
    nilaiForm.aiTeks = 'Jadikan PRE XII TE 1 enam jam';
    klikAi(k, tombol('aiKirim'));
    await tunggu(() => renderAi(k).includes('Usulan perubahan'));
    const html = renderAi(k);
    expect(html).toContain('XII TE 1 · PRE (BEN): 4 → 6 JP');
    expect(html).toContain('data-aksi="aiTerapkan"');
    expect(fetchPalsu).toHaveBeenCalledTimes(1);
    const [url, init] = fetchPalsu.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('generativelanguage.googleapis.com');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('KUNCI-PALSU-UNTUK-UJI-1234567890');
    expect(String(init.body)).not.toMatch(/Benny|Surahman/); // tidak ada nama lengkap
    const pre = () => bebanInduk(p).find((b) => b.mapelId === p.master.mapel.find((m) => m.kode === 'PRE')?.id && b.rombelId === p.master.rombel.find((r) => r.kode === 'XII TE 1')?.id);
    expect(pre()?.jp).toBe(4); // belum diterapkan

    // terapkan
    const idGiliran = /data-aksi="aiTerapkan" data-id="(\d+)"/.exec(html)?.[1] as string;
    klikAi(k, tombol('aiTerapkan', { id: idGiliran }));
    expect(pre()?.jp).toBe(6);
    expect(renderAi(k)).toContain('Sudah diterapkan');
    expect(renderAi(k)).not.toContain('data-aksi="aiTerapkan"');

    // pesan berikutnya membawa catatan keputusan admin
    fetchPalsu.mockImplementationOnce(async () => balasanGemini({ jawaban: 'Baik.', instruksi: [] }));
    nilaiForm.aiTeks = 'terima kasih';
    klikAi(k, tombol('aiKirim'));
    await tunggu(() => fetchPalsu.mock.calls.length === 2);
    const badan = JSON.parse(String((fetchPalsu.mock.calls[1] as unknown as [string, RequestInit])[1].body));
    const terakhir = badan.contents.at(-1).parts[0].text as string;
    expect(terakhir).toContain('Admin MENERAPKAN usulan Anda');
    expect(badan.contents.length).toBe(3);
  }, 30000);

  it('kunci ditolak Google: dilaporkan jelas dan kunci ditandai tidak sah', async () => {
    const { k } = buatKonteks();
    klikAi(k, tombol('aiBaru'));
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { message: 'API key not valid. Please pass a valid API key.' } }), { status: 400 })));
    nilaiForm.aiTeks = 'halo';
    klikAi(k, tombol('aiKirim'));
    await tunggu(() => /Belum ada kunci API Gemini yang aktif/.test(renderAi(k)));
    klikAi(k, tombol('aiSub', { sub: 'pengaturan' }));
    expect(renderAi(k)).toContain('ditolak Google');
  }, 30000);
});
