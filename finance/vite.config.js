import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// fin.mino.mobi — two apps built into one dist/ and served by worker.js.
//   index.html      -> speculative-feedback playground (root)   [TS/TSX]
//   pm/index.html   -> personal-finance planning SPA (/pm)      [JS/JSX]
// public/ is copied verbatim to dist/ (stocks/, bogo/, lexicons/, universe.json).
// Inputs are relative to the project root (finance/), so no __dirname needed.
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        pm: "pm/index.html",
      },
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
