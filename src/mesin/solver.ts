import type { Beban, Proyek, Slot } from '../model/tipe';
import { kapasitasKbm } from '../model/skema';
import { jpRombel } from '../model/jp';
import { JENIS_RUANG_BAWAAN } from './penempatan';
import { ruangDilarang } from './validator';
import type { AturanPekan } from '../model/aturanKegiatan';

/**
 * Penyusun jadwal otomatis (tahap 4).
 *
 * Satu beban dipecah menjadi pertemuan (chunk) berurutan di satu hari (`pola`, atau pecahan bawaan). Beban satu kelompok
 * paralel di rombel yang sama menjadi satu unit yang berjalan bersamaan. Aturan wajib (tidak pernah dilanggar): guru, rombel,
 * dan ruang tidak ganda; guru tidak tersedia; ruang terlarang; kapasitas jam per hari. Yang tidak muat dilaporkan sebagai sisa
 * beserta alasannya, tidak dipaksakan.
 *
 * Cara kerja: penempatan serakah berurutan dari yang tersulit, perbaikan dengan menggeser satu penghalang (ejeksi), pemecahan
 * pertemuan bila tidak muat, diulang dengan urutan acak; lalu penempatan ulang acak untuk menekan biaya lunak (lubang jam
 * rombel dan guru, pertemuan beban yang sama di hari yang sama, pertemuan yang terpotong istirahat, jam akhir hari).
 */

const LEBAR = 16;
/** biaya memindahkan pertemuan dari posisi jadwal awalnya (agar hanya yang perlu yang bergeser) */
const BIAYA_GESER_AWAL = 40;

export interface OpsiSusun {
  /** id skema Senin..Jumat (null = tidak ada KBM). Menentukan kapasitas jam per hari. */
  skemaPerHari: (string | null)[];
  /** Slot yang dipertahankan; sisa JP tiap beban dicarikan tempat di sekitarnya. */
  tetap?: Slot[];
  /** Aturan kegiatan: ruang terkunci dianggap terpakai sepanjang hari itu, guru yang mengawas dianggap tidak tersedia pada JP-nya. */
  aturan?: AturanPekan;
  /**
   * Jadwal awal (mis. jadwal induk) yang dipakai sebagai titik mulai: tiap pertemuan ditempatkan di posisi semula bila masih sah
   * menurut aturan; yang tidak sah diganti. Pertemuan yang menjauh dari posisi awal dikenai biaya, sehingga yang bergeser hanya
   * yang perlu. Beda dengan `tetap`: semuanya boleh digeser.
   */
  awal?: Slot[];
  /**
   * true = ruang prioritas beban hanya pilihan utama: bila semuanya terpakai atau terkunci, boleh memakai ruang lain yang diizinkan
   * (menurut jenis ruang mapel, tanpa ruang terlarang), dengan biaya. Bawaan false (ruang prioritas wajib).
   * 'bilaPerlu' = disusun dulu dengan ruang prioritas wajib; hanya bila ada JP yang tidak muat, disusun lagi dengan ruang cadangan
   * (mulai dari hasil pertama, biaya cadangan 60 kecuali ditentukan) dan hasil yang lebih penuh dipakai.
   */
  prioritasLunak?: boolean | 'bilaPerlu';
  /**
   * Biaya tiap pertemuan yang memakai ruang cadangan (hanya berlaku bila `prioritasLunak`). Makin besar makin ketat: ruang cadangan
   * dipakai hanya bila tidak ada pilihan lain. Bawaan 8 (kegiatan: ruang prioritas sekadar pilihan utama).
   */
  biayaRuangCadangan?: number;
  /** Kedalaman rantai geser saat menempatkan pertemuan yang buntu (1 = menggeser penghalang langsung). Bawaan 1. */
  kedalaman?: number;
  /** Batas waktu total (milidetik), keras: tidak dilewati (kecuali satu langkah terakhir). Bawaan 8000. */
  batasMs?: number;
  /**
   * Mode otomatis: berhenti bila selama sekian milidetik tidak ada perbaikan (JP tertempatkan bertambah atau biaya turun),
   * walau `batasMs` belum habis. `batasMs` tetap menjadi batas atas.
   */
  sabarMs?: number;
  /** Sertakan salinan jadwal terbaik sementara pada laporan kemajuan (paling sering tiap 1,5 detik), agar penyusunan bisa dihentikan dan hasil terbaiknya dipakai. */
  sertakanSlot?: boolean;
  benih?: number;
  kemajuan?: (m: Kemajuan) => void;
}

export interface Kemajuan {
  tahap: 'awal' | 'perbaiki' | 'selesai';
  terjadwal: number;
  total: number;
  biaya: number;
  ms: number;
  /** jadwal sementara (hanya bila `sertakanSlot`) */
  slots?: Slot[];
}

export interface Sisa {
  bebanId: string;
  jpSisa: number;
  alasan: string;
}

export interface HasilSusun {
  slots: Slot[];
  sisa: Sisa[];
  /** JP tatap muka yang berhasil ditempatkan (termasuk slot `tetap`) */
  terjadwal: number;
  total: number;
  biaya: number;
  peringatan: string[];
  ms: number;
}

/** Memecah JP beban menjadi pertemuan. `pola` dipakai bila jumlahnya sama dengan JP. */
export function pecahJp(jp: number, pola?: number[]): number[] {
  if (pola && pola.length > 0 && pola.every((x) => Number.isInteger(x) && x > 0) && pola.reduce((a, b) => a + b, 0) === jp) return [...pola];
  const hasil: number[] = [];
  let sisa = jp;
  if (sisa >= 8 && sisa % 4 === 0) return Array<number>(sisa / 4).fill(4);
  while (sisa >= 8) {
    hasil.push(4);
    sisa -= 4;
  }
  const kecil: Record<number, number[]> = { 1: [1], 2: [2], 3: [3], 4: [2, 2], 5: [3, 2], 6: [3, 3], 7: [4, 3] };
  return [...hasil, ...(kecil[sisa] ?? [])];
}

function acak(benih: number): () => number {
  let a = benih >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Anggota {
  beban: Beban;
  /** indeks ruang yang boleh dipakai, berurutan; [-1] bila master tidak punya ruang */
  calon: number[];
  /** banyaknya ruang pertama di `calon` yang termasuk pilihan utama; ruang sesudahnya hanya cadangan (berbiaya) */
  prio: number;
}
interface Unit {
  id: number;
  anggota: Anggota[];
  rombel: number;
  guru: number[];
  /** JP unit (satu kelompok paralel dihitung sekali) */
  jp: number;
  bebanIds: string[];
}
interface Chunk {
  id: number;
  unit: Unit;
  size: number;
  hari: number;
  mulai: number;
  ruang: number[];
  /** posisi pada jadwal awal (bila ada) */
  awal?: { h: number; m: number };
}
interface Potret {
  unit: number;
  size: number;
  hari: number;
  mulai: number;
  ruang: number[];
  awal?: { h: number; m: number };
}

class Mesin {
  readonly units: Unit[] = [];
  readonly cap: number[];
  readonly istirahat: Set<number>[];
  chunks: Chunk[] = [];
  private cacahChunk = 0;
  readonly guruOcc: Int32Array[];
  readonly rombelOcc: Int32Array[];
  readonly ruangOcc: Int32Array[];
  readonly guruTutup: Uint8Array[];
  /** subset guruTutup yang berasal dari tugas mengawas (untuk alasan sisa) */
  readonly guruMengawas: Uint8Array[];
  /** sel ruang yang dikunci kegiatan (untuk alasan sisa) */
  readonly ruangKunci: Uint8Array[];
  /** [rombel][hari] = 1 bila rombel belajar tanpa ruang pada hari itu (PJJ) */
  readonly tanpaRuang: Uint8Array[];
  readonly bersama: boolean[];
  readonly kodeRuang: string[];
  readonly ruangIds: string[];
  readonly rombelKode: string[];
  readonly guruKode: string[];
  readonly tetap: Slot[] = [];
  readonly peringatan: string[] = [];
  jpTetap = 0;
  total = 0;
  readonly kedalaman: number;
  readonly biayaCadangan: number;

  /** jumlah hari kerja per pekan (dari panjang skemaPerHari) */
  readonly hari: number;

  constructor(readonly p: Proyek, opsi: OpsiSusun) {
    this.hari = opsi.skemaPerHari.length || 5;
    this.kedalaman = Math.max(1, Math.floor(opsi.kedalaman ?? 1));
    this.biayaCadangan = opsi.biayaRuangCadangan ?? 8;
    const HARI = this.hari;
    const skemaById = new Map(p.skema.map((s) => [s.id, s]));
    this.cap = opsi.skemaPerHari.map((id) => {
      const s = id ? skemaById.get(id) : undefined;
      return s ? Math.min(kapasitasKbm(s), LEBAR - 2) : 0;
    });
    this.istirahat = opsi.skemaPerHari.map((id) => {
      const s = id ? skemaById.get(id) : undefined;
      const hasil = new Set<number>();
      let n = 0;
      for (const b of s?.baris ?? []) {
        if (b.tipe === 'kbm') n += 1;
        else if (b.tipe === 'istirahat' && n > 0) hasil.add(n);
      }
      return hasil;
    });
    const guruIdx = new Map(p.master.guru.map((g, i) => [g.id, i]));
    const rombelIdx = new Map(p.master.rombel.map((r, i) => [r.id, i]));
    const ruangIdx = new Map(p.master.ruang.map((r, i) => [r.id, i]));
    this.ruangIds = p.master.ruang.map((r) => r.id);
    this.kodeRuang = p.master.ruang.map((r) => r.kode);
    this.rombelKode = p.master.rombel.map((r) => r.kode);
    this.guruKode = p.master.guru.map((g) => g.kode);
    this.bersama = p.master.ruang.map((r) => !!r.bersama);
    const baru = (n: number) => Array.from({ length: n }, () => new Int32Array(HARI * LEBAR).fill(-1));
    this.guruOcc = baru(p.master.guru.length);
    this.rombelOcc = baru(p.master.rombel.length);
    this.ruangOcc = baru(p.master.ruang.length);
    this.guruTutup = p.master.guru.map(() => new Uint8Array(HARI * LEBAR));
    this.guruMengawas = p.master.guru.map(() => new Uint8Array(HARI * LEBAR));
    this.ruangKunci = p.master.ruang.map(() => new Uint8Array(HARI * LEBAR));
    this.tanpaRuang = p.master.rombel.map(() => new Uint8Array(HARI));
    for (const t of opsi.aturan?.tanpaRuang ?? []) {
      const r = rombelIdx.get(t.rombelId);
      if (r !== undefined && t.hari >= 0 && t.hari < HARI) (this.tanpaRuang[r] as Uint8Array)[t.hari] = 1;
    }
    for (const a of p.aturan) {
      if (a.jenis !== 'guruTidakTersedia') continue;
      const g = guruIdx.get(a.guruId);
      if (g === undefined || a.hari < 0 || a.hari >= HARI) continue;
      const jams = a.jam.length ? a.jam : Array.from({ length: LEBAR }, (_, i) => i);
      for (const j of jams) if (j >= 0 && j < LEBAR) (this.guruTutup[g] as Uint8Array)[a.hari * LEBAR + j] = 1;
    }

    for (const k of opsi.aturan?.kunci ?? []) {
      const u = ruangIdx.get(k.ruangId);
      if (u === undefined || k.hari < 0 || k.hari >= HARI) continue;
      const jams = k.jam ?? Array.from({ length: LEBAR }, (_, i) => i);
      for (const j of jams) {
        if (j < 0 || j >= LEBAR) continue;
        (this.ruangOcc[u] as Int32Array)[k.hari * LEBAR + j] = -2;
        (this.ruangKunci[u] as Uint8Array)[k.hari * LEBAR + j] = 1;
      }
    }
    for (const t of opsi.aturan?.pengawas ?? []) {
      const g = guruIdx.get(t.guruId);
      if (g === undefined || t.hari < 0 || t.hari >= HARI) continue;
      for (const j of t.jam) {
        if (j < 0 || j >= LEBAR) continue;
        (this.guruTutup[g] as Uint8Array)[t.hari * LEBAR + j] = 1;
        (this.guruMengawas[g] as Uint8Array)[t.hari * LEBAR + j] = 1;
      }
    }

    // slot tetap menempati sumber daya lebih dulu
    const bebanById = new Map(p.beban.map((b) => [b.id, b]));
    const sudah = new Map<string, number>();
    for (const s of opsi.tetap ?? []) {
      const b = bebanById.get(s.bebanId);
      if (!b || b.nonTatapMuka || s.hari < 0 || s.hari >= HARI || s.jam < 1 || s.jam >= LEBAR) continue;
      const g = [b.guruId, ...b.timGuruIds].map((x) => guruIdx.get(x)).filter((x): x is number => x !== undefined);
      const r = rombelIdx.get(b.rombelId);
      const u = ruangIdx.get(s.ruangId);
      const k = s.hari * LEBAR + s.jam;
      for (const gi of g) (this.guruOcc[gi] as Int32Array)[k] = -2;
      if (r !== undefined) (this.rombelOcc[r] as Int32Array)[k] = -2;
      if (u !== undefined && !this.bersama[u]) (this.ruangOcc[u] as Int32Array)[k] = -2;
      this.tetap.push(s);
      sudah.set(b.id, (sudah.get(b.id) ?? 0) + 1);
    }
    this.jpTetap = this.tetap.length;

    // jadwal awal: pertemuan berurutan per beban (hanya beban tanpa slot tetap)
    const awalPerBeban = new Map<string, { h: number; m: number; size: number; r: string }[]>();
    {
      const per = new Map<string, Slot[]>();
      for (const sl of opsi.awal ?? []) {
        if (sl.hari < 0 || sl.hari >= HARI || sl.jam < 1 || sl.jam >= LEBAR) continue;
        const l = per.get(sl.bebanId);
        if (l) l.push(sl);
        else per.set(sl.bebanId, [sl]);
      }
      for (const [bid, l] of per) {
        const runs: { h: number; m: number; size: number; r: string }[] = [];
        l.sort((a, b) => a.hari - b.hari || a.jam - b.jam);
        for (const sl of l) {
          const akhir = runs[runs.length - 1];
          // pertemuan berurutan di ruang yang sama = satu pertemuan
          if (akhir && akhir.h === sl.hari && akhir.m + akhir.size === sl.jam && akhir.r === sl.ruangId) akhir.size += 1;
          else runs.push({ h: sl.hari, m: sl.jam, size: 1, r: sl.ruangId });
        }
        awalPerBeban.set(bid, runs);
      }
    }

    // unit: kelompok paralel di rombel yang sama dijadikan satu
    const kelompok = new Map<string, Beban[]>();
    for (const b of p.beban) {
      if (b.nonTatapMuka || b.jp <= 0) continue;
      const kunci = b.paralel ? `p|${b.rombelId}|${b.paralel}` : `b|${b.id}`;
      const l = kelompok.get(kunci);
      if (l) l.push(b);
      else kelompok.set(kunci, [b]);
    }
    const aktif = p.master.ruang.map((r, i) => ({ r, i })).filter((x) => x.r.dijadwalkan !== false);
    // kelompok paralel yang sebagian anggotanya sudah punya slot tetap dipecah per beban (sisa JP tiap anggota bisa berbeda)
    const daftarKelompok: Beban[][] = [];
    for (const l of kelompok.values()) {
      if (l.length > 1 && l.some((b) => sudah.has(b.id))) for (const b of l) daftarKelompok.push([b]);
      else daftarKelompok.push(l);
    }
    for (const anggotaB of daftarKelompok) {
      const rb = rombelIdx.get((anggotaB[0] as Beban).rombelId);
      if (rb === undefined) continue;
      const anggota: Anggota[] = anggotaB.map((beban) => {
        const dilarang = ruangDilarang(p, beban);
        const mapel = p.master.mapel.find((m) => m.id === beban.mapelId);
        const urut = mapel?.jenisRuang?.length ? mapel.jenisRuang : JENIS_RUANG_BAWAAN;
        const jenisIds = urut.flatMap((j) => aktif.filter((x) => x.r.jenis === j).map((x) => x.r.id));
        const utama = beban.ruangPrioritas.length ? beban.ruangPrioritas : jenisIds;
        const lunak = !!opsi.prioritasLunak && beban.ruangPrioritas.length > 0;
        const ambil = (ids: string[]) => [...new Set(ids)].filter((id) => ruangIdx.has(id) && !dilarang.has(id)).map((id) => ruangIdx.get(id) as number);
        const calonUtama = ambil(utama);
        const calon = lunak ? [...calonUtama, ...ambil(jenisIds).filter((r) => !calonUtama.includes(r))] : calonUtama;
        return { beban, calon: p.master.ruang.length === 0 ? [-1] : calon, prio: p.master.ruang.length === 0 ? 1 : calonUtama.length };
      });
      const guru = [...new Set(anggotaB.flatMap((b) => [b.guruId, ...b.timGuruIds]).map((x) => guruIdx.get(x)).filter((x): x is number => x !== undefined))];
      const sisaJp = Math.max(0, Math.max(...anggotaB.map((b) => b.jp - (sudah.get(b.id) ?? 0))));
      const unit: Unit = { id: this.units.length, anggota, rombel: rb, guru, jp: sisaJp, bebanIds: anggotaB.map((b) => b.id) };
      this.units.push(unit);
      this.total += anggotaB.reduce((a, b) => a + b.jp, 0);
      if (sisaJp > 0) {
        const pola = anggotaB.length === 1 && !(sudah.get((anggotaB[0] as Beban).id)) ? (anggotaB[0] as Beban).pola : undefined;
        const runs = anggotaB.some((b) => sudah.has(b.id)) ? [] : awalPerBeban.get((anggotaB[0] as Beban).id) ?? [];
        let sisaPecah = sisaJp;
        for (const r of runs) {
          if (sisaPecah <= 0) break;
          const size = Math.min(r.size, sisaPecah);
          this.chunkBaru(unit, size).awal = { h: r.h, m: r.m };
          sisaPecah -= size;
        }
        if (sisaPecah > 0) for (const size of pecahJp(sisaPecah, runs.length ? undefined : pola)) this.chunkBaru(unit, size);
      }
    }
    // peringatan kapasitas
    const kapPekan = this.cap.reduce((a, b) => a + b, 0);
    p.master.rombel.forEach((r) => {
      const butuh = jpRombel(p.beban.filter((b) => b.rombelId === r.id && !b.nonTatapMuka));
      if (butuh > kapPekan) this.peringatan.push(`${r.kode} butuh ${butuh} JP per pekan, kapasitas pekan ini ${kapPekan} JP: ${butuh - kapPekan} JP pasti tidak muat.`);
    });
    const guruJp = new Map<string, number>();
    for (const b of p.beban) if (!b.nonTatapMuka) for (const g of [b.guruId, ...b.timGuruIds]) guruJp.set(g, (guruJp.get(g) ?? 0) + b.jp);
    for (const g of p.master.guru) {
      const n = guruJp.get(g.id) ?? 0;
      if (n > kapPekan) this.peringatan.push(`Guru ${g.kode} mengajar ${n} JP per pekan, melebihi kapasitas ${kapPekan} JP.`);
    }
    this.terapkanAwal();
  }

  /** Menempatkan tiap pertemuan di posisi jadwal awalnya bila masih sah; yang tidak sah dibiarkan belum tertempatkan. */
  terapkanAwal(): void {
    for (const c of this.chunks) {
      if (!c.awal || c.hari >= 0) continue;
      const r = this.muat(c, c.awal.h, c.awal.m);
      if (r) this.pasang(c, c.awal.h, c.awal.m, r);
    }
  }

  chunkBaru(unit: Unit, size: number): Chunk {
    const c: Chunk = { id: this.cacahChunk++, unit, size, hari: -1, mulai: 0, ruang: [] };
    this.chunks.push(c);
    return c;
  }

  // ------------------------------------------------------------ pemeriksaan & pemasangan
  /** Ruang untuk tiap anggota bila chunk muat di (hari, mulai); null bila tidak muat. `sebab` diisi alasan pertama yang gagal. */
  muat(c: Chunk, hari: number, mulai: number, sebab?: { v: string }): number[] | null {
    if (mulai < 1 || mulai + c.size - 1 > (this.cap[hari] ?? 0)) {
      if (sebab) sebab.v = 'kapasitas';
      return null;
    }
    const u = c.unit;
    const k0 = hari * LEBAR + mulai;
    const ro = this.rombelOcc[u.rombel] as Int32Array;
    for (let j = 0; j < c.size; j++) {
      if ((ro[k0 + j] as number) !== -1) {
        if (sebab) sebab.v = 'rombel';
        return null;
      }
    }
    for (const g of u.guru) {
      const go = this.guruOcc[g] as Int32Array;
      const gt = this.guruTutup[g] as Uint8Array;
      for (let j = 0; j < c.size; j++) {
        if (gt[k0 + j]) {
          if (sebab) sebab.v = 'tutup';
          return null;
        }
        if ((go[k0 + j] as number) !== -1) {
          if (sebab) sebab.v = 'guru';
          return null;
        }
      }
    }
    if ((this.tanpaRuang[u.rombel] as Uint8Array)[hari]) return u.anggota.map(() => -1);
    const dipakai = new Set<number>();
    const hasil: number[] = [];
    for (const a of u.anggota) {
      let dapat = -2;
      for (const r of a.calon) {
        if (r === -1) {
          dapat = -1;
          break;
        }
        if (dipakai.has(r)) continue;
        if (!this.bersama[r]) {
          const oc = this.ruangOcc[r] as Int32Array;
          let ok = true;
          for (let j = 0; j < c.size; j++) if ((oc[k0 + j] as number) !== -1) { ok = false; break; }
          if (!ok) continue;
        }
        dapat = r;
        break;
      }
      if (dapat === -2) {
        if (sebab) sebab.v = 'ruang';
        return null;
      }
      if (dapat >= 0) dipakai.add(dapat);
      hasil.push(dapat);
    }
    return hasil;
  }

  pasang(c: Chunk, hari: number, mulai: number, ruang: number[]): void {
    c.hari = hari;
    c.mulai = mulai;
    c.ruang = ruang;
    const k0 = hari * LEBAR + mulai;
    for (let j = 0; j < c.size; j++) {
      (this.rombelOcc[c.unit.rombel] as Int32Array)[k0 + j] = c.id;
      for (const g of c.unit.guru) (this.guruOcc[g] as Int32Array)[k0 + j] = c.id;
      for (const r of ruang) if (r >= 0 && !this.bersama[r]) (this.ruangOcc[r] as Int32Array)[k0 + j] = c.id;
    }
  }

  lepas(c: Chunk): void {
    if (c.hari < 0) return;
    const k0 = c.hari * LEBAR + c.mulai;
    for (let j = 0; j < c.size; j++) {
      (this.rombelOcc[c.unit.rombel] as Int32Array)[k0 + j] = -1;
      for (const g of c.unit.guru) (this.guruOcc[g] as Int32Array)[k0 + j] = -1;
      for (const r of c.ruang) if (r >= 0 && !this.bersama[r]) (this.ruangOcc[r] as Int32Array)[k0 + j] = -1;
    }
    c.hari = -1;
  }

  // ------------------------------------------------------------ biaya lunak
  private lubang(occ: Int32Array, hari: number): number {
    let min = -1;
    let max = -1;
    let n = 0;
    for (let j = 1; j < LEBAR; j++) {
      if ((occ[hari * LEBAR + j] as number) !== -1) {
        if (min < 0) min = j;
        max = j;
        n += 1;
      }
    }
    return n === 0 ? 0 : max - min + 1 - n;
  }
  private awal(occ: Int32Array, hari: number): number {
    for (let j = 1; j < LEBAR; j++) if ((occ[hari * LEBAR + j] as number) !== -1) return j - 1;
    return 0;
  }
  private muatanGuru(occ: Int32Array, hari: number): number {
    let n = 0;
    for (let j = 1; j < LEBAR; j++) if ((occ[hari * LEBAR + j] as number) !== -1) n += 1;
    return n;
  }
  biayaHari(unit: Unit, hari: number): number {
    const ro = this.rombelOcc[unit.rombel] as Int32Array;
    let b = this.lubang(ro, hari) * 10 + this.awal(ro, hari) * 1.5;
    for (const g of unit.guru) {
      const go = this.guruOcc[g] as Int32Array;
      b += this.lubang(go, hari) * 3 + Math.max(0, this.muatanGuru(go, hari) - 8) * 6;
    }
    return b;
  }
  /** Biaya yang melekat pada chunk bila ditaruh di (hari, mulai): terpotong istirahat, sehari dengan pertemuan beban yang sama, jam akhir. */
  biayaChunk(c: Chunk, hari: number, mulai: number): number {
    let b = mulai * 0.15;
    if (c.awal && (c.awal.h !== hari || c.awal.m !== mulai)) b += BIAYA_GESER_AWAL;
    const ist = this.istirahat[hari] as Set<number>;
    for (let j = mulai; j < mulai + c.size - 1; j++) if (ist.has(j)) b += 4;
    for (const o of this.chunks) if (o !== c && o.unit === c.unit && o.hari === hari) b += 20;
    return b;
  }
  /** Selisih biaya bila chunk (yang belum terpasang) dipasang di (hari, mulai). */
  skor(c: Chunk, hari: number, mulai: number, ruang: number[]): number {
    const sebelum = this.biayaHari(c.unit, hari);
    this.pasang(c, hari, mulai, ruang);
    const sesudah = this.biayaHari(c.unit, hari);
    this.lepas(c);
    return sesudah - sebelum + this.biayaChunk(c, hari, mulai) + this.biayaRuang(c, ruang);
  }
  /** Biaya memakai ruang cadangan (di luar pilihan utama beban). */
  biayaRuang(c: Chunk, ruang: number[]): number {
    let b = 0;
    c.unit.anggota.forEach((a, i) => {
      const r = ruang[i];
      if (r !== undefined && r >= 0 && a.calon.indexOf(r) >= a.prio) b += this.biayaCadangan;
    });
    return b;
  }

  // ------------------------------------------------------------ penempatan
  terbaik(c: Chunk, acakFn: () => number): { hari: number; mulai: number; ruang: number[] } | null {
    let terbaik: { hari: number; mulai: number; ruang: number[] } | null = null;
    let nilai = Infinity;
    for (let h = 0; h < this.hari; h++) {
      for (let m = 1; m + c.size - 1 <= (this.cap[h] as number); m++) {
        const r = this.muat(c, h, m);
        if (!r) continue;
        const s = this.skor(c, h, m, r) + acakFn() * 0.5;
        if (s < nilai) {
          nilai = s;
          terbaik = { hari: h, mulai: m, ruang: r };
        }
      }
    }
    return terbaik;
  }

  /** Chunk-chunk yang menghalangi (hari, mulai); null bila terhalang secara tetap (guru tidak tersedia, slot tetap, kapasitas). */
  penghalang(c: Chunk, hari: number, mulai: number): Set<number> | null {
    if (mulai < 1 || mulai + c.size - 1 > (this.cap[hari] as number)) return null;
    const k0 = hari * LEBAR + mulai;
    const hasil = new Set<number>();
    const catat = (v: number): boolean => {
      if (v === -2) return false;
      if (v >= 0 && v !== c.id) hasil.add(v);
      return true;
    };
    for (let j = 0; j < c.size; j++) {
      if (!catat((this.rombelOcc[c.unit.rombel] as Int32Array)[k0 + j] as number)) return null;
      for (const g of c.unit.guru) {
        if ((this.guruTutup[g] as Uint8Array)[k0 + j]) return null;
        if (!catat((this.guruOcc[g] as Int32Array)[k0 + j] as number)) return null;
      }
    }
    if ((this.tanpaRuang[c.unit.rombel] as Uint8Array)[hari]) return hasil;
    for (const a of c.unit.anggota) {
      let sedikit: Set<number> | null = null;
      for (const r of a.calon) {
        if (r < 0 || this.bersama[r]) { sedikit = new Set(); break; }
        const s = new Set<number>();
        let tetap = false;
        for (let j = 0; j < c.size; j++) {
          const v = (this.ruangOcc[r] as Int32Array)[k0 + j] as number;
          if (v === -2) { tetap = true; break; }
          if (v >= 0) s.add(v);
        }
        if (!tetap && (!sedikit || s.size < sedikit.size)) sedikit = s;
      }
      if (!sedikit) return null;
      for (const v of sedikit) hasil.add(v);
    }
    return hasil;
  }

  /** Foto posisi semua chunk, untuk membatalkan rantai geser yang gagal. */
  private foto(): { c: Chunk; h: number; m: number; r: number[] }[] {
    return this.chunks.map((c) => ({ c, h: c.hari, m: c.mulai, r: c.ruang }));
  }
  private pulihkan(f: { c: Chunk; h: number; m: number; r: number[] }[]): void {
    for (const x of f) this.lepas(x.c);
    for (const x of f) if (x.h >= 0) this.pasang(x.c, x.h, x.m, x.r);
  }

  /**
   * Menempatkan chunk: langsung, lalu dengan menggeser satu atau dua penghalang. Bila penghalang yang digeser juga buntu dan
   * `kedalaman` > 1, penghalang itu ikut menggeser penghalangnya sendiri (rantai geser), tanpa menyentuh chunk yang sudah dalam rantai.
   * true bila berhasil; bila gagal, semua posisi dipulihkan.
   */
  tempatkan(c: Chunk, acakFn: () => number, ejeksi: boolean, kedalaman = 1, larang: Set<number> = new Set()): boolean {
    const t = this.terbaik(c, acakFn);
    if (t) {
      this.pasang(c, t.hari, t.mulai, t.ruang);
      return true;
    }
    if (!ejeksi) return false;
    const lar = new Set(larang);
    lar.add(c.id);
    const calon: { h: number; m: number; hal: number[] }[] = [];
    for (let h = 0; h < this.hari; h++) {
      for (let m = 1; m + c.size - 1 <= (this.cap[h] as number); m++) {
        const hal = this.penghalang(c, h, m);
        if (hal && hal.size > 0 && hal.size <= 2 && ![...hal].some((id) => lar.has(id))) calon.push({ h, m, hal: [...hal] });
      }
    }
    calon.sort((a, b) => a.hal.length - b.hal.length || acakFn() - 0.5);
    const dalam = kedalaman > 1;
    for (const k of calon.slice(0, dalam ? 40 : 60)) {
      const foto = dalam ? this.foto() : null;
      const lawan = k.hal.map((id) => this.chunks.find((x) => x.id === id)).filter((x): x is Chunk => !!x);
      const asal = lawan.map((x) => ({ x, h: x.hari, m: x.mulai, r: x.ruang }));
      for (const x of lawan) this.lepas(x);
      const r = this.muat(c, k.h, k.m);
      if (!r) {
        for (const a of asal) this.pasang(a.x, a.h, a.m, a.r);
        continue;
      }
      this.pasang(c, k.h, k.m, r);
      const ditempat: Chunk[] = [];
      let ok = true;
      for (const x of lawan) {
        const tt = this.terbaik(x, acakFn);
        if (tt) {
          this.pasang(x, tt.hari, tt.mulai, tt.ruang);
        } else if (dalam && this.tempatkan(x, acakFn, true, kedalaman - 1, lar)) {
          // x sudah dipasang oleh rantai yang lebih dalam
        } else {
          ok = false;
          break;
        }
        ditempat.push(x);
      }
      if (ok) return true;
      if (foto) {
        this.pulihkan(foto);
      } else {
        for (const x of ditempat) this.lepas(x);
        this.lepas(c);
        for (const a of asal) this.pasang(a.x, a.h, a.m, a.r);
      }
    }
    return false;
  }

  /** Menempatkan chunk, dan bila tidak muat memecahnya menjadi dua. */
  usahakan(c: Chunk, acakFn: () => number): boolean {
    if (this.tempatkan(c, acakFn, true, this.kedalaman)) return true;
    if (c.size <= 1) return false;
    const a = Math.ceil(c.size / 2);
    const idx = this.chunks.indexOf(c);
    this.chunks.splice(idx, 1);
    const c1 = this.chunkBaru(c.unit, a);
    const c2 = this.chunkBaru(c.unit, c.size - a);
    const ok1 = this.usahakan(c1, acakFn);
    const ok2 = this.usahakan(c2, acakFn);
    return ok1 && ok2;
  }

  // ------------------------------------------------------------ ringkasan
  belum(): Chunk[] {
    return this.chunks.filter((c) => c.hari < 0);
  }
  jpBelum(): number {
    return this.belum().reduce((a, c) => a + c.size * c.unit.anggota.length, 0);
  }
  biayaTotal(): number {
    let b = 0;
    const done = new Set<string>();
    for (const c of this.chunks) {
      if (c.hari < 0) continue;
      b += this.biayaChunk(c, c.hari, c.mulai);
      const k = `${c.unit.rombel}|${c.hari}`;
      if (!done.has(k)) {
        done.add(k);
        b += this.biayaHari(c.unit, c.hari);
      }
    }
    return b;
  }
  potret(): Potret[] {
    return this.chunks.map((c) => ({ unit: c.unit.id, size: c.size, hari: c.hari, mulai: c.mulai, ruang: [...c.ruang], ...(c.awal ? { awal: c.awal } : {}) }));
  }
  muatPotret(ps: Potret[]): void {
    for (const c of [...this.chunks]) this.lepas(c);
    this.chunks = [];
    for (const q of ps) {
      const c = this.chunkBaru(this.units[q.unit] as Unit, q.size);
      if (q.awal) c.awal = q.awal;
      if (q.hari >= 0) this.pasang(c, q.hari, q.mulai, q.ruang);
    }
  }

  /**
   * Alasan sebuah pertemuan tidak tertempatkan. Setiap waktu yang mungkin diperiksa terhadap SEMUA penyebab (bukan hanya yang
   * pertama gagal), lalu penyebab dilaporkan beserta jumlah waktu yang terhalang olehnya.
   */
  diagnosa(c: Chunk): string {
    const u = c.unit;
    const rb = this.rombelKode[u.rombel];
    const gk = u.guru.map((g) => this.guruKode[g]).join('/');
    const calon = [...new Set(u.anggota.flatMap((a) => a.calon))].filter((r) => r >= 0);
    const kodeCalon = calon.map((r) => this.kodeRuang[r]);
    const ruangTxt = `${kodeCalon.slice(0, 6).join(', ')}${kodeCalon.length > 6 ? ', ...' : ''}`;
    const n = { rombel: 0, guru: 0, tutup: 0, mengawas: 0, kunci: 0, ruang: 0 };
    let total = 0;
    for (let h = 0; h < this.hari; h++) {
      for (let m = 1; m + c.size - 1 <= (this.cap[h] as number); m++) {
        total += 1;
        const k0 = h * LEBAR + m;
        const ro = this.rombelOcc[u.rombel] as Int32Array;
        if (Array.from({ length: c.size }, (_, j) => ro[k0 + j] !== -1).some(Boolean)) n.rombel += 1;
        const ada = { guru: false, tutup: false, mengawas: false };
        for (const g of u.guru) {
          for (let j = 0; j < c.size; j++) {
            if ((this.guruMengawas[g] as Uint8Array)[k0 + j]) ada.mengawas = true;
            else if ((this.guruTutup[g] as Uint8Array)[k0 + j]) ada.tutup = true;
            if ((this.guruOcc[g] as Int32Array)[k0 + j] !== -1) ada.guru = true;
          }
        }
        if (ada.guru) n.guru += 1;
        if (ada.tutup) n.tutup += 1;
        if (ada.mengawas) n.mengawas += 1;
        if ((this.tanpaRuang[u.rombel] as Uint8Array)[h]) continue;
        // ruang: terhalang bila ada anggota yang semua calon ruangnya terisi; 'kunci' bila setiap calon yang terisi itu terkunci kegiatan
        for (const a of u.anggota) {
          if (a.calon.includes(-1)) continue;
          let bebas = false;
          let semuaKunci = true;
          for (const r of a.calon) {
            if (this.bersama[r]) { bebas = true; break; }
            const oc = this.ruangOcc[r] as Int32Array;
            const kc = this.ruangKunci[r] as Uint8Array;
            let terisi = false;
            let kunci = false;
            for (let j = 0; j < c.size; j++) {
              if (oc[k0 + j] !== -1) terisi = true;
              if (kc[k0 + j]) kunci = true;
            }
            if (!terisi) { bebas = true; break; }
            if (!kunci) semuaKunci = false;
          }
          if (!bebas) {
            if (semuaKunci) n.kunci += 1;
            else n.ruang += 1;
            break;
          }
        }
      }
    }
    if (total === 0) return `Kapasitas hari tidak cukup untuk ${c.size} JP berurutan.`;
    const bagian: [number, string][] = [
      [n.rombel, `jam ${rb} sudah terisi`],
      [n.guru, `guru ${gk} sudah mengajar`],
      [n.mengawas, `guru ${gk} sedang mengawas`],
      [n.tutup, `guru ${gk} tidak tersedia`],
      [n.kunci, `ruang (${ruangTxt}) terkunci kegiatan`],
      [n.ruang, `ruang (${ruangTxt}) terpakai`],
    ];
    const rinci = bagian.filter(([x]) => x > 0).sort((a, b) => b[0] - a[0]).map(([x, t]) => `${t} pada ${x}`).join('; ');
    const dibatasi = u.anggota.some((a) => a.beban.ruangPrioritas.length > 0) && n.kunci + n.ruang > 0;
    return `Tidak ada waktu ${c.size} JP berurutan yang muat (dari ${total} kemungkinan): ${rinci}.${dibatasi ? ` Ruang beban ini dibatasi ke ${ruangTxt}; bila boleh ruang lain, ubah ruang prioritasnya di tab Beban.` : ''}`;
  }

  hasilSlot(): Slot[] {
    const slots: Slot[] = [...this.tetap];
    for (const c of this.chunks) {
      if (c.hari < 0) continue;
      c.unit.anggota.forEach((a, i) => {
        const r = c.ruang[i] ?? -1;
        for (let j = 0; j < c.size; j++) {
          const jam = c.mulai + j;
          slots.push({ id: `${a.beban.id}-${c.hari}-${jam}`, bebanId: a.beban.id, hari: c.hari, jam, ruangId: r >= 0 ? (this.ruangIds[r] as string) : '' });
        }
      });
    }
    return slots;
  }
}

/** Menyusun jadwal untuk seluruh beban tatap muka. Murni dan dapat diulang bila `benih` sama (batas waktu memengaruhi hasil). */
/** Beban yang sebagian pertemuannya memakai ruang di luar ruang prioritasnya (hanya beban yang punya ruang prioritas). */
export interface RuangPindah {
  bebanId: string;
  /** JP yang berada di ruang non-prioritas */
  jp: number;
  /** ruang yang dipakai di luar prioritas (id, tanpa duplikat) */
  ruangIds: string[];
}
export function ruangDiluarPrioritas(p: Proyek, slots: Slot[]): RuangPindah[] {
  const prio = new Map(p.beban.filter((b) => b.ruangPrioritas.length > 0).map((b) => [b.id, new Set(b.ruangPrioritas)]));
  const hasil = new Map<string, RuangPindah>();
  for (const s of slots) {
    const ok = prio.get(s.bebanId);
    if (!ok || !s.ruangId || ok.has(s.ruangId)) continue;
    const x = hasil.get(s.bebanId) ?? { bebanId: s.bebanId, jp: 0, ruangIds: [] };
    x.jp++;
    if (!x.ruangIds.includes(s.ruangId)) x.ruangIds.push(s.ruangId);
    hasil.set(s.bebanId, x);
  }
  return [...hasil.values()];
}

export function susun(p: Proyek, opsi: OpsiSusun): HasilSusun {
  if (opsi.prioritasLunak !== 'bilaPerlu') return susunSekali(p, { ...opsi, prioritasLunak: !!opsi.prioritasLunak });
  const t0 = Date.now();
  const batas = opsi.batasMs ?? 8000;
  const ketat = susunSekali(p, { ...opsi, prioritasLunak: false, batasMs: batas * 0.6 });
  // tahap kedua hanya bila masih ada JP yang tidak muat dan waktu tersisa; tidak pernah melewati batas total
  const sisaWaktu = batas - (Date.now() - t0);
  if (ketat.sisa.length === 0 || sisaWaktu < 200) return { ...ketat, ms: Date.now() - t0 };
  const lunak = susunSekali(p, { ...opsi, prioritasLunak: true, biayaRuangCadangan: opsi.biayaRuangCadangan ?? 60, awal: ketat.slots, batasMs: sisaWaktu });
  return { ...(lunak.terjadwal > ketat.terjadwal ? lunak : ketat), ms: Date.now() - t0 };
}

function susunSekali(p: Proyek, opsi: OpsiSusun & { prioritasLunak?: boolean }): HasilSusun {
  const t0 = Date.now();
  const batas = opsi.batasMs ?? 8000;
  let terakhirSlot = 0;
  const laporan = (tahap: Kemajuan['tahap'], m: Mesin) => {
    const sertakan = !!opsi.sertakanSlot && tahap !== 'selesai' && Date.now() - terakhirSlot > 1500;
    if (sertakan) terakhirSlot = Date.now();
    opsi.kemajuan?.({ tahap, terjadwal: m.total - m.jpBelum(), total: m.total, biaya: Math.round(m.biayaTotal()), ms: Date.now() - t0, ...(sertakan ? { slots: m.hasilSlot() } : {}) });
  };

  // --- tahap awal: beberapa kali penempatan serakah dengan urutan acak, ambil yang terbaik
  const dasar = new Mesin(p, opsi);
  const rnd = acak(opsi.benih ?? 20260126);
  const beban = new Map<string, number>();
  for (const u of dasar.units) for (const g of u.guru) beban.set(String(g), (beban.get(String(g)) ?? 0) + u.jp);
  const sulit = (c: Chunk) =>
    c.size * 100 + Math.max(...c.unit.guru.map((g) => beban.get(String(g)) ?? 0), 0) * 2 + (30 - Math.min(30, Math.min(...c.unit.anggota.map((a) => a.calon.length)))) * 3;

  let terbaik: Potret[] | null = null;
  let nilaiTerbaik = Infinity;
  const otomatis = !!opsi.sabarMs;
  const awalMs = otomatis ? 0 : Math.max(300, batas * 0.3);
  const maksPutaran = otomatis ? 3 : 40;
  const lewat = () => Date.now() - t0 >= batas;
  let putaran = 0;
  let laporAwal = 0;
  // putaran pertama selalu dikerjakan; putaran berikutnya hanya selama masih dalam jatah awal. Batas keras dicek di tiap penempatan.
  while (putaran < 1 || (putaran < maksPutaran && Date.now() - t0 < awalMs) || (otomatis && putaran < 2 && !lewat())) {
    putaran += 1;
    const m = new Mesin(p, opsi);
    const daftar = [...m.chunks].sort((a, b) => sulit(b) - sulit(a) + (rnd() - 0.5) * (putaran === 1 ? 0 : 160));
    for (const c of daftar) {
      if (c.hari >= 0) continue; // sudah tertempatkan dari jadwal awal
      if (lewat() && putaran > 1) break;
      if (!m.usahakan(c, rnd)) { /* tetap belum; dilaporkan di akhir */ }
      if (Date.now() - laporAwal > 400) {
        laporAwal = Date.now();
        laporan('awal', m);
      }
      if (lewat()) break;
    }
    const nilai = m.jpBelum() * 1000 + m.biayaTotal();
    if (nilai < nilaiTerbaik) {
      nilaiTerbaik = nilai;
      terbaik = m.potret();
    }
    laporan('awal', m);
    if (lewat()) break;
  }

  // --- perbaikan: tempatkan ulang chunk acak pada tempat terbaiknya (tidak pernah memburuk)
  const m = new Mesin(p, opsi);
  m.muatPotret(terbaik ?? []);
  let langkah = 0;
  let terakhirLapor = Date.now();
  let nilaiMembaik = m.jpBelum() * 1000 + m.biayaTotal();
  let waktuMembaik = Date.now();
  while (!lewat()) {
    langkah += 1;
    const belum = m.belum();
    if (belum.length > 0 && langkah % 25 === 0) {
      const c = belum[Math.floor(rnd() * belum.length)] as Chunk;
      m.usahakan(c, rnd);
    }
    const pasang = m.chunks.filter((c) => c.hari >= 0);
    if (pasang.length === 0) break;
    const c = pasang[Math.floor(rnd() * pasang.length)] as Chunk;
    const asal = { h: c.hari, m: c.mulai, r: c.ruang };
    m.lepas(c);
    const t = m.terbaik(c, rnd);
    if (t) {
      const skor = m.skor(c, t.hari, t.mulai, t.ruang);
      const awalSkor = m.skor(c, asal.h, asal.m, asal.r);
      if (skor < awalSkor - 1e-9) m.pasang(c, t.hari, t.mulai, t.ruang);
      else m.pasang(c, asal.h, asal.m, asal.r);
    } else m.pasang(c, asal.h, asal.m, asal.r);
    if (Date.now() - terakhirLapor > 250) {
      terakhirLapor = Date.now();
      laporan('perbaiki', m);
      if (opsi.sabarMs) {
        const nilai = m.jpBelum() * 1000 + m.biayaTotal();
        if (nilai < nilaiMembaik - 1e-9) {
          nilaiMembaik = nilai;
          waktuMembaik = Date.now();
        } else if (Date.now() - waktuMembaik > opsi.sabarMs) break;
      }
    }
    if (langkah > 400000) break;
  }
  laporan('selesai', m);

  const sisaMap = new Map<string, { jp: number; alasan: string }>();
  for (const c of m.belum()) {
    const alasan = m.diagnosa(c);
    for (const a of c.unit.anggota) {
      const kini = sisaMap.get(a.beban.id);
      sisaMap.set(a.beban.id, { jp: (kini?.jp ?? 0) + c.size, alasan: kini?.alasan ?? alasan });
    }
  }
  const sisa: Sisa[] = [...sisaMap].map(([bebanId, v]) => ({ bebanId, jpSisa: v.jp, alasan: v.alasan }));
  return {
    slots: m.hasilSlot(),
    sisa,
    terjadwal: m.total - m.jpBelum(),
    total: m.total,
    biaya: Math.round(m.biayaTotal()),
    peringatan: m.peringatan,
    ms: Date.now() - t0,
  };
}
