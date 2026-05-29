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

  /* ====================== CHARACTERS ====================== */
  function toRoman(n) { const m = ["", "I", "II", "III", "IV", "V", "VI"]; return m[n] || ("" + n); }

  function renderCharacters() {
    const ch = P.characters; if (!ch) return;
    $("#char-intro").innerHTML = ch.intro;
    const roleColor = {}, roleLabel = {};
    ch.roles.forEach((r) => { roleColor[r.id] = r.color; roleLabel[r.id] = r.label; });
    const leg = $("#char-legend"); leg.innerHTML = "";
    ch.roles.forEach((r) => leg.appendChild(el("span", "li", `<span class="dot" style="background:${r.color}"></span>${r.label}`)));
    const byId = {}; ch.cast.forEach((c) => byId[c.id] = c);
    const host = $("#char-groups"); host.innerHTML = "";
    ch.roles.forEach((role) => {
      const members = ch.cast.filter((c) => c.role === role.id);
      if (!members.length) return;
      host.appendChild(el("div", "char-rolehead", role.label));
      const grid = el("div", "char-grid");
      members.forEach((c) => {
        const col = roleColor[c.role] || "#c9a24a";
        const card = el("div", "char-card"); card.id = "char-" + c.id;
        card.style.borderLeftColor = col;
        let head = `<h3>${escapeHtml(c.name)}</h3>`;
        const sub = [c.alt && c.alt !== c.name ? c.alt : null, c.epithet].filter(Boolean).join(" · ");
        if (sub) head += `<div class="char-sub">${escapeHtml(sub)}</div>`;
        card.innerHTML = head + `<div class="char-blurb">${c.blurb}</div>`;
        if (c.appears && c.appears.length) {
          const ap = el("div", "char-appears", "Appears in: ");
          c.appears.forEach((n, i) => {
            const a = el("a", null, "Mvt " + toRoman(n)); a.setAttribute("data-passage", n); a.title = (P.tale.passages[n - 1] || {}).title || "";
            ap.appendChild(a); if (i < c.appears.length - 1) ap.appendChild(document.createTextNode(" · "));
          });
          card.appendChild(ap);
        }
        if (c.rel && c.rel.length) {
          const rl = el("div", "char-rels");
          c.rel.forEach((r) => {
            const target = byId[r.to]; if (!target) return;
            const chip = el("a", "char-rel"); chip.setAttribute("data-char", r.to);
            chip.innerHTML = `<span class="rel-label">${escapeHtml(r.label)}</span> ${escapeHtml(target.name)}`;
            rl.appendChild(chip);
          });
          card.appendChild(rl);
        }
        grid.appendChild(card);
      });
      host.appendChild(grid);
    });
  }

  /* ====================== CHARACTER WEB ====================== */
  function renderWeb() {
    const ch = P.characters; if (!ch) return;
    const roleColor = {}; ch.roles.forEach((r) => roleColor[r.id] = r.color);
    const leg = $("#web-legend"); leg.innerHTML = "";
    ch.roles.forEach((r) => leg.appendChild(el("span", "li", `<span class="dot" style="background:${r.color}"></span>${r.label}`)));

    const nodes = ch.cast.map((c) => ({ id: c.id, name: c.name, role: c.role, color: roleColor[c.role] || "#c9a24a" }));
    const idx = {}; nodes.forEach((n, i) => idx[n.id] = i);
    const seen = {}, edges = [];
    ch.cast.forEach((c) => (c.rel || []).forEach((r) => {
      if (idx[r.to] == null) return;
      const key = [c.id, r.to].sort().join("|"); if (seen[key]) return; seen[key] = 1;
      edges.push({ a: idx[c.id], b: idx[r.to], label: r.label });
    }));

    // Fruchterman–Reingold layout (deterministic seed → stable each load)
    const W = 1000, H = 720, k = Math.sqrt((W * H) / nodes.length) * 0.72;
    nodes.forEach((n, i) => { const a = 2 * Math.PI * i / nodes.length; n.x = W / 2 + Math.cos(a) * W * 0.32; n.y = H / 2 + Math.sin(a) * H * 0.32; });
    let temp = W * 0.1;
    for (let it = 0; it < 320; it++) {
      nodes.forEach((n) => { n.dx = 0; n.dy = 0; });
      for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
        let dx = nodes[i].x - nodes[j].x, dy = nodes[i].y - nodes[j].y, d = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const f = k * k / d, ux = dx / d, uy = dy / d;
        nodes[i].dx += ux * f; nodes[i].dy += uy * f; nodes[j].dx -= ux * f; nodes[j].dy -= uy * f;
      }
      edges.forEach((e) => {
        const A = nodes[e.a], B = nodes[e.b];
        let dx = A.x - B.x, dy = A.y - B.y, d = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const f = d * d / k, ux = dx / d, uy = dy / d;
        A.dx -= ux * f; A.dy -= uy * f; B.dx += ux * f; B.dy += uy * f;
      });
      nodes.forEach((n) => { n.dx += (W / 2 - n.x) * 0.02; n.dy += (H / 2 - n.y) * 0.02; });
      nodes.forEach((n) => { const d = Math.sqrt(n.dx * n.dx + n.dy * n.dy) || 0.01, m = Math.min(d, temp); n.x += n.dx / d * m; n.y += n.dy / d * m; });
      temp *= 0.97;
    }
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    nodes.forEach((n) => { minx = Math.min(minx, n.x); miny = Math.min(miny, n.y); maxx = Math.max(maxx, n.x); maxy = Math.max(maxy, n.y); });
    const pad = 46; nodes.forEach((n) => { n.x = n.x - minx + pad; n.y = n.y - miny + pad; });
    const contentW = maxx - minx + pad * 2;

    const svg = svgEl("svg", { class: "web" }); const layer = svgEl("g", { class: "zl" }); svg.appendChild(layer);
    const edgeEls = [], adj = {};
    edges.forEach((e, ei) => {
      const A = nodes[e.a], B = nodes[e.b];
      const line = svgEl("line", { class: "web-edge", x1: A.x, y1: A.y, x2: B.x, y2: B.y });
      const t = svgEl("title"); t.textContent = `${A.name} — ${e.label} — ${B.name}`; line.appendChild(t);
      layer.appendChild(line); edgeEls.push(line);
      (adj[e.a] = adj[e.a] || []).push(ei); (adj[e.b] = adj[e.b] || []).push(ei);
    });
    const nodeEls = [];
    nodes.forEach((n, i) => {
      const r = (n.role === "principal") ? 13 : (n.role === "annwn" || n.role === "hyfaidd" ? 10 : 9);
      const g = svgEl("g", { class: "web-node" });
      g.appendChild(svgEl("circle", { cx: n.x, cy: n.y, r: r, fill: n.color, "fill-opacity": 0.85, stroke: "#14110d", "stroke-width": 1.5 }));
      const label = svgEl("text", { class: "web-label", x: n.x, y: n.y + r + 12, "text-anchor": "middle", "font-size": 11 }); label.textContent = n.name; g.appendChild(label);
      const ttl = svgEl("title"); ttl.textContent = n.name + " — click for card"; g.appendChild(ttl);
      g.addEventListener("mouseenter", () => hi(i, true));
      g.addEventListener("mouseleave", () => hi(i, false));
      g.addEventListener("click", () => { switchView("characters"); const c = $("#char-" + n.id); if (c) setTimeout(() => { c.scrollIntoView({ behavior: "smooth", block: "center" }); c.classList.remove("flash"); void c.offsetWidth; c.classList.add("flash"); }, 30); });
      layer.appendChild(g); nodeEls.push(g);
    });
    function hi(i, on) {
      if (!on) { edgeEls.forEach((l) => l.classList.remove("hot")); nodeEls.forEach((g) => g.classList.remove("dim")); return; }
      const keep = new Set([i]); (adj[i] || []).forEach((ei) => { keep.add(edges[ei].a); keep.add(edges[ei].b); });
      edgeEls.forEach((l, ei) => { if (edges[ei].a === i || edges[ei].b === i) l.classList.add("hot"); });
      nodeEls.forEach((g, gi) => { if (!keep.has(gi)) g.classList.add("dim"); });
    }
    const host = $("#web-host"); host.innerHTML = ""; host.appendChild(svg);
    zoomers.web = attachZoom(svg, layer, contentW, host);
  }

  /* ====================== STORY GRAPH (Propp) ====================== */

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
  const VIEWS = ["read", "characters", "web", "propp"];
  let webDrawn = false, proppDrawn = false, current = "read";
  function switchView(v) {
    if (!VIEWS.includes(v)) v = "read";
    current = v;
    VIEWS.forEach((x) => { const n = $("#view-" + x); if (n) n.classList.toggle("active", x === v); });
    [...$("#tabs").children].forEach((b) => b.classList.toggle("active", b.dataset.view === v));
    if (v === "web" && !webDrawn) { renderWeb(); webDrawn = true; }
    if (v === "propp" && !proppDrawn) { renderPropp(); proppDrawn = true; }
    if (location.hash.slice(1).split("/")[0] !== v) history.replaceState(null, "", "#" + v);
    window.scrollTo({ top: 0 });
  }
  $("#tabs").addEventListener("click", (e) => { const b = e.target.closest(".tab"); if (b) switchView(b.dataset.view); });
  window.addEventListener("hashchange", () => { const v = location.hash.slice(1).split("/")[0]; if (VIEWS.includes(v)) switchView(v); });
  let rT; window.addEventListener("resize", () => { clearTimeout(rT); rT = setTimeout(() => { const z = zoomers[current]; if (z) z.fit(); }, 180); });

  // jump from a Propp card or character chip to the matching movement in Read
  document.addEventListener("click", (ev) => {
    const a = ev.target.closest && ev.target.closest("a[data-passage]");
    if (a) { ev.preventDefault(); switchView("read"); const h = document.getElementById("tale-p-" + a.getAttribute("data-passage")); if (h) setTimeout(() => h.scrollIntoView({ behavior: "smooth", block: "start" }), 30); }
  });
  // jump from a chip to the matching character card
  document.addEventListener("click", (ev) => {
    const a = ev.target.closest && ev.target.closest("a[data-char]");
    if (a) { ev.preventDefault(); switchView("characters"); const c = document.getElementById("char-" + a.getAttribute("data-char")); if (c) setTimeout(() => { c.scrollIntoView({ behavior: "smooth", block: "center" }); c.classList.remove("flash"); void c.offsetWidth; c.classList.add("flash"); }, 30); }
  });

  /* ====================== INIT ====================== */
  renderTale();
  renderCharacters();
  const h = location.hash.slice(1).split("/")[0];
  if (VIEWS.includes(h)) switchView(h);
})();
