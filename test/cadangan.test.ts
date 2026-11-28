import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { proyekSekolah } from '../src/model/sekolahData';
import { proyekContoh } from '../src/model/contoh';
import { bacaBerkasImpor, bacaCadangan, kumpulkanCadangan, ringkasCadangan, serialCadangan, terapkanCadangan, type Gudang } from '../src/io/cadangan';
import { gudangPeramban } from '../src/io/gudangPeramban';
import { bacaAi, hapusAi, hapusDataset, hapusDraf, hapusSinkron, semuaDatasetMentah, simpanDataset, simpanDraf, tulisAi, tulisSinkron, type DatasetTersimpan } from '../src/io/simpan';
import { kunciBrankas } from '../src/ai/brankas';
import { bandingkan } from '../src/sinkron/banding';
import { bangunBerkasAdmin } from '../src/sinkron/format';
import { keJson } from '../src/io/simpan';
import type { Proyek } from '../src/model/tipe';
import { percakapanBaru, type Percakapan } from '../src/ai/percakapan';

const tahun = proyekSekolah('tahun');
const contoh = proyekContoh();

async function kosongkan(): Promise<void> {
  await hapusDraf();
  for (const d of await semuaDatasetMentah()) await hapusDataset(d.id);
  for (const k of ['pengaturan', 'status', 'brankas', 'percakapan', 'pengaturanDiubah']) await hapusAi(k);
  await hapusSinkron();
}

/** Gudang di memori untuk membandingkan hasil impor dengan keadaan awal tanpa menyentuh IndexedDB. */
function gudangMemori(): Gudang & { isi: Map<string, unknown> } {
  const isi = new Map<string, unknown>();
  return {
    isi,
    bacaDraf: async () => isi.get('draf'),
    tulisDraf: async (p) => void isi.set('draf', structuredClone(p)),
    semuaDataset: async () => [...isi.entries()].filter(([k]) => k.startsWith('ds:')).map(([, v]) => structuredClone(v as DatasetTersimpan)),
    tulisDataset: async (d) => void isi.set(`ds:${d.id}`, structuredClone(d)),
    bacaAi: async (k) => isi.get(`ai:${k}`),
    tulisAi: async (k, v) => void isi.set(`ai:${k}`, structuredClone(v)),
    bacaSinkron: async () => isi.get('sinkron') as never,
    tulisSinkron: async (m) => void isi.set('sinkron', structuredClone(m)),
  };
}

beforeEach(kosongkan);

describe('paket cadangan', () => {
  it('bolak-balik: semua yang pernah diatur kembali persis, termasuk brankas terenkripsi bila dipilih', async () => {
    const draf = structuredClone(tahun);
    draf.nama = 'Draf kerja Benny';
    draf.skema[0]!.nama = 'Skema yang saya ubah';
    const ds1: DatasetTersimpan = { id: 'ds1', nama: 'Gasal 2026/2027', disimpan: '2026-11-01T00:00:00.000Z', proyek: structuredClone(tahun) };
    const ds2: DatasetTersimpan = { id: 'ds2', nama: 'Contoh', disimpan: '2026-10-01T00:00:00.000Z', proyek: structuredClone(contoh) };
    const pengaturan = { model: 'gemini-3.5-flash-lite', cadangan: ['gemini-3.1-flash-lite'], rpm: 12, rpd: 400 };
    const status = { slot: { 'k1|m': { menit: 3, hari: 7 } }, tidakSah: { k2: 'ditolak' }, galat: [{ t: 1, kunci: 'k1', model: 'm', status: 429, pesan: 'batas' }] };
    const brankas = await kunciBrankas('pin-rahasia', { kunci: [], token: 'github_pat_rahasia_sekali_12345' }, 1000);
    const penanda = { sha: 'abc', isi: bangunBerkasAdmin(tahun), waktu: '2026-11-20T00:00:00.000Z' };
    await simpanDraf(draf);
    await simpanDataset(ds1);
    await simpanDataset(ds2);
    await tulisAi('pengaturan', pengaturan);
    await tulisAi('status', status);
    await tulisAi('brankas', brankas);
    await tulisSinkron(penanda);

    const paket = await kumpulkanCadangan(gudangPeramban, { sertakanBrankas: true }, new Date('2026-11-28T00:00:00Z'));
    const teks = serialCadangan(paket);
    // token tidak pernah polos di berkas
    expect(teks).not.toContain('github_pat_rahasia');
    await kosongkan();
    expect(await semuaDatasetMentah()).toEqual([]);

    const h = bacaCadangan(teks);
    expect(h.ok).toBe(true);
    if (!h.ok) return;
    expect(h.peringatan).toEqual([]);
    await terapkanCadangan(gudangPeramban, h.paket);

    const kembali = await kumpulkanCadangan(gudangPeramban, { sertakanBrankas: true }, new Date('2026-11-28T00:00:00Z'));
    expect(kembali).toEqual(paket);
    expect(bandingkan(kembali.draf as Proyek, draf)).toEqual([]);
    expect((await semuaDatasetMentah()).map((d) => d.id).sort()).toEqual(['ds1', 'ds2']);
    expect(await bacaAi('pengaturan')).toEqual(pengaturan);
    expect(await bacaAi('status')).toEqual(status);
    expect(await bacaAi('brankas')).toEqual(brankas);
  });

  it('tanpa brankas: brankas tidak ikut dan brankas di peramban tujuan tidak disentuh', async () => {
    const brankas = await kunciBrankas('pin-rahasia', { kunci: [], token: 'github_pat_rahasia_sekali_12345' }, 1000);
    await simpanDraf(tahun);
    await tulisAi('brankas', brankas);
    const paket = await kumpulkanCadangan(gudangPeramban, { sertakanBrankas: false });
    expect(paket.brankas).toBeUndefined();
    expect(serialCadangan(paket)).not.toContain('"garam"');
    const lain = await kunciBrankas('pin-lain', { kunci: [], token: 'token_lain_di_perangkat_tujuan_999' }, 1000);
    await tulisAi('brankas', lain);
    await terapkanCadangan(gudangPeramban, paket);
    expect(await bacaAi('brankas')).toEqual(lain);
  });

  it('impor ke gudang kosong menghasilkan keadaan yang sama dengan sumbernya', async () => {
    const g = gudangMemori();
    await g.tulisDraf(tahun);
    await g.tulisDataset({ id: 'a', nama: 'A', disimpan: '2026-01-01T00:00:00.000Z', proyek: contoh });
    await g.tulisAi('pengaturan', { model: 'm', cadangan: [], rpm: 5, rpd: 20 });
    await g.tulisSinkron({ sha: 's', isi: '{}', waktu: '2026-01-01T00:00:00.000Z' });
    const paket = await kumpulkanCadangan(g, { sertakanBrankas: true }, new Date('2026-11-28T00:00:00Z'));
    const h = bacaCadangan(serialCadangan(paket));
    expect(h.ok).toBe(true);
    if (!h.ok) return;
    const tujuan = gudangMemori();
    await terapkanCadangan(tujuan, h.paket);
    expect([...tujuan.isi.keys()].sort()).toEqual([...g.isi.keys()].sort());
    for (const [k, v] of g.isi) expect(tujuan.isi.get(k)).toEqual(v);
  });

  it('draf dalam memori (belum sempat tersimpan) diutamakan', async () => {
    await simpanDraf(contoh);
    const baru = structuredClone(tahun);
    baru.nama = 'Belum tersimpan';
    const paket = await kumpulkanCadangan(gudangPeramban, { drafSaatIni: baru, sertakanBrankas: false });
    expect(paket.draf?.nama).toBe('Belum tersimpan');
  });

  it('menolak berkas asing, draf rusak, dan melewati bagian tidak sah dengan peringatan', async () => {
    expect(bacaCadangan('{"format":"lain"}').ok).toBe(false);
    expect(bacaCadangan('bukan json').ok).toBe(false);
    const paket = await kumpulkanCadangan(gudangPeramban, { drafSaatIni: tahun, sertakanBrankas: false });
    const rusak = JSON.parse(serialCadangan(paket));
    rusak.dataset = [{ id: 'x', nama: 'Rusak', disimpan: '2026-01-01T00:00:00Z', proyek: { bukan: 'proyek' } }];
    rusak.ai = { pengaturan: { model: 5 } };
    rusak.brankas = { v: 1 };
    const h = bacaCadangan(JSON.stringify(rusak));
    expect(h.ok).toBe(true);
    if (h.ok) {
      expect(h.paket.dataset).toEqual([]);
      expect(h.paket.ai).toEqual({});
      expect(h.paket.brankas).toBeUndefined();
      expect(h.peringatan).toHaveLength(3);
    }
    const drafRusak = JSON.parse(serialCadangan(paket));
    drafRusak.draf = { nama: 'rusak' };
    expect(bacaCadangan(JSON.stringify(drafRusak)).ok).toBe(false);
  });

  it('bacaBerkasImpor mengenali cadangan, berkas admin GitHub, dan ekspor proyek lama', async () => {
    const paket = await kumpulkanCadangan(gudangPeramban, { drafSaatIni: tahun, sertakanBrankas: false });
    expect(bacaBerkasImpor(serialCadangan(paket)).jenis).toBe('cadangan');
    const admin = bacaBerkasImpor(bangunBerkasAdmin(tahun));
    expect(admin.jenis === 'proyek' && admin.asal).toBe('admin');
    const lama = bacaBerkasImpor(keJson(tahun));
    expect(lama.jenis === 'proyek' && lama.asal).toBe('proyek');
    expect(bacaBerkasImpor('{"format":"x"}').jenis).toBe('galat');
  });
});


describe('cadangan: riwayat percakapan AI', () => {
  const buat = (id: string, diubah: number, teks: string): Percakapan => ({ ...percakapanBaru(diubah), id, diubah, tampil: [{ id: 1, peran: 'admin', teks, galat: [] } as never] });

  it('ikut dibawa, dan saat dipulihkan digabung dengan riwayat yang ada (yang terakhir diubah menang)', async () => {
    await tulisAi('percakapan', { daftar: [buat('a', 100, 'versi lama a'), buat('b', 100, 'hanya di perangkat')], aktifId: 'b' });
    await tulisAi('pengaturanDiubah', 555);
    const paket = await kumpulkanCadangan(gudangPeramban, { sertakanBrankas: false });
    expect(paket.ai.percakapan?.length).toBe(2);
    expect(paket.ai.pengaturanDiubah).toBe(555);
    const h = bacaCadangan(serialCadangan(paket));
    expect(h.ok).toBe(true);
    if (!h.ok) return;
    expect(h.peringatan).toEqual([]);

    // perangkat tujuan: a lebih baru, c hanya ada di sana
    await tulisAi('percakapan', { daftar: [buat('a', 900, 'versi baru a'), buat('c', 100, 'hanya di tujuan')], aktifId: 'c' });
    await terapkanCadangan(gudangPeramban, h.paket);
    const hasil = (await bacaAi('percakapan')) as { daftar: Percakapan[]; aktifId: string };
    const ids = hasil.daftar.map((c) => c.id).sort();
    expect(ids).toEqual(['a', 'b', 'c']);
    expect(hasil.daftar.find((c) => c.id === 'a')?.tampil[0]?.teks).toBe('versi baru a');
    expect(hasil.aktifId).toBe('c');
    expect(ringkasCadangan(h.paket).join('\n')).toContain('2 percakapan asisten AI');
  });

  it('percakapan rusak di cadangan dilewati dengan peringatan, bukan menggagalkan seluruh paket', async () => {
    await tulisAi('percakapan', { daftar: [buat('a', 100, 'ok')], aktifId: 'a' });
    const paket = await kumpulkanCadangan(gudangPeramban, { sertakanBrankas: false });
    const mentah = JSON.parse(serialCadangan(paket));
    mentah.ai.percakapan.push({ id: 5 }, 'sampah');
    const h = bacaCadangan(JSON.stringify(mentah));
    expect(h.ok).toBe(true);
    if (!h.ok) return;
    expect(h.paket.ai.percakapan?.length).toBe(1);
    expect(h.peringatan.join(' ')).toContain('2 percakapan AI');
  });
});
