// craft/segment.mjs — tease a recorded game apart into episodes.
//
// A human plays in primitives: a step, a swing, a block placed. Nothing in the
// stream says "now I am mining for iron". This groups each player's actions
// into episodes and names each one in the palette's terms (gather_wood,
// mine_iron, explore, build_house, …) from what the actions did: what was
// mined, how far down, what was placed, what came out of the inventory.
//
// A macro-played stream carries its own labels (the macro notes), so the
// recogniser can be scored against them: `score()` says how often the name it
// guessed for an action matches the macro that actually took it. That number
// is what licenses reading a human's game with it.
//
// Pure: stream lines in, episodes out. Node and the browser both run it.

import { Replay } from './sim.mjs';
import { BLOCKS, BUILDING, H } from './world.mjs';

// the family each palette macro belongs to, for scoring at a coarser grain
export const FAMILY = {
  gather_wood: 'wood', mine_stone: 'mine', mine_coal: 'mine', mine_iron: 'mine', mine_diamond: 'mine', branch_mine: 'mine', mine_home: 'mine', surface: 'mine',
  dig_sand: 'mine', make_obsidian: 'mine', mine_glowstone: 'mine', mine_quartz: 'mine',
  explore: 'travel', scout: 'travel', go_home: 'travel', follow: 'travel', use_portal: 'travel',
  build_house: 'build', light_area: 'build', set_up_chest: 'build', build_portal: 'build', place_beacon: 'build', dig_in: 'build', set_home: 'build',
  craft: 'craft',
  fight: 'combat', guard: 'combat', hunt: 'food', eat: 'food', forage: 'farm', farm: 'farm', harvest: 'farm',
  sleep_in_bed: 'rest', sleep_until_dawn: 'rest',
  store: 'team', take: 'team', give: 'team',
};
const ORE = { coal_ore: 'mine_coal', iron_ore: 'mine_iron', diamond_ore: 'mine_diamond', glowstone: 'mine_glowstone', quartz_ore: 'mine_quartz', sand: 'dig_sand', obsidian: 'make_obsidian' };
const PLANT = (name) => /_(sprout|growing|plant)$/.test(name);

// One record per primitive action, with what it touched.
export function actions(lines) {
  const rep = new Replay(lines[0]);
  const out = [], open = new Map(), seats = new Map(), homes = new Map();
  const first = 0;                              // the first player's id; later ones name themselves
  for (const raw of lines.slice(1)) {
    const L = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const D = rep.dimState(L.d || 'overworld');
    for (const ev of L.e) {
      if (ev[0] === 'note') {
        const d = ev[2] || {};
        if (ev[1] === 'macro') open.set(d.who ?? first, { name: d.name, args: d.args });
        if (ev[1] === 'macro_end') open.delete(d.who ?? first);
        if (ev[1] === 'seat') seats.set(d.who, d.role);
        if (ev[1] === 'home') homes.set(d.who ?? first, d.c);
        continue;
      }
      if (ev[0] !== 'do') continue;
      const tail = ev[ev.length - 1], by = tail && typeof tail === 'object' ? tail.by : first;
      const args = ev.slice(1).filter((x) => typeof x !== 'object');
      const me = D.ents.get(by);
      const a = { k: L.k, who: by, dim: L.d || 'overworld', op: args[0], at: me ? [me.c, me.y] : null, macro: open.get(by)?.name ?? null, seat: seats.get(by) || null };
      if (a.op === 'mine' || a.op === 'till' || a.op === 'fill' || a.op === 'pour' || a.op === 'light' || a.op === 'sleep') {
        a.c = args[1]; a.y = args[2];
        a.block = BLOCKS[D.b[a.c * H + a.y]]?.name ?? null;
      }
      if (a.op === 'place' || a.op === 'plant') { a.c = args[1]; a.y = args[2]; a.item = args[3]; }
      if (a.op === 'craft' || a.op === 'eat') a.item = args[1];
      if (a.op === 'store' || a.op === 'take') { a.c = args[1]; a.y = args[2]; a.item = args[3]; }
      if (a.op === 'move') a.to = args[1];
      if (a.op === 'attack') a.target = D.ents.get(args[1])?.kind ?? null;
      if (a.op === 'travel') a.to = args[1];
      a.home = homes.get(by) ?? null;
      out.push(a);
    }
    rep.apply(L);
  }
  return out;
}

// What one action says about intent, on its own.
function cue(a) {
  switch (a.op) {
    case 'mine': {
      const b = a.block || '';
      if (b === 'log' || b === 'leaves') return 'gather_wood';
      if (PLANT(b)) return a.macro === 'forage' ? 'forage' : 'harvest';
      if (ORE[b]) return ORE[b];
      if (a.at && a.y < a.at[1]) return 'mine_stone';          // digging below the feet: going down
      return 'branch_mine';
    }
    case 'place': return a.item === 'torch' || a.item === 'lantern' ? 'light_area' : a.item === 'obsidian' ? 'build_portal' : a.item === 'chest' ? 'set_up_chest' : a.item === 'beacon' ? 'place_beacon' : a.item === 'bed' ? 'sleep_in_bed' : BUILDING.includes(a.item) || a.item === 'door' || a.item === 'glass' ? 'build_house' : 'craft';
    case 'craft': return 'craft';
    case 'eat': return 'eat';
    case 'attack': return a.target === 'pig' || a.target === 'sheep' ? 'hunt' : 'fight';
    case 'till': case 'plant': return 'farm';
    case 'sleep': return 'sleep_in_bed';
    case 'store': return 'store';
    case 'take': return 'take';
    case 'give': return 'give';
    case 'fill': case 'pour': return 'make_obsidian';
    case 'light': return 'build_portal';
    case 'travel': return 'use_portal';
    case 'move': return null;                                   // walking serves whatever it is between
    default: return null;
  }
}

// Episodes: runs of one intent. Walking takes the label of the work it leads
// to (or, a walk with no work at the end, travel: home if it ends there).
// Mining is summarised over the run, so a staircase that turned up iron reads
// as mine_iron, as the macro it most resembles would be named.
export function segment(lines, { gap = 40 } = {}) {
  const acts = actions(lines);
  const byWho = new Map();
  for (const a of acts) { if (!byWho.has(a.who)) byWho.set(a.who, []); byWho.get(a.who).push(a); }
  const episodes = [];
  for (const [who, list] of byWho) {
    // 1. label each action by its own cue; moves borrow the next cue within the gap
    const lab = list.map(cue);
    for (let i = list.length - 1, next = null, nextK = -1; i >= 0; i--) {
      if (lab[i]) { next = lab[i]; nextK = list[i].k; continue; }
      lab[i] = next && nextK - list[i].k <= gap ? next : null;
    }
    // a blip (one or two actions) between two runs of the same family is part
    // of them: a torch placed mid-tunnel, a stray block while building
    const fam0 = (l) => l && (FAMILY[l] === 'mine' ? 'dig' : l);
    for (let i = 0; i < lab.length; i++) {
      if (!lab[i]) continue;
      let j = i; while (j + 1 < lab.length && lab[j + 1] === lab[i]) j++;
      if (j - i < 2) {
        const before = lab.slice(0, i).reverse().find(Boolean), after = lab.slice(j + 1).find(Boolean);
        if (['light_area', 'build_house'].includes(lab[i]) && before && after && fam0(before) === fam0(after) && fam0(before) !== fam0(lab[i])) for (let t = i; t <= j; t++) lab[t] = before;
      }
      i = j;
    }
    // 2. runs; mining runs are one family ('dig'), named after the fact
    const fam = (l) => (l && FAMILY[l] === 'mine' && !['build_portal'].includes(l) ? 'dig' : l);
    let cur = null;
    const flush = () => { if (cur) { finish(cur); episodes.push(cur); cur = null; } };
    for (let i = 0; i < list.length; i++) {
      const a = list[i], f = fam(lab[i]) || 'walk';
      if (!cur || cur.f !== f || a.k - cur.to > gap || a.dim !== cur.dim) { flush(); cur = { who, f, dim: a.dim, from: a.k, to: a.k, acts: [], labels: [] }; }
      cur.acts.push(a); cur.labels.push(lab[i]); cur.to = a.k;
    }
    flush();
  }
  episodes.sort((x, y) => x.from - y.from || x.who - y.who);
  return episodes;
}
function finish(ep) {
  const acts = ep.acts, mined = {}, placed = {}, crafted = {};
  for (const a of acts) {
    if (a.op === 'mine' && a.block) mined[a.block] = (mined[a.block] || 0) + 1;
    if (a.op === 'place') placed[a.item] = (placed[a.item] || 0) + 1;
    if (a.op === 'craft') crafted[a.item] = (crafted[a.item] || 0) + 1;
  }
  const ys = acts.filter((a) => a.at).map((a) => a.at[1]);
  const first = acts.find((a) => a.at), last = [...acts].reverse().find((a) => a.at);
  ep.depth = ys.length ? { start: first.at[1], end: last.at[1], min: Math.min(...ys) } : null;
  ep.moves = acts.filter((a) => a.op === 'move').length;
  ep.mined = mined; ep.placed = placed; ep.crafted = crafted;
  if (ep.f === 'dig') {
    // named for the best thing it turned up; else by its shape
    const ore = ['diamond_ore', 'glowstone', 'quartz_ore', 'iron_ore', 'coal_ore', 'obsidian', 'sand'].find((b) => mined[b]);
    const up = ep.depth && ep.depth.end > ep.depth.start + 2;       // dug its way UP: back to the sky
    ep.label = up ? 'surface' : ore ? ORE[ore] : ep.depth && ep.depth.min < ep.depth.start - 2 ? 'mine_stone' : 'branch_mine';
  } else if (ep.f === 'walk') {
    const home = acts[0].home;
    ep.label = home != null && last && last.at[0] === home ? 'go_home' : ep.depth && ep.depth.end > ep.depth.start + 2 ? 'surface' : 'explore';
  } else ep.label = ep.f;
  ep.family = FAMILY[ep.label] || ep.label;
  // ground truth, when the stream has it: the macro that took most of these actions
  const tally = {};
  for (const a of acts) if (a.macro) tally[a.macro] = (tally[a.macro] || 0) + 1;
  const top = Object.entries(tally).sort((x, y) => y[1] - x[1])[0];
  ep.macro = top ? top[0] : null;
  ep.human = acts.some((a) => a.seat === 'human') && !top;
  ep.n = acts.length;
  delete ep.f; delete ep.labels;
  ep.acts = undefined;
}

// Score the recogniser on a macro-labelled stream: per action, does the
// episode's name (and family) match the macro that took the action?
export function score(lines) {
  const eps = segment(lines);
  const acts = actions(lines);
  const where = [];
  for (const e of eps) where.push(e);
  let n = 0, name = 0, family = 0;
  const confusion = {};
  // re-walk: segment() dropped the actions from the episodes, so match by (who, tick range)
  for (const a of acts) {
    if (!a.macro) continue;
    const e = eps.find((x) => x.who === a.who && x.from <= a.k && a.k <= x.to && x.dim === a.dim);
    if (!e) continue;
    n++;
    const truth = a.macro, fam = FAMILY[truth] || truth;
    if (e.label === truth) name++;
    if (e.family === fam) family++;
    const key = `${fam} → ${e.family}`;
    confusion[key] = (confusion[key] || 0) + 1;
  }
  // per macro RUN, each counted once: the label most of its actions got
  const runs = [];
  for (const a of acts) {
    if (!a.macro) continue;
    const last = runs.findLast((r) => r.who === a.who);
    if (last && last.macro === a.macro && a.k - last.to <= 1 + 60) { last.to = a.k; last.acts.push(a); } else runs.push({ who: a.who, macro: a.macro, to: a.k, acts: [a] });
  }
  let rn = 0, rname = 0, rfam = 0;
  const runConfusion = {};
  for (const r of runs) {
    const votes = {};
    for (const a of r.acts) { const e = eps.find((x) => x.who === a.who && x.from <= a.k && a.k <= x.to && x.dim === a.dim); if (e) votes[e.label] = (votes[e.label] || 0) + 1; }
    const top = Object.entries(votes).sort((x, y) => y[1] - x[1])[0];
    if (!top) continue;
    rn++;
    if (top[0] === r.macro) rname++;
    if ((FAMILY[top[0]] || top[0]) === (FAMILY[r.macro] || r.macro)) rfam++;
    const key = `${r.macro} → ${top[0]}`;
    runConfusion[key] = (runConfusion[key] || 0) + 1;
  }
  return { actions: n, episodes: eps.length, name: n ? name / n : 0, family: n ? family / n : 0, confusion,
    runs: rn, run_name: rn ? rname / rn : 0, run_family: rn ? rfam / rn : 0, runConfusion };
}
