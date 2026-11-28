// Rekap satu pekan semua kelas (atau guru/ruang) dalam satu halaman landscape, ditambah halaman penjelasan kode.

import type { Proyek } from '../../model/tipe';
import { warnaMapel } from '../../ui/util';
import { barisKotak, warnaAlasan } from '../kotak';
import { matriksP, type HariP, type ItemP, type ModeP } from '../tampil';
import { PenulisPdf } from './penulis';
import { JUDUL_MODE, KERTAS, bungkus, kodeRekap, kopBawaan, rentangPekan, tulisDi, type UkuranKertas } from './umum';

/** Tinggi baris dan huruf kotak (poin): tiga baris kode per kotak, jadi huruf kecil seperti rekap cetak sebelumnya. */
const UKURAN: Record<UkuranKertas, { tinggi: number; huruf: number }> = { A4: { tinggi: 15.75, huruf: 4.5 }, F4: { tinggi: 16.5, huruf: 4.9 } };

export function rekapPdf(pen: PenulisPdf, p: Proyek, mode: ModeP, tanggal: string, ukuran: UkuranKertas, diperbarui?: string): void {
  const kertas = KERTAS[ukuran];
  const { tinggi: tBaris, huruf } = UKURAN[ukuran];
  const m = 22;
  const lebarIsi = kertas.lebar - 2 * m;
  const mt = matriksP(p, tanggal, mode);
  const ids = mt.baris;
  const kegiatan = [...new Set(mt.hari.map((h) => h.kegiatan?.nama).filter((x): x is string => !!x))];
  const tKop = 30;
  const tHead = 26;
  const tKaki = 12;
  const perHalaman = Math.max(1, Math.floor((kertas.tinggi - 2 * m - tKop - tHead - tKaki) / tBaris));
  const jumlah = Math.max(1, Math.ceil(ids.length / perHalaman));
  const rata = Math.ceil(ids.length / jumlah);

  const wLabel = mode === 'rombel' ? 42 : 34;
  const bobot = (h: HariP) => (h.status === 'normal' ? h.kolom.reduce((a, c) => a + (c.tipe === 'istirahat' ? 0.3 : 1), 0) : 1.5);
  const unit = (lebarIsi - wLabel) / mt.hari.reduce((a, h) => a + bobot(h), 0);
  const hx: number[] = [];
  let x = m + wLabel;
  for (const h of mt.hari) {
    hx.push(x);
    x += bobot(h) * unit;
  }
  const xAkhir = x;

  for (let hal = 0; hal < jumlah; hal++) {
    if (hal > 0) pen.halamanBaru();
    const bagian = ids.slice(hal * rata, (hal + 1) * rata);
    kopBawaan(pen, m, m, lebarIsi, `Rekap semua ${JUDUL_MODE[mode].toLowerCase()}`, rentangPekan(p, tanggal), kegiatan, 0.85);
    const y0 = m + tKop;
    // kepala
    pen.persegi(m, y0, wLabel, tHead, { isi: '#f1f5f9', garis: '#e2e8f0', tebal: 0.4 });
    tulisDi(pen, JUDUL_MODE[mode], { x: m, y: y0, w: wLabel, h: tHead }, 'tengah', 6.5, { tebal: true, warna: '#64748b' });
    mt.hari.forEach((h, hi) => {
      const xx = hx[hi] as number;
      const w = bobot(h) * unit;
      pen.persegi(xx, y0, w, 12, { isi: h.warna ?? '#64748b', garis: '#ffffff', tebal: 0.4 });
      tulisDi(pen, `${h.hari} ${Number(h.tanggal.slice(8))}`, { x: xx, y: y0, w, h: 12 }, 'tengah', 7, { tebal: true, warna: '#ffffff' });
      if (h.status !== 'normal') {
        pen.persegi(xx, y0 + 12, w, tHead - 12, { isi: '#f1f5f9', garis: '#e2e8f0', tebal: 0.4 });
        tulisDi(pen, h.status === 'libur' ? 'libur' : '–', { x: xx, y: y0 + 12, w, h: tHead - 12 }, 'tengah', 5.5, { warna: '#64748b' });
        return;
      }
      let cx = xx;
      for (const c of h.kolom) {
        const cw = (c.tipe === 'istirahat' ? 0.3 : 1) * unit;
        pen.persegi(cx, y0 + 12, cw, tHead - 12, { isi: c.tipe === 'istirahat' ? '#ecfdf5' : '#f1f5f9', garis: '#e2e8f0', tebal: 0.4 });
        if (c.tipe !== 'istirahat') tulisDi(pen, c.label, { x: cx, y: y0 + 12, w: cw, h: tHead - 12 }, 'tengah', 6, { tebal: true, warna: '#64748b', pad: 0.5 });
        cx += cw;
      }
    });

    // isi
    let grupLalu = '';
    bagian.forEach((b, bi) => {
      const y = y0 + tHead + bi * tBaris;
      if (b.grup && grupLalu && b.grup !== grupLalu) pen.garis(m, y, xAkhir, y, { warna: '#94a3b8', tebal: 1 });
      grupLalu = b.grup || grupLalu;
      pen.persegi(m, y, wLabel, tBaris, { isi: '#f8fafc', garis: '#e2e8f0', tebal: 0.4 });
      tulisDi(pen, b.label, { x: m, y, w: wLabel, h: tBaris }, 'kiriAtas', 6.5, { tebal: true, warna: '#334155', pad: 2, min: 4 });
      b.hari.forEach((h, hi) => {
        const xx = hx[hi] as number;
        const w = bobot(mt.hari[hi] as HariP) * unit;
        if (h.status === 'tidakAktif' && h.alasan) {
          const wa = warnaAlasan(h.alasan.kode);
          pen.persegi(xx, y, w, tBaris, { isi: wa.bg, garis: '#ffffff', tebal: 0.4 });
          tulisDi(pen, h.alasan.kode, { x: xx, y, w, h: tBaris }, 'tengah', 6.5, { tebal: true, warna: wa.fg });
          return;
        }
        if (h.status !== 'normal') {
          pen.persegi(xx, y, w, tBaris, { isi: '#f1f5f9', garis: '#e2e8f0', tebal: 0.4 });
          return;
        }
        // posisi tiap kolom skema hari itu
        const kolom: { c: (typeof h.kolom)[number]; x: number; w: number }[] = [];
        let cx = xx;
        for (const c of h.kolom) {
          const cw = (c.tipe === 'istirahat' ? 0.3 : 1) * unit;
          kolom.push({ c, x: cx, w: cw });
          pen.persegi(cx, y, cw, tBaris, { isi: c.tipe === 'istirahat' ? '#ecfdf5' : '#ffffff', garis: '#e2e8f0', tebal: 0.4 });
          cx += cw;
        }
        for (const e of h.elemen) {
          if (e.jenis === 'nonKbm') {
            const kk = kolom.find((q) => q.c.tipe === 'nonKbm');
            if (!kk) continue;
            pen.persegi(kk.x, y, kk.w, tBaris, { isi: '#e2e8f0', garis: '#ffffff', tebal: 0.4 });
            tulisDi(pen, e.kode, { x: kk.x, y, w: kk.w, h: tBaris }, 'tengah', huruf, { warna: '#475569', min: 3 });
          } else if (e.jenis === 'blok') {
            // lebar kotak = kolom dari jam a hingga jam b (istirahat di antaranya ikut)
            const dari = kolom.findIndex((q) => q.c.tipe === 'kbm' && q.c.nomor === e.a);
            const sampai = kolom.findIndex((q) => q.c.tipe === 'kbm' && q.c.nomor === e.b);
            if (dari < 0 || sampai < dari) continue;
            const px = (kolom[dari] as { x: number }).x;
            const lebar = kolom.slice(dari, sampai + 1).reduce((a, q) => a + q.w, 0);
            const it = e.item[0] as ItemP;
            const wm = warnaMapel(it.mapel.kode);
            pen.persegi(px, y, lebar, tBaris, { isi: wm.bg, garis: '#ffffff', tebal: 0.4 });
            pen.persegi(px, y, 1, tBaris, { isi: wm.garis });
            const baris = barisKotak(mode, it, e.item.length > 1).filter((t) => t !== '');
            const lh = huruf * 1.02;
            const total = baris.length * lh;
            baris.forEach((t, i) => tulisDi(pen, t, { x: px + 1, y: y + (tBaris - total) / 2 + i * lh, w: lebar - 1, h: lh }, 'tengah', huruf, { tebal: i === 0, warna: '#0f172a', pad: 0.5, min: 2.6 }));
          }
        }
      });
    });
    pen.teks(`${jumlah > 1 ? `Halaman ${hal + 1} dari ${jumlah} · ` : ''}penjelasan kode ada di halaman berikutnya`, m, kertas.tinggi - m + 6, { ukuran: 6.5, warna: '#64748b' });
    if (diperbarui) pen.teks(`Jadwal diperbarui ${diperbarui} WIB`, kertas.lebar - m, kertas.tinggi - m + 6, { ukuran: 6.5, rata: 'kanan', warna: '#64748b' });
  }

  // penjelasan kode
  pen.halamanBaru();
  halamanKodePdf(pen, p, mode, tanggal, diperbarui);
}

/** Halaman penjelasan kode: cara membaca kotak, alasan kelas tidak belajar, mapel, guru, ruang (empat lajur, bisa sambung ke halaman berikut). */
export function halamanKodePdf(pen: PenulisPdf, p: Proyek, mode: ModeP, tanggal: string, diperbarui?: string): void {
  const m = 22;
  const lebarIsi = pen.lebar - 2 * m;
  const kode = kodeRekap(p, tanggal);
  const cara: Record<ModeP, string> = { rombel: 'kode mapel, kode guru, kode ruang', guru: 'kelas, kode mapel, kode ruang', ruang: 'kelas, kode mapel, kode guru' };
  const kop = kopBawaan(pen, m, m, lebarIsi, 'Penjelasan kode', rentangPekan(p, tanggal), [], 0.85);
  const penjelasan = `Isi tiap kotak jadwal dari atas: ${cara[mode]}. Tanda + pada kode mapel = ada kelompok paralel (mis. pendidikan agama). Jam berurutan dengan guru dan mapel yang sama digabung; kolom sempit hijau = istirahat.`;
  const baris = bungkus(penjelasan, lebarIsi, 8);
  baris.forEach((t, i) => pen.teks(t, m, m + kop + 12 + i * 10, { ukuran: 8, warna: '#334155' }));
  const yMulai = m + kop + 12 + baris.length * 10 + 6;
  const bagian: [string, [string, string][]][] = [
    ['Kelas tidak belajar di sekolah', kode.alasan],
    ['Mapel dan kegiatan', kode.mapel],
    ['Ruang', kode.ruang.map(([k, n]) => [k, n || k] as [string, string])],
    ['Guru', kode.guru],
  ];
  const nLajur = 4;
  const celah = 14;
  const wLajur = (lebarIsi - celah * (nLajur - 1)) / nLajur;
  const ukuran = 6.4;
  const lh = ukuran * 1.35;
  const yAkhir = pen.tinggi - m - 8;
  const wKode = 28;
  // susun semua entri menjadi daftar baris yang mengalir antar lajur dan halaman
  type Entri = { jenis: 'judul'; teks: string } | { jenis: 'item'; kode: string; teks: string };
  const aliran: Entri[] = [];
  for (const [judul, daftar] of bagian) {
    if (!daftar.length) continue;
    aliran.push({ jenis: 'judul', teks: judul.toUpperCase() });
    for (const [k, n] of daftar) aliran.push({ jenis: 'item', kode: k, teks: n });
  }
  let lajur = 0;
  let y = yMulai;
  const mulaiLajur = (): number => m + lajur * (wLajur + celah);
  aliran.forEach((e, i) => {
    const tinggiEntri = e.jenis === 'judul' ? lh + 3 : bungkus(e.teks, wLajur - wKode, ukuran).length * lh || lh;
    // judul tidak boleh terpisah dari entri pertamanya
    const butuh = e.jenis === 'judul' ? tinggiEntri + lh : tinggiEntri;
    if (y + butuh > yAkhir) {
      lajur++;
      y = yMulai;
      if (lajur >= nLajur) {
        pen.halamanBaru();
        kopBawaan(pen, m, m, lebarIsi, 'Penjelasan kode (lanjutan)', rentangPekan(p, tanggal), [], 0.85);
        lajur = 0;
      }
    }
    const x = mulaiLajur();
    if (e.jenis === 'judul') {
      if (i > 0) y += 3;
      pen.teks(e.teks, x, y + ukuran, { ukuran: ukuran * 0.95, tebal: true, warna: '#475569' });
      pen.garis(x, y + ukuran + 2, x + wLajur, y + ukuran + 2, { warna: '#cbd5e1', tebal: 0.4 });
      y += tinggiEntri;
    } else {
      pen.teks(e.kode, x, y + ukuran, { ukuran, tebal: true });
      const b = bungkus(e.teks, wLajur - wKode, ukuran);
      b.forEach((t, j) => pen.teks(t, x + wKode, y + ukuran + j * lh, { ukuran }));
      y += tinggiEntri;
    }
  });
  if (diperbarui) pen.teks(`Jadwal diperbarui ${diperbarui} WIB`, pen.lebar - m, pen.tinggi - m + 6, { ukuran: 6.5, rata: 'kanan', warna: '#64748b' });
}
