import { describe, expect, it } from 'vitest';
import { bacaBerkasKalender, bacaRentang, bacaTanggal, dariIcs, dariTabel, tebakJenis } from '../src/io/imporKalender';

const buf = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;

describe('baca tanggal dan rentang', () => {
  it('berbagai format satu tanggal', () => {
    expect(bacaTanggal('2027-01-05')).toBe('2027-01-05');
    expect(bacaTanggal('05/01/2027')).toBe('2027-01-05');
    expect(bacaTanggal('5-1-2027')).toBe('2027-01-05');
    expect(bacaTanggal('5 Januari 2027')).toBe('2027-01-05');
    expect(bacaTanggal('Senin, 5 Jan 2027')).toBe('2027-01-05');
    expect(bacaTanggal(46392)).toBe('2027-01-05'); // nomor seri Excel
    expect(bacaTanggal('31/02/2027')).toBeNull();
    expect(bacaTanggal('bukan tanggal')).toBeNull();
  });
  it('rentang dalam satu sel', () => {
    expect(bacaRentang('16 - 20 November 2026')).toEqual({ mulai: '2026-11-16', selesai: '2026-11-20' });
    expect(bacaRentang('30 Nov - 4 Des 2026')).toEqual({ mulai: '2026-11-30', selesai: '2026-12-04' });
    expect(bacaRentang('2027-01-03 s.d. 2027-06-18')).toEqual({ mulai: '2027-01-03', selesai: '2027-06-18' });
    expect(bacaRentang('28 Des 2026 - 2 Jan 2027')).toEqual({ mulai: '2026-12-28', selesai: '2027-01-02' });
    expect(bacaRentang('25 Desember 2026')).toEqual({ mulai: '2026-12-25', selesai: '2026-12-25' });
    expect(bacaRentang('20 - 16 November 2026')).toBeNull();
  });
  it('tebakan jenis dari nama', () => {
    expect(tebakJenis('Libur Natal')).toBe('libur');
    expect(tebakJenis('ASAJ Praktik Kelas XII')).toBe('ASAJ');
    expect(tebakJenis('Sumatif Akhir Semester (ASAS)')).toBe('ASAS');
    expect(tebakJenis('PKL Kelas XII')).toBe('PKL');
    expect(tebakJenis('Pemadatan TKA')).toBe('TKA');
    expect(tebakJenis('Rapat dinas')).toBe('lain');
  });
});

describe('kalender dari berkas', () => {
  it('CSV titik koma dengan kolom Kegiatan dan Tanggal (rentang dalam satu sel)', async () => {
    const csv = 'No;Kegiatan;Tanggal;Keterangan\n1;Libur Natal;25 Desember 2026;\n2;ASAS Kelas X;30 Nov - 4 Des 2026;"ujian, tertulis"\n3;Rapat;tanggal ngawur;\n';
    const h = await bacaBerkasKalender('kalender.csv', buf(csv));
    expect(h.kegiatan.map((k) => [k.nama, k.mulai, k.selesai, k.jenis, k.catatan])).toEqual([
      ['Libur Natal', '2026-12-25', '2026-12-25', 'libur', undefined],
      ['ASAS Kelas X', '2026-11-30', '2026-12-04', 'ASAS', 'ujian, tertulis'],
    ]);
    expect(h.peringatan.some((x) => x.includes('Rapat'))).toBe(true);
  });
  it('CSV koma dengan kolom Mulai dan Selesai dan Jenis', async () => {
    const csv = 'Nama Kegiatan,Mulai,Selesai,Jenis\nPKL XII,2027-01-04,2027-06-18,PKL\nUKK,2027-04-05,2027-04-09,\n';
    const h = await bacaBerkasKalender('k.csv', buf(csv));
    expect(h.kegiatan.map((k) => [k.nama, k.jenis, k.selesai])).toEqual([['PKL XII', 'PKL', '2027-06-18'], ['UKK', 'UKK', '2027-04-09']]);
  });
  it('tabel xlsx: baris judul dicari otomatis, tanggal berupa nomor seri', () => {
    const h = dariTabel([
      ['KALENDER AKADEMIK 2026/2027', null, null],
      [null, null, null],
      ['No', 'Kegiatan', 'Tanggal'],
      [1, 'Libur Semester', 46388],
      [2, 'Awal semester genap', '2027-01-04'],
    ]);
    expect(h.kegiatan.map((k) => [k.nama, k.mulai])).toEqual([['Libur Semester', '2027-01-01'], ['Awal semester genap', '2027-01-04']]);
    expect(h.kegiatan[0]?.jenis).toBe('libur');
  });
  it('tanpa baris judul: peringatan, tidak ada kegiatan', () => {
    const h = dariTabel([['a', 'b'], ['c', 'd']]);
    expect(h.kegiatan).toEqual([]);
    expect(h.peringatan[0]).toContain('Baris judul');
  });
  it('ICS: tanggal penuh (DTEND eksklusif) dan tanggal-jam', () => {
    const ics = ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'SUMMARY:Libur Natal', 'DTSTART;VALUE=DATE:20261225', 'DTEND;VALUE=DATE:20261227', 'END:VEVENT',
      'BEGIN:VEVENT', 'SUMMARY:Rapat\\, guru', 'DTSTART:20270105T070000Z', 'DTEND:20270105T090000Z', 'DESCRIPTION:Ruang\\n guru', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    const h = dariIcs(ics);
    expect(h.kegiatan.map((k) => [k.nama, k.mulai, k.selesai, k.jenis])).toEqual([
      ['Libur Natal', '2026-12-25', '2026-12-26', 'libur'],
      ['Rapat, guru', '2027-01-05', '2027-01-05', 'lain'],
    ]);
  });
  it('JSON: daftar kegiatan atau proyek berisi kalender', async () => {
    const h = await bacaBerkasKalender('k.json', buf(JSON.stringify({ kalender: [{ nama: 'UKK', mulai: '2027-04-05', selesai: '2027-04-09', jenis: 'UKK' }, { nama: 'rusak' }] })));
    expect(h.kegiatan).toHaveLength(1);
    expect(h.kegiatan[0]?.jenis).toBe('UKK');
    expect(h.peringatan).toHaveLength(1);
  });
  it('kegiatan dengan tanggal selesai sebelum mulai ditolak', async () => {
    const h = await bacaBerkasKalender('k.json', buf(JSON.stringify([{ nama: 'Salah', mulai: '2027-04-09', selesai: '2027-04-05' }])));
    expect(h.kegiatan).toEqual([]);
    expect(h.peringatan.join(' ')).toContain('Salah');
  });
});
