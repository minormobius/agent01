/* Pwyll Pendefig Dyfed — standalone site reader. */
(function () {
  "use strict";
  const P = window.PWYLL;
  const $ = (s, r) => (r || document).querySelector(s);
  const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
  const NS = "http://www.w3.org/2000/svg";
  const svgEl = (tag, attrs) => { const n = document.createElementNS(NS, tag); if (attrs) for (const k in attrs) n.setAttribute(k, attrs[k]); return n; };
  const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  /* ---- pan/zoom (shared by SVG diagrams) ---- */
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const zoomers = {};
  function attachZoom(svg, layer, content, host) {
    let k = 1, tx = 0, ty = 0; const MIN = 0.2, MAX = 9;
    const apply = () => layer.setAttribute("transform", `translate(${tx} ${ty}) scale(${k})`);
    function fit() {
      const cw = host.clientWidth || 800, ch = host.clientHeight || 600;
      if (typeof content === "function") {
        const b = content(), m = 50;
        k = clamp(Math.min(cw / (b.w + m * 2), ch / (b.h + m * 2)), MIN, 1.4);
        tx = (cw - b.w * k) / 2 - b.x * k; ty = (ch - b.h * k) / 2 - b.y * k;
      } else {
        k = Math.min(1.4, cw / content); tx = Math.max(0, (cw - content * k) / 2); ty = 6;
      }
      apply();
    }
    function zoomAt(mx, my, f) { const nk = clamp(k * f, MIN, MAX); tx = mx - (mx - tx) * (nk / k); ty = my - (my - ty) * (nk / k); k = nk; apply(); }
    svg.addEventListener("wheel", (e) => { e.preventDefault(); const r = svg.getBoundingClientRect(); zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
    const pts = new Map(); let pinch = null;
    svg.addEventListener("pointerdown", (e) => { pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); try { svg.setPointerCapture(e.pointerId); } catch (_) {} });
    svg.addEventListener("pointermove", (e) => {
      if (!pts.has(e.pointerId)) return;
      const prev = pts.get(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const arr = [...pts.values()];
      if (arr.length === 1) { tx += e.clientX - prev.x; ty += e.clientY - prev.y; apply(); }
      else if (arr.length >= 2) {
        const r = svg.getBoundingClientRect(); const [a, b] = arr;
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const midx = (a.x + b.x) / 2 - r.left, midy = (a.y + b.y) / 2 - r.top;
        if (pinch) { zoomAt(midx, midy, dist / pinch.dist); tx += midx - pinch.midx; ty += midy - pinch.midy; apply(); }
        pinch = { dist, midx, midy };
      }
    });
    const release = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; };
    svg.addEventListener("pointerup", release); svg.addEventListener("pointercancel", release);
    const ctr = el("div", "zoom-controls");
    const mk = (txt, fn) => { const b = el("button", "zbtn", txt); b.type = "button"; b.onclick = fn; ctr.appendChild(b); return b; };
    const center = (f) => zoomAt(host.clientWidth / 2, host.clientHeight / 2, f);
    mk("+", () => center(1.35)); mk("−", () => center(1 / 1.35)); mk("⤢", () => fit());
    host.appendChild(ctr); fit();
    return { fit };
  }

  /* ====================== READ (parallel text) ====================== */
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

  /* ====================== STORY GRAPH (Propp) ====================== */
  function toRoman(n) { const m = ["", "I", "II", "III", "IV", "V", "VI"]; return m[n] || ("" + n); }

  function renderPropp() {
    const PR = P.propp; if (!PR) return;
    $("#propp-intro").innerHTML = PR.intro;
    const actColor = {}; PR.acts.forEach((a) => actColor[a.id] = a.color);
    const leg = $("#propp-legend"); leg.innerHTML = "";
    PR.acts.forEach((a) => leg.appendChild(el("span", "li", `<span class="dot" style="background:${a.color}"></span>${a.label}`)));

    const moves = PR.moves, n = moves.length;
    const NW = 98, NH = 40, SX = 118, padX = 20, padTop = 38;
    const contentW = padX * 2 + (n - 1) * SX + NW;
    const cx = (i) => padX + NW / 2 + i * SX, cy = padTop + NH / 2;
    const svg = svgEl("svg", { class: "propp" }); const layer = svgEl("g", { class: "zl" }); svg.appendChild(layer);
    for (let i = 0; i < n - 1; i++) layer.appendChild(svgEl("path", { class: "propp-arrow", d: `M ${cx(i) + NW / 2} ${cy} L ${cx(i + 1) - NW / 2} ${cy}`, "marker-end": "url(#parr)" }));
    const defs = svgEl("defs"); const mk = svgEl("marker", { id: "parr", viewBox: "0 0 10 10", refX: 8, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" });
    mk.appendChild(svgEl("path", { d: "M0 0 L10 5 L0 10 z", fill: "#8a7f6b" })); defs.appendChild(mk); layer.appendChild(defs);
    moves.forEach((m, i) => {
      const col = actColor[m.act] || "#c9a24a";
      const g = svgEl("g", { class: "propp-node" });
      g.appendChild(svgEl("rect", { x: cx(i) - NW / 2, y: cy - NH / 2, width: NW, height: NH, rx: 8, fill: col, "fill-opacity": 0.16, stroke: col }));
      const sym = svgEl("text", { x: cx(i) - NW / 2 + 17, y: cy + 6, "text-anchor": "middle", "font-size": 15, fill: col, "font-style": "italic" }); sym.textContent = m.sym; g.appendChild(sym);
      const lbl = svgEl("text", { x: cx(i) + 8, y: cy + 5, "text-anchor": "middle", "font-size": 11.5, fill: "#e8e0d2" }); lbl.textContent = m.node; g.appendChild(lbl);
      const ttl = svgEl("title"); ttl.textContent = `${m.sym} — ${m.name}`; g.appendChild(ttl);
      g.addEventListener("click", () => { const c = $("#propp-move-" + i); if (c) { c.scrollIntoView({ behavior: "smooth", block: "center" }); c.classList.remove("flash"); void c.offsetWidth; c.classList.add("flash"); } });
      layer.appendChild(g);
    });
    const host = $("#propp-spine"); host.innerHTML = ""; host.appendChild(svg);
    zoomers.propp = attachZoom(svg, layer, contentW, host);

    const cards = $("#propp-cards"); cards.innerHTML = ""; let lastAct = null;
    moves.forEach((m, i) => {
      if (m.act !== lastAct) { const a = PR.acts.find((x) => x.id === m.act); cards.appendChild(el("div", "propp-act", a ? a.label : m.act)); lastAct = m.act; }
      const col = actColor[m.act] || "#c9a24a";
      const card = el("div", "propp-move"); card.id = "propp-move-" + i;
      const badge = el("div", "propp-badge", m.sym); badge.style.color = col; badge.style.borderColor = col; card.appendChild(badge);
      const main = el("div");
      main.appendChild(el("div", "propp-name", `${escapeHtml(m.name)} <span class="propp-sym">${escapeHtml(m.sym)}</span>`));
      main.appendChild(el("div", "propp-gloss", m.gloss));
      main.appendChild(el("div", "propp-realized", m.realized));
      const pass = P.tale && P.tale.passages[m.passage - 1];
      if (pass) { const j = el("div", "propp-jump"); const a = el("a", null, `→ ${escapeHtml(pass.title)}`); a.setAttribute("data-passage", m.passage); j.appendChild(a); main.appendChild(j); }
      card.appendChild(main); cards.appendChild(card);
    });

    const ab = $("#propp-absent"); ab.innerHTML = "";
    ab.appendChild(el("h3", null, "What the tale leaves out — and what it shifts"));
    ab.appendChild(el("p", "propp-abnote", PR.absent.note));
    PR.absent.groups.forEach((gp) => { const row = el("div", "propp-abgroup"); row.innerHTML = `<span class="propp-absyms">${escapeHtml(gp.syms)}</span> <strong>${escapeHtml(gp.label)}</strong> — ${gp.text}`; ab.appendChild(row); });
    ab.appendChild(el("p", "propp-verdict", PR.absent.verdict));
  }

  /* ====================== VIEW SWITCHING ====================== */
  const VIEWS = ["read", "propp"];
  let proppDrawn = false, current = "read";
  function switchView(v) {
    if (!VIEWS.includes(v)) v = "read";
    current = v;
    VIEWS.forEach((x) => { const n = $("#view-" + x); if (n) n.classList.toggle("active", x === v); });
    [...$("#tabs").children].forEach((b) => b.classList.toggle("active", b.dataset.view === v));
    if (v === "propp" && !proppDrawn) { renderPropp(); proppDrawn = true; }
    if (location.hash.slice(1).split("/")[0] !== v) history.replaceState(null, "", "#" + v);
    window.scrollTo({ top: 0 });
  }
  $("#tabs").addEventListener("click", (e) => { const b = e.target.closest(".tab"); if (b) switchView(b.dataset.view); });
  window.addEventListener("hashchange", () => { const v = location.hash.slice(1).split("/")[0]; if (VIEWS.includes(v)) switchView(v); });
  let rT; window.addEventListener("resize", () => { clearTimeout(rT); rT = setTimeout(() => { const z = zoomers[current]; if (z) z.fit(); }, 180); });

  // jump from a Propp card to the matching movement in Read
  document.addEventListener("click", (ev) => {
    const a = ev.target.closest && ev.target.closest("a[data-passage]");
    if (a) { ev.preventDefault(); switchView("read"); const h = document.getElementById("tale-p-" + a.getAttribute("data-passage")); if (h) setTimeout(() => h.scrollIntoView({ behavior: "smooth", block: "start" }), 30); }
  });

  /* ====================== INIT ====================== */
  renderTale();
  const h = location.hash.slice(1).split("/")[0];
  if (VIEWS.includes(h)) switchView(h);
})();
