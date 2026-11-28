/**
 * Buku jadwal siap cetak (A4 landscape): satu halaman per kelas / guru / ruang untuk satu pekan,
 * lengkap dengan penjelasan kode mapel, guru, dan ruang yang muncul di halaman itu.
 * "Unduh" = Simpan sebagai PDF dari dialog cetak peramban.
 */
import type { Proyek } from '../model/tipe';
import { esc, seninPekan, tambahHari } from '../ui/util';
import { daftarEntitasP, jadwalPekanP, matriksP, type ModeP } from './tampil';

const JUDUL_MODE: Record<ModeP, string> = { rombel: 'Kelas', guru: 'Guru', ruang: 'Ruang' };

const tgl = (iso: string, tahun: boolean): string =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', ...(tahun ? { year: 'numeric' } : {}), timeZone: 'UTC' });

/** Kode yang muncul pada satu halaman (satu entitas, satu pekan), dipisah menurut jenisnya. */
export function kodeHalaman(p: Proyek, mode: ModeP, id: string, tanggal: string): { mapel: [string, string][]; guru: [string, string][]; ruang: [string, string][] } {
  const mapel = new Map<string, string>();
  const guru = new Map<string, string>();
  const ruang = new Map<string, string>();
  for (const h of jadwalPekanP(p, tanggal, mode, id).hari) {
    for (const e of h.elemen) {
      if (e.jenis === 'nonKbm') mapel.set(e.kode, e.nama);
      if (e.jenis !== 'blok') continue;
      for (const it of e.item) {
        mapel.set(it.mapel.kode, it.mapel.nama);
        for (const g of it.guru) guru.set(g.kode, g.nama);
        if (it.ruang) ruang.set(it.ruang, it.ruangNama);
      }
    }
  }
  const urut = (m: Map<string, string>): [string, string][] => [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
  // jenis yang sama dengan judul halaman tidak perlu dijelaskan lagi
  return { mapel: urut(mapel), guru: mode === 'guru' ? [] : urut(guru), ruang: mode === 'ruang' ? [] : urut(ruang) };
}

const kolomKode = (judul: string, daftar: [string, string][]): string =>
  daftar.length
    ? `<div class="min-w-0"><div class="mb-0.5 text-[8.5px] font-bold uppercase tracking-wide text-slate-500">${esc(judul)}</div><div class="text-[8.5px] leading-snug">${daftar.map(([k, n]) => `<span class="mr-2 inline-block whitespace-nowrap"><b>${esc(k)}</b> ${esc(n)}</span>`).join('')}</div></div>`
    : '';

export interface OpsiCetak {
  mode: ModeP;
  /** id entitas, berurutan: satu halaman tiap id */
  ids: string[];
  /** tanggal mana pun dalam pekan yang dicetak */
  tanggal: string;
  /** teks "diperbarui ..." untuk kaki halaman; kosong = tidak ditampilkan */
  diperbarui?: string;
  /** tabel satu pekan untuk satu entitas (mode cetak) */
  tabel: (id: string) => string;
}

/** Satu halaman A4 landscape. */
export function halamanCetak(p: Proyek, o: OpsiCetak, id: string): string {
  const n = p.polaReguler.length;
  const senin = seninPekan(o.tanggal, n);
  const label = daftarEntitasP(p, o.mode).find((e) => e.id === id)?.label ?? '';
  const pk = jadwalPekanP(p, o.tanggal, o.mode, id);
  const kegiatan = [...new Set(pk.hari.map((h) => h.kegiatan?.nama).filter((x): x is string => !!x))];
  const kode = kodeHalaman(p, o.mode, id, o.tanggal);
  const legenda = [kolomKode('Mapel dan kegiatan', kode.mapel), kolomKode('Guru', kode.guru), kolomKode('Ruang', kode.ruang)].filter(Boolean).join('');
  return `<section class="halaman-cetak">
    <div class="mb-1.5 flex items-end gap-3 border-b-2 border-slate-800 pb-1">
      <div class="min-w-0 flex-1"><div class="text-[9px] font-bold tracking-widest text-slate-600">SMK NEGERI BANSARI · JADWAL PELAJARAN</div><div class="truncate text-lg font-bold leading-tight">${esc(JUDUL_MODE[o.mode])} ${esc(label)}</div></div>
      <div class="shrink-0 text-right text-[10px] leading-tight text-slate-700"><div class="font-semibold">${esc(tgl(senin, false))} – ${esc(tgl(tambahHari(senin, n - 1), true))}</div>${kegiatan.length ? `<div>${esc(kegiatan.join(', '))}</div>` : ''}</div>
    </div>
    ${o.tabel(id)}
    ${legenda ? `<div class="mt-1.5 grid gap-x-4 border-t border-slate-300 pt-1" style="grid-template-columns:${[kode.mapel, kode.guru, kode.ruang].filter((x) => x.length).map((x) => `${Math.max(1, Math.min(3, Math.ceil(x.length / 12)))}fr`).join(' ')}">${legenda}</div>` : ''}
    ${o.diperbarui ? `<div class="mt-1 text-right text-[8px] text-slate-500">Jadwal diperbarui ${esc(o.diperbarui)} WIB</div>` : ''}
  </section>`;
}

/** Seluruh buku: satu halaman per id. */
export function bukuCetak(p: Proyek, o: OpsiCetak): string {
  return o.ids.map((id) => halamanCetak(p, o, id)).join('');
}

// ------------------------------------------------------------------ rekap satu halaman

export type UkuranKertas = 'A4' | 'F4';

/**
 * Ukuran halaman landscape dalam piksel CSS (96 dpi) setelah margin 8 mm: A4 297x210 mm, F4 330x215 mm.
 * `tinggi` dan `huruf` = tinggi baris dan huruf kotak jadwal (tiga baris kode per kotak).
 */
export const KERTAS: Record<UkuranKertas, { mm: string; lebar: number; tinggiHalaman: number; tinggi: number; huruf: number }> = {
  A4: { mm: '297mm 210mm', lebar: 1056, tinggiHalaman: 725, tinggi: 21, huruf: 6 },
  F4: { mm: '330mm 215mm', lebar: 1180, tinggiHalaman: 744, tinggi: 22, huruf: 6.5 },
};

/** Tinggi tetap di luar baris data: judul, dua baris kepala tabel, kaki halaman. */
const TINGGI_TETAP = 84;

export interface OpsiRekap {
  mode: ModeP;
  /** tanggal mana pun dalam pekan yang dicetak */
  tanggal: string;
  ukuran: UkuranKertas;
  diperbarui?: string;
  /** tabel matriks untuk sebagian baris (id) dengan ukuran cetak */
  tabel: (ids: string[], u: { lebar: number; tinggi: number; huruf: number }) => string;
}

/** Semua kode yang tampil pada rekap pekan itu (kelas, mapel, guru, ruang, kegiatan non-KBM, alasan kelas tidak belajar). */
export function kodeRekap(p: Proyek, tanggal: string): { alasan: [string, string][]; mapel: [string, string][]; guru: [string, string][]; ruang: [string, string][] } {
  const alasan = new Map<string, string>();
  const mapel = new Map<string, string>();
  const guru = new Map<string, string>();
  const ruang = new Map<string, string>();
  const m = matriksP(p, tanggal, 'rombel');
  for (const b of m.baris) {
    for (const h of b.hari) {
      if (h.status === 'tidakAktif' && h.alasan) alasan.set(h.alasan.kode, h.alasan.nama);
      if (h.status !== 'normal') continue;
      for (const e of h.elemen) {
        if (e.jenis === 'nonKbm') mapel.set(e.kode, e.nama);
        if (e.jenis !== 'blok') continue;
        for (const it of e.item) {
          mapel.set(it.mapel.kode, it.mapel.nama);
          for (const g of it.guru) guru.set(g.kode, g.nama);
          if (it.ruang) ruang.set(it.ruang, it.ruangNama && it.ruangNama !== it.ruang ? it.ruangNama : '');
        }
      }
    }
  }
  const urut = (x: Map<string, string>): [string, string][] => [...x.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
  return { alasan: urut(alasan), mapel: urut(mapel), guru: urut(guru), ruang: urut(ruang) };
}

const bagianKode = (judul: string, daftar: [string, string][]): string =>
  daftar.length
    ? `<div class="mb-2"><div class="mb-0.5 border-b border-slate-300 text-[8px] font-bold uppercase tracking-wide text-slate-600" style="break-after:avoid">${esc(judul)}</div>${daftar
        .map(([k, n]) => `<div class="flex gap-1.5 text-[8px] leading-[1.35]"><b class="w-9 shrink-0 whitespace-nowrap">${esc(k)}</b><span class="min-w-0">${esc(n)}</span></div>`)
        .join('')}</div>`
    : '';

/** Halaman penjelasan kode: cara membaca kotak, alasan kelas tidak belajar, mapel, guru, ruang. */
export function halamanKode(p: Proyek, o: Pick<OpsiRekap, 'mode' | 'tanggal' | 'diperbarui'>): string {
  const n = p.polaReguler.length;
  const senin = seninPekan(o.tanggal, n);
  const kode = kodeRekap(p, o.tanggal);
  const cara: Record<ModeP, string> = { rombel: 'kode mapel, kode guru, kode ruang', guru: 'kelas, kode mapel, kode ruang', ruang: 'kelas, kode mapel, kode guru' };
  return `<section class="halaman-cetak">
    <div class="mb-1.5 flex items-end gap-3 border-b-2 border-slate-800 pb-1">
      <div class="min-w-0 flex-1"><div class="text-[9px] font-bold tracking-widest text-slate-600">SMK NEGERI BANSARI · JADWAL PELAJARAN</div><div class="text-lg font-bold leading-tight">Penjelasan kode</div></div>
      <div class="shrink-0 text-right text-[10px] leading-tight text-slate-700"><div class="font-semibold">${esc(tgl(senin, false))} – ${esc(tgl(tambahHari(senin, n - 1), true))}</div></div>
    </div>
    <p class="mb-2 text-[9px] text-slate-700">Isi tiap kotak jadwal dari atas: ${esc(cara[o.mode])}. Tanda + pada kode mapel = ada kelompok paralel (mis. pendidikan agama). Jam berurutan dengan guru dan mapel yang sama digabung; kolom sempit hijau = istirahat.</p>
    <div style="column-count:4;column-gap:18px">${bagianKode('Kelas tidak belajar di sekolah', kode.alasan)}${bagianKode('Mapel dan kegiatan', kode.mapel)}${bagianKode('Ruang', kode.ruang.map(([k, nama]) => [k, nama || k] as [string, string]))}${bagianKode('Guru', kode.guru)}</div>
    ${o.diperbarui ? `<div class="mt-1 text-right text-[8px] text-slate-500">Jadwal diperbarui ${esc(o.diperbarui)} WIB</div>` : ''}
  </section>`;
}

/**
 * Rekap satu pekan semua kelas (atau guru/ruang) dalam satu halaman A4 atau F4 landscape, ditambah halaman penjelasan kode.
 * Bila baris terlalu banyak untuk satu halaman (mis. 61 guru), dibagi rata ke beberapa halaman dengan kepala tabel diulang.
 */
export function rekapCetak(p: Proyek, o: OpsiRekap): string {
  const kertas = KERTAS[o.ukuran];
  const n = p.polaReguler.length;
  const senin = seninPekan(o.tanggal, n);
  const ids = matriksP(p, o.tanggal, o.mode).baris.map((b) => b.id);
  const perHalaman = Math.max(1, Math.floor((kertas.tinggiHalaman - TINGGI_TETAP) / kertas.tinggi));
  const jumlahHalaman = Math.max(1, Math.ceil(ids.length / perHalaman));
  const rata = Math.ceil(ids.length / jumlahHalaman);
  const kegiatan = [...new Set(matriksP(p, o.tanggal, o.mode).hari.map((h) => h.kegiatan?.nama).filter((x): x is string => !!x))];
  const halaman = Array.from({ length: jumlahHalaman }, (_, i) => {
    const bagian = ids.slice(i * rata, (i + 1) * rata);
    return `<section class="halaman-cetak" style="width:${kertas.lebar}px">
      <div class="mb-1 flex items-end gap-3 border-b-2 border-slate-800 pb-0.5">
        <div class="min-w-0 flex-1"><span class="text-[9px] font-bold tracking-widest text-slate-600">SMK NEGERI BANSARI · JADWAL PELAJARAN</span> <span class="text-base font-bold">Rekap semua ${esc(JUDUL_MODE[o.mode].toLowerCase())}</span>${kegiatan.length ? ` <span class="text-[10px] text-slate-700">· ${esc(kegiatan.join(', '))}</span>` : ''}</div>
        <div class="shrink-0 text-[10px] font-semibold text-slate-700">${esc(tgl(senin, false))} – ${esc(tgl(tambahHari(senin, n - 1), true))}</div>
      </div>
      ${o.tabel(bagian, { lebar: kertas.lebar, tinggi: kertas.tinggi, huruf: kertas.huruf })}
      <div class="mt-0.5 flex text-[8px] text-slate-500"><span>${jumlahHalaman > 1 ? `Halaman ${i + 1} dari ${jumlahHalaman} · ` : ''}penjelasan kode ada di halaman berikutnya</span><span class="ml-auto">${o.diperbarui ? `Jadwal diperbarui ${esc(o.diperbarui)} WIB` : ''}</span></div>
    </section>`;
  }).join('');
  return `<style>@page{size:${kertas.mm};margin:8mm}</style>${halaman}${halamanKode(p, o)}`;
}
