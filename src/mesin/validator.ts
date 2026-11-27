import type { Aturan, Beban, Proyek, Slot } from '../model/tipe';
import { NAMA_HARI } from '../model/tipe';
import { petakanSlot } from '../model/jadwal';
import { pengunciRuang, ruangTerkunciPada, tanpaRuangPada, type AturanPekan } from '../model/aturanKegiatan';

export type Kategori = 'bentrok' | 'aturan' | 'gap' | 'kapasitas';
export type JenisMasalah =
  | 'bentrok-guru'
  | 'bentrok-rombel'
  | 'bentrok-ruang'
  | 'ruang-terlarang'
  | 'ruang-dikunci'
  | 'pengawas-bentrok'
  | 'guru-tidak-tersedia'
  | 'ruang-tidak-ada'
  | 'beban-tidak-ada'
  | 'jp-lebih'
  | 'jp-kurang'
  | 'ruang-belum'
  | 'di-luar-kapasitas';

export interface Masalah {
  id: string;
  jenis: JenisMasalah;
  kategori: Kategori;
  pesan: string;
  slotIds: string[];
  bebanId?: string;
  rombelId?: string;
  /** Diisi (catatan keputusan) bila admin menerima pelanggaran ini; tidak dihitung sebagai bentrok. */
  diterima?: string;
}

/** Pelanggaran wajib = bentrok + aturan. Itulah yang dihitung pada lencana "N bentrok". */
export const adalahPelanggaran = (m: Masalah): boolean => m.kategori === 'bentrok' || m.kategori === 'aturan';

export interface OpsiPeriksa {
  /** id skema untuk Senin..Jumat pada pekan yang dilihat; bila ada, slot di luar kapasitas dilaporkan */
  skemaPerHari?: (string | null)[];
  /** rombel yang tidak aktif pada periode yang dilihat (mis. PKL): kekurangan JP-nya tidak dilaporkan */
  rombelTidakAktif?: ReadonlySet<string>;
  /** aturan kegiatan pada pekan yang dilihat: ruang terkunci, tugas mengawas, rombel tanpa ruang */
  aturan?: AturanPekan;
}

/**
 * Ruang yang tidak boleh dipakai suatu beban: ruang terlarang di beban, aturan "ruang terlarang" (per rombel atau jurusan),
 * ditambah semua ruang di luar daftar putih yang berlaku: ruang rombel, ruang mapel, dan aturan "guru hanya boleh memakai ruang tertentu"
 * (guru utama dan tim). Bila ada beberapa daftar putih, ruang harus lolos semuanya.
 */
export function ruangDilarang(p: Pick<Proyek, 'aturan' | 'master'>, beban: Beban): Set<string> {
  const r = new Set(beban.ruangTerlarang);
  const rombel = p.master.rombel.find((x) => x.id === beban.rombelId);
  for (const a of p.aturan) {
    if (a.jenis !== 'ruangTerlarang') continue;
    if ((a.rombelId && a.rombelId === beban.rombelId) || (a.jurusan && rombel && a.jurusan === rombel.jurusan)) a.ruangIds.forEach((x) => r.add(x));
  }
  const putih: Set<string>[] = [];
  if (rombel?.ruangIds?.length) putih.push(new Set(rombel.ruangIds));
  const mapel = p.master.mapel.find((m) => m.id === beban.mapelId);
  if (mapel?.ruangIds?.length) putih.push(new Set(mapel.ruangIds));
  const gurus = new Set([beban.guruId, ...beban.timGuruIds]);
  for (const a of p.aturan) if (a.jenis === 'guruRuang' && gurus.has(a.guruId) && a.ruangIds.length) putih.push(new Set(a.ruangIds));
  if (putih.length) for (const u of p.master.ruang) if (!putih.every((s) => s.has(u.id))) r.add(u.id);
  return r;
}

function guruTidakTersedia(a: Aturan, guruIds: string[], s: Slot): boolean {
  return a.jenis === 'guruTidakTersedia' && guruIds.includes(a.guruId) && a.hari === s.hari && (a.jam.length === 0 || a.jam.includes(s.jam));
}

/** Memeriksa seluruh slot. Waktu linear terhadap jumlah slot (pengelompokan per hari+jam). */
export function periksa(p: Proyek, slots: Slot[], opsi: OpsiPeriksa = {}): Masalah[] {
  const hasil: Masalah[] = [];
  const bebanById = new Map(p.beban.map((b) => [b.id, b]));
  const guruKode = new Map(p.master.guru.map((g) => [g.id, g.kode]));
  const mapelKode = new Map(p.master.mapel.map((m) => [m.id, m.kode]));
  const rombelKode = new Map(p.master.rombel.map((r) => [r.id, r.kode]));
  const ruangById = new Map(p.master.ruang.map((r) => [r.id, r]));
  const gk = (id: string) => guruKode.get(id) ?? '?';
  const deskripsi = (b: Beban) => `${rombelKode.get(b.rombelId) ?? '?'} ${mapelKode.get(b.mapelId) ?? '?'}`;
  const waktu = (hari: number, jam: number) => `${NAMA_HARI[hari]}, pelajaran ke-${jam}`;

  const perKunci = new Map<string, Slot[]>();
  for (const s of slots) {
    const k = `${s.hari}:${s.jam}`;
    const l = perKunci.get(k);
    if (l) l.push(s);
    else perKunci.set(k, [s]);
  }

  for (const [kunci, grup] of perKunci) {
    const byGuru = new Map<string, Slot[]>();
    const byRombel = new Map<string, Slot[]>();
    const byRuang = new Map<string, Slot[]>();
    const tambah = (m: Map<string, Slot[]>, k: string, s: Slot) => {
      const l = m.get(k);
      if (l) l.push(s);
      else m.set(k, [s]);
    };
    for (const s of grup) {
      const b = bebanById.get(s.bebanId);
      if (!b) {
        hasil.push({ id: `beban-tidak-ada:${s.id}`, jenis: 'beban-tidak-ada', kategori: 'aturan', pesan: `Slot di ${waktu(s.hari, s.jam)} mengacu ke beban yang sudah tidak ada.`, slotIds: [s.id] });
        continue;
      }
      for (const g of [b.guruId, ...b.timGuruIds]) tambah(byGuru, g, s);
      tambah(byRombel, b.rombelId, s);
      if (s.ruangId) tambah(byRuang, s.ruangId, s);
    }
    const [hari, jam] = kunci.split(':').map(Number) as [number, number];

    for (const [gid, l] of byGuru) {
      if (l.length < 2) continue;
      const ket = l.map((s) => deskripsi(bebanById.get(s.bebanId) as Beban)).join(' dan ');
      hasil.push({ id: `bentrok-guru:${gid}:${kunci}`, jenis: 'bentrok-guru', kategori: 'bentrok', pesan: `Guru ${gk(gid)} mengajar ganda pada ${waktu(hari, jam)}: ${ket}.`, slotIds: l.map((s) => s.id) });
    }
    for (const [rid, l] of byRombel) {
      // slot dari kelompok paralel yang sama dihitung satu unit
      const unit = new Set(l.map((s) => {
        const b = bebanById.get(s.bebanId) as Beban;
        return b.paralel ? `p:${b.paralel}` : s.id;
      }));
      if (unit.size < 2) continue;
      const ket = l.map((s) => `${mapelKode.get((bebanById.get(s.bebanId) as Beban).mapelId) ?? '?'} (${gk((bebanById.get(s.bebanId) as Beban).guruId)})`).join(' dan ');
      hasil.push({ id: `bentrok-rombel:${rid}:${kunci}`, jenis: 'bentrok-rombel', kategori: 'bentrok', pesan: `Rombel ${rombelKode.get(rid) ?? '?'} punya dua pelajaran sekaligus pada ${waktu(hari, jam)}: ${ket}.`, slotIds: l.map((s) => s.id), rombelId: rid });
    }
    for (const [uid, l] of byRuang) {
      const ruang = ruangById.get(uid);
      if (l.length < 2 || ruang?.bersama) continue;
      const ket = l.map((s) => deskripsi(bebanById.get(s.bebanId) as Beban)).join(' dan ');
      hasil.push({ id: `bentrok-ruang:${uid}:${kunci}`, jenis: 'bentrok-ruang', kategori: 'bentrok', pesan: `Ruang ${ruang?.kode ?? '?'} dipakai ganda pada ${waktu(hari, jam)}: ${ket}.`, slotIds: l.map((s) => s.id) });
    }
  }

  // pemeriksaan per slot
  for (const s of slots) {
    const b = bebanById.get(s.bebanId);
    if (!b) continue;
    const ket = `${deskripsi(b)} pada ${waktu(s.hari, s.jam)}`;
    if (s.ruangId) {
      const ruang = ruangById.get(s.ruangId);
      if (!ruang) hasil.push({ id: `ruang-tidak-ada:${s.id}`, jenis: 'ruang-tidak-ada', kategori: 'aturan', pesan: `${ket} memakai ruang yang sudah tidak ada.`, slotIds: [s.id], bebanId: b.id, rombelId: b.rombelId });
      else if (ruangDilarang(p, b).has(s.ruangId)) hasil.push({ id: `ruang-terlarang:${s.id}`, jenis: 'ruang-terlarang', kategori: 'aturan', pesan: `${ket} memakai ruang ${ruang.kode} yang terlarang untuk beban ini.`, slotIds: [s.id], bebanId: b.id, rombelId: b.rombelId });
      else if (ruangTerkunciPada(opsi.aturan, s.hari, s.jam).has(s.ruangId)) {
        const kg = pengunciRuang(opsi.aturan, s.hari, s.jam, s.ruangId) ?? 'kegiatan';
        hasil.push({ id: `ruang-dikunci:${s.id}`, jenis: 'ruang-dikunci', kategori: 'aturan', pesan: `${ket} memakai ruang ${ruang.kode} yang terkunci untuk ${kg}.`, slotIds: [s.id], bebanId: b.id, rombelId: b.rombelId });
      }
    } else if (p.master.ruang.length > 0 && !tanpaRuangPada(opsi.aturan, s.hari, b.rombelId)) {
      hasil.push({ id: `ruang-belum:${s.id}`, jenis: 'ruang-belum', kategori: 'gap', pesan: `${ket} belum punya ruang.`, slotIds: [s.id], bebanId: b.id, rombelId: b.rombelId });
    }
    const gurus = [b.guruId, ...b.timGuruIds];
    for (const a of p.aturan) {
      if (guruTidakTersedia(a, gurus, s)) {
        const gid = (a as { guruId: string }).guruId;
        hasil.push({ id: `guru-tidak-tersedia:${a.id}:${s.id}`, jenis: 'guru-tidak-tersedia', kategori: 'aturan', pesan: `Guru ${gk(gid)} tidak tersedia pada ${waktu(s.hari, s.jam)}, tetapi dijadwalkan (${deskripsi(b)}).`, slotIds: [s.id], bebanId: b.id, rombelId: b.rombelId });
      }
    }
    for (const t of opsi.aturan?.pengawas ?? []) {
      if (t.hari !== s.hari || !t.jam.includes(s.jam) || !gurus.includes(t.guruId)) continue;
      hasil.push({ id: `pengawas-bentrok:${t.guruId}:${s.id}`, jenis: 'pengawas-bentrok', kategori: 'aturan', pesan: `Guru ${gk(t.guruId)} mengawas ${t.kegiatan} (${t.waktu}) pada ${waktu(s.hari, s.jam)}, tetapi dijadwalkan mengajar (${deskripsi(b)}).`, slotIds: [s.id], bebanId: b.id, rombelId: b.rombelId });
    }
  }

  // JP per beban
  const hitung = new Map<string, number>();
  for (const s of slots) hitung.set(s.bebanId, (hitung.get(s.bebanId) ?? 0) + 1);
  for (const b of p.beban) {
    if (b.nonTatapMuka || opsi.rombelTidakAktif?.has(b.rombelId)) continue;
    const n = hitung.get(b.id) ?? 0;
    const sisa = b.jp - n;
    if (sisa > 0) hasil.push({ id: `jp-kurang:${b.id}`, jenis: 'jp-kurang', kategori: 'gap', pesan: `${deskripsi(b)} (${gk(b.guruId)}) baru ${n} dari ${b.jp} JP; kurang ${sisa}.`, slotIds: [], bebanId: b.id, rombelId: b.rombelId });
    else if (sisa < 0) hasil.push({ id: `jp-lebih:${b.id}`, jenis: 'jp-lebih', kategori: 'aturan', pesan: `${deskripsi(b)} (${gk(b.guruId)}) terjadwal ${n} JP, melebihi beban ${b.jp} JP.`, slotIds: slots.filter((s) => s.bebanId === b.id).map((s) => s.id), bebanId: b.id, rombelId: b.rombelId });
  }

  if (opsi.skemaPerHari) {
    for (const s of petakanSlot(slots, opsi.skemaPerHari, p.skema).tampungan) {
      const b = bebanById.get(s.bebanId);
      if (!b) continue;
      hasil.push({ id: `di-luar-kapasitas:${s.id}`, jenis: 'di-luar-kapasitas', kategori: 'kapasitas', pesan: `${deskripsi(b)} di ${waktu(s.hari, s.jam)} tidak muat pada skema pekan ini.`, slotIds: [s.id], bebanId: b.id, rombelId: b.rombelId });
    }
  }
  return hasil;
}

export function masalahPerSlot(masalah: Masalah[]): Map<string, Masalah[]> {
  const m = new Map<string, Masalah[]>();
  for (const x of masalah) for (const id of x.slotIds) {
    const l = m.get(id);
    if (l) l.push(x);
    else m.set(id, [x]);
  }
  return m;
}
