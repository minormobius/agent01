#!/usr/bin/env node
// deck-cli.mjs — the zero-infrastructure "API" a local Claude drives over files.
// It wraps the same pure engine the website uses, so a local agent can ground
// itself and self-correct entirely offline:
//
//   node deck-cli.mjs manifest <deck.yaml|json>            # what's on the deck + verbs
//   node deck-cli.mjs check    <deck.yaml|json> [seq.json] # dry-run the sequence -> diagnostics
//   node deck-cli.mjs simulate <deck> <deviceId> <jointsJSON>  # one move's torque verdict
//
// Reads JSON natively; reads YAML if js-yaml is installed (npm i js-yaml).
// Exit code is non-zero when `check` finds errors, so it slots into a loop.

import { readFileSync } from 'node:fs';
import { objectToDeck } from './deckio.js';
import { buildManifest, checkSequence } from './manifest.js';
import { planDeviceMove, simulateDevice } from './deckengine.js';

async function parse(text) {
  try { return JSON.parse(text); } catch (_) {}
  try { const y = await import('js-yaml'); return y.load(text); }
  catch (_) { throw new Error('input is not JSON and js-yaml is not installed (npm i js-yaml) — pass a .json file'); }
}

const [, , cmd, file, a, b] = process.argv;
const out = (o) => console.log(JSON.stringify(o, null, 2));

async function main() {
  if (!cmd || !file) {
    console.error('usage: deck-cli <manifest|check|simulate> <deckFile> [...]');
    process.exit(2);
  }
  const deck = objectToDeck(await parse(readFileSync(file, 'utf8')));

  if (cmd === 'manifest') { out(buildManifest(deck)); return; }

  if (cmd === 'check') {
    const steps = a ? await parse(readFileSync(a, 'utf8')) : (deck.sequences[0] ? deck.sequences[0].steps : []);
    const report = checkSequence(deck, Array.isArray(steps) ? steps : steps.steps || []);
    out(report);
    process.exit(report.ok ? 0 : 1);
  }

  if (cmd === 'simulate') {
    if (!a || !b) { console.error('simulate needs <deviceId> <jointsJSON>'); process.exit(2); }
    const target = await parse(b);
    const mv = planDeviceMove(deck, a, target, {});
    if (!mv) { out({ ok: false, note: 'no move (target equals current pose or device not motorized)' }); return; }
    const sim = simulateDevice(deck, a, mv, 300);
    out({
      device: a, T: +mv.T.toFixed(3), bottleneck: mv.bottleneck,
      motors: Object.fromEntries(sim.motorKeys.map((k) => [k, { peakUtil: +sim.verdict.peakUtil[k].toFixed(2), stall: sim.verdict.stall[k], overspeed: sim.verdict.overspeed[k] }])),
      peakRacking: +Math.max(...sim.racking).toFixed(3),
    });
    return;
  }

  console.error(`unknown command "${cmd}"`); process.exit(2);
}
main().catch((e) => { console.error('error:', e.message); process.exit(2); });
