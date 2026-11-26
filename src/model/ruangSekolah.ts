import type { Beban, Proyek, Ruang } from './tipe';
import { tentukanRuang } from '../mesin/penempatan';

type Baris = [kode: string, nama: string, jenis: Ruang['jenis'], dijadwalkan: boolean];

/**
 * Daftar ruang menurut "Site plan ruang dan blok gedung 2026" (SMK N 1 Bansari), keterangan gedung B sampai S.
 * Gedung A (kantor), E (BK, Waka, Managemen, IT), F (R. Guru), dan H (Perpustakaan) tidak dimasukkan.
 * Kolom terakhir = ikut dijadwalkan. Ruang instruktur/teknisi/guru diberi false; bisa diubah di Master Data.
 */
const DAFTAR: Baris[] = [
  ['B1', 'R. Guru TE', 'teori', false],
  ['B2', 'R. Studio TE', 'praktik', true],
  ['B3', 'RP. Audio Video TE', 'praktik', true],
  ['C1', 'RP. Eldas TE', 'praktik', true],
  ['C2', 'RP. Workshop TE', 'praktik', true],
  ['D1', 'RP. Home Appliances TE', 'praktik', true],
  ['D2', 'R. Network TE', 'praktik', true],
  ['G1', 'Lab. Komputer 1', 'lab', true],
  ['G2', 'Lab. DKV 3', 'lab', true],
  ['G3', 'Lab. DKV 4', 'lab', true],
  ['I1', 'Lab. IPAS', 'lab', true],
  ['I2', 'R. Instruktur DKV', 'teori', false],
  ['I3', 'Lab. DKV 1', 'lab', true],
  ['I4', 'R. Studio DKV', 'praktik', true],
  ['J1', 'RK. J1', 'teori', true],
  ['J2', 'RK. J2', 'teori', true],
  ['J3', 'RK. J3', 'teori', true],
  ['K1', 'RK. K1', 'teori', true],
  ['K2', 'RK. K2', 'teori', true],
  ['K3', 'RK. K3', 'teori', true],
  ['L1', 'RK. L1', 'teori', true],
  ['L2', 'RK. L2', 'teori', true],
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
  ['P1', 'RK. P1', 'teori', true],
  ['P2', 'RK. P2', 'teori', true],
  ['Q', 'Lab. DKV 2', 'lab', true],
  ['R1', 'RK. R1', 'teori', true],
  ['R2', 'RK. R2', 'teori', true],
  ['R3', 'RK. R3', 'teori', true],
  ['S1', 'RK. S1', 'teori', true],
  ['S2', 'RK. S2', 'teori', true],
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
