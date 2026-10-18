// gen.js: a seeded character-sheet generator for com.minomobi.gangs.sheet, for inspiration.
// Same seed + same root rules → same sheet, in any browser or in node. Every sheet it makes
// passes check.js against the root it was made for (selftest: node shelf/gangs-sheet-gen.mjs --selftest).
// It reads the rules the way check.js does (rulesOf), so it follows whatever the root sets.
// Not dice: the seed is any text you like, and you're meant to reroll until one sparks, then edit it.
// Abilities aren't in the lexicon yet (the person's 3my5xvqflx224: "blank page with rules").
// The generator suggests one, kept *outside* the record, so nothing here makes the rule up for him.
// Mozzie, 2026-10-18. Pure module; imports check.js read-only.
import { rulesOf } from './check.js';

// xmur3 + sfc32: small, fast, the same everywhere. A string seed in, a [0,1) stream out.
function stream(seed) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = h << 13 | h >>> 19; }
  const next = () => { h = Math.imul(h ^ h >>> 16, 2246822507); h = Math.imul(h ^ h >>> 13, 3266489909); return (h ^= h >>> 16) >>> 0; };
  let a = next(), b = next(), c = next(), d = next();
  return () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    const t = (a + b | 0) + d | 0; d = d + 1 | 0;
    a = b ^ b >>> 9; b = c + (c << 3) | 0; c = c << 21 | c >>> 11; c = c + t | 0;
    return (t >>> 0) / 4294967296;
  };
}

const T = {
  first: ['Wren','Tallow','Ossie','Marrow','Vell','Juniper','Cass','Ilse','Rook','Dace','Nettle','Absalom','Pell','Quince','Sorrel','Hobb','Lark','Teodor','Mab','Corvin','Edda','Fen','Gilly','Saffi'],
  last: ['Ashdown','of the Weigh-house','Marlowe','Two-Coats','Vane','Kettering','Underlock','Saltmarsh','the Lesser','Penhallow','Quill','Brack','No-Name','Harrow','Lamplight','Greaves'],
  playbooks: { // a starter list; a root's `playbooks` replaces it. Each leans on a few default actions.
    Knife:     ['skirmish','prowl','command'],
    Tracker:   ['hunt','survey','prowl'],
    Fixer:     ['tinker','study','wreck'],
    Shade:     ['prowl','finesse','survey'],
    Tongue:    ['sway','consort','finesse'],
    Ledger:    ['study','consort','survey'],
    Medium:    ['attune','study','sway'],
    Archivist: ['study','attune','survey'],
  },
  wear: ['an oilskin coat with ink on the cuffs','a borrowed uniform, one size wrong','a moth-eaten opera cloak','boots resoled more times than counted','a satchel of other people\'s letters','fingerless gloves and a tin whistle','a lantern that never quite goes out','a scarf in the colours of a gang that no longer exists','spectacles with one smoked lens','a coat of patches, one per favour owed'],
  mark: ['a burn scar shaped like a key','hums when nervous','never sits with their back to a door','counts everything twice','smells faintly of the river','one eye that tracks a beat late','laughs at the wrong moment','keeps a pebble from every district','writes everything down, then eats the page','speaks only in the past tense'],
  want: ['the weigh-house ledger, before anyone reads page nine','a name cleared that the town has forgotten','a door in the Undercroft that only opens for the dead','to buy back a sister\'s debt','the map that shows where the bells were melted','to be owed something by everyone in the room','a quiet room, a long sleep, and nobody\'s secrets','to find who first wrote the rules, and ask them why','revenge on the gang that took the corner','one honest card game, just one'],
  but: ['but they owe the wrong person','but every favour costs a memory','but they can\'t refuse a dare','but the last crew they ran with is dead','but they still keep the old gang\'s colours','but they believe the dice are watching','but they never lie, and it shows','but someone is paying for their silence'],
};
// Ability seeds: what it lets you do, within the fences the person already liked (never
// auto-succeed, never ignore stress or harm). One phrase per default action; a custom action
// falls back to the generic line.
const DO = {
  hunt: 'track a quarry across districts', study: 'read a document or a person closely', survey: 'case a place before going in',
  tinker: 'fix, rig or break a mechanism', finesse: 'lift, palm or slip something past a watcher', prowl: 'move unseen through a crowd or over roofs',
  skirmish: 'fight close and dirty', wreck: 'bring something down that was meant to stay up', attune: 'listen to what the dead or the walls remember',
  command: 'give an order to someone who might not take it', consort: 'call on a contact you\'ve kept warm', sway: 'talk someone round to your side',
};
const GAIN = ['take +1d', 'gain +1 effect', 'ask the GM one question they answer truthfully', 'improve your position by one step', 'a crewmate who helps you takes no stress for it'];

const pick = (r, a) => a[Math.floor(r() * a.length)];
function shuffle(r, a) { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// root: as check.js takes it ({uri, cid, rules} or {uri, cid, value}). opts: {controller, operator, createdAt}.
// Returns { record, ability, seed } or throws if the root's rules can't be satisfied.
export function generateSheet(seed, root, opts = {}) {
  const s = String(seed);
  const r = stream(s);
  const R = rulesOf(root);
  if (R.dotsTotal < 0 || R.dotsMax < 0 || R.dotsTotal > R.actions.length * R.dotsMax)
    throw new Error(`the root's rules can't be met: ${R.dotsTotal} dots over ${R.actions.length} actions at most ${R.dotsMax} each`);
  const name = `${pick(r, T.first)} ${pick(r, T.last)}`;
  const playbook = R.playbooks ? pick(r, R.playbooks) : pick(r, Object.keys(T.playbooks));
  const lean = (T.playbooks[playbook] ?? []).filter(a => R.actions.includes(a));
  // Dots: the playbook's lean first (up to the cap), then the rest at random, one dot at a time.
  const dots = Object.fromEntries(R.actions.map(a => [a, 0]));
  let left = R.dotsTotal;
  for (const a of lean) { if (!left) break; const d = Math.min(R.dotsMax, left, lean[0] === a ? R.dotsMax : 1 + Math.floor(r() * R.dotsMax)); dots[a] += d; left -= d; }
  while (left > 0) {
    const open = R.actions.filter(a => dots[a] < R.dotsMax);
    dots[pick(r, open)]++; left--;
  }
  const actions = R.actions.filter(a => dots[a] > 0).map(a => ({ action: a, dots: dots[a] }))
    .sort((x, y) => y.dots - x.dots || R.actions.indexOf(x.action) - R.actions.indexOf(y.action));
  if (!actions.length) actions.push({ action: R.actions[0], dots: 0 }); // a 0-dot root still needs one entry
  const [w1, w2] = shuffle(r, T.wear);
  const look = `${w1[0].toUpperCase()}${w1.slice(1)}, ${w2}; ${pick(r, T.mark)}.`;
  const drive = `Wants ${pick(r, T.want)}, ${pick(r, T.but)}.`;
  const top = actions[0].action;
  const ability = {
    note: 'A suggestion, not a field: the sheet lexicon has no abilities yet. The rule for them is the GM\'s to write.',
    text: `When you ${DO[top] ?? `act with ${top}`}, ${pick(r, GAIN)}.`,
  };
  const record = {
    $type: 'com.minomobi.gangs.sheet',
    game: root?.uri && root?.cid ? { uri: root.uri, cid: root.cid } : { uri: 'at://<root uri>', cid: '<root cid>' },
    name, playbook, look, drive,
    controller: opts.controller ?? 'human',
    ...(opts.operator ? { operator: opts.operator } : {}),
    actions,
    createdAt: opts.createdAt ?? new Date().toISOString(),
  };
  return { seed: s, record, ability };
}
