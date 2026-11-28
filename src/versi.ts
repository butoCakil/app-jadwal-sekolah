// Pemeriksa versi: GitHub Pages menyimpan index.html di cache peramban beberapa menit, sehingga
// setelah pembaruan sebagian pengunjung masih melihat versi lama. Halaman membandingkan penanda
// build-nya dengan `versi.json` (selalu diminta ulang ke server) lalu memuat ulang bila berbeda.

declare const __BUILD_ID__: string | undefined;

export const idBuild: string = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev';
const KUNCI_COBA = 'jadwal-versi-dicoba';

/** Versi terbaru di server, atau null bila tidak bisa dibaca (mis. mode dev atau offline). */
export async function versiTerbaru(ambil: typeof fetch = fetch): Promise<string | null> {
  try {
    const r = await ambil(`./versi.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return null;
    const j = (await r.json()) as { id?: unknown };
    return typeof j.id === 'string' ? j.id : null;
  } catch {
    return null;
  }
}

/** Alamat yang memaksa peramban mengambil index.html baru (kunci cache berbeda), hash dipertahankan. */
export function alamatSegar(id: string, lokasi: Pick<Location, 'pathname' | 'hash'> = location): string {
  return `${lokasi.pathname}?v=${encodeURIComponent(id)}${lokasi.hash}`;
}

function spanduk(id: string): void {
  if (document.getElementById('spanduk-versi')) return;
  const el = document.createElement('div');
  el.id = 'spanduk-versi';
  el.className = 'fixed inset-x-0 bottom-0 z-[60] mx-auto flex max-w-3xl items-center gap-3 rounded-t-2xl bg-[#0d1e33] px-4 py-3 text-sm text-white shadow-2xl';
  el.innerHTML = '<span class="flex-1">Ada versi aplikasi yang lebih baru.</span><button class="rounded-xl bg-amber-400 px-3 py-1.5 font-semibold text-slate-900">Muat ulang</button>';
  el.querySelector('button')?.addEventListener('click', () => location.replace(alamatSegar(id)));
  document.body.appendChild(el);
}

/** Memeriksa versi; sekali otomatis memuat ulang, bila masih berbeda tampilkan tombol. */
export async function periksaVersi(): Promise<void> {
  if (idBuild === 'dev') return;
  const baru = await versiTerbaru();
  if (!baru || baru === idBuild) return;
  let dicoba: string | null = null;
  try {
    dicoba = sessionStorage.getItem(KUNCI_COBA);
    sessionStorage.setItem(KUNCI_COBA, baru);
  } catch {
    /* abaikan */
  }
  if (dicoba !== baru) location.replace(alamatSegar(baru));
  else spanduk(baru);
}

/** Periksa saat dibuka dan setiap kali halaman kembali terlihat (paling sering tiap 5 menit). */
export function awasiVersi(): void {
  void periksaVersi();
  let terakhir = Date.now();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || Date.now() - terakhir < 5 * 60_000) return;
    terakhir = Date.now();
    void periksaVersi();
  });
}
