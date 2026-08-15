// voronoi/specimens.js — the hall of fame.
//
// Every record here was FOUND, not designed. `search.mjs` swept 198 rule bands
// × 3 meshes × 5 densities × 8 soups — 6099 trajectories that scored above
// zero — and these are the survivors, picked for behavioural variety rather
// than for score alone. Five copies of the same attractor is not a collection.
//
// Each `link` is a complete permalink query string: paste it after `?` on the
// page and you get this exact universe, because every number downstream of the
// seed is a pure function of it.
//
// `kind` / `period` / `transient` / `score` are MEASURED at the stated `gens`
// horizon, through the link (not through the sweep's in-memory rule — the
// permalink quantises thresholds to per-mille, and a specimen is a claim about
// what the URL does). `life.selftest.mjs` re-derives all four on every run, so
// if an engine change moves any of these the test fails rather than the page
// quietly lying.
//
// A note on "unsettled": it means no state repeated inside the horizon. That is
// a statement about the window, not a proof of aperiodicity — the state space
// is finite, so every trajectory cycles eventually. `storm` and `drift` were
// additionally run out to 5000 generations by hand and had still not repeated.

export const SPECIMENS = [
  {
    id: 'storm',
    name: 'storm',
    rule: 'B345/S1234',
    link: 'm=quill&n=700&r=12&b=417-917&s=83-750&i=q0&d=180',
    gens: 2000, kind: 'unsettled', period: -1, transient: -1,
    score: 0.8684, act: 0.1456, pop: 0.2957,
    blurb: 'The best-scoring soup in the sweep. Two thousand generations and it has never repeated a state — about 15% of the mesh flips every tick, on a population that sits stubbornly near 30%. Fronts form, collide, and reorganise without ever settling. Ran to 5000 generations by hand: still going.',
  },
  {
    id: 'drift',
    name: 'drift',
    rule: 'B345/S234',
    link: 'm=quill&n=700&r=12&b=417-917&s=250-750&i=q1&d=180',
    gens: 2000, kind: 'unsettled', period: -1, transient: -1,
    score: 0.7028, act: 0.1401, pop: 0.2537,
    blurb: 'The same mesh as storm with the survival floor raised one notch — from 1/6 of your neighbours to 2/6. Lonely cells now die, so the texture is coarser and slower, but it is just as unrepeating. The rule change is a single per-mille field in the URL.',
  },
  {
    id: 'slow-burn',
    name: 'slow burn',
    rule: 'B34/S123',
    link: 'm=quill&n=700&r=12&b=417-750&s=83-583&i=q6&d=280',
    gens: 1400, kind: 'oscillator', period: 2, transient: 1257,
    score: 0.1930, act: 0.0982, pop: 0.1990,
    blurb: 'The pack\'s r-pentomino. Twelve hundred and fifty-seven generations of genuine activity — and then, abruptly, everything left standing is blinking with period 2. The interesting part of this specimen is entirely the transient; watch the population plot bleed downhill and guess when it will stop.',
  },
  {
    id: 'long-fall',
    name: 'long fall',
    rule: 'B345/S123',
    link: 'm=tessera&n=700&r=12&b=417-917&s=83-583&i=t1&d=380',
    gens: 1000, kind: 'oscillator', period: 6, transient: 921,
    score: 0.0747, act: 0.0462, pop: 0.1436,
    blurb: 'Nine hundred and twenty-one generations of decay on a different mesh, ending in a period-6 rather than a period-2 residue. Scores badly — the emergence measure marks it down for thinning out — and is worth keeping anyway, because it is the clearest picture on the page of a system running out of fuel.',
  },
  {
    id: 'carousel',
    name: 'carousel',
    rule: 'B345/S345',
    link: 'm=orchid&n=700&r=12&b=417-917&s=417-917&i=o0&d=280',
    gens: 400, kind: 'long cycle', period: 24, transient: 277,
    score: 0.6626, act: 0.1300, pop: 0.3534,
    blurb: 'A high-scoring trajectory that does settle — but into a period-24 attractor spanning the whole torus, reached only after 277 generations of looking chaotic. Set the speed high, wait for generation 277, then watch the same twenty-four frames turn over forever.',
  },
  {
    id: 'loom',
    name: 'loom',
    rule: 'B45/S01234',
    link: 'm=tessera&n=700&r=12&b=583-917&s=0-750&i=t4&d=620',
    gens: 350, kind: 'long cycle', period: 210, transient: 75,
    score: 0.2289, act: 0.0656, pop: 0.3855,
    blurb: 'Period 210 — the longest cycle the sweep turned up, and the one place on this page where a big number has a small explanation. Inside the attractor, 640 of the 700 cells never move at all. The other 60 carry individual periods of 2, 3, 5, 6 and 14, sitting in separate corners of the torus and ignoring each other; the whole configuration only realigns when all of them do, and lcm(2,3,5,6,14) = 210. The selftest checks that decomposition rather than trusting the sentence.',
    decomposition: { 1: 640, 2: 26, 3: 19, 5: 5, 6: 5, 14: 5 },
  },
];

export default SPECIMENS;
