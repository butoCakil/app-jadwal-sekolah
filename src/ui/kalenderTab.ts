import { bacaBerkasKalender } from '../io/imporKalender';
import { dalamRentang, daftarPola, hariPekan, jumlahHariKerja, kapasitasPola, periodeUntukTanggal, rombelTidakAktifIds, skemaUntukTanggal, versiUntukTanggal } from '../model/kalender';
import type { JenisKegiatan, Kegiatan, PolaMinggu, Proyek } from '../model/tipe';
import { NAMA_HARI } from '../model/tipe';
import type { DlgKegiatan, Konteks } from './konteks';
import { ringkasKode } from './pemilih';
import { bukaSimpul } from './hub';
import { semesterPada } from '../model/simpul';
import { esc, isoLokal } from './util';
import { WARNA_JENIS } from '../model/warnaJenis';

export { WARNA_JENIS };

export const JENIS: JenisKegiatan[] = ['TKA', 'PKL', 'ASAS', 'ASAJ', 'UKK', 'ujian', 'upacara', 'rapor', 'libur', 'lain'];
const WARNA = WARNA_JENIS;
const NAMA_BULAN_PANJANG = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const HARI_SINGKAT = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

const hariLengkap = (iso: string): string => (hariPekan(iso) <= 5 ? (NAMA_HARI[hariPekan(iso)] as string) : 'Minggu');
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
export function barisPola(p: Proyek, pola: PolaMinggu, kunci: string): string {
  const kap = kapasitasPola(pola, p.skema);
  return `<div class="flex flex-wrap items-end gap-2">${pola.map((id, i) => `<label class="text-xs text-slate-600">${NAMA_HARI[i]}<br>${pilihSkema(p, id, `data-aksi="pola" data-kunci="${kunci}" data-hari="${i}"`)}</label>`).join('')}<span class="rounded-full bg-slate-200 px-2 py-1 text-xs">${kap.perHari.join('+')} = <b>${kap.total} JP</b></span></div>`;
}

function kegiatanPada(p: Proyek, tgl: string): Kegiatan[] {
  return p.kalender.filter((g) => dalamRentang(tgl, g.mulai, g.selesai));
}

function kotakBulan(k: Konteks, bulan: string): string {
  const p = k.p;
  const hariKerja = jumlahHariKerja(p);
  const [y, m] = bulan.split('-').map(Number) as [number, number];
  const hariIni = isoLokal(new Date());
  const awal = `${bulan}-01`;
  const geser = hariPekan(awal);
  const jumlah = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const sel: string[] = [];
  for (let i = 0; i < geser; i++) sel.push('<div class="min-h-[58px] rounded-lg bg-slate-50/50"></div>');
  for (let d = 1; d <= jumlah; d++) {
    const tgl = `${bulan}-${String(d).padStart(2, '0')}`;
    const wk = hariPekan(tgl);
    const kerja = wk < hariKerja;
    // hari non-kerja: rentang panjang (mis. pemadatan, PKL) tidak ditampilkan; acara satu hari tetap tampil
    const keg = kegiatanPada(p, tgl).filter((g) => kerja || g.mulai === g.selesai);
    const libur = keg.some((g) => g.jenis === 'libur');
    const pilih = tgl === k.ui.kalTanggal;
    const acuan = tgl === k.ui.tanggal;
    const bg = libur ? 'bg-red-50' : !kerja ? 'bg-slate-100' : 'bg-white';
    const titik = keg
      .slice(0, 6)
      .map((g) => `<i class="inline-block h-2.5 w-2.5 rounded-full" style="background:${WARNA[g.jenis].titik}" title="${esc(`${g.jenis}: ${g.nama}`)}"></i>`)
      .join('');
    sel.push(`<button data-aksi="kalPilih" data-tgl="${tgl}" class="relative flex min-h-[58px] flex-col items-stretch gap-0.5 rounded-lg border p-1 text-left ${bg} ${pilih ? 'border-[#2347b8] ring-2 ring-[#2347b8]/40' : 'border-slate-200 hover:border-slate-400'}">
      <div class="flex items-center justify-between"><span class="text-xs font-semibold ${tgl === hariIni ? 'rounded-full bg-[#2347b8] px-1.5 text-white' : !kerja || libur ? 'text-red-600' : 'text-slate-700'}">${d}</span>${acuan ? '<span class="rounded bg-sky-100 px-1 text-[9px] font-bold text-sky-700" title="Tanggal acuan: Grid Jadwal menampilkan pekan yang memuat tanggal ini">grid</span>' : ''}</div><div class="flex flex-wrap items-center gap-1">${titik}${keg.length > 6 ? `<span class="text-[10px] text-slate-500">+${keg.length - 6}</span>` : ''}</div></button>`);
  }
  return `<div class="mb-2 flex items-center gap-2"><button class="tombol !px-2" data-aksi="kalBulan" data-bulan="${geserBulan(bulan, -1)}">‹</button>
      <div class="min-w-36 text-center text-base font-bold">${NAMA_BULAN_PANJANG[m - 1]} ${y}</div>
      <button class="tombol !px-2" data-aksi="kalBulan" data-bulan="${geserBulan(bulan, 1)}">›</button>
      <button class="tombol ml-2" data-aksi="kalBulan" data-bulan="${bulanDari(hariIni)}" data-tgl="${hariIni}">Hari ini</button></div>
    <div class="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-slate-500">${HARI_SINGKAT.map((h, i) => `<div class="${i >= hariKerja ? 'text-red-500' : ''}">${h}</div>`).join('')}</div>
    <div class="mt-1 grid grid-cols-7 gap-1">${sel.join('')}</div>
    <div class="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-600">${JENIS.map((j) => `<span class="inline-flex items-center gap-1"><i class="inline-block h-2 w-2 rounded-full" style="background:${WARNA[j].titik}"></i>${j}</span>`).join('')}<span class="inline-flex items-center gap-1"><b class="rounded bg-sky-100 px-1 text-[9px] text-sky-700">grid</b>tanggal acuan Grid Jadwal</span></div>`;
}

function infoTanggal(k: Konteks, tgl: string): string {
  const p = k.p;
  const wk = hariPekan(tgl);
  const kerja = wk < jumlahHariKerja(p);
  const keg = kegiatanPada(p, tgl).filter((g) => kerja || g.mulai === g.selesai);
  const info = skemaUntukTanggal(tgl, p);
  const skema = info.skemaId ? p.skema.find((s) => s.id === info.skemaId) : undefined;
  const versi = versiUntukTanggal(tgl, p);
  const tdkAktif = [...rombelTidakAktifIds(tgl, p.kalender, semesterPada(p, tgl))].map((id) => p.master.rombel.find((r) => r.id === id)?.kode ?? '?');
  const periode = periodeUntukTanggal(tgl, p.kalender);
  const status = info.alasan === 'akhirPekan' ? 'Bukan hari kerja, tidak ada KBM.' : info.alasan === 'libur' ? `Libur: ${esc(info.kegiatanLibur ?? '')}. Tidak ada KBM.` : `Skema <b>${esc(skema?.nama ?? '?')}</b> (${skema ? skema.baris.filter((b) => b.tipe === 'kbm').length : 0} JP) · pola dari ${info.sumber === 'kegiatan' ? 'kegiatan kalender' : info.sumber === 'manual' ? 'pola manual' : 'pola reguler'}`;
  return `<div class="text-base font-bold">${esc(tglPanjang(tgl))}</div>
    <div class="mt-1 text-sm text-slate-600">${status}</div>
    ${kerja && info.alasan === 'normal' ? `<div class="mt-1 text-xs text-slate-500">Versi jadwal: <b>${esc(versi?.nama ?? '—')}</b>${periode ? ` · periode: <b>${esc(periode.nama)}</b>` : ''}</div>` : ''}
    ${tdkAktif.length ? `<div class="mt-1 text-xs text-amber-800">Rombel tidak aktif: ${esc(ringkasKode(tdkAktif, 'rombel', 8))}</div>` : ''}
    <div class="mt-3 text-xs font-semibold text-slate-500">KEGIATAN PADA TANGGAL INI</div>
    <div class="mt-1 space-y-2">${keg.length
      ? keg.map((g) => `<div class="rounded-lg border border-slate-200 p-2"><div class="flex flex-wrap items-center gap-2"><span class="lencana ${WARNA[g.jenis].chip}">${g.jenis}</span><b class="text-sm">${esc(g.nama)}</b></div>
          <div class="mt-0.5 text-xs text-slate-500">${esc(tglRentang(g.mulai, g.selesai))}${g.catatan ? ` · ${esc(g.catatan)}` : ''}</div>
          <div class="mt-1.5 flex flex-wrap gap-1.5"><button class="tombol !px-2 !py-0.5 !text-xs" data-aksi="kegBuka" data-id="${esc(g.id)}">${g.jenis === 'libur' || g.agenda ? 'Ubah' : 'Buka jadwal kegiatan'}</button></div></div>`).join('')
      : '<div class="text-sm text-slate-500">Tidak ada kegiatan.</div>'}</div>
    <div class="mt-3 flex flex-wrap gap-2"><button class="tombol-utama" data-aksi="kegBaru" data-tgl="${tgl}">+ Kegiatan pada tanggal ini</button>
      <button class="tombol" data-aksi="acuanGrid" data-tgl="${tgl}">Lihat di Grid Jadwal</button></div>`;
}

const tglSingkat = (iso: string): string => {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return `${d} ${(NAMA_BULAN_PANJANG[m - 1] as string).slice(0, 3)} ${y}`;
};

/** Daftar semua kegiatan, ringkas; mengubah lewat modal. */
function daftarKegiatan(k: Konteks): string {
  const p = k.p;
  const urut = [...p.kalender].sort((a, b) => a.mulai.localeCompare(b.mulai) || a.selesai.localeCompare(b.selesai));
  const baris = urut
    .map((g) => {
      const tdk = g.rombelTidakAktif.map((i) => p.master.rombel.find((r) => r.id === i)?.kode ?? '?');
      const aktif = p.periodeAktifId === g.id;
      const pola = g.polaId ? daftarPola(p).find((x) => x.id === g.polaId)?.nama : undefined;
      const rentang = g.mulai === g.selesai ? tglSingkat(g.mulai) : `${tglSingkat(g.mulai)} – ${tglSingkat(g.selesai)}`;
      return `<tr class="border-t border-slate-100 align-top ${aktif ? 'bg-sky-50/70' : ''}">
        <td class="whitespace-nowrap px-3 py-2 text-xs text-slate-600">${esc(rentang)}</td>
        <td class="px-2 py-2"><div class="font-medium">${esc(g.nama)}${g.agenda ? ' <span class="lencana bg-slate-100 !py-0 text-slate-500" title="Agenda kalender akademik: referensi, tidak mengubah jadwal">agenda</span>' : ''}${g.untuk ? ` <span class="text-xs text-slate-500">· ${esc(g.untuk)}</span>` : ''}</div>${g.catatan ? `<div class="text-xs text-slate-500">${esc(g.catatan)}</div>` : ''}</td>
        <td class="px-2 py-2"><span class="lencana ${WARNA[g.jenis].chip}">${g.jenis}</span></td>
        <td class="px-2 py-2 text-xs">${tdk.length ? `<span class="text-amber-800" title="${esc(tdk.join(', '))}">${esc(ringkasKode(tdk, 'rombel', 4))}</span>` : '<span class="text-slate-400">—</span>'}</td>
        <td class="px-2 py-2 text-xs">${pola ? `<span class="lencana bg-sky-100 text-sky-800">${esc(pola)}</span> ` : ''}${g.versiId ? `<span class="lencana bg-emerald-100 text-emerald-800">${g.rombelTerdampak ? `${g.rombelTerdampak.length} kelas khusus` : 'jadwal khusus'}</span>` : ''}${!pola && !g.versiId ? '<span class="text-slate-400">—</span>' : ''}</td>
        <td class="whitespace-nowrap px-2 py-2 text-right"><button class="tombol !px-2 !py-0.5 !text-xs" data-aksi="kegBuka" data-id="${esc(g.id)}">${g.jenis === 'libur' || g.agenda ? 'Ubah' : 'Buka jadwal'}</button> <button class="px-1 text-red-600" data-aksi="hapusKegiatan" data-id="${esc(g.id)}" title="Hapus">✕</button></td></tr>`;
    })
    .join('');
  return `<div class="overflow-x-auto rounded-xl border border-slate-200 bg-white"><table class="w-full text-sm">
    <thead class="bg-slate-50 text-left text-xs text-slate-500"><tr><th class="px-3 py-1.5">Tanggal</th><th class="px-2">Kegiatan</th><th class="px-2">Jenis</th><th class="px-2">Kelas tidak aktif</th><th class="px-2">Pola &amp; jadwal</th><th></th></tr></thead>
    <tbody>${baris || '<tr><td colspan="6" class="p-4 text-center text-slate-500">Belum ada kegiatan.</td></tr>'}</tbody></table></div>`;
}

/** Rombel dikelompokkan per tingkat dan jurusan, untuk centang massal. */
function kelompokRombel(p: Proyek): { kunci: string; judul: string; ids: string[]; kode: Map<string, string> }[] {
  const urutTingkat = ['X', 'XI', 'XII'];
  const peta = new Map<string, { judul: string; ids: string[]; kode: Map<string, string> }>();
  for (const r of [...p.master.rombel].sort((a, b) => urutTingkat.indexOf(a.tingkat) - urutTingkat.indexOf(b.tingkat) || a.jurusan.localeCompare(b.jurusan) || a.nomor - b.nomor)) {
    const kunci = `${r.tingkat}|${r.jurusan}`;
    const x: { judul: string; ids: string[]; kode: Map<string, string> } = peta.get(kunci) ?? { judul: `${r.tingkat} ${r.jurusan}`, ids: [], kode: new Map() };
    x.ids.push(r.id);
    x.kode.set(r.id, r.kode);
    peta.set(kunci, x);
  }
  return [...peta.entries()].map(([kunci, v]) => ({ kunci, ...v }));
}

export function renderDlgKegiatan(k: Konteks): string {
  const d = k.ui.dlg;
  if (!d) return '';
  const p = k.p;
  const libur = d.jenis === 'libur';
  const n = jumlahHariKerja(p);
  const agendaHtml = `<div class="mt-3 flex flex-wrap items-center gap-3 rounded-lg bg-slate-50 p-2"><label class="flex items-center gap-2 text-sm"><input type="checkbox" data-aksi="dkf" data-f="agenda" ${d.agenda ? 'checked' : ''}> Agenda saja (referensi kalender akademik, tidak mengubah jadwal)</label>
      <label class="flex items-center gap-1 text-xs text-slate-600">Untuk<input class="isian !py-0.5 w-32 font-normal" value="${esc(d.untuk)}" placeholder="mis. X, XII / semua" data-aksi="dkf" data-f="untuk"></label></div>`;
  const hari = libur || d.agenda
    ? ''
    : `<div class="mt-3"><div class="text-xs font-semibold text-slate-600">Berlaku pada hari</div>
        <div class="mt-1 flex flex-wrap items-center gap-3">${NAMA_HARI.slice(0, n).map((h, i) => `<label class="inline-flex items-center gap-1 text-sm"><input type="checkbox" data-aksi="dkHari" data-hari="${i}" ${d.hari.size === 0 || d.hari.has(i) ? 'checked' : ''}>${h}</label>`).join('')}</div>
        <div class="mt-0.5 text-[11px] text-slate-500">Semua dicentang = setiap hari kerja dalam rentang. Hilangkan centang bila kegiatan hanya pada hari tertentu (mis. TKA tiap Senin dan Kamis); hari lain mengikuti jadwal induk.</div></div>`;
  const pola = libur || d.agenda
    ? ''
    : `<label class="mt-3 block text-xs font-semibold text-slate-600">Skema mingguan (kombinasi skema jam per hari)<select class="isian mt-1 w-full font-normal" data-aksi="dkf" data-f="polaId"><option value="">Ikut induk: ${esc(daftarPola(p)[0]?.nama ?? '')}</option>${daftarPola(p).filter((x) => !x.default).map((x) => `<option value="${esc(x.id)}" ${d.polaId === x.id ? 'selected' : ''}>${esc(x.nama)}</option>`).join('')}</select><span class="mt-0.5 block text-[11px] font-normal text-slate-500">Pola baru (mis. 10,10,11,11,9) dibuat di Skema &amp; Kalender › Pola mingguan.</span></label>`;
  const ketBaru = !libur && !d.agenda && d.baru ? '<div class="mt-3 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-900">Setelah disimpan, semua kelas mula-mula <b>ikut jadwal induk</b>. Atur kelas yang terdampak, tidak aktif, dan jadwal khususnya di halaman Periode &amp; Jadwal.</div>' : '';
  return `<div class="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4" data-aksi="dkTutup">
    <div class="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl" data-aksi="dkDiam">
      <div class="flex items-center justify-between"><h3 class="text-lg font-bold">${d.baru ? 'Kegiatan baru' : 'Ubah kegiatan'}</h3><button class="px-2 text-xl leading-none text-slate-500 hover:text-slate-900" data-aksi="dkTutup" title="Tutup tanpa menyimpan (Esc)">×</button></div>
      <div class="mt-3 grid gap-3 sm:grid-cols-3">
        <label class="block text-xs font-semibold text-slate-600 sm:col-span-2">Nama kegiatan<input class="isian mt-1 w-full font-normal" value="${esc(d.nama)}" data-aksi="dkf" data-f="nama" placeholder="mis. Pemadatan TKA"></label>
        <label class="block text-xs font-semibold text-slate-600">Jenis<select class="isian mt-1 w-full font-normal" data-aksi="dkf" data-f="jenis">${JENIS.map((j) => `<option ${j === d.jenis ? 'selected' : ''}>${j}</option>`).join('')}</select></label>
        <label class="block text-xs font-semibold text-slate-600">Mulai<input type="date" class="isian mt-1 w-full font-normal" value="${esc(d.mulai)}" data-aksi="dkf" data-f="mulai"></label>
        <label class="block text-xs font-semibold text-slate-600">Selesai<input type="date" class="isian mt-1 w-full font-normal" value="${esc(d.selesai)}" data-aksi="dkf" data-f="selesai"></label>
        <div class="self-end pb-1 text-xs text-slate-500">${libur ? 'Libur: tidak ada KBM pada rentang ini.' : 'Akhir pekan dan hari non-kerja tidak ikut dihitung.'}</div></div>
      ${agendaHtml}${hari}${pola}${ketBaru}
      <label class="mt-3 block text-xs font-semibold text-slate-600">Catatan<textarea rows="2" class="isian mt-1 w-full font-normal" data-aksi="dkf" data-f="catatan">${esc(d.catatan)}</textarea></label>
      ${d.galat ? `<div class="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-800">${esc(d.galat)}</div>` : ''}
      <div class="mt-4 flex flex-wrap items-center gap-2">${d.baru ? '' : '<button class="tombol !text-red-600" data-aksi="dkHapus">Hapus kegiatan</button>'}<span class="flex-1"></span><button class="tombol" data-aksi="dkTutup">Batal</button><button class="tombol-utama" data-aksi="dkSimpan">Simpan</button></div></div></div>`;
}

export function renderKalender(k: Konteks): string {
  const p = k.p;
  const bulan = k.ui.kalBulan || bulanDari(k.ui.tanggal);
  const n = jumlahHariKerja(p);
  return `<div class="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 text-sm">
      <span class="font-semibold">Semester:</span> ${(p.semesters ?? []).length ? (p.semesters ?? []).map((s) => `<b>${esc(s.nama)}</b> <span class="text-slate-500">${s.mulai && s.selesai ? esc(tglRentang(s.mulai, s.selesai)) : 'belum bertanggal'}</span>`).join(' · ') : '<span class="text-slate-500">rentang semester belum diatur</span>'}
      <span class="text-xs text-slate-500">· Jadwal tiap kegiatan diatur di <button class="underline" data-tab="info">Periode &amp; Jadwal</button></span>
      <span class="text-xs text-slate-500">· Hari kerja: Senin–${esc(NAMA_HARI[n - 1] as string)} <button class="underline" data-aksi="skemaSub" data-sub="pola">ubah</button></span>
      <div class="ml-auto flex flex-wrap gap-2"><label class="tombol cursor-pointer" title="Membaca kalender akademik dari berkas: .xlsx, .csv, .ics, atau .json">Baca dari berkas…<input type="file" id="imporKalender" accept=".xlsx,.csv,.tsv,.txt,.ics,.json" class="hidden"></label>
        <button class="tombol-utama" data-aksi="kegBaru" data-tgl="${esc(k.ui.kalTanggal)}">+ Kegiatan</button></div></div>
    <div class="grid gap-4 lg:grid-cols-2"><div class="kartu p-3">${kotakBulan(k, bulan)}</div>
      <div class="kartu p-3">${infoTanggal(k, k.ui.kalTanggal)}</div></div>
    <h3 class="mb-2 mt-5 text-base font-semibold">Semua kegiatan <span class="text-xs font-normal text-slate-500">${p.kalender.length} data, diurutkan menurut tanggal mulai</span></h3>
    ${daftarKegiatan(k)}
    <div class="mt-2 text-xs text-slate-500">Kalender akademik dari berkas dibaca dari kolom “Kegiatan” dan “Tanggal” (atau “Mulai” dan “Selesai”); jenis ditebak dari namanya dan bisa diubah. Kegiatan yang sama persis (nama dan tanggal) tidak ditambahkan dua kali.</div>`;
}

/** Tanggal acuan grid yang sesuai untuk periode: hari ini bila masih di dalam periode, selain itu awal periode; bila jatuh pada hari non-kerja, maju ke hari kerja pertama berikutnya (selama masih di dalam periode). */
export function tanggalUntukPeriode(g: Kegiatan, hariIni: string, hariKerja = 5): string {
  let t = dalamRentang(hariIni, g.mulai, g.selesai) ? hariIni : g.mulai;
  for (let i = 0; i < 7 && hariPekan(t) >= hariKerja; i++) {
    const [y, m, d] = t.split('-').map(Number) as [number, number, number];
    const n = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
    if (!dalamRentang(n, g.mulai, g.selesai)) break;
    t = n;
  }
  return t;
}

const idKeg = () => `k${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

const SIMPAN_DEFAULT = (tgl: string, aktifkan = false): DlgKegiatan => ({ id: '', baru: true, nama: '', jenis: 'lain', mulai: tgl, selesai: tgl, tdk: new Set(), polaId: '', hari: new Set(), agenda: false, untuk: '', catatan: '', aktifkan, galat: '' });

/** Membuka modal untuk kegiatan yang ada (id) atau baru (tgl). Dipakai juga oleh tab Master Data > Data. */
export function bukaDlgKegiatan(k: Konteks, opsi: { id?: string; tgl?: string; jenis?: JenisKegiatan }): void {
  const g = opsi.id ? k.p.kalender.find((x) => x.id === opsi.id) : undefined;
  if (g) {
    k.ui.dlg = { id: g.id, baru: false, nama: g.nama, jenis: g.jenis, mulai: g.mulai, selesai: g.selesai, tdk: new Set(g.rombelTidakAktif), polaId: g.polaId ?? '', hari: new Set(g.hariBerlaku ?? []), agenda: !!g.agenda, untuk: g.untuk ?? '', catatan: g.catatan ?? '', aktifkan: k.p.periodeAktifId === g.id, galat: '' };
  } else {
    const d = SIMPAN_DEFAULT(opsi.tgl ?? isoLokal(new Date()));
    if (opsi.jenis) d.jenis = opsi.jenis;
    if (opsi.jenis === 'PKL') d.nama = 'PKL';
    k.ui.dlg = d;
  }
  k.gambar();
}

function aturPeriodeAktifUI(k: Konteks, g: { mulai: string; selesai: string }): void {
  k.ui.tanggal = tanggalUntukPeriode(g as Kegiatan, isoLokal(new Date()), jumlahHariKerja(k.p));
  k.ui.kalTanggal = k.ui.tanggal;
  k.ui.kalBulan = bulanDari(k.ui.tanggal);
}

function simpanDlg(k: Konteks): void {
  const d = k.ui.dlg;
  if (!d) return;
  const nama = d.nama.trim();
  let galat = '';
  if (!nama) galat = 'Nama kegiatan tidak boleh kosong.';
  else if (!d.mulai || !d.selesai) galat = 'Tanggal mulai dan selesai harus diisi.';
  else {
    try {
      hariPekan(d.mulai);
      hariPekan(d.selesai);
      if (d.selesai < d.mulai) galat = 'Tanggal selesai lebih awal dari tanggal mulai.';
    } catch (e) {
      galat = (e as Error).message;
    }
  }
  if (galat) {
    d.galat = galat;
    k.gambar();
    return;
  }
  const id = d.baru ? idKeg() : d.id;
  const libur = d.jenis === 'libur' || d.agenda;
  k.ui.dlg = null;
  if (!libur) aturPeriodeAktifUI(k, d);
  const n = jumlahHariKerja(k.p);
  const hariBerlaku = [...d.hari].filter((h) => h < n).sort((x, y) => x - y);
  k.ubah((x) => {
    const g: Kegiatan = x.kalender.find((y) => y.id === id) ?? { id, nama, jenis: d.jenis, mulai: d.mulai, selesai: d.selesai, rombelTidakAktif: [] };
    if (!x.kalender.includes(g)) {
      x.kalender.push(g);
      if (!libur) {
        // kegiatan baru: versi jadwal sendiri yang mula-mula kosong; semua kelas ikut induk, kelas PKL induk tetap tidak aktif
        const versiId = `v${Date.now().toString(36)}`;
        x.versi.push({ id: versiId, nama, jenis: 'varian', slots: [] });
        g.versiId = versiId;
        g.rombelTerdampak = [];
        g.rombelTidakAktif = [...(semesterPada(x, d.mulai)?.rombelTidakAktif ?? [])];
      }
    }
    g.nama = nama;
    g.jenis = d.jenis;
    g.mulai = d.mulai;
    g.selesai = d.selesai;
    if (d.agenda) g.agenda = true;
    else delete g.agenda;
    if (d.untuk.trim()) g.untuk = d.untuk.trim();
    else delete g.untuk;
    if (libur) g.rombelTidakAktif = [];
    if (!libur && d.polaId) g.polaId = d.polaId;
    else delete g.polaId;
    if (!libur && hariBerlaku.length && hariBerlaku.length < n) g.hariBerlaku = hariBerlaku;
    else delete g.hariBerlaku;
    const v = g.versiId ? x.versi.find((y) => y.id === g.versiId) : undefined;
    if (v && v.jenis !== 'reguler') v.nama = nama;
    if (d.catatan.trim()) g.catatan = d.catatan.trim();
    else delete g.catatan;
  });
  if (!libur) {
    k.ui.fokus = id;
    if (d.baru) k.ui.tab = 'kelas';
    k.gambar();
  }
  k.lapor(d.baru ? `Kegiatan “${nama}” ditambahkan.` : `Kegiatan “${nama}” disimpan.`);
}

export function klikKalender(k: Konteks, el: HTMLElement): boolean {
  const d = el.dataset;
  const dlg = k.ui.dlg;
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
    case 'acuanGrid':
      k.ui.tanggal = d.tgl ?? k.ui.tanggal;
      k.ui.fokus = 'auto';
      k.ke('grid');
      return true;
    case 'kegBaru':
      bukaDlgKegiatan(k, { tgl: d.tgl });
      return true;
    case 'kegBuka': {
      const g = k.p.kalender.find((x) => x.id === d.id);
      if (g && g.jenis !== 'libur' && !g.agenda && !d.modal) {
        bukaSimpul(k, g.id);
        return true;
      }
      bukaDlgKegiatan(k, { id: d.id });
      return true;
    }
    case 'dkDiam':
      return true;
    case 'dkTutup':
      k.ui.dlg = null;
      k.gambar();
      return true;
    case 'dkSemua':
      if (dlg) {
        dlg.tdk = new Set(k.p.master.rombel.map((r) => r.id));
        k.gambar();
      }
      return true;
    case 'dkKosong':
      if (dlg) {
        dlg.tdk = new Set();
        k.gambar();
      }
      return true;
    case 'dkGrup':
      if (dlg) {
        const g = kelompokRombel(k.p).find((x) => x.kunci === d.kunci);
        if (g) {
          const semua = g.ids.every((i) => dlg.tdk.has(i));
          for (const i of g.ids) {
            if (semua) dlg.tdk.delete(i);
            else dlg.tdk.add(i);
          }
        }
        k.gambar();
      }
      return true;
    case 'dkSimpan':
      simpanDlg(k);
      return true;
    case 'dkHapus':
      if (dlg && !dlg.baru) {
        const g = k.p.kalender.find((x) => x.id === dlg.id);
        if (g && !confirm(`Hapus kegiatan “${g.nama}”?`)) return true;
        const id = dlg.id;
        k.ui.dlg = null;
        k.ubah((x) => {
          x.kalender = x.kalender.filter((y) => y.id !== id);
          if (x.periodeAktifId === id) delete x.periodeAktifId;
        });
      }
      return true;
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
      aturPeriodeAktifUI(k, g);
      k.ubah((x) => void (x.periodeAktifId = g.id));
      k.lapor(`Periode aktif: ${g.nama}. Grid Jadwal menampilkan pekan ${k.ui.tanggal}.`);
      return true;
    }
  }
  return false;
}

export function ubahKalender(k: Konteks, el: HTMLInputElement & HTMLSelectElement): boolean {
  const d = el.dataset;
  const dlg = k.ui.dlg;
  if (d.aksi === 'dkHari' && dlg) {
    const n = jumlahHariKerja(k.p);
    if (dlg.hari.size === 0) for (let i = 0; i < n; i++) dlg.hari.add(i);
    const h = Number(d.hari);
    if (el.checked) dlg.hari.add(h);
    else dlg.hari.delete(h);
    if (dlg.hari.size === n) dlg.hari.clear();
    return true;
  }
  if (d.aksi === 'dkTdk' && dlg) {
    if (el.checked) dlg.tdk.add(d.id ?? '');
    else dlg.tdk.delete(d.id ?? '');
    return true;
  }
  if (d.aksi === 'dkf' && dlg) {
    switch (d.f) {
      case 'nama': dlg.nama = el.value; break;
      case 'jenis': dlg.jenis = el.value as JenisKegiatan; k.gambar(); break;
      case 'mulai': dlg.mulai = el.value; break;
      case 'selesai': dlg.selesai = el.value; break;
      case 'polaId': dlg.polaId = el.value; break;
      case 'catatan': dlg.catatan = el.value; break;
      case 'agenda': dlg.agenda = el.checked; k.gambar(); break;
      case 'untuk': dlg.untuk = el.value; break;
      case 'aktifkan': dlg.aktifkan = el.checked; break;
    }
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
