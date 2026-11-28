// @vitest-environment node
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { proyekSekolah } from '../src/model/sekolahData';
import { hitungTurunan } from '../src/ui/turunan';
import { klikAi, renderAi, ubahAi } from '../src/ui/ai';
import type { Konteks, StatusUI } from '../src/ui/konteks';
import { bebanInduk } from '../src/model/simpul';

/** Uji alur lengkap jendela Asisten AI tanpa peramban: DOM minimal dan fetch palsu menggantikan Google. */
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
  const ui = { fokus: 'auto', tanggal: '2026-08-24', tab: 'langsung' } as unknown as StatusUI;
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
    urungkan: vi.fn(),
    terapkanSlotsDi: vi.fn(() => ({ ok: true, baruTerdampak: [] })),
  } as unknown as Konteks;
  return { k, p, gambar };
}
const tunggu = async (kondisi: () => boolean) => {
  for (let i = 0; i < 800 && !kondisi(); i++) await new Promise((r) => setTimeout(r, 10));
  expect(kondisi()).toBe(true);
};
const balasanGemini = (isi: unknown) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(isi) }] } }], usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20 } }), { status: 200 });

describe('jendela Asisten AI: alur dari brankas sampai usulan diterapkan', () => {
  it('memuat, membuat brankas, mengirim pesan, menampilkan usulan, dan menerapkannya', async () => {
    const { k, p } = buatKonteks();
    expect(renderAi(k)).toContain('Memuat');
    await tunggu(() => renderAi(k).includes('Siapkan Asisten Jadwal'));
    expect(renderAi(k)).toContain('terenkripsi');

    // PIN tidak sama ditolak, lalu dibuat dengan benar
    Object.assign(nilaiForm, { aiPin: '2468', aiPin2: '1111', aiLabel: 'Uji', aiKunciBaru: 'KUNCI-PALSU-UNTUK-UJI-1234567890' });
    klikAi(k, tombol('aiBuat'));
    await tunggu(() => renderAi(k).includes('Kedua PIN tidak sama'));
    nilaiForm.aiPin2 = '2468';
    klikAi(k, tombol('aiBuat'));
    await tunggu(() => renderAi(k).includes('Apa yang ingin Anda ketahui'));
    expect(renderAi(k)).toContain('jadwal induk');
    expect(renderAi(k)).not.toContain('KUNCI-PALSU'); // kunci tidak tampil di mana pun pada percakapan

    // kirim pesan; Gemini palsu mengembalikan usulan
    const fetchPalsu = vi.fn(async () => balasanGemini({ jawaban: 'PRE jadi 6 JP.', instruksi: [{ op: 'ubahJp', sasaran: { rombel: ['XII TE 1'], mapel: ['PRE'] }, jp: 6 }] }));
    vi.stubGlobal('fetch', fetchPalsu);
    nilaiForm.aiTeks = 'Jadikan PRE XII TE 1 enam jam';
    klikAi(k, tombol('aiKirim'));
    await tunggu(() => renderAi(k).includes('Usulan perubahan'));
    const html = renderAi(k);
    expect(html).toContain('XII TE 1 · PRE (BEN): 4 <span');
    expect(html).toContain('</span> 6 JP');
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
    expect(renderAi(k)).toContain('✓ Diterapkan');
    expect(renderAi(k)).not.toContain('data-aksi="aiTerapkan"');

    // pesan berikutnya membawa catatan keputusan admin
    fetchPalsu.mockImplementationOnce(async () => balasanGemini({ jawaban: 'Baik.', instruksi: [] }));
    nilaiForm.aiTeks = 'terima kasih';
    klikAi(k, tombol('aiKirim'));
    await tunggu(() => fetchPalsu.mock.calls.length === 2);
    await tunggu(() => renderAi(k).includes('Baik.') && !renderAi(k).includes('sedang menyusun'));
    const badan = JSON.parse(String((fetchPalsu.mock.calls[1] as unknown as [string, RequestInit])[1].body));
    const terakhir = badan.contents.at(-1).parts[0].text as string;
    expect(terakhir).toContain('Admin MENERAPKAN usulan Anda');
    expect(badan.contents.length).toBe(3);

    // kalender: data kegiatan ikut terkirim, usulan geser tampil dengan tanggal berhari, dan diterapkan ke kalender
    const kegUkk = () => p.kalender.find((x) => x.id === 'k-ukk');
    fetchPalsu.mockImplementationOnce(async () => balasanGemini({ jawaban: 'UKK digeser satu pekan.', instruksi: [{ op: 'geserKegiatan', kegiatan: 'k-ukk', hari: 7 }] }));
    nilaiForm.aiTeks = 'UKK diundur 1 minggu';
    klikAi(k, tombol('aiKirim'));
    await tunggu(() => renderAi(k).includes('Sen 2026-11-30 – Jum 2026-12-04'));
    const badan3 = JSON.parse(String((fetchPalsu.mock.calls[2] as unknown as [string, RequestInit])[1].body));
    const data3 = badan3.contents.at(-1).parts[0].text as string;
    expect(data3).toContain('k-ukk | Sen 2026-11-23 – Jum 2026-11-27 | kegiatan:UKK');
    expect(data3).toMatch(/Hari ini: \w{3} \d{4}-\d{2}-\d{2}\./);
    expect(kegUkk()?.mulai).toBe('2026-11-23');
    const idGeser = /data-aksi="aiTerapkan" data-id="(\d+)"/.exec(renderAi(k))?.[1] as string;
    klikAi(k, tombol('aiTerapkan', { id: idGeser }));
    expect(kegUkk()).toMatchObject({ mulai: '2026-11-30', selesai: '2026-12-04' });
  }, 30000);

  it('kunci ditolak Google: dilaporkan jelas dan kunci ditandai tidak sah', async () => {
    const { k } = buatKonteks();
    klikAi(k, tombol('aiBaru'));
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { message: 'API key not valid. Please pass a valid API key.' } }), { status: 400 })));
    nilaiForm.aiTeks = 'halo';
    klikAi(k, tombol('aiKirim'));
    await tunggu(() => /Belum ada kunci API Gemini yang aktif/.test(renderAi(k)));
    klikAi(k, tombol('aiSub', { sub: 'pengaturan' }));
    expect(renderAi(k)).toContain('tidak sah');
    expect(renderAi(k)).toContain('API key not valid');
  }, 30000);
});

/** Pekerja palsu: meniru solver (kemajuan dengan jadwal sementara, lalu hasil) tanpa menjalankan solver. */
class PekerjaPalsu {
  static skenario: 'selesai' | 'menggantung' = 'selesai';
  static terakhir: PekerjaPalsu | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: ((e: { message: string }) => void) | null = null;
  dihentikan = false;
  pesan: unknown;
  constructor() {
    PekerjaPalsu.terakhir = this;
  }
  postMessage(pesan: unknown): void {
    this.pesan = pesan;
    const slot = (n: number) => ({ id: `s${n}`, bebanId: 'b-palsu', hari: 0, jam: n, ruangId: '' });
    setTimeout(() => !this.dihentikan && this.onmessage?.({ data: { jenis: 'kemajuan', m: { tahap: 'perbaiki', terjadwal: 2, total: 3, biaya: 40, ms: 100, slots: [slot(1), slot(2)] } } }), 20);
    if (PekerjaPalsu.skenario === 'selesai')
      setTimeout(() => !this.dihentikan && this.onmessage?.({ data: { jenis: 'hasil', h: { slots: [slot(1), slot(2), slot(3)], sisa: [], terjadwal: 3, total: 3, biaya: 30, peringatan: [], ms: 500 } } }), 60);
  }
  terminate(): void {
    this.dihentikan = true;
  }
}

describe('jendela Asisten AI: penyusunan di dalam chat', () => {
  const kirimSusun = async (k: Konteks, p: ReturnType<typeof buatKonteks>['p']) => {
    const genap = p.semesters?.[1];
    renderAi(k);
    klikAi(k, tombol('aiResetStatus'));
    await new Promise((r) => setTimeout(r, 50));
    klikAi(k, tombol('aiBaru'));
    ubahAi(k, { id: 'aiSasaran', value: `sem:${genap?.id}` } as never);
    vi.stubGlobal('fetch', vi.fn(async () => balasanGemini({ jawaban: 'Menyusun semester genap.', instruksi: [{ op: 'susun', cara: 'nol' }] })));
    nilaiForm.aiTeks = 'mulai susun jadwal semester genap';
    klikAi(k, tombol('aiKirim'));
    await tunggu(() => renderAi(k).includes('data-aksi="aiTerapkan"'));
    return { genap, id: /data-aksi="aiTerapkan" data-id="(\d+)"/.exec(renderAi(k))?.[1] as string };
  };

  it('berjalan pada semester pilihan chat, tampil di chat, diterapkan tanpa pindah halaman, bisa diurungkan', async () => {
    vi.stubGlobal('Worker', PekerjaPalsu);
    PekerjaPalsu.skenario = 'selesai';
    const { k, p } = buatKonteks();
    const { genap, id } = await kirimSusun(k, p);
    expect(renderAi(k)).toContain('jadwal induk Genap');
    expect(k.ui.fokus).toBe('auto'); // tampilan di belakang tidak berubah
    klikAi(k, tombol('aiTerapkan', { id }));
    expect(renderAi(k)).toContain('Penyusunan otomatis');
    expect(k.ke).not.toHaveBeenCalledWith('susun');
    expect(k.ui.fokus).toBe('auto');
    const pesan = PekerjaPalsu.terakhir?.pesan as { sabarMs?: number; batasMs: number; sertakanSlot?: boolean };
    expect(pesan.sertakanSlot).toBe(true);
    expect(pesan.sabarMs).toBe(15000); // otomatis
    await tunggu(() => renderAi(k).includes('Terapkan jadwal ini'));
    expect(renderAi(k)).toContain('3 dari 3 JP');
    expect(renderAi(k)).toContain('Semua JP tertempatkan');

    klikAi(k, tombol('aiSusunTerapkan', { id }));
    const panggilan = (k.terapkanSlotsDi as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as unknown as [string, string, unknown[]];
    expect(panggilan[0]).toBe(`sem:${genap?.id}`);
    expect(panggilan[2]).toHaveLength(3);
    expect(renderAi(k)).toContain('Jadwal diterapkan');
    expect(renderAi(k)).toContain('data-aksi="aiSusunUrungkan"');
    klikAi(k, tombol('aiSusunUrungkan', { id }));
    expect(k.urungkan).toHaveBeenCalledTimes(1);
    expect(renderAi(k)).toContain('data-aksi="aiSusunTerapkan"'); // bisa diterapkan lagi
  }, 30000);

  it('Hentikan memakai jadwal terbaik sementara; hasil yang usang karena data berubah tidak bisa diterapkan', async () => {
    vi.stubGlobal('Worker', PekerjaPalsu);
    PekerjaPalsu.skenario = 'menggantung';
    const { k, p } = buatKonteks();
    const { id } = await kirimSusun(k, p);
    klikAi(k, tombol('aiTerapkan', { id }));
    await new Promise((r) => setTimeout(r, 120));
    klikAi(k, tombol('aiSusunHenti', { id }));
    expect(PekerjaPalsu.terakhir?.dihentikan).toBe(true);
    const html = renderAi(k);
    expect(html).toContain('2 dari 3 JP');
    expect(html).toContain('dihentikan lebih awal');
    expect(html).toContain('Terapkan jadwal ini');
    // data berubah di luar chat sebelum diterapkan
    p.master.guru[0]!.kode = 'ZZZ';
    expect(renderAi(k)).toContain('tidak cocok');
    expect(renderAi(k)).toMatch(/data-aksi="aiSusunTerapkan"[^>]*disabled/);
    klikAi(k, tombol('aiSusunTerapkan', { id }));
    expect(k.terapkanSlotsDi).not.toHaveBeenCalled();
  }, 30000);

  it('tanpa pekerja latar: kegagalan dilaporkan di chat, bukan diam', async () => {
    vi.stubGlobal('Worker', undefined);
    const { k, p } = buatKonteks();
    const { id } = await kirimSusun(k, p);
    klikAi(k, tombol('aiTerapkan', { id }));
    expect(renderAi(k)).toContain('Pekerja latar tidak bisa dibuat');
  }, 30000);
});
