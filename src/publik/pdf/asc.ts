// Halaman jadwal satu kelas/guru/ruang bergaya "aSc timetable": hari ke bawah, nomor pelajaran ke samping, kotak bergaris hitam.

import type { Proyek } from '../../model/tipe';
import { susunLembar } from '../lembar';
import { daftarEntitasP, type ItemP, type ModeP } from '../tampil';
import { warnaAlasan } from '../kotak';
import { PenulisPdf } from './penulis';
import { JUDUL_MODE, bungkus, gambarLegenda, kodeHalaman, muat, rentangPekan, tulisDi, type Kotak } from './umum';

export interface OpsiHalaman {
  diperbarui?: string;
}

/** Tiga teks pada satu kotak: kiri atas, tengah (tebal), kanan bawah. Ukuran asli aSc pada halaman 792 pt. */
function teksKotak(mode: ModeP, it: ItemP): { kiri: string; tengah: string; kanan: string; uKiri: number; uTengah: number; uKanan: number } {
  const guruNama = it.guru.map((g) => g.nama).join(', ');
  const guruKode = it.guru.map((g) => g.kode).join('/');
  const rombel = it.rombel.replace(/\s+/g, ' ');
  if (mode === 'rombel') return { kiri: guruNama, tengah: it.mapel.kode, kanan: it.ruang, uKiri: 8.9, uTengah: 15.4, uKanan: 12.6 };
  if (mode === 'guru') return { kiri: it.mapel.kode, tengah: rombel, kanan: it.ruang, uKiri: 12.4, uTengah: 15.3, uKanan: 11.4 };
  return { kiri: it.mapel.kode, tengah: rombel, kanan: guruKode, uKiri: 12.4, uTengah: 15.3, uKanan: 11.4 };
}

/** Teks kiri atas: bila terlalu lebar dan terlalu mengecil, dipecah menjadi dua baris. */
function kiriAtas(pen: PenulisPdf, teks: string, k: Kotak, ukuran: number): void {
  const lebar = k.w - 3;
  if (muat(teks, lebar, ukuran, false, 3.5) < ukuran * 0.75) {
    const u = ukuran * 0.8;
    const baris = bungkus(teks, lebar, u);
    if (baris.length === 2) {
      baris.forEach((b, i) => tulisDi(pen, b, { ...k, y: k.y + i * u * 1.05 }, 'kiriAtas', u, { min: 3.5 }));
      return;
    }
  }
  tulisDi(pen, teks, k, 'kiriAtas', ukuran, { min: 3.5 });
}

export function halamanAsc(pen: PenulisPdf, p: Proyek, mode: ModeP, id: string, tanggal: string, o: OpsiHalaman = {}): void {
  const s = pen.lebar / 792;
  const m = 28 * s;
  const label = daftarEntitasP(p, mode).find((e) => e.id === id)?.label ?? '';
  const lm = susunLembar(p, tanggal, mode, id, { istirahat: 'acuan' });
  const kode = kodeHalaman(p, mode, id, tanggal);

  // judul
  pen.teks('Jadwal Pelajaran SMK Negeri Bansari', pen.lebar / 2, m + 22 * s, { ukuran: 24 * s, tebal: true, rata: 'tengah' });
  pen.teks(label, pen.lebar / 2, m + 22 * s + 26 * s, { ukuran: (mode === 'guru' ? 20 : 21) * s, tebal: mode !== 'guru', rata: 'tengah' });
  pen.teks(rentangPekan(p, tanggal), pen.lebar - m, m + 12 * s, { ukuran: 8.5 * s, rata: 'kanan', warna: '#334155' });
  pen.teks(JUDUL_MODE[mode], m, m + 12 * s, { ukuran: 8.5 * s, rata: 'kiri', warna: '#334155' });

  // kolom
  const bobot = lm.baris.map((r) => (r.t === 'ist' ? 0.55 : r.t === 'pagi' ? 0.9 : 1));
  const wLabel = (mode === 'guru' ? 46 : 74) * s;
  const lebarTabel = pen.lebar - 2 * m;
  const unit = (lebarTabel - wLabel) / bobot.reduce((a, b) => a + b, 0);
  const kx: number[] = [];
  const kw: number[] = [];
  let x = m + wLabel;
  bobot.forEach((b) => {
    kx.push(x);
    kw.push(b * unit);
    x += b * unit;
  });
  const y0 = m + 62 * s;
  const tHead = 34 * s;
  const nHari = lm.hari.length;
  const tinggiLegenda = 60 * s;
  const tRow = Math.min(80 * s, (pen.tinggi - y0 - tHead - m - tinggiLegenda - 10 * s) / nHari);
  const yTabel = y0 + tHead;

  // kepala kolom: nomor dan waktu (waktu dari hari pertama yang punya kolom itu)
  const hariAcuan = (ri: number): number => lm.waktu.findIndex((w) => w.has(ri));
  pen.persegi(m, y0, wLabel, tHead, { garis: '#000000', tebal: 0.8 });
  let nomorIst = 0;
  lm.baris.forEach((r, ri) => {
    const k = { x: kx[ri] as number, y: y0, w: kw[ri] as number, h: tHead };
    pen.persegi(k.x, k.y, k.w, k.h, { garis: '#000000', tebal: 0.8 });
    if (r.t === 'ist') {
      nomorIst++;
      tulisDi(pen, `Break ${nomorIst}`, k, 'tengah', 11.9 * s, { tebal: true, pad: 1 });
      return;
    }
    tulisDi(pen, lm.labelBersama[ri] ?? '', { ...k, h: tHead * 0.62 }, 'tengah', 16.4 * s, { tebal: true });
    const h = hariAcuan(ri);
    const w = h >= 0 ? (lm.waktu[h] as Map<number, string>).get(ri) : undefined;
    if (w) tulisDi(pen, w, { ...k, y: k.y + tHead * 0.55, h: tHead * 0.45 }, 'tengah', 7 * s, { warna: '#334155', pad: 1 });
  });

  // baris hari
  lm.hari.forEach((h, hi) => {
    const y = yTabel + hi * tRow;
    const kotakLabel = { x: m, y, w: wLabel, h: tRow };
    pen.persegi(m, y, wLabel, tRow, { garis: '#000000', tebal: 0.8 });
    if (mode === 'guru') pen.teks(h.hari, m + wLabel / 2 + 6 * s, y + tRow / 2, { ukuran: 13 * s, tebal: true, rata: 'tengah', putar: 90 });
    else {
      tulisDi(pen, h.hari, { ...kotakLabel, h: tRow * 0.7 }, 'tengah', 13 * s, { tebal: true });
      tulisDi(pen, `${Number(h.tanggal.slice(8))} ${new Date(`${h.tanggal}T00:00:00Z`).toLocaleDateString('id-ID', { month: 'short', timeZone: 'UTC' })}`, { ...kotakLabel, y: y + tRow * 0.55, h: tRow * 0.4 }, 'tengah', 7.5 * s, { warna: '#475569' });
    }
    if (h.status !== 'normal') {
      const a = h.status === 'tidakAktif' ? h.alasan : undefined;
      const w = a ? warnaAlasan(a.kode) : { bg: '#f1f5f9', fg: '#475569' };
      const lebar = lebarTabel - wLabel;
      pen.persegi(m + wLabel, y, lebar, tRow, { isi: w.bg, garis: '#000000', tebal: 0.8 });
      const ket = h.keterangan || (h.status === 'akhirPekan' ? 'Akhir pekan' : '');
      tulisDi(pen, a ? `${a.kode} · ${ket}` : ket, { x: m + wLabel, y, w: lebar, h: tRow }, 'tengah', 13 * s, { tebal: true, warna: w.fg });
      return;
    }
    // kotak kosong per kolom; kolom istirahat abu-abu hanya pada hari yang memang istirahat di sana
    const istHariIni = new Set(lm.sel.filter((c) => c.hari === hi && c.isi.jenis === 'ist').map((c) => c.r1));
    lm.baris.forEach((r, ri) => pen.persegi(kx[ri] as number, y, kw[ri] as number, tRow, { isi: r.t === 'ist' && istHariIni.has(ri) ? '#d1d5db' : undefined, garis: '#000000', tebal: 0.8 }));
  });
  // isi
  for (const c of lm.sel) {
    const h = lm.hari[c.hari];
    if (!h || h.status !== 'normal') continue;
    const y = yTabel + c.hari * tRow;
    const x1 = kx[c.r1] as number;
    const x2 = (kx[c.r2] as number) + (kw[c.r2] as number);
    const kotak = { x: x1, y, w: x2 - x1, h: tRow };
    if (c.isi.jenis === 'ist' || c.isi.jenis === 'kosong') continue;
    if (c.isi.jenis === 'pagi') {
      pen.persegi(kotak.x, kotak.y, kotak.w, kotak.h, { isi: '#e2e8f0', garis: '#000000', tebal: 0.8 });
      tulisDi(pen, c.isi.kode, kotak, 'tengah', 12 * s, { tebal: true, warna: '#334155' });
      continue;
    }
    pen.persegi(kotak.x, kotak.y, kotak.w, kotak.h, { isi: '#ffffff', garis: '#000000', tebal: 0.8 });
    const item = c.isi.item;
    const bagian = tRow / item.length;
    const skala = item.length > 1 ? Math.max(0.55, 1 / item.length + 0.1) : 1;
    item.forEach((it, i) => {
      const sub = { x: kotak.x, y: kotak.y + i * bagian, w: kotak.w, h: bagian };
      if (i > 0) pen.garis(sub.x, sub.y, sub.x + sub.w, sub.y, { warna: '#64748b', tebal: 0.4 });
      const t = teksKotak(mode, it);
      if (mode === 'rombel') kiriAtas(pen, t.kiri, sub, t.uKiri * s * skala);
      else tulisDi(pen, t.kiri, sub, 'kiriAtas', t.uKiri * s * skala, { min: 3.5 });
      tulisDi(pen, t.tengah, sub, 'tengah', t.uTengah * s * skala, { tebal: true, min: 4 });
      tulisDi(pen, t.kanan, sub, 'kananBawah', t.uKanan * s * skala, { min: 4 });
    });
  }

  // istirahat hari yang polanya berbeda dari kolom: garis tebal setelah jam itu
  lm.hari.forEach((h, hi) => {
    if (h.status !== 'normal') return;
    for (const ri of lm.istSendiri[hi] as Set<number>) {
      const x = (kx[ri] as number) + (kw[ri] as number);
      pen.garis(x, yTabel + hi * tRow, x, yTabel + (hi + 1) * tRow, { warna: '#000000', tebal: 3 * s });
    }
  });

  // legenda kode dan catatan
  let yb = yTabel + nHari * tRow + 8 * s;
  const beda = lm.hari.filter((h, hi) => h.status === 'normal' && [...(lm.waktu[hi] as Map<number, string>)].some(([ri, w]) => (lm.waktu[hariAcuan(ri)] as Map<number, string>).get(ri) !== w));
  const bedaIst = lm.hari.filter((_, hi) => (lm.istSendiri[hi] as Set<number>).size > 0);
  if (beda.length || bedaIst.length) {
    const teks = [
      beda.length ? `waktu pelajaran hari ${beda.map((h) => h.hari).join(', ')} mengikuti ${[...new Set(beda.map((h) => h.skema))].join(', ')} dan berbeda dari kepala kolom` : '',
      bedaIst.length ? `garis tebal = istirahat hari ${bedaIst.map((h) => h.hari).join(', ')} (letaknya berbeda dari kolom Break)` : '',
    ].filter(Boolean).join('; ');
    pen.teks(`Catatan: ${teks}.`, m, yb + 7 * s, { ukuran: 7 * s, warna: '#7c2d12' });
    yb += 11 * s;
  }
  gambarLegenda(pen, kode, m, yb, lebarTabel, 6.8 * s, Math.max(0, pen.tinggi - m - 12 * s - yb));
  pen.teks('SMK NEGERI BANSARI', m, pen.tinggi - m + 4 * s, { ukuran: 6.5 * s, warna: '#64748b' });
  if (o.diperbarui) pen.teks(`Jadwal diperbarui ${o.diperbarui} WIB`, pen.lebar - m, pen.tinggi - m + 4 * s, { ukuran: 6.5 * s, rata: 'kanan', warna: '#64748b' });
}
