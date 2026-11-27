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

/** Isian awal catatan keputusan: untuk guru yang mengawas, "KODE memberi tugas ke siswa". */
export function catatanAwal(m: Masalah): string {
  const g = /^Guru (\S+) mengawas/.exec(m.pesan)?.[1];
  return g ? `${g} memberi tugas ke siswa` : '';
}

/** Tombol Terima… (pelanggaran wajib yang belum diterima) atau Batalkan (yang sudah diterima). */
export function tombolTerima(m: Masalah): string {
  if (m.diterima) return `<button class="tombol shrink-0" data-aksi="batalTerima" data-pesan="${esc(m.pesan)}">Batalkan</button>`;
  if (m.kategori !== 'bentrok' && m.kategori !== 'aturan') return '';
  return `<button class="tombol shrink-0" data-aksi="terimaMasalah" data-pesan="${esc(m.pesan)}" data-awal="${esc(catatanAwal(m))}" title="Tandai sebagai keputusan lapangan: tidak dihitung sebagai bentrok">Terima…</button>`;
}

export function hitungKategori(masalah: Masalah[]): Record<Kategori | 'semua', number> {
  const h: Record<Kategori | 'semua', number> = { semua: masalah.length, bentrok: 0, aturan: 0, gap: 0, kapasitas: 0 };
  for (const m of masalah) {
    if (m.diterima) continue;
    h[m.kategori] += 1;
  }
  h.semua = masalah.filter((m) => !m.diterima).length;
  return h;
}

export function renderInspektur(k: Konteks): string {
  const semua = k.turunan.masalah;
  const hitung = hitungKategori(semua);
  const tampil = semua.filter((m) => k.ui.saring === 'semua' || m.kategori === k.ui.saring);
  const urut: Kategori[] = ['bentrok', 'aturan', 'kapasitas', 'gap'];
  tampil.sort((a, b) => Number(!!a.diterima) - Number(!!b.diterima) || urut.indexOf(a.kategori) - urut.indexOf(b.kategori));

  const chip = KATEGORI.map(
    (c) => `<button class="lencana ${k.ui.saring === c.id ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50'}" data-aksi="saring" data-kat="${c.id}" title="${esc(c.ket)}">${c.label} <b>${hitung[c.id]}</b></button>`,
  ).join('');

  const baris = tampil
    .map((m) => {
      const rombelId = m.rombelId ?? k.p.beban.find((b) => b.id === m.bebanId)?.rombelId ?? '';
      const lihat = rombelId ? `<button class="tombol shrink-0" data-aksi="lihatMasalah" data-rombel="${esc(rombelId)}" data-slot="${esc(m.slotIds[0] ?? '')}">Lihat di grid</button>` : '';
      const terima = tombolTerima(m);
      if (m.diterima) {
        return `<div class="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-slate-500">
          <div class="text-sm"><div class="flex gap-2"><span>✔</span><span>${esc(m.pesan)}</span></div><div class="mt-1 pl-6 text-xs"><b>Diterima:</b> ${esc(m.diterima)}</div></div><div class="flex gap-2">${lihat}${terima}</div></div>`;
      }
      return `<div class="flex items-start justify-between gap-3 rounded-xl border ${WARNA[m.kategori]} p-3">
        <div class="flex gap-2 text-sm"><span>${IKON[m.kategori]}</span><span>${esc(m.pesan)}</span></div><div class="flex gap-2">${lihat}${terima}</div></div>`;
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
  if (d.aksi === 'terimaMasalah') {
    const pesan = d.pesan ?? '';
    const catatan = window.prompt('Catatan keputusan (mis. guru memberi tugas ke siswa saat mengawas):', d.awal ?? '');
    if (catatan === null) return true;
    k.ubah((x) => {
      x.diterima = [...(x.diterima ?? []).filter((y) => y.pesan !== pesan), { pesan, ...(catatan.trim() ? { catatan: catatan.trim() } : {}) }];
    });
    return true;
  }
  if (d.aksi === 'batalTerima') {
    k.ubah((x) => {
      x.diterima = (x.diterima ?? []).filter((y) => y.pesan !== d.pesan);
      if (!x.diterima.length) delete x.diterima;
    });
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
