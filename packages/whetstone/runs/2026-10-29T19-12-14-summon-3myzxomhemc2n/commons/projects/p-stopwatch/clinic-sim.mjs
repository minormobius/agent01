// A stand-in for the lab's clinic, for tests and for measuring the study. It enforces
// the rules SPEC.md states (one observer, arrival order, each once, the manager's limit)
// and hides a true mean difference. Not the lab's clinic: its arrivals, queue and
// difference distributions are our guesses, and the shapes are chosen to be unkind.
//
// makeClinic({ seed, mean, sd, shape, rate, minutes, servers, service, limit })
//   shape: 'normal' | 'skew' (exponential, right tail) | 'lumpy' (mostly mean−a, sometimes a big jump)
//          | 'heavy' (t, 3 df, scaled to sd) | 'zero' (no spread at all)
//   waits: 'queue' (from the servers) | 'tri' (triangular 14, 34, 54: the proposal's sizing)

function rng(seed) {
  let a = 0x9e3779b9 ^ (seed * 2654435761), b = 0x243f6a88 ^ seed, c = 0xb7e15162, d = seed | 0;
  const f = () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    const t = (a + b) | 0; a = b ^ (b >>> 9); b = (c + (c << 3)) | 0; c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0; const r = (t + d) | 0; c = (c + r) | 0; return (r >>> 0) / 4294967296;
  };
  for (let i = 0; i < 12; i++) f();
  return f;
}

export function makeClinic({ seed = 1, mean = 0, sd = 5, shape = 'normal', rate = 1 / 12, minutes = 240,
  servers = 1, service = 10, waits = 'queue', limit = 5, slope = 0 } = {}) {
  const r = rng(seed);
  const exp = (m) => -Math.log(1 - r()) * m;
  const normal = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
  const tri = (a, m, b) => { const u = r(), f = (m - a) / (b - a); return u < f ? a + Math.sqrt(u * (b - a) * (m - a)) : b - Math.sqrt((1 - u) * (b - a) * (b - m)); };
  const diff = () => {
    switch (shape) {
      case 'normal': return mean + sd * normal();
      case 'heavy': { let c = 0; for (let i = 0; i < 3; i++) c += normal() ** 2; return mean + sd * normal() / Math.sqrt(c / 3) / Math.sqrt(3); }
      case 'skew': return mean + sd * (exp(1) - 1);
      case 'lumpy': { const p = 0.15, jump = sd / Math.sqrt(p * (1 - p)); return mean - p * jump + (r() < p ? jump : 0); }
      case 'zero': return mean;
      default: throw new Error(`unknown shape ${shape}`);
    }
  };
  const days = new Map(); // k -> { patients, truth: Map id -> {stop, tablet} }
  for (let k = 1; k <= limit; k++) {
    const patients = [];
    const truth = new Map();
    const free = Array(servers).fill(0);
    let t = exp(1 / rate);
    while (t < minutes) {
      const id = `m${k}p${patients.length + 1}`;
      free.sort((x, y) => x - y);
      const start = Math.max(t, free[0]);
      free[0] = start + exp(service);
      const stop = waits === 'tri' ? tri(14, 34, 54) : start - t;
      // `slope` breaks SPEC's promise on purpose (difference grows with wait); only for
      // measuring the diagnostic. 0 by default.
      const tablet = stop + diff() + slope * (stop - 20);
      patients.push({ id, arrive: t });
      truth.set(id, { stop, tablet });
      t += exp(1 / rate);
    }
    days.set(k, { patients, truth });
  }
  const trueMean = mean;
  let asked = 0, current = null, lastSeen = -Infinity, lastIdx = -1;
  const timedIds = new Set();
  const clinic = {
    morning(k) {
      if (k !== asked + 1) throw new Error(`morning ${k} asked out of order (next is ${asked + 1})`);
      if (k > limit) throw new Error(`the manager stops you at ${limit} mornings`);
      asked = k; current = days.get(k); lastSeen = -Infinity; lastIdx = -1;
      return current.patients.map((p) => ({ ...p }));
    },
    time(id) {
      if (!current) throw new Error('no morning asked for');
      const i = current.patients.findIndex((p) => p.id === id);
      if (i < 0) throw new Error(`${id} is not a patient of morning ${asked}`);
      if (timedIds.has(id)) throw new Error(`${id} timed twice`);
      if (i <= lastIdx) throw new Error(`${id} timed out of arrival order`);
      const p = current.patients[i];
      if (p.arrive < lastSeen) throw new Error(`${id} arrives at ${p.arrive} while the observer is busy until ${lastSeen}`);
      const { stop } = current.truth.get(id);
      timedIds.add(id); lastIdx = i; lastSeen = p.arrive + stop;
      return stop;
    },
    tablet(id) {
      for (let k = 1; k <= asked; k++) { const v = days.get(k).truth.get(id); if (v) return v.tablet; }
      throw new Error(`${id} is not a patient of a morning asked for`);
    },
  };
  Object.defineProperty(clinic, 'secret', { value: { trueMean, days }, enumerable: false });
  return clinic;
}
