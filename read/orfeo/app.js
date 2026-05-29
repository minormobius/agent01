/* Sir Orfeo — standalone site reader. */
(function () {
  "use strict";
  const O = window.ORFEO;
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
    const t = O.tale; if (!t) return;

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
    [["parallel", "Parallel"], ["english", "English only"], ["middle", "Middle English only"]].forEach(([m, label], i) => {
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

  /* ====================== STORYBOOK ====================== */
  function renderBook() {
    const B = O.book; if (!B) return;
    const spreads = B.spreads, page = $("#book-page"), nav = $("#book-nav");
    let idx = 0;
    function dropCap(t) { return String(t).replace(/^(\s*["'(]?\s*)(\S)/, (m, a, b) => a + '<span class="bk-dropcap">' + b + '</span>'); }
    function show() {
      idx = Math.max(0, Math.min(spreads.length - 1, idx));
      const s = spreads[idx];
      page.innerHTML = "";
      page.className = "book-page" + (idx === 0 ? " book-title" : "");
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
  function toRoman(n) { const m = ["", "I", "II", "III", "IV", "V", "VI"]; return m[n] || ("" + n); }

  function renderCharacters() {
    const ch = O.characters; if (!ch) return;
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
            const a = el("a", null, "Mvt " + toRoman(n)); a.setAttribute("data-passage", n); a.title = (O.tale.passages[n - 1] || {}).title || "";
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
    const ch = O.characters; if (!ch) return;
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
      const r = (n.role === "principal") ? 13 : (n.role === "winchester" ? 10 : 9);
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

  /* ====================== VIEW SWITCHING ====================== */
  const VIEWS = ["read", "book", "characters", "web"];
  let webDrawn = false, current = "read";
  function switchView(v) {
    if (!VIEWS.includes(v)) v = "read";
    current = v;
    VIEWS.forEach((x) => { const n = $("#view-" + x); if (n) n.classList.toggle("active", x === v); });
    [...$("#tabs").children].forEach((b) => b.classList.toggle("active", b.dataset.view === v));
    if (v === "web" && !webDrawn) { renderWeb(); webDrawn = true; }
    if (location.hash.slice(1).split("/")[0] !== v) history.replaceState(null, "", "#" + v);
    window.scrollTo({ top: 0 });
  }
  $("#tabs").addEventListener("click", (e) => { const b = e.target.closest(".tab"); if (b) switchView(b.dataset.view); });
  window.addEventListener("hashchange", () => { const v = location.hash.slice(1).split("/")[0]; if (VIEWS.includes(v)) switchView(v); });
  let rT; window.addEventListener("resize", () => { clearTimeout(rT); rT = setTimeout(() => { const z = zoomers[current]; if (z) z.fit(); }, 180); });

  // jump from a character chip / story-graph link to its Movement in the Read tab
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
  renderBook();
  renderCharacters();
  const h = location.hash.slice(1).split("/")[0];
  if (VIEWS.includes(h)) switchView(h);
})();
