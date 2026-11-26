import type { Beban, Proyek, Slot } from '../model/tipe';
import { adalahPelanggaran, periksa, ruangDilarang } from './validator';

export interface HasilRuang {
  ruangId: string;
  alasan?: string;
}

/**
 * Memilih ruang untuk beban pada hari+jam tertentu.
 * - `pilihan` (ruang yang diminta) dipakai bila bebas dan tidak terlarang.
 * - Selain itu mengikuti `ruangPrioritas` secara berurutan; bila daftar prioritas kosong, semua ruang
 *   yang tidak terlarang dicoba berurutan sesuai master.
 * - Bila daftar prioritas ada tetapi semuanya terpakai, hasilnya kosong dengan alasan (ruang kurang).
 */
export function tentukanRuang(p: Proyek, slotsLain: Slot[], beban: Beban, hari: number, jam: number, pilihan?: string): HasilRuang {
  if (p.master.ruang.length === 0) return { ruangId: '' };
  const terpakai = new Set<string>();
  for (const s of slotsLain) if (s.hari === hari && s.jam === jam) terpakai.add(s.ruangId);
  const dilarang = ruangDilarang(p, beban);
  const bersama = new Set(p.master.ruang.filter((r) => r.bersama).map((r) => r.id));
  const ada = new Set(p.master.ruang.map((r) => r.id));
  const bebas = (id: string) => ada.has(id) && !dilarang.has(id) && (!terpakai.has(id) || bersama.has(id));

  if (pilihan && bebas(pilihan)) return { ruangId: pilihan };
  const daftar = beban.ruangPrioritas.length ? beban.ruangPrioritas : p.master.ruang.map((r) => r.id);
  for (const id of daftar) if (bebas(id)) return { ruangId: id };
  return { ruangId: '', alasan: beban.ruangPrioritas.length ? 'Semua ruang prioritas sedang terpakai' : 'Tidak ada ruang kosong yang diperbolehkan' };
}

/**
 * Pratinjau perubahan: menaruh `ubahan` (slot baru atau yang berpindah, dikenali dari id) lalu mengembalikan
 * pelanggaran wajib yang melibatkan slot-slot itu. Kosong = penempatan aman.
 */
export function cekPenempatan(p: Proyek, slots: Slot[], ubahan: Slot[]): string[] {
  const ids = new Set(ubahan.map((s) => s.id));
  const hipotesis = slots.filter((s) => !ids.has(s.id)).concat(ubahan);
  const pesan = new Set<string>();
  for (const m of periksa(p, hipotesis)) {
    if (adalahPelanggaran(m) && m.slotIds.some((id) => ids.has(id))) pesan.add(m.pesan);
  }
  return [...pesan];
}

export interface RencanaPindah {
  ok: boolean;
  alasan: string[];
  /** slot hasil (baru atau pindah; pada tukar berisi dua slot) */
  ubahan: Slot[];
  tukar: boolean;
}

let cacah = 0;
export function idSlotBaru(): string {
  cacah += 1;
  return `s${Date.now().toString(36)}${cacah.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

/**
 * Rencana menaruh beban baru (`dari.bebanId`) atau memindah slot (`dari.slotId`) ke hari+jam tujuan.
 * Bila memindah slot ke sel yang hanya berisi satu slot lain dan perpindahan biasa gagal, dicoba tukar posisi.
 */
export function rencanaPindah(p: Proyek, slots: Slot[], dari: { bebanId?: string; slotId?: string }, hari: number, jam: number): RencanaPindah {
  const bebanById = new Map(p.beban.map((b) => [b.id, b]));
  const asal = dari.slotId ? slots.find((s) => s.id === dari.slotId) : undefined;
  const beban = bebanById.get(asal ? asal.bebanId : (dari.bebanId ?? ''));
  if (!beban) return { ok: false, alasan: ['Beban tidak ditemukan.'], ubahan: [], tukar: false };
  if (beban.nonTatapMuka) return { ok: false, alasan: ['Beban non-tatap-muka tidak menempati slot.'], ubahan: [], tukar: false };
  if (asal && asal.hari === hari && asal.jam === jam) return { ok: false, alasan: ['Sudah berada di sel ini.'], ubahan: [], tukar: false };

  const lain = slots.filter((s) => s.id !== asal?.id);
  const ruang = tentukanRuang(p, lain, beban, hari, jam, asal?.ruangId);
  const baru: Slot = { id: asal?.id ?? idSlotBaru(), bebanId: beban.id, hari, jam, ruangId: ruang.ruangId };
  const alasan = cekPenempatan(p, slots, [baru]);
  if (ruang.alasan) alasan.unshift(ruang.alasan);
  if (alasan.length === 0) return { ok: true, alasan: [], ubahan: [baru], tukar: false };

  if (asal) {
    const dihuni = slots.filter((s) => s.hari === hari && s.jam === jam && s.id !== asal.id);
    const t = dihuni.length === 1 ? dihuni[0] : undefined;
    const bT = t ? bebanById.get(t.bebanId) : undefined;
    if (t && bT && bT.rombelId === beban.rombelId && !bT.paralel) {
      const sisa = slots.filter((s) => s.id !== asal.id && s.id !== t.id);
      const rA = tentukanRuang(p, sisa, beban, hari, jam, asal.ruangId);
      const a2: Slot = { ...asal, hari, jam, ruangId: rA.ruangId };
      const rT = tentukanRuang(p, [...sisa, a2], bT, asal.hari, asal.jam, t.ruangId);
      const t2: Slot = { ...t, hari: asal.hari, jam: asal.jam, ruangId: rT.ruangId };
      const alasanTukar = cekPenempatan(p, slots, [a2, t2]);
      if (rA.alasan) alasanTukar.unshift(rA.alasan);
      if (rT.alasan) alasanTukar.unshift(rT.alasan);
      if (alasanTukar.length === 0) return { ok: true, alasan: [], ubahan: [a2, t2], tukar: true };
    }
  }
  return { ok: false, alasan, ubahan: [], tukar: false };
}

/** Menerapkan hasil rencana ke daftar slot (menimpa slot berid sama, menambah yang baru). */
export function terapkanRencana(slots: Slot[], r: RencanaPindah): Slot[] {
  const ganti = new Map(r.ubahan.map((s) => [s.id, s]));
  const hasil = slots.map((s) => ganti.get(s.id) ?? s);
  for (const s of r.ubahan) if (!slots.some((x) => x.id === s.id)) hasil.push(s);
  return hasil;
}
