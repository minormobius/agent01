// tjs/brut/planting.js — WHERE THE PLANTING GOES. Pure, DOM-free, three.js-free.
//
// Phase 2 of ECOBRUTALISM.md. `plant.js` knows how to grow one plant; this
// knows where a building has room for any, how deep the soil can be, and what
// that weighs — and the last of those is the point. A planted terrace is not a
// finish applied to a slab, it is the load case that sizes it.
//
// THE SITES ARE ALREADY DECLARED. This does not need a new siting stage,
// because the massing and the parti have between them already said where a
// building is open to the sky:
//
//   · every SETBACK leaves a terrace — `roofDecks()` computes exactly the part
//     of each plate the level above does not stand on, which is simultaneously
//     where the roof slab goes and where anything can be planted. The stepped
//     mass is the ecobrutalist form and this generator already made one.
//   · a PARTI TERRACE (a penthouse's, an atrium's) is a designed garden rather
//     than a green roof, and gets the substrate to prove it.
//   · a CLOISTER's court is a court.
//   · an UNDERCROFT is a grove — and, being at grade, the only planting here
//     that costs the structure nothing at all.
//
// AND THE ONE DISTINCTION THAT MATTERS: planting AT GRADE sits on the ground.
// It weighs whatever it weighs and no slab cares. Planting on a plate is
// carried, every kilogram of it, saturated, for the life of the building. Those
// are not the same thing and a generator that treats them the same will happily
// hang a tree pit off the twentieth floor for free.
//
// Depth is NOT clipped to what the slab currently takes. That was the tempting
// design and it is wrong: a green roof is not permitted by a slab, it is PAID
// FOR by one. So the ambition is set here, the load goes into the structural
// model, and the solver says whether the payment worked — at which point the
// roller can repair it like any other governing check. The alternative is a
// generator that quietly shaves the substrate until nothing is ever heavy
// enough to fail, which would make the whole exercise decorative.

import { rect as R, roofDecks, Rand } from './arch.js';
import {
  SPECIES, SOIL, soilFor, soilLoad, grow, envelopeFor, crownFor, dbhFor, dragOn, freshMass,
} from './plant.js';

export const VERSION = 'planting/1';

const r2 = (v) => Math.round(v * 100) / 100;

/* ─────────────────────────────── the ambition ───────────────────────────── */
//
// How deep the substrate is, by what the place IS. A roof deck left over by a
// setback is a green roof; the terrace a penthouse asked for is a garden; the
// ground under an undercroft is the ground. Depth decides the palette, and the
// palette is the whole visible difference between the three.

export const SITES = {
  roof: {
    depth: 0.15, label: 'extensive roof', cover: 0.75,      // a sedum roof really does cover nearly all of a plate, because nothing else was going to happen up there
    onGrade: false,
    note: 'the sedum-and-grass roof that goes on a plate nobody was going to stand on — light enough to be an afterthought, which is why it is the one that actually gets built',
  },
  setback: {
    depth: 0.45, label: 'setback terrace', cover: 0.55,      // half planting, half terrace — a setback nobody can walk out onto is a planter with a view
    onGrade: false,
    note: 'the terrace a stepped mass leaves behind. Deep enough for shrubs and grasses, which is what turns a stack of trays into something inhabited',
  },
  terrace: {
    depth: 1.20, label: 'roof garden', cover: 0.40,      // a roof GARDEN is mostly paving. Covering the whole plate a metre deep is not a garden, it is a field on the roof, and it weighs what a field weighs
    onGrade: false,
    note: 'a garden rather than a green roof — the parti asked for this one, so it gets the substrate a tree actually needs and the slab underneath has to have been designed for it',
  },
  court: {
    depth: 0.90, label: 'court planting', cover: 0.60,      // a court is planting round a floor, not instead of one
    onGrade: false,
    note: 'the cloister’s court: enclosed, sheltered on every side, and the one place on a building where a fern will survive',
  },
  grove: {
    depth: 1.50, label: 'grove at grade', cover: 0.50,      // trees with space to walk between them, which is what makes it a grove rather than a thicket
    onGrade: true,
    note: 'under the pilotis, on the ground. The only planting on the whole building that weighs nothing as far as the structure is concerned, and therefore the only place a large tree is free',
  },
};

// Total plants a building may carry. A mature tree is six hundred segments and
// a roof will happily take twenty of them, so the bench needs a ceiling for the
// same reason the manifold needs a node budget.
export const PLANT_BUDGET = 54;

// A crude wind profile, used ONLY to keep placement sensible — a fern on a
// parapet at sixty metres is not a check failure waiting to happen, it is a
// silly thing to have drawn. The real gust comes from the hazard and the real
// verdict comes from `plant.check()`, which runs later and knows it.
export function meanWindAt(height) {
  return 7 + 0.11 * Math.max(0, height);
}

/* ═══════════════════════════ the sites, in order ═══════════════════════════ */

const topOf = (b) => b.levels.reduce((m, L) => Math.max(m, L.y + L.h), 0);

export function plantingSites(p, b, parti) {
  const out = [];
  const memes = (parti && parti.memes) || [];
  const decks = roofDecks(b);

  for (const dk of decks) {
    const L = b.levels[dk.level];
    // a terrace the parti NAMED is a garden; a plate left over by a setback is
    // a green roof; the very top is a roof unless the parti says otherwise
    const kind = L && L.terrace ? 'terrace' : (dk.top ? 'roof' : 'setback');
    // A CLIMBER IS NOT A SELF-SUPPORTING PLANT. It needs a wall, and the only
    // wall a terrace has is the face of whatever stands on the rest of the
    // plate — so a top roof has none at all, and a setback has exactly as much
    // as the building above it. Without this a 450 mm planter grew a
    // ten-metre free-standing climber, which is not a plant, it is a mast.
    const climb = dk.top ? 0 : r2(Math.max(0, topOf(b) - dk.roofY));
    for (const r of dk.exposed) {
      if (R.area(r) < 9) continue;                    // smaller than a room is not a garden
      out.push({
        kind, level: dk.level, y: dk.roofY,
        // inset from the parapet, because a planter hard against an upstand has
        // nowhere for water to go and nobody can get round it to prune
        x: r.x, z: r.z, w: r2(Math.max(0, r.w - 1.6)), d: r2(Math.max(0, r.d - 1.6)),
        exposure: 'open', climb,
      });
    }
  }

  // THE UNDERCROFT'S GROVE — at grade, so it costs the structure nothing, and
  // under a soffit, so everything in it grows clipped. Both facts matter and
  // both come out of the same meme.
  if (memes.includes('undercroft') && b.levels[0]) {
    const L0 = b.levels[0];
    for (const wg of L0.wings) {
      if (R.area(wg) < 40) continue;
      out.push({
        kind: 'grove', level: 0, y: 0,
        x: wg.x, z: wg.z, w: r2(wg.w - 2.4), d: r2(wg.d - 2.4),
        exposure: 'soffit', clear: L0.h - 0.6, climb: r2(L0.h - 0.6),
      });
    }
  }

  // THE CLOISTER'S COURT — the void the meme cut, planted. Sheltered on four
  // sides, which is the one condition on a building where a fern will live.
  if (memes.includes('cloister')) {
    for (const L of b.levels) {
      for (const v of (L.voids || [])) {
        if (!v.parti || R.area(v) < 12) continue;
        out.push({
          kind: 'court', level: L.index, y: L.y,
          x: v.x, z: v.z, w: r2(v.w - 1.0), d: r2(v.d - 1.0),
          exposure: 'court', climb: r2(Math.max(0, topOf(b) - L.y)),
        });
        break;                                        // one court, not one per level
      }
      if (out.some((q) => q.kind === 'court')) break;
    }
  }

  return out.filter((q) => q.w > 1.2 && q.d > 1.2);
}

/* ═══════════════════════════════ the planting ══════════════════════════════ */

// THE LOAD IS AN ALLOMETRIC QUANTITY; THE GEOMETRY IS A GROWTH ONE. Growing a
// crown costs about a hundred milliseconds a building, and the roller generates
// forty of them per roll — so a roll that had to grow every tree would take four
// seconds to answer. It does not have to: the mass, the spread and the sail
// area all come from the allometry, and the skeleton is only needed by something
// that is going to draw it. `geometry: false` is the same planting with the
// trees left un-grown, and it is what the solver and the roller use.
function plantSpec(sp, o = {}) {
  const S = SPECIES[sp];
  const height = o.height != null ? o.height : (S.h[0] + S.h[1]) / 2;
  const dbh = dbhFor(sp, height);
  const spread = crownFor(sp, dbh);
  const crownH = Math.max(0.1, height * (S.kind === 'tree' ? 0.62 : 0.88));
  return {
    species: sp, label: S.label, kind: S.kind, height: r2(height), dbh,
    spread: r2(spread), evergreen: S.evergreen,
    // the same domain guard the growth path uses: a mat is weighed by area
    freshMass: SPECIES[sp].kgPerM2 != null
      ? Math.round(SPECIES[sp].kgPerM2 * Math.PI * (spread / 2) * (spread / 2) * 1000) / 1000
      : Math.round(freshMass(sp, dbh, height) * 1000) / 1000,
    crownArea: r2(Math.PI * (spread / 2) * (spread / 2)),
    frontalArea: r2(Math.PI * (spread / 2) * (crownH / 2)),
  };
}

export function placePlanting(p, b, parti, o = {}) {
  const geometry = o.geometry !== false;
  const rnd = o.rnd || Rand(p.seed, 'planting');
  const sites = plantingSites(p, b, parti);
  const planters = [];
  let budget = o.budget != null ? o.budget : PLANT_BUDGET;

  // THE BUDGET IS SHARED, NOT SPENT FIRST-COME. Sorting biggest-first and
  // taking until it ran out gave every building exactly one planter: a single
  // roof garden swallowed all fifty-four plants and every setback terrace below
  // it came back bare — which loses the stepped, planted section that is the
  // whole ecobrutalist form. Each site gets a share of the budget in proportion
  // to its area, and at least enough to read as planted at all.
  sites.sort((a, c) => (c.w * c.d) - (a.w * a.d));
  const totalArea = sites.reduce((a, q) => a + q.w * q.d, 0) || 1;
  const share = new Map(sites.map((q) => [q,
    Math.max(3, Math.round(budget * ((q.w * q.d) / totalArea)))]));

  // the ambition multiplier: 1 is what each site type asks for, 0 is a building
  // with nothing growing on it, and everything between is a real design choice
  const green = p.green != null ? p.green : 1;
  if (green <= 0) return [];

  for (const site of sites) {
    const S = SITES[site.kind];
    const depth = r2(S.depth * green);
    // and a planter covers a FRACTION of the deck it is on, because the rest of
    // it is where anybody stands
    const cover = S.cover != null ? S.cover : 0.6;
    const k = Math.sqrt(cover);
    site.w = r2(site.w * k); site.d = r2(site.d * k);
    const band = soilFor(depth);
    if (!band) continue;

    // what will grow here: the band's palette, less anything the wind at this
    // height will kill, less anything that wants shade unless this is shade
    const wind = site.exposure === 'court' || site.exposure === 'soffit'
      ? 8 : meanWindAt(site.y);
    const climb = site.climb || 0;
    const palette = band.palette
      .filter((sp) => SPECIES[sp])
      .filter((sp) => SPECIES[sp].wind >= wind)
      .filter((sp) => SPECIES[sp].soil <= depth + 1e-9)
      // nothing that has to climb goes anywhere there is nothing to climb
      .filter((sp) => SPECIES[sp].kind !== 'climber' || climb >= 2);
    if (!palette.length) continue;

    const plants = [];
    // SPACING IS THE MATURE SPREAD, not a pretty grid. A tree planted at half
    // its own crown diameter is a tree that will be cut down in ten years, and
    // spacing off the allometry is the only way the drawing and the fifteen-
    // year photograph agree.
    const lead = palette[palette.length - 1];                 // the biggest thing here
    const leadH = (SPECIES[lead].h[0] + SPECIES[lead].h[1]) / 2;
    const spread = Math.max(0.6, crownFor(lead, dbhFor(lead, leadH)));
    const pitch = spread * 1.15;
    const nx = Math.max(1, Math.floor(site.w / pitch));
    const nz = Math.max(1, Math.floor(site.d / pitch));
    const gx = site.w / nx, gz = site.d / nz;

    // THIN, DO NOT TRUNCATE. When the grid has more cells than this site's
    // share, taking the first N plants leaves one corner of a terrace forested
    // and the rest of it bare. Keeping every k-th cell spreads the same number
    // of plants over the whole planter, which is what a thinned planting looks
    // like and what a landscape architect would have drawn.
    const mine = Math.min(share.get(site) || 3, budget);
    const cells = nx * nz;
    const keepEvery = cells > mine ? cells / mine : 1;
    let cell = -1, taken = 0;

    for (let i = 0; i < nx && budget > 0 && taken < mine; i++) {
      for (let k = 0; k < nz && budget > 0 && taken < mine; k++) {
        cell++;
        // one cell kept per bucket of `keepEvery`, so the survivors are spread
        // evenly across the whole grid rather than clustered at its start
        if (keepEvery > 1 && Math.floor(cell / keepEvery) === Math.floor((cell - 1) / keepEvery)) continue;
        // a seeded gap now and then, because a planter with every cell filled
        // reads as a car park for trees
        if (rnd.chance(0.18)) continue;
        const sp = rnd.pick(palette);
        const px = R.x0(site) + (i + 0.5) * gx + rnd.range(-gx * 0.12, gx * 0.12);
        const pz = R.z0(site) + (k + 0.5) * gz + rnd.range(-gz * 0.12, gz * 0.12);

        // THE ENVELOPE IS WHERE THE ARCHITECTURE SHAPES THE PLANT. A soffit
        // above truncates the crown; the edge of a terrace makes it grow
        // inward. Neither is a scaled tree.
        const clear = site.clear != null ? site.clear : Infinity;
        const nearEdge = (px - R.x0(site)) < spread * 0.4 ? 'x+'
          : (R.x1(site) - px) < spread * 0.4 ? 'x-'
            : (pz - R.z0(site)) < spread * 0.4 ? 'z+'
              : (R.z1(site) - pz) < spread * 0.4 ? 'z-' : null;

        // a climber is as tall as what it is climbing, capped by what the
        // species will actually manage
        const capH = SPECIES[sp].kind === 'climber'
          ? Math.min(SPECIES[sp].h[1], Math.max(SPECIES[sp].h[0], climb * 0.85))
          : undefined;
        const spec = plantSpec(sp, { height: capH });
        const tree = geometry ? grow(sp, {
          seed: `${p.seed}:${site.kind}:${site.level}:${i}:${k}`,
          height: capH,
          clear: Number.isFinite(clear) ? clear : undefined,
          half: nearEdge,
          detail: SPECIES[sp].kind === 'tree' ? 110 : 60,
        }) : null;
        // when the crown was actually grown, its OWN dimensions win — a tree
        // clipped by a soffit really is lighter, and taking the allometric mass
        // there would charge the structure for a tree that was never built
        plants.push({
          species: sp, x: r2(px), z: r2(pz), tree,
          height: tree ? tree.height : spec.height,
          spread: tree ? tree.spread : spec.spread,
          freshMass: tree ? tree.freshMass : spec.freshMass,
          frontalArea: tree ? tree.frontalArea : spec.frontalArea,
        });
        budget--; taken++;
      }
    }
    if (!plants.length) continue;

    // WHAT IT WEIGHS. Saturated substrate over the whole planter, plus the
    // fresh mass of everything in it — and `onGrade` decides whether any of
    // that reaches a slab at all.
    const area = site.w * site.d;
    const soilPa = soilLoad(depth);
    const plantN = plants.reduce((a, q) => a + q.freshMass * 9.81, 0);
    const totalPa = soilPa + plantN / Math.max(1, area);

    planters.push({
      kind: site.kind, label: S.label, note: S.note,
      level: site.level, y: r2(site.y), onGrade: !!S.onGrade,
      x: r2(site.x), z: r2(site.z), w: r2(site.w), d: r2(site.d),
      depth, band: band.label, palette,
      area: r2(area), plants,
      // in Pa, and it is the number the structural model has to be given
      soilPa: r2(soilPa), plantPa: r2(plantN / Math.max(1, area)), loadPa: r2(totalPa),
      // the same in tonnes, because that is the number anybody believes
      tonnes: r2((totalPa * area) / 9810),
      exposure: site.exposure, climb: site.climb != null ? r2(site.climb) : 0,
      windMean: r2(site.exposure === 'court' || site.exposure === 'soffit' ? 8 : meanWindAt(site.y)),
    });
  }

  return planters;
}

/* ═══════════════════════════ what it does to the frame ═════════════════════
   The load, per level, in the form the structural model wants: a superimposed
   DEAD load, because saturated soil is permanently there and calling it live
   would let the code's own load factors discount it. Planting at grade is
   excluded — it is on the ground, and the ground was already carrying it. */

export function plantingLoads(planters) {
  const byLevel = new Map();
  let onGrade = 0;
  for (const q of planters) {
    if (q.onGrade) { onGrade += q.tonnes; continue; }
    const e = byLevel.get(q.level) || { level: q.level, N: 0, area: 0, tonnes: 0 };
    e.N += q.loadPa * q.area;                         // newtons on this plate
    e.area += q.area;
    e.tonnes += q.tonnes;
    byLevel.set(q.level, e);
  }
  return {
    byLevel: [...byLevel.values()].sort((a, b) => a.level - b.level),
    carried: r2([...byLevel.values()].reduce((a, e) => a + e.tonnes, 0)),
    onGrade: r2(onGrade),
  };
}

/* ═════════════════════════════ the schedule ════════════════════════════════ */

export function plantingSchedule(planters) {
  const bySpecies = new Map();
  let area = 0, tonnes = 0, soilM3 = 0, carried = 0;
  for (const q of planters) {
    area += q.area;
    tonnes += q.tonnes;
    soilM3 += q.area * q.depth;
    if (!q.onGrade) carried += q.tonnes;
    for (const pl of q.plants) {
      const e = bySpecies.get(pl.species) || { species: pl.species, label: SPECIES[pl.species].label, count: 0, mass: 0 };
      e.count++; e.mass += pl.freshMass;
      bySpecies.set(pl.species, e);
    }
  }
  return {
    planters: planters.length,
    area: r2(area), tonnes: r2(tonnes), carried: r2(carried),
    substrate: r2(soilM3),
    // a green roof retains most of a rainfall event, which is the actual civic
    // reason cities subsidise them — and a number a schedule should carry
    retentionM3: r2(area * 0.03),
    species: [...bySpecies.values()].map((e) => ({ ...e, mass: r2(e.mass) })).sort((a, b) => b.count - a.count),
    plants: [...bySpecies.values()].reduce((a, e) => a + e.count, 0),
  };
}

/* ═══════════════════════════════ the checks ════════════════════════════════
   Run per planter against the REAL hazard, so the wind is the design gust
   rather than the placement proxy — which is why placement is allowed to be
   approximate and this is not. */

export function checkPlanting(planters, o = {}) {
  const { gust = 22, slabCapacity = null, inLeaf = true } = o;
  const out = [];
  for (const q of planters) {
    const worst = q.plants.reduce((a, pl) => {
      const d = dragOn(pl.tree || pl, q.onGrade ? gust * 0.55 : gust, { inLeaf });
      return d.force > (a ? a.force : 0) ? d : a;
    }, null);
    const overWind = q.plants.some((pl) => SPECIES[pl.species].wind < (q.onGrade ? gust * 0.55 : gust));
    out.push({
      planter: q,
      wind: worst,
      pass: !overWind && (slabCapacity == null || q.onGrade || q.loadPa <= slabCapacity),
      overWind,
      overLoad: slabCapacity != null && !q.onGrade && q.loadPa > slabCapacity,
    });
  }
  return out;
}
