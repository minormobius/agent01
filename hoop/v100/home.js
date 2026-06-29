// home.js — THE ENTRY PORTAL backdrop. Two cosmetic canvases driven by one RAF loop:
//   • the ship-bore fly (ported from /forge/ship-app.js, stripped to a non-interactive auto-drift backdrop —
//     no HUD, no controls): concentric shells recede to a vanishing point, naves stud the inner ring, the
//     central light pipe runs the axis, vessel/cable systems thread the shell. The /forge modules are
//     DYNAMIC-imported so a missing asset degrades to a simple bore animation, never a blank screen.
//   • the DOOM-style "HOOP" wordmark: a heavy block face given the extruded-metal-bevel treatment
//     (red→chrome gradient, dark extrude, top-highlight, near-black outline, a slow specular sweep).
//
// Pure cosmetic + DOM-only. startHome(bgCanvas, titleCanvas) → stop(): cancels the loop + resize listener.

export function startHome(bg, title) {
  const ctx = bg.getContext('2d'), tctx = title.getContext('2d');
  let CW = 0, CH = 0, TW = 0, TH = 0, DPR = 1;
  let a0 = 0, yaw = 0, clock = 0, raf = null, stopped = false;
  let ship = null, OPT = null, R0 = 0, ROUT = 0, win = null, struct = null;

  // ── ship constants (mirrors ship-app.js) ──
  const FOC = 560, CAMBACK = 250, NEAR = 26, CAMR = 58, SPAN = 460;
  const R_LP = 6, LIGHTPIPE = [255, 244, 214];
  const MAT = [244, 191, 98], PED = [95, 208, 224], NAVE = [255, 214, 150];
  const POWER = [184, 142, 255], WATER = [79, 140, 255], CABLE = [127, 230, 160], BEAM = [134, 148, 172];
  const roleCol = { nave: NAVE, assembly: [244, 191, 98], refine: [95, 208, 224], foundry: [224, 119, 47], reclaim: [207, 107, 74], lower: [98, 108, 128] };
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

  // DYNAMIC import — graceful: if /forge isn't deployed alongside, the catch leaves ship=null → fallback bore.
  Promise.all([
    import('../forge/infinitefoam.js'),
    import('../forge/engines.js').catch(() => ({ ENGINES: {} })),
  ]).then(([fm, em]) => {
    if (stopped) return;
    ship = { ...fm, ENGINES: (em && em.ENGINES) || {} };
    OPT = { ...fm.DEFAULTS, seed: 1, Nth: 22 };
    R0 = OPT.R0; ROUT = OPT.R0 + OPT.Nr * OPT.Tr;
    rewindow();
  }).catch(() => { ship = null; });

  function rewindow() {
    if (!ship) return;
    const c = a0 + SPAN * 0.45;
    try { win = ship.shipWindow(c, SPAN, OPT); struct = ship.shipStructure(c, SPAN, OPT); } catch (e) { ship = null; }
  }

  // perspective down the bore (a fixed gentle pitch — the portal doesn't tilt)
  const PITCH = 0.13;
  function proj(p) {
    const cr = Math.cos(yaw), sr = Math.sin(yaw);
    const px = p.x, py = p.y + CAMR;
    const rx = px * cr - py * sr, ry0 = px * sr + py * cr;
    const fwd = (p.z - a0) + CAMBACK;
    const cp = Math.cos(PITCH), sp = Math.sin(PITCH);
    const ry = ry0 * cp - fwd * sp, depth = ry0 * sp + fwd * cp;
    if (depth <= NEAR) return { cull: true, d: -1e9 };
    const s = FOC / depth;
    return { x: CW / 2 + rx * s, y: CH / 2 - ry * s, d: depth, s, cull: false };
  }
  const fog = (depth) => Math.max(0.04, Math.min(1, 1.15 - (depth - CAMBACK) / (2.1 * SPAN)));
  function ringC(rho, z, alpha, col, dash) {
    ctx.beginPath(); let started = false;
    for (let k = 0; k <= 56; k++) { const a = k / 56 * Math.PI * 2, p = proj({ x: rho * Math.cos(a), y: rho * Math.sin(a), z }); if (p.cull) { started = false; continue; } if (!started) { ctx.moveTo(p.x, p.y); started = true; } else ctx.lineTo(p.x, p.y); }
    ctx.setLineDash(dash || []); ctx.strokeStyle = rgba(col, alpha); ctx.lineWidth = 1; ctx.stroke(); ctx.setLineDash([]);
  }
  const ring = (rho, z, alpha) => ringC(rho, z, alpha, [150, 170, 200]);
  function polyZ(x, y, z0, z1, col, alpha) {
    ctx.beginPath(); let started = false; const STEP = OPT.Tz;
    for (let z = z0; z <= z1 + 1e-3; z += STEP) { const p = proj({ x, y, z }); if (p.cull) { started = false; continue; } if (!started) { ctx.moveTo(p.x, p.y); started = true; } else ctx.lineTo(p.x, p.y); }
    ctx.strokeStyle = rgba(col, alpha); ctx.lineWidth = 1; ctx.stroke();
  }
  function drawLightPipe() {
    ctx.globalCompositeOperation = 'lighter';
    let prev = null, prevR = 0;
    for (let dz = -CAMBACK + NEAR + 6; dz <= SPAN * 1.9; dz += OPT.Tz * 0.6) {
      const p = proj({ x: 0, y: 0, z: a0 + dz }); if (p.cull) { prev = null; continue; }
      const f = Math.max(0.05, fog(dz + CAMBACK)), r = Math.min(14, Math.max(1, R_LP * p.s));
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 2.4);
      g.addColorStop(0, rgba(LIGHTPIPE, 0.22 * f)); g.addColorStop(0.5, rgba(LIGHTPIPE, 0.07 * f)); g.addColorStop(1, rgba(LIGHTPIPE, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, r * 2.4, 0, 7); ctx.fill();
      if (prev) { ctx.strokeStyle = rgba(LIGHTPIPE, 0.5 * f); ctx.lineWidth = Math.max(0.8, (r + prevR) * 0.3); ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(p.x, p.y); ctx.stroke(); }
      prev = p; prevR = r;
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

  function renderShip() {
    ctx.fillStyle = '#03040a'; ctx.fillRect(0, 0, CW, CH);
    for (let dz = -CAMBACK + 60; dz <= SPAN * 1.6; dz += OPT.Tz * 1.5) { const f = fog(dz + CAMBACK); ring(R0, a0 + dz, 0.22 * f); ring(ROUT, a0 + dz, 0.10 * f); }
    drawLightPipe();
    if (struct) {
      for (const ho of struct.hoops) { const f = fog((ho.z - a0) + CAMBACK); if (f <= 0.05) continue; ringC(ho.rho, ho.z, (ho.kind === 'outer' ? 0.32 : 0.16) * f, BEAM); }
      for (const sg of struct.stringers) polyZ(sg.x, sg.y, sg.z0, sg.z1, BEAM, 0.2);
      for (const dz of [SPAN * 0.15, SPAN * 0.6]) ringC(struct.coreClear, a0 + dz, 0.3 * fog(dz + CAMBACK), [96, 196, 196], [4, 5]);
    }
    const items = [];
    for (const [h, n] of win.material.edges) { const a = proj(h), b = proj(n); if (!a.cull && !b.cull) items.push({ t: 'e', col: MAT, a, b, depth: (a.d + b.d) / 2 }); }
    for (const h of win.material.hubs) { const p = proj(h); if (!p.cull) items.push({ t: h.nave ? 'nave' : 'h', col: roleCol[h.role] || MAT, p, hub: h, depth: p.d }); }
    for (const [h, n] of win.pedestrian.edges) { const a = proj(h), b = proj(n); if (!a.cull && !b.cull) items.push({ t: 'e', col: PED, a, b, depth: (a.d + b.d) / 2 }); }
    for (const h of win.pedestrian.hubs) { const p = proj(h); if (!p.cull) items.push({ t: 'p', col: PED, p, depth: p.d }); }
    for (const [kind, col] of [['power', POWER], ['water', WATER]]) {
      for (const [h, n] of win[kind].edges) { const a = proj(h), b = proj(n); if (!a.cull && !b.cull) items.push({ t: 'trunk', col, a, b, depth: (a.d + b.d) / 2 }); }
      for (const h of win[kind].hubs) { const p = proj(h); if (!p.cull) items.push({ t: 'tn', col, p, depth: p.d }); }
    }
    if (struct) for (const c of struct.cables) { const a = proj(c.a), b = proj(c.b); if (!a.cull && !b.cull) items.push({ t: 'cab', col: CABLE, a, b, depth: (a.d + b.d) / 2 }); }
    items.sort((x, y) => y.depth - x.depth);
    for (const it of items) {
      const f = fog(it.depth);
      if (it.t === 'e') { ctx.strokeStyle = rgba(it.col, 0.4 * f); ctx.lineWidth = 1.05 * (0.4 + f); ctx.beginPath(); ctx.moveTo(it.a.x, it.a.y); ctx.lineTo(it.b.x, it.b.y); ctx.stroke(); }
      else if (it.t === 'trunk') { ctx.strokeStyle = rgba(it.col, 0.66 * f); ctx.lineWidth = 2.1 * (0.45 + f); ctx.beginPath(); ctx.moveTo(it.a.x, it.a.y); ctx.lineTo(it.b.x, it.b.y); ctx.stroke(); }
      else if (it.t === 'cab') { ctx.strokeStyle = rgba(it.col, 0.6 * f); ctx.lineWidth = 1.2 * (0.4 + f); ctx.beginPath(); ctx.moveTo(it.a.x, it.a.y); ctx.lineTo(it.b.x, it.b.y); ctx.stroke(); }
      else if (it.t === 'tn') { const p = it.p; ctx.fillStyle = rgba(it.col, 0.85 * f); ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1.4, 2.6 * p.s), 0, 7); ctx.fill(); }
      else if (it.t === 'nave') { const p = it.p, pulse = 0.7 + 0.3 * Math.sin(clock * 2 + it.hub.ith), r = (7 + 2.5 * pulse) * p.s * 1.1;
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 2.6); g.addColorStop(0, rgba(NAVE, 0.5 * f)); g.addColorStop(1, rgba(NAVE, 0)); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, r * 2.6, 0, 7); ctx.fill();
        ctx.fillStyle = rgba(NAVE, 0.92 * f); ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7); ctx.fill(); ctx.strokeStyle = rgba(NAVE, f); ctx.lineWidth = 1.3; ctx.stroke(); }
      else { const p = it.p, isGland = it.t === 'h' && it.hub.gland, col = (isGland && ship.ENGINES[it.hub.gland]) ? hex(ship.ENGINES[it.hub.gland].color) : it.col;
        ctx.fillStyle = rgba(col, (it.t === 'p' ? 0.5 : 0.82) * f); ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1.1, (isGland ? 3.0 : 2.0) * p.s), 0, 7); ctx.fill(); }
    }
    const vg = ctx.createRadialGradient(CW / 2, CH / 2, Math.min(CW, CH) * 0.30, CW / 2, CH / 2, Math.max(CW, CH) * 0.62);
    vg.addColorStop(0, 'rgba(3,4,10,0)'); vg.addColorStop(1, 'rgba(3,4,10,.92)'); ctx.fillStyle = vg; ctx.fillRect(0, 0, CW, CH);
  }

  // FALLBACK bore: concentric receding rings + radial spokes converging to a vanishing point, scrolling in.
  function renderFallback() {
    ctx.fillStyle = '#03040a'; ctx.fillRect(0, 0, CW, CH);
    const cx = CW / 2, cy = CH / 2, maxR = Math.hypot(CW, CH) * 0.62;
    const phase = (a0 * 0.0016) % 1;
    ctx.lineWidth = 1;
    for (let i = 0; i < 22; i++) {
      const t = ((i + phase) % 22) / 22, r = maxR * t * t;       // t² → bunched at the vanishing point
      const al = Math.max(0.02, 0.5 * (1 - t));
      ctx.strokeStyle = `rgba(150,170,200,${al})`; ctx.beginPath(); ctx.arc(cx, cy, Math.max(1, r), 0, 7); ctx.stroke();
    }
    for (let k = 0; k < 24; k++) {
      const a = k / 24 * Math.PI * 2 + yaw, al = 0.10;
      ctx.strokeStyle = `rgba(95,208,224,${al})`; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * maxR, cy + Math.sin(a) * maxR); ctx.stroke();
    }
    const lg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 60); lg.addColorStop(0, 'rgba(255,244,214,0.5)'); lg.addColorStop(1, 'rgba(255,244,214,0)');
    ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(cx, cy, 60, 0, 7); ctx.fill();
    const vg = ctx.createRadialGradient(cx, cy, Math.min(CW, CH) * 0.30, cx, cy, maxR); vg.addColorStop(0, 'rgba(3,4,10,0)'); vg.addColorStop(1, 'rgba(3,4,10,.92)'); ctx.fillStyle = vg; ctx.fillRect(0, 0, CW, CH);
  }

  // ── the DOOM "HOOP" wordmark ──
  function drawTitle() {
    tctx.clearRect(0, 0, TW, TH);
    const text = 'HOOP';
    const fs = Math.max(34, Math.min(TH * 0.82, TW / 4.0));
    const cx = TW / 2, cy = TH * 0.54;
    tctx.save();
    // a touch of DOOM-poster perspective: slightly wider, a hair of upward shear at the centre
    tctx.translate(cx, cy); tctx.transform(1.06, 0, -0.04, 1, 0, 0); tctx.translate(-cx, -cy);
    tctx.font = `900 ${fs}px "Arial Black","Helvetica Neue",Impact,system-ui,sans-serif`;
    tctx.textAlign = 'center'; tctx.textBaseline = 'middle';
    // red under-glow
    tctx.save(); tctx.globalCompositeOperation = 'lighter'; tctx.shadowColor = 'rgba(226,59,46,0.8)'; tctx.shadowBlur = fs * 0.5;
    tctx.fillStyle = 'rgba(120,18,12,0.5)'; tctx.fillText(text, cx, cy); tctx.restore();
    // extruded depth (dark red), stepped down-right
    const depth = Math.max(5, fs * 0.10);
    for (let i = depth; i >= 1; i--) { const k = i / depth; tctx.fillStyle = `rgb(${(28 + 26 * (1 - k)) | 0},${(6 + 4 * (1 - k)) | 0},${5})`; tctx.fillText(text, cx + i * 0.55, cy + i); }
    // the metal face: chrome top → red body → deep core → red → dark base
    const g = tctx.createLinearGradient(0, cy - fs * 0.52, 0, cy + fs * 0.52);
    g.addColorStop(0.00, '#ffe6d2'); g.addColorStop(0.14, '#f06a4a'); g.addColorStop(0.30, '#e23b2e');
    g.addColorStop(0.50, '#8e1810'); g.addColorStop(0.53, '#5a0d08'); g.addColorStop(0.72, '#c22b1e'); g.addColorStop(1.00, '#7a140d');
    tctx.fillStyle = g; tctx.fillText(text, cx, cy);
    // top-edge bevel highlight
    tctx.save(); tctx.globalCompositeOperation = 'lighter';
    const hl = tctx.createLinearGradient(0, cy - fs * 0.52, 0, cy - fs * 0.1);
    hl.addColorStop(0, 'rgba(255,228,210,0.55)'); hl.addColorStop(1, 'rgba(255,228,210,0)');
    tctx.fillStyle = hl; tctx.fillText(text, cx, cy);
    // a slow specular sweep across the metal
    const sweep = (Math.sin(clock * 0.6) * 0.5 + 0.5);
    const sx = cx + (sweep * 2 - 1) * TW * 0.5;
    const sp = tctx.createLinearGradient(sx - fs * 0.5, 0, sx + fs * 0.5, 0);
    sp.addColorStop(0, 'rgba(255,255,255,0)'); sp.addColorStop(0.5, 'rgba(255,255,255,0.28)'); sp.addColorStop(1, 'rgba(255,255,255,0)');
    tctx.fillStyle = sp; tctx.fillText(text, cx, cy);
    tctx.restore();
    // near-black outline to seat the letters
    tctx.lineWidth = Math.max(1.6, fs * 0.02); tctx.strokeStyle = 'rgba(10,4,3,0.92)'; tctx.lineJoin = 'round'; tctx.strokeText(text, cx, cy);
    tctx.restore();
  }

  function resize() {
    DPR = Math.min(devicePixelRatio || 1, 2);
    let r = bg.getBoundingClientRect(); CW = r.width || innerWidth; CH = r.height || innerHeight;
    bg.width = CW * DPR | 0; bg.height = CH * DPR | 0; ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    r = title.getBoundingClientRect(); TW = r.width || innerWidth; TH = r.height || (innerHeight * 0.33);
    title.width = TW * DPR | 0; title.height = TH * DPR | 0; tctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    drawTitle();
  }

  let last = 0;
  function frame(ts) {
    if (stopped) return;
    raf = requestAnimationFrame(frame);
    const dt = last ? Math.min(0.05, (ts - last) / 1000) : 0; last = ts; clock += dt;
    a0 += 0.4 * 170 * dt; yaw += dt * 0.03;     // auto-fly down the bore + a slow roll for life
    if (ship && win) { rewindow(); renderShip(); } else { renderFallback(); }
    drawTitle();
  }

  addEventListener('resize', resize);
  resize();
  raf = requestAnimationFrame(frame);

  return function stop() { stopped = true; if (raf) cancelAnimationFrame(raf); removeEventListener('resize', resize); };
}

export default { startHome };
