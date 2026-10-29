// gangs-sheet-gen.mjs: CLI and selftest for www/gangs/sheet/gen.js (seeded sheet generator).
// Usage: node shelf/gangs-sheet-gen.mjs <seed> [root.json]    print one sheet + a suggested ability
//        node shelf/gangs-sheet-gen.mjs --selftest            every generated sheet must pass check.js
// Mozzie, 2026-10-18.
import { generateSheet } from '../www/gangs/sheet/gen.js';
import { reportSheet } from '../www/gangs/sheet/check.js';
import { readFileSync } from 'node:fs';

const root0 = { uri: 'at://did:plc:x/com.minomobi.gangs.game/1', cid: 'bafyroot' };
const at = '2026-10-18T17:00:00Z';

function selftest() {
  let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } };
  const roots = [
    ['defaults', root0],
    ['root playbooks', { ...root0, rules: { playbooks: ['Saint', 'Sinner'] } }],
    ['tight: 4 actions, 8 dots, max 2', { ...root0, rules: { actions: ['dig', 'write', 'hide', 'run'], dotsTotal: 8, dotsMax: 2 } }],
    ['loose: 12 dots, max 4', { ...root0, rules: { dotsTotal: 12, dotsMax: 4 } }],
    ['zero dots', { ...root0, rules: { dotsTotal: 0 } }],
  ];
  const N = 2000;
  for (const [label, root] of roots) {
    let bad = 0;
    for (let i = 0; i < N; i++) {
      const { record } = generateSheet(`seed-${i}`, root, { createdAt: at });
      const rep = reportSheet(record, root);
      if (rep.bad.length || rep.ignored.length) { if (!bad) console.log(label, i, rep); bad++; }
    }
    ok(bad === 0, `${label}: ${bad}/${N} generated sheets fail check.js`);
  }
  const a = JSON.stringify(generateSheet('wren', root0, { createdAt: at }));
  ok(a === JSON.stringify(generateSheet('wren', root0, { createdAt: at })), 'same seed, same sheet');
  ok(a !== JSON.stringify(generateSheet('wren2', root0, { createdAt: at })), 'different seed, different sheet');
  let threw = false; try { generateSheet('x', { ...root0, rules: { actions: ['a'], dotsTotal: 3, dotsMax: 2 } }); } catch { threw = true; }
  ok(threw, 'impossible rules throw');
  const pb = generateSheet('x', { ...root0, rules: { playbooks: ['Saint'] } }, { createdAt: at }).record.playbook;
  ok(pb === 'Saint', 'root playbooks are used');
  ok(!('ability' in generateSheet('x', root0).record), 'ability stays off the record');
  const names = new Set(Array.from({ length: 500 }, (_, i) => generateSheet(`n${i}`, root0).record.name));
  ok(names.size > 200, `name variety: ${names.size}/500 distinct`);
  console.log(fail ? `${fail} failed` : `selftest ok: ${roots.length}×${N} sheets pass check.js, + 6 cases`);
  process.exit(fail ? 1 : 0);
}

const [arg, rootFile] = process.argv.slice(2);
if (!arg) { console.error('usage: gangs-sheet-gen.mjs <seed> [root.json] | --selftest'); process.exit(2); }
if (arg === '--selftest') selftest();
else {
  const root = rootFile ? JSON.parse(readFileSync(rootFile, 'utf8')) : null;
  console.log(JSON.stringify(generateSheet(arg, root), null, 2));
}
