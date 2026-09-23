// mood/mood.js — the tone of ten posts, as a ring of colour.
//
// Pure: no DOM, no network, no key. Everything here is the part that can be
// wrong silently, so all of it is gated by mood.selftest.mjs.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THE QUESTIONS ARE SHAPED LIKE THIS
//
// Jev answers typed questions, and the three primitives are not
// interchangeable. jev's own colour-axis finding says it plainly:
//
//   `score` returns the expectation over an ORDERED set of rungs … averaging
//   over an ordering that does not exist would put "red or violet" at green.
//   Choose the primitive from the shape of the variable.
//
// A mood ring walks straight into that. The obvious build is one `score` from
// "angry" to "happy", and it is wrong: a post that is half fury and half
// delight would come back at the midpoint and render as CALM. The model's
// uncertainty would be laundered into a confident reading of serenity.
//
// So mood is asked as the two things that genuinely are ordered, plus one
// thing that genuinely is not:
//
//   valence  (bleak → delighted)   ordered  → score
//   energy   (becalmed → frantic)  ordered  → score
//   flavour  (wry, tender, angry…) unordered → choice
//
// Valence and energy are the circumplex model of affect: two axes whose PLANE
// carries the mood, where neither axis alone does. Colour is then derived from
// where a post lands on that plane — never asked for directly, because hue has
// no order either.
// ─────────────────────────────────────────────────────────────────────────────

/** How many posts make a ring. The ask was ten. */
export const N_POSTS = 10;

/** Ordered rungs. The wording is the instruction — jev reads these literally. */
export const VALENCE = ['bleak', 'downcast', 'flat', 'warm', 'delighted'];
export const ENERGY = ['becalmed', 'idle', 'stirring', 'charged', 'frantic'];

/**
 * Unordered, and that is the whole point of asking it as a `choice`. There is
 * no "more wry" between tender and angry, so there is no scale to average
 * over and no midpoint to land on.
 */
export const FLAVOURS = {
  tender: 'affectionate, fond, moved',
  funny: 'joking, playful, absurd',
  awed: 'wonder, astonishment, delight at something',
  wry: 'dry, ironic, deadpan, arch',
  curious: 'questioning, thinking aloud, working something out',
  anxious: 'worried, uneasy, bracing',
  angry: 'irritated, indignant, scornful',
  bleak: 'sad, defeated, grim',
  plain: 'flat or informational, no tone to speak of',
};

const MAX = VALENCE.length - 1;            // the top rung index, 4
const MID = MAX / 2;                       // dead centre, 2

// ── asking ───────────────────────────────────────────────────────────────────

/**
 * The state jev classifies. All ten posts go in ONE state and every question
 * is evaluated against it in isolation — so post 7's reading cannot be
 * contaminated by post 6's, while the model still sees the voice as a whole.
 */
export function buildState(posts, who = {}) {
  return {
    account: { handle: who.handle || null, displayName: who.displayName || null },
    note: 'Recent posts and replies by one account, newest first. Judge the tone the AUTHOR is expressing, not whether the subject matter is pleasant.',
    posts: posts.map((p, i) => ({ id: i, text: p.text })),
  };
}

/** Three questions per post: two ordered scores and one unordered choice. */
export function buildQuestions(posts) {
  const q = {};
  posts.forEach((_, i) => {
    q[`valence_${i}`] = {
      type: 'score',
      instructions: `Post ${i}: how pleasant or unpleasant is the feeling the author is expressing? Judge the author's own tone, not whether the topic is nice.`,
      criteria: VALENCE,
    };
    q[`energy_${i}`] = {
      type: 'score',
      instructions: `Post ${i}: how activated is the author? Stillness at the bottom, urgency at the top. This is independent of whether the feeling is good or bad.`,
      criteria: ENERGY,
    };
    q[`flavour_${i}`] = {
      type: 'choice',
      instructions: `Post ${i}: which single word best names the tone? These are unordered — pick the nearest, and pick "plain" if there is no real tone to read.`,
      criteria: FLAVOURS,
    };
  });
  return q;
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const num = (v, fallback = MID) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/**
 * Jev's answers → one reading per post.
 *
 * A missing or malformed answer becomes a dead-centre reading at zero
 * confidence rather than a thrown error: one unreadable post must not cost
 * the other nine their ring.
 */
export function readMoods(answers, posts) {
  const a = answers || {};
  return posts.map((p, i) => {
    const v = a[`valence_${i}`] || {};
    const e = a[`energy_${i}`] || {};
    const f = a[`flavour_${i}`] || {};
    const valence = clamp(num(v.score), 0, MAX);
    const energy = clamp(num(e.score), 0, MAX);
    // The colour is made of valence and energy, so the haze is made of THEIR
    // confidence. The flavour word carries its own, separately.
    const confidence = clamp((num(v.confidence, 0) + num(e.confidence, 0)) / 2, 0, 1);
    return {
      i,
      uri: p.uri || null,
      text: p.text || '',
      createdAt: p.createdAt || null,
      isReply: !!p.isReply,
      valence,
      energy,
      confidence,
      flavour: typeof f.choice === 'string' ? f.choice : null,
      flavourConfidence: clamp(num(f.confidence, 0), 0, 1),
      answered: typeof v.score === 'number' && typeof e.score === 'number',
    };
  });
}

// ── the plane ────────────────────────────────────────────────────────────────

/**
 * A reading's position on the circumplex: an angle (which mood) and a radius
 * (how strongly). Centre is "nothing much" and the radius is what says so.
 */
export function circumplex(valence, energy) {
  const x = (clamp(valence, 0, MAX) - MID) / MID;
  const y = (clamp(energy, 0, MAX) - MID) / MID;
  const angle = (Math.atan2(y, x) * 180) / Math.PI;
  return {
    x,
    y,
    angle: (angle + 360) % 360,
    intensity: clamp(Math.hypot(x, y), 0, 1),
  };
}

/**
 * Circumplex angle → hue, as `(100 − angle) mod 360`.
 *
 * The coefficient is 1 and not a prettier-looking number because the map has
 * to CLOSE: any other slope walks the hue somewhere else after a full turn, so
 * the same mood would get two colours depending on how you got there.
 *
 * Where the four quadrants land, which is the whole palette:
 *
 *   delighted + charged  (45°)  → hue  55  gold
 *   bleak + charged     (135°)  → hue 325  magenta-red
 *   bleak + becalmed    (225°)  → hue 235  indigo
 *   delighted + becalmed(315°)  → hue 145  green
 */
export const HUE_AT_ZERO = 100;
export const hueFor = (angle) => ((HUE_AT_ZERO - angle) % 360 + 360) % 360;

/**
 * A reading → a colour.
 *
 * Saturation carries intensity and is floored, so a genuinely flat post reads
 * as muted rather than as a hole in the ring. Alpha carries CONFIDENCE: a post
 * jev could barely read is literally hazy, which is the honest rendering of a
 * three-word post it scored at 0.32.
 */
export function moodColour(valence, energy, confidence = 1) {
  const { angle, intensity } = circumplex(valence, energy);
  const h = Math.round(hueFor(angle));
  const s = Math.round(26 + 58 * intensity);
  const l = Math.round(56 - 10 * intensity);
  const a = +(0.34 + 0.66 * clamp(confidence, 0, 1)).toFixed(3);
  return { h, s, l, a, intensity, angle, css: `hsl(${h} ${s}% ${l}% / ${a})`, solid: `hsl(${h} ${s}% ${l}%)` };
}

/**
 * The stone in the middle: the whole account's mood.
 *
 * AVERAGED ON THE PLANE, NEVER IN HUE, and this is the trap the module exists
 * to avoid. Take someone half furious (magenta) and half serene (green): the
 * mean of those two HUES is indigo, and indigo is melancholy — a mood neither
 * post had, stated confidently. Averaging valence and energy instead puts them
 * at dead centre with intensity ~0, which renders grey and reads as "no
 * coherent mood", which is the truth. mood.selftest.mjs pins exactly this.
 *
 * Readings are weighted by confidence, so a post jev could not read does not
 * drag the stone as hard as one it was sure of. `weight` never reaches zero,
 * or a ring of ten unreadable posts would divide by it.
 */
export function aggregate(moods) {
  const live = (moods || []).filter((m) => m.answered);
  if (!live.length) return { valence: MID, energy: MID, confidence: 0, n: 0, ...moodColour(MID, MID, 0) };
  let wv = 0, we = 0, wc = 0, w = 0;
  for (const m of live) {
    const k = 0.15 + 0.85 * m.confidence;
    wv += m.valence * k; we += m.energy * k; wc += m.confidence; w += k;
  }
  const valence = wv / w, energy = we / w, confidence = wc / live.length;
  return { valence, energy, confidence, n: live.length, ...moodColour(valence, energy, confidence) };
}

/**
 * How much the ring actually varies — the spread of the readings on the plane.
 * A ring of ten identical readings and a ring of ten wild ones can share a
 * stone, and only this number tells them apart.
 */
export function spread(moods) {
  const live = (moods || []).filter((m) => m.answered);
  if (live.length < 2) return 0;
  const agg = aggregate(live);
  let sum = 0;
  for (const m of live) sum += Math.hypot(m.valence - agg.valence, m.energy - agg.energy);
  return sum / live.length / MID;                      // 0..~1.4, in plane units
}

/** Eight sectors, so the stone has a name and not only a colour. */
export const SECTORS = [
  { to: 22.5, name: 'content' }, { to: 67.5, name: 'elated' }, { to: 112.5, name: 'keyed up' },
  { to: 157.5, name: 'agitated' }, { to: 202.5, name: 'downcast' }, { to: 247.5, name: 'weary' },
  { to: 292.5, name: 'quiet' }, { to: 337.5, name: 'at ease' }, { to: 360.1, name: 'content' },
];

/**
 * Name the mood — but only when there is one. Below a real radius the angle is
 * noise around the centre, and naming it would dress a shrug as a diagnosis.
 */
export function moodName(valence, energy) {
  const { angle, intensity } = circumplex(valence, energy);
  if (intensity < 0.12) return 'even';
  return (SECTORS.find((s) => angle < s.to) || SECTORS[0]).name;
}

/** The flavour words that actually turned up, commonest first. */
export function flavourTally(moods) {
  const m = new Map();
  for (const x of (moods || [])) {
    if (!x.flavour) continue;
    m.set(x.flavour, (m.get(x.flavour) || 0) + 1);
  }
  return [...m].map(([flavour, n]) => ({ flavour, n }))
    .sort((a, b) => b.n - a.n || a.flavour.localeCompare(b.flavour));
}

/** Where each reading sits on the ring. Newest at twelve o'clock, clockwise. */
export function ringSegments(n, { gap = 2.2 } = {}) {
  const step = 360 / Math.max(1, n);
  return Array.from({ length: n }, (_, i) => ({
    i,
    from: -90 + i * step + gap / 2,
    to: -90 + (i + 1) * step - gap / 2,
    mid: -90 + (i + 0.5) * step,
  }));
}

/** An SVG arc path for one segment of the ring. */
export function arcPath(cx, cy, rInner, rOuter, fromDeg, toDeg) {
  const p = (r, deg) => {
    const a = (deg * Math.PI) / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  const large = Math.abs(toDeg - fromDeg) > 180 ? 1 : 0;
  const [x1, y1] = p(rOuter, fromDeg), [x2, y2] = p(rOuter, toDeg);
  const [x3, y3] = p(rInner, toDeg), [x4, y4] = p(rInner, fromDeg);
  return `M${x1.toFixed(2)} ${y1.toFixed(2)}A${rOuter} ${rOuter} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`
    + `L${x3.toFixed(2)} ${y3.toFixed(2)}A${rInner} ${rInner} 0 ${large} 0 ${x4.toFixed(2)} ${y4.toFixed(2)}Z`;
}
