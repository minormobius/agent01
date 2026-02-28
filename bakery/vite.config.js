import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// bakery.minomobi.com — Cloudflare Pages project rooted in bakery/
export default defineConfig({
  plugins: [react()],
});
