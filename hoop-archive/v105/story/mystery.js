// mystery.js — THE TIER-2 MURDER MYSTERY (v105). Pure, no DOM, no LLM, node-tested.
//
// tide/case's procedural mysteries, merged with the room-bundle architecture. The goss civic web gave
// tide/case its motive/means/alibi structure for free; hoop's quest layer has no goss web — what it has
// is the SEEDED KEEPER CAST (weave.js): a per-world-seed set of room-bundle keepers who are PROVABLY
// placed (the gate satisfiers the surface must seat). So the case is built ONLY from those keepers:
//
//   THE CAST      — case-giver = the FIRST keeper Factor Solen's charge names (the first ward gate's
//                   cast keeper); suspects = the other cast keepers of tiers 1–2 (all guaranteed
//                   walkable), padded from unused ward bundles (surfaced via requiredIds so the
//                   placement pipeline seats them too); the VICTIM = an unused bundle, RETIRED by the
//                   weave — dead, never placed, which is exactly why you cannot meet them.
//   THE DAY       — six watches; each keeper's round is laid over the cast's own rooms (their room +
//                   two seeded haunts), stable per (seed, keeper) — the schedule IS the alibi board.
//   MOTIVE        — read off the bundle facts the way goss read its web: same verb → RIVAL, same
//                   faction → SUCCESSION, shared haunt → DEBT, opposite creed → CREED. Red herrings
//                   carry genuine grievance and genuine innocence (tide/case's thesis).
//   MEANS         — items typed by keeper VERB (the room-bundle cousin of place-role means); access =
//                   own verb + the verbs of your haunts' keepers.
//   SOLVABILITY   — tide/case's oracle verbatim in spirit: the clue list's deductive closure
//                   (eliminations only) must converge on exactly the culprit; watches are retried and
//                   a grounded reluctant-eyewitness clue is the guaranteed closer, so a case ALWAYS
//                   certifies before it ships.
//   THE CLOSE     — clues are TRANSFORMED INTO DIALOGUE (weaveMystery): spliced choices on the placed
//                   keepers, the case opened by the case-giver once their own charge is done, and a
//                   real ACCUSATION made to the case-giver — name the killer to set the gate that
//                   Factor Solen's turn-in now requires (the FINAL subquest of the wards tier).
//
// Everything is derived from the served pool + the cast plan — no bundle is named, so a republished
// pool re-casts cleanly (the abstraction contract weave.js documents).

import { anchorChain } from './anchors.js';
import { hash32, pickVariant, spliceChoice, anchorWithGate, FACTION_LABEL } from './weave.js';

export const MYSTERY_GATE = 'flag.ward.mystery_closed';
export const TICK_LABEL = ['the dawn watch', 'the morning watch', 'midday', 'the afternoon watch', 'the evening watch', 'the night watch'];

// verb-typed means (the room-bundle cousin of tide/case's place-role items).
const MEANS_ITEMS = {
  heal: { item: 'a stolen vial of clinic sedative', tell: 'someone with the run of a clinic' },
  mend: { item: 'a chopshop spanner, wiped badly', tell: 'someone with chopshop access' },
  make: { item: 'a length of works cable', tell: 'someone who walks a workshop floor' },
  serve: { item: 'a tainted canteen ration', tell: 'someone who could touch the victim’s food' },
  grow: { item: 'a garden desiccant, out of its shed', tell: 'someone with garden chemicals to hand' },
  trade: { item: 'an exchange weighing-bar', tell: 'someone at home among the stalls' },
  store: { item: 'a hold-hook, off its rack', tell: 'someone who keys into the deep holds' },
  worship: { item: 'a censer chain, unlinked', tell: 'someone who tends an altar' },
  govern: { item: 'a seal-stand counterweight', tell: 'someone with the run of a quorum hall' },
  learn: { item: 'a terminal service rod', tell: 'someone who opens the archive cabinets' },
  move: { item: 'a mooring winch pin', tell: 'someone who works the ways and lifts' },
  play: { item: 'a gauntlet training weight', tell: 'someone with hours in the yards' },
};
const FALLBACK_MEANS = { item: 'a plain mooring cord — the kind every deck coils', tell: 'anyone with two hands and patience' };

const nameOf = (c) => (c && c.content && c.content.name) || (c && c.id) || 'someone';
const roomOf = (c) => (c && c.roomName) || null;
const verbOf = (c) => (c && c.verb) || null;
const facOf = (c) => {
  const nf = String((c && c.content && c.content.nave_faction) || '').toLowerCase();
  return nf || null;
};
const facLabel = (f) => FACTION_LABEL[f] || (f ? f[0].toUpperCase() + f.slice(1) : 'no ward');

// ── THE CASE ─────────────────────────────────────────────────────────────────────────────────────────
// content = the WOVEN pool (weaveCast already applied); cast = castSpine's result. Returns the case or
// null when the world can't hold one (no ward anchor / too few cast keepers) — the campaign then simply
// runs without the mystery gate (weaveWorld logs it).
export function buildMystery(content, cast, worldSeed, opts = {}) {
  const chain = anchorChain(content);
  const anchor = chain.find((a) => ['ward', 'wards'].includes(String(a.zone || '').toLowerCase())) || chain.find((a) => a.tier === 2);
  if (!anchor || !anchor.gates.length) return null;
  const byId = new Map((content || []).map((c) => [c.id, c]));

  // the case-giver: the first ward gate's cast keeper (the first keeper Solen tasks you with finding).
  const entries = anchor.gates.map((g) => cast.byGate[g]).filter((e) => e && e.keeperId && !e.briefing);
  const cgEntry = entries[0];
  if (!cgEntry) return null;
  const caseGiverC = byId.get(cgEntry.keeperId); if (!caseGiverC) return null;

  // suspects: every OTHER cast keeper of tiers ≤ the ward tier (commons faces + the other ward keepers)
  // — all provably placed by the gate-satisfier pipeline.
  const baseIds = (cast.plan || [])
    .filter((e) => e.tier <= anchor.tier && !e.briefing && e.keeperId && e.keeperId !== cgEntry.keeperId)
    .map((e) => e.keeperId);
  const suspectsC = [...new Set(baseIds)].map((id) => byId.get(id)).filter(Boolean);

  // pad to six from unused ward bundles (these are NOT gate satisfiers, so the surface must seat them —
  // they ride out as requiredIds).
  const inPlay = new Set([cgEntry.keeperId, ...baseIds]);
  for (const e of cast.plan || []) if (e.keeperId) inPlay.add(e.keeperId);
  const spare = (content || [])
    .filter((c) => c && c.type === 'npc' && c.room != null && !inPlay.has(c.id)
      && !(c.content && c.content.load_bearing) && !(c.content && c.content.ambient)
      && ['ward', 'wards'].includes(String((c.content && c.content.zone) || '').toLowerCase()))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  const requiredIds = [];
  const want = Math.max(0, (opts.suspects || 6) - suspectsC.length);
  for (let k = 0; k < want && spare.length; k++) {
    const pick = spare.splice(hash32(worldSeed, 'extra', k) % spare.length, 1)[0];
    suspectsC.push(pick); inPlay.add(pick.id); requiredIds.push(pick.id);
  }
  if (suspectsC.length < 3) return null;   // too thin a board to close deductively

  // the victim: an unused bundle (wards preferred, commons fallback) — retired by the weave, never placed.
  const victimPool = (content || [])
    .filter((c) => c && c.type === 'npc' && c.room != null && !inPlay.has(c.id)
      && !(c.content && c.content.load_bearing) && !(c.content && c.content.ambient)
      && ['ward', 'wards', 'commons'].includes(String((c.content && c.content.zone) || '').toLowerCase()))
    .sort((a, b) => {
      const az = String((a.content && a.content.zone) || ''), bz = String((b.content && b.content.zone) || '');
      const aw = az.startsWith('ward') ? 0 : 1, bw = bz.startsWith('ward') ? 0 : 1;
      return aw - bw || (a.id < b.id ? -1 : 1);
    });
  if (!victimPool.length) return null;
  const wardOnly = victimPool.filter((c) => String((c.content && c.content.zone) || '').startsWith('ward'));
  const vp = wardOnly.length ? wardOnly : victimPool;
  const victimC = vp[hash32(worldSeed, 'victim') % vp.length];

  // ── the day: rooms + schedules ── the participants are caseGiver + suspects; the victim haunts too.
  const people = [caseGiverC, ...suspectsC];
  const P = people.map((c, i) => ({
    i, id: c.id, name: nameOf(c), room: roomOf(c) || ('the ' + (verbOf(c) || 'quiet') + ' room'),
    verb: verbOf(c), faction: facOf(c),
  }));
  const V = { id: victimC.id, name: nameOf(victimC), room: roomOf(victimC) || 'their room', verb: verbOf(victimC), faction: facOf(victimC) };
  const roomsAll = [...P.map((p) => p.room), V.room];
  // two seeded haunts per soul (other cast rooms) — stable per (seed, person). Watches 0·5 = home.
  const hauntsOf = (id, own) => {
    const others = roomsAll.filter((r) => r !== own);
    if (!others.length) return [own, own];
    return [others[hash32(worldSeed, 'h1', id) % others.length], others[hash32(worldSeed, 'h2', id) % others.length]];
  };
  const schedOf = (id, own) => {
    const [h1, h2] = hauntsOf(id, own);
    const day = [own, null, null, null, null, own];
    for (let t = 1; t <= 4; t++) day[t] = [own, own, h1, h2][hash32(worldSeed, 'sched', id, t) % 4];
    return day;
  };
  const sched = new Map(P.map((p) => [p.id, schedOf(p.id, p.room)]));
  const vSched = schedOf(V.id, V.room);
  const ownerOfRoom = (r) => P.find((p) => p.room === r) || (V.room === r ? V : null);

  // ── motive: one standing grievance per suspect, read off the bundle facts ──
  const motiveFor = (p) => {
    const sharedHaunt = hauntsOf(p.id, p.room).includes(V.room) || hauntsOf(V.id, V.room).includes(p.room);
    if (p.verb && p.verb === V.verb) return { tag: 'RIVAL', heat: 55 + hash32(worldSeed, 'mh', p.id) % 20, text: `keeps the same craft as the dead — two ${p.verb} keepers, one measure of regard, twice claimed.` };
    if (sharedHaunt) return { tag: 'DEBT', heat: 45 + hash32(worldSeed, 'mh', p.id) % 20, text: `owed ${V.name} more than they will say — the benches have long since counted it.` };
    if (p.faction && p.faction === V.faction) return { tag: 'SUCCESSION', heat: 40 + hash32(worldSeed, 'mh', p.id) % 20, text: `stands next in the ${facLabel(p.faction)} ward's regard — the victim outranked them in everything but patience.` };
    return { tag: 'CREED', heat: 35 + hash32(worldSeed, 'mh', p.id) % 20, text: `kept the opposite creed — ${facLabel(p.faction)} against ${facLabel(V.faction)} — and lately the difference had teeth.` };
  };
  const board = P.slice(1).map((p) => ({ ...p, motive: motiveFor(p) }));   // suspects only (case-giver is off the board)

  // the culprit: a heat-weighted seeded draw (fixed across watch retries, like tide/case).
  const totalHeat = board.reduce((s, b) => s + b.motive.heat, 0) || 1;
  let roll = (hash32(worldSeed, 'culprit') % 1000) / 1000 * totalHeat, culpritAt = 0;
  for (let i = 0; i < board.length; i++) { roll -= board[i].motive.heat; if (roll <= 0) { culpritAt = i; break; } }
  const C = board[culpritAt];

  // means access: own verb + the verbs of your haunts' keepers.
  const accessOf = (p) => {
    const set = new Set(); if (p.verb) set.add(p.verb);
    for (const r of hauntsOf(p.id, p.room)) { const o = ownerOfRoom(r); if (o && o.verb) set.add(o.verb); }
    return set;
  };
  const cAccess = accessOf(C);
  const usable = [...cAccess].filter((v) => MEANS_ITEMS[v]);
  const keepAlive = usable.filter((v) => board.filter((s) => accessOf(s).has(v)).length >= 2);
  const meansVerb = (keepAlive.length ? keepAlive : usable)[hash32(worldSeed, 'means') % Math.max(1, (keepAlive.length ? keepAlive : usable).length)] || null;
  const item = meansVerb ? { verb: meansVerb, ...MEANS_ITEMS[meansVerb] } : { verb: null, ...FALLBACK_MEANS };

  // ── the crime + the clue list: retry the four waking watches until the closure certifies ──
  for (let attempt = 0; attempt < 4; attempt++) {
    const tick = 1 + ((hash32(worldSeed, 'tick') + attempt) % 4);
    const sceneRoom = vSched[tick];
    const sceneOwner = ownerOfRoom(sceneRoom);

    const dossiers = board.map((s) => {
      const claim = sched.get(s.id)[tick];
      const isC = s.id === C.id;
      // independent corroboration: another participant shares the claimed room this watch AND owes the
      // claimant nothing (a different ward — the weak-tie testimony rule, keeper-cast edition).
      const indep = P.filter((q) => q.id !== s.id && sched.get(q.id)[tick] === claim && q.faction !== s.faction).length;
      return { ...s, claim, atScene: claim === sceneRoom, independent: indep, corroborated: isC ? false : indep >= 1, access: [...accessOf(s)] };
    });

    const clues = [];
    const alive = new Set(board.map((s) => s.id));
    const addClue = (kind, title, text, holderId, elim = []) => {
      const el = elim.filter((id) => alive.has(id) && id !== C.id);
      clues.push({ id: 'c' + clues.length, kind, title, text, holderId, eliminates: el });
      for (const id of el) alive.delete(id);
    };
    const eliminatedHolder = () => {   // clue-holder rotation: an already-cleared suspect turns witness
      const done = board.filter((s) => !alive.has(s.id));
      return done.length ? done[clues.length % done.length].id : P[0].id;
    };

    addClue('body', 'the body at ' + sceneRoom,
      `${V.name} — keeper of ${V.room}, ${facLabel(V.faction)} — found at ${sceneRoom} during ${TICK_LABEL[tick]}. The ward has opinions about who wanted this; nobody is accusing, everybody is implying.`, P[0].id);
    const loud = [...board].sort((a, b) => b.motive.heat - a.motive.heat)[0];
    addClue('rumor', 'what the benches say',
      `Loudest of the grievances: ${loud.name} ${loud.motive.text}`, P[0].id);
    const noAccess = item.verb ? dossiers.filter((s) => !s.access.includes(item.verb)) : [];
    addClue('means', 'the coroner’s finding',
      item.verb
        ? `The instrument was ${item.item} — ${item.tell}. ${noAccess.length ? noAccess.map((s) => s.name).join(' and ') + ' had no such access.' : 'Everyone on the board could have laid hands on one.'}`
        : `The instrument was ${item.item}. It narrows nothing — ${item.tell}.`,
      P[0].id, noAccess.map((s) => s.id));

    // the canvass — each suspect's own account, in seeded order; independent corroboration clears.
    const order = [...dossiers].sort((a, b) => hash32(worldSeed, 'canvass', a.id) - hash32(worldSeed, 'canvass', b.id));
    for (const s of order) {
      if (!alive.has(s.id) && s.id !== C.id) continue;
      if (s.id === C.id) {
        addClue('alibi', s.name + '’s account', s.atScene
          ? `${s.name} was at ${s.claim} — the scene itself — and does not deny it. “Half the ward was through there.”`
          : `${s.name} claims ${TICK_LABEL[tick]} at ${s.claim}. Only their own circle can swear to it — worth exactly what a ward-mate’s word is worth.`, s.id);
      } else if (s.corroborated) {
        addClue('alibi', s.name + '’s account',
          `${s.name} was at ${s.claim} all ${TICK_LABEL[tick]} — ${s.independent} there owe them nothing and swear to it. Off the board.`, s.id, [s.id]);
      } else {
        addClue('alibi', s.name + '’s account',
          `${s.name} claims ${s.claim}. No one impartial can place them there. Unverifiable either way.`, s.id);
      }
    }
    // sightings — descriptors of the half-seen figure, planted only while they still eliminate someone.
    const descs = [
      { ok: (s) => s.faction === C.faction, text: C.faction ? `A figure was seen leaving ${sceneRoom} as the watch turned — wearing ${facLabel(C.faction)} ward colours.` : `The figure leaving ${sceneRoom} wore no ward colours at all.` },
      { ok: (s) => s.verb === C.verb, text: C.verb ? `The figure’s hands and garb were a ${C.verb} keeper’s — no mistaking the trade.` : `The figure’s hands were soft — no trade at all.` },
    ];
    for (const d of descs) {
      if (alive.size <= 1) break;
      const elim = dossiers.filter((s) => alive.has(s.id) && s.id !== C.id && !d.ok(s)).map((s) => s.id);
      if (elim.length) addClue('sighting', 'a figure, half-seen', d.text, eliminatedHolder(), elim);
    }
    // trace — a token of a haunt of the culprit's that the remaining board doesn't share.
    if (alive.size > 1) {
      let bestRoom = null, bestElim = [];
      for (const r of hauntsOf(C.id, C.room)) {
        const elim = dossiers.filter((s) => alive.has(s.id) && s.id !== C.id && s.room !== r && !hauntsOf(s.id, s.room).includes(r)).map((s) => s.id);
        if (elim.length > bestElim.length) { bestRoom = r; bestElim = elim; }
      }
      if (bestElim.length) addClue('trace', 'dropped by the door',
        `Under the sill at ${sceneRoom}: a keeper’s token of ${bestRoom}. Whoever came and went belongs there.`, eliminatedHolder(), bestElim);
    }
    // the reluctant eyewitness — GROUNDED: a cleared soul whose round brushed the scene on an adjoining
    // watch finally says it plain. The guaranteed closer (tide/case's pattern).
    let usedEyewitness = false;
    if (alive.size > 1) {
      usedEyewitness = true;
      const near = P.find((q) => q.id !== C.id && [tick - 1, tick + 1].some((t) => t >= 0 && t <= 5 && sched.get(q.id) && sched.get(q.id)[t] === sceneRoom));
      const eye = near || P[0];
      addClue('sighting', 'the reluctant eyewitness',
        `${eye.name}, passing ${sceneRoom} on the adjoining watch, finally says it plain: the figure was ${C.name}.`,
        eye.id, dossiers.filter((s) => alive.has(s.id) && s.id !== C.id).map((s) => s.id));
    }
    if (alive.size !== 1) { if (attempt < 3) continue; return null; }

    // THE ORACLE — replay the closure cold and certify it converges on exactly the culprit.
    const check = new Set(board.map((s) => s.id));
    for (const c of clues) for (const id of c.eliminates) check.delete(id);
    if (check.size !== 1 || !check.has(C.id)) { if (attempt < 3) continue; return null; }

    return {
      gate: MYSTERY_GATE, anchorId: anchor.id, anchorName: anchor.name, tier: anchor.tier,
      seed: worldSeed, tick, tickLabel: TICK_LABEL[tick], sceneRoom,
      sceneOwnerId: sceneOwner ? sceneOwner.id : null,
      caseGiver: { id: P[0].id, name: P[0].name, room: P[0].room, verb: P[0].verb, faction: P[0].faction, gate: cgEntry.gate },
      victim: V,
      suspects: dossiers,
      clues,
      truth: { culpritId: C.id, name: C.name, motive: C.motive, item: item.item },
      requiredIds, usedEyewitness, solvable: true,
    };
  }
  return null;
}

// ── WEAVE THE CASE INTO THE POOL (all additive; the victim is retired — dead) ────────────────────────
// • the ward ANCHOR gains the mystery gate (load_bearing.gates + the turn-in choice's requires) — the
//   FINAL subquest of the tier;
// • the CASE-GIVER gains the case (opened once their own charge is heard) + the ACCUSATION;
// • each SUSPECT gains their account (+ any witness clues they hold), gated on the case being open;
// • the VICTIM's bundle is marked retired so no pipeline ever seats the dead.
export function weaveMystery(content, m) {
  if (!m) return content;
  const byId = new Map((content || []).map((c) => [c.id, c]));

  // 1 — the anchor: gates + turn-in requires (weave.js anchorWithGate — shared with the mythograph).
  const anchor = byId.get(m.anchorId);
  if (anchor) byId.set(m.anchorId, anchorWithGate(anchor, m.gate));

  const held = (id) => m.clues.filter((c) => c.holderId === id);
  const clueFacts = (list) => Object.fromEntries(list.map((c) => ['case.clue.' + c.id, true]));

  // 2 — the case-giver: the case (a three-beat briefing) + the accusation.
  const cg = byId.get(m.caseGiver.id);
  if (cg) {
    const cgClues = held(m.caseGiver.id).filter((c) => ['body', 'rumor', 'means'].includes(c.kind));
    const body = cgClues.find((c) => c.kind === 'body'), rumor = cgClues.find((c) => c.kind === 'rumor'), means = cgClues.find((c) => c.kind === 'means');
    const extra = held(m.caseGiver.id).filter((c) => !['body', 'rumor', 'means'].includes(c.kind));
    const extraText = extra.length ? ' ' + extra.map((c) => c.text).join(' ') : '';
    // every clue fact sets on the choice that REVEALS it (entering the node that speaks it), never on a
    // closing pleasantry — a player who reads and walks away has still heard it (the Havel-bug rule).
    let woven = spliceChoice(cg, {
      choice: { id: 'q_case_open', goto: 'q_case_intro', text: '☠ Before I carry your word to Solen — the ward is speaking of a death.', requires: { facts: { [m.caseGiver.gate]: true } }, effects: { set_facts: { 'case.opened': true, ...(body ? { ['case.clue.' + body.id]: true } : {}) } } },
      nodes: {
        q_case_intro: {
          says: (body ? body.text : `${m.victim.name} is dead.`) + ' The Factor will not close the wards ledger while this stands open. Look around; the keepers know more than they volunteer.',
          choices: [{ id: 'q_case_intro_who', goto: 'q_case_board', text: 'Who wanted this?', effects: { set_facts: rumor ? { ['case.clue.' + rumor.id]: true } : {} } }],
        },
        q_case_board: {
          says: (rumor ? rumor.text : 'The benches disagree loudly.') + ' The board, as the ward draws it: ' + m.suspects.map((s) => `${s.name} (${s.room}) — ${s.motive.tag.toLowerCase()}`).join('; ') + '.',
          choices: [{ id: 'q_case_board_how', goto: 'q_case_means', text: 'What killed them?', effects: { set_facts: means ? { ['case.clue.' + means.id]: true, ...clueFacts(extra) } : clueFacts(extra) } }],
        },
        q_case_means: {
          says: (means ? means.text : 'The coroner keeps their finding close.') + extraText + ' When you can name the killer — and be sure — bring the name to me.',
          choices: [{ id: 'q_case_means_go', text: 'I will ask around.', effects: { end: true } }],
        },
      },
    });
    woven = spliceChoice(woven, {
      choice: { id: 'q_case_name', goto: 'q_case_accuse', text: '☠ I am ready to name the killer.', requires: { facts: { 'case.opened': true } } },
      nodes: {
        q_case_accuse: {
          says: 'Name them, then — and be sure. The ward does not ask twice kindly.',
          choices: [
            ...m.suspects.map((s, i) => (s.id === m.truth.culpritId
              ? { id: 'q_case_pick_' + i, goto: 'q_case_closed', text: `It was ${s.name} — keeper of ${s.room}.`, effects: { set_facts: { [m.gate]: true, 'case.solved': true } } }
              : { id: 'q_case_pick_' + i, goto: 'q_case_wrong', text: `It was ${s.name} — keeper of ${s.room}.`, effects: { set_facts: { 'case.missed': true } } })),
            { id: 'q_case_notyet', text: 'Not yet.', effects: { end: true } },
          ],
        },
        q_case_closed: {
          says: `So it was. ${m.truth.name} — ${m.truth.motive.text} The instrument: ${m.truth.item}. The ward will do what wards do; the ledger closes. Solen will want the whole of it from your own mouth.`,
          choices: [{ id: 'q_case_done', text: 'It is done.', effects: { end: true } }],
        },
        q_case_wrong: {
          says: 'The evidence does not carry that name. The accused stares you down, and the benches mutter. Look again — the clues close on exactly one soul.',
          choices: [{ id: 'q_case_again', text: 'I will look again.', effects: { end: true } }],
        },
      },
    });
    byId.set(m.caseGiver.id, woven);
  }

  // 3 — each suspect: their account + any witness clues they hold.
  m.suspects.forEach((s, i) => {
    const c = byId.get(s.id); if (!c) return;
    const mine = held(s.id);
    const alibi = mine.find((x) => x.kind === 'alibi');
    const rest = mine.filter((x) => x !== alibi);
    const nid = 'q_case_w_' + i;
    const closing = rest.length
      ? [{ id: nid + '_more', goto: nid + '_more', text: 'What else did you see?' }]
      : [{ id: nid + '_done', text: 'That is all I needed.', effects: { end: true } }];
    const nodes = {
      [nid]: { says: (alibi ? alibi.text : `${s.name} has nothing to add, and says so twice.`), choices: closing },
    };
    if (rest.length) nodes[nid + '_more'] = {
      says: rest.map((x) => x.text).join(' '),
      choices: [{ id: nid + '_done', text: 'That is all I needed.', effects: { end: true } }],
    };
    // their clue facts set on the ASK (hearing the account IS the canvass) — never on the goodbye.
    byId.set(s.id, spliceChoice(c, {
      choice: { id: nid + '_ask', goto: nid, text: `☠ Ask about the death of ${m.victim.name}.`, requires: { facts: { 'case.opened': true } }, effects: { set_facts: clueFacts(mine) } },
      nodes,
    }));
  });

  // 4 — the victim is dead: retire the bundle so no placement pipeline ever seats them.
  const v = byId.get(m.victim.id);
  if (v) byId.set(m.victim.id, { ...v, status: 'retired' });
  const vLore = byId.get(m.victim.id + ':lore');   // their lore stays live — a dead keeper's ground still speaks

  return (content || []).map((c) => byId.get(c.id) || c);
}

// clue-collection progress for the journal: which clue facts are set vs the case's full list.
// `heard` carries the full clue objects in case order — the journal ACCUMULATES their text.
export function mysteryProgress(m, facts) {
  if (!m) return null;
  const f = facts || {};
  const heard = m.clues.filter((c) => f['case.clue.' + c.id] === true);
  return {
    opened: f['case.opened'] === true,
    solved: f['case.solved'] === true || f[m.gate] === true,
    missed: f['case.missed'] === true,
    found: heard.length, total: m.clues.length,
    heard,
    remaining: m.clues.filter((c) => f['case.clue.' + c.id] !== true),
  };
}

// WHO the case waypoint should chase, in priority order: the case not yet opened → the case-giver
// (hear the case); clues outstanding → the holders of unheard clues, in clue order (the ◇ leads the
// canvass); everything heard → the case-giver again (make the accusation). Ids only — the surface
// picks the nearest PLACED one, exactly like gate satisfiers.
export function clueTargets(m, facts) {
  if (!m) return [];
  const f = facts || {};
  if (f['case.opened'] !== true) return [m.caseGiver.id];
  const remaining = m.clues.filter((c) => f['case.clue.' + c.id] !== true);
  const ids = [...new Set(remaining.map((c) => c.holderId))];
  return ids.length ? ids : [m.caseGiver.id];
}

export default { MYSTERY_GATE, TICK_LABEL, buildMystery, weaveMystery, mysteryProgress, clueTargets };
