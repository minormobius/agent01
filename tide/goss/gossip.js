// gossip.js — the GOSS kernel: a civic WEB (not a map) grown over the econ society, plus the
// social-drama substrate on top of it.
//
// The econ kernel (vendored verbatim from hoop/v099/econ — copy-never-fork, re-sync don't edit)
// breeds a town: places (role × domain buildings) and people who wear many hats (home, work,
// worship, club, sport). That web is ECONOMIC + associational. goss adds the layers the drama
// oracle will need, all deterministic from (seed):
//
//   1. DEMOGRAPHICS  — the engine carries none (no gender, age, or kinship anywhere in hoop's
//      stats.js/crew.js/econ.js). goss derives them per person: age, pronouns, a household
//      surname + unique given name (the engine's 30-name pool collides constantly), and kinship
//      within the household (partner / child / sibling / kin). Goss-local canon — nothing is
//      written back into the engine, but it's seeded off stable person identity, so if hoop
//      later adopts demographics this module lifts out whole.
//   2. TIES          — the person↔person weighted graph projected from co-membership (who shares
//      which place, weighted by how binding the context is: household > work > worship > club).
//   3. TRIBES        — NO faction is assigned at the NPC level anywhere in the engine (nave.js
//      factions are ward-level roleMix biases). Here tribes EMERGE: deterministic label
//      propagation over the tie graph. Each tribe gets a totem place and a name.
//   4. ROMANCE       — established partners (from kinship) + new sparks (seeded attraction over
//      strong non-household ties), flagged cross-tribe / affair-risk / triangle.
//   5. TENSION       — the two big axes:
//        · TRIBALISM: polarization per tribe pair (how few ties cross), contested places
//          (membership entropy across tribes), defectors (people whose ties pull outward).
//        · NARCISSISM OF SMALL DIFFERENCES: tribe pairs that are most SIMILAR in composition
//          yet least connected — the near-twin feud. Person-level: same-role coworkers with
//          near-identical webs = rivals for the same regard.
//   6. DRAMAS        — the proto-oracle: typed drama seeds (FEUD, SCHISM, STAR-CROSSED, AFFAIR,
//      TRIANGLE, RIVALS, DEFECTOR, MATCH) instantiated from graph patterns and ranked by heat.
//      This is scaffolding for the real oracle — the theory isn't settled; the types are cheap
//      to add/remove and each carries its evidence (people/places/tribes/numbers) so a future
//      scorer can re-weigh them.
//
// Pure, zero-DOM, node-tested (test/gossip.selftest.mjs). Same (seed) ⇒ same town, same names,
// same tribes, same gossip, forever.

import { buildWorld, buildSociety, socialMetrics, scoreSociety, DEFAULT_GENOME, ROLES, DOMAINS, makePlace } from './vendor/econ/econ.js';
import { mulberry32 } from './vendor/paint/voronoi.js';

// ── seeded hashing ────────────────────────────────────────────────────────────────────────────
const hash = (...xs) => {
  let h = 1779033703 >>> 0;
  for (const x of xs) { h = Math.imul(h ^ (x >>> 0), 3432918353) >>> 0; h = ((h << 13) | (h >>> 19)) >>> 0; }
  h = Math.imul(h ^ (h >>> 16), 2246822507) >>> 0; h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
};
const pick = (r, list) => list[Math.floor(r() * list.length)];

// ── naming banks ──────────────────────────────────────────────────────────────────────────────
const GIVEN = [
  'Vex', 'Sol', 'Pell', 'Mara', 'Cael', 'Iris', 'Doro', 'Tann', 'Wick', 'Esh', 'Bryn', 'Orr',
  'Lune', 'Sabel', 'Cinder', 'Quill', 'Jim', 'Wren', 'Ada', 'Ines', 'Rosa', 'Suki', 'Mir', 'Vale',
  'Ruth', 'Nova', 'Bram', 'Esa', 'Jun', 'Liv', 'Cato', 'Wynn', 'Dax', 'Fenn', 'Otto', 'Lena',
  'Cy', 'Bo', 'Tomas', 'Hal', 'Gus', 'Pia', 'Ned', 'Cole', 'Amity', 'Basel', 'Corvid', 'Delia',
  'Ember', 'Faro', 'Grist', 'Hollis', 'Idra', 'Jasper', 'Kite', 'Lyra', 'Moss', 'Nim', 'Oleander',
  'Prosper', 'Reyes', 'Sorrel', 'Tamsin', 'Umber', 'Vesper', 'Whit', 'Xa', 'Yew', 'Zell',
];
const SURNAMES = [
  'Voss', 'Marrow', 'Halt', 'Tibb', 'Cassiel', 'Drey', 'Okra', 'Sedge', 'Vant', 'Hullborn',
  'Ninewell', 'Spindle', 'Quay', 'Ferrous', 'Greenline', 'Aftward', 'Corecool', 'Dimmer',
  'Foglark', 'Gantry', 'Kelvin', 'Ladder', 'Mothbal', 'Nacelle', 'Oxbow', 'Pyx', 'Ratchet',
  'Solder', 'Trellis', 'Umbral', 'Windlass', 'Yaw', 'Ballast', 'Cinderfall', 'Downspin',
];
// place naming: a role word + a seeded ward prefix, so gossip can SAY where things happen.
const ROLE_WORD = {
  dwell: 'Rows', grow: 'Gardens', make: 'Works', mend: 'Chopshop', trade: 'Exchange',
  serve: 'Canteen', play: 'Pitch', heal: 'Clinic', learn: 'Athenaeum', worship: 'Chapel',
  govern: 'Hall', move: 'Runway', store: 'Vault',
};
const WARD_PREFIX = [
  'Spinward', 'Antispin', 'Aft', 'Fore', 'Upper', 'Lower', 'Old', 'New', 'Half-Light',
  'Greenline', 'Coreside', 'Rimside', 'Fogline', 'Ninth', 'Quiet', 'Copper', 'Long',
];
export function placeName(pl, seed) {
  const r = mulberry32(hash(seed, pl.id, 911) || 1);
  const word = ROLE_WORD[pl.role] || 'House';
  const dom = pl.domain ? cap(pl.domain) + ' ' : '';
  return `${pick(r, WARD_PREFIX)} ${dom}${word}`;
}

// ── 1. DEMOGRAPHICS — enrich each person; derive households + kinship ────────────────────────
const PRONOUNS = [['she', 'her'], ['he', 'him'], ['they', 'them']];
export function enrichPeople(society, seed) {
  const byHome = new Map();
  for (const p of society.people) { let g = byHome.get(p.home); if (!g) { g = []; byHome.set(p.home, g); } g.push(p.idx); }
  const people = society.people.map((p) => ({ idx: p.idx, home: p.home, x: p.x, y: p.y, hats: p.hats }));
  const households = [];
  for (const [home, members] of byHome) {
    const hr = mulberry32(hash(seed, home, 7717) || 1);
    const surname = pick(hr, SURNAMES);
    // ages: seeded; sort desc so the eldest heads the household and kinship reads off age gaps.
    const aged = members.map((idx) => {
      const r = mulberry32(hash(seed, idx, 3391) || 1);
      const u = r();
      const age = u < 0.22 ? 6 + Math.floor(r() * 12)          // child 6–17
        : u < 0.86 ? 18 + Math.floor(r() * 47)                  // adult 18–64
        : 65 + Math.floor(r() * 24);                            // elder 65–88
      return { idx, age };
    }).sort((a, b) => b.age - a.age || a.idx - b.idx);
    const head = aged[0];
    let partner = null;
    const used = new Set();
    for (const m of aged) {
      const P = people[m.idx];
      P.age = m.age; P.surname = surname;
      const pr = mulberry32(hash(seed, m.idx, 5501) || 1);
      P.pronouns = pick(pr, PRONOUNS);
      // unique given name within the household
      let given = pick(pr, GIVEN), guard = 0;
      while (used.has(given) && guard++ < 20) given = pick(pr, GIVEN);
      used.add(given);
      P.given = given; P.name = `${given} ${surname}`;
      if (m.idx === head.idx) { P.kinship = 'head'; continue; }
      if (!partner && m.age >= 18 && head.age >= 18 && Math.abs(m.age - head.age) <= 14) { partner = m.idx; P.kinship = 'partner'; continue; }
      if (m.age <= head.age - 16) { P.kinship = 'child'; continue; }
      P.kinship = m.age >= 18 ? 'sibling' : 'kin';
    }
    households.push({ home, surname, members: aged.map((m) => m.idx), head: head.idx, partner });
  }
  return { people, households, byHome };
}

// ── 2. TIES — the person↔person weighted graph, projected from co-membership ─────────────────
const KIND_W = { work: 2.0, worship: 1.5, club: 1.2, sport: 1.2, 'home garden': 0.4 };
export function weaveTies(society, enriched) {
  const tieMap = new Map();  // "a:b" (a<b) → { a, b, w, via: [{place, kind}] }
  const bump = (a, b, w, place, kind) => {
    if (a === b) return;
    const [lo, hi] = a < b ? [a, b] : [b, a];
    const k = lo + ':' + hi;
    let t = tieMap.get(k);
    if (!t) { t = { a: lo, b: hi, w: 0, via: [] }; tieMap.set(k, t); }
    t.w += w; t.via.push({ place, kind });
  };
  // household bonds — the strongest tissue; partner tightest.
  for (const hh of enriched.households) {
    const M = hh.members;
    for (let i = 0; i < M.length; i++) for (let j = i + 1; j < M.length; j++) {
      const w = (hh.partner != null && ((M[i] === hh.head && M[j] === hh.partner) || (M[j] === hh.head && M[i] === hh.partner))) ? 4.0 : 3.0;
      bump(M[i], M[j], w, hh.home, 'household');
    }
  }
  // co-membership at shared places — weight by how binding each side's hat is there.
  const hatKind = new Map(); // pidx → Map(place → kind)
  for (const p of enriched.people) { const m = new Map(); for (const h of p.hats) m.set(h.place, h.kind); hatKind.set(p.idx, m); }
  for (const [placeId, members] of society.placeMembers) {
    const M = members.filter((i) => enriched.people[i].home !== placeId); // co-residence already bonded
    for (let i = 0; i < M.length; i++) for (let j = i + 1; j < M.length; j++) {
      const ka = hatKind.get(M[i]).get(placeId), kb = hatKind.get(M[j]).get(placeId);
      const w = ((KIND_W[ka] || 0.8) + (KIND_W[kb] || 0.8)) / 2;
      bump(M[i], M[j], w, placeId, ka === kb ? ka : 'mixed');
    }
  }
  const ties = [...tieMap.values()];
  const adj = new Map(); // idx → [{to, w}]
  for (const t of ties) {
    if (!adj.has(t.a)) adj.set(t.a, []);
    if (!adj.has(t.b)) adj.set(t.b, []);
    adj.get(t.a).push({ to: t.b, w: t.w }); adj.get(t.b).push({ to: t.a, w: t.w });
  }
  return { ties, adj };
}

// ── 3. TRIBES — emergent, not assigned: deterministic label propagation over the tie graph ───
const TRIBE_SUFFIX = ['set', 'lot', 'crowd', 'circle', 'row', 'line', 'kin', 'bench'];
export function findTribes(field, enriched, web, seed) {
  const N = enriched.people.length;
  const label = new Array(N); for (let i = 0; i < N; i++) label[i] = i;
  for (let round = 0; round < 40; round++) {
    let changed = 0;
    for (let i = 0; i < N; i++) {
      const ns = web.adj.get(i); if (!ns || !ns.length) continue;
      const score = new Map();
      for (const e of ns) score.set(label[e.to], (score.get(label[e.to]) || 0) + e.w);
      let best = label[i], bw = -1;
      for (const [l, w] of score) if (w > bw + 1e-9 || (Math.abs(w - bw) <= 1e-9 && l < best)) { best = l; bw = w; }
      if (best !== label[i]) { label[i] = best; changed++; }
    }
    if (!changed) break;
  }
  // gather; fold tiny fragments (<4 souls) into their strongest-tied neighbour tribe.
  const groups = new Map();
  for (let i = 0; i < N; i++) { let g = groups.get(label[i]); if (!g) { g = []; groups.set(label[i], g); } g.push(i); }
  const big = [...groups.entries()].filter(([, m]) => m.length >= 4).map(([l]) => l);
  const bigSet = new Set(big);
  if (big.length) for (const [l, m] of groups) {
    if (bigSet.has(l)) continue;
    for (const i of m) {
      // fold into the strongest-TIED big tribe only; an unconnected fragment stays its own tribe
      // (dumping it into an arbitrary big tribe would let a "tribe" span components — e.g. wards).
      const score = new Map();
      for (const e of web.adj.get(i) || []) { const tl = label[e.to]; if (bigSet.has(tl) && tl !== l) score.set(tl, (score.get(tl) || 0) + e.w); }
      let best = -1, bw = -1; for (const [tl, w] of score) if (w > bw || (w === bw && tl < best)) { best = tl; bw = w; }
      if (best >= 0) label[i] = best;
    }
  }
  // canonical tribe ids in first-seen order; profile + totem + name per tribe.
  const order = [], idOf = new Map();
  for (let i = 0; i < N; i++) if (!idOf.has(label[i])) { idOf.set(label[i], order.length); order.push(label[i]); }
  const tribeOf = new Array(N); for (let i = 0; i < N; i++) tribeOf[i] = idOf.get(label[i]);
  const placeById = new Map(field.places.map((p) => [p.id, p]));
  const tribes = order.map((_, t) => ({ id: t, members: [], profile: {}, placeW: new Map() }));
  for (let i = 0; i < N; i++) {
    const T = tribes[tribeOf[i]]; T.members.push(i);
    for (const h of enriched.people[i].hats) {
      T.profile[h.role] = (T.profile[h.role] || 0) + 1;
      if (h.place !== enriched.people[i].home) T.placeW.set(h.place, (T.placeW.get(h.place) || 0) + (KIND_W[h.kind] || 0.8));
    }
  }
  for (const T of tribes) {
    let totem = null, tw = -1;
    for (const [pid, w] of T.placeW) { const pl = placeById.get(pid); if (!pl || pl.role === 'dwell') continue; if (w > tw || (w === tw && pid < totem)) { totem = pid; tw = w; } }
    if (totem == null && T.members.length) {                  // hermit fragment: fall back to its commonest home
      const homes = new Map();
      for (const i of T.members) { const h = enriched.people[i].home; homes.set(h, (homes.get(h) || 0) + 1); }
      totem = [...homes.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
    }
    T.totem = totem;
    const r = mulberry32(hash(seed, 4241, T.id, totem == null ? 0 : totem) || 1);
    T.name = totem != null ? `the ${placeName(placeById.get(totem), seed)} ${pick(r, TRIBE_SUFFIX)}` : `the unplaced ${pick(r, TRIBE_SUFFIX)}`;
    T.placeW = [...T.placeW.entries()].sort((a, b) => b[1] - a[1]);
  }
  return { tribeOf, tribes };
}

// ── 4. ROMANCE — partners we already have; sparks are seeded attraction over strong ties ─────
export function findRomance(enriched, web, tribal, seed) {
  const P = enriched.people;
  const partnerOf = new Array(P.length).fill(-1);
  const couples = [];
  for (const hh of enriched.households) if (hh.partner != null) { partnerOf[hh.head] = hh.partner; partnerOf[hh.partner] = hh.head; couples.push({ a: hh.head, b: hh.partner }); }
  const sameHouse = (a, b) => P[a].home === P[b].home;
  const candidates = [];
  for (const t of web.ties) {
    if (sameHouse(t.a, t.b)) continue;
    if (P[t.a].age < 18 || P[t.b].age < 18) continue;
    if (Math.abs(P[t.a].age - P[t.b].age) > 18) continue;
    const r = mulberry32(hash(seed, 6961, t.a, t.b) || 1);
    const heat = r() * (0.45 + Math.min(t.w, 6) / 8);
    if (heat > 0.62) candidates.push({ a: t.a, b: t.b, heat, tie: t.w });
  }
  candidates.sort((x, y) => y.heat - x.heat || x.a - y.a || x.b - y.b);
  const sparkCount = new Map();
  const sparks = [];
  for (const c of candidates) {
    if ((sparkCount.get(c.a) || 0) >= 2 || (sparkCount.get(c.b) || 0) >= 2) continue;
    sparkCount.set(c.a, (sparkCount.get(c.a) || 0) + 1); sparkCount.set(c.b, (sparkCount.get(c.b) || 0) + 1);
    sparks.push({
      ...c,
      cross: tribal.tribeOf[c.a] !== tribal.tribeOf[c.b],
      affair: partnerOf[c.a] >= 0 || partnerOf[c.b] >= 0,
    });
    if (sparks.length >= Math.max(6, Math.floor(P.length / 14))) break;
  }
  // triangles: two sparks sharing a person
  const bySoul = new Map();
  for (const s of sparks) for (const i of [s.a, s.b]) { if (!bySoul.has(i)) bySoul.set(i, []); bySoul.get(i).push(s); }
  const triangles = [];
  for (const [i, list] of bySoul) if (list.length >= 2) triangles.push({ pivot: i, sparks: list.slice(0, 2) });
  return { couples, partnerOf, sparks, triangles };
}

// ── 5. TENSION — the two axes: tribalism + the narcissism of small differences ───────────────
const cosine = (A, B) => {
  let dot = 0, na = 0, nb = 0;
  const keys = new Set([...Object.keys(A), ...Object.keys(B)]);
  for (const k of keys) { const a = A[k] || 0, b = B[k] || 0; dot += a * b; na += a * a; nb += b * b; }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
};
export function findTension(field, society, enriched, web, tribal) {
  const { tribeOf, tribes } = tribal;
  // per-tribe-pair cross weight; per-soul in/out pull; per-tribe strength (for the null model)
  const crossW = new Map(); // "a:b" → w
  const inW = new Array(enriched.people.length).fill(0), outW = new Array(enriched.people.length).fill(0);
  const strength = new Array(tribes.length).fill(0);
  let total = 0, cross = 0;
  for (const t of web.ties) {
    const ta = tribeOf[t.a], tb = tribeOf[t.b];
    total += t.w; strength[ta] += t.w; strength[tb] += t.w;
    if (ta === tb) { inW[t.a] += t.w; inW[t.b] += t.w; continue; }
    cross += t.w; outW[t.a] += t.w; outW[t.b] += t.w;
    const k = ta < tb ? ta + ':' + tb : tb + ':' + ta;
    crossW.set(k, (crossW.get(k) || 0) + t.w);
  }
  const polarization = total ? 1 - cross / total : 0;
  // tribe-pair table: similarity vs connection → NSD. `link` compares the actual cross weight to
  // the CONFIGURATION-MODEL expectation E[w_ab] = S_a·S_b / 2W (modularity's null): link 1 = as
  // stitched as random mixing predicts, link 0 = a hard wall.
  const pairs = [];
  for (let a = 0; a < tribes.length; a++) for (let b = a + 1; b < tribes.length; b++) {
    const k = a + ':' + b, cw = crossW.get(k) || 0;
    const expect = total ? (strength[a] * strength[b]) / (2 * total) : 0;
    const link = expect ? Math.min(1, cw / expect) : 0;
    const sim = cosine(tribes[a].profile, tribes[b].profile);
    pairs.push({ a, b, cross: cw, expect, link, sim, nsd: sim * (1 - link), heat: (1 - link) * (0.4 + 0.6 * sim) });
  }
  pairs.sort((x, y) => y.nsd - x.nsd || x.a - y.a);
  // contested places: tribe-composition entropy among a place's members (non-dwell, ≥4 souls)
  const placeById = new Map(field.places.map((p) => [p.id, p]));
  const contested = [];
  for (const [pid, members] of society.placeMembers) {
    const pl = placeById.get(pid); if (!pl || pl.role === 'dwell' || members.length < 4) continue;
    const counts = new Map();
    for (const i of members) counts.set(tribeOf[i], (counts.get(tribeOf[i]) || 0) + 1);
    if (counts.size < 2) continue;
    let H = 0;
    for (const [, c] of counts) { const p = c / members.length; H -= p * Math.log2(p); }
    contested.push({ place: pid, members: members.length, tribes: counts.size, entropy: H, split: [...counts.entries()].sort((x, y) => y[1] - x[1]) });
  }
  contested.sort((x, y) => y.entropy - x.entropy || y.members - x.members);
  // defectors: souls whose outward pull beats their inward
  const defectors = [];
  for (let i = 0; i < enriched.people.length; i++) if (outW[i] > inW[i] && outW[i] > 2) defectors.push({ idx: i, inW: inW[i], outW: outW[i], pull: outW[i] / Math.max(0.001, inW[i]) });
  defectors.sort((x, y) => y.pull - x.pull);
  // rivals — small differences at soul level: same work role at the same place, similar webs
  const social = enriched.people.map((p) => new Set(p.hats.filter((h) => h.place !== p.home).map((h) => h.place)));
  const rivals = [];
  for (const [pid, members] of society.placeMembers) {
    const pl = placeById.get(pid); if (!pl || pl.role === 'dwell') continue;
    const workers = members.filter((i) => enriched.people[i].hats.some((h) => h.place === pid && h.kind === 'work'));
    for (let i = 0; i < workers.length; i++) for (let j = i + 1; j < workers.length; j++) {
      const A = social[workers[i]], B = social[workers[j]];
      let inter = 0; for (const x of A) if (B.has(x)) inter++;
      const jac = (A.size + B.size - inter) ? inter / (A.size + B.size - inter) : 0;
      if (jac >= 0.5 && enriched.people[workers[i]].home !== enriched.people[workers[j]].home) {
        rivals.push({ a: workers[i], b: workers[j], place: pid, overlap: jac });
      }
    }
  }
  rivals.sort((x, y) => y.overlap - x.overlap || x.a - y.a);
  return { polarization, pairs, contested, defectors, rivals, inW, outW };
}

// ── 6. DRAMAS — the proto-oracle: typed seeds instantiated from the patterns above ───────────
export function findDramas(field, enriched, tribal, romance, tension, seed) {
  const placeById = new Map(field.places.map((p) => [p.id, p]));
  const pn = (pid) => placeName(placeById.get(pid), seed);
  const P = enriched.people, T = tribal.tribes;
  const who = (i) => P[i].name;
  const dramas = [];
  const add = (type, heat, title, line, refs) => dramas.push({ type, heat: Math.round(Math.max(0, Math.min(100, heat))), title, line, ...refs });

  // FEUD — narcissism of small differences at tribe scale
  for (const pr of tension.pairs.slice(0, 3)) {
    if (pr.nsd < 0.45) continue;
    add('FEUD', 55 + pr.nsd * 45, `${T[pr.a].name} vs ${T[pr.b].name}`,
      `${cap(T[pr.a].name)} and ${T[pr.b].name} are near-twins — ${Math.round(pr.sim * 100)}% the same trades and pews — yet barely a tie crosses the line between them. Nobody hates like family.`,
      { tribes: [pr.a, pr.b], evidence: { sim: pr.sim, link: pr.link, nsd: pr.nsd } });
  }
  // SCHISM — contested third places
  for (const c of tension.contested.slice(0, 2)) {
    add('SCHISM', 40 + c.entropy * 30, `the ${pn(c.place)} question`,
      `The ${pn(c.place)} seats ${c.tribes} tribes and ${c.members} souls, and none of them will share a bench. Whoever runs it next runs the neighbourhood.`,
      { places: [c.place], evidence: { entropy: c.entropy, split: c.split } });
  }
  // STAR-CROSSED / AFFAIR / MATCH — the romance layer against the tribal map
  for (const s of romance.sparks) {
    const names = `${who(s.a)} and ${who(s.b)}`;
    if (s.affair) {
      const bound = romance.partnerOf[s.a] >= 0 ? s.a : s.b;
      add('AFFAIR', 60 + s.heat * 30, `${names}, seen twice`,
        `${who(bound)} is spoken for, and yet ${names} keep finding the same shift, the same pew, the same excuse. The household hasn't noticed. The neighbours have.`,
        { people: [s.a, s.b, romance.partnerOf[bound]], evidence: { heat: s.heat, tie: s.tie } });
    } else if (s.cross) {
      add('STAR-CROSSED', 55 + s.heat * 35, `${names}, across the line`,
        `${who(s.a)} of ${T[tribal.tribeOf[s.a]].name} and ${who(s.b)} of ${T[tribal.tribeOf[s.b]].name} — a spark right across the coldest boundary in the district. Both sets of kin would object, which is of course the appeal.`,
        { people: [s.a, s.b], tribes: [tribal.tribeOf[s.a], tribal.tribeOf[s.b]], evidence: { heat: s.heat, tie: s.tie } });
    } else {
      add('MATCH', 30 + s.heat * 30, `${names}?`,
        `Everyone but ${who(s.a)} and ${who(s.b)} can see it. Same circles, same hours, both unattached. The ${T[tribal.tribeOf[s.a]].name} are quietly arranging seating.`,
        { people: [s.a, s.b], evidence: { heat: s.heat, tie: s.tie } });
    }
  }
  // TRIANGLE
  for (const tr of romance.triangles.slice(0, 3)) {
    const [s1, s2] = tr.sparks;
    const others = [s1.a === tr.pivot ? s1.b : s1.a, s2.a === tr.pivot ? s2.b : s2.a];
    add('TRIANGLE', 65 + (s1.heat + s2.heat) * 15, `${who(tr.pivot)} can't choose`,
      `${who(tr.pivot)} burns two candles: ${who(others[0])} and ${who(others[1])}. The two of them haven't compared notes yet. When they do, pick a bench and watch.`,
      { people: [tr.pivot, ...others], evidence: { heats: [s1.heat, s2.heat] } });
  }
  // RIVALS — small differences at soul level
  for (const rv of tension.rivals.slice(0, 3)) {
    add('RIVALS', 40 + rv.overlap * 40, `${who(rv.a)} vs ${who(rv.b)}`,
      `${who(rv.a)} and ${who(rv.b)} do the same job at the ${pn(rv.place)}, keep ${Math.round(rv.overlap * 100)}% the same circles, and are therefore incapable of a civil word. The difference between them is invisible to everyone but themselves.`,
      { people: [rv.a, rv.b], places: [rv.place], evidence: { overlap: rv.overlap } });
  }
  // DEFECTOR
  for (const d of tension.defectors.slice(0, 2)) {
    const home = T[tribal.tribeOf[d.idx]];
    add('DEFECTOR', 35 + Math.min(1, d.pull / 3) * 40, `${who(d.idx)} drifts`,
      `${who(d.idx)} still sleeps among ${home.name}, but every tie that matters now pulls elsewhere. The kin have started using the past tense.`,
      { people: [d.idx], tribes: [tribal.tribeOf[d.idx]], evidence: { pull: d.pull, inW: d.inW, outW: d.outW } });
  }
  dramas.sort((x, y) => y.heat - x.heat || x.title.localeCompare(y.title));
  return dramas;
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// ── THE PIPELINE — layers 1–6 over any (field, society). The substrate is pluggable. ─────────
function runPipeline(field, society, seed) {
  const metrics = socialMetrics(field, society);
  const vital = scoreSociety(field, society, metrics);
  const enriched = enrichPeople(society, seed);
  // if the substrate tags places with a ward/faction (the nave), people inherit their home's.
  const placeById = new Map(field.places.map((p) => [p.id, p]));
  for (const p of enriched.people) { const home = placeById.get(p.home); if (home && home.ward != null) { p.ward = home.ward; p.faction = home.faction; } }
  const web = weaveTies(society, enriched);
  const tribal = findTribes(field, enriched, web, seed);
  const romance = findRomance(enriched, web, tribal, seed);
  const tension = findTension(field, society, enriched, web, tribal);
  const dramas = findDramas(field, enriched, tribal, romance, tension, seed);
  return { seed, world: field, society, metrics, vital, enriched, web, tribal, romance, tension, dramas };
}

// ── ASSEMBLE — the econ-town build. One call, one seed, the entire social weather. ───────────
export function buildGoss({ seed = 1, cells = 2600, W = 900, H = 600, genome = DEFAULT_GENOME } = {}) {
  const world = buildWorld({ W, H, cells, seed, genome });
  const society = buildSociety(world, { seed, genome });
  return runPipeline(world, society, seed);
}

// ── THE NAVE SUBSTRATE — chunk rooms in, the chunkroller sampling, two pollination modes ─────
// How hoop chunks sample econ (measured, hoop/chunkroller/civic.js is the reference): a chunk's
// rooms[] are adapted into econ places (fieldFromRooms) and econ's buildSociety is RE-ROLLED over
// them — the engine's own cast (room.people, the sprites that walk the deck) is a separate, thinner
// population (npc.js only wires dwell→nearest-work/third). Chunkroller scores each chunk ALONE:
// societies do NOT cross-pollinate anywhere in the engine today. The one exception is the live
// game's cosmetic commute web, which picks nearest workplaces across ALL loaded chunks by pure
// Euclidean distance — ignoring ward walls entirely.
//
// buildGossNave runs the same sampling over a baked nave (data/nave-<seed>.json) in two modes:
//   'sealed' — engine-faithful: seven independent societies (buildSociety per ward), zero cross-
//              ward ties. Tribes can never span a ward. Per-ward vitality, as chunkroller scores it.
//   'floor'  — the what-if: one society over all seven chunks' rooms; hats (jobs, parishes, clubs)
//              cross wards by nearest-distance, like the game's commute web. One floor vitality.
// Both are deterministic from the nave's baked seed.

const domObj = (id) => DOMAINS.find((d) => d.id === id) || DOMAINS[0];

// chunkroller's civic.js fieldFromRooms, replicated over the vendored econ (+ ward/faction tags,
// + a place-id offset so per-ward fields can merge into one global namespace).
export function fieldFromRooms(rooms, W, H, idBase = 0) {
  const places = rooms.map((room, i) => {
    const pl = makePlace(idBase + i, room.role, domObj(room.domain));
    pl.x = room.x; pl.y = room.y; pl.footprint = room.fp || 1;
    pl.ward = room.ward != null ? room.ward : null; pl.faction = room.faction || null;
    return pl;
  });
  const spacing = Math.max(5, Math.sqrt((W * H) / Math.max(1, places.length)));
  const byRes = new Map();
  for (const pl of places) for (const r of pl.out) { let a = byRes.get(r); if (!a) { a = []; byRes.set(r, a); } a.push(pl); }
  const edges = []; let need = 0, met = 0;
  for (const pl of places) for (const r of [...new Set(pl.in)]) {
    need++;
    const list = byRes.get(r); if (!list) continue;
    let best = null, bd = Infinity;
    for (const q of list) { if (q.id === pl.id) continue; const d = (q.x - pl.x) ** 2 + (q.y - pl.y) ** 2; if (d < bd) { bd = d; best = q; } }
    if (best) { met++; edges.push({ from: pl.id, to: best.id, r, fx: pl.x, fy: pl.y, tx: best.x, ty: best.y }); }
  }
  const counts = {}; for (const pl of places) counts[pl.role] = (counts[pl.role] || 0) + 1;
  return { W, H, spacing, places, edges, byRes, counts, need, met, closure: need ? met / need : 1 };
}

// merge per-ward fields + societies into one global namespace (people re-indexed, place ids already
// disjoint via idBase). The merged web has NO cross-ward anything — that's the point of sealed mode.
function mergeWards(fields, societies) {
  const field = {
    W: fields[0].W, H: fields[0].H, places: [], edges: [], byRes: new Map(), counts: {}, need: 0, met: 0,
  };
  const society = { people: [], placeMembers: new Map(), affiliations: 0 };
  for (let w = 0; w < fields.length; w++) {
    const f = fields[w], s = societies[w], pOff = society.people.length;
    field.places.push(...f.places); field.edges.push(...f.edges);
    for (const [r, list] of f.byRes) { let a = field.byRes.get(r); if (!a) { a = []; field.byRes.set(r, a); } a.push(...list); }
    for (const k in f.counts) field.counts[k] = (field.counts[k] || 0) + f.counts[k];
    field.need += f.need; field.met += f.met;
    for (const p of s.people) society.people.push({ ...p, idx: p.idx + pOff });
    for (const [pid, members] of s.placeMembers) society.placeMembers.set(pid, members.map((i) => i + pOff));
    society.affiliations += s.affiliations;
  }
  field.closure = field.need ? field.met / field.need : 1;
  field.spacing = Math.max(5, Math.sqrt((field.W * field.H) / Math.max(1, field.places.length)));
  const P = society.people.length || 1;
  society.avgHats = society.affiliations / P;
  society.thirdsFrac = society.people.filter((p) => p.hats.some((h) => ['worship', 'club', 'sport'].includes(h.kind))).length / P;
  return { field, society };
}

export function buildGossNave(nave, { mode = 'floor' } = {}) {
  const seed = nave.seed;
  const { x0, y0, x1, y1 } = nave.bbox;
  const W = Math.ceil(x1 - x0), H = Math.ceil(y1 - y0);
  const wardRooms = nave.chunks.map((ch, w) => ch.rooms.map((r) => ({ ...r, x: r.x - x0, y: r.y - y0, ward: w, faction: ch.meta.faction })));
  const enginePeople = nave.chunks.map((ch) => ch.rooms.reduce((s, r) => s + (r.people ? r.people.length : 0), 0));
  let out;
  if (mode === 'sealed') {
    // seven independent societies — the engine truth (chunkroller scores each chunk alone).
    const fields = [], societies = [], wards = [];
    let idBase = 0;
    for (let w = 0; w < wardRooms.length; w++) {
      const f = fieldFromRooms(wardRooms[w], W, H, idBase); idBase += wardRooms[w].length;
      const s = buildSociety(f, { seed: (seed ^ (w * 0x9e37 + 0x51)) >>> 0 });
      const m = socialMetrics(f, s), v = scoreSociety(f, s, m);
      fields.push(f); societies.push(s);
      wards.push({ ward: w, meta: nave.chunks[w].meta, people: s.people.length, engine: enginePeople[w], vitality: Math.round(v.vitality), tier: v.tier });
    }
    const merged = mergeWards(fields, societies);
    out = runPipeline(merged.field, merged.society, seed);
    out.wards = wards;
  } else {
    // one floor — hats cross wards by nearest-distance (the game's Euclidean commute rule writ large).
    const rooms = wardRooms.flat();
    const field = fieldFromRooms(rooms, W, H);
    const society = buildSociety(field, { seed });
    out = runPipeline(field, society, seed);
    out.wards = nave.chunks.map((ch, w) => ({ ward: w, meta: ch.meta, people: out.enriched.people.filter((p) => p.ward === w).length, engine: enginePeople[w] }));
  }
  out.mode = mode; out.nave = { bbox: nave.bbox, shift: { x: x0, y: y0 }, connections: nave.connections, polys: nave.chunks.map((ch) => ch.poly.map(([px, py]) => [px - x0, py - y0])), meta: nave.chunks.map((ch) => ch.meta) };
  out.enginePeople = enginePeople.reduce((a, b) => a + b, 0);
  out.alignment = factionTribeAlignment(out.enriched, out.tribal);
  return out;
}

// designed factions vs emergent tribes — how well does the web's own clustering recover the
// designer's wards? Per tribe, the faction split of its members; overall alignment = the
// population-weighted share sitting in their tribe's majority faction (1 = tribes ≡ factions).
export function factionTribeAlignment(enriched, tribal) {
  if (!enriched.people.length || enriched.people[0].faction == null) return null;
  const perTribe = tribal.tribes.map((t) => {
    const split = {};
    for (const i of t.members) { const f = enriched.people[i].faction || '?'; split[f] = (split[f] || 0) + 1; }
    const top = Object.entries(split).sort((a, b) => b[1] - a[1])[0];
    return { tribe: t.id, split, majority: top ? top[0] : null, purity: t.members.length ? (top ? top[1] : 0) / t.members.length : 0 };
  });
  const aligned = perTribe.reduce((s, r) => s + r.purity * tribal.tribes[r.tribe].members.length, 0);
  const P = enriched.people.length || 1;
  return { perTribe, overall: aligned / P };
}

export { ROLES };
export default { buildGoss, enrichPeople, weaveTies, findTribes, findRomance, findTension, findDramas, placeName };
