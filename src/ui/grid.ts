import type { Beban, Proyek, Slot } from '../model/tipe';
import { NAMA_HARI } from '../model/tipe';
import { hitungSkema, kapasitasKbm } from '../model/skema';
import type { BarisHitung } from '../model/skema';
import type { Skema } from '../model/tipe';
import { selisihKapasitas } from '../model/kalender';
import { susunBlok, potongBlok } from '../mesin/blok';
import type { Blok } from '../mesin/blok';
import { cekPenempatan, rencanaPindah, terapkanRencana } from '../mesin/penempatan';
import { jpRombel } from '../model/jp';
import { esc, opsi, tambahHari, tanggalPendek, warnaMapel } from './util';
import { modelWarisan, terdampak } from '../model/simpul';
import { jepitTanggal } from './hub';
import type { Konteks, ModeLihat } from './konteks';

const LABEL_SUMBER = { manual: 'manual', kegiatan: 'kalender', reguler: 'reguler' } as const;
const NAMA_ENTITAS: Record<ModeLihat, { per: string; judul: string }> = {
  rombel: { per: 'kelas', judul: 'Kelas' },
  guru: { per: 'guru', judul: 'Guru' },
  ruang: { per: 'ruang', judul: 'Ruang' },
};
const MODE: { id: ModeLihat; label: string }[] = [
  { id: 'rombel', label: 'Rombel' },
  { id: 'guru', label: 'Guru' },
  { id: 'ruang', label: 'Ruang' },
];

interface Peta {
  beban: Map<string, Beban>;
  guru: Map<string, string>;
  mapel: Map<string, string>;
  rombel: Map<string, string>;
  ruang: Map<string, string>;
}
function petaKode(p: Proyek): Peta {
  return {
    beban: new Map(p.beban.map((b) => [b.id, b])),
    guru: new Map(p.master.guru.map((g) => [g.id, g.kode])),
    mapel: new Map(p.master.mapel.map((m) => [m.id, m.kode])),
    rombel: new Map(p.master.rombel.map((r) => [r.id, r.kode])),
    ruang: new Map(p.master.ruang.map((r) => [r.id, r.kode])),
  };
}

export function daftarEntitas(p: Proyek, mode: ModeLihat): { id: string; label: string }[] {
  if (mode === 'rombel') return p.master.rombel.map((r) => ({ id: r.id, label: r.kode }));
  if (mode === 'guru') return p.master.guru.map((g) => ({ id: g.id, label: `${g.kode} · ${g.nama}` }));
  return p.master.ruang.map((r) => ({ id: r.id, label: `${r.kode} · ${r.nama}` }));
}

function slotMilik(k: Konteks, pk: Peta): Slot[] {
  const id = k.ui.entitasId;
  return k.turunan.slots.filter((s) => {
    const b = pk.beban.get(s.bebanId);
    if (!b) return false;
    if (k.ui.mode === 'rombel') return b.rombelId === id;
    if (k.ui.mode === 'guru') return b.guruId === id || b.timGuruIds.includes(id);
    return s.ruangId === id;
  });
}

interface Rujukan {
  mapel: string;
  guru: string;
  rombel: string;
  ruang: string[];
  kedua: string;
  lencana: string;
  warna: { bg: string; garis: string };
  cls: string;
  judul: string;
  tanda: boolean;
}

/** Teks dan status satu kartu (gabungan beberapa slot berurutan atau satu slot). */
function rujuk(k: Konteks, pk: Peta, slots: Slot[]): Rujukan | null {
  const s0 = slots[0];
  const b = s0 ? pk.beban.get(s0.bebanId) : undefined;
  if (!s0 || !b) return null;
  const mapel = pk.mapel.get(b.mapelId) ?? '?';
  const guru = [b.guruId, ...b.timGuruIds].map((g) => pk.guru.get(g) ?? '?').join('+');
  const rombel = pk.rombel.get(b.rombelId) ?? '?';
  const ruang = [...new Set(slots.map((s) => pk.ruang.get(s.ruangId) ?? '—'))];
  const ms = slots.flatMap((s) => k.turunan.peta.get(s.id) ?? []);
  const wajib = ms.filter((m) => m.kategori === 'bentrok' || m.kategori === 'aturan');
  const [kedua, lencana] =
    k.ui.mode === 'rombel' ? [guru, ruang.join('·')] : k.ui.mode === 'guru' ? [rombel, ruang.join('·')] : [rombel, guru];
  const judul = ms.length ? [...new Set(ms.map((m) => m.pesan))].join('\n') : `${rombel} · ${mapel} · ${guru} · ${ruang.join('/')}`;
  return {
    mapel, guru, rombel, ruang, kedua, lencana,
    warna: warnaMapel(mapel),
    cls: wajib.length ? 'bermasalah' : ms.length ? 'peringatan' : '',
    judul,
    tanda: wajib.length > 0,
  };
}

const atrSeret = (slots: Slot[]): string =>
  `draggable="true" data-seret="slot" data-slot-id="${esc(slots[0]?.id ?? '')}" data-slot-ids="${esc(slots.map((s) => s.id).join(','))}"`;

/** Kartu kecil untuk satu slot (dipakai di tampungan). */
function chipSederhana(k: Konteks, pk: Peta, s: Slot): string {
  const r = rujuk(k, pk, [s]);
  if (!r) return '';
  return `<div class="chip ${r.cls}" style="--bg:${r.warna.bg};--garis:${r.warna.garis}" title="${esc(r.judul)}" data-aksi="slotDetail" data-slot="${esc(s.id)}" ${atrSeret([s])}>
    <b>${esc(r.mapel)}</b><span class="text-slate-600">${esc(r.kedua)}</span><span class="lencana-ruang ml-auto">${esc(r.lencana)}</span></div>`;
}

export function sisaJp(slots: Slot[], b: Beban): number {
  return b.jp - slots.filter((s) => s.bebanId === b.id).length;
}

function kartuBeban(pk: Peta, b: Beban, sisa: number): string {
  const mapel = pk.mapel.get(b.mapelId) ?? '?';
  const w = warnaMapel(mapel);
  const guru = [b.guruId, ...b.timGuruIds].map((g) => pk.guru.get(g) ?? '?').join('+');
  const rombel = pk.rombel.get(b.rombelId) ?? '?';
  const seret = sisa > 0 && !b.nonTatapMuka;
  return `<div class="chip !mb-1 !px-2 !py-1 !text-xs ${seret ? '' : 'opacity-60'}" style="--bg:${w.bg};--garis:${w.garis}" ${seret ? `draggable="true" data-seret="beban" data-beban-id="${esc(b.id)}"` : ''}>
    <b>${esc(mapel)}</b><span class="text-slate-600">${esc(rombel)} · ${esc(guru)}${b.paralel ? ` · paralel ${esc(b.paralel)}` : ''}</span>
    <span class="ml-auto rounded bg-white/80 px-1 font-semibold">${b.nonTatapMuka ? 'non-tatap-muka' : `sisa ${sisa}`}</span></div>`;
}

interface InfoHari {
  skema: Skema | undefined;
  baris: BarisHitung[];
  kap: number;
  /** nomor pelajaran -> waktu */
  waktu: Map<number, { mulai: string; selesai: string; kegiatan: string }>;
  /** istirahat yang jatuh setelah nomor pelajaran tertentu (0 = sebelum pelajaran pertama) */
  istirahat: Map<number, { kegiatan: string; mulai: string; selesai: string }>;
}

function infoHari(k: Konteks): InfoHari[] {
  const skemaById = new Map(k.p.skema.map((s) => [s.id, s]));
  return k.turunan.hari.map((h) => {
    const skema = h.info.skemaId ? skemaById.get(h.info.skemaId) : undefined;
    const baris = skema ? hitungSkema(skema) : [];
    const waktu: InfoHari['waktu'] = new Map();
    const istirahat: InfoHari['istirahat'] = new Map();
    let terakhir = 0;
    for (const b of baris) {
      if (b.nomorKbm === null) istirahat.set(terakhir, { kegiatan: b.baris.kegiatan, mulai: b.mulai, selesai: b.selesai });
      else {
        waktu.set(b.nomorKbm, { mulai: b.mulai, selesai: b.selesai, kegiatan: b.baris.kegiatan });
        terakhir = b.nomorKbm;
      }
    }
    return { skema, baris, kap: skema ? kapasitasKbm(skema) : 0, waktu, istirahat };
  });
}

function kepalaHari(k: Konteks, i: number, ih: InfoHari): string {
  const h = k.turunan.hari[i];
  if (!h) return '';
  const nama = `${NAMA_HARI[i]} <span class="text-xs font-normal opacity-80">${tanggalPendek(h.tgl)}</span>`;
  if (!ih.skema) {
    const alasan = h.info.alasan === 'libur' ? `Libur: ${esc(h.info.kegiatanLibur ?? '')}` : 'Tidak ada KBM';
    return `<div class="font-semibold">${nama}</div><div class="text-xs opacity-90">${alasan}</div>`;
  }
  return `<div class="font-semibold">${nama}</div><div class="text-xs opacity-90">${esc(ih.skema.nama)} · ${LABEL_SUMBER[h.info.sumber ?? 'reguler']}</div>`;
}

const H_JAM = 60;
const H_ISTIRAHAT = 26;
const H_PAGI = 34;

/**
 * Tampilan satu entitas: kolom = hari. Baris pelajaran sejajar antar hari; istirahat punya baris sendiri
 * (hanya hari yang beristirahat di titik itu yang menampilkannya). Kartu = satu beban pada satu hari dengan JP berurutan;
 * bila terpotong istirahat, kartu tampil terpisah di kedua sisi istirahat.
 */
function tabelPekan(k: Konteks, pk: Peta, milik: Slot[]): string {
  const ih = infoHari(k);
  const maks = Math.max(0, ...ih.map((x) => x.kap));
  const adaNol = ih.some((x) => x.waktu.has(0));
  const awal = adaNol ? 0 : 1;
  const rombelMode = k.ui.mode === 'rombel';

  // geometri baris bersama
  const top = new Map<number, number>();
  const tinggi = new Map<number, number>();
  const topIst = new Map<number, number>();
  const labelBaris: string[] = [];
  let y = 0;
  for (let n = awal; n <= maks; n++) {
    const h = n === 0 ? H_PAGI : H_JAM;
    top.set(n, y);
    tinggi.set(n, h);
    labelBaris.push(`<div class="label-jam" style="top:${y}px;height:${h}px">${n === 0 ? 'Pagi' : `Jam ${n}`}</div>`);
    y += h;
    if (ih.some((x) => x.istirahat.has(n) && n < x.kap)) {
      topIst.set(n, y);
      labelBaris.push(`<div class="label-istirahat" style="top:${y}px;height:${H_ISTIRAHAT}px">Istirahat</div>`);
      y += H_ISTIRAHAT;
    }
  }
  const total = y;
  const batas = (n: number) => (top.get(n) ?? 0) + (tinggi.get(n) ?? 0);

  const kepala = ih
    .map((x, i) => `<div class="px-2 py-2 text-white" style="background:${esc(x.skema?.warna ?? '#64748b')}">${kepalaHari(k, i, x)}</div>`)
    .join('');

  const kolom = ih
    .map((x, i) => {
      if (!x.skema) return `<div class="relative bg-slate-100 p-3 text-sm text-slate-500" style="height:${total}px">Tidak ada KBM</div>`;
      const lapis: string[] = [];
      // sel pelajaran (sasaran lepas) dan baris istirahat
      for (let n = awal; n <= maks; n++) {
        const t = top.get(n) ?? 0;
        const h = tinggi.get(n) ?? 0;
        const w = x.waktu.get(n);
        if (n > x.kap) lapis.push(`<div class="absolute inset-x-0 bg-slate-50" style="top:${t}px;height:${h}px"></div>`);
        else if (n === 0) lapis.push(`<div class="absolute inset-x-0 px-2 pt-1 text-xs italic text-slate-500" style="top:${t}px;height:${h}px;background:${esc(x.skema.warna)}12">${w ? `${w.mulai}–${w.selesai} · ${esc(w.kegiatan)}` : ''}</div>`);
        else {
          const kosongKlik = rombelMode;
          lapis.push(`<div class="sel ${kosongKlik ? 'sel-kosong' : ''}" style="top:${t}px;height:${h}px" data-sel="1" data-hari="${i}" data-jam="${n}" ${kosongKlik ? 'data-aksi="selKosong"' : ''}><span class="waktu-sel">${w ? `${w.mulai}–${w.selesai}` : ''}</span>${kosongKlik ? '<span class="plus">＋</span>' : ''}</div>`);
        }
        const ist = x.istirahat.get(n);
        const ty = topIst.get(n);
        if (ist && ty !== undefined && n < x.kap) lapis.push(`<div class="strip-istirahat" style="top:${ty}px;height:${H_ISTIRAHAT}px">${esc(ist.kegiatan)} · ${ist.mulai}–${ist.selesai}</div>`);
      }
      // kartu
      const bagian: { a: number; b: number; blok: Blok; ke: number; dari: number }[] = [];
      for (const blok of susunBlok(milik.filter((s) => s.hari === i && s.jam >= 1 && s.jam <= x.kap))) {
        const pot = potongBlok(blok, new Set([...x.istirahat.keys()]));
        pot.forEach((q, ke) => bagian.push({ a: q.a, b: q.b, blok, ke, dari: pot.length }));
      }
      bagian.sort((p1, p2) => p1.a - p2.a || p2.b - p1.b);
      // jalur: bagian yang tumpang tindih berdampingan
      const jalur = new Map<(typeof bagian)[number], [number, number]>();
      let gugus: (typeof bagian)[number][] = [];
      let akhirJalur: number[] = [];
      let maksB = -1;
      const tutup = () => {
        for (const g of gugus) jalur.set(g, [jalur.get(g)?.[0] ?? 0, akhirJalur.length]);
        gugus = [];
        akhirJalur = [];
        maksB = -1;
      };
      for (const b of bagian) {
        if (gugus.length && b.a > maksB) tutup();
        let l = akhirJalur.findIndex((e) => e < b.a);
        if (l < 0) {
          l = akhirJalur.length;
          akhirJalur.push(b.b);
        } else akhirJalur[l] = b.b;
        maksB = Math.max(maksB, b.b);
        gugus.push(b);
        jalur.set(b, [l, 0]);
      }
      tutup();
      for (const b of bagian) {
        const slotsB = b.blok.slots.filter((s) => s.jam >= b.a && s.jam <= b.b);
        const r = rujuk(k, pk, slotsB);
        if (!r) continue;
        const [l, n] = jalur.get(b) ?? [0, 1];
        const t = top.get(b.a) ?? 0;
        const tinggiKartu = batas(b.b) - t;
        const wa = x.waktu.get(b.a);
        const wb = x.waktu.get(b.b);
        const jp = slotsB.length;
        const info = `${jp} JP${b.dari > 1 ? ` · bagian ${b.ke + 1}/${b.dari}` : ''}`;
        lapis.push(`<div class="chip chip-besar kartu-slot ${r.cls}" style="--bg:${r.warna.bg};--garis:${r.warna.garis};top:${t + 2}px;height:${tinggiKartu - 4}px;left:calc(${(l * 100) / n}% + 2px);width:calc(${100 / n}% - 4px)" title="${esc(r.judul)}${b.dari > 1 ? '\nTerpotong istirahat; seret untuk memindah seluruh blok.' : ''}" data-aksi="slotDetail" data-slot="${esc(slotsB[0]?.id ?? '')}" ${atrSeret(b.blok.slots)}>
          <div class="flex w-full items-center justify-between gap-1"><b class="text-[13px]">${esc(r.mapel)}</b>${r.tanda ? '<span class="text-red-600">⚠</span>' : ''}<span class="lencana-ruang">${esc(r.lencana)}</span></div>
          <div class="truncate text-[11px] text-slate-600">${esc(r.kedua)}</div>
          <div class="text-[10px] text-slate-500">${info}${wa && wb ? ` · ${wa.mulai}–${wb.selesai}` : ''}</div></div>`);
      }
      return `<div class="relative border-l border-slate-200" style="height:${total}px">${lapis.join('')}</div>`;
    })
    .join('');

  return `<div class="kartu overflow-x-auto"><div class="min-w-[820px]">
    <div class="grid" style="grid-template-columns:64px repeat(${k.turunan.hari.length},minmax(0,1fr))"><div class="bg-slate-800 px-2 py-2 text-xs font-semibold text-white">Jam ke-</div>${kepala}</div>
    <div class="grid" style="grid-template-columns:64px repeat(${k.turunan.hari.length},minmax(0,1fr))"><div class="relative bg-slate-50" style="height:${total}px">${labelBaris.join('')}</div>${kolom}</div></div></div>`;
}

/** Tampilan semua sekaligus: baris = semua rombel/guru/ruang, kolom = hari × pelajaran (istirahat punya kolom sendiri). */
function tabelSemua(k: Konteks, pk: Peta, entitas: { id: string; label: string }[]): string {
  const ih = infoHari(k);
  const peta = new Map<string, Slot[]>();
  const taruh = (id: string, s: Slot) => {
    const key = `${id}|${s.hari}`;
    const l = peta.get(key);
    if (l) l.push(s);
    else peta.set(key, [s]);
  };
  for (const s of k.turunan.slots) {
    const b = pk.beban.get(s.bebanId);
    if (!b) continue;
    if (k.ui.mode === 'rombel') taruh(b.rombelId, s);
    else if (k.ui.mode === 'guru') [b.guruId, ...b.timGuruIds].forEach((g) => taruh(g, s));
    else taruh(s.ruangId, s);
  }
  // kolom tiap hari: pelajaran dan istirahat
  type Kol = { jenis: 'jam'; n: number } | { jenis: 'ist'; setelah: number };
  const kolHari: Kol[][] = ih.map((x) => {
    const daftar: Kol[] = [];
    if (x.istirahat.has(0)) daftar.push({ jenis: 'ist', setelah: 0 });
    for (let n = 1; n <= x.kap; n++) {
      daftar.push({ jenis: 'jam', n });
      if (n < x.kap && x.istirahat.has(n)) daftar.push({ jenis: 'ist', setelah: n });
    }
    return daftar;
  });

  const kepala1 = ih
    .map((x, i) => {
      const h = k.turunan.hari[i];
      const teks = x.skema ? `${NAMA_HARI[i]} ${h ? tanggalPendek(h.tgl) : ''}` : `${NAMA_HARI[i]} · libur`;
      return `<th colspan="${Math.max(1, kolHari[i]?.length ?? 1)}" class="sticky top-0 z-20 border-l-2 border-white px-2 py-1 text-left text-xs font-semibold text-white" style="background:${esc(x.skema?.warna ?? '#64748b')}">${teks}</th>`;
    })
    .join('');
  const kepala2 = ih
    .map((x, i) =>
      x.kap === 0
        ? `<th class="sticky top-[26px] z-20 border-l-2 border-white bg-slate-200"></th>`
        : (kolHari[i] ?? [])
            .map((c, j) =>
              c.jenis === 'jam'
                ? `<th class="sticky top-[26px] z-20 bg-slate-100 text-[10px] font-semibold text-slate-600 ${j === 0 ? 'border-l-2 border-white' : ''}">${c.n}</th>`
                : `<th class="sticky top-[26px] z-20 w-[8px] min-w-[8px] bg-amber-200 text-[8px] font-medium text-amber-800" title="Istirahat"></th>`,
            )
            .join(''),
    )
    .join('');

  const g = k.turunan.periode;
  const warisan = k.ui.mode === 'rombel' && !!g && modelWarisan(g) && k.ui.fokus !== 'induk';
  const tanda = (id: string): string => {
    if (k.ui.mode !== 'rombel') return '';
    if (k.turunan.rombelTidakAktif.has(id)) return ' <span class="text-[9px] font-normal text-slate-400" title="Tidak aktif pada kegiatan ini">off</span>';
    if (warisan && terdampak(g, id)) return ' <span class="text-[9px] font-bold text-amber-600" title="Jadwal khusus kegiatan ini">●</span>';
    return '';
  };
  const barisHtml = entitas
    .map((e) => {
      const fokus = false;
      const sel = ih
        .map((x, i) => {
          if (x.kap === 0) return `<td class="border-l-2 border-white bg-slate-100"></td>`;
          const bloks = susunBlok(peta.get(`${e.id}|${i}`) ?? []);
          const mulaiBlok = new Map<number, Blok>(); // jam -> blok (untuk slot tunggal per jam)
          for (const b of bloks) for (const s of b.slots) mulaiBlok.set(s.jam, b);
          const perJam = (n: number) => (peta.get(`${e.id}|${i}`) ?? []).filter((s) => s.jam === n);
          const kol = kolHari[i] ?? [];
          const out: string[] = [];
          for (let j = 0; j < kol.length; j++) {
            const c = kol[j];
            if (!c) continue;
            const pertama = j === 0 ? 'border-l-2 border-slate-300' : 'border-l border-slate-100';
            if (c.jenis === 'ist') {
              out.push(`<td class="w-[8px] min-w-[8px] max-w-[8px] bg-amber-100"></td>`);
              continue;
            }
            const isi = perJam(c.n);
            const s0 = isi.length === 1 ? isi[0] : undefined;
            // gabungkan jam berurutan (tanpa istirahat di antaranya) untuk beban yang sama
            let lebar = 1;
            if (s0) {
              for (let m = j + 1; m < kol.length; m++) {
                const cm = kol[m];
                if (!cm || cm.jenis !== 'jam') break;
                const sm = perJam(cm.n);
                if (sm.length === 1 && sm[0]?.bebanId === s0.bebanId) lebar += 1;
                else break;
              }
            }
            const blok = s0 ? mulaiBlok.get(s0.jam) : undefined;
            const slotsKartu = s0 && lebar > 1 ? isi.concat(...Array.from({ length: lebar - 1 }, (_, d) => perJam(c.n + d + 1))) : isi;
            const bagian = (s0 && blok ? blok.slots : isi);
            const chips = (s0 ? [slotsKartu] : isi.map((s) => [s]))
              .map((grup) => {
                const r = rujuk(k, pk, grup);
                if (!r) return '';
                return `<div class="chip chip-mini ${r.cls}" style="--bg:${r.warna.bg};--garis:${r.warna.garis}" title="${esc(r.judul)}" data-aksi="slotDetail" data-slot="${esc(grup[0]?.id ?? '')}" ${atrSeret(s0 && blok ? bagian : grup)}><b>${esc(r.mapel)}</b><span>${esc(r.kedua)}</span><span class="text-slate-500">${esc(r.lencana)}</span>${r.tanda ? '<span class="text-red-600">⚠</span>' : ''}</div>`;
              })
              .join('');
            out.push(`<td ${lebar > 1 ? `colspan="${lebar}"` : ''} class="sel-mx ${pertama}" ${lebar > 1 ? 'style="max-width:none;width:auto"' : ''} data-sel="1" data-hari="${i}" data-jam="${c.n}" data-baris="${esc(e.id)}">${chips}</td>`);
            j += lebar - 1;
          }
          return out.join('');
        })
        .join('');
      return `<tr class="border-t border-slate-200 ${fokus ? 'bg-sky-50' : ''}"><th class="label-baris ${fokus ? '!bg-sky-100' : ''}" data-aksi="fokus" data-id="${esc(e.id)}" title="Klik untuk membuka tampilan per ${NAMA_ENTITAS[k.ui.mode].per} ini" data-buka="1">${esc(e.label)}${tanda(e.id)}</th>${sel}</tr>`;
    })
    .join('');
  return `<div class="kartu max-h-[72vh] overflow-auto"><table class="border-collapse">
    <thead><tr><th rowspan="2" class="sticky left-0 top-0 z-30 bg-slate-800 px-2 text-left text-xs font-semibold text-white">${MODE.find((m) => m.id === k.ui.mode)?.label}</th>${kepala1}</tr><tr>${kepala2}</tr></thead>
    <tbody>${barisHtml}</tbody></table></div>`;
}

export function renderGrid(k: Konteks): string {
  const p = k.p;
  const t = k.turunan;
  const pk = petaKode(p);
  const skemaById = new Map(p.skema.map((s) => [s.id, s]));
  const entitas = daftarEntitas(p, k.ui.mode);
  const milik = slotMilik(k, pk);
  const rombelMode = k.ui.mode === 'rombel';
  const semua = k.ui.tata === 'semua';
  const idxEntitas = entitas.findIndex((e) => e.id === k.ui.entitasId);

  const kontrol = `<div class="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
    <div class="inline-flex rounded-lg border border-slate-300 bg-white p-0.5">${MODE.map((m) => `<button class="rounded-md px-3 py-1 text-sm font-medium ${m.id === k.ui.mode ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}" data-aksi="mode" data-mode="${m.id}">${m.label}</button>`).join('')}</div>
    <div class="inline-flex rounded-lg border border-slate-300 bg-white p-0.5" title="Pilih cara melihat jadwal">${(
      [['hari', `Per ${NAMA_ENTITAS[k.ui.mode].per}`], ['semua', 'Semua']] as const
    ).map(([id, label]) => `<button class="rounded-md px-3 py-1 text-sm font-medium ${id === k.ui.tata ? 'bg-sky-600 text-white' : 'text-slate-600 hover:bg-slate-100'}" data-aksi="tata" data-tata="${id}">${label}</button>`).join('')}</div>
    ${semua ? '' : `<div class="flex items-center gap-1"><span class="text-sm text-slate-600">${NAMA_ENTITAS[k.ui.mode].judul}</span>
      <button class="tombol !px-2" data-aksi="geserEntitas" data-arah="-1" ${idxEntitas <= 0 ? 'disabled' : ''} title="${NAMA_ENTITAS[k.ui.mode].judul} sebelumnya">◀</button>
      <select id="entitas" class="isian min-w-44">${opsi(entitas, k.ui.entitasId, (e) => e.id, (e) => e.label)}</select>
      <button class="tombol !px-2" data-aksi="geserEntitas" data-arah="1" ${idxEntitas < 0 || idxEntitas >= entitas.length - 1 ? 'disabled' : ''} title="${NAMA_ENTITAS[k.ui.mode].judul} berikutnya">▶</button></div>`}
    <div class="ml-auto flex items-center gap-1">
      <button class="tombol" data-aksi="pekan" data-tgl="${tambahHari(t.senin, -7)}" title="Pekan sebelumnya">◀</button>
      <label class="text-sm text-slate-600">Pekan <input type="date" id="tanggal" class="isian" value="${k.ui.tanggal}"></label>
      <button class="tombol" data-aksi="pekan" data-tgl="${tambahHari(t.senin, 7)}" title="Pekan berikutnya">▶</button></div></div>`;

  const kapPekan = t.skemaPerHari.map((id) => (id && skemaById.get(id) ? kapasitasKbm(skemaById.get(id)!) : 0));
  const total = kapPekan.reduce((a, b) => a + b, 0);
  const lencana: string[] = [`<span class="lencana bg-slate-200 text-slate-700">Kapasitas pekan ini ${kapPekan.join('+')} = <b>${total} JP</b></span>`];

  // daftar beban yang masih perlu ditempatkan (rombel atau guru yang sedang dipilih)
  const bebanFokus =
    k.ui.mode === 'rombel' ? t.beban.filter((b) => b.rombelId === k.ui.entitasId)
    : k.ui.mode === 'guru' ? t.beban.filter((b) => b.guruId === k.ui.entitasId)
    : [];
  if (rombelMode && !semua) {
    const rombel = p.master.rombel.find((r) => r.id === k.ui.entitasId);
    const butuh = jpRombel(bebanFokus);
    const jadi = new Set(milik.map((s) => { const par = pk.beban.get(s.bebanId)?.paralel; return par ? `${par}|${s.hari}|${s.jam}` : s.id; })).size;
    lencana.push(`<span class="lencana ${jadi >= butuh ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">Terjadwal ${jadi} dari ${butuh} JP</span>`);
    const g = t.periode;
    if (rombel && g && modelWarisan(g) && k.ui.fokus !== 'induk') {
      lencana.push(t.rombelTidakAktif.has(rombel.id)
        ? '<span class="lencana bg-slate-200 text-slate-600">Tidak aktif pada kegiatan ini</span>'
        : terdampak(g, rombel.id)
          ? '<span class="lencana bg-amber-100 text-amber-800" title="Jadwal dan beban khusus kegiatan ini; atur di sub-tab Kelas">● Jadwal khusus kegiatan ini</span>'
          : '<span class="lencana bg-slate-100 text-slate-600" title="Jadwal diambil langsung dari induk. Mengubahnya di sini membuat salinan khusus kegiatan ini.">Ikut jadwal induk</span>');
    }
    if (rombel) for (const s of selisihKapasitas([rombel], { perHari: kapPekan, total })) {
      lencana.push(`<span class="lencana bg-red-100 text-red-800" title="Kebutuhan menurut data sumber dibanding kapasitas pekan ini; diputuskan manual">Sumber: butuh ${s.butuh} JP, kapasitas ${s.kapasitas} → ${s.selisih > 0 ? `kurang ${s.selisih}` : `lebih ${-s.selisih}`}</span>`);
    }
  }

  let aside = '';
  if (k.ui.mode !== 'ruang') {
    const kartuGrup = (daftar: Beban[]) => daftar.map((b) => kartuBeban(pk, b, sisaJp(t.slots, b))).join('');
    let isiBelum: string;
    if (semua) {
      // semua beban aktif yang belum penuh, dikelompokkan per rombel (atau per guru)
      const perlu = t.beban.filter((b) => !b.nonTatapMuka && !t.rombelTidakAktif.has(b.rombelId) && sisaJp(t.slots, b) > 0);
      const grup = new Map<string, Beban[]>();
      for (const b of perlu) {
        const kunci = rombelMode ? b.rombelId : b.guruId;
        const l = grup.get(kunci);
        if (l) l.push(b);
        else grup.set(kunci, [b]);
      }
      const nama = (id: string) => (rombelMode ? pk.rombel.get(id) : pk.guru.get(id)) ?? '?';
      const totalSisa = perlu.reduce((a, b) => a + sisaJp(t.slots, b), 0);
      isiBelum = perlu.length
        ? `<div class="mb-2 text-xs text-slate-500">${totalSisa} JP belum terjadwal di ${grup.size} ${rombelMode ? 'kelas' : 'guru'}. Seret ke baris pemiliknya di grid: hijau = aman, merah = bentrok.</div>
          <div class="max-h-[40vh] space-y-2 overflow-auto pr-1">${[...grup]
            .map(([id, daftar]) => `<div><div class="mb-1 text-[11px] font-semibold text-slate-600">${esc(nama(id))} <span class="font-normal text-slate-400">· sisa ${daftar.reduce((a, b) => a + sisaJp(t.slots, b), 0)} JP</span></div><div class="grid gap-x-2 sm:grid-cols-2 lg:grid-cols-3">${kartuGrup(daftar)}</div></div>`)
            .join('')}</div>`
        : '<div class="rounded-lg bg-emerald-50 p-2 text-sm text-emerald-800">Semua beban sudah terjadwal penuh.</div>';
    } else {
      const belum = bebanFokus.filter((b) => sisaJp(t.slots, b) > 0 || b.nonTatapMuka);
      isiBelum = `<div class="mb-2 text-xs text-slate-500">Seret ke sel di grid: hijau = aman, merah = bentrok (arahkan kursor untuk alasan).${rombelMode ? ' Bisa juga klik sel kosong.' : ''}</div>
        ${belum.length ? kartuGrup(belum) : '<div class="rounded-lg bg-emerald-50 p-2 text-sm text-emerald-800">Semua beban sudah terjadwal penuh.</div>'}`;
    }
    const tamp = rombelMode
      ? (semua ? t.slots : milik).filter((s) => {
          const id = t.skemaPerHari[s.hari];
          const sk = id ? skemaById.get(id) : undefined;
          return !(sk && s.jam >= 1 && s.jam <= kapasitasKbm(sk));
        })
      : [];
    aside = `<aside class="${semua ? 'mt-3 grid gap-3 lg:grid-cols-[2fr_1fr]' : 'space-y-3'}">
      <div class="kartu p-3"><div class="mb-1 text-sm font-semibold">Belum terjadwal</div>${isiBelum}</div>
      ${tamp.length ? `<div class="kartu border-amber-300 bg-amber-50 p-3"><div class="mb-1 text-sm font-semibold">Tampungan (${tamp.length})</div>
        <div class="mb-2 text-xs text-slate-600">Tidak muat pada skema pekan ini. Seret ke sel yang tersedia, atau ganti pola pekan.</div>
        ${tamp.map((s) => `<div class="mb-1 text-[11px] text-slate-500">${NAMA_HARI[s.hari]}, pelajaran ke-${s.jam}</div>${chipSederhana(k, pk, s)}`).join('')}</div>` : ''}
    </aside>`;
  }

  const kosong = entitas.length === 0 ? '<div class="kartu p-6 text-center text-sm text-slate-500">Belum ada data. Tambahkan di tab Master Data.</div>' : '';
  const badan = semua ? tabelSemua(k, pk, entitas) : tabelPekan(k, pk, milik);
  const sisi = semua ? "" : aside;
  return `${kontrol}<div class="mb-3 flex flex-wrap gap-2">${lencana.join('')}</div>${kosong}
    <div class="grid items-start gap-3 ${sisi ? 'xl:grid-cols-[1fr_260px]' : ''}">${badan}${sisi}</div>${semua ? aside : ''}`;
}

// ------------------------------------------------------------------ seret & lepas

export interface HasilSel {
  ok: boolean;
  alasan: string[];
}
export interface PetaSel {
  sel: Map<string, HasilSel>;
  /** Apakah baris (rombel/guru) di tampilan "semua sekaligus" boleh menampung benda yang diseret. */
  pemilik: (barisId: string) => boolean;
}
export const PETA_KOSONG: PetaSel = { sel: new Map(), pemilik: () => true };
export interface Seret {
  bebanId?: string;
  slotId?: string;
  /** seluruh slot satu blok (beberapa JP berurutan) yang diseret bersama */
  slotIds?: string[];
}

/** Menghitung keabsahan tiap sel pekan ini untuk benda yang sedang diseret. */
export function siapkanSeret(k: Konteks, seret: Seret): PetaSel {
  const sel = new Map<string, HasilSel>();
  const skemaById = new Map(k.p.skema.map((s) => [s.id, s]));
  k.turunan.skemaPerHari.forEach((id, hari) => {
    const sk = id ? skemaById.get(id) : undefined;
    if (!sk) return;
    const kap = kapasitasKbm(sk);
    const n = seret.slotIds?.length ?? 1;
    for (let jam = 1; jam <= kap; jam++) {
      if (jam + n - 1 > kap) {
        sel.set(`${hari}:${jam}`, { ok: false, alasan: [`Tidak muat: ${n} JP berurutan dari pelajaran ke-${jam} melewati jam terakhir hari itu.`] });
        continue;
      }
      const r = rencanaPindah(k.p, k.turunan.slots, seret, hari, jam);
      sel.set(`${hari}:${jam}`, { ok: r.ok, alasan: r.alasan });
    }
  });
  const asal = seret.slotId ? k.turunan.slots.find((s) => s.id === seret.slotId) : undefined;
  const b = k.p.beban.find((x) => x.id === (asal ? asal.bebanId : seret.bebanId));
  const mode = k.ui.mode;
  const pemilik = (id: string): boolean => {
    if (!b) return true;
    if (mode === 'rombel') return b.rombelId === id;
    if (mode === 'guru') return b.guruId === id || b.timGuruIds.includes(id);
    return true;
  };
  return { sel, pemilik };
}

/** Hasil untuk satu sel di layar (memperhitungkan baris pada tampilan "semua sekaligus"). */
export function hasilSel(ps: PetaSel, el: HTMLElement): HasilSel | undefined {
  const h = ps.sel.get(`${el.dataset.hari}:${el.dataset.jam}`);
  if (!h) return undefined;
  const baris = el.dataset.baris;
  if (baris && !ps.pemilik(baris)) return { ok: false, alasan: ['Baris ini bukan milik pelajaran yang diseret.'] };
  return h;
}

export function lepas(k: Konteks, seret: Seret, hari: number, jam: number): boolean {
  const r = rencanaPindah(k.p, k.turunan.slots, seret, hari, jam);
  if (!r.ok) {
    k.lapor(r.alasan[0] ?? 'Penempatan ditolak.');
    return false;
  }
  k.ubahSlots((slots) => terapkanRencana(slots, r));
  if (r.tukar) k.lapor('Dua pelajaran bertukar posisi.');
  return true;
}

// ------------------------------------------------------------------ modal & klik

function labelWaktu(k: Konteks, hari: number, jam: number): string {
  const id = k.turunan.skemaPerHari[hari];
  const sk = k.p.skema.find((s) => s.id === id);
  const baris = sk ? hitungSkema(sk).find((b) => b.nomorKbm === jam) : undefined;
  return `${NAMA_HARI[hari]} · pelajaran ke-${jam}${baris ? ` · jam ${baris.label} (${baris.mulai}–${baris.selesai})` : ''}`;
}

export function renderModal(k: Konteks): string {
  const m = k.ui.modal;
  if (!m) return '';
  const pk = petaKode(k.p);
  const tutup = `<button class="tombol" data-aksi="tutupModal">Tutup</button>`;
  if (m.jenis === 'sel') {
    const bebanR = k.turunan.beban.filter((b) => b.rombelId === k.ui.entitasId && !b.nonTatapMuka && sisaJp(k.turunan.slots, b) > 0);
    const baris = bebanR
      .map((b) => {
        const r = rencanaPindah(k.p, k.turunan.slots, { bebanId: b.id }, m.hari, m.jam);
        const mapel = k.p.master.mapel.find((x) => x.id === b.mapelId)?.nama ?? '?';
        const guru = [b.guruId, ...b.timGuruIds].map((g) => pk.guru.get(g) ?? '?').join('+');
        const kiri = `<div class="min-w-0"><div class="truncate text-sm font-medium">${esc(mapel)}</div><div class="text-xs text-slate-500">Guru ${esc(guru)} · sisa ${sisaJp(k.turunan.slots, b)} JP</div></div>`;
        return r.ok
          ? `<div class="flex items-center justify-between gap-3 rounded-lg border border-emerald-300 bg-emerald-50 p-2">${kiri}<button class="tombol-utama shrink-0" data-aksi="tempatkan" data-beban="${esc(b.id)}" data-hari="${m.hari}" data-jam="${m.jam}">Tempatkan${r.ubahan[0]?.ruangId ? ` · ${esc(pk.ruang.get(r.ubahan[0].ruangId) ?? '')}` : ''}</button></div>`
          : `<div class="rounded-lg border border-slate-200 bg-slate-50 p-2">${kiri}<div class="mt-1 text-xs text-red-700">${esc(r.alasan[0] ?? '')}</div></div>`;
      })
      .join('');
    return `<div class="modal-latar" data-aksi="tutupModal"><div class="modal-isi" data-aksi="diam">
      <div class="mb-1 text-lg font-semibold">Isi sel jadwal</div><div class="mb-3 text-sm text-slate-500">${esc(labelWaktu(k, m.hari, m.jam))}</div>
      <div class="space-y-2">${baris || '<div class="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">Semua beban rombel ini sudah terjadwal penuh.</div>'}</div>
      <div class="mt-4 text-right">${tutup}</div></div></div>`;
  }
  const s = k.turunan.slots.find((x) => x.id === m.slotId);
  const b = s ? pk.beban.get(s.bebanId) : undefined;
  if (!s || !b) return '';
  const mapel = k.p.master.mapel.find((x) => x.id === b.mapelId)?.nama ?? '?';
  const rombel = pk.rombel.get(b.rombelId) ?? '?';
  const guru = [b.guruId, ...b.timGuruIds].map((g) => k.p.master.guru.find((x) => x.id === g)?.nama ?? '?').join(', ');
  const ms = k.turunan.peta.get(s.id) ?? [];
  return `<div class="modal-latar" data-aksi="tutupModal"><div class="modal-isi" data-aksi="diam">
    <div class="mb-1 text-lg font-semibold">${esc(mapel)} <span class="text-slate-500">· ${esc(rombel)}</span></div>
    <div class="mb-3 text-sm text-slate-500">${esc(labelWaktu(k, s.hari, s.jam))}</div>
    <div class="mb-3 text-sm">Guru: ${esc(guru)}${b.paralel ? ` · kelompok paralel ${esc(b.paralel)}` : ''}</div>
    <label class="mb-3 block text-sm">Ruang
      <select class="isian ml-2" data-aksi="ubahRuang" data-slot="${esc(s.id)}">${opsi(k.p.master.ruang, s.ruangId, (r) => r.id, (r) => `${r.kode} · ${r.nama}`, '— belum ada ruang —')}</select></label>
    ${ms.length ? `<div class="mb-3 space-y-1">${ms.map((x) => `<div class="rounded-lg ${x.kategori === 'bentrok' || x.kategori === 'aturan' ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-800'} p-2 text-xs">${esc(x.pesan)}</div>`).join('')}</div>` : '<div class="mb-3 rounded-lg bg-emerald-50 p-2 text-xs text-emerald-800">Tidak ada masalah pada slot ini.</div>'}
    <div class="flex items-center justify-between">${k.ui.mode === 'rombel' ? `<button class="tombol !border-red-300 !text-red-700" data-aksi="lepasSlot" data-slot="${esc(s.id)}">Lepas dari jadwal</button>` : '<span></span>'}${tutup}</div></div></div>`;
}

/** Penangan klik tab Grid. Mengembalikan true bila aksi dikenali. */
export function klikGrid(k: Konteks, el: HTMLElement): boolean {
  const d = el.dataset;
  switch (d.aksi) {
    case 'diam':
      return true;
    case 'mode':
      k.ui.mode = d.mode as ModeLihat;
      k.ui.entitasId = daftarEntitas(k.p, k.ui.mode)[0]?.id ?? '';
      k.gambar();
      return true;
    case 'tata':
      k.ui.tata = d.tata === 'semua' ? 'semua' : 'hari';
      k.gambar();
      return true;
    case 'fokus':
      k.ui.entitasId = d.id ?? k.ui.entitasId;
      if (d.buka) k.ui.tata = 'hari';
      k.gambar();
      return true;
    case 'geserEntitas': {
      const daftar = daftarEntitas(k.p, k.ui.mode);
      const i = daftar.findIndex((e) => e.id === k.ui.entitasId);
      const baru = daftar[i + Number(d.arah)];
      if (baru) k.ui.entitasId = baru.id;
      k.gambar();
      return true;
    }
    case 'pekan':
      k.ui.tanggal = jepitTanggal(k, d.tgl ?? k.ui.tanggal);
      k.gambar();
      return true;
    case 'selKosong':
      k.ui.modal = { jenis: 'sel', hari: Number(d.hari), jam: Number(d.jam) };
      k.gambar();
      return true;
    case 'slotDetail':
      k.ui.modal = { jenis: 'slot', slotId: d.slot ?? '' };
      k.gambar();
      return true;
    case 'tempatkan':
      k.ui.modal = null;
      lepas(k, { bebanId: d.beban }, Number(d.hari), Number(d.jam));
      return true;
    case 'lepasSlot':
      k.ui.modal = null;
      k.ubahSlots((slots) => slots.filter((s) => s.id !== d.slot));
      return true;
    case 'tutupModal':
      k.ui.modal = null;
      k.gambar();
      return true;
  }
  return false;
}

export function ubahGrid(k: Konteks, el: HTMLInputElement & HTMLSelectElement): boolean {
  if (el.id === 'tanggal') {
    if (el.value) k.ui.tanggal = jepitTanggal(k, el.value);
    k.gambar();
    return true;
  }
  if (el.id === 'entitas') {
    k.ui.entitasId = el.value;
    k.gambar();
    return true;
  }
  if (el.dataset.aksi === 'ubahRuang') {
    const s = k.turunan.slots.find((x) => x.id === el.dataset.slot);
    if (!s) return true;
    const baru: Slot = { ...s, ruangId: el.value };
    const alasan = cekPenempatan(k.p, k.turunan.slots, [baru]);
    if (alasan.length) {
      k.lapor(alasan[0] ?? 'Ruang ditolak.');
      k.gambar();
    } else k.ubahSlots((slots) => slots.map((x) => (x.id === s.id ? baru : x)));
    return true;
  }
  return false;
}
