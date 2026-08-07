#!/usr/bin/env node
// loop-capability.mjs — THE COP. What can a visitor actually DO?
//
//   node scripts/loop-capability.mjs            # play the page, print the report
//   node scripts/loop-capability.mjs --json     # the report, machine-readable
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS EXISTS
//
// After 99 turns the loop had one live feedback signal: *did the ticket's own
// test pass?* — and the fleet writes those tests. It was graded entirely by its
// own homework, and the fingerprint of that incentive is in the tree: 6,132
// lines of source against 12,965 lines of tests, with 63% of turns landing
// beneath the page and 18% landing on it.
//
// Writing another assertion is the cheapest way to score. So the loop wrote
// assertions. It was not malfunctioning; it was optimising exactly what it was
// told to optimise.
//
// This measures the other thing — the one `.github/loop/vision.md` has said
// from the beginning and no gate could read:
//
//     "a person who has never seen this opens a URL, and within thirty seconds
//      DOES SOMETHING THAT CAN FAIL. Not a slider that turns a label red — an
//      intention they formed, acted on, and got refused for."
//
// That is countable, and countable without a human, which is the whole point:
// the operator has said twice they have no time to run feedback, and a metric
// that needs their evening is a metric that stays at zero.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY IT LIVES IN scripts/ AND MUST STAY THERE
//
// `.github/loop/config.json` declares the loop's write paths: loop/**,
// .github/loop/**, plant/**. `scripts/` is NOT among them, and loop-work's
// containment gate reverts any diff that escapes them.
//
// So the fleet cannot edit its own scorer. That is not tidiness, it is the
// only thing separating a measurement from a self-report. A judge the graded
// party can rewrite is a judge in name only, and this repo has already learned
// the general form of that lesson twice — `preflight` asserts the placement,
// so moving this file breaks the build rather than quietly disarming the cop.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT IT COUNTS, AND WHY EACH ONE RESISTS GAMING
//
// It drives the REAL PAGE in a REAL BROWSER as a player would: pick a shape,
// click a spot, read what came back. Every number below is a state a simulated
// visitor actually reached. None of them can be moved by adding a unit test,
// by asserting harder, or by documenting an intention — only by the page
// gaining a capability a person can use.
//
//   reachedBlames    distinct REFUSAL CAUSES a player provoked by playing.
//                    The vision's bar is failure you understand, so causes are
//                    counted, not failures: ten refusals that all say the same
//                    thing score one.
//   distinctVerdicts distinct verdict SENTENCES seen. Guards the case where
//                    every cause renders as the same word — the page computing
//                    a rich refusal and throwing it away.
//   placed           summons that actually landed. Without this, a page that
//                    refuses everything scores perfectly on refusals.
//   movesToFirstFail how many clicks before the first refusal. The thirty-second
//                    bar, in the only unit the page has.
//   controls         enabled, visible affordances. The floor: a player needs
//                    something to press.
//
// ─────────────────────────────────────────────────────────────────────────────
// HONESTY RULES, both learned the hard way in this repo
//
//  1. IF THE BROWSER CANNOT RUN, THIS REPORTS `available: false` AND NO SCORE.
//     It never reports 0. A zero is a claim that the page has no capability,
//     and an infrastructure problem that renders as a capability collapse is
//     precisely how loop-judge came to bank four dead turns as real ones.
//  2. IT NEVER WRITES THE LEDGER. It prints. loop-judge decides what to record,
//     so the measurement and the accounting stay separate writers.

import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, normalize } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = join(ROOT, 'plant');
const asJson = process.argv.includes('--json');

// The TARGETS each count is scored against. Stated here, in the open, because
// a denominator invented inside a formula is a denominator nobody can argue
// with. These are the vision's bar written as numbers:
//   6 blames — the full BLAME vocabulary in summon-session.mjs. A player who
//     can provoke every distinct cause has met "failure you understand".
//   4 sentences — fewer distinct sentences than causes means the page is
//     collapsing what it knows into a shrug.
//   3 placements — enough to show building, not just refusing.
//   4 moves — the thirty-second bar. Longer is not fatal, it just scores less.
// `refusals` counts DISTINCT REFUSAL SENTENCES a player provoked — not causes
// classified into a taxonomy. An earlier version pattern-matched the page's
// prose against summon-session's BLAME vocabulary and scored a working page 0,
// because the pocket game has its own words. A scorer whose denominator is a
// guess about someone else's wording reads zero forever and looks like a
// permanent failure. Count what the page distinguishes, not what I expected.
const TARGET = { refusals: 5, verdicts: 4, placed: 3, moves: 4, controls: 6 };

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml' };

/** Serve plant/ read-only on an ephemeral port. */
function serve() {
  const srv = createServer((req, res) => {
    let p = decodeURIComponent((req.url || '/').split('?')[0]);
    if (p === '/') p = '/index.html';
    const f = normalize(join(SITE, p));
    if (!f.startsWith(SITE) || !existsSync(f)) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': MIME[extname(f)] || 'text/plain' });
    res.end(readFileSync(f));
  });
  return new Promise((r) => srv.listen(0, () => r({ srv, port: srv.address().port })));
}

/** Locate a chromium playwright can drive, or return null. NEVER throw: a
 *  missing browser is "not measured", not "measured as zero". */
async function browser() {
  let chromium;
  try { ({ chromium } = await import('playwright')); }
  catch { return { err: 'playwright is not installed (npm i -D playwright)' }; }
  const guesses = [
    process.env.CHROMIUM_PATH,
    '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  ].filter(Boolean);
  for (const executablePath of guesses) {
    if (!existsSync(executablePath)) continue;
    try { return { b: await chromium.launch({ executablePath }) }; } catch { /* try the next */ }
  }
  try { return { b: await chromium.launch() }; }              // playwright's own download
  catch (e) { return { err: `no chromium could be launched: ${e.message.split('\n')[0]}` }; }
}

/**
 * PLAY THE PAGE.
 *
 * A deterministic pass, not a random one: the same page must produce the same
 * number every run or the judge is reading noise and the plateau brake fires on
 * a coin flip. Every shape in the palette is tried against the same fixed grid
 * of points, in the same order.
 */
async function play(page, url) {
  const seen = { refusals: new Set(), verdicts: new Set() };
  const accepted = new Set();
  let placed = 0, clicks = 0, movesToFirstFail = null;

  await page.goto(url, { waitUntil: 'networkidle' });

  // WAIT FOR THE GAME TO BE READY, not for the network to be quiet. Digging a
  // pocket is deferred a tick, and until it finishes `pgBounds` is null — at
  // which point the palette handler returns early, nothing is selected, and
  // every plan click is silently ignored by `if (!pg.state().selected) return`.
  // A cop that measures during that window reports a working page as dead,
  // which is the single most damaging thing a scorer can do.
  await page.waitForFunction(
    () => (document.querySelector('#pgPlan')?.innerHTML || '').length > 200,
    { timeout: 15000 },
  ).catch(() => {});
  await page.waitForTimeout(250);

  const controls = await page.evaluate(() => {
    const els = [...document.querySelectorAll('button, input, select, [role=button]')];
    return els.filter((e) => !e.disabled && e.offsetParent !== null).length;
  });

  const shapes = await page.evaluate(() =>
    [...document.querySelectorAll('#pgPalette button')].map((b, i) => i));
  const plan = await page.$('#pgPlan');
  if (!plan || !shapes.length) {
    return { controls, distinctRefusals: 0, distinctVerdicts: 0, placed: 0, movesToFirstFail: null,
             note: 'no playable panel found: #pgPalette buttons and #pgPlan are how a visitor plays' };
  }

  const box = await plan.boundingBox();
  // The page's opening instruction. Any verdict OTHER than this is the game
  // answering a move, which is what "the player got a response" means here.
  const firstLine = await page.evaluate(() => (document.querySelector('#pgLine')?.textContent || '').trim());
  // A fixed lattice over the plan. Spread wide enough to hit empty ground, the
  // hull edge, and the player's own earlier summons — which is what makes the
  // different refusal causes reachable at all.
  const GRID = [];
  for (const fx of [0.18, 0.34, 0.5, 0.66, 0.82]) for (const fy of [0.25, 0.5, 0.75]) GRID.push([fx, fy]);

  for (const s of shapes) {
    const buttons = await page.$$('#pgPalette button');
    if (!buttons[s]) continue;
    await buttons[s].click().catch(() => {});
    await page.waitForTimeout(80);
    // Selection is a precondition for every plan click below. If it did not
    // take, this shape's whole pass would score zero for a reason that has
    // nothing to do with the page's capability.
    const selected = await page.evaluate(() =>
      [...document.querySelectorAll('#pgPalette button')].some((b) => b.style.outline));
    if (!selected) continue;
    for (const [fx, fy] of GRID) {
      await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy).catch(() => {});
      clicks++;
      await page.waitForTimeout(45);
      const shot = await page.evaluate(() => ({
        line: (document.querySelector('#pgLine')?.textContent || '').trim(),
        placedN: (document.querySelector('#pgPlaced')?.textContent || '').trim(),
      }));
      if (shot.line && shot.line !== firstLine) {
        seen.verdicts.add(shot.line);
        // PLACEMENTS COME FROM THE PAGE'S OWN COUNTER, not from parsing prose.
        // Reading the sentence to decide whether something landed would make
        // the score move when the copy is reworded — a measure of phrasing.
        const n = Number((shot.placedN.match(/(\d+)\s*move/) || [])[1] ?? NaN);
        if (Number.isFinite(n) && n > placed) { placed = n; accepted.add(shot.line); }
        else {
          // Not accepted: the move was refused, and THIS SENTENCE is what the
          // player has to understand it by.
          seen.refusals.add(shot.line);
          if (movesToFirstFail === null) movesToFirstFail = clicks;
        }
      }
    }
    // Reset between shapes so each one is measured against the same pocket.
    // Without this the last shape plays on a board the first four filled, and
    // the score would depend on palette order.
    const reset = await page.$('#pgReset');
    if (reset) { await reset.click().catch(() => {}); await page.waitForTimeout(60); }
  }

  return {
    controls,
    distinctRefusals: seen.refusals.size,
    distinctVerdicts: seen.verdicts.size,
    placed,
    movesToFirstFail,
    refusals: [...seen.refusals].slice(0, 8),
    samples: [...seen.verdicts].slice(0, 6),
  };
}

/** One number in [0,1], from five capped ratios. Capped so a page cannot buy a
 *  high score by being extravagant on one axis — the vision wants a visitor who
 *  can act, fail, understand and continue, not one who can fail brilliantly. */
function score(m) {
  const cap = (x, t) => Math.max(0, Math.min(1, x / t));
  const speed = m.movesToFirstFail === null ? 0 : cap(TARGET.moves / m.movesToFirstFail, 1);
  const parts = {
    controls: cap(m.controls, TARGET.controls),
    refusals: cap(m.distinctRefusals, TARGET.refusals),
    verdicts: cap(m.distinctVerdicts, TARGET.verdicts),
    placed: cap(m.placed, TARGET.placed),
    speed,
  };
  const W = { controls: 0.1, refusals: 0.35, verdicts: 0.2, placed: 0.25, speed: 0.1 };
  const total = Object.entries(W).reduce((a, [k, w]) => a + w * parts[k], 0);
  return { score: Number(total.toFixed(4)), parts };
}

async function main() {
  const { srv, port } = await serve();
  const { b, err } = await browser();
  if (!b) {
    srv.close();
    const out = { available: false, why: err, score: null };
    console.log(asJson ? JSON.stringify(out, null, 2)
      : `capability: NOT MEASURED — ${err}\n(no score is recorded; absent is not zero)`);
    process.exit(0);                       // not a failure: an absent measurement
  }
  let m, fatal = null;
  try {
    const page = await b.newPage({ viewport: { width: 1280, height: 900 } });
    m = await play(page, `http://127.0.0.1:${port}/`);
  } catch (e) { fatal = e.message.split('\n')[0]; }
  finally { await b.close().catch(() => {}); srv.close(); }

  if (fatal) {
    const out = { available: false, why: `driving the page threw: ${fatal}`, score: null };
    console.log(asJson ? JSON.stringify(out, null, 2) : `capability: NOT MEASURED — ${fatal}`);
    process.exit(0);
  }

  const s = score(m);
  const out = { available: true, ...s, measured: m, target: TARGET, at: new Date().toISOString() };
  if (asJson) { console.log(JSON.stringify(out, null, 2)); return; }

  console.log(`\ncapability ${(s.score * 100).toFixed(0)}%  — what a visitor can actually do\n`);
  const row = (k, v, t) => console.log(`  ${String(k).padEnd(18)} ${String(v).padStart(4)} / ${t}   ${'█'.repeat(Math.round(s.parts[k === 'movesToFirstFail' ? 'speed' : k] * 20)).padEnd(20)}`);
  row('controls', m.controls, TARGET.controls);
  row('refusals', m.distinctRefusals, TARGET.refusals);
  row('verdicts', m.distinctVerdicts, TARGET.verdicts);
  row('placed', m.placed, TARGET.placed);
  console.log(`  ${'movesToFirstFail'.padEnd(18)} ${String(m.movesToFirstFail ?? '—').padStart(4)} / ≤${TARGET.moves}`);
  if (m.refusals?.length) {
    console.log('\n  distinct refusals a player provoked:');
    for (const r of m.refusals) console.log(`    ✗ ${r.slice(0, 92)}`);
  }
  if (m.note) console.log(`\n  ${m.note}`);
  if (m.samples?.length) {
    console.log('\n  what the player actually read:');
    for (const v of m.samples) console.log(`    · ${v.slice(0, 96)}`);
  }
  console.log('');
}

main();
