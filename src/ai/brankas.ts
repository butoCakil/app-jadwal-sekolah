import type { KunciAi } from './rotasi';

/**
 * Brankas kunci API: kunci Gemini disimpan terenkripsi di perangkat admin (WebCrypto: PBKDF2-SHA256 untuk menurunkan kunci dari PIN,
 * AES-GCM untuk enkripsi). Tanpa PIN, isinya tidak bisa dibuka. PIN tidak pernah disimpan; hanya kunci yang sudah terbuka yang
 * ditahan di memori selama tab terbuka. Keputusan rancangan 11.1 #10: kunci dan token tidak pernah masuk repo.
 */

export interface IsiBrankas {
  kunci: KunciAi[];
  /** Token GitHub (fine-grained, hanya Contents: write untuk repo ini) untuk tombol Terapkan; kosong = belum diisi. */
  token?: string;
}

export interface BrankasTersimpan {
  v: 1;
  /** base64 */
  garam: string;
  iv: string;
  data: string;
  iterasi: number;
}

export const ITERASI_BAWAAN = 250_000;
export const PIN_MINIMAL = 4;

const enc = new TextEncoder();
const dec = new TextDecoder();

const keB64 = (b: ArrayBuffer | Uint8Array): string => {
  const u = b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = '';
  for (const x of u) s += String.fromCharCode(x);
  return btoa(s);
};
const dariB64 = (s: string): Uint8Array<ArrayBuffer> => {
  const t = atob(s);
  const u = new Uint8Array(new ArrayBuffer(t.length));
  for (let i = 0; i < t.length; i++) u[i] = t.charCodeAt(i);
  return u;
};

async function turunkan(pin: string, garam: Uint8Array<ArrayBuffer>, iterasi: number): Promise<CryptoKey> {
  const dasar = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: garam, iterations: iterasi, hash: 'SHA-256' }, dasar, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/** Mengenkripsi isi brankas dengan PIN. Garam dan IV baru setiap kali. */
export async function kunciBrankas(pin: string, isi: IsiBrankas, iterasi = ITERASI_BAWAAN): Promise<BrankasTersimpan> {
  if (pin.length < PIN_MINIMAL) throw new Error(`PIN minimal ${PIN_MINIMAL} karakter.`);
  const garam = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(16)));
  const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(12)));
  const kunci = await turunkan(pin, garam, iterasi);
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, kunci, enc.encode(JSON.stringify(isi)));
  return { v: 1, garam: keB64(garam), iv: keB64(iv), data: keB64(data), iterasi };
}

/** Membuka brankas. PIN salah (atau data rusak) menghasilkan galat "PIN salah". */
export async function bukaBrankas(pin: string, b: BrankasTersimpan): Promise<IsiBrankas> {
  if (b.v !== 1) throw new Error('Versi brankas tidak dikenal.');
  try {
    const kunci = await turunkan(pin, dariB64(b.garam), b.iterasi);
    const mentah = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: dariB64(b.iv) }, kunci, dariB64(b.data));
    const j = JSON.parse(dec.decode(mentah)) as IsiBrankas;
    if (!Array.isArray(j.kunci) || (j.token !== undefined && typeof j.token !== 'string')) throw new Error('isi tidak sah');
    return j;
  } catch {
    throw new Error('PIN salah atau data brankas rusak.');
  }
}

/** Bentuk kunci untuk ditampilkan tanpa membuka rahasianya: 4 karakter pertama dan 4 terakhir. */
export const samarkan = (nilai: string): string => (nilai.length <= 10 ? '••••' : `${nilai.slice(0, 4)}…${nilai.slice(-4)}`);
