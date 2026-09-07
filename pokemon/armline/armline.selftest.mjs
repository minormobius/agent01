// armline selftest — run before changing arm.js or game.js:
//   node pokemon/armline/armline.selftest.mjs
//
// Two jobs.
//
// FIRST, that the arm is the arm. arm.js claims to be the AR4 MK3's real
// kinematic chain, transcribed from its MIT-licensed URDF, and a transcription
// is exactly the kind of thing that is quietly wrong. So the joint table is
// checked against the numbers in the source files, the chain is checked against
// hand-computed frames for configurations where the answer is known
// independently, and the taught poses are checked to be inside the real joint
// limits and to actually put the tool where they claim.
//
// SECOND, the design claim, which is falsifiable and is measured rather than
// asserted: that skipping the approach waypoint is faster AND drags the gripper
// sideways through the line. If the direct move were no more dangerous than the
// two-leg one, the middle key would be pure ceremony and there would be no game
// in the sequence.

import {
  JOINTS, JOINT_SPEED, L6_LENGTH, GRIPPER, TCP_OFFSET,
  forward, servo, clampToLimits, mMul, mRPY, mTrans, mIdent, mApply,
} from './arm.js';
import {
  CELL, POSES, PARTS, GRIP, SHIFT, KEYS,
  createCell, tickCell, heldTarget, score,
} from './game.js';

let failures = 0;
const ok = (c, m) => { if (!c) { failures++; console.error('  ✗ ' + m); } };
const DEG = Math.PI / 180;
const STEP = 1 / 240;

// ── the joint table is the URDF's joint table ──────────────────────────────
{
  // Transcribed from annin_ar4_description/urdf/ar_macro.xacro and
  // config/mk3.yaml. Written out again here, independently, so that a typo in
  // arm.js has to be made twice in the same way to survive.
  const want = [
    { xyz: [0, 0, 0], axis: [0, 0, 1], lim: [-170, 170] },
    { xyz: [0, 0.0642, -0.16977], axis: [0, 0, -1], lim: [-42, 90] },
    { xyz: [0, -0.305, 0.007], axis: [0, 0, -1], lim: [-89, 52] },
    { xyz: [0, 0, 0], axis: [0, 0, -1], lim: [-180, 180] },
    { xyz: [0, 0, -0.22263], axis: [1, 0, 0], lim: [-105, 105] },
    { xyz: [0, 0, 0.041], axis: [0, 0, 1], lim: [-180, 180] },
  ];
  let bad = 0;
  for (let i = 0; i < 6; i++) {
    const j = JOINTS[i], w = want[i];
    for (let k = 0; k < 3; k++) {
      if (Math.abs(j.xyz[k] - w.xyz[k]) > 1e-9) bad++;
      if (j.axis[k] !== w.axis[k]) bad++;
    }
    if (Math.abs(j.min - w.lim[0] * DEG) > 1e-9) bad++;
    if (Math.abs(j.max - w.lim[1] * DEG) > 1e-9) bad++;
  }
  console.log(`  · 6 joints checked against the URDF: ${bad} mismatched fields`);
  ok(bad === 0, 'the joint table matches the AR4 MK3 URDF field for field');
  ok(Math.abs(JOINT_SPEED - 1.0472) < 1e-9, 'every joint carries the URDF speed limit of 1.0472 rad/s (60 deg/s)');
  ok(Math.abs(L6_LENGTH - 0.041) < 1e-9, 'l6_length is mk3.yaml\'s 0.041 m');
  ok(Math.abs(GRIPPER.jawTravel - 0.014) < 1e-9, 'each jaw travels the gripper macro\'s 14 mm');
}

// ── the chain composes the way URDF says it does ───────────────────────────
{
  // A URDF joint is <origin> THEN a rotation about <axis>. If those were
  // applied the other way round the arm would still look like an arm and would
  // be wrong everywhere off the zero pose, so it is worth checking against a
  // frame worked out by hand.
  //
  // Take joint_1 alone at q = 0. Its origin is a pure roll of pi, so the frame
  // is diag(1, -1, -1): x unchanged, y and z flipped.
  const f0 = forward([0, 0, 0, 0, 0, 0]);
  const j1 = f0.frames[0];
  const expect = [1, 0, 0, 0, 0, -1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1];
  let worst = 0;
  for (let i = 0; i < 16; i++) worst = Math.max(worst, Math.abs(j1[i] - expect[i]));
  ok(worst < 1e-4, `joint_1's frame at zero is the URDF's pi roll (worst element off by ${worst.toExponential(1)})`);

  // Rotating joint_1 must move the tool in a circle about the base axis: the
  // distance from the z axis is invariant, which is a property of the chain
  // rather than of any one number in it.
  const r = (a) => { const { tcp } = forward([a, 0.4, -0.2, 0, 0.9, 0]); return Math.hypot(tcp.x, tcp.y); };
  const r0 = r(0), r1 = r(0.7), r2 = r(-1.2);
  console.log(`  · tool radius from the base axis as joint_1 sweeps: ${r0.toFixed(4)}, ${r1.toFixed(4)}, ${r2.toFixed(4)} m`);
  ok(Math.abs(r1 - r0) < 1e-6 && Math.abs(r2 - r0) < 1e-6,
    'joint_1 rotates the whole arm about the base axis and nothing else');

  // The arm cannot reach further than its links add up to. That bound is the
  // sum of the NORMS of the joint offsets, not of their z components — joint_2
  // is offset in y as well (0.0642) and joint_3 in z (0.007), and a naive sum
  // gives 0.788 m against a real maximum of 0.800, which fails a true arm.
  const links = JOINTS.reduce((a, j) => a + Math.hypot(j.xyz[0], j.xyz[1], j.xyz[2]), 0) + TCP_OFFSET;
  let far = 0;
  for (let a = -1.5; a <= 1.6; a += 0.04) {
    for (let b = -1.6; b <= 0.95; b += 0.04) {
      for (let c = -1.8; c <= 1.8; c += 0.3) {
        const { tcp } = forward([0, a, b, 0, c, 0]);
        far = Math.max(far, Math.hypot(tcp.x, tcp.y, tcp.z));
      }
    }
  }
  console.log(`  · furthest the tool ever gets from the base: ${far.toFixed(3)} m (links sum to ${links.toFixed(3)} m)`);
  ok(far <= links + 1e-6, 'the tool never reaches beyond the sum of the link lengths');
  ok(far > links * 0.85, 'and can very nearly straighten out, so the transcription has not lost a link');
}

// ── the taught poses are legal and land where they claim ───────────────────
{
  const claims = {
    PICK: { x: 0, y: CELL.beltY, z: 0.095 },
    APPROACH: { x: 0, y: CELL.beltY, z: 0.260 },
    BIN: { x: CELL.binX, y: CELL.binY, z: 0.30 },
  };
  for (const [name, q] of Object.entries(POSES)) {
    const inside = q.every((v, i) => v >= JOINTS[i].min - 1e-9 && v <= JOINTS[i].max + 1e-9);
    ok(inside, `${name} is inside the AR4's real joint limits`);
    const { tcp, gripBase } = forward(q);
    const c = claims[name];
    const d = Math.hypot(tcp.x - c.x, tcp.y - c.y, tcp.z - c.z);
    // The tool must point straight down at every taught pose, or the gripper
    // cannot come down onto the belt.
    const o = mApply(gripBase, 0, 0, 0), t = mApply(gripBase, 0, -1, 0);
    const ax = { x: t.x - o.x, y: t.y - o.y, z: t.z - o.z };
    console.log(`  · ${name.padEnd(8)} tcp (${tcp.x.toFixed(3)}, ${tcp.y.toFixed(3)}, ${tcp.z.toFixed(3)})  off by ${(d * 1000).toFixed(1)} mm  tool axis z = ${ax.z.toFixed(3)}`);
    ok(d < 0.006, `${name} puts the tool within 6 mm of where it says it does`);
    ok(ax.z < -0.985, `${name} has the gripper pointing straight down`);
  }
  ok(POSES.PICK[0] === POSES.APPROACH[0] || Math.abs(POSES.PICK[0] - POSES.APPROACH[0]) < 0.01,
    'PICK sits directly under APPROACH, so the approach leg is a vertical descent');
}

// ── the servo obeys the real speed limit ───────────────────────────────────
{
  const from = POSES.BIN, to = POSES.PICK;
  let q = from.slice(), t = 0, worstRate = 0;
  for (let i = 0; i < 6000; i++) {
    const prev = q;
    const r = servo(q, to, STEP);
    q = r.q; t += STEP;
    for (let k = 0; k < 6; k++) worstRate = Math.max(worstRate, Math.abs(q[k] - prev[k]) / STEP);
    if (r.arrived) break;
  }
  const biggest = Math.max(...from.map((v, i) => Math.abs(to[i] - v)));
  console.log(`  · BIN to PICK takes ${t.toFixed(2)} s; largest joint move ${(biggest / DEG).toFixed(0)} deg; fastest joint ${(worstRate / DEG).toFixed(1)} deg/s`);
  ok(worstRate <= JOINT_SPEED + 1e-6, 'no joint ever exceeds the arm\'s 60 deg/s limit');
  ok(Math.abs(t - biggest / JOINT_SPEED) < 0.02,
    'and the move takes exactly as long as its largest joint needs, which is what an unsynchronised joint move does');
}

// ── THE DESIGN CLAIM: what the approach waypoint actually buys ─────────────
{
  // Fly the tool along each route and measure two things: how long it takes,
  // and how far it drags sideways along the line while it is down at part
  // height. The second is the one that matters — a gripper moving sideways at
  // pick height is a gripper going through the parts.
  function fly(route) {
    let q = POSES.BIN.slice();
    let secs = 0, sweptLow = 0, lowest = 99;
    let prev = forward(q).tcp;
    for (const name of route) {
      for (let i = 0; i < 6000; i++) {
        const r = servo(q, POSES[name], STEP);
        q = r.q; secs += STEP;
        const { tcp } = forward(q);
        const overBelt = Math.abs(tcp.y - CELL.beltY) < CELL.beltHalfWidth;
        if (overBelt) {
          lowest = Math.min(lowest, tcp.z);
          if (tcp.z < CELL.beltTopZ + 0.06) sweptLow += Math.abs(tcp.x - prev.x);
        }
        prev = tcp;
        if (r.arrived) break;
      }
    }
    return { secs, sweptLowMm: sweptLow * 1000, lowest };
  }
  const direct = fly(['PICK']);
  const viaApproach = fly(['APPROACH', 'PICK']);

  console.log(`  · BIN -> PICK          ${direct.secs.toFixed(2)} s, drags ${direct.sweptLowMm.toFixed(0)} mm sideways at part height`);
  console.log(`  · BIN -> APPROACH -> PICK  ${viaApproach.secs.toFixed(2)} s, drags ${viaApproach.sweptLowMm.toFixed(0)} mm sideways at part height`);
  console.log(`    the shortcut saves ${(100 * (1 - direct.secs / viaApproach.secs)).toFixed(0)}% of the time`);

  ok(direct.secs < viaApproach.secs * 0.85,
    `the shortcut is genuinely quicker (${direct.secs.toFixed(2)} s against ${viaApproach.secs.toFixed(2)} s) — if it were not, nobody would ever be tempted and the middle key would be free`);
  ok(direct.sweptLowMm > 80,
    `and it comes in sideways across the line (${direct.sweptLowMm.toFixed(0)} mm at part height)`);
  ok(viaApproach.sweptLowMm < 5,
    `while the approach waypoint turns the last leg into a vertical descent (${viaApproach.sweptLowMm.toFixed(0)} mm) — this is why real robot programs carry approach points, and it is measured here rather than asserted`);

  // Now the consequence, in the game rather than in the abstract: fly both
  // routes at a belt full of parts and count what gets scattered.
  function run(route, seed) {
    const st = createCell({ seed });
    const held = [false, false, false, false];
    const press = (name) => { held[0] = name === 'BIN'; held[1] = name === 'APPROACH'; held[2] = name === 'PICK'; };
    for (const name of route) {
      press(name);
      for (let i = 0; i < 6000; i++) {
        tickCell(st, STEP, held);
        if (st.arrived || st.over) break;
      }
    }
    return st;
  }
  const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
  const mean = (route) => SEEDS.reduce((a, s) => a + run(route, s).scrap, 0) / SEEDS.length;
  const scrapDirect = mean(['PICK']);
  const scrapVia = mean(['APPROACH', 'PICK']);
  console.log(`  · over ${SEEDS.length} lines, going straight in scatters ${scrapDirect.toFixed(2)} parts a trip; going via the approach point scatters ${scrapVia.toFixed(2)}`);
  ok(scrapDirect > scrapVia + 0.4,
    `and it costs parts (${scrapDirect.toFixed(2)} against ${scrapVia.toFixed(2)} scattered per trip) — the shortcut has to actually hurt, or the fast way is simply the right way`);
}

// ── the cell does what it says ─────────────────────────────────────────────
{
  // Priority when several pose keys are down at once.
  ok(heldTarget([true, true, true, false]) === 'PICK', 'PICK wins when several pose keys are held');
  ok(heldTarget([true, true, false, false]) === 'APPROACH', 'then APPROACH');
  ok(heldTarget([false, false, false, true]) === null, 'and the grip key alone commands no move');

  // A full cycle: approach, pick, close on something, carry to the tote, open.
  const st = createCell({ seed: 12 });
  const held = [false, false, false, false];
  const runFor = (secs) => { for (let i = 0; i < secs / STEP; i++) tickCell(st, STEP, held); };
  const goTo = (i) => {
    held[0] = held[1] = held[2] = false; held[i] = true;
    for (let k = 0; k < 6000 && !st.arrived; k++) tickCell(st, STEP, held);
    for (let k = 0; k < 6000; k++) { tickCell(st, STEP, held); if (st.arrived) break; }
  };
  goTo(1); goTo(2);
  const atPick = { ...st.tcp };
  ok(Math.abs(atPick.z - 0.095) < 0.01, 'the arm reaches pick height');
  // Wait for something to arrive under the jaws, then close AND KEEP CLOSING.
  // The jaws take 0.22 s to shut and the belt runs at 105 mm/s, so a part
  // travels 23 mm during the close — more than the grasp radius. A controller
  // that only holds the key while the part is dead centre lets go again before
  // the jaws have met, which is a real property of the cell and was worth
  // discovering here rather than on the page: you have to commit early.
  let grabbed = false, committed = false;
  for (let i = 0; i < 40 / STEP && !grabbed; i++) {
    if (!committed) {
      // Close once something is one close-time short of the tool.
      const lead = CELL.beltSpeed * GRIP.closeSecs;
      committed = st.parts.some((p) => p.onBelt
        && Math.abs(p.y - st.tcp.y) < 0.05
        && p.x > st.tcp.x - lead - 0.02 && p.x < st.tcp.x - lead + 0.03);
    }
    held[3] = committed;
    tickCell(st, STEP, held);
    if (st.holding) grabbed = true;
  }
  ok(grabbed, 'closing the jaws on a part in the gripper picks it up');
  const kind = st.holding && st.holding.kind;
  goTo(1); goTo(0);
  ok(st.holding !== null, 'and the part stays in the jaws through the move to the tote');
  held[3] = false;
  runFor(0.6);
  ok(st.holding === null, 'opening the jaws over the tote lets it go');
  if (kind === 'reject') ok(st.picked === 1, 'a red one delivered to the tote counts');
  else ok(st.wrongPart === 1, 'a blue one delivered to the tote is a wrong part');

  // Dropping anywhere else is scrap on the floor, not a delivery.
  const st2 = createCell({ seed: 5 });
  st2.holding = st2.parts.find((p) => p.onBelt);
  st2.holding.held = true; st2.holding.onBelt = false;
  st2.jaw = 0;
  // Keep gripping while moving away from the tote — the cell starts AT the
  // tote, so a rig that lets go immediately performs a delivery, not a drop.
  const h2 = [false, false, true, true];
  for (let i = 0; i < 6000; i++) { tickCell(st2, STEP, h2); if (st2.arrived) break; }
  h2[3] = false;
  for (let i = 0; i < 200; i++) tickCell(st2, STEP, h2);
  console.log(`  · a part released away from the tote: dropped ${st2.dropped}, scrap ${st2.scrap}`);
  ok(st2.dropped === 1 && st2.holding === null, 'letting go anywhere but the tote drops the part on the floor');

  // The line never runs out and never stacks up on itself.
  const st3 = createCell({ seed: 9 });
  let minGap = 99;
  for (let i = 0; i < 90 / STEP; i++) {
    tickCell(st3, STEP, [false, false, false, false]);
    if (i % 240 === 0) {
      const xs = st3.parts.filter((p) => p.onBelt).map((p) => p.x).sort((a, b) => a - b);
      for (let k = 1; k < xs.length; k++) minGap = Math.min(minGap, xs[k] - xs[k - 1]);
    }
  }
  const onBelt = st3.parts.filter((p) => p.onBelt).length;
  console.log(`  · after 90 s of line: ${onBelt} parts in the cell, closest pair ${(minGap * 1000).toFixed(0)} mm apart`);
  ok(onBelt > 4, 'the line keeps feeding');
  ok(minGap > PARTS.gapMin - 1e-6, 'and parts never overlap each other');
  ok(st3.scrap === 0 && st3.picked === 0, 'and an idle arm neither scores nor scraps');
}

if (failures) {
  console.error(`\n✗ armline selftest FAILED — ${failures} assertion(s)\n`);
  process.exit(1);
}
console.log('✓ armline selftest passed — the chain is the AR4 MK3\'s own URDF, the taught poses are legal and land where they claim, no joint outruns 60 deg/s, and skipping the approach waypoint is measurably faster and measurably scatters the line');
