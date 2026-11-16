#!/usr/bin/env node
/* R1's figures: every rope drawn three ways by CAD⁴ itself, headless. Two cross-sections (the slice x, y, z at two
   places along the rope, which lies along w) and two side views (the slice x, y, w at z = 0 and at another z). Writes
   fig/<rope>-{a,b,c,d}.webp
   and figures.html. Needs Playwright's Chromium and Python's PIL (to turn the PNGs into WebP).
   NODE_PATH=$(npm root -g) node kata/papers/r1/figures.mjs [rope …] */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { ROPES, ZS, poses, LABEL, panel, LIVE_CSS, LIVE_JS } from "./ropes.mjs";
const here = path.dirname(fileURLToPath(import.meta.url)), root = path.join(here, "../.."), { chromium } = createRequire(import.meta.url)("playwright"), { PARTS } = await import(path.join(root, "cad4/js/parts.js"));
const only = process.argv.slice(2), todo = ROPES.filter((r) => !only.length || only.includes(r[0])), types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };
const srv = http.createServer((q, r) => { let f = path.join(root, q.url.split("?")[0]); if (f.endsWith("/")) f += "index.html"; fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { "content-type": types[path.extname(f)] || "text/plain" }); r.end(d); }); }).listen(8847);
fs.mkdirSync(path.join(here, "fig"), { recursive: true });
const b = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] }), p = await b.newPage({ viewport: { width: 620, height: 620 }, deviceScaleFactor: 1.5 });
for (const [name] of todo) { await p.goto(`http://localhost:8847/cad4/#${name}`); await p.reload(); await p.waitForFunction(() => window.CAD4 && window.CAD4.frames > 0, null, { timeout: 60000 });
  /* nothing but the picture: the canvas alone, filling the window */
  await p.addStyleTag({ content: "* { visibility: hidden !important } #gl { visibility: visible !important; position: fixed !important; left: 0 !important; top: 0 !important; width: 100vw !important; height: 100vh !important; z-index: 99999 !important }" });
  for (const [tag, pose] of Object.entries(poses(name))) {
    await p.evaluate((q) => { window.CAD4.pose(q); window.dispatchEvent(new Event("resize")); }, pose); const f0 = await p.evaluate(() => window.CAD4.frames); await p.waitForFunction((n) => window.CAD4.frames > n, f0, { timeout: 60000 }).catch(() => {}); await p.waitForTimeout(700);
    await p.screenshot({ path: path.join(here, "fig", `${name}-${tag}.png`) }); }
  console.error("drawn", name); }
await b.close(); srv.close();
execFileSync("python3", ["-c", "import sys,glob,os\nfrom PIL import Image\nfor f in glob.glob(os.path.join(sys.argv[1],'*.png')):\n    Image.open(f).convert('RGB').save(f[:-4]+'.webp', quality=82); os.remove(f)", path.join(here, "fig")]);
/* the page */
const PAL = ["#d6c7a8", "#6badfa", "#fab366", "#9ee08a", "#d199fa", "#f2e673"], esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Rope after the knot — figures</title><link rel="icon" href="data:,">
<style>:root{color-scheme:dark}body{margin:0;background:#07080c;color:#e9e4da;font:15px/1.5 system-ui,sans-serif}main{max-width:1280px;margin:0 auto;padding:20px 16px 60px}h1{font-size:20px;margin:0 0 4px}h2{font-size:16px;margin:34px 0 4px;color:#ffd27a}p{margin:6px 0;max-width:820px}.how{color:#9a958c}.row{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:10px}img{width:100%;height:auto;display:block;border-radius:10px;border:1px solid rgba(255,255,255,.1)}.pan span{display:block;font:12px ui-monospace,Menlo,monospace;color:#9a958c;margin-top:4px}${LIVE_CSS}.key{font:12px ui-monospace,Menlo,monospace;color:#9a958c;margin-top:6px}.key i{display:inline-block;width:10px;height:10px;border-radius:2px;margin:0 5px 0 12px;vertical-align:-1px}.key i:first-child{margin-left:0}a{color:#e9e4da}@media(max-width:800px){.row{grid-template-columns:repeat(2,1fr)}}</style></head><body><main>
<h1>Supplement A. Rope drawings</h1>
<p class="how">Every rope lies along w, the direction you cannot see in an ordinary view. Each is drawn four ways. <b>Two cross-sections</b>: the slice x, y, z at two places along the rope, which is what you would see looking at a cut end. <b>Two side views</b>: the slice x, y, w, with the rope running up the picture, cut at z = 0 and again at another z. The second side view shows what the first cannot: a ball-shaped fibre getting thinner off its middle, a hose's two walls drawing together, the next fibre along a ribbon. In a cross-section a thread is a ball, a ribbon is a strip, a tube is a ring and a hose or a hoop is a sphere. Drawn by <a href="../../cad4/">CAD⁴</a> from the same trees its tests measure; each heading opens the part there. <b>Click any picture to make it live</b>: drag to turn it, and use the slider to move the cut. Text: <a href="paper.html">the paper</a>.</p>
${ROPES.map(([name, wa, wb, title, cap]) => { const T = PARTS[name]; return `<h2 id="${name}"><a href="../../cad4/#${name}">${esc(title)}</a></h2><p>${esc(cap)}</p><div class="key">${T.show.map((k, i) => `<i style="background:${PAL[i % PAL.length]}"></i>${esc(k)}`).join("")}</div>
<div class="row">${["a", "b", "c", "d"].map((t) => panel(name, t, esc(title) + ", " + LABEL(name)[t], LABEL(name)[t])).join("")}</div>`; }).join("\n")}
</main><script>${LIVE_JS}</script></body></html>`;
fs.writeFileSync(path.join(here, "figures.html"), html);
console.error("wrote figures.html and", todo.length * 4, "pictures");
