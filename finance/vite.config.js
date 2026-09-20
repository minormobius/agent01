import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// fin.mino.mobi — three apps built into one dist/ and served by worker.js.
//   index.html         -> financial periodic table (root)       [plain ES modules]
//   speclab/index.html -> speculative-feedback playground       [TS/TSX + React]
//   pm/index.html      -> personal-finance planning SPA (/pm)   [JS/JSX + React]
// public/ is copied verbatim to dist/ (stocks/, bogo/, lexicons/, universe.json).
// Inputs are relative to the project root (finance/), so no __dirname needed.
//
// The root app deliberately has no framework and no build-time dependency: it
// is a page, a stylesheet and four ES modules, one of which is the research
// dataset. Vite still fingerprints and minifies it, but `node ptable/*.mjs`
// works on the sources directly, which is what the selftest relies on.
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        speclab: "speclab/index.html",
        pm: "pm/index.html",
      },
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
