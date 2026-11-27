import type { JenisKegiatan, Kegiatan } from '../model/tipe';
import { cekKegiatan } from '../model/kalender';
import { bacaLembar, daftarLembar } from './xlsx';
import type { Sel } from './xlsx';

export interface HasilKalender {
  kegiatan: Kegiatan[];
  peringatan: string[];
}

const BULAN: Record<string, number> = {
  jan: 1, januari: 1, feb: 2, februari: 2, mar: 3, maret: 3, apr: 4, april: 4, mei: 5, jun: 6, juni: 6, jul: 7, juli: 7, agu: 8, agt: 8, agustus: 8,
  sep: 9, sept: 9, september: 9, okt: 10, oktober: 10, nov: 11, november: 11, nop: 11, des: 12, desember: 12, dec: 12, december: 12, may: 5, aug: 8, oct: 10,
};

const dua = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number): string | null => {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? `${y}-${dua(m)}-${dua(d)}` : null;
};
const tambahHari = (tgl: string, n: number): string => {
  const [y, m, d] = tgl.split('-').map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${dua(t.getUTCMonth() + 1)}-${dua(t.getUTCDate())}`;
};

/** Nomor seri Excel (hari sejak 1899-12-30) menjadi tanggal ISO. */
function dariSeriExcel(n: number): string | null {
  if (!Number.isFinite(n) || n < 30000 || n > 80000) return null;
  const t = new Date(Date.UTC(1899, 11, 30 + Math.floor(n)));
  return `${t.getUTCFullYear()}-${dua(t.getUTCMonth() + 1)}-${dua(t.getUTCDate())}`;
}

/** Satu tanggal: 2027-01-05, 05/01/2027, 5-1-2027, "5 Januari 2027", "5 Jan 2027", atau nomor seri Excel. */
export function bacaTanggal(s: string | number | null | undefined): string | null {
  if (s === null || s === undefined || s === '') return null;
  if (typeof s === 'number') return dariSeriExcel(s);
  const t = s.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s]\d{1,2}:\d{2}.*)?$/.exec(t);
  if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t);
  if (m) return iso(Number(m[3]), Number(m[2]), Number(m[1]));
  m = /^(?:[A-Za-z']+,?\s+)?(\d{1,2})\s+([A-Za-z]+)\.?\s+(\d{4})$/.exec(t);
  if (m) {
    const bln = BULAN[(m[2] ?? '').toLowerCase()];
    return bln ? iso(Number(m[3]), bln, Number(m[1])) : null;
  }
  if (/^\d{5}$/.test(t)) return dariSeriExcel(Number(t));
  return null;
}

/** Rentang dalam satu sel: "16 - 20 November 2026", "30 Nov - 4 Des 2026", "2027-01-03 s.d. 2027-06-18". Satu tanggal menghasilkan rentang sehari. */
export function bacaRentang(teks: string): { mulai: string; selesai: string } | null {
  const t = teks.trim();
  const satu = bacaTanggal(t);
  if (satu) return { mulai: satu, selesai: satu };
  const pisah = /\s*(?:-|–|—|s\.?\s?d\.?|sd|sampai|hingga|to)\s+/i;
  const bagian = t.split(pisah);
  if (bagian.length !== 2) return null;
  const [a, b] = bagian as [string, string];
  const selesai = bacaTanggal(b);
  if (!selesai) return null;
  const [sy, sm] = selesai.split('-').map(Number) as [number, number];
  let mulai = bacaTanggal(a);
  if (!mulai) {
    // awal tanpa bulan dan/atau tahun: "16" atau "30 Nov"
    const m = /^(\d{1,2})(?:\s+([A-Za-z]+))?(?:\s+(\d{4}))?$/.exec(a.trim());
    if (!m) return null;
    const bln = m[2] ? BULAN[m[2].toLowerCase()] : sm;
    if (!bln) return null;
    const thn = m[3] ? Number(m[3]) : bln > sm ? sy - 1 : sy;
    mulai = iso(thn, bln, Number(m[1]));
  }
  return mulai && mulai <= selesai ? { mulai, selesai } : null;
}

export function tebakJenis(nama: string): JenisKegiatan {
  const n = nama.toLowerCase();
  if (/libur|cuti\s*bersama|hari\s*raya|idul|natal|nyepi|waisak|kemerdekaan|tahun\s*baru/.test(n)) return 'libur';
  if (/\btka\b|tes\s*kemampuan\s*akademik/.test(n)) return 'TKA';
  if (/\bpkl\b|prakerin|praktik\s*kerja/.test(n)) return 'PKL';
  if (/\bukk\b|uji\s*kompetensi/.test(n)) return 'UKK';
  if (/asaj|sumatif\s*akhir\s*jenjang/.test(n)) return 'ASAJ';
  if (/asas|sas\b|sumatif\s*akhir\s*semester|penilaian\s*akhir\s*semester|\bpas\b/.test(n)) return 'ASAS';
  return 'lain';
}

let cacah = 0;
const idKegiatan = () => `k${Date.now().toString(36)}${(cacah++).toString(36)}`;

function buat(nama: string, mulai: string, selesai: string, jenis: JenisKegiatan | undefined, catatan: string | undefined): Kegiatan {
  return { id: idKegiatan(), nama, jenis: jenis ?? tebakJenis(nama), mulai, selesai, rombelTidakAktif: [], ...(catatan ? { catatan } : {}) };
}

// ------------------------------------------------------------------ ICS
export function dariIcs(teks: string): HasilKalender {
  const peringatan: string[] = [];
  const kegiatan: Kegiatan[] = [];
  // lipat baris (RFC 5545): baris lanjutan diawali spasi atau tab
  const baris = teks.replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  let cur: Record<string, string> | null = null;
  for (const b of baris) {
    if (/^BEGIN:VEVENT/i.test(b)) cur = {};
    else if (/^END:VEVENT/i.test(b) && cur) {
      const nama = (cur.SUMMARY ?? '').replace(/\\,/g, ',').replace(/\\n/gi, ' ').trim();
      const awal = bacaTanggal((cur.DTSTART ?? '').replace(/^(\d{4})(\d{2})(\d{2}).*$/, '$1-$2-$3'));
      let akhir = bacaTanggal((cur.DTEND ?? '').replace(/^(\d{4})(\d{2})(\d{2}).*$/, '$1-$2-$3'));
      if (!nama || !awal) peringatan.push(`Acara tanpa nama atau tanggal mulai dilewati${nama ? `: ${nama}` : ''}.`);
      else {
        // DTEND bertipe tanggal bersifat eksklusif
        if (akhir && /^\d{8}$/.test((cur.DTEND ?? '').trim())) akhir = tambahHari(akhir, -1);
        if (!akhir || akhir < awal) akhir = awal;
        kegiatan.push(buat(nama, awal, akhir, undefined, (cur.DESCRIPTION ?? '').replace(/\\n/gi, ' ').replace(/\\,/g, ',').trim() || undefined));
      }
      cur = null;
    } else if (cur) {
      const i = b.indexOf(':');
      if (i < 0) continue;
      const kunci = (b.slice(0, i).split(';')[0] ?? '').toUpperCase();
      cur[kunci] = b.slice(i + 1);
    }
  }
  return { kegiatan, peringatan };
}

// ------------------------------------------------------------------ tabel (CSV / XLSX)
function pecahCsv(teks: string): string[][] {
  const bersih = teks.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const pertama = bersih.split('\n', 1)[0] ?? '';
  const pemisah = [';', '\t', ','].map((c) => [c, pertama.split(c).length] as const).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ',';
  const hasil: string[][] = [];
  let baris: string[] = [];
  let sel = '';
  let kutip = false;
  for (let i = 0; i < bersih.length; i++) {
    const c = bersih[i] as string;
    if (kutip) {
      if (c === '"' && bersih[i + 1] === '"') {
        sel += '"';
        i++;
      } else if (c === '"') kutip = false;
      else sel += c;
    } else if (c === '"') kutip = true;
    else if (c === pemisah) {
      baris.push(sel);
      sel = '';
    } else if (c === '\n') {
      baris.push(sel);
      hasil.push(baris);
      baris = [];
      sel = '';
    } else sel += c;
  }
  if (sel !== '' || baris.length) {
    baris.push(sel);
    hasil.push(baris);
  }
  return hasil.filter((b) => b.some((s) => s.trim() !== ''));
}

const POLA_KOLOM = {
  nama: /^(kegiatan|nama(\s*kegiatan)?|uraian|acara|agenda|summary|keterangan\s*kegiatan)$/i,
  mulai: /^(tanggal\s*)?(mulai|awal|start|dari)$/i,
  selesai: /^(tanggal\s*)?(selesai|akhir|end|sampai|s\.?d\.?|hingga)$/i,
  tanggal: /^(tanggal|tgl|waktu|jadwal|pelaksanaan)$/i,
  jenis: /^(jenis|kategori|tipe)$/i,
  catatan: /^(catatan|ket(erangan)?|deskripsi|description)$/i,
};

/** Tabel sel mentah menjadi kegiatan. Baris judul dicari otomatis (baris pertama yang memuat kolom kegiatan dan tanggal). */
export function dariTabel(tabel: Sel[][]): HasilKalender {
  const peringatan: string[] = [];
  const teks = (s: Sel | undefined) => (s === null || s === undefined ? '' : String(s).trim());
  let r0 = -1;
  let kol: Partial<Record<keyof typeof POLA_KOLOM, number>> = {};
  for (let r = 0; r < Math.min(tabel.length, 15) && r0 < 0; r++) {
    const baris = tabel[r] ?? [];
    const k: typeof kol = {};
    baris.forEach((s, c) => {
      const t = teks(s);
      for (const [nama, re] of Object.entries(POLA_KOLOM) as [keyof typeof POLA_KOLOM, RegExp][]) if (k[nama] === undefined && re.test(t)) k[nama] = c;
    });
    if (k.nama !== undefined && (k.mulai !== undefined || k.tanggal !== undefined)) {
      r0 = r;
      kol = k;
    }
  }
  if (r0 < 0) return { kegiatan: [], peringatan: ['Baris judul tidak ditemukan. Tabel perlu kolom “Kegiatan” dan “Tanggal” (atau “Mulai” dan “Selesai”).'] };
  const kegiatan: Kegiatan[] = [];
  for (let r = r0 + 1; r < tabel.length; r++) {
    const b = tabel[r] ?? [];
    const nama = teks(b[kol.nama as number]);
    if (!nama) continue;
    let rentang: { mulai: string; selesai: string } | null = null;
    if (kol.mulai !== undefined) {
      const mulai = bacaTanggal(b[kol.mulai]) ?? (typeof b[kol.mulai] === 'string' ? bacaRentang(String(b[kol.mulai]))?.mulai ?? null : null);
      const selesai = kol.selesai !== undefined ? bacaTanggal(b[kol.selesai]) : null;
      if (mulai) rentang = { mulai, selesai: selesai && selesai >= mulai ? selesai : mulai };
    }
    if (!rentang && kol.tanggal !== undefined) {
      const sel = b[kol.tanggal];
      rentang = typeof sel === 'number' ? ((): { mulai: string; selesai: string } | null => { const t = dariSeriExcel(sel); return t ? { mulai: t, selesai: t } : null; })() : bacaRentang(teks(sel));
    }
    if (!rentang) {
      peringatan.push(`Baris ${r + 1} (${nama}): tanggal tidak terbaca, dilewati.`);
      continue;
    }
    const jenisTeks = kol.jenis !== undefined ? teks(b[kol.jenis]) : '';
    const jenis = (['TKA', 'PKL', 'ASAS', 'ASAJ', 'UKK', 'libur', 'lain'] as JenisKegiatan[]).find((j) => j.toLowerCase() === jenisTeks.toLowerCase()) ?? (jenisTeks ? tebakJenis(jenisTeks) : undefined);
    kegiatan.push(buat(nama, rentang.mulai, rentang.selesai, jenis === 'lain' && !jenisTeks ? undefined : jenis, kol.catatan !== undefined ? teks(b[kol.catatan]) : undefined));
  }
  return { kegiatan, peringatan };
}

// ------------------------------------------------------------------ JSON
export function dariJsonKalender(teks: string): HasilKalender {
  let x: unknown;
  try {
    x = JSON.parse(teks);
  } catch (e) {
    return { kegiatan: [], peringatan: [`JSON tidak valid: ${(e as Error).message}`] };
  }
  const daftar = Array.isArray(x) ? x : (x as { kalender?: unknown })?.kalender;
  if (!Array.isArray(daftar)) return { kegiatan: [], peringatan: ['JSON harus berupa daftar kegiatan atau proyek yang memuat “kalender”.'] };
  const kegiatan: Kegiatan[] = [];
  const peringatan: string[] = [];
  for (const d of daftar as Partial<Kegiatan>[]) {
    if (typeof d?.nama !== 'string' || typeof d.mulai !== 'string' || typeof d.selesai !== 'string') {
      peringatan.push('Ada entri tanpa nama/mulai/selesai, dilewati.');
      continue;
    }
    kegiatan.push({ ...d, id: idKegiatan(), nama: d.nama, mulai: d.mulai, selesai: d.selesai, jenis: d.jenis ?? tebakJenis(d.nama), rombelTidakAktif: [] } as Kegiatan);
  }
  return { kegiatan, peringatan };
}

/** Membaca berkas kalender akademik menurut ekstensinya: .ics, .csv/.tsv/.txt, .xlsx, .json. */
export async function bacaBerkasKalender(nama: string, isi: ArrayBuffer): Promise<HasilKalender> {
  const ekst = (nama.split('.').pop() ?? '').toLowerCase();
  const u8 = new Uint8Array(isi);
  let hasil: HasilKalender;
  if (ekst === 'xlsx') {
    const sheet = daftarLembar(u8);
    const semua: HasilKalender = { kegiatan: [], peringatan: [] };
    for (const s of sheet) {
      const h = dariTabel(bacaLembar(u8, s).baris);
      if (h.kegiatan.length) {
        semua.kegiatan.push(...h.kegiatan);
        semua.peringatan.push(...h.peringatan.map((x) => `${s}: ${x}`));
      }
    }
    if (!semua.kegiatan.length) semua.peringatan.push('Tidak ada sheet yang memuat kolom “Kegiatan” dan “Tanggal”.');
    hasil = semua;
  } else {
    const teks = new TextDecoder('utf-8').decode(u8);
    if (ekst === 'ics') hasil = dariIcs(teks);
    else if (ekst === 'json') hasil = dariJsonKalender(teks);
    else hasil = dariTabel(pecahCsv(teks));
  }
  const sah = hasil.kegiatan.filter((k) => {
    const g = cekKegiatan(k);
    if (g.length) hasil.peringatan.push(`${k.nama}: ${g.join(' ')}`);
    return g.length === 0;
  });
  return { kegiatan: sah, peringatan: hasil.peringatan };
}
