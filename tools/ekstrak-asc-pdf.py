#!/usr/bin/env python3
"""
Mengekstrak jadwal reguler dari PDF ekspor aSc Timetables (Jadwal Kelas dan Jadwal Guru) menjadi satu berkas JSON
per-JP: data/sekolah/sumber/reguler-gasal-2026.json.

Pemakaian:  python3 tools/ekstrak-asc-pdf.py "Jadwal Kelas.pdf" "Jadwal Guru.pdf" data/sekolah/sumber/reguler-gasal-2026.json
Perlu: pdfplumber (pip install pdfplumber).

Cara baca: kolom 1 = Pembiasaan (P1, bukan JP); kolom 2..11 = pelajaran ke-1..10 (nomor KBM = kolom - 1); kolom Break dilewati.
Jadwal Guru dipakai sebagai sumber utama (nama guru utuh dari judul halaman); Jadwal Kelas dipakai memeriksa silang.
"""
import json
import re
import sys
from collections import defaultdict

import pdfplumber

X = [88.9, 142.1, 195.2, 248.4, 301.4, 354.6, 407.8, 460.9, 514.1, 567.1, 620.3, 673.4, 726.6, 779.8]
KOLOM = ['1', '2', '3', '4', 'B1', '5', '6', '7', 'B2', '8', '9', '10', '11']
HARI = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat']


def kolom_ke(x):
    for i in range(13):
        if X[i] - 1 <= x < X[i + 1] + 1:
            return i
    return None


def baris_hari(p):
    ys = sorted({round(l['top'], 1) for l in p.lines if abs(l['top'] - l['bottom']) < 0.5 and l['top'] >= 113})
    return [b for b in zip(ys[:-1], ys[1:]) if b[1] - b[0] > 60][:5]


def sel_hari(p, top, bot):
    vl = sorted({round(l['x0'], 1) for l in p.lines if abs(l['x0'] - l['x1']) < 0.5 and l['top'] <= top + 2 and l['bottom'] >= bot - 2})
    cb = sorted(set(vl + [X[0], X[-1]]))
    return list(zip(cb[:-1], cb[1:]))


def baca_halaman(p, ukuran):
    """ukuran: dict ukuran font -> peran. Mengembalikan (judul, [ (hari, kolomAwal, kolomAkhir, besar, kecil, ruang) ])."""
    kata = p.extract_words(extra_attrs=['size'])
    kartu = []
    for di, (top, bot) in enumerate(baris_hari(p)):
        ws = [w for w in kata if top <= w['top'] < bot and w['x0'] > X[0] - 1]
        for a, b in sel_hari(p, top, bot):
            dalam = lambda w: a - 1 <= (w['x0'] + w['x1']) / 2 <= b + 1
            besar = [w for w in ws if ukuran['besar'][0] < w['size'] < ukuran['besar'][1] and dalam(w)]
            if not besar:
                continue
            besar.sort(key=lambda w: (round(w['top']), w['x0']))
            kecil = sorted([w for w in ws if ukuran['kecil'][0] < w['size'] < ukuran['kecil'][1] and dalam(w)], key=lambda w: (round(w['top'] / 3), w['x0']))
            ruang = [w['text'] for w in sorted([w for w in ws if ukuran['ruang'][0] < w['size'] < ukuran['ruang'][1] and dalam(w)], key=lambda w: w['x0'])]
            kartu.append((di, KOLOM[kolom_ke(a + 1)], KOLOM[kolom_ke(b - 1)], ''.join(w['text'] for w in besar), ' '.join(w['text'] for w in kecil), ruang))
    return kata, kartu


def jam_kbm(k0, k1):
    """Kolom awal..akhir -> daftar nomor KBM (kolom Break dan kolom 1 dilewati)."""
    i0, i1 = KOLOM.index(k0), KOLOM.index(k1)
    return [int(KOLOM[i]) - 1 for i in range(i0, i1 + 1) if KOLOM[i] not in ('B1', 'B2', '1')]


def norm_kelas(s):
    m = re.match(r'^(xii|xi|x)\.(at|te|dkv)(\d)$', s.strip().lower())
    return f'{m.group(1).upper()} {m.group(2).upper()} {m.group(3)}' if m else None


def baca_guru(path):
    hasil = []
    for p in pdfplumber.open(path).pages:
        kata, kartu = baca_halaman(p, {'besar': (14, 16.5), 'kecil': (12, 13), 'ruang': (11, 12)})
        nama = ' '.join(w['text'] for w in sorted([w for w in kata if 28 < w['top'] < 62 and w['size'] > 18], key=lambda w: (round(w['top']), w['x0'])))
        for di, k0, k1, kelas, mapel, ruang in kartu:
            rb = norm_kelas(kelas)
            if not rb:
                continue
            for j in jam_kbm(k0, k1):
                hasil.append({'rombel': rb, 'hari': di, 'jam': j, 'guru': nama.strip(), 'mapel': mapel.strip(), 'ruang': ruang[0] if ruang else ''})
    return hasil


def baca_kelas(path):
    hasil = []
    for p in pdfplumber.open(path).pages:
        kata = p.extract_words(extra_attrs=['size'])
        rb = ' '.join(w['text'] for w in sorted([w for w in kata if 28 < w['top'] < 60 and 14 < w['size']], key=lambda w: w['x0']))
        _, kartu = baca_halaman(p, {'besar': (14, 17), 'kecil': (8, 10), 'ruang': (12, 13.5)})
        for di, k0, k1, mapel, guru, ruang in kartu:
            if mapel == 'P1':
                continue
            for j in jam_kbm(k0, k1):
                hasil.append({'rombel': rb.strip(), 'hari': di, 'jam': j, 'mapel': mapel, 'ruang': ruang[0] if ruang else ''})
    return hasil


def main(kelas_pdf, guru_pdf, keluar):
    g = baca_guru(guru_pdf)
    k = baca_kelas(kelas_pdf)
    gk = {(x['rombel'], x['hari'], x['jam']): x for x in g}
    kk = {(x['rombel'], x['hari'], x['jam']): x for x in k}
    ganda = [key for key in {(x['rombel'], x['hari'], x['jam']) for x in g} if sum(1 for y in g if (y['rombel'], y['hari'], y['jam']) == key) > 1]
    beda = []
    for key in sorted(set(gk) | set(kk)):
        a, b = gk.get(key), kk.get(key)
        if not a or not b:
            beda.append((key, 'hanya di ' + ('guru' if a else 'kelas')))
        elif a['mapel'].lower() != b['mapel'].lower() or a['ruang'] != b['ruang']:
            beda.append((key, f"guru:{a['mapel']}/{a['ruang']} kelas:{b['mapel']}/{b['ruang']}"))
    print(f'JP dari jadwal guru: {len(g)}; dari jadwal kelas: {len(k)}; sel kelas dengan >1 guru: {len(ganda)}; beda: {len(beda)}')
    for key, m in beda[:30]:
        print('  beda', key, m)
    per = defaultdict(list)
    for x in sorted(g, key=lambda x: (x['rombel'], x['hari'], x['jam'], x['guru'])):
        per[x['rombel']].append({k2: x[k2] for k2 in ('hari', 'jam', 'guru', 'mapel', 'ruang')})
    urut = {r: per[r] for r in sorted(per, key=lambda r: (['X', 'XI', 'XII'].index(r.split()[0]), r.split()[1], int(r.split()[2])))}
    with open(keluar, 'w', encoding='utf-8') as f:
        json.dump({'sumber': 'Jadwal Kelas dan Jadwal Guru Gasal 2026 (aSc Timetables)', 'semester': 'Gasal 2026/2027', 'catatan': 'jam = nomor KBM (kolom aSc 2..11 = jam 1..10); hari 0 = Senin', 'rombel': urut}, f, ensure_ascii=False, indent=1)
    print('ditulis', keluar, 'rombel:', len(urut))


if __name__ == '__main__':
    main(*sys.argv[1:4])
