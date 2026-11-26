# Rancang Bangun — App Jadwal Sekolah (SMK Negeri Bansari)

Status: **disepakati 26 Nov 2026**, kecuali butir bertanda ⏳ di bagian 11.
Papan rancangan: Whiteboard "Rancang Bangun App Jadwal Sekolah" (claude.ai).

Prinsip utama: **mesin menjaga aturan, AI mengusulkan, admin menerapkan, publik melihat yang sudah diterapkan.**

---

## 1. Asal fitur

| Sumber | Yang diambil |
|---|---|
| `jadwal.smknbansari.sch.id` (HarizkaLab) | UI dan gaya (Tailwind, Inter, palet `#0d1e33` `#2347b8` `#157f6e` `#9b2665`), tab Grid / Conflict Inspector / Master Data, poster skema dengan edit durasi yang waktunya menyesuaikan otomatis, tampilan per guru / kelas / ruang, kartu slot, panel AI (prompt, contoh cepat, pratinjau, undo), modal cetak buku aSc (1 halaman per entitas), export/import JSON, simulasi bentrok |
| `jadwal-te.html` (milik Benny) | Model penugasan (beban → penempatan), tampungan (slot belum/tidak muat), pemeriksaan per sel (`check()`), periode (PKL per rombel), riwayat undo, export xlsx tanpa library |
| SIMBioTE (`superapp-te`) | Pola AI: rantai model utama + cadangan, multi-kunci, pembatasan RPM/RPD/TPM, pemilahan galat, antrean; "AI menafsirkan, kode yang mengeksekusi"; hanya data yang perlu yang dikirim ke AI |

### Perbaikan atas referensi HarizkaLab

1. Baris istirahat ditanam tetap setelah jam 4 dan 7. Pada skema 10, istirahat jatuh setelah jam 3 dan 6, jadi grid salah. → Grid digambar dari skema masing-masing hari.
2. Skema dipaksa tepat 3 dan semua hari dianggap 11 jam. → Jumlah template bebas; pola skema per hari per minggu.
3. Tidak ada model kebutuhan JP, sehingga gap tidak terlihat. → Ada lapisan **Beban** dan laporan sisa JP.
4. Drag & drop tanpa validasi; undo hanya untuk hasil AI. → Validasi sebelum drop, plus undo/redo untuk semua aksi.
5. AI menulis ulang seluruh jadwal dan API key dipanggil langsung dari browser publik. → AI hanya mengusulkan operasi yang divalidasi mesin; kunci tersimpan terenkripsi di perangkat admin.
6. Data disimpan di localStorage (sekitar 5 MB) dan deteksi bentrok O(n²). → IndexedDB dan indeks hunian (guru/rombel/ruang × hari × jam).

---

## 2. Arsitektur

```
Sumber data ─► Data (7 lapis) ─► Mesin (validator · solver · adaptor skema) ◄─ AI (usul operasi)
                                         │
                                         ▼
                     Admin (susun, uji) ──Terapkan──► Publik (versi terbit)
                                         │
                                         └─► Cetak · Export
```

- **Teknologi:** TypeScript + Vite, tanpa framework berat. Tailwind ikut di-build, bukan dari CDN, supaya bisa offline.
- **Dua keluaran build:**
  - situs GitHub Pages (halaman publik + mode admin)
  - **satu file HTML offline** (seperti `jadwal-te.html`) untuk dipakai tanpa internet
- **Penyimpanan kerja admin:** IndexedDB di perangkat admin (draf), plus export/import `.json` sebagai cadangan atau untuk pindah perangkat.
- **Penyimpanan terbit:** `data/terbit/jadwal.json` di repo ini. Halaman publik hanya membaca file ini.
- **Komputasi berat** (solver, validasi massal) berjalan di Web Worker supaya halaman tidak macet.

### Mode Publik dan Admin

| | Publik | Admin |
|---|---|---|
| Akses | Siapa saja, tanpa login | **Token GitHub + PIN** |
| Melihat | Versi terakhir yang **diterapkan** | Draf yang sedang dikerjakan + versi terbit |
| Mengubah | — | Semua |
| AI | — | Ya |

- **Terapkan** = admin menekan tombol, lalu aplikasi:
  1. memvalidasi (tidak boleh ada bentrok wajib yang belum diputuskan)
  2. membuat `jadwal.json` versi publik (tanpa data pribadi)
  3. melakukan commit ke repo lewat GitHub API dengan **token fine-grained** (izin *Contents: write* hanya untuk repo ini)
- Token dan kunci AI disimpan di perangkat admin, **terenkripsi dengan PIN** (WebCrypto AES-GCM). Tanpa PIN, keduanya tidak bisa dibuka.
- Selama admin mengotak-atik draf, publik tetap melihat versi terbit terakhir.

### Kebijakan data (repo publik)

- Yang terbit hanya: nama dan kode guru, rombel, mapel, ruang, skema, kalender, dan jadwal.
- **NIP dan tanggal lahir tidak pernah ikut terbit.** Parser Excel hanya mengambil baris pertama sel nama; sisanya dibuang saat import.
- Data contoh di repo (untuk demo/tes) berupa data fiktif.

---

## 3. Model data (7 lapis)

### 3.1 Master

- **Guru:** `id, nama, kodeTampil (A–Z, lalu AA–ZZ, otomatis, bisa diedit), mapelUtama[], catatan`
- **Mapel:** `id, nama, kode (≤3 huruf, otomatis, bisa diedit; mis. MTK, BI, ENG, PA), kategori (umum/kejuruan), induk?`
  - `induk` dipakai untuk **elemen/sub-mapel**: TAV → MPP, KK1, KK2 (TE), atau pecahan lain. Bisa dipecah, digabung, atau dikurangi kapan saja.
- **Rombel:** `id, tingkat (X/XI/XII), jurusan (AT/DKV/TE), nomor, kode (mis. XI TE 2)`
- **Ruang:** `id, kode (B3, D1, S1, I1, K1, …), nama, jenis (teori/praktik/lab/lapangan), blok, kapasitas?`
- **Kelompok paralel:** sekumpulan beban yang **boleh** berjalan bersamaan untuk rombel yang sama. Contohnya PA Islam / Katolik / Kristen: satu rombel dipecah ke beberapa guru dan ruang. Ini tidak dihitung bentrok rombel, tetapi bentrok guru dan ruang tetap diperiksa.

### 3.2 Beban mengajar

`id, guruId, mapelId, rombelId, jp, pola, timTeaching[], ruang: {prioritas[], terlarang[]}`

- `pola`: cara JP dipecah per pertemuan, mis. `[4]` (blok utuh), `[2,2]`, `[3,2]`. Kosong = solver bebas memilih.
- **Beban non-tatap-muka** (mis. pembimbing PKL): ikut dihitung di beban JP guru, tetapi tidak menempati slot.

### 3.3 Skema jam (template)

`id, nama (mis. "11"), jamMulai, baris[]`, dengan `baris = { tipe: 'nonKbm' | 'kbm' | 'istirahat', kegiatan, durasi }`

- **Penomoran ganda** (keputusan #1):
  - **Nomor KBM** (internal, untuk menghitung JP): baris `nonKbm` = jam ke-0; pelajaran mulai dari 1.
  - **Label tampilan** (layar akhir dan cetak): urutan baris non-istirahat, sesuai poster resmi.
  - Skema 11 dan 9: Pembiasaan tampil sebagai **1** dan pelajaran pertama **2**.
  - Skema 10 (tanpa pembiasaan): pelajaran pertama tampil sebagai **1**.
- Jam ke-0 bisa diisi kegiatan pagi: pembiasaan, upacara, perwalian, dll.
- Istirahat dan waktu (jam mulai–selesai) dihitung dari skema hari itu, bukan ditanam tetap.

### 3.4 Pola mingguan

Daftar skema untuk Senin–Jumat, mis. `[11,10,10,11,9]` atau `[10,10,11,11,9]`. Bebas memilih template mana saja untuk hari mana saja.

### 3.5 Kalender akademik

`kegiatan = { nama, jenis (TKA/PKL/ASAS/UKK/libur/lain), mulai, selesai, pola?, rombelTidakAktif[], versiJadwal? }`

- Penggantian skema bisa **terjadwal** (berlaku tanggal sekian sampai sekian) atau **manual** (admin memilih sekarang).
- Untuk tanggal apa pun, aplikasi bisa menjawab: skema per hari, rombel yang aktif, dan versi jadwal yang berlaku.

### 3.6 Versi jadwal

- **Reguler:** dirilis awal semester.
- **Varian:** untuk periode tertentu (pekan ASAS, PKL, TKA, …). Bisa dibuat dari salinan reguler lalu disesuaikan, atau dibangkitkan otomatis oleh adaptor skema.
- Setiap versi bisa **diterapkan** (terbit). Riwayat terbit tersimpan di git.

### 3.7 Kondisi / aturan

Disimpan sebagai data, sehingga validator, solver, dan AI membaca aturan yang sama.

- **Wajib:** guru/rombel/ruang tidak boleh ganda; guru tidak tersedia (hari/jam); ruang terlarang untuk rombel atau jurusan (mis. TE tidak boleh memakai lab AT); blok praktik tidak terpotong istirahat; slot di luar kapasitas hari.
- **Preferensi berbobot:** urutan ruang favorit guru/mapel (R1 > R2 > …); batas JP guru per hari; mapel yang sama tidak dua kali sehari; sebaran mapel merata; mapel umum tidak menumpuk di jam akhir; dll.

---

## 4. Mesin (tidak bergantung pada AI)

- **Validator** real-time per sel (pengembangan `check()`): bentrok guru, rombel (dengan pengecualian kelompok paralel), ruang, dan tim teaching; pelanggaran aturan; sisa JP per beban. Hasilnya ditandai warna di grid dan didaftar di Conflict Inspector.
- **Solver** (Web Worker), tiga mode:
  1. **Dari nol:** menempatkan semua beban.
  2. **Perbaiki:** hanya bagian yang bentrok atau tidak muat yang digeser.
  3. **Saran:** daftar rantai geser/tukar yang tidak menimbulkan bentrok baru, untuk satu slot yang dipilih.
- **Adaptor skema:** saat pola minggu atau kalender berubah, slot yang tidak muat dipindah ke **tampungan**. Solver mencoba menempatkan ulang. Kalau **tidak ada solusi, slot ditandai untuk diputuskan manual** (keputusan #2).
- **Laporan ruang:** kebutuhan vs ketersediaan per jenis ruang per hari/jam, beserta titik sempitnya.
- **Undo/redo** untuk semua aksi.

### Tiga kasus utama

| Kasus | Penanganan |
|---|---|
| Ruang kurang | rantai prioritas ruang; ruang terlarang; laporan titik sempit; usulan alternatif (geser jam, ruang teori untuk kejuruan, ruang yang kosong karena ada rombel PKL) |
| Bentrok | dicegah saat menyusun (drop hanya ke sel valid, sel tidak valid diberi warna); yang sudah ada diselesaikan lewat Conflict Inspector + tombol "saran perbaikan" |
| Skema dinamis | lapis 3.3–3.6 dan adaptor skema; grid dan cetak selalu mengikuti skema hari itu |

---

## 5. Asisten AI (pola SIMBioTE)

- **Penyedia:** Gemini dan Groq; **banyak kunci** dari akun berbeda.
- **Rantai:** model utama dicoba di **semua kunci** dulu, baru pindah ke model cadangan berikutnya. Model bawaan mengikuti SIMBioTE: `gemini-3.5-flash-lite`, lalu `gemini-3.1-flash-lite`. Model lain bisa ditambahkan.
- **Pemilahan galat:**
  - batas per menit → jeda
  - jatah harian habis → tandai habis sampai reset
  - sibuk (5xx) → jeda 30 detik
  - kunci tidak sah → nonaktifkan
  - model tidak tersedia → lewati
- **Antrean** permintaan, supaya jatah akun gratis terpakai maksimal tanpa kena limit.
- **AI tidak pernah menulis jadwal langsung.** AI mengembalikan **operasi** (`tempatkan`, `pindah`, `tukar`, `tambahAturan`). Mesin memvalidasi semuanya, lalu admin melihat **pratinjau beda (diff)** dan memutuskan Terapkan/Batal. Semua bisa di-undo.
- **Tugas AI:**
  - menerjemahkan instruksi bahasa Indonesia menjadi aturan atau operasi
  - mengarahkan solver (mis. "dari nol, utamakan blok praktik pagi")
  - memberi saran pergantian/pergeseran tanpa bentrok
  - menjelaskan alasan usulan
- **Privasi:** yang dikirim ke AI hanya kode dan ID (guru, mapel, ruang, rombel) beserta aturan, tanpa nama lengkap.
- ⏳ **Tempat AI berjalan:** lihat 11.2.

---

## 6. Cetak dan export

- **Buku aSc:** 1 halaman per rombel / guru / ruang, A4 landscape (dari referensi, istirahat mengikuti skema).
- **Poster skema** hari/pola yang berlaku.
- **Rekap 1 halaman (semua jadwal):**
  - baris = semua rombel, kolom = hari × jam (label tampilan)
  - isi sel: **kode guru** (A–Z, AA–ZZ) + **kode mapel** (≤3 huruf) + **kode ruang** (B3, D1, …)
  - legenda Guru, Mapel, dan Ruang dibuat otomatis dari master
  - target **A4**; kalau tidak muat, otomatis menawarkan **F4**
  - sel kosong, slot ditandai manual, dan kelompok paralel (mis. PA) diberi tanda khusus
- **Export** xlsx (tanpa library) dan JSON.

---

## 7. Import Excel

Parser format `PEMBAGIAN TUGAS` (contoh sheet `Genap_Harizka`):

- **Header:** baris 5 = tingkat (KELAS X/XI/XII), baris 6 = jurusan (AT/DKV/TE), baris 7 = nomor rombel; data mulai baris 8.
- **Data:** satu guru bisa punya beberapa baris mapel (sel nama digabung). Isi sel = JP untuk rombel di kolom tersebut.
- **PKL** → beban non-tatap-muka. **PABP** yang sama di satu rombel dengan guru berbeda → kelompok paralel otomatis.
- Kolom `JJM MAPEL`, `JJM TOTAL`, dan `TUGAS TAMBAHAN` dibaca sebagai informasi dan pemeriksa silang.
- **Setelah import:** pratinjau → peta kode (guru A–Z, mapel 3 huruf) → simpan. Data yang tidak ada di template (ruang, elemen, tim teaching, aturan) dilengkapi di aplikasi.

Hasil baca 26 Nov: 30 rombel (X 10, XI 10, XII 10), 62 guru. Kebutuhan per minggu: X = 51 JP, XI = 49 JP. XII semuanya PKL di semester genap.

---

## 8. Tampilan (mengikuti referensi)

Header + status bentrok + tombol AI / Export / Import / Cetak. Tab:

1. **Grid Jadwal:** poster skema di atas; tampilan per guru, kelas, atau ruang; **tampilan semua rombel**; tampungan di samping.
2. **Conflict Inspector:** bentrok, pelanggaran aturan, gap JP, slot yang ditandai manual.
3. **Beban & Rekap JP:** per guru, rombel, dan mapel.
4. **Skema & Kalender:** template skema, pola minggu, kalender akademik, versi.
5. **Master Data:** guru, mapel/elemen, rombel, ruang, kelompok paralel, aturan.
6. **AI:** prompt, pratinjau diff, riwayat.
7. **Pengaturan:** token, PIN, kunci AI, terbit.

Halaman publik: pilih rombel / guru / ruang, tampilan hari ini, unduh cetak.

---

## 9. Struktur repo (rencana)

```
app-jadwal-sekolah/
├─ docs/RANCANGAN.md
├─ src/
│  ├─ model/      tipe data, migrasi versi
│  ├─ mesin/      validator, solver (worker), adaptor skema, laporan ruang
│  ├─ ai/         rantai penyedia, antrean, operasi
│  ├─ io/         import Excel, export xlsx/json, terbit GitHub
│  ├─ cetak/      buku aSc, poster, rekap 1 halaman
│  └─ ui/         tampilan admin & publik
├─ data/terbit/jadwal.json   versi yang diterapkan (dibaca publik)
├─ data/contoh/              data fiktif untuk demo & tes
└─ test/
```

---

## 10. Tahapan kerja (tiap tahap di-push ke repo)

| Tahap | Isi | Selesai bila |
|---|---|---|
| 1. Fondasi | model data, master data, skema dinamis + penomoran ganda, pola minggu, kalender, grid yang benar per skema, IndexedDB, export/import JSON | jadwal contoh tampil benar untuk pola `[11,10,10,11,9]` dan `[10,10,11,11,9]` |
| 2. Validator & beban | beban mengajar, kelompok paralel, aturan wajib, Conflict Inspector, tampungan, gap JP, undo/redo, drag & drop tervalidasi | semua kasus bentrok contoh terdeteksi dan tidak ada salah tanda pada kelompok paralel |
| 3. I/O & cetak | import Excel `Genap_Harizka`, kode otomatis, buku aSc, poster, rekap 1 halaman A4/F4, export xlsx | file Excel asli terbaca lengkap; rekap 30 rombel muat 1 halaman |
| 4. Solver & ruang | solver dari nol / perbaiki / saran, preferensi berbobot, adaptor skema, laporan ruang | jadwal penuh tersusun dari data import tanpa bentrok wajib (atau sisa ditandai) |
| 5. AI & publikasi | rantai AI pola SIMBioTE, operasi + diff, mode Admin (token + PIN), Terapkan ke repo, halaman publik | admin terapkan → publik melihat versi baru di GitHub Pages |

---

## 11. Keputusan

### 11.1 Sudah disepakati (26 Nov 2026)

1. Jam pembiasaan = jam ke-0 (non-KBM, tidak dihitung JP); di tampilan akhir dan cetak ditulis jam ke-1. Pada skema tanpa pembiasaan, pelajaran pertama ditulis 1.
2. Kapasitas kurang dan tidak ada solusi → ditandai, diputuskan manual.
3. Cakupan: seluruh rombel, semua jurusan.
4. Rekap 1 halaman: A4, cadangan F4. Guru A–Z lalu AA–ZZ; ruang dengan kodenya; mapel ≤3 huruf (PABP = PA). Semua bisa diedit di master.
5. Elemen mapel bisa dipecah/digabung (TE sementara: MPP, KK1, KK2). JP per elemen diisi di aplikasi; sumber tetap Excel.
6. AI mengikuti pola SIMBioTE (Gemini + Groq, multi-kunci, antrean, rantai fallback).
7. Ruang bisa berpindah, dengan daftar ruang terlarang per rombel/jurusan.
8. Publik hanya melihat versi yang diterapkan; admin bekerja di draf.
9. Repo berisi data yang diterapkan; NIP dan tanggal lahir tidak pernah ikut terbit.
10. Terapkan memakai token GitHub fine-grained yang hanya ada di perangkat admin.
11. Masuk mode admin: token GitHub + PIN.

### 11.2 ⏳ Masih perlu konfirmasi

1. **Tempat AI berjalan.** Usulan: versi pertama berjalan **di browser admin**, memakai algoritma rantai SIMBioTE yang di-port ke TypeScript, dengan kunci terenkripsi PIN, sehingga tidak butuh server. Pilihan lanjutan: endpoint di `superapp-te` (server-te), supaya kunci, antrean, dan catatan pemakaian bersama SIMBioTE.
2. **Selisih kapasitas.** Setelah pembiasaan menjadi jam ke-0, pola `[11,10,10,11,9]` hanya punya **10+10+10+10+8 = 48 JP KBM** per minggu. Sementara itu Excel mencatat X = 51 JP dan XI = 49 JP. Perlu dipastikan bagaimana sekolah menghitungnya (apakah ada mapel di jam ke-0, apakah BK/perwalian dihitung, atau JP dipadatkan). Sampai ada kepastian, aplikasi menandai selisih ini sesuai keputusan #2.
