// The two genera of semantic puzzles, each with its oracle certificate.
//
// LADDER — cross a semantic gulf. From the start word, step only to one of the
//   current word's 12 nearest neighbours; reach the target. The BFS oracle
//   certifies a path exists and records par + the optimal path. Interest:
//   the GULF (how dissimilar start and target are) covered in few hops, and
//   the fan-out along the way.
//
// FOLD — sort 12 words into 3 hidden families of 4. Families are built from
//   well-separated seed neighbourhoods and shipped only with a MARGIN
//   certificate: every word is strictly closer to its own family's centroid
//   than to any other, by a measured gap. Difficulty is the inverse margin —
//   tight margins make wickedly confusable groups, wide ones are gentle.

function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
function goldilocks(x, ideal, w) { const d = (x - ideal) / w; return Math.exp(-d * d); }

// ---------- LADDER ----------
export function genLadder(S, rand) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const start = rand.int(S.n);
    const { dist, parent } = S.bfs(start, 10);
    // candidate targets: par 5..8, semantically FAR from start
    const cands = [];
    for (let i = 0; i < S.n; i++) {
      if (dist[i] >= 5 && dist[i] <= 8) {
        const c = S.cos(start, i);
        if (c < 0.35) cands.push({ i, d: dist[i], c });
      }
    }
    if (cands.length < 4) continue;
    cands.sort((a, b) => a.c - b.c);                  // most distant meanings first
    const pick = cands[rand.int(Math.min(cands.length, 12))];
    const path = S.pathTo(parent, pick.i);
    const par = pick.d;
    const gulf = 1 - pick.c;                          // 0..~1.3 → clamp later
    // fan-out: average out-degree usefulness along optimal path (how many
    // distinct next-hops kept you at the frontier — a proxy via neighbours)
    const report = gradeLadder(S, { start, target: pick.i, par, gulf, path });
    return { genus: 'ladder', start, target: pick.i, par, path, report };
  }
  return null;
}

function gradeLadder(S, L) {
  const signals = {
    gulf: clamp01((L.gulf - 0.65) / 0.55),            // how alien the target is
    depth: clamp01((L.par - 4) / 5),
    stride: clamp01((L.gulf / L.par) / 0.18),         // semantic distance per hop
    pace: goldilocks(L.par, 6.2, 2.2),
  };
  const interest = Math.round(clamp01(0.34 * signals.gulf + 0.22 * signals.depth + 0.28 * signals.stride + 0.16 * signals.pace) * 100);
  const difficulty = Math.round(clamp01(0.45 * signals.depth + 0.35 * signals.gulf + 0.20 * signals.stride) * 100);
  const tiers = ['Gentle', 'Easy', 'Fair', 'Tricky', 'Hard', 'Wicked'];
  return {
    interest, difficulty, diffTier: tiers[Math.min(5, Math.floor(difficulty / 17))], signals,
    descriptor: `${S.wordOf(L.start)} → ${S.wordOf(L.target)}: a ${L.par}-hop crossing of a wide semantic gulf`,
  };
}

// ---------- FOLD ----------
export function genFold(S, rand) {
  for (let attempt = 0; attempt < 60; attempt++) {
    // three seed words, pairwise dissimilar
    const seeds = [];
    let guard = 0;
    while (seeds.length < 3 && guard++ < 200) {
      const c = rand.int(S.n);
      if (seeds.every((s) => S.cos(s, c) < 0.22)) seeds.push(c);
    }
    if (seeds.length < 3) continue;
    // each family: the seed + 3 of its neighbours that aren't confusable
    const families = [];
    let ok = true;
    const used = new Set();
    for (const s of seeds) {
      const fam = [s]; used.add(s);
      for (const nb of S.neighbors(s)) {
        if (fam.length >= 4) break;
        if (used.has(nb.id)) continue;
        fam.push(nb.id); used.add(nb.id);
      }
      if (fam.length < 4) { ok = false; break; }
      families.push(fam);
    }
    if (!ok) continue;

    // MARGIN CERTIFICATE: each word strictly closer (avg cos) to its own
    // family (excluding itself) than to either other family, by gap `m`.
    let minMargin = 1e9;
    for (let f = 0; f < 3 && ok; f++) {
      for (const w of families[f]) {
        const own = avgCos(S, w, families[f]);
        for (let g = 0; g < 3; g++) {
          if (g === f) continue;
          const other = avgCos(S, w, families[g]);
          const margin = own - other;
          if (margin <= 0.03) { ok = false; break; }
          if (margin < minMargin) minMargin = margin;
        }
        if (!ok) break;
      }
    }
    if (!ok) continue;

    const order = rand.shuffle(families.flat());
    const report = gradeFold(S, { families, minMargin });
    return { genus: 'fold', families, order, minMargin, report };
  }
  return null;
}

function avgCos(S, w, fam) {
  let s = 0, c = 0;
  for (const x of fam) { if (x === w) continue; s += S.cos(w, x); c++; }
  return c ? s / c : 0;
}

function gradeFold(S, F) {
  const m = F.minMargin;
  const signals = {
    tension: clamp01(1 - (m - 0.03) / 0.35),          // tighter margin = spicier
    coherence: clamp01(avgFamCoherence(S, F.families) / 0.55),
    spread: clamp01(famSpread(S, F.families) / 0.9),  // how far apart the families sit
  };
  const interest = Math.round(clamp01(0.42 * signals.tension + 0.30 * signals.coherence + 0.28 * signals.spread) * 100);
  const difficulty = Math.round(clamp01(0.7 * signals.tension + 0.3 * (1 - signals.spread)) * 100);
  const tiers = ['Gentle', 'Easy', 'Fair', 'Tricky', 'Hard', 'Wicked'];
  return {
    interest, difficulty, diffTier: tiers[Math.min(5, Math.floor(difficulty / 17))], signals,
    descriptor: `three families, certified separable by a ${m.toFixed(2)} margin`,
  };
}
function avgFamCoherence(S, fams) {
  let s = 0, c = 0;
  for (const fam of fams) for (let i = 0; i < fam.length; i++) for (let j = i + 1; j < fam.length; j++) { s += S.cos(fam[i], fam[j]); c++; }
  return c ? s / c : 0;
}
function famSpread(S, fams) {
  let s = 0, c = 0;
  for (let a = 0; a < fams.length; a++) for (let b = a + 1; b < fams.length; b++) { s += 1 - S.cos(fams[a][0], fams[b][0]); c++; }
  return c ? s / c : 0;
}
