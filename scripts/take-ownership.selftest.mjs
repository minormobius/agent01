#!/usr/bin/env node
// take-ownership.selftest.mjs — the pure half of take-ownership.mjs: the handover decision and the
// format-preserving registry rewrite. No git, no network.
import { decide, rewriteRegistry } from './take-ownership.mjs';

let failures = 0;
const check = (name, ok) => { if (!ok) { failures++; console.error(`  FAIL  ${name}`); } else console.log(`  ok    ${name}`); };

const base = { owner: 'claude/a', me: 'claude/me', ownerExists: true, ownerOnlyCommits: [] };
check('an owner with nothing this branch lacks is taken', decide(base).take === true);
check('an owner holding a file this branch lacks is refused',
  decide({ ...base, ownerOnlyCommits: ['abc123 new page'], unlandedFiles: ['x/new.html'] }).refused === true);
check('a refusal is not a take', decide({ ...base, ownerOnlyCommits: ['x'], unlandedFiles: ['x/a'] }).take === false);
check('unreachable commits whose files all landed (a squash) are taken',
  decide({ ...base, ownerOnlyCommits: ['abc123 squashed'], unlandedFiles: [] }).take === true);
check('a surface already owned here is left alone', decide({ ...base, owner: 'claude/me' }).take === false);
check('a vanished owner branch is taken — nothing to lose', decide({ ...base, ownerExists: false }).take === true);

const raw = '{\n  "surfaces": [\n    {\n      "surface": "x",\n      "dir": "x",\n      "branch": "claude/a",\n      "d": "caf\\u00e9"\n    },\n    {\n      "surface": "y",\n      "branch": "claude/b"\n    }\n  ]\n}\n';
const out = rewriteRegistry(raw, { x: { from: 'claude/a', to: 'claude/me' } }, '2026-09-23');
const reg = JSON.parse(out);
check('the named surface moves', reg.surfaces[0].branch === 'claude/me');
check('the move is recorded in status', reg.surfaces[0].status.startsWith('OWNERSHIP (2026-09-23): taken by claude/me from claude/a'));
check('other surfaces are untouched', reg.surfaces[1].branch === 'claude/b' && !('status' in reg.surfaces[1]));
check('a \\u escape keeps its original spelling', out.includes('"d": "caf\\u00e9"'));

console.log(failures ? `take-ownership selftest: ${failures} FAILURE(S)` : 'take-ownership selftest: PASS');
process.exit(failures ? 1 : 0);
