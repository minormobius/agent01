// Alexander's Horned Sphere — infinite WebGPU fractal zoom (KIFS, real one)
//
// A body sphere sprouts a PAIR of open horns (circular arcs) that curl TOWARD
// each other and hook; each horn's tip sprouts another such pair, forever,
// tightening toward the Cantor limit. No closed loops — every horn is an open
// arc tube.
//
// The two siblings are rendered EXPLICITLY (min of two arcs), not by an abs()
// fold: each is rooted off-centre (at +-d) and curls INWARD toward the middle,
// with opposite out-of-plane tilt (+-roll) so they hook in 3D instead of
// colliding. mapTree() walks 'depth' generations down the primary lineage and
// also a few OUTER generations up, taking the min across all of them — so the
// whole structure (both children at the spine nodes, several generations, the
// body) is on screen at once, and the outer generations keep a level visible
// until you've zoomed well past it (no popping at the wrap).
//
// Infinite zoom: the primary lineage is an exact similarity. Each frame the CPU
// builds the fractional descent G^zc about its FIXED POINT L (the limit point)
// as an affine map A,b plus scale; the shader samples q = A*p + b and divides
// distance by the scale. By self-similarity G^zc and G^(zc+1) render the same
// structure, so zc wraps in [0,1): endless, seamless, zooms IN, no precision cap.

const WGSL = /* wgsl */`
struct Uniforms {
  res   : vec4f,  // res.x, res.y, time, _
  cam   : vec4f,  // yaw, pitch, dist, fovTan
  geo   : vec4f,  // k, span, tube, RA
  fork  : vec4f,  // d (root sep), roll, bodyR, bodyShow
  shade : vec4f,  // colorPhase, glow, paletteMode, aoStrength
  light : vec4f,  // lightYaw, lightPitch, fog, exposure
  pal   : vec4f,  // bgBright, vignette, depth, invS
  qual  : vec4f,  // steps, OUTER, _, _
  zr0   : vec4f,  // A row0 .xyz, b.x
  zr1   : vec4f,  // A row1 .xyz, b.y
  zr2   : vec4f,  // A row2 .xyz, b.z
};
@group(0) @binding(0) var<uniform> U : Uniforms;

var<private> gLev : f32 = 0.0;

const TAU = 6.2831853;

fn rotZ(a : f32) -> mat3x3f {
  let c = cos(a); let s = sin(a);
  return mat3x3f(vec3f(c, s, 0.0), vec3f(-s, c, 0.0), vec3f(0.0, 0.0, 1.0));
}
fn rotY(a : f32) -> mat3x3f {
  let c = cos(a); let s = sin(a);
  return mat3x3f(vec3f(c, 0.0, -s), vec3f(0.0, 1.0, 0.0), vec3f(s, 0.0, c));
}

// SDF of a circular arc tube rooted at the origin, tangent +Y, curling toward
// -X (centre at (-RA,0)); point(phi) = (-RA+RA cos phi, RA sin phi), phi in
// [0,span]. With endpoint caps it's a safe distance bound everywhere.
fn sdArcInward(p : vec3f, RA : f32, tube : f32, span : f32) -> f32 {
  let C = vec2f(-RA, 0.0);
  let w = p.xy - C;
  let th = clamp(atan2(w.y, w.x), 0.0, span);
  let cp = C + RA * vec2f(cos(th), sin(th));
  var d = length(vec3f(p.x - cp.x, p.y - cp.y, p.z)) - tube;
  let e0 = vec3f(0.0, 0.0, 0.0);
  let e1 = vec3f(-RA + RA * cos(span), RA * sin(span), 0.0);
  d = min(d, length(p - e0) - tube);
  d = min(d, length(p - e1) - tube);
  return d;
}

// One horn: arc rooted at (+d,0,0), tilted by +roll out of plane.
fn horn(x : vec3f, d : f32, roll : f32, RA : f32, tube : f32, span : f32) -> f32 {
  let q = rotY(-roll) * (x - vec3f(d, 0.0, 0.0));
  return sdArcInward(q, RA, tube, span);
}
// The sibling pair: horn A and its mirror (x->-x, z->-z) so they curl toward
// each other and hook with opposite out-of-plane tilt.
fn pair(x : vec3f, d : f32, roll : f32, RA : f32, tube : f32, span : f32) -> f32 {
  let a = horn(x, d, roll, RA, tube, span);
  let b = horn(vec3f(-x.x, x.y, -x.z), d, roll, RA, tube, span);
  return min(a, b);
}

fn mapTree(q0 : vec3f) -> f32 {
  let k    = U.geo.x;
  let span = U.geo.y;
  let tube = U.geo.z;
  let RA   = U.geo.w;
  let d    = U.fork.x;
  let roll = U.fork.y;
  let W    = i32(U.pal.z + 0.5);
  let OUT  = i32(U.qual.y + 0.5);

  let aS = vec3f(-RA + RA * cos(span), RA * sin(span), 0.0);
  let Rp = rotY(roll);
  let Pe = vec3f(d, 0.0, 0.0) + Rp * aS;          // horn-A tip (world)
  let Mdesc = (k) * (rotZ(-span) * rotY(-roll));   // x' = Mdesc*(x-Pe)
  let Masc  = (1.0 / k) * (Rp * rotZ(span));       // x  = Pe + Masc*x'  (inverse)

  var x   = q0;
  var scl = 1.0;
  for (var o = 0; o < OUT; o = o + 1) { x = Pe + Masc * x; scl = scl / k; }

  var dist = 1e9;
  gLev = 0.0;
  let total = OUT + W;
  for (var g = 0; g < total; g = g + 1) {
    let dd = pair(x, d, roll, RA, tube, span) / scl;
    if (dd < dist) { dist = dd; gLev = f32(g - OUT); }
    x = Mdesc * (x - Pe);
    scl = scl * k;
  }
  return dist;
}

fn mapScene(pw : vec3f) -> f32 {
  let q = vec3f(
    dot(U.zr0.xyz, pw) + U.zr0.w,
    dot(U.zr1.xyz, pw) + U.zr1.w,
    dot(U.zr2.xyz, pw) + U.zr2.w
  );
  var d = mapTree(q) * U.pal.w;                    // invS -> world-scale SDF
  if (U.fork.w > 0.5) {                             // body sphere near zoom 0
    let db = length(pw) - U.fork.z;
    if (db < d) { d = db; gLev = -1.0; }
  }
  return d;
}

fn calcNormal(p : vec3f, t : f32) -> vec3f {
  let h = max(0.0004, 0.0014 * t);
  let e = vec2f(1.0, -1.0);
  return normalize(
    e.xyy * mapScene(p + e.xyy * h) +
    e.yyx * mapScene(p + e.yyx * h) +
    e.yxy * mapScene(p + e.yxy * h) +
    e.xxx * mapScene(p + e.xxx * h)
  );
}

fn palCol(t : f32, mode : f32) -> vec3f {
  let a = vec3f(0.5);
  let b = vec3f(0.5);
  var c = vec3f(1.0);
  var d = vec3f(0.0, 0.33, 0.67);            // 0: rainbow
  let m = i32(mode + 0.5);
  if (m == 1)      { d = vec3f(0.10, 0.20, 0.35); c = vec3f(1.0, 0.85, 0.55); } // amber/gold
  else if (m == 2) { d = vec3f(0.55, 0.45, 0.30); }                            // ember
  else if (m == 3) { d = vec3f(0.30, 0.55, 0.85); c = vec3f(0.9, 1.0, 1.1); }  // ice
  else if (m == 4) { d = vec3f(0.00, 0.10, 0.20); c = vec3f(0.8, 0.6, 1.2); }  // orchid
  else if (m == 5) { d = vec3f(0.50, 0.50, 0.50); c = vec3f(0.5, 0.5, 0.5); }  // mono
  return a + b * cos(TAU * (c * t + d));
}

fn aces(x : vec3f) -> vec3f {
  let a = 2.51; let b = 0.03; let c = 2.43; let d = 0.59; let e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), vec3f(0.0), vec3f(1.0));
}

fn hash21(p : vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(41.31, 289.17))) * 43758.5453);
}

fn bg(rd : vec3f, uv : vec2f) -> vec3f {
  let br = U.pal.x;
  var c = mix(vec3f(0.018, 0.018, 0.030), vec3f(0.060, 0.050, 0.038), uv.y * 0.5 + 0.5);
  c += vec3f(0.20, 0.16, 0.10) * exp(-length(uv) * 1.6);
  let st = hash21(floor(uv * 190.0));
  c += vec3f(step(0.9965, st)) * 0.7;
  return c * br;
}

@vertex fn vs(@builtin(vertex_index) vi : u32) -> @builtin(position) vec4f {
  var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  return vec4f(p[vi], 0.0, 1.0);
}

@fragment fn fs(@builtin(position) fc : vec4f) -> @location(0) vec4f {
  let res = U.res.xy;
  var uv = (2.0 * fc.xy - res) / res.y;
  uv.y = -uv.y;

  let yaw = U.cam.x; let pitch = U.cam.y; let dist = U.cam.z; let ft = U.cam.w;
  let cp = cos(pitch); let sp = sin(pitch);
  let dir = vec3f(cp * sin(yaw), sp, cp * cos(yaw));
  let ro = dir * dist;
  let f = normalize(-ro);
  var rgt = cross(vec3f(0.0, 1.0, 0.0), f);
  if (length(rgt) < 1e-3) { rgt = vec3f(1.0, 0.0, 0.0); }
  rgt = normalize(rgt);
  let up = cross(f, rgt);
  let rd = normalize(f + ft * (uv.x * rgt + uv.y * up));

  let steps = i32(U.qual.x);
  var t = 0.04;
  var hit = false;
  var glowAcc = 0.0;
  var i = 0;
  let tmax = dist * 2.6 + 5.0;
  for (i = 0; i < steps; i = i + 1) {
    let pos = ro + rd * t;
    let dd = mapScene(pos);
    glowAcc += exp(-abs(dd) * 24.0);
    let eps = 0.0006 * t + 0.00015;
    if (dd < eps) { hit = true; break; }
    t += dd * 0.72;
    if (t > tmax) { break; }
  }

  let cPhase = U.shade.x;
  let glow   = U.shade.y;
  let palM   = U.shade.z;

  var col = bg(rd, uv);
  if (hit) {
    let pos = ro + rd * t;
    let nrm = calcNormal(pos, t);
    let _d = mapScene(pos);                 // re-evaluate to set gLev
    let ly = U.light.x; let lp = U.light.y;
    let ldir = normalize(vec3f(cos(lp) * sin(ly), sin(lp), cos(lp) * cos(ly)));
    let diff = max(dot(nrm, ldir), 0.0);
    let amb  = 0.22 + 0.22 * (nrm.y * 0.5 + 0.5);
    let ao   = clamp(1.0 - U.shade.w * f32(i) / f32(steps), 0.0, 1.0);
    let fres = pow(1.0 - max(dot(nrm, -rd), 0.0), 3.0);
    let base = palCol(gLev * 0.13 + cPhase, palM);
    var lit = base * (amb + diff * 0.95) * ao;
    lit += base * fres * 0.45;
    let fog = 1.0 - exp(-t * U.light.z * 0.14);
    col = mix(lit, bg(rd, uv), fog);
  }
  col += palCol(cPhase * 1.3 + 0.3, palM) * glowAcc * glow * 0.018;

  col *= U.light.w;                          // exposure
  let vig = 1.0 - U.pal.y * 0.55 * dot(uv, uv);
  col *= clamp(vig, 0.0, 1.0);
  col = aces(col);
  col = pow(max(col, vec3f(0.0)), vec3f(0.4545));
  return vec4f(col, 1.0);
}
`;

// ---------------------------------------------------------------------------
// Parameters
// ---------------------------------------------------------------------------
const RA = 0.5;          // arc radius (fixed; 'child scale' k is the size knob)
const BODY_R = 0.22;
const OUTER = 2;         // extra outer generations rendered (anti-blink)
const DEFAULTS = {
  zoomSpeed: 0.08, orbitSpeed: 0.05, pitch: 0.10,
  k: 2.00, span: 2.60, sep: 0.34, roll: 0.60, tube: 0.055, depth: 8,
  fov: 55, dist: 4.4, glow: 0.40, palette: 1,
  exposure: 1.15, fog: 0.08, ao: 0.70, quality: 150,
  bg: 0.65, vignette: 0.6,
};
const SLIDERS = [
  { key: 'zoomSpeed', label: 'zoom speed', min: -0.6, max: 0.6, step: 0.01 },
  { key: 'orbitSpeed', label: 'orbit speed', min: -0.5, max: 0.5, step: 0.01 },
  { key: 'pitch', label: 'camera pitch', min: -1.35, max: 1.35, step: 0.01 },
  { key: 'span', label: 'arc span', min: 0.6, max: 5.4, step: 0.02 },
  { key: 'sep', label: 'fork separation', min: 0.0, max: 0.7, step: 0.005 },
  { key: 'roll', label: 'clasp roll (3D)', min: 0.0, max: 1.8, step: 0.01 },
  { key: 'k', label: 'child scale', min: 1.55, max: 2.7, step: 0.01 },
  { key: 'tube', label: 'horn thickness', min: 0.02, max: 0.14, step: 0.003 },
  { key: 'depth', label: 'recursion depth', min: 3, max: 11, step: 1 },
  { key: 'dist', label: 'camera distance', min: 2.2, max: 12, step: 0.1 },
  { key: 'fov', label: 'field of view', min: 20, max: 95, step: 1 },
  { key: 'glow', label: 'glow', min: 0, max: 1.5, step: 0.02 },
  { key: 'fog', label: 'fog', min: 0, max: 0.6, step: 0.01 },
  { key: 'ao', label: 'ambient occ.', min: 0, max: 1.5, step: 0.02 },
  { key: 'exposure', label: 'exposure', min: 0.4, max: 2.2, step: 0.02 },
  { key: 'bg', label: 'background', min: 0, max: 1.4, step: 0.02 },
  { key: 'vignette', label: 'vignette', min: 0, max: 1.5, step: 0.02 },
  { key: 'quality', label: 'quality (steps)', min: 48, max: 256, step: 4 },
];
const PALETTES = ['rainbow', 'amber gold', 'ember', 'ice', 'orchid', 'mono'];

const params = { ...DEFAULTS };
const rt = { yaw: 0.6, zoomLevel: 0, colorPhase: 0, paused: false, last: 0 };

// ---------------------------------------------------------------------------
// CPU 3x3 helpers (row-major flat [9]) for the zoom framing
// ---------------------------------------------------------------------------
const mI = () => [1, 0, 0, 0, 1, 0, 0, 0, 1];
function mMul(a, b) {
  const c = new Array(9);
  for (let r = 0; r < 3; r++) for (let col = 0; col < 3; col++)
    c[r * 3 + col] = a[r * 3] * b[col] + a[r * 3 + 1] * b[3 + col] + a[r * 3 + 2] * b[6 + col];
  return c;
}
function mVec(m, v) {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}
const mScale = (s, m) => m.map((x) => x * s);
const mSub = (a, b) => a.map((x, i) => x - b[i]);
function mInv3(m) {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  const id = 1 / det;
  return [
    A * id, (c * h - b * i) * id, (b * f - c * e) * id,
    B * id, (a * i - c * g) * id, (c * d - a * f) * id,
    C * id, (b * g - a * h) * id, (a * e - b * d) * id,
  ];
}
function rotZm(a) { const c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, s, c, 0, 0, 0, 1]; }
function rotYm(a) { const c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; }
function rotAxism(ax, a) {
  const c = Math.cos(a), s = Math.sin(a), t = 1 - c, [x, y, z] = ax;
  return [
    t*x*x + c,   t*x*y - s*z, t*x*z + s*y,
    t*x*y + s*z, t*y*y + c,   t*y*z - s*x,
    t*x*z - s*y, t*y*z + s*x, t*z*z + c,
  ];
}
function axisAngle(m) {
  const tr = m[0] + m[4] + m[8];
  const ang = Math.acos(Math.max(-1, Math.min(1, (tr - 1) / 2)));
  let ax = [1, 0, 0];
  if (ang > 1e-5) {
    const x = m[7] - m[5], y = m[2] - m[6], z = m[3] - m[1];
    const n = Math.hypot(x, y, z) || 1; ax = [x / n, y / n, z / n];
  }
  return { ax, ang };
}

// Rchild (ascend rotation) = rotY(roll) * rotZ(span); Pe = (sep,0,0)+rotY(roll)*aS.
// Zoom = contraction G^zc about fixed point L; A=k^-zc R(zc), b=L-A L, invS=k^zc.
function buildZoom() {
  const k = params.k, span = params.span, roll = params.roll, sep = params.sep;
  const aS = [-RA + RA * Math.cos(span), RA * Math.sin(span), 0];
  const Rp = rotYm(roll);
  const Pe = mVec(Rp, aS); Pe[0] += sep;
  const Rchild = mMul(Rp, rotZm(span));
  const L = mVec(mInv3(mSub(mI(), mScale(1 / k, Rchild))), Pe);

  const zc = rt.zoomLevel - Math.floor(rt.zoomLevel);    // wrap [0,1): seamless
  const { ax, ang } = axisAngle(Rchild);
  const Rzc = rotAxism(ax, zc * ang);
  const A = mScale(Math.pow(k, -zc), Rzc);               // contract toward L (zoom in)
  const AL = mVec(A, L);
  const b = [L[0] - AL[0], L[1] - AL[1], L[2] - AL[2]];
  const invS = Math.pow(k, zc);
  const bodyShow = rt.zoomLevel < 1.0 ? 1 : 0;
  return { A, b, invS, bodyShow };
}

// ---------------------------------------------------------------------------
// WebGPU bootstrap
// ---------------------------------------------------------------------------
const canvas = document.getElementById('gfx');

async function init() {
  if (!navigator.gpu) return fail('This browser has no WebGPU.');
  let adapter, device;
  try {
    adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) return fail('No WebGPU adapter (GPU) available.');
    device = await adapter.requestDevice();
  } catch (e) { console.error(e); return fail('WebGPU device request failed.'); }

  const ctx = canvas.getContext('webgpu');
  const format = navigator.gpu.getPreferredCanvasFormat();
  ctx.configure({ device, format, alphaMode: 'opaque' });

  const module = device.createShaderModule({ code: WGSL });
  const info = await module.getCompilationInfo();
  const errs = info.messages.filter((m) => m.type === 'error');
  if (errs.length) {
    console.error(errs);
    return fail('Shader error: ' + errs.map((m) => 'L' + m.lineNum + ' ' + m.message).join(' | '));
  }

  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module, entryPoint: 'vs' },
    fragment: { module, entryPoint: 'fs', targets: [{ format }] },
    primitive: { topology: 'triangle-list' },
  });

  const FLOATS = 44; // 11 vec4
  const ubo = device.createBuffer({
    size: FLOATS * 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const bind = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: ubo } }],
  });
  const u = new Float32Array(FLOATS);

  let W = 1, H = 1;
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    H = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    canvas.width = W; canvas.height = H;
  }
  window.addEventListener('resize', resize);
  resize();

  buildUI();
  attachInput();

  const fpsEl = document.getElementById('fps');
  let frames = 0, fpsT = 0;

  function frame(now) {
    const dt = Math.min(0.05, (now - rt.last) / 1000 || 0);
    rt.last = now;
    if (!rt.paused) {
      rt.yaw += params.orbitSpeed * dt;
      rt.zoomLevel += params.zoomSpeed * dt;
      rt.colorPhase += (Math.abs(params.zoomSpeed) * 0.12 + 0.015) * dt;
    }
    if (rt.zoomLevel < 0) rt.zoomLevel = 0;

    const z = buildZoom();
    u[0] = W; u[1] = H; u[2] = now / 1000; u[3] = 0;
    u[4] = rt.yaw; u[5] = params.pitch; u[6] = params.dist;
    u[7] = Math.tan((params.fov * Math.PI / 180) * 0.5);
    u[8] = params.k; u[9] = params.span; u[10] = params.tube; u[11] = RA;
    u[12] = params.sep; u[13] = params.roll; u[14] = BODY_R; u[15] = z.bodyShow;
    u[16] = rt.colorPhase; u[17] = params.glow; u[18] = params.palette; u[19] = params.ao;
    u[20] = rt.yaw + 0.7; u[21] = 0.85; u[22] = params.fog; u[23] = params.exposure;
    u[24] = params.bg; u[25] = params.vignette; u[26] = params.depth; u[27] = z.invS;
    u[28] = params.quality; u[29] = OUTER; u[30] = 0; u[31] = 0;
    u[32] = z.A[0]; u[33] = z.A[1]; u[34] = z.A[2]; u[35] = z.b[0];
    u[36] = z.A[3]; u[37] = z.A[4]; u[38] = z.A[5]; u[39] = z.b[1];
    u[40] = z.A[6]; u[41] = z.A[7]; u[42] = z.A[8]; u[43] = z.b[2];
    device.queue.writeBuffer(ubo, 0, u);

    const enc = device.createCommandEncoder();
    const pass = enc.beginRenderPass({
      colorAttachments: [{
        view: ctx.getCurrentTexture().createView(),
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
        loadOp: 'clear', storeOp: 'store',
      }],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bind);
    pass.draw(3);
    pass.end();
    device.queue.submit([enc.finish()]);

    frames++; fpsT += dt;
    if (fpsT >= 0.5) { fpsEl.textContent = Math.round(frames / fpsT) + ' fps'; frames = 0; fpsT = 0; }

    if (pendingShot) { doShot(); pendingShot = false; }
    requestAnimationFrame(frame);
  }
  rt.last = performance.now();
  requestAnimationFrame(frame);
}

function fail(msg) {
  const el = document.getElementById('nogpu');
  if (msg) { const p = el.querySelector('[data-msg]'); if (p) p.textContent = msg; }
  el.classList.remove('hidden');
  document.getElementById('panel').classList.add('hidden');
  document.getElementById('hud').classList.add('hidden');
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------
const sliderEls = {};
let paletteSel = null;
function buildUI() {
  const host = document.getElementById('controls');

  const pwrap = document.createElement('div'); pwrap.className = 'ctl';
  const plab = document.createElement('label');
  plab.innerHTML = '<span>palette</span>';
  paletteSel = document.createElement('select');
  PALETTES.forEach((name, idx) => {
    const o = document.createElement('option'); o.value = idx; o.textContent = name;
    if (idx === params.palette) o.selected = true; paletteSel.appendChild(o);
  });
  paletteSel.addEventListener('input', () => { params.palette = +paletteSel.value; });
  pwrap.appendChild(plab); pwrap.appendChild(paletteSel); host.appendChild(pwrap);

  for (const s of SLIDERS) {
    const wrap = document.createElement('div'); wrap.className = 'ctl';
    const lab = document.createElement('label');
    const name = document.createElement('span'); name.textContent = s.label;
    const val = document.createElement('span'); val.className = 'val';
    const inp = document.createElement('input');
    inp.type = 'range'; inp.min = s.min; inp.max = s.max; inp.step = s.step;
    inp.value = params[s.key];
    const fmt = () => { val.textContent = (s.step >= 1 ? params[s.key].toFixed(0) : params[s.key].toFixed(2)); };
    const paint = () => inp.style.setProperty('--p', (100 * (params[s.key] - s.min) / (s.max - s.min)) + '%');
    inp.addEventListener('input', () => { params[s.key] = +inp.value; fmt(); paint(); });
    fmt(); paint();
    lab.appendChild(name); lab.appendChild(val);
    wrap.appendChild(lab); wrap.appendChild(inp); host.appendChild(wrap);
    sliderEls[s.key] = { inp, fmt, paint };
  }

  document.getElementById('collapse').addEventListener('click', () => {
    document.getElementById('panel').classList.toggle('collapsed');
  });
  const pauseBtn = document.getElementById('btnPause');
  pauseBtn.addEventListener('click', () => togglePause(pauseBtn));
  document.getElementById('btnReset').addEventListener('click', reset);
  document.getElementById('btnRandom').addEventListener('click', surprise);
  document.getElementById('btnShot').addEventListener('click', () => { pendingShot = true; });
  document.getElementById('btnFull').addEventListener('click', toggleFull);
  window._pauseBtn = pauseBtn;
}

function syncSliders() {
  if (paletteSel) paletteSel.value = params.palette;
  for (const k in sliderEls) {
    sliderEls[k].inp.value = params[k];
    sliderEls[k].fmt(); sliderEls[k].paint();
  }
}

function togglePause(btn) {
  rt.paused = !rt.paused;
  if (btn) { btn.classList.toggle('active', rt.paused); btn.textContent = rt.paused ? '▶ play' : '⏸ pause'; }
}
function toggleFull() {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
  else document.exitFullscreen?.();
}
function reset() {
  Object.assign(params, DEFAULTS);
  rt.yaw = 0.6; rt.zoomLevel = 0; rt.colorPhase = 0;
  syncSliders();
}
function surprise() {
  const r = (a, b) => a + Math.random() * (b - a);
  params.span = r(1.8, 4.6);
  params.sep = r(0.15, 0.55);
  params.roll = r(0.2, 1.4);
  params.k = r(1.7, 2.4);
  params.tube = r(0.035, 0.10);
  params.depth = Math.round(r(6, 10));
  params.palette = Math.floor(r(0, PALETTES.length));
  params.glow = r(0.1, 0.9);
  params.orbitSpeed = r(-0.18, 0.18);
  params.zoomSpeed = r(0.04, 0.20) * (Math.random() < 0.3 ? -1 : 1);
  syncSliders();
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------
let pendingShot = false;
function doShot() {
  canvas.toBlob((b) => {
    if (!b) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = 'horned-sphere.png';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }, 'image/png');
}

function attachInput() {
  const ptrs = new Map();
  let lastPinch = 0;
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  });
  const drop = (e) => { ptrs.delete(e.pointerId); lastPinch = 0; };
  canvas.addEventListener('pointerup', drop);
  canvas.addEventListener('pointercancel', drop);
  canvas.addEventListener('pointermove', (e) => {
    const p = ptrs.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (ptrs.size === 1) {
      rt.yaw -= dx * 0.005;
      params.pitch = Math.max(-1.35, Math.min(1.35, params.pitch + dy * 0.005));
      const s = sliderEls.pitch;
      if (s) { s.inp.value = params.pitch; s.fmt(); s.paint(); }
    } else if (ptrs.size === 2) {
      const arr = [...ptrs.values()];
      const d = Math.hypot(arr[0].x - arr[1].x, arr[0].y - arr[1].y);
      if (lastPinch) rt.zoomLevel += (d - lastPinch) * 0.006;
      lastPinch = d;
    }
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    rt.zoomLevel += -e.deltaY * 0.0022;
  }, { passive: false });

  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    const k = e.key.toLowerCase();
    if (k === ' ') { e.preventDefault(); togglePause(window._pauseBtn); }
    else if (k === 'h') {
      document.getElementById('panel').classList.toggle('hidden');
      document.getElementById('hud').classList.toggle('hidden');
      document.getElementById('fps').classList.toggle('hidden');
    }
    else if (k === 'r') reset();
    else if (k === 's') pendingShot = true;
    else if (k === 'f') toggleFull();
  });
}

init();
