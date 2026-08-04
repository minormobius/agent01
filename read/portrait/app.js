/* A Portrait of the Artist as a Young Man — standalone site reader.
 *
 * Same shape as the medieval tales on this site (read/pwyll/app.js and
 * siblings): one IIFE, no build step, no dependencies, every view rendered
 * lazily on first switch. The pan/zoom, force simulation and Fruchterman–
 * Reingold layout are carried over unchanged, because they are proven.
 *
 * What is new here is what the modernist apparatus needs and the folkloric one
 * did not: renderStyle() (the measured curve of the prose), renderEpiphanies()
 * (the chapter-join ladder), the Girard triangle beside the actantial diagram,
 * and a `register` node type in the mythograph so the five chapter styles are
 * on the graph as first-class objects. */
(function () {
  "use strict";
  const P = window.PORTRAIT;
  const $ = (s, r) => (r || document).querySelector(s);
  const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
  const NS = "http://www.w3.org/2000/svg";
  const svgEl = (tag, attrs) => { const n = document.createElementNS(NS, tag); if (attrs) for (const k in attrs) n.setAttribute(k, attrs[k]); return n; };
  const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  /* Movements are identified by their section id ("IV.3"), not by a Roman
     numeral — a novel in five chapters of nineteen sections needs both numbers. */
  const PASS = P.tale.passages;
  const mvId = (n) => (PASS[n - 1] || {}).id || String(n);
  const mvTitle = (n) => (PASS[n - 1] || {}).title || "";
  const idToIndex = {}; PASS.forEach((p, i) => idToIndex[p.id] = i + 1);
  const CHAPTERS = ["I", "II", "III", "IV", "V"];
  const CH_COLOR = { I: "#d9a441", II: "#c97f6a", III: "#c25b4a", IV: "#7fa3c9", V: "#7fb37f" };

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
    svg.addEventListener("pointerdown", (e) => { pts.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, drag: false }); });
    svg.addEventListener("pointermove", (e) => {
      const p = pts.get(e.pointerId); if (!p) return;
      const prevx = p.x, prevy = p.y; p.x = e.clientX; p.y = e.clientY;
      const arr = [...pts.values()];
      if (arr.length === 1) {
        if (!p.drag) { if (Math.hypot(e.clientX - p.x0, e.clientY - p.y0) < 5) return; p.drag = true; try { svg.setPointerCapture(e.pointerId); } catch (_) {} }
        tx += e.clientX - prevx; ty += e.clientY - prevy; apply();
      } else if (arr.length >= 2) {
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

  /* ====================== READ (text + facing voice) ====================== */
  function renderTale() {
    const t = P.tale; if (!t) return;

    const meta = $("#tale-meta"); meta.innerHTML = "";
    meta.appendChild(el("div", "tale-blurb", t.meta.blurb));
    if (t.meta.sources) {
      const sr = el("div", "srclinks");
      t.meta.sources.forEach((s) => {
        const a = el("a", "srclink"); a.href = s.url;
        if (/^https?:/.test(s.url)) { a.target = "_blank"; a.rel = "noopener"; }
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
        ? `Apparatus <strong>complete</strong> — all ${total} ✦`
        : `Apparatus — <strong>${done} of ${total}</strong> layers · ~${pct}%`));
      const bar = el("div", "prog-bar"); const fill = el("div", "prog-fill"); fill.style.width = pct + "%"; bar.appendChild(fill); prog.appendChild(bar);
      const road = el("div", "prog-road");
      t.roadmap.forEach((r) => road.appendChild(el("span", "prog-chip" + (r.done ? " done" : ""), r.t)));
      prog.appendChild(road);
    }

    const body = $("#tale-body");
    const ctr = $("#tale-controls"); ctr.innerHTML = "";
    [["parallel", "Parallel"], ["english", "Text only"], ["middle", "Voice only"]].forEach(([m, label], i) => {
      const b = el("button", "tale-mode" + (i === 0 ? " active" : ""), label);
      b.onclick = () => { body.className = "tale-body " + m; [...ctr.children].forEach((x) => x.classList.remove("active")); b.classList.add("active"); };
      ctr.appendChild(b);
    });

    body.innerHTML = "";
    let lastChapter = null;
    PASS.forEach((pass, pi) => {
      if (pass.chapter !== lastChapter) {
        const ch = el("div", "chapter-rule");
        ch.style.borderColor = CH_COLOR[pass.chapter];
        ch.innerHTML = `<span style="color:${CH_COLOR[pass.chapter]}">Chapter ${escapeHtml(pass.chapter)}</span>`;
        body.appendChild(ch); lastChapter = pass.chapter;
      }
      const head = el("h2", "section tale-pass-title", escapeHtml(pass.title));
      head.id = "tale-p-" + (pi + 1); body.appendChild(head);
      if (pass.sub) body.appendChild(el("div", "tale-sub", escapeHtml(pass.sub)));
      const rungs = (P.epiphanies && P.epiphanies.rungs || []).filter((r) => r.passage === pi + 1);
      if (rungs.length) body.appendChild(el("div", "tale-themes", rungs.map((r) => "✦ <strong>epiphany:</strong> " + escapeHtml(r.label)).join(" &nbsp;·&nbsp; ")));
      pass.segments.forEach((seg, si) => {
        const row = el("div", "tale-seg");
        const w = el("div", "seg-w"); w.innerHTML = `<span class="seg-no">${si + 1}.</span> ` + seg.w; row.appendChild(w);
        row.appendChild(el("div", "seg-e", seg.e));
        if (seg.n) row.appendChild(el("div", "seg-n", seg.n));
        body.appendChild(row);
      });
    });
  }

  /* ====================== CHARACTERS ====================== */
  function renderCharacters() {
    const ch = P.characters; if (!ch) return;
    $("#char-intro").innerHTML = ch.intro;
    const roleColor = {};
    ch.roles.forEach((r) => { roleColor[r.id] = r.color; });
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
        const col = roleColor[c.role] || "#d9a441";
        const card = el("div", "char-card"); card.id = "char-" + c.id;
        card.style.borderLeftColor = col;
        let head = `<h3>${escapeHtml(c.name)}</h3>`;
        if (c.epithet) head += `<div class="char-sub">${escapeHtml(c.epithet)}</div>`;
        card.innerHTML = head + `<div class="char-blurb">${c.blurb}</div>`;
        if (c.appears && c.appears.length) {
          const ap = el("div", "char-appears", "Appears in: ");
          const shown = c.appears.length > 8 ? c.appears.filter((n, i) => i % 3 === 0 || i === c.appears.length - 1) : c.appears;
          shown.forEach((n, i) => {
            const a = el("a", null, mvId(n)); a.setAttribute("data-passage", n); a.title = mvTitle(n);
            ap.appendChild(a); if (i < shown.length - 1) ap.appendChild(document.createTextNode(" · "));
          });
          if (shown.length < c.appears.length) ap.appendChild(document.createTextNode(` (${c.appears.length} movements)`));
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

    // Node size = share of the novel a figure occupies, approximated by the
    // total word-count of the movements they appear in. A figure in one long
    // movement (Father Arnall) outweighs one in four short ones, which is the
    // right answer for this book.
    const wordsOf = {}; (P.style && P.style.sections || []).forEach((s) => wordsOf[s.id] = s.words);
    const weight = (c) => (c.appears || []).reduce((s, n) => s + (wordsOf[mvId(n)] || 0), 0);
    const weights = ch.cast.map(weight);
    const wmax = Math.max.apply(null, weights) || 1;

    const nodes = ch.cast.map((c, i) => ({
      id: c.id, name: c.name, role: c.role, color: roleColor[c.role] || "#d9a441",
      r: 7 + 11 * Math.sqrt(weights[i] / wmax), words: weights[i],
    }));
    const idx = {}; nodes.forEach((n, i) => idx[n.id] = i);
    const seen = {}, edges = [];
    ch.cast.forEach((c) => (c.rel || []).forEach((r) => {
      if (idx[r.to] == null) return;
      const key = [c.id, r.to].sort().join("|"); if (seen[key]) return; seen[key] = 1;
      edges.push({ a: idx[c.id], b: idx[r.to], label: r.label });
    }));

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
      const g = svgEl("g", { class: "web-node" });
      g.appendChild(svgEl("circle", { cx: n.x, cy: n.y, r: n.r, fill: n.color, "fill-opacity": 0.85, stroke: "#14110d", "stroke-width": 1.5 }));
      const label = svgEl("text", { class: "web-label", x: n.x, y: n.y + n.r + 12, "text-anchor": "middle", "font-size": 11 }); label.textContent = n.name; g.appendChild(label);
      const ttl = svgEl("title"); ttl.textContent = `${n.name} — present across ${n.words.toLocaleString()} words of the novel. Click for card.`; g.appendChild(ttl);
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

  /* ====================== DISCOURSE GRAPH (Genette) ====================== */
  function renderDiscourse() {
    const D = P.discourse; if (!D) return;
    $("#discourse-intro").innerHTML = D.intro;
    const actColor = {}; D.acts.forEach((a) => actColor[a.id] = a.color);
    const leg = $("#discourse-legend"); leg.innerHTML = "";
    D.acts.forEach((a) => leg.appendChild(el("span", "li", `<span class="dot" style="background:${a.color}"></span>${a.label}`)));

    const moves = D.moves, n = moves.length;
    const NW = 104, NH = 40, SX = 124, padX = 20, padTop = 38;
    const contentW = padX * 2 + (n - 1) * SX + NW;
    const cx = (i) => padX + NW / 2 + i * SX, cy = padTop + NH / 2;
    const svg = svgEl("svg", { class: "propp" }); const layer = svgEl("g", { class: "zl" }); svg.appendChild(layer);
    const defs = svgEl("defs");
    const mk = svgEl("marker", { id: "darr", viewBox: "0 0 10 10", refX: 8, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" });
    mk.appendChild(svgEl("path", { d: "M0 0 L10 5 L0 10 z", fill: "#8a7f6b" })); defs.appendChild(mk); layer.appendChild(defs);
    for (let i = 0; i < n - 1; i++) layer.appendChild(svgEl("path", { class: "propp-arrow", d: `M ${cx(i) + NW / 2} ${cy} L ${cx(i + 1) - NW / 2} ${cy}`, "marker-end": "url(#darr)" }));
    moves.forEach((m, i) => {
      const col = actColor[m.act] || "#d9a441";
      const g = svgEl("g", { class: "propp-node" });
      g.appendChild(svgEl("rect", { x: cx(i) - NW / 2, y: cy - NH / 2, width: NW, height: NH, rx: 8, fill: col, "fill-opacity": 0.16, stroke: col }));
      const sym = svgEl("text", { x: cx(i) - NW / 2 + 19, y: cy + 6, "text-anchor": "middle", "font-size": 14, fill: col, "font-style": "italic" }); sym.textContent = m.sym; g.appendChild(sym);
      const lbl = svgEl("text", { x: cx(i) + 12, y: cy + 5, "text-anchor": "middle", "font-size": 11, fill: "#e8e0d2" }); lbl.textContent = m.node; g.appendChild(lbl);
      const ttl = svgEl("title"); ttl.textContent = `${m.sym} — ${m.name}`; g.appendChild(ttl);
      g.addEventListener("click", () => { const c = $("#discourse-move-" + i); if (c) { c.scrollIntoView({ behavior: "smooth", block: "center" }); c.classList.remove("flash"); void c.offsetWidth; c.classList.add("flash"); } });
      layer.appendChild(g);
    });
    const host = $("#discourse-spine"); host.innerHTML = ""; host.appendChild(svg);
    zoomers.discourse = attachZoom(svg, layer, contentW, host);

    const cards = $("#discourse-cards"); cards.innerHTML = ""; let lastAct = null;
    moves.forEach((m, i) => {
      if (m.act !== lastAct) { const a = D.acts.find((x) => x.id === m.act); cards.appendChild(el("div", "propp-act", a ? a.label : m.act)); lastAct = m.act; }
      const col = actColor[m.act] || "#d9a441";
      const card = el("div", "propp-move"); card.id = "discourse-move-" + i;
      const badge = el("div", "propp-badge", m.sym); badge.style.color = col; badge.style.borderColor = col; card.appendChild(badge);
      const main = el("div");
      main.appendChild(el("div", "propp-name", `${escapeHtml(m.name)}`));
      main.appendChild(el("div", "propp-gloss", m.gloss));
      main.appendChild(el("div", "propp-realized", m.realized));
      if (PASS[m.passage - 1]) { const j = el("div", "propp-jump"); const a = el("a", null, `→ ${escapeHtml(mvTitle(m.passage))}`); a.setAttribute("data-passage", m.passage); j.appendChild(a); main.appendChild(j); }
      card.appendChild(main); cards.appendChild(card);
    });

    const ab = $("#discourse-absent"); ab.id = "discourse-absent"; ab.innerHTML = "";
    ab.appendChild(el("h3", null, "What the novel refuses"));
    ab.appendChild(el("p", "propp-abnote", D.absent.note));
    D.absent.groups.forEach((gp) => { const row = el("div", "propp-abgroup"); row.innerHTML = `<span class="propp-absyms">${escapeHtml(gp.syms)}</span> <strong>${escapeHtml(gp.label)}</strong> — ${gp.text}`; ab.appendChild(row); });
    ab.appendChild(el("p", "propp-verdict", D.absent.verdict));
  }

  /* ====================== LEITMOTIF INDEX ====================== */
  function confLabel(c) { return c === "high" ? "lexicon fits" : c === "med" ? "over-collects" : "interpretive"; }
  function motifStat(key) { return (P.style && P.style.motifs || []).find((m) => m.key === key); }

  function renderMotifs() {
    const M = P.motifs; if (!M) return;
    $("#motif-intro").innerHTML = M.intro;
    const tt = $("#motif-taletypes"); tt.innerHTML = "";
    M.taletypes.forEach((t) => {
      const card = el("div", "tt-card");
      card.innerHTML = `<div class="tt-head"><span class="tt-code">${escapeHtml(t.code)}</span><span class="conf conf-${t.conf}">${t.conf === "high" ? "clear" : "partial"}</span></div><div class="tt-name">${escapeHtml(t.name)}</div><div class="tt-gloss">${t.gloss}</div>`;
      tt.appendChild(card);
    });
    const host = $("#motif-groups"); host.innerHTML = "";
    M.classOrder.forEach((cl) => {
      const items = M.list.filter((m) => m.cls === cl); if (!items.length) return;
      host.appendChild(el("div", "motif-classhead", `<span class="motif-clsletter">${cl}</span> ${M.classes[cl] || ""}`));
      items.forEach((m) => {
        const stat = motifStat(m.key);
        const row = el("div", "motif-row");
        row.appendChild(el("div", "motif-badge", escapeHtml(m.code)));
        const main = el("div");
        main.appendChild(el("div", "motif-name", `${escapeHtml(m.name)} <span class="conf conf-${m.conf}">${confLabel(m.conf)}</span>`));
        if (stat) main.appendChild(sparkRow(stat));
        main.appendChild(el("div", "motif-gloss", m.gloss));
        if (m.caveat) main.appendChild(el("div", "motif-caveat", "⚠ " + m.caveat));
        if (stat) {
          const terms = el("details", "motif-terms");
          terms.appendChild(el("summary", null, `the word-list — ${stat.terms.length} terms, ${stat.total.toLocaleString()} hits`));
          terms.appendChild(el("div", "motif-termlist", stat.termCounts.map(([t, c]) => `<span class="term"><em>${escapeHtml(t)}</em> ${c}</span>`).join("")));
          main.appendChild(terms);
        }
        if (stat && stat.topSections) {
          const ap = el("div", "motif-ex", "Densest in: ");
          stat.topSections.forEach((sid, i) => {
            const n = idToIndex[sid]; if (!n) return;
            const a = el("a", null, sid); a.setAttribute("data-passage", n); a.title = mvTitle(n);
            ap.appendChild(a); if (i < stat.topSections.length - 1) ap.appendChild(document.createTextNode(" · "));
          });
          main.appendChild(ap);
        }
        if (m.cross) main.appendChild(el("div", "motif-cross", "↔ " + m.cross));
        row.appendChild(main); host.appendChild(row);
      });
    });
  }

  // A five-bar chapter sparkline, shared by the motif rows and the style page.
  function sparkRow(stat) {
    const wrap = el("div", "spark");
    const max = Math.max.apply(null, stat.byChapter) || 1;
    CHAPTERS.forEach((c, i) => {
      const v = stat.byChapter[i];
      const b = el("span", "spark-bar");
      b.title = `Chapter ${c}: ${v} per 10,000 words`;
      const inner = el("span", "spark-fill");
      inner.style.height = Math.max(3, Math.round((v / max) * 34)) + "px";
      inner.style.background = CH_COLOR[c];
      b.appendChild(inner); b.appendChild(el("span", "spark-lab", c));
      wrap.appendChild(b);
    });
    wrap.appendChild(el("span", "spark-note", `per 10,000 words · peak ${max} in Chapter ${CHAPTERS[stat.byChapter.indexOf(max)]}`));
    return wrap;
  }

  /* ====================== EPIPHANY LADDER ====================== */
  function renderEpiphanies() {
    const E = P.epiphanies; if (!E) return;
    $("#epiph-intro").innerHTML = E.intro;
    const host = $("#epiph-ladder"); host.innerHTML = "";
    E.rungs.forEach((r) => {
      const card = el("div", "rung");
      card.appendChild(el("div", "rung-label", escapeHtml(r.label)));
      const pair = el("div", "rung-pair");
      const a = el("div", "rung-side rung-close");
      a.appendChild(el("div", "rung-tag", `closes ${escapeHtml(mvId(r.passage))} — the exaltation`));
      a.appendChild(el("blockquote", null, r.close));
      pair.appendChild(a);
      const b = el("div", "rung-side rung-open");
      if (r.open) {
        b.appendChild(el("div", "rung-tag", `opens ${escapeHtml(mvId(r.next))} — the deflation`));
        b.appendChild(el("blockquote", null, r.open));
      } else {
        b.appendChild(el("div", "rung-tag", "nothing follows"));
        b.appendChild(el("blockquote", "rung-void", "The book ends. The deflation had to be built into the rung itself — and then <em>Ulysses</em> supplies it again."));
      }
      pair.appendChild(b);
      card.appendChild(pair);
      card.appendChild(el("div", "rung-note", r.note));
      const jump = el("div", "propp-jump");
      const link = el("a", null, `→ read ${mvId(r.passage)}`); link.setAttribute("data-passage", r.passage);
      jump.appendChild(link); card.appendChild(jump);
      host.appendChild(card);
    });
    const inner = $("#epiph-inner"); inner.innerHTML = "";
    (E.inner || []).forEach((e) => {
      const row = el("div", "motif-row");
      row.appendChild(el("div", "motif-badge", "✦"));
      const main = el("div");
      main.appendChild(el("div", "motif-name", escapeHtml(e.label)));
      main.appendChild(el("blockquote", "inner-lines", e.lines));
      main.appendChild(el("div", "motif-gloss", e.note));
      const ap = el("div", "motif-ex", "In: ");
      const a = el("a", null, mvId(e.passage)); a.setAttribute("data-passage", e.passage); a.title = mvTitle(e.passage);
      ap.appendChild(a); main.appendChild(ap);
      row.appendChild(main); inner.appendChild(row);
    });
  }

  /* ====================== THE STYLE CURVE ======================
     The layer the folkloric apparatus cannot have. In an oral tale the style is
     a constant — formulaic by design, invariant across the performance. In this
     novel the style is the plot, and Joyce said so. So it gets measured, and the
     charts below are drawn straight from stylometry.js. */
  function lineChart(opts) {
    const W = opts.width || 940, H = opts.height || 300;
    const m = { l: 56, r: 18, t: 22, b: 62 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const labels = opts.labels, series = opts.series;
    let lo = opts.min != null ? opts.min : Infinity, hi = opts.max != null ? opts.max : -Infinity;
    if (lo === Infinity || hi === -Infinity) series.forEach((s) => s.values.forEach((v) => { if (v == null) return; lo = Math.min(lo, v); hi = Math.max(hi, v); }));
    if (opts.min == null) lo = Math.min(lo, 0);
    const pad = (hi - lo) * 0.08 || 1; hi += pad;
    const X = (i) => m.l + (labels.length === 1 ? iw / 2 : (i / (labels.length - 1)) * iw);
    const Y = (v) => m.t + ih - ((v - lo) / (hi - lo)) * ih;

    const svg = svgEl("svg", { class: "chart", viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "xMidYMid meet", role: "img" });
    const ttl = svgEl("title"); ttl.textContent = opts.title || ""; svg.appendChild(ttl);

    // chapter bands behind the plot
    if (opts.bands) {
      opts.bands.forEach((b) => {
        const x1 = X(b.from), x2 = X(b.to);
        svg.appendChild(svgEl("rect", { x: x1 - 6, y: m.t, width: (x2 - x1) + 12, height: ih, fill: CH_COLOR[b.chapter], "fill-opacity": 0.055 }));
        const t = svgEl("text", { x: (x1 + x2) / 2, y: m.t - 7, "text-anchor": "middle", "font-size": 11, fill: CH_COLOR[b.chapter] });
        t.textContent = "Ch " + b.chapter; svg.appendChild(t);
      });
    }
    // y gridlines
    const ticks = 4;
    for (let i = 0; i <= ticks; i++) {
      const v = lo + (hi - lo) * (i / ticks), y = Y(v);
      svg.appendChild(svgEl("line", { x1: m.l, y1: y, x2: m.l + iw, y2: y, stroke: "#3a352c", "stroke-width": 1, "stroke-dasharray": i === 0 ? "0" : "3 4" }));
      const t = svgEl("text", { x: m.l - 9, y: y + 4, "text-anchor": "end", "font-size": 11, fill: "#8a7f6b" });
      t.textContent = (hi - lo > 12 ? Math.round(v) : v.toFixed(1)); svg.appendChild(t);
    }
    // reference line
    if (opts.rule != null) {
      svg.appendChild(svgEl("line", { x1: m.l, y1: Y(opts.rule), x2: m.l + iw, y2: Y(opts.rule), stroke: "#c25b4a", "stroke-width": 1.4, "stroke-dasharray": "7 5" }));
      const t = svgEl("text", { x: m.l + 6, y: Y(opts.rule) - 7, "text-anchor": "start", "font-size": 11, fill: "#c25b4a", "font-style": "italic" });
      t.textContent = opts.ruleLabel || ""; svg.appendChild(t);
    }
    // x labels
    labels.forEach((lab, i) => {
      const t = svgEl("text", { x: X(i), y: m.t + ih + 18, "text-anchor": "middle", "font-size": 10.5, fill: "#8a7f6b" });
      t.textContent = lab; svg.appendChild(t);
    });
    if (opts.ylabel) {
      const t = svgEl("text", { x: 14, y: m.t + ih / 2, "text-anchor": "middle", "font-size": 11.5, fill: "#8a7f6b", transform: `rotate(-90 14 ${m.t + ih / 2})` });
      t.textContent = opts.ylabel; svg.appendChild(t);
    }
    // series
    series.forEach((s) => {
      const pts = s.values.map((v, i) => (v == null ? null : [X(i), Y(v)])).filter(Boolean);
      const d = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
      svg.appendChild(svgEl("path", { d, fill: "none", stroke: s.color, "stroke-width": s.width || 2.4, "stroke-linejoin": "round", "stroke-dasharray": s.dashed ? "6 4" : "0" }));
      s.values.forEach((v, i) => {
        if (v == null) return;
        const g = svgEl("g", { class: "chart-pt" });
        g.appendChild(svgEl("circle", { cx: X(i), cy: Y(v), r: 4, fill: s.color, stroke: "#14110d", "stroke-width": 1.2 }));
        const tt = svgEl("title"); tt.textContent = `${labels[i]} — ${s.name}: ${v}`; g.appendChild(tt);
        svg.appendChild(g);
      });
    });
    // annotations
    (opts.notes || []).forEach((nte) => {
      const x = X(nte.at), y = Y(nte.value);
      const dy = nte.below ? 22 : -16;
      const t = svgEl("text", { x: x + (nte.dx || 0), y: y + dy, "text-anchor": nte.anchor || "middle", "font-size": 11, fill: "#e0c178" });
      t.textContent = nte.text; svg.appendChild(t);
    });
    // legend
    if (series.length > 1) {
      const lg = svgEl("g");
      let x = m.l;
      series.forEach((s) => {
        lg.appendChild(svgEl("rect", { x, y: H - 16, width: 16, height: 3, fill: s.color }));
        const t = svgEl("text", { x: x + 22, y: H - 11, "font-size": 11.5, fill: "#b3a892" }); t.textContent = s.name; lg.appendChild(t);
        x += 34 + s.name.length * 6.4;
      });
      svg.appendChild(lg);
    }
    return svg;
  }

  function renderStyle() {
    const S = P.style; if (!S) return;
    const host = $("#style-body"); host.innerHTML = "";
    const sec = (h, lead) => { host.appendChild(el("h2", "section", h)); if (lead) host.appendChild(el("p", "lead", lead)); };
    const fig = (node, cap) => { const f = el("figure", "figure"); f.appendChild(node); if (cap) f.appendChild(el("figcaption", null, cap)); host.appendChild(f); };

    host.appendChild(el("p", "lead",
      "Joyce's stated principle was that the style must change with the growth of the mind it belongs to. That is an unusual thing for a novelist to claim, because it is <strong>checkable</strong>. Everything on this page is computed from " +
      `<a href="source/portrait-gutenberg-4217.txt">the source text</a> by <a href="measure/measure.mjs">measure/measure.mjs</a> — ${S.generated.words.toLocaleString()} words, ` +
      `${S.sections.length} movements — and re-running the script reproduces the numbers exactly. None of it is an interpretation until the last paragraph of each section, which is marked.`));

    const labels = S.sections.map((s) => s.id);
    const bands = CHAPTERS.map((c) => {
      const idxs = S.sections.map((s, i) => (s.chapter === c ? i : -1)).filter((i) => i >= 0);
      return { chapter: c, from: idxs[0], to: idxs[idxs.length - 1] };
    });
    const val = (k) => S.sections.map((s) => s[k]);
    const first = S.sections[0], last = S.sections[S.sections.length - 1];
    const peak = S.sections.reduce((a, b) => (b.meanSentence > a.meanSentence ? b : a));

    /* 1 · the sawtooth */
    sec("1 · The prose does not grow up. It climbs and collapses, four times.",
      "Mean words per sentence, movement by movement. A Künstlerroman is supposed to produce a rising line — the style maturing with its subject. This is not a rising line.");
    fig(lineChart({
      labels, bands, series: [{ name: "words per sentence", values: val("meanSentence"), color: "#d9a441" }],
      ylabel: "mean words per sentence", rule: first.meanSentence, ruleLabel: `I.1, the infant overture — ${first.meanSentence}`,
      notes: [
        { at: S.sections.indexOf(peak), value: peak.meanSentence, text: `${peak.id} — ${peak.meanSentence}`, dx: -14, anchor: "end" },
        { at: S.sections.length - 1, value: last.meanSentence, text: `${last.id} — ${last.meanSentence}`, anchor: "end", dx: -6, below: true },
      ],
    }), "Four ascents, each broken: I.4 → II.1, III.2 → III.3 (the confession), IV.1 → IV.3, V.1 → V.4. The dashed line is the opening movement's own value.");
    host.appendChild(el("div", "finding",
      `<strong>The finding.</strong> The peak is <strong>${peak.id}</strong> at ${peak.meanSentence} words a sentence — the devotional timetable — and the book's last movement, the diary, runs at <strong>${last.meanSentence}</strong>. ` +
      `That is <em>below</em> the ${first.meanSentence} of the infant overture that opens the novel. The artist's prose ends simpler than the baby's. ` +
      "Read as growth, the curve fails. Read as Joyce's actual design — a series of borrowed voices, each outgrown and dropped — it is exactly right: the diary is the first prose in the book that is nobody else's, and it has almost no syntax because Stephen has just put down every syntax he was lent."));

    /* 2 · the parody at the peak */
    sec("2 · The most advanced prose in the novel is a parody.",
      "Four measures of syntactic elaboration, per movement. They agree with each other, and they all point at the same place.");
    fig(lineChart({
      labels, bands, height: 320,
      series: [
        { name: "polysyllabic words %", values: val("polysyllabic"), color: "#7fa3c9" },
        { name: "relative pronouns per 1,000", values: val("relative"), color: "#a58fd0" },
        { name: "direct speech, % of sentences", values: val("speech"), color: "#7fb37f" },
      ],
      ylabel: "rate",
      notes: [{ at: labels.indexOf("IV.1"), value: 12.37, text: "IV.1", anchor: "middle" }],
    }), "IV.1 is the maximum for polysyllables and for subordination, and its 1.5% direct speech is the lowest of any movement except the diary — the most written prose in the book.");
    host.appendChild(el("div", "finding",
      "<strong>The finding, and the problem with it.</strong> By every stylometric measure available, the most sophisticated passage in <em>A Portrait of the Artist as a Young Man</em> is IV.1 — the devotional timetable, the rosaries counted on the fingers, the ledger of grace poured into a heavenly cashbox. 38.3 words a sentence, 12.4% polysyllables and 9.9 relative pronouns per thousand — three book maxima in one movement — and at 1.5% direct speech the least spoken prose in the novel apart from the diary. " +
      "And it is a <em>parody</em>. Joyce is copying out the prose of a devotional manual in order to show a boy being buried in it. " +
      "<span class=\"finding-em\">The measure and the meaning point in opposite directions, and locating that divergence exactly is what this whole modernist apparatus is for.</span> " +
      "A folk tale never does this — its style and its meaning agree, because a formula means what a formula means. In <em>Portrait</em> the prose is always somebody else's, so sophistication is evidence of capture, not of growth. Any purely quantitative reading of this novel will rank its most enslaved page highest. That is not a failure of measurement; it is the thing worth knowing about the book."));

    /* 3 · the transfer */
    sec("3 · The priesthood is not renounced. It is transferred.",
      "Two lexicons per chapter, per 10,000 words: the religious (soul, sin, grace, God, priest, holy…) against the aesthetic (beauty, art, artist, image, imagination, radiance…).");
    const soul = motifStat("soul"), art = motifStat("art");
    fig(lineChart({
      labels: CHAPTERS.map((c) => "Chapter " + c), height: 280,
      series: [
        { name: "religious lexicon", values: soul.byChapter, color: "#c25b4a" },
        { name: "aesthetic lexicon", values: art.byChapter, color: "#7fb37f" },
      ], ylabel: "hits per 10,000 words",
    }), "The religious lexicon floods Chapter III, stays high through Chapter IV, and drains in Chapter V.");
    fig(lineChart({
      labels: CHAPTERS.map((c) => "Chapter " + c), height: 240,
      series: [{ name: "religious ÷ aesthetic", values: S.transfer, color: "#d9a441" }],
      ylabel: "ratio", rule: 1, ruleLabel: "parity — below this line, art outweighs God",
      notes: [{ at: 4, value: S.transfer[4], text: `Chapter V — ${S.transfer[4]}`, anchor: "end", dx: -8 }],
    }), "The same two lexicons as a ratio. It crosses 1 exactly once, and only at the end.");
    host.appendChild(el("div", "finding",
      `<strong>The finding.</strong> Religious vocabulary outnumbers aesthetic vocabulary <strong>${S.transfer[2]} to 1</strong> during the retreat and <strong>${S.transfer[3]} to 1</strong> during the devotional life. In Chapter V the ratio is <strong>${S.transfer[4]}</strong> — the only chapter in the book where art outweighs God, and it arrives on the far side of the refused ordination. ` +
      "The reading this supports is not that Stephen escapes the Church. It is Girard's: the model is not abandoned, it is inherited. Stephen describes his art in the exact office he turned down — <em>a priest of eternal imagination, transmuting the daily bread of experience into the radiant body of everlasting life</em> — and even the word <strong>epiphany</strong>, on which his whole aesthetic rests, is a feast of the Church. The villanelle he writes in V.2 is built out of chalices and seraphim. See the <a href=\"#desire\">Desire</a> page."));

    /* 4 · the parataxis test */
    const PT = S.parataxis;
    sec("4 · Joyce's ecstasies chant. His openings explain.",
      "Hugh Kenner's reading of the novel (“The Portrait in Perspective”, 1948) is that every chapter closes on an exaltation which the next chapter's opening deflates. That is a claim about rhetoric, so it should leave a trace in the prose. It does — but not where you would look for it.");
    const tbl = el("table", "ptable");
    tbl.innerHTML = "<thead><tr><th>Chapter</th><th>closing 400 words</th><th>next chapter's opening 400</th><th>chapter mean</th><th>percentile of its own chapter</th><th>one-tailed p</th></tr></thead>";
    const tb = el("tbody");
    PT.rows.forEach((r, i) => {
      const nxt = PT.rows[i + 1];
      const tr = el("tr");
      tr.innerHTML = `<td><strong>${r.chapter}</strong></td><td class="num hot">${r.close}</td><td class="num">${nxt ? nxt.open : "—"}</td><td class="num">${r.chapterMean}</td><td class="num">${r.percentile}%</td><td class="num">${r.p}</td>`;
      tb.appendChild(tr);
    });
    tbl.appendChild(tb);
    const fg = el("figure", "figure"); fg.appendChild(tbl);
    fg.appendChild(el("figcaption", null, `Rate of the word <em>and</em> per 1,000 words. Each closing is compared against ${PT.draws.toLocaleString()} random ${PT.windowWords}-word windows drawn from its own chapter.`));
    host.appendChild(fg);
    host.appendChild(el("div", "finding",
      "<strong>Where it is not.</strong> Sentence length does not show the pattern at all: chapter openings are mostly <em>longer</em>-sentenced than the closings they follow (the movement closing Chapter III runs at 11.0 words a sentence and the one opening Chapter IV at 38.3). If Kenner's deflation were a matter of syntactic simplification, it would be false.<br><br>" +
      "<strong>Where it is.</strong> It is in <em>coordination</em>. All five chapter-closings sit above their own chapter's mean rate of <em>and</em>, four of the five in the top 15% of their chapter's windows, and combining the five one-tailed p-values by Fisher's method gives " +
      `X² = ${PT.fisher.X2} on ${PT.fisher.df} degrees of freedom, <strong>p = ${PT.fisher.p}</strong>. Joyce's exaltations are paratactic — <em>and … and … and</em>, the cadence of the King James Bible — and his chapter openings are hypotactic and explanatory. The endings chant; the beginnings explain. ` +
      "<br><br><strong>How much to believe.</strong> Not as much as the p-value suggests. The metric was chosen <em>after</em> looking at the section table, which is exactly the procedure that manufactures significant results, and five chapters is five chapters. Treat it as a measurement that supports a reading rather than a proof of one. " +
      "The single most interesting row is the exception: <strong>Chapter II</strong>, at the 70.8th percentile where the others reach 97.5, 96.7, 89.3 and 84.8. Chapter II is the one that ends not in flight but in surrender — the prostitute's kiss — and the prose does not chant, it dissolves. The measure caught a difference in kind that the reading had already noticed."));

    /* 5 · the full table */
    sec("5 · The measurements", "Everything the script produces, per movement. Sort order is the novel's.");
    const full = el("div", "tablewrap");
    const t2 = el("table", "ptable");
    const cols = [["id", "movement"], ["words", "words"], ["sentences", "sentences"], ["meanSentence", "mean sentence"], ["medianSentence", "median"], ["sdSentence", "s.d."], ["meanWordLen", "word length"], ["polysyllabic", "poly %"], ["ttr", "type-token"], ["comma", "commas/1k"], ["colon", "colons/1k"], ["and", "and/1k"], ["relative", "rel. pron./1k"], ["speech", "speech %"]];
    t2.innerHTML = "<thead><tr>" + cols.map(([, l]) => `<th>${l}</th>`).join("") + "</tr></thead>";
    const tb2 = el("tbody");
    S.sections.forEach((s) => {
      const tr = el("tr");
      tr.style.borderLeft = "3px solid " + CH_COLOR[s.chapter];
      tr.innerHTML = cols.map(([k], i) => i === 0
        ? `<td><a data-passage="${idToIndex[s.id]}">${s[k]}</a></td>`
        : `<td class="num">${s[k] == null ? "—" : s[k]}</td>`).join("");
      tb2.appendChild(tr);
    });
    t2.appendChild(tb2); full.appendChild(t2); host.appendChild(full);
    host.appendChild(el("p", "tree-hint",
      `Type-token ratio is standardised over consecutive 500-word windows and is left blank where a movement is shorter than one window (I.1, 293 words). Source: ${escapeHtml(S.generated.edition)}.`));
  }

  /* ====================== THE MYTHOGRAPH ======================
     One typed multigraph over the whole annotation layer. Same machinery as the
     medieval tales, one new node type: `register`, the five chapter styles,
     which exist here because in this book the prose is a character. */
  function buildMythograph() {
    const nodes = [], edges = [], id2i = {};
    const add = (id, full, label, type, link, preview) => { id2i[id] = nodes.length; nodes.push({ id, full, label, type, link, preview }); };

    PASS.forEach((p, i) => add("mv-" + (i + 1), p.title, p.id, "movement", { passage: i + 1 }, p.sub || ""));
    (P.style.chapters || []).forEach((c) => add("rg-" + c.id, `Chapter ${c.id} — the register`, "Ch " + c.id, "register", { tab: "style" },
      `${c.meanSentence} words per sentence · ${c.polysyllabic}% polysyllabic · ${c.and} “and” per 1,000 · ${c.speech}% direct speech`));
    P.characters.cast.forEach((c) => add("ch-" + c.id, c.name, c.name, "character", { char: c.id }, c.blurb || ""));
    P.motifs.list.forEach((m) => add("mo-" + m.key, m.code + " — " + m.name, m.code, "motif", { tab: "motifs" }, m.gloss || ""));
    P.discourse.moves.forEach((mv, i) => add("dc-" + i, mv.sym + " · " + mv.name, mv.sym, "discourse", { tab: "discourse", anchor: "discourse-move-" + i }, mv.realized || ""));
    (P.epiphanies.rungs || []).forEach((r) => add("ep-" + r.id, "Epiphany · " + r.label, "✦", "epiphany", { tab: "epiphanies" }, r.note || ""));
    if (P.desire) add("de-obj", "The Object of desire — " + P.desire.object, "✦", "desire", { tab: "desire" }, (P.desire.value ? P.desire.value + ". " : "") + (P.desire.note || ""));

    const edge = (a, b, type, dashed) => { if (id2i[a] == null || id2i[b] == null) return; edges.push({ a: id2i[a], b: id2i[b], type, dashed: !!dashed }); };

    P.characters.cast.forEach((c) => (c.appears || []).forEach((n) => edge("ch-" + c.id, "mv-" + n, "appears")));
    const seen = {};
    P.characters.cast.forEach((c) => (c.rel || []).forEach((r) => {
      const k = [c.id, r.to].sort().join("|"); if (seen[k]) return; seen[k] = 1; edge("ch-" + c.id, "ch-" + r.to, "relates");
    }));
    // EXHIBITS edges are drawn from the measured densities, not asserted by hand.
    P.motifs.list.forEach((m) => {
      const stat = motifStat(m.key); if (!stat) return;
      stat.topSections.forEach((sid) => { const n = idToIndex[sid]; if (n) edge("mo-" + m.key, "mv-" + n, "exhibits"); });
    });
    P.discourse.moves.forEach((mv, i) => edge("dc-" + i, "mv-" + mv.passage, "realizes"));
    (P.epiphanies.rungs || []).forEach((r) => {
      edge("ep-" + r.id, "mv-" + r.passage, "stages");
      if (r.next) edge("ep-" + r.id, "mv-" + r.next, "deflates", true);
    });
    PASS.forEach((p, i) => edge("rg-" + p.chapter, "mv-" + (i + 1), "governs"));
    if (P.desire) {
      const A = P.desire, used = {};
      const link = (ref, type, dashed) => { if (ref && !used[ref]) { used[ref] = 1; edge("ch-" + ref, "de-obj", type, dashed); } };
      link(A.subjectRef, "desires", A.unreachable);
      (A.helpers || []).forEach((h) => link(h.ref, "actant"));
    }
    for (let i = 1; i < PASS.length; i++) edge("mv-" + i, "mv-" + (i + 1), "spine");
    return { nodes, edges };
  }

  const MYTH_TYPE = {
    movement:  { color: "#d9a441", label: "Movements",  r: 15 },
    register:  { color: "#e0c178", label: "Registers",  r: 13 },
    character: { color: "#7fa3c9", label: "Claimants",  r: 9 },
    motif:     { color: "#c97f9a", label: "Leitmotifs", r: 7 },
    discourse: { color: "#a58fd0", label: "Discourse",  r: 6 },
    epiphany:  { color: "#c97f6a", label: "Epiphanies", r: 8 },
    desire:    { color: "#7fb37f", label: "Desire",     r: 11 },
  };
  const MYTH_EDGE = { spine: "#d8b24a", governs: "#e0c178", appears: "#7fa3c9", relates: "#9a8fd0", exhibits: "#c97f9a", realizes: "#a58fd0", stages: "#c97f6a", deflates: "#c25b4a", desires: "#7fb37f", actant: "#8a7fa8" };

  function renderMythograph() {
    const g = buildMythograph(), nodes = g.nodes, edges = g.edges;
    const active = {}; Object.keys(MYTH_TYPE).forEach((t) => active[t] = true);
    const mobile = (window.innerWidth || 900) < 640;
    const R = (n) => MYTH_TYPE[n.type].r;
    let selected = null, selGroup = null, grown = [];
    let alpha = 1, running = false, simReady = false;
    const sim = { L: 90, charge: -1000 };

    const fhost = $("#myth-filters"); fhost.innerHTML = "";
    Object.keys(MYTH_TYPE).forEach((t) => {
      const b = el("button", "myth-filter active", `<span class="dot" style="background:${MYTH_TYPE[t].color}"></span>${MYTH_TYPE[t].label}`);
      b.onclick = () => { active[t] = !active[t]; b.classList.toggle("active", active[t]); applyVis(); };
      fhost.appendChild(b);
    });
    const sliders = el("div", "myth-sliders");
    function addSlider(labelTxt, min, max, val, onIn) {
      const wrap = el("div", "myth-slider");
      wrap.appendChild(el("label", null, labelTxt));
      const inp = document.createElement("input"); inp.type = "range"; inp.min = min; inp.max = max; inp.value = val;
      const out = el("span", "myth-slval", "");
      inp.addEventListener("input", () => { onIn(+inp.value, out); reheat(); });
      wrap.appendChild(inp); wrap.appendChild(out); onIn(+inp.value, out); sliders.appendChild(wrap);
    }
    addSlider("Link length", 0, 100, 18, (v, out) => { sim.L = 24 + v * 2.4; out.textContent = Math.round(sim.L); });
    addSlider("Repulsion", 0, 100, 46, (v, out) => { sim.charge = -(60 + v * 26); out.textContent = v; });
    fhost.appendChild(sliders);

    const leg = $("#myth-legend"); leg.innerHTML = "";
    [["spine", "the narrative spine (I.1 → V.4)"], ["governs", "register → its movements"], ["appears", "claimant → movement"], ["relates", "claimant ↔ claimant"],
     ["exhibits", "leitmotif → where it is densest"], ["realizes", "discourse category → movement"], ["stages", "epiphany → the chapter it closes"],
     ["deflates", "epiphany → the movement that undercuts it"], ["desires", "Subject → Object (unreachable)"], ["actant", "actant → Object"]]
      .forEach(([k, lab]) => leg.appendChild(el("span", "li", `<span class="edgekey${k === "spine" ? " edgekey-spine" : ""}" style="background:${MYTH_EDGE[k]}"></span>${lab}`)));

    nodes.forEach((n, i) => { const a = 2 * Math.PI * i / nodes.length; n.x = Math.cos(a) * 160; n.y = Math.sin(a) * 160; n.vx = 0; n.vy = 0; });
    const svg = svgEl("svg", { class: "myth" }); const layer = svgEl("g", { class: "zl" }); svg.appendChild(layer);
    const edgeObjs = [], adj = {};
    edges.forEach((e, ei) => {
      const sp = e.type === "spine";
      const line = svgEl("line", { class: sp ? "myth-spine" : "", stroke: MYTH_EDGE[e.type], "stroke-opacity": sp ? 0.72 : 0.22, "stroke-width": sp ? 2.6 : 1, "stroke-dasharray": e.dashed ? "5 4" : "0" });
      layer.appendChild(line); edgeObjs.push(line);
      (adj[e.a] = adj[e.a] || []).push(ei); (adj[e.b] = adj[e.b] || []).push(ei);
    });
    const nodeObjs = [], shapes = [];
    nodes.forEach((n, i) => {
      const T = MYTH_TYPE[n.type];
      const grp = svgEl("g", { class: "myth-node", transform: `translate(${n.x} ${n.y})` });
      let shapeEl, tag;
      if (n.type === "movement" || n.type === "register") {
        shapeEl = svgEl("rect", { x: -T.r, y: -T.r, width: T.r * 2, height: T.r * 2, rx: n.type === "register" ? 11 : 5, fill: T.color, "fill-opacity": 0.9, stroke: "#14110d", "stroke-width": 1.5 });
        grp.appendChild(shapeEl); tag = "rect";
        const lab = svgEl("text", { x: 0, y: 4, "text-anchor": "middle", "font-size": n.type === "register" ? 10 : 9.5, fill: "#14110d", "font-weight": "700" });
        lab.textContent = n.label; grp.appendChild(lab);
      } else {
        shapeEl = svgEl("circle", { cx: 0, cy: 0, r: T.r, fill: T.color, "fill-opacity": 0.85, stroke: "#14110d", "stroke-width": 1.2 });
        grp.appendChild(shapeEl); tag = "circle";
      }
      shapes.push({ el: shapeEl, tag: tag, r: T.r });
      const ttl = svgEl("title"); ttl.textContent = n.full; grp.appendChild(ttl);
      grp.addEventListener("mouseenter", () => highlight(i));
      grp.addEventListener("mouseleave", () => { selected != null ? highlight(selected) : clearHi(); });
      grp.addEventListener("click", () => select(i));
      layer.appendChild(grp); nodeObjs.push(grp);
    });

    function highlight(i) {
      const keep = new Set([i]); const inc = new Set();
      (adj[i] || []).forEach((ei) => { inc.add(ei); keep.add(edges[ei].a); keep.add(edges[ei].b); });
      edgeObjs.forEach((l, ei) => l.classList.toggle("hot", inc.has(ei)));
      nodeObjs.forEach((gp, ni) => gp.classList.toggle("dim", active[nodes[ni].type] && !keep.has(ni)));
    }
    function clearHi() { edgeObjs.forEach((l) => l.classList.remove("hot")); nodeObjs.forEach((gp) => gp.classList.remove("dim")); }
    function applyVis() {
      nodeObjs.forEach((gp, ni) => gp.style.display = active[nodes[ni].type] ? "" : "none");
      edgeObjs.forEach((l, ei) => l.style.display = (active[nodes[edges[ei].a].type] && active[nodes[edges[ei].b].type]) ? "" : "none");
    }
    const stripTags = (s) => String(s || "").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&mdash;/g, "—").replace(/&[a-z]+;/g, " ").trim();
    const truncate = (s, n) => s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : s;
    function wrapText(s, max) { const w = s.split(/\s+/), lines = []; let cur = ""; w.forEach((word) => { if ((cur + " " + word).trim().length > max) { if (cur) lines.push(cur); cur = word; } else cur = (cur + " " + word).trim(); }); if (cur) lines.push(cur); return lines; }
    function growNode(i) { const s = shapes[i], f = 1.8; if (s.tag === "circle") s.el.setAttribute("r", s.r * f); else { s.el.setAttribute("x", -s.r * f); s.el.setAttribute("y", -s.r * f); s.el.setAttribute("width", s.r * 2 * f); s.el.setAttribute("height", s.r * 2 * f); } grown.push(i); }
    function resetGrown() { grown.forEach((i) => { const s = shapes[i]; if (s.tag === "circle") s.el.setAttribute("r", s.r); else { s.el.setAttribute("x", -s.r); s.el.setAttribute("y", -s.r); s.el.setAttribute("width", s.r * 2); s.el.setAttribute("height", s.r * 2); } }); grown = []; }
    function neighborLabel(n) { const t = svgEl("text", { class: "myth-label", x: n.x, y: n.y - R(n) * 1.8 - 6, "text-anchor": "middle", "font-size": 11 }); t.textContent = truncate(stripTags(n.full), 26); return t; }
    function previewCard(n) {
      const g2 = svgEl("g"), lh = 15, padc = 9, cw = 214;
      const titleLines = wrapText(stripTags(n.full), 30), bodyLines = wrapText(truncate(stripTags(n.preview), 190), 33);
      const th = titleLines.length * 15, h = padc * 2 + th + 6 + bodyLines.length * lh;
      const bx = n.x + R(n) * 1.8 + 12, by = n.y - h / 2;
      g2.appendChild(svgEl("rect", { x: bx, y: by, width: cw, height: h, rx: 8, fill: "#1c1813", stroke: "#d9a441", "stroke-width": 1.2 }));
      const tt = svgEl("text", { "font-size": 12.5, fill: "#e0c178", "font-weight": "700" });
      titleLines.forEach((ln, idx) => { const ts = svgEl("tspan", { x: bx + padc, y: by + padc + 12 + idx * 15 }); ts.textContent = ln; tt.appendChild(ts); });
      g2.appendChild(tt);
      const bt = svgEl("text", { class: "myth-pvbody", "font-size": 11.5, fill: "#b3a892" });
      bodyLines.forEach((ln, idx) => { const ts = svgEl("tspan", { x: bx + padc, y: by + padc + th + 18 + idx * lh }); ts.textContent = ln; bt.appendChild(ts); });
      g2.appendChild(bt);
      return g2;
    }
    function clearSel() { if (selGroup) { selGroup.remove(); selGroup = null; } resetGrown(); }
    function select(i) {
      running = false; alpha = 0; clearSel(); selected = i; highlight(i); fillDetail(i);
      selGroup = svgEl("g", { class: "myth-sel" }); layer.appendChild(selGroup);
      const nb = []; (adj[i] || []).forEach((ei) => { const e = edges[ei], o = e.a === i ? e.b : e.a; if (active[nodes[o].type] && nb.indexOf(o) < 0) nb.push(o); });
      nb.forEach((o) => { growNode(o); selGroup.appendChild(neighborLabel(nodes[o])); });
      growNode(i);
      selGroup.appendChild(previewCard(nodes[i]));
    }

    function fillDetail(i) {
      const n = nodes[i], d = $("#myth-detail"); d.innerHTML = "";
      d.appendChild(el("div", "md-type", MYTH_TYPE[n.type].label.replace(/s$/, "")));
      d.appendChild(el("h3", "md-title", escapeHtml(n.full)));
      const open = el("div", "md-open");
      if (n.link.passage) { const a = el("a", null, "→ Read this movement"); a.setAttribute("data-passage", n.link.passage); open.appendChild(a); }
      else if (n.link.char) { const a = el("a", null, "→ Character card"); a.setAttribute("data-char", n.link.char); open.appendChild(a); }
      else if (n.link.tab) {
        const names = { motifs: "→ In the leitmotif index", discourse: "→ In the discourse graph", desire: "→ The Desire diagram", style: "→ On the style curve", epiphanies: "→ On the epiphany ladder" };
        const a = el("a", null, names[n.link.tab] || "→ Open");
        a.onclick = () => { switchView(n.link.tab); if (n.link.anchor) setTimeout(() => { const c = $("#" + n.link.anchor); if (c) c.scrollIntoView({ behavior: "smooth", block: "center" }); }, 40); };
        open.appendChild(a);
      }
      d.appendChild(open);
      if (n.preview) d.appendChild(el("p", "md-preview", n.preview));
      const groups = {};
      (adj[i] || []).forEach((ei) => { const e = edges[ei]; const other = e.a === i ? e.b : e.a; (groups[e.type] = groups[e.type] || []).push(other); });
      const GLAB = { spine: "In sequence", governs: "Governs", appears: "Appears in", relates: "Related to", exhibits: "Densest in", realizes: "Realised in", stages: "Closes", deflates: "Deflated by", desires: "Desire reaches toward", actant: "Bears on the desire of" };
      const order = ["spine", "governs", "appears", "exhibits", "realizes", "stages", "deflates", "relates", "desires", "actant"];
      order.forEach((t) => {
        if (!groups[t]) return;
        const sec2 = el("div", "md-group");
        sec2.appendChild(el("span", "md-glabel", GLAB[t] + ": "));
        groups[t].forEach((oi, idx) => {
          const chip = el("a", "md-chip"); chip.innerHTML = escapeHtml(nodes[oi].full);
          chip.onclick = () => select(oi);
          sec2.appendChild(chip);
          if (idx < groups[t].length - 1) sec2.appendChild(document.createTextNode(" "));
        });
        d.appendChild(sec2);
      });
    }

    const stiffness = 0.34, velDecay = 0.62, alphaDecay = 0.028, alphaMin = 0.004;
    const cstrX = mobile ? 0.13 : 0.04, cstrY = 0.04;
    const clampv = (v) => v > 40 ? 40 : (v < -40 ? -40 : v);
    const raf = (window.requestAnimationFrame ? window.requestAnimationFrame.bind(window) : (fn) => setTimeout(fn, 16));
    function step() {
      const a = alpha;
      for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
        let dx = nodes[j].x - nodes[i].x, dy = nodes[j].y - nodes[i].y, d2 = dx * dx + dy * dy; if (d2 < 25) d2 = 25;
        const w = sim.charge * a / d2, fx = dx * w, fy = dy * w;
        nodes[i].vx += fx; nodes[i].vy += fy; nodes[j].vx -= fx; nodes[j].vy -= fy;
      }
      edges.forEach((e) => { const A = nodes[e.a], B = nodes[e.b]; let dx = B.x - A.x, dy = B.y - A.y, d = Math.sqrt(dx * dx + dy * dy) || 0.01; const sp = e.type === "spine"; const L = sp ? Math.max(sim.L * 1.5, 130) : sim.L, st = sp ? 0.62 : stiffness; const l = (d - L) / d * a * st, fx = dx * l * 0.5, fy = dy * l * 0.5; A.vx += fx; A.vy += fy; B.vx -= fx; B.vy -= fy; });
      for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
        let dx = nodes[i].x - nodes[j].x, dy = nodes[i].y - nodes[j].y, d = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const min = R(nodes[i]) + R(nodes[j]) + 6;
        if (d < min) { const p = (min - d) / d * a, fx = dx * p, fy = dy * p; nodes[i].vx += fx; nodes[i].vy += fy; nodes[j].vx -= fx; nodes[j].vy -= fy; }
      }
      nodes.forEach((n) => { n.vx += (-n.x) * cstrX * a; n.vy += (-n.y) * cstrY * a; n.x += clampv(n.vx); n.y += clampv(n.vy); n.vx *= velDecay; n.vy *= velDecay; });
      alpha += (0 - alpha) * alphaDecay;
    }
    function paint() {
      for (let i = 0; i < nodeObjs.length; i++) nodeObjs[i].setAttribute("transform", `translate(${nodes[i].x.toFixed(1)} ${nodes[i].y.toFixed(1)})`);
      for (let ei = 0; ei < edgeObjs.length; ei++) { const e = edges[ei], l = edgeObjs[ei]; l.setAttribute("x1", nodes[e.a].x.toFixed(1)); l.setAttribute("y1", nodes[e.a].y.toFixed(1)); l.setAttribute("x2", nodes[e.b].x.toFixed(1)); l.setAttribute("y2", nodes[e.b].y.toFixed(1)); }
    }
    function bounds() { let a = 1e9, b = 1e9, c = -1e9, d = -1e9; nodes.forEach((n) => { if (n.x < a) a = n.x; if (n.y < b) b = n.y; if (n.x > c) c = n.x; if (n.y > d) d = n.y; }); return { x: a, y: b, w: (c - a) || 1, h: (d - b) || 1 }; }
    function frame() {
      step(); paint();
      if (alpha > 0.12 && zoomers.myth) zoomers.myth.fit();
      if (alpha > alphaMin && running) raf(frame);
      // One last fit once the layout has settled: the graph keeps spreading
      // after the fitting window closes, and without this the settled figure
      // sits off-centre with 87 nodes on it.
      else { running = false; if (zoomers.myth) zoomers.myth.fit(); }
    }
    function reheat() { if (!simReady) return; if (selected != null) { clearSel(); selected = null; clearHi(); } alpha = Math.max(alpha, 0.7); if (!running) { running = true; raf(frame); } }

    for (let w = 0; w < 30; w++) step();
    const host = $("#myth-host"); host.innerHTML = ""; host.appendChild(svg); paint();
    zoomers.myth = attachZoom(svg, layer, bounds, host);
    $("#myth-detail").innerHTML = '<div class="md-hint">A live force simulation — tune <em>link length</em> and <em>repulsion</em> above. Hover a node to light its threads; click any node to freeze the layout and preview what it touches. The <strong>register</strong> nodes are the five chapter styles: they exist on this graph because in this novel the prose is one of the characters.</div>';
    simReady = true; running = true; raf(frame);
  }

  /* ====================== DESIRE (Greimas + Girard) ====================== */
  function renderDesire() {
    const A = P.desire; if (!A) return;
    $("#desire-intro").innerHTML = A.intro;
    const W = 760, H = 380, NW = 196, NH = 66;
    const pos = {
      sender: { x: 130, y: 78 }, object: { x: 380, y: 78 }, receiver: { x: 630, y: 78 },
      helper: { x: 130, y: 300 }, subject: { x: 380, y: 300 }, opponent: { x: 630, y: 300 },
    };
    const helperLabel = (A.helpers && A.helpers.length) ? A.helpers.map((h) => h.name).join(", ") : "(none)";
    const label = {
      sender: ["Sender", A.sender], object: ["Object", A.object], receiver: ["Receiver", A.receiver],
      helper: ["Helper", helperLabel], subject: ["Subject", A.subject], opponent: ["Opponent", A.opponent],
    };
    const svg = svgEl("svg", { class: "desire", viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "xMidYMid meet" });
    const defs = svgEl("defs");
    const mk = svgEl("marker", { id: "dar", viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" });
    mk.appendChild(svgEl("path", { d: "M0 0 L10 5 L0 10 z", fill: "#8a7f6b" })); defs.appendChild(mk); svg.appendChild(defs);
    const mkText = (x, y, s, size, fill, italic) => { const tx = svgEl("text", { x, y, "text-anchor": "middle", "font-size": size, fill }); if (italic) tx.setAttribute("font-style", "italic"); tx.textContent = s; return tx; };
    function edge(a, b, dashed) {
      const A1 = pos[a], B1 = pos[b]; let x1 = A1.x, y1 = A1.y, x2 = B1.x, y2 = B1.y;
      if (y1 === y2) { const d = x2 > x1 ? 1 : -1; x1 += d * NW / 2; x2 -= d * NW / 2; }
      else { const dy = y2 > y1 ? 1 : -1; y1 += dy * NH / 2; y2 -= dy * NH / 2; }
      svg.appendChild(svgEl("line", { x1, y1, x2, y2, stroke: "#8a7f6b", "stroke-width": 1.6, "stroke-dasharray": dashed ? "6 5" : "0", "marker-end": "url(#dar)" }));
    }
    edge("sender", "object"); edge("object", "receiver");
    edge("helper", "subject"); edge("opponent", "subject");
    edge("subject", "object", A.unreachable);
    svg.appendChild(mkText(W / 2, 28, "the axis of transmission", 12.5, "#8a7f6b", true));
    svg.appendChild(mkText(W - 132, H / 2, A.unreachable ? "desire (it cannot reach)" : "the axis of desire", 12.5, "#8a7f6b", true));
    svg.appendChild(mkText(W / 2, H - 12, "the axis of power", 12.5, "#8a7f6b", true));
    const full = { sender: A.sender, object: A.object, receiver: A.receiver, helper: helperLabel, subject: A.subject, opponent: A.opponent };
    const wrap2 = (s, max) => {
      if (s.length <= max) return [s];
      const words = s.split(" "); let a = "", b = "";
      words.forEach((w) => { if (!b && (a + " " + w).trim().length <= max) a = (a + " " + w).trim(); else b = (b + " " + w).trim(); });
      if (b.length > max) b = b.slice(0, max - 1).replace(/\s\S*$/, "") + "…";
      return b ? [a, b] : [a];
    };
    const roleText = {
      subject: "SUBJECT · who wants", object: "OBJECT · what is wanted", receiver: "RECEIVER · who gains if it succeeds",
      sender: "SENDER · who sets the wanting in motion", helper: "HELPER · what aids the wanting", opponent: "OPPONENT · what stands against it",
    };
    let det;
    function showDetail(k, col) {
      let body;
      if (k === "helper" && A.helpers && A.helpers.length) body = A.helpers.map((h) => h.note ? `<strong>${escapeHtml(h.name)}</strong> — ${h.note}` : `<strong>${escapeHtml(h.name)}</strong>`).join("<br>");
      else if (k === "object") body = `<strong>${escapeHtml(A.object)}</strong> <span class="dd-val">— beneath the plot, <em>${escapeHtml(A.value)}</em></span>`;
      else body = `<strong>${escapeHtml(full[k])}</strong>`;
      det.innerHTML = `<span class="dd-role" style="color:${col}">${roleText[k] || k}</span><span class="dd-body">${body}</span>`;
    }
    Object.keys(pos).forEach((k) => {
      const p = pos[k];
      const col = k === "subject" ? "#d9a441" : k === "object" ? "#c97f9a" : k === "opponent" ? "#c25b4a" : "#7fa3c9";
      const g = svgEl("g", { class: "desire-node" });
      g.appendChild(svgEl("rect", { x: p.x - NW / 2, y: p.y - NH / 2, width: NW, height: NH, rx: 9, fill: col, "fill-opacity": 0.14, stroke: col, "stroke-width": 1.5 }));
      g.appendChild(mkText(p.x, p.y - NH / 2 + 16, label[k][0].toUpperCase(), 11, col));
      const lines = wrap2(label[k][1], 28);
      if (lines.length === 1) g.appendChild(mkText(p.x, p.y + 10, lines[0], 12, "#e8e0d2"));
      else { g.appendChild(mkText(p.x, p.y + 4, lines[0], 11.5, "#e8e0d2")); g.appendChild(mkText(p.x, p.y + 20, lines[1], 11.5, "#e8e0d2")); }
      const ttl = svgEl("title"); ttl.textContent = label[k][0] + ": " + full[k]; g.appendChild(ttl);
      g.style.cursor = "pointer";
      g.addEventListener("click", () => showDetail(k, col));
      svg.appendChild(g);
    });
    const host = $("#desire-host"); host.innerHTML = ""; host.appendChild(svg);
    det = el("div"); det.id = "desire-detail"; host.appendChild(det);
    showDetail("subject", "#d9a441");
    host.appendChild(el("p", "desire-hint", "Click any actant to expand it; hover for the full label."));

    /* Girard's triangle — the term the actantial model has no slot for. */
    const tri = $("#desire-triangle"); tri.innerHTML = "";
    tri.appendChild(el("h2", "section", "The mediator — what the actantial model cannot show"));
    const TW = 700, TH = 300;
    const t = svgEl("svg", { class: "desire", viewBox: `0 0 ${TW} ${TH}`, preserveAspectRatio: "xMidYMid meet" });
    const tdefs = svgEl("defs");
    const tmk = svgEl("marker", { id: "tar", viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" });
    tmk.appendChild(svgEl("path", { d: "M0 0 L10 5 L0 10 z", fill: "#8a7f6b" })); tdefs.appendChild(tmk); t.appendChild(tdefs);
    const pt = { subject: { x: 120, y: 235 }, object: { x: 580, y: 235 }, mediator: { x: 350, y: 62 } };
    const tline = (a, b, dashed) => t.appendChild(svgEl("line", {
      x1: pt[a].x, y1: pt[a].y, x2: pt[b].x, y2: pt[b].y, stroke: "#8a7f6b", "stroke-width": 1.7,
      "stroke-dasharray": dashed ? "6 5" : "0", "marker-end": "url(#tar)",
    }));
    tline("subject", "mediator"); tline("mediator", "object"); tline("subject", "object", true);
    const tnode = (k, title, body, col) => {
      const p = pt[k];
      const g = svgEl("g");
      g.appendChild(svgEl("rect", { x: p.x - 105, y: p.y - 30, width: 210, height: 60, rx: 9, fill: col, "fill-opacity": 0.14, stroke: col, "stroke-width": 1.5 }));
      const a = svgEl("text", { x: p.x, y: p.y - 10, "text-anchor": "middle", "font-size": 11, fill: col }); a.textContent = title; g.appendChild(a);
      const b = svgEl("text", { x: p.x, y: p.y + 10, "text-anchor": "middle", "font-size": 12.5, fill: "#e8e0d2" }); b.textContent = body; g.appendChild(b);
      t.appendChild(g);
    };
    tnode("subject", "SUBJECT", "Stephen", "#d9a441");
    tnode("mediator", "MEDIATOR · the model", A.mediator, "#c97f9a");
    tnode("object", "OBJECT", "authority over reality", "#7fb37f");
    const cap = svgEl("text", { x: 350, y: 288, "text-anchor": "middle", "font-size": 12, fill: "#8a7f6b", "font-style": "italic" });
    cap.textContent = "the dashed line is the desire we think is direct; the solid path is the one it actually takes";
    t.appendChild(cap);
    tri.appendChild(t);
    tri.appendChild(el("p", "desire-prose", A.mediatorNote));

    let s = `<strong>${escapeHtml(A.subject)}</strong> desires <strong>${escapeHtml(A.object)}</strong> — which is, beneath the plot, <em>${escapeHtml(A.value)}</em>. It is set in motion by <strong>${escapeHtml(A.sender)}</strong>, for <strong>${escapeHtml(A.receiver)}</strong>. `;
    if (A.helpers && A.helpers.length) {
      s += `<strong>${escapeHtml(A.helpers.map((h) => h.name).join(", "))}</strong> stand closest to the wanting — though none of them is a Helper in the folktale sense, and the diagram is straining to say so. `;
    }
    s += `<strong>${escapeHtml(A.opponent)}</strong> stands against it.`;
    $("#desire-prose").innerHTML = s + (A.note ? `<span class="desire-note">${A.note}</span>` : "");
  }

  /* ====================== METHOD ====================== */
  function renderMethod() {
    const host = $("#method-body"); if (host.dataset.done) return; host.dataset.done = "1";
    const S = P.style;
    host.innerHTML = `
      <p class="lead">This site has a house apparatus. Every annotated tale on it carries the same seven layers — source and translation, a cast and a character web, Propp's morphology, the Thompson Motif-Index, oral type-scenes, Greimas's actantial model, and a mythograph that computes one graph out of all of them. The apparatus was built for medieval narrative and it fits medieval narrative very well. Pointed at <em>A Portrait of the Artist as a Young Man</em>, four of the seven layers break outright. This page is the record of what broke, what replaced it, and what the replacement cost.</p>

      <h2 class="section">What broke</h2>
      <div class="mrow"><div class="mrow-k">Translation</div><div class="mrow-v"><strong>Broke: the column is empty.</strong> The book is in English. But the prose is never plainly Joyce's — it is continuously colonised by whoever is nearest, which Hugh Kenner named the <em>Uncle Charles Principle</em> in <em>Joyce's Voices</em> (1978). <strong>Replaced by voice attribution:</strong> the facing column names whose idiom the narration is wearing. Same job as a translation — telling you what language you are actually reading.</div></div>
      <div class="mrow"><div class="mrow-k">Propp's 31 functions</div><div class="mrow-v"><strong>Broke: almost nothing is realised.</strong> No villain, no donor, no interdiction, no struggle, no victory, no return. Propp is a morphology of <em>events</em> and this novel has almost none. <strong>Replaced by Genette's <em>Narrative Discourse</em> (1972)</strong> — order, duration, frequency, mood, voice — an inventory built by reading Proust, which behaves exactly like Propp's (finite, realised-or-absent, locatable) but describes <em>telling</em> instead of happening.</div></div>
      <div class="mrow"><div class="mrow-k">Thompson Motif-Index</div><div class="mrow-v"><strong>Broke: there is no index, and there cannot be one.</strong> A Thompson motif is meaningful because it is <em>shared</em> across a tradition; a leitmotif is meaningful because it is <em>local</em> to one book. <strong>Replaced by measurement:</strong> twelve lexicons counted off the text, normalised per 10,000 words. The medieval layer offers an authority you can be wrong about; this one offers a number you can check.</div></div>
      <div class="mrow"><div class="mrow-k">Oral type-scene</div><div class="mrow-v"><strong>Broke: no formulaic scenes.</strong> <strong>Replaced by the author's own unit</strong> — the <em>epiphany</em>, which Joyce defined in <em>Stephen Hero</em> and which behaves like a type-scene: fixed internal shape, predictable structural position. Kenner supplies the pattern between them: every chapter's exaltation is deflated by the next chapter's opening.</div></div>
      <div class="mrow"><div class="mrow-k">Greimas's actants</div><div class="mrow-v"><strong>Bent rather than broke.</strong> It survives the move — it is general enough — but it mis-describes the book, because it wants an Object that is a thing and an Opponent who is a person. <strong>Supplemented with René Girard</strong> (<em>Deceit, Desire and the Novel</em>, 1961), who supplies the term Greimas lacks: the <em>mediator</em>. Stephen's is the priesthood he refuses.</div></div>
      <div class="mrow"><div class="mrow-k">Cast, web, mythograph</div><div class="mrow-v"><strong>Carried over unchanged.</strong> The graph machinery does not care what the nodes mean. The cast is regrouped by Stephen's three nets rather than by household, and the mythograph gains one node type the medieval version cannot have.</div></div>

      <h2 class="section">The layer only a modern text can have</h2>
      <p>In an oral tale the style is a constant. It is formulaic on purpose — the formulae are the transmission mechanism — so measuring the prose of <em>Culhwch</em> chapter by chapter would produce a flat line and tell you nothing. In <em>Portrait</em> the style is the plot: Joyce's stated principle was that it must change with the growth of the mind it belongs to. So the modernist apparatus gets an eighth layer the medieval one has no use for — <a href="#style">the style curve</a> — and the mythograph gets <strong>register</strong> nodes, one per chapter, because in this book the prose is one of the characters.</p>

      <h2 class="section">What came out of it</h2>
      <ol class="findings">
        <li><strong>The prose does not grow up.</strong> It climbs and collapses four times, and the diary that ends the book runs at ${S.sections[S.sections.length - 1].meanSentence} words a sentence — shorter than the ${S.sections[0].meanSentence} of the infant overture that opens it. A Künstlerroman whose style curve finishes below its own starting point.</li>
        <li><strong>The most advanced prose in the novel is a parody.</strong> IV.1, the devotional timetable, holds four stylometric maxima at once. Measurement ranks the book's most enslaved page highest. Where measure and meaning diverge is the most informative coordinate in the whole apparatus — and a folk tale has no such coordinate, because its form and its meaning agree.</li>
        <li><strong>The priesthood is transferred, not renounced.</strong> Religious vocabulary outnumbers aesthetic ${S.transfer[2]} : 1 at the retreat and ${S.transfer[4]} : 1 in Chapter V — the ratio crosses parity exactly once, on the far side of the refused ordination.</li>
        <li><strong>Joyce's ecstasies are paratactic.</strong> All five chapter-closings run above their own chapter's rate of <em>and</em>; combined p = ${S.parataxis.fisher.p} (post-hoc, so read it as support rather than proof). The exception is Chapter II, whose ending is a surrender rather than a flight — and the measure caught the difference in kind.</li>
      </ol>

      <h2 class="section">What this apparatus cannot do</h2>
      <p>It cannot detect irony, and this is a book made of irony. Every number on the Style curve is blind to the difference between Joyce writing well and Joyce imitating someone writing badly — which is the difference the novel runs on. The lexicons behind the Leitmotif index are editorial, and a count only ever tells you how often the listed words occur, never that they mean what the entry claims; that is why every word-list is printed with its per-term counts. The parataxis test chose its metric after seeing the data. And the nineteen movements are anchored to a plain-text edition that does not preserve the printed section breaks, so the divisions are reconstructions — accurate ones, and reconstructions.</p>
      <p>What the apparatus is good for is narrower and, in this case, enough: it makes a critical claim <em>checkable</em>. Kenner's ladder, Joyce's changing style, the transfer of the sacred to the aesthetic — these were all readings before they were measurements, and readings is what they remain. But now each has a number attached, the number can be reproduced by anyone who runs <a href="measure/measure.mjs">one script</a> against <a href="source/portrait-gutenberg-4217.txt">one public-domain file</a>, and the number could have come out the other way. On the sentence-length version of Kenner's claim, it did.</p>

      <h2 class="section">Adding another modernist text</h2>
      <ol class="findings">
        <li>Put a public-domain source in <code>source/</code> and anchor its divisions in <code>measure/measure.mjs</code> by opening phrase, never by byte offset.</li>
        <li>Run <code>node read/&lt;slug&gt;/measure/measure.mjs --write</code>. The style curve and the leitmotif densities fall out; nothing in <code>stylometry.js</code> is ever hand-typed.</li>
        <li>Write the voice column first. It is the layer that tells you what the other layers are for.</li>
        <li>Lay the text against Genette rather than Propp, and take the absences seriously — they are the comparative payoff, exactly as they are with Propp.</li>
        <li>Choose the lexicons before looking at their counts, and print them on the page with their per-term breakdowns. If one ambiguous word supplies half a lexicon's hits, drop it and say so in the file — as was done here with <em>air</em>.</li>
      </ol>`;
  }

  /* ====================== VIEW SWITCHING ====================== */
  const VIEWS = ["read", "characters", "web", "discourse", "desire", "motifs", "epiphanies", "style", "myth", "method"];
  const drawn = {};
  const RENDER = { web: renderWeb, discourse: renderDiscourse, desire: renderDesire, motifs: renderMotifs, epiphanies: renderEpiphanies, style: renderStyle, myth: renderMythograph, method: renderMethod };
  let current = "read";
  function switchView(v) {
    if (!VIEWS.includes(v)) v = "read";
    current = v;
    VIEWS.forEach((x) => { const n = $("#view-" + x); if (n) n.classList.toggle("active", x === v); });
    [...$("#tabs").children].forEach((b) => b.classList.toggle("active", b.dataset.view === v));
    if (RENDER[v] && !drawn[v]) { RENDER[v](); drawn[v] = true; }
    if (location.hash.slice(1).split("/")[0] !== v) history.replaceState(null, "", "#" + v);
    window.scrollTo({ top: 0 });
  }
  $("#tabs").addEventListener("click", (e) => { const b = e.target.closest(".tab"); if (b) switchView(b.dataset.view); });
  window.addEventListener("hashchange", () => { const v = location.hash.slice(1).split("/")[0]; if (VIEWS.includes(v)) switchView(v); });
  let rT; window.addEventListener("resize", () => { clearTimeout(rT); rT = setTimeout(() => { const z = zoomers[current]; if (z) z.fit(); }, 180); });

  // in-page links written as href="#view" in the data files
  document.addEventListener("click", (ev) => {
    const a = ev.target.closest && ev.target.closest('a[href^="#"]');
    if (a && !a.hasAttribute("data-passage") && !a.hasAttribute("data-char")) {
      const v = a.getAttribute("href").slice(1);
      if (VIEWS.includes(v)) { ev.preventDefault(); switchView(v); }
    }
  });
  // jump to a movement in Read
  document.addEventListener("click", (ev) => {
    const a = ev.target.closest && ev.target.closest("a[data-passage]");
    if (a) { ev.preventDefault(); switchView("read"); const h = document.getElementById("tale-p-" + a.getAttribute("data-passage")); if (h) setTimeout(() => h.scrollIntoView({ behavior: "smooth", block: "start" }), 30); }
  });
  // jump to a character card
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
