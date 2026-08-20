// game.js — the same four cilia, but now they cost something.
//
// /qwop/ is a sprint: get down the course, do not get eaten. This is the other
// half of the animal's life. Beating burns ATP, ATP is what you are out here
// to collect, and the only way to collect it is to beat. That circle is the
// whole game.
//
// It is built to make one thing HAPPEN rather than be asserted. The paper says
// a real Pterosperma is stopped 96.6% of the time and reads it as a
// sit-and-wait animal — in /qwop/ that is a fact printed on a panel. Here
// nothing sets it. Three pressures push on the same lever:
//
//   BEATING COSTS ATP. The dominant term in the energy budget by a long way.
//   Idling costs almost nothing.
//   BEATING SUMMONS PREDATORS. Same hydrodynamic signature as /qwop/.
//   BEATING SCATTERS YOUR FOOD. Small flagellates feel the flow of a hunting
//   cell and bolt. The louder you are, the further they scatter.
//
// So a cell that sprints constantly starves, gets eaten, and finds its prey
// already gone. The optimum should be mostly-stopped with short committed
// dashes — and the selftest measures the stopped fraction of the best policy
// it can find rather than taking my word for it.
//
// WHAT IS INVENTED. The paper is about locomotion and behaviour; it says
// nothing about diet. Pterosperma is a prasinophyte — an alga, a phototroph —
// so the photosynthesis half of the energy budget is in character, and the
// exponential fall of light with depth is Beer-Lambert and real. The grazing
// half is not: mixotrophy is common among flagellates but is not something
// this paper or, as far as I know, anyone has shown for this genus. Treat it
// as a what-if built on a real swimmer, and see `../qwop/README.md` for the
// pieces of the cell itself that are measured.
//
// The cell is imported wholesale from ../qwop/game.js — same four detuned
// cilia, same bundling, same steering, not one line re-implemented.

import {
  createCell, tickCell, setKey, PREDATOR_KINDS as QWOP_PREDATORS,
} from '../qwop/game.js';

// The same three hunters, but they forget faster here. /qwop/ is a chase down a
// corridor where a long memory is the whole threat; this is a standing fight in
// open water, and if a predator remembers you for six seconds then going quiet
// buys nothing and the stealth layer is decoration. Overridden locally rather
// than edited in /qwop/, whose balance is measured and shipped.
export const PREDATOR_KINDS = Object.fromEntries(
  Object.entries(QWOP_PREDATORS).map(([k, v]) => [k, { ...v, patience: v.patience * 0.55 }]));

export { KEYS, ciliumPath } from '../qwop/game.js';

const TWO_PI = Math.PI * 2;

// ------------------------------------------------------------- the ocean --
// x runs forever; y is depth, 0 at the surface. Light falls off exponentially
// going down, which is Beer-Lambert and the one piece of environmental physics
// here that is not invented.

export const SURFACE_Y = 0;
export const DEPTH_Y = 1500;             // um; the floor of the playable column
const LIGHT_ATTENUATION_UM = 520;        // e-folding depth of the light

// The depth at which light income exactly cancels basal cost. Above it a
// motionless cell slowly gains; below it, it slowly loses however patient it
// is. A real quantity in ocean biology, and the spine of this map.
export function compensationDepth() {
  return SURFACE_Y + LIGHT_ATTENUATION_UM * Math.log(LIGHT_GAIN / BASAL_DRAIN);
}

export function lightAt(y) {
  const d = Math.max(0, y - SURFACE_Y);
  return Math.exp(-d / LIGHT_ATTENUATION_UM);
}

// ------------------------------------------------------------- the budget --
// One bucket, in units where 1.0 is a full cell ready to divide. Everything is
// per second. These four numbers are the whole economy and the selftest is
// what sets them: they are tuned until an energy-aware forager beats both a
// sprinter and a rock, and until the stopped fraction of the best policy lands
// near what the paper reports.

// One knob for how fast the clock runs. It multiplies the per-second RATES and
// nothing else, so every ratio among them — and the compensation depth, which
// is a ratio of two of them — is untouched, and so is the strategy ordering the
// selftest measures. At 1.0 a good run took nearly six minutes to divide once,
// which is a scoreboard that never moves.
//
// It deliberately does NOT scale the meals. A meal is a fraction of the bucket,
// not a rate, and multiplying it too made one swarmer worth two entire
// divisions — at which point a cell that sprinted blindly into three of them
// out-scored every careful strategy before dying, and the whole point of the
// variant was gone.
const PACE = 2.5;

const BASAL_DRAIN = 0.0055 * PACE;   // just being alive
const BEAT_DRAIN = 0.022 * PACE;     // at full four-cilium drive — 4x basal
const LIGHT_GAIN = 0.010 * PACE;     // in full surface light, doing nothing
const PREY_ENERGY = { mote: 0.120, swarmer: 0.400 };

// Light is SUBSISTENCE, not a living: at the surface doing nothing you gain
// 0.0035/s net, which is one division every three minutes. The depth where
// LIGHT_GAIN * exp(-d/attenuation) falls to BASAL_DRAIN is the COMPENSATION
// DEPTH — a real quantity in ocean biology, the level below which a phototroph
// cannot break even however still it holds. Here it lands around 256 um, and
// it is the spine of the map: above it you can wait, below it the clock runs. Prey is where growth
// actually comes from. That split is what stops "float at the surface and wait"
// from being the whole game, and it is why depth is a decision — light is up,
// and so is everything that eats you.
//
// The two pressures do separate jobs, and an earlier balance had the beat cost
// trying to do both. ENERGY is what makes you need to eat: it makes long
// sprints expensive but it is not what kills you. PREDATORS are what punish
// noise. When the beat cost was doing both, the only survivable strategy was
// total stillness — the rock beat every forager in the sweep — which is the
// paper's number arrived at for entirely the wrong reason, and a game with
// nothing in it.

// The cilia generate a feeding current — 67 um oars sweep water past the
// groove — so the cell gathers from further out than its own 4 um body.
const FEED_RADIUS_UM = 24;

// Photosynthesis alone cannot fill the bucket. Above this level the light
// stops paying and the rest has to be eaten.
//
// This is NUTRIENT LIMITATION, and it is the least arbitrary thing in the
// budget: sunlit surface water is famously the nutrient-poor part of the ocean,
// which is exactly why so many flagellates there are mixotrophs — they are not
// short of light, they are short of the nitrogen and phosphorus that light
// cannot supply. Without this ceiling the whole prey layer is decoration:
// every version of the balance without it was won by a cell that climbed into
// the light and then simply held still, eating nothing at all, which the
// sweep duly reported as `ate 0.0`.
const PHOTO_CEILING = 0.74;

const DIVIDE_AT = 1.0;
const AFTER_DIVIDE = 0.55;       // each daughter keeps a bit over half
const STARVE_SECS = 12;          // at zero ATP, how long before the lights go out

// ------------------------------------------------------------------ prey --
// Two kinds, distinguished by whether they can feel you coming.

export const PREY_KINDS = {
  // Marine snow and bacteria. Drifts, cannot sense anything, easy.
  mote: { r: 5, drift: 8, flee: 0, speed: 0, color: '#9fd8b0' },
  // A small flagellate. Feels the flow of a beating cell and bolts — the
  // louder you are, the further out it starts running.
  // Flees at 95 um/s against a cell that makes ~154, so a chase closes at only
  // 60 um/s and a long pursuit costs more ATP than the meal is worth. That is
  // deliberate and it is the shape of the whole game: swarmers cannot be run
  // down, they have to be AMBUSHED — sat still for until one drifts inside the
  // burst range, because they only start running when they hear you.
  swarmer: { r: 8, drift: 18, flee: 240, speed: 95, color: '#7ad0e0' },
};

function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// How much water we keep populated around the cell. Anything outside is
// deleted and re-seeded at the far edge, so density stays constant however far
// the cell wanders and the arrays never grow.
const WINDOW_UM = 1100;
const PREY_TARGET = 55;
const PREDATOR_TARGET = 2;

export function createOcean(seed = 11) {
  return { rng: mulberry32(seed), prey: [], predators: [] };
}

function seedOne(ocean, cell, minRad, edgeOnly) {
  const rng = ocean.rng;
  // Place inside the window, or on its rim if we are topping up during play.
  // `minRad` keeps a spawn off the player's lap: the very first restock fills
  // the whole disc, and with sqrt() sampling that put a predator within a few
  // microns of the cell often enough to end runs in four seconds before the
  // player had touched a key.
  const ang = rng() * TWO_PI;
  const rad = edgeOnly
    ? WINDOW_UM * (0.85 + rng() * 0.15)
    : minRad + (WINDOW_UM - minRad) * Math.sqrt(rng());
  const x = cell.x + Math.cos(ang) * rad;
  let y = cell.y + Math.sin(ang) * rad;
  if (y < SURFACE_Y + 40) y = SURFACE_Y + 40 + rng() * 200;
  if (y > DEPTH_Y - 40) y = DEPTH_Y - 40 - rng() * 200;
  return { x, y, rng: rng() };
}

export function restock(ocean, cell, first = false) {
  const rng = ocean.rng;
  // Cull anything that has fallen out of the window.
  for (const arr of [ocean.prey, ocean.predators]) {
    for (let i = arr.length - 1; i >= 0; i--) {
      if (Math.hypot(arr[i].x - cell.x, arr[i].y - cell.y) > WINDOW_UM * 1.25) arr.splice(i, 1);
    }
  }
  while (ocean.prey.length < PREY_TARGET) {
    const kind = rng() < 0.5 ? 'mote' : 'swarmer';
    const spec = PREY_KINDS[kind];
    const p = seedOne(ocean, cell, 70, !first);
    // Food concentrates in the photic zone, as it does in a real water column —
    // the things a mixotroph grazes are themselves living on the light. This is
    // what makes one position good for two reasons at once: without it the cell
    // parks in the light and finds nothing to eat there, which is exactly what
    // the sweep measured (`ate 0.5` while sitting at the surface for two
    // minutes) before the bias existed.
    const y = rng() < 0.68
      ? SURFACE_Y + rng() * (DEPTH_Y * 0.35)
      : p.y;
    ocean.prey.push({ kind, spec, x: p.x, y, vx: 0, vy: 0, phase: p.rng * TWO_PI });
  }
  while (ocean.predators.length < PREDATOR_TARGET) {
    const roll = rng();
    const kind = roll > 0.80 ? 'arrow' : roll > 0.45 ? 'medusa' : 'copepod';
    const spec = PREDATOR_KINDS[kind];
    const p = seedOne(ocean, cell, 560, !first);
    // Hunters concentrate where the food is, which is the lit water near the
    // surface. That is what makes depth a real decision rather than a slider:
    // light is up, and so is everything that wants to eat you.
    let y = rng() < 0.62 ? SURFACE_Y + rng() * (DEPTH_Y * 0.45) : p.y;
    // Biasing y toward the lit water throws away the minimum distance seedOne
    // just guaranteed, so re-impose it: push the whole point radially out if
    // the new depth has brought it too close.
    let px = p.x;
    const dx = px - cell.x, dy = y - cell.y;
    const d = Math.hypot(dx, dy);
    if (d < 560) {
      const k = 560 / (d || 1);
      px = cell.x + dx * k;
      y = cell.y + dy * k;
    }
    ocean.predators.push({
      kind, spec, x: px, y, vx: 0, vy: 0, homeY: y,
      phase: p.rng * TWO_PI, alerted: 0,
    });
  }
}

// ------------------------------------------------------------- the player --

export function createGame(opts = {}) {
  const cell = createCell({ beatScale: opts.beatScale ?? 10 });
  cell.x = 0;
  // BELOW the compensation depth, and that placement is the whole design. A
  // cell that never moves cannot break even down here however patient it is,
  // so movement is not an optional flourish for the greedy — it is how you get
  // to the light at all. Start above it and holding perfectly still becomes a
  // winning strategy, which is the paper's 96.6% arrived at for entirely the
  // wrong reason and a game with nothing in it. (Measured: with the start at
  // 300 um, above the compensation depth, a motionless cell out-grew every
  // forager in the sweep.)
  cell.y = 560;
  const ocean = createOcean(opts.seed ?? 11);
  restock(ocean, cell, true);
  return {
    cell, ocean,
    energy: 0.55,
    startEnergy: 0.55,
    divisions: 0,
    eaten: { mote: 0, swarmer: 0 },
    starveFor: 0,
    elapsed: 0,
    // Rolling record of how much of the run has been spent with the cilia
    // quiet. The number this converges on is the whole point of the variant.
    quietSecs: 0,
    over: false, cause: null,
    best: opts.best ?? 0,
    // Last-frame readouts, for the HUD.
    burn: 0, gain: 0,
    justDivided: 0, justAte: 0,
  };
}

// The energy gate. Rather than reach into the cell and mute it — which would
// mean editing the model /qwop/ is using — the input is applied here every
// frame from the page's own held-key array, and simply not applied when the
// bucket is empty. Idempotent: setKey only restarts a stroke on a rising edge,
// so calling it every frame with an unchanged value does nothing. It also
// means the cilia pick straight back up the instant a mouthful lands, without
// the player having to re-press anything.
export function applyInput(game, held) {
  const empty = game.energy <= 0;
  for (let i = 0; i < 4; i++) setKey(game.cell, i, empty ? false : !!held[i]);
}

export function tickGame(game, dt, held) {
  if (game.over) return;
  const { cell, ocean } = game;

  if (held) applyInput(game, held);
  tickCell(cell, dt);

  // Depth is bounded; the surface is a hard ceiling and the column has a floor.
  if (cell.y < SURFACE_Y + 6) cell.y = SURFACE_Y + 6;
  if (cell.y > DEPTH_Y - 6) cell.y = DEPTH_Y - 6;

  game.elapsed += dt;
  game.justDivided = Math.max(0, game.justDivided - dt);
  game.justAte = Math.max(0, game.justAte - dt);

  // --- the budget ------------------------------------------------------
  const effort = cell.cilia.reduce((s, c) => s + c.drive, 0) / 4;
  const burn = BASAL_DRAIN + BEAT_DRAIN * effort;
  const gain = game.energy < PHOTO_CEILING ? LIGHT_GAIN * lightAt(cell.y) : 0;
  game.burn = burn; game.gain = gain;
  game.energy += (gain - burn) * dt;
  if (effort < 0.12) game.quietSecs += dt;

  if (game.energy <= 0) {
    game.energy = 0;
    game.starveFor += dt;
    if (game.starveFor >= STARVE_SECS) { game.over = true; game.cause = 'starved'; }
  } else {
    game.starveFor = 0;
  }

  // A while loop, not an if: one very large meal can carry the cell through
  // more than one division, and dropping the extra would quietly lose it.
  while (game.energy >= DIVIDE_AT) {
    game.divisions++;
    game.energy -= (DIVIDE_AT - AFTER_DIVIDE);
    game.justDivided = 1.2;
    game.best = Math.max(game.best, game.divisions);
  }

  tickPrey(game, dt);
  tickHunters(game, dt);
  restock(ocean, cell);
}

const BODY_R = 4.05;   // um, the cell's own radius — matches qwop's collisions

function tickPrey(game, dt) {
  const { cell, ocean } = game;
  for (let i = ocean.prey.length - 1; i >= 0; i--) {
    const p = ocean.prey[i];
    const dx = cell.x - p.x, dy = cell.y - p.y;
    const dist = Math.hypot(dx, dy) || 1e-6;

    // Swarmers feel the flow and run. Range scales with how loud the cell is,
    // so the same signature that calls the predators in also empties the table
    // in front of you — one number, two punishments, both pointing at quiet.
    if (p.spec.flee > 0) {
      const notice = p.spec.flee * (0.10 + 0.90 * cell.signature);
      if (dist < notice) {
        p.vx = -(dx / dist) * p.spec.speed;
        p.vy = -(dy / dist) * p.spec.speed;
      } else {
        p.phase += dt * 1.1;
        p.vx = Math.cos(p.phase) * p.spec.drift;
        p.vy = Math.sin(p.phase * 0.7) * p.spec.drift;
      }
    } else {
      p.phase += dt * 0.5;
      p.vx = Math.cos(p.phase) * p.spec.drift * 0.5;
      p.vy = Math.sin(p.phase * 0.8) * p.spec.drift * 0.5 + 4; // snow sinks
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.y < SURFACE_Y + 4) p.y = SURFACE_Y + 4;
    if (p.y > DEPTH_Y - 4) p.y = DEPTH_Y - 4;

    if (dist < p.spec.r + FEED_RADIUS_UM) {
      // NOT clamped to DIVIDE_AT. Clamping to exactly the threshold meant the
      // next tick's basal burn was subtracted before the division check ran,
      // leaving the cell a hair under the line every single time — divisions
      // were silently impossible for as long as that clamp was there, and the
      // sweep reported 0.00 across every strategy without ever explaining why.
      game.energy += PREY_ENERGY[p.kind];
      game.eaten[p.kind]++;
      game.justAte = 0.5;
      ocean.prey.splice(i, 1);
    }
  }
}

function tickHunters(game, dt) {
  const { cell, ocean } = game;
  for (const h of ocean.predators) {
    const dx = cell.x - h.x, dy = cell.y - h.y;
    const dist = Math.hypot(dx, dy) || 1e-6;
    const heard = h.spec.hearing * (0.16 + 0.84 * cell.signature);
    if (dist < heard) h.alerted = h.spec.patience;
    else h.alerted = Math.max(0, h.alerted - dt);

    if (h.alerted > 0 && !game.over) {
      h.vx = (dx / dist) * h.spec.chase;
      h.vy = (dy / dist) * h.spec.chase;
    } else {
      h.phase += dt * 0.6;
      h.vx = Math.cos(h.phase) * h.spec.cruise * 0.6;
      h.vy = Math.sin(h.phase * 1.3) * h.spec.cruise * 0.4 + (h.homeY - h.y) * 0.35;
    }
    h.x += h.vx * dt;
    h.y += h.vy * dt;
    if (h.y < SURFACE_Y + 10) h.y = SURFACE_Y + 10;
    if (h.y > DEPTH_Y - 10) h.y = DEPTH_Y - 10;

    if (!game.over && dist < h.spec.r + BODY_R * 2.2) {
      game.over = true;
      game.cause = h.kind;
    }
  }
}

// Fraction of the run spent with the cilia effectively still. This is the
// number the whole variant exists to produce: nothing sets it, it is whatever
// the player's strategy comes out at, and the paper's cell sits at 0.966.
// Net growth over the run, in bucket units: what the cell actually banked,
// divisions included. Divisions alone are too coarse to compare strategies on
// — a run can be clearly better and still show the same integer.
export function biomass(game) {
  return game.divisions * (DIVIDE_AT - AFTER_DIVIDE) + (game.energy - game.startEnergy);
}

export function quietFraction(game) {
  return game.elapsed > 0 ? game.quietSecs / game.elapsed : 0;
}

export const BUDGET = {
  BASAL_DRAIN, BEAT_DRAIN, LIGHT_GAIN, PREY_ENERGY,
  DIVIDE_AT, AFTER_DIVIDE, STARVE_SECS, FEED_RADIUS_UM, PHOTO_CEILING,
};
