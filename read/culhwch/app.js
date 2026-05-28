/* Culhwch ac Olwen — standalone site. Reads window.CULHWCH (tale, propp,
   characters). Vanilla JS, no build. */
(function () {
  "use strict";
  const C = window.CULHWCH;
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
    const t = C.tale; if (!t) return;
    const meta = $("#tale-meta"); meta.innerHTML = "";
    meta.appendChild(el("div", "tale-blurb", t.meta.blurb));
    if (t.meta.sources) {
      const sr = el("div", "srclinks");
      t.meta.sources.forEach((s) => { const a = el("a", "srclink"); a.href = s.url; a.target = "_blank"; a.rel = "noopener"; a.innerHTML = `${escapeHtml(s.label)} <span class="host">${escapeHtml(s.host)}</span>`; sr.appendChild(a); });
      meta.appendChild(sr);
    }
    const prog = $("#tale-progress");
    if (prog && t.roadmap) {
      const done = t.roadmap.filter((r) => r.done).length, total = t.roadmap.length, pct = Math.round((done / total) * 100);
      prog.innerHTML = "";
      prog.appendChild(el("div", "prog-head", done === total
        ? `Translation <strong>complete</strong> — all ${total} movements ✦ the whole tale`
        : `Translation progress — <strong>${done} of ${total}</strong> movements · ~${pct}% of the tale`));
      const bar = el("div", "prog-bar"); const fill = el("div", "prog-fill"); fill.style.width = pct + "%"; bar.appendChild(fill); prog.appendChild(bar);
      const road = el("div", "prog-road");
      t.roadmap.forEach((r) => road.appendChild(el("span", "prog-chip" + (r.done ? " done" : ""), r.t)));
      prog.appendChild(road);
    }
    const body = $("#tale-body");
    const ctr = $("#tale-controls"); ctr.innerHTML = "";
    [["parallel", "Parallel"], ["english", "English only"], ["welsh", "Welsh only"]].forEach(([m, label], i) => {
      const b = el("button", "tale-mode" + (i === 0 ? " active" : ""), label);
      b.onclick = () => { body.className = "tale-body " + m; [...ctr.children].forEach((x) => x.classList.remove("active")); b.classList.add("active"); };
      ctr.appendChild(b);
    });
    body.innerHTML = "";
    t.passages.forEach((pass, pi) => {
      const head = el("h2", "section tale-pass-title", pass.title); head.id = "tale-p-" + (pi + 1); body.appendChild(head);
      pass.segments.forEach((seg) => {
        const row = el("div", "tale-seg");
        row.appendChild(el("div", "seg-w", seg.w));
        row.appendChild(el("div", "seg-e", seg.e));
        if (seg.n) row.appendChild(el("div", "seg-n", seg.n));
        body.appendChild(row);
      });
    });
  }

  /* ====================== STORYBOOK (paged reader) ====================== */
  function renderBook() {
    const B = C.book; if (!B) return;
    const spreads = B.spreads, page = $("#book-page"), nav = $("#book-nav");
    let idx = 0;
    function dropCap(t) { return String(t).replace(/^(\s*[“"'(]?\s*)(\S)/, (m, a, b) => a + '<span class="bk-dropcap">' + b + '</span>'); }
    function show() {
      idx = Math.max(0, Math.min(spreads.length - 1, idx));
      const s = spreads[idx];
      page.innerHTML = "";
      page.className = "book-page" + (idx === 0 ? " book-title" : "");
      // image plate (silently removed if the PNG hasn't been generated yet)
      const img = document.createElement("img");
      img.className = "bk-plate"; img.loading = "lazy"; img.alt = s.illus || s.title || "";
      img.onerror = () => img.remove();
      img.src = "img/spread-" + String(idx).padStart(2, "0") + ".png";
      page.appendChild(img);
      if (idx === 0) {
        page.appendChild(el("div", "bk-kicker", B.meta.kicker));
        page.appendChild(el("h1", "bk-bigtitle", s.title));
        if (s.sub) page.appendChild(el("div", "bk-sub", s.sub));
        if (s.text) page.appendChild(el("p", "bk-lead", s.text));
      } else {
        if (s.title) page.appendChild(el("h2", "bk-spreadtitle", s.title));
        const p = el("p", "bk-text"); p.innerHTML = dropCap(s.text); page.appendChild(p);
        page.appendChild(el("div", "bk-orn", idx === spreads.length - 1 ? "❦" : "❧"));
      }
      $("#book-prev").disabled = idx === 0;
      $("#book-next").disabled = idx === spreads.length - 1;
      $("#book-count").textContent = (idx + 1) + " / " + spreads.length;
    }
    nav.innerHTML = "";
    const prev = el("button", "bk-btn", "‹ Back"); prev.id = "book-prev"; prev.onclick = () => { idx--; show(); };
    const count = el("span", "bk-count"); count.id = "book-count";
    const next = el("button", "bk-btn", "Next ›"); next.id = "book-next"; next.onclick = () => { idx++; show(); };
    nav.appendChild(prev); nav.appendChild(count); nav.appendChild(next);
    if (!renderBook._kb) {
      renderBook._kb = true;
      window.addEventListener("keydown", (e) => {
        if (current !== "book") return;
        if (e.key === "ArrowRight") { idx++; show(); } else if (e.key === "ArrowLeft") { idx--; show(); }
      });
    }
    show();
  }

  /* ====================== CHARACTERS ====================== */
  function renderCharacters() {
    const ch = C.characters; if (!ch) return;
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
        const sub = [c.welsh && c.welsh !== c.name ? c.welsh : null, c.epithet].filter(Boolean).join(" · ");
        if (sub) head += `<div class="char-sub">${escapeHtml(sub)}</div>`;
        card.innerHTML = head + `<div class="char-blurb">${c.blurb}</div>`;
        if (c.appears && c.appears.length) {
          const ap = el("div", "char-appears", "Appears in: ");
          c.appears.forEach((n, i) => {
            const a = el("a", null, "" + toRoman(n)); a.setAttribute("data-passage", n); a.title = (C.tale.passages[n - 1] || {}).title || "";
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
  function toRoman(n) { const m = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"]; return m[n] || ("" + n); }

  /* ====================== CHARACTER WEB ====================== */
  function renderWeb() {
    const ch = C.characters; if (!ch) return;
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
      const r = (n.role === "principal" || n.role === "antagonist") ? 13 : (n.role === "companion" ? 10 : 9);
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

  /* ====================== MOTIF INDEX ====================== */
  function confLabel(c) { return c === "high" ? "well-attested" : c === "med" ? "interpretive" : "speculative"; }
  function renderMotifs() {
    const M = C.motifs; if (!M) return;
    $("#motif-intro").innerHTML = M.intro;
    const tt = $("#motif-taletypes"); tt.innerHTML = "";
    M.taletypes.forEach((t) => {
      const card = el("div", "tt-card");
      card.innerHTML = `<div class="tt-head"><span class="tt-code">${escapeHtml(t.code)}</span><span class="conf conf-${t.conf}">${confLabel(t.conf)}</span></div><div class="tt-name">${escapeHtml(t.name)}</div><div class="tt-gloss">${t.gloss}</div>`;
      tt.appendChild(card);
    });
    const host = $("#motif-groups"); host.innerHTML = "";
    M.classOrder.forEach((cl) => {
      const items = M.list.filter((m) => m.cls === cl); if (!items.length) return;
      host.appendChild(el("div", "motif-classhead", `<span class="motif-clsletter">${cl}</span> ${escapeHtml(M.classes[cl] || "")}`));
      items.forEach((m) => {
        const row = el("div", "motif-row");
        row.appendChild(el("div", "motif-badge", escapeHtml(m.code || m.cls)));
        const main = el("div");
        main.appendChild(el("div", "motif-name", `${escapeHtml(m.name)} <span class="conf conf-${m.conf}">${confLabel(m.conf)}</span>`));
        main.appendChild(el("div", "motif-gloss", m.gloss));
        if (m.passages && m.passages.length) {
          const ap = el("div", "motif-ex", "Exhibited in: ");
          m.passages.forEach((n, i) => {
            const a = el("a", null, toRoman(n)); a.setAttribute("data-passage", n); a.title = (C.tale.passages[n - 1] || {}).title || "";
            ap.appendChild(a); if (i < m.passages.length - 1) ap.appendChild(document.createTextNode(" · "));
          });
          main.appendChild(ap);
        }
        row.appendChild(main); host.appendChild(row);
      });
    });
  }

  /* ====================== STORY GRAPH (Propp) ====================== */
  function renderPropp() {
    const P2 = C.propp; if (!P2) return;
    $("#propp-intro").innerHTML = P2.intro;
    const actColor = {}; P2.acts.forEach((a) => actColor[a.id] = a.color);
    const leg = $("#propp-legend"); leg.innerHTML = "";
    P2.acts.forEach((a) => leg.appendChild(el("span", "li", `<span class="dot" style="background:${a.color}"></span>${a.label}`)));

    const moves = P2.moves, n = moves.length;
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
      const sym = svgEl("text", { x: cx(i) - NW / 2 + 17, y: cy + 6, "text-anchor": "middle", "font-size": 17, fill: col, "font-style": "italic" }); sym.textContent = m.sym; g.appendChild(sym);
      const lbl = svgEl("text", { x: cx(i) + 8, y: cy + 5, "text-anchor": "middle", "font-size": 11.5, fill: "#e8e0d2" }); lbl.textContent = m.node; g.appendChild(lbl);
      const ttl = svgEl("title"); ttl.textContent = `${m.sym} — ${m.name}`; g.appendChild(ttl);
      g.addEventListener("click", () => { const c = $("#propp-move-" + i); if (c) { c.scrollIntoView({ behavior: "smooth", block: "center" }); c.classList.remove("flash"); void c.offsetWidth; c.classList.add("flash"); } });
      layer.appendChild(g);
    });
    const host = $("#propp-spine"); host.innerHTML = ""; host.appendChild(svg);
    zoomers.propp = attachZoom(svg, layer, contentW, host);

    const cards = $("#propp-cards"); cards.innerHTML = ""; let lastAct = null;
    moves.forEach((m, i) => {
      if (m.act !== lastAct) { const a = P2.acts.find((x) => x.id === m.act); cards.appendChild(el("div", "propp-act", a ? a.label : m.act)); lastAct = m.act; }
      const col = actColor[m.act] || "#c9a24a";
      const card = el("div", "propp-move"); card.id = "propp-move-" + i;
      const badge = el("div", "propp-badge", m.sym); badge.style.color = col; badge.style.borderColor = col; card.appendChild(badge);
      const main = el("div");
      main.appendChild(el("div", "propp-name", `${escapeHtml(m.name)} <span class="propp-sym">${escapeHtml(m.sym)}</span>`));
      main.appendChild(el("div", "propp-gloss", m.gloss));
      main.appendChild(el("div", "propp-realized", m.realized));
      const pass = C.tale && C.tale.passages[m.passage - 1];
      if (pass) { const j = el("div", "propp-jump"); const a = el("a", null, `→ Movement ${m.passage}: ${escapeHtml(pass.title.replace(/^[IVX]+\.\s*/, ""))}`); a.setAttribute("data-passage", m.passage); j.appendChild(a); main.appendChild(j); }
      card.appendChild(main); cards.appendChild(card);
    });

    const ab = $("#propp-absent"); ab.innerHTML = "";
    ab.appendChild(el("h3", null, "What the tale skips"));
    ab.appendChild(el("p", "propp-abnote", P2.absent.note));
    P2.absent.groups.forEach((gp) => { const row = el("div", "propp-abgroup"); row.innerHTML = `<span class="propp-absyms">${escapeHtml(gp.syms)}</span> <strong>${escapeHtml(gp.label)}</strong> — ${gp.text}`; ab.appendChild(row); });
    ab.appendChild(el("p", "propp-verdict", P2.absent.verdict));
  }

  /* ====================== THE MYTHOGRAPH (synergistic graph) ======================
     One typed multigraph over the whole annotation layer. Nodes: movement,
     character, motif, propp-function. Edges: APPEARS_IN (char->movement),
     RELATES_TO (char<->char), EXHIBITS (motif->movement), REALIZES (fn->movement).
     The 12 movements are pinned along a horizontal spine; everything else is
     force-laid, so cross-cutting elements pull toward the centre. */
  function buildMythograph() {
    const nodes = [], edges = [], id2i = {};
    const add = (id, full, label, type, link, preview) => { id2i[id] = nodes.length; nodes.push({ id, full, label, type, link, preview }); };
    C.tale.passages.forEach((p, i) => { const n = i + 1; add("mv-" + n, p.title, toRoman(n), "movement", { passage: n }, (p.segments[0] || {}).e || ""); });
    C.characters.cast.forEach((c) => add("ch-" + c.id, c.name, c.name, "character", { char: c.id }, c.blurb || ""));
    C.motifs.list.forEach((m, i) => add("mo-" + i, (m.code || m.cls) + " — " + m.name, m.code || m.cls, "motif", { tab: "motifs" }, m.gloss || ""));
    C.propp.moves.forEach((mv, i) => add("pp-" + i, mv.sym + " · " + mv.name, mv.sym, "propp", { tab: "propp", anchor: "propp-move-" + i }, mv.realized || ""));
    const edge = (a, b, type) => { if (id2i[a] == null || id2i[b] == null) return; edges.push({ a: id2i[a], b: id2i[b], type }); };
    C.characters.cast.forEach((c) => (c.appears || []).forEach((n) => edge("ch-" + c.id, "mv-" + n, "appears")));
    const seen = {}; C.characters.cast.forEach((c) => (c.rel || []).forEach((r) => { const k = [c.id, r.to].sort().join("|"); if (seen[k]) return; seen[k] = 1; edge("ch-" + c.id, "ch-" + r.to, "relates"); }));
    C.motifs.list.forEach((m, i) => (m.passages || []).forEach((n) => edge("mo-" + i, "mv-" + n, "exhibits")));
    C.propp.moves.forEach((mv, i) => edge("pp-" + i, "mv-" + mv.passage, "realizes"));
    for (let i = 1; i < C.tale.passages.length; i++) edge("mv-" + i, "mv-" + (i + 1), "spine"); // the narrative backbone
    return { nodes, edges };
  }

  const MYTH_TYPE = {
    movement: { color: "#c9a24a", label: "Movements", r: 15 },
    character: { color: "#6fa8c9", label: "Characters", r: 9 },
    motif: { color: "#c97f9a", label: "Motifs", r: 6 },
    propp: { color: "#7fb37f", label: "Functions", r: 6 },
  };
  const MYTH_EDGE = { spine: "#d8b24a", appears: "#6fa8c9", relates: "#9a8fd0", exhibits: "#c97f9a", realizes: "#7fb37f" };

  function renderMythograph() {
    const g = buildMythograph(), nodes = g.nodes, edges = g.edges;
    const active = { movement: true, character: true, motif: true, propp: true };
    const mobile = (window.innerWidth || 900) < 640;
    const R = (n) => MYTH_TYPE[n.type].r;
    let selected = null, selGroup = null, grown = [];
    let alpha = 1, running = false, simReady = false;
    const sim = { L: 90, charge: -1000 };

    // ---- controls: layer toggles + simulation sliders ----
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
    addSlider("Link length", 0, 100, 30, (v, out) => { sim.L = 24 + v * 2.4; out.textContent = Math.round(sim.L); });
    addSlider("Repulsion", 0, 100, 42, (v, out) => { sim.charge = -(60 + v * 26); out.textContent = v; });
    fhost.appendChild(sliders);

    const leg = $("#myth-legend"); leg.innerHTML = "";
    [["spine", "narrative spine (I → XII)"], ["appears", "character → movement"], ["relates", "character ↔ character"], ["exhibits", "motif → movement"], ["realizes", "function → movement"]]
      .forEach(([k, lab]) => leg.appendChild(el("span", "li", `<span class="edgekey${k === "spine" ? " edgekey-spine" : ""}" style="background:${MYTH_EDGE[k]}"></span>${lab}`)));

    // ---- build the svg (positions driven by the live simulation) ----
    nodes.forEach((n, i) => { const a = 2 * Math.PI * i / nodes.length; n.x = Math.cos(a) * 130; n.y = Math.sin(a) * 130; n.vx = 0; n.vy = 0; });
    const svg = svgEl("svg", { class: "myth" }); const layer = svgEl("g", { class: "zl" }); svg.appendChild(layer);
    const edgeObjs = [], adj = {};
    edges.forEach((e, ei) => {
      const sp = e.type === "spine";
      const line = svgEl("line", { class: sp ? "myth-spine" : "", stroke: MYTH_EDGE[e.type], "stroke-opacity": sp ? 0.72 : 0.22, "stroke-width": sp ? 2.6 : 1 });
      layer.appendChild(line); edgeObjs.push(line);
      (adj[e.a] = adj[e.a] || []).push(ei); (adj[e.b] = adj[e.b] || []).push(ei);
    });
    const nodeObjs = [], shapes = [];
    nodes.forEach((n, i) => {
      const T = MYTH_TYPE[n.type];
      const grp = svgEl("g", { class: "myth-node", transform: `translate(${n.x} ${n.y})` });
      let shapeEl, tag;
      if (n.type === "movement") {
        shapeEl = svgEl("rect", { x: -T.r, y: -T.r, width: T.r * 2, height: T.r * 2, rx: 5, fill: T.color, "fill-opacity": 0.9, stroke: "#14110d", "stroke-width": 1.5 });
        grp.appendChild(shapeEl); tag = "rect";
        const lab = svgEl("text", { x: 0, y: 4, "text-anchor": "middle", "font-size": 11, fill: "#14110d", "font-weight": "700" }); lab.textContent = n.label; grp.appendChild(lab);
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
      g2.appendChild(svgEl("rect", { x: bx, y: by, width: cw, height: h, rx: 8, fill: "#1c1813", stroke: "#c9a24a", "stroke-width": 1.2 }));
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
      // primary open action
      const open = el("div", "md-open");
      if (n.link.passage) { const a = el("a", null, "→ Read this movement"); a.setAttribute("data-passage", n.link.passage); open.appendChild(a); }
      else if (n.link.char) { const a = el("a", null, "→ Character card"); a.setAttribute("data-char", n.link.char); open.appendChild(a); }
      else if (n.link.tab === "motifs") { const a = el("a", null, "→ In the motif index"); a.onclick = () => switchView("motifs"); open.appendChild(a); }
      else if (n.link.tab === "propp") { const a = el("a", null, "→ In the story graph"); a.onclick = () => { switchView("propp"); if (n.link.anchor) setTimeout(() => { const c = $("#" + n.link.anchor); if (c) c.scrollIntoView({ behavior: "smooth", block: "center" }); }, 40); }; open.appendChild(a); }
      d.appendChild(open);
      // neighbours grouped by edge type
      const groups = {};
      (adj[i] || []).forEach((ei) => { const e = edges[ei]; const other = e.a === i ? e.b : e.a; (groups[e.type] = groups[e.type] || []).push(other); });
      const GLAB = { spine: "In sequence", appears: "Appears in", relates: "Related to", exhibits: "Exhibits", realizes: "Realizes" };
      const order = n.type === "movement" ? ["spine", "appears", "exhibits", "realizes", "relates"] : ["appears", "relates", "exhibits", "realizes", "spine"];
      order.forEach((t) => {
        if (!groups[t]) return;
        const sec = el("div", "md-group");
        sec.appendChild(el("span", "md-glabel", GLAB[t] + ": "));
        groups[t].forEach((oi, idx) => {
          const chip = el("a", "md-chip"); chip.innerHTML = escapeHtml(nodes[oi].full);
          chip.onclick = () => select(oi);
          sec.appendChild(chip);
          if (idx < groups[t].length - 1) sec.appendChild(document.createTextNode(" "));
        });
        d.appendChild(sec);
      });
    }

    // ---- live force simulation ----
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
      edges.forEach((e) => { const A = nodes[e.a], B = nodes[e.b]; let dx = B.x - A.x, dy = B.y - A.y, d = Math.sqrt(dx * dx + dy * dy) || 0.01; const sp = e.type === "spine"; const L = sp ? Math.max(sim.L * 1.3, 104) : sim.L, st = sp ? 0.62 : stiffness; const l = (d - L) / d * a * st, fx = dx * l * 0.5, fy = dy * l * 0.5; A.vx += fx; A.vy += fy; B.vx -= fx; B.vy -= fy; });
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
    function frame() { step(); paint(); if (alpha > 0.12 && zoomers.myth) zoomers.myth.fit(); if (alpha > alphaMin && running) raf(frame); else running = false; }
    function reheat() { if (!simReady) return; if (selected != null) { clearSel(); selected = null; clearHi(); } alpha = Math.max(alpha, 0.7); if (!running) { running = true; raf(frame); } }

    for (let w = 0; w < 30; w++) step();             // warm start (instant), then settle live
    const host = $("#myth-host"); host.innerHTML = ""; host.appendChild(svg); paint();
    zoomers.myth = attachZoom(svg, layer, bounds, host);
    $("#myth-detail").innerHTML = '<div class="md-hint">A live force simulation — tune <em>link length</em> and <em>repulsion</em> above. Hover a node to light its threads; click any node to freeze the layout and preview what it touches.</div>';
    simReady = true; running = true; raf(frame);
  }

  /* ====================== VIEW SWITCHING ====================== */
  const VIEWS = ["read", "book", "characters", "web", "propp", "motifs", "myth"];
  let proppDrawn = false, webDrawn = false, mythDrawn = false, current = "read";
  function switchView(v) {
    current = v;
    VIEWS.forEach((x) => $("#view-" + x).classList.toggle("active", x === v));
    [...$("#tabs").children].forEach((b) => b.classList.toggle("active", b.dataset.view === v));
    if (v === "web" && !webDrawn) { renderWeb(); webDrawn = true; }
    if (v === "propp" && !proppDrawn) { renderPropp(); proppDrawn = true; }
    if (v === "myth" && !mythDrawn) { renderMythograph(); mythDrawn = true; }
    if (location.hash.slice(1).split("/")[0] !== v) history.replaceState(null, "", "#" + v);
    window.scrollTo({ top: 0 });
  }
  $("#tabs").addEventListener("click", (e) => { const b = e.target.closest(".tab"); if (b) switchView(b.dataset.view); });
  window.addEventListener("hashchange", () => { const v = location.hash.slice(1).split("/")[0]; if (VIEWS.includes(v)) switchView(v); });
  let rT; window.addEventListener("resize", () => { clearTimeout(rT); rT = setTimeout(() => { const z = zoomers[current]; if (z) z.fit(); }, 180); });

  // jump to a reading movement
  document.addEventListener("click", (ev) => {
    const a = ev.target.closest && ev.target.closest("a[data-passage]");
    if (a) { ev.preventDefault(); switchView("read"); const h = document.getElementById("tale-p-" + a.getAttribute("data-passage")); if (h) setTimeout(() => h.scrollIntoView({ behavior: "smooth", block: "start" }), 30); }
  });
  // jump to a character card
  document.addEventListener("click", (ev) => {
    const a = ev.target.closest && ev.target.closest("a[data-char]");
    if (a) { ev.preventDefault(); switchView("characters"); const c = document.getElementById("char-" + a.getAttribute("data-char")); if (c) setTimeout(() => { c.scrollIntoView({ behavior: "smooth", block: "center" }); c.classList.remove("flash"); void c.offsetWidth; c.classList.add("flash"); }, 30); }
  });
  // wiki cross-references point back to the historiography site
  document.addEventListener("click", (ev) => {
    const a = ev.target.closest && ev.target.closest("a[data-wiki]");
    if (a) { ev.preventDefault(); window.location.href = "/pendragon/#wiki/" + a.getAttribute("data-wiki"); }
  });

  /* ====================== INIT ====================== */
  renderTale();
  renderBook();
  renderCharacters();
  renderMotifs();
  const h = location.hash.slice(1).split("/")[0];
  if (VIEWS.includes(h)) switchView(h);
})();
