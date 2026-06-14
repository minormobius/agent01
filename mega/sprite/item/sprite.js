// sprite.js — procedural, deterministic ITEM SPRITE renderer.
//
// Draws an item (from items.js rollItem) onto a Canvas2D context. NOT AI-generated — fully
// procedural, so it's deterministic (same item ⇒ same pixels everywhere, the load-bearing rule)
// and costs nothing. Honours hoop/NPC-SPRITES.md's contract: a 32×32 logical box (≈4px margin),
// thin dark outline (#05060a), flat low-saturation material fill, no baked scene shadow, reads at
// a glance. Each KIND has a distinct silhouette tinted by MATERIAL; QUALITY paints a rarity frame;
// AFFIXES add small decorative cues (edge glint, gem, rune, trim, patina).
//
// Pure w.r.t. ctx: every form only CALLS ctx methods/sets props (never reads), so it's headlessly
// testable by recording the call log (test/sprite.selftest.mjs).

const OUTLINE = '#05060a';
const UNIT = 32;                     // logical box; we scale to the requested pixel size

// hex → rgb(...) shaded by amt in [-1,1] (positive lightens toward white, negative darkens).
function shade(hex, amt) {
  const c = hex.replace('#', '');
  const n = parseInt(c.length === 3 ? c.replace(/(.)/g, '$1$1') : c, 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const f = (v) => (amt >= 0 ? Math.round(v + (255 - v) * amt) : Math.round(v * (1 + amt)));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

// ── per-KIND silhouettes — all draw inside a 0..32 box, centred, north = up ────────────────────
function poly(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}
function fillStroke(ctx, fill, lw = 1) { ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = OUTLINE; ctx.lineWidth = lw; ctx.stroke(); }

export const FORMS = {
  blade(ctx, c, sheen) {
    // grip + pommel
    ctx.fillStyle = '#2a221c'; ctx.fillRect(15, 23, 2, 6); ctx.strokeStyle = OUTLINE; ctx.lineWidth = 0.8; ctx.strokeRect(15, 23, 2, 6);
    poly(ctx, [[15.5, 29.5], [16.5, 29.5], [16, 31], [15.5, 31]]); fillStroke(ctx, '#3a2f26', 0.8);     // pommel
    poly(ctx, [[11, 22], [21, 22], [20, 24], [12, 24]]); fillStroke(ctx, shade(c, -0.25));               // cross guard
    poly(ctx, [[16, 3], [18.5, 7], [18, 22], [14, 22], [13.5, 7]]); fillStroke(ctx, c);                  // blade
    ctx.strokeStyle = shade(c, sheen * 0.7 + 0.2); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(16, 5); ctx.lineTo(16, 21); ctx.stroke(); // fuller highlight
  },
  tool(ctx, c, sheen) {
    ctx.fillStyle = '#5a4326'; ctx.fillRect(15, 11, 2, 18); ctx.strokeStyle = OUTLINE; ctx.lineWidth = 0.8; ctx.strokeRect(15, 11, 2, 18); // handle
    poly(ctx, [[8, 5], [24, 5], [24, 12], [8, 12]]); fillStroke(ctx, shade(c, -0.1));                    // hammer head
    ctx.fillStyle = shade(c, sheen * 0.6 + 0.15); ctx.fillRect(9, 6, 5, 2);                              // face glint
  },
  vessel(ctx, c, sheen) {
    poly(ctx, [[14, 4], [18, 4], [18, 8], [21, 14], [21, 26], [11, 26], [11, 14], [14, 8]]); fillStroke(ctx, c); // amphora
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(13, 4); ctx.lineTo(19, 4); ctx.stroke(); // lip
    ctx.globalAlpha = 0.5; ctx.fillStyle = shade(c, sheen * 0.5 + 0.2); poly(ctx, [[12.5, 16], [15, 16], [15, 25], [12.5, 25]]); ctx.fill(); ctx.globalAlpha = 1; // body glint
  },
  garment(ctx, c, sheen) {
    poly(ctx, [[16, 4], [22, 7], [25, 12], [22, 13], [21, 28], [11, 28], [10, 13], [7, 12], [10, 7]]); fillStroke(ctx, c); // cloak with shoulders
    ctx.fillStyle = shade(c, -0.25); poly(ctx, [[14, 5], [18, 5], [17, 9], [15, 9]]); ctx.fill();          // collar
    ctx.strokeStyle = shade(c, sheen * 0.4 + 0.15); ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(16, 9); ctx.lineTo(16, 27); ctx.stroke(); // fold
  },
  charm(ctx, c, sheen) {
    ctx.strokeStyle = shade(c, 0.1); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(16, 13, 8, Math.PI * 0.15, Math.PI * 0.85, false); ctx.stroke(); // chain arc
    poly(ctx, [[16, 14], [22, 21], [16, 29], [10, 21]]); fillStroke(ctx, c);                              // pendant
    ctx.fillStyle = shade(c, sheen * 0.6 + 0.25); poly(ctx, [[16, 18], [19, 21], [16, 25], [13, 21]]); ctx.fill(); // inner facet
  },
  tome(ctx, c, sheen) {
    poly(ctx, [[7, 6], [25, 6], [25, 27], [7, 27]]); fillStroke(ctx, shade(c, -0.1));                     // cover
    ctx.fillStyle = '#e8dcc0'; ctx.fillRect(9, 8, 14, 17); ctx.strokeStyle = OUTLINE; ctx.lineWidth = 0.6; ctx.strokeRect(9, 8, 14, 17); // pages
    ctx.fillStyle = shade(c, -0.3); ctx.fillRect(15.2, 6, 1.6, 21);                                       // spine
    ctx.strokeStyle = shade(c, sheen * 0.5 + 0.3); ctx.lineWidth = 0.7; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(11, 12 + i * 4); ctx.lineTo(14, 12 + i * 4); ctx.stroke(); } // lines
  },
  staff(ctx, c, sheen) {
    ctx.fillStyle = c; ctx.fillRect(15, 9, 2, 21); ctx.strokeStyle = OUTLINE; ctx.lineWidth = 0.8; ctx.strokeRect(15, 9, 2, 21); // shaft
    ctx.beginPath(); ctx.arc(16, 7, 4.5, 0, Math.PI * 2); fillStroke(ctx, shade(c, 0.05));                // head orb
    ctx.fillStyle = shade(c, sheen * 0.6 + 0.3); ctx.beginPath(); ctx.arc(14.5, 5.8, 1.4, 0, Math.PI * 2); ctx.fill(); // orb glint
  },
  lamp(ctx, c, sheen) {
    ctx.strokeStyle = shade(c, -0.1); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(16, 6, 3.5, Math.PI, 0, false); ctx.stroke(); // bail
    poly(ctx, [[11, 10], [21, 10], [22, 24], [10, 24]]); fillStroke(ctx, shade(c, -0.05));                // body
    ctx.globalAlpha = 0.85; ctx.fillStyle = shade('#f4bf62', sheen * 0.3); poly(ctx, [[13, 13], [19, 13], [19.5, 21], [12.5, 21]]); ctx.fill(); ctx.globalAlpha = 1; // glass/flame
    ctx.fillStyle = shade(c, -0.2); ctx.fillRect(10, 24, 12, 2);                                          // base
  },
};

// ── AFFIX cues — small decorations keyed off item.affixCues ────────────────────────────────────
function drawCue(ctx, cue, item) {
  switch (cue) {
    case 'edge':                                                                  // a bright keen glint
      ctx.strokeStyle = '#fff7e0'; ctx.lineWidth = 0.7; ctx.globalAlpha = 0.85;
      ctx.beginPath(); ctx.moveTo(18, 5); ctx.lineTo(17, 11); ctx.stroke(); ctx.globalAlpha = 1; break;
    case 'gem':                                                                   // a set gemstone
      ctx.fillStyle = item.frame; poly(ctx, [[24, 7], [26.5, 9.5], [24, 12], [21.5, 9.5]]); ctx.fill();
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 0.5; ctx.stroke();
      ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 0.7; ctx.beginPath(); ctx.arc(23.4, 9, 0.7, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; break;
    case 'rune':                                                                  // three glowing runes
      ctx.fillStyle = item.accent; ctx.globalAlpha = 0.9;
      for (let i = 0; i < 3; i++) { ctx.fillRect(6, 18 + i * 3, 1.4, 1.4); } ctx.globalAlpha = 1; break;
    case 'trim':                                                                  // a gilt trim
      ctx.strokeStyle = '#f4bf62'; ctx.lineWidth = 0.8; ctx.globalAlpha = 0.9;
      ctx.strokeRect(8.5, 8.5, 15, 18); ctx.globalAlpha = 1; break;
    case 'patina':                                                                // an ancient verdigris wash
      ctx.fillStyle = '#5aa845'; ctx.globalAlpha = 0.18; ctx.fillRect(4, 4, 24, 24); ctx.globalAlpha = 1; break;
    case 'bulk':                                                                  // a heavy reinforcing band
      ctx.strokeStyle = shade(item.color, -0.4); ctx.lineWidth = 1.6; ctx.globalAlpha = 0.7;
      ctx.beginPath(); ctx.moveTo(9, 15); ctx.lineTo(23, 15); ctx.stroke(); ctx.globalAlpha = 1; break;
  }
}

// ── rarity frame — a subtle ring tinted by quality; corner ticks grow with rarity ───────────────
function drawFrame(ctx, item) {
  ctx.strokeStyle = item.frame; ctx.globalAlpha = 0.35; ctx.lineWidth = 1;
  ctx.strokeRect(2, 2, 28, 28); ctx.globalAlpha = 1;
  const ticks = item.qIdx;                              // 0..5 corner accents by quality
  if (ticks <= 0) return;
  ctx.strokeStyle = item.frame; ctx.lineWidth = 1.4; ctx.globalAlpha = 0.8;
  const L = 2 + ticks;                                  // longer ticks at higher rarity
  const corners = [[2, 2, 1, 1], [30, 2, -1, 1], [2, 30, 1, -1], [30, 30, -1, -1]];
  for (const [x, y, dx, dy] of corners) { ctx.beginPath(); ctx.moveTo(x, y + dy * L); ctx.lineTo(x, y); ctx.lineTo(x + dx * L, y); ctx.stroke(); }
  ctx.globalAlpha = 1;
}

// drawItem(ctx, item, opts) — render `item` at (x,y) sized `size`px. `frame` toggles the rarity ring.
export function drawItem(ctx, item, { x = 0, y = 0, size = 32, frame = true, bg = null } = {}) {
  const s = size / UNIT;
  ctx.save();
  ctx.translate(x, y); ctx.scale(s, s);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, UNIT, UNIT); }
  if (frame) drawFrame(ctx, item);
  (FORMS[KINDFORM(item)] || FORMS.tool)(ctx, item.color, item.sheen);
  for (const cue of item.affixCues || []) drawCue(ctx, cue, item);
  ctx.restore();
}
// item.kind is the form key in our deck (KINDS[kind].form === kind here), but be defensive.
function KINDFORM(item) { return FORMS[item.form] ? item.form : (FORMS[item.kind] ? item.kind : 'tool'); }

// contactSheet(ctx, items, opts) — tile a grid of sprites on a dark backdrop (legibility eyeball).
export function contactSheet(ctx, items, { cell = 40, cols = 8, gap = 6, bg = '#05060a', pad = 6 } = {}) {
  if (bg) { const rows = Math.ceil(items.length / cols); ctx.fillStyle = bg; ctx.fillRect(0, 0, cols * (cell + gap) + pad * 2, rows * (cell + gap) + pad * 2); }
  items.forEach((it, i) => {
    const cx = pad + (i % cols) * (cell + gap), cy = pad + Math.floor(i / cols) * (cell + gap);
    drawItem(ctx, it, { x: cx, y: cy, size: cell });
  });
}

const SPRITE = { drawItem, contactSheet, FORMS, shade };
if (typeof globalThis !== 'undefined') globalThis.SPRITE = SPRITE;
export default SPRITE;
