import type { Aturan, Kegiatan, Proyek } from './tipe';
import { VERSI_DATA_SAAT_INI } from './tipe';
import { skemaBawaan } from './skema';
import { terapkanRuangSekolah } from './ruangSekolah';
import { isiJenisRuangMapel, terapkanDataSekolah } from './sekolah';
import type { HasilImpor } from '../io/imporTugas';
import { versiReguler } from './kalender';
import { jadikanWarisan } from './simpul';

/** Mengisi `mapelIds` tiap guru dari beban yang dipegangnya (guru utama dan tim). Urutan mengikuti kemunculan. */
export function isiMapelGuru(p: Proyek): void {
  const per = new Map<string, Set<string>>();
  for (const b of p.beban) for (const g of [b.guruId, ...b.timGuruIds]) per.set(g, (per.get(g) ?? new Set()).add(b.mapelId));
  for (const g of p.master.guru) {
    const s = per.get(g.id);
    if (s && s.size) g.mapelIds = [...s];
    else delete g.mapelIds;
  }
}

/**
 * Data Gasal 2026/2027: jadwal reguler aSc (sudah ada di `p`) ditambah periode kalender dari jadwal-te
 * (jadwal-te-20261126-revisi-eng.json: p_tka, p_asaj, p_tka2, p_asas). Tanggal ASAS/ASAJ XII: pelajaran reguler hanya untuk kelas XI,
 * jadi rombel kelas X dan XII dinyatakan tidak aktif pada periode itu.
 */
export function bangunGasal(p: Proyek): void {
  terapkanRuangSekolah(p);
  isiMapelGuru(p);
  const kelasXdanXII = [...p.master.rombel.filter((r) => r.tingkat === 'X' || r.tingkat === 'XII').map((r) => r.id)];
  const kal: Kegiatan[] = [
    { id: 'k-tka1', nama: 'Pemadatan TKA (Gasal 2026/2027)', jenis: 'TKA', mulai: '2026-07-12', selesai: '2026-11-15', rombelTidakAktif: [], catatan: 'Rentang tanggal dari periode p_tka di jadwal-te.' },
    { id: 'k-asaj', nama: 'ASAJ Praktik Kelas XII', jenis: 'ASAJ', mulai: '2026-11-16', selesai: '2026-11-20', rombelTidakAktif: [], catatan: 'Dari periode p_asaj di jadwal-te.' },
    { id: 'k-tka2', nama: 'Pemadatan TKA (lanjutan)', jenis: 'TKA', mulai: '2026-11-21', selesai: '2026-12-18', rombelTidakAktif: [], catatan: 'Dari periode p_tka2 di jadwal-te.' },
    {
      id: 'k-asas', nama: 'ASAS X dan ASAJ XII (pelajaran reguler kelas XI)', jenis: 'ASAS', mulai: '2026-11-30', selesai: '2026-12-04',
      rombelTidakAktif: kelasXdanXII, catatan: 'Dari periode p_asas di jadwal-te: pelajaran reguler hanya kelas XI; kelas X dan XII sedang ujian.',
    },
  ];
  p.kalender = kal;
  p.periodeAktifId = 'k-asas';
  p.nama = 'SMK Negeri Bansari - Gasal 2026/2027 (jadwal reguler dari aSc, fase ASAJ)';
}

/** Unsur Gasal yang dipakai membangun Genap: prioritas ruang dan pola pertemuan per (tingkat, jurusan, mapel). */
function ambilRuangDanPola(gasal: Proyek): { ruang: Map<string, Map<string, number>>; pola: Map<string, number[]> } {
  const kodeMapel = new Map(gasal.master.mapel.map((m) => [m.id, m]));
  const rb = new Map(gasal.master.rombel.map((r) => [r.id, r]));
  const ruang = new Map<string, Map<string, number>>();
  const pola = new Map<string, number[]>();
  for (const b of gasal.beban) {
    const m = kodeMapel.get(b.mapelId);
    const r = rb.get(b.rombelId);
    if (!m || !r) continue;
    // beban elemen juga dihitung untuk induknya (KK)
    const induk = m.induk ? kodeMapel.get(m.induk) : undefined;
    for (const kode of [m.kode, ...(induk ? [induk.kode] : [])]) {
      const kunci = `${r.tingkat}|${r.jurusan}|${kode}`;
      const hitung = ruang.get(kunci) ?? new Map<string, number>();
      for (const u of b.ruangPrioritas) hitung.set(u, (hitung.get(u) ?? 0) + 1);
      ruang.set(kunci, hitung);
      if (b.pola?.length && kode === m.kode) pola.set(`${kunci}|${b.jp}`, b.pola);
    }
  }
  return { ruang, pola };
}

/**
 * Data Genap 2026/2027: guru, mapel, rombel, dan beban dari sheet Genap (hasil tafsirTugas), ruang site plan beserta kategorinya,
 * aturan ruang per jurusan, elemen mapel KK (DLE, DRE, TKB di bawah DTE; PRE, PMM, PSRT, PISAV, PISS di bawah TAV; elemen Teori AT di bawah DAT)
 * dari data Gasal, serta prioritas ruang dan pola pertemuan yang diturunkan dari jadwal reguler Gasal untuk mapel yang sama.
 * Jadwal dibiarkan kosong agar bisa diuji Susun Otomatis. Rombel kelas XII sedang PKL.
 */
export function bangunGenap(h: HasilImpor, gasal: Proyek): Proyek {
  const p: Proyek = {
    versiSkemaData: VERSI_DATA_SAAT_INI,
    nama: 'SMK Negeri Bansari - Genap 2026/2027 (master dari sheet Genap, jadwal kosong)',
    skema: skemaBawaan(),
    polaReguler: structuredClone(gasal.polaReguler),
    penggantiManual: null,
    kalender: [],
    master: { guru: [], mapel: [], rombel: [], ruang: [] },
    beban: [],
    aturan: [] as Aturan[],
    versi: [{ id: 'v-reguler', nama: 'Reguler Genap 2026/2027', jenis: 'reguler', slots: [] }],
  };
  terapkanDataSekolah(p, structuredClone(h));

  // elemen KK dari Gasal (mapel yang punya induk) yang belum ada di sheet Genap
  const kodeAda = new Set(p.master.mapel.map((m) => m.kode));
  const gasalById = new Map(gasal.master.mapel.map((m) => [m.id, m]));
  let n = p.master.mapel.length;
  for (const m of gasal.master.mapel) {
    if (!m.induk || kodeAda.has(m.kode)) continue;
    const induk = gasalById.get(m.induk);
    const indukGenap = induk && p.master.mapel.find((x) => x.kode === induk.kode);
    if (!indukGenap) continue;
    n += 1;
    p.master.mapel.push({ id: `m${n}`, nama: m.nama, kode: m.kode, induk: indukGenap.id });
    kodeAda.add(m.kode);
  }
  isiJenisRuangMapel(p);

  const { ruang, pola } = ambilRuangDanPola(gasal);
  const kodeById = new Map(p.master.mapel.map((m) => [m.id, m.kode]));
  const rb = new Map(p.master.rombel.map((r) => [r.id, r]));
  const idRuangGasal = new Map(gasal.master.ruang.map((r) => [r.id, r.kode]));
  const idRuangGenap = new Map(p.master.ruang.map((r) => [r.kode, r.id]));
  for (const b of p.beban) {
    const r = rb.get(b.rombelId);
    const kode = kodeById.get(b.mapelId);
    if (!r || !kode) continue;
    const kunci = `${r.tingkat}|${r.jurusan}|${kode}`;
    const hitung = ruang.get(kunci);
    if (hitung?.size) {
      b.ruangPrioritas = [...hitung].sort((a, c) => c[1] - a[1] || a[0].localeCompare(c[0])).map(([u]) => idRuangGenap.get(idRuangGasal.get(u) ?? '')).filter((x): x is string => !!x);
    }
    const po = pola.get(`${kunci}|${b.jp}`);
    if (po) b.pola = [...po];
  }
  isiMapelGuru(p);

  p.kalender = [
    {
      id: 'k-genap', nama: 'Semester Genap 2026/2027 (kelas XII PKL)', jenis: 'PKL', mulai: '2027-01-03', selesai: '2027-06-18',
      rombelTidakAktif: p.master.rombel.filter((x) => x.tingkat === 'XII').map((x) => x.id),
      catatan: 'Rentang tanggal dari periode p_genap di jadwal-te; sesuaikan dengan kalender akademik. Kelas XII hampir seluruhnya PKL menurut sheet Genap.',
    },
  ];
  p.periodeAktifId = 'k-genap';
  return p;
}

/**
 * Menyusun data Gasal dari jadwal-te sebagai semester induk dan kegiatan (model warisan):
 * - induk = jadwal periode Pemadatan TKA (p_tka/p_tka2, isinya identik dan berlaku sejak awal semester sampai 18 Des);
 * - kegiatan = ASAJ Praktik XII (16-20 Nov) dan ASAS X & ASAJ XII (30 Nov-4 Des); kelas yang sama dengan induk diikutkan induk;
 * - periode Genap (Januari) dibuang dari data Gasal: Genap adalah semester tersendiri.
 */
export function strukturGasalJadwalTe(p: Proyek): void {
  const tka = p.kalender.find((g) => g.id === 'k-tka');
  const tka2 = p.kalender.find((g) => g.id === 'k-tka2');
  const genap = p.kalender.find((g) => g.id === 'k-genap');
  if (!tka || !tka2) throw new Error('Periode k-tka dan k-tka2 tidak ada.');
  const reg = versiReguler(p);
  p.semesters = [{ id: 'gasal', nama: 'Gasal 2026/2027', mulai: tka.mulai, selesai: tka2.selesai, rombelTidakAktif: [...tka.rombelTidakAktif], ...(reg ? { versiId: reg.id } : {}) }];
  p.kalender = p.kalender.filter((g) => g !== tka && g !== tka2 && g !== genap);
  if (genap?.versiId) {
    p.versi = p.versi.filter((v) => v.id !== genap.versiId);
    p.beban = p.beban.filter((b) => b.versiId !== genap.versiId);
  }
  for (const b of p.beban) if (b.versiId === reg?.id) delete b.versiId;
  const asas = p.kalender.find((g) => g.id === 'k-asas');
  if (asas) asas.jenis = 'ASAS';
  for (const g of p.kalender) jadikanWarisan(p, g);
  if (reg) reg.nama = 'Jadwal reguler Gasal 2026/2027';
  p.nama = 'SMK Negeri Bansari - Gasal 2026/2027';
}
