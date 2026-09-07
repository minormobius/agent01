#!/usr/bin/env node
// Render astra/index.html to astra/gpt6-astra-hype.webm (1080x1920, VP9 + Opus).
//
// The page's `?render=1` mode does the work: the audio timeline is rendered by
// an OfflineAudioContext, every frame is drawn at an exact timestamp and pushed
// through WebCodecs, and webm-muxer writes the container in-page. This script
// only supplies a headless Chromium and saves the bytes. Nothing here depends
// on wall-clock speed, so the output is identical run to run.
//
//   node astra/record.mjs                 # ~2 min, writes astra/gpt6-astra-hype.webm
//   KBPS=3500 FPS=60 node astra/record.mjs  # heavier, prettier
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, 'gpt6-astra-hype.webm');
const kbps = process.env.KBPS || '1800', fps = process.env.FPS || '30';

let chromium;
try { ({ chromium } = await import('playwright')); }
catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }

// Serve the directory over loopback: a canvas that drew a file:// image is
// "tainted" and WebCodecs refuses to read it, same-origin http is fine.
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.jpg': 'image/jpeg', '.webm': 'video/webm' };
const server = http.createServer((req, res) => {
  const name = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html';
  const file = path.join(here, path.basename(name));
  if (!fs.existsSync(file)) { res.statusCode = 404; return res.end(); }
  res.setHeader('content-type', TYPES[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
}).listen(0, '127.0.0.1');
await new Promise(r => server.once('listening', r));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
page.on('pageerror', e => console.error('[page error]', e.message));
await page.goto(`${origin}/index.html?render=1&fps=${fps}&kbps=${kbps}`);
process.stdout.write('rendering');
let last = 0;
while (true) {
  const st = await page.evaluate(() => ({ p: window.__progress || 0, done: !!window.__done, err: window.__error }));
  if (st.err) { await browser.close(); server.close(); throw new Error('render failed: ' + st.err); }
  if (st.done) break;
  if (st.p - last >= 0.1) { process.stdout.write(` ${Math.round(st.p * 100)}%`); last = st.p; }
  await new Promise(r => setTimeout(r, 1000));
}
const meta = await page.evaluate(() => ({ bytes: window.__done.bytes, frames: window.__done.frames, fps: window.__done.fps }));
const b64 = await page.evaluate(() => window.__done.b64);
await browser.close(); server.close();
fs.writeFileSync(out, Buffer.from(b64, 'base64'));
console.log(`\nwrote ${out}: ${meta.frames} frames @ ${meta.fps} fps, ${(meta.bytes / 1e6).toFixed(1)} MB`);
