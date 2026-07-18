// mappa/civ/timeline.js — the historical timeline, in two historiographies.
//
// One chronicle, two tellings. `buildTimeline(ch, mode)` walks a finished chronicle
// (events + series + final summary) and emits a chronological list of entries:
//
//   'greatman' — history as the deeds of named actors: prophets proclaim faiths,
//                leaders raise states, warlords fall upon frontiers, the eminent
//                are remembered with their temperament and vocation.
//   'forces'   — the same history as structural sweep: climate pulses push
//                dispersers onto the roads, surplus reorganizes society, credit
//                cycles boom and crash, memes are selected — no names, only
//                pressures. Institution rulesets and belief doctrines — the
//                CONTENT of what evolution selected — are exposed here.
//
// This is where beliefs and cultures surface as narrative content: every entry
// carries machine-readable `refs` (culture ids + names, belief doctrine vectors,
// institution ids) so downstream consumers (borges-style retellers, fable wings)
// can build on the same spine.
//
// Pure + deterministic: a function of the chronicle only. Phrase variety is picked
// by hashing (civSeed, tick) — no RNG stream is consumed, no wall clock. Entries are
// presentation: nothing here feeds chronicleHash.

// significance weight per ENTRY kind — when a run overflows the entry budget, the
// least significant kinds are trimmed first (never the arc-defining ones).
const WEIGHT = {
  founding: 100, closing: 100, agriculture: 95, industry: 95, rulesets: 90,
  climate: 85, polityRise: 80, techFirst: 80, polityFall: 78, collapse: 74,
  techIndep: 70, belief: 70, majorOrg: 68, eminence: 66, city: 64, war: 62,
  demography: 60, techSpread: 60, schism: 58, stateFormation: 50, crisis: 48,
  institution: 45, conversion: 44, boom: 40, resource: 38, split: 36, extinction: 34,
  migration: 26, admixture: 22, tech: 20,
};
const MAX_ENTRIES = 160;

export function buildTimeline(ch, mode) {
  const f = ch.final || {};
  const ty = (ch.meta && ch.meta.tickYears) || 2.5;
  const yr = t => Math.round(t * ty);
  const cuName = i => (i != null && i >= 0 && f.cultureNames && f.cultureNames[i]) || 'a forgotten people';
  const instById = new Map((f.institutions || []).map(o => [o.id, o]));
  const beliefById = new Map((f.beliefs || []).map(b => [b.id, b]));
  const stateOf = cu => (f.institutions || []).find(o => o.kind === 'state' && o.culture === cu);
  // continent metadata: every located entry carries `lm` (landmass id) for filtering,
  // and prose names continents via final.landmasses
  const geo = (ch.geo && ch.geo.cellLandmass) || null;
  const lmOf = cell => (geo && cell != null && cell >= 0 && cell < geo.length) ? geo[cell] : null;
  const lmName = i => { const L = (f.landmasses || [])[i]; return L ? L.name : (i == null || i < 0 ? 'unknown shores' : 'landmass ' + i); };

  const entries = [];
  const add = (t, kind, title, body, refs, lm) => entries.push({ t, year: yr(t), kind, title, body, lm: lm ?? null, refs: refs || {} });

  const great = mode === 'greatman';

  // ---- 'tech' — the history of technology as its own lens -----------------------
  if (mode === 'tech') {
    const seen = new Map(); // cap → { holders, inventions }
    for (const e of ch.events || []) {
      const cn = cuName(e.culture);
      if (e.type === 'agriculture')
        add(e.t, 'agriculture', `the agricultural transition on ${lmName(e.landmass)}`, `the ${cn} cross the ${e.package} threshold — the surplus every later technology is built on.`, { culture: e.culture, cultureName: cn, package: e.package }, e.landmass);
      else if (e.type === 'industry')
        add(e.t, 'industry', `the industrial transition on ${lmName(e.landmass)}`, `the ${cn} put energy to work at scale — capability compounds from here.`, { culture: e.culture, cultureName: cn }, e.landmass);
      else if (e.type === 'techUnlock') {
        let st = seen.get(e.cap);
        if (!st) { st = { holders: 0, inventions: 0 }; seen.set(e.cap, st); }
        st.holders++;
        const invented = e.how !== 'diffusion';
        if (invented) st.inventions++;
        if (st.holders === 1)
          add(e.t, 'techFirst', `${e.cap} — first worked out`, `the ${cn} work out ${e.cap} (${e.tier}) on ${lmName(e.landmass)} — no one taught them.`, { cap: e.cap, tier: e.tier, culture: e.culture, cultureName: cn, how: e.how }, e.landmass);
        else if (invented)
          add(e.t, 'techIndep', `${e.cap} — invented again`, `the ${cn} arrive at ${e.cap} independently on ${lmName(e.landmass)} — convergent problems find convergent answers.`, { cap: e.cap, tier: e.tier, culture: e.culture, cultureName: cn, inventions: st.inventions }, e.landmass);
        else if (st.holders === 3)
          add(e.t, 'techSpread', `${e.cap} spreads`, `a third people (the ${cn}) now holds ${e.cap} — knowledge moves along contact networks faster than any army.`, { cap: e.cap, tier: e.tier, holders: st.holders }, e.landmass);
        else if (st.holders === 8)
          add(e.t, 'techSpread', `${e.cap} is common knowledge`, `eight peoples hold ${e.cap} — it stops being an advantage and becomes the floor.`, { cap: e.cap, tier: e.tier, holders: st.holders }, e.landmass);
      }
    }
    const lastT = (ch.series && ch.series.tick && ch.series.tick[ch.series.tick.length - 1]) || 0;
    const m = ch.meta || {};
    const tops = (f.cultures || []).slice(0, 5).map(c => `${c.name} (tier ${c.tier})`).join(', ');
    add(lastT, 'closing', `the state of the art`,
      `${m.agriOrigins || 0} independent agricultural origin${m.agriOrigins === 1 ? '' : 's'}, ${m.industrialOrigins || 0} industrial; leading cultures: ${tops || 'none'}.`,
      { agriOrigins: m.agriOrigins, industrialOrigins: m.industrialOrigins, cultures: (f.cultures || []).slice(0, 8).map(c => ({ id: c.id, name: c.name, tier: c.tier, sub: c.sub })) });
    return finish(entries, mode);
  }

  for (const e of ch.events || []) {
    const cn = cuName(e.culture);
    switch (e.type) {
      case 'founding':
        add(e.t, 'founding',
          great ? `the first families of the ${cn}` : `a founder population takes root`,
          great ? `${e.pop} souls of the ${cn} settle their homeland on ${lmName(e.landmass)}.`
                : `${e.pop} foragers, one habitable nucleus, on ${lmName(e.landmass)}: initial conditions, not intentions, set what follows.`,
          { culture: e.culture, cultureName: cn, cell: e.cell }, e.landmass);
        break;
      case 'agriculture':
        add(e.t, 'agriculture',
          great ? `the ${cn} take up the plough` : `the agricultural transition`,
          great ? `the ${cn} bind themselves to the soil — the ${e.package} package — and their children multiply.`
                : `on ${lmName(e.landmass)}, subsistence crosses the ${e.package} threshold: surplus, storage, sedentism — a phase transition no one chose.`,
          { culture: e.culture, cultureName: cn, package: e.package }, e.landmass);
        break;
      case 'industry':
        add(e.t, 'industry',
          great ? `the ${cn} light the forges` : `the industrial phase transition`,
          great ? `the ${cn} harness machine and coal; their reach outruns every rival's.`
                : `on ${lmName(e.landmass)}, capital begins compounding: energy per head decouples from land per head.`,
          { culture: e.culture, cultureName: cn }, e.landmass);
        break;
      case 'beliefFounded': {
        const b = beliefById.get(e.belief);
        const dox = b ? Object.entries(b.doctrine || {}).sort((x, y2) => y2[1] - x[1]).slice(0, 2).map(([k, v]) => `${k} ${v}`).join(', ') : e.doctrine;
        add(e.t, 'belief',
          great ? `${e.prophet ? e.prophet + ' proclaims ' : 'the founding of '}${e.name}`
                : `a ${e.doctrine} creed emerges`,
          great ? `${e.prophet ? `the prophet ${e.prophet} of the ${cn}` : `among the ${cn}, a voice`} proclaims ${e.name} — a ${e.doctrine}-led ${e.register} faith.`
                : `among the ${cn}, ${e.name} takes hold — register: ${e.register}; doctrine: ${dox}. Beliefs are selected by how well they spread, not by who speaks them.`,
          { belief: e.belief, beliefName: e.name, culture: e.culture, cultureName: cn, register: e.register, doctrine: b ? b.doctrine : undefined }, lmOf(e.cell));
        break;
      }
      case 'schism':
        add(e.t, 'schism',
          great ? `${e.name} breaks from ${e.from}` : `doctrinal divergence`,
          great ? `dissenters carry ${e.name} out of ${e.from} — the quarrel is ${e.doctrine}.`
                : `${e.from} forks: as a creed spreads it mutates, and ${e.name} finds carriers the parent could not. The axis of divergence is ${e.doctrine}.`,
          { belief: e.belief, beliefName: e.name, parentName: e.from, doctrineAxis: e.doctrine }, (beliefById.get(e.belief) || {}).landmass);
        break;
      case 'polityRise': {
        const st = stateOf(e.culture);
        add(e.t, 'polityRise',
          great ? `${st && st.leader ? st.leader + ' raises ' : 'the rise of '}${st ? st.name : 'the ' + cn + ' state'}`
                : `statehood crystallizes among the ${cn}`,
          great ? `${st && st.leader ? `${st.leader} binds the ${cn} under one rule — ${st.name}.` : `the ${cn} bind themselves under one rule.`}`
                : `density, surplus and defensibility cross the sovereignty threshold; the ${cn} acquire a tax ledger and a border.`,
          { culture: e.culture, cultureName: cn, inst: st ? st.id : undefined, seat: e.seat }, lmOf(e.seat));
        break;
      }
      case 'polityFall':
        add(e.t, 'polityFall',
          great ? `the fall of the ${cn}` : `imperial contraction`,
          great ? `the ${cn} state collapses from its peak of ${e.peak.toLocaleString()} — heirs squander what founders won.`
                : `the ${cn} polity contracts below a quarter of peak (${e.peak.toLocaleString()}): overextension, not villainy.`,
          { culture: e.culture, cultureName: cn, peak: e.peak }, ((f.polities || []).find(p => p.id === e.culture) || {}).landmass);
        break;
      case 'war':
        add(e.t, 'war',
          great ? `${e.attacker} takes the field` : `frontier violence`,
          great ? `${e.attacker} falls upon the ${cuName(e.defenderCulture)}${e.resource ? ` for the ${e.resource}` : ''}; the outcome is ${e.outcome}.`
                : `pressure${e.resource ? ` on ${e.resource}` : ''} breaks into war on the ${cuName(e.attackerCulture)}–${cuName(e.defenderCulture)} frontier.`,
          { attackerCulture: e.attackerCulture, defenderCulture: e.defenderCulture, warband: e.attacker, resource: e.resource }, lmOf(e.cell));
        break;
      case 'resourceCaptured':
        add(e.t, 'resource',
          great ? `${e.name} changes hands` : `geography's rents reassigned`,
          great ? `${e.to >= 0 ? 'the ' + cuName(e.to) : 'no one'} now holds ${e.name} (${e.kind}).`
                : `control of ${e.name} (${e.kind}) passes${e.to >= 0 ? ` to the ${cuName(e.to)}` : ''} — whoever holds the node collects its rent.`,
          { resource: e.name, kind: e.kind, from: e.from, to: e.to }, ((f.resources || [])[e.node] || {}).landmass);
        break;
      case 'stateFormation':
        if (!great) add(e.t, 'stateFormation', `the state system widens`, `${e.states} sovereignties now coexist — competition between polities becomes its own selective force.`, { states: e.states });
        break;
      case 'collapse':
        add(e.t, 'collapse',
          great ? `an age of ruin` : `systemic collapse`,
          great ? `thrones topple: of ${e.from} sovereignties, only ${e.to} still stand.`
                : `the state system contracts ${e.from}→${e.to}: cascading failure, interdependence turned liability.`,
          { from: e.from, to: e.to });
        break;
      case 'financialCrisis':
        add(e.t, 'crisis',
          great ? `the great default` : `the credit cycle breaks`,
          great ? `fortunes evaporate — the index falls to ${e.index}, ${e.defaults} houses default.`
                : `leverage unwinds: index ${e.index}, ${e.defaults} defaults, debt ${e.debt}. The boom carried its bust inside it.`,
          { index: e.index, defaults: e.defaults, debt: e.debt });
        break;
      case 'marketBoom':
        if (!great) add(e.t, 'boom', `speculative expansion`, `sentiment compounds on itself: the index reaches ${e.index} at ${(e.rate * 100).toFixed(1)}% interest.`, { index: e.index, rate: e.rate });
        break;
      case 'cultureSplit':
        if (!great) add(e.t, 'split', `a lineage forks`, `distance and drift mint the ${cuName(e.child)} out of the ${cuName(e.parent)} — ${e.cells} cells now answer to a new tongue.`, { parent: e.parent, child: e.child, parentName: cuName(e.parent), childName: cuName(e.child) });
        break;
      case 'extinction':
        add(e.t, 'extinction',
          great ? `the last of the ${cn}` : `a lineage ends`,
          great ? `the last of the ${cn} dies, and a whole way of naming the world goes silent.`
                : `the ${cn} lineage terminates — most cultures end; survivorship is the anomaly that writes the record.`,
          { culture: e.culture, cultureName: cn });
        break;
      case 'migrationPulse':
        if (!great) add(e.t, 'migration', `a migration pulse`, `climate stress (${e.climate}) pushes ${e.dispersers.toLocaleString()} onto the roads out of ${e.pop.toLocaleString()}.`, { dispersers: e.dispersers, climate: e.climate });
        break;
      case 'admixtureSpike':
        if (!great) add(e.t, 'admixture', `contact zones churn`, `${e.count.toLocaleString()} admixture events: frontiers are where cultures trade genes, wares and gods.`, { count: e.count });
        break;
      case 'techUnlock':
        if (great) add(e.t, 'tech', `the ${cn} master ${e.cap}`, `the ${e.how === 'diffusion' ? `craft of ${e.cap} reaches the ${cn} along the roads` : `${cn} work out ${e.cap} for themselves`} (${e.tier}).`, { culture: e.culture, cultureName: cn, cap: e.cap, tier: e.tier, how: e.how }, e.landmass);
        else add(e.t, 'tech', `the ${e.cap} frontier advances`, `${e.cap} (${e.tier}) ${e.how === 'diffusion' ? 'diffuses along contact networks' : 'is independently invented'} — ideas move faster than peoples.`, { cap: e.cap, tier: e.tier, how: e.how }, e.landmass);
        break;
      case 'institutionFell':
        add(e.t, 'institution',
          great ? `the fall of ${e.name}` : `an institution dissolves`,
          great ? `${e.name} is dissolved, ${e.peak.toLocaleString()} strong at its height.`
                : `${e.name} (peak ${e.peak.toLocaleString()}) loses the selection game: its ruleset stopped paying.`,
          { inst: e.inst, instName: e.name, peak: e.peak }, (instById.get(e.inst) || {}).landmass);
        break;
      case 'beliefExtinct':
        if (!great) add(e.t, 'belief', `a creed goes silent`, `${e.name} loses its last carrier — memes die of demography as often as of doctrine.`, { belief: e.belief, beliefName: e.name });
        break;
    }
  }

  // ---- major organizations (both modes): the composite actors at scale ----------
  // Entries carry the full org address parts (Phase IV), so a consumer can open any
  // of these as a rite/org chart in its own culture voice.
  for (const o of (f.institutions || []).filter(o => o.peak >= 250).slice(0, 15)) {
    add(o.founded, 'majorOrg',
      great ? `the charter of ${o.name}` : `an organization at scale`,
      great ? `${o.leader ? o.leader + ' builds ' : ''}${o.name} at ${o.seatName} on ${lmName(o.landmass)} — at its height ${o.peak.toLocaleString()} strong${o.alive ? '' : `; it falls in year ${yr(o.fell)}`}.`
            : `${o.name} (${o.kind}) crosses the scale threshold at ${o.seatName} — peak ${o.peak.toLocaleString()} members. Hierarchy amortizes coordination; what actually competes is its ruleset (tax ${o.rules.tax}, wage ${o.rules.wage}, merit ${o.rules.merit}, invest ${o.rules.invest}).`,
      { inst: o.id, instName: o.name, kind: o.kind, culture: o.culture, seat: o.seat, seatName: o.seatName, org: o.org, namePack: o.namePack, peak: o.peak, rules: o.rules }, o.landmass);
  }

  // ---- city foundings (both modes): where mappa's geography concentrated people --
  for (const ct of (f.cities || []).slice(0, 12)) {
    const site = ct.river && ct.coast ? 'where the river meets the sea' : ct.river ? 'on the river' : ct.coast ? 'on the coast' : ct.resource ? `by the ${ct.resource}` : 'on fertile ground';
    add(ct.tick, 'city',
      great ? `the founding of ${ct.name}` : `a settlement crosses the urban threshold`,
      great ? `the ${ct.cultureName} raise ${ct.name} ${site} on ${lmName(ct.landmass)}; it grows to ${ct.peak.toLocaleString()} souls.`
            : `${ct.name}, ${site} on ${lmName(ct.landmass)}: ${ct.river ? 'river transport and wet soil' : ct.coast ? 'sea lanes' : ct.resource ? `the ${ct.resource} rent` : 'fertile ground'} concentrates ${ct.peak.toLocaleString()} people at one cell — geography, not decree, sites the city.`,
      { city: ct.name, cell: ct.cell, culture: ct.culture, cultureName: ct.cultureName, river: ct.river, coast: ct.coast, resource: ct.resource, peak: ct.peak }, ct.landmass);
  }

  // ---- climate arc (both modes, phrased per historiography) ---------------------
  // Derived from the hash-safe fred climate series: onset (forcing crosses 0.35),
  // peak (max ≥ 0.5), and release (a pulse-shaped schedule falling back ≤ 0.25).
  {
    const cp = ch.fred && ch.fred.series && ch.fred.series['climate.pulse'];
    const ca = ch.fred && ch.fred.series && ch.fred.series['climate.affected'];
    if (cp && cp.data && cp.data.some(v => v > 0)) {
      const d = cp.data, ct = ch.fred.t || [];
      const preset = (ch.meta && ch.meta.climate) || 'shift';
      const TEXT = {
        kurgan: {
          onset: ['the rains begin to fail', great ? 'the elders swear the weather of their childhood is gone; forest thins toward grass.' : 'mid-latitude drying sets in: forest gives way to steppe, and mobility outbids rootedness.'],
          peak: ['the steppe stands open', great ? 'herdsmen ride where their grandfathers cleared trees — the open grass is a road for whoever can move.' : 'the drying at full strength: pastoral viability nearly doubles while plough yields wither — the corridor rewrites who prospers.'],
          release: null,
        },
        beringia: {
          onset: ['the ice begins to retreat', great ? 'hunters return from the north telling of bare ground where the wall of ice stood.' : 'high-latitude warming: frozen cells thaw, passability climbs.'],
          peak: ['the corridor stands open', great ? 'whole bands walk north into country no one has ever named.' : 'where ice was, a corridor — range expansion is now a matter of demography, not possibility.'],
          release: null,
        },
        '4.2ka': {
          onset: ['the great aridification begins', great ? 'the rivers run thin; the canal-keepers pray, then argue, then leave.' : 'aridification grips the river lands: irrigation viability collapses toward a quarter.'],
          peak: ['the drought at its worst', great ? 'granaries stand empty along dead canals; the river peoples scatter.' : 'the forcing peaks: the cells that fed the most people now eject them.'],
          release: ['the rains return', great ? 'the rivers rise again, and the children of the scattered come back to silted fields.' : 'partial recovery: viability returns, but the ejected populations have already rewritten the map.'],
        },
      }[preset] || {
        onset: ['the climate turns', great ? 'the old weather ends.' : 'a climate forcing sets in.'],
        peak: ['the shift at full strength', great ? 'the world is not what it was.' : 'the forcing peaks.'],
        release: ['the climate eases', great ? 'the skies relent.' : 'the forcing releases.'],
      };
      const aff = i => (ca && ca.data && ca.data[i] != null ? ` ${ca.data[i]}% of the land is under stress.` : '');
      let onset = -1, peakI = -1, mx = 0;
      for (let i = 0; i < d.length; i++) { if (onset < 0 && d[i] >= 0.35) onset = i; if (d[i] > mx) { mx = d[i]; peakI = i; } }
      if (onset >= 0) add(ct[onset] || 0, 'climate', TEXT.onset[0], TEXT.onset[1] + aff(onset), { preset, strength: d[onset] });
      if (mx >= 0.5 && peakI > onset) add(ct[peakI] || 0, 'climate', TEXT.peak[0], TEXT.peak[1] + aff(peakI), { preset, strength: mx });
      if (TEXT.release) { let rel = -1; for (let i = peakI + 1; i < d.length; i++) if (d[i] <= 0.25) { rel = i; break; }
        if (rel > 0) add(ct[rel] || 0, 'climate', TEXT.release[0], TEXT.release[1] + aff(rel), { preset, strength: d[rel] }); }
    }
  }

  // ---- eminence entries (great-man only): the remembered individuals ------------
  if (great) {
    for (const g of (f.greatPeople || []).slice(0, 24)) {
      const quirks = (g.person && g.person.traits || []).map(q => q.label).join(', ');
      add(g.tick, 'eminence', `${g.name} at the height of power`,
        `${g.name} of the ${cuName(g.culture)} — ${g.person ? `${g.person.cast}, called to ${g.person.vocation}${quirks ? `; ${quirks}` : ''}` : 'remembered'} — leads ${g.inst} to eminence (reputation ${g.rep}).`,
        { culture: g.culture, cultureName: cuName(g.culture), inst: g.inst, person: g.person, name: g.name });
    }
  }

  // ---- series-derived synthetic entries (forces only) ---------------------------
  if (!great) {
    const s = ch.series || {}; const pop = s.pop || [], tks = s.tick || [], conv = s.convert || [];
    // demographic contractions: peak → ≥18% drop within 40 samples
    let found = 0;
    for (let i = 2; i < pop.length - 2 && found < 3; i++) {
      if (pop[i] > pop[i - 1] && pop[i] >= pop[i + 1]) {
        let j = i, lo = pop[i];
        while (j < Math.min(pop.length - 1, i + 40) && pop[j + 1] <= pop[j]) { j++; lo = pop[j]; }
        if (lo < pop[i] * 0.82 && pop[i] > 500) {
          add(tks[i], 'demography', `demographic contraction`, `population falls ${pop[i].toLocaleString()} → ${lo.toLocaleString()} — carrying capacity, not conquest, writes the biggest numbers.`, { from: pop[i], to: lo });
          found++; i = j;
        }
      }
    }
    // conversion waves: top spikes in the convert series
    const spikes = conv.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]).slice(0, 2).filter(([v]) => v > 20);
    for (const [v, i] of spikes.sort((a, b) => a[1] - b[1]))
      add(tks[i], 'conversion', `a wave of conversion`, `${v.toLocaleString()} souls change creed in a single span — belief moves through populations like weather.`, { converts: v });
    // the evolved rulesets — what selection actually wrote (the content of the ruleset)
    const ex = f.economy && f.economy.exemplars;
    if (ex && Object.keys(ex).length) {
      const lastT = tks[tks.length - 1] || 0;
      const lines = Object.entries(ex).map(([k, r]) => `${k}: tax ${r.tax.toFixed(2)}, wage ${r.wage.toFixed(2)}, merit ${r.merit.toFixed(2)}, invest ${r.invest.toFixed(2)}`).join(' · ');
      add(lastT, 'rulesets', `what evolution selected`, `the surviving exemplar rulesets — imitated by every new institution — converged on: ${lines}. No one designed these numbers; the economy did.`, { exemplars: ex });
    }
  }

  // ---- closing entry (both modes): the state of the world -----------------------
  {
    const lastT = (ch.series && ch.series.tick && ch.series.tick[ch.series.tick.length - 1]) || 0;
    const cults = (f.cultures || []).slice(0, 5).map(c => c.name).join(', ');
    const faiths = (f.beliefs || []).slice(0, 3).map(b => `${b.name} (${b.lead}, ${Math.round(b.followers).toLocaleString()} souls)`).join(' · ');
    add(lastT, 'closing',
      great ? `the world as the chroniclers leave it` : `the state of the system`,
      `${(f.pop || 0).toLocaleString()} people; leading cultures: ${cults || 'none'}${faiths ? `; living faiths: ${faiths}` : ''}${f.economy ? `; wealth gini ${f.economy.gini}` : ''}.`,
      { cultures: (f.cultures || []).slice(0, 8).map(c => ({ id: c.id, name: c.name, size: c.size, tier: c.tier })), beliefs: (f.beliefs || []).slice(0, 6).map(b => ({ id: b.id, name: b.name, lead: b.lead, followers: Math.round(b.followers), doctrine: b.doctrine })) });
  }

  return finish(entries, mode);
}

// budget: trim least-significant, keep chronological. Same-tick tiebreak is ASCENDING
// weight so the heavyweight summary entries (rulesets, then closing) end the timeline.
function finish(entries, mode) {
  entries.sort((a, b) => a.t - b.t || (WEIGHT[a.kind] || 50) - (WEIGHT[b.kind] || 50));
  if (entries.length > MAX_ENTRIES) {
    const keep = entries.slice().sort((a, b) => (WEIGHT[b.kind] || 50) - (WEIGHT[a.kind] || 50)).slice(0, MAX_ENTRIES);
    const set = new Set(keep);
    const trimmed = entries.filter(e => set.has(e));
    return { mode, count: trimmed.length, trimmedFrom: entries.length, entries: trimmed };
  }
  return { mode, count: entries.length, entries };
}
