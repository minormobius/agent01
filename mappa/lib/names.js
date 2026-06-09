// mappa/lib/names.js — the TOPONYMY engine, extracted so the viewer AND the
// server-side OG card name a world identically. A feature name is a generated
// SPECIFIC root + a feature-appropriate GENERIC term (Mount Kruth · Thauld Deep ·
// Naish Lode). The syllable palette is one of several LANGUAGE FAMILIES, chosen
// per TECTONIC PLATE, so features on a landmass share a tongue and language
// borders fall along the plate sutures. Deterministic from (seed, plate, salt).

export const LANGS = [
  { id: 'Varn', on: ['k', 'kr', 'gr', 'dr', 'th', 'sk', 'v', 't', 'br', 'd', 'h'], nu: ['a', 'o', 'u', 'au'], co: ['rk', 'th', 'n', 'd', 'k', 'rn', '', 'ld'] },  // harsh · northern highland
  { id: 'Lyr', on: ['l', 'v', 's', 'n', 'th', 'm', 'el', 'r', 'll'], nu: ['e', 'i', 'ae', 'ia', 'y'], co: ['l', 'r', 'n', 'en', '', 'il', 'th'] },                  // liquid · forest upland
  { id: 'Mor', on: ['m', 'b', 'h', 'v', 'd', 'n', 'br', 'l', 'r'], nu: ['o', 'u', 'a', 'oa'], co: ['m', 'l', 'n', 'r', 'on', '', 'um'] },                            // round · lowland river
  { id: 'Kael', on: ['k', 'q', 'z', 'sh', 't', 'h', 'rh', 'j', 's', 'n', 'kh'], nu: ['a', 'i', 'ai', 'u'], co: ['n', 'r', 't', 'sh', 'd', '', 'm'] },                // bright · southern desert
  { id: 'Esh', on: ['s', 'sy', 'v', 'th', 'n', 'x', 'z', 'st', 'sh'], nu: ['y', 'i', 'e', 'ei'], co: ['s', 'x', 'th', '', 'ss', 'n'] },                              // sibilant · eastern coast
];
const GENERIC = { // feature kind → generic toponym terms (prefix and/or suffix forms)
  peak:    { pre: ['Mount', 'Mt.', 'Pike of', 'Cairn'], suf: ['Tor', 'Horn', 'Fell', 'Pike', 'Crag', 'Scaur', 'Spire'] },
  trough:  { pre: [], suf: ['Deep', 'Trench', 'Abyss', 'Trough', 'Fault', 'Sink', 'Gulf'] },
  volcano: { pre: ['Mount'], suf: ['Fell', 'Caldera', 'Pyre', 'Forge', 'Smokes', 'Ashmount'] },
  ore:     { pre: [], suf: ['Lode', 'Field', 'Diggings', 'Reach', 'Vein', 'Workings', 'Mine', 'Strike'] },
  dig:     { pre: [], suf: ['Beds', 'Quarry', 'Pits', 'Bonebeds', 'Marl', 'Hollow', 'Cutting'] },
};
function nameRng(seed, salt) {
  let s = (((seed >>> 0) * 0x9e3779b1) ^ ((salt >>> 0) * 0x85ebca77)) >>> 0;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
function langOf(world, i) { const p = ((world.plate ? world.plate[i] : 0) >>> 0); return ((p * 0x9e3779b1) >>> 0) % LANGS.length; }
function genRoot(lid, rnd) {
  const L = LANGS[lid], cap = x => x.charAt(0).toUpperCase() + x.slice(1);
  const syl = first => L.on[(rnd() * L.on.length) | 0] + L.nu[(rnd() * L.nu.length) | 0] + (first || rnd() < 0.5 ? L.co[(rnd() * L.co.length) | 0] : '');
  let nm = cap(syl(true)); if (rnd() < 0.4) nm += syl(false); return nm;
}
// full toponym for a feature of `kind` at cell `i`, salted so each feature differs
export function featureName(world, kind, i, salt) {
  const rnd = nameRng(world.meta.seed, salt), lid = i >= 0 ? langOf(world, i) : ((salt >>> 3) % LANGS.length);
  const root = genRoot(lid, rnd), g = GENERIC[kind]; if (!g) return root;
  if (g.pre.length && (g.suf.length === 0 || rnd() < 0.4)) return g.pre[(rnd() * g.pre.length) | 0] + ' ' + root;
  return root + ' ' + g.suf[(rnd() * g.suf.length) | 0];
}
// the cell on the largest landmass with the highest ground (a continent's "name cell")
export function largestLandCell(world) {
  const N = world.N, seen = new Uint8Array(N); let bi = -1, bestA = -1;
  for (let s = 0; s < N; s++) {
    if (seen[s] || world.water[s] !== 0) continue;
    let a = 0, rep = s; const q = [s]; seen[s] = 1;
    for (let h = 0; h < q.length; h++) {
      const c = q[h]; a += world.area ? world.area[c] : 1; if (world.elev[c] > world.elev[rep]) rep = c;
      for (const j of world.adj[c]) if (!seen[j] && world.water[j] === 0) { seen[j] = 1; q.push(j); }
    }
    if (a > bestA) { bestA = a; bi = rep; }
  }
  return bi;
}
// the world's own name — its largest landmass, in that landmass's language
export function worldName(world) {
  const i = largestLandCell(world);
  return featureName(world, 'world', i >= 0 ? i : 0, (world.meta.seed >>> 0) * 7 + 13);
}
