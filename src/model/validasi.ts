import type { Proyek } from './tipe';
import { VERSI_DATA_SAAT_INI } from './tipe';
import { cekKegiatan, cekPola } from './kalender';
import { cekSkema } from './skema';

/** Memeriksa proyek hasil impor. Mengembalikan daftar masalah; kosong berarti aman dimuat. */
export function validasiProyek(x: unknown): string[] {
  const galat: string[] = [];
  if (typeof x !== 'object' || x === null) return ['Berkas bukan objek JSON proyek.'];
  const p = x as Partial<Proyek>;
  if (p.versiSkemaData !== VERSI_DATA_SAAT_INI) {
    galat.push(`Versi data ${String(p.versiSkemaData)} tidak didukung (yang didukung: ${VERSI_DATA_SAAT_INI}).`);
    return galat;
  }
  for (const k of ['skema', 'kalender', 'versi', 'beban', 'aturan'] as const) {
    if (!Array.isArray(p[k])) galat.push(`Bagian "${k}" harus berupa daftar.`);
  }
  if (!p.master || typeof p.master !== 'object') galat.push('Bagian "master" tidak ada.');
  if (!Array.isArray(p.polaReguler) || p.polaReguler.length !== 5) galat.push('"polaReguler" harus berisi 5 id skema.');
  if (galat.length) return galat;

  const proyek = p as Proyek;
  proyek.skema.forEach((s) => cekSkema(s).forEach((g) => galat.push(`Skema ${s.id}: ${g}`)));
  cekPola(proyek.polaReguler, proyek.skema).forEach((g) => galat.push(`Pola reguler: ${g}`));
  if (proyek.penggantiManual) cekPola(proyek.penggantiManual.pola, proyek.skema).forEach((g) => galat.push(`Pengganti manual: ${g}`));
  proyek.kalender.forEach((k) => {
    cekKegiatan(k).forEach((g) => galat.push(`Kegiatan ${k.nama}: ${g}`));
    if (k.pola) cekPola(k.pola, proyek.skema).forEach((g) => galat.push(`Kegiatan ${k.nama}: ${g}`));
  });
  const adaGuru = new Set(proyek.master.guru.map((x) => x.id));
  const adaMapel = new Set(proyek.master.mapel.map((x) => x.id));
  const adaRombel = new Set(proyek.master.rombel.map((x) => x.id));
  const idBeban = new Set<string>();
  proyek.beban.forEach((b) => {
    if (idBeban.has(b.id)) galat.push(`Id beban ganda: ${b.id}`);
    idBeban.add(b.id);
    if (!adaGuru.has(b.guruId)) galat.push(`Beban ${b.id}: guru tidak ada.`);
    if (!adaMapel.has(b.mapelId)) galat.push(`Beban ${b.id}: mapel tidak ada.`);
    if (!adaRombel.has(b.rombelId)) galat.push(`Beban ${b.id}: rombel tidak ada.`);
    if (!Number.isInteger(b.jp) || b.jp < 0) galat.push(`Beban ${b.id}: JP harus bilangan bulat >= 0.`);
  });
  proyek.versi.forEach((v) => v.slots.forEach((sl) => {
    if (!idBeban.has(sl.bebanId)) galat.push(`Versi ${v.nama}: slot ${sl.id} mengacu ke beban yang tidak ada.`);
  }));
  const idSkema = proyek.skema.map((s) => s.id);
  if (new Set(idSkema).size !== idSkema.length) galat.push('Ada id skema ganda.');
  return galat;
}
