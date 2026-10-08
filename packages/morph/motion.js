// motion.js — the day, back out of the totals. mobility.js answers "how many, from where to where, by
// what" as a day's totals (the map of flows is a kind of transform of the traffic: everything that moved
// all day, summed); this turns it back into a TIME SERIES OF DISCRETE THINGS: people who leave home at a
// time drawn from the hour's profile, walk or cycle or drive their route at the speed the street allows at
// that hour, and come home again; and trams, buses, omnibuses and trains running to a timetable. Pure,
// deterministic: a day is a function of (city, year, seed), and where everything is is a function of the
// minute.
//
//   const D = day(city, year)          → journeys (packed), vehicles, and the day's series by mode
//   movers(D, minute, out)             → every person moving at that minute: x, y, heading, mode
//   vehiclesAt(D, minute)              → every vehicle in service: its line, its body as a polyline, how full
//
// Scale: one drawn person stands for `D.scale` real ones (about 80,000 journeys a day are drawn, whatever
// the town's size); vehicles are one for one.
import { Rand } from './rand.js';
import { network, eraAt, linesAt, MODES, dijkstra, buffers, CAR, MAIN } from './mobility.js';

const lerpT = (T, y) => { if (y <= T[0][0]) return T[0][1]; for (let i = 1; i < T.length; i++) if (y <= T[i][0]) { const [y0, a] = T[i - 1], [y1, b] = T[i]; return a + (b - a) * (y - y0) / (y1 - y0); } return T[T.length - 1][1]; };
export const MODE_IDS = ['walk', 'bike', 'car', 'transit'];
const DAY = 1440;

/**
 * When people go: the working day started at dawn and was long (six and a quarter in 1800, eleven hours
 * and a half at work) and has drifted to eight and a quarter and under nine; going out is a midday outing
 * or (mostly) an evening one, later as the century went on.
 */
export function rhythm(year) {
  return {
    workStart: lerpT([[1800, 6.25], [1900, 6.75], [1950, 8], [2025, 8.25]], year), workSd: year < 1900 ? 0.55 : 0.8,
    workDwell: lerpT([[1800, 11.5], [1900, 10.5], [1950, 9], [2025, 8.75]], year),
    evening: lerpT([[1800, 18.5], [1950, 19.25], [2025, 19.75]], year),
  };
}
const gauss = (R) => { const u = Math.max(1e-9, R.f()), v = R.f(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

/** A day in `year`: journeys sampled from the era's trip table, routed and timed; the timetabled vehicles. */
export function day(city, year, o = {}) {
  const E = eraAt(city, year);
  if (!E || !E.od) return null;
  const net = network(city), od = E.od, Z = od.Z, rh = rhythm(year), R = Rand(city.seed, `day/${E.year}`);
  const target = o.target || 80000;
  let total = 0; for (let q = 0; q < Z * Z; q++) if (q % (Z + 1)) total += od.work[q] + od.fun[q];
  const scale = Math.max(1, total / target);
  // how fast a car goes on each street, free: town streets 30 km/h, main roads 45 (slower before 1930)
  const carFree = (e) => (MAIN.has(e.rank) || e.rank === 'bridge' ? 750 : 500) * (year < 1930 ? 0.6 : 1);
  const preds = new Map(), buf = buffers(net.N), carW = (e) => CAR[e.rank] || 1;
  const routeFrom = (i) => {
    let p = preds.get(i);
    if (!p) { dijkstra(net, od.zxy[3 * i + 2], year, carW, buf); p = Int32Array.from(buf.pred); preds.set(i, p); }
    return p;
  };
  // 1. who goes where, when, by what
  const J = [];
  for (let i = 0; i < Z; i++) for (let j = 0; j < Z; j++) {
    if (i === j) continue;
    const q = i * Z + j;
    for (const purpose of ['work', 'fun']) {
      const x = od[purpose][q] / 2 / scale;            // the table counts both ways: one person, out and back
      let n = Math.floor(x); if (R.f() < x - n) n++;
      for (let k = 0; k < n; k++) {
        // the mode, by the pair's shares
        let u = R.f() * 255, m = 0; const sh = od.share;
        while (m < 3 && u >= sh[4 * q + m]) { u -= sh[4 * q + m]; m++; }
        const mode = ['walk', 'transit', 'car', 'bike'][m];
        let out, back;
        if (purpose === 'work') { out = (rh.workStart + gauss(R) * rh.workSd) * 60; back = out + (rh.workDwell + gauss(R) * 0.6) * 60; }
        else if (R.f() < 0.3) { out = (12.75 + gauss(R) * 1.1) * 60; back = out + (1.5 + Math.abs(gauss(R)) * 0.6) * 60; }
        else { out = (rh.evening + gauss(R) * 1.3) * 60; back = out + (2.5 + Math.abs(gauss(R)) * 1) * 60; }
        J.push({ i, j, mode, t: ((out % DAY) + DAY) % DAY }, { i: j, j: i, mode, t: ((back % DAY) + DAY) % DAY });
      }
    }
  }
  J.sort((a, b) => a.t - b.t);
  // 2. the hour's traffic, to slow the cars where the street is full (the BPR curve: t = t0 (1 + 0.15 (V/C)^4))
  const carHour = new Float32Array(24);
  for (const x of J) if (x.mode === 'car') carHour[Math.floor(x.t / 60) % 24]++;
  const carsAll = carHour.reduce((a, b) => a + b, 0) || 1;
  for (let h = 0; h < 24; h++) carHour[h] /= carsAll;
  const edgeMin = (e, k, h) => {
    if (k === 'walk') return e.len / MODES.walk.speed;
    if (k === 'bike') return e.len / MODES.bike.speed;
    // the carriageway is the street less its pavements; an urban lane, with its junctions, takes ~550 cars an hour
    const V = E.flowCar[e.idx] * carHour[h], C = Math.max(1, Math.floor((e.width - 6) / 3.3)) * 550;
    // (capped: past twice capacity people leave earlier or later, which the profile already spreads; the
    // curve uncapped makes a full bridge take hours)
    return e.len / carFree(e) * (1 + 0.15 * Math.min(2, V / C) ** 4);
  };
  if (net.edges[0] && net.edges[0].idx == null) net.edges.forEach((e, k) => (e.idx = k));
  // 3. route and time each one (transit riders are counted, not drawn: the vehicles carry them)
  const nodes = [], times = [], off = [0], t0 = [], t1 = [], modeOf = [];
  const series = Object.fromEntries([...MODE_IDS, 'vehicles'].map((k) => [k, new Float32Array(96)]));
  const addSeries = (k, a, b) => { for (let s = Math.floor(a / 15); s * 15 < b; s++) series[k][((s % 96) + 96) % 96] += scale * Math.min(1, (Math.min(b, (s + 1) * 15) - Math.max(a, s * 15)) / 15); };
  const lineById = new Map(city.transport.lines.map((L) => [L.id, L]));
  for (const x of J) {
    const pred = routeFrom(x.i), dn = od.zxy[3 * x.j + 2];
    if (x.mode === 'transit') {
      const L = lineById.get(od.walkTo[x.i]) || lineById.get(od.walkTo[x.j]), M = L ? MODES[L.mode] : MODES.bus;
      const d = Math.hypot(od.zxy[3 * x.i] - od.zxy[3 * x.j], od.zxy[3 * x.i + 1] - od.zxy[3 * x.j + 1]) * 1.3;
      addSeries('transit', x.t, x.t + 8 + (M.wait || 6) + d / M.speed);
      continue;
    }
    const path = [dn];
    for (let v = dn, guard = 0; pred[v] >= 0 && guard < 5000; guard++) { const e = net.edges[pred[v]]; v = e.a === v ? e.b : e.a; path.push(v); }
    if (path.length < 2) continue;
    path.reverse();
    const h = Math.floor(x.t / 60) % 24;
    let t = x.t + (x.mode === 'car' ? 2 : 0.5);            // out of the door (and the car out of its space)
    nodes.push(path[0]); times.push(t);
    for (let k = 1; k < path.length; k++) { t += edgeMin(net.edges[pred[path[k]]], x.mode, h); nodes.push(path[k]); times.push(t); }
    off.push(nodes.length); t0.push(x.t); t1.push(t); modeOf.push(MODE_IDS.indexOf(x.mode));
    addSeries(x.mode, x.t, t);
  }
  const D = {
    year: E.year, scale, n: t0.length, mode: Uint8Array.from(modeOf), t0: Float32Array.from(t0), t1: Float32Array.from(t1),
    off: Int32Array.from(off), nodes: Int32Array.from(nodes), times: Float32Array.from(times), xy: net.xy, series, carHour,
  };
  D.vehicles = timetable(city, year, E, D);
  for (const V of D.vehicles) for (const d of V.deps) addSeries('vehicles', d, d + V.T);
  for (let s = 0; s < 96; s++) series.vehicles[s] /= scale;     // vehicles are counted one for one
  return D;
}

// ---------------------------------------------------------------------------- the timetable --
// How often each runs at the busiest hour (minutes); twice as long off-peak and three times in the evening;
// horse-drawn services stop at ten at night, the rest after midnight.
const HEADWAY = { omnibus: 20, horsetram: 12, tram: 7, bus: 10, lightrail: 7 };
const LENGTH = { omnibus: 8, horsetram: 10, tram: 28, bus: 12, lightrail: 36, train: 140 };
const CAPACITY = { omnibus: 24, horsetram: 40, tram: 120, bus: 80, lightrail: 220, train: 600 };
const headway = (mode, hour) => {
  const peak = (hour >= 7 && hour < 9.5) || (hour >= 16 && hour < 19);
  return HEADWAY[mode] * (peak ? 1 : hour >= 20 || hour < 6.5 ? 3 : 2);
};
function timetable(city, year, E, D) {
  const { lines, rail } = linesAt(city, year), out = [], xy = D.xy;
  const horse = (m) => m === 'omnibus' || m === 'horsetram';
  for (const L of lines) {
    const pts = L.nodes.map((q) => [xy[2 * q], xy[2 * q + 1]]), cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const len = cum[cum.length - 1], v = MODES[L.mode].speed * 0.7, T = len / v;   // stops cost a third of the speed
    const deps = [], dirs = [];
    const open = horse(L.mode) ? 7 * 60 : 5.5 * 60, close = horse(L.mode) ? 22 * 60 : 24.5 * 60;
    for (const dir of [0, 1]) for (let t = open + (dir ? HEADWAY[L.mode] / 2 : 0); t < close; t += headway(L.mode, (t / 60) % 24)) { deps.push(t); dirs.push(dir); }
    // how full: the line's riders, by the hour they travel, over the seats that pass
    const riders = (E.load[L.id] || 0) / 2;
    out.push({ kind: L.mode, line: L.id, name: L.name, pts, cum, len, v, T, deps, dirs, riders, body: LENGTH[L.mode], cap: CAPACITY[L.mode] });
  }
  if (rail) {
    // trains: in from the country to the terminus, a quarter of an hour at the platform, out again
    const pts = rail.path.map((p) => [p[0], p[1]]), cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const len = cum[cum.length - 1], v = 600, T = len / v, every = lerpT([[1850, 90], [1900, 40], [1950, 25], [2000, 15]], year);
    const deps = [], dirs = [];
    for (let t = 5 * 60; t < 23.5 * 60; t += every) { deps.push(t); dirs.push(0); deps.push(t + T + 15); dirs.push(1); }
    out.push({ kind: 'train', line: -1, name: 'the railway', pts, cum, len, v, T, deps, dirs, riders: (E.gates || []).filter((g) => g.gate === 'rail').reduce((s, g) => s + g.people, 0), body: LENGTH.train, cap: CAPACITY.train, dwell: 15 });
  }
  return out;
}

// ---------------------------------------------------------------------------- where everything is --
/** Every person moving at `minute`: fills `out` ({ n, x, y, hx, hy, mode }) and returns it. */
export function movers(D, minute, out = {}) {
  if (!out.x || out.x.length < D.n) { out.x = new Float32Array(D.n); out.y = new Float32Array(D.n); out.hx = new Float32Array(D.n); out.hy = new Float32Array(D.n); out.mode = new Uint8Array(D.n); }
  let n = 0;
  const { t0, t1, off, nodes, times, xy } = D;
  for (let k = 0; k < D.n; k++) {
    let t = minute;
    if (t < t0[k]) t += DAY;                    // a journey that runs past midnight
    if (t < t0[k] || t >= t1[k]) continue;
    const a = off[k], b = off[k + 1];
    if (t < times[a]) { out.x[n] = xy[2 * nodes[a]]; out.y[n] = xy[2 * nodes[a] + 1]; out.hx[n] = 0; out.hy[n] = 0; out.mode[n++] = D.mode[k]; continue; }
    let lo = a, hi = b - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (times[m] <= t) lo = m; else hi = m; }
    const f = (t - times[lo]) / Math.max(1e-6, times[hi] - times[lo]), p = nodes[lo], q = nodes[hi];
    const px = xy[2 * p], py = xy[2 * p + 1], dx = xy[2 * q] - px, dy = xy[2 * q + 1] - py, L = Math.hypot(dx, dy) || 1;
    // keep to the right of the centreline, as traffic does
    const side = D.mode[k] === 0 ? 0 : D.mode[k] === 2 ? 2.2 : 3.4;
    out.x[n] = px + dx * f + dy / L * side; out.y[n] = py + dy * f - dx / L * side; out.hx[n] = dx / L; out.hy[n] = dy / L; out.mode[n++] = D.mode[k];
  }
  out.n = n;
  return out;
}

const along = (V, s) => {
  s = Math.max(0, Math.min(V.len, s));
  let i = 1; while (i < V.cum.length - 1 && V.cum[i] < s) i++;
  const a = V.pts[i - 1], b = V.pts[i], f = (s - V.cum[i - 1]) / Math.max(1e-6, V.cum[i] - V.cum[i - 1]);
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
};
/** Every vehicle in service at `minute`: { kind, line, body: [[x, y]…] head first, full: 0..1 }. */
export function vehiclesAt(D, minute) {
  const out = [];
  for (const V of D.vehicles) {
    const hour = (minute / 60) % 24, perHour = V.kind === 'train' ? 60 / Math.max(1, V.deps[2] - V.deps[0] || 60) : 120 / headway(V.kind, hour);
    const share = D.carHour ? D.carHour[Math.floor(hour)] || 0.04 : 0.04;
    const full = Math.min(1, V.riders * share / Math.max(1e-6, perHour * V.cap));
    for (let k = 0; k < V.deps.length; k++) {
      const d = V.deps[k], u = minute - d;
      const dwell = V.dwell && V.dirs[k] === 0 ? V.dwell : 0;
      if (u < 0 || u > V.T + dwell) continue;
      const run = Math.min(V.T, u), s = run * V.v, fwd = V.dirs[k] === 0;
      const head = fwd ? s : V.len - s, tail = fwd ? head - V.body : head + V.body;
      const body = [];
      for (let m = 0; m <= 6; m++) body.push(along(V, head + (tail - head) * m / 6));
      out.push({ kind: V.kind, line: V.line, body, full, at: u > V.T ? 'platform' : 'running' });
    }
  }
  return out;
}
