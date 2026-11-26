# Rancang Bangun — App Jadwal Sekolah (SMK Negeri Bansari)

Status: **disepakati 26 Nov 2026.** Tahap 1, 2, dan 4 (solver versi pertama) selesai; tahap 3 sebagian (impor Excel selesai; cetak belum). Data awal = jadwal reguler Gasal 2026/2027 dari aSc (lihat 11.5 dan 11.6).
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
- **Tempat AI berjalan:** browser admin dulu (lihat 11.2).

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

### 11.2 Keputusan tambahan

1. **Tempat AI berjalan:** disepakati (26 Nov 2026) versi pertama di browser admin; endpoint di `superapp-te` menjadi pilihan lanjutan.
2. **Selisih kapasitas JP:** pola `[11,10,10,11,9]` dan `[10,10,11,11,9]` sama-sama 10+10+10+10+8 = **48 JP KBM**, sedangkan Excel mencatat X = 51 JP dan XI = 49 JP. Aplikasi menandai selisih ini (sesuai keputusan #2) dan diputuskan manual; cara sekolah menghitungnya belum dikonfirmasi.

### 11.3 Status tahap

- Tahap 1 selesai: model data, skema dinamis + penomoran ganda, pola mingguan, kalender, grid per skema, IndexedDB, ekspor/impor JSON, 22 tes.
- Skema bawaan diambil dari poster resmi pada berkas jadwal 9–13 Nov 2026.
- Tahap 2 selesai: beban mengajar, kelompok paralel, team teaching, validator (bentrok guru/rombel/ruang, ruang terlarang, guru tidak tersedia, JP, kapasitas), penempatan ruang berurutan prioritas, Conflict Inspector, master data, aturan, undo/redo, drag & drop tervalidasi (termasuk tukar posisi), 54 tes. Format data naik ke versi 2 (slot kini mengacu ke beban); draf lama versi 1 (hanya data contoh) tidak dimuat.

### 11.4 Keputusan teknis tahap 2 (usulan, mohon dikoreksi bila tidak sesuai)

1. **Ruang prioritas:** bila daftar prioritas sebuah beban ada, hanya ruang di daftar itu yang dipakai (berurutan). Bila semuanya terpakai, penempatan ditolak dengan alasan "ruang prioritas terpakai" (inilah kasus ruang kurang). Bila daftar kosong, semua ruang yang tidak terlarang boleh dipakai.
2. **Ruang "dipakai bersama":** ruang bertanda ini (mis. lapangan) tidak dihitung bentrok walau dipakai beberapa rombel sekaligus. Bawaan: tidak ada ruang yang bertanda.
3. **Kelompok paralel:** beban di rombel yang sama dengan nama kelompok paralel yang sama boleh berjalan bersamaan. Bentrok guru dan ruang tetap diperiksa.
4. **Hitungan "bentrok" di lencana atas:** bentrok guru/rombel/ruang ditambah pelanggaran aturan (ruang terlarang, guru tidak tersedia, JP melebihi beban). Kurang JP, slot tanpa ruang, dan slot yang tidak muat di skema pekan dilaporkan terpisah sebagai peringatan.
5. **Nomor pelajaran pada pesan:** pesan memakai nomor pelajaran (jam KBM), bukan label poster, karena label berbeda antar skema (Pembiasaan memakai nomor 1).
6. **Pola pertemuan** (mis. 2,2) tersimpan tetapi belum diperiksa; dipakai solver di tahap 4.
- Grid disusun ulang (26 Nov): tampilan "Satu per satu" (kolom per hari, baris pelajaran sejajar, istirahat sebagai pita di dalam sel, kartu dua baris dengan lencana ruang) dan "Semua sekaligus" (matriks semua rombel/guru/ruang × hari × pelajaran). Seret-lepas aktif di semua mode; di matriks, baris yang bukan milik pelajaran yang diseret ditolak.
- Tahap 3 bagian 1 selesai: **Impor Excel** (tab "Impor Excel"). Pembaca xlsx sendiri (fflate + regex XML, tanpa pustaka spreadsheet), penafsir format PEMBAGIAN TUGAS (baris judul dicari lewat "MATA PELAJARAN"; sel nama kosong = guru di atasnya; hanya baris pertama sel nama dibaca sehingga NIP dan tanggal lahir tidak ikut). Hasil uji pada `PEMBAGIAN TUGAS GASAL 2026-2027.xlsx`, sheet Genap_Harizka: 61 guru, 24 mapel, 30 rombel, 316 beban, JP tatap muka X dan XI cocok dengan baris jumlah (51 dan 49). Kode mapel Excel dipetakan (PABP→PA, INDO→BI, selain itu tiga huruf pertama) dan bisa diubah di Master Data.
- Aturan impor: PKL = non-tatap-muka; PABP dengan guru berbeda pada rombel yang sama = kelompok paralel "PA" (JP dihitung sekali per kelompok); mapel lain dengan beberapa guru di satu rombel hanya dilaporkan, tidak ditebak. Menerapkan impor mengganti guru, mapel, rombel, beban; jadwal dikosongkan; ruang, skema, kalender dipertahankan; aturan per guru atau per rombel lama dibuang.
- Belum (tahap 3 bagian 2): cetak buku aSc, poster skema, rekap 1 halaman A4/F4, ekspor xlsx; peta kode guru/mapel yang bisa diedit sebelum menerapkan.
- Grid (26 Nov, revisi): satu beban pada satu hari dengan JP berurutan = satu kartu; istirahat punya baris/kolom sendiri; kartu yang melewati istirahat tampil terpisah ("bagian 1/2", "2/2") dan utuh lagi saat digeser ke posisi tanpa istirahat. Menyeret kartu memindah seluruh blok. Slot di luar kapasitas hari tidak digambar di grid (ada di Tampungan).
- Ruang: daftar ruang menurut Site plan 2026 (42 ruang, gedung B–S + lapangan) tersedia lewat tombol "Isi ruang dari site plan" di Master Data. Ruang punya penanda "ikut dijadwalkan" (ruang guru/instruktur/teknisi = tidak); penempatan otomatis tidak memilih ruang yang tidak dijadwalkan kecuali disebut di ruang prioritas beban.
- Aturan ruang per mapel (keputusan Benny, 26 Nov): mapel umum memakai ruang teori dan boleh masuk bengkel/lab bila perlu; pengaturannya harus leluasa per mapel. Diterapkan sebagai kolom "Jenis ruang (berurutan)" di tabel Mapel (mis. `teori, praktik`; kosong = teori, praktik, lab; `lapangan` hanya bila disebut). Ruang prioritas per beban tetap mengalahkan pengaturan mapel. Penentuan ruang yang bukan ruang kelas (B2 studio, C2 gudang, D2 server) dan ruang ragu dicentang sendiri di Master Data ("ikut dijadwalkan"). Lab DKV (G3, I1, I3) untuk TE dalam kondisi tertentu diatur lewat ruang prioritas beban atau aturan ruang terlarang per jurusan.

### 11.5 Data sekolah dan solver (26 Nov 2026)

- **Data awal = data sekolah + jadwal reguler Gasal 2026/2027 dari aSc.** `data/sekolah/proyek.json`: 62 guru, 34 mapel, 30 rombel, 406 beban, 42 ruang, 3 aturan jurusan, dan versi Reguler berisi 1200 JP (25 rombel x 48 JP). Master awal dari `tafsirTugas` + `terapkanDataSekolah` (`src/model/sekolah.ts`); jadwal reguler dipasang oleh `terapkanRegulerAsc` (`src/io/imporAsc.ts`) dari `data/sekolah/sumber/reguler-gasal-2026.json`, hasil ekstraksi PDF Jadwal Kelas dan Jadwal Guru oleh `tools/ekstrak-asc-pdf.py` (kedua PDF cocok 1200 JP, tanpa selisih). Dibangun ulang dengan `TULIS_DATA=1 npx vitest run test/bangun-data.test.ts`. Tanpa NIP/tanggal lahir (dijaga tes). Data fiktif tetap ada untuk tes dan demo.
- **Koreksi sumber.** Data awal sebelumnya dibangun dari sheet Excel `Genap_Harizka`, yang ternyata rencana semester genap (kelas XII PKL), bukan Gasal. Kini beban 25 rombel dibangun dari jadwal reguler aSc (kenyataan di semester ini). Lima rombel XI yang tidak ada di PDF (XI AT 1, XI AT 2, XI DKV 3, XI TE 2, XI TE 3) memakai beban dari Excel (ketiga sheet DUK, draft oktober, Genap_Harizka sama untuk rombel ini) dan belum terjadwal. Alasan lima rombel itu tidak ada di PDF belum dikonfirmasi.
- **Kode guru:** 3 huruf. Kode yang sudah dipakai di jadwal-te dipertahankan (48 guru dicocokkan lewat dua kata pertama nama; ejaan Excel dan jadwal-te berbeda pada 11 nama). Sisanya usulan otomatis dari nama. Kode ARF di jadwal-te dipakai dua guru (Arif Indra Nugroho dan Ahmat Arifin): ARF untuk Arif Indra, Ahmat Arifin menjadi AHM. Laila Zuhaida ada di jadwal aSc dan sheet DUK tetapi tidak di Genap_Harizka; ditambahkan (kode LAI). Nama pada aSc dicocokkan dengan ejaan Excel lewat kunci longgar (`kunciLonggar`).
- **Ruang:** ruang kelas berkode `RK.` seperti di aSc dan jadwal-te. B2 (studio) dan D2 (ruang server) tidak ikut dijadwalkan sesuai keterangan Benny; C2 juga tidak dipilih otomatis, tetapi jadwal reguler memakainya untuk elemen TE (PRE, PISS, P4E, KIK), jadi C2 tercantum di ruang prioritas beban-beban itu. Ruang prioritas beban diturunkan dari jadwal reguler: bila sebuah mapel (per tingkat dan jurusan) di jadwal aSc tidak pernah memakai ruang teori, ruang praktik/lab yang dipakainya (urut menurut seringnya) menjadi ruang prioritas; selain itu dibiarkan bebas.
- **Ruang kelas tetap per rombel: tidak ada.** Jadwal reguler memakai banyak ruang RK untuk satu rombel (mis. X TE 1: RK.J1, RK.J2, RK.S2), jadi ruang teori diperlakukan sebagai kolam bersama.
- **Aturan ruang terlarang per jurusan** (bisa diubah di tab Aturan): TE tidak memakai lab AT dan DKV kecuali G3 dan I3; AT tidak memakai ruang praktik TE dan DKV; DKV tidak memakai ruang praktik TE dan AT. Jadwal reguler tidak melanggarnya (0 pelanggaran).
- **Mapel kejuruan (keterangan Benny):** DTE (fase E, kelas X) dan TAV (fase F, kelas XI dan XII) adalah mapel induk kompetensi keahlian (KK). Elemen DTE: DLE, DRE, TKB; elemen TAV: PRE, PMM, PSRT, PISAV, PISS (kolom Induk di Master Data). P4E adalah mata pelajaran pilihan (MPP) TE. Elemen mungkin digabung di masa depan, jadi beban boleh dipasang pada induk (dipakai XI TE 2 dan XI TE 3 yang belum punya pembagian elemen). "DRLE" pada aSc ditulis DRE. Untuk AT dan DKV, aSc memakai `dkk.AT` (DAT), `Teori.AT` (TAT, elemen DAT), `kk.AT`/`kk.DKV` (AT, DKV) dan `mppAT`/`mppDKV` (MPA, MPD; mapel pilihan, belum dipecah). Jenis ruang elemen TE di `JENIS_RUANG_MAPEL`.
- **PKL** tetap menjadi mapel (kode PKL, dihitung sebagai mapel; JP-nya masuk beban guru tetapi tidak menempati slot kelas). Tidak ada beban PKL pada Gasal; dipakai untuk Genap.
- **PJOK** belum memakai lapangan; jenis ruangnya default teori. Memakai lapangan cukup menambah `lapangan` pada kolom jenis ruang mapel PJO (lapangan boleh dipakai beberapa rombel sekaligus); dijaga tes.
- **Selisih 51/49 JP (Excel) dengan 48 JP (jadwal): terjawab.** Jadwal reguler menempatkan tepat 48 JP per rombel. Pada kelas X, Excel mencatat IPAS 6 JP (jadwal 5) dan KKA 2 JP yang tidak ada di jadwal; pada XI dan XII, KK 1 JP lebih sedikit di jadwal. Kolom "JP data sumber" tetap menampilkan angka Excel sehingga selisihnya terlihat. Lima rombel XI yang belum terjadwal masih membawa 49 JP (kapasitas 48), jadi 5 JP pasti tidak muat.
- **Pola kalender ASAS/ASAJ:** dibiarkan kosong (= mengikuti pola reguler). Periode ASAS pada jadwal-te memakai skema yang sama (11, 10, 10, 11, 9), jadi tidak ada pola khusus untuk diisi.
- **Solver (tahap 4, versi pertama):** `src/mesin/solver.ts`, dijalankan di Web Worker (`solver.worker.ts`), tab "Susun Otomatis". Satu beban dipecah menjadi pertemuan berurutan satu hari (`pola` bila jumlahnya cocok, selain itu pecahan bawaan: 4 = 2+2, 5 = 3+2, 6 = 3+3, 12 = 4+4+4, dst). Kelompok paralel satu unit. Aturan wajib tidak pernah dilanggar; yang tidak muat dilaporkan dengan alasan. Cara kerja: penempatan serakah dari yang tersulit, geser satu atau dua penghalang bila buntu, pecah pertemuan bila tidak muat, diulang acak, lalu penempatan ulang untuk menekan biaya kerapian.
- **Hasil pada data sekolah:** jadwal reguler aSc lolos validator (0 bentrok guru/rombel/ruang, 0 pelanggaran aturan, 0 slot di luar kapasitas, semua slot beruang). Solver dari nol (3 dtk, ruang prioritas ikut kenyataan): 1440 dari 1448 JP tertempatkan, 0 bentrok. Mode lengkapi dengan 1200 JP reguler dikunci: 1441 dari 1448 JP, 0 bentrok; sisa 7 JP (5 pasti karena kapasitas).
- **Belum:** preferensi berbobot yang bisa diatur, mode "saran" (AI), laporan ruang, adaptor skema khusus (ASAS), cetak, ekspor xlsx, peta kode yang bisa diedit sebelum menerapkan impor.

### 11.6 Pertanyaan terbuka

1. Mengapa XI AT 1, XI AT 2, XI DKV 3, XI TE 2, dan XI TE 3 tidak ada di PDF reguler (PKL?), dan apakah XI TE 1 yang ada di PDF sama dengan XI TE 1 yang berstatus PKL di jadwal-te?
2. Sheet Excel mana yang menjadi acuan Gasal (DUK, draft oktober, atau Genap_Harizka)? Ketiganya berbeda pada pembagian guru; jadwal aSc kini menjadi acuan untuk 25 rombel.
3. KKA (2 JP kelas X) dan 1 JP IPAS ada di Excel tetapi tidak di jadwal reguler: sengaja tidak dijadwalkan?
4. `mppAT` dan `mppDKV` pada aSc belum dipecah menjadi mapel nyata (di Excel: PTP, POHN, BC).
