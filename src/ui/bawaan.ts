import { proyekSekolah } from '../model/sekolahData';
import type { Proyek } from '../model/tipe';
import { validasiProyek } from '../model/validasi';
import { bandingkan, gabung, ringkas, URUT_BAGIAN, type Bagian, type Perbedaan, type Pilihan } from '../sinkron/banding';
import type { Konteks } from './konteks';
import { esc } from './util';

/**
 * Kembali ke bawaan: mengembalikan seluruh data, atau hanya bagian yang dipilih, ke data bawaan aplikasi (keadaan terakhir yang
 * disepakati: lengkap sampai ASAS, termasuk skema mingguan yang sudah dibuat). Bagian yang tidak dipilih tidak disentuh.
 * Bisa diurungkan dengan Ctrl+Z; versi lama yang pernah disinkron atau diterapkan tetap ada di riwayat commit GitHub.
 */

interface Status {
  terbuka: boolean;
  beda: Perbedaan[];
  pilih: Set<Bagian>;
  galat: string;
}
const st: Status = { terbuka: false, beda: [], pilih: new Set(), galat: '' };

export function renderBawaan(): string {
  if (!st.terbuka) return '';
  const r = ringkas(st.beda);
  const baris = r.length
    ? r.map((x) => {
        const jumlah = x.lokal + x.remote + x.bentrok + x.beda;
        return `<label class="flex items-center gap-2 border-t border-slate-100 px-3 py-2 text-sm"><input type="checkbox" data-aksi="bwCentang" data-bagian="${esc(x.bagian)}" ${st.pilih.has(x.bagian) ? 'checked' : ''}><span class="font-medium">${esc(x.bagian)}</span><span class="ml-auto text-xs text-slate-500">${jumlah} butir berbeda dari bawaan</span></label>`;
      }).join('')
    : '<div class="border-t border-slate-100 px-3 py-3 text-sm text-emerald-800">Data di sini sudah sama dengan bawaan.</div>';
  return `<div class="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4" data-aksi="bwTutupLatar">
    <div class="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl" data-aksi="bwDiam">
      <div class="mb-2 flex items-center gap-2"><h2 class="text-lg font-bold">Kembali ke bawaan</h2><button class="tombol ml-auto !px-2" data-aksi="bwTutup" aria-label="Tutup">✕</button></div>
      <p class="text-sm text-slate-600">Pilih bagian yang dikembalikan ke data bawaan aplikasi (lengkap sampai ASAS). Bagian yang tidak dicentang tidak diubah. Bisa diurungkan dengan Ctrl+Z.</p>
      <div class="mt-3 overflow-hidden rounded-lg border border-slate-200">${baris}</div>
      <p class="mt-2 text-xs text-slate-500">Beban dan Jadwal saling terkait; bila dipilih sendiri-sendiri dan hasilnya tidak konsisten, perubahan ditolak dengan penjelasan.</p>
      ${st.galat ? `<div class="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-800">${esc(st.galat)}</div>` : ''}
      <div class="mt-4 flex flex-wrap gap-2"><button class="tombol" data-aksi="bwSemuaCentang">Pilih semua</button>
        <button class="tombol !bg-amber-600 !text-white disabled:opacity-40" data-aksi="bwTerapkan" ${st.pilih.size ? '' : 'disabled'}>Kembalikan yang dipilih</button>
        <button class="tombol !text-red-700" data-aksi="bwSemua" title="Mengganti seluruh data dengan bawaan, termasuk pengaturan lain">Kembalikan semuanya</button></div>
      <p class="mt-3 text-xs text-slate-500">Versi sebelumnya yang pernah disinkron atau diterapkan masih ada di riwayat commit GitHub.</p></div></div>`;
}

export function klikBawaan(k: Konteks, el: HTMLElement): boolean {
  const a = el.dataset.aksi ?? '';
  if (!a.startsWith('bw')) return false;
  switch (a) {
    case 'bwBuka':
      st.beda = bandingkan(k.p, proyekSekolah('tahun'), null);
      st.pilih = new Set();
      st.galat = '';
      st.terbuka = true;
      k.gambar();
      return true;
    case 'bwTutup':
    case 'bwTutupLatar':
      st.terbuka = false;
      k.gambar();
      return true;
    case 'bwDiam':
      return true;
    case 'bwCentang': {
      const b = URUT_BAGIAN.find((x) => x === el.dataset.bagian);
      if (b) {
        if ((el as HTMLInputElement).checked) st.pilih.add(b);
        else st.pilih.delete(b);
        k.gambar();
      }
      return true;
    }
    case 'bwSemuaCentang':
      st.pilih = new Set(ringkas(st.beda).map((x) => x.bagian));
      k.gambar();
      return true;
    case 'bwSemua':
      if (!confirm('Seluruh data di peramban ini diganti dengan data bawaan. Perubahan yang belum disinkron ke GitHub hilang (masih bisa diurungkan dengan Ctrl+Z). Lanjutkan?')) return true;
      st.terbuka = false;
      k.ganti(proyekSekolah('tahun'), 'Seluruh data dikembalikan ke bawaan.');
      return true;
    case 'bwTerapkan': {
      const hasil = kembalikanBagian(k.p, st.pilih);
      if (!hasil.ok) {
        st.galat = hasil.galat;
        k.gambar();
        return true;
      }
      st.terbuka = false;
      k.ganti(hasil.proyek, `${[...st.pilih].join(', ')} dikembalikan ke bawaan.`);
      return true;
    }
  }
  return false;
}

/** Mengembalikan bagian terpilih ke bawaan; bagian lain dipertahankan persis. Menolak hasil yang tidak konsisten. */
export function kembalikanBagian(lokal: Proyek, bagian: ReadonlySet<Bagian>, bawaan: Proyek = proyekSekolah('tahun')): { ok: true; proyek: Proyek } | { ok: false; galat: string } {
  const pilih = new Map<string, Pilihan>();
  for (const b of bandingkan(lokal, bawaan, null)) pilih.set(b.kunci, bagian.has(b.bagian) ? 'remote' : 'lokal');
  const hasil = gabung(lokal, bawaan, pilih);
  const g = validasiProyek(hasil);
  return g.length ? { ok: false, galat: `Pilihan ini membuat data tidak konsisten (${g.slice(0, 2).join(' | ')}). Pilih juga bagian yang terkait (mis. Beban bersama Jadwal).` } : { ok: true, proyek: hasil };
}

/** Menutup modal (tombol Esc). */
export function tutupBawaan(): boolean {
  if (!st.terbuka) return false;
  st.terbuka = false;
  return true;
}
