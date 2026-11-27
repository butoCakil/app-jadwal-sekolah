import type { Proyek, Slot } from '../model/tipe';
import { cekSkema } from '../model/skema';
import { cekKegiatan, cekPola, migrasiPola, versiUntukTanggal } from '../model/kalender';
import { proyekContoh } from '../model/contoh';
import { proyekSekolah, type IdDataSekolah } from '../model/sekolahData';
import { Riwayat } from '../mesin/riwayat';
import { dariJson, hapusDraf, keJson, muatDraf, simpanDraf } from '../io/simpan';
import type { Konteks, StatusUI, Tab, Turunan } from './konteks';
import { hitungTurunan } from './turunan';
import { PETA_KOSONG, daftarEntitas, hasilSel, klikGrid, lepas, renderGrid, renderModal, siapkanSeret, ubahGrid } from './grid';
import type { PetaSel, Seret } from './grid';
import { klikInspektur, renderInspektur } from './inspektur';
import { klikBeban, renderBeban, ubahBeban } from './beban';
import { klikMaster, renderMaster, ubahMaster } from './master';
import { klikImpor, renderImpor, ubahImpor } from './imporExcel';
import { klikSusun, renderSusun, ubahSusun } from './susun';
import { klikSkema, renderSkemaTab, ubahSkema } from './skemaTab';
import { klikPemilih, renderPemilih, segarkanPemilih, ubahPemilih } from './pemilih';
import { klikPeriode, ubahPeriode } from './periode';
import { klikDataset, muatDaftarDataset, ubahDataset } from './dataset';
import { bulanDari, renderDlgKegiatan, tanggalUntukPeriode } from './kalenderTab';
import { esc, isoLokal, unduh } from './util';

const TAB: { id: Tab; label: string }[] = [
  { id: 'grid', label: 'Grid Jadwal' },
  { id: 'inspektur', label: 'Conflict Inspector' },
  { id: 'beban', label: 'Beban & JP' },
  { id: 'master', label: 'Master Data' },
  { id: 'skema', label: 'Skema & Kalender' },
  { id: 'impor', label: 'Impor Excel' },
  { id: 'susun', label: 'Susun Otomatis' },
];

export async function mulaiApp(akar: HTMLElement): Promise<void> {
  let p: Proyek = (await muatDraf().catch(() => null)) ?? proyekSekolah();
  const awalTanggal = (x: Proyek): string => {
    const aktif = x.kalender.find((g) => g.id === x.periodeAktifId);
    return aktif ? tanggalUntukPeriode(aktif, isoLokal(new Date()), x.polaReguler.length) : isoLokal(new Date());
  };
  const ui: StatusUI = {
    tab: 'grid',
    tanggal: awalTanggal(p),
    kalBulan: bulanDari(awalTanggal(p)),
    kalTanggal: awalTanggal(p),
    dlg: null,
    skemaSub: 'kalender',
    masterTab: 'guru',
    pemilih: null,
    mode: 'rombel',
    tata: 'hari',
    entitasId: p.master.rombel[0]?.id ?? '',
    modal: null,
    bebanRombel: p.master.rombel[0]?.id ?? '',
    bebanTerbuka: new Set(),
    saring: 'semua',
  };
  const riwayat = new Riwayat<Proyek>();
  let turunan: Turunan = hitungTurunan(p, ui.tanggal);
  let galat = '';
  let timerSimpan: number | undefined;
  let timerToast: number | undefined;

  const lapor = (pesan: string) => {
    window.clearTimeout(timerToast);
    timerToast = window.setTimeout(() => {
      document.getElementById('toast')?.remove();
    }, 4500);
    const el = document.getElementById('toast');
    if (el) el.textContent = pesan;
    else document.body.insertAdjacentHTML('beforeend', `<div id="toast" class="fixed bottom-4 left-1/2 z-[60] max-w-md -translate-x-1/2 rounded-xl bg-slate-900 px-4 py-2 text-sm text-white shadow-lg">${esc(pesan)}</div>`);
  };

  const simpanTertunda = () => {
    window.clearTimeout(timerSimpan);
    timerSimpan = window.setTimeout(() => void simpanDraf(p).catch(() => lapor('Gagal menyimpan draf ke peramban ini.')), 400);
  };

  const periksaProyek = (): string => {
    const g = [
      ...p.skema.flatMap((s) => cekSkema(s).map((x) => `${s.nama}: ${x}`)),
      ...cekPola(p.polaReguler, p.skema).map((x) => `Pola default: ${x}`),
      ...(p.polaLain ?? []).flatMap((q) => cekPola(q.pola, p.skema, p.polaReguler.length).map((x) => `Pola ${q.nama}: ${x}`)),
      ...(p.penggantiManual ? cekPola(p.penggantiManual.pola, p.skema, p.polaReguler.length) : []),
      ...p.kalender.flatMap((x) => cekKegiatan(x).map((y) => `${x.nama}: ${y}`)),
    ];
    return g.length ? `Perlu diperbaiki: ${g.join(' | ')}` : '';
  };

  const ctx: Konteks = {
    get p() { return p; },
    get turunan() { return turunan; },
    ui,
    ubah(fn) {
      riwayat.catat(p);
      fn(p);
      galat = periksaProyek();
      simpanTertunda();
      gambar();
    },
    ubahSlots(fn: (s: Slot[]) => Slot[]) {
      ctx.ubah((x) => {
        const v = versiUntukTanggal(ui.tanggal, x);
        if (v) v.slots = fn(v.slots);
      });
    },
    gambar: () => gambar(),
    lapor,
    ganti(baru, pesan) {
      riwayat.catat(p);
      p = baru;
      ui.entitasId = p.master.rombel[0]?.id ?? '';
      ui.mode = 'rombel';
      ui.tanggal = awalTanggal(p);
      ui.kalTanggal = ui.tanggal;
      ui.kalBulan = bulanDari(ui.tanggal);
      ui.bebanRombel = p.master.rombel[0]?.id ?? '';
      ui.pemilih = null;
      ui.dlg = null;
      galat = periksaProyek();
      void hapusDraf().then(() => simpanDraf(p)).catch(() => undefined);
      gambar();
      if (pesan) lapor(pesan);
    },
    ke(tab) {
      ui.tab = tab;
      ui.modal = null;
      gambar();
    },
  };

  function gambar(): void {
    const entitas = daftarEntitas(p, ui.mode);
    if (!entitas.some((e) => e.id === ui.entitasId)) ui.entitasId = entitas[0]?.id ?? '';
    if (!p.master.rombel.some((r) => r.id === ui.bebanRombel)) ui.bebanRombel = p.master.rombel[0]?.id ?? '';
    turunan = hitungTurunan(p, ui.tanggal);
    if (ui.modal?.jenis === 'slot') {
      const id = ui.modal.slotId;
      if (!turunan.slots.some((s) => s.id === id)) ui.modal = null;
    }
    const n = turunan.jumlahPelanggaran;
    const semua = turunan.masalah.length;
    const status = n === 0
      ? `<button class="lencana bg-emerald-100 text-emerald-800 hover:bg-emerald-200" data-aksi="keInspektur" title="Tidak ada bentrok atau pelanggaran aturan">● 0 Bentrok</button>`
      : `<button class="lencana bg-red-100 text-red-800 hover:bg-red-200" data-aksi="keInspektur" title="Lihat di Conflict Inspector">⚠ ${n} Bentrok</button>`;
    const badge = semua === 0 ? '' : `<span class="ml-1 rounded-full px-1.5 text-[11px] font-bold ${n > 0 ? 'bg-red-600 text-white' : 'bg-amber-400 text-slate-900'}">${semua}</span>`;
    const isi =
      ui.tab === 'grid' ? renderGrid(ctx) + renderModal(ctx)
      : ui.tab === 'inspektur' ? renderInspektur(ctx)
      : ui.tab === 'beban' ? renderBeban(ctx)
      : ui.tab === 'master' ? renderMaster(ctx)
      : ui.tab === 'impor' ? renderImpor(ctx)
      : ui.tab === 'susun' ? renderSusun(ctx)
      : renderSkemaTab(ctx);
    akar.innerHTML = `<header class="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div class="mx-auto flex max-w-[1600px] flex-wrap items-center gap-3 px-4 py-2.5">
          <div class="flex items-center gap-3"><div class="grid h-10 w-10 place-items-center rounded-xl bg-[#0d1e33]"><svg width="22" height="22" viewBox="0 0 22 22"><rect x="2" y="12" width="4" height="8" rx="1.5" fill="#f5b21a"/><rect x="9" y="7" width="4" height="13" rx="1.5" fill="#157f6e"/><rect x="16" y="2" width="4" height="18" rx="1.5" fill="#2347b8"/></svg></div>
            <div><div class="text-[11px] font-semibold tracking-widest text-amber-600">SMK NEGERI BANSARI</div><div class="text-base font-bold leading-tight">Jadwal Pelajaran <span class="text-xs font-normal text-slate-500">· ${esc(p.nama)}</span></div></div></div>
          <div class="ml-2">${status}</div>
          <div class="ml-auto flex flex-wrap items-center gap-2">
            <button class="tombol disabled:opacity-40" data-aksi="undo" ${riwayat.bisaUndo() ? '' : 'disabled'} title="Urungkan (Ctrl+Z)">↶ Urungkan</button>
            <button class="tombol disabled:opacity-40" data-aksi="redo" ${riwayat.bisaRedo() ? '' : 'disabled'} title="Ulangi (Ctrl+Y)">↷ Ulangi</button>
            <button class="tombol" data-aksi="ekspor">Ekspor JSON</button>
            <label class="tombol cursor-pointer">Impor JSON<input type="file" accept="application/json,.json" id="impor" class="hidden"></label></div></div>
        <nav class="mx-auto flex max-w-[1600px] gap-1 overflow-x-auto px-4">${TAB.map((t) => `<button data-tab="${t.id}" class="whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${t.id === ui.tab ? 'border-[#2347b8] text-[#2347b8]' : 'border-transparent text-slate-500 hover:text-slate-800'}">${t.label}${t.id === 'inspektur' ? badge : ''}</button>`).join('')}</nav></header>
      <main class="mx-auto max-w-[1600px] px-4 py-4">${galat ? `<div class="mb-3 rounded-lg bg-red-50 p-2 text-sm text-red-800">${esc(galat)}</div>` : ''}${isi}</main>${renderPemilih(ctx)}${renderDlgKegiatan(ctx)}`;
    segarkanPemilih(ctx);
  }

  const urungkan = () => {
    const x = riwayat.undo(p);
    if (!x) return;
    p = x;
    galat = periksaProyek();
    simpanTertunda();
    gambar();
  };
  const ulangi = () => {
    const x = riwayat.redo(p);
    if (!x) return;
    p = x;
    galat = periksaProyek();
    simpanTertunda();
    gambar();
  };

  // ---------------------------------------------------------------- klik & ubah
  akar.addEventListener('click', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-tab],[data-aksi]');
    if (!el) return;
    if (el.dataset.tab) return ctx.ke(el.dataset.tab as Tab);
    switch (el.dataset.aksi) {
      case 'undo': return urungkan();
      case 'redo': return ulangi();
      case 'ekspor': return unduh(`jadwal-${isoLokal(new Date())}.json`, keJson(p));
      case 'keInspektur': return ctx.ke('inspektur');
      case 'muat': {
        const set = el.dataset.set as IdDataSekolah | 'contoh';
        if (!confirm('Memuat data ini mengganti draf yang ada di peramban ini. Lanjutkan?')) return;
        return ctx.ganti(set === 'contoh' ? migrasiPola(proyekContoh()) : proyekSekolah(set));
      }
    }
    void (klikPemilih(ctx, el) || klikPeriode(ctx, el) || klikDataset(ctx, el) || klikGrid(ctx, el) || klikInspektur(ctx, el) || klikBeban(ctx, el) || klikMaster(ctx, el) || klikImpor(ctx, el) || klikSusun(ctx, el) || klikSkema(ctx, el));
  });

  akar.addEventListener('change', (e) => {
    const el = e.target as HTMLInputElement & HTMLSelectElement;
    if (el.id === 'impor') {
      const f = el.files?.[0];
      if (!f) return;
      void f.text().then((teks) => {
        const h = dariJson(teks);
        if (h.ok) {
          riwayat.catat(p);
          p = h.proyek;
          ui.entitasId = p.master.rombel[0]?.id ?? '';
          ui.mode = 'rombel';
          ui.tanggal = awalTanggal(p);
          ui.bebanRombel = p.master.rombel[0]?.id ?? '';
          galat = '';
          simpanTertunda();
        } else galat = `Impor ditolak: ${h.galat.join(' | ')}`;
        gambar();
      });
      return;
    }
    void (ubahPemilih(ctx, el) || ubahPeriode(ctx, el) || ubahDataset(ctx, el) || ubahGrid(ctx, el) || ubahBeban(ctx, el) || ubahMaster(ctx, el) || ubahImpor(ctx, el) || ubahSusun(ctx, el) || ubahSkema(ctx, el));
  });

  akar.addEventListener('input', (e) => {
    const el = e.target as HTMLInputElement;
    if (el.dataset.aksi === 'pmCari') ubahPemilih(ctx, el);
  });

  document.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    if (e.key === 'Escape' && (ui.modal || ui.pemilih || ui.dlg)) {
      ui.modal = null;
      ui.pemilih = null;
      ui.dlg = null;
      return gambar();
    }
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) return;
    const z = e.key.toLowerCase() === 'z';
    if ((e.ctrlKey || e.metaKey) && z && !e.shiftKey) {
      e.preventDefault();
      urungkan();
    } else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (z && e.shiftKey))) {
      e.preventDefault();
      ulangi();
    }
  });

  // ---------------------------------------------------------------- seret & lepas
  let seret: Seret | null = null;
  let petaSel: PetaSel = PETA_KOSONG;
  const petunjuk = (): HTMLElement => {
    let el = document.getElementById('petunjuk');
    if (!el) {
      document.body.insertAdjacentHTML('beforeend', '<div id="petunjuk" class="pointer-events-none fixed bottom-4 left-1/2 z-[60] hidden"></div>');
      el = document.getElementById('petunjuk');
    }
    return el as HTMLElement;
  };
  const bersihkan = () => {
    akar.querySelectorAll('.sel-ok,.sel-bad').forEach((x) => x.classList.remove('sel-ok', 'sel-bad'));
    petunjuk().className = 'hidden';
    akar.classList.remove('sedang-seret');
    seret = null;
    petaSel = PETA_KOSONG;
  };
  
  /** Sel jadwal di bawah penunjuk (kartu bisa menutupi sel, jadi dicari lewat koordinat). */
  const selDi = (e: DragEvent): HTMLElement | null => {
    for (const x of document.elementsFromPoint(e.clientX, e.clientY)) if (x instanceof HTMLElement && x.dataset.sel) return x;
    return null;
  };
  akar.addEventListener('dragstart', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-seret]');
    if (!el) return;
    seret = el.dataset.seret === 'beban' ? { bebanId: el.dataset.bebanId } : { slotId: el.dataset.slotId, slotIds: el.dataset.slotIds?.split(',') };
    window.setTimeout(() => akar.classList.add('sedang-seret'), 0);
    e.dataTransfer?.setData('text/plain', 'jadwal');
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
    petaSel = siapkanSeret(ctx, seret);
    akar.querySelectorAll<HTMLElement>('[data-sel]').forEach((td) => {
      const h = hasilSel(petaSel, td);
      if (h) td.classList.add(h.ok ? 'sel-ok' : 'sel-bad');
    });
  });
  akar.addEventListener('dragover', (e) => {
    if (!seret) return;
    const td = selDi(e);
    const h = td ? hasilSel(petaSel, td) : undefined;
    const kotak = petunjuk();
    if (td && h) {
      if (h.ok) {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      }
      kotak.className = `pointer-events-none fixed bottom-4 left-1/2 z-[60] max-w-lg -translate-x-1/2 rounded-xl px-4 py-2 text-sm text-white shadow-lg ${h.ok ? 'bg-emerald-600' : 'bg-red-600'}`;
      kotak.textContent = h.ok ? 'Lepas untuk menempatkan di sini' : (h.alasan[0] ?? 'Tidak bisa ditempatkan di sini');
    } else kotak.className = 'hidden';
  });
  akar.addEventListener('drop', (e) => {
    if (!seret) return;
    const td = selDi(e);
    if (!td) return;
    e.preventDefault();
    const s = seret;
    const hari = Number(td.dataset.hari);
    const jam = Number(td.dataset.jam);
    bersihkan();
    lepas(ctx, s, hari, jam);
  });
  akar.addEventListener('dragend', bersihkan);

  gambar();
  void muatDaftarDataset(ctx);
}
