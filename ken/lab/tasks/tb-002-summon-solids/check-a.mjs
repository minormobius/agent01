/* tb-002 · check A — the placement, against table-free invariants.

   THE FIRST VERSION OF THIS FILE CARRIED ITS OWN TABLE of face normals
   and got two of them wrong: it used (0, 1/phi, phi) for the
   dodecahedron where the answer is (0, 1, phi), and its de-duplicator
   silently ate twelve of the icosahedron's twenty. It failed correct
   geometry by 10.8 degrees and by a missing count.

   That is precisely the failure this task is about, committed while
   writing the check for it: a checker grading against a remembered
   reference retires work that was fine, and the retirement looks like
   evidence.

   So this file carries NO coordinates. It asserts properties that are
   true of the intended solid and false of anything else, and every one
   of them is checkable without knowing where the faces point:

     the bisector identity   normal is M(n - c), from the definition of
                             an equidistant surface under metric M
     face count              4, 6, 8, 12, 20
     centred                 the unit normals of a Platonic solid sum to
                             zero
     FACE-TRANSITIVE         every Platonic solid is isohedral, so the
                             sorted multiset of angles from one face
                             normal to all the others is THE SAME for
                             every face. This is what regularity means
                             and it is what a wrongly-placed
                             constellation destroys, because a metric
                             rotates off-axis normals and leaves
                             axis-aligned ones alone.
     equal inradius          every face at the r that was asked for

   Usage: node check-a.mjs [path-to-solution]   (default: ./reference.mjs) */
const path = process.argv[2] ?? './reference.mjs';
const M = await import(new URL(path, import.meta.url).href);

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log(`  x ${m}`); } };

const sub = (p, q) => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (v) => { const L = Math.hypot(...v) || 1; return v.map((x) => x / L); };
const angleDeg = (a, b) => {
  const c = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  return Math.atan2(Math.hypot(...c), dot(a, b)) * 180 / Math.PI;
};
const COUNTS = { tetrahedron: 4, cube: 6, octahedron: 8, dodecahedron: 12, icosahedron: 20 };

for (const [name, faces] of Object.entries(COUNTS)) {
  for (const aniso of [1, 2.2, 5]) {
    for (const rotate of [0, 0.6283185307179586]) {
      const tag = `${name} aniso ${aniso} rot ${rotate}`;
      let con;
      try { con = M.constellation(name, { centre: [3, 4, 5], r: 1.5, aniso, rotate }); }
      catch (e) { ok(false, `${tag}: threw ${e.message}`); continue; }

      ok(con.neighbours?.length === faces, `${tag}: ${faces} neighbours`);
      ok(Array.isArray(con.seeds) && con.seeds.length === faces + 1, `${tag}: seeds is centre plus neighbours`);
      ok(con.seeds?.[0]?.every((x, i) => Math.abs(x - [3, 4, 5][i]) < 1e-12), `${tag}: the centre is the first seed`);
      if (con.neighbours?.length !== faces) continue;

      // the identity: a point equidistant under M lies on a plane with normal M(n-c)
      const normals = [], dists = [];
      for (const n of con.neighbours) {
        const d = sub(n, con.centre);
        const Md = [d[0], d[1] * aniso, d[2]];
        const L = Math.hypot(...Md) || 1;
        normals.push(Md.map((x) => x / L));
        dists.push(0.5 * dot(d, Md) / L);
      }

      ok(Math.abs(Math.min(...dists) - 1.5) < 1e-6 && Math.abs(Math.max(...dists) - 1.5) < 1e-6,
        `${tag}: every face at the requested inradius (${Math.min(...dists).toFixed(6)}..${Math.max(...dists).toFixed(6)})`);

      const sum = normals.reduce((a, v) => [a[0] + v[0], a[1] + v[1], a[2] + v[2]], [0, 0, 0]);
      ok(Math.hypot(...sum) < 1e-9, `${tag}: the unit normals sum to zero (got ${Math.hypot(...sum).toFixed(9)})`);

      // FACE-TRANSITIVE: the angle multiset from each normal is identical
      const sigs = normals.map((a) => normals.map((b) => angleDeg(a, b)).sort((x, y) => x - y));
      let worst = 0;
      for (const s of sigs) for (let i = 0; i < s.length; i++) worst = Math.max(worst, Math.abs(s[i] - sigs[0][i]));
      ok(worst < 1e-6, `${tag}: face-transitive — every face sees the same angles (worst spread ${worst.toFixed(6)} deg)`);

      // and no two faces coincide, which face-transitivity alone would allow
      const offDiag = sigs[0].filter((x) => x > 1e-9);
      ok(offDiag.length === faces - 1 && offDiag[0] > 30,
        `${tag}: ${faces - 1} distinct other faces, nearest at ${offDiag[0]?.toFixed(2)} deg`);
    }
  }
}

// ── the module's own bisectors() must agree with the identity ──────────
for (const name of ['cube', 'dodecahedron']) {
  const con = M.constellation(name, { r: 2, aniso: 2.2 });
  const bs = M.bisectors(con, 2.2);
  ok(bs.length === COUNTS[name], `${name}: bisectors returns one plane per neighbour`);
  for (let i = 0; i < bs.length; i++) {
    const d = sub(con.neighbours[i], con.centre);
    const Md = [d[0], d[1] * 2.2, d[2]];
    ok(angleDeg(unit(bs[i].normal), unit(Md)) < 1e-9, `${name} face ${i}: bisectors() normal matches the identity`);
    ok(Math.abs(Math.hypot(...bs[i].normal) - 1) < 1e-12, `${name} face ${i}: and is a unit vector`);
    ok(Math.abs(bs[i].distance - 2) < 1e-9, `${name} face ${i}: at the requested inradius`);
  }
}

// ── malformed arguments are refused rather than answered ───────────────
let threw = 0;
for (const bad of [['sphere', {}], ['cube', { r: 0 }], ['cube', { r: -1 }], ['cube', { aniso: 0 }], ['cube', { aniso: -2 }]]) {
  try { M.constellation(bad[0], bad[1]); } catch { threw++; }
}
ok(threw === 5, `every malformed argument is refused (${threw} of 5)`);

console.log(`${fail === 0 ? 'PASS' : 'FAIL'} check-a — ${fail === 0 ? pass : `${fail} of ${pass + fail}`} checks`);
process.exit(fail === 0 ? 0 : 1);
