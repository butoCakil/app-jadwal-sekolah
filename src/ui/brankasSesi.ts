import { bacaAi, hapusAi, tulisAi } from '../io/simpan';
import { bukaBrankas, kunciBrankas, type BrankasTersimpan } from '../ai/brankas';
import type { KunciAi } from '../ai/rotasi';

/**
 * Brankas bersama: satu PIN membuka kunci Gemini (Asisten AI) dan token GitHub (Terapkan). Isi terenkripsi di IndexedDB peramban
 * admin; yang terbuka hanya ada di memori tab ini. Tab Asisten AI dan tab Terapkan memakai keadaan yang sama.
 */
export interface SesiBrankas {
  dimuat: boolean;
  brankas: BrankasTersimpan | null;
  terbuka: boolean;
  /** PIN hanya di memori selama tab terbuka (untuk menyimpan ulang brankas). */
  pin: string;
  kunci: KunciAi[];
  token: string;
}

export const brankasSesi: SesiBrankas = { dimuat: false, brankas: null, terbuka: false, pin: '', kunci: [], token: '' };

/** Membaca brankas tersimpan (terenkripsi) dari peramban; tidak membukanya. */
export async function muatBrankas(): Promise<void> {
  brankasSesi.brankas = (await bacaAi<BrankasTersimpan>('brankas')) ?? null;
  brankasSesi.dimuat = true;
}

/** Menyimpan ulang brankas dengan isi sekarang (kunci dan token) memakai PIN sesi. */
export async function simpanBrankas(): Promise<void> {
  brankasSesi.brankas = await kunciBrankas(brankasSesi.pin, { kunci: brankasSesi.kunci, token: brankasSesi.token });
  await tulisAi('brankas', brankasSesi.brankas);
}

/** Membuka brankas dengan PIN; PIN salah melempar galat. */
export async function bukaDenganPin(pin: string): Promise<void> {
  if (!brankasSesi.brankas) throw new Error('Brankas belum dibuat.');
  const isi = await bukaBrankas(pin, brankasSesi.brankas);
  brankasSesi.pin = pin;
  brankasSesi.kunci = isi.kunci;
  brankasSesi.token = isi.token ?? '';
  brankasSesi.terbuka = true;
}

/** Membuat brankas baru dengan PIN dan isi awal, lalu membukanya. */
export async function buatBrankas(pin: string, isi: { kunci?: KunciAi[]; token?: string }): Promise<void> {
  brankasSesi.pin = pin;
  brankasSesi.kunci = isi.kunci ?? [];
  brankasSesi.token = isi.token ?? '';
  await simpanBrankas();
  brankasSesi.terbuka = true;
}

/** Mengunci: rahasia dibuang dari memori; brankas terenkripsi tetap tersimpan. */
export function kunciSesi(): void {
  brankasSesi.terbuka = false;
  brankasSesi.pin = '';
  brankasSesi.kunci = [];
  brankasSesi.token = '';
}

export async function hapusBrankasSesi(): Promise<void> {
  await hapusAi('brankas');
  await hapusAi('status');
  brankasSesi.brankas = null;
  kunciSesi();
}
