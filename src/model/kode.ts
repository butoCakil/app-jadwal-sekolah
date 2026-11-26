/** Kode guru berikutnya: A..Z, lalu AA..ZZ (urutan: AA, AB, ..., AZ, BA, ...). */
export function kodeGuruKe(n: number): string {
  if (n < 26) return String.fromCharCode(65 + n);
  const m = n - 26;
  return String.fromCharCode(65 + (Math.floor(m / 26) % 26)) + String.fromCharCode(65 + (m % 26));
}

/** Kode guru pertama yang belum dipakai. */
export function kodeGuruBerikut(dipakai: string[]): string {
  const ada = new Set(dipakai.map((k) => k.toUpperCase()));
  for (let i = 0; i < 26 + 26 * 26; i++) {
    const k = kodeGuruKe(i);
    if (!ada.has(k)) return k;
  }
  return '';
}

/**
 * Usul kode mapel (maksimal 3 karakter) dari nama: inisial kata bila lebih dari satu kata
 * (Bahasa Indonesia -> BI), selain itu tiga huruf pertama (Matematika -> MAT).
 * Bila bentrok dengan kode yang ada, ditambah/diganti angka agar unik.
 */
export function usulKodeMapel(nama: string, dipakai: string[]): string {
  const ada = new Set(dipakai.map((k) => k.toUpperCase()));
  const kata = nama.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  const abaikan = new Set(['DAN', 'DI', 'KE', 'YANG', 'DARI']);
  const inti = kata.filter((k) => !abaikan.has(k.toUpperCase()));
  let dasar = inti.length > 1 ? inti.slice(0, 3).map((k) => k[0]).join('') : (inti[0] ?? 'MPL').slice(0, 3);
  dasar = dasar.toUpperCase();
  if (!ada.has(dasar)) return dasar;
  for (let i = 1; i < 100; i++) {
    const k = dasar.slice(0, i < 10 ? 2 : 1) + i;
    if (!ada.has(k)) return k;
  }
  return dasar;
}
