import type { Beban, Proyek } from '../model/tipe';
import { skemaUntukTanggal } from '../model/kalender';
import { adalahPelanggaran, masalahPerSlot, periksa } from '../mesin/validator';
import { bebanRombel, fokusInduk, jadwalPekan, kalenderFokus, kegiatanFokus, kegiatanPadaTanggal, semesterKegiatan, semesterPadaFokus, tidakAktifPada, versiDari, versiSemester, type Fokus } from '../model/simpul';
import type { Turunan } from './konteks';
import { aturanPekan } from '../model/aturanKegiatan';
import { seninPekan, tambahHari } from './util';

/**
 * Data turunan untuk pekan yang memuat `tanggal` pada fokus tertentu (menurut tanggal, induk, atau satu kegiatan).
 * Slot digabung per hari: rombel terdampak dari versi kegiatan yang berlaku hari itu, rombel lain dari induk.
 */
export function hitungTurunan(p: Proyek, tanggal: string, fokus: Fokus = 'auto'): Turunan {
  const n = p.polaReguler.length;
  const senin = seninPekan(tanggal, n);
  const pf = { ...p, kalender: kalenderFokus(p, fokus) };
  const hari = Array.from({ length: n }, (_, i) => i).map((i) => {
    const tgl = tambahHari(senin, i);
    return { tgl, info: skemaUntukTanggal(tgl, pf) };
  });
  const skemaPerHari = hari.map((h) => h.info.skemaId);
  const pekan = jadwalPekan(p, hari.map((h) => h.tgl), fokus);
  // kegiatan utama pekan ini: yang difokuskan, atau yang berlaku pada tanggal acuan
  const periode = kegiatanFokus(p, fokus) ?? (fokusInduk(fokus) ? undefined : kegiatanPadaTanggal(p, tanggal, fokus));
  const semester = periode ? semesterKegiatan(p, periode) : semesterPadaFokus(p, tanggal, fokus);
  const rombelTidakAktif = tidakAktifPada(p, periode, semester);
  const versi = (periode?.versiId ? versiDari(p, periode.versiId) : undefined) ?? versiSemester(p, semester);
  const beban: Beban[] = p.master.rombel.flatMap((r) => bebanRombel(p, periode, r.id, semester));
  const ada = new Set(beban.map((b) => b.id));
  const rujukan = p.beban.filter((b) => !ada.has(b.id) && pekan.slots.some((s) => s.bebanId === b.id));
  const aturan = aturanPekan(p, pekan.kegiatanHari, hari.map((h) => h.tgl), skemaPerHari);
  const diterima = new Map((p.diterima ?? []).map((x) => [x.pesan, x.catatan?.trim() || 'diterima']));
  const masalah = periksa({ ...p, beban: [...beban, ...rujukan] }, pekan.slots, { skemaPerHari, rombelTidakAktif, aturan }).map((m) => (adalahPelanggaran(m) && diterima.has(m.pesan) ? { ...m, diterima: diterima.get(m.pesan) as string } : m));
  return {
    senin, hari, skemaPerHari, slots: pekan.slots, beban, masalah, peta: masalahPerSlot(masalah.filter((m) => !m.diterima)), jumlahPelanggaran: masalah.filter((m) => adalahPelanggaran(m) && !m.diterima).length,
    versi, periode, semester, rombelTidakAktif, pekan, fokus, aturan,
  };
}
