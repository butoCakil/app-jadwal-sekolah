import type { BarisSkema, JenisBaris, JenisKegiatan, PolaMinggu, Proyek } from '../model/tipe';
import { cekSkema, keMenit } from '../model/skema';
import { cekKegiatan, cekPola } from '../model/kalender';
import { proyekContoh } from '../model/contoh';
import { dariJson, hapusDraf, keJson, muatDraf, simpanDraf } from '../io/simpan';
import { renderGrid } from './grid';
import { renderSkemaTab } from './skemaTab';
import { esc, isoLokal, unduh } from './util';

type Tab = 'grid' | 'skema';

export async function mulaiApp(akar: HTMLElement): Promise<void> {
  let p: Proyek = (await muatDraf().catch(() => null)) ?? proyekContoh();
  let tab: Tab = 'grid';
  let tanggal = isoLokal(new Date());
  let rombelId = p.master.rombel[0]?.id ?? '';
  let pesan = '';
  let timer: number | undefined;

  const simpanTertunda = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void simpanDraf(p).catch(() => (pesan = 'Gagal menyimpan draf ke peramban.')), 400);
  };

  /** Menerapkan perubahan, memeriksa, lalu menyimpan. Perubahan yang membuat data tidak valid tetap dilaporkan. */
  const ubah = (fn: (x: Proyek) => void) => {
    fn(p);
    const galat = [
      ...p.skema.flatMap((s) => cekSkema(s).map((g) => `${s.nama}: ${g}`)),
      ...cekPola(p.polaReguler, p.skema),
      ...(p.penggantiManual ? cekPola(p.penggantiManual.pola, p.skema) : []),
      ...p.kalender.flatMap((k) => cekKegiatan(k).map((g) => `${k.nama}: ${g}`)),
    ];
    pesan = galat.length ? `Perlu diperbaiki: ${galat.join(' | ')}` : '';
    simpanTertunda();
    gambar();
  };

  const gambar = () => {
    const opsiRombel = p.master.rombel
      .map((r) => `<option value="${esc(r.id)}" ${r.id === rombelId ? 'selected' : ''}>${esc(r.kode)}</option>`)
      .join('');
    const isi =
      tab === 'grid'
        ? `<div class="mb-3 flex flex-wrap items-center gap-3">
            <label class="text-sm">Tanggal acuan <input type="date" id="tanggal" class="isian" value="${tanggal}"></label>
            <label class="text-sm">Rombel <select id="rombel" class="isian">${opsiRombel}</select></label></div>
           ${rombelId ? renderGrid(p, { tanggal, rombelId, versiId: p.versi[0]?.id ?? '' }) : '<div class="text-sm text-slate-500">Belum ada rombel.</div>'}`
        : renderSkemaTab(p);
    const tabCls = (t: Tab) => (t === tab ? 'bg-slate-900 text-white' : 'bg-white hover:bg-slate-50');
    akar.innerHTML = `<header class="border-b border-slate-200 bg-white">
        <div class="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
          <div><div class="text-xs font-semibold tracking-widest text-amber-600">SMK NEGERI BANSARI</div>
            <h1 class="text-lg font-bold leading-tight">Jadwal Pelajaran <span class="text-sm font-normal text-slate-500">· ${esc(p.nama)}</span></h1></div>
          <nav class="ml-4 flex gap-1">
            <button data-tab="grid" class="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium ${tabCls('grid')}">Grid Jadwal</button>
            <button data-tab="skema" class="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium ${tabCls('skema')}">Skema &amp; Kalender</button></nav>
          <div class="ml-auto flex gap-2">
            <button class="tombol" data-aksi="ekspor">Ekspor JSON</button>
            <label class="tombol cursor-pointer">Impor JSON<input type="file" accept="application/json,.json" id="impor" class="hidden"></label>
            <button class="tombol" data-aksi="reset">Reset ke contoh</button></div></div></header>
      <main class="mx-auto max-w-7xl px-4 py-4">${pesan ? `<div class="mb-3 rounded-lg bg-red-50 p-2 text-sm text-red-800">${esc(pesan)}</div>` : ''}${isi}</main>`;
  };

  const skemaDari = (id: string | undefined) => p.skema.find((s) => s.id === id);
  const polaDari = (kunci: string): PolaMinggu | undefined =>
    kunci === 'reguler' ? p.polaReguler : kunci === 'manual' ? p.penggantiManual?.pola : p.kalender.find((k) => k.id === kunci.slice(2))?.pola;
  const salinPola = (x: PolaMinggu): PolaMinggu => [...x] as PolaMinggu;

  akar.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-tab],[data-aksi]');
    if (!t) return;
    if (t.dataset.tab) {
      tab = t.dataset.tab as Tab;
      return gambar();
    }
    const d = t.dataset;
    switch (d.aksi) {
      case 'ekspor':
        return unduh(`jadwal-${new Date().toISOString().slice(0, 10)}.json`, keJson(p));
      case 'reset':
        if (!confirm('Kembalikan ke data contoh? Draf yang ada di peramban ini akan diganti.')) return;
        p = proyekContoh();
        rombelId = p.master.rombel[0]?.id ?? '';
        pesan = '';
        void hapusDraf();
        return gambar();
      case 'hapusBaris':
        return ubah(() => skemaDari(d.skema)?.baris.splice(Number(d.i), 1));
      case 'tambahBaris':
        return ubah(() => {
          const s = skemaDari(d.skema);
          if (!s) return;
          const tipe = d.tipe as JenisBaris;
          const baru: BarisSkema = { id: `${s.id}_${Date.now()}`, tipe, kegiatan: tipe === 'istirahat' ? 'Istirahat' : 'Pelajaran', durasi: tipe === 'istirahat' ? 15 : 40 };
          s.baris.push(baru);
        });
      case 'aktifkanManual':
        return ubah((x) => (x.penggantiManual = { pola: salinPola(x.polaReguler) }));
      case 'hapusManual':
        return ubah((x) => (x.penggantiManual = null));
      case 'tambahKegiatan':
        return ubah((x) => {
          const hariIni = isoLokal(new Date());
          x.kalender.push({ id: `k${Date.now()}`, nama: 'Kegiatan baru', jenis: 'lain', mulai: hariIni, selesai: hariIni, rombelTidakAktif: [] });
        });
      case 'hapusKegiatan':
        return ubah((x) => (x.kalender = x.kalender.filter((k) => k.id !== d.id)));
      case 'pasangPolaKegiatan':
        return ubah((x) => {
          const k = x.kalender.find((y) => y.id === d.id);
          if (k) k.pola = salinPola(x.polaReguler);
        });
      case 'lepasPolaKegiatan':
        return ubah((x) => {
          const k = x.kalender.find((y) => y.id === d.id);
          if (k) delete k.pola;
        });
    }
  });

  akar.addEventListener('change', (e) => {
    const el = e.target as HTMLInputElement & HTMLSelectElement;
    if (el.id === 'tanggal') {
      if (el.value) tanggal = el.value;
      return gambar();
    }
    if (el.id === 'rombel') {
      rombelId = el.value;
      return gambar();
    }
    if (el.id === 'impor') {
      const f = el.files?.[0];
      if (!f) return;
      void f.text().then((teks) => {
        const h = dariJson(teks);
        if (h.ok) {
          p = h.proyek;
          rombelId = p.master.rombel[0]?.id ?? '';
          pesan = '';
          simpanTertunda();
        } else pesan = `Impor ditolak: ${h.galat.join(' | ')}`;
        gambar();
      });
      return;
    }
    const d = el.dataset;
    if (!d.aksi) return;
    const keg = () => p.kalender.find((k) => k.id === d.id);
    switch (d.aksi) {
      case 'pola':
        return ubah(() => {
          const pola = polaDari(d.kunci ?? '');
          if (pola) pola[Number(d.hari)] = el.value;
        });
      case 'jamMulai':
        try {
          keMenit(el.value.trim());
        } catch (err) {
          pesan = `Jam mulai ditolak: ${(err as Error).message}`;
          return gambar();
        }
        return ubah(() => {
          const s = skemaDari(d.skema);
          if (s) s.jamMulai = el.value.trim();
        });
      case 'tipeBaris':
        return ubah(() => {
          const b = skemaDari(d.skema)?.baris[Number(d.i)];
          if (b) b.tipe = el.value as JenisBaris;
        });
      case 'kegiatanBaris':
        return ubah(() => {
          const b = skemaDari(d.skema)?.baris[Number(d.i)];
          if (b) b.kegiatan = el.value;
        });
      case 'durasiBaris':
        return ubah(() => {
          const b = skemaDari(d.skema)?.baris[Number(d.i)];
          if (b) b.durasi = Number(el.value);
        });
      case 'manualMulai':
        return ubah((x) => {
          if (!x.penggantiManual) return;
          if (el.value) x.penggantiManual.mulai = el.value;
          else delete x.penggantiManual.mulai;
        });
      case 'manualSelesai':
        return ubah((x) => {
          if (!x.penggantiManual) return;
          if (el.value) x.penggantiManual.selesai = el.value;
          else delete x.penggantiManual.selesai;
        });
      case 'kNama':
        return ubah(() => void (keg() && (keg()!.nama = el.value)));
      case 'kJenis':
        return ubah(() => void (keg() && (keg()!.jenis = el.value as JenisKegiatan)));
      case 'kMulai':
        return ubah(() => void (keg() && (keg()!.mulai = el.value)));
      case 'kSelesai':
        return ubah(() => void (keg() && (keg()!.selesai = el.value)));
    }
  });

  gambar();
}
