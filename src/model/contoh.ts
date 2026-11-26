import type { Beban, Proyek, Slot } from './tipe';
import { VERSI_DATA_SAAT_INI } from './tipe';
import { skemaBawaan } from './skema';

/**
 * Data FIKTIF untuk demo dan tes (bukan data sekolah).
 * Tanpa bentrok. Sengaja memuat: kelompok paralel (PA di X TE 1), team teaching (XI TE 1 KK1),
 * aturan ruang terlarang (jurusan TE tidak boleh Lab AT), guru tidak tersedia (guru C hari Rabu),
 * beban yang belum penuh (ENG X TE 1), dan Jum'at pelajaran ke-9 tidak muat di skema 9 (tampungan).
 */
export function proyekContoh(): Proyek {
  const b = (id: string, rombelId: string, mapelId: string, guruId: string, jp: number, ekstra: Partial<Beban> = {}): Beban => ({
    id, rombelId, mapelId, guruId, jp, timGuruIds: [], ruangPrioritas: [], ruangTerlarang: [], ...ekstra,
  });
  const s = (bebanId: string, ruangId: string, hari: number, jams: number[]): Slot[] =>
    jams.map((jam) => ({ id: `${bebanId}-${hari}-${jam}`, bebanId, hari, jam, ruangId }));

  const beban: Beban[] = [
    // X TE 1
    b('b1', 'r1', 'm1', 'g1', 4, { pola: [2, 2], ruangPrioritas: ['u1', 'u2'] }),
    b('b2', 'r1', 'm2', 'g2', 3, { ruangPrioritas: ['u1'] }),
    b('b3', 'r1', 'm3', 'g3', 3, { ruangPrioritas: ['u1'] }),
    b('b4', 'r1', 'm5', 'g4', 4, { pola: [2, 2], ruangPrioritas: ['u4', 'u5'] }),
    b('b5', 'r1', 'm6', 'g5', 4, { pola: [2, 2], ruangPrioritas: ['u5', 'u4'] }),
    b('b6', 'r1', 'm4', 'g6', 3, { paralel: 'PA', ruangPrioritas: ['u2'] }),
    b('b7', 'r1', 'm4', 'g7', 3, { paralel: 'PA', ruangPrioritas: ['u3'] }),
    // X TE 2
    b('b8', 'r2', 'm1', 'g1', 4, { ruangPrioritas: ['u1', 'u2'] }),
    b('b9', 'r2', 'm2', 'g2', 3, { ruangPrioritas: ['u1'] }),
    b('b10', 'r2', 'm5', 'g4', 4, { pola: [2, 2], ruangPrioritas: ['u4', 'u5'] }),
    // XI TE 1
    b('b11', 'r3', 'm1', 'g1', 4, { ruangPrioritas: ['u2', 'u1'] }),
    b('b12', 'r3', 'm5', 'g4', 4, { pola: [2, 2], timGuruIds: ['g5'], ruangPrioritas: ['u4'] }),
  ];

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
        { id: 'g4', nama: 'Guru Contoh 4', kode: 'D' },
        { id: 'g5', nama: 'Guru Contoh 5', kode: 'E' },
        { id: 'g6', nama: 'Guru Contoh 6', kode: 'F' },
        { id: 'g7', nama: 'Guru Contoh 7', kode: 'G' },
      ],
      mapel: [
        { id: 'm1', nama: 'Matematika', kode: 'MTK' },
        { id: 'm2', nama: 'Bahasa Indonesia', kode: 'BI' },
        { id: 'm3', nama: 'Bahasa Inggris', kode: 'ENG' },
        { id: 'm4', nama: 'Pendidikan Agama dan Budi Pekerti', kode: 'PA' },
        { id: 'm5', nama: 'Elemen Kejuruan 1', kode: 'KK1' },
        { id: 'm6', nama: 'Elemen Kejuruan 2', kode: 'KK2' },
      ],
      rombel: [
        { id: 'r1', tingkat: 'X', jurusan: 'TE', nomor: 1, kode: 'X TE 1', jpButuh: 51 },
        { id: 'r2', tingkat: 'X', jurusan: 'TE', nomor: 2, kode: 'X TE 2' },
        { id: 'r3', tingkat: 'XI', jurusan: 'TE', nomor: 1, kode: 'XI TE 1', jpButuh: 49 },
      ],
      ruang: [
        { id: 'u1', kode: 'B3', nama: 'Ruang Teori B3', jenis: 'teori' },
        { id: 'u2', kode: 'B4', nama: 'Ruang Teori B4', jenis: 'teori' },
        { id: 'u3', kode: 'B5', nama: 'Ruang Teori B5', jenis: 'teori' },
        { id: 'u4', kode: 'D1', nama: 'Lab D1', jenis: 'lab' },
        { id: 'u5', kode: 'D2', nama: 'Lab D2', jenis: 'lab' },
        { id: 'u6', kode: 'AT1', nama: 'Lab AT 1', jenis: 'lab' },
      ],
    },
    beban,
    aturan: [
      { id: 'a1', jenis: 'ruangTerlarang', jurusan: 'TE', ruangIds: ['u6'], catatan: 'Jurusan TE tidak boleh memakai Lab AT' },
      { id: 'a2', jenis: 'guruTidakTersedia', guruId: 'g3', hari: 2, jam: [], catatan: 'Guru C tidak tersedia hari Rabu' },
    ],
    versi: [
      {
        id: 'v-reguler',
        nama: 'Reguler',
        jenis: 'reguler',
        slots: [
          ...s('b1', 'u1', 0, [1, 2]), ...s('b1', 'u1', 2, [1, 2]),
          ...s('b2', 'u1', 1, [1, 2]), ...s('b2', 'u1', 3, [4]),
          ...s('b3', 'u1', 4, [1]),
          ...s('b4', 'u4', 0, [5, 6]), ...s('b4', 'u4', 3, [1, 2]),
          ...s('b5', 'u5', 1, [5, 6]), ...s('b5', 'u5', 2, [5, 6]),
          ...s('b6', 'u2', 4, [3, 4, 5]),
          ...s('b7', 'u3', 4, [3, 4, 5]),
          ...s('b8', 'u1', 0, [3, 4]), ...s('b8', 'u1', 4, [2, 3]),
          ...s('b9', 'u1', 1, [3]), ...s('b9', 'u1', 3, [5, 6]),
          ...s('b10', 'u4', 0, [1, 2]), ...s('b10', 'u4', 2, [3, 4]),
          ...s('b11', 'u2', 3, [5, 6, 7, 8]),
          ...s('b12', 'u4', 1, [7, 8]), ...s('b12', 'u4', 2, [7, 8]),
          // Jum'at pelajaran ke-9: tidak muat di skema 9 (8 pelajaran) -> tampungan
          { id: 'b3-4-9', bebanId: 'b3', hari: 4, jam: 9, ruangId: 'u1' },
        ],
      },
    ],
  };
}
