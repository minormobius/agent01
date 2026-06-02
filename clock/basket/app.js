// Basket Star — a furling/unfurling Gorgonocephalus on a 5-fold loops fractal
// body plan, every element alive. WebGPU, real 3D (perspective + depth).
//
// Body plan: a flattened central disk sprouts `arms` primary arms; each arm is
// a curling arc that bifurcates into two children in an ALTERNATING plane
// (rotate the branch frame 90 deg about its tangent each generation), recursing
// `depth` times — the dense, space-filling crown of a basket star.
//
// Rendering: the whole creature is rebuilt on the CPU every frame as a list of
// beads (instanced spheres, knobbly like the real animal) and re-uploaded, so
// it genuinely MOVES — a global furl value coils/uncoils the arms while a
// per-branch writhe term (time + branch phase) makes the filaments undulate
// independently. Drag to spin, wheel to zoom.

const TAU = Math.PI * 2;

const WGSL = /* wgsl */`
struct U {
  vp    : mat4x4f,
  cam   : vec4f,   // camPos.xyz, exposure
  light : vec4f,   // lightDir.xyz, ambient
  misc  : vec4f,   // palette, fog, glow, time
  res   : vec4f,   // resX, resY, bgBright, vignette
};
@group(0) @binding(0) var<uniform> U : U;

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

// ---------------------------------------------------------------------------
// Parameters
// ---------------------------------------------------------------------------
const DEFAULTS = {
  spinSpeed: 0.18, pitch: 0.45, furlSpeed: 0.55, furl: 0.5,
  arms: 5, depth: 5, branchLen: 0.95, splay: 0.62, lenFall: 0.74,
  thickness: 0.045, writhe: 0.6, writheSpeed: 1.4,
  fov: 50, dist: 5.2, glow: 0.3, palette: 5,
  exposure: 1.15, fog: 0.10, bg: 0.7, vignette: 0.6,
};
const SLIDERS = [
  { key: 'spinSpeed', label: 'spin speed', min: -0.8, max: 0.8, step: 0.01 },
  { key: 'pitch', label: 'camera pitch', min: -1.4, max: 1.4, step: 0.01 },
  { key: 'furlSpeed', label: 'furl speed', min: 0, max: 2.0, step: 0.01 },
  { key: 'furl', label: 'furl amount', min: 0, max: 1, step: 0.01 },
  { key: 'arms', label: 'arms', min: 3, max: 8, step: 1 },
  { key: 'depth', label: 'branch depth', min: 2, max: 7, step: 1 },
  { key: 'branchLen', label: 'branch length', min: 0.4, max: 1.6, step: 0.01 },
  { key: 'splay', label: 'fork splay', min: 0.2, max: 1.2, step: 0.01 },
  { key: 'lenFall', label: 'child shrink', min: 0.5, max: 0.9, step: 0.01 },
  { key: 'thickness', label: 'thickness', min: 0.015, max: 0.09, step: 0.002 },
  { key: 'writhe', label: 'writhe', min: 0, max: 1.6, step: 0.02 },
  { key: 'writheSpeed', label: 'writhe speed', min: 0, max: 3.5, step: 0.02 },
  { key: 'dist', label: 'camera distance', min: 2.5, max: 12, step: 0.1 },
  { key: 'fov', label: 'field of view', min: 25, max: 90, step: 1 },
  { key: 'glow', label: 'glow', min: 0, max: 1.2, step: 0.02 },
  { key: 'exposure', label: 'exposure', min: 0.5, max: 2.0, step: 0.02 },
  { key: 'fog', label: 'fog', min: 0, max: 0.5, step: 0.01 },
  { key: 'bg', label: 'background', min: 0, max: 1.4, step: 0.02 },
  { key: 'vignette', label: 'vignette', min: 0, max: 1.5, step: 0.02 },
];
const PALETTES = ['rainbow', 'amber', 'ember', 'ice', 'orchid', 'coral', 'mono'];

const params = { ...DEFAULTS };
const rt = {
  yaw: 0.6, paused: false, last: 0,
  furl: 0.5, furlPhase: 0, furlAuto: true,
};

// ---------------------------------------------------------------------------
// vec / mat helpers
// ---------------------------------------------------------------------------
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function norm(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
// Rodrigues: rotate v around unit axis k by angle a
function rot(v, k, a) {
  const c = Math.cos(a), s = Math.sin(a);
  const kc = dot(k, v) * (1 - c);
  const cr = cross(k, v);
  return [
    v[0] * c + cr[0] * s + k[0] * kc,
    v[1] * c + cr[1] * s + k[1] * kc,
    v[2] * c + cr[2] * s + k[2] * kc,
  ];
}
const mix = (a, b, t) => a + (b - a) * t;

function perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
  return [
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, far * nf, -1,
    0, 0, far * near * nf, 0,
  ];
}
function lookAt(eye, c, up) {
  const z = norm(sub(eye, c));
  const x = norm(cross(up, z));
  const y = cross(z, x);
  return [
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -dot(x, eye), -dot(y, eye), -dot(z, eye), 1,
  ];
}
function mul4(a, b) {
  const o = new Array(16);
  for (let col = 0; col < 4; col++) for (let r = 0; r < 4; r++) {
    o[col * 4 + r] = a[r] * b[col * 4] + a[4 + r] * b[col * 4 + 1] + a[8 + r] * b[col * 4 + 2] + a[12 + r] * b[col * 4 + 3];
  }
  return o;
}

// ---------------------------------------------------------------------------
// UV sphere mesh (interleaved pos+normal; normal == unit pos)
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Build the creature into the instance buffer each frame
// instance = [posx,posy,posz, sx,sy,sz, colorT, _]  (8 floats)
// ---------------------------------------------------------------------------
const FLOATS_PER = 8;
const MAX_INST = 26000;
function buildCreature(inst, time) {
  let n = 0;
  const cap = inst.length - FLOATS_PER;
  function push(p, r, ct) {
    if (n > cap) return;
    inst[n] = p[0]; inst[n + 1] = p[1]; inst[n + 2] = p[2];
    inst[n + 3] = r[0]; inst[n + 4] = r[1]; inst[n + 5] = r[2];
    inst[n + 6] = ct; inst[n + 7] = 0;
    n += FLOATS_PER;
  }

  const th0 = params.thickness;
  const bodyR = th0 * 3.4 + 0.16;
  push([0, 0, 0], [bodyR, bodyR * 0.5, bodyR], 0.02);          // central disk
  const arms = Math.round(params.arms);
  const maxD = Math.round(params.depth);
  const furl = rt.furl;
  const segs = 6;
  const curlOpen = 0.45 * Math.PI;
  const curlClosed = 2.7 * Math.PI;

  // explicit stack instead of recursion (predictable, no call overhead)
  const stack = [];
  for (let a = 0; a < arms; a++) {
    const ang = a / arms * TAU + 0.0;
    const T = norm([Math.cos(ang), 0.5, Math.sin(ang)]);
    const B = norm(cross(T, [0, 1, 0]));
    const N = norm(cross(B, T));
    const base = [Math.cos(ang) * bodyR * 0.82, 0.02, Math.sin(ang) * bodyR * 0.82];
    stack.push({ p: base, t: T, n: N, b: B, len: params.branchLen, rad: th0, gen: 0, phase: a * 1.7 });
  }

  while (stack.length) {
    const br = stack.pop();
    let p = br.p, t = br.t, nn = br.n, b = br.b;
    const seg = br.len / segs;
    const curlTotal = mix(curlOpen, curlClosed, furl) * (1 - 0.12 * br.gen);
    const ctBase = br.gen / (maxD + 1);

    for (let i = 0; i < segs; i++) {
      const u = i / segs;
      const r = br.rad * (1 - 0.4 * u);
      const knob = 1 + 0.22 * Math.sin(u * 9 + br.phase);
      push(p, [r * knob, r * knob, r * knob], ctBase + u * 0.06);
      const wob = params.writhe * Math.sin(time * params.writheSpeed + br.phase + i * 0.6 + br.gen * 1.3);
      const dtheta = curlTotal / segs + wob * 0.14;
      t = rot(t, b, dtheta); nn = rot(nn, b, dtheta);
      const tw = wob * 0.10;
      nn = rot(nn, t, tw); b = rot(b, t, tw);
      p = [p[0] + t[0] * seg, p[1] + t[1] * seg, p[2] + t[2] * seg];
    }
    push(p, [br.rad * 0.6, br.rad * 0.6, br.rad * 0.6], ctBase + 0.06); // tip cap

    if (br.gen < maxD) {
      for (const side of [-1, 1]) {
        let ct = rot(t, b, side * params.splay);
        let cn = rot(nn, b, side * params.splay);
        let cb = norm(cross(ct, cn));
        cn = norm(cross(cb, ct));
        // alternate the bifurcation plane: spin the child frame 90deg about its tangent
        cn = rot(cn, ct, Math.PI / 2); cb = rot(cb, ct, Math.PI / 2);
        stack.push({
          p, t: ct, n: cn, b: cb,
          len: br.len * params.lenFall, rad: br.rad * params.lenFall,
          gen: br.gen + 1, phase: br.phase + side * 0.9 + br.gen * 0.5,
        });
      }
    }
  }
  return n / FLOATS_PER;
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

  const sphere = makeSphere(9, 12);
  const meshBuf = device.createBuffer({ size: sphere.verts.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(meshBuf, 0, sphere.verts);
  const idxBuf = device.createBuffer({ size: sphere.idx.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(idxBuf, 0, sphere.idx);
  const idxCount = sphere.idx.length;

  const instData = new Float32Array(MAX_INST * FLOATS_PER);
  const instBuf = device.createBuffer({ size: instData.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });

  const ubo = device.createBuffer({ size: 32 * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const u = new Float32Array(32);
  const bgBind = device.createBindGroup({ layout: bgPipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: ubo } }] });
  const bind = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: ubo } }] });

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

    const count = buildCreature(instData, time);
    device.queue.writeBuffer(instBuf, 0, instData, 0, count * FLOATS_PER);

    // camera
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
        view: ctx.getCurrentTexture().createView(),
        clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'store',
      }],
      depthStencilAttachment: {
        view: depthView, depthClearValue: 1.0, depthLoadOp: 'clear', depthStoreOp: 'store',
      },
    });
    pass.setPipeline(bgPipeline); pass.setBindGroup(0, bgBind); pass.draw(3);
    pass.setPipeline(pipeline); pass.setBindGroup(0, bind);
    pass.setVertexBuffer(0, meshBuf); pass.setVertexBuffer(1, instBuf);
    pass.setIndexBuffer(idxBuf, 'uint16');
    pass.drawIndexed(idxCount, count);
    pass.end();
    device.queue.submit([enc.finish()]);

    frames++; fpsT += dt;
    if (fpsT >= 0.5) { fpsEl.textContent = Math.round(frames / fpsT) + ' fps · ' + count + ' beads'; frames = 0; fpsT = 0; }

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
  const plab = document.createElement('label'); plab.innerHTML = '<span>palette</span>';
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

  document.getElementById('collapse').addEventListener('click', () => {
    document.getElementById('panel').classList.toggle('collapsed');
  });
  const furlBtn = document.getElementById('btnFurl');
  furlBtn.addEventListener('click', () => {
    rt.furlAuto = !rt.furlAuto;
    furlBtn.classList.toggle('active', !rt.furlAuto);
    furlBtn.textContent = rt.furlAuto ? '✊ furl' : '↻ auto';
    if (!rt.furlAuto) { params.furl = rt.furl > 0.5 ? 0 : 1; syncSliders(); }
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
  Object.assign(params, DEFAULTS);
  rt.yaw = 0.6; rt.furlAuto = true; rt.furlPhase = 0; rt.furl = 0.5;
  syncSliders();
}
function surprise() {
  const r = (a, b) => a + Math.random() * (b - a);
  params.arms = Math.round(r(4, 7));
  params.depth = Math.round(r(4, 6));
  params.splay = r(0.4, 1.0);
  params.lenFall = r(0.62, 0.82);
  params.branchLen = r(0.7, 1.3);
  params.thickness = r(0.03, 0.07);
  params.writhe = r(0.3, 1.2);
  params.writheSpeed = r(0.8, 2.6);
  params.furlSpeed = r(0.3, 1.2);
  params.palette = Math.floor(r(0, PALETTES.length));
  params.spinSpeed = r(-0.3, 0.3);
  rt.furlAuto = true;
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
    a.href = URL.createObjectURL(b); a.download = 'basket-star.png'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }, 'image/png');
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
  });
}

init();
