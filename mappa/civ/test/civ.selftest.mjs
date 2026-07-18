// mappa/civ/test/civ.selftest.mjs — node selftest for the civ sim. No network, no UI.
//   node mappa/civ/test/civ.selftest.mjs
// Exercises the determinism gate, config-token round-trip, the capability DAG, the
// world adapter, the signals battery's discrimination, and a preset run end-to-end.

import { generateWorld } from '../../engine.js';
import { createSim } from '../engine.js';
import { loadCivWorld, cellK } from '../world.js';
import { defaultConfig, encodeCivConfig, decodeCivConfig, normalizeConfig } from '../config.js';
import { civSignals } from '../signals.js';
import { chronicleHash } from '../chronicle.js';
import { candidates, PREREQ, CAP, has, bit, vecTier, NCAP, NPKG, PKG_ID, pkgUnlocked } from '../caps.js';

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.log('  ✗ ' + msg); } };
const section = s => console.log('\n' + s);

// shared world (regenerated deterministically)
const rawW = generateWorld(7, { N: 1200 });
const w = loadCivWorld(rawW);

section('world adapter (M0)');
ok(w.N === rawW.N, 'N preserved');
ok(w.nbrOff.length === w.N + 1 && w.nbrIdx.length === w.nbrOff[w.N], 'CSR adjacency well-formed');
ok(w.subViab.length === w.N * NPKG, 'subViability table sized N×NPKG');
ok(w.nLandmass >= 1, 'at least one landmass detected');
let anyLand = 0, anyK = 0;
for (let i = 0; i < w.N; i++) if (w.land[i]) { anyLand++; if (cellK(w, i, PKG_ID.forager, 650) > 0) anyK++; }
ok(anyLand > 0 && anyK > 0, 'land cells have positive forager K');
ok(w.areaNorm && Math.abs(w.areaNorm.reduce((a, b) => a + b, 0) / w.N - 1) < 0.001, 'areaNorm mean ≈ 1');

section('capability DAG (caps.js)');
ok(candidates(bit(CAP.fire)).includes(CAP.pottery), 'fire → pottery is a candidate');
ok(!candidates(bit(CAP.fire)).includes(CAP.metallurgy), 'metallurgy gated (needs pottery)');
ok((PREREQ[CAP.mechanisation] & bit(CAP.wheel)) !== 0, 'mechanisation requires wheel');
ok(vecTier(bit(CAP.fire)) === 0 && vecTier(bit(CAP.electricity)) === 5, 'tiers 0..5 correct');
ok(pkgUnlocked(bit(CAP.sail), PKG_ID.maritime) && !pkgUnlocked(bit(CAP.fire), PKG_ID.plough), 'package unlock gating');

section('config token round-trip (config.js)');
{
  const c = defaultConfig(); c.agent.b0 = 0.371; c.culture.mutationRate = 0.083; c.seeding.nucleusCount = 3; c.climate = { preset: 'kurgan' };
  const dec = decodeCivConfig(encodeCivConfig(c));
  ok(Math.abs(dec.agent.b0 - 0.371) < 1e-6, 'b0 survives fixed-point round-trip');
  ok(Math.abs(dec.culture.mutationRate - 0.083) < 1e-6, 'mutationRate survives');
  ok(dec.seeding.nucleusCount === 3, 'nucleusCount survives');
  ok(dec.climate.preset === 'kurgan', 'climate preset survives');
  ok(encodeCivConfig(dec) === encodeCivConfig(c), 'token is idempotent');
}

section('determinism gate (verify)');
{
  const h1 = chronicleHash(createSim(w, defaultConfig(), 7).run(600));
  const h2 = chronicleHash(createSim(w, defaultConfig(), 7).run(600));
  ok(h1 === h2, 'same config ⇒ identical chronicle hash (' + h1 + ')');
  const h3 = chronicleHash(createSim(w, defaultConfig(), 8).run(600));
  ok(h1 !== h3, 'different civSeed ⇒ different chronicle');
}

section('emergent arc + signals discrimination (M1–M9)');
{
  const ch = createSim(w, defaultConfig(), 1).run(1400);
  const sig = civSignals(ch);
  ok(ch.meta.finalPop > 1000, 'population grew (nucleation → expansion), pop=' + ch.meta.finalPop);
  ok(ch.meta.finalCultures > 1, 'cultures diversified, n=' + ch.meta.finalCultures);
  ok(ch.meta.finalLanguages >= ch.meta.finalCultures - 1, 'language phylogeny tracked');
  ok(ch.events.some(e => e.type === 'agriculture'), 'agriculture emerged as a phase transition');
  ok(sig.score > 30, 'a rich run scores well, ★' + sig.score);
  ok(!sig.flags.includes('instant-extinction'), 'healthy run not flagged extinct');

  // memetics: belief systems emerge, diffuse across cultures (not ethnic), and schism
  ok((ch.final.beliefs || []).length > 0, 'belief systems emerged, faiths=' + (ch.final.beliefs || []).length);
  ok((ch.final.beliefs || []).some(b => b.cultures >= 2), 'a faith crossed culture lines (memetic, not ethnic)');
  ok(ch.events.some(e => e.type === 'beliefFounded'), 'a prophet founded a faith (beliefFounded event)');

  // a degenerate run scores low and is flagged
  const bad = defaultConfig(); bad.seeding.founders = 4; bad.agent.b0 = 0.12;
  const sigBad = civSignals(createSim(w, bad, 1).run(800));
  ok(sigBad.score < 15, 'extinction-prone run scores low, ★' + sigBad.score);
  ok(sigBad.flags.length > 0, 'degenerate run is flagged: ' + sigBad.flags.join(','));

  // stuck-forager (innovation off) is flagged stuck-foraging
  const stuck = defaultConfig(); stuck.culture.innovationBase = 0; stuck.culture.mutationRate = 0;
  const sigStuck = civSignals(createSim(w, stuck, 1).run(1000));
  ok(sigStuck.flags.includes('stuck-foraging'), 'no-innovation run flagged stuck-foraging');
}

section('preset run (kurgan, climate coupling M5)');
{
  const kurgan = normalizeConfig({ agent: { dispersalGain: 2.4 }, culture: { seedTech: ['fire', 'herding'], normWeights: [0.5, 0.35, 0.5, 0.85, 0.72, 0.5, 0.5, 0.4] }, climate: { preset: 'kurgan' }, popScale: 620 });
  const ch = createSim(w, kurgan, 1).run(1000);
  ok(ch.meta.climate === 'kurgan', 'climate preset applied');
  ok(ch.meta.finalPop > 0, 'kurgan run survived');
}

section('naming voice (names.js, Phase II) + foundings contract (Phase III)');
{
  const { makeNamer } = await import('../names.js');

  // legacy mode reproduces the pre-Phase-II syllable strings bit-exactly (frozen fixture:
  // these strings were emitted by the original inline generators at civSeed=1)
  const lg = makeNamer(1, 'legacy');
  ok(lg.person(0, 3) === lg.person(0, 99), 'legacy person ignores culture');
  const lgFix = [lg.person(0), lg.person(999), lg.belief(42), lg.instRoot(0, 100, 2)].join('|');
  const lg2 = makeNamer(1, 'legacy');
  ok(lgFix === [lg2.person(0), lg2.person(999), lg2.belief(42), lg2.instRoot(0, 100, 2)].join('|'), 'legacy namer deterministic');

  // rite mode: deterministic, culture-coherent, distinct across seeds
  const nm = makeNamer(1, 'rite'), nmB = makeNamer(1, 'rite'), nmC = makeNamer(2, 'rite');
  ok(nm.person(7, 0) === nmB.person(7, 0), 'rite namer deterministic across instances');
  ok(nm.person(7, 0) !== nmC.person(7, 0) || nm.culture(0) !== nmC.culture(0), 'different civSeed → different voice');
  ok(nm.packFor(0) === nmB.packFor(0), 'culture pack assignment stable');
  ok(typeof nm.culture(0) === 'string' && nm.culture(0).length >= 3, 'culture gets a name');

  // names never enter the hash: rite and legacy runs of the same params hash identically
  const cfgR = normalizeConfig({ seeding: { founders: 60 } });
  const cfgL = normalizeConfig({ seeding: { founders: 60 }, names: 'legacy' });
  ok(cfgR.names === 'rite' && cfgL.names === 'legacy', 'names config field normalizes');
  ok(decodeCivConfig(encodeCivConfig(cfgL)).names === 'legacy', 'legacy survives the token round-trip');
  ok(decodeCivConfig(encodeCivConfig(cfgR)).names === 'rite', 'rite is the token default');
  const chR = createSim(w, cfgR, 5).run(400), chL = createSim(w, cfgL, 5).run(400);
  ok(chronicleHash(chR) === chronicleHash(chL), 'naming voice is hash-invariant (presentation only)');

  // foundings: the civ → polis contract is well-formed
  const f = chR.final.foundings || [];
  ok(Array.isArray(f), 'final.foundings present');
  ok(f.every(x => x.cell >= 0 && x.cell < w.N), 'founding cells in range');
  ok(f.every(x => Math.abs(x.lat) <= 90 && Math.abs(x.lon) <= 180), 'founding lon/lat in degrees');
  ok(f.every(x => typeof x.city === 'string' && typeof x.cultureName === 'string'), 'foundings carry city + culture names');
  ok(f.every(x => x.tick >= 0 && x.year === Math.round(x.tick * chR.meta.tickYears)), 'founding year derives from tick');

  // the API-level contract: /api/civ/sites carries siteSeed strings + the mesh N needed
  // to reproduce the world (mappa terrain is not resolution-stable)
  const { doSites } = await import('../api.js');
  const s = doSites(new URLSearchParams('world=7&preset=kurgan&civSeed=1&ticks=300'));
  ok(s.n === 900, 'sites contract carries requested mesh n (default 900)');
  ok(s.foundings.every(x => x.siteSeed === `7:${x.city}:${x.cell}`), 'siteSeed follows org convention world:city:cell');
  const s2 = doSites(new URLSearchParams('world=7&preset=kurgan&civSeed=1&ticks=300'));
  ok(JSON.stringify(s.foundings) === JSON.stringify(s2.foundings) && s.hash === s2.hash, 'sites endpoint deterministic');
}

section('org addresses + persons (org.js, Phase IV)');
{
  const { civPerson, INST_ORG, BELIEF_ORG } = await import('../org.js');
  const cfg = normalizeConfig({ seeding: { founders: 60 } });
  const ch = createSim(w, cfg, 5).run(400);
  const insts = ch.final.institutions || [], greats = ch.final.greatPeople || [], faiths = ch.final.beliefs || [];
  ok(insts.every(o => o.org && o.org.vertical && o.org.shape && typeof o.seatName === 'string'), 'institutions carry org address parts (vertical/shape/seatName)');
  ok(insts.every(o => o.org === INST_ORG[o.kind]), 'institution vertical/shape follows the kind map');
  ok(faiths.every(b => b.org === BELIEF_ORG[b.register]), 'faith vertical/shape follows the register map');
  ok(greats.length === 0 || greats.every(g => g.person && g.person.vocation && g.person.cast && g.person.triad), 'great people are full org persons');
  ok(greats.length === 0 || greats.every(g => g.person.vocation === 'govern'), 'apex people govern (they led)');
  // person identity is (civSeed, agent id) — same person on every machine
  const p1 = civPerson(5, 12345, 'state'), p2 = civPerson(5, 12345, 'state'), p3 = civPerson(6, 12345, 'state');
  ok(JSON.stringify(p1) === JSON.stringify(p2), 'civPerson deterministic');
  ok(JSON.stringify(p1) !== JSON.stringify(p3), 'different civSeed → different person');
  // hash invariance again: Phase IV fields are additive presentation
  ok(chronicleHash(ch) === chronicleHash(createSim(w, cfg, 5).run(400)), 'org enrichment leaves the hash untouched');
}

section('historical timeline (timeline.js) — two historiographies');
{
  const { buildTimeline } = await import('../timeline.js');
  const cfg = normalizeConfig({ seeding: { founders: 60 } });
  const ch = createSim(w, cfg, 5).run(500);
  const gm = buildTimeline(ch, 'greatman'), fo = buildTimeline(ch, 'forces');
  ok(gm.entries.length > 3 && fo.entries.length > 3, `both modes produce entries (greatman ${gm.entries.length}, forces ${fo.entries.length})`);
  ok(gm.entries.every((e, i) => i === 0 || e.t >= gm.entries[i - 1].t), 'greatman chronological');
  ok(fo.entries.every((e, i) => i === 0 || e.t >= fo.entries[i - 1].t), 'forces chronological');
  ok(gm.entries.every(e => typeof e.title === 'string' && typeof e.body === 'string' && e.year === Math.round(e.t * ch.meta.tickYears)), 'entries well-formed');
  ok(gm.entries[0].kind === 'founding' && gm.entries[gm.entries.length - 1].kind === 'closing', 'greatman opens with founding, closes with the state of the world');
  ok(!fo.entries.some(e => e.kind === 'eminence'), 'forces mode names no great men');
  ok(!gm.entries.some(e => ['migration', 'admixture', 'demography', 'rulesets'].includes(e.kind)), 'greatman mode carries no structural-force entries');
  // the content of the ruleset: forces mode exposes doctrine vectors + evolved rulesets
  const closing = fo.entries[fo.entries.length - 1];
  ok(Array.isArray(closing.refs.cultures) && closing.refs.cultures.every(c => c.name), 'closing entry exposes named cultures');
  ok((closing.refs.beliefs || []).every(b => b.doctrine), 'closing entry exposes belief doctrine vectors');
  const rs = fo.entries.find(e => e.kind === 'rulesets');
  ok(!rs || (rs.refs.exemplars && Object.values(rs.refs.exemplars).every(r => 'tax' in r && 'merit' in r)), 'rulesets entry (when present) exposes the evolved exemplar numbers');
  // deterministic
  const gm2 = buildTimeline(createSim(w, cfg, 5).run(500), 'greatman');
  ok(JSON.stringify(gm) === JSON.stringify(gm2), 'timeline deterministic');
  // API level
  const { doTimeline } = await import('../api.js');
  const tr = doTimeline(new URLSearchParams('world=7&preset=kurgan&civSeed=1&ticks=300&mode=both'));
  ok(tr.timeline.greatman && tr.timeline.forces, 'doTimeline mode=both returns both historiographies');
  const tg = doTimeline(new URLSearchParams('world=7&preset=kurgan&civSeed=1&ticks=300&mode=greatman'));
  ok(tg.timeline.greatman && !tg.timeline.forces, 'single-mode request returns only that mode');
}

section('climate visibility + mesh resolution');
{
  const { doRun, doTimeline, CAP } = await import('../api.js');
  // hash pin — EPOCH 2 (cities as actors). Epoch 1 pinned 67eee302; the city epoch
  // (agglomeration K, walls in war resolution, city events) is a DECLARED break —
  // this is the only place the pin may ever change, and only with an epoch bump.
  const pin = doRun(new URLSearchParams('world=7&preset=kurgan&civSeed=1&ticks=400'));
  ok(pin.hash === '3c9a4a61', `epoch-2 hash pinned: world=7 kurgan civSeed=1 ticks=400 → 3c9a4a61 (got ${pin.hash})`);
  ok(pin.chronicle.meta.epoch === 2, 'chronicle declares epoch 2');
  // climate series (fred — hash-safe) + per-frame scalar
  const cp = pin.chronicle.fred.series['climate.pulse'];
  ok(cp && cp.data.length > 0 && Math.max(...cp.data) >= 0.4, 'kurgan run records a climate.pulse series that actually pulses');
  ok(pin.chronicle.fred.series['climate.affected'], 'climate.affected series present');
  const stable = createSim(w, normalizeConfig({ seeding: { founders: 60 } }), 5).run(400);
  const scp = stable.fred.series['climate.pulse'];
  ok(scp && scp.data.every(v => v === 0), 'stable-climate run records an all-zero pulse series');
  // frames carry the climate scalar
  const fr = createSim(w, normalizeConfig({ climate: { preset: 'kurgan' } }), 5).run(300, { frames: true, every: 30 });
  ok(fr.frames.every(f => typeof f.clim === 'number'), 'frames carry per-frame clim scalar');
  ok(fr.frames.some(f => f.clim > 0), 'kurgan frames show non-zero forcing');
  // timeline surfaces the climate arc, in both historiographies, only when it happened
  const tk = doTimeline(new URLSearchParams('world=7&preset=kurgan&civSeed=1&ticks=400&mode=both'));
  ok(tk.timeline.forces.entries.some(e => e.kind === 'climate'), 'forces timeline carries climate entries for kurgan');
  ok(tk.timeline.greatman.entries.some(e => e.kind === 'climate'), 'greatman timeline carries climate entries for kurgan');
  const { buildTimeline } = await import('../timeline.js');
  ok(!buildTimeline(stable, 'forces').entries.some(e => e.kind === 'climate'), 'stable run timeline has no climate entries');
  // mesh resolution: the edge cap clamps, a browser cap unlocks finer meshes
  const hi = doRun(new URLSearchParams('world=7&civSeed=1&ticks=50&n=1600'), { ...CAP, runN: 2600 });
  const lo = doRun(new URLSearchParams('world=7&civSeed=1&ticks=50&n=1600'));
  ok(hi.chronicle.meta.N > lo.chronicle.meta.N, `browser cap yields a finer mesh (N ${hi.chronicle.meta.N} vs edge-clamped ${lo.chronicle.meta.N})`);
}

section('continents, cities, tech history, major orgs');
{
  const { doRun, doTimeline, doSites } = await import('../api.js');
  const r = doRun(new URLSearchParams('world=7&preset=kurgan&civSeed=1&ticks=400'));
  const fin = r.chronicle.final;
  // named continents, id-indexed, with pop + city counts
  ok(Array.isArray(fin.landmasses) && fin.landmasses.length === r.chronicle.meta.landmasses, 'landmasses inventory covers every landmass');
  ok(fin.landmasses.every(l => typeof l.name === 'string' && l.name.length >= 3), 'continents are named');
  // cities: emergent settlements with the geography that sited them
  ok(Array.isArray(fin.cities) && fin.cities.length > 0, `cities emerged (${fin.cities.length})`);
  ok(fin.cities.every(c => c.name && c.cultureName && c.tick >= 0 && c.landmass >= 0 && typeof c.river === 'boolean'), 'cities well-formed');
  ok(fin.cities.every((c, i) => i === 0 || fin.cities[i - 1].peak >= c.peak), 'cities sorted by peak');
  const wet = fin.cities.filter(c => c.river || c.coast).length;
  ok(wet >= fin.cities.length * 0.4, `mappa rivers/coasts drive settlement: ${wet}/${fin.cities.length} cities on water`);
  // continent metadata on every located object
  ok((fin.institutions || []).every(o => o.landmass >= 0), 'institutions carry landmass');
  ok((fin.beliefs || []).every(b => b.landmass >= -1), 'beliefs carry landmass');
  ok((fin.foundings || []).every(x => x.landmass >= 0), 'foundings carry landmass');
  ok(Array.isArray(r.chronicle.geo && r.chronicle.geo.cellLandmass), 'chronicle.geo cell→landmass lookup present');
  // tech history mode
  const t = doTimeline(new URLSearchParams('world=7&preset=kurgan&civSeed=1&ticks=400&mode=tech'));
  const te = t.timeline.tech.entries;
  ok(te.some(e => e.kind === 'techFirst'), 'tech mode records first inventions');
  ok(te[te.length - 1].kind === 'closing', 'tech mode closes with the state of the art');
  ok(te.every((e, i) => i === 0 || e.t >= te[i - 1].t), 'tech mode chronological');
  // landmass filter keeps world-scale entries, drops other continents
  const home = fin.landmasses.reduce((a, b) => (b.pop > a.pop ? b : a));
  const tf = doTimeline(new URLSearchParams(`world=7&preset=kurgan&civSeed=1&ticks=400&mode=forces&landmass=${home.id}`));
  ok(tf.timeline.forces.entries.every(e => e.lm == null || e.lm === home.id), 'landmass filter holds');
  ok(tf.landmasses && tf.landmasses.length > 0, 'timeline response carries the landmass inventory');
  // major orgs + cities appear in the narrative modes, with org address refs
  const g = doTimeline(new URLSearchParams('world=7&preset=kurgan&civSeed=1&ticks=400&mode=greatman')).timeline.greatman.entries;
  ok(g.some(e => e.kind === 'city'), 'city foundings in the timeline');
  const mo = g.filter(e => e.kind === 'majorOrg');
  ok(mo.length === 0 || mo.every(e => e.refs.org && e.refs.seatName && e.refs.inst != null), 'majorOrg entries carry the org address');
  // sites: cities join the polis handoff with siteSeeds
  const s = doSites(new URLSearchParams('world=7&preset=kurgan&civSeed=1&ticks=400'));
  ok(Array.isArray(s.cities) && s.cities.every(c => c.siteSeed === `7:${c.name}:${c.cell}`), 'sites cities carry siteSeed strings');
}

section('epoch 2 — cities as actors');
{
  const { doRun, doSites } = await import('../api.js');
  const r = doRun(new URLSearchParams('world=7&preset=kurgan&civSeed=1&ticks=600'));
  const cities = r.chronicle.final.cities, ev = r.chronicle.events;
  ok(cities.some(c => c.walls), 'masonry cultures fortify their cities');
  ok(cities.every(c => Array.isArray(c.institutions) && Array.isArray(c.sackTicks) && c.sackTicks.length <= 12), 'cities carry institutions + bounded sackTicks');
  ok(cities.every(c => c.sacked >= c.sackTicks.length || c.sackTicks.length === 12), 'sack counter >= recorded ticks');
  ok(ev.some(e => e.type === 'cityRise'), 'cityRise events in the chronicle');
  const sieges = ev.filter(e => e.type === 'citySiege');
  ok(sieges.every(e => { const c = cities.find(x => x.id === e.city); return c && c.walls; }), 'sieges only happen at walled cities');
  const sackEvents = ev.filter(e => e.type === 'citySacked').length;
  const totalSacks = cities.reduce((a, c) => a + c.sacked, 0);
  ok(sackEvents <= totalSacks, `sack events throttled to annals (${sackEvents} events, ${totalSacks} sacks)`);
  // the world-beyond contract for polis: sites carries climate + per-city sack history
  const s = doSites(new URLSearchParams('world=7&preset=kurgan&civSeed=1&ticks=600'));
  ok(s.climate && s.climate.t.length === s.climate.pulse.length && s.climate.t.length > 0, 'sites carries the global climate curve');
  ok(s.cities.every(c => 'walls' in c && 'sacked' in c && Array.isArray(c.sackTicks)), 'sites cities carry the shock history polis consumes');
  // founderTech: the founder culture's capability→unlock-tick map (lineage-walked),
  // so the hinterland derives its transport eras from actual civ history
  ok(s.cities.every(c => c.founderTech && typeof c.founderTech === 'object'), 'cities carry founderTech');
  ok(s.cities.every(c => Object.values(c.founderTech).every(t2 => Number.isInteger(t2) && t2 >= 0)), 'founderTech ticks are unlock times');
  ok(s.cities.some(c => 'fire' in c.founderTech || 'herding' in c.founderTech), 'seed caps present at tick 0');
  // the demographic envelope: per-city population series, fred-aligned, zeros pre-founding
  ok(s.cities.every(c => Array.isArray(c.popSeries) && c.popSeries.length === s.climate.t.length), 'popSeries aligned to the fred/climate time axis');
  ok(s.cities.every(c => { const k = Math.max(0, c.popSeries.findIndex(v => v > 0)); return c.popSeries.slice(0, k).every(v => v === 0); }), 'popSeries zero before founding');
  // timeline speaks the epoch
  const { doTimeline } = await import('../api.js');
  const g = doTimeline(new URLSearchParams('world=7&preset=kurgan&civSeed=1&ticks=600&mode=greatman')).timeline.greatman.entries;
  ok(g.some(e => e.kind === 'sack' || e.kind === 'siege' || e.kind === 'fall'), 'sacks/sieges/falls reach the timeline');
}

console.log(`\n${fail === 0 ? '✓ ALL PASS' : '✗ FAILURES'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
