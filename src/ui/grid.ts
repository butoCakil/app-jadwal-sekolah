import type { Beban, Proyek, Slot } from '../model/tipe';
import { NAMA_HARI } from '../model/tipe';
import { hitungSkema, kapasitasKbm } from '../model/skema';
import type { BarisHitung } from '../model/skema';
import type { Skema } from '../model/tipe';
import { selisihKapasitas } from '../model/kalender';
import { cekPenempatan, rencanaPindah, terapkanRencana } from '../mesin/penempatan';
import { jpRombel } from '../model/jp';
import { esc, opsi, tambahHari, tanggalPendek, warnaMapel } from './util';
import type { Konteks, ModeLihat } from './konteks';

const LABEL_SUMBER = { manual: 'manual', kegiatan: 'kalender', reguler: 'reguler' } as const;
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

function chipSlot(k: Konteks, pk: Peta, s: Slot, mode: 'besar' | 'mini'): string {
  const b = pk.beban.get(s.bebanId);
  if (!b) return '';
  const mapel = pk.mapel.get(b.mapelId) ?? '?';
  const guru = [b.guruId, ...b.timGuruIds].map((g) => pk.guru.get(g) ?? '?').join('+');
  const ruang = pk.ruang.get(s.ruangId) ?? '—';
  const rombel = pk.rombel.get(b.rombelId) ?? '?';
  const w = warnaMapel(mapel);
  const ms = k.turunan.peta.get(s.id) ?? [];
  const wajib = ms.filter((m) => m.kategori === 'bentrok' || m.kategori === 'aturan');
  const cls = wajib.length ? 'bermasalah' : ms.length ? 'peringatan' : '';
  // baris kedua dan lencana kanan bergantung pada apa yang sedang dilihat
  const [kedua, lencana] =
    k.ui.mode === 'rombel' ? [guru, ruang] : k.ui.mode === 'guru' ? [rombel, ruang] : [rombel, guru];
  const judul = ms.length ? ms.map((m) => m.pesan).join('\n') : `${rombel} · ${mapel} · ${guru} · ${ruang}`;
  const attr = `style="--bg:${w.bg};--garis:${w.garis}" title="${esc(judul)}" data-aksi="slotDetail" data-slot="${esc(s.id)}" draggable="true" data-seret="slot" data-slot-id="${esc(s.id)}"`;
  const tanda = wajib.length ? '<span class="text-red-600">⚠</span>' : '';
  if (mode === 'mini') {
    return `<div class="chip chip-mini ${cls}" ${attr}><b>${esc(mapel)}</b><span>${esc(kedua)}</span><span class="text-slate-500">${esc(lencana)}</span>${tanda}</div>`;
  }
  return `<div class="chip chip-besar ${cls}" ${attr}>
    <div class="flex w-full items-center justify-between gap-1"><b class="text-[13px]">${esc(mapel)}</b>${tanda}<span class="lencana-ruang">${esc(lencana)}</span></div>
    <div class="text-[11px] text-slate-600">${esc(kedua)}</div></div>`;
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
}

function infoHari(k: Konteks): InfoHari[] {
  const skemaById = new Map(k.p.skema.map((s) => [s.id, s]));
  return k.turunan.hari.map((h) => {
    const skema = h.info.skemaId ? skemaById.get(h.info.skemaId) : undefined;
    return { skema, baris: skema ? hitungSkema(skema) : [], kap: skema ? kapasitasKbm(skema) : 0 };
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

/** Tampilan satu entitas: kolom = hari, baris = pelajaran ke-N (sejajar antar hari). */
function tabelPekan(k: Konteks, pk: Peta, milik: Slot[]): string {
  const ih = infoHari(k);
  const peta = new Map<string, Slot[]>();
  for (const s of milik) {
    const key = `${s.hari}:${s.jam}`;
    const l = peta.get(key);
    if (l) l.push(s);
    else peta.set(key, [s]);
  }
  const maks = Math.max(0, ...ih.map((x) => x.kap));
  const adaNol = ih.some((x) => x.baris.some((b) => b.nomorKbm === 0));
  const awal = adaNol ? 0 : 1;
  const rombelMode = k.ui.mode === 'rombel';

  const kepala = ih
    .map((x, i) => {
      const warna = x.skema?.warna ?? '#64748b';
      return `<th class="px-2 py-2 text-left align-top font-normal text-white" style="background:${esc(warna)}">${kepalaHari(k, i, x)}</th>`;
    })
    .join('');

  const barisHtml: string[] = [];
  for (let n = awal; n <= maks; n++) {
    const sel = ih
      .map((x, i) => {
        if (!x.skema) {
          if (n !== awal) return '';
          return `<td rowspan="${maks - awal + 1}" class="bg-slate-100 p-3 align-top text-sm text-slate-500">Tidak ada KBM</td>`;
        }
        const idx = x.baris.findIndex((b) => b.nomorKbm === n);
        const info = x.baris[idx];
        if (!info) return `<td class="bg-slate-50"></td>`;
        const berikut = x.baris[idx + 1];
        const strip =
          berikut && berikut.nomorKbm === null
            ? `<div class="strip-istirahat">${esc(berikut.baris.kegiatan)} · ${berikut.mulai}–${berikut.selesai}</div>`
            : '';
        const waktu = `<div class="waktu-sel">${info.mulai}–${info.selesai}</div>`;
        if (n === 0) return `<td class="align-top" style="background:${esc(x.skema.warna)}10">${waktu}<div class="px-2 pb-2 text-xs italic text-slate-500">${esc(info.baris.kegiatan)}</div>${strip}</td>`;
        const isi = peta.get(`${i}:${n}`) ?? [];
        const chips = isi.map((s) => chipSlot(k, pk, s, 'besar')).join('');
        const kosongKlik = rombelMode && !isi.length;
        const tambah = rombelMode && isi.length
          ? `<button class="tambah-paralel" data-aksi="selKosong" data-hari="${i}" data-jam="${n}" title="Tambah pelajaran paralel">＋</button>`
          : '';
        return `<td class="align-top p-0">${waktu}<div class="sel group ${kosongKlik ? 'sel-kosong' : ''}" data-sel="1" data-hari="${i}" data-jam="${n}" ${kosongKlik ? 'data-aksi="selKosong"' : ''}>${chips}${tambah}${kosongKlik ? '<span class="plus">＋</span>' : ''}</div>${strip}</td>`;
      })
      .join('');
    barisHtml.push(`<tr class="border-t border-slate-200"><th class="w-16 bg-slate-50 px-2 text-center align-middle text-xs font-bold text-slate-700">${n === 0 ? 'Pagi' : `Jam ${n}`}</th>${sel}</tr>`);
  }
  return `<div class="kartu overflow-x-auto"><table class="w-full min-w-[760px] table-fixed border-collapse">
    <thead><tr><th class="w-16 bg-slate-800 px-2 py-2 text-xs font-semibold text-white">Jam ke-</th>${kepala}</tr></thead>
    <tbody>${barisHtml.join('')}</tbody></table></div>`;
}

/** Tampilan semua sekaligus: baris = semua rombel/guru/ruang, kolom = hari × pelajaran. */
function tabelSemua(k: Konteks, pk: Peta, entitas: { id: string; label: string }[]): string {
  const ih = infoHari(k);
  const peta = new Map<string, Slot[]>();
  const taruh = (id: string, s: Slot) => {
    const key = `${id}|${s.hari}:${s.jam}`;
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
  const kepala1 = ih
    .map((x, i) => {
      const warna = x.skema?.warna ?? '#64748b';
      const h = k.turunan.hari[i];
      const teks = x.skema ? `${NAMA_HARI[i]} ${h ? tanggalPendek(h.tgl) : ''}` : `${NAMA_HARI[i]} · libur`;
      return `<th colspan="${Math.max(1, x.kap)}" class="sticky top-0 z-20 border-l-2 border-white px-2 py-1 text-left text-xs font-semibold text-white" style="background:${esc(warna)}">${teks}</th>`;
    })
    .join('');
  const kepala2 = ih
    .map((x, i) =>
      x.kap === 0
        ? `<th class="sticky top-[26px] z-20 border-l-2 border-white bg-slate-200"></th>`
        : Array.from({ length: x.kap }, (_, j) => `<th class="sticky top-[26px] z-20 bg-slate-100 text-[10px] font-semibold text-slate-600 ${j === 0 ? 'border-l-2 border-white' : ''}">${j + 1}</th>`).join('') + (i < 0 ? '' : ''),
    )
    .join('');
  const barisHtml = entitas
    .map((e) => {
      const fokus = e.id === k.ui.entitasId;
      const sel = ih
        .map((x, i) =>
          x.kap === 0
            ? `<td class="border-l-2 border-white bg-slate-100"></td>`
            : Array.from({ length: x.kap }, (_, j) => {
                const n = j + 1;
                const isi = peta.get(`${e.id}|${i}:${n}`) ?? [];
                return `<td class="sel sel-mx ${j === 0 ? 'border-l-2 border-slate-300' : 'border-l border-slate-100'}" data-sel="1" data-hari="${i}" data-jam="${n}" data-baris="${esc(e.id)}">${isi.map((s) => chipSlot(k, pk, s, 'mini')).join('')}</td>`;
              }).join(''),
        )
        .join('');
      return `<tr class="border-t border-slate-200 ${fokus ? 'bg-sky-50' : ''}"><th class="label-baris ${fokus ? '!bg-sky-100' : ''}" data-aksi="fokus" data-id="${esc(e.id)}" title="Klik untuk memilih sebagai fokus">${esc(e.label)}</th>${sel}</tr>`;
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

  const kontrol = `<div class="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
    <div class="inline-flex rounded-lg border border-slate-300 bg-white p-0.5">${MODE.map((m) => `<button class="rounded-md px-3 py-1 text-sm font-medium ${m.id === k.ui.mode ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}" data-aksi="mode" data-mode="${m.id}">${m.label}</button>`).join('')}</div>
    <div class="inline-flex rounded-lg border border-slate-300 bg-white p-0.5" title="Pilih cara melihat jadwal">${(
      [['hari', 'Satu per satu'], ['semua', 'Semua sekaligus']] as const
    ).map(([id, label]) => `<button class="rounded-md px-3 py-1 text-sm font-medium ${id === k.ui.tata ? 'bg-sky-600 text-white' : 'text-slate-600 hover:bg-slate-100'}" data-aksi="tata" data-tata="${id}">${label}</button>`).join('')}</div>
    <label class="flex items-center gap-1 text-sm text-slate-600">${semua ? 'Fokus' : 'Pilih'} <select id="entitas" class="isian min-w-44">${opsi(entitas, k.ui.entitasId, (e) => e.id, (e) => e.label)}</select></label>
    <div class="ml-auto flex items-center gap-1">
      <button class="tombol" data-aksi="pekan" data-tgl="${tambahHari(t.senin, -7)}" title="Pekan sebelumnya">◀</button>
      <label class="text-sm text-slate-600">Pekan <input type="date" id="tanggal" class="isian" value="${k.ui.tanggal}"></label>
      <button class="tombol" data-aksi="pekan" data-tgl="${tambahHari(t.senin, 7)}" title="Pekan berikutnya">▶</button></div></div>`;

  const kapPekan = t.skemaPerHari.map((id) => (id && skemaById.get(id) ? kapasitasKbm(skemaById.get(id)!) : 0));
  const total = kapPekan.reduce((a, b) => a + b, 0);
  const lencana: string[] = [`<span class="lencana bg-slate-200 text-slate-700">Kapasitas pekan ini ${kapPekan.join('+')} = <b>${total} JP</b></span>`];

  // daftar beban yang masih perlu ditempatkan (rombel atau guru yang sedang dipilih)
  const bebanFokus =
    k.ui.mode === 'rombel' ? p.beban.filter((b) => b.rombelId === k.ui.entitasId)
    : k.ui.mode === 'guru' ? p.beban.filter((b) => b.guruId === k.ui.entitasId)
    : [];
  if (rombelMode) {
    const rombel = p.master.rombel.find((r) => r.id === k.ui.entitasId);
    const butuh = jpRombel(bebanFokus);
    const jadi = new Set(milik.map((s) => { const par = pk.beban.get(s.bebanId)?.paralel; return par ? `${par}|${s.hari}|${s.jam}` : s.id; })).size;
    lencana.push(`<span class="lencana ${jadi >= butuh ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">Terjadwal ${jadi} dari ${butuh} JP</span>`);
    if (rombel) for (const s of selisihKapasitas([rombel], { perHari: kapPekan, total })) {
      lencana.push(`<span class="lencana bg-red-100 text-red-800" title="Kebutuhan menurut data sumber dibanding kapasitas pekan ini; diputuskan manual">Sumber: butuh ${s.butuh} JP, kapasitas ${s.kapasitas} → ${s.selisih > 0 ? `kurang ${s.selisih}` : `lebih ${-s.selisih}`}</span>`);
    }
  }

  let aside = '';
  if (k.ui.mode !== 'ruang') {
    const belum = bebanFokus.filter((b) => sisaJp(t.slots, b) > 0 || b.nonTatapMuka);
    const tamp = rombelMode
      ? milik.filter((s) => {
          const id = t.skemaPerHari[s.hari];
          const sk = id ? skemaById.get(id) : undefined;
          return !(sk && s.jam >= 1 && s.jam <= kapasitasKbm(sk));
        })
      : [];
    aside = `<aside class="${semua ? 'mt-3 grid gap-3 md:grid-cols-2' : 'space-y-3'}">
      <div class="kartu p-3"><div class="mb-1 text-sm font-semibold">Belum terjadwal</div>
        <div class="mb-2 text-xs text-slate-500">Seret ke sel di grid: hijau = aman, merah = bentrok (arahkan kursor untuk alasan).${rombelMode ? ' Bisa juga klik sel kosong.' : ''}</div>
        ${belum.length ? belum.map((b) => kartuBeban(pk, b, sisaJp(t.slots, b))).join('') : '<div class="rounded-lg bg-emerald-50 p-2 text-sm text-emerald-800">Semua beban sudah terjadwal penuh.</div>'}</div>
      ${tamp.length ? `<div class="kartu border-amber-300 bg-amber-50 p-3"><div class="mb-1 text-sm font-semibold">Tampungan (${tamp.length})</div>
        <div class="mb-2 text-xs text-slate-600">Tidak muat pada skema pekan ini. Seret ke sel yang tersedia, atau ganti pola pekan.</div>
        ${tamp.map((s) => `<div class="mb-1 text-[11px] text-slate-500">${NAMA_HARI[s.hari]}, pelajaran ke-${s.jam}</div>${chipSlot(k, pk, s, 'besar')}`).join('')}</div>` : ''}
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
}

/** Menghitung keabsahan tiap sel pekan ini untuk benda yang sedang diseret. */
export function siapkanSeret(k: Konteks, seret: Seret): PetaSel {
  const sel = new Map<string, HasilSel>();
  const skemaById = new Map(k.p.skema.map((s) => [s.id, s]));
  k.turunan.skemaPerHari.forEach((id, hari) => {
    const sk = id ? skemaById.get(id) : undefined;
    if (!sk) return;
    for (let jam = 1; jam <= kapasitasKbm(sk); jam++) {
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
    const bebanR = k.p.beban.filter((b) => b.rombelId === k.ui.entitasId && !b.nonTatapMuka && sisaJp(k.turunan.slots, b) > 0);
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
      k.gambar();
      return true;
    case 'pekan':
      k.ui.tanggal = d.tgl ?? k.ui.tanggal;
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
    if (el.value) k.ui.tanggal = el.value;
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
