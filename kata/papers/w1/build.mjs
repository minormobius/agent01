#!/usr/bin/env node
/* W1's build: text.md → DRAFT.md and paper.html; audit.src.md → AUDIT.md. {{tokens}} are filled from values.mjs (which reads wire4's data),
   [[fig:N]] markers become the figures (charts.mjs makes the SVGs). Edit text.md only.
   node kata/papers/w1/build.mjs           write
   node kata/papers/w1/build.mjs --check   exit 1 if a token has no value or the files on disk are not what this gives
   The page uses the rope paper's stylesheet (../r1/paper.css: same site). */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fill } from "./values.mjs";
const here = path.dirname(fileURLToPath(import.meta.url)), CHECK = process.argv.includes("--check");
const FIG = {
  1: { imgs: [["growth-beta", "(a) Growth rate against the wavenumber along the wire at Re 200"], ["growth-re", "(b) Growth rate of the fastest mode against Reynolds number"]], cap: "The instability along the wire. (a) At Re 200 the symmetric mode (m = 0) is stable at β = 0, which is the sphere, and unstable in a band round β = 2.5; the one-lobed mode is stable throughout. (b) The symmetric mode crosses zero at 191 and the one-lobed mode at 207; a sphere's first instability is at 212." },
  2: { imgs: [["nusselt", ""]], cap: "Heat loss against flow. The sphere's Nusselt number, which is the 4D wire's per length, computed here; published sphere simulations; the wire in the tube, on the pipe's axis; and a cylinder's measured law, which is the 4D ribbon's per area. The sphere's starts from 2 and the cylinder's from nothing." },
  3: { imgs: [["calibration", ""]], cap: "The reading (current squared at constant wire temperature) over its value at Re 0.25, for a metal wire (Λ = 3000) 10 and 200 diameters long across a 4D pipe, with the sphere's and the cylinder's heat loss alone for comparison. The short wire is flat because the wall takes its heat; the long wire is shallow because of the conduction floor." },
};
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/(^|[\s(])\*(.+?)\*(?=[\s).,;:]|$)/g, "$1<i>$2</i>").replace(/`(.+?)`/g, "<code>$1</code>").replace(/\[([A-Za-z]{1,3}\d?)\]/g, '<a class="cite" href="#ref-$1">[$1]</a>').replace(/\bfigure (\d)\b/g, '<a href="#fig$1">figure $1</a>');
function build() { const filled = fill(fs.readFileSync(path.join(here, "text.md"), "utf8")), md = filled.out, out = [], L = md.split("\n"); let i = 0, title = "", inRefs = false;
  const figure = (n) => { const f = FIG[n]; return `<figure class="fig wide" id="fig${n}"><div class="${f.imgs.length > 1 ? "row2" : "row1"}">${f.imgs.map(([s, l]) => `<div><img class="chart" src="fig/${s}.svg" alt="${esc(l || f.cap)}">${l ? `<span>${esc(l)}</span>` : ""}</div>`).join("")}</div><figcaption><b>Figure ${n}.</b> ${esc(f.cap)}</figcaption></figure>`; };
  while (i < L.length) { const l = L[i];
    if (!l.trim()) { i++; continue; }
    const fm = l.match(/^\[\[fig:(\d)\]\]$/); if (fm) { out.push(figure(+fm[1])); i++; continue; }
    const hm = l.match(/^(#{1,3}) (.*)$/); if (hm) { if (hm[1].length === 1) title = hm[2]; inRefs = hm[2] === "References"; const id = hm[2].toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); out.push(`<h${hm[1].length} id="${id}">${inline(hm[2])}</h${hm[1].length}>`); i++; continue; }
    if (l.startsWith("|")) { const rows = []; while (i < L.length && L[i].startsWith("|")) rows.push(L[i++].split("|").slice(1, -1).map((x) => x.trim())); out.push(`<div class="table-fig"><table class="booktabs"><thead><tr>${rows[0].map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${rows.slice(2).map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`); continue; }
    if (/^- /.test(l)) { const items = []; while (i < L.length && (/^- /.test(L[i]) || /^  \S/.test(L[i]))) { if (/^- /.test(L[i])) items.push(L[i].slice(2)); else items[items.length - 1] += " " + L[i].trim(); i++; }
      out.push(inRefs ? `<div class="p-refs"><ol style="list-style:none;padding-left:0">${items.map((t) => { const k = t.match(/^\[([A-Za-z0-9]+)\]/); return `<li id="ref-${k ? k[1] : ""}">${inline(t).replace(/<a class="cite"[^>]*>(\[[^\]]+\])<\/a>/, "$1")}</li>`; }).join("")}</ol></div>` : `<ul>${items.map((t) => `<li>${inline(t)}</li>`).join("")}</ul>`); continue; }
    const para = []; while (i < L.length && L[i].trim() && !/^(#{1,3} |\||- |\[\[fig:)/.test(L[i])) para.push(L[i++]); const t = para.join(" "); out.push(/^Λ θ″/.test(t) ? `<p style="text-align:center"><i>${inline(t)}</i></p>` : `<p>${inline(t)}</p>`); }
  const iT = out.findIndex((h) => h.startsWith("<h1")), status = out[iT + 1] && out[iT + 1].startsWith("<p><i>") ? out.splice(iT + 1, 1)[0] : "";
  out[iT] = out[iT].replace("<h1", '<h1 class="p-title"') + `<div class="p-authors"><p>Claude · minor mobius</p></div><div class="p-affils"><p><a href="https://kata.mino.mobi">kata.mino.mobi</a></p></div><p class="p-meta">Paper 3 of the mino.mobi journal (paper 2: <a href="../r1/paper.html">rope after the knot</a>). Every computed number is filled from the code's data on each build. ${status.replace(/^<p>|<\/p>$/g, "")}</p><hr class="p-rule">`;
  const iA = out.findIndex((h) => h.startsWith('<h2 id="abstract"')); if (iA >= 0) { let j = iA + 1; while (j < out.length && !out[j].startsWith("<h2")) j++; out.splice(iA, j - iA, `<div class="p-abstract"><span class="lbl">Abstract</span>${out.slice(iA + 1, j).join("")}</div>`); }
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title><link rel="icon" href="data:,">
<meta name="description" content="A hot-wire anemometer in a four-dimensional pipe: the wire's wake ripples along the wire before a sphere's wake is unstable at all, the wire is a blunt instrument because a sphere has a conduction floor, and the ribbon is the instrument. Paper 3 of the mino.mobi journal; draft, not audited.">
<meta property="og:title" content="${esc(title)}"><meta property="og:url" content="https://kata.mino.mobi/papers/w1/paper">
<link rel="stylesheet" href="../r1/paper.css"></head><body>
<div class="toolbar"><span class="brand"><a href="../../">kata</a></span><span>paper 3 · a hot wire in four dimensions</span><span class="grow" style="flex:1"></span><a href="../../wire4/">the instrument, live</a><a href="AUDIT.md">audit sheet</a><a href="REFERENCES.md">references checked</a><a href="text.md">source</a></div>
<article class="sheet"><div class="p-venue">kata.mino.mobi · paper 3 · draft, not audited</div><div class="p-body single">
${out.join("\n")}
</div></article></body></html>`;
  return { md, html, missing: filled.missing, blocks: out.length }; }
const b = build();
if (b.missing.length) { console.error("no value for: " + b.missing.join(", ")); process.exit(1); }
const au = fill(fs.readFileSync(path.join(here, "audit.src.md"), "utf8")); if (au.missing.length) { console.error("audit sheet: no value for " + au.missing.join(", ")); process.exit(1); }
const files = [["DRAFT.md", b.md], ["paper.html", b.html], ["AUDIT.md", au.out]];
if (CHECK) { const stale = files.filter(([f, v]) => !fs.existsSync(path.join(here, f)) || fs.readFileSync(path.join(here, f), "utf8") !== v).map(([f]) => f); if (stale.length) { console.error("stale: " + stale.join(", ") + " (run node kata/papers/w1/build.mjs)"); process.exit(1); } console.error("current"); }
else { for (const [f, v] of files) fs.writeFileSync(path.join(here, f), v); console.error(`wrote DRAFT.md, paper.html and AUDIT.md: ${b.blocks} blocks`); }
