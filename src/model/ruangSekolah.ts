import type { Beban, Proyek, Ruang } from './tipe';
import { tentukanRuang } from '../mesin/penempatan';

type Baris = [kode: string, nama: string, jenis: Ruang['jenis'], dijadwalkan: boolean, kategori: string];

/**
 * Daftar ruang menurut "Site plan ruang dan blok gedung 2026" (SMK N 1 Bansari), keterangan gedung B sampai S.
 * Gedung A (kantor), E (BK, Waka, Managemen, IT), F (R. Guru), dan H (Perpustakaan) tidak dimasukkan.
 * Kolom terakhir = ikut dijadwalkan. Ruang guru/instruktur/teknisi diberi false, begitu pula B2 (studio), C2 (gudang sound system, belum jadi ruang kelas),
 * dan D2 (ruang server/network) sesuai keterangan Benny (26 Nov 2026). Bisa diubah di Master Data.
 * Ruang kelas memakai kode "RK." seperti di aSc Timetables dan jadwal-te (RK.J1 dst.).
 */
const DAFTAR: Baris[] = [
  ['B1', 'R. Guru TE', 'teori', false, 'Non-kelas'],
  ['B2', 'R. Studio TE', 'praktik', false, 'Lab TE'],
  ['B3', 'RP. Audio Video TE', 'praktik', true, 'Lab TE'],
  ['C1', 'RP. Eldas TE', 'praktik', true, 'Lab TE'],
  ['C2', 'RP. Workshop TE', 'praktik', false, 'Lab TE'],
  ['D1', 'RP. Home Appliances TE', 'praktik', true, 'Lab TE'],
  ['D2', 'R. Network TE', 'praktik', false, 'Lab TE'],
  ['G1', 'Lab. Komputer 1', 'lab', true, 'Lab umum'],
  ['G2', 'Lab. DKV 3', 'lab', true, 'Lab DKV'],
  ['G3', 'Lab. DKV 4', 'lab', true, 'Lab DKV'],
  ['I1', 'Lab. IPAS', 'lab', true, 'Lab umum'],
  ['I2', 'R. Instruktur DKV', 'teori', false, 'Non-kelas'],
  ['I3', 'Lab. DKV 1', 'lab', true, 'Lab DKV'],
  ['I4', 'R. Studio DKV', 'praktik', true, 'Lab DKV'],
  ['RK.J1', 'Ruang Kelas J1', 'teori', true, 'Ruang teori'],
  ['RK.J2', 'Ruang Kelas J2', 'teori', true, 'Ruang teori'],
  ['RK.J3', 'Ruang Kelas J3', 'teori', true, 'Ruang teori'],
  ['RK.K1', 'Ruang Kelas K1', 'teori', true, 'Ruang teori'],
  ['RK.K2', 'Ruang Kelas K2', 'teori', true, 'Ruang teori'],
  ['RK.K3', 'Ruang Kelas K3', 'teori', true, 'Ruang teori'],
  ['RK.L1', 'Ruang Kelas L1', 'teori', true, 'Ruang teori'],
  ['RK.L2', 'Ruang Kelas L2', 'teori', true, 'Ruang teori'],
  ['M1', 'Lab. Pembenihan', 'lab', true, 'Lab AT'],
  ['M2', 'Lab. Hama', 'lab', true, 'Lab AT'],
  ['M3', 'Lab. Kultur Jaringan', 'lab', true, 'Lab AT'],
  ['M4', 'R. Instruktur AT 1', 'teori', false, 'Non-kelas'],
  ['N1', 'Lab. Analisis Tanah', 'lab', true, 'Lab AT'],
  ['N2', 'Lab. Hidroponik', 'lab', true, 'Lab AT'],
  ['N3', 'Lab. Pascapanen', 'lab', true, 'Lab AT'],
  ['N4', 'R. Teknisi AT', 'teori', false, 'Non-kelas'],
  ['O1', 'Lab. PHPS', 'lab', true, 'Lab AT'],
  ['O2', 'R. Instruktur AT 2', 'teori', false, 'Non-kelas'],
  ['O3', 'Lab. PHPO', 'lab', true, 'Lab AT'],
  ['RK.P1', 'Ruang Kelas P1', 'teori', true, 'Ruang teori'],
  ['RK.P2', 'Ruang Kelas P2', 'teori', true, 'Ruang teori'],
  ['Q', 'Lab. DKV 2', 'lab', true, 'Lab DKV'],
  ['RK.R1', 'Ruang Kelas R1', 'teori', true, 'Ruang teori'],
  ['RK.R2', 'Ruang Kelas R2', 'teori', true, 'Ruang teori'],
  ['RK.R3', 'Ruang Kelas R3', 'teori', true, 'Ruang teori'],
  ['RK.S1', 'Ruang Kelas S1', 'teori', true, 'Ruang teori'],
  ['RK.S2', 'Ruang Kelas S2', 'teori', true, 'Ruang teori'],
  ['LAP', 'Lapangan Olahraga', 'lapangan', true, 'Lapangan'],
];

export function ruangSekolah(): Ruang[] {
  return DAFTAR.map(([kode, nama, jenis, dijadwalkan, kategori], i) => ({
    id: `u${i + 1}`,
    kode,
    nama,
    jenis,
    dijadwalkan,
    kategori,
    ...(jenis === 'lapangan' ? { bersama: true } : {}),
  }));
}

/**
 * Mengganti daftar ruang dengan daftar sekolah. Rujukan ke ruang lama (prioritas, terlarang, aturan, slot) dipertahankan
 * bila kodenya ada di daftar baru; selain itu dilepas. Slot yang ruangnya hilang dicarikan ruang baru.
 */
export function terapkanRuangSekolah(p: Proyek): void {
  const lama = new Map(p.master.ruang.map((r) => [r.id, r.kode.toUpperCase()]));
  const baru = ruangSekolah();
  const idBaru = new Map(baru.map((r) => [r.kode.toUpperCase(), r.id]));
  const peta = (id: string): string | undefined => {
    const kode = lama.get(id);
    return kode ? idBaru.get(kode) : undefined;
  };
  const pilah = (ids: string[]) => ids.map(peta).filter((x): x is string => !!x);
  p.master.ruang = baru;
  for (const b of p.beban) {
    b.ruangPrioritas = pilah(b.ruangPrioritas);
    b.ruangTerlarang = pilah(b.ruangTerlarang);
  }
  for (const a of p.aturan) if (a.jenis === 'ruangTerlarang' || a.jenis === 'guruRuang') a.ruangIds = pilah(a.ruangIds);
  for (const m of p.master.mapel) if (m.ruangIds) m.ruangIds = pilah(m.ruangIds);
  for (const r of p.master.rombel) if (r.ruangIds) r.ruangIds = pilah(r.ruangIds);
  const bebanById = new Map<string, Beban>(p.beban.map((b) => [b.id, b]));
  for (const v of p.versi) {
    const urut = [...v.slots].sort((a, b) => a.hari - b.hari || a.jam - b.jam);
    const sudah: typeof v.slots = [];
    for (const s of urut) {
      const b = bebanById.get(s.bebanId);
      const pilihan = peta(s.ruangId);
      const r = b ? tentukanRuang(p, sudah, b, s.hari, s.jam, pilihan) : { ruangId: '' };
      s.ruangId = r.ruangId;
      sudah.push(s);
    }
  }
}
