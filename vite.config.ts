import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

// base './' supaya jalan di GitHub Pages (subpath /app-jadwal-sekolah/) maupun lokal
export default defineConfig({
  base: './',
  plugins: [tailwindcss()],
  test: { environment: 'node', include: ['test/**/*.test.ts'] },
});
