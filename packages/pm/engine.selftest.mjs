#!/usr/bin/env node
// engine.selftest.mjs — the PM engine must keep giving the answers it gave before it moved here.
// golden.json was produced by org/src/pm/engine.ts on 2026-10-04 (computeES with the clock frozen
// at each case's as-of). Do not regenerate it to make this pass: a difference is a change in what
// org.mino.mobi shows people about their projects, and has to be meant.
//   node packages/pm/engine.selftest.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as m from './engine.mjs';

const golden = JSON.parse(readFileSync(new URL('./golden.json', import.meta.url), 'utf8'));
const enc = (x) => JSON.parse(JSON.stringify(x, (k, v) => (typeof v === 'number' && !Number.isFinite(v) ? String(v) : v)));
const lanes = [{ id: 'b', role: 'backlog' }, { id: 'q', role: 'queued' }, { id: 'a', role: 'active' }, { id: 'r', role: 'review' }, { id: 'd', role: 'done' }];
let n = 0;
for (const c of golden.cases) {
  const tasks = JSON.parse(JSON.stringify(c.tasks)); const asOf = new Date(c.asOf);
  for (const t of tasks) if (m.isParentTask(tasks, t.id)) m.rollUpParent(tasks, t.id);
  const got = enc({ evm: m.computeEVM(tasks, asOf), es: m.computeES(tasks, asOf), cp: [...m.computeCriticalPath(tasks, c.deps)].sort(),
    leaves: m.getLeafTasks(tasks).map((t) => t.id), order: m.getTreeOrder(tasks).map((t) => t.id),
    lanes: tasks.map((t) => m.syncTaskToLane(t, lanes)), rolled: tasks.map((t) => [t.plannedStart, t.plannedEnd, t.percentComplete, t.plannedCost, t.actualCost]) });
  assert.deepEqual(got, c.expected, `golden case ${n}`); n++;
}
for (const [x, h] of golden.durations) assert.equal(m.parseDuration(x), h, `parseDuration(${JSON.stringify(x)})`);
// computeES without an as-of still reads the clock, as before.
assert.equal(typeof m.computeES(golden.cases[0].tasks).at, 'number');
console.log(`pm engine selftest: ${n} golden projects + ${golden.durations.length} durations match`);
