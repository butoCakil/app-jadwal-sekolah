// Perakit PDF jadwal: memilih isi (satu halaman per kelas/guru/ruang atau rekap), gaya (bawaan / aSc), dan ukuran kertas (A4 / F4), semuanya landscape.

import type { Proyek } from '../../model/tipe';
import { daftarEntitasP, type ModeP } from '../tampil';
import { halamanAsc } from './asc';
import { halamanBawaan } from './bawaan';
import { PenulisPdf } from './penulis';
import { rekapPdf } from './rekap';
import { JUDUL_MODE, KERTAS, type UkuranKertas } from './umum';

export type Gaya = 'bawaan' | 'asc';
/** satu = entitas terpilih; semua = satu halaman per entitas; rekap = matriks semua dalam satu halaman */
export type Lingkup = 'satu' | 'semua' | 'rekap';

export interface OpsiPdf {
  mode: ModeP;
  lingkup: Lingkup;
  /** entitas terpilih (untuk lingkup satu) */
  id: string;
  /** tanggal mana pun dalam pekan yang dicetak */
  tanggal: string;
  gaya: Gaya;
  kertas: UkuranKertas;
  /** teks "diperbarui ..." untuk kaki halaman */
  diperbarui?: string;
}

export function buatPdf(p: Proyek, o: OpsiPdf): Uint8Array<ArrayBuffer> {
  const k = KERTAS[o.kertas];
  const pen = new PenulisPdf(k.lebar, k.tinggi, `Jadwal ${JUDUL_MODE[o.mode]} SMK Negeri Bansari`);
  if (o.lingkup === 'rekap') {
    // rekap hanya bergaya bawaan (matriks padat)
    rekapPdf(pen, p, o.mode, o.tanggal, o.kertas, o.diperbarui);
    return pen.hasil();
  }
  const ids = o.lingkup === 'satu' ? [o.id] : daftarEntitasP(p, o.mode).map((e) => e.id);
  ids.forEach((id, i) => {
    if (i > 0) pen.halamanBaru();
    if (o.gaya === 'asc') halamanAsc(pen, p, o.mode, id, o.tanggal, { diperbarui: o.diperbarui });
    else halamanBawaan(pen, p, o.mode, id, o.tanggal, { diperbarui: o.diperbarui });
  });
  return pen.hasil();
}
