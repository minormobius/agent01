// webgpu.js — the renderer. One pipeline, instanced indexed meshes, hemispheric
// + sun lighting, distance fog. No textures, no build step: meshes carry vertex
// colour, instances carry a model matrix + an emissive/tint vec4.
//
// Vertex layout: position(3) · normal(3) · colour(3) = 9 floats.
// group(0) = per-frame uniform (viewProj, camera, light, sky/fog).
// group(1) = per-mesh storage array of instances {model: mat4, tint: vec4}.
//
// WebGPU specifics that bite: depth clips to [0,1] (math.js uses perspectiveZO),
// and the canvas format must come from getPreferredCanvasFormat().

const WGSL = /* wgsl */`
struct Frame {
  viewProj : mat4x4<f32>,
  camPos   : vec4<f32>,   // xyz camera, w = fog far
  lightDir : vec4<f32>,
  sky      : vec4<f32>,   // rgb sky colour, a = fog far distance
};
struct Inst { model : mat4x4<f32>, tint : vec4<f32> };

@group(0) @binding(0) var<uniform> F : Frame;
@group(1) @binding(0) var<storage, read> insts : array<Inst>;

struct VSOut {
  @builtin(position) clip : vec4<f32>,
  @location(0) wpos : vec3<f32>,
  @location(1) nrm  : vec3<f32>,
  @location(2) col  : vec3<f32>,
  @location(3) emit : f32,
};

@vertex
fn vs(@builtin(instance_index) ii : u32,
      @location(0) pos : vec3<f32>,
      @location(1) nrm : vec3<f32>,
      @location(2) col : vec3<f32>) -> VSOut {
  let inst = insts[ii];
  let w = inst.model * vec4<f32>(pos, 1.0);
  var o : VSOut;
  o.clip = F.viewProj * w;
  o.wpos = w.xyz;
  o.nrm  = (inst.model * vec4<f32>(nrm, 0.0)).xyz;
  o.col  = col * inst.tint.rgb;
  o.emit = inst.tint.a;
  return o;
}

@fragment
fn fs(i : VSOut) -> @location(0) vec4<f32> {
  let n = normalize(i.nrm);
  let L = normalize(F.lightDir.xyz);
  let diff = max(dot(n, L), 0.0);
  let hemi = 0.5 + 0.5 * n.y;
  let amb = mix(vec3<f32>(0.16, 0.18, 0.24), vec3<f32>(0.72, 0.8, 0.95), hemi);
  var lit = i.col * (amb * 0.55 + diff * 0.9);
  lit = mix(lit, i.col, clamp(i.emit, 0.0, 1.0));   // emissive override
  let d = length(i.wpos - F.camPos.xyz);
  let fog = clamp((d - F.sky.a * 0.35) / (F.sky.a * 0.65), 0.0, 1.0);
  lit = mix(lit, F.sky.rgb, fog * fog);
  return vec4<f32>(lit, 1.0);
}`;

export async function initRenderer(canvas) {
  if (!navigator.gpu) throw new Error('WebGPU is not available in this browser.');
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) throw new Error('No WebGPU adapter (try a GPU-enabled browser).');
  const device = await adapter.requestDevice();
  const context = canvas.getContext('webgpu');
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: 'opaque' });
  return new Renderer(device, context, format, canvas);
}

class Renderer {
  constructor(device, context, format, canvas) {
    this.device = device; this.context = context; this.format = format; this.canvas = canvas;
    this.depth = null; this._w = 0; this._h = 0;

    const module = device.createShaderModule({ code: WGSL });
    this.frameLayout = device.createBindGroupLayout({
      entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }],
    });
    this.instLayout = device.createBindGroupLayout({
      entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } }],
    });
    this.pipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.frameLayout, this.instLayout] }),
      vertex: {
        module, entryPoint: 'vs',
        buffers: [{
          arrayStride: 9 * 4,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' },
            { shaderLocation: 1, offset: 12, format: 'float32x3' },
            { shaderLocation: 2, offset: 24, format: 'float32x3' },
          ],
        }],
      },
      fragment: { module, entryPoint: 'fs', targets: [{ format }] },
      // cullMode 'none': the cylinder's far inner wall (the land curving overhead)
      // must render, and it spares us winding-direction bugs on the procedural meshes.
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
    });

    this.frameBuf = device.createBuffer({ size: 112, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.frameBind = device.createBindGroup({
      layout: this.frameLayout, entries: [{ binding: 0, resource: { buffer: this.frameBuf } }],
    });
    this._frameData = new Float32Array(28); // 112 bytes
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));
    if (w === this._w && h === this._h) return;
    this.canvas.width = w; this.canvas.height = h; this._w = w; this._h = h;
    if (this.depth) this.depth.destroy();
    this.depth = this.device.createTexture({
      size: [w, h], format: 'depth24plus', usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
  }

  get aspect() { return this._w / this._h; }

  // Build a drawable from a {verts, indices} mesh.
  mesh(geo, initialCapacity = 1) {
    const vbuf = this.device.createBuffer({ size: geo.verts.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    this.device.queue.writeBuffer(vbuf, 0, geo.verts);
    const ibuf = this.device.createBuffer({ size: geo.indices.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
    this.device.queue.writeBuffer(ibuf, 0, geo.indices);
    const r = { vbuf, ibuf, indexCount: geo.indices.length, instBuf: null, bind: null, capacity: 0, count: 0 };
    this._ensureInstances(r, initialCapacity);
    return r;
  }

  _ensureInstances(r, capacity) {
    if (capacity <= r.capacity) return;
    if (r.instBuf) r.instBuf.destroy();
    r.capacity = Math.max(capacity, 1);
    r.instBuf = this.device.createBuffer({
      size: r.capacity * 20 * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    r.bind = this.device.createBindGroup({ layout: this.instLayout, entries: [{ binding: 0, resource: { buffer: r.instBuf } }] });
  }

  // instData: Float32Array, 20 floats per instance (mat4 model + vec4 tint).
  setInstances(r, instData) {
    const count = instData.length / 20;
    r.count = count;
    if (count === 0) return;            // nothing to upload (e.g. an empty species batch)
    this._ensureInstances(r, count);
    this.device.queue.writeBuffer(r.instBuf, 0, instData);
  }

  // frame uniform: {viewProj Float32Array(16), camPos[3], fogFar, lightDir[3], sky[3]}
  setFrame({ viewProj, camPos, lightDir, sky, fogFar }) {
    const d = this._frameData;
    d.set(viewProj, 0);
    d[16] = camPos[0]; d[17] = camPos[1]; d[18] = camPos[2]; d[19] = fogFar;
    d[20] = lightDir[0]; d[21] = lightDir[1]; d[22] = lightDir[2]; d[23] = 0;
    d[24] = sky[0]; d[25] = sky[1]; d[26] = sky[2]; d[27] = fogFar;
    this.device.queue.writeBuffer(this.frameBuf, 0, d);
  }

  render(drawables, sky) {
    const enc = this.device.createCommandEncoder();
    const pass = enc.beginRenderPass({
      colorAttachments: [{
        view: this.context.getCurrentTexture().createView(),
        clearValue: { r: sky[0], g: sky[1], b: sky[2], a: 1 },
        loadOp: 'clear', storeOp: 'store',
      }],
      depthStencilAttachment: {
        view: this.depth.createView(),
        depthClearValue: 1.0, depthLoadOp: 'clear', depthStoreOp: 'store',
      },
    });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.frameBind);
    for (const r of drawables) {
      if (!r || r.count === 0) continue;
      pass.setBindGroup(1, r.bind);
      pass.setVertexBuffer(0, r.vbuf);
      pass.setIndexBuffer(r.ibuf, 'uint32');
      pass.drawIndexed(r.indexCount, r.count);
    }
    pass.end();
    this.device.queue.submit([enc.finish()]);
  }
}
