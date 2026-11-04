/* The process page: renders paper 1's process.json (hand-kept: stages, checklist, journal), ledger.json (generated
   from the bake: the claims recomputed, the data files' hashes) and refs.json. Only draws; nothing here holds a number. */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const chip = (s, label = s) => `<span class="chip ${esc(s.replace(/\s+/g, "-"))}">${esc(label)}</span>`;
const get = (f) => fetch(`p1/${f}`, { cache: "no-cache" }).then((r) => { if (!r.ok) throw new Error(`${f}: ${r.status}`); return r.json(); });

Promise.all([get("process.json"), get("ledger.json"), get("refs.json"), get("figures/captions.json")]).then(([P, L, R, CAP]) => {
  const p = P.paper;
  $("paper").innerHTML = `<p style="margin:14px 0 4px"><b>Paper 1</b> · <i>${esc(p.title)}</i></p>` +
    `<div class="byline">${P.authors.map((a) => `<div><b>${esc(a.name)}</b>${a.affiliation ? `<span>${esc(a.affiliation)} · </span>` : ""}<span>${esc(a.role)}</span>${a.note ? `<br><span>(${esc(a.note)})</span>` : ""}</div>`).join("")}</div>` +
    `<p class="note">${esc(P.authorship_note)}</p><p class="note">Status: ${esc(p.status)}. Started ${esc(p.started)}. The bar: ${esc(p.bar)}</p>`;

  $("flow").innerHTML = P.pipeline.map((s) => `<div class="node ${esc(s.status.replace(/\s+/g, "-"))}"><h4><span class="t">${esc(s.name)}</span>${chip(s.status)}</h4><p>${esc(s.what)}</p>${s.path ? `<code>${esc(s.path)}</code>` : ""}${s.note ? `<p class="note">${esc(s.note)}</p>` : ""}</div>`).join("");

  const held = L.claims.filter((c) => c.holds).length;
  $("ledgerNote").innerHTML = `${held} of ${L.claims.length} hold as of the last build. Each value below was recomputed from the baked table by <code>build.mjs</code>; selftest 67 fails the build if any stops holding. Under each: the paper's section, and the selftest blocks that check the claim.`;
  const PARTS = { law: "Part I · the law", table: "Part II · the table", consequence: "Part III · what the law does" };
  $("claims").innerHTML = Object.entries(PARTS).map(([k, title]) => [k, title, L.claims.filter((c) => (c.part ?? "table") === k)]).filter(([, , cs]) => cs.length).map(([, title, cs]) => `<h4 class="part">${esc(title)}</h4>` + cs.map((c) => `<div class="claim ${c.holds ? "" : "no"}"><div class="c">${chip(c.holds ? "holds" : "broken")} ${esc(c.claim)}</div><div class="v">${esc(c.value)}</div><div class="m">§${esc(c.section)} · selftest ${c.gate.join(", ")}</div></div>`).join("")).join("");

  const order = ["read", "index", "cited", "memory"], col = { read: "var(--d4)", index: "rgba(111,224,255,.45)", cited: "var(--d3)", memory: "#ff7a7a" }, refs = R.refs;
  const n = (s) => refs.filter((r) => r.status === s).length;
  $("tally").innerHTML = order.filter(n).map((s) => `<i style="width:${(100 * n(s)) / refs.length}%;background:${col[s]}" title="${s}: ${n(s)}"></i>`).join("");
  $("tallyNote").textContent = `${refs.length} references: ${order.filter(n).map((s) => `${n(s)} ${s}`).join(", ")}. ${n("read") + n("index")} may be cited.`;
  $("refs").innerHTML = refs.slice().sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status) || a.year - b.year).map((r) => {
    const where = [esc(r.venue), r.volume && `<b>${esc(r.volume)}</b>`, esc(r.pages), r.year && `(${r.year})`].filter(Boolean).join(" ");
    const links = [r.doi && `<a href="https://doi.org/${esc(r.doi)}">doi:${esc(r.doi)}</a>`, r.arxiv && `<a href="https://arxiv.org/abs/${esc(r.arxiv)}">arXiv:${esc(r.arxiv)}</a>`].filter(Boolean).join(" · ");
    return `<li><div>${chip(r.status)}</div><div>${esc(r.authors)}, “${esc(r.title)}”, ${where}${links ? `. ${links}` : ""}<div class="r">${esc(r.role)}${r.source ? ` · checked: ${esc(r.source)}` : ""}</div></div></li>`;
  }).join("");

  const kb = (b) => (b > 1024 ? `${(b / 1024).toFixed(1)} kB` : `${b} B`);
  $("files").innerHTML = L.data.map((f) => `<tr><td><a href="p1/${esc(f.path)}">${esc(f.path)}</a></td><td class="n">${kb(f.bytes)}</td><td class="h">${esc(f.sha256.slice(0, 16))}…</td></tr>`).join("");

  // figures as <object> so their <title> tooltips work; captions beside them
  $("figs").innerHTML = Object.entries(CAP).map(([k, c]) => `<figure class="fig"><object type="image/svg+xml" data="p1/figures/${esc(k)}.svg" aria-label="figure ${esc(k)}"></object><figcaption><b>Figure ${esc(k)}.</b> ${esc(c)}</figcaption></figure>`).join("");
  const drafts = L.data.filter((f) => f.path.startsWith("draft/"));
  $("draftList").innerHTML = drafts.length ? drafts.map((f) => `<li><div>${chip("draft")}</div><div><a href="p1/${esc(f.path)}" style="color:var(--text)">${esc(f.path.replace("draft/", "").replace(".md", ""))}</a> <span class="note">${(f.bytes / 1024).toFixed(1)} kB</span></div></li>`).join("") : `<li><div></div><div class="note">none yet</div></li>`;
  $("check").innerHTML = P.checklist.map((c) => `<li><div>${chip(c.status)}</div><div>${esc(c.item)}${c.note ? `<div class="note">${esc(c.note)}</div>` : ""}</div></li>`).join("");
  $("jrnl").innerHTML = P.journal.slice().reverse().map((j) => `<li><time>${esc(j.date)}</time>${esc(j.what)}</li>`).join("");
}).catch((e) => { $("paper").innerHTML = `<p class="note">Couldn't load the paper's files (${esc(e.message)}).</p>`; });
