import { bacaBerkasImpor, kumpulkanCadangan, ringkasCadangan, serialCadangan, terapkanCadangan, type PaketCadangan } from '../io/cadangan';
import { gudangPeramban } from '../io/gudangPeramban';
import { keJson } from '../io/simpan';
import type { Proyek } from '../model/tipe';
import type { Konteks } from './konteks';
import { esc, isoLokal, unduh } from './util';

/**
 * Ekspor dan impor cadangan. Ekspor paket lengkap berisi semua yang tersimpan di peramban ini (draf, semua dataset, pengaturan AI,
 * penanda sinkron; brankas terenkripsi bila dipilih). Impor mengenali paket lengkap, berkas admin dari GitHub, dan ekspor proyek lama.
 */

interface Status {
  terbuka: boolean;
  brankas: boolean;
  sibuk: boolean;
  galat: string;
}
const st: Status = { terbuka: false, brankas: false, sibuk: false, galat: '' };

export function renderCadangan(): string {
  if (!st.terbuka) return '';
  return `<div class="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4" data-aksi="cdTutupLatar">
    <div class="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl" data-aksi="cdDiam">
      <div class="mb-2 flex items-center gap-2"><h2 class="text-lg font-bold">Ekspor cadangan</h2><button class="tombol ml-auto !px-2" data-aksi="cdTutup" aria-label="Tutup">✕</button></div>
      <p class="text-sm text-slate-600"><b>Paket lengkap</b> berisi semua yang tersimpan di peramban ini: draf yang sedang dikerjakan, semua dataset tersimpan, pengaturan dan pemakaian asisten AI, serta penanda sinkron GitHub. Impor di perangkat lain memulihkan semuanya.</p>
      <label class="mt-3 flex items-start gap-2 text-sm"><input type="checkbox" class="mt-1" data-aksi="cdBrankas" ${st.brankas ? 'checked' : ''}><span>Sertakan brankas (kunci Gemini dan token GitHub). Tetap <b>terenkripsi</b>; hanya bisa dibuka dengan PIN yang sama. Tidak dicentang: kunci dan token tidak ikut.</span></label>
      ${st.galat ? `<div class="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-800">${esc(st.galat)}</div>` : ''}
      <div class="mt-4 flex flex-wrap gap-2"><button class="tombol !bg-[#2347b8] !text-white disabled:opacity-40" data-aksi="cdUnduhLengkap" ${st.sibuk ? 'disabled' : ''}>Unduh paket lengkap</button>
        <button class="tombol" data-aksi="cdUnduhDraf" title="Format lama: hanya data proyek yang sedang dikerjakan">Hanya draf (format lama)</button></div></div></div>`;
}

export function klikCadangan(k: Konteks, el: HTMLElement): boolean {
  const a = el.dataset.aksi ?? '';
  if (!a.startsWith('cd')) return false;
  switch (a) {
    case 'cdBuka':
      st.terbuka = true;
      st.galat = '';
      k.gambar();
      return true;
    case 'cdTutup':
    case 'cdTutupLatar':
      st.terbuka = false;
      k.gambar();
      return true;
    case 'cdDiam':
      return true;
    case 'cdBrankas':
      st.brankas = (el as HTMLInputElement).checked;
      return true;
    case 'cdUnduhDraf':
      unduh(`jadwal-draf-${isoLokal(new Date())}.json`, keJson(k.p));
      st.terbuka = false;
      k.gambar();
      return true;
    case 'cdUnduhLengkap':
      st.sibuk = true;
      st.galat = '';
      k.gambar();
      void kumpulkanCadangan(gudangPeramban, { drafSaatIni: k.p, sertakanBrankas: st.brankas })
        .then((paket) => {
          unduh(`cadangan-jadwal-${isoLokal(new Date())}.json`, serialCadangan(paket));
          st.terbuka = false;
          k.lapor(`Cadangan diunduh: ${paket.dataset.length} dataset${paket.brankas ? ', beserta brankas terenkripsi' : ''}.`);
        })
        .catch((e) => {
          st.galat = e instanceof Error ? e.message : String(e);
        })
        .finally(() => {
          st.sibuk = false;
          k.gambar();
        });
      return true;
  }
  return false;
}

/** Berkas yang dipilih lewat tombol Impor. Mengembalikan proyek bila isinya hanya proyek (diterapkan pemanggil seperti biasa). */
export async function imporBerkas(k: Konteks, teks: string): Promise<{ jenis: 'proyek'; proyek: Proyek } | { jenis: 'selesai' } | { jenis: 'galat'; galat: string }> {
  const h = bacaBerkasImpor(teks);
  if (h.jenis === 'galat') return { jenis: 'galat', galat: h.galat.join(' | ') };
  if (h.jenis === 'proyek') return { jenis: 'proyek', proyek: h.proyek };
  const paket: PaketCadangan = h.paket;
  const daftar = ringkasCadangan(paket).map((x) => `• ${x}`).join('\n');
  const tambahan = h.peringatan.length ? `\n\nDilewati:\n${h.peringatan.map((x) => `• ${x}`).join('\n')}` : '';
  if (!confirm(`Impor cadangan${paket.dibuat ? ` (dibuat ${new Date(paket.dibuat).toLocaleString('id-ID')})` : ''}?\n\n${daftar}${tambahan}\n\nHalaman dimuat ulang setelah impor dan tidak bisa diurungkan dengan Ctrl+Z. Ekspor cadangan dulu bila perlu.`)) return { jenis: 'selesai' };
  await terapkanCadangan(gudangPeramban, paket);
  k.lapor('Cadangan diimpor. Memuat ulang…');
  window.setTimeout(() => location.reload(), 700);
  return { jenis: 'selesai' };
}

/** Menutup modal (tombol Esc). */
export function tutupCadangan(): boolean {
  if (!st.terbuka) return false;
  st.terbuka = false;
  return true;
}
