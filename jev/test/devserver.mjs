// devserver.mjs — serve jev/ locally with a STUBBED /api, so the page can be
// driven in a browser without Cloudflare and without a TypeSafe key.
//
//   node jev/test/devserver.mjs              # offline mode (no key configured)
//   node jev/test/devserver.mjs --stub-live  # pretend a key is configured and
//                                            # return canned jev-shaped answers
//
// --stub-live exercises the LIVE rendering path. The answers it returns are
// canned, not Jev's; it exists to prove the page renders a real response
// correctly, not to stand in for the model.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const stubLive = process.argv.includes('--stub-live');
const port = Number(process.argv.find((a) => a.startsWith('--port='))?.split('=')[1] || 8787);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

// A canned response in Jev's documented shape, keyed off the questions asked
// so the page gets a valid option back whatever room it is in.
function cannedAnswers(body) {
  const qs = body.questions || {};
  const opts = Object.keys(qs.move?.criteria || { hold: '' });
  const real = opts.filter((o) => o !== 'hold');
  const pick = real.length ? real[0] : 'hold';
  const probabilities = {};
  for (const o of opts) probabilities[o] = Number((o === pick ? 0.71 : 0.29 / Math.max(1, opts.length - 1)).toFixed(3));
  const levels = (qs.danger?.criteria || ['a', 'b']).length;
  return {
    model: 'jev-latest',
    answers: {
      move: { type: 'choice', choice: pick, probabilities, confidence: 0.71 },
      danger: {
        type: 'score', score: 1.4,
        legend: Object.fromEntries(Array.from({ length: levels }, (_, i) => [String(i), `level ${i}`])),
        probabilities: Array.from({ length: levels }, (_, i) => (i === 1 ? 0.6 : 0.4 / (levels - 1))),
        confidence: 0.66,
      },
      fight: { type: 'noul', noul: 0.72 },
      take_loot: { type: 'noul', noul: 0.91 },
      withdraw: { type: 'noul', noul: 0.18 },
    },
    usage: { input_tokens: 486, output_tokens: 52 },
  };
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  const send = (code, type, body) => {
    res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' });
    res.end(body);
  };

  if (url.pathname === '/api/health') {
    return send(200, TYPES['.json'], JSON.stringify({ ok: true, configured: stubLive, model: 'jev-latest' }));
  }

  if (url.pathname === '/api/ask') {
    if (!stubLive) {
      return send(503, TYPES['.json'], JSON.stringify({ error: 'no_api_key', detail: 'dev server has no key' }));
    }
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw || '{}');
    const out = cannedAnswers(body);
    out.source = 'typesafe'; // what the real worker stamps
    out.latency_ms = 88;
    return send(200, TYPES['.json'], JSON.stringify(out));
  }

  let p = normalize(url.pathname).replace(/^(\.\.[/\\])+/, '');
  if (p === '/' || p === '\\') p = '/index.html';
  const file = join(root, p);
  if (!file.startsWith(root)) return send(403, 'text/plain', 'forbidden');
  try {
    const ext = file.slice(file.lastIndexOf('.'));
    send(200, TYPES[ext] || 'application/octet-stream', await readFile(file));
  } catch {
    send(404, 'text/plain', 'not found');
  }
}).listen(port, () => {
  console.log(`jev dev server on http://localhost:${port} (${stubLive ? 'stub-live' : 'offline'} mode)`);
});
