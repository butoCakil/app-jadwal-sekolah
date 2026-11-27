import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { proyekSekolah } from '../src/model/sekolahData';
import { susun } from '../src/mesin/solver';
import { adalahPelanggaran, periksa } from '../src/mesin/validator';
import { hitungTurunan } from '../src/ui/turunan';
import { modelWarisan, terdampak, versiSemester } from '../src/model/simpul';
import { polaUntukTanggal } from '../src/model/kalender';
import { kalenderFokus } from '../src/model/simpul';

/**
 * Uji tolok ukur: tiap kegiatan nyata (jadwal aSc sebagai kunci jawaban) disusun ulang dari nol oleh solver untuk kelas
 * yang terdampak, dengan aturan kegiatan (ruang terkunci, pengawas, PJJ). Kelas yang ikut induk dipertahankan.
 * Berjalan hanya dengan BENCH=1 (memakan waktu); laporan ditulis ke /tmp/bench.json.
 */
describe.skipIf(!process.env.BENCH)('tolok ukur solver pada kegiatan nyata (Tahun 2026)', () => {
  const p = proyekSekolah('tahun');
  const kegiatan = p.kalender.filter((g) => !g.agenda && g.versiId && modelWarisan(g));
  const laporan: Record<string, unknown>[] = [];

  for (const g of kegiatan) {
    it(g.nama, () => {
      const t = hitungTurunan(p, g.mulai, g.id);
      const idRombel = (id: string) => p.master.rombel.find((r) => r.id === id)?.kode ?? id;
      const dampak = new Set(p.master.rombel.filter((r) => terdampak(g, r.id) && !t.rombelTidakAktif.has(r.id)).map((r) => r.id));
      const rombelBeban = new Map(t.beban.map((b) => [b.id, b.rombelId]));
      const aktifBeban = t.beban.filter((b) => !t.rombelTidakAktif.has(b.rombelId));
      const kloning = structuredClone(p);
      kloning.beban = structuredClone(aktifBeban);
      for (const v of kloning.versi) v.slots = [];
      const tetap = t.slots.filter((s) => !dampak.has(rombelBeban.get(s.bebanId) ?? ''));
      const pola = polaUntukTanggal(g.mulai, { ...p, kalender: kalenderFokus(p, g.id) }).pola;
      const nyata = t.slots.filter((s) => dampak.has(rombelBeban.get(s.bebanId) ?? '')).length;
      const kebutuhan = aktifBeban.filter((b) => dampak.has(b.rombelId) && !b.nonTatapMuka).reduce((a, b) => a + b.jp, 0);
      // mode 'awal': mulai dari jadwal induk (beban kegiatan yang menggantikan beban induk memakai slot induknya)
      const peta = new Map(aktifBeban.map((b) => [b.asal ?? b.id, b.id]));
      const induk = versiSemester(p, t.semester)?.slots ?? [];
      const awal = process.env.BENCH_MODE === 'awal'
        ? induk.flatMap((sl) => { const id = peta.get(sl.bebanId); return id && dampak.has(rombelBeban.get(id) ?? '') ? [{ ...sl, bebanId: id }] : []; })
        : undefined;
      const t0 = Date.now();
      const h = susun(kloning, { skemaPerHari: pola, tetap, aturan: t.aturan, awal, kedalaman: Number(process.env.BENCH_DEPTH ?? 1), prioritasLunak: process.env.BENCH_LUNAK === '1', batasMs: Number(process.env.BENCH_MS ?? 8000), benih: Number(process.env.BENCH_SEED ?? 20260126) });
      const ms = Date.now() - t0;
      const hasilDampak = h.slots.filter((s) => dampak.has(rombelBeban.get(s.bebanId) ?? '')).length;
      const pelanggaran = periksa(kloning, h.slots, { skemaPerHari: pola, rombelTidakAktif: t.rombelTidakAktif, aturan: t.aturan }).filter(adalahPelanggaran);
      // hanya sisa pada kelas terdampak: kelas yang ikut induk dibawa apa adanya (sisa induknya bukan urusan kegiatan ini)
      const sisaDampak = h.sisa.filter((x) => dampak.has(rombelBeban.get(x.bebanId) ?? ''));
      const sisaJp = sisaDampak.reduce((a, x) => a + x.jpSisa, 0);
      const alasan = new Map<string, number>();
      for (const x of sisaDampak) {
        const kunci = x.alasan.replace(/\d+/g, 'N').slice(0, 140);
        alasan.set(kunci, (alasan.get(kunci) ?? 0) + x.jpSisa);
      }
      laporan.push({
        kegiatan: g.nama, kelasTerdampak: dampak.size, kebutuhanJp: kebutuhan, jpNyata: nyata, jpDisusun: hasilDampak, sisaJp,
        pelanggaranNyata: t.jumlahPelanggaran, geser: awal ? awal.filter((a) => !h.slots.some((x) => x.bebanId === a.bebanId && x.hari === a.hari && x.jam === a.jam)).length : null, awalJp: awal?.length ?? null, pelanggaranSolver: pelanggaran.length, ms,
        daftarSisa: sisaDampak.slice(0, 6).map((x) => ({ beban: aktifBeban.find((b) => b.id === x.bebanId) && `${idRombel(aktifBeban.find((b) => b.id === x.bebanId)!.rombelId)}`, jp: x.jpSisa, alasan: x.alasan })),
        ringkasAlasan: [...alasan].sort((a, b) => b[1] - a[1]).slice(0, 4),
      });
      writeFileSync('/tmp/bench.json', JSON.stringify(laporan, null, 1));
      expect(pelanggaran).toEqual([]); // solver tidak pernah melanggar aturan wajib
    }, 60000);
  }
});
