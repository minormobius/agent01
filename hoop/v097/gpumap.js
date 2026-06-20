// gpumap.js — a tiny WebGPU 2D renderer for hoop's map: it draws the Voronoi CELL FILLS (and their
// seams) as real vector geometry on the GPU, so the painted floor stays crisp at any zoom instead of
// being a magnified raster. The fixtures / glows / lights / residents / fog still draw on the 2D canvas
// on top (few + soft, so they don't pixelate noticeably). If WebGPU is unavailable, initGpuMap returns
// null and the caller keeps its existing baked-raster path — this layer is a pure upgrade, never a gate.
//
// Geometry: per-vertex world (x,y) + rgba. Cells are CONVEX (Voronoi), so a triangle fan from vertex 0
// triangulates each one with no earcut. The camera is a 2D affine (clip = pos*a.xy + a.zw) updated per
// frame. Two pipelines share it: triangle-list (fills) + line-list (seams). Alpha-blended.

const WGSL = /* wgsl */`
struct U { a : vec4<f32> };           // a.xy = world->clip scale, a.zw = world->clip offset
@group(0) @binding(0) var<uniform> u : U;
struct VSOut { @builtin(position) clip : vec4<f32>, @location(0) col : vec4<f32> };
@vertex fn vs(@location(0) pos : vec2<f32>, @location(1) col : vec4<f32>) -> VSOut {
  var o : VSOut;
  o.clip = vec4<f32>(pos.x * u.a.x + u.a.z, pos.y * u.a.y + u.a.w, 0.0, 1.0);
  o.col = col;
  return o;
}
@fragment fn fs(i : VSOut) -> @location(0) vec4<f32> { return i.col; }
`;

export async function initGpuMap(canvas) {
  if (!navigator.gpu || !canvas) return null;
  let device, ctx;
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return null;
    device = await adapter.requestDevice();
    ctx = canvas.getContext('webgpu');
    if (!ctx) return null;
    const format = navigator.gpu.getPreferredCanvasFormat();
    ctx.configure({ device, format, alphaMode: 'opaque' });
    return new GpuMap(device, ctx, format, canvas);
  } catch (e) { return null; }
}

class GpuMap {
  constructor(device, ctx, format, canvas) {
    this.device = device; this.ctx = ctx; this.canvas = canvas; this._w = 0; this._h = 0;
    const module = device.createShaderModule({ code: WGSL });
    this.uLayout = device.createBindGroupLayout({
      entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } }],
    });
    const layout = device.createPipelineLayout({ bindGroupLayouts: [this.uLayout] });
    const buffers = [{
      arrayStride: 6 * 4,
      attributes: [
        { shaderLocation: 0, offset: 0, format: 'float32x2' },    // world pos
        { shaderLocation: 1, offset: 8, format: 'float32x4' },    // rgba (0..1)
      ],
    }];
    const blend = {
      color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' },
      alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
    };
    const mk = (topology) => device.createRenderPipeline({
      layout,
      vertex: { module, entryPoint: 'vs', buffers },
      fragment: { module, entryPoint: 'fs', targets: [{ format, blend }] },
      primitive: { topology },
    });
    this.triPipe = mk('triangle-list');
    this.linePipe = mk('line-list');
    this.uBuf = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.uBind = device.createBindGroup({ layout: this.uLayout, entries: [{ binding: 0, resource: { buffer: this.uBuf } }] });
    this._u = new Float32Array(4);
  }

  resize(wpx, hpx) {
    wpx = Math.max(1, wpx | 0); hpx = Math.max(1, hpx | 0);
    if (wpx === this._w && hpx === this._h) return;
    this.canvas.width = wpx; this.canvas.height = hpx; this._w = wpx; this._h = hpx;
  }

  // pack an interleaved Float32Array [x,y,r,g,b,a, …] into a vertex buffer (or null if empty)
  buffer(data) {
    if (!data || !data.length) return null;
    const buf = this.device.createBuffer({ size: data.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    this.device.queue.writeBuffer(buf, 0, data);
    return { buf, count: data.length / 6 };
  }
  free(b) { if (b && b.buf) { try { b.buf.destroy(); } catch (e) {} } }

  setCamera(ax, ay, bx, by) { this._u[0] = ax; this._u[1] = ay; this._u[2] = bx; this._u[3] = by; this.device.queue.writeBuffer(this.uBuf, 0, this._u); }

  begin(bg) {
    this._enc = this.device.createCommandEncoder();
    this._pass = this._enc.beginRenderPass({
      colorAttachments: [{
        view: this.ctx.getCurrentTexture().createView(),
        clearValue: { r: bg[0], g: bg[1], b: bg[2], a: 1 },
        loadOp: 'clear', storeOp: 'store',
      }],
    });
    this._pass.setBindGroup(0, this.uBind);
  }
  drawTris(b) { if (!b || !this._pass) return; this._pass.setPipeline(this.triPipe); this._pass.setBindGroup(0, this.uBind); this._pass.setVertexBuffer(0, b.buf); this._pass.draw(b.count); }
  drawLines(b) { if (!b || !this._pass) return; this._pass.setPipeline(this.linePipe); this._pass.setBindGroup(0, this.uBind); this._pass.setVertexBuffer(0, b.buf); this._pass.draw(b.count); }
  end() { if (!this._pass) return; this._pass.end(); this.device.queue.submit([this._enc.finish()]); this._pass = null; this._enc = null; }
}
