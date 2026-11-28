/**
 * Klien Gemini (Google AI Studio) yang berjalan di browser admin. Satu permintaan generateContent dengan keluaran JSON; galat
 * dipilah supaya pengatur rotasi tahu harus menunggu (batas per menit), pindah kunci (jatah harian habis), atau menonaktifkan
 * kunci (tidak sah). Dipindahkan dari klien Gemini di superapp-te (modules/ai/gemini.ts) dengan penyesuaian untuk browser.
 */

/**
 * sibuk = model kelebihan beban atau gangguan sementara (500 sampai 504, jaringan putus, batas waktu);
 * model = model tidak tersedia untuk kunci/akun ini (404).
 */
export type GalatAi = 'menit' | 'harian' | 'kunci' | 'sibuk' | 'jaringan' | 'model' | 'lain';

/** Batas kuota yang dilaporkan Google pada balasan 429 (QuotaFailure.violations). */
export interface BatasTerdeteksi {
  /** rpm/rpd = permintaan per menit/hari; tpm/tpd = token masukan per menit/hari. */
  jenis: 'rpm' | 'rpd' | 'tpm' | 'tpd';
  nilai: number | null;
}

export type HasilPanggilAi =
  | { ok: true; teks: string; token: { masuk: number; keluar: number } }
  | { ok: false; jenis: GalatAi; status: number; pesan: string; batas?: BatasTerdeteksi[]; tungguDetik?: number };

/** Satu giliran percakapan. */
export interface PesanAi {
  peran: 'user' | 'model';
  teks: string;
}

export interface PermintaanAi {
  /** Instruksi sistem (aturan, kosakata instruksi, bentuk JSON). */
  sistem: string;
  /** Riwayat percakapan; yang terakhir giliran pengguna. */
  pesan: PesanAi[];
}

export interface KlienAi {
  hasilkan(kunci: string, model: string, req: PermintaanAi): Promise<HasilPanggilAi>;
  /** Model yang mendukung generateContent untuk kunci ini (untuk uji kunci). */
  daftarModel(kunci: string): Promise<{ ok: true; model: string[] } | { ok: false; status: number; pesan: string }>;
}

const DASAR = 'https://generativelanguage.googleapis.com/v1beta';

/** Baca QuotaFailure dan RetryInfo dari badan galat 429 Gemini. */
export function uraiKuota(teks: string): { batas: BatasTerdeteksi[]; tungguDetik?: number } {
  const batas: BatasTerdeteksi[] = [];
  let tunggu: number | undefined;
  try {
    const j = JSON.parse(teks) as { error?: { details?: { violations?: { quotaId?: string; quotaValue?: string | number }[]; retryDelay?: string }[] } };
    for (const d of j.error?.details ?? []) {
      if (d.retryDelay) {
        const n = parseFloat(d.retryDelay);
        if (Number.isFinite(n)) tunggu = Math.ceil(n);
      }
      for (const v of d.violations ?? []) {
        const id = v.quotaId ?? '';
        const token = /Token/i.test(id);
        const hari = /PerDay/i.test(id);
        const menit = /PerMinute/i.test(id);
        if (!hari && !menit) continue;
        const jenis = token ? (hari ? 'tpd' : 'tpm') : hari ? 'rpd' : 'rpm';
        const n = Number(v.quotaValue);
        if (!batas.some((b) => b.jenis === jenis)) batas.push({ jenis, nilai: Number.isFinite(n) && n > 0 ? n : null });
      }
    }
  } catch {
    /* bukan JSON */
  }
  return { batas, ...(tunggu !== undefined ? { tungguDetik: tunggu } : {}) };
}

/** Pilah galat Gemini. 429 dengan kuota per hari = harian; 429 lain = per menit. */
export function pilahGalat(status: number, teks: string): GalatAi {
  if (status === 429) return /PerDay|per day|per_day|daily/i.test(teks) ? 'harian' : 'menit';
  if (status === 401 || status === 403 || /API_KEY_INVALID|API key not valid/i.test(teks)) return 'kunci';
  if (status === 404) return 'model';
  if (status >= 500 && status <= 504) return 'sibuk';
  return 'lain';
}

function pesanGalat(status: number, teks: string): string {
  try {
    const j = JSON.parse(teks) as { error?: { message?: string } };
    if (j.error?.message) {
      const m = j.error.message.slice(0, 300);
      if (status === 403 && /free tier is not available/i.test(m)) return 'Akun ini tidak mendapat tingkat gratis Gemini (biasanya akun Google Workspace/sekolah). Pakai kunci dari akun Gmail pribadi.';
      return m;
    }
  } catch {
    /* bukan JSON */
  }
  return `HTTP ${status}`;
}

type Ambil = (url: string, init?: RequestInit) => Promise<Response>;

/** Klien Gemini sungguhan. `ambil` bisa diganti (tes). */
export function klienGemini(ambil: Ambil = (u, i) => fetch(u, i), suhu = 0.2): KlienAi {
  return {
    async hasilkan(kunci, model, req) {
      try {
        const r = await ambil(`${DASAR}/models/${encodeURIComponent(model)}:generateContent`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': kunci },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: req.sistem }] },
            contents: req.pesan.map((m) => ({ role: m.peran, parts: [{ text: m.teks }] })),
            generationConfig: { temperature: suhu, responseMimeType: 'application/json' },
          }),
          signal: AbortSignal.timeout(90_000),
        });
        const teks = await r.text();
        if (!r.ok) {
          return { ok: false, jenis: pilahGalat(r.status, teks), status: r.status, pesan: pesanGalat(r.status, teks), ...(r.status === 429 ? uraiKuota(teks) : {}) };
        }
        const j = JSON.parse(teks) as { candidates?: { content?: { parts?: { text?: string }[] } }[]; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } };
        const keluar = (j.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
        return { ok: true, teks: keluar, token: { masuk: j.usageMetadata?.promptTokenCount ?? 0, keluar: j.usageMetadata?.candidatesTokenCount ?? 0 } };
      } catch (e) {
        // batas waktu: gangguan sementara seperti 503. Jaringan putus (permintaan tak sampai ke Google): jenis sendiri,
        // bukan salah kunci atau model, sehingga tidak ada yang dijeda.
        const pesan = String((e as Error).message).slice(0, 300);
        const waktuHabis = /abort|timeout|timed out/i.test(pesan);
        return waktuHabis ? { ok: false, jenis: 'sibuk', status: 0, pesan: `Google tidak menjawab dalam batas waktu (${pesan})` } : { ok: false, jenis: 'jaringan', status: 0, pesan };
      }
    },
    async daftarModel(kunci) {
      try {
        const r = await ambil(`${DASAR}/models?pageSize=200`, { headers: { 'x-goog-api-key': kunci }, signal: AbortSignal.timeout(20_000) });
        const teks = await r.text();
        if (!r.ok) return { ok: false, status: r.status, pesan: pesanGalat(r.status, teks) };
        const j = JSON.parse(teks) as { models?: { name?: string; supportedGenerationMethods?: string[] }[] };
        const model = (j.models ?? []).filter((m) => m.supportedGenerationMethods?.includes('generateContent') && m.name).map((m) => (m.name as string).replace(/^models\//, ''));
        return { ok: true, model };
      } catch (e) {
        return { ok: false, status: 0, pesan: String((e as Error).message).slice(0, 300) };
      }
    },
  };
}
