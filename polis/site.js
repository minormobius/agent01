// site.js — why here: score every land cell on TWO axes (site vs situation),
// pre-seed the forced spawn points, pick the best with minimum spacing, and assign
// each chosen site a FOUNDING ENGINE (the big game in town). This is Phase 0/1 of
// the theory made concrete on the toy substrate.
//
//   site      = the spot itself: fresh-water proximity, defensibility, buildable land
//   situation = its relation to the wider world: on a route (river), at a confluence
//               (break-of-bulk), at a river mouth / coast (gateway to away-markets)
//
// The founding advantage is a one-time tie-break recorded as `engine`; later growth
// (economy.js) can outlive it (path dependence).

// relief prominence: how much a cell stands above its 8 neighbours (defensibility)
function prominence(s, i) {
  const x = i % s.W, y = (i / s.W) | 0; let sum = 0, n = 0, watered = 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy) continue;
    const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= s.W || ny >= s.H) continue;
    const j = ny * s.W + nx; sum += s.elev[j]; n++; if (s.water[j]) watered++;
  }
  const rel = n ? Math.max(0, s.elev[i] - sum / n) : 0;          // hill
  return rel * 3 + watered / 8 * 0.4;                            // + water-on-many-sides (meander/peninsula)
}

// how many distinct river/water neighbours — a proxy for a confluence / break-of-bulk
function junction(s, i) {
  let w = 0; for (const j of s.nb4(i)) if (s.river[j] || s.water[j]) w++;
  return w;
}

export function scoreSites(s) {
  const N = s.N, site = new Float32Array(N), situation = new Float32Array(N), forced = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (s.water[i]) continue;
    const onRiver = s.river[i] ? 1 : 0;
    let coast = 0; for (const j of s.nb4(i)) if (s.water[j]) coast = 1;
    const above = Math.max(0, s.elev[i] - s.seaLevel);

    // SITE: drink + defend + build + a fertile hinterland (so inland market towns compete)
    site[i] = 0.45 * s.moisture[i]                      // fresh water within reach
            + 0.8 * prominence(s, i)                    // defensibility
            + 0.25 * Math.max(0, 1 - above * 2.0)       // buildable lowland (not a peak)
            + 0.9 * s.fertility[i];                     // a hinterland to feed a market

    // SITUATION: routes + trade reach
    const jn = junction(s, i);
    situation[i] = 1.2 * onRiver                        // a route runs through
                 + 0.6 * coast                          // a coast to ship from
                 + 0.7 * Math.min(1, s.flow[i] / 60)    // traffic the watercourse carries
                 + 0.9 * (jn >= 3 ? 1 : 0)              // a confluence (break-of-bulk)
                 + 1.0 * (s.mouth[i] ? 1 : 0);          // a river mouth (the gateway)

    // FORCED spawn points: features decisive enough to seed a town almost regardless
    if (s.mouth[i] || jn >= 3 || (s.resource[i] === 'ore')) forced[i] = 1;
  }
  return { site, situation, forced };
}

function engineOf(s, i, scores) {
  let coast = 0; for (const j of s.nb4(i)) if (s.water[j] === 1) coast = 1;
  if (s.mouth[i] || (coast && s.river[i])) return 'gateway';        // export staple to away-markets
  if (s.resource[i] === 'ore') return 'staple';                    // a mine: one commodity
  if (junction(s, i) >= 3 || (s.river[i] && s.flow[i] > 40)) return 'break-of-bulk';
  if (prominence(s, i) > 0.35) return 'fortress';                  // citadel/garrison
  return 'market';                                                 // serve the hinterland (central place)
}

// Found a STRATIFIED set: the region's best port, market, confluence-town, fortress
// and mine (one of each engine, by score, respecting spacing), then fill the rest by
// raw score. The single best sites are all near-identical coastal mouths, so picking
// purely by score yields seven clones; stratifying gives a believable VARIETY of
// towns — and, because engines differ in base/ceiling, a real size hierarchy.
export function foundTowns(s, scores, { count = 7, spacing = 9, wSite = 1.1, wSit = 1.0 } = {}) {
  const N = s.N, cand = [];
  for (let i = 0; i < N; i++) {
    if (s.water[i]) continue;
    let v = wSite * scores.site[i] + wSit * scores.situation[i];
    if (scores.forced[i]) v += 1.0;                               // the founding-engine bonus (a tie-break)
    cand.push({ v, i, x: i % s.W, y: (i / s.W) | 0, engine: engineOf(s, i, scores) });
  }
  cand.sort((a, b) => b.v - a.v);
  const sp2 = spacing * spacing, chosen = [];
  const farEnough = (c) => chosen.every((d) => (d.x - c.x) ** 2 + (d.y - c.y) ** 2 >= sp2);
  const take = (c) => chosen.push({ cell: c.i, x: c.x, y: c.y, score: c.v, engine: c.engine });

  // pass 1 — one of each engine type, best-scored and spaced (diversity)
  for (const ty of ['gateway', 'market', 'break-of-bulk', 'fortress', 'staple']) {
    if (chosen.length >= count) break;
    const c = cand.find((c) => c.engine === ty && farEnough(c));
    if (c) take(c);
  }
  // pass 2 — fill the remaining slots by raw score (the strongest sites, whatever their type)
  for (const c of cand) {
    if (chosen.length >= count) break;
    if (chosen.some((d) => d.cell === c.i) || !farEnough(c)) continue;
    take(c);
  }
  return chosen;
}
