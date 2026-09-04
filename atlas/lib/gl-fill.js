// gl-fill.js — draw every polygon fill in one call.
//
// Canvas2D re-tessellates each path on the CPU every frame. Pre-triangulated,
// the same map is one buffer and one drawElements, and panning becomes a
// four-float uniform. Borders, labels, hover and selection stay on the 2D
// canvas layered over the top: they are cheap (measured 1.6 ms) and they want
// real line joins, which is exactly what WebGL is bad at.
//
// COLOURS LIVE IN A TEXTURE, one texel per unit, and each vertex carries its
// unit index. Recolouring uploads about 24 KB — a few thousand texels — and
// touches neither the geometry nor the index buffer. The alternative, a colour
// per vertex, would mean rewriting a megabyte every time the measure changed.
//
// WebGL2 only, and that is deliberate rather than lazy: the fallback is the
// Canvas2D path that already works, so the choice is between WebGL2 and a
// pile of extension probing for the last two percent of browsers.

/* global globalThis */
(function (root) {
  'use strict';

  const VERT = `#version 300 es
in vec2 a_pos;
in float a_unit;
uniform vec4 u_tf;          // xy scale, zw offset, canvas px -> clip space
uniform highp sampler2D u_col;
uniform int u_colW;
out vec4 v_col;
void main() {
  int i = int(a_unit);
  v_col = texelFetch(u_col, ivec2(i % u_colW, i / u_colW), 0);
  gl_Position = vec4(a_pos * u_tf.xy + u_tf.zw, 0.0, 1.0);
}`;

  const FRAG = `#version 300 es
precision mediump float;
in vec4 v_col;
out vec4 outColor;
void main() {
  if (v_col.a == 0.0) discard;
  outColor = vec4(v_col.rgb * v_col.a, v_col.a);   // premultiplied
}`;

  const COL_W = 256;

  // ------------------------------------------------------------- colours ---

  const NAMED = { transparent: [0, 0, 0, 0], none: [0, 0, 0, 0], white: [255, 255, 255, 255], black: [0, 0, 0, 255] };
  const cssCache = new Map();

  /** Parse the CSS colours the fill callbacks return. Cached — there are ~10. */
  function parseColor(css) {
    if (!css) return [0, 0, 0, 0];
    let v = cssCache.get(css);
    if (v) return v;
    v = NAMED[css] || null;
    if (!v && css[0] === '#') {
      const h = css.slice(1);
      if (h.length === 3 || h.length === 4) {
        v = [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16),
             h.length === 4 ? parseInt(h[3] + h[3], 16) : 255];
      } else if (h.length === 6 || h.length === 8) {
        v = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16),
             h.length === 8 ? parseInt(h.slice(6, 8), 16) : 255];
      }
    }
    if (!v) {
      const m = /^rgba?\(([^)]+)\)$/.exec(css);
      if (m) {
        const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
        v = [p[0] | 0, p[1] | 0, p[2] | 0, p.length > 3 ? Math.round(p[3] * 255) : 255];
      }
    }
    if (!v) v = [128, 128, 128, 255];
    cssCache.set(css, v);
    return v;
  }

  // -------------------------------------------------------------- shader ---

  function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(s);
      gl.deleteShader(s);
      throw new Error('shader: ' + log);
    }
    return s;
  }

  class GLFill {
    /**
     * @param {HTMLCanvasElement} canvas  a canvas of its own, under the 2D one
     * @returns {GLFill|null} null when WebGL2 is unavailable — caller falls back
     */
    static create(canvas, force) {
      let gl = null;
      try {
        gl = canvas.getContext('webgl2', {
          alpha: true, antialias: true, depth: false, stencil: false,
          premultipliedAlpha: true, preserveDrawingBuffer: false,
          powerPreference: 'high-performance',
        });
      } catch (e) { gl = null; }
      if (!gl) return null;

      // A GPU is the whole point. Where WebGL is emulated in software —
      // SwiftShader, llvmpipe, a VM with no passthrough — rasterising 300,000
      // triangles on the CPU is SLOWER than the Canvas2D path this replaces,
      // because Skia's tessellator is very good and a software GL driver is
      // not. Measured in this repo's own headless Chromium, which is
      // SwiftShader: 242 ms a frame through GL against 91 ms through Canvas2D.
      // So ask what we are actually running on, and decline politely.
      try {
        const dbg = gl.getExtension('WEBGL_debug_renderer_info');
        const name = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '') : '';
        if (!force && name && /swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic/i.test(name)) {
          return null;
        }
        GLFill.renderer = name;
      } catch (e) { /* no debug info: give it the benefit of the doubt */ }

      try { return new GLFill(canvas, gl); } catch (e) { return null; }
    }

    constructor(canvas, gl) {
      this.canvas = canvas;
      this.gl = gl;
      const vs = compile(gl, gl.VERTEX_SHADER, VERT);
      const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
      const p = gl.createProgram();
      gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p));
      gl.deleteShader(vs); gl.deleteShader(fs);
      this.prog = p;
      this.loc = {
        pos: gl.getAttribLocation(p, 'a_pos'),
        unit: gl.getAttribLocation(p, 'a_unit'),
        tf: gl.getUniformLocation(p, 'u_tf'),
        col: gl.getUniformLocation(p, 'u_col'),
        colW: gl.getUniformLocation(p, 'u_colW'),
      };
      this.batches = new Map();
      gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);   // premultiplied
    }

    /** Upload a mesh. `key` identifies the layer; re-uploading replaces it. */
    setMesh(key, mesh, positions) {
      const gl = this.gl;
      this.drop(key);
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);

      const posBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
      gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(this.loc.pos);
      gl.vertexAttribPointer(this.loc.pos, 2, gl.FLOAT, false, 0, 0);

      // The unit index goes up as a float: an integer attribute would need
      // vertexAttribIPointer and a matching `in int`, and a float carries every
      // integer below 2^24 exactly, which is far more units than a map has.
      const unitF = new Float32Array(mesh.unitIdx.length);
      unitF.set(mesh.unitIdx);
      const unitBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, unitBuf);
      gl.bufferData(gl.ARRAY_BUFFER, unitF, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(this.loc.unit);
      gl.vertexAttribPointer(this.loc.unit, 1, gl.FLOAT, false, 0, 0);

      const idxBuf = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.tris, gl.STATIC_DRAW);
      gl.bindVertexArray(null);

      const rows = Math.max(1, Math.ceil(mesh.units / COL_W));
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, COL_W, rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

      this.batches.set(key, {
        vao, posBuf, unitBuf, idxBuf, tex, rows,
        count: mesh.tris.length,
        units: mesh.units,
        colors: new Uint8Array(COL_W * rows * 4),
      });
    }

    has(key) { return this.batches.has(key); }

    drop(key) {
      const b = this.batches.get(key);
      if (!b) return;
      const gl = this.gl;
      gl.deleteVertexArray(b.vao);
      gl.deleteBuffer(b.posBuf); gl.deleteBuffer(b.unitBuf); gl.deleteBuffer(b.idxBuf);
      gl.deleteTexture(b.tex);
      this.batches.delete(key);
    }

    /** Refresh positions after a resize or refit, without re-triangulating. */
    setPositions(key, positions) {
      const b = this.batches.get(key);
      if (!b) return;
      const gl = this.gl;
      gl.bindBuffer(gl.ARRAY_BUFFER, b.posBuf);
      gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);
    }

    /** `colorOf(u)` returns a CSS colour for unit index u. */
    setColors(key, colorOf) {
      const b = this.batches.get(key);
      if (!b) return;
      const c = b.colors;
      for (let u = 0; u < b.units; u++) {
        const rgba = parseColor(colorOf(u));
        const o = u * 4;
        // premultiply so a transparent unit cannot bleed its colour
        const a = rgba[3];
        c[o] = rgba[0]; c[o + 1] = rgba[1]; c[o + 2] = rgba[2]; c[o + 3] = a;
      }
      const gl = this.gl;
      gl.bindTexture(gl.TEXTURE_2D, b.tex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, COL_W, b.rows, gl.RGBA, gl.UNSIGNED_BYTE, c);
    }

    resize(w, h, dpr) {
      const W = Math.round(w * dpr), H = Math.round(h * dpr);
      if (this.canvas.width !== W || this.canvas.height !== H) {
        this.canvas.width = W; this.canvas.height = H;
      }
    }

    /**
     * @param {string[]} keys   batches to draw, in order
     * @param {object} view     { zoom, ox, oy, dpr, background }
     */
    draw(keys, view) {
      const gl = this.gl, W = this.canvas.width, H = this.canvas.height;
      gl.viewport(0, 0, W, H);
      const bg = parseColor(view.background);
      gl.clearColor(bg[0] / 255, bg[1] / 255, bg[2] / 255, bg[3] / 255);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (!keys.length) return;

      gl.useProgram(this.prog);
      const d = view.dpr;
      gl.uniform4f(this.loc.tf,
        2 * d * view.zoom / W, -2 * d * view.zoom / H,
        2 * d * view.ox / W - 1, 1 - 2 * d * view.oy / H);
      gl.uniform1i(this.loc.colW, COL_W);
      gl.activeTexture(gl.TEXTURE0);
      gl.uniform1i(this.loc.col, 0);

      for (const key of keys) {
        const b = this.batches.get(key);
        if (!b || !b.count) continue;
        gl.bindTexture(gl.TEXTURE_2D, b.tex);
        gl.bindVertexArray(b.vao);
        gl.drawElements(gl.TRIANGLES, b.count, gl.UNSIGNED_INT, 0);
      }
      gl.bindVertexArray(null);
    }

    destroy() {
      for (const key of [...this.batches.keys()]) this.drop(key);
      const ext = this.gl.getExtension('WEBGL_lose_context');
      if (ext) ext.loseContext();
    }
  }

  const API = { GLFill, parseColor };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.ATLAS_GL = API;
}(typeof globalThis !== 'undefined' ? globalThis : this));
