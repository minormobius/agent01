// table/cairn/party.js — what a party is good at, as four measured numbers.
//
// WHY FOUR, AND WHY THESE FOUR. A radar plot invites you to invent axes that
// sound right, draw a nice shape, and never check whether the shape means
// anything. So every axis here was tested first: twenty candidates across two
// rounds were scored over random parties, each party's toll was measured
// against a five-encounter basket, and the correlation between axis and toll
// decided what survived. Four did. Eight did not, and they are listed below
// with their numbers, because a dropped axis is a finding too.
//
// AN AXIS MUST ALSO *VARY* WHERE IT IS DRAWN. The second round of selection
// happened because `sweep` — blast weapons — turned out to be a permanently
// empty spoke on the roller's card: blast comes only from loot, and 0 of 3000
// rolled characters own any. It predicted well for delved parties and said
// nothing at all about a fresh one, which is a quarter of the chart wasted on
// the screen most people see first. A correlation earns an axis its place; a
// standard deviation greater than zero is what keeps it there.
//
// Its replacement, `speed`, is the only one here whose mechanism was ISOLATED
// rather than inferred: see the note on the axis.
//
// THE CONFOUND THAT ALMOST GOT THROUGH. On the first pass, `carry` (free
// inventory slots) correlated with toll at **+0.75** — parties with emptier
// packs died far more. That is not a fact about packs. Delving fills your pack
// AND gives you scars that raise your maximums, so "empty pack" was standing in
// for "has never delved". Holding the delve count constant collapsed it to
// +0.33 at zero delves and −0.10 at three: it flips sign, so it is not an axis.
// Every number below is measured with delves held constant for that reason.
//
// Rules text quoted in comments is Cairn 2e by Yochai Gal, CC BY-SA 4.0. The
// axes, the weights and the whole idea of scoring a party this way are ours.

/** Expected value of one attack under "roll all dice, keep the highest". */
export function expectedDamage(dice) {
  if (!dice || !dice.length) return 0;
  if (dice.length === 1) return (dice[0] + 1) / 2;
  let sum = 0;
  const top = Math.max(...dice);
  for (let v = 1; v <= top; v++) {
    let allAtMost = 1;
    let allBelow = 1;
    for (const d of dice) {
      allAtMost *= Math.min(v, d) / d;
      allBelow *= Math.min(v - 1, d) / d;
    }
    sum += v * (allAtMost - allBelow);
  }
  return sum;
}

/**
 * The four axes, each carrying the correlations that earned it its place.
 *
 * `corrByDelve[d]` is the correlation against toll for parties d delves in, so
 * NEGATIVE is good: more of this axis, fewer bodies. Measured over 120 random
 * parties per delve level against a five-encounter basket at 200 trials each
 * (standard error ≈ 0.09), delves held constant within each figure.
 *
 * WHY A CURVE AND NOT A NUMBER. Two of these four only predict in one regime,
 * and a single headline correlation hides that:
 *
 *              delve 0   1       2       3
 *   durability  −0.84  −0.75   −0.73   −0.69     always
 *   damage      −0.56  −0.44   −0.43   −0.34     always
 *   grit        −0.39  −0.25   −0.16   −0.08     FADES to nothing
 *   sweep        0.00  −0.39   −0.44   −0.30     does not exist yet at 0
 *
 * Grit and sweep are near-complements, and both have a mechanism. Strength is
 * only reached by damage that overflows hit protection; three delves of scars
 * and armour make that overflow rare, so Strength stops mattering — it is a
 * fresh-party axis. Blast is the mirror: nobody starts with a bomb, so the axis
 * is identically zero until the party has been somewhere.
 *
 * This was found the hard way. `grit` was first recorded as −0.44/−0.23 from a
 * 26-party sample, and the validation test then measured it at **+0.42** — a
 * sample that small has a standard error of 0.21, so both figures were noise
 * around a small effect. The fix was not to loosen the threshold; it was to
 * measure properly and write down the decay, which turned out to be real.
 */
export const AXES = [
  {
    key: 'durability',
    label: 'durability',
    why: 'hit protection plus twice armour — the strongest single predictor of who walks away',
    corrByDelve: [-0.84, -0.75, -0.73, -0.69],
    // The weight was CALIBRATED, not guessed. hp+1a, hp+2a, hp+3a and hp+4a
    // were all measured; ×2 is the most stable across delve levels (−0.741 and
    // −0.737, where ×3 gives −0.740 and −0.690). Armour is subtracted from
    // every hit, which is why it is worth several hit points and not one.
    of: (c) => c.hp + c.armor * 2,
    lo: 3,
    hi: 13,
  },
  {
    key: 'damage',
    label: 'damage',
    why: 'expected damage of the best weapon carried, under the keep-the-highest rule',
    corrByDelve: [-0.56, -0.44, -0.43, -0.34],
    of: (c) => expectedDamage(c.attacks[0] && c.attacks[0].dice),
    lo: 3.5,
    hi: 5.5,
  },
  {
    key: 'grit',
    label: 'grit',
    why: 'Strength — what damage overflows into. Decides fresh parties, fades as armour piles up',
    corrByDelve: [-0.39, -0.25, -0.16, -0.08],
    of: (c) => c.STR,
    lo: 8,
    hi: 13,
  },
  {
    key: 'speed',
    label: 'speed',
    // The only axis here whose mechanism was ISOLATED rather than inferred.
    // Six points of Dexterity across a party is worth 0.073 of the toll — and
    // running the identical test with `surprise: true`, which is precisely the
    // rule "nobody gets the first-round save to act", makes the effect
    // **exactly 0.0000**. That is not a correlation that survived a control;
    // it is the single rule that produces it, switched off and back on.
    why: 'Dexterity — "each PC must make a DEX save in order to act" in round one, and a party '
      + 'that stands still for a round pays for it',
    corrByDelve: [-0.20, -0.24, -0.19, -0.23],
    of: (c) => c.DEX,
    lo: 8.25,
    hi: 13,
  },
];

/** How far in a party is, clamped to the range the correlations were measured over. */
export const delvesOf = (pcs) =>
  Math.max(0, Math.min(3, Math.round(pcs.reduce((s, c) => s + (c.delves || 0), 0) / (pcs.length || 1))));

/**
 * Tested and DROPPED. Recorded rather than deleted, because "we tried this and
 * it does not predict anything" is worth more than a silent absence — and
 * because the first of them contradicts the most common piece of party-building
 * advice there is.
 */
export const REJECTED = [
  {
    key: 'sweep',
    why: 'blast weapons — reach into a crowd',
    corr: { fresh: 0, delved: -0.33 },
    verdict: 'REAL BUT NOT AN AXIS. Blast is decisive once someone owns a bomb (−0.39 at one '
      + 'delve, −0.44 at two) and **0 of 3000 rolled characters own one**, so on the roller it '
      + 'was a permanently empty spoke — a quarter of the chart saying nothing. It is also a '
      + 'yes/no fact rather than a quantity, so it moved to the `bomb` role chip, which is where '
      + 'yes/no facts belong. Nothing was lost except a dead axis.',
  },
  {
    key: 'teeth',
    why: 'the fraction of the party swinging a d8 or better',
    corr: { fresh: -0.56, delved: -0.27 },
    verdict: 'strong fresh (−0.41 even after durability, damage and grit) and gone by three '
      + 'delves (−0.05) — it is a coarse restatement of `damage` that stops discriminating once '
      + 'everybody has found a real weapon. Two damage axes is one damage axis and a decoration.',
  },
  {
    key: 'weakest',
    why: 'the least durable member — a party dies one at a time',
    corr: { fresh: -0.64, delved: -0.57 },
    verdict: 'looks superb alone and collapses to −0.09 once mean durability is held constant. '
      + 'It was measuring durability with extra steps.',
  },
  {
    key: 'recovery',
    why: 'healing spells and relics',
    corr: { fresh: -0.17, delved: 0.22 },
    verdict: 'FLIPS SIGN. "Every party needs a healer" does not hold in Cairn — healing '
      + 'restores hit protection, and it is Strength that kills you.',
  },
  {
    key: 'carry',
    why: 'free inventory slots',
    corr: { fresh: 0.33, delved: -0.10 },
    verdict: 'flips sign; the apparent +0.75 across all parties was delve count in disguise',
  },
  { key: 'removal', why: 'disables and sleep', corr: { fresh: 0.06, delved: 0.09 }, verdict: 'no signal' },
  { key: 'ward', why: 'the Shield spell', corr: { fresh: 0, delved: 0.08 }, verdict: 'no signal — too rare to matter' },
  { key: 'will', why: 'WIL, which resists morale and fumbles', corr: { fresh: 0.08, delved: 0.14 }, verdict: 'no signal' },
];

const clamp01 = (x) => Math.max(0, Math.min(1, x));

/**
 * One party -> a score on each axis, raw and normalised to 0..1.
 *
 * The bounds come from the 5th and 95th percentile of three hundred parties
 * across six delve levels, so a full radar means "as good as the best parties
 * this generator produces" rather than "as good as arithmetic allows".
 */
export function profile(pcs, opts = {}) {
  const delves = opts.delves === undefined ? delvesOf(pcs) : Math.max(0, Math.min(3, opts.delves));
  // Weighted by |correlation| AT THIS PARTY'S DELVE LEVEL, which is the only
  // defensible weighting for axes that were chosen by correlation and whose
  // correlations move. It also fixes an unfairness: with a fixed weight, a
  // freshly rolled party was marked down for lacking a bomb that no fresh party
  // can own. At delve 0 sweep weighs nothing, and grit weighs most.
  const weight = (a) => Math.abs(a.corrByDelve[delves]);
  const axes = AXES.map((a) => {
    const raw = pcs.reduce((s, c) => s + a.of(c), 0) / (pcs.length || 1);
    return {
      key: a.key,
      label: a.label,
      why: a.why,
      corr: a.corrByDelve[delves],
      corrByDelve: a.corrByDelve,
      weight: weight(a),
      raw,
      value: clamp01((raw - a.lo) / (a.hi - a.lo)),
    };
  });
  const total = AXES.reduce((s, a) => s + weight(a), 0) || 1;
  return {
    delves,
    axes,
    // One number, for sorting and for the headline.
    score: axes.reduce((s, a) => s + a.value * a.weight, 0) / total,
  };
}

/**
 * The roles a party has filled — a headline you can read at a glance.
 *
 * Unlike the axes these are NOT predictive claims; they are a description of
 * who is carrying what, so the config screen can say "nobody here can reach a
 * crowd" without pretending that is a survival forecast.
 */
export const ROLES = [
  {
    key: 'anvil',
    label: 'anvil',
    why: 'at least 5 hit protection and some armour — can take the first exchange',
    test: (c) => c.hp >= 5 && c.armor >= 1,
  },
  {
    key: 'hammer',
    label: 'hammer',
    why: 'a d8 or better in hand',
    test: (c) => Math.max(...(c.attacks[0].dice || [0])) >= 8,
  },
  {
    key: 'bomb',
    label: 'bomb',
    why: 'carries something with blast',
    test: (c) => c.attacks.some((a) => a.blast),
  },
  {
    key: 'book',
    label: 'book',
    why: 'carries a spellbook or a charged relic',
    test: (c) => (c.spells || []).length > 0 || (c.powers || []).length > 0,
  },
  {
    key: 'light',
    label: 'travelling light',
    why: 'two or more free slots, so can still pick something up',
    test: (c) => c.freeSlots >= 2,
  },
];

export function roles(pcs) {
  const out = {};
  for (const r of ROLES) out[r.key] = pcs.filter((c) => r.test(c)).map((c) => c.name);
  return out;
}

/** Everything the overview card needs, in one call. */
export function overview(pcs, opts = {}) {
  const p = profile(pcs, opts);
  const r = roles(pcs);
  return {
    ...p,
    roles: r,
    missing: ROLES.filter((x) => !r[x.key].length).map((x) => x.key),
    encumbered: pcs.filter((c) => c.encumbered).map((c) => c.name),
    hp: pcs.reduce((s, c) => s + c.hp, 0),
    armor: pcs.reduce((s, c) => s + c.armor, 0),
  };
}

/**
 * The radar as SVG path geometry — points on a unit circle, one per axis.
 * Returned as numbers so the page can draw it without this module knowing
 * anything about the DOM.
 */
export function radarPoints(axes, radius = 1) {
  const n = axes.length;
  return axes.map((a, i) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;  // first axis at the top
    return {
      key: a.key,
      label: a.label,
      value: a.value,
      x: Math.cos(angle) * radius * a.value,
      y: Math.sin(angle) * radius * a.value,
      ax: Math.cos(angle) * radius,
      ay: Math.sin(angle) * radius,
    };
  });
}
