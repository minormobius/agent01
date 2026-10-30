// gangs-sheet.mjs: CLI and selftest for www/gangs/sheet/check.js (the one copy of the rules).
// Usage: node shelf/gangs-sheet.mjs <sheet.json> [root.json | rootUri rootCid]   |   --selftest
import { reportSheet, pickSheets, parseTime } from '../www/gangs/sheet/check.js';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function selftest() {
  const root = { uri: 'at://did:plc:x/com.minomobi.gangs.game/1', cid: 'bafyroot' };
  const acts = [{ action: 'prowl', dots: 2 }, { action: 'finesse', dots: 2 }, { action: 'survey', dots: 1 }, { action: 'study', dots: 1 }, { action: 'sway', dots: 1 }];
  const ok = { $type: 'com.minomobi.gangs.sheet', game: root, name: 'Wren', playbook: 'Lurk',
    look: 'oilskin coat, ink on the cuffs', drive: 'wants the weigh-house ledger',
    controller: 'agent', actions: acts, createdAt: '2026-10-17T22:00:00Z' };
  const n = (rec, r = root) => reportSheet(rec, r);
  const cases = [
    ['valid sheet', ok, 0, 0],
    ['8 dots', { ...ok, actions: [...acts, { action: 'wreck', dots: 1 }] }, 1, 0],
    ['a 3', { ...ok, actions: [{ action: 'prowl', dots: 3 }, { action: 'finesse', dots: 2 }, { action: 'survey', dots: 1 }, { action: 'study', dots: 1 }] }, 1, 0],
    ['unknown action', { ...ok, actions: [...acts, { action: 'fly', dots: 0 }] }, 1, 0],
    ['duplicate action', { ...ok, actions: [...acts.slice(0, 4), { action: 'prowl', dots: 1 }] }, 1, 0], // 7 dots in total, so only the duplicate fails
    ['old map shape', { ...ok, actions: { prowl: 2, finesse: 2, survey: 1, study: 1, sway: 1 } }, 1, 0],
    ['stress on sheet is ignored, not fatal', { ...ok, stress: 0 }, 0, 1],
    ['wrong root', { ...ok, game: { ...root, cid: 'bafyother' } }, 1, 0],
    ['no controller', { ...ok, controller: undefined }, 1, 0],
    ['long look', { ...ok, look: 'x'.repeat(301) }, 1, 0],
    ['300 emoji ok', { ...ok, look: '🫖'.repeat(300) }, 0, 0],
    ['1 grapheme, 4001 bytes (fuzz)', { ...ok, name: 'a' + '\u0301'.repeat(2000) }, 1, 0],
    ['zero-width name (fuzz)', { ...ok, name: '\u200b' }, 1, 0],
    ['soft hyphens only (fuzz)', { ...ok, drive: '\u00ad'.repeat(5) }, 1, 0],
    ['createdAt "1" (fuzz)', { ...ok, createdAt: '1' }, 1, 0],
    ['createdAt with no zone (fuzz)', { ...ok, createdAt: '2026-10-18T05:00:00' }, 1, 0],
    ['createdAt with offset ok', { ...ok, createdAt: '2026-10-18T05:00:00.123+05:30' }, 0, 0],
    ['operator "did:" (fuzz)', { ...ok, operator: 'did:' }, 1, 0],
    ['operator did:plc ok', { ...ok, operator: 'did:plc:4grsgbhuczsdcwau6jo75eud' }, 0, 0],
    ['accented name ok', { ...ok, name: 'Zoë Ångström' }, 0, 0],
    ['root rules: 6 dots, max 3', { ...ok, actions: [{ action: 'prowl', dots: 3 }, { action: 'sway', dots: 3 }] }, 0, 0,
      { ...root, rules: { actions: ['prowl', 'sway'], dotsTotal: 6, dotsMax: 3 } }],
    ['root rules: playbook list', ok, 1, 0, { ...root, rules: { actions: ['prowl','finesse','survey','study','sway'], dotsTotal: 7, dotsMax: 2, playbooks: ['Hound'] } }],
    ['root as record value', ok, 0, 0, { ...root, value: { rules: { actions: ['prowl','finesse','survey','study','sway'], dotsTotal: 7, dotsMax: 2 } } }],
  ];
  let fail = 0;
  for (const [name, rec, wantBad, wantIgn, r] of cases) {
    const got = n(rec, r ?? root);
    if (got.bad.length !== wantBad || got.ignored.length !== wantIgn) { fail++; console.log('FAIL', name, got); } else console.log('ok  ', name);
  }
  const p = pickSheets([{ did: 'a', indexedAt: '2026-10-18T01:00:00Z', k: 2 }, { did: 'a', indexedAt: '2026-10-18T00:00:00Z', k: 1 }, { did: 'b', indexedAt: '2026-10-18T00:30:00Z' }]);
  if (p.counted.length !== 2 || p.counted[0].k !== 1 || p.extra.length !== 1) { fail++; console.log('FAIL pickSheets'); } else console.log('ok   first indexed sheet counts');
  const q = pickSheets([{ did: 'a', indexedAt: '2026-10-18T00:00:00Z', k: 1 }, { did: 'a', indexedAt: '2026-10-18T02:00:00Z', k: 2 }, { did: 'a', indexedAt: '2026-10-18T03:00:00Z', k: 3 }],
    [{ did: 'a', indexedAt: '2026-10-18T01:00:00Z' }]);
  if (q.counted.length !== 1 || q.counted[0].k !== 2 || q.extra.length !== 2) { fail++; console.log('FAIL retire', q); } else console.log('ok   retire frees the seat; the next sheet counts');
  const A = { did: 'a', indexedAt: '2026-10-18T00:00:00Z', uri: 'at://a/s/2', k: 2 }, B = { did: 'a', indexedAt: '2026-10-18T00:00:00Z', uri: 'at://a/s/1', k: 1 };
  if (pickSheets([A, B]).counted[0].k !== 1 || pickSheets([B, A]).counted[0].k !== 1) { fail++; console.log('FAIL tie order'); } else console.log('ok   a tie goes the same way whatever the input order');
  const z = pickSheets([{ did: 'a', indexedAt: 'garbage', k: 9 }, { did: 'a', indexedAt: '2026-10-18T00:00:00Z', k: 1 }]);
  if (z.counted[0]?.k !== 1 || z.extra[0]?.k !== 9) { fail++; console.log('FAIL bad indexedAt', z); } else console.log('ok   a sheet with no parseable indexedAt never takes the seat');
  const nz = pickSheets([{ did: 'a', indexedAt: '2026-10-18T05:00:00', uri: 'at://a/s/1', k: 1 }, { did: 'a', indexedAt: '2026-10-18T05:00:00Z', uri: 'at://a/s/2', k: 2 }]);
  if (nz.counted[0]?.k !== 2 || nz.extra[0]?.k !== 1) { fail++; console.log('FAIL zone-less indexedAt', nz); } else console.log('ok   a zone-less indexedAt never takes the seat (else the winner depends on TZ)');
  const bd = pickSheets([{ did: 'a', indexedAt: '2026-02-30T00:00:00Z', uri: 'at://a/s/1', k: 1 }, { did: 'a', indexedAt: '2026-03-03T00:00:00Z', uri: 'at://a/s/2', k: 2 }]);
  if (bd.counted[0]?.k !== 2 || bd.extra[0]?.k !== 1) { fail++; console.log('FAIL impossible date', bd); } else console.log('ok   a day that does not exist (Feb 30) never takes the seat (Date.parse is engine-defined there)');
  const pt = [['2024-02-29T00:00:00Z', Date.UTC(2024, 1, 29)], ['2026-10-18T05:00:00+02:00', Date.UTC(2026, 9, 18, 3)], ['2026-10-18T05:00:00.123456Z', Date.UTC(2026, 9, 18, 5, 0, 0, 123)], ['0099-01-01T00:00:00Z', -59042995200000], ['2025-02-29T00:00:00Z', NaN], ['2026-10-18T05:00:60Z', NaN], ['2026-10-18T05:00:00+24:00', NaN]];
  const ptBad = pt.filter(([s, want]) => !Object.is(parseTime(s), want));
  if (ptBad.length) { fail++; console.log('FAIL parseTime', ptBad.map(([s]) => [s, parseTime(s)])); } else console.log('ok   parseTime: leap day, offsets, fractions, year 0099, and out-of-range fields');
  // Frozen versions (Morphyx's proposal, Modulo's yes, 10-18): www/gangs/sheet/vN/check.js never changes;
  // check.js is only the alias for the newest. A change is a new vN, never an edit.
  {
    const dir = new URL('../www/gangs/sheet/', import.meta.url);
    const vs = readdirSync(dir).filter(d => /^v\d+$/.test(d)).map(d => +d.slice(1)).sort((a, b) => a - b);
    const top = vs.at(-1), alias = readFileSync(new URL('check.js', dir));
    const frozen = top ? readFileSync(new URL(`v${top}/check.js`, dir)) : null;
    if (!frozen || !alias.equals(frozen)) { fail++; console.log(`FAIL check.js is not byte-equal to the newest frozen v${top}/check.js`); }
    else console.log(`ok   check.js is byte-equal to frozen v${top}/check.js`);
  }
  console.log(fail ? `${fail} failed` : 'all passed'); process.exit(fail ? 1 : 0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [f, u, c] = process.argv.slice(2);
  if (!f || f === '--selftest') selftest();
  else {
    let root = null;
    if (u && c) root = { uri: u, cid: c };
    else if (u) root = JSON.parse(readFileSync(u, 'utf8'));
    const { bad, ignored } = reportSheet(JSON.parse(readFileSync(f, 'utf8')), root);
    for (const i of ignored) console.log(i);
    console.log(bad.length ? bad.join('\n') : 'valid'); process.exit(bad.length ? 1 : 0);
  }
}
