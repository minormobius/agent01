// gl.js — the part renderer. Hand-written WebGL2, because the geometry
// pipeline is ours end to end: the engine hands over flat typed arrays with a
// face id per triangle, this uploads them once, shades them flat, draws the
// feature edges on top, and picks by rendering the face ids into an offscreen
// buffer — so a hover returns a *name*, not a triangle.
//
// Passes: solid (flat shading, two lights, hover/selection tint), edges
// (GL_LINES, depth-biased toward the eye), grid + axes, and an id pass into a
// framebuffer that only re-renders when the view or the mesh changes.

const VS_SOLID = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNrm;
layout(location=2) in float aFid;
uniform mat4 uProj, uView;
out vec3 vNrmV; out vec3 vPosV; flat out float vFid;
void main() {
  vec4 eye = uView * vec4(aPos, 1.0);
  gl_Position = uProj * eye;
  vPosV = eye.xyz;
  vNrmV = mat3(uView) * aNrm;
  vFid = aFid;
}`;

const FS_SOLID = `#version 300 es
precision highp float;
in vec3 vNrmV; in vec3 vPosV; flat in float vFid;
uniform float uHover, uSelect, uPreview;
uniform vec3 uBase;
out vec4 o;
void main() {
  vec3 N = normalize(vNrmV);
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(-vPosV);
  vec3 L1 = normalize(vec3(0.4, 0.6, 0.9));
  vec3 L2 = normalize(vec3(-0.7, -0.2, 0.3));
  float d = max(dot(N, L1), 0.0) * 0.75 + max(dot(N, L2), 0.0) * 0.25;
  float hemi = 0.5 + 0.5 * N.y;
  vec3 H = normalize(L1 + V);
  float spec = pow(max(dot(N, H), 0.0), 48.0) * 0.25;
  vec3 c = uBase * (0.28 + 0.62 * d + 0.12 * hemi) + spec;
  if (vFid == uHover) c = mix(c, vec3(1.0, 0.82, 0.30), 0.55);
  if (vFid == uSelect) c = mix(c, vec3(0.35, 0.85, 1.0), 0.55);
  if (!gl_FrontFacing) c *= 0.55;
  o = vec4(c, 1.0);
}`;

const VS_ID = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=2) in float aFid;
uniform mat4 uProj, uView;
flat out float vFid;
void main() { gl_Position = uProj * uView * vec4(aPos, 1.0); vFid = aFid; }`;

const FS_ID = `#version 300 es
precision highp float;
flat in float vFid;
out vec4 o;
void main() {
  float id = vFid + 1.0;
  o = vec4(mod(id, 256.0) / 255.0, mod(floor(id / 256.0), 256.0) / 255.0, floor(id / 65536.0) / 255.0, 1.0);
}`;

const VS_LINE = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uProj, uView;
uniform float uBias;
void main() { vec4 p = uProj * uView * vec4(aPos, 1.0); p.z -= uBias * p.w; gl_Position = p; }`;

const FS_LINE = `#version 300 es
precision highp float;
uniform vec4 uColor;
out vec4 o;
void main() { o = uColor; }`;

function compile(gl, vs, fs) {
  const mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name] = gl.getUniformLocation(p, info.name); }
  return { p, u };
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: false, preserveDrawingBuffer: true });
    if (!gl) throw new Error('WebGL2 is not available');
    this.gl = gl;
    this.solid = compile(gl, VS_SOLID, FS_SOLID);
    this.id = compile(gl, VS_ID, FS_ID);
    this.line = compile(gl, VS_LINE, FS_LINE);
    this.vaoSolid = gl.createVertexArray();
    this.bufPos = gl.createBuffer(); this.bufNrm = gl.createBuffer(); this.bufFid = gl.createBuffer();
    this.vaoEdges = gl.createVertexArray(); this.bufEdges = gl.createBuffer();
    this.vaoGrid = gl.createVertexArray(); this.bufGrid = gl.createBuffer();
    this.vaoAxes = gl.createVertexArray(); this.bufAxes = gl.createBuffer();
    this.count = 0; this.edgeCount = 0; this.gridCount = 0;
    this.hover = -1; this.select = -1; this.preview = false;
    this.base = [0.62, 0.66, 0.72];
    this.showEdges = true; this.showGrid = true;
    this.idDirty = true;
    this.fbo = null; this.fboSize = [0, 0];
    this.setupAxes();
    gl.enable(gl.DEPTH_TEST);
  }

  setMesh(streams, edges, bboxIn) {
    const gl = this.gl;
    gl.bindVertexArray(this.vaoSolid);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufPos); gl.bufferData(gl.ARRAY_BUFFER, streams.p3, gl.STATIC_DRAW); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufNrm); gl.bufferData(gl.ARRAY_BUFFER, streams.n3, gl.STATIC_DRAW); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufFid); gl.bufferData(gl.ARRAY_BUFFER, streams.f3, gl.STATIC_DRAW); gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 0, 0);
    this.count = streams.count;
    gl.bindVertexArray(this.vaoEdges);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufEdges); gl.bufferData(gl.ARRAY_BUFFER, edges, gl.STATIC_DRAW); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    this.edgeCount = edges.length / 3;
    gl.bindVertexArray(null);
    this.setGrid(bboxIn);
    this.idDirty = true;
  }

  clearMesh() { this.count = 0; this.edgeCount = 0; this.idDirty = true; }

  setGrid(bbox) {
    const gl = this.gl;
    const ext = bbox && isFinite(bbox[0][0]) ? Math.max(bbox[1][0] - bbox[0][0], bbox[1][1] - bbox[0][1], 1) : 20;
    const step = Math.pow(10, Math.floor(Math.log10(ext / 4)));
    const n = Math.ceil((ext * 1.5) / step);
    const half = n * step;
    const z = bbox && isFinite(bbox[0][2]) ? Math.min(0, bbox[0][2]) : 0;
    const v = [];
    for (let i = -n; i <= n; i++) { const x = i * step; v.push(x, -half, z, x, half, z, -half, x, z, half, x, z); }
    gl.bindVertexArray(this.vaoGrid);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufGrid); gl.bufferData(gl.ARRAY_BUFFER, Float32Array.from(v), gl.STATIC_DRAW); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    this.gridCount = v.length / 3; this.gridStep = step; this.gridZ = z; this.gridHalf = half;
  }

  setupAxes() {
    const gl = this.gl;
    gl.bindVertexArray(this.vaoAxes);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufAxes); gl.bufferData(gl.ARRAY_BUFFER, Float32Array.from([0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1]), gl.STATIC_DRAW); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(this.canvas.clientWidth * dpr)), h = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; this.idDirty = true; }
  }

  render(cam) {
    const gl = this.gl; this.resize();
    const W = this.canvas.width, H = this.canvas.height;
    gl.viewport(0, 0, W, H);
    gl.clearColor(0.11, 0.12, 0.14, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const proj = cam.proj(W / H), view = cam.view();
    // grid
    if (this.showGrid && this.gridCount) {
      gl.useProgram(this.line.p); gl.uniformMatrix4fv(this.line.u.uProj, false, proj); gl.uniformMatrix4fv(this.line.u.uView, false, view); gl.uniform1f(this.line.u.uBias, 0);
      gl.bindVertexArray(this.vaoGrid); gl.uniform4f(this.line.u.uColor, 0.22, 0.24, 0.28, 1); gl.drawArrays(gl.LINES, 0, this.gridCount);
    }
    // solid
    if (this.count) {
      gl.useProgram(this.solid.p);
      gl.uniformMatrix4fv(this.solid.u.uProj, false, proj); gl.uniformMatrix4fv(this.solid.u.uView, false, view);
      gl.uniform1f(this.solid.u.uHover, this.hover); gl.uniform1f(this.solid.u.uSelect, this.select); gl.uniform1f(this.solid.u.uPreview, this.preview ? 1 : 0);
      const b = this.preview ? [0.55, 0.62, 0.74] : this.base;
      gl.uniform3f(this.solid.u.uBase, b[0], b[1], b[2]);
      gl.bindVertexArray(this.vaoSolid); gl.drawArrays(gl.TRIANGLES, 0, this.count);
    }
    // edges
    if (this.showEdges && this.edgeCount) {
      gl.useProgram(this.line.p); gl.uniformMatrix4fv(this.line.u.uProj, false, proj); gl.uniformMatrix4fv(this.line.u.uView, false, view); gl.uniform1f(this.line.u.uBias, 0.0006);
      gl.bindVertexArray(this.vaoEdges); gl.uniform4f(this.line.u.uColor, 0.06, 0.07, 0.09, 1); gl.drawArrays(gl.LINES, 0, this.edgeCount);
    }
    // axes triad, bottom-left
    const s = Math.floor(Math.min(W, H) * 0.12);
    gl.viewport(8, 8, s, s); gl.clear(gl.DEPTH_BUFFER_BIT);
    const c2 = Object.assign(Object.create(Object.getPrototypeOf(cam)), cam, { target: [0, 0, 0], distance: 3.2, ortho: true });
    gl.useProgram(this.line.p); gl.uniformMatrix4fv(this.line.u.uProj, false, c2.proj(1)); gl.uniformMatrix4fv(this.line.u.uView, false, c2.view()); gl.uniform1f(this.line.u.uBias, 0);
    gl.bindVertexArray(this.vaoAxes);
    gl.uniform4f(this.line.u.uColor, 0.95, 0.35, 0.35, 1); gl.drawArrays(gl.LINES, 0, 2);
    gl.uniform4f(this.line.u.uColor, 0.45, 0.9, 0.4, 1); gl.drawArrays(gl.LINES, 2, 2);
    gl.uniform4f(this.line.u.uColor, 0.4, 0.6, 1.0, 1); gl.drawArrays(gl.LINES, 4, 2);
    gl.bindVertexArray(null);
    gl.viewport(0, 0, W, H);
    this.lastProj = proj; this.lastView = view;
  }

  ensureFbo() {
    const gl = this.gl; const W = this.canvas.width, H = this.canvas.height;
    if (this.fbo && this.fboSize[0] === W && this.fboSize[1] === H) return;
    if (this.fbo) { gl.deleteFramebuffer(this.fbo); gl.deleteTexture(this.fboTex); gl.deleteRenderbuffer(this.fboDepth); }
    this.fbo = gl.createFramebuffer(); this.fboTex = gl.createTexture(); this.fboDepth = gl.createRenderbuffer();
    gl.bindTexture(gl.TEXTURE_2D, this.fboTex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.bindRenderbuffer(gl.RENDERBUFFER, this.fboDepth); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, W, H);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.fboTex, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.fboDepth);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.fboSize = [W, H]; this.idDirty = true;
  }

  /// Face id under a CSS pixel, or -1. The id pass is redrawn only when the
  /// view or the mesh changed since the last pick.
  pick(cssX, cssY, cam) {
    if (!this.count) return -1;
    const gl = this.gl; this.ensureFbo();
    const W = this.canvas.width, H = this.canvas.height;
    if (this.idDirty || this.pickView !== this.lastView) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo); gl.viewport(0, 0, W, H);
      gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(this.id.p); gl.uniformMatrix4fv(this.id.u.uProj, false, this.lastProj || cam.proj(W / H)); gl.uniformMatrix4fv(this.id.u.uView, false, this.lastView || cam.view());
      gl.bindVertexArray(this.vaoSolid); gl.drawArrays(gl.TRIANGLES, 0, this.count); gl.bindVertexArray(null);
      this.idDirty = false; this.pickView = this.lastView;
    } else gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    const dpr = W / this.canvas.clientWidth;
    const px = Math.floor(cssX * dpr), py = Math.floor(H - cssY * dpr);
    const buf = new Uint8Array(4);
    gl.readPixels(px, py, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const id = buf[0] + buf[1] * 256 + buf[2] * 65536;
    return id === 0 ? -1 : id - 1;
  }

  snapshot(type = 'image/png') { return this.canvas.toDataURL(type); }
}
