import type { Proyek, Slot } from './tipe';
import { VERSI_DATA_SAAT_INI } from './tipe';
import { skemaBawaan } from './skema';

/**
 * Data FIKTIF untuk demo dan tes (bukan data sekolah). Nama guru sengaja generik.
 * Slot sengaja menyertakan: jam 10 pada Senin/Selasa (muat di skema 10 dan 11),
 * dan Jum'at jam 9 (tidak muat: skema 9 hanya punya 8 jam pelajaran) untuk memperlihatkan tampungan.
 */
export function proyekContoh(): Proyek {
  const s = (id: string, rombelId: string, hari: number, jam: number, guruId: string, mapelId: string, ruangId: string): Slot => ({
    id, rombelId, hari, jam, guruId, mapelId, ruangId,
  });
  return {
    versiSkemaData: VERSI_DATA_SAAT_INI,
    nama: 'Contoh (data fiktif)',
    skema: skemaBawaan(),
    polaReguler: ['skema11', 'skema10', 'skema10', 'skema11', 'skema9'],
    penggantiManual: null,
    kalender: [
      {
        id: 'k1', nama: 'Pekan ASAS (contoh)', jenis: 'ASAS', mulai: '2026-11-30', selesai: '2026-12-04',
        pola: ['skema10', 'skema10', 'skema11', 'skema11', 'skema9'], rombelTidakAktif: [],
      },
      { id: 'k2', nama: 'Libur contoh', jenis: 'libur', mulai: '2026-12-25', selesai: '2026-12-25', rombelTidakAktif: [] },
    ],
    master: {
      guru: [
        { id: 'g1', nama: 'Guru Contoh 1', kode: 'A' },
        { id: 'g2', nama: 'Guru Contoh 2', kode: 'B' },
        { id: 'g3', nama: 'Guru Contoh 3', kode: 'C' },
      ],
      mapel: [
        { id: 'm1', nama: 'Matematika', kode: 'MTK' },
        { id: 'm2', nama: 'Bahasa Indonesia', kode: 'BI' },
        { id: 'm3', nama: 'Mapel Kejuruan (induk)', kode: 'KJR' },
        { id: 'm3a', nama: 'Elemen Kejuruan 1', kode: 'KK1', induk: 'm3' },
      ],
      rombel: [
        { id: 'r1', tingkat: 'X', jurusan: 'TE', nomor: 1, kode: 'X TE 1', jpButuh: 51 },
        { id: 'r2', tingkat: 'XI', jurusan: 'TE', nomor: 1, kode: 'XI TE 1', jpButuh: 49 },
      ],
      ruang: [
        { id: 'u1', kode: 'B3', nama: 'Ruang Teori B3', jenis: 'teori' },
        { id: 'u2', kode: 'D1', nama: 'Lab D1', jenis: 'lab' },
      ],
    },
    versi: [
      {
        id: 'v-reguler',
        nama: 'Reguler',
        jenis: 'reguler',
        slots: [
          s('a1', 'r1', 0, 1, 'g1', 'm1', 'u1'),
          s('a2', 'r1', 0, 2, 'g1', 'm1', 'u1'),
          s('a3', 'r1', 0, 10, 'g2', 'm2', 'u1'),
          s('a4', 'r1', 1, 1, 'g2', 'm2', 'u1'),
          s('a5', 'r1', 1, 10, 'g3', 'm3a', 'u2'),
          s('a6', 'r1', 2, 5, 'g3', 'm3a', 'u2'),
          s('a7', 'r1', 4, 9, 'g1', 'm1', 'u1'),
          s('b1', 'r2', 0, 1, 'g2', 'm2', 'u1'),
          s('b2', 'r2', 3, 4, 'g3', 'm3a', 'u2'),
        ],
      },
    ],
  };
}
