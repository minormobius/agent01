#!/usr/bin/env node
// eyes-mcp.mjs — let the builder see and drive the page it is writing.
//
//   claude -p … --mcp-config '{"mcpServers":{"eyes":{"command":"node","args":["bakeoff/buildabot/eyes-mcp.mjs"],
//                              "env":{"EYES_SITE_DIR":"<site dir>"}}}}'
//
// WHY. Mining every lab-request follow-up (336 request commits, 2026-07 → 09)
// found that 29% of the complaints about a first build were visible in one
// screenshot of the page (subject off-screen, dominos 90° off, "nothing
// renders") and another 24% needed someone to press a key or watch it move
// (pieces 10x too fast, inverted pan, text selected on button hold). The
// production builder has neither: no Bash, no browser, and the harness's smoke
// test uses its one screenshot only to check for blankness.
//
// Giving the agent Bash would fix that and open everything else (the runner's
// credential, the network). This gives it exactly eyes and hands on its own
// page, nothing more — three MCP tools over a headless Chrome pointed at the
// site directory, served by lib/headless.mjs's serveTenant with the PRODUCTION
// CSP and error collector, so what it sees is what lab-smoke sees:
//
//   look    screenshot at a viewport, plus every error the page reported
//   drive   a script of clicks, keys, drags, wheel, waits and shots
//   watch   a filmstrip: N frames at an interval, to see motion
//
// A hand-rolled MCP stdio server (JSON-RPC, one message per line) — no SDK, no
// dependency but playwright-core, which the workflow installs.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import readline from 'node:readline';

// headless.mjs comes from THIS checkout (the factory branch's lab-smoke.mjs
// predates it and inlines the same server). EYES_ROOT is the checkout the
// builder works in, whose lab/_kit is the one production serves; serveTenant
// resolves lab/_kit against the cwd, so chdir there. Default: this repo.
const RIG = resolve(new URL('../..', import.meta.url).pathname);
const ROOT = resolve(process.env.EYES_ROOT || RIG);
const { serveTenant, findChrome } = await import(join(RIG, 'scripts/lib/headless.mjs'));
process.chdir(ROOT);

const SITE = resolve(process.env.EYES_SITE_DIR || '.');
const MAX_SHOTS = 8;

async function loadPlaywright() {
  const req = createRequire(import.meta.url);
  const tries = ['playwright-core', 'playwright'];
  let groot = '';
  try { groot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim(); } catch {}
  for (const name of tries) {
    for (const from of [null, groot && join(groot, name)]) {
      try { return from ? req(from) : req(name); } catch {}
    }
  }
  throw new Error('playwright-core is not installed (npm i -g playwright-core)');
}

let browser = null;
let server = null;
let port = 0;
async function ensure() {
  if (!browser) {
    const { chromium } = await loadPlaywright();
    const exe = findChrome();
    browser = await chromium.launch({
      executablePath: exe || undefined,
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
    });
  }
  if (!server) {
    server = serveTenant(SITE);
    port = await server.listen();
  }
}

// One fresh page per call, so a call's errors are that call's.
async function withPage({ path = '/', width = 1280, height = 800, mobile = false }, fn) {
  await ensure();
  if (!existsSync(join(SITE, 'index.html'))) throw new Error(`no index.html in the site yet (${SITE})`);
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    isMobile: !!mobile,
    hasTouch: !!mobile,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    // Chrome's own "Failed to load resource" line names no URL; the response handler below does
    if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) errors.push(`console.error: ${m.text()}`);
  });
  page.on('response', (r) => {
    const u = r.url().replace(`http://127.0.0.1:${port}`, '');
    if (r.status() >= 400 && u !== '/favicon.ico') errors.push(`HTTP ${r.status()}: ${u}`);
  });
  page.on('requestfailed', (r) => errors.push(`request failed: ${r.url().replace(`http://127.0.0.1:${port}`, '')} (${r.failure()?.errorText})`));
  try {
    // Agents pass repo paths ("lab/www/<slug>/index.html"); the site root is "/".
    let p = String(path || '/').replace(/^\/+/, '');
    const base = SITE.split('/').pop();
    const at = p.indexOf(base + '/');
    if (at >= 0) p = p.slice(at + base.length + 1);
    else if (p === base) p = '';
    const url = `http://127.0.0.1:${port}/${p}`;
    const resp = await page.goto(url, { waitUntil: 'load', timeout: 20000 });
    if (resp && resp.status() === 404) throw new Error(`/${p} is not a page in your site. Omit "path" to load your index.html.`);
    await page.waitForTimeout(600);
    const out = await fn(page);
    // the injected collector records CSP violations and failed fetches in the DOM
    const collected = await page
      .$$eval('[data-labsmoke]', (els) => els.map((e) => e.getAttribute('data-labsmoke') + ': ' + e.textContent))
      .catch(() => []);
    return { ...out, errors: [...new Set([...errors, ...collected])] };
  } finally {
    await ctx.close();
  }
}

const shot = async (page) => (await page.screenshot({ type: 'png' })).toString('base64');

async function look(a) {
  return withPage(a, async (page) => {
    if (a.wait_ms) await page.waitForTimeout(Math.min(a.wait_ms, 15000));
    return { shots: [await shot(page)], notes: [`${a.width || 1280}×${a.height || 800}${a.mobile ? ' mobile' : ''}`] };
  });
}

async function watch(a) {
  const count = Math.max(2, Math.min(a.count || 4, MAX_SHOTS));
  const every = Math.max(50, Math.min(a.interval_ms || 500, 5000));
  return withPage(a, async (page) => {
    const shots = [];
    const notes = [];
    for (let i = 0; i < count; i++) {
      if (i) await page.waitForTimeout(every);
      shots.push(await shot(page));
      notes.push(`frame ${i + 1} at +${i * every} ms`);
    }
    return { shots, notes };
  });
}

async function drive(a) {
  const steps = Array.isArray(a.steps) ? a.steps.slice(0, 60) : [];
  return withPage(a, async (page) => {
    const shots = [];
    const notes = [];
    for (const [i, s] of steps.entries()) {
      try {
        if (s.click) await page.mouse.click(s.click[0], s.click[1]);
        else if (s.click_selector) await page.click(s.click_selector, { timeout: 3000 });
        else if (s.key) {
          if (s.hold_ms) { await page.keyboard.down(s.key); await page.waitForTimeout(Math.min(s.hold_ms, 5000)); await page.keyboard.up(s.key); }
          else await page.keyboard.press(s.key);
        } else if (s.type) await page.keyboard.type(String(s.type));
        else if (s.drag) {
          const [[x0, y0], [x1, y1]] = s.drag;
          await page.mouse.move(x0, y0); await page.mouse.down();
          await page.mouse.move(x1, y1, { steps: 12 }); await page.mouse.up();
        } else if (s.wheel) { await page.mouse.move(s.wheel.x ?? 640, s.wheel.y ?? 400); await page.mouse.wheel(0, s.wheel.dy || 0); }
        else if (s.wait) await page.waitForTimeout(Math.min(s.wait, 10000));
        else if (s.eval) {
          const v = await page.evaluate((src) => { try { return JSON.stringify((0, eval)(src)); } catch (e) { return 'threw: ' + e.message; } }, String(s.eval));
          notes.push(`step ${i + 1} eval ${JSON.stringify(s.eval).slice(0, 80)} → ${String(v).slice(0, 400)}`);
        }
        if (s.shot && shots.length < MAX_SHOTS) { shots.push(await shot(page)); notes.push(`shot ${shots.length} after step ${i + 1}`); }
      } catch (e) {
        notes.push(`step ${i + 1} failed: ${e.message.split('\n')[0]}`);
      }
    }
    if (!shots.length) { shots.push(await shot(page)); notes.push('final shot'); }
    return { shots, notes };
  });
}

const VIEW = {
  path: { type: 'string', description: 'OMIT for your index.html. Only for another page inside your own site dir, relative to it (e.g. "about.html")' },
  width: { type: 'integer', description: 'viewport width, default 1280' },
  height: { type: 'integer', description: 'viewport height, default 800' },
  mobile: { type: 'boolean', description: 'phone emulation (touch, mobile UA); pair with width 390, height 844' },
};
const TOOLS = [
  {
    name: 'look',
    description:
      'Load your page in headless Chrome (production CSP, software WebGL) and return a screenshot plus every error it reported. Use it after every meaningful change: check the subject is in frame, legible, the right way up, and that the page is not blank.',
    inputSchema: { type: 'object', properties: { ...VIEW, wait_ms: { type: 'integer', description: 'extra wait before the shot (max 15000)' } } },
    run: look,
  },
  {
    name: 'watch',
    description: 'Return a filmstrip of your page: `count` screenshots (2–8) `interval_ms` apart. Use it to check that animation runs, at a sane speed, and that nothing drifts, sinks or explodes.',
    inputSchema: { type: 'object', properties: { ...VIEW, count: { type: 'integer' }, interval_ms: { type: 'integer' } } },
    run: watch,
  },
  {
    name: 'drive',
    description:
      'Play your page like a user. `steps` is a list; each step is one of {click:[x,y]}, {click_selector:"css"}, {key:"ArrowLeft", hold_ms?}, {type:"text"}, {drag:[[x0,y0],[x1,y1]]}, {wheel:{dy,x?,y?}}, {wait:ms}, {eval:"js expression"} (returns its JSON value), and any step may add shot:true to screenshot after it (max 8). Use it to test controls do what they say, in the direction they say, and that holding a button does not select text.',
    inputSchema: { type: 'object', properties: { ...VIEW, steps: { type: 'array', items: { type: 'object' } } }, required: ['steps'] },
    run: drive,
  },
];

function reply(id, result) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n'); }
function fail(id, code, message) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n'); }

async function handle(msg) {
  const { id, method, params } = msg;
  if (method === 'initialize') {
    return reply(id, {
      protocolVersion: params?.protocolVersion || '2025-06-18',
      capabilities: { tools: {} },
      serverInfo: { name: 'eyes', version: '1.0.0' },
    });
  }
  if (method === 'tools/list') return reply(id, { tools: TOOLS.map(({ run, ...t }) => t) });
  if (method === 'tools/call') {
    const t = TOOLS.find((x) => x.name === params?.name);
    if (!t) return fail(id, -32602, `unknown tool ${params?.name}`);
    try {
      const r = await t.run(params.arguments || {});
      const text = [...r.notes, r.errors.length ? `errors (${r.errors.length}):\n` + r.errors.slice(0, 30).join('\n') : 'errors: none'].join('\n');
      return reply(id, { content: [{ type: 'text', text }, ...r.shots.map((data) => ({ type: 'image', data, mimeType: 'image/png' }))] });
    } catch (e) {
      return reply(id, { content: [{ type: 'text', text: `eyes failed: ${e.message}` }], isError: true });
    }
  }
  if (method === 'ping') return reply(id, {});
  if (id !== undefined && id !== null) return fail(id, -32601, `method not found: ${method}`);
}

const rl = readline.createInterface({ input: process.stdin });
const pending = new Set();
rl.on('line', (line) => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  const p = handle(msg).catch((e) => fail(msg.id, -32603, e.message)).finally(() => pending.delete(p));
  pending.add(p);
});
rl.on('close', async () => {
  await Promise.allSettled(pending);
  await browser?.close().catch(() => {});
  server?.close();
  process.exit(0);
});
