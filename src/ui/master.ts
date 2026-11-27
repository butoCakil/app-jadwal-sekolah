import { terapkanRuangSekolah } from '../model/ruangSekolah';
import { KATEGORI_BAWAAN, kategoriRuang } from '../model/ruang';
import type { Aturan, Mapel, Proyek } from '../model/tipe';
import { NAMA_HARI } from '../model/tipe';
import { kodeGuruBerikut, usulKodeMapel } from '../model/kode';
import { DAFTAR_DATA } from '../model/sekolahData';
import type { Konteks, SubMaster } from './konteks';
import { ringkasKode, tombolPemilih } from './pemilih';
import { esc, opsi, simpanCek } from './util';

type Tabel = 'guru' | 'mapel' | 'rombel' | 'ruang';
type Baris = Record<string, unknown> & { id: string };
interface Kolom {
  f: string;
  judul: string;
  tipe: 'teks' | 'angka' | 'pilih' | 'cek' | 'banyak' | 'kategori';
  lebar: string;
  pilihan?: (p: Proyek, baris: Record<string, unknown>) => [string, string][];
  /** nilai centang bila kolom belum terisi */
  bawaan?: boolean;
  /** kolom "banyak": modal pemilih dan ringkasan isinya */
  sasaran?: 'guruMapel' | 'mapelRuang' | 'rombelRuang';
  ringkas?: (p: Proyek, baris: Baris) => string;
}

const kodeRuang = (p: Proyek, ids: unknown): string[] => (Array.isArray(ids) ? ids : []).map((i) => p.master.ruang.find((r) => r.id === i)?.kode ?? '?');

const KOLOM: Record<Tabel, Kolom[]> = {
  guru: [
    { f: 'kode', judul: 'Kode', tipe: 'teks', lebar: 'w-16' },
    { f: 'nama', judul: 'Nama', tipe: 'teks', lebar: 'min-w-64 flex-1' },
    {
      f: 'mapelIds', judul: 'Mapel yang diampu', tipe: 'banyak', lebar: 'w-56', sasaran: 'guruMapel',
      ringkas: (p, b) => ringkasKode((Array.isArray(b.mapelIds) ? b.mapelIds : []).map((i) => p.master.mapel.find((m) => m.id === i)?.kode ?? '?'), 'mapel', 5),
    },
  ],
  mapel: [
    { f: 'kode', judul: 'Kode', tipe: 'teks', lebar: 'w-20' },
    { f: 'nama', judul: 'Nama mapel / elemen', tipe: 'teks', lebar: 'min-w-64 flex-1' },
    { f: 'induk', judul: 'Induk (untuk elemen)', tipe: 'pilih', lebar: 'w-52', pilihan: (p, b) => p.master.mapel.filter((m) => !m.induk && m.id !== b.id).map((m) => [m.id, `${m.kode} · ${m.nama}`]) },
    { f: 'jenisRuang', judul: 'Jenis ruang (berurutan)', tipe: 'teks', lebar: 'w-44' },
    { f: 'ruangIds', judul: 'Hanya ruang…', tipe: 'banyak', lebar: 'w-44', sasaran: 'mapelRuang', ringkas: (p, b) => ringkasKode(kodeRuang(p, b.ruangIds), 'ruang') },
  ],
  rombel: [
    { f: 'kode', judul: 'Kode', tipe: 'teks', lebar: 'w-28' },
    { f: 'tingkat', judul: 'Tingkat', tipe: 'pilih', lebar: 'w-20', pilihan: () => [['X', 'X'], ['XI', 'XI'], ['XII', 'XII']] },
    { f: 'jurusan', judul: 'Jurusan', tipe: 'teks', lebar: 'w-24' },
    { f: 'nomor', judul: 'No.', tipe: 'angka', lebar: 'w-16' },
    { f: 'jpButuh', judul: 'JP data sumber', tipe: 'angka', lebar: 'w-28' },
    { f: 'ruangIds', judul: 'Hanya ruang…', tipe: 'banyak', lebar: 'w-48', sasaran: 'rombelRuang', ringkas: (p, b) => ringkasKode(kodeRuang(p, b.ruangIds), 'ruang') },
  ],
  ruang: [
    { f: 'kode', judul: 'Kode', tipe: 'teks', lebar: 'w-20' },
    { f: 'nama', judul: 'Nama ruang', tipe: 'teks', lebar: 'min-w-56 flex-1' },
    { f: 'jenis', judul: 'Jenis', tipe: 'pilih', lebar: 'w-28', pilihan: () => [['teori', 'teori'], ['praktik', 'praktik'], ['lab', 'lab'], ['lapangan', 'lapangan']] },
    { f: 'kategori', judul: 'Kategori', tipe: 'kategori', lebar: 'w-36' },
    { f: 'dijadwalkan', judul: 'Ikut dijadwalkan', tipe: 'cek', lebar: 'w-28', bawaan: true },
    { f: 'bersama', judul: 'Boleh dipakai bersama', tipe: 'cek', lebar: 'w-32' },
  ],
};

const JUDUL: Record<Tabel, string> = { guru: 'Guru', mapel: 'Mapel & elemen', rombel: 'Rombel', ruang: 'Ruang' };
const KETERANGAN: Record<Tabel, string> = {
  guru: 'Kode otomatis A–Z, lalu AA–ZZ; bisa diubah. “Mapel yang diampu” dipakai menyaring pilihan mapel saat menambah beban.',
  mapel: 'Kode idealnya 3 karakter (kode resmi sekolah seperti PSRT dan PISAV boleh lebih). Elemen (mis. DLE, DRE, TKB di bawah DTE) memilih mapel induknya. Jenis ruang berurutan, mis. “teori, praktik”: dicoba dari yang pertama; kosong = teori, praktik, lab. Tambahkan “lapangan” untuk PJOK. “Hanya ruang…” membatasi mapel ke ruang tertentu (kosong = tidak dibatasi).',
  rombel: 'JP data sumber hanya penanda untuk membandingkan dengan kapasitas dan beban. “Hanya ruang…” membatasi rombel ke ruang tertentu (kosong = tidak dibatasi).',
  ruang: 'Kategori mengelompokkan ruang untuk pemilihan massal (Ruang teori, Lab TE, Lab DKV, Lab AT, …). Hilangkan centang “ikut dijadwalkan” untuk ruang yang bukan ruang belajar (mis. ruang guru). Centang “dipakai bersama” untuk ruang yang boleh dipakai beberapa rombel sekaligus (mis. lapangan).',
};

const SUB: { id: SubMaster; label: string }[] = [
  { id: 'guru', label: 'Guru' },
  { id: 'mapel', label: 'Mapel & elemen' },
  { id: 'rombel', label: 'Rombel' },
  { id: 'ruang', label: 'Ruang' },
  { id: 'aturan', label: 'Aturan & kondisi' },
  { id: 'data', label: 'Data' },
];

function daftar(p: Proyek, t: Tabel): Baris[] {
  return p.master[t] as unknown as Baris[];
}

/** Mapel ditampilkan dengan elemen tepat di bawah induknya (urutan data tidak berubah). */
function urutTampil(p: Proyek, t: Tabel): Baris[] {
  const rows = daftar(p, t);
  if (t !== 'mapel') return rows;
  const mapel = p.master.mapel;
  const ada = new Set(mapel.map((m) => m.id));
  const hasil: Mapel[] = [];
  for (const m of mapel.filter((x) => !x.induk || !ada.has(x.induk))) {
    hasil.push(m, ...mapel.filter((e) => e.induk === m.id));
  }
  return hasil as unknown as Baris[];
}

function sel(p: Proyek, t: Tabel, baris: Baris, c: Kolom): string {
  const nilai = baris[c.f];
  const attr = `data-aksi="mf" data-t="${t}" data-id="${esc(baris.id)}" data-f="${c.f}"`;
  if (c.tipe === 'cek') return `<input type="checkbox" ${(nilai ?? c.bawaan) ? 'checked' : ''} ${attr}>`;
  if (c.tipe === 'banyak') return tombolPemilih(c.sasaran as 'guruMapel', baris.id, c.ringkas?.(p, baris) ?? '', 'Semua / belum diatur', 'w-full');
  if (c.tipe === 'pilih') {
    const pil = (c.pilihan?.(p, baris) ?? []).map(([id, label]) => ({ id, label }));
    return `<select class="isian w-full" ${attr}>${opsi(pil, String(nilai ?? ''), (x) => x.id, (x) => x.label, c.f === 'induk' ? '— bukan elemen —' : undefined)}</select>`;
  }
  if (c.tipe === 'kategori') return `<input class="isian w-full" list="daftarKategori" placeholder="${esc(kategoriRuang(baris as never))}" value="${esc(nilai === undefined ? '' : String(nilai))}" ${attr}>`;
  if (c.f === 'jenisRuang') return `<input class="isian w-full" placeholder="bawaan" value="${esc(Array.isArray(nilai) ? nilai.join(', ') : '')}" ${attr}>`;
  const indukTebal = t === 'mapel' && c.f === 'nama' && (baris as unknown as Mapel).induk ? 'ml-4 w-[calc(100%-1rem)]' : 'w-full';
  return `<input class="isian ${indukTebal}" ${c.tipe === 'angka' ? 'type="number" min="0"' : ''} value="${esc(nilai === undefined ? '' : String(nilai))}" ${attr}>`;
}

function kartuTabel(k: Konteks, t: Tabel): string {
  const p = k.p;
  const kol = KOLOM[t];
  const rows = urutTampil(p, t);
  const kategori = t === 'ruang' ? `<datalist id="daftarKategori">${[...new Set([...KATEGORI_BAWAAN, ...p.master.ruang.map(kategoriRuang)])].map((x) => `<option value="${esc(x)}">`).join('')}</datalist>` : '';
  return `<div class="kartu p-3"><div class="mb-1 flex items-baseline gap-2"><h3 class="text-base font-semibold">${JUDUL[t]}</h3><span class="text-xs text-slate-500">${rows.length} data</span></div>
    <div class="mb-2 text-xs text-slate-500">${KETERANGAN[t]}</div>${kategori}
    <div class="space-y-1.5 overflow-x-auto pb-1">
      <div class="flex gap-2 text-[11px] font-medium text-slate-500">${kol.map((c) => `<div class="${c.lebar}">${c.judul}</div>`).join('')}<div class="w-8"></div></div>
      ${rows.map((b) => `<div class="flex items-center gap-2">${kol.map((c) => `<div class="${c.lebar}">${sel(p, t, b, c)}</div>`).join('')}<button class="w-8 text-red-600" data-aksi="mhapus" data-t="${t}" data-id="${esc(b.id)}" title="Hapus">✕</button></div>`).join('')}
    </div>
    <button class="tombol mt-3" data-aksi="mtambah" data-t="${t}">+ Tambah</button></div>`;
}

const chipRuang = (p: Proyek, ids: string[]): string => ringkasKode(ids.map((i) => p.master.ruang.find((r) => r.id === i)?.kode ?? '?'), 'ruang', 6);

function kartuAturan(k: Konteks): string {
  const p = k.p;
  const jurusan = [...new Set(p.master.rombel.map((r) => r.jurusan))];
  const baris = p.aturan
    .map((a) => {
      const hapus = `<button class="w-8 text-red-600" data-aksi="ahapus" data-id="${esc(a.id)}" title="Hapus aturan">✕</button>`;
      const ket = `<input class="isian min-w-40 flex-1" placeholder="Catatan (opsional)" value="${esc(a.catatan ?? '')}" data-aksi="af" data-f="catatan" data-id="${esc(a.id)}">`;
      const guruPilih = (id: string) => `<select class="isian" data-aksi="af" data-f="guruId" data-id="${esc(a.id)}">${opsi(p.master.guru, id, (g) => g.id, (g) => `${g.kode} · ${g.nama}`)}</select>`;
      if (a.jenis === 'guruTidakTersedia') {
        const jamMaks = 10;
        const jam = Array.from({ length: jamMaks }, (_, i) => i + 1)
          .map((n) => `<label class="flex items-center gap-0.5 rounded bg-white px-1 text-xs"><input type="checkbox" data-aksi="ajam" data-id="${esc(a.id)}" data-jam="${n}" ${a.jam.includes(n) ? 'checked' : ''}>${n}</label>`)
          .join('');
        return `<div class="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-2"><span class="lencana bg-violet-100 text-violet-800">Guru tidak tersedia</span>
          ${guruPilih(a.guruId)}
          <select class="isian" data-aksi="af" data-f="hari" data-id="${esc(a.id)}">${NAMA_HARI.map((h, i) => `<option value="${i}" ${i === a.hari ? 'selected' : ''}>${h}</option>`).join('')}</select>
          <span class="flex flex-wrap items-center gap-1 text-xs text-slate-500">Pelajaran ke- ${jam}<span class="ml-1">${a.jam.length ? '' : '(tidak ada yang dicentang = sehari penuh)'}</span></span>${ket}${hapus}</div>`;
      }
      if (a.jenis === 'guruRuang') {
        return `<div class="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-2"><span class="lencana bg-sky-100 text-sky-800">Guru hanya di ruang</span>
          ${guruPilih(a.guruId)}<span class="text-xs text-slate-500">hanya boleh memakai</span>
          ${tombolPemilih('aturanRuang', a.id, chipRuang(p, a.ruangIds), 'Pilih ruang…')}${a.ruangIds.length === 0 ? '<span class="text-xs text-amber-700">belum ada ruang dipilih, aturan belum berlaku</span>' : ''}${ket}${hapus}</div>`;
      }
      const sasaran = a.rombelId ? `r:${a.rombelId}` : `j:${a.jurusan ?? ''}`;
      const pil = [...jurusan.map((j) => ({ id: `j:${j}`, label: `Jurusan ${j}` })), ...p.master.rombel.map((r) => ({ id: `r:${r.id}`, label: `Rombel ${r.kode}` }))];
      return `<div class="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-2"><span class="lencana bg-rose-100 text-rose-800">Ruang terlarang</span>
        <select class="isian" data-aksi="af" data-f="sasaran" data-id="${esc(a.id)}">${opsi(pil, sasaran, (x) => x.id, (x) => x.label)}</select>
        <span class="text-xs text-slate-500">tidak boleh memakai</span>${tombolPemilih('aturanRuang', a.id, chipRuang(p, a.ruangIds), 'Pilih ruang…')}${ket}${hapus}</div>`;
    })
    .join('');
  return `<div class="kartu p-3"><h3 class="text-base font-semibold">Aturan & kondisi</h3>
    <div class="mb-2 text-xs text-slate-500">Dibaca oleh pemeriksa bentrok, penempatan ruang, solver, dan nanti AI. Semua isian memilih dari data master (tidak diketik), jadi tidak ada kode yang salah. Ruang prioritas per beban diatur di tab Beban & JP.</div>
    <div class="space-y-2">${baris || '<div class="text-sm text-slate-500">Belum ada aturan.</div>'}</div>
    <div class="mt-3 flex flex-wrap gap-2"><button class="tombol" data-aksi="atambah" data-jenis="guruTidakTersedia">+ Guru tidak tersedia</button><button class="tombol" data-aksi="atambah" data-jenis="guruRuang">+ Guru hanya di ruang tertentu</button><button class="tombol" data-aksi="atambah" data-jenis="ruangTerlarang">+ Ruang terlarang</button></div></div>`;
}

function kartuData(k: Konteks): string {
  const aktif = k.p.nama;
  return `<div class="kartu p-3"><h3 class="text-base font-semibold">Data</h3>
    <div class="mb-3 text-xs text-slate-500">Data aktif: <b>${esc(aktif)}</b>. Draf tersimpan otomatis di peramban ini; ekspor JSON untuk cadangan. Memuat data di bawah mengganti draf yang sedang ada.</div>
    <div class="grid gap-3 md:grid-cols-2">${DAFTAR_DATA.map((d) => `<div class="rounded-xl border border-slate-200 p-3"><div class="font-semibold">${esc(d.judul)}</div><div class="mb-2 text-xs text-slate-500">${esc(d.keterangan)}</div><button class="tombol" data-aksi="muat" data-set="${d.id}">Muat data ini</button></div>`).join('')}
      <div class="rounded-xl border border-slate-200 p-3"><div class="font-semibold">Data contoh fiktif</div><div class="mb-2 text-xs text-slate-500">Data rekaan kecil untuk mencoba fitur tanpa menyentuh data sekolah.</div><button class="tombol" data-aksi="muat" data-set="contoh">Muat data contoh</button></div>
      <div class="rounded-xl border border-slate-200 p-3"><div class="font-semibold">Ruang menurut site plan 2026</div><div class="mb-2 text-xs text-slate-500">Mengganti daftar ruang dengan 42 ruang menurut site plan, beserta kategorinya.</div><button class="tombol" data-aksi="isiRuang">Isi ruang dari site plan</button></div></div></div>`;
}

export function renderMaster(k: Konteks): string {
  const t = k.ui.masterTab;
  const isi = t === 'aturan' ? kartuAturan(k) : t === 'data' ? kartuData(k) : kartuTabel(k, t);
  return `<div class="mb-3 text-lg font-semibold">Master Data</div>
    <div class="mb-3 flex flex-wrap gap-1 border-b border-slate-200">${SUB.map((s) => {
      const n = s.id === 'aturan' ? k.p.aturan.length : s.id === 'data' ? '' : daftar(k.p, s.id).length;
      return `<button data-aksi="subMaster" data-sub="${s.id}" class="-mb-px border-b-2 px-3 py-1.5 text-sm font-medium ${s.id === t ? 'border-[#2347b8] text-[#2347b8]' : 'border-transparent text-slate-500 hover:text-slate-800'}">${s.label}${n === '' ? '' : ` <span class="text-xs text-slate-400">${n}</span>`}</button>`;
    }).join('')}</div>${isi}`;
}

const idBaru = (awal: string) => `${awal}${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

function pemakai(p: Proyek, t: Tabel, id: string): string[] {
  const ket: string[] = [];
  const hitung = (n: number, label: string) => n > 0 && ket.push(`${n} ${label}`);
  if (t === 'guru') {
    hitung(p.beban.filter((b) => b.guruId === id || b.timGuruIds.includes(id)).length, 'beban');
    hitung(p.aturan.filter((a) => (a.jenis === 'guruTidakTersedia' || a.jenis === 'guruRuang') && a.guruId === id).length, 'aturan');
  } else if (t === 'mapel') {
    hitung(p.beban.filter((b) => b.mapelId === id).length, 'beban');
    hitung(p.master.mapel.filter((m) => m.induk === id).length, 'elemen turunan');
  } else if (t === 'rombel') {
    hitung(p.beban.filter((b) => b.rombelId === id).length, 'beban');
    hitung(p.kalender.filter((x) => x.rombelTidakAktif.includes(id)).length, 'kegiatan kalender');
    hitung(p.aturan.filter((a) => a.jenis === 'ruangTerlarang' && a.rombelId === id).length, 'aturan');
  } else {
    hitung(p.versi.reduce((n, v) => n + v.slots.filter((s) => s.ruangId === id).length, 0), 'slot jadwal');
    hitung(p.beban.filter((b) => b.ruangPrioritas.includes(id) || b.ruangTerlarang.includes(id)).length, 'beban');
    hitung(p.aturan.filter((a) => (a.jenis === 'ruangTerlarang' || a.jenis === 'guruRuang') && a.ruangIds.includes(id)).length, 'aturan');
    hitung(p.master.mapel.filter((m) => m.ruangIds?.includes(id)).length, 'mapel');
    hitung(p.master.rombel.filter((r) => r.ruangIds?.includes(id)).length, 'rombel');
  }
  return ket;
}

export function klikMaster(k: Konteks, el: HTMLElement): boolean {
  const d = el.dataset;
  const t = d.t as Tabel;
  if (d.aksi === 'subMaster') {
    k.ui.masterTab = d.sub as SubMaster;
    k.gambar();
    return true;
  }
  if (d.aksi === 'mtambah') {
    k.ubah((p) => {
      if (t === 'guru') p.master.guru.push({ id: idBaru('g'), nama: 'Guru baru', kode: kodeGuruBerikut(p.master.guru.map((g) => g.kode)) });
      else if (t === 'mapel') p.master.mapel.push({ id: idBaru('m'), nama: 'Mapel baru', kode: usulKodeMapel('Mapel baru', p.master.mapel.map((m) => m.kode)) });
      else if (t === 'rombel') {
        const akhir = p.master.rombel.at(-1);
        const tingkat = akhir?.tingkat ?? 'X';
        const jurusan = akhir?.jurusan ?? 'TE';
        const nomor = p.master.rombel.filter((r) => r.tingkat === tingkat && r.jurusan === jurusan).length + 1;
        p.master.rombel.push({ id: idBaru('r'), tingkat, jurusan, nomor, kode: `${tingkat} ${jurusan} ${nomor}` });
      } else {
        const n = p.master.ruang.length + 1;
        p.master.ruang.push({ id: idBaru('u'), kode: `R${n}`, nama: `Ruang ${n}`, jenis: 'teori' });
      }
    });
    return true;
  }
  if (d.aksi === 'isiRuang') {
    if (!confirm('Ganti daftar ruang dengan ruang menurut site plan 2026 (42 ruang)? Rujukan ke ruang lama dipertahankan bila kodenya sama; ruang slot yang hilang dicarikan pengganti.')) return true;
    k.ubah((p) => terapkanRuangSekolah(p));
    k.lapor('Daftar ruang diganti menurut site plan.');
    return true;
  }
  if (d.aksi === 'mhapus') {
    const pakai = pemakai(k.p, t, d.id ?? '');
    if (pakai.length) {
      k.lapor(`Tidak bisa dihapus: masih dipakai oleh ${pakai.join(', ')}. Lepas dulu pemakainya.`);
      return true;
    }
    k.ubah((p) => {
      (p.master[t] as { id: string }[]) = (p.master[t] as { id: string }[]).filter((x) => x.id !== d.id);
      // bersihkan rujukan daftar centang yang tidak memblokir penghapusan
      if (t === 'mapel') for (const g of p.master.guru) if (g.mapelIds) g.mapelIds = g.mapelIds.filter((i) => i !== d.id);
    });
    return true;
  }
  if (d.aksi === 'atambah') {
    k.ubah((p) => {
      const g = p.master.guru[0]?.id ?? '';
      const baru: Aturan = d.jenis === 'guruTidakTersedia'
        ? { id: idBaru('a'), jenis: 'guruTidakTersedia', guruId: g, hari: 0, jam: [] }
        : d.jenis === 'guruRuang'
          ? { id: idBaru('a'), jenis: 'guruRuang', guruId: g, ruangIds: [] }
          : { id: idBaru('a'), jenis: 'ruangTerlarang', jurusan: p.master.rombel[0]?.jurusan ?? '', ruangIds: [] };
      p.aturan.push(baru);
    });
    return true;
  }
  if (d.aksi === 'ahapus') {
    k.ubah((p) => void (p.aturan = p.aturan.filter((a) => a.id !== d.id)));
    return true;
  }
  return false;
}

export function ubahMaster(k: Konteks, el: HTMLInputElement & HTMLSelectElement): boolean {
  const d = el.dataset;
  const tolak = (pesan: string) => {
    k.lapor(pesan);
    k.gambar();
    return true;
  };
  if (d.aksi === 'mf') {
    const t = d.t as Tabel;
    const baris = daftar(k.p, t).find((x) => x.id === d.id);
    if (!baris) return true;
    const kol = KOLOM[t].find((c) => c.f === d.f);
    if (!kol) return true;
    let nilai: unknown = el.value;
    if (kol.tipe === 'cek') nilai = el.checked;
    if (kol.tipe === 'angka') {
      if (el.value === '') nilai = undefined;
      else {
        const n = Number(el.value);
        if (!Number.isInteger(n) || n < 0) return tolak('Isi dengan bilangan bulat 0 atau lebih.');
        nilai = n;
      }
    }
    if (d.f === 'kode') {
      const kode = el.value.trim().toUpperCase();
      if (!kode) return tolak('Kode tidak boleh kosong.');
      if (t === 'guru' && !/^[A-Z]{1,3}$/.test(kode)) return tolak('Kode guru berupa 1–3 huruf (A–Z).');
      if (daftar(k.p, t).some((x) => x.id !== baris.id && String(x.kode).toUpperCase() === kode)) return tolak(`Kode ${kode} sudah dipakai.`);
      nilai = kode;
    }
    if (d.f === 'nama' && !el.value.trim()) return tolak('Nama tidak boleh kosong.');
    if (d.f === 'jurusan') nilai = el.value.trim().toUpperCase();
    if (d.f === 'kategori') nilai = el.value.trim();
    if (d.f === 'jenisRuang') {
      const kata = el.value.toLowerCase().split(/[\s,;]+/).filter(Boolean);
      const sah = ['teori', 'praktik', 'lab', 'lapangan'];
      const salah = kata.filter((x) => !sah.includes(x));
      if (salah.length) return tolak(`Jenis ruang tidak dikenal: ${salah.join(', ')}. Pilihan: ${sah.join(', ')}.`);
      nilai = kata.length ? [...new Set(kata)] : undefined;
    }
    k.ubah(() => {
      const f = d.f ?? '';
      // centang disimpan hanya bila berbeda dari nilai bawaannya (bawaan true: yang disimpan "false"); bawaan kolom lain dihapus
      if (kol.tipe === 'cek') simpanCek(baris, f, nilai as boolean, kol.bawaan ?? false);
      else if (nilai === undefined || nilai === '' || (Array.isArray(nilai) && nilai.length === 0)) delete baris[f];
      else baris[f] = f === 'nama' ? String(nilai).trim() : nilai;
    });
    return true;
  }
  if (d.aksi === 'ajam') {
    const a = k.p.aturan.find((x) => x.id === d.id);
    if (!a || a.jenis !== 'guruTidakTersedia') return true;
    const n = Number(d.jam);
    k.ubah(() => void (a.jam = (el.checked ? [...new Set([...a.jam, n])] : a.jam.filter((x) => x !== n)).sort((x, y) => x - y)));
    return true;
  }
  if (d.aksi === 'af') {
    const a = k.p.aturan.find((x) => x.id === d.id);
    if (!a) return true;
    const f = d.f;
    if (f === 'catatan') k.ubah(() => void (a.catatan = el.value.trim() || undefined));
    else if (a.jenis === 'guruTidakTersedia') {
      if (f === 'guruId') k.ubah(() => void (a.guruId = el.value));
      else if (f === 'hari') k.ubah(() => void (a.hari = Number(el.value)));
    } else if (a.jenis === 'guruRuang') {
      if (f === 'guruId') k.ubah(() => void (a.guruId = el.value));
    } else if (a.jenis === 'ruangTerlarang' && f === 'sasaran') {
      const [jenis, nilai] = el.value.split(/:(.*)/s) as [string, string];
      k.ubah(() => {
        delete a.rombelId;
        delete a.jurusan;
        if (jenis === 'r') a.rombelId = nilai;
        else a.jurusan = nilai;
      });
    }
    return true;
  }
  return false;
}
