/* office — the fractal site map renderer.
 *
 * A Droste "office of offices": you stand in a room whose back wall is papered
 * with framed posters, and every poster is a smaller room with its own wall of
 * posters — one per child surface of the site. Scroll to zoom straight into a
 * poster (you fall into that office, endlessly); the desk monitor opens the live
 * site. The tree + wall layout + palette are the pure engine (engine.js); this
 * file is the canvas + camera + interaction.
 *
 * The camera is one anchor node `focus` plus an affine (z, ox, oy) mapping the
 * focus room's unit box [0,1]² to the screen. Each frame we REBASE: if a child
 * poster grows to cover the viewport we make it the focus (seamless — it was
 * already being drawn there); if the focus shrinks below full-screen we hand off
 * to its parent. So z stays bounded and the Droste stack is effectively infinite,
 * cost bounded by pixel-culling (a poster smaller than a few px stops recursing).
 */

import { buildTree, layoutWall, paletteFor, heatFor, pathTo, rngFor, WALL } from "./engine.js";

const cvs = document.getElementById("stage");
const ctx = cvs.getContext("2d", { alpha: false });
const crumbEl = document.getElementById("crumb");
const tipEl = document.getElementById("tip");
const hereEl = document.getElementById("here");
const legendEl = document.getElementById("legend");

let W = 0, H = 0, DPR = 1;
let ROOT = null;
let focus = null;          // anchor node the transform is relative to
let z = 1, ox = 0, oy = 0; // unit→screen: sx = ox + ux*W*z ; sy = oy + uy*H*z
let hover = null;          // { node, rect, kind:'poster'|'monitor' }
let anim = null;           // active tween

// ── geometry ────────────────────────────────────────────────────────────────
function roomRect() { return { x: ox, y: oy, w: W * z, h: H * z }; }
function wallOf(node) { return node._wall || (node._wall = layoutWall(node.children.length)); }

// child i's screen rect inside a room drawn at rect R
function posterRect(node, R, i) {
  const u = wallOf(node)[i];
  return { x: R.x + u.x * R.w, y: R.y + u.y * R.h, w: u.w * R.w, h: u.h * R.h };
}
// an endpoint (no children) hangs one big wall-mounted screen — the site itself —
// where a surface would have its wall of posters. Shared by draw + hit-test.
function heroRect(R) {
  const w = R.w * 0.52, h = w * 0.5;
  return { x: R.x + R.w * 0.5 - w / 2, y: R.y + R.h * 0.30 - h / 2, w, h };
}
// the desk band + monitor geometry inside a room rect R (shared by draw + hit-test)
function deskGeom(R) {
  const deskTop = R.y + R.h * (1 - WALL.bottom);
  const mw = R.w * 0.235, mh = R.h * 0.155;
  const mx = R.x + R.w * 0.5 - mw / 2;
  const my = deskTop - mh - R.h * 0.012;
  return { deskTop, monitor: { x: mx, y: my, w: mw, h: mh } };
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const onScreen = (R) => R.x < W && R.y < H && R.x + R.w > 0 && R.y + R.h > 0;
// A dive only fires once a poster fully covers the viewport *plus* a small margin.
// The margin is load-bearing: diving sets the child room = the poster rect, so the
// poster must be strictly larger than the viewport or the new room wouldn't cover
// it and would instantly pop back out (a dive/pop oscillation).
const coversDive = (R) => {
  const m = Math.min(W, H) * 0.02;
  return R.x <= -m && R.y <= -m && R.x + R.w >= W + m && R.y + R.h >= H + m;
};

// keep the focus room covering the viewport — pan is clamped to the room's bounds
// (you move *within* a room, you never drag it off the screen).
function clampPan() {
  const R = roomRect();
  ox = R.w >= W ? clamp(ox, W - R.w, 0) : (W - R.w) / 2;
  oy = R.h >= H ? clamp(oy, H - R.h, 0) : (H - R.h) / 2;
}

// ── rebasing: keep `focus` = the innermost room that fills the screen ─────────
// allowDive=false (pan) only ever pops out / clamps; allowDive=true (zoom) also
// falls into a child poster once it covers the viewport.
function rebase(allowDive) {
  for (let guard = 0; guard < 24; guard++) {
    const R = roomRect();
    if (allowDive && focus.children.length) {
      let dived = false;
      for (let i = 0; i < focus.children.length; i++) {
        const pr = posterRect(focus, R, i);
        if (coversDive(pr)) {
          z = pr.w / W;
          ox = pr.x;
          oy = (pr.y + pr.h / 2) - 0.5 * H * z; // width-driven z; centre vertically
          focus = focus.children[i];
          dived = true;
          break;
        }
      }
      if (dived) continue;
    }
    // pop OUT only when the room has shrunk BELOW the viewport (i.e. you zoomed
    // out) — never merely because it's panned to an edge (clampPan prevents that).
    const R2 = roomRect();
    if ((R2.w < W - 0.5 || R2.h < H - 0.5) && focus.parentNode) {
      const p = focus.parentNode;
      const pf = wallOf(p)[focus.childIndex];
      const z2 = z / pf.w;
      ox = ox - pf.x * W * z2;
      oy = oy - pf.y * H * z2;
      z = z2;
      focus = p;
      continue;
    }
    break;
  }
  // zoom limits: the lobby can't shrink to a speck; an endpoint can't zoom past
  // its wall screen into blank wall.
  if (!focus.parentNode) z = clamp(z, 0.62, 40);
  else if (!focus.children.length) z = Math.min(z, 1.6);
  clampPan();
}

// ── drawing ───────────────────────────────────────────────────────────────────
function rrect(x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawOffice(node, R, depth) {
  if (R.w < 2 || R.h < 2 || !onScreen(R)) return;
  const pal = paletteFor(node.cat);
  const detail = R.w > 150;          // full furniture only when the room is big
  const bigLabels = R.w > 90;

  ctx.save();
  rrect(R.x, R.y, R.w, R.h, Math.min(R.w, R.h) * 0.012);
  ctx.clip();

  // back wall (vertical gradient) + soft key light
  const g = ctx.createLinearGradient(0, R.y, 0, R.y + R.h);
  g.addColorStop(0, pal.wall);
  g.addColorStop(1, pal.wall2);
  ctx.fillStyle = g;
  ctx.fillRect(R.x, R.y, R.w, R.h);
  if (detail) {
    const rg = ctx.createRadialGradient(
      R.x + R.w * 0.5, R.y + R.h * 0.42, R.w * 0.05,
      R.x + R.w * 0.5, R.y + R.h * 0.42, R.w * 0.72);
    rg.addColorStop(0, "rgba(255,240,210,0.06)");
    rg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = rg;
    ctx.fillRect(R.x, R.y, R.w, R.h);
  }

  // floor: a receding band with a faint vanishing-point sheen
  const deskTop = R.y + R.h * (1 - WALL.bottom);
  const floorTop = R.y + R.h * 0.72;
  ctx.fillStyle = pal.floor;
  ctx.fillRect(R.x, floorTop, R.w, R.y + R.h - floorTop);
  if (detail) {
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = Math.max(0.5, R.w * 0.001);
    const vx = R.x + R.w * 0.5;
    for (let k = -3; k <= 3; k++) {
      ctx.beginPath();
      ctx.moveTo(vx + k * R.w * 0.04, floorTop);
      ctx.lineTo(vx + k * R.w * 0.5, R.y + R.h);
      ctx.stroke();
    }
    // baseboard accent
    ctx.strokeStyle = hexA(pal.accent, 0.25);
    ctx.lineWidth = Math.max(1, R.h * 0.006);
    ctx.beginPath(); ctx.moveTo(R.x, floorTop); ctx.lineTo(R.x + R.w, floorTop); ctx.stroke();
  }

  // wall of posters — one per child (the Droste recursion)
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    const pr = posterRect(node, R, i);
    if (!onScreen(pr) || pr.w < 3) continue;
    drawPoster(child, pr, depth, bigLabels);
  }

  // an endpoint hangs its site as a big wall screen where posters would be
  const leaf = node.children.length === 0 && !node.isRoot && !node.isCategory;
  if (leaf && R.w > 40) drawHero(node, R, pal);

  // desk foreground. The lobby + category "wings" get a frosted directory sign
  // (they're groupings, not sites); real surfaces get a clickable monitor.
  if (detail && node.isRoot) drawSignDesk(node, R, pal, "mino.mobi — the directory");
  else if (detail && node.isCategory) drawSignDesk(node, R, pal, "the " + node.name + " wing");
  else if (detail) drawDesk(node, R, pal, !leaf);

  ctx.restore();

  // room frame edge (subtle) — helps read nested rooms
  if (depth > 0 && R.w < W * 0.98) {
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.lineWidth = Math.max(0.5, R.w * 0.004);
    rrect(R.x, R.y, R.w, R.h, Math.min(R.w, R.h) * 0.012);
    ctx.stroke();
  }
}

function drawPoster(child, pr, depth, bigLabels) {
  const pal = paletteFor(child.cat);
  const framed = pr.w > 26;
  // drop shadow
  if (framed) {
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    rrect(pr.x + pr.w * 0.03, pr.y + pr.h * 0.05, pr.w, pr.h, pr.w * 0.02);
    ctx.fill();
  }
  // frame (accent-tinted metal/wood) + mat
  let inner = pr;
  if (framed) {
    const fw = Math.max(1.5, pr.w * 0.035);
    ctx.fillStyle = frameShade(pal.accent);
    rrect(pr.x, pr.y, pr.w, pr.h, pr.w * 0.02);
    ctx.fill();
    const mat = fw * 0.6;
    inner = { x: pr.x + fw, y: pr.y + fw, w: pr.w - fw * 2, h: pr.h - fw * 2 };
    ctx.fillStyle = "rgba(20,20,24,0.9)";
    rrect(inner.x - mat, inner.y - mat, inner.w + mat * 2, inner.h + mat * 2, mat);
    ctx.fill();
  }

  // recurse: the poster IS a smaller office
  if (inner.w > 34 && depth < 14) {
    drawOffice(child, inner, depth + 1);
  } else {
    // too small to recurse — cheap impression of a room-with-posters
    const g = ctx.createLinearGradient(0, inner.y, 0, inner.y + inner.h);
    g.addColorStop(0, pal.wall); g.addColorStop(1, pal.wall2);
    ctx.fillStyle = g; ctx.fillRect(inner.x, inner.y, inner.w, inner.h);
    if (inner.w > 10) {
      ctx.fillStyle = hexA(pal.accent, 0.5);
      const n = Math.min(child.children.length || 1, 6);
      const c = Math.ceil(Math.sqrt(n));
      const cw = inner.w / (c + 1), ch = inner.h / (c + 1);
      for (let k = 0; k < n; k++) {
        const rr2 = Math.floor(k / c), cc = k % c;
        ctx.fillRect(inner.x + cw * (cc + 0.5), inner.y + ch * (rr2 + 0.5), cw * 0.6, ch * 0.5);
      }
    }
    // a lit monitor dot = this endpoint's screen
    ctx.fillStyle = hexA(pal.accent, 0.9);
    ctx.fillRect(inner.x + inner.w * 0.4, inner.y + inner.h * 0.62, inner.w * 0.2, inner.h * 0.16);
  }

  // brass nameplate
  if (bigLabels && pr.w > 46) {
    const plateH = Math.min(pr.h * 0.16, 22);
    const py = pr.y + pr.h - plateH * 0.5;
    ctx.fillStyle = "rgba(12,12,14,0.82)";
    rrect(pr.x + pr.w * 0.08, py, pr.w * 0.84, plateH, plateH * 0.28);
    ctx.fill();
    ctx.fillStyle = hexA(pal.accent, 0.95);
    ctx.font = `600 ${Math.min(plateH * 0.62, pr.w * 0.13)}px ui-monospace, Menlo, monospace`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    let name = child.name;
    const max = Math.floor(pr.w / (plateH * 0.42));
    if (name.length > max) name = name.slice(0, Math.max(1, max - 1)) + "…";
    ctx.fillText(name, pr.x + pr.w * 0.5, py + plateH * 0.52);
    if (child.children.length && pr.w > 90) {
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.font = `500 ${Math.min(plateH * 0.5, 11)}px ui-monospace, monospace`;
      ctx.textAlign = "right";
      ctx.fillText("▸" + child.children.length, pr.x + pr.w * 0.9, py - plateH * 0.1);
    }
  }
}

function drawHero(node, R, pal) {
  const s = heroRect(R);
  // glow
  const gl = ctx.createRadialGradient(s.x + s.w / 2, s.y + s.h / 2, s.w * 0.1, s.x + s.w / 2, s.y + s.h / 2, s.w * 0.9);
  gl.addColorStop(0, hexA(pal.accent, 0.22)); gl.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gl; ctx.fillRect(R.x, R.y, R.w, R.h);
  // bezel
  ctx.fillStyle = "#0a0a0c";
  rrect(s.x - s.w * 0.03, s.y - s.w * 0.03, s.w * 1.06, s.h * 1.1, s.w * 0.02); ctx.fill();
  // screen
  const g = ctx.createLinearGradient(0, s.y, 0, s.y + s.h);
  g.addColorStop(0, hexA(pal.accent, 0.9)); g.addColorStop(1, hexA(pal.accent, 0.32));
  ctx.fillStyle = g; rrect(s.x, s.y, s.w, s.h, s.w * 0.015); ctx.fill();
  // faux browser chrome
  ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.fillRect(s.x, s.y, s.w, Math.max(4, s.h * 0.13));
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  for (let d = 0; d < 3; d++) { ctx.beginPath(); ctx.arc(s.x + s.w * 0.04 + d * s.w * 0.035, s.y + s.h * 0.065, Math.max(1, s.w * 0.008), 0, 7); ctx.fill(); }
  // glare
  ctx.fillStyle = "rgba(255,255,255,0.10)";
  ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x + s.w * 0.45, s.y); ctx.lineTo(s.x + s.w * 0.15, s.y + s.h); ctx.lineTo(s.x, s.y + s.h); ctx.closePath(); ctx.fill();
  // labels
  if (s.w > 80) {
    ctx.fillStyle = "rgba(0,0,0,0.85)"; ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `800 ${Math.min(s.h * 0.26, s.w * 0.13)}px ui-monospace, Menlo, monospace`;
    ctx.fillText(node.name, s.x + s.w * 0.5, s.y + s.h * 0.46);
    if (node.url) {
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.font = `600 ${Math.min(s.h * 0.12, 15)}px ui-monospace, monospace`;
      ctx.fillText(node.url.replace(/^https?:\/\//, ""), s.x + s.w * 0.5, s.y + s.h * 0.66);
      ctx.fillStyle = "rgba(0,0,0,0.8)";
      ctx.fillText("open ↗", s.x + s.w * 0.5, s.y + s.h * 0.83);
    }
  }
}

function drawDesk(node, R, pal, showMonitor) {
  const { deskTop, monitor } = deskGeom(R);
  const heat = heatFor(node.age);
  const rnd = rngFor(node.id);
  // desk slab
  const slabH = (R.y + R.h - deskTop);
  const dg = ctx.createLinearGradient(0, deskTop, 0, deskTop + slabH);
  dg.addColorStop(0, "#3a2c20"); dg.addColorStop(1, "#241a12");
  ctx.fillStyle = dg;
  ctx.fillRect(R.x, deskTop, R.w, slabH);
  ctx.fillStyle = "rgba(255,220,170,0.10)";
  ctx.fillRect(R.x, deskTop, R.w, Math.max(1, slabH * 0.05));

  // warm lamp pool (age = heat)
  if (heat > 0.05) {
    const lx = R.x + R.w * (0.74 + (rnd() - 0.5) * 0.06);
    const lg = ctx.createRadialGradient(lx, deskTop, 2, lx, deskTop, R.w * 0.34);
    lg.addColorStop(0, `rgba(255,196,120,${0.10 + heat * 0.22})`);
    lg.addColorStop(1, "rgba(255,196,120,0)");
    ctx.fillStyle = lg;
    ctx.fillRect(R.x, R.y, R.w, R.h);
    // lamp
    ctx.strokeStyle = "#6b5636"; ctx.lineWidth = Math.max(1, R.w * 0.006);
    ctx.beginPath(); ctx.moveTo(lx, deskTop); ctx.lineTo(lx, deskTop - R.h * 0.1);
    ctx.lineTo(lx + R.w * 0.05, deskTop - R.h * 0.14); ctx.stroke();
    ctx.fillStyle = heat > 0.5 ? "#ffcf7a" : "#7a6a4a";
    rrect(lx + R.w * 0.03, deskTop - R.h * 0.16, R.w * 0.05, R.h * 0.03, R.h * 0.01); ctx.fill();
  }

  // monitor = this office's live site (a leaf shows the hero wall screen instead)
  if (!showMonitor) {
    // keyboard + mug + plant only, no screen
    ctx.fillStyle = "rgba(20,20,24,0.9)";
    rrect(monitor.x + monitor.w * 0.1, deskTop + slabH * 0.28, monitor.w * 0.8, slabH * 0.16, slabH * 0.03); ctx.fill();
    ctx.fillStyle = "#c9b28a";
    ctx.beginPath(); ctx.arc(R.x + R.w * 0.34, deskTop + slabH * 0.4, R.w * 0.016, 0, 7); ctx.fill();
    return;
  }
  ctx.fillStyle = "#0a0a0c";
  rrect(monitor.x - monitor.w * 0.04, monitor.y - monitor.h * 0.04, monitor.w * 1.08, monitor.h * 1.16, monitor.w * 0.03);
  ctx.fill();
  const scr = ctx.createLinearGradient(0, monitor.y, 0, monitor.y + monitor.h);
  scr.addColorStop(0, hexA(pal.accent, 0.85));
  scr.addColorStop(1, hexA(pal.accent, 0.35));
  ctx.fillStyle = scr;
  rrect(monitor.x, monitor.y, monitor.w, monitor.h, monitor.w * 0.02);
  ctx.fill();
  // screen glare + name
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.beginPath();
  ctx.moveTo(monitor.x, monitor.y);
  ctx.lineTo(monitor.x + monitor.w * 0.5, monitor.y);
  ctx.lineTo(monitor.x + monitor.w * 0.2, monitor.y + monitor.h);
  ctx.lineTo(monitor.x, monitor.y + monitor.h);
  ctx.closePath(); ctx.fill();
  if (monitor.w > 60) {
    ctx.fillStyle = "rgba(0,0,0,0.82)";
    ctx.font = `700 ${Math.min(monitor.h * 0.34, monitor.w * 0.16)}px ui-monospace, Menlo, monospace`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(node.name, monitor.x + monitor.w * 0.5, monitor.y + monitor.h * 0.44);
    if (node.url && monitor.w > 110) {
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.font = `600 ${Math.min(monitor.h * 0.2, 12)}px ui-monospace, monospace`;
      ctx.fillText("open ↗", monitor.x + monitor.w * 0.5, monitor.y + monitor.h * 0.74);
    }
  }
  // monitor stand
  ctx.fillStyle = "#111";
  ctx.fillRect(monitor.x + monitor.w * 0.44, monitor.y + monitor.h, monitor.w * 0.12, R.h * 0.02);
  ctx.fillRect(monitor.x + monitor.w * 0.3, deskTop - R.h * 0.006, monitor.w * 0.4, R.h * 0.01);

  // keyboard + mug + plant (cheap props)
  ctx.fillStyle = "rgba(20,20,24,0.9)";
  rrect(monitor.x + monitor.w * 0.1, deskTop + slabH * 0.28, monitor.w * 0.8, slabH * 0.16, slabH * 0.03); ctx.fill();
  ctx.fillStyle = "#c9b28a";
  const mugx = R.x + R.w * 0.34;
  ctx.beginPath(); ctx.arc(mugx, deskTop + slabH * 0.4, R.w * 0.016, 0, 7); ctx.fill();
  // plant
  const px = R.x + R.w * 0.2;
  ctx.fillStyle = "#6b4a2a";
  ctx.fillRect(px, deskTop - R.h * 0.03, R.w * 0.03, R.h * 0.05);
  ctx.fillStyle = "#3f7d4f";
  for (let l = 0; l < 5; l++) {
    ctx.beginPath();
    const a = -Math.PI / 2 + (l - 2) * 0.4;
    ctx.ellipse(px + R.w * 0.015, deskTop - R.h * 0.03, R.w * 0.006, R.h * 0.03, a, 0, 7);
    ctx.fill();
  }
}

function drawSignDesk(node, R, pal, label) {
  // a reception counter + a frosted directory sign (lobby + category wings)
  const { deskTop } = deskGeom(R);
  const slabH = R.y + R.h - deskTop;
  const dg = ctx.createLinearGradient(0, deskTop, 0, deskTop + slabH);
  dg.addColorStop(0, "#2c2a26"); dg.addColorStop(1, "#17150f");
  ctx.fillStyle = dg; ctx.fillRect(R.x, deskTop, R.w, slabH);
  ctx.fillStyle = hexA(pal.accent, 0.5);
  ctx.fillRect(R.x, deskTop, R.w, Math.max(1, slabH * 0.04));
  // frosted glass plate
  const sw = Math.min(R.w * 0.5, R.w * 0.02 * label.length + 40), sh = slabH * 0.5;
  const sx = R.x + R.w * 0.5 - sw / 2, sy = deskTop + slabH * 0.24;
  ctx.fillStyle = hexA(pal.accent, 0.12);
  rrect(sx, sy, sw, sh, sh * 0.16); ctx.fill();
  ctx.strokeStyle = hexA(pal.accent, 0.4); ctx.lineWidth = Math.max(1, R.w * 0.002);
  rrect(sx, sy, sw, sh, sh * 0.16); ctx.stroke();
  if (R.w > 200) {
    ctx.fillStyle = hexA(pal.accent, 0.95);
    ctx.font = `700 ${Math.min(R.w * 0.024, sh * 0.5, 26)}px ui-monospace, Menlo, monospace`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(label, R.x + R.w * 0.5, sy + sh * 0.52);
  }
}

// ── frame ─────────────────────────────────────────────────────────────────────
function render() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = "#08070a";
  ctx.fillRect(0, 0, W, H);
  drawOffice(focus, roomRect(), 0);
  drawVignette();
  paintChrome();
}
function drawVignette() {
  const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

// ── colour helpers ────────────────────────────────────────────────────────────
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function frameShade(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * 0.35 + 20);
  const g = Math.round(((n >> 8) & 255) * 0.35 + 18);
  const b = Math.round((n & 255) * 0.35 + 16);
  return `rgb(${r},${g},${b})`;
}

// ── interaction targets ───────────────────────────────────────────────────────
function targets() {
  const R = roomRect();
  const out = [];
  for (let i = 0; i < focus.children.length; i++) {
    const pr = posterRect(focus, R, i);
    if (onScreen(pr) && pr.w > 10) out.push({ node: focus.children[i], rect: pr, kind: "poster" });
  }
  if (!focus.isRoot && !focus.isCategory && focus.url) {
    const m = focus.children.length ? deskGeom(R).monitor : heroRect(R);
    if (onScreen(m)) out.push({ node: focus, rect: m, kind: "monitor" });
  }
  return out;
}
function hitTest(x, y) {
  const t = targets();
  // monitor (foreground) first, then posters top-most last-drawn
  for (let i = t.length - 1; i >= 0; i--) {
    if (t[i].kind === "monitor") { const r = t[i].rect; if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return t[i]; }
  }
  for (let i = 0; i < t.length; i++) {
    if (t[i].kind === "poster") { const r = t[i].rect; if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return t[i]; }
  }
  return null;
}

// ── zoom / pan / dive ─────────────────────────────────────────────────────────
function zoomAt(cx, cy, factor) {
  cancelAnim();
  // Zooming IN: the anchor must sit *inside* a poster, or the wall's empty gaps
  // would swallow the zoom (no poster ever grows to cover the viewport, so no
  // dive). If the cursor is over a poster, dive into exactly that one; if it's
  // over a gap, snap the anchor to the nearest poster's centre.
  if (factor > 1 && focus.children.length) {
    const R = roomRect();
    let inside = false, best = null, bd = Infinity;
    for (let i = 0; i < focus.children.length; i++) {
      const pr = posterRect(focus, R, i);
      // only posters that actually intersect the viewport are divable — the
      // anchor must be BOTH inside the poster and on-screen, or the zoom diverges.
      const vx0 = Math.max(pr.x, 0), vy0 = Math.max(pr.y, 0);
      const vx1 = Math.min(pr.x + pr.w, W), vy1 = Math.min(pr.y + pr.h, H);
      if (vx1 <= vx0 || vy1 <= vy0) continue;
      if (cx >= pr.x && cx <= pr.x + pr.w && cy >= pr.y && cy <= pr.y + pr.h) { inside = true; break; }
      // Anchor on the poster's true centre when it's on-screen (symmetric growth
      // → the poster covers the viewport with minimal overshoot); otherwise the
      // centre of its visible portion (still interior + on-screen, so it converges).
      const pcx = pr.x + pr.w / 2, pcy = pr.y + pr.h / 2;
      const onScr = pcx >= 0 && pcx <= W && pcy >= 0 && pcy <= H;
      const ax = clamp(cx, vx0, vx1), ay = clamp(cy, vy0, vy1);
      const d = (cx - ax) * (cx - ax) + (cy - ay) * (cy - ay);
      if (d < bd) { bd = d; best = onScr ? { x: pcx, y: pcy } : { x: (vx0 + vx1) / 2, y: (vy0 + vy1) / 2 }; }
    }
    if (!inside && best) { cx = best.x; cy = best.y; }
  }
  const nz = z * factor;
  ox = cx - (cx - ox) * (nz / z);
  oy = cy - (cy - oy) * (nz / z);
  z = nz;
  rebase(factor > 1);   // only a zoom-IN can dive
  requestRender();
}

// Click-dive: fly the clicked poster to fill the viewport, then land on that
// child at rest. The tween runs in the CURRENT focus frame with rebasing off, so
// the target never shifts mid-flight; on completion we commit focus = child,
// centred (z=1) — the poster ≈ fills the viewport there, so the swap is seamless.
function diveTo(node) {
  const u = wallOf(focus)[node.childIndex];
  const tz = (1 / u.w) * 1.06;
  const tox = W / 2 - (u.x + u.w / 2) * W * tz;
  const toy = H / 2 - (u.y + u.h / 2) * H * tz;
  runAnim({ z, ox, oy }, { z: tz, ox: tox, oy: toy }, 460,
    () => { focus = node; z = 1; ox = 0; oy = 0; });
}
// Fly to an ancestor (breadcrumb / step-out): render from the ancestor, expressing
// the current view in its frame, then ease out to rest. Non-ancestor targets
// (a legend jump across wings) just cut over.
function goTo(node) {
  cancelAnim();
  const cur = viewInFrame(node);
  if (!cur) { focus = node; z = 1; ox = 0; oy = 0; rebase(false); requestRender(); return; }
  focus = node;
  runAnim({ z: cur.z, ox: cur.ox, oy: cur.oy }, { z: 1, ox: 0, oy: 0 }, 500, null);
}
// express the current on-screen view in terms of ancestor `anc`'s unit box
function viewInFrame(anc) {
  let n = focus, tz = z, tox = ox, toy = oy;
  for (let guard = 0; guard < 40; guard++) {
    if (n === anc) return { z: tz, ox: tox, oy: toy };
    if (!n.parentNode) return null;
    const pf = wallOf(n.parentNode)[n.childIndex];
    const z2 = tz / pf.w;
    tox = tox - pf.x * W * z2;
    toy = toy - pf.y * H * z2;
    tz = z2; n = n.parentNode;
  }
  return null;
}
let animId = 0;
function cancelAnim() { animId++; anim = null; }
function runAnim(from, to, dur, commit) {
  cancelAnim();
  const id = animId;
  anim = true;
  const start = performance.now();
  const tick = (now) => {
    if (id !== animId) return;                 // superseded by newer input
    let k = (now - start) / dur;
    if (k >= 1) k = 1;
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; // easeInOutQuad
    z = from.z + (to.z - from.z) * e;
    ox = from.ox + (to.ox - from.ox) * e;
    oy = from.oy + (to.oy - from.oy) * e;
    render();
    if (k < 1) { requestAnimationFrame(tick); }
    else { anim = null; if (commit) commit(); rebase(false); render(); }
  };
  requestAnimationFrame(tick);
}

let renderQueued = false;
function requestRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; render(); });
}

// ── chrome (breadcrumb, legend, title, tooltip) ───────────────────────────────
function paintChrome() {
  const path = pathTo(focus);
  crumbEl.innerHTML = "";
  path.forEach((n, i) => {
    const a = document.createElement("button");
    a.className = "crumb-item" + (i === path.length - 1 ? " cur" : "");
    a.textContent = n.name;
    a.style.setProperty("--ac", paletteFor(n.cat).accent);
    a.onclick = () => goTo(n);
    crumbEl.appendChild(a);
    if (i < path.length - 1) {
      const s = document.createElement("span"); s.className = "crumb-sep"; s.textContent = "›";
      crumbEl.appendChild(s);
    }
  });
  const pal = paletteFor(focus.cat);
  hereEl.style.setProperty("--ac", pal.accent);
  const kids = focus.children.length;
  const kind = focus.isRoot ? "directory" : focus.isCategory ? "wing" : (kids ? "surface" : "endpoint");
  hereEl.innerHTML = `<b>${focus.name}</b><span>${kind}${kids ? " · " + kids + " door" + (kids > 1 ? "s" : "") : ""}${focus.descendants ? " · " + focus.descendants + " inside" : ""}</span>`;
}
function buildLegend() {
  const cats = ROOT.children;
  legendEl.innerHTML = '<div class="lg-title">wings</div>';
  cats.forEach((c) => {
    const b = document.createElement("button");
    b.className = "lg-item";
    b.innerHTML = `<i style="background:${paletteFor(c.cat).accent}"></i>${c.name}<u>${c.descendants}</u>`;
    b.onclick = () => goTo(c);
    legendEl.appendChild(b);
  });
}

// ── input wiring ──────────────────────────────────────────────────────────────
function setup() {
  window.addEventListener("resize", resize);
  resize();

  let dragging = false, moved = false, lx = 0, ly = 0;
  cvs.addEventListener("pointerdown", (e) => {
    dragging = true; moved = false; lx = e.clientX; ly = e.clientY;
    cancelAnim();
    cvs.setPointerCapture(e.pointerId);
  });
  cvs.addEventListener("pointermove", (e) => {
    if (dragging) {
      const dx = e.clientX - lx, dy = e.clientY - ly;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
      ox += dx; oy += dy; lx = e.clientX; ly = e.clientY;
      clampPan(); requestRender();   // pan within the room; never dive or pop
    } else {
      const h = hitTest(e.clientX, e.clientY);
      const changed = (h && (!hover || hover.node !== h.node || hover.kind !== h.kind)) || (!h && hover);
      hover = h;
      cvs.style.cursor = h ? "pointer" : "grab";
      updateTip(h, e.clientX, e.clientY);
      if (changed) requestRender();
    }
  });
  const endDrag = () => { dragging = false; cvs.style.cursor = "grab"; };
  cvs.addEventListener("pointerup", (e) => {
    endDrag();
    if (moved) return;
    const h = hitTest(e.clientX, e.clientY);
    if (!h) return;
    if (h.kind === "monitor") { openURL(h.node); return; }
    // poster
    if (h.node.children.length) diveTo(h.node);
    else openURL(h.node);
  });
  cvs.addEventListener("pointercancel", endDrag);
  cvs.addEventListener("dblclick", (e) => {
    const h = hitTest(e.clientX, e.clientY);
    if (h) openURL(h.node);
  });
  cvs.addEventListener("wheel", (e) => {
    e.preventDefault();
    const factor = Math.exp(-e.deltaY * 0.0011);
    zoomAt(e.clientX, e.clientY, factor);
    if (hover) { const h = hitTest(e.clientX, e.clientY); hover = h; updateTip(h, e.clientX, e.clientY); }
  }, { passive: false });

  // buttons
  document.getElementById("zin").onclick = () => zoomAt(W / 2, H / 2, 1.6);
  document.getElementById("zout").onclick = () => zoomAt(W / 2, H / 2, 1 / 1.6);
  document.getElementById("up").onclick = () => { if (focus.parentNode) goTo(focus.parentNode); };
  document.getElementById("home").onclick = () => goTo(ROOT);
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && focus.parentNode) goTo(focus.parentNode);
    else if (e.key === "+" || e.key === "=") zoomAt(W / 2, H / 2, 1.5);
    else if (e.key === "-") zoomAt(W / 2, H / 2, 1 / 1.5);
    else if (e.key.toLowerCase() === "h") goTo(ROOT);
  });

  document.getElementById("hint").addEventListener("click", (e) => {
    e.currentTarget.classList.toggle("open");
  });
}

function openURL(node) {
  if (node && node.url) window.open(node.url, "_blank", "noopener");
}
function updateTip(h, x, y) {
  if (!h) { tipEl.style.display = "none"; return; }
  const pal = paletteFor(h.node.cat);
  const act = h.kind === "monitor" ? "open the live site ↗"
    : h.node.children.length ? `${h.node.children.length} inside — click to enter`
      : "open ↗";
  tipEl.style.display = "block";
  tipEl.style.setProperty("--ac", pal.accent);
  tipEl.innerHTML = `<b>${h.node.name}</b><span>${act}</span>` +
    (h.node.url ? `<code>${h.node.url.replace(/^https?:\/\//, "")}</code>` : "");
  const r = tipEl.getBoundingClientRect();
  let tx = x + 16, ty = y + 16;
  if (tx + r.width > W) tx = x - r.width - 16;
  if (ty + r.height > H) ty = y - r.height - 16;
  tipEl.style.left = tx + "px"; tipEl.style.top = ty + "px";
}

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = cvs.clientWidth; H = cvs.clientHeight;
  cvs.width = Math.round(W * DPR); cvs.height = Math.round(H * DPR);
  render();
}

// ── boot ──────────────────────────────────────────────────────────────────────
fetch("./surfaces.json")
  .then((r) => r.json())
  .then((data) => {
    ROOT = buildTree(data);
    focus = ROOT; z = 1; ox = 0; oy = 0;
    buildLegend();
    setup();
    document.body.classList.remove("loading");
    render();
  })
  .catch((err) => {
    document.getElementById("here").innerHTML = "<b>failed to load</b><span>" + err + "</span>";
    console.error(err);
  });
