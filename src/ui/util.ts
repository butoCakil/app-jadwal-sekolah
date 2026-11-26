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
