import { defineConfig, type Plugin } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { existsSync, readFileSync } from 'node:fs';

const BERKAS_TERBIT = 'data/terbit/jadwal.json';
/** Penanda versi build; halaman memeriksanya terhadap `versi.json` terbaru agar tidak terjebak cache lama. */
const ID_BUILD = Date.now().toString(36);

/** Menyajikan data terbit sebagai `terbit/jadwal.json` (dev dan hasil build), yang dibaca halaman publik. */
function terbit(): Plugin {
  return {
    name: 'terbit',
    configureServer(server) {
      server.middlewares.use('/terbit/jadwal.json', (_q, r) => {
        if (!existsSync(BERKAS_TERBIT)) {
          r.statusCode = 404;
          r.end();
          return;
        }
        r.setHeader('content-type', 'application/json');
        r.end(readFileSync(BERKAS_TERBIT));
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'versi.json', source: JSON.stringify({ id: ID_BUILD }) });
      if (existsSync(BERKAS_TERBIT)) this.emitFile({ type: 'asset', fileName: 'terbit/jadwal.json', source: readFileSync(BERKAS_TERBIT) });
    },
  };
}

// base './' supaya jalan di GitHub Pages (subpath /app-jadwal-sekolah/) maupun lokal
export default defineConfig({
  base: './',
  define: { __BUILD_ID__: JSON.stringify(ID_BUILD) },
  plugins: [tailwindcss(), terbit()],
  test: { environment: 'node', include: ['test/**/*.test.ts'] },
});
