import type { Aturan, Beban, Guru, Kegiatan, Mapel, Proyek, Rombel, Ruang, Slot, VersiJadwal } from '../model/tipe';
import { VERSI_DATA_SAAT_INI } from '../model/tipe';
import { skemaBawaan } from '../model/skema';
import { usulKodeGuru } from '../model/kode';
import { ruangSekolah } from '../model/ruangSekolah';
import { aturanRuangJurusan, isiJenisRuangMapel } from '../model/sekolah';
import { tebakJenis } from './imporKalender';

/** Format berkas jadwal-te.html (v1): master, lalu tiap periode membawa tugas dan jadwalnya sendiri. */
export interface BerkasJadwalTe {
  v: number;
  aktif?: string;
  hari: { id: string; nama: string; jp: { mulai: string; selesai: string; label: string | null }[] }[];
  guru: { id: string; kode: string; nama: string }[];
  mapel: { id: string; kode: string; nama: string; elemen?: boolean; induk?: string }[];
  kelas: { id: string; nama: string; tingkat: string }[];
  ruang: { id: string; kode: string; nama: string }[];
  periode: {
    id: string;
    nama: string;
    mulai: string;
    selesai: string;
    pkl?: string[];
    tugas: { id: string; kelas: string; mapel: string; guru: string; jp: number }[];
    jadwal: { id: string; tugas: string; ruang: string | null; hari: string; jp: number; len: number }[];
  }[];
}

export interface LaporanJadwalTe {
  versi: { id: string; nama: string; periode: string[]; beban: number; jpBeban: number; jpTerjadwal: number }[];
  /** hal yang perlu diketahui pembaca: penyesuaian nomor jam, JP kurang/lebih, ruang kosong, dll. */
  catatan: string[];
}

/** Nama untuk mapel yang kosong pada berkas; dan induk elemen KK TE (keterangan Benny, 26 Nov 2026). */
const NAMA_KOSONG: Record<string, string> = { IPAS: 'Projek IPAS', IT: 'Informatika', PJOK: 'Penjasorkes' };
const INDUK_ELEMEN: Record<string, { kode: string; nama: string }> = {
  DLE: { kode: 'DTE', nama: 'Dasar-dasar Teknik Elektronika' },
  DRE: { kode: 'DTE', nama: 'Dasar-dasar Teknik Elektronika' },
  TKB: { kode: 'DTE', nama: 'Dasar-dasar Teknik Elektronika' },
  PRE: { kode: 'TAV', nama: 'Teknik Audio Video' },
  PMM: { kode: 'TAV', nama: 'Teknik Audio Video' },
  PSRT: { kode: 'TAV', nama: 'Teknik Audio Video' },
  PISAV: { kode: 'TAV', nama: 'Teknik Audio Video' },
  PISS: { kode: 'TAV', nama: 'Teknik Audio Video' },
};
const HARI = ['sen', 'sel', 'rab', 'kam', 'jum', 'sab'];

/** Menandai periode yang jadwalnya identik (isi tugas dan jadwal sama) agar memakai satu versi. */
function tandaPeriode(per: BerkasJadwalTe['periode'][number]): string {
  const tm = new Map(per.tugas.map((t) => [t.id, t]));
  const isi = per.jadwal
    .map((j) => {
      const t = tm.get(j.tugas);
      return t ? [t.kelas, t.mapel, t.guru, t.jp, j.ruang, j.hari, j.jp, j.len].join('|') : '';
    })
    .sort();
  const tg = per.tugas.map((t) => [t.kelas, t.mapel, t.guru, t.jp].join('|')).sort();
  return JSON.stringify([tg, isi]);
}

const jenisPeriode = (nama: string, adaPkl: boolean): Kegiatan['jenis'] => {
  const j = tebakJenis(nama);
  return j !== 'lain' ? j : adaPkl ? 'PKL' : 'lain';
};

/**
 * Mengubah berkas jadwal-te menjadi Proyek. Tiap periode menjadi kegiatan kalender; periode dengan isi identik berbagi satu versi jadwal;
 * tiap versi membawa beban (tugas) sendiri lewat `Beban.versiId`. Rombel yang tidak punya tugas pada periode itu, atau berstatus PKL,
 * dinyatakan tidak aktif pada kegiatan tersebut.
 *
 * Nomor jam: jadwal-te menghitung baris waktu apa adanya, sedangkan aplikasi ini menghitung KBM saja (Pembiasaan bukan jam ke-1).
 * Bila pada suatu hari sebuah periode tidak pernah memakai baris ke-1 yang berlabel Pembiasaan dan jadwalnya berakhir tepat di baris terakhir,
 * nomor jam periode itu pada hari itu digeser satu (dilaporkan di `catatan`).
 */
export function dariJadwalTe(src: BerkasJadwalTe, nama: string): { proyek: Proyek; laporan: LaporanJadwalTe } {
  const catatan: string[] = [];
  const skema = skemaBawaan();
  const polaReguler = src.hari.slice(0, 5).map((h) => {
    const s = skema.find((x) => x.id === `skema${h.jp.length}`);
    if (!s) throw new Error(`Hari ${h.nama}: ${h.jp.length} baris waktu tidak punya skema bawaan.`);
    return s.id;
  });

  // ---- master
  const dipakaiGuru = new Set(src.periode.flatMap((p) => p.tugas.map((t) => t.guru)));
  const kodeGuru: string[] = [];
  const guru: Guru[] = [];
  for (const g of src.guru.filter((x) => dipakaiGuru.has(x.id))) {
    let kode = g.kode.toUpperCase();
    if (kodeGuru.includes(kode)) {
      const baru = usulKodeGuru(g.nama, kodeGuru);
      catatan.push(`Kode guru ${kode} dipakai dua orang; ${g.nama} memakai ${baru}.`);
      kode = baru;
    }
    kodeGuru.push(kode);
    guru.push({ id: g.id, kode, nama: g.nama });
  }

  const dipakaiMapel = new Set(src.periode.flatMap((p) => p.tugas.map((t) => t.mapel)));
  const mapel: Mapel[] = [];
  const indukDibuat = new Map<string, string>();
  for (const m of src.mapel.filter((x) => dipakaiMapel.has(x.id))) {
    const e: Mapel = { id: m.id, kode: m.kode, nama: m.nama.trim() || NAMA_KOSONG[m.kode.toUpperCase()] || m.kode };
    const ind = INDUK_ELEMEN[m.kode.toUpperCase()];
    if (ind) {
      let id = indukDibuat.get(ind.kode);
      if (!id) {
        id = `m_${ind.kode.toLowerCase()}`;
        indukDibuat.set(ind.kode, id);
        mapel.push({ id, kode: ind.kode, nama: ind.nama });
      }
      e.induk = id;
    }
    mapel.push(e);
  }
  const kodeMapel = mapel.map((m) => m.kode);
  const gandaMapel = kodeMapel.filter((k, i) => kodeMapel.indexOf(k) !== i);
  if (gandaMapel.length) throw new Error(`Kode mapel ganda pada mapel yang dipakai: ${[...new Set(gandaMapel)].join(', ')}`);

  const rombel: Rombel[] = src.kelas.map((k) => {
    const m = /^(XII|XI|X)\s+(\S+)\s+(\d+)$/.exec(k.nama.trim());
    if (!m) throw new Error(`Nama kelas tidak dikenal: "${k.nama}" (harus seperti "XI TE 2").`);
    return { id: k.id, tingkat: m[1] as Rombel['tingkat'], jurusan: (m[2] as string).toUpperCase(), nomor: Number(m[3]), kode: `${m[1]} ${(m[2] as string).toUpperCase()} ${m[3]}` };
  });

  // ruang: daftar site plan; ruang pada berkas dicocokkan lewat kode (tanpa membedakan huruf besar/kecil)
  const ruang: Ruang[] = ruangSekolah();
  const idRuang = new Map(ruang.map((r) => [r.kode.toUpperCase(), r.id]));
  const petaRuang = new Map<string, string>();
  for (const r of src.ruang) {
    let id = idRuang.get(r.kode.toUpperCase());
    if (!id) {
      id = `u${ruang.length + 1}`;
      ruang.push({ id, kode: r.kode, nama: r.nama || r.kode, jenis: 'teori' });
      idRuang.set(r.kode.toUpperCase(), id);
      catatan.push(`Ruang ${r.kode} tidak ada di daftar site plan; ditambahkan sebagai ruang teori.`);
    }
    petaRuang.set(r.id, id);
  }

  // ---- versi, beban, slot
  const versi: VersiJadwal[] = [];
  const beban: Beban[] = [];
  const kegiatan: Kegiatan[] = [];
  const laporan: LaporanJadwalTe['versi'] = [];
  const versiDariTanda = new Map<string, VersiJadwal>();
  const rombelAda = new Set(rombel.map((r) => r.id));
  const baris = (hari: string) => src.hari.find((h) => h.id === hari);

  for (const per of src.periode) {
    const tanda = tandaPeriode(per);
    let v = versiDariTanda.get(tanda);
    if (!v) {
      const pertama = versi.length === 0;
      const id = pertama ? 'v-reguler' : `v-${per.id.replace(/^p_/, '')}`;
      v = { id, nama: pertama ? `${per.nama} (jadwal reguler)` : per.nama, jenis: pertama ? 'reguler' : 'varian', slots: [] };
      versi.push(v);
      versiDariTanda.set(tanda, v);

      const tm = new Map(per.tugas.map((t) => [t.id, t]));
      // penyesuaian nomor jam per hari
      const geser = new Map<string, number>();
      for (const hid of HARI) {
        const h = baris(hid);
        const blok = per.jadwal.filter((j) => j.hari === hid);
        if (!h || !blok.length) continue;
        const awalPembiasaan = h.jp[0]?.label === 'Pembiasaan';
        const mulaiMin = Math.min(...blok.map((j) => j.jp));
        const akhirMaks = Math.max(...blok.map((j) => j.jp + j.len - 1));
        if (awalPembiasaan && mulaiMin >= 2 && akhirMaks === h.jp.length) {
          geser.set(hid, 1);
          catatan.push(`${per.nama}: ${h.nama} dihitung dari baris Pembiasaan; nomor jam digeser −1 (baris 2–${h.jp.length} → jam 1–${h.jp.length - 1}).`);
        }
      }
      const bebanId = new Map<string, string>();
      for (const t of per.tugas) {
        if (!rombelAda.has(t.kelas)) throw new Error(`Tugas ${t.id}: kelas ${t.kelas} tidak ada.`);
        const id = beban.some((b) => b.id === t.id) ? `${t.id}@${v.id}` : t.id;
        bebanId.set(t.id, id);
        const blok = per.jadwal.filter((j) => j.tugas === t.id).sort((a, b) => HARI.indexOf(a.hari) - HARI.indexOf(b.hari) || a.jp - b.jp);
        const pola = blok.map((j) => j.len);
        const hitung = new Map<string, number>();
        for (const j of blok) if (j.ruang && petaRuang.has(j.ruang)) hitung.set(petaRuang.get(j.ruang) as string, (hitung.get(petaRuang.get(j.ruang) as string) ?? 0) + j.len);
        beban.push({
          id, guruId: t.guru, mapelId: t.mapel, rombelId: t.kelas, jp: t.jp,
          ...(pola.length && pola.reduce((a, b) => a + b, 0) === t.jp ? { pola } : {}),
          timGuruIds: [], ruangPrioritas: [...hitung].sort((a, b) => b[1] - a[1]).map(([r]) => r), ruangTerlarang: [], versiId: v.id,
        });
      }
      let jpTerjadwal = 0;
      for (const j of per.jadwal) {
        const t = tm.get(j.tugas);
        if (!t) throw new Error(`Jadwal ${j.id}: tugas ${j.tugas} tidak ada.`);
        const hari = HARI.indexOf(j.hari);
        if (hari < 0) throw new Error(`Jadwal ${j.id}: hari "${j.hari}" tidak dikenal.`);
        const awal = j.jp - (geser.get(j.hari) ?? 0);
        const rid = j.ruang ? petaRuang.get(j.ruang) : undefined;
        if (j.ruang && !rid) catatan.push(`${per.nama}: jadwal ${j.id} memakai ruang yang tidak ada di daftar ruang; dikosongkan.`);
        for (let n = 0; n < j.len; n++) {
          const bid = bebanId.get(t.id) as string;
          (v.slots as Slot[]).push({ id: `${bid}-${hari}-${awal + n}`, bebanId: bid, hari, jam: awal + n, ruangId: rid ?? '' });
          jpTerjadwal++;
        }
      }
      const kurang = per.tugas.map((t) => ({ t, n: per.jadwal.filter((j) => j.tugas === t.id).reduce((a, j) => a + j.len, 0) })).filter((x) => x.n !== x.t.jp);
      const jpBeban = per.tugas.reduce((a, t) => a + t.jp, 0);
      if (kurang.length) {
        const sel = kurang.reduce((a, x) => a + (x.t.jp - x.n), 0);
        catatan.push(`${per.nama}: ${kurang.length} tugas tidak persis terjadwal sesuai JP (selisih total ${Math.abs(sel)} JP ${sel >= 0 ? 'kurang' : 'lebih'}).`);
      }
      laporan.push({ id: v.id, nama: v.nama, periode: [per.id], beban: per.tugas.length, jpBeban, jpTerjadwal });
    } else {
      laporan.find((x) => x.id === v?.id)?.periode.push(per.id);
    }

    const punya = new Set(per.tugas.map((t) => t.kelas));
    const tdk = rombel.filter((r) => (per.pkl ?? []).includes(r.id) || !punya.has(r.id)).map((r) => r.id);
    kegiatan.push({
      id: `k-${per.id.replace(/^p_/, '')}`, nama: per.nama, jenis: jenisPeriode(per.nama, (per.pkl ?? []).length > 0), mulai: per.mulai, selesai: per.selesai,
      rombelTidakAktif: tdk, versiId: v.id, catatan: `Dari periode ${per.id} di jadwal-te. Rombel tanpa tugas pada periode ini dan rombel PKL dinyatakan tidak aktif.`,
    });
  }

  const proyek: Proyek = {
    versiSkemaData: VERSI_DATA_SAAT_INI, nama, skema, polaReguler, penggantiManual: null, kalender: kegiatan,
    master: { guru, mapel, rombel, ruang }, beban, aturan: [] as Aturan[], versi,
    ...(src.aktif && kegiatan.some((k) => k.id === `k-${src.aktif?.replace(/^p_/, '')}`) ? { periodeAktifId: `k-${src.aktif.replace(/^p_/, '')}` } : {}),
  };
  isiJenisRuangMapel(proyek);
  proyek.aturan = aturanRuangJurusan(proyek);
  for (const g of proyek.master.guru) {
    const set = new Set(proyek.beban.filter((b) => b.guruId === g.id || b.timGuruIds.includes(g.id)).map((b) => b.mapelId));
    if (set.size) g.mapelIds = [...set];
  }
  return { proyek, laporan: { versi: laporan, catatan } };
}
