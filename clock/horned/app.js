// Alexander's Horned Sphere — infinite WebGPU fractal zoom (KIFS, real one)
//
// This renders the ACTUAL construction: a central body sphere from which open
// horns grow as CIRCULAR ARCS; each horn's tip forks into two clasping horns
// (binary branching), which fork again, forever, tightening toward the Cantor
// limit. There are no closed loops — every horn is an open arc tube.
//
// Engine: a kaleidoscopic IFS. mapTree() walks WINDOW recursion levels and
// takes the min of the arc distance at EVERY level, so the whole tree — all
// generations, both children at each node — is rendered at once (that's the
// "non-zooming branches" you wanted to see). Binary branching comes from the
// reflection fold x = abs(x); a per-level roll tilts the two siblings into
// interlocking planes; the tip-to-origin re-frame chains each arc onto its
// parent's tip.
//
// Zoom: the tree is self-similar along its primary (all-near-child) lineage,
// which is an exact similarity D. Each frame the CPU composes total = floor+frac
// descents of D about the tip (in double precision) into one affine map A,b plus
// a scale S; the shader samples q = A*p + b and renders WINDOW levels from that
// depth, scaling distance by 1/S. Integer descents slide the window deeper as
// you zoom (revealing new generations) and the fractional part keeps it smooth.

const WGSL = /* wgsl */`
struct Uniforms {
  res   : vec4f,  // res.x, res.y, time, _
  cam   : vec4f,  // yaw, pitch, dist, fovTan
  geo   : vec4f,  // k, arcSpan, tube, RA
  fork  : vec4f,  // splay, roll, bodyR, bodyShow
  shade : vec4f,  // colorPhase, glow, paletteMode, aoStrength
  light : vec4f,  // lightYaw, lightPitch, fog, exposure
  pal   : vec4f,  // bgBright, vignette, windowLevels, invS
  qual  : vec4f,  // steps, _, _, _
  zr0   : vec4f,  // A col0 .xyz, b.x
  zr1   : vec4f,  // A col1 .xyz, b.y
  zr2   : vec4f,  // A col2 .xyz, b.z
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

// Exact-ish SDF for a circular ARC tube: centreline is a circle of radius RA,
// centre (-RA,0,0) so the arc starts at the origin (theta=0) heading +Y and
// curls CCW to theta=arcSpan. Endpoint caps make it a safe distance bound.
fn sdArc(p : vec3f, RA : f32, tube : f32, span : f32) -> f32 {
  let Cc = vec2f(-RA, 0.0);
  let v  = p.xy - Cc;
  var a  = atan2(v.y, v.x);
  a = clamp(a, 0.0, span);
  let c  = Cc + RA * vec2f(cos(a), sin(a));
  var d  = length(vec3f(p.x - c.x, p.y - c.y, p.z)) - tube;
  // explicit endpoint caps (atan2 wrap safety in the open gap)
  let e0 = vec3f(0.0, 0.0, 0.0);
  let e1 = vec3f(Cc.x + RA * cos(span), Cc.y + RA * sin(span), 0.0);
  d = min(d, length(p - e0) - tube);
  d = min(d, length(p - e1) - tube);
  return d;
}

// The full tree: WINDOW generations of arcs, branching via abs(x), all min'd.
fn mapTree(q0 : vec3f) -> f32 {
  let k     = U.geo.x;
  let span  = U.geo.y;
  let tube  = U.geo.z;
  let RA    = U.geo.w;
  let splay = U.fork.x;
  let roll  = U.fork.y;
  let W     = i32(U.pal.z + 0.5);
  let Pe    = vec3f(RA * (cos(span) - 1.0), RA * sin(span), 0.0); // parent tip

  let Rz1 = rotZ(-span);
  let Rz2 = rotZ(-splay);
  let Ry  = rotY(roll);

  var x   = q0;
  var scl = 1.0;
  var d   = 1e9;
  gLev = 0.0;
  for (var i = 0; i < W; i = i + 1) {
    let da = sdArc(x, RA, tube, span) / scl;
    if (da < d) { d = da; gLev = f32(i); }
    // descend to the child frame (chain tip -> origin, then branch + tilt)
    x = x - Pe;
    x = Rz1 * x;
    x.x = abs(x.x);     // <-- binary branch: one horn becomes a clasping pair
    x = Rz2 * x;        // splay the pair apart
    x = Ry * x;         // roll into an interlocking plane (3D clasp)
    x = x * k;          // child is 1/k the size -> magnify to canonical
    scl = scl * k;
  }
  return d;
}

fn mapScene(pw : vec3f) -> f32 {
  let A = mat3x3f(U.zr0.xyz, U.zr1.xyz, U.zr2.xyz);
  let b = vec3f(U.zr0.w, U.zr1.w, U.zr2.w);
  let q = A * pw + b;
  var d = mapTree(q) * U.pal.w;                 // invS -> back to world scale
  if (U.fork.w > 0.5) {                         // body sphere, only near zoom 0
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
    let base = palCol(gLev * 0.12 + cPhase, palM);
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
const RA = 0.5;          // arc major radius (fixed; the scale knob is k)
const ZOOM_MAX = 9;      // float32 holds ~k^9 magnification cleanly
const DEFAULTS = {
  zoomSpeed: 0.10, orbitSpeed: 0.05, pitch: 0.20,
  k: 1.90, arc: 2.30, splay: 0.45, roll: 1.25, tube: 0.055, depth: 9,
  fov: 50, dist: 6.5, glow: 0.40, palette: 1,
  exposure: 1.15, fog: 0.10, ao: 0.70, quality: 160,
  bg: 0.65, vignette: 0.6,
};
const SLIDERS = [
  { key: 'zoomSpeed', label: 'zoom speed', min: -0.6, max: 0.6, step: 0.01 },
  { key: 'orbitSpeed', label: 'orbit speed', min: -0.5, max: 0.5, step: 0.01 },
  { key: 'pitch', label: 'camera pitch', min: -1.35, max: 1.35, step: 0.01 },
  { key: 'arc', label: 'horn curl', min: 1.2, max: 2.9, step: 0.01 },
  { key: 'splay', label: 'fork splay', min: 0.0, max: 1.3, step: 0.01 },
  { key: 'roll', label: 'clasp roll', min: 0.0, max: 3.1, step: 0.01 },
  { key: 'k', label: 'child scale', min: 1.55, max: 2.7, step: 0.01 },
  { key: 'tube', label: 'horn thickness', min: 0.02, max: 0.14, step: 0.003 },
  { key: 'depth', label: 'recursion depth', min: 4, max: 12, step: 1 },
  { key: 'dist', label: 'camera distance', min: 3, max: 14, step: 0.1 },
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
// CPU-side vector helpers (double precision) for the zoom descent
// ---------------------------------------------------------------------------
function rotZv(a, v) { const c = Math.cos(a), s = Math.sin(a); return [c * v[0] - s * v[1], s * v[0] + c * v[1], v[2]]; }
function rotYv(a, v) { const c = Math.cos(a), s = Math.sin(a); return [c * v[0] + s * v[2], v[1], -s * v[0] + c * v[2]]; }
function rotAxisv(ax, a, v) {
  const c = Math.cos(a), s = Math.sin(a), t = 1 - c, x = ax[0], y = ax[1], z = ax[2];
  return [
    (t*x*x + c) * v[0] + (t*x*y - s*z) * v[1] + (t*x*z + s*y) * v[2],
    (t*x*y + s*z) * v[0] + (t*y*y + c) * v[1] + (t*y*z - s*x) * v[2],
    (t*x*z - s*y) * v[0] + (t*y*z + s*x) * v[1] + (t*z*z + c) * v[2],
  ];
}

// Build the world->window-frame affine (columns of A + b) and scale S for the
// current zoom, matching the shader's per-level descent (primary +x lineage).
function buildZoom() {
  const span = params.arc, splay = params.splay, roll = params.roll, k = params.k;
  const Pe = [RA * (Math.cos(span) - 1.0), RA * Math.sin(span), 0.0];
  const Rfn = (v) => rotYv(roll, rotZv(-splay, rotZv(-span, v))); // abs is identity on +x lineage

  // axis-angle of R (for fractional descent R^zc)
  const c0 = Rfn([1, 0, 0]), c1 = Rfn([0, 1, 0]), c2 = Rfn([0, 0, 1]);
  const m = [c0[0], c1[0], c2[0], c0[1], c1[1], c2[1], c0[2], c1[2], c2[2]]; // row-major
  const tr = m[0] + m[4] + m[8];
  const ang = Math.acos(Math.max(-1, Math.min(1, (tr - 1) / 2)));
  let ax = [1, 0, 0];
  if (ang > 1e-5) {
    const x = m[7] - m[5], y = m[2] - m[6], z = m[3] - m[1];
    const n = Math.hypot(x, y, z) || 1; ax = [x / n, y / n, z / n];
  }

  let A = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]; // columns
  let b = [0, 0, 0];
  let S = 1;
  const total = Math.max(0, Math.min(ZOOM_MAX, rt.zoomLevel));
  const nb = Math.floor(total), zc = total - nb;

  const descend = (Lfn, sMul) => {
    const bm = [b[0] - Pe[0], b[1] - Pe[1], b[2] - Pe[2]];
    A = [Lfn(A[0]), Lfn(A[1]), Lfn(A[2])];
    b = Lfn(bm);
    S *= sMul;
  };
  const Lfull = (v) => { const r = Rfn(v); return [r[0] * k, r[1] * k, r[2] * k]; };
  for (let j = 0; j < nb; j++) descend(Lfull, k);
  if (zc > 0) {
    const kf = Math.pow(k, zc);
    const Lfrac = (v) => { const r = rotAxisv(ax, zc * ang, v); return [r[0] * kf, r[1] * kf, r[2] * kf]; };
    descend(Lfrac, kf);
  }
  return { A, b, invS: 1 / S, bodyShow: total < 0.5 ? 1 : 0 };
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
    rt.zoomLevel = Math.max(0, Math.min(ZOOM_MAX, rt.zoomLevel));

    const z = buildZoom();
    u[0] = W; u[1] = H; u[2] = now / 1000; u[3] = 0;
    u[4] = rt.yaw; u[5] = params.pitch; u[6] = params.dist;
    u[7] = Math.tan((params.fov * Math.PI / 180) * 0.5);
    u[8] = params.k; u[9] = params.arc; u[10] = params.tube; u[11] = RA;
    u[12] = params.splay; u[13] = params.roll; u[14] = DEFAULTS_bodyR; u[15] = z.bodyShow;
    u[16] = rt.colorPhase; u[17] = params.glow; u[18] = params.palette; u[19] = params.ao;
    u[20] = rt.yaw + 0.7; u[21] = 0.85; u[22] = params.fog; u[23] = params.exposure;
    u[24] = params.bg; u[25] = params.vignette; u[26] = params.depth; u[27] = z.invS;
    u[28] = params.quality; u[29] = 0; u[30] = 0; u[31] = 0;
    u[32] = z.A[0][0]; u[33] = z.A[0][1]; u[34] = z.A[0][2]; u[35] = z.b[0];
    u[36] = z.A[1][0]; u[37] = z.A[1][1]; u[38] = z.A[1][2]; u[39] = z.b[1];
    u[40] = z.A[2][0]; u[41] = z.A[2][1]; u[42] = z.A[2][2]; u[43] = z.b[2];
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

const DEFAULTS_bodyR = 0.42;

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
  params.arc = r(1.7, 2.7);
  params.splay = r(0.15, 1.1);
  params.roll = r(0.4, 2.6);
  params.k = r(1.7, 2.4);
  params.tube = r(0.035, 0.10);
  params.depth = Math.round(r(7, 11));
  params.palette = Math.floor(r(0, PALETTES.length));
  params.glow = r(0.1, 0.9);
  params.orbitSpeed = r(-0.18, 0.18);
  params.zoomSpeed = r(0.05, 0.25) * (Math.random() < 0.3 ? -1 : 1);
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
