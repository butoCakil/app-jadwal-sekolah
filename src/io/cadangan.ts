/**
 * Paket cadangan lengkap: semua yang tersimpan di peramban admin dalam satu berkas JSON, supaya bisa dipindah ke perangkat lain
 * atau dipulihkan. Isinya: draf yang sedang dikerjakan, semua dataset tersimpan, pengaturan dan pemakaian asisten AI, dan penanda
 * sinkron GitHub. Brankas (kunci Gemini dan token GitHub) hanya ikut bila dipilih, dan tetap dalam bentuk terenkripsi PIN
 * (tidak pernah polos). Token dan kunci tidak pernah berada di berkas ini dalam bentuk yang bisa dibaca tanpa PIN.
 */

import type { BrankasTersimpan } from '../ai/brankas';
import type { PengaturanAi, StatusRotasi } from '../ai/rotasi';
import { gabungPercakapan, sahPercakapan, type Percakapan } from '../ai/percakapan';
import { migrasiPola } from '../model/kalender';
import type { Proyek } from '../model/tipe';
import { validasiProyek } from '../model/validasi';
import { periksaPrivasi } from '../terbit/format';
import { FORMAT_ADMIN, bacaBerkasAdmin } from '../sinkron/format';
import { dariJson, type DatasetTersimpan, type PenandaSinkron } from './simpan';

export const FORMAT_CADANGAN = 'jadwal-smkn-bansari-cadangan';

export interface PaketCadangan {
  format: typeof FORMAT_CADANGAN;
  versi: 1;
  dibuat: string;
  draf: Proyek | null;
  dataset: DatasetTersimpan[];
  ai: { pengaturan?: PengaturanAi; status?: StatusRotasi; pengaturanDiubah?: number; percakapan?: Percakapan[] };
  sinkron?: PenandaSinkron;
  /** terenkripsi PIN; hanya bila dipilih saat ekspor */
  brankas?: BrankasTersimpan;
}

/** Akses ke penyimpanan peramban; diganti penyimpan di memori pada tes. */
export interface Gudang {
  bacaDraf(): Promise<unknown>;
  tulisDraf(p: Proyek): Promise<void>;
  semuaDataset(): Promise<DatasetTersimpan[]>;
  tulisDataset(d: DatasetTersimpan): Promise<void>;
  bacaAi(kunci: string): Promise<unknown>;
  tulisAi(kunci: string, nilai: unknown): Promise<void>;
  bacaSinkron(): Promise<PenandaSinkron | undefined>;
  tulisSinkron(m: PenandaSinkron): Promise<void>;
}

/** Mengumpulkan paket dari gudang. `drafSaatIni` (di memori, mungkin belum tersimpan) diutamakan atas draf di gudang. */
export async function kumpulkanCadangan(g: Gudang, opsi: { drafSaatIni?: Proyek; sertakanBrankas: boolean }, waktu: Date = new Date()): Promise<PaketCadangan> {
  const dataset = await g.semuaDataset();
  const pengaturan = (await g.bacaAi('pengaturan')) as PengaturanAi | undefined;
  const status = (await g.bacaAi('status')) as StatusRotasi | undefined;
  const pengaturanDiubah = (await g.bacaAi('pengaturanDiubah')) as number | undefined;
  const simpanPercakapan = (await g.bacaAi('percakapan')) as { daftar?: unknown } | undefined;
  const percakapan = Array.isArray(simpanPercakapan?.daftar) ? (simpanPercakapan.daftar as Percakapan[]) : [];
  const sinkron = await g.bacaSinkron();
  const brankas = opsi.sertakanBrankas ? ((await g.bacaAi('brankas')) as BrankasTersimpan | undefined) : undefined;
  const draf = opsi.drafSaatIni ?? ((await g.bacaDraf()) as Proyek | undefined) ?? null;
  return {
    format: FORMAT_CADANGAN,
    versi: 1,
    dibuat: waktu.toISOString(),
    draf,
    dataset,
    ai: { ...(pengaturan ? { pengaturan } : {}), ...(status ? { status } : {}), ...(typeof pengaturanDiubah === 'number' ? { pengaturanDiubah } : {}), ...(percakapan.length ? { percakapan } : {}) },
    ...(sinkron ? { sinkron } : {}),
    ...(brankas ? { brankas } : {}),
  };
}

export function serialCadangan(p: PaketCadangan): string {
  const galat = periksaPrivasi({ draf: p.draf, dataset: p.dataset });
  if (galat.length) throw new Error(`Cadangan ditolak: ${galat.join('; ')}`);
  return JSON.stringify(p, null, 1);
}

export type HasilBaca = { ok: true; paket: PaketCadangan; peringatan: string[] } | { ok: false; galat: string[] };

const adalahObjek = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);

export function bacaCadangan(teks: string): HasilBaca {
  let x: unknown;
  try {
    x = JSON.parse(teks);
  } catch (e) {
    return { ok: false, galat: [`JSON tidak valid: ${(e as Error).message}`] };
  }
  if (!adalahObjek(x) || x.format !== FORMAT_CADANGAN || x.versi !== 1) return { ok: false, galat: ['Bukan berkas cadangan aplikasi ini.'] };
  const peringatan: string[] = [];
  const galat: string[] = [];
  let draf: Proyek | null = null;
  if (x.draf != null) {
    const g = validasiProyek(x.draf);
    if (g.length) galat.push(`Draf di cadangan tidak lolos pemeriksaan: ${g.slice(0, 3).join(' | ')}`);
    else draf = migrasiPola(x.draf as Proyek);
  }
  const dataset: DatasetTersimpan[] = [];
  for (const d of Array.isArray(x.dataset) ? x.dataset : []) {
    const dd = d as Partial<DatasetTersimpan> | null;
    if (!dd || typeof dd.id !== 'string' || typeof dd.nama !== 'string' || typeof dd.disimpan !== 'string' || validasiProyek(dd.proyek).length) {
      peringatan.push(`Satu dataset${dd && typeof dd.nama === 'string' ? ` (${dd.nama})` : ''} tidak sah dan dilewati.`);
      continue;
    }
    dataset.push({ id: dd.id, nama: dd.nama, disimpan: dd.disimpan, proyek: migrasiPola(dd.proyek as Proyek) });
  }
  const ai: PaketCadangan['ai'] = {};
  const a = adalahObjek(x.ai) ? x.ai : {};
  if (a.pengaturan !== undefined) {
    const s = a.pengaturan;
    if (adalahObjek(s) && typeof s.model === 'string' && Array.isArray(s.cadangan) && typeof s.rpm === 'number' && typeof s.rpd === 'number') ai.pengaturan = s as unknown as PengaturanAi;
    else peringatan.push('Pengaturan AI di cadangan tidak sah dan dilewati.');
  }
  if (a.status !== undefined) {
    const s = a.status;
    if (adalahObjek(s) && adalahObjek(s.slot) && adalahObjek(s.tidakSah) && Array.isArray(s.galat)) ai.status = s as unknown as StatusRotasi;
    else peringatan.push('Catatan pemakaian AI di cadangan tidak sah dan dilewati.');
  }
  if (typeof a.pengaturanDiubah === 'number' && Number.isFinite(a.pengaturanDiubah)) ai.pengaturanDiubah = a.pengaturanDiubah;
  if (a.percakapan !== undefined) {
    if (Array.isArray(a.percakapan)) {
      const sah = a.percakapan.filter(sahPercakapan);
      if (sah.length < a.percakapan.length) peringatan.push(`${a.percakapan.length - sah.length} percakapan AI di cadangan rusak dan dilewati.`);
      if (sah.length) ai.percakapan = sah;
    } else peringatan.push('Riwayat percakapan AI di cadangan tidak sah dan dilewati.');
  }
  let sinkron: PenandaSinkron | undefined;
  if (x.sinkron !== undefined) {
    const s = x.sinkron;
    if (adalahObjek(s) && typeof s.sha === 'string' && typeof s.isi === 'string' && typeof s.waktu === 'string') sinkron = { sha: s.sha, isi: s.isi, waktu: s.waktu };
    else peringatan.push('Penanda sinkron di cadangan tidak sah dan dilewati.');
  }
  let brankas: BrankasTersimpan | undefined;
  if (x.brankas !== undefined) {
    const b = x.brankas;
    if (adalahObjek(b) && b.v === 1 && typeof b.garam === 'string' && typeof b.iv === 'string' && typeof b.data === 'string' && typeof b.iterasi === 'number') brankas = b as unknown as BrankasTersimpan;
    else peringatan.push('Brankas di cadangan tidak sah dan dilewati.');
  }
  if (galat.length) return { ok: false, galat };
  return {
    ok: true,
    peringatan,
    paket: { format: FORMAT_CADANGAN, versi: 1, dibuat: typeof x.dibuat === 'string' ? x.dibuat : '', draf, dataset, ai, ...(sinkron ? { sinkron } : {}), ...(brankas ? { brankas } : {}) },
  };
}

/** Ringkasan isi paket untuk dikonfirmasi admin sebelum diterapkan. */
export function ringkasCadangan(p: PaketCadangan): string[] {
  return [
    p.draf ? `Draf yang sedang dikerjakan: “${p.draf.nama}” (menggantikan draf di peramban ini)` : 'Tanpa draf',
    `${p.dataset.length} dataset tersimpan (yang ber-id sama ditimpa, yang lain di peramban ini tetap ada)`,
    p.ai.pengaturan || p.ai.status ? 'Pengaturan dan catatan pemakaian asisten AI (menggantikan yang ada)' : 'Tanpa pengaturan AI',
    p.ai.percakapan ? `${p.ai.percakapan.filter((c) => c.dihapus === undefined).length} percakapan asisten AI (digabung dengan riwayat di peramban ini; yang terakhir diubah menang)` : 'Tanpa riwayat percakapan AI',
    p.sinkron ? 'Penanda sinkron GitHub' : 'Tanpa penanda sinkron',
    p.brankas ? 'Brankas terenkripsi (kunci Gemini dan token GitHub; menggantikan brankas di peramban ini, dibuka dengan PIN saat dibuat)' : 'Tanpa brankas',
  ];
}

/** Menulis seluruh isi paket ke gudang. */
export async function terapkanCadangan(g: Gudang, p: PaketCadangan): Promise<void> {
  if (p.draf) await g.tulisDraf(p.draf);
  for (const d of p.dataset) await g.tulisDataset(d);
  if (p.ai.pengaturan) await g.tulisAi('pengaturan', p.ai.pengaturan);
  if (p.ai.status) await g.tulisAi('status', p.ai.status);
  if (typeof p.ai.pengaturanDiubah === 'number') await g.tulisAi('pengaturanDiubah', p.ai.pengaturanDiubah);
  if (p.ai.percakapan) {
    const ada = (await g.bacaAi('percakapan')) as { daftar?: unknown; aktifId?: string } | undefined;
    const lama = Array.isArray(ada?.daftar) ? (ada.daftar as unknown[]).filter(sahPercakapan) : [];
    await g.tulisAi('percakapan', { daftar: gabungPercakapan(lama, p.ai.percakapan), ...(ada?.aktifId ? { aktifId: ada.aktifId } : {}) });
  }
  if (p.sinkron) await g.tulisSinkron(p.sinkron);
  if (p.brankas) await g.tulisAi('brankas', p.brankas);
}

export type BerkasImpor =
  | { jenis: 'cadangan'; paket: PaketCadangan; peringatan: string[] }
  | { jenis: 'proyek'; proyek: Proyek; asal: 'proyek' | 'admin' }
  | { jenis: 'galat'; galat: string[] };

/** Mengenali apa yang diimpor: paket cadangan, berkas admin dari GitHub, atau proyek (format ekspor lama). */
export function bacaBerkasImpor(teks: string): BerkasImpor {
  let x: unknown;
  try {
    x = JSON.parse(teks);
  } catch (e) {
    return { jenis: 'galat', galat: [`JSON tidak valid: ${(e as Error).message}`] };
  }
  const f = adalahObjek(x) ? x.format : undefined;
  if (f === FORMAT_CADANGAN) {
    const h = bacaCadangan(teks);
    return h.ok ? { jenis: 'cadangan', paket: h.paket, peringatan: h.peringatan } : { jenis: 'galat', galat: h.galat };
  }
  if (f === FORMAT_ADMIN) {
    const h = bacaBerkasAdmin(teks);
    return h.ok ? { jenis: 'proyek', proyek: h.berkas.proyek, asal: 'admin' } : { jenis: 'galat', galat: [h.galat] };
  }
  const h = dariJson(teks);
  return h.ok ? { jenis: 'proyek', proyek: h.proyek, asal: 'proyek' } : { jenis: 'galat', galat: h.galat };
}
