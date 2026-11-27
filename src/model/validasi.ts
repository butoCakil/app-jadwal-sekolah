import type { Proyek } from './tipe';
import { VERSI_DATA_SAAT_INI } from './tipe';
import { cekKegiatan, cekPola, daftarPola } from './kalender';
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
  if (!Array.isArray(p.polaReguler) || (p.polaReguler.length !== 5 && p.polaReguler.length !== 6)) galat.push('"polaReguler" harus berisi 5 atau 6 id skema (jumlah hari kerja).');
  if (galat.length) return galat;

  const proyek = p as Proyek;
  proyek.skema.forEach((s) => cekSkema(s).forEach((g) => galat.push(`Skema ${s.id}: ${g}`)));
  const hari = proyek.polaReguler.length;
  cekPola(proyek.polaReguler, proyek.skema).forEach((g) => galat.push(`Pola default: ${g}`));
  const idPola = daftarPola(proyek).map((x) => x.id);
  if (new Set(idPola).size !== idPola.length) galat.push('Ada id pola mingguan ganda.');
  for (const x of proyek.polaLain ?? []) {
    if (!x.nama?.trim()) galat.push(`Pola ${x.id}: nama kosong.`);
    cekPola(x.pola, proyek.skema, hari).forEach((g) => galat.push(`Pola ${x.nama}: ${g}`));
  }
  if (proyek.penggantiManual) cekPola(proyek.penggantiManual.pola, proyek.skema, hari).forEach((g) => galat.push(`Pengganti manual: ${g}`));
  proyek.kalender.forEach((k) => {
    cekKegiatan(k).forEach((g) => galat.push(`Kegiatan ${k.nama}: ${g}`));
    if (k.pola) cekPola(k.pola, proyek.skema, hari).forEach((g) => galat.push(`Kegiatan ${k.nama}: ${g}`));
    if (k.polaId && !idPola.includes(k.polaId)) galat.push(`Kegiatan ${k.nama}: pola mingguan tidak ada.`);
  });
  const adaGuru = new Set(proyek.master.guru.map((x) => x.id));
  const adaMapel = new Set(proyek.master.mapel.map((x) => x.id));
  for (const m of proyek.master.mapel) if (m.jenisRuang && m.jenisRuang.some((j) => !['teori', 'praktik', 'lab', 'lapangan'].includes(j))) galat.push(`Mapel ${m.kode}: jenis ruang tidak dikenal.`);
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
  const adaRuang = new Set(proyek.master.ruang.map((x) => x.id));
  for (const a of proyek.aturan) {
    if ((a.jenis === 'guruRuang' || a.jenis === 'guruTidakTersedia') && !adaGuru.has(a.guruId)) galat.push(`Aturan ${a.id}: guru tidak ada.`);
    if ((a.jenis === 'guruRuang' || a.jenis === 'ruangTerlarang') && a.ruangIds.some((i) => !adaRuang.has(i))) galat.push(`Aturan ${a.id}: ada ruang yang tidak ada.`);
  }
  for (const m of proyek.master.mapel) if (m.ruangIds?.some((i) => !adaRuang.has(i))) galat.push(`Mapel ${m.kode}: ada ruang yang tidak ada.`);
  for (const r of proyek.master.rombel) if (r.ruangIds?.some((i) => !adaRuang.has(i))) galat.push(`Rombel ${r.kode}: ada ruang yang tidak ada.`);
  for (const g of proyek.master.guru) if (g.mapelIds?.some((i) => !adaMapel.has(i))) galat.push(`Guru ${g.kode}: ada mapel yang tidak ada.`);
  const idVersi = new Set(proyek.versi.map((v) => v.id));
  for (const kg of proyek.kalender) {
    if (kg.versiId && !idVersi.has(kg.versiId)) galat.push(`Kegiatan ${kg.nama}: versi jadwal tidak ada.`);
    if (kg.rombelTidakAktif.some((i) => !adaRombel.has(i))) galat.push(`Kegiatan ${kg.nama}: ada rombel yang tidak ada.`);
  }
  if (proyek.periodeAktifId && !proyek.kalender.some((kg) => kg.id === proyek.periodeAktifId)) galat.push('Periode aktif tidak ada di kalender.');
  const idSkema = proyek.skema.map((s) => s.id);
  if (new Set(idSkema).size !== idSkema.length) galat.push('Ada id skema ganda.');
  return galat;
}
