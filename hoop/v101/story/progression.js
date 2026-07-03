// hoop/story/progression.js — DERIVE the storyboard, the tier-advancement milestones, and the
// world-flag manifest FROM hoopy's content. Pure, no DOM, no LLM.
//
// The old early-game progression was a hand-authored fixture (v095 storyboard.json beats keyed on
// flag.met_olo / flag.sevin_believes, advance.js's hardcoded MILESTONES, the pinned Bay-14 opening).
// If his story is canon, that scaffold has to go: the climb "out and down" is HIS — his plot_beats are
// the storyboard, his flag graph is the advancement, his bible's ladders are the tier names. This
// derives all of it, so the hand-authored files become a fallback, not the source.
//
// It is exactly as complete as his export. His plot_beats already carry title/description/tier/refs; the
// flag wiring (trigger_conditions / produces) is sparse in the published gallery but rich in his machine
// export — so a beat gates on its trigger flags WHEN PRESENT, and tier-paces (min_narrative) when not.
// Drop in his full export and the storyboard becomes fully flag-gated with no code change.

import { slug } from './import.js';

// The bible's ladders (his canon tier names) — the acts the beats climb through.
export const NARRATIVE_LADDER = ['Arrival', 'Orientation', 'Investigation', 'Convergence', 'Resolution'];
export const REVELATION_LADDER = ['The Ordinary', 'The Curve', 'The Vessel', 'The Approach', 'The Purpose'];
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];

const flagsToFacts = (flags) => { const f = {}; for (const k of flags || []) f[String(k).split('=')[0].trim()] = true; return f; };

// a beat's marker: pick the most NAVIGABLE of its refs (a named NPC → its anchor; a terminal; the
// rind/shaft/signal-chamber → the descent; else a concrete place, skipping abstractions like "The Seven").
// The surface (resolveMarker) turns {anchor|terminal|place} into a world position; the hint always shows.
const ABSTRACT = /^the (seven|ship|player|drift|continuants|rind-?walkers)$/i;
function deriveMarker(beat, npcNames) {
  const refs = beat.refs || [];
  for (const r of refs) { const id = npcNames.get(String(r).toLowerCase()); if (id) return { anchor: id, hint: 'find ' + r }; }
  for (const r of refs) if (/terminal/i.test(r)) return { terminal: true, hint: r };
  for (const r of refs) if (/shaft|rind|signal|deep|lower/i.test(r)) return { place: 'rind', hint: r };
  for (const r of refs) if (!ABSTRACT.test(String(r).trim())) return { place: r, hint: r };
  return refs[0] ? { hint: refs[0] } : null;
}

// content[] → a storyboard {chapter, acts, beats} in the shape board.js already consumes. Beats are his
// plot_beats, ordered by the climb (narrative, then revelation, then plot), chained sequentially.
export function deriveStoryboard(content, { chapter = 1 } = {}) {
  const npcNames = new Map();
  for (const c of content) if (c.type === 'npc') npcNames.set(((c.content || {}).name || '').toLowerCase(), c.id);

  const ord = content.filter((c) => c.type === 'plot_beat')
    .map((c) => ({ c, r: c.revelation_tier || 1, n: c.narrative_tier || 1, p: c.power_tier || 1 }))
    .sort((a, b) => a.n - b.n || a.r - b.r || a.p - b.p || (a.c.id < b.c.id ? -1 : 1));

  const beats = ord.map((o, i) => {
    const c = o.c, name = (c.content || {}).name || c.id, desc = (c.content || {}).description || '';
    const trig = (c.trigger_conditions && c.trigger_conditions.flags) || [];
    return {
      id: c.id, act: 'act-' + o.n, title: name, log: desc, done: desc,
      requires: i > 0 ? { beats: [ord[i - 1].c.id] } : {},                 // sequential chain
      // flag-gated when his export wires it; EXPOSURE-paced (XP from crystallizing his content) until
      // then. The ramp scales across the WHOLE storyboard (1→5 over N beats) — the old `1 + i` was
      // written for the 5-beat export and left every beat past the 4th uncompletable once his corpus
      // grew to 90 beats (power tiers cap at 5).
      completes_when: trig.length ? { facts: flagsToFacts(trig) } : { min_power: 1 + Math.floor((i * 5) / Math.max(ord.length, 5)) },
      advances: { narrative_tier: o.n, revelation_tier: o.r },
      marker: deriveMarker(c, npcNames),
      reveals: c.revelation_hint || desc,
    };
  });

  const tiers = [...new Set(ord.map((o) => o.n))].sort((a, b) => a - b);
  const acts = tiers.map((n) => ({
    id: 'act-' + n, label: (ROMAN[n] || n) + ' · ' + (NARRATIVE_LADDER[n - 1] || ('Tier ' + n)),
    narrative_tier: n, revelation_tier: Math.max(1, ...ord.filter((o) => o.n === n).map((o) => o.r)),
  }));
  return { chapter, acts, beats, _derived: true };
}

// The OPENING CAST: his Arrival NPCs (lowest narrative tier) — the principals pinned in the opening
// chunk (replacing the hand-pinned Olo/Sevin fixture). His Olo Vashti / Sevin / Solen are all in his
// pool, so the opening is authored by his story; placement is by the surface (spawn + far margins).
export function deriveOpeningCast(content, n = 3) {
  return content.filter((c) => c.type === 'npc')
    .sort((a, b) => (a.narrative_tier || 1) - (b.narrative_tier || 1) || (a.power_tier || 1) - (b.power_tier || 1) || (a.id < b.id ? -1 : 1))
    .slice(0, n);
}

// THE GUIDE CHAIN (bible §"Advancement — gather to descend"): one load-bearing guide per ZONE, blocking the
// way down until you've gathered enough. Pinned by name to hoopy's NPCs, in tier order:
//   tier 1 The Commons → Olo Vashti · 2 The Wards → Factor Solen · 3 The Upper Rind → Sevin · 4 The Lower
//   Rind → Luna. guideFor()/guideForTier() index this list per tier, so "return to your guide" always names
// + routes to the right one. Any name not found falls back to a lowest-tier NPC, so the chain never breaks.
export const BIBLE_GUIDE_NAMES = ['olo', 'solen', 'sevin', 'luna'];
export function pickBibleGuides(content, names = BIBLE_GUIDE_NAMES, n = names.length) {
  const npcs = content.filter((c) => c.type === 'npc');
  const nameOf = (c) => String((c.content || {}).name || '').toLowerCase();
  const fallback = deriveOpeningCast(content, n + 6);
  const out = [], used = new Set();
  let fi = 0;
  for (let t = 0; t < n; t++) {
    let g = npcs.find((c) => !used.has(c.id) && nameOf(c).includes(names[t]));
    if (!g) { while (fi < fallback.length && used.has(fallback[fi].id)) fi++; g = fallback[fi++] || null; }
    if (g) { out.push(g); used.add(g.id); }
  }
  return out;
}

// content[] → advance.js milestones: a beat that ADVANCES a tier and gates on real flags becomes a tier
// floor. (Tier-paced beats with no flags produce no milestone — advancement stays flag-driven, his way.)
export function deriveMilestones(storyboard) {
  const out = [];
  for (const b of (storyboard.beats || [])) {
    const facts = (b.completes_when || {}).facts; if (!facts || !Object.keys(facts).length) continue;
    const a = b.advances || {};
    if (a.narrative_tier) out.push({ id: 'nar' + a.narrative_tier + '-' + b.id, axis: 'narrative_tier', to: a.narrative_tier, requires: { facts } });
    if (a.revelation_tier) out.push({ id: 'rev' + a.revelation_tier + '-' + b.id, axis: 'revelation_tier', to: a.revelation_tier, requires: { facts } });
  }
  return out;
}

// content[] → the world/runtime flag manifest, DERIVED (replaces import.js's static WORLD_FACTS): the
// facts/items his pool gates on that nothing in the pool produces — set by the runtime/storyboard
// (the journey flags) or player-intrinsic. This is what feeds the gate's assumed-satisfiable boundary.
export function deriveWorldFlags(content) {
  const produced = new Set(), pool = new Set(), reqF = new Set(), reqI = new Set();
  for (const c of content) {
    for (const f of (c.produces && c.produces.sets) || []) produced.add(f);
    const nodes = (c.content && c.content.dialogue && c.content.dialogue.nodes) || {};
    for (const n of Object.values(nodes)) for (const ch of (n.choices || [])) for (const k of Object.keys((ch.effects && ch.effects.set_facts) || {})) produced.add(k);
    if (c.type === 'item') { pool.add(((c.content || {}).name || '').toLowerCase()); for (const t of c.tags || []) pool.add(String(t).toLowerCase()); }
    for (const k of Object.keys((c.requires && c.requires.facts) || {})) reqF.add(k);
    for (const it of (c.requires && c.requires.items) || []) reqI.add(String(it).toLowerCase());
  }
  return { facts: [...reqF].filter((f) => !produced.has(f)), items: [...reqI].filter((i) => !pool.has(i)) };
}
