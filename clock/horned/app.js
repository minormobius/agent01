// Alexander's Horned Sphere — infinite WebGPU fractal zoom
// A ray-marched lattice of recursively interlocking torus "horns".
//
// The geometry is the attractor of a single similarity G = (scale by k,
// rotate by theta about a tilted axis) about the origin. The SDF is exactly
// G-invariant, so a log-periodic *fold* evaluates infinite recursion in O(1),
// and zooming applies G^zc continuously — when zc crosses an integer the image
// is provably identical, giving a perfectly seamless, endless zoom.

const WGSL = /* wgsl */`
struct Uniforms {
  resTimeZoom : vec4f,  // res.x, res.y, time, zoomWrapped[0,1)
  cam         : vec4f,  // yaw, pitch, dist, fovTan
  fr0         : vec4f,  // k, theta(twist), tube, steps
  fr1         : vec4f,  // colorPhase, glow, paletteMode, aoStrength
  light       : vec4f,  // lightYaw, lightPitch, fog, exposure
  pal         : vec4f,  // bgBright, vignette, outerLevels, arms
};
@group(0) @binding(0) var<uniform> U : Uniforms;

var<private> gLev  : f32 = 0.0;
var<private> gComp : f32 = 0.0;

const TAU = 6.2831853;
const AXIS = vec3f(0.15, 1.0, 0.0);
const DCEN = 1.45;   // canonical clasp centre radius
const RAD  = 0.50;   // torus major radius
const SEP  = 0.30;   // half-separation of the two linked tori (< RAD => linked)

fn rotAxis(axn : vec3f, ang : f32) -> mat3x3f {
  let a = normalize(axn);
  let s = sin(ang); let c = cos(ang); let t = 1.0 - c;
  let x = a.x; let y = a.y; let z = a.z;
  return mat3x3f(
    vec3f(t*x*x + c,   t*x*y + s*z, t*x*z - s*y),
    vec3f(t*x*y - s*z, t*y*y + c,   t*y*z + s*x),
    vec3f(t*x*z + s*y, t*y*z - s*x, t*z*z + c)
  );
}

fn sdTorusZ(p : vec3f, R : f32, r : f32) -> f32 { // ring in XY plane (axis Z)
  let q = vec2f(length(p.xy) - R, p.z);
  return length(q) - r;
}
fn sdTorusY(p : vec3f, R : f32, r : f32) -> f32 { // ring in XZ plane (axis Y)
  let q = vec2f(length(p.xz) - R, p.y);
  return length(q) - r;
}

// One "clasp": two perpendicular, interlocking tori (a chain link / horn pair).
fn clasp(q : vec3f) -> vec2f {
  let tube = U.fr0.z;
  let dA = sdTorusZ(q - vec3f(DCEN - SEP, 0.0, 0.0), RAD, tube);
  let dB = sdTorusY(q - vec3f(DCEN + SEP, 0.0, 0.0), RAD, tube);
  if (dA < dB) { return vec2f(dA, 0.0); }
  return vec2f(dB, 1.0);
}

// Log-periodic fold: union over all integer levels of the similarity G,
// with several rotational copies (arms) per level. Infinite detail, O(1) cost.
fn mapFold(pw : vec3f) -> f32 {
  let k     = U.fr0.x;
  let theta = U.fr0.y;
  let outer = U.pal.z;
  let arms  = max(1, i32(U.pal.w + 0.5));
  let lk    = log(k);
  let r     = length(pw);
  if (r < 1e-4) { return 0.02; }

  let n = round(log(r / DCEN) / lk);
  var best = 1e9;
  for (var j = -1; j <= 1; j = j + 1) {
    let lev = n + f32(j);
    if (lev > outer + 0.5) { continue; }     // bounded outer extent
    let s = pow(k, lev);
    let baseP = (rotAxis(AXIS, -lev * theta) * pw) / s;
    for (var a = 0; a < arms; a = a + 1) {
      let qa = rotAxis(AXIS, f32(a) * TAU / f32(arms)) * baseP;
      let c = clasp(qa);
      let dW = c.x * s;
      if (dW < best) { best = dW; gLev = lev; gComp = c.y + f32(a) * 0.137; }
    }
  }
  return best;
}

// Apply the continuous zoom G^zc, then evaluate. Seamless at integer zc.
fn mapScene(pw0 : vec3f) -> f32 {
  let zc = U.resTimeZoom.w;
  let k  = U.fr0.x;
  let theta = U.fr0.y;
  let F = pow(k, zc);
  let p = (rotAxis(AXIS, -zc * theta) * pw0) / F;
  return mapFold(p) * F;
}

fn calcNormal(p : vec3f, t : f32) -> vec3f {
  let h = max(0.0004, 0.0016 * t);
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
  c += vec3f(0.20, 0.16, 0.10) * exp(-length(uv) * 1.6);     // centre glow
  let st = hash21(floor(uv * 190.0));
  c += vec3f(step(0.9965, st)) * 0.7;                        // stars
  return c * br;
}

@vertex fn vs(@builtin(vertex_index) vi : u32) -> @builtin(position) vec4f {
  var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  return vec4f(p[vi], 0.0, 1.0);
}

@fragment fn fs(@builtin(position) fc : vec4f) -> @location(0) vec4f {
  let res = U.resTimeZoom.xy;
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

  let steps = i32(U.fr0.w);
  var t = 0.05;
  var hit = false;
  var glowAcc = 0.0;
  var i = 0;
  let tmax = dist * 3.0 + 6.0;
  for (i = 0; i < steps; i = i + 1) {
    let pos = ro + rd * t;
    let dd = mapScene(pos);
    glowAcc += exp(-abs(dd) * 22.0);
    let eps = 0.0006 * t + 0.00018;
    if (dd < eps) { hit = true; break; }
    t += dd * 0.7;
    if (t > tmax) { break; }
  }

  let cPhase = U.fr1.x;
  let glow   = U.fr1.y;
  let palM   = U.fr1.z;

  var col = bg(rd, uv);
  if (hit) {
    let pos = ro + rd * t;
    let nrm = calcNormal(pos, t);
    let _d = mapScene(pos);                 // re-evaluate to set gLev/gComp
    let ly = U.light.x; let lp = U.light.y;
    let ldir = normalize(vec3f(cos(lp) * sin(ly), sin(lp), cos(lp) * cos(ly)));
    let diff = max(dot(nrm, ldir), 0.0);
    let amb  = 0.22 + 0.22 * (nrm.y * 0.5 + 0.5);
    let ao   = clamp(1.0 - U.fr1.w * f32(i) / f32(steps), 0.0, 1.0);
    let fres = pow(1.0 - max(dot(nrm, -rd), 0.0), 3.0);
    let base = palCol(gLev * 0.16 + gComp * 0.30 + cPhase, palM);
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
// Parameters (those with a `slider` show up in the panel)
// ---------------------------------------------------------------------------
const DEFAULTS = {
  zoomSpeed: 0.12, orbitSpeed: 0.06, pitch: 0.25,
  twist: 0.70, k: 2.20, tube: 0.13, arms: 3, outer: 2,
  fov: 48, dist: 7.0, glow: 0.45, palette: 1,
  exposure: 1.15, fog: 0.10, ao: 0.75, quality: 128,
  bg: 0.65, vignette: 0.6,
};
const SLIDERS = [
  { key: 'zoomSpeed', label: 'zoom speed', min: -0.6, max: 0.6, step: 0.01 },
  { key: 'orbitSpeed', label: 'orbit speed', min: -0.5, max: 0.5, step: 0.01 },
  { key: 'pitch', label: 'camera pitch', min: -1.35, max: 1.35, step: 0.01 },
  { key: 'twist', label: 'recursion twist', min: -1.6, max: 1.6, step: 0.01 },
  { key: 'k', label: 'scale ratio', min: 1.5, max: 3.4, step: 0.01 },
  { key: 'tube', label: 'horn thickness', min: 0.03, max: 0.28, step: 0.005 },
  { key: 'arms', label: 'arms (symmetry)', min: 1, max: 7, step: 1 },
  { key: 'outer', label: 'outer extent', min: 0, max: 4, step: 1 },
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

  const ubo = device.createBuffer({
    size: 24 * 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const bind = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: ubo } }],
  });
  const u = new Float32Array(24);

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

    const zc = rt.zoomLevel - Math.floor(rt.zoomLevel); // wrap -> bounded F, seamless
    u[0] = W; u[1] = H; u[2] = now / 1000; u[3] = zc;
    u[4] = rt.yaw; u[5] = params.pitch; u[6] = params.dist;
    u[7] = Math.tan((params.fov * Math.PI / 180) * 0.5);
    u[8] = params.k; u[9] = params.twist; u[10] = params.tube; u[11] = params.quality;
    u[12] = rt.colorPhase; u[13] = params.glow; u[14] = params.palette; u[15] = params.ao;
    u[16] = rt.yaw + 0.7; u[17] = 0.85; u[18] = params.fog; u[19] = params.exposure;
    u[20] = params.bg; u[21] = params.vignette; u[22] = params.outer; u[23] = params.arms;
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
  params.twist = r(-1.5, 1.5);
  params.k = r(1.7, 3.0);
  params.tube = r(0.06, 0.2);
  params.arms = Math.round(r(1, 6));
  params.outer = Math.round(r(1, 3));
  params.palette = Math.floor(r(0, PALETTES.length));
  params.glow = r(0.1, 1.0);
  params.orbitSpeed = r(-0.2, 0.2);
  params.zoomSpeed = r(0.05, 0.3) * (Math.random() < 0.25 ? -1 : 1);
  syncSliders();
}

// ---------------------------------------------------------------------------
// Input: drag-orbit, wheel-zoom, pinch, keyboard
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
      if (lastPinch) rt.zoomLevel += (d - lastPinch) * 0.004;
      lastPinch = d;
    }
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    rt.zoomLevel += -e.deltaY * 0.0018;
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
