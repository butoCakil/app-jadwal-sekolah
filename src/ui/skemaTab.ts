import type { BarisSkema, JenisBaris, PolaMinggu, Proyek, Skema } from '../model/tipe';
import { hitungSkema, jumlahJamTampil, kapasitasKbm, keMenit } from '../model/skema';
import { daftarPola, jadikanDefault, jumlahHariKerja, kapasitasPola, pemakaiPola, polaDariId, selisihKapasitas, tambahPola, ubahJumlahHari } from '../model/kalender';
import { NAMA_HARI } from '../model/tipe';
import { esc } from './util';
import type { Konteks } from './konteks';
import { barisPola, klikKalender, renderKalender, ubahKalender } from './kalenderTab';

/** Istilah yang tampil di layar; satu tempat agar mudah diselaraskan. */
const ISTILAH = { pola: 'Skema mingguan', polaMingguan: 'Skema mingguan', templateSkema: 'Template skema jam' } as const;

const SUB = [
  { id: 'kalender', label: 'Kalender akademik & periode' },
  { id: 'pola', label: ISTILAH.polaMingguan },
  { id: 'skema', label: ISTILAH.templateSkema },
] as const;

const WARNA_BARU = ['#b45309', '#0e7490', '#6d28d9', '#be123c', '#4d7c0f', '#0f766e'];

function bagianPola(p: Proyek): string {
  const n = jumlahHariKerja(p);
  const hariKerja = `<section class="mb-5 rounded-xl border border-slate-200 bg-white p-3"><div class="flex flex-wrap items-center gap-3"><h2 class="text-base font-semibold">Hari kerja per pekan</h2>
      <div class="inline-flex rounded-lg border border-slate-300 bg-white p-0.5">${[5, 6].map((x) => `<button class="rounded-md px-3 py-1 text-sm font-medium ${x === n ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}" data-aksi="hariKerja" data-n="${x}">${x} hari (Senin–${NAMA_HARI[x - 1]})</button>`).join('')}</div>
      <span class="text-xs text-slate-500">Hari di luar ini dianggap libur: tidak ada KBM dan tidak dihitung di kalender. Hari baru (Sabtu) memakai skema pertama; ubah di daftar skema mingguan di bawah.</span></div></section>`;
  const ringkasPola = (pola: PolaMinggu) => pola.map((id) => labelSkema(p, id)).join(' · ');
  const daftar = daftarPola(p)
    .map((x) => {
      const pakai = pemakaiPola(p, x.id).filter((y) => y !== 'skema mingguan default');
      const kapPola = kapasitasPola(x.pola, p.skema);
      const kap = kapPola.total;
      const selisih = x.default ? selisihKapasitas(p.master.rombel, kapPola).length : 0;
      return `<button class="kartu flex w-full items-center gap-3 p-3 text-left hover:bg-slate-50 ${x.default ? '!border-sky-400' : ''}" data-aksi="dsBuka" data-jenis="pola" data-id="${esc(x.id)}">
        <span class="min-w-0 flex-1"><span class="block truncate font-semibold">${esc(x.nama)}</span><span class="block text-xs text-slate-500">${esc(ringkasPola(x.pola))} · ${kap} JP${pakai.length ? ` · dipakai ${pakai.length} periode` : ''}</span></span>
        ${selisih ? `<span class="lencana bg-red-100 text-red-800" title="Kapasitas tidak sama dengan kebutuhan; buka untuk rinciannya">⚠ ${selisih} kelas selisih</span>` : ''}${x.default ? '<span class="lencana bg-sky-100 text-sky-800">✓ Default</span>' : ''}<span class="text-slate-400">›</span></button>`;
    })
    .join('');
  const manual = p.penggantiManual;
  const blokManual = manual
    ? `<section class="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-3"><h2 class="mb-1 text-base font-semibold">Penggantian manual (format lama)</h2><div class="mb-2 text-xs text-slate-600">Menimpa semua skema mingguan sampai dilepas. Sebaiknya lepas, lalu pasang skema mingguan yang diinginkan pada kegiatan di kalender.</div>
        ${barisPola(p, manual.pola, 'manual')}
        <div class="mt-2 flex flex-wrap items-center gap-2 text-xs">Berlaku <input type="date" class="isian" value="${esc(manual.mulai ?? '')}" data-aksi="manualMulai"> s/d <input type="date" class="isian" value="${esc(manual.selesai ?? '')}" data-aksi="manualSelesai"> <span class="text-slate-500">(kosong = semua tanggal)</span> <button class="tombol" data-aksi="hapusManual">Lepas penggantian manual</button></div></section>`
    : '';
  return `${hariKerja}<section><div class="mb-2 flex flex-wrap items-center gap-3"><h2 class="text-lg font-semibold">${ISTILAH.polaMingguan}</h2><button class="tombol-utama" data-aksi="polaBaru">+ Skema mingguan baru</button>
      <span class="text-xs text-slate-500">Kombinasi template skema jam untuk tiap hari kerja dalam sepekan (mis. 11·10·10·11·9). Skema mingguan baru dimulai dari kosong (semua hari memakai template pertama). Satu skema mingguan menjadi default; yang lain dipasang pada periode di kalender (mis. ASAS atau bulan puasa).</span></div>
    <div class="space-y-2">${daftar}</div></section>${blokManual}`;
}

function kartuSkema(p: Proyek, s: Skema): string {
  const hit = hitungSkema(s);
  const dipakai = pemakaiSkema(p, s.id);
  const baris = hit
    .map(
      (b, i) => `<div class="flex flex-wrap items-center gap-1.5 border-t border-slate-100 py-1.5 text-xs">
          <span class="w-6 font-semibold">${b.label}</span><span class="w-24 text-slate-500">${b.mulai}–${b.selesai}</span>
          <select class="isian !w-28 !px-1" data-aksi="tipeBaris" data-skema="${esc(s.id)}" data-i="${i}">
            ${(['nonKbm', 'kbm', 'istirahat'] as const).map((t) => `<option value="${t}" ${t === b.baris.tipe ? 'selected' : ''}>${t === 'nonKbm' ? 'non-KBM (jam 0)' : t === 'kbm' ? 'pelajaran' : 'istirahat'}</option>`).join('')}</select>
          <input class="isian min-w-0 flex-1 basis-24" value="${esc(b.baris.kegiatan)}" data-aksi="kegiatanBaris" data-skema="${esc(s.id)}" data-i="${i}">
          <input class="isian !w-16" type="number" min="1" value="${b.baris.durasi}" data-aksi="durasiBaris" data-skema="${esc(s.id)}" data-i="${i}"><span class="text-slate-400">mnt</span>
          <button class="px-1 text-red-600" data-aksi="hapusBaris" data-skema="${esc(s.id)}" data-i="${i}" title="Hapus baris">✕</button></div>`,
    )
    .join('');
  return `<div class="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div class="px-3 py-2 text-white" style="background:${esc(s.warna)}">
          <input class="w-full rounded bg-white/15 px-1.5 py-0.5 font-semibold text-white placeholder-white/70 outline-none focus:bg-white/25" value="${esc(s.nama)}" data-aksi="namaSkema" data-skema="${esc(s.id)}" title="Nama skema (bisa diubah)">
          <div class="mt-0.5 text-xs opacity-90">${jumlahJamTampil(s)} jam tampil · ${kapasitasKbm(s)} JP pelajaran</div></div>
        <div class="p-2"><div class="flex flex-wrap items-center gap-2"><label class="text-xs text-slate-600">Mulai <input class="isian w-20" value="${esc(s.jamMulai)}" data-aksi="jamMulai" data-skema="${esc(s.id)}"></label>
          <label class="text-xs text-slate-600">Warna <input type="color" class="h-7 w-9 cursor-pointer rounded border border-slate-300 p-0" value="${esc(s.warna)}" data-aksi="warnaSkema" data-skema="${esc(s.id)}"></label></div>
        <div class="mt-2">${baris}</div>
        <div class="mt-2 flex flex-wrap gap-2"><button class="tombol" data-aksi="tambahBaris" data-skema="${esc(s.id)}" data-tipe="kbm">+ pelajaran</button>
        <button class="tombol" data-aksi="tambahBaris" data-skema="${esc(s.id)}" data-tipe="istirahat">+ istirahat</button>
        <button class="tombol" data-aksi="salinSkema" data-skema="${esc(s.id)}" title="Membuat skema baru dari salinan skema ini, mis. untuk bulan puasa">Salin sebagai skema baru</button>
        <button class="tombol !text-red-600 disabled:opacity-40" data-aksi="hapusSkema" data-skema="${esc(s.id)}" ${dipakai.length ? 'disabled' : ''} title="${dipakai.length ? `Masih dipakai: ${esc(dipakai.join(', '))}` : 'Hapus skema'}">Hapus</button></div>
        ${dipakai.length ? `<div class="mt-1 text-[11px] text-slate-500">Dipakai: ${esc(dipakai.join(', '))}</div>` : ''}</div></div>`;
}

/** Tempat skema dipakai (pola reguler, manual, kegiatan); skema yang dipakai tidak boleh dihapus. */
function pemakaiSkema(p: Proyek, id: string): string[] {
  const ket: string[] = [];
  for (const x of daftarPola(p)) if (x.pola.includes(id)) ket.push(x.default ? `skema mingguan default “${x.nama}”` : `skema mingguan “${x.nama}”`);
  if (p.penggantiManual?.pola.includes(id)) ket.push('penggantian manual');
  for (const g of p.kalender) if (g.pola?.includes(id)) ket.push(g.nama);
  return ket;
}

function bagianSkema(p: Proyek): string {
  const baris = p.skema
    .map((x) => {
      const dipakai = pemakaiSkema(p, x.id);
      return `<button class="kartu flex w-full items-center gap-3 p-3 text-left hover:bg-slate-50" data-aksi="dsBuka" data-jenis="skema" data-id="${esc(x.id)}">
        <span class="h-9 w-1.5 shrink-0 rounded" style="background:${esc(x.warna)}"></span>
        <span class="min-w-0 flex-1"><span class="block truncate font-semibold">${esc(x.nama)}</span><span class="block text-xs text-slate-500">${jumlahJamTampil(x)} jam tampil · ${kapasitasKbm(x)} JP pelajaran · mulai ${esc(x.jamMulai)}${dipakai.length ? ` · dipakai ${dipakai.length} tempat` : ''}</span></span><span class="text-slate-400">›</span></button>`;
    })
    .join('');
  return `<section><div class="mb-2 flex flex-wrap items-center gap-3"><h2 class="text-lg font-semibold">${ISTILAH.templateSkema}</h2>
      <button class="tombol-utama" data-aksi="skemaBaru">+ Skema baru</button>
      <span class="text-xs text-slate-500">Mis. skema khusus bulan puasa. Klik satu skema untuk mengubah baris dan durasinya, lalu pasang di ${ISTILAH.polaMingguan} atau pada periode di kalender.</span></div>
    <div class="space-y-2">${baris}</div></section>`;
}

/** Label singkat skema untuk ringkasan (“Skema 11 Jam/Hari” menjadi “11”). */
function labelSkema(p: Proyek, id: string): string {
  const x = p.skema.find((y) => y.id === id);
  if (!x) return '?';
  return /^Skema\s+(\S+)/i.exec(x.nama)?.[1] ?? x.nama;
}

function isiPolaModal(p: Proyek, id: string): string {
  const x = daftarPola(p).find((y) => y.id === id);
  if (!x) return '';
  const pakai = pemakaiPola(p, x.id).filter((y) => y !== 'skema mingguan default');
  const bisaHapus = !x.default && pakai.length === 0;
  const sel = x.default ? selisihKapasitas(p.master.rombel, kapasitasPola(x.pola, p.skema)) : [];
  const infoSelisih = sel.length
    ? `<details class="mt-2 rounded-lg bg-red-50 p-2 text-xs text-red-800"><summary class="cursor-pointer font-semibold">⚠ ${sel.length} kelas: kapasitas tidak sama dengan kebutuhan (diputuskan manual)</summary><div class="mt-1">${sel.map((y) => `${esc(p.master.rombel.find((r) => r.id === y.rombelId)?.kode ?? y.rombelId)} butuh ${y.butuh}, tersedia ${y.kapasitas}`).join('; ')}</div></details>`
    : '';
  return `<label class="block text-xs font-semibold text-slate-600">Nama<input class="isian mt-1 w-full font-semibold" value="${esc(x.nama)}" data-aksi="namaPola" data-id="${esc(x.id)}"></label>
    <div class="mt-3">${barisPola(p, x.pola, `p:${x.id}`)}</div>${infoSelisih}
    <div class="mt-2 text-[11px] text-slate-500">${x.default ? 'Dipakai bila periode di kalender tidak memilih yang lain.' : pakai.length ? `Dipakai oleh: ${esc(pakai.join(', '))}` : 'Belum dipakai periode mana pun; pasang lewat kegiatan di kalender (Periode & Jadwal > Ubah info…).'}</div>
    <div class="mt-3 flex flex-wrap items-center gap-2">
      ${x.default ? '<span class="lencana bg-sky-100 text-sky-800">✓ Default</span>' : `<button class="tombol" data-aksi="polaDefault" data-id="${esc(x.id)}" title="Jadikan default; yang lama tetap tersimpan">Jadikan default</button>`}
      <button class="tombol" data-aksi="polaSalin" data-id="${esc(x.id)}">Salin</button>
      <button class="tombol !text-red-600 disabled:opacity-40" data-aksi="polaHapus" data-id="${esc(x.id)}" ${bisaHapus ? '' : 'disabled'} title="${x.default ? 'Yang default tidak bisa dihapus; jadikan yang lain default dulu' : pakai.length ? `Dipakai: ${esc(pakai.join(', '))}` : 'Hapus'}">Hapus</button></div>`;
}

/** Modal ubah satu pola atau skema (daftar di tab hanya ringkasan). */
export function renderDlgSkema(k: Konteks): string {
  const d = k.ui.dlgSkema;
  if (!d) return '';
  const p = k.p;
  let judul = '';
  let isi = '';
  if (d.jenis === 'pola') {
    judul = daftarPola(p).find((y) => y.id === d.id)?.nama ?? ISTILAH.pola;
    isi = isiPolaModal(p, d.id);
  } else {
    const x = p.skema.find((y) => y.id === d.id);
    judul = x?.nama ?? '';
    isi = x ? kartuSkema(p, x) : '';
  }
  if (!isi) return '';
  return `<div class="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4" data-aksi="dsTutup">
    <div id="dlgSkemaIsi" class="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl" data-aksi="dsDiam">
      <div class="mb-3 flex items-center justify-between gap-2"><h3 class="min-w-0 truncate text-lg font-bold">${esc(judul)}</h3><button class="px-2 text-xl leading-none text-slate-500 hover:text-slate-900" data-aksi="dsTutup" title="Tutup (Esc)">×</button></div>
      ${isi}
      <div class="mt-4 text-right"><button class="tombol-utama" data-aksi="dsTutup">Selesai</button></div></div></div>`;
}

export function renderSkemaTab(k: Konteks): string {
  const sub = k.ui.skemaSub;
  const isi = sub === 'kalender' ? renderKalender(k) : sub === 'pola' ? bagianPola(k.p) : bagianSkema(k.p);
  return `<div class="mb-3 flex flex-wrap gap-1 border-b border-slate-200">${SUB.map((s) => `<button data-aksi="skemaSub" data-sub="${s.id}" class="-mb-px border-b-2 px-3 py-1.5 text-sm font-medium ${s.id === sub ? 'border-[#2347b8] text-[#2347b8]' : 'border-transparent text-slate-500 hover:text-slate-800'}">${s.label}</button>`).join('')}</div>${isi}`;
}

const polaDari = (p: Proyek, kunci: string): PolaMinggu | undefined => (kunci === 'manual' ? p.penggantiManual?.pola : kunci.startsWith('p:') ? polaDariId(p, kunci.slice(2)) : undefined);

const idSkemaBaru = (p: Proyek): string => {
  let n = p.skema.length + 1;
  while (p.skema.some((s) => s.id === `skema_${n}`)) n++;
  return `skema_${n}`;
};

export function klikSkema(k: Konteks, el: HTMLElement): boolean {
  if (klikKalender(k, el)) return true;
  const d = el.dataset;
  const skema = () => k.p.skema.find((s) => s.id === d.skema);
  switch (d.aksi) {
    case 'skemaSub':
      k.ui.skemaSub = d.sub as 'kalender' | 'pola' | 'skema';
      k.gambar();
      return true;
    case 'dsBuka':
      k.ui.dlgSkema = { jenis: d.jenis as 'pola' | 'skema', id: d.id ?? '' };
      k.gambar();
      return true;
    case 'dsDiam':
      return true;
    case 'dsTutup':
      k.ui.dlgSkema = null;
      k.gambar();
      return true;
    case 'hapusBaris':
      k.ubah(() => void skema()?.baris.splice(Number(d.i), 1));
      return true;
    case 'tambahBaris':
      k.ubah(() => {
        const s = skema();
        if (!s) return;
        const tipe = d.tipe as JenisBaris;
        const baru: BarisSkema = { id: `${s.id}_${Date.now()}`, tipe, kegiatan: tipe === 'istirahat' ? 'Istirahat' : 'Pelajaran', durasi: tipe === 'istirahat' ? 15 : 40 };
        s.baris.push(baru);
      });
      return true;
    case 'skemaBaru':
    case 'salinSkema':
      k.ubah((x) => {
        const sumber = d.aksi === 'salinSkema' ? x.skema.find((s) => s.id === d.skema) : x.skema[0];
        if (!sumber) return;
        const id = idSkemaBaru(x);
        k.ui.dlgSkema = { jenis: 'skema', id };
        x.skema.push({
          id,
          nama: `${sumber.nama.replace(/ \(salinan.*\)$/, '')} (salinan)`,
          jamMulai: sumber.jamMulai,
          warna: WARNA_BARU[x.skema.length % WARNA_BARU.length] as string,
          baris: sumber.baris.map((b, i) => ({ ...b, id: `${id}_${i}` })),
        });
      });
      k.lapor('Skema baru ditambahkan di akhir daftar. Ubah nama, baris, dan durasinya, lalu pasang di Skema mingguan atau pada periode.');
      return true;
    case 'hapusSkema': {
      const s = skema();
      if (!s || pemakaiSkema(k.p, s.id).length) return true;
      if (k.p.skema.length <= 1) {
        k.lapor('Skema terakhir tidak bisa dihapus.');
        return true;
      }
      if (!confirm(`Hapus skema “${s.nama}”?`)) return true;
      k.ui.dlgSkema = null;
      k.ubah((x) => void (x.skema = x.skema.filter((y) => y.id !== d.skema)));
      return true;
    }
    case 'hariKerja': {
      const n = Number(d.n);
      if (n === jumlahHariKerja(k.p)) return true;
      const terpakai = n < jumlahHariKerja(k.p) ? k.p.versi.reduce((a, v) => a + v.slots.filter((sl) => sl.hari >= n).length, 0) : 0;
      if (terpakai && !confirm(`${terpakai} JP terjadwal pada hari yang dihapus (${NAMA_HARI[n] ?? ''} dst) akan keluar dari kapasitas dan tampil di Tampungan. Lanjutkan?`)) return true;
      k.ubah((x) => ubahJumlahHari(x, n));
      k.lapor(`Hari kerja diubah menjadi ${n} hari (Senin–${NAMA_HARI[n - 1]}).`);
      return true;
    }
    case 'polaBaru':
    case 'polaSalin': {
      const sumber = d.aksi === 'polaSalin' ? daftarPola(k.p).find((x) => x.id === d.id) : undefined;
      k.ubah((x) => {
        const id = tambahPola(x, sumber ? `${sumber.nama} (salinan)` : `Skema mingguan ${(x.polaLain?.length ?? 0) + 2}`, sumber?.id);
        k.ui.dlgSkema = { jenis: 'pola', id };
      });
      k.lapor('Skema mingguan baru ditambahkan di akhir daftar. Ubah nama dan template skema tiap harinya.');
      return true;
    }
    case 'polaDefault': {
      const x = daftarPola(k.p).find((y) => y.id === d.id);
      if (!x) return true;
      k.ubah((pp) => jadikanDefault(pp, x.id));
      k.lapor(`“${x.nama}” kini menjadi skema mingguan default.`);
      return true;
    }
    case 'polaHapus': {
      const x = daftarPola(k.p).find((y) => y.id === d.id);
      if (!x || x.default || pemakaiPola(k.p, x.id).length) return true;
      if (!confirm(`Hapus skema mingguan “${x.nama}”?`)) return true;
      k.ui.dlgSkema = null;
      k.ubah((pp) => void (pp.polaLain = (pp.polaLain ?? []).filter((y) => y.id !== x.id)));
      return true;
    }
    case 'hapusManual':
      k.ubah((x) => void (x.penggantiManual = null));
      return true;
  }
  return false;
}

export function ubahSkema(k: Konteks, el: HTMLInputElement & HTMLSelectElement): boolean {
  if (ubahKalender(k, el)) return true;
  const d = el.dataset;
  const skema = () => k.p.skema.find((s) => s.id === d.skema);
  const baris = () => skema()?.baris[Number(d.i)];
  switch (d.aksi) {
    case 'pola':
      k.ubah((x) => {
        const pola = polaDari(x, d.kunci ?? '');
        if (pola) pola[Number(d.hari)] = el.value;
      });
      return true;
    case 'namaPola': {
      const nama = el.value.trim();
      if (!nama) {
        k.lapor('Nama skema mingguan tidak boleh kosong.');
        k.gambar();
        return true;
      }
      k.ubah((x) => {
        if ((x.polaRegulerId ?? 'reguler') === d.id) x.polaRegulerNama = nama;
        else {
          const y = x.polaLain?.find((z) => z.id === d.id);
          if (y) y.nama = nama;
        }
      });
      return true;
    }
    case 'namaSkema':
      if (!el.value.trim()) {
        k.lapor('Nama skema tidak boleh kosong.');
        k.gambar();
        return true;
      }
      k.ubah(() => void (skema() && (skema()!.nama = el.value.trim())));
      return true;
    case 'warnaSkema':
      k.ubah(() => void (skema() && (skema()!.warna = el.value)));
      return true;
    case 'jamMulai':
      try {
        keMenit(el.value.trim());
      } catch (err) {
        k.lapor(`Jam mulai ditolak: ${(err as Error).message}`);
        k.gambar();
        return true;
      }
      k.ubah(() => void (skema() && (skema()!.jamMulai = el.value.trim())));
      return true;
    case 'tipeBaris':
      k.ubah(() => void (baris() && (baris()!.tipe = el.value as JenisBaris)));
      return true;
    case 'kegiatanBaris':
      k.ubah(() => void (baris() && (baris()!.kegiatan = el.value)));
      return true;
    case 'durasiBaris':
      k.ubah(() => void (baris() && (baris()!.durasi = Number(el.value))));
      return true;
    case 'manualMulai':
    case 'manualSelesai': {
      const kunci = d.aksi === 'manualMulai' ? 'mulai' : 'selesai';
      k.ubah((x) => {
        if (!x.penggantiManual) return;
        if (el.value) x.penggantiManual[kunci] = el.value;
        else delete x.penggantiManual[kunci];
      });
      return true;
    }
  }
  return false;
}
