// Rhizome lab, the page (Modulo, 2026-10-14). Pane 1 lays ground with the kit's code; pane 2 runs life.js on it.
import { lattice, rng, sim, CASES, LATTICES } from '../kit/clone.mjs';
import { buildMaze } from '../kit/maze.mjs';
import { shapes } from '../hero.js';
import { life, compile, KINDS } from './life.js';

const $ = id => document.getElementById(id);
const C_LIFE = ['#c0392b', '#2457c5', '#16a085', '#8e44ad'], C_LIFE_BAD = ['#eba59d', '#9fb6e6', '#93d6c8', '#cfa9de'];
const PRESETS = {
  blank: { note: '' },
  ...Object.fromEntries(Object.entries(CASES).map(([k, [p, s, h]]) => [`oborny-${k}`, { label: `Oborny 2000, habitat ${k}`, g: { lat: 'sq4', wrap: 1, L: 100, p, s, rock: 0, gseed: 1007 }, l: { n: [25, 25, 0, 0], h, wmode: 'clamp', lseed: 5 },
    note: `p ${p}, blocks of ${s}, h ${h}: the paper's 100×100 torus, 25 splitters and 25 integrators. Our 20-run averages are on the Rhizome page (#run).` }])),
  hex: { label: 'Hexagons on a cylinder, B', g: { lat: 'hex6c', wrap: 1, L: 100, p: 0.5, s: 2, rock: 0, gseed: 1007 }, l: { n: [25, 25, 0, 0], h: 0.9, wmode: 'clamp', lseed: 5 }, note: 'Habitat B on hexagons, wrapped left-right only. Rhizome page, #grids.' },
  vor: { label: 'Voronoi plane, B', g: { lat: 'vor', wrap: 1, L: 60, p: 0.5, s: 2, rock: 0, gseed: 1007 }, l: { n: [25, 25, 0, 0], h: 0.9, wmode: 'clamp', lseed: 5 }, note: 'Habitat B on 3,600 Voronoi cells (our runs used 10,000; this is smaller so it lays fast).' },
  rocks: { label: 'Moore grid, 30% rocks, B', g: { lat: 'sq8', wrap: 1, L: 100, p: 0.5, s: 2, rock: 0.3, gseed: 1007 }, l: { n: [25, 25, 0, 0], h: 0.9, wmode: 'clamp', lseed: 5 }, note: 'Rocks hand the field back to the integrator. Rhizome page, #grids.' },
  pieces: { label: 'Whole genet vs connected piece, C2', g: { lat: 'sq4', wrap: 1, L: 100, p: 0.5, s: 5, rock: 0, gseed: 1007 }, l: { n: [0, 25, 25, 0], h: 0.9, wmode: 'clamp', lseed: 5 }, note: 'Integrators that share over the whole genet against ones that share only within a connected piece. Rhizome page, #pieces.' },
  maze: { label: 'Maze (one clone at the entrance)', maze: true, g: { lat: 'sq4', wrap: 1, L: 100, p: 0, s: 1, rock: 0, gseed: 1 }, l: { n: [0, 0, 0, 0], h: 0.9, wmode: 'clamp', lseed: 5 }, entrance: 1,
    note: 'The kit\'s 49×49-room maze: food at the entrance (top left) and the exit (bottom right), bad ground between. Runners fill it, they don\'t solve it. Click to plant more.' },
};
const st = { ground: null, cfg: null, maze: false, locked: false, model: null, plan: null, clicks: [], hist: [], running: false };

// ---------- pane 1 ----------
function readG() { return { lat: $('lat').value, wrap: +$('wrap').value, L: +$('L').value, p: +$('p').value, s: +$('s').value, rock: +$('rock').value, gseed: +$('gseed').value }; }
function writeG(g) { for (const k in g) $(k).value = g[k]; }
function lay() {
  $('gerr').textContent = '';
  const g = readG();
  try {
    if (st.maze) { const M = buildMaze(g.gseed); st.ground = { graph: M.graph, good: M.good, rock: M.rock, p: M.p, maze: M }; }
    else {
      if (!(g.p > 0 && g.p <= 1)) throw new Error('good fraction must be above 0 and at most 1');
      if (!(g.L >= 20 && g.L <= 140)) throw new Error('size 20 to 140');
      if (g.L % g.s) throw new Error(`size ${g.L} isn't a multiple of the block side ${g.s}`);
      if (!(g.rock >= 0 && g.rock < 1)) throw new Error('rocks: 0 to 0.9');
      const graph = lattice(g.lat, g.L, !!g.wrap, rng((g.gseed ^ 0x2545F491) >>> 0));
      const m = sim([g.p, g.s, 0.9], g.gseed, { graph, L: g.L, rock: g.rock });
      st.ground = { graph, good: m.good, rock: m.rock, p: g.p };
    }
  } catch (e) { $('gerr').textContent = e.message; return false; }
  st.cfg = g; st.geo = geometry(st.maze ? 'sq4' : g.lat, st.ground.graph);
  st.span = spanning(st.ground); drawGround($('cv1'), true); groundText(); return true;
}
function spanning(gr) { // one patch of good squares joining the top row to the bottom row; wrap links ignored
  const G = gr.graph, n = G.N, L = G.L, par = new Int32Array(n + 2), TOP = n, BOT = n + 1;
  for (let i = 0; i < n + 2; i++) par[i] = i;
  const find = x => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
  const ok = i => gr.good[i] && !gr.rock[i];
  for (let i = 0; i < n; i++) { if (!ok(i)) continue;
    if (G.y[i] < 1) par[find(i)] = find(TOP); if (G.y[i] >= L - 1) par[find(i)] = find(BOT);
    for (let e = G.off[i]; e < G.off[i + 1]; e++) { const j = G.nb[e]; if (ok(j) && Math.abs(G.y[i] - G.y[j]) <= L / 2) par[find(i)] = find(j); } }
  const size = new Map(); let goodN = 0, rockN = 0;
  for (let i = 0; i < n; i++) { if (gr.rock[i]) rockN++; if (!ok(i)) continue; goodN++; const r = find(i); size.set(r, (size.get(r) || 0) + 1); }
  const big = Math.max(0, ...size.values()), spans = find(TOP) === find(BOT), root = find(TOP), inSpan = new Uint8Array(n);
  if (spans) for (let i = 0; i < n; i++) if (ok(i) && find(i) === root) inSpan[i] = 1;
  return { spans, inSpan, goodN, rockN, big, n };
}
function groundText() {
  const s = st.span, g = st.cfg, lt = LATTICES[st.maze ? 'sq4' : g.lat];
  $('gread').textContent = [
    `${s.n} squares: ${s.goodN} good (${(100 * s.goodN / s.n).toFixed(1)}%), ${s.rockN} rock`,
    `largest good patch: ${s.big} squares (${s.goodN ? (100 * s.big / s.goodN).toFixed(1) : 0}% of the good ground)`,
    `a good patch joins top to bottom: ${s.spans ? 'YES' : 'no'}`,
    st.maze ? 'maze: walls are rock, food only at the two ends' : `site threshold of this tiling: ${lt.pc} for single squares (blocks of ${g.s} and rocks move it)`].join('\n');
}

// ---------- drawing ----------
function geometry(lat, G) {
  const W = 640;
  if (lat === 'vor' || lat === 'hex6c') { const sh = shapes(lat, G, W);
    const cen = sh.out.map(P => [P.reduce((a, v) => a + v[0], 0) / P.length, P.reduce((a, v) => a + v[1], 0) / P.length]);
    return { poly: sh, W, H: Math.ceil(sh.H), cen }; }
  return { W, H: W, k: W / G.L, L: G.L };
}
function paint(cv, colorOf) {
  const geo = st.geo, cx = cv.getContext('2d'); cv.width = geo.W; cv.height = geo.H;
  cx.fillStyle = '#fff'; cx.fillRect(0, 0, geo.W, geo.H);
  const n = st.ground.graph.N;
  if (!geo.poly) { const L = geo.L, img = new ImageData(L, L), d = img.data;
    for (let i = 0; i < n; i++) { const c = colorOf(i); d[4 * i] = parseInt(c.slice(1, 3), 16); d[4 * i + 1] = parseInt(c.slice(3, 5), 16); d[4 * i + 2] = parseInt(c.slice(5, 7), 16); d[4 * i + 3] = 255; }
    const off = new OffscreenCanvas(L, L); off.getContext('2d').putImageData(img, 0, 0);
    cx.imageSmoothingEnabled = false; cx.drawImage(off, 0, 0, geo.W, geo.H); return; }
  const by = new Map(); for (let i = 0; i < n; i++) { const c = colorOf(i); if (!by.has(c)) by.set(c, []); by.get(c).push(i); }
  for (const [c, cells] of by) { cx.fillStyle = c; cx.strokeStyle = c; cx.lineWidth = 0.6; cx.beginPath();
    for (const i of cells) for (const dx of geo.poly.wrapW ? [0, -geo.poly.wrapW] : [0]) { const P = geo.poly.out[i]; cx.moveTo(P[0][0] + dx, P[0][1]); for (let k = 1; k < P.length; k++) cx.lineTo(P[k][0] + dx, P[k][1]); cx.closePath(); }
    cx.fill(); cx.stroke(); }
}
function drawGround(cv) { const gr = st.ground, sp = st.span;
  paint(cv, i => gr.rock[i] ? '#4a4a4a' : !gr.good[i] ? '#efece2' : sp.inSpan[i] ? '#2e7d32' : '#9cc58a'); }
function drawLife() { const gr = st.ground, m = st.model;
  paint($('cv2'), i => { if (gr.rock[i]) return '#4a4a4a'; const g = m ? m.gen[i] : 0;
    if (g) { const k = m.kind[g]; return gr.good[i] ? C_LIFE[k] : C_LIFE_BAD[k]; } return gr.good[i] ? '#d5e6c8' : '#f6f4ee'; });
  drawChart(); lifeText(); }

// ---------- pane 2 ----------
function readL() { return { n: [0, 1, 2, 3].map(k => Math.max(0, Math.floor(+$('n' + k).value || 0))), h: +$('h').value, wmode: $('wmode').value, lseed: +$('lseed').value, grow: $('grow').value, live: $('live').value }; }
function writeL(l) { l.n.forEach((v, k) => $('n' + k).value = v); $('h').value = l.h; $('wmode').value = l.wmode; $('lseed').value = l.lseed; if (l.grow) $('grow').value = l.grow; if (l.live) $('live').value = l.live; }
function lock() { if (!st.ground && !lay()) return; st.locked = true; $('p1').classList.add('off'); $('p2').classList.remove('off');
  $('lockedAs').textContent = st.maze ? '(on the maze)' : `(on ${$('lat').selectedOptions[0].text}, ${st.cfg.L}, p ${st.cfg.p}, blocks ${st.cfg.s}, rocks ${st.cfg.rock})`;
  plant(); }
function unlock() { stop(); st.locked = false; st.model = null; $('p1').classList.remove('off'); $('p2').classList.add('off'); }
function plant() {
  stop(); $('lerr').textContent = '';
  const l = readL(), gr = st.ground, N = gr.graph.N, R = rng((l.lseed ^ 0x51ED270B) >>> 0), used = new Set(), list = [];
  for (const [i, k] of st.clicks) if (!gr.rock[i] && !used.has(i)) { used.add(i); list.push([i, k]); }
  const free = N - st.span.rockN - used.size, want = l.n.reduce((a, b) => a + b, 0);
  if (want > free) { $('lerr').textContent = `only ${free} free squares`; return; }
  l.n.forEach((cnt, k) => { for (let c = 0; c < cnt; c++) { let i; do i = Math.floor(R() * N); while (gr.rock[i] || used.has(i)); used.add(i); list.push([i, k]); } });
  if (list.some(([, k]) => k === 3)) try { compile(l.grow); compile(l.live); } catch (e) { $('lerr').textContent = 'your kind: ' + e.message; $('yours').open = true; st.model = null; drawLife(); return; }
  if (!(l.h > 0.1 && l.h <= 1)) { $('lerr').textContent = 'h: above 0.1, at most 1'; return; }
  st.plan = list; st.model = life(gr, list, { seed: l.lseed, h: l.h, wmode: l.wmode, grow: l.grow, live: l.live });
  st.hist = [st.model.count()]; drawLife(); perma();
}
function stop() { st.running = false; $('go').textContent = 'Run'; }
function tick() { if (!st.running || !st.model) return;
  for (let s = +$('speed').value; s > 0; s--) { st.model.step(); st.hist.push(st.model.count()); }
  drawLife();
  if (!st.model.gen.some(x => x)) { stop(); return; }
  setTimeout(tick, 15); }
function lifeText() { const m = st.model; if (!m) { $('lread').textContent = ''; return; }
  const c = st.hist[st.hist.length - 1], planted = [0, 0, 0, 0]; for (const [, k] of st.plan) planted[k]++;
  $('lread').textContent = `step ${m.t}\n` + KINDS.map((name, k) => planted[k] ? `${name.padEnd(12)} ${(c[k].good + c[k].bad).toFixed(1).padStart(5)}% of the field (${c[k].good.toFixed(1)} on good, ${c[k].bad.toFixed(1)} on bad), genets alive ${c[k].genets}/${planted[k]}` : null).filter(Boolean).join('\n'); }
function drawChart() { const cv = $('chart'), cx = cv.getContext('2d'), Wd = cv.width, Hd = cv.height, H = st.hist;
  cx.fillStyle = '#fff'; cx.fillRect(0, 0, Wd, Hd); cx.strokeStyle = '#ddd'; cx.strokeRect(0.5, 0.5, Wd - 1, Hd - 1);
  if (!H.length) return; const T = Math.max(500, H.length - 1);
  let top = 10; for (const c of H) for (const o of c) top = Math.max(top, o.good + o.bad); top = Math.ceil(top / 10) * 10;
  cx.fillStyle = '#777'; cx.font = '11px system-ui'; cx.fillText(`${top}% of field`, 4, 12); cx.fillText(`step ${T}`, Wd - 52, Hd - 4);
  for (let k = 0; k < 4; k++) { if (!H.some(c => c[k].genets)) continue; cx.strokeStyle = C_LIFE[k]; cx.lineWidth = 1.5; cx.beginPath();
    H.forEach((c, t) => { const x = t / T * (Wd - 2) + 1, y = Hd - 2 - (c[k].good + c[k].bad) / top * (Hd - 18); t ? cx.lineTo(x, y) : cx.moveTo(x, y); }); cx.stroke(); } }
function cellAt(ev) { const cv = $('cv2'), r = cv.getBoundingClientRect(), x = (ev.clientX - r.left) * cv.width / r.width, y = (ev.clientY - r.top) * cv.height / r.height, geo = st.geo;
  if (!geo.poly) { const c = Math.floor(x / geo.k), rr = Math.floor(y / geo.k); return c >= 0 && rr >= 0 && c < geo.L && rr < geo.L ? rr * geo.L + c : -1; }
  let best = -1, bd = Infinity; geo.cen.forEach(([a, b], i) => { let dx = Math.abs(a - x); if (geo.poly.wrapW) dx = Math.min(dx, geo.poly.wrapW - dx); const d = dx * dx + (b - y) ** 2; if (d < bd) { bd = d; best = i; } }); return best; }

// ---------- links ----------
function perma() { const g = st.cfg, l = readL();
  const q = new URLSearchParams({ g: st.maze ? `maze_${g.gseed}` : [g.lat, g.wrap, g.L, g.p, g.s, g.rock, g.gseed].join('_'), l: [...l.n, l.h, l.wmode, l.lseed].join('_') });
  if (st.plan.some(([, k]) => k === 3)) { q.set('grow', l.grow); q.set('live', l.live); }
  if (st.clicks.length) q.set('at', st.clicks.map(([i, k]) => `${i}${'sipy'[k]}`).join('.'));
  $('perma').href = '#' + q.toString(); }
function fromHash() { const q = new URLSearchParams(location.hash.slice(1)); if (!q.get('g') || !q.get('l')) return false;
  const g = q.get('g').split('_'), l = q.get('l').split('_');
  if (g[0] === 'maze') { st.maze = true; $('gseed').value = +g[1] || 1; }
  else { st.maze = false; const [lat, wrap, L, p, s, rock, gseed] = g; writeG({ lat, wrap, L, p, s, rock, gseed }); }
  writeL({ n: l.slice(0, 4).map(Number), h: l[4], wmode: l[5], lseed: l[6], grow: q.get('grow'), live: q.get('live') });
  st.clicks = (q.get('at') || '').split('.').filter(Boolean).map(t => [parseInt(t), 'sipy'.indexOf(t.slice(-1))]).filter(([i, k]) => i >= 0 && k >= 0);
  if (q.get('grow')) $('yours').open = true;
  if (lay()) lock(); return true; }

// ---------- wiring ----------
const sel = $('preset');
for (const [k, v] of Object.entries(PRESETS)) { const o = document.createElement('option'); o.value = k; o.textContent = v.label || 'blank: your own'; sel.append(o); }
sel.onchange = () => { const P = PRESETS[sel.value]; unlock(); st.clicks = []; st.maze = !!P.maze; $('presetNote').textContent = P.note || '';
  if (P.g) { writeG(P.g); writeL(P.l); } if (lay() && P.g) { if (P.entrance) st.clicks = [[st.ground.maze.ent, 1]]; lock(); } };
for (const id of ['lat', 'wrap', 'L', 'p', 's', 'rock', 'gseed']) $(id).onchange = () => { st.maze = false; sel.value = 'blank'; $('presetNote').textContent = ''; lay(); };
$('lay').onclick = lay; $('lock').onclick = lock; $('unlock').onclick = unlock;
$('plant').onclick = () => { st.clicks = st.maze ? st.clicks : []; plant(); };
for (const id of ['n0', 'n1', 'n2', 'n3', 'h', 'wmode', 'lseed', 'grow', 'live']) $(id).onchange = plant;
$('go').onclick = () => { if (!st.model) return; st.running = !st.running; $('go').textContent = st.running ? 'Pause' : 'Run'; if (st.running) setTimeout(tick, 15); };
$('step1').onclick = () => { if (!st.model) return; stop(); st.model.step(); st.hist.push(st.model.count()); drawLife(); };
$('cv2').onclick = ev => { if (!st.locked) return; const i = cellAt(ev); if (i < 0 || st.ground.rock[i]) return; st.clicks.push([i, +$('clickKind').value]); plant(); };
$('perma').onclick = ev => { ev.preventDefault(); history.replaceState(null, '', $('perma').getAttribute('href')); navigator.clipboard?.writeText(location.href); $('perma').textContent = 'copied'; setTimeout(() => $('perma').textContent = 'copy me', 1500); };
if (!fromHash()) { sel.value = 'oborny-B'; sel.onchange(); }
