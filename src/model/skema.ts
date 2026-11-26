import type { BarisSkema, Skema } from './tipe';

export function keMenit(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) throw new Error(`Format jam tidak valid: "${hhmm}" (harus HH:MM)`);
  return Number(m[1]) * 60 + Number(m[2]);
}

export function keJam(menit: number): string {
  const h = Math.floor(menit / 60);
  const m = menit % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export interface BarisHitung {
  baris: BarisSkema;
  mulai: string;
  selesai: string;
  /** Nomor KBM internal: 0 = non-KBM, 1.. = pelajaran, null = istirahat */
  nomorKbm: number | null;
  /** Label tampilan (poster/cetak): urutan baris non-istirahat; istirahat "B1", "B2", ... */
  label: string;
}

/**
 * Menghitung waktu dan penomoran ganda tiap baris skema.
 * - nomorKbm: dipakai mesin untuk JP (nonKbm = 0, pelajaran mulai dari 1).
 * - label: yang tampil di layar akhir dan cetak (nonKbm tetap ikut dihitung, jadi
 *   Pembiasaan = 1 dan pelajaran pertama = 2; pada skema tanpa nonKbm pelajaran pertama = 1).
 */
export function hitungSkema(skema: Skema): BarisHitung[] {
  let t = keMenit(skema.jamMulai);
  let kbm = 0;
  let urutTampil = 0;
  let urutIstirahat = 0;
  return skema.baris.map((baris) => {
    const mulai = keJam(t);
    t += baris.durasi;
    const selesai = keJam(t);
    if (baris.tipe === 'istirahat') {
      urutIstirahat += 1;
      return { baris, mulai, selesai, nomorKbm: null, label: `B${urutIstirahat}` };
    }
    urutTampil += 1;
    if (baris.tipe === 'nonKbm') {
      return { baris, mulai, selesai, nomorKbm: 0, label: String(urutTampil) };
    }
    kbm += 1;
    return { baris, mulai, selesai, nomorKbm: kbm, label: String(urutTampil) };
  });
}

/** Jumlah jam pelajaran (KBM) pada skema ini. */
export function kapasitasKbm(skema: Skema): number {
  return skema.baris.filter((b) => b.tipe === 'kbm').length;
}

/** Jumlah baris non-istirahat (angka yang dikenal sebagai "skema 11 jam"). */
export function jumlahJamTampil(skema: Skema): number {
  return skema.baris.filter((b) => b.tipe !== 'istirahat').length;
}

export function cekSkema(skema: Skema): string[] {
  const galat: string[] = [];
  try {
    keMenit(skema.jamMulai);
  } catch (e) {
    galat.push((e as Error).message);
  }
  if (skema.baris.length === 0) galat.push('Skema tidak punya baris.');
  skema.baris.forEach((b, i) => {
    if (!Number.isFinite(b.durasi) || b.durasi <= 0) galat.push(`Baris ${i + 1}: durasi harus > 0.`);
  });
  if (kapasitasKbm(skema) === 0) galat.push('Skema tidak punya jam pelajaran (kbm).');
  return galat;
}

const kbm = (id: string, durasi: number): BarisSkema => ({ id, tipe: 'kbm', kegiatan: 'Pelajaran', durasi });
const ist = (id: string, nama: string, durasi: number): BarisSkema => ({ id, tipe: 'istirahat', kegiatan: nama, durasi });

/**
 * Tiga skema bawaan, disalin dari poster resmi "Skema Pembagian Jam Jadwal Pelajaran"
 * SMK Negeri Bansari (berkas JADWAL KELAS/GURU 9-13 Nov 2026 pada project).
 * Skema 11 & 9: jam pertama = Pembiasaan (non-KBM, jam ke-0).
 */
export function skemaBawaan(): Skema[] {
  return [
    {
      id: 'skema11',
      nama: 'Skema 11 Jam/Hari',
      jamMulai: '07:00',
      warna: '#2347b8',
      baris: [
        { id: 's11_0', tipe: 'nonKbm', kegiatan: 'Pembiasaan/UB', durasi: 40 },
        kbm('s11_1', 40), kbm('s11_2', 40), kbm('s11_3', 40),
        ist('s11_b1', 'Istirahat 1', 15),
        kbm('s11_4', 40), kbm('s11_5', 40), kbm('s11_6', 40),
        ist('s11_b2', 'Istirahat 2', 40),
        kbm('s11_7', 40), kbm('s11_8', 40), kbm('s11_9', 40), kbm('s11_10', 40),
      ],
    },
    {
      id: 'skema10',
      nama: 'Skema 10 Jam/Hari',
      jamMulai: '07:00',
      warna: '#0f7f68',
      baris: [
        kbm('s10_1', 45), kbm('s10_2', 45), kbm('s10_3', 45),
        ist('s10_b1', 'Istirahat 1', 15),
        kbm('s10_4', 45), kbm('s10_5', 45), kbm('s10_6', 45),
        ist('s10_b2', 'Istirahat 2', 50),
        kbm('s10_7', 40), kbm('s10_8', 40), kbm('s10_9', 40), kbm('s10_10', 40),
      ],
    },
    {
      id: 'skema9',
      nama: 'Skema 9 Jam/Hari',
      jamMulai: '07:00',
      warna: '#9b2665',
      baris: [
        { id: 's9_0', tipe: 'nonKbm', kegiatan: 'Pembiasaan', durasi: 40 },
        kbm('s9_1', 40), kbm('s9_2', 40), kbm('s9_3', 40),
        ist('s9_b1', 'Istirahat 1', 20),
        kbm('s9_4', 40), kbm('s9_5', 40), kbm('s9_6', 40),
        ist('s9_b2', 'Istirahat 2', 50),
        kbm('s9_7', 40), kbm('s9_8', 40),
      ],
    },
  ];
}
