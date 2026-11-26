import { terapkanImpor, tafsirTugas } from '../io/imporTugas';
import type { HasilImpor } from '../io/imporTugas';
import { bacaLembar, daftarLembar } from '../io/xlsx';
import { esc, opsi } from './util';
import type { Konteks } from './konteks';

interface Berkas {
  nama: string;
  data: Uint8Array;
  sheets: string[];
  sheet: string;
  hasil: HasilImpor | null;
  galat: string;
}
/** Isi berkas disimpan di luar proyek: besar dan tidak ikut undo/redo atau penyimpanan draf. */
let berkas: Berkas | null = null;

function tafsir(b: Berkas): void {
  try {
    b.hasil = tafsirTugas(bacaLembar(b.data, b.sheet));
    b.galat = '';
  } catch (e) {
    b.hasil = null;
    b.galat = e instanceof Error ? e.message : String(e);
  }
}

function pilihOtomatis(b: Berkas): void {
  const urut = [...b.sheets.filter((s) => /harizka|genap|gasal/i.test(s)), ...b.sheets.filter((s) => !/harizka|genap|gasal/i.test(s))];
  for (const s of urut) {
    b.sheet = s;
    tafsir(b);
    if (b.hasil) return;
  }
  b.sheet = b.sheets[0] ?? '';
  b.galat = 'Tidak ada sheet yang berformat "PEMBAGIAN TUGAS" (judul kolom MATA PELAJARAN dan KODE).';
}

export function renderImpor(k: Konteks): string {
  const sudah = k.p.beban.length > 0;
  const kotakBerkas = `<label class="mt-3 flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center hover:border-sky-400 hover:bg-sky-50">
      <span class="text-sm font-semibold text-slate-800">Pilih berkas Excel (.xlsx)</span>
      <span class="text-xs text-slate-500">mis. PEMBAGIAN TUGAS GASAL 2026-2027.xlsx</span>
      <input type="file" id="berkasExcel" accept=".xlsx" class="hidden"></label>`;
  let isi = '';
  if (!berkas) isi = kotakBerkas;
  else {
    const b = berkas;
    const h = b.hasil;
    const pilih = `<div class="mt-3 flex flex-wrap items-center gap-3 text-sm"><span class="font-medium">${esc(b.nama)}</span>
      <label class="flex items-center gap-1 text-slate-600">Sheet <select id="sheetExcel" class="isian">${opsi(b.sheets.map((s) => ({ s })), b.sheet, (x) => x.s, (x) => x.s)}</select></label>
      <button class="tombol" data-aksi="gantiBerkas">Pilih berkas lain</button></div>`;
    if (!h) isi = `${pilih}<div class="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">${esc(b.galat)}</div>`;
    else {
      const r = h.ringkas;
      const kartu = (n: number | string, label: string) => `<div class="rounded-lg bg-slate-50 px-3 py-2 text-center"><div class="text-lg font-bold text-slate-900">${n}</div><div class="text-xs text-slate-500">${label}</div></div>`;
      const jpMapel = new Map<string, number>();
      for (const x of h.beban) jpMapel.set(x.mapelId, (jpMapel.get(x.mapelId) ?? 0) + x.jp);
      isi = `${pilih}
        <div class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-6">${kartu(r.guru, 'guru')}${kartu(r.mapel, 'mapel')}${kartu(r.rombel, 'rombel')}${kartu(r.beban, 'beban')}${kartu(r.jpTatapMuka, 'JP tatap muka')}${kartu(r.jpNonTatapMuka, 'JP non-tatap-muka (PKL)')}</div>
        ${h.peringatan.length
          ? `<div class="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm"><div class="mb-1 font-semibold text-amber-900">${h.peringatan.length} catatan untuk diperiksa</div><ul class="list-disc space-y-0.5 pl-5 text-amber-900">${h.peringatan.slice(0, 30).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>${h.peringatan.length > 30 ? `<div class="mt-1 text-xs text-amber-800">…dan ${h.peringatan.length - 30} lainnya</div>` : ''}</div>`
          : '<div class="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">Semua pemeriksaan silang (JP per baris dan per rombel) cocok dengan Excel.</div>'}
        <div class="mt-4 grid gap-4 lg:grid-cols-3">
          <div><div class="mb-1 text-sm font-semibold">Kode mapel</div><div class="max-h-72 overflow-auto rounded-lg border border-slate-200"><table class="w-full text-xs">${h.mapel.map((m) => `<tr class="border-t border-slate-100 first:border-0"><td class="px-2 py-1 font-mono font-semibold">${esc(m.kode)}</td><td class="px-2 py-1">${esc(m.nama)}</td><td class="px-2 py-1 text-right text-slate-500">${jpMapel.get(m.id) ?? 0} JP</td></tr>`).join('')}</table></div></div>
          <div><div class="mb-1 text-sm font-semibold">Kode guru</div><div class="max-h-72 overflow-auto rounded-lg border border-slate-200"><table class="w-full text-xs">${h.guru.map((g) => `<tr class="border-t border-slate-100 first:border-0"><td class="px-2 py-1 font-mono font-semibold">${esc(g.kode)}</td><td class="px-2 py-1">${esc(g.nama)}</td></tr>`).join('')}</table></div></div>
          <div><div class="mb-1 text-sm font-semibold">Rombel</div><div class="max-h-72 overflow-auto rounded-lg border border-slate-200"><table class="w-full text-xs">${h.rombel.map((x) => `<tr class="border-t border-slate-100 first:border-0"><td class="px-2 py-1 font-semibold">${esc(x.kode)}</td><td class="px-2 py-1 text-right text-slate-500">${x.jpButuh ?? '—'} JP</td></tr>`).join('')}</table></div></div></div>
        <div class="mt-4 flex flex-wrap items-center gap-3 rounded-lg bg-slate-50 p-3 text-sm">
          <div class="flex-1 text-slate-600">Yang diganti: <b>guru, mapel, rombel, beban</b>. Jadwal (slot) dikosongkan karena mengacu ke beban lama. Ruang, skema, dan kalender dipertahankan. Bisa dibatalkan dengan <b>Urungkan</b>.${sudah ? ' <span class="text-amber-700">Data beban yang ada sekarang akan tergantikan.</span>' : ''}</div>
          <button class="tombol" data-aksi="terapkanImpor">Terapkan ke proyek</button></div>`;
    }
  }
  return `<h2 class="mb-3 text-lg font-bold">Impor Excel</h2>
    <div class="kartu p-4"><div class="text-sm text-slate-600">Membaca sheet berformat <b>PEMBAGIAN TUGAS</b> (judul MATA PELAJARAN, KODE, lalu kolom KELAS X/XI/XII per jurusan dan nomor rombel). Berkas dibaca di peramban ini saja dan tidak diunggah ke mana pun. NIP dan tanggal lahir pada sel nama <b>tidak dibaca</b>.</div>${isi}</div>`;
}

export function klikImpor(k: Konteks, el: HTMLElement): boolean {
  switch (el.dataset.aksi) {
    case 'gantiBerkas':
      berkas = null;
      k.gambar();
      return true;
    case 'terapkanImpor': {
      const h = berkas?.hasil;
      if (!h) return true;
      const n = h.ringkas;
      k.ubah((p) => terapkanImpor(p, h));
      k.ui.mode = 'rombel';
      k.ui.entitasId = h.rombel[0]?.id ?? '';
      k.ui.bebanRombel = 'semua';
      k.ke('beban');
      k.lapor(`Impor selesai: ${n.guru} guru, ${n.mapel} mapel, ${n.rombel} rombel, ${n.beban} beban.`);
      return true;
    }
  }
  return false;
}

export function ubahImpor(k: Konteks, el: HTMLInputElement & HTMLSelectElement): boolean {
  if (el.id === 'berkasExcel') {
    const f = el.files?.[0];
    if (!f) return true;
    void f.arrayBuffer().then((buf) => {
      const data = new Uint8Array(buf);
      try {
        const b: Berkas = { nama: f.name, data, sheets: daftarLembar(data), sheet: '', hasil: null, galat: '' };
        pilihOtomatis(b);
        berkas = b;
      } catch (e) {
        berkas = null;
        k.lapor(`Berkas tidak dapat dibaca: ${e instanceof Error ? e.message : String(e)}`);
      }
      k.gambar();
    });
    return true;
  }
  if (el.id === 'sheetExcel' && berkas) {
    berkas.sheet = el.value;
    tafsir(berkas);
    k.gambar();
    return true;
  }
  return false;
}
