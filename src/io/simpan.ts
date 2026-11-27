import type { Proyek } from '../model/tipe';
import { validasiProyek } from '../model/validasi';
import { migrasiPola } from '../model/kalender';

const NAMA_DB = 'app-jadwal-sekolah';
const NAMA_STORE = 'draf';
const STORE_DATASET = 'dataset';
const STORE_AI = 'ai';
const KUNCI = 'proyek';

function bukaDb(): Promise<IDBDatabase> {
  return new Promise((ok, gagal) => {
    const req = indexedDB.open(NAMA_DB, 3);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(NAMA_STORE)) db.createObjectStore(NAMA_STORE);
      if (!db.objectStoreNames.contains(STORE_DATASET)) db.createObjectStore(STORE_DATASET);
      if (!db.objectStoreNames.contains(STORE_AI)) db.createObjectStore(STORE_AI);
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
