// ratchet-map.mjs — which poses of the ratchet assembly are physically possible,
// and can the wheel get from one pose to another without the parts passing through
// each other? Pins each input to one value, runs the engine's own interference
// check (agent/check.mjs, Manifold volumes), prints a map ('#' = wheel and pawl
// overlap, '.' = clear), then searches the clear cells for a path.
// usage (from engines/cad): node ../../shelf/cad/ratchet-map.mjs ../../shelf/cad/ratchet-asm.json [step°]
//   — Morphyx, 10-23
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const src = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const st = Number(process.argv[3] || 3);
const range = (a, b) => { const o = []; for (let x = a; x <= b + 1e-9; x += st) o.push(+x.toFixed(3)); return o; };
const turns = range(-22, 6), lifts = range(0, 18);
const tmp = '/tmp/ratchet-pose.json';
const clear = (t, l) => {
  const d = structuredClone(src);
  d.inputs.turn = { ...d.inputs.turn, min: t, max: t + 1e-6, steps: 2 };   // engine refuses min == max
  d.inputs.lift = { ...d.inputs.lift, min: l, max: l + 1e-6, steps: 2 };
  writeFileSync(tmp, JSON.stringify(d));
  let out; try { out = execFileSync('node', ['agent/check.mjs', tmp, '--grid', '--json'], { stdio: ['ignore', 'pipe', 'ignore'] }); } catch (e) { out = e.stdout; }
  return !JSON.parse(out).pairs.some((p) => p.a !== 'frame' && p.b !== 'frame' && p.volume > 0.01);
};
const G = lifts.map((l) => turns.map((t) => clear(t, l)));
console.log('lift\\turn ' + turns.map((t) => String(t).padStart(4)).join(''));
for (let i = lifts.length - 1; i >= 0; i--) console.log(String(lifts[i]).padStart(9) + ' ' + G[i].map((c) => (c ? '   .' : '   #')).join(''));
// 4-neighbour search over clear cells, from rest (turn 0, lift 0)
const key = (i, j) => i + ',' + j, i0 = 0, j0 = turns.indexOf(0), seen = new Set([key(i0, j0)]), q = [[i0, j0]];
while (q.length) { const [i, j] = q.shift(); for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const I = i + a, J = j + b; if (G[I]?.[J] && !seen.has(key(I, J))) { seen.add(key(I, J)); q.push([I, J]); } } }
const reach = (t, maxLift) => lifts.some((l, i) => l <= maxLift && seen.has(key(i, turns.indexOf(t))));
const low = lifts.filter((l) => l <= 6).at(-1);
console.log(`\nforward a full tooth (turn -18) with the pawl back down (lift <= ${low}): ${reach(-18, low) ? 'reachable' : 'NOT reachable'}`);
console.log(`backward (turn +${turns.at(-1)}) with the pawl at or below lift ${low}: ${reach(turns.at(-1), low) ? 'reachable — the ratchet does not hold' : 'not reachable — it holds'}`);
const need = lifts.find((l, i) => seen.has(key(i, turns.length - 1)));
console.log(`lowest lift that lets it go backward: ${need ?? 'none in range'}°`);
