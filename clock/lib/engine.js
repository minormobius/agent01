// Shared organism engine for the gallery. Owns WebGPU (instanced beads + tapered
// tubes, lit + fogged), the camera, the control panel, input, and the frame
// loop. An "organism" plugs in by supplying a body-plan builder + a param schema;
// the brain (brain.js), trail field (trail.js), flow field (flow.js) and vec
// helpers (vec.js) are shared primitives any organism can import directly.
//
// organism = {
//   meta: { shot },                 // screenshot filename
//   palettes?: [...],               // defaults to PALETTES
//   defaults: { ...params },        // full param defaults (compose with DEFAULTS.*)
//   sliders:  [ {key,label,min,max,step}, ... ],  // panel order (compose with GROUPS.*)
//   build(em, ctx, time),           // emit geometry: em.push / em.pushLink
//   tick?(ctx, dt),                 // per-frame state update (e.g. arm phases)
//   surprise?(ctx),                 // tame randomizer (mutate ctx.params / ctx.rt)
//   wild?(ctx),                     // full-organism randomizer
//   reset?(ctx),                    // extra reset hook
// }
import { TAU, norm, perspective, lookAt, mul4 } from './vec.js';
import { trailUpdate, trailReset, trailIsActive, trailClearBrush } from './trail.js';

const WGSL = /* wgsl */`
struct Uni {
  vp    : mat4x4f,
  cam   : vec4f,   // camPos.xyz, exposure
  light : vec4f,   // lightDir.xyz, ambient
  misc  : vec4f,   // palette, fog, glow, time
  res   : vec4f,   // resX, resY, bgBright, vignette
};
@group(0) @binding(0) var<uniform> U : Uni;

const TAU = 6.2831853;

fn palCol(t : f32, mode : f32) -> vec3f {
  let a = vec3f(0.5); let b = vec3f(0.5);
  var c = vec3f(1.0);
  var d = vec3f(0.0, 0.33, 0.67);
  let m = i32(mode + 0.5);
  if (m == 1)      { d = vec3f(0.10, 0.20, 0.35); c = vec3f(1.0, 0.85, 0.55); } // amber
  else if (m == 2) { d = vec3f(0.55, 0.45, 0.30); }                            // ember
  else if (m == 3) { d = vec3f(0.30, 0.55, 0.85); c = vec3f(0.9, 1.0, 1.1); }  // ice
  else if (m == 4) { d = vec3f(0.00, 0.10, 0.20); c = vec3f(0.8, 0.6, 1.2); }  // orchid
  else if (m == 5) { d = vec3f(0.55, 0.30, 0.20); c = vec3f(1.0, 0.7, 0.5); }  // coral
  else if (m == 6) { d = vec3f(0.50, 0.50, 0.50); c = vec3f(0.5, 0.5, 0.5); }  // mono
  return a + b * cos(TAU * (c * t + d));
}
fn aces(x : vec3f) -> vec3f {
  let a = 2.51; let b = 0.03; let c = 2.43; let d = 0.59; let e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), vec3f(0.0), vec3f(1.0));
}

// ---- background fullscreen pass ----
@vertex fn vbg(@builtin(vertex_index) vi : u32) -> @builtin(position) vec4f {
  var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  return vec4f(p[vi], 0.0, 1.0);
}
@fragment fn fbg(@builtin(position) fc : vec4f) -> @location(0) vec4f {
  let uv = (2.0 * fc.xy - U.res.xy) / U.res.y;
  var c = mix(vec3f(0.020, 0.022, 0.034), vec3f(0.050, 0.044, 0.060), uv.y * 0.5 + 0.5);
  c += vec3f(0.16, 0.14, 0.20) * exp(-length(uv) * 1.5);
  c *= U.res.z;
  let vig = 1.0 - U.res.w * 0.5 * dot(uv, uv);
  c *= clamp(vig, 0.0, 1.0);
  return vec4f(c, 1.0);
}

// ---- instanced beads ----
struct VSOut {
  @builtin(position) pos : vec4f,
  @location(0) nrm : vec3f,
  @location(1) wp  : vec3f,
  @location(2) ct  : f32,
};
@vertex fn vs(
  @location(0) mp : vec3f,
  @location(1) mn : vec3f,
  @location(2) ipos : vec3f,
  @location(3) iscale : vec3f,
  @location(4) ict : f32,
) -> VSOut {
  let world = ipos + mp * iscale;
  var o : VSOut;
  o.pos = U.vp * vec4f(world, 1.0);
  o.nrm = normalize(mn / iscale);
  o.wp = world;
  o.ct = ict;
  return o;
}
// ---- instanced tubes (connective tissue between beads) ----
// A unit cylinder (xz on the unit circle, y in [0,1]) is oriented to span p0->p1
// and tapered between radii r0/r1, so each filament reads as a continuous rope.
@vertex fn vtube(
  @location(0) mp : vec3f,
  @location(2) p0 : vec3f,
  @location(3) p1 : vec3f,
  @location(4) rr : vec2f,
  @location(5) ict : f32,
) -> VSOut {
  let axis = p1 - p0;
  let len = max(length(axis), 1e-5);
  let dir = axis / len;
  var up = vec3f(0.0, 1.0, 0.0);
  if (abs(dir.y) > 0.9) { up = vec3f(1.0, 0.0, 0.0); }
  let t1 = normalize(cross(up, dir));
  let t2 = cross(dir, t1);
  let radial = t1 * mp.x + t2 * mp.z;
  let rad = mix(rr.x, rr.y, mp.y);
  let world = p0 + dir * (mp.y * len) + radial * rad;
  var o : VSOut;
  o.pos = U.vp * vec4f(world, 1.0);
  o.nrm = normalize(radial);
  o.wp = world;
  o.ct = ict;
  return o;
}
@fragment fn fs(in : VSOut) -> @location(0) vec4f {
  let n = normalize(in.nrm);
  let L = normalize(U.light.xyz);
  let diff = max(dot(n, L), 0.0);
  let amb = U.light.w;
  let V = normalize(U.cam.xyz - in.wp);
  let half = normalize(L + V);
  let spec = pow(max(dot(n, half), 0.0), 24.0) * 0.35;
  let rim = pow(1.0 - max(dot(n, V), 0.0), 2.5);
  let base = palCol(in.ct * 0.72 + 0.04, U.misc.x);
  var col = base * (amb + diff * 0.95) + base * rim * 0.5 + vec3f(spec);
  let dist = length(U.cam.xyz - in.wp);
  let fog = 1.0 - exp(-dist * U.misc.y * 0.10);
  col = mix(col, vec3f(0.025, 0.027, 0.04), fog);
  col += base * U.misc.z * 0.16;
  col *= U.cam.w;
  col = aces(col);
  col = pow(max(col, vec3f(0.0)), vec3f(0.4545));
  return vec4f(col, 1.0);
}
`;

// ---- shared parameter groups (organisms compose their schema from these) ----
export const PALETTES = ['rainbow', 'amber', 'ember', 'ice', 'orchid', 'coral', 'mono'];
export const DEFAULTS = {
  motion: { spinSpeed: 0.18, pitch: 0.45, furlSpeed: 0.55, furl: 0.5 },
  flow:   { flow: 0.55, flowScale: 0.7, flowChurn: 0.45 },
  brain:  { brain: 0.45, brainSeed: 0.37, sensorGain: 1.5, sensorAngle: -0.14, sensorDist: 0.16, trailDecay: 0.92, trailDiffuse: 0.7 },
  view:   { fov: 50, dist: 5.2, glow: 0.3, palette: 5, exposure: 1.15, fog: 0.10, bg: 0.7, vignette: 0.6 },
};
export const GROUPS = {
  motion: [
    { key: 'spinSpeed', label: 'spin speed', min: -0.8, max: 0.8, step: 0.01 },
    { key: 'pitch', label: 'camera pitch', min: -1.4, max: 1.4, step: 0.01 },
    { key: 'furlSpeed', label: 'furl speed', min: 0, max: 2.0, step: 0.01 },
    { key: 'furl', label: 'furl amount', min: 0, max: 1, step: 0.01 },
  ],
  flow: [
    { key: 'flow', label: 'flow swirl', min: 0, max: 1.2, step: 0.02 },
    { key: 'flowScale', label: 'flow scale', min: 0.1, max: 2.5, step: 0.05 },
    { key: 'flowChurn', label: 'flow churn', min: 0, max: 1.5, step: 0.02 },
  ],
  brain: [
    { key: 'brain', label: 'fluoddity brain', min: 0, max: 1.5, step: 0.02 },
    { key: 'brainSeed', label: 'brain seed', min: 0, max: 1, step: 0.001 },
    { key: 'sensorGain', label: 'sensor gain', min: 0, max: 8, step: 0.05 },
    { key: 'sensorAngle', label: 'sensor angle', min: -1, max: 1, step: 0.01 },
    { key: 'sensorDist', label: 'sensor distance', min: 0.02, max: 0.6, step: 0.01 },
    { key: 'trailDecay', label: 'trail decay', min: 0.5, max: 0.995, step: 0.005 },
    { key: 'trailDiffuse', label: 'trail diffuse', min: 0, max: 1.5, step: 0.02 },
  ],
  view: [
    { key: 'dist', label: 'camera distance', min: 2.5, max: 12, step: 0.1 },
    { key: 'fov', label: 'field of view', min: 25, max: 90, step: 1 },
    { key: 'glow', label: 'glow', min: 0, max: 1.2, step: 0.02 },
    { key: 'exposure', label: 'exposure', min: 0.5, max: 2.0, step: 0.02 },
    { key: 'fog', label: 'fog', min: 0, max: 0.5, step: 0.01 },
    { key: 'bg', label: 'background', min: 0, max: 1.4, step: 0.02 },
    { key: 'vignette', label: 'vignette', min: 0, max: 1.5, step: 0.02 },
  ],
};

// ---- instance geometry ----
const FLOATS_PER = 8;        // bead: pos(3) scale(3) ct(1) pad(1)
const FLOATS_PER_LINK = 9;   // link: p0(3) p1(3) r0r1(2) ct(1)
const MAX_INST = 40000;
const MAX_LINK = 40000;

function makeSphere(stacks, sectors) {
  const verts = [], idx = [];
  for (let i = 0; i <= stacks; i++) {
    const phi = Math.PI * i / stacks;
    const sp = Math.sin(phi), cp = Math.cos(phi);
    for (let j = 0; j <= sectors; j++) {
      const th = TAU * j / sectors;
      const x = sp * Math.cos(th), y = cp, z = sp * Math.sin(th);
      verts.push(x, y, z, x, y, z);
    }
  }
  const row = sectors + 1;
  for (let i = 0; i < stacks; i++) for (let j = 0; j < sectors; j++) {
    const a = i * row + j, b = a + row;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  return { verts: new Float32Array(verts), idx: new Uint16Array(idx) };
}
function makeTube(sides) {
  const verts = [], idx = [];
  for (let r = 0; r < 2; r++) {
    for (let j = 0; j <= sides; j++) {
      const th = TAU * j / sides;
      verts.push(Math.cos(th), r, Math.sin(th));
    }
  }
  const row = sides + 1;
  for (let j = 0; j < sides; j++) {
    const a = j, b = j + 1, c = row + j, d = row + j + 1;
    idx.push(a, c, b, b, c, d);
  }
  return { verts: new Float32Array(verts), idx: new Uint16Array(idx) };
}

function makeEmitter(inst, link) {
  let n = 0, m = 0;
  const cap = inst.length - FLOATS_PER, lcap = link.length - FLOATS_PER_LINK;
  return {
    push(p, r, ct) {
      if (n > cap) return;
      inst[n] = p[0]; inst[n + 1] = p[1]; inst[n + 2] = p[2];
      inst[n + 3] = r[0]; inst[n + 4] = r[1]; inst[n + 5] = r[2];
      inst[n + 6] = ct; inst[n + 7] = 0;
      n += FLOATS_PER;
    },
    pushLink(p0, p1, r0, r1, ct) {
      if (m > lcap) return;
      link[m] = p0[0]; link[m + 1] = p0[1]; link[m + 2] = p0[2];
      link[m + 3] = p1[0]; link[m + 4] = p1[1]; link[m + 5] = p1[2];
      link[m + 6] = r0; link[m + 7] = r1; link[m + 8] = ct;
      m += FLOATS_PER_LINK;
    },
    get beads() { return n / FLOATS_PER; },
    get links() { return m / FLOATS_PER_LINK; },
  };
}

// ---------------------------------------------------------------------------
export function mountOrganism(organism) {
  const palettes = organism.palettes || PALETTES;
  const params = { ...organism.defaults };
  const rt = { yaw: 0.6, paused: false, last: 0, furl: 0.5, furlPhase: 0, furlAuto: true, flowT: 0 };
  const state = {};
  const ctx = { params, rt, state };

  const canvas = document.getElementById('gfx');
  const sliderEls = {};
  let paletteSel = null;
  let pendingShot = false;

  function fail(msg) {
    const el = document.getElementById('nogpu');
    if (msg) { const p = el.querySelector('[data-msg]'); if (p) p.textContent = msg; }
    el.classList.remove('hidden');
    document.getElementById('panel').classList.add('hidden');
    document.getElementById('hud').classList.add('hidden');
  }

  function syncSliders() {
    if (paletteSel) paletteSel.value = params.palette;
    for (const k in sliderEls) { sliderEls[k].inp.value = params[k]; sliderEls[k].fmt(); sliderEls[k].paint(); }
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
    Object.assign(params, organism.defaults);
    rt.yaw = 0.6; rt.furlAuto = true; rt.furlPhase = 0; rt.furl = 0.5; rt.flowT = 0;
    for (const k in state) delete state[k];
    trailReset();
    organism.reset?.(ctx);
    syncSliders();
  }
  function reseedBrain() {
    params.brainSeed = Math.random();
    if ((params.brain ?? 0) <= 0) params.brain = organism.defaults.brain ?? 0.45;
    trailReset();
    syncSliders();
  }
  function surprise() {
    organism.surprise?.(ctx);
    trailReset();
    syncSliders();
  }
  function wild() {
    organism.wild?.(ctx);
    trailReset();
    syncSliders();
  }
  function doShot() {
    canvas.toBlob((b) => {
      if (!b) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b); a.download = (organism.meta?.shot || 'organism') + '.png'; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }, 'image/png');
  }

  function buildUI() {
    const host = document.getElementById('controls');
    const pwrap = document.createElement('div'); pwrap.className = 'ctl';
    const plab = document.createElement('label'); plab.innerHTML = '<span>palette</span>';
    paletteSel = document.createElement('select');
    palettes.forEach((name, idx) => {
      const o = document.createElement('option'); o.value = idx; o.textContent = name;
      if (idx === params.palette) o.selected = true; paletteSel.appendChild(o);
    });
    paletteSel.addEventListener('input', () => { params.palette = +paletteSel.value; });
    pwrap.appendChild(plab); pwrap.appendChild(paletteSel); host.appendChild(pwrap);

    for (const s of organism.sliders) {
      const wrap = document.createElement('div'); wrap.className = 'ctl';
      const lab = document.createElement('label');
      const name = document.createElement('span'); name.textContent = s.label;
      const val = document.createElement('span'); val.className = 'val';
      const inp = document.createElement('input');
      inp.type = 'range'; inp.min = s.min; inp.max = s.max; inp.step = s.step; inp.value = params[s.key];
      const fmt = () => { val.textContent = (s.step >= 1 ? params[s.key].toFixed(0) : params[s.key].toFixed(2)); };
      const paint = () => inp.style.setProperty('--p', (100 * (params[s.key] - s.min) / (s.max - s.min)) + '%');
      inp.addEventListener('input', () => {
        params[s.key] = +inp.value; fmt(); paint();
        if (s.key === 'furl') rt.furlAuto = false; // scrubbing furl takes manual control
      });
      fmt(); paint();
      lab.appendChild(name); lab.appendChild(val);
      wrap.appendChild(lab); wrap.appendChild(inp); host.appendChild(wrap);
      sliderEls[s.key] = { inp, fmt, paint };
    }

    document.getElementById('collapse')?.addEventListener('click', () => {
      document.getElementById('panel').classList.toggle('collapsed');
    });
    const furlBtn = document.getElementById('btnFurl');
    furlBtn?.addEventListener('click', () => {
      rt.furlAuto = !rt.furlAuto;
      furlBtn.classList.toggle('active', !rt.furlAuto);
      furlBtn.textContent = rt.furlAuto ? '✊ furl' : '↻ auto';
      if (!rt.furlAuto) { params.furl = rt.furl > 0.5 ? 0 : 1; syncSliders(); }
    });
    const pauseBtn = document.getElementById('btnPause');
    pauseBtn?.addEventListener('click', () => togglePause(pauseBtn));
    document.getElementById('btnReset')?.addEventListener('click', reset);
    document.getElementById('btnRandom')?.addEventListener('click', surprise);
    document.getElementById('btnWild')?.addEventListener('click', wild);
    document.getElementById('btnBrain')?.addEventListener('click', reseedBrain);
    document.getElementById('btnShot')?.addEventListener('click', () => { pendingShot = true; });
    document.getElementById('btnFull')?.addEventListener('click', toggleFull);
    window._pauseBtn = pauseBtn;
  }

  function attachInput() {
    const ptrs = new Map();
    let lastPinch = 0;
    canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); });
    const drop = (e) => { ptrs.delete(e.pointerId); lastPinch = 0; };
    canvas.addEventListener('pointerup', drop);
    canvas.addEventListener('pointercancel', drop);
    canvas.addEventListener('pointermove', (e) => {
      const p = ptrs.get(e.pointerId); if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
      if (ptrs.size === 1) {
        rt.yaw -= dx * 0.006;
        params.pitch = Math.max(-1.4, Math.min(1.4, params.pitch + dy * 0.006));
        const s = sliderEls.pitch; if (s) { s.inp.value = params.pitch; s.fmt(); s.paint(); }
      } else if (ptrs.size === 2) {
        const arr = [...ptrs.values()];
        const d = Math.hypot(arr[0].x - arr[1].x, arr[0].y - arr[1].y);
        if (lastPinch) params.dist = Math.max(2.5, Math.min(12, params.dist - (d - lastPinch) * 0.01));
        lastPinch = d;
        const s = sliderEls.dist; if (s) { s.inp.value = params.dist; s.fmt(); s.paint(); }
      }
    });
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      params.dist = Math.max(2.5, Math.min(12, params.dist + e.deltaY * 0.004));
      const s = sliderEls.dist; if (s) { s.inp.value = params.dist; s.fmt(); s.paint(); }
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
      else if (k === 'f') { rt.furlAuto = !rt.furlAuto; if (!rt.furlAuto) { params.furl = rt.furl > 0.5 ? 0 : 1; syncSliders(); } }
      else if (k === 'r') reset();
      else if (k === 's') pendingShot = true;
      else if (k === 'b') reseedBrain();
      else if (k === 'w') wild();
    });
  }

  async function init() {
    if (!navigator.gpu) return fail('This browser has no WebGPU.');
    let adapter, device;
    try {
      adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
      if (!adapter) return fail('No WebGPU adapter (GPU) available.');
      device = await adapter.requestDevice();
    } catch (e) { console.error(e); return fail('WebGPU device request failed.'); }

    const wgctx = canvas.getContext('webgpu');
    const format = navigator.gpu.getPreferredCanvasFormat();
    wgctx.configure({ device, format, alphaMode: 'opaque' });

    const module = device.createShaderModule({ code: WGSL });
    const cinfo = await module.getCompilationInfo();
    const errs = cinfo.messages.filter((m) => m.type === 'error');
    if (errs.length) {
      console.error(errs);
      return fail('Shader error: ' + errs.map((m) => 'L' + m.lineNum + ' ' + m.message).join(' | '));
    }

    const DEPTH = 'depth24plus';
    const bgPipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module, entryPoint: 'vbg' },
      fragment: { module, entryPoint: 'fbg', targets: [{ format }] },
      primitive: { topology: 'triangle-list' },
      depthStencil: { format: DEPTH, depthWriteEnabled: false, depthCompare: 'always' },
    });
    const pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module, entryPoint: 'vs',
        buffers: [
          { arrayStride: 24, attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' },
            { shaderLocation: 1, offset: 12, format: 'float32x3' },
          ] },
          { arrayStride: 32, stepMode: 'instance', attributes: [
            { shaderLocation: 2, offset: 0, format: 'float32x3' },
            { shaderLocation: 3, offset: 12, format: 'float32x3' },
            { shaderLocation: 4, offset: 24, format: 'float32' },
          ] },
        ],
      },
      fragment: { module, entryPoint: 'fs', targets: [{ format }] },
      primitive: { topology: 'triangle-list', cullMode: 'back' },
      depthStencil: { format: DEPTH, depthWriteEnabled: true, depthCompare: 'less' },
    });
    const tubePipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module, entryPoint: 'vtube',
        buffers: [
          { arrayStride: 12, attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' },
          ] },
          { arrayStride: 36, stepMode: 'instance', attributes: [
            { shaderLocation: 2, offset: 0, format: 'float32x3' },
            { shaderLocation: 3, offset: 12, format: 'float32x3' },
            { shaderLocation: 4, offset: 24, format: 'float32x2' },
            { shaderLocation: 5, offset: 32, format: 'float32' },
          ] },
        ],
      },
      fragment: { module, entryPoint: 'fs', targets: [{ format }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: { format: DEPTH, depthWriteEnabled: true, depthCompare: 'less' },
    });

    const sphere = makeSphere(9, 12);
    const meshBuf = device.createBuffer({ size: sphere.verts.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(meshBuf, 0, sphere.verts);
    const idxBuf = device.createBuffer({ size: sphere.idx.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(idxBuf, 0, sphere.idx);
    const idxCount = sphere.idx.length;

    const tube = makeTube(8);
    const tubeBuf = device.createBuffer({ size: tube.verts.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(tubeBuf, 0, tube.verts);
    const tubeIdxBuf = device.createBuffer({ size: tube.idx.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(tubeIdxBuf, 0, tube.idx);
    const tubeIdxCount = tube.idx.length;

    const instData = new Float32Array(MAX_INST * FLOATS_PER);
    const instBuf = device.createBuffer({ size: instData.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    const linkData = new Float32Array(MAX_LINK * FLOATS_PER_LINK);
    const linkBuf = device.createBuffer({ size: linkData.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });

    const ubo = device.createBuffer({ size: 32 * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const u = new Float32Array(32);
    const bgBind = device.createBindGroup({ layout: bgPipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: ubo } }] });
    const bind = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: ubo } }] });
    const tubeBind = device.createBindGroup({ layout: tubePipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: ubo } }] });

    let W = 1, H = 1, depthTex = null, depthView = null;
    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = Math.max(1, Math.floor(canvas.clientWidth * dpr));
      H = Math.max(1, Math.floor(canvas.clientHeight * dpr));
      canvas.width = W; canvas.height = H;
      if (depthTex) depthTex.destroy();
      depthTex = device.createTexture({ size: [W, H], format: DEPTH, usage: GPUTextureUsage.RENDER_ATTACHMENT });
      depthView = depthTex.createView();
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
      const time = now / 1000;
      if (!rt.paused) rt.yaw += params.spinSpeed * dt;

      // furl: auto breathing eases toward a sine target; manual uses the slider
      let target = params.furl;
      if (rt.furlAuto && !rt.paused) {
        rt.furlPhase += params.furlSpeed * dt;
        target = 0.5 - 0.5 * Math.cos(rt.furlPhase);
      }
      rt.furl += (target - rt.furl) * Math.min(1, dt * 5);

      organism.tick?.(ctx, dt);
      if (!rt.paused) rt.flowT += dt;

      const em = makeEmitter(instData, linkData);
      organism.build(em, ctx, rt.flowT);
      const count = em.beads, linkCount = em.links;
      device.queue.writeBuffer(instBuf, 0, instData, 0, count * FLOATS_PER);
      if (linkCount) device.queue.writeBuffer(linkBuf, 0, linkData, 0, linkCount * FLOATS_PER_LINK);

      // fold this frame's trail deposits into the shared field (freeze on pause)
      if ((params.brain ?? 0) > 0 && trailIsActive()) {
        if (rt.paused) trailClearBrush();
        else trailUpdate(params.trailDecay, params.trailDiffuse);
      }

      const cp = Math.cos(params.pitch), sp = Math.sin(params.pitch);
      const eye = [
        params.dist * cp * Math.sin(rt.yaw),
        params.dist * sp,
        params.dist * cp * Math.cos(rt.yaw),
      ];
      const proj = perspective(params.fov * Math.PI / 180, W / H, 0.05, 100);
      const view = lookAt(eye, [0, 0.05, 0], [0, 1, 0]);
      const vp = mul4(proj, view);
      for (let i = 0; i < 16; i++) u[i] = vp[i];
      u[16] = eye[0]; u[17] = eye[1]; u[18] = eye[2]; u[19] = params.exposure;
      const ld = norm([0.5, 0.9, 0.4]);
      u[20] = ld[0]; u[21] = ld[1]; u[22] = ld[2]; u[23] = 0.28;
      u[24] = params.palette; u[25] = params.fog; u[26] = params.glow; u[27] = time;
      u[28] = W; u[29] = H; u[30] = params.bg; u[31] = params.vignette;
      device.queue.writeBuffer(ubo, 0, u);

      const enc = device.createCommandEncoder();
      const pass = enc.beginRenderPass({
        colorAttachments: [{
          view: wgctx.getCurrentTexture().createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'store',
        }],
        depthStencilAttachment: {
          view: depthView, depthClearValue: 1.0, depthLoadOp: 'clear', depthStoreOp: 'store',
        },
      });
      pass.setPipeline(bgPipeline); pass.setBindGroup(0, bgBind); pass.draw(3);
      if (linkCount) {
        pass.setPipeline(tubePipeline); pass.setBindGroup(0, tubeBind);
        pass.setVertexBuffer(0, tubeBuf); pass.setVertexBuffer(1, linkBuf);
        pass.setIndexBuffer(tubeIdxBuf, 'uint16');
        pass.drawIndexed(tubeIdxCount, linkCount);
      }
      pass.setPipeline(pipeline); pass.setBindGroup(0, bind);
      pass.setVertexBuffer(0, meshBuf); pass.setVertexBuffer(1, instBuf);
      pass.setIndexBuffer(idxBuf, 'uint16');
      pass.drawIndexed(idxCount, count);
      pass.end();
      device.queue.submit([enc.finish()]);

      frames++; fpsT += dt;
      if (fpsT >= 0.5) { fpsEl.textContent = Math.round(frames / fpsT) + ' fps · ' + count + ' beads · ' + linkCount + ' links'; frames = 0; fpsT = 0; }

      if (pendingShot) { doShot(); pendingShot = false; }
      requestAnimationFrame(frame);
    }
    rt.last = performance.now();
    requestAnimationFrame(frame);
  }

  init();
}
