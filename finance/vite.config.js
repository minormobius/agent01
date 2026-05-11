import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// fin.mino.mobi — Cloudflare Pages SPA rooted in finance/
// Build: npm run build (outputs to dist/)
// Static passthrough: anything in public/ is copied to dist/ verbatim
//   - public/stocks/ — the existing daily-price app, untouched
//   - public/bogo/, public/lexicons/, public/universe.json — preserved root URLs
//   - public/_redirects — SPA fallback for unknown paths
export default defineConfig({
  plugins: [react()],
});
