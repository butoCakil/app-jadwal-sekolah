# App Jadwal Sekolah — SMK Negeri Bansari

Aplikasi penyusun jadwal pelajaran seluruh rombel: skema jam dinamis (9/10/11 per hari), kalender akademik, deteksi bentrok, solver, dan asisten AI. Halaman publik menampilkan jadwal yang sudah diterapkan admin.

Status: **tahap 1, 2, dan 4 (solver tahap pertama) selesai; tahap 3 sebagian (impor Excel).** Rancangan lengkap: [docs/RANCANGAN.md](docs/RANCANGAN.md).

## Menjalankan

```bash
npm install
npm run dev      # pengembangan
npm test         # tes
npm run build    # hasil di dist/
```

Data awal aplikasi = **data sekolah** (`data/sekolah/genap-2027.json` bawaan, `data/sekolah/gasal-2026.json` untuk Gasal): 62 guru, 30 rombel, 42 ruang site plan 2026, aturan ruang per jurusan, dan **jadwal reguler Gasal 2026/2027** dari aSc (25 rombel x 48 JP = 1200 JP, tanpa bentrok) beserta beban turunannya (guru, mapel/elemen, JP, pola pertemuan, ruang). Lima rombel XI yang tidak ada di PDF aSc memakai beban dari Excel dan belum terjadwal. Tidak memuat NIP. Sumber: `data/sekolah/sumber/reguler-gasal-2026.json` (diekstrak dari PDF Jadwal Kelas dan Jadwal Guru oleh `tools/ekstrak-asc-pdf.py`); data dibangun ulang dengan `TULIS_DATA=1 npx vitest run test/bangun-data.test.ts`. Data contoh fiktif untuk demo/tes ada di `data/contoh/contoh.json` (tombol **Ganti dengan data contoh fiktif** di Master Data).

## Yang sudah ada (tahap 5: master data dan kalender)

- **Dua dataset sekolah**, dipilih lewat tombol **Muat data ini** di Master Data > Data: **Genap 2026/2027** (bawaan: guru dari sheet Genap, tanpa Laila Zuhaida; 61 guru, 30 rombel, 316 beban, jadwal kosong, kelas XII PKL) dan **Gasal 2026/2027** (jadwal reguler aSc 1200 JP, periode TKA/ASAJ/ASAS). Draf lama di browser tidak ikut berganti otomatis: pakai tombol itu.
- **Master Data bertab** (Guru, Mapel & elemen, Rombel, Ruang, Aturan & kondisi, Data). Ruang punya **kategori** (Ruang teori, Lab TE, Lab DKV, Lab AT, ...). Pilihan relasi memakai **modal centang** dengan pencarian, "Pilih semua", dan pilih per kategori: mapel yang diampu guru, ruang yang boleh per mapel dan per rombel, ruang dan guru tim pada beban.
- **Aturan baru:** guru hanya di ruang tertentu (boleh lebih dari satu). Aturan memilih dari data master (guru, ruang, jam), bukan mengetik kode. Daftar putih ruang pada guru, mapel, dan rombel berlaku bersamaan (ruang harus lolos semuanya) di validator, penempatan, dan solver.
- **Perbaikan:** centang "Ikut dijadwalkan" kini bisa dibatalkan.
- **Beban mengajar** bertab per rombel (dikelompokkan per tingkat dan jurusan).
- **Kalender akademik:** kalender bulan kotak (kiri) dengan panel info tanggal (kanan), tabel semua kegiatan, tambah/ubah/hapus kegiatan, dan **impor dari berkas** (.xlsx, .csv/.tsv, .ics, .json).
- **Periode** (seperti jadwal-te): setiap kegiatan bisa membawa pola mingguan, versi jadwal sendiri, dan daftar rombel tidak aktif (PKL); satu periode ditandai **aktif** dan dipilih dari bilah di tab Jadwal. Slot rombel PKL disembunyikan, tidak diperiksa, dan dilewati Susun Otomatis.
- **Template skema jam** bisa ditambah, disalin, diubah, dan dihapus (tidak bisa jika masih dipakai), misalnya untuk bulan puasa.

## Yang sudah ada (tahap 4)

- **Susun Otomatis** (tab baru, berjalan di Web Worker): menempatkan JP semua beban tanpa bentrok guru/rombel/ruang, memperhatikan guru tidak tersedia, ruang terlarang, jenis ruang per mapel, pola pertemuan, dan kelompok paralel. Mode "dari nol" atau "lengkapi" (mempertahankan slot yang ada). Yang tidak muat tidak dipaksakan: dilaporkan beserta alasannya. Hasil diterapkan dengan satu klik dan bisa diurungkan.

## Yang sudah ada (tahap 3, bagian 1)

- **Impor Excel** format PEMBAGIAN TUGAS (sheet seperti `Genap_Harizka`): guru (kode 3 huruf dari jadwal-te bila dikenal, selain itu usulan dari nama), mapel berkode ≤3 huruf, rombel, dan beban, lengkap dengan pemeriksaan silang JP. Berkas dibaca di peramban saja; NIP dan tanggal lahir tidak dibaca.
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
