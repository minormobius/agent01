// craft/app.js — renders a craft stream in three.js.
//
// The renderer knows ONLY the stream. In live mode the page runs the Sim and
// a Driver, drains the JSONL lines they emit, and feeds them to a Replay —
// exactly as it would a downloaded .jsonl. If something is not in the stream,
// it cannot be drawn, which is the check that the stream is complete.

import * as THREE from 'three';
import { OrbitControls } from '../delve/vendor/OrbitControls.js';
import { Sim, Replay, DAY, NIGHT_START } from './sim.mjs';
import { Driver, baselinePolicy } from './runner.mjs';
import { options, buildQuestions, perceive, resolve, journal, remember, DECIDERS, jevDecider, GATE, reuseRanking, Party, batchRequest, fulfil, REQUESTS, applyAsk, offlineAsk } from './mind.mjs';
import { PALETTE, MODES } from './macros.mjs';
import { BLOCKS, B, H, hash01, RECIPES, PLACEABLE, FOOD, recipeBags, KINDS } from './world.mjs';
import { SHAPES, columnLocator } from './tiling.mjs';

const $ = (id) => document.getElementById(id);
const TPS = 4;                        // ticks per second at 1×

// ------------------------------------------------------------- state -------
let sim = null, driver = null, replay = null;
let allLines = [];                    // everything emitted, for "save stream"
let fileLines = null, fileCursor = 0; // replay-from-file mode
let outbox = [];
let focusId = 0;                      // whose eyes, HUD and hands: you, or the agent you are watching
let party = null, human = null;       // multiplayer: a Party, and the member you control (if any)                      // live lines not yet shown: revealed as the clock reaches them
let locate = null;                    // (x, z) → column, for aiming
let target = 0;                       // the tick the clock has reached
let macroLog = [];

// ------------------------------------------------------------- three -------
const canvas = $('stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 1, 0.05, 400);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.49;
const hemi = new THREE.HemisphereLight(0xdfefff, 0x4a3b2a, 0.9);
const sun = new THREE.DirectionalLight(0xffffff, 1.4);
sun.position.set(30, 60, 20);
scene.add(hemi, sun);
// Underground, everything above the player's head is clipped away so the
// tunnels can be watched from outside — a cutaway, not x-ray: it hides, it
// never reveals what the player could not reach.
renderer.localClippingEnabled = true;
const cut = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e6);
const matSolid = new THREE.MeshLambertMaterial({ vertexColors: true, clippingPlanes: [cut] });
const matWater = new THREE.MeshLambertMaterial({ color: 0x3f76e4, transparent: true, opacity: 0.62, depthWrite: false, clippingPlanes: [cut] });
// the cap: back faces drawn flat and dark, so rock sliced by the cut reads as
// solid ground and only the hollows (tunnels, caves) stay open
const matGlass = new THREE.MeshLambertMaterial({ color: 0xcfe8ef, transparent: true, opacity: 0.35, depthWrite: false, clippingPlanes: [cut] });
const matCap = new THREE.MeshBasicMaterial({ color: 0x5b554e, side: THREE.BackSide, clippingPlanes: [cut] });
const world = new THREE.Group();
scene.add(world);
const entGroup = new THREE.Group();
scene.add(entGroup);

// the canvas is sized by CSS (the whole window, or the top two thirds on a
// phone); the renderer follows whatever box it is given
function resize() {
  const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas);
resize();

// ------------------------------------------------------------ meshing ------
// Columns are grouped into 8×8 chunks; a block change rebuilds its chunk and
// any neighbouring chunk that shares a face with it.
const CH = 8;
let chunkOf = null, chunkCols = null, chunkMesh = new Map(), dirty = new Set();
const col3 = new THREE.Color();

function hexRGB(h) { col3.set(h); return [col3.r, col3.g, col3.b]; }
const RGB = BLOCKS.map((b) => b.color ? {
  top: hexRGB(b.top || b.color), side: hexRGB(b.side || b.color), fleck: b.fleck ? hexRGB(b.fleck) : null,
} : null);

function opaque(r, c, y) {
  if (y < 0) return true;
  if (y >= H) return false;
  const k = BLOCKS[r.b[c * H + y]];
  return k.solid && !k.clear;           // glass is solid but you see through it
}

function buildChunk(key) {
  const r = replay, cols = r.world.tiling.cols;
  const P = [], N = [], C = [], WP = [], WN = [], GP = [], GN = [];
  const tri = (out, nout, a, b, c, n) => {
    // orient the triangle to its intended normal, whatever the poly winding
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    if (cx * n[0] + cy * n[1] + cz * n[2] < 0) { const t = b; b = c; c = t; }
    out.push(...a, ...b, ...c);
    nout.push(...n, ...n, ...n);
  };
  const face = (verts, n, rgb, shade) => {
    const k = P.length;
    for (let i = 1; i + 1 < verts.length; i++) tri(P, N, verts[0], verts[i], verts[i + 1], n);
    const cnt = (P.length - k) / 3;
    for (let i = 0; i < cnt; i++) C.push(rgb[0] * shade, rgb[1] * shade, rgb[2] * shade);
  };
  for (const c of chunkCols.get(key)) {
    const col = cols[c], poly = col.poly, nb = col.nb;
    for (let y = 0; y < H; y++) {
      const id = r.b[c * H + y];
      if (id === B.air || id === B.torch) continue;
      if (id === B.water) {
        if (r.b[c * H + y + 1] === B.air || y === H - 1) {
          const top = poly.map(([x, z]) => [x, y + 0.88, z]);
          for (let i = 1; i + 1 < top.length; i++) tri(WP, WN, top[0], top[i], top[i + 1], [0, 1, 0]);
        }
        continue;
      }
      if (id === B.glass) {
        const nb2 = (cc, yy) => r.b[cc * H + yy] === B.glass || opaque(r, cc, yy);
        if (!nb2(c, y + 1)) { const t = poly.map(([x, z]) => [x, y + 1, z]); for (let i = 1; i + 1 < t.length; i++) tri(GP, GN, t[0], t[i], t[i + 1], [0, 1, 0]); }
        for (let e = 0; e < poly.length; e++) {
          const n = nb[e];
          if (n >= 0 && nb2(n, y)) continue;
          const a = poly[e], b2 = poly[(e + 1) % poly.length];
          const q = [[a[0], y, a[1]], [b2[0], y, b2[1]], [b2[0], y + 1, b2[1]], [a[0], y + 1, a[1]]];
          const mx = (a[0] + b2[0]) / 2 - col.x, mz = (a[1] + b2[1]) / 2 - col.z, L = Math.hypot(mx, mz) || 1;
          tri(GP, GN, q[0], q[1], q[2], [mx / L, 0, mz / L]); tri(GP, GN, q[0], q[2], q[3], [mx / L, 0, mz / L]);
        }
        continue;
      }
      const rgb = RGB[id];
      const jitter = 0.9 + 0.14 * hash01(c, y, 77);
      const fleck = rgb.fleck && hash01(c, y, 5) < 0.5;
      const topRGB = fleck ? rgb.fleck : rgb.top, sideRGB = fleck ? rgb.fleck : rgb.side;
      if (!opaque(r, c, y + 1)) face(poly.map(([x, z]) => [x, y + 1, z]), [0, 1, 0], topRGB, jitter);
      // y = 0 gets its underside too: the world's floor is what the cutaway
      // cap sees through sliced rock
      if (y === 0 || !opaque(r, c, y - 1)) face(poly.map(([x, z]) => [x, y, z]), [0, -1, 0], rgb.side, jitter * 0.6);
      for (let e = 0; e < poly.length; e++) {
        const n = nb[e];
        if (n >= 0 && opaque(r, n, y)) continue;
        const a = poly[e], b2 = poly[(e + 1) % poly.length];
        const ex = b2[0] - a[0], ez = b2[1] - a[1], L = Math.hypot(ex, ez) || 1;
        // outward normal: away from the tile centre
        let nx = ez / L, nz = -ex / L;
        const mx = (a[0] + b2[0]) / 2 - col.x, mz = (a[1] + b2[1]) / 2 - col.z;
        if (nx * mx + nz * mz < 0) { nx = -nx; nz = -nz; }
        // grass keeps a green lip on its sides, like the block people know
        const sRGB = id === B.grass ? rgb.side : sideRGB;
        face([[a[0], y, a[1]], [b2[0], y, b2[1]], [b2[0], y + 1, b2[1]], [a[0], y + 1, a[1]]], [nx, 0, nz], sRGB, jitter * 0.85);
        if (id === B.grass) face([[a[0], y + 0.82, a[1]], [b2[0], y + 0.82, b2[1]], [b2[0], y + 1.001, b2[1]], [a[0], y + 1.001, a[1]]].map(([x, yy, z]) => [x + nx * 0.002, yy, z + nz * 0.002]), [nx, 0, nz], rgb.top, jitter * 0.85);
      }
    }
  }
  const old = chunkMesh.get(key);
  if (old) { world.remove(old); new Set(old.children.map((m) => m.geometry)).forEach((g) => g.dispose()); }
  const g = new THREE.Group();
  if (P.length) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    g.add(new THREE.Mesh(geo, matSolid), new THREE.Mesh(geo, matCap));
  }
  if (WP.length) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(WP, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(WN, 3));
    const m = new THREE.Mesh(geo, matWater);
    m.renderOrder = 1;
    g.add(m);
  }
  if (GP.length) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(GP, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(GN, 3));
    const m = new THREE.Mesh(geo, matGlass);
    m.renderOrder = 2;
    g.add(m);
  }
  chunkMesh.set(key, g);
  world.add(g);
}

function initMeshes() {
  for (const g of chunkMesh.values()) { world.remove(g); g.children.forEach((m) => m.geometry.dispose()); }
  chunkMesh = new Map(); dirty = new Set();
  const cols = replay.world.tiling.cols;
  chunkOf = new Int32Array(cols.length);
  chunkCols = new Map();
  const keys = new Map();
  cols.forEach((c, i) => {
    const k = Math.floor(c.x / CH) + ',' + Math.floor(c.z / CH);
    if (!keys.has(k)) { keys.set(k, keys.size); chunkCols.set(keys.size - 1, []); }
    chunkOf[i] = keys.get(k);
    chunkCols.get(chunkOf[i]).push(i);
  });
  for (const k of chunkCols.keys()) buildChunk(k);
  rebuildTorches();
  locate = columnLocator(replay.world.tiling);
}
function markDirty(c) {
  dirty.add(chunkOf[c]);
  for (const n of replay.world.tiling.cols[c].adj) dirty.add(chunkOf[n]);
}

let torchGroup = new THREE.Group();
scene.add(torchGroup);
function rebuildTorches() {
  scene.remove(torchGroup);
  torchGroup = new THREE.Group();
  const cols = replay.world.tiling.cols, b = replay.b;
  const geo = new THREE.BoxGeometry(0.12, 0.6, 0.12);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffd35a });
  for (let c = 0; c < cols.length; c++) for (let y = 0; y < H; y++) if (b[c * H + y] === B.torch) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(cols[c].x, y + 0.3, cols[c].z);
    torchGroup.add(m);
  }
  scene.add(torchGroup);
}

// ------------------------------------------------------------ entities -----
const entMesh = new Map();
const TEAM_SHIRTS = [0x2f7fd0, 0x1fa39a, 0xd9822b, 0x8e5bd0, 0xc94f6d];
function makeEnt(kind, id = 0) {
  const g = new THREE.Group();
  const box = (w, h, d, color, y) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color })); m.position.y = y; g.add(m); return m; };
  if (kind === 'pig') { box(0.8, 0.55, 0.5, 0xf0a3b4, 0.4); box(0.36, 0.36, 0.36, 0xf5b7c5, 0.55).position.x = 0.5; }
  else {
    const shirt = kind === 'player' ? TEAM_SHIRTS[(sim ? Math.max(0, sim.players.findIndex((e) => e.id === id)) : 0) % TEAM_SHIRTS.length] : 0x3b8a4a, skin = kind === 'player' ? 0xd9a57c : 0x6ea35a;
    box(0.5, 0.75, 0.3, kind === 'player' ? 0x3a3f8f : 0x3a3f8f, 0.375);
    box(0.55, 0.65, 0.32, shirt, 1.07);
    box(0.45, 0.45, 0.45, skin, 1.62);
  }
  return g;
}
function syncEntities(dt) {
  const cols = replay.world.tiling.cols;
  for (const [id, m] of entMesh) if (!replay.ents.has(id)) { entGroup.remove(m); entMesh.delete(id); }
  for (const e of replay.ents.values()) {
    let m = entMesh.get(e.id);
    const tx = cols[e.c].x, tz = cols[e.c].z, ty = e.y;
    if (!m) { m = makeEnt(e.kind, e.id); m.position.set(tx, ty, tz); entGroup.add(m); entMesh.set(e.id, m); }
    const k = Math.min(1, dt * 10);
    const dx = tx - m.position.x, dz = tz - m.position.z;
    if (Math.abs(dx) + Math.abs(dz) > 1e-3 && !(e.id === focusId && playing())) m.rotation.y = Math.atan2(-dz, dx);
    if (Math.hypot(dx, dz) > 6) m.position.set(tx, ty, tz);      // a respawn, not a walk
    else { m.position.x += dx * k; m.position.z += dz * k; m.position.y += (ty - m.position.y) * k; }
    if (e.id !== focusId) m.visible = ty < cut.constant;
  }
}

// ----------------------------------------------------------------- HUD ------
const ITEM_COLOR = {
  stick: '#9c7a45', coal: '#222', charcoal: '#3a2e25', iron_ingot: '#d8d8d8', apple: '#d33', porkchop: '#f0a3b4', cooked_porkchop: '#b5653d',
  wooden_pickaxe: '#b8945a', stone_pickaxe: '#8a8a8a', iron_pickaxe: '#d8d8d8', wooden_sword: '#b8945a', stone_sword: '#8a8a8a', iron_sword: '#d8d8d8',
};
function hud() {
  const t = replay.tick, day = Math.floor(t / DAY) + 1, ph = t % DAY;
  const mins = Math.floor((ph / DAY) * 24 * 60 + 6 * 60) % (24 * 60);
  $('clock').textContent = `day ${day} · ${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}${ph >= NIGHT_START ? ' · night' : ''} · tick ${t}`;
  $('hp').textContent = '♥'.repeat(Math.ceil(replay.hp / 2)).padEnd(10, '·') + ` ${replay.hp}`;
  $('food').textContent = '◆'.repeat(Math.ceil(replay.food / 2)).padEnd(10, '·') + ` ${replay.food}`;
  $('lines').textContent = allLines.length || (fileLines ? fileLines.length : 0);
  const inv = $('inv');
  const key = JSON.stringify(replay.inv) + hands.sel;
  if (inv.dataset.key === key) return;
  inv.dataset.key = key;
  inv.innerHTML = '';
  Object.entries(replay.inv).forEach(([k, n], i) => {
    const s = document.createElement('span');
    s.className = 'chip' + (k === hands.selected() ? ' sel' : '');
    s.title = `${i < 9 ? `key ${i + 1} · ` : ''}${PLACEABLE.has(k) ? 'right click places it' : FOOD[k] ? 'F eats it' : ''}`;
    s.addEventListener('click', () => { hands.sel = i; });
    const blk = BLOCKS[B[k]];
    s.innerHTML = `<i style="background:${(blk && (blk.top || blk.color)) || ITEM_COLOR[k] || '#777'}"></i>${i < 9 ? `<span class="mono">${i + 1}</span> ` : ''}${k.replace(/_/g, ' ')} <b>${n}</b>`;
    inv.appendChild(s);
  });
}
function logMacro(note) {
  const d = note.data || {};
  if (note.kind === 'macro_end') macroLog.unshift({ t: note.k, text: `${d.name} — ${d.ok ? 'done' : d.why}`, ok: d.ok });
  else if (note.kind === 'dusk' || note.kind === 'dawn') macroLog.unshift({ t: note.k, text: note.kind, ok: note.kind === 'dawn' });
  else if (note.kind === 'home') macroLog.unshift({ t: note.k, text: d.house ? 'house built — home' : 'home set here', ok: true });
  else return;
  macroLog = macroLog.slice(0, 14);
  $('log').innerHTML = macroLog.map((m) => `<li class="${m.ok ? 'ok' : 'bad'}">${m.t} ${m.text}</li>`).join('');
}
function tail(lines) {
  if (!lines.length) return;
  const el = $('tail');
  const keep = (el.textContent ? el.textContent.split('\n') : []).concat(lines.map((l) => l.length > 96 ? l.slice(0, 93) + '…' : l));
  el.textContent = keep.slice(-8).join('\n');
}

// -------------------------------------------------------------- feed -------
function feed(lines) {
  let blocksChanged = false;
  for (const line of lines) {
    const evs = replay.apply(line);
    for (const ev of evs) {
      if (ev[0] === 'b') { markDirty(ev[1]); blocksChanged = true; }
      if (ev[0] === 'note') logMacro({ k: replay.tick, kind: ev[1], data: ev[2] });
      if (ev[0] === 'note' && ev[1] === 'home') homeAt = ev[2];
      if (ev[0] === 'do') $('doing').textContent = ev.slice(1).join(' ');
      if (playing() && ev[0] === 'die' && ev[1] === focusId) toast(homeAt ? 'you died — back home' : 'you died — back at the spawn');
      if (playing() && ev[0] === 'note' && ev[1] === 'dusk') toast('dusk: zombies spawn on open ground');
      if (playing() && ev[0] === 'hit' && ev[2] === focusId && ev[1] >= 0) toast('a zombie hits you');
    }
  }
  if (blocksChanged) rebuildTorches();
  tail(lines);
}

// -------------------------------------------------------------- modes ------
// The palette, drawn by mode. A macro that cannot run now is greyed out and
// its reason is the tooltip — the same needs() Jev's option set is built from.
const ARGS = {
  gather_wood: { n: 5 }, mine_stone: { n: 11 }, mine_coal: { n: 4 }, mine_iron: { iron: 3, coal: 3 },
  branch_mine: { length: 16 }, explore: { steps: 40 }, light_area: { n: 4 },
};
const CRAFTABLE = ['wooden_pickaxe', 'stone_pickaxe', 'iron_pickaxe', 'stone_sword', 'iron_sword', 'torch', 'door', 'glass', 'furnace', 'crafting_table', 'charcoal', 'iron_ingot', 'cooked_porkchop', 'planks', 'stick'];
function argsFor(name) {
  if (name === 'craft') { const item = $('craft-item').value; return { item, n: item === 'torch' ? 4 : 1 }; }
  if (name === 'scout') return { what: $('scout-what').value };
  if (['follow', 'guard', 'give'].includes(name)) {
    const other = sim && sim.players.find((e) => e.id !== focusId);
    return other ? { to: other.id, ...(name === 'give' ? { what: 'wood' } : {}), ...(name === 'guard' ? { ticks: 160 } : {}) } : null;
  }
  return ARGS[name] || null;
}
function buildMacroButtons() {
  const box = $('macros');
  box.innerHTML = '';
  for (const mode of MODES) {
    const h = document.createElement('div');
    h.className = 'mode'; h.textContent = mode;
    box.appendChild(h);
    const row = document.createElement('div');
    row.className = 'mrow';
    for (const [name, m] of Object.entries(PALETTE)) {
      if (m.mode !== mode) continue;
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = name.replace(/_/g, ' '); b.dataset.macro = name; b.title = m.doc;
      b.addEventListener('click', () => {
      if (party && human) { party.startMacro(human, name, argsFor(name)); return; }
      if (driver) { if ($('who').value !== 'you') { $('who').value = 'you'; setAuto(); } driver.start(name, argsFor(name)); }
    });
      row.appendChild(b);
      if (name === 'craft') {
        const sel = document.createElement('select'); sel.id = 'craft-item';
        for (const it of CRAFTABLE) { const o = document.createElement('option'); o.value = it; o.textContent = it.replace(/_/g, ' '); sel.appendChild(o); }
        row.appendChild(sel);
      }
      if (name === 'scout') {
        const sel = document.createElement('select'); sel.id = 'scout-what';
        for (const it of ['tree', 'pig', 'coal', 'iron', 'sand']) { const o = document.createElement('option'); o.value = o.textContent = it; sel.appendChild(o); }
        row.appendChild(sel);
      }
    }
    box.appendChild(row);
  }
}
let legalAt = 0;
function refreshLegal(now) {
  if (!sim || now - legalAt < 400) return;
  legalAt = now;
  for (const b of document.querySelectorAll('#macros button')) {
    const m = PALETTE[b.dataset.macro];
    const why = party && !human ? 'a swarm has no human seat' : human ? sim.as(human.e, () => m.needs(sim, argsFor(b.dataset.macro) || {})) : m.needs(sim, argsFor(b.dataset.macro) || {});
    b.disabled = !!why;
    b.title = why ? `${m.doc} — can't: ${why}` : m.doc;
    b.classList.toggle('on', driver && driver.gen && driver.cur && driver.cur.name === b.dataset.macro);
  }
}

// who decides. Everything except "you" goes through mind.mjs: the same
// state, the same options, the same resolve — only the answerer differs.
let pending = null, keyConfigured = null, liveSeen = false;
const askLive = jevDecider('../api/ask');
let lastMode = null, partyWaiting = [], partySince = 0;
const isParty = (w) => w === 'coop' || w === 'swarm';
function setAuto() {
  if (!driver) return;
  if (lastMode && isParty($('who').value) !== isParty(lastMode) || (isParty($('who').value) && $('who').value !== lastMode)) { startLive(); return; }
  driver.policy = () => null;             // decisions are made in the frame loop, below
  driver.done = false;
  const who = $('who').value;
  if (who === 'you' || who === 'coop') {
    $('speed').value = 1; $('speed-out').textContent = '1×'; $('pause').checked = false;
    const f = new THREE.Vector3(); camera.getWorldDirection(f);
    hands.yaw = Math.atan2(-f.x, -f.z); hands.pitch = -0.15;
    target = sim ? sim.tick : target;
  } else if (locked()) document.exitPointerLock();
  $('macro-hint').textContent = who === 'you' ? '— you are playing: click one to run it' : who === 'coop' ? '— click one to run it for you; Jev chooses its own' : who === 'swarm' ? '— three Jevs are choosing' : who === 'jev' ? '— Jev is choosing' : `— the ${who} decider is choosing`;
}
// Live calls are paced: at most one every MIN_GAP ms (the proxy allows 30 a
// minute per visitor), a 429 is waited out and retried, and a quick macro is
// followed by the same answer's next-ranked option instead of a new call.
const MIN_GAP = 2200;
const REUSE_ON = new URLSearchParams(location.hash.slice(1)).get('reuse') === '1';
let lastCallAt = 0, lastLive = null;
const callTimes = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function askPaced(opts, qs, state) {
  for (let attempt = 0; ; attempt++) {
    const wait = MIN_GAP - (performance.now() - lastCallAt);
    if (wait > 0) await sleep(wait);
    lastCallAt = performance.now();
    callTimes.push(lastCallAt);
    try { return await askLive(sim, opts, qs, state); }
    catch (e) {
      if (e.status !== 429 || attempt >= 2) throw e;
      const secs = e.retryAfter || 5;
      $('src').textContent = `rate limited — waiting ${secs}s`;
      await sleep(secs * 1000);
    }
  }
}
async function decideNow() {
  const who = $('who').value;
  const opts = options(sim);
  if (!opts.length) { sim.act({ op: 'wait', ticks: 10 }); return; }
  let response, reused = null;
  // reusing a call's ranking saves calls but is unmeasured live — opt-in only
  if (who === 'jev' && REUSE_ON) reused = reuseRanking(sim, lastLive, opts);
  if (reused) {
    lastLive.reused++; lastLive.used.add(reused.opt.id);
    response = { source: 'typesafe-reused', answers: { next: { choice: reused.opt.id, confidence: reused.p, probabilities: lastLive.response.answers.next.probabilities } } };
  } else if (who === 'jev' && keyConfigured !== false) {
    const qs = buildQuestions(sim, opts), state = perceive(sim);
    try {
      response = await askPaced(opts, qs, state);
      if (response.source === 'typesafe') { liveSeen = true; lastLive = { tick: sim.tick, response, reused: 0, used: new Set([response.answers?.next?.choice]), interrupted: false }; }
    } catch (e) { response = { ...DECIDERS.offline(sim, opts), error: `live call failed: ${e.message}` }; }
  } else if (who === 'jev') {
    response = { ...DECIDERS.offline(sim, opts), error: 'no key configured on the worker — this is the offline stand-in, not Jev' };
  } else response = DECIDERS[who](sim, opts);
  if (!sim || driver.gen) return;                                     // the world was replaced while we waited
  const { pick, record } = resolve(sim, opts, { ...response, source: response.source === 'typesafe-reused' ? 'typesafe' : response.source });
  record.source = response.source;
  if (response.error) record.error = response.error;
  sim.note('jev', { ...record, pick: pick && pick.name });
  showDecision(opts, response, record, pick);
  if (pick) { driver.start(pick.name, pick.args); driver._record = record; }
  else sim.act({ op: 'wait', ticks: 10 });
}
// Multiplayer decisions: every Jev member waiting for a decision goes into
// ONE batched call (mind.batchRequest), at most one call per MIN_GAP. While
// it is in flight the world keeps running — the waiting agents stand still.
let partyBusy = false;
async function decideParty(members) {
  partyBusy = true;
  const p0 = party;
  try {
    const { state, questions, per } = batchRequest(sim, members);
    if (!per.size) { for (const m of members) { m.wantsDecision = false; m.thinking = false; } return; }
    let resp;
    if (keyConfigured === false) resp = { error: 'no key configured on the worker — this is the offline stand-in, not Jev', answers: {} };
    else try {
      const wait = MIN_GAP - (performance.now() - lastCallAt);
      if (wait > 0) await sleep(wait);
      lastCallAt = performance.now(); callTimes.push(lastCallAt);
      const r = await fetch('../api/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ state, questions }) });
      resp = await r.json().catch(() => ({ error: 'unreadable response' }));
      if (!r.ok) throw Object.assign(new Error(resp.error || `HTTP ${r.status}`), { retryAfter: resp.retry_after_s });
    } catch (e) {
      resp = { error: `live call failed: ${e.message}`, answers: {} };
      if (e.retryAfter) await sleep(e.retryAfter * 1000);
    }
    if (party !== p0) return;                                    // the world was replaced while we waited
    for (const [m, opts] of per) sim.as(m.e, () => {
      const a = resp.answers?.[`next_${m.e.id}`];
      const one = a ? { source: resp.source || 'typesafe', answers: { next: a } } : { ...DECIDERS.offline(sim, opts), error: resp.error || 'no answer for this agent' };
      applyAsk(sim, m.e, a ? resp.answers?.[`ask_${m.e.id}`]?.choice : offlineAsk(sim));
      const { pick, record } = resolve(sim, opts, one, { gate: false });
      record.who = m.e.id; record.source = one.source;
      if (one.error) record.error = one.error;
      m.wantsDecision = false; m.thinking = false;
      sim.note('jev', { ...record, pick: pick && pick.name, who: m.e.id });
      if (m.e.id === focusId || $('who').value === 'coop') showDecision(opts, one, record, pick, m.e.id, per.size);
      if (!pick) { m.pending = { a: { op: 'wait' }, pl: { ticks: 10 }, t0: sim.tick, doneAt: sim.tick + 10 }; return; }
      m.onEnded = (ended) => sim.as(m.e, () => { journal(sim, record, ended); remember(sim, record.choice, ended); fulfil(sim, pick, ended); });
      party.startMacro(m, pick.name, pick.args);
    });
  } finally { partyBusy = false; }
}

// The team strip: everyone's health, food and what they are doing, and any
// request standing. In a swarm, click a row to watch that agent. In co-op,
// the ask buttons set YOUR player's request, which every Jev teammate sees
// in its state (perceive → team) and answers with follow / guard / give.
let teamAt = 0;
function buildAsks() {
  const row = $('ask-row');
  row.innerHTML = '';
  for (const [what, label] of Object.entries(REQUESTS)) {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = what; b.title = label; b.dataset.ask = what;
    b.addEventListener('click', () => ask(what));
    row.appendChild(b);
  }
  const x = document.createElement('button');
  x.type = 'button'; x.textContent = 'never mind'; x.dataset.ask = '';
  x.addEventListener('click', () => ask(null));
  row.appendChild(x);
}
function ask(what) {
  if (!human || !sim) return;
  const cur = human.e.request && human.e.request.what;
  if (!what || what === cur) { human.e.request = null; sim.note('request', { who: human.e.id, what: null }); toast('request withdrawn'); }
  else { human.e.request = { what, tick: sim.tick }; sim.note('request', { who: human.e.id, what }); toast(`asked Jev to ${REQUESTS[what]}`); }
  teamAt = 0;
}
$('team-list').addEventListener('click', (ev) => {
  const b = ev.target.closest('.tm');
  if (!b || human) return;                   // in co-op your eyes stay yours
  focusId = +b.dataset.id; if (replay) replay.focus = focusId; teamAt = 0;
});
function renderTeam(now) {
  const box = $('team');
  box.hidden = !party;
  document.body.classList.toggle('party', !!party);
  $('asks').hidden = !human;
  if (!party || now - teamAt < 300) return;
  teamAt = now;
  $('team-hint').textContent = human ? (locked() && !touching ? '— Esc frees the mouse to ask' : '— what you ask goes into Jev\'s state') : '— click one to watch it';
  const live = (e) => e.request && sim.tick - e.request.tick < 1600 ? e.request.what : null;
  const html = party.members.map((m, i) => {
    const e = m.e, who = m.controller === 'human' ? 'you' : `Jev #${e.id}`;
    const doing = m.thinking ? 'thinking…' : (e.doing || 'idle').replace(/_/g, ' ');
    const r = live(e);
    return `<button type="button" class="tm${e.id === focusId ? ' focus' : ''}" data-id="${e.id}"><i style="background:#${TEAM_SHIRTS[i % TEAM_SHIRTS.length].toString(16).padStart(6, '0')}"></i>`
      + `<span>${who} <span class="st">${doing}</span>${r ? ` <span class="st ask">asks: ${r}</span>` : ''}</span>`
      + `<span class="st">♥${e.hp} ◆${e.food}</span></button>`;
  }).join('');
  if ($('team-list').dataset.html !== html) { $('team-list').innerHTML = html; $('team-list').dataset.html = html; }   // rewrite only on change, or a click lands on a detached row
  const mine = human && live(human.e);
  for (const b of $('ask-row').querySelectorAll('button')) b.classList.toggle('on', !!mine && b.dataset.ask === mine);
}

function showDecision(opts, response, record, pick, who, batchN) {
  const probs = response.answers?.next?.probabilities || {};
  const rows = opts.map((o) => ({ id: o.id, p: probs[o.id] ?? (o.id === record.choice ? 1 : 0) }))
    .sort((a, b) => b.p - a.p).slice(0, 8);
  const now = performance.now();
  while (callTimes.length && now - callTimes[0] > 60000) callTimes.shift();
  const src = response.source === 'typesafe' ? 'Jev (live)' : response.source === 'typesafe-reused' ? 'Jev (same call, next-ranked)' : response.source === 'offline' ? 'offline stand-in — not the model' : response.source;
  $('src').textContent = src + (who != null ? ` · agent #${who}` : '') + (batchN > 1 ? ` · 1 call for ${batchN}` : '') + (['jev', 'coop', 'swarm'].includes($('who').value) ? ` · ${callTimes.length} calls/min` : '');
  $('decision').innerHTML = rows.map((r) => `<div class="opt${r.id === record.choice ? ' pick' : ''}"><span>${r.id.replace(/_/g, ' ')}</span><span class="bar"><i style="width:${Math.round(r.p * 100)}%"></i></span><span class="mono">${r.p ? r.p.toFixed(2) : ''}</span></div>`).join('')
    + `<div class="meta">${opts.length} legal options` + (record.confidence != null ? ` · confidence ${record.confidence.toFixed(2)}` : '')
    + (record.danger != null ? ` · danger ${record.danger.toFixed(1)}/3` : '') + (record.have != null ? ` · have ${record.have.toFixed(2)}` : '') + '</div>'
    + (record.gated ? `<div class="meta warn">below the ${GATE} gate — the baseline's pick (${record.fallback}) was used instead</div>` : '')
    + (record.error ? `<div class="meta bad">${record.error}</div>` : '')
    + (pick ? `<div class="meta">doing: ${pick.name.replace(/_/g, ' ')}${pick.args ? ' ' + JSON.stringify(pick.args) : ''}</div>` : '');
}

function startLive() {
  const shape = $('shape').value, seed = Math.max(1, parseInt($('seed').value, 10) || 1);
  location.hash = `kind=${$('kind').value}&size=${$('size').value}&shape=${shape}&seed=${seed}&who=${$('who').value}&difficulty=${$('difficulty').value}`;
  fileLines = null;
  sim = new Sim({ shape, seed, difficulty: $('difficulty').value, kind: $('kind').value, size: $('size').value });
  lastLive = null;
  outbox = [];
  pending = null;
  party = null; human = null; focusId = sim.players[0].id; partyWaiting = []; partySince = 0;
  const who = $('who').value;
  if (who === 'coop' || who === 'swarm') {
    // multiplayer: everyone shares one clock (party.mjs); Jev thinks in real time
    const extra = who === 'coop' ? 1 : 2;
    for (let i = 0; i < extra; i++) sim.addPlayer();
    party = new Party(sim);
    sim.players.forEach((e, i) => {
      if (who === 'coop' && i === 0) {
        human = party.join(e, 'human', { queue: hands.queue, intent: () => moveIntent(), onResult: (a, r) => { if (!r.ok && a.op !== 'move') toast(r.why); if (r.ok && r.ticks > 1) hands.busy = { op: a.op, start: sim.tick - r.ticks, end: sim.tick }; } });
        e.role = 'human';
      } else party.join(e, 'mind');
    });
  }
  lastMode = who;
  driver = new Driver(sim);
  setAuto();
  const lines = sim.drain();
  allLines = lines.slice();
  replay = new Replay(lines[0]);
  replay.focus = focusId;
  initMeshes();
  macroLog = []; $('log').innerHTML = ''; $('tail').textContent = ''; homeAt = null;
  feed(lines.slice(1));
  target = sim.tick;
  $('mode').textContent = 'live';
  $('shape-name').textContent = shape;
  snapCamera();
}

function startFile(text) {
  const lines = text.split('\n').filter((l) => l.trim());
  let head;
  try { head = JSON.parse(lines[0]); } catch { alert('not a craft stream: the first line is not JSON'); return; }
  if (head.t !== 'craft') { alert('not a craft stream: no craft header'); return; }
  try { replay = new Replay(lines[0]); } catch (e) { alert(e.message); return; }
  sim = null; driver = null;
  fileLines = lines; fileCursor = 1; allLines = [];
  initMeshes();
  macroLog = []; $('log').innerHTML = ''; $('tail').textContent = ''; homeAt = null;
  target = 0;
  $('mode').textContent = `replay · ${head.shape} seed ${head.seed}`;
  $('shape-name').textContent = head.shape;
  document.querySelectorAll('#macros button').forEach((b) => { b.disabled = true; });
  snapCamera();
}

// ------------------------------------------------------------- camera ------
let homeAt = null;                    // from the stream's 'home' note
function playerPos() {
  if ($('homecam').checked && homeAt && replay) {
    const c = replay.world.tiling.cols[homeAt.c];
    return new THREE.Vector3(c.x, homeAt.y, c.z);
  }
  const p = entMesh.get(focusId);
  return p ? p.position : new THREE.Vector3(0, 20, 0);
}
function snapCamera() {
  const p = playerPos();
  controls.target.set(p.x, p.y + 1.5, p.z);
  camera.position.set(p.x + 13, p.y + 13, p.z + 13);
}
function underground() {
  const p = replay.ents.get(focusId);
  if (!p) return false;
  // a canopy is not a ceiling: only rock, earth and built blocks count
  for (let y = p.y + 2; y < H; y++) { const id = replay.b[p.c * H + y]; if (![B.air, B.torch, B.leaves, B.log, B.water].includes(id)) return true; }
  return false;
}
function updateCamera() {
  const p = playerPos();
  const pe = replay.ents.get(focusId);
  if (playing()) {
    // your own eyes (or just behind your shoulder, V)
    cut.constant = 1e6;
    controls.enabled = false;
    const m = entMesh.get(focusId);
    camera.rotation.set(hands.pitch, hands.yaw, 0, 'YXZ');
    const head = new THREE.Vector3(p.x, p.y + 1.62, p.z);
    if (hands.third) {
      // behind the shoulder, pulled in to the last open voxel so the camera
      // never ends up inside a hillside looking at rock
      camera.updateMatrixWorld();
      const back = new THREE.Vector3(); camera.getWorldDirection(back); back.negate();
      let dist = 0.3;
      for (let t = 0.3; t <= 4.5; t += 0.1) {
        const q = head.clone().addScaledVector(back, t).add(new THREE.Vector3(0, 0.6 * t / 4.5, 0));
        const c = locate ? locate(q.x, q.z) : -1, vy = Math.floor(q.y);
        if (c >= 0 && vy >= 0 && vy < H && BLOCKS[replay.b[c * H + vy]].solid) break;
        dist = t;
      }
      camera.position.copy(head).addScaledVector(back, Math.max(0.3, dist - 0.2)).add(new THREE.Vector3(0, 0.6 * dist / 4.5, 0));
    } else camera.position.copy(head);
    if (m) { m.visible = hands.third; m.rotation.y = hands.yaw + Math.PI / 2; }
    return;
  }
  cut.constant = !$('pov').checked && !$('homecam').checked && pe && underground() ? pe.y + 2.02 : 1e6;
  if ($('pov').checked) {
    const m = entMesh.get(focusId);
    controls.enabled = false;
    const yaw = m ? m.rotation.y : 0;
    camera.position.set(p.x, p.y + 1.62, p.z);
    camera.lookAt(p.x + Math.cos(yaw) * 4, p.y + 1.2, p.z - Math.sin(yaw) * 4);
    if (m) m.visible = false;
  } else {
    controls.enabled = true;
    const m = entMesh.get(focusId); if (m) m.visible = true;
    const want = new THREE.Vector3(p.x, p.y + 1.5, p.z);
    const delta = want.clone().sub(controls.target).multiplyScalar(0.12);
    controls.target.add(delta); camera.position.add(delta);
    if ($('homecam').checked && homeAt) {
      // nearly straight down: houses go up among trees, and a canopy in the
      // way of a low orbit hides the whole point of the view
      const eye = want.clone().add(new THREE.Vector3(2.5, 11, 4));
      camera.position.lerp(eye, 0.15);
    }
    controls.update();
  }
}
function sky() {
  const ph = (replay.tick % DAY) / DAY;
  const n = ph < 0.58 ? 0 : ph < 0.625 ? (ph - 0.58) / 0.045 : ph < 0.955 ? 1 : 1 - (ph - 0.955) / 0.045;
  const c = new THREE.Color(0x8ec5ff).lerp(new THREE.Color(0x0b1020), n);
  scene.background = c;
  scene.fog = new THREE.Fog(c, 40, 110);
  sun.intensity = 1.4 * (1 - n) + 0.08;
  hemi.intensity = 0.9 * (1 - n) + 0.25;
}

// --------------------------------------------------------------- hands ------
// Playing it yourself. Every input becomes a primitive sim action — the same
// act() the macros and Jev use, costing the same ticks — so a human game
// streams, replays and scores exactly like any other.
const hands = {
  yaw: 0, pitch: -0.2, keys: new Set(), queue: [], third: false, sel: 0, aim: null,
  items() { return replay ? Object.keys(replay.inv) : []; },
  selected() { const it = this.items(); return it[Math.min(this.sel, it.length - 1)] || null; },
};
const playing = () => sim && ($('who').value === 'you' || $('who').value === 'coop');
const locked = () => document.pointerLockElement === canvas;
// touch screens have no pointer lock: "engaged" is locked OR the touch game started
const touching = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (touching) document.body.classList.add('touching');
let touchOn = false;
const engaged = () => locked() || (touching && touchOn);
function toast(msg) {
  const t = $('toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.h); toast.h = setTimeout(() => { t.hidden = true; }, 1800);
}
// the forward direction on the ground, from the camera
function flatForward() {
  const v = new THREE.Vector3();
  camera.getWorldDirection(v); v.y = 0;
  return v.lengthSq() ? v.normalize() : new THREE.Vector3(0, 0, -1);
}
// WASD on a tiling: the neighbour whose direction best matches the wanted one
function stepToward(want) {
  const p = sim.player, here = sim.cols[p.c];
  let best = -1, bd = 0.35;
  for (const n of here.adj) {
    const dx = sim.cols[n].x - here.x, dz = sim.cols[n].z - here.z, L = Math.hypot(dx, dz) || 1;
    const d = (dx * want.x + dz * want.z) / L;
    if (d > bd) { bd = d; best = n; }
  }
  return best;
}
function moveIntent() {
  const k = hands.keys;
  const f = flatForward(), r = new THREE.Vector3(-f.z, 0, f.x);
  const w = new THREE.Vector3();
  if (stick.active && Math.hypot(stick.x, stick.y) > 0.35) { w.addScaledVector(f, stick.y).addScaledVector(r, stick.x); }
  if (k.has('KeyW')) w.add(f);
  if (k.has('KeyS')) w.sub(f);
  if (k.has('KeyD')) w.add(r);
  if (k.has('KeyA')) w.sub(r);
  if (!w.lengthSq()) return null;
  w.normalize();
  const n = stepToward(w);
  return n >= 0 ? { op: 'move', to: n } : null;
}
// Aim: march the view ray through the prism voxels (and past mobs). Returns
// the first thing hit and the empty voxel just before it (where a block goes).
function aim(nx = 0, ny = 0) {
  if (!replay || !locate) return null;
  camera.updateMatrixWorld();                     // the view as set this frame, not the last render
  const o = camera.position.clone(), d = new THREE.Vector3();
  if (nx || ny) d.set(nx, ny, 0.5).unproject(camera).sub(o).normalize();   // a tap, not the crosshair
  else camera.getWorldDirection(d);
  const pe = entMesh.get(focusId);
  const start = hands.third && pe ? camera.position.distanceTo(new THREE.Vector3(pe.position.x, pe.position.y + 1.62, pe.position.z)) : 0;
  let prev = null;
  for (let t = start; t < start + 5.5; t += 0.04) {
    const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
    for (const e of replay.ents.values()) {
      if (e.id === focusId) continue;
      const col = replay.world.tiling.cols[e.c], tall = e.kind === 'pig' ? 1 : 2;
      if (Math.hypot(x - col.x, z - col.z) < 0.38 && y >= e.y && y <= e.y + tall) return { ent: e };
    }
    const c = locate(x, z), vy = Math.floor(y);
    if (c < 0 || vy < 0 || vy >= H) { prev = null; continue; }
    const id = replay.b[c * H + vy];
    if (id !== B.air && id !== B.water) return { c, y: vy, id, place: prev };
    if (!prev || prev.c !== c || prev.y !== vy) prev = { c, y: vy };
  }
  return null;
}
// the outline of the aimed voxel: a prism, whatever the tile's shape
const outline = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffffff }));
outline.renderOrder = 5; outline.visible = false;
scene.add(outline);
function showAim(a) {
  if (!a || a.ent || !playing()) { outline.visible = false; return; }
  const key = a.c * H + a.y;
  if (outline.userData.key !== key) {
    const poly = replay.world.tiling.cols[a.c].poly, P = [];
    for (let i = 0; i < poly.length; i++) {
      const [x1, z1] = poly[i], [x2, z2] = poly[(i + 1) % poly.length];
      for (const yy of [a.y - 0.002, a.y + 1.002]) P.push(x1, yy, z1, x2, yy, z2);
      P.push(x1, a.y, z1, x1, a.y + 1, z1);
    }
    outline.geometry.dispose();
    outline.geometry = new THREE.BufferGeometry();
    outline.geometry.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    outline.userData.key = key;
  }
  outline.material.color.set(sim.reachable(sim.player.c, sim.player.y, a.c, a.y) ? 0xffffff : 0xff6b6b);
  outline.visible = true;
}
function takeOver() {
  // a hand on the controls ends whatever macro was running
  if (party && human) { party.takeOver(human); return; }
  if (driver && driver.gen) driver.end({ ok: false, why: 'you took over' });
}
canvas.addEventListener('click', () => { if (playing() && !locked()) canvas.requestPointerLock?.(); });
canvas.addEventListener('contextmenu', (e) => { if (playing()) e.preventDefault(); });
canvas.addEventListener('mousedown', (e) => {
  if (!playing() || !locked()) return;
  const a = hands.aim;
  if (!a) return;
  takeOver();
  if (e.button === 0) {
    if (a.ent) hands.queue.push({ op: 'attack', id: a.ent.id });
    else hands.queue.push({ op: 'mine', c: a.c, y: a.y });
  } else if (e.button === 2) {
    const item = hands.selected();
    if (!item) return toast('nothing selected');
    if (FOOD[item]) return hands.queue.push({ op: 'eat', item });
    if (!PLACEABLE.has(item)) return toast(`${item.replace(/_/g, ' ')} does not place`);
    if (!a.place) return toast('no room to place there');
    hands.queue.push({ op: 'place', c: a.place.c, y: a.place.y, item });
  }
});
document.addEventListener('mousemove', (e) => {
  if (!locked()) return;
  hands.yaw -= e.movementX * 0.0025;
  hands.pitch = Math.max(-1.45, Math.min(1.45, hands.pitch - e.movementY * 0.0025));
});
canvas.addEventListener('wheel', (e) => {
  if (!playing() || !locked()) return;
  const n = hands.items().length || 1;
  hands.sel = (hands.sel + (e.deltaY > 0 ? 1 : n - 1)) % n;
  e.preventDefault();
}, { passive: false });
document.addEventListener('keydown', (e) => {
  if (!playing() || e.target.closest?.('select,input')) return;
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) { hands.keys.add(e.code); takeOver(); e.preventDefault(); }
  else if (/^Digit[1-9]$/.test(e.code)) hands.sel = +e.code.slice(5) - 1;
  else if (e.code === 'KeyV') hands.third = !hands.third;
  else if (e.code === 'KeyF') {
    const food = ['cooked_porkchop', 'apple', 'porkchop'].find((k) => replay.inv[k]);
    if (food) hands.queue.push({ op: 'eat', item: food }); else toast('no food');
  } else if (e.code === 'KeyC') toggleCrafting();
});
document.addEventListener('keyup', (e) => hands.keys.delete(e.code));
window.addEventListener('blur', () => hands.keys.clear());

function toggleCrafting(force) {
  const p = $('craftpanel');
  p.hidden = force != null ? !force : !p.hidden;
  if (!p.hidden) { if (locked()) document.exitPointerLock(); renderRecipes(); }
}
function renderRecipes() {
  const box = $('recipes');
  box.innerHTML = '';
  for (const [item, r] of Object.entries(RECIPES)) {
    const bag = recipeBags(r).find((g) => Object.entries(g).every(([k, n]) => (sim.inv[k] || 0) >= n)) || r.need;
    const has = Object.entries(bag).every(([k, n]) => (sim.inv[k] || 0) >= n);
    const station = !r.at || sim.near(B[r.at]);
    const row = document.createElement('div');
    row.className = 'recipe';
    const need = Object.entries(bag).map(([k, n]) => `${n} ${k.replace(/_/g, ' ')}`).join(' + ') + (r.alt ? ' (or alt.)' : '');
    row.innerHTML = `<b>${r.n > 1 ? r.n + '× ' : ''}${item.replace(/_/g, ' ')}</b><span class="need">${need}${r.at ? ` · at a ${r.at.replace(/_/g, ' ')}${station ? '' : ' (none near)'}` : ''}</span>`;
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = 'craft'; b.disabled = !(has && station);
    b.addEventListener('click', () => { hands.queue.push({ op: 'craft', item }); setTimeout(renderRecipes, 300); });
    row.appendChild(b);
    box.appendChild(row);
  }
}
function syncPlayUI() {
  const on = playing();
  document.body.classList.toggle('immersed', on && engaged());
  document.body.classList.toggle('play', on && engaged());
  // the crosshair doubles as the progress bar of whatever the hands are doing
  const b = hands.busy;
  if (b && target < b.end) {
    const f = Math.max(0, Math.min(1, (target - b.start) / (b.end - b.start))), n = Math.round(f * 8);
    $('crosshair').textContent = '▰'.repeat(n) + '▱'.repeat(8 - n);
  } else { $('crosshair').textContent = '+'; hands.busy = null; }
  $('crosshair').hidden = !(on && locked());
  $('help').hidden = !(on && !engaged()) || !$('craftpanel').hidden;
  if (!on && !$('craftpanel').hidden) toggleCrafting(false);
}
document.addEventListener('pointerlockchange', syncPlayUI);

// --------------------------------------------------------------- touch ------
// A thumb stick for walking, a drag anywhere else to look, a tap to mine (or
// place, with "place" on). Everything funnels into the same hands.queue and
// moveIntent as the keyboard, so touch play is the same game.
const stick = { active: false, id: null, x: 0, y: 0 };
const stickEl = $('stick'), knob = stickEl.querySelector('i');
function stickMove(e) {
  const r = stickEl.getBoundingClientRect();
  let dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2), dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
  const L = Math.hypot(dx, dy); if (L > 1) { dx /= L; dy /= L; }
  stick.x = dx; stick.y = -dy;
  knob.style.transform = `translate(${dx * 34}px, ${dy * 34}px)`;
}
stickEl.addEventListener('pointerdown', (e) => { stick.active = true; stick.id = e.pointerId; try { stickEl.setPointerCapture(e.pointerId); } catch {} stickMove(e); takeOver(); e.preventDefault(); });
stickEl.addEventListener('pointermove', (e) => { if (stick.active && e.pointerId === stick.id) stickMove(e); });
const stickEnd = (e) => { if (e.pointerId !== stick.id) return; stick.active = false; stick.x = stick.y = 0; knob.style.transform = ''; };
stickEl.addEventListener('pointerup', stickEnd); stickEl.addEventListener('pointercancel', stickEnd);

let placeMode = false;
const look = { id: null, x: 0, y: 0, x0: 0, y0: 0, t0: 0 };
canvas.addEventListener('pointerdown', (e) => {
  if (!(playing() && touching && touchOn) || e.pointerType === 'mouse') return;
  look.id = e.pointerId; look.x = look.x0 = e.clientX; look.y = look.y0 = e.clientY; look.t0 = performance.now();
});
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerId !== look.id) return;
  hands.yaw -= (e.clientX - look.x) * 0.006;
  hands.pitch = Math.max(-1.45, Math.min(1.45, hands.pitch - (e.clientY - look.y) * 0.006));
  look.x = e.clientX; look.y = e.clientY;
});
canvas.addEventListener('pointerup', (e) => {
  if (e.pointerId !== look.id) return;
  look.id = null;
  const moved = Math.hypot(e.clientX - look.x0, e.clientY - look.y0), quick = performance.now() - look.t0 < 400;
  if (moved > 10 || !quick) return;                              // that was a look, not a tap
  const r = canvas.getBoundingClientRect();
  const nx = ((e.clientX - r.left) / r.width) * 2 - 1, ny = -((e.clientY - r.top) / r.height) * 2 + 1;
  const a = aim(nx, ny);
  hands.aim = a;
  if (!a) return;
  takeOver();
  if (a.ent) return hands.queue.push({ op: 'attack', id: a.ent.id });
  if (placeMode) {
    const item = hands.selected();
    if (!item || !PLACEABLE.has(item)) return toast(item ? `${item.replace(/_/g, ' ')} does not place` : 'nothing selected');
    if (!a.place) return toast('no room to place there');
    hands.queue.push({ op: 'place', c: a.place.c, y: a.place.y, item });
  } else hands.queue.push({ op: 'mine', c: a.c, y: a.y });
});
$('t-go').addEventListener('click', () => { touchOn = true; syncPlayUI(); });
$('t-place').addEventListener('click', () => { placeMode = !placeMode; $('t-place').classList.toggle('on', placeMode); toast(placeMode ? 'taps place the selected block' : 'taps mine'); });
$('t-eat').addEventListener('click', () => {
  const food = ['cooked_porkchop', 'apple', 'porkchop'].find((k) => replay.inv[k]);
  if (food) hands.queue.push({ op: 'eat', item: food }); else toast('no food');
});
$('t-craft').addEventListener('click', () => toggleCrafting());
$('t-view').addEventListener('click', () => { hands.third = !hands.third; });

// the phone dock: each panel is a drawer
for (const b of document.querySelectorAll('.dock button')) {
  b.addEventListener('click', () => {
    const cls = 'show-' + b.dataset.panel, on = !document.body.classList.contains(cls);
    for (const x of document.querySelectorAll('.dock button')) { document.body.classList.remove('show-' + x.dataset.panel); x.classList.remove('on'); }
    document.body.classList.toggle(cls, on); b.classList.toggle('on', on);
  });
}

// --------------------------------------------------------------- loop -------
let lastT = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - lastT) / 1000);
  lastT = now;
  const speed = +$('speed').value;
  if (!$('pause').checked) target += dt * TPS * speed;
  if (sim && party) {
    // multiplayer: one shared clock; your hands feed your member's queue,
    // Jev members wait (idle) for a batched decision while the world runs
    for (let n = 0; n < 400 && sim.tick < target; n++) {
      const need = party.tick();
      for (const m of need) if (!partyWaiting.includes(m)) { partyWaiting.push(m); m.thinking = true; m.wantsDecision = false; }
      if (partyWaiting.length && !partySince) partySince = sim.tick;
      if (human && hands.queue.length === 0 && !moveIntent() && !human.gen && !human.pending) { /* you are idle: the clock still runs */ }
      if (human && (hands.queue.length || moveIntent()) && sim.tick >= target - 0.5) break;   // your action lands on the clock
    }
    const minds = party.members.filter((m) => m.controller === 'mind');
    if (partyWaiting.length && !partyBusy && (sim.tick - partySince >= 12 || minds.every((m) => partyWaiting.includes(m)))) {
      const batch = partyWaiting; partyWaiting = []; partySince = 0;
      decideParty(batch).catch((e) => console.error(e));
    }
    const lines = sim.drain();
    if (lines.length) { allLines.push(...lines); outbox.push(...lines); }
  } else if (sim && driver && playing()) {
    // hands-on: the clock runs in real time. An action is taken only when
    // the sim has caught up with the clock, and its cost in ticks is then
    // served out in real time before the next — mining stone with a wooden
    // pick takes two seconds, as it should
    for (let n = 0; n < 400; n++) {
      if (driver.gen) {
        if (sim.tick >= target) break;
        const r = driver.step();
        if (r && r.ended) toast(`${r.ended.name.replace(/_/g, ' ')}: ${r.ended.ok ? 'done' : r.ended.why}`);
        continue;
      }
      if (sim.tick <= target) {                      // caught up with the clock, not ahead of it
        const intent = hands.queue.shift() || moveIntent();
        if (intent) {
          const r = sim.act(intent);
          if (!r.ok && intent.op !== 'move') toast(r.why);
          if (r.ok && r.ticks > 1) hands.busy = { op: intent.op, start: sim.tick - r.ticks, end: sim.tick };
          if (r.ok && intent.op === 'craft' && !$('craftpanel').hidden) renderRecipes();
          if (r.ticks) break;
          continue;
        }
      }
      if (sim.tick < target) sim.act({ op: 'wait', ticks: 1 }); else break;
    }
    const lines = sim.drain();
    if (lines.length) { allLines.push(...lines); outbox.push(...lines); }
  } else if (sim && driver) {
    let n = 0;
    const who = $('who').value;
    while (sim.tick < target && n++ < 400 && !pending) {
      if (!driver.gen && who !== 'you') {
        // a decision is due. The clock stops while it is being made: play is
        // turn-based at macro boundaries, however long the call takes.
        const s0 = sim;
        pending = decideNow().catch((e) => console.error(e)).finally(() => { if (sim === s0) pending = null; });
        break;
      }
      const r = driver.step();
      if (r && r.done) sim.act({ op: 'wait', ticks: 1 });            // "you", idle: the world keeps turning
      if (r && r.ended && driver._record) {
        journal(sim, driver._record, r.ended); remember(sim, driver._record.choice, r.ended); driver._record = null;
        if (lastLive && r.ended.interrupted) lastLive.interrupted = true;
      }
      if (driver.lastAction && driver.lastAction.op === 'wait') target = Math.max(target, sim.tick);
    }
    if (pending) target = sim.tick;
    const lines = sim.drain();
    if (lines.length) { allLines.push(...lines); outbox.push(...lines); }
  } else if (fileLines) {
    const batch = [];
    while (fileCursor < fileLines.length) {
      const L = JSON.parse(fileLines[fileCursor]);
      if (L.k > target) break;
      batch.push(fileLines[fileCursor++]);
    }
    if (batch.length) feed(batch);
    if (fileCursor < fileLines.length) {
      const nextK = JSON.parse(fileLines[fileCursor]).k;
      if (nextK - target > TPS * speed * 5) target = nextK;           // skip long quiet stretches
    }
  }
  // reveal live lines as the clock reaches their tick
  if (outbox.length) {
    let i = 0;
    while (i < outbox.length && JSON.parse(outbox[i]).k <= target + 0.001) i++;
    if (i) feed(outbox.splice(0, i));
  }
  if (replay) {
    if (playing() && locked()) hands.aim = aim();
    else if (!(playing() && touching && touchOn)) hands.aim = null;       // on touch, the last tap stays aimed
    showAim(hands.aim);
    syncPlayUI();
    for (const k of dirty) buildChunk(k);
    dirty.clear();
    syncEntities(dt);
    updateCamera();
    sky();
    hud();
    renderTeam(now);
    refreshLegal(now);
  }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// ------------------------------------------------------------- wiring ------
for (const s of SHAPES) { const o = document.createElement('option'); o.value = o.textContent = s; $('shape').appendChild(o); }
for (const k of KINDS) { const o = document.createElement('option'); o.value = o.textContent = k; $('kind').appendChild(o); }
const hp = new URLSearchParams(location.hash.slice(1));
$('shape').value = SHAPES.includes(hp.get('shape')) ? hp.get('shape') : 'penrose';
if (hp.get('seed')) $('seed').value = hp.get('seed');
$('regen').addEventListener('click', startLive);
$('shape').addEventListener('change', startLive);
$('kind').addEventListener('change', startLive);
$('size').addEventListener('change', startLive);
if (KINDS.includes(hp.get('kind'))) $('kind').value = hp.get('kind');
if (['s', 'm', 'l'].includes(hp.get('size'))) $('size').value = hp.get('size');
$('who').addEventListener('change', setAuto);
$('difficulty').addEventListener('change', startLive);
if (['jev', 'baseline', 'offline', 'random', 'you', 'coop', 'swarm'].includes(hp.get('who'))) $('who').value = hp.get('who');
if (['normal', 'hard'].includes(hp.get('difficulty'))) $('difficulty').value = hp.get('difficulty');
fetch('../api/health').then((r) => r.json()).then((h) => { keyConfigured = !!(h.key_configured ?? h.keyConfigured ?? h.configured ?? true); }).catch(() => { keyConfigured = false; });
$('speed').addEventListener('input', () => { $('speed-out').textContent = $('speed').value + '×'; });
$('download').addEventListener('click', () => {
  const lines = allLines.length ? allLines : fileLines || [];
  const head = JSON.parse(lines[0]);
  const blob = new Blob([lines.join('\n') + '\n'], { type: 'application/x-ndjson' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `craft-${head.shape}-${head.seed}-t${replay.tick}.jsonl`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
$('load').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (f) startFile(await f.text());
});
buildMacroButtons();
buildAsks();
// a pasted or edited world link loads that world
window.addEventListener('hashchange', () => {
  const q = new URLSearchParams(location.hash.slice(1));
  const want = `kind=${q.get('kind') || 'island'}&size=${q.get('size') || 's'}&shape=${q.get('shape')}&seed=${q.get('seed')}`;
  const have = `kind=${$('kind').value}&size=${$('size').value}&shape=${$('shape').value}&seed=${$('seed').value}`;
  if (want === have) return;
  if (KINDS.includes(q.get('kind'))) $('kind').value = q.get('kind');
  if (['s', 'm', 'l'].includes(q.get('size'))) $('size').value = q.get('size');
  if (SHAPES.includes(q.get('shape'))) $('shape').value = q.get('shape');
  if (q.get('seed')) $('seed').value = q.get('seed');
  if (['jev', 'baseline', 'offline', 'random', 'you', 'coop', 'swarm'].includes(q.get('who'))) $('who').value = q.get('who');
  startLive();
});
startLive();
requestAnimationFrame(frame);

// the headless harness hook (the __foam / __dungeon / __jev pattern)
window.__craft = {
  get sim() { return sim; }, get replay() { return replay; }, get driver() { return driver; }, get party() { return party; }, get focus() { return focusId; },
  hands, aim, camera, locate: (x, z) => locate(x, z),
  lines: () => allLines.slice(),
  // fast-forward with a LOCAL decider (Jev's calls are never made in a burst)
  run(ticks, who = 'baseline') {
    if (!sim) return;
    const end = sim.tick + ticks;
    while (sim.tick < end) {
      if (!driver.gen) {
        const opts = options(sim);
        if (!opts.length) { sim.act({ op: 'wait', ticks: 10 }); continue; }
        const resp = DECIDERS[who](sim, opts);
        const { pick, record } = resolve(sim, opts, resp);
        sim.note('jev', { ...record, pick: pick && pick.name });
        if (pick) driver.start(pick.name, pick.args); else sim.act({ op: 'wait', ticks: 10 });
        continue;
      }
      const r = driver.step();
      if (r && r.done) sim.act({ op: 'wait', ticks: 1 });
    }
    target = sim.tick;
  },
};
