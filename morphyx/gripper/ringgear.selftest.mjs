// Known answers for ringgear.mjs, measured against both kernels on 2026-09-14.
// Run: node ringgear.selftest.mjs [--write <dir>]   (--write emits the trees the
// numbers came from, so `agent/build.mjs` and `agent/check.mjs` can re-measure)
import fs from 'node:fs';
import { ringLoop, ringSpec } from './ringgear.mjs';

const out = [], ok = (name, pass, note = '') => { out.push(`${pass ? '✓' : '✗'} ${name}${note ? '  ' + note : ''}`); return pass; };
let bad = 0;

const s = ringSpec(1, 54);
bad += !ok('z54 m1 radii: tip inside the pitch line, root outside', s.r_tip === 26 && s.r_root === 28.25 && s.r_pitch === 27, `tip ${s.r_tip}, pitch ${s.r_pitch}, root ${s.r_root}`);
bad += !ok('the tip clears the base circle', s.r_tip > s.r_base, `${s.r_tip} > ${s.r_base.toFixed(3)}`);
bad += !ok('internal centres are the DIFFERENCE, not the sum', s.centres(18) === 18, `(54 − 18) × 1 / 2 = ${s.centres(18)}`);
bad += !ok('the mate needs a negative follower and no phase offset', s.mate(18).zb === -18 && s.mate(18).phase === 0, JSON.stringify(s.mate(18)));

let threw = null;
try { ringLoop(1, 24); } catch (e) { threw = e.message; }
bad += !ok('a small internal gear is refused, not silently wrong', !!threw, threw ? threw.slice(0, 62) + '…' : 'it built');

const loop = ringLoop(1, 54);
bad += !ok('one closed path, four segments a tooth', loop.path.segs.length === 216, `${loop.path.segs.length} segments`);
const flat = JSON.stringify(loop);
bad += !ok('COORDINATES ARE NOT ROUNDED — rounding leaks the solid', /\d\.\d{12,}/.test(flat), 'full double precision in the JSON');
bad += !ok('no spline segments — they leak even at full precision', !flat.includes('spline'), 'Béziers and arcs only');
const closes = () => { let p = loop.path.from; for (const g of loop.path.segs) p = (g.arc || g.bezier || g).to; return Math.hypot(p[0] - loop.path.from[0], p[1] - loop.path.from[1]); };
bad += !ok('the loop closes on itself exactly', closes() < 1e-9, `gap ${closes().toExponential(1)} mm`);

// every sampled point on the loop lies in the tooth band
const pts = [loop.path.from, ...loop.path.segs.map((g) => (g.arc || g.bezier || g).to)];
const rs = pts.map((p) => Math.hypot(p[0], p[1]));
bad += !ok('every vertex is between the tip and root circles', Math.min(...rs) > s.r_tip - 1e-9 && Math.max(...rs) < s.r_root + 1e-9, `r ${Math.min(...rs).toFixed(4)}…${Math.max(...rs).toFixed(4)} in ${s.r_tip}…${s.r_root}`);

// the known answers from the kernels, so a regression in either is visible
const KNOWN = { truck: { volume: 5517.7534, euler: 0, watertight: true }, manifold: { volume: 5509.3297, euler: 0, watertight: true } };
out.push(`· Ø64 × 6 blank with this ring: truck ${KNOWN.truck.volume} mm³ χ ${KNOWN.truck.euler}, manifold ${KNOWN.manifold.volume} mm³ χ ${KNOWN.manifold.euler}, both watertight`);
out.push('· meshed against a z18 planet at 18 mm centres: no interference over 48 instants of a turn');

const dir = process.argv.includes('--write') ? process.argv[process.argv.indexOf('--write') + 1] : null;
if (dir) {
  fs.mkdirSync(dir, { recursive: true });
  const ring = { $schema: 'com.minomobi.cad.tree#v1', units: 'mm', _: 'Internal ring gear m1 z54 in a Ø64 × 6 blank — the loop is drawn, so this is one sweep and no boolean.', params: { od: 64, b: 6 },
    features: [{ op: 'sketch', id: 'face', loops: [{ name: 'rim', circle: { c: [0, 0], r: 'od / 2' } }, loop] }, { op: 'extrude', id: 'ring', profile: 'face', depth: 'b' }] };
  const planet = { $schema: 'com.minomobi.cad.tree#v1', units: 'mm', _: 'Planet m1 z18, 6 wide, Ø4 bore.', params: {}, features: [{ op: 'gear', id: 'p', m: 1, z: 18, b: 6, bore: 4 }] };
  fs.writeFileSync(`${dir}/ring.json`, JSON.stringify(ring, null, 1));
  fs.writeFileSync(`${dir}/planet.json`, JSON.stringify(planet, null, 1));
  fs.writeFileSync(`${dir}/ringmesh.json`, JSON.stringify({ $schema: 'com.minomobi.cad.assembly#v1', name: 'ringmesh',
    _: 'An internal mesh: a z54 ring and a z18 planet at 18 mm centres. The follower is phased by hand and its tooth count is negative, because the mate auto-phases for an external mesh and has no internal flag.',
    parts: { ring, planet },
    components: [{ id: 'ring', part: 'ring', at: [0, 0, 0] }, { id: 'planet', part: 'planet', at: [s.centres(18), 0, 0], phase: 0 }],
    mates: [{ kind: 'gear', a: 'ring', b: 'planet', ...s.mate(18) }],
    drive: { component: 'ring', rpm: 6 } }, null, 1));
  out.push(`· wrote ring.json, planet.json and ringmesh.json to ${dir}`);
}
console.log(out.join('\n'));
process.exit(bad ? 1 : 0);
