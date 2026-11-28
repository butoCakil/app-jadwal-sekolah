/**
 * Penulis PDF kecil tanpa pustaka: halaman landscape berukuran bebas, persegi, garis, teks (Helvetica dan Helvetica-Bold, kode WinAnsi).
 * Dipakai untuk cetak jadwal supaya orientasi dan ukuran kertas pasti (tidak bergantung pada dialog cetak peramban, yang di HP
 * sering mengabaikan orientasi halaman). Satuan: poin (1/72 inci), titik asal di kiri atas halaman.
 */

/** Lebar huruf (per 1000 em) kode 32..255 menurut tabel metrik resmi Helvetica dan Helvetica-Bold. */
const LEBAR_N = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,278,278,278,222,556,333,1000,556,556,333,1000,667,333,1000,278,611,278,278,222,222,333,333,350,556,1000,333,1000,500,333,944,278,500,667,278,333,556,556,556,556,260,556,333,737,370,556,584,278,737,333,400,584,333,333,333,556,537,278,333,333,365,556,834,834,834,611,667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,556,556,556,556,556,556,556,584,611,556,556,556,556,500,556,500];
const LEBAR_B = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,278,278,278,278,556,500,1000,556,556,333,1000,667,333,1000,278,611,278,278,278,278,500,500,350,556,1000,333,1000,556,333,944,278,500,667,278,333,556,556,556,556,280,556,333,737,370,556,584,278,737,333,400,584,333,333,333,611,556,278,333,333,365,556,834,834,834,611,722,722,722,722,722,722,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,556,556,556,556,556,278,278,278,278,611,611,611,611,611,611,611,584,611,611,611,611,611,556,611,556];

/** Karakter Unicode di luar Latin-1 yang ada pada WinAnsi. */
const WINANSI: Record<number, number> = { 0x20ac: 0x80, 0x2026: 0x85, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97 };

/** Kode byte WinAnsi untuk satu karakter; karakter yang tidak ada diganti "?". */
function kodeByte(ch: string): number {
  const c = ch.codePointAt(0) as number;
  if (c >= 32 && c <= 126) return c;
  if (c >= 0xa0 && c <= 0xff) return c;
  return WINANSI[c] ?? 63;
}

/** Teks siap tulis: setiap karakter menjadi satu karakter berkode byte WinAnsi. */
export function bersihkanTeks(s: string): string {
  let out = '';
  for (const ch of s.replace(/[\r\n\t]+/g, ' ')) out += String.fromCharCode(kodeByte(ch));
  return out;
}

/** Lebar teks (poin) pada ukuran huruf tertentu. */
export function lebarTeks(s: string, ukuran: number, tebal = false): number {
  const tabel = tebal ? LEBAR_B : LEBAR_N;
  let w = 0;
  for (const ch of bersihkanTeks(s)) {
    const k = ch.charCodeAt(0);
    w += tabel[k - 32] ?? 556;
  }
  return (w * ukuran) / 1000;
}

/** Warna CSS (#rgb, #rrggbb, rgb(), hsl()) menjadi tiga angka 0..1. */
export function keRgb(css: string): [number, number, number] {
  const c = css.trim();
  let m = /^#([0-9a-f]{3})$/i.exec(c);
  if (m) {
    const h = m[1] as string;
    return [parseInt(h[0] as string, 16) / 15, parseInt(h[1] as string, 16) / 15, parseInt(h[2] as string, 16) / 15];
  }
  m = /^#([0-9a-f]{6})$/i.exec(c);
  if (m) {
    const h = m[1] as string;
    return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
  }
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(c);
  if (m) return [Number(m[1]) / 255, Number(m[2]) / 255, Number(m[3]) / 255];
  m = /^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%/i.exec(c);
  if (m) {
    const h = (((Number(m[1]) % 360) + 360) % 360) / 360;
    const s = Number(m[2]) / 100;
    const l = Number(m[3]) / 100;
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const f = (t: number) => {
      const u = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
      return u < 1 / 6 ? p + (q - p) * 6 * u : u < 1 / 2 ? q : u < 2 / 3 ? p + (q - p) * (2 / 3 - u) * 6 : p;
    };
    return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
  }
  return [0, 0, 0];
}

const n2 = (x: number): string => (Math.round(x * 100) / 100).toString();
const warna = (c: string): string => keRgb(c).map((x) => n2(x)).join(' ');
const lolos = (s: string): string => s.replace(/[\\()]/g, (x) => `\\${x}`).replace(/[\x80-\xff]/g, (x) => `\\${x.charCodeAt(0).toString(8)}`);

export interface OpsiTeks {
  ukuran: number;
  tebal?: boolean;
  warna?: string;
  rata?: 'kiri' | 'tengah' | 'kanan';
  /** 0 atau 90 (terbaca dari bawah ke atas) */
  putar?: 0 | 90;
}

export class PenulisPdf {
  readonly lebar: number;
  readonly tinggi: number;
  private halaman: string[][] = [];
  private judul: string;

  constructor(lebar: number, tinggi: number, judul = 'Jadwal Pelajaran') {
    this.lebar = lebar;
    this.tinggi = tinggi;
    this.judul = judul;
    this.halamanBaru();
  }

  get jumlahHalaman(): number {
    return this.halaman.length;
  }

  halamanBaru(): void {
    this.halaman.push([]);
  }

  private op(s: string): void {
    (this.halaman[this.halaman.length - 1] as string[]).push(s);
  }

  persegi(x: number, y: number, w: number, h: number, o: { isi?: string; garis?: string; tebal?: number } = {}): void {
    if (w <= 0 || h <= 0) return;
    const py = this.tinggi - (y + h);
    const bentuk = `${n2(x)} ${n2(py)} ${n2(w)} ${n2(h)} re`;
    if (o.isi) this.op(`${warna(o.isi)} rg`);
    if (o.garis) this.op(`${warna(o.garis)} RG ${n2(o.tebal ?? 0.5)} w`);
    this.op(`${bentuk} ${o.isi && o.garis ? 'B' : o.isi ? 'f' : o.garis ? 'S' : 'n'}`);
  }

  garis(x1: number, y1: number, x2: number, y2: number, o: { warna?: string; tebal?: number; putus?: boolean } = {}): void {
    this.op(`${warna(o.warna ?? '#000000')} RG ${n2(o.tebal ?? 0.5)} w${o.putus ? ' [2 2] 0 d' : ''}`);
    this.op(`${n2(x1)} ${n2(this.tinggi - y1)} m ${n2(x2)} ${n2(this.tinggi - y2)} l S${o.putus ? ' [] 0 d' : ''}`);
  }

  /** Batasi gambar berikutnya ke persegi ini sampai `akhiriKlip`. */
  mulaiKlip(x: number, y: number, w: number, h: number): void {
    this.op(`q ${n2(x)} ${n2(this.tinggi - (y + h))} ${n2(w)} ${n2(h)} re W n`);
  }

  akhiriKlip(): void {
    this.op('Q');
  }

  /** Teks dengan garis dasar di `y` (dihitung dari atas halaman). */
  teks(s: string, x: number, y: number, o: OpsiTeks): void {
    if (!s) return;
    const bersih = bersihkanTeks(s);
    const w = lebarTeks(s, o.ukuran, o.tebal);
    const geser = o.rata === 'tengah' ? -w / 2 : o.rata === 'kanan' ? -w : 0;
    const font = o.tebal ? '/F2' : '/F1';
    this.op(`${warna(o.warna ?? '#000000')} rg`);
    if (o.putar === 90) {
      // terbaca dari bawah ke atas: perataan berlaku pada sumbu tegak
      this.op(`BT ${font} ${n2(o.ukuran)} Tf 0 1 -1 0 ${n2(x)} ${n2(this.tinggi - (y - geser))} Tm (${lolos(bersih)}) Tj ET`);
    } else {
      this.op(`BT ${font} ${n2(o.ukuran)} Tf 1 0 0 1 ${n2(x + geser)} ${n2(this.tinggi - y)} Tm (${lolos(bersih)}) Tj ET`);
    }
  }

  /** Isi aliran konten tiap halaman (untuk pengujian). */
  isiHalaman(): string[] {
    return this.halaman.map((h) => h.join('\n'));
  }

  /** Berkas PDF utuh. */
  hasil(): Uint8Array<ArrayBuffer> {
    const obj: string[] = [];
    const tambah = (isi: string): number => obj.push(isi);
    tambah('<< /Type /Catalog /Pages 2 0 R >>'); // 1
    const nHal = this.halaman.length;
    const idHalaman = (i: number): number => 5 + i * 2;
    tambah(`<< /Type /Pages /Count ${nHal} /Kids [${this.halaman.map((_, i) => `${idHalaman(i)} 0 R`).join(' ')}] >>`); // 2
    tambah('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'); // 3
    tambah('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'); // 4
    this.halaman.forEach((ops, i) => {
      const isi = ops.join('\n');
      tambah(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n2(this.lebar)} ${n2(this.tinggi)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${idHalaman(i) + 1} 0 R >>`);
      tambah(`<< /Length ${isi.length} >>\nstream\n${isi}\nendstream`);
    });
    const info = tambah(`<< /Title (${lolos(bersihkanTeks(this.judul))}) /Producer (Jadwal SMK Negeri Bansari) >>`);
    let out = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
    const offset: number[] = [];
    obj.forEach((isi, i) => {
      offset.push(out.length);
      out += `${i + 1} 0 obj\n${isi}\nendobj\n`;
    });
    const xref = out.length;
    out += `xref\n0 ${obj.length + 1}\n0000000000 65535 f \n${offset.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
    out += `trailer\n<< /Size ${obj.length + 1} /Root 1 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    const byte = new Uint8Array(out.length);
    for (let i = 0; i < out.length; i++) byte[i] = out.charCodeAt(i) & 0xff;
    return byte;
  }
}
