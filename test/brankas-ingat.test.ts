// @vitest-environment node
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { bacaAi, hapusAi } from '../src/io/simpan';
import { aturIngat, brankasSesi, buatBrankas, bukaDenganPin, gantiPin, kunciSesi, muatBrankas, simpanBrankas } from '../src/ui/brankasSesi';

/** Meniru tab baru: memori sesi dikosongkan, hanya IndexedDB yang tersisa. */
function tabBaru() {
  Object.assign(brankasSesi, { dimuat: false, brankas: null, terbuka: false, pin: '', kunci: [], token: '', kunciKripto: null, ingatHari: 7, ingatSampai: null });
}
const kunciContoh = { id: 'k1', label: 'Uji', nilai: 'KUNCI-PALSU-UNTUK-UJI-1234567890', aktif: true };

beforeEach(async () => {
  tabBaru();
  for (const k of ['brankas', 'ingat', 'ingatHari']) await hapusAi(k);
});

describe('brankas: ingat di perangkat', () => {
  it('PIN sekali; tab baru terbuka tanpa PIN dan isinya utuh; token baru tersimpan lewat kunci yang diingat', async () => {
    await buatBrankas('2468', { kunci: [kunciContoh], token: 'github_pat_UJI' });
    expect(brankasSesi.ingatSampai).toBeGreaterThan(Date.now() + 6 * 86_400_000);
    tabBaru();
    await muatBrankas();
    expect(brankasSesi.terbuka).toBe(true);
    expect(brankasSesi.pin).toBe(''); // PIN tidak pernah disimpan
    expect(brankasSesi.kunci[0]?.nilai).toBe(kunciContoh.nilai);
    expect(brankasSesi.token).toBe('github_pat_UJI');
    // menyimpan perubahan tanpa PIN
    brankasSesi.token = 'github_pat_BARU';
    await simpanBrankas();
    tabBaru();
    await muatBrankas();
    expect(brankasSesi.token).toBe('github_pat_BARU');
    // dan PIN tetap membuka brankas yang sama
    tabBaru();
    await muatBrankas();
    kunciSesi();
    await bukaDenganPin('2468');
    expect(brankasSesi.token).toBe('github_pat_BARU');
  });

  it('kunci sekarang menghapus ingatan: tab baru terkunci; PIN salah ditolak', async () => {
    await buatBrankas('2468', { kunci: [kunciContoh] });
    kunciSesi();
    await new Promise((r) => setTimeout(r, 20));
    tabBaru();
    await muatBrankas();
    expect(brankasSesi.terbuka).toBe(false);
    await expect(bukaDenganPin('0000')).rejects.toThrow(/PIN salah/);
    expect(brankasSesi.terbuka).toBe(false);
    await bukaDenganPin('2468');
    expect(brankasSesi.terbuka).toBe(true);
  });

  it('ingatan kedaluwarsa tidak dipakai; durasi 0 tidak menyimpan; mengubah durasi berlaku saat itu juga', async () => {
    await buatBrankas('2468', { kunci: [kunciContoh] });
    const rekam = (await bacaAi<{ sampai: number }>('ingat')) as { sampai: number };
    const { tulisAi } = await import('../src/io/simpan');
    await tulisAi('ingat', { ...rekam, sampai: Date.now() - 1000 });
    tabBaru();
    await muatBrankas();
    expect(brankasSesi.terbuka).toBe(false);
    expect(await bacaAi('ingat')).toBeUndefined();

    await bukaDenganPin('2468');
    await aturIngat(0);
    expect(await bacaAi('ingat')).toBeUndefined();
    tabBaru();
    await muatBrankas();
    expect(brankasSesi.ingatHari).toBe(0);
    expect(brankasSesi.terbuka).toBe(false);

    await bukaDenganPin('2468');
    expect(await bacaAi('ingat')).toBeUndefined(); // durasi 0 tersimpan sebagai pilihan
    await aturIngat(30);
    expect(brankasSesi.ingatSampai).toBeGreaterThan(Date.now() + 29 * 86_400_000);
  });

  it('ganti PIN: PIN lama tidak berlaku lagi, ingatan diperbarui, isi utuh', async () => {
    await buatBrankas('2468', { kunci: [kunciContoh], token: 'tok' });
    await gantiPin('13579');
    tabBaru();
    await muatBrankas();
    expect(brankasSesi.terbuka).toBe(true);
    expect(brankasSesi.token).toBe('tok');
    kunciSesi();
    await new Promise((r) => setTimeout(r, 20));
    tabBaru();
    await muatBrankas();
    await expect(bukaDenganPin('2468')).rejects.toThrow(/PIN salah/);
    await bukaDenganPin('13579');
    expect(brankasSesi.kunci[0]?.nilai).toBe(kunciContoh.nilai);
  });

  it('ingatan milik brankas lain (garam berbeda) tidak dipakai', async () => {
    await buatBrankas('2468', { kunci: [kunciContoh] });
    const ingatLama = await bacaAi('ingat');
    const { tulisAi } = await import('../src/io/simpan');
    await buatBrankas('2468', { kunci: [] }); // brankas baru, garam baru
    await tulisAi('ingat', ingatLama);
    tabBaru();
    await muatBrankas();
    expect(brankasSesi.terbuka).toBe(false);
  });
});
