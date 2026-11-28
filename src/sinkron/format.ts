// Berkas sinkron data admin: seluruh draf (tanpa token, kunci AI, atau pengaturan peramban) disimpan di repo agar bisa dimuat di peramban mana pun.

import { migrasiPola } from '../model/kalender';
import type { Proyek } from '../model/tipe';
import { validasiProyek } from '../model/validasi';
import { periksaPrivasi } from '../terbit/format';

export const FORMAT_ADMIN = 'jadwal-smkn-bansari-admin';
export const BERKAS_ADMIN = 'data/admin/proyek.json';

export interface BerkasAdmin {
  format: typeof FORMAT_ADMIN;
  versi: 1;
  /** Waktu penyimpanan (ISO). */
  disimpan: string;
  proyek: Proyek;
}

/** Isi berkas untuk disimpan ke repo. Menolak data yang memuat tanda data pribadi. */
export function bangunBerkasAdmin(p: Proyek, waktu: Date = new Date()): string {
  const galat = periksaPrivasi(p);
  if (galat.length) throw new Error(`Data admin ditolak: ${galat.join('; ')}`);
  const b: BerkasAdmin = { format: FORMAT_ADMIN, versi: 1, disimpan: waktu.toISOString(), proyek: p };
  return JSON.stringify(b);
}

export type HasilBacaAdmin = { ok: true; berkas: BerkasAdmin } | { ok: false; galat: string };

export function bacaBerkasAdmin(teks: string): HasilBacaAdmin {
  let x: unknown;
  try {
    x = JSON.parse(teks);
  } catch {
    return { ok: false, galat: 'Berkas data admin di GitHub bukan JSON yang valid.' };
  }
  const b = x as Partial<BerkasAdmin> | null;
  if (!b || b.format !== FORMAT_ADMIN || b.versi !== 1 || typeof b.disimpan !== 'string' || !b.proyek) return { ok: false, galat: 'Berkas data admin di GitHub tidak dikenali formatnya.' };
  const g = validasiProyek(b.proyek);
  if (g.length) return { ok: false, galat: `Data admin di GitHub tidak lolos pemeriksaan: ${g.slice(0, 3).join(' | ')}` };
  return { ok: true, berkas: { format: FORMAT_ADMIN, versi: 1, disimpan: b.disimpan, proyek: migrasiPola(b.proyek) } };
}
