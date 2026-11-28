import { describe, expect, it } from 'vitest';
import { alamatSegar, versiTerbaru } from '../src/versi';

describe('pemeriksa versi', () => {
  it('membaca id versi terbaru dan meminta tanpa cache', async () => {
    let opsi: RequestInit | undefined;
    const ambil = (async (_u: string, o?: RequestInit) => {
      opsi = o;
      return new Response(JSON.stringify({ id: 'abc' }));
    }) as unknown as typeof fetch;
    expect(await versiTerbaru(ambil)).toBe('abc');
    expect(opsi?.cache).toBe('no-store');
  });

  it('galat, 404, atau isi salah menghasilkan null (tidak memuat ulang)', async () => {
    expect(await versiTerbaru((async () => new Response('', { status: 404 })) as unknown as typeof fetch)).toBeNull();
    expect(await versiTerbaru((async () => { throw new Error('offline'); }) as unknown as typeof fetch)).toBeNull();
    expect(await versiTerbaru((async () => new Response('{"id":5}')) as unknown as typeof fetch)).toBeNull();
  });

  it('alamat segar memakai kunci cache baru dan mempertahankan hash', () => {
    expect(alamatSegar('k1', { pathname: '/app-jadwal-sekolah/', hash: '#/?m=semua' })).toBe('/app-jadwal-sekolah/?v=k1#/?m=semua');
  });
});
