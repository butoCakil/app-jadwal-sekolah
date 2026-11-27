import { daftarDataset, hapusDataset, simpanDataset, type DatasetTersimpan } from '../io/simpan';
import { DAFTAR_DATA } from '../model/sekolahData';
import type { Proyek } from '../model/tipe';
import { versiReguler } from '../model/kalender';
import { bukaDlgKegiatan } from './kalenderTab';
import type { Konteks } from './konteks';
import { ringkasKode } from './pemilih';
import { esc } from './util';

/** Daftar dataset tersimpan di peramban ini (dimuat dari IndexedDB; diperbarui setelah tiap perubahan). */
let tersimpan: DatasetTersimpan[] = [];
let dimuat = false;

export async function muatDaftarDataset(k: Pick<Konteks, 'gambar' | 'lapor'>): Promise<void> {
  try {
    tersimpan = await daftarDataset();
    dimuat = true;
    k.gambar();
  } catch {
    k.lapor('Daftar dataset tersimpan gagal dibaca dari peramban ini.');
  }
}

const waktu = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const ringkasan = (p: Proyek): string => {
  const jp = (versiReguler(p)?.slots.length ?? 0);
  return `${p.master.guru.length} guru · ${p.master.rombel.length} rombel · ${p.beban.length} beban · ${jp} JP terjadwal · ${p.kalender.length} kegiatan kalender`;
};

const idDataset = (): string => `ds${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

/** Salinan proyek untuk semester baru: master, beban, aturan, skema, dan pola dipertahankan; jadwal dan kalender dikosongkan. */
function semesterBaru(p: Proyek, nama: string): Proyek {
  const x = structuredClone(p);
  x.nama = nama;
  x.kalender = [];
  delete x.periodeAktifId;
  x.penggantiManual = null;
  const reg = versiReguler(x);
  x.versi = [{ id: reg?.id ?? 'reguler', nama: reg?.nama ?? 'Reguler', jenis: 'reguler', slots: [] }];
  // beban khusus versi lain ikut hilang bersama versinya; beban khusus versi reguler menjadi berlaku di semua versi
  x.beban = x.beban.filter((b) => !b.versiId || b.versiId === reg?.id);
  for (const b of x.beban) delete b.versiId;
  return x;
}

function bagianPkl(k: Konteks): string {
  const p = k.p;
  const daftar = p.kalender.filter((g) => g.jenis === 'PKL' || g.rombelTidakAktif.length).sort((a, b) => a.mulai.localeCompare(b.mulai));
  const baris = daftar
    .map((g) => {
      const kode = g.rombelTidakAktif.map((i) => p.master.rombel.find((r) => r.id === i)?.kode ?? '?');
      return `<tr class="border-t border-slate-100"><td class="px-3 py-2"><b>${esc(g.nama)}</b><div class="text-xs text-slate-500">${esc(g.mulai)} s/d ${esc(g.selesai)}</div></td>
        <td class="px-2 py-2 text-xs">${kode.length ? `<span class="text-amber-800" title="${esc(kode.join(', '))}">${esc(ringkasKode(kode, 'kelas', 8))}</span>` : '<span class="text-red-700">belum ada kelas dipilih</span>'}</td>
        <td class="px-2 py-2 text-right"><button class="tombol !px-2 !py-0.5 !text-xs" data-aksi="kegBuka" data-id="${esc(g.id)}">Atur kelas…</button></td></tr>`;
    })
    .join('');
  return `<section class="kartu p-3"><div class="flex flex-wrap items-center gap-2"><h3 class="text-base font-semibold">Kelas PKL (kelas yang tidak aktif)</h3><button class="tombol" data-aksi="kegBaru" data-jenis="PKL">+ Periode PKL</button></div>
    <div class="mb-2 text-xs text-slate-500">Kelas yang dicentang pada sebuah periode disembunyikan dari jadwal, tidak diperiksa bentroknya, dan dilewati Susun Otomatis selama periode itu. Berlaku juga untuk periode lain (mis. ASAS hanya satu tingkat). Semua periode ada di Skema &amp; Kalender.</div>
    ${daftar.length ? `<div class="overflow-x-auto rounded-xl border border-slate-200"><table class="w-full text-sm"><tbody>${baris}</tbody></table></div>` : '<div class="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">Belum ada periode PKL atau periode dengan kelas tidak aktif.</div>'}</section>`;
}

function bagianDataset(): string {
  const baris = tersimpan
    .map(
      (d) => `<div class="flex flex-wrap items-center gap-2 border-t border-slate-100 px-3 py-2"><div class="min-w-56 flex-1"><div class="font-medium">${esc(d.nama)}</div><div class="text-xs text-slate-500">${esc(ringkasan(d.proyek))} · disimpan ${esc(waktu(d.disimpan))}</div></div>
        <button class="tombol" data-aksi="dsMuat" data-id="${esc(d.id)}">Muat</button><button class="tombol" data-aksi="dsTimpa" data-id="${esc(d.id)}" title="Menimpa dataset ini dengan draf yang sedang dikerjakan">Simpan draf ke sini</button><button class="tombol" data-aksi="dsNama" data-id="${esc(d.id)}">Ganti nama</button><button class="px-1 text-red-600" data-aksi="dsHapus" data-id="${esc(d.id)}" title="Hapus dataset">✕</button></div>`,
    )
    .join('');
  return `<section class="kartu p-0"><div class="flex flex-wrap items-center gap-2 p-3"><h3 class="text-base font-semibold">Dataset tersimpan (semester)</h3>
      <button class="tombol-utama" data-aksi="dsSimpan">Simpan draf ini sebagai dataset…</button><button class="tombol" data-aksi="dsBaru" title="Salinan draf ini untuk semester berikutnya: master, beban, dan aturan dipertahankan; jadwal dan kalender dikosongkan">Buat semester baru dari draf ini…</button></div>
    <div class="px-3 pb-2 text-xs text-slate-500">Dataset disimpan di peramban ini (bukan di repo) dan bisa dimuat kapan saja. Ekspor JSON di bagian atas halaman untuk cadangan atau pindah perangkat.</div>
    ${dimuat ? baris || '<div class="border-t border-slate-100 px-3 py-3 text-sm text-slate-500">Belum ada dataset tersimpan.</div>' : '<div class="border-t border-slate-100 px-3 py-3 text-sm text-slate-500">Membaca…</div>'}</section>`;
}

export function renderDataTab(k: Konteks): string {
  const p = k.p;
  return `<div class="space-y-4">
    <section class="kartu p-3"><h3 class="text-base font-semibold">Draf yang sedang dikerjakan</h3>
      <div class="mt-2 flex flex-wrap items-end gap-3"><label class="text-xs font-semibold text-slate-600">Nama data / semester<input class="isian mt-1 block w-80 max-w-full font-normal" value="${esc(p.nama)}" data-aksi="namaProyek"></label>
        <div class="text-xs text-slate-500">${esc(ringkasan(p))}</div></div>
      <div class="mt-2 text-xs text-slate-500">Semua perubahan di aplikasi tersimpan otomatis di peramban ini sebagai draf. Untuk semester baru: <b>Buat semester baru</b> di bawah (salinan draf ini), atau <b>Impor Excel</b> (pembagian tugas), lalu atur kalender dan kelas PKL.</div></section>
    ${bagianPkl(k)}
    ${bagianDataset()}
    <section class="kartu p-3"><h3 class="text-base font-semibold">Data bawaan</h3><div class="mb-2 text-xs text-slate-500">Contoh siap pakai yang ikut dalam aplikasi. Memuatnya mengganti draf yang sedang dikerjakan (simpan dulu sebagai dataset bila perlu). Bila diubah, perubahan masuk ke draf, bukan ke data bawaan.</div>
      <div class="grid gap-3 md:grid-cols-2">${DAFTAR_DATA.map((d) => `<div class="rounded-xl border border-slate-200 p-3"><div class="font-semibold">${esc(d.judul)}</div><div class="mb-2 text-xs text-slate-500">${esc(d.keterangan)}</div><button class="tombol" data-aksi="muat" data-set="${d.id}">Muat data ini</button></div>`).join('')}
        <div class="rounded-xl border border-slate-200 p-3"><div class="font-semibold">Data contoh fiktif</div><div class="mb-2 text-xs text-slate-500">Data rekaan kecil untuk mencoba fitur tanpa menyentuh data sekolah.</div><button class="tombol" data-aksi="muat" data-set="contoh">Muat data contoh</button></div>
        <div class="rounded-xl border border-slate-200 p-3"><div class="font-semibold">Ruang menurut site plan 2026</div><div class="mb-2 text-xs text-slate-500">Mengganti daftar ruang dengan 42 ruang menurut site plan, beserta kategorinya.</div><button class="tombol" data-aksi="isiRuang">Isi ruang dari site plan</button></div></div></section></div>`;
}

export function klikDataset(k: Konteks, el: HTMLElement): boolean {
  const d = el.dataset;
  const cari = () => tersimpan.find((x) => x.id === d.id);
  switch (d.aksi) {
    case 'kegBaru':
      if (d.jenis) {
        bukaDlgKegiatan(k, { jenis: d.jenis as 'PKL' });
        return true;
      }
      return false;
    case 'dsSimpan': {
      const nama = prompt('Nama dataset (mis. Genap 2026/2027):', k.p.nama)?.trim();
      if (!nama) return true;
      const baru: DatasetTersimpan = { id: idDataset(), nama, disimpan: new Date().toISOString(), proyek: structuredClone(k.p) };
      void simpanDataset(baru).then(() => muatDaftarDataset(k)).then(() => k.lapor(`Dataset “${nama}” disimpan.`)).catch(() => k.lapor('Dataset gagal disimpan.'));
      return true;
    }
    case 'dsTimpa': {
      const x = cari();
      if (!x || !confirm(`Timpa dataset “${x.nama}” dengan draf yang sedang dikerjakan?`)) return true;
      void simpanDataset({ ...x, disimpan: new Date().toISOString(), proyek: structuredClone(k.p) }).then(() => muatDaftarDataset(k)).then(() => k.lapor(`Dataset “${x.nama}” diperbarui.`)).catch(() => k.lapor('Dataset gagal disimpan.'));
      return true;
    }
    case 'dsMuat': {
      const x = cari();
      if (!x || !confirm(`Muat dataset “${x.nama}”? Draf yang sedang dikerjakan akan diganti (simpan dulu bila perlu).`)) return true;
      k.ganti(structuredClone(x.proyek), `Dataset “${x.nama}” dimuat.`);
      return true;
    }
    case 'dsNama': {
      const x = cari();
      const nama = x ? prompt('Nama dataset:', x.nama)?.trim() : '';
      if (!x || !nama) return true;
      void simpanDataset({ ...x, nama }).then(() => muatDaftarDataset(k));
      return true;
    }
    case 'dsHapus': {
      const x = cari();
      if (!x || !confirm(`Hapus dataset “${x.nama}” dari peramban ini? Tidak bisa diurungkan.`)) return true;
      void hapusDataset(x.id).then(() => muatDaftarDataset(k));
      return true;
    }
    case 'dsBaru': {
      const nama = prompt('Nama semester baru (mis. Gasal 2027/2028):', '')?.trim();
      if (!nama) return true;
      if (!confirm(`Membuat “${nama}” dari draf ini: guru, mapel, rombel, beban, ruang, aturan, skema, dan pola dipertahankan; jadwal dan kalender dikosongkan. Draf yang sedang dikerjakan diganti (simpan dulu sebagai dataset bila perlu). Lanjutkan?`)) return true;
      k.ganti(semesterBaru(k.p, nama), `Semester baru “${nama}” dibuat. Atur kalender dan kelas PKL, lalu ubah beban seperlunya.`);
      return true;
    }
  }
  return false;
}

export function ubahDataset(k: Konteks, el: HTMLInputElement): boolean {
  if (el.dataset.aksi !== 'namaProyek') return false;
  const nama = el.value.trim();
  if (!nama) {
    k.lapor('Nama tidak boleh kosong.');
    k.gambar();
    return true;
  }
  k.ubah((x) => void (x.nama = nama));
  return true;
}
