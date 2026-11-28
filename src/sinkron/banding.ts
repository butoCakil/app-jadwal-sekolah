/**
 * Membandingkan dan menggabungkan dua versi Proyek (lokal dan GitHub), dengan versi dasar (sinkron terakhir) bila ada.
 * Proyek diurai menjadi "unit" bernama: tiap guru, mapel, kelas, ruang, beban, aturan, kegiatan, semester, skema jam, skema mingguan
 * dan tiap versi jadwal (satu unit utuh, supaya jadwal dua sisi tidak tercampur menjadi bentrok).
 * Tiga arah: unit yang hanya berubah di satu sisi diambil otomatis; unit yang berubah di kedua sisi menjadi bentrok dan harus dipilih.
 */

import type { Aturan, Beban, Guru, Kegiatan, Mapel, PenerimaanMasalah, PolaBernama, Proyek, Rombel, Ruang, Semester, Skema, VersiJadwal } from '../model/tipe';

export type Bagian = 'Skema jam' | 'Skema mingguan' | 'Guru' | 'Mapel' | 'Kelas' | 'Ruang' | 'Beban' | 'Aturan' | 'Kalender dan kegiatan' | 'Semester' | 'Jadwal' | 'Lainnya';
export const URUT_BAGIAN: Bagian[] = ['Skema jam', 'Skema mingguan', 'Kalender dan kegiatan', 'Semester', 'Guru', 'Mapel', 'Kelas', 'Ruang', 'Beban', 'Aturan', 'Jadwal', 'Lainnya'];

export interface Unit {
  kunci: string;
  bagian: Bagian;
  label: string;
  nilai: unknown;
  /** bentuk teks stabil untuk membandingkan isi */
  ciri: string;
}

/** JSON dengan urutan kunci tetap, supaya dua objek yang isinya sama selalu menghasilkan teks yang sama. */
export function stabil(x: unknown): string {
  if (Array.isArray(x)) return `[${x.map(stabil).join(',')}]`;
  if (x && typeof x === 'object') {
    const o = x as Record<string, unknown>;
    return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stabil(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(x === undefined ? null : x);
}

const unit = (kunci: string, bagian: Bagian, label: string, nilai: unknown): Unit => ({ kunci, bagian, label, nilai, ciri: stabil(nilai) });

export function urai(p: Proyek): Unit[] {
  const u: Unit[] = [];
  u.push(unit('meta', 'Lainnya', 'Nama proyek dan versi data', { nama: p.nama, versiSkemaData: p.versiSkemaData }));
  for (const s of p.skema) u.push(unit(`skema:${s.id}`, 'Skema jam', s.nama, s));
  u.push(unit('mingguan:default', 'Skema mingguan', `${p.polaRegulerNama ?? 'Skema reguler'} (default)`, { polaReguler: p.polaReguler, polaRegulerId: p.polaRegulerId ?? null, polaRegulerNama: p.polaRegulerNama ?? null }));
  u.push(unit('mingguan:manual', 'Skema mingguan', 'Penggantian manual', p.penggantiManual));
  for (const q of p.polaLain ?? []) u.push(unit(`mingguan:${q.id}`, 'Skema mingguan', q.nama, q));
  for (const x of p.kalender) u.push(unit(`kalender:${x.id}`, 'Kalender dan kegiatan', `${x.nama} (${x.mulai}${x.selesai !== x.mulai ? ` s.d. ${x.selesai}` : ''})`, x));
  for (const s of p.semesters ?? []) u.push(unit(`semester:${s.id}`, 'Semester', s.nama, s));
  for (const g of p.master.guru) u.push(unit(`guru:${g.id}`, 'Guru', `${g.nama} (${g.kode})`, g));
  for (const m of p.master.mapel) u.push(unit(`mapel:${m.id}`, 'Mapel', `${m.nama} (${m.kode})`, m));
  for (const r of p.master.rombel) u.push(unit(`rombel:${r.id}`, 'Kelas', r.kode, r));
  for (const r of p.master.ruang) u.push(unit(`ruang:${r.id}`, 'Ruang', `${r.kode} ${r.nama}`.trim(), r));
  const kodeRombel = new Map(p.master.rombel.map((r) => [r.id, r.kode]));
  const kodeMapel = new Map(p.master.mapel.map((m) => [m.id, m.kode]));
  const kodeGuru = new Map(p.master.guru.map((g) => [g.id, g.kode]));
  for (const b of p.beban) u.push(unit(`beban:${b.id}`, 'Beban', `${kodeRombel.get(b.rombelId) ?? b.rombelId} · ${kodeMapel.get(b.mapelId) ?? b.mapelId} · ${kodeGuru.get(b.guruId) ?? b.guruId} · ${b.jp} JP${b.versiId ? ' (khusus versi)' : ''}`, b));
  for (const a of p.aturan) u.push(unit(`aturan:${a.id}`, 'Aturan', `${a.jenis}${'guruId' in a ? ` ${kodeGuru.get(a.guruId) ?? a.guruId}` : ''}${a.catatan ? `: ${a.catatan}` : ''}`, a));
  for (const d of p.diterima ?? []) u.push(unit(`diterima:${d.pesan}`, 'Aturan', `Pelanggaran diterima: ${d.pesan}`, d));
  for (const v of p.versi) u.push(unit(`jadwal:${v.id}`, 'Jadwal', `${v.nama} (${v.slots.length} slot)`, v));
  return u;
}

export type StatusBeda = 'lokal' | 'remote' | 'bentrok' | 'beda';

export interface Perbedaan {
  kunci: string;
  bagian: Bagian;
  label: string;
  /** 'lokal' = hanya berubah di peramban ini; 'remote' = hanya berubah di GitHub; 'bentrok' = berubah di keduanya; 'beda' = berbeda tetapi tanpa dasar pembanding */
  status: StatusBeda;
  ada: { lokal: boolean; remote: boolean };
}

export type Pilihan = 'lokal' | 'remote';

/** Daftar unit yang berbeda antara lokal dan GitHub. `basis` = versi pada sinkron terakhir (opsional). */
export function bandingkan(lokal: Proyek, remote: Proyek, basis?: Proyek | null): Perbedaan[] {
  const L = new Map(urai(lokal).map((x) => [x.kunci, x]));
  const R = new Map(urai(remote).map((x) => [x.kunci, x]));
  const B = basis ? new Map(urai(basis).map((x) => [x.kunci, x])) : null;
  const kunci = [...L.keys(), ...[...R.keys()].filter((k) => !L.has(k))];
  const hasil: Perbedaan[] = [];
  for (const k of kunci) {
    const l = L.get(k);
    const r = R.get(k);
    if (l?.ciri === r?.ciri) continue;
    let status: StatusBeda = 'beda';
    if (B) {
      const b = B.get(k);
      const lSama = l?.ciri === b?.ciri;
      const rSama = r?.ciri === b?.ciri;
      status = lSama && !rSama ? 'remote' : rSama && !lSama ? 'lokal' : 'bentrok';
    }
    const sumber = (l ?? r) as Unit;
    hasil.push({ kunci: k, bagian: sumber.bagian, label: sumber.label, status, ada: { lokal: !!l, remote: !!r } });
  }
  return hasil;
}

/** Pilihan awal menurut status: perubahan satu sisi diambil, bentrok dan beda belum dipilih. */
export function pilihanAwal(beda: Perbedaan[]): Map<string, Pilihan> {
  const m = new Map<string, Pilihan>();
  for (const b of beda) if (b.status === 'lokal' || b.status === 'remote') m.set(b.kunci, b.status);
  return m;
}

/** Perbedaan yang belum punya pilihan. */
export const belumDipilih = (beda: Perbedaan[], pilih: Map<string, Pilihan>): Perbedaan[] => beda.filter((b) => !pilih.has(b.kunci));

/**
 * Menyusun proyek hasil gabungan. Unit yang sama di kedua sisi dipakai apa adanya; unit yang berbeda mengikuti `pilih`
 * (yang belum dipilih memakai versi lokal). Urutan mengikuti lokal, unit baru dari GitHub ditambahkan di belakangnya.
 */
export function gabung(lokal: Proyek, remote: Proyek, pilih: Map<string, Pilihan>): Proyek {
  const L = urai(lokal);
  const R = urai(remote);
  const petaL = new Map(L.map((x) => [x.kunci, x]));
  const petaR = new Map(R.map((x) => [x.kunci, x]));
  const urutan = [...L.map((x) => x.kunci), ...R.filter((x) => !petaL.has(x.kunci)).map((x) => x.kunci)];
  const hasil = new Map<string, unknown>();
  for (const k of urutan) {
    const l = petaL.get(k);
    const r = petaR.get(k);
    const dipilih = l && r && l.ciri === r.ciri ? l : pilih.get(k) === 'remote' ? r : pilih.get(k) === 'lokal' ? l : l ?? r;
    // pilihan 'remote' pada unit yang tidak ada di GitHub berarti unit itu dihapus; sebaliknya untuk 'lokal'
    if (dipilih) hasil.set(k, structuredClone(dipilih.nilai));
  }
  const ambil = <T>(awalan: string): T[] => [...hasil.entries()].filter(([k]) => k.startsWith(awalan)).map(([, v]) => v as T);
  const p = structuredClone(lokal);
  const meta = hasil.get('meta') as { nama: string; versiSkemaData: number } | undefined;
  if (meta) {
    p.nama = meta.nama;
    p.versiSkemaData = meta.versiSkemaData;
  }
  p.skema = ambil<Skema>('skema:');
  const def = hasil.get('mingguan:default') as { polaReguler: Proyek['polaReguler']; polaRegulerId: string | null; polaRegulerNama: string | null } | undefined;
  if (def) {
    p.polaReguler = def.polaReguler;
    if (def.polaRegulerId) p.polaRegulerId = def.polaRegulerId;
    else delete p.polaRegulerId;
    if (def.polaRegulerNama) p.polaRegulerNama = def.polaRegulerNama;
    else delete p.polaRegulerNama;
  }
  if (hasil.has('mingguan:manual')) p.penggantiManual = (hasil.get('mingguan:manual') as Proyek['penggantiManual']) ?? null;
  p.polaLain = ambil<PolaBernama>('mingguan:').filter((q) => q && typeof q === 'object' && 'id' in q && 'pola' in q && !('polaReguler' in q));
  p.kalender = ambil<Kegiatan>('kalender:');
  p.semesters = ambil<Semester>('semester:');
  p.master = { guru: ambil<Guru>('guru:'), mapel: ambil<Mapel>('mapel:'), rombel: ambil<Rombel>('rombel:'), ruang: ambil<Ruang>('ruang:') };
  p.beban = ambil<Beban>('beban:');
  p.aturan = ambil<Aturan>('aturan:');
  p.diterima = ambil<PenerimaanMasalah>('diterima:');
  p.versi = ambil<VersiJadwal>('jadwal:');
  return p;
}

/** Jumlah perbedaan per bagian dan status, untuk ringkasan. */
export function ringkas(beda: Perbedaan[]): { bagian: Bagian; lokal: number; remote: number; bentrok: number; beda: number }[] {
  return URUT_BAGIAN.map((bagian) => {
    const x = beda.filter((b) => b.bagian === bagian);
    return { bagian, lokal: x.filter((b) => b.status === 'lokal').length, remote: x.filter((b) => b.status === 'remote').length, bentrok: x.filter((b) => b.status === 'bentrok').length, beda: x.filter((b) => b.status === 'beda').length };
  }).filter((r) => r.lokal + r.remote + r.bentrok + r.beda > 0);
}
