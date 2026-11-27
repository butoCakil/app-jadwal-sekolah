import type { BarisSkema, JenisBaris, PolaMinggu, Proyek, Skema } from '../model/tipe';
import { hitungSkema, jumlahJamTampil, kapasitasKbm, keMenit } from '../model/skema';
import { kapasitasPola, selisihKapasitas } from '../model/kalender';
import { esc } from './util';
import type { Konteks } from './konteks';
import { barisPola, klikKalender, renderKalender, ubahKalender } from './kalenderTab';

const SUB = [
  { id: 'kalender', label: 'Kalender akademik & periode' },
  { id: 'pola', label: 'Pola mingguan' },
  { id: 'skema', label: 'Template skema jam' },
] as const;

const WARNA_BARU = ['#b45309', '#0e7490', '#6d28d9', '#be123c', '#4d7c0f', '#0f766e'];

function bagianPola(p: Proyek): string {
  const kap = (pola: PolaMinggu) => kapasitasPola(pola, p.skema);
  const kapReg = kap(p.polaReguler);
  const sel = selisihKapasitas(p.master.rombel, kapReg);
  const infoSelisih = sel.length
    ? `<div class="mt-2 rounded-lg bg-red-50 p-2 text-xs text-red-800">Selisih terhadap kebutuhan (data sumber), diputuskan manual: ${sel.map((s) => `${esc(p.master.rombel.find((r) => r.id === s.rombelId)?.kode ?? s.rombelId)} butuh ${s.butuh}, tersedia ${s.kapasitas}`).join('; ')}</div>`
    : '';
  const manual = p.penggantiManual;
  const blokManual = manual
    ? `${barisPola(p, manual.pola, 'manual', kap)}
       <div class="mt-2 flex flex-wrap items-center gap-2 text-xs">Berlaku
         <input type="date" class="isian" value="${esc(manual.mulai ?? '')}" data-aksi="manualMulai"> s/d
         <input type="date" class="isian" value="${esc(manual.selesai ?? '')}" data-aksi="manualSelesai">
         <span class="text-slate-500">(kosong = semua tanggal)</span>
         <button class="tombol" data-aksi="hapusManual">Lepas penggantian manual</button></div>`
    : '<button class="tombol" data-aksi="aktifkanManual">Pasang pola manual (salin dari reguler)</button>';
  return `<section class="mb-6"><h2 class="mb-1 text-lg font-semibold">Pola mingguan reguler</h2><div class="mb-2 text-xs text-slate-500">Skema jam yang dipakai tiap hari Senin–Jum'at. Periode di kalender boleh punya pola sendiri.</div>
      ${barisPola(p, p.polaReguler, 'reguler', kap)}${infoSelisih}</section>
    <section><h2 class="mb-1 text-lg font-semibold">Pola manual (menimpa kalender dan reguler)</h2>${blokManual}</section>`;
}

function kartuSkema(p: Proyek, s: Skema): string {
  const hit = hitungSkema(s);
  const dipakai = pemakaiSkema(p, s.id);
  const baris = hit
    .map(
      (b, i) => `<tr class="border-t border-slate-100 text-xs">
          <td class="px-1 py-1 font-semibold">${b.label}</td>
          <td class="px-1 py-1 text-slate-500">${b.mulai}–${b.selesai}</td>
          <td class="px-1 py-1"><select class="isian w-28 !px-1" data-aksi="tipeBaris" data-skema="${esc(s.id)}" data-i="${i}">
            ${(['nonKbm', 'kbm', 'istirahat'] as const).map((t) => `<option value="${t}" ${t === b.baris.tipe ? 'selected' : ''}>${t === 'nonKbm' ? 'non-KBM (jam 0)' : t === 'kbm' ? 'pelajaran' : 'istirahat'}</option>`).join('')}</select></td>
          <td class="px-1 py-1"><input class="isian w-28" value="${esc(b.baris.kegiatan)}" data-aksi="kegiatanBaris" data-skema="${esc(s.id)}" data-i="${i}"></td>
          <td class="px-1 py-1"><input class="isian w-14" type="number" min="1" value="${b.baris.durasi}" data-aksi="durasiBaris" data-skema="${esc(s.id)}" data-i="${i}"></td>
          <td class="px-1 py-1"><button class="text-red-600" data-aksi="hapusBaris" data-skema="${esc(s.id)}" data-i="${i}" title="Hapus baris">✕</button></td></tr>`,
    )
    .join('');
  return `<div class="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div class="px-3 py-2 text-white" style="background:${esc(s.warna)}">
          <input class="w-full rounded bg-white/15 px-1.5 py-0.5 font-semibold text-white placeholder-white/70 outline-none focus:bg-white/25" value="${esc(s.nama)}" data-aksi="namaSkema" data-skema="${esc(s.id)}" title="Nama skema (bisa diubah)">
          <div class="mt-0.5 text-xs opacity-90">${jumlahJamTampil(s)} jam tampil · ${kapasitasKbm(s)} JP pelajaran</div></div>
        <div class="p-2"><div class="flex flex-wrap items-center gap-2"><label class="text-xs text-slate-600">Mulai <input class="isian w-20" value="${esc(s.jamMulai)}" data-aksi="jamMulai" data-skema="${esc(s.id)}"></label>
          <label class="text-xs text-slate-600">Warna <input type="color" class="h-7 w-9 cursor-pointer rounded border border-slate-300 p-0" value="${esc(s.warna)}" data-aksi="warnaSkema" data-skema="${esc(s.id)}"></label></div>
        <table class="mt-2 w-full">${baris}</table>
        <div class="mt-2 flex flex-wrap gap-2"><button class="tombol" data-aksi="tambahBaris" data-skema="${esc(s.id)}" data-tipe="kbm">+ pelajaran</button>
        <button class="tombol" data-aksi="tambahBaris" data-skema="${esc(s.id)}" data-tipe="istirahat">+ istirahat</button>
        <button class="tombol" data-aksi="salinSkema" data-skema="${esc(s.id)}" title="Membuat skema baru dari salinan skema ini, mis. untuk bulan puasa">Salin sebagai skema baru</button>
        <button class="tombol !text-red-600 disabled:opacity-40" data-aksi="hapusSkema" data-skema="${esc(s.id)}" ${dipakai.length ? 'disabled' : ''} title="${dipakai.length ? `Masih dipakai: ${esc(dipakai.join(', '))}` : 'Hapus skema'}">Hapus</button></div>
        ${dipakai.length ? `<div class="mt-1 text-[11px] text-slate-500">Dipakai: ${esc(dipakai.join(', '))}</div>` : ''}</div></div>`;
}

/** Tempat skema dipakai (pola reguler, manual, kegiatan); skema yang dipakai tidak boleh dihapus. */
function pemakaiSkema(p: Proyek, id: string): string[] {
  const ket: string[] = [];
  if (p.polaReguler.includes(id)) ket.push('pola reguler');
  if (p.penggantiManual?.pola.includes(id)) ket.push('pola manual');
  for (const g of p.kalender) if (g.pola?.includes(id)) ket.push(g.nama);
  return ket;
}

function bagianSkema(p: Proyek): string {
  return `<section><div class="mb-2 flex flex-wrap items-center gap-3"><h2 class="text-lg font-semibold">Template skema jam</h2>
      <button class="tombol-utama" data-aksi="skemaBaru">+ Skema baru</button>
      <span class="text-xs text-slate-500">Mis. skema khusus bulan puasa. Skema baru berisi salinan skema pertama; ubah baris dan durasinya, lalu pasang di Pola mingguan atau pada periode di kalender.</span></div>
    <div class="grid grid-cols-1 gap-3 lg:grid-cols-3">${p.skema.map((s) => kartuSkema(p, s)).join('')}</div></section>`;
}

export function renderSkemaTab(k: Konteks): string {
  const sub = k.ui.skemaSub;
  const kap = (pola: PolaMinggu) => kapasitasPola(pola, k.p.skema);
  const isi = sub === 'kalender' ? renderKalender(k, kap) : sub === 'pola' ? bagianPola(k.p) : bagianSkema(k.p);
  return `<div class="mb-3 flex flex-wrap gap-1 border-b border-slate-200">${SUB.map((s) => `<button data-aksi="skemaSub" data-sub="${s.id}" class="-mb-px border-b-2 px-3 py-1.5 text-sm font-medium ${s.id === sub ? 'border-[#2347b8] text-[#2347b8]' : 'border-transparent text-slate-500 hover:text-slate-800'}">${s.label}</button>`).join('')}</div>${isi}`;
}

const salinPola = (x: PolaMinggu): PolaMinggu => [...x] as PolaMinggu;
const polaDari = (p: Proyek, kunci: string): PolaMinggu | undefined =>
  kunci === 'reguler' ? p.polaReguler : kunci === 'manual' ? p.penggantiManual?.pola : p.kalender.find((x) => x.id === kunci.slice(2))?.pola;

const idSkemaBaru = (p: Proyek): string => {
  let n = p.skema.length + 1;
  while (p.skema.some((s) => s.id === `skema_${n}`)) n++;
  return `skema_${n}`;
};

export function klikSkema(k: Konteks, el: HTMLElement): boolean {
  if (klikKalender(k, el)) return true;
  const d = el.dataset;
  const skema = () => k.p.skema.find((s) => s.id === d.skema);
  switch (d.aksi) {
    case 'skemaSub':
      k.ui.skemaSub = d.sub as 'kalender' | 'pola' | 'skema';
      k.gambar();
      return true;
    case 'hapusBaris':
      k.ubah(() => void skema()?.baris.splice(Number(d.i), 1));
      return true;
    case 'tambahBaris':
      k.ubah(() => {
        const s = skema();
        if (!s) return;
        const tipe = d.tipe as JenisBaris;
        const baru: BarisSkema = { id: `${s.id}_${Date.now()}`, tipe, kegiatan: tipe === 'istirahat' ? 'Istirahat' : 'Pelajaran', durasi: tipe === 'istirahat' ? 15 : 40 };
        s.baris.push(baru);
      });
      return true;
    case 'skemaBaru':
    case 'salinSkema':
      k.ubah((x) => {
        const sumber = d.aksi === 'salinSkema' ? x.skema.find((s) => s.id === d.skema) : x.skema[0];
        if (!sumber) return;
        const id = idSkemaBaru(x);
        x.skema.push({
          id,
          nama: `${sumber.nama.replace(/ \(salinan.*\)$/, '')} (salinan)`,
          jamMulai: sumber.jamMulai,
          warna: WARNA_BARU[x.skema.length % WARNA_BARU.length] as string,
          baris: sumber.baris.map((b, i) => ({ ...b, id: `${id}_${i}` })),
        });
      });
      k.lapor('Skema baru ditambahkan di akhir daftar. Ubah nama, baris, dan durasinya, lalu pasang di Pola mingguan atau pada periode.');
      return true;
    case 'hapusSkema': {
      const s = skema();
      if (!s || pemakaiSkema(k.p, s.id).length) return true;
      if (k.p.skema.length <= 1) {
        k.lapor('Skema terakhir tidak bisa dihapus.');
        return true;
      }
      if (!confirm(`Hapus skema “${s.nama}”?`)) return true;
      k.ubah((x) => void (x.skema = x.skema.filter((y) => y.id !== d.skema)));
      return true;
    }
    case 'aktifkanManual':
      k.ubah((x) => void (x.penggantiManual = { pola: salinPola(x.polaReguler) }));
      return true;
    case 'hapusManual':
      k.ubah((x) => void (x.penggantiManual = null));
      return true;
  }
  return false;
}

export function ubahSkema(k: Konteks, el: HTMLInputElement & HTMLSelectElement): boolean {
  if (ubahKalender(k, el)) return true;
  const d = el.dataset;
  const skema = () => k.p.skema.find((s) => s.id === d.skema);
  const baris = () => skema()?.baris[Number(d.i)];
  switch (d.aksi) {
    case 'pola':
      k.ubah((x) => {
        const pola = polaDari(x, d.kunci ?? '');
        if (pola) pola[Number(d.hari)] = el.value;
      });
      return true;
    case 'namaSkema':
      if (!el.value.trim()) {
        k.lapor('Nama skema tidak boleh kosong.');
        k.gambar();
        return true;
      }
      k.ubah(() => void (skema() && (skema()!.nama = el.value.trim())));
      return true;
    case 'warnaSkema':
      k.ubah(() => void (skema() && (skema()!.warna = el.value)));
      return true;
    case 'jamMulai':
      try {
        keMenit(el.value.trim());
      } catch (err) {
        k.lapor(`Jam mulai ditolak: ${(err as Error).message}`);
        k.gambar();
        return true;
      }
      k.ubah(() => void (skema() && (skema()!.jamMulai = el.value.trim())));
      return true;
    case 'tipeBaris':
      k.ubah(() => void (baris() && (baris()!.tipe = el.value as JenisBaris)));
      return true;
    case 'kegiatanBaris':
      k.ubah(() => void (baris() && (baris()!.kegiatan = el.value)));
      return true;
    case 'durasiBaris':
      k.ubah(() => void (baris() && (baris()!.durasi = Number(el.value))));
      return true;
    case 'manualMulai':
    case 'manualSelesai': {
      const kunci = d.aksi === 'manualMulai' ? 'mulai' : 'selesai';
      k.ubah((x) => {
        if (!x.penggantiManual) return;
        if (el.value) x.penggantiManual[kunci] = el.value;
        else delete x.penggantiManual[kunci];
      });
      return true;
    }
  }
  return false;
}
