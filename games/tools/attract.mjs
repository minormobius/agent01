/* Record the arcade's attract loops: a few seconds of real play from every
   game, for the selector at games.mino.mobi/.

     node games/tools/attract.mjs [id ...]     (needs a server on :8765 serving games/)
     node games/tools/attract.mjs --webm       (re-derive just the WebMs)

   Each game is opened in a headless browser at 420 × 560 (a cabinet screen
   stood on end), taken past its title screen, and played by a little script
   of its own inputs while the page is recorded. ffmpeg then cuts the clip,
   scales it to 300 × 400 and encodes it small: games/arcade/clips/<id>.mp4
   (H.264, fast start), <id>.webm (VP9, for browsers built without H.264) and
   a poster frame, <id>.jpg. Re-run it when a game changes how it looks. */
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)(process.env.PW_MODULE || "/opt/node22/lib/node_modules/playwright");
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url)), OUT = path.join(here, "../arcade/clips"), TMP = path.join(here, "../../.attract-tmp");
const BASE = process.env.ATTRACT_BASE || "http://localhost:8765/";
const SECS = 7, W = 420, H = 560;
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(TMP, { recursive: true });

let seed = 11;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const pick = (a) => a[(rnd() * a.length) | 0];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = (t0, s = SECS + 1.2) => Date.now() - t0 < s * 1000;
async function click(p, sel) { const el = await p.$(sel); if (el && await el.isVisible()) { await el.click().catch(() => {}); return true; } return false; }
async function tapIn(p, x0, y0, x1, y1) { await p.mouse.click(x0 + rnd() * (x1 - x0), y0 + rnd() * (y1 - y0)); }
async function drag(p, x, y, dx, dy, steps = 12) { await p.mouse.move(x, y); await p.mouse.down(); for (let i = 1; i <= steps; i++) { await p.mouse.move(x + (dx * i) / steps, y + (dy * i) / steps); await sleep(25); } await p.mouse.up(); }
const ARROWS = ["ArrowUp", "ArrowLeft", "ArrowRight", "ArrowDown"];

/* every game: where it lives, how to get it past its title screen (`setup`,
   not filmed), and how to play it for the camera (`play`, filmed) */
const center = async (p, sel) => { const r = await p.$eval(sel, (c) => { const b = c.getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2, b.width, b.height]; }); return r; };
const wander = (gap, jitter, hold = 0) => async (p, t0) => { let last = ""; while (until(t0)) { await sleep(gap + rnd() * jitter); const d = pick(ARROWS.filter((a) => a !== last)); if (hold) { await p.keyboard.down(d); await sleep(hold); await p.keyboard.up(d); } else await p.keyboard.press(d); last = d; } };
const sweeper = (canvas) => ({
  setup: async (p) => { await click(p, "#start-btn"); await sleep(300); await p.keyboard.press("f"); const [x, y] = await center(p, canvas); await p.mouse.click(x, y); },
  play: async (p, t0) => { while (until(t0)) { await p.keyboard.press("h"); await sleep(750); const [x, y] = await center(p, canvas); await p.mouse.click(x, y); await sleep(200); } },
});
export const GAMES = [
  { id: "molt", url: "molt/", setup: (p) => click(p, "#go"), play: wander(520, 500) },
  { id: "cascade", url: "molt/cascade.html", setup: (p) => click(p, "#watch"), play: async (p, t0) => { while (until(t0)) await sleep(200); } },
  { id: "naught", url: "naught/",
    setup: async (p) => { await click(p, '#nsel [data-v="4"]'); await click(p, '[data-game="avoid"]'); await sleep(300); },
    play: async (p, t0) => { while (until(t0)) { await sleep(650); await p.evaluate(() => { const g = window.NAUGHT.game; const cs = []; for (let c = 0; c < g.B.N; c++) if (g.owner[c] === 0 && !g.threats(g.turn).has(c)) cs.push(c); if (cs.length) window.NAUGHT.tryPlay(cs[(Math.random() * cs.length) | 0]); }); } } },
  { id: "anakata", url: "anakata/?level=10", setup: async (p) => { await p.evaluate(() => { document.getElementById("hint").hidden = true; }); await sleep(600); },
    play: async (p, t0) => {
      const A = (d) => p.evaluate((d) => window.ANAKATA.act(d, false), d), T = () => p.evaluate(() => window.ANAKATA.turnSight(1));
      await sleep(500); await A([1, 0, 0, 0]); await sleep(900); await A([1, 0, 0, 0]); await sleep(1200);
      await T(); await sleep(1500);
      for (let i = 0; i < 2; i++) { await A([1, 0, 0, 0]); await sleep(1300); } // stop one short of the goal: the clip ends on the staircase
      while (until(t0)) await sleep(200);
    } },
  { id: "anabasis", url: "anabasis/?level=7", setup: async (p) => { await p.evaluate(() => { document.getElementById("hint").hidden = true; window.ANABASIS.turnSight(1); }); await sleep(1200); },
    play: async (p, t0) => { // round the wrapped staircase, with w drawn up: a tower that climbs for ever
      const A = (d) => p.evaluate((d) => window.ANABASIS.act(d), d), X = [1, 0, 0, 0], Y = [0, 1, 0, 0], NX = [-1, 0, 0, 0];
      for (const d of [X, X, X, Y, Y, Y, NX, NX]) { await A(d); await sleep(800); if (!until(t0)) break; }
      while (until(t0)) await sleep(200);
    } },
  { id: "hinton", url: "hinton/?lane=anakata&level=11&res=1", setup: async (p) => { await p.evaluate(() => { document.getElementById("hint").hidden = true; window.HINTON.look(Math.PI / 2, -0.3); }); await sleep(900); },
    play: async (p, t0) => { // turn your sight on camera, so the slice sweeps through w, then look round the room you're in now
      await sleep(700); await p.evaluate(() => window.HINTON.turnSight(1)); await sleep(2200);
      for (let k = 0; k < 30 && until(t0); k++) { await p.evaluate((k) => window.HINTON.look(Math.PI / 2 - Math.sin(k / 9) * 0.9, -0.3 - k * 0.004), k); await sleep(130); }
      while (until(t0)) await sleep(200);
    } },
  { id: "ziggurat", url: "ziggurat/", setup: async (p) => { await click(p, "#start-btn"); await p.evaluate(() => { window.ZIG.mute(); window.ZIG.auto.on = true; }); await sleep(2500); },
    play: async (p, t0) => { while (until(t0)) { await sleep(200); if (Date.now() - t0 > 4800 && Date.now() - t0 < 5000) await p.evaluate(() => window.ZIG.turn()); } } },
  { id: "tessera", url: "tessera/", setup: (p) => click(p, "#go-open"), play: wander(450, 450) },
  { id: "orb", url: "orb/", ...sweeper("#orb") },
  { id: "fathom", url: "fathom/", ...sweeper("#orb") },
  { id: "oneside", url: "oneside/", setup: (p) => click(p, "#start-btn"), play: wander(380, 400, 160) },
  { id: "strand", url: "strand/", setup: (p) => click(p, "#start-btn"), play: async (p, t0) => { while (until(t0)) { await sleep(300); await drag(p, W / 2 - 80, H / 2 + 10, 160, (rnd() - 0.5) * 50, 20); } } },
  { id: "onecoast", url: "onecoast/", setup: (p) => click(p, "#start-btn"), play: async (p, t0) => { while (until(t0)) { await sleep(300); await tapIn(p, W / 2 - 80, H / 2 - 60, W / 2 + 80, H / 2 + 60); await sleep(200); await drag(p, W / 2, H / 2, 60, 10); } } },
  { id: "skein", url: "skein/", setup: (p) => click(p, "#start-btn"), play: async (p, t0) => { while (until(t0)) { await sleep(250); await drag(p, W / 2 - 90, H / 2, 180, (rnd() - 0.5) * 60, 24); } } },
  { id: "twelve", url: "twelve/", setup: (p) => click(p, "#start-btn"), play: wander(550, 300) },
  { id: "bucky", url: "bucky/", setup: (p) => click(p, "#start-btn"), play: async (p, t0) => { while (until(t0)) { await sleep(300); await drag(p, W / 2 - 60, H / 2, 120, 30, 18); await tapIn(p, W / 2 - 80, H / 2 - 80, W / 2 + 80, H / 2 + 80); } } },
  { id: "ecumene", url: "ecumene/", setup: async (p) => { await p.waitForSelector("#start-btn:not([disabled])", { timeout: 60000 }); await click(p, "#start-btn"); await sleep(500); await click(p, "#fast"); await sleep(3000); }, play: async (p, t0) => { while (until(t0)) await sleep(200); } },
  { id: "hearth", url: "hearth/", setup: async (p) => { await p.waitForSelector("#start-btn:not([disabled])", { timeout: 60000 }); await click(p, "#start-btn"); await sleep(500); await click(p, "#fast"); await sleep(2000); }, play: async (p, t0) => { while (until(t0)) { await sleep(400); await drag(p, W / 2 - 60, H / 2, 120, 0, 16); } } },
  { id: "tempest", url: "tempest/", setup: async (p) => { await p.keyboard.press("Space"); await sleep(300); }, play: async (p, t0) => { while (until(t0)) { const d = pick(["ArrowLeft", "ArrowRight"]); await p.keyboard.down(d); await sleep(150 + rnd() * 300); await p.keyboard.up(d); for (let i = 0; i < 3; i++) { await p.keyboard.press("Space"); await sleep(90); } } } },
  { id: "horde", url: "horde/", setup: (p) => click(p, "#start-btn"), play: async (p, t0) => { while (until(t0)) { await sleep(180); const a = rnd() * Math.PI * 2; await p.mouse.click(W / 2 + Math.cos(a) * 140, H / 2 + Math.sin(a) * 120); } } },
  { id: "telegraph", url: "telegraph/", setup: (p) => click(p, "#start-btn"), play: async (p, t0) => { while (until(t0)) { await p.keyboard.press(pick(["1", "2"])); await sleep(250); const ts = await p.$$("button.tile"); if (ts.length) await pick(ts).click().catch(() => {}); await sleep(450); if (rnd() < 0.35) await p.keyboard.press("Enter"); } } },
  { id: "ratchet", url: "ratchet/", setup: (p) => click(p, "#start-btn"), play: async (p, t0) => { while (until(t0)) { await sleep(900); const bs = (await p.$$("button")).slice(0, 8); for (const b of bs.sort(() => rnd() - 0.5)) if (await b.isVisible() && await b.isEnabled()) { await b.click().catch(() => {}); break; } } } },
  { id: "outbound", url: "outbound/", setup: (p) => click(p, "#start-btn"), play: async (p, t0) => { while (until(t0)) { await sleep(500); await p.keyboard.press(pick(["1", "2", "3", "4", "b"])); await sleep(500); await p.keyboard.press(rnd() < 0.8 ? "Enter" : "l"); await sleep(400); if (await p.$eval("#over", (e) => !e.hidden).catch(() => false)) await p.keyboard.press("Enter"); } } },
  { id: "switchboard", url: "switchboard/", setup: (p) => click(p, "#start-btn"), play: async (p, t0) => { while (until(t0)) { await sleep(450); await tapIn(p, 40, 80, W - 40, H - 40); } } },
  { id: "gen", url: "gen/", play: async (p, t0) => { while (until(t0)) { await sleep(1700); await click(p, "#rand"); } } },
];

/* the same clip as VP9 WebM, for browsers built without H.264 */
function webm(id) {
  const enc = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-i", path.join(OUT, id + ".mp4"), "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "42", "-row-mt", "1", "-deadline", "good", "-cpu-used", "2", "-an", path.join(OUT, id + ".webm")]);
  if (enc.status) throw new Error(enc.stderr.toString());
}

async function record(b, g) {
  const ctx = await b.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: TMP, size: { width: W, height: H } } });
  const p = await ctx.newPage(), born = Date.now();
  await p.goto(BASE + g.url, { waitUntil: "load" }).catch(() => {});
  await sleep(700);
  if (g.setup) await g.setup(p).catch((e) => console.error(g.id, "setup", e.message));
  await sleep(300);
  const t0 = Date.now();
  await g.play(p, t0).catch((e) => console.error(g.id, e.message));
  const offset = (t0 - born) / 1000 + 0.8;
  await p.close(); await ctx.close();
  const raw = await p.video().path();
  const mp4 = path.join(OUT, g.id + ".mp4"), jpg = path.join(OUT, g.id + ".jpg");
  const enc = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", String(offset), "-i", raw, "-t", String(SECS), "-vf", "scale=300:400:flags=lanczos,fps=24", "-c:v", "libx264", "-preset", "slow", "-crf", "31", "-pix_fmt", "yuv420p", "-an", "-movflags", "+faststart", mp4]);
  if (enc.status) throw new Error(enc.stderr.toString());
  webm(g.id);
  spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", "3.5", "-i", mp4, "-frames:v", "1", "-q:v", "6", jpg]);
  fs.rmSync(raw, { force: true });
  console.log(g.id.padEnd(12), (fs.statSync(mp4).size / 1024).toFixed(0) + " KB");
}

const want = process.argv.slice(2);
if (want[0] === "--webm") { for (const g of GAMES) if (fs.existsSync(path.join(OUT, g.id + ".mp4"))) webm(g.id); process.exit(0); }
const b = await chromium.launch(Object.assign({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] }, process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}));
for (const g of GAMES) if (!want.length || want.includes(g.id)) await record(b, g);
await b.close();
fs.rmSync(TMP, { recursive: true, force: true });
