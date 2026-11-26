import type { Proyek, Slot } from '../model/tipe';
import { NAMA_HARI } from '../model/tipe';
import { hitungSkema, kapasitasKbm } from '../model/skema';
import { rombelAktif, selisihKapasitas, skemaUntukTanggal } from '../model/kalender';
import type { SkemaHari } from '../model/kalender';
import { petakanSlot } from '../model/jadwal';
import { esc, seninPekan, tambahHari } from './util';

export interface StatusGrid {
  tanggal: string;
  rombelId: string;
  versiId: string;
}

const LABEL_SUMBER = { manual: 'manual', kegiatan: 'kalender', reguler: 'reguler' } as const;

function selSlot(p: Proyek, s: Slot | undefined): string {
  if (!s) return '<span class="text-slate-300">·</span>';
  const g = p.master.guru.find((x) => x.id === s.guruId)?.kode ?? '?';
  const m = p.master.mapel.find((x) => x.id === s.mapelId)?.kode ?? '?';
  const r = p.master.ruang.find((x) => x.id === s.ruangId)?.kode ?? '?';
  return `<span class="font-semibold">${esc(m)}</span> <span class="text-slate-500">${esc(g)} · ${esc(r)}</span>`;
}

export function renderGrid(p: Proyek, st: StatusGrid): string {
  const senin = seninPekan(st.tanggal);
  const hari = [0, 1, 2, 3, 4].map((i) => {
    const tgl = tambahHari(senin, i);
    return { tgl, info: skemaUntukTanggal(tgl, p) as SkemaHari };
  });
  const skemaById = new Map(p.skema.map((s) => [s.id, s]));
  const versi = p.versi.find((v) => v.id === st.versiId) ?? p.versi[0];
  const slotsRombel = (versi?.slots ?? []).filter((s) => s.rombelId === st.rombelId);
  const { ditempatkan, tampungan } = petakanSlot(slotsRombel, hari.map((h) => h.info.skemaId), p.skema);
  const peta = new Map(ditempatkan.map((s) => [`${s.hari}:${s.jam}`, s]));

  // Kapasitas pekan ini = jumlah KBM dari skema yang benar-benar berlaku tiap hari
  const perHari = hari.map((h) => {
    const s = h.info.skemaId ? skemaById.get(h.info.skemaId) : undefined;
    return s ? kapasitasKbm(s) : 0;
  });
  const kapPekan = { perHari, total: perHari.reduce((a, b) => a + b, 0) };
  const aktif = rombelAktif(hari[0]!.tgl, p.kalender, p.master.rombel).some((r) => r.id === st.rombelId);
  const selisih = selisihKapasitas(p.master.rombel.filter((r) => r.id === st.rombelId), kapPekan);

  const kolom = hari
    .map((h, i) => {
      const nama = NAMA_HARI[i];
      if (!h.info.skemaId) {
        const alasan = h.info.alasan === 'libur' ? `Libur: ${esc(h.info.kegiatanLibur ?? '')}` : 'Tidak ada KBM';
        return `<div class="rounded-xl border border-slate-200 bg-white p-3"><div class="font-semibold">${nama}</div>
          <div class="text-xs text-slate-500">${h.tgl}</div><div class="mt-3 text-sm text-slate-500">${alasan}</div></div>`;
      }
      const sk = skemaById.get(h.info.skemaId);
      if (!sk) return `<div class="rounded-xl border border-red-300 bg-red-50 p-3 text-sm">Skema "${esc(h.info.skemaId)}" tidak ditemukan.</div>`;
      const baris = hitungSkema(sk)
        .map((b) => {
          if (b.nomorKbm === null) {
            return `<tr class="bg-amber-50 text-xs"><td class="px-2 py-1 font-semibold">${b.label}</td>
              <td class="px-2 py-1 text-slate-600">${b.mulai}–${b.selesai}</td><td class="px-2 py-1 text-slate-600">${esc(b.baris.kegiatan)}</td></tr>`;
          }
          if (b.nomorKbm === 0) {
            return `<tr class="text-xs" style="background:${sk.warna}14"><td class="px-2 py-1 font-semibold">${b.label}</td>
              <td class="px-2 py-1 text-slate-600">${b.mulai}–${b.selesai}</td><td class="px-2 py-1 italic text-slate-600">${esc(b.baris.kegiatan)}</td></tr>`;
          }
          return `<tr class="border-t border-slate-100 text-xs"><td class="px-2 py-1 font-semibold">${b.label}</td>
            <td class="px-2 py-1 text-slate-600">${b.mulai}–${b.selesai}</td>
            <td class="px-2 py-1" data-hari="${i}" data-jam="${b.nomorKbm}">${selSlot(p, peta.get(`${i}:${b.nomorKbm}`))}</td></tr>`;
        })
        .join('');
      return `<div class="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div class="px-3 py-2 text-white" style="background:${sk.warna}">
          <div class="font-semibold">${nama} <span class="text-xs font-normal opacity-80">${h.tgl}</span></div>
          <div class="text-xs opacity-90">${esc(sk.nama)} · skema ${LABEL_SUMBER[h.info.sumber ?? 'reguler']}</div>
        </div>
        <table class="w-full">${baris}</table></div>`;
    })
    .join('');

  const rombel = p.master.rombel.find((r) => r.id === st.rombelId);
  const banner: string[] = [];
  banner.push(`<span class="rounded-full bg-slate-200 px-2 py-0.5 text-xs">Kapasitas pekan ini: ${kapPekan.perHari.join(' + ')} = <b>${kapPekan.total} JP</b></span>`);
  if (!aktif) banner.push('<span class="rounded-full bg-amber-200 px-2 py-0.5 text-xs">Rombel ini tidak aktif pada pekan ini (kalender)</span>');
  for (const s of selisih) {
    const teks = s.selisih > 0 ? `kurang ${s.selisih} JP` : `lebih ${-s.selisih} JP`;
    banner.push(`<span class="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-800" title="Kebutuhan menurut data sumber dibanding kapasitas pola. Diputuskan manual.">${esc(rombel?.kode ?? '')}: butuh ${s.butuh} JP, tersedia ${s.kapasitas} JP → ${teks}</span>`);
  }

  const tray = tampungan.length
    ? `<div class="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3">
        <div class="mb-2 text-sm font-semibold">Tampungan (${tampungan.length}): tidak muat di skema pekan ini, perlu keputusan manual</div>
        <div class="flex flex-wrap gap-2">${tampungan
          .map((s) => `<div class="rounded-lg border border-amber-300 bg-white px-2 py-1 text-xs">${NAMA_HARI[s.hari]} jam ${s.jam}: ${selSlot(p, s)}</div>`)
          .join('')}</div></div>`
    : '';

  return `<div class="mb-3 flex flex-wrap gap-2">${banner.join('')}</div>
    <div class="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-5">${kolom}</div>${tray}`;
}
