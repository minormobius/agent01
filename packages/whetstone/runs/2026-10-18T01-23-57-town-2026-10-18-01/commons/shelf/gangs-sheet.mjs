// gangs-sheet.mjs: CLI and selftest for www/gangs/sheet/check.js (the one copy of the rules).
// Usage: node shelf/gangs-sheet.mjs <sheet.json> [rootUri rootCid]   |   --selftest
import { checkSheet, pickSheets } from '../www/gangs/sheet/check.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function selftest() {
  const root = { uri: 'at://did:plc:x/com.minomobi.gangs.game/1', cid: 'bafyroot' };
  const ok = { $type: 'com.minomobi.gangs.sheet', game: root, name: 'Wren', playbook: 'Lurk',
    look: 'oilskin coat, ink on the cuffs', drive: 'wants the weigh-house ledger',
    controller: 'agent', actions: { prowl: 2, finesse: 2, survey: 1, study: 1, sway: 1 }, createdAt: '2026-10-17T22:00:00Z' };
  const cases = [
    ['valid sheet', ok, 0],
    ['8 dots', { ...ok, actions: { ...ok.actions, wreck: 1 } }, 1],
    ['a 3', { ...ok, actions: { prowl: 3, finesse: 2, survey: 1, study: 1 } }, 1],
    ['unknown action', { ...ok, actions: { ...ok.actions, fly: 0 } }, 1],
    ['stress on sheet', { ...ok, stress: 0 }, 1],
    ['wrong root', { ...ok, game: { ...root, cid: 'bafyother' } }, 1],
    ['no controller', { ...ok, controller: undefined }, 1],
    ['long look', { ...ok, look: 'x'.repeat(301) }, 1],
    ['300 emoji ok', { ...ok, look: '🫖'.repeat(300) }, 0],
  ];
  let fail = 0;
  for (const [n, rec, want] of cases) {
    const got = checkSheet(rec, root).length;
    if (got !== want) { fail++; console.log('FAIL', n, checkSheet(rec, root)); } else console.log('ok  ', n);
  }
  const p = pickSheets([{ did: 'a', indexedAt: '2026-10-18T01:00:00Z', k: 2 }, { did: 'a', indexedAt: '2026-10-18T00:00:00Z', k: 1 }, { did: 'b', indexedAt: '2026-10-18T00:30:00Z' }]);
  if (p.counted.length !== 2 || p.counted[0].k !== 1 || p.extra.length !== 1) { fail++; console.log('FAIL pickSheets'); } else console.log('ok   first indexed sheet counts');
  console.log(fail ? `${fail} failed` : 'all passed'); process.exit(fail ? 1 : 0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [f, u, c] = process.argv.slice(2);
  if (!f || f === '--selftest') selftest();
  else { const bad = checkSheet(JSON.parse(readFileSync(f, 'utf8')), u ? { uri: u, cid: c } : null);
    console.log(bad.length ? bad.join('\n') : 'valid'); process.exit(bad.length ? 1 : 0); }
}
