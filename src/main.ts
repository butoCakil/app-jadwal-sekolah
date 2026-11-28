import './style.css';
import { awasiVersi } from './versi';

// Halaman publik di alamat utama; admin di `#/admin`. Pindah antar keduanya memuat ulang halaman.
const admin = location.hash.startsWith('#/admin');
const akar = document.getElementById('app') as HTMLElement;
window.addEventListener('hashchange', () => {
  if (location.hash.startsWith('#/admin') !== admin) location.reload();
});
if (admin) void import('./ui/app').then((m) => m.mulaiApp(akar));
else void import('./publik/halaman').then((m) => m.mulaiPublik(akar));
awasiVersi();
