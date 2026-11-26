import type { Proyek } from '../model/tipe';
import { skemaUntukTanggal } from '../model/kalender';
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
  const slots = p.versi[0]?.slots ?? [];
  const masalah = periksa(p, slots, { skemaPerHari });
  return { senin, hari, skemaPerHari, slots, masalah, peta: masalahPerSlot(masalah), jumlahPelanggaran: masalah.filter(adalahPelanggaran).length };
}
