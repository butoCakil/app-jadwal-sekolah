# App Jadwal Sekolah — SMK Negeri Bansari

Aplikasi penyusun jadwal pelajaran seluruh rombel: skema jam dinamis (9/10/11 per hari), kalender akademik, deteksi bentrok, solver, dan asisten AI. Halaman publik menampilkan jadwal yang sudah diterapkan admin.

Status: **tahap 1 dan 2 selesai; tahap 3 sebagian (impor Excel).** Rancangan lengkap: [docs/RANCANGAN.md](docs/RANCANGAN.md).

## Menjalankan

```bash
npm install
npm run dev      # pengembangan
npm test         # tes
npm run build    # hasil di dist/
```

Data contoh (fiktif) ada di `data/contoh/contoh.json` dan bisa dimuat lewat tombol **Impor JSON**.

## Yang sudah ada (tahap 3, bagian 1)

- **Impor Excel** format PEMBAGIAN TUGAS (sheet seperti `Genap_Harizka`): guru dengan kode A–Z/AA–ZZ, mapel berkode ≤3 huruf, rombel, dan beban, lengkap dengan pemeriksaan silang JP. Berkas dibaca di peramban saja; NIP dan tanggal lahir tidak dibaca.
- **Grid** "Satu per satu" dan "Semua sekaligus" (matriks seluruh rombel/guru/ruang); seret-lepas di semua mode.

## Yang sudah ada (tahap 2)

- **Beban mengajar** per rombel: guru, mapel/elemen, JP, pola pertemuan, team teaching, kelompok paralel (mis. PA), ruang prioritas dan ruang terlarang, beban non-tatap-muka.
- **Pemeriksa bentrok** real-time: guru, rombel (kelompok paralel tidak dihitung bentrok), ruang, ruang terlarang, guru tidak tersedia, JP berlebih/kurang, slot di luar kapasitas skema.
- **Grid** tampilan per rombel, guru, atau ruang. Seret kartu ke sel: hijau = aman, merah = bentrok disertai alasan. Sel kosong juga bisa diklik. Dua pelajaran satu rombel bisa saling bertukar.
- **Penempatan ruang otomatis** mengikuti urutan prioritas beban; ruang terlarang tidak pernah dipilih.
- **Conflict Inspector**, **Master Data** (kode guru A–Z/AA–ZZ dan mapel ≤3 karakter otomatis), **aturan**, **Urungkan/Ulangi** (Ctrl+Z / Ctrl+Y).

## Tahap 1

- Tiga skema bawaan (11/10/9) disalin dari poster resmi, bisa diedit: jam mulai, durasi, jenis baris (non-KBM / pelajaran / istirahat).
- Penomoran ganda: Pembiasaan = jam ke-0 secara internal, tampil sebagai jam 1; skema tanpa pembiasaan mulai dari 1.
- Pola mingguan bebas per hari, pola manual, dan kalender akademik (rentang tanggal, pola khusus, libur).
- Grid per rombel mengikuti skema yang berlaku tiap hari; slot yang tidak muat masuk tampungan; selisih kapasitas JP ditandai.
- Draf tersimpan di IndexedDB; ekspor/impor JSON dengan validasi.

Fusi dari:
- UI dan fitur `jadwal.smknbansari.sch.id` (HarizkaLab, atas izin pengembang)
- `jadwal-te.html` (Benny Surahman)
- pola AI dari SIMBioTE (`superapp-te`)
