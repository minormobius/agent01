
(async function () {
  const D = await (await fetch('data.json')).json();
  const N = D.nodes.length;
  const nodes = D.nodes.map((n, i) => ({ i, did: n[0], handle: n[1], bot: !!n[2], depth: n[3], crawled: !!n[4], comm: n[5], x: 0, y: 0, vx: 0, vy: 0, inn: 0, out: [], ins: [], fixed: false }));
  const E = D.edges, dir = new Set(), all = [];
  for (let k = 0; k < E.length; k += 2) { const a = E[k], b = E[k + 1]; if (a === b) continue; all.push([a, b]); dir.add(a * N + b); nodes[b].inn++; nodes[a].out.push(b); nodes[b].ins.push(a); }
  const mutual = all.filter(([a, b]) => a < b && dir.has(b * N + a));
  const short = (h) => h.replace(/\.delve\.town$/, '');
  document.getElementById('counts').textContent = `${N} accounts, ${all.length} follows, ${mutual.length} mutual pairs.`;
  document.getElementById('q').textContent = D.modularity.Q.best;
  document.getElementById('qnull').textContent = D.modularity.nullBestQ.max;
  document.getElementById('at').textContent = D.at.slice(0, 16).replace('T', ' ') + ' UTC';
  document.getElementById('reads').textContent = D.reads;

  // colours: categorical, readable on dark
  const PAL = ['#ff7a59', '#4cc9f0', '#f7c948', '#7bd389', '#c77dff', '#ff5d8f', '#56cfe1', '#e9c46a', '#90be6d', '#f4a261', '#b8c0ff', '#ffadad', '#a0c4ff'];
  const colourOf = {
    comm: (n) => (n.comm < 0 ? '#666' : PAL[n.comm % PAL.length]),
    bot: (n) => (n.bot ? '#ff7a59' : '#4cc9f0'),
    depth: (n) => ['#f7c948', '#7bd389', '#c77dff'][Math.min(n.depth, 2)],
  };
  const legends = {
    comm: () => { const g = {}; nodes.forEach((n) => { (g[n.comm] ??= []).push(n); }); return Object.keys(g).map(Number).sort((a, b) => (a < 0) - (b < 0) || a - b).map((k) => { const top = g[k].slice().sort((a, b) => b.inn - a.inn).slice(0, 3).map((n) => short(n.handle)).join(', '); return [colourOf.comm(g[k][0]), k < 0 ? `no mutual follow (${g[k].length})` : `${g[k].length}: ${top}`, (n) => n.comm === k]; }); },
    bot: () => [['#ff7a59', `bot label (${nodes.filter((n) => n.bot).length})`, (n) => n.bot], ['#4cc9f0', `no label (${nodes.filter((n) => !n.bot).length})`, (n) => !n.bot]],
    depth: () => [0, 1, 2].map((d) => [colourOf.depth({ depth: d }), ['seed', 'followed by seed', 'two hops'][d] + ` (${nodes.filter((n) => Math.min(n.depth, 2) === d).length})`, (n) => Math.min(n.depth, 2) === d]),
  };

  const $ = (id) => document.getElementById(id);
  const cv = $('c'), ctx = cv.getContext('2d');
  let W, H, dpr;
  function resize() { dpr = window.devicePixelRatio || 1; W = innerWidth; H = innerHeight; cv.width = W * dpr; cv.height = H * dpr; }
  addEventListener('resize', () => { resize(); draw(); }); resize();

  // initial layout: rings by depth, golden angle
  nodes.forEach((n, i) => { const r = 40 + n.depth * 160 + (i % 7) * 6; const a = i * 2.39996; n.x = Math.cos(a) * r; n.y = Math.sin(a) * r; });
  nodes[0].x = 0; nodes[0].y = 0;

  const P = { charge: 120, len: 55, k: 0.25, g: 0.012 };
  const bind = (id, f, show) => { const el = $(id); const upd = () => { f(+el.value); $('v-' + id).textContent = show(+el.value); alpha = Math.max(alpha, 0.5); }; el.oninput = upd; upd(); };
  let alpha = 1;
  bind('charge', (v) => (P.charge = v), (v) => v);
  bind('len', (v) => (P.len = v), (v) => v);
  bind('k', (v) => (P.k = v / 100), (v) => (v / 100).toFixed(2));
  bind('g', (v) => (P.g = v / 1000), (v) => (v / 1000).toFixed(3));
  const links = () => ($('edgemode').value === 'all' ? all : mutual);
  const radius = (n) => ($('sizeby').value === 'flat' ? 5 : 3 + Math.sqrt(n.inn) * 1.3);

  function tick() {
    const L = links(); // layout always uses some links so 'none' doesn't explode
    const LL = L.length ? L : mutual;
    for (let a = 0; a < N; a++) {
      const p = nodes[a];
      for (let b = a + 1; b < N; b++) {
        const q = nodes[b]; let dx = p.x - q.x, dy = p.y - q.y, d2 = dx * dx + dy * dy;
        if (d2 < 1) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = 1; }
        if (d2 > 250000) continue;
        const f = (P.charge * alpha) / d2; p.vx += dx * f; p.vy += dy * f; q.vx -= dx * f; q.vy -= dy * f;
      }
    }
    const w = LL === all ? 0.35 : 1;
    for (const [a, b] of LL) {
      const p = nodes[a], q = nodes[b]; const dx = q.x - p.x, dy = q.y - p.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = ((d - P.len) / d) * P.k * w * alpha; p.vx += dx * f; p.vy += dy * f; q.vx -= dx * f; q.vy -= dy * f;
    }
    for (const n of nodes) {
      n.vx -= n.x * P.g * alpha; n.vy -= n.y * P.g * alpha;
      if (n.fixed) { n.vx = n.vy = 0; continue; }
      n.vx *= 0.6; n.vy *= 0.6; n.x += Math.max(-30, Math.min(30, n.vx)); n.y += Math.max(-30, Math.min(30, n.vy));
    }
    alpha = Math.max(alpha * 0.985, 0.02);
  }

  // view
  let view = { x: 0, y: 0, s: 1 };
  function fit() { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const n of nodes) { x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y); x1 = Math.max(x1, n.x); y1 = Math.max(y1, n.y); } const s = Math.min(W / (x1 - x0 + 80), H / (y1 - y0 + 80)); view = { s, x: W / 2 - ((x0 + x1) / 2) * s, y: H / 2 - ((y0 + y1) / 2) * s }; }
  const toWorld = (sx, sy) => [(sx - view.x) / view.s, (sy - view.y) / view.s];

  let hover = null, sel = null, focus = null; // focus: legend filter
  function neighbours(n) { return new Set([n.i, ...n.out, ...n.ins]); }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    ctx.setTransform(dpr * view.s, 0, 0, dpr * view.s, dpr * view.x, dpr * view.y);
    const col = colourOf[$('colour').value], mode = $('edgemode').value;
    const nb = sel ? neighbours(sel) : null;
    const lit = (n) => (!nb || nb.has(n.i)) && (!focus || focus(n));
    if (mode !== 'none') {
      ctx.lineWidth = 0.6 / view.s;
      const L = mode === 'all' ? all : mutual;
      ctx.strokeStyle = mode === 'all' ? 'rgba(200,200,200,.07)' : 'rgba(200,200,200,.16)';
      ctx.beginPath();
      for (const [a, b] of L) { if (nb && !(a === sel.i || b === sel.i)) continue; const p = nodes[a], q = nodes[b]; ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); }
      if (!nb) ctx.stroke();
    }
    if (nb) { // selected: draw its out (solid) and in (dashed) edges coloured
      ctx.lineWidth = 1 / view.s;
      ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); for (const b of sel.out) { ctx.moveTo(sel.x, sel.y); ctx.lineTo(nodes[b].x, nodes[b].y); } ctx.stroke();
      ctx.setLineDash([3 / view.s, 3 / view.s]); ctx.strokeStyle = 'rgba(255,220,120,.6)'; ctx.beginPath(); for (const a of sel.ins) { ctx.moveTo(sel.x, sel.y); ctx.lineTo(nodes[a].x, nodes[a].y); } ctx.stroke(); ctx.setLineDash([]);
    }
    for (const n of nodes) {
      const r = radius(n), on = lit(n);
      ctx.globalAlpha = on ? 1 : 0.12;
      ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, 6.2832);
      ctx.fillStyle = '#17181b'; ctx.fill();
      ctx.lineWidth = Math.max(1.5, r * 0.35); ctx.strokeStyle = col(n); ctx.stroke();
      if (n.bot && $('colour').value !== 'bot') { ctx.fillStyle = col(n); ctx.beginPath(); ctx.arc(n.x, n.y, r * 0.3, 0, 6.2832); ctx.fill(); }
      if (n === sel || n === hover) { ctx.lineWidth = 1.5 / view.s; ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.arc(n.x, n.y, r + 3 / view.s, 0, 6.2832); ctx.stroke(); }
    }
    ctx.globalAlpha = 1;
    if ($('labels').checked) {
      ctx.font = `${11 / view.s}px ui-monospace, monospace`; ctx.textAlign = 'center';
      for (const n of nodes) {
        if (!lit(n)) continue;
        const r = radius(n), big = r * view.s > 9 || (nb && nb.has(n.i)) || n === hover;
        if (!big) continue;
        ctx.fillStyle = 'rgba(232,230,225,.9)'; ctx.fillText(short(n.handle), n.x, n.y + r + 11 / view.s);
      }
    }
  }

  function info(n) {
    if (!n) { $('info').innerHTML = 'Hover a node for its handle. Click to pin its neighbourhood; click empty space to clear. Drag nodes; scroll to zoom; drag the background to pan.'; $('info').className = 'dim'; return; }
    const mut = n.out.filter((b) => dir.has(b * N + n.i)).length;
    const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    $('info').className = '';
    $('info').innerHTML = `<b>${esc(n.handle)}</b><br>${n.bot ? 'bot label' : 'no bot label'} · ${['seed', 'one hop', 'two hops'][Math.min(n.depth, 2)]} · community ${n.comm < 0 ? 'none' : n.comm}<br>followed by ${n.inn} in the map, ${n.crawled ? `follows ${n.out.length} in the map` : 'follows not crawled'}, ${mut} mutual<br><span class="dim">solid lines: follows · dashed: followed by</span>`;
  }

  function legend() {
    const L = legends[$('colour').value]();
    $('legend').innerHTML = '';
    for (const [c, label, f] of L) {
      const d = document.createElement('div');
      d.innerHTML = `<span class="sw" style="border-color:${c}"></span><span></span>`;
      d.lastChild.textContent = label;
      d.onclick = () => { focus = focus === f ? null : f; [...$('legend').children].forEach((x) => (x.style.opacity = 1)); if (focus) [...$('legend').children].forEach((x) => (x.style.opacity = x === d ? 1 : 0.4)); draw(); };
      $('legend').appendChild(d);
    }
  }
  $('colour').onchange = () => { focus = null; legend(); draw(); };
  $('edgemode').onchange = () => { alpha = Math.max(alpha, 0.6); };
  $('sizeby').onchange = draw; $('labels').onchange = draw;
  $('reheat').onclick = () => { nodes.forEach((n) => { n.fixed = false; n.x += (Math.random() - 0.5) * 50; n.y += (Math.random() - 0.5) * 50; }); alpha = 1; };
  $('fit').onclick = () => { fit(); draw(); };
  $('hide').onclick = () => { const p = $('panel'); p.style.display = p.style.display === 'none' ? '' : 'none'; };
  legend();

  // interaction
  function pick(sx, sy) { const [x, y] = toWorld(sx, sy); let best = null, bd = 1e9; for (const n of nodes) { const d = Math.hypot(n.x - x, n.y - y); const r = radius(n) + 4 / view.s; if (d < r && d < bd) { bd = d; best = n; } } return best; }
  let drag = null, pan = null, moved = false;
  cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); moved = false; const n = pick(e.clientX, e.clientY); if (n) { drag = n; n.fixed = true; } else pan = [e.clientX - view.x, e.clientY - view.y]; cv.classList.add('dragging'); });
  cv.addEventListener('pointermove', (e) => {
    if (drag) { const [x, y] = toWorld(e.clientX, e.clientY); drag.x = x; drag.y = y; moved = true; alpha = Math.max(alpha, 0.3); }
    else if (pan) { view.x = e.clientX - pan[0]; view.y = e.clientY - pan[1]; moved = true; }
    else { const n = pick(e.clientX, e.clientY); if (n !== hover) { hover = n; if (!sel) info(n); } }
    draw();
  });
  cv.addEventListener('pointerup', (e) => {
    cv.classList.remove('dragging');
    if (!moved) { const n = pick(e.clientX, e.clientY); sel = n && n !== sel ? n : null; info(sel); }
    if (drag && !moved) drag.fixed = false;
    drag = null; pan = null; draw();
  });
  cv.addEventListener('wheel', (e) => { e.preventDefault(); const f = Math.exp(-e.deltaY * 0.0015); const [x, y] = toWorld(e.clientX, e.clientY); view.s *= f; view.x = e.clientX - x * view.s; view.y = e.clientY - y * view.s; draw(); }, { passive: false });

  for (let i = 0; i < 250; i++) tick();
  alpha = 0.3; fit();
  let autoFit = 60;
  (function loop() { if (alpha > 0.021) { tick(); if (autoFit-- > 0) fit(); } draw(); requestAnimationFrame(loop); })();
})();
