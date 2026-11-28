// Kalender akademik di halaman publik: grid bulanan, rincian satu tanggal, dan daftar agenda bulan itu.
// Hanya membaca data terbit; tidak memuat kode admin.

import { dalamRentang, hariPekan, liburUmum } from '../model/kalender';
import type { Kegiatan, Proyek } from '../model/tipe';
import { NAMA_HARI } from '../model/tipe';
import { WARNA_JENIS } from '../model/warnaJenis';
import { esc } from '../ui/util';
import { infoHariUmum } from './tampil';

const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const HARI_SINGKAT = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

const namaHari = (iso: string): string => (hariPekan(iso) <= 5 ? (NAMA_HARI[hariPekan(iso)] as string) : 'Minggu');
const tglLengkap = (iso: string): string => {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return `${namaHari(iso)}, ${d} ${BULAN[m - 1]} ${y}`;
};
const tglPendek = (iso: string): string => {
  const [, m, d] = iso.split('-').map(Number) as [number, number, number];
  return `${d} ${(BULAN[m - 1] ?? '').slice(0, 3)}`;
};
const rentang = (g: Kegiatan): string => (g.mulai === g.selesai ? tglPendek(g.mulai) : `${tglPendek(g.mulai)} – ${tglPendek(g.selesai)}`);

export const geserBulan = (bulan: string, n: number): string => {
  const [y, m] = bulan.split('-').map(Number) as [number, number];
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`;
};

/** Sasaran kegiatan untuk pembaca: agenda menurut kalender akademik, atau kegiatan yang mengubah jadwal. */
const sasaran = (g: Kegiatan): string => (g.agenda ? (g.untuk && g.untuk !== 'semua' ? `Kelas ${g.untuk}` : 'Semua kelas') : 'Mengubah jadwal');

const berlaku = (g: Kegiatan, tgl: string, kerja: boolean): boolean => dalamRentang(tgl, g.mulai, g.selesai) && (kerja || g.mulai === g.selesai);
const liburPenuh = liburUmum;

/** Akronim penanda kegiatan (TKA, ASAJ, PKL, ...); label tingkat kelas (XI, XII) tidak dihitung. */
/** Nama lain untuk kegiatan yang sama pada kalender akademik: UK3 = UKK (uji kompetensi keahlian), PSAS = ASAS (sumatif akhir semester). */
const SAMA: Record<string, string> = { UK3: 'UKK', PSAS: 'ASAS' };
const akronim = (nama: string): Set<string> => new Set((nama.match(/\b[A-Z][A-Z0-9]{2,}\b/g) ?? []).filter((x) => x !== 'XII' && x !== 'XI').map((x) => SAMA[x] ?? x));
const beririsan = (a: Kegiatan, b: Kegiatan): number => {
  const mulai = a.mulai > b.mulai ? a.mulai : b.mulai;
  const selesai = a.selesai < b.selesai ? a.selesai : b.selesai;
  return mulai <= selesai ? 1 + (Date.parse(selesai) - Date.parse(mulai)) / 86_400_000 : 0;
};

/**
 * Agenda kalender akademik yang membicarakan kegiatan yang sama dengan kegiatan pengubah jadwal (mis. agenda "TKA" kelas XII
 * pada TKA Gelombang 2) digabung ke kegiatan itu sebagai rincian, supaya satu hal tidak tampil dua kali. Kegiatan memegang nama
 * dan rentang yang pasti; agenda menambahkan rincian sasaran dan tanggal. Syarat gabung: tanggal beririsan dan memakai akronim
 * yang sama (TKA, ASAJ, PKL, ...). Agenda lain tetap berdiri sendiri.
 */
export function gabungkanKalender(kalender: Kegiatan[]): { butir: Kegiatan[]; rincian: Map<string, Kegiatan[]> } {
  const utama = kalender.filter((g) => !g.agenda);
  const rincian = new Map<string, Kegiatan[]>();
  const tergabung = new Set<string>();
  for (const a of kalender.filter((g) => g.agenda)) {
    const kunci = akronim(a.nama);
    if (!kunci.size) continue;
    let terbaik: Kegiatan | undefined;
    let irisan = 0;
    for (const u of utama) {
      const n = beririsan(a, u);
      if (n > irisan && [...akronim(u.nama)].some((x) => kunci.has(x))) {
        terbaik = u;
        irisan = n;
      }
    }
    if (!terbaik) continue;
    tergabung.add(a.id);
    rincian.set(terbaik.id, [...(rincian.get(terbaik.id) ?? []), a]);
  }
  return { butir: kalender.filter((g) => !tergabung.has(g.id)), rincian };
}

const urut = (a: Kegiatan, b: Kegiatan): number => a.mulai.localeCompare(b.mulai) || Number(!!a.agenda) - Number(!!b.agenda) || a.nama.localeCompare(b.nama);

function barisButir(g: Kegiatan, aksiJadwal: boolean, rincian: Kegiatan[] = []): string {
  const w = WARNA_JENIS[g.jenis];
  const tambahan = rincian
    .sort(urut)
    .map((a) => `<div class="mt-0.5 text-xs text-slate-500">Termasuk: ${esc(a.nama)} · ${esc(sasaran(a))}${a.mulai === g.mulai && a.selesai === g.selesai ? '' : ` · ${esc(rentang(a))}`}</div>`)
    .join('');
  return `<div class="flex items-start gap-2 py-2">
      <i class="mt-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full" style="background:${w.titik}"></i>
      <div class="min-w-0 flex-1"><div class="text-sm font-semibold leading-snug">${esc(g.nama)}</div>
        <div class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500"><span>${esc(rentang(g))}</span><span class="rounded px-1.5 py-px text-[10px] font-semibold ${w.chip}">${esc(g.jenis)}</span><span>${esc(sasaran(g))}</span></div>${tambahan}</div>
      ${aksiJadwal && !g.agenda ? `<button data-aksi="kalKeJadwal" data-tgl="${g.mulai}" class="shrink-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-medium">Lihat jadwal ›</button>` : ''}</div>`;
}

function rincianTanggal(p: Proyek, tgl: string, kerja: boolean, gab: ReturnType<typeof gabungkanKalender>): string {
  const info = infoHariUmum(p, tgl);
  const keg = gab.butir.filter((g) => berlaku(g, tgl, kerja)).sort(urut);
  const status =
    info.status === 'libur' ? `<span class="font-semibold text-red-700">Libur</span> · ${esc(info.keterangan)}`
    : info.status === 'akhirPekan' ? 'Akhir pekan'
    : info.status === 'diluarSemester' ? 'Di luar semester berjalan'
    : `Hari belajar${info.skema ? ` · ${esc(info.skema)}` : ''}${info.semester ? ` · ${esc(info.semester)}` : ''}`;
  const lihat = info.status === 'normal' ? `<button data-aksi="kalLihatHari" data-tgl="${tgl}" class="mt-2 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium">Lihat jadwal hari ini ›</button>` : '';
  return `<div class="mt-3 rounded-2xl border border-slate-200 bg-white p-3"><div class="text-base font-bold">${esc(tglLengkap(tgl))}</div>
      <div class="mt-0.5 text-sm text-slate-600">${status}</div>
      ${keg.length ? `<div class="mt-1 divide-y divide-slate-100">${keg.map((g) => barisButir(g, false, (gab.rincian.get(g.id) ?? []).filter((a) => dalamRentang(tgl, a.mulai, a.selesai)))).join('')}</div>` : '<div class="mt-2 text-sm text-slate-500">Tidak ada agenda pada tanggal ini.</div>'}
      ${lihat}</div>`;
}

/** Kalender bulan `bulan` (YYYY-MM); `tgl` = tanggal yang dipilih. */
export function gambarKalender(p: Proyek, bulan: string, tgl: string, hariIni: string): string {
  const n = p.polaReguler.length;
  const gab = gabungkanKalender(p.kalender);
  const [y, m] = bulan.split('-').map(Number) as [number, number];
  const awal = `${bulan}-01`;
  const jumlah = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const akhir = `${bulan}-${String(jumlah).padStart(2, '0')}`;
  const sel: string[] = [];
  for (let i = 0; i < hariPekan(awal); i++) sel.push('<div class="min-h-[52px] rounded-lg bg-slate-50/60"></div>');
  for (let d = 1; d <= jumlah; d++) {
    const t = `${bulan}-${String(d).padStart(2, '0')}`;
    const kerja = hariPekan(t) < n;
    const keg = gab.butir.filter((g) => berlaku(g, t, kerja));
    const libur = keg.some(liburPenuh);
    const jenis = [...new Set(keg.map((g) => g.jenis))].slice(0, 4);
    const pilih = t === tgl;
    const bg = libur ? 'bg-red-50' : !kerja ? 'bg-slate-100' : 'bg-white';
    const angka = t === hariIni ? 'rounded-full bg-[#2347b8] px-1.5 text-white' : !kerja || libur ? 'text-red-600' : 'text-slate-700';
    sel.push(`<button data-aksi="kalPilih" data-tgl="${t}" aria-label="${esc(tglLengkap(t))}" class="flex min-h-[52px] flex-col items-center gap-1 rounded-lg border p-1 ${bg} ${pilih ? 'border-[#0d1e33] ring-2 ring-[#0d1e33]/30' : 'border-slate-200'}">
      <span class="text-xs font-semibold tabular-nums ${angka}">${d}</span>
      <span class="flex flex-wrap justify-center gap-0.5">${jenis.map((j) => `<i class="inline-block h-2 w-2 rounded-full" style="background:${WARNA_JENIS[j].titik}"></i>`).join('')}</span></button>`);
  }
  const daftar = gab.butir.filter((g) => g.mulai <= akhir && g.selesai >= awal).sort(urut);
  const adaJenis = [...new Set(daftar.map((g) => g.jenis))];
  const panah = (b: string, simbol: string, label: string) => `<button data-aksi="kalBulan" data-bulan="${b}" class="h-10 w-10 shrink-0 rounded-xl border border-slate-300 bg-white text-lg" aria-label="${label}">${simbol}</button>`;
  const bulanIni = hariIni.slice(0, 7);
  return `<div class="flex items-center gap-2">${panah(geserBulan(bulan, -1), '‹', 'Bulan sebelumnya')}
      <div class="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-center text-sm font-semibold">${BULAN[m - 1]} ${y}</div>
      ${panah(geserBulan(bulan, 1), '›', 'Bulan berikutnya')}</div>
    ${bulan === bulanIni ? '' : `<div class="mt-2"><button data-aksi="kalBulan" data-bulan="${bulanIni}" data-tgl="${hariIni}" class="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium">Bulan ini</button></div>`}
    <div class="mt-3 grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-slate-500">${HARI_SINGKAT.map((h, i) => `<div class="${i >= n ? 'text-red-500' : ''}">${h}</div>`).join('')}</div>
    <div class="mt-1 grid grid-cols-7 gap-1">${sel.join('')}</div>
    ${adaJenis.length ? `<div class="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-600">${adaJenis.map((j) => `<span class="inline-flex items-center gap-1"><i class="inline-block h-2 w-2 rounded-full" style="background:${WARNA_JENIS[j].titik}"></i>${esc(j)}</span>`).join('')}</div>` : ''}
    ${rincianTanggal(p, tgl, hariPekan(tgl) < n, gab)}
    <h2 class="mb-1 mt-5 text-sm font-bold text-slate-700">Agenda ${BULAN[m - 1]} ${y}</h2>
    <div class="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white px-3">${daftar.length ? daftar.map((g) => barisButir(g, true, gab.rincian.get(g.id) ?? [])).join('') : '<div class="py-4 text-center text-sm text-slate-500">Tidak ada agenda pada bulan ini.</div>'}</div>
    <p class="mt-2 text-[11px] leading-relaxed text-slate-500">Titik warna = jenis kegiatan pada tanggal itu. Kegiatan berlabel “Mengubah jadwal” (TKA, ASAS, UKK, PKL, dll.) mengganti jadwal pelajaran; tombol Lihat jadwal membuka jadwal pekannya. Hari akhir pekan hanya menampilkan acara satu hari.</p>`;
}
