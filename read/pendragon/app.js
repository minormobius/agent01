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

  /* ====================== CULHWCH (reading text) ====================== */
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
    const body = $("#tale-body");
    const ctr = $("#tale-controls"); ctr.innerHTML = "";
    [["parallel", "Parallel"], ["english", "English only"], ["welsh", "Welsh only"]].forEach(([m, label], i) => {
      const b = el("button", "tale-mode" + (i === 0 ? " active" : ""), label);
      b.onclick = () => { body.className = "tale-body " + m; [...ctr.children].forEach((x) => x.classList.remove("active")); b.classList.add("active"); };
      ctr.appendChild(b);
    });
    $("#tale-passage-title").textContent = t.passage.title;
    body.innerHTML = "";
    t.passage.segments.forEach((seg) => {
      const row = el("div", "tale-seg");
      row.appendChild(el("div", "seg-w", seg.w));
      row.appendChild(el("div", "seg-e", seg.e));
      if (seg.n) row.appendChild(el("div", "seg-n", seg.n));
      body.appendChild(row);
    });
    // notes/blurb cross-links into the wiki
    $("#view-culhwch").addEventListener("click", (ev) => {
      const a = ev.target.closest("a[data-wiki]");
      if (a) { ev.preventDefault(); openWiki(a.getAttribute("data-wiki")); }
    });
  }

  /* ====================== VIEW SWITCHING ====================== */
  const VIEWS = ["timeline", "inworld", "tree", "wiki", "fae", "culhwch", "papers"];
  let treeDrawn = false, inworldDrawn = false, current = "timeline";
  function switchView(v) {
    current = v;
    VIEWS.forEach((x) => {
      $("#view-" + x).classList.toggle("active", x === v);
    });
    [...$("#tabs").children].forEach((b) => b.classList.toggle("active", b.dataset.view === v));
    if (v === "tree" && !treeDrawn) { renderTree(); treeDrawn = true; }
    if (v === "inworld" && !inworldDrawn) { renderInworld(); inworldDrawn = true; }
    if (location.hash.slice(1).split("/")[0] !== v) history.replaceState(null, "", "#" + v);
    window.scrollTo({ top: 0 });
  }
  $("#tabs").addEventListener("click", (e) => { const b = e.target.closest(".tab"); if (b) switchView(b.dataset.view); });
  // in-body anchors like href="#fae" should switch views
  window.addEventListener("hashchange", () => { const v = location.hash.slice(1).split("/")[0]; if (VIEWS.includes(v)) switchView(v); });
  // refit the visible diagram on resize (debounced)
  let rT; window.addEventListener("resize", () => { clearTimeout(rT); rT = setTimeout(() => { const z = zoomers[current]; if (z) z.fit(); }, 180); });

  /* ====================== INIT ====================== */
  renderTimeline();
  renderWiki();
  renderFae();
  renderPapers();
  renderTale();

  // hash routing: #view  or  #wiki/<entryId>
  const h = location.hash.slice(1);
  if (h) {
    const [v, sub] = h.split("/");
    if (VIEWS.includes(v)) { switchView(v); if (v === "wiki" && sub) setTimeout(() => openWiki(sub), 60); }
  }
})();
