import { TARGET_BAWAAN, bacaDariRepo, tulisKeRepo, type KodeGalat, type TargetRepo } from '../terbit/github';
import { buatBerkasAi, gabungPengaturan, gabungPercakapan, kunciIsi, uraiBerkasAi, type PengaturanBertanda, type Percakapan } from './percakapan';

/**
 * Sinkron riwayat percakapan dan pengaturan model ke repo (berkas data/admin/ai.json). Kunci API dan token tidak ikut.
 * Penggabungan per percakapan (yang terakhir diubah menang), penulisan dijaga sha sehingga tidak menimpa perubahan perangkat lain.
 * Repo ini publik: isi berkas dapat dibaca siapa pun.
 */
export const TARGET_AI: TargetRepo = { ...TARGET_BAWAAN, berkas: 'data/admin/ai.json' };

export interface DataAi {
  percakapan: Percakapan[];
  pengaturan?: PengaturanBertanda;
}

export type HasilSinkronAi =
  | { ok: true; data: DataAi; dikirim: boolean; baruDariRemote: number; dilewati: number }
  | { ok: false; kode: KodeGalat | 'format'; galat: string };

/** Membaca berkas di repo, menggabungkannya dengan data lokal, dan menulis balik bila ada yang berbeda. Mencoba lagi sekali bila ada tabrakan. */
export async function sinkronkanAi(opsi: { token: string; lokal: DataAi; target?: TargetRepo; sekarang?: () => number }, ambil: typeof fetch = fetch): Promise<HasilSinkronAi> {
  const target = opsi.target ?? TARGET_AI;
  const sekarang = opsi.sekarang ?? Date.now;
  let lokal = opsi.lokal;
  for (let percobaan = 0; percobaan < 3; percobaan++) {
    const r = await bacaDariRepo({ token: opsi.token, target }, ambil);
    if (!r.ok) return { ok: false, kode: r.kode, galat: r.galat };
    let remote: DataAi = { percakapan: [] };
    let dilewati = 0;
    if (r.ada) {
      const u = uraiBerkasAi(r.isi);
      if (!u.ok) return { ok: false, kode: 'format', galat: `${u.galat} Tidak ditimpa; periksa berkas ${target.berkas} di repo.` };
      remote = { percakapan: u.percakapan, ...(u.pengaturan ? { pengaturan: u.pengaturan } : {}) };
      dilewati = u.dilewati;
    }
    const gabung = gabungPercakapan(lokal.percakapan, remote.percakapan, sekarang());
    const pengaturan = gabungPengaturan(lokal.pengaturan, remote.pengaturan);
    const data: DataAi = { percakapan: gabung, ...(pengaturan ? { pengaturan } : {}) };
    const baruDariRemote = remote.percakapan.filter((c) => {
      const l = lokal.percakapan.find((x) => x.id === c.id);
      return !l || c.diubah > l.diubah;
    }).length;
    if (r.ada && kunciIsi(gabung, pengaturan) === kunciIsi(remote.percakapan, remote.pengaturan)) return { ok: true, data, dikirim: false, baruDariRemote, dilewati };
    const w = await tulisKeRepo({ token: opsi.token, target, isi: buatBerkasAi(gabung, pengaturan, new Date(sekarang())), pesan: 'Sinkron riwayat asisten AI', ...(r.ada ? { shaDiharapkan: r.sha } : {}) }, ambil);
    if (w.ok) return { ok: true, data, dikirim: true, baruDariRemote, dilewati };
    if (w.kode !== 'bentrok') return { ok: false, kode: w.kode, galat: w.galat };
    lokal = data; // baca ulang dan gabung lagi
  }
  return { ok: false, kode: 'bentrok', galat: 'Berkas di GitHub terus berubah saat disimpan. Coba lagi sebentar lagi.' };
}
