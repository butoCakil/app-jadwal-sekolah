import type { Beban } from '../model/tipe';
import { warnaMapel, esc, opsi, pecahKode } from './util';
import type { Konteks } from './konteks';

/** Mengubah daftar kode ("A, B") menjadi id; mengembalikan kode yang tidak dikenal. */
function kodeKeId(daftar: { id: string; kode: string }[], teks: string): { ids: string[]; salah: string[] } {
  const peta = new Map(daftar.map((x) => [x.kode.toUpperCase(), x.id]));
  const ids: string[] = [];
  const salah: string[] = [];
  for (const k of pecahKode(teks)) {
    const id = peta.get(k);
    if (id) ids.push(id);
    else salah.push(k);
  }
  return { ids, salah };
}
const idKeKode = (daftar: { id: string; kode: string }[], ids: string[]) => ids.map((i) => daftar.find((x) => x.id === i)?.kode ?? '?').join(', ');

function barisBeban(k: Konteks, b: Beban): string {
  const p = k.p;
  const terjadwal = k.turunan.slots.filter((s) => s.bebanId === b.id).length;
  const persen = b.jp === 0 ? 100 : Math.min(100, Math.round((terjadwal / b.jp) * 100));
  const mapelKode = p.master.mapel.find((m) => m.id === b.mapelId)?.kode ?? '?';
  const w = warnaMapel(mapelKode);
  const status = b.nonTatapMuka ? 'non-tatap-muka' : `${terjadwal}/${b.jp}`;
  const warnaBar = b.nonTatapMuka ? 'bg-slate-300' : terjadwal === b.jp ? 'bg-emerald-500' : terjadwal > b.jp ? 'bg-red-500' : 'bg-amber-400';
  const buka = k.ui.bebanTerbuka.has(b.id);
  const lanjut = buka
    ? `<div class="mt-2 grid gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-2 lg:grid-cols-3">
        <label class="text-xs text-slate-600">Pola pertemuan (mis. 2,2)<input class="isian mt-1 w-full" value="${esc((b.pola ?? []).join(','))}" data-aksi="bf" data-f="pola" data-id="${esc(b.id)}"></label>
        <label class="text-xs text-slate-600">Guru tim teaching (kode)<input class="isian mt-1 w-full" placeholder="mis. E, F" value="${esc(idKeKode(p.master.guru, b.timGuruIds))}" data-aksi="bf" data-f="tim" data-id="${esc(b.id)}"></label>
        <label class="text-xs text-slate-600">Kelompok paralel<input class="isian mt-1 w-full" placeholder="mis. PA" value="${esc(b.paralel ?? '')}" data-aksi="bf" data-f="paralel" data-id="${esc(b.id)}"></label>
        <label class="text-xs text-slate-600">Ruang prioritas (urut, kode)<input class="isian mt-1 w-full" placeholder="mis. B3, B4" value="${esc(idKeKode(p.master.ruang, b.ruangPrioritas))}" data-aksi="bf" data-f="prio" data-id="${esc(b.id)}"></label>
        <label class="text-xs text-slate-600">Ruang terlarang (kode)<input class="isian mt-1 w-full" placeholder="mis. AT1" value="${esc(idKeKode(p.master.ruang, b.ruangTerlarang))}" data-aksi="bf" data-f="larang" data-id="${esc(b.id)}"></label>
        <label class="flex items-end gap-2 pb-1 text-xs text-slate-600"><input type="checkbox" ${b.nonTatapMuka ? 'checked' : ''} data-aksi="bf" data-f="ntm" data-id="${esc(b.id)}"> Non-tatap-muka (mis. pembimbing PKL)</label></div>`
    : '';
  return `<div class="rounded-lg border border-slate-200 p-2" style="border-left:4px solid ${w.garis}">
    <div class="flex flex-wrap items-center gap-2">
      <select class="isian min-w-40 flex-1" data-aksi="bf" data-f="mapelId" data-id="${esc(b.id)}">${opsi(p.master.mapel, b.mapelId, (m) => m.id, (m) => `${m.kode} · ${m.nama}`)}</select>
      <select class="isian min-w-36" data-aksi="bf" data-f="guruId" data-id="${esc(b.id)}">${opsi(p.master.guru, b.guruId, (g) => g.id, (g) => `${g.kode} · ${g.nama}`)}</select>
      <label class="text-xs text-slate-500">JP <input type="number" min="0" class="isian w-14" value="${b.jp}" data-aksi="bf" data-f="jp" data-id="${esc(b.id)}"></label>
      <div class="w-28"><div class="h-2 overflow-hidden rounded-full bg-slate-200"><div class="h-full ${warnaBar}" style="width:${persen}%"></div></div><div class="mt-0.5 text-[11px] text-slate-500">${status}${b.paralel ? ` · ${esc(b.paralel)}` : ''}</div></div>
      <button class="tombol !px-2" data-aksi="bebanBuka" data-id="${esc(b.id)}" title="Pengaturan lanjutan">${buka ? '▲' : '⚙'}</button>
      <button class="tombol !px-2 !text-red-600" data-aksi="bebanHapus" data-id="${esc(b.id)}" title="Hapus beban">✕</button></div>${lanjut}</div>`;
}

export function renderBeban(k: Konteks): string {
  const p = k.p;
  const pilih = k.ui.bebanRombel;
  const rombel = p.master.rombel.filter((r) => pilih === 'semua' || r.id === pilih);
  const kartu = rombel
    .map((r) => {
      const daftar = p.beban.filter((b) => b.rombelId === r.id);
      const total = daftar.filter((b) => !b.nonTatapMuka).reduce((a, b) => a + b.jp, 0);
      const jadi = daftar.filter((b) => !b.nonTatapMuka).reduce((a, b) => a + Math.min(b.jp, k.turunan.slots.filter((s) => s.bebanId === b.id).length), 0);
      const ket = r.jpButuh !== undefined ? ` · data sumber: ${r.jpButuh} JP${r.jpButuh !== total ? ` <span class="text-red-600">(selisih ${total - r.jpButuh >= 0 ? '+' : ''}${total - r.jpButuh})</span>` : ''}` : '';
      return `<div class="kartu p-3"><div class="mb-2 flex flex-wrap items-baseline gap-2"><h3 class="text-base font-semibold">${esc(r.kode)}</h3>
        <span class="text-sm text-slate-500">Beban ${total} JP · terjadwal ${jadi}${ket}</span></div>
        <div class="space-y-2">${daftar.map((b) => barisBeban(k, b)).join('') || '<div class="text-sm text-slate-500">Belum ada beban.</div>'}</div>
        <div class="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3" data-form="${esc(r.id)}">
          <select class="isian min-w-40 flex-1" data-nb="mapel">${opsi(p.master.mapel, '', (m) => m.id, (m) => `${m.kode} · ${m.nama}`, '— pilih mapel —')}</select>
          <select class="isian min-w-36" data-nb="guru">${opsi(p.master.guru, '', (g) => g.id, (g) => `${g.kode} · ${g.nama}`, '— pilih guru —')}</select>
          <label class="text-xs text-slate-500">JP <input type="number" min="0" value="2" class="isian w-14" data-nb="jp"></label>
          <button class="tombol-utama" data-aksi="bebanTambah" data-rombel="${esc(r.id)}">+ Tambah beban</button></div></div>`;
    })
    .join('');

  const guruRekap = p.master.guru
    .map((g) => {
      const milik = p.beban.filter((b) => b.guruId === g.id || b.timGuruIds.includes(g.id));
      const tatap = milik.filter((b) => !b.nonTatapMuka).reduce((a, b) => a + b.jp, 0);
      const non = milik.filter((b) => b.nonTatapMuka).reduce((a, b) => a + b.jp, 0);
      return { g, tatap, non, rombel: new Set(milik.map((b) => b.rombelId)).size };
    })
    .filter((x) => x.tatap + x.non > 0);

  return `<div class="mb-3 flex flex-wrap items-center gap-3"><div class="text-lg font-semibold">Beban mengajar</div>
      <select id="bebanRombel" class="isian">${opsi([{ id: 'semua', kode: 'Semua rombel' }, ...p.master.rombel], pilih, (r) => r.id, (r) => r.kode)}</select></div>
    <div class="grid gap-3 xl:grid-cols-[1fr_300px]"><div class="space-y-3">${kartu || '<div class="kartu p-6 text-center text-sm text-slate-500">Belum ada rombel. Tambahkan di Master Data.</div>'}</div>
    <aside class="kartu h-fit p-3"><div class="mb-2 text-sm font-semibold">Rekap JP per guru</div>
      <table class="w-full text-sm"><thead class="text-left text-xs text-slate-500"><tr><th>Guru</th><th class="text-right">JP</th><th class="text-right">Non-tatap</th><th class="text-right">Rombel</th></tr></thead>
      <tbody>${guruRekap.map((x) => `<tr class="border-t border-slate-100"><td class="py-1">${esc(x.g.kode)} · ${esc(x.g.nama)}</td><td class="text-right font-semibold">${x.tatap}</td><td class="text-right text-slate-500">${x.non || ''}</td><td class="text-right text-slate-500">${x.rombel}</td></tr>`).join('') || '<tr><td colspan="4" class="py-2 text-slate-500">Belum ada.</td></tr>'}</tbody></table></aside></div>`;
}

export function klikBeban(k: Konteks, el: HTMLElement): boolean {
  const d = el.dataset;
  if (d.aksi === 'bebanBuka') {
    const s = k.ui.bebanTerbuka;
    if (s.has(d.id ?? '')) s.delete(d.id ?? '');
    else s.add(d.id ?? '');
    k.gambar();
    return true;
  }
  if (d.aksi === 'bebanHapus') {
    const b = k.p.beban.find((x) => x.id === d.id);
    if (!b) return true;
    const n = k.turunan.slots.filter((s) => s.bebanId === b.id).length;
    if (n > 0 && !confirm(`Beban ini sudah terjadwal ${n} slot. Hapus beban beserta slotnya?`)) return true;
    k.ubah((p) => {
      p.beban = p.beban.filter((x) => x.id !== b.id);
      for (const v of p.versi) v.slots = v.slots.filter((s) => s.bebanId !== b.id);
    });
    return true;
  }
  if (d.aksi === 'bebanTambah') {
    const f = el.closest<HTMLElement>('[data-form]');
    const mapelId = f?.querySelector<HTMLSelectElement>('[data-nb=mapel]')?.value ?? '';
    const guruId = f?.querySelector<HTMLSelectElement>('[data-nb=guru]')?.value ?? '';
    const jp = Number(f?.querySelector<HTMLInputElement>('[data-nb=jp]')?.value ?? 0);
    if (!mapelId || !guruId) {
      k.lapor('Pilih mapel dan guru dulu.');
      return true;
    }
    if (!Number.isInteger(jp) || jp < 0) {
      k.lapor('JP harus bilangan bulat 0 atau lebih.');
      return true;
    }
    k.ubah((p) => p.beban.push({ id: `b${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`, rombelId: d.rombel ?? '', mapelId, guruId, jp, timGuruIds: [], ruangPrioritas: [], ruangTerlarang: [] }));
    return true;
  }
  return false;
}

export function ubahBeban(k: Konteks, el: HTMLInputElement & HTMLSelectElement): boolean {
  if (el.id === 'bebanRombel') {
    k.ui.bebanRombel = el.value;
    k.gambar();
    return true;
  }
  const d = el.dataset;
  if (d.aksi !== 'bf') return false;
  const b = k.p.beban.find((x) => x.id === d.id);
  if (!b) return true;
  const tolak = (pesan: string) => {
    k.lapor(pesan);
    k.gambar();
    return true;
  };
  const f = d.f;
  if (f === 'jp') {
    const n = Number(el.value);
    if (!Number.isInteger(n) || n < 0) return tolak('JP harus bilangan bulat 0 atau lebih.');
    k.ubah(() => void (b.jp = n));
  } else if (f === 'mapelId' || f === 'guruId') {
    k.ubah(() => void (b[f] = el.value));
  } else if (f === 'pola') {
    const angka = el.value.split(/[,\s]+/).filter(Boolean).map(Number);
    if (angka.some((n) => !Number.isInteger(n) || n < 1)) return tolak('Pola harus berupa bilangan bulat dipisah koma, mis. 2,2.');
    k.ubah(() => {
      if (angka.length) b.pola = angka;
      else delete b.pola;
    });
  } else if (f === 'tim' || f === 'prio' || f === 'larang') {
    const sumber: { id: string; kode: string }[] = f === 'tim' ? k.p.master.guru : k.p.master.ruang;
    const { ids, salah } = kodeKeId(sumber, el.value);
    if (salah.length) return tolak(`Kode tidak dikenal: ${salah.join(', ')}.`);
    if (f === 'tim' && ids.includes(b.guruId)) return tolak('Guru utama tidak perlu ditulis di tim teaching.');
    k.ubah(() => {
      if (f === 'tim') b.timGuruIds = ids;
      else if (f === 'prio') b.ruangPrioritas = ids;
      else b.ruangTerlarang = ids;
    });
  } else if (f === 'paralel') {
    const v = el.value.trim();
    k.ubah(() => {
      if (v) b.paralel = v;
      else delete b.paralel;
    });
  } else if (f === 'ntm') {
    k.ubah(() => {
      if (el.checked) b.nonTatapMuka = true;
      else delete b.nonTatapMuka;
    });
  }
  return true;
}
