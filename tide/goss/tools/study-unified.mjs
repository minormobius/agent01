// study-unified.mjs — the SEVEN WEBS → ONE WEB study. Node-only, deterministic, zero deps.
//
// Three questions, answered with numbers over the baked nave floors (data/nave-<seed>.json):
//
//   A. HEALTH — is the unified floor web healthier than seven sealed ward webs, by the /econ
//      civ oracle (scoreSociety: closure · thickness · weave · bridges · thirds · employ ·
//      resilience → vitality 0..100)? Per seed, sealed vs floor, with the signal breakdown
//      that says WHY.
//
//   B. RELATIONSHIPS — does unification make the drama substrate RICHER? Cross-ward tie share,
//      drama counts + mean heat + type spread, and how many dramas SPAN wards (impossible by
//      construction in sealed mode).
//
//   C. v101 COMPATIBILITY — hoop v101 streams the nave quest-gated (commons first, then ward
//      pairs continuant → rindwalker → drift, one per tick). Two sub-questions:
//        C1. Do the chunk SOLVES come out identical under v101's unlock order vs buildNave's
//            dir order? (Port inheritance flows from already-solved neighbours — order could
//            matter in principle.)
//        C2. If the unified society is re-rolled per stage as wards stream in (the game's
//            rebuildSocietySoon pattern), how much do EXISTING people's hats churn? (econ's
//            buildSociety consumes one serial rng stream over places in order, so appended
//            rooms preserve earlier people's identity draws — but workplace picks index into
//            a GROWN list, and nearest-parish can flip.)
//
//   node tide/goss/tools/study-unified.mjs            # full study, all baked seeds
//   node tide/goss/tools/study-unified.mjs 7 42       # subset of seeds
//
// Pure read-only analysis: writes nothing, changes nothing. The kernel under test is the very
// gossip.js the viewer ships.

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGossNave } from '../gossip.js';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, '..', 'data');
const args = process.argv.slice(2).map(Number).filter((n) => n > 0);
const SEEDS = args.length ? args : [1, 2, 3, 5, 7, 11, 42, 99];

const loadNave = (seed) => JSON.parse(readFileSync(join(dataDir, `nave-${seed}.json`), 'utf8'));
const pct = (x) => Math.round(x * 100);
const f2 = (x) => (Math.round(x * 100) / 100).toFixed(2);

// ── shared probes ─────────────────────────────────────────────────────────────────────────────
function crossWardTieShare(out) {
  const P = out.enriched.people;
  let w = 0, cw = 0;
  for (const t of out.web.ties) { w += t.w; if (P[t.a].ward !== P[t.b].ward) cw += t.w; }
  return w ? cw / w : 0;
}
function dramaStats(out) {
  const P = out.enriched.people;
  const types = {};
  let spanning = 0, heat = 0;
  for (const d of out.dramas) {
    types[d.type] = (types[d.type] || 0) + 1;
    heat += d.heat;
    const wards = new Set();
    for (const i of d.people || []) if (i >= 0 && P[i]) wards.add(P[i].ward);
    for (const t of d.tribes || []) for (const i of out.tribal.tribes[t].members) wards.add(P[i].ward);
    if (wards.size > 1) spanning++;
  }
  return { n: out.dramas.length, meanHeat: out.dramas.length ? heat / out.dramas.length : 0, types, spanning };
}

// ── A + B: sealed vs floor over every baked seed ──────────────────────────────────────────────
console.log('════ A/B · SEALED (seven webs) vs FLOOR (one web) — the /econ oracle + the drama substrate ════');
const rows = [];
for (const seed of SEEDS) {
  const nave = loadNave(seed);
  const S = buildGossNave(nave, { mode: 'sealed' });
  const F = buildGossNave(nave, { mode: 'floor' });
  const ds = dramaStats(S), df = dramaStats(F);
  rows.push({
    seed,
    sv: S.vital.vitality, st: S.vital.tier, fv: F.vital.vitality, ft: F.vital.tier,
    sclo: S.world.closure, fclo: F.world.closure,
    ssig: S.vital.signals, fsig: F.vital.signals,
    stribes: S.tribal.tribes.length, ftribes: F.tribal.tribes.length,
    salign: S.alignment ? S.alignment.overall : null, falign: F.alignment ? F.alignment.overall : null,
    scross: crossWardTieShare(S), fcross: crossWardTieShare(F),
    ds, df, people: F.enriched.people.length,
  });
}
console.log('seed | souls | vitality sealed→floor | closure  | cross-ward tie wt | tribes | faction↔tribe align | dramas (spanning) | mean heat');
for (const r of rows) {
  console.log(
    String(r.seed).padStart(4) + ' | ' + String(r.people).padStart(5) + ' | ' +
    `${String(r.sv).padStart(3)} ${r.st.padEnd(8)} → ${String(r.fv).padStart(3)} ${r.ft.padEnd(8)}` + ' | ' +
    `${pct(r.sclo)}→${pct(r.fclo)}%`.padEnd(8) + ' | ' +
    `${pct(r.scross)}% → ${pct(r.fcross)}%`.padEnd(17) + ' | ' +
    `${r.stribes}→${r.ftribes}`.padEnd(6) + ' | ' +
    `${r.salign == null ? '—' : pct(r.salign) + '%'} → ${r.falign == null ? '—' : pct(r.falign) + '%'}`.padEnd(19) + ' | ' +
    `${r.ds.n} (${r.ds.spanning}) → ${r.df.n} (${r.df.spanning})`.padEnd(17) + ' | ' +
    `${Math.round(r.ds.meanHeat)} → ${Math.round(r.df.meanHeat)}`);
}
// the WHY: mean signal deltas across seeds
const keys = ['closes', 'thick', 'weave', 'bridges', 'thirds', 'employ', 'resilient'];
const mean = (f) => rows.reduce((s, r) => s + f(r), 0) / rows.length;
console.log('\nmean oracle signals (sealed → floor):');
for (const k of keys) console.log(`  ${k.padEnd(10)} ${f2(mean((r) => r.ssig[k]))} → ${f2(mean((r) => r.fsig[k]))}   (Δ ${f2(mean((r) => r.fsig[k] - r.ssig[k]))})`);
console.log(`  vitality   ${f2(mean((r) => r.sv))} → ${f2(mean((r) => r.fv))}   (Δ ${f2(mean((r) => r.fv - r.sv))})`);
const typeSet = (rs, key) => { const t = {}; for (const r of rs) for (const k in r[key].types) t[k] = (t[k] || 0) + r[key].types[k]; return t; };
console.log('\ndrama type totals across seeds — sealed:', JSON.stringify(typeSet(rows, 'ds')), '\n                                  floor: ', JSON.stringify(typeSet(rows, 'df')));

// ── C2: the v101 unlock chain — floor society re-rolled per stage, churn measured ────────────
// v101 ensureUnlockedWards order: commons → continuant (chunks 3,4) → rindwalker (1,2) → drift (5,6).
// We build the floor society over each prefix (chunks appended in stream order, so room ids — and
// hence the rng stream positions of existing dwellings — are stable), then diff each person's hats.
console.log('\n════ C2 · THE UNLOCK CHAIN — unified society re-rolled per streamed stage (v101 order) ════');
const UNLOCK = [[0], [0, 3, 4], [0, 3, 4, 1, 2], [0, 3, 4, 1, 2, 5, 6]];
const STAGE_NAMES = ['commons', '+continuant', '+rindwalker', '+drift (full nave)'];
function hatSig(p) {
  const work = p.hats.find((h) => h.kind === 'work');
  const kinds = (k) => p.hats.filter((h) => h.kind === k).map((h) => h.place).sort().join(',');
  return { work: work ? work.place : -1, worship: kinds('worship'), club: kinds('club'), sport: kinds('sport') };
}
for (const seed of SEEDS) {
  const nave = loadNave(seed);
  let prev = null;
  const line = [];
  for (let s = 0; s < UNLOCK.length; s++) {
    const sub = { ...nave, chunks: UNLOCK[s].map((ci) => nave.chunks[ci]) };
    const out = buildGossNave(sub, { mode: 'floor' });
    const P = out.enriched.people;
    let churnStr = '';
    if (prev) {
      const N = Math.min(prev.length, P.length);
      let ident = 0, workFlip = 0, thirdFlip = 0;
      for (let i = 0; i < N; i++) {
        const a = hatSig(prev[i]), b = hatSig(P[i]);
        if (out.society.people[i].home === prevHomes[i]) ident++;
        if (a.work !== b.work) workFlip++;
        if (a.worship !== b.worship || a.club !== b.club || a.sport !== b.sport) thirdFlip++;
      }
      churnStr = ` churn: ident ${pct(ident / N)}%, work-flip ${pct(workFlip / N)}%, third-flip ${pct(thirdFlip / N)}%`;
    }
    line.push(`${STAGE_NAMES[s]}: ${P.length} souls, vit ${out.vital.vitality} (${out.vital.tier})${churnStr}`);
    prev = P; var prevHomes = out.society.people.map((p) => p.home);
  }
  console.log(`seed ${String(seed).padStart(2)}:\n  ` + line.join('\n  '));
}

// ── C1: solve-order independence — v101's gated order vs buildNave's dir order ───────────────
// Only run if the hoop engine is present (this is the cross-wing check; the goss data path never
// needs it at runtime). Compares the full solved room lists byte-for-byte.
const navePath = join(here, '..', '..', '..', 'hoop', 'nave', 'nave.js');
if (existsSync(navePath)) {
  console.log('\n════ C1 · SOLVE-ORDER INDEPENDENCE — buildNave dir order vs v101 unlock order ════');
  const { prepareNave, naveSolveNext } = await import(navePath);
  const roomsSig = (st) => JSON.stringify(st.recs.map((r) => r.rooms.map((rm) => [rm.role, Math.round(rm.x * 10), Math.round(rm.y * 10), rm.cells ? rm.cells.length : 1])));
  for (const seed of SEEDS.slice(0, 3)) {
    const a = prepareNave(seed); while (naveSolveNext(a) >= 0);                      // dir order 0..6
    const b = prepareNave(seed); b.order = [0, 3, 4, 1, 2, 5, 6]; while (naveSolveNext(b) >= 0);   // v101 unlock order
    const c = prepareNave(seed); c.order = [0, 4, 3, 2, 1, 6, 5]; while (naveSolveNext(c) >= 0);   // ADVERSARIAL: siblings reversed
    const A = roomsSig(a), B = roomsSig(b), C = roomsSig(c);
    console.log(`seed ${String(seed).padStart(2)}: v101 unlock order ${A === B ? 'IDENTICAL to' : '≠'} dir order · sibling-reversed order ${A === C ? 'IDENTICAL' : 'DIVERGES'}`);
  }
} else {
  console.log('\n(C1 skipped — hoop engine not present at ' + navePath + ')');
}
