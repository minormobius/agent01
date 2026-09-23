/**
 * Actually look at a dweet: real pixels, from the real sandbox.
 *
 *   node agent/render.mjs <src> --out DIR [--at t] [--frames n] [--fps f]
 *                              [--width w] [--height h] [--gif out.gif] [--json]
 *
 * Writes a PNG per frame, a `report.json`, and optionally an animated GIF.
 * Exit 1 if the dweet errors or every frame comes back blank.
 *
 * ─── why this is a separate script from check.mjs ──────────────────────────
 *
 * Two reasons, and both are about honesty.
 *
 * **It needs a browser**, which `check.mjs` deliberately does not. Chromium is
 * a 150 MB dependency and an agent should be able to iterate on a dweet with
 * node alone. So the fast loop is `check.mjs` — length, tier, budget, does it
 * draw anything — and this is the slow one you run when you want to see it.
 * If Chromium is not installed this says so and exits, rather than describing
 * a picture it did not produce.
 *
 * **And it is the only safe way to run a stranger's dweet.** `check.mjs`
 * refuses to execute source fetched from the network because node has no
 * sandbox. This one runs everything inside `sandbox.js`'s real boundary — an
 * opaque-origin iframe, `default-src 'none'`, a terminable worker — so an
 * `at://` uri is fine here and is not there. It runs the shipped file, not a
 * copy of it, which is also what makes this a test of the boundary.
 *
 * GLSL runs here and nowhere else: a shader needs a GPU, and a compile error
 * comes back from the driver with its line number rather than being guessed at.
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { ROOT, arg, has, num, positional, resolveSource, emit, die } from './common.mjs';
import { validate, CAPTURE_W, CAPTURE_H, CAPTURE_FPS } from '../sandbox.js';

// Two resolution roots on purpose: next to this script (a checkout that ran
// `npm install` here, which is what the skill tells you to do) and the
// working directory (an agent that installed it wherever it happens to be).
const requires = [createRequire(import.meta.url),
                  createRequire(path.join(process.cwd(), 'noop.cjs'))];

/** Chromium, or a clear sentence about how to get one. */
function browser() {
  let pw;
  outer: for (const req of requires) {
    for (const mod of ['playwright-core', 'playwright']) {
      try { pw = req(mod); break outer; } catch { /* next */ }
    }
  }
  if (!pw) {
    die('no playwright. Install it once:\n'
      + '      npm i playwright-core\n'
      + '  and point DWEET_CHROME at a Chromium, or let playwright download one:\n'
      + '      npx playwright-core install chromium\n'
      + '  check.mjs needs none of this — it is the loop to iterate in.');
  }
  const exe = process.env.DWEET_CHROME
    || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
        '/opt/pw-browsers/chromium/chrome-linux/chrome']
      .find((p) => fs.existsSync(p));
  return { pw, exe };
}

/**
 * Serve `bsky/` so `/dweet/sandbox.js` resolves by the same absolute path it
 * does in production — the shipped file, not a copy.
 *
 * `/__host` is a BLANK document, deliberately. Loading the real `/dweet/` page
 * would boot the whole app: a Jetstream socket, profile hydration, five seed
 * frames running. None of that is being tested here and all of it makes the
 * render slower and less reproducible. A blank page on the right origin is
 * everything the module needs.
 */
const HOST_PATH = '/__host';
function serve() {
  const root = path.resolve(ROOT, '..');
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x').pathname;
    if (url === HOST_PATH) {
      res.writeHead(200, { 'content-type': 'text/html' });
      return res.end('<!doctype html><meta charset=utf-8><title>dweet render host</title>');
    }
    const p = path.join(root, decodeURIComponent(url));
    if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) {
      res.writeHead(404); return res.end();
    }
    res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' });
    res.end(fs.readFileSync(p));
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r(
    { server, base: `http://127.0.0.1:${server.address().port}` })));
}

let source;
try { source = await resolveSource(positional(), { lang: arg('--lang') }); }
catch (err) { die(err.message); }
const { src, lang, title, origin } = source;

const v = validate({ src, lang });
if (!v.ok) die(`invalid dweet: ${v.error}`);

const outDir = arg('--out');
const gifOut = arg('--gif');
if (!outDir && !gifOut) die('give --out DIR (PNGs) and/or --gif FILE');

const width = num('--width', CAPTURE_W);
const height = num('--height', CAPTURE_H);
const fps = num('--fps', CAPTURE_FPS);
const at = num('--at', 0);
const frames = Math.max(1, num('--frames', gifOut ? Math.round(2 * fps) : 1));

const { pw, exe } = browser();
const { server, base } = await serve();

const launch = { args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] };
if (exe) launch.executablePath = exe;

let browserInstance;
let shot;
try {
  browserInstance = await pw.chromium.launch(launch);
  const page = await browserInstance.newPage({ viewport: { width: 800, height: 600 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  // Nothing outside the local server. A dweet cannot reach the network from
  // inside the sandbox anyway (`default-src 'none'`), and this makes the run
  // reproducible rather than dependent on what is reachable today.
  await page.route('**/*', (r) => (r.request().url().startsWith(base) ? r.continue() : r.abort()));
  await page.goto(base + HOST_PATH, { waitUntil: 'domcontentloaded' });

  shot = await page.evaluate(async (o) => {
    const { captureFrames } = await import('/dweet/sandbox.js');
    const got = await captureFrames({
      src: o.src, lang: o.lang, at: o.at, seconds: o.frames / o.fps,
      fps: o.fps, width: o.width, height: o.height,
    });
    // Encode in the page: the browser already has a PNG encoder and shipping
    // one to node would be a second implementation to keep correct.
    const canvas = document.createElement('canvas');
    canvas.width = o.width; canvas.height = o.height;
    const ctx = canvas.getContext('2d');
    const out = [];
    for (let i = 0; i < got.frames.length; i++) {
      ctx.putImageData(new ImageData(got.frames[i], o.width, o.height), 0, 0);
      const d = got.frames[i];
      let lit = 0;
      for (let p = 0; p < d.length; p += 4) if (d[p] + d[p + 1] + d[p + 2] > 24) lit++;
      out.push({
        t: o.at + i / o.fps,
        lit,
        pixels: o.width * o.height,
        png: canvas.toDataURL('image/png').split(',')[1],
        rgba: o.wantGif ? Array.from(d) : null,
      });
    }
    return { frames: out };
  }, { src, lang, at, frames, fps, width, height, wantGif: !!gifOut });

  if (pageErrors.length) shot.pageErrors = pageErrors;
} catch (err) {
  await browserInstance?.close();
  server.close();
  // A dweet that throws inside the sandbox arrives here as the frame's own
  // error, already staged and messaged by sandbox.js.
  die(String(err?.message || err).split('\n')[0]);
}
await browserInstance.close();
server.close();

const report = {
  origin, lang, title: title || null, width, height, fps,
  frames: shot.frames.map(({ t, lit, pixels }) => ({ t, lit, pixels, blank: lit === 0 })),
  pageErrors: shot.pageErrors || [],
};

if (outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  shot.frames.forEach((f, i) => {
    fs.writeFileSync(path.join(outDir, `frame-${String(i).padStart(3, '0')}.png`),
      Buffer.from(f.png, 'base64'));
  });
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 1));
  report.out = outDir;
}

if (gifOut) {
  const { encodeGif } = await import('../gif.js');
  const bytes = encodeGif({
    width, height,
    frames: shot.frames.map((f) => Uint8ClampedArray.from(f.rgba)),
    delayMs: 1000 / fps, colors: num('--colors', 128),
  });
  fs.writeFileSync(gifOut, bytes);
  report.gif = { file: gifOut, bytes: bytes.length, frames: shot.frames.length };
}

const blank = report.frames.filter((f) => f.blank).length;
const lines = [`${origin}`, ''];
for (const f of report.frames) {
  lines.push(`  t=${f.t.toFixed(2).padStart(6)}  ${String(f.lit).padStart(8)} lit of ${f.pixels}`
    + (f.blank ? '   <- BLANK' : ''));
}
lines.push('');
if (report.out) lines.push(`  ${shot.frames.length} PNG(s) + report.json in ${report.out}`);
if (report.gif) lines.push(`  ${report.gif.file} — ${(report.gif.bytes / 1024).toFixed(0)} KB, ${report.gif.frames} frames`);
if (report.pageErrors.length) lines.push(`  page errors: ${report.pageErrors.join(' | ')}`);
if (blank === report.frames.length) lines.push('  ** every frame is blank — try --at with a later moment **');

emit(report, lines);
process.exit(blank === report.frames.length || report.pageErrors.length ? 1 : 0);
