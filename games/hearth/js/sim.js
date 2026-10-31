/* Hearth — the settlement. One step is one year.

   Every lot holds a building of some number of floors (0: open ground, a
   park), split between homes and jobs. A year:

     1. reach. Each lot's ACCESS is everyone it can walk to, weighted by how
        long the walk is (exp(−t/TAU); a walk is the surface distance × a
        detour, at walking pace), plus the port's pull. It is the land value.
     2. how big the town can be. Strictly import and export: every person's
        food and water comes through the port, and so does everything their
        jobs make on its way out, and the port handles only so much a year.
        So the PORT sets how many people the town can hold. (A first version
        let access alone set heights: more building raised access, which
        raised heights, and the town ran to four million people in towers
        on every lot.)
     3. where it stands. That many people need so much floor, which is
        shared between the lots by land value (access^F_ALPHA): the town's
        size comes from the port, its skyline from access. Each lot's target
        is capped twice: by the structure (F_MAX), and by the port's
        clearance (launches need clear sky, so near the pad a building may
        rise only so far: a crater in the skyline round the port).
     4. building. Every floor is made of imported material too. The lots
        furthest below their target, weighted by access, build first, a
        floor or two a year each.
     5. who lives and works there. Jobs gather where access is highest (an
        office core), industry round the port, homes everywhere else;
        homes take M2_PERSON of floor a person, jobs M2_JOB, scaled so there
        is a job for every second person.

   Strictly import and export: food, water, materials and people come in
   through the port; what the jobs make goes out. Deterministic: the same
   seed gives the same town. Pure: no DOM, runs in node and the worker. */
import { R, O_, tiers, plates, dist } from "./orb.js";

export const S_ = {
  WALK: 80, DETOUR: 1.25, TAU: 9,         // metres a minute; a walk's detour; minutes for access to fall by e
  PORT_W: 4000, PORT_TAU: 12,             // the port's own pull on land value
  F_ALPHA: 3.5, VARY: 0.35,                // land value is access^F_ALPHA, ±VARY lot to lot (some blocks stay low)
  PORT0: 9e3, PORT_GROWTH: 0.062, PORT_MAX: 800e3,   // people the port can supply in year 0, its growth a year, and what one pad can ever handle
  SLACK: 1.08,                            // floor built ahead of the people who will fill it
  F_MAX: 90,                              // the structure's limit (~325 m; 0.71 g at the top)
  CLEAR_SLOPE: 0.42,                      // past the apron, a building may rise 0.42 m for each metre from the pad
  BUILD0: 70e3, BUILD_GROWTH: 0.07,       // m² of floor the port can land material for in year 1, and its growth
  STEP_MAX: 2,                            // floors a building rises in a year at most
  M2_PERSON: 45, M2_JOB: 30, JOBS_PER: 0.5,
  SEED_KM: 0.33, SEED_FLOORS: 3,          // the landing: low buildings within this of the port
  INDUSTRY_M: 420,                        // jobs this close to the port are industry
};

export class Settlement {
  constructor(orb) {
    this.orb = orb; this.year = 0; const n = orb.n;
    this.floors = new Int16Array(n); this.share = new Float32Array(n); this.kind = new Uint8Array(n);
    this.pop = new Float64Array(n); this.jobs = new Float64Array(n); this.access = new Float64Array(n); this.target = new Int16Array(n);
    this.cap = new Int16Array(n);
    for (let i = 0; i < n; i++) {
      const d = orb.dPort[i];
      this.cap[i] = i === orb.port || d < O_.PORT_APRON ? 0 : Math.min(S_.F_MAX, Math.floor((d - O_.PORT_APRON) * S_.CLEAR_SLOPE / O_.FLOOR));
      if (this.cap[i] > 0 && d < S_.SEED_KM * 1000) this.floors[i] = Math.min(this.cap[i], 1 + (hash(i) * S_.SEED_FLOORS | 0));
    }
    this.stats = {}; this.uses(); this.census();
  }

  step() {
    this.reach();
    this.build();
    this.year++;
    this.uses();
    this.census();
    return this.stats;
  }

  /* Access: everyone you can walk to, and the port. Only lots with people or
     jobs are sources, so an empty far side costs nothing. */
  reach() {
    const o = this.orb, n = o.n, P = o.P, act = [], A = this.access;
    for (let j = 0; j < n; j++) { const a = this.pop[j] + this.jobs[j]; if (a > 0) act.push(j, a); }
    const k = (S_.DETOUR * R) / (S_.WALK * S_.TAU);
    for (let i = 0; i < n; i++) {
      const x = P[3 * i], y = P[3 * i + 1], z = P[3 * i + 2];
      let s = 0;
      for (let q = 0; q < act.length; q += 2) {
        const j = act[q], d = x * P[3 * j] + y * P[3 * j + 1] + z * P[3 * j + 2];
        s += act[q + 1] * Math.exp(-k * Math.acos(d > 1 ? 1 : d));
      }
      A[i] = s + S_.PORT_W * Math.exp(-(S_.DETOUR * o.dPort[i] / S_.WALK) / S_.PORT_TAU);
    }
    // how many the port can supply, the floor they need, and where it goes: a level λ on land value, found by bisection
    // logistic: early years grow at PORT_GROWTH, and one pad levels off at PORT_MAX (more ports are the player's to build)
    this.supply = S_.PORT_MAX / (1 + (S_.PORT_MAX / S_.PORT0 - 1) * Math.exp(-S_.PORT_GROWTH * this.year));
    const need = this.supply * (S_.M2_PERSON + S_.JOBS_PER * S_.M2_JOB) * S_.SLACK;
    const w = new Float64Array(n); let wmax = 0;
    for (let i = 0; i < n; i++) { w[i] = this.cap[i] > 0 ? Math.pow(A[i], S_.F_ALPHA) * (1 - S_.VARY + 2 * S_.VARY * hash(i + 7919)) : 0; if (w[i] > wmax) wmax = w[i]; }
    const at = (lam, T) => { let m2 = 0; for (let i = 0; i < n; i++) { const t = Math.min(this.cap[i], Math.floor(lam * w[i] / wmax)); if (T) T[i] = t; m2 += plates(t) * o.plate[i]; } return m2; };
    let lo = 0, hi = 4 * S_.F_MAX; while (at(hi) < need && hi < 1e6) hi *= 2;
    for (let it = 0; it < 40; it++) { const mid = (lo + hi) / 2; if (at(mid) < need) lo = mid; else hi = mid; }
    at(hi, this.target);
  }

  /* This year's building: as much floor as the port can land material for. */
  build() {
    const o = this.orb, n = o.n, F = this.floors, T = this.target;
    let budget = S_.BUILD0 * Math.pow(1 + S_.BUILD_GROWTH, this.year);
    const want = [];
    for (let i = 0; i < n; i++) if (T[i] > F[i]) want.push([(T[i] - F[i]) * this.access[i], i]);
    want.sort((a, b) => b[0] - a[0] || a[1] - b[1]);
    let used = 0;
    for (const [, i] of want) {
      const up = Math.min(S_.STEP_MAX, T[i] - F[i]), m2 = (plates(F[i] + up) - plates(F[i])) * o.plate[i];
      if (m2 > budget) continue;
      budget -= m2; used += m2; F[i] += up;
    }
    this.built = used;
  }

  /* Who uses each building: jobs where access is highest, industry by the port. */
  uses() {
    const o = this.orb, n = o.n, A = this.access;
    let top = 0; for (let i = 0; i < n; i++) if (this.floors[i] > 0 && A[i] > top) top = A[i];
    for (let i = 0; i < n; i++) {
      const c = top > 0 ? A[i] / top : 0;
      this.share[i] = 0.12 + 0.68 * c * c * c;
      this.kind[i] = i === o.port ? 3 : this.floors[i] <= 0 ? 4 : o.dPort[i] < S_.INDUSTRY_M ? 2 : this.share[i] > 0.45 ? 1 : 0;
    }
  }

  census() {
    const o = this.orb, n = o.n;
    let homes = 0, work = 0;
    for (let i = 0; i < n; i++) { const a = plates(this.floors[i]) * o.plate[i]; homes += a * (1 - this.share[i]); work += a * this.share[i]; }
    // people fill the homes as far as the port can feed them; jobs, one for every 1/JOBS_PER people
    const people = Math.min(homes / S_.M2_PERSON, this.supply || Infinity), jobs = people * S_.JOBS_PER, perM2 = work > 0 ? jobs / work : 0;
    let tall = 0, tallLot = -1, floorsTot = 0, built = 0;
    for (let i = 0; i < n; i++) {
      const a = plates(this.floors[i]) * o.plate[i];
      const fill = homes > 0 ? people * S_.M2_PERSON / homes : 0;
      this.pop[i] = a * (1 - this.share[i]) / S_.M2_PERSON * fill; this.jobs[i] = a * this.share[i] * perM2;
      if (this.floors[i] > tall) { tall = this.floors[i]; tallLot = i; }
      floorsTot += this.floors[i]; if (this.floors[i] > 0) built++;
    }
    this.stats = { year: this.year, people, jobs, tall, tallLot, tallM: tall * O_.FLOOR, built, floorArea: homes + work, buildM2: this.built || 0,
      imports: { food: people, materials: this.built || 0 }, exports: jobs, supply: this.supply || 0 };
  }

  snapshot() { return { year: this.year, floors: Int16Array.from(this.floors), kind: Uint8Array.from(this.kind), share: Float32Array.from(this.share), pop: Float64Array.from(this.pop), jobs: Float64Array.from(this.jobs), access: Float64Array.from(this.access), cap: Int16Array.from(this.cap), stats: this.stats }; }
}

/* A lot's own fixed randomness: its materials, its facade, its first height. */
export function hash(i) { let h = (i + 1) * 2654435761 >>> 0; h ^= h >>> 15; h = Math.imul(h, 2246822507) >>> 0; h ^= h >>> 13; return (h >>> 0) / 4294967296; }
export { tiers, dist };
