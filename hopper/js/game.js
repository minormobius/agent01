// hopper — the game. You are on a slab in the void. Above you, a bucket. In
// your pocket, a few packs of masons. Deploy a pack on a plane and it grows
// a bismuth crystal from there — freezing whatever was still growing, so
// the plane you chose becomes the platform for the next growth. Climb it.
// Deploy again from higher up. Get above the bucket and drop in.
//
// The world is the bismuth engine (js/crystal.js, the same copy the
// specimens grow with); the level is js/level.js; the body is js/physics.js.
// This file is the loop: input, the growth's real-time pacing, the camera,
// the HUD, and the two verbs — deploy and break.

import { GRID } from "./genome.js";
import { Renderer } from "./render.js";
import { level, world, survey, bucketOf, bucketCells, inBucket, slabTop, normalizeLevel, packLabel, SLAB_Z, C } from "./level.js";
import { player, stepPlayer, pushOut, raycast, EYE } from "./physics.js";

const G = GRID;
const $ = (s) => document.querySelector(s);
const fmt = (n) => n.toLocaleString("en-US");
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const key = (x, y, z) => (z * G + y) * G + x;

const PACE = 60;                       // bricks per second, real time
const FAST = 6;                        // …while fast-forwarding
const LOOK = 0.0022;                   // radians per pixel of mouse

function levelFromURL() {
  const m = location.pathname.match(/^\/l\/(\d+)/);
  if (m) return normalizeLevel(m[1]);
  const q = new URLSearchParams(location.search).get("l");
  if (q) return normalizeLevel(q);
  return null;
}
// Pretty permalinks need the worker; a bare static server gets the query form.
function pathFor(n) {
  const pretty = /^\/l\//.test(location.pathname) || location.pathname === "/" || location.pathname === "/index.html";
  return pretty && location.protocol !== "file:" ? `/l/${n}` : `${location.pathname}?l=${n}`;
}
const store = {
  get(k) { try { return localStorage.getItem("hopper:" + k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem("hopper:" + k, String(v)); } catch (e) { /* private mode */ } },
};
const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

class Game {
  constructor() {
    this.canvas = $("#gl");
    this.renderer = new Renderer(this.canvas);
    this.keys = new Set();
    this.touch = ("ontouchstart" in window) || navigator.maxTouchPoints > 0;
    this.state = "intro";
    this.last = performance.now();
    this.hudTimer = 0;
    this.stick = null;
    this.bind();
    let n = levelFromURL();
    if (n === null) {
      n = normalizeLevel(store.get("reached") || 1);
      history.replaceState(null, "", pathFor(n));
    }
    this.start(n);
    requestAnimationFrame((t) => this.loop(t));
  }

  // ----------------------------------------------------------- a level --
  start(n) {
    this.n = n;
    this.lv = level(n);
    this.growth = world(this.lv);
    this.renderer.setGrowth(this.growth);
    this.renderer.sync(true);
    this.renderer.cool = 1.6;
    this.renderer.setProps(null);
    this.renderer.beacons = null;
    this.bucket = null;
    this.bucketSet = null;
    const top = slabTop(this.lv);
    this.spawn = [C + 0.5, C + 0.5, top + 1];
    // you wake on the slab looking straight up into the void
    this.p = player(this.spawn[0], this.spawn[1], this.spawn[2], 0.8, 1.2);
    this.renderer.fp = { eye: [this.p.x, this.p.y, this.p.z + EYE], yaw: this.p.yaw, pitch: this.p.pitch, fov: 1.25 };
    this.pocket = this.lv.packs.map((pack) => ({ pack, used: false }));
    this.sel = 0;
    this.debt = 0;
    this.fast = false;
    this.stats = { t: 0, deploys: 0, breaks: 0, falls: 0 };
    this.won = false;
    this.state = "intro";
    this.surveyNote = "";
    this.solid = (x, y, z) => {
      if (x < 0 || y < 0 || z < 0 || x >= G || y >= G || z >= G) return false;
      const k = (z * G + y) * G + x;
      return this.growth.sub.occ[k] === 1 || (this.bucketSet !== null && this.bucketSet.has(k));
    };
    this.crystal = (x, y, z) => x >= 0 && y >= 0 && z >= 0 && x < G && y < G && z < G && this.growth.sub.occ[(z * G + y) * G + x] === 1;
    document.title = `hopper · level ${n}`;
    $("#lvl").textContent = `level ${n}`;
    this.survey();
    this.buildPocket();
    this.renderHUD();
    this.overlay("intro");
  }

  go(n, push = true) {
    n = normalizeLevel(n);
    if (push) history.pushState(null, "", pathFor(n));
    this.start(n);
  }

  // The survey: the engine stacks this level's packs to the end, off the
  // main thread, and the bucket lands at a fraction of that height.
  survey() {
    const n = this.n;
    if (this.worker) { this.worker.terminate(); this.worker = null; }
    const apply = (reach) => { if (this.n === n) this.setBucket(reach); };
    const inline = () => apply(survey(this.lv).reach);
    try {
      const w = this.worker = new Worker("/js/oracle.js", { type: "module" });
      w.onmessage = (e) => {
        const d = e.data;
        if (!d || d.n !== n) return;
        if (d.done) { apply(d.reach); w.terminate(); if (this.worker === w) this.worker = null; }
        else this.surveyNote = `surveying the void… ${d.progress} / ${d.of}`;
      };
      w.onerror = () => { w.terminate(); if (this.worker === w) this.worker = null; inline(); };
      w.postMessage({ n });
      this.surveyNote = "surveying the void…";
    } catch (e) { inline(); }
  }

  setBucket(reach) {
    const b = this.bucket = bucketOf(this.lv, reach);
    const cells = bucketCells(b);
    this.bucketSet = new Set(cells.map((c) => key(c[0], c[1], c[2])));
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

  // ---------------------------------------------------------- the verbs --
  target() { return this.state === "play" || this.state === "won" ? raycast(this.p, this.solid) : null; }
  isBucket(t) { return t && this.bucketSet !== null && this.bucketSet.has(key(t.x, t.y, t.z)); }

  deploy() {
    if (this.state !== "play") return;
    const slot = this.pocket[this.sel];
    if (!slot) return;
    if (slot.used) { this.toast("that pack is spent — pick another"); return; }
    const t = this.target();
    let x, y;
    if (t && this.isBucket(t)) { this.toast("not on the bucket — the bucket is the goal"); return; }
    if (t) { x = t.x; y = t.y; } else { x = Math.floor(this.p.x); y = Math.floor(this.p.y); }
    const top = this.growth.sub.ext[4][x * G + y];
    if (top < 0) { this.toast("nothing to build on there"); return; }
    const at = { x, y, z: top + 1 };
    const wasGrowing = this.growth.colonies.some((c) => !c.done);
    const idx = this.growth.deploy(slot.pack, at);
    if (idx < 0) { this.toast("the pack found nowhere to land"); return; }
    slot.used = true;
    this.stats.deploys++;
    this.renderer.sync(false);
    pushOut(this.p, this.crystal);
    const next = this.pocket.findIndex((s) => !s.used);
    if (next >= 0) this.sel = next;
    this.toast(`${slot.pack.habit} pack on the plane at z ${at.z}` + (wasGrowing ? " — the old growth froze" : ""));
    this.buildPocket();
    this.renderHUD();
  }

  demolish() {
    if (this.state !== "play") return;
    const t = this.target();
    if (!t) return;
    if (this.isBucket(t)) { this.toast("the bucket is not yours to break"); return; }
    if (this.growth.remove({ x: t.x, y: t.y, z: t.z })) {
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

  respawn() {
    const p = this.p;
    p.x = this.spawn[0]; p.y = this.spawn[1]; p.z = this.spawn[2];
    p.vx = p.vy = p.vz = 0;
    pushOut(this.p, this.crystal);
    this.stats.falls++;
    this.toast("the void. back on the slab.");
  }

  win() {
    this.won = true;
    this.state = "won";
    this.growth.freeze();
    this.renderer.sync(false);
    if (document.pointerLockElement === this.canvas && document.exitPointerLock) document.exitPointerLock();
    const t = this.stats.t;
    const best = store.get("best:" + this.n);
    if (best === null || t < +best) store.set("best:" + this.n, t.toFixed(2));
    const reached = +(store.get("reached") || 1);
    if (this.n + 1 > reached) store.set("reached", this.n + 1);
    this.overlay("won");
  }

  // ---------------------------------------------------------- the loop --
  loop(t) {
    const dt = Math.min(0.05, (t - this.last) / 1000);
    this.last = t;
    const g = this.growth, p = this.p;
    if (this.state === "play") {
      this.stats.t += dt;
      const k = this.keys;
      let mx = 0, my = 0;
      if (k.has("KeyW") || k.has("ArrowUp")) mx += 1;
      if (k.has("KeyS") || k.has("ArrowDown")) mx -= 1;
      if (k.has("KeyD") || k.has("ArrowRight")) my += 1;
      if (k.has("KeyA") || k.has("ArrowLeft")) my -= 1;
      if (this.stick) { mx += this.stick.f; my += this.stick.r; }
      stepPlayer(p, this.solid, { mx, my, jump: this.jumpQueued || k.has("Space") }, dt);
      this.jumpQueued = false;
      if (!g.done) {
        this.debt += PACE * (this.fast ? FAST : 1) * dt;
        // run the engine until this frame's bricks are laid or ~7 ms are spent
        const deadline = performance.now() + 7;
        const before = g.bricks.length;
        let steps = 0;
        while (!g.done && g.bricks.length - before < this.debt) {
          g.step();
          if ((++steps & 63) === 0 && performance.now() > deadline) break;
        }
        this.debt -= g.bricks.length - before;
        if (this.debt > 40) this.debt = 40;
        this.renderer.sync(false);
        if (pushOut(p, this.crystal)) this.rode = this.stats.t;
      }
      if (p.z < SLAB_Z - 16) this.respawn();
      if (!this.won && p.ground && inBucket(this.bucket, p.x, p.y, p.z)) this.win();
    }
    const fp = this.renderer.fp;
    fp.eye[0] = p.x; fp.eye[1] = p.y; fp.eye[2] = p.z + EYE;
    fp.yaw = p.yaw; fp.pitch = p.pitch;
    this.renderer.frame(dt, g.done ? null : g.masons);
    this.hudTimer += dt;
    if (this.hudTimer > 0.1) { this.hudTimer = 0; this.renderHUD(); }
    requestAnimationFrame((tt) => this.loop(tt));
  }

  // ------------------------------------------------------------- the HUD --
  buildPocket() {
    const el = $("#pocket");
    el.innerHTML = "";
    this.pocket.forEach((slot, i) => {
      const d = document.createElement("button");
      d.className = "pack" + (slot.used ? " used" : "") + (i === this.sel ? " sel" : "");
      d.innerHTML = `<span class="k">${i + 1}</span><span class="h">${slot.pack.habit}</span><span class="d">${slot.pack.masons} masons · ${fmt(slot.pack.budget)} bricks · ${slot.pack.size}×${slot.pack.size}</span>`;
      d.title = packLabel(slot.pack) + " — " + slot.pack.habitDesc;
      d.addEventListener("click", (e) => { e.preventDefault(); this.select(i); });
      el.appendChild(d);
    });
  }

  renderHUD() {
    const p = this.p, b = this.bucket, g = this.growth;
    const top = slabTop(this.lv);
    $("#alt").textContent = `z ${Math.floor(p.z)}` + (b ? ` · the bucket's floor z ${b.z + 1} · rim z ${b.rim}` : "");
    // the height meter: slab at the bottom, the bucket's rim near the top
    const hi = b ? b.rim + 8 : 64;
    const pct = (z) => clamp((z - top) / (hi - top), 0, 1) * 100;
    $("#m-you").style.bottom = pct(p.z) + "%";
    $("#m-bucket").style.bottom = pct(b ? b.z + 1 : hi) + "%";
    $("#m-bucket").hidden = !b;
    const cur = g.colonies.length > 1 ? g.colonies[g.colonies.length - 1] : null;
    const frozen = g.colonies.filter((c) => c.frozen && c.idx > 0).length;
    if (cur && !cur.done) {
      $("#growth").textContent = `${cur.genome.habit} pack growing · ${fmt(cur.laid)} / ${fmt(cur.genome.budget)} bricks · ${cur.masons.filter((m) => m.state === "surface").length} masons on the surface` + (this.fast ? " · fast" : "");
      $("#gbar").style.transform = `scaleX(${clamp(cur.laid / cur.genome.budget, 0, 1)})`;
    } else {
      $("#growth").textContent = (this.surveyNote || (cur ? `still · ${fmt(g.bricks.length)} bricks · ${frozen} growth${frozen === 1 ? "" : "s"} frozen` : `${fmt(g.bricks.length)} bricks of slab · nothing grows until you deploy`));
      $("#gbar").style.transform = "scaleX(0)";
    }
    const left = this.pocket.filter((s) => !s.used).length;
    const t = this.target();
    let tx = "";
    if (this.state === "play") {
      if (t && this.isBucket(t)) tx = "the bucket — get above it and drop in";
      else if (t) tx = `brick · z ${t.z} · ${this.touch ? "deploy" : "E"} lands the pack on this column's top plane · ${this.touch ? "break" : "click"} takes it away`;
      else tx = `the void · ${this.touch ? "deploy" : "E"} lands the pack underfoot`;
      if (!left) tx = g.done ? "no packs left — R starts the level over" : "no packs left — this is the last growth";
    }
    $("#target").textContent = tx;
    $("#clock").textContent = mmss(this.stats.t);
  }

  overlay(kind) {
    const ov = $("#overlay");
    ov.className = "show " + kind;
    if (kind === "intro") {
      $("#ov-title").textContent = `level ${this.n}`;
      const best = store.get("best:" + this.n);
      $("#ov-sub").textContent = `${this.lv.packs.length} packs in your pocket` + (best ? ` · best ${mmss(+best)}` : "");
      $("#ov-body").hidden = false;
      $("#ov-won").hidden = true;
      $("#play").textContent = this.touch ? "tap to play" : "click to play";
    } else if (kind === "paused") {
      $("#ov-title").textContent = "paused";
      $("#ov-sub").textContent = `level ${this.n} · ${mmss(this.stats.t)}`;
      $("#ov-body").hidden = false;
      $("#ov-won").hidden = true;
      $("#play").textContent = this.touch ? "tap to resume" : "click to resume";
    } else if (kind === "won") {
      const s = this.stats;
      $("#ov-title").textContent = "delivered.";
      $("#ov-sub").textContent = `level ${this.n} · ${mmss(s.t)} · ${s.deploys} pack${s.deploys === 1 ? "" : "s"} deployed · ${s.breaks} brick${s.breaks === 1 ? "" : "s"} broken · ${s.falls} fall${s.falls === 1 ? "" : "s"} into the void`;
      $("#ov-body").hidden = true;
      $("#ov-won").hidden = false;
      $("#next").href = pathFor(this.n + 1);
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
    this.stick = null;
    this.overlay("paused");
  }
  look(dx, dy) {
    const p = this.p;
    p.yaw -= dx * LOOK;
    p.pitch = clamp(p.pitch - dy * LOOK, -1.5, 1.5);
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
      else if (e.code === "KeyR") this.go(this.n, false);
      else if (e.code === "KeyN") { if (this.state === "won") this.go(this.n + 1); }
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
    $("#overlay").addEventListener("click", (e) => { if (e.target === e.currentTarget && this.state !== "won") this.play(); });
    $("#again").addEventListener("click", () => this.go(this.n, false));
    $("#next").addEventListener("click", (e) => { e.preventDefault(); this.go(this.n + 1); });
    $("#share").addEventListener("click", async () => {
      const url = location.origin + pathFor(this.n);
      try { await navigator.clipboard.writeText(url); this.toast("link copied — this level, forever"); } catch (e) { this.toast(url); }
    });
    $("#help-btn").addEventListener("click", () => $("#help").classList.toggle("open"));
    $("#help-close").addEventListener("click", () => $("#help").classList.remove("open"));
    $("#lvlform").addEventListener("submit", (e) => {
      e.preventDefault();
      const v = parseInt($("#lvlinput").value, 10);
      if (v > 0) this.go(v);
      $("#lvlinput").value = "";
      $("#lvlinput").blur();
    });
    window.addEventListener("popstate", () => { const n = levelFromURL(); if (n !== null) this.start(n); });
    this.bindTouch();
  }

  bindTouch() {
    if (!this.touch) return;
    document.body.classList.add("touch");
    const cv = this.canvas;
    let moveT = null, lookT = null;
    cv.addEventListener("touchstart", (e) => {
      e.preventDefault();
      if (this.state === "intro" || this.state === "paused") { this.play(); return; }
      for (const t of e.changedTouches) {
        if (t.clientX < innerWidth / 2 && !moveT) moveT = { id: t.identifier, x: t.clientX, y: t.clientY };
        else if (!lookT) lookT = { id: t.identifier, x: t.clientX, y: t.clientY };
      }
    }, { passive: false });
    cv.addEventListener("touchmove", (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (moveT && t.identifier === moveT.id) {
          const r = 56;
          this.stick = { f: clamp((moveT.y - t.clientY) / r, -1, 1), r: clamp((t.clientX - moveT.x) / r, -1, 1) };
        }
        if (lookT && t.identifier === lookT.id) {
          this.look((t.clientX - lookT.x) * 2.4, (t.clientY - lookT.y) * 2.4);
          lookT.x = t.clientX; lookT.y = t.clientY;
        }
      }
    }, { passive: false });
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (moveT && t.identifier === moveT.id) { moveT = null; this.stick = null; }
        if (lookT && t.identifier === lookT.id) lookT = null;
      }
    };
    cv.addEventListener("touchend", end);
    cv.addEventListener("touchcancel", end);
    const tb = (id, fn) => $(id).addEventListener("touchstart", (e) => { e.preventDefault(); fn(); }, { passive: false });
    tb("#t-jump", () => { this.jumpQueued = true; });
    tb("#t-deploy", () => this.deploy());
    tb("#t-break", () => this.demolish());
    tb("#t-pack", () => this.cycle(1));
    tb("#t-fast", () => { this.fast = !this.fast; $("#t-fast").classList.toggle("on", this.fast); });
    tb("#t-pause", () => this.pause());
  }

  toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(this._toast);
    this._toast = setTimeout(() => el.classList.remove("show"), 2400);
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
