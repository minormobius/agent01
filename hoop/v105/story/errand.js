// errand.js — CHAMBER ERRANDS (v105). Pure, no DOM, node-tested.
//
// The quests and the fixtures, enmeshed: every keeper can fire off ONE errand keyed to their kept
// chamber's VERB — the task IS that verb's fixture. Go win at the arcade, clear a gauntlet stage,
// have a stone set at the gem-wheel, eat at the counter. The keeper offers it in conversation (the
// surface renders a task row, no dialogue weave needed — errands are runtime, not content), the game
// counts the act on the fixture itself (act.<kind> counters bumped at each action site), and the
// player reports back to the keeper for the coin.
//
// THE VERB → FIXTURE AUDIT (sim.js FIXTURE_ACTION + the click dispatch):
//   grow→garden ❀ · serve→cafe ☕ · play→arcade ◉ + trainer ⚔ · make→bench ⚗ + smithy ⚒ ·
//   mend→lapidary ⬡ · trade→exchange ⇄ · learn→terminal ▤ · worship→oracle ☴ · govern→seal-stand ❦ ·
//   dwell→bed ✚ + chest ▣.
// Three verbs have NO fixture of their own and stretch to the nearest true act:
//   heal  → the mending REST (useBed heals and passes the night — the clinic's prescription),
//   store → the hold-CHEST deposit (the chest is a dwell wall fixture, but depositing IS storing),
//   move  → a DELIVERY (no fixture at all — so the fixture is a PERSON: carry a parcel to another
//           placed keeper; the ways-and-lifts verb quests as a courier run).
//
// State (all facts, save-riding): counters 'act.<kind>' (incrFact at each action site); the open/done
// book is one JSON fact 'cq.book' = { [npcId]: {kind, base, need, reward, target?, targetName?, ready?,
// done?} }. One errand per keeper per world (spent when done). An npc whose content carries
// `errand: false` never offers (hoopy's per-bundle kill switch); `?errands=off` kills the system.

import { hash32, pickVariant } from './weave.js';

// every act the game can count. `site` documents the hook (for the surface + the selftest).
export const ACTS = {
  plant: { site: 'garden plant', line: 'plant a seed in a grow-bed (❀)' },
  eat: { site: 'cafe eatFood', line: 'eat a meal at a counter (☕)' },
  arcadewin: { site: 'arcade win claim', line: 'win a cabinet game at an arcade (◉)' },
  trainer: { site: 'gauntlet stage clear', line: 'clear a stage of the gauntlet (⚔)' },
  forge: { site: 'smithy craft', line: 'forge a piece at a smithy (⚒)' },
  brew: { site: 'bench prepare', line: 'brew a preparation at a bench (⚗)' },
  lapidary: { site: 'lapidary cut/set/grow', line: 'have a stone cut, grown, or set at a gem-wheel (⬡)' },
  trade: { site: 'exchange buy/sell', line: 'buy or sell at an exchange (⇄)' },
  terminal: { site: 'openTerminal', line: 'read at a Tabard terminal (▤)' },
  oracle: { site: 'openOracle/openGeomancy', line: 'consult an oracle (☴)' },
  inkblot: { site: 'openInkblot', line: 'sit with the seals at a seal-stand (❦)' },
  chest: { site: 'chest deposit', line: 'lay something into a hold-chest (▣)' },
  rest: { site: 'useBed', line: 'take a night’s mending rest at a bed (✚)' },
  deliver: { site: 'openKeeper/openAnchor on the target', line: 'carry a sealed parcel to {target}' },
};

// verb → the errand variants that verb's keeper can set (seeded pick per keeper). Every verb covered.
export const ERRANDS = {
  grow: [{ kind: 'plant', need: 1, reward: 8 }],
  serve: [{ kind: 'eat', need: 1, reward: 8 }],
  play: [{ kind: 'arcadewin', need: 1, reward: 12 }, { kind: 'trainer', need: 1, reward: 12 }],
  make: [{ kind: 'forge', need: 1, reward: 10 }, { kind: 'brew', need: 1, reward: 10 }],
  mend: [{ kind: 'lapidary', need: 1, reward: 10 }],
  trade: [{ kind: 'trade', need: 1, reward: 8 }],
  learn: [{ kind: 'terminal', need: 1, reward: 8 }],
  worship: [{ kind: 'oracle', need: 1, reward: 8 }],
  govern: [{ kind: 'inkblot', need: 1, reward: 8 }],
  dwell: [{ kind: 'rest', need: 1, reward: 8 }, { kind: 'chest', need: 1, reward: 8 }],
  store: [{ kind: 'chest', need: 1, reward: 8 }],
  heal: [{ kind: 'rest', need: 1, reward: 8 }],
  move: [{ kind: 'deliver', need: 1, reward: 12 }],
};

// the keeper's voice around the task — variants picked by (npc id), stable per keeper.
const OFFER = [
  'The room could use a hand, if you have one to spare.',
  'There is a small thing this room wants done, and my post keeps me here.',
  'You look capable. The chamber has an errand, if you will carry it.',
];
const DONE = [
  'So it is done. The room settles a little. Here — the chamber pays its debts.',
  'Good hands. The ledger of small things balances. Take this.',
  'Done, and done well. The room remembers; so do I.',
];

const verbOf = (npc) => (npc && (npc.verb || (npc.content && npc.content.verb))) || null;
const optedOut = (npc) => !!(npc && npc.content && npc.content.errand === false);   // hoopy's per-bundle kill switch

// the errand this keeper sets (deterministic per npc id), or null (no verb / opted out / ambient).
export function errandFor(npc) {
  if (!npc || npc.type !== 'npc' || optedOut(npc) || (npc.content && npc.content.ambient)) return null;
  if (npc.content && npc.content.load_bearing) return null;   // the anchors GUIDE — their conversations stay errand-free
  if (npc.status && npc.status !== 'active') return null;     // the retired (the mystery's dead) set no errands
  const verb = verbOf(npc);
  const variants = ERRANDS[verb];
  if (!variants || !variants.length) return null;
  const def = variants[hash32('errand', npc.id) % variants.length];
  return {
    ...def, verb,
    task: ACTS[def.kind].line,
    offer: pickVariant(OFFER, 'errand-offer', npc.id),
    doneSays: pickVariant(DONE, 'errand-done', npc.id),
  };
}

// progress of one OPEN errand entry against the counters. entry = the cq.book record.
export function errandProgress(entry, facts) {
  if (!entry) return null;
  if (entry.kind === 'deliver') {
    const ready = entry.ready === true;
    return { count: ready ? 1 : 0, need: 1, ready };
  }
  const count = Math.max(0, (+((facts || {})['act.' + entry.kind]) || 0) - (entry.base || 0));
  return { count: Math.min(count, entry.need), need: entry.need, ready: count >= entry.need };
}

// the task line with the delivery target filled in.
export function errandTaskLine(entry) {
  const line = (ACTS[entry.kind] || {}).line || entry.kind;
  return line.replace('{target}', entry.targetName || 'the addressee');
}

export default { ACTS, ERRANDS, errandFor, errandProgress, errandTaskLine };
