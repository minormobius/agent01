#!/usr/bin/env node
// flush-held.mjs — post what waited for the house (Modulo, 2026-10-13: "hold any post that links our
// house until the link answers 200").
//
//   node flush-held.mjs --run runs/<run> [--town <file>] [--wait <seconds>]
//
// A town day holds a draft whose miniphim.minomobi.com link doesn't answer 200 yet (town-run.mjs
// townAfter); the pages deploy only after the run ends. whetstone.yml runs this after dispatching the
// deploy: it waits (up to --wait) until every held link answers 200, then runs townAfter again on the
// run's commons, which publishes what is now ready under the same rules (its yes, the caps, the veto),
// and writes town/sent.jsonl, town/held.json and the outbox back into runs/<run>/commons for the commit.
// --town is the day's inbox, saved by run.mjs to the runner's temp dir, so replies can be decided too.
// Prints one JSON line.
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readTree } from './lib/commons.mjs';
import { townAfter, linkStatus } from './lib/town-run.mjs';

export async function flushHeld({ runDir, town = null, password, waitMs = 0, pollMs = 20_000, checkLink = linkStatus, publishImpl, now = () => new Date().toISOString() }) {
  const dir = join(runDir, 'commons');
  const commons = readTree(dir);
  let held = [];
  try { held = JSON.parse(commons['town/held.json'] || '{}').held || []; } catch { held = []; }
  const urls = [...new Set(held.filter((h) => h.link_wait).flatMap((h) => h.link_wait))];
  if (!urls.length) return { flushed: 0, note: 'nothing waits for the house' };
  const until = Date.now() + waitMs;
  let codes = {};
  for (;;) {
    codes = Object.fromEntries(await Promise.all(urls.map(async (u) => [u, await checkLink(u)])));
    if (Object.values(codes).every((c) => c === 200) || Date.now() >= until) break;
    await new Promise((r) => setTimeout(r, pollMs));
  }
  if (!Object.values(codes).some((c) => c === 200)) return { flushed: 0, waited: codes, note: 'no held link is up yet: they wait for the next town day' };
  const before = Object.fromEntries(Object.entries(commons).filter(([k]) => k.startsWith('town/')));
  const res = await townAfter(commons, { town, password, now: now(), checkLink, ...(publishImpl ? { publishImpl } : {}) });
  for (const k of Object.keys(before)) if (!(k in commons)) rmSync(join(dir, k), { force: true });
  for (const [k, v] of Object.entries(commons)) if (k.startsWith('town/') && before[k] !== v) { mkdirSync(dirname(join(dir, k)), { recursive: true }); writeFileSync(join(dir, k), v); }
  return { flushed: res.published.length, published: res.published.map((d) => d.uri || d.id), still_held: res.held.map((h) => ({ id: h.id, why: h.why })), failed: res.failed, waited: codes };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const arg = (k) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : null; };
  const runDir = arg('run'); if (!runDir) { console.error('usage: flush-held.mjs --run runs/<run> [--town <file>] [--wait <seconds>]'); process.exit(2); }
  const townFile = arg('town'), town = townFile && existsSync(townFile) ? JSON.parse(readFileSync(townFile, 'utf8')) : null;
  const r = await flushHeld({ runDir, town, password: process.env.MINIPHIM_APP_PASSWORD, waitMs: Number(arg('wait') || 0) * 1000 });
  console.log(JSON.stringify(r));
}
