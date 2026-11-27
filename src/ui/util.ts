export function esc(s: string | number): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

/** Tanggal ISO lokal (bukan UTC) dari objek Date. */
export function isoLokal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Tanggal ISO Senin pada pekan yang memuat tanggal ini (Sabtu/Minggu dianggap pekan berikutnya). */
export function seninPekan(tanggal: string): string {
  const [y, m, d] = tanggal.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d));
  const h = (dt.getUTCDay() + 6) % 7; // 0 = Senin
  dt.setUTCDate(dt.getUTCDate() + (h > 4 ? 7 - h : -h));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

export function tambahHari(tanggal: string, n: number): string {
  const [y, m, d] = tanggal.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

export function unduh(nama: string, isi: string, tipe = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([isi], { type: tipe }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nama;
  a.click();
  URL.revokeObjectURL(url);
}

const HUE = [212, 152, 32, 282, 2, 176, 52, 322, 98, 242, 18, 196];
/** Warna pastel konsisten untuk tiap mapel (berdasar kode); 12 rona yang berjauhan. */
export function warnaMapel(kode: string): { bg: string; garis: string } {
  let h = 2166136261;
  for (const c of kode) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const hue = HUE[(h >>> 0) % HUE.length] as number;
  return { bg: `hsl(${hue} 78% 93%)`, garis: `hsl(${hue} 55% 40%)` };
}

export function opsi<T>(daftar: T[], terpilih: string, id: (t: T) => string, label: (t: T) => string, kosong?: string): string {
  const awal = kosong !== undefined ? `<option value="">${esc(kosong)}</option>` : '';
  return awal + daftar.map((t) => `<option value="${esc(id(t))}" ${id(t) === terpilih ? 'selected' : ''}>${esc(label(t))}</option>`).join('');
}

/** "B3, D1 ; d2" -> ["B3","D1","D2"] */
export function pecahKode(teks: string): string[] {
  return teks.split(/[,;\s]+/).map((x) => x.trim().toUpperCase()).filter(Boolean);
}

export const NAMA_BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
export function tanggalPendek(iso: string): string {
  const [, m, d] = iso.split('-').map(Number) as [number, number, number];
  return `${d} ${NAMA_BULAN[m - 1]}`;
}

/**
 * Menyimpan nilai centang pada baris master. Nilai yang sama dengan bawaan kolom dihapus (tidak disimpan), selain itu disimpan apa adanya,
 * jadi centang berbawaan "true" yang dihilangkan tersimpan sebagai `false` dan tidak kembali tercentang.
 */
export function simpanCek(baris: Record<string, unknown>, f: string, nilai: boolean, bawaan: boolean): void {
  if (nilai === bawaan) delete baris[f];
  else baris[f] = nilai;
}
