import type { Proyek } from '../model/tipe';
import type { PermintaanAi, PesanAi } from './klien';
import type { HasilRotasi } from './rotasi';
import { rencanakan, uraiBalasan, type BalasanAi, type HasilTerapkan, type KonteksInstruksi } from './instruksi';
import { ambilPotret, bandingkanPotret, INSTRUKSI_SISTEM, ringkasData, type Potret } from './prompt';

/**
 * Sesi percakapan dengan asisten AI. Memori sesi = riwayat teks admin dan AI (tanpa data, supaya ringkas); data terbaru selalu
 * disisipkan pada pesan terakhir. Yang terjadi di luar percakapan (admin menerapkan atau menolak usulan, mengubah data sendiri,
 * hasil penyusunan) dikirim ke AI sebagai "[Catatan sistem]" pada pesan berikutnya, sehingga AI selalu tahu keadaan terbaru.
 * AI hanya mengusulkan; tidak ada yang berubah sebelum admin menerapkan.
 */

export type StatusRencana = 'menunggu' | 'diterapkan' | 'ditolak' | 'diurungkan';

export interface Rencana {
  balasan: BalasanAi;
  hasil: HasilTerapkan;
  status: StatusRencana;
  /** waktu admin menerapkan atau menolak (ms) */
  diputuskan?: number;
  /** nomor instruksi yang tidak diterapkan (admin memilih sebagian) */
  dikecualikan?: number[];
  /** ringkasan hasil penyusunan otomatis yang dijalankan dari usulan ini */
  susunRingkas?: string;
  /** keputusan admin atas hasil penyusunan */
  susunStatus?: 'diterapkan' | 'dibuang' | 'diurungkan';
  susunDiputuskan?: number;
}

export interface Giliran {
  id: number;
  peran: 'admin' | 'ai' | 'sistem';
  teks: string;
  /** galat penguraian atau validasi yang tersisa */
  galat: string[];
  pertanyaan?: string;
  tidakBisa?: string[];
  rencana?: Rencana;
  /** model dan kunci yang menjawab */
  sumber?: string;
  /** waktu giliran dibuat (ms) */
  waktu?: number;
}

export interface PemanggilAi {
  panggil(req: PermintaanAi): Promise<HasilRotasi>;
}

/** Perbaikan otomatis: bila validator menolak usulan, AI diberi satu kesempatan memperbaiki sebelum admin melihatnya. */
export const MAKS_PERBAIKAN = 1;

/** Tanggal hari ini menurut jam perangkat, "YYYY-MM-DD". */
export function tanggalLokal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export class SesiAi {
  readonly riwayat: PesanAi[] = [];
  readonly tampil: Giliran[] = [];
  private catatan: string[] = [];
  private potret: Potret | null = null;
  private urut = 0;

  /** `hariIni` dipakai AI sebagai acuan "besok" atau "pekan depan"; diberikan dari luar agar tes tetap deterministik. */
  constructor(
    private readonly pemanggil: PemanggilAi,
    private readonly hariIni: () => string = tanggalLokal,
  ) {}

  private tambah(g: Omit<Giliran, 'id'>): Giliran {
    const baru: Giliran = { ...g, id: ++this.urut, waktu: Date.now() };
    this.tampil.push(baru);
    return baru;
  }

  /** Isi sesi untuk disimpan sebagai bagian dari riwayat percakapan. */
  ekspor(): { riwayat: PesanAi[]; tampil: Giliran[]; urut: number; catatan: string[] } {
    return { riwayat: structuredClone(this.riwayat), tampil: structuredClone(this.tampil), urut: this.urut, catatan: [...this.catatan] };
  }

  /** Memulihkan sesi dari riwayat tersimpan. Potret data tidak ikut (AI selalu menerima data terbaru). */
  pulihkan(d: { riwayat: PesanAi[]; tampil: Giliran[]; urut: number; catatan?: string[] }): void {
    this.riwayat.length = 0;
    this.riwayat.push(...structuredClone(d.riwayat));
    this.tampil.length = 0;
    this.tampil.push(...structuredClone(d.tampil));
    this.urut = Math.max(d.urut, ...d.tampil.map((g) => g.id), 0);
    this.catatan = [...(d.catatan ?? [])];
    this.potret = null;
  }

  /**
   * Bila pertukaran terakhir gagal (pesan admin lalu pemberitahuan sistem), membuangnya dan mengembalikan teks admin agar bisa
   * dikirim ulang tanpa menggandakan pesan. Selain itu mengembalikan null dan tidak mengubah apa pun.
   */
  batalkanGagal(): string | null {
    const a = this.tampil.at(-1);
    const b = this.tampil.at(-2);
    if (a?.peran !== 'sistem' || b?.peran !== 'admin') return null;
    this.tampil.length -= 2;
    return b.teks;
  }

  /** Mengosongkan percakapan (memori sesi dihapus). */
  reset(): void {
    this.riwayat.length = 0;
    this.tampil.length = 0;
    this.catatan = [];
    this.potret = null;
  }

  /** Menandai data saat ini sebagai yang sudah diketahui AI (dipanggil setelah usulan diterapkan). */
  segarkanPotret(p: Proyek, ktx: KonteksInstruksi): void {
    this.potret = ambilPotret(p, ktx);
  }

  catatDiterapkan(g: Giliran, hasil: HasilTerapkan, dikecualikan: number[] = []): void {
    if (g.rencana) {
      g.rencana.status = 'diterapkan';
      g.rencana.diputuskan = Date.now();
      if (dikecualikan.length) g.rencana.dikecualikan = dikecualikan;
    }
    this.catatan.push(`[Catatan sistem] Admin MENERAPKAN usulan Anda. Perubahan: ${hasil.perubahan.map((x) => x.teks).join(' | ') || '(tidak ada perubahan data)'}${hasil.susun ? ' | Penyusunan jadwal dijalankan.' : ''}`);
  }

  catatDitolak(g: Giliran): void {
    if (g.rencana) {
      g.rencana.status = 'ditolak';
      g.rencana.diputuskan = Date.now();
    }
    this.catatan.push('[Catatan sistem] Admin MENOLAK usulan Anda sebelumnya; tidak ada yang diubah.');
  }

  catatDiurungkan(g: Giliran): void {
    if (g.rencana) {
      g.rencana.status = 'diurungkan';
      g.rencana.diputuskan = Date.now();
    }
    this.catatan.push('[Catatan sistem] Admin MENGURUNGKAN perubahan dari usulan Anda sebelumnya; data kembali seperti sebelum diterapkan.');
  }

  /** Catatan sistem bebas untuk AI pada pesan berikutnya (mis. hasil penyusunan diterapkan atau diurungkan). */
  catatSistem(teks: string): void {
    this.catatan.push(`[Catatan sistem] ${teks}`);
  }

  catatHasilSusun(ringkas: string): void {
    this.catatan.push(`[Catatan sistem] Hasil penyusunan otomatis: ${ringkas}`);
  }

  /** Mengirim pesan admin; mengembalikan giliran jawaban AI (atau giliran sistem bila gagal). */
  async kirim(teks: string, p: Proyek, ktx: KonteksInstruksi): Promise<Giliran> {
    this.tambah({ peran: 'admin', teks, galat: [] });
    const kini = ambilPotret(p, ktx);
    if (this.potret) {
      const beda = bandingkanPotret(this.potret, kini);
      if (beda.length) this.catatan.push(`[Catatan sistem] Admin mengubah data di luar percakapan: ${beda.slice(0, 30).join(' | ')}${beda.length > 30 ? ` | …dan ${beda.length - 30} perubahan lain` : ''}`);
    }
    const pengantar = this.catatan.length ? `${this.catatan.join('\n')}\n\n` : '';
    const pesanAdmin = `${pengantar}${teks}`;
    const dasar: PesanAi[] = [...this.riwayat];
    let kirimKe: PesanAi[] = [...dasar, { peran: 'user', teks: `${pesanAdmin}\n\nDATA (terbaru):\n${ringkasData(p, ktx, this.hariIni())}` }];

    let balasan: BalasanAi | null = null;
    let hasil: (HasilTerapkan & { proyek?: Proyek }) | null = null;
    let mentah = '';
    let sumber = '';
    for (let percobaan = 0; percobaan <= MAKS_PERBAIKAN; percobaan++) {
      const r = await this.pemanggil.panggil({ sistem: INSTRUKSI_SISTEM, pesan: kirimKe });
      if (!r.ok) return this.tambah({ peran: 'sistem', teks: r.pesan, galat: [] });
      mentah = r.teks;
      sumber = `${r.model} · ${r.kunciLabel}`;
      balasan = uraiBalasan(r.teks);
      hasil = balasan.instruksi.length && balasan.galat.length === 0 ? rencanakan(p, ktx, balasan.instruksi) : null;
      const bermasalah = balasan.galat.length > 0 || (hasil !== null && !hasil.ok);
      if (!bermasalah || percobaan === MAKS_PERBAIKAN) break;
      const alasan = [...balasan.galat, ...(hasil && !hasil.ok ? hasil.galat : [])].join('\n- ');
      kirimKe = [...kirimKe, { peran: 'model', teks: r.teks }, { peran: 'user', teks: `[Catatan sistem] Validator menolak usulan Anda:\n- ${alasan}\nPerbaiki dan kirim ulang JSON lengkap. Bila tidak bisa dipenuhi, kosongkan "instruksi" dan jelaskan di "jawaban" atau "tidakBisa".` }];
    }
    // memori sesi: hanya teks admin dan jawaban akhir AI (data tidak ikut)
    this.riwayat.push({ peran: 'user', teks: pesanAdmin }, { peran: 'model', teks: mentah });
    this.catatan = [];
    this.potret = kini;
    const b = balasan as BalasanAi;
    const galat = [...b.galat, ...(hasil && !hasil.ok ? hasil.galat : [])];
    const rencana: Rencana | undefined = hasil?.ok ? { balasan: b, hasil, status: 'menunggu' } : undefined;
    return this.tambah({
      peran: 'ai',
      teks: b.jawaban || (rencana ? 'Usulan perubahan siap ditinjau.' : mentah),
      galat,
      ...(b.pertanyaan ? { pertanyaan: b.pertanyaan } : {}),
      ...(b.tidakBisa.length ? { tidakBisa: b.tidakBisa } : {}),
      ...(rencana ? { rencana } : {}),
      sumber,
    });
  }
}
