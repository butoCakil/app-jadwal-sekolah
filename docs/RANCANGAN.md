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
  - `induk` dipakai untuk **elemen/sub-mapel**: pada TE, DTE (kelas X) → DLE, DRE, TKB dan TAV (kelas XI-XII) → PRE, PMM, PSRT, PISAV, PISS; P4E adalah mata pelajaran pilihan (MPP). Bisa dipecah, digabung, atau dikurangi kapan saja.
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
5. Elemen mapel bisa dipecah/digabung (TE: DTE → DLE, DRE, TKB; TAV → PRE, PMM, PSRT, PISAV, PISS; P4E = MPP; lihat 11.5). JP per elemen mengikuti jadwal reguler aSc.
6. AI mengikuti pola SIMBioTE (Gemini + Groq, multi-kunci, antrean, rantai fallback).
7. Ruang bisa berpindah, dengan daftar ruang terlarang per rombel/jurusan.
8. Publik hanya melihat versi yang diterapkan; admin bekerja di draf.
9. Repo berisi data yang diterapkan; NIP dan tanggal lahir tidak pernah ikut terbit.
10. Terapkan memakai token GitHub fine-grained yang hanya ada di perangkat admin.
11. Masuk mode admin: token GitHub + PIN.

### 11.2 Keputusan tambahan

1. **Tempat AI berjalan:** disepakati (26 Nov 2026) versi pertama di browser admin; endpoint di `superapp-te` menjadi pilihan lanjutan.
2. **Selisih kapasitas JP:** pola `[11,10,10,11,9]` dan `[10,10,11,11,9]` sama-sama 10+10+10+10+8 = **48 JP KBM**, sedangkan Excel mencatat X = 51 JP dan XI = 49 JP. Aplikasi menandai selisih ini (sesuai keputusan #2). Terjawab 26 Nov: jadwal reguler aSc menempatkan 48 JP per rombel; selisihnya ada di data Excel (lihat 11.5).

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
- **Selisih 51/49 JP (Excel) dengan 48 JP (jadwal): terjawab.** Jadwal reguler menempatkan tepat 48 JP per rombel. Contoh yang diperiksa: pada X AT 1 dan X TE 1, Excel mencatat IPAS 6 JP (jadwal 5) dan KKA 2 JP yang tidak ada di jadwal; pada XI AT 3 dan XII AT 1, KK 1 JP lebih sedikit di jadwal. Kolom "JP data sumber" tetap menampilkan angka Excel sehingga selisihnya terlihat. Lima rombel XI yang belum terjadwal masih membawa 49 JP (kapasitas 48), jadi 5 JP pasti tidak muat.
- **Pola kalender ASAS/ASAJ:** dibiarkan kosong (= mengikuti pola reguler). Periode ASAS pada jadwal-te memakai skema yang sama (11, 10, 10, 11, 9), jadi tidak ada pola khusus untuk diisi.
- **Solver (tahap 4, versi pertama):** `src/mesin/solver.ts`, dijalankan di Web Worker (`solver.worker.ts`), tab "Susun Otomatis". Satu beban dipecah menjadi pertemuan berurutan satu hari (`pola` bila jumlahnya cocok, selain itu pecahan bawaan: 4 = 2+2, 5 = 3+2, 6 = 3+3, 12 = 4+4+4, dst). Kelompok paralel satu unit. Aturan wajib tidak pernah dilanggar; yang tidak muat dilaporkan dengan alasan. Cara kerja: penempatan serakah dari yang tersulit, geser satu atau dua penghalang bila buntu, pecah pertemuan bila tidak muat, diulang acak, lalu penempatan ulang untuk menekan biaya kerapian.
- **Hasil pada data sekolah:** jadwal reguler aSc lolos validator (0 bentrok guru/rombel/ruang, 0 pelanggaran aturan, 0 slot di luar kapasitas, semua slot beruang). Solver dari nol (3 dtk, ruang prioritas ikut kenyataan): 1440 dari 1448 JP tertempatkan, 0 bentrok. Mode lengkapi dengan 1200 JP reguler dikunci: 1441 dari 1448 JP, 0 bentrok; sisa 7 JP (5 pasti karena kapasitas).
- **Belum:** preferensi berbobot yang bisa diatur, mode "saran" (AI), laporan ruang, adaptor skema khusus (ASAS), cetak, ekspor xlsx, peta kode yang bisa diedit sebelum menerapkan impor.

### 11.5b Tahap 5: master data, aturan ruang, kalender (27 Nov 2026)

- **Koreksi sumber (Benny, 27 Nov):** data guru memakai sheet Genap; Laila Zuhaida sudah pindah. Jadwal Gasal hanya acuan (ruang yang tersedia per kelas dan perilaku lain). Dataset: `genap-2027.json` (bawaan; 61 guru, 24 mapel, 30 rombel, 316 beban, jadwal kosong) dan `gasal-2026.json` (historis, masih memuat Laila). Dibangun oleh `src/model/bangunData.ts`; Genap dari Excel bila `XL_TUGAS` diset (`TULIS_DATA=1 XL_TUGAS=... npx vitest run test/bangun-data.test.ts`). Prioritas ruang dan pola beban Genap disalin dari beban Gasal yang (tingkat, jurusan, mapel)-nya sama.
- **Model:** `Ruang.kategori`, `Guru.mapelIds`, `Mapel.ruangIds` dan `Rombel.ruangIds` (daftar putih), aturan `guruRuang`, `JenisKegiatan` + ASAJ, `Kegiatan.catatan`, `Proyek.periodeAktifId`. `ruangDilarang` = ruang terlarang + komplemen semua daftar putih (rombel, mapel, guruRuang guru utama dan tim).
- **Periode = kegiatan kalender** dengan pola, `versiId`, dan `rombelTidakAktif` (PKL). Genap: k-genap, PKL XII, 3 Jan s.d. 18 Jun 2027 (dari p_genap jadwal-te). Gasal: TKA, ASAJ, TKA lanjutan, ASAS (X dan XII tidak aktif).
- **UI:** modal pemilih generik (`src/ui/pemilih.ts`; urutan klik dipertahankan untuk ruang prioritas), Master bertab, Beban bertab per rombel, kalender kotak + tabel + impor berkas (`src/io/imporKalender.ts`), skema jam bisa ditambah, bilah periode.
- **Format berkas kalender ditebak** (kolom Kegiatan + Tanggal atau Mulai/Selesai; rentang dalam satu sel); perlu contoh berkas asli Benny untuk memastikan.
- **Hasil uji Genap:** Susun Otomatis tanpa XII: 0 pelanggaran; 978 dari 1018 JP tertempatkan, 40 JP sisanya tepat sama dengan kelebihan kapasitas (beban kelas X dan XI di atas 48 JP/pekan).

### 11.5c Revisi 27 Nov 2026 (modal, pola bernama, hari kerja, dataset)

- **Hari kerja** = panjang `polaReguler` (5 atau 6); semua pola ikut. Hari baru memakai skema pertama. Solver, grid, validasi, dan kalender mengikuti. Hari non-kerja: rentang kegiatan tidak digambar; acara satu hari tetap tampil.
- **Pola bernama:** `polaReguler` tetap pola default (isi), dengan `polaRegulerId` dan `polaRegulerNama`; pola lain di `polaLain`. Menjadikan pola default menukar identitas dan isi sehingga rujukan `Kegiatan.polaId` tetap benar. Pola tertanam format lama (`Kegiatan.pola`) dipindah otomatis saat data dimuat (`migrasiPola`). Penggantian manual hanya tampil bila sudah ada (sebaiknya dilepas dan diganti pola pada kegiatan).
- **Modal kegiatan:** isian sementara (`ui.dlg`), validasi saat Simpan; memilih kelas tidak aktif (centang per tingkat/jurusan), pola, versi jadwal (atau buat versi baru), catatan, jadikan periode aktif.
- **Dataset tersimpan:** IndexedDB store `dataset` (basis data versi 2). Master Data > Data: simpan draf sebagai dataset, muat, timpa, ganti nama, hapus, dan buat semester baru (master, beban, aturan, skema, pola dipertahankan; jadwal dan kalender dikosongkan). Data bawaan Genap/Gasal/contoh tetap ada.

### 11.5d Revisi 27 Nov 2026 (grid, beban per periode, kategori mapel)

- **Grid:** tab "Per kelas/guru/ruang" dan "Semua". Pada "Semua" pemilih fokus hilang dan daftar "Belum terjadwal" memuat semua beban aktif yang belum penuh, dikelompokkan per kelas (atau guru); kartu hanya sah dilepas pada baris pemiliknya. Pada tampilan per entitas ada panah ◀ ▶ untuk berpindah kelas/guru/ruang. Kolom jam dirapatkan (34 px, huruf 8 px).
- **Beban per versi jadwal:** `Beban.versiId` opsional. Kosong = berlaku di semua versi (data lama tidak berubah); terisi = hanya untuk versi itu. `Turunan.beban` = beban yang berlaku pada tanggal acuan; grid, tab Beban, Susun Otomatis, dan pemeriksa memakainya (`bebanUntukVersi`, `proyekUntukVersi`). `tambahVersi` menyalin beban khusus versi bersama slotnya.
- **Impor jadwal-te:** `dariJadwalTe` mengubah berkas jadwal-te (v1) menjadi `Proyek`: tiap periode menjadi kegiatan kalender; periode dengan isi identik berbagi satu versi; rombel tanpa tugas pada periode itu atau berstatus PKL dinyatakan tidak aktif. Nomor jam periode yang menghitung baris Pembiasaan sebagai jam ke-1 digeser −1 (dilaporkan). Gasal bawaan dibangun dari `data/sekolah/sumber/jadwal-te-gasal-2026.json`.
- **Kategori mapel:** `Mapel.kategori` opsional; bila kosong diturunkan dari kode (Normatif, Adaptif, Jurusan AT/DKV/TE, selain itu "Belum dikategorikan"); elemen mengikuti induknya. Pemilih "Mapel yang diampu" dikelompokkan menurut kategori dengan sub-kelompok elemen.
- **Kalender:** kotak tanggal memakai titik warna per jenis kegiatan; penanda "grid" = tanggal acuan Grid, dan acuan awal periode maju ke hari kerja pertama.

### 11.5e Induk dan kegiatan (27 Nov 2026, siang)

- **Keputusan Benny:** satu semester = periode induk dengan jadwal reguler; kegiatan (TKA, ASAS, ASAJ, UKK, TOEFL, ...) berada di dalamnya dan berlaku otomatis sesuai tanggal; selesai kegiatan kembali ke induk. Beban kegiatan mewarisi induk lalu diubah khusus (induk tidak terdampak). Kelas yang tidak terdampak mengikuti induk langsung (minim gubahan). Kegiatan bisa satu rentang atau hanya hari tertentu.
- **Model** (`src/model/simpul.ts`): `Proyek.semester` (nama, mulai, selesai, kelas tidak aktif di luar kegiatan); `Kegiatan.rombelTerdampak` (kosong = data lama, semua kelas dari versi kegiatan) dan `Kegiatan.hariBerlaku`; `Beban.asal` (beban induk yang digantikan) dan `Beban.dihapus`.
- **Jadwal per hari:** kelas terdampak dari versi kegiatan hari itu, kelas aktif lain dari induk, kelas tidak aktif disembunyikan. Pemeriksa bentrok memeriksa gabungannya. Kelas tidak aktif mengikuti kegiatan terspesifik (menggantikan, bukan menggabungkan).
- **Salin-saat-ubah:** mengubah jadwal atau beban kelas yang ikut induk dari dalam kegiatan menyalin jadwal induk kelas itu ke kegiatan lalu menerapkan perubahan; induk tidak berubah. "Ikut induk" mengembalikannya. Pada fokus kegiatan, perubahan di hari yang tidak diatur kegiatan ditolak.
- **UI:** tab pertama "Periode & Jadwal" = pohon (Menurut tanggal, Induk, kegiatan) + sub-tab Info, Kelas (ikut induk / khusus / tidak aktif), Beban (tanda induk/diubah/tambahan, tombol kembalikan), Grid. Modal kegiatan: nama, jenis, tanggal, hari berlaku, pola jam, catatan. Bagian PKL di Master Data dihapus. Kalender menautkan ke halaman inti. Inspector dan Susun menampilkan sasaran; Susun pada kegiatan mempertahankan kelas yang ikut induk.
- **Data Gasal** disusun ulang (`strukturGasalJadwalTe`): induk 12 Jul–18 Des 2026 dari periode p_tka/p_tka2; kegiatan ASAJ (9 kelas khusus, 4 tidak aktif) dan ASAS (5 kelas XI khusus, 8 tidak aktif, 240 JP, 0 bentrok). Periode Genap dibuang dari data Gasal. Temuan data sumber: reguler X TE 1 IPAS Selasa jam 6–10 di N2 (ruang terlarang untuk TE); ASAJ XI TE 2 PMM lebih 1 JP.
- **Tahap berikut:** aturan per kegiatan (ruang terkunci: lab untuk TKA/TOEFL, ruang teori untuk ujian, bengkel untuk UKK; guru pengawas tidak boleh mengajar), lalu Susun/AI per kegiatan dengan prompt (mis. menggandakan JP mapel TKA dan mengurangi kejuruan).

### 11.5f Dua semester, Jadwal Berlangsung, kegiatan dari PDF aSc (27 Nov 2026, sore)

- **Keputusan Benny:** induk = semester (Gasal dan Genap masing-masing induk); halaman grid besar tetap ada sebagai **Jadwal Berlangsung** (calon tampilan publik); induk bisa diciutkan dengan keterangan kegiatan yang berlangsung; pohon bisa disembunyikan agar grid selebar layar.
- **Model:** `Proyek.semesters[]` (`id, nama, mulai, selesai, rombelTidakAktif, versiId`); beban induk semester = beban bertanda `versiId` semester itu (beban tanpa tanda milik semester pertama); `Kegiatan.semesterId` (kosong = semester yang memuat tanggal mulainya). Fokus `sem:<id>`. Format lama `Proyek.semester` dipindah otomatis (`migrasiPola`). Jadwal per hari memakai induk semester hari itu.
- **Ekstraksi:** `tools/ekstrak-asc-kelas.py` membaca PDF Jadwal Kelas aSc (ukuran huruf relatif terhadap angka kolom; nomor jam per hari: kolom 1 berisi pelajaran = skema tanpa pembiasaan; kartu PJJ/TKA sehari penuh = tidak belajar di sekolah; rombel bertanda PJJ). Nama guru diambil dari PDF Jadwal Guru bila terbaca, selain itu dari kartu kelas (nama terpotong dicocokkan lewat kata pertama atau guru mapel yang sama). Hasil di `data/sekolah/sumber/asc-2026/`.
- **Data Tahun 2026/2027** (`bangunTahun`, `sumberTahun.ts`, `tahun-2026.json`, bawaan aplikasi): induk Gasal = reguler 9–13 Nov (25 rombel, 1200 JP; XI AT 3, XI AT 4, XI DKV 1, XI DKV 2, XI TE 1 tidak aktif). Kegiatan: Pemadatan TKA 29 Sep–23 Okt (pola 11,11,11,11,9; 22 kelas khusus), TKA Gel. 1 26–30 Okt (pola 10,10,10,10,8 tanpa pembiasaan; 15 kelas PJJ/TKA Sen–Kam), TKA Gel. 2 2–6 Nov (pola 10,10,10,10,9; 10 kelas PJJ tanpa ruang, 5 kelas XII TKA Sen–Kam), ASAJ 16–20 Nov (2 kelas khusus, 13 ikut induk, XII tidak aktif), UKK 23–27 Nov (pola 10,10,11,11,9), ASAS 30 Nov–4 Des (5 kelas XI). Induk Genap 3 Jan–18 Jun 2027: beban sheet Genap, jadwal kosong, XII PKL.
- **Temuan data sumber:** Pemadatan: guru NJT ganda Selasa jam 6 (X AT 1 dan XI AT 2 PA) dan X TE 1 IPAS di N2 (terlarang untuk TE); ASAS XI DKV 3 Rabu jam 4 kosong; UKK XI TE 2/3 kkTE dan mppTE diajar "Guru TE" (ditambahkan sebagai guru GUR). Waktu jam pekan TKA memakai skema yang ada (skema 10 = 45 menit), padahal PDF TKA memakai 40 menit.
- **Lanjutan (27 Nov, 13.30):** PKL kelas XI sampai 12 Des 2026, lalu sekitar 14 Des kelas XII PKL; kegiatan `k-pkl-xii-gasal` (14–18 Des, XII tidak aktif, kelas lain ikut induk). Genap: kegiatan PKL XII 4 Jan–16 Apr 2027; induk Genap tanpa kelas tidak aktif. Rentang semester mengikuti kalender akademik: Gasal 13 Jul–18 Des 2026 (rapor), Genap 4 Jan–18 Jun 2027. Kalender akademik 2026/2027 (56 baris) dimuat sebagai **agenda** (`Kegiatan.agenda`, `untuk`): tampil di kalender dan bilah Agenda pada Jadwal Berlangsung, tidak mengubah jadwal, pola, kelas aktif, atau KBM. Jenis baru: ujian, upacara, rapor.
- **Belum pasti:** tanggal pergantian rombel XI (PKL) antara jadwal reguler Juli (PDF 16 Jul) dan jadwal 9–13 Nov; kini induk Gasal sepanjang semester memakai jadwal 9–13 Nov.

### 11.5g Aturan per kegiatan (27 Nov 2026, siang; langkah 1 menyempurnakan engine)

- **Urutan kerja (disepakati):** engine dulu (aturan per kegiatan, solver per kegiatan, uji dengan data nyata, lalu lapisan AI), baru akses admin dan halaman publik. Rencana hosting akhir: tetap di GitHub Pages, `jadwal.smknbansari.sch.id` diarahkan lewat CNAME (belum diputuskan; cadangan: server-te).
- **Model (`Kegiatan`):** `ruangKunci[]` (`ruangIds`, `hari`, `mulai`/`selesai` jam dinding, `catatan`): ruang yang dipesan kegiatan, tidak boleh dipakai pelajaran lain pada hari/jendela itu; `pengawas[]` (`guruId`, `tanggal`, `mulai`, `selesai`, `ruangId?`): guru yang mengawas tidak boleh mengajar pada JP yang beririsan dengan waktunya (diubah ke nomor JP menurut skema hari itu); `rombelTanpaRuang[]`: rombel PJJ, tidak dilaporkan "belum punya ruang". Peserta kegiatan (mis. XII yang UKK) sudah tidak aktif, jadi tidak perlu pengecualian.
- **Satu sumber aturan:** `aturanPekan()` (`src/model/aturanKegiatan.ts`) menurunkan aturan per hari untuk pekan yang dilihat; dipakai validator (pelanggaran baru `ruang-dikunci`, `pengawas-bentrok`), penempatan/seret jadwal (`tentukanRuang`, `cekPenempatan`, `rencanaPindah`), dan solver (ruang terkunci = ruang terpakai, pengawas = guru tidak tersedia).
- **UI:** kartu "Aturan kegiatan" di Info kegiatan (Periode & Jadwal): kunci ruang lewat pemilih centang per kategori ruang, hari dan jam, catatan; rombel tanpa ruang; tugas mengawas per tanggal.
- **Diterima:** pelanggaran bisa ditandai "diterima" (keputusan lapangan) di Conflict Inspector: tidak dihitung sebagai bentrok, tetap terlihat dengan catatan. Disimpan di `Proyek.diterima[]` dikenali dari pesannya, sehingga bila jadwal berubah keputusan itu gugur sendiri.
- **Data:** jadwal pengawas ASAS (PDF "6. JADWAL PENGAWAS", 286 tugas, 22 ruang ujian, 3 jendela waktu) dimuat dari `data/sekolah/sumber/pengawas-asas-2026.json` (tanpa NIP); rombel PJJ TKA gel. 2 dimuat dari tanda PJJ aSc. **Uji nyata:** pekan ASAS hanya menghasilkan satu bentrok pengawas, yaitu PSRT XI TE 2 (guru EDW, Kamis jam 3–6), persis kasus yang Benny sebut; sudah ditandai diterima.
- **Temuan dan keputusan (27 Nov, 14.20):** PSRT XI TE 2 Kamis jam 3–6 memakai D1, yang di jadwal pengawas juga ruang ujian (D.1): Benny memutuskan pindah ke B3 (kosong jam itu); diterapkan lewat `PENYESUAIAN_2026` pada pembangun data. Bentrok EDW dengan tugas mengawas tetap diterima dengan catatan "EDW memberi tugas ke siswa saat mengawas ASAS". Pekan ASAS kini 0 bentrok, 4 info diterima. Penerimaan juga bisa dilakukan dari dialog slot di grid (tombol Terima…, isian awal catatan "KODE memberi tugas ke siswa"); sel bertanda ℹ biru.
- **Uji solver pada kasus ini:** PSRT XI TE 2 dikosongkan lalu Susun Otomatis (mode lengkapi) dengan aturan kegiatan: tidak menempatkannya dan melapor tidak muat, karena ruang prioritas beban itu hanya D1 (terkunci pada jam ujian) dan EDW mengawas Sen, Sel, Kam jam 1–6. Solver tidak memaksakan pelanggaran.
- **Solver per kegiatan, langkah 2a (27 Nov, 14.40):** alasan sisa kini memeriksa tiap waktu terhadap semua penyebab sekaligus dan melaporkan jumlahnya, mis. untuk PSRT XI TE 2: "jam XI TE 2 sudah terisi pada 44; ruang (D1) terkunci kegiatan pada 39; guru EDW sedang mengawas pada 24; guru EDW sudah mengajar pada 4; ruang (D1) terpakai pada 4. Ruang beban ini dibatasi ke D1; bila boleh ruang lain, ubah ruang prioritasnya di tab Beban." Ruang prioritas per kegiatan ternyata sudah bisa ditimpa: mengubahnya dari tab Beban pada sebuah kegiatan memakai salin-saat-ubah (beban induk tidak berubah).
- **Pola pemakaian ruang di PDF aSc (belum dimuat sebagai kunci; ditunda oleh Benny):** TKA gel. 1: G1, G2, G3, I3, Q hanya terpakai hari Jumat; UKK: B3, C1, D1, G3, I3, Q kosong sepanjang pekan.
- **Ditunda:** target beban (pemadatan) tidak ada aturan khusus: beban per kegiatan sudah bisa diubah di tab Beban, dan permintaan seperti "gandakan jam mapel TKA" masuk lapisan AI (langkah 4).

### 11.5h Tolok ukur solver pada kegiatan nyata (27 Nov 2026, malam; langkah 3)

- **Cara:** `test/benchmark-kegiatan.test.ts` (jalan dengan `BENCH=1 npx vitest run test/benchmark-kegiatan.test.ts`; laporan ke `/tmp/bench.json`). Tiap kegiatan nyata disusun ulang dari nol oleh solver untuk kelas terdampak, dengan aturan kegiatan (ruang terkunci, pengawas, PJJ); kelas yang ikut induk dipertahankan; jadwal aSc menjadi pembanding. Solver kini juga menghormati rombel tanpa ruang (PJJ).
- **Hasil (batas 8 dtk, 0 pelanggaran aturan wajib pada semua kegiatan):**

| Kegiatan | Kelas | Kebutuhan JP | Jadwal aSc | Solver | Sisa solver |
|---|---|---|---|---|---|
| Pemadatan TKA | 22 | 1056 | 1009 (9 pelanggaran) | 1054 | 2 |
| TKA Gel. 1 | 25 | 595 | 595 | 595 | 0 |
| TKA Gel. 2 | 25 | 1000 | 1000 | 999 | 1 |
| ASAJ Praktik XII | 2 | 96 | 96 | 96 | 0 |
| UKK XII | 15 | 720 | 720 | 720 | 0 |
| ASAS | 5 | 239 | 239 (4 JP bentrok pengawas, diterima) | 231 | 8 |

- **Bacaan:** pada Pemadatan solver menempatkan lebih banyak JP daripada aSc dan tanpa pelanggaran (aSc meninggalkan 47 JP tak terjadwal dan 9 pelanggaran). Pada TKA dan UKK hasilnya setara. Satu-satunya yang kalah dari aSc adalah ASAS: solver menyisakan 8 JP, padahal aSc menempatkan semuanya (hanya 4 JP PSRT XI TE 2 yang bentrok dengan pengawas dan sudah diterima). PSRT XI TE 2 sendiri tidak termasuk sisa solver. Sisanya: 3 JP XI TE 2 dan 3 JP XI TE 3 (beban yang dibatasi ke ruang I1, terkunci saat ujian, dan guru AZZ yang banyak mengawas) serta 2 JP XI AT 2 (guru YDH mengawas). Hasil tidak berubah dengan waktu 30 dtk dan tiga benih berbeda, jadi ini macet pada optimum lokal, bukan kekurangan waktu.
- **Belum diukur:** kerapian (jam kosong guru, sebaran mapel), karena belum ada preferensi berbobot.
- **Langkah berikutnya untuk solver:** dikerjakan pada 11.5i (jadwal awal, rantai geser, ruang prioritas lunak).

### 11.5i Solver langkah 2b: jadwal awal, rantai geser, ruang prioritas lunak (27 Nov 2026, malam)

- **Temuan penyebab sisa ASAS:** jadwal aSc ASAS menempatkan P4E, PMM, dan lainnya di B3 padahal ruang prioritas beban itu hanya I1 atau D1 (ruang ujian, terkunci). Jadi di lapangan ruang prioritas adalah pilihan utama, bukan syarat mutlak, sedangkan solver memperlakukannya wajib (aturan 11.4 #1, usulan awal saya). Itu penyebab 8 JP sisa, bukan keterbatasan pencarian.
- **Opsi baru solver (`OpsiSusun`):**
  - `prioritasLunak`: ruang prioritas = pilihan utama; bila penuh atau terkunci, boleh ruang lain yang diizinkan (jenis ruang mapel, tanpa ruang terlarang) dengan biaya 8 per pemakaian. Bawaan solver tetap wajib; di UI Susun Otomatis kotak centang "Ruang prioritas boleh diganti" aktif secara bawaan (mengikuti keputusan Benny soal B3 dan kenyataan jadwal aSc), bisa dimatikan.
  - `awal`: jadwal awal (jadwal induk). Tiap pertemuan ditempatkan di posisi semula bila sah menurut aturan kegiatan; yang tidak sah diganti. Memindahkan pertemuan dari posisi awal berbiaya 40, sehingga yang bergeser hanya yang perlu atau yang jelas lebih rapi. Berbeda dari `tetap` (tidak boleh digeser). UI: cara "Mulai dari jadwal induk" (hanya muncul pada kegiatan).
  - `kedalaman`: rantai geser. Penghalang yang ikut buntu menggeser penghalangnya sendiri sampai kedalaman tertentu (UI memakai 3), dengan pemulihan penuh bila gagal.
- **Hasil tolok ukur ulang (prioritas lunak, kedalaman 3, 0 pelanggaran, semua kegiatan sisa 0):**

| Kegiatan | Kebutuhan JP | Dari nol | Dari jadwal induk | Slot induk bergeser |
|---|---|---|---|---|
| Pemadatan TKA | 1056 | 1056 | 1056 | 151 dari 976 |
| TKA Gel. 1 | 595 | 595 | 595 | 80 dari 670 |
| TKA Gel. 2 | 1000 | 1000 | 1000 | 37 dari 1036 |
| ASAJ Praktik XII | 96 | 96 | 96 | 0 dari 92 |
| UKK XII | 720 | 720 | 720 | 65 dari 591 |
| ASAS | 239 | 239 | 239 | 134 dari 240 |

- **Kontribusi tiap perubahan (tanpa lunak, dari nol):** rantai geser (kedalaman 3) saja menutup sisa Pemadatan dan TKA Gel. 2 (2 dan 1 JP). Sisa ASAS 8 JP hanya tertutup oleh prioritas lunak. ASAS kini lebih baik daripada aSc: 239 JP tanpa bentrok pengawas (aSc 4 JP bentrok).
- **Angka "bergeser"** menghitung slot induk yang tidak muncul pada waktu yang sama; sebagian besar wajar karena beban dan pola jam kegiatan memang berbeda dari induk (ASAS: hanya 5 kelas dengan beban ujian khusus).
- **Belum:** kerapian belum diukur (preferensi berbobot belum ada); ruang cadangan yang dipakai belum ditandai di hasil (perlu agar admin tahu beban mana yang pindah ruang).

### 11.5j Ruang prioritas menurut konteks, penanda ruang pindah (27 Nov 2026, malam)

- **Keputusan Benny:** kelonggaran ruang prioritas bergantung pada situasi. Pada kegiatan (mis. ASAS memperbolehkan PART ke B3 karena ruang lain sudah habis, dan kegiatan itulah prioritasnya) ruang prioritas lunak. Pada jam reguler ruang prioritas lebih ketat; tidak mutlak 100% karena SMK memang kekurangan ruang atau ruang sangat pas, tetapi cadangan bukan pilihan yang diambil sembarangan.
- **Dilaksanakan:** `prioritasLunak` kini boleh bernilai `'bilaPerlu'`. Solver menyusun dulu dengan ruang prioritas wajib (60% waktu); hanya bila ada JP yang tidak muat, menyusun lagi dari hasil pertama dengan ruang cadangan berbiaya 60 (`biayaRuangCadangan`, bawaan 8 untuk kegiatan), lalu memakai hasil yang lebih penuh. UI Susun Otomatis: pada kegiatan = lunak biasa (8), pada jadwal reguler = 'bilaPerlu'; kotak centang tetap bisa dimatikan (wajib mutlak).
- **Pengukuran pada Gasal 2026/2027 reguler (346 beban, 1200 JP, kedalaman 3):** ruang prioritas wajib sudah menempatkan 1200/1200 JP tanpa ruang pindah. Dengan lunak (biaya 8 hingga 120) hasilnya juga 1200/1200 tetapi 71 sampai 82 JP berpindah ke ruang cadangan tanpa keuntungan nyata; karena itu reguler memakai 'bilaPerlu', bukan lunak penuh.
- **Penanda ruang pindah:** `ruangDiluarPrioritas(p, slots)` mendaftar beban yang sebagian pertemuannya berada di luar ruang prioritas. Panel hasil Susun Otomatis menampilkan tabel "N beban memakai ruang di luar prioritas" (kelas, mapel, guru, JP, ruang prioritas → ruang dipakai).
- **Perbaikan terkait:** panel hasil kini mencari beban pada beban yang benar-benar dipakai menyusun (pada kegiatan: beban kegiatan), bukan `p.beban` induk; sebelumnya sisa beban kegiatan bisa tidak tampil.

### 11.5k Langkah 4: lapisan AI (27 Nov 2026, malam)

- **Prinsip (tetap):** AI hanya mengusulkan **instruksi terstruktur**; kode memvalidasi dan menerapkan; admin memutuskan Terapkan atau Tolak. AI tidak pernah menulis slot jadwal. Solver menyusun, validator memeriksa.
- **Modul (`src/ai/`):**
  - `instruksi.ts`: kosakata instruksi (`ubahJp`, `hapusBeban`, `tambahBeban`, `ruangBeban`, `guruTidakTersedia`, `ruangTerlarang`, `kunciRuang`, `susun`), pengurai yang menolak bentuk salah atau bidang asing, pemetaan KODE ke id (kode tidak dikenal = galat, tidak ditebak), dan penerapan **semua-atau-tidak-sama-sekali** dengan fungsi yang sama dengan tab Beban (salin-saat-diubah pada kegiatan; kelas yang bebannya diubah menjadi kelas terdampak dan itu diberi tahu). Pratinjau (`rencanakan`) bekerja pada salinan.
  - `klien.ts`: klien Gemini untuk browser (instruksi sistem, riwayat, keluaran JSON), pemilahan galat (menit, harian, kunci tidak sah, model tidak ada, sibuk) dan pembacaan batas dari balasan 429; dipindahkan dari `superapp-te/apps/api/src/modules/ai/gemini.ts`.
  - `rotasi.ts`: rotasi kunci x model meniru `layanan.ts` superapp-te: model utama dicoba di **semua kunci** dulu, baru model cadangan; batas per menit dan per hari per kunci x model (bawaan model rekomendasi, diganti batas dari Google bila ada), jatah harian direset menurut waktu Pasifik, kunci tidak sah dinonaktifkan, status tersimpan di IndexedDB. Daftar model bawaan sama dengan superapp-te (`gemini-3.5-flash-lite`, `gemini-3.1-flash-lite`, lalu model lain); bisa diubah di Pengaturan.
  - `brankas.ts`: kunci API terenkripsi PIN (PBKDF2-SHA256 250.000 iterasi + AES-GCM) di IndexedDB; PIN tidak disimpan, kunci terbuka hanya di memori tab. Keputusan 11.1 #10 (kunci tidak masuk repo) terpenuhi.
  - `prompt.ts`: instruksi sistem (aturan keras, kosakata, bentuk JSON) dan ringkasan data **hanya berisi kode** (tanpa nama lengkap, NIP, tanggal lahir); potret data untuk mendeteksi perubahan admin.
  - `sesi.ts`: percakapan dengan memori sesi (riwayat teks tanpa data; data terbaru disisipkan di pesan terakhir). Hal di luar percakapan dikirim ke AI sebagai catatan sistem: admin menerapkan atau menolak usulan, mengubah data sendiri, hasil penyusunan. Bila validator menolak usulan, AI diberi satu kesempatan memperbaiki sebelum admin melihatnya.
- **UI:** tab **Asisten AI** (`src/ui/ai.ts`): buat atau buka brankas dengan PIN, ruang chat, kartu usulan (daftar perubahan, peringatan, Terapkan atau Tolak), dan Pengaturan (kunci, model utama dan cadangan, batas per menit dan per hari, pemakaian per kunci x model, galat terakhir, ganti PIN). Menerapkan usulan memeriksa ulang pada data saat ini; bila ada instruksi `susun`, penyusunan dijalankan dengan pilihan itu dan hasilnya tetap harus diterapkan admin di tab Susun Otomatis.
- **Batasan yang disengaja:** (1) `guruTidakTersedia` dan `ruangTerlarang` adalah aturan global (belum ada aturan per kegiatan), jadi hanya diterima pada jadwal induk; `kunciRuang` hanya pada kegiatan. (2) Solver belum mengenal preferensi berbobot (mis. praktik pagi): permintaan itu masuk "belum didukung", tidak diakali. (3) Belum ada instruksi tingkat slot (tempatkan, pindah, tukar); sementara lewat Grid. (4) Penyedia Groq belum dipasang (hanya Gemini); antarmuka `KlienAi` siap untuk itu.
- **Pengujian:** 223 tes, termasuk alur utuh tab Asisten AI dengan DOM minimal dan Gemini palsu (buat brankas, kirim, usulan, terapkan, catatan keputusan ikut pesan berikutnya, kunci ditolak). **Belum diuji dengan Gemini sungguhan** (butuh kunci Benny) dan belum dilihat di peramban.

### 11.5l Halaman publik (28 Nov 2026)

- **Alamat:** halaman publik di alamat utama (`/`), admin di `#/admin` (pindah antar keduanya memuat ulang halaman; kode admin dimuat terpisah sehingga halaman publik ringan di ponsel: sekitar 17 kB, bukan 1 MB). Admin punya tombol "Halaman publik"; halaman publik punya tautan kecil "Admin" di kaki.
- **Data terbit:** `data/terbit/jadwal.json` (`src/terbit/format.ts`), berbentuk `{format, versi, diterapkan, proyek}`. `bangunTerbit()` menyaring data kerja: aturan, pelanggaran yang diterima, ruang terkunci, tugas pengawas, rombel tanpa ruang, daftar putih ruang, prioritas dan larangan ruang, pola pertemuan, dan **catatan kegiatan** tidak ikut. Struktur tetap `Proyek`, jadi fungsi jadwal yang sama dipakai admin dan publik (jadwal publik = jadwal admin, dijaga tes). `periksaPrivasi()` menolak kunci bernama NIP/lahir/token dan angka mirip NIP (16 sampai 18 digit); bila ada, `bangunTerbit` melempar galat.
- **Temuan saat uji tampilan:** catatan kegiatan (sumber PDF, keputusan lapangan) sempat tampil di banner halaman publik. Catatan itu catatan admin, jadi tidak diterbitkan; kegiatan belum punya "keterangan publik" terpisah (bisa ditambah bila perlu).
- **Penyajian berkas:** plugin Vite `terbit` menyajikan berkas itu sebagai `terbit/jadwal.json` (dev dan hasil build), jadi commit ke `data/terbit/` memicu deploy dan halaman publik membacanya dari asal yang sama (aman untuk CNAME nanti). Halaman publik memuat dengan `cache: 'no-cache'`.
- **Tampilan (mobile-first):** pilih Kelas, Guru, atau Ruang; pilihan entitas (daftar bawaan peramban, kelas dikelompokkan per tingkat); tanggal dengan panah sebelumnya/berikutnya (melompati akhir pekan), "Hari ini", dan pemilih tanggal; **Per hari** (kartu per blok pelajaran dengan waktu, guru, ruang, penanda "sedang berlangsung" untuk hari ini, istirahat sebagai pita) dan **Per pekan** (tabel pelajaran ke-n x hari, lima kolom muat di layar 390 px). Banner untuk libur, akhir pekan, kelas yang tidak belajar di sekolah (PKL/PJJ), kegiatan yang berlangsung, dan agenda kalender akademik. Pilihan terakhir disimpan di peramban dan di alamat (`#/?m=..&id=..&t=..&v=..`) sehingga bisa dibagikan.
- **Data awal terbit:** dibangun dari data Tahun 2026/2027 bawaan (`TULIS_TERBIT=1 npx vitest run test/terbit.test.ts`). Nama guru, kode, dan jadwal itu sudah ada di repo publik sebelumnya.
- **Pengujian:** 239 tes (16 baru: privasi, bolak-balik JSON, 48 JP per kelas, konsistensi kelas/guru/ruang, status hari, pelolosan HTML, pemuatan gagal) dan dilihat di Chrome ukuran ponsel (390 px).
- **Belum:** tombol Terapkan (token GitHub + PIN) yang membuat berkas terbit dari admin; cetak dan unduh dari halaman publik; perapian UI ponsel (menunggu review Benny); keterangan publik per kegiatan.

### 11.5m Revisi halaman publik setelah dicoba di ponsel (28 Nov 2026)

Masukan Benny setelah melihat di ponsel dan perubahannya:
- **Tab Semua (tampilan awal):** matriks semua kelas (atau guru, atau ruang) x semua hari, tiap hari memakai kolom skema harinya sendiri (pembiasaan, pelajaran, istirahat sebagai kolom sempit hijau). Jam berurutan dengan mapel dan ruang sama digabung (colspan) dan terpotong istirahat. Kode di kotak = mapel (kelas pada baris guru/ruang); sentuh kotak untuk rincian (lembar bawah: waktu, jam ke-, mapel, guru, ruang). Kelas yang tidak belajar di sekolah diarsir. Pilihan: baris Kelas/Guru/Ruang; **zoom** Peta (muat satu layar, hanya warna), Sedang, Besar; dan **filter hari**: memilih satu hari membuat seluruh kelas muat di layar ponsel tanpa geser, dengan huruf terbaca. Kepala tabel dan kolom nama menempel saat digeser.
- **Panah geser** (kiri/kanan) di samping pilihan kelas, guru, dan ruang.
- **Per pekan kembali ke bentuk grid awal:** baris Pagi (pembiasaan dengan singkatan **PMB**, hanya pada hari bersekema 11 dan 9), baris pelajaran ke-n, dan baris istirahat; jam berurutan dengan guru dan mapel sama menjadi satu kotak (rowspan); istirahat memotong kotak; skema tiap hari tampil di kepala kolom. Pada skema 10 baris Pagi kosong dan pelajaran pertama langsung di baris 1. Per hari: pembiasaan ditampilkan dengan singkatannya.
- Singkatan non-KBM: Pembiasaan = PMB, Upacara = UPC, selain itu tiga huruf pertama; legenda tampil di bawah tabel.
- **Bawaan pertama kali dibuka:** tab Semua, semua hari, zoom Sedang; setelah itu pilihan terakhir diingat di peramban.
- Pengujian: 246 tes, dan dilihat di Chrome ukuran ponsel (390 px).
- **Nomor jam di tabel per pekan (revisi 28 Nov, keputusan Benny):** di tampilan publik nomor jam mengikuti poster skema hari itu: pada skema 11 dan 9 pembiasaan adalah jam 1 dan pelajaran pertama jam 2; pada skema 10 pelajaran pertama jam 1. Karena istirahat tiap skema jatuh pada posisi berbeda terhadap nomor poster, baris tetap diratakan menurut urutan pelajaran (supaya istirahat sejajar dan kotak terpotong benar), dan **tiap hari punya lajur nomor kecil sendiri** di kiri kolomnya. Tampilan admin tetap memakai penomoran internal.
- **Cache versi lama (28 Nov):** GitHub Pages menyimpan index.html di cache peramban beberapa menit, sehingga pengunjung bisa melihat kode lama setelah pembaruan (data terbit tidak terdampak karena `no-cache`). Build menulis `versi.json` (penanda build); halaman membandingkannya dengan penandanya sendiri saat dibuka dan setiap kali kembali terlihat (paling sering tiap 5 menit). Bila berbeda, halaman memuat ulang sekali lewat alamat `?v=<penanda>` (kunci cache baru, hash dipertahankan); bila masih berbeda muncul tombol Muat ulang. Tidak aktif di mode dev. Pilihan tampilan yang tersimpan (kelas, tab, zoom) tidak ikut hilang.
- **Keputusan Benny (28 Nov):** token GitHub untuk Terapkan disimpan di brankas PIN yang sama dengan kunci Gemini (satu PIN). Urutan: Terapkan, lalu perapian UI, lalu hosting.

### 11.5n Terapkan ke repo (28 Nov 2026)

- **Tab Terapkan** di admin: (1) ringkasan yang akan terbit (jumlah kelas, guru, ruang, semester, kegiatan, ukuran) dan waktu versi yang sedang tayang, (2) pemeriksaan, (3) akses ke repo, (4) tombol Terapkan dengan catatan opsional yang masuk ke pesan commit.
- **Gerbang** (`src/terbit/gerbang.ts`): memeriksa semua pekan semua semester dengan validator yang sama dengan Conflict Inspector (termasuk aturan kegiatan; pelanggaran yang sudah "diterima" tidak dihitung). Bawaan hanya pekan yang belum berakhir (pekan lampau tidak perlu memblokir terbit; kotak centang untuk memeriksa semuanya). Bila ada pelanggaran, Terapkan nonaktif kecuali admin menyalakan "Terapkan meskipun masih ada N pelanggaran" (keputusan sadar). 47 pekan diperiksa sekitar 0,2 detik. Pada data sekarang pekan 28 Sep sampai 23 Okt (Pemadatan) memang membawa temuan sumber (NJT ganda, X TE 1 IPA di N2), sehingga hanya terlihat bila pekan lampau ikut diperiksa.
- **Brankas bersama** (`src/ui/brankasSesi.ts`): satu PIN membuka kunci Gemini dan token GitHub (keputusan Benny, 28 Nov). Isi brankas bertambah `token` (opsional; brankas lama tanpa token tetap terbuka). Dibuka atau dikunci di satu tab, berlaku di tab satunya; brankas bisa dibuat dari tab mana pun (dari Terapkan cukup token, kunci Gemini ditambah belakangan di Asisten AI).
- **GitHub** (`src/terbit/github.ts`): GET berkas untuk mengambil sha lalu PUT ke Contents API (cabang main, `data/terbit/jadwal.json`), token fine-grained di header Bearer. Isi dibandingkan dengan yang ada di repo tanpa memperhitungkan waktu penerapan; bila sama tidak dibuat commit (berkas di atas 1 MB tidak dikirim isinya oleh GitHub, jadi perbandingan gagal dan commit tetap dibuat, tidak berbahaya). Galat dipetakan ke pesan jelas: token ditolak (401), izin kurang (403), repo/akses tidak ada (404), berkas berubah saat menyimpan (409/422), batas permintaan, jaringan. Token tidak pernah ikut pesan galat atau tampil utuh (hanya 4 huruf awal dan akhir).
- **Cara membuat token:** github.com/settings/personal-access-tokens/new, Fine-grained token, Only select repositories (app-jadwal-sekolah), Repository permissions: Contents Read and write (tanpa izin lain), masa berlaku (mis. 90 hari).
- **Alur setelah Terapkan:** commit di main memicu GitHub Actions (tes lalu build lalu deploy); situs memperbarui diri setelah 1 sampai 2 menit. Halaman publik membaca data dengan `no-cache` dan pemeriksa versi (11.5m) menangani kode lama.
- **Pengujian:** 258 tes (baru: base64 UTF-8 dan SHA blob git, buat dan perbarui berkas, tanpa perubahan, semua kode galat, brankas dengan token, gerbang, alur lengkap tab Terapkan dengan GitHub palsu). Dicoba di Chrome dengan GitHub palsu (PUT berisi pesan, cabang, dan isi terbit). **Belum diuji dengan token GitHub sungguhan** (hanya Benny yang boleh memasukkannya).

### 11.5o Poles UI: alasan tanpa KBM, kode di kotak, ringkas admin (28 Nov 2026)

- **Alasan tidak ada KBM per kelas.** `Kegiatan.keteranganTingkat` dan `Semester.keteranganTingkat` (peta tingkat → `{kode, nama}`) menyimpan alasan, mis. XII = UKK, X = ASAS, XI = PKL. Urutan: kegiatan lebih dulu, lalu semester; bila tak ada, dipakai jenis kegiatan, lalu "Lain". `migrasiPola` mengisi data sekolah bawaan (k-asaj, k-ukk, k-asas, k-pkl-xii-*, semester Gasal XI = PKL) hanya bila belum ada. Isian ini berasal dari nama kegiatan dan keterangan Benny (kelas XI PKL sampai 12 Des); **belum bisa diubah dari UI admin** (menunggu konfirmasi).
- **Tab Semua (publik).** Kotak "tdk. KBM" diganti kode alasan berwarna (PKL biru, UKK ungu, ASAS jingga, ASAJ merah muda, TKA hijau). Tiap kotak jadwal memuat tiga baris: mode Kelas = mapel/guru/ruang, mode Guru = kelas/mapel/ruang, mode Ruang = kelas/mapel/guru. Tinggi kotak Sedang 31 px, Besar 40 px. Di bawah tabel ada legenda: alasan, mapel, guru, ruang yang tampil pada tabel.
- **Admin, Jadwal Berlangsung.** Lencana per hari diganti satu lencana per kegiatan (dengan rentang hari bila tidak sepekan penuh); agenda dilipat menjadi "Agenda pekan ini (N)".
- **Admin di ponsel.** Header lebih pendek (nama sekolah disembunyikan, tombol satu baris yang bisa digeser); kartu Kunci API memakai baris yang membungkus sehingga tombol tidak terpotong.
- **Revisi setelah dicoba di ponsel (28 Nov, 10.50).** Kode pembiasaan di tampilan publik diganti **P1** (bukan PMB). Header jam di tab Semua kembali berupa nomor (1, 2, 3, ...): pembiasaan = 1 pada skema 11 dan 9; kolom istirahat diberi ikon cangkir kecil. Garis putus-putus tegak menandai sekat P1 dan istirahat dan menembus semua baris (digambar sebagai lapisan di atas tabel, sehingga ikut menembus kotak yang digabung seperti ASAS atau PKL). Legenda mapel, guru, dan ruang berbentuk tabel Kode | Nama (dua bagian berdampingan di layar lebar). Master Data di ponsel: tiap baris menjadi kartu dua kolom dengan label di atas isian dan tombol Hapus di bawah; di layar lebar tetap tabel. Kelas Tailwind untuk lebar kolom harus ditulis utuh (mis. `sm:w-16`), jangan dirangkai dengan kode karena tidak akan ikut dibangun.
- **Tempat mengatur skema dan pola jam:** tab Skema & Kalender. Sub-tab "Template skema jam" berisi skema 11/10/9/8 (baris, durasi, warna, tipe non-KBM/pelajaran/istirahat). Sub-tab "Pola mingguan" menentukan skema tiap hari kerja; pola baru dibuat dengan "+ Pola baru". Pola dipasang pada kegiatan lewat Periode & Jadwal > kegiatan > Ubah info… > Pola jam. Skema 10 dan 8 tidak punya baris pembiasaan.

### 11.6 Pertanyaan terbuka

1. Mengapa XI AT 1, XI AT 2, XI DKV 3, XI TE 2, dan XI TE 3 tidak ada di PDF reguler (PKL?), dan apakah XI TE 1 yang ada di PDF sama dengan XI TE 1 yang berstatus PKL di jadwal-te?
2. Sheet Excel mana yang menjadi acuan Gasal (DUK, draft oktober, atau Genap_Harizka)? Ketiganya berbeda pada pembagian guru; jadwal aSc kini menjadi acuan untuk 25 rombel.
3. KKA (2 JP kelas X) dan 1 JP IPAS ada di Excel tetapi tidak di jadwal reguler: sengaja tidak dijadwalkan?
4. `mppAT` dan `mppDKV` pada aSc belum dipecah menjadi mapel nyata (di Excel: PTP, POHN, BC).
5. Ruang kunci TKA (lima lab komputer) dan UKK (bengkel): ditunda; dimuat setelah ruang pastinya dikonfirmasi.
