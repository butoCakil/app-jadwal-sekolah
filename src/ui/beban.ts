import type { Beban } from '../model/tipe';
import { warnaMapel, esc, opsi } from './util';
import { ringkasKode, tombolPemilih } from './pemilih';
import type { Guru, Proyek } from '../model/tipe';
import { jpRombel } from '../model/jp';
import type { Konteks } from './konteks';

const kodeGuruDari = (p: Proyek, ids: string[]) => ids.map((i) => p.master.guru.find((g) => g.id === i)?.kode ?? '?');
const kodeRuangDari = (p: Proyek, ids: string[]) => ids.map((i) => p.master.ruang.find((r) => r.id === i)?.kode ?? '?');

/** Pilihan guru; bila ada guru yang mendaftarkan mapel ini (atau induknya) sebagai mapel yang diampu, mereka dikelompokkan di atas. */
export function opsiGuru(p: Proyek, mapelId: string, terpilih: string, kosong?: string): string {
  const mapel = p.master.mapel.find((m) => m.id === mapelId);
  const cocok = (g: Guru) => !!g.mapelIds && (g.mapelIds.includes(mapelId) || (!!mapel?.induk && g.mapelIds.includes(mapel.induk)));
  const label = (g: Guru) => `${g.kode} · ${g.nama}`;
  const awal = kosong !== undefined ? `<option value="">${esc(kosong)}</option>` : '';
  const ampu = mapelId ? p.master.guru.filter(cocok) : [];
  if (ampu.length === 0) return awal + opsi(p.master.guru, terpilih, (g) => g.id, label);
  const lain = p.master.guru.filter((g) => !cocok(g));
  return `${awal}<optgroup label="Mengampu ${esc(mapel?.kode ?? '')}">${opsi(ampu, terpilih, (g) => g.id, label)}</optgroup><optgroup label="Guru lain">${opsi(lain, terpilih, (g) => g.id, label)}</optgroup>`;
}

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
        <div class="text-xs text-slate-600">Guru tim teaching<div class="mt-1">${tombolPemilih('bebanTim', b.id, ringkasKode(kodeGuruDari(p, b.timGuruIds), 'guru'), 'Pilih guru…', 'w-full')}</div></div>
        <label class="text-xs text-slate-600">Kelompok paralel<input class="isian mt-1 w-full" placeholder="mis. PA" value="${esc(b.paralel ?? '')}" data-aksi="bf" data-f="paralel" data-id="${esc(b.id)}"></label>
        <div class="text-xs text-slate-600">Ruang prioritas (urut)<div class="mt-1">${tombolPemilih('bebanPrio', b.id, kodeRuangDari(p, b.ruangPrioritas).join(' › '), 'Semua yang diperbolehkan', 'w-full')}</div></div>
        <div class="text-xs text-slate-600">Ruang terlarang<div class="mt-1">${tombolPemilih('bebanLarang', b.id, ringkasKode(kodeRuangDari(p, b.ruangTerlarang), 'ruang'), 'Tidak ada', 'w-full')}</div></div>
        <label class="flex items-end gap-2 pb-1 text-xs text-slate-600"><input type="checkbox" ${b.nonTatapMuka ? 'checked' : ''} data-aksi="bf" data-f="ntm" data-id="${esc(b.id)}"> Non-tatap-muka (mis. pembimbing PKL)</label></div>`
    : '';
  return `<div class="rounded-lg border border-slate-200 p-2" style="border-left:4px solid ${w.garis}">
    <div class="flex flex-wrap items-center gap-2">
      <select class="isian min-w-40 flex-1" data-aksi="bf" data-f="mapelId" data-id="${esc(b.id)}">${opsi(p.master.mapel, b.mapelId, (m) => m.id, (m) => `${m.induk ? '   ↳ ' : ''}${m.kode} · ${m.nama}`)}</select>
      <select class="isian min-w-36" data-aksi="bf" data-f="guruId" data-id="${esc(b.id)}">${opsiGuru(p, b.mapelId, b.guruId)}</select>
      <label class="text-xs text-slate-500">JP <input type="number" min="0" class="isian w-14" value="${b.jp}" data-aksi="bf" data-f="jp" data-id="${esc(b.id)}"></label>
      <div class="w-28"><div class="h-2 overflow-hidden rounded-full bg-slate-200"><div class="h-full ${warnaBar}" style="width:${persen}%"></div></div><div class="mt-0.5 text-[11px] text-slate-500">${status}${b.paralel ? ` · ${esc(b.paralel)}` : ''}</div></div>
      <button class="tombol !px-2" data-aksi="bebanBuka" data-id="${esc(b.id)}" title="Pengaturan lanjutan">${buka ? '▲' : '⚙'}</button>
      <button class="tombol !px-2 !text-red-600" data-aksi="bebanHapus" data-id="${esc(b.id)}" title="Hapus beban">✕</button></div>${lanjut}</div>`;
}

/** Pilihan rombel berupa kartu per tingkat lalu jurusan (X di atas, lalu XI, XII); tombol selalu berjarak dan berlebar sama. */
function tabRombel(k: Konteks, aktif: string): string {
  const p = k.p;
  const urutJurusan = [...new Set(p.master.rombel.map((r) => r.jurusan))];
  const tombol = (r: (typeof p.master.rombel)[number]) => {
    const total = jpRombel(k.turunan.beban.filter((b) => b.rombelId === r.id));
    const tdkAktif = k.turunan.rombelTidakAktif.has(r.id);
    const pilih = r.id === aktif;
    return `<button data-aksi="bebanTab" data-id="${esc(r.id)}" class="flex flex-col items-center rounded-lg border px-1 py-1.5 leading-tight ${pilih ? 'border-[#2347b8] bg-[#2347b8] text-white' : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'}" title="${esc(r.kode)} · ${total} JP${tdkAktif ? ' · tidak aktif pada tanggal acuan (mis. PKL)' : ''}">
      <span class="text-sm font-semibold">${esc(`${r.jurusan} ${r.nomor}`)}</span>
      <span class="text-[10px] ${pilih ? 'text-white/80' : 'text-slate-500'}">${total} JP${tdkAktif ? ' · off' : ''}</span></button>`;
  };
  const bagian = (['X', 'XI', 'XII'] as const)
    .map((tingkat) => {
      const kartu = urutJurusan
        .map((j) => ({ j, daftar: p.master.rombel.filter((r) => r.tingkat === tingkat && r.jurusan === j) }))
        .filter((x) => x.daftar.length)
        .map(({ j, daftar }) => `<div class="rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
          <div class="mb-1.5 flex items-baseline justify-between"><span class="text-xs font-bold text-slate-700">Kelas ${tingkat} ${esc(j)}</span><span class="text-[10px] text-slate-400">${daftar.length} rombel</span></div>
          <div class="grid grid-cols-4 gap-1.5">${daftar.map(tombol).join('')}</div></div>`)
        .join('');
      return kartu ? `<div class="mb-3"><div class="mb-1.5 text-[11px] font-semibold tracking-wide text-slate-400">TINGKAT ${tingkat}</div><div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">${kartu}</div></div>` : '';
    })
    .join('');
  return `<div class="mb-1">${bagian}</div>`;
}

export function renderBeban(k: Konteks): string {
  const p = k.p;
  const aktif = p.master.rombel.some((r) => r.id === k.ui.bebanRombel) ? k.ui.bebanRombel : (p.master.rombel[0]?.id ?? '');
  const r = p.master.rombel.find((x) => x.id === aktif);
  const kartu = !r
    ? ''
    : (() => {
        const daftar = k.turunan.beban.filter((b) => b.rombelId === r.id);
        const total = jpRombel(daftar);
        const jadi = daftar.filter((b) => !b.nonTatapMuka).reduce((a, b) => a + Math.min(b.jp, k.turunan.slots.filter((s) => s.bebanId === b.id).length), 0);
        const ket = r.jpButuh !== undefined ? ` · data sumber: ${r.jpButuh} JP${r.jpButuh !== total ? ` <span class="text-red-600">(selisih ${total - r.jpButuh >= 0 ? '+' : ''}${total - r.jpButuh})</span>` : ''}` : '';
        const nonaktif = k.turunan.rombelTidakAktif.has(r.id) ? ' <span class="lencana bg-amber-100 text-amber-800">tidak aktif pada tanggal acuan (mis. PKL)</span>' : '';
        return `<div class="kartu p-3"><div class="mb-2 flex flex-wrap items-baseline gap-2"><h3 class="text-base font-semibold">${esc(r.kode)}</h3>
        <span class="text-sm text-slate-500">Beban ${total} JP · terjadwal ${jadi}${ket}</span>${nonaktif}</div>
        <div class="space-y-2">${daftar.map((b) => barisBeban(k, b)).join('') || '<div class="text-sm text-slate-500">Belum ada beban.</div>'}</div>
        <div class="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3" data-form="${esc(r.id)}">
          <select class="isian min-w-40 flex-1" data-nb="mapel">${opsi(p.master.mapel, '', (m) => m.id, (m) => `${m.induk ? '   ↳ ' : ''}${m.kode} · ${m.nama}`, '— pilih mapel —')}</select>
          <select class="isian min-w-36" data-nb="guru">${opsiGuru(p, '', '', '— pilih guru —')}</select>
          <label class="text-xs text-slate-500">JP <input type="number" min="0" value="2" class="isian w-14" data-nb="jp"></label>
          <button class="tombol-utama" data-aksi="bebanTambah" data-rombel="${esc(r.id)}">+ Tambah beban</button></div></div>`;
      })();

  const guruRekap = p.master.guru
    .map((g) => {
      const milik = k.turunan.beban.filter((b) => b.guruId === g.id || b.timGuruIds.includes(g.id));
      const tatap = milik.filter((b) => !b.nonTatapMuka).reduce((a, b) => a + b.jp, 0);
      const non = milik.filter((b) => b.nonTatapMuka).reduce((a, b) => a + b.jp, 0);
      return { g, tatap, non, rombel: new Set(milik.map((b) => b.rombelId)).size };
    })
    .filter((x) => x.tatap + x.non > 0);

  const khusus = p.beban.some((b) => b.versiId);
  const infoVersi = khusus ? `<div class="mb-3 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-900">Beban untuk jadwal <b>${esc(k.turunan.versi?.nama ?? '—')}</b>${k.turunan.periode ? ` (periode ${esc(k.turunan.periode.nama)})` : ''}. Tiap versi jadwal punya beban sendiri; ganti periode di Grid Jadwal atau Skema &amp; Kalender untuk melihat beban versi lain.</div>` : '';
  return `<div class="mb-2 text-lg font-semibold">Beban mengajar</div>${infoVersi}${tabRombel(k, aktif)}
    <div class="grid gap-3 xl:grid-cols-[1fr_300px]"><div class="space-y-3">${kartu || '<div class="kartu p-6 text-center text-sm text-slate-500">Belum ada rombel. Tambahkan di Master Data.</div>'}</div>
    <aside class="kartu h-fit p-3"><div class="mb-2 text-sm font-semibold">Rekap JP per guru</div>
      <table class="w-full text-sm"><thead class="text-left text-xs text-slate-500"><tr><th>Guru</th><th class="text-right">JP</th><th class="text-right">Non-tatap</th><th class="text-right">Rombel</th></tr></thead>
      <tbody>${guruRekap.map((x) => `<tr class="border-t border-slate-100"><td class="py-1">${esc(x.g.kode)} · ${esc(x.g.nama)}</td><td class="text-right font-semibold">${x.tatap}</td><td class="text-right text-slate-500">${x.non || ''}</td><td class="text-right text-slate-500">${x.rombel}</td></tr>`).join('') || '<tr><td colspan="4" class="py-2 text-slate-500">Belum ada.</td></tr>'}</tbody></table></aside></div>`;
}

export function klikBeban(k: Konteks, el: HTMLElement): boolean {
  const d = el.dataset;
  if (d.aksi === 'bebanTab') {
    k.ui.bebanRombel = d.id ?? '';
    k.gambar();
    return true;
  }
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
    const versiId = k.p.beban.some((b) => b.versiId) ? k.turunan.versi?.id : undefined;
    k.ubah((p) => p.beban.push({ id: `b${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`, rombelId: d.rombel ?? '', mapelId, guruId, jp, timGuruIds: [], ruangPrioritas: [], ruangTerlarang: [], ...(versiId ? { versiId } : {}) }));
    return true;
  }
  return false;
}

export function ubahBeban(k: Konteks, el: HTMLInputElement & HTMLSelectElement): boolean {
  const d = el.dataset;
  if (d.nb === 'mapel') {
    // memilih mapel: guru yang mengampu mapel itu dikelompokkan di atas
    const guru = el.closest<HTMLElement>('[data-form]')?.querySelector<HTMLSelectElement>('[data-nb=guru]');
    if (guru) guru.innerHTML = opsiGuru(k.p, el.value, guru.value, '— pilih guru —');
    return true;
  }
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
