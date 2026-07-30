// render.js — WebGL2 renderer for the growing graph. All GLSL inline.
//
// Two instanced draws, both additive over black, edges first:
//
//   * wires — one instance per edge, two vertices, endpoints supplied straight
//     from the wasm edge buffer. A new wire flashes and decays, so the eye can
//     follow where the structure is currently building.
//   * cells — one instanced quad each, shaded as a soft radial glow. Colour is
//     the gate's depth from the inputs; unexpanded cells (buds) are drawn warm
//     and larger, because a bud stands for everything it has not become yet.
//
// Nothing is expanded on the CPU: both buffers go to the GPU exactly as the
// wasm laid them out, which is what keeps tens of thousands of nodes cheap.

const NODE_STRIDE = 7; // x y r depth kind age act
const EDGE_STRIDE = 6; // x0 y0 x1 y1 age act

/**
 * Smallest world extent the camera will fill the viewport with. A seed cell is
 * ~2 units across and a grown structure tens; without a floor the opening frame
 * is magnified twenty-fold and spends the first second racing back out.
 */
const MIN_EXTENT = 26;
/** Closing back in is eased; pulling back is not. See `fit`. */
const ZOOM_IN_EASE = 0.05;
const PAN_EASE = 0.05;
/** A little margin, so a structure never sits flush against the edge. */
const PADDING = 1.12;

/** Shared by both shaders: depth 0..1 -> cyan .. violet .. magenta. */
const PALETTE = `
vec3 palette(float t) {
  t = clamp(t, 0.0, 1.0);
  vec3 a = vec3(0.00, 0.88, 1.00);
  vec3 b = vec3(0.45, 0.33, 1.00);
  vec3 c = vec3(1.00, 0.05, 0.36);
  return t < 0.5 ? mix(a, b, t * 2.0) : mix(b, c, (t - 0.5) * 2.0);
}`;

const NODE_VS = `#version 300 es
in vec2 aCorner;
in vec2 aPos;
in float aR;
in float aDepth;
in float aKind;
in float aAge;
in float aAct;
uniform vec2 uCenter;
uniform vec2 uScale;
uniform float uSize;
out vec2 vCorner;
out float vDepth;
out float vKind;
out float vFade;
out float vAct;
void main() {
  // Cells swell into place over their first ticks rather than appearing at
  // full size — the difference between growth and a redraw.
  float grow = clamp(aAge / 18.0, 0.0, 1.0);
  // A firing gate briefly swells too, so a wavefront is legible as a moving
  // ripple even when the structure is too dense to pick out single cells.
  float r = aR * uSize * (0.4 + 0.6 * grow) * (1.0 + 1.1 * aAct);
  vec2 p = (aPos - uCenter) * uScale + aCorner * r * uScale;
  gl_Position = vec4(p, 0.0, 1.0);
  vCorner = aCorner;
  vDepth = aDepth;
  vKind = aKind;
  vFade = grow;
  vAct = aAct;
}`;

const NODE_FS = `#version 300 es
precision highp float;
in vec2 vCorner;
in float vDepth;
in float vKind;
in float vFade;
in float vAct;
uniform float uGlow;
out vec4 frag;
${PALETTE}
void main() {
  float d = length(vCorner);
  if (d > 1.0) discard;
  float core = smoothstep(1.0, 0.12, d);
  float halo = pow(1.0 - d, 3.0);
  // kind < 0 marks a bud: warm, so unfinished structure reads at a glance.
  vec3 c = vKind < 0.0 ? vec3(1.0, 0.84, 0.5) : palette(vDepth);
  // A firing cell washes toward white. Colour still carries depth, so the
  // wavefront reads as brightness moving across a fixed hue gradient rather
  // than as the structure changing colour.
  c = mix(c, vec3(1.0), vAct * 0.75);
  float b = core * 0.85 + halo * (uGlow + vAct * 1.4);
  frag = vec4(c * b * (0.2 + 0.8 * vFade) * (1.0 + 1.6 * vAct), 1.0);
}`;

const EDGE_VS = `#version 300 es
in float aCorner;
in vec4 aSeg;
in float aAge;
in float aAct;
uniform vec2 uCenter;
uniform vec2 uScale;
out float vFlash;
out float vAct;
void main() {
  vec2 p = mix(aSeg.xy, aSeg.zw, aCorner);
  gl_Position = vec4((p - uCenter) * uScale, 0.0, 1.0);
  vFlash = exp(-aAge / 22.0);
  // A wire carries its driver's activation, and only from the driver's end, so
  // the charge is visibly leaving the gate that fired rather than the whole
  // segment blinking at once.
  vAct = aAct * (1.0 - aCorner);
}`;

const EDGE_FS = `#version 300 es
precision highp float;
in float vFlash;
in float vAct;
uniform float uWire;
out vec4 frag;
void main() {
  vec3 cold = vec3(0.16, 0.32, 0.55);
  vec3 hot = vec3(0.85, 0.95, 1.0);
  vec3 live = vec3(0.75, 0.95, 1.0);
  vec3 c = mix(mix(cold, hot, vFlash), live, vAct);
  frag = vec4(c * uWire * (0.35 + 0.9 * vFlash + 2.6 * vAct), 1.0);
}`;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error(`shader: ${gl.getShaderInfoLog(sh)}`);
  }
  return sh;
}

function program(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error(`link: ${gl.getProgramInfoLog(p)}`);
  }
  return p;
}

export class Renderer {
  constructor(canvas) {
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: true,
      powerPreference: 'high-performance',
    });
    if (!gl) throw new Error('WebGL2 is not available');
    this.canvas = canvas;
    this.gl = gl;

    this.nodeProg = program(gl, NODE_VS, NODE_FS);
    this.edgeProg = program(gl, EDGE_VS, EDGE_FS);

    // Static geometry: a quad for cells, a two-point line for wires.
    this.quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    this.seg = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.seg);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 1]), gl.STATIC_DRAW);

    this.nodeBuf = gl.createBuffer();
    this.edgeBuf = gl.createBuffer();
    this.nodeVao = this._nodeVao();
    this.edgeVao = this._edgeVao();

    // Camera. `scale` is fitted to the structure and eased; `zoom` and the pan
    // offsets are the user's, and survive refits.
    this.cx = 0;
    this.cy = 0;
    this.scale = 0.05;
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.nodeSize = 1;
    this.glow = 0.45;
    this.wire = 0.5;
    this._first = true;
  }

  _nodeVao() {
    const { gl } = this;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const p = this.nodeProg;
    const corner = gl.getAttribLocation(p, 'aCorner');
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(corner);
    gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.nodeBuf);
    const s = NODE_STRIDE * 4;
    for (const [name, size, off] of [
      ['aPos', 2, 0],
      ['aR', 1, 8],
      ['aDepth', 1, 12],
      ['aKind', 1, 16],
      ['aAge', 1, 20],
      ['aAct', 1, 24],
    ]) {
      const loc = gl.getAttribLocation(p, name);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, s, off);
      gl.vertexAttribDivisor(loc, 1);
    }
    gl.bindVertexArray(null);
    return vao;
  }

  _edgeVao() {
    const { gl } = this;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const p = this.edgeProg;
    const corner = gl.getAttribLocation(p, 'aCorner');
    gl.bindBuffer(gl.ARRAY_BUFFER, this.seg);
    gl.enableVertexAttribArray(corner);
    gl.vertexAttribPointer(corner, 1, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuf);
    const s = EDGE_STRIDE * 4;
    for (const [name, size, off] of [
      ['aSeg', 4, 0],
      ['aAge', 1, 16],
      ['aAct', 1, 20],
    ]) {
      const loc = gl.getAttribLocation(p, name);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, s, off);
      gl.vertexAttribDivisor(loc, 1);
    }
    gl.bindVertexArray(null);
    return vao;
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.gl.viewport(0, 0, w, h);
  }

  /**
   * Ease the camera onto the structure's bounding box.
   *
   * Two things here are not cosmetic.
   *
   * **The extent is floored.** A program starts life as one cell spanning about
   * two world units, and fitting *that* to the viewport means opening at a
   * magnification twenty times too deep, then crawling outwards while the
   * structure bursts off every edge. Nothing smaller than `MIN_EXTENT` is
   * allowed to fill the frame, which costs nothing once a structure is grown
   * and removes the problem entirely at the start.
   *
   * **Easing is asymmetric.** Pulling back is much faster than pushing in, so
   * growth can never outrun the camera; closing in stays slow, because the box
   * jumps on every wide expansion and chasing it exactly would make the whole
   * frame lurch.
   */
  fit(lo, hi) {
    const [loX, loY, hiX, hiY] = [lo[0], lo[1], hi[0], hi[1]];
    const cx = (loX + hiX) * 0.5;
    const cy = (loY + hiY) * 0.5;
    const w = Math.max(hiX - loX, 1e-3);
    const h = Math.max(hiY - loY, 1e-3);
    const aspect = this.canvas.width / Math.max(1, this.canvas.height);
    // `uScale` is [s/aspect, s], and clip space spans 2 on both axes, so the
    // viewport shows 2·aspect/s of world width and 2/s of world height. Fitting
    // both therefore wants s = 2·aspect / max(w, h·aspect) — the aspect in the
    // numerator is not optional, and without it everything renders at about
    // 60% of the size it should on a landscape canvas.
    const extent = Math.max(w, h * aspect, MIN_EXTENT);
    const target = (2 * aspect) / (extent * PADDING);

    if (this._first) {
      this.cx = cx;
      this.cy = cy;
      this.scale = target;
      this._first = false;
      return;
    }
    this.cx += (cx - this.cx) * PAN_EASE;
    this.cy += (cy - this.cy) * PAN_EASE;

    if (target < this.scale) {
      // Pulling back is not eased at all. A structure can go from one cell to
      // several hundred inside fifteen frames, which no eased camera can
      // follow — it just spills off every edge while the camera crawls after
      // it. Tracking the box exactly costs nothing visually, because the box
      // itself grows smoothly, so this still reads as one continuous pull-back.
      this.scale = target;
    } else {
      // Closing back in is eased, and slowly. The box jumps on every wide
      // expansion and shrinks as the layout settles; chasing that exactly
      // would make the whole frame breathe.
      this.scale *= Math.exp(Math.log(target / this.scale) * ZOOM_IN_EASE);
    }
  }

  draw(nodes, edges) {
    const { gl } = this;
    const aspect = this.canvas.width / Math.max(1, this.canvas.height);
    const s = this.scale * this.zoom;
    const scale = [s / aspect, s];
    const center = [this.cx - this.panX, this.cy - this.panY];

    gl.clearColor(0.02, 0.025, 0.04, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);

    const edgeN = edges.length / EDGE_STRIDE;
    if (edgeN > 0) {
      gl.useProgram(this.edgeProg);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuf);
      gl.bufferData(gl.ARRAY_BUFFER, edges, gl.DYNAMIC_DRAW);
      gl.bindVertexArray(this.edgeVao);
      gl.uniform2fv(gl.getUniformLocation(this.edgeProg, 'uCenter'), center);
      gl.uniform2fv(gl.getUniformLocation(this.edgeProg, 'uScale'), scale);
      gl.uniform1f(gl.getUniformLocation(this.edgeProg, 'uWire'), this.wire);
      gl.drawArraysInstanced(gl.LINES, 0, 2, edgeN);
    }

    const nodeN = nodes.length / NODE_STRIDE;
    if (nodeN > 0) {
      gl.useProgram(this.nodeProg);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.nodeBuf);
      gl.bufferData(gl.ARRAY_BUFFER, nodes, gl.DYNAMIC_DRAW);
      gl.bindVertexArray(this.nodeVao);
      gl.uniform2fv(gl.getUniformLocation(this.nodeProg, 'uCenter'), center);
      gl.uniform2fv(gl.getUniformLocation(this.nodeProg, 'uScale'), scale);
      gl.uniform1f(gl.getUniformLocation(this.nodeProg, 'uSize'), this.nodeSize);
      gl.uniform1f(gl.getUniformLocation(this.nodeProg, 'uGlow'), this.glow);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, nodeN);
    }
    gl.bindVertexArray(null);
  }

  /** Reset the camera so the next `fit` snaps instead of easing. */
  recenter() {
    this._first = true;
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
  }
}
