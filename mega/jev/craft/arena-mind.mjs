// craft/arena-mind.mjs — what Jev sees in the arena, and how it plays.
//
// The same shape as mind.mjs: a small state of COMPUTED facts, a typed
// `choice` over concrete options built from the legal arena macros (each
// option carrying what it would do, in numbers the harness worked out), and a
// `have` self-check. The model never plans a route, prices a purchase or times
// a respawn; the caller does, and it decides.
import { ARENA_PALETTE, SHOP, blocksHeld, coverLeft, coverOf, coverNeeds, nearestFoe, bridgeRoute, window, WARN_RANGE, BRIDGE_TICKS, GENS, baselineArena } from './arena.mjs';
import { SWORD_DMG, ARMOR, B, BLOCKS, H } from './world.mjs';

const held = (sim, k) => sim.inv[k] || 0;
const swordOf = (e) => ['diamond_sword', 'iron_sword', 'stone_sword', 'wooden_sword'].find((k) => (e.inv[k] || 0) > 0) || 'none';
const armorOf = (e) => Object.keys(ARMOR).find((k) => (e.inv[k] || 0) > 0) || 'none';
const short = (k) => k.replace(/_ingot$/, '').replace(/_/g, ' ');
const where = (sim, e) => {
  const a = sim.arena, s = a.sideOf(e), f = a.foeSide(e);
  if (e.out) return 'dead';
  if (s.island.includes(e.c)) return 'at their own base';
  if (f.island.includes(e.c)) return 'at the other base';
  if (a.a.midIsland.includes(e.c)) return 'on the centre island';
  return 'on a bridge';
};
function coverText(sim, side) {
  const all = coverOf(sim, side), left = coverLeft(sim, side);
  if (!side.bedAlive) return 'gone';
  const mats = {};
  for (const [c, y] of all) { const id = sim.get(c, y); if (id !== B.air) mats[BLOCKS[id].name] = (mats[BLOCKS[id].name] || 0) + 1; }
  const m = Object.entries(mats).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n} ${k}`).join(', ');
  return left === all.length ? 'open: nothing covers it' : `${all.length - left} of ${all.length} cover places filled (${m})${left ? `, ${left} still open` : ''}`;
}
const breakTicks = (sim, name) => { const blk = BLOCKS[B[name]]; return blk ? sim.mineTicks(blk) : null; };

// ------------------------------------------------------------- the state ---
export function arenaState(sim) {
  const a = sim.arena, p = sim.player, side = a.sideOf(p), foe = a.foeSide(p);
  const foes = a.foesOf(p), f = nearestFoe(sim) || foes[0];
  const w = window(sim);
  const threat = foes.find((q) => !q.out && sim.dist(q.c, side.bed[0]) <= WARN_RANGE);
  return {
    tick: sim.tick,
    you: { health: `${p.hp}/20`, where: where(sim, p), sword: `${short(swordOf(p))} (${SWORD_DMG[swordOf(p)] || 1} a hit)`, armor: short(armorOf(p)), pickaxe: sim.pickTier() ? `tier ${sim.pickTier()}` : 'none', carrying: Object.fromEntries(['iron_ingot', 'gold_ingot', 'diamond'].map((k) => [short(k), held(sim, k)])), blocks: blocksHeld(sim) },
    your_bed: side.bedAlive ? coverText(sim, side) : 'GONE: the next death is final',
    enemy: f ? { where: where(sim, f), ...(f.out && f.out !== Infinity ? { back_in_ticks: f.out - sim.tick } : {}), health: `${f.hp}/20`, sword: short(swordOf(f)), armor: short(armorOf(f)), tiles_away: +sim.dist(f.c, p.c).toFixed(1), tiles_from_your_bed: +sim.dist(f.c, side.bed[0]).toFixed(1) } : 'eliminated',
    their_bed: foe.bedAlive ? `${coverText(sim, foe)}${coverNeeds(sim, foe) > sim.pickTier() ? '; you cannot break it without a better pickaxe' : ''}` : 'gone',
    ...(threat ? { threat: `the enemy is ${sim.dist(threat.c, side.bed[0]).toFixed(1)} tiles from your bed` } : {}),
    ...(w ? { window: `every enemy is dead and their bed stands: the first is back in ${w.back} ticks; you could reach their bed in about ${w.eta}` } : {}),
    kills: { yours: side.kills, theirs: foe.kills },
    journal: (p._arenaJournal || []).slice(-6),
  };
}

// what a purse buys: the useful purchases affordable with `have`, that are not
// already owned (a better sword, armor, a pick their cover needs, blocks)
function affordable(sim, have) {
  const p = sim.player, foe = sim.arena.foeSide(p), out = [];
  for (const [item, o] of Object.entries(SHOP)) {
    if (!Object.entries(o.cost).every(([k, n]) => (have[k] || 0) >= n)) continue;
    if (SWORD_DMG[item] && SWORD_DMG[item] <= (SWORD_DMG[swordOf(p)] || 1)) continue;
    if (ARMOR[item] && armorOf(p) !== 'none') continue;
    if (/pickaxe/.test(item) && !(coverNeeds(sim, foe) > sim.pickTier())) continue;
    if (['wooden_axe', 'arrow', 'bow', 'planks', 'obsidian'].includes(item)) continue;
    out.push(`${o.n > 1 ? o.n + ' ' : ''}${short(item)}`);
  }
  return out;
}
// ----------------------------------------------------------- the options ---
// Each option: a key, the macro it runs, and its facts.
export function arenaOptions(sim) {
  const a = sim.arena, p = sim.player, side = a.sideOf(p), foe = a.foeSide(p), f = nearestFoe(sim);
  const opts = [];
  const legal = (name, args) => !ARENA_PALETTE[name].needs(sim, args || {});
  const add = (key, name, args, facts) => { if (legal(name, args)) opts.push({ key, name, args, facts }); };
  const leaves = (dest) => (side.bedAlive && dest !== 'home' ? { leaves_your_bed: coverLeft(sim, side) === coverOf(sim, side).length ? 'yes, and it is OPEN' : 'yes' } : {});
  const threat = a.foesOf(p).some((q) => !q.out && sim.dist(q.c, side.bed[0]) <= WARN_RANGE);
  // buying
  for (const [item, o] of Object.entries(SHOP)) {
    if (!legal('buy', { item })) continue;
    const cost = Object.entries(o.cost).map(([k, n]) => `${n} ${short(k)} (you have ${held(sim, k)})`).join(' + ');
    let gives = `${o.n} ${short(item)}`;
    if (SWORD_DMG[item]) gives = `${short(item)}: ${SWORD_DMG[item]} a hit (yours now: ${SWORD_DMG[swordOf(p)] || 1})${SWORD_DMG[item] <= (SWORD_DMG[swordOf(p)] || 1) ? ' — no better than yours' : ''}`;
    else if (ARMOR[item]) gives = `${short(item)}: blows cut ${Math.round(ARMOR[item] * 100)}%${armorOf(p) !== 'none' ? ` (you already wear ${short(armorOf(p))})` : ''}`;
    else if (['wool', 'planks', 'cobblestone', 'obsidian'].includes(item)) gives = `${o.n} ${item}: ${breakTicks(sim, item) != null ? `the enemy breaks one in ~${BLOCKS[B[item]].tool ? `${BLOCKS[B[item]].tool > 1 ? 'needs a good pickaxe' : 'needs a pickaxe'}` : `${BLOCKS[B[item]].hard} ticks by hand`}` : ''}; you carry ${blocksHeld(sim)} blocks`;
    else if (/pickaxe/.test(item)) gives = `${short(item)}${coverNeeds(sim, foe) > sim.pickTier() ? ': lets you break their bed cover' : ''}`;
    add(`buy_${item}`, 'buy', { item }, { costs: cost, gives });
  }
  // gathering
  // gathering says what it would let you buy that you cannot now (the first
  // live run never gathered: 610 decisions, 0 gathers, a wooden sword to the end)
  const purse = { iron_ingot: held(sim, 'iron_ingot'), gold_ingot: held(sim, 'gold_ingot'), diamond: held(sim, 'diamond') };
  const now = affordable(sim, purse);
  const after = (extra) => { const more = affordable(sim, Object.fromEntries(Object.entries(purse).map(([k, n]) => [k, n + (extra[k] || 0)]))).filter((x) => !now.includes(x)); return more.length ? more.join(', ') : 'nothing new'; };
  add('gather_iron', 'gather', { res: 'iron' }, { yields: `~12 iron in ~${12 * GENS.iron.every} ticks at your generator (and gold meanwhile)`, then_affordable: after({ iron_ingot: 12, gold_ingot: 2 }), affordable_now: now.length ? now.join(', ') : 'nothing useful', where: 'your base' });
  add('gather_gold', 'gather', { res: 'gold' }, { yields: `~3 gold in ~${3 * GENS.gold.every} ticks at your generator (and ~16 iron meanwhile)`, then_affordable: after({ gold_ingot: 3, iron_ingot: 16 }), where: 'your base' });
  add('gather_mid', 'gather_mid', {}, { yields: `1 diamond every ${GENS.diamond.every} ticks at the centre`, ...leaves('mid') });
  // building
  if (side.bedAlive) add('fortify', 'fortify', {}, { covers: coverText(sim, side), with: `the hardest of your ${blocksHeld(sim)} blocks first` });
  // attacking
  if (foe.bedAlive) {
    const route = bridgeRoute(sim, p.c, foe.island);
    const gaps = route ? route.filter((n) => !sim.solid(n, a.g)).length : null;
    const w = window(sim);
    add('rush', 'rush', {}, {
      their_bed: coverText(sim, foe),
      route: route ? `${route.length} tiles, ${gaps} to bridge: you carry ${blocksHeld(sim)} blocks${blocksHeld(sim) < gaps ? ` (${gaps - blocksHeld(sim)} short)` : ''}` : 'none',
      ...(route ? { eta_ticks: route.length + gaps * BRIDGE_TICKS } : {}),
      enemy: f ? (f.out ? `dead, back in ${f.out === Infinity ? 'never' : f.out - sim.tick} ticks` : where(sim, f)) : 'none',
      ...(w ? { WINDOW: `every enemy is dead: the first is back in ${w.back} ticks` } : {}),
      ...leaves('foe'),
    });
  }
  add('bridge_mid', 'bridge_mid', {}, { gives: 'a way to the centre (diamonds)', ...leaves('mid') });
  add('go_base', 'go_base', {}, { gives: 'back to your own base', ...(threat ? { answers: 'the threat to your bed' } : {}) });
  // fighting
  if (f && !f.out) {
    const vs = { enemy_tiles_away: +sim.dist(f.c, p.c).toFixed(1), health: `yours ${p.hp}, theirs ${f.hp}`, swords: `yours ${SWORD_DMG[swordOf(p)] || 1}, theirs ${SWORD_DMG[swordOf(f)] || 1} a hit`, armor: `yours ${short(armorOf(p))}, theirs ${short(armorOf(f))}`, a_kill: foe.bedAlive ? `their bed stands: a kill sends them back to their base in ${20} ticks, and opens the window` : 'their bed is gone: a kill is final' };
    add('fight', 'fight', {}, vs);
    add('hunt', 'hunt', {}, { ...vs, note: 'bridges to them if it must' });
    add('shoot', 'shoot', {}, { enemy_tiles_away: vs.enemy_tiles_away, arrows: held(sim, 'arrow') });
  }
  if (side.bedAlive) add('defend', 'defend', {}, { threat: threat ? `the enemy is ${sim.dist(f.c, side.bed[0]).toFixed(1)} tiles from your bed` : `none: no enemy within ${WARN_RANGE} tiles of your bed (the nearest is ${f ? (f.out ? 'dead' : sim.dist(f.c, side.bed[0]).toFixed(1) + ' tiles away') : 'gone'})`, ...(threat ? { answers: 'the threat to your bed' } : { note: 'standing guard with no one coming earns nothing' }) });
  add('heal', 'heal', {}, { heals: `10 (you are at ${p.hp}/20)` });
  return opts;
}

export function arenaQuestions(opts) {
  return {
    next: { type: 'choice', instructions: 'You are playing Bed Wars on a tiling: break the enemy bed, then kill their player; keep your own bed. Pick the option that best serves winning from the state as it is now. Every figure is already computed.', criteria: Object.fromEntries(opts.map((o) => [o.key, o.facts])) },
    have: { type: 'noul', instructions: 'Does the state contain the information needed to choose well here?', criteria: { true: 'yes, the facts that decide it are in the state', false: 'no, something that decides it is missing' } },
  };
}

// A decider for playMatchAsync: ask, map the choice back, keep a journal.
// `ask(state, questions)` returns the API body (source stamped by the worker).
// Any failure falls back to the scripted baseline for that one decision, and
// says so in the stream: never a silent substitute.
export function jevArena(ask, { onDecision } = {}) {
  return async (sim, m) => {
    const opts = sim.as(m.e, () => arenaOptions(sim));
    if (!opts.length) return null;
    const state = sim.as(m.e, () => arenaState(sim));
    const questions = arenaQuestions(opts);
    let body = null, err = null;
    try { body = await ask(state, questions); } catch (e) { err = e.message || String(e); }
    const ans = body && body.answers ? body.answers : body && body.next ? body : null;
    const next = ans && ans.next, pick = next && opts.find((o) => o.key === next.choice);
    let d, source;
    if (pick) { d = { name: pick.name, ...(pick.args && Object.keys(pick.args).length ? { args: pick.args } : {}) }; source = body.source || 'typesafe'; }
    else { d = sim.as(m.e, () => baselineArena(sim)); source = `baseline (fallback: ${err || 'no usable answer'})`; }
    const rec = { tick: sim.tick, chose: pick ? pick.key : d.name, conf: next && next.confidence != null ? +(+next.confidence).toFixed(2) : null, have: ans && ans.have ? +(+(ans.have.noul ?? ans.have)).toFixed(2) : null, source, options: opts.length };
    const p = m.e;
    (p._arenaJournal ||= []).push({ tick: sim.tick, chose: rec.chose });
    const prev = p._arenaJournal[p._arenaJournal.length - 2];
    if (prev && m.lastEnded) { prev.ok = m.lastEnded.ok; if (!m.lastEnded.ok) prev.why = (m.lastEnded.why || '').slice(0, 60); }
    sim.note('jev', { who: p.id, ...rec });
    if (onDecision) onDecision(rec, m);
    return d;
  };
}
