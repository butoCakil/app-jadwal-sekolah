import type { Proyek } from '../model/tipe';
import { migrasiPola } from '../model/kalender';

/** Isi berkas `data/terbit/jadwal.json`: yang dibaca halaman publik. */
export interface Terbit {
  format: 'jadwal-smkn-bansari';
  versi: 1;
  /** Waktu admin menekan Terapkan (ISO). */
  diterapkan: string;
  proyek: Proyek;
}

export const FORMAT_TERBIT = 'jadwal-smkn-bansari';
export const BERKAS_TERBIT = 'data/terbit/jadwal.json';

/**
 * Menyaring data kerja menjadi data publik: yang tinggal hanya yang dibutuhkan untuk menampilkan jadwal.
 * Aturan, pelanggaran yang diterima, catatan kegiatan, ruang terkunci, penugasan pengawas, daftar putih ruang, dan prioritas ruang tidak ikut.
 * Struktur tetap sama dengan `Proyek` supaya fungsi model yang sama dipakai halaman publik.
 */
export function bangunTerbit(p: Proyek, waktu: Date = new Date()): Terbit {
  const s = structuredClone(p);
  const proyek: Proyek = {
    ...s,
    penggantiManual: null,
    aturan: [],
    diterima: [],
    periodeAktifId: undefined,
    kalender: s.kalender.map((k) => {
      // catatan kegiatan adalah catatan admin (sumber data, keputusan lapangan): tidak ikut terbit
      const { ruangKunci: _a, pengawas: _b, rombelTanpaRuang: _c, catatan: _d, ...sisa } = k;
      return sisa;
    }),
    master: {
      guru: s.master.guru.map((g) => ({ id: g.id, nama: g.nama, kode: g.kode })),
      mapel: s.master.mapel.map((m) => ({ id: m.id, nama: m.nama, kode: m.kode, ...(m.induk ? { induk: m.induk } : {}) })),
      rombel: s.master.rombel.map((r) => ({ id: r.id, tingkat: r.tingkat, jurusan: r.jurusan, nomor: r.nomor, kode: r.kode })),
      ruang: s.master.ruang.map((r) => ({ id: r.id, kode: r.kode, nama: r.nama, jenis: r.jenis, ...(r.dijadwalkan === false ? { dijadwalkan: false } : {}) })),
    },
    beban: s.beban.map((b) => {
      const { ruangPrioritas: _a, ruangTerlarang: _b, pola: _c, ...sisa } = b;
      return { ...sisa, ruangPrioritas: [], ruangTerlarang: [] };
    }),
  };
  const galat = periksaPrivasi(proyek);
  if (galat.length) throw new Error(`Data terbit ditolak: ${galat.join('; ')}`);
  return { format: FORMAT_TERBIT, versi: 1, diterapkan: waktu.toISOString(), proyek };
}

const KUNCI_TERLARANG = /^(nip|nik|tanggalLahir|tgl_?lahir|lahir|tempatLahir|password|token|apiKey|kunci)$/i;

/** Mencari tanda data pribadi: kunci bernama NIP/lahir/token dan angka panjang mirip NIP (16-18 digit) di teks mana pun. */
export function periksaPrivasi(isi: unknown): string[] {
  const hasil: string[] = [];
  const jalan = (x: unknown, jejak: string) => {
    if (hasil.length >= 5) return;
    if (typeof x === 'string') {
      if (/(?<!\d)\d{16,18}(?!\d)/.test(x.replace(/[\s.\-]/g, ''))) hasil.push(`${jejak}: angka mirip NIP`);
    } else if (Array.isArray(x)) x.forEach((v, i) => jalan(v, `${jejak}[${i}]`));
    else if (x && typeof x === 'object') {
      for (const [k, v] of Object.entries(x)) {
        if (KUNCI_TERLARANG.test(k)) hasil.push(`${jejak}.${k}: kunci data pribadi`);
        else jalan(v, `${jejak}.${k}`);
      }
    }
  };
  jalan(isi, 'data');
  return hasil;
}

export type HasilBaca = { ok: true; terbit: Terbit } | { ok: false; galat: string };

/** Membaca dan memeriksa isi berkas terbit. */
export function bacaTerbit(teks: string): HasilBaca {
  let o: unknown;
  try {
    o = JSON.parse(teks);
  } catch {
    return { ok: false, galat: 'Berkas jadwal bukan JSON yang sah.' };
  }
  const t = o as Partial<Terbit> | null;
  if (!t || t.format !== FORMAT_TERBIT) return { ok: false, galat: 'Berkas bukan data jadwal terbit.' };
  if (t.versi !== 1) return { ok: false, galat: `Versi berkas terbit (${String(t.versi)}) belum didukung.` };
  const p = t.proyek;
  if (!p || !Array.isArray(p.skema) || !Array.isArray(p.polaReguler) || !p.master || !Array.isArray(p.versi) || !Array.isArray(p.beban) || !Array.isArray(p.kalender)) {
    return { ok: false, galat: 'Isi data jadwal terbit tidak lengkap.' };
  }
  return { ok: true, terbit: { format: FORMAT_TERBIT, versi: 1, diterapkan: String(t.diterapkan ?? ''), proyek: migrasiPola(p) } };
}
