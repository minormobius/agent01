import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
    rollupOptions: {
      // Multi-page: the React app at / and the standalone /dm sender. Listing
      // both keeps the default index.html entry once a custom input is set.
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        dm: fileURLToPath(new URL('./dm/index.html', import.meta.url)),
      },
    },
  },
  server: {
    port: 5177,
  },
});
