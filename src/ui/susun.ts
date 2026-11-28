import { ruangDiluarPrioritas, type HasilSusun, type Kemajuan } from '../mesin/solver';
import type { Beban, Proyek, Slot } from '../model/tipe';
import type { AturanPekan } from '../model/aturanKegiatan';
import type { Fokus } from '../model/simpul';
import { esc } from './util';
import { polaUntukTanggal } from '../model/kalender';
import { kalenderFokus, modelWarisan, terdampak, versiSemester } from '../model/simpul';
import type { Konteks, Turunan } from './konteks';

type Mode = 'nol' | 'lengkapi' | 'induk';
interface Status {
  mode: Mode;
  detik: number;
  /** ruang prioritas beban boleh diganti ruang lain yang diizinkan bila penuh atau terkunci */
  lunak: boolean;
  jalan: boolean;
  kemajuan: Kemajuan | null;
  hasil: HasilSusun | null;
  /** beban yang dipakai pada penyusunan terakhir (pada kegiatan: beban kegiatan, bukan beban induk) */
  bebanHasil: Beban[];
  galat: string;
}
const st: Status = { mode: 'nol', detik: 0, lunak: true, jalan: false, kemajuan: null, hasil: null, bebanHasil: [], galat: '' };
let pekerja: PekerjaSusun | null = null;

const bar = (m: Kemajuan | null) => {
  const pct = m && m.total ? Math.round((m.terjadwal / m.total) * 100) : 0;
  return `<div class="h-2 overflow-hidden rounded-full bg-slate-200"><div class="h-full bg-emerald-500 transition-all" style="width:${pct}%"></div></div>
    <div class="mt-1 text-xs text-slate-600">${m ? `${m.terjadwal} dari ${m.total} JP tertempatkan · biaya ${m.biaya} · ${(m.ms / 1000).toFixed(1)} dtk` : 'Memulai…'}</div>`;
};

export function renderSusun(k: Konteks): string {
  const p = k.p;
  const versi = k.turunan.versi;
  const kini = k.turunan.slots.length;
  const tdkAktif = k.turunan.rombelTidakAktif;
  const polaAktif = polaUntukTanggal(k.ui.tanggal, { ...p, kalender: kalenderFokus(p, k.ui.fokus) }).pola;
  const pola = polaAktif.map((id) => p.skema.find((s) => s.id === id)?.nama.replace(/ Jam\/Hari/, '') ?? '?').join(' · ');
  const kegiatanAktif = !!k.turunan.periode && modelWarisan(k.turunan.periode);
  const opsi = `<div class="mt-3 grid gap-3 sm:grid-cols-2">
      <fieldset class="rounded-lg border border-slate-200 p-3 text-sm"><legend class="px-1 text-xs font-semibold text-slate-500">Cara</legend>
        <label class="flex items-start gap-2"><input type="radio" name="modeSusun" value="nol" ${st.mode === 'nol' ? 'checked' : ''}><span><b>Susun dari nol</b><br><span class="text-xs text-slate-500">Mengganti seluruh jadwal versi “${esc(versi?.nama ?? '—')}” (${kini} slot sekarang).</span></span></label>
        <label class="mt-2 flex items-start gap-2"><input type="radio" name="modeSusun" value="lengkapi" ${st.mode === 'lengkapi' ? 'checked' : ''}><span><b>Lengkapi</b><br><span class="text-xs text-slate-500">Mempertahankan slot yang sudah ada, hanya mengisi sisa JP.</span></span></label>
        ${kegiatanAktif ? `<label class="mt-2 flex items-start gap-2"><input type="radio" name="modeSusun" value="induk" ${st.mode === 'induk' ? 'checked' : ''}><span><b>Mulai dari jadwal induk</b><br><span class="text-xs text-slate-500">Kelas terdampak mulai dari jadwal induknya; hanya pertemuan yang melanggar aturan kegiatan (ruang terkunci, pengawas) yang digeser, sisanya diusahakan tetap.</span></span></label>` : ''}</fieldset>
      <fieldset class="rounded-lg border border-slate-200 p-3 text-sm"><legend class="px-1 text-xs font-semibold text-slate-500">Waktu menyusun</legend>
        <select id="detikSusun" class="isian">${[0, 10, 20, 40, 120].map((d) => `<option value="${d}" ${st.detik === d ? 'selected' : ''}>${d === 0 ? 'Otomatis (sampai tidak membaik)' : `${d} detik`}</option>`).join('')}</select>
        <div class="mt-2 text-xs text-slate-500">${st.detik === 0 ? 'Berhenti sendiri bila selama 15 detik tidak ada perbaikan (paling lama 4 menit). Di ponsel penyusunan bisa lebih lambat daripada di komputer.' : 'Batas waktu keras: penyusunan berhenti pada waktu itu dengan hasil terbaik yang sudah ada.'} Lebih lama = jadwal lebih rapi (lebih sedikit jam kosong di tengah hari).</div>
        <label class="mt-3 flex items-start gap-2"><input type="checkbox" id="lunakSusun" ${st.lunak ? 'checked' : ''}><span><b>Ruang prioritas boleh diganti</b><br><span class="text-xs text-slate-500">${kegiatanAktif ? 'Pada kegiatan, ruang prioritas hanya pilihan utama: bila penuh atau terkunci, dipakai ruang lain yang diizinkan.' : 'Pada jadwal reguler, ruang prioritas dijaga ketat: ruang lain dipakai hanya bila tanpa itu ada JP yang tidak muat.'} Ruang terlarang tetap tidak dipakai. Matikan agar ruang prioritas wajib.</span></span></label></fieldset></div>`;
  let bagian = '';
  if (st.jalan) {
    bagian = `<div class="mt-4 rounded-lg bg-slate-50 p-3" id="kemajuanSusun">${bar(st.kemajuan)}</div>
      <div class="mt-3"><button class="tombol" data-aksi="susunBatal">Batalkan</button></div>`;
  } else {
    bagian = `<div class="mt-4"><button class="tombol !bg-[#2347b8] !text-white" data-aksi="susunMulai" ${k.turunan.beban.length === 0 ? 'disabled' : ''}>Mulai menyusun</button></div>`;
  }
  if (st.galat) bagian += `<div class="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">${esc(st.galat)}</div>`;
  const h = st.hasil;
  if (h && !st.jalan) {
    const rb = new Map(p.master.rombel.map((r) => [r.id, r.kode]));
    const mp = new Map(p.master.mapel.map((m) => [m.id, m.kode]));
    const gr = new Map(p.master.guru.map((g) => [g.id, g.kode]));
    const bebanById = new Map(st.bebanHasil.map((b) => [b.id, b]));
    const ruangKode = new Map(p.master.ruang.map((r) => [r.id, r.kode]));
    const pindah = ruangDiluarPrioritas({ ...p, beban: st.bebanHasil }, h.slots)
      .map((x) => ({ x, b: bebanById.get(x.bebanId) }))
      .filter((y) => y.b)
      .sort((a, b) => (rb.get(a.b?.rombelId ?? '') ?? '').localeCompare(rb.get(b.b?.rombelId ?? '') ?? ''));
    const pindahJp = pindah.reduce((a, y) => a + y.x.jp, 0);
    const kodeRuang = (ids: string[]) => ids.map((id) => ruangKode.get(id) ?? '?').join(', ');
    const pindahHtml = pindah.length
      ? `<div class="mt-3"><div class="mb-1 text-sm font-semibold">${pindah.length} beban memakai ruang di luar prioritas (${pindahJp} JP) — mohon diperiksa</div>
        <div class="max-h-60 overflow-auto rounded-lg border border-slate-200"><table class="w-full text-xs">${pindah
          .map(({ x, b }) => `<tr class="border-t border-slate-100 first:border-0"><td class="px-2 py-1 font-semibold">${esc(rb.get(b?.rombelId ?? '') ?? '?')}</td><td class="px-2 py-1 font-mono">${esc(mp.get(b?.mapelId ?? '') ?? '?')}</td><td class="px-2 py-1 font-mono text-slate-500">${esc(gr.get(b?.guruId ?? '') ?? '?')}</td><td class="px-2 py-1 text-right">${x.jp} JP</td><td class="px-2 py-1 text-slate-600">prioritas ${esc(kodeRuang(b?.ruangPrioritas ?? []))} → dipakai ${esc(kodeRuang(x.ruangIds))}</td></tr>`)
          .join('')}</table></div></div>`
      : '';
    const baris = h.sisa
      .map((s) => ({ s, b: bebanById.get(s.bebanId) }))
      .filter((x) => x.b)
      .sort((a, b) => (rb.get(a.b?.rombelId ?? '') ?? '').localeCompare(rb.get(b.b?.rombelId ?? '') ?? ''));
    const kapasitas = h.peringatan.length
      ? `<div class="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"><div class="mb-1 font-semibold">Kapasitas jam</div><ul class="list-disc space-y-0.5 pl-5">${h.peringatan.slice(0, 40).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>`
      : '';
    const sisa = baris.length
      ? `<div class="mt-3"><div class="mb-1 text-sm font-semibold">${baris.length} beban belum penuh (${h.total - h.terjadwal} JP) — perlu keputusan Anda</div>
        <div class="max-h-80 overflow-auto rounded-lg border border-slate-200"><table class="w-full text-xs">${baris
          .map(({ s, b }) => `<tr class="border-t border-slate-100 first:border-0"><td class="px-2 py-1 font-semibold">${esc(rb.get(b?.rombelId ?? '') ?? '?')}</td><td class="px-2 py-1 font-mono">${esc(mp.get(b?.mapelId ?? '') ?? '?')}</td><td class="px-2 py-1 font-mono text-slate-500">${esc(gr.get(b?.guruId ?? '') ?? '?')}</td><td class="px-2 py-1 text-right">${s.jpSisa} JP</td><td class="px-2 py-1 text-slate-600">${esc(s.alasan)}</td></tr>`)
          .join('')}</table></div></div>`
      : '<div class="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">Semua JP tertempatkan.</div>';
    bagian += `<div class="mt-5 rounded-xl border border-slate-200 p-4">
      <div class="flex flex-wrap items-center gap-3"><div class="text-base font-bold">Hasil: ${h.terjadwal} dari ${h.total} JP tertempatkan</div><div class="text-xs text-slate-500">0 bentrok · ${(h.ms / 1000).toFixed(1)} dtk · biaya kerapian ${h.biaya} (makin kecil makin rapi)</div>
        <div class="ml-auto flex gap-2"><button class="tombol !bg-emerald-600 !text-white" data-aksi="susunTerapkan">Terapkan ke jadwal</button><button class="tombol" data-aksi="susunBuang">Buang</button></div></div>
      ${kapasitas}${sisa}${pindahHtml}
      <div class="mt-2 text-xs text-slate-500">Menerapkan dapat dibatalkan dengan Urungkan. Hasil dilihat dulu di tab Grid Jadwal setelah diterapkan.</div></div>`;
  }
  return `<h2 class="mb-3 text-lg font-bold">Susun Otomatis</h2>
    <div class="kartu p-4"><div class="text-sm text-slate-600">Menempatkan JP semua beban (${k.turunan.beban.filter((b) => !b.nonTatapMuka).length} beban tatap muka) ke versi “${esc(versi?.nama ?? '—')}” tanpa bentrok guru, rombel, atau ruang, dengan memperhatikan guru tidak tersedia, ruang terlarang, jenis ruang per mapel, pola pertemuan, dan kelompok paralel. Yang tidak muat <b>tidak dipaksakan</b>: dilaporkan beserta alasannya.</div>
      <div class="mt-2 text-xs text-slate-500">Kapasitas jam mengikuti skema mingguan pada tanggal acuan (${esc(k.ui.tanggal)}): ${esc(pola)} (Senin–Jum'at). Sasaran (induk atau kegiatan) dipilih di halaman Periode &amp; Jadwal; pada kegiatan, kelas yang ikut induk tidak disusun ulang.${tdkAktif.size ? ` ${tdkAktif.size} rombel tidak aktif (PKL) dilewati.` : ''}</div>
      ${opsi}${bagian}</div>`;
}


/** Mengatur pilihan penyusunan (dipakai asisten AI sebelum menjalankan penyusunan). `cara: 'induk'` hanya berlaku pada kegiatan. */
export function aturSusun(o: { cara?: Mode; detik?: number; lunak?: boolean }, kegiatanAktif: boolean): void {
  if (o.cara) st.mode = o.cara === 'induk' && !kegiatanAktif ? 'nol' : o.cara;
  if (o.detik) st.detik = o.detik;
  if (o.lunak !== undefined) st.lunak = o.lunak;
}

/** Pengamat hasil penyusunan (asisten AI melaporkan hasilnya ke percakapan). */
let pengamat: ((h: HasilSusun) => void) | null = null;
export function pasangPengamatSusun(fn: ((h: HasilSusun) => void) | null): void {
  pengamat = fn;
}

/** Pesan untuk pekerja latar solver. */
export interface PesanSusun {
  p: Proyek;
  skemaPerHari: (string | null)[];
  tetap: Slot[];
  awal: Slot[] | undefined;
  aturan: AturanPekan;
  kedalaman: number;
  prioritasLunak: boolean | 'bilaPerlu';
  batasMs: number;
  sabarMs?: number;
  sertakanSlot?: boolean;
}

export interface PilihanSusun {
  mode: Mode;
  /** 0 = otomatis (berhenti bila tidak membaik) */
  detik: number;
  lunak: boolean;
  sertakanSlot?: boolean;
}

/**
 * Menyiapkan penyusunan untuk satu sasaran (turunan `t` pada `fokus` dan `tanggal`) tanpa menyentuh tampilan:
 * beban yang dipakai, slot tetap, jadwal awal, dan pesan untuk pekerja.
 */
export function siapkanSusun(p: Proyek, t: Turunan, fokus: Fokus, tanggal: string, o: PilihanSusun): { pesan: PesanSusun; beban: Beban[]; mode: Mode } {
  const kloning = structuredClone(p);
  const tdk = t.rombelTidakAktif;
  const g = t.periode;
  const kegiatan = !!g && modelWarisan(g);
  const mode: Mode = o.mode === 'induk' && !kegiatan ? 'nol' : o.mode;
  const rombelBeban = new Map(p.beban.map((b) => [b.id, b.rombelId]));
  // pada kegiatan model warisan, kelas yang ikut induk tidak disusun ulang: jadwalnya dipertahankan sebagai slot tetap
  const ikutInduk = (sl: Slot) => !!g && kegiatan && !terdampak(g, rombelBeban.get(sl.bebanId) ?? '');
  // rombel tidak aktif (PKL) tidak ikut disusun
  kloning.beban = structuredClone(t.beban).filter((b) => !tdk.has(b.rombelId));
  const tetap: Slot[] = mode === 'lengkapi' ? t.slots : t.slots.filter(ikutInduk);
  // mulai dari jadwal induk: beban kegiatan yang menggantikan beban induk memakai slot induknya; hanya kelas terdampak
  let awal: Slot[] | undefined;
  if (mode === 'induk' && g && kegiatan) {
    const peta = new Map(kloning.beban.map((b) => [b.asal ?? b.id, b.id]));
    awal = (versiSemester(p, t.semester)?.slots ?? []).flatMap((sl) => {
      const id = peta.get(sl.bebanId);
      return id && terdampak(g, rombelBeban.get(id) ?? '') ? [{ ...sl, bebanId: id }] : [];
    });
  }
  for (const v of kloning.versi) v.slots = [];
  const skemaPerHari = polaUntukTanggal(tanggal, { ...p, kalender: kalenderFokus(p, fokus) }).pola;
  const pesan: PesanSusun = {
    p: kloning,
    skemaPerHari,
    tetap,
    awal,
    aturan: t.aturan,
    kedalaman: 3,
    prioritasLunak: o.lunak ? (kegiatan ? true : 'bilaPerlu') : false,
    batasMs: o.detik ? o.detik * 1000 : 240_000,
    ...(o.detik ? {} : { sabarMs: 15_000 }),
    ...(o.sertakanSlot ? { sertakanSlot: true } : {}),
  };
  return { pesan, beban: kloning.beban, mode };
}

export interface PekerjaSusun {
  batal(): void;
}

/** Menjalankan solver di pekerja latar. Mengembalikan null (dan memanggil `galat`) bila pekerja tidak bisa dibuat. */
export function jalankanPekerja(pesan: PesanSusun, cb: { kemajuan(m: Kemajuan): void; hasil(h: HasilSusun): void; galat(pesan: string): void }): PekerjaSusun | null {
  let w: Worker;
  try {
    w = new Worker(new URL('../mesin/solver.worker.ts', import.meta.url), { type: 'module' });
  } catch (e) {
    cb.galat(`Pekerja latar tidak bisa dibuat: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
  let selesai = false;
  const tutup = () => {
    selesai = true;
    w.terminate();
  };
  w.onmessage = (e: MessageEvent<{ jenis: string; m?: Kemajuan; h?: HasilSusun; pesan?: string }>) => {
    if (selesai) return;
    if (e.data.jenis === 'kemajuan' && e.data.m) cb.kemajuan(e.data.m);
    else {
      tutup();
      if (e.data.jenis === 'hasil' && e.data.h) cb.hasil(e.data.h);
      else cb.galat(e.data.pesan ?? 'Penyusunan gagal.');
    }
  };
  w.onerror = (e) => {
    if (selesai) return;
    tutup();
    cb.galat(`Penyusunan gagal: ${e.message}`);
  };
  w.postMessage(pesan);
  return { batal: () => { if (!selesai) tutup(); } };
}

/** Menjalankan penyusunan di pekerja latar sesuai pilihan saat ini (tab Susun Otomatis). */
export function mulaiSusun(k: Konteks): boolean {
  st.galat = '';
  st.hasil = null;
  st.kemajuan = null;
  st.jalan = true;
  const { pesan, beban } = siapkanSusun(k.p, k.turunan, k.ui.fokus, k.ui.tanggal, { mode: st.mode, detik: st.detik, lunak: st.lunak });
  st.bebanHasil = beban;
  const sendiri = jalankanPekerja(pesan, {
    kemajuan: (m) => {
      st.kemajuan = m;
      const kotak = document.getElementById('kemajuanSusun');
      if (kotak) kotak.innerHTML = bar(st.kemajuan);
    },
    hasil: (h) => {
      st.jalan = false;
      st.hasil = h;
      pekerja = null;
      pengamat?.(h);
      k.gambar();
    },
    galat: (pesanGalat) => {
      st.jalan = false;
      st.galat = pesanGalat;
      pekerja = null;
      k.gambar();
    },
  });
  pekerja = sendiri;
  if (!sendiri) st.jalan = false;
  k.gambar();
  return true;
}

export function klikSusun(k: Konteks, el: HTMLElement): boolean {
  switch (el.dataset.aksi) {
    case 'susunMulai':
      return mulaiSusun(k);
    case 'susunBatal':
      pekerja?.batal();
      pekerja = null;
      st.jalan = false;
      k.gambar();
      return true;
    case 'susunBuang':
      st.hasil = null;
      k.gambar();
      return true;
    case 'susunTerapkan': {
      const h = st.hasil;
      if (!h) return true;
      k.ubahSlots(() => h.slots);
      st.hasil = null;
      k.ui.mode = 'rombel';
      k.ke('grid');
      k.lapor(`Jadwal diterapkan: ${h.terjadwal} dari ${h.total} JP${h.sisa.length ? `, ${h.sisa.length} beban belum penuh` : ''}.`);
      return true;
    }
  }
  return false;
}

export function ubahSusun(k: Konteks, el: HTMLInputElement & HTMLSelectElement): boolean {
  void k;
  if (el.name === 'modeSusun') {
    st.mode = el.value as Mode;
    return true;
  }
  if (el.id === 'detikSusun') {
    st.detik = Number(el.value);
    return true;
  }
  if (el.id === 'lunakSusun') {
    st.lunak = el.checked;
    return true;
  }
  return false;
}
