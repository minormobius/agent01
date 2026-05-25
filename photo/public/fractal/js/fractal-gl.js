// WebGL escape-time fractal engine that weaves a photograph into the fractal
// via orbit-trap image sampling. Single full-screen quad, one fragment shader.
//
// Precision: a double-float (df64) iteration path emulates ~double precision
// using pairs of float32s, extending crisp zoom from ~1e3x (plain float) to
// ~1e9x. It's enabled automatically for the power-2 family when the view is
// zoomed past the float32 breakdown point (see app.js).

const VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAG = `
precision highp float;
varying vec2 v_uv;
uniform vec2 u_resolution;
uniform sampler2D u_photo;
uniform sampler2D u_palette;

uniform vec2 u_centerHi;   // double-split center (hi parts)
uniform vec2 u_centerLo;   // double-split center (lo parts)
uniform float u_scale;
uniform float u_rot;
uniform int u_precision;   // 0 = float, 1 = double-float (df64)

uniform int u_type;        // 0 mandel,1 julia,2 burningship,3 tricorn,4 multibrot
uniform float u_power;
uniform int u_maxIter;
uniform float u_escape2;
uniform vec2 u_juliaC;

uniform int u_colorMode;   // 0 trap-image,1 finalz-image,2 iter-palette,3 hybrid
uniform int u_trapType;    // 0 point,1 lineX,2 lineY,3 cross,4 circle
uniform vec2 u_trapCenter;
uniform float u_imgScale;
uniform float u_imgRot;
uniform vec2 u_imgOffset;
uniform float u_paletteShift;
uniform float u_paletteScale;
uniform vec3 u_interior;
uniform float u_mix;

uniform vec4 u_crop;       // x,y,w,h in [0,1]

uniform float u_brightness;
uniform float u_contrast;
uniform float u_saturation;
uniform float u_gamma;

const int MAX_ITER = 1200;

vec2 cmul(vec2 a, vec2 b){ return vec2(a.x*b.x - a.y*b.y, a.x*b.y + a.y*b.x); }

vec2 cpow(vec2 z, float p){
  float r = length(z);
  if (r < 1e-20) return vec2(0.0);
  float th = atan(z.y, z.x);
  float rp = pow(r, p);
  return rp * vec2(cos(th*p), sin(th*p));
}

mat2 rot(float a){ float c=cos(a), s=sin(a); return mat2(c,-s,s,c); }

// ---- double-float (df64) primitives: each value is vec2(hi, lo) ----
vec2 dfAdd(vec2 a, vec2 b){
  float s = a.x + b.x;
  float bb = s - a.x;
  float err = (a.x - (s - bb)) + (b.x - bb);
  err += a.y + b.y;
  float r = s + err;
  return vec2(r, err - (r - s));
}
vec2 dfSub(vec2 a, vec2 b){ return dfAdd(a, vec2(-b.x, -b.y)); }
vec2 dfMul(vec2 a, vec2 b){
  float SPLIT = 4097.0;
  float ca = SPLIT * a.x; float ahi = ca - (ca - a.x); float alo = a.x - ahi;
  float cb = SPLIT * b.x; float bhi = cb - (cb - b.x); float blo = b.x - bhi;
  float p = a.x * b.x;
  float err = ((ahi*bhi - p) + ahi*blo + alo*bhi) + alo*blo;
  err += a.x*b.y + a.y*b.x;
  float r = p + err;
  return vec2(r, err - (r - p));
}
vec2 dfSet(float a){ return vec2(a, 0.0); }
vec2 dfAbs(vec2 a){ return a.x < 0.0 ? vec2(-a.x, -a.y) : a; }

vec3 samplePhoto(vec2 p){
  vec2 uv = p * 0.5 + 0.5;
  uv = fract(uv);
  uv = u_crop.xy + uv * u_crop.zw;
  return texture2D(u_photo, uv).rgb;
}

void main(){
  vec2 aspect = vec2(u_resolution.x / u_resolution.y, 1.0);
  vec2 off = (v_uv - 0.5) * 2.0 * aspect * u_scale;
  off = rot(u_rot) * off;

  // outputs of the iteration, in plain float, consumed by coloring
  bool escaped = false;
  int iterDone = 0;
  vec2 z = vec2(0.0);       // final z (float)
  vec2 trapZ = vec2(0.0);   // orbit point of closest approach (float)
  float trap = 1e20;
  float mag2 = 0.0;

  if (u_precision == 1) {
    // ---- df64 path (power-2 family only) ----
    vec2 cr = dfAdd(vec2(u_centerHi.x, u_centerLo.x), dfSet(off.x));
    vec2 ci = dfAdd(vec2(u_centerHi.y, u_centerLo.y), dfSet(off.y));
    vec2 zr, zi, ccr, cci;
    if (u_type == 1) { zr = cr; zi = ci; ccr = dfSet(u_juliaC.x); cci = dfSet(u_juliaC.y); }
    else { zr = dfSet(0.0); zi = dfSet(0.0); ccr = cr; cci = ci; }

    for (int i = 0; i < MAX_ITER; i++){
      if (i >= u_maxIter) break;
      if (u_type == 2) { zr = dfAbs(zr); zi = dfAbs(zi); }
      if (u_type == 3) { zi = vec2(-zi.x, -zi.y); }
      vec2 zr2 = dfMul(zr, zr);
      vec2 zi2 = dfMul(zi, zi);
      vec2 prod = dfMul(zr, zi);
      vec2 nzr = dfAdd(dfSub(zr2, zi2), ccr);
      vec2 nzi = dfAdd(dfAdd(prod, prod), cci);
      zr = nzr; zi = nzi;

      vec2 q = vec2(zr.x, zi.x) - u_trapCenter;
      float d;
      if (u_trapType == 0) d = length(q);
      else if (u_trapType == 1) d = abs(q.y);
      else if (u_trapType == 2) d = abs(q.x);
      else if (u_trapType == 3) d = min(abs(q.x), abs(q.y));
      else d = abs(length(q) - 0.5);
      if (d < trap){ trap = d; trapZ = vec2(zr.x, zi.x); }

      iterDone = i + 1;
      mag2 = zr.x * zr.x + zi.x * zi.x;
      if (mag2 > u_escape2){ escaped = true; z = vec2(zr.x, zi.x); break; }
    }
    if (!escaped) z = vec2(zr.x, zi.x);
  } else {
    // ---- plain float path (handles fractional power) ----
    vec2 c = u_centerHi + off;
    vec2 cc;
    if (u_type == 1) { z = c; cc = u_juliaC; }
    else { z = vec2(0.0); cc = c; }

    for (int i = 0; i < MAX_ITER; i++){
      if (i >= u_maxIter) break;
      if (u_type == 2) z = abs(z);
      if (u_type == 3) z.y = -z.y;
      if (abs(u_power - 2.0) < 0.001) z = cmul(z, z);
      else z = cpow(z, u_power);
      z += cc;

      vec2 q = z - u_trapCenter;
      float d;
      if (u_trapType == 0) d = length(q);
      else if (u_trapType == 1) d = abs(q.y);
      else if (u_trapType == 2) d = abs(q.x);
      else if (u_trapType == 3) d = min(abs(q.x), abs(q.y));
      else d = abs(length(q) - 0.5);
      if (d < trap){ trap = d; trapZ = z; }

      iterDone = i + 1;
      mag2 = dot(z, z);
      if (mag2 > u_escape2){ escaped = true; break; }
    }
  }

  float sm = float(iterDone);
  if (escaped) sm = float(iterDone) - log2(max(log2(mag2) * 0.5, 1e-6)) + 4.0;

  vec3 col;
  if (u_colorMode == 0){
    vec2 ip = rot(u_imgRot) * (trapZ * u_imgScale + u_imgOffset);
    col = samplePhoto(ip);
    if (!escaped) col = mix(col, u_interior, u_mix);
  } else if (u_colorMode == 1){
    vec2 ip = rot(u_imgRot) * (z * u_imgScale + u_imgOffset);
    col = samplePhoto(ip);
    if (!escaped) col = mix(col, u_interior, u_mix);
  } else if (u_colorMode == 2){
    if (!escaped) col = u_interior;
    else {
      float t = fract(sm * 0.01 * u_paletteScale + u_paletteShift);
      col = texture2D(u_palette, vec2(t, 0.5)).rgb;
    }
  } else {
    vec2 ip = rot(u_imgRot) * (trapZ * u_imgScale + u_imgOffset);
    vec3 img = samplePhoto(ip);
    if (!escaped) col = mix(img, u_interior, u_mix);
    else {
      float t = fract(sm * 0.01 * u_paletteScale + u_paletteShift);
      vec3 pal = texture2D(u_palette, vec2(t, 0.5)).rgb;
      col = mix(pal, img, u_mix);
    }
  }

  col = (col - 0.5) * u_contrast + 0.5 + u_brightness;
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(l), col, u_saturation);
  col = pow(max(col, 0.0), vec3(1.0 / max(u_gamma, 0.01)));
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

function splitDouble(x) {
  const hi = Math.fround(x);
  return [hi, x - hi];
}

export class FractalGL {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true, antialias: false });
    if (!gl) throw new Error('WebGL not supported');
    this.gl = gl;
    this._build();
    this._photoTex = this._emptyTex();
    this._paletteTex = this._emptyTex();
  }

  _compile(type, src) {
    const gl = this.gl;
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS))
      throw new Error(gl.getShaderInfoLog(sh));
    return sh;
  }

  _build() {
    const gl = this.gl;
    const prog = gl.createProgram();
    gl.attachShader(prog, this._compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, this._compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
      throw new Error(gl.getProgramInfoLog(prog));
    this.prog = prog;
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1,
    ]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    this.u = {};
    const names = [
      'u_resolution','u_photo','u_palette','u_centerHi','u_centerLo','u_scale','u_rot','u_precision',
      'u_type','u_power','u_maxIter','u_escape2','u_juliaC','u_colorMode',
      'u_trapType','u_trapCenter','u_imgScale','u_imgRot','u_imgOffset',
      'u_paletteShift','u_paletteScale','u_interior','u_mix','u_crop',
      'u_brightness','u_contrast','u_saturation','u_gamma',
    ];
    for (const n of names) this.u[n] = gl.getUniformLocation(prog, n);
  }

  _emptyTex() {
    const gl = this.gl;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
      new Uint8Array([20, 20, 30, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return t;
  }

  setPhoto(source) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this._photoTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  }

  setPalette(rgba256) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this._paletteTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba256);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  }

  resize(dpr = 1) {
    const w = Math.floor(this.canvas.clientWidth * dpr);
    const h = Math.floor(this.canvas.clientHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  // Does this view need (and support) the high-precision path?
  static needsDeep(p) {
    return p.scale < 6e-4 && Math.abs(p.power - 2) < 0.001;
  }

  render(p) {
    const gl = this.gl, u = this.u;
    gl.useProgram(this.prog);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this._photoTex);
    gl.uniform1i(u.u_photo, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this._paletteTex);
    gl.uniform1i(u.u_palette, 1);

    const [cxHi, cxLo] = splitDouble(p.centerX);
    const [cyHi, cyLo] = splitDouble(p.centerY);
    const precision = FractalGL.needsDeep(p) ? 1 : 0;

    gl.uniform2f(u.u_resolution, this.canvas.width, this.canvas.height);
    gl.uniform2f(u.u_centerHi, cxHi, cyHi);
    gl.uniform2f(u.u_centerLo, cxLo, cyLo);
    gl.uniform1f(u.u_scale, p.scale);
    gl.uniform1f(u.u_rot, p.rot);
    gl.uniform1i(u.u_precision, precision);
    gl.uniform1i(u.u_type, p.type);
    gl.uniform1f(u.u_power, p.power);
    gl.uniform1i(u.u_maxIter, p.maxIter);
    gl.uniform1f(u.u_escape2, p.escape * p.escape);
    gl.uniform2f(u.u_juliaC, p.juliaRe, p.juliaIm);
    gl.uniform1i(u.u_colorMode, p.colorMode);
    gl.uniform1i(u.u_trapType, p.trapType);
    gl.uniform2f(u.u_trapCenter, p.trapX, p.trapY);
    gl.uniform1f(u.u_imgScale, p.imgScale);
    gl.uniform1f(u.u_imgRot, p.imgRot);
    gl.uniform2f(u.u_imgOffset, p.imgOffX, p.imgOffY);
    gl.uniform1f(u.u_paletteShift, p.paletteShift);
    gl.uniform1f(u.u_paletteScale, p.paletteScale);
    gl.uniform3f(u.u_interior, p.interior[0], p.interior[1], p.interior[2]);
    gl.uniform1f(u.u_mix, p.mix);
    gl.uniform4f(u.u_crop, p.crop[0], p.crop[1], p.crop[2], p.crop[3]);
    gl.uniform1f(u.u_brightness, p.brightness);
    gl.uniform1f(u.u_contrast, p.contrast);
    gl.uniform1f(u.u_saturation, p.saturation);
    gl.uniform1f(u.u_gamma, p.gamma);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    return precision;
  }
}
