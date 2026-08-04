#!/usr/bin/env node
// Tests the CLI's guard rails, not the graph maths (scripts/beads.selftest.mjs
// covers those). What is asserted here is everything that stands between an
// autonomous agent and a ledger it can quietly corrupt:
//
//   - every verb APPENDS; nothing rewrites a line
//   - a bad reference is refused at write time, not discovered at schedule time
//   - an edge that closes a cycle is refused
//   - `done` requires evidence
//   - `drop` requires a reason
//
// Runs against a throwaway ledger under the scratch dir, never .github/loop/.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(ROOT, 'scripts', 'beads.mjs');
const dir = mkdtempSync(join(tmpdir(), 'beads-cli-'));
const LEDGER = join(dir, 'beads.jsonl');

let failed = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { console.log(`  ✓ ${name}`); return; }
  failed++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
};

let clock = 0;
/** Run the CLI. Returns {ok, out}. The clock advances per call so that two
 *  beads minted in the same test run get distinct ids — the id is derived from
 *  (title, created, actor), and a frozen clock would collide two same-titled
 *  beads, which is correct behaviour but not what these tests are measuring. */
function bd(...args) {
  try {
    const out = execFileSync('node', [CLI, ...args], {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, LOOP_LEDGER: LEDGER, LOOP_NOW: `2026-08-04T00:00:${String(clock++).padStart(2, '0')}Z` },
    });
    return { ok: true, out: out.trim() };
  } catch (e) {
    return { ok: false, out: `${e.stdout ?? ''}${e.stderr ?? ''}`.trim() };
  }
}
const lines = () => readFileSync(LEDGER, 'utf8').split('\n').filter(Boolean);

try {
  console.log('\ncreating');
  const a = bd('new', '--title', 'the first bead', '--kind', 'task', '--actor', 'test');
  ok('new prints the minted id', /^lp-[0-9a-f]{6}$/.test(a.out), a.out);
  const A = a.out;
  ok('the ledger has exactly one record', lines().length === 1);

  const b = bd('new', '--title', 'the second bead', '--dep', A, '--actor', 'test');
  const B = b.out;
  ok('a dependency on an existing bead is accepted', b.ok, b.out);

  const bad = bd('new', '--title', 'points nowhere', '--dep', 'lp-nosuch');
  ok('a dangling dep is refused at write time', !bad.ok && /does not exist/.test(bad.out), bad.out);
  ok('the refused bead was not written', lines().length === 2);

  ok('an unknown kind is refused', !bd('new', '--title', 'x', '--kind', 'sticky').ok);
  ok('an empty title is refused', !bd('new', '--title', '').ok);

  console.log('\nupdating appends, never rewrites');
  const before = lines().length;
  ok('set succeeds', bd('set', A, '--status', 'ready', '--priority', '1').ok);
  ok('set added a line rather than editing one', lines().length === before + 1);
  ok('the original record is still byte-identical',
    JSON.parse(lines()[0]).status === 'proposed' && JSON.parse(lines()[0]).title === 'the first bead');
  const showA = JSON.parse(bd('show', A, '--json').out);
  ok('the folded view reflects the patch', showA.status === 'ready' && showA.priority === 1);
  ok('and keeps untouched fields', showA.title === 'the first bead');

  console.log('\nthe ready queue is derived');
  ok('a bead behind an open dependency is not ready',
    JSON.parse(bd('show', B, '--json').out).blocked === true);
  {
    // A was just marked ready and depends on nothing, so it is the queue.
    const q = JSON.parse(bd('ready', '--json').out);
    ok('a ready bead with no dependencies is the queue', q.length === 1 && q[0].id === A);
  }

  bd('set', B, '--status', 'ready');
  {
    const q = JSON.parse(bd('ready', '--json').out).map((n) => n.id);
    ok('marking the dependent ready is not enough while its dep is open',
      q.includes(A) && !q.includes(B), q.join(','));
  }

  console.log('\nclosing requires evidence');
  const noEv = bd('done', A);
  ok('done without evidence is refused', !noEv.ok && /evidence/.test(noEv.out), noEv.out);
  ok('done with evidence succeeds', bd('done', A, '--evidence', 'commit:deadbee').ok);
  ok('the evidence is recorded', JSON.parse(bd('show', A, '--json').out).evidence.includes('commit:deadbee'));
  ok('closing the dep promoted the dependent with no edit to it',
    JSON.parse(bd('ready', '--json').out).some((n) => n.id === B));

  console.log('\ncycles are refused at the edge that would close them');
  const c1 = bd('new', '--title', 'cycle one', '--actor', 'test').out;
  const c2 = bd('new', '--title', 'cycle two', '--dep', c1, '--actor', 'test').out;
  const cyc = bd('dep', c1, '--on', c2);
  ok('the closing edge is refused', !cyc.ok && /cycle/.test(cyc.out), cyc.out);
  ok('and nothing was appended', !readFileSync(LEDGER, 'utf8').includes(`"deps":["${c2}"]`));
  ok('a self-dependency is refused', !bd('dep', c1, '--on', c1).ok);

  console.log('\ndropping requires a reason');
  ok('drop without --why is refused', !bd('drop', c2).ok);
  ok('drop with --why succeeds', bd('drop', c2, '--why', 'superseded').ok);
  ok('the reason lands in the body', /superseded/.test(bd('show', c2, '--json').out));

  console.log('\nknowledge');
  const k = bd('learn', '--title', 'the runner cannot reach poly.pizza', '--kind', 'dead-end');
  ok('learn writes a bead', k.ok && /^lp-/.test(k.out), k.out);
  const kb = JSON.parse(bd('show', k.out, '--json').out);
  ok('a finding is born done', kb.status === 'done');
  ok('and is never schedulable', kb.ready === false);
  ok('learn refuses a work kind', !bd('learn', '--title', 'x', '--kind', 'task').ok);

  console.log('\nlint');
  ok('a healthy ledger lints clean', bd('lint').ok);
  writeFileSync(LEDGER, readFileSync(LEDGER, 'utf8') + 'this is not json\n');
  const dirty = bd('lint');
  ok('a corrupt line fails lint', !dirty.ok && /unparseable/.test(dirty.out), dirty.out);
  ok('and the rest of the graph still reads', bd('stats', '--json').ok);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log('');
if (failed) { console.log(`✗ beads CLI selftest: ${failed} failing\n`); process.exit(1); }
console.log('✓ beads CLI selftest passed\n');
