// mappa/civ/engine.js — the coevolutionary civilization simulation core.
//
// One unchanging agent substrate and one tick loop run the whole arc — nucleation →
// forager expansion → agriculture → settlement → states → industry — on a real mappa
// world. Individuals turn over by birth and death; lineages, cultures, institutions
// carry unbroken identity. NOTHING about eras is scripted: agriculture and industry
// are emergent capability-driven phase transitions. The core is pure functions over
// struct-of-arrays typed arrays (GC-flat, cache-friendly, WASM-portable). Every
// interaction is bucketed by cell or mediated by a stigmergic field — no O(n²), ever.
// It emits a chronicle (keyframes + events); it draws nothing.

import { stream, irnd, softmaxPick } from './prng.js';
import {
  NCAP, CAP, CAPS, bit, has, candidates, PREREQ, TIER, vecTier, popcount,
  PKG, NPKG, PKG_ID, subMult, pkgUnlocked,
} from './caps.js';
import { loadCivWorld, cellK } from './world.js';
import { normalizeConfig, NORM_I } from './config.js';
import { makeClimate } from './climate.js';

const ALIVE = 1;
const AGRI_PKGS = new Set([PKG_ID.horticulture, PKG_ID.plough, PKG_ID.irrigation]);
// per-tier innovation difficulty: each rung up the ladder is a harder invention, so
// tier-4/5 (mechanisation → industry) is ~20× slower than tier-1 (the neolithic).
const TIER_DIFFICULTY = [1, 0.6, 0.28, 0.12, 0.05, 0.02];

// growable struct-of-arrays for agents. Slots are recycled through a free list on
// death (deferred one tick so a within-tick birth never aliases a slot still named in
// the current cell buckets), so live storage tracks the PEAK LIVING population, not
// cumulative births. Parent pointers are valid at birth (both parents alive then) —
// enough for gene-flow accounting; individual coalescent walks are out of scope here,
// where phylogeny lives at the culture/language layer.
function makeAgents(cap) {
  const A = {
    cap, n: 0,
    birthTick: new Int32Array(cap), deathTick: new Int32Array(cap),
    cell: new Int32Array(cap), parentA: new Int32Array(cap), parentB: new Int32Array(cap),
    culture: new Uint32Array(cap), org: new Int32Array(cap),
    sex: new Uint8Array(cap), flags: new Uint8Array(cap),
    wealth: new Float32Array(cap), health: new Float32Array(cap), status: new Float32Array(cap),
  };
  return A;
}
function growAgents(A) {
  const cap = A.cap * 2;
  for (const k of ['birthTick', 'deathTick', 'cell', 'parentA', 'parentB', 'culture', 'org', 'sex', 'flags', 'wealth', 'health', 'status']) {
    const old = A[k], next = new old.constructor(cap); next.set(old); A[k] = next;
  }
  A.cap = cap;
}

export function createSim(worldInput, cfgInput, civSeed = 1) {
  const w = worldInput.nbrOff ? worldInput : loadCivWorld(worldInput); // accept raw or adapted
  const cfg = normalizeConfig(cfgInput);
  const N = w.N;
  const seed = (civSeed >>> 0);

  // orthogonal named RNG streams — subsystems never share draws.
  const R = {
    demo: stream(seed, 'demography'), disp: stream(seed, 'dispersal'),
    enc: stream(seed, 'encounter'), innov: stream(seed, 'innovation'),
    split: stream(seed, 'culture-split'), org: stream(seed, 'institution'),
    seed: stream(seed, 'seeding'), misc: stream(seed, 'misc'),
  };

  const climate = makeClimate(cfg.climate, w);

  // age thresholds in ticks (from real-year lifecycle / tickYears)
  const ty = cfg.agent.tickYears;
  const adultT = Math.max(1, Math.round(15 / ty));
  const fertileMaxT = Math.max(adultT + 1, Math.round(45 / ty));
  const maxAgeT = Math.max(fertileMaxT + 1, Math.round(72 / ty));
  const disperseWindow = Math.max(1, fertileMaxT - adultT);
  const popScale = cfg.popScale;
  const industrialMinPop = cfg.industrialMinPop ?? 5000;

  // ---- cultures + languages (carry identity across individual turnover) ----------
  const cultures = [];   // {id, sub, tech, norms(Float32Array), lang, parentLang, parentCulture, birthTick, origin, landmass, extinct, mutationRate, innovationBase, splitThreshold, agriDone, industryDone}
  const languages = [];  // {id, parent, birthTick}
  function newLanguage(parent, tick) { const id = languages.length; languages.push({ id, parent: parent == null ? -1 : parent, birthTick: tick }); return id; }
  function newCulture(proto, tick) {
    const id = cultures.length;
    const c = {
      id, sub: proto.sub, tech: proto.tech >>> 0, norms: Float32Array.from(proto.norms),
      lang: proto.lang, parentLang: proto.parentLang ?? -1, parentCulture: proto.parentCulture ?? -1,
      birthTick: tick, origin: proto.origin, landmass: proto.landmass,
      extinct: false, mutationRate: proto.mutationRate, innovationBase: proto.innovationBase,
      splitThreshold: proto.splitThreshold, agriDone: AGRI_PKGS.has(proto.sub), industryDone: false,
    };
    cultures.push(c); return c;
  }

  // ---- institutions (programmable aggregates; act once per org, never per member) -
  const orgs = []; // {id, type, seat, culture, birthTick, members, pool}

  // ---- stigmergy fields (the O(n) coordination substrate) ------------------------
  const memeField = new Float32Array(N * NCAP); // per-cell accumulated tech trace
  const activityField = new Float32Array(N);    // roads/markets/connectivity accumulator

  const A = makeAgents(4096);
  let live = new Int32Array(1024); let liveN = 0;
  let liveAlt = new Int32Array(1024);   // double-buffer: swap live/liveAlt each tick (no per-tick GC)
  const pushLive = id => { if (liveN >= live.length) { const n = new Int32Array(live.length * 2); n.set(live); live = n; } live[liveN++] = id; };
  const POP_CAP = 260000;               // runaway-population guard (raise death when exceeded)

  // agent allocation via a free list; deaths are freed at end of tick (deferred so a
  // this-tick birth can't reuse a slot still referenced by the current cell buckets).
  const freeStack = []; const deadPending = [];
  function alloc(o) {
    let i;
    if (freeStack.length) i = freeStack.pop();
    else { if (A.n >= A.cap) growAgents(A); i = A.n++; }
    A.birthTick[i] = o.birthTick; A.deathTick[i] = -1; A.cell[i] = o.cell;
    A.parentA[i] = o.parentA; A.parentB[i] = o.parentB; A.culture[i] = o.culture; A.org[i] = -1;
    A.sex[i] = o.sex; A.flags[i] = ALIVE; A.wealth[i] = o.wealth; A.health[i] = o.health; A.status[i] = o.status;
    return i;
  }
  function kill(i) { A.flags[i] &= ~ALIVE; A.deathTick[i] = tick; deadPending.push(i); }

  // ---- chronicle -----------------------------------------------------------------
  const chronicle = { keyframes: [], events: [], series: { tick: [], pop: [], cultures: [], maxTier: [], dispersers: [], admixture: [], displace: [], convert: [], states: [] }, meta: {} };
  const pushEvent = (tick, type, extra) => { if (chronicle.events.length < 20000) chronicle.events.push({ t: tick, type, ...extra }); };
  // origin bookkeeping: independent origins (first per landmass) vs adopters (spread).
  const firstCap = new Set(), agriLandmass = new Set(), indLandmass = new Set();
  let agriAdopters = 0, indAdopters = 0, lastPulseTick = -100, lastAdmixTick = -100;

  // ---- nucleation seeding --------------------------------------------------------
  function pickNuclei(count) {
    if (cfg.seeding.nucleus && cfg.seeding.nucleus.length) return cfg.seeding.nucleus.slice(0, count);
    // greedy: most-habitable land cells, spatially separated (≥ ~angular gap)
    const landCells = [];
    for (let i = 0; i < N; i++) if (w.land[i] && w.hab[i] > 0.15) landCells.push(i);
    landCells.sort((a, b) => w.hab[b] - w.hab[a]);
    const picked = [];
    for (const i of landCells) {
      let ok = true;
      for (const p of picked) { const d = w.V[i][0] * w.V[p][0] + w.V[i][1] * w.V[p][1] + w.V[i][2] * w.V[p][2]; if (d > 0.55) { ok = false; break; } }
      if (ok) picked.push(i);
      if (picked.length >= count) break;
    }
    if (!picked.length && landCells.length) picked.push(landCells[0]);
    return picked;
  }
  function seedFounders() {
    const nuclei = pickNuclei(Math.max(1, cfg.seeding.nucleusCount));
    const seedTechVec = (cfg.culture.seedTech || []).reduce((v, name) => (CAP[name] != null ? v | bit(CAP[name]) : v), 0) >>> 0;
    const per = Math.max(2, Math.floor(cfg.seeding.founders / nuclei.length));
    nuclei.forEach((cell, k) => {
      const lang = newLanguage(null, 0);
      const cult = newCulture({
        sub: cfg.culture.subsistence, tech: seedTechVec, norms: cfg.culture.normWeights,
        lang, parentLang: -1, parentCulture: -1, origin: cell, landmass: w.landmass[cell],
        mutationRate: cfg.culture.mutationRate, innovationBase: cfg.culture.innovationBase, splitThreshold: cfg.culture.splitThreshold,
      }, 0);
      for (let f = 0; f < per; f++) {
        const id = alloc({
          birthTick: -irnd(R.seed, adultT + 2), cell, parentA: -1, parentB: -1, culture: cult.id,
          sex: f & 1, wealth: 0.3, health: 0.9, status: 0.3,
        });
        pushLive(id);
      }
      pushEvent(0, 'founding', { cell, culture: cult.id, landmass: w.landmass[cell], pop: per });
    });
  }
  seedFounders();

  // ---- per-tick scratch ----------------------------------------------------------
  const cellStart = new Int32Array(N + 1), cellPop = new Int32Array(N);
  let cellOrder = new Int32Array(A.cap);
  const cellDom = new Int32Array(N);      // dominant culture id per cell (-1 empty)
  const cellDomPop = new Int32Array(N);
  const cultMembers = [];                 // per-culture member count (index=culture id)
  const cultTerritory = [];               // per-culture list of owned (dominant) cells
  let cultBestPop = new Int32Array(64), cultBestCell = new Int32Array(64); // largest city per culture
  const fmales = new Int32Array(4096);    // reusable fertile-male scratch per cell
  let cultScratch = new Int32Array(64);   // reusable per-cell culture-count tally (no GC)

  function kEff(cell, pkg) {
    return cellK(w, cell, pkg, popScale) * climate.Kmod[cell] * climate.subMod[cell * NPKG + pkg];
  }

  function bucket() {
    cellPop.fill(0);
    for (let t = 0; t < liveN; t++) cellPop[A.cell[live[t]]]++;
    let acc = 0; for (let i = 0; i < N; i++) { cellStart[i] = acc; acc += cellPop[i]; } cellStart[N] = acc;
    if (cellOrder.length < liveN) cellOrder = new Int32Array(Math.max(liveN, cellOrder.length * 2));
    const cur = cellStart.slice(0, N);
    for (let t = 0; t < liveN; t++) { const id = live[t], c = A.cell[id]; cellOrder[cur[c]++] = id; }
  }

  // dominant culture per occupied cell — plurality via a reusable scratch tally (no
  // per-cell allocation), and the per-cell stigmergy deposit folded in (O(cells), not
  // O(agents)): the dominant culture imprints its tech into the cell's meme field.
  function computeCellCultures() {
    cellDom.fill(-1); cellDomPop.fill(0);
    if (cultScratch.length < cultures.length) cultScratch = new Int32Array(cultures.length * 2);
    for (let c = 0; c < N; c++) {
      const s = cellStart[c], e = cellStart[c + 1]; if (e === s) continue;
      let dom = -1, domN = 0;
      for (let t = s; t < e; t++) { const cu = A.culture[cellOrder[t]]; const n = ++cultScratch[cu]; if (n > domN || (n === domN && cu < dom)) { dom = cu; domN = n; } }
      for (let t = s; t < e; t++) cultScratch[A.culture[cellOrder[t]]] = 0; // reset touched
      cellDom[c] = dom; cellDomPop[c] = domN;
      // deposit: dominant culture's tech trace scaled by population (the many, cheaply)
      const tv = cultures[dom].tech, base = c * NCAP, w0 = Math.min(0.5, (e - s) * 0.003);
      for (let b = 0; b < NCAP; b++) if (tv & bit(b)) memeField[base + b] += w0;
      activityField[c] += Math.min(0.3, (e - s) * 0.0015);
    }
  }

  // ---- the tick ------------------------------------------------------------------
  let tick = 0, totalTicks = 0, captureEvery = 0;
  const dispSrc = []; const dispTgt = []; // dispersers recorded during demography

  // ---- particle-frame capture (for the browser playback viewer) ------------------
  // A compact per-cell snapshot per captured frame: occupied cells with their
  // population + dominant culture, plus a small dict of the cultures present at that
  // frame (so a selected particle can show "its deal"). Per-cell (not per-agent) keeps
  // it deterministic and scalable — the client scatters a particle swarm per cell.
  function worldSnapshot() {
    const lon = new Array(N), lat = new Array(N);
    for (let i = 0; i < N; i++) { const v = w.V[i]; lon[i] = +(Math.atan2(v[1], v[0]) * 180 / Math.PI).toFixed(2); lat[i] = +(Math.asin(Math.max(-1, Math.min(1, v[2]))) * 180 / Math.PI).toFixed(2); }
    return { N, lon, lat, water: Array.from(w.water), biome: Array.from(w.biome), landmass: Array.from(w.landmass) };
  }
  function captureFrame() {
    const cell = [], popc = [], cu = [], sub = [], tier = [], present = new Set();
    for (let c = 0; c < N; c++) { const d = cellDom[c]; if (d < 0 || cellPop[c] <= 0) continue; const C = cultures[d]; cell.push(c); popc.push(cellPop[c]); cu.push(d); sub.push(C.sub); tier.push(vecTier(C.tech)); present.add(d); }
    const cid = [], csub = [], ctier = [], ctech = [], clang = [], csize = [];
    for (const id of present) { const C = cultures[id]; cid.push(id); csub.push(C.sub); ctier.push(vecTier(C.tech)); ctech.push(C.tech >>> 0); clang.push(C.lang); csize.push(cultMembers[id] || 0); }
    chronicle.frames.push({ t: tick, pop: liveN, cell, popc, cu, sub, tier, cultures: { id: cid, sub: csub, tier: ctier, tech: ctech, lang: clang, size: csize } });
  }

  function step() {
    climate.step(tick, totalTicks);
    bucket();
    computeCellCultures();

    // recompute culture territory (partition by dominant cell) + reset member tallies
    for (let i = 0; i < cultures.length; i++) { cultMembers[i] = 0; cultTerritory[i] = null; }
    for (let c = 0; c < N; c++) { const d = cellDom[c]; if (d >= 0) { (cultTerritory[d] || (cultTerritory[d] = [])).push(c); } }

    // ---- demography (per cell: deaths, births, dispersal intents) -----------------
    dispSrc.length = 0; dispTgt.length = 0;
    encDisplace = 0; encConvert = 0; encIntermarry = 0;
    if (liveAlt.length < liveN + 8) liveAlt = new Int32Array(Math.max(liveN * 2, liveAlt.length * 2));
    let newLive = liveAlt, newLiveN = 0;
    const pushNL = id => { if (newLiveN >= newLive.length) { const n = new Int32Array(newLive.length * 2); n.set(newLive); newLive = n; } newLive[newLiveN++] = id; };
    const overCap = liveN > POP_CAP;
    let admixture = 0;

    for (let c = 0; c < N; c++) {
      const s = cellStart[c], e = cellStart[c + 1]; if (e === s) continue;
      const pop = cellPop[c];
      const domCu = cellDom[c] >= 0 ? cultures[cellDom[c]] : null;
      const pkg = domCu ? domCu.sub : PKG_ID.forager;
      const K = Math.max(1e-6, kEff(c, pkg));
      const ratio = pop / K;
      const pass = climate.passability[c];
      const collapsed = K < 0.5; // climate wiped the cell's viability → ejection

      // pass 1: resolve deaths, collect survivors + fertile males
      let nf = 0;
      for (let t = s; t < e; t++) {
        const id = cellOrder[t], age = tick - A.birthTick[id];
        let dr = cfg.agent.d0 + (ratio > 1 ? 0.06 * Math.pow(ratio - 1, 1.4) : 0);
        if (age > fertileMaxT) dr += 0.02 * (age - fertileMaxT);
        if (age > maxAgeT) dr += 0.5;
        if (collapsed) dr += 0.25;
        if (overCap) dr += 0.15; // runaway-population guard
        dr *= (1.15 - 0.3 * A.health[id]);
        if (R.demo() < dr) { kill(id); continue; }
        pushNL(id);
        if (A.sex[id] === 0 && age >= adultT && age <= fertileMaxT) { if (nf < fmales.length) fmales[nf++] = id; }
      }

      // pass 2: births (fertile females) + dispersal intents (young adults)
      const birthRate = cfg.agent.b0 * Math.max(0, 1 - ratio * 0.92) * pass;
      for (let t = s; t < e; t++) {
        const id = cellOrder[t]; if (!(A.flags[id] & ALIVE)) continue;
        const age = tick - A.birthTick[id];
        // working: accrue a little wealth/status by subsistence yield × institution boost
        if (age >= adultT) {
          const yield_ = 0.02 * (0.4 + subMult(pkg)) * Math.min(1.5, K / Math.max(1, pop));
          A.wealth[id] = Math.min(3, A.wealth[id] + yield_);
          A.status[id] = Math.min(3, A.status[id] * 0.99 + yield_ * 0.5);
        }
        if (A.sex[id] === 1 && age >= adultT && age <= fertileMaxT && nf > 0 && R.demo() < birthRate) {
          const dad = fmales[irnd(R.demo, nf)];
          const mCu = A.culture[id], fCu = A.culture[dad];
          if (mCu !== fCu) admixture++;
          const child = alloc({
            birthTick: tick, cell: c, parentA: id, parentB: dad, culture: mCu,
            sex: R.demo() < 0.5 ? 0 : 1,
            wealth: 0.1, health: Math.min(1, 0.7 + 0.2 * A.health[id]), status: 0.1 + 0.3 * A.status[id],
          });
          pushNL(child);
        }
        // dispersal intent: young adults, pushed by crowding or forced by collapse
        if (age >= adultT && age <= adultT + disperseWindow) {
          const mob = domCu ? domCu.norms[NORM_I.mobility] : 0.5;
          let pDisp = collapsed ? 0.9 : cfg.agent.dispersalGain * Math.max(0, ratio - 0.6) + 0.02 * mob;
          if (pDisp > 0 && R.disp() < Math.min(0.95, pDisp)) {
            const tgt = chooseTarget(c, A.culture[id]);
            if (tgt >= 0) { dispSrc.push(id); dispTgt.push(tgt); }
          }
        }
      }
    }

    // ---- apply dispersal + frontier encounter -------------------------------------
    let dispersers = 0;
    for (let k = 0; k < dispSrc.length; k++) {
      const id = dispSrc[k], from = A.cell[id], to = dispTgt[k];
      A.cell[id] = to; dispersers++;
      activityField[to] += 0.03; activityField[from] += 0.01; // laid trail (grown roads)
      // encounter: incomer meets the target cell's pre-move dominant culture
      const resCu = cellDom[to];
      if (resCu >= 0 && resCu !== A.culture[id]) encounter(id, to, resCu);
    }

    // compact out agents killed AFTER pass 1 (displace/convert-driven deaths during the
    // dispersal+encounter phase) so the live list never names a slot that's been freed.
    if (encDisplace) { let z = 0; for (let t = 0; t < newLiveN; t++) { const id = newLive[t]; if (A.flags[id] & ALIVE) newLive[z++] = id; } newLiveN = z; }

    // rebuild live list (swap buffers: old `live` becomes next tick's scratch)
    const oldLive = live; live = newLive; liveN = newLiveN; liveAlt = oldLive;

    // ---- culture dynamics: diffusion (per cell) + innovation (once per culture) ----
    // recompute member counts over the new live set + find each culture's largest city
    for (let i = 0; i < cultures.length; i++) cultMembers[i] = 0;
    for (let t = 0; t < liveN; t++) cultMembers[A.culture[live[t]]]++;
    if (cultBestPop.length < cultures.length) { cultBestPop = new Int32Array(cultures.length * 2); cultBestCell = new Int32Array(cultures.length * 2); }
    for (let i = 0; i < cultures.length; i++) { cultBestPop[i] = 0; cultBestCell[i] = -1; }
    // per-cell diffusion (local adoption from the field) + track largest city per culture
    for (let c = 0; c < N; c++) {
      const d = cellDom[c]; if (d < 0) continue;
      const cu = cultures[d]; if (cu.extinct) continue;
      if (cellPop[c] > cultBestPop[d]) { cultBestPop[d] = cellPop[c]; cultBestCell[d] = c; }
      diffuse(c, cu);
    }
    // per-culture: innovation (at the largest city — cities innovate), subsistence
    // upgrade, and a throttled split-check (its BFS is the structural cost).
    const doSplit = (tick & 7) === 0;
    for (let i = 0; i < cultures.length; i++) {
      const cu = cultures[i]; if (cu.extinct) continue;
      if (cultMembers[i] === 0) { cu.extinct = true; pushEvent(tick, 'extinction', { culture: i }); continue; }
      if (cultBestCell[i] >= 0) innovate(cu, cultBestCell[i]);
      subsistenceUpgrade(cu);
      if (doSplit) maybeSplit(cu);
    }

    // ---- institutions + stigmergy decay -------------------------------------------
    institutions();
    decayFields();

    // migration-pulse detection (throttled): a dispersal spike, ≥40 ticks since the last.
    if (liveN > 40 && dispersers > liveN * 0.10 && tick - lastPulseTick > 40) {
      lastPulseTick = tick;
      pushEvent(tick, 'migrationPulse', { dispersers, pop: liveN, climate: +climate.lastPulse.toFixed(2) });
    }
    // admixture spike: a strong front, throttled so the log records events not every tick.
    if (admixture > liveN * 0.06 && tick - lastAdmixTick > 30) {
      lastAdmixTick = tick;
      pushEvent(tick, 'admixtureSpike', { count: admixture, pop: liveN });
    }

    // ---- chronicle series + keyframes ---------------------------------------------
    recordSeries(dispersers, admixture);
    if (tick % cfg.keyframeEvery === 0 || tick === totalTicks - 1) keyframe();
    if (captureEvery && (tick % captureEvery === 0 || tick === totalTicks - 1)) captureFrame();

    // recycle this tick's dead slots (deferred so births above never aliased them)
    for (let k = 0; k < deadPending.length; k++) freeStack.push(deadPending[k]);
    deadPending.length = 0;

    tick++;
  }

  // ---- dispersal target: softmax over neighbours (the wave of advance) -----------
  const nbrScore = new Float32Array(64), nbrCell = new Int32Array(64);
  function chooseTarget(from, cultureId) {
    const cu = cultures[cultureId], pkg = cu.sub, sail = has(cu.tech, CAP.sail) || pkg === PKG_ID.maritime;
    let m = 0;
    // land neighbours
    for (let k = w.nbrOff[from]; k < w.nbrOff[from + 1] && m < 60; k++) {
      const j = w.nbrIdx[k];
      if (w.water[j] === 1) continue;         // ocean handled via seaLink below
      if (!w.land[j]) continue;               // lakes not habitable
      nbrCell[m] = j; nbrScore[m] = scoreCell(from, j, pkg); m++;
    }
    // sea hops (island hopping) for sail/maritime cultures
    if (sail) for (let k = w.seaOff[from]; k < w.seaOff[from + 1] && m < 62; k++) {
      const j = w.seaIdx[k]; nbrCell[m] = j; nbrScore[m] = scoreCell(from, j, pkg) + cu.norms[NORM_I.mobility] * 0.3; m++;
    }
    if (m === 0) return -1;
    const pick = softmaxPick(R.disp, nbrScore, m, 0.6);
    return nbrCell[pick];
  }
  function scoreCell(from, j, pkg) {
    const dens = cellPop[j] / Math.max(1e-6, kEff(j, pkg));
    const corridor = (w.river[j] ? 1 : 0) + (w.coast[j] ? 0.6 : 0) + Math.max(0, 0.3 - w.elev[j]); // valleys/coasts/passes
    const barrier = (1 - climate.passability[j]) * 1.5 + Math.max(0, w.elev[j] - 0.5) * 2.0;
    return cfg.agent.habWeight * w.hab[j]
      + cfg.agent.subWeight * w.subViab[j * NPKG + pkg] * climate.subMod[j * NPKG + pkg]
      - cfg.agent.densityWeight * Math.min(3, dens)
      + cfg.agent.corridorWeight * corridor
      - barrier;
  }

  // ---- frontier encounter: intermarry / displace / convert -----------------------
  // Counters accumulate per tick (the mechanic fires often); events are aggregated so
  // the log records the STRUCTURE of the front, not every skirmish.
  let encDisplace = 0, encConvert = 0, encIntermarry = 0;
  function encounter(incomerId, cell, resCultureId) {
    const inc = cultures[A.culture[incomerId]], res = cultures[resCultureId];
    const dTech = popcount(inc.tech) - popcount(res.tech);
    const dSub = subMult(inc.sub) - subMult(res.sub);
    const advantage = 0.5 * dTech + 1.2 * dSub; // incomer's edge
    const xeno = inc.norms[NORM_I.xenophobia], recep = res.norms[NORM_I.receptivity];
    // three weighted outcomes — the mix over a whole front reproduces the spectrum from
    // demic replacement (Yamnaya) to pure acculturation (the wave carries memes, not genes).
    const wInter = 1.0 * (1 - xeno) * (1 - Math.abs(dSub) * 0.3);
    const wDisplace = Math.max(0, 0.5 + advantage) * (0.4 + xeno);
    const wConvert = Math.max(0, 0.5 + advantage * 0.6) * (0.4 + recep);
    const sum = wInter + wDisplace + wConvert || 1;
    const r = R.enc() * sum;
    if (r < wInter) { encIntermarry++; return; } // gene flow via mixed-culture births
    const s = cellStart[cell], e = cellStart[cell + 1];
    if (r < wInter + wDisplace) {
      let hit = 0;
      for (let t = s; t < e && hit < 3; t++) { const rid = cellOrder[t]; if ((A.flags[rid] & ALIVE) && A.culture[rid] === resCultureId) { kill(rid); hit++; } }
      encDisplace += hit;
    } else {
      let hit = 0, toCu = A.culture[incomerId];
      for (let t = s; t < e && hit < 3; t++) { const rid = cellOrder[t]; if ((A.flags[rid] & ALIVE) && A.culture[rid] === resCultureId) { A.culture[rid] = toCu; hit++; } }
      encConvert += hit;
    }
  }

  // ---- innovation (originate) + diffusion (spread via field) ----------------------
  // innovation: ONCE per culture per tick, located at its largest city (cities
  // recombine ideas). Deliberately slow, and high tiers are gated behind real cities,
  // so the ladder is LATE THEN ACCELERATING — agriculture mid-arc, industry only in a
  // few big lineages. Running it per-culture (not per-cell) keeps the rate honest: a
  // wide culture doesn't innovate faster just for spanning more cells.
  function innovate(cu, cell) {
    const pop = cellPop[cell], act = activityField[cell];
    if (pop <= 8) return;
    const cands = candidates(cu.tech); if (!cands.length) return;
    // choose the frontier cap: weighted toward the lowest tier whose city gate is met.
    let bestW = -1, pickC = -1;
    for (const c of cands) {
      const gate = pop > (55 * (TIER[c] + 1) ** 2) ? 1 : 0.02; // a megacity, or near-impossible
      const wgt = gate / ((TIER[c] + 1) ** 3) * (0.5 + R.innov());
      if (wgt > bestW) { bestW = wgt; pickC = c; }
    }
    if (pickC < 0) return;
    // SCALE GATE: the industrial tier (mechanisation → steam → electricity) is a
    // civilizational achievement, not one lucky megacity. A culture must be a large,
    // urbanised society (total members ≥ industrialMinPop) before it can innovate it —
    // so a small 25k-agent world can't trip into the industrial age off a single valley.
    if (TIER[pickC] >= 4 && cultMembers[cu.id] < industrialMinPop) return;
    // accept with a rate that falls STEEPLY with tier — each rung is a harder invention,
    // so tier-4/5 (mechanisation → industry) takes an order of magnitude longer than
    // tier-1 (the neolithic package). This is what makes industry late and rare.
    const potential = Math.log2(1 + pop) * (0.15 + Math.min(2, act));
    const pInnov = cu.innovationBase * cu.norms[NORM_I.innovation] * potential * TIER_DIFFICULTY[TIER[pickC]];
    if (R.innov() >= Math.min(0.22, pInnov)) return;
    cu.tech |= bit(pickC); onTechUnlock(cell, cu, pickC, 'innovation');
  }
  // diffusion: adopt a cap strongly present in THIS cell's field (deposited by
  // neighbouring cultures + smoothed) if prereqs are met — receptivity-gated, slow.
  function diffuse(cell, cu) {
    const base = cell * NCAP, recep = cu.norms[NORM_I.receptivity];
    for (let b = 0; b < NCAP; b++) {
      if (has(cu.tech, b)) continue;
      if ((cu.tech & PREREQ[b]) !== PREREQ[b]) continue;
      const trace = memeField[base + b];
      if (trace > 1.2 && R.innov() < Math.min(0.3, trace * recep * 0.15)) { cu.tech |= bit(b); onTechUnlock(cell, cu, b, 'diffusion'); }
    }
  }
  function onTechUnlock(cell, cu, capIdx, how) {
    // emit a milestone only on the GLOBAL first appearance of a tier-2+ capability, and
    // tag whether it was an independent innovation or arrived by diffusion.
    if (TIER[capIdx] >= 2 && !firstCap.has(capIdx)) {
      firstCap.add(capIdx);
      pushEvent(tick, 'techUnlock', { culture: cu.id, cap: CAPS[capIdx], tier: TIER[capIdx], how, landmass: w.landmass[cell] });
    }
  }

  // ---- subsistence upgrade: switch package when a better one is unlocked+viable ---
  function subsistenceUpgrade(cu) {
    const terr = cultTerritory[cu.id]; if (!terr || !terr.length) return;
    // mean K over territory for current vs each unlocked package
    let curMean = 0; for (const c of terr) curMean += kEff(c, cu.sub); curMean /= terr.length;
    let bestPkg = cu.sub, bestMean = curMean * 1.05; // hysteresis: only switch if clearly better
    for (let p = 0; p < NPKG; p++) {
      if (p === cu.sub || !pkgUnlocked(cu.tech, p)) continue;
      let m = 0; for (const c of terr) m += kEff(c, p); m /= terr.length;
      if (m > bestMean) { bestMean = m; bestPkg = p; }
    }
    if (bestPkg !== cu.sub) {
      const wasAgri = cu.agriDone;
      cu.sub = bestPkg;
      if (!wasAgri && AGRI_PKGS.has(bestPkg)) {
        cu.agriDone = true;
        // an INDEPENDENT agricultural origin = the first farming on this landmass; later
        // adopters spread it (counted, not emitted, so the log records origins not spread).
        if (!agriLandmass.has(cu.landmass)) { agriLandmass.add(cu.landmass); pushEvent(tick, 'agriculture', { culture: cu.id, package: PKG[bestPkg].id, landmass: cu.landmass, tick }); }
        else agriAdopters++;
      }
    }
  }

  // ---- culture split → daughter culture + daughter language (phylogeny) -----------
  // A split needs a SUBSTANTIAL, spatially-separated daughter population (not the
  // territory flicker of mixing fronts), so language families branch meaningfully
  // rather than shattering into hundreds of ephemeral tongues.
  function maybeSplit(cu) {
    const terr = cultTerritory[cu.id]; if (!terr || terr.length < 12) return;
    const big = cultMembers[cu.id] > cu.splitThreshold;
    // find connected components of the territory over the mesh
    const owner = new Set(terr), seen = new Set(); const comps = [];
    for (const s of terr) {
      if (seen.has(s)) continue; const q = [s]; seen.add(s); const comp = [];
      for (let h = 0; h < q.length; h++) { const i = q[h]; comp.push(i); for (let k = w.nbrOff[i]; k < w.nbrOff[i + 1]; k++) { const j = w.nbrIdx[k]; if (owner.has(j) && !seen.has(j)) { seen.add(j); q.push(j); } } }
      comps.push(comp);
    }
    let doSplit = false;
    // a genuinely detached branch (≥8 cells) forks with moderate probability; a merely
    // oversized single body forks rarely (internal drift).
    if (comps.length >= 2) { comps.sort((a, b) => b.length - a.length); if (comps[1].length >= 8 && R.split() < 0.3) doSplit = true; }
    else if (big && R.split() < 0.02) doSplit = true;
    if (!doSplit) return;
    // fork the smaller component (or a random half if single-component oversize)
    let daughterCells;
    if (comps.length >= 2) daughterCells = new Set(comps[1]);
    else { daughterCells = new Set(); const half = Math.floor(terr.length / 2); for (let i = 0; i < half; i++) daughterCells.add(terr[i]); }
    const lang = newLanguage(cu.lang, tick);
    const daughter = newCulture({
      sub: cu.sub, tech: cu.tech, norms: cu.norms, lang, parentLang: cu.lang, parentCulture: cu.id,
      origin: [...daughterCells][0], landmass: cu.landmass,
      mutationRate: cu.mutationRate, innovationBase: cu.innovationBase, splitThreshold: cu.splitThreshold,
    }, tick);
    // drift the daughter's norms (variation)
    for (let i = 0; i < daughter.norms.length; i++) daughter.norms[i] = Math.max(0, Math.min(1, daughter.norms[i] + (R.split() - 0.5) * cu.mutationRate * 2));
    // reassign members whose cell is in the daughter territory
    let moved = 0;
    for (let t = 0; t < liveN; t++) { const id = live[t]; if (A.culture[id] === cu.id && daughterCells.has(A.cell[id])) { A.culture[id] = daughter.id; moved++; } }
    cultMembers[cu.id] -= moved; cultMembers[daughter.id] = moved;
    pushEvent(tick, 'cultureSplit', { parent: cu.id, child: daughter.id, lang, parentLang: cu.lang, cells: daughterCells.size });
  }

  // ---- institutions: household→band→chiefdom→state→firm (emergent) ---------------
  let stateMax = 0, lastCollapseTick = -100;
  const polity = new Int8Array(N); // 0 band, 1 chiefdom, 2 state-tier cell
  function institutions() {
    polity.fill(0);
    let chief = 0, stateCells = 0, firmCells = 0;
    for (let c = 0; c < N; c++) {
      const d = cellDom[c]; if (d < 0) continue; const cu = cultures[d]; const pop = cellPop[c];
      const surplus = AGRI_PKGS.has(cu.sub) && pop > kEff(c, cu.sub) * 0.5;
      if (surplus && pop > 40 && cu.norms[NORM_I.hierarchy] > 0.3) { polity[c] = 1; chief++; }
      if (polity[c] === 1 && has(cu.tech, CAP.writing) && pop > 120) { polity[c] = 2; stateCells++; }
      // firm / industrial takeoff: mechanised + steam + an urban city in a large culture
      if (has(cu.tech, CAP.mechanisation) && has(cu.tech, CAP.steamPower) && pop > 200 && cultMembers[d] >= industrialMinPop) {
        firmCells++;
        if (!cu.industryDone) {
          cu.industryDone = true;
          const lm = w.landmass[c];
          // INDEPENDENT industrial takeoff = first firms on this landmass (the jackpot).
          if (!indLandmass.has(lm)) { indLandmass.add(lm); pushEvent(tick, 'industry', { culture: cu.id, cell: c, landmass: lm, tick }); }
          else indAdopters++;
        }
      }
    }
    // count contiguous state components (distinct polities) for the diversity signal.
    // Events fire only on a NEW maximum (a genuinely more-fragmented world) or a real
    // collapse (a sharp drop from the running peak) — the series carries the rest.
    const stateComp = countStateComponents();
    if (stateComp > stateMax) { stateMax = stateComp; pushEvent(tick, 'stateFormation', { states: stateComp }); }
    else if (stateComp <= stateMax - 3 && tick - lastCollapseTick > 40) { lastCollapseTick = tick; pushEvent(tick, 'collapse', { from: stateMax, to: stateComp }); stateMax = stateComp; }
    lastInst = { chief, stateCells, firmCells, states: stateComp };
  }
  let lastInst = { chief: 0, stateCells: 0, firmCells: 0, states: 0 };
  function countStateComponents() {
    const seen = new Uint8Array(N); let comps = 0;
    for (let s = 0; s < N; s++) {
      if (seen[s] || polity[s] < 2) continue; comps++; const q = [s]; seen[s] = 1;
      for (let h = 0; h < q.length; h++) { const i = q[h]; for (let k = w.nbrOff[i]; k < w.nbrOff[i + 1]; k++) { const j = w.nbrIdx[k]; if (!seen[j] && polity[j] >= 2 && cellDom[j] === cellDom[i]) { seen[j] = 1; q.push(j); } } }
    }
    return comps;
  }

  // ---- stigmergy decay + neighbour smoothing (roads/memes/markets) ---------------
  const memeTmp = new Float32Array(N * NCAP);
  function decayFields() {
    const lambda = 0.06, spread = 0.12;
    // smooth memeField to neighbours (horizontal diffusion of ideas), then decay
    for (let c = 0; c < N; c++) {
      const deg = w.nbrOff[c + 1] - w.nbrOff[c] || 1, base = c * NCAP;
      for (let b = 0; b < NCAP; b++) {
        let s = 0; for (let k = w.nbrOff[c]; k < w.nbrOff[c + 1]; k++) s += memeField[w.nbrIdx[k] * NCAP + b];
        memeTmp[base + b] = (memeField[base + b] * (1 - spread) + spread * (s / deg)) * (1 - lambda);
      }
    }
    memeField.set(memeTmp);
    for (let c = 0; c < N; c++) activityField[c] *= (1 - lambda);
  }

  // ---- chronicle recording -------------------------------------------------------
  function recordSeries(dispersers, admixture) {
    let maxTier = 0, alive = 0;
    for (let i = 0; i < cultures.length; i++) if (!cultures[i].extinct && cultMembers[i] > 0) { alive++; const t = vecTier(cultures[i].tech); if (t > maxTier) maxTier = t; }
    chronicle.series.tick.push(tick); chronicle.series.pop.push(liveN);
    chronicle.series.cultures.push(alive); chronicle.series.maxTier.push(maxTier);
    chronicle.series.dispersers.push(dispersers); chronicle.series.admixture.push(admixture);
    chronicle.series.displace.push(encDisplace); chronicle.series.convert.push(encConvert);
    chronicle.series.states.push(lastInst.states);
  }
  function keyframe() {
    const sizes = [];
    for (let i = 0; i < cultures.length; i++) if (!cultures[i].extinct && cultMembers[i] > 0) sizes.push({ id: i, n: cultMembers[i], sub: PKG[cultures[i].sub].id, tier: vecTier(cultures[i].tech), lang: cultures[i].lang });
    sizes.sort((a, b) => b.n - a.n);
    // subsistence distribution
    const subDist = new Array(NPKG).fill(0);
    for (let i = 0; i < cultures.length; i++) if (!cultures[i].extinct) subDist[cultures[i].sub] += cultMembers[i];
    chronicle.keyframes.push({
      t: tick, pop: liveN, cultures: sizes.length, top: sizes.slice(0, 8),
      inst: { ...lastInst }, subDist, languages: languages.length,
      maxTier: sizes.reduce((m, s) => Math.max(m, s.tier), 0),
    });
  }

  // final-state summary the signals battery scores from (chronicle-only, sim-decoupled).
  function finalSummary() {
    const surviving = [];
    const popByLand = new Int32Array(w.nLandmass);
    const subDist = new Array(NPKG).fill(0);
    for (let i = 0; i < cultures.length; i++) {
      const cu = cultures[i], n = cultMembers[i] || 0; if (cu.extinct || n === 0) continue;
      surviving.push({ id: i, size: n, sub: cu.sub, tier: vecTier(cu.tech), tech: cu.tech >>> 0, lang: cu.lang, landmass: cu.landmass, origin: cu.origin });
      subDist[cu.sub] += n;
    }
    for (let t = 0; t < liveN; t++) popByLand[w.landmass[A.cell[live[t]]]] += 1;
    surviving.sort((a, b) => b.size - a.size);
    return {
      pop: liveN,
      cultures: surviving,
      languages: languages.map(l => ({ id: l.id, parent: l.parent, birthTick: l.birthTick })),
      subDist, popByLandmass: Array.from(popByLand),
      occupiedLandmasses: popByLand.reduce((a, v) => a + (v > 0 ? 1 : 0), 0),
      inst: { ...lastInst },
    };
  }

  return {
    w, cfg, climate, chronicle, cultures, languages, orgs,
    get tick() { return tick; }, get population() { return liveN; },
    run(nTicks, opts = {}) {
      totalTicks = nTicks;
      chronicle.meta = { civSeed: seed, ticks: nTicks, N, tickYears: ty, climate: (cfg.climate && cfg.climate.preset) || cfg.climate || 'stable' };
      // optional particle-frame capture for the playback viewer (opts.frames enables it;
      // opts.every sets the interval, default = the keyframe interval).
      if (opts.frames) {
        captureEvery = Math.max(1, opts.every || cfg.keyframeEvery);
        chronicle.frames = [];
        chronicle.world = worldSnapshot();
        chronicle.dict = { caps: CAPS.slice(), packages: PKG.map(p => p.id) };
      }
      for (let k = 0; k < nTicks; k++) step();
      chronicle.meta.peakAgentSlots = A.n; // ≈ peak concurrent living (free-list recycled)
      chronicle.meta.finalPop = liveN; chronicle.meta.finalCultures = cultures.filter((c, i) => !c.extinct && cultMembers[i] > 0).length;
      chronicle.meta.finalLanguages = languages.length;
      chronicle.meta.agriOrigins = agriLandmass.size; chronicle.meta.agriAdopters = agriAdopters;
      chronicle.meta.industrialOrigins = indLandmass.size; chronicle.meta.industrialAdopters = indAdopters;
      chronicle.meta.landmasses = w.nLandmass;
      chronicle.final = finalSummary();
      return chronicle;
    },
    step,
    _internal: { A, get live() { return live; }, get liveN() { return liveN; }, cultMembers, cellDom, cellPop, memeField, activityField, polity },
  };
}

// convenience one-shot
export function runSim(worldInput, cfg, civSeed, ticks) {
  return createSim(worldInput, cfg, civSeed).run(ticks);
}
