// Halaman jadwal satu kelas/guru/ruang bergaya bawaan (sama dengan tabel Per pekan di halaman): hari ke samping, jam ke bawah, kotak berwarna per mapel.

import type { Proyek } from '../../model/tipe';
import { warnaMapel } from '../../ui/util';
import { barisKotak, warnaAlasan } from '../kotak';
import { susunLembar } from '../lembar';
import { daftarEntitasP, jadwalPekanP, type ModeP } from '../tampil';
import { PenulisPdf } from './penulis';
import { JUDUL_MODE, bungkus, gambarLegenda, kodeHalaman, kopBawaan, rentangPekan, tulisDi } from './umum';

export function halamanBawaan(pen: PenulisPdf, p: Proyek, mode: ModeP, id: string, tanggal: string, o: { diperbarui?: string } = {}): void {
  const s = pen.lebar / 842;
  const m = 24 * s;
  const lebarIsi = pen.lebar - 2 * m;
  const label = daftarEntitasP(p, mode).find((e) => e.id === id)?.label ?? '';
  const lm = susunLembar(p, tanggal, mode, id);
  const kegiatan = [...new Set(jadwalPekanP(p, tanggal, mode, id).hari.map((h) => h.kegiatan?.nama).filter((x): x is string => !!x))];
  const kode = kodeHalaman(p, mode, id, tanggal);
  const kop = kopBawaan(pen, m, m, lebarIsi, `${JUDUL_MODE[mode]} ${label}`, rentangPekan(p, tanggal), kegiatan, s);

  const wLabel = 58 * s;
  const nHari = lm.hari.length;
  const wHari = (lebarIsi - wLabel) / nHari;
  const y0 = m + kop + 8 * s;
  const tHead = 30 * s;
  const tinggiLegenda = 54 * s;
  const bobot = lm.baris.map((r) => (r.t === 'ist' ? 0.32 : r.t === 'pagi' ? 0.7 : 1));
  const unit = Math.min(54 * s, (pen.tinggi - y0 - tHead - m - tinggiLegenda - 12 * s) / bobot.reduce((a, b) => a + b, 0));
  const ry: number[] = [];
  const rh: number[] = [];
  let y = y0 + tHead;
  bobot.forEach((b) => {
    ry.push(y);
    rh.push(b * unit);
    y += b * unit;
  });
  const yAkhir = Math.max(y, y0 + tHead + 90 * s);

  // kepala
  pen.persegi(m, y0, wLabel, tHead, { isi: '#f1f5f9', garis: '#e2e8f0', tebal: 0.5 });
  tulisDi(pen, 'Jam', { x: m, y: y0, w: wLabel, h: tHead }, 'tengah', 8 * s, { tebal: true, warna: '#64748b' });
  lm.hari.forEach((h, hi) => {
    const x = m + wLabel + hi * wHari;
    pen.persegi(x, y0, wHari, tHead, { isi: h.warna ?? '#64748b', garis: '#ffffff', tebal: 0.6 });
    const k = { x, y: y0, w: wHari, h: tHead };
    tulisDi(pen, h.hari, k, 'tengahAtas', 10 * s, { tebal: true, warna: '#ffffff', pad: 3 * s });
    const tgl = `${Number(h.tanggal.slice(8))} ${new Date(`${h.tanggal}T00:00:00Z`).toLocaleDateString('id-ID', { month: 'short', timeZone: 'UTC' })}${h.skema ? ` · ${h.skema}` : ''}`;
    tulisDi(pen, tgl, { ...k, y: y0 + 15 * s, h: tHead - 15 * s }, 'tengahAtas', 7 * s, { warna: '#ffffff', pad: 1 });
  });

  // label baris
  const hariAcuan = (ri: number): number => lm.waktu.findIndex((w) => w.has(ri));
  lm.baris.forEach((r, ri) => {
    const k = { x: m, y: ry[ri] as number, w: wLabel, h: rh[ri] as number };
    pen.persegi(k.x, k.y, k.w, k.h, { isi: r.t === 'ist' ? '#ecfdf5' : '#f8fafc', garis: '#e2e8f0', tebal: 0.5 });
    if (r.t === 'ist') {
      tulisDi(pen, 'istirahat', k, 'tengah', 6 * s, { warna: '#047857' });
      return;
    }
    const h = hariAcuan(ri);
    const w = h >= 0 ? (lm.waktu[h] as Map<number, string>).get(ri) : undefined;
    tulisDi(pen, lm.labelBersama[ri] ?? '', { ...k, h: k.h * 0.6 }, 'tengah', 10 * s, { tebal: true, warna: '#334155' });
    if (w) tulisDi(pen, w, { ...k, y: k.y + k.h * 0.55, h: k.h * 0.45 }, 'tengah', 6 * s, { warna: '#64748b', pad: 1 });
  });

  // latar tiap hari
  lm.hari.forEach((h, hi) => {
    const x = m + wLabel + hi * wHari;
    if (h.status !== 'normal') {
      const a = h.status === 'tidakAktif' ? h.alasan : undefined;
      const w = a ? warnaAlasan(a.kode) : { bg: '#f1f5f9', fg: '#475569' };
      pen.persegi(x, y0 + tHead, wHari, yAkhir - y0 - tHead, { isi: w.bg, garis: '#ffffff', tebal: 0.6 });
      const ket = h.keterangan || (h.status === 'akhirPekan' ? 'Akhir pekan' : '');
      const teks = a ? [a.kode, ...bungkus(ket, wHari - 8 * s, 8 * s, false)] : bungkus(ket, wHari - 8 * s, 8 * s, false);
      teks.forEach((t, i) => pen.teks(t, x + wHari / 2, y0 + tHead + 20 * s + i * 10 * s, { ukuran: (i === 0 && a ? 11 : 8) * s, tebal: i === 0 && !!a, rata: 'tengah', warna: w.fg }));
      return;
    }
    lm.baris.forEach((r, ri) => pen.persegi(x, ry[ri] as number, wHari, rh[ri] as number, { isi: r.t === 'ist' ? '#ecfdf5' : '#ffffff', garis: '#e2e8f0', tebal: 0.5 }));
  });

  // isi
  for (const c of lm.sel) {
    const h = lm.hari[c.hari];
    if (!h || h.status !== 'normal' || c.isi.jenis === 'ist' || c.isi.jenis === 'kosong') continue;
    const x = m + wLabel + c.hari * wHari;
    const yy = ry[c.r1] as number;
    const k = { x, y: yy, w: wHari, h: (ry[c.r2] as number) + (rh[c.r2] as number) - yy };
    if (c.isi.jenis === 'pagi') {
      pen.persegi(k.x, k.y, k.w, k.h, { isi: '#e2e8f0', garis: '#ffffff', tebal: 0.6 });
      tulisDi(pen, c.isi.kode, k, 'tengah', 8 * s, { tebal: true, warna: '#475569' });
      continue;
    }
    const x0 = c.isi.item[0];
    if (!x0) continue;
    const w = warnaMapel(x0.mapel.kode);
    pen.persegi(k.x, k.y, k.w, k.h, { isi: w.bg, garis: '#ffffff', tebal: 0.6 });
    pen.persegi(k.x, k.y, 2 * s, k.h, { isi: w.garis });
    const baris = barisKotak(mode, x0, c.isi.item.length > 1).filter((t) => t !== '');
    const u = Math.min(9 * s, (k.h - 4 * s) / (baris.length * 1.2));
    const total = baris.length * u * 1.2;
    baris.forEach((t, i) => tulisDi(pen, t, { x: k.x + 2 * s, y: k.y + (k.h - total) / 2 + i * u * 1.2 - u * 0.1, w: k.w - 2 * s, h: u * 1.2 }, 'tengah', u, { tebal: i === 0, warna: i === 0 ? '#0f172a' : '#334155', min: 4 }));
  }

  gambarLegenda(pen, kode, m, yAkhir + 8 * s, lebarIsi, 6.8 * s, Math.max(0, pen.tinggi - m - 10 * s - yAkhir - 8 * s));
  if (o.diperbarui) pen.teks(`Jadwal diperbarui ${o.diperbarui} WIB`, pen.lebar - m, pen.tinggi - m + 4 * s, { ukuran: 6.5 * s, rata: 'kanan', warna: '#64748b' });
}
