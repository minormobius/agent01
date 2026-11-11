// Twin check for www/rhizome/lab/life.js (Modulo, 10-14). Usage: node twin.mjs <abs path to www/rhizome>
// Same ground and same seeds through the checked engines (kit/clone.mjs, piece/clone-piece.mjs) and the lab's:
// every square must match after T steps. Then mutants that must break it, and the formula gate.
import { pathToFileURL } from 'node:url';
const W = process.argv[2]; if (!W) { console.error('usage: node twin.mjs /abs/www/rhizome'); process.exit(2); }
const u = f => pathToFileURL(W + '/' + f).href;
const K = await import(u('kit/clone.mjs')), P = await import(u('piece/clone-piece.mjs')), Lf = await import(u('lab/life.js'));
let fail = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fail++; };
const T = 150;
function ground(lat, cs, seed, wrap = true, rock = 0) { // the lab's pane 1: the kit's own habitat code
  const graph = K.lattice(lat, lat === 'vor' ? 40 : 100, wrap, K.rng((seed ^ 0x2545F491) >>> 0));
  const m = K.sim(cs, seed, { graph, L: graph.L, rock }); return { graph, good: m.good, rock: m.rock, p: cs[0] };
}
function plantOf(gr, seed, n = 50) { const R = K.rng(seed), out = [], used = new Set();
  while (out.length < n) { const i = Math.floor(R() * gr.graph.N); if (gr.rock[i] || used.has(i)) continue; used.add(i); out.push(i); } return out; }
function same(a, b, map) { for (let i = 0; i < a.length; i++) if (map(a[i]) !== b[i]) return false; return true; }
for (const [lat, cs, wrap, rock, wm] of [['sq4', K.CASES.B, true, 0, 'clamp'], ['sq4', K.CASES.C2, true, 0, 'linear'], ['sq8', K.CASES.A3, false, 0.2, 'clamp'], ['hex6c', K.CASES.B, true, 0, 'clamp'], ['vor', K.CASES.C1, true, 0.1, 'clamp']]) {
  const gr = ground(lat, cs, 1007, wrap, rock), cells = plantOf(gr, 99);
  const land = { good: gr.good, rock: gr.rock, p: gr.p, seeds: cells.map((c, k) => [c, k + 1]) }; // 1..25 splitter, 26..50 integrator
  for (const pool of ['genet', 'piece']) {
    const E = pool === 'genet' ? K : P, a = E.sim(cs, 5, { land, graph: gr.graph, wmode: wm, pool });
    const b = Lf.life(gr, cells.map((c, k) => [c, k < 25 ? 0 : pool === 'genet' ? 1 : 2]), { seed: 5, h: cs[2], wmode: wm });
    for (let s = 0; s < T; s++) { a.step(); b.step(); }
    const occ = [...a.gen].filter(x => x).length;
    ok(same(a.gen, b.gen, x => x), `${lat} ${wrap ? 'wrap' : 'open'} rock ${rock} ${wm} ${pool}: ${occ} squares held at t=${T}, all identical`);
  }
  // kind 3 written as the integrator must equal kind 1
  const c1 = Lf.life(gr, cells.map((c, k) => [c, k < 25 ? 0 : 1]), { seed: 5, h: cs[2], wmode: wm });
  const c3 = Lf.life(gr, cells.map((c, k) => [c, k < 25 ? 0 : 3]), { seed: 5, h: cs[2], wmode: wm, grow: 'W(share)', live: 'W(share)' });
  for (let s = 0; s < T; s++) { c1.step(); c3.step(); }
  ok(same(c1.gen, c3.gen, x => x), `${lat}: "yours" with grow = live = W(share) is the integrator`);
  // mutant: "yours" as W(own) must not be the integrator (in a patchy field)
  const m3 = Lf.life(gr, cells.map((c, k) => [c, k < 25 ? 0 : 3]), { seed: 5, h: cs[2], wmode: wm, grow: 'W(own)', live: 'W(share)' });
  for (let s = 0; s < T; s++) m3.step();
  ok(!same(c1.gen, m3.gen, x => x), `${lat}: mutant grow = W(own) differs (caught)`);
}
// the formula gate
for (const bad of ['constructor', 'W.constructor', 'own=1', '"x"', 'a[0]', 'x=>1', 'fetch(1)', 'own.toString', '1e3', '`1`']) {
  let threw = false; try { Lf.compile(bad); } catch { threw = true; } ok(threw, `refuses ${JSON.stringify(bad)}`); }
for (const good of ['W(share)', 'own ? 0.9 : 0.1', 'min(0.9, 0.1 + c*piece)', 'crowd < 0.5 && good >= 0.5 ? 0.8 : 0.2', 'share == 1 ? 0.9 : 0.3']) {
  let threw = false; try { Lf.compile(good); } catch (e) { threw = e.message; } ok(!threw, `accepts ${JSON.stringify(good)}${threw ? ' — ' + threw : ''}`); }
console.log(fail ? `${fail} FAILED` : 'all ok'); process.exit(fail ? 1 : 0);
