// node b/lathe/live.smoke.mjs [handle] [other] [listUrl]
//
// THE GATE THE PURE SELFTESTS CANNOT BE. runtime.selftest.mjs proves every node
// NAME has an executor — but a name having an executor does not mean every
// BINDING of it runs. A `list` subject bound to the `posts` source shipped broken
// for exactly that reason: the executor existed, but nothing expanded the list
// into its members, so it asked the API for actor=undefined and got a 400.
//
// So this hits the network and runs every (subject × source) pair the engine can
// mint, plus one toy per view. Requires internet; run it before shipping engine
// or runtime changes.

import { SUBJECTS, SOURCES, LENSES, VIEWS, generateToy, validate } from './engine.js';
import { runToy } from './runtime.js';

const HANDLE = process.argv[2] || 'jay.bsky.team';
const OTHER = process.argv[3] || 'pfrazee.com';
const LIST = process.argv[4] || 'https://bsky.app/profile/did:plc:z72i7hdynmk6r22z27h6tvur/lists/3joyofnvxvp2r';

let failures = 0;
const ok = (m) => console.log(`  ✓ ${m}`);
const bad = (m) => { failures++; console.error(`  ✗ ${m}`); };

// The thinnest VALID genome for one (subject, source) pair. Nothing draws a
// `posts` port directly, so when the source emits one we add the first compatible
// lens to reach something a view can consume — otherwise the probe itself would
// be ill-typed and we'd be testing the test, not the binding.
function probe(subject, source) {
  let port = SOURCES[source].out;
  const chain = [];
  let view = Object.keys(VIEWS).find((v) => VIEWS[v].in === port);
  if (!view) {
    const lens = Object.keys(LENSES).find((k) =>
      LENSES[k].in === port && (!LENSES[k].pair || subject === 'two') &&
      Object.values(VIEWS).some((v) => v.in === LENSES[k].out));
    if (!lens) return null;
    chain.push({ lens, params: LENSES[lens].params ? LENSES[lens].params(() => 0.5) : {} });
    port = LENSES[lens].out;
    view = Object.keys(VIEWS).find((v) => VIEWS[v].in === port);
  }
  return { seed: 'probe', subject, source, chain, view, sink: 'none', port, limit: 60, topK: 20, scope: null };
}

console.log(`— every subject × source binding runs —`);
console.log(`  handle=${HANDLE} other=${OTHER}`);
for (const subject of Object.keys(SUBJECTS)) {
  for (const source of Object.keys(SOURCES)) {
    if (!SOURCES[source].subjects.includes(subject)) continue;
    const g = probe(subject, source);
    if (!g) { bad(`${subject} × ${source} — no valid probe genome exists`); continue; }
    const v = validate(g);
    if (!v.ok) { bad(`${subject} × ${source} — probe did not certify: ${v.errors.join('; ')}`); continue; }
    const t0 = Date.now();
    try {
      const d = await runToy(g, { handle: HANDLE, other: OTHER, list: LIST }, {});
      const n = d.meta.total;
      const secs = ((Date.now() - t0) / 1000).toFixed(1);
      if (n > 0) ok(`${subject} × ${source} — ${n} rows in ${secs}s`);
      else bad(`${subject} × ${source} — ran but returned NOTHING in ${secs}s`);
    } catch (e) {
      bad(`${subject} × ${source} — ${e.message}`);
    }
  }
}

console.log('\n— a real generated toy per view —');
{
  // walk seeds until each view has been exercised by a genuine generated genome
  const want = new Set(Object.keys(VIEWS));
  for (let i = 1; i < 400 && want.size; i++) {
    const g = generateToy(String(i));
    if (!want.has(g.view)) continue;
    want.delete(g.view);
    try {
      const d = await runToy(g, { handle: HANDLE, other: OTHER, list: LIST }, {});
      if (d.meta.total > 0) ok(`№${i} ${g.view.padEnd(8)} ${g.tagline} — ${d.meta.total} rows`);
      else bad(`№${i} ${g.view.padEnd(8)} ${g.tagline} — EMPTY`);
    } catch (e) { bad(`№${i} ${g.view} ${g.tagline} — ${e.message}`); }
  }
  if (want.size) bad(`views never exercised: ${[...want].join(', ')}`);
}

console.log(`\n${failures === 0 ? '✓ all live gates passed' : `✗ ${failures} live gate(s) failed`}`);
process.exit(failures ? 1 : 0);
