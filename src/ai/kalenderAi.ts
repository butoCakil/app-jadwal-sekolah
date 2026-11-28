import type { JenisKegiatan, Kegiatan, Proyek } from '../model/tipe';
import { NAMA_HARI } from '../model/tipe';
import { hariPekan } from '../model/kalender';
import { daftarSemester, semesterPada } from '../model/simpul';
import type { HasilTerapkan } from './instruksi';

/**
 * Operasi kalender untuk asisten AI: menambah, mengubah, menggeser, dan menghapus kegiatan atau agenda.
 * Sama seperti operasi beban: AI hanya mengusulkan, kode memvalidasi (tanggal, nama kegiatan, kode kelas) lalu menerapkan
 * dengan cara yang sama dengan dialog Kalender. Tanggal selalu dihitung oleh kode (mis. "diundur 1 minggu" = hari: 7),
 * bukan oleh AI.
 */

export const DAFTAR_JENIS: readonly JenisKegiatan[] = ['TKA', 'PKL', 'ASAS', 'ASAJ', 'UKK', 'ujian', 'upacara', 'rapor', 'libur', 'lain'];

/** Kelas yang tidak aktif: menurut kode kelas dan/atau tingkat. */
export interface KelasTidakAktif {
  rombel?: string[];
  tingkat?: string[];
}

export type OpKalender =
  | { op: 'tambahKegiatan'; nama: string; jenis: JenisKegiatan; mulai: string; selesai?: string; agenda?: boolean; untuk?: string; hari?: string[]; catatan?: string; tidakAktif?: KelasTidakAktif }
  | { op: 'ubahKegiatan'; kegiatan: string; nama?: string; jenis?: JenisKegiatan; mulai?: string; selesai?: string; untuk?: string; hari?: string[]; catatan?: string; tidakAktif?: KelasTidakAktif }
  | { op: 'geserKegiatan'; kegiatan: string; hari?: number; mulai?: string; selesai?: string }
  | { op: 'hapusKegiatan'; kegiatan: string };

export const DAFTAR_OP_KALENDER = ['tambahKegiatan', 'ubahKegiatan', 'geserKegiatan', 'hapusKegiatan'] as const;

// ------------------------------------------------------------------------------------------------------ tanggal

const HARI_PENDEK = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

export function tanggalSah(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  try {
    hariPekan(s);
    return true;
  } catch {
    return false;
  }
}

/** "Sen 2026-11-30": nama hari dihitung kode supaya AI tidak perlu menebak hari. */
export function labelTanggal(t: string): string {
  try {
    return `${HARI_PENDEK[hariPekan(t)]} ${t}`;
  } catch {
    return t;
  }
}

const utc = (t: string) => {
  const [y, m, d] = t.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
};

export function geserTanggal(t: string, n: number): string {
  const dt = new Date(utc(t) + n * 86400000);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

export const selisihHari = (a: string, b: string): number => Math.round((utc(b) - utc(a)) / 86400000);

export const labelRentang = (mulai: string, selesai: string): string => (mulai === selesai ? labelTanggal(mulai) : `${labelTanggal(mulai)} – ${labelTanggal(selesai)}`);

// -------------------------------------------------------------------------------------------------- penguraian

const adaObjek = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const daftarTeks = (x: unknown): string[] | null => (Array.isArray(x) && x.every((v) => typeof v === 'string' && v.trim() !== '') ? x.map((v) => (v as string).trim()) : null);

/** Mengurai satu instruksi kalender; bentuk yang salah dilaporkan ke `galat`, tidak ditebak. */
export function uraiKalender(x: Record<string, unknown>, t: string, galat: string[]): OpKalender | undefined {
  const op = String(x.op);
  const awal = galat.length;
  const tolak = (boleh: string[]) => {
    for (const k of Object.keys(x)) if (k !== 'op' && k !== 'alasan' && !boleh.includes(k)) galat.push(`${t} (${op}): bidang tidak dikenal "${k}".`);
  };
  const tgl = (k: string, wajib: boolean): string | undefined => {
    const v = x[k];
    if (v === undefined) {
      if (wajib) galat.push(`${t} (${op}): ${k} wajib (YYYY-MM-DD).`);
      return undefined;
    }
    if (!tanggalSah(v)) {
      galat.push(`${t} (${op}): ${k} bukan tanggal yang sah (YYYY-MM-DD): ${JSON.stringify(v)}.`);
      return undefined;
    }
    return v;
  };
  const teks = (k: string, wajib: boolean): string | undefined => {
    const v = x[k];
    if (v === undefined) {
      if (wajib) galat.push(`${t} (${op}): ${k} wajib.`);
      return undefined;
    }
    if (typeof v !== 'string' || !v.trim()) {
      galat.push(`${t} (${op}): ${k} harus teks tidak kosong.`);
      return undefined;
    }
    return v.trim();
  };
  const jenis = (wajib: boolean): JenisKegiatan | undefined => {
    const v = x.jenis;
    if (v === undefined) {
      if (wajib) galat.push(`${t} (${op}): jenis wajib (${DAFTAR_JENIS.join(', ')}).`);
      return undefined;
    }
    if (typeof v !== 'string' || !DAFTAR_JENIS.includes(v as JenisKegiatan)) {
      galat.push(`${t} (${op}): jenis tidak dikenal ${JSON.stringify(v)} (yang ada: ${DAFTAR_JENIS.join(', ')}).`);
      return undefined;
    }
    return v as JenisKegiatan;
  };
  const hari = (): string[] | undefined => {
    if (x.hari === undefined) return undefined;
    const d = daftarTeks(x.hari);
    if (!d) galat.push(`${t} (${op}): hari harus daftar nama hari.`);
    return d ?? undefined;
  };
  const tdk = (): KelasTidakAktif | undefined => {
    const v = x.tidakAktif;
    if (v === undefined) return undefined;
    if (!adaObjek(v)) {
      galat.push(`${t} (${op}): tidakAktif harus objek {"rombel":[...],"tingkat":[...]}.`);
      return undefined;
    }
    const h: KelasTidakAktif = {};
    for (const k of Object.keys(v)) {
      if (k !== 'rombel' && k !== 'tingkat') {
        galat.push(`${t} (${op}): bidang tidakAktif tidak dikenal "${k}".`);
        continue;
      }
      const d = daftarTeks(v[k]);
      if (!d) galat.push(`${t} (${op}): tidakAktif.${k} harus daftar teks.`);
      else h[k] = d;
    }
    return h;
  };
  let hasil: OpKalender | undefined;
  switch (op) {
    case 'tambahKegiatan': {
      tolak(['nama', 'jenis', 'mulai', 'selesai', 'agenda', 'untuk', 'hari', 'catatan', 'tidakAktif']);
      const nama = teks('nama', true);
      const j = jenis(true);
      const mulai = tgl('mulai', true);
      const selesai = tgl('selesai', false);
      if (x.agenda !== undefined && typeof x.agenda !== 'boolean') galat.push(`${t} (${op}): agenda harus true atau false.`);
      const untuk = teks('untuk', false);
      const catatan = teks('catatan', false);
      const h = hari();
      const kelas = tdk();
      if (nama && j && mulai && galat.length === awal)
        hasil = { op, nama, jenis: j, mulai, ...(selesai ? { selesai } : {}), ...(x.agenda === true ? { agenda: true } : {}), ...(untuk ? { untuk } : {}), ...(h ? { hari: h } : {}), ...(catatan ? { catatan } : {}), ...(kelas ? { tidakAktif: kelas } : {}) };
      break;
    }
    case 'ubahKegiatan': {
      tolak(['kegiatan', 'nama', 'jenis', 'mulai', 'selesai', 'untuk', 'hari', 'catatan', 'tidakAktif']);
      const kegiatan = teks('kegiatan', true);
      const nama = teks('nama', false);
      const j = jenis(false);
      const mulai = tgl('mulai', false);
      const selesai = tgl('selesai', false);
      const untuk = teks('untuk', false);
      const catatan = teks('catatan', false);
      const h = hari();
      const kelas = tdk();
      const ada = [nama, j, mulai, selesai, untuk, catatan, h, kelas].some((v) => v !== undefined);
      if (!ada && galat.length === awal) galat.push(`${t} (${op}): tidak ada yang diubah (isi minimal satu dari nama, jenis, mulai, selesai, untuk, hari, catatan, tidakAktif).`);
      if (kegiatan && ada && galat.length === awal)
        hasil = { op, kegiatan, ...(nama ? { nama } : {}), ...(j ? { jenis: j } : {}), ...(mulai ? { mulai } : {}), ...(selesai ? { selesai } : {}), ...(untuk ? { untuk } : {}), ...(h ? { hari: h } : {}), ...(catatan ? { catatan } : {}), ...(kelas ? { tidakAktif: kelas } : {}) };
      break;
    }
    case 'geserKegiatan': {
      tolak(['kegiatan', 'hari', 'mulai', 'selesai']);
      const kegiatan = teks('kegiatan', true);
      const mulai = tgl('mulai', false);
      const selesai = tgl('selesai', false);
      const n = x.hari;
      if (n !== undefined && !(typeof n === 'number' && Number.isInteger(n) && n !== 0 && Math.abs(n) <= 366)) galat.push(`${t} (${op}): hari harus bilangan bulat bukan nol (maksimal 366), mis. 7 = mundur satu pekan, -7 = maju satu pekan.`);
      if ((n === undefined) === (mulai === undefined)) galat.push(`${t} (${op}): isi tepat satu dari hari (jumlah hari) atau mulai (tanggal mulai baru).`);
      if (selesai !== undefined && mulai === undefined) galat.push(`${t} (${op}): selesai hanya boleh bersama mulai.`);
      if (kegiatan && galat.length === awal) hasil = { op, kegiatan, ...(typeof n === 'number' ? { hari: n } : {}), ...(mulai ? { mulai } : {}), ...(selesai ? { selesai } : {}) };
      break;
    }
    case 'hapusKegiatan': {
      tolak(['kegiatan']);
      const kegiatan = teks('kegiatan', true);
      if (kegiatan && galat.length === awal) hasil = { op, kegiatan };
      break;
    }
  }
  return hasil;
}

// ---------------------------------------------------------------------------------------------------- penerapan

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
const idBaru = (p: Proyek, awalan: string): string => {
  for (;;) {
    const id = `${awalan}${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
    if (!p.kalender.some((k) => k.id === id) && !p.versi.some((v) => v.id === id)) return id;
  }
};

const ringkasKegiatan = (g: Pick<Kegiatan, 'nama' | 'mulai' | 'selesai'>) => `“${g.nama}” ${labelRentang(g.mulai, g.selesai)}`;

/** Kegiatan menurut id (tepat), nama (tepat), atau bagian nama yang hanya cocok dengan satu kegiatan. Yang meragukan dilaporkan, tidak ditebak. */
export function cariKegiatan(p: Proyek, ref: string, galat: string[]): Kegiatan | undefined {
  const r = norm(ref);
  const persis = p.kalender.filter((k) => norm(k.id) === r);
  if (persis.length === 1) return persis[0];
  const lain = (daftar: Kegiatan[]) => daftar.map((k) => `${k.id} (${k.nama}, ${k.mulai})`).join('; ');
  const nama = p.kalender.filter((k) => norm(k.nama) === r);
  if (nama.length === 1) return nama[0];
  if (nama.length > 1) {
    galat.push(`Kegiatan "${ref}" ambigu, ada ${nama.length}: ${lain(nama)}. Sebut id-nya.`);
    return undefined;
  }
  const sebagian = p.kalender.filter((k) => norm(k.nama).includes(r));
  if (sebagian.length === 1) return sebagian[0];
  if (sebagian.length > 1) {
    galat.push(`Kegiatan "${ref}" ambigu, cocok dengan ${sebagian.length}: ${lain(sebagian.slice(0, 8))}${sebagian.length > 8 ? ' …' : ''}. Sebut id-nya.`);
    return undefined;
  }
  galat.push(`Kegiatan "${ref}" tidak ditemukan di kalender.`);
  return undefined;
}

function hariKeIndeks(nama: string, jumlah: number): number {
  const bersih = (s: string) => norm(s).replace(/['’]/g, '');
  const i = NAMA_HARI.findIndex((h) => bersih(h) === bersih(nama));
  return i >= 0 && i < jumlah ? i : -1;
}

/** Kode kelas dan tingkat menjadi id rombel (tanpa duplikat). */
function rombelDari(p: Proyek, s: KelasTidakAktif, t: string, galat: string[]): string[] {
  const ids = new Set<string>();
  for (const k of s.rombel ?? []) {
    const r = p.master.rombel.find((x) => norm(x.kode) === norm(k));
    if (r) ids.add(r.id);
    else galat.push(`${t}: kode kelas tidak dikenal "${k}".`);
  }
  for (const tk of s.tingkat ?? []) {
    const T = tk.trim().toUpperCase();
    const cocok = p.master.rombel.filter((r) => r.tingkat === T);
    if (!['X', 'XI', 'XII'].includes(T) || cocok.length === 0) galat.push(`${t}: tingkat tidak dikenal "${tk}" (X, XI, atau XII).`);
    for (const r of cocok) ids.add(r.id);
  }
  return [...ids];
}

const kodeKelas = (p: Proyek, ids: string[]) => ids.map((i) => p.master.rombel.find((r) => r.id === i)?.kode ?? '?').join(', ') || '—';

/** Menerapkan satu instruksi kalender pada `p` (diubah di tempat). Galat dan peringatan dikumpulkan di `hasil`. */
export function terapkanKalender(p: Proyek, ins: OpKalender, t: string, hasil: HasilTerapkan): void {
  const n = p.polaReguler.length;
  const cekRentang = (mulai: string, selesai: string) => {
    if (selesai < mulai) hasil.galat.push(`${t}: tanggal selesai (${selesai}) lebih awal dari mulai (${mulai}).`);
    else if (!semesterPada(p, mulai)) hasil.peringatan.push(`${t}: ${labelTanggal(mulai)} berada di luar semester mana pun, jadwalnya tidak akan tampil.`);
  };
  switch (ins.op) {
    case 'tambahKegiatan': {
      const mulai = ins.mulai;
      const selesai = ins.selesai ?? ins.mulai;
      const awalGalat = hasil.galat.length;
      cekRentang(mulai, selesai);
      if (p.kalender.some((k) => norm(k.nama) === norm(ins.nama) && k.mulai === mulai && k.selesai === selesai)) hasil.galat.push(`${t}: kegiatan “${ins.nama}” pada ${labelRentang(mulai, selesai)} sudah ada.`);
      const agenda = ins.agenda === true;
      const libur = ins.jenis === 'libur' || agenda;
      const hari = (ins.hari ?? []).map((h) => {
        const i = hariKeIndeks(h, n);
        if (i < 0) hasil.galat.push(`${t}: hari tidak dikenal atau di luar hari kerja: "${h}".`);
        return i;
      });
      if (libur && hari.length) hasil.galat.push(`${t}: "hari" tidak berlaku untuk agenda atau libur.`);
      if (libur && ins.tidakAktif) hasil.galat.push(`${t}: "tidakAktif" tidak berlaku untuk agenda atau libur (tidak mengubah kelas aktif).`);
      const tambahan = ins.tidakAktif ? rombelDari(p, ins.tidakAktif, t, hasil.galat) : [];
      if (hasil.galat.length > awalGalat) return;
      const g: Kegiatan = { id: idBaru(p, 'k'), nama: ins.nama, jenis: ins.jenis, mulai, selesai, rombelTidakAktif: [] };
      if (agenda) g.agenda = true;
      if (ins.untuk) g.untuk = ins.untuk;
      if (ins.catatan) g.catatan = ins.catatan;
      if (!libur) {
        // seperti dialog Kalender: versi jadwal sendiri yang mula-mula kosong, semua kelas ikut induk; kelas yang tidak aktif sepanjang semester tetap tidak aktif
        const versiId = idBaru(p, 'v');
        p.versi.push({ id: versiId, nama: ins.nama, jenis: 'varian', slots: [] });
        g.versiId = versiId;
        g.rombelTerdampak = [];
        g.rombelTidakAktif = [...new Set([...(semesterPada(p, mulai)?.rombelTidakAktif ?? []), ...tambahan])];
        const unik = [...new Set(hari)].sort((a, b) => a - b);
        if (unik.length && unik.length < n) g.hariBerlaku = unik;
      }
      p.kalender.push(g);
      const sifat = agenda ? 'agenda (tidak mengubah jadwal)' : libur ? 'libur' : 'kegiatan (jadwal khusus, kelas ikut induk)';
      hasil.perubahan.push({ teks: `Kegiatan baru: ${ringkasKegiatan(g)} · ${ins.jenis} · ${sifat}${g.hariBerlaku ? ` · hari ${g.hariBerlaku.map((h) => NAMA_HARI[h]).join('/')}` : ''}${tambahan.length ? ` · kelas tidak aktif: ${kodeKelas(p, tambahan)}` : ''}` });
      return;
    }
    case 'ubahKegiatan': {
      const g = cariKegiatan(p, ins.kegiatan, hasil.galat);
      if (!g) return;
      const awalGalat = hasil.galat.length;
      const lama = ringkasKegiatan(g);
      const mulai = ins.mulai ?? g.mulai;
      const selesai = ins.selesai ?? g.selesai;
      if (ins.mulai || ins.selesai) cekRentang(mulai, selesai);
      const jenis = ins.jenis ?? g.jenis;
      if (ins.jenis && !g.agenda && (ins.jenis === 'libur') !== (g.jenis === 'libur')) hasil.galat.push(`${t}: jenis libur mengubah kelas aktif dan jadwal kegiatan; ubah dari tab Kalender, atau hapus lalu buat ulang.`);
      const libur = jenis === 'libur' || !!g.agenda;
      if (libur && (ins.hari || ins.tidakAktif)) hasil.galat.push(`${t}: "hari" dan "tidakAktif" tidak berlaku untuk agenda atau libur.`);
      const hari = ins.hari?.map((h) => {
        const i = hariKeIndeks(h, n);
        if (i < 0) hasil.galat.push(`${t}: hari tidak dikenal atau di luar hari kerja: "${h}".`);
        return i;
      });
      const kelas = ins.tidakAktif ? rombelDari(p, ins.tidakAktif, t, hasil.galat) : undefined;
      if (hasil.galat.length > awalGalat) return;
      const bagian: string[] = [];
      if (ins.nama && ins.nama !== g.nama) {
        bagian.push(`nama “${g.nama}” → “${ins.nama}”`);
        const v = g.versiId ? p.versi.find((x) => x.id === g.versiId) : undefined;
        if (v && v.jenis !== 'reguler') v.nama = ins.nama;
        g.nama = ins.nama;
      }
      if (ins.jenis && ins.jenis !== g.jenis) {
        bagian.push(`jenis ${g.jenis} → ${ins.jenis}`);
        g.jenis = ins.jenis;
      }
      if (mulai !== g.mulai || selesai !== g.selesai) {
        bagian.push(`tanggal ${labelRentang(g.mulai, g.selesai)} → ${labelRentang(mulai, selesai)}`);
        const luar = (g.pengawas ?? []).filter((x) => x.tanggal < mulai || x.tanggal > selesai).length;
        if (luar) hasil.peringatan.push(`${t}: ${luar} tugas mengawas jatuh di luar rentang baru (tanggalnya tidak ikut berubah). Untuk memindahkan semuanya sekaligus, pakai geser.`);
        g.mulai = mulai;
        g.selesai = selesai;
      }
      if (ins.untuk !== undefined && ins.untuk !== (g.untuk ?? '')) {
        bagian.push(`untuk “${g.untuk ?? ''}” → “${ins.untuk}”`);
        g.untuk = ins.untuk;
      }
      if (ins.catatan !== undefined && ins.catatan !== (g.catatan ?? '')) {
        bagian.push('catatan diubah');
        g.catatan = ins.catatan;
      }
      if (hari) {
        const unik = [...new Set(hari)].sort((a, b) => a - b);
        if (unik.length && unik.length < n) g.hariBerlaku = unik;
        else delete g.hariBerlaku;
        bagian.push(`hari berlaku: ${g.hariBerlaku ? g.hariBerlaku.map((h) => NAMA_HARI[h]).join('/') : 'setiap hari kerja'}`);
      }
      if (kelas) {
        bagian.push(`kelas tidak aktif ${kodeKelas(p, g.rombelTidakAktif)} → ${kodeKelas(p, kelas)}`);
        g.rombelTidakAktif = kelas;
      }
      if (bagian.length === 0) {
        hasil.peringatan.push(`${t}: ${lama} sudah sesuai, tidak ada yang berubah.`);
        return;
      }
      hasil.perubahan.push({ teks: `${lama}: ${bagian.join('; ')}` });
      return;
    }
    case 'geserKegiatan': {
      const g = cariKegiatan(p, ins.kegiatan, hasil.galat);
      if (!g) return;
      const awalGalat = hasil.galat.length;
      const selisih = ins.hari ?? selisihHari(g.mulai, ins.mulai as string);
      const mulai = geserTanggal(g.mulai, selisih);
      const selesai = ins.selesai ?? geserTanggal(g.selesai, selisih);
      if (selisih === 0 && selesai === g.selesai) {
        hasil.peringatan.push(`${t}: ${ringkasKegiatan(g)} sudah berada pada tanggal itu, tidak ada yang berubah.`);
        return;
      }
      cekRentang(mulai, selesai);
      if (hasil.galat.length > awalGalat) return;
      const lama = ringkasKegiatan(g);
      const semLama = semesterPada(p, g.mulai);
      if (!g.semesterId && semLama && semesterPada(p, mulai)?.id !== semLama.id) hasil.peringatan.push(`${t}: tanggal baru pindah ke semester lain; beban dan jadwal induk yang dipakai kegiatan ikut berganti.`);
      if (g.semesterId) {
        const sem = daftarSemester(p).find((s) => s.id === g.semesterId);
        if (sem && (mulai < sem.mulai || selesai > sem.selesai)) hasil.peringatan.push(`${t}: tanggal baru melewati batas semester ${sem.nama} (${sem.mulai} s/d ${sem.selesai}).`);
      }
      const catatan: string[] = [];
      if (g.pengawas?.length) {
        g.pengawas = g.pengawas.map((x) => ({ ...x, tanggal: geserTanggal(x.tanggal, selisih) }));
        catatan.push(`${g.pengawas.length} tugas mengawas ikut digeser`);
        const luar = g.pengawas.filter((x) => x.tanggal < mulai || x.tanggal > selesai).length;
        if (luar) hasil.peringatan.push(`${t}: ${luar} tugas mengawas berada di luar rentang baru (rentang diubah tidak sama panjang).`);
      }
      if (g.versiId) {
        const jumlah = p.versi.find((v) => v.id === g.versiId)?.slots.length ?? 0;
        if (jumlah) catatan.push(`jadwal khusus kegiatan (${jumlah} slot) ikut`);
      }
      if (!g.agenda && selisih % 7 !== 0) hasil.peringatan.push(`${t}: pergeseran ${selisih} hari bukan kelipatan 7, sehingga nama hari tiap tanggal berubah. Jadwal khusus mengikuti nama hari (bukan tanggal), jadi periksa hasilnya di Kalender; hari berlaku dan kunci ruang tidak ikut berubah.`);
      g.mulai = mulai;
      g.selesai = selesai;
      hasil.perubahan.push({ teks: `${lama} → ${labelRentang(mulai, selesai)} (${selisih > 0 ? '+' : ''}${selisih} hari${catatan.length ? `; ${catatan.join('; ')}` : ''})` });
      return;
    }
    case 'hapusKegiatan': {
      const g = cariKegiatan(p, ins.kegiatan, hasil.galat);
      if (!g) return;
      const slot = g.versiId ? (p.versi.find((v) => v.id === g.versiId)?.slots.length ?? 0) : 0;
      if (slot) hasil.peringatan.push(`${t}: jadwal khusus “${g.nama}” (${slot} slot) tidak terpakai lagi setelah kegiatan dihapus (versinya tetap tersimpan).`);
      if ((g.pengawas ?? []).length) hasil.peringatan.push(`${t}: ${g.pengawas?.length} tugas mengawas ikut terhapus.`);
      hasil.perubahan.push({ teks: `Kegiatan dihapus: ${ringkasKegiatan(g)} · ${g.agenda ? 'agenda' : g.jenis}` });
      p.kalender = p.kalender.filter((k) => k.id !== g.id);
      if (p.periodeAktifId === g.id) delete p.periodeAktifId;
      return;
    }
  }
}
