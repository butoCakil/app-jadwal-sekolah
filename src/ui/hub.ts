// Halaman inti "Periode & Jadwal": pohon semester (induk) dan kegiatan di dalamnya, dengan sub-tab Info, Kelas, Beban, Grid.

import type { Kegiatan, Proyek, Rombel } from '../model/tipe';
import { NAMA_HARI } from '../model/tipe';
import { berlakuPada, daftarPola, dalamRentang, hariPekan, jumlahHariKerja, periodeUntukTanggal } from '../model/kalender';
import { ikutInduk, jadikanTerdampak, jadikanWarisan, kegiatanFokus, modelWarisan, terdampak, versiDari, type Fokus } from '../model/simpul';
import { jpRombel } from '../model/jp';
import type { Konteks, Tab } from './konteks';
import { TAB_HUB } from './konteks';
import { renderGrid, renderModal } from './grid';
import { renderBeban } from './beban';
import { bukaDlgKegiatan, tanggalUntukPeriode, WARNA_JENIS } from './kalenderTab';
import { esc, isoLokal, tambahHari } from './util';

const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const tgl = (iso: string): string => {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return `${d} ${BULAN[m - 1]} ${y}`;
};
const rentang = (a: string, b: string): string => (!a || !b ? 'tanggal belum diatur' : a === b ? tgl(a) : `${tgl(a)} – ${tgl(b)}`);
const hariTeks = (g: Kegiatan): string => (g.hariBerlaku?.length ? `hanya ${g.hariBerlaku.map((h) => NAMA_HARI[h]).join(', ')}` : '');

const urutTingkat = ['X', 'XI', 'XII'];
const urutRombel = (p: Proyek): Rombel[] => {
  const jur = [...new Set(p.master.rombel.map((r) => r.jurusan))];
  return [...p.master.rombel].sort((a, b) => urutTingkat.indexOf(a.tingkat) - urutTingkat.indexOf(b.tingkat) || jur.indexOf(a.jurusan) - jur.indexOf(b.jurusan) || a.nomor - b.nomor);
};

const daftarKegiatan = (p: Proyek): Kegiatan[] => p.kalender.filter((g) => g.jenis !== 'libur').sort((a, b) => a.mulai.localeCompare(b.mulai) || a.selesai.localeCompare(b.selesai));

/** Status waktu kegiatan terhadap hari ini. */
function statusWaktu(mulai: string, selesai: string, hariIni: string): { teks: string; cls: string } {
  if (!mulai || !selesai) return { teks: 'belum bertanggal', cls: 'bg-slate-100 text-slate-500' };
  if (dalamRentang(hariIni, mulai, selesai)) return { teks: 'berlangsung', cls: 'bg-emerald-100 text-emerald-800' };
  if (mulai > hariIni) return { teks: 'akan datang', cls: 'bg-sky-100 text-sky-800' };
  return { teks: 'selesai', cls: 'bg-slate-100 text-slate-500' };
}

/** Tanggal acuan yang masuk akal untuk fokus: di dalam kegiatan (hari berlaku), atau di dalam semester di luar kegiatan. */
function tanggalUntukFokus(p: Proyek, fokus: Fokus, sekarang: string): string {
  const n = jumlahHariKerja(p);
  const g = kegiatanFokus(p, fokus);
  if (g) {
    let t = tanggalUntukPeriode(g, sekarang, n);
    for (let i = 0; i < 7 && !berlakuPada(g, t); i++) {
      const b = tambahHari(t, 1);
      if (b > g.selesai) break;
      t = b;
    }
    return t;
  }
  if (fokus === 'induk' && p.semester?.mulai && p.semester.selesai) {
    const s = p.semester;
    const cocok = (t: string) => hariPekan(t) < n && !periodeUntukTanggal(t, p.kalender);
    if (dalamRentang(sekarang, s.mulai, s.selesai) && cocok(sekarang)) return sekarang;
    for (let t = s.mulai, i = 0; t <= s.selesai && i < 400; t = tambahHari(t, 1), i++) if (cocok(t)) return t;
    return s.mulai;
  }
  return sekarang;
}

/** Membatasi tanggal acuan agar tetap di dalam kegiatan atau semester yang sedang dikerjakan. */
export function jepitTanggal(k: Konteks, t: string): string {
  const g = kegiatanFokus(k.p, k.ui.fokus);
  const [a, b] = g ? [g.mulai, g.selesai] : k.ui.fokus === 'induk' && k.p.semester?.mulai ? [k.p.semester.mulai, k.p.semester.selesai] : ['', ''];
  if (!a || !b) return t;
  if (t < a) return a;
  if (t > b) return b;
  return t;
}

/** Membuka sasaran (induk/kegiatan/menurut tanggal) di halaman Periode & Jadwal. */
export function bukaSimpul(k: Konteks, fokus: Fokus, tab?: Tab): void {
  k.ui.fokus = fokus;
  if (fokus !== 'auto') k.ui.tanggal = tanggalUntukFokus(k.p, fokus, isoLokal(new Date()));
  k.ui.modal = null;
  k.ke(tab ?? (TAB_HUB.includes(k.ui.tab) ? k.ui.tab : 'grid'));
}

export const namaFokus = (k: Konteks): string => {
  const g = kegiatanFokus(k.p, k.ui.fokus);
  if (g) return g.nama;
  if (k.ui.fokus === 'induk') return `${k.p.semester?.nama ?? 'Jadwal induk'} (jadwal reguler)`;
  return 'Menurut tanggal';
};

/** Bilah kecil di tab lain (Inspector, Susun) yang menunjukkan sasaran yang sedang dikerjakan. */
export function bilahSasaran(k: Konteks): string {
  return `<div class="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-sm text-sky-900">Sasaran: <b>${esc(namaFokus(k))}</b> · pekan ${esc(tgl(k.turunan.senin))}
    <button class="tombol ml-auto !py-0.5 !text-xs" data-tab="grid">Ganti di Periode &amp; Jadwal</button></div>`;
}

// ------------------------------------------------------------------ pohon

function pohon(k: Konteks): string {
  const p = k.p;
  const hariIni = isoLokal(new Date());
  const f = k.ui.fokus;
  const item = (aktif: boolean, isi: string, fokus: string, judul = '') =>
    `<button class="block w-full rounded-lg border px-2 py-1.5 text-left ${aktif ? 'border-[#2347b8] bg-[#2347b8]/5 ring-1 ring-[#2347b8]/40' : 'border-transparent hover:bg-slate-100'}" data-aksi="simpul" data-fokus="${esc(fokus)}" title="${esc(judul)}">${isi}</button>`;
  const s = p.semester;
  const hariIniKeg = periodeUntukTanggal(hariIni, p.kalender);
  const stInduk = s ? statusWaktu(s.mulai, s.selesai, hariIni) : { teks: 'belum bertanggal', cls: 'bg-slate-100 text-slate-500' };
  const induk = item(
    f === 'induk',
    `<div class="flex items-center gap-1.5"><span class="text-[10px] font-bold tracking-wide text-slate-400">INDUK</span><span class="lencana !px-1.5 !py-0 !text-[10px] ${stInduk.cls}">${stInduk.teks}</span></div>
     <div class="text-sm font-semibold leading-tight">${esc(s?.nama ?? 'Jadwal induk')}</div>
     <div class="text-[11px] text-slate-500">${esc(s ? rentang(s.mulai, s.selesai) : 'rentang semester belum diatur')} · reguler</div>`,
    'induk',
    'Jadwal reguler semester: berlaku di luar kegiatan',
  );
  const keg = daftarKegiatan(p)
    .map((g) => {
      const st = statusWaktu(g.mulai, g.selesai, hariIni);
      const khusus = modelWarisan(g) ? `${g.rombelTerdampak?.length ?? 0} kelas khusus` : 'data lama';
      return item(
        f === g.id,
        `<div class="flex items-center gap-1.5"><i class="inline-block h-2 w-2 shrink-0 rounded-full" style="background:${WARNA_JENIS[g.jenis].titik}"></i><span class="text-[10px] font-bold text-slate-500">${esc(g.jenis)}</span><span class="lencana !px-1.5 !py-0 !text-[10px] ${st.cls}">${st.teks}</span></div>
         <div class="truncate text-[13px] font-medium leading-tight">${esc(g.nama)}</div>
         <div class="text-[11px] text-slate-500">${esc(rentang(g.mulai, g.selesai))}${g.hariBerlaku?.length ? ` · ${esc(hariTeks(g))}` : ''} · ${khusus}</div>`,
        g.id,
        g.nama,
      );
    })
    .join('');
  const libur = p.kalender.filter((g) => g.jenis === 'libur').length;
  return `<div class="space-y-1">
    ${item(f === 'auto', `<div class="text-sm font-semibold">📅 Menurut tanggal</div><div class="text-[11px] text-slate-500">yang berlaku pada pekan dipilih${hariIniKeg ? ` · hari ini: ${esc(hariIniKeg.jenis)}` : ''}</div>`, 'auto', 'Gabungan induk dan kegiatan sesuai tanggal: yang dilihat guru dan siswa')}
    <div class="pt-1">${induk}</div>
    <div class="ml-3 space-y-1 border-l-2 border-slate-200 pl-2">${keg || '<div class="px-2 py-1 text-xs text-slate-400">Belum ada kegiatan.</div>'}
      <button class="tombol mt-1 w-full justify-center !py-1 !text-xs" data-aksi="hubKegBaru">+ Kegiatan</button></div>
    <div class="mt-2 border-t border-slate-100 pt-2 text-[11px] text-slate-500">${libur ? `${libur} hari libur di ` : 'Libur diatur di '}<button class="underline" data-tab="skema">Skema &amp; Kalender</button>.<br>Semester lain: <button class="underline" data-aksi="hubDataset">Master Data › Data</button>.</div></div>`;
}

// ------------------------------------------------------------------ sub-tab Info

function infoInduk(k: Konteks): string {
  const p = k.p;
  const s = p.semester;
  const reg = p.versi.find((v) => v.jenis === 'reguler') ?? p.versi[0];
  const tdk = s?.rombelTidakAktif.length ?? 0;
  const pola = daftarPola(p)[0];
  return `<div class="grid gap-3 lg:grid-cols-[1fr_320px]"><div class="kartu p-4">
      <div class="text-sm font-semibold">Periode induk (semester)</div>
      <div class="mt-2 grid gap-3 sm:grid-cols-3">
        <label class="block text-xs font-semibold text-slate-600 sm:col-span-3">Nama semester<input class="isian mt-1 w-full font-normal" value="${esc(s?.nama ?? '')}" placeholder="mis. Gasal 2026/2027" data-aksi="semF" data-f="nama"></label>
        <label class="block text-xs font-semibold text-slate-600">Mulai<input type="date" class="isian mt-1 w-full font-normal" value="${esc(s?.mulai ?? '')}" data-aksi="semF" data-f="mulai"></label>
        <label class="block text-xs font-semibold text-slate-600">Selesai<input type="date" class="isian mt-1 w-full font-normal" value="${esc(s?.selesai ?? '')}" data-aksi="semF" data-f="selesai"></label>
        <div class="self-end pb-1 text-xs text-slate-500">Pola jam: <b>${esc(pola?.nama ?? '—')}</b> <button class="underline" data-aksi="hubPola">ubah</button></div></div>
      <div class="mt-4 grid gap-2 text-sm sm:grid-cols-3">
        <button class="rounded-lg bg-slate-50 p-2 text-left hover:bg-slate-100" data-tab="beban"><div class="text-xs text-slate-500">Beban</div><b>${jpRombel(p.beban.filter((b) => !b.versiId || b.versiId === reg?.id))} JP</b></button>
        <button class="rounded-lg bg-slate-50 p-2 text-left hover:bg-slate-100" data-tab="grid"><div class="text-xs text-slate-500">Terjadwal</div><b>${reg?.slots.length ?? 0} slot</b></button>
        <button class="rounded-lg bg-slate-50 p-2 text-left hover:bg-slate-100" data-tab="kelas"><div class="text-xs text-slate-500">Kelas tidak aktif</div><b>${tdk} rombel</b></button></div></div>
    ${caraKerja()}</div>`;
}

function caraKerja(): string {
  return `<div class="kartu p-4 text-xs leading-relaxed text-slate-600"><div class="mb-1 text-sm font-semibold text-slate-800">Cara kerjanya</div>
    <ol class="list-decimal space-y-1 pl-4">
      <li><b>Induk</b> berisi jadwal reguler semester. Jadwal ini berlaku di luar kegiatan.</li>
      <li>Tiap <b>kegiatan</b> (TKA, ASAS, UKK, …) berlaku otomatis pada tanggalnya. Di dalamnya, tiap kelas berstatus:
        <b>ikut induk</b> (jadwal diambil langsung dari induk), <b>khusus</b> (jadwal dan beban sendiri), atau <b>tidak aktif</b>.</li>
      <li>Mengubah jadwal atau beban kelas yang ikut induk dari dalam kegiatan otomatis menjadikannya khusus. Induk tidak berubah.</li>
      <li>Selesai kegiatan, jadwal kembali ke induk.</li>
      <li>Pemeriksa bentrok menggabungkan kelas khusus dan kelas yang ikut induk, jadi guru atau ruang yang dipakai di keduanya tetap ketahuan.</li></ol></div>`;
}

function infoKegiatan(k: Konteks, g: Kegiatan): string {
  const p = k.p;
  const pola = g.polaId ? daftarPola(p).find((x) => x.id === g.polaId)?.nama : undefined;
  const aktif = p.master.rombel.filter((r) => !g.rombelTidakAktif.includes(r.id));
  const khusus = aktif.filter((r) => terdampak(g, r.id)).length;
  const warisan = modelWarisan(g);
  const lama = !warisan && g.versiId
    ? `<div class="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900"><b>Data lama:</b> jadwal kegiatan ini berupa salinan lengkap untuk semua kelas. Ubah ke model “ikut induk”: kelas yang jadwal dan bebannya sama dengan induk akan mengikuti induk; sisanya menjadi kelas khusus.
        <div class="mt-2"><button class="tombol-utama !py-1 !text-xs" data-aksi="hubWarisan">Ubah ke model ikut induk</button></div></div>`
    : '';
  return `<div class="grid gap-3 lg:grid-cols-[1fr_320px]"><div class="kartu p-4">
      <div class="flex flex-wrap items-center gap-2"><span class="lencana ${WARNA_JENIS[g.jenis].chip}">${esc(g.jenis)}</span><b>${esc(g.nama)}</b></div>
      <dl class="mt-3 grid grid-cols-[120px_1fr] gap-y-1.5 text-sm">
        <dt class="text-slate-500">Tanggal</dt><dd>${esc(rentang(g.mulai, g.selesai))}</dd>
        <dt class="text-slate-500">Hari berlaku</dt><dd>${esc(hariTeks(g) || 'setiap hari kerja')}</dd>
        <dt class="text-slate-500">Pola jam</dt><dd>${esc(pola ?? 'ikut induk')}</dd>
        ${g.catatan ? `<dt class="text-slate-500">Catatan</dt><dd>${esc(g.catatan)}</dd>` : ''}</dl>
      <div class="mt-3 flex flex-wrap gap-2"><button class="tombol" data-aksi="kegBuka" data-id="${esc(g.id)}" data-modal="1">Ubah info…</button>
        <button class="tombol !text-red-600" data-aksi="hubHapus">Hapus kegiatan</button></div>
      ${lama}
      <div class="mt-4 grid gap-2 text-sm sm:grid-cols-3">
        <button class="rounded-lg bg-amber-50 p-2 text-left hover:bg-amber-100" data-tab="kelas"><div class="text-xs text-amber-800">Kelas khusus</div><b>${khusus}</b></button>
        <button class="rounded-lg bg-slate-50 p-2 text-left hover:bg-slate-100" data-tab="kelas"><div class="text-xs text-slate-500">Ikut induk</div><b>${aktif.length - khusus}</b></button>
        <button class="rounded-lg bg-slate-50 p-2 text-left hover:bg-slate-100" data-tab="kelas"><div class="text-xs text-slate-500">Tidak aktif</div><b>${g.rombelTidakAktif.length}</b></button></div>
      <div class="mt-3 flex flex-wrap gap-2 text-xs"><button class="tombol !text-xs" data-tab="susun">Susun Otomatis untuk kegiatan ini →</button></div></div>
    ${caraKerja()}</div>`;
}

// ------------------------------------------------------------------ sub-tab Kelas

function kelasInduk(k: Konteks): string {
  const p = k.p;
  const tdk = new Set(p.semester?.rombelTidakAktif ?? []);
  const reg = p.versi.find((v) => v.jenis === 'reguler') ?? p.versi[0];
  const rb = new Map(p.beban.map((b) => [b.id, b.rombelId]));
  const baris = (r: Rombel) => {
    const off = tdk.has(r.id);
    const jp = jpRombel(p.beban.filter((b) => b.rombelId === r.id && (!b.versiId || b.versiId === reg?.id)));
    const slot = reg?.slots.filter((s) => rb.get(s.bebanId) === r.id).length ?? 0;
    return `<tr class="border-t border-slate-100"><td class="px-2 py-1.5 font-medium">${esc(r.kode)}</td>
      <td class="px-2 py-1.5"><div class="inline-flex rounded-lg border border-slate-300 bg-white p-0.5 text-xs">${segmen(!off, 'Aktif', 'kelasInduk', r.id, 'aktif')}${segmen(off, 'Tidak aktif', 'kelasInduk', r.id, 'off')}</div></td>
      <td class="px-2 py-1.5 text-xs text-slate-500">${off ? '—' : `${slot} dari ${jp} JP terjadwal`}</td></tr>`;
  };
  return `<div class="kartu p-3"><div class="mb-2 text-sm text-slate-600">Kelas yang tidak aktif sepanjang semester di luar kegiatan (mis. PKL). Tiap kegiatan punya daftar kelasnya sendiri.</div>
    ${tabelKelas(k, baris)}</div>`;
}

function segmen(aktif: boolean, label: string, aksi: string, id: string, st: string, judul = ''): string {
  return `<button class="rounded-md px-2 py-0.5 font-medium ${aktif ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}" data-aksi="${aksi}" data-id="${esc(id)}" data-st="${st}" title="${esc(judul)}">${label}</button>`;
}

function tabelKelas(k: Konteks, baris: (r: Rombel) => string, aksiGrup?: (ids: string[], judul: string) => string): string {
  const daftar = urutRombel(k.p);
  return urutTingkat
    .map((t) => {
      const rs = daftar.filter((r) => r.tingkat === t);
      if (!rs.length) return '';
      return `<div class="mb-3"><div class="mb-1 flex flex-wrap items-center gap-2"><span class="text-xs font-bold tracking-wide text-slate-500">TINGKAT ${t}</span>${aksiGrup ? aksiGrup(rs.map((r) => r.id), t) : ''}</div>
        <div class="overflow-x-auto rounded-lg border border-slate-200"><table class="w-full text-sm"><tbody>${rs.map(baris).join('')}</tbody></table></div></div>`;
    })
    .join('');
}

function kelasKegiatan(k: Konteks, g: Kegiatan): string {
  const p = k.p;
  const warisan = modelWarisan(g);
  const v = versiDari(p, g.versiId);
  const rb = new Map(p.beban.map((b) => [b.id, b.rombelId]));
  const baris = (r: Rombel) => {
    const off = g.rombelTidakAktif.includes(r.id);
    const khusus = terdampak(g, r.id);
    const st = off ? 'off' : khusus ? 'khusus' : 'induk';
    const slotK = v?.slots.filter((s) => rb.get(s.bebanId) === r.id).length ?? 0;
    const jpBeban = jpRombel(k.turunan.beban.filter((b) => b.rombelId === r.id));
    const ket = off ? '—' : khusus ? `${slotK} slot khusus · beban ${jpBeban} JP` : 'jadwal diambil dari induk';
    const tombol = warisan
      ? `${segmen(st === 'induk', 'Ikut induk', 'kelasSet', r.id, 'induk', 'Jadwal dan beban mengikuti induk')}${segmen(st === 'khusus', 'Khusus', 'kelasSet', r.id, 'khusus', 'Jadwal sendiri; mula-mula disalin dari induk')}${segmen(st === 'off', 'Tidak aktif', 'kelasSet', r.id, 'off', 'Disembunyikan (mis. ujian, PKL)')}`
      : `${segmen(!off, 'Aktif', 'kelasSet', r.id, 'khusus')}${segmen(off, 'Tidak aktif', 'kelasSet', r.id, 'off')}`;
    const aksiLain = warisan && khusus && !off
      ? `<button class="tombol !px-2 !py-0.5 !text-xs" data-aksi="kelasSet" data-id="${esc(r.id)}" data-st="kosong" title="Kosongkan jadwal khusus kelas ini (beban tetap)">Kosongkan</button>
         <button class="tombol !px-2 !py-0.5 !text-xs" data-aksi="kelasGrid" data-id="${esc(r.id)}">Buka grid</button>`
      : '';
    return `<tr class="border-t border-slate-100 ${khusus && !off ? 'bg-amber-50/60' : ''}"><td class="w-28 px-2 py-1.5 font-medium">${esc(r.kode)}</td>
      <td class="px-2 py-1.5"><div class="inline-flex rounded-lg border border-slate-300 bg-white p-0.5 text-xs">${tombol}</div></td>
      <td class="px-2 py-1.5 text-xs text-slate-500">${ket}</td><td class="whitespace-nowrap px-2 py-1.5 text-right">${aksiLain}</td></tr>`;
  };
  const grup = (ids: string[], t: string) =>
    `<span class="text-[11px] text-slate-400">semua ${t}:</span>${warisan ? `<button class="tombol !px-2 !py-0 !text-[11px]" data-aksi="kelasGrup" data-ids="${esc(ids.join(','))}" data-st="induk">ikut induk</button><button class="tombol !px-2 !py-0 !text-[11px]" data-aksi="kelasGrup" data-ids="${esc(ids.join(','))}" data-st="khusus">khusus</button>` : ''}<button class="tombol !px-2 !py-0 !text-[11px]" data-aksi="kelasGrup" data-ids="${esc(ids.join(','))}" data-st="off">tidak aktif</button>`;
  const ket = warisan
    ? 'Tentukan kelas mana yang <b>khusus</b> (jadwal sendiri, mis. kelas yang belajar reguler saat ujian dengan ruang berbeda), <b>ikut induk</b>, atau <b>tidak aktif</b> (sedang ujian, PKL). Kelas yang dijadikan khusus mula-mula mendapat salinan jadwal induknya.'
    : 'Data lama: semua kelas aktif memakai jadwal kegiatan ini. Ubah ke model ikut induk di sub-tab Info.';
  return `<div class="kartu p-3"><div class="mb-2 text-sm text-slate-600">${ket}</div>${tabelKelas(k, baris, grup)}</div>`;
}

// ------------------------------------------------------------------ tampilan

const SUB: { id: Tab; label: string }[] = [
  { id: 'info', label: 'Info' },
  { id: 'kelas', label: 'Kelas' },
  { id: 'beban', label: 'Beban' },
  { id: 'grid', label: 'Grid jadwal' },
];

export function renderHub(k: Konteks): string {
  const p = k.p;
  const g = kegiatanFokus(p, k.ui.fokus);
  const auto = k.ui.fokus === 'auto';
  const sub = SUB.filter((x) => !auto || x.id === 'grid' || x.id === 'beban');
  const tab = sub.some((x) => x.id === k.ui.tab) ? k.ui.tab : 'grid';
  const judul = g
    ? `<span class="lencana ${WARNA_JENIS[g.jenis].chip}">${esc(g.jenis)}</span> <b>${esc(g.nama)}</b> <span class="text-sm text-slate-500">${esc(rentang(g.mulai, g.selesai))}${g.hariBerlaku?.length ? ` · ${esc(hariTeks(g))}` : ''}</span>`
    : k.ui.fokus === 'induk'
      ? `<span class="lencana bg-slate-200 text-slate-700">INDUK</span> <b>${esc(p.semester?.nama ?? 'Jadwal induk')}</b> <span class="text-sm text-slate-500">jadwal reguler${p.semester ? ` · ${esc(rentang(p.semester.mulai, p.semester.selesai))}` : ''}</span>`
      : `<b>Menurut tanggal</b> <span class="text-sm text-slate-500">gabungan induk dan kegiatan yang berlaku${k.turunan.periode ? `; pekan ini: ${esc(k.turunan.periode.nama)}` : '; pekan ini: induk'}</span>`;
  const isi =
    tab === 'info' ? (g ? infoKegiatan(k, g) : infoInduk(k))
    : tab === 'kelas' ? (g ? kelasKegiatan(k, g) : kelasInduk(k))
    : tab === 'beban' ? renderBeban(k)
    : renderGrid(k) + renderModal(k);
  const tdk = k.turunan.rombelTidakAktif.size;
  return `<div class="flex flex-col items-start gap-3 lg:flex-row">
    <aside class="kartu w-full shrink-0 p-2 lg:sticky lg:top-[108px] lg:max-h-[calc(100vh-124px)] lg:w-60 lg:overflow-y-auto">${pohon(k)}</aside>
    <section class="w-full min-w-0 flex-1">
      <div class="mb-2 flex flex-wrap items-center gap-2">${judul}${tdk ? `<span class="lencana bg-amber-100 text-amber-900">${tdk} kelas tidak aktif</span>` : ''}</div>
      <div class="mb-3 flex gap-1 border-b border-slate-200">${sub.map((x) => `<button data-tab="${x.id}" class="-mb-px border-b-2 px-3 py-1.5 text-sm font-medium ${x.id === tab ? 'border-[#2347b8] text-[#2347b8]' : 'border-transparent text-slate-500 hover:text-slate-800'}">${x.label}</button>`).join('')}</div>
      ${isi}</section></div>`;
}

// ------------------------------------------------------------------ aksi

function aturKelas(p: Proyek, g: Kegiatan, rombelId: string, st: string): void {
  const tdk = new Set(g.rombelTidakAktif);
  if (st === 'off') {
    tdk.add(rombelId);
    g.rombelTidakAktif = [...tdk];
    return;
  }
  tdk.delete(rombelId);
  g.rombelTidakAktif = [...tdk];
  if (!modelWarisan(g)) return;
  if (st === 'induk') ikutInduk(p, g, rombelId);
  else if (st === 'khusus') jadikanTerdampak(p, g, rombelId, true);
  else if (st === 'kosong') {
    if (!terdampak(g, rombelId)) jadikanTerdampak(p, g, rombelId, false);
    else {
      const v = versiDari(p, g.versiId);
      const rb = new Map(p.beban.map((b) => [b.id, b.rombelId]));
      if (v) v.slots = v.slots.filter((s) => rb.get(s.bebanId) !== rombelId);
    }
  }
}

/** Ada isian khusus (slot/beban) yang akan hilang bila rombel dikembalikan ke induk. */
function adaIsianKhusus(p: Proyek, g: Kegiatan, rombelId: string): boolean {
  if (!terdampak(g, rombelId)) return false;
  const v = versiDari(p, g.versiId);
  const rb = new Map(p.beban.map((b) => [b.id, b.rombelId]));
  return (v?.slots.some((s) => rb.get(s.bebanId) === rombelId) ?? false) || p.beban.some((b) => b.versiId === g.versiId && b.rombelId === rombelId);
}

export function klikHub(k: Konteks, el: HTMLElement): boolean {
  const d = el.dataset;
  const p = k.p;
  const g = kegiatanFokus(p, k.ui.fokus);
  switch (d.aksi) {
    case 'simpul':
      bukaSimpul(k, d.fokus ?? 'auto', d.fokus === 'auto' ? 'grid' : undefined);
      return true;
    case 'hubKegBaru':
      bukaDlgKegiatan(k, { tgl: p.semester?.mulai && dalamRentang(isoLokal(new Date()), p.semester.mulai, p.semester.selesai) ? isoLokal(new Date()) : (p.semester?.mulai || isoLokal(new Date())) });
      return true;
    case 'hubDataset':
      k.ui.masterTab = 'data';
      k.ke('master');
      return true;
    case 'hubPola':
      k.ui.skemaSub = 'pola';
      k.ke('skema');
      return true;
    case 'hubHapus':
      if (!g || !confirm(`Hapus kegiatan “${g.nama}” beserta jadwal dan beban khususnya?`)) return true;
      k.ui.fokus = 'induk';
      k.ubah((x) => {
        x.kalender = x.kalender.filter((y) => y.id !== g.id);
        const dipakai = new Set(x.kalender.map((y) => y.versiId));
        if (g.versiId && !dipakai.has(g.versiId) && x.versi.find((v) => v.id === g.versiId)?.jenis !== 'reguler') {
          x.versi = x.versi.filter((v) => v.id !== g.versiId);
          x.beban = x.beban.filter((b) => b.versiId !== g.versiId);
        }
        if (x.periodeAktifId === g.id) delete x.periodeAktifId;
      });
      k.ke('info');
      return true;
    case 'hubWarisan': {
      if (!g) return true;
      let h = { terdampak: [] as string[], ikut: [] as string[] };
      k.ubah((x) => {
        const gx = x.kalender.find((y) => y.id === g.id);
        if (gx) h = jadikanWarisan(x, gx);
      });
      k.lapor(`Diubah: ${h.terdampak.length} kelas khusus, ${h.ikut.length} kelas ikut induk.`);
      return true;
    }
    case 'kelasSet': {
      if (!g) return true;
      const id = d.id ?? '';
      const kode = p.master.rombel.find((r) => r.id === id)?.kode ?? id;
      if (d.st === 'induk' && adaIsianKhusus(p, g, id) && !confirm(`Jadwal dan beban khusus ${kode} pada kegiatan ini akan dihapus, lalu ${kode} mengikuti induk. Lanjutkan?`)) return true;
      if (d.st === 'kosong' && !confirm(`Kosongkan jadwal khusus ${kode} pada kegiatan ini? Bebannya tetap.`)) return true;
      k.ubah((x) => {
        const gx = x.kalender.find((y) => y.id === g.id);
        if (gx) aturKelas(x, gx, id, d.st ?? '');
      });
      return true;
    }
    case 'kelasGrup': {
      if (!g) return true;
      const ids = (d.ids ?? '').split(',').filter(Boolean);
      if (d.st === 'induk' && ids.some((id) => adaIsianKhusus(p, g, id)) && !confirm('Jadwal dan beban khusus kelas-kelas ini pada kegiatan ini akan dihapus. Lanjutkan?')) return true;
      k.ubah((x) => {
        const gx = x.kalender.find((y) => y.id === g.id);
        if (gx) for (const id of ids) aturKelas(x, gx, id, d.st ?? '');
      });
      return true;
    }
    case 'kelasGrid':
      k.ui.mode = 'rombel';
      k.ui.tata = 'hari';
      k.ui.entitasId = d.id ?? k.ui.entitasId;
      k.ke('grid');
      return true;
    case 'kelasInduk': {
      const id = d.id ?? '';
      k.ubah((x) => {
        x.semester ??= { nama: x.nama, mulai: '', selesai: '', rombelTidakAktif: [] };
        const s = new Set(x.semester.rombelTidakAktif);
        if (d.st === 'off') s.add(id);
        else s.delete(id);
        x.semester.rombelTidakAktif = [...s];
      });
      return true;
    }
  }
  return false;
}

export function ubahHub(k: Konteks, el: HTMLInputElement): boolean {
  if (el.dataset.aksi !== 'semF') return false;
  const f = el.dataset.f as 'nama' | 'mulai' | 'selesai';
  const nilai = el.value.trim();
  const s = k.p.semester;
  const mulai = f === 'mulai' ? nilai : (s?.mulai ?? '');
  const selesai = f === 'selesai' ? nilai : (s?.selesai ?? '');
  if (mulai && selesai && selesai < mulai) {
    k.lapor('Tanggal selesai lebih awal dari tanggal mulai.');
    k.gambar();
    return true;
  }
  k.ubah((x) => {
    x.semester ??= { nama: x.nama, mulai: '', selesai: '', rombelTidakAktif: [] };
    x.semester[f] = nilai;
  });
  return true;
}
