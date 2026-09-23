import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// fin.mino.mobi — four pages built into one dist/ and served by worker.js.
//   index.html          -> the surface index (root)              [static HTML]
//   elements/index.html -> financial periodic table (/elements)  [plain ES modules]
//   speclab/index.html  -> speculative-feedback playground       [TS/TSX + React]
//   pm/index.html       -> personal-finance planning SPA (/pm)   [JS/JSX + React]
// public/ is copied verbatim to dist/ (stocks/, bogo/, agimet/, lexicons/,
// universe.json). Inputs are relative to the project root (finance/), so no
// __dirname needed.
//
// The root is a plain index, by house convention: the top level of a surface
// lists everything under it rather than being one of the apps. It was briefly
// the periodic table, which buried five other sites.
//
// The table deliberately has no framework and no build-time dependency: it is
// a page, a stylesheet and four ES modules, one of which is the research
// dataset. Vite still fingerprints and minifies it, but `node ptable/*.mjs`
// works on the sources directly, which is what the selftest relies on.
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        elements: "elements/index.html",
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
