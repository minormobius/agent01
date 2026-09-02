// bismuth — the page. Seed from the URL, a Growth, a Renderer, and the
// pacing that turns a few thousand ticks into a minute of watching masons
// lay a crystal. Nothing here touches determinism: the brick sequence is the
// engine's, and the same whether you watch it or skip to the end.

import { Growth } from "./crystal.js";
import { genome, normalizeSeed, quasiSubstrate } from "./genome.js";
import { Renderer } from "./render.js";
import { SHAPE_INFO } from "./tilings.js";

const $ = (s) => document.querySelector(s);
const fmt = (n) => n.toLocaleString("en-US");

// Two namespaces: /c/<seed> is a cubic specimen, /q/<seed> its quasicrystal
// cousin — the same genome grown on a plane tiling chosen by the seed.
function seedFromURL() {
  const m = location.pathname.match(/^\/([cq])\/(\d+)/);
  if (m) return normalizeSeed(m[2]);
  const q = new URLSearchParams(location.search).get("seed");
  if (q) return normalizeSeed(q);
  return null;
}
function quasiFromURL() {
  if (/^\/q\//.test(location.pathname)) return true;
  return new URLSearchParams(location.search).has("q");
}
function randomSeed() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return (a[0] % 900000) + 1;
}
// Pretty permalinks need the worker; a bare static server gets the query form.
function pathFor(seed, quasi) {
  const pretty = /^\/[cq]\//.test(location.pathname) || location.pathname === "/" || location.pathname === "/index.html";
  const q = new URLSearchParams(location.search);
  q.delete("seed"); q.delete("q");
  if (!pretty && quasi) q.set("q", "1");
  const rest = q.toString() ? "?" + q.toString() : "";
  return pretty && location.protocol !== "file:" ? `/${quasi ? "q" : "c"}/${seed}${rest}` : `${location.pathname}?seed=${seed}${rest.replace(/^\?/, "&")}`;
}

class App {
  constructor() {
    this.canvas = $("#gl");
    this.renderer = new Renderer(this.canvas);
    this.growth = null;
    this.paused = false;
    this.last = performance.now();
    this.debt = 0;
    this.instant = new URLSearchParams(location.search).has("instant");
    this.quasi = quasiFromURL();
    this.shapeOverride = new URLSearchParams(location.search).get("shape");
    this.bind();
    const seed = seedFromURL();
    if (seed === null) {
      const s = randomSeed();
      history.replaceState(null, "", pathFor(s, this.quasi));
      this.start(s);
    } else this.start(seed);
    requestAnimationFrame((t) => this.loop(t));
  }

  start(seed) {
    this.seed = seed;
    const gen = genome(seed);
    if (this.quasi || this.shapeOverride) gen.substrate = quasiSubstrate(seed, this.shapeOverride);
    this.growth = new Growth(gen);
    this.renderer.setGrowth(this.growth);
    this.renderer.sync(true);                 // the nucleus is already cold
    this.renderer.snapCamera();
    this.renderer.cool = 1.6;
    this.debt = 0;
    this.finished = false;
    window.__done = false;
    const g = this.growth.genome;
    // pace: a whole crystal in 20–55 s, whatever its budget
    this.duration = Math.max(20, Math.min(55, g.budget / 200));
    this.rate = g.budget / this.duration;
    const sub = g.substrate;
    $("#seed").textContent = (sub ? "Q " : "№ ") + fmt(seed);
    $("#habit").textContent = sub ? `${g.label} · on ${SHAPE_INFO[sub.shape].label}` : g.label;
    $("#masons").textContent = `${g.masons} masons · rim ${g.rim} · ${sub ? SHAPE_INFO[sub.shape].note : g.habitDesc}`;
    $("#stats").textContent = "";
    $("#cousin").textContent = sub ? "cubic cousin" : "quasicrystal cousin";
    $("#cousin").href = pathFor(seed, !sub);
    document.title = `bismuth ${sub ? "Q" : "№"} ${seed}`;
    if (this.instant) this.skip();
    this.updateHUD();
  }

  go(seed, push = true) {
    seed = normalizeSeed(seed);
    if (push) history.pushState(null, "", pathFor(seed, this.quasi));
    this.start(seed);
  }

  skip() {
    this.growth.run();
    this.renderer.sync(true);
    this.renderer.snapCamera();
    this.finish();
  }

  finish() {
    if (this.finished) return;
    this.finished = true;
    const st = this.growth.stats();
    this.stats = st;
    $("#stats").textContent =
      `${fmt(st.bricks)} bricks · ${st.terraces} terraces on the midline · pit ${fmt(st.pit)} cells · ` +
      `${st.box[0]}×${st.box[1]}×${st.box[2]} · ${fmt(st.ticks)} ticks`;
    this.updateHUD();
    window.__done = true;
  }

  updateHUD() {
    const g = this.growth, gen = g.genome;
    const laid = g.bricks.length - g.nucleusBricks;
    const frac = Math.min(1, laid / gen.budget);
    $("#bar").style.transform = `scaleX(${frac})`;
    $("#count").textContent = g.done
      ? `${fmt(g.bricks.length)} bricks · grown`
      : `${fmt(g.bricks.length)} bricks · ${g.masons.filter((m) => m.state === "surface").length} masons on the surface`;
    $("#pause").textContent = this.paused ? "resume" : "pause";
    $("#pause").hidden = g.done;
    $("#skip").hidden = g.done;
  }

  loop(t) {
    const dt = Math.min(0.1, (t - this.last) / 1000);
    this.last = t;
    const g = this.growth;
    if (!g.done && !this.paused) {
      this.debt += this.rate * dt;
      // run the engine until this frame's bricks are laid or ~7 ms are spent,
      // so a nucleation-limited stretch never stalls the frame rate
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
      if (g.done) this.finish();
      this.updateHUD();
    }
    this.renderer.frame(dt, g.done ? null : g.masons);
    requestAnimationFrame((tt) => this.loop(tt));
  }

  bind() {
    $("#new").addEventListener("click", () => this.go(randomSeed()));
    $("#again").addEventListener("click", () => this.go(this.seed, false));
    $("#skip").addEventListener("click", () => this.skip());
    $("#pause").addEventListener("click", () => { this.paused = !this.paused; this.updateHUD(); });
    $("#share").addEventListener("click", async () => {
      const url = location.origin + pathFor(this.seed, this.quasi);
      try { await navigator.clipboard.writeText(url); this.toast("link copied — this crystal, forever"); }
      catch (e) { this.toast(url); }
    });
    $("#about-btn").addEventListener("click", () => $("#about").classList.toggle("open"));
    $("#about-close").addEventListener("click", () => $("#about").classList.remove("open"));
    $("#seedform").addEventListener("submit", (e) => {
      e.preventDefault();
      const v = parseInt($("#seedinput").value, 10);
      if (v > 0) this.go(v);
      $("#seedinput").value = "";
      $("#seedinput").blur();
    });
    window.addEventListener("popstate", () => { this.quasi = quasiFromURL(); const s = seedFromURL(); if (s !== null) this.start(s); });
    $("#cousin").addEventListener("click", (e) => { e.preventDefault(); this.quasi = !this.quasi; this.go(this.seed); });
    window.addEventListener("keydown", (e) => {
      if (e.target && (e.target.tagName === "INPUT")) return;
      if (e.key === " ") { e.preventDefault(); this.paused = !this.paused; this.updateHUD(); }
      else if (e.key === "n") this.go(randomSeed());
      else if (e.key === "r") this.go(this.seed, false);
      else if (e.key === "s") this.skip();
      else if (e.key === "ArrowRight") this.go(this.seed + 1);
      else if (e.key === "ArrowLeft") this.go(Math.max(1, this.seed - 1));
      else if (e.key === "a") $("#about").classList.toggle("open");
      else if (e.key === "Escape") $("#about").classList.remove("open");
    });
  }

  toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(this._toast);
    this._toast = setTimeout(() => el.classList.remove("show"), 2200);
  }
}

try {
  window.__bismuth = new App();
} catch (err) {
  const el = $("#err");
  el.hidden = false;
  el.textContent = "bismuth needs WebGL — " + (err && err.message ? err.message : err);
  console.error(err);
}
export { genome };
