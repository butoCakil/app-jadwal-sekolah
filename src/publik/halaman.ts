// Halaman publik: hanya membaca data terbit (terbit/jadwal.json), tanpa login, dirancang untuk ponsel.

import type { Proyek } from '../model/tipe';
import { NAMA_HARI } from '../model/tipe';
import { hariPekan } from '../model/kalender';
import { keMenit } from '../model/skema';
import { bacaTerbit, type Terbit } from '../terbit/format';
import { IKON_CETAK, htmlDialogCetak, namaBerkas, type KeadaanCetak } from './dialogCetak';
import { buatPdf, type Gaya, type Lingkup } from './pdf/buat';
import type { UkuranKertas } from './pdf/umum';
import { gambarKalender } from './kalender';
import { barisKotak, warnaAlasan } from './kotak';
import { daftarEntitasP, jadwalHariP, jadwalPekanP, matriksP, type ElemenHari, type HariP, type ItemP, type ModeP } from './tampil';
import { esc, isoLokal, seninPekan, tambahHari, warnaMapel } from '../ui/util';

const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const tglPanjang = (iso: string): string => {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return `${d} ${BULAN[m - 1]} ${y}`;
};
const tglPendek = (iso: string): string => {
  const [, m, d] = iso.split('-').map(Number) as [number, number, number];
  return `${d} ${(BULAN[m - 1] ?? '').slice(0, 3)}`;
};

export type Tab = 'semua' | 'kalender' | ModeP;
export type Zoom = 'peta' | 'sedang' | 'besar';

const NAMA_MODE: Record<ModeP, string> = { rombel: 'Kelas', guru: 'Guru', ruang: 'Ruang' };
const KUNCI_SIMPAN = 'jadwal-publik';

export interface Keadaan {
  tab: Tab;
  /** jenis baris pada tab Semua */
  baris: ModeP;
  /** kelas/guru/ruang yang dipilih pada tab per-entitas */
  id: string;
  tanggal: string;
  tata: 'hari' | 'pekan';
  zoom: Zoom;
  /** hari yang ditampilkan pada tab Semua (0 = Senin); -1 = semua hari */
  hariSemua: number;
  /** bulan yang ditampilkan di tab Kalender (YYYY-MM); kosong = bulan tanggal terpilih */
  bulan?: string;
}

const WARNA_STATUS: Record<string, string> = {
  libur: 'bg-red-50 text-red-800 border-red-200',
  akhirPekan: 'bg-slate-100 text-slate-600 border-slate-200',
  diluarSemester: 'bg-slate-100 text-slate-600 border-slate-200',
  tidakAktif: 'bg-amber-50 text-amber-900 border-amber-200',
};

/** Hari kerja terdekat (hari ini bila hari kerja; selain itu berikutnya). */
export function hariKerjaTerdekat(tanggal: string, hariKerja: number): string {
  let t = tanggal;
  for (let i = 0; i < 7 && hariPekan(t) >= hariKerja; i++) t = tambahHari(t, 1);
  return t;
}

/** Hari kerja sebelum/sesudah tanggal. */
export function langkahHari(tanggal: string, arah: 1 | -1, hariKerja: number): string {
  let t = tambahHari(tanggal, arah);
  for (let i = 0; i < 7 && hariPekan(t) >= hariKerja; i++) t = tambahHari(t, arah);
  return t;
}

function bacaPilihan(): Partial<Keadaan> {
  const o: Partial<Keadaan> = {};
  try {
    const dariHash = new URLSearchParams(location.hash.split('?')[1] ?? '');
    const simpan = JSON.parse(localStorage.getItem(KUNCI_SIMPAN) ?? '{}') as Partial<Keadaan>;
    const ambil = (kunci: string, lama: unknown): string | undefined => dariHash.get(kunci) ?? (typeof lama === 'string' ? lama : undefined);
    const m = ambil('m', simpan.tab);
    if (m === 'semua' || m === 'kalender' || m === 'rombel' || m === 'guru' || m === 'ruang') o.tab = m;
    const b = ambil('b', simpan.baris);
    if (b === 'rombel' || b === 'guru' || b === 'ruang') o.baris = b;
    const id = ambil('id', simpan.id);
    if (id) o.id = id;
    const t = dariHash.get('t');
    if (t && /^\d{4}-\d{2}-\d{2}$/.test(t)) o.tanggal = t;
    const v = ambil('v', simpan.tata);
    if (v === 'hari' || v === 'pekan') o.tata = v;
    const z = ambil('z', simpan.zoom);
    if (z === 'peta' || z === 'sedang' || z === 'besar') o.zoom = z;
    const bl = dariHash.get('bl');
    if (bl && /^\d{4}-\d{2}$/.test(bl)) o.bulan = bl;
    const d = dariHash.get('d');
    if (d !== null && /^-?\d$/.test(d)) o.hariSemua = Number(d);
  } catch {
    /* penyimpanan peramban boleh gagal */
  }
  return o;
}

function simpanPilihan(k: Keadaan): void {
  try {
    localStorage.setItem(KUNCI_SIMPAN, JSON.stringify({ tab: k.tab, baris: k.baris, id: k.id, tata: k.tata, zoom: k.zoom }));
    history.replaceState(null, '', `#/?${new URLSearchParams({ m: k.tab, b: k.baris, id: k.id, t: k.tanggal, v: k.tata, z: k.zoom, d: String(k.hariSemua), ...(k.tab === 'kalender' ? { bl: k.bulan ?? k.tanggal.slice(0, 7) } : {}) }).toString()}`);
  } catch {
    /* abaikan */
  }
}

const rentangJam = (dari: string, sampai: string): string => (dari === sampai ? `Jam ${dari}` : `Jam ${dari}–${sampai}`);
const skemaPendek = (nama: string | undefined): string => (nama ? `Skema ${/\d+/.exec(nama)?.[0] ?? nama}` : '');

// ------------------------------------------------------------------ tampilan per hari (daftar kartu)

function subBaris(mode: ModeP, it: ItemP): string {
  if (mode === 'guru') return '';
  return it.guru.map((g) => `${esc(g.nama)} <span class="text-slate-400">(${esc(g.kode)})</span>`).join(' &amp; ');
}

function kartuBlok(mode: ModeP, e: Extract<ElemenHari, { jenis: 'blok' }>, sedang: boolean, atr: string): string {
  const isi = e.item
    .map((it, i) => {
      const judul = mode === 'rombel' ? esc(it.mapel.nama) : `${esc(it.rombel)} · ${esc(it.mapel.nama)}`;
      const sub = subBaris(mode, it);
      return `<div class="${i ? 'mt-2 border-t border-dashed border-slate-300 pt-2' : ''} flex items-start gap-2">
        <div class="min-w-0 flex-1"><div class="text-[15px] font-semibold leading-snug">${judul}</div>${sub ? `<div class="text-[13px] leading-snug text-slate-600">${sub}</div>` : ''}</div>
        ${mode === 'ruang' ? '' : it.ruang ? `<span class="shrink-0 rounded-md border border-slate-300 bg-white px-1.5 py-0.5 font-mono text-xs font-bold text-slate-700" title="Ruang">${esc(it.ruang)}</span>` : ''}</div>`;
    })
    .join('');
  const w = warnaMapel(e.item[0]?.mapel.kode ?? '');
  return `<div class="flex gap-3">
    <div class="w-[4.2rem] shrink-0 pt-2 text-right"><div class="text-[13px] font-semibold tabular-nums">${esc(e.mulai)}</div><div class="text-[11px] tabular-nums text-slate-500">${esc(e.selesai)}</div><div class="mt-0.5 text-[11px] text-slate-500">${esc(rentangJam(e.dari, e.sampai))}</div></div>
    <div class="min-w-0 flex-1 rounded-xl border-l-[5px] px-3 py-2 shadow-sm ${sedang ? 'ring-2 ring-[#2347b8]' : ''}" style="background:${w.bg};border-color:${w.garis}" ${atr}>
      ${sedang ? '<div class="mb-1 inline-block rounded-full bg-[#2347b8] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">Sedang berlangsung</div>' : ''}${isi}</div></div>`;
}

function elemenHtml(mode: ModeP, e: ElemenHari, sekarang: number | null, atr: string): string {
  const sedang = sekarang !== null && sekarang >= keMenit(e.mulai) && sekarang < keMenit(e.selesai);
  if (e.jenis === 'blok') return kartuBlok(mode, e, sedang, atr);
  if (e.jenis === 'kosong') {
    return `<div class="flex gap-3"><div class="w-[4.2rem] shrink-0 text-right text-[12px] tabular-nums text-slate-400">${esc(e.mulai)}<br>${esc(e.selesai)}</div>
      <div class="flex-1 rounded-xl border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-400 ${sedang ? 'ring-2 ring-[#2347b8]/50' : ''}">${mode === 'rombel' ? 'Belum ada pelajaran' : 'Kosong'} <span class="text-[11px]">(${esc(rentangJam(e.dari, e.sampai))})</span></div></div>`;
  }
  const teks = e.jenis === 'nonKbm' ? `<b>${esc(e.kode)}</b> · ${esc(e.nama)}` : esc(e.nama);
  return `<div class="flex items-center gap-3"><div class="w-[4.2rem] shrink-0 text-right text-[11px] tabular-nums text-slate-400">${esc(e.mulai)}</div>
    <div class="flex-1 rounded-full px-3 py-1 text-center text-xs ${e.jenis === 'istirahat' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'} ${sedang ? 'ring-2 ring-[#2347b8]/50' : ''}">${teks} · ${esc(e.mulai)}–${esc(e.selesai)}</div></div>`;
}

function banner(h: HariP): string {
  const bagian: string[] = [];
  if (h.status !== 'normal') bagian.push(`<div class="rounded-xl border px-3 py-2 text-sm font-medium ${WARNA_STATUS[h.status] ?? ''}">${esc(h.keterangan)}</div>`);
  if (h.kegiatan) bagian.push(`<div class="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900"><b>${esc(h.kegiatan.nama)}</b></div>`);
  if (h.agenda.length) {
    bagian.push(`<div class="flex flex-wrap gap-1.5">${h.agenda.map((a) => `<span class="rounded-full bg-violet-100 px-2.5 py-1 text-xs text-violet-900" title="${esc(a.jenis)}">${esc(a.nama)}${a.untuk && a.untuk !== 'semua' ? ` · ${esc(a.untuk)}` : ''}</span>`).join('')}</div>`);
  }
  return bagian.length ? `<div class="mb-3 space-y-2">${bagian.join('')}</div>` : '';
}

function tampilanHari(p: Proyek, k: Keadaan, hariIni: string): string {
  const mode = k.tab as ModeP;
  const h = jadwalHariP(p, k.tanggal, mode, k.id);
  const now = new Date();
  const sekarang = k.tanggal === hariIni ? now.getHours() * 60 + now.getMinutes() : null;
  const daftar = h.elemen
    .map((e) => elemenHtml(mode, e, sekarang, e.jenis === 'blok' ? `data-aksi="det" data-tgl="${k.tanggal}" data-a="${e.a}" data-id="${esc(k.id)}"` : ''))
    .join('');
  if (h.status !== 'normal') return banner(h);
  if (h.totalJp === 0) {
    const kata = mode === 'rombel' ? 'Belum ada pelajaran terjadwal pada hari ini.' : mode === 'guru' ? 'Tidak ada jadwal mengajar pada hari ini.' : 'Ruang ini tidak dipakai pada hari ini.';
    return `${banner(h)}<div class="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">${kata}</div>`;
  }
  return `${banner(h)}<div class="mb-2 text-xs text-slate-500">${h.totalJp} jam pelajaran${h.skema ? ` · ${esc(h.skema)}` : ''}</div><div class="space-y-2">${daftar}</div>`;
}

// ------------------------------------------------------------------ tabel pekan satu kelas/guru/ruang (bentuk grid: pagi, jam ke-n, istirahat)

function isiSel(mode: ModeP, it: ItemP): string {
  const guru = it.guru.map((g) => g.kode).join('+');
  if (mode === 'ruang') return `<b>${esc(it.rombel)}</b><div class="text-[9.5px] text-slate-600">${esc(it.mapel.kode)} ${esc(guru)}</div>`;
  const ruang = it.ruang ? ` <span class="font-mono font-semibold">${esc(it.ruang)}</span>` : '';
  return `<b>${esc(it.mapel.kode)}</b>${ruang}<div class="text-[9.5px] text-slate-600">${esc(mode === 'rombel' ? guru : it.rombel)}</div>`;
}

/** Tabel satu pekan untuk satu kelas/guru/ruang. */
export function tabelPekan(p: Proyek, k: Keadaan, hariIni: string): string {
  const mode = k.tab as ModeP;
  const pk = jadwalPekanP(p, k.tanggal, mode, k.id);
  const hari = pk.hari;
  const adaPagi = hari.some((h) => h.elemen.some((e) => e.jenis === 'nonKbm'));
  const maks = Math.max(0, ...hari.flatMap((h) => h.elemen.map((e) => (e.jenis === 'blok' || e.jenis === 'kosong' ? e.b : 0))));
  const istSetelah = new Set(hari.flatMap((h) => h.elemen.flatMap((e) => (e.jenis === 'istirahat' ? [e.setelah] : []))));
  const baris: { t: 'pagi' | 'jam' | 'ist'; n: number }[] = [];
  if (adaPagi) baris.push({ t: 'pagi', n: 0 });
  if (istSetelah.has(0)) baris.push({ t: 'ist', n: 0 });
  for (let n = 1; n <= maks; n++) {
    baris.push({ t: 'jam', n });
    if (istSetelah.has(n)) baris.push({ t: 'ist', n });
  }
  const idx = (t: 'pagi' | 'jam' | 'ist', n: number) => baris.findIndex((r) => r.t === t && r.n === n);

  const kepala = hari.map((h) => {
    const bg = h.warna ?? '#64748b';
    return `<th colspan="2" class="px-0.5 py-1 text-center text-white ${h.tanggal === hariIni ? 'outline outline-2 -outline-offset-2 outline-amber-300' : ''}" style="background:${esc(bg)}"><div class="text-xs font-bold">${esc(h.hari.slice(0, 3))}</div><div class="text-[10px] font-normal opacity-90">${esc(tglPendek(h.tanggal))}</div><div class="text-[9px] font-normal opacity-80">${esc(skemaPendek(h.skema))}</div></th>`;
  }).join('');

  const atr = (h: HariP, a: number) => `data-aksi="det" data-tgl="${h.tanggal}" data-a="${a}" data-id="${esc(k.id)}"`;
  const GUTER = 'border border-white border-l-2 border-l-slate-600 bg-slate-50 p-0 text-center align-middle text-[10px] font-bold tabular-nums text-slate-500';
  const kosongSel = '<td class="border border-white bg-stone-200/50"></td>';
  // tiap hari: nomor jam menurut poster skema hari itu (pembiasaan = 1 pada skema 11 dan 9) dan isi kotak
  const kolom = hari.map((h) => {
    const nomorPoster = new Map<number, string>();
    for (const c of h.kolom) if (c.tipe === 'kbm' && c.nomor !== null) nomorPoster.set(c.nomor, c.label);
    const guter = new Map<number, string>();
    const sel = new Map<number, string>();
    const lewat = new Set<number>();
    if (h.status !== 'normal') {
      if (baris.length) {
        sel.set(0, `<td colspan="2" rowspan="${baris.length}" class="border border-white border-l-2 border-l-slate-600 p-0.5 align-top"><div class="rounded-md border px-0.5 py-2 text-center text-[10px] ${WARNA_STATUS[h.status] ?? ''}">${esc(h.keterangan)}</div></td>`);
        for (let r = 1; r < baris.length; r++) lewat.add(r);
      }
    } else {
      baris.forEach((r, ri) => {
        if (r.t === 'jam') guter.set(ri, `<td class="${GUTER}">${esc(nomorPoster.get(r.n) ?? '')}</td>`);
      });
      for (const e of h.elemen) {
        if (e.jenis === 'nonKbm') {
          const r = idx('pagi', 0);
          if (r >= 0) {
            guter.set(r, `<td class="${GUTER}">${esc(e.label)}</td>`);
            sel.set(r, `<td class="border border-white bg-slate-200 text-center align-middle text-[10px] text-slate-700" title="${esc(`${e.nama} ${e.mulai}–${e.selesai}`)}"><b>${esc(e.kode)}</b></td>`);
          }
        } else if (e.jenis === 'istirahat') {
          const r = idx('ist', e.setelah);
          if (r >= 0) sel.set(r, `<td colspan="2" class="border border-white bg-amber-100 text-center align-middle text-[9px] text-amber-800" title="${esc(`${e.nama} ${e.mulai}–${e.selesai}`)}">Istirahat</td>`);
        } else {
          const r1 = idx('jam', e.a);
          const r2 = idx('jam', e.b);
          if (r1 < 0 || r2 < 0) continue;
          for (let r = r1 + 1; r <= r2; r++) lewat.add(r);
          if (e.jenis === 'kosong') sel.set(r1, `<td rowspan="${r2 - r1 + 1}" class="border border-white bg-white"></td>`);
          else {
            const w = warnaMapel(e.item[0]?.mapel.kode ?? '');
            const tip = e.item.map((x) => `${x.mapel.nama} · ${x.rombel}${x.guru.length ? ` · ${x.guru.map((g) => g.nama).join(' & ')}` : ''}${x.ruang ? ` · ${x.ruang}` : ''}`).join('\n');
            sel.set(r1, `<td rowspan="${r2 - r1 + 1}" class="cursor-pointer border border-white px-1 py-0.5 align-top text-[10.5px] leading-tight" style="background:${w.bg};border-left:3px solid ${w.garis}" title="${esc(`${tip}\n${e.mulai}–${e.selesai}`)}" ${atr(h, e.a)}>${e.item.map((x, i) => `<div class="${i ? 'mt-1 border-t border-dashed border-slate-400/50 pt-0.5' : ''}">${isiSel(mode, x)}</div>`).join('')}</td>`);
          }
        }
      }
    }
    return { sel, lewat, guter, status: h.status !== 'normal' };
  });

  const isi = baris.map((r, ri) => {
    const tinggi = r.t === 'ist' ? 20 : r.t === 'pagi' ? 34 : 46;
    const td = kolom.map((c) => {
      const s = c.sel.get(ri);
      if (c.status) return c.lewat.has(ri) ? '' : (s ?? '');
      if (r.t === 'ist') return s ?? `<td colspan="2" class="border border-white bg-stone-200/50"></td>`;
      // nomor jam selalu tampil; isi kotak dilewati bila tertutup rowspan dari baris di atasnya
      return `${c.guter.get(ri) ?? `<td class="${GUTER}"></td>`}${c.lewat.has(ri) ? '' : (s ?? kosongSel)}`;
    }).join('');
    return `<tr style="height:${tinggi}px">${td}</tr>`;
  }).join('');

  const kegiatan = [...new Set(hari.map((h) => h.kegiatan?.nama).filter((x): x is string => !!x))];
  const kode = [...new Map(hari.flatMap((h) => h.elemen.flatMap((e) => (e.jenis === 'nonKbm' ? [[e.kode, e.nama] as const] : [])))).entries()].map(([c, n]) => `<b>${esc(c)}</b> = ${esc(n)}`).join(' · ');
  const alasan = [...new Set(hari.filter((h) => h.status !== 'normal').map((h) => h.keterangan).filter(Boolean))];
  const kosongSemua = baris.length === 0 ? `<tr><td colspan="10" class="px-3 py-6 text-center text-sm text-slate-500">Tidak ada KBM pada pekan ini.${alasan.length ? `<div class="mt-1 text-xs">${alasan.map(esc).join(' · ')}</div>` : ''}</td></tr>` : '';
  return `${kegiatan.length ? `<div class="mb-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">Pekan ini: <b>${esc(kegiatan.join(', '))}</b></div>` : ''}
    <div class="overflow-x-auto rounded-xl border border-slate-200 bg-white"><table class="w-full table-fixed border-collapse"><colgroup>${hari.map(() => '<col style="width:6.5%"><col>').join('')}</colgroup><thead><tr>${kepala}</tr></thead><tbody>${isi}${kosongSemua}</tbody></table></div>
    <p class="mt-2 text-[11px] leading-relaxed text-slate-500">Angka kecil di tiap hari = jam ke- menurut poster skema hari itu (pembiasaan jam 1 pada skema 11 dan 9; pada skema 10 pelajaran pertama jam 1).${kode ? ` ${kode}.` : ''} Jam berurutan dengan guru dan mapel yang sama digabung; istirahat memotongnya. Sentuh kotak untuk detail.</p>`;
}

// ------------------------------------------------------------------ tab Semua: matriks semua kelas/guru/ruang

/** Cangkir kecil penanda kolom istirahat pada kepala tabel. */
const IKON_ISTIRAHAT = '<svg viewBox="0 0 12 12" width="8" height="8" class="mx-auto text-amber-800" aria-label="istirahat"><title>Istirahat</title><path d="M1.5 4h6v3a3 3 0 0 1-6 0zM7.5 5h1a1.3 1.3 0 0 1 0 2.6h-1M3 .8v1.5M5 .8v1.5" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const JUDUL_BARIS: Record<ModeP, string> = {
  rombel: 'kode mapel, kode guru, kode ruang',
  guru: 'kelas, kode mapel, kode ruang',
  ruang: 'kelas, kode mapel, kode guru',
};

/** Penjelasan kode yang tampil pada tabel: alasan tidak ada KBM, mapel, guru, ruang. */
function legendaKode(m: ReturnType<typeof matriksP>, tampil: number[], mode: ModeP): string {
  const alasan = new Map<string, string>();
  const mapel = new Map<string, string>();
  const guru = new Map<string, string>();
  const ruang = new Map<string, string>();
  for (const b of m.baris) {
    for (const i of tampil) {
      const h = b.hari[i] as HariP;
      if (h.status === 'tidakAktif' && h.alasan) alasan.set(h.alasan.kode, h.alasan.nama);
      if (h.status !== 'normal') continue;
      for (const e of h.elemen) {
        if (e.jenis !== 'blok') continue;
        for (const it of e.item) {
          mapel.set(it.mapel.kode, it.mapel.nama);
          for (const g of it.guru) guru.set(g.kode, g.nama);
          if (it.ruang) ruang.set(it.ruang, it.ruangNama && it.ruangNama !== it.ruang ? it.ruangNama : '');
        }
      }
    }
  }
  const urut = (mp: Map<string, string>) => [...mp.entries()].sort((x, y) => x[0].localeCompare(y[0]));
  const tabel = (xs: [string, string][], chip?: (k: string) => string) =>
    `<table class="w-full text-[11px]"><tbody>${xs.map(([k, n]) => `<tr class="border-t border-slate-100"><td class="w-14 whitespace-nowrap py-[1px] pr-2 align-top font-bold text-slate-800">${chip ? chip(k) : esc(k)}</td><td class="py-[1px] align-top text-slate-600">${esc(n)}</td></tr>`).join('')}</tbody></table>`;
  const bagian = (judul: string, mp: Map<string, string>, chip?: (k: string) => string) => {
    if (!mp.size) return '';
    const xs = urut(mp);
    const isi = xs.length > 10 ? `<div class="grid gap-x-6 sm:grid-cols-2">${tabel(xs.slice(0, Math.ceil(xs.length / 2)), chip)}${tabel(xs.slice(Math.ceil(xs.length / 2)), chip)}</div>` : tabel(xs, chip);
    return `<div class="mt-2"><div class="mb-0.5 text-[11px] font-semibold text-slate-600">${judul}</div>${isi}</div>`;
  };
  const chipAlasan = (k: string) => {
    const w = warnaAlasan(k);
    return `<span class="rounded px-1 font-bold" style="background:${w.bg};color:${w.fg}">${esc(k)}</span>`;
  };
  const html =
    bagian('Kelas tidak ada KBM di sekolah', alasan, chipAlasan) +
    bagian('Mapel', mapel) +
    (mode === 'rombel' || mode === 'ruang' ? bagian('Guru', guru) : '') +
    (mode === 'rombel' || mode === 'guru' ? bagian('Ruang', new Map([...ruang].map(([k, n]) => [k, n || '']))) : '');
  return html ? `<div class="mt-2 rounded-xl border border-slate-200 bg-white px-3 pb-2.5 pt-1">${html}</div>` : '';
}

/** Matriks semua kelas/guru/ruang x semua hari. */
export function tabelSemua(p: Proyek, k: Keadaan, hariIni: string, lebar: number): string {
  const mode = k.baris;
  const m = matriksP(p, k.tanggal, mode);
  const tampil = m.hari.map((_, i) => i).filter((i) => k.hariSemua < 0 || i === k.hariSemua);
  const lebarLabel = mode === 'rombel' ? 50 : 40;
  const bobot = (h: HariP) => (h.status === 'normal' ? h.kolom.reduce((a, c) => a + (c.tipe === 'istirahat' ? 0.4 : 1), 0) : 1.5);
  const jumlahBobot = tampil.reduce((a, i) => a + bobot(m.hari[i] as HariP), 0);
  const pas = (Math.min(lebar, 768) - 32 - lebarLabel) / Math.max(1, jumlahBobot);
  const dasar = mode === 'rombel' ? 28 : 30;
  const jepit = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
  const w = k.zoom === 'peta' ? jepit(pas, 3, 44) : k.zoom === 'sedang' ? (k.hariSemua >= 0 ? jepit(pas, dasar, 44) : dasar) : k.hariSemua >= 0 ? jepit(pas * 1.35, dasar + 8, 56) : dasar * 1.5;
  const tinggi = k.zoom === 'peta' ? 9 : k.zoom === 'sedang' ? 31 : 40;
  // tiap kotak memuat 3 baris kode (mapel / guru / ruang), jadi huruf dibatasi oleh tinggi kotak
  const huruf = Math.min(w >= 40 ? 11 : w >= 30 ? 10 : w >= 22 ? 9 : 8, Math.floor((tinggi - 3) / 3));
  const bacaTeks = w >= 15 && tinggi >= 20;
  const lebarIst = Math.max(k.zoom === 'peta' ? 4 : 8, w * 0.4);

  // kolom per hari
  const grupHari = tampil.map((i) => {
    const h = m.hari[i] as HariP;
    if (h.status !== 'normal') return { i, h, lebar: [w * 1.5], jumlah: 1 };
    return { i, h, lebar: h.kolom.map((c) => (c.tipe === 'istirahat' ? lebarIst : w)), jumlah: h.kolom.length };
  });
  const total = lebarLabel + grupHari.reduce((a, g) => a + g.lebar.reduce((x, y) => x + y, 0), 0);
  // garis padat tegas di batas antar hari (awal tiap hari, termasuk sisi kanan terakhir)
  const batasHari: number[] = [];
  let xAwal = lebarLabel;
  for (const g of grupHari) {
    batasHari.push(xAwal);
    xAwal += g.lebar.reduce((a, b) => a + b, 0);
  }
  const hurufBatas = [...batasHari, total].map((x) => `<div class="pointer-events-none absolute bottom-0 top-0 border-l-2 border-solid" style="left:${(x - 1).toFixed(1)}px;z-index:6;border-color:rgb(51,65,85)"></div>`).join('');
  const cols = `<col style="width:${lebarLabel}px">${grupHari.flatMap((g) => g.lebar.map((x) => `<col style="width:${x.toFixed(1)}px">`)).join('')}`;

  const kepala1 = grupHari.map((g) => `<th colspan="${g.jumlah}" class="sticky top-0 z-20 border-r border-white px-0.5 text-center text-white ${g.h.tanggal === hariIni ? 'outline outline-2 -outline-offset-2 outline-amber-300' : ''}" style="height:20px;background:${esc(g.h.warna ?? '#64748b')}"><span class="text-[10px] font-bold">${esc(g.h.hari.slice(0, 3))} ${Number(g.h.tanggal.slice(8))}</span>${g.h.status === 'normal' && w * g.jumlah > 90 ? `<span class="ml-1 text-[9px] opacity-80">${esc(skemaPendek(g.h.skema))}</span>` : ''}</th>`).join('');
  const kepala2 = grupHari.flatMap((g) => (g.h.status === 'normal'
    ? g.h.kolom.map((c) => `<th class="sticky z-20 border-r border-slate-200 p-0 text-center text-[8px] font-semibold ${c.tipe === 'istirahat' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500'}" style="top:20px;height:15px">${c.tipe === 'istirahat' ? (lebarIst >= 6 ? IKON_ISTIRAHAT : '') : w >= 9 ? esc(c.label) : ''}</th>`)
    : [`<th class="sticky z-20 border-r border-slate-200 bg-slate-100 p-0 text-center text-[8px] text-slate-500" style="top:20px;height:15px" title="${esc(g.h.keterangan)}">${w >= 15 ? (g.h.status === 'libur' ? 'libur' : '–') : ''}</th>`])).join('');

  let grupLalu = '';
  const isi = m.baris.map((b) => {
    const pisah = b.grup && grupLalu && b.grup !== grupLalu ? 'border-t-2 border-t-slate-400' : '';
    grupLalu = b.grup || grupLalu;
    const sel = grupHari.map((g) => {
      const h = b.hari[g.i] as HariP;
      if (h.status === 'tidakAktif') {
        const a = h.alasan as { kode: string; nama: string };
        const wa = warnaAlasan(a.kode);
        return `<td colspan="${g.jumlah}" class="border-b border-r border-white text-center font-bold" style="height:${tinggi}px;background:${wa.bg};color:${wa.fg};font-size:${Math.min(huruf, 10)}px" title="${esc(h.keterangan)}">${bacaTeks ? esc(a.kode) : ''}</td>`;
      }
      if (h.status !== 'normal') return `<td class="border-b border-r border-slate-200 bg-slate-100" style="height:${tinggi}px"></td>`;
      return h.elemen.map((e) => {
        if (e.jenis === 'istirahat') return `<td class="border-b border-r border-white bg-amber-100" style="height:${tinggi}px"></td>`;
        if (e.jenis === 'nonKbm') return `<td class="border-b border-r border-slate-200 bg-slate-200 text-center text-slate-600" style="height:${tinggi}px;font-size:${huruf - 1}px" title="${esc(e.nama)}">${bacaTeks ? esc(e.kode) : ''}</td>`;
        if (e.jenis === 'kosong') return `<td colspan="${e.jp}" class="border-b border-r border-slate-200 bg-white" style="height:${tinggi}px"></td>`;
        const x = e.item[0] as ItemP;
        const c = warnaMapel(x.mapel.kode);
        const teks = barisKotak(mode, x, e.item.length > 1).map((t, n) => `<span class="block overflow-hidden tracking-tighter ${n === 0 ? 'font-bold' : 'font-medium'}">${esc(t)}</span>`).join('');
        const tip = e.item.map((y) => `${y.rombel} · ${y.mapel.nama}${y.guru.length ? ` · ${y.guru.map((gg) => gg.nama).join(' & ')}` : ''}${y.ruang ? ` · ${y.ruang}` : ''}`).join('\n');
        return `<td colspan="${e.jp}" class="cursor-pointer overflow-hidden whitespace-nowrap border-b border-r border-white text-center" style="height:${tinggi}px;background:${c.bg};border-left:2px solid ${c.garis};font-size:${huruf}px;line-height:1.05" title="${esc(tip)}" data-aksi="det" data-id="${esc(b.id)}" data-tgl="${g.h.tanggal}" data-a="${e.a}">${bacaTeks ? teks : ''}</td>`;
      }).join('');
    }).join('');
    return `<tr><th class="sticky left-0 z-10 overflow-hidden whitespace-nowrap border-b border-r border-slate-200 bg-slate-50 px-1 text-left text-[9px] font-bold text-slate-700 ${pisah}" style="height:${tinggi}px" title="${esc(b.label)}">${esc(b.label)}</th>${sel}</tr>`;
  }).join('');

  const kegiatan = [...new Set(tampil.map((i) => (m.hari[i] as HariP).kegiatan?.nama).filter((x): x is string => !!x))];
  const agenda = [...new Map(tampil.flatMap((i) => (m.hari[i] as HariP).agenda).map((a) => [a.nama, a])).values()];
  const kode = [...new Map(tampil.flatMap((i) => (m.hari[i] as HariP).kolom.filter((c) => c.tipe === 'nonKbm').map((c) => [c.kode ?? '', c.nama] as const))).entries()].map(([c, n]) => `<b>${esc(c)}</b> = ${esc(n)}`).join(' · ');
  const info = `${kegiatan.length ? `<div class="mb-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">Pekan ini: <b>${esc(kegiatan.join(', '))}</b></div>` : ''}${agenda.length ? `<div class="mb-2 flex flex-wrap gap-1.5">${agenda.map((a) => `<span class="rounded-full bg-violet-100 px-2.5 py-1 text-xs text-violet-900">${esc(a.nama)}${a.untuk && a.untuk !== 'semua' ? ` · ${esc(a.untuk)}` : ''}</span>`).join('')}</div>` : ''}`;
  const ket = `Isi kotak dari atas: ${JUDUL_BARIS[mode]} (tanda + = ada kelompok paralel).`;
  const legenda = legendaKode(m, tampil, mode);
  return `${info}<div id="matriks" class="overflow-auto rounded-xl border border-slate-200 bg-white" style="max-height:72vh"><div class="relative" style="width:${total.toFixed(0)}px"><table class="border-separate border-spacing-0" style="table-layout:fixed;width:${total.toFixed(0)}px"><colgroup>${cols}</colgroup>
    <thead><tr><th rowspan="2" class="sticky left-0 top-0 z-30 border-b border-r border-slate-200 bg-slate-100 text-[9px] font-semibold text-slate-500" style="height:35px">${NAMA_MODE[mode]}</th>${kepala1}</tr><tr>${kepala2}</tr></thead><tbody>${isi}</tbody></table>${hurufBatas}</div></div>
    <p class="mt-2 text-[11px] leading-relaxed text-slate-500">${ket} Jam berurutan dengan guru dan mapel yang sama digabung; kolom kuning = istirahat. Sentuh kotak untuk detail, geser untuk melihat hari lain, atau pilih satu hari / tombol Peta untuk ringkasan.${kode ? ` ${kode}.` : ''}</p>${legenda}
    ${m.baris.length === 0 ? '<p class="mt-2 text-sm text-slate-500">Tidak ada data pada pekan ini.</p>' : ''}`;
}

// ------------------------------------------------------------------ rincian (lembar bawah)

/** Isi lembar rincian satu kotak jadwal. */
export function htmlRincian(p: Proyek, mode: ModeP, id: string, tanggal: string, a: number): string {
  const h = jadwalHariP(p, tanggal, mode, id);
  const e = h.elemen.find((x) => (x.jenis === 'blok' || x.jenis === 'kosong') && a >= x.a && a <= x.b);
  const nama = daftarEntitasP(p, mode).find((x) => x.id === id)?.label ?? '';
  const judul = `${esc(nama)} · ${esc(h.hari)}, ${esc(tglPanjang(tanggal))}`;
  let isi = '<p class="text-sm text-slate-500">Tidak ada data.</p>';
  if (e && e.jenis === 'blok') {
    isi = `<div class="mb-2 text-sm text-slate-600"><b>${esc(e.mulai)}–${esc(e.selesai)}</b> · ${esc(rentangJam(e.dari, e.sampai))} · ${e.jp} JP</div>` + e.item.map((it) => `<div class="mb-2 rounded-xl border border-slate-200 p-3">
      <div class="text-base font-bold">${esc(it.mapel.nama)} <span class="text-xs font-semibold text-slate-400">${esc(it.mapel.kode)}</span></div>
      <dl class="mt-1 grid grid-cols-[4.5rem_1fr] gap-y-0.5 text-sm"><dt class="text-slate-500">Kelas</dt><dd>${esc(it.rombel)}</dd><dt class="text-slate-500">Guru</dt><dd>${it.guru.length ? it.guru.map((g) => `${esc(g.nama)} <span class="text-slate-400">(${esc(g.kode)})</span>`).join('<br>') : '-'}</dd><dt class="text-slate-500">Ruang</dt><dd>${it.ruang ? `<b>${esc(it.ruang)}</b>${it.ruangNama && it.ruangNama !== it.ruang ? ` · ${esc(it.ruangNama)}` : ''}` : 'belum ditentukan'}</dd></dl></div>`).join('');
  }
  return `<div class="fixed inset-0 z-40 bg-black/30" data-aksi="tutupRincian"></div>
    <div class="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-3xl rounded-t-2xl bg-white p-4 pb-6 shadow-2xl" role="dialog" aria-label="Rincian jadwal">
      <div class="mb-2 flex items-start gap-2"><div class="flex-1 text-sm font-semibold text-slate-700">${judul}</div><button class="h-8 w-8 shrink-0 rounded-full bg-slate-100 text-slate-600" data-aksi="tutupRincian" aria-label="Tutup">✕</button></div>${isi}</div>`;
}

// ------------------------------------------------------------------ halaman

export function gambarHalaman(t: Terbit, k: Keadaan, hariIni: string, lebar = 390): string {
  const p = t.proyek;
  const n = p.polaReguler.length;
  const semua = k.tab === 'semua';
  const kalender = k.tab === 'kalender';
  const mode = (semua || kalender ? k.baris : k.tab) as ModeP;
  const entitas = daftarEntitasP(p, mode);
  const grup = [...new Set(entitas.map((e) => e.grup))];
  const pilihan = grup
    .map((g) => {
      const opsi = entitas.filter((e) => e.grup === g).map((e) => `<option value="${esc(e.id)}" ${e.id === k.id ? 'selected' : ''}>${esc(e.label)}</option>`).join('');
      return g ? `<optgroup label="${esc(g)}">${opsi}</optgroup>` : opsi;
    })
    .join('');
  const senin = seninPekan(k.tanggal, n);
  const rentangPekan = `Pekan ${tglPendek(senin)} – ${tglPendek(tambahHari(senin, n - 1))}`;
  const chipHari = (pilihHari: boolean) => Array.from({ length: n }, (_, i) => {
    const tgl = tambahHari(senin, i);
    const aktif = pilihHari ? k.hariSemua === i : tgl === k.tanggal;
    const aksi = pilihHari ? `data-aksi="hariSemua" data-i="${i}"` : `data-aksi="hari" data-tgl="${tgl}"`;
    return `<button ${aksi} class="flex-1 rounded-xl px-1 py-1.5 text-center ${aktif ? 'bg-[#0d1e33] text-white' : 'bg-white text-slate-700 border border-slate-200'} ${tgl === hariIni && !aktif ? 'ring-2 ring-[#2347b8]/40' : ''}"><div class="text-[11px] font-semibold">${esc(NAMA_HARI[i]?.slice(0, 3) ?? '')}</div><div class="text-sm font-bold tabular-nums">${Number(tgl.slice(8))}</div></button>`;
  }).join('');
  const diperbarui = t.diterapkan ? new Date(t.diterapkan).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' }) : '';
  const seg = (aksi: string, atr: string, aktif: boolean, label: string) => `<button data-aksi="${aksi}" ${atr} class="flex-1 whitespace-nowrap px-2 py-2 text-sm font-semibold ${aktif ? 'bg-[#0d1e33] text-white' : 'bg-white text-slate-700'}">${label}</button>`;
  const segTab = (v: Tab, label: string) => seg('tab', `data-tab="${v}"`, k.tab === v, label);
  const segBaris = (m: ModeP) => seg('baris', `data-mode="${m}"`, k.baris === m, NAMA_MODE[m]);
  const segZoom = (z: Zoom, label: string) => seg('zoom', `data-zoom="${z}"`, k.zoom === z, label);
  const segTata = (v: 'hari' | 'pekan', label: string) => seg('tata', `data-tata="${v}"`, k.tata === v, label);
  const panah = (aksi: string, simbol: string, label: string) => `<button data-aksi="${aksi}" class="h-10 w-10 shrink-0 rounded-xl border border-slate-300 bg-white text-lg" aria-label="${label}">${simbol}</button>`;
  const judulTgl = !semua && k.tata === 'hari' ? `${NAMA_HARI[hariPekan(k.tanggal)] ?? ''}, ${tglPanjang(k.tanggal)}` : rentangPekan;
  const tombolTgl = `<div class="flex items-center gap-2">${panah('mundur', '‹', 'Sebelumnya')}
        <label class="relative min-w-0 flex-1 cursor-pointer rounded-xl border border-slate-300 bg-white px-3 py-2 text-center text-sm font-semibold"><span class="block truncate">${esc(judulTgl)}</span><input id="tgl" type="date" value="${k.tanggal}" class="absolute inset-0 h-full w-full opacity-0" aria-label="Pilih tanggal"></label>
        ${panah('maju', '›', 'Berikutnya')}</div>`;

  const barisTab = `<div class="flex overflow-hidden rounded-xl border border-slate-300">${segTab('semua', 'Semua')}${segTab('rombel', 'Kelas')}${segTab('guru', 'Guru')}${segTab('ruang', 'Ruang')}${segTab('kalender', 'Kalender')}</div>`;
  const kontrol = kalender
    ? barisTab
    : semua
    ? `${barisTab}
       <div class="flex items-center gap-2"><span class="text-xs font-medium text-slate-500">Baris:</span><div class="flex flex-1 overflow-hidden rounded-xl border border-slate-300">${segBaris('rombel')}${segBaris('guru')}${segBaris('ruang')}</div></div>
       ${tombolTgl}
       <div class="flex items-center gap-2"><button data-aksi="hariIni" class="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium">Pekan ini</button>
         <div class="ml-auto flex overflow-hidden rounded-xl border border-slate-300">${segZoom('peta', 'Peta')}${segZoom('sedang', 'Sedang')}${segZoom('besar', 'Besar')}</div></div>
       <div class="flex gap-1.5"><button data-aksi="hariSemua" data-i="-1" class="rounded-xl px-2 py-1.5 text-xs font-semibold ${k.hariSemua < 0 ? 'bg-[#0d1e33] text-white' : 'border border-slate-200 bg-white text-slate-700'}">Semua<br>hari</button>${chipHari(true)}</div>`
    : `${barisTab}
       <div class="flex items-center gap-2">${panah('sebelumnya', '‹', `${NAMA_MODE[mode]} sebelumnya`)}<select id="pilih" class="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base font-medium" aria-label="Pilih ${NAMA_MODE[mode]}">${pilihan}</select>${panah('berikutnya', '›', `${NAMA_MODE[mode]} berikutnya`)}</div>
       ${tombolTgl}
       <div class="flex items-center gap-2"><button data-aksi="hariIni" class="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium">Hari ini</button>
         <div class="ml-auto flex overflow-hidden rounded-xl border border-slate-300">${segTata('hari', 'Per hari')}${segTata('pekan', 'Per pekan')}</div></div>
       ${k.tata === 'hari' ? `<div class="flex gap-1.5">${chipHari(false)}</div>` : ''}`;

  const isi = kalender ? gambarKalender(p, k.bulan ?? k.tanggal.slice(0, 7), k.tanggal, hariIni) : semua ? tabelSemua(p, k, hariIni, lebar) : k.tata === 'hari' ? tampilanHari(p, k, hariIni) : tabelPekan(p, k, hariIni);
  const lebarMaks = semua ? 'max-w-5xl' : 'max-w-3xl';
  return `<header class="border-b border-slate-200 bg-white">
      <div class="mx-auto flex ${lebarMaks} items-center gap-3 px-4 py-3">
        <div class="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#0d1e33]"><svg width="22" height="22" viewBox="0 0 22 22"><rect x="2" y="12" width="4" height="8" rx="1.5" fill="#f5b21a"/><rect x="9" y="7" width="4" height="13" rx="1.5" fill="#157f6e"/><rect x="16" y="2" width="4" height="18" rx="1.5" fill="#2347b8"/></svg></div>
        <div class="min-w-0 flex-1"><div class="text-[11px] font-semibold tracking-widest text-amber-600">SMK NEGERI BANSARI</div><div class="truncate text-base font-bold leading-tight">Jadwal Pelajaran</div></div>
        ${kalender ? '' : `<button data-aksi="cetakBuka" class="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-300 bg-white text-slate-700" aria-label="Cetak jadwal" title="Cetak jadwal">${IKON_CETAK}</button>`}</div></header>
    <div class="border-b border-slate-200 bg-stone-100"><div class="mx-auto ${lebarMaks} space-y-2 px-4 py-2.5">${kontrol}</div></div>
    <main class="mx-auto ${lebarMaks} px-4 py-4">${isi}</main>
    <footer class="mx-auto ${lebarMaks} px-4 pb-8 pt-2 text-center text-[11px] text-slate-500">${diperbarui ? `Jadwal diperbarui ${esc(diperbarui)} WIB · ` : ''}<a class="underline" href="#/admin">Admin</a></footer>
    <div id="rincian"></div><div id="dialogCetak"></div>`;
}

/** Mengambil dan membaca data terbit. */
export async function muatTerbit(ambil: typeof fetch = fetch, alamat = './terbit/jadwal.json'): Promise<{ ok: true; terbit: Terbit } | { ok: false; galat: string }> {
  try {
    const r = await ambil(alamat, { cache: 'no-cache' });
    if (r.status === 404) return { ok: false, galat: 'Jadwal belum diterbitkan.' };
    if (!r.ok) return { ok: false, galat: `Jadwal tidak bisa dimuat (kode ${r.status}).` };
    return bacaTerbit(await r.text());
  } catch {
    return { ok: false, galat: 'Jadwal tidak bisa dimuat. Periksa koneksi internet, lalu muat ulang halaman.' };
  }
}

export async function mulaiPublik(akar: HTMLElement, ambil: typeof fetch = fetch): Promise<void> {
  akar.innerHTML = '<div class="grid min-h-screen place-items-center text-sm text-slate-500">Memuat jadwal…</div>';
  const h = await muatTerbit(ambil);
  if (!h.ok) {
    akar.innerHTML = `<div class="mx-auto max-w-md px-4 py-16 text-center"><div class="text-lg font-bold">Jadwal Pelajaran · SMK Negeri Bansari</div><p class="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">${esc(h.galat)}</p><p class="mt-6 text-[11px] text-slate-500"><a class="underline" href="#/admin">Admin</a></p></div>`;
    return;
  }
  const t = h.terbit;
  const p = t.proyek;
  const n = p.polaReguler.length;
  const hariIni = isoLokal(new Date());
  const pilih = bacaPilihan();
  const k: Keadaan = {
    tab: pilih.tab ?? 'semua',
    baris: pilih.baris ?? 'rombel',
    id: pilih.id ?? '',
    tanggal: pilih.tanggal ?? hariKerjaTerdekat(hariIni, n),
    tata: pilih.tata ?? 'hari',
    zoom: pilih.zoom ?? 'sedang',
    hariSemua: pilih.hariSemua !== undefined && pilih.hariSemua < n ? pilih.hariSemua : -1,
    ...(pilih.bulan ? { bulan: pilih.bulan } : {}),
  };
  const modeAktif = (): ModeP => (k.tab === 'semua' || k.tab === 'kalender' ? k.baris : k.tab);
  const rapikan = () => {
    const daftar = daftarEntitasP(p, modeAktif());
    if (!daftar.some((e) => e.id === k.id)) k.id = daftar[0]?.id ?? '';
    if (k.tab !== 'semua' && k.tab !== 'kalender' && k.tata === 'hari' && hariPekan(k.tanggal) >= n) k.tanggal = hariKerjaTerdekat(k.tanggal, n);
  };
  const gambar = () => {
    rapikan();
    const matriks = document.getElementById('matriks');
    const kiri = matriks?.scrollLeft ?? 0;
    const atas = matriks?.scrollTop ?? 0;
    const yHalaman = window.scrollY;
    akar.innerHTML = gambarHalaman(t, k, hariIni, window.innerWidth);
    const baru = document.getElementById('matriks');
    if (baru) {
      baru.scrollLeft = kiri;
      baru.scrollTop = atas;
    }
    window.scrollTo(0, yHalaman);
    simpanPilihan(k);
  };
  const geser = (arah: 1 | -1) => {
    const daftar = daftarEntitasP(p, modeAktif());
    if (!daftar.length) return;
    const i = daftar.findIndex((e) => e.id === k.id);
    k.id = (daftar[(i + arah + daftar.length) % daftar.length] as { id: string }).id;
  };
  const langkah = (arah: 1 | -1) => {
    k.tanggal = k.tab !== 'semua' && k.tab !== 'kalender' && k.tata === 'hari' ? langkahHari(k.tanggal, arah, n) : tambahHari(k.tanggal, 7 * arah);
  };

  let cetak: KeadaanCetak | null = null;
  const gambarDialog = () => {
    const el = document.getElementById('dialogCetak');
    if (el && cetak) el.innerHTML = htmlDialogCetak(cetak, { semua: k.tab === 'semua', jenis: NAMA_MODE[modeAktif()].toLowerCase() });
  };
  const tutupDialog = () => {
    const el = document.getElementById('dialogCetak');
    if (el) el.innerHTML = '';
  };

  akar.addEventListener('click', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-aksi]');
    if (!el) return;
    const d = el.dataset;
    const sheet = document.getElementById('rincian');
    switch (d.aksi) {
      case 'det': {
        const mode = modeAktif();
        if (sheet) sheet.innerHTML = htmlRincian(p, mode, d.id as string, d.tgl as string, Number(d.a));
        return;
      }
      case 'tutupRincian':
        if (sheet) sheet.innerHTML = '';
        return;
      case 'tab':
        k.tab = d.tab as Tab;
        if (k.tab !== 'semua' && k.tab !== 'kalender') k.id = '';
        if (k.tab === 'kalender') k.bulan = k.tanggal.slice(0, 7);
        break;
      case 'kalPilih': k.tanggal = d.tgl as string; break;
      case 'kalBulan':
        k.bulan = d.bulan as string;
        k.tanggal = d.tgl ?? `${d.bulan}-01`;
        break;
      case 'kalKeJadwal':
        k.tab = 'semua';
        k.hariSemua = -1;
        k.tanggal = hariKerjaTerdekat(d.tgl as string, n);
        gambar();
        window.scrollTo(0, 0);
        return;
      case 'kalLihatHari':
        k.tab = 'semua';
        k.tanggal = d.tgl as string;
        k.hariSemua = hariPekan(k.tanggal);
        gambar();
        window.scrollTo(0, 0);
        return;
      case 'cetakBuka': {
        const semuaTab = k.tab === 'semua';
        if (!cetak || (semuaTab ? cetak.lingkup === 'satu' : cetak.lingkup === 'rekap')) cetak = { lingkup: semuaTab ? 'rekap' : 'satu', gaya: cetak?.gaya ?? 'bawaan', kertas: cetak?.kertas ?? 'A4', status: 'pilih' };
        else cetak = { ...cetak, status: 'pilih' };
        gambarDialog();
        return;
      }
      case 'cetakTutup':
        tutupDialog();
        return;
      case 'cetakPilih': {
        if (!cetak) return;
        if (d.kunci === 'lingkup') cetak.lingkup = d.nilai as Lingkup;
        else if (d.kunci === 'gaya') cetak.gaya = d.nilai as Gaya;
        else if (d.kunci === 'kertas') cetak.kertas = d.nilai as UkuranKertas;
        cetak.status = 'pilih';
        delete cetak.url;
        gambarDialog();
        return;
      }
      case 'cetakBuat': {
        if (!cetak) return;
        cetak.status = 'membuat';
        gambarDialog();
        const pilihan = { ...cetak };
        // beri kesempatan layar menampilkan "Membuat PDF…" sebelum perhitungan
        setTimeout(() => {
          if (!cetak) return;
          try {
            const mode = modeAktif();
            const diperbarui = t.diterapkan ? new Date(t.diterapkan).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' }) : '';
            const byte = buatPdf(p, { mode, lingkup: pilihan.lingkup, id: k.id, tanggal: k.tanggal, gaya: pilihan.gaya, kertas: pilihan.kertas, diperbarui });
            if (cetak.url) URL.revokeObjectURL(cetak.url);
            cetak = { ...cetak, status: 'selesai', url: URL.createObjectURL(new Blob([byte], { type: 'application/pdf' })), berkas: namaBerkas(pilihan.lingkup, mode, k.tanggal), halaman: (new TextDecoder('latin1').decode(byte).match(/\/Type \/Page /g) ?? []).length };
          } catch (err) {
            cetak = { ...cetak, status: 'galat', galat: err instanceof Error ? err.message : String(err) };
          }
          gambarDialog();
        }, 30);
        return;
      }
      case 'baris': k.baris = d.mode as ModeP; break;
      case 'zoom': k.zoom = d.zoom as Zoom; break;
      case 'tata': k.tata = d.tata as 'hari' | 'pekan'; break;
      case 'hari': k.tanggal = d.tgl as string; break;
      case 'hariSemua': k.hariSemua = Number(d.i); break;
      case 'hariIni': k.tanggal = k.tab !== 'semua' && k.tata === 'hari' ? hariKerjaTerdekat(hariIni, n) : hariIni; break;
      case 'maju': langkah(1); break;
      case 'mundur': langkah(-1); break;
      case 'berikutnya': geser(1); break;
      case 'sebelumnya': geser(-1); break;
      default: return;
    }
    gambar();
  });
  akar.addEventListener('change', (e) => {
    const el = e.target as HTMLInputElement;
    if (el.id === 'pilih') k.id = el.value;
    else if (el.id === 'tgl' && /^\d{4}-\d{2}-\d{2}$/.test(el.value)) k.tanggal = el.value;
    else return;
    gambar();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const sheet = document.getElementById('rincian');
      if (sheet) sheet.innerHTML = '';
      tutupDialog();
    }
  });
  gambar();
}
