// Logika tampilan publik (tanpa DOM, bisa diuji): jadwal satu hari, satu pekan, dan matriks semua kelas/guru/ruang.

import type { Beban, Kegiatan, KeteranganTingkat, Proyek, Skema } from '../model/tipe';
import { NAMA_HARI } from '../model/tipe';
import { dalamRentang, hariPekan, skemaUntukTanggal } from '../model/kalender';
import { hitungSkema } from '../model/skema';
import { jadwalPekan, semesterKegiatan, semesterPada, tidakAktifPada, type JadwalPekan } from '../model/simpul';
import { seninPekan, tambahHari } from '../ui/util';

export type ModeP = 'rombel' | 'guru' | 'ruang';

export interface ItemP {
  bebanId: string;
  mapel: { nama: string; kode: string };
  guru: { nama: string; kode: string }[];
  /** kode rombel */
  rombel: string;
  /** kode ruang; kosong = belum ada ruang */
  ruang: string;
  ruangNama: string;
}

/** Satu kolom/baris skema hari itu: dipakai untuk kepala tabel. */
export interface KolomP {
  tipe: 'nonKbm' | 'kbm' | 'istirahat';
  /** label poster: pembiasaan ikut dihitung (pembiasaan = 1 pada skema 11) */
  label: string;
  /** nomor pelajaran (KBM); 0 = pembiasaan; null = istirahat */
  nomor: number | null;
  mulai: string;
  selesai: string;
  nama: string;
  /** singkatan kegiatan non-KBM, mis. PMB */
  kode?: string;
}

export type ElemenHari =
  | { jenis: 'blok'; item: ItemP[]; dari: string; sampai: string; mulai: string; selesai: string; jp: number; a: number; b: number }
  | { jenis: 'kosong'; dari: string; sampai: string; mulai: string; selesai: string; jp: number; a: number; b: number }
  | { jenis: 'istirahat'; nama: string; label: string; mulai: string; selesai: string; setelah: number }
  | { jenis: 'nonKbm'; nama: string; kode: string; label: string; mulai: string; selesai: string };

export type StatusHari = 'normal' | 'akhirPekan' | 'libur' | 'diluarSemester' | 'tidakAktif';

export interface HariP {
  tanggal: string;
  hari: string;
  status: StatusHari;
  /** keterangan status (nama libur, alasan tidak aktif) */
  keterangan: string;
  /** alasan kelas tidak belajar di sekolah (hanya status tidakAktif): singkatan dan nama lengkap */
  alasan?: { kode: string; nama: string };
  /** kegiatan yang mengatur hari itu (TKA, ASAS, ...), bila ada */
  kegiatan?: { nama: string; jenis: string };
  agenda: { nama: string; jenis: string; untuk?: string }[];
  semester?: string;
  skema?: string;
  /** warna skema hari itu */
  warna?: string;
  /** kolom skema hari itu (urut), untuk kepala tabel */
  kolom: KolomP[];
  elemen: ElemenHari[];
  /** jumlah JP milik entitas pada hari itu */
  totalJp: number;
}

export interface Entitas {
  id: string;
  label: string;
  /** pengelompokan di daftar pilihan */
  grup: string;
}

const URUT_TINGKAT = ['X', 'XI', 'XII'];

export function daftarEntitasP(p: Proyek, mode: ModeP): Entitas[] {
  if (mode === 'rombel') {
    return [...p.master.rombel]
      .sort((a, b) => URUT_TINGKAT.indexOf(a.tingkat) - URUT_TINGKAT.indexOf(b.tingkat) || a.jurusan.localeCompare(b.jurusan) || a.nomor - b.nomor)
      .map((r) => ({ id: r.id, label: r.kode, grup: `Kelas ${r.tingkat}` }));
  }
  if (mode === 'guru') {
    const pakai = new Set(p.beban.filter((b) => !b.nonTatapMuka).flatMap((b) => [b.guruId, ...b.timGuruIds]));
    return p.master.guru.filter((g) => pakai.has(g.id)).sort((a, b) => a.nama.localeCompare(b.nama)).map((g) => ({ id: g.id, label: `${g.nama} (${g.kode})`, grup: '' }));
  }
  return p.master.ruang.filter((r) => r.dijadwalkan !== false).sort((a, b) => a.kode.localeCompare(b.kode, undefined, { numeric: true })).map((r) => ({ id: r.id, label: r.kode, grup: '' }));
}

/** Singkatan kegiatan non-KBM (Pembiasaan/UB -> P1, Upacara -> UPC; selain itu tiga huruf pertama). */
export function kodeNonKbm(nama: string): string {
  if (/pembiasaan/i.test(nama)) return 'P1';
  if (/upacara/i.test(nama)) return 'UPC';
  return (nama.replace(/[^A-Za-z]/g, '').slice(0, 3) || 'NKB').toUpperCase();
}

// ------------------------------------------------------------------ cache per proyek

interface InfoHari {
  dasar: HariP;
  skema?: Skema;
  jp?: JadwalPekan;
  tdk: Set<string>;
  /** alasan tidak aktif per tingkat pada hari itu (kegiatan lebih dulu, lalu semester) */
  ket: KeteranganTingkat;
  kegiatan?: Kegiatan;
}
interface Cache {
  hari: Map<string, InfoHari>;
  pekan: Map<string, JadwalPekan>;
  beban: Map<string, Beban>;
  mapel: Map<string, { nama: string; kode: string }>;
  guru: Map<string, { nama: string; kode: string }>;
  rombel: Map<string, string>;
  tingkat: Map<string, string>;
  ruang: Map<string, { kode: string; nama: string }>;
}
const CACHE = new WeakMap<Proyek, Cache>();
function cache(p: Proyek): Cache {
  let c = CACHE.get(p);
  if (!c) {
    c = {
      hari: new Map(),
      pekan: new Map(),
      beban: new Map(p.beban.map((b) => [b.id, b])),
      mapel: new Map(p.master.mapel.map((m) => [m.id, { nama: m.nama, kode: m.kode }])),
      guru: new Map(p.master.guru.map((g) => [g.id, { nama: g.nama, kode: g.kode }])),
      rombel: new Map(p.master.rombel.map((r) => [r.id, r.kode])),
      tingkat: new Map(p.master.rombel.map((r) => [r.id, r.tingkat])),
      ruang: new Map(p.master.ruang.map((r) => [r.id, { kode: r.kode, nama: r.nama }])),
    };
    CACHE.set(p, c);
  }
  return c;
}

const kosongHari = (tanggal: string, status: StatusHari, keterangan: string): HariP => ({
  tanggal, hari: NAMA_HARI[hariPekan(tanggal)] ?? '', status, keterangan, agenda: [], kolom: [], elemen: [], totalJp: 0,
});

/** Keadaan satu tanggal yang tidak bergantung pada kelas/guru/ruang. */
function infoHariP(p: Proyek, tanggal: string): InfoHari {
  const c = cache(p);
  const ada = c.hari.get(tanggal);
  if (ada) return ada;
  const hasil = hitungInfo(p, tanggal, c);
  c.hari.set(tanggal, hasil);
  return hasil;
}

function hitungInfo(p: Proyek, tanggal: string, c: Cache): InfoHari {
  const n = p.polaReguler.length;
  const h = hariPekan(tanggal);
  const agenda = p.kalender.filter((g) => g.agenda && dalamRentang(tanggal, g.mulai, g.selesai)).map((g) => ({ nama: g.nama, jenis: g.jenis, ...(g.untuk ? { untuk: g.untuk } : {}) }));
  const tanpa = (d: HariP): InfoHari => ({ dasar: { ...d, agenda }, tdk: new Set(), ket: {} });
  if (h >= n) return tanpa(kosongHari(tanggal, 'akhirPekan', 'Akhir pekan'));
  const info = skemaUntukTanggal(tanggal, p);
  if (info.alasan === 'libur') return tanpa(kosongHari(tanggal, 'libur', info.kegiatanLibur ?? 'Libur'));

  const senin = seninPekan(tanggal, n);
  let jp = c.pekan.get(senin);
  if (!jp) {
    jp = jadwalPekan(p, Array.from({ length: n }, (_, i) => tambahHari(senin, i)), 'auto');
    c.pekan.set(senin, jp);
  }
  const g: Kegiatan | undefined = jp.kegiatanHari[h];
  const sem = g ? semesterKegiatan(p, g) : semesterPada(p, tanggal);
  const dasar: HariP = {
    ...kosongHari(tanggal, 'normal', ''),
    agenda,
    ...(sem ? { semester: sem.nama } : {}),
    ...(g ? { kegiatan: { nama: g.nama, jenis: g.jenis } } : {}),
  };
  if (!g && !sem) return { dasar: { ...dasar, status: 'diluarSemester', keterangan: 'Di luar semester berjalan' }, tdk: new Set(), ket: {} };
  const skema = p.skema.find((s) => s.id === info.skemaId);
  if (!skema) return { dasar: { ...dasar, status: 'libur', keterangan: 'Tidak ada KBM' }, tdk: new Set(), ket: {} };
  const kolom: KolomP[] = hitungSkema(skema).map((r) => ({
    tipe: r.nomorKbm === null ? 'istirahat' : r.nomorKbm === 0 ? 'nonKbm' : 'kbm',
    label: r.label,
    nomor: r.nomorKbm,
    mulai: r.mulai,
    selesai: r.selesai,
    nama: r.baris.kegiatan,
    ...(r.nomorKbm === 0 ? { kode: kodeNonKbm(r.baris.kegiatan) } : {}),
  }));
  return { dasar: { ...dasar, skema: skema.nama, warna: skema.warna, kolom }, skema, jp, tdk: tidakAktifPada(p, g, sem), ket: { ...(sem?.keteranganTingkat ?? {}), ...(g?.keteranganTingkat ?? {}) }, ...(g ? { kegiatan: g } : {}) };
}

/** Keadaan umum satu tanggal (status, skema, kegiatan) yang tidak bergantung pada kelas/guru/ruang. */
export function infoHariUmum(p: Proyek, tanggal: string): HariP {
  return infoHariP(p, tanggal).dasar;
}

/** Jadwal satu hari untuk satu kelas/guru/ruang. */
export function jadwalHariP(p: Proyek, tanggal: string, mode: ModeP, id: string): HariP {
  const c = cache(p);
  const info = infoHariP(p, tanggal);
  const dasar = info.dasar;
  if (dasar.status !== 'normal' || !info.skema || !info.jp) return dasar;
  if (mode === 'rombel' && info.tdk.has(id)) {
    const dari = info.ket[c.tingkat.get(id) as 'X' | 'XI' | 'XII'];
    const alasan = dari ?? (info.kegiatan ? { kode: info.kegiatan.jenis, nama: info.kegiatan.nama } : { kode: 'Lain', nama: 'Tidak belajar di sekolah' });
    return { ...dasar, status: 'tidakAktif', alasan, keterangan: `${alasan.nama}${info.kegiatan && info.kegiatan.nama !== alasan.nama ? ` (${info.kegiatan.nama})` : ''}` };
  }
  const h = hariPekan(tanggal);
  const milik = info.jp.slots.filter((s) => {
    if (s.hari !== h) return false;
    const b = c.beban.get(s.bebanId);
    if (!b) return false;
    if (mode === 'rombel') return b.rombelId === id;
    if (mode === 'guru') return b.guruId === id || b.timGuruIds.includes(id);
    return s.ruangId === id;
  });
  const olehJam = new Map<number, typeof milik>();
  for (const s of milik) olehJam.set(s.jam, [...(olehJam.get(s.jam) ?? []), s]);

  const buatItem = (s: (typeof milik)[number]): ItemP => {
    const b = c.beban.get(s.bebanId) as Beban;
    const m = c.mapel.get(b.mapelId);
    const r = s.ruangId ? c.ruang.get(s.ruangId) : undefined;
    return {
      bebanId: b.id,
      mapel: { nama: m?.nama ?? '?', kode: m?.kode ?? '?' },
      guru: [b.guruId, ...b.timGuruIds].map((gid) => c.guru.get(gid)).filter((x): x is NonNullable<typeof x> => !!x),
      rombel: c.rombel.get(b.rombelId) ?? '?',
      ruang: s.ruangId ? (r?.kode ?? '?') : '',
      ruangNama: r?.nama ?? '',
    };
  };

  const elemen: ElemenHari[] = [];
  let totalJp = 0;
  let terakhirKbm = 0;
  let terbuka: { kunci: string; el: Extract<ElemenHari, { jenis: 'blok' | 'kosong' }> } | null = null;
  for (const r of dasar.kolom) {
    if (r.tipe === 'istirahat') {
      terbuka = null;
      elemen.push({ jenis: 'istirahat', nama: r.nama, label: r.label, mulai: r.mulai, selesai: r.selesai, setelah: terakhirKbm });
      continue;
    }
    if (r.tipe === 'nonKbm') {
      terbuka = null;
      elemen.push({ jenis: 'nonKbm', nama: r.nama, kode: r.kode ?? kodeNonKbm(r.nama), label: r.label, mulai: r.mulai, selesai: r.selesai });
      continue;
    }
    const nomor = r.nomor as number;
    terakhirKbm = nomor;
    const slots = olehJam.get(nomor) ?? [];
    const kunci = slots.length ? slots.map((s) => `${s.bebanId}|${s.ruangId}`).sort().join(',') : '-';
    if (terbuka && terbuka.kunci === kunci) {
      terbuka.el.sampai = r.label;
      terbuka.el.selesai = r.selesai;
      terbuka.el.jp += 1;
      terbuka.el.b = nomor;
    } else {
      const dasarEl = { dari: r.label, sampai: r.label, mulai: r.mulai, selesai: r.selesai, jp: 1, a: nomor, b: nomor };
      const el: Extract<ElemenHari, { jenis: 'blok' | 'kosong' }> = slots.length ? { jenis: 'blok', item: slots.map(buatItem), ...dasarEl } : { jenis: 'kosong', ...dasarEl };
      terbuka = { kunci, el };
      elemen.push(el);
    }
    if (slots.length) totalJp += 1;
  }
  return { ...dasar, elemen, totalJp };
}

export interface PekanP {
  senin: string;
  hari: HariP[];
}

/** Jadwal satu pekan: satu `HariP` per hari kerja. */
export function jadwalPekanP(p: Proyek, tanggal: string, mode: ModeP, id: string): PekanP {
  const n = p.polaReguler.length;
  const senin = seninPekan(tanggal, n);
  return { senin, hari: Array.from({ length: n }, (_, i) => jadwalHariP(p, tambahHari(senin, i), mode, id)) };
}

export interface BarisMatriks {
  id: string;
  label: string;
  grup: string;
  hari: HariP[];
}
export interface MatriksP {
  senin: string;
  /** keadaan tiap hari tanpa isi (kolom skema, status, kegiatan) */
  hari: HariP[];
  baris: BarisMatriks[];
}

/** Semua kelas (atau guru, atau ruang) sepanjang satu pekan. Guru/ruang yang tidak dipakai pekan itu dibuang. */
export function matriksP(p: Proyek, tanggal: string, mode: ModeP): MatriksP {
  const n = p.polaReguler.length;
  const senin = seninPekan(tanggal, n);
  const tgl = Array.from({ length: n }, (_, i) => tambahHari(senin, i));
  const hari = tgl.map((t) => infoHariP(p, t).dasar);
  const baris: BarisMatriks[] = daftarEntitasP(p, mode)
    .map((e) => ({ id: e.id, label: mode === 'guru' ? (/\(([^)]+)\)$/.exec(e.label)?.[1] ?? e.label) : e.label, grup: e.grup, hari: tgl.map((t) => jadwalHariP(p, t, mode, e.id)) }))
    .filter((b) => mode === 'rombel' || b.hari.some((h) => h.totalJp > 0));
  return { senin, hari, baris };
}
