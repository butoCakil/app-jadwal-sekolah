/**
 * Buku jadwal siap cetak (A4 landscape): satu halaman per kelas / guru / ruang untuk satu pekan,
 * lengkap dengan penjelasan kode mapel, guru, dan ruang yang muncul di halaman itu.
 * "Unduh" = Simpan sebagai PDF dari dialog cetak peramban.
 */
import type { Proyek } from '../model/tipe';
import { esc, seninPekan, tambahHari } from '../ui/util';
import { daftarEntitasP, jadwalPekanP, type ModeP } from './tampil';

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
