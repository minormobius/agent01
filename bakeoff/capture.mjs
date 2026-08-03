#!/usr/bin/env node
// capture.mjs — drive an entry in a real browser and come back with evidence.
//
//   node bakeoff/capture.mjs <entry-dir> [--out <dir>] [--json]
//
// On an open-ended "build me a game" brief the most common failure is not a
// wrong answer, it is an entry that never draws a pixel. Nothing static can
// tell you that. So every entry is booted in headless Chromium with WebGPU
// (SwiftShader/ANGLE — verified working: a real adapter, no server, file:// is
// enough) and asked to prove it is alive:
//
//   • no uncaught page errors
//   • the composited frame is not a flat rectangle of one colour
//   • the picture CHANGES between frames — it is animating, not frozen
//   • window.__inpacState() reports a race clock that advances
//
// It also grabs a FILMSTRIP (3 frames over ~12s) rather than one screenshot,
// because a race is about motion and a running HUD; one frame shows a pose,
// three show pace.
//
// WHAT THIS CANNOT DO: see the 3D view. Headless Chromium does not composite
// the WebGPU surface into a screenshot — measured, see frameStats below. This
// harness proves an entry is ALIVE and shows its UI; it says nothing about how
// the game looks. That judgement belongs to a human in the arena, where a real
// GPU renders it.
//
// THE SEAM. INPAC opens on a START menu, and every entry will invent its own,
// so there is no click this harness could hardcode. The brief therefore
// requires `?autostart=1` and a `window.__inpacState()` contract — the same
// move that made the physics scoreable. An entry that ignores the seam is not
// punished for taste; it fails the gate, which is exactly right, because we
// cannot see it at all.

import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Frame times (ms from load). First is late enough for a cold WebGPU pipeline
// build; the last two are far enough apart that a frozen frame is obvious.
export const FRAME_TIMES = [2500, 6500, 12000];
const NAV_TIMEOUT = 45_000;

async function launch() {
  // playwright-core if the environment already has browsers (this sandbox ships
  // them at PLAYWRIGHT_BROWSERS_PATH); plain playwright otherwise.
  let chromium;
  try { ({ chromium } = await import('playwright-core')); }
  catch { ({ chromium } = await import('playwright')); }

  const opts = {
    args: [
      // WebGPU in headless needs to be asked for explicitly, and needs a
      // software backend on a CI runner with no GPU.
      '--enable-unsafe-webgpu',
      '--enable-features=Vulkan,UseSkiaRenderer',
      '--use-angle=swiftshader',
      '--use-gl=angle',
      '--no-sandbox',
      '--disable-dev-shm-usage',
    ],
  };
  const bundled = process.env.PLAYWRIGHT_BROWSERS_PATH
    ? join(process.env.PLAYWRIGHT_BROWSERS_PATH, 'chromium')
    : null;
  if (bundled && existsSync(bundled)) opts.executablePath = bundled;

  return chromium.launch(opts);
}

// MEASURED LIMIT — READ THIS BEFORE "IMPROVING" THIS FUNCTION.
//
// You cannot read the 3D view. Two independent routes both fail:
//
//   1. drawImage(webgpuCanvas) in-page returns blank — WebGPU canvas contents
//      are transient and do not survive being drawn into a 2D context.
//   2. The compositor does not put the WebGPU surface into a headless
//      screenshot AT ALL. Confirmed against 5 flag combinations
//      (swiftshader/ANGLE, Vulkan, --enable-gpu --in-process-gpu, GL,
//      defaults); the ones that produce a working adapter still screenshot the
//      3D region as empty page background.
//
// So this measures the COMPOSITED FRAME MINUS the 3D view: HUD, minimap,
// menus, overlays, DOM chrome. That is enough to prove the entry is ALIVE — a
// moving minimap dot and a ticking clock cannot happen in a dead page — and it
// is real evidence about UI craft. It is NOT evidence about how the game
// looks. Visual judgement happens in the arena, in a browser with a real GPU,
// by a human. Do not let a green capture be reported as "it looks good".
//
// Stats come from the screenshot buffer round-tripped back into the page as an
// image, which is the only route that sees what the compositor actually
// produced, and needs no image-decoding dependency.
async function frameStats(page, pngBuffer) {
  const b64 = pngBuffer.toString('base64');
  return page.evaluate(async (data) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + data;
    try { await img.decode(); } catch { return { readable: false }; }
    const w = 192, h = 120;
    const off = document.createElement('canvas');
    off.width = w; off.height = h;
    const ctx = off.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h).data;
    let sum = 0, sumSq = 0, n = 0;
    const sig = [];
    for (let i = 0; i < d.length; i += 4) {
      const lum = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      sum += lum; sumSq += lum * lum; n++;
      sig.push(Math.round(lum));
    }
    const mean = sum / n;
    return {
      readable: true,
      mean: +mean.toFixed(2),
      stdev: +Math.sqrt(Math.max(0, sumSq / n - mean * mean)).toFixed(2),
      sig,
    };
  }, b64);
}

// How different are two frames? MEAN difference is the wrong statistic here:
// most of the frame is static chrome, so a minimap dot crossing a few pixels
// averages away to nothing (measured: 0.007 on a demonstrably running game).
// What actually distinguishes "running" from "frozen" is that SOME pixels move
// a LOT — so count the fraction that changed materially, and keep the largest
// single change.
function frameDelta(a, b) {
  if (!a?.sig || !b?.sig) return { changedFrac: 0, maxDelta: 0 };
  const n = Math.min(a.sig.length, b.sig.length);
  if (!n) return { changedFrac: 0, maxDelta: 0 };
  let changed = 0, maxDelta = 0;
  for (let i = 0; i < n; i++) {
    const d = Math.abs(a.sig[i] - b.sig[i]);
    if (d > 8) changed++;
    if (d > maxDelta) maxDelta = d;
  }
  return { changedFrac: +(changed / n).toFixed(5), maxDelta };
}

async function readState(page) {
  return page.evaluate(() => {
    if (typeof window.__inpacState !== 'function') return { missing: true };
    try {
      const s = window.__inpacState();
      if (!s || typeof s !== 'object') return { badShape: String(s) };
      return {
        running: s.running,
        timeMs: s.timeMs,
        lap: s.lap,
        laps: s.laps,
        bestMs: s.bestMs === undefined ? null : s.bestMs,
      };
    } catch (e) {
      return { threw: String(e).slice(0, 200) };
    }
  });
}

export async function capture(entryDir, outDir) {
  const dir = resolve(entryDir);
  // Default to a TEMP dir, never a sibling of the entry. Scoring a path inside
  // the repo (which is exactly what an agent does while iterating) must not
  // drop screenshots into a surface directory — that pollutes the working tree
  // and lands in the entry's own diff. Persistence is opt-in via --out, which
  // run-cell.sh always passes.
  const out = outDir
    ? resolve(outDir)
    : mkdtempSync(join(tmpdir(), 'inpac-capture-'));
  mkdirSync(out, { recursive: true });

  const result = {
    ok: false,
    pageErrors: [],
    consoleErrors: [],
    frames: [],
    states: [],
    webgpu: null,
    hasCanvas: false,
    drew: false,
    animated: false,
    autostarted: false,
    clockAdvanced: false,
    alive: false,
    maxFrameDelta: 0,
    changedFrac: 0,
    error: null,
  };

  const indexPath = join(dir, 'index.html');
  if (!existsSync(indexPath)) {
    result.error = 'index.html not found';
    return result;
  }

  let browser;
  try {
    browser = await launch();
    const page = await browser.newPage({ viewport: { width: 960, height: 600 } });

    page.on('pageerror', (e) => {
      if (result.pageErrors.length < 10) result.pageErrors.push(String(e).slice(0, 300));
    });
    page.on('console', (m) => {
      if (m.type() === 'error' && result.consoleErrors.length < 10) {
        result.consoleErrors.push(m.text().slice(0, 300));
      }
    });

    // ?autostart=1 is the contract: begin play with no input. We send NO clicks
    // and NO keys anywhere in this harness — if an entry needs a human to get
    // going, it cannot be captured, and that is a gate failure, not bad luck.
    const url = `${pathToFileURL(indexPath).href}?autostart=1`;
    await page.goto(url, { waitUntil: 'load', timeout: NAV_TIMEOUT });

    result.webgpu = await page.evaluate(async () => {
      if (!navigator.gpu) return 'no navigator.gpu';
      try {
        const a = await navigator.gpu.requestAdapter();
        return a ? 'adapter OK' : 'no adapter';
      } catch (e) { return 'adapter threw: ' + String(e).slice(0, 120); }
    });

    let prev = 0;
    for (const [i, t] of FRAME_TIMES.entries()) {
      await page.waitForTimeout(t - prev);
      prev = t;
      const name = `frame-${i + 1}.png`;
      let buf = null;
      try {
        buf = await page.screenshot({ path: join(out, name) });
      } catch { /* recorded as an unreadable frame below */ }
      const stats = buf
        ? await frameStats(page, buf).catch(() => ({ readable: false }))
        : { readable: false };
      const hasCanvas = await page.evaluate(() => !!document.querySelector('canvas')).catch(() => false);
      const state = await readState(page).catch(() => ({ threw: 'evaluate failed' }));
      result.frames.push({ t, file: name, hasCanvas, ...stats });
      result.states.push({ t, ...state });
    }

    const shots = result.frames.filter((f) => f.readable);
    result.hasCanvas = result.frames.some((f) => f.hasCanvas);
    // "Drew something": at least one frame has real tonal variation. A uniform
    // field (all black, all white) has a stdev near zero.
    result.drew = shots.some((f) => f.stdev > 3);
    // "Animated": consecutive frames differ. Catches the render loop that threw
    // on frame 2 and left a correct-looking still on screen.
    let bestChanged = 0, bestMax = 0;
    for (let i = 1; i < shots.length; i++) {
      const d = frameDelta(shots[i - 1], shots[i]);
      bestChanged = Math.max(bestChanged, d.changedFrac);
      bestMax = Math.max(bestMax, d.maxDelta);
    }
    result.changedFrac = bestChanged;
    result.maxFrameDelta = bestMax;
    // A frozen page produces BYTE-IDENTICAL frames: changed=0, peak=0. A live
    // one always produces something. The discriminator is zero-vs-nonzero, not
    // magnitude — measured peaks on the same running page ranged 23..163
    // depending only on where the player happened to be, so any threshold
    // tuned to magnitude fails identical entries at random. (It did: two
    // identical good entries, one passed at Δ163 and one failed at Δ23.)
    result.animated = bestMax >= 12 || bestChanged >= 0.0001;

    const states = result.states.filter((s) => !s.missing && !s.threw && !s.badShape);
    result.autostarted = states.some((s) => s.running === true);
    const times = states.map((s) => s.timeMs).filter((n) => typeof n === 'number');
    result.clockAdvanced = times.length >= 2 && times[times.length - 1] > times[0];

    // LIVENESS, the gating signal. Pixel motion alone is weak evidence here —
    // we cannot see the 3D view, so a good game with a calm HUD can look still.
    // The race clock advancing is strong, contract-based evidence. Either one
    // proves the page is running; needing both would punish design choices we
    // cannot even observe.
    result.alive = result.animated || result.clockAdvanced;

    result.ok = true;
  } catch (e) {
    result.error = String(e?.message || e).slice(0, 500);
  } finally {
    await browser?.close().catch(() => {});
  }

  writeFileSync(join(out, 'capture.json'), JSON.stringify(result, null, 2));
  return result;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');
  const outIdx = args.indexOf('--out');
  // Skip the value that belongs to --out, but ONLY when --out is actually
  // present: with outIdx === -1, args[outIdx + 1] is args[0], which is the
  // directory itself.
  const outVal = outIdx >= 0 ? args[outIdx + 1] : null;
  const dir = args.find((a) => !a.startsWith('--') && a !== outVal);
  if (!dir) { console.error('usage: capture.mjs <entry-dir> [--out <dir>] [--json]'); process.exit(2); }
  const res = await capture(dir, outIdx >= 0 ? args[outIdx + 1] : undefined);
  if (asJson) { console.log(JSON.stringify(res, null, 2)); }
  else {
    console.log(`\n  ${dir}`);
    console.log(`  webgpu        ${res.webgpu}`);
    console.log(`  canvas        ${res.hasCanvas}`);
    console.log(`  drew          ${res.drew}`);
    console.log(`  alive         ${res.alive}`);
    console.log(`   · pixels     ${res.animated} (${(res.changedFrac * 100).toFixed(3)}% moved, peak Δ${res.maxFrameDelta})`);
    console.log(`  autostarted   ${res.autostarted}`);
    console.log(`  clock advanced ${res.clockAdvanced}`);
    console.log(`  page errors   ${res.pageErrors.length ? res.pageErrors[0] : 'none'}`);
    if (res.error) console.log(`  ERROR         ${res.error}`);
    console.log();
  }
}
