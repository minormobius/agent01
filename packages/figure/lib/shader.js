// shader.js — the figure drawn the way anime draws: flat colour, one shadow,
// a rim of light, and ink lines of two weights. WebGL2, two passes.
//
// Pass 1 raymarches the body's distance field (the same primitives body.js
// measures in node) and writes, per pixel: the view-space normal, the depth,
// the group the ray hit, and whether it hit a construction line on the head.
// Pass 2 reads that and draws: tone from the normal (a hard terminator, a
// cool shadow, a warm rim), and ink wherever the neighbourhood disagrees —
// against the background (the silhouette: the heaviest line), between groups
// or across a jump in depth (an arm in front of the body: a medium line), or
// across a fold in the normal (a crease: the lightest line). Pass 1 runs at
// twice the output resolution and pass 2 averages four samples, so the lines
// are antialiased.

import { pack, groupBounds, TEXELS, GROUPS } from './body.js';
import { packFace } from './face.js';
import { hairColors } from './hair.js';
import { outfitColors, resolveOutfit } from './clothes.js';
import { cross, norm, sub, add, scale } from './vec.js';

const VS = `#version 300 es
in vec2 p; out vec2 uv;
void main(){ uv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;

const GEOM = `#version 300 es
precision highp float; precision highp sampler2D;
in vec2 uv;
layout(location = 0) out vec4 o;
layout(location = 1) out vec4 o2;      // the face: material code, shade
uniform sampler2D prims; uniform int count;
uniform float fp[36];
uniform vec4 gb[${GROUPS.length}];      // group bounding spheres
uniform ivec2 gr[${GROUPS.length}];     // group prim ranges
uniform vec3 camC, camR, camU, camF; uniform vec2 halfSize;     // orthographic camera
uniform float persp;                                     // 0 = orthographic, else the focal length
uniform vec3 headC, headX, headY, headZ; uniform float eyeLine, headW;
uniform vec3 bmin, bmax;

vec4 T(int i, int j){ return texelFetch(prims, ivec2(j, i), 0); }
float sdRoundCone(vec3 p, vec3 a, vec3 b, float r1, float r2){
  vec3 ba = b - a; float l2 = dot(ba, ba);
  if (l2 < 1e-10) return length(p - a) - r1;
  float rr = r1 - r2; float a2 = l2 - rr*rr; float il2 = 1.0/l2;
  vec3 pa = p - a; float y = dot(pa, ba); float z = y - l2;
  vec3 xv = pa*l2 - ba*y; float x2 = dot(xv, xv); float y2 = y*y*l2; float z2 = z*z*l2;
  float k = sign(rr)*rr*rr*x2;
  if (sign(z)*a2*z2 > k) return sqrt(x2 + z2)*il2 - r2;
  if (sign(y)*a2*y2 < k) return sqrt(x2 + y2)*il2 - r1;
  return (sqrt(x2*a2*il2) + y*rr)*il2 - r1;
}
float sdEll(vec3 p, vec3 c, vec3 X, vec3 Y, vec3 Z, vec3 r){
  vec3 d = p - c; vec3 q = vec3(dot(d, X), dot(d, Y), dot(d, Z));
  float k0 = length(q / r); float k1 = length(q / (r*r));
  return k1 > 1e-9 ? k0*(k0 - 1.0)/k1 : -min(r.x, min(r.y, r.z));
}
float smin(float a, float b, float k){ if (k <= 0.0 || a > 1e8) return min(a, b); float h = max(k - abs(a - b), 0.0)/k; return min(a, b) - h*h*k*0.25; }
float prim(int i, vec3 p){
  vec4 t0 = T(i, 0), t1 = T(i, 1), t2 = T(i, 2);
  if (t2.x < 0.5) return sdRoundCone(p, t0.xyz, t1.xyz, t0.w, t1.w);
  vec4 t3 = T(i, 3), t4 = T(i, 4), t5 = T(i, 5);
  float d;
  if (t2.x > 2.5) {
    // a skirt: a flared round cone, pleated round the hem (body.js rawDist, the same)
    d = sdRoundCone(p, t0.xyz, t1.xyz, t0.w, t1.w);
    if (t3.w > 0.5) {
      vec3 ax = t1.xyz - t0.xyz, rel = p - t0.xyz;
      float h = clamp(dot(rel, ax) / dot(ax, ax), 0.0, 1.0);
      float th = atan(dot(rel, t5.xyz), dot(rel, t3.xyz));
      d -= t4.w * h * (0.5 + 0.5 * cos(t3.w * th));
    }
    if (t5.w > 0.0) d = max(d, -d - t5.w);                           // a shell, open at the hem
  } else {
    d = sdEll(p, t0.xyz, t3.xyz, t4.xyz, t5.xyz, vec3(t3.w, t4.w, t5.w));
    if (t2.x > 1.5) d = max(d, dot(p - t0.xyz, t1.xyz) - t1.w);     // capped: cut by a plane (the hairline)
  }
  return d;
}
float primClipped(int i, vec3 p){
  float d = prim(i, p);
  vec4 c1 = T(i, 7), c2 = T(i, 8);
  if (dot(c1.xyz, c1.xyz) > 0.5) d = max(d, dot(p, c1.xyz) - c1.w);    // a hem, a neckline, a cuff
  if (dot(c2.xyz, c2.xyz) > 0.5) d = max(d, dot(p, c2.xyz) - c2.w);
  return d;
}
// the body: smooth within a group, hard between; returns (distance, group)
uniform float hipK;
vec2 map(vec3 p){
  float best = 1e9; float g = -1.0;
  float dT = 1e9, dL = 1e9, dR = 1e9;     // torso and legs, for the blend at the hips (body.js sdf)
  for (int gi = 0; gi < ${GROUPS.length}; gi++) {
    vec4 s = gb[gi];
    if (s.w <= 0.0) continue;
    float bound = length(p - s.xyz) - s.w;
    if (bound > best) continue;                 // this whole limb is farther than what we have
    if (bound > 0.3) { if (bound < best) { best = bound; g = -1.0; } continue; }
    // centre parts, then each side blended onto the centre (see body.js)
    float c = 1e9, dl = 1e9, dr = 1e9, hl = 1e9, hr = 1e9; bool sided = false;   // hl, hr: without the noHip parts (k < 0)
    for (int i = gr[gi].x; i < gr[gi].y; i++) {
      vec4 t2 = T(i, 2);
      // a primitive the point is far from cannot change the blend: skip it (its bounding sphere says so)
      vec4 bs = T(i, 6);
      float k = abs(t2.z); bool hip = t2.z >= 0.0;
      float near = t2.w == 0.0 ? c : (t2.w > 0.0 ? (hip ? hl : dl) : (hip ? hr : dr));
      if (length(p - bs.xyz) - bs.w > min(near, best) + k + 0.02) continue;
      float di = primClipped(i, p);
      if (t2.w == 0.0) { c = smin(c, di, k); dl = c; dr = c; hl = c; hr = c; }
      else if (t2.w > 0.0) { sided = true; dl = smin(dl, di, k); if (hip) hl = smin(hl, di, k); }
      else { sided = true; dr = smin(dr, di, k); if (hip) hr = smin(hr, di, k); }
    }
    float d = sided ? min(dl, dr) : c;
    if (gi == 0) dT = sided ? min(hl, hr) : c; else if (gi == 4) dL = d; else if (gi == 5) dR = d;
    if (d < best) { best = d; g = float(gi); }
  }
  if (hipK > 0.0) {
    float hb = min(smin(dT, dL, hipK), smin(dT, dR, hipK));
    if (hb < best) best = hb;          // the group stays whichever was nearest
  }
  return vec2(best, g);
}
vec3 normal(vec3 p){
  const vec2 e = vec2(0.0015, 0.0);
  return normalize(vec3(map(p + e.xyy).x - map(p - e.xyy).x, map(p + e.yxy).x - map(p - e.yxy).x, map(p + e.yyx).x - map(p - e.yyx).x));
}

// ---- the face (face.js holds the same curves; FP names the slots) ---------------
// material codes: 1 ink, 2 iris, 3 pupil, 4 highlight, 5 sclera, 6 mouth, 7 tongue,
// 8 blush, 9 brow, 10 fang, 11 blush hatching
float segD(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
vec2 lidsAt(float open, float s){
  float k = max(0.0, 1.0 - s * s);
  float a = max(0.15, 0.45 - 0.3 * max(0.0, fp[12]));
  float yU = fp[4] * (open * 0.55 * pow(k, a) * (1.0 - 0.35 * max(0.0, fp[12])) - 0.04 * s);
  float yL = -fp[4] * open * 0.45 * pow(k, 0.7);
  return vec2(yU, yL);
}
vec2 faceAt(vec3 l, float facing){
  if (fp[0] < 0.5 || l.z < 0.0 || facing < 0.12) return vec2(0.0);
  float u = l.x, v = l.y + fp[30], px = fp[29];
  float side = u >= 0.0 ? 1.0 : -1.0, au = abs(u);
  float W = fp[3], H = fp[4];
  // ---- the eye on this side
  float open = side > 0.0 ? fp[6] : fp[7];
  vec2 e = vec2(au - fp[2], v - fp[1]);
  float c = cos(fp[5]), sn = sin(fp[5]);
  vec2 q = vec2(c * e.x + sn * e.y, -sn * e.x + c * e.y);        // eye frame: x outward, y up
  float sx = q.x / W;
  float lash = fp[11];
  if (abs(sx) < 1.45 && q.y < H * 1.1 && q.y > -H * 0.9) {
    float ss = clamp(sx, -1.0, 1.0);
    vec2 ly = lidsAt(open, ss);
    float t = max(lash * (0.008 + 0.02 * smoothstep(-0.2, 1.0, ss)), px * 1.1);
    if (open > 0.08) {
      if (abs(sx) <= 1.0 && q.y < ly.x && q.y > ly.y) {
        vec2 ic = vec2(fp[8] * side * W * 0.3, -H * 0.03 + fp[9] * H * 0.18);
        vec2 ir = vec2(W * 0.58, H * 0.47) * fp[10];
        float di = length((q - ic) / ir);
        if (di < 1.0) {
          vec2 h1 = (q - ic - vec2(-0.3 * ir.x * side, 0.36 * ir.y)) / (ir * vec2(0.3, 0.25));
          vec2 h2 = (q - ic - vec2(0.36 * ir.x * side, -0.42 * ir.y)) / (ir * vec2(0.13, 0.11));
          if (dot(h1, h1) < 1.0 || dot(h2, h2) < 1.0) return vec2(4.0, 0.0);
          if (di < 0.42) return vec2(3.0, 0.0);
          if (di > 0.93) return vec2(1.0, 0.0);                        // the iris's dark rim
          float g = clamp((q.y - (ic.y - ir.y)) / (2.0 * ir.y), 0.0, 1.0);
          if (q.y > ly.x - H * 0.16) g = 1.0;                         // the lid's shadow on the iris
          return vec2(2.0, g);
        }
        return vec2(5.0, smoothstep(ly.x - H * 0.22, ly.x, q.y));
      }
      // the upper lash line, heavier toward the outer corner
      if (abs(sx) <= 1.0 && q.y >= ly.x - t * 0.25 && q.y <= ly.x + t) return vec2(1.0, 0.0);
      // the flick past the outer corner (a masculine eye has none)
      if (fp[32] > 0.3 && sx > 0.8 && sx < 1.4) {
        vec2 end = vec2(W, lidsAt(open, 1.0).x);
        vec2 tip = end + vec2(W * 0.36, H * 0.16);
        float d = segD(q, end - vec2(W * 0.18, -H * 0.02), tip);
        float w = max(t * clamp((1.4 - sx) / 0.55, 0.0, 1.0) * fp[32], px * 0.6);
        if (d < w) return vec2(1.0, 0.0);
      }
      // the lower lid: a short, light stroke at the outer side
      if (fp[13] > 0.0 && sx > -0.25 && sx < 0.95 && abs(q.y - ly.y) < max(0.0035 * fp[13], px * 0.6) * smoothstep(-0.25, 0.25, sx)) return vec2(1.0, 0.0);
      // the double-lid crease
      if (fp[31] > 0.5 && sx > -0.45 && sx < 0.8 && abs(q.y - (ly.x + H * 0.12 + 0.012)) < max(0.0028, px * 0.5)) return vec2(1.0, 0.0);
    } else {
      // closed: one curved stroke, ^ when happy, ∪ when at rest
      float yc = fp[14] * H * 0.2 * (1.0 - ss * ss) - H * 0.04;
      if (abs(sx) <= 1.05 && abs(q.y - yc) < t * 0.8) return vec2(1.0, 0.0);
    }
  }
  // ---- the brow
  vec2 b = vec2(au - fp[2] - 0.01, v - (fp[1] + H * 0.62 + 0.05 + fp[15]));
  float bw = W * 1.15, bs = b.x / bw;
  if (abs(bs) < 1.0) {
    float yb = fp[18] * 0.025 * (1.0 - bs * bs) - fp[16] * 0.035 * (1.0 - bs) * 0.5 + sn * b.x;
    // never into the eye: at least a lash and a gap above the lid (face.js browFloor)
    float fx = b.x + 0.01, o6 = max(open, 0.6), lidTop = -1e9;
    for (int j = -1; j <= 1; j++) {                    // the lid's envelope near fx (face.js browFloor)
      float x0 = fx + float(j) * W * 0.12, qx = x0;
      for (int i = 0; i < 4; i++) qx = (x0 + sn * lidsAt(o6, clamp(qx / W, -1.0, 1.0)).x) / c;
      lidTop = max(lidTop, fp[1] + sn * qx + c * lidsAt(o6, clamp(qx / W, -1.0, 1.0)).x);
    }
    float floorY = lidTop + 0.03 * lash + 0.018;
    yb = max(yb, floorY - (fp[1] + H * 0.62 + 0.05 + fp[15]));
    float tb = max(fp[17] * (0.014 - 0.007 * (bs + 1.0) * 0.5) * smoothstep(1.0, 0.75, abs(bs)), px * 0.6);
    if (abs(b.y - yb) < tb) return vec2(9.0, 0.0);
  }
  // ---- the mouth
  vec2 m = vec2(u, v - fp[21]);
  float wm = fp[22] * (1.0 - 0.45 * fp[25]);
  float mx = m.x / wm;
  if (abs(mx) < 1.2 && abs(m.y) < 0.12) {
    float k = max(0.0, 1.0 - mx * mx);
    float mid = fp[23] * 0.02 * mx * mx - fp[23] * 0.008;
    float tl = max(0.0045, px * 0.8);
    float mo = fp[24];
    if (mo < 0.05) {
      if (fp[26] > 0.5 && fp[26] < 1.5) {
        float yw = mid - 0.014 * sin(3.14159 * min(abs(mx), 1.0));       // ω
        if (abs(mx) < 1.0 && abs(m.y - yw) < tl * 0.9) return vec2(1.0, 0.0);
      } else {
        if (abs(m.y - mid) < tl * smoothstep(1.05, 0.6, abs(mx))) return vec2(1.0, 0.0);
        if (fp[26] > 1.5 && m.y < mid && m.y > mid - 0.022 && abs(mx - 0.42) < (m.y - (mid - 0.022)) / 0.022 * 0.16) return vec2(10.0, 0.0);
      }
    } else {
      float top = mid + mo * 0.01 * sqrt(k);
      float bot = mid - mo * 0.07 * pow(k, 0.6 + 0.6 * fp[25]);
      if (abs(mx) < 1.0 && m.y < top + tl * 0.5 && m.y > bot - tl * 0.5) {
        if (m.y > top - tl * 0.5 || m.y < bot + tl * 0.4) return vec2(1.0, 0.0);
        if (m.y < bot + (top - bot) * 0.36 && abs(mx) < 0.72) return vec2(7.0, 0.0);
        return vec2(6.0, 0.0);
      }
    }
  }
  // ---- the nose: a tick, a dot, or a bridge (the line down its shadow side, and the nostril)
  if (fp[19] > 0.5) {
    float nv = fp[20];
    float dn;
    if (fp[19] < 1.5) dn = segD(vec2(u, v), vec2(-0.004, nv + 0.014), vec2(0.004, nv - 0.008));
    else if (fp[19] < 2.5) dn = length(vec2(u, v - nv)) - 0.004;
    else dn = min(segD(vec2(u, v), vec2(-0.014, nv + 0.1), vec2(-0.006, nv + 0.006)) + 0.0006 * smoothstep(nv + 0.02, nv + 0.1, v) * 3.0,
                  segD(vec2(u, v), vec2(-0.01, nv - 0.004), vec2(0.012, nv - 0.001)));
    if (dn < max(0.0035, px * 0.6)) return vec2(1.0, 0.0);
  }
  // ---- a beauty mark
  if (fp[28] != 0.0 && length(vec2(u - fp[28] * (fp[2] + 0.035), v - (fp[1] - H * 0.55 - 0.03))) < max(0.007, px)) return vec2(1.0, 0.0);
  // ---- blush, with hatching
  if (fp[27] > 0.0) {
    vec2 bl = vec2(au - fp[2] - 0.01, v - (fp[1] - H * 0.5 - 0.065));
    float db = length(bl / vec2(0.075, 0.03));
    if (db < 1.0) {
      if (db < 0.75 && fract((bl.x * side + bl.y * 0.9) / 0.024) < 0.26) return vec2(11.0, 0.0);
      return vec2(8.0, 1.0 - db);
    }
  }
  return vec2(0.0);
}
vec2 box(vec3 ro, vec3 rd){
  vec3 inv = 1.0 / rd; vec3 t0 = (bmin - ro) * inv, t1 = (bmax - ro) * inv;
  vec3 lo = min(t0, t1), hi = max(t0, t1);
  return vec2(max(max(lo.x, lo.y), lo.z), min(min(hi.x, hi.y), hi.z));
}
void main(){
  vec2 s = (uv * 2.0 - 1.0) * halfSize;
  vec3 ro, rd;
  if (persp > 0.0) { ro = camC - camF * persp; rd = normalize(camF * persp + camR * s.x + camU * s.y); }
  else { ro = camC + camR * s.x + camU * s.y - camF * 30.0; rd = camF; }
  vec2 tb = box(ro, rd);
  o = vec4(0.5, 0.5, 1.0, 0.0); o2 = vec4(0.0);
  if (tb.x > tb.y || tb.y < 0.0) return;
  float t = max(tb.x, 0.0);
  vec2 h = vec2(1.0, -1.0);
  for (int i = 0; i < 160; i++) {
    vec3 p = ro + rd * t;
    h = map(p);
    if (h.x < 0.0008 * (1.0 + t * 0.02)) break;
    t += h.x * 0.9;
    if (t > tb.y) { h.y = -1.0; break; }
  }
  if (h.y < 0.0 || t > tb.y) return;
  vec3 p = ro + rd * t;
  vec3 n = normal(p);
  vec3 nv = vec3(dot(n, camR), dot(n, camU), -dot(n, camF));
  // the head's construction lines: the centre line and the eye line, front half only
  float mark = 0.0;
  if (int(h.y) == 1) {
    vec3 q = p - headC; vec3 l = vec3(dot(q, headX), dot(q, headY), dot(q, headZ));
    if (fp[0] > 0.5) { vec2 fa = faceAt(l, dot(n, headZ)); o2 = vec4(fa.x / 255.0, fa.y, 0.0, 1.0); }
    else if (l.z > 0.05 && ((abs(l.x) < 0.012 && l.y > -0.08) || (abs(l.y - eyeLine) < 0.012 && abs(l.x) < headW * 0.5))) mark = 1.0;
  }
  float depth = clamp(dot(p - (camC - camF * 30.0), camF) / 60.0, 0.0, 1.0);
  o = vec4(nv.xy * 0.5 + 0.5, depth, (h.y + 1.0 + mark * 64.0) / 255.0);
}`;

const INK = `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform sampler2D g; uniform vec2 px;            // geometry pass, one of ITS texels in uv
uniform sampler2D fm;                            // the face materials
uniform vec3 irisTop, irisBot, irisDark, browC, mouthC, tongueC, blushC;
uniform vec3 light;                              // in view space
uniform vec3 base[${GROUPS.length}], shade[${GROUPS.length}];
uniform vec3 inkC, paper; uniform float wOut, wIn, wCrease;
uniform float bgAlpha;

vec4 G(vec2 q){ return texture(g, q); }
float gid(vec4 s){ return floor(mod(s.w * 255.0 + 0.5, 64.0)); }
vec3 N(vec4 s){ vec2 xy = s.xy * 2.0 - 1.0; return vec3(xy, sqrt(max(0.0, 1.0 - dot(xy, xy)))); }

// ink coverage at one geometry sample
vec2 inkAt(vec2 q){
  vec4 c = G(q); float id = gid(c);
  float ink = 0.0;
  // silhouette: anything within wOut texels that is background (or, from outside, figure)
  for (int i = 0; i < 12; i++) {
    float a = float(i) * 0.5235988;
    vec2 d = vec2(cos(a), sin(a));
    vec4 so = G(q + d * px * wOut);
    if ((id == 0.0) != (gid(so) == 0.0)) ink = 1.0;
    if (id > 0.0 && gid(so) > 0.0) {
      vec4 si = G(q + d * px * wIn);
      float di = gid(si);
      // an overlap (a jump in depth) draws on its far side; where two groups meet
      // in a fold (the armpit, the groin) the seam is inked, where they merge flat it is not
      bool jump = abs(si.z - c.z) > 0.004;
      bool fold = di != id && dot(N(si), N(c)) < 0.62;
      if (di > 0.0 && (jump || fold) && c.z > si.z - 0.0005) ink = 1.0;
      vec4 sc = G(q + d * px * wCrease);
      if (gid(sc) == id && dot(N(sc), N(c)) < 0.55 && abs(sc.z - c.z) < 0.004) ink = max(ink, 0.8);
    }
  }
  if (c.w * 255.0 > 64.5 && id > 0.0) ink = max(ink, 0.55);   // construction lines on the head
  return vec2(ink, id);
}
vec3 faceTone(vec3 skin, vec4 f){
  float code = floor(f.x * 255.0 + 0.5);
  if (code < 0.5) return skin;
  if (code < 1.5) return inkC;
  if (code < 2.5) return mix(irisBot, irisTop, f.y);
  if (code < 3.5) return irisDark;
  if (code < 4.5) return vec3(1.0);
  if (code < 5.5) return mix(vec3(0.99, 0.98, 0.97), vec3(0.78, 0.8, 0.9), f.y);
  if (code < 6.5) return mouthC;
  if (code < 7.5) return tongueC;
  if (code < 8.5) return mix(skin, blushC, 0.35 + 0.35 * f.y);
  if (code < 9.5) return browC;
  if (code < 10.5) return vec3(1.0);
  return mix(skin, blushC * 0.8, 0.85);
}
vec3 tone(vec2 q){
  vec4 c = G(q); float id = gid(c);
  if (id == 0.0) return paper;
  int gi = int(id) - 1;
  vec3 n = N(c);
  float l = dot(n, light);
  // one hard terminator, well round toward the light; a face stays lit (anime shades a face only at its far side)
  float lit = gi == 1 ? smoothstep(-0.12, -0.06, l) : smoothstep(0.26, 0.32, l);
  vec3 col = mix(shade[gi], base[gi], lit);
  float rim = smoothstep(0.62, 0.8, 1.0 - n.z) * smoothstep(-0.2, 0.3, dot(n.xy, -light.xy)) ;
  col = mix(col, base[gi] * 1.08 + 0.04, rim * 0.55 * (1.0 - lit));   // a warm rim on the shadow side
  if (gi == 1) col = faceTone(col, texture(fm, q));
  if (gi >= 6 && gi < 10) {
    // the angel ring: a band of light across the upper curve of the hair, its edges cut in zigzags
    float zig = 0.035 * sin(q.x * 160.0);
    float band = smoothstep(0.36 + zig, 0.39 + zig, n.y) * (1.0 - smoothstep(0.5 + zig, 0.53 + zig, n.y)) * smoothstep(0.45, 0.7, n.z);
    col = mix(col, mix(base[gi], vec3(1.0), 0.45), band * lit);
  }
  return col;
}
void main(){
  vec3 acc = vec3(0.0); float cov = 0.0;
  for (int k = 0; k < 4; k++) {
    vec2 q = uv + (vec2(float(k & 1), float(k >> 1)) - 0.5) * px;
    vec2 ik = inkAt(q);
    vec3 c = tone(q);
    acc += mix(c, inkC, ik.x);
    cov += (ik.y > 0.0 || ik.x > 0.0) ? 1.0 : 0.0;
  }
  vec3 col = acc * 0.25;
  float a = mix(bgAlpha, 1.0, cov * 0.25);
  o = vec4(col, a);
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) + '\n' + src.split('\n').map((l, i) => `${i + 1}: ${l}`).join('\n'));
  return s;
}
function program(gl, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VS)); gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.bindAttribLocation(p, 0, 'p'); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  return p;
}
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);

export const STYLE = {
  paper: '#f4efe4', ink: '#2a2230',
  skin: '#f6d9c4', skinShade: '#d9a3a0',
  groups: {},                              // per-group overrides: { arm_l: ['#base', '#shade'] }
  light: [-0.55, 0.62, 0.56],              // view space: from the upper left, in front
  lines: { out: 2.6, in: 1.5, crease: 1.2 },   // in geometry texels (twice the output pixels)
};

/**
 * A renderer bound to one WebGL2 canvas. draw(prims, camera, style) renders a
 * figure into the canvas (transparent background unless style.paperFill).
 */
export function makeRenderer(canvas, { supersample = 2 } = {}) {
  const gl = canvas.getContext('webgl2', { premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false });
  if (!gl) throw new Error('WebGL2 is not available');
  const pg = program(gl, GEOM), pi = program(gl, INK);
  const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const primTex = gl.createTexture();
  const geoTex = gl.createTexture(), faceTex = gl.createTexture(), fb = gl.createFramebuffer();
  let gw = 0, gh = 0;
  const U = (p, n) => gl.getUniformLocation(p, n);

  function draw(prims, P, cam, style = STYLE) {
    const W = canvas.width, H = canvas.height;
    const gW = Math.round(W * supersample), gH = Math.round(H * supersample);
    if (gw !== gW || gh !== gH) {
      gw = gW; gh = gH;
      gl.bindTexture(gl.TEXTURE_2D, geoTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gw, gh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindTexture(gl.TEXTURE_2D, faceTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gw, gh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, geoTex, 0);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, faceTex, 0);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    }
    // the primitives, as a float texture
    const data = pack(prims);
    gl.bindTexture(gl.TEXTURE_2D, primTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, TEXELS, prims.length, 0, gl.RGBA, gl.FLOAT, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    // pass 1
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.viewport(0, 0, gw, gh);
    gl.useProgram(pg);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, primTex); gl.uniform1i(U(pg, 'prims'), 0);
    const gbs = groupBounds(prims);
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    gbs.forEach((b, i) => {
      gl.uniform4f(U(pg, `gb[${i}]`), ...(b ? [...b.c, b.r] : [0, 0, 0, 0]));
      gl.uniform2i(U(pg, `gr[${i}]`), b ? b.start : 0, b ? b.end : 0);
      if (b) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], b.c[k] - b.r); hi[k] = Math.max(hi[k], b.c[k] + b.r); }
    });
    gl.uniform3f(U(pg, 'bmin'), ...lo); gl.uniform3f(U(pg, 'bmax'), ...hi);
    gl.uniform1f(U(pg, 'hipK'), prims.find((q) => q.hk)?.hk ?? 0);
    gl.uniform3f(U(pg, 'camC'), ...cam.c); gl.uniform3f(U(pg, 'camR'), ...cam.r); gl.uniform3f(U(pg, 'camU'), ...cam.u); gl.uniform3f(U(pg, 'camF'), ...cam.f);
    gl.uniform2f(U(pg, 'halfSize'), cam.halfW, cam.halfH); gl.uniform1f(U(pg, 'persp'), cam.persp || 0);
    const HF = P.F.head, hc = add(P.J.headPivot, [0, 0, 0]);
    gl.uniform3f(U(pg, 'headC'), ...hc); gl.uniform3f(U(pg, 'headX'), ...HF.x); gl.uniform3f(U(pg, 'headY'), ...HF.y); gl.uniform3f(U(pg, 'headZ'), ...HF.z);
    gl.uniform1f(U(pg, 'eyeLine'), P.rig.m.head.eyeLine - P.rig.m.head.pivotUp); gl.uniform1f(U(pg, 'headW'), P.rig.m.head.width);
    // the face: one geometry texel in head units keeps its finest lines at least a pixel wide
    const texel = (2 * cam.halfH) / gh;
    gl.uniform1fv(U(pg, 'fp'), packFace(P.face, { px: texel, pivotUp: P.rig.m.head.pivotUp }));
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // pass 2
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H);
    gl.useProgram(pi);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, geoTex); gl.uniform1i(U(pi, 'g'), 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, faceTex); gl.uniform1i(U(pi, 'fm'), 1);
    const fc = P.face?.colors || {};
    const C = { irisTop: fc.irisTop || '#3a2a52', irisBot: fc.irisBot || '#8b7bd4', irisDark: fc.irisDark || '#1c1426', browC: fc.brow || '#3b2a26', mouthC: fc.mouth || '#7a2a32', tongueC: fc.tongue || '#e0808a', blushC: fc.blush || '#f09aa0' };
    for (const [k, v] of Object.entries(C)) gl.uniform3f(U(pi, k), ...hex(v));
    gl.uniform2f(U(pi, 'px'), 1 / gw, 1 / gh);
    const L = norm(style.light); gl.uniform3f(U(pi, 'light'), ...L);
    GROUPS.forEach((name, i) => {
      const hc = P.hair ? hairColors(P.hair) : null;
      const oc = P.outfit ? outfitColors(resolveOutfit(P.outfit)) : null;
      const [b, s] = style.groups?.[name] || (oc && i >= 10 ? oc[name] || [style.skin, style.skinShade] : hc && i >= 6 && i < 10 ? [hc.base, hc.shade] : [style.skin, style.skinShade]);
      gl.uniform3f(U(pi, `base[${i}]`), ...hex(b)); gl.uniform3f(U(pi, `shade[${i}]`), ...hex(s));
    });
    gl.uniform3f(U(pi, 'inkC'), ...hex(style.ink)); gl.uniform3f(U(pi, 'paper'), ...hex(style.paper));
    gl.uniform1f(U(pi, 'wOut'), style.lines.out); gl.uniform1f(U(pi, 'wIn'), style.lines.in); gl.uniform1f(U(pi, 'wCrease'), style.lines.crease);
    gl.uniform1f(U(pi, 'bgAlpha'), style.paperFill ? 1 : 0);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  /** The geometry pass's group ids (0 = background), for tests: Uint8Array, gw × gh, rows bottom-up. */
  function readGroups() {
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    const px = new Uint8Array(gw * gh * 4);
    gl.readPixels(0, 0, gw, gh, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const ids = new Uint8Array(gw * gh);
    for (let i = 0; i < gw * gh; i++) ids[i] = px[i * 4 + 3] % 64;
    return { ids, w: gw, h: gh };
  }
  /** The face pass's material codes (0 = none), for tests: Uint8Array, gw × gh, rows bottom-up. */
  function readFace() {
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.readBuffer(gl.COLOR_ATTACHMENT1);
    const px = new Uint8Array(gw * gh * 4);
    gl.readPixels(0, 0, gw, gh, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.readBuffer(gl.COLOR_ATTACHMENT0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const codes = new Uint8Array(gw * gh);
    for (let i = 0; i < gw * gh; i++) codes[i] = px[i * 4];
    return { codes, w: gw, h: gh };
  }
  return { draw, gl, readGroups, readFace };
}

/** An orthographic camera looking at `target` from yaw (0 = the front) and pitch (+ = from above). */
/**
 * How much hand to draw: a hand under ~64 pixels long is drawn as blocks (hand.js), or its
 * four fingers are eight ink lines and a smudge. `px` is the canvas's height in pixels.
 */
export const handDetail = (P, cam, px) => (P.rig.m.hand * px / (2 * cam.halfH) >= 64 ? 'full' : 'block');

export function camera({ target = [0, 3.5, 0], yaw = 0, pitch = 0, height = 8, aspect = 0.5, persp = 0 } = {}) {
  const dir = [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];   // from the target toward the eye
  const f = scale(dir, -1);
  const r = norm(cross(f, [0, 1, 0]));
  const u = cross(r, f);
  return { c: target, f, r, u, halfH: height / 2, halfW: (height / 2) * aspect, persp };
}

/** Project a world point to canvas pixels, for overlays. */
export function project(cam, p, W, H) {
  const d = sub(p, cam.c);
  const x = (d[0] * cam.r[0] + d[1] * cam.r[1] + d[2] * cam.r[2]) / cam.halfW, y = (d[0] * cam.u[0] + d[1] * cam.u[1] + d[2] * cam.u[2]) / cam.halfH;
  return [(x * 0.5 + 0.5) * W, (1 - (y * 0.5 + 0.5)) * H];
}
