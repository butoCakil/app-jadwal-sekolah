import { ruangDiluarPrioritas, type HasilSusun, type Kemajuan } from '../mesin/solver';
import type { Beban, Slot } from '../model/tipe';
import { esc } from './util';
import { polaUntukTanggal } from '../model/kalender';
import { kalenderFokus, modelWarisan, terdampak, versiSemester } from '../model/simpul';
import type { Konteks } from './konteks';

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
const st: Status = { mode: 'nol', detik: 10, lunak: true, jalan: false, kemajuan: null, hasil: null, bebanHasil: [], galat: '' };
let pekerja: Worker | null = null;

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
        <select id="detikSusun" class="isian">${[5, 10, 20, 40].map((d) => `<option value="${d}" ${st.detik === d ? 'selected' : ''}>${d} detik</option>`).join('')}</select>
        <div class="mt-2 text-xs text-slate-500">Lebih lama = jadwal lebih rapi (lebih sedikit jam kosong di tengah hari). Jumlah JP yang muat biasanya sudah tercapai di detik pertama.</div>
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

/** Menjalankan penyusunan di pekerja latar sesuai pilihan saat ini. */
export function mulaiSusun(k: Konteks): boolean {
  st.galat = '';
  st.hasil = null;
  st.kemajuan = null;
  st.jalan = true;
  const kloning = structuredClone(k.p);
  const tdk = k.turunan.rombelTidakAktif;
  const g = k.turunan.periode;
  const rombelBeban = new Map(k.p.beban.map((b) => [b.id, b.rombelId]));
  // pada kegiatan model warisan, kelas yang ikut induk tidak disusun ulang: jadwalnya dipertahankan sebagai slot tetap
  const ikutInduk = (sl: Slot) => !!g && modelWarisan(g) && !terdampak(g, rombelBeban.get(sl.bebanId) ?? '');
  // rombel tidak aktif (PKL) tidak ikut disusun
  kloning.beban = structuredClone(k.turunan.beban).filter((b) => !tdk.has(b.rombelId));
  st.bebanHasil = kloning.beban;
  const tetap: Slot[] = st.mode === 'lengkapi' ? k.turunan.slots : k.turunan.slots.filter(ikutInduk);
  // mulai dari jadwal induk: beban kegiatan yang menggantikan beban induk memakai slot induknya; hanya kelas terdampak
  let awal: Slot[] | undefined;
  if (st.mode === 'induk' && g && modelWarisan(g)) {
    const peta = new Map(kloning.beban.map((b) => [b.asal ?? b.id, b.id]));
    awal = (versiSemester(k.p, k.turunan.semester)?.slots ?? []).flatMap((sl) => {
      const id = peta.get(sl.bebanId);
      return id && terdampak(g, rombelBeban.get(id) ?? '') ? [{ ...sl, bebanId: id }] : [];
    });
  }
  for (const v of kloning.versi) v.slots = [];
  const polaSusun = polaUntukTanggal(k.ui.tanggal, { ...k.p, kalender: kalenderFokus(k.p, k.ui.fokus) }).pola;
  try {
    pekerja = new Worker(new URL('../mesin/solver.worker.ts', import.meta.url), { type: 'module' });
  } catch (e) {
    st.jalan = false;
    st.galat = `Pekerja latar tidak bisa dibuat: ${e instanceof Error ? e.message : String(e)}`;
    k.gambar();
    return true;
  }
  const w = pekerja;
  w.onmessage = (e: MessageEvent<{ jenis: string; m?: Kemajuan; h?: HasilSusun; pesan?: string }>) => {
    if (pekerja !== w) return;
    if (e.data.jenis === 'kemajuan' && e.data.m) {
      st.kemajuan = e.data.m;
      const kotak = document.getElementById('kemajuanSusun');
      if (kotak) kotak.innerHTML = bar(st.kemajuan);
    } else {
      st.jalan = false;
      if (e.data.jenis === 'hasil' && e.data.h) {
        st.hasil = e.data.h;
        pengamat?.(e.data.h);
      } else st.galat = e.data.pesan ?? 'Penyusunan gagal.';
      w.terminate();
      pekerja = null;
      k.gambar();
    }
  };
  w.onerror = (e) => {
    st.jalan = false;
    st.galat = `Penyusunan gagal: ${e.message}`;
    w.terminate();
    pekerja = null;
    k.gambar();
  };
  w.postMessage({ p: kloning, skemaPerHari: polaSusun, tetap, awal, aturan: k.turunan.aturan, kedalaman: 3, prioritasLunak: st.lunak ? (g && modelWarisan(g) ? true : 'bilaPerlu') : false, batasMs: st.detik * 1000 });
  k.gambar();
  return true;
}

export function klikSusun(k: Konteks, el: HTMLElement): boolean {
  switch (el.dataset.aksi) {
    case 'susunMulai':
      return mulaiSusun(k);
    case 'susunBatal':
      pekerja?.terminate();
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
