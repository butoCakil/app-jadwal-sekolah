import { bacaBerkasKalender } from '../io/imporKalender';
import { dalamRentang, hariPekan, periodeUntukTanggal, rombelTidakAktifIds, skemaUntukTanggal, versiReguler, versiUntukTanggal } from '../model/kalender';
import type { JenisKegiatan, Kegiatan, PolaMinggu, Proyek } from '../model/tipe';
import { NAMA_HARI } from '../model/tipe';
import type { Konteks } from './konteks';
import { ringkasKode, tombolPemilih } from './pemilih';
import { esc, isoLokal } from './util';

export const JENIS: JenisKegiatan[] = ['TKA', 'PKL', 'ASAS', 'ASAJ', 'UKK', 'libur', 'lain'];
const WARNA: Record<JenisKegiatan, { titik: string; chip: string }> = {
  TKA: { titik: '#0284c7', chip: 'bg-sky-100 text-sky-800' },
  PKL: { titik: '#d97706', chip: 'bg-amber-100 text-amber-800' },
  ASAS: { titik: '#7c3aed', chip: 'bg-violet-100 text-violet-800' },
  ASAJ: { titik: '#c026d3', chip: 'bg-fuchsia-100 text-fuchsia-800' },
  UKK: { titik: '#0d9488', chip: 'bg-teal-100 text-teal-800' },
  libur: { titik: '#dc2626', chip: 'bg-red-100 text-red-800' },
  lain: { titik: '#64748b', chip: 'bg-slate-200 text-slate-700' },
};
const NAMA_BULAN_PANJANG = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const HARI_SINGKAT = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

const hariLengkap = (iso: string): string => (hariPekan(iso) <= 4 ? (NAMA_HARI[hariPekan(iso)] as string) : hariPekan(iso) === 5 ? 'Sabtu' : 'Minggu');
const tglPanjang = (iso: string): string => {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return `${hariLengkap(iso)}, ${d} ${NAMA_BULAN_PANJANG[m - 1]} ${y}`;
};
const tglRentang = (a: string, b: string): string => (a === b ? tglPanjang(a).replace(/^[^,]+, /, '') : `${tglPanjang(a).replace(/^[^,]+, /, '')} – ${tglPanjang(b).replace(/^[^,]+, /, '')}`);

export const bulanDari = (tgl: string): string => tgl.slice(0, 7);
const geserBulan = (bulan: string, n: number): string => {
  const [y, m] = bulan.split('-').map(Number) as [number, number];
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`;
};

function pilihSkema(p: Proyek, nilai: string, atribut: string): string {
  return `<select class="isian" ${atribut}>${p.skema.map((s) => `<option value="${esc(s.id)}" ${s.id === nilai ? 'selected' : ''}>${esc(s.nama)}</option>`).join('')}</select>`;
}

/** Baris pilihan skema Senin–Jumat dan jumlah JP; dipakai pola reguler, manual, dan kegiatan. */
export function barisPola(p: Proyek, pola: PolaMinggu, kunci: string, kapasitas: (pola: PolaMinggu) => { perHari: number[]; total: number }): string {
  const kap = kapasitas(pola);
  return `<div class="flex flex-wrap items-end gap-2">${pola.map((id, i) => `<label class="text-xs text-slate-600">${NAMA_HARI[i]}<br>${pilihSkema(p, id, `data-aksi="pola" data-kunci="${kunci}" data-hari="${i}"`)}</label>`).join('')}<span class="rounded-full bg-slate-200 px-2 py-1 text-xs">${kap.perHari.join('+')} = <b>${kap.total} JP</b></span></div>`;
}

function kegiatanPada(p: Proyek, tgl: string): Kegiatan[] {
  return p.kalender.filter((g) => dalamRentang(tgl, g.mulai, g.selesai));
}

function kotakBulan(k: Konteks, bulan: string): string {
  const p = k.p;
  const [y, m] = bulan.split('-').map(Number) as [number, number];
  const hariIni = isoLokal(new Date());
  const awal = `${bulan}-01`;
  const geser = hariPekan(awal);
  const jumlah = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const sel: string[] = [];
  for (let i = 0; i < geser; i++) sel.push('<div class="min-h-[74px] rounded-lg bg-slate-50/50"></div>');
  for (let d = 1; d <= jumlah; d++) {
    const tgl = `${bulan}-${String(d).padStart(2, '0')}`;
    const wk = hariPekan(tgl);
    const keg = kegiatanPada(p, tgl);
    const libur = keg.some((g) => g.jenis === 'libur');
    const pilih = tgl === k.ui.kalTanggal;
    const acuan = tgl === k.ui.tanggal;
    const bg = libur ? 'bg-red-50' : wk > 4 ? 'bg-slate-100' : 'bg-white';
    const chip = keg
      .slice(0, 2)
      .map((g) => `<div class="truncate rounded px-1 text-[10px] leading-4 ${WARNA[g.jenis].chip}" title="${esc(g.nama)}">${esc(g.nama)}</div>`)
      .join('');
    sel.push(`<button data-aksi="kalPilih" data-tgl="${tgl}" class="relative flex min-h-[74px] flex-col items-stretch gap-0.5 rounded-lg border p-1 text-left ${bg} ${pilih ? 'border-[#2347b8] ring-2 ring-[#2347b8]/40' : 'border-slate-200 hover:border-slate-400'}">
      <div class="flex items-center justify-between"><span class="text-xs font-semibold ${tgl === hariIni ? 'rounded-full bg-[#2347b8] px-1.5 text-white' : wk > 4 || libur ? 'text-red-600' : 'text-slate-700'}">${d}</span>${acuan ? '<span class="text-[9px] font-bold text-sky-700" title="Tanggal acuan grid">●grid</span>' : ''}</div>${chip}${keg.length > 2 ? `<div class="text-[10px] text-slate-500">+${keg.length - 2} lagi</div>` : ''}</button>`);
  }
  return `<div class="mb-2 flex items-center gap-2"><button class="tombol !px-2" data-aksi="kalBulan" data-bulan="${geserBulan(bulan, -1)}">‹</button>
      <div class="min-w-36 text-center text-base font-bold">${NAMA_BULAN_PANJANG[m - 1]} ${y}</div>
      <button class="tombol !px-2" data-aksi="kalBulan" data-bulan="${geserBulan(bulan, 1)}">›</button>
      <button class="tombol ml-2" data-aksi="kalBulan" data-bulan="${bulanDari(hariIni)}" data-tgl="${hariIni}">Hari ini</button></div>
    <div class="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-slate-500">${HARI_SINGKAT.map((h, i) => `<div class="${i > 4 ? 'text-red-500' : ''}">${h}</div>`).join('')}</div>
    <div class="mt-1 grid grid-cols-7 gap-1">${sel.join('')}</div>
    <div class="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-600">${JENIS.map((j) => `<span class="inline-flex items-center gap-1"><i class="inline-block h-2 w-2 rounded-full" style="background:${WARNA[j].titik}"></i>${j}</span>`).join('')}</div>`;
}

function infoTanggal(k: Konteks, tgl: string): string {
  const p = k.p;
  const wk = hariPekan(tgl);
  const keg = kegiatanPada(p, tgl);
  const info = skemaUntukTanggal(tgl, p);
  const skema = info.skemaId ? p.skema.find((s) => s.id === info.skemaId) : undefined;
  const versi = versiUntukTanggal(tgl, p);
  const tdkAktif = [...rombelTidakAktifIds(tgl, p.kalender)].map((id) => p.master.rombel.find((r) => r.id === id)?.kode ?? '?');
  const periode = periodeUntukTanggal(tgl, p.kalender);
  const status = info.alasan === 'akhirPekan' ? 'Akhir pekan, tidak ada KBM.' : info.alasan === 'libur' ? `Libur: ${esc(info.kegiatanLibur ?? '')}. Tidak ada KBM.` : `Skema <b>${esc(skema?.nama ?? '?')}</b> (${skema ? skema.baris.filter((b) => b.tipe === 'kbm').length : 0} JP) · pola dari ${info.sumber === 'kegiatan' ? 'kegiatan kalender' : info.sumber === 'manual' ? 'pola manual' : 'pola reguler'}`;
  return `<div class="text-base font-bold">${esc(tglPanjang(tgl))}</div>
    <div class="mt-1 text-sm text-slate-600">${status}</div>
    ${wk <= 4 && info.alasan === 'normal' ? `<div class="mt-1 text-xs text-slate-500">Versi jadwal: <b>${esc(versi?.nama ?? '—')}</b>${periode ? ` · periode: <b>${esc(periode.nama)}</b>` : ''}</div>` : ''}
    ${tdkAktif.length ? `<div class="mt-1 text-xs text-amber-800">Rombel tidak aktif: ${esc(ringkasKode(tdkAktif, 'rombel', 8))}</div>` : ''}
    <div class="mt-3 text-xs font-semibold text-slate-500">KEGIATAN PADA TANGGAL INI</div>
    <div class="mt-1 space-y-2">${keg.length
      ? keg.map((g) => `<div class="rounded-lg border border-slate-200 p-2"><div class="flex flex-wrap items-center gap-2"><span class="lencana ${WARNA[g.jenis].chip}">${g.jenis}</span><b class="text-sm">${esc(g.nama)}</b></div>
          <div class="mt-0.5 text-xs text-slate-500">${esc(tglRentang(g.mulai, g.selesai))}${g.catatan ? ` · ${esc(g.catatan)}` : ''}</div>
          <div class="mt-1.5 flex flex-wrap gap-1.5"><button class="tombol !px-2 !py-0.5 !text-xs" data-aksi="kalBuka" data-id="${esc(g.id)}">Ubah</button>${g.jenis !== 'libur' ? `<button class="tombol !px-2 !py-0.5 !text-xs" data-aksi="periodeAktif" data-id="${esc(g.id)}">${p.periodeAktifId === g.id ? '✓ Periode aktif' : 'Jadikan periode aktif'}</button>` : ''}</div></div>`).join('')
      : '<div class="text-sm text-slate-500">Tidak ada kegiatan.</div>'}</div>
    <div class="mt-3 flex flex-wrap gap-2"><button class="tombol-utama" data-aksi="tambahKegiatan" data-tgl="${tgl}">+ Kegiatan pada tanggal ini</button>
      <button class="tombol" data-aksi="acuanGrid" data-tgl="${tgl}">Lihat di Grid Jadwal</button></div>`;
}

const OPSI_VERSI = (p: Proyek, nilai: string | undefined): string =>
  `<option value="">Reguler (bawaan)</option>${p.versi.filter((v) => v.id !== versiReguler(p)?.id).map((v) => `<option value="${esc(v.id)}" ${v.id === nilai ? 'selected' : ''}>${esc(v.nama)}</option>`).join('')}`;

function tabelKegiatan(k: Konteks, kapasitas: (pola: PolaMinggu) => { perHari: number[]; total: number }): string {
  const p = k.p;
  const urut = [...p.kalender].sort((a, b) => a.mulai.localeCompare(b.mulai) || a.selesai.localeCompare(b.selesai));
  const baris = urut
    .map((g) => {
      const buka = k.ui.kalBuka.has(g.id);
      const tdk = g.rombelTidakAktif.map((i) => p.master.rombel.find((r) => r.id === i)?.kode ?? '?');
      const aktif = p.periodeAktifId === g.id;
      const lanjut = buka
        ? `<tr class="bg-slate-50"><td colspan="7" class="px-3 py-2">
            ${g.jenis === 'libur'
              ? '<div class="text-xs text-slate-500">Libur: tidak ada KBM pada rentang ini.</div>'
              : `<div class="grid gap-3 lg:grid-cols-2">
                  <div><div class="mb-1 text-xs font-semibold text-slate-600">Pola mingguan selama periode ini</div>${g.pola
                    ? `${barisPola(p, g.pola, `k:${g.id}`, kapasitas)}<button class="tombol mt-2" data-aksi="lepasPolaKegiatan" data-id="${esc(g.id)}">Tanpa pola khusus (ikut reguler)</button>`
                    : `<div class="text-xs text-slate-500">Mengikuti pola reguler.</div><button class="tombol mt-1" data-aksi="pasangPolaKegiatan" data-id="${esc(g.id)}">Beri pola khusus</button>`}</div>
                  <div><div class="mb-1 text-xs font-semibold text-slate-600">Jadwal pelajaran periode ini</div>
                    <div class="flex flex-wrap items-center gap-2"><select class="isian" data-aksi="kVersi" data-id="${esc(g.id)}">${OPSI_VERSI(p, g.versiId)}</select>
                    <button class="tombol" data-aksi="buatVersi" data-id="${esc(g.id)}" data-dari="reguler" title="Membuat versi jadwal baru khusus periode ini, berisi salinan jadwal reguler">+ Versi baru (salin reguler)</button>
                    <button class="tombol" data-aksi="buatVersi" data-id="${esc(g.id)}" data-dari="kosong">+ Versi kosong</button></div>
                    <div class="mt-1 text-xs text-slate-500">Versi khusus dipakai grid, pemeriksa bentrok, dan Susun Otomatis selama tanggal acuan berada di periode ini.</div></div></div>
                <label class="mt-3 block text-xs text-slate-600">Catatan<input class="isian mt-1 w-full" value="${esc(g.catatan ?? '')}" data-aksi="kCatatan" data-id="${esc(g.id)}"></label>`}</td></tr>`
        : '';
      return `<tr class="border-t border-slate-100 align-middle ${aktif ? 'bg-sky-50/60' : ''}">
        <td class="px-2 py-1"><input class="isian w-full min-w-40" value="${esc(g.nama)}" data-aksi="kNama" data-id="${esc(g.id)}"></td>
        <td class="px-1 py-1"><select class="isian" data-aksi="kJenis" data-id="${esc(g.id)}">${JENIS.map((j) => `<option ${j === g.jenis ? 'selected' : ''}>${j}</option>`).join('')}</select></td>
        <td class="px-1 py-1"><input type="date" class="isian" value="${esc(g.mulai)}" data-aksi="kMulai" data-id="${esc(g.id)}"></td>
        <td class="px-1 py-1"><input type="date" class="isian" value="${esc(g.selesai)}" data-aksi="kSelesai" data-id="${esc(g.id)}"></td>
        <td class="px-1 py-1">${g.jenis === 'libur' ? '<span class="text-xs text-slate-400">—</span>' : tombolPemilih('kegiatanRombel', g.id, ringkasKode(tdk, 'rombel', 3), 'Semua aktif')}</td>
        <td class="px-1 py-1 text-xs">${g.jenis === 'libur' ? '' : `${g.pola ? '<span class="lencana bg-sky-100 text-sky-800">pola khusus</span> ' : ''}${g.versiId ? '<span class="lencana bg-emerald-100 text-emerald-800">jadwal khusus</span>' : ''}`}</td>
        <td class="whitespace-nowrap px-1 py-1 text-right">${g.jenis === 'libur' ? '' : `<button class="tombol !px-2 !py-0.5 !text-xs ${aktif ? '!border-sky-500 !text-sky-700' : ''}" data-aksi="periodeAktif" data-id="${esc(g.id)}" title="Jadikan periode yang sedang dikerjakan">${aktif ? '✓ Aktif' : 'Aktifkan'}</button> `}<button class="tombol !px-2 !py-0.5 !text-xs" data-aksi="kalBuka" data-id="${esc(g.id)}">${buka ? '▲' : '⚙'}</button> <button class="px-1 text-red-600" data-aksi="hapusKegiatan" data-id="${esc(g.id)}" title="Hapus">✕</button></td></tr>${lanjut}`;
    })
    .join('');
  return `<div class="overflow-x-auto rounded-xl border border-slate-200 bg-white"><table class="w-full text-sm">
    <thead class="bg-slate-50 text-left text-xs text-slate-500"><tr><th class="px-2 py-1.5">Kegiatan / periode</th><th class="px-1">Jenis</th><th class="px-1">Mulai</th><th class="px-1">Selesai</th><th class="px-1">Rombel tidak aktif (mis. PKL)</th><th class="px-1">Pengaturan</th><th></th></tr></thead>
    <tbody>${baris || '<tr><td colspan="7" class="p-4 text-center text-slate-500">Belum ada kegiatan.</td></tr>'}</tbody></table></div>`;
}

export function renderKalender(k: Konteks, kapasitas: (pola: PolaMinggu) => { perHari: number[]; total: number }): string {
  const p = k.p;
  const bulan = k.ui.kalBulan || bulanDari(k.ui.tanggal);
  const aktif = p.kalender.find((g) => g.id === p.periodeAktifId);
  return `<div class="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 text-sm">
      <span class="font-semibold">Periode aktif:</span> ${aktif ? `<span class="lencana ${WARNA[aktif.jenis].chip}">${aktif.jenis}</span> <b>${esc(aktif.nama)}</b> <span class="text-slate-500">${esc(tglRentang(aktif.mulai, aktif.selesai))}</span>` : '<span class="text-slate-500">belum dipilih (tanggal acuan mengikuti hari ini)</span>'}
      <div class="ml-auto flex flex-wrap gap-2"><label class="tombol cursor-pointer" title="Membaca kalender akademik dari berkas: .xlsx, .csv, .ics, atau .json">Baca dari berkas…<input type="file" id="imporKalender" accept=".xlsx,.csv,.tsv,.txt,.ics,.json" class="hidden"></label>
        <button class="tombol-utama" data-aksi="tambahKegiatan">+ Kegiatan</button></div></div>
    <div class="grid gap-4 lg:grid-cols-2"><div class="kartu p-3">${kotakBulan(k, bulan)}</div>
      <div class="kartu p-3">${infoTanggal(k, k.ui.kalTanggal)}</div></div>
    <h3 class="mb-2 mt-5 text-base font-semibold">Semua kegiatan <span class="text-xs font-normal text-slate-500">${p.kalender.length} data, diurutkan menurut tanggal mulai</span></h3>
    ${tabelKegiatan(k, kapasitas)}
    <div class="mt-2 text-xs text-slate-500">Kalender akademik dari berkas dibaca dari kolom “Kegiatan” dan “Tanggal” (atau “Mulai” dan “Selesai”); jenis ditebak dari namanya dan bisa diubah. Kegiatan yang sama persis (nama dan tanggal) tidak ditambahkan dua kali.</div>`;
}

/** Tanggal acuan grid yang sesuai untuk periode: hari ini bila masih di dalam periode, selain itu awal periode. */
export function tanggalUntukPeriode(g: Kegiatan, hariIni: string): string {
  return dalamRentang(hariIni, g.mulai, g.selesai) ? hariIni : g.mulai;
}

const idKeg = () => `k${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

export function klikKalender(k: Konteks, el: HTMLElement): boolean {
  const d = el.dataset;
  switch (d.aksi) {
    case 'kalPilih':
      k.ui.kalTanggal = d.tgl ?? k.ui.kalTanggal;
      k.gambar();
      return true;
    case 'kalBulan':
      k.ui.kalBulan = d.bulan ?? k.ui.kalBulan;
      if (d.tgl) k.ui.kalTanggal = d.tgl;
      k.gambar();
      return true;
    case 'kalBuka': {
      const s = k.ui.kalBuka;
      if (s.has(d.id ?? '')) s.delete(d.id ?? '');
      else s.add(d.id ?? '');
      k.gambar();
      return true;
    }
    case 'acuanGrid':
      k.ui.tanggal = d.tgl ?? k.ui.tanggal;
      k.ke('grid');
      return true;
    case 'tambahKegiatan': {
      const tgl = d.tgl ?? isoLokal(new Date());
      const id = idKeg();
      k.ui.kalBuka.add(id);
      k.ubah((x) => void x.kalender.push({ id, nama: 'Kegiatan baru', jenis: 'lain', mulai: tgl, selesai: tgl, rombelTidakAktif: [] }));
      return true;
    }
    case 'hapusKegiatan': {
      const g = k.p.kalender.find((x) => x.id === d.id);
      if (g && !confirm(`Hapus kegiatan “${g.nama}”?`)) return true;
      k.ubah((x) => {
        x.kalender = x.kalender.filter((y) => y.id !== d.id);
        if (x.periodeAktifId === d.id) delete x.periodeAktifId;
      });
      return true;
    }
    case 'periodeAktif': {
      const g = k.p.kalender.find((x) => x.id === d.id);
      if (!g) return true;
      k.ui.tanggal = tanggalUntukPeriode(g, isoLokal(new Date()));
      k.ui.kalTanggal = k.ui.tanggal;
      k.ui.kalBulan = bulanDari(k.ui.tanggal);
      k.ubah((x) => void (x.periodeAktifId = g.id));
      k.lapor(`Periode aktif: ${g.nama}. Grid Jadwal menampilkan pekan ${k.ui.tanggal}.`);
      return true;
    }
    case 'pasangPolaKegiatan':
      k.ubah((x) => {
        const g = x.kalender.find((y) => y.id === d.id);
        if (g) g.pola = [...x.polaReguler] as PolaMinggu;
      });
      return true;
    case 'lepasPolaKegiatan':
      k.ubah((x) => {
        const g = x.kalender.find((y) => y.id === d.id);
        if (g) delete g.pola;
      });
      return true;
    case 'buatVersi': {
      const g = k.p.kalender.find((x) => x.id === d.id);
      if (!g) return true;
      const id = `v${Date.now().toString(36)}`;
      k.ubah((x) => {
        const sumber = versiReguler(x);
        x.versi.push({ id, nama: g.nama, jenis: 'varian', slots: d.dari === 'reguler' && sumber ? structuredClone(sumber.slots) : [] });
        const gg = x.kalender.find((y) => y.id === d.id);
        if (gg) gg.versiId = id;
      });
      k.lapor(`Versi jadwal “${g.nama}” dibuat dan dipakai periode ini.`);
      return true;
    }
  }
  return false;
}

export function ubahKalender(k: Konteks, el: HTMLInputElement & HTMLSelectElement): boolean {
  const d = el.dataset;
  const keg = () => k.p.kalender.find((g) => g.id === d.id);
  switch (d.aksi) {
    case 'kNama':
      k.ubah(() => void (keg() && (keg()!.nama = el.value)));
      return true;
    case 'kJenis':
      k.ubah(() => void (keg() && (keg()!.jenis = el.value as JenisKegiatan)));
      return true;
    case 'kMulai':
      k.ubah(() => void (keg() && (keg()!.mulai = el.value)));
      return true;
    case 'kSelesai':
      k.ubah(() => void (keg() && (keg()!.selesai = el.value)));
      return true;
    case 'kCatatan':
      k.ubah(() => {
        const g = keg();
        if (!g) return;
        if (el.value.trim()) g.catatan = el.value.trim();
        else delete g.catatan;
      });
      return true;
    case 'kVersi':
      k.ubah(() => {
        const g = keg();
        if (!g) return;
        if (el.value) g.versiId = el.value;
        else delete g.versiId;
      });
      return true;
  }
  if (el.id === 'imporKalender') {
    const f = el.files?.[0];
    if (!f) return true;
    void f
      .arrayBuffer()
      .then((buf) => bacaBerkasKalender(f.name, buf))
      .then((h) => {
        el.value = '';
        const ada = new Set(k.p.kalender.map((g) => `${g.nama}|${g.mulai}|${g.selesai}`));
        const baru = h.kegiatan.filter((g) => !ada.has(`${g.nama}|${g.mulai}|${g.selesai}`));
        if (!baru.length) {
          k.lapor(h.peringatan[0] ?? `Tidak ada kegiatan baru di “${f.name}”.`);
          return;
        }
        const ket = `Ditemukan ${h.kegiatan.length} kegiatan di “${f.name}”, ${baru.length} baru${h.peringatan.length ? `, ${h.peringatan.length} peringatan` : ''}.\n\n${baru.slice(0, 8).map((g) => `• ${g.mulai}${g.selesai !== g.mulai ? ` s/d ${g.selesai}` : ''} · ${g.nama} (${g.jenis})`).join('\n')}${baru.length > 8 ? `\n… dan ${baru.length - 8} lainnya` : ''}\n\nTambahkan ke kalender?`;
        if (!confirm(ket)) return;
        k.ubah((x) => void x.kalender.push(...baru));
        k.lapor(`${baru.length} kegiatan ditambahkan dari “${f.name}”.${h.peringatan.length ? ` Perhatian: ${h.peringatan[0]}` : ''}`);
      })
      .catch((e: unknown) => k.lapor(`Berkas kalender gagal dibaca: ${e instanceof Error ? e.message : String(e)}`));
    return true;
  }
  return false;
}
