import type { Konteks } from './konteks';
import { bulanDari, tanggalUntukPeriode } from './kalenderTab';
import { esc, isoLokal, tanggalPendek } from './util';

/** Bilah periode di atas grid: memilih periode yang dikerjakan, menampilkan versi jadwal dan rombel yang tidak aktif (mis. PKL). */
export function barPeriode(k: Konteks): string {
  const p = k.p;
  const t = k.turunan;
  const daftar = p.kalender.filter((g) => g.jenis !== 'libur').sort((a, b) => a.mulai.localeCompare(b.mulai));
  if (daftar.length === 0) return '';
  const tdk = [...t.rombelTidakAktif].map((id) => p.master.rombel.find((r) => r.id === id)?.kode ?? '?');
  const jadwalKhusus = !!t.periode?.versiId;
  return `<div class="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm">
    <label class="flex items-center gap-1.5 font-medium text-sky-900">Periode
      <select id="periodeAktif" class="isian max-w-[34rem]"><option value="" ${t.periode ? '' : 'selected'}>— tidak ada periode khusus (reguler) —</option>${daftar
        .map((g) => `<option value="${esc(g.id)}" ${t.periode?.id === g.id ? 'selected' : ''}>${esc(g.nama)} · ${tanggalPendek(g.mulai)}–${tanggalPendek(g.selesai)}${p.periodeAktifId === g.id ? ' ✓ aktif' : ''}</option>`)
        .join('')}</select></label>
    <span class="text-xs text-sky-900">Jadwal: <b>${esc(t.versi?.nama ?? '—')}</b>${jadwalKhusus ? '' : ' (reguler)'}</span>
    ${tdk.length ? `<span class="lencana bg-amber-100 text-amber-900" title="${esc(tdk.join(', '))}">${tdk.length} rombel tidak aktif (PKL): ${esc(tdk.slice(0, 4).join(', '))}${tdk.length > 4 ? '…' : ''}</span>` : ''}
    <button class="tombol ml-auto !py-0.5 !text-xs" data-aksi="kalBulan2">Buka di kalender</button></div>`;
}

export function ubahPeriode(k: Konteks, el: HTMLInputElement & HTMLSelectElement): boolean {
  if (el.id !== 'periodeAktif') return false;
  const g = k.p.kalender.find((x) => x.id === el.value);
  if (!g) {
    k.ui.tanggal = isoLokal(new Date());
    k.ubah((p) => void delete p.periodeAktifId);
    return true;
  }
  k.ui.tanggal = tanggalUntukPeriode(g, isoLokal(new Date()));
  k.ui.kalTanggal = k.ui.tanggal;
  k.ui.kalBulan = bulanDari(k.ui.tanggal);
  k.ubah((p) => void (p.periodeAktifId = g.id));
  return true;
}

export function klikPeriode(k: Konteks, el: HTMLElement): boolean {
  if (el.dataset.aksi !== 'kalBulan2') return false;
  k.ui.kalTanggal = k.ui.tanggal;
  k.ui.kalBulan = bulanDari(k.ui.tanggal);
  k.ui.skemaSub = 'kalender';
  k.ke('skema');
  return true;
}
