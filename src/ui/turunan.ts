import type { Proyek } from '../model/tipe';
import { periodeUntukTanggal, rombelTidakAktifIds, skemaUntukTanggal, versiUntukTanggal } from '../model/kalender';
import { adalahPelanggaran, masalahPerSlot, periksa } from '../mesin/validator';
import type { Turunan } from './konteks';
import { seninPekan, tambahHari } from './util';

export function hitungTurunan(p: Proyek, tanggal: string): Turunan {
  const senin = seninPekan(tanggal);
  const hari = [0, 1, 2, 3, 4].map((i) => {
    const tgl = tambahHari(senin, i);
    return { tgl, info: skemaUntukTanggal(tgl, p) };
  });
  const skemaPerHari = hari.map((h) => h.info.skemaId);
  const versi = versiUntukTanggal(tanggal, p);
  // rombel tidak aktif (mis. PKL) mengikuti hari acuan; slot milik rombel itu disembunyikan dan tidak diperiksa
  const rombelTidakAktif = rombelTidakAktifIds(tanggal, p.kalender);
  const rombelBeban = new Map(p.beban.map((b) => [b.id, b.rombelId]));
  const semuaSlot = versi?.slots ?? [];
  const slots = rombelTidakAktif.size ? semuaSlot.filter((s) => !rombelTidakAktif.has(rombelBeban.get(s.bebanId) ?? '')) : semuaSlot;
  const masalah = periksa(p, slots, { skemaPerHari, rombelTidakAktif });
  return {
    senin, hari, skemaPerHari, slots, masalah, peta: masalahPerSlot(masalah), jumlahPelanggaran: masalah.filter(adalahPelanggaran).length,
    versi, periode: periodeUntukTanggal(tanggal, p.kalender), rombelTidakAktif,
  };
}
