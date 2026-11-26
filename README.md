# App Jadwal Sekolah — SMK Negeri Bansari

Aplikasi penyusun jadwal pelajaran seluruh rombel: skema jam dinamis (9/10/11 per hari), kalender akademik, deteksi bentrok, solver, dan asisten AI. Halaman publik menampilkan jadwal yang sudah diterapkan admin.

Status: **tahap 1 (fondasi) selesai.** Rancangan lengkap: [docs/RANCANGAN.md](docs/RANCANGAN.md).

## Menjalankan

```bash
npm install
npm run dev      # pengembangan
npm test         # tes
npm run build    # hasil di dist/
```

Data contoh (fiktif) ada di `data/contoh/contoh.json` dan bisa dimuat lewat tombol **Impor JSON**.

## Yang sudah ada (tahap 1)

- Tiga skema bawaan (11/10/9) disalin dari poster resmi, bisa diedit: jam mulai, durasi, jenis baris (non-KBM / pelajaran / istirahat).
- Penomoran ganda: Pembiasaan = jam ke-0 secara internal, tampil sebagai jam 1; skema tanpa pembiasaan mulai dari 1.
- Pola mingguan bebas per hari, pola manual, dan kalender akademik (rentang tanggal, pola khusus, libur).
- Grid per rombel mengikuti skema yang berlaku tiap hari; slot yang tidak muat masuk tampungan; selisih kapasitas JP ditandai.
- Draf tersimpan di IndexedDB; ekspor/impor JSON dengan validasi.

Fusi dari:
- UI dan fitur `jadwal.smknbansari.sch.id` (HarizkaLab, atas izin pengembang)
- `jadwal-te.html` (Benny Surahman)
- pola AI dari SIMBioTE (`superapp-te`)
