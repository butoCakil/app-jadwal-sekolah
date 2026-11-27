// Halaman publik: hanya membaca data terbit (terbit/jadwal.json), tanpa login, dirancang untuk ponsel.

import type { Proyek } from '../model/tipe';
import { NAMA_HARI } from '../model/tipe';
import { hariPekan } from '../model/kalender';
import { keMenit } from '../model/skema';
import { bacaTerbit, type Terbit } from '../terbit/format';
import { daftarEntitasP, jadwalHariP, jadwalPekanP, type ElemenHari, type HariP, type ItemP, type ModeP } from './tampil';
import { esc, isoLokal, seninPekan, tambahHari, warnaMapel } from '../ui/util';

const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const tglPanjang = (iso: string): string => {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return `${d} ${BULAN[m - 1]} ${y}`;
};
const tglPendek = (iso: string): string => {
  const [, m, d] = iso.split('-').map(Number) as [number, number, number];
  return `${d} ${(BULAN[m - 1] ?? '').slice(0, 3)}`;
};

const NAMA_MODE: Record<ModeP, string> = { rombel: 'Kelas', guru: 'Guru', ruang: 'Ruang' };
const KUNCI_SIMPAN = 'jadwal-publik';

export interface Keadaan {
  mode: ModeP;
  id: string;
  tanggal: string;
  tata: 'hari' | 'pekan';
}

/** Hari kerja terdekat (hari ini bila hari kerja; selain itu berikutnya). */
export function hariKerjaTerdekat(tanggal: string, hariKerja: number): string {
  let t = tanggal;
  for (let i = 0; i < 7 && hariPekan(t) >= hariKerja; i++) t = tambahHari(t, 1);
  return t;
}

/** Hari kerja sebelum/sesudah tanggal. */
export function langkahHari(tanggal: string, arah: 1 | -1, hariKerja: number): string {
  let t = tambahHari(tanggal, arah);
  for (let i = 0; i < 7 && hariPekan(t) >= hariKerja; i++) t = tambahHari(t, arah);
  return t;
}

function bacaPilihan(): Partial<Keadaan> {
  const o: Partial<Keadaan> = {};
  try {
    const dariHash = new URLSearchParams(location.hash.split('?')[1] ?? '');
    const simpan = JSON.parse(localStorage.getItem(KUNCI_SIMPAN) ?? '{}') as Partial<Keadaan>;
    const m = dariHash.get('m') ?? simpan.mode;
    if (m === 'rombel' || m === 'guru' || m === 'ruang') o.mode = m;
    const id = dariHash.get('id') ?? simpan.id;
    if (id) o.id = id;
    const t = dariHash.get('t');
    if (t && /^\d{4}-\d{2}-\d{2}$/.test(t)) o.tanggal = t;
    const v = dariHash.get('v') ?? simpan.tata;
    if (v === 'hari' || v === 'pekan') o.tata = v;
  } catch {
    /* penyimpanan peramban boleh gagal */
  }
  return o;
}

function simpanPilihan(k: Keadaan): void {
  try {
    localStorage.setItem(KUNCI_SIMPAN, JSON.stringify({ mode: k.mode, id: k.id, tata: k.tata }));
    history.replaceState(null, '', `#/?${new URLSearchParams({ m: k.mode, id: k.id, t: k.tanggal, v: k.tata }).toString()}`);
  } catch {
    /* abaikan */
  }
}

const warnaStatus: Record<string, string> = {
  libur: 'bg-red-50 text-red-800 border-red-200',
  akhirPekan: 'bg-slate-100 text-slate-600 border-slate-200',
  diluarSemester: 'bg-slate-100 text-slate-600 border-slate-200',
  tidakAktif: 'bg-amber-50 text-amber-900 border-amber-200',
};

const rentangJam = (dari: string, sampai: string): string => (dari === sampai ? `Jam ${dari}` : `Jam ${dari}–${sampai}`);

function subBaris(mode: ModeP, it: ItemP): string {
  const guru = it.guru.map((g) => `${esc(g.nama)} <span class="text-slate-400">(${esc(g.kode)})</span>`).join(' &amp; ');
  if (mode === 'rombel') return guru;
  if (mode === 'ruang') return guru;
  return '';
}

function kartuBlok(mode: ModeP, e: Extract<ElemenHari, { jenis: 'blok' }>, sedang: boolean): string {
  const isi = e.item
    .map((it, i) => {
      const judul = mode === 'rombel' ? esc(it.mapel.nama) : `${esc(it.rombel)} · ${esc(it.mapel.nama)}`;
      const sub = subBaris(mode, it);
      return `<div class="${i ? 'mt-2 border-t border-dashed border-slate-300 pt-2' : ''} flex items-start gap-2">
        <div class="min-w-0 flex-1"><div class="text-[15px] font-semibold leading-snug">${judul}</div>${sub ? `<div class="text-[13px] leading-snug text-slate-600">${sub}</div>` : ''}</div>
        ${mode === 'ruang' ? '' : it.ruang ? `<span class="shrink-0 rounded-md border border-slate-300 bg-white px-1.5 py-0.5 font-mono text-xs font-bold text-slate-700" title="Ruang">${esc(it.ruang)}</span>` : ''}</div>`;
    })
    .join('');
  const w = warnaMapel(e.item[0]?.mapel.kode ?? '');
  return `<div class="flex gap-3">
    <div class="w-[4.2rem] shrink-0 pt-2 text-right"><div class="text-[13px] font-semibold tabular-nums">${esc(e.mulai)}</div><div class="text-[11px] tabular-nums text-slate-500">${esc(e.selesai)}</div><div class="mt-0.5 text-[11px] text-slate-500">${esc(rentangJam(e.dari, e.sampai))}</div></div>
    <div class="min-w-0 flex-1 rounded-xl border-l-[5px] px-3 py-2 shadow-sm ${sedang ? 'ring-2 ring-[#2347b8]' : ''}" style="background:${w.bg};border-color:${w.garis}">
      ${sedang ? '<div class="mb-1 inline-block rounded-full bg-[#2347b8] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">Sedang berlangsung</div>' : ''}${isi}</div></div>`;
}

function elemenHtml(mode: ModeP, e: ElemenHari, sekarang: number | null): string {
  const sedang = sekarang !== null && sekarang >= keMenit(e.mulai) && sekarang < keMenit(e.selesai);
  if (e.jenis === 'blok') return kartuBlok(mode, e, sedang);
  if (e.jenis === 'kosong') {
    return `<div class="flex gap-3"><div class="w-[4.2rem] shrink-0 text-right text-[12px] tabular-nums text-slate-400">${esc(e.mulai)}<br>${esc(e.selesai)}</div>
      <div class="flex-1 rounded-xl border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-400 ${sedang ? 'ring-2 ring-[#2347b8]/50' : ''}">${mode === 'rombel' ? 'Belum ada pelajaran' : 'Kosong'} <span class="text-[11px]">(${esc(rentangJam(e.dari, e.sampai))})</span></div></div>`;
  }
  return `<div class="flex items-center gap-3"><div class="w-[4.2rem] shrink-0 text-right text-[11px] tabular-nums text-slate-400">${esc(e.mulai)}</div>
    <div class="flex-1 rounded-full px-3 py-1 text-center text-xs ${e.jenis === 'istirahat' ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-600'} ${sedang ? 'ring-2 ring-[#2347b8]/50' : ''}">${esc(e.nama)} · ${esc(e.mulai)}–${esc(e.selesai)}</div></div>`;
}

function banner(h: HariP): string {
  const bagian: string[] = [];
  if (h.status !== 'normal') bagian.push(`<div class="rounded-xl border px-3 py-2 text-sm font-medium ${warnaStatus[h.status] ?? ''}">${esc(h.keterangan)}</div>`);
  if (h.kegiatan) {
    bagian.push(`<div class="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900"><b>${esc(h.kegiatan.nama)}</b></div>`);
  }
  if (h.agenda.length) {
    bagian.push(`<div class="flex flex-wrap gap-1.5">${h.agenda.map((a) => `<span class="rounded-full bg-violet-100 px-2.5 py-1 text-xs text-violet-900" title="${esc(a.jenis)}">${esc(a.nama)}${a.untuk && a.untuk !== 'semua' ? ` · ${esc(a.untuk)}` : ''}</span>`).join('')}</div>`);
  }
  return bagian.length ? `<div class="mb-3 space-y-2">${bagian.join('')}</div>` : '';
}

function tampilanHari(p: Proyek, k: Keadaan, hariIni: string): string {
  const h = jadwalHariP(p, k.tanggal, k.mode, k.id);
  const now = new Date();
  const sekarang = k.tanggal === hariIni ? now.getHours() * 60 + now.getMinutes() : null;
  const daftar = h.elemen.map((e) => elemenHtml(k.mode, e, sekarang)).join('');
  if (h.status !== 'normal') return banner(h);
  if (h.totalJp === 0) {
    const kata = k.mode === 'rombel' ? 'Belum ada pelajaran terjadwal pada hari ini.' : k.mode === 'guru' ? 'Tidak ada jadwal mengajar pada hari ini.' : 'Ruang ini tidak dipakai pada hari ini.';
    return `${banner(h)}<div class="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">${kata}</div>`;
  }
  const ringkas = `<div class="mb-2 text-xs text-slate-500">${h.totalJp} jam pelajaran${h.skema ? ` · ${esc(h.skema)}` : ''}</div>`;
  return `${banner(h)}${ringkas}<div class="space-y-2">${daftar}</div>`;
}

function tampilanPekan(p: Proyek, k: Keadaan, hariIni: string): string {
  const pk = jadwalPekanP(p, k.tanggal, k.mode, k.id);
  const kepala = pk.hari.map((h, i) => `<th class="min-w-[3.9rem] border-b border-slate-200 bg-white px-1 py-1.5 text-center ${h.tanggal === hariIni ? 'text-[#2347b8]' : ''}"><div class="text-xs font-bold">${esc(NAMA_HARI[i]?.slice(0, 3) ?? '')}</div><div class="text-[10px] font-normal text-slate-500">${esc(tglPendek(h.tanggal))}</div></th>`).join('');
  const isi = pk.baris.map((b, r) => `<tr><th class="sticky left-0 z-10 border-b border-slate-100 bg-white px-1.5 text-center text-[11px] font-semibold text-slate-500">${r + 1}</th>${b.map((c, i) => {
      const h = pk.hari[i] as HariP;
      if (h.status !== 'normal') return r === 0 ? `<td rowspan="${pk.baris.length}" class="border-b border-slate-100 p-1 align-top"><div class="rounded-lg border px-1 py-2 text-center text-[10px] ${warnaStatus[h.status] ?? ''}">${esc(h.keterangan)}</div></td>` : '';
      if (!c) return '<td class="border-b border-slate-100"></td>';
      if (!c.item.length) return `<td class="border-b border-slate-100 p-0.5"><div class="rounded-md border border-dashed border-slate-200 py-2 text-center text-[10px] text-slate-300">–</div></td>`;
      const it = c.item.map((x) => {
        const w = warnaMapel(x.mapel.kode);
        const baris2 = k.mode === 'rombel' ? x.guru.map((g) => g.kode).join('+') : x.rombel;
        return `<div class="rounded-md border-l-[3px] px-1 py-0.5 text-[10.5px] leading-tight" style="background:${w.bg};border-color:${w.garis}" title="${esc(`${x.mapel.nama} · ${x.rombel} · ${x.guru.map((g) => g.nama).join(' & ')}${x.ruang ? ` · ${x.ruang}` : ''} · ${c.mulai}–${c.selesai}`)}"><b>${esc(x.mapel.kode)}</b>${k.mode !== 'ruang' && x.ruang ? ` <span class="font-mono">${esc(x.ruang)}</span>` : ''}<div class="text-[10px] text-slate-600">${esc(baris2)}${k.mode === 'ruang' ? ` · ${esc(x.guru.map((g) => g.kode).join('+'))}` : ''}</div></div>`;
      }).join('');
      return `<td class="border-b border-slate-100 p-0.5 align-top">${it}</td>`;
    }).join('')}</tr>`).join('');
  const ket = pk.hari.map((h) => h.kegiatan?.nama).filter((x, i, a): x is string => !!x && a.indexOf(x) === i);
  return `${ket.length ? `<div class="mb-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">Pekan ini: <b>${esc(ket.join(', '))}</b></div>` : ''}
    <div class="overflow-x-auto rounded-xl border border-slate-200 bg-white"><table class="w-full border-collapse"><thead><tr><th class="sticky left-0 z-10 w-8 border-b border-slate-200 bg-white px-1 text-[10px] font-semibold text-slate-400">Jam</th>${kepala}</tr></thead><tbody>${isi}</tbody></table></div>
    <p class="mt-2 text-[11px] text-slate-500">Angka di kiri = pelajaran ke-n pada hari itu (tidak menghitung jam pembiasaan). Sentuh kartu untuk detail.</p>`;
}

export function gambarHalaman(t: Terbit, k: Keadaan, hariIni: string): string {
  const p = t.proyek;
  const n = p.polaReguler.length;
  const entitas = daftarEntitasP(p, k.mode);
  const grup = [...new Set(entitas.map((e) => e.grup))];
  const pilihan = grup
    .map((g) => {
      const opsi = entitas.filter((e) => e.grup === g).map((e) => `<option value="${esc(e.id)}" ${e.id === k.id ? 'selected' : ''}>${esc(e.label)}</option>`).join('');
      return g ? `<optgroup label="${esc(g)}">${opsi}</optgroup>` : opsi;
    })
    .join('');
  const senin = seninPekan(k.tanggal, n);
  const chipHari = Array.from({ length: n }, (_, i) => {
    const tgl = tambahHari(senin, i);
    const aktif = tgl === k.tanggal;
    return `<button data-aksi="hari" data-tgl="${tgl}" class="flex-1 rounded-xl px-1 py-1.5 text-center ${aktif ? 'bg-[#0d1e33] text-white' : 'bg-white text-slate-700 border border-slate-200'} ${tgl === hariIni && !aktif ? 'ring-2 ring-[#2347b8]/40' : ''}"><div class="text-[11px] font-semibold">${esc(NAMA_HARI[i]?.slice(0, 3) ?? '')}</div><div class="text-sm font-bold tabular-nums">${Number(tgl.slice(8))}</div></button>`;
  }).join('');
  const diperbarui = t.diterapkan ? new Date(t.diterapkan).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' }) : '';
  const seg = (m: ModeP) => `<button data-aksi="mode" data-mode="${m}" class="flex-1 px-3 py-2 text-sm font-semibold ${k.mode === m ? 'bg-[#0d1e33] text-white' : 'bg-white text-slate-700'}">${NAMA_MODE[m]}</button>`;
  const segTata = (v: 'hari' | 'pekan', label: string) => `<button data-aksi="tata" data-tata="${v}" class="px-3 py-1.5 text-sm font-semibold ${k.tata === v ? 'bg-[#0d1e33] text-white' : 'bg-white text-slate-700'}">${label}</button>`;
  const judulTgl = k.tata === 'hari' ? `${NAMA_HARI[hariPekan(k.tanggal)] ?? ''}, ${tglPanjang(k.tanggal)}` : `Pekan ${tglPendek(senin)} – ${tglPendek(tambahHari(senin, n - 1))}`;
  return `<header class="border-b border-slate-200 bg-white">
      <div class="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
        <div class="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#0d1e33]"><svg width="22" height="22" viewBox="0 0 22 22"><rect x="2" y="12" width="4" height="8" rx="1.5" fill="#f5b21a"/><rect x="9" y="7" width="4" height="13" rx="1.5" fill="#157f6e"/><rect x="16" y="2" width="4" height="18" rx="1.5" fill="#2347b8"/></svg></div>
        <div class="min-w-0"><div class="text-[11px] font-semibold tracking-widest text-amber-600">SMK NEGERI BANSARI</div><div class="truncate text-base font-bold leading-tight">Jadwal Pelajaran</div></div></div></header>
    <div class="sticky top-0 z-30 border-b border-slate-200 bg-stone-100/95 backdrop-blur"><div class="mx-auto max-w-3xl space-y-2 px-4 py-2.5">
      <div class="flex overflow-hidden rounded-xl border border-slate-300">${seg('rombel')}${seg('guru')}${seg('ruang')}</div>
      <select id="pilih" class="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base font-medium" aria-label="Pilih ${NAMA_MODE[k.mode]}">${pilihan}</select>
      <div class="flex items-center gap-2">
        <button data-aksi="mundur" class="h-10 w-10 shrink-0 rounded-xl border border-slate-300 bg-white text-lg" aria-label="Sebelumnya">‹</button>
        <label class="relative min-w-0 flex-1 cursor-pointer rounded-xl border border-slate-300 bg-white px-3 py-2 text-center text-sm font-semibold"><span class="block truncate">${esc(judulTgl)}</span><input id="tgl" type="date" value="${k.tanggal}" class="absolute inset-0 h-full w-full opacity-0" aria-label="Pilih tanggal"></label>
        <button data-aksi="maju" class="h-10 w-10 shrink-0 rounded-xl border border-slate-300 bg-white text-lg" aria-label="Berikutnya">›</button></div>
      <div class="flex items-center gap-2"><button data-aksi="hariIni" class="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium">Hari ini</button>
        <div class="ml-auto flex overflow-hidden rounded-xl border border-slate-300">${segTata('hari', 'Per hari')}${segTata('pekan', 'Per pekan')}</div></div>
      ${k.tata === 'hari' ? `<div class="flex gap-1.5">${chipHari}</div>` : ''}</div></div>
    <main class="mx-auto max-w-3xl px-4 py-4">${k.tata === 'hari' ? tampilanHari(p, k, hariIni) : tampilanPekan(p, k, hariIni)}</main>
    <footer class="mx-auto max-w-3xl px-4 pb-8 pt-2 text-center text-[11px] text-slate-500">${diperbarui ? `Jadwal diperbarui ${esc(diperbarui)} WIB · ` : ''}<a class="underline" href="#/admin">Admin</a></footer>`;
}

/** Mengambil dan membaca data terbit. */
export async function muatTerbit(ambil: typeof fetch = fetch, alamat = './terbit/jadwal.json'): Promise<{ ok: true; terbit: Terbit } | { ok: false; galat: string }> {
  try {
    const r = await ambil(alamat, { cache: 'no-cache' });
    if (r.status === 404) return { ok: false, galat: 'Jadwal belum diterbitkan.' };
    if (!r.ok) return { ok: false, galat: `Jadwal tidak bisa dimuat (kode ${r.status}).` };
    return bacaTerbit(await r.text());
  } catch {
    return { ok: false, galat: 'Jadwal tidak bisa dimuat. Periksa koneksi internet, lalu muat ulang halaman.' };
  }
}

export async function mulaiPublik(akar: HTMLElement, ambil: typeof fetch = fetch): Promise<void> {
  akar.innerHTML = '<div class="grid min-h-screen place-items-center text-sm text-slate-500">Memuat jadwal…</div>';
  const h = await muatTerbit(ambil);
  if (!h.ok) {
    akar.innerHTML = `<div class="mx-auto max-w-md px-4 py-16 text-center"><div class="text-lg font-bold">Jadwal Pelajaran · SMK Negeri Bansari</div><p class="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">${esc(h.galat)}</p><p class="mt-6 text-[11px] text-slate-500"><a class="underline" href="#/admin">Admin</a></p></div>`;
    return;
  }
  const t = h.terbit;
  const p = t.proyek;
  const n = p.polaReguler.length;
  const hariIni = isoLokal(new Date());
  const pilih = bacaPilihan();
  const k: Keadaan = { mode: pilih.mode ?? 'rombel', id: pilih.id ?? '', tanggal: pilih.tanggal ?? hariKerjaTerdekat(hariIni, n), tata: pilih.tata ?? 'hari' };
  const rapikan = () => {
    const daftar = daftarEntitasP(p, k.mode);
    if (!daftar.some((e) => e.id === k.id)) k.id = daftar[0]?.id ?? '';
    if (k.tata === 'hari' && hariPekan(k.tanggal) >= n) k.tanggal = hariKerjaTerdekat(k.tanggal, n);
  };
  const gambar = () => {
    rapikan();
    akar.innerHTML = gambarHalaman(t, k, hariIni);
    simpanPilihan(k);
  };
  akar.addEventListener('click', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-aksi]');
    if (!el) return;
    const d = el.dataset;
    if (d.aksi === 'mode') {
      k.mode = d.mode as ModeP;
      k.id = '';
    } else if (d.aksi === 'tata') k.tata = d.tata as 'hari' | 'pekan';
    else if (d.aksi === 'hari') k.tanggal = d.tgl as string;
    else if (d.aksi === 'hariIni') k.tanggal = k.tata === 'hari' ? hariKerjaTerdekat(hariIni, n) : hariIni;
    else if (d.aksi === 'maju') k.tanggal = k.tata === 'hari' ? langkahHari(k.tanggal, 1, n) : tambahHari(k.tanggal, 7);
    else if (d.aksi === 'mundur') k.tanggal = k.tata === 'hari' ? langkahHari(k.tanggal, -1, n) : tambahHari(k.tanggal, -7);
    else return;
    gambar();
  });
  akar.addEventListener('change', (e) => {
    const el = e.target as HTMLInputElement;
    if (el.id === 'pilih') k.id = el.value;
    else if (el.id === 'tgl' && /^\d{4}-\d{2}-\d{2}$/.test(el.value)) k.tanggal = el.value;
    else return;
    gambar();
  });
  gambar();
}
