import { susun } from './solver';
import type { Proyek, Slot } from '../model/tipe';
import type { AturanPekan } from '../model/aturanKegiatan';

/** Pekerja latar untuk solver: tidak membekukan tampilan selama menyusun. */
interface Masuk {
  p: Proyek;
  skemaPerHari: (string | null)[];
  tetap?: Slot[];
  aturan?: AturanPekan;
  batasMs: number;
  benih?: number;
}
const w = globalThis as unknown as { onmessage: ((e: MessageEvent<Masuk>) => void) | null; postMessage(m: unknown): void };

w.onmessage = (e) => {
  const { p, ...opsi } = e.data;
  try {
    const h = susun(p, { ...opsi, kemajuan: (m) => w.postMessage({ jenis: 'kemajuan', m }) });
    w.postMessage({ jenis: 'hasil', h });
  } catch (err) {
    w.postMessage({ jenis: 'galat', pesan: err instanceof Error ? err.message : String(err) });
  }
};
