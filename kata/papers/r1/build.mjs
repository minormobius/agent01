#!/usr/bin/env node
/* R1's build: text.md → DRAFT.md and paper.html. text.md is the source: its {{tokens}} are filled from values.mjs
   (which reads the baked data), so DRAFT.md is the text with its numbers and paper.html the same as a page, with the
   five main figures in place and the reference list made from REFERENCES.md (only the sources cited, each with how
   far it was checked). Edit text.md only.
   node kata/papers/r1/build.mjs           write
   node kata/papers/r1/build.mjs --check   exit 1 if a token has no value or the files on disk are not what this gives */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { panel, LABEL, LIVE_CSS, LIVE_JS } from "./ropes.mjs";
import { fill } from "./values.mjs";
const here = path.dirname(fileURLToPath(import.meta.url)), CHECK = process.argv.includes("--check"), filled = fill(fs.readFileSync(path.join(here, "text.md"), "utf8")), md = filled.out, refsMd = fs.readFileSync(path.join(here, "REFERENCES.md"), "utf8");
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/* the five figures of the main text */
const rope = (n, title) => ({ title, name: n });
const FIG = {
  1: { groups: [rope("hoserope", "(a) Thirteen filaments in a closed hose"), rope("ringed", "(b) Seven rods in a ring")], cap: "A hose encloses a bundle and a ring does not. Every rope here lies along the fourth direction, w. A cross-section (the slice x, y, z at one place along the rope) shows what it is made of: a thread is a ball, a hose is a sphere, a ring is a ring. The side views (x, y, w, with the rope running up) show how the parts run. (a) Thirteen filaments in a closed hose. Cut through the hose, the filaments are hidden inside a sphere; cut past its end, they are thirteen balls. (b) The same kind of bundle in a ring. The ring surrounds the bundle in one plane only, and in the second side view, a little off z = 0, it is gone while the rods are still there: in the kernel a rod swept that way meets nothing." },
  2: { charts: [["twist-kept", "(a) Seven free fibres: turns kept at rest against turns given"], ["twist-walls", "(b) Thirteen fibres between a core and a wall: rest energy against whole turns given"]], cap: "Twist. (a) Seven fibres as bead chains, twisted, clamped, stretched 3% and relaxed (section 2.2), by the same code in three dimensions and in four. Ours keeps what it is given; the four-dimensional yarn keeps nothing of a whole turn. (b) Thirteen fibres confined between a core and a wall, three seeds at each point, for a wall that just touches the fibres and one that is loose. Even twists rest at the untwisted energy and odd twists at one higher value: one turn is kept and two are shed." },
  3: { stack: true, charts: [["bench-model", "(a) The model"], ["bench-curve", "(b) One pull of four ropes: force at the jaw against stretch"]], cap: "The tensile model. (a) Tracks of links between two jaws; each link has its own strength; neighbours are joined by friction that sticks, then slips at μ times the press. (b) A strand fails at its weakest link. A loose bundle fails in a cascade. In a hose a broken filament is gripped and carries load again a little way along, so the rope climbs higher. One sample of each." },
  4: { charts: [["bench-ropes", ""]], cap: "Strength per weight of every rope. The dot is the mean of 200 pulls and the bar the 5th to 95th percentile; the dashed line is a single continuous strand's mean. This is one setting of the model (96 sections, Weibull modulus 5); how the comparison with a strand moves with rope length and fibre scatter is in the second table of section 4." },
  5: { groups: [rope("hosebraid", "(a) Plait of three tubes"), rope("ribbonbraid", "(b) Plait of three ribbons")], cap: "A plait of tubes and a plait of ribbons. (a) A tube's cross-section is a ring. Three rings, which have changed places between the two cuts: one has passed through another. From the side each tube is cut twice, and the two halves are ordinary plaits that merge off z = 0. (b) A ribbon's cross-section is a strip with two ends. One strip slides along its length past the others' ends and is free." },
};
const figure = (n) => { const f = FIG[n]; let h = `<figure id="fig${n}">`;
  if (f.groups) for (const g of f.groups) h += `<div class="sub">${esc(g.title)}</div><div class="row4">${["a", "b", "c", "d"].map((t) => panel(g.name, t, esc(g.title) + ", " + LABEL(g.name)[t], LABEL(g.name)[t])).join("")}</div>`;
  if (f.charts) h += `<div class="${f.charts.length > 1 && !f.stack ? "row2" : "row1"}">${f.charts.map(([s, l]) => `<div><img class="chart" src="fig/${s}.svg" alt="${esc(l || f.cap)}">${l ? `<span>${esc(l)}</span>` : ""}</div>`).join("")}</div>`;
  return h + `<figcaption><b>Figure ${n}.</b> ${esc(f.cap)}${f.groups ? ' <span class="hint">Click a picture to make it live: drag to turn it, slide to move the cut.</span>' : ""}</figcaption></figure>`; };
/* the references the text cites: keys like A1, E8, and ranges like A1–A7 */
const REF = {}; for (const line of refsMd.split("\n")) { const c = line.split("|").map((x) => x.trim()); if (c.length >= 5 && /^[A-G]\d+$/.test(c[1])) REF[c[1]] = { src: c[2], bib: c[3], content: c[5] || "" }; }
const cited = new Set(); for (const m of md.matchAll(/\b([A-G])(\d+)(?:–\1?(\d+))?\b/g)) { const a = +m[2], b = m[3] ? +m[3] : a; for (let k = a; k <= b; k++) if (REF[m[1] + k]) cited.add(m[1] + k); }
const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/(^|[\s(])\*(.+?)\*(?=[\s).,;:]|$)/g, "$1<i>$2</i>").replace(/`(.+?)`/g, "<code>$1</code>").replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
  .replace(/\b([A-G]\d+)(–([A-G]?\d+))?\b/g, (m, a) => (REF[a] ? `<a class="cite" href="#ref-${a}">${m}</a>` : m)).replace(/\bfigure (\d)\b/g, '<a href="#fig$1">figure $1</a>');
const mdInline = (s) => inline(s).replace(/\*(.+?)\*/g, "<i>$1</i>");
/* a small markdown: headings, paragraphs, lists, tables, figure markers */
const out = [], L = md.split("\n"); let i = 0, title = "";
while (i < L.length) { const l = L[i];
  if (!l.trim()) { i++; continue; }
  const fm = l.match(/^\[\[fig:(\d)\]\]$/); if (fm) { out.push(figure(+fm[1])); i++; continue; }
  const hm = l.match(/^(#{1,3}) (.*)$/); if (hm) { if (hm[1].length === 1) title = hm[2]; const id = hm[2].toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); out.push(`<h${hm[1].length} id="${id}">${inline(hm[2])}</h${hm[1].length}>`); i++; continue; }
  if (l.startsWith("|")) { const rows = []; while (i < L.length && L[i].startsWith("|")) rows.push(L[i++].split("|").slice(1, -1).map((x) => x.trim())); out.push(`<div class="tw"><table><thead><tr>${rows[0].map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${rows.slice(2).map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`); continue; }
  if (/^- /.test(l)) { const items = []; while (i < L.length && (/^- /.test(L[i]) || /^  \S/.test(L[i]))) { if (/^- /.test(L[i])) items.push(L[i].slice(2)); else items[items.length - 1] += " " + L[i].trim(); i++; } out.push(`<ul>${items.map((x) => `<li>${inline(x)}</li>`).join("")}</ul>`); continue; }
  const para = []; while (i < L.length && L[i].trim() && !/^(#{1,3} |\||- |\[\[fig:)/.test(L[i])) para.push(L[i++]); out.push(`<p>${inline(para.join(" "))}</p>`); }
void mdInline;
const at = out.findIndex((h) => h.startsWith('<h2 id="supplement"'));
out.splice(at < 0 ? out.length : at, 0, '<h2 id="references">References</h2>');
/* the journal's page (the atoms paper's stylesheet, forked as paper.css): a sheet, a title block, an abstract, the body */
const iT = out.findIndex((h) => h.startsWith("<h1")), statusLine = out[iT + 1] && out[iT + 1].startsWith("<p><i>") ? out.splice(iT + 1, 1)[0] : "";
out[iT] = out[iT].replace("<h1", '<h1 class="p-title"') + `<div class="p-authors"><p>Claude · Astra · minor mobius</p></div><div class="p-affils"><p><a href="https://kata.mino.mobi">kata.mino.mobi</a></p></div><p class="p-meta">Paper 2 of the mino.mobi journal (paper 1: <a href="https://four.mino.mobi/papers/p1/draft/paper">the atoms of four dimensions</a>). Every number is recomputed from the code and its data on each build. ${statusLine.replace(/^<p>|<\/p>$/g, "")}</p><hr class="p-rule">`;
const iA = out.findIndex((h) => h.startsWith('<h2 id="abstract"')); if (iA >= 0) { let j = iA + 1; while (j < out.length && !out[j].startsWith("<h2")) j++; out.splice(iA, j - iA, `<div class="p-abstract"><span class="lbl">Abstract</span>${out.slice(iA + 1, j).join("")}</div><hr class="p-rule">`); }
const iR = out.findIndex((h) => h.startsWith('<h2 id="references"')); if (iR >= 0) out[iR] = `<div class="p-refs"><h2 id="references">References</h2>${[...cited].sort((a, b) => a[0].localeCompare(b[0]) || +a.slice(1) - +b.slice(1)).map((k) => `<div class="refitem" id="ref-${k}"><span class="rn">[${k}]</span> ${inline(REF[k].src)} <span class="xf">${inline(REF[k].bib)}${REF[k].content ? "; content: " + inline(REF[k].content) : ""}</span></div>`).join("")}</div><p class="p-source">In each reference's tag: how far the citation, and then the claim relied on, was checked. The full list, with what each source is used for, is supplement C.</p>`;
const body = out.join("\n").replace(/<div class="tw"><table>/g, '<div class="table-fig"><table class="booktabs">').replace(/<figure id=/g, '<figure class="fig wide" id=');
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title><link rel="icon" href="data:,">
<meta name="description" content="Knots untie in four dimensions, but rope does not go with them: what holds, how it was tested, and what each rope is worth. Paper 2 of the mino.mobi journal.">
<meta property="og:title" content="${esc(title)}"><meta property="og:url" content="https://kata.mino.mobi/papers/r1/paper"><meta property="og:image" content="https://kata.mino.mobi/papers/r1/og.png"><meta name="twitter:card" content="summary_large_image">
<link rel="stylesheet" href="paper.css"><style>${LIVE_CSS}</style></head><body>
<div class="toolbar"><span class="brand"><a href="../../">kata</a></span><span>paper 2 · rope after the knot</span><span class="grow" style="flex:1"></span><a href="figures.html">supplement A: ropes</a><a href="results.html">supplement B: methods and results</a><a href="paper.pdf">PDF</a><a href="paper-journal.pdf">two-column PDF</a><a href="text.md">source</a></div>
<article class="sheet"><div class="p-venue">kata.mino.mobi · paper 2 · draft, not audited</div><div class="p-body single">
${body}
</div></article><script>${LIVE_JS}</script></body></html>`;
if (filled.missing.length) { console.error("no value for: " + filled.missing.join(", ")); process.exit(1); }
if (CHECK) { const same = (f, v) => fs.existsSync(path.join(here, f)) && fs.readFileSync(path.join(here, f), "utf8") === v, stale = [["DRAFT.md", md], ["paper.html", html]].filter(([f, v]) => !same(f, v)).map((q) => q[0]); if (stale.length) { console.error("stale (run build.mjs): " + stale.join(", ")); process.exit(1); } console.error("DRAFT.md and paper.html are what text.md and the data give"); process.exit(0); }
fs.writeFileSync(path.join(here, "DRAFT.md"), md);
fs.writeFileSync(path.join(here, "paper.html"), html); console.error(`wrote paper.html: ${out.length} blocks, ${cited.size} references cited (${[...cited].sort().join(" ")})`);
