#!/usr/bin/env node
// hoop/scripts/nave-readiness.mjs — IS THE SOCIAL NAVE SHIPPABLE?
//
// The Nave is zones 1-2 (Commons + Wards): the social half of Chapter One, where the player
// gathers lore by TALKING rather than by descending. This script answers one question about a
// content rev — can a player actually walk it from waking in Bay 14 to clearing the Wards? — by
// running the rev through the LIVE pipeline (import → review → anchors → solvable) and checking
// the result against what the bible asks each nave zone to deliver.
//
//   node hoop/scripts/nave-readiness.mjs [world_export.json] [--verbose]
//
// Defaults to the extracted content rev. Exits non-zero if the nave would not ship, so this can
// gate a content pass the same way prove-solvable.mjs gates the live pool.
//
// It reports three kinds of thing, and the distinction matters when reading the output:
//   BLOCK — the campaign is broken; a player cannot finish the nave.
//   GAP   — the campaign works but the bible asks for more than the rev delivers (coverage).
//   NOTE  — worth knowing, not worth blocking on.

import { readFileSync } from 'node:fs';
import { importWorldExport, worldExternal } from '../v110/story/import.js';
import { reviewBatch } from '../v110/story/review.js';
import { anchorChain, gateSetters } from '../v110/story/anchors.js';
import { proveProgression } from '../v110/story/solvable.js';

// ── what the bible asks of the nave ──────────────────────────────────────────────────────────
// §"The Four Zones": zone 1 gathers "the three factions' public faces"; zone 2 "deep knowledge of
// each faction". §"Advancement": one load-bearing guide per zone — Olo Vashti, then Factor Solen.
// §"The Nave and its Economy": thirteen verbs, and the Commons shows "at least one room of every
// verb". §"Zone 2": "six faction wards, TWO per faction".
export const FACTIONS = ['continuant', 'drift', 'rindwalker'];
export const VERBS = ['dwell', 'grow', 'make', 'mend', 'trade', 'serve', 'play',
                      'heal', 'learn', 'worship', 'govern', 'move', 'store'];
export const NAVE_ZONES = ['commons', 'wards'];
export const WARDS_PER_FACTION = 2;

// §"The Three Nave Factions": each faction owns two EXCLUSIVE verbs and two shared. The exclusive
// pairs are also, independently, `rind/upperrind/verbflow.js`'s WARD_VERBS — the structure wing
// and the bible arrived at the same six. So a faction's two wards are its two exclusive verbs:
// that is what makes a ward *the society itself* rather than another public room.
export const EXCLUSIVE_VERBS = { continuant: ['govern', 'grow'], drift: ['learn', 'play'], rindwalker: ['worship', 'mend'] };
export const SHARED_VERBS = { continuant: ['serve', 'heal'], drift: ['move', 'trade'], rindwalker: ['make', 'store'] };
export const WARD_VERBS = Object.values(EXCLUSIVE_VERBS).flat();
// every verb's owning faction (dwell is the 13th and belongs to nobody — "homes emit people").
export const VERB_FACTION = (() => {
  const m = { dwell: 'neutral' };
  for (const f of FACTIONS) for (const v of [...EXCLUSIVE_VERBS[f], ...SHARED_VERBS[f]]) m[v] = f;
  return m;
})();
// the anchor per nave tier: tier → {who, deck}. The deck id is decks.js's, and the turn-in flag
// is `flag.deck.<deck>.cleared` (anchors.js CLEAR_RE) — that flag IS the level-up.
export const NAVE_ANCHORS = { 1: { who: 'Olo Vashti', deck: 'nave', zone: 'commons' },
                              2: { who: 'Factor Solen', deck: 'curve', zone: 'wards' } };
// the gate flags each nave anchor is expected to hold the way down on.
export const NAVE_GATES = {
  1: FACTIONS.map((f) => `flag.commons.${f}_face`),
  2: FACTIONS.map((f) => `flag.ward.${f}_known`),
};

const findings = { BLOCK: [], GAP: [], NOTE: [] };
const add = (kind, msg) => findings[kind].push(msg);

export function checkNave(doc, { verbose = false } = {}) {
  const { content } = importWorldExport(doc);
  const raw = doc.content_pool?.items || doc.items || [];
  const naveRaw = raw.filter((r) => NAVE_ZONES.includes(r.content?.zone));

  // ── 1. does it even import and review? ─────────────────────────────────────────────────────
  const review = reviewBatch([], content, [], { external: worldExternal(content) });
  if (review.verdict !== 'PASS') {
    for (const c of review.conflicts) add('BLOCK', `review ${c.code}: ${c.id} — ${c.msg}`);
  }
  const unapproved = content.filter((c) => c.approved !== true).length;
  if (unapproved) add('NOTE', `${unapproved}/${content.length} items are not approved — the engine withholds them until they are`);

  // ── 2. the anchors: the spine the whole nave hangs on ──────────────────────────────────────
  const chain = anchorChain(content);
  const setters = gateSetters(content);
  for (const [tierStr, want] of Object.entries(NAVE_ANCHORS)) {
    const tier = +tierStr;
    const a = chain.find((x) => x.tier === tier);
    if (!a) {
      add('BLOCK', `tier ${tier}: no load-bearing anchor (${want.who}). Needs content.load_bearing = {tier: ${tier}, gates: [...]} and a turn-in choice setting flag.deck.${want.deck}.cleared`);
      continue;
    }
    if (!a.clearedFlag) add('BLOCK', `tier ${tier} anchor '${a.name}': no turn-in choice sets flag.deck.*.cleared — the tier can never advance`);
    else if (a.clearedDeck !== want.deck) add('NOTE', `tier ${tier} anchor '${a.name}' clears deck '${a.clearedDeck}' (expected '${want.deck}')`);
    if (!a.gates.length) add('BLOCK', `tier ${tier} anchor '${a.name}' gates on nothing — the turn-in is free, so no exploration is required`);
    if (a.zone && a.zone !== want.zone) add('NOTE', `tier ${tier} anchor '${a.name}' is seated in '${a.zone}' (bible puts them in '${want.zone}')`);
  }

  // ── 3. gate coverage: every faction, both zones ────────────────────────────────────────────
  for (const [tierStr, gates] of Object.entries(NAVE_GATES)) {
    for (const g of gates) {
      if (!setters[g]) add('GAP', `no keeper sets '${g}' — the bible asks tier ${tierStr} to gather all three factions`);
    }
  }
  // any gate an anchor DECLARES but nothing sets is fatal, not a gap.
  for (const a of chain.filter((x) => x.tier <= 2)) {
    for (const g of a.gates) if (!setters[g]) add('BLOCK', `anchor '${a.name}' gates on '${g}' which NOTHING in the pool sets — the turn-in can never open`);
  }

  // ── 4. coverage the bible asks for by name ─────────────────────────────────────────────────
  const commons = naveRaw.filter((r) => r.content.zone === 'commons');
  const wards = naveRaw.filter((r) => r.content.zone === 'wards');

  const commonsVerbs = new Set(commons.map((r) => r.content.verb).filter(Boolean));
  const missingVerbs = VERBS.filter((v) => !commonsVerbs.has(v));
  if (missingVerbs.length) {
    add('GAP', `Commons shows ${commonsVerbs.size}/13 verbs — the bible says "at least one room of every verb appears". Missing: ${missingVerbs.join(', ')}`);
  }

  const wardsByFaction = {};
  for (const r of wards) {
    const f = r.content.nave_faction || r.content.faction;
    if (f) (wardsByFaction[f] = wardsByFaction[f] || []).push(r.content.name);
  }
  for (const f of FACTIONS) {
    const n = (wardsByFaction[f] || []).length;
    if (n < WARDS_PER_FACTION) add('GAP', `${f} has ${n}/${WARDS_PER_FACTION} wards — the bible says "six faction wards, two per faction"`);
  }

  // a ward should be built around one of its faction's two EXCLUSIVE verbs — that is what makes it
  // the society rather than another public room. Off-verb wards are the commonest near-miss.
  const wardVerbsSeen = new Set();
  for (const r of wards) {
    const f = r.content.nave_faction || r.content.faction, v = r.content.verb;
    if (!f || !v) continue;
    wardVerbsSeen.add(v);
    const own = EXCLUSIVE_VERBS[f];
    if (own && !own.includes(v)) {
      add('GAP', `ward "${r.content.name}" is ${f}/${v}, but ${f}'s wards should be its exclusive verbs (${own.join(' or ')}) — '${v}' is ${VERB_FACTION[v] === f ? 'a shared verb' : `${VERB_FACTION[v]}'s`}`);
    }
  }
  const missingWardVerbs = WARD_VERBS.filter((v) => !wardVerbsSeen.has(v));
  if (missingWardVerbs.length) add('GAP', `no ward is built around: ${missingWardVerbs.join(', ')} — the six wards should cover all six exclusive verbs`);

  const commonsFactions = new Set(commons.map((r) => r.content.nave_faction || r.content.faction));
  for (const f of FACTIONS) if (!commonsFactions.has(f)) add('GAP', `no ${f} room in the Commons — the player cannot meet their public face`);

  // ── 5. does the campaign prove? ────────────────────────────────────────────────────────────
  // Approve a copy: an unapproved rev would fail for a reason that is about review state, not
  // about whether the content forms a walkable campaign, which is what this script is asking.
  const asApproved = content.map((c) => ({ ...c, approved: true }));
  const prog = proveProgression(asApproved, {});
  for (const i of (prog.issues || [])) {
    if (i.tier > 2) continue;                                   // the nave is tiers 1-2
    add(i.level === 'error' ? 'BLOCK' : 'GAP', `solvable ${i.code} (tier ${i.tier}): ${i.msg}`);
  }

  return { content, chain, setters, review, prog, commons, wards, commonsVerbs, wardsByFaction, naveRaw, verbose };
}

// ── CLI ──────────────────────────────────────────────────────────────────────────────────────
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (isMain) {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose');
  const path = args.find((a) => !a.startsWith('--'))
    || new URL('../v110/test/fixtures/content-rev-2026-08.json', import.meta.url).pathname;

  const doc = JSON.parse(readFileSync(path, 'utf8'));
  const r = checkNave(doc, { verbose });

  console.log(`\nNAVE READINESS — ${path.split('/').pop()}`);
  console.log('─'.repeat(72));
  console.log(`pool          ${r.naveRaw.length} nave bundles → ${r.content.length} content items (${r.commons.length} commons, ${r.wards.length} wards)`);
  console.log(`review        ${r.review.verdict}  (${r.review.conflicts.length} conflicts, ${r.review.warnings.length} warnings)`);
  console.log(`anchors       ${r.chain.filter((a) => a.tier <= 2).length}/2 nave anchors` +
              (r.chain.length ? `  [${r.chain.filter((a) => a.tier <= 2).map((a) => `t${a.tier} ${a.name}`).join(', ')}]` : ''));
  console.log(`gate setters  ${Object.keys(r.setters).filter((g) => /^flag\.(commons|ward)\./.test(g)).length} in the nave`);
  console.log(`verbs         ${r.commonsVerbs.size}/13 in the Commons`);
  console.log(`wards         ${FACTIONS.map((f) => `${f} ${(r.wardsByFaction[f] || []).length}`).join(' · ')}`);
  console.log(`progression   ${r.prog.solvable ? 'SOLVABLE' : 'BLOCKED'}`);

  if (verbose) {
    console.log('\nnave gate setters:');
    for (const [g, s] of Object.entries(r.setters)) {
      if (!/^flag\.(commons|ward)\./.test(g)) continue;
      console.log(`  ${g.padEnd(34)} ← ${s.name} (${s.room}, ${s.zone}/${s.verb})`);
    }
  }

  for (const kind of ['BLOCK', 'GAP', 'NOTE']) {
    if (!findings[kind].length) continue;
    console.log(`\n${kind} ×${findings[kind].length}`);
    for (const m of findings[kind]) console.log(`  • ${m}`);
  }

  const ok = findings.BLOCK.length === 0;
  console.log('\n' + '─'.repeat(72));
  console.log(ok
    ? `NAVE SHIPS${findings.GAP.length ? ` — with ${findings.GAP.length} coverage gap${findings.GAP.length > 1 ? 's' : ''}` : ''}`
    : `NAVE DOES NOT SHIP — ${findings.BLOCK.length} blocker${findings.BLOCK.length > 1 ? 's' : ''}`);
  process.exit(ok ? 0 : 1);
}
