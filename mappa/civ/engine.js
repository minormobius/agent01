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
import { loadCivWorld, cellK, RES_METAL, RES_WEALTH, RESOURCES } from './world.js';
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
    cred: new Uint16Array(cap),   // credential bitset — the agent's résumé (skills/offices earned)
  };
  return A;
}
function growAgents(A) {
  const cap = A.cap * 2;
  for (const k of ['birthTick', 'deathTick', 'cell', 'parentA', 'parentB', 'culture', 'org', 'sex', 'flags', 'wealth', 'health', 'status', 'cred']) {
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
    war: stream(seed, 'war'), rep: stream(seed, 'reputation'), econ: stream(seed, 'economy'), seed: stream(seed, 'seeding'), misc: stream(seed, 'misc'),
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
      // polity lifecycle (a culture that reaches statehood is a dynasty with a rise/peak/fall)
      everState: false, firstStateTick: -1, peakPop: 0, peakTick: 0, peakTerritory: 0, fellTick: -1, peakTier: 0,
    };
    cultures.push(c); return c;
  }

  // ---- institutions: COMPOSITE ACTORS (the recursive up/down abstraction layer) ---
  // An institution is an agent whose body is a set of lower actors. Membership is two
  // pointers — agent.org points up to its most-specific institution, inst.parent points
  // up the chain (guild/firm/warband → band → state → [dynasty=culture]) — so the whole
  // hierarchy aggregates bottom-up in O(n). Institutions PERSIST as named entities while
  // their member agents flow through them (a firm outlives its workers). They hold a
  // treasury, run a ruleset, and act/interact once per tick (firms produce & compete,
  // warbands wage war over resources/territory, states tax & stabilise).
  // The persisted NAMED actors the user named — companies, guilds, armies — plus the
  // state (culture-keyed so its identity is stable as its capital moves). The household
  // (an unaffiliated agent, org=-1) is the base actor; agents flow through the rest.
  const INST = { GUILD: 0, FIRM: 1, WARBAND: 2, STATE: 3 };
  const INST_NAME = ['guild', 'firm', 'warband', 'state'];

  // ---- credentials: the agent RÉSUMÉ — claims an institution issues, an agent holds ----
  // Portable (carried on migration → skilled people seed crafts elsewhere) and heritable
  // (apprenticeship → skill lineages). A credential embodies a capability, so a credentialed
  // migrant deposits it into the destination's meme field (person-borne diffusion).
  const ERAN = ['forager', 'neolithic', 'bronze', 'classical', 'industrial', 'modern'];
  const CRED = ['farmer', 'herder', 'sailor', 'smith', 'scribe', 'mason', 'engineer', 'trader', 'soldier', 'officer', 'master', 'elder', 'citizen'];
  const CREDI = Object.fromEntries(CRED.map((c, i) => [c, i]));
  const NCRED = CRED.length;
  const cbit = i => (1 << i) >>> 0;
  const chas = (v, i) => (v & cbit(i)) !== 0;
  const popcount16 = v => { let c = 0; for (v &= 0xffff; v; v &= v - 1) c++; return c; };
  // credential → the capability it carries (for embodied diffusion). Others carry none.
  const CRED_CAP = new Int8Array(NCRED).fill(-1);
  CRED_CAP[CREDI.smith] = CAP.metallurgy; CRED_CAP[CREDI.scribe] = CAP.writing; CRED_CAP[CREDI.mason] = CAP.masonry;
  CRED_CAP[CREDI.sailor] = CAP.sail; CRED_CAP[CREDI.engineer] = CAP.mechanisation; CRED_CAP[CREDI.trader] = CAP.wheel;
  // a name for a notable individual (deterministic per agent id) — history gets names
  function personName(id) {
    const r = stream((seed ^ (id * 2246822519)) >>> 0, 'person');
    const on = 'ktrmnvbslpgdhwz', vo = 'aeiouaei', pick = s => s[Math.floor(r() * s.length)];
    let t = pick(on).toUpperCase() + pick(vo); for (let i = 0, n = 1 + Math.floor(r() * 2); i < n; i++) t += pick(on) + pick(vo);
    return t;
  }
  const insts = [];              // ALL institution entities ever created (id-indexed, for lookup)
  let liveInsts = [];            // just the currently-live ones (per-tick work is O(live), not O(ever))
  const orgs = insts;            // exposed alias
  const instAt = new Map();      // `type:seat:culture` → live inst id (localised actors)
  const stateInst = new Map();   // culture id → its state inst id (stable identity)
  const greatPeople = [];        // named individuals who led an institution to eminence — history's names
  const greatSeen = new Set();
  // FINANCIAL MARKETS: firms have an equity price (moves on fundamentals + a shared market
  // sentiment → booms/busts), raise capital by issuing equity when valuations are high, and
  // borrow from a pool of loanable funds where an interest rate clears. Produces a stock
  // index, interest rate, total debt, and per-firm price histories.
  const market = { index: 100, prevIndex: 100, sentiment: 0, rate: 0.05, savings: 0, borrowDemand: 0, totalDebt: 0, defaults: 0, boomTick: -999, crashTick: -999 };
  // evolvable institution RULESETS — new institutions inherit the ruleset of the most
  // successful institution of their type (imitation) with drift; the economy selects them.
  const bestRules = new Map();   // type → { rules, score } (the exemplar to imitate)
  const clamp01 = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
  function inheritRules(type) {
    const ex = bestRules.get(type), t = ex ? ex.rules : { tax: 0.15, wage: 0.5, merit: 0.5, invest: 0.4 };
    const d = () => (R.econ() - 0.5) * 0.12;
    return { tax: clamp01(t.tax + d(), 0, 0.6), wage: clamp01(t.wage + d(), 0.1, 0.9), merit: clamp01(t.merit + d()), invest: clamp01(t.invest + d(), 0, 0.9) };
  }
  const iKey = (type, seat, cu) => type + ':' + seat + ':' + cu;
  function instName(type, seat, cu) {
    const r = stream((seed ^ (seat * 2654435761) ^ (cu * 40503) ^ (type * 97)) >>> 0, 'inst-name');
    const on = 'ktrmnvbslpgdh', vo = 'aeiouoa', pick = s => s[Math.floor(r() * s.length)];
    let t = pick(on).toUpperCase() + pick(vo); for (let i = 0, n = 1 + Math.floor(r() * 2); i < n; i++) t += pick(on) + pick(vo);
    if (type === INST.STATE) return 'the ' + t + ' State';
    if (type === INST.FIRM) { const rc = w.resource && w.resource[seat]; const rn = rc ? RESOURCES[rc] : ''; return (rn ? rn[0].toUpperCase() + rn.slice(1) + ' ' : '') + t + ' Company'; }
    if (type === INST.GUILD) return 'the ' + t + ' Guild';
    if (type === INST.WARBAND) return t + "'s Host";
    return t;
  }
  function makeInst(type, seat, cu, parent, key) {
    const id = insts.length;
    const it = { id, type, culture: cu, seat, parent: parent ?? -1, birthTick: tick, dissolvedTick: -1, name: instName(type, seat, cu), memberCount: 0, pool: 0, strength: 0, peakMembers: 0, lastSeen: tick, wealth: 0, captures: 0, leader: -1, leaderRep: 0, reputation: 0,
      rules: inheritRules(type), capital: 0, output: 0, revenue: 0, wagePerMember: 0,
      equity: 100, debt: 0, prevOutput: 0, profit: 0, raised: 0 };
    insts.push(it); liveInsts.push(it); if (key != null) instAt.set(key, id);
    if (type === INST.FIRM || type === INST.STATE) pushEvent(tick, 'institutionFounded', { inst: id, kind: INST_NAME[type], name: it.name, culture: cu, seat });
    return it;
  }
  function ensureLocal(type, seat, cu, parent) { // guild/firm/warband, keyed by cell+culture
    const k = iKey(type, seat, cu); const id = instAt.get(k);
    if (id != null && insts[id].dissolvedTick < 0) { const it = insts[id]; it.lastSeen = tick; it.parent = parent; return it; }
    return makeInst(type, seat, cu, parent, k);
  }
  function ensureState(cu) { // one per dynasty, seat follows the capital
    const id = stateInst.get(cu); const seat = cultBestCell[cu];
    if (id != null && insts[id].dissolvedTick < 0) { const it = insts[id]; it.lastSeen = tick; if (seat >= 0) it.seat = seat; return it; }
    const it = makeInst(INST.STATE, seat >= 0 ? seat : cultures[cu].origin, cu, -1, null); stateInst.set(cu, it.id); return it;
  }

  // ---- stigmergy fields (the O(n) coordination substrate) ------------------------
  const memeField = new Float32Array(N * NCAP); // per-cell accumulated tech trace
  const activityField = new Float32Array(N);    // roads/markets/connectivity accumulator
  // MICROECONOMY: the wares price is itself a stigmergic trace — everyone reads/writes it,
  // it rises with local demand and falls with local supply, and smoothing to neighbours is
  // market integration. Firms earn revenue = output × local price.
  const warePrice = new Float32Array(N).fill(1);
  const wareSupply = new Float32Array(N);       // wares produced per cell this tick
  const priceTmp = new Float32Array(N);

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
    A.cred[i] = o.cred || 0;
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

  // ---- FRED: modular economic time-series capture --------------------------------
  // A lazily-built series registry — each series has metadata + a data array over the
  // sampled ticks. Adding a measure or a cross-tab here just makes a new series appear in
  // FRED; the chart engine never needs to know what any of them are.
  let fredEvery = 0; const fredWealthBuf = [];
  function fredPush(key, label, cat, unit, val) {
    let s = chronicle.fred.series[key];
    if (!s) { s = chronicle.fred.series[key] = { label, cat, unit, data: new Array(Math.max(0, chronicle.fred.t.length - 1)).fill(0) }; }
    s.data.push(val);
  }
  function fredStep() {
    const F = chronicle.fred; F.t.push(tick);
    // agent-side buckets (one pass): population + wealth by subsistence / era / landmass
    const subPop = new Float64Array(NPKG), eraPop = new Float64Array(6), subW = new Float64Array(NPKG), landPop = new Float64Array(w.nLandmass || 1);
    let totW = 0; fredWealthBuf.length = 0;
    for (let t = 0; t < liveN; t++) { const id = live[t], cu = cultures[A.culture[id]], wv = A.wealth[id]; subPop[cu.sub]++; eraPop[vecTier(cu.tech)]++; subW[cu.sub] += wv; landPop[w.landmass[A.cell[id]]]++; totW += wv; fredWealthBuf.push(wv); }
    fredWealthBuf.sort((a, b) => a - b); let cum = 0, g = 0; const n = fredWealthBuf.length;
    for (let i = 0; i < n; i++) { cum += fredWealthBuf[i]; g += (i + 1) / n - (totW > 0 ? cum / totW : 0); }
    const gini = n > 1 && totW > 0 ? +(2 * g / n).toFixed(3) : 0;
    // institution-side buckets
    let gdp = 0, capTot = 0, outFirm = 0, outGuild = 0, capFirm = 0, nF = 0, nS = 0, nG = 0, nW = 0;
    for (const it of liveInsts) { if (it.type === INST.FIRM) { gdp += it.output; outFirm += it.output; capFirm += it.capital; capTot += it.capital; nF++; } else if (it.type === INST.GUILD) { gdp += it.output; outGuild += it.output; capTot += it.capital; nG++; } else if (it.type === INST.STATE) nS++; else nW++; }
    let mp = 0, np = 0; for (let c = 0; c < N; c++) if (cellPop[c] > 0) { mp += warePrice[c]; np++; } const price = np ? +(mp / np).toFixed(3) : 1;
    // macro
    fredPush('pop', 'Population', 'Population', 'people', liveN);
    fredPush('gdp', 'Output (GDP)', 'Output', 'wares', +gdp.toFixed(1));
    fredPush('gdp_pc', 'Output per capita', 'Output', 'wares', +(gdp / Math.max(1, liveN)).toFixed(4));
    fredPush('wealth', 'Mean wealth', 'Distribution', 'index', +(totW / Math.max(1, liveN)).toFixed(3));
    fredPush('gini', 'Wealth inequality (Gini)', 'Distribution', '0..1', gini);
    fredPush('price', 'Wares price level', 'Prices', 'index', price);
    fredPush('rate', 'Interest rate', 'Money & markets', 'frac', +market.rate.toFixed(3));
    fredPush('stocks', 'Stock index', 'Money & markets', 'index=100', +market.index.toFixed(1));
    fredPush('debt', 'Total firm debt', 'Money & markets', 'wares', +market.totalDebt.toFixed(1));
    fredPush('debtgdp', 'Debt / GDP', 'Money & markets', 'ratio', +(market.totalDebt / Math.max(1, gdp)).toFixed(3));
    fredPush('capital', 'Total capital stock', 'Output', 'wares', +capTot.toFixed(1));
    fredPush('firms', 'Firms', 'Institutions', 'count', nF);
    fredPush('guilds', 'Guilds', 'Institutions', 'count', nG);
    fredPush('states', 'States', 'Institutions', 'count', nS);
    fredPush('warbands', 'Warbands', 'Institutions', 'count', nW);
    fredPush('maxtier', 'Peak era', 'Development', 'tier', Math.max(...eraPop.map((v, i) => v > 0 ? i : 0)));
    // cross-tabs (the facets)
    for (let p = 0; p < NPKG; p++) { fredPush('pop.sub.' + PKG[p].id, 'Pop — ' + PKG[p].id, 'Population × subsistence', 'people', subPop[p]); fredPush('wealth.sub.' + PKG[p].id, 'Wealth — ' + PKG[p].id, 'Wealth × subsistence', 'index', subPop[p] > 0 ? +(subW[p] / subPop[p]).toFixed(3) : 0); }
    for (let e = 0; e < 6; e++) fredPush('pop.era.' + ERAN[e], 'Pop — ' + ERAN[e], 'Population × era', 'people', eraPop[e]);
    for (let l = 0; l < Math.min(6, w.nLandmass); l++) fredPush('pop.land.' + l, 'Pop — landmass ' + l, 'Population × landmass', 'people', landPop[l]);
    fredPush('gdp.inst.firm', 'Output — firms', 'Output × institution', 'wares', +outFirm.toFixed(1));
    fredPush('gdp.inst.guild', 'Output — guilds', 'Output × institution', 'wares', +outGuild.toFixed(1));
    fredPush('capital.inst.firm', 'Capital — firms', 'Capital × institution', 'wares', +capFirm.toFixed(1));
    // firm equities (individual "stocks"; trimmed to the notable ones at finalize)
    for (const it of liveInsts) if (it.type === INST.FIRM && it.peakMembers > 50) fredPush('firm.' + it.id, it.name + ' — equity', 'Firm equities (stocks)', 'index=100', +it.equity.toFixed(1));
  }
  function fredFinalize() {
    const F = chronicle.fred, L = F.t.length;
    // pad every series to full length (dissolved firms → equity 0), trim firm equities to top
    const firmKeys = [];
    for (const k in F.series) { const s = F.series[k]; while (s.data.length < L) s.data.push(k.startsWith('firm.') ? 0 : (s.data.length ? s.data[s.data.length - 1] : 0)); if (k.startsWith('firm.')) firmKeys.push(k); }
    firmKeys.sort((a, b) => Math.max(...F.series[b].data) - Math.max(...F.series[a].data));
    for (let i = 20; i < firmKeys.length; i++) delete F.series[firmKeys[i]]; // keep the top 20 stocks
    F.categories = [...new Set(Object.values(F.series).map(s => s.cat))];
  }

  // ---- the tick ------------------------------------------------------------------
  let tick = 0, totalTicks = 0, captureEvery = 0;
  const dispSrc = []; const dispTgt = []; // dispersers recorded during demography
  const migAcc = new Map(); // (from*N+to) → count, accumulated between frame captures (frames mode only)

  // ---- particle-frame capture (for the browser playback viewer) ------------------
  // A compact per-cell snapshot per captured frame: occupied cells with their
  // population + dominant culture, plus a small dict of the cultures present at that
  // frame (so a selected particle can show "its deal"). Per-cell (not per-agent) keeps
  // it deterministic and scalable — the client scatters a particle swarm per cell.
  function worldSnapshot() {
    const lon = new Array(N), lat = new Array(N);
    for (let i = 0; i < N; i++) { const v = w.V[i]; lon[i] = +(Math.atan2(v[1], v[0]) * 180 / Math.PI).toFixed(2); lat[i] = +(Math.asin(Math.max(-1, Math.min(1, v[2]))) * 180 / Math.PI).toFixed(2); }
    // coastline: land cells that touch ocean — the viewer strokes these for continent outlines
    const coast = []; if (w.coast) for (let i = 0; i < N; i++) if (w.coast[i]) coast.push(i);
    return {
      N, lon, lat, water: Array.from(w.water), biome: Array.from(w.biome), landmass: Array.from(w.landmass), coast,
      // named resource nodes (static geology) — the map marks them, the sim contests them
      resources: (w.resourceNodes || []).map(nd => ({ cell: nd.cell, kind: nd.kind, name: nd.name })),
    };
  }
  function captureFrame() {
    const cell = [], popc = [], cu = [], sub = [], tier = [], pol = [], wlth = [], prc = [], present = new Set();
    for (let c = 0; c < N; c++) {
      const d = cellDom[c]; if (d < 0 || cellPop[c] <= 0) continue; const C = cultures[d];
      cell.push(c); popc.push(cellPop[c]); cu.push(d); sub.push(C.sub); tier.push(vecTier(C.tech)); pol.push(polity[c]);
      let wsum = 0; const s = cellStart[c], e = cellStart[c + 1]; for (let t = s; t < e; t++) wsum += A.wealth[cellOrder[t]];
      wlth.push(+(wsum / Math.max(1, e - s)).toFixed(2)); prc.push(+warePrice[c].toFixed(2));
      present.add(d);
    }
    const cid = [], csub = [], ctier = [], ctech = [], clang = [], csize = [];
    for (const id of present) { const C = cultures[id]; cid.push(id); csub.push(C.sub); ctier.push(vecTier(C.tech)); ctech.push(C.tech >>> 0); clang.push(C.lang); csize.push(cultMembers[id] || 0); }
    // the frame's NOTABLE PEOPLE — the highest-reputation living individuals, with their
    // résumé (credentials + standing), so the map can name and inspect them.
    const K = 24, topId = new Int32Array(K), topRep = new Float32Array(K); let nt = 0;
    for (let t = 0; t < liveN; t++) {
      const id = live[t], r = A.status[id]; if (nt < K) { topId[nt] = id; topRep[nt] = r; nt++; if (nt === K) { for (let a = 1; a < K; a++) { const vi = topId[a], vr = topRep[a]; let b = a - 1; while (b >= 0 && topRep[b] > vr) { topId[b + 1] = topId[b]; topRep[b + 1] = topRep[b]; b--; } topId[b + 1] = vi; topRep[b + 1] = vr; } } continue; }
      if (r > topRep[0]) { let b = 0; while (b < K - 1 && topRep[b + 1] < r) { topId[b] = topId[b + 1]; topRep[b] = topRep[b + 1]; b++; } topId[b] = id; topRep[b] = r; }
    }
    const people = [];
    for (let a = nt - 1; a >= 0; a--) { const id = topId[a]; people.push({ cell: A.cell[id], name: personName(id), cu: A.culture[id], rep: +A.status[id].toFixed(2), cred: A.cred[id], age: Math.round((tick - A.birthTick[id]) * ty) }); }
    // migration flows accumulated since the last capture → the strongest edges, as flat
    // [fromCell, toCell, count, …]. The viewer floats travellers along these between frames.
    const edges = [...migAcc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 100);
    const mig = []; for (const [mk, ct] of edges) mig.push((mk / N) | 0, mk % N, ct); // from, to, count
    migAcc.clear();
    chronicle.frames.push({ t: tick, pop: liveN, cell, popc, cu, sub, tier, pol, wlth, prc, people, mig, cultures: { id: cid, sub: csub, tier: ctier, tech: ctech, lang: clang, size: csize } });
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
        dr *= (1.15 - 0.3 * A.health[id] - Math.min(0.35, A.wealth[id] * 0.08)); // wealth buys survival — the rich weather famine
        if (dr < 0.002) dr = 0.002;
        if (R.demo() < dr) { kill(id); continue; }
        pushNL(id);
        if (A.sex[id] === 0 && age >= adultT && age <= fertileMaxT) { if (nf < fmales.length) fmales[nf++] = id; }
      }

      // pass 2: births (fertile females) + dispersal intents (young adults)
      const birthRate = cfg.agent.b0 * Math.max(0, 1 - ratio * 0.92) * pass;
      for (let t = s; t < e; t++) {
        const id = cellOrder[t]; if (!(A.flags[id] & ALIVE)) continue;
        const age = tick - A.birthTick[id];
        // working: accrue wealth + REPUTATION (status) by subsistence yield, credentials
        // held, and age; and earn the subsistence credential of one's living.
        if (age >= adultT) {
          const yield_ = 0.02 * (0.4 + subMult(pkg)) * Math.min(1.5, K / Math.max(1, pop));
          A.wealth[id] = Math.min(3, A.wealth[id] + yield_);
          const nc = popcount16(A.cred[id]);
          A.status[id] = Math.min(4, A.status[id] * 0.985 + yield_ * 0.5 + nc * 0.02);
          const scred = pkg === PKG_ID.pastoral ? CREDI.herder : pkg === PKG_ID.maritime ? CREDI.sailor : AGRI_PKGS.has(pkg) ? CREDI.farmer : -1;
          if (scred >= 0 && !chas(A.cred[id], scred) && R.rep() < 0.06) A.cred[id] |= cbit(scred);
          if (age > maxAgeT * 0.6 && A.status[id] > 1.6 && !chas(A.cred[id], CREDI.elder) && R.rep() < 0.05) A.cred[id] |= cbit(CREDI.elder);
        }
        if (A.sex[id] === 1 && age >= adultT && age <= fertileMaxT && nf > 0 && R.demo() < birthRate) {
          // SEXUAL SELECTION: father by a small reputation tournament (high-standing males
          // father more) → reputation lineages accumulate, so some agents matter. The base
          // draw stays on R.demo (keeping the demographic path identical); the tournament
          // candidates come from R.rep so adding selection never perturbs births/deaths.
          let dad = fmales[irnd(R.demo, nf)];
          for (let q = 0; q < 2; q++) { const cand = fmales[irnd(R.rep, nf)]; if (A.status[cand] > A.status[dad]) dad = cand; }
          const mCu = A.culture[id], fCu = A.culture[dad];
          if (mCu !== fCu) admixture++;
          // apprenticeship: the child inherits each parental credential with a chance, and
          // its parents' mean standing — skill + reputation run in families.
          let icred = 0; const pc = (A.cred[id] | A.cred[dad]) & 0xffff;
          for (let b = 0; b < NCRED; b++) if ((pc & cbit(b)) && R.rep() < 0.32) icred |= cbit(b);
          const child = alloc({
            birthTick: tick, cell: c, parentA: id, parentB: dad, culture: mCu,
            sex: R.demo() < 0.5 ? 0 : 1,
            wealth: 0.1, health: Math.min(1, 0.7 + 0.2 * A.health[id]), status: 0.1 + 0.3 * (A.status[id] + A.status[dad]) * 0.5,
            cred: icred,
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
      if (captureEvery && to !== from) { const mk = from * N + to; migAcc.set(mk, (migAcc.get(mk) || 0) + 1); } // record the flow (playback viewer animates it)
      activityField[to] += 0.03; activityField[from] += 0.01; // laid trail (grown roads)
      // EMBODIED DIFFUSION: a credentialed migrant carries their craft — deposit the
      // capabilities their credentials embody into the destination's meme field, so skilled
      // people seed development where they settle (person-borne, complementing place-borne trace).
      const cr = A.cred[id];
      if (cr) { const base = to * NCAP; for (let b = 0; b < NCRED; b++) if ((cr & cbit(b)) && CRED_CAP[b] >= 0) memeField[base + CRED_CAP[b]] += 0.5; }
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
      if (cultMembers[i] === 0) { cu.extinct = true; if (cu.everState && cu.fellTick < 0) cu.fellTick = tick; pushEvent(tick, 'extinction', { culture: i }); continue; }
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
    if (fredEvery && (tick % fredEvery === 0 || tick === totalTicks - 1)) fredStep();

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
    // Named resources ACCELERATE the tech they feed: a city on a metal node innovates
    // metallurgy/machines faster; a wealth node (gold/salt) speeds it via trade/connectivity.
    const rc = w.resource ? w.resource[cell] : 0;
    const resAccel = RES_METAL.has(rc) ? 1.7 : RES_WEALTH.has(rc) ? 1.3 : 1;
    const potential = Math.log2(1 + pop) * (0.15 + Math.min(2, act)) * resAccel;
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
  const nNodes = w.resourceNodes ? w.resourceNodes.length : 0;
  const resourceControl = new Int32Array(nNodes).fill(-1); // culture id holding each named node
  const resCaptureTick = new Int32Array(nNodes).fill(-999); // cooldown so frontier flicker isn't "history"
  let cultStateCells = new Int32Array(64);
  function institutions() {
    polity.fill(0);
    if (cultStateCells.length < cultures.length) cultStateCells = new Int32Array(cultures.length * 2);
    else cultStateCells.fill(0, 0, cultures.length);
    let chief = 0, stateCells = 0, firmCells = 0;
    for (let c = 0; c < N; c++) {
      const d = cellDom[c]; if (d < 0) continue; const cu = cultures[d]; const pop = cellPop[c];
      const surplus = AGRI_PKGS.has(cu.sub) && pop > kEff(c, cu.sub) * 0.5;
      if (surplus && pop > 40 && cu.norms[NORM_I.hierarchy] > 0.3) { polity[c] = 1; chief++; }
      if (polity[c] === 1 && has(cu.tech, CAP.writing) && pop > 120) { polity[c] = 2; stateCells++; cultStateCells[d]++; }
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
    // ---- polity lifecycle: a culture that reaches statehood is a DYNASTY with a
    // rise, a peak, and a fall — the spine of the political history ------------------
    for (let i = 0; i < cultures.length; i++) {
      const cu = cultures[i]; if (cu.extinct) continue;
      const size = cultMembers[i] || 0; const terr = cultTerritory[i] ? cultTerritory[i].length : 0;
      const t = vecTier(cu.tech); if (t > cu.peakTier) cu.peakTier = t;
      if (terr > cu.peakTerritory) cu.peakTerritory = terr;
      if (cultStateCells[i] > 0 && !cu.everState) { cu.everState = true; cu.firstStateTick = tick; pushEvent(tick, 'polityRise', { culture: i, seat: cultBestCell[i], landmass: cu.landmass, tick }); }
      if (size > cu.peakPop) { cu.peakPop = size; cu.peakTick = tick; }
      if (cu.everState && cu.fellTick < 0 && cu.peakPop > 400 && size < 0.25 * cu.peakPop) { cu.fellTick = tick; pushEvent(tick, 'polityFall', { culture: i, peak: cu.peakPop, at: tick }); }
    }
    // ---- named-resource control: who holds each node, and captures over time --------
    if (nNodes) for (let k = 0; k < nNodes; k++) {
      const nd = w.resourceNodes[k], holder = cellDom[nd.cell];
      if (holder === resourceControl[k]) continue;
      const prev = resourceControl[k]; resourceControl[k] = holder;
      // emit only genuine conquests: a real polity takes it from another, spaced in time,
      // so the log records history — not the flicker of a contested frontier cell.
      if (holder >= 0 && prev >= 0 && (cultMembers[holder] || 0) > 400 && tick - resCaptureTick[k] > 60) {
        resCaptureTick[k] = tick; pushEvent(tick, 'resourceCaptured', { node: k, name: nd.name, kind: nd.kind, from: prev, to: holder });
      }
    }
    // count contiguous state components (distinct polities) for the diversity signal.
    const stateComp = countStateComponents();
    if (stateComp > stateMax) { stateMax = stateComp; pushEvent(tick, 'stateFormation', { states: stateComp }); }
    else if (stateComp <= stateMax - 3 && tick - lastCollapseTick > 40) { lastCollapseTick = tick; pushEvent(tick, 'collapse', { from: stateMax, to: stateComp }); stateMax = stateComp; }
    // build the composite-actor layer (bands/guilds/firms/warbands/states) on top of it
    const iStats = buildInstitutions();
    lastInst = { chief, stateCells, firmCells, states: stateComp, ...iStats };
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

  // ---- the composite-actor layer: institutions self-assemble, aggregate, act, war --
  const BAND_MIN = 30;
  const hash01 = id => { let h = Math.imul((id ^ 0x9e3779b9) >>> 0, 2654435761); h ^= h >>> 15; return (h >>> 0) / 4294967296; };
  const isFrontier = (c, d) => { for (let k = w.nbrOff[c]; k < w.nbrOff[c + 1]; k++) { const j = w.nbrIdx[k]; const dj = cellDom[j]; if (dj >= 0 && dj !== d) return true; } return false; };
  const techBonus = tech => (has(tech, CAP.metallurgy) ? 0.35 : 0) + (has(tech, CAP.wheel) ? 0.2 : 0) + (has(tech, CAP.mechanisation) ? 0.7 : 0);
  const warCooldown = new Map(); // inst id → last-war tick (throttle events)
  // the most-successful ruleset of each institution type becomes the exemplar new ones
  // imitate; it decays slowly so a new champion's ruleset can take over across eras.
  function recordExemplar(it, score) {
    const ex = bestRules.get(it.type), cur = ex ? ex.score * 0.999 : 0;
    if (score >= cur) bestRules.set(it.type, { rules: { tax: it.rules.tax, wage: it.rules.wage, merit: it.rules.merit, invest: it.rules.invest }, score });
    else if (ex) ex.score = cur;
  }
  function buildInstitutions() {
    // reset live-institution accumulators (O(live), not O(ever-created))
    for (const it of liveInsts) { it.memberCount = 0; it.wealth = 0; it.strength = 0; it.leaderRep = 0; it.reputation = 0; it.output = 0; }
    wareSupply.fill(0);
    market.savings = 0; market.borrowDemand = 0; market.defaults = 0;
    // one state per dynasty (culture that reached statehood)
    for (let i = 0; i < cultures.length; i++) { const cu = cultures[i]; if (!cu.extinct && cu.everState) ensureState(i); }
    // per significant settlement: the specialised actors its capabilities unlock, then
    // assign every resident agent's org pointer to its most-specific institution (or the
    // household, org=-1 — the base actor).
    for (let c = 0; c < N; c++) {
      const d = cellDom[c]; if (d < 0) continue; const pop = cellPop[c]; if (pop < BAND_MIN) continue;
      const cu = cultures[d];
      const stateId = cu.everState ? (stateInst.get(d) ?? -1) : -1;
      const parent = stateId != null ? stateId : -1;
      const surplus = AGRI_PKGS.has(cu.sub) && pop > kEff(c, cu.sub) * 0.5;
      const guild = (surplus && pop > 90 && (has(cu.tech, CAP.writing) || has(cu.tech, CAP.masonry) || has(cu.tech, CAP.metallurgy))) ? ensureLocal(INST.GUILD, c, d, parent) : null;
      const firm = (has(cu.tech, CAP.mechanisation) && has(cu.tech, CAP.steamPower) && pop > 200 && cultMembers[d] >= industrialMinPop) ? ensureLocal(INST.FIRM, c, d, parent) : null;
      const warband = (isFrontier(c, d) && cu.norms[NORM_I.hierarchy] > 0.4 && pop > 70) ? ensureLocal(INST.WARBAND, c, d, parent) : null;
      // assign roles by a stable per-agent hash; households (org=-1) are everyone else.
      // Each role ISSUES its credential (the résumé accrues through participation), and the
      // highest-reputation member becomes the institution's leader (its elite / great person).
      const s = cellStart[c], e = cellStart[c + 1];
      const hasMetal = has(cu.tech, CAP.metallurgy), hasWrite = has(cu.tech, CAP.writing), hasMason = has(cu.tech, CAP.masonry), hasMech = has(cu.tech, CAP.mechanisation);
      // MERITOCRATIC RECRUITMENT: the good jobs (firm/guild) go to high-reputation,
      // credentialed agents to the degree the institution's `merit` ruleset says so; a
      // hereditary society (low merit) recruits at random. A meritocratic firm thus fields
      // higher-reputation members → higher output → it grows → its ruleset gets imitated.
      const merit = firm ? firm.rules.merit : guild ? guild.rules.merit : warband ? warband.rules.merit : 0.5;
      for (let t = s; t < e; t++) {
        const id = cellOrder[t]; if (!(A.flags[id] & ALIVE) || A.cell[id] !== c) continue;
        const eliteScore = clamp01(A.status[id] / 2.5 + popcount16(A.cred[id]) * 0.05);
        const roll = (1 - merit) * hash01(id) + merit * (1 - eliteScore); // meritocratic → high standing gets a low roll → an elite role
        let org = stateId; // default: a subject of the state (or -1, household)
        if (firm && roll < 0.40) org = firm.id;
        else if (guild && roll < 0.52) org = guild.id;
        else if (warband && roll < 0.66) org = warband.id;
        A.org[id] = org;
        if (org >= 0) {
          const it = insts[org];
          A.wealth[id] = Math.min(4, A.wealth[id] + it.wagePerMember); // last tick's wages
          it.memberCount++; it.wealth += A.wealth[id];
          const rep = A.status[id]; it.reputation += rep;
          if (rep > it.leaderRep) { it.leaderRep = rep; it.leader = id; }
          // issue credentials by role (rng-gated → earned over a tenure)
          if (R.rep() < 0.05) {
            if (it.type === INST.GUILD) { if (hasMetal && !chas(A.cred[id], CREDI.smith)) A.cred[id] |= cbit(CREDI.smith); else if (hasWrite && !chas(A.cred[id], CREDI.scribe)) A.cred[id] |= cbit(CREDI.scribe); else if (hasMason && !chas(A.cred[id], CREDI.mason)) A.cred[id] |= cbit(CREDI.mason); if (rep > 1.8) A.cred[id] |= cbit(CREDI.master); }
            else if (it.type === INST.FIRM) { if (hasMech) A.cred[id] |= cbit(CREDI.engineer); A.cred[id] |= cbit(CREDI.trader); }
            else if (it.type === INST.WARBAND) { A.cred[id] |= cbit(CREDI.soldier); if (it.captures > 0 && rep > 1.5) A.cred[id] |= cbit(CREDI.officer); }
            else if (it.type === INST.STATE && rep > 1.2) A.cred[id] |= cbit(CREDI.citizen);
          }
        }
      }
    }
    // roll specialised actors up into their state (members, wealth, reputation, and the
    // strongest leader becomes the state's), then each actor acts.
    for (const it of liveInsts) if (it.type !== INST.STATE && it.parent >= 0) { const p = insts[it.parent]; if (p && p.dissolvedTick < 0) { p.memberCount += it.memberCount; p.wealth += it.wealth; p.reputation += it.reputation; if (it.leaderRep > p.leaderRep) { p.leaderRep = it.leaderRep; p.leader = it.leader; } } }
    let firmCount = 0, guildCount = 0, warCount = 0, stateCount = 0;
    for (const it of liveInsts) {
      if (it.memberCount > it.peakMembers) it.peakMembers = it.memberCount;
      it.pool = it.pool * 0.98 + it.wealth * 0.03;                    // treasury tracks sustained wealth
      it.reputation = it.memberCount > 0 ? it.reputation / it.memberCount : 0; // → mean standing (its "brand")
      const cu = cultures[it.culture];
      if (it.type === INST.FIRM || it.type === INST.GUILD) {
        // PRODUCTION → REVENUE → WAGES + PROFIT → CAPITAL (the growth loop). Output rises
        // with member reputation (skill), accumulated capital, and mechanisation; revenue is
        // output × the local wares price. Wages (a ruleset knob) pay members; retained profit
        // (invest knob) becomes capital, which raises next tick's output.
        const skill = it.type === INST.FIRM ? 1 : 0.5;
        const mech = has(cu.tech, CAP.mechanisation) ? (has(cu.tech, CAP.steamPower) ? 3 : 1.8) : 1;
        it.output = it.memberCount * 0.05 * skill * (0.5 + it.reputation) * (1 + Math.min(4, it.capital * 0.4)) * mech;
        wareSupply[it.seat] += it.output;
        it.revenue = it.output * warePrice[it.seat];
        const wages = it.revenue * it.rules.wage;
        it.wagePerMember = it.memberCount > 0 ? Math.min(0.35, wages / it.memberCount) : 0;
        const profit = Math.max(0, it.revenue - wages); it.profit = profit;
        it.capital = Math.max(0, it.capital * 0.97 + profit * it.rules.invest * 0.02);
        it.pool = it.pool * 0.98 + profit * (1 - it.rules.invest) * 0.02;
        if (it.type === INST.FIRM) {
          firmCount++; activityField[it.seat] += 0.4;
          // STOCK: equity moves with earnings/output growth and the market's shared sentiment
          // (momentum → booms/busts). CAPITAL RAISING: a highly-valued firm issues equity to
          // fund investment; a firm short of retained profit BORROWS at the market rate.
          const prevOut = it.prevOutput;
          const growth = clamp01((it.output - prevOut) / (prevOut + 1), -0.3, 0.3);
          it.equity = Math.max(1, it.equity * (1 + 0.35 * growth + 0.5 * market.sentiment + (R.econ() - 0.5) * 0.02));
          it.prevOutput = it.output;
          it.raised = 0;
          if (it.equity > 130 && it.rules.invest > 0.35) { const raise = it.equity * 0.004 * it.rules.invest; it.capital += raise; it.raised = raise; } // issue shares in a bull market
          // LOANABLE-FUNDS DEMAND: the external financing a firm needs to hit its target
          // investment beyond what retained profit covers — the self-financing gap. Appetite is
          // procyclical (a boom emboldens borrowing); what's actually drawn is rate-elastic
          // (dear money deters it). Decisions use last tick's cleared rate, so the market is a
          // clean lagged clearing (no within-tick circularity).
          const need = Math.max(0, it.rules.invest * (it.revenue - profit));  // financing gap (flow)
          const appetite = need * (1 + Math.max(0, market.sentiment) * 3);    // procyclical
          const take = appetite * clamp01(1 - market.rate * 1.8, 0.15, 1);    // rate-elastic draw
          it.debt += take * 0.2; market.borrowDemand += appetite;            // book a modest slice; post full appetite to clearing
          it.debt = Math.max(0, it.debt * (1 - 0.02) - profit * 0.02);        // service/repay from profit
          it.pool -= it.debt * market.rate * 0.05;                            // interest cost (rate-sensitive)
          market.savings += Math.max(0, profit * (1 - it.rules.invest) * 0.02); // savings supplied (flow)
          // default: crushed by debt with collapsing output → the firm fails (a crisis seed)
          if (it.debt > it.capital * 4 + 20 && it.output < prevOut * 0.7) { market.defaults++; it.lastSeen = tick - 999; }
        } else { guildCount++; activityField[it.seat] += 0.2; market.savings += Math.max(0, profit * (1 - it.rules.invest) * 0.02); }
        recordExemplar(it, it.type === INST.FIRM ? it.capital * 8 + it.memberCount : it.memberCount);
      }
      else if (it.type === INST.WARBAND) { warCount++; it.strength = it.memberCount * (1 + techBonus(cu.tech)) * (1 + Math.min(1.5, it.pool * 0.02)) * (1 + Math.min(0.7, it.leaderRep * 0.18)); } // a great captain multiplies the host
      else { // STATE: tax member wealth into the treasury (a ruleset knob), fund stability
        stateCount++;
        const taxIn = it.wealth * it.rules.tax * 0.02;
        it.pool = it.pool * 0.99 + taxIn;
        market.savings += Math.max(0, taxIn) * 0.15;   // a slice of public funds lent into the credit market
        recordExemplar(it, it.memberCount);
      }
      // history's names: an eminent leader (very high reputation) is recorded once, with
      // their résumé, as a great person of their age.
      if (it.leader >= 0 && it.leaderRep > 2.4) {
        const gk = it.leader + '@' + A.birthTick[it.leader];
        if (!greatSeen.has(gk) && (A.flags[it.leader] & ALIVE)) {
          greatSeen.add(gk);
          if (greatPeople.length < 400) greatPeople.push({ name: personName(it.leader), culture: it.culture, rep: +it.leaderRep.toFixed(2), cred: A.cred[it.leader], role: INST_NAME[it.type], inst: it.name, tick });
        }
      }
    }
    // ---- market clearing: interest rate, stock index, sentiment, debt, crises --------
    // The loanable-funds market clears the rate from the balance of two per-tick FLOWS:
    // borrowing demand (procyclical firm financing needs) vs. savings supplied (retained
    // firm/guild profit + a slice of state treasuries). Signed excess demand sets a target
    // around a ~5% neutral rate; a savings glut (S≫D) drives it toward zero, a credit-hungry
    // boom (D≫S) toward the ceiling, and clustered defaults add a stress premium. The rate is
    // sticky (mean-reverting adjustment), the way real policy/market rates move.
    const D = market.borrowDemand, S = market.savings;
    const pressure = (D - S) / (D + S + 1e-3);                          // ∈ (−1, 1)
    const rateTarget = 0.05 * Math.exp(1.35 * pressure) + 0.04 * market.defaults;
    market.rate = clamp01(market.rate * 0.82 + rateTarget * 0.18, 0.006, 0.5);
    let eqSum = 0, eqW = 0, tdebt = 0;
    for (const it of liveInsts) if (it.type === INST.FIRM) { const w0 = it.capital + 1; eqSum += it.equity * w0; eqW += w0; tdebt += it.debt; }
    market.prevIndex = market.index;
    market.index = eqW > 0 ? eqSum / eqW : market.index;
    market.totalDebt = tdebt;
    const mom = market.prevIndex > 0 ? (market.index / market.prevIndex - 1) : 0;
    market.sentiment = clamp01(0.7 * mom + 0.3 * market.sentiment + (R.econ() - 0.5) * 0.01, -0.12, 0.12); // momentum → boom/bust
    if (mom > 0.06 && tick - market.boomTick > 60) { market.boomTick = tick; pushEvent(tick, 'marketBoom', { index: Math.round(market.index), rate: +market.rate.toFixed(3) }); }
    if ((mom < -0.06 || market.defaults >= 2) && tick - market.crashTick > 60 && eqW > 4) { market.crashTick = tick; pushEvent(tick, 'financialCrisis', { index: Math.round(market.index), defaults: market.defaults, debt: Math.round(tdebt) }); }

    // WAR: each warband may strike an adjacent rival cell once per tick — preferring the
    // named resources. Organised conflict over territory & ore, resolved by strength.
    for (const it of liveInsts) if (it.type === INST.WARBAND && it.strength >= 20) warOnce(it);
    // dissolve institutions only after a GRACE period without support (hysteresis, so a
    // real institution weathers a temporary dip instead of flickering in and out), then
    // compact the live list so per-tick work stays O(live).
    const GRACE = 24;
    let dissolved = false;
    for (const it of liveInsts) {
      if (tick - it.lastSeen <= GRACE) continue;
      it.dissolvedTick = tick; dissolved = true;
      if (it.type === INST.STATE) stateInst.delete(it.culture); else instAt.delete(iKey(it.type, it.seat, it.culture));
      if ((it.type === INST.FIRM || it.type === INST.STATE) && it.peakMembers > 150) pushEvent(tick, 'institutionFell', { inst: it.id, kind: INST_NAME[it.type], name: it.name, peak: it.peakMembers });
    }
    if (dissolved) liveInsts = liveInsts.filter(it => it.dissolvedTick < 0);
    // update the wares PRICE field: rises with demand (population), falls with supply
    // (output this tick); then smooth to neighbours — market integration along the mesh.
    for (let c = 0; c < N; c++) {
      const p = cellPop[c];
      if (p <= 0) { warePrice[c] = warePrice[c] * 0.98 + 0.02; continue; }
      const target = Math.max(0.2, Math.min(6, (p * 0.02 + 0.4) / (wareSupply[c] + 0.4)));
      warePrice[c] = warePrice[c] * 0.85 + 0.15 * target;
    }
    for (let c = 0; c < N; c++) { let s = warePrice[c], n = 1; for (let k = w.nbrOff[c]; k < w.nbrOff[c + 1]; k++) { s += warePrice[w.nbrIdx[k]]; n++; } priceTmp[c] = warePrice[c] * 0.8 + 0.2 * (s / n); }
    warePrice.set(priceTmp);
    return { firms: firmCount, guilds: guildCount, warbands: warCount, statesEnt: stateCount, insts: insts.length };
  }
  function warOnce(wb) {
    const c = wb.seat, d = wb.culture;
    // pick target: an adjacent rival-held cell, preferring resource nodes / weaker defenders
    let best = -1, bestScore = -1e9, bestRes = -1;
    for (let k = w.nbrOff[c]; k < w.nbrOff[c + 1]; k++) {
      const j = w.nbrIdx[k], e = cellDom[j]; if (e < 0 || e === d) continue;
      const defWb = instAt.get(iKey(INST.WARBAND, j, e)); const defStr = defWb != null && insts[defWb].dissolvedTick < 0 ? insts[defWb].strength : cellPop[j] * 0.45 * (1 + techBonus(cultures[e].tech));
      const res = w.resource ? w.resource[j] : 0; const score = (res ? 3 : 0) - defStr * 0.01 + (wb.strength - defStr) * 0.02;
      if (score > bestScore) { bestScore = score; best = j; bestRes = res; }
    }
    if (best < 0) return;
    const e = cellDom[best];
    const defWb = instAt.get(iKey(INST.WARBAND, best, e));
    const defStr = defWb != null && insts[defWb].dissolvedTick < 0 ? insts[defWb].strength : cellPop[best] * 0.45 * (1 + techBonus(cultures[e].tech));
    if (wb.strength > defStr * (0.85 + 0.4 * R.war())) {
      // conquest: annex the cell by converting/displacing a few of its residents to d
      const s = cellStart[best], en = cellStart[best + 1]; let hit = 0;
      for (let t = s; t < en && hit < 5; t++) { const rid = cellOrder[t]; if ((A.flags[rid] & ALIVE) && A.cell[rid] === best && A.culture[rid] === e) { if (R.war() < 0.5) A.culture[rid] = d; else kill(rid); hit++; } }
      wb.captures++; wb.pool *= 0.7; // spoils spent
      // record as history only the meaningful conquests — a named resource seized, or a
      // sampled land-grab — spaced per warband, so the log is annals not a kill-feed.
      if (hit && tick - (warCooldown.get(wb.id) || -999) > 80 && (bestRes || R.war() < 0.04)) {
        warCooldown.set(wb.id, tick);
        pushEvent(tick, 'war', { attacker: wb.name, attackerCulture: d, defenderCulture: e, cell: best, resource: bestRes ? RESOURCES[bestRes] : null, outcome: 'conquest' });
      }
    }
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
    for (let i = 0; i < cultures.length; i++) if (!cultures[i].extinct && cultMembers[i] > 0) { const cu = cultures[i]; sizes.push({ id: i, n: cultMembers[i], sub: cu.sub, tier: vecTier(cu.tech), lang: cu.lang, parent: cu.parentCulture, birth: cu.birthTick, state: cu.everState ? 1 : 0 }); }
    sizes.sort((a, b) => b.n - a.n);
    // subsistence distribution
    const subDist = new Array(NPKG).fill(0);
    for (let i = 0; i < cultures.length; i++) if (!cultures[i].extinct) subDist[cultures[i].sub] += cultMembers[i];
    chronicle.keyframes.push({
      t: tick, pop: liveN, cultures: sizes.length, top: sizes.slice(0, 24),
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
    // dynasties: every culture that ever reached statehood, with its rise/peak/fall.
    const polities = [];
    for (let i = 0; i < cultures.length; i++) {
      const cu = cultures[i]; if (!cu.everState) continue;
      polities.push({ id: i, lang: cu.lang, parent: cu.parentCulture, landmass: cu.landmass,
        rose: cu.firstStateTick, peakPop: cu.peakPop, peakTick: cu.peakTick, peakTerritory: cu.peakTerritory,
        peakTier: cu.peakTier, fell: cu.fellTick, alive: !cu.extinct && (cultMembers[i] || 0) > 0,
        size: cultMembers[i] || 0, sub: cu.sub, seat: cultBestCell[i] ?? cu.origin });
    }
    polities.sort((a, b) => b.peakPop - a.peakPop);
    // named resources + who currently holds each
    const resources = (w.resourceNodes || []).map((nd, k) => ({ cell: nd.cell, kind: nd.kind, name: nd.name, holder: resourceControl[k] }));
    // the NOTABLE composite actors across the whole run — companies, guilds, armies,
    // states — alive or since-dissolved (warbands are transient, so a fought-and-fell host
    // is history too). Ranked by significance; each carries its alive/fell status.
    const notability = it => it.type === INST.STATE ? it.peakMembers * 3 : it.type === INST.WARBAND ? it.captures * 40 + it.peakMembers : it.peakMembers;
    const institutions = insts
      .filter(it => it.type === INST.STATE ? it.peakMembers > 0 : it.type === INST.WARBAND ? it.captures >= 1 : it.peakMembers > 40)
      .sort((a, b) => notability(b) - notability(a))
      .slice(0, 140)
      .map(it => ({ id: it.id, kind: INST_NAME[it.type], name: it.name, culture: it.culture, parent: it.parent, seat: it.seat, members: it.memberCount, peak: it.peakMembers, pool: Math.round(it.pool), strength: Math.round(it.strength), captures: it.captures, reputation: +it.reputation.toFixed(2), leader: it.leader >= 0 ? personName(it.leader) : null, capital: +it.capital.toFixed(1), output: +it.output.toFixed(1), rules: { tax: +it.rules.tax.toFixed(2), wage: +it.rules.wage.toFixed(2), merit: +it.rules.merit.toFixed(2), invest: +it.rules.invest.toFixed(2) }, founded: it.birthTick, fell: it.dissolvedTick, alive: it.dissolvedTick < 0 }));
    // the economy: wealth inequality (Gini), mean wealth, mean price, total output
    let totW = 0, maxW = 0; const wl = new Float64Array(liveN);
    for (let t = 0; t < liveN; t++) { const wv = A.wealth[live[t]]; wl[t] = wv; totW += wv; if (wv > maxW) maxW = wv; }
    wl.sort(); let cum = 0, g = 0; for (let i = 0; i < liveN; i++) { cum += wl[i]; g += (i + 1) / liveN - (totW > 0 ? cum / totW : 0); }
    const gini = liveN > 1 && totW > 0 ? +(2 * g / liveN).toFixed(3) : 0;
    let mp = 0, np = 0, to = 0; for (let c = 0; c < N; c++) if (cellPop[c] > 0) { mp += warePrice[c]; np++; } for (const it of liveInsts) to += it.output;
    const economy = { gini, meanWealth: +(liveN ? totW / liveN : 0).toFixed(3), maxWealth: +maxW.toFixed(2), meanPrice: +(np ? mp / np : 1).toFixed(2), totalOutput: Math.round(to), exemplars: Object.fromEntries([...bestRules].map(([t, e]) => [INST_NAME[t], e.rules])),
      market: { stockIndex: +market.index.toFixed(1), interestRate: +market.rate.toFixed(3), totalDebt: +market.totalDebt.toFixed(1), debtToGdp: +(market.totalDebt / Math.max(1, to)).toFixed(3), sentiment: +market.sentiment.toFixed(4) } };
    // history's great persons, most eminent first
    const great = greatPeople.slice().sort((a, b) => b.rep - a.rep).slice(0, 120);
    return {
      pop: liveN,
      cultures: surviving, polities, resources, institutions, economy,
      greatPeople: great, credNames: CRED,
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
      // FRED economic time-series: always captured, sampled to ~100 points across the run.
      chronicle.fred = { t: [], tickYears: ty, series: {} };
      fredEvery = Math.max(1, Math.floor(nTicks / 100));
      // optional particle-frame capture for the playback viewer (opts.frames enables it;
      // opts.every sets the interval, default = the keyframe interval).
      if (opts.frames) {
        captureEvery = Math.max(1, opts.every || cfg.keyframeEvery);
        chronicle.frames = [];
        chronicle.world = worldSnapshot();
        chronicle.dict = { caps: CAPS.slice(), packages: PKG.map(p => p.id), creds: CRED.slice() };
      }
      for (let k = 0; k < nTicks; k++) step();
      chronicle.meta.peakAgentSlots = A.n; // ≈ peak concurrent living (free-list recycled)
      chronicle.meta.finalPop = liveN; chronicle.meta.finalCultures = cultures.filter((c, i) => !c.extinct && cultMembers[i] > 0).length;
      chronicle.meta.finalLanguages = languages.length;
      chronicle.meta.agriOrigins = agriLandmass.size; chronicle.meta.agriAdopters = agriAdopters;
      chronicle.meta.industrialOrigins = indLandmass.size; chronicle.meta.industrialAdopters = indAdopters;
      chronicle.meta.landmasses = w.nLandmass;
      fredFinalize();
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
