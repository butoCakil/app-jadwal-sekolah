import { describe, expect, it } from 'vitest';
import { batuNisan, buatBerkasAi, daftarAktif, gabungPengaturan, gabungPercakapan, judulDari, judulTampil, percakapanBaru, uraiBerkasAi, UMUR_BATU_NISAN, type Percakapan } from '../src/ai/percakapan';
import { sinkronkanAi, type DataAi } from '../src/ai/sinkronAi';
import { SesiAi, type PemanggilAi } from '../src/ai/sesi';
import { proyekSekolah } from '../src/model/sekolahData';
import { PENGATURAN_BAWAAN } from '../src/ai/rotasi';
import { dariBase64Utf8, keBase64Utf8 } from '../src/terbit/github';

const pc = (id: string, diubah: number, teks = 'halo'): Percakapan => ({
  ...percakapanBaru(diubah),
  id,
  diubah,
  tampil: [{ id: 1, peran: 'admin', teks, galat: [] }],
});

/** GitHub palsu satu berkas: GET/PUT Contents API dengan sha. */
function githubPalsu(awal?: string) {
  const st = { isi: awal, sha: awal ? 'sha1' : '', n: 1, tulis: 0, tabrakanSekali: false as boolean };
  const ambil = (async (url: RequestInfo | URL, init?: RequestInit) => {
    if (!String(url).includes('/contents/data/admin/ai.json')) return new Response('x', { status: 404 });
    if (!init || !init.method || init.method === 'GET') {
      if (st.isi === undefined) return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 });
      return new Response(JSON.stringify({ sha: st.sha, encoding: 'base64', content: keBase64Utf8(st.isi) }), { status: 200 });
    }
    const b = JSON.parse(String(init.body)) as { content: string; sha?: string };
    if (st.tabrakanSekali) {
      st.tabrakanSekali = false;
      return new Response(JSON.stringify({ message: 'conflict' }), { status: 409 });
    }
    if ((st.isi !== undefined && b.sha !== st.sha) || (st.isi === undefined && b.sha)) return new Response(JSON.stringify({ message: 'sha mismatch' }), { status: 409 });
    st.isi = dariBase64Utf8(b.content);
    st.sha = `sha${++st.n}`;
    st.tulis++;
    return new Response(JSON.stringify({ content: { sha: st.sha }, commit: { html_url: 'https://x' } }), { status: 200 });
  }) as typeof fetch;
  return { st, ambil };
}

describe('riwayat percakapan: gabung', () => {
  it('per id yang terbaru menang; yang hanya ada di satu sisi dipertahankan; urut terbaru dulu', () => {
    const a = [pc('1', 100, 'lokal lama'), pc('2', 300, 'lokal baru')];
    const b = [pc('1', 200, 'remote baru'), pc('2', 250, 'remote lama'), pc('3', 50)];
    const g = gabungPercakapan(a, b, 1000);
    expect(g.map((c) => c.id)).toEqual(['2', '1', '3']);
    expect(g.find((c) => c.id === '1')?.tampil[0]?.teks).toBe('remote baru');
    expect(g.find((c) => c.id === '2')?.tampil[0]?.teks).toBe('lokal baru');
  });

  it('batu nisan menghapus percakapan yang lebih lama di sisi lain, tidak yang lebih baru; batu nisan kedaluwarsa dibuang', () => {
    const lama = pc('1', 100);
    const baru = pc('2', 900);
    const mati = batuNisan(lama, 500);
    const g = gabungPercakapan([mati, baru], [lama, batuNisan(baru, 600)], 1000);
    expect(daftarAktif(g).map((c) => c.id)).toEqual(['2']); // 1 dihapus (500 > 100); 2 diubah 900 > nisan 600
    expect(g.some((c) => c.id === '1' && c.dihapus === 500)).toBe(true);
    const sesudah = gabungPercakapan(g, [], 500 + UMUR_BATU_NISAN + 1);
    expect(sesudah.some((c) => c.id === '1')).toBe(false);
  });

  it('pengaturan: yang terakhir diubah menang', () => {
    const a = { nilai: { ...PENGATURAN_BAWAAN, rpm: 5 }, diubah: 10 };
    const b = { nilai: { ...PENGATURAN_BAWAAN, rpm: 9 }, diubah: 20 };
    expect(gabungPengaturan(a, b)?.nilai.rpm).toBe(9);
    expect(gabungPengaturan(b, a)?.nilai.rpm).toBe(9);
    expect(gabungPengaturan(undefined, a)).toBe(a);
  });

  it('judul dari pesan pertama dipotong; berkas bolak-balik; berkas rusak ditolak, butir rusak dilewati', () => {
    const c = pc('1', 1, 'Tolong geser UKK satu pekan ke depan karena bentrok dengan kegiatan sekolah lain yang baru');
    expect(judulDari(c).endsWith('…')).toBe(true);
    expect(judulDari(c).length).toBeLessThanOrEqual(56);
    expect(judulTampil(percakapanBaru())).toBe('Percakapan baru');
    const teks = buatBerkasAi([c], { nilai: PENGATURAN_BAWAAN, diubah: 5 }, new Date(0));
    const u = uraiBerkasAi(teks);
    expect(u.ok && u.percakapan[0]?.id).toBe('1');
    expect(u.ok && u.pengaturan?.diubah).toBe(5);
    expect(uraiBerkasAi('bukan json').ok).toBe(false);
    expect(uraiBerkasAi('{"format":"lain"}').ok).toBe(false);
    const rusak = uraiBerkasAi(JSON.stringify({ format: 'jadwal-smkn-bansari-ai', versi: 1, disimpan: '', percakapan: [JSON.parse(JSON.stringify(c)), { id: 5 }] }));
    expect(rusak.ok && rusak.dilewati).toBe(1);
  });
});

describe('riwayat percakapan: sinkron ke GitHub (palsu)', () => {
  const lokal = (...c: Percakapan[]): DataAi => ({ percakapan: c });

  it('repo kosong: berkas dibuat; sinkron kedua tanpa perubahan tidak membuat commit', async () => {
    const gh = githubPalsu();
    const r1 = await sinkronkanAi({ token: 't', lokal: lokal(pc('1', 100)), sekarang: () => 1000 }, gh.ambil);
    expect(r1.ok && r1.dikirim).toBe(true);
    expect(gh.st.tulis).toBe(1);
    const r2 = await sinkronkanAi({ token: 't', lokal: lokal(pc('1', 100)), sekarang: () => 1000 }, gh.ambil);
    expect(r2.ok && r2.dikirim).toBe(false);
    expect(gh.st.tulis).toBe(1);
  });

  it('dua perangkat: percakapan masing-masing saling diterima dan tidak ada yang hilang', async () => {
    const gh = githubPalsu();
    await sinkronkanAi({ token: 't', lokal: lokal(pc('a', 100, 'dari ponsel')), sekarang: () => 1000 }, gh.ambil);
    const r = await sinkronkanAi({ token: 't', lokal: lokal(pc('b', 200, 'dari laptop')), sekarang: () => 1000 }, gh.ambil);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.percakapan.map((c) => c.id).sort()).toEqual(['a', 'b']);
    expect(r.baruDariRemote).toBe(1);
    const ponsel = await sinkronkanAi({ token: 't', lokal: lokal(pc('a', 100, 'dari ponsel')), sekarang: () => 1000 }, gh.ambil);
    expect(ponsel.ok && ponsel.data.percakapan.map((c) => c.id).sort()).toEqual(['a', 'b']);
  });

  it('penghapusan di satu perangkat ikut ke perangkat lain', async () => {
    const gh = githubPalsu();
    const asli = pc('a', 100);
    await sinkronkanAi({ token: 't', lokal: lokal(asli), sekarang: () => 1000 }, gh.ambil);
    await sinkronkanAi({ token: 't', lokal: lokal(batuNisan(asli, 500)), sekarang: () => 1000 }, gh.ambil);
    const lain = await sinkronkanAi({ token: 't', lokal: lokal(asli), sekarang: () => 1000 }, gh.ambil);
    expect(lain.ok && daftarAktif(lain.data.percakapan)).toEqual([]);
  });

  it('tabrakan penulisan: baca ulang dan gabung, tanpa menimpa; berkas asing tidak ditimpa', async () => {
    const gh = githubPalsu();
    await sinkronkanAi({ token: 't', lokal: lokal(pc('a', 100)), sekarang: () => 1000 }, gh.ambil);
    gh.st.tabrakanSekali = true;
    const r = await sinkronkanAi({ token: 't', lokal: lokal(pc('a', 100), pc('b', 300)), sekarang: () => 1000 }, gh.ambil);
    expect(r.ok && r.dikirim).toBe(true);
    const asing = githubPalsu('{"format":"lain"}');
    const g = await sinkronkanAi({ token: 't', lokal: lokal(pc('a', 100)) }, asing.ambil);
    expect(g.ok).toBe(false);
    expect(!g.ok && g.kode).toBe('format');
    expect(asing.st.tulis).toBe(0);
  });

  it('token tidak sah dilaporkan jelas', async () => {
    const ambil = (async () => new Response(JSON.stringify({ message: 'Bad credentials' }), { status: 401 })) as unknown as typeof fetch;
    const r = await sinkronkanAi({ token: 'salah', lokal: lokal() }, ambil);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.kode).toBe('token');
  });
});

describe('sesi: simpan dan pulihkan', () => {
  it('riwayat, giliran, dan catatan bertahan; pesan berikutnya membawa memori yang dipulihkan', async () => {
    const dikirim: string[][] = [];
    const pm: PemanggilAi = {
      async panggil(req) {
        dikirim.push(req.pesan.map((m) => m.teks));
        return { ok: true, teks: JSON.stringify({ jawaban: 'Siap', instruksi: [] }), model: 'm', kunciLabel: 'k', token: { masuk: 1, keluar: 1 }, percobaan: 1 };
      },
    };
    const p = proyekSekolah('tahun');
    const a = new SesiAi(pm, () => '2026-11-28');
    await a.kirim('halo satu', p, {});
    a.catatDitolak(a.tampil[1] as never);
    const simpan = JSON.parse(JSON.stringify(a.ekspor()));
    const b = new SesiAi(pm, () => '2026-11-28');
    b.pulihkan(simpan);
    expect(b.tampil.length).toBe(2);
    await b.kirim('halo dua', p, {});
    expect(dikirim[1]?.length).toBe(3); // pesan1, jawaban1, pesan2
    expect(dikirim[1]?.[0]).toBe('halo satu');
    expect(b.tampil.at(-1)?.id).toBe(4); // nomor giliran melanjutkan
  });
});
