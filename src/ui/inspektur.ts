import type { Kategori, Masalah } from '../mesin/validator';
import type { Konteks } from './konteks';
import { esc } from './util';

const KATEGORI: { id: Kategori | 'semua'; label: string; ket: string }[] = [
  { id: 'semua', label: 'Semua', ket: '' },
  { id: 'bentrok', label: 'Bentrok', ket: 'Guru, rombel, atau ruang dipakai ganda' },
  { id: 'aturan', label: 'Pelanggaran aturan', ket: 'Ruang terlarang, guru tidak tersedia, JP berlebih' },
  { id: 'gap', label: 'Kurang JP / ruang', ket: 'Beban yang belum penuh atau slot tanpa ruang' },
  { id: 'kapasitas', label: 'Tidak muat', ket: 'Slot di luar kapasitas skema pekan yang dilihat' },
];

const WARNA: Record<Kategori, string> = {
  bentrok: 'border-red-300 bg-red-50',
  aturan: 'border-red-300 bg-red-50',
  gap: 'border-amber-300 bg-amber-50',
  kapasitas: 'border-orange-300 bg-orange-50',
};
const IKON: Record<Kategori, string> = { bentrok: '⛔', aturan: '🚫', gap: '➕', kapasitas: '📅' };

export function hitungKategori(masalah: Masalah[]): Record<Kategori | 'semua', number> {
  const h: Record<Kategori | 'semua', number> = { semua: masalah.length, bentrok: 0, aturan: 0, gap: 0, kapasitas: 0 };
  for (const m of masalah) h[m.kategori] += 1;
  return h;
}

export function renderInspektur(k: Konteks): string {
  const semua = k.turunan.masalah;
  const hitung = hitungKategori(semua);
  const tampil = semua.filter((m) => k.ui.saring === 'semua' || m.kategori === k.ui.saring);
  const urut: Kategori[] = ['bentrok', 'aturan', 'kapasitas', 'gap'];
  tampil.sort((a, b) => urut.indexOf(a.kategori) - urut.indexOf(b.kategori));

  const chip = KATEGORI.map(
    (c) => `<button class="lencana ${k.ui.saring === c.id ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50'}" data-aksi="saring" data-kat="${c.id}" title="${esc(c.ket)}">${c.label} <b>${hitung[c.id]}</b></button>`,
  ).join('');

  const baris = tampil
    .map((m) => {
      const rombelId = m.rombelId ?? k.p.beban.find((b) => b.id === m.bebanId)?.rombelId ?? '';
      const lihat = rombelId ? `<button class="tombol shrink-0" data-aksi="lihatMasalah" data-rombel="${esc(rombelId)}" data-slot="${esc(m.slotIds[0] ?? '')}">Lihat di grid</button>` : '';
      return `<div class="flex items-start justify-between gap-3 rounded-xl border ${WARNA[m.kategori]} p-3">
        <div class="flex gap-2 text-sm"><span>${IKON[m.kategori]}</span><span>${esc(m.pesan)}</span></div>${lihat}</div>`;
    })
    .join('');

  const kosong = semua.length === 0
    ? '<div class="kartu p-8 text-center"><div class="text-3xl">✅</div><div class="mt-2 font-semibold">Tidak ada masalah</div><div class="text-sm text-slate-500">Semua beban terjadwal penuh dan tidak ada bentrok.</div></div>'
    : tampil.length === 0
      ? '<div class="kartu p-6 text-center text-sm text-slate-500">Tidak ada masalah pada kategori ini.</div>'
      : '';

  return `<div class="mb-1 text-lg font-semibold">Conflict Inspector</div>
    <div class="mb-3 text-sm text-slate-500">Hasil pemeriksaan semua jadwal. Bagian “Tidak muat” mengikuti skema pekan pada tanggal acuan (${esc(k.ui.tanggal)}).</div>
    <div class="mb-3 flex flex-wrap gap-2">${chip}</div>
    <div class="space-y-2">${baris}${kosong}</div>`;
}

export function klikInspektur(k: Konteks, el: HTMLElement): boolean {
  const d = el.dataset;
  if (d.aksi === 'saring') {
    k.ui.saring = d.kat as Kategori | 'semua';
    k.gambar();
    return true;
  }
  if (d.aksi === 'lihatMasalah') {
    k.ui.mode = 'rombel';
    k.ui.entitasId = d.rombel ?? k.ui.entitasId;
    k.ke('grid');
    return true;
  }
  return false;
}
