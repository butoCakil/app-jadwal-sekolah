// Dialog "Cetak" pada halaman publik: pilih isi, tampilan, dan kertas, lalu buat PDF landscape (A4 atau F4) yang bisa dibuka atau diunduh.

import { esc } from '../ui/util';
import type { Gaya, Lingkup } from './pdf/buat';
import type { UkuranKertas } from './pdf/umum';

export interface KeadaanCetak {
  lingkup: Lingkup;
  gaya: Gaya;
  kertas: UkuranKertas;
  status: 'pilih' | 'membuat' | 'selesai' | 'galat';
  /** alamat blob PDF yang sudah jadi */
  url?: string;
  berkas?: string;
  halaman?: number;
  galat?: string;
}

/** Ikon printer untuk tombol tunggal di kepala halaman. */
export const IKON_CETAK =
  '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="9" rx="2"/><path d="M7 14h10v7H7z" fill="#fff"/></svg>';

/** Nama berkas PDF, mis. jadwal-kelas-2026-11-23.pdf */
export function namaBerkas(lingkup: Lingkup, mode: 'rombel' | 'guru' | 'ruang', tanggal: string): string {
  const jenis = { rombel: 'kelas', guru: 'guru', ruang: 'ruang' }[mode];
  return `jadwal-${lingkup === 'rekap' ? `rekap-${jenis}` : lingkup === 'semua' ? `semua-${jenis}` : jenis}-${tanggal}.pdf`;
}

export function htmlDialogCetak(c: KeadaanCetak, o: { semua: boolean; jenis: string }): string {
  const pil = (kunci: string, nilai: string, label: string, aktif: boolean, mati = false) =>
    `<button data-aksi="cetakPilih" data-kunci="${kunci}" data-nilai="${nilai}" ${mati ? 'disabled' : ''} aria-pressed="${aktif}" class="flex-1 rounded-xl border px-3 py-2.5 text-left text-sm font-semibold ${aktif ? 'border-[#0d1e33] bg-[#0d1e33] text-white' : 'border-slate-300 bg-white text-slate-700'} ${mati ? 'opacity-40' : ''}">${label}</button>`;
  const isi = o.semua
    ? `${pil('lingkup', 'rekap', 'Rekap pekan ini<span class="block text-[11px] font-normal opacity-80">semua ' + esc(o.jenis) + ' dalam satu halaman</span>', c.lingkup === 'rekap')}${pil('lingkup', 'semua', 'Satu halaman per ' + esc(o.jenis) + '<span class="block text-[11px] font-normal opacity-80">jadwal pekan ini</span>', c.lingkup === 'semua')}`
    : `${pil('lingkup', 'satu', 'Yang sedang dibuka<span class="block text-[11px] font-normal opacity-80">jadwal pekan ini</span>', c.lingkup === 'satu')}${pil('lingkup', 'semua', 'Semua ' + esc(o.jenis) + '<span class="block text-[11px] font-normal opacity-80">satu halaman per ' + esc(o.jenis) + '</span>', c.lingkup === 'semua')}`;
  const rekap = c.lingkup === 'rekap';
  const gaya = `${pil('gaya', 'bawaan', 'Tampilan bawaan', c.gaya === 'bawaan' || rekap)}${pil('gaya', 'asc', 'Tampilan aSc timetable', c.gaya === 'asc' && !rekap, rekap)}`;
  const kertas = `${pil('kertas', 'A4', 'A4<span class="block text-[11px] font-normal opacity-80">297 × 210 mm</span>', c.kertas === 'A4')}${pil('kertas', 'F4', 'F4<span class="block text-[11px] font-normal opacity-80">330 × 215 mm</span>', c.kertas === 'F4')}`;
  const hasil =
    c.status === 'membuat'
      ? '<div class="rounded-xl bg-slate-100 px-3 py-3 text-center text-sm text-slate-600">Membuat PDF…</div>'
      : c.status === 'galat'
        ? `<div class="rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-800">PDF gagal dibuat: ${esc(c.galat ?? 'kesalahan tidak dikenal')}</div>`
        : c.status === 'selesai' && c.url
          ? `<div class="rounded-xl border border-emerald-200 bg-emerald-50 p-3"><div class="mb-2 text-sm text-emerald-900">PDF siap · ${c.halaman ?? 1} halaman · landscape ${esc(c.kertas)}</div>
              <div class="flex gap-2"><a href="${esc(c.url)}" target="_blank" rel="noopener" class="flex-1 rounded-xl bg-[#0d1e33] px-3 py-2.5 text-center text-sm font-semibold text-white">Buka</a><a href="${esc(c.url)}" download="${esc(c.berkas ?? 'jadwal.pdf')}" class="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-center text-sm font-semibold text-slate-700">Unduh</a></div></div>`
          : '';
  const judulBagian = (t: string) => `<div class="mb-1.5 mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">${t}</div>`;
  return `<div class="fixed inset-0 z-40 bg-black/30" data-aksi="cetakTutup"></div>
    <div class="fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[90vh] max-w-lg overflow-auto rounded-t-2xl bg-white p-4 pb-6 shadow-2xl" role="dialog" aria-label="Cetak jadwal">
      <div class="flex items-start gap-2"><div class="flex-1 text-base font-bold">Cetak jadwal</div><button class="h-8 w-8 shrink-0 rounded-full bg-slate-100 text-slate-600" data-aksi="cetakTutup" aria-label="Tutup">✕</button></div>
      ${judulBagian('Isi')}<div class="flex gap-2">${isi}</div>
      ${judulBagian('Tampilan')}<div class="flex gap-2">${gaya}</div>${rekap ? '<p class="mt-1 text-[11px] text-slate-500">Rekap memakai tampilan bawaan (tabel padat semua baris).</p>' : ''}
      ${judulBagian('Kertas (mendatar)')}<div class="flex gap-2">${kertas}</div>
      <button data-aksi="cetakBuat" ${c.status === 'membuat' ? 'disabled' : ''} class="mt-4 w-full rounded-xl bg-amber-500 px-4 py-3 text-base font-bold text-white disabled:opacity-50">Buat PDF</button>
      <div class="mt-3">${hasil}</div>
    </div>`;
}
