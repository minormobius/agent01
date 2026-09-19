// devserver.mjs — serve jev/ locally with a STUBBED /api, so the page can be
// driven in a browser without Cloudflare and without a TypeSafe key.
//
//   node mega/jev/test/devserver.mjs              # offline (no key configured)
//   node mega/jev/test/devserver.mjs --stub-live  # pretend a key is configured
//
// Mounts the site at /jev/ exactly as mega.mino.mobi does, so the relative
// fetches in app.js resolve to the same paths they will in production. / just
// redirects to /jev/.
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
// The surface root: in production mega serves all of `mega/`, not just `mega/jev/`.
const megaRoot = join(root, '..');
const stubLive = process.argv.includes('--stub-live');
const round2 = (v) => Math.round(Math.max(0, Math.min(1, v)) * 100) / 100;
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
  // Vary with the delver's actual state. A stub that returns the same numbers
  // every tick draws flat lines, and flat lines hide bugs — a dead-flat series
  // is what produced a false "r = 1.00" finding before the guard was fixed.
  const st = body.state || {};
  const hp = st.delver?.health_fraction ?? 1;
  const tick = st.delver?.ticks_elapsed ?? 0;
  const creatures = (st.current_room?.creatures_present || []).length;
  const traps = (st.current_room?.traps_present || []).length;
  const loot = (st.current_room?.loot_present || []).length;
  const wob = (k) => 0.5 + 0.5 * Math.sin(tick / k); // a little motion of its own
  // Prefer somewhere NEW and downward. Always taking the first option makes
  // the delver oscillate between two chambers, which earns no experience and
  // leaves levelling, skills and the whole pack untouched in local testing.
  const exits = st.available_exits || [];
  const rank = (o) => {
    const x = exits.find((e) => e.option === o);
    if (!x) return -99;
    return (x.times_entered === 0 ? 10 : 0) + x.descends * 3 - (x.times_entered || 0);
  };
  const opts = Object.keys(qs.move?.criteria || { hold: '' });
  const real = opts.filter((o) => o !== 'hold').sort((a, b) => rank(b) - rank(a));
  const pick = real.length ? real[0] : 'hold';
  const probabilities = {};
  for (const o of opts) probabilities[o] = Number((o === pick ? 0.71 : 0.29 / Math.max(1, opts.length - 1)).toFixed(3));
  const levels = (qs.danger?.criteria || ['a', 'b']).length;
  // the live API returns score probabilities as an OBJECT keyed by level index
  // concentrate the distribution on a level that tracks what is in the room
  const threat = Math.min(levels - 1, creatures + traps > 0 ? 1 + creatures + traps * 0.5 : 0);
  const peak = Math.max(0, Math.min(levels - 1, Math.round(threat)));
  const dangerProbs = Object.fromEntries(
    Array.from({ length: levels }, (_, i) => [String(i), i === peak ? 0.62 : 0.38 / (levels - 1)]),
  );
  const dangerScore = Object.entries(dangerProbs).reduce((a, [i, p]) => a + Number(i) * p, 0);
  // Answer only the questions that were actually asked — engage, use_item and
  // level_up are conditional, and a stub that always emitted them would be
  // answering questions the page never sent.
  const dist = (q, picked) => {
    const keys = Object.keys(q.criteria || {});
    if (!keys.length) return {};
    const lead = keys.length === 1 ? 1 : 0.64;
    return Object.fromEntries(keys.map((k) => [k, Number((k === picked ? lead : (1 - lead) / (keys.length - 1)).toFixed(3))]));
  };
  const answers = {
    move: { type: 'choice', choice: pick, probabilities, confidence: 0.71 },
    danger: {
      type: 'score', score: dangerScore,
      legend: Object.fromEntries(Array.from({ length: levels }, (_, i) => [String(i), `level ${i}`])),
      probabilities: dangerProbs,
      confidence: 0.66,
    },

    take_loot: { type: 'noul', noul: round2(loot ? 0.55 + 0.4 * hp : 0.12 + 0.1 * wob(7)) },
    withdraw: { type: 'noul', noul: round2(Math.max(0.05, 0.95 - hp - 0.08 * wob(4))) },
  };

  if (qs.engage) {
    const keys = Object.keys(qs.engage.criteria);
    const want = hp > 0.6 ? ['melee', 'shoot', 'avoid'] : ['shoot', 'avoid', 'melee'];
    const p = want.find((k) => keys.includes(k)) || keys[0];
    answers.engage = { type: 'choice', choice: p, probabilities: dist(qs.engage, p), confidence: round2(0.5 + 0.45 * wob(5)) };
  }
  if (qs.use_item) {
    const keys = Object.keys(qs.use_item.criteria);
    const want = hp < 0.5 ? ['potion', 'ward', 'arrow', 'rope', 'none'] : ['none'];
    const p = want.find((k) => keys.includes(k)) || 'none';
    answers.use_item = { type: 'choice', choice: p, probabilities: dist(qs.use_item, p), confidence: 0.72 };
  }
  if (qs.level_up) {
    const keys = Object.keys(qs.level_up.criteria);
    const p = keys[Math.floor(wob(3) * keys.length) % keys.length];
    answers.level_up = { type: 'choice', choice: p, probabilities: dist(qs.level_up, p), confidence: 0.6 };
  }

  // ANY QUESTION THE DELVE STUB DOES NOT KNOW still gets a shaped answer.
  //
  // The stub was written for the dungeon's five questions, so every later
  // sub-site — the lab, and now the composer — got an empty `answers` object
  // and a loop that correctly reported "no choice" and stopped. That is the
  // right behaviour from the caller and a useless dev server.
  //
  // It answers from the criteria ALONE and is deliberately dumb: for a choice
  // it takes the option whose description reads best against the question's
  // own words, which is nothing like judgement. It exists to prove the page
  // renders a real response shape, never to stand in for the model — the live
  // banner still says `typesafe` only because that is what the worker stamps,
  // and every page here repeats which source produced its numbers.
  for (const [id, q] of Object.entries(qs)) {
    if (answers[id] !== undefined) continue;
    if (q?.type === 'choice') {
      const keys = Object.keys(q.criteria || {});
      if (!keys.length) continue;
      // Prefer the option whose description contains the smallest stated
      // number, which on a "smallest gap" question is usually sane and on
      // anything else is arbitrary — as a stand-in should be.
      const num = (k) => {
        const m = String(q.criteria[k]).match(/to (\d+\.\d+)/);
        return m ? Number(m[1]) : Number.POSITIVE_INFINITY;
      };
      const ranked = [...keys].sort((a, b) => num(a) - num(b));
      const choice = Number.isFinite(num(ranked[0])) ? ranked[0] : keys[tick % keys.length];
      const probs = {};
      for (const k of keys) probs[k] = Number((k === choice ? 0.62 : 0.38 / Math.max(1, keys.length - 1)).toFixed(3));
      answers[id] = { choice, probabilities: probs, confidence: 0.62 };
    } else if (q?.type === 'noul') {
      answers[id] = { noul: Number(wob(7).toFixed(2)) };
    } else if (q?.type === 'score') {
      const n = (q.criteria || ['a', 'b']).length;
      const at = Math.min(n - 1, Math.round(wob(5) * (n - 1)));
      const probs = {};
      for (let i = 0; i < n; i++) probs[String(i)] = i === at ? 0.8 : Number((0.2 / Math.max(1, n - 1)).toFixed(3));
      answers[id] = { score: at, legend: q.criteria?.[at] ?? String(at), probabilities: probs, confidence: 0.6 };
    }
  }
  return { model: 'jev-latest', answers, usage: { input_tokens: 486, output_tokens: 52 } };
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  const send = (code, type, body) => {
    res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' });
    res.end(body);
  };

  if (url.pathname === '/' || url.pathname === '') {
    res.writeHead(302, { location: '/jev/' });
    return res.end();
  }

  if (url.pathname === '/jev/api/health') {
    return send(200, TYPES['.json'], JSON.stringify({ ok: true, configured: stubLive, model: 'jev-latest' }));
  }

  if (url.pathname === '/jev/api/ask') {
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

  // Paths OUTSIDE /jev/ are served from the mega surface root, because in
  // production they are: mega's `assets.directory` is ".", so /jev/composer/
  // importing ../../sprite/quad/quad.js resolves. Serving only mega/jev/ here
  // made the composer impossible to test locally while working live — a
  // sub-site that cannot be run in the dev server is a sub-site nobody checks
  // before deploying.
  const inJev = url.pathname === '/jev' || url.pathname.startsWith('/jev/');
  const base = inJev ? root : megaRoot;
  let p = normalize(inJev ? url.pathname.replace(/^\/jev/, '') : url.pathname)
    .replace(/^(\.\.[/\\])+/, '');
  // A directory resolves to its index, at any depth. Workers Static Assets
  // does this in production, so a dev server that only did it at the root
  // 404'd /jev/composer/ — the page served fine by its full filename and not
  // at all by the URL anyone actually visits.
  if (p === '/' || p === '' || p === '\\') p = '/index.html';
  else if (p.endsWith('/')) p += 'index.html';
  else if (!p.slice(p.lastIndexOf('/')).includes('.')) p += '/index.html';
  const file = join(base, p);
  // Still confined: the jev tree for /jev/*, the mega tree for everything else.
  if (!file.startsWith(base)) return send(403, 'text/plain', 'forbidden');
  try {
    const ext = file.slice(file.lastIndexOf('.'));
    send(200, TYPES[ext] || 'application/octet-stream', await readFile(file));
  } catch {
    send(404, 'text/plain', 'not found');
  }
}).listen(port, () => {
  console.log(`jev dev server on http://localhost:${port} (${stubLive ? 'stub-live' : 'offline'} mode)`);
});
