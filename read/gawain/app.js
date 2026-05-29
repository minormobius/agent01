/* Sir Gawain and the Green Knight — standalone site (scaffold).
   Reads window.GAWAIN.tale, renders the meta/progress and fetches the
   canonical Middle English source for display. Translation, characters,
   story graph, motifs, mythograph and storybook are deferred. */
(function () {
  "use strict";
  const G = window.GAWAIN;
  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
  const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function renderMeta() {
    const t = G.tale; if (!t) return;
    const meta = $("#tale-meta"); meta.innerHTML = "";
    meta.appendChild(el("div", "tale-blurb", t.meta.blurb));
    if (t.meta.sources) {
      const sr = el("div", "srclinks");
      t.meta.sources.forEach((s) => {
        const a = el("a", "srclink"); a.href = s.url; a.target = "_blank"; a.rel = "noopener";
        a.innerHTML = `${escapeHtml(s.label)} <span class="host">${escapeHtml(s.host)}</span>`;
        sr.appendChild(a);
      });
      meta.appendChild(sr);
    }
    const prog = $("#tale-progress");
    if (prog && t.roadmap) {
      const done = t.roadmap.filter((r) => r.done).length, total = t.roadmap.length, pct = Math.round((done / total) * 100);
      prog.innerHTML = "";
      prog.appendChild(el("div", "prog-head", `Translation progress — <strong>${done} of ${total}</strong> · ${pct}%`));
      const bar = el("div", "prog-bar"); const fill = el("div", "prog-fill"); fill.style.width = pct + "%"; bar.appendChild(fill); prog.appendChild(bar);
      const road = el("div", "prog-road");
      t.roadmap.forEach((r) => road.appendChild(el("span", "prog-chip" + (r.done ? " done" : ""), r.t)));
      prog.appendChild(road);
    }
  }

  async function renderSource() {
    const host = $("#src-source"); if (!host) return;
    host.appendChild(el("h2", "section", "Middle English source"));
    host.appendChild(el("p", "lead", "Richard Morris's 1864 edition of the unique surviving manuscript (Cotton Nero A.x), preserved with the Project Gutenberg license header and the editor's sidenotes. The bracketed letters and line numbers are Morris's; thorn (þ) and yogh (3) are the manuscript's own. The original English translation will be written alongside this text in coming passes."));
    const pre = el("pre", "src-pre"); pre.textContent = "Loading source text…"; host.appendChild(pre);
    try {
      const resp = await fetch(G.tale.meta.sourceFile);
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      pre.textContent = await resp.text();
    } catch (e) {
      pre.textContent = "Could not load source file. Direct link: ";
      const a = el("a", null, G.tale.meta.sourceFile); a.href = G.tale.meta.sourceFile; a.target = "_blank";
      pre.appendChild(a);
    }
  }

  renderMeta();
  renderSource();
})();
