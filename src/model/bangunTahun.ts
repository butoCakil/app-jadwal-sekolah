// Data Tahun Pelajaran 2026/2027: semester Gasal (induk = jadwal reguler aSc 9-13 Nov 2026) dengan kegiatan dari PDF aSc
// (Pemadatan TKA, TKA gelombang 1 dan 2, ASAJ, UKK, ASAS), dan semester Genap (beban dari sheet Genap, jadwal kosong).

import type { Kegiatan, PolaMinggu, Proyek, Semester, Skema } from './tipe';
import { bebanDariAsc, type SumberAscKelas } from '../io/imporAsc';
import { jadikanWarisan } from './simpul';
import { hariPekan } from './kalender';

export interface SumberTahun {
  reguler: SumberAscKelas;
  /** kegiatan tanpa jadwal sendiri (mis. pergantian PKL): kelas aktif lain mengikuti induk */
  pkl?: { id: string; nama: string; mulai: string; selesai: string; semesterId: string; tingkatTidakAktif: string[]; catatan: string }[];
  /** agenda kalender akademik: [mulai, selesai, jenis, judul, tingkat, semester] */
  agenda?: [string, string, string, string, string, string][];
  kegiatan: { id: string; nama: string; jenis: Kegiatan['jenis']; mulai: string; selesai: string; sumber: SumberAscKelas; catatan?: string; pengawas?: SumberPengawas }[];
}

/** Jadwal pengawas ujian: kolom ruang (kode) dan, per sesi, guru (kode) pengawas tiap ruang menurut urutan kolom. */
export interface SumberPengawas {
  sumber: string;
  ruang: string[];
  sesi: { tanggal: string; mulai: string; selesai: string; mapel: string; pengawas: string[] }[];
}

export interface LaporanTahun {
  peringatan: string[];
  kegiatan: { id: string; jp: number; rombelAktif: number; terdampak: number; ikut: number; pola: string }[];
}

const kbmSkema = (s: Skema) => s.baris.filter((b) => b.tipe === 'kbm').length;
const adaPembiasaan = (s: Skema) => s.baris[0]?.tipe === 'nonKbm';

/** Skema untuk satu hari menurut bentuknya (ada pembiasaan atau tidak, jumlah JP); bila belum ada, dibuat dari waktu kolom aSc. */
function skemaHari(p: Proyek, h: { pembiasaan: boolean; jamKbm: number }, waktu: Record<string, string>, nama: string): string {
  const ada = p.skema.find((s) => adaPembiasaan(s) === h.pembiasaan && kbmSkema(s) === h.jamKbm);
  if (ada) return ada.id;
  const menit = (k: string) => {
    const [a, b] = (waktu[k] ?? '').split('-');
    if (!a || !b) return 40;
    const m = (t: string) => Number(t.split(':')[0]) * 60 + Number(t.split(':')[1]);
    return m(b) - m(a);
  };
  const id = `skema-${h.pembiasaan ? 'p' : 'n'}${h.jamKbm}`;
  const urut = ['1', '2', '3', '4', 'B1', '5', '6', '7', 'B2', '8', '9', '10', '11'];
  const baris: Skema['baris'] = [];
  let jp = 0;
  for (const k of urut) {
    if (k.startsWith('B')) {
      if (jp > 0 && jp < h.jamKbm) baris.push({ id: `${id}_${k}`, tipe: 'istirahat', kegiatan: `Istirahat ${k.slice(1)}`, durasi: menit(k) });
      continue;
    }
    if (h.pembiasaan && k === '1') {
      baris.push({ id: `${id}_0`, tipe: 'nonKbm', kegiatan: 'Pembiasaan', durasi: menit(k) });
      continue;
    }
    if (jp >= h.jamKbm) break;
    jp += 1;
    baris.push({ id: `${id}_${jp}`, tipe: 'kbm', kegiatan: 'Pelajaran', durasi: menit(k) });
  }
  p.skema.push({ id, nama: `Skema ${h.jamKbm} Jam/Hari (${nama})`, jamMulai: (waktu['1'] ?? '07:00').split('-')[0]?.padStart(5, '0') ?? '07:00', warna: '#64748b', baris });
  return id;
}

/** Pola mingguan dari keterangan hari sumber: pola default bila sama, pola lain yang sudah ada, atau pola baru. */
function polaDari(p: Proyek, src: SumberAscKelas, nama: string): string | undefined {
  const pola: PolaMinggu = src.hari.slice(0, p.polaReguler.length).map((h) => skemaHari(p, h, src.waktuKolom, nama));
  if (pola.join('|') === p.polaReguler.join('|')) return undefined;
  const ada = (p.polaLain ?? []).find((x) => x.pola.join('|') === pola.join('|'));
  if (ada) return ada.id;
  const id = `pola-${(p.polaLain ?? []).length + 1}`;
  p.polaLain = [...(p.polaLain ?? []), { id, nama: `Skema ${nama}`, pola }];
  return id;
}

/** Penyesuaian jadwal sumber atas keputusan admin: memindah ruang satu rombel+mapel pada hari tertentu di satu versi jadwal. */
export interface Penyesuaian {
  versiId: string;
  rombel: string;
  mapel: string;
  hari: number;
  ruang: string;
  catatan: string;
}

/** Menerapkan penyesuaian; mengembalikan jumlah slot yang diubah per penyesuaian (0 = tidak ada yang cocok, perlu diperlakukan sebagai galat). */
export function terapkanPenyesuaian(p: Proyek, daftar: Penyesuaian[]): number[] {
  return daftar.map((x) => {
    const ruang = p.master.ruang.find((r) => r.kode === x.ruang)?.id;
    const rombel = p.master.rombel.find((r) => r.kode === x.rombel)?.id;
    const mapel = p.master.mapel.find((m) => m.kode === x.mapel)?.id;
    const versi = p.versi.find((v) => v.id === x.versiId);
    if (!ruang || !rombel || !mapel || !versi) return 0;
    const bebanIds = new Set(p.beban.filter((b) => b.rombelId === rombel && b.mapelId === mapel).map((b) => b.id));
    let n = 0;
    for (const sl of versi.slots) {
      if (sl.hari === x.hari && bebanIds.has(sl.bebanId)) {
        sl.ruangId = ruang;
        n += 1;
      }
    }
    const g = p.kalender.find((k) => k.versiId === x.versiId);
    if (g && n > 0) g.catatan = [g.catatan, `Penyesuaian: ${x.catatan}`].filter(Boolean).join(' ');
    return n;
  });
}

/**
 * Memasang aturan ujian dari jadwal pengawas: ruang yang dipakai ujian terkunci pada jendela waktu tiap sesi, dan tiap pengawas
 * tercatat pada tanggal, waktu, dan ruangnya. Mengembalikan peringatan untuk kode yang tidak ditemukan.
 */
function aturanPengawas(p: Proyek, g: Kegiatan, src: SumberPengawas): string[] {
  const peringatan: string[] = [];
  const ruangId = new Map(p.master.ruang.map((r) => [r.kode, r.id]));
  const guruId = new Map(p.master.guru.map((x) => [x.kode, x.id]));
  const ruang = src.ruang.map((kode) => ({ kode, id: ruangId.get(kode) }));
  for (const r of ruang) if (!r.id) peringatan.push(`ruang ${r.kode} di jadwal pengawas tidak ada di master`);
  const jendela = new Map<string, { mulai: string; selesai: string; hari: Set<number> }>();
  const tugas: NonNullable<Kegiatan['pengawas']> = [];
  for (const s of src.sesi) {
    const kunci = `${s.mulai}|${s.selesai}`;
    const j = jendela.get(kunci) ?? { mulai: s.mulai, selesai: s.selesai, hari: new Set<number>() };
    j.hari.add(hariPekan(s.tanggal));
    jendela.set(kunci, j);
    s.pengawas.forEach((kode, i) => {
      const gid = guruId.get(kode);
      if (!gid) {
        peringatan.push(`guru ${kode} di jadwal pengawas tidak ada di master`);
        return;
      }
      tugas.push({ id: `pw-${tugas.length + 1}`, guruId: gid, tanggal: s.tanggal, mulai: s.mulai, selesai: s.selesai, ...(ruang[i]?.id ? { ruangId: ruang[i]?.id } : {}) });
    });
  }
  const ids = ruang.map((r) => r.id).filter((x): x is string => !!x);
  g.ruangKunci = [...jendela.values()].map((j, i) => ({
    id: `kr-${i + 1}`, ruangIds: ids, hari: [...j.hari].sort((a, b) => a - b), mulai: j.mulai, selesai: j.selesai, catatan: `Ruang ujian menurut jadwal pengawas (${src.sumber}).`,
  }));
  g.pengawas = tugas;
  return [...new Set(peringatan)];
}

/**
 * Membangun data tahun pelajaran. `dasar` = data aSc Gasal (master, skema, ruang, aturan); `genap` = data Genap (beban sheet Genap).
 */
export function bangunTahun(dasar: Proyek, genap: Proyek, src: SumberTahun, semester: { gasal: [string, string]; genap: [string, string] }): { proyek: Proyek; laporan: LaporanTahun } {
  const p: Proyek = structuredClone(dasar);
  const peringatan: string[] = [];
  p.beban = [];
  p.versi = [];
  p.kalender = [];
  p.polaLain = [];
  p.penggantiManual = null;
  delete p.periodeAktifId;
  delete p.semester;

  // ---- Gasal: induk
  const reg = bebanDariAsc(p, src.reguler, { versiId: 'v-gasal', awalan: 'g' });
  peringatan.push(...reg.peringatan.map((x) => `Reguler Gasal: ${x}`));
  p.beban.push(...reg.beban);
  p.versi.push({ id: 'v-gasal', nama: 'Jadwal reguler Gasal 2026/2027', jenis: 'reguler', slots: reg.slots });
  const kodeAktif = (s: SumberAscKelas) => new Set(Object.keys(s.rombel));
  const tidakAktif = (s: SumberAscKelas) => p.master.rombel.filter((r) => !kodeAktif(s).has(r.kode)).map((r) => r.id);
  const gasal: Semester = { id: 'gasal', nama: 'Gasal 2026/2027', mulai: semester.gasal[0], selesai: semester.gasal[1], rombelTidakAktif: tidakAktif(src.reguler), versiId: 'v-gasal' };

  // ---- Genap: induk dengan beban sheet Genap; jadwal belum disusun
  const mapelByKode = new Map(p.master.mapel.map((m) => [m.kode.toUpperCase(), m]));
  const petaMapel = new Map<string, string>();
  for (const m of genap.master.mapel) {
    let t = mapelByKode.get(m.kode.toUpperCase());
    if (!t) {
      t = { ...structuredClone(m), id: `m${Math.max(0, ...p.master.mapel.map((x) => Number(x.id.slice(1)) || 0)) + 1}` };
      p.master.mapel.push(t);
      mapelByKode.set(m.kode.toUpperCase(), t);
    }
    petaMapel.set(m.id, t.id);
  }
  const guruAda = new Set(p.master.guru.map((g) => g.id));
  for (const g of genap.master.guru) if (!guruAda.has(g.id)) p.master.guru.push(structuredClone(g));
  for (const m of genap.master.mapel) {
    const t = p.master.mapel.find((x) => x.id === petaMapel.get(m.id));
    if (t && m.induk && !t.induk) t.induk = petaMapel.get(m.induk);
  }
  p.beban.push(...genap.beban.map((b) => ({ ...structuredClone(b), id: `n${b.id}`, mapelId: petaMapel.get(b.mapelId) ?? b.mapelId, versiId: 'v-genap' })));
  p.versi.push({ id: 'v-genap', nama: 'Jadwal reguler Genap 2026/2027', jenis: 'reguler', slots: [] });
  const kGenap = genap.kalender.find((g) => g.jenis !== 'libur');
  const semGenap: Semester = { id: 'genap', nama: 'Genap 2026/2027', mulai: semester.genap[0], selesai: semester.genap[1], rombelTidakAktif: [...(kGenap?.rombelTidakAktif ?? [])], versiId: 'v-genap' };
  p.semesters = [gasal, semGenap];

  // ---- kegiatan Gasal
  const laporan: LaporanTahun['kegiatan'] = [];
  for (const k of src.kegiatan) {
    const vid = `v-${k.id.replace(/^k-/, '')}`;
    const h = bebanDariAsc(p, k.sumber, { versiId: vid, awalan: `${k.id.replace(/^k-/, '')}-`, bebanAcuan: reg.beban });
    peringatan.push(...h.peringatan.map((x) => `${k.nama}: ${x}`));
    p.beban.push(...h.beban);
    p.versi.push({ id: vid, nama: k.nama, jenis: 'varian', slots: h.slots });
    const th = Object.entries(k.sumber.tidakHadir ?? {});
    const ket = [
      k.catatan,
      th.length ? `Tidak belajar di sekolah pada sebagian hari (kartu PJJ/TKA): ${th.map(([r, hari]) => `${r} (${Object.keys(hari).map((i) => ['Sen', 'Sel', 'Rab', 'Kam', 'Jum'][Number(i)]).join(', ')}: ${[...new Set(Object.values(hari))].join('/')})`).join('; ')}.` : '',
      k.sumber.pjj.length ? `Bertanda PJJ (belajar jarak jauh, tanpa ruang): ${k.sumber.pjj.join(', ')}.` : '',
      `Sumber: ${k.sumber.sumber}.`,
    ].filter(Boolean).join(' ');
    const polaId = polaDari(p, k.sumber, k.nama);
    const g: Kegiatan = {
      id: k.id, nama: k.nama, jenis: k.jenis, mulai: k.mulai, selesai: k.selesai, rombelTidakAktif: tidakAktif(k.sumber), versiId: vid, semesterId: 'gasal',
      ...(polaId ? { polaId } : {}), catatan: ket,
    };
    // rombel PJJ pada kartu aSc belajar tanpa ruang
    const pjj = k.sumber.pjj.map((kode) => p.master.rombel.find((r) => r.kode === kode)?.id).filter((x): x is string => !!x);
    if (pjj.length) g.rombelTanpaRuang = pjj;
    if (k.pengawas) peringatan.push(...aturanPengawas(p, g, k.pengawas).map((x) => `${k.nama}: ${x}`));
    p.kalender.push(g);
    const w = jadikanWarisan(p, g);
    laporan.push({ id: k.id, jp: h.slots.length, rombelAktif: kodeAktif(k.sumber).size, terdampak: w.terdampak.length, ikut: w.ikut.length, pola: polaId ? (p.polaLain ?? []).find((x) => x.id === polaId)!.pola.join(',') : 'default' });
  }
  // ---- pergantian PKL: versi kosong, semua kelas aktif ikut induk
  for (const k of src.pkl ?? []) {
    const vid = `v-${k.id.replace(/^k-/, '')}`;
    p.versi.push({ id: vid, nama: k.nama, jenis: 'varian', slots: [] });
    p.kalender.push({
      id: k.id, nama: k.nama, jenis: 'PKL', mulai: k.mulai, selesai: k.selesai, semesterId: k.semesterId, versiId: vid, rombelTerdampak: [],
      rombelTidakAktif: p.master.rombel.filter((r) => k.tingkatTidakAktif.includes(r.tingkat)).map((r) => r.id), catatan: k.catatan,
    });
    if (k.semesterId === 'genap') semGenap.rombelTidakAktif = [];
  }
  // ---- agenda kalender akademik (referensi)
  const jenisAgenda = (j: string, nama: string): Kegiatan['jenis'] =>
    j === 'libur' ? 'libur' : j === 'ujian' ? 'ujian' : j === 'rapor' ? 'rapor' : j === 'pkl' ? 'PKL' : /upacara/i.test(nama) ? 'upacara' : 'lain';
  (src.agenda ?? []).forEach(([mulai, selesai, jenis, nama, untuk, sem], i) => {
    p.kalender.push({
      id: `a${String(i + 1).padStart(2, '0')}`, nama, jenis: jenisAgenda(jenis, nama), mulai, selesai, rombelTidakAktif: [], agenda: true, untuk,
      ...(sem === 'Gasal' ? { semesterId: 'gasal' } : sem === 'Genap' ? { semesterId: 'genap' } : {}),
      catatan: `Kalender akademik 2026/2027 (${sem}).`,
    });
  });
  // mapel yang tidak dipakai dibuang (PKL dan induk elemen tetap)
  const dipakai = new Set(p.beban.map((b) => b.mapelId));
  for (const m of p.master.mapel) if (m.kode.toUpperCase() === 'PKL') dipakai.add(m.id);
  for (const m of p.master.mapel) if (dipakai.has(m.id) && m.induk) dipakai.add(m.induk);
  p.master.mapel = p.master.mapel.filter((m) => dipakai.has(m.id));
  p.nama = 'SMK Negeri Bansari - Tahun Pelajaran 2026/2027';
  return { proyek: p, laporan: { peringatan: [...new Set(peringatan)], kegiatan: laporan } };
}

/**
 * Skema mingguan buatan admin yang ikut menjadi bawaan (keadaan terbit 28 Nov 2026), beserta pemasangannya pada kegiatan.
 * Mengembalikan jumlah yang berhasil diterapkan (pola yang sudah ada tidak digandakan; kegiatan yang tidak ditemukan tidak dihitung).
 */
export function terapkanPolaAdmin(p: Proyek, pola: { id: string; nama: string; pola: PolaMinggu }[], pasang: { kegiatanId: string; polaId: string }[]): { pola: number; pasang: number } {
  let nPola = 0;
  for (const q of pola) {
    if ((p.polaLain ?? []).some((x) => x.id === q.id)) continue;
    p.polaLain = [...(p.polaLain ?? []), structuredClone(q)];
    nPola++;
  }
  let nPasang = 0;
  for (const x of pasang) {
    const g = p.kalender.find((k) => k.id === x.kegiatanId);
    if (!g || !(p.polaLain ?? []).some((q) => q.id === x.polaId)) continue;
    g.polaId = x.polaId;
    nPasang++;
  }
  return { pola: nPola, pasang: nPasang };
}
