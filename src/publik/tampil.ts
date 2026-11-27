// Logika tampilan publik (tanpa DOM, bisa diuji): jadwal satu hari dan satu pekan untuk satu kelas, guru, atau ruang.

import type { Beban, Kegiatan, Proyek } from '../model/tipe';
import { NAMA_HARI } from '../model/tipe';
import { dalamRentang, hariPekan, skemaUntukTanggal } from '../model/kalender';
import { hitungSkema } from '../model/skema';
import { jadwalPekan, semesterKegiatan, semesterPada, tidakAktifPada } from '../model/simpul';
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
}

export type ElemenHari =
  | { jenis: 'blok'; item: ItemP[]; dari: string; sampai: string; mulai: string; selesai: string; jp: number }
  | { jenis: 'kosong'; dari: string; sampai: string; mulai: string; selesai: string; jp: number }
  | { jenis: 'istirahat' | 'nonKbm'; nama: string; label: string; mulai: string; selesai: string };

export type StatusHari = 'normal' | 'akhirPekan' | 'libur' | 'diluarSemester' | 'tidakAktif';

export interface HariP {
  tanggal: string;
  hari: string;
  status: StatusHari;
  /** keterangan status (nama libur, alasan tidak aktif) */
  keterangan: string;
  /** kegiatan yang mengatur hari itu (TKA, ASAS, ...), bila ada */
  kegiatan?: { nama: string; jenis: string };
  agenda: { nama: string; jenis: string; untuk?: string }[];
  semester?: string;
  skema?: string;
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

const kosongHari = (tanggal: string, status: StatusHari, keterangan: string): HariP => ({
  tanggal, hari: NAMA_HARI[hariPekan(tanggal)] ?? '', status, keterangan, agenda: [], elemen: [], totalJp: 0,
});

/** Jadwal satu hari untuk satu kelas/guru/ruang. */
export function jadwalHariP(p: Proyek, tanggal: string, mode: ModeP, id: string): HariP {
  const n = p.polaReguler.length;
  const h = hariPekan(tanggal);
  const agenda = p.kalender.filter((g) => g.agenda && dalamRentang(tanggal, g.mulai, g.selesai)).map((g) => ({ nama: g.nama, jenis: g.jenis, ...(g.untuk ? { untuk: g.untuk } : {}) }));
  if (h >= n) return { ...kosongHari(tanggal, 'akhirPekan', 'Akhir pekan'), agenda };
  const info = skemaUntukTanggal(tanggal, p);
  if (info.alasan === 'libur') return { ...kosongHari(tanggal, 'libur', info.kegiatanLibur ?? 'Libur'), agenda };

  const senin = seninPekan(tanggal, n);
  const tanggalHari = Array.from({ length: n }, (_, i) => tambahHari(senin, i));
  const jp = jadwalPekan(p, tanggalHari, 'auto');
  const g: Kegiatan | undefined = jp.kegiatanHari[h];
  const sem = g ? semesterKegiatan(p, g) : semesterPada(p, tanggal);
  const dasar: HariP = {
    ...kosongHari(tanggal, 'normal', ''),
    agenda,
    ...(sem ? { semester: sem.nama } : {}),
    ...(g ? { kegiatan: { nama: g.nama, jenis: g.jenis } } : {}),
  };
  if (!g && !sem) return { ...dasar, status: 'diluarSemester', keterangan: 'Di luar semester berjalan' };
  const skema = p.skema.find((s) => s.id === info.skemaId);
  if (!skema) return { ...dasar, status: 'libur', keterangan: 'Tidak ada KBM' };

  if (mode === 'rombel' && tidakAktifPada(p, g, sem).has(id)) {
    return { ...dasar, status: 'tidakAktif', keterangan: g ? `Tidak ada KBM di sekolah (${g.nama})` : 'Tidak ada KBM di sekolah' };
  }

  const bebanId = new Map<string, Beban>(p.beban.map((b) => [b.id, b]));
  const mapel = new Map(p.master.mapel.map((m) => [m.id, m]));
  const guru = new Map(p.master.guru.map((x) => [x.id, x]));
  const rombel = new Map(p.master.rombel.map((r) => [r.id, r]));
  const ruang = new Map(p.master.ruang.map((r) => [r.id, r]));

  const milik = jp.slots.filter((s) => {
    if (s.hari !== h) return false;
    const b = bebanId.get(s.bebanId);
    if (!b) return false;
    if (mode === 'rombel') return b.rombelId === id;
    if (mode === 'guru') return b.guruId === id || b.timGuruIds.includes(id);
    return s.ruangId === id;
  });
  const olehJam = new Map<number, typeof milik>();
  for (const s of milik) olehJam.set(s.jam, [...(olehJam.get(s.jam) ?? []), s]);

  const buatItem = (s: (typeof milik)[number]): ItemP => {
    const b = bebanId.get(s.bebanId) as Beban;
    const m = mapel.get(b.mapelId);
    return {
      bebanId: b.id,
      mapel: { nama: m?.nama ?? '?', kode: m?.kode ?? '?' },
      guru: [b.guruId, ...b.timGuruIds].map((gid) => guru.get(gid)).filter((x): x is NonNullable<typeof x> => !!x).map((x) => ({ nama: x.nama, kode: x.kode })),
      rombel: rombel.get(b.rombelId)?.kode ?? '?',
      ruang: s.ruangId ? (ruang.get(s.ruangId)?.kode ?? '?') : '',
    };
  };

  const elemen: ElemenHari[] = [];
  let totalJp = 0;
  let terbuka: { kunci: string; el: Extract<ElemenHari, { jenis: 'blok' | 'kosong' }> } | null = null;
  for (const r of hitungSkema(skema)) {
    if (r.nomorKbm === null || r.nomorKbm === 0) {
      terbuka = null;
      elemen.push({ jenis: r.nomorKbm === null ? 'istirahat' : 'nonKbm', nama: r.baris.kegiatan, label: r.label, mulai: r.mulai, selesai: r.selesai });
      continue;
    }
    const slots = olehJam.get(r.nomorKbm) ?? [];
    const kunci = slots.length ? slots.map((s) => `${s.bebanId}|${s.ruangId}`).sort().join(',') : '-';
    if (terbuka && terbuka.kunci === kunci) {
      terbuka.el.sampai = r.label;
      terbuka.el.selesai = r.selesai;
      terbuka.el.jp += 1;
    } else {
      const dasarEl = { dari: r.label, sampai: r.label, mulai: r.mulai, selesai: r.selesai, jp: 1 };
      const el: Extract<ElemenHari, { jenis: 'blok' | 'kosong' }> = slots.length
        ? { jenis: 'blok', item: slots.map(buatItem), ...dasarEl }
        : { jenis: 'kosong', ...dasarEl };
      terbuka = { kunci, el };
      elemen.push(el);
    }
    if (slots.length) totalJp += 1;
  }
  return { ...dasar, skema: skema.nama, elemen, totalJp };
}

export interface SelPekan {
  item: ItemP[];
  mulai: string;
  selesai: string;
}
export interface PekanP {
  senin: string;
  hari: HariP[];
  /** Baris tabel: pelajaran ke-1 sampai terbanyak; tiap baris berisi sel per hari (null = tidak ada jam itu di skema hari tersebut). */
  baris: (SelPekan | null)[][];
}

/** Jadwal satu pekan (tabel pelajaran ke-n x hari). */
export function jadwalPekanP(p: Proyek, tanggal: string, mode: ModeP, id: string): PekanP {
  const n = p.polaReguler.length;
  const senin = seninPekan(tanggal, n);
  const hari = Array.from({ length: n }, (_, i) => jadwalHariP(p, tambahHari(senin, i), mode, id));
  // nomor pelajaran = urutan kbm pada elemen hari: jam kosong digabung, jadi dihitung ulang dari jp
  const kolom = hari.map((d) => {
    const sel: (SelPekan | null)[] = [];
    for (const e of d.elemen) {
      if (e.jenis !== 'blok' && e.jenis !== 'kosong') continue;
      for (let i = 0; i < e.jp; i++) sel.push(e.jenis === 'blok' ? { item: e.item, mulai: e.mulai, selesai: e.selesai } : { item: [], mulai: e.mulai, selesai: e.selesai });
    }
    return sel;
  });
  const maks = Math.max(0, ...kolom.map((k) => k.length));
  const baris = Array.from({ length: maks }, (_, r) => kolom.map((k) => k[r] ?? null));
  return { senin, hari, baris };
}
