import { describe, expect, it } from 'vitest';
import { proyekSekolah } from '../src/model/sekolahData';
import { daftarSemester } from '../src/model/simpul';
import { rencanakan, terapkanInstruksi, uraiBalasan, uraiInstruksi, type Instruksi } from '../src/ai/instruksi';
import { geserTanggal, labelTanggal, selisihHari } from '../src/ai/kalenderAi';
import { ambilPotret, bandingkanPotret, INSTRUKSI_SISTEM, ringkasData } from '../src/ai/prompt';
import { SesiAi, type PemanggilAi } from '../src/ai/sesi';
import type { PermintaanAi } from '../src/ai/klien';

const baru = () => proyekSekolah('tahun');
const kegiatan = (p: ReturnType<typeof baru>, id: string) => p.kalender.find((k) => k.id === id);

describe('AI kalender: penguraian', () => {
  it('bentuk sah diurai; tanggal, jenis, dan bidang yang salah dilaporkan', () => {
    const u = uraiInstruksi([
      { op: 'tambahKegiatan', nama: 'Rapat Dinas', jenis: 'lain', mulai: '2026-12-05', agenda: true },
      { op: 'geserKegiatan', kegiatan: 'k-ukk', hari: 7 },
      { op: 'hapusKegiatan', kegiatan: 'a05' },
    ]);
    expect(u.galat).toEqual([]);
    expect(u.instruksi.map((i) => i.op)).toEqual(['tambahKegiatan', 'geserKegiatan', 'hapusKegiatan']);

    const s = uraiInstruksi([
      { op: 'tambahKegiatan', nama: 'X', jenis: 'lain', mulai: '2026-02-30' },
      { op: 'tambahKegiatan', nama: 'X', jenis: 'pesta', mulai: '2026-12-05' },
      { op: 'tambahKegiatan', nama: 'X', jenis: 'lain', mulai: '2026-12-05', paksa: true },
      { op: 'geserKegiatan', kegiatan: 'k-ukk' },
      { op: 'geserKegiatan', kegiatan: 'k-ukk', hari: 7, mulai: '2026-12-05' },
      { op: 'geserKegiatan', kegiatan: 'k-ukk', hari: 7, selesai: '2026-12-05' },
      { op: 'geserKegiatan', kegiatan: 'k-ukk', hari: 0 },
      { op: 'ubahKegiatan', kegiatan: 'k-ukk' },
    ]);
    expect(s.instruksi).toEqual([]);
    const teks = s.galat.join('\n');
    expect(teks).toMatch(/mulai bukan tanggal yang sah/);
    expect(teks).toMatch(/jenis tidak dikenal "pesta"/);
    expect(teks).toMatch(/bidang tidak dikenal "paksa"/);
    expect(teks).toMatch(/tepat satu dari hari/);
    expect(teks).toMatch(/selesai hanya boleh bersama mulai/);
    expect(teks).toMatch(/hari harus bilangan bulat bukan nol/);
    expect(teks).toMatch(/tidak ada yang diubah/);
  });

  it('pembantu tanggal: nama hari, geser, selisih (melewati pergantian bulan dan tahun)', () => {
    expect(labelTanggal('2026-11-30')).toBe('Sen 2026-11-30');
    expect(geserTanggal('2026-11-27', 7)).toBe('2026-12-04');
    expect(geserTanggal('2026-12-28', 7)).toBe('2027-01-04');
    expect(geserTanggal('2026-03-01', -1)).toBe('2026-02-28');
    expect(selisihHari('2026-11-23', '2026-11-30')).toBe(7);
    expect(selisihHari('2026-11-30', '2026-11-23')).toBe(-7);
  });
});

describe('AI kalender: tambah', () => {
  it('agenda satu hari: tercatat di kalender tanpa mengubah jadwal (tanpa versi, tanpa kelas tidak aktif)', () => {
    const p = baru();
    const jumlahVersi = p.versi.length;
    const jumlah = p.kalender.length;
    const r = rencanakan(p, {}, [{ op: 'tambahKegiatan', nama: 'Rapat Dinas', jenis: 'lain', mulai: '2026-12-05', agenda: true, untuk: 'guru' }]);
    expect(r.ok).toBe(true);
    expect(p.kalender.length).toBe(jumlah); // pratinjau tidak mengubah data asli
    const g = r.proyek?.kalender.at(-1);
    expect(g).toMatchObject({ nama: 'Rapat Dinas', jenis: 'lain', mulai: '2026-12-05', selesai: '2026-12-05', agenda: true, untuk: 'guru', rombelTidakAktif: [] });
    expect(g?.versiId).toBeUndefined();
    expect(r.proyek?.versi.length).toBe(jumlahVersi);
    expect(r.perubahan[0]?.teks).toMatch(/Kegiatan baru: “Rapat Dinas” Sab 2026-12-05 · lain · agenda/);
  });

  it('kegiatan (ASTS): punya versi jadwal kosong sendiri, kelas ikut induk, kelas tak aktif semester dipertahankan, tingkat XII ditambahkan', () => {
    const p = baru();
    const dasar = new Set(daftarSemester(p)[0]?.rombelTidakAktif ?? []);
    const r = terapkanInstruksi(p, {}, [{ op: 'tambahKegiatan', nama: 'ASTS', jenis: 'ujian', mulai: '2026-12-07', selesai: '2026-12-11', hari: ['Senin', 'Selasa', 'Rabu'], tidakAktif: { tingkat: ['XII'] } }]);
    expect(r.ok).toBe(true);
    const g = p.kalender.at(-1);
    expect(g?.nama).toBe('ASTS');
    expect(g?.agenda).toBeUndefined();
    expect(g?.rombelTerdampak).toEqual([]);
    expect(g?.hariBerlaku).toEqual([0, 1, 2]);
    const v = p.versi.find((x) => x.id === g?.versiId);
    expect(v).toMatchObject({ nama: 'ASTS', jenis: 'varian', slots: [] });
    const xii = p.master.rombel.filter((x) => x.tingkat === 'XII').map((x) => x.id);
    for (const id of xii) expect(g?.rombelTidakAktif).toContain(id);
    for (const id of dasar) expect(g?.rombelTidakAktif).toContain(id);
    expect(r.perubahan[0]?.teks).toMatch(/hari Senin\/Selasa\/Rabu/);
  });

  it('galat: duplikat, selesai sebelum mulai, hari/kelas tidak dikenal, hari pada agenda; semua-atau-tidak-sama-sekali', () => {
    const p = baru();
    const awal = JSON.stringify(p);
    const dup = terapkanInstruksi(p, {}, [{ op: 'tambahKegiatan', nama: 'UKK Kelas XII', jenis: 'UKK', mulai: '2026-11-23', selesai: '2026-11-27' }]);
    expect(dup.ok).toBe(false);
    expect(dup.galat.join()).toMatch(/sudah ada/);
    const campur = terapkanInstruksi(p, {}, [
      { op: 'tambahKegiatan', nama: 'Baik', jenis: 'lain', mulai: '2026-12-05', agenda: true },
      { op: 'tambahKegiatan', nama: 'Salah', jenis: 'ujian', mulai: '2026-12-10', selesai: '2026-12-08', hari: ['Hari Aneh'], tidakAktif: { rombel: ['ZZ 9'] } },
      { op: 'tambahKegiatan', nama: 'Agenda berhari', jenis: 'lain', mulai: '2026-12-12', agenda: true, hari: ['Senin'] },
    ]);
    expect(campur.ok).toBe(false);
    const teks = campur.galat.join('\n');
    expect(teks).toMatch(/lebih awal dari mulai/);
    expect(teks).toMatch(/hari tidak dikenal/);
    expect(teks).toMatch(/kode kelas tidak dikenal "ZZ 9"/);
    expect(teks).toMatch(/tidak berlaku untuk agenda atau libur/);
    expect(JSON.stringify(p)).toBe(awal);
  });

  it('di luar semester mana pun: peringatan', () => {
    const p = baru();
    const r = rencanakan(p, {}, [{ op: 'tambahKegiatan', nama: 'Acara Lama', jenis: 'lain', mulai: '2025-01-10', agenda: true }]);
    expect(r.ok).toBe(true);
    expect(r.peringatan.join()).toMatch(/di luar semester mana pun/);
  });
});

describe('AI kalender: geser, ubah, hapus', () => {
  it('geser 7 hari: tanggal, tugas mengawas, dan jadwal khusus ikut; kegiatan dicari lewat id atau nama', () => {
    const p = baru();
    const asas = kegiatan(p, 'k-asas');
    const tugas = asas?.pengawas?.length ?? 0;
    expect(tugas).toBeGreaterThan(0);
    const tanggalLama = asas?.pengawas?.map((x) => x.tanggal) ?? [];
    const slot = p.versi.find((v) => v.id === asas?.versiId)?.slots.length ?? 0;
    const r = terapkanInstruksi(p, {}, [{ op: 'geserKegiatan', kegiatan: 'k-asas', hari: 7 }]);
    expect(r.ok).toBe(true);
    expect(asas?.mulai).toBe('2026-12-07');
    expect(asas?.selesai).toBe('2026-12-11');
    expect(asas?.pengawas?.map((x) => x.tanggal)).toEqual(tanggalLama.map((t) => geserTanggal(t, 7)));
    expect(p.versi.find((v) => v.id === asas?.versiId)?.slots.length).toBe(slot);
    expect(r.perubahan[0]?.teks).toMatch(/Sen 2026-11-30 – Jum 2026-12-04.* → Sen 2026-12-07 – Jum 2026-12-11 \(\+7 hari; \d+ tugas mengawas ikut digeser; jadwal khusus kegiatan/);

    const q = baru();
    const lewatNama = terapkanInstruksi(q, {}, [{ op: 'geserKegiatan', kegiatan: 'ukk kelas xii', hari: -7 }]);
    expect(lewatNama.ok).toBe(true);
    expect(kegiatan(q, 'k-ukk')?.mulai).toBe('2026-11-16');
  });

  it('geser ke tanggal mulai baru dengan rentang baru; bukan kelipatan 7 memberi peringatan; tanggal yang sama tidak mengubah apa pun', () => {
    const p = baru();
    const r = terapkanInstruksi(p, {}, [{ op: 'geserKegiatan', kegiatan: 'k-ukk', mulai: '2026-12-02', selesai: '2026-12-09' }]);
    expect(r.ok).toBe(true);
    expect(kegiatan(p, 'k-ukk')).toMatchObject({ mulai: '2026-12-02', selesai: '2026-12-09' });
    expect(r.peringatan.join()).toMatch(/bukan kelipatan 7/);
    const sama = rencanakan(baru(), {}, [{ op: 'geserKegiatan', kegiatan: 'k-ukk', mulai: '2026-11-23' }]);
    expect(sama.ok).toBe(true);
    expect(sama.perubahan).toEqual([]);
    expect(sama.peringatan.join()).toMatch(/tidak ada yang berubah/);
  });

  it('kegiatan tidak ditemukan atau ambigu dilaporkan dengan id kandidat, bukan ditebak', () => {
    const p = baru();
    const a = rencanakan(p, {}, [{ op: 'geserKegiatan', kegiatan: 'Tidak Ada', hari: 7 }]);
    expect(a.ok).toBe(false);
    expect(a.galat.join()).toMatch(/tidak ditemukan/);
    const b = rencanakan(p, {}, [{ op: 'geserKegiatan', kegiatan: 'PKL', hari: 7 }]);
    expect(b.ok).toBe(false);
    expect(b.galat.join()).toMatch(/ambigu.*k-pkl-xii-gasal.*k-pkl-xii-genap/);
    const c = rencanakan(p, {}, [{ op: 'geserKegiatan', kegiatan: 'TKA', hari: 7 }]);
    expect(c.ok).toBe(false);
    expect(c.galat.join()).toMatch(/ambigu/);
    // nama persis menang atas kecocokan sebagian
    expect(rencanakan(p, {}, [{ op: 'geserKegiatan', kegiatan: 'PKL kelas XII', hari: 7 }]).ok).toBe(true);
  });

  it('ubah: nama (ikut ke versi), jenis, tanggal, kelas tidak aktif diganti; tugas mengawas di luar rentang baru diperingatkan', () => {
    const p = baru();
    const r = terapkanInstruksi(p, {}, [
      { op: 'ubahKegiatan', kegiatan: 'k-asas', nama: 'ASTS Kelas X', mulai: '2026-12-01', selesai: '2026-12-03', tidakAktif: { tingkat: ['XII'] } },
    ]);
    expect(r.ok).toBe(true);
    const g = kegiatan(p, 'k-asas');
    expect(g).toMatchObject({ nama: 'ASTS Kelas X', mulai: '2026-12-01', selesai: '2026-12-03' });
    expect(p.versi.find((v) => v.id === g?.versiId)?.nama).toBe('ASTS Kelas X');
    expect(g?.rombelTidakAktif.sort()).toEqual(p.master.rombel.filter((x) => x.tingkat === 'XII').map((x) => x.id).sort());
    expect(r.peringatan.join()).toMatch(/tugas mengawas jatuh di luar rentang baru/);
    expect(r.perubahan[0]?.teks).toMatch(/nama “ASAS Kelas X dan ASAJ Kelas XII” → “ASTS Kelas X”.*tanggal .* → .*kelas tidak aktif/);
  });

  it('ubah: libur tidak boleh jadi kegiatan dan sebaliknya; hari tidak berlaku untuk agenda', () => {
    const p = baru();
    const a = rencanakan(p, {}, [{ op: 'ubahKegiatan', kegiatan: 'k-ukk', jenis: 'libur' }]);
    expect(a.ok).toBe(false);
    expect(a.galat.join()).toMatch(/mengubah kelas aktif/);
    const b = rencanakan(p, {}, [{ op: 'ubahKegiatan', kegiatan: 'a05', hari: ['Senin'] }]);
    expect(b.ok).toBe(false);
    expect(b.galat.join()).toMatch(/tidak berlaku untuk agenda/);
  });

  it('hapus: kegiatan hilang, periode aktif dibersihkan, peringatan bila jadwal khusus atau tugas mengawas ikut terbuang', () => {
    const p = baru();
    p.periodeAktifId = 'k-asas';
    const r = terapkanInstruksi(p, {}, [{ op: 'hapusKegiatan', kegiatan: 'k-asas' }, { op: 'hapusKegiatan', kegiatan: 'a05' }]);
    expect(r.ok).toBe(true);
    expect(kegiatan(p, 'k-asas')).toBeUndefined();
    expect(kegiatan(p, 'a05')).toBeUndefined();
    expect(p.periodeAktifId).toBeUndefined();
    expect(r.peringatan.join('\n')).toMatch(/tugas mengawas ikut terhapus/);
    expect(r.perubahan.map((x) => x.teks).join('\n')).toMatch(/Kegiatan dihapus: “Maulid Nabi Muhammad SAW” Sel 2026-08-25 · agenda/);
  });

  it('operasi kalender berlaku di konteks kegiatan maupun induk', () => {
    const p = baru();
    const r = rencanakan(p, { kegiatanId: 'k-asas' }, [{ op: 'tambahKegiatan', nama: 'Rapat', jenis: 'lain', mulai: '2026-12-05', agenda: true }]);
    expect(r.ok).toBe(true);
  });
});

describe('AI kalender: data untuk AI dan alur sesi', () => {
  it('prompt memuat operasi baru, aturan menjawab dari data, dan ringkasan kalender berhari (tanpa catatan baku)', () => {
    for (const op of ['tambahKegiatan', 'ubahKegiatan', 'geserKegiatan', 'hapusKegiatan']) expect(INSTRUKSI_SISTEM).toContain(`"op":"${op}"`);
    expect(INSTRUKSI_SISTEM).toMatch(/Pertanyaan tentang data/);
    const teks = ringkasData(baru(), {}, '2026-11-28');
    expect(teks).toContain('Hari ini: Sab 2026-11-28.');
    expect(teks).toContain('SEMESTER: gasal "Gasal 2026/2027" 2026-07-13 s/d 2026-12-18');
    expect(teks).toMatch(/k-ukk \| Sen 2026-11-23 – Jum 2026-11-27 \| kegiatan:UKK \| UKK Kelas XII/);
    expect(teks).toMatch(/a05 \| Sel 2026-08-25 \| agenda:libur \| Maulid Nabi Muhammad SAW \| untuk=semua/);
    expect(teks).not.toContain('Kalender akademik 2026/2027 (Gasal).');
    expect(teks).toMatch(/k-asas .*pengawas=\d+/);
  });

  it('perubahan kalender oleh admin terdeteksi dari potret', () => {
    const p = baru();
    const a = ambilPotret(p, {});
    const q = structuredClone(p);
    terapkanInstruksi(q, {}, [{ op: 'geserKegiatan', kegiatan: 'k-ukk', hari: 7 }]);
    const beda = bandingkanPotret(a, ambilPotret(q, {}));
    expect(beda.length).toBe(1);
    expect(beda[0]).toMatch(/^Kalender diubah: .*UKK Kelas XII.*23.* → .*30/);
  });

  function pemanggil(balasan: string[]) {
    const diminta: PermintaanAi[] = [];
    const pm: PemanggilAi = {
      async panggil(req) {
        diminta.push(structuredClone(req));
        const b = balasan.shift();
        if (b === undefined) throw new Error('balasan habis');
        return { ok: true, teks: b, model: 'm', kunciLabel: 'k1', token: { masuk: 1, keluar: 1 }, percobaan: 1 };
      },
    };
    return { pm, diminta };
  }

  it('"UKK diundur 1 minggu": AI mengusulkan geser, admin menerapkan, hasil sesuai; tanggal hari ini ikut dikirim', async () => {
    const p = baru();
    const { pm, diminta } = pemanggil([JSON.stringify({ jawaban: 'UKK Kelas XII digeser satu pekan.', instruksi: [{ op: 'geserKegiatan', kegiatan: 'k-ukk', hari: 7 }] })]);
    const sesi = new SesiAi(pm, () => '2026-11-28');
    const g = await sesi.kirim('UKK diundur 1 minggu', p, {});
    expect(diminta[0]?.pesan.at(-1)?.teks).toContain('Hari ini: Sab 2026-11-28.');
    expect(g.rencana?.status).toBe('menunggu');
    expect(g.rencana?.hasil.perubahan[0]?.teks).toMatch(/Sen 2026-11-23 – Jum 2026-11-27 → Sen 2026-11-30 – Jum 2026-12-04 \(\+7 hari/);
    expect(kegiatan(p, 'k-ukk')?.mulai).toBe('2026-11-23'); // belum diterapkan
    const ins = g.rencana?.balasan.instruksi as Instruksi[];
    terapkanInstruksi(p, {}, ins);
    expect(kegiatan(p, 'k-ukk')).toMatchObject({ mulai: '2026-11-30', selesai: '2026-12-04' });
  });

  it('pertanyaan tentang data dijawab tanpa instruksi dan tanpa rencana; kegiatan yang salah disebut diperbaiki AI satu kali', async () => {
    const p = baru();
    const { pm } = pemanggil([
      JSON.stringify({ jawaban: 'UKK Kelas XII berlangsung Sen 2026-11-23 sampai Jum 2026-11-27.', instruksi: [] }),
      JSON.stringify({ jawaban: 'ok', instruksi: [{ op: 'geserKegiatan', kegiatan: 'UKK XI', hari: 7 }] }),
      JSON.stringify({ jawaban: 'maaf, id yang benar', instruksi: [{ op: 'geserKegiatan', kegiatan: 'k-ukk', hari: 7 }] }),
    ]);
    const sesi = new SesiAi(pm, () => '2026-11-28');
    const t = await sesi.kirim('Kapan UKK?', p, {});
    expect(t.rencana).toBeUndefined();
    expect(t.teks).toContain('23');
    const g = await sesi.kirim('Undur UKK satu pekan', p, {});
    expect(g.rencana?.hasil.ok).toBe(true);
    expect(g.galat).toEqual([]);
  });

  it('balasan JSON memuat operasi kalender tanpa galat penguraian', () => {
    const b = uraiBalasan(JSON.stringify({ jawaban: 'ok', instruksi: [{ op: 'tambahKegiatan', nama: 'ASTS', jenis: 'ujian', mulai: '2026-12-07', selesai: '2026-12-11' }] }));
    expect(b.galat).toEqual([]);
    expect(b.instruksi[0]).toMatchObject({ op: 'tambahKegiatan', nama: 'ASTS', selesai: '2026-12-11' });
  });
});
