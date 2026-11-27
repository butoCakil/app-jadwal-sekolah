#!/usr/bin/env python3
"""
Mengekstrak jadwal dari PDF "Jadwal Kelas" ekspor aSc Timetables (satu halaman per rombel) menjadi JSON per-JP.

Pemakaian:  python3 tools/ekstrak-asc-kelas.py "JADWAL KELAS.pdf" keluar.json [--guru "JADWAL GURU.pdf"]
Perlu: pdfplumber.

Berbeda dengan tools/ekstrak-asc-pdf.py, alat ini:
- membaca ukuran huruf relatif terhadap angka kolom (berlaku untuk ekspor aSc, cetak "Microsoft Print to PDF", dan ukuran halaman lain);
- menentukan nomor jam per hari: bila kolom 1 hari itu berisi pelajaran (bukan P1/pembiasaan) di rombel mana pun, kolom 1 = jam 1
  (skema tanpa pembiasaan, mis. Selasa-Rabu skema 10 atau pekan TKA); selain itu kolom 1 = pembiasaan dan kolom 2 = jam 1;
- mengambil nama guru dari kartu jadwal kelas (bisa terpotong pada kartu sempit; dicocokkan di aplikasi), dan bila PDF Jadwal Guru
  diberikan dan terbaca, nama guru diambil dari sana untuk sel yang cocok;
- mencatat rombel bertanda PJJ dan jam/waktu pada baris judul kolom.
"""
import json
import re
import sys
from collections import defaultdict

import pdfplumber

HARI = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat']
BUKAN_PELAJARAN = {'PJJ', 'TKA'}
KOLOM = ['1', '2', '3', '4', 'B1', '5', '6', '7', 'B2', '8', '9', '10', '11']


def norm_kelas(s):
    m = re.match(r'^(XII|XI|X)\s*(AT|TE|DKV)\s*(\d)$', s.strip(), re.I)
    return f'{m.group(1).upper()} {m.group(2).upper()} {m.group(3)}' if m else None


def norm_kode_kelas(s):
    m = re.match(r'^(xii|xi|x)\.(at|te|dkv)(\d)$', s.strip().lower())
    return f'{m.group(1).upper()} {m.group(2).upper()} {m.group(3)}' if m else None


def kepala(kata):
    """Angka kolom (1..11) dan dua kata Break: posisi x tengah tiap kolom, ukuran angka, dan y baris kepala."""
    angka = [w for w in kata if re.fullmatch(r'\d{1,2}', w['text'])]
    # baris kepala = baris dengan angka 1..11 terbanyak berukuran sama
    per = defaultdict(list)
    for w in angka:
        per[(round(w['top']), round(w['size'], 1))].append(w)
    if not per:
        return None
    (top, size), ws = max(per.items(), key=lambda kv: len({w['text'] for w in kv[1]}))
    pusat = {w['text']: (w['x0'] + w['x1']) / 2 for w in ws if 1 <= int(w['text']) <= 11}
    brk = sorted([w for w in kata if w['text'] == 'Break' and abs(w['top'] - top) < size], key=lambda w: w['x0'])
    if len(pusat) < 11 or len(brk) < 2:
        return None
    kol = {k: pusat[k] for k in pusat}
    # pusat kata Break: kata Break + angka di kanannya
    for i, b in enumerate(brk[:2]):
        nomor = [w for w in kata if w['text'] == str(i + 1) and abs(w['top'] - b['top']) < 2 and w['x0'] > b['x1'] - 1 and w['x0'] < b['x1'] + size]
        x1 = nomor[0]['x1'] if nomor else b['x1']
        kol[f'B{i + 1}'] = (b['x0'] + x1) / 2
    return {'kol': kol, 'size': size, 'top': top}


def waktu_kolom(kata, kp):
    """Teks waktu (mis. 7:00 - 7:40) di bawah tiap angka kolom, bila ada."""
    hasil = {}
    ws = [w for w in kata if kp['top'] < w['top'] < kp['top'] + kp['size'] * 2.2 and re.fullmatch(r'\d{1,2}:\d{2}', w['text'])]
    for k, x in kp['kol'].items():
        dekat = sorted([w for w in ws if abs((w['x0'] + w['x1']) / 2 - x) < kp['size'] * 2.2], key=lambda w: w['x0'])
        if len(dekat) >= 2:
            hasil[k] = f"{dekat[0]['text']}-{dekat[-1]['text']}"
    return hasil


def baris_hari(p, kata, kp):
    """Rentang y tiap baris hari: dari label hari dan garis horizontal."""
    label = sorted([w for w in kata if w['text'] in HARI and w['size'] > kp['size']], key=lambda w: w['top'])
    hs = sorted({round(l['top'], 1) for l in p.lines if abs(l['top'] - l['bottom']) < 0.5 and l['top'] > kp['top'] + kp['size']})
    if not label:
        # tanpa label hari (PDF Jadwal Guru): lima baris pertama yang tingginya lebih dari 3x ukuran angka kolom
        baris = [b for b in zip(hs[:-1], hs[1:]) if b[1] - b[0] > 3 * kp['size']][:5]
        return [(i, a, b) for i, (a, b) in enumerate(baris)]
    hasil = []
    for w in label:
        cy = (w['top'] + w['bottom']) / 2
        atas = max([y for y in hs if y < cy - 2], default=None)
        bawah = min([y for y in hs if y > cy + 2], default=None)
        if atas is None or bawah is None:
            continue
        hasil.append((HARI.index(w['text']), atas, bawah))
    return hasil


def sel_hari(p, top, bot, x_kiri, x_kanan):
    vl = sorted({round(l['x0'], 1) for l in p.lines if abs(l['x0'] - l['x1']) < 0.5 and l['top'] <= top + 2 and l['bottom'] >= bot - 2})
    cb = sorted({x for x in vl if x_kiri - 2 <= x <= x_kanan + 2} | {x_kiri, x_kanan})
    return list(zip(cb[:-1], cb[1:]))


def baca_kelas(path):
    hasil = {}
    pjj = []
    info_waktu = None
    for p in pdfplumber.open(path).pages:
        kata = p.extract_words(extra_attrs=['size'])
        kp = kepala(kata)
        if not kp:
            continue
        H = kp['size']
        judul = [w for w in kata if w['top'] < kp['top'] and 1.15 * H < w['size'] < 1.45 * H]
        rombel = None
        baris_judul = defaultdict(list)
        for w in judul:
            baris_judul[round(w['top'] / 3)].append(w)
        for ws in baris_judul.values():
            ws = sorted(ws, key=lambda w: w['x0'])
            for i in range(len(ws) - 2):
                r = norm_kelas(' '.join(w['text'] for w in ws[i:i + 3]))
                if r:
                    rombel = r
                    break
            if rombel:
                break
        if not rombel:
            continue
        if any(w['text'] == 'PJJ' and w['top'] < kp['top'] for w in kata):
            pjj.append(rombel)
        if info_waktu is None:
            info_waktu = waktu_kolom(kata, kp)
        xs = sorted(kp['kol'].values())
        lebar = (xs[-1] - xs[0]) / (len(xs) - 1)
        x_kiri, x_kanan = xs[0] - lebar / 2, xs[-1] + lebar / 2
        kartu = []
        for hari, top, bot in baris_hari(p, kata, kp):
            ws = [w for w in kata if top <= (w['top'] + w['bottom']) / 2 < bot and x_kiri - 2 <= (w['x0'] + w['x1']) / 2 <= x_kanan + 2]
            for a, b in sel_hari(p, top, bot, x_kiri, x_kanan):
                dalam = [w for w in ws if a - 1 <= (w['x0'] + w['x1']) / 2 <= b + 1]
                besar = sorted([w for w in dalam if 0.85 * H <= w['size'] <= 1.05 * H], key=lambda w: (round(w['top']), w['x0']))
                if not besar:
                    continue
                ruang = [w['text'] for w in sorted([w for w in dalam if 0.70 * H <= w['size'] < 0.85 * H], key=lambda w: w['x0'])]
                kecil = sorted([w for w in dalam if 0.40 * H <= w['size'] < 0.65 * H and not norm_kode_kelas(w['text'])], key=lambda w: (round(w['top'] / 3), w['x0']))
                kol = [k for k, x in kp['kol'].items() if a < x < b]
                kol.sort(key=KOLOM.index)
                if not kol:
                    continue
                kartu.append({'hari': hari, 'kol': kol, 'mapel': ''.join(w['text'] for w in besar), 'guru': ' '.join(w['text'] for w in kecil).strip(), 'ruang': ruang[0] if ruang else ''})
        hasil[rombel] = kartu
    return hasil, pjj, info_waktu or {}


def baca_guru(path):
    """Opsional: (rombel, hari, kolom) -> nama guru lengkap dari PDF Jadwal Guru (judul halaman = nama guru)."""
    peta = {}
    try:
        pdf = pdfplumber.open(path)
    except Exception:
        return peta
    for p in pdf.pages:
        kata = p.extract_words(extra_attrs=['size'])
        kp = kepala(kata)
        if not kp:
            continue
        H = kp['size']
        atas = defaultdict(list)
        for w in kata:
            if w['top'] < kp['top'] - 2 and w['size'] > 1.1 * H:
                atas[round(w['top'])].append(w)
        baris_nama = [v for k, v in sorted(atas.items()) if not any(re.search(r'JADWAL|PELAJARAN', w['text']) for w in v)]
        nama = ' '.join(w['text'] for w in sorted(baris_nama[0], key=lambda w: w['x0'])).strip() if baris_nama else ''
        if not nama:
            continue
        xs = sorted(kp['kol'].values())
        lebar = (xs[-1] - xs[0]) / (len(xs) - 1)
        x_kiri, x_kanan = xs[0] - lebar / 2, xs[-1] + lebar / 2
        for hari, top, bot in baris_hari(p, kata, kp):
            ws = [w for w in kata if top <= (w['top'] + w['bottom']) / 2 < bot]
            for a, b in sel_hari(p, top, bot, x_kiri, x_kanan):
                for w in ws:
                    r = norm_kode_kelas(w['text'])
                    if not r or not (a - 1 <= (w['x0'] + w['x1']) / 2 <= b + 1):
                        continue
                    for k, x in kp['kol'].items():
                        if a < x < b:
                            peta[(r, hari, k)] = nama
    return peta


def main(argv):
    kelas_pdf, keluar = argv[0], argv[1]
    guru_pdf = argv[argv.index('--guru') + 1] if '--guru' in argv else None
    kelas, pjj, waktu = baca_kelas(kelas_pdf)
    guru = baca_guru(guru_pdf) if guru_pdf else {}
    # kolom 1 berisi pelajaran (bukan P1) pada hari itu -> kolom 1 = jam 1
    tanpa_pembiasaan = {h: any(k['hari'] == h and k['kol'][0] == '1' and k['mapel'] != 'P1' for ks in kelas.values() for k in ks) for h in range(5)}
    per = {}
    jam_maks = defaultdict(int)
    dari_guru = 0
    tidak_hadir = {}
    for rb, ks in kelas.items():
        baris = []
        # kartu PJJ/TKA sehari penuh = rombel tidak belajar di sekolah hari itu (belajar jarak jauh atau sedang TKA)
        hari_blok = sorted({k['hari'] for k in ks if k['mapel'] in BUKAN_PELAJARAN})
        if hari_blok:
            tidak_hadir[rb] = {str(h): sorted({k['mapel'] for k in ks if k['hari'] == h and k['mapel'] in BUKAN_PELAJARAN})[0] for h in hari_blok}
        for k in ks:
            if k['mapel'] == 'P1' or k['mapel'] in BUKAN_PELAJARAN:
                continue
            geser = 0 if tanpa_pembiasaan[k['hari']] else 1
            for c in k['kol']:
                if c.startswith('B'):
                    continue
                jam = int(c) - geser
                if jam < 1:
                    continue
                nama = guru.get((rb, k['hari'], c))
                if nama:
                    dari_guru += 1
                baris.append({'hari': k['hari'], 'jam': jam, 'guru': nama or k['guru'], 'mapel': k['mapel'], 'ruang': k['ruang']})
                jam_maks[k['hari']] = max(jam_maks[k['hari']], jam)
        per[rb] = sorted(baris, key=lambda x: (x['hari'], x['jam']))
    urut = {r: per[r] for r in sorted(per, key=lambda r: (['X', 'XI', 'XII'].index(r.split()[0]), r.split()[1], int(r.split()[2])))}
    hari_info = [{'pembiasaan': not tanpa_pembiasaan[h], 'jamKbm': jam_maks[h]} for h in range(5)]
    with open(keluar, 'w', encoding='utf-8') as f:
        json.dump({'sumber': kelas_pdf.split('/')[-1], 'hari': hari_info, 'waktuKolom': waktu, 'pjj': pjj, 'tidakHadir': tidak_hadir, 'rombel': urut}, f, ensure_ascii=False, indent=1)
    total = sum(len(v) for v in urut.values())
    print(f'{keluar}: {len(urut)} rombel, {total} JP, guru dari PDF guru: {dari_guru}; hari: {hari_info}; PJJ: {pjj}; tidak hadir: {tidak_hadir}')
    jp = defaultdict(list)
    for r, v in urut.items():
        jp[len(v)].append(r)
    print('  JP per rombel:', {k: len(v) for k, v in sorted(jp.items())})


if __name__ == '__main__':
    main(sys.argv[1:])
