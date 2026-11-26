import type { Beban, Proyek, Ruang } from './tipe';
import { tentukanRuang } from '../mesin/penempatan';

type Baris = [kode: string, nama: string, jenis: Ruang['jenis'], dijadwalkan: boolean];

/**
 * Daftar ruang menurut "Site plan ruang dan blok gedung 2026" (SMK N 1 Bansari), keterangan gedung B sampai S.
 * Gedung A (kantor), E (BK, Waka, Managemen, IT), F (R. Guru), dan H (Perpustakaan) tidak dimasukkan.
 * Kolom terakhir = ikut dijadwalkan. Ruang guru/instruktur/teknisi diberi false, begitu pula B2 (studio), C2 (gudang sound system, belum jadi ruang kelas),
 * dan D2 (ruang server/network) sesuai keterangan Benny (26 Nov 2026). Bisa diubah di Master Data.
 * Ruang kelas memakai kode "RK." seperti di aSc Timetables dan jadwal-te (RK.J1 dst.).
 */
const DAFTAR: Baris[] = [
  ['B1', 'R. Guru TE', 'teori', false],
  ['B2', 'R. Studio TE', 'praktik', false],
  ['B3', 'RP. Audio Video TE', 'praktik', true],
  ['C1', 'RP. Eldas TE', 'praktik', true],
  ['C2', 'RP. Workshop TE', 'praktik', false],
  ['D1', 'RP. Home Appliances TE', 'praktik', true],
  ['D2', 'R. Network TE', 'praktik', false],
  ['G1', 'Lab. Komputer 1', 'lab', true],
  ['G2', 'Lab. DKV 3', 'lab', true],
  ['G3', 'Lab. DKV 4', 'lab', true],
  ['I1', 'Lab. IPAS', 'lab', true],
  ['I2', 'R. Instruktur DKV', 'teori', false],
  ['I3', 'Lab. DKV 1', 'lab', true],
  ['I4', 'R. Studio DKV', 'praktik', true],
  ['RK.J1', 'Ruang Kelas J1', 'teori', true],
  ['RK.J2', 'Ruang Kelas J2', 'teori', true],
  ['RK.J3', 'Ruang Kelas J3', 'teori', true],
  ['RK.K1', 'Ruang Kelas K1', 'teori', true],
  ['RK.K2', 'Ruang Kelas K2', 'teori', true],
  ['RK.K3', 'Ruang Kelas K3', 'teori', true],
  ['RK.L1', 'Ruang Kelas L1', 'teori', true],
  ['RK.L2', 'Ruang Kelas L2', 'teori', true],
  ['M1', 'Lab. Pembenihan', 'lab', true],
  ['M2', 'Lab. Hama', 'lab', true],
  ['M3', 'Lab. Kultur Jaringan', 'lab', true],
  ['M4', 'R. Instruktur AT 1', 'teori', false],
  ['N1', 'Lab. Analisis Tanah', 'lab', true],
  ['N2', 'Lab. Hidroponik', 'lab', true],
  ['N3', 'Lab. Pascapanen', 'lab', true],
  ['N4', 'R. Teknisi AT', 'teori', false],
  ['O1', 'Lab. PHPS', 'lab', true],
  ['O2', 'R. Instruktur AT 2', 'teori', false],
  ['O3', 'Lab. PHPO', 'lab', true],
  ['RK.P1', 'Ruang Kelas P1', 'teori', true],
  ['RK.P2', 'Ruang Kelas P2', 'teori', true],
  ['Q', 'Lab. DKV 2', 'lab', true],
  ['RK.R1', 'Ruang Kelas R1', 'teori', true],
  ['RK.R2', 'Ruang Kelas R2', 'teori', true],
  ['RK.R3', 'Ruang Kelas R3', 'teori', true],
  ['RK.S1', 'Ruang Kelas S1', 'teori', true],
  ['RK.S2', 'Ruang Kelas S2', 'teori', true],
  ['LAP', 'Lapangan Olahraga', 'lapangan', true],
];

export function ruangSekolah(): Ruang[] {
  return DAFTAR.map(([kode, nama, jenis, dijadwalkan], i) => ({
    id: `u${i + 1}`,
    kode,
    nama,
    jenis,
    dijadwalkan,
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
  for (const a of p.aturan) if (a.jenis === 'ruangTerlarang') a.ruangIds = pilah(a.ruangIds);
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
