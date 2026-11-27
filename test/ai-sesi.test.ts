import { describe, expect, it } from 'vitest';
import { proyekSekolah } from '../src/model/sekolahData';
import { SesiAi, type PemanggilAi } from '../src/ai/sesi';
import { INSTRUKSI_SISTEM, ambilPotret, bandingkanPotret, ringkasData } from '../src/ai/prompt';
import { bukaBrankas, kunciBrankas, samarkan } from '../src/ai/brankas';
import { terapkanInstruksi } from '../src/ai/instruksi';
import type { PermintaanAi } from '../src/ai/klien';
import type { HasilRotasi } from '../src/ai/rotasi';

function pemanggilPalsu(balasan: (string | HasilRotasi)[]) {
  const diminta: PermintaanAi[] = [];
  const p: PemanggilAi = {
    async panggil(req) {
      diminta.push(structuredClone(req));
      const b = balasan.shift();
      if (b === undefined) throw new Error('balasan habis');
      return typeof b === 'string' ? { ok: true, teks: b, model: 'm', kunciLabel: 'k1', token: { masuk: 1, keluar: 1 }, percobaan: 1 } : b;
    },
  };
  return { p, diminta };
}
const json = (o: unknown) => JSON.stringify(o);
const PRE6 = { op: 'ubahJp', sasaran: { rombel: ['XII TE 1'], mapel: ['PRE'] }, jp: 6 };

describe('AI: prompt', () => {
  it('ringkasan data hanya memuat kode (tanpa nama lengkap guru)', () => {
    const p = proyekSekolah('tahun');
    const teks = ringkasData(p, {});
    expect(teks).toContain('XII TE 1: ');
    expect(teks).toContain('PRE(BEN)4');
    for (const g of p.master.guru.slice(0, 30)) if (g.nama.length > 8) expect(teks).not.toContain(g.nama);
    expect(teks).toContain('jadwal induk semester');
    expect(ringkasData(p, { kegiatanId: 'k-asas' })).toContain('kegiatan "ASAS Kelas X dan ASAJ Kelas XII"');
  });

  it('sistem prompt memuat semua operasi', () => {
    for (const op of ['ubahJp', 'hapusBeban', 'tambahBeban', 'ruangBeban', 'guruTidakTersedia', 'ruangTerlarang', 'kunciRuang', 'susun']) expect(INSTRUKSI_SISTEM).toContain(`"op":"${op}"`);
  });

  it('perubahan admin terdeteksi dari potret', () => {
    const p = proyekSekolah('tahun');
    const a = ambilPotret(p, {});
    const q = structuredClone(p);
    terapkanInstruksi(q, {}, [{ op: 'ubahJp', sasaran: { rombel: ['XII TE 1'], mapel: ['PRE'] }, jp: 6 }]);
    const beda = bandingkanPotret(a, ambilPotret(q, {}));
    expect(beda.length).toBe(1);
    expect(beda[0]).toMatch(/^Beban diubah: XII TE 1 PRE\(BEN\) 4 JP.* → XII TE 1 PRE\(BEN\) 6 JP/);
    expect(bandingkanPotret(a, a)).toEqual([]);
  });
});

describe('AI: sesi percakapan', () => {
  it('usulan valid menjadi rencana menunggu; memori sesi tidak memuat data; sistem prompt dan data dikirim', async () => {
    const p = proyekSekolah('tahun');
    const { p: pem, diminta } = pemanggilPalsu([json({ jawaban: 'PRE jadi 6 JP.', instruksi: [PRE6] })]);
    const s = new SesiAi(pem);
    const g = await s.kirim('Jadikan PRE XII TE 1 enam jam', p, {});
    expect(g.rencana?.status).toBe('menunggu');
    expect(g.rencana?.hasil.perubahan[0]?.teks).toBe('XII TE 1 · PRE (BEN): 4 → 6 JP');
    expect(diminta[0]?.sistem).toBe(INSTRUKSI_SISTEM);
    expect(diminta[0]?.pesan.at(-1)?.teks).toContain('DATA (terbaru)');
    expect(s.riwayat).toEqual([{ peran: 'user', teks: 'Jadikan PRE XII TE 1 enam jam' }, { peran: 'model', teks: json({ jawaban: 'PRE jadi 6 JP.', instruksi: [PRE6] }) }]);
    expect(JSON.stringify(p)).toBe(JSON.stringify(proyekSekolah('tahun'))); // belum ada yang berubah
  });

  it('kode salah: validator menolak, AI diberi satu kesempatan memperbaiki, admin hanya melihat hasil akhir', async () => {
    const p = proyekSekolah('tahun');
    const salah = { op: 'ubahJp', sasaran: { rombel: ['XII TE 1'], mapel: ['PRX'] }, jp: 6 };
    const { p: pem, diminta } = pemanggilPalsu([json({ jawaban: 'x', instruksi: [salah] }), json({ jawaban: 'Sudah diperbaiki.', instruksi: [PRE6] })]);
    const s = new SesiAi(pem);
    const g = await s.kirim('PRE XII TE 1 jadi 6', p, {});
    expect(diminta.length).toBe(2);
    expect(diminta[1]?.pesan.at(-1)?.teks).toMatch(/Validator menolak[\s\S]*Kode mapel tidak dikenal: "PRX"/);
    expect(g.rencana?.status).toBe('menunggu');
    expect(g.teks).toBe('Sudah diperbaiki.');
    expect(g.galat).toEqual([]);
    expect(s.riwayat.length).toBe(2); // perbaikan tidak masuk memori sesi
  });

  it('bila perbaikan tetap gagal, galat ditampilkan dan tidak ada rencana', async () => {
    const p = proyekSekolah('tahun');
    const salah = json({ jawaban: 'x', instruksi: [{ op: 'ubahJp', sasaran: { mapel: ['PRX'] }, jp: 6 }] });
    const { p: pem } = pemanggilPalsu([salah, salah]);
    const g = await new SesiAi(pem).kirim('ubah', p, {});
    expect(g.rencana).toBeUndefined();
    expect(g.galat.join()).toMatch(/Kode mapel tidak dikenal/);
  });

  it('balasan bukan JSON ditampilkan apa adanya tanpa rencana; hal tidak didukung dan pertanyaan diteruskan', async () => {
    const p = proyekSekolah('tahun');
    const { p: pem } = pemanggilPalsu(['Maaf saya kurang paham', 'Maaf saya kurang paham', json({ jawaban: 'Belum bisa.', instruksi: [], tidakBisa: ['preferensi praktik pagi'], pertanyaan: 'Kelas mana?' })]);
    const s = new SesiAi(pem);
    const a = await s.kirim('hmm', p, {});
    expect(a.rencana).toBeUndefined();
    expect(a.teks).toContain('Maaf saya kurang paham');
    const b = await s.kirim('utamakan praktik pagi', p, {});
    expect(b.tidakBisa).toEqual(['preferensi praktik pagi']);
    expect(b.pertanyaan).toBe('Kelas mana?');
  });

  it('kegagalan rotasi menjadi giliran sistem dan tidak mengotori memori', async () => {
    const p = proyekSekolah('tahun');
    const { p: pem } = pemanggilPalsu([{ ok: false, alasan: 'tanpa_kunci', pesan: 'Belum ada kunci.' }]);
    const s = new SesiAi(pem);
    const g = await s.kirim('halo', p, {});
    expect(g.peran).toBe('sistem');
    expect(s.riwayat).toEqual([]);
  });

  it('keputusan admin dan perubahan manual ikut dikirim pada pesan berikutnya sebagai catatan sistem', async () => {
    const p = proyekSekolah('tahun');
    const { p: pem, diminta } = pemanggilPalsu([json({ jawaban: 'ok', instruksi: [PRE6] }), json({ jawaban: 'siap', instruksi: [] })]);
    const s = new SesiAi(pem);
    const g = await s.kirim('PRE jadi 6', p, {});
    // admin menerapkan usulan, lalu mengubah data sendiri
    const ter = terapkanInstruksi(p, {}, g.rencana!.balasan.instruksi);
    s.catatDiterapkan(g, ter);
    s.segarkanPotret(p, {});
    terapkanInstruksi(p, {}, [{ op: 'ubahJp', sasaran: { rombel: ['XII TE 1'], mapel: ['MTK'] }, jp: 4 }]);
    s.catatHasilSusun('239 dari 240 JP tertempatkan');
    await s.kirim('lanjut', p, {});
    const kedua = diminta[1]?.pesan.at(-1)?.teks ?? '';
    expect(kedua).toMatch(/Admin MENERAPKAN usulan Anda[\s\S]*PRE \(BEN\): 4 → 6 JP/);
    expect(kedua).toMatch(/Admin mengubah data di luar percakapan: Beban diubah: XII TE 1 MTK\(WOR\) 3 JP → XII TE 1 MTK\(WOR\) 4 JP/);
    expect(kedua).toContain('239 dari 240 JP tertempatkan');
    expect(kedua).not.toMatch(/PRE\(BEN\) 4 JP → XII TE 1 PRE\(BEN\) 6 JP/); // yang sudah diterapkan tidak dilaporkan dua kali
    expect(g.rencana?.status).toBe('diterapkan');
    expect(diminta[1]?.pesan.length).toBe(3); // user, model, user
  });

  it('menolak usulan dicatat; reset menghapus memori', async () => {
    const p = proyekSekolah('tahun');
    const { p: pem, diminta } = pemanggilPalsu([json({ jawaban: 'ok', instruksi: [PRE6] }), json({ jawaban: 'baik', instruksi: [] })]);
    const s = new SesiAi(pem);
    const g = await s.kirim('PRE 6', p, {});
    s.catatDitolak(g);
    await s.kirim('oke lupakan', p, {});
    expect(diminta[1]?.pesan.at(-1)?.teks).toContain('Admin MENOLAK usulan');
    s.reset();
    expect(s.riwayat).toEqual([]);
    expect(s.tampil).toEqual([]);
  });
});

describe('AI: brankas kunci ber-PIN', () => {
  const isi = { kunci: [{ id: '1', label: 'Akun A', nilai: 'AIzaSyEXAMPLEEXAMPLEEXAMPLE-0001', aktif: true }] };

  it('bolak-balik dengan PIN benar; isi tidak terbaca pada data tersimpan', async () => {
    const b = await kunciBrankas('1234', isi, 1000);
    expect(JSON.stringify(b)).not.toContain('AIzaSy');
    expect(await bukaBrankas('1234', b)).toEqual(isi);
  });

  it('PIN salah ditolak; data diubah ditolak; PIN terlalu pendek ditolak; garam dan IV selalu baru', async () => {
    const b = await kunciBrankas('1234', isi, 1000);
    await expect(bukaBrankas('4321', b)).rejects.toThrow(/PIN salah/);
    await expect(bukaBrankas('1234', { ...b, data: b.data.slice(0, -4) + 'AAAA' })).rejects.toThrow(/PIN salah/);
    await expect(kunciBrankas('12', isi, 1000)).rejects.toThrow(/minimal 4/);
    const c = await kunciBrankas('1234', isi, 1000);
    expect(c.garam).not.toBe(b.garam);
    expect(c.iv).not.toBe(b.iv);
  });

  it('penyamaran kunci hanya memperlihatkan ujungnya', () => {
    expect(samarkan('AIzaSyEXAMPLEEXAMPLEEXAMPLE-0001')).toBe('AIza…0001');
    expect(samarkan('pendek')).toBe('••••');
  });
});
