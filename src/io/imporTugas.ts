import type { Beban, Guru, Mapel, Proyek, Rombel } from '../model/tipe';
import { jpRombel } from '../model/jp';
import { kodeGuruBerikut, usulKodeMapel } from '../model/kode';
import type { Lembar, Sel } from './xlsx';

export interface HasilImpor {
  guru: Guru[];
  mapel: Mapel[];
  rombel: Rombel[];
  beban: Beban[];
  peringatan: string[];
  /** JP tatap muka per tingkat+jurusan (jumlah seluruh beban) */
  ringkas: { guru: number; mapel: number; rombel: number; beban: number; jpTatapMuka: number; jpNonTatapMuka: number };
}

/** Kode di Excel yang sudah punya padanan tetap (bisa diubah lagi di Master Data). */
const KODE_TETAP: Record<string, string> = { PABP: 'PA', INDO: 'BI' };

const teks = (s: Sel | undefined): string => (s === null || s === undefined ? '' : String(s).trim());
/** Baris pertama sel nama saja: NIP dan tanggal lahir di baris berikutnya sengaja dibuang. */
const namaSaja = (s: Sel | undefined): string => (teks(s).split(/\r?\n/)[0] ?? '').trim();

function awalanKata(a: string, b: string): string {
  const x = a.split(/\s+/);
  const y = b.split(/\s+/);
  const hasil: string[] = [];
  for (let i = 0; i < Math.min(x.length, y.length) && x[i]?.toLowerCase() === y[i]?.toLowerCase(); i++) hasil.push(x[i] ?? '');
  return hasil.join(' ');
}

/** Mencari baris judul (berisi "MATA PELAJARAN") untuk tahu di mana tabel mulai. */
export function cariJudul(l: Lembar): number {
  return l.baris.findIndex((b) => b?.some((s) => /^mata\s*pelajaran$/i.test(teks(s))));
}

/**
 * Menafsirkan sheet format "PEMBAGIAN TUGAS" (contoh: Genap_Harizka).
 * Baris judul: tingkat (KELAS X/XI/XII), baris berikutnya jurusan, berikutnya nomor rombel; data mulai tiga baris di bawahnya.
 * Satu guru bisa punya beberapa baris mapel (sel nama kosong = guru di atasnya).
 */
export function tafsirTugas(l: Lembar): HasilImpor {
  const r0 = cariJudul(l);
  if (r0 < 0) throw new Error('Baris judul "MATA PELAJARAN" tidak ditemukan. Pastikan sheet yang dipilih benar.');
  const judul = l.baris[r0] ?? [];
  const cMapel = judul.findIndex((s) => /^mata\s*pelajaran$/i.test(teks(s)));
  const cKode = judul.findIndex((s) => /^kode$/i.test(teks(s)));
  const cNama = judul.findIndex((s) => /^nama/i.test(teks(s)));
  if (cMapel < 0 || cKode < 0 || cNama < 0) throw new Error('Kolom NAMA, MATA PELAJARAN, atau KODE tidak ditemukan pada baris judul.');
  const cJjm = judul.findIndex((s) => /^jjm\s*mapel$/i.test(teks(s)));
  const akhir = cJjm > 0 ? cJjm : judul.length;
  const peringatan: string[] = [];

  // --- kolom rombel
  type Kol = { c: number; tingkat: 'X' | 'XI' | 'XII'; jurusan: string; nomor: number };
  const kolom: Kol[] = [];
  let tingkat: 'X' | 'XI' | 'XII' | null = null;
  let jurusan = '';
  for (let c = cKode + 1; c < akhir; c++) {
    const t = /^kelas\s*(XII|XI|X)\b/i.exec(teks(judul[c]));
    if (t) {
      tingkat = (t[1] ?? '').toUpperCase() as 'X' | 'XI' | 'XII';
      jurusan = '';
    }
    const j = teks(l.baris[r0 + 1]?.[c]);
    if (j) jurusan = j.toUpperCase();
    const n = l.baris[r0 + 2]?.[c];
    if (tingkat && jurusan && typeof n === 'number') kolom.push({ c, tingkat, jurusan, nomor: n });
  }
  if (kolom.length === 0) throw new Error('Kolom rombel (KELAS / jurusan / nomor) tidak terbaca.');

  const rombel: Rombel[] = kolom.map((k, i) => ({
    id: `r${i + 1}`,
    tingkat: k.tingkat,
    jurusan: k.jurusan,
    nomor: k.nomor,
    kode: `${k.tingkat} ${k.jurusan} ${k.nomor}`,
  }));

  // --- baris data
  const guru: Guru[] = [];
  const mapel: Mapel[] = [];
  const namaPerMapel = new Map<string, string[]>();
  const mapelByKodeXl = new Map<string, Mapel>();
  const beban: Beban[] = [];
  let guruIni: Guru | null = null;
  let jpButuhBaris: Sel[] | null = null;

  for (let r = r0 + 3; r < l.baris.length; r++) {
    const b = l.baris[r] ?? [];
    const nama = namaSaja(b[cNama]);
    const namaMapel = teks(b[cMapel]);
    const kodeXl = teks(b[cKode]);
    if (nama) {
      guruIni = { id: `g${guru.length + 1}`, nama, kode: kodeGuruBerikut(guru.map((g) => g.kode)) };
      if (guru.some((g) => g.nama.toLowerCase() === nama.toLowerCase())) peringatan.push(`Nama guru ganda: ${nama}`);
      guru.push(guruIni);
    }
    if (!kodeXl && !namaMapel) {
      // baris jumlah di bawah tabel: JP kebutuhan per rombel
      if (!jpButuhBaris && kolom.some((k) => typeof b[k.c] === 'number')) jpButuhBaris = b;
      continue;
    }
    if (!guruIni) {
      peringatan.push(`Baris ${r + 1}: mapel "${namaMapel || kodeXl}" muncul sebelum ada nama guru, dilewati.`);
      continue;
    }
    const kunci = (kodeXl || namaMapel).toUpperCase();
    let m = mapelByKodeXl.get(kunci);
    if (!m) {
      const dipakai = mapel.map((x) => x.kode);
      let kode = KODE_TETAP[kunci] ?? (kunci.length <= 3 ? kunci : kunci.slice(0, 3));
      if (dipakai.includes(kode)) kode = usulKodeMapel(namaMapel || kunci, dipakai);
      m = { id: `m${mapel.length + 1}`, nama: namaMapel || kunci, kode };
      mapel.push(m);
      mapelByKodeXl.set(kunci, m);
      namaPerMapel.set(m.id, []);
    }
    if (namaMapel) namaPerMapel.get(m.id)?.push(namaMapel);

    let jumlah = 0;
    for (const [i, k] of kolom.entries()) {
      const v = b[k.c];
      if (v === null || v === undefined) continue;
      const rb = rombel[i];
      if (!rb) continue;
      const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
      if (!Number.isFinite(n) || n <= 0) {
        if (teks(v) !== '' && teks(v) !== '0') peringatan.push(`Baris ${r + 1}, ${rb.kode}: isi "${teks(v)}" bukan angka JP, dilewati.`);
        continue;
      }
      if (!Number.isInteger(n)) {
        peringatan.push(`Baris ${r + 1}, ${rb.kode}: JP ${n} bukan bilangan bulat, dilewati.`);
        continue;
      }
      jumlah += n;
      beban.push({
        id: `b${beban.length + 1}`,
        guruId: guruIni.id,
        mapelId: m.id,
        rombelId: rb.id,
        jp: n,
        timGuruIds: [],
        ruangPrioritas: [],
        ruangTerlarang: [],
        ...(kunci === 'PKL' ? { nonTatapMuka: true } : {}),
      });
    }
    // pemeriksa silang: jumlah JP baris ini vs kolom JJM MAPEL
    const jjm = cJjm >= 0 ? b[cJjm] : null;
    if (typeof jjm === 'number' && jjm !== jumlah) peringatan.push(`Baris ${r + 1} (${guruIni.nama}, ${m.kode}): jumlah JP ${jumlah} tidak sama dengan kolom JJM MAPEL ${jjm}.`);
  }

  // nama mapel: bila satu kode punya beberapa nama (mis. PABP Islam/Katolik/Kristen), pakai awalan kata yang sama
  for (const m of mapel) {
    const daftar = [...new Set(namaPerMapel.get(m.id) ?? [])];
    if (daftar.length > 1) {
      const awal = daftar.reduce((a, b) => awalanKata(a, b));
      m.nama = awal || (daftar[0] ?? m.nama);
    } else if (daftar[0]) m.nama = daftar[0];
  }

  // pendidikan agama (PABP): beberapa guru pada mapel dan rombel yang sama = kelompok paralel
  for (const m of mapel) {
    if (!/^PABP$/i.test([...mapelByKodeXl].find(([, v]) => v === m)?.[0] ?? '')) continue;
    const per = new Map<string, Beban[]>();
    for (const b of beban.filter((x) => x.mapelId === m.id)) per.set(b.rombelId, [...(per.get(b.rombelId) ?? []), b]);
    for (const l2 of per.values()) if (new Set(l2.map((x) => x.guruId)).size > 1) for (const b of l2) b.paralel = m.kode;
  }
  // mapel lain yang diampu lebih dari satu guru di satu rombel: dilaporkan, tidak ditebak
  const perMR = new Map<string, Set<string>>();
  for (const b of beban) {
    const kunci = `${b.mapelId}|${b.rombelId}`;
    perMR.set(kunci, (perMR.get(kunci) ?? new Set()).add(b.guruId));
  }
  const rb = new Map(rombel.map((x) => [x.id, x.kode]));
  const mp = new Map(mapel.map((x) => [x.id, x]));
  for (const [kunci, gs] of perMR) {
    if (gs.size < 2) continue;
    const [mid, rid] = kunci.split('|');
    const m = mp.get(mid ?? '');
    if (m && m.kode !== 'PA' && m.kode !== 'PKL') peringatan.push(`${m.kode} di ${rb.get(rid ?? '') ?? '?'} diampu ${gs.size} guru. Atur sebagai team teaching atau paralel di tab Beban & JP.`);
  }

  if (jpButuhBaris) kolom.forEach((k, i) => {
    const v = jpButuhBaris?.[k.c];
    const rr = rombel[i];
    if (typeof v === 'number' && rr) rr.jpButuh = v;
  });

  // pemeriksa silang: jumlah JP tatap muka per rombel (paralel dihitung sekali) vs baris jumlah di bawah tabel
  const hampirPkl: string[] = [];
  for (const rr of rombel) {
    if (rr.jpButuh === undefined) continue;
    const jumlah = jpRombel(beban.filter((b) => b.rombelId === rr.id));
    if (jumlah === rr.jpButuh) continue;
    if (jumlah < rr.jpButuh / 2) hampirPkl.push(rr.kode);
    else peringatan.push(`${rr.kode}: jumlah beban ${jumlah} JP, baris jumlah di Excel ${rr.jpButuh} JP.`);
  }
  if (hampirPkl.length) peringatan.push(`${hampirPkl.join(', ')}: hampir seluruhnya PKL, jadi JP tatap muka jauh di bawah baris jumlah Excel (diabaikan).`);

  const tm = beban.filter((b) => !b.nonTatapMuka).reduce((a, b) => a + b.jp, 0);
  const ntm = beban.filter((b) => b.nonTatapMuka).reduce((a, b) => a + b.jp, 0);
  return {
    guru,
    mapel,
    rombel,
    beban,
    peringatan,
    ringkas: { guru: guru.length, mapel: mapel.length, rombel: rombel.length, beban: beban.length, jpTatapMuka: tm, jpNonTatapMuka: ntm },
  };
}

/** Menerapkan hasil impor: mengganti guru, mapel, rombel, dan beban; jadwal lama dikosongkan karena mengacu ke beban lama. */
export function terapkanImpor(p: Proyek, h: HasilImpor): void {
  p.master.guru = h.guru;
  p.master.mapel = h.mapel;
  p.master.rombel = h.rombel;
  p.beban = h.beban;
  // aturan yang menunjuk guru atau rombel lama tidak lagi berlaku; aturan per jurusan dipertahankan
  p.aturan = p.aturan.filter((a) => (a.jenis === 'ruangTerlarang' ? !a.rombelId : false));
  for (const v of p.versi) v.slots = [];
}
