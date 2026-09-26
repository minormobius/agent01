// craft/projects.mjs — long-range goals, broken into steps Jev can see.
//
// Jev decides one macro at a time and does not plan. A goal that takes days
// (grow every species this world has, see all of it) only works if every
// option says, computed, what it does for that goal right now: completes the
// next step, works toward it, helps a later step, or nothing. That is the
// composer's lesson (hand over the gap it closes, pre-computed: regret
// 0.717 → 0.020) applied to a long horizon. The model picks the project,
// rarely; and picks the step's option, often.
//
// A step: { id, label, done(sim), needs(sim) → Set of option tokens that
// advance it, complete(sim) → the token that finishes it (or null),
// waiting(sim) → a reason there is nothing to do but wait (or null) }.
// Option tokens are what an option does or yields: an item name
// ('cobblestone'), 'craft:<item>', 'forage:<sp>', 'farm:<sp>', 'harvest',
// 'explore', 'scout:<what>', 'build_house', 'light_area'.

import { B, BUILDING, SPECIES, SPECIES_NAMES } from './world.mjs';
import { shortfall, describeShort, ripePlots, growingPlots, visiblePlants, chestItems, surplus } from './macros.mjs';
import { needsFarmland, eta, speciesHere } from './plants.mjs';

const itemStep = (id, item, q = 1, done) => ({
  id, label: `make ${q > 1 ? q + ' ' : 'a '}${item.replace(/_/g, ' ')}${q > 1 ? 's' : ''}`.replace('torchs', 'torches'),
  done,
  needs: (s) => { const sh = shortfall(s, item, q); return new Set(Object.keys(sh).length ? Object.keys(sh) : [`craft:${item}`]); },
  complete: (s) => Object.keys(shortfall(s, item, q)).length ? null : `craft:${item}`,
  detail: (s) => { const sh = shortfall(s, item, q); return Object.keys(sh).length ? `short of ${describeShort(sh)}` : 'can be crafted now'; },
});
// visiblePlants scans the seen world; memoised per tick, player and inventory
const _vis = new WeakMap();
function vis(s, sp) {
  const key = `${s.tick}:${s.player.id}:${s.seenCount}:${s.cultivated.size}`;
  let m = _vis.get(s);
  if (!m || m.key !== key) { m = { key, by: {} }; _vis.set(s, m); }
  return (m.by[sp] ??= visiblePlants(s, sp).length);
}
const blocksHeld = (s) => BUILDING.reduce((n, k) => n + (s.inv[k] || 0), 0);
// the team's pool counts: what is in the shared chest is everyone's
const blocksPooled = (s) => blocksHeld(s) + BUILDING.reduce((n, k) => n + (chestItems(s)[k] || 0), 0);
const houseNeed = (s) => 30 * Math.min(3, s.players.length);
const hasBed = (s) => s.has('bed') || !!(s.player.bedAt && s.get(s.player.bedAt[0], s.player.bedAt[1]) === B.bed);

const TECH_BASE = [
  itemStep('wooden_pickaxe', 'wooden_pickaxe', 1, (s) => s.pickTier() >= 1),
  itemStep('stone_pickaxe', 'stone_pickaxe', 1, (s) => s.pickTier() >= 2),
  itemStep('stone_sword', 'stone_sword', 1, (s) => s.has('stone_sword') || s.has('iron_sword')),
  itemStep('torches', 'torch', 4, (s) => s.has('torch', 4) || !!s._lit),
  itemStep('iron_pickaxe', 'iron_pickaxe', 1, (s) => s.pickTier() >= 3),
  { id: 'house', label: 'build a house for the whole team', done: (s) => !!s._house,
    needs: (s) => blocksPooled(s) < houseNeed(s) ? new Set(['cobblestone', 'dirt', 'store']) : new Set(['build_house']),
    complete: (s) => blocksPooled(s) >= houseNeed(s) ? 'build_house' : null,
    detail: (s) => blocksPooled(s) < houseNeed(s) ? `needs ~${houseNeed(s)}+ building blocks for ${s.players.length}, the team holds ${blocksPooled(s)}` : 'ready to build' },
  { id: 'lit_grounds', label: 'light around the house', done: (s) => !!s._lit,
    needs: (s) => !s._house ? new Set() : s.has('torch') || s.has('coal') || s.has('charcoal') ? new Set(['light_area']) : new Set(['coal']),
    complete: (s) => s._house && (s.has('torch') || s.has('coal')) ? 'light_area' : null,
    detail: (s) => !s._house ? 'needs the house first' : 'torches around home' },
  itemStep('iron_sword', 'iron_sword', 1, (s) => s.has('iron_sword')),
];
// a team also needs its pool; everyone needs a bed (the night only passes
// when every player is asleep)
const CHEST_STEP = { id: 'chest', label: 'set up the team chest', done: (s) => s.team.chest != null,
  needs: (s) => { const sh = shortfall(s, 'chest', 1); return new Set(Object.keys(sh).length && !s.has('chest') ? Object.keys(sh) : ['set_up_chest']); },
  complete: (s) => Object.keys(shortfall(s, 'chest', 1)).length && !s.has('chest') ? null : 'set_up_chest',
  detail: (s) => { const sh = shortfall(s, 'chest', 1); return Object.keys(sh).length && !s.has('chest') ? `short of ${describeShort(sh)}` : 'can be made and placed now'; } };
const BED_STEP = { id: 'bed', label: 'a bed of your own', done: hasBed,
  needs: (s) => { const sh = shortfall(s, 'bed', 1); return new Set(Object.keys(sh).length ? [...Object.keys(sh), ...(sh.wool ? ['hunt:sheep', 'scout:sheep'] : [])] : ['craft:bed']); },
  complete: (s) => Object.keys(shortfall(s, 'bed', 1)).length ? null : 'craft:bed',
  detail: (s) => { const sh = shortfall(s, 'bed', 1); return Object.keys(sh).length ? `short of ${describeShort(sh)}${sh.wool ? ' (sheep give wool)' : ''}` : 'can be crafted now'; } };
const TECH = (sim) => sim.players.length > 1
  ? [...TECH_BASE.slice(0, 5), CHEST_STEP, ...TECH_BASE.slice(5, 7), BED_STEP, TECH_BASE[7]]
  : [...TECH_BASE, BED_STEP];

function growSteps(sim) {
  const here = speciesHere(sim);
  const grown = (s, sp) => ((s.player.grown || {})[sp] || 0) > 0;
  const plotted = (s, sp) => [...ripePlots(s), ...growingPlots(s)].some((q) => q.sp === sp);
  const steps = [];
  if (here.some(needsFarmland)) steps.push({ ...itemStep('hoe', 'wooden_hoe', 1, (s) => s.has('wooden_hoe')), label: 'make a hoe (for farmland)' });
  for (const sp of here) {
    steps.push({ id: `seeds:${sp}`, label: `get ${sp} seeds`,
      done: (s) => grown(s, sp) || plotted(s, sp) || s.has(`${sp}_seeds`),
      needs: (s) => vis(s, sp) ? new Set([`forage:${sp}`]) : new Set([`scout:${sp}`, 'explore']),
      complete: (s) => vis(s, sp) ? `forage:${sp}` : null,
      detail: (s) => vis(s, sp) ? `a wild ${sp} is in sight` : (s.player.found || {})[sp] ? `seen before, not in sight now` : `not found yet — ${SPECIES[sp].doc}` });
    steps.push({ id: `plant:${sp}`, label: `plant ${sp}`,
      done: (s) => grown(s, sp) || plotted(s, sp),
      needs: (s) => needsFarmland(sp) && !s.has('wooden_hoe') ? new Set(['craft:wooden_hoe', 'planks', 'log']) : new Set([`farm:${sp}`]),
      complete: () => `farm:${sp}`,
      detail: () => SPECIES[sp].doc });
    steps.push({ id: `grow:${sp}`, label: `grow and harvest ${sp}`,
      done: (s) => grown(s, sp),
      needs: (s) => ripePlots(s).some((q) => q.sp === sp) ? new Set(['harvest']) : new Set(),
      complete: (s) => ripePlots(s).some((q) => q.sp === sp) ? 'harvest' : null,
      waiting: (s) => {
        if (ripePlots(s).some((q) => q.sp === sp)) return null;
        const g = growingPlots(s).filter((q) => q.sp === sp);
        if (!g.length) return null;
        const t = Math.min(...g.map((q) => eta(s, sp, q.c, q.y, BLOCKS_STAGE(s, q))));
        return `${sp} is growing: ripe in about ${t} ticks`;
      },
      detail: () => 'reap it when ripe' });
  }
  return steps;
}
const BLOCKS_STAGE = (s, q) => { const id = s.get(q.c, q.y); return id === B[`${q.sp}_sprout`] ? 0 : id === B[`${q.sp}_growing`] ? 1 : 2; };

function exploreSteps(sim) {
  const pct = (s) => s.seenCount / s.N;
  const steps = [0.5, 0.8, 0.95].map((f) => ({ id: `seen:${f}`, label: `see ${Math.round(f * 100)}% of the world`,
    done: (s) => pct(s) >= f, needs: () => new Set(['explore']), complete: () => null,
    detail: (s) => `seen ${Math.round(pct(s) * 100)}%` }));
  for (const sp of speciesHere(sim)) steps.push({ id: `find:${sp}`, label: `find a wild ${sp}`,
    done: (s) => !!(s.player.found || {})[sp], needs: () => new Set([`scout:${sp}`, 'explore']), complete: () => `scout:${sp}`,
    detail: () => SPECIES[sp].doc });
  return steps;
}

export const PROJECTS = {
  tech: { aim: 'climb the tech ladder: tools, a house for the team, its shared chest, light, beds, iron', steps: (sim) => TECH(sim) },
  grow: { aim: 'find and cultivate every plant species this world has — some grow only on particular tile shapes', steps: growSteps },
  explore: { aim: 'see the whole world and find where each wild plant grows', steps: exploreSteps },
};
export const PROJECT_NAMES = Object.keys(PROJECTS);

// Where a project stands: done count, the next step that can be worked on
// now, and what is only waiting (growing).
export function projectState(sim, name) {
  const steps = PROJECTS[name].steps(sim);
  const open = steps.filter((st) => !st.done(sim));
  const waiting = open.map((st) => st.waiting && st.waiting(sim)).filter(Boolean);
  const actionable = open.filter((st) => !(st.waiting && st.waiting(sim)));
  // needs, computed once per state (labelling every option reuses them)
  const withNeeds = actionable.map((step) => ({ step, needs: step.needs(sim), fin: step.complete(sim) }));
  return { name, steps, done: steps.length - open.length, total: steps.length, complete: !open.length, next: actionable[0] || null, later: actionable.slice(1), waiting, withNeeds };
}

// The fact each option carries about the current project.
export function projectFact(sim, st, tokens) {
  if (!st) return null;
  if (st.complete) return `nothing: the ${st.name} project is complete`;
  const hit = (w) => [...tokens].some((t) => w.needs.has(t));
  const [first, ...rest] = st.withNeeds;
  if (first && hit(first)) {
    return first.fin && tokens.has(first.fin) ? `completes the next step of ${st.name}: ${first.step.label}` : `works toward the next step of ${st.name}: ${first.step.label} (${first.step.detail(sim)})`;
  }
  const later = rest.find(hit);
  if (later) return `helps a later step of ${st.name}: ${later.step.label}`;
  return `not part of the ${st.name} project`;
}

// The slow question: which project. Asked when there is none, when it is
// complete, or twice a day.
export const PROJECT_EVERY = 2400;
export const projectDue = (sim) => !sim.project || projectState(sim, sim.project).complete || sim.tick - (sim._projectAt || 0) >= PROJECT_EVERY;
export function projectQuestion(sim) {
  const criteria = {};
  for (const name of PROJECT_NAMES) {
    const st = projectState(sim, name);
    criteria[name] = {
      aim: PROJECTS[name].aim,
      progress: `${st.done} of ${st.total} steps done`,
      ...(st.complete ? { status: 'COMPLETE — nothing left to do' } : { next_step: st.next ? `${st.next.label} (${st.next.detail(sim)})` : 'nothing to do now but wait' }),
      ...(st.waiting.length ? { waiting_on: st.waiting.join('; ') } : {}),
      ...(sim.project === name ? { current: 'this is the current project' } : {}),
    };
  }
  return {
    type: 'choice',
    instructions: { task: 'Which long-range project should the player work on now? Every activity is labelled with what it does for the chosen project.' },
    criteria,
  };
}
export function setProject(sim, name) {
  if (!PROJECTS[name]) return;
  sim._projectAt = sim.tick;
  if (sim.project === name) return;
  sim.project = name;
  sim.note('project', { name, who: sim.player.id });
}
// the scripted choice: the ladder first, then growing, then the rest of the map
export function baselineProject(sim) {
  return PROJECT_NAMES.find((n) => !projectState(sim, n).complete) || 'explore';
}
// a score across all three, for the scoreboard: steps done per project
export function projectScore(sim) {
  const out = {};
  for (const n of PROJECT_NAMES) { const st = projectState(sim, n); out[n] = `${st.done}/${st.total}`; }
  out.grown = Object.keys(sim.player.grown || {}).length;
  out.species_here = speciesHere(sim).length;
  return out;
}
