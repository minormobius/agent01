// Sponge host — a gyroid canal network clipped to an organic blob. This is the
// single source of truth for the host geometry: the JS `field()` sampler steers
// the worm's growth (canal-following + confinement), and HOST_WGSL raymarches the
// SAME field as a translucent host. Keep the two in lockstep.
//
// Gyroid G(p) = sin x cos y + sin y cos z + sin z cos x splits space into two
// interpenetrating labyrinths separated by the surface G=0. The thickened band
// |G| < wall is the sponge TISSUE (rendered, translucent); the worm lives in one
// labyrinth (the canal void, G > wall) and threads it. Everything is clipped to
// an outer blob (sphere + low-freq lumps) = the sponge body.

// JS sampler. P = { size, scale, wall, seed, lump }. Returns gyroid value G, its
// gradient (gx,gy,gz), and the outer-body signed distance dOut (negative inside).
export function field(p, P) {
  const s = P.seed * 6.2831853;
  const f = P.scale;
  const qx = p[0] * f + s, qy = p[1] * f + s * 1.3 + 1.7, qz = p[2] * f + s * 0.7 + 0.5;
  const sx = Math.sin(qx), cx = Math.cos(qx), sy = Math.sin(qy), cy = Math.cos(qy), sz = Math.sin(qz), cz = Math.cos(qz);
  const G = sx * cy + sy * cz + sz * cx;
  const gx = f * (cx * cy - sz * sx);
  const gy = f * (-sx * sy + cy * cz);
  const gz = f * (-sy * sz + cz * cx);
  const lump = P.lump * Math.sin(1.3 * p[0] + s) * Math.sin(1.1 * p[1] + 1.7 + s) * Math.sin(0.9 * p[2] + 0.5 + s);
  const dOut = Math.hypot(p[0], p[1], p[2]) - P.size - lump;
  return { G, gx, gy, gz, dOut };
}

// Host uniform: invVP (mat4, 16f) + a{size,scale,wall,seed} + b{lump,alpha,_,_}. 24 floats.
export const HOST_FLOATS = 24;
export function writeHostUniforms(arr, invVP, P) {
  for (let i = 0; i < 16; i++) arr[i] = invVP[i];
  arr[16] = P.size; arr[17] = P.scale; arr[18] = P.wall; arr[19] = P.seed;
  arr[20] = P.lump; arr[21] = P.alpha; arr[22] = 0; arr[23] = 0;
}

// WGSL host pass — fullscreen ray reconstruction (invVP) + fixed-step raymarch to
// the first tissue wall, shaded as translucent glass, depth-tested against the
// already-drawn worm so canals show the worm through and walls in front tint it.
// Relies on COMMON (Uni `U`, palCol, aces) being prepended by the engine.
export const HOST_WGSL = /* wgsl */`
struct Host {
  invVP : mat4x4f,
  a : vec4f,   // size, scale, wall, seed
  b : vec4f,   // lump, alpha, _, _
};
@group(0) @binding(1) var<uniform> H : Host;

fn gcoord(p : vec3f) -> vec3f {
  let s = H.a.w * 6.2831853; let f = H.a.y;
  return vec3f(p.x * f + s, p.y * f + s * 1.3 + 1.7, p.z * f + s * 0.7 + 0.5);
}
fn gyro(p : vec3f) -> f32 {
  let q = gcoord(p);
  return sin(q.x) * cos(q.y) + sin(q.y) * cos(q.z) + sin(q.z) * cos(q.x);
}
fn gyroGrad(p : vec3f) -> vec3f {
  let q = gcoord(p); let f = H.a.y;
  return vec3f(
    f * (cos(q.x) * cos(q.y) - sin(q.z) * sin(q.x)),
    f * (-sin(q.x) * sin(q.y) + cos(q.y) * cos(q.z)),
    f * (-sin(q.y) * sin(q.z) + cos(q.z) * cos(q.x)));
}
fn outerD(p : vec3f) -> f32 {
  let s = H.a.w * 6.2831853;
  let lump = H.b.x * sin(1.3 * p.x + s) * sin(1.1 * p.y + 1.7 + s) * sin(0.9 * p.z + 0.5 + s);
  return length(p) - H.a.x - lump;
}

@vertex fn vhost(@builtin(vertex_index) vi : u32) -> @builtin(position) vec4f {
  var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  return vec4f(p[vi], 0.0, 1.0);
}

struct Frag { @location(0) color : vec4f, @builtin(frag_depth) depth : f32 };

@fragment fn fhost(@builtin(position) fc : vec4f) -> Frag {
  let res = U.res.xy;
  let ndc = vec2f(2.0 * fc.x / res.x - 1.0, 1.0 - 2.0 * fc.y / res.y);
  let pn = H.invVP * vec4f(ndc, 0.0, 1.0);
  let pf = H.invVP * vec4f(ndc, 1.0, 1.0);
  let ro = U.cam.xyz;
  let rd = normalize(pf.xyz / pf.w - pn.xyz / pn.w);

  let R = H.a.x + H.b.x + 0.25;          // bounding sphere of the host body
  let bq = dot(ro, rd); let cq = dot(ro, ro) - R * R;
  let disc = bq * bq - cq;
  if (disc < 0.0) { discard; }
  let sq = sqrt(disc);
  var t0 = max(-bq - sq, 0.0);
  let t1 = -bq + sq;

  let STEPS = 110;
  let dt = (t1 - t0) / f32(STEPS);
  var hit = -1.0; var hp = vec3f(0.0);
  var tt = t0 + dt * 0.5;
  for (var i = 0; i < STEPS; i = i + 1) {
    let p = ro + rd * tt;
    if (outerD(p) < 0.0 && abs(gyro(p)) < H.a.z) { hit = tt; hp = p; break; }
    tt = tt + dt;
  }
  if (hit < 0.0) { discard; }

  var n = normalize(gyroGrad(hp));
  let V = normalize(U.cam.xyz - hp);
  if (dot(n, V) < 0.0) { n = -n; }
  let fres = pow(1.0 - max(dot(n, V), 0.0), 3.0);
  let L = normalize(U.light.xyz);
  let tint = palCol(0.12, U.misc.x);
  var lit = tint * (0.30 + 0.55 * max(dot(n, L), 0.0)) + vec3f(0.35, 0.42, 0.5) * fres;
  lit = aces(lit * U.cam.w);
  lit = pow(max(lit, vec3f(0.0)), vec3f(0.4545));
  let alpha = clamp(H.b.y * (0.30 + 0.7 * fres), 0.0, 0.95);

  let clip = U.vp * vec4f(hp, 1.0);
  var o : Frag;
  o.color = vec4f(lit, alpha);
  o.depth = clip.z / clip.w;
  return o;
}
`;
