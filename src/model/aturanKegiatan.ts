import type { Kegiatan, Proyek } from './tipe';
import { hitungSkema, keMenit } from './skema';

/**
 * Aturan kegiatan yang berlaku pada satu pekan, sudah dipecah per hari kerja (0 = Senin). Dipakai bersama oleh validator,
 * penempatan (seret jadwal), dan penyusun otomatis, supaya ketiganya memegang aturan yang sama.
 */
export interface AturanPekan {
  /** Ruang terkunci pada hari tertentu: tidak boleh dipakai pelajaran pada JP yang terkunci (`jam` kosong = sepanjang hari). */
  kunci: { hari: number; ruangId: string; kegiatan: string; jam?: number[] }[];
  /** Guru yang sedang mengawas: JP (nomor KBM) yang beririsan dengan waktu tugas. */
  pengawas: { guruId: string; hari: number; jam: number[]; kegiatan: string; waktu: string }[];
  /** Rombel yang belajar tanpa ruang pada hari tertentu (mis. PJJ). */
  tanpaRuang: { hari: number; rombelId: string; kegiatan: string }[];
}

export const ATURAN_KOSONG: AturanPekan = { kunci: [], pengawas: [], tanpaRuang: [] };

/** Nomor KBM (1..) pada skema yang waktunya beririsan dengan rentang jam dinding [mulai, selesai). */
export function jpBeririsan(skema: Pick<Proyek['skema'][number], 'jamMulai' | 'baris'> | undefined, mulai: string, selesai: string): number[] {
  if (!skema) return [];
  const m = keMenit(mulai);
  const s = keMenit(selesai);
  const hasil: number[] = [];
  for (const b of hitungSkema(skema as Proyek['skema'][number])) {
    if (b.nomorKbm === null || b.nomorKbm < 1) continue;
    if (Math.max(m, keMenit(b.mulai)) < Math.min(s, keMenit(b.selesai))) hasil.push(b.nomorKbm);
  }
  return hasil;
}

/**
 * Mengumpulkan aturan kegiatan untuk satu pekan. `kegiatanHari[i]` = kegiatan yang berlaku pada hari ke-i (atau tidak ada),
 * `tanggalHari[i]` = tanggalnya, `skemaPerHari[i]` = id skema hari itu (untuk mengubah waktu mengawas menjadi nomor JP).
 */
export function aturanPekan(p: Pick<Proyek, 'skema'>, kegiatanHari: (Kegiatan | undefined)[], tanggalHari: string[], skemaPerHari: (string | null)[]): AturanPekan {
  const hasil: AturanPekan = { kunci: [], pengawas: [], tanpaRuang: [] };
  kegiatanHari.forEach((g, i) => {
    if (!g) return;
    const skema = skemaPerHari[i] ? p.skema.find((x) => x.id === skemaPerHari[i]) : undefined;
    for (const kr of g.ruangKunci ?? []) {
      if (kr.hari?.length && !kr.hari.includes(i)) continue;
      const jam = kr.mulai && kr.selesai ? jpBeririsan(skema, kr.mulai, kr.selesai) : undefined;
      if (jam && jam.length === 0) continue; // jendela waktu tidak beririsan dengan JP mana pun hari itu
      for (const ruangId of kr.ruangIds) hasil.kunci.push({ hari: i, ruangId, kegiatan: g.nama, ...(jam ? { jam } : {}) });
    }
    for (const rombelId of g.rombelTanpaRuang ?? []) hasil.tanpaRuang.push({ hari: i, rombelId, kegiatan: g.nama });
    for (const t of g.pengawas ?? []) {
      if (t.tanggal !== tanggalHari[i]) continue;
      const jam = jpBeririsan(skema, t.mulai, t.selesai);
      if (jam.length) hasil.pengawas.push({ guruId: t.guruId, hari: i, jam, kegiatan: g.nama, waktu: `${t.mulai}–${t.selesai}` });
    }
  });
  return hasil;
}

/** Ruang yang terkunci pada hari tertentu; dengan `jam`, hanya yang terkunci pada JP itu. Tanpa `jam` = terkunci pada JP mana pun hari itu. */
export function ruangTerkunciPada(a: AturanPekan | undefined, hari: number, jam?: number): Set<string> {
  const r = new Set<string>();
  for (const k of a?.kunci ?? []) if (k.hari === hari && (jam === undefined || !k.jam || k.jam.includes(jam))) r.add(k.ruangId);
  return r;
}

/** Kegiatan yang mengunci ruang pada hari dan JP itu (untuk pesan). */
export function pengunciRuang(a: AturanPekan | undefined, hari: number, jam: number, ruangId: string): string | undefined {
  return a?.kunci.find((k) => k.hari === hari && k.ruangId === ruangId && (!k.jam || k.jam.includes(jam)))?.kegiatan;
}

/** true = rombel belajar tanpa ruang pada hari itu. */
export function tanpaRuangPada(a: AturanPekan | undefined, hari: number, rombelId: string): boolean {
  return !!a?.tanpaRuang.some((x) => x.hari === hari && x.rombelId === rombelId);
}
