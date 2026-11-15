#!/usr/bin/env node
/* R1's build: DRAFT.md → paper.html, one page with the five main figures in place and the reference list made
   from REFERENCES.md (only the sources the text cites, each with how far it was checked). The text is the source:
   edit DRAFT.md, never paper.html.   node kata/papers/r1/build.mjs   (< 1 s) */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url)), md = fs.readFileSync(path.join(here, "DRAFT.md"), "utf8"), refsMd = fs.readFileSync(path.join(here, "REFERENCES.md"), "utf8");
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/* the five figures of the main text */
const rope = (n, title) => ({ title, panels: [["a", "cross-section"], ["b", "cross-section further along"], ["c", "side view, z = 0"], ["d", "side view, another z"]].map(([t, l]) => ({ src: `fig/${n}-${t}.webp`, label: l })) });
const FIG = {
  1: { groups: [rope("hoserope", "(a) Filaments in a hose: it holds"), rope("ringed", "(b) The same bundle in a ring: it does not")], cap: "The rule, and the rope. Every rope here lies along the fourth direction, w. A cross-section (the slice x, y, z at one place along the rope) shows what it is made of: a thread is a ball, a hose is a sphere, a ring is a ring. The side views (x, y, w, with the rope running up) show how the parts run. (a) Thirteen filaments in a closed hose. Cut through the hose, the filaments are hidden inside a sphere; cut past its end, they are thirteen balls. (b) The same kind of bundle in a ring. The ring surrounds the bundle in one plane only, and in the second side view, a little off z = 0, it is gone while the rods are still there: they leave that way." },
  2: { charts: [["twist-trace", "(a) Two turns given: turns still wound as the yarn relaxes"], ["twist-kept", "(b) Turns kept at rest against turns given"]], cap: "Twist, by the same code in three dimensions and in four. Seven fibres as bead chains, twisted, clamped, stretched 3% and relaxed (section 2.2). In three dimensions the yarn keeps what it is given. In four it keeps nothing of a whole turn. A half turn stays in both: it cannot be undone with the ends clamped." },
  3: { stack: true, charts: [["bench-model", "(a) The model"], ["bench-curve", "(b) One pull of four ropes: force at the jaw against stretch"]], cap: "The bench. (a) Tracks of links between two jaws; each link has its own strength; neighbours are joined by friction that sticks, then slips at μ times the press. (b) A strand fails at its weakest link. A loose bundle fails in a cascade. In a hose a broken filament is gripped and carries load again a little way along, so the rope climbs higher." },
  4: { charts: [["bench-ropes", ""]], cap: "Every rope, per weight. The dot is the mean of 200 pulls and the bar the 5th to 95th percentile; the dashed line is a single continuous strand's mean. Filaments in a hose are the only rope whose mean beats a strand's, and their whole range lies above a strand's 5th percentile." },
  5: { groups: [rope("hosebraid", "(a) A plait of three hoses: it holds"), rope("ribbonbraid", "(b) The same plait in ribbons: it does not")], cap: "What braids. (a) A hose's cross-section is a ring. Three rings, which have changed places between the two cuts: one has passed through another. From the side each hose is cut twice, and the two halves are ordinary plaits that merge off z = 0. (b) A ribbon's cross-section is a strip with two ends. One strip slides along its length past the others' ends and is free." },
};
const figure = (n) => { const f = FIG[n]; let h = `<figure id="fig${n}">`;
  if (f.groups) for (const g of f.groups) h += `<div class="sub">${esc(g.title)}</div><div class="row4">${g.panels.map((p) => `<div><img src="${p.src}" alt="${esc(g.title)}, ${p.label}" loading="lazy"><span>${p.label}</span></div>`).join("")}</div>`;
  if (f.charts) h += `<div class="${f.charts.length > 1 && !f.stack ? "row2" : "row1"}">${f.charts.map(([s, l]) => `<div><img class="chart" src="fig/${s}.svg" alt="${esc(l || f.cap)}">${l ? `<span>${esc(l)}</span>` : ""}</div>`).join("")}</div>`;
  return h + `<figcaption><b>Figure ${n}.</b> ${esc(f.cap)}</figcaption></figure>`; };
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
const refList = [...cited].sort((a, b) => a[0].localeCompare(b[0]) || +a.slice(1) - +b.slice(1)).map((k) => `<li id="ref-${k}"><b>${k}.</b> ${inline(REF[k].src)} <span class="st">[${inline(REF[k].bib)}${REF[k].content ? "; content: " + inline(REF[k].content) : ""}]</span></li>`).join("");
const at = out.findIndex((h) => h.startsWith('<h2 id="supplement"')), refs = `<h2 id="references">References</h2><p class="st">Only what the text cites. In brackets: how far the citation, and then the claim we lean on, was checked. The full list with what each is used for is supplement C.</p><ol class="refs">${refList}</ol>`;
out.splice(at < 0 ? out.length : at, 0, refs);
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title><link rel="icon" href="data:,">
<meta name="description" content="A draft paper: knots untie in four dimensions, but rope does not go with them. What holds, how it was tested, and what each rope is worth.">
<style>body{margin:0;background:#fff;color:#1c1c1c;font:17px/1.6 Georgia,'Times New Roman',serif}main{max-width:780px;margin:0 auto;padding:28px 18px 80px}h1{font:700 30px/1.2 Georgia,serif;margin:0 0 8px}h2{font:700 21px/1.3 Georgia,serif;margin:38px 0 8px}h3{font:700 17px/1.3 Georgia,serif;margin:26px 0 6px}p{margin:10px 0}ul{padding-left:22px}li{margin:6px 0}code{font:14px ui-monospace,Menlo,monospace;background:#f3f3f3;padding:1px 4px;border-radius:3px}a{color:#0b5cad}a.cite{text-decoration:none}
.tw{overflow-x:auto;margin:14px 0}table{border-collapse:collapse;font:14px/1.4 system-ui,sans-serif;width:100%}th,td{text-align:left;padding:6px 9px;border-bottom:1px solid #ddd;vertical-align:top}th{border-bottom:2px solid #999}
figure{margin:26px -40px;padding:0}@media(max-width:880px){figure{margin:26px 0}}.sub{font:600 14px system-ui,sans-serif;margin:12px 0 6px}.row4{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}.row2{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}.row1{display:block}.row1>div{margin-bottom:12px}@media(max-width:640px){.row4{grid-template-columns:repeat(2,1fr)}.row2{grid-template-columns:1fr}}
figure img{width:100%;height:auto;display:block;border-radius:6px}figure img.chart{border:1px solid #e3e3e3}figure span{display:block;font:12px system-ui,sans-serif;color:#555;margin-top:3px}figcaption{font:14px/1.5 system-ui,sans-serif;color:#333;margin-top:10px}
.refs{font:14px/1.5 system-ui,sans-serif;padding-left:0;list-style:none}.refs li{margin:8px 0}.st{color:#666;font:13px/1.5 system-ui,sans-serif}</style></head><body><main>
${out.join("\n")}
</main></body></html>`;
fs.writeFileSync(path.join(here, "paper.html"), html); console.error(`wrote paper.html: ${out.length} blocks, ${cited.size} references cited (${[...cited].sort().join(" ")})`);
