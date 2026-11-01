import { readFileSync } from 'node:fs';
import { checkSheet } from '/tmp/whetstone-town-CraB3D/work/www/gangs/sheet/check.js';
const L = await import('/tmp/whetstone-town-CraB3D/work/council/proposals/morphyx-listing.mjs').catch(e => ({err: e.message}));
const j = f => JSON.parse(readFileSync('/tmp/dry/back-' + f + '.json')).records;
const [root] = j('game'), [sheet] = j('sheet'), moves = j('move'), [snap] = j('snapshot');
console.log('check.js on the sheet as written to the lexicon:');
console.log(checkSheet(sheet.value, { uri: root.uri, cid: root.cid }));
console.log('check.js with actions turned back into an object map:');
const m = { ...sheet.value, actions: Object.fromEntries(sheet.value.actions.map(a => [a.action, a.dots])) };
console.log(checkSheet(m, { uri: root.uri, cid: root.cid }));
if (L.err) console.log('listing import:', L.err); else {
  const ask = moves.find(x => x.value.kind === 'ask');
  // indexedAt is not on listRecords; use createdAt as stand-in and say so
  const rows = L.listings({ gm: root.value.gm, witness: root.value.witness, dice: root.value.dice, seats: root.value.seats },
    [{ uri: ask.uri, did: root.value.gm, sheet: ask.value.sheet.uri, indexedAt: ask.value.createdAt }],
    [{ did: root.value.gm, indexedAt: snap.value.createdAt, asks: snap.value.asks.map(a => a.uri) }], 300, Date.now()/1000);
  console.log('listings():', JSON.stringify(rows));
}
