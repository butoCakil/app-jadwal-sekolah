// Menyimpan berkas terbit ke repo lewat GitHub REST API (Contents). Token fine-grained milik admin, hanya di memori saat dipakai.

export interface TargetRepo {
  pemilik: string;
  repo: string;
  cabang: string;
  berkas: string;
}

export const TARGET_BAWAAN: TargetRepo = { pemilik: 'butoCakil', repo: 'app-jadwal-sekolah', cabang: 'main', berkas: 'data/terbit/jadwal.json' };

export type KodeGalat = 'token' | 'izin' | 'tidakAda' | 'bentrok' | 'batas' | 'jaringan' | 'lain';

export type HasilTerapkan =
  | { ok: true; status: 'dibuat' | 'diperbarui' | 'tanpaPerubahan'; urlCommit?: string; shaCommit?: string }
  | { ok: false; kode: KodeGalat; galat: string };

const enc = new TextEncoder();

/** Base64 untuk teks UTF-8 (btoa saja gagal pada karakter di luar Latin-1). */
export function keBase64Utf8(teks: string): string {
  const b = enc.encode(teks);
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Kebalikan keBase64Utf8; GitHub menyisipkan baris baru di dalam base64. */
export function dariBase64Utf8(b64: string): string {
  const t = atob(b64.replace(/\s/g, ''));
  const u = new Uint8Array(t.length);
  for (let i = 0; i < t.length; i++) u[i] = t.charCodeAt(i);
  return new TextDecoder().decode(u);
}

/** SHA git sebuah berkas (blob): SHA-1 dari "blob <panjang>\0<isi>". Dipakai untuk mengenali isi yang tidak berubah tanpa mengunduhnya. */
export async function shaBlobGit(teks: string): Promise<string> {
  const isi = enc.encode(teks);
  const kepala = enc.encode(`blob ${isi.length}\0`);
  const semua = new Uint8Array(kepala.length + isi.length);
  semua.set(kepala, 0);
  semua.set(isi, kepala.length);
  const h = new Uint8Array(await crypto.subtle.digest('SHA-1', semua));
  return [...h].map((x) => x.toString(16).padStart(2, '0')).join('');
}

const alamat = (t: TargetRepo): string => `https://api.github.com/repos/${encodeURIComponent(t.pemilik)}/${encodeURIComponent(t.repo)}/contents/${t.berkas.split('/').map(encodeURIComponent).join('/')}`;

const kepala = (token: string): Record<string, string> => ({ Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' });

async function pesanGalat(r: Response): Promise<string> {
  try {
    const j = (await r.json()) as { message?: unknown };
    return typeof j.message === 'string' ? j.message : '';
  } catch {
    return '';
  }
}

function petakanGalat(status: number, pesan: string, tahap: 'baca' | 'tulis'): { kode: KodeGalat; galat: string } {
  if (status === 401) return { kode: 'token', galat: 'Token ditolak GitHub (salah, kedaluwarsa, atau dicabut). Buat token baru lalu simpan di brankas.' };
  if (status === 403 && /rate limit/i.test(pesan)) return { kode: 'batas', galat: 'Batas permintaan GitHub tercapai. Coba lagi beberapa menit lagi.' };
  if (status === 403) return { kode: 'izin', galat: 'Token tidak punya izin menulis. Token fine-grained harus punya Contents: Read and write untuk repo ini.' };
  if (status === 404) return { kode: 'tidakAda', galat: 'Repo atau cabang tidak ditemukan, atau token tidak punya akses ke repo ini (GitHub menjawab 404 pada kedua kasus).' };
  if (status === 409 || status === 422) return { kode: 'bentrok', galat: 'Berkas di repo berubah saat disimpan. Coba Terapkan sekali lagi.' };
  return { kode: 'lain', galat: `GitHub menjawab ${status} saat ${tahap === 'baca' ? 'membaca' : 'menyimpan'} berkas${pesan ? `: ${pesan}` : ''}.` };
}

/**
 * Menyimpan `isi` sebagai `target.berkas`. Bila isinya sama dengan yang ada di repo, tidak membuat commit.
 * Galat dikembalikan sebagai hasil (bukan dilempar) dengan pesan yang bisa ditampilkan langsung ke admin.
 */
export async function terapkanKeRepo(opsi: { token: string; target?: TargetRepo; isi: string; pesan: string; samaDengan?: (isiLama: string) => boolean }, ambil: typeof fetch = fetch): Promise<HasilTerapkan> {
  const target = opsi.target ?? TARGET_BAWAAN;
  if (!opsi.token.trim()) return { ok: false, kode: 'token', galat: 'Token GitHub belum diisi.' };
  const url = alamat(target);
  try {
    let shaLama: string | undefined;
    const baca = await ambil(`${url}?ref=${encodeURIComponent(target.cabang)}`, { headers: kepala(opsi.token), cache: 'no-store' });
    if (baca.ok) {
      const j = (await baca.json()) as { sha?: unknown; content?: unknown; encoding?: unknown };
      if (typeof j.sha === 'string') shaLama = j.sha;
      // isi lama (berkas di bawah 1 MB dikirim GitHub sebagai base64): bila dianggap sama oleh pemanggil, tidak perlu commit
      if (opsi.samaDengan && j.encoding === 'base64' && typeof j.content === 'string') {
        try {
          if (opsi.samaDengan(dariBase64Utf8(j.content))) return { ok: true, status: 'tanpaPerubahan' };
        } catch {
          /* isi lama tidak terbaca: lanjut menyimpan */
        }
      }
    } else if (baca.status !== 404) {
      return { ok: false, ...petakanGalat(baca.status, await pesanGalat(baca), 'baca') };
    }
    if (shaLama && shaLama === (await shaBlobGit(opsi.isi))) return { ok: true, status: 'tanpaPerubahan' };

    const tulis = await ambil(url, {
      method: 'PUT',
      headers: { ...kepala(opsi.token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: opsi.pesan, content: keBase64Utf8(opsi.isi), branch: target.cabang, ...(shaLama ? { sha: shaLama } : {}) }),
    });
    if (!tulis.ok) return { ok: false, ...petakanGalat(tulis.status, await pesanGalat(tulis), 'tulis') };
    const j = (await tulis.json()) as { commit?: { sha?: unknown; html_url?: unknown } };
    return {
      ok: true,
      status: shaLama ? 'diperbarui' : 'dibuat',
      ...(typeof j.commit?.html_url === 'string' ? { urlCommit: j.commit.html_url } : {}),
      ...(typeof j.commit?.sha === 'string' ? { shaCommit: j.commit.sha } : {}),
    };
  } catch {
    return { ok: false, kode: 'jaringan', galat: 'Tidak bisa menghubungi GitHub. Periksa koneksi internet lalu coba lagi.' };
  }
}
