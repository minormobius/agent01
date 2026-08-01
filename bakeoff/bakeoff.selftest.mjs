#!/usr/bin/env node
// bakeoff.selftest.mjs — the bake-off's own invariants.
//
// A scoring rig is a measuring instrument, and an uncalibrated instrument is
// worse than none: it produces confident numbers about nothing. These checks
// pin both ends of the scale and keep the two copies of the model registry
// honest with each other.

import { readFileSync, writeFileSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scoreEntry, scoreField, CHECKS, MAX_SCORE } from './briefs/inpac-gravity/score.mjs';
import { scoreEntry as scoreRaceEntry, GATE as RACE_GATE, SKELETON as RACE_SKELETON } from './briefs/inpac-race/score.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) { console.log(`  ✓ ${name}`); }
  else { console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); failures++; }
};

console.log('bakeoff selftest');

// ── 1. the rubric adds up ──────────────────────────────────────────
check('rubric weights sum to 100', MAX_SCORE === 100, `got ${MAX_SCORE}`);

// ── 2. the ceiling is reachable ────────────────────────────────────
// A rubric nothing can pass is not a rubric. The simplest correct field —
// "down is straight away from the tube centreline" — must score full marks.
{
  const field = (R, Z, geom = {}) => {
    const R0 = geom.R ?? 8.0;
    const dR = R - R0, dZ = Z;
    const d = Math.hypot(dR, dZ);
    if (!(d > 1e-9)) return { gR: 0, gZ: 0 };
    return { gR: 9 * dR / d, gZ: 9 * dZ / d };
  };
  const res = scoreField(field);
  const failed = Object.entries(res.checks).filter(([, c]) => !c.passed).map(([k]) => k);
  check('a correct field passes every physics check', failed.length === 0, `failed: ${failed.join(', ')}`);
}

// ── 3. the floor is real ───────────────────────────────────────────
// The shipped scheme MUST still fail, and must fail on `sign` specifically —
// that is the defect the brief describes. If this ever passes, either someone
// fixed inpac (in which case retire the brief) or the scorer stopped measuring.
{
  const baselinePath = join(HERE, 'briefs/inpac-gravity/baseline.json');
  check('baseline.json exists (run baseline.mjs --write)', existsSync(baselinePath));
  if (existsSync(baselinePath)) {
    const b = JSON.parse(readFileSync(baselinePath, 'utf8'));
    check('baseline does not pass the rubric', b.score < b.maxScore, `scored ${b.score}/${b.maxScore}`);
    check('baseline fails `sign` — the defect the brief is about',
      b.checks?.sign?.passed === false,
      `sign.passed = ${b.checks?.sign?.passed}`);
    check('baseline leaves real headroom', b.score <= 60, `scored ${b.score}`);
  }
}

// ── 4. a field that inverts near the wall is caught ─────────────────
// Directly asserts the sign check does its job, independent of the baseline.
{
  const inverting = (R, Z, geom = {}) => {
    const R0 = geom.R ?? 8.0, r0 = geom.r ?? 3.0;
    const dR = R - R0, dZ = Z;
    const d = Math.hypot(dR, dZ);
    if (!(d > 1e-9)) return { gR: 0, gZ: 0 };
    const sign = d > 0.8 * r0 ? -1 : 1;   // flips exactly where you land
    return { gR: sign * 9 * dR / d, gZ: sign * 9 * dZ / d };
  };
  const res = scoreField(inverting);
  check('a field that inverts near the wall fails `sign`', res.checks.sign.passed === false);
}

// ── 5. an entry that never wrote field.mjs scores nothing ──────────
{
  const dir = mkdtempSync(join(tmpdir(), 'bakeoff-selftest-'));
  writeFileSync(join(dir, 'index.html'), '<html><body>nothing here</body></html>');
  const rec = await scoreEntry(dir);
  check('missing field.mjs scores 0', rec.score === 0, `scored ${rec.score}`);
  check('missing field.mjs reports why', /field\.mjs/.test(rec.error || ''), rec.error || '(no error)');
}

// ── 6. the two model registries agree ──────────────────────────────
// cells.json drives the CI runner; os/api/wrangler.toml drives the container.
// They are separate because CI has no worker to ask — which makes silent drift
// the obvious failure mode. A model id that means one thing in the bake-off and
// another in the chat would invalidate every comparison without any error.
{
  const cells = JSON.parse(readFileSync(join(HERE, 'cells.json'), 'utf8'));
  const toml = readFileSync(join(REPO, 'os/api/wrangler.toml'), 'utf8');
  const tomlVar = (k) => (toml.match(new RegExp(`^${k}\\s*=\\s*"([^"]*)"`, 'm')) || [])[1];

  const expected = {
    kimi3: { model: tomlVar('KIMI_MODEL'), anthropicBase: tomlVar('KIMI_BASE_URL'), openaiBase: tomlVar('KIMI_OAI_BASE_URL') },
    'ds4-flash': { model: tomlVar('DEEPSEEK_FLASH_MODEL'), anthropicBase: tomlVar('DEEPSEEK_BASE_URL'), openaiBase: tomlVar('DEEPSEEK_OAI_BASE_URL') },
    'ds4-pro': { model: tomlVar('DEEPSEEK_PRO_MODEL'), anthropicBase: tomlVar('DEEPSEEK_BASE_URL'), openaiBase: tomlVar('DEEPSEEK_OAI_BASE_URL') },
  };

  for (const [name, want] of Object.entries(expected)) {
    const got = cells.models[name];
    check(`cells.json ${name} exists`, !!got);
    if (!got) continue;
    for (const field of ['model', 'anthropicBase', 'openaiBase']) {
      check(`cells.json ${name}.${field} matches wrangler.toml`,
        got[field] === want[field],
        `cells.json=${got[field]} wrangler.toml=${want[field]}`);
    }
  }

  // The brief cells.json points at must exist, with a scorer and a brief.
  for (const f of ['BRIEF.md', 'score.mjs']) {
    check(`brief ${cells.brief}/${f} exists`,
      existsSync(join(HERE, 'briefs', cells.brief, f)));
  }
  check('cells.json requests more than one sample per cell (taste is noisy)',
    (cells.samples ?? 1) >= 2, `samples = ${cells.samples}`);

  // Every cell must name a harness and model that actually exist.
  for (const c of cells.cells) {
    check(`cell ${c.harness}×${c.model} is defined`,
      !!cells.harnesses[c.harness] && !!cells.models[c.model]);
  }

  // Every model needs the OpenAI-shaped endpoint too, or half the matrix is
  // unrunnable — the opencode harness cannot speak the Anthropic one.
  for (const [name, m] of Object.entries(cells.models)) {
    check(`model ${name} can run under both harnesses`, !!m.anthropicBase && !!m.openaiBase);
  }
}

// ── 7. each brief still describes its own rubric ───────────────────
// The brief is what the agents actually read. If a check is added to score.mjs
// and not to the brief, every cell is scored on a rule it was never told.
{
  const gravBrief = readFileSync(join(HERE, 'briefs/inpac-gravity/BRIEF.md'), 'utf8');
  for (const [id] of CHECKS) {
    check(`inpac-gravity BRIEF.md documents \`${id}\``, gravBrief.includes(`\`${id}\``));
  }

  const raceBrief = readFileSync(join(HERE, 'briefs/inpac-race/BRIEF.md'), 'utf8');
  for (const [id] of [...RACE_GATE, ...RACE_SKELETON]) {
    check(`inpac-race BRIEF.md documents \`${id}\``, raceBrief.includes(`\`${id}\``));
  }
  // The three seams are the whole reason an entry is inspectable. If one stops
  // being stated in the brief, entries silently become uncapturable.
  for (const seam of ['field.mjs', '?autostart=1', '__inpacState']) {
    check(`inpac-race BRIEF.md states the \`${seam}\` contract`, raceBrief.includes(seam));
  }
  // Discovered the hard way; if this warning is ever dropped, every entry that
  // calls requestPointerLock on its start path fails the gate for a reason the
  // author was never told about.
  check('inpac-race BRIEF.md warns about Pointer Lock under autostart',
    /pointer\s*lock/i.test(raceBrief));
}

// ── 8. the race rig is calibrated at both ends ─────────────────────
// The shipped game must FAIL the race gate (it is not a race and its gravity is
// broken). Without this, a rig that silently passed everything would look like
// a clean sweep rather than a broken instrument.
{
  const rec = await scoreRaceEntry(join(REPO, 'clock/inpac'), { capture: false });
  check('shipped game fails the race gate', rec.gate.passed === false);
  check('shipped game fails race `physics` (no field.mjs yet)',
    rec.gate.checks.physics?.passed === false);
  check('shipped game scores 0 race primitives without capture',
    rec.skeleton.passed === 0, `got ${rec.skeleton.passed}`);
  // The race brief must not have quietly reintroduced a single number.
  check('race scorer produces no blended score', rec.score === undefined);
}

console.log(failures ? `\n${failures} failure(s)` : '\nall bakeoff invariants hold');
process.exit(failures ? 1 : 0);
