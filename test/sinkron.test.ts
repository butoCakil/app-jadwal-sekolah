import { describe, expect, it } from 'vitest';
import { proyekSekolah } from '../src/model/sekolahData';
import { validasiProyek } from '../src/model/validasi';
import { bandingkan, belumDipilih, gabung, pilihanAwal, stabil, urai, type Pilihan } from '../src/sinkron/banding';
import { bacaBerkasAdmin, bangunBerkasAdmin } from '../src/sinkron/format';
import { ambilTinjauan, kirimKeGitHub } from '../src/sinkron/alur';
import { dariBase64Utf8, keBase64Utf8, shaBlobGit } from '../src/terbit/github';
import type { Proyek } from '../src/model/tipe';

const asli = proyekSekolah('tahun');
const salin = (): Proyek => structuredClone(asli);

/** GitHub palsu di memori: satu berkas, sha dihitung dari isi, PUT menolak sha yang tidak cocok. */
function githubPalsu(awal?: string) {
  let isi = awal;
  let sha = awal === undefined ? '' : 'sha0';
  let n = 0;
  const catatan: string[] = [];
  const f = (async (_url: string, init?: RequestInit) => {
    const metode = init?.method ?? 'GET';
    catatan.push(metode);
    const jawab = (status: number, badan: unknown) => new Response(JSON.stringify(badan), { status });
    if (metode === 'GET') {
      if (isi === undefined) return jawab(404, { message: 'Not Found' });
      const minta = new Headers(init?.headers).get('Accept') ?? '';
      if (/raw/.test(minta)) return new Response(isi, { status: 200 });
      return jawab(200, { sha, encoding: 'base64', content: keBase64Utf8(isi) });
    }
    const b = JSON.parse(String(init?.body)) as { content: string; sha?: string };
    if (isi !== undefined && b.sha !== sha) return jawab(409, { message: 'sha mismatch' });
    if (isi === undefined && b.sha) return jawab(422, { message: 'invalid' });
    isi = dariBase64Utf8(b.content);
    sha = `sha${++n}`;
    return jawab(200, { content: { sha }, commit: { html_url: 'https://github.test/c' } });
  }) as unknown as typeof fetch;
  return { f, isi: () => isi, sha: () => sha, catatan, ubahDiLuar: (x: string) => { isi = x; sha = `luar${++n}`; } };
}

describe('banding dan gabungan', () => {
  it('stabil: urutan kunci tidak memengaruhi', () => {
    expect(stabil({ a: 1, b: [1, { y: 2, x: 3 }] })).toBe(stabil({ b: [1, { x: 3, y: 2 }], a: 1 }));
  });

  it('proyek yang sama tidak berbeda', () => {
    expect(bandingkan(salin(), salin(), salin())).toEqual([]);
    expect(urai(asli).length).toBeGreaterThan(100);
  });

  it('tiga arah: perubahan satu sisi otomatis, dua sisi bentrok', () => {
    const basis = salin();
    const lokal = salin();
    const remote = salin();
    lokal.skema[0]!.nama = 'Skema A (diubah di sini)';
    remote.skema[1]!.nama = 'Skema B (diubah di GitHub)';
    lokal.master.guru[0]!.nama = 'Nama dari lokal';
    remote.master.guru[0]!.nama = 'Nama dari GitHub';
    const beda = bandingkan(lokal, remote, basis);
    const status = (kunci: string) => beda.find((b) => b.kunci === kunci)?.status;
    expect(status(`skema:${lokal.skema[0]!.id}`)).toBe('lokal');
    expect(status(`skema:${remote.skema[1]!.id}`)).toBe('remote');
    expect(status(`guru:${lokal.master.guru[0]!.id}`)).toBe('bentrok');
    expect(beda).toHaveLength(3);
    const pilih = pilihanAwal(beda);
    expect(belumDipilih(beda, pilih).map((b) => b.kunci)).toEqual([`guru:${lokal.master.guru[0]!.id}`]);
  });

  it('tanpa acuan semua perbedaan berstatus beda dan tidak ada pilihan awal', () => {
    const lokal = salin();
    lokal.skema[0]!.nama = 'X';
    const beda = bandingkan(lokal, salin(), null);
    expect(beda.map((b) => b.status)).toEqual(['beda']);
    expect(pilihanAwal(beda).size).toBe(0);
  });

  it('gabung memuat perubahan kedua sisi, hasilnya valid, bentrok mengikuti pilihan', () => {
    const basis = salin();
    const lokal = salin();
    const remote = salin();
    lokal.skema[0]!.nama = 'Skema A lokal';
    remote.skema[1]!.nama = 'Skema B GitHub';
    lokal.master.guru[0]!.nama = 'Guru lokal';
    remote.master.guru[0]!.nama = 'Guru GitHub';
    const beda = bandingkan(lokal, remote, basis);
    const pilih = pilihanAwal(beda);
    pilih.set(`guru:${lokal.master.guru[0]!.id}`, 'remote');
    const h = gabung(lokal, remote, pilih);
    expect(h.skema[0]!.nama).toBe('Skema A lokal');
    expect(h.skema[1]!.nama).toBe('Skema B GitHub');
    expect(h.master.guru[0]!.nama).toBe('Guru GitHub');
    expect(validasiProyek(h)).toEqual([]);
    // sisanya tidak berubah
    expect(h.beban).toEqual(basis.beban);
    expect(h.versi).toEqual(basis.versi);
    pilih.set(`guru:${lokal.master.guru[0]!.id}`, 'lokal');
    expect(gabung(lokal, remote, pilih).master.guru[0]!.nama).toBe('Guru lokal');
  });

  it('gabung: butir baru dan butir dihapus mengikuti pilihan', () => {
    const basis = salin();
    const lokal = salin();
    const remote = salin();
    const hapus = remote.kalender[remote.kalender.length - 1]!;
    remote.kalender.pop();
    lokal.kalender.push({ ...structuredClone(lokal.kalender[0]!), id: 'kg-baru', nama: 'Acara baru lokal' });
    const beda = bandingkan(lokal, remote, basis);
    expect(beda.map((b) => `${b.status}:${b.kunci}`).sort()).toEqual([`lokal:kalender:kg-baru`, `remote:kalender:${hapus.id}`].sort());
    const h = gabung(lokal, remote, pilihanAwal(beda));
    expect(h.kalender.some((k) => k.id === 'kg-baru')).toBe(true);
    expect(h.kalender.some((k) => k.id === hapus.id)).toBe(false);
    expect(validasiProyek(h)).toEqual([]);
  });

  it('gabung dengan semua pilihan remote sama persis dengan remote (isi), semua lokal sama dengan lokal', () => {
    const lokal = salin();
    const remote = salin();
    lokal.skema[0]!.nama = 'L';
    lokal.beban[0]!.jp += 1;
    remote.aturan.pop();
    remote.versi[0]!.slots.pop();
    const beda = bandingkan(lokal, remote, null);
    const semua = (s: Pilihan) => new Map(beda.map((b) => [b.kunci, s] as const));
    expect(bandingkan(gabung(lokal, remote, semua('remote')), remote)).toEqual([]);
    expect(bandingkan(gabung(lokal, remote, semua('lokal')), lokal)).toEqual([]);
  });
});

describe('berkas admin', () => {
  it('bolak-balik membawa seluruh isi proyek', () => {
    const teks = bangunBerkasAdmin(asli, new Date('2026-11-28T00:00:00Z'));
    const h = bacaBerkasAdmin(teks);
    expect(h.ok).toBe(true);
    if (h.ok) {
      expect(h.berkas.disimpan).toBe('2026-11-28T00:00:00.000Z');
      expect(bandingkan(h.berkas.proyek, asli)).toEqual([]);
      // data kerja admin ikut (berbeda dengan berkas terbit)
      expect(h.berkas.proyek.aturan.length).toBe(asli.aturan.length);
      expect(h.berkas.proyek.kalender.some((k) => k.catatan)).toBe(true);
    }
  });

  it('menolak format asing, JSON rusak, dan data pribadi', () => {
    expect(bacaBerkasAdmin('{bukan json').ok).toBe(false);
    expect(bacaBerkasAdmin('{"format":"lain","versi":1}').ok).toBe(false);
    const buruk = salin();
    buruk.master.guru[0]!.nama = 'NIP 198001012005011001';
    expect(() => bangunBerkasAdmin(buruk)).toThrow(/ditolak/);
  });
});

describe('alur sinkron dengan GitHub palsu', () => {
  it('berkas belum ada: tinjauan kosong, lalu kirim membuatnya', async () => {
    const gh = githubPalsu();
    const t = await ambilTinjauan({ lokal: asli }, gh.f);
    expect(t.ok && t.tinjauan.remote).toBe(null);
    const k = await kirimKeGitHub({ token: 'ghp_x'.padEnd(30, 'x'), proyek: asli, shaDiharapkan: '', pesan: 'uji' }, gh.f);
    expect(k.ok).toBe(true);
    expect(gh.isi()).toBeDefined();
    if (k.ok) expect(k.penanda.sha).toBe(gh.sha());
    const t2 = await ambilTinjauan({ lokal: asli }, gh.f);
    expect(t2.ok && t2.tinjauan.beda).toEqual([]);
  });

  it('membaca berkas besar lewat jalur mentah bila isi base64 kosong', async () => {
    const isi = bangunBerkasAdmin(asli);
    const f = (async (_u: string, init?: RequestInit) => {
      const raw = /raw/.test(new Headers(init?.headers).get('Accept') ?? '');
      return raw ? new Response(isi, { status: 200 }) : new Response(JSON.stringify({ sha: 'abc', encoding: 'none', content: '' }), { status: 200 });
    }) as unknown as typeof fetch;
    const t = await ambilTinjauan({ lokal: asli }, f);
    expect(t.ok && t.tinjauan.shaRemote).toBe('abc');
    expect(t.ok && t.tinjauan.beda).toEqual([]);
  });

  it('repo berubah di antara perbandingan dan kirim: ditolak, isi orang lain tidak tertimpa', async () => {
    const awal = bangunBerkasAdmin(asli);
    const gh = githubPalsu(awal);
    const t = await ambilTinjauan({ lokal: asli }, gh.f);
    expect(t.ok).toBe(true);
    const sha = t.ok ? t.tinjauan.shaRemote : '';
    const dariLuar = salin();
    dariLuar.skema[0]!.nama = 'Diubah admin lain';
    gh.ubahDiLuar(bangunBerkasAdmin(dariLuar));
    const lokal = salin();
    lokal.master.guru[0]!.nama = 'Perubahan saya';
    const k = await kirimKeGitHub({ token: 'ghp_x'.padEnd(30, 'x'), proyek: lokal, shaDiharapkan: sha, pesan: 'uji' }, gh.f);
    expect(k.ok).toBe(false);
    if (!k.ok) expect(k.kode).toBe('bentrok');
    expect(gh.isi()).toContain('Diubah admin lain');
    expect(gh.isi()).not.toContain('Perubahan saya');
  });

  it('dua perangkat: A kirim, B (punya acuan lama) menggabung otomatis perubahan A dan perubahannya sendiri', async () => {
    const gh = githubPalsu();
    const token = 'ghp_x'.padEnd(30, 'x');
    // A mengirim keadaan awal; B mengambilnya (penanda sama)
    const a0 = await kirimKeGitHub({ token, proyek: asli, shaDiharapkan: '', pesan: 'a0' }, gh.f);
    expect(a0.ok).toBe(true);
    if (!a0.ok) return;
    const penandaB = a0.penanda;
    // A mengubah skema lalu mengirim
    const a1 = salin();
    a1.skema[0]!.nama = 'Skema dari A';
    const kirimA = await kirimKeGitHub({ token, proyek: a1, shaDiharapkan: a0.penanda.sha, pesan: 'a1' }, gh.f);
    expect(kirimA.ok).toBe(true);
    // B mengubah guru (lokal), lalu menyinkron
    const b = salin();
    b.master.guru[1]!.nama = 'Guru dari B';
    const t = await ambilTinjauan({ lokal: b, penanda: penandaB }, gh.f);
    expect(t.ok).toBe(true);
    if (!t.ok) return;
    const pilih = pilihanAwal(t.tinjauan.beda);
    expect(belumDipilih(t.tinjauan.beda, pilih)).toEqual([]);
    const hasil = gabung(b, t.tinjauan.remote!, pilih);
    expect(hasil.skema[0]!.nama).toBe('Skema dari A');
    expect(hasil.master.guru[1]!.nama).toBe('Guru dari B');
    const kirimB = await kirimKeGitHub({ token, proyek: hasil, shaDiharapkan: t.tinjauan.shaRemote, pesan: 'b' }, gh.f);
    expect(kirimB.ok).toBe(true);
    expect(gh.isi()).toContain('Skema dari A');
    expect(gh.isi()).toContain('Guru dari B');
    expect(await shaBlobGit(gh.isi()!)).toBeTruthy();
  });

  it('berkas GitHub rusak: galat jelas dan sha dikembalikan untuk menimpa dengan sadar', async () => {
    const gh = githubPalsu('{"format":"lain"}');
    const t = await ambilTinjauan({ lokal: asli }, gh.f);
    expect(t.ok).toBe(false);
    if (!t.ok) {
      expect(t.kode).toBe('format');
      expect(t.shaRemote).toBe('sha0');
    }
  });
});
