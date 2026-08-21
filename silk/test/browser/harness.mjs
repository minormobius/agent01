// harness.mjs — the two lines of setup every browser test in here needs.
//
// Not a framework. A static server for silk/, a Playwright resolver that works
// whether Playwright is installed locally or globally, and a pass/fail counter.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));   // silk/

const MIME = {
  '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

/** Serve silk/ on 127.0.0.1:port. Returns { url, close }. */
export async function serveSilk(port) {
  const server = createServer(async (q, r) => {
    let p = decodeURIComponent(q.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    try {
      const body = await readFile(join(ROOT, p));
      r.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
      r.end(body);
    } catch { r.writeHead(404); r.end('not here'); }
  });
  await new Promise((res) => server.listen(port, '127.0.0.1', res));
  return { url: `http://127.0.0.1:${port}`, close: () => server.close() };
}

/**
 * Bare `import('playwright')` ignores NODE_PATH, which is how a global install
 * is usually found. Resolve through require() first, which does honour it.
 * Returns null if Playwright is not installed — the caller should exit 2.
 */
export async function getChromium() {
  try {
    const { createRequire } = await import('node:module');
    const req = createRequire(import.meta.url);
    let mod;
    try { mod = await import(pathToFileURL(req.resolve('playwright')).href); }
    catch { mod = await import('playwright'); }
    // require() resolves the package's CJS entry, whose named exports are not
    // always detected — so take `chromium` from either shape.
    return mod.chromium || mod.default?.chromium || null;
  } catch { return null; }
}

export function noPlaywright() {
  console.error('needs playwright: npm i -D playwright && npx playwright install chromium');
  console.error('(a global install works too: NODE_PATH=/path/to/node_modules node <this file>)');
  process.exit(2);
}

/** A pass/fail tally that prints as it goes and exits non-zero on any failure. */
export function checker(title) {
  let pass = 0;
  const fails = [];
  const ok = (name, cond) => {
    if (cond) { pass++; console.log(`  ✓ ${name}`); }
    else { fails.push(name); console.log(`  ✗ ${name}`); }
  };
  ok.group = (name) => console.log(`\n${name}`);
  ok.done = () => {
    console.log(fails.length
      ? `\n✗ ${title} FAILED — ${fails.length} of ${pass + fails.length}:\n  ${fails.join('\n  ')}`
      : `\n✓ ${title} passed (${pass} checks)`);
    process.exit(fails.length ? 1 : 0);
  };
  return ok;
}
