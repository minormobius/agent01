// items.js — what each item is called and how it is drawn.
//
// **None of this is Minecraft's art.** Every icon on the page is drawn here,
// from scratch, out of a handful of isometric primitives and a palette per
// material. It is not a copy of the game's textures and is not trying to be
// one: it is what a crafting grid looks like if you draw it yourself. The
// recipes are the game's, because a recipe is a fact about the game; the
// pictures are not facts and so they are ours.
//
// The engine owns the item *list* (henderhead/craft/engine/src/recipes.rs) and
// hands it over at startup. This file owns the presentation, and
// craft.selftest.mjs asserts the two sets are exactly equal — an item added to
// the rule with no art here, or art here for an item the rule does not have,
// fails the build rather than turning up as a blank square.

/** Material palettes: [top, left, right, line]. */
// Lifted well above the page's navy: these are 20-to-30-pixel pictures sitting
// on a dark slot, and a palette that reads nicely at poster size disappears
// entirely at this one.
const MAT = {
  oak:    ['#e0bc80', '#c09755', '#a37f45', '#7a5c31'],
  log:    ['#dcc490', '#8a6c45', '#705636', '#4f3c25'],
  cobble: ['#d2d2d2', '#aeaeae', '#949494', '#6c6c6c'],
  bench:  ['#d99a4c', '#bb8542', '#9c6d34', '#714f25'],
  dark:   ['#8a6f48', '#6b5536', '#57452b', '#3b2d1c'],
  iron:   ['#dcdce2', '#b6b6bd', '#9b9ba2', '#74747c'],
};

/** Tool head colours by tier. */
const HEAD = { wood: '#e3b76e', stone: '#c6c6c6' };

/**
 * id → { label, shape, ... }. `shape` picks the draw routine; everything else
 * is that routine's arguments.
 */
export const ART = {
  // ---- the seed stock ----
  oak_log:             { label: 'oak log',            shape: 'cube',   mat: 'log',    tex: 'bark' },
  oak_planks:          { label: 'oak planks',         shape: 'cube',   mat: 'oak',    tex: 'plank' },
  cobblestone:         { label: 'cobblestone',        shape: 'cube',   mat: 'cobble', tex: 'mottle' },

  // ---- the first rung ----
  stick:               { label: 'stick',              shape: 'stick' },

  // ---- wood ----
  crafting_table:      { label: 'crafting table',     shape: 'cube',   mat: 'bench',  tex: 'bench' },
  chest:               { label: 'chest',              shape: 'chest' },
  oak_slab:            { label: 'oak slab',           shape: 'slab',   mat: 'oak',    tex: 'plank' },
  oak_stairs:          { label: 'oak stairs',         shape: 'stairs', mat: 'oak',    tex: 'plank' },
  oak_door:            { label: 'oak door',           shape: 'door',   mat: 'oak' },
  oak_trapdoor:        { label: 'oak trapdoor',       shape: 'panel',  mat: 'oak' },
  oak_fence:           { label: 'oak fence',          shape: 'fence',  mat: 'oak' },
  oak_fence_gate:      { label: 'oak fence gate',     shape: 'gate',   mat: 'oak' },
  oak_pressure_plate:  { label: 'oak pressure plate', shape: 'plate',  mat: 'oak',    tex: 'plank' },
  oak_button:          { label: 'oak button',         shape: 'button', mat: 'oak' },
  oak_sign:            { label: 'oak sign',           shape: 'sign',   mat: 'oak' },
  bowl:                { label: 'bowl',               shape: 'bowl' },
  oak_boat:            { label: 'oak boat',           shape: 'boat' },
  ladder:              { label: 'ladder',             shape: 'ladder' },

  // ---- stone ----
  cobblestone_slab:    { label: 'cobblestone slab',   shape: 'slab',   mat: 'cobble', tex: 'mottle' },
  cobblestone_stairs:  { label: 'cobblestone stairs', shape: 'stairs', mat: 'cobble', tex: 'mottle' },
  cobblestone_wall:    { label: 'cobblestone wall',   shape: 'wall',   mat: 'cobble' },
  furnace:             { label: 'furnace',            shape: 'furnace' },
  lever:               { label: 'lever',              shape: 'lever' },

  // ---- tools ----
  wooden_sword:        { label: 'wooden sword',       shape: 'tool', head: 'sword',   tier: 'wood' },
  wooden_shovel:       { label: 'wooden shovel',      shape: 'tool', head: 'shovel',  tier: 'wood' },
  wooden_pickaxe:      { label: 'wooden pickaxe',     shape: 'tool', head: 'pickaxe', tier: 'wood' },
  wooden_axe:          { label: 'wooden axe',         shape: 'tool', head: 'axe',     tier: 'wood' },
  wooden_hoe:          { label: 'wooden hoe',         shape: 'tool', head: 'hoe',     tier: 'wood' },
  stone_sword:         { label: 'stone sword',        shape: 'tool', head: 'sword',   tier: 'stone' },
  stone_shovel:        { label: 'stone shovel',       shape: 'tool', head: 'shovel',  tier: 'stone' },
  stone_pickaxe:       { label: 'stone pickaxe',      shape: 'tool', head: 'pickaxe', tier: 'stone' },
  stone_axe:           { label: 'stone axe',          shape: 'tool', head: 'axe',     tier: 'stone' },
  stone_hoe:           { label: 'stone hoe',          shape: 'tool', head: 'hoe',     tier: 'stone' },
};

export const label = (id) => (ART[id] ? ART[id].label : id);

// ------------------------------------------------------------- primitives --

/** Deterministic noise, so a cobblestone looks the same every time it is drawn. */
function hash(n) {
  n = (n ^ 61) ^ (n >>> 16);
  n = (n + (n << 3)) | 0;
  n ^= n >>> 4;
  n = Math.imul(n, 0x27d4eb2d);
  n ^= n >>> 15;
  return (n >>> 0) / 4294967296;
}

function poly(ctx, pts, fill) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

/**
 * An isometric box. `hw` is half the width, `bh` the height of the vertical
 * faces; a slab is the same call with a smaller `bh`, which is exactly the
 * relationship a slab has to a block.
 */
function box(ctx, cx, cy, hw, bh, mat, tex, seed = 1) {
  const [top, left, right, line] = MAT[mat] || MAT.oak;
  const qh = hw / 2;
  const ty = cy - bh / 2;
  const T = [cx, ty - qh], R = [cx + hw, ty], B = [cx, ty + qh], L = [cx - hw, ty];
  const bl = [cx - hw, ty + bh], bb = [cx, ty + bh + qh], br = [cx + hw, ty + bh];
  poly(ctx, [T, R, B, L], top);
  poly(ctx, [L, B, bb, bl], left);
  poly(ctx, [B, R, br, bb], right);
  texture(ctx, cx, cy, hw, bh, qh, ty, tex, line, seed);
  // a thin edge along the two top ridges reads as a bevel at any size
  ctx.strokeStyle = line;
  ctx.lineWidth = Math.max(0.6, hw * 0.05);
  ctx.beginPath();
  ctx.moveTo(L[0], L[1]); ctx.lineTo(B[0], B[1]); ctx.lineTo(R[0], R[1]);
  ctx.stroke();
}

function texture(ctx, cx, cy, hw, bh, qh, ty, tex, line, seed) {
  if (!tex || bh < 3) return;
  ctx.save();
  // clip to the two side faces together — a band drawn across both reads as
  // one course of planks wrapping the block
  ctx.beginPath();
  ctx.moveTo(cx - hw, ty);
  ctx.lineTo(cx, ty + qh);
  ctx.lineTo(cx + hw, ty);
  ctx.lineTo(cx + hw, ty + bh);
  ctx.lineTo(cx, ty + bh + qh);
  ctx.lineTo(cx - hw, ty + bh);
  ctx.closePath();
  ctx.clip();
  if (tex === 'plank' || tex === 'bench') {
    ctx.strokeStyle = line;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = Math.max(0.7, hw * 0.06);
    const rows = 3;
    for (let i = 1; i < rows; i++) {
      const y = ty + (bh * i) / rows;
      ctx.beginPath();
      ctx.moveTo(cx - hw, y);
      ctx.lineTo(cx, y + qh);
      ctx.lineTo(cx + hw, y);
      ctx.stroke();
    }
  } else if (tex === 'bark') {
    ctx.strokeStyle = line;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = Math.max(0.7, hw * 0.07);
    for (let i = -3; i <= 3; i++) {
      const x = cx + (i / 3.4) * hw;
      const dip = qh * (1 - Math.abs(i) / 3.4);
      ctx.beginPath();
      ctx.moveTo(x, ty + dip);
      ctx.lineTo(x, ty + dip + bh);
      ctx.stroke();
    }
  } else if (tex === 'mottle') {
    ctx.globalAlpha = 0.55;
    for (let i = 0; i < 14; i++) {
      const r = hash(seed * 997 + i);
      const r2 = hash(seed * 131 + i * 7);
      ctx.fillStyle = r2 > 0.5 ? '#e8e8e8' : line;
      const px = cx + (r - 0.5) * hw * 1.9;
      const py = ty + qh * 0.3 + r2 * bh;
      const s = hw * (0.12 + 0.1 * hash(i * 31 + seed));
      ctx.fillRect(px, py, s, s * 0.85);
    }
  }
  ctx.restore();

  // tops get their own treatment: rings on a log, a grid on a bench
  if (tex === 'bark' || tex === 'bench' || tex === 'mottle') {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx, ty - qh); ctx.lineTo(cx + hw, ty); ctx.lineTo(cx, ty + qh); ctx.lineTo(cx - hw, ty);
    ctx.closePath();
    ctx.clip();
    ctx.strokeStyle = line;
    ctx.globalAlpha = tex === 'mottle' ? 0.35 : 0.6;
    ctx.lineWidth = Math.max(0.7, hw * 0.06);
    if (tex === 'bark') {
      for (const k of [0.34, 0.62]) {
        ctx.beginPath();
        ctx.ellipse(cx, ty, hw * k, qh * k, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else if (tex === 'bench') {
      ctx.beginPath();
      ctx.moveTo(cx - hw / 2, ty - qh / 2); ctx.lineTo(cx + hw / 2, ty + qh / 2);
      ctx.moveTo(cx + hw / 2, ty - qh / 2); ctx.lineTo(cx - hw / 2, ty + qh / 2);
      ctx.stroke();
    } else {
      for (let i = 0; i < 5; i++) {
        const r = hash(seed * 17 + i);
        ctx.fillStyle = '#e8e8e8';
        ctx.globalAlpha = 0.4;
        ctx.fillRect(cx + (r - 0.5) * hw, ty + (hash(i * 5 + 3) - 0.5) * qh, hw * 0.2, qh * 0.3);
      }
    }
    ctx.restore();
  }
}

/** A diagonal shaft, the backbone of every stick and tool. */
function shaft(ctx, cx, cy, s, colour, thick = 0.09) {
  ctx.strokeStyle = colour;
  ctx.lineWidth = s * thick;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.26, cy + s * 0.28);
  ctx.lineTo(cx + s * 0.22, cy - s * 0.22);
  ctx.stroke();
}

// ---------------------------------------------------------------- shapes --

const SHAPES = {
  cube:  (ctx, a, cx, cy, s) => box(ctx, cx, cy + s * 0.04, s * 0.33, s * 0.34, a.mat, a.tex, a.seed),
  slab:  (ctx, a, cx, cy, s) => box(ctx, cx, cy + s * 0.12, s * 0.33, s * 0.15, a.mat, a.tex, a.seed),
  plate: (ctx, a, cx, cy, s) => box(ctx, cx, cy + s * 0.16, s * 0.33, s * 0.06, a.mat, a.tex, a.seed),

  button: (ctx, a, cx, cy, s) => box(ctx, cx, cy + s * 0.16, s * 0.16, s * 0.06, a.mat, null),

  stairs: (ctx, a, cx, cy, s) => {
    box(ctx, cx + s * 0.09, cy + s * 0.02, s * 0.20, s * 0.30, a.mat, a.tex, 3);
    box(ctx, cx - s * 0.13, cy + s * 0.16, s * 0.20, s * 0.15, a.mat, a.tex, 5);
  },

  wall: (ctx, a, cx, cy, s) => {
    box(ctx, cx, cy + s * 0.02, s * 0.17, s * 0.40, a.mat, 'mottle', 7);
    box(ctx, cx - s * 0.20, cy + s * 0.16, s * 0.13, s * 0.16, a.mat, 'mottle', 9);
    box(ctx, cx + s * 0.20, cy + s * 0.16, s * 0.13, s * 0.16, a.mat, 'mottle', 11);
  },

  stick: (ctx, a, cx, cy, s) => {
    shaft(ctx, cx, cy, s, '#a57c42', 0.10);
    shaft(ctx, cx - s * 0.02, cy - s * 0.02, s * 0.9, '#c79a57', 0.045);
  },

  tool: (ctx, a, cx, cy, s) => {
    shaft(ctx, cx, cy, s, '#a57c42', 0.09);
    const col = HEAD[a.tier];
    const hx = cx + s * 0.2, hy = cy - s * 0.2;
    ctx.fillStyle = col;
    ctx.strokeStyle = col;
    ctx.lineWidth = s * 0.11;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (a.head === 'sword') {
      // blade continues the shaft; a crossguard at the other end says "sword"
      ctx.lineWidth = s * 0.1;
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.02, cy + s * 0.04);
      ctx.lineTo(cx + s * 0.3, cy - s * 0.3);
      ctx.stroke();
      ctx.lineWidth = s * 0.07;
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.18, cy + s * 0.06);
      ctx.lineTo(cx + s * 0.06, cy + s * 0.3);
      ctx.stroke();
    } else if (a.head === 'pickaxe') {
      ctx.lineWidth = s * 0.08;
      ctx.beginPath();
      ctx.arc(hx - s * 0.02, hy + s * 0.16, s * 0.24, Math.PI * 1.15, Math.PI * 1.95);
      ctx.stroke();
    } else if (a.head === 'axe') {
      poly(ctx, [[hx - s * 0.2, hy - s * 0.04], [hx + s * 0.04, hy - s * 0.16],
                 [hx + s * 0.08, hy + s * 0.12], [hx - s * 0.14, hy + s * 0.12]], col);
    } else if (a.head === 'shovel') {
      ctx.beginPath();
      ctx.moveTo(hx - s * 0.02, hy + s * 0.12);
      ctx.lineTo(hx + s * 0.14, hy - s * 0.04);
      ctx.lineTo(hx + s * 0.06, hy - s * 0.18);
      ctx.lineTo(hx - s * 0.14, hy - s * 0.02);
      ctx.closePath();
      ctx.fill();
    } else {
      // hoe: a bar off to one side
      ctx.lineWidth = s * 0.09;
      ctx.beginPath();
      ctx.moveTo(hx + s * 0.06, hy - s * 0.06);
      ctx.lineTo(hx - s * 0.2, hy - s * 0.06);
      ctx.stroke();
    }
  },

  door: (ctx, a, cx, cy, s) => {
    const [top, left] = MAT[a.mat];
    const w = s * 0.34, h = s * 0.68;
    ctx.fillStyle = left;
    ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
    ctx.fillStyle = top;
    ctx.fillRect(cx - w / 2 + s * 0.04, cy - h / 2 + s * 0.05, w - s * 0.08, h * 0.36);
    ctx.fillRect(cx - w / 2 + s * 0.04, cy + s * 0.02, w - s * 0.08, h * 0.4);
    ctx.fillStyle = MAT[a.mat][3];
    ctx.fillRect(cx + w / 2 - s * 0.11, cy + s * 0.02, s * 0.05, s * 0.05);
  },

  panel: (ctx, a, cx, cy, s) => {
    const [top, left, , line] = MAT[a.mat];
    const w = s * 0.62, h = s * 0.4;
    ctx.fillStyle = left;
    ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
    ctx.strokeStyle = top;
    ctx.lineWidth = s * 0.07;
    ctx.strokeRect(cx - w / 2 + s * 0.04, cy - h / 2 + s * 0.04, w - s * 0.08, h - s * 0.08);
    ctx.strokeStyle = line;
    ctx.lineWidth = s * 0.04;
    ctx.beginPath();
    ctx.moveTo(cx - w / 2, cy - h / 2); ctx.lineTo(cx + w / 2, cy + h / 2);
    ctx.stroke();
  },

  fence: (ctx, a, cx, cy, s) => {
    const [top, left] = MAT[a.mat];
    ctx.fillStyle = left;
    ctx.fillRect(cx - s * 0.26, cy - s * 0.3, s * 0.1, s * 0.6);
    ctx.fillRect(cx + s * 0.16, cy - s * 0.3, s * 0.1, s * 0.6);
    ctx.fillStyle = top;
    ctx.fillRect(cx - s * 0.3, cy - s * 0.16, s * 0.6, s * 0.08);
    ctx.fillRect(cx - s * 0.3, cy + s * 0.06, s * 0.6, s * 0.08);
  },

  gate: (ctx, a, cx, cy, s) => {
    const [top, left] = MAT[a.mat];
    ctx.fillStyle = left;
    ctx.fillRect(cx - s * 0.3, cy - s * 0.26, s * 0.09, s * 0.52);
    ctx.fillRect(cx + s * 0.21, cy - s * 0.26, s * 0.09, s * 0.52);
    ctx.fillStyle = top;
    ctx.fillRect(cx - s * 0.2, cy - s * 0.18, s * 0.4, s * 0.34);
    ctx.fillStyle = left;
    ctx.fillRect(cx - s * 0.03, cy - s * 0.18, s * 0.06, s * 0.34);
  },

  sign: (ctx, a, cx, cy, s) => {
    const [top, left, , line] = MAT[a.mat];
    ctx.fillStyle = '#a57c42';
    ctx.fillRect(cx - s * 0.04, cy - s * 0.02, s * 0.08, s * 0.34);
    ctx.fillStyle = top;
    ctx.fillRect(cx - s * 0.3, cy - s * 0.3, s * 0.6, s * 0.32);
    ctx.fillStyle = line;
    ctx.globalAlpha = 0.6;
    for (let i = 0; i < 3; i++) ctx.fillRect(cx - s * 0.22, cy - s * 0.25 + i * s * 0.08, s * 0.44 * (i === 2 ? 0.6 : 1), s * 0.03);
    ctx.globalAlpha = 1;
    void left;
  },

  chest: (ctx, a, cx, cy, s) => {
    box(ctx, cx, cy + s * 0.1, s * 0.32, s * 0.22, 'dark', null);
    box(ctx, cx, cy - s * 0.16, s * 0.32, s * 0.1, 'oak', null);
    ctx.fillStyle = '#f0e4a8';
    ctx.fillRect(cx - s * 0.04, cy - s * 0.04, s * 0.08, s * 0.09);
  },

  furnace: (ctx, a, cx, cy, s) => {
    box(ctx, cx, cy + s * 0.04, s * 0.33, s * 0.34, 'cobble', 'mottle', 13);
    // the mouth, on the front-right face
    ctx.fillStyle = '#2c2c2c';
    ctx.beginPath();
    ctx.moveTo(cx + s * 0.06, cy + s * 0.06);
    ctx.lineTo(cx + s * 0.24, cy - s * 0.03);
    ctx.lineTo(cx + s * 0.24, cy + s * 0.15);
    ctx.lineTo(cx + s * 0.06, cy + s * 0.24);
    ctx.closePath();
    ctx.fill();
  },

  bowl: (ctx, a, cx, cy, s) => {
    ctx.fillStyle = '#a57c42';
    ctx.beginPath();
    ctx.ellipse(cx, cy + s * 0.04, s * 0.3, s * 0.16, 0, 0, Math.PI);
    ctx.fill();
    ctx.fillStyle = '#7a5b33';
    ctx.beginPath();
    ctx.ellipse(cx, cy + s * 0.04, s * 0.3, s * 0.11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c79a57';
    ctx.beginPath();
    ctx.ellipse(cx, cy + s * 0.04, s * 0.22, s * 0.07, 0, 0, Math.PI * 2);
    ctx.fill();
  },

  boat: (ctx, a, cx, cy, s) => {
    ctx.fillStyle = '#c09755';
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.32, cy - s * 0.06);
    ctx.lineTo(cx + s * 0.32, cy - s * 0.06);
    ctx.lineTo(cx + s * 0.2, cy + s * 0.2);
    ctx.lineTo(cx - s * 0.2, cy + s * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#7a5c31';
    ctx.fillRect(cx - s * 0.26, cy - s * 0.06, s * 0.52, s * 0.05);
    ctx.strokeStyle = '#a57c42';
    ctx.lineWidth = s * 0.06;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.3, cy - s * 0.24);
    ctx.lineTo(cx - s * 0.06, cy - s * 0.02);
    ctx.stroke();
  },

  ladder: (ctx, a, cx, cy, s) => {
    ctx.strokeStyle = '#a57c42';
    ctx.lineWidth = s * 0.08;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.18, cy - s * 0.3); ctx.lineTo(cx - s * 0.18, cy + s * 0.3);
    ctx.moveTo(cx + s * 0.18, cy - s * 0.3); ctx.lineTo(cx + s * 0.18, cy + s * 0.3);
    ctx.stroke();
    ctx.lineWidth = s * 0.06;
    ctx.strokeStyle = '#c79a57';
    for (const y of [-0.18, -0.03, 0.12, 0.26]) {
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.18, cy + s * y);
      ctx.lineTo(cx + s * 0.18, cy + s * y);
      ctx.stroke();
    }
  },

  lever: (ctx, a, cx, cy, s) => {
    box(ctx, cx, cy + s * 0.2, s * 0.22, s * 0.08, 'cobble', 'mottle', 17);
    ctx.strokeStyle = '#a57c42';
    ctx.lineWidth = s * 0.08;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx, cy + s * 0.18);
    ctx.lineTo(cx + s * 0.16, cy - s * 0.24);
    ctx.stroke();
    ctx.fillStyle = '#e0bc80';
    ctx.beginPath();
    ctx.arc(cx + s * 0.16, cy - s * 0.26, s * 0.07, 0, Math.PI * 2);
    ctx.fill();
  },
};

// ------------------------------------------------------------------ cache --

const cache = new Map();

/**
 * An item as an offscreen canvas of `size` device pixels. Cached: the grid
 * redraws thousands of cells a frame and they are all the same few pictures.
 */
export function tile(id, size) {
  const key = id + '@' + size;
  let c = cache.get(key);
  if (c) return c;
  const a = ART[id];
  c = document.createElement('canvas');
  c.width = c.height = size;
  if (a) {
    const ctx = c.getContext('2d');
    const draw = SHAPES[a.shape] || SHAPES.cube;
    ctx.save();
    draw(ctx, a, size / 2, size / 2, size);
    ctx.restore();
  }
  cache.set(key, c);
  return c;
}

export function clearCache() { cache.clear(); }

/** Draw straight onto a context, for the histogram axis and the recipe book. */
export function drawItem(ctx, id, x, y, size) {
  ctx.drawImage(tile(id, Math.max(8, Math.round(size))), x, y);
}
