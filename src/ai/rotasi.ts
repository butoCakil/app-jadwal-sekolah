import type { BatasTerdeteksi, KlienAi, PermintaanAi } from './klien';

/**
 * Rotasi kunci × model (meniru superapp-te, modules/ai/layanan.ts): model utama dicoba di SEMUA kunci dulu, baru model cadangan
 * berikutnya, sehingga model terbaik terpakai habis sebelum turun. Batas per menit dan per hari dijaga per kunci × model; batas
 * yang dilaporkan Google (balasan 429) menggantikan batas bawaan. Berjalan di browser admin; kunci diberikan dari brankas.
 */

export interface KunciAi {
  id: string;
  label: string;
  nilai: string;
  aktif: boolean;
}

export interface PengaturanAi {
  /** Model utama. */
  model: string;
  /** Model cadangan berurutan. */
  cadangan: string[];
  /** Batas atas aman per kunci per model (permintaan per menit / per hari). */
  rpm: number;
  rpd: number;
}

/** Model yang direkomendasikan beserta batas tingkat gratis bawaannya (sumber: dasbor Google AI Studio Benny, via superapp-te). */
export const MODEL_REKOMENDASI: readonly { model: string; rpm: number; tpm: number; rpd: number }[] = [
  { model: 'gemini-3.5-flash-lite', rpm: 15, tpm: 250_000, rpd: 500 },
  { model: 'gemini-3.1-flash-lite', rpm: 15, tpm: 250_000, rpd: 500 },
  { model: 'gemini-3.8-flash', rpm: 5, tpm: 250_000, rpd: 20 },
  { model: 'gemini-3.6-flash', rpm: 5, tpm: 250_000, rpd: 20 },
  { model: 'gemini-3-flash', rpm: 5, tpm: 250_000, rpd: 20 },
  { model: 'gemini-2.5-flash', rpm: 5, tpm: 250_000, rpd: 20 },
  { model: 'gemini-2.5-flash-lite', rpm: 5, tpm: 250_000, rpd: 20 },
];

export const PENGATURAN_BAWAAN: PengaturanAi = {
  model: 'gemini-3.5-flash-lite',
  cadangan: MODEL_REKOMENDASI.slice(1).map((x) => x.model),
  rpm: 15,
  rpd: 500,
};

/** Batas bawaan suatu model: model rekomendasi memakai yang lebih kecil antara presetnya dan pengaturan; model lain memakai pengaturan. */
export function batasBawaanModel(model: string, p: Pick<PengaturanAi, 'rpm' | 'rpd'>): { rpm: number; rpd: number; tpm: number | null } {
  const r = MODEL_REKOMENDASI.find((x) => x.model === model);
  return r ? { rpm: Math.min(r.rpm, p.rpm), rpd: Math.min(r.rpd, p.rpd), tpm: r.tpm } : { rpm: p.rpm, rpd: p.rpd, tpm: null };
}

/** Batas efektif: yang dilaporkan Google (bila ada) atau bawaan model, dan tidak pernah melebihi batas atas pengaturan. */
export const batasEfektif = (terdeteksi: number | null | undefined, bawaan: number, atas: number): number => (terdeteksi != null ? Math.min(terdeteksi, atas) : bawaan);

/** Urutan model yang dicoba: utama lalu cadangan, tanpa duplikat. */
export const rantaiModel = (p: PengaturanAi): string[] => [...new Set([p.model, ...p.cadangan])].filter(Boolean);

/** Perkiraan kasar token masukan (sekitar 4 karakter per token). */
export const perkiraanToken = (teks: string): number => Math.ceil(teks.length / 4);

const fmtPasifik = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
function bagianPasifik(d: Date) {
  return Object.fromEntries(fmtPasifik.formatToParts(d).map((x) => [x.type, x.value])) as Record<'year' | 'month' | 'day' | 'hour' | 'minute' | 'second', string>;
}
/** Tanggal kuota harian Google (jatah harian direset tengah malam waktu Pasifik). */
export function tanggalKuota(d = new Date()): string {
  const p = bagianPasifik(d);
  return `${p.year}-${p.month}-${p.day}`;
}
/** Saat jatah harian berikutnya mulai (ms epoch), semenit setelah tengah malam Pasifik. */
export function resetKuotaBerikut(d = new Date()): number {
  const p = bagianPasifik(d);
  const lewat = Number(p.hour) * 3600 + Number(p.minute) * 60 + Number(p.second);
  return d.getTime() + (24 * 3600 - lewat) * 1000 + 60_000;
}

// ------------------------------------------------------------------------------------------------------- status

export interface StatusSlot {
  rpm?: number | null;
  rpd?: number | null;
  tpm?: number | null;
  tpd?: number | null;
  /** ms epoch: jatah harian habis sampai saat ini */
  habisSampai?: number;
  /** ms epoch: jeda (batas per menit atau model sibuk) sampai saat ini */
  jedaSampai?: number;
  /** ms epoch: model tidak tersedia untuk kunci ini (404); dicoba lagi setelah 7 hari */
  tidakTersedia?: number;
  pakai: { tanggal: string; permintaan: number; masuk: number; keluar: number };
  /** permintaan semenit terakhir */
  jejak: { t: number; token: number }[];
}

export interface StatusRotasi {
  slot: Record<string, StatusSlot>;
  /** id kunci yang dinonaktifkan karena Google menolaknya (tidak sah) */
  tidakSah: Record<string, string>;
  /** galat terakhir (untuk ditampilkan), terbaru di depan */
  galat: { t: number; kunci: string; model: string; status: number; pesan: string }[];
}

export const statusKosong = (): StatusRotasi => ({ slot: {}, tidakSah: {}, galat: [] });

/** Tempat status disimpan (IndexedDB di aplikasi; memori pada tes). */
export interface Penyimpan {
  baca(): StatusRotasi | null | Promise<StatusRotasi | null>;
  tulis(s: StatusRotasi): void | Promise<void>;
}

const kj = (kunci: string, model: string) => `${kunci}|${model}`;

export type HasilPilih = { ok: true; kunci: KunciAi; model: string } | { ok: false; alasan: 'menit' | 'harian' | 'tanpa_kunci'; tungguMs?: number };

export type HasilRotasi =
  | { ok: true; teks: string; model: string; kunciLabel: string; token: { masuk: number; keluar: number }; percobaan: number }
  | { ok: false; alasan: 'tanpa_kunci' | 'menit' | 'harian' | 'galat'; pesan: string; tungguMs?: number };

export interface OpsiRotasi {
  pengaturan: () => PengaturanAi;
  kunci: () => KunciAi[];
  klien: KlienAi;
  penyimpan?: Penyimpan;
  kini?: () => number;
  tidur?: (ms: number) => Promise<void>;
  /** Paling lama menunggu jeda per menit sebelum menyerah (ms). Bawaan 20 detik. */
  tungguMaksMs?: number;
}

export class PengaturRotasi {
  status: StatusRotasi = statusKosong();
  private dimuat: Promise<void>;
  private readonly kini: () => number;
  private readonly tidur: (ms: number) => Promise<void>;

  constructor(private readonly o: OpsiRotasi) {
    this.kini = o.kini ?? (() => Date.now());
    this.tidur = o.tidur ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.dimuat = (async () => {
      const s = await o.penyimpan?.baca();
      if (s) this.status = { ...statusKosong(), ...s };
    })();
  }

  private slot(kunci: string, model: string): StatusSlot {
    const k = kj(kunci, model);
    let s = this.status.slot[k];
    if (!s) {
      s = { pakai: { tanggal: tanggalKuota(new Date(this.kini())), permintaan: 0, masuk: 0, keluar: 0 }, jejak: [] };
      this.status.slot[k] = s;
    }
    // jatah harian berganti hari; jejak menit hanya semenit terakhir
    const tgl = tanggalKuota(new Date(this.kini()));
    if (s.pakai.tanggal !== tgl) s.pakai = { tanggal: tgl, permintaan: 0, masuk: 0, keluar: 0 };
    s.jejak = s.jejak.filter((x) => x.t > this.kini() - 60_000);
    return s;
  }

  private async simpan(): Promise<void> {
    await this.o.penyimpan?.tulis(this.status);
  }

  private catatBatas(s: StatusSlot, batas: BatasTerdeteksi[]): void {
    for (const b of batas) if (b.nilai != null) s[b.jenis] = b.nilai;
  }

  private catatGalat(kunci: KunciAi, model: string, status: number, pesan: string): void {
    this.status.galat.unshift({ t: this.kini(), kunci: kunci.label, model, status, pesan: pesan.slice(0, 300) });
    this.status.galat.length = Math.min(this.status.galat.length, 20);
  }

  /** Memilih pasangan kunci × model yang masih punya jatah (perulangan bersarang: model di luar, kunci di dalam). */
  pilihSlot(tokenPerkiraan: number): HasilPilih {
    const p = this.o.pengaturan();
    const kunci = this.o.kunci().filter((k) => k.aktif && !this.status.tidakSah[k.id]);
    if (!kunci.length) return { ok: false, alasan: 'tanpa_kunci' };
    const kini = this.kini();
    let terhalangMenit = false;
    let tunggu = Infinity;
    for (const model of rantaiModel(p)) {
      for (const k of kunci) {
        const s = this.slot(k.id, model);
        const bawaan = batasBawaanModel(model, p);
        if (s.habisSampai && s.habisSampai > kini) continue;
        // model tidak tersedia untuk akun ini (404): dicoba lagi setelah 7 hari
        if (s.tidakTersedia && s.tidakTersedia > kini - 7 * 86_400_000) continue;
        if (s.pakai.permintaan >= batasEfektif(s.rpd, bawaan.rpd, p.rpd)) continue;
        if (s.tpd && s.pakai.masuk + tokenPerkiraan > s.tpd) continue;
        const tpm = s.tpm ?? bawaan.tpm;
        const token = s.jejak.reduce((a, x) => a + x.token, 0);
        const penuhRpm = s.jejak.length >= batasEfektif(s.rpm, bawaan.rpm, p.rpm);
        const penuhTpm = !!tpm && token + tokenPerkiraan > tpm;
        if ((s.jedaSampai && s.jedaSampai > kini) || penuhRpm || penuhTpm) {
          terhalangMenit = true;
          const sampaiJeda = s.jedaSampai && s.jedaSampai > kini ? s.jedaSampai - kini : 0;
          const sampaiJendela = (penuhRpm || penuhTpm) && s.jejak.length ? Math.max(0, (s.jejak[0] as { t: number }).t + 60_000 - kini) : 0;
          tunggu = Math.min(tunggu, Math.max(sampaiJeda, sampaiJendela));
          continue;
        }
        return { ok: true, kunci: k, model };
      }
    }
    return terhalangMenit ? { ok: false, alasan: 'menit', tungguMs: Number.isFinite(tunggu) ? tunggu : 60_000 } : { ok: false, alasan: 'harian' };
  }

  /** Satu permintaan dengan rotasi: berpindah kunci/model sampai ada yang berhasil atau semuanya habis. */
  async panggil(req: PermintaanAi): Promise<HasilRotasi> {
    await this.dimuat;
    const token = perkiraanToken(req.sistem + req.pesan.map((m) => m.teks).join('\n'));
    const tungguMaks = this.o.tungguMaksMs ?? 20_000;
    let menunggu = 0;
    let percobaan = 0;
    let galatTerakhir = '';
    for (let putaran = 0; putaran < 24; putaran++) {
      const pilih = this.pilihSlot(token);
      if (!pilih.ok) {
        if (pilih.alasan === 'tanpa_kunci') return { ok: false, alasan: 'tanpa_kunci', pesan: 'Belum ada kunci API Gemini yang aktif. Tambahkan di Pengaturan AI.' };
        if (pilih.alasan === 'menit' && pilih.tungguMs !== undefined && pilih.tungguMs <= tungguMaks && menunggu < 3) {
          menunggu += 1;
          await this.tidur(pilih.tungguMs + 250);
          continue;
        }
        const pesan = pilih.alasan === 'menit' ? 'Semua kunci sedang di batas per menit. Coba lagi sebentar.' : 'Jatah harian semua kunci dan model sudah habis (direset sekitar tengah malam waktu Pasifik).';
        return { ok: false, alasan: pilih.alasan, pesan: galatTerakhir ? `${pesan} (${galatTerakhir})` : pesan, ...(pilih.tungguMs !== undefined ? { tungguMs: pilih.tungguMs } : {}) };
      }
      const { kunci, model } = pilih;
      const s = this.slot(kunci.id, model);
      s.jejak.push({ t: this.kini(), token });
      s.pakai.permintaan += 1;
      percobaan += 1;
      const h = await this.o.klien.hasilkan(kunci.nilai, model, req);
      if (h.ok) {
        s.pakai.masuk += h.token.masuk;
        s.pakai.keluar += h.token.keluar;
        delete s.jedaSampai;
        await this.simpan();
        return { ok: true, teks: h.teks, model, kunciLabel: kunci.label, token: h.token, percobaan };
      }
      this.catatGalat(kunci, model, h.status, h.pesan);
      galatTerakhir = `${h.status}: ${h.pesan}`;
      if (h.jenis === 'harian' || h.jenis === 'menit') {
        this.catatBatas(s, h.batas ?? []);
        if (h.jenis === 'harian') s.habisSampai = resetKuotaBerikut(new Date(this.kini()));
        else s.jedaSampai = this.kini() + Math.max(h.tungguDetik ?? 60, 1) * 1000;
      } else if (h.jenis === 'model') s.tidakTersedia = this.kini();
      else if (h.jenis === 'sibuk') s.jedaSampai = this.kini() + 60_000;
      else if (h.jenis === 'kunci') this.status.tidakSah[kunci.id] = h.pesan.slice(0, 200);
      else {
        // permintaan ditolak (mis. 400): mengulang di kunci lain tidak membantu
        await this.simpan();
        return { ok: false, alasan: 'galat', pesan: galatTerakhir };
      }
      await this.simpan();
    }
    return { ok: false, alasan: 'galat', pesan: galatTerakhir || 'Tidak ada pasangan kunci dan model yang berhasil.' };
  }

  /** Ringkasan pemakaian untuk halaman pengaturan. */
  ringkas(): { kunciId: string; label: string; model: string; permintaanHariIni: number; semenitTerakhir: number; habis: boolean; jeda: boolean; tidakTersedia: boolean; batasHarian: number }[] {
    const p = this.o.pengaturan();
    const kini = this.kini();
    return this.o.kunci().flatMap((k) =>
      rantaiModel(p).map((model) => {
        const s = this.slot(k.id, model);
        return {
          kunciId: k.id,
          label: k.label,
          model,
          permintaanHariIni: s.pakai.permintaan,
          semenitTerakhir: s.jejak.length,
          habis: !!s.habisSampai && s.habisSampai > kini,
          jeda: !!s.jedaSampai && s.jedaSampai > kini,
          tidakTersedia: !!s.tidakTersedia && s.tidakTersedia > kini - 7 * 86_400_000,
          batasHarian: batasEfektif(s.rpd, batasBawaanModel(model, p).rpd, p.rpd),
        };
      }),
    );
  }
}
