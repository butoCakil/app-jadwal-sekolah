/**
 * Alur sinkron antara draf lokal dan berkas admin di GitHub. Tanpa UI dan tanpa IndexedDB (penanda diberikan pemanggil),
 * supaya bisa diuji dengan fetch palsu.
 */

import type { Proyek } from '../model/tipe';
import { bacaDariRepo, shaBlobGit, tulisKeRepo, type KodeGalat, type TargetRepo } from '../terbit/github';
import { bandingkan, type Perbedaan } from './banding';
import { bacaBerkasAdmin, bangunBerkasAdmin } from './format';

export interface PenandaDasar {
  sha: string;
  isi: string;
  waktu: string;
}

export interface Tinjauan {
  /** null = berkas admin belum ada di GitHub */
  remote: Proyek | null;
  isiRemote: string;
  shaRemote: string;
  /** waktu penyimpanan yang tercatat di berkas GitHub */
  waktuRemote: string;
  /** proyek pada sinkron terakhir; null = belum pernah sinkron di peramban ini */
  basis: Proyek | null;
  waktuBasis: string;
  beda: Perbedaan[];
}

export type HasilTinjau = { ok: true; tinjauan: Tinjauan } | { ok: false; kode: KodeGalat | 'format'; galat: string; /** sha berkas yang tidak terbaca (untuk menimpanya dengan sadar) */ shaRemote?: string };

export async function ambilTinjauan(opsi: { lokal: Proyek; token?: string; penanda?: PenandaDasar; target?: TargetRepo }, ambil: typeof fetch = fetch): Promise<HasilTinjau> {
  const r = await bacaDariRepo({ ...(opsi.token ? { token: opsi.token } : {}), ...(opsi.target ? { target: opsi.target } : {}) }, ambil);
  if (!r.ok) return r;
  let basis: Proyek | null = null;
  if (opsi.penanda) {
    const b = bacaBerkasAdmin(opsi.penanda.isi);
    if (b.ok) basis = b.berkas.proyek;
  }
  const dasar = { basis, waktuBasis: opsi.penanda?.waktu ?? '' };
  if (!r.ada) return { ok: true, tinjauan: { remote: null, isiRemote: '', shaRemote: '', waktuRemote: '', beda: [], ...dasar } };
  const b = bacaBerkasAdmin(r.isi);
  if (!b.ok) return { ok: false, kode: 'format', galat: b.galat, shaRemote: r.sha };
  return { ok: true, tinjauan: { remote: b.berkas.proyek, isiRemote: r.isi, shaRemote: r.sha, waktuRemote: b.berkas.disimpan, beda: bandingkan(opsi.lokal, b.berkas.proyek, basis), ...dasar } };
}

export type HasilKirim = { ok: true; penanda: PenandaDasar; urlCommit?: string } | { ok: false; kode: KodeGalat; galat: string };

/** Menulis `proyek` ke berkas admin. `shaDiharapkan` = sha berkas saat dibandingkan ('' bila belum ada); repo yang berubah sejak itu menghasilkan kode `bentrok`. */
export async function kirimKeGitHub(opsi: { token: string; proyek: Proyek; shaDiharapkan: string; pesan: string; target?: TargetRepo }, ambil: typeof fetch = fetch): Promise<HasilKirim> {
  const isi = bangunBerkasAdmin(opsi.proyek);
  const h = await tulisKeRepo({ token: opsi.token, isi, pesan: opsi.pesan, ...(opsi.shaDiharapkan ? { shaDiharapkan: opsi.shaDiharapkan } : {}), ...(opsi.target ? { target: opsi.target } : {}) }, ambil);
  if (!h.ok) return h;
  return { ok: true, penanda: { sha: h.sha || (await shaBlobGit(isi)), isi, waktu: new Date().toISOString() }, ...(h.urlCommit ? { urlCommit: h.urlCommit } : {}) };
}

/** Penanda untuk keadaan "lokal sama dengan yang ada di GitHub". */
export const penandaDariRemote = (t: Tinjauan): PenandaDasar => ({ sha: t.shaRemote, isi: t.isiRemote, waktu: new Date().toISOString() });

/** Proyek dari GitHub untuk dipakai sebagai draf; pengaturan peramban (periode aktif) dipertahankan bila masih ada. */
export function dariRemoteUntukLokal(lokal: Proyek, remote: Proyek): Proyek {
  const hasil = structuredClone(remote);
  const aktif = lokal.periodeAktifId;
  if (aktif && hasil.kalender.some((k) => k.id === aktif)) hasil.periodeAktifId = aktif;
  return hasil;
}
