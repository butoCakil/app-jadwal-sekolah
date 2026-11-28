// Warna tiap jenis kegiatan kalender; dipakai admin dan halaman publik.

import type { JenisKegiatan } from './tipe';

export const WARNA_JENIS: Record<JenisKegiatan, { titik: string; chip: string }> = {
  TKA: { titik: '#0284c7', chip: 'bg-sky-100 text-sky-800' },
  PKL: { titik: '#d97706', chip: 'bg-amber-100 text-amber-800' },
  ASAS: { titik: '#7c3aed', chip: 'bg-violet-100 text-violet-800' },
  ASAJ: { titik: '#c026d3', chip: 'bg-fuchsia-100 text-fuchsia-800' },
  UKK: { titik: '#0d9488', chip: 'bg-teal-100 text-teal-800' },
  ujian: { titik: '#4f46e5', chip: 'bg-indigo-100 text-indigo-800' },
  upacara: { titik: '#ca8a04', chip: 'bg-yellow-100 text-yellow-800' },
  rapor: { titik: '#16a34a', chip: 'bg-green-100 text-green-800' },
  libur: { titik: '#dc2626', chip: 'bg-red-100 text-red-800' },
  lain: { titik: '#64748b', chip: 'bg-slate-200 text-slate-700' },
};
