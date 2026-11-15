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
const here = path.dirname(fileURLToPath(import.meta.url)), root = path.join(here, "../.."), { chromium } = createRequire(import.meta.url)("playwright"), { PARTS } = await import(path.join(root, "cad4/js/parts.js"));
/* each rope: where the two cross-sections are cut, and what the reader should see in them */
export const ROPES = [
  ["hoop", 0, 0.5, "Seven rods in a sphere-hoop", "Cut through the hoop, the rods sit inside a sphere. Cut past it, they are seven balls: a fibre's cross-section is a ball, and six fit round one in a plane, twelve in space."],
  ["ringed", 0, 0.5, "The same in a ring: it does not hold", "A ring goes round the bundle in one plane only. The rods leave through the direction the ring does not cover."],
  ["hoserope", 0, 0.9, "Filaments in a hose", "Cut through the hose: a closed sphere, the filaments hidden inside. Cut past its end: thirteen filaments, one and the twelve round it. From the side, the hose is a sleeve."],
  ["rope", 0, 0.4, "Filaments in a woven sheath", "The sheath is hoops (spheres across the rope) woven with bands that run along it. Through a hoop, and between two.", 1.8],
  ["wound", 0, 0.7, "A wound sheath", "Three ribbons wound in three planes: three bands on the cross-section's sphere, here just wide enough to close it (narrower, they leave eight holes at the corners). Past the bands, the one rod that stands in for the bundle."],
  ["ribbonyarn", 0, 0.4, "Yarn on a ribbon", "The ribbon is a strip across the cross-section; each fibre is a ball beside it, and the balls have turned between one cut and the next. From the side it is a fibre twisted round a thread: the ribbon edge-on.", 2.6],
  ["cable", 0.6, 1.1, "A cable: thirteen ropes", "Cut where the ropes' hoses are: thirteen spheres. Cut past them: 169 filaments in thirteen bundles. From the side: jacket, hoses, filaments, each cut shorter than the last.", 1.8],
  ["hosebraid", 0, 0.5, "A plait of three hoses", "A hose's cross-section is a ring. Three rings, one inside or beside the next, and they have changed places between the two cuts: one ring has passed through another. From the side, each hose is cut twice and the two halves are ordinary plaits.", 1.2],
  ["ribbonbraid", 0, 0.5, "The same plait in ribbons: it does not hold", "A ribbon's cross-section is a strip with two ends. One strip slides along its length past the others' ends and is free."],
  ["maypole", 0, 0.5, "A maypole: six hoses braided on a hose", "The pole is a ring; six thinner rings sit round its wire, three going one way and three the other. Between the cuts they have moved round the pole's wire and through each other.", 1.2],
  ["ribbonpole", 0, 0.5, "Ribbons on a hose", "The pole is still a whole ring. The six that wrap it are arcs: each is hooked round the pole's wire and cannot leave it, but one arc can slide round past the ends of the others. From the side, the far cut of the pole is bare: the ribbons are on the near side only.", 1.2],
  ["tubeyarn", 0, 0.75, "A yarn of tubes", "Seven rings: one, and six round its wire. Between the cuts the six have turned about the one. This is our twisted yarn with every fibre a tube, and the twist cannot come out.", 1.2],
];
/* where the second side view is cut: a different z, to show what the first one cannot */
export const ZS = { hoop: 0.3, ringed: 0.3, hoserope: 0.35, rope: 0.35, wound: 0.3, ribbonyarn: 0.225, cable: 0.4, hosebraid: 0.7, ribbonbraid: 0.3, maypole: 0.75, ribbonpole: 0.75, tubeyarn: 0.75 };
const only = process.argv.slice(2), todo = ROPES.filter((r) => !only.length || only.includes(r[0])), types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };
const srv = http.createServer((q, r) => { let f = path.join(root, q.url.split("?")[0]); if (f.endsWith("/")) f += "index.html"; fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { "content-type": types[path.extname(f)] || "text/plain" }); r.end(d); }); }).listen(8847);
fs.mkdirSync(path.join(here, "fig"), { recursive: true });
const b = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] }), p = await b.newPage({ viewport: { width: 620, height: 620 }, deviceScaleFactor: 1.5 });
const X = [1, 0, 0, 0], Y = [0, 1, 0, 0], Z = [0, 0, 1, 0], W = [0, 0, 0, 1];
for (const [name, wa, wb, , , zx = 2.3] of todo) { await p.goto(`http://localhost:8847/cad4/#${name}`); await p.reload(); await p.waitForFunction(() => window.CAD4 && window.CAD4.frames > 0, null, { timeout: 60000 });
  /* nothing but the picture: the canvas alone, filling the window */
  await p.addStyleTag({ content: "* { visibility: hidden !important } #gl { visibility: visible !important; position: fixed !important; left: 0 !important; top: 0 !important; width: 100vw !important; height: 100vh !important; z-index: 99999 !important }" });
  for (const [tag, pose] of [["a", { E: [X, Y, Z, W], off: wa, yaw: -0.6, pitch: 0.5, zoom: zx, tint: 0 }], ["b", { E: [X, Y, Z, W], off: wb, yaw: -0.6, pitch: 0.5, zoom: zx, tint: 0 }], ["c", { E: [X, W, Y, Z], off: 0, yaw: -0.5, pitch: 0.25, zoom: 1.15, tint: 0 }], ["d", { E: [X, W, Y, Z], off: ZS[name], yaw: -0.5, pitch: 0.25, zoom: 1.15, tint: 0 }]]) {
    await p.evaluate((q) => { window.CAD4.pose(q); window.dispatchEvent(new Event("resize")); }, pose); const f0 = await p.evaluate(() => window.CAD4.frames); await p.waitForFunction((n) => window.CAD4.frames > n, f0, { timeout: 60000 }).catch(() => {}); await p.waitForTimeout(700);
    await p.screenshot({ path: path.join(here, "fig", `${name}-${tag}.png`) }); }
  console.error("drawn", name); }
await b.close(); srv.close();
execFileSync("python3", ["-c", "import sys,glob,os\nfrom PIL import Image\nfor f in glob.glob(os.path.join(sys.argv[1],'*.png')):\n    Image.open(f).convert('RGB').save(f[:-4]+'.webp', quality=82); os.remove(f)", path.join(here, "fig")]);
/* the page */
const PAL = ["#d6c7a8", "#6badfa", "#fab366", "#9ee08a", "#d199fa", "#f2e673"], esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Rope after the knot — figures</title><link rel="icon" href="data:,">
<style>:root{color-scheme:dark}body{margin:0;background:#07080c;color:#e9e4da;font:15px/1.5 system-ui,sans-serif}main{max-width:1280px;margin:0 auto;padding:20px 16px 60px}h1{font-size:20px;margin:0 0 4px}h2{font-size:16px;margin:34px 0 4px;color:#ffd27a}p{margin:6px 0;max-width:820px}.how{color:#9a958c}.row{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:10px}figure{margin:0}img{width:100%;height:auto;display:block;border-radius:10px;border:1px solid rgba(255,255,255,.1)}figcaption{font:12px ui-monospace,Menlo,monospace;color:#9a958c;margin-top:4px}.key{font:12px ui-monospace,Menlo,monospace;color:#9a958c;margin-top:6px}.key i{display:inline-block;width:10px;height:10px;border-radius:2px;margin:0 5px 0 12px;vertical-align:-1px}.key i:first-child{margin-left:0}a{color:#e9e4da}@media(max-width:800px){.row{grid-template-columns:repeat(2,1fr)}}</style></head><body><main>
<h1>Rope after the knot: the ropes, drawn</h1>
<p class="how">Every rope lies along w, the direction you cannot see in an ordinary view. Each is drawn four ways. <b>Two cross-sections</b>: the slice x, y, z at two places along the rope, which is what you would see looking at a cut end. <b>Two side views</b>: the slice x, y, w, with the rope running up the picture, cut at z = 0 and again at another z. The second side view shows what the first cannot: a ball-shaped fibre getting thinner off its middle, a hose's two walls drawing together, the next fibre along a ribbon. In a cross-section a thread is a ball, a ribbon is a strip, a tube is a ring and a hose or a hoop is a sphere. Drawn by <a href="../../cad4/">CAD⁴</a> from the same trees its tests measure; each heading opens the part there. Text: <a href="DRAFT.md">the draft</a>.</p>
${ROPES.map(([name, wa, wb, title, cap]) => { const T = PARTS[name]; return `<h2 id="${name}"><a href="../../cad4/#${name}">${esc(title)}</a></h2><p>${esc(cap)}</p><div class="key">${T.show.map((k, i) => `<i style="background:${PAL[i % PAL.length]}"></i>${esc(k)}`).join("")}</div>
<div class="row">${[["a", `cross-section at w = ${wa}`], ["b", `cross-section at w = ${wb}`], ["c", "side view at z = 0: x, y and w (w up)"], ["d", `side view at z = ${ZS[name]}`]].map(([t, c]) => `<figure><img src="fig/${name}-${t}.webp" alt="${esc(title)}, ${c}" loading="lazy" width="930" height="930"><figcaption>${c}</figcaption></figure>`).join("")}</div>`; }).join("\n")}
</main></body></html>`;
fs.writeFileSync(path.join(here, "figures.html"), html);
console.error("wrote figures.html and", todo.length * 4, "pictures");
