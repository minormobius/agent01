// gl.js — WebGL2 renderer for the folding chain.
//
// Four passes: scene into an HDR target, a bright-pass at half resolution,
// a separable blur, then a composite that tonemaps and adds the bloom back.
// The bloom is what makes contact formation read as light rather than as a
// colour change, so it is not decoration — it is the readout.
//
// Half-float targets need EXT_color_buffer_half_float, which is not universal.
// Without it we fall back to RGBA8, which clamps highlights and gives a flatter
// but still correct picture. Nothing here fails hard on a weak GL stack.

const VS_TUBE = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in float aT;
layout(location=3) in float aQ;
uniform mat4 uProj, uView, uModel;
uniform mat3 uNormalMat;
out vec3 vNormal; out vec3 vView; out float vT; out float vQ; out float vDepth;
void main() {
  vec4 world = uModel * vec4(aPos, 1.0);
  vec4 eye = uView * world;
  gl_Position = uProj * eye;
  vNormal = normalize(uNormalMat * mat3(uModel) * aNormal);
  vView = normalize(-eye.xyz);
  vT = aT; vQ = aQ;
  vDepth = -eye.z;
}`;

const FS_TUBE = `#version 300 es
precision highp float;
in vec3 vNormal; in vec3 vView; in float vT; in float vQ; in float vDepth;
uniform float uGhost;      // 1.0 when drawing the native ghost
uniform float uHighlight;  // residue index under the pointer, or -1
uniform float uChainLen;
uniform float uFogNear, uFogFar;
uniform vec3 uFog;
out vec4 outColor;

// Curated N->C ramp. Not a rainbow: five stops chosen so neighbouring residues
// stay distinguishable while the whole chain still reads as one object.
vec3 ramp(float t) {
  vec3 c0 = vec3(0.239, 0.169, 0.561);
  vec3 c1 = vec3(0.482, 0.184, 0.690);
  vec3 c2 = vec3(0.831, 0.227, 0.416);
  vec3 c3 = vec3(0.941, 0.502, 0.227);
  vec3 c4 = vec3(1.000, 0.847, 0.420);
  t = clamp(t, 0.0, 1.0) * 4.0;
  if (t < 1.0) return mix(c0, c1, t);
  if (t < 2.0) return mix(c1, c2, t - 1.0);
  if (t < 3.0) return mix(c2, c3, t - 2.0);
  return mix(c3, c4, t - 3.0);
}

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(vView);
  if (!gl_FrontFacing) N = -N;

  vec3 hot = ramp(vT);
  // Unfolded residues fall back to a cold slate: the chain literally gains
  // colour as its native contacts form.
  vec3 cold = vec3(0.176, 0.235, 0.318);
  float f = smoothstep(0.02, 0.85, vQ);
  vec3 base = mix(cold, hot, f);

  vec3 L1 = normalize(vec3(0.45, 0.75, 0.55));
  vec3 L2 = normalize(vec3(-0.6, -0.25, 0.35));
  float d1 = max(dot(N, L1), 0.0);
  float d2 = max(dot(N, L2), 0.0);
  vec3 H = normalize(L1 + V);
  float spec = pow(max(dot(N, H), 0.0), 48.0);

  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);

  vec3 col = base * (0.16 + 0.82 * d1 + 0.30 * d2);
  col += vec3(1.0, 0.94, 0.86) * spec * (0.25 + 0.55 * f);
  col += hot * fres * (0.20 + 0.85 * f);
  // emission is what the bloom pass picks up
  col += hot * f * f * 0.42;

  // the residue under the pointer in the sequence strip, lit in place
  if (uHighlight >= 0.0) {
    float here = vT * max(uChainLen - 1.0, 1.0);
    float near = 1.0 - smoothstep(0.0, 1.1, abs(here - uHighlight));
    col += vec3(0.55, 0.72, 1.0) * near * 0.85;
  }

  float fog = clamp((vDepth - uFogNear) / max(uFogFar - uFogNear, 0.001), 0.0, 1.0);
  col = mix(col, uFog, fog * 0.85);

  if (uGhost > 0.5) {
    // The native target, shown as a faint shell you can see the live chain
    // moving inside. Rim-weighted so it reads as a surface, not a haze.
    float a = 0.020 + 0.16 * fres;
    outColor = vec4(vec3(0.52, 0.60, 0.76) * (0.10 + 0.42 * fres), a);
    return;
  }
  outColor = vec4(col, 1.0);
}`;

const VS_WIRE = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in float aStrength;
uniform mat4 uProj, uView;
out float vS; out float vDepth;
void main() {
  vec4 eye = uView * vec4(aPos, 1.0);
  gl_Position = uProj * eye;
  vS = aStrength; vDepth = -eye.z;
}`;

const FS_WIRE = `#version 300 es
precision highp float;
in float vS; in float vDepth;
uniform float uFogNear, uFogFar;
out vec4 outColor;
void main() {
  // Additive: overlapping contacts pile up into the bright core of a folded
  // domain, which is exactly the thing worth seeing.
  float fog = 1.0 - clamp((vDepth - uFogNear) / max(uFogFar - uFogNear, 0.001), 0.0, 1.0);
  vec3 c = mix(vec3(0.25, 0.55, 0.95), vec3(0.95, 0.80, 0.45), vS);
  outColor = vec4(c * (0.10 + 0.90 * vS) * fog, 1.0);
}`;

const VS_QUAD = `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FS_BACKDROP = `#version 300 es
precision highp float;
in vec2 vUv;
uniform vec2 uRes;
out vec4 outColor;
void main() {
  vec2 p = (vUv - vec2(0.5, 0.46)) * vec2(uRes.x / max(uRes.y, 1.0), 1.0);
  float r = length(p);
  vec3 deep = vec3(0.016, 0.020, 0.035);
  vec3 lift = vec3(0.055, 0.070, 0.115);
  vec3 col = mix(lift, deep, smoothstep(0.05, 0.95, r));
  outColor = vec4(col, 1.0);
}`;

const FS_BRIGHT = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uSrc;
uniform float uThreshold;
out vec4 outColor;
void main() {
  vec3 c = texture(uSrc, vUv).rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float k = max(l - uThreshold, 0.0) / max(l, 0.0001);
  outColor = vec4(c * k, 1.0);
}`;

const FS_BLUR = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uSrc;
uniform vec2 uStep;
out vec4 outColor;
void main() {
  // 9-tap gaussian, linear-sampled at 5 positions
  vec3 c = texture(uSrc, vUv).rgb * 0.2270270270;
  c += texture(uSrc, vUv + uStep * 1.3846153846).rgb * 0.3162162162;
  c += texture(uSrc, vUv - uStep * 1.3846153846).rgb * 0.3162162162;
  c += texture(uSrc, vUv + uStep * 3.2307692308).rgb * 0.0702702703;
  c += texture(uSrc, vUv - uStep * 3.2307692308).rgb * 0.0702702703;
  outColor = vec4(c, 1.0);
}`;

const FS_COMPOSITE = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene, uBloom;
uniform float uBloomAmount;
uniform vec2 uRes;
out vec4 outColor;

// A cheap ordered dither. The backdrop is a very dark gradient across a lot of
// pixels; without this it bands visibly on 8-bit displays.
float dither(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec3 c = texture(uScene, vUv).rgb;
  c += texture(uBloom, vUv).rgb * uBloomAmount;

  // ACES-ish filmic curve: keeps the bright cores from clipping to flat white
  const float a = 2.51, b = 0.03, cc = 2.43, d = 0.59, e = 0.14;
  c = clamp((c * (a * c + b)) / (c * (cc * c + d) + e), 0.0, 1.0);

  vec2 q = vUv - 0.5;
  float vig = smoothstep(1.05, 0.25, length(q) * 1.35);
  c *= mix(0.72, 1.0, vig);

  c += (dither(vUv * uRes) - 0.5) / 255.0;
  outColor = vec4(c, 1.0);
}`;

const IDENTITY = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);

// ------------------------------------------------------------------ mat4
export function perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ]);
}

export function lookAt(eye, center, up) {
  const [ex, ey, ez] = eye;
  let zx = ex - center[0], zy = ey - center[1], zz = ez - center[2];
  let l = Math.hypot(zx, zy, zz) || 1;
  zx /= l; zy /= l; zz /= l;
  let xx = up[1] * zz - up[2] * zy;
  let xy = up[2] * zx - up[0] * zz;
  let xz = up[0] * zy - up[1] * zx;
  l = Math.hypot(xx, xy, xz) || 1;
  xx /= l; xy /= l; xz /= l;
  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;
  return new Float32Array([
    xx, yx, zx, 0,
    xy, yy, zy, 0,
    xz, yz, zz, 0,
    -(xx * ex + xy * ey + xz * ez),
    -(yx * ex + yy * ey + yz * ez),
    -(zx * ex + zy * ey + zz * ez),
    1,
  ]);
}

/** Normal matrix for a view matrix with no non-uniform scale: its upper 3x3. */
function normalMat3(m) {
  return new Float32Array([m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]]);
}

// ------------------------------------------------------------------ helpers
function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    throw new Error(`shader: ${gl.getShaderInfoLog(s)}`);
  }
  return s;
}

function program(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error(`link: ${gl.getProgramInfoLog(p)}`);
  }
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const name = gl.getActiveUniform(p, i).name.replace(/\[0\]$/, '');
    u[name] = gl.getUniformLocation(p, name);
  }
  return { p, u };
}

export class Renderer {
  constructor(canvas) {
    const gl = canvas.getContext('webgl2', {
      antialias: true,
      alpha: false,
      depth: true,
      powerPreference: 'high-performance',
    });
    if (!gl) throw new Error('WebGL2 is not available in this browser');
    this.gl = gl;
    this.canvas = canvas;

    this.hdr = gl.getExtension('EXT_color_buffer_half_float') ? gl.RGBA16F : gl.RGBA8;
    this.hdrType = this.hdr === gl.RGBA16F ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
    if (this.hdr === gl.RGBA16F) gl.getExtension('OES_texture_float_linear');

    this.tube = program(gl, VS_TUBE, FS_TUBE);
    this.wire = program(gl, VS_WIRE, FS_WIRE);
    this.backdrop = program(gl, VS_QUAD, FS_BACKDROP);
    this.bright = program(gl, VS_QUAD, FS_BRIGHT);
    this.blur = program(gl, VS_QUAD, FS_BLUR);
    this.composite = program(gl, VS_QUAD, FS_COMPOSITE);

    this.emptyVao = gl.createVertexArray();

    // live tube
    this.vboTube = gl.createBuffer();
    this.ibo = gl.createBuffer();
    this.vaoTube = this._tubeVao(this.vboTube);
    // native ghost, same index buffer
    this.vboGhost = gl.createBuffer();
    this.vaoGhost = this._tubeVao(this.vboGhost);
    // contact filaments
    this.vboWire = gl.createBuffer();
    this.vaoWire = gl.createVertexArray();
    gl.bindVertexArray(this.vaoWire);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vboWire);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 16, 12);
    gl.bindVertexArray(null);

    this.targets = {};
    this.indexCount = 0;
    this.wireCount = 0;
    this.size = [0, 0];
  }

  _tubeVao(vbo) {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    const S = 32; // 8 floats
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, S, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, S, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, S, 24);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, S, 28);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    gl.bindVertexArray(null);
    return vao;
  }

  _target(name, w, h, withDepth) {
    const gl = this.gl;
    let t = this.targets[name];
    if (t && t.w === w && t.h === h) return t;
    if (t) {
      gl.deleteFramebuffer(t.fbo);
      gl.deleteTexture(t.tex);
      if (t.rbo) gl.deleteRenderbuffer(t.rbo);
    }
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, this.hdr, w, h, 0, gl.RGBA, this.hdrType, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    let rbo = null;
    if (withDepth) {
      rbo = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, rbo);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rbo);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    t = { fbo, tex, rbo, w, h };
    this.targets[name] = t;
    return t;
  }

  resize(w, h) {
    if (this.size[0] === w && this.size[1] === h) return;
    this.size = [w, h];
    this.canvas.width = w;
    this.canvas.height = h;
    this._target('scene', w, h, true);
    const bw = Math.max(2, w >> 1);
    const bh = Math.max(2, h >> 1);
    this._target('bright', bw, bh, false);
    this._target('blurA', bw, bh, false);
  }

  /** Upload a rebuilt tube. `which` is 'live' or 'ghost'. */
  uploadTube(data, which = 'live') {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, which === 'ghost' ? this.vboGhost : this.vboTube);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
  }

  uploadIndices(idx) {
    const gl = this.gl;
    gl.bindVertexArray(this.vaoTube);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    this.indexCount = idx.length;
  }

  uploadWires(data, lines) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vboWire);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    this.wireCount = lines;
  }

  /**
   * @param cam  {eye, center, up, fov, near, far}
   * @param opts {showGhost, showWires, bloom}
   */
  draw(cam, opts = {}) {
    const gl = this.gl;
    const [w, h] = this.size;
    if (w === 0 || h === 0) return;
    const proj = perspective(cam.fov, w / h, cam.near, cam.far);
    const view = lookAt(cam.eye, cam.center, cam.up);
    const nm = normalMat3(view);

    const scene = this.targets.scene;
    gl.bindFramebuffer(gl.FRAMEBUFFER, scene.fbo);
    gl.viewport(0, 0, w, h);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.disable(gl.BLEND);

    // backdrop
    gl.useProgram(this.backdrop.p);
    gl.uniform2f(this.backdrop.u.uRes, w, h);
    gl.bindVertexArray(this.emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);

    const fogNear = cam.dist * 0.55;
    const fogFar = cam.dist * 2.3;

    // live tube
    gl.useProgram(this.tube.p);
    gl.uniformMatrix4fv(this.tube.u.uProj, false, proj);
    gl.uniformMatrix4fv(this.tube.u.uView, false, view);
    gl.uniformMatrix3fv(this.tube.u.uNormalMat, false, nm);
    gl.uniform1f(this.tube.u.uFogNear, fogNear);
    gl.uniform1f(this.tube.u.uFogFar, fogFar);
    gl.uniform3f(this.tube.u.uFog, 0.024, 0.030, 0.050);
    gl.uniform1f(this.tube.u.uGhost, 0.0);
    gl.uniformMatrix4fv(this.tube.u.uModel, false, IDENTITY);
    gl.uniform1f(this.tube.u.uHighlight, opts.highlight ?? -1);
    gl.uniform1f(this.tube.u.uChainLen, opts.chainLen ?? 1);
    gl.bindVertexArray(this.vaoTube);
    gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_INT, 0);

    // contact filaments, additive and behind nothing
    if (opts.showWires && this.wireCount > 0) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.depthMask(false);
      gl.useProgram(this.wire.p);
      gl.uniformMatrix4fv(this.wire.u.uProj, false, proj);
      gl.uniformMatrix4fv(this.wire.u.uView, false, view);
      gl.uniform1f(this.wire.u.uFogNear, fogNear);
      gl.uniform1f(this.wire.u.uFogFar, fogFar);
      gl.bindVertexArray(this.vaoWire);
      gl.drawArrays(gl.LINES, 0, this.wireCount * 2);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }

    // native ghost last: translucent, depth-tested but not depth-writing, and
    // drawn with culling off so you see the far wall of the shell too
    if (opts.showGhost) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      gl.disable(gl.CULL_FACE);
      gl.useProgram(this.tube.p);
      gl.uniform1f(this.tube.u.uGhost, 1.0);
      gl.uniformMatrix4fv(this.tube.u.uModel, false, opts.ghostFit ?? IDENTITY);
      gl.uniform1f(this.tube.u.uHighlight, -1);
      gl.bindVertexArray(this.vaoGhost);
      gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_INT, 0);
      gl.enable(gl.CULL_FACE);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }

    // --- bloom
    const amount = opts.bloom ?? 0.85;
    const bright = this.targets.bright;
    const blurA = this.targets.blurA;
    gl.disable(gl.DEPTH_TEST);
    gl.bindVertexArray(this.emptyVao);

    gl.bindFramebuffer(gl.FRAMEBUFFER, bright.fbo);
    gl.viewport(0, 0, bright.w, bright.h);
    gl.useProgram(this.bright.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, scene.tex);
    gl.uniform1i(this.bright.u.uSrc, 0);
    gl.uniform1f(this.bright.u.uThreshold, 0.62);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.useProgram(this.blur.p);
    gl.uniform1i(this.blur.u.uSrc, 0);
    for (let pass = 0; pass < 2; pass++) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, blurA.fbo);
      gl.bindTexture(gl.TEXTURE_2D, bright.tex);
      gl.uniform2f(this.blur.u.uStep, 1 / bright.w, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      gl.bindFramebuffer(gl.FRAMEBUFFER, bright.fbo);
      gl.bindTexture(gl.TEXTURE_2D, blurA.tex);
      gl.uniform2f(this.blur.u.uStep, 0, 1 / bright.h);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.useProgram(this.composite.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, scene.tex);
    gl.uniform1i(this.composite.u.uScene, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, bright.tex);
    gl.uniform1i(this.composite.u.uBloom, 1);
    gl.uniform1f(this.composite.u.uBloomAmount, amount);
    gl.uniform2f(this.composite.u.uRes, w, h);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }
}
