import type { Beban, Proyek, Slot } from '../model/tipe';
import { NAMA_HARI } from '../model/tipe';
import { hitungSkema, kapasitasKbm } from '../model/skema';
import { selisihKapasitas } from '../model/kalender';
import { cekPenempatan, rencanaPindah, terapkanRencana } from '../mesin/penempatan';
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

function chipSlot(k: Konteks, pk: Peta, s: Slot, bisaSeret: boolean): string {
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
  const teks =
    k.ui.mode === 'rombel' ? `<b>${esc(mapel)}</b> <span class="text-slate-600">${esc(guru)} · ${esc(ruang)}</span>`
    : k.ui.mode === 'guru' ? `<b>${esc(mapel)}</b> <span class="text-slate-600">${esc(rombel)} · ${esc(ruang)}</span>`
    : `<b>${esc(mapel)}</b> <span class="text-slate-600">${esc(rombel)} · ${esc(guru)}</span>`;
  const judul = ms.length ? ms.map((m) => m.pesan).join('\n') : `${rombel} · ${mapel} · ${guru} · ${ruang}`;
  return `<div class="chip ${cls}" style="--bg:${w.bg};--garis:${w.garis}" title="${esc(judul)}" data-aksi="slotDetail" data-slot="${esc(s.id)}" ${bisaSeret ? `draggable="true" data-seret="slot" data-slot-id="${esc(s.id)}"` : ''}>
    ${teks}${wajib.length ? '<span class="ml-auto text-red-600">⚠</span>' : ''}</div>`;
}

export function sisaJp(slots: Slot[], b: Beban): number {
  return b.jp - slots.filter((s) => s.bebanId === b.id).length;
}

function kartuBeban(pk: Peta, b: Beban, sisa: number): string {
  const mapel = pk.mapel.get(b.mapelId) ?? '?';
  const w = warnaMapel(mapel);
  const guru = [b.guruId, ...b.timGuruIds].map((g) => pk.guru.get(g) ?? '?').join('+');
  const seret = sisa > 0 && !b.nonTatapMuka;
  return `<div class="chip !mb-1 !px-2 !py-1 !text-xs ${seret ? '' : 'opacity-60'}" style="--bg:${w.bg};--garis:${w.garis}" ${seret ? `draggable="true" data-seret="beban" data-beban-id="${esc(b.id)}"` : ''}>
    <b>${esc(mapel)}</b><span class="text-slate-600">${esc(guru)}${b.paralel ? ` · paralel ${esc(b.paralel)}` : ''}</span>
    <span class="ml-auto rounded bg-white/80 px-1 font-semibold">${b.nonTatapMuka ? 'non-tatap-muka' : `sisa ${sisa}`}</span></div>`;
}

export function renderGrid(k: Konteks): string {
  const p = k.p;
  const t = k.turunan;
  const pk = petaKode(p);
  const skemaById = new Map(p.skema.map((s) => [s.id, s]));
  const entitas = daftarEntitas(p, k.ui.mode);
  const milik = slotMilik(k, pk);
  const rombelMode = k.ui.mode === 'rombel';

  // satu sel = daftar slot pada hari+jam
  const peta = new Map<string, Slot[]>();
  for (const s of milik) {
    const key = `${s.hari}:${s.jam}`;
    const l = peta.get(key);
    if (l) l.push(s);
    else peta.set(key, [s]);
  }

  const kolom = t.hari
    .map((h, i) => {
      const nama = NAMA_HARI[i];
      const judul = `${nama} <span class="text-xs font-normal opacity-80">${tanggalPendek(h.tgl)}</span>`;
      if (!h.info.skemaId) {
        const alasan = h.info.alasan === 'libur' ? `Libur: ${esc(h.info.kegiatanLibur ?? '')}` : 'Tidak ada KBM';
        return `<div class="kartu overflow-hidden"><div class="bg-slate-500 px-3 py-2 font-semibold text-white">${judul}</div><div class="p-3 text-sm text-slate-500">${alasan}</div></div>`;
      }
      const sk = skemaById.get(h.info.skemaId);
      if (!sk) return `<div class="kartu border-red-300 bg-red-50 p-3 text-sm">Skema "${esc(h.info.skemaId)}" tidak ditemukan.</div>`;
      const baris = hitungSkema(sk)
        .map((b) => {
          const label = `<td class="w-7 px-1.5 py-1 text-xs font-bold text-slate-700">${b.label}</td><td class="w-[74px] whitespace-nowrap px-1 py-1 text-[11px] text-slate-500">${b.mulai}–${b.selesai}</td>`;
          if (b.nomorKbm === null) return `<tr class="bg-amber-50"><td class="px-1.5 py-1 text-xs font-bold text-amber-800">${b.label}</td><td class="px-1 py-1 text-[11px] text-amber-700" colspan="2">${esc(b.baris.kegiatan)}</td></tr>`;
          if (b.nomorKbm === 0) return `<tr style="background:${sk.warna}12">${label}<td class="px-1 py-1 text-[11px] italic text-slate-500">${esc(b.baris.kegiatan)}</td></tr>`;
          const isi = peta.get(`${i}:${b.nomorKbm}`) ?? [];
          const chips = isi.map((s) => chipSlot(k, pk, s, rombelMode)).join('');
          const tambah = rombelMode
            ? isi.length
              ? `<button class="absolute right-0.5 top-0.5 hidden rounded bg-white/90 px-1 text-xs text-slate-500 shadow group-hover:block" data-aksi="selKosong" data-hari="${i}" data-jam="${b.nomorKbm}" title="Tambah pelajaran paralel">＋</button>`
              : `<span class="block h-5 text-center text-sm">＋</span>`
            : '';
          const kosongKlik = rombelMode && !isi.length;
          return `<tr class="border-t border-slate-100">${label}<td class="group relative px-1 py-0.5 ${kosongKlik ? 'sel-kosong' : ''}" data-sel="1" data-hari="${i}" data-jam="${b.nomorKbm}" ${kosongKlik ? `data-aksi="selKosong"` : ''}>${chips || tambah}${chips ? tambah : ''}</td></tr>`;
        })
        .join('');
      return `<div class="kartu overflow-hidden">
        <div class="px-3 py-2 text-white" style="background:${esc(sk.warna)}"><div class="font-semibold">${judul}</div>
          <div class="text-xs opacity-90">${esc(sk.nama)} · skema ${LABEL_SUMBER[h.info.sumber ?? 'reguler']}</div></div>
        <table class="w-full">${baris}</table></div>`;
    })
    .join('');

  // --- kontrol atas
  const kontrol = `<div class="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
    <div class="inline-flex rounded-lg border border-slate-300 bg-white p-0.5">${MODE.map((m) => `<button class="rounded-md px-3 py-1 text-sm font-medium ${m.id === k.ui.mode ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}" data-aksi="mode" data-mode="${m.id}">${m.label}</button>`).join('')}</div>
    <select id="entitas" class="isian min-w-44">${opsi(entitas, k.ui.entitasId, (e) => e.id, (e) => e.label)}</select>
    <div class="ml-auto flex items-center gap-1">
      <button class="tombol" data-aksi="pekan" data-tgl="${tambahHari(t.senin, -7)}" title="Pekan sebelumnya">◀</button>
      <label class="text-sm text-slate-600">Pekan <input type="date" id="tanggal" class="isian" value="${k.ui.tanggal}"></label>
      <button class="tombol" data-aksi="pekan" data-tgl="${tambahHari(t.senin, 7)}" title="Pekan berikutnya">▶</button></div></div>`;

  // --- ringkasan + aside
  const kapPekan = t.skemaPerHari.map((id) => (id && skemaById.get(id) ? kapasitasKbm(skemaById.get(id)!) : 0));
  const total = kapPekan.reduce((a, b) => a + b, 0);
  const lencana: string[] = [`<span class="lencana bg-slate-200 text-slate-700">Kapasitas pekan ini ${kapPekan.join('+')} = <b>${total} JP</b></span>`];
  let aside = '';
  if (rombelMode) {
    const rombel = p.master.rombel.find((r) => r.id === k.ui.entitasId);
    const bebanR = p.beban.filter((b) => b.rombelId === k.ui.entitasId);
    const butuh = bebanR.filter((b) => !b.nonTatapMuka).reduce((a, b) => a + b.jp, 0);
    const jadi = milik.length;
    lencana.push(`<span class="lencana ${jadi >= butuh ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">Terjadwal ${jadi} dari ${butuh} JP</span>`);
    if (rombel) for (const s of selisihKapasitas([rombel], { perHari: kapPekan, total })) {
      lencana.push(`<span class="lencana bg-red-100 text-red-800" title="Kebutuhan menurut data sumber dibanding kapasitas pekan ini; diputuskan manual">Sumber: butuh ${s.butuh} JP, kapasitas ${s.kapasitas} → ${s.selisih > 0 ? `kurang ${s.selisih}` : `lebih ${-s.selisih}`}</span>`);
    }
    const belum = bebanR.filter((b) => sisaJp(t.slots, b) > 0 || b.nonTatapMuka);
    const tamp = milik.filter((s) => {
      const id = t.skemaPerHari[s.hari];
      const sk = id ? skemaById.get(id) : undefined;
      return !(sk && s.jam >= 1 && s.jam <= kapasitasKbm(sk));
    });
    aside = `<aside class="space-y-3">
      <div class="kartu p-3"><div class="mb-1 text-sm font-semibold">Belum terjadwal</div>
        <div class="mb-2 text-xs text-slate-500">Seret ke sel di grid: hijau = aman, merah = bentrok (arahkan kursor untuk alasan). Bisa juga klik sel kosong.</div>
        ${belum.length ? belum.map((b) => kartuBeban(pk, b, sisaJp(t.slots, b))).join('') : '<div class="rounded-lg bg-emerald-50 p-2 text-sm text-emerald-800">Semua beban rombel ini sudah terjadwal penuh.</div>'}</div>
      ${tamp.length ? `<div class="kartu border-amber-300 bg-amber-50 p-3"><div class="mb-1 text-sm font-semibold">Tampungan (${tamp.length})</div>
        <div class="mb-2 text-xs text-slate-600">Tidak muat pada skema pekan ini. Seret ke sel yang tersedia, atau ganti pola pekan.</div>
        ${tamp.map((s) => `<div class="mb-1 text-[11px] text-slate-500">${NAMA_HARI[s.hari]}, pelajaran ke-${s.jam}</div>${chipSlot(k, pk, s, true)}`).join('')}</div>` : ''}
    </aside>`;
  }

  const kosong = entitas.length === 0 ? '<div class="kartu p-6 text-center text-sm text-slate-500">Belum ada data. Tambahkan di tab Master Data.</div>' : '';
  return `${kontrol}<div class="mb-3 flex flex-wrap gap-2">${lencana.join('')}</div>${kosong}
    <div class="grid gap-3 ${rombelMode ? 'xl:grid-cols-[1fr_260px]' : ''}">
      <div class="grid grid-cols-1 items-start gap-3 md:grid-cols-3 2xl:grid-cols-5">${kolom}</div>${aside}</div>`;
}

// ------------------------------------------------------------------ seret & lepas

export interface HasilSel {
  ok: boolean;
  alasan: string[];
}
export type PetaSel = Map<string, HasilSel>;
export interface Seret {
  bebanId?: string;
  slotId?: string;
}

/** Menghitung keabsahan tiap sel pekan ini untuk benda yang sedang diseret. */
export function siapkanSeret(k: Konteks, seret: Seret): PetaSel {
  const hasil: PetaSel = new Map();
  const skemaById = new Map(k.p.skema.map((s) => [s.id, s]));
  k.turunan.skemaPerHari.forEach((id, hari) => {
    const sk = id ? skemaById.get(id) : undefined;
    if (!sk) return;
    for (let jam = 1; jam <= kapasitasKbm(sk); jam++) {
      const r = rencanaPindah(k.p, k.turunan.slots, seret, hari, jam);
      hasil.set(`${hari}:${jam}`, { ok: r.ok, alasan: r.alasan });
    }
  });
  return hasil;
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
