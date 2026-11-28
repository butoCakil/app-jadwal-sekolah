import type { Beban, Proyek } from '../model/tipe';
import { NAMA_HARI } from '../model/tipe';
import { kategoriMapel } from '../model/kategoriMapel';
import { bacaKonteks, bebanKonteks, type KonteksInstruksi } from './instruksi';
import { labelRentang, labelTanggal } from './kalenderAi';
import { daftarSemester } from '../model/simpul';

/**
 * Prompt untuk asisten AI. Yang dikirim hanya KODE (guru, mapel, kelas, ruang), tanpa nama lengkap, NIP, atau tanggal lahir
 * (kebijakan privasi, rancangan bagian 5).
 */

export const INSTRUKSI_SISTEM = `Anda asisten penyusun jadwal pelajaran SMK Negeri Bansari. Anda membantu admin mengubah DATA (beban mengajar, aturan ruang, kunci ruang kegiatan, serta kalender: kegiatan dan agenda) dan meminta penyusun otomatis (solver) membuat jadwal. Anda TIDAK pernah menulis jadwal atau slot sendiri: solver yang menyusun dan validator yang memeriksa; Anda hanya mengusulkan INSTRUKSI terstruktur yang akan diperiksa kode lalu ditampilkan ke admin untuk disetujui.

ATURAN KERAS
1. Pakai HANYA kode yang tercantum pada DATA di bawah (guru, mapel, kelas, ruang, kategori). Jangan mengarang atau menebak kode. Bila kode yang dimaksud admin tidak ada atau ambigu, tanyakan lewat "pertanyaan" dan kosongkan "instruksi".
2. Pakai HANYA operasi di bawah. Permintaan di luar kemampuan (mis. preferensi "praktik di pagi hari", "kurangi jam kosong guru", tukar dua slot) masukkan ke "tidakBisa" dengan alasan singkat; jangan diakali.
3. Satu instruksi hanya berisi bidang yang disebut. Jangan menambah bidang lain.
4. JP adalah jumlah jam pelajaran per pekan. "Gandakan" = kali 2; "tambah 2 jam" = tambah 2; "jadikan 4 jam" = jp 4. JP beban harus bilangan bulat 0 sampai 20.
5. Jangan menyertakan "susun" kecuali admin meminta menyusun/membuat ulang jadwal, atau setuju setelah Anda menawarkannya. Setelah mengubah JP, sebutkan di "jawaban" bahwa jadwal perlu disusun ulang (Lengkapi, atau Mulai dari jadwal induk pada kegiatan).
6. Jawab dalam bahasa Indonesia yang ringkas dan jelas. Jangan menyebut nama lengkap orang; pakai kode.
7. Catatan "[Catatan sistem]" pada pesan pengguna berisi hal yang terjadi di luar percakapan (admin menerapkan atau menolak usulan, mengubah data sendiri). Anggap itu keadaan terbaru.
8. Pertanyaan tentang data ("kapan UKK?", "tanggal 5 Desember ada acara apa?", "apa saja kegiatan pekan depan?") dijawab dari bagian DATA di "jawaban", tanpa instruksi. Bila tidak ada di DATA, katakan tidak ada; jangan mengarang. Nama hari sudah tertulis pada tanggal di DATA; jangan menghitung hari sendiri. "Hari ini" (bila ada di DATA) adalah acuan untuk "besok", "pekan depan".
9. Tanggal dalam instruksi selalu YYYY-MM-DD. Bila admin tidak menyebut tahun, pakai tahun yang berlaku pada DATA. Untuk memundurkan atau memajukan kegiatan pakai geserKegiatan (hari: 7 = diundur satu pekan, -7 = dimajukan satu pekan; atau mulai: tanggal mulai baru). Jangan menghitung tanggal akhir sendiri; kode yang menghitungnya serta ikut menggeser tugas mengawas dan jadwal khusus kegiatan.
10. Bedakan AGENDA dan KEGIATAN. Agenda (agenda:true) hanya catatan di kalender (acara, rapat, libur, tanggal merah, pembagian rapor) dan tidak mengubah jadwal. Kegiatan (agenda tidak diisi) memengaruhi jadwal: ujian/asesmen (ASTS, ASAS, ASAJ, TKA), PKL, UKK; kegiatan baru mulai dengan jadwal kosong dan semua kelas ikut jadwal induk. Bila tidak jelas apakah sebuah acara memengaruhi KBM, tanyakan lewat "pertanyaan".
11. Mengubah kegiatan yang sudah ada: sebut "kegiatan" dengan id dari DATA (lebih disukai) atau nama persisnya. Bila ada beberapa yang mirip, tanyakan. Menghapus kegiatan hanya bila admin jelas memintanya.

KELUARAN: satu objek JSON saja, tanpa teks lain, dengan bentuk
{"jawaban": "penjelasan singkat untuk admin", "instruksi": [ ... ], "pertanyaan": "(opsional) bila perlu klarifikasi", "tidakBisa": ["(opsional) hal yang diminta tetapi belum didukung"]}

SASARAN (memilih beban): objek dengan bidang opsional, minimal satu, nilai berupa daftar kode:
{"rombel": ["XII TE 1"], "tingkat": ["XII"], "jurusan": ["TE"], "mapel": ["PRE"], "kategori": ["Jurusan TE"], "guru": ["BEN"]}
Beberapa nilai dalam satu bidang = salah satu dari; antarbidang = semuanya harus cocok. "guru" mencocokkan guru utama maupun tim.

OPERASI (bidang "op")
- {"op":"ubahJp","sasaran":{...},"jp":N} atau "kali":X atau "tambah":N (isi tepat satu): mengubah JP beban.
- {"op":"hapusBeban","sasaran":{...}}
- {"op":"tambahBeban","rombel":["XII TE 1"],"mapel":"BK","guru":"MIF","jp":2}
- {"op":"ruangBeban","sasaran":{...},"prioritas":["B2","B3"],"terlarang":["I1"]}: mengganti ruang prioritas (berurutan) dan/atau ruang terlarang beban. Boleh salah satu.
- {"op":"guruTidakTersedia","guru":"BEN","hari":["Senin","Jumat"],"jam":[1,2]}: "jam" nomor jam pelajaran (kosong = sehari penuh). Berlaku untuk semua periode, jadi hanya bisa pada jadwal induk semester.
- {"op":"ruangTerlarang","rombel":"XII TE 1" atau "jurusan":"TE","ruang":["G3"]}: berlaku untuk semua periode, hanya pada jadwal induk.
- {"op":"kunciRuang","ruang":["G1","G2"],"hari":["Senin"],"mulai":"07:00","selesai":"10:00"}: mengunci ruang selama kegiatan (hari, mulai, selesai opsional). Hanya pada kegiatan.
- {"op":"tambahKegiatan","nama":"ASTS","jenis":"ujian","mulai":"2026-12-01","selesai":"2026-12-04","agenda":false,"untuk":"semua","hari":["Senin","Selasa"],"catatan":"...","tidakAktif":{"tingkat":["XII"],"rombel":["XI TE 1"]}}: menambah kegiatan atau agenda. "selesai" kosong = satu hari. "agenda":true = hanya catatan kalender. "jenis" salah satu dari TKA, PKL, ASAS, ASAJ, UKK, ujian, upacara, rapor, libur, lain. "hari", "tidakAktif" hanya untuk kegiatan (bukan agenda/libur); "tidakAktif" = kelas yang tidak belajar di sekolah selama kegiatan, di atas kelas yang memang tidak aktif sepanjang semester. Semua bidang selain nama, jenis, mulai opsional.
- {"op":"ubahKegiatan","kegiatan":"k-ukk","nama":"...","jenis":"...","mulai":"...","selesai":"...","untuk":"...","hari":[...],"catatan":"...","tidakAktif":{...}}: mengubah bidang yang disebut saja. "hari":[] = setiap hari kerja. "tidakAktif" MENGGANTI seluruh daftar kelas tidak aktif kegiatan (lihat daftar sekarang di DATA). Mengubah tanggal lewat ubahKegiatan TIDAK menggeser tugas mengawas; untuk memindahkan seluruh kegiatan pakai geserKegiatan.
- {"op":"geserKegiatan","kegiatan":"k-ukk","hari":7} atau {"op":"geserKegiatan","kegiatan":"k-ukk","mulai":"2026-11-16","selesai":"2026-11-20"}: memindahkan kegiatan (isi tepat satu dari hari atau mulai; selesai hanya bersama mulai, kosong = lama kegiatan tetap). Tugas mengawas dan jadwal khusus ikut.
- {"op":"hapusKegiatan","kegiatan":"k-ukk"}
- {"op":"susun","cara":"nol"|"lengkapi"|"induk","detik":20,"lunak":true}: meminta solver menyusun. "induk" hanya pada kegiatan (mulai dari jadwal induk, hanya yang melanggar digeser). Semua bidang opsional.

Operasi kalender (tambah, ubah, geser, hapus kegiatan) berlaku di konteks mana pun dan tidak memakai kode kelas kecuali pada "tidakAktif". Dalam satu usulan, instruksi beban untuk kegiatan yang baru dibuat belum bisa dipakai (kegiatan baru belum ada saat usulan dibuat); sarankan admin menerapkan dulu, lalu mengatur bebannya.

Solver menjaga: tidak bentrok guru/kelas/ruang, ruang terlarang, guru tidak tersedia, ruang terkunci dan guru yang mengawas pada kegiatan, jenis ruang per mapel. Solver belum mengenal preferensi berbobot.`;

const hariKerja = (p: Proyek) => NAMA_HARI.slice(0, p.polaReguler.length).join(', ');

function barisBeban(p: Proyek, daftar: Beban[]): string[] {
  const rombel = new Map(p.master.rombel.map((r) => [r.id, r]));
  const mapel = new Map(p.master.mapel.map((m) => [m.id, m.kode]));
  const guru = new Map(p.master.guru.map((g) => [g.id, g.kode]));
  const ruang = new Map(p.master.ruang.map((r) => [r.id, r.kode]));
  const per = new Map<string, string[]>();
  for (const b of daftar) {
    const r = rombel.get(b.rombelId);
    if (!r) continue;
    const tim = b.timGuruIds.length ? `+${b.timGuruIds.map((x) => guru.get(x) ?? '?').join('+')}` : '';
    const extra = [b.ruangPrioritas.length ? `prio=${b.ruangPrioritas.map((x) => ruang.get(x) ?? '?').join('>')}` : '', b.ruangTerlarang.length ? `larang=${b.ruangTerlarang.map((x) => ruang.get(x) ?? '?').join(',')}` : '', b.nonTatapMuka ? 'nonTatapMuka' : ''].filter(Boolean).join(' ');
    const l = per.get(r.kode) ?? [];
    l.push(`${mapel.get(b.mapelId) ?? '?'}(${guru.get(b.guruId) ?? '?'}${tim})${b.jp}${extra ? ` [${extra}]` : ''}`);
    per.set(r.kode, l);
  }
  return [...per].map(([k, l]) => `${k}: ${l.join(', ')}`);
}

/** Ringkasan data pada konteks, hanya kode. Disisipkan di pesan pengguna terakhir. */
export function ringkasData(p: Proyek, ktx: KonteksInstruksi, hariIni?: string): string {
  const { g, sem } = bacaKonteks(p, ktx);
  const tdk = g ? g.rombelTidakAktif : (sem?.rombelTidakAktif ?? []);
  const kode = (ids: string[]) => ids.map((i) => p.master.rombel.find((r) => r.id === i)?.kode ?? '?').join(', ') || '—';
  const kodeGuru = (id: string) => p.master.guru.find((x) => x.id === id)?.kode ?? '?';
  const kodeRuang = (ids: string[]) => ids.map((i) => p.master.ruang.find((r) => r.id === i)?.kode ?? '?').join(',');
  const baris: string[] = [];
  baris.push(g ? `KONTEKS: kegiatan "${g.nama}" (${g.mulai} sampai ${g.selesai}); instruksi diterapkan pada jadwal kegiatan ini, bukan jadwal induk.` : `KONTEKS: jadwal induk semester "${sem?.nama ?? '—'}".`);
  baris.push(`Hari kerja: ${hariKerja(p)}.`);
  if (hariIni) baris.push(`Hari ini: ${labelTanggal(hariIni)}.`);
  baris.push(`Kelas tidak aktif pada periode ini: ${kode(tdk)}.`);
  if (g?.rombelTerdampak) baris.push(`Kelas yang punya jadwal khusus kegiatan ini: ${kode(g.rombelTerdampak)}. Kelas lain mengikuti jadwal induk; mengubah bebannya menjadikannya kelas khusus kegiatan.`);
  baris.push(`KELAS: ${p.master.rombel.map((r) => r.kode).join('; ')}`);
  baris.push(`GURU (kode): ${p.master.guru.map((x) => x.kode).join(' ')}`);
  baris.push(`MAPEL (kode:kategori): ${p.master.mapel.map((m) => `${m.kode}:${kategoriMapel(m, p.master.mapel)}`).join('; ')}`);
  baris.push(`RUANG (kode:jenis): ${p.master.ruang.map((r) => `${r.kode}:${r.jenis}`).join('; ')}`);
  baris.push('BEBAN (kelas: mapel(guru)JP [prio=ruang prioritas berurutan, larang=ruang terlarang]):');
  baris.push(...barisBeban(p, bebanKonteks(p, ktx)));
  const guruAturan = p.aturan.filter((a) => a.jenis === 'guruTidakTersedia').map((a) => (a.jenis === 'guruTidakTersedia' ? `${kodeGuru(a.guruId)} ${NAMA_HARI[a.hari] ?? a.hari}${a.jam.length ? ` jam ${a.jam.join(',')}` : ''}` : ''));
  if (guruAturan.length) baris.push(`ATURAN GURU TIDAK TERSEDIA (semua periode): ${guruAturan.join('; ')}`);
  if (g?.ruangKunci?.length) baris.push(`RUANG TERKUNCI kegiatan ini: ${g.ruangKunci.map((k) => `${kodeRuang(k.ruangIds)}${k.hari?.length ? ` (${k.hari.map((h) => NAMA_HARI[h]).join('/')})` : ''}${k.mulai ? ` ${k.mulai}-${k.selesai}` : ''}`).join('; ')}`);
  if (g?.pengawas?.length) baris.push(`TUGAS MENGAWAS: ${g.pengawas.length} tugas (guru yang mengawas tidak mengajar pada jam itu).`);
  baris.push(...barisKalender(p));
  return baris.join('\n');
}

/** Semua semester, kegiatan, dan agenda berurut tanggal, supaya AI bisa menjawab dari data dan menyebut kegiatan lewat id. */
export function barisKalender(p: Proyek): string[] {
  const kodeRombel = (ids: string[]) => ids.map((i) => p.master.rombel.find((r) => r.id === i)?.kode ?? '?').join(',');
  const hasil: string[] = [];
  hasil.push(`SEMESTER: ${daftarSemester(p).map((s) => `${s.id} "${s.nama}" ${s.mulai} s/d ${s.selesai}`).join('; ')}`);
  hasil.push('KALENDER (id | tanggal | jenis | nama | rincian). "agenda" = catatan kalender yang tidak mengubah jadwal; "kegiatan" = mengubah jadwal. kelasTidakAktif hanya ditulis bila berbeda dari kelas yang tidak aktif sepanjang semester:');
  const urut = [...p.kalender].sort((a, b) => a.mulai.localeCompare(b.mulai) || a.selesai.localeCompare(b.selesai) || a.id.localeCompare(b.id));
  for (const g of urut) {
    const sem = daftarSemester(p).find((s) => s.id === g.semesterId) ?? daftarSemester(p).find((s) => g.mulai >= s.mulai && g.mulai <= s.selesai);
    const dasar = new Set(sem?.rombelTidakAktif ?? []);
    const beda = g.agenda || g.jenis === 'libur' ? false : g.rombelTidakAktif.length !== dasar.size || g.rombelTidakAktif.some((x) => !dasar.has(x));
    const slot = g.versiId ? (p.versi.find((v) => v.id === g.versiId)?.slots.length ?? 0) : 0;
    const rincian = [
      g.untuk ? `untuk=${g.untuk}` : '',
      g.hariBerlaku?.length ? `hari=${g.hariBerlaku.map((h) => NAMA_HARI[h]).join('/')}` : '',
      beda ? `kelasTidakAktif=${kodeRombel(g.rombelTidakAktif) || '—'}` : '',
      g.pengawas?.length ? `pengawas=${g.pengawas.length}` : '',
      g.ruangKunci?.length ? `ruangKunci=${g.ruangKunci.length}` : '',
      slot ? `slotJadwalKhusus=${slot}` : '',
      g.catatan && !/^Kalender akademik/.test(g.catatan) ? `catatan="${g.catatan.slice(0, 80)}"` : '',
    ].filter(Boolean);
    hasil.push(`${g.id} | ${labelRentang(g.mulai, g.selesai)} | ${g.agenda ? 'agenda' : 'kegiatan'}:${g.jenis} | ${g.nama}${rincian.length ? ` | ${rincian.join(' ')}` : ''}`);
  }
  return hasil;
}

// ------------------------------------------------------------------------------------ perubahan oleh admin

export interface Potret {
  beban: Record<string, string>;
  aturan: Record<string, string>;
  kunci: Record<string, string>;
  kalender: Record<string, string>;
}

/** Potret data yang relevan, untuk mendeteksi perubahan yang dibuat admin di luar percakapan. */
export function ambilPotret(p: Proyek, ktx: KonteksInstruksi): Potret {
  const { g } = bacaKonteks(p, ktx);
  const rombel = new Map(p.master.rombel.map((r) => [r.id, r.kode]));
  const mapel = new Map(p.master.mapel.map((m) => [m.id, m.kode]));
  const guru = new Map(p.master.guru.map((x) => [x.id, x.kode]));
  const ruang = new Map(p.master.ruang.map((r) => [r.id, r.kode]));
  const beban: Record<string, string> = {};
  for (const b of bebanKonteks(p, ktx)) {
    const tim = b.timGuruIds.map((x) => guru.get(x) ?? '?').join('+');
    beban[b.asal ?? b.id] = `${rombel.get(b.rombelId) ?? '?'} ${mapel.get(b.mapelId) ?? '?'}(${guru.get(b.guruId) ?? '?'}${tim ? `+${tim}` : ''}) ${b.jp} JP${b.ruangPrioritas.length ? ` prio=${b.ruangPrioritas.map((x) => ruang.get(x) ?? '?').join('>')}` : ''}${b.ruangTerlarang.length ? ` larang=${b.ruangTerlarang.map((x) => ruang.get(x) ?? '?').join(',')}` : ''}`;
  }
  const aturan: Record<string, string> = {};
  for (const a of p.aturan) {
    if (a.jenis === 'guruTidakTersedia') aturan[a.id] = `guru ${guru.get(a.guruId) ?? '?'} tidak tersedia ${NAMA_HARI[a.hari] ?? a.hari}${a.jam.length ? ` jam ${a.jam.join(',')}` : ''}`;
    else if (a.jenis === 'ruangTerlarang') aturan[a.id] = `ruang terlarang ${a.rombelId ? rombel.get(a.rombelId) : `jurusan ${a.jurusan}`}: ${a.ruangIds.map((x) => ruang.get(x) ?? '?').join(',')}`;
    else aturan[a.id] = `guru ${guru.get(a.guruId) ?? '?'} hanya boleh ruang ${a.ruangIds.map((x) => ruang.get(x) ?? '?').join(',')}`;
  }
  const kunci: Record<string, string> = {};
  for (const k of g?.ruangKunci ?? []) kunci[k.id] = `ruang dikunci ${k.ruangIds.map((x) => ruang.get(x) ?? '?').join(',')}${k.hari?.length ? ` ${k.hari.map((h) => NAMA_HARI[h]).join('/')}` : ''}${k.mulai ? ` ${k.mulai}-${k.selesai}` : ''}`;
  const kalender: Record<string, string> = {};
  for (const x of p.kalender) kalender[x.id] = `${x.agenda ? 'agenda' : 'kegiatan'} ${x.jenis} “${x.nama}” ${labelRentang(x.mulai, x.selesai)}`;
  return { beban, aturan, kunci, kalender };
}

/** Selisih dua potret sebagai kalimat singkat untuk model. Kosong = tidak ada perubahan. */
export function bandingkanPotret(a: Potret, b: Potret): string[] {
  const hasil: string[] = [];
  for (const [bagian, nama] of [['beban', 'Beban'], ['aturan', 'Aturan'], ['kunci', 'Kunci ruang'], ['kalender', 'Kalender']] as const) {
    const x = a[bagian];
    const y = b[bagian];
    for (const k of Object.keys(y)) {
      if (!(k in x)) hasil.push(`${nama} ditambah: ${y[k]}`);
      else if (x[k] !== y[k]) hasil.push(`${nama} diubah: ${x[k]} → ${y[k]}`);
    }
    for (const k of Object.keys(x)) if (!(k in y)) hasil.push(`${nama} dihapus: ${x[k]}`);
  }
  return hasil;
}
