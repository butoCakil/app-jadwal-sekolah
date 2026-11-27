import { bebanUntukDiubah, fokusInduk } from '../model/simpul';
import { kategoriRuang } from '../model/ruang';
import { kategoriMapel, urutKategori } from '../model/kategoriMapel';
import type { Aturan, Proyek } from '../model/tipe';
import type { Konteks, Pemilih } from './konteks';
import { esc } from './util';

interface Item {
  id: string;
  label: string;
  ket?: string;
  grup: string;
  /** pencarian: teks tambahan yang ikut dicocokkan */
  kunci?: string;
  /** sub-kelompok di dalam grup (mis. elemen satu mapel induk) */
  sub?: string;
}
interface Isi {
  judul: string;
  petunjuk: string;
  item: Item[];
  /** true bila urutan klik berarti (ruang prioritas) */
  berurut?: boolean;
}

/** Daftar ruang untuk pemilih, dikelompokkan menurut kategori. Ruang yang tidak ikut dijadwalkan diberi keterangan. */
function itemRuang(p: Proyek): Item[] {
  return p.master.ruang.map((r) => ({
    id: r.id,
    label: `${r.kode} · ${r.nama}`,
    ket: [r.jenis, r.dijadwalkan === false ? 'tidak ikut dijadwalkan' : '', r.bersama ? 'bersama' : ''].filter(Boolean).join(', '),
    grup: kategoriRuang(r),
    kunci: `${r.kode} ${r.nama} ${r.jenis}`,
  }));
}

function aturanDariId(p: Proyek, id: string): Aturan | undefined {
  return p.aturan.find((a) => a.id === id);
}

function isi(k: Konteks, pm: Pemilih): Isi | null {
  const p = k.p;
  switch (pm.sasaran) {
    case 'mapelRuang': {
      const m = p.master.mapel.find((x) => x.id === pm.id);
      return m ? { judul: `Ruang untuk mapel ${m.kode} · ${m.nama}`, petunjuk: 'Mapel ini hanya boleh memakai ruang yang dicentang. Tidak ada yang dicentang = tidak dibatasi (mengikuti jenis ruang mapel).', item: itemRuang(p) } : null;
    }
    case 'rombelRuang': {
      const r = p.master.rombel.find((x) => x.id === pm.id);
      return r ? { judul: `Ruang untuk rombel ${r.kode}`, petunjuk: 'Rombel ini hanya boleh memakai ruang yang dicentang. Tidak ada yang dicentang = tidak dibatasi. Hati-hati: batasan ini juga berlaku untuk pelajaran praktik.', item: itemRuang(p) } : null;
    }
    case 'aturanRuang': {
      const a = aturanDariId(p, pm.id);
      if (!a || a.jenis === 'guruTidakTersedia') return null;
      const g = a.jenis === 'guruRuang' ? p.master.guru.find((x) => x.id === a.guruId) : undefined;
      return { judul: a.jenis === 'guruRuang' ? `Ruang khusus guru ${g?.kode ?? '?'} · ${g?.nama ?? ''}` : 'Ruang yang terlarang', petunjuk: a.jenis === 'guruRuang' ? 'Guru ini hanya boleh mengajar di ruang yang dicentang (lebih dari satu boleh).' : 'Ruang yang dicentang tidak boleh dipakai oleh sasaran aturan ini.', item: itemRuang(p) };
    }
    case 'bebanPrio':
    case 'bebanLarang': {
      const b = p.beban.find((x) => x.id === pm.id);
      if (!b) return null;
      const m = p.master.mapel.find((x) => x.id === b.mapelId);
      const r = p.master.rombel.find((x) => x.id === b.rombelId);
      const prio = pm.sasaran === 'bebanPrio';
      return { judul: `${prio ? 'Ruang prioritas' : 'Ruang terlarang'} · ${r?.kode ?? '?'} ${m?.kode ?? '?'}`, petunjuk: prio ? 'Ruang dicoba menurut urutan klik (nomor di kanan): ruang pertama dulu, bila terpakai ruang berikutnya. Tidak ada yang dicentang = semua ruang yang diperbolehkan.' : 'Ruang yang dicentang tidak boleh dipakai beban ini.', item: itemRuang(p), berurut: prio };
    }
    case 'bebanTim': {
      const b = p.beban.find((x) => x.id === pm.id);
      if (!b) return null;
      const m = p.master.mapel.find((x) => x.id === b.mapelId);
      const r = p.master.rombel.find((x) => x.id === b.rombelId);
      return {
        judul: `Guru tim teaching · ${r?.kode ?? '?'} ${m?.kode ?? '?'}`,
        petunjuk: 'Guru yang ikut mengajar pada slot yang sama dengan guru utama. Mereka ikut diperiksa bentrok dan ketersediaannya.',
        item: p.master.guru.filter((g) => g.id !== b.guruId).map((g) => ({ id: g.id, label: `${g.kode} · ${g.nama}`, grup: g.mapelIds?.includes(b.mapelId) ? 'Mengampu mapel ini' : 'Guru lain', kunci: `${g.kode} ${g.nama}` })),
      };
    }
    case 'guruMapel': {
      const g = p.master.guru.find((x) => x.id === pm.id);
      if (!g) return null;
      const jurusan = [...new Set(p.master.rombel.map((r) => r.jurusan))];
      const adaInduk = (m: { induk?: string }) => !!m.induk && p.master.mapel.some((x) => x.id === m.induk);
      const urut = p.master.mapel.filter((m) => !adaInduk(m)).flatMap((m) => [m, ...p.master.mapel.filter((e) => e.induk === m.id)]);
      const item: Item[] = urut.map((m) => {
        const ind = adaInduk(m) ? p.master.mapel.find((x) => x.id === m.induk) : undefined;
        return { id: m.id, label: `${ind ? '↳ ' : ''}${m.kode} · ${m.nama}`, ket: ind ? `elemen ${ind.kode}` : undefined, grup: kategoriMapel(m, p.master.mapel), sub: ind ? `Elemen ${ind.kode}` : undefined, kunci: `${m.kode} ${m.nama}` };
      });
      const nama = [...new Set(item.map((i) => i.grup))].sort((a, b) => urutKategori(a, jurusan) - urutKategori(b, jurusan));
      return {
        judul: `Mapel yang diampu ${g.kode} · ${g.nama}`,
        petunjuk: 'Dipakai untuk menyaring pilihan mapel saat menambah beban. Tidak ada yang dicentang = tidak dibatasi. Kategori bisa diubah di Master Data > Mapel & elemen.',
        item: nama.flatMap((n) => item.filter((i) => i.grup === n)),
      };
    }
    case 'kegiatanRombel': {
      const g = p.kalender.find((x) => x.id === pm.id);
      if (!g) return null;
      return {
        judul: `Rombel tidak aktif pada “${g.nama}”`,
        petunjuk: 'Rombel yang dicentang (mis. sedang PKL) tidak ikut tampil, diperiksa, maupun disusun otomatis selama periode ini.',
        item: p.master.rombel.map((r) => ({ id: r.id, label: r.kode, grup: `Kelas ${r.tingkat} ${r.jurusan}`, kunci: r.kode })),
      };
    }
    case 'kegiatanKunci': {
      const [gid] = pm.id.split('|');
      const g = p.kalender.find((x) => x.id === gid);
      if (!g) return null;
      return {
        judul: `Ruang terkunci pada “${g.nama}”`,
        petunjuk: 'Ruang yang dicentang dipesan kegiatan ini: pelajaran lain tidak boleh memakainya (diperiksa, dan dihindari saat menyeret jadwal dan Susun Otomatis). Pilih per kategori dengan tombol di bawah.',
        item: itemRuang(p),
      };
    }
    case 'kegiatanTanpaRuang': {
      const g = p.kalender.find((x) => x.id === pm.id);
      if (!g) return null;
      return {
        judul: `Rombel belajar tanpa ruang pada “${g.nama}”`,
        petunjuk: 'Rombel yang dicentang (mis. PJJ, belajar dari rumah) tetap punya jadwal, tetapi tidak dilaporkan “belum punya ruang”.',
        item: p.master.rombel.map((r) => ({ id: r.id, label: r.kode, grup: `Kelas ${r.tingkat} ${r.jurusan}`, kunci: r.kode })),
      };
    }
  }
}

/** Nilai awal pilihan dari data. */
function awal(p: Proyek, sasaran: Pemilih['sasaran'], id: string): string[] {
  switch (sasaran) {
    case 'mapelRuang': return p.master.mapel.find((x) => x.id === id)?.ruangIds ?? [];
    case 'rombelRuang': return p.master.rombel.find((x) => x.id === id)?.ruangIds ?? [];
    case 'aturanRuang': {
      const a = aturanDariId(p, id);
      return a && a.jenis !== 'guruTidakTersedia' ? a.ruangIds : [];
    }
    case 'bebanPrio': return p.beban.find((x) => x.id === id)?.ruangPrioritas ?? [];
    case 'bebanLarang': return p.beban.find((x) => x.id === id)?.ruangTerlarang ?? [];
    case 'bebanTim': return p.beban.find((x) => x.id === id)?.timGuruIds ?? [];
    case 'guruMapel': return p.master.guru.find((x) => x.id === id)?.mapelIds ?? [];
    case 'kegiatanRombel': return p.kalender.find((x) => x.id === id)?.rombelTidakAktif ?? [];
    case 'kegiatanKunci': {
      const [gid, kid] = id.split('|');
      return p.kalender.find((x) => x.id === gid)?.ruangKunci?.find((x) => x.id === kid)?.ruangIds ?? [];
    }
    case 'kegiatanTanpaRuang': return p.kalender.find((x) => x.id === id)?.rombelTanpaRuang ?? [];
  }
}

export function bukaPemilih(k: Konteks, sasaran: Pemilih['sasaran'], id: string): void {
  k.ui.pemilih = { sasaran, id, pilih: new Set(awal(k.p, sasaran, id)), cari: '' };
  k.gambar();
}

/** Tombol ringkas pemilih: menampilkan kode terpilih dan membuka modal. */
export function tombolPemilih(sasaran: Pemilih['sasaran'], id: string, ringkas: string, kosong = 'Pilih…', extra = ''): string {
  return `<button class="tombol !px-2 !py-1 text-left ${extra}" data-aksi="pmBuka" data-sasaran="${sasaran}" data-id="${esc(id)}" title="Klik untuk memilih dengan centang">${ringkas ? esc(ringkas) : `<span class="text-slate-400">${esc(kosong)}</span>`} <span class="text-slate-400">▾</span></button>`;
}

/** Ringkasan teks daftar kode: "B3, C1, D1" atau "5 ruang" bila panjang. */
export function ringkasKode(kode: string[], satuan: string, maks = 4): string {
  if (kode.length === 0) return '';
  return kode.length <= maks ? kode.join(', ') : `${kode.length} ${satuan}`;
}

export function renderPemilih(k: Konteks): string {
  const pm = k.ui.pemilih;
  if (!pm) return '';
  const data = isi(k, pm);
  if (!data) return '';
  const grup = new Map<string, Item[]>();
  for (const it of data.item) {
    const l = grup.get(it.grup);
    if (l) l.push(it);
    else grup.set(it.grup, [it]);
  }
  const urutan = [...pm.pilih];
  const kelompok = [...grup]
    .map(([nama, daftar]) => `<div class="mb-3" data-pm-grup="${esc(nama)}">
      <label class="mb-1 flex cursor-pointer items-center gap-2 rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700"><input type="checkbox" data-aksi="pmGrup" data-grup="${esc(nama)}"> ${esc(nama)} <span class="font-normal text-slate-500" data-pm-hitung="${esc(nama)}"></span></label>
      <div class="grid gap-x-3 gap-y-0.5 sm:grid-cols-2">${daftar
        .map((it) => `<label class="flex cursor-pointer items-center gap-2 rounded px-2 py-0.5 text-sm hover:bg-sky-50" data-pm-baris data-teks="${esc(`${it.label} ${it.kunci ?? ''} ${it.ket ?? ''}`.toLowerCase())}">
          <input type="checkbox" data-aksi="pmItem" data-item="${esc(it.id)}" data-grup="${esc(nama)}" data-sub="${esc(it.sub ?? '')}" ${pm.pilih.has(it.id) ? 'checked' : ''}>
          <span class="min-w-0 flex-1 truncate">${esc(it.label)}</span>${data.berurut ? `<span class="w-5 text-right text-[11px] font-bold text-sky-700" data-pm-no="${esc(it.id)}">${urutan.indexOf(it.id) >= 0 ? urutan.indexOf(it.id) + 1 : ''}</span>` : ''}
          ${it.ket ? `<span class="shrink-0 text-[10px] text-slate-400">${esc(it.ket)}</span>` : ''}</label>`)
        .join('')}</div></div>`)
    .join('');
  const subs = [...new Set(data.item.map((i) => i.sub).filter((x): x is string => !!x))];
  const tombolGrup = [...grup.keys()].length > 1 || subs.length
    ? `<div class="mb-2 flex flex-wrap gap-1">${[...grup.keys()].map((n) => `<button class="tombol !px-2 !py-0.5 !text-xs" data-aksi="pmGrupTombol" data-grup="${esc(n)}">Pilih ${esc(n)}</button>`).join('')}${subs.map((n) => `<button class="tombol !px-2 !py-0.5 !text-xs !border-dashed" data-aksi="pmGrupTombol" data-sub="${esc(n)}">Pilih ${esc(n)}</button>`).join('')}</div>`
    : '';
  return `<div class="modal-latar" data-aksi="pmLatar"><div class="modal-isi !max-w-3xl" data-pm-isi>
    <div class="mb-1 text-base font-bold">${esc(data.judul)}</div>
    <div class="mb-3 text-xs text-slate-500">${esc(data.petunjuk)}</div>
    <div class="mb-2 flex flex-wrap items-center gap-2"><input id="pmCari" class="isian min-w-48 flex-1" placeholder="Cari…" data-aksi="pmCari">
      <button class="tombol" data-aksi="pmSemua">Pilih semua</button><button class="tombol" data-aksi="pmKosong">Kosongkan</button>
      <span class="text-xs text-slate-500" id="pmJumlah"></span></div>
    ${tombolGrup}
    <div class="max-h-[50vh] overflow-auto pr-1" id="pmDaftar">${kelompok}</div>
    <div class="mt-4 flex justify-end gap-2"><button class="tombol" data-aksi="pmTutup">Batal</button><button class="tombol-utama" data-aksi="pmTerapkan">Terapkan</button></div></div></div>`;
}

/** Menyelaraskan centang dan angka di modal yang sedang terbuka dengan himpunan pilihan (tanpa menggambar ulang, supaya gulir dan pencarian tidak hilang). */
export function segarkanPemilih(k: Konteks): void {
  const pm = k.ui.pemilih;
  if (!pm) return;
  const akar = document.getElementById('pmDaftar');
  if (!akar) return;
  const urutan = [...pm.pilih];
  akar.querySelectorAll<HTMLInputElement>('input[data-aksi=pmItem]').forEach((c) => {
    c.checked = pm.pilih.has(c.dataset.item ?? '');
  });
  akar.querySelectorAll<HTMLElement>('[data-pm-no]').forEach((e) => {
    const i = urutan.indexOf(e.dataset.pmNo ?? '');
    e.textContent = i >= 0 ? String(i + 1) : '';
  });
  akar.querySelectorAll<HTMLElement>('[data-pm-grup]').forEach((g) => {
    const nama = g.dataset.pmGrup ?? '';
    const semua = [...g.querySelectorAll<HTMLInputElement>('input[data-aksi=pmItem]')];
    const dicentang = semua.filter((c) => c.checked).length;
    const kepala = g.querySelector<HTMLInputElement>('input[data-aksi=pmGrup]');
    if (kepala) {
      kepala.checked = dicentang === semua.length && semua.length > 0;
      kepala.indeterminate = dicentang > 0 && dicentang < semua.length;
    }
    const h = akar.querySelector<HTMLElement>(`[data-pm-hitung="${CSS.escape(nama)}"]`);
    if (h) h.textContent = `${dicentang}/${semua.length}`;
  });
  const j = document.getElementById('pmJumlah');
  if (j) j.textContent = `${pm.pilih.size} dipilih`;
}

function barisTampak(): HTMLInputElement[] {
  return [...document.querySelectorAll<HTMLElement>('#pmDaftar [data-pm-baris]')].filter((b) => !b.hidden).map((b) => b.querySelector('input') as HTMLInputElement);
}

export function klikPemilih(k: Konteks, el: HTMLElement): boolean {
  const d = el.dataset;
  const pm = k.ui.pemilih;
  switch (d.aksi) {
    case 'pmBuka':
      bukaPemilih(k, d.sasaran as Pemilih['sasaran'], d.id ?? '');
      return true;
    case 'pmLatar':
      return true; // klik di latar tidak menutup (hindari kehilangan pilihan tak sengaja); tombol Batal tersedia
    case 'pmTutup':
      k.ui.pemilih = null;
      k.gambar();
      return true;
    case 'pmSemua':
    case 'pmKosong': {
      if (!pm) return true;
      for (const c of barisTampak()) {
        const id = c.dataset.item ?? '';
        if (d.aksi === 'pmSemua') pm.pilih.add(id);
        else pm.pilih.delete(id);
      }
      segarkanPemilih(k);
      return true;
    }
    case 'pmGrupTombol': {
      if (!pm) return true;
      const sel = d.sub ? `[data-sub="${CSS.escape(d.sub)}"]` : `[data-grup="${CSS.escape(d.grup ?? '')}"]`;
      const ids = [...document.querySelectorAll<HTMLInputElement>(`#pmDaftar input[data-aksi=pmItem]${sel}`)].map((c) => c.dataset.item ?? '');
      const semua = ids.every((i) => pm.pilih.has(i));
      for (const i of ids) {
        if (semua) pm.pilih.delete(i);
        else pm.pilih.add(i);
      }
      segarkanPemilih(k);
      return true;
    }
    case 'pmTerapkan': {
      if (!pm) return true;
      const ids = [...pm.pilih];
      k.ui.pemilih = null;
      k.ubah((p) => {
        // beban induk yang diubah dari dalam kegiatan menjadi pengecualian khusus kegiatan itu
        const g = fokusInduk(k.ui.fokus) ? undefined : p.kalender.find((x) => x.id === k.turunan.periode?.id);
        const id = pm.sasaran.startsWith('beban') ? bebanUntukDiubah(p, g, pm.id) : pm.id;
        terapkanPemilih(p, pm.sasaran, id, ids);
      });
      return true;
    }
  }
  return false;
}

/** Perubahan centang dan pencarian di modal (event change/input). */
export function ubahPemilih(k: Konteks, el: HTMLInputElement): boolean {
  const d = el.dataset;
  const pm = k.ui.pemilih;
  if (d.aksi === 'pmItem' && pm) {
    if (el.checked) pm.pilih.add(d.item ?? '');
    else pm.pilih.delete(d.item ?? '');
    segarkanPemilih(k);
    return true;
  }
  if (d.aksi === 'pmGrup' && pm) {
    for (const c of document.querySelectorAll<HTMLInputElement>(`#pmDaftar input[data-aksi=pmItem][data-grup="${CSS.escape(d.grup ?? '')}"]`)) {
      const id = c.dataset.item ?? '';
      if (el.checked) pm.pilih.add(id);
      else pm.pilih.delete(id);
    }
    segarkanPemilih(k);
    return true;
  }
  if (d.aksi === 'pmCari') {
    const q = el.value.trim().toLowerCase();
    document.querySelectorAll<HTMLElement>('#pmDaftar [data-pm-baris]').forEach((b) => {
      b.hidden = q !== '' && !(b.dataset.teks ?? '').includes(q);
    });
    document.querySelectorAll<HTMLElement>('#pmDaftar [data-pm-grup]').forEach((g) => {
      g.hidden = ![...g.querySelectorAll<HTMLElement>('[data-pm-baris]')].some((b) => !b.hidden);
    });
    return true;
  }
  return false;
}

function terapkanPemilih(p: Proyek, sasaran: Pemilih['sasaran'], id: string, ids: string[]): void {
  const isiAtauHapus = <T extends object>(o: T, f: keyof T) => {
    if (ids.length) (o[f] as unknown as string[]) = ids;
    else delete o[f];
  };
  switch (sasaran) {
    case 'mapelRuang': {
      const m = p.master.mapel.find((x) => x.id === id);
      if (m) isiAtauHapus(m, 'ruangIds');
      return;
    }
    case 'rombelRuang': {
      const r = p.master.rombel.find((x) => x.id === id);
      if (r) isiAtauHapus(r, 'ruangIds');
      return;
    }
    case 'guruMapel': {
      const g = p.master.guru.find((x) => x.id === id);
      if (g) isiAtauHapus(g, 'mapelIds');
      return;
    }
    case 'aturanRuang': {
      const a = aturanDariId(p, id);
      if (a && a.jenis !== 'guruTidakTersedia') a.ruangIds = ids;
      return;
    }
    case 'bebanPrio': {
      const b = p.beban.find((x) => x.id === id);
      if (b) b.ruangPrioritas = ids;
      return;
    }
    case 'bebanLarang': {
      const b = p.beban.find((x) => x.id === id);
      if (b) b.ruangTerlarang = ids;
      return;
    }
    case 'bebanTim': {
      const b = p.beban.find((x) => x.id === id);
      if (b) b.timGuruIds = ids;
      return;
    }
    case 'kegiatanRombel': {
      const g = p.kalender.find((x) => x.id === id);
      if (g) g.rombelTidakAktif = ids;
      return;
    }
    case 'kegiatanKunci': {
      const [gid, kid] = id.split('|');
      const g = p.kalender.find((x) => x.id === gid);
      if (!g) return;
      const daftar = g.ruangKunci ?? [];
      const ada = daftar.find((x) => x.id === kid);
      if (ada) ada.ruangIds = ids;
      else if (ids.length) daftar.push({ id: `kr${Date.now().toString(36)}`, ruangIds: ids });
      g.ruangKunci = daftar.filter((x) => x.ruangIds.length);
      if (!g.ruangKunci.length) delete g.ruangKunci;
      return;
    }
    case 'kegiatanTanpaRuang': {
      const g = p.kalender.find((x) => x.id === id);
      if (g) isiAtauHapus(g, 'rombelTanpaRuang');
      return;
    }
  }
}
