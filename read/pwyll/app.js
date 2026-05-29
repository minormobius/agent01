/* Pwyll Pendefig Dyfed — standalone site reader. */
(function () {
  "use strict";
  const P = window.PWYLL;
  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
  const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function renderTale() {
    const t = P.tale; if (!t) return;

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
      prog.appendChild(el("div", "prog-head", done === total
        ? `Translation <strong>complete</strong> — all ${total} ✦`
        : `Translation progress — <strong>${done} of ${total}</strong> · ~${pct}%`));
      const bar = el("div", "prog-bar"); const fill = el("div", "prog-fill"); fill.style.width = pct + "%"; bar.appendChild(fill); prog.appendChild(bar);
      const road = el("div", "prog-road");
      t.roadmap.forEach((r) => road.appendChild(el("span", "prog-chip" + (r.done ? " done" : ""), r.t)));
      prog.appendChild(road);
    }

    if (!t.passages || !t.passages.length) return;

    const body = $("#tale-body");
    const ctr = $("#tale-controls"); ctr.innerHTML = "";
    [["parallel", "Parallel"], ["english", "English only"], ["middle", "Welsh only"]].forEach(([m, label], i) => {
      const b = el("button", "tale-mode" + (i === 0 ? " active" : ""), label);
      b.onclick = () => { body.className = "tale-body " + m; [...ctr.children].forEach((x) => x.classList.remove("active")); b.classList.add("active"); };
      ctr.appendChild(b);
    });

    body.innerHTML = "";
    t.passages.forEach((pass, pi) => {
      const head = el("h2", "section tale-pass-title", pass.title); head.id = "tale-p-" + (pi + 1); body.appendChild(head);
      pass.segments.forEach((seg, si) => {
        const row = el("div", "tale-seg");
        const w = el("div", "seg-w"); w.innerHTML = `<span class="seg-no">${si + 1}.</span> ` + seg.w; row.appendChild(w);
        const e = el("div", "seg-e", seg.e); row.appendChild(e);
        if (seg.n) row.appendChild(el("div", "seg-n", seg.n));
        body.appendChild(row);
      });
    });
  }

  renderTale();
})();
