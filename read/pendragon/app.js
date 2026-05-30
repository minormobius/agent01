/* Pendragon — renderers + interactions. Vanilla JS, no build. */
(function () {
  "use strict";
  const P = window.PENDRAGON || PENDRAGON;
  const $ = (s, r) => (r || document).querySelector(s);
  const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
  const NS = "http://www.w3.org/2000/svg";
  const svgEl = (tag, attrs) => { const n = document.createElementNS(NS, tag); if (attrs) for (const k in attrs) n.setAttribute(k, attrs[k]); return n; };

  /* ---- link resolver: "host:arg|label" → {host,url,label} ---- */
  function resolveLink(str) {
    const i = str.indexOf(":");
    const host = str.slice(0, i);
    const rest = str.slice(i + 1);
    const bar = rest.indexOf("|");
    let arg = bar === -1 ? rest : rest.slice(0, bar);
    let label = bar === -1 ? null : rest.slice(bar + 1);
    const b = P.link[host];
    if (!b) return { host: "link", url: "#", label: label || arg };
    if (host === "cp" || host === "teams") return b(label || arg || undefined);
    return b(arg, label || arg);
  }
  function linkRow(arr) {
    if (!arr || !arr.length) return null;
    const row = el("div", "srclinks");
    arr.forEach((s) => {
      const L = resolveLink(s);
      const a = el("a", "srclink");
      a.href = L.url; a.target = "_blank"; a.rel = "noopener";
      a.innerHTML = `${escapeHtml(L.label)} <span class="host">${escapeHtml(L.host)}</span>`;
      row.appendChild(a);
    });
    return row;
  }
  function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

  /* ---- pan/zoom for an SVG whose content lives in a single <g> layer ----
     The svg fills its host (100%); coordinates are CSS px, so pointer math
     is direct. Returns { fit, zoom } and wires +/−/⤢ buttons in the host. */
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function attachZoom(svg, layer, contentW, host) {
    let k = 1, tx = 0, ty = 0;
    const MIN = 0.2, MAX = 9;
    const apply = () => layer.setAttribute("transform", `translate(${tx} ${ty}) scale(${k})`);
    function fit() {
      const cw = host.clientWidth || contentW;
      k = Math.min(1.4, cw / contentW);
      tx = Math.max(0, (cw - contentW * k) / 2);
      ty = 6; apply();
    }
    function zoomAt(mx, my, factor) {
      const nk = clamp(k * factor, MIN, MAX);
      tx = mx - (mx - tx) * (nk / k);
      ty = my - (my - ty) * (nk / k);
      k = nk; apply();
    }
    svg.addEventListener("wheel", (e) => {
      e.preventDefault();
      const r = svg.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015));
    }, { passive: false });
    const pts = new Map();
    let pinch = null;
    svg.addEventListener("pointerdown", (e) => { pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); try { svg.setPointerCapture(e.pointerId); } catch (_) {} });
    svg.addEventListener("pointermove", (e) => {
      if (!pts.has(e.pointerId)) return;
      const prev = pts.get(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const arr = [...pts.values()];
      if (arr.length === 1) { tx += e.clientX - prev.x; ty += e.clientY - prev.y; apply(); }
      else if (arr.length >= 2) {
        const r = svg.getBoundingClientRect();
        const [a, b] = arr;
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const midx = (a.x + b.x) / 2 - r.left, midy = (a.y + b.y) / 2 - r.top;
        if (pinch) { zoomAt(midx, midy, dist / pinch.dist); tx += midx - pinch.midx; ty += midy - pinch.midy; apply(); }
        pinch = { dist, midx, midy };
      }
    });
    const release = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; };
    svg.addEventListener("pointerup", release);
    svg.addEventListener("pointercancel", release);
    // controls
    const ctr = el("div", "zoom-controls");
    const mk = (txt, fn) => { const b = el("button", "zbtn", txt); b.type = "button"; b.onclick = fn; ctr.appendChild(b); return b; };
    const center = (f) => zoomAt(host.clientWidth / 2, host.clientHeight / 2, f);
    mk("+", () => center(1.35));
    mk("−", () => center(1 / 1.35));
    mk("⤢", () => fit());
    host.appendChild(ctr);
    fit();
    return { fit };
  }
  const zoomers = {}; // view id → zoom controller, for resize refit

  /* ---- kinds → colour for timeline dots & tree fallback ---- */
  const KIND = {
    source:        { c: "#7fb37f", label: "Source / chronicle" },
    pseudohistory: { c: "#c9a24a", label: "Pseudo-history" },
    romance:       { c: "#c97f9a", label: "Romance" },
    english:       { c: "#6fa8c9", label: "Middle English" },
    modern:        { c: "#cf7a5a", label: "Modern retelling" },
    art:           { c: "#d0b04a", label: "Art" },
    music:         { c: "#9a8fd0", label: "Music" },
    screen:        { c: "#cf6a6a", label: "Stage / screen" },
    scholarship:   { c: "#8fb0a0", label: "Scholarship" },
    event:         { c: "#8a7f6b", label: "Event" },
  };

  /* ====================== TIMELINE ====================== */
  let activeKinds = new Set(Object.keys(KIND));
  function renderTimeline() {
    $("#tagline").innerHTML = P.meta.tagline;
    const filt = $("#tl-filters");
    Object.keys(KIND).forEach((k) => {
      const f = el("button", "tl-filter");
      f.innerHTML = `<span class="dot" style="background:${KIND[k].c}"></span>${KIND[k].label}`;
      f.onclick = () => { if (activeKinds.has(k)) { activeKinds.delete(k); f.classList.add("off"); } else { activeKinds.add(k); f.classList.remove("off"); } drawTimeline(); };
      filt.appendChild(f);
    });
    drawTimeline();
  }
  function drawTimeline() {
    const host = $("#timeline"); host.innerHTML = "";
    P.timeline.forEach((e) => {
      if (!activeKinds.has(e.kind)) return;
      const item = el("div", "tl-item" + (e.pivot ? " pivot" : ""));
      const dotc = KIND[e.kind] ? KIND[e.kind].c : "#c9a24a";
      item.style.setProperty("--gold", dotc);
      const head = el("div");
      head.innerHTML = `<span class="tl-year">${escapeHtml(e.span)}</span><span class="tl-strand">${escapeHtml(e.strand)}</span>`;
      item.appendChild(head);
      const title = el("div", "tl-title", e.title + (e.fae ? '<span class="fae-tag">fae</span>' : ""));
      item.appendChild(title);
      item.appendChild(el("div", "tl-body", e.body));
      const lr = linkRow(e.links); if (lr) item.appendChild(lr);
      host.appendChild(item);
    });
  }

  /* ====================== TREE ====================== */
  // piecewise year → y, compressing dead centuries, expanding the medieval core
  const ANCH = [[540,40],[700,95],[830,130],[970,165],[1100,200],[1136,225],[1170,255],[1205,290],[1240,330],[1350,400],[1400,440],[1470,490],[1590,560],[1750,615],[1860,660],[1983,720],[2005,745]];
  function yScale(yr) {
    if (yr <= ANCH[0][0]) return ANCH[0][1];
    if (yr >= ANCH[ANCH.length-1][0]) return ANCH[ANCH.length-1][1];
    for (let i = 0; i < ANCH.length-1; i++) {
      const [y0,p0] = ANCH[i], [y1,p1] = ANCH[i+1];
      if (yr >= y0 && yr <= y1) return p0 + (p1-p0) * (yr-y0)/(y1-y0);
    }
    return 0;
  }
  // tree node → wiki entry (for click-through)
  const NODE2WIKI = {
    geoffrey:"geoffrey-p", vitamerlini:"avalon", chretien:"chretien-p", boron:"boron-t",
    vulgate:"vulgate-t", sggk:"sggk-t", malory:"malory-p", tennyson:"idylls-t",
    white:"once-t", bradley:"bradley-t", culhwch:"culhwch-note", wace:"brut-t",
    layamon:"brut-t", marie:"ladyofthelake", wagner:"grail", spenser:"rexquondam",
    nennius:"historicity", gildas:"historicity", annales:"arthur", twain:"morte-t",
    screen:"morte-t", postvulgate:"vulgate-t", prosetristan:"vulgate-t",
    hartmann:"chretien-p", wolfram:"grail", gottfried:"grail",
    stanzmorte:"morte-t", allitmorte:"morte-t",
  };
  function renderTree() {
    // legend
    const leg = $("#tree-legend"); leg.innerHTML = "";
    P.tree.strands.forEach((s) => {
      const li = el("span", "li", `<span class="dot" style="background:${s.color}"></span>${s.label}`);
      leg.appendChild(li);
    });

    const strands = P.tree.strands;
    const COL = 158, padX = 14, padTop = 56, W = COL * strands.length, H = 800;
    const colX = {}; strands.forEach((s, i) => colX[s.id] = padX + i * COL + COL / 2);
    const NW = 138, NH = 42;

    // positions, with simple vertical de-collision per strand
    const byStrand = {};
    P.tree.nodes.forEach((n) => { (byStrand[n.strand] ||= []).push(n); });
    const pos = {};
    Object.values(byStrand).forEach((list) => {
      list.sort((a,b)=>a.year-b.year);
      let lastY = -1e9;
      list.forEach((n) => {
        let y = padTop + yScale(n.year);
        if (y - lastY < NH + 8) y = lastY + NH + 8;
        lastY = y; pos[n.id] = { x: colX[n.strand], y };
      });
    });
    const maxY = Math.max(...Object.values(pos).map(p=>p.y)) + NH;

    const svg = svgEl("svg", { class: "tree" });
    const layer = svgEl("g", { class: "zl" });
    svg.appendChild(layer);

    // strand headers
    strands.forEach((s) => {
      const t = svgEl("text", { class: "strand-head", x: colX[s.id], y: 24, "text-anchor": "middle" });
      t.textContent = s.label.split(" — ")[0];
      layer.appendChild(t);
      layer.appendChild(svgEl("line", { x1: colX[s.id], y1: 32, x2: colX[s.id], y2: maxY, stroke: s.color, "stroke-opacity": 0.12, "stroke-width": 1 }));
    });

    // edges
    const edgeEls = [];
    const adj = {}; // nodeId → [edgeIndex]
    P.tree.edges.forEach((e, idx) => {
      const [from, to, kind] = e;
      const a = pos[from], b = pos[to]; if (!a || !b) return;
      const sy = a.y + NH/2, ty = b.y - NH/2;
      const midY = (sy + ty) / 2;
      const path = svgEl("path", { class: "edge " + kind, d: `M ${a.x} ${sy} C ${a.x} ${midY}, ${b.x} ${midY}, ${b.x} ${ty}` });
      layer.appendChild(path);
      edgeEls.push({ path, from, to });
      (adj[from] ||= []).push(idx); (adj[to] ||= []).push(idx);
    });

    // nodes
    const strandColor = {}; strands.forEach(s=>strandColor[s.id]=s.color);
    const nodeEls = {};
    P.tree.nodes.forEach((n) => {
      const p = pos[n.id];
      const g = svgEl("g", { class: "node" + (n.pivot?" pivot":"") + (n.fae?" fae":""), transform: `translate(${p.x},${p.y})` });
      const col = strandColor[n.strand];
      const rect = svgEl("rect", { x: -NW/2, y: -NH/2, width: NW, height: NH, rx: 6, fill: col, "fill-opacity": n.pivot?0.26:0.14, stroke: col });
      g.appendChild(rect);
      // label (wrap into <= 2 lines)
      const parts = n.label.split(" — ");
      const main = parts[0], sub = parts[1];
      const lt = svgEl("text", { "text-anchor": "middle", "font-size": 11, y: sub ? -3 : 2 });
      lt.textContent = main; g.appendChild(lt);
      if (sub) { const st = svgEl("text", { "text-anchor": "middle", "font-size": 10, y: 11, fill: "#b3a892" }); st.textContent = sub; g.appendChild(st); }
      const yt = svgEl("text", { class:"yr", "text-anchor":"middle", y: -NH/2 - 4, "font-size":10 }); yt.textContent = n.year < 1000 ? "c."+n.year : n.year; g.appendChild(yt);
      if (n.pivot) { const star = svgEl("text", { "text-anchor":"middle", x: NW/2-8, y:-NH/2+12, "font-size":11, fill:"#e0c178" }); star.textContent="★"; g.appendChild(star); }
      if (n.fae) { const fr = svgEl("text", { class:"fae-ring", "text-anchor":"middle", x:-NW/2+10, y:-NH/2+13, "font-size":11 }); fr.textContent = "⟡"; g.appendChild(fr); }
      const ttl = svgEl("title"); ttl.textContent = `${n.label} (${n.year})` + (NODE2WIKI[n.id] ? " — click for wiki" : ""); g.appendChild(ttl);

      g.addEventListener("mouseenter", () => highlight(n.id, true));
      g.addEventListener("mouseleave", () => highlight(n.id, false));
      g.addEventListener("click", () => { const w = NODE2WIKI[n.id]; if (w) openWiki(w); });
      layer.appendChild(g);
      nodeEls[n.id] = g;
    });

    function highlight(id, on) {
      if (!on) {
        edgeEls.forEach(e => e.path.classList.remove("hot"));
        Object.values(nodeEls).forEach(g => g.classList.remove("dim"));
        return;
      }
      const keep = new Set([id]);
      (adj[id] || []).forEach(i => {
        const [from, to] = P.tree.edges[i];
        keep.add(from); keep.add(to);
      });
      edgeEls.forEach(e => { if (e.from === id || e.to === id) e.path.classList.add("hot"); });
      Object.keys(nodeEls).forEach(k => { if (!keep.has(k)) nodeEls[k].classList.add("dim"); });
    }

    const hostDiv = $("#tree-host"); hostDiv.innerHTML = ""; hostDiv.appendChild(svg);
    zoomers.tree = attachZoom(svg, layer, W, hostDiv);
  }

  /* ====================== IN-WORLD TIMELINE ====================== */
  const IW_KIND = {
    context: { c: "#8a7f6b", label: "Historical backdrop" },
    prelude: { c: "#7fb37f", label: "Before Arthur" },
    arthur:  { c: "#c9a24a", label: "Arthur's reign" },
    battle:  { c: "#cf6a6a", label: "Battle" },
    quest:   { c: "#c97f9a", label: "The Grail quest" },
    shadow:  { c: "#9a8fd0", label: "The fall" },
  };
  function renderInworld() {
    const iw = P.inworld;
    $("#inworld-intro").innerHTML = iw.intro;
    const leg = $("#inworld-legend"); leg.innerHTML = "";
    Object.values(IW_KIND).forEach((kd) => leg.appendChild(el("span", "li", `<span class="dot" style="background:${kd.c}"></span>${kd.label}`)));

    const padL = 18, padR = 24, padTop = 46, laneH = 42, bandH = 13;
    const plotW = 1080, W = padL + plotW + padR;
    const x = (yr) => padL + (yr - iw.axis.min) / (iw.axis.max - iw.axis.min) * plotW;
    const H = padTop + iw.events.length * laneH + 16;

    const svg = svgEl("svg", { class: "iw" });
    const layer = svgEl("g", { class: "zl" });
    svg.appendChild(layer);

    // axis + gridlines
    layer.appendChild(svgEl("line", { class: "iw-axisline", x1: padL, y1: padTop - 14, x2: padL + plotW, y2: padTop - 14 }));
    for (let yr = Math.ceil(iw.axis.min / iw.axis.tick) * iw.axis.tick; yr <= iw.axis.max; yr += iw.axis.tick) {
      const gx = x(yr);
      layer.appendChild(svgEl("line", { class: "iw-tick", x1: gx, y1: padTop - 18, x2: gx, y2: padTop - 10 }));
      layer.appendChild(svgEl("line", { class: "iw-grid", x1: gx, y1: padTop - 10, x2: gx, y2: H - 8 }));
      const tl = svgEl("text", { class: "iw-ticklabel", x: gx, y: padTop - 22, "text-anchor": "middle" });
      tl.textContent = yr + " AD"; layer.appendChild(tl);
    }

    iw.events.forEach((ev, i) => {
      const cy = padTop + i * laneH + laneH / 2 + 6;
      const kd = IW_KIND[ev.kind] || IW_KIND.arthur;
      const g = svgEl("g", { class: "iw-row" });
      // label + range, above the band
      const lab = svgEl("text", { class: "iw-label", x: x(ev.lo), y: cy - 11 });
      lab.textContent = ev.label; g.appendChild(lab);
      const rng = svgEl("text", { class: "iw-range", x: x(ev.hi) + 8, y: cy - 11 });
      rng.textContent = `c.${ev.best} (${ev.lo}–${ev.hi})`; g.appendChild(rng);
      // error band
      const bx = x(ev.lo), bw = Math.max(2, x(ev.hi) - x(ev.lo));
      const band = svgEl("rect", { class: "iw-band", x: bx, y: cy - bandH / 2, width: bw, height: bandH, rx: 7, fill: kd.c, "fill-opacity": 0.28, stroke: kd.c, "stroke-opacity": 0.55 });
      g.appendChild(band);
      // whisker caps
      g.appendChild(svgEl("line", { class: "iw-cap", x1: bx, y1: cy - bandH / 2 - 3, x2: bx, y2: cy + bandH / 2 + 3, stroke: kd.c }));
      g.appendChild(svgEl("line", { class: "iw-cap", x1: bx + bw, y1: cy - bandH / 2 - 3, x2: bx + bw, y2: cy + bandH / 2 + 3, stroke: kd.c }));
      // best-estimate diamond
      const dx = x(ev.best), ds = 6;
      g.appendChild(svgEl("path", { class: "iw-best", d: `M ${dx} ${cy - ds} L ${dx + ds} ${cy} L ${dx} ${cy + ds} L ${dx - ds} ${cy} Z`, fill: kd.c }));
      const ttl = svgEl("title"); ttl.textContent = `${ev.label} — best c.${ev.best}, range ${ev.lo}–${ev.hi} AD\n${ev.note}`; g.appendChild(ttl);
      layer.appendChild(g);
    });

    const host = $("#inworld-host"); host.innerHTML = ""; host.appendChild(svg);
    zoomers.inworld = attachZoom(svg, layer, W, host);

    // notes + sources below the diagram (touch has no hover tooltips)
    const notes = $("#inworld-notes"); notes.innerHTML = "";
    iw.events.forEach((ev) => {
      const kd = IW_KIND[ev.kind] || IW_KIND.arthur;
      const row = el("div", "iw-note");
      row.innerHTML = `<span class="dot" style="background:${kd.c}"></span><strong>${escapeHtml(ev.label)}</strong> <span class="iw-when">c.${ev.best} · band ${ev.lo}–${ev.hi}</span><br><span class="iw-text">${escapeHtml(ev.note)}</span> `;
      const lr = linkRow(ev.links); if (lr) row.appendChild(lr);
      notes.appendChild(row);
    });
  }

  /* ====================== WIKI ====================== */
  let wikiCat = "All";
  let wikiQuery = "";
  const CATS = ["All", "Person", "Text", "Motif", "Place", "Scholarship"];
  function renderWiki() {
    const cf = $("#cat-filters"); cf.innerHTML = "";
    CATS.forEach((c) => {
      const b = el("button", "cat-filter" + (c === wikiCat ? " active" : ""), c);
      b.onclick = () => { wikiCat = c; [...cf.children].forEach(x=>x.classList.remove("active")); b.classList.add("active"); drawWiki(); };
      cf.appendChild(b);
    });
    $("#wiki-search").addEventListener("input", (e) => { wikiQuery = e.target.value.toLowerCase().trim(); drawWiki(); });
    drawWiki();
  }
  const wikiById = {};
  function drawWiki() {
    const grid = $("#wiki-grid"); grid.innerHTML = "";
    let shown = 0;
    P.wiki.forEach((w) => {
      wikiById[w.id] = w;
      if (wikiCat !== "All" && w.cat !== wikiCat) return;
      if (wikiQuery) {
        const hay = (w.term + " " + w.body + " " + w.cat).toLowerCase();
        if (!hay.includes(wikiQuery)) return;
      }
      shown++;
      const card = el("div", "wiki-card"); card.id = "w-" + w.id;
      card.appendChild(el("span", "cat", w.cat));
      card.appendChild(el("h3", null, w.term));
      card.appendChild(el("div", "body", w.body));
      const lr = linkRow(w.links); if (lr) card.appendChild(lr);
      if (w.see && w.see.length) {
        const see = el("div", "wiki-see", "see also: ");
        w.see.forEach((sid, i) => {
          const target = P.wiki.find(x => x.id === sid);
          if (!target) return;
          const a = el("a", null, target.term);
          a.onclick = () => openWiki(sid);
          see.appendChild(a);
          if (i < w.see.length - 1) see.appendChild(document.createTextNode(" · "));
        });
        card.appendChild(see);
      }
      grid.appendChild(card);
    });
    $("#wiki-none").style.display = shown ? "none" : "block";
  }
  function openWiki(id) {
    // reset filters so the target is guaranteed visible
    wikiCat = "All"; wikiQuery = ""; $("#wiki-search").value = "";
    [...$("#cat-filters").children].forEach(x => x.classList.toggle("active", x.textContent === "All"));
    drawWiki();
    switchView("wiki");
    const card = $("#w-" + id);
    if (card) {
      card.scrollIntoView({ behavior: "smooth", block: "center" });
      card.classList.remove("flash"); void card.offsetWidth; card.classList.add("flash");
    }
  }

  /* ====================== FAE ====================== */
  function renderFae() {
    $("#fae-intro").innerHTML = P.fae.intro;
    const host = $("#fae-sections"); host.innerHTML = "";
    P.fae.sections.forEach((s) => {
      const sec = el("div", "fae-sec");
      sec.appendChild(el("h3", null, s.h));
      sec.appendChild(el("p", null, s.p));
      if (s.wikiSee) {
        const t = P.wiki.find(x => x.id === s.wikiSee);
        if (t) { const j = el("div", "jump"); const a = el("a", null, "→ " + t.term + " in the wiki"); a.onclick = () => openWiki(s.wikiSee); j.appendChild(a); sec.appendChild(j); }
      }
      host.appendChild(sec);
    });
  }

  /* ====================== PAPERS ====================== */
  function renderPapers() {
    const host = $("#papers"); host.innerHTML = "";
    P.papers.forEach((g) => {
      const grp = el("div", "paper-group");
      grp.appendChild(el("h3", null, g.group));
      g.items.forEach((it) => {
        const p = el("div", "paper");
        p.appendChild(el("div", "cite", it.cite));
        const note = el("div", "note", it.note + " ");
        if (it.link) { const L = resolveLink(it.link.includes("|") ? it.link : it.link + "|" + ("read")); const a = el("a", null, "↗ " + L.host); a.href = L.url; a.target = "_blank"; a.rel = "noopener"; note.appendChild(a); }
        p.appendChild(note);
        grp.appendChild(p);
      });
      host.appendChild(grp);
    });
  }


  /* ====================== VIEW SWITCHING ====================== */
  const VIEWS = ["home", "method", "compare", "timeline", "inworld", "constantine", "tree", "wiki", "fae", "papers"];
  let treeDrawn = false, inworldDrawn = false, compareDrawn = false, current = "home";
  function switchView(v) {
    current = v;
    VIEWS.forEach((x) => {
      $("#view-" + x).classList.toggle("active", x === v);
    });
    [...$("#tabs").children].forEach((b) => b.classList.toggle("active", b.dataset.view === v));
    if (v === "tree" && !treeDrawn) { renderTree(); treeDrawn = true; }
    if (v === "inworld" && !inworldDrawn) { renderInworld(); inworldDrawn = true; }
    if (v === "compare" && !compareDrawn) { renderCompare(); compareDrawn = true; }
    if (location.hash.slice(1).split("/")[0] !== v) history.replaceState(null, "", "#" + v);
    window.scrollTo({ top: 0 });
  }
  $("#tabs").addEventListener("click", (e) => { const b = e.target.closest(".tab"); if (b) switchView(b.dataset.view); });
  // in-body anchors like href="#fae" should switch views
  window.addEventListener("hashchange", () => { const v = location.hash.slice(1).split("/")[0]; if (VIEWS.includes(v)) switchView(v); });
  // refit the visible diagram on resize (debounced)
  let rT; window.addEventListener("resize", () => { clearTimeout(rT); rT = setTimeout(() => { const z = zoomers[current]; if (z) z.fit(); }, 180); });

  /* ====================== CROSSWALK (four tales side by side) ====================== */
  function renderCrosswalk() {
    const C = window.PENDRAGON && window.PENDRAGON.crosswalk;
    const host = $("#cw-host"); if (!C || !host) return;
    host.innerHTML = "";

    host.appendChild(el("p", "cw-intro", C.intro));

    const tales = C.tales;
    const taleIds = tales.map((t) => t.id);
    const taleMap = {}; tales.forEach((t) => taleMap[t.id] = t);
    const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII"];
    const passLabel = {
      culhwch: (n) => "M" + n,
      pwyll:   (n) => "Mvt " + (ROMAN[n] || n),
      orfeo:   (n) => "M" + (ROMAN[n] || n),
      gawain:  (n) => "F" + (ROMAN[n] || n),
      owain:   (n) => "Mvt " + (ROMAN[n] || n),
    };

    // dynamic grid template: code + name + one column per tale (the gloss spans full width below)
    host.style.setProperty("--cw-tale-cols", tales.length);

    function header() {
      const row = el("div", "cw-row cw-head");
      row.appendChild(el("div", "cw-code", "Code"));
      row.appendChild(el("div", "cw-name", "Name"));
      tales.forEach((t) => {
        const c = el("div", "cw-tale-head");
        c.innerHTML = `<a href="${t.href}" style="color: inherit;">${t.sigil} ${escapeHtml(t.short)}</a>`;
        row.appendChild(c);
      });
      return row;
    }

    function taleCell(taleId, entry) {
      const div = el("div", "cw-tale cw-" + taleId);
      if (!entry) {
        div.classList.add("cw-absent");
        div.innerHTML = '<span class="cw-no">—</span>';
        return div;
      }
      if (entry === "absent") { div.classList.add("cw-absent"); div.innerHTML = '<span class="cw-no">absent</span>'; return div; }
      if (entry === "present") { div.innerHTML = '<span class="cw-yes">✓</span>'; return div; }
      if (entry === "inverted") { div.innerHTML = '<span class="cw-yes">inverted</span>'; return div; }
      if (entry === "minimal")  { div.innerHTML = '<span class="cw-yes">minimal</span>'; return div; }
      if (typeof entry === "object" && entry !== null) {
        let html = '<span class="cw-yes">✓</span>';
        if (entry.passages && entry.passages.length) {
          const fn = passLabel[taleId] || ((n) => "" + n);
          html += '<span class="cw-pass">' + entry.passages.map(fn).join(" · ") + '</span>';
        } else if (entry.who) {
          html = '<span class="cw-yes">' + escapeHtml(entry.who) + '</span>';
        }
        if (entry.note) html += '<span class="cw-tnote">' + entry.note + '</span>';
        div.innerHTML = html;
        return div;
      }
      // any other truthy value
      div.innerHTML = '<span class="cw-yes">✓</span>';
      return div;
    }

    function countLabel(motif) {
      const n = taleIds.filter((id) => motif[id]).length;
      return '<span class="cw-count cw-c' + n + '">in ' + n + (n === 1 ? " tale" : " tales") + '</span>';
    }

    // ─ Motifs ─
    host.appendChild(el("h3", "cw-grouphead", "Shared motifs · Thompson codes"));
    host.appendChild(el("p", "cw-subnote", C.motifIntro));
    host.appendChild(header());
    // Sort: most-shared first, then descending; within each tier, stable
    const motifsSorted = C.motifs.slice().sort((a, b) => {
      const ca = taleIds.filter((id) => a[id]).length;
      const cb = taleIds.filter((id) => b[id]).length;
      return cb - ca;
    });
    motifsSorted.forEach((m) => {
      const row = el("div", "cw-row");
      row.appendChild(el("div", "cw-code", escapeHtml(m.code)));
      const nm = el("div", "cw-name", escapeHtml(m.name) + " " + countLabel(m));
      row.appendChild(nm);
      tales.forEach((t) => row.appendChild(taleCell(t.id, m[t.id])));
      if (m.gloss) {
        const g = el("div", "cw-gloss"); g.innerHTML = m.gloss; row.appendChild(g);
      }
      host.appendChild(row);
    });

    // ─ Propp ─
    host.appendChild(el("h3", "cw-grouphead", "Propp's functions across the four"));
    host.appendChild(el("p", "cw-subnote", C.proppIntro));
    host.appendChild(header());
    C.propp.forEach((p) => {
      const row = el("div", "cw-row");
      row.appendChild(el("div", "cw-code", `<em style="font-family: var(--serif); font-style: italic; color: var(--gold);">${escapeHtml(p.sym)}</em>`));
      row.appendChild(el("div", "cw-name", escapeHtml(p.name)));
      tales.forEach((t) => row.appendChild(taleCell(t.id, p[t.id])));
      if (p.gloss) { const g = el("div", "cw-gloss"); g.innerHTML = p.gloss; row.appendChild(g); }
      host.appendChild(row);
    });

    // ─ Archetypes ─
    host.appendChild(el("h3", "cw-grouphead", "Character archetypes"));
    host.appendChild(el("p", "cw-subnote", C.archetypeIntro));
    host.appendChild(header());
    C.archetypes.forEach((a) => {
      const row = el("div", "cw-row");
      row.appendChild(el("div", "cw-code", "—"));
      row.appendChild(el("div", "cw-name", escapeHtml(a.role)));
      tales.forEach((t) => row.appendChild(taleCell(t.id, a[t.id])));
      if (a.gloss) { const g = el("div", "cw-gloss"); g.innerHTML = a.gloss; row.appendChild(g); }
      host.appendChild(row);
    });
  }

  /* ====================== COMPARE (hypermythograph) ======================
     Three force-laid graphs (Motifs / Functions / Archetypes), each pinning
     the four tales at the corners and letting the structural items float
     toward whichever tales claim them. The middle of each graph is the
     shared backbone; the periphery is what each tale brings uniquely. */
  function renderCompare() {
    const C = window.PENDRAGON && window.PENDRAGON.crosswalk;
    const host = $("#cmp-host"); if (!C || !host) return;

    const W = 1100, H = 720;
    const tales = C.tales;
    const taleIds = tales.map((t) => t.id);
    const cornerFor = {
      [taleIds[0]]: { x: W * 0.13, y: H * 0.18 },
      [taleIds[1]]: { x: W * 0.87, y: H * 0.18 },
      [taleIds[2]]: { x: W * 0.87, y: H * 0.82 },
      [taleIds[3]]: { x: W * 0.13, y: H * 0.82 },
    };
    const passLabelLocal = {
      culhwch: (n) => "M" + n,
      pwyll:   (n) => "Mvt " + (["", "I", "II", "III", "IV", "V", "VI"][n] || n),
      orfeo:   (n) => "M" + (["", "I", "II", "III", "IV", "V", "VI"][n] || n),
      gawain:  (n) => "F" + (["", "I", "II", "III", "IV"][n] || n),
    };

    const MODES = [
      { id: "motifs",     label: "Motifs",     rows: () => C.motifs,     blurb: "Thompson motifs as gravity wells. The seven gold nodes in the centre are the codes every tale realises — the structural backbone. Single-coloured leaves at each corner are what that tale alone brings." },
      { id: "propp",      label: "Functions",  rows: () => C.propp,      blurb: "Propp's 31 narrative functions across the four tales. The function symbols (α, A, B, …) that fire in all four sit centrally; the structural absences and inversions drift to the edges." },
      { id: "archetypes", label: "Archetypes", rows: () => C.archetypes, blurb: "Character roles each tale fills with a different figure. A corner-clinging archetype is one only that tale carries; the centre archetypes are the ones every tale instantiates somehow." },
    ];

    let mode = "motifs";
    let multiOnly = false;
    let selectedId = null;

    function isPresent(row, taleId) {
      const v = row[taleId];
      if (!v) return false;
      if (typeof v === "string") return v !== "absent";
      if (typeof v === "object") {
        if (v.who === "—") return false;
        return true;
      }
      return false;
    }
    function itemsFor(modeId) {
      const rows = MODES.find((m) => m.id === modeId).rows();
      return rows.map((row, i) => {
        const hits = taleIds.filter((id) => isPresent(row, id));
        return {
          key: modeId + "-" + i,
          row,
          label: modeId === "motifs" ? row.code : modeId === "propp" ? row.sym : row.role,
          full:  modeId === "motifs" ? `${row.code} — ${row.name}` : modeId === "propp" ? `${row.sym} · ${row.name}` : row.role,
          hits,
        };
      });
    }

    // Controls (modes + multi-only toggle)
    const modesHost = $("#cmp-modes"); modesHost.innerHTML = "";
    MODES.forEach((m) => {
      const b = el("button", "cmp-mode" + (m.id === mode ? " active" : ""), m.label);
      b.onclick = () => { mode = m.id; selectedId = null; [...modesHost.children].forEach((x) => x.classList.remove("active")); b.classList.add("active"); $("#cmp-blurb").textContent = m.blurb; build(); };
      modesHost.appendChild(b);
    });
    const togHost = $("#cmp-toggles"); togHost.innerHTML = "";
    const togBtn = el("button", "cmp-toggle", "Multi-tale only");
    togBtn.onclick = () => { multiOnly = !multiOnly; togBtn.classList.toggle("active", multiOnly); build(); };
    togHost.appendChild(togBtn);
    $("#cmp-blurb").textContent = MODES[0].blurb;

    function build() {
      host.innerHTML = "";
      $("#cmp-detail").innerHTML = '<div class="md-hint">Click any node above to see how each tale realises it.</div>';

      const items = itemsFor(mode).filter((it) => !multiOnly || it.hits.length >= 2);

      // Node list: 4 tale nodes + items
      const nodes = tales.map((t) => ({
        id: "tale-" + t.id, type: "tale", tale: t, pinned: true,
        x: cornerFor[t.id].x, y: cornerFor[t.id].y, vx: 0, vy: 0,
      }));
      const idIdx = {}; nodes.forEach((n, i) => idIdx[n.id] = i);
      items.forEach((it) => {
        const cx = it.hits.length ? it.hits.reduce((s, id) => s + cornerFor[id].x, 0) / it.hits.length : W / 2;
        const cy = it.hits.length ? it.hits.reduce((s, id) => s + cornerFor[id].y, 0) / it.hits.length : H / 2;
        const ang = Math.random() * Math.PI * 2, rad = 50 + Math.random() * 80;
        nodes.push({ id: it.key, type: "item", item: it,
          x: cx + Math.cos(ang) * rad, y: cy + Math.sin(ang) * rad,
          vx: 0, vy: 0, hits: it.hits.length, pinned: false });
        idIdx[it.key] = nodes.length - 1;
      });

      // Edges: tale ↔ item, one per (tale, item) hit
      const edges = [];
      items.forEach((it) => {
        it.hits.forEach((taleId) => {
          edges.push({ a: idIdx["tale-" + taleId], b: idIdx[it.key], taleId });
        });
      });

      // SVG
      const svg = svgEl("svg", { class: "cmp-graph", viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "xMidYMid meet" });
      const layer = svgEl("g", { class: "zl" });
      svg.appendChild(layer);

      // Tale corner backdrops (faint quadrant labels)
      tales.forEach((t) => {
        const p = cornerFor[t.id];
        const halo = svgEl("circle", { cx: p.x, cy: p.y, r: 90, fill: t.color, "fill-opacity": 0.06 });
        layer.appendChild(halo);
      });

      const edgeEls = edges.map((e) => {
        const taleC = tales.find((t) => t.id === e.taleId).color;
        const ln = svgEl("line", { class: "cmp-edge", stroke: taleC, "stroke-opacity": 0.22, "stroke-width": 1.2 });
        layer.appendChild(ln); return ln;
      });

      const ITEM_R = (h) => 5 + 1.7 * Math.min(h, 4);
      const ITEM_FILL = (it) => {
        if (it.hits.length >= 4) return "#e0c178";
        if (it.hits.length === 3) return "#c9a24a";
        if (it.hits.length === 2) return "#8a7f6b";
        return tales.find((t) => t.id === it.hits[0])?.color || "#5d564a";
      };

      const adj = {}; edges.forEach((e, ei) => { (adj[e.a] = adj[e.a] || []).push(ei); (adj[e.b] = adj[e.b] || []).push(ei); });

      const nodeEls = nodes.map((n, i) => {
        if (n.type === "tale") {
          const g = svgEl("g", { class: "cmp-tnode", transform: `translate(${n.x} ${n.y})` });
          const r = 32;
          g.appendChild(svgEl("rect", { x: -r, y: -r, width: 2 * r, height: 2 * r, rx: 9, fill: n.tale.color, "fill-opacity": 0.92, stroke: "#14110d", "stroke-width": 1.8 }));
          const sigil = svgEl("text", { x: 0, y: -2, "text-anchor": "middle", "font-size": 24 }); sigil.textContent = n.tale.sigil; g.appendChild(sigil);
          const lab = svgEl("text", { x: 0, y: 18, "text-anchor": "middle", "font-size": 11, fill: "#14110d", "font-weight": 700 }); lab.textContent = n.tale.short; g.appendChild(lab);
          const ttl = svgEl("title"); ttl.textContent = n.tale.title; g.appendChild(ttl);
          g.addEventListener("click", () => { window.location.href = n.tale.href; });
          return g;
        }
        const g = svgEl("g", { class: "cmp-inode", transform: `translate(${n.x} ${n.y})` });
        g.appendChild(svgEl("circle", { cx: 0, cy: 0, r: ITEM_R(n.hits), fill: ITEM_FILL(n.item), "fill-opacity": 0.9, stroke: "#14110d", "stroke-width": 1 }));
        const ttl = svgEl("title"); ttl.textContent = n.item.full; g.appendChild(ttl);
        g.addEventListener("mouseenter", () => highlight(i));
        g.addEventListener("mouseleave", () => { selectedId ? null : clearHi(); });
        g.addEventListener("click", () => { selectedId = n.id; highlight(i); fillDetail(n.item); });
        return g;
      });
      nodeEls.forEach((g) => layer.appendChild(g));

      function highlight(i) {
        const inc = new Set(); (adj[i] || []).forEach((ei) => inc.add(ei));
        const keep = new Set([i]); (adj[i] || []).forEach((ei) => { keep.add(edges[ei].a); keep.add(edges[ei].b); });
        edgeEls.forEach((l, ei) => l.setAttribute("stroke-opacity", inc.has(ei) ? 0.85 : 0.08));
        nodeEls.forEach((gp, ni) => gp.style.opacity = keep.has(ni) ? 1 : 0.25);
      }
      function clearHi() {
        edgeEls.forEach((l) => l.setAttribute("stroke-opacity", 0.22));
        nodeEls.forEach((gp) => gp.style.opacity = 1);
      }
      function fillDetail(it) {
        const d = $("#cmp-detail"); d.innerHTML = "";
        const head = el("div", "cmp-d-head");
        head.appendChild(el("div", "cmp-d-label", escapeHtml(it.label)));
        head.appendChild(el("div", "cmp-d-name", escapeHtml(mode === "motifs" ? it.row.name : mode === "propp" ? it.row.name : it.row.role)));
        d.appendChild(head);
        if (it.row.gloss) { const g = el("div", "cmp-d-gloss"); g.innerHTML = it.row.gloss; d.appendChild(g); }
        const tlist = el("div", "cmp-d-tales");
        tales.forEach((t) => {
          const v = it.row[t.id];
          const card = el("div", "cmp-d-tcard"); card.style.borderLeftColor = t.color;
          const head2 = el("div", "cmp-d-thead", `${t.sigil} ${escapeHtml(t.short)}`);
          card.appendChild(head2);
          if (!v) { card.appendChild(el("div", "cmp-d-tnote cmp-d-absent", "—")); }
          else if (v === "absent") { card.appendChild(el("div", "cmp-d-tnote cmp-d-absent", "sharply absent")); card.classList.add("cmp-d-absent-card"); }
          else if (v === "present" || v === "minimal" || v === "inverted") {
            card.appendChild(el("div", "cmp-d-tnote", v));
          } else if (typeof v === "object") {
            if (v.passages && v.passages.length) {
              const fn = passLabelLocal[t.id] || ((n) => "" + n);
              card.appendChild(el("div", "cmp-d-tpass", v.passages.map(fn).join(" · ")));
            }
            if (v.who && v.who !== "—") card.appendChild(el("div", "cmp-d-twho", escapeHtml(v.who)));
            if (v.note) { const n = el("div", "cmp-d-tnote"); n.innerHTML = v.note; card.appendChild(n); }
          }
          tlist.appendChild(card);
        });
        d.appendChild(tlist);
      }

      // Force simulation
      const ITER = 320;
      const repel = 5400, springLen = 150, springK = 0.022, centerK = 0.0006, vDecay = 0.78;
      const wall = 36;
      const N = nodes.length;
      for (let it = 0; it < ITER; it++) {
        // O(N²) repulsion, edges as springs
        for (let i = 0; i < N; i++) {
          for (let j = i + 1; j < N; j++) {
            const A = nodes[i], B = nodes[j];
            let dx = B.x - A.x, dy = B.y - A.y, d2 = dx * dx + dy * dy; if (d2 < 16) d2 = 16;
            const f = repel / d2, d = Math.sqrt(d2), fx = (dx / d) * f, fy = (dy / d) * f;
            if (!A.pinned) { A.vx -= fx; A.vy -= fy; }
            if (!B.pinned) { B.vx += fx; B.vy += fy; }
          }
        }
        edges.forEach((e) => {
          const A = nodes[e.a], B = nodes[e.b];
          let dx = B.x - A.x, dy = B.y - A.y, d = Math.sqrt(dx * dx + dy * dy) || 0.01;
          const f = (d - springLen) * springK;
          const fx = (dx / d) * f, fy = (dy / d) * f;
          if (!A.pinned) { A.vx += fx; A.vy += fy; }
          if (!B.pinned) { B.vx -= fx; B.vy -= fy; }
        });
        nodes.forEach((n) => {
          if (n.pinned) return;
          n.vx += (W / 2 - n.x) * centerK;
          n.vy += (H / 2 - n.y) * centerK;
          n.vx *= vDecay; n.vy *= vDecay;
          n.x += n.vx; n.y += n.vy;
          if (n.x < wall) n.x = wall; if (n.x > W - wall) n.x = W - wall;
          if (n.y < wall) n.y = wall; if (n.y > H - wall) n.y = H - wall;
        });
      }

      // Paint final positions
      nodeEls.forEach((g, i) => g.setAttribute("transform", `translate(${nodes[i].x.toFixed(1)} ${nodes[i].y.toFixed(1)})`));
      edgeEls.forEach((l, ei) => {
        const e = edges[ei];
        l.setAttribute("x1", nodes[e.a].x.toFixed(1)); l.setAttribute("y1", nodes[e.a].y.toFixed(1));
        l.setAttribute("x2", nodes[e.b].x.toFixed(1)); l.setAttribute("y2", nodes[e.b].y.toFixed(1));
      });

      host.appendChild(svg);
      zoomers.compare = attachZoom(svg, layer, W, host);
    }

    build();
  }

  /* ====================== INIT ====================== */
  renderTimeline();
  renderWiki();
  renderCrosswalk();
  renderFae();
  renderPapers();
  // any anchor with data-wiki="<id>" opens that wiki entry (works in static sections too)
  document.addEventListener("click", (ev) => {
    const a = ev.target.closest && ev.target.closest("a[data-wiki]");
    if (a) { ev.preventDefault(); openWiki(a.getAttribute("data-wiki")); }
  });

  // hash routing: #view  or  #wiki/<entryId>
  const h = location.hash.slice(1);
  if (h) {
    const [v, sub] = h.split("/");
    if (VIEWS.includes(v)) { switchView(v); if (v === "wiki" && sub) setTimeout(() => openWiki(sub), 60); }
  }
})();
