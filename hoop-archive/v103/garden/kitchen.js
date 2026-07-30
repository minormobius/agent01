// kitchen.js — the dwelling's storage fixture, grown into a KITCHEN. Pure, no DOM, data-injected (the
// flavor table is fetched by index.html and passed in). You cook 2–4 harvested crops into a DISH whose
// quality is the yum flavor COHERENCE of its ingredients (avg pairwise cosine of their compound
// embeddings, graded S→F, exactly like the /cards recipe builder). A coherent dish nourishes far more
// than the raw crops would — pairing well is the whole game. Determinism: cooking is a pure function of
// (ingredients, flavor table), so a dish is identical on every machine and across atproto saves.

export const DISH_MIN = 2, DISH_MAX = 4;
const VESSELS = ['pottage', 'mash', 'medley', 'stew', 'bowl', 'hash', 'broth', 'pilaf'];

export const kCrop = (kitchen, id) => (kitchen && kitchen.crops || []).find((c) => c.id === id) || null;

// coherence of one ingredient pair: the baked cosine, or the neutral fallback when a crop has no flavor
// embedding (the six un-matched weeds). Pure lookup.
export function pairCoherence(kitchen, a, b) {
  if (a === b) return 1;
  const key = [a, b].sort().join('|');
  const p = kitchen && kitchen.pairs && kitchen.pairs[key];
  return p ? p.coh : (kitchen && kitchen.NEUTRAL) || 0.28;
}

export function gradeOf(kitchen, score) {
  for (const [min, grade, label] of (kitchen && kitchen.grades) || []) if (score >= min) return { grade, label };
  return { grade: 'F', label: 'Chaotic' };
}

// score a dish = the average pairwise coherence of its ingredients (+ a small PMI co-occurrence note).
export function cookScore(kitchen, ids) {
  const u = [...new Set(ids)];
  if (u.length < 2) return { coherence: 0, pmi: 0, grade: '—', label: 'needs ≥2 crops', n: u.length };
  let coh = 0, pmi = 0, n = 0;
  for (let i = 0; i < u.length; i++) for (let j = i + 1; j < u.length; j++) {
    coh += pairCoherence(kitchen, u[i], u[j]);
    const p = kitchen.pairs && kitchen.pairs[[u[i], u[j]].sort().join('|')]; pmi += p ? p.pmi : 0;
    n++;
  }
  coh /= n; pmi /= n;
  const g = gradeOf(kitchen, coh);
  return { coherence: coh, pmi, grade: g.grade, label: g.label, n: u.length };
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
function dishName(crops, ids, vessel) {
  const names = ids.map((id) => { const c = crops.find((x) => x.id === id); return c ? c.common : id; });
  const head = names.slice(0, 2).join(' & ') + (names.length > 2 ? ` & ${names.length - 2} more` : '');
  return `${cap(vessel)} of ${head}`;
}

// cook the selected crops into a dish ITEM (storable in the larder chest, or eaten). `crops` is the ark's
// crop list (for names + raw nourish), `ids` the chosen crop ids. A well-paired dish gets a big nourish
// bonus; high grades also heal. Returns null if fewer than DISH_MIN ingredients.
export function cookDish(kitchen, crops, ids) {
  const u = [...new Set(ids)].slice(0, DISH_MAX);
  if (u.length < DISH_MIN) return null;
  const sc = cookScore(kitchen, u);
  const raw = u.reduce((s, id) => { const c = crops.find((x) => x.id === id); return s + (c ? c.nourish | 0 : 6); }, 0);
  const bonus = Math.round(raw * sc.coherence * 0.6 + Math.max(0, sc.pmi) * 1.5);   // pairing turns calories into nourishment
  const nourish = raw + bonus;
  const heal = sc.grade === 'S' ? 10 : sc.grade === 'A' ? 5 : 0;
  const vessel = VESSELS[(u.join('').split('').reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7)) % VESSELS.length];
  return {
    kind: 'dish', name: dishName(crops, u, vessel),
    grade: sc.grade, label: sc.label, coherence: +sc.coherence.toFixed(3),
    ingredients: u,
    food: { nourish, restoreStamina: Math.round(nourish * 0.4), heal },
  };
}
