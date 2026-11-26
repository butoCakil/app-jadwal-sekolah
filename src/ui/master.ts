import { terapkanRuangSekolah } from '../model/ruangSekolah';
import type { Aturan, Proyek } from '../model/tipe';
import { NAMA_HARI } from '../model/tipe';
import { kodeGuruBerikut, usulKodeMapel } from '../model/kode';
import type { Konteks } from './konteks';
import { esc, opsi, pecahKode } from './util';

type Tabel = 'guru' | 'mapel' | 'rombel' | 'ruang';
interface Kolom {
  f: string;
  judul: string;
  tipe: 'teks' | 'angka' | 'pilih' | 'cek';
  lebar: string;
  pilihan?: (p: Proyek, baris: Record<string, unknown>) => [string, string][];
  /** nilai centang bila kolom belum terisi */
  bawaan?: boolean;
}

const KOLOM: Record<Tabel, Kolom[]> = {
  guru: [
    { f: 'kode', judul: 'Kode', tipe: 'teks', lebar: 'w-16' },
    { f: 'nama', judul: 'Nama', tipe: 'teks', lebar: 'min-w-48 flex-1' },
  ],
  mapel: [
    { f: 'kode', judul: 'Kode (maks. 3)', tipe: 'teks', lebar: 'w-20' },
    { f: 'nama', judul: 'Nama mapel / elemen', tipe: 'teks', lebar: 'min-w-48 flex-1' },
    { f: 'jenisRuang', judul: 'Jenis ruang (berurutan)', tipe: 'teks', lebar: 'w-40' },
    { f: 'induk', judul: 'Induk (untuk elemen)', tipe: 'pilih', lebar: 'w-44', pilihan: (p, b) => p.master.mapel.filter((m) => !m.induk && m.id !== b.id).map((m) => [m.id, `${m.kode} · ${m.nama}`]) },
  ],
  rombel: [
    { f: 'kode', judul: 'Kode', tipe: 'teks', lebar: 'w-28' },
    { f: 'tingkat', judul: 'Tingkat', tipe: 'pilih', lebar: 'w-20', pilihan: () => [['X', 'X'], ['XI', 'XI'], ['XII', 'XII']] },
    { f: 'jurusan', judul: 'Jurusan', tipe: 'teks', lebar: 'w-24' },
    { f: 'nomor', judul: 'No.', tipe: 'angka', lebar: 'w-16' },
    { f: 'jpButuh', judul: 'JP data sumber', tipe: 'angka', lebar: 'w-28' },
  ],
  ruang: [
    { f: 'kode', judul: 'Kode', tipe: 'teks', lebar: 'w-20' },
    { f: 'nama', judul: 'Nama ruang', tipe: 'teks', lebar: 'min-w-40 flex-1' },
    { f: 'jenis', judul: 'Jenis', tipe: 'pilih', lebar: 'w-28', pilihan: () => [['teori', 'teori'], ['praktik', 'praktik'], ['lab', 'lab'], ['lapangan', 'lapangan']] },
    { f: 'dijadwalkan', judul: 'Ikut dijadwalkan', tipe: 'cek', lebar: 'w-24', bawaan: true },
    { f: 'bersama', judul: 'Boleh dipakai bersama', tipe: 'cek', lebar: 'w-28' },
  ],
};

const JUDUL: Record<Tabel, string> = { guru: 'Guru', mapel: 'Mapel & elemen', rombel: 'Rombel', ruang: 'Ruang' };
const KETERANGAN: Record<Tabel, string> = {
  guru: 'Kode otomatis A–Z, lalu AA–ZZ; bisa diubah.',
  mapel: 'Kode idealnya 3 karakter (kode resmi sekolah seperti PSRT dan PISAV boleh lebih). Elemen (mis. DLE, DRE, TKB di bawah DTE) memilih mapel induknya. Jenis ruang berurutan, mis. “teori, praktik”: dicoba dari yang pertama; kosong = teori, praktik, lab. Tambahkan “lapangan” untuk PJOK.',
  rombel: 'JP data sumber hanya penanda untuk membandingkan dengan kapasitas dan beban.',
  ruang: 'Hilangkan centang “ikut dijadwalkan” untuk ruang yang bukan ruang belajar (mis. ruang guru). Centang “dipakai bersama” untuk ruang yang boleh dipakai beberapa rombel sekaligus (mis. lapangan).',
};

function daftar(p: Proyek, t: Tabel): (Record<string, unknown> & { id: string })[] {
  return p.master[t] as unknown as (Record<string, unknown> & { id: string })[];
}

function sel(p: Proyek, t: Tabel, baris: Record<string, unknown> & { id: string }, c: Kolom): string {
  const nilai = baris[c.f];
  const attr = `data-aksi="mf" data-t="${t}" data-id="${esc(baris.id)}" data-f="${c.f}"`;
  if (c.tipe === 'cek') return `<input type="checkbox" ${(nilai ?? c.bawaan) ? 'checked' : ''} ${attr}>`;
  if (c.tipe === 'pilih') {
    const pil = (c.pilihan?.(p, baris) ?? []).map(([id, label]) => ({ id, label }));
    return `<select class="isian w-full" ${attr}>${opsi(pil, String(nilai ?? ''), (x) => x.id, (x) => x.label, c.f === 'induk' ? '— bukan elemen —' : undefined)}</select>`;
  }
  if (c.f === 'jenisRuang') return `<input class="isian w-full" placeholder="bawaan" value="${esc(Array.isArray(nilai) ? nilai.join(', ') : '')}" ${attr}>`;
  return `<input class="isian w-full" ${c.tipe === 'angka' ? 'type="number" min="0"' : ''} value="${esc(nilai === undefined ? '' : String(nilai))}" ${attr}>`;
}

function kartuTabel(k: Konteks, t: Tabel): string {
  const p = k.p;
  const kol = KOLOM[t];
  const rows = daftar(p, t);
  return `<div class="kartu p-3"><div class="mb-1 flex items-baseline gap-2"><h3 class="font-semibold">${JUDUL[t]}</h3><span class="text-xs text-slate-500">${rows.length} data</span></div>
    <div class="mb-2 text-xs text-slate-500">${KETERANGAN[t]}</div>
    <div class="max-h-96 space-y-1.5 overflow-auto pr-1">
      <div class="flex gap-2 text-[11px] font-medium text-slate-500">${kol.map((c) => `<div class="${c.lebar}">${c.judul}</div>`).join('')}<div class="w-8"></div></div>
      ${rows.map((b) => `<div class="flex items-center gap-2">${kol.map((c) => `<div class="${c.lebar}">${sel(p, t, b, c)}</div>`).join('')}<button class="w-8 text-red-600" data-aksi="mhapus" data-t="${t}" data-id="${esc(b.id)}" title="Hapus">✕</button></div>`).join('')}
    </div>
    <button class="tombol mt-3" data-aksi="mtambah" data-t="${t}">+ Tambah</button></div>`;
}

function kartuAturan(k: Konteks): string {
  const p = k.p;
  const jurusan = [...new Set(p.master.rombel.map((r) => r.jurusan))];
  const baris = p.aturan
    .map((a) => {
      const hapus = `<button class="w-8 text-red-600" data-aksi="ahapus" data-id="${esc(a.id)}" title="Hapus aturan">✕</button>`;
      const ket = `<input class="isian flex-1" placeholder="Catatan (opsional)" value="${esc(a.catatan ?? '')}" data-aksi="af" data-f="catatan" data-id="${esc(a.id)}">`;
      if (a.jenis === 'guruTidakTersedia') {
        return `<div class="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-2"><span class="lencana bg-violet-100 text-violet-800">Guru tidak tersedia</span>
          <select class="isian" data-aksi="af" data-f="guruId" data-id="${esc(a.id)}">${opsi(p.master.guru, a.guruId, (g) => g.id, (g) => `${g.kode} · ${g.nama}`)}</select>
          <select class="isian" data-aksi="af" data-f="hari" data-id="${esc(a.id)}">${NAMA_HARI.map((h, i) => `<option value="${i}" ${i === a.hari ? 'selected' : ''}>${h}</option>`).join('')}</select>
          <label class="text-xs text-slate-500">Pelajaran ke- <input class="isian w-36" placeholder="kosong = sehari penuh" value="${esc(a.jam.join(','))}" data-aksi="af" data-f="jam" data-id="${esc(a.id)}"></label>${ket}${hapus}</div>`;
      }
      const sasaran = a.rombelId ? `r:${a.rombelId}` : `j:${a.jurusan ?? ''}`;
      const pil = [...jurusan.map((j) => ({ id: `j:${j}`, label: `Jurusan ${j}` })), ...p.master.rombel.map((r) => ({ id: `r:${r.id}`, label: `Rombel ${r.kode}` }))];
      return `<div class="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-2"><span class="lencana bg-rose-100 text-rose-800">Ruang terlarang</span>
        <select class="isian" data-aksi="af" data-f="sasaran" data-id="${esc(a.id)}">${opsi(pil, sasaran, (x) => x.id, (x) => x.label)}</select>
        <label class="text-xs text-slate-500">Ruang (kode) <input class="isian w-32" placeholder="mis. AT1" value="${esc(a.ruangIds.map((i) => p.master.ruang.find((r) => r.id === i)?.kode ?? '?').join(', '))}" data-aksi="af" data-f="ruangIds" data-id="${esc(a.id)}"></label>${ket}${hapus}</div>`;
    })
    .join('');
  return `<div class="kartu p-3 lg:col-span-2"><h3 class="font-semibold">Aturan & kondisi</h3>
    <div class="mb-2 text-xs text-slate-500">Dibaca oleh pemeriksa bentrok, penempatan ruang, dan nanti oleh solver dan AI. Ruang prioritas per beban diatur di tab Beban & JP.</div>
    <div class="space-y-2">${baris || '<div class="text-sm text-slate-500">Belum ada aturan.</div>'}</div>
    <div class="mt-3 flex gap-2"><button class="tombol" data-aksi="atambah" data-jenis="guruTidakTersedia">+ Guru tidak tersedia</button><button class="tombol" data-aksi="atambah" data-jenis="ruangTerlarang">+ Ruang terlarang</button></div></div>`;
}

export function renderMaster(k: Konteks): string {
  return `<div class="mb-3 text-lg font-semibold">Master Data</div>
    <div class="grid gap-3 lg:grid-cols-2">${(['guru', 'mapel', 'rombel', 'ruang'] as Tabel[]).map((t) => kartuTabel(k, t)).join('')}${kartuAturan(k)}
    <div class="kartu border-slate-300 p-3 lg:col-span-2"><h3 class="font-semibold">Data</h3><div class="mb-2 text-xs text-slate-500">Draf tersimpan otomatis di peramban ini. Ekspor JSON untuk cadangan.</div>
      <button class="tombol" data-aksi="isiRuang" title="Mengganti daftar ruang dengan ruang menurut site plan 2026">Isi ruang dari site plan</button>
      <button class="tombol !border-red-300 !text-red-700" data-aksi="reset">Kembalikan ke data sekolah</button>
      <button class="tombol !border-red-300 !text-red-700" data-aksi="resetContoh">Ganti dengan data contoh fiktif</button></div></div>`;
}

const idBaru = (awal: string) => `${awal}${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

function pemakai(p: Proyek, t: Tabel, id: string): string[] {
  const ket: string[] = [];
  const hitung = (n: number, label: string) => n > 0 && ket.push(`${n} ${label}`);
  if (t === 'guru') {
    hitung(p.beban.filter((b) => b.guruId === id || b.timGuruIds.includes(id)).length, 'beban');
    hitung(p.aturan.filter((a) => a.jenis === 'guruTidakTersedia' && a.guruId === id).length, 'aturan');
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
    hitung(p.aturan.filter((a) => a.jenis === 'ruangTerlarang' && a.ruangIds.includes(id)).length, 'aturan');
  }
  return ket;
}

export function klikMaster(k: Konteks, el: HTMLElement): boolean {
  const d = el.dataset;
  const t = d.t as Tabel;
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
    k.ubah((p) => void ((p.master[t] as { id: string }[]) = (p.master[t] as { id: string }[]).filter((x) => x.id !== d.id)));
    return true;
  }
  if (d.aksi === 'atambah') {
    k.ubah((p) => {
      const g = p.master.guru[0]?.id ?? '';
      const baru: Aturan = d.jenis === 'guruTidakTersedia'
        ? { id: idBaru('a'), jenis: 'guruTidakTersedia', guruId: g, hari: 0, jam: [] }
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
      if (t === 'mapel' && kode.length > 3) return tolak('Kode mapel maksimal 3 karakter.');
      if (t === 'guru' && !/^[A-Z]{1,2}$/.test(kode)) return tolak('Kode guru berupa 1–2 huruf (A–Z atau AA–ZZ).');
      if (daftar(k.p, t).some((x) => x.id !== baris.id && String(x.kode).toUpperCase() === kode)) return tolak(`Kode ${kode} sudah dipakai.`);
      nilai = kode;
    }
    if (d.f === 'nama' && !el.value.trim()) return tolak('Nama tidak boleh kosong.');
    if (d.f === 'jurusan') nilai = el.value.trim().toUpperCase();
    if (d.f === 'jenisRuang') {
      const kata = el.value.toLowerCase().split(/[\s,;]+/).filter(Boolean);
      const sah = ['teori', 'praktik', 'lab', 'lapangan'];
      const salah = kata.filter((x) => !sah.includes(x));
      if (salah.length) return tolak(`Jenis ruang tidak dikenal: ${salah.join(', ')}. Pilihan: ${sah.join(', ')}.`);
      nilai = kata.length ? [...new Set(kata)] : undefined;
    }
    k.ubah(() => {
      if (nilai === undefined || nilai === '' || nilai === false || (Array.isArray(nilai) && nilai.length === 0)) delete baris[d.f ?? ''];
      else baris[d.f ?? ''] = d.f === 'nama' ? String(nilai).trim() : nilai;
    });
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
      else if (f === 'jam') {
        const angka = el.value.split(/[,\s]+/).filter(Boolean).map(Number);
        if (angka.some((n) => !Number.isInteger(n) || n < 1)) return tolak('Isi nomor pelajaran dipisah koma, atau kosongkan untuk sehari penuh.');
        k.ubah(() => void (a.jam = angka));
      }
    } else if (a.jenis === 'ruangTerlarang') {
      if (f === 'sasaran') {
        const [jenis, nilai] = el.value.split(/:(.*)/s) as [string, string];
        k.ubah(() => {
          delete a.rombelId;
          delete a.jurusan;
          if (jenis === 'r') a.rombelId = nilai;
          else a.jurusan = nilai;
        });
      } else if (f === 'ruangIds') {
        const peta = new Map(k.p.master.ruang.map((r) => [r.kode.toUpperCase(), r.id]));
        const kode = pecahKode(el.value);
        const salah = kode.filter((x) => !peta.has(x));
        if (salah.length) return tolak(`Kode ruang tidak dikenal: ${salah.join(', ')}.`);
        k.ubah(() => void (a.ruangIds = kode.map((x) => peta.get(x) as string)));
      }
    }
    return true;
  }
  return false;
}
