// bees/hazard.js — the AUTHORITATIVE swarm-hazard model. Pure, deterministic, no DOM.
//
// This is the half of the swarm that touches game state, and it is DELIBERATELY NOT the boids.
// In hoop the individual bees are cosmetic (like a resident's sepx/sepy render offset); only this
// small aggregate decides damage. Everything here is dt-independent and seeded, so it drops onto
// hoop's deterministic clock (one stepTo() per walked tile, the same cadence as sim.js
// tickSurvival(s, tiles)) and reproduces identically from (seed, player path).
//
// Drop-in shape for hoop/v098/sim.js:
//   const hz = new SwarmHazard({ seed:'hive@chunk', cx, cy, world });
//   // inside tickSurvival, once per walked tile:
//   const { damage } = hz.stepTo(px(), py());
//   health = clampHealth(health - damage);
//
// The boids (bees/swarm.js Swarm) are then pointed at hz.cx/hz.cy purely for the picture.

import { xmur3, mulberry32 } from '../sprite/core.js';

const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;

export const HAZARD_DEFAULTS = {
  baseIntensity: 0.35,   // resting density (idle cloud, mild)
  maxIntensity: 1.0,     // fully roused
  radius: 26,            // world-units; the gaussian sigma of the danger field
  aggroRadius: 70,       // player nearer than this rouses the swarm
  calmRadius: 130,       // player further than this lets aggro lapse
  stickySteps: 6,        // steps aggro persists after the player breaks line
  homeSpeed: 2.2,        // world-units/step drifting back to the hive when calm
  chaseSpeed: 4.4,       // world-units/step pursuing the player when roused
  wander: 1.6,           // seeded per-step jitter on the centroid
  rampUp: 0.18,          // intensity gained per step while roused
  rampDown: 0.06,        // intensity shed per step while calm
  damageScale: 9,        // peak damage/step at the dead centre, full intensity
};

export class SwarmHazard {
  constructor(opts = {}) {
    const o = { ...HAZARD_DEFAULTS, ...opts };
    this.o = o;
    this.seed = opts.seed || 'hive:0';
    this.world = opts.world || { w: 320, h: 220 };
    this.home = { x: opts.cx ?? this.world.w * 0.5, y: opts.cy ?? this.world.h * 0.5 };
    this.cx = this.home.x; this.cy = this.home.y;     // authoritative centroid
    this.intensity = o.baseIntensity;                  // authoritative mass/density 0..1
    this.aggro = 0;                                    // sticky-step counter (>0 = roused)
    this.step = 0;
    this._rng = mulberry32(xmur3(this.seed)());        // one seeded stream, advanced per step
  }

  // gaussian density at a world point, scaled by current intensity → the field combat samples.
  density(x, y) {
    const dx = x - this.cx, dy = y - this.cy, r = this.o.radius;
    return this.intensity * Math.exp(-(dx * dx + dy * dy) / (2 * r * r));
  }

  // ONE authoritative step, driven by a discrete player move (per tile). Returns the damage to
  // apply this step + telemetry. Deterministic: identical call sequence ⇒ identical result.
  stepTo(playerX, playerY) {
    const o = this.o, rng = this._rng;
    this.step++;

    const dpx = playerX - this.cx, dpy = playerY - this.cy;
    const distToPlayer = Math.hypot(dpx, dpy);

    // aggro state machine — rouse near, lapse far, sticky in between
    if (distToPlayer < o.aggroRadius) this.aggro = o.stickySteps;
    else if (distToPlayer > o.calmRadius && this.aggro > 0) this.aggro--;
    else if (this.aggro > 0) this.aggro--;
    const roused = this.aggro > 0;

    // intensity ramps toward max when roused, decays toward base otherwise
    const target = roused ? o.maxIntensity : o.baseIntensity;
    this.intensity += clamp(target - this.intensity, -o.rampDown, o.rampUp);
    this.intensity = clamp(this.intensity, 0, o.maxIntensity);

    // centroid pursues the player when roused, else drifts home; + seeded wander
    const tgt = roused ? { x: playerX, y: playerY } : this.home;
    const tdx = tgt.x - this.cx, tdy = tgt.y - this.cy, td = Math.hypot(tdx, tdy) || 1e-3;
    const sp = roused ? o.chaseSpeed : o.homeSpeed;
    const moveBy = Math.min(sp, td); // don't overshoot the player/home
    this.cx += (tdx / td) * moveBy + (rng() * 2 - 1) * o.wander;
    this.cy += (tdy / td) * moveBy + (rng() * 2 - 1) * o.wander;
    this.cx = clamp(this.cx, 0, this.world.w); this.cy = clamp(this.cy, 0, this.world.h);

    const dens = this.density(playerX, playerY);
    const damage = Math.round(dens * o.damageScale);
    return { damage, density: dens, intensity: this.intensity, roused, dist: distToPlayer };
  }

  // counterplay: a swat / smoke / torch. Shoves the centroid away from a point and thins the cloud.
  // Deterministic given when it's called (no rng). Returns the new intensity.
  repulse(x, y, push = 22, calm = 0.45) {
    const dx = this.cx - x, dy = this.cy - y, d = Math.hypot(dx, dy) || 1e-3;
    this.cx = clamp(this.cx + (dx / d) * push, 0, this.world.w);
    this.cy = clamp(this.cy + (dy / d) * push, 0, this.world.h);
    this.intensity = clamp(this.intensity * (1 - calm), 0, this.o.maxIntensity);
    this.aggro = Math.max(0, this.aggro - 2); // a good swat buys a couple calm steps
    return this.intensity;
  }
}
