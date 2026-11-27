// Model induk dan kegiatan.
//
// Satu proyek = satu semester (periode induk) dengan jadwal reguler. Di dalamnya ada kegiatan (TKA, ASAS, UKK, ...) yang
// masing-masing punya versi jadwal sendiri. Pada kegiatan model baru (`rombelTerdampak` terisi):
// - rombel terdampak memakai slot dari versi kegiatan dan beban warisan (beban induk + pengecualian khusus kegiatan);
// - rombel aktif lain mengikuti jadwal induk secara langsung (bukan salinan);
// - rombel tidak aktif disembunyikan.
// Mengubah jadwal atau beban rombel yang masih ikut induk dari dalam kegiatan menjadikannya terdampak (salin-saat-ubah).

import type { Beban, Kegiatan, Proyek, Semester, Slot, VersiJadwal } from './tipe';
import { berlakuPada, dalamRentang, periodeUntukTanggal, versiReguler } from './kalender';

/** Sasaran yang sedang dikerjakan: 'auto' = menurut tanggal, 'sem:<id>' = induk (jadwal reguler) semester itu, selain itu id kegiatan. */
export type Fokus = 'auto' | `sem:${string}` | string;

export const fokusSemester = (id: string): Fokus => `sem:${id}`;
export const daftarSemester = (p: Proyek): Semester[] => p.semesters ?? [];
/** Semester yang difokuskan ('sem:<id>'; 'induk' = semester pertama, format lama). */
export function semesterFokus(p: Proyek, fokus: Fokus): Semester | undefined {
  if (fokus === 'induk') return daftarSemester(p)[0];
  return fokus.startsWith('sem:') ? daftarSemester(p).find((s) => s.id === fokus.slice(4)) : undefined;
}
export const fokusInduk = (fokus: Fokus): boolean => fokus === 'induk' || fokus.startsWith('sem:');
/** Semester yang memuat tanggal (yang pertama bila tumpang tindih). */
export const semesterPada = (p: Proyek, tanggal: string): Semester | undefined =>
  daftarSemester(p).find((s) => s.mulai && s.selesai && dalamRentang(tanggal, s.mulai, s.selesai));
/** Semester induk sebuah kegiatan: yang ditunjuk, atau yang memuat tanggal mulainya, atau yang pertama. */
export function semesterKegiatan(p: Proyek, g: Kegiatan): Semester | undefined {
  return (g.semesterId ? daftarSemester(p).find((s) => s.id === g.semesterId) : undefined) ?? semesterPada(p, g.mulai) ?? daftarSemester(p)[0];
}
/** Versi jadwal reguler sebuah semester (tanpa semester: versi reguler pertama). */
export function versiSemester(p: Proyek, s: Semester | undefined): VersiJadwal | undefined {
  return (s?.versiId ? p.versi.find((v) => v.id === s.versiId) : undefined) ?? versiReguler(p);
}
/** Semester yang memakai versi ini sebagai jadwal reguler. */
export const semesterDariVersi = (p: Proyek, versiId: string | undefined): Semester | undefined => daftarSemester(p).find((s) => (s.versiId ?? versiReguler(p)?.id) === versiId);

export const modelWarisan = (g: Kegiatan): boolean => g.rombelTerdampak !== undefined;

/** Rombel memakai jadwal khusus kegiatan `g` (bukan induk). */
export function terdampak(g: Kegiatan | undefined, rombelId: string): boolean {
  if (!g?.versiId) return false;
  return g.rombelTerdampak === undefined || g.rombelTerdampak.includes(rombelId);
}

export const versiDari = (p: Proyek, id: string | undefined): VersiJadwal | undefined => (id ? p.versi.find((v) => v.id === id) : undefined);

/**
 * Beban induk sebuah semester: bertanda versi reguler semester itu. Beban tanpa versiId milik semester pertama (atau semua bila
 * belum ada semester).
 */
export function bebanInduk(p: Proyek, sem?: Semester): Beban[] {
  const s = sem ?? daftarSemester(p)[0];
  const vid = versiSemester(p, s)?.id;
  const pertama = !s || s === daftarSemester(p)[0];
  return p.beban.filter((b) => b.versiId === vid || (!b.versiId && pertama));
}

/** versiId yang dipasang pada beban baru di induk semester `s` (kosong bila hanya ada satu semester). */
export function tandaBebanInduk(p: Proyek, s: Semester | undefined): string | undefined {
  if (daftarSemester(p).length <= 1 && !p.beban.some((b) => b.versiId && b.versiId === versiSemester(p, s)?.id)) return undefined;
  return versiSemester(p, s)?.id;
}

/** Beban yang berlaku pada kegiatan: model warisan = induk dikurangi yang digantikan/dihapus + khusus kegiatan; data lama = tanpa versiId + khusus versi. */
export function bebanKegiatan(p: Proyek, g: Kegiatan): Beban[] {
  const vid = g.versiId;
  const sem = semesterKegiatan(p, g);
  if (!vid) return bebanInduk(p, sem);
  if (!modelWarisan(g)) return p.beban.filter((b) => !b.versiId || b.versiId === vid);
  const khusus = p.beban.filter((b) => b.versiId === vid);
  const ganti = new Set(khusus.map((b) => b.asal).filter((x): x is string => !!x));
  return [...bebanInduk(p, sem).filter((b) => !ganti.has(b.id)), ...khusus.filter((b) => !b.dihapus)];
}

/** Beban satu rombel pada konteks kegiatan (atau induk bila tidak ada/tidak terdampak). */
export function bebanRombel(p: Proyek, g: Kegiatan | undefined, rombelId: string, sem?: Semester): Beban[] {
  return (g && terdampak(g, rombelId) ? bebanKegiatan(p, g) : bebanInduk(p, g ? semesterKegiatan(p, g) : sem)).filter((b) => b.rombelId === rombelId);
}

/** Kalender sebagaimana dilihat pada fokus: induk = hanya libur; kegiatan = libur + kegiatan itu. */
export function kalenderFokus(p: Proyek, fokus: Fokus): Kegiatan[] {
  if (fokus === 'auto') return p.kalender;
  const libur = p.kalender.filter((g) => g.jenis === 'libur');
  if (fokusInduk(fokus)) return libur;
  const g = p.kalender.find((x) => x.id === fokus);
  return g ? [...libur, g] : libur;
}

export const kegiatanFokus = (p: Proyek, fokus: Fokus): Kegiatan | undefined => (fokus === 'auto' || fokusInduk(fokus) ? undefined : p.kalender.find((g) => g.id === fokus && g.jenis !== 'libur' && !g.agenda));

/** Kegiatan yang mengatur satu tanggal pada fokus tertentu. */
export function kegiatanPadaTanggal(p: Proyek, tanggal: string, fokus: Fokus): Kegiatan | undefined {
  return periodeUntukTanggal(tanggal, kalenderFokus(p, fokus));
}

export const tidakAktifPada = (_p: Proyek, g: Kegiatan | undefined, sem?: Semester): Set<string> => new Set(g ? g.rombelTidakAktif : (sem?.rombelTidakAktif ?? []));

/** Semester yang mengatur satu tanggal pada fokus tertentu. */
export function semesterPadaFokus(p: Proyek, tanggal: string, fokus: Fokus): Semester | undefined {
  const s = semesterFokus(p, fokus);
  if (s) return s;
  const g = kegiatanFokus(p, fokus);
  if (g) return semesterKegiatan(p, g);
  return semesterPada(p, tanggal) ?? daftarSemester(p)[0];
}

export interface JadwalPekan {
  /** kegiatan yang mengatur tiap hari (indeks 0..n-1); undefined = induk */
  kegiatanHari: (Kegiatan | undefined)[];
  /** versi jadwal induk (reguler semester) tiap hari */
  indukHari: (string | undefined)[];
  /** slot yang tampil (rombel aktif), digabung dari induk dan kegiatan */
  slots: Slot[];
  /** asal tiap slot yang tampil: id versi */
  asal: Map<string, string>;
}

/**
 * Menyusun slot yang berlaku untuk satu pekan: per hari, rombel terdampak dari versi kegiatan hari itu, rombel lain dari induk
 * (jadwal reguler semester yang memuat hari itu). `tanggalHari[i]` = tanggal hari kerja ke-i pekan itu.
 */
export function jadwalPekan(p: Proyek, tanggalHari: string[], fokus: Fokus): JadwalPekan {
  const rombelBeban = new Map(p.beban.map((b) => [b.id, b.rombelId]));
  const kegiatanHari = tanggalHari.map((t) => kegiatanPadaTanggal(p, t, fokus));
  const semHari = tanggalHari.map((t, i) => (kegiatanHari[i] ? semesterKegiatan(p, kegiatanHari[i]) : semesterPadaFokus(p, t, fokus)));
  const indukHari = semHari.map((s) => versiSemester(p, s)?.id);
  const tdkHari = kegiatanHari.map((g, i) => tidakAktifPada(p, g, semHari[i]));
  const slots: Slot[] = [];
  const asal = new Map<string, string>();
  const masuk = (s: Slot, vid: string) => {
    slots.push(s);
    asal.set(s.id, vid);
  };
  for (const vid of new Set(indukHari)) {
    const v = versiDari(p, vid);
    for (const s of v?.slots ?? []) {
      if (indukHari[s.hari] !== vid) continue;
      const g = kegiatanHari[s.hari];
      const r = rombelBeban.get(s.bebanId) ?? '';
      if (tdkHari[s.hari]?.has(r)) continue;
      if (g && terdampak(g, r)) continue;
      masuk(s, vid as string);
    }
  }
  const sudah = new Set<string>();
  kegiatanHari.forEach((g) => {
    if (!g?.versiId || sudah.has(g.versiId) || indukHari.includes(g.versiId)) return;
    sudah.add(g.versiId);
    const v = versiDari(p, g.versiId);
    for (const s of v?.slots ?? []) {
      const gh = kegiatanHari[s.hari];
      const r = rombelBeban.get(s.bebanId) ?? '';
      if (gh?.versiId !== g.versiId || tdkHari[s.hari]?.has(r) || !terdampak(gh, r)) continue;
      masuk(s, g.versiId);
    }
  });
  return { kegiatanHari, indukHari, slots, asal };
}

let urut = 0;
const idBaru = (dasar: string) => `${dasar}~${Date.now().toString(36)}${(urut++).toString(36)}`;

/**
 * Menjadikan rombel terdampak pada kegiatan `g`: slot induknya (pada hari kegiatan berlaku) disalin ke versi kegiatan.
 * Mengembalikan peta id slot induk → id slot salinan.
 */
export function jadikanTerdampak(p: Proyek, g: Kegiatan, rombelId: string, salin = true): Map<string, string> {
  const peta = new Map<string, string>();
  if (!g.versiId || !modelWarisan(g) || g.rombelTerdampak?.includes(rombelId)) return peta;
  g.rombelTerdampak = [...(g.rombelTerdampak ?? []), rombelId];
  const v = versiDari(p, g.versiId);
  const reg = versiSemester(p, semesterKegiatan(p, g));
  if (!v || !reg || !salin) return peta;
  const milik = new Set(bebanKegiatan(p, g).filter((b) => b.rombelId === rombelId).map((b) => b.id));
  const asalKe = new Map(p.beban.filter((b) => b.versiId === g.versiId && b.asal && b.rombelId === rombelId).map((b) => [b.asal as string, b]));
  const hari = g.hariBerlaku?.length ? new Set(g.hariBerlaku) : undefined;
  for (const s of reg.slots) {
    const b = p.beban.find((x) => x.id === s.bebanId);
    if (!b || b.rombelId !== rombelId) continue;
    if (hari && !hari.has(s.hari)) continue;
    const pengganti = asalKe.get(s.bebanId);
    if (pengganti?.dihapus) continue;
    const bebanId = pengganti ? pengganti.id : s.bebanId;
    if (!milik.has(bebanId)) continue;
    const id = idBaru(s.id);
    peta.set(s.id, id);
    v.slots.push({ ...s, id, bebanId });
  }
  return peta;
}

/** Mengembalikan rombel agar mengikuti induk lagi pada kegiatan `g`: slot dan beban khususnya pada kegiatan itu dihapus. */
export function ikutInduk(p: Proyek, g: Kegiatan, rombelId: string): void {
  if (!g.versiId) return;
  g.rombelTerdampak = (g.rombelTerdampak ?? []).filter((r) => r !== rombelId);
  const v = versiDari(p, g.versiId);
  const rb = new Map(p.beban.map((b) => [b.id, b.rombelId]));
  if (v) v.slots = v.slots.filter((s) => rb.get(s.bebanId) !== rombelId);
  p.beban = p.beban.filter((b) => !(b.versiId === g.versiId && b.rombelId === rombelId));
}

/**
 * Menyiapkan beban untuk diubah dalam konteks kegiatan: beban induk diganti salinan khusus kegiatan (rombelnya dijadikan terdampak
 * dan slotnya dialihkan ke salinan). Mengembalikan id beban yang boleh diubah. Tanpa kegiatan model warisan = id itu sendiri.
 */
export function bebanUntukDiubah(p: Proyek, g: Kegiatan | undefined, bebanId: string): string {
  const b = p.beban.find((x) => x.id === bebanId);
  if (!b || !g?.versiId || !modelWarisan(g)) return bebanId;
  if (b.versiId === g.versiId) return bebanId;
  jadikanTerdampak(p, g, b.rombelId);
  const id = `${b.id}~${g.versiId}`;
  const ada = p.beban.find((x) => x.id === id);
  if (ada) return id;
  const salinan: Beban = { ...structuredClone(b), id, versiId: g.versiId, asal: b.id };
  delete salinan.dihapus;
  p.beban.push(salinan);
  const v = versiDari(p, g.versiId);
  if (v) for (const s of v.slots) if (s.bebanId === b.id) s.bebanId = id;
  return id;
}

/** Menghapus beban dalam konteks kegiatan: beban induk ditandai tidak dipakai, beban tambahan kegiatan dihapus. Slotnya di kegiatan ikut dihapus. */
export function hapusBebanKegiatan(p: Proyek, g: Kegiatan, bebanId: string): void {
  const id = bebanUntukDiubah(p, g, bebanId);
  const b = p.beban.find((x) => x.id === id);
  if (!b) return;
  const v = versiDari(p, g.versiId);
  if (v) v.slots = v.slots.filter((s) => s.bebanId !== id);
  if (b.asal) b.dihapus = true;
  else p.beban = p.beban.filter((x) => x.id !== id);
}

/** Mengembalikan beban khusus kegiatan ke beban induknya (slot dialihkan kembali). */
export function kembalikanBeban(p: Proyek, g: Kegiatan, bebanId: string): void {
  const b = p.beban.find((x) => x.id === bebanId);
  if (!b?.asal || b.versiId !== g.versiId) return;
  const v = versiDari(p, g.versiId);
  if (v) for (const s of v.slots) if (s.bebanId === b.id) s.bebanId = b.asal;
  p.beban = p.beban.filter((x) => x.id !== b.id);
}

export interface HasilAlih {
  ok: boolean;
  pesan?: string;
  /** rombel yang baru dijadikan terdampak */
  baruTerdampak: string[];
}

/**
 * Menerapkan perubahan pada slot yang tampil ke versi yang tepat. `sebelum` = slot tampil sebelum diubah (beserta asalnya),
 * `sesudah` = hasil perubahan. Slot rombel terdampak masuk versi kegiatan; rombel yang masih ikut induk dijadikan terdampak lebih dulu
 * bila harinya diatur kegiatan model warisan; selain itu masuk induk. Pada fokus kegiatan, perubahan yang jatuh ke induk ditolak.
 */
export function alihkanPerubahan(p: Proyek, pekan: JadwalPekan, sesudah: Slot[], fokus: Fokus): HasilAlih {
  if (!pekan.indukHari.some(Boolean)) return { ok: false, pesan: 'Belum ada versi jadwal.', baruTerdampak: [] };
  const rombelOf = (s: Slot) => p.beban.find((b) => b.id === s.bebanId)?.rombelId ?? '';
  const lama = new Map(pekan.slots.map((s) => [s.id, s]));
  const baru = new Map(sesudah.map((s) => [s.id, s]));
  const hapus: Slot[] = [...lama.values()].filter((s) => !baru.has(s.id) || JSON.stringify(baru.get(s.id)) !== JSON.stringify(s));
  const tambah: Slot[] = [...baru.values()].filter((s) => !lama.has(s.id) || JSON.stringify(lama.get(s.id)) !== JSON.stringify(s));
  if (!hapus.length && !tambah.length) return { ok: true, baruTerdampak: [] };

  const sasaran = (s: Slot): Kegiatan | undefined => {
    const g = pekan.kegiatanHari[s.hari];
    return g?.versiId && g.versiId !== pekan.indukHari[s.hari] ? g : undefined;
  };
  // perubahan yang jatuh ke induk saat sedang mengerjakan kegiatan tertentu ditolak
  if (fokus !== 'auto' && !fokusInduk(fokus)) {
    const keInduk = [...hapus, ...tambah].some((s) => !sasaran(s));
    if (keInduk) return { ok: false, pesan: 'Hari itu di luar kegiatan ini (mengikuti jadwal induk). Ubah lewat jadwal induk.', baruTerdampak: [] };
  }
  // salin-saat-ubah: rombel yang ikut induk pada hari yang diatur kegiatan model warisan
  const baruTerdampak: string[] = [];
  const petaSalin = new Map<string, string>();
  for (const s of [...hapus, ...tambah]) {
    const g = sasaran(s);
    const r = rombelOf(s);
    if (!g || !modelWarisan(g) || terdampak(g, r)) continue;
    const peta = jadikanTerdampak(p, g, r);
    peta.forEach((v, k) => petaSalin.set(k, v));
    baruTerdampak.push(r);
  }
  const asalSlot = (s: Slot): string | undefined => (petaSalin.has(s.id) ? sasaran(s)?.versiId : pekan.asal.get(s.id));
  const idNyata = (s: Slot): string => petaSalin.get(s.id) ?? s.id;
  for (const s of hapus) {
    const vid = asalSlot(s);
    const v = versiDari(p, vid);
    if (!v) continue;
    const id = idNyata(s);
    v.slots = v.slots.filter((x) => x.id !== id);
  }
  for (const s of tambah) {
    const g = sasaran(s);
    const r = rombelOf(s);
    const vid = g && terdampak(g, r) ? g.versiId : pekan.indukHari[s.hari];
    const v = versiDari(p, vid);
    if (!v) continue;
    const id = lama.has(s.id) ? idNyata(s) : s.id;
    const sudahAda = v.slots.some((x) => x.id === id);
    v.slots.push({ ...s, id: sudahAda ? idBaru(id) : id });
  }
  return { ok: true, baruTerdampak };
}

// ------------------------------------------------------------------ konversi data lama

const tandaBeban = (b: Beban) => JSON.stringify([b.rombelId, b.mapelId, b.guruId, b.jp, [...b.timGuruIds].sort(), b.paralel ?? '', !!b.nonTatapMuka]);

/**
 * Mengubah kegiatan data lama (versi berisi salinan lengkap) menjadi model warisan: rombel yang jadwal dan bebannya sama dengan
 * induk diikutkan induk; rombel lain menjadi terdampak dengan beban pengecualian (asal/dihapus) dan tambahan.
 */
export function jadikanWarisan(p: Proyek, g: Kegiatan): { terdampak: string[]; ikut: string[] } {
  const hasil = { terdampak: [] as string[], ikut: [] as string[] };
  const sem = semesterKegiatan(p, g);
  const reg = versiSemester(p, sem);
  const v = versiDari(p, g.versiId);
  if (!reg || !v || v.id === reg.id || modelWarisan(g)) return hasil;
  const induk = bebanInduk(p, sem);
  const hariK = g.hariBerlaku?.length ? new Set(g.hariBerlaku) : undefined;
  const khusus = p.beban.filter((b) => b.versiId === v.id);
  const tdk = new Set(g.rombelTidakAktif);
  const rb = new Map(p.beban.map((b) => [b.id, b.rombelId]));
  const terdampakBaru: string[] = [];
  const bebanBaru: Beban[] = [];
  const buang = new Set<string>();
  for (const r of p.master.rombel) {
    const ib = induk.filter((b) => b.rombelId === r.id);
    const kb = khusus.filter((b) => b.rombelId === r.id);
    const slotV = v.slots.filter((s) => rb.get(s.bebanId) === r.id);
    kb.forEach((b) => buang.add(b.id));
    if (tdk.has(r.id)) {
      v.slots = v.slots.filter((s) => !slotV.includes(s));
      continue;
    }
    // pasangkan beban kegiatan dengan beban induk
    const pakai = new Set<string>();
    const ke = new Map<string, string>();
    const pengganti: Beban[] = [];
    const tambahan: Beban[] = [];
    for (const b of kb) {
      const sama = ib.find((i) => !pakai.has(i.id) && tandaBeban(i) === tandaBeban(b));
      if (sama) {
        pakai.add(sama.id);
        ke.set(b.id, sama.id);
        continue;
      }
      const mirip = ib.find((i) => !pakai.has(i.id) && i.mapelId === b.mapelId && i.guruId === b.guruId);
      if (mirip) {
        pakai.add(mirip.id);
        pengganti.push({ ...b, asal: mirip.id });
      } else tambahan.push(b);
    }
    const sisaInduk = ib.filter((i) => !pakai.has(i.id));
    const kunci = (s: Slot) => `${ke.get(s.bebanId) ?? s.bebanId}|${s.hari}|${s.jam}|${s.ruangId}`;
    const a = slotV.map(kunci).sort().join(',');
    const bR = reg.slots.filter((s) => rb.get(s.bebanId) === r.id && (!hariK || hariK.has(s.hari))).map(kunci).sort().join(',');
    if (!pengganti.length && !tambahan.length && !sisaInduk.length && a === bR) {
      hasil.ikut.push(r.id);
      v.slots = v.slots.filter((s) => !slotV.includes(s));
      continue;
    }
    hasil.terdampak.push(r.id);
    terdampakBaru.push(r.id);
    for (const s of slotV) s.bebanId = ke.get(s.bebanId) ?? s.bebanId;
    bebanBaru.push(...pengganti, ...tambahan);
    for (const i of sisaInduk) bebanBaru.push({ ...structuredClone(i), id: `${i.id}~${v.id}`, versiId: v.id, asal: i.id, dihapus: true });
  }
  p.beban = [...p.beban.filter((b) => !buang.has(b.id)), ...bebanBaru];
  g.rombelTerdampak = terdampakBaru;
  return hasil;
}

/** Kegiatan yang berlaku pada tanggal (dipakai label status di pohon). */
export const berlakuHariIni = (g: Kegiatan, hariIni: string): boolean => berlakuPada(g, hariIni);
