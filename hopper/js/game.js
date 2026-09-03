// hopper — the game. You are on a slab in the void. Above you, a bucket. In
// your pocket, a few packs of masons. Deploy a pack on a plane and it grows
// a bismuth crystal from there — freezing whatever was still growing, so
// the plane you chose becomes the platform for the next growth. Climb it.
// Deploy again from higher up. Get above the bucket and drop in.
//
// The world is the bismuth engine (js/crystal.js, the same copy the
// specimens grow with); the level is js/level.js; the body is js/physics.js;
// the world on its clock, with its event log and its weather, is js/run.js.
// This file is the loop: input, pacing, the camera, the HUD, the two verbs —
// deploy and break — and the three things a run can become: a record to
// share, a replay to watch through the player's eyes, a crystal to continue.

import { GRID } from "./genome.js";
import { Renderer } from "./render.js";
import { level, bucketOf, bucketCells, inBucket, slabTop, normalizeLevel, normalizeShape, packLabel, plateLabel, origin, SLAB_Z } from "./level.js";
import { player, stepPlayer, pushOut, raycast, EYE } from "./physics.js";
import { SHAPES, SHAPE_INFO } from "./tilings.js";
import { Run, encodeRecord, decodeRecord, ghostAt, fetchRun, COLLECTION, IDLE_TICKS } from "./run.js";
import { AuthClient } from "./auth.js";

const G = GRID;
const $ = (s) => document.querySelector(s);
const fmt = (n) => n.toLocaleString("en-US");
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const bkey = (x, y, z) => x + "," + y + "," + z;   // a bucket cell: world integers, negative on a tiling
const shapeLabel = (sh) => (sh === "grid" ? "the cubic lattice" : SHAPE_INFO[sh].label);

const PACE = 60;                       // bricks per second, real time
const FAST = 6;                        // …while fast-forwarding
const LOOK = 0.0022;                   // radians per pixel of mouse
const HEARTS = 3;
const BITE_COOLDOWN = 1.4;             // seconds of grace after a worm gets you

// /l/<n> is a level on the cubic lattice; /l/<n>/<tiling> the same level on
// a prism tiling; ?w=1 turns the weather on; #r=<record> carries a run to
// watch or continue; ?run=at://… names a published one.
function levelFromURL() {
  const q = new URLSearchParams(location.search);
  const m = location.pathname.match(/^\/l\/(\d+)(?:\/([a-z]+))?/);
  const weather = q.get("w") === "1";
  if (m) return { n: normalizeLevel(m[1]), shape: normalizeShape(m[2] || q.get("t") || "grid"), weather };
  const l = q.get("l");
  if (l) return { n: normalizeLevel(l), shape: normalizeShape(q.get("t") || "grid"), weather };
  return null;
}
// Pretty permalinks need the worker; a bare static server gets the query form.
function pathFor(n, shape = "grid", weather = false) {
  const pretty = /^\/l\//.test(location.pathname) || location.pathname === "/" || location.pathname === "/index.html";
  const tail = shape === "grid" ? "" : "/" + shape;
  const w = weather ? "w=1" : "";
  if (pretty && location.protocol !== "file:") return `/l/${n}${tail}` + (w ? "?" + w : "");
  return `${location.pathname}?l=${n}` + (shape === "grid" ? "" : `&t=${shape}`) + (w ? "&" + w : "");
}
const store = {
  get(k) { try { return localStorage.getItem("hopper:" + k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem("hopper:" + k, String(v)); } catch (e) { /* private mode */ } },
  del(k) { try { localStorage.removeItem("hopper:" + k); } catch (e) { /* private mode */ } },
};
const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

class Game {
  constructor() {
    this.canvas = $("#gl");
    this.renderer = new Renderer(this.canvas);
    this.keys = new Set();
    this.touch = !!(window.matchMedia && matchMedia("(pointer: coarse)").matches);
    this.state = "intro";
    this.mode = "play";
    this.last = performance.now();
    this.hudTimer = 0;
    this.stick = null;
    this.auth = null;
    this.pds = new URLSearchParams(location.search).has("pds") || store.get("pds") === "1";
    this.bind();
    this.boot();
    requestAnimationFrame((t) => this.loop(t));
  }

  // the URL decides: a level to play, or a run to watch / continue
  async boot() {
    const q = new URLSearchParams(location.search);
    const from = levelFromURL();
    let rec = null;
    if (location.hash.startsWith("#r=")) rec = await decodeRecord(location.hash.slice(3));
    else if (q.get("run")) { this.toast("fetching the run…"); rec = await fetchRun(q.get("run")); if (!rec) this.toast("that run could not be fetched"); }
    if (rec) { this.start(rec.n, rec.shape, rec.worms, { record: rec }); }
    else if (from === null) {
      const n = normalizeLevel(store.get("reached") || 1), shape = normalizeShape(store.get("tiling") || "grid"), weather = store.get("weather") === "1";
      history.replaceState(null, "", pathFor(n, shape, weather));
      this.start(n, shape, weather);
    } else this.start(from.n, from.shape, from.weather);
    this.finishPublish();
  }

  // ----------------------------------------------------------- a level --
  // opts.record: a run loaded from the URL; opts.watch: replay it; opts.continue: play on from its crystal
  start(n, shape = "grid", weather = false, opts = {}) {
    this.n = normalizeLevel(n);
    this.shape = normalizeShape(shape);
    this.weather = !!weather;
    store.set("tiling", this.shape);
    store.set("weather", this.weather ? "1" : "0");
    this.rec = opts.record || null;
    this.mode = opts.watch ? "replay" : "play";
    this.run = opts.continue && this.rec ? Run.continueFrom(this.rec) : new Run(this.n, this.shape, this.weather);
    this.lv = this.run.lv;
    this.growth = this.run.growth;
    this.renderer.setGrowth(this.growth);
    this.renderer.sync(true);
    this.renderer.cool = 1.6;
    this.renderer.setProps(null);
    this.renderer.beacons = null;
    this.renderer.worms = null;
    this.renderer.ghosts = null;
    this.bucket = null;
    this.bucketSet = null;
    const top = slabTop(this.lv), o = origin(this.lv);
    this.spawn = [o[0] + 0.5, o[1] + 0.5, top + 1];
    // you wake on the slab looking straight up into the void
    this.p = player(this.spawn[0], this.spawn[1], this.spawn[2], 0.8, 1.2);
    this.renderer.fp = { eye: [this.p.x, this.p.y, this.p.z + EYE], yaw: this.p.yaw, pitch: this.p.pitch, fov: 1.25 };
    this.pocket = this.lv.packs.map((pack) => ({ pack, used: false }));
    this.sel = 0;
    this.debt = 0;
    this.fast = false;
    this.hearts = HEARTS;
    this.grace = 0;
    this.stats = { t: 0, deploys: 0, breaks: 0, falls: 0, bites: 0 };
    this.sampleTimer = 0;
    this.won = false;
    this.state = "intro";
    this.surveyNote = "";
    // replay state
    this.rt = 0;
    this.cursor = { i: 0 };
    this.follow = true;
    this.ghost = null;
    this.replayDone = false;
    // the world at a point: the substrate's own point location (a cell of the
    // lattice, or the tile under the point on a tiling), plus the bucket
    const sub = this.growth.sub;
    this.crystalAt = (x, y, z) => { const q = sub.siteAtWorld(x, y, z); return q >= 0 && sub.occ[q] === 1; };
    this.solidAt = (x, y, z) => this.crystalAt(x, y, z) || (this.bucketSet !== null && this.bucketSet.has(bkey(Math.floor(x), Math.floor(y), Math.floor(z))));
    pushOut(this.p, this.crystalAt);                 // a continued crystal may stand where the slab's spawn is
    document.title = `hopper · level ${this.n}` + (this.lv.prism ? ` · ${this.shape}` : "") + (this.weather ? " · worms" : "");
    $("#lvl").textContent = `level ${this.n}` + (this.lv.prism ? ` · ${SHAPE_INFO[this.shape].label}` : "") + (this.weather ? " · worms" : "");
    this.survey();
    this.buildTilings();
    this.buildPocket();
    this.renderHUD();
    $("#replay").hidden = this.mode !== "replay";
    this.overlay(this.rec && !opts.watch && !opts.continue ? "record" : "intro");
    if (opts.continue) this.toast(`continuing a crystal of ${fmt(this.growth.bricks.length)} bricks — your pocket is full again`);
  }

  go(n, shape = this.shape, push = true, weather = this.weather) {
    n = normalizeLevel(n);
    shape = normalizeShape(shape);
    if (push) history.pushState(null, "", pathFor(n, shape, weather));
    else if (location.hash) history.replaceState(null, "", pathFor(n, shape, weather));
    this.start(n, shape, weather);
  }

  // The survey: the engine stacks this level's packs to the end, off the
  // main thread, and the bucket lands at a fraction of that height.
  survey() {
    const n = this.n, shape = this.shape;
    if (this.worker) { this.worker.terminate(); this.worker = null; }
    const apply = (reach) => { if (this.n === n && this.shape === shape) this.setBucket(reach); };
    const inline = async () => { const { survey } = await import("./level.js"); apply(survey(this.lv).reach); };
    try {
      const w = this.worker = new Worker("/js/oracle.js", { type: "module" });
      w.onmessage = (e) => {
        const d = e.data;
        if (!d || d.n !== n || d.shape !== shape) return;
        if (d.done) { apply(d.reach); w.terminate(); if (this.worker === w) this.worker = null; }
        else this.surveyNote = `surveying the void… ${d.progress} / ${d.of}`;
      };
      w.onerror = () => { w.terminate(); if (this.worker === w) this.worker = null; inline(); };
      w.postMessage({ n, shape });
      this.surveyNote = "surveying the void…";
    } catch (e) { inline(); }
  }

  setBucket(reach) {
    const b = this.bucket = bucketOf(this.lv, reach);
    const cells = bucketCells(b);
    this.bucketSet = new Set(cells.map((c) => bkey(c[0], c[1], c[2])));
    this.renderer.setProps(cells, [0.96, 0.66, 0.24]);
    // a beam up out of the bucket, so it reads from the slab
    const beam = [];
    for (let k = 0; k < 40; k++) beam.push([b.x + 0.5, b.y + 0.5, b.z + 4.4 + k * 1.1, Math.max(0.12, 1 - k / 40)]);
    // and a halo on the rim, so the bucket itself glows from far off
    for (const [dx, dy] of [[-2, -2], [2, -2], [-2, 2], [2, 2], [0, -2], [0, 2], [-2, 0], [2, 0]]) beam.push([b.x + dx + 0.5, b.y + dy + 0.5, b.z + 4.2, 0.9]);
    this.renderer.beacons = beam;
    this.surveyNote = "";
    this.renderHUD();
  }

  // a best time (and its run) is per level, substrate and weather
  bestKey() { return "best:" + this.n + (this.shape === "grid" ? "" : ":" + this.shape) + (this.weather ? ":w" : ""); }

  // ---------------------------------------------------------- the verbs --
  target() { return this.state === "play" || this.state === "won" ? raycast(this.p, this.solidAt) : null; }
  isBucket(t) { return t && this.bucketSet !== null && this.bucketSet.has(bkey(Math.floor(t.x), Math.floor(t.y), Math.floor(t.z))); }
  // the highest brick in a site's column: a lattice column, or a tile's stack
  columnTop(s) {
    const sub = this.growth.sub, d = sub.describe(s);
    return sub.kind === "prism" ? sub.top[d.tile] : sub.ext[4][d.x * G + d.y];
  }

  deploy() {
    if (this.state !== "play" || this.mode !== "play") return;
    const slot = this.pocket[this.sel];
    if (!slot) return;
    if (slot.used) { this.toast("that pack is spent — pick another"); return; }
    const t = this.target();
    if (t && this.isBucket(t)) { this.toast("not on the bucket — the bucket is the goal"); return; }
    const sub = this.growth.sub;
    // the column under the crosshair, or under the feet
    const s = t ? sub.siteAtWorld(t.x, t.y, t.z) : sub.siteAtWorld(this.p.x, this.p.y, this.p.z - 0.03);
    if (s < 0) { this.toast("nothing to build on there"); return; }
    const top = this.columnTop(s);
    if (top < 0) { this.toast("nothing to build on there"); return; }
    const d = sub.describe(s);
    const site = sub.siteAt(sub.kind === "prism" ? { tile: d.tile, z: top + 1 } : { x: d.x, y: d.y, z: top + 1 });
    if (site < 0) { this.toast("nothing to build on there"); return; }
    const wasGrowing = this.growth.colonies.some((c) => !c.done);
    const idx = this.run.deploy(this.sel, site);
    if (idx < 0) { this.toast("the pack found nowhere to land"); return; }
    slot.used = true;
    this.stats.deploys++;
    this.renderer.sync(false);
    pushOut(this.p, this.crystalAt);
    const next = this.pocket.findIndex((x) => !x.used);
    if (next >= 0) this.sel = next;
    this.toast(`${slot.pack.habit} pack on the plane at z ${top + 1}` + (wasGrowing ? " — the old growth froze" : "") + (this.weather ? " · a wave of worms rides in" : ""));
    this.buildPocket();
    this.renderHUD();
  }

  demolish() {
    if (this.state !== "play" || this.mode !== "play") return;
    const t = this.target();
    if (!t) return;
    if (this.isBucket(t)) { this.toast("the bucket is not yours to break"); return; }
    const s = this.growth.sub.siteAtWorld(t.x, t.y, t.z);
    if (s >= 0 && this.run.remove(s)) {
      this.stats.breaks++;
      this.renderer.sync(false);
    }
  }

  select(i) { if (i >= 0 && i < this.pocket.length) { this.sel = i; this.buildPocket(); } }
  cycle(d) {
    const n = this.pocket.length;
    if (!n) return;
    let i = this.sel;
    for (let k = 0; k < n; k++) { i = (i + d + n) % n; if (!this.pocket[i].used) break; }
    this.select(i);
  }

  respawn(why) {
    const p = this.p;
    p.x = this.spawn[0]; p.y = this.spawn[1]; p.z = this.spawn[2];
    p.vx = p.vy = p.vz = 0;
    pushOut(this.p, this.crystalAt);
    this.hearts = HEARTS;
    this.grace = BITE_COOLDOWN;
    if (why === "bite") this.toast("the worms had you. back on the slab.");
    else { this.stats.falls++; this.toast("the void. back on the slab."); }
  }

  // a worm's head inside the body: a heart, a shove, and a moment's grace
  bites(dt) {
    const W = this.run.W;
    if (!W || !W.worms.length) return;
    if (this.grace > 0) { this.grace -= dt; return; }
    const p = this.p, sub = this.growth.sub, mo = sub.moteOffset;
    for (const w of W.worms) {
      const d = sub.describe(w.site);
      const wx = d.x + mo[0], wy = d.y + mo[1], wz = d.z + mo[2];
      const dx = p.x - wx, dy = p.y - wy, dz = (p.z + 0.9) - wz;
      if (dx * dx + dy * dy < 0.8 && Math.abs(dz) < 1.4) {
        this.stats.bites++;
        this.hearts--;
        this.grace = BITE_COOLDOWN;
        const len = Math.hypot(dx, dy) || 1;
        p.vx += (dx / len) * 5; p.vy += (dy / len) * 5; p.vz = Math.max(p.vz, 5);
        p.ground = false;
        if (this.hearts <= 0) this.respawn("bite");
        else this.toast(this.hearts === 1 ? "bitten — one heart left" : "bitten");
        this.renderHUD();
        return;
      }
    }
  }

  async win() {
    this.won = true;
    this.state = "won";
    this.growth.freeze();
    this.renderer.sync(false);
    if (document.pointerLockElement === this.canvas && document.exitPointerLock) document.exitPointerLock();
    const t = this.stats.t;
    this.run.t = t;
    const result = { won: true, t: +t.toFixed(2), deploys: this.stats.deploys, breaks: this.stats.breaks, falls: this.stats.falls, bites: this.stats.bites };
    this.record = this.run.record(result);
    this.encoded = await encodeRecord(this.record);
    const best = store.get(this.bestKey());
    if (best === null || t < +best) { store.set(this.bestKey(), t.toFixed(2)); store.set("run:" + this.bestKey(), this.encoded); }
    const reached = +(store.get("reached") || 1);
    if (this.n + 1 > reached) store.set("reached", this.n + 1);
    this.overlay("won");
  }

  // ---------------------------------------------------------- the loop --
  loop(t) {
    const dt = Math.min(0.05, (t - this.last) / 1000);
    this.last = t;
    const g = this.growth, p = this.p, run = this.run;
    if (!run) { requestAnimationFrame((tt) => this.loop(tt)); return; }   // the URL is still being read
    if (this.state === "play") {
      if (this.mode === "play") {
        this.stats.t += dt;
        run.t = this.stats.t;
        this.move(dt);
        if (run.live) {
          this.debt += PACE * (this.fast ? FAST : 1) * dt;
          // run the engine until this frame's bricks are laid or ~7 ms are spent
          const deadline = performance.now() + 7;
          const before = g.bricks.length;
          let steps = 0;
          while (run.live && g.bricks.length - before < this.debt) {
            run.tick(1);
            if ((++steps & 63) === 0 && performance.now() > deadline) break;
          }
          this.debt -= g.bricks.length - before;
          if (this.debt > 40) this.debt = 40;
        } else if (run.busy) {
          // nothing grows; the worms keep the clock
          run.tick(Math.min(600, Math.round(dt * IDLE_TICKS * (this.fast ? FAST : 1))));
        }
        if (run.busy || g.removed.length > this.renderer.syncedRemoved) { this.renderer.sync(false); pushOut(p, this.crystalAt); }
        this.bites(dt);
        if ((this.sampleTimer += dt) >= 0.2) { this.sampleTimer = 0; run.sample(this.stats.t, p); }
        if (p.z < SLAB_Z - 16) this.respawn("fall");
        if (!this.won && p.ground && inBucket(this.bucket, p.x, p.y, p.z)) this.win();
      } else this.replay(dt);
    }
    const fp = this.renderer.fp;
    if (this.mode === "replay" && this.follow && this.ghost) {
      fp.eye[0] = this.ghost.x; fp.eye[1] = this.ghost.y; fp.eye[2] = this.ghost.z + EYE;
      fp.yaw = this.ghost.yaw; fp.pitch = this.ghost.pitch;
    } else {
      fp.eye[0] = p.x; fp.eye[1] = p.y; fp.eye[2] = p.z + EYE;
      fp.yaw = p.yaw; fp.pitch = p.pitch;
    }
    this.renderer.worms = run.W && run.W.worms.length ? run.W.positions() : null;
    this.renderer.ghosts = this.mode === "replay" && this.ghost && !this.follow ? [[this.ghost.x, this.ghost.y, this.ghost.z + 0.4, 0.7], [this.ghost.x, this.ghost.y, this.ghost.z + 1.0, 1], [this.ghost.x, this.ghost.y, this.ghost.z + 1.6, 0.8]] : null;
    this.renderer.frame(dt, g.done ? null : g.masons);
    this.hudTimer += dt;
    if (this.hudTimer > 0.1) { this.hudTimer = 0; this.renderHUD(); }
    requestAnimationFrame((tt) => this.loop(tt));
  }

  move(dt) {
    const k = this.keys;
    let mx = 0, my = 0;
    if (k.has("KeyW") || k.has("ArrowUp")) mx += 1;
    if (k.has("KeyS") || k.has("ArrowDown")) mx -= 1;
    if (k.has("KeyD") || k.has("ArrowRight")) my += 1;
    if (k.has("KeyA") || k.has("ArrowLeft")) my -= 1;
    if (this.stick) { mx += this.stick.f; my += this.stick.r; }
    stepPlayer(this.p, this.solidAt, { mx, my, jump: this.jumpQueued || k.has("Space") }, dt);
    this.jumpQueued = false;
  }

  // Watching a run: real time drives the recorded clock, so the crystal
  // grows at the pace it grew and the ghost walks at the pace it walked.
  replay(dt) {
    const rec = this.rec, run = this.run;
    if (!rec) return;
    this.rt = Math.min(rec.t, this.rt + dt * (this.fast ? FAST : 1));
    this.stats.t = this.rt;
    const gh = ghostAt(rec.path, this.rt) || { clock: run.clock, x: this.spawn[0], y: this.spawn[1], z: this.spawn[2], yaw: 0.8, pitch: 1.2 };
    this.ghost = gh;
    const target = this.rt >= rec.t ? rec.clock : Math.min(rec.clock, gh.clock);
    if (run.clock < target) {
      const deadline = performance.now() + 8;
      const stop = Math.min(target, run.clock + 3000);
      while (run.clock < stop) { run.advanceTo(Math.min(stop, run.clock + 64), rec.events, this.cursor); if (performance.now() > deadline) break; }
      this.renderer.sync(false);
    }
    if (!this.follow) {
      this.move(dt);
      pushOut(this.p, this.crystalAt);
      if (this.p.z < SLAB_Z - 16) { this.p.x = gh.x; this.p.y = gh.y; this.p.z = gh.z + 0.5; this.p.vz = 0; }
    }
    if (this.rt >= rec.t && run.clock >= rec.clock && !this.replayDone) { this.replayDone = true; this.state = "won"; this.overlay("replayed"); }
  }

  // ------------------------------------------------------------- the HUD --
  buildPocket() {
    const el = $("#pocket");
    el.innerHTML = "";
    this.pocket.forEach((slot, i) => {
      const d = document.createElement("button");
      d.className = "pack" + (slot.used ? " used" : "") + (i === this.sel ? " sel" : "");
      d.innerHTML = `<span class="k">${i + 1}</span><span class="h">${slot.pack.habit}</span><span class="d">${slot.pack.masons} masons · ${fmt(slot.pack.budget)} bricks · ${plateLabel(this.lv, slot.pack)}</span>`;
      d.title = packLabel(this.lv, slot.pack) + " — " + slot.pack.habitDesc;
      d.addEventListener("click", (e) => { e.preventDefault(); this.select(i); });
      el.appendChild(d);
    });
    $("#pocket").hidden = this.mode === "replay";
  }

  // the substrate chips and the weather chip: the same level on any tiling, calm or with worms
  buildTilings() {
    const el = $("#tilings");
    el.innerHTML = "";
    for (const sh of SHAPES) {
      const b = document.createElement("button");
      b.className = "chip" + (sh === this.shape ? " sel" : "");
      b.textContent = sh === "grid" ? "cubic" : SHAPE_INFO[sh].label;
      b.title = sh === "grid" ? "the square grid stacked into cubes" : SHAPE_INFO[sh].note;
      b.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); if (sh !== this.shape) this.go(this.n, sh); });
      el.appendChild(b);
    }
    const w = $("#weather");
    w.innerHTML = "";
    for (const [on, label, title] of [[false, "calm", "no worms: the terrain you build stays as you built it"], [true, "worms", "weather: a wave of grazers rides in with every pack. They eat exposed bricks, feed the live growth with what they eat, and bite. The terrain behind you loses its edges."]]) {
      const b = document.createElement("button");
      b.className = "chip" + (on === this.weather ? " sel" : "");
      b.textContent = label;
      b.title = title;
      b.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); if (on !== this.weather) this.go(this.n, this.shape, true, on); });
      w.appendChild(b);
    }
  }

  renderHUD() {
    const p = this.p, b = this.bucket, g = this.growth, run = this.run;
    if (!run) return;
    const top = slabTop(this.lv);
    const eye = this.mode === "replay" && this.follow && this.ghost ? this.ghost : p;
    $("#alt").textContent = `z ${Math.floor(eye.z)}` + (b ? ` · the bucket's floor z ${b.z + 1} · rim z ${b.rim}` : "");
    const hi = b ? b.rim + 8 : 64;
    const pct = (z) => clamp((z - top) / (hi - top), 0, 1) * 100;
    $("#m-you").style.bottom = pct(eye.z) + "%";
    $("#m-bucket").style.bottom = pct(b ? b.z + 1 : hi) + "%";
    $("#m-bucket").hidden = !b;
    $("#hearts").textContent = this.weather && this.mode === "play" ? "♥".repeat(this.hearts) + "♡".repeat(HEARTS - this.hearts) : "";
    const cur = g.colonies.length > 1 ? g.colonies[g.colonies.length - 1] : null;
    const frozen = g.colonies.filter((c) => c.frozen && c.idx > 0).length;
    const worms = run.W ? run.W.worms.length : 0;
    const wormNote = run.W && run.W.released ? ` · ${worms} worm${worms === 1 ? "" : "s"}, ${fmt(run.W.eaten)} eaten` : "";
    if (cur && !cur.done) {
      $("#growth").textContent = `${cur.genome.habit} pack growing · ${fmt(cur.laid)} / ${fmt(cur.genome.budget)} bricks · ${cur.masons.filter((m) => m.state === "surface").length} masons on the surface${wormNote}` + (this.fast ? " · fast" : "");
      $("#gbar").style.transform = `scaleX(${clamp(cur.laid / cur.genome.budget, 0, 1)})`;
    } else {
      $("#growth").textContent = (this.surveyNote || (cur ? `still · ${fmt(g.bricks.length)} bricks · ${frozen} growth${frozen === 1 ? "" : "s"} frozen${wormNote}` : `${fmt(g.bricks.length)} bricks of slab · nothing grows until you deploy`));
      $("#gbar").style.transform = "scaleX(0)";
    }
    const left = this.pocket.filter((s) => !s.used).length;
    let tx = "";
    if (this.state === "play" && this.mode === "play") {
      const t = this.target();
      if (t && this.isBucket(t)) tx = "the bucket — get above it and drop in";
      else if (t) tx = `brick · z ${Math.floor(t.z)} · ${this.touch ? "deploy" : "E"} lands the pack on this column's top plane · ${this.touch ? "break" : "click"} takes it away`;
      else tx = `the void · ${this.touch ? "deploy" : "E"} lands the pack underfoot`;
      if (!left) tx = run.busy ? "no packs left — this is the last growth" : "no packs left — R starts the level over";
    } else if (this.state === "play" && this.mode === "replay") {
      tx = this.follow ? "through their eyes · V for your own" : "free camera · V to follow them";
    }
    $("#target").textContent = tx;
    $("#clock").textContent = mmss(this.stats.t);
    if (this.mode === "replay" && this.rec) $("#replay-note").textContent = `watching a run · ${mmss(this.rt)} / ${mmss(this.rec.t)}` + (this.rec.by ? ` · by ${this.rec.by.slice(0, 24)}` : "") + (this.fast ? " · fast" : "");
  }

  overlay(kind) {
    const ov = $("#overlay");
    ov.className = "show " + kind;
    const rec = this.rec;
    for (const id of ["ov-body", "ov-won", "ov-record", "ov-replayed"]) $("#" + id).hidden = true;
    const bestRun = store.get("run:" + this.bestKey());
    $("#watch-best").hidden = !bestRun;
    if (kind === "intro") {
      $("#ov-title").textContent = `level ${this.n}`;
      const best = store.get(this.bestKey());
      $("#ov-sub").textContent = `${this.lv.packs.length} packs in your pocket · on ${shapeLabel(this.shape)}` + (this.weather ? " · worms" : "") + (best ? ` · best ${mmss(+best)}` : "") + (this.run.parentEvents ? ` · continuing a crystal of ${fmt(this.growth.bricks.length)} bricks` : "");
      $("#ov-body").hidden = false;
      $("#play").textContent = this.touch ? "tap to play" : "click to play";
    } else if (kind === "paused") {
      $("#ov-title").textContent = "paused";
      $("#ov-sub").textContent = `level ${this.n} · ${mmss(this.stats.t)}`;
      $("#ov-body").hidden = false;
      $("#play").textContent = this.touch ? "tap to resume" : "click to resume";
    } else if (kind === "won") {
      const s = this.stats;
      $("#ov-title").textContent = "delivered.";
      $("#ov-sub").textContent = `level ${this.n} · ${mmss(s.t)} · ${s.deploys} pack${s.deploys === 1 ? "" : "s"} deployed · ${s.breaks} brick${s.breaks === 1 ? "" : "s"} broken · ${s.falls} fall${s.falls === 1 ? "" : "s"} into the void` + (this.weather ? ` · bitten ${s.bites} time${s.bites === 1 ? "" : "s"}` : "");
      $("#ov-won").hidden = false;
      $("#next").href = pathFor(this.n + 1, this.shape, this.weather);
      $("#publish-row").hidden = !this.pds;
    } else if (kind === "record") {
      $("#ov-title").textContent = "a recorded run";
      const r = rec.result;
      $("#ov-sub").textContent = `level ${rec.n} · on ${shapeLabel(rec.shape)}` + (rec.worms ? " · worms" : "") + (r && r.won ? ` · delivered in ${mmss(r.t)} · ${r.deploys} pack${r.deploys === 1 ? "" : "s"}, ${r.breaks} broken, ${r.falls} fall${r.falls === 1 ? "" : "s"}` : "") + (rec.by ? ` · by ${rec.by.slice(0, 32)}` : "") + (rec.parent ? ` · itself a continuation` : "");
      $("#ov-record").hidden = false;
    } else if (kind === "replayed") {
      const r = rec && rec.result;
      $("#ov-title").textContent = r && r.won ? "delivered." : "the run ends.";
      $("#ov-sub").textContent = `that was level ${rec.n} in ${mmss(rec.t)} · the crystal stays as they left it`;
      $("#ov-replayed").hidden = false;
    }
  }
  hideOverlay() { $("#overlay").className = ""; }

  play() {
    if (this.state === "won") return;
    this.state = "play";
    this.hideOverlay();
    this.keys.clear();
    if (!this.touch && this.canvas.requestPointerLock) {
      try { const r = this.canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* no lock: mouse still steers by drag */ }
    }
  }
  pause() {
    if (this.state !== "play") return;
    this.state = "paused";
    this.fast = false;
    $("#t-fast").classList.remove("on");
    this.stick = null;
    this.overlay("paused");
  }
  look(dx, dy) {
    const p = this.p;
    p.yaw -= dx * LOOK;
    p.pitch = clamp(p.pitch - dy * LOOK, -1.5, 1.5);
  }

  // ------------------------------------------------- records and sharing --
  async shareRun() {
    if (!this.encoded) return;
    const url = location.origin + pathFor(this.n, this.shape, this.weather) + "#r=" + this.encoded;
    try { await navigator.clipboard.writeText(url); this.toast(`run copied — ${fmt(url.length)} characters that replay it anywhere`); } catch (e) { this.toast(url.slice(0, 120) + "…"); }
  }
  watch(rec) {
    if (!rec) return;
    this.rec = rec;
    this.start(rec.n, rec.shape, rec.worms, { record: rec, watch: true });
    this.play();
  }
  async watchBest() {
    const enc = store.get("run:" + this.bestKey());
    if (!enc) return;
    const rec = await decodeRecord(enc);
    if (!rec) { this.toast("the stored run did not decode"); return; }
    history.replaceState(null, "", pathFor(rec.n, rec.shape, rec.worms) + "#r=" + enc);
    this.watch(rec);
  }
  continueRun(rec) {
    if (!rec) return;
    this.toast("replaying their crystal…");
    setTimeout(() => this.start(rec.n, rec.shape, rec.worms, { record: rec, continue: true }), 30);
  }

  // Publishing: the run becomes a record in the player's own repo, through
  // the shared OAuth worker. Gated until the worker's write ceiling carries
  // the collection (?pds=1 or localStorage hopper:pds to try it).
  async publish() {
    if (!this.encoded || !this.record) return;
    const handle = ($("#handle").value || "").trim();
    if (!handle) { this.toast("your Bluesky handle first"); return; }
    try {
      this.auth = this.auth || new AuthClient();
      await this.auth.init();
      const user = this.auth.getUser();
      const scope = "atproto repo:" + COLLECTION;
      if (!user || !this.auth.hasScope(COLLECTION)) {
        store.set("pending", this.encoded);
        store.set("pending-url", pathFor(this.n, this.shape, this.weather));
        await this.auth.login(handle, { scope });
        return;
      }
      await this.putRun(this.record);
    } catch (e) { this.toast("publishing failed: " + (e && e.message ? e.message : e)); }
  }
  async finishPublish() {
    const enc = store.get("pending");
    if (!enc) return;
    try {
      this.auth = this.auth || new AuthClient();
      await this.auth.init();
      const user = this.auth.getUser();
      if (!user) return;
      const rec = await decodeRecord(enc);
      store.del("pending");
      if (rec) await this.putRun(rec);
    } catch (e) { this.toast("publishing failed: " + (e && e.message ? e.message : e)); }
  }
  async putRun(rec) {
    const user = this.auth.getUser();
    const out = await this.auth.pds.createRecord(COLLECTION, Object.assign({ $type: COLLECTION, createdAt: new Date().toISOString() }, rec));
    const uri = out && out.uri;
    if (!uri) throw new Error("no uri came back");
    const url = location.origin + pathFor(rec.n, rec.shape, rec.worms) + "?run=" + encodeURIComponent(uri);
    try { await navigator.clipboard.writeText(url); } catch (e) { /* no clipboard */ }
    this.toast(`published to ${user.handle} — link copied`);
    store.del("pending-url");
  }

  // ------------------------------------------------------------- input --
  bind() {
    const cv = this.canvas;
    document.addEventListener("keydown", (e) => {
      if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
      if (e.repeat) { if (e.code === "Space") e.preventDefault(); return; }
      this.keys.add(e.code);
      if (e.code === "Space") { e.preventDefault(); this.jumpQueued = true; if (this.state === "intro" || this.state === "paused") this.play(); }
      else if (e.code === "KeyE" || e.code === "Enter") this.deploy();
      else if (e.code === "KeyF") this.fast = true;
      else if (e.code === "KeyQ") this.cycle(1);
      else if (e.code === "KeyR") this.go(this.n, this.shape, false);
      else if (e.code === "KeyN") { if (this.state === "won") this.go(this.n + 1); }
      else if (e.code === "KeyV") { if (this.mode === "replay") { this.follow = !this.follow; if (!this.follow && this.ghost) { this.p.x = this.ghost.x; this.p.y = this.ghost.y; this.p.z = this.ghost.z; this.p.yaw = this.ghost.yaw; this.p.pitch = this.ghost.pitch; this.p.vx = this.p.vy = this.p.vz = 0; } } }
      else if (/^Digit[1-9]$/.test(e.code)) this.select(+e.code[5] - 1);
      else if (e.code === "Escape") this.pause();
      else if (e.code === "KeyH") $("#help").classList.toggle("open");
    });
    document.addEventListener("keyup", (e) => { this.keys.delete(e.code); if (e.code === "KeyF") this.fast = false; });
    window.addEventListener("blur", () => { this.keys.clear(); this.fast = false; });
    cv.addEventListener("mousedown", (e) => {
      if (this.state === "intro" || this.state === "paused") { this.play(); return; }
      if (this.state !== "play" || this.touch) return;
      if (e.button === 0) this.demolish();
      else if (e.button === 2) this.deploy();
    });
    cv.addEventListener("contextmenu", (e) => e.preventDefault());
    let drag = null;
    document.addEventListener("mousemove", (e) => {
      if (this.state !== "play" || this.touch) return;
      if (this.mode === "replay" && this.follow) return;
      if (document.pointerLockElement === cv) this.look(e.movementX, e.movementY);
      else if (drag) { this.look((e.clientX - drag[0]) * 1.6, (e.clientY - drag[1]) * 1.6); drag = [e.clientX, e.clientY]; }
    });
    cv.addEventListener("mousedown", (e) => { if (document.pointerLockElement !== cv && e.button === 1) { e.preventDefault(); drag = [e.clientX, e.clientY]; } });
    document.addEventListener("mouseup", () => { drag = null; });
    document.addEventListener("pointerlockchange", () => {
      if (document.pointerLockElement !== cv && this.state === "play" && !this.touch) this.pause();
    });
    cv.addEventListener("wheel", (e) => { e.preventDefault(); if (this.state === "play") this.cycle(e.deltaY > 0 ? 1 : -1); }, { passive: false });
    $("#play").addEventListener("click", () => this.play());
    $("#play").addEventListener("touchstart", (e) => { e.preventDefault(); this.enableTouch(); this.play(); }, { passive: false });
    $("#overlay").addEventListener("click", (e) => { if (e.target === e.currentTarget && this.state !== "won") this.play(); });
    $("#again").addEventListener("click", () => this.go(this.n, this.shape, false));
    $("#next").addEventListener("click", (e) => { e.preventDefault(); this.go(this.n + 1); });
    $("#share").addEventListener("click", async () => {
      const url = location.origin + pathFor(this.n, this.shape, this.weather);
      try { await navigator.clipboard.writeText(url); this.toast("link copied — this level, forever"); } catch (e) { this.toast(url); }
    });
    $("#share-run").addEventListener("click", () => this.shareRun());
    $("#watch-run").addEventListener("click", () => { if (this.record && this.encoded) { history.replaceState(null, "", pathFor(this.n, this.shape, this.weather) + "#r=" + this.encoded); this.watch(this.record); } });
    $("#watch-best").addEventListener("click", (e) => { e.stopPropagation(); this.watchBest(); });
    $("#watch").addEventListener("click", () => this.watch(this.rec));
    $("#continue").addEventListener("click", () => this.continueRun(this.rec));
    $("#continue-2").addEventListener("click", () => this.continueRun(this.rec));
    $("#fresh").addEventListener("click", () => { const r = this.rec; this.rec = null; this.go(r ? r.n : this.n, r ? r.shape : this.shape, true, r ? r.worms : this.weather); });
    $("#fresh-2").addEventListener("click", () => { const r = this.rec; this.rec = null; this.go(r ? r.n : this.n, r ? r.shape : this.shape, true, r ? r.worms : this.weather); });
    $("#watch-again").addEventListener("click", () => this.watch(this.rec));
    $("#publish").addEventListener("click", () => this.publish());
    $("#handle").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); this.publish(); } });
    $("#help-btn").addEventListener("click", () => $("#help").classList.toggle("open"));
    $("#help-close").addEventListener("click", () => $("#help").classList.remove("open"));
    $("#lvlform").addEventListener("submit", (e) => {
      e.preventDefault();
      const v = parseInt($("#lvlinput").value, 10);
      if (v > 0) this.go(v);
      $("#lvlinput").value = "";
      $("#lvlinput").blur();
    });
    window.addEventListener("popstate", () => { const from = levelFromURL(); if (from !== null && !location.hash.startsWith("#r=")) this.start(from.n, from.shape, from.weather); });
    // a record pasted into the address bar while the page is open
    window.addEventListener("hashchange", async () => { if (location.hash.startsWith("#r=")) { const rec = await decodeRecord(location.hash.slice(3)); if (rec && rec !== this.rec) this.start(rec.n, rec.shape, rec.worms, { record: rec }); } });
    this.bindTouch();
  }

  enableTouch() {
    if (this.touch && document.body.classList.contains("touch")) return;
    this.touch = true;
    document.body.classList.add("touch");
    if (document.pointerLockElement === this.canvas && document.exitPointerLock) document.exitPointerLock();
    if (this.lv && (this.state === "intro" || this.state === "paused")) this.overlay(this.state);
    if (this.lv) this.renderHUD();
  }

  // The on-screen controller. The left 45% of the screen is the stick: it
  // appears where the finger lands and the thumb follows it, so walking
  // never needs a look at the corner. The rest of the screen looks. The
  // buttons on the right are the verbs. The stick and buttons are DOM over
  // the canvas; the stick is pointer-events: none so the canvas gets the
  // touches, and the buttons take their own.
  bindTouch() {
    const cv = this.canvas;
    if (this.touch) this.enableTouch();
    const stickEl = $("#stick"), thumb = $("#thumb");
    const R = 40;                                   // thumb travel in px; full deflection at the ring's edge
    let moveT = null, lookT = null;
    const thumbTo = (dx, dy) => { thumb.style.transform = `translate(${dx}px, ${dy}px)`; };
    const settle = () => { moveT = null; this.stick = null; stickEl.classList.remove("live"); stickEl.style.left = ""; stickEl.style.top = ""; thumbTo(0, 0); };
    cv.addEventListener("touchstart", (e) => {
      e.preventDefault();
      this.enableTouch();
      if (this.state === "intro" || this.state === "paused") { this.play(); return; }
      for (const t of e.changedTouches) {
        if (t.clientX < innerWidth * 0.45 && !moveT) {
          moveT = { id: t.identifier, x: t.clientX, y: t.clientY };
          stickEl.style.left = (t.clientX - 62) + "px";
          stickEl.style.top = (t.clientY - 62) + "px";
          stickEl.classList.add("live");
          thumbTo(0, 0);
        } else if (!lookT) lookT = { id: t.identifier, x: t.clientX, y: t.clientY };
      }
    }, { passive: false });
    cv.addEventListener("touchmove", (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (moveT && t.identifier === moveT.id) {
          let dx = t.clientX - moveT.x, dy = t.clientY - moveT.y;
          const len = Math.hypot(dx, dy);
          if (len > R) { dx *= R / len; dy *= R / len; }
          thumbTo(dx, dy);
          const m = Math.min(1, Math.max(0, (Math.hypot(dx, dy) / R - 0.12) / 0.88));
          const ang = Math.atan2(-dy, dx);
          this.stick = { f: Math.sin(ang) * m, r: Math.cos(ang) * m };
        }
        if (lookT && t.identifier === lookT.id) {
          if (!(this.mode === "replay" && this.follow)) this.look((t.clientX - lookT.x) * 2.4, (t.clientY - lookT.y) * 2.4);
          lookT.x = t.clientX; lookT.y = t.clientY;
        }
      }
    }, { passive: false });
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (moveT && t.identifier === moveT.id) settle();
        if (lookT && t.identifier === lookT.id) lookT = null;
      }
    };
    cv.addEventListener("touchend", end);
    cv.addEventListener("touchcancel", end);
    const tb = (id, fn) => $(id).addEventListener("touchstart", (e) => { e.preventDefault(); this.enableTouch(); if (this.state === "play") fn(); }, { passive: false });
    tb("#t-jump", () => { this.jumpQueued = true; });
    tb("#t-deploy", () => this.deploy());
    tb("#t-break", () => this.demolish());
    tb("#t-pack", () => this.cycle(1));
    tb("#t-fast", () => { this.fast = !this.fast; $("#t-fast").classList.toggle("on", this.fast); });
    tb("#t-pause", () => this.pause());
    $("#overlay").addEventListener("touchstart", (e) => { if (e.target === e.currentTarget) { e.preventDefault(); this.enableTouch(); if (this.state !== "won") this.play(); } }, { passive: false });
  }

  toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(this._toast);
    this._toast = setTimeout(() => el.classList.remove("show"), 2600);
  }
}

try {
  window.__hopper = new Game();
} catch (err) {
  const el = $("#err");
  el.hidden = false;
  el.textContent = "hopper needs WebGL — " + (err && err.message ? err.message : err);
  console.error(err);
}
