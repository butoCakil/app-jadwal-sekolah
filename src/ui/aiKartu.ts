import type { Instruksi, JenisPerubahan } from '../ai/instruksi';
import type { Giliran } from '../ai/sesi';
import { esc } from './util';

/**
 * Tampilan teks balasan AI dan kartu usulan perubahan. Fungsi murni (tanpa keadaan global) supaya mudah diuji.
 */

/** Teks balasan: dibersihkan, lalu **tebal**, `kode`, dan daftar "- " ditampilkan; selain itu apa adanya. */
export function formatTeks(teks: string): string {
  const baris = esc(teks).split('\n');
  const keluar: string[] = [];
  let daftar = false;
  const satuBaris = (s: string) => s.replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>').replace(/`([^`\n]+)`/g, '<code class="rounded bg-slate-100 px-1 text-[0.92em]">$1</code>');
  for (const b of baris) {
    const m = /^\s*(?:[-*•])\s+(.*)$/.exec(b);
    if (m) {
      if (!daftar) keluar.push('<ul class="my-1 list-disc space-y-0.5 pl-5">');
      daftar = true;
      keluar.push(`<li>${satuBaris(m[1] ?? '')}</li>`);
      continue;
    }
    if (daftar) {
      keluar.push('</ul>');
      daftar = false;
    }
    keluar.push(b.trim() === '' ? '<div class="h-2"></div>' : `<div>${satuBaris(b)}</div>`);
  }
  if (daftar) keluar.push('</ul>');
  return keluar.join('');
}

export function namaOp(ins: Instruksi): string {
  switch (ins.op) {
    case 'ubahJp': return 'Ubah JP beban';
    case 'hapusBeban': return 'Hapus beban';
    case 'tambahBeban': return 'Tambah beban';
    case 'ruangBeban': return 'Atur ruang beban';
    case 'guruTidakTersedia': return 'Guru tidak tersedia';
    case 'ruangTerlarang': return 'Ruang terlarang';
    case 'kunciRuang': return 'Kunci ruang kegiatan';
    case 'susun': return 'Susun otomatis';
    case 'tambahKegiatan': return ins.agenda ? 'Tambah agenda kalender' : 'Tambah kegiatan';
    case 'ubahKegiatan': return 'Ubah kegiatan';
    case 'geserKegiatan': return 'Geser kegiatan';
    case 'hapusKegiatan': return 'Hapus kegiatan';
  }
}

const TANDA: Record<JenisPerubahan, { simbol: string; kelas: string }> = {
  tambah: { simbol: '＋', kelas: 'bg-emerald-100 text-emerald-800' },
  ubah: { simbol: '✎', kelas: 'bg-sky-100 text-sky-800' },
  hapus: { simbol: '✕', kelas: 'bg-red-100 text-red-800' },
  geser: { simbol: '⇄', kelas: 'bg-violet-100 text-violet-800' },
};

const panah = (teks: string) => esc(teks).replace(/ → /g, ' <span class="font-bold text-slate-400">→</span> ');

function uraianSusun(ins: Extract<Instruksi, { op: 'susun' }>): string {
  const cara = ins.cara === 'nol' ? 'dari nol' : ins.cara === 'induk' ? 'mulai dari jadwal induk' : 'melengkapi jadwal yang ada';
  return `Menjalankan Susun Otomatis (${cara}${ins.detik ? `, ${ins.detik} detik` : ''}). Penyusunan berjalan di jendela ini; hasilnya tetap Anda tinjau dan terapkan sendiri.`;
}

export interface OpsiKartu {
  /** nomor instruksi yang dikecualikan admin (hanya berarti saat menunggu) */
  dikecualikan: Set<number>;
  /** tombol Urungkan ditampilkan (hanya bila perubahan itu masih yang terakhir) */
  bisaUrungkan: boolean;
  /** pembuat teks waktu, mis. "16.52" */
  waktu: (ms: number) => string;
}

/** Jumlah instruksi yang akan diterapkan dan jumlah seluruhnya. */
export function hitungPilihan(g: Giliran, dikecualikan: Set<number>): { dipilih: number; total: number } {
  const total = g.rencana?.balasan.instruksi.length ?? 0;
  let dipilih = 0;
  for (let i = 0; i < total; i++) if (!dikecualikan.has(i)) dipilih++;
  return { dipilih, total };
}

/** Kartu usulan: perubahan dikelompokkan per instruksi, tiap baris bertanda jenis, peringatan menonjol, tombol eksekusi jelas. */
export function kartuUsulan(g: Giliran, o: OpsiKartu): string {
  const r = g.rencana;
  if (!r) return '';
  const h = r.hasil;
  const ins = r.balasan.instruksi;
  const menunggu = r.status === 'menunggu';
  const diterapkan = r.status === 'diterapkan';
  const dikecualikan = menunggu ? o.dikecualikan : new Set(r.dikecualikan ?? []);
  const { dipilih, total } = hitungPilihan(g, dikecualikan);
  const lencana = diterapkan
    ? `<span class="lencana bg-emerald-100 text-emerald-800">✓ Diterapkan${r.diputuskan ? ` ${esc(o.waktu(r.diputuskan))}` : ''}</span>`
    : r.status === 'diurungkan'
      ? `<span class="lencana bg-orange-100 text-orange-800">↶ Diurungkan${r.diputuskan ? ` ${esc(o.waktu(r.diputuskan))}` : ''}</span>`
    : r.status === 'ditolak'
      ? `<span class="lencana bg-slate-200 text-slate-700">Ditolak${r.diputuskan ? ` ${esc(o.waktu(r.diputuskan))}` : ''}</span>`
      : '<span class="lencana bg-amber-100 text-amber-800">Menunggu keputusan Anda</span>';
  const butir = ins
    .map((x, i) => {
      const baris = h.perubahan.filter((b) => b.instruksi === i);
      const tidak = dikecualikan.has(i);
      const kotak = menunggu
        ? `<input type="checkbox" class="mt-0.5 h-4 w-4 shrink-0 accent-[#2347b8]" data-aksi="aiPilih" data-id="${g.id}" data-i="${i}" ${tidak ? '' : 'checked'} aria-label="Terapkan: ${esc(namaOp(x))}">`
        : `<span class="mt-0.5 w-4 shrink-0 text-center text-xs ${tidak ? 'text-slate-400' : 'text-emerald-600'}">${tidak ? '–' : diterapkan ? '✓' : ''}</span>`;
      const isi = baris.length
        ? baris.map((b) => {
            const t = TANDA[b.jenis ?? 'ubah'];
            return `<div class="flex items-start gap-1.5 py-0.5"><span class="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded text-[11px] font-bold ${t.kelas}">${t.simbol}</span><span class="min-w-0 break-words">${panah(b.teks)}</span></div>`;
          }).join('')
        : x.op === 'susun'
          ? `<div class="py-0.5 text-slate-700">${esc(uraianSusun(x))}</div>`
          : '<div class="py-0.5 text-slate-500">Tidak ada perubahan data.</div>';
      return `<div class="flex gap-2 border-t border-slate-200 py-2 first:border-t-0 ${tidak ? 'opacity-50' : ''}">${kotak}<div class="min-w-0 flex-1"><div class="text-xs font-semibold uppercase tracking-wide text-slate-500">${esc(namaOp(x))}${tidak && !menunggu ? ' · tidak diterapkan' : ''}</div><div class="text-sm ${tidak ? 'line-through' : ''}">${isi}</div></div></div>`;
    })
    .join('');
  const peringatan = h.peringatan.length
    ? `<div class="mt-2 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900"><span aria-hidden="true">⚠</span><div class="min-w-0 space-y-0.5">${h.peringatan.map((x) => `<div>${esc(x)}</div>`).join('')}</div></div>`
    : '';
  const adaSusunDipilih = ins.some((x, i) => x.op === 'susun' && !dikecualikan.has(i));
  const aksi = menunggu
    ? `<div class="sticky bottom-0 -mx-3 -mb-3 mt-3 flex flex-wrap items-center gap-2 rounded-b-xl border-t border-sky-200 bg-sky-50 px-3 py-2"><button class="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40" data-aksi="aiTerapkan" data-id="${g.id}" ${dipilih ? '' : 'disabled'}>${dipilih === total ? (total === 1 ? 'Terapkan' : `Terapkan semua (${total})`) : `Terapkan ${dipilih} dari ${total}`}${adaSusunDipilih ? ' dan susun' : ''}</button><button class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" data-aksi="aiTolak" data-id="${g.id}">Tolak</button><span class="text-[11px] text-slate-500">Belum ada yang berubah sebelum Anda menerapkan.</span></div>`
    : diterapkan && o.bisaUrungkan
      ? '<div class="mt-2"><button class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50" data-aksi="aiUrungkan">↶ Urungkan perubahan ini</button></div>'
      : '';
  const warna = menunggu ? 'border-sky-200 bg-sky-50' : diterapkan ? 'border-emerald-200 bg-emerald-50/60' : 'border-slate-200 bg-slate-50';
  return `<div class="mt-2 rounded-xl border ${warna} p-3"><div class="mb-1 flex flex-wrap items-center gap-2"><span class="text-sm font-bold text-slate-900">Usulan perubahan</span><span class="text-xs text-slate-500">${total} butir</span><span class="ml-auto">${lencana}</span></div>${butir}${peringatan}${aksi}</div>`;
}
