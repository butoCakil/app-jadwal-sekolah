/**
 * Susunan satu pekan untuk satu kelas/guru/ruang dalam bentuk netral (tanpa HTML), dipakai cetak PDF gaya bawaan dan gaya aSc.
 * Baris/kolom disusun menurut urutan pelajaran supaya istirahat sejajar untuk semua hari (sama dengan tabel Per pekan):
 * pagi (pembiasaan) bila ada hari yang memakainya, lalu pelajaran 1..n, dengan istirahat di antaranya.
 */
import type { Proyek } from '../model/tipe';
import { jadwalPekanP, type HariP, type ItemP, type ModeP } from './tampil';

export interface BarisLembar {
  t: 'pagi' | 'jam' | 'ist';
  /** nomor pelajaran (jam), atau nomor jam setelah istirahat jatuh (ist); 0 = pagi */
  n: number;
}

export type IsiSel =
  | { jenis: 'blok'; item: ItemP[]; mulai: string; selesai: string }
  | { jenis: 'kosong' }
  | { jenis: 'pagi'; kode: string; nama: string }
  | { jenis: 'ist'; nama: string };

/** Satu kotak: hari ke-`hari`, baris `r1`..`r2` (inklusif). */
export interface SelLembar {
  hari: number;
  r1: number;
  r2: number;
  isi: IsiSel;
}

export interface Lembar {
  senin: string;
  hari: HariP[];
  baris: BarisLembar[];
  sel: SelLembar[];
  /** nomor poster menurut skema tiap hari: per hari, indeks baris -> label (pembiasaan dan pelajaran) */
  nomorPoster: Map<number, string>[];
  /** label kepala bersama (tanpa memperhatikan skema tiap hari): urutan 1, 2, 3, ... hanya untuk baris pagi dan pelajaran */
  labelBersama: (string | null)[];
  /** per hari: indeks baris -> rentang waktu "07.00-07.45" menurut skema hari itu */
  waktu: Map<number, string>[];
}

export function susunLembar(p: Proyek, tanggal: string, mode: ModeP, id: string): Lembar {
  const pk = jadwalPekanP(p, tanggal, mode, id);
  const hari = pk.hari;
  const adaPagi = hari.some((h) => h.elemen.some((e) => e.jenis === 'nonKbm'));
  const maks = Math.max(0, ...hari.flatMap((h) => h.elemen.map((e) => (e.jenis === 'blok' || e.jenis === 'kosong' ? e.b : 0))));
  const istSetelah = new Set(hari.flatMap((h) => h.elemen.flatMap((e) => (e.jenis === 'istirahat' ? [e.setelah] : []))));
  const baris: BarisLembar[] = [];
  if (adaPagi) baris.push({ t: 'pagi', n: 0 });
  if (istSetelah.has(0)) baris.push({ t: 'ist', n: 0 });
  for (let n = 1; n <= maks; n++) {
    baris.push({ t: 'jam', n });
    if (istSetelah.has(n)) baris.push({ t: 'ist', n });
  }
  const idx = (t: BarisLembar['t'], n: number) => baris.findIndex((r) => r.t === t && r.n === n);

  const sel: SelLembar[] = [];
  const nomorPoster: Map<number, string>[] = [];
  const waktu: Map<number, string>[] = [];
  hari.forEach((h, hi) => {
    const nomor = new Map<number, string>();
    nomorPoster.push(nomor);
    const wk = new Map<number, string>();
    waktu.push(wk);
    if (h.status !== 'normal') return;
    let terakhir = 0;
    for (const c of h.kolom) {
      const ri = c.tipe === 'nonKbm' ? idx('pagi', 0) : c.tipe === 'kbm' ? idx('jam', c.nomor ?? -1) : idx('ist', terakhir);
      if (c.tipe === 'kbm') terakhir = c.nomor ?? terakhir;
      if (c.tipe === 'nonKbm') terakhir = 0;
      if (ri >= 0) wk.set(ri, `${c.mulai}-${c.selesai}`);
    }
    const poster = new Map<number, string>();
    for (const c of h.kolom) if (c.tipe === 'kbm' && c.nomor !== null) poster.set(c.nomor, c.label);
    baris.forEach((r, ri) => {
      if (r.t === 'jam') nomor.set(ri, poster.get(r.n) ?? '');
    });
    for (const e of h.elemen) {
      if (e.jenis === 'nonKbm') {
        const r = idx('pagi', 0);
        if (r >= 0) {
          nomor.set(r, e.label);
          sel.push({ hari: hi, r1: r, r2: r, isi: { jenis: 'pagi', kode: e.kode, nama: e.nama } });
        }
      } else if (e.jenis === 'istirahat') {
        const r = idx('ist', e.setelah);
        if (r >= 0) sel.push({ hari: hi, r1: r, r2: r, isi: { jenis: 'ist', nama: e.nama } });
      } else {
        const r1 = idx('jam', e.a);
        const r2 = idx('jam', e.b);
        if (r1 < 0 || r2 < 0) continue;
        sel.push({ hari: hi, r1, r2, isi: e.jenis === 'kosong' ? { jenis: 'kosong' } : { jenis: 'blok', item: e.item, mulai: e.mulai, selesai: e.selesai } });
      }
    }
  });

  let no = 0;
  const labelBersama = baris.map((r) => (r.t === 'ist' ? null : String(++no)));
  return { senin: pk.senin, hari, baris, sel, nomorPoster, labelBersama, waktu };
}
