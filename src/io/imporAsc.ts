import type { Beban, Guru, Mapel, Proyek, Slot } from '../model/tipe';
import { usulKodeGuru } from '../model/kode';

/** Isi berkas data/sekolah/sumber/reguler-gasal-2026.json (hasil tools/ekstrak-asc-pdf.py): satu baris per JP. */
export interface SumberAsc {
  sumber: string;
  semester: string;
  rombel: Record<string, { hari: number; jam: number; guru: string; mapel: string; ruang: string }[]>;
}

export interface LaporanAsc {
  rombel: number;
  beban: number;
  slot: number;
  peringatan: string[];
}

interface SpesMapel {
  kode: string;
  nama: string;
  /** kode mapel induk (untuk elemen) */
  induk?: string;
}

/**
 * Kode mapel pada jadwal aSc -> mapel pada master.
 * Kompetensi keahlian (KK) TE punya mapel induk: DTE (fase E, kelas X) dengan elemen DLE, DRE, TKB, dan TAV (fase F, kelas XI dan XII)
 * dengan elemen PRE, PMM, PSRT, PISAV, PISS (keterangan Benny, 26 Nov 2026). P4E adalah mata pelajaran pilihan (MPP) TE.
 * Nama elemen mengikuti jadwal-te milik Benny; "DRLE" pada aSc ditulis DRE di sana.
 */
export const MAPEL_ASC: Record<string, SpesMapel> = {
  BI: { kode: 'BI', nama: 'Bahasa Indonesia' },
  BK: { kode: 'BK', nama: 'Bimbingan dan Konseling' },
  D2Dkv: { kode: 'DDK', nama: 'Dasar-dasar Desain Komunikasi Visual' },
  ENG: { kode: 'ENG', nama: 'Bahasa Inggris' },
  IT: { kode: 'IT', nama: 'Informatika' },
  JW: { kode: 'JAW', nama: 'Bahasa Jawa' },
  KIK: { kode: 'KIK', nama: 'Kreativitas, Inovasi, dan Kewirausahaan' },
  MTK: { kode: 'MTK', nama: 'Matematika' },
  P4E: { kode: 'P4E', nama: 'Pembuatan, Perbaikan & Perawatan Peralatan Elektronika' },
  PABP: { kode: 'PA', nama: 'Pendidikan Agama' },
  PJOK: { kode: 'PJO', nama: 'Penjasorkes' },
  Pp: { kode: 'PP', nama: 'Pendidikan Pancasila' },
  S: { kode: 'SJR', nama: 'Sejarah' },
  SB: { kode: 'SEN', nama: 'Seni' },
  ipas: { kode: 'IPA', nama: 'Projek IPAS' },
  'dkk.AT': { kode: 'DAT', nama: 'Dasar-dasar Agribisnis Tanaman' },
  'Teori.AT': { kode: 'TAT', nama: 'Teori Agribisnis Tanaman', induk: 'DAT' },
  'kk.AT': { kode: 'AT', nama: 'Agribisnis Tanaman Pangan dan Hortikultura' },
  'kk.DKV': { kode: 'DKV', nama: 'Desain Komunikasi Visual' },
  mppAT: { kode: 'MPA', nama: 'Mata Pelajaran Pilihan AT' },
  mppDKV: { kode: 'MPD', nama: 'Mata Pelajaran Pilihan DKV' },
  DLE: { kode: 'DLE', nama: 'Dasar Listrik dan Elektronika', induk: 'DTE' },
  DRLE: { kode: 'DRE', nama: 'Dasar Rangkaian Listrik dan Elektronika', induk: 'DTE' },
  DRE: { kode: 'DRE', nama: 'Dasar Rangkaian Listrik dan Elektronika', induk: 'DTE' },
  // pekan UKK: kompetensi keahlian TE dan MPP TE tanpa pembagian elemen (diajar "Guru TE")
  kkTE: { kode: 'TAV', nama: 'Teknik Audio Video' },
  mppTE: { kode: 'P4E', nama: 'Pembuatan, Perbaikan & Perawatan Peralatan Elektronika' },
  TKB: { kode: 'TKB', nama: 'Teknik Kerja Bengkel', induk: 'DTE' },
  PRE: { kode: 'PRE', nama: 'Perencanaan Rangkaian Elektronika', induk: 'TAV' },
  PMM: { kode: 'PMM', nama: 'Pemrograman Mikroprosesor dan Mikrokontroler', induk: 'TAV' },
  PSRT: { kode: 'PSRT', nama: 'Penerapan Sistem Radio dan Televisi', induk: 'TAV' },
  PISAV: { kode: 'PISAV', nama: 'Penerapan Instalasi Sistem Audio Video', induk: 'TAV' },
  PISS: { kode: 'PISS', nama: 'Penerapan Instalasi Sound System', induk: 'TAV' },
};

/** Nama yang ejaannya berbeda antara jadwal aSc dan Excel: kunci aSc -> kunci Excel. */
const ALIAS_NAMA: Record<string, string> = { 'efry widi': 'efry widy', 'm agun': 'muha agun' };

/** Kunci pencocokan longgar: dua kata pertama (tanpa gelar), masing-masing empat huruf pertama. */
export function kunciLonggar(nama: string): string {
  const kata = ((nama.split(',')[0] ?? '').toLowerCase().match(/[a-z]+/g) ?? []).slice(0, 2).map((k) => k.slice(0, 4));
  const kunci = kata.join(' ');
  return ALIAS_NAMA[kunci] ?? kunci;
}

/** Daftar panjang pertemuan: JP berurutan pada hari yang sama dihitung satu pertemuan. Mengembalikan panjang tiap pertemuan. */
export function pertemuan(slots: { hari: number; jam: number }[]): number[] {
  const urut = [...slots].sort((a, b) => a.hari - b.hari || a.jam - b.jam);
  const hasil: number[] = [];
  let awal: { hari: number; jam: number } | null = null;
  for (const s of urut) {
    if (awal && awal.hari === s.hari && awal.jam + (hasil[hasil.length - 1] ?? 0) === s.jam) hasil[hasil.length - 1] = (hasil[hasil.length - 1] ?? 0) + 1;
    else {
      hasil.push(1);
      awal = s;
    }
  }
  return hasil;
}

/**
 * Memasang jadwal reguler dari aSc ke proyek: beban (guru, mapel, JP, pola, ruang prioritas) untuk rombel yang ada di sumber
 * diganti, dan seluruh slotnya menjadi versi reguler. Rombel yang tidak ada di sumber tetap memakai beban lama (dari Excel).
 * Idempoten: dijalankan dua kali pada proyek yang sama menghasilkan data yang sama.
 */
export function terapkanRegulerAsc(p: Proyek, s: SumberAsc): LaporanAsc {
  const peringatan: string[] = [];
  const guruByKunci = new Map<string, Guru>();
  for (const g of p.master.guru) {
    const k = kunciLonggar(g.nama);
    if (guruByKunci.has(k)) peringatan.push(`Kunci nama ganda pada master: ${g.nama} dan ${guruByKunci.get(k)?.nama}.`);
    guruByKunci.set(k, g);
  }
  const rombelByKode = new Map(p.master.rombel.map((r) => [r.kode, r]));
  const ruangByKode = new Map(p.master.ruang.map((r) => [r.kode.toUpperCase(), r]));

  // --- mapel
  const mapelByKode = new Map(p.master.mapel.map((m) => [m.kode.toUpperCase(), m]));
  const pakaiMapel = (asc: string): Mapel | undefined => {
    const spes = MAPEL_ASC[asc];
    if (!spes) return undefined;
    let m = mapelByKode.get(spes.kode.toUpperCase());
    if (!m) {
      m = { id: `m${Math.max(0, ...p.master.mapel.map((x) => Number(x.id.slice(1)) || 0)) + 1}`, nama: spes.nama, kode: spes.kode };
      p.master.mapel.push(m);
      mapelByKode.set(spes.kode.toUpperCase(), m);
    }
    if (spes.induk) {
      const induk = mapelByKode.get(spes.induk.toUpperCase());
      if (induk) m.induk = induk.id;
      else peringatan.push(`Mapel induk ${spes.induk} untuk ${spes.kode} tidak ada di master.`);
    }
    return m;
  };

  // --- ruang yang dipakai per (tingkat, jurusan, mapel): ruang praktik/lab diurutkan menurut seringnya dipakai
  const pakaiRuang = new Map<string, Map<string, number>>();
  const adaTeori = new Set<string>();
  for (const [kodeRombel, baris] of Object.entries(s.rombel)) {
    const rb = rombelByKode.get(kodeRombel);
    if (!rb) continue;
    for (const b of baris) {
      const ruang = ruangByKode.get(b.ruang.toUpperCase());
      const kunci = `${rb.tingkat}|${rb.jurusan}|${b.mapel}`;
      if (!ruang) continue;
      if (ruang.jenis === 'teori') adaTeori.add(kunci);
      else {
        const m = pakaiRuang.get(kunci) ?? new Map<string, number>();
        m.set(ruang.id, (m.get(ruang.id) ?? 0) + 1);
        pakaiRuang.set(kunci, m);
      }
    }
  }

  // --- beban dan slot
  const bebanBaru: Beban[] = [];
  const slots: Slot[] = [];
  let nomorBeban = 0;
  let nomorSlot = 0;
  const diganti = new Set<string>();
  for (const [kodeRombel, baris] of Object.entries(s.rombel)) {
    const rb = rombelByKode.get(kodeRombel);
    if (!rb) {
      peringatan.push(`Rombel ${kodeRombel} pada sumber tidak ada di master, dilewati.`);
      continue;
    }
    diganti.add(rb.id);
    const per = new Map<string, { guru: Guru; mapel: Mapel; asc: string; baris: typeof baris }>();
    for (const b of baris) {
      let guru = guruByKunci.get(kunciLonggar(b.guru));
      if (!guru) {
        const nama = b.guru;
        guru = { id: `g${p.master.guru.length + 1}`, nama, kode: usulKodeGuru(nama, p.master.guru.map((g) => g.kode)) };
        p.master.guru.push(guru);
        guruByKunci.set(kunciLonggar(b.guru), guru);
        peringatan.push(`Guru ${nama} belum ada di master; ditambahkan dengan kode ${guru.kode}.`);
      }
      const mapel = pakaiMapel(b.mapel);
      if (!mapel) {
        peringatan.push(`${kodeRombel}: kode mapel aSc "${b.mapel}" belum punya padanan, dilewati.`);
        continue;
      }
      const kunci = `${guru.id}|${mapel.id}|${b.mapel}`;
      const grup = per.get(kunci) ?? { guru, mapel, asc: b.mapel, baris: [] };
      grup.baris.push(b);
      per.set(kunci, grup);
    }
    for (const grup of per.values()) {
      nomorBeban += 1;
      const kunciRuang = `${rb.tingkat}|${rb.jurusan}|${grup.asc}`;
      const prioritas = adaTeori.has(kunciRuang) ? [] : [...(pakaiRuang.get(kunciRuang) ?? new Map<string, number>())].sort((a, b) => b[1] - a[1]).map(([id]) => id);
      const beban: Beban = {
        id: `b${nomorBeban}`,
        guruId: grup.guru.id,
        mapelId: grup.mapel.id,
        rombelId: rb.id,
        jp: grup.baris.length,
        pola: pertemuan(grup.baris).sort((a, b) => b - a),
        timGuruIds: [],
        ruangPrioritas: prioritas,
        ruangTerlarang: [],
      };
      bebanBaru.push(beban);
      for (const b of grup.baris) {
        nomorSlot += 1;
        slots.push({ id: `s${nomorSlot}`, bebanId: beban.id, hari: b.hari, jam: b.jam, ruangId: ruangByKode.get(b.ruang.toUpperCase())?.id ?? '' });
        if (!ruangByKode.has(b.ruang.toUpperCase())) peringatan.push(`${kodeRombel}: ruang ${b.ruang} tidak ada di master.`);
      }
    }
  }

  // rombel yang tidak ada di sumber: beban lama dipertahankan (id diurut ulang)
  for (const b of p.beban.filter((x) => !diganti.has(x.rombelId))) {
    nomorBeban += 1;
    bebanBaru.push({ ...b, id: `b${nomorBeban}` });
  }
  p.beban = bebanBaru;

  // mapel yang tidak dipakai (dan bukan induk mapel yang dipakai) dibuang; PKL tetap ada karena dihitung sebagai mapel (dipakai semester genap)
  const dipakai = new Set(p.beban.map((b) => b.mapelId));
  for (const m of p.master.mapel) if (m.kode.toUpperCase() === 'PKL') dipakai.add(m.id);
  for (const m of p.master.mapel) if (dipakai.has(m.id) && m.induk) dipakai.add(m.induk);
  p.master.mapel = p.master.mapel.filter((m) => dipakai.has(m.id));

  const reguler = p.versi.find((v) => v.jenis === 'reguler') ?? p.versi[0];
  if (reguler) {
    reguler.nama = `Reguler ${s.semester} (dari aSc)`;
    reguler.slots = slots;
  } else p.versi.push({ id: 'v-reguler', nama: `Reguler ${s.semester} (dari aSc)`, jenis: 'reguler', slots });

  return { rombel: diganti.size, beban: bebanBaru.length, slot: slots.length, peringatan };
}


/** Berkas hasil tools/ekstrak-asc-kelas.py: satu baris per JP, plus keterangan hari dan rombel PJJ/TKA. */
export interface SumberAscKelas {
  sumber: string;
  hari: { pembiasaan: boolean; jamKbm: number }[];
  waktuKolom: Record<string, string>;
  pjj: string[];
  tidakHadir: Record<string, Record<string, string>>;
  rombel: Record<string, { hari: number; jam: number; guru: string; mapel: string; ruang: string }[]>;
}

/**
 * Menyusun beban dan slot dari jadwal aSc untuk satu versi jadwal (tanpa menyentuh beban lain). Beban dan slot diberi id berawalan
 * `awalan` dan `versiId`. Nama guru yang terpotong (kartu sempit pada jadwal kelas) dicocokkan lewat kata pertama, lalu lewat guru
 * yang mengajar mapel yang sama di rombel itu pada baris lain.
 */
export function bebanDariAsc(p: Proyek, s: Pick<SumberAsc, 'rombel'>, opsi: { versiId?: string; awalan: string; bebanAcuan?: Beban[] }): { beban: Beban[]; slots: Slot[]; peringatan: string[] } {
  const peringatan: string[] = [];
  const guruByKunci = new Map<string, Guru>();
  for (const g of p.master.guru) guruByKunci.set(kunciLonggar(g.nama), g);
  const kataPertama = (n: string) => ((n.split(',')[0] ?? '').toLowerCase().match(/[a-z]+/g) ?? [])[0]?.slice(0, 4) ?? '';
  const rombelByKode = new Map(p.master.rombel.map((r) => [r.kode, r]));
  const ruangByKode = new Map(p.master.ruang.map((r) => [r.kode.toUpperCase(), r]));
  const mapelByKode = new Map(p.master.mapel.map((m) => [m.kode.toUpperCase(), m]));
  const pakaiMapel = (asc: string): Mapel | undefined => {
    const spes = MAPEL_ASC[asc];
    if (!spes) return undefined;
    let m = mapelByKode.get(spes.kode.toUpperCase());
    if (!m) {
      m = { id: `m${Math.max(0, ...p.master.mapel.map((x) => Number(x.id.slice(1)) || 0)) + 1}`, nama: spes.nama, kode: spes.kode };
      p.master.mapel.push(m);
      mapelByKode.set(spes.kode.toUpperCase(), m);
    }
    if (spes.induk && !m.induk) {
      const induk = mapelByKode.get(spes.induk.toUpperCase());
      if (induk) m.induk = induk.id;
    }
    return m;
  };
  const cariGuru = (nama: string): Guru | undefined => {
    const langsung = guruByKunci.get(kunciLonggar(nama));
    if (langsung) return langsung;
    const k1 = kataPertama(nama);
    const calon = p.master.guru.filter((g) => kataPertama(g.nama) === k1);
    return calon.length === 1 ? calon[0] : undefined;
  };
  // ruang praktik/lab per (tingkat, jurusan, mapel), seperti terapkanRegulerAsc
  const pakaiRuang = new Map<string, Map<string, number>>();
  const adaTeori = new Set<string>();
  for (const [kodeRombel, baris] of Object.entries(s.rombel)) {
    const rb = rombelByKode.get(kodeRombel);
    if (!rb) continue;
    for (const b of baris) {
      const ruang = ruangByKode.get(b.ruang.toUpperCase());
      const kunci = `${rb.tingkat}|${rb.jurusan}|${b.mapel}`;
      if (!ruang) continue;
      if (ruang.jenis === 'teori') adaTeori.add(kunci);
      else {
        const m = pakaiRuang.get(kunci) ?? new Map<string, number>();
        m.set(ruang.id, (m.get(ruang.id) ?? 0) + 1);
        pakaiRuang.set(kunci, m);
      }
    }
  }
  const beban: Beban[] = [];
  const slots: Slot[] = [];
  let nb = 0;
  let ns = 0;
  const tanpaRuang = new Set<string>();
  for (const [kodeRombel, baris] of Object.entries(s.rombel)) {
    const rb = rombelByKode.get(kodeRombel);
    if (!rb) {
      peringatan.push(`Rombel ${kodeRombel} tidak ada di master, dilewati.`);
      continue;
    }
    // guru per mapel di rombel ini dari baris yang namanya utuh (untuk nama terpotong)
    const guruMapel = new Map<string, Guru>();
    for (const b of baris) {
      const g = cariGuru(b.guru);
      if (g && !guruMapel.has(b.mapel)) guruMapel.set(b.mapel, g);
    }
    const per = new Map<string, { guru: Guru; mapel: Mapel; asc: string; baris: typeof baris }>();
    for (const b of baris) {
      const mapel = pakaiMapel(b.mapel);
      if (!mapel) {
        peringatan.push(`${kodeRombel}: kode mapel aSc "${b.mapel}" belum punya padanan, dilewati.`);
        continue;
      }
      let guru = cariGuru(b.guru) ?? guruMapel.get(b.mapel) ?? p.master.guru.find((g) => g.id === opsi.bebanAcuan?.find((x) => x.rombelId === rb.id && x.mapelId === mapel.id)?.guruId);
      if (!guru) {
        const nama = b.guru || 'Guru (belum diketahui)';
        guru = { id: `g${p.master.guru.length + 1}`, nama, kode: usulKodeGuru(nama, p.master.guru.map((g) => g.kode)) };
        p.master.guru.push(guru);
        guruByKunci.set(kunciLonggar(nama), guru);
        peringatan.push(`Guru "${nama}" belum ada di master; ditambahkan dengan kode ${guru.kode}.`);
      }
      const kunci = `${guru.id}|${mapel.id}|${b.mapel}`;
      const grup = per.get(kunci) ?? { guru, mapel, asc: b.mapel, baris: [] };
      grup.baris.push(b);
      per.set(kunci, grup);
    }
    for (const grup of per.values()) {
      nb += 1;
      const kunciRuang = `${rb.tingkat}|${rb.jurusan}|${grup.asc}`;
      const prioritas = adaTeori.has(kunciRuang) ? [] : [...(pakaiRuang.get(kunciRuang) ?? new Map<string, number>())].sort((a, b) => b[1] - a[1]).map(([id]) => id);
      const bb: Beban = {
        id: `${opsi.awalan}b${nb}`, guruId: grup.guru.id, mapelId: grup.mapel.id, rombelId: rb.id, jp: grup.baris.length,
        pola: pertemuan(grup.baris).sort((a, b) => b - a), timGuruIds: [], ruangPrioritas: prioritas, ruangTerlarang: [],
        ...(opsi.versiId ? { versiId: opsi.versiId } : {}),
      };
      beban.push(bb);
      for (const b of grup.baris) {
        ns += 1;
        const ruang = ruangByKode.get(b.ruang.toUpperCase());
        if (b.ruang && !ruang) peringatan.push(`${kodeRombel}: ruang ${b.ruang} tidak ada di master.`);
        if (!b.ruang) tanpaRuang.add(kodeRombel);
        slots.push({ id: `${opsi.awalan}s${ns}`, bebanId: bb.id, hari: b.hari, jam: b.jam, ruangId: ruang?.id ?? '' });
      }
    }
  }
  if (tanpaRuang.size) peringatan.push(`Tanpa ruang: ${[...tanpaRuang].join(', ')}.`);
  return { beban, slots, peringatan: [...new Set(peringatan)] };
}
