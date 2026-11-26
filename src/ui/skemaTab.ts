import type { JenisKegiatan, PolaMinggu, Proyek } from '../model/tipe';
import { NAMA_HARI } from '../model/tipe';
import { hitungSkema, jumlahJamTampil, kapasitasKbm } from '../model/skema';
import { kapasitasPola, selisihKapasitas } from '../model/kalender';
import { esc } from './util';

const JENIS: JenisKegiatan[] = ['TKA', 'PKL', 'ASAS', 'UKK', 'libur', 'lain'];

function pilihSkema(p: Proyek, nilai: string, atribut: string): string {
  return `<select class="isian" ${atribut}>${p.skema
    .map((s) => `<option value="${esc(s.id)}" ${s.id === nilai ? 'selected' : ''}>${esc(s.nama)}</option>`)
    .join('')}</select>`;
}

function barisPola(p: Proyek, pola: PolaMinggu, kunci: string): string {
  const kap = kapasitasPola(pola, p.skema);
  return `<div class="flex flex-wrap items-end gap-2">${pola
    .map(
      (id, i) =>
        `<label class="text-xs text-slate-600">${NAMA_HARI[i]}<br>${pilihSkema(p, id, `data-aksi="pola" data-kunci="${kunci}" data-hari="${i}"`)}</label>`,
    )
    .join('')}<span class="rounded-full bg-slate-200 px-2 py-1 text-xs">${kap.perHari.join('+')} = <b>${kap.total} JP</b></span></div>`;
}

export function renderSkemaTab(p: Proyek): string {
  const kapReg = kapasitasPola(p.polaReguler, p.skema);
  const sel = selisihKapasitas(p.master.rombel, kapReg);
  const infoSelisih = sel.length
    ? `<div class="mt-2 rounded-lg bg-red-50 p-2 text-xs text-red-800">Selisih terhadap kebutuhan (data sumber), diputuskan manual: ${sel
        .map((s) => `${esc(p.master.rombel.find((r) => r.id === s.rombelId)?.kode ?? s.rombelId)} butuh ${s.butuh}, tersedia ${s.kapasitas}`)
        .join('; ')}</div>`
    : '';

  const kartuSkema = p.skema
    .map((s) => {
      const hit = hitungSkema(s);
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
          <div class="font-semibold">${esc(s.nama)}</div>
          <div class="text-xs opacity-90">${jumlahJamTampil(s)} jam tampil · ${kapasitasKbm(s)} JP pelajaran</div></div>
        <div class="p-2"><label class="text-xs text-slate-600">Mulai <input class="isian w-20" value="${esc(s.jamMulai)}" data-aksi="jamMulai" data-skema="${esc(s.id)}"></label>
        <table class="mt-2 w-full">${baris}</table>
        <div class="mt-2 flex gap-2"><button class="tombol" data-aksi="tambahBaris" data-skema="${esc(s.id)}" data-tipe="kbm">+ pelajaran</button>
        <button class="tombol" data-aksi="tambahBaris" data-skema="${esc(s.id)}" data-tipe="istirahat">+ istirahat</button></div></div></div>`;
    })
    .join('');

  const manual = p.penggantiManual;
  const blokManual = manual
    ? `${barisPola(p, manual.pola, 'manual')}
       <div class="mt-2 flex flex-wrap items-center gap-2 text-xs">Berlaku
         <input type="date" class="isian" value="${esc(manual.mulai ?? '')}" data-aksi="manualMulai"> s/d
         <input type="date" class="isian" value="${esc(manual.selesai ?? '')}" data-aksi="manualSelesai">
         <span class="text-slate-500">(kosong = semua tanggal)</span>
         <button class="tombol" data-aksi="hapusManual">Lepas penggantian manual</button></div>`
    : `<button class="tombol" data-aksi="aktifkanManual">Pasang pola manual (salin dari reguler)</button>`;

  const kalender = p.kalender
    .map(
      (k) => `<div class="rounded-lg border border-slate-200 bg-white p-2 text-sm">
        <div class="flex flex-wrap items-center gap-2">
          <input class="isian w-44" value="${esc(k.nama)}" data-aksi="kNama" data-id="${esc(k.id)}">
          <select class="isian" data-aksi="kJenis" data-id="${esc(k.id)}">${JENIS.map((j) => `<option ${j === k.jenis ? 'selected' : ''}>${j}</option>`).join('')}</select>
          <input type="date" class="isian" value="${esc(k.mulai)}" data-aksi="kMulai" data-id="${esc(k.id)}"> s/d
          <input type="date" class="isian" value="${esc(k.selesai)}" data-aksi="kSelesai" data-id="${esc(k.id)}">
          <button class="text-red-600" data-aksi="hapusKegiatan" data-id="${esc(k.id)}">Hapus</button></div>
        ${
          k.jenis === 'libur'
            ? '<div class="mt-1 text-xs text-slate-500">Libur: tidak ada KBM pada rentang ini.</div>'
            : `<div class="mt-2 text-xs text-slate-600">${
                k.pola
                  ? `${barisPola(p, k.pola, `k:${k.id}`)}<button class="tombol mt-1" data-aksi="lepasPolaKegiatan" data-id="${esc(k.id)}">Tanpa pola khusus</button>`
                  : `<button class="tombol" data-aksi="pasangPolaKegiatan" data-id="${esc(k.id)}">Beri pola khusus</button>`
              }</div>`
        }</div>`,
    )
    .join('');

  return `<section class="mb-6"><h2 class="mb-2 text-lg font-semibold">Pola mingguan reguler</h2>
      ${barisPola(p, p.polaReguler, 'reguler')}${infoSelisih}</section>
    <section class="mb-6"><h2 class="mb-2 text-lg font-semibold">Pola manual (menimpa kalender dan reguler)</h2>${blokManual}</section>
    <section class="mb-6"><h2 class="mb-2 text-lg font-semibold">Kalender akademik</h2>
      <div class="space-y-2">${kalender || '<div class="text-sm text-slate-500">Belum ada kegiatan.</div>'}</div>
      <button class="tombol-utama mt-2" data-aksi="tambahKegiatan">+ Kegiatan</button></section>
    <section><h2 class="mb-2 text-lg font-semibold">Template skema jam</h2>
      <div class="grid grid-cols-1 gap-3 lg:grid-cols-3">${kartuSkema}</div></section>`;
}
