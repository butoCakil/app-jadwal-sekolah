// Perkakas gambar bersama untuk cetak PDF: ukuran kertas, pemuatan teks ke kotak, kop, dan legenda kode.

import type { Proyek } from '../../model/tipe';
import { seninPekan, tambahHari } from '../../ui/util';
import { jadwalPekanP, matriksP, type ModeP } from '../tampil';
import { PenulisPdf, lebarTeks } from './penulis';

export type UkuranKertas = 'A4' | 'F4';
/** Landscape, satuan poin: A4 297x210 mm, F4 330x215 mm. */
export const KERTAS: Record<UkuranKertas, { lebar: number; tinggi: number }> = {
  A4: { lebar: 841.89, tinggi: 595.28 },
  F4: { lebar: 935.43, tinggi: 609.45 },
};
export const JUDUL_MODE: Record<ModeP, string> = { rombel: 'Kelas', guru: 'Guru', ruang: 'Ruang' };

export const tgl = (iso: string, tahun: boolean): string =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', ...(tahun ? { year: 'numeric' } : {}), timeZone: 'UTC' });

export function rentangPekan(p: Proyek, tanggal: string): string {
  const n = p.polaReguler.length;
  const senin = seninPekan(tanggal, n);
  return `${tgl(senin, false)} – ${tgl(tambahHari(senin, n - 1), true)}`;
}

/** Ukuran huruf terbesar (maksimal `ukuran`, minimal `min`) agar teks muat dalam `lebar`. */
export function muat(teks: string, lebar: number, ukuran: number, tebal = false, min = 3): number {
  const w = lebarTeks(teks, ukuran, tebal);
  if (w <= lebar || w === 0) return ukuran;
  return Math.max(min, (ukuran * lebar) / w);
}

/** Teks dipotong dengan "…" hingga muat. */
export function potong(teks: string, lebar: number, ukuran: number, tebal = false): string {
  if (lebarTeks(teks, ukuran, tebal) <= lebar) return teks;
  let s = teks;
  while (s.length > 1 && lebarTeks(`${s}…`, ukuran, tebal) > lebar) s = s.slice(0, -1);
  return `${s}…`;
}

/** Pecah teks menjadi baris-baris yang tidak melebihi `lebar`. */
export function bungkus(teks: string, lebar: number, ukuran: number, tebal = false): string[] {
  const kata = teks.split(/\s+/).filter(Boolean);
  const baris: string[] = [];
  let skrg = '';
  for (const k of kata) {
    const coba = skrg ? `${skrg} ${k}` : k;
    if (skrg && lebarTeks(coba, ukuran, tebal) > lebar) {
      baris.push(skrg);
      skrg = k;
    } else skrg = coba;
  }
  if (skrg) baris.push(skrg);
  return baris;
}

export interface Kotak {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Tulis teks pada posisi tertentu dalam kotak; ukuran huruf diperkecil bila terlalu lebar. */
export function tulisDi(
  pen: PenulisPdf,
  teks: string,
  k: Kotak,
  pos: 'kiriAtas' | 'tengah' | 'kananBawah' | 'tengahAtas',
  ukuran: number,
  o: { tebal?: boolean; warna?: string; pad?: number; min?: number } = {},
): void {
  if (!teks) return;
  const pad = o.pad ?? 1.5;
  const u = muat(teks, k.w - pad * 2, ukuran, o.tebal, o.min ?? 3);
  const opsi = { ukuran: u, tebal: o.tebal, warna: o.warna };
  if (pos === 'kiriAtas') pen.teks(teks, k.x + pad, k.y + pad + u * 0.8, { ...opsi, rata: 'kiri' });
  else if (pos === 'tengahAtas') pen.teks(teks, k.x + k.w / 2, k.y + pad + u * 0.8, { ...opsi, rata: 'tengah' });
  else if (pos === 'tengah') pen.teks(teks, k.x + k.w / 2, k.y + k.h / 2 + u * 0.35, { ...opsi, rata: 'tengah' });
  else pen.teks(teks, k.x + k.w - pad, k.y + k.h - pad - u * 0.2, { ...opsi, rata: 'kanan' });
}

/** Kode yang muncul pada satu halaman (satu entitas, satu pekan), dipisah menurut jenisnya. */
export function kodeHalaman(p: Proyek, mode: ModeP, id: string, tanggal: string): { mapel: [string, string][]; guru: [string, string][]; ruang: [string, string][] } {
  const mapel = new Map<string, string>();
  const guru = new Map<string, string>();
  const ruang = new Map<string, string>();
  for (const h of jadwalPekanP(p, tanggal, mode, id).hari) {
    for (const e of h.elemen) {
      if (e.jenis === 'nonKbm') mapel.set(e.kode, e.nama);
      if (e.jenis !== 'blok') continue;
      for (const it of e.item) {
        mapel.set(it.mapel.kode, it.mapel.nama);
        for (const g of it.guru) guru.set(g.kode, g.nama);
        if (it.ruang) ruang.set(it.ruang, it.ruangNama);
      }
    }
  }
  const urut = (m: Map<string, string>): [string, string][] => [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
  // jenis yang sama dengan judul halaman tidak perlu dijelaskan lagi
  return { mapel: urut(mapel), guru: mode === 'guru' ? [] : urut(guru), ruang: mode === 'ruang' ? [] : urut(ruang) };
}

/** Semua kode yang tampil pada rekap pekan itu (alasan kelas tidak belajar, mapel, guru, ruang). */
export function kodeRekap(p: Proyek, tanggal: string): { alasan: [string, string][]; mapel: [string, string][]; guru: [string, string][]; ruang: [string, string][] } {
  const alasan = new Map<string, string>();
  const mapel = new Map<string, string>();
  const guru = new Map<string, string>();
  const ruang = new Map<string, string>();
  const m = matriksP(p, tanggal, 'rombel');
  for (const b of m.baris) {
    for (const h of b.hari) {
      if (h.status === 'tidakAktif' && h.alasan) alasan.set(h.alasan.kode, h.alasan.nama);
      if (h.status !== 'normal') continue;
      for (const e of h.elemen) {
        if (e.jenis === 'nonKbm') mapel.set(e.kode, e.nama);
        if (e.jenis !== 'blok') continue;
        for (const it of e.item) {
          mapel.set(it.mapel.kode, it.mapel.nama);
          for (const g of it.guru) guru.set(g.kode, g.nama);
          if (it.ruang) ruang.set(it.ruang, it.ruangNama && it.ruangNama !== it.ruang ? it.ruangNama : '');
        }
      }
    }
  }
  const urut = (x: Map<string, string>): [string, string][] => [...x.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
  return { alasan: urut(alasan), mapel: urut(mapel), guru: urut(guru), ruang: urut(ruang) };
}

/**
 * Legenda kode dalam tiga lajur (Mapel dan kegiatan, Guru, Ruang) yang mengalir menurut lebar. Mengembalikan tinggi yang terpakai;
 * baris yang melebihi `tinggiMaks` tidak digambar.
 */
export function gambarLegenda(pen: PenulisPdf, kode: { mapel: [string, string][]; guru: [string, string][]; ruang: [string, string][] }, x: number, y: number, lebar: number, ukuran: number, tinggiMaks: number): number {
  const bagian = ([['Mapel dan kegiatan', kode.mapel], ['Guru', kode.guru], ['Ruang', kode.ruang]] as [string, [string, string][]][]).filter(([, d]) => d.length);
  if (!bagian.length) return 0;
  const bobot = bagian.map(([, d]) => Math.max(1, Math.min(3, Math.ceil(d.length / 12))));
  const jumlah = bobot.reduce((a, b) => a + b, 0);
  const celah = ukuran * 2.5;
  const sisa = lebar - celah * (bagian.length - 1);
  const lh = ukuran * 1.25;
  let cx = x;
  let tinggiPakai = 0;
  bagian.forEach(([judul, daftar], i) => {
    const lb = (sisa * (bobot[i] as number)) / jumlah;
    pen.teks(judul.toUpperCase(), cx, y + ukuran, { ukuran: ukuran * 0.95, tebal: true, warna: '#475569' });
    let px = cx;
    let py = y + ukuran + lh;
    for (const [k, n] of daftar) {
      const kk = `${k}`;
      const nm = n && n !== k ? ` ${n}` : '';
      const w = lebarTeks(kk, ukuran, true) + lebarTeks(nm, ukuran) + ukuran * 1.2;
      if (px > cx && px + w > cx + lb) {
        px = cx;
        py += lh;
      }
      if (py - y > tinggiMaks) break;
      pen.teks(kk, px, py, { ukuran, tebal: true });
      if (nm) pen.teks(nm, px + lebarTeks(kk, ukuran, true), py, { ukuran, warna: '#334155' });
      px += w;
    }
    tinggiPakai = Math.max(tinggiPakai, Math.min(tinggiMaks, py - y + lh * 0.3));
    cx += lb + celah;
  });
  return tinggiPakai;
}

/** Kop halaman bergaya bawaan: garis tebal di bawah, judul di kiri, rentang pekan di kanan. */
export function kopBawaan(pen: PenulisPdf, x: number, y: number, lebar: number, judul: string, rentang: string, kegiatan: string[], skala = 1): number {
  pen.teks('SMK NEGERI BANSARI · JADWAL PELAJARAN', x, y + 7 * skala, { ukuran: 7 * skala, tebal: true, warna: '#475569' });
  pen.teks(judul, x, y + 7 * skala + 17 * skala, { ukuran: 16 * skala, tebal: true });
  pen.teks(rentang, x + lebar, y + 8 * skala + 8 * skala, { ukuran: 9 * skala, tebal: true, rata: 'kanan', warna: '#334155' });
  if (kegiatan.length) pen.teks(kegiatan.join(', '), x + lebar, y + 8 * skala + 19 * skala, { ukuran: 8 * skala, rata: 'kanan', warna: '#334155' });
  const dasar = y + 7 * skala + 17 * skala + 5 * skala;
  pen.garis(x, dasar, x + lebar, dasar, { warna: '#1e293b', tebal: 1.5 });
  return dasar - y;
}
