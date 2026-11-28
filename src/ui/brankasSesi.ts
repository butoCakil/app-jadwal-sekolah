import { bacaAi, hapusAi, tulisAi } from '../io/simpan';
import { bukaDenganKunci, buatBrankasBaru, kunciDenganKunci, turunkanKunci, type BrankasTersimpan } from '../ai/brankas';
import type { KunciAi } from '../ai/rotasi';

/**
 * Brankas bersama: satu PIN membuka kunci Gemini (Asisten AI) dan token GitHub (Terapkan, Sinkron). Isi terenkripsi di IndexedDB
 * peramban admin; yang terbuka hanya ada di memori tab ini.
 *
 * Agar PIN tidak diminta berulang, setelah PIN benar perangkat ini boleh "mengingat" brankas selama beberapa hari: yang disimpan
 * adalah kunci turunan PIN sebagai CryptoKey yang TIDAK BISA DIEKSPOR (bukan PIN, bukan isi brankas), terikat pada garam brankas
 * dan punya batas waktu. Kunci sekarang atau mengganti PIN menghapusnya.
 */
export interface SesiBrankas {
  dimuat: boolean;
  brankas: BrankasTersimpan | null;
  terbuka: boolean;
  /** PIN hanya di memori selama tab terbuka dan hanya bila dimasukkan di tab ini (bukan saat dibuka otomatis). */
  pin: string;
  kunci: KunciAi[];
  token: string;
  /** Kunci turunan PIN untuk menyimpan ulang brankas. */
  kunciKripto: CryptoKey | null;
  /** Lama perangkat ini mengingat brankas, dalam hari (0 = tidak diingat). */
  ingatHari: number;
  /** Batas waktu ingatan yang sedang berlaku (ms), bila ada. */
  ingatSampai: number | null;
}

export const INGAT_BAWAAN_HARI = 7;
export const PILIHAN_INGAT_HARI = [0, 1, 7, 30] as const;

export const brankasSesi: SesiBrankas = { dimuat: false, brankas: null, terbuka: false, pin: '', kunci: [], token: '', kunciKripto: null, ingatHari: INGAT_BAWAAN_HARI, ingatSampai: null };

interface Ingat {
  kunci: CryptoKey;
  garam: string;
  sampai: number;
}

const HARI = 86_400_000;
const sekarang = () => Date.now();

async function simpanIngat(): Promise<void> {
  const v = brankasSesi;
  if (!v.brankas || !v.kunciKripto || v.ingatHari <= 0) {
    await hapusAi('ingat');
    v.ingatSampai = null;
    return;
  }
  const sampai = sekarang() + v.ingatHari * HARI;
  const rekam: Ingat = { kunci: v.kunciKripto, garam: v.brankas.garam, sampai };
  await tulisAi('ingat', rekam);
  v.ingatSampai = sampai;
}

/** Membaca brankas tersimpan (terenkripsi) dan, bila perangkat ini masih mengingatnya, membukanya tanpa PIN. */
export async function muatBrankas(): Promise<void> {
  const v = brankasSesi;
  v.brankas = (await bacaAi<BrankasTersimpan>('brankas')) ?? null;
  const hari = await bacaAi<number>('ingatHari').catch(() => undefined);
  if (typeof hari === 'number' && hari >= 0) v.ingatHari = hari;
  if (v.brankas && !v.terbuka) {
    try {
      const ingat = await bacaAi<Ingat>('ingat');
      if (ingat && ingat.garam === v.brankas.garam && ingat.sampai > sekarang() && v.ingatHari > 0) {
        const isi = await bukaDenganKunci(ingat.kunci, v.brankas);
        v.kunciKripto = ingat.kunci;
        v.kunci = isi.kunci;
        v.token = isi.token ?? '';
        v.terbuka = true;
        v.ingatSampai = ingat.sampai;
      } else if (ingat) await hapusAi('ingat');
    } catch {
      await hapusAi('ingat').catch(() => undefined);
    }
  }
  v.dimuat = true;
}

/** Menyimpan ulang brankas dengan isi sekarang (kunci dan token) memakai kunci turunan sesi. */
export async function simpanBrankas(): Promise<void> {
  const v = brankasSesi;
  if (!v.brankas || !v.kunciKripto) throw new Error('Brankas belum terbuka.');
  v.brankas = await kunciDenganKunci(v.kunciKripto, v.brankas, { kunci: v.kunci, token: v.token });
  await tulisAi('brankas', v.brankas);
}

/** Membuka brankas dengan PIN; PIN salah melempar galat. */
export async function bukaDenganPin(pin: string): Promise<void> {
  const v = brankasSesi;
  if (!v.brankas) throw new Error('Brankas belum dibuat.');
  let kunci: CryptoKey;
  try {
    kunci = await turunkanKunci(pin, v.brankas);
  } catch {
    throw new Error('PIN salah atau data brankas rusak.');
  }
  let isi;
  try {
    isi = await bukaDenganKunci(kunci, v.brankas);
  } catch {
    throw new Error('PIN salah atau data brankas rusak.');
  }
  v.pin = pin;
  v.kunciKripto = kunci;
  v.kunci = isi.kunci;
  v.token = isi.token ?? '';
  v.terbuka = true;
  await simpanIngat();
}

/** Membuat brankas baru dengan PIN dan isi awal, lalu membukanya. */
export async function buatBrankas(pin: string, isi: { kunci?: KunciAi[]; token?: string }): Promise<void> {
  const v = brankasSesi;
  const baru = await buatBrankasBaru(pin, { kunci: isi.kunci ?? [], token: isi.token ?? '' });
  v.brankas = baru.brankas;
  v.kunciKripto = baru.kunci;
  v.pin = pin;
  v.kunci = isi.kunci ?? [];
  v.token = isi.token ?? '';
  await tulisAi('brankas', v.brankas);
  v.terbuka = true;
  await simpanIngat();
}

/** Mengganti PIN: garam baru, isi dienkripsi ulang, ingatan lama diganti dengan yang baru. */
export async function gantiPin(pinBaru: string): Promise<void> {
  const v = brankasSesi;
  if (!v.terbuka) throw new Error('Brankas belum terbuka.');
  const baru = await buatBrankasBaru(pinBaru, { kunci: v.kunci, token: v.token });
  v.brankas = baru.brankas;
  v.kunciKripto = baru.kunci;
  v.pin = pinBaru;
  await tulisAi('brankas', v.brankas);
  await simpanIngat();
}

/** Mengatur lama perangkat ini mengingat brankas (0 = tidak). Berlaku mulai sekarang bila brankas sedang terbuka. */
export async function aturIngat(hari: number): Promise<void> {
  const v = brankasSesi;
  v.ingatHari = hari;
  await tulisAi('ingatHari', hari);
  if (v.terbuka) await simpanIngat();
  else if (hari <= 0) {
    await hapusAi('ingat');
    v.ingatSampai = null;
  }
}

/** Mengunci: rahasia dibuang dari memori dan ingatan perangkat dihapus; brankas terenkripsi tetap tersimpan. */
export function kunciSesi(): void {
  const v = brankasSesi;
  v.terbuka = false;
  v.pin = '';
  v.kunci = [];
  v.token = '';
  v.kunciKripto = null;
  v.ingatSampai = null;
  void hapusAi('ingat').catch(() => undefined);
}

export async function hapusBrankasSesi(): Promise<void> {
  await hapusAi('brankas');
  await hapusAi('status');
  await hapusAi('ingat');
  brankasSesi.brankas = null;
  kunciSesi();
}
