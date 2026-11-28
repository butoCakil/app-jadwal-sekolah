import type { Proyek } from '../model/tipe';
import { validasiProyek } from '../model/validasi';
import { migrasiPola } from '../model/kalender';

const NAMA_DB = 'app-jadwal-sekolah';
const NAMA_STORE = 'draf';
const STORE_DATASET = 'dataset';
const STORE_AI = 'ai';
const STORE_SINKRON = 'sinkron';
const KUNCI = 'proyek';

function bukaDb(): Promise<IDBDatabase> {
  return new Promise((ok, gagal) => {
    const req = indexedDB.open(NAMA_DB, 4);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(NAMA_STORE)) db.createObjectStore(NAMA_STORE);
      if (!db.objectStoreNames.contains(STORE_DATASET)) db.createObjectStore(STORE_DATASET);
      if (!db.objectStoreNames.contains(STORE_AI)) db.createObjectStore(STORE_AI);
      if (!db.objectStoreNames.contains(STORE_SINKRON)) db.createObjectStore(STORE_SINKRON);
    };
    req.onsuccess = () => ok(req.result);
    req.onerror = () => gagal(req.error);
  });
}

function jalankan<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>, store: string = NAMA_STORE): Promise<T> {
  return bukaDb().then(
    (db) =>
      new Promise<T>((ok, gagal) => {
        const tx = db.transaction(store, mode);
        const req = fn(tx.objectStore(store));
        tx.oncomplete = () => {
          db.close();
          ok(req.result);
        };
        tx.onerror = () => gagal(tx.error);
        tx.onabort = () => gagal(tx.error);
      }),
  );
}

/** Menyimpan draf admin ke IndexedDB. */
export async function simpanDraf(p: Proyek): Promise<void> {
  await jalankan('readwrite', (s) => s.put(p, KUNCI));
}

/** Memuat draf; null bila belum ada atau isinya tidak lolos validasi. */
export async function muatDraf(): Promise<Proyek | null> {
  const v = await jalankan<unknown>('readonly', (s) => s.get(KUNCI));
  if (v === undefined) return null;
  return validasiProyek(v).length === 0 ? migrasiPola(v as Proyek) : null;
}

/** Keadaan draf di peramban: kosong (belum pernah ada), rusak (ada tetapi tidak lolos validasi, tidak boleh ditimpa diam-diam), atau ok. */
export type KeadaanDraf = { status: 'kosong' } | { status: 'rusak'; galat: string[]; mentah: unknown } | { status: 'ok'; proyek: Proyek };

export async function muatDrafRinci(): Promise<KeadaanDraf> {
  const v = await jalankan<unknown>('readonly', (s) => s.get(KUNCI));
  if (v === undefined) return { status: 'kosong' };
  const galat = validasiProyek(v);
  return galat.length ? { status: 'rusak', galat, mentah: v } : { status: 'ok', proyek: migrasiPola(v as Proyek) };
}

/** Menyimpan draf yang rusak ke kunci lain sebelum draf baru ditulis, supaya tidak hilang. */
export async function amankanDrafRusak(mentah: unknown): Promise<void> {
  await jalankan('readwrite', (s) => s.put({ disimpan: new Date().toISOString(), mentah }, 'proyek-rusak'));
}

/** Penanda sinkron di peramban ini: isi berkas admin pada sinkron terakhir (dasar gabungan tiga arah) beserta sha dan waktunya. */
export interface PenandaSinkron {
  sha: string;
  /** isi berkas di GitHub pada sinkron terakhir (teks JSON) */
  isi: string;
  /** waktu sinkron terakhir (ISO) */
  waktu: string;
}
export async function bacaSinkron(): Promise<PenandaSinkron | undefined> {
  return jalankan<PenandaSinkron | undefined>('readonly', (s) => s.get('terakhir') as IDBRequest<PenandaSinkron | undefined>, STORE_SINKRON);
}
export async function tulisSinkron(m: PenandaSinkron): Promise<void> {
  await jalankan('readwrite', (s) => s.put(m, 'terakhir'), STORE_SINKRON);
}
export async function hapusSinkron(): Promise<void> {
  await jalankan('readwrite', (s) => s.delete('terakhir'), STORE_SINKRON);
}

/** Draf apa adanya (tanpa validasi), untuk cadangan. */
export async function bacaDrafMentah(): Promise<unknown> {
  return jalankan<unknown>('readonly', (s) => s.get(KUNCI));
}

export async function hapusDraf(): Promise<void> {
  await jalankan('readwrite', (s) => s.delete(KUNCI));
}

/** Dataset (semester) yang disimpan admin di peramban ini, terpisah dari draf yang sedang dikerjakan. */
export interface DatasetTersimpan {
  id: string;
  nama: string;
  /** ISO waktu terakhir disimpan */
  disimpan: string;
  proyek: Proyek;
}

export async function daftarDataset(): Promise<DatasetTersimpan[]> {
  const semua = await jalankan<DatasetTersimpan[]>('readonly', (s) => s.getAll() as IDBRequest<DatasetTersimpan[]>, STORE_DATASET);
  return semua.filter((d) => validasiProyek(d.proyek).length === 0).map((d) => ({ ...d, proyek: migrasiPola(d.proyek) })).sort((a, b) => b.disimpan.localeCompare(a.disimpan));
}

/** Semua dataset apa adanya (termasuk yang tidak lolos validasi), untuk cadangan. */
export async function semuaDatasetMentah(): Promise<DatasetTersimpan[]> {
  return jalankan<DatasetTersimpan[]>('readonly', (s) => s.getAll() as IDBRequest<DatasetTersimpan[]>, STORE_DATASET);
}

export async function simpanDataset(d: DatasetTersimpan): Promise<void> {
  await jalankan('readwrite', (s) => s.put(d, d.id), STORE_DATASET);
}

export async function hapusDataset(id: string): Promise<void> {
  await jalankan('readwrite', (s) => s.delete(id), STORE_DATASET);
}

export function keJson(p: Proyek): string {
  return JSON.stringify(p, null, 2);
}

export type HasilImpor = { ok: true; proyek: Proyek } | { ok: false; galat: string[] };

/** Mengurai teks JSON menjadi proyek; tidak pernah melempar, galat dikembalikan sebagai daftar. */
export function dariJson(teks: string): HasilImpor {
  let x: unknown;
  try {
    x = JSON.parse(teks);
  } catch (e) {
    return { ok: false, galat: [`JSON tidak valid: ${(e as Error).message}`] };
  }
  const galat = validasiProyek(x);
  return galat.length ? { ok: false, galat } : { ok: true, proyek: migrasiPola(x as Proyek) };
}

/** Pengaturan asisten AI di peramban ini: brankas kunci (terenkripsi), pengaturan model, status rotasi. Bukan bagian proyek, tidak ikut ekspor. */
export async function bacaAi<T>(kunci: string): Promise<T | undefined> {
  return jalankan<T | undefined>('readonly', (s) => s.get(kunci) as IDBRequest<T | undefined>, STORE_AI);
}
export async function tulisAi(kunci: string, nilai: unknown): Promise<void> {
  await jalankan('readwrite', (s) => s.put(nilai, kunci), STORE_AI);
}
export async function hapusAi(kunci: string): Promise<void> {
  await jalankan('readwrite', (s) => s.delete(kunci), STORE_AI);
}
