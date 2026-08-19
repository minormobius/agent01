// tjs/brut/parti.js — THE PARTI. Pure, DOM-free, three.js-free.
//
// A generator with a stage per element makes a building whose parts have never
// met. The massing draws from one sub-stream, the plan from another, the stair
// from a third — and every one of them is individually defensible and none of
// them is about anything. What was missing is the thing an architect actually
// starts from: the PARTI, the position taken, the one idea a scheme is a
// consequence of. Everything downstream then reads it instead of drawing again.
//
// So this file runs FIRST, before the massing, and what it emits is not
// geometry. It is a short list of COMMITMENTS:
//
//   · the section    — which storey is the important one, and how tall
//   · the plan       — where the room that is not a room goes: a hall, a void,
//                      a court
//   · the ceremony   — which stair is the event, where it lands, and what it is
//                      allowed to be
//
// The couplings are the point, and they run in one direction. A penthouse is
// not just a taller top floor: it is a reason for a private helix rising out of
// the floor below it. An atrium is not just a hole: it is what makes a crossed
// pair of flights legible, and what the terrace at the top of them looks down
// into. Take the parti away and you get the building we had — correct in every
// part, about nothing.

export const VERSION = 'parti/1';

const r2 = (v) => Math.round(v * 100) / 100;

/* ─────────────────────────────── the memes ──────────────────────────────── */
//
// Each declares what it demands of the section, of the plan, and of the stair.
// `suits` is a bias rather than a rule; `needs` is the rule.

export const PARTIS = {
  'piano-nobile': {
    label: 'piano nobile',
    suits: ['civic', 'office', 'housing', 'lab'], needs: { levels: 3 },
    note: 'the important floor is not the ground one. The ground is a plinth you pass through, ' +
      'and the storey above it is taller, holds the hall, and is arrived at ceremonially',
    height: (i) => (i === 1 ? 1.5 : 1),
    hall: (n) => ({ level: 1, frac: 0.34, program: 'great hall' }),
    feature: (n) => ({
      from: 0, to: 1, where: 'hall', width: 2.4,
      prefer: ['imperial', 'bifurcated', 'cordonata', 'crossed', 'open-well', 'helical'],
      note: 'the ceremonial stair, from the entrance to the piano nobile',
    }),
  },

  penthouse: {
    label: 'penthouse',
    suits: ['housing', 'office'], needs: { levels: 5 },
    note: 'the top storey is a different building from the ones below it — taller, fewer and larger ' +
      'rooms, and a terrace. Reaching it privately is the whole point, so it gets its own stair',
    height: (i, n) => (i === n - 1 ? 1.35 : 1),
    terrace: (n) => n - 1,
    rooms: (n) => ({ level: n - 1, scale: 2.1 }),          // fewer, bigger
    feature: (n) => ({
      from: n - 2, to: n - 1, where: 'rooms', width: 1.8, private: true,
      prefer: ['helical', 'cantilever', 'flying', 'double-helix', 'spiral'],
      note: 'a private stair out of the floor below — the one part of the circulation nobody else uses',
    }),
  },

  'great-hall': {
    label: 'great hall',
    suits: ['civic', 'lab', 'office', 'carpark'], needs: { levels: 2 },
    note: 'one room big enough that the rest of the plan is arranged around it rather than beside it. ' +
      'It is double height, so it takes the floor above with it',
    height: (i) => (i === 0 ? 1.45 : 1),
    hall: () => ({ level: 0, frac: 0.42, program: 'great hall', doubleHeight: true }),
    feature: () => ({
      from: 0, to: 1, where: 'hall', width: 3.2,
      prefer: ['amphi', 'imperial', 'bifurcated', 'cordonata', 'crossed'],
      note: 'the stair in the hall — wide enough to be furniture as much as circulation',
    }),
  },

  atrium: {
    label: 'atrium',
    suits: ['office', 'lab', 'civic', 'housing'], needs: { levels: 4 },
    note: 'a void cut through the middle of the plan with a gallery round it on every floor. ' +
      'Everything faces in, the light comes down, and the stair in it is the only thing crossing',
    voids: (n) => {
      const top = Math.max(2, n - 1);
      return Array.from({ length: top }, (_, i) => i + 1);   // 1 … top−1
    },
    voidFrac: 0.2,
    terrace: (n) => Math.max(2, n - 1),
    feature: (n) => ({
      from: 0, to: Math.max(2, n - 1), where: 'atrium', width: 2.2,
      prefer: ['crossed', 'helical', 'double-helix', 'triple-helix', 'flying', 'open-well'],
      note: 'the stair in the void — it climbs the whole atrium and lands on the terrace at the top of it',
    }),
  },

  undercroft: {
    label: 'undercroft',
    suits: ['housing', 'civic', 'lab'], needs: { levels: 3 },
    note: 'the ground is given back: pilotis, open on every side, nothing at grade but the columns ' +
      'and the one thing that has to land — which is why the stair becomes the object in the void',
    height: (i) => (i === 0 ? 1.3 : 1),
    openGround: true,
    feature: () => ({
      from: 0, to: 1, where: 'open', width: 1.8,
      prefer: ['spiral', 'helical', 'flying', 'cantilever', 'double-helix', 'triple-helix'],
      note: 'the only thing standing in the undercroft, so it is looked at from every side',
    }),
  },

  cloister: {
    label: 'cloister',
    suits: ['civic', 'housing', 'lab', 'cathedral'], needs: { levels: 1 },
    note: 'the plan wraps a court and the circulation runs round it. Quiet: no ceremony, ' +
      'because the void is doing the work the stair would otherwise have to do',
    voids: (n) => Array.from({ length: n }, (_, i) => i),
    voidFrac: 0.26,
    feature: null,
  },

  'skip-stop': {
    label: 'skip-stop',
    suits: ['housing'], needs: { levels: 6 },
    note: 'the Unité move: a corridor only every third floor, and the dwellings reach up and down ' +
      'from it. Two thirds of the building has no corridor at all, and every home owns a stair',
    every: 3,
    feature: () => ({
      from: 0, to: 1, where: 'rooms', width: 0.9, private: true,
      prefer: ['straight', 'quarter', 'winder', 'spiral', 'ladder'],
      note: 'the stair inside the dwelling — private, tight, and there are hundreds of them',
    }),
  },

  promenade: {
    label: 'promenade architecturale',
    suits: ['civic', 'lab', 'carpark'], needs: { levels: 3 },
    note: 'Corbusier’s: you do not climb this building, you are walked up it. A ramp the whole way, ' +
      'expressed on the outside, and the route is the architecture',
    feature: (n) => ({
      from: 0, to: n - 1, where: 'open', width: 1.8, everyLevel: true,
      prefer: ['ramp', 'cordonata'],
      note: 'the ramp — twelve metres of length per metre of rise, spent deliberately',
    }),
  },
};
export const PARTI_IDS = Object.keys(PARTIS);

/* ─────────────────────────────── the choice ─────────────────────────────── */
//
// One or two memes, and they must not contradict: a building cannot both give
// its ground away to an undercroft and put its great hall on it, and a skip-stop
// section has no spare floor for a piano nobile. The pairs that DO work are the
// interesting ones — an atrium with a penthouse above it, an undercroft under a
// piano nobile — so incompatibility is listed rather than inferred.

const CONFLICTS = [
  ['great-hall', 'undercroft'],      // both want the ground
  ['great-hall', 'piano-nobile'],    // both want to be the important floor
  ['skip-stop', 'piano-nobile'],
  ['skip-stop', 'atrium'],
  ['skip-stop', 'great-hall'],
  ['promenade', 'skip-stop'],
  ['cloister', 'atrium'],            // two different voids in one plan
  ['cloister', 'great-hall'],
  ['promenade', 'great-hall'],
  // The atrium voids levels 1…n−1, and level 1 is precisely where the piano
  // nobile puts its hall: the void would be cut out of the one room the parti
  // exists to make. A GREAT hall is fine with an atrium — it sits on the ground,
  // under the void, and looks up into it — which is why only this pair is listed.
  ['atrium', 'piano-nobile'],
];

const clash = (a, b) => CONFLICTS.some(([x, y]) => (a === x && b === y) || (a === y && b === x));

export function deriveParti(p, rnd) {
  const eligible = PARTI_IDS.filter((id) => {
    const P = PARTIS[id];
    if (P.needs && P.needs.levels && p.levels < P.needs.levels) return false;
    return P.suits.includes(p.typology);
  });
  if (!eligible.length) return { memes: [], labels: [], note: 'no parti — the ordinary case' };

  // Most buildings have one idea. A few have two that agree, and those are the
  // ones worth looking at.
  const first = rnd.pick(eligible);
  const memes = [first];
  if (rnd.chance(0.42)) {
    const second = eligible.filter((id) => id !== first && !clash(first, id));
    if (second.length) memes.push(rnd.pick(second));
  }
  return {
    memes,
    labels: memes.map((m) => PARTIS[m].label),
    notes: memes.map((m) => PARTIS[m].note),
    note: memes.map((m) => PARTIS[m].label).join(' + '),
  };
}

/* ───────────────────── what the rest of the kernel asks it ──────────────── */

// The storey-height multiplier, as the product of every meme's opinion — so a
// penthouse over a piano nobile makes both of them taller and neither cancels.
export function heightAt(parti, i, n) {
  let k = 1;
  for (const m of parti.memes) {
    const P = PARTIS[m];
    if (P.height) k *= P.height(i, n);
  }
  return k;
}

// Which levels get a void cut through them, and how big a fraction of the plate.
export function voidsAt(parti, i, n) {
  for (const m of parti.memes) {
    const P = PARTIS[m];
    if (P.voids && P.voids(n).includes(i)) return P.voidFrac || 0.2;
  }
  return 0;
}

// The hall, if this level is the one that has it.
export function hallAt(parti, i, n) {
  for (const m of parti.memes) {
    const P = PARTIS[m];
    if (!P.hall) continue;
    const h = P.hall(n);
    if (h.level === i) return { ...h, meme: m };
  }
  return null;
}

// How much bigger the rooms on this level are than the ordinary ones. A
// penthouse is not a top floor with a taller ceiling — it is a top floor with
// FEWER rooms in it, and that is a fact about the plan, not the section.
export function roomScaleAt(parti, i, n) {
  let k = 1;
  for (const m of parti.memes) {
    const P = PARTIS[m];
    if (!P.rooms) continue;
    const r = P.rooms(n);
    if (r && r.level === i) k *= r.scale;
  }
  return k;
}

export function terraceAt(parti, i, n) {
  return parti.memes.some((m) => PARTIS[m].terrace && PARTIS[m].terrace(n) === i);
}

export function openGround(parti) {
  return parti.memes.some((m) => PARTIS[m].openGround);
}

export function corridorEvery(parti) {
  for (const m of parti.memes) if (PARTIS[m].every) return PARTIS[m].every;
  return 1;
}

// The ceremonial stairs a parti asks for — the ones that are the event rather
// than the escape. There may be none, and most buildings have none.
export function features(parti, n) {
  const out = [];
  for (const m of parti.memes) {
    const P = PARTIS[m];
    if (!P.feature) continue;
    const f = P.feature(n);
    if (!f) continue;
    out.push({ ...f, meme: m, label: PARTIS[m].label });
  }
  return out;
}
