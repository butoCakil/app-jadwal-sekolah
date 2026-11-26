import type { Proyek } from '../model/tipe';
import { validasiProyek } from '../model/validasi';

const NAMA_DB = 'app-jadwal-sekolah';
const NAMA_STORE = 'draf';
const KUNCI = 'proyek';

function bukaDb(): Promise<IDBDatabase> {
  return new Promise((ok, gagal) => {
    const req = indexedDB.open(NAMA_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(NAMA_STORE);
    req.onsuccess = () => ok(req.result);
    req.onerror = () => gagal(req.error);
  });
}

function jalankan<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return bukaDb().then(
    (db) =>
      new Promise<T>((ok, gagal) => {
        const tx = db.transaction(NAMA_STORE, mode);
        const req = fn(tx.objectStore(NAMA_STORE));
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
  return validasiProyek(v).length === 0 ? (v as Proyek) : null;
}

export async function hapusDraf(): Promise<void> {
  await jalankan('readwrite', (s) => s.delete(KUNCI));
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
  return galat.length ? { ok: false, galat } : { ok: true, proyek: x as Proyek };
}
