// ── WebGPU Crystal Renderer ──────────────────────────────────
// Generates parametric crystal geometry from crystal system,
// colors it from mineral properties, and renders with interactive rotation.

let device, context, pipeline, depthTexture, uniformBuffer, uniformBindGroup;
let vertexBuffer, indexBuffer, indexCount;
let canvas, animId;

// Camera state
let rotX = -0.4, rotY = 0.6;
let dragging = false, lastX = 0, lastY = 0;

// ── Shader ──────────────────────────────────────────────────

const SHADER = `
struct Uniforms {
  mvp: mat4x4f,
  model: mat4x4f,
  baseColor: vec4f,
  lightDir: vec4f,
  opacity: f32,
  _pad: vec3f,
}
@group(0) @binding(0) var<uniform> u: Uniforms;

struct VSOut {
  @builtin(position) pos: vec4f,
  @location(0) normal: vec3f,
  @location(1) worldPos: vec3f,
}

@vertex fn vs(@location(0) pos: vec3f, @location(1) normal: vec3f) -> VSOut {
  var o: VSOut;
  o.pos = u.mvp * vec4f(pos, 1.0);
  o.normal = (u.model * vec4f(normal, 0.0)).xyz;
  o.worldPos = (u.model * vec4f(pos, 1.0)).xyz;
  return o;
}

@fragment fn fs(v: VSOut) -> @location(0) vec4f {
  let N = normalize(v.normal);
  let L = normalize(u.lightDir.xyz);

  // Diffuse
  let diff = max(dot(N, L), 0.0);
  // Ambient
  let ambient = 0.15;
  // Specular (Blinn-Phong)
  let viewDir = normalize(vec3f(0.0, 0.0, 3.0) - v.worldPos);
  let halfDir = normalize(L + viewDir);
  let spec = pow(max(dot(N, halfDir), 0.0), 64.0);

  // Fresnel rim for translucent gems
  let fresnel = pow(1.0 - max(dot(N, viewDir), 0.0), 3.0);

  let color = u.baseColor.rgb * (ambient + diff * 0.7) + vec3f(1.0) * spec * 0.5 + vec3f(0.3, 0.4, 0.5) * fresnel * 0.3;
  let alpha = mix(0.6, 1.0, u.opacity);

  return vec4f(color, alpha);
}
`;

// ── Init ────────────────────────────────────────────────────

export async function initCrystalViewer(cvs) {
  canvas = cvs;

  if (!navigator.gpu) return false;
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) return false;
  device = await adapter.requestDevice();

  context = canvas.getContext("webgpu");
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: "premultiplied" });

  const shaderModule = device.createShaderModule({ code: SHADER });

  pipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: {
      module: shaderModule, entryPoint: "vs",
      buffers: [{
        arrayStride: 24,
        attributes: [
          { shaderLocation: 0, offset: 0, format: "float32x3" },
          { shaderLocation: 1, offset: 12, format: "float32x3" },
        ],
      }],
    },
    fragment: {
      module: shaderModule, entryPoint: "fs",
      targets: [{ format, blend: {
        color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha" },
        alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha" },
      }}],
    },
    primitive: { topology: "triangle-list", cullMode: "back" },
    depthStencil: { depthWriteEnabled: true, depthCompare: "less", format: "depth24plus" },
  });

  uniformBuffer = device.createBuffer({ size: 256, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  uniformBindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
  });

  createDepthTexture();

  // Mouse/touch rotation
  canvas.addEventListener("pointerdown", e => { dragging = true; lastX = e.clientX; lastY = e.clientY; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener("pointermove", e => {
    if (!dragging) return;
    rotY += (e.clientX - lastX) * 0.008;
    rotX += (e.clientY - lastY) * 0.008;
    rotX = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, rotX));
    lastX = e.clientX; lastY = e.clientY;
  });
  canvas.addEventListener("pointerup", () => { dragging = false; });

  return true;
}

function createDepthTexture() {
  depthTexture = device.createTexture({
    size: [canvas.width, canvas.height],
    format: "depth24plus",
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });
}

// ── Crystal Geometry ────────────────────────────────────────

function buildCrystalGeometry(system, props) {
  switch (system) {
    case "cubic": return buildCubic(props);
    case "tetragonal": return buildTetragonal(props);
    case "orthorhombic": return buildOrthorhombic(props);
    case "hexagonal": return buildHexagonal(props);
    case "trigonal": return buildTrigonal(props);
    case "monoclinic": return buildMonoclinic(props);
    case "triclinic": return buildTriclinic(props);
    default: return buildCubic(props);
  }
}

// Flat-shaded: each triangle gets its own vertices with face normal
function flatMesh(verts, tris) {
  const positions = [];
  const normals = [];
  const indices = [];

  for (let i = 0; i < tris.length; i++) {
    const [a, b, c] = tris[i];
    const va = verts[a], vb = verts[b], vc = verts[c];

    // Face normal
    const ux = vb[0]-va[0], uy = vb[1]-va[1], uz = vb[2]-va[2];
    const vx = vc[0]-va[0], vy = vc[1]-va[1], vz = vc[2]-va[2];
    let nx = uy*vz - uz*vy, ny = uz*vx - ux*vz, nz = ux*vy - uy*vx;
    const len = Math.sqrt(nx*nx + ny*ny + nz*nz) || 1;
    nx /= len; ny /= len; nz /= len;

    const base = positions.length / 3;
    positions.push(va[0], va[1], va[2], vb[0], vb[1], vb[2], vc[0], vc[1], vc[2]);
    normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
    indices.push(base, base + 1, base + 2);
  }

  // Interleave pos + normal
  const vertData = new Float32Array(positions.length * 2);
  for (let i = 0; i < positions.length / 3; i++) {
    vertData[i * 6 + 0] = positions[i * 3 + 0];
    vertData[i * 6 + 1] = positions[i * 3 + 1];
    vertData[i * 6 + 2] = positions[i * 3 + 2];
    vertData[i * 6 + 3] = normals[i * 3 + 0];
    vertData[i * 6 + 4] = normals[i * 3 + 1];
    vertData[i * 6 + 5] = normals[i * 3 + 2];
  }

  return { vertData, indices: new Uint16Array(indices) };
}

function quad(a, b, c, d) { return [[a, b, c], [a, c, d]]; }

// ── Cubic: cube or octahedron ───────────────────────────────
function buildCubic() {
  // Octahedron — classic cubic habit
  const s = 1.0;
  const verts = [
    [0, s, 0], [0, -s, 0],
    [s, 0, 0], [-s, 0, 0],
    [0, 0, s], [0, 0, -s],
  ];
  const tris = [
    [0,4,2], [0,2,5], [0,5,3], [0,3,4],
    [1,2,4], [1,5,2], [1,3,5], [1,4,3],
  ];
  return flatMesh(verts, tris);
}

// ── Tetragonal: elongated octahedron ────────────────────────
function buildTetragonal() {
  const s = 0.7, h = 1.3;
  const verts = [
    [0, h, 0], [0, -h, 0],
    [s, 0, 0], [-s, 0, 0],
    [0, 0, s], [0, 0, -s],
  ];
  const tris = [
    [0,4,2], [0,2,5], [0,5,3], [0,3,4],
    [1,2,4], [1,5,2], [1,3,5], [1,4,3],
  ];
  return flatMesh(verts, tris);
}

// ── Orthorhombic: brick-like prism ──────────────────────────
function buildOrthorhombic() {
  const a = 0.6, b = 0.9, c = 1.2;
  const verts = [
    [-a, -b, -c], [a, -b, -c], [a, b, -c], [-a, b, -c],
    [-a, -b, c], [a, -b, c], [a, b, c], [-a, b, c],
  ];
  const tris = [
    ...quad(0,1,2,3), ...quad(4,7,6,5), // front/back
    ...quad(0,3,7,4), ...quad(1,5,6,2), // left/right
    ...quad(3,2,6,7), ...quad(0,4,5,1), // top/bottom
  ];
  return flatMesh(verts, tris);
}

// ── Hexagonal: hexagonal prism with pyramid caps ────────────
function buildHexagonal() {
  const r = 0.75, h = 0.8, tip = 1.4;
  const verts = [];
  // Bottom hex ring (0-5), top hex ring (6-11), bottom tip (12), top tip (13)
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 3 * i;
    verts.push([r * Math.cos(a), -h, r * Math.sin(a)]);
  }
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 3 * i;
    verts.push([r * Math.cos(a), h, r * Math.sin(a)]);
  }
  verts.push([0, -tip, 0]); // 12
  verts.push([0, tip, 0]);  // 13

  const tris = [];
  for (let i = 0; i < 6; i++) {
    const j = (i + 1) % 6;
    // Side quads
    tris.push([i, j, j + 6]);
    tris.push([i, j + 6, i + 6]);
    // Bottom pyramid
    tris.push([12, j, i]);
    // Top pyramid
    tris.push([13, i + 6, j + 6]);
  }
  return flatMesh(verts, tris);
}

// ── Trigonal: rhombohedron-like pointed crystal ─────────────
function buildTrigonal() {
  const r = 0.75, h = 0.7, tip = 1.5;
  const verts = [];
  // Bottom triangle (0-2), top triangle offset (3-5), tips (6,7)
  for (let i = 0; i < 3; i++) {
    const a = Math.PI * 2 / 3 * i - Math.PI / 6;
    verts.push([r * Math.cos(a), -h, r * Math.sin(a)]);
  }
  for (let i = 0; i < 3; i++) {
    const a = Math.PI * 2 / 3 * i - Math.PI / 6 + Math.PI / 6; // rotated 30°
    verts.push([r * 0.6 * Math.cos(a), h, r * 0.6 * Math.sin(a)]);
  }
  verts.push([0, -tip * 0.5, 0]); // 6 bottom tip
  verts.push([0, tip, 0]);  // 7 top tip (longer)

  const tris = [];
  for (let i = 0; i < 3; i++) {
    const j = (i + 1) % 3;
    // Side faces (quads split into triangles)
    tris.push([i, j, j + 3]);
    tris.push([i, j + 3, i + 3]);
    // Bottom pyramid
    tris.push([6, j, i]);
    // Top pyramid
    tris.push([7, i + 3, j + 3]);
  }
  return flatMesh(verts, tris);
}

// ── Monoclinic: tilted prism ────────────────────────────────
function buildMonoclinic() {
  const a = 0.6, b = 1.0, c = 0.7, skew = 0.3;
  const verts = [
    [-a + skew, -b, -c], [a + skew, -b, -c], [a + skew, -b, c], [-a + skew, -b, c],
    [-a - skew, b, -c], [a - skew, b, -c], [a - skew, b, c], [-a - skew, b, c],
  ];
  const tris = [
    ...quad(0,1,2,3), ...quad(4,7,6,5),
    ...quad(0,3,7,4), ...quad(1,5,6,2),
    ...quad(3,2,6,7), ...quad(0,4,5,1),
  ];
  return flatMesh(verts, tris);
}

// ── Triclinic: fully oblique prism ──────────────────────────
function buildTriclinic() {
  const sx = 0.15, sy = 0.25, sz = 0.1;
  const verts = [
    [-0.5 + sx, -1.0, -0.6 + sz], [0.5 + sx, -1.0, -0.5 + sz],
    [0.6, -1.0, 0.5], [-0.6, -1.0, 0.6],
    [-0.4 - sx, 1.0 + sy, -0.5 - sz], [0.6 - sx, 0.9 + sy, -0.6 - sz],
    [0.5, 1.1, 0.6], [-0.5, 1.0, 0.5],
  ];
  const tris = [
    ...quad(0,1,2,3), ...quad(4,7,6,5),
    ...quad(0,3,7,4), ...quad(1,5,6,2),
    ...quad(3,2,6,7), ...quad(0,4,5,1),
  ];
  return flatMesh(verts, tris);
}

// ── Matrices ────────────────────────────────────────────────

function mat4Perspective(fov, aspect, near, far) {
  const f = 1 / Math.tan(fov / 2);
  const r = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * r, -1,
    0, 0, 2 * far * near * r, 0,
  ]);
}

function mat4RotX(a) {
  const c = Math.cos(a), s = Math.sin(a);
  return [1,0,0,0, 0,c,s,0, 0,-s,c,0, 0,0,0,1];
}
function mat4RotY(a) {
  const c = Math.cos(a), s = Math.sin(a);
  return [c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1];
}
function mat4Translate(x, y, z) {
  return [1,0,0,0, 0,1,0,0, 0,0,1,0, x,y,z,1];
}
function mat4Mul(a, b) {
  const r = new Float32Array(16);
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++)
      for (let k = 0; k < 4; k++)
        r[i * 4 + j] += a[i * 4 + k] * b[k * 4 + j];
  return r;
}

// ── Render Loop ─────────────────────────────────────────────

let currentColor = [1, 1, 1, 1];
let currentOpacity = 1;
let autoSpin = true;

export function renderCrystal(system, props) {
  if (animId) cancelAnimationFrame(animId);

  const { vertData, indices } = buildCrystalGeometry(system, props);
  indexCount = indices.length;

  vertexBuffer = device.createBuffer({ size: vertData.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(vertexBuffer, 0, vertData);

  indexBuffer = device.createBuffer({ size: indices.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(indexBuffer, 0, indices);

  currentColor = props.color;
  currentOpacity = props.opacity;
  autoSpin = true;
  rotX = -0.4; rotY = 0.6;

  // Stop auto-spin on interaction
  canvas.addEventListener("pointerdown", () => { autoSpin = false; }, { once: true });

  function frame() {
    if (autoSpin) rotY += 0.008;

    const aspect = canvas.width / canvas.height;
    const proj = mat4Perspective(Math.PI / 4, aspect, 0.1, 100);
    const view = mat4Translate(0, 0, -4);
    const rx = mat4RotX(rotX);
    const ry = mat4RotY(rotY);
    const model = mat4Mul(rx, ry);
    const mvp = mat4Mul(mat4Mul(proj, view), model);

    // Pack uniforms: mvp(64) + model(64) + baseColor(16) + lightDir(16) + opacity(4) + pad(12) = 176
    const ubo = new ArrayBuffer(256);
    const f = new Float32Array(ubo);
    f.set(mvp, 0);        // offset 0: mvp
    f.set(model, 16);     // offset 64: model
    f.set(currentColor, 32); // offset 128: baseColor
    // lightDir at offset 144
    f[36] = 0.5; f[37] = 0.8; f[38] = 0.6; f[39] = 0;
    // opacity at offset 160
    f[40] = currentOpacity;

    device.queue.writeBuffer(uniformBuffer, 0, f);

    const commandEncoder = device.createCommandEncoder();
    const pass = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: context.getCurrentTexture().createView(),
        clearValue: { r: 0.06, g: 0.06, b: 0.08, a: 1 },
        loadOp: "clear", storeOp: "store",
      }],
      depthStencilAttachment: {
        view: depthTexture.createView(),
        depthClearValue: 1, depthLoadOp: "clear", depthStoreOp: "store",
      },
    });

    pass.setPipeline(pipeline);
    pass.setBindGroup(0, uniformBindGroup);
    pass.setVertexBuffer(0, vertexBuffer);
    pass.setIndexBuffer(indexBuffer, "uint16");
    pass.drawIndexed(indexCount);
    pass.end();

    device.queue.submit([commandEncoder.finish()]);
    animId = requestAnimationFrame(frame);
  }

  frame();
}
