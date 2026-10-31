/* Ouroboros computes — the page. The machine is js/tag.js (a tag system run
   on the Ouroboros engine, js/ouro.js); the drawing is Molt's (js/view.js),
   handed the world after every frame's moves. */
import { TagSnake, COLLATZ, collatzValue } from "./tag.js";
import { View, V_ } from "./view.js";

const $ = (id) => document.getElementById(id);
const view = new View($("view"));
V_.WINDOW = 1e9;
let sim = null, running = false, wide = true, acc = 0, last = 0, rate = 14, world = "real", path = [], lastTape = "", newCount = 0, collatz = true;

function parseRules(txt) {
  const rules = {}, re = /([abc])\s*(?:→|->|:|=>|>)\s*([abc]*)/g;
  let m;
  while ((m = re.exec(txt))) rules[m[1]] = m[2];
  return Object.keys(rules).length ? rules : null;
}
function program() {
  const n = Math.max(2, Math.min(26, Math.round(+$("n").value) || 7));
  $("n").value = n;
  const rules = parseRules($("rules").value) || COLLATZ.rules, d = +$("del").value, tape = ($("tapein").value || "").replace(/[^abc]/g, "");
  collatz = JSON.stringify(rules) === JSON.stringify(COLLATZ.rules) && d === 2 && !tape;
  return { sys: { name: collatz ? "Collatz" : "your tag system", d, rules }, input: tape || "a".repeat(n), n };
}
function start() {
  const p = program();
  sim = new TagSnake(p.input, p.sys, 1, world === "quiet" ? { bite: "pass", facing: "head" } : { facing: "head" });
  path = collatz ? [p.n] : []; lastTape = ""; newCount = 0; acc = 0;
  $("in").textContent = collatz ? p.n : p.input.length + " symbols";
  view.setWorld(sim.g.world, sim.g); view.mix = wide ? 1 : 0;
  status("laying down the input: " + (collatz ? "a × " + p.n : p.input), "");
  hud();
}
function status(t, cls) { const el = $("status"); el.textContent = t; el.className = cls || ""; }
function hud() {
  const g = sim.g, t = sim.tape;
  $("tags").textContent = sim.tagSteps; $("moves").textContent = sim.moves;
  if (t !== null && t !== undefined && !sim.laying) {
    if (t !== lastTape) {
      const v = collatz ? collatzValue(t) : null;
      lastTape = t;
      $("now").textContent = collatz ? (v || "…") : "—";
      $("len").textContent = t.length + (t.length === 1 ? " symbol · " : " symbols · ") + g.world.L + " cubes";
      const el = $("tape"), show = t.length > 160 ? t.slice(0, 160) : t;
      el.innerHTML = [...show].map((ch, i) => `<span class="${ch}${i === 0 ? " read" : ""}${i >= t.length - newCount ? " new" : ""}">${ch}</span>`).join("") + (t.length > 160 ? "<span>…</span>" : "");
    }
  }
  $("path").innerHTML = path.map((v, i) => (i === path.length - 1 ? `<b>${v}</b>` : v)).join(" → ") || "&nbsp;";
}
/* one move of the snake, and what it means */
function move() {
  const r = sim.step();
  if (!r) return false;
  if (r.tag) {
    newCount = (sim.sys.rules[r.read] || "").length;
    // every number the machine passes through, as it passes (the drawing may skip frames; this doesn't)
    const v = collatz ? collatzValue(sim.tape || "") : null;
    if (v && path[path.length - 1] !== v) path.push(v);
  }
  if (r.halted) {
    running = false; $("play").textContent = "▶";
    status(collatz ? `halted at 1, after ${sim.tagSteps} tag steps and ${sim.moves} moves: the snake's body spelled every number on the way` : `halted after ${sim.tagSteps} tag steps: the tape is "${sim.tape}"`, "done");
    return false;
  }
  if (sim.broken) {
    running = false; $("play").textContent = "▶";
    status(`broken after ${sim.tagSteps} tag steps: ${sim.broken}. In the quiet world it can't be.`, "broken");
    return false;
  }
  if (!sim.laying && $("status").className === "") status(`computing: reading "${sim.reading || "…"}" at the tail, writing at the head`, "");
  return true;
}
function frame(dt) {
  if (!running || !sim) return;
  acc += dt * rate / 1000;
  let n = 0;
  while (acc >= 1 && n < 4000) { acc -= 1; n++; if (!move()) { acc = 0; break; } if (sim.tape && sim.tape.length > 400) { running = false; status("the tape grew past 400 symbols: too long a world to draw", "broken"); break; } }
  if (n) { view.setWorld(sim.g.world); hud(); }
}
function loop(now) {
  const dt = Math.min(100, now - (last || now)); last = now;
  frame(dt);
  if (sim) {
    view.mix += ((wide ? 1 : 0) - view.mix) * (1 - Math.exp(-dt / 160));
    view.zoom += ((wide ? 1 : 2.4) - view.zoom) * (1 - Math.exp(-dt / 160));
    view.track(sim.g, 1, dt); view.drawTube(sim.g, now); view.drawMini(sim.g);
  }
  requestAnimationFrame(loop);
}

/* ---- controls */
function play() { if (!sim || sim.halted || sim.broken) start(); running = !running; $("play").textContent = running ? "❚❚" : "▶"; last = 0; }
$("play").onclick = play;
$("stepbtn").onclick = () => {
  if (!sim || sim.halted || sim.broken) start();
  running = false; $("play").textContent = "▶";
  for (let i = 0; i < 2000; i++) { const before = sim.tagSteps; if (!move()) break; if (sim.tagSteps > before && !sim.laying) break; }
  view.setWorld(sim.g.world); hud();
};
$("viewbtn").onclick = () => { wide = !wide; $("viewbtn").textContent = wide ? "whole" : "ride"; };
const openProgram = () => { running = false; $("play").textContent = "▶"; $("start").hidden = true; $("program").hidden = false; };
$("setup").onclick = openProgram; $("choose").onclick = openProgram;
$("run").onclick = () => { $("program").hidden = true; start(); running = true; $("play").textContent = "❚❚"; last = 0; };
function preset(n, w) {
  $("start").hidden = true; $("n").value = n; world = w; $("rules").value = "a→bc, b→a, c→aaa"; $("del").value = "2"; $("tapein").value = "";
  for (const b of $("world").children) b.classList.toggle("on", b.dataset.v === w);
  start(); running = true; $("play").textContent = "❚❚"; last = 0;
}
$("go").onclick = () => preset(12, "real");
$("go7").onclick = () => preset(7, "quiet");
$("help").onclick = () => { running = false; $("play").textContent = "▶"; $("start").hidden = false; };
function seg(id, set) { for (const b of $(id).children) b.onclick = () => { for (const c of $(id).children) c.classList.toggle("on", c === b); set(b.dataset.v); }; }
seg("world", (v) => { world = v; }); seg("speed", (v) => { rate = +v; });
for (const [id, v] of [["world", "real"], ["speed", "14"]]) for (const b of $(id).children) b.classList.toggle("on", b.dataset.v === v);
window.addEventListener("keydown", (e) => {
  // the program form's fields keep their keys
  if (e.ctrlKey || e.metaKey || e.altKey || (e.target && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)))) return;
  if (e.key === " ") { e.preventDefault(); play(); }
  else if (e.key === ".") $("stepbtn").click();
  else if (e.key === "v" || e.key === "V") $("viewbtn").click();
});
window.addEventListener("resize", () => { view.resize(); if (sim) view.setWorld(sim.g.world); });
document.addEventListener("visibilitychange", () => { if (document.hidden && running) play(); });

start();
requestAnimationFrame(loop);
window.COMPUTE = { get sim() { return sim; }, start, move };
