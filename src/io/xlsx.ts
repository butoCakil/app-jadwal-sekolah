import { strFromU8, unzipSync } from 'fflate';

export type Sel = string | number | null;
export interface Lembar {
  nama: string;
  /** baris[r][c], indeks mulai 0; sel kosong = null */
  baris: Sel[][];
}

function dekode(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function teksDalam(xml: string): string {
  let hasil = '';
  for (const m of xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) hasil += dekode(m[1] ?? '');
  return hasil;
}

/** Huruf kolom (A, B, ..., AA) menjadi indeks 0. */
export function kolomKeIndeks(huruf: string): number {
  let n = 0;
  for (const c of huruf) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

function dapatkan(berkas: Record<string, Uint8Array>, jalur: string): string | undefined {
  const b = berkas[jalur];
  return b ? strFromU8(b) : undefined;
}

/** Nama sheet beserta jalur berkasnya di dalam paket xlsx. */
function petaSheet(berkas: Record<string, Uint8Array>): { nama: string; jalur: string }[] {
  const wb = dapatkan(berkas, 'xl/workbook.xml');
  const rel = dapatkan(berkas, 'xl/_rels/workbook.xml.rels');
  if (!wb || !rel) throw new Error('Berkas ini bukan xlsx yang valid (workbook tidak ditemukan).');
  const target = new Map<string, string>();
  for (const m of rel.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const a = m[1] ?? '';
    const id = /\bId="([^"]*)"/.exec(a)?.[1];
    const t = /\bTarget="([^"]*)"/.exec(a)?.[1];
    if (id && t) target.set(id, t.startsWith('/') ? t.slice(1) : `xl/${t}`);
  }
  const hasil: { nama: string; jalur: string }[] = [];
  for (const m of wb.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const a = m[1] ?? '';
    const nama = /\bname="([^"]*)"/.exec(a)?.[1];
    const rid = /\br:id="([^"]*)"/.exec(a)?.[1];
    const jalur = rid ? target.get(rid) : undefined;
    if (nama && jalur) hasil.push({ nama: dekode(nama), jalur });
  }
  return hasil;
}

function stringBersama(berkas: Record<string, Uint8Array>): string[] {
  const x = dapatkan(berkas, 'xl/sharedStrings.xml');
  if (!x) return [];
  return [...x.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((m) => teksDalam(m[1] ?? ''));
}

function bacaSheetXml(xml: string, ss: string[]): Sel[][] {
  const baris: Sel[][] = [];
  for (const m of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const attr = m[1] ?? '';
    const isi = m[2];
    if (isi === undefined) continue;
    const ref = /\br="([A-Z]+)(\d+)"/.exec(attr);
    if (!ref) continue;
    const c = kolomKeIndeks(ref[1] ?? 'A');
    const r = Number(ref[2]) - 1;
    const tipe = /\bt="([^"]*)"/.exec(attr)?.[1];
    let nilai: Sel = null;
    if (tipe === 'inlineStr') nilai = teksDalam(isi);
    else {
      const v = /<v>([\s\S]*?)<\/v>/.exec(isi)?.[1];
      if (v !== undefined) {
        if (tipe === 's') nilai = ss[Number(v)] ?? '';
        else if (tipe === 'str') nilai = dekode(v);
        else if (tipe === 'b' || tipe === 'e') nilai = dekode(v);
        else nilai = Number(v);
      }
    }
    if (nilai === null || nilai === '') continue;
    (baris[r] ??= [])[c] = nilai;
  }
  for (let i = 0; i < baris.length; i++) {
    const b = (baris[i] ??= []);
    for (let j = 0; j < b.length; j++) b[j] ??= null;
  }
  return baris;
}

export function daftarLembar(data: Uint8Array): string[] {
  return petaSheet(unzipSync(data)).map((s) => s.nama);
}

export function bacaLembar(data: Uint8Array, nama: string): Lembar {
  const berkas = unzipSync(data);
  const s = petaSheet(berkas).find((x) => x.nama === nama);
  if (!s) throw new Error(`Sheet "${nama}" tidak ditemukan.`);
  const xml = dapatkan(berkas, s.jalur);
  if (!xml) throw new Error(`Isi sheet "${nama}" tidak ditemukan.`);
  return { nama, baris: bacaSheetXml(xml, stringBersama(berkas)) };
}
