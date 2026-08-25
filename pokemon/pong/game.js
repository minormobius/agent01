// game.js — the bat, the rally, the rival, the score.
//
// No rendering and no DOM. index.html drives this and scene.js draws whatever
// it produces; pong.selftest.mjs drives it with no browser at all.

import {
  BALL, TABLE, PLAYER_X, RIVAL_X, CONTACT,
  impact, flightStep, add, sub, scale, len, spinRatio,
} from './aero.js';

// ---------------------------------------------------------------------------
// The bat
// ---------------------------------------------------------------------------
//
// It is a disc that never leaves ONE PLANE. Its face always points straight
// down the table — you cannot open it, close it, or angle it. Every single
// thing you control comes out of the velocity the bat happens to have at the
// instant of contact.
//
// THE PLANE LEANS FORWARD, and that is not a detail — it is the difference
// between a game and a demonstration.
//
// The first version had it vertical, which is the obvious reading and looks
// right on paper: the bat only moves up, down and across, so the ball leaves at
// the restitution times the speed it arrived with and everything you do is
// pure spin. Then the selftest flew a rally and the rally died. Air drag takes
// roughly 40% of a table tennis ball's speed in a single crossing — it is a
// 2.7 g ball with the frontal area of a golf ball — and a bat that cannot
// advance has no way to put that back. A serve leaving at 6.2 m/s arrived at
// the far bat doing 2.9, and the return could not reach the net.
//
// Leaning the stroke plane forward fixes it without giving anything back: the
// bat still has exactly two degrees of freedom and its face is still fixed, but
// brushing UP now also carries the bat FORWARD into the ball, so one key buys
// pace and topspin together in a fixed ratio. Which is, as it happens, exactly
// what a loop is, and exactly why a looper cannot hit hard without spinning
// hard.
export const STROKE_DEG = 30;
export const STROKE_TILT = (STROKE_DEG * Math.PI) / 180;
export const STROKE_TAN = Math.tan(STROKE_TILT);

/// How far the bat face is CLOSED: its normal tips forward and DOWN by this
/// much. Also fixed. A face perpendicular to the table turns brush into loft at
/// one to one, and loft is what sends a shot long — so a bat you cannot close
/// can only ever lob. Closing it aims the normal impulse downward, which is
/// exactly what a real looper's closed bat is for, and it is what lets brush
/// speed buy spin without buying height.
export const FACE_DEG = 12;
export const FACE_CLOSE = (FACE_DEG * Math.PI) / 180;

export const BAT = {
  radius: 0.075,
  drive: 160, // m/s^2 while a key is held
  damp: 12, // 1/s; terminal speed is drive/damp = 13.3 m/s along the plane
  minY: -0.80,
  maxY: 0.80,
  minZ: -0.36,
  maxZ: 0.86,
  restY: 0,
  restZ: 0.16,
};

/// The face normal. Fixed, and pointing down the table.
export const PLAYER_N = [Math.cos(FACE_CLOSE), 0, -Math.sin(FACE_CLOSE)];
export const RIVAL_N = [-Math.cos(FACE_CLOSE), 0, -Math.sin(FACE_CLOSE)];

/// Which way this bat faces: +1 down the table, -1 back up it.
///
/// Once the face is CLOSED, n[0] is +-cos(12 deg) = +-0.978, not +-1, and using
/// it as a side sign is then quietly wrong everywhere. It cost an afternoon:
/// the rival's aiming multiplied its target depth by -n[0] and so aimed at its
/// OWN half of the table, and every rally ended on the second stroke. A normal
/// is a direction, not a sign.
export const dirOf = (n) => (n[0] < 0 ? -1 : 1);

/// `x0` is where the plane crosses table height; the bat's actual x follows its
/// height, because the plane is tilted.
export function newBat(x0, n) {
  const b = { x0, n, y: BAT.restY, z: BAT.restZ, vy: 0, vz: 0, x: 0 };
  placeBat(b);
  return b;
}

function placeBat(b) {
  b.x = b.x0 + dirOf(b.n) * b.z * STROKE_TAN;
}

/// One bat substep. `up`/`down`/`left`/`right` are booleans.
export function stepBat(bat, dt, c) {
  const ay = (c.left ? BAT.drive : 0) - (c.right ? BAT.drive : 0) - BAT.damp * bat.vy;
  const az = (c.up ? BAT.drive : 0) - (c.down ? BAT.drive : 0) - BAT.damp * bat.vz;
  bat.vy += ay * dt;
  bat.vz += az * dt;
  bat.y += bat.vy * dt;
  bat.z += bat.vz * dt;
  // Hitting the edge of your reach stops you dead. It does not bounce you back
  // — a wall that returned energy would hand out free brush speed.
  if (bat.y < BAT.minY) { bat.y = BAT.minY; bat.vy = Math.max(0, bat.vy); }
  if (bat.y > BAT.maxY) { bat.y = BAT.maxY; bat.vy = Math.min(0, bat.vy); }
  if (bat.z < BAT.minZ) { bat.z = BAT.minZ; bat.vz = Math.max(0, bat.vz); }
  if (bat.z > BAT.maxZ) { bat.z = BAT.maxZ; bat.vz = Math.min(0, bat.vz); }
  placeBat(bat);
}

/// The bat's velocity in the world. `vz` is its speed up the stroke plane, and
/// the plane's lean turns part of that into travel down the table.
export const batVel = (bat) => [dirOf(bat.n) * bat.vz * STROKE_TAN, bat.vy, bat.vz];

/// Signed distance in front of a bat's stroke plane. Positive is still to come.
/// The plane is TILTED, so "have we reached the bat yet" is not a comparison
/// against a single x — getting that wrong made the rival aim its shot for a
/// contact point 17 cm from where the contact actually happened, which is
/// enough to miss the table with every ball.
export const planeAhead = (p, x0, n) => {
  const d = dirOf(n);
  return (p[0] - x0 - d * p[2] * STROKE_TAN) * d;
};

// ---------------------------------------------------------------------------
// The rally
// ---------------------------------------------------------------------------

export const SIDE = { PLAYER: -1, RIVAL: 1 };

const onTable = (p) =>
  Math.abs(p[0]) <= TABLE.halfLength + BALL.R && Math.abs(p[1]) <= TABLE.halfWidth + BALL.R;

/// Deterministic PRNG, so a seed reproduces a match exactly. Same one the other
/// pages on this surface use.
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

export function newGame(seed = 12345, difficulty = 0.5) {
  const g = {
    rand: rng(seed),
    difficulty,
    player: newBat(PLAYER_X, PLAYER_N),
    rival: newBat(RIVAL_X, RIVAL_N),
    ball: null,
    score: { player: 0, rival: 0 },
    /// Cumulative across matches; the match score above resets at 11.
    total: { player: 0, rival: 0 },
    games: 0,
    rally: 0,
    bestRally: 0,
    /// Who hit last, and what the ball has touched since.
    owner: SIDE.RIVAL,
    bounced: 0,
    bouncedSide: 0,
    phase: 'serve',
    since: 0,
    message: 'serve incoming',
    lastPoint: null,
    /// Filled in on every player contact, for the readout.
    lastHit: null,
    /// What each side intends this shot. Recomputed per ball; see autopilot().
    planP: null,
    planR: null,
    t: 0,
  };
  serve(g);
  return g;
}

function serve(g) {
  const r = g.rand;
  const y0 = (r() - 0.5) * 0.5;
  const vy = (r() - 0.5) * 0.8;
  const speed = 8.0 + r() * 0.9;
  const spin = [0, -(200 + r() * 140), 0];
  const pos = [RIVAL_X + 0.05, y0, 0.36];
  const targetX = -0.50 - r() * 0.55;

  // SOLVE the feed rather than guessing it. The first version picked a
  // plausible-looking launch and fired: with the topspin it carries, it hit the
  // net on about half of all serves and handed the player a free point, which
  // then flattered every scripted player in the selftest into looking competent.
  // A rally that starts with a fault is not a rally.
  let lo = -0.30, hi = 0.60, vel = null;
  for (let i = 0; i < 22; i++) {
    const th = 0.5 * (lo + hi);
    vel = [-speed * Math.cos(th), vy, speed * Math.sin(th)];
    const land = landing(vel, spin, pos);
    // More elevation carries it FURTHER, which for a ball travelling in -x
    // means a SMALLER x. Reading that the wrong way round drove the bisection
    // to the wrong end of its bracket and served every ball into the rival's
    // own half.
    if (land.netted) lo = th;
    else if (land.x < targetX) hi = th;
    else lo = th;
  }

  g.ball = { pos, vel, spin };
  g.owner = SIDE.RIVAL;
  g.bounced = 0;
  g.bouncedSide = 0;
  g.phase = 'live';
  g.since = 0;
  g.planP = null;
  g.planR = null;
  g.rally = 0;
  g.message = 'return it';
}

function point(g, winner, why) {
  if (g.phase !== 'live') return;
  g.phase = 'point';
  g.since = 0;
  if (winner === SIDE.PLAYER) { g.score.player++; g.total.player++; }
  else { g.score.rival++; g.total.rival++; }
  g.bestRally = Math.max(g.bestRally, g.rally);
  g.lastPoint = { winner, why, rally: g.rally };
  g.message = (winner === SIDE.PLAYER ? 'your point — ' : 'their point — ') + why;
}

/// Substep length. Contacts are found by crossing tests inside a substep, so
/// this has to be short enough that a 25 m/s ball does not jump a 40 mm bat:
/// 25/480 = 52 mm, which is why the contact test uses the crossing point rather
/// than the endpoint.
export const SUBSTEP = 1 / 480;

/// Advance the whole game by `dt` seconds. `input` has Q/W/O/P booleans.
export function stepGame(g, dt, input) {
  let left = Math.min(dt, 0.1);
  while (left > 1e-9) {
    const h = Math.min(SUBSTEP, left);
    left -= h;
    g.t += h;
    g.since += h;

    stepBat(g.player, h, {
      up: !!input.Q, down: !!input.W, left: !!input.O, right: !!input.P,
    });

    if (g.phase === 'live') {
      driveRival(g);
      stepBat(g.rival, h, g.rivalCtl || {});
      advanceBall(g, h);
    } else if (g.since > 1.4) {
      if (g.score.player >= 11 || g.score.rival >= 11) {
        g.score.player = 0;
        g.score.rival = 0;
        g.games++;
      }
      serve(g);
    }
  }
}

function advanceBall(g, h) {
  const b = g.ball;
  const p0 = b.pos;
  flightStep(b, h);
  const p1 = b.pos;

  // --- the net ---
  // Checked first: a ball that clips the net is out whatever it does next.
  // Only on a genuine sign change, so the interpolation parameter is inside
  // [0, 1] — a "close to the net" test that also fired while the ball sat a
  // centimetre past it extrapolated the height far outside the substep and
  // called net on shots that had cleared it.
  const netted = (p0[0] < 0) !== (p1[0] < 0)
    ? (() => {
        const t = crossFrac(p0[0], p1[0], 0);
        const z = p0[2] + (p1[2] - p0[2]) * t;
        const y = p0[1] + (p1[1] - p0[1]) * t;
        return z < TABLE.netHeight + BALL.R && Math.abs(y) < TABLE.netHalfWidth;
      })()
    : Math.abs(p1[0]) < BALL.R
      && p1[2] < TABLE.netHeight + BALL.R
      && Math.abs(p1[1]) < TABLE.netHalfWidth;
  if (netted) {
    point(g, -g.owner, 'into the net');
    return;
  }

  // --- the table ---
  if (p0[2] > BALL.R && p1[2] <= BALL.R) {
    const t = crossFrac(p0[2], p1[2], BALL.R);
    const hit = lerp3(p0, p1, t);
    if (onTable(hit)) {
      const side = hit[0] < 0 ? SIDE.PLAYER : SIDE.RIVAL;
      b.pos = [hit[0], hit[1], BALL.R];
      const out = impact(b.vel, b.spin, [0, 0, 1], [0, 0, 0], CONTACT.table.e, CONTACT.table.mu);
      if (out) { b.vel = out.vel; b.spin = out.spin; }
      if (side === g.owner) {
        // A shot has to cross. Landing back on your own side is a fault.
        // (Rallies here start with a feed from behind the far baseline, not a
        // service, so there is no legal own-half bounce to make room for.)
        point(g, -g.owner, 'did not cross');
        return;
      }
      g.bounced++;
      g.bouncedSide = side;
      if (g.bounced >= 2) {
        point(g, g.owner, 'two bounces');
        return;
      }
    }
  }

  // --- the floor ---
  if (p1[2] < -TABLE.height + BALL.R) {
    point(g, g.bounced >= 1 ? g.owner : -g.owner, g.bounced >= 1 ? 'not returned' : 'long');
    return;
  }

  // --- the bats ---
  tryBat(g, p0, p1, g.player, SIDE.PLAYER);
  tryBat(g, p0, p1, g.rival, SIDE.RIVAL);

  // Past a bat and still going: the rally is over, and WHO LOSES depends on
  // whether the ball ever touched the table. If it bounced on the receiver's
  // half and they did not get to it, the striker wins. If it never bounced at
  // all, the striker hit it long and loses. The first version awarded both to
  // the same side, which made hitting the ball out a winning move and made a
  // scripted player who brushed at random score exactly as well as one that
  // aimed.
  if (b.pos[0] < PLAYER_X - 0.35 || b.pos[0] > RIVAL_X + 0.35) {
    point(g, g.bounced >= 1 ? g.owner : -g.owner,
      g.bounced >= 1 ? 'not returned' : 'long');
  }
}

function tryBat(g, p0, p1, bat, side) {
  const b = g.ball;
  const toward = side === SIDE.PLAYER ? p1[0] < p0[0] : p1[0] > p0[0];
  if (!toward) return;
  const f0 = planeAhead(p0, bat.x0, bat.n);
  const f1 = planeAhead(p1, bat.x0, bat.n);
  if (!(f0 > 0 && f1 <= 0)) return;

  const t = crossFrac(f0, f1, 0);
  const at = lerp3(p0, p1, t);
  const reach = Math.hypot(at[1] - bat.y, at[2] - bat.z);
  if (reach > BAT.radius + BALL.R) return;

  const V = batVel(bat);
  const out = impact(b.vel, b.spin, bat.n, V, CONTACT.bat.e, CONTACT.bat.mu);
  if (!out) return;

  // A ball you hit before it has bounced on your side is a volley, which is not
  // legal in table tennis.
  if (g.bounced === 0 && g.owner !== side) {
    point(g, -side, 'volley');
    return;
  }

  b.pos = [at[0] + dirOf(bat.n) * (BALL.R + 0.002), at[1], at[2]];
  b.vel = out.vel;
  b.spin = out.spin;
  g.owner = side;
  g.bounced = 0;
  g.rally++;
  if (side === SIDE.PLAYER) {
    g.lastHit = {
      brush: Math.hypot(V[1], V[2]),
      brushY: V[1],
      brushZ: V[2],
      speed: len(out.vel),
      spin: len(out.spin),
      alpha: spinRatio(len(out.vel), len(out.spin)),
      sliding: out.sliding,
      offCentre: reach,
      t: g.t,
    };
    g.message = '';
  }
}

const crossFrac = (a, b, at) => (a === b ? -1 : (a - at) / (a - b));
const lerp3 = (a, b, t) => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

// ---------------------------------------------------------------------------
// The rival
// ---------------------------------------------------------------------------
//
// It plays by the same rules through the same physics, and it aims the same way
// a person would have to: it does not have an equation for where a shot lands,
// because there isn't one. It flies candidate shots forward through `flightStep`
// and picks the brush that lands where it wants. That is a real inverse problem
// solved by search, and it is also a nice property of the design — if the rival
// can consistently find a brush that lands a shot in, the control the player has
// is genuinely there.

/// Fly a hypothetical ball and report where it first touches the table.
export function landing(vel, spin, pos, noMagnus = false) {
  const b = { pos: pos.slice(), vel: vel.slice(), spin: spin.slice() };
  let netted = false;
  for (let i = 0; i < 2400; i++) {
    const p0 = b.pos;
    flightStep(b, SUBSTEP, noMagnus);
    const p1 = b.pos;
    if ((p0[0] < 0) !== (p1[0] < 0)) {
      const t = crossFrac(p0[0], p1[0], 0);
      const z = p0[2] + (p1[2] - p0[2]) * t;
      if (z < TABLE.netHeight + BALL.R) netted = true;
    }
    if (p0[2] > BALL.R && p1[2] <= BALL.R) {
      const t = crossFrac(p0[2], p1[2], BALL.R);
      const hit = lerp3(p0, p1, t);
      return { x: hit[0], y: hit[1], netted, flight: i * SUBSTEP, apex: null };
    }
    if (p1[2] < -1.0) break;
  }
  return { x: b.pos[0], y: b.pos[1], netted, flight: 2400 * SUBSTEP, off: true };
}

/// Where and when the ball will reach `x`, by flying it forward.
function predict(ball, x, n) {
  const b = { pos: ball.pos.slice(), vel: ball.vel.slice(), spin: ball.spin.slice() };
  for (let i = 0; i < 2400; i++) {
    const p0 = b.pos;
    flightStep(b, SUBSTEP);
    const p1 = b.pos;
    if (p0[2] > BALL.R && p1[2] <= BALL.R) {
      const t = crossFrac(p0[2], p1[2], BALL.R);
      const hit = lerp3(p0, p1, t);
      if (onTable(hit)) {
        b.pos = [hit[0], hit[1], BALL.R];
        const out = impact(b.vel, b.spin, [0, 0, 1], [0, 0, 0], CONTACT.table.e, CONTACT.table.mu);
        if (out) { b.vel = out.vel; b.spin = out.spin; }
      }
    }
    const f0 = planeAhead(p0, x, n);
    const f1 = planeAhead(p1, x, n);
    if (f0 > 0 && f1 <= 0) {
      const t = crossFrac(f0, f1, 0);
      const at = lerp3(p0, p1, t);
      return { y: at[1], z: at[2], dt: i * SUBSTEP, vel: b.vel.slice(), spin: b.spin.slice() };
    }
  }
  return null;
}

/// Fly ONE hypothetical shot: an incoming ball, a contact point, a brush, and
/// where it would land. Shared by the rival's aiming, the scripted players in
/// the selftest, and the with/without-Magnus experiment, so all three are asking
/// the game the same question rather than three re-derivations of it.
export function tryShot(incVel, incSpin, at, vz, vy, n, x0, noMagnus = false) {
  const d = dirOf(n);
  const V = [d * vz * STROKE_TAN, vy, vz];
  const out = impact(incVel, incSpin, n, V, CONTACT.bat.e, CONTACT.bat.mu);
  if (!out) return null;
  // Clear of the bat face, on the far side, at the height the plane puts it.
  const pos = [x0 + d * (at.z * STROKE_TAN + BALL.R + 0.02), at.y, at.z];
  const land = landing(out.vel, out.spin, pos, noMagnus);
  const legal = !land.netted
    && land.x * d > 0.05
    && Math.abs(land.x) <= TABLE.halfLength
    && Math.abs(land.y) <= TABLE.halfWidth;
  return {
    out, land, legal, pos,
    speed: len(out.vel),
    spin: len(out.spin),
    alpha: spinRatio(len(out.vel), len(out.spin)),
  };
}

/// The range of brush speeds that put a legal shot on the table, for one
/// incoming ball. This is the game's whole margin for error, and section 4 of
/// the selftest measures how much of it the aerodynamics is responsible for.
export function legalWindow(incVel, incSpin, at, n, x0, noMagnus = false) {
  const top = BAT.drive / BAT.damp;
  let lo = null, hi = null;
  for (let v = -top; v <= top + 1e-9; v += 0.05) {
    const s = tryShot(incVel, incSpin, at, v, 0, n, x0, noMagnus);
    if (s && s.legal) { if (lo === null) lo = v; hi = v; }
  }
  return lo === null ? { lo: 0, hi: 0, width: 0, any: false } : { lo, hi, width: hi - lo, any: true };
}

/// Search for the brush that puts the shot at `targetX`. Bisection, because
/// landing distance rises with brush over the whole reachable range — up to the
/// point where the topspin starts winning, which is past anything legal.
export function solveBrush(incVel, incSpin, at, targetX, targetY, n, x0) {
  const d = dirOf(n);
  let lo = -10;
  let hi = BAT.drive / BAT.damp;
  let best = null;
  for (let i = 0; i < 24; i++) {
    const mid = 0.5 * (lo + hi);
    const s = tryShot(incVel, incSpin, at, mid, 0, n, x0);
    if (!s) return null;
    const reach = s.land.netted ? -99 * d : s.land.x;
    const err = (reach - targetX) * d;
    if (!best || Math.abs(err) < Math.abs(best.err)) best = { vz: mid, err, land: s.land, out: s.out };
    if (err < 0) lo = mid; else hi = mid;
  }
  if (!best) return null;
  // Lateral brush aims across the table; it barely changes the length, so it is
  // solved second and independently.
  const vy = Math.max(-7, Math.min(7, (targetY - at.y) * 2.2 * d));
  const s = tryShot(incVel, incSpin, at, best.vz, vy, n, x0);
  return s ? { vz: best.vz, vy, land: s.land, out: s.out } : null;
}

// ---------------------------------------------------------------------------
// Driving a bat to a shot
// ---------------------------------------------------------------------------
//
// This is shared by the rival and by the scripted players in the selftest, so
// the test is exercising the controller the game actually ships rather than a
// second one written to agree with it.
//
// The hard part is not choosing the brush, it is ARRIVING with it. The bat is a
// first-order lag, so building a brush of v takes tau*ln(1/(1 - v/vmax)) and
// covers real distance doing it — which means the swing has to start early and
// from BELOW the contact point by exactly that much. The first version had no
// schedule at all (a timer that never counted down, so the "swing now" branch
// never fired) and the rival simply parked its bat on the ball and let it hit
// the stationary face. It still won, because a parked bat returns the ball; it
// just never played a shot.

export const BAT_TOP = BAT.drive / BAT.damp;
const BAT_TAU = 1 / BAT.damp;

/// How long a brush of `v` takes to build from rest, and how far the bat
/// travels building it. Closed form for v' = a - v/tau.
export function swingFor(v) {
  const s = v < 0 ? -1 : 1;
  const a = Math.min(Math.abs(v), BAT_TOP * 0.97);
  const t = -BAT_TAU * Math.log(1 - a / BAT_TOP);
  return { t, travel: s * (BAT_TOP * t - BAT_TAU * a) };
}

const towardVel = (bat, ty, tz) => ({
  up: bat.vz < tz - 0.15,
  down: bat.vz > tz + 0.15,
  left: bat.vy < ty - 0.15,
  right: bat.vy > ty + 0.15,
});

/// Head for a point: a proportional target on velocity, then bang-bang on that.
const towardPos = (bat, y, z, gain = 11) =>
  towardVel(bat, (y - bat.y) * gain, (z - bat.z) * gain);

/// One bat's controls this instant. `aim` is given the predicted contact and
/// returns { vz, vy } — the brush it wants at the moment of contact.
export function autopilot(g, side, aim) {
  const bat = side === SIDE.PLAYER ? g.player : g.rival;
  const x0 = side === SIDE.PLAYER ? PLAYER_X : RIVAL_X;
  const key = side === SIDE.PLAYER ? 'planP' : 'planR';
  const b = g.ball;
  const coming = side === SIDE.PLAYER ? b.vel[0] < 0 : b.vel[0] > 0;
  if (!coming) {
    g[key] = null;
    return towardPos(bat, BAT.restY, BAT.restZ, 5);
  }
  // A plan is for ONE ball. It has to be thrown away when the rally count moves
  // or a point ends, and when its own moment has visibly gone — otherwise the
  // controller keeps driving the swing it planned for a ball that is no longer
  // there, which parks the bat against the top of its reach and stays there for
  // the rest of the match. That is exactly what the first version did.
  const stamp = g.rally + 1000 * (g.total.player + g.total.rival);
  let p = g[key];
  if (p && (p.stamp !== stamp || g.t - p.t0 > p.at.dt + 0.15)) p = g[key] = null;

  // NEVER swing at a ball that is not going to land on your half. Touching it
  // is a volley, which is a fault, and it hands the point to whoever hit it
  // out. This is a rule, not a strategy, so it lives here rather than in either
  // side's choice of shot — the rival reached for every long ball until the
  // selftest counted how points were ending and found "volley" near the top.
  if (!p && g.bounced === 0) {
    const land = landing(b.vel, b.spin, b.pos);
    const dir = side === SIDE.PLAYER ? 1 : -1;
    const mine = !land.netted && land.x * dir < -0.02
      && Math.abs(land.x) <= TABLE.halfLength && Math.abs(land.y) <= TABLE.halfWidth;
    if (!mine) {
      g[key] = { stamp, duck: true, at: { dt: 0 }, t0: g.t };
      return towardPos(bat, BAT.restY, BAT.restZ, 5);
    }
  }
  if (!p) {
    const at = predict(b, x0, side === SIDE.PLAYER ? PLAYER_N : RIVAL_N);
    if (!at) return {};
    const want = aim(at, side);
    if (!want) { g[key] = { at, stamp, duck: true, t0: g.t }; return towardPos(bat, BAT.restY, BAT.restZ, 5); }
    p = { at, stamp, vz: want.vz, vy: want.vy || 0, t0: g.t, sw: swingFor(want.vz) };
    g[key] = p;
  }
  if (p && p.duck) return towardPos(bat, BAT.restY, BAT.restZ, 5);
  const tLeft = p.at.dt - (g.t - p.t0);
  // Inside the swing: stop steering and just build the brush.
  if (tLeft <= p.sw.t) return towardVel(bat, p.vy, p.vz);
  // Still setting up: sit below the contact point by exactly the distance the
  // swing is going to cover.
  const swY = swingFor(p.vy);
  return towardPos(bat,
    clamp(p.at.y - swY.travel, BAT.minY + 0.02, BAT.maxY - 0.02),
    clamp(p.at.z - p.sw.travel, BAT.minZ + 0.02, BAT.maxZ - 0.02));
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/// The rival's choice of shot. Difficulty moves three things at once: how deep
/// and wide it aims, how much it shakes, and how well it reads the ball.
export function rivalAim(g) {
  return (at, side) => {
    const r = g.rand;
    const d = g.difficulty;
    const n = side === SIDE.PLAYER ? PLAYER_N : RIVAL_N;
    const x0 = side === SIDE.PLAYER ? PLAYER_X : RIVAL_X;
    const targetX = dirOf(n) * (0.35 + 0.80 * d) + (r() - 0.5) * 0.5 * (1 - d);
    const targetY = (r() - 0.5) * 2 * (0.15 + 0.45 * d);
    const sol = solveBrush(at.vel, at.spin, at, targetX, targetY, n, x0);
    const jitter = (1 - d) * 1.1;
    return {
      vz: (sol ? sol.vz : 7) + (r() - 0.5) * jitter,
      vy: (sol ? sol.vy : 0) + (r() - 0.5) * jitter,
    };
  };
}

function driveRival(g) {
  g.rivalCtl = autopilot(g, SIDE.RIVAL, rivalAim(g));
}
