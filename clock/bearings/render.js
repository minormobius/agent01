// render.js — WebGPU renderer for the bearing cell. Raw WebGPU, no libraries.
//
// Four passes, back to front:
//
//   1. cell        fullscreen; the oil, the equipotential rings, the pin, the cup
//   2. wires       one additive quad per conducting contact, brightness = current
//   3. bearings    one instanced quad per bearing, shaded as a sphere and rolled
//                  by its own orientation quaternion
//   4. glow        additive halo per bearing: charge (cool/warm) and ohmic heat
//
// All per-bearing data arrives as one flat f32 array straight out of wasm
// memory (see solver.js) and is indexed by hand in WGSL — no struct padding to
// get wrong.

import { BALL_STRIDE, EDGE_STRIDE } from './solver.js';

const MAX_EDGES = 8192;

export const SHADER = /* wgsl */ `
struct Uni {
  view : vec4<f32>,   // centre.xy, scale, aspect
  time : vec4<f32>,   // t, voltage knob, closed, polarity
  geom : vec4<f32>,   // pin radius, cup radius, show field, show wires
  tune : vec4<f32>,   // glow gain, spark phase, reserved, reserved
};

@group(0) @binding(0) var<uniform> u : Uni;
@group(0) @binding(1) var<storage, read> balls : array<f32>;
@group(0) @binding(2) var<storage, read> wires : array<f32>;

const QUAD = array<vec2<f32>, 6>(
  vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0), vec2<f32>(-1.0, 1.0),
  vec2<f32>(-1.0,  1.0), vec2<f32>(1.0, -1.0), vec2<f32>( 1.0, 1.0),
);

fn toClip(w : vec2<f32>) -> vec2<f32> {
  let p = (w - u.view.xy) * u.view.z;
  return vec2<f32>(p.x / u.view.w, p.y);
}

fn toWorld(clip : vec2<f32>) -> vec2<f32> {
  return u.view.xy + vec2<f32>(clip.x * u.view.w, clip.y) / u.view.z;
}

fn hash21(p : vec2<f32>) -> f32 {
  var q = fract(p * vec2<f32>(123.34, 456.21));
  q += dot(q, q + 45.32);
  return fract(q.x * q.y);
}

fn noise2(p : vec2<f32>) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let a = hash21(i);
  let b = hash21(i + vec2<f32>(1.0, 0.0));
  let c = hash21(i + vec2<f32>(0.0, 1.0));
  let d = hash21(i + vec2<f32>(1.0, 1.0));
  let s = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, s.x), mix(c, d, s.x), s.y);
}

// rotate v by quaternion q
fn qrot(q : vec4<f32>, v : vec3<f32>) -> vec3<f32> {
  let t = 2.0 * cross(q.xyz, v);
  return v + q.w * t + cross(q.xyz, t);
}

// ---------------------------------------------------------------- the cell --
struct FSOut { @builtin(position) pos : vec4<f32>, @location(0) clip : vec2<f32> };

@vertex fn vsFull(@builtin(vertex_index) vi : u32) -> FSOut {
  let p = QUAD[vi];
  var o : FSOut;
  o.pos = vec4<f32>(p, 0.0, 1.0);
  o.clip = p;
  return o;
}

@fragment fn fsCell(in : FSOut) -> @location(0) vec4<f32> {
  let w = toWorld(in.clip);
  let r = length(w);
  let pinR = u.geom.x;
  let cupR = u.geom.y;
  let t = u.time.x;
  let volts = u.time.y;

  // the bench the cup sits on
  var col = vec3<f32>(0.022, 0.026, 0.036) * (1.0 - 0.35 * smoothstep(1.0, 2.0, r));

  // oil: a slightly warm dark amber, with slow convection texture
  let oil = vec3<f32>(0.055, 0.052, 0.062)
          + 0.012 * noise2(w * 5.0 + vec2<f32>(t * 0.05, -t * 0.03))
          + 0.008 * noise2(w * 13.0 - vec2<f32>(t * 0.07, t * 0.04));
  let inOil = 1.0 - smoothstep(cupR - 0.004, cupR + 0.002, r);
  col = mix(col, oil, inOil);

  // equipotentials of the applied (empty cell) field: ln spacing, so they
  // crowd against the pin exactly where the field is strongest
  if (u.geom.z > 0.5 && r > pinR && r < cupR) {
    let phase = log(cupR / max(r, pinR)) / log(cupR / pinR);
    let band = abs(fract(phase * 9.0 - t * 0.06) - 0.5) * 2.0;
    let line = smoothstep(0.86, 1.0, band) * inOil;
    let tint = mix(vec3<f32>(0.16, 0.36, 0.72), vec3<f32>(0.85, 0.45, 0.12), u.time.w * 0.5 + 0.5);
    col += tint * line * 0.10 * clamp(volts, 0.0, 1.5);
  }

  // the cup wall: grounded steel ring
  let wall = smoothstep(cupR - 0.006, cupR - 0.001, r) * (1.0 - smoothstep(cupR + 0.030, cupR + 0.042, r));
  let hatch = 0.5 + 0.5 * sin(atan2(w.y, w.x) * 220.0);
  col = mix(col, vec3<f32>(0.30, 0.36, 0.46) * (0.75 + 0.25 * hatch), wall);
  col += vec3<f32>(0.10, 0.30, 0.55) * wall * 0.25;

  // the pin: live electrode, brighter with the supply turned up
  let pin = 1.0 - smoothstep(pinR - 0.004, pinR + 0.002, r);
  let pinShade = 0.55 + 0.45 * cos(atan2(w.y, w.x) * 3.0 + 0.6) * (r / max(pinR, 1e-4));
  let hot = mix(vec3<f32>(0.34, 0.52, 0.85), vec3<f32>(0.95, 0.62, 0.18), u.time.w * 0.5 + 0.5);
  col = mix(col, vec3<f32>(0.42, 0.44, 0.50) * pinShade + hot * 0.35 * clamp(volts, 0.0, 1.2), pin);
  // corona around the pin
  let corona = exp(-max(r - pinR, 0.0) * 26.0) * clamp(volts, 0.0, 1.5) * inOil;
  col += hot * corona * 0.22;

  return vec4<f32>(col, 1.0);
}

// --------------------------------------------------------------- the wires --
struct WOut {
  @builtin(position) pos : vec4<f32>,
  @location(0) local : vec2<f32>,
  @location(1) cur : f32,
  @location(2) spark : f32,
};

@vertex fn vsWire(@builtin(vertex_index) vi : u32, @builtin(instance_index) ii : u32) -> WOut {
  let b = ii * ${EDGE_STRIDE}u;
  let a = vec2<f32>(wires[b], wires[b + 1u]);
  let c = vec2<f32>(wires[b + 2u], wires[b + 3u]);
  let cur = wires[b + 4u];
  let spark = wires[b + 5u];

  let mid = 0.5 * (a + c);
  let d = c - a;
  let len = max(length(d), 1e-5);
  let dir = d / len;
  let nrm = vec2<f32>(-dir.y, dir.x);
  let halfW = (0.004 + 0.020 * abs(cur)) * (1.0 + 2.0 * spark);

  let q = QUAD[vi];
  let world = mid + dir * (q.x * len * 0.5) + nrm * (q.y * halfW);

  var o : WOut;
  o.pos = vec4<f32>(toClip(world), 0.0, 1.0);
  o.local = q;
  o.cur = cur;
  o.spark = spark;
  return o;
}

@fragment fn fsWire(in : WOut) -> @location(0) vec4<f32> {
  let across = 1.0 - abs(in.local.y);
  let core = pow(clamp(across, 0.0, 1.0), 2.2);
  let mag = clamp(abs(in.cur) * 6.0, 0.0, 1.0);
  // dim copper → amber → white hot
  var col = mix(vec3<f32>(0.55, 0.30, 0.10), vec3<f32>(1.0, 0.80, 0.45), mag);
  col = mix(col, vec3<f32>(1.0, 1.0, 1.0), mag * mag * 0.7);
  if (in.spark > 0.5) {
    let flick = 0.6 + 0.4 * sin(u.tune.y * 37.0 + in.local.x * 11.0);
    col = mix(col, vec3<f32>(0.75, 0.92, 1.0), 0.85) * flick * 2.2;
  }
  let a = core * (0.30 + 0.85 * mag);
  return vec4<f32>(col * a, a);
}

// ------------------------------------------------------------ the bearings --
struct BOut {
  @builtin(position) pos : vec4<f32>,
  @location(0) local : vec2<f32>,
  @location(1) quat : vec4<f32>,
  @location(2) data : vec4<f32>,   // q, v, heat, wired
};

@vertex fn vsBall(@builtin(vertex_index) vi : u32, @builtin(instance_index) ii : u32) -> BOut {
  let b = ii * ${BALL_STRIDE}u;
  let c = vec2<f32>(balls[b], balls[b + 1u]);
  let rad = balls[b + 2u];
  let q = QUAD[vi];

  var o : BOut;
  o.pos = vec4<f32>(toClip(c + q * rad * 1.04), 0.0, 1.0);
  o.local = q * 1.04;
  o.quat = vec4<f32>(balls[b + 6u], balls[b + 7u], balls[b + 8u], balls[b + 9u]);
  o.data = vec4<f32>(balls[b + 3u], balls[b + 4u], balls[b + 5u], balls[b + 11u]);
  return o;
}

@fragment fn fsBall(in : BOut) -> @location(0) vec4<f32> {
  let d = length(in.local);
  if (d > 1.0) { discard; }
  let z = sqrt(max(1.0 - d * d, 0.0));
  let n = vec3<f32>(in.local, z);

  // body-frame direction, so the surface figure turns as the bearing rolls
  let inv = vec4<f32>(-in.quat.xyz, in.quat.w);
  let body = qrot(inv, n);
  let speck = sin(body.x * 11.0) * sin(body.y * 9.0 + 1.3) * sin(body.z * 13.0 + 0.7);
  let mill = 1.0 - smoothstep(0.0, 0.035, abs(body.z));

  var albedo = vec3<f32>(0.60, 0.64, 0.71) * (1.0 + 0.10 * speck) * (1.0 - 0.18 * mill);

  // potential tint: warm toward the live pin, cool toward ground
  let v = clamp(in.data.y, -1.0, 1.0);
  let wired = in.data.w;
  let strength = select(0.22, 0.55, wired >= 1.0);
  albedo = mix(albedo, vec3<f32>(0.95, 0.62, 0.22), max(v, 0.0) * strength);
  albedo = mix(albedo, vec3<f32>(0.30, 0.55, 0.95), max(-v, 0.0) * strength);

  let L1 = normalize(vec3<f32>(-0.42, 0.60, 0.68));
  let L2 = normalize(vec3<f32>(0.65, -0.40, 0.45));
  let V = vec3<f32>(0.0, 0.0, 1.0);
  let diff = max(dot(n, L1), 0.0) * 0.85 + max(dot(n, L2), 0.0) * 0.25;
  let H1 = normalize(L1 + V);
  let spec = pow(max(dot(n, H1), 0.0), 68.0) * 0.9 + pow(max(dot(n, normalize(L2 + V)), 0.0), 24.0) * 0.18;
  let rim = pow(1.0 - z, 3.0) * 0.30;

  var col = albedo * (0.16 + diff) + vec3<f32>(1.0, 0.97, 0.90) * spec + vec3<f32>(0.35, 0.45, 0.65) * rim;

  // ohmic heat: a bearing carrying current runs hot
  let heat = clamp(in.data.z, 0.0, 4.0);
  col += vec3<f32>(1.0, 0.42, 0.10) * heat * 0.55;
  // in the closed path (wired to pin AND cup), it reads as filament
  if (wired > 2.5) { col += vec3<f32>(0.45, 0.28, 0.10) * 0.6; }

  // contact shadow at the far edge, so the pile has some depth
  col *= 1.0 - 0.30 * smoothstep(0.55, 1.0, d) * (0.5 - 0.5 * n.y);

  // edges must go low → high: smoothstep with edge0 > edge1 is undefined in WGSL
  let fw = max(fwidth(d), 1e-4);
  let a = 1.0 - smoothstep(1.0 - fw * 2.0, 1.0, d);
  return vec4<f32>(col, a);
}

// ----------------------------------------------------------------- the glow --
struct GOut {
  @builtin(position) pos : vec4<f32>,
  @location(0) local : vec2<f32>,
  @location(1) tint : vec4<f32>,
};

@vertex fn vsGlow(@builtin(vertex_index) vi : u32, @builtin(instance_index) ii : u32) -> GOut {
  let b = ii * ${BALL_STRIDE}u;
  let c = vec2<f32>(balls[b], balls[b + 1u]);
  let rad = balls[b + 2u];
  let q = balls[b + 3u];
  let heat = balls[b + 5u];
  let amp = clamp(abs(q) * 1.6 + heat * 0.8, 0.0, 2.0);
  let size = rad * (1.6 + 2.6 * amp);

  let quad = QUAD[vi];
  var o : GOut;
  o.pos = vec4<f32>(toClip(c + quad * size), 0.0, 1.0);
  o.local = quad;
  o.tint = vec4<f32>(select(vec3<f32>(0.25, 0.55, 1.0), vec3<f32>(1.0, 0.62, 0.20), q >= 0.0),
                     amp * u.tune.x);
  return o;
}

@fragment fn fsGlow(in : GOut) -> @location(0) vec4<f32> {
  let d = length(in.local);
  if (d > 1.0) { discard; }
  let fall = pow(1.0 - d, 2.6);
  let a = fall * in.tint.w * 0.35;
  return vec4<f32>(in.tint.xyz * a, a);
}
`;

export class Renderer {
  constructor(device, ctx, format) {
    this.device = device;
    this.ctx = ctx;
    this.format = format;

    const module = device.createShaderModule({ code: SHADER });
    this.uniform = device.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.ballBuf = null;
    this.ballCapacity = 0;
    this.wireBuf = device.createBuffer({
      size: MAX_EDGES * EDGE_STRIDE * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    this.layout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
      ],
    });
    const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [this.layout] });

    const blendAlpha = {
      color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' },
      alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
    };
    const blendAdd = {
      color: { srcFactor: 'one', dstFactor: 'one' },
      alpha: { srcFactor: 'one', dstFactor: 'one' },
    };
    const pipe = (vs, fs, blend) =>
      device.createRenderPipeline({
        layout: pipelineLayout,
        vertex: { module, entryPoint: vs },
        fragment: { module, entryPoint: fs, targets: [{ format, blend }] },
        primitive: { topology: 'triangle-list' },
      });

    this.pCell = pipe('vsFull', 'fsCell', undefined);
    this.pWire = pipe('vsWire', 'fsWire', blendAdd);
    this.pBall = pipe('vsBall', 'fsBall', blendAlpha);
    this.pGlow = pipe('vsGlow', 'fsGlow', blendAdd);

    this.uni = new Float32Array(16);
    this.ensureBalls(1024);
  }

  static async create(canvas) {
    if (!navigator.gpu) throw new Error('no-webgpu');
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) throw new Error('no-adapter');
    const device = await adapter.requestDevice();
    // Anything the driver rejects (a bad binding, a buffer overrun) is silent
    // otherwise — the canvas just goes empty and you get no idea why.
    device.addEventListener('uncapturederror', (ev) => {
      console.error('[webgpu]', ev.error?.message || ev.error);
    });
    const ctx = canvas.getContext('webgpu');
    const format = navigator.gpu.getPreferredCanvasFormat();
    // COPY_SRC so the page can read its own frame back — that is how the
    // headless check verifies the shaders actually drew something, and how the
    // 'c' key saves a still.
    ctx.configure({
      device,
      format,
      alphaMode: 'opaque',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });
    return new Renderer(device, ctx, format);
  }

  ensureBalls(n) {
    if (n <= this.ballCapacity) return;
    this.ballCapacity = Math.max(n, 1024);
    this.ballBuf?.destroy?.();
    this.ballBuf = this.device.createBuffer({
      size: this.ballCapacity * BALL_STRIDE * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this.bind = this.device.createBindGroup({
      layout: this.layout,
      entries: [
        { binding: 0, resource: { buffer: this.uniform } },
        { binding: 1, resource: { buffer: this.ballBuf } },
        { binding: 2, resource: { buffer: this.wireBuf } },
      ],
    });
  }

  /** Ask for the next drawn frame's pixels (RGBA8, row-padded to 256 bytes). */
  captureNext() {
    return new Promise((resolve) => { this.pending = resolve; });
  }

  /**
   * @param {Float32Array} balls  flat ball buffer straight from wasm
   * @param {Float32Array} wires  flat edge buffer straight from wasm
   * @param {object} view  { cx, cy, scale, aspect, time, volts, closed, polarity,
   *                         pinR, cupR, showField, showWires, glow, sparkPhase }
   */
  draw(balls, wires, view) {
    const n = balls.length / BALL_STRIDE;
    this.ensureBalls(n);
    const q = this.device.queue;

    this.uni.set([view.cx, view.cy, view.scale, view.aspect], 0);
    this.uni.set([view.time, view.volts, view.closed, view.polarity], 4);
    this.uni.set([view.pinR, view.cupR, view.showField ? 1 : 0, view.showWires ? 1 : 0], 8);
    this.uni.set([view.glow, view.sparkPhase, 0, 0], 12);
    q.writeBuffer(this.uniform, 0, this.uni);

    if (n > 0) q.writeBuffer(this.ballBuf, 0, balls, 0, n * BALL_STRIDE);
    const nWires = Math.min(wires.length / EDGE_STRIDE, MAX_EDGES);
    if (nWires > 0) q.writeBuffer(this.wireBuf, 0, wires, 0, nWires * EDGE_STRIDE);

    const enc = this.device.createCommandEncoder();
    const target = this.ctx.getCurrentTexture();
    const pass = enc.beginRenderPass({
      colorAttachments: [
        {
          view: target.createView(),
          clearValue: { r: 0.01, g: 0.012, b: 0.02, a: 1 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });
    pass.setBindGroup(0, this.bind);

    pass.setPipeline(this.pCell);
    pass.draw(6);

    if (view.showWires && nWires > 0) {
      pass.setPipeline(this.pWire);
      pass.draw(6, nWires);
    }
    if (n > 0) {
      pass.setPipeline(this.pBall);
      pass.draw(6, n);
      pass.setPipeline(this.pGlow);
      pass.draw(6, n);
    }

    pass.end();

    // optional readback of this very frame
    let grab = null;
    if (this.pending) {
      const bpr = Math.ceil((target.width * 4) / 256) * 256;
      grab = {
        buffer: this.device.createBuffer({ size: bpr * target.height, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ }),
        bpr,
        w: target.width,
        h: target.height,
      };
      enc.copyTextureToBuffer({ texture: target }, { buffer: grab.buffer, bytesPerRow: bpr }, {
        width: target.width, height: target.height,
      });
    }

    q.submit([enc.finish()]);

    if (grab) {
      const done = this.pending;
      this.pending = null;
      grab.buffer.mapAsync(GPUMapMode.READ).then(() => {
        const data = new Uint8Array(grab.buffer.getMappedRange()).slice();
        grab.buffer.unmap();
        grab.buffer.destroy();
        done({ w: grab.w, h: grab.h, bytesPerRow: grab.bpr, data, format: this.format });
      });
    }
  }
}
