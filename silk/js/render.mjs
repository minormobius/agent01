// render.mjs — drawing the fabric.
//
// Deliberately dumb: it reads the fabric and paints it, and knows nothing about
// stages or rules. Two passes per thread class (a wide dim stroke under a
// narrow bright one) instead of `shadowBlur`, which is what a canvas glow
// normally costs — a finished web is ~2000 threads and shadowBlur on that many
// strokes drops the frame rate by an order of magnitude for a look you can
// fake with two lineWidths.

const PALETTE = {
  bg: '#080a0e',
  bridge:  { under: 'rgba(190,164,120,0.16)', over: 'rgba(214,192,154,0.80)', w: 2.2 },
  frame:   { under: 'rgba(190,164,120,0.14)', over: 'rgba(203,180,143,0.72)', w: 1.9 },
  anchor:  { under: 'rgba(190,164,120,0.10)', over: 'rgba(180,158,120,0.55)', w: 1.4 },
  radius:  { under: 'rgba(160,180,200,0.10)', over: 'rgba(176,192,208,0.52)', w: 1.1 },
  hub:     { under: 'rgba(200,214,228,0.12)', over: 'rgba(206,218,230,0.62)', w: 1.1 },
  aux:     { under: 'rgba(66,120,140,0.00)',  over: 'rgba(86,150,172,0.46)',  w: 0.9, dash: [3, 5] },
  capture: { under: 'rgba(226,240,252,0.13)', over: 'rgba(238,247,255,0.86)', w: 0.85 },
  anchorDot: '#d8a445',
  obstacle: { fill: 'rgba(24,40,26,0.92)', edge: 'rgba(64,104,68,0.85)' },
  spider: '#efe9dc',
  dew: 'rgba(196,226,255,0.55)',
};

export const ORDER = ['anchor', 'frame', 'bridge', 'radius', 'hub', 'aux', 'capture'];

// Fit a world box into a canvas, preserving aspect. Returns a transform the
// caller applies with ctx.setTransform, plus the scale for line widths.
export function fit(canvas, world, pad = 18) {
  const w = canvas.width;
  const h = canvas.height;
  const s = Math.min((w - pad * 2) / world.w, (h - pad * 2) / world.h);
  return { s, tx: (w - world.w * s) / 2, ty: (h - world.h * s) / 2 };
}

export function clear(ctx, canvas) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = PALETTE.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

export function drawBoundary(ctx, bnd, T, { anchors = true } = {}) {
  ctx.setTransform(T.s, 0, 0, T.s, T.tx, T.ty);
  for (const o of bnd.obstacles || []) {
    ctx.beginPath();
    ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
    ctx.fillStyle = PALETTE.obstacle.fill;
    ctx.fill();
    ctx.lineWidth = 1.6 / T.s;
    ctx.strokeStyle = PALETTE.obstacle.edge;
    ctx.stroke();
  }
  if (!anchors) return;
  for (const a of bnd.anchors) {
    ctx.beginPath();
    ctx.arc(a.x, a.y, 4.5 / T.s, 0, Math.PI * 2);
    ctx.fillStyle = PALETTE.anchorDot;
    ctx.fill();
  }
}

// alpha scales the whole web — used by the family overlay to stack 16 of them.
// `tint` collapses the whole web to one colour, for overlaying two runs of the
// same boundary — the comparison is about where the threads are, and two full
// palettes on top of each other is unreadable.
export function drawWeb(ctx, fabric, T, { alpha = 1, only = null, dew = false, tint = null } = {}) {
  ctx.setTransform(T.s, 0, 0, T.s, T.tx, T.ty);
  ctx.lineCap = 'round';
  ctx.globalAlpha = alpha;

  const buckets = new Map();
  for (const t of fabric.threads) {
    if (t.dead) continue;
    if (only && !only.includes(t.kind)) continue;
    if (!buckets.has(t.kind)) buckets.set(t.kind, []);
    buckets.get(t.kind).push(t);
  }

  for (const kind of ORDER) {
    const list = buckets.get(kind);
    if (!list) continue;
    const p = PALETTE[kind] || PALETTE.radius;
    for (const pass of tint ? ['over'] : ['under', 'over']) {
      if (pass === 'under' && p.under === 'rgba(66,120,140,0.00)') continue;
      if (tint) {
        ctx.setLineDash([]);
        ctx.beginPath();
        for (const t of list) { ctx.moveTo(t.a.x, t.a.y); ctx.lineTo(t.b.x, t.b.y); }
        ctx.strokeStyle = tint;
        ctx.lineWidth = p.w / T.s;
        ctx.stroke();
        continue;
      }
      ctx.beginPath();
      for (const t of list) {
        ctx.moveTo(t.a.x, t.a.y);
        ctx.lineTo(t.b.x, t.b.y);
      }
      ctx.setLineDash(pass === 'over' && p.dash ? p.dash.map((d) => d / T.s) : []);
      ctx.strokeStyle = p[pass];
      ctx.lineWidth = (pass === 'under' ? p.w * 3.4 : p.w) / T.s;
      ctx.stroke();
    }
  }
  ctx.setLineDash([]);

  if (dew) {
    // One droplet every few capture junctions. Purely decorative, and cheap —
    // it is what makes a finished orb read as an object rather than a diagram.
    ctx.fillStyle = PALETTE.dew;
    let i = 0;
    for (const t of fabric.threads) {
      if (t.dead || t.kind !== 'capture') continue;
      if ((i++ % 7) !== 0) continue;
      ctx.beginPath();
      ctx.arc(t.b.x, t.b.y, 1.5 / T.s, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

// A spider, drawn small enough that the eye reads position and heading and no
// more. Eight legs in two fans, because four looks like an insect.
export function drawSpider(ctx, pos, heading, T, scale = 1) {
  ctx.setTransform(T.s, 0, 0, T.s, T.tx, T.ty);
  const r = (9 * scale) / T.s;   // constant on screen, whatever the zoom
  ctx.save();
  ctx.translate(pos.x, pos.y);
  ctx.rotate(heading);
  ctx.strokeStyle = PALETTE.spider;
  ctx.fillStyle = PALETTE.spider;
  ctx.lineWidth = 1.1 / T.s;
  ctx.lineCap = 'round';
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const a = side * (0.42 + i * 0.44);
      const L = r * (1.9 - Math.abs(i - 1.4) * 0.22);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(Math.cos(a) * L * 0.6, Math.sin(a) * L * 0.75,
                           Math.cos(a) * L, Math.sin(a) * L * 0.35);
      ctx.stroke();
    }
  }
  ctx.beginPath();
  ctx.ellipse(-r * 0.45, 0, r * 0.62, r * 0.48, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(r * 0.32, 0, r * 0.34, r * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// The dragline: the agent is always attached to where it last was.
export function drawDragline(ctx, from, to, T) {
  ctx.setTransform(T.s, 0, 0, T.s, T.tx, T.ty);
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.strokeStyle = 'rgba(240,246,255,0.35)';
  ctx.lineWidth = 0.8 / T.s;
  ctx.stroke();
}
