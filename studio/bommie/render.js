// render.js — The Bommie, drawn: one WebGL2 raymarch of the whole set and cast, lit like a
// tank on a shelf. Toys, not people: sculpted smooth shapes, glossy button eyes, soft light,
// caustics on the sand, blue with distance.
//
//   const R = makeRenderer(canvas); R.draw(frameState(t), t)
//
// frameState (below) asks world.js where everything is at t and packs it for the shader. The
// shapes here must agree with world.js where it measures (bommieSDF: LUMPS, the wobble).

import { fishAt, gusAt, propsAt, pipAt, lightAt, cameraAt, LUMPS } from './world.js';

const FISH = ['nell', 'dot', 'dash', 'barry'];

const VS = `#version 300 es
in vec2 p; out vec2 uv;
void main(){ uv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;

const FS = `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform vec2 res; uniform float T, TW;              // TW: the water's own clock (smooth, while the cast moves on twos)
uniform vec3 camE, camF, camR, camU; uniform float tanF;
uniform vec4 lightW;                                 // night, dawn, day, dusk
uniform vec4 lumpC[4]; uniform vec3 lumpR[4];
// the fish: pos + yaw, pitch/phase/amp/mouth, and shape (len, h, w, tail)
uniform vec4 fP[4], fA[4], fS[4];
// Gus
uniform vec4 gP;                                     // pos, yaw
uniform vec4 gV;                                     // out, claw, eyes, dust
uniform vec2 gW;                                     // hidden (in the can), naked (no shell)
uniform vec3 gH[4], gK[4], gF[4];
// props: world -> local rotations and positions
uniform mat3 wM, cM, kM; uniform vec3 wP, cP, kP;
uniform vec4 pipV;                                   // pos, glow

const float PI = 3.14159265;
float hash3(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float noise(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash3(i), hash3(i + vec3(1,0,0)), f.x), mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x), mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y), f.z); }
float smin(float a, float b, float k){ float h = max(k - abs(a - b), 0.0) / k; return min(a, b) - h * h * k * 0.25; }
float sdEll(vec3 p, vec3 r){ float k0 = length(p / r), k1 = length(p / (r * r)); return k0 * (k0 - 1.0) / max(k1, 1e-6); }
float sdCap(vec3 p, vec3 a, vec3 b, float r){ vec3 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h) - r; }
float sdCone(vec3 p, vec3 a, vec3 b, float ra, float rb){ vec3 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h) - mix(ra, rb, h); }
float sdCylX(vec3 p, float r, float hl){ vec2 d = abs(vec2(length(p.yz), p.x)) - vec2(r, hl); return min(max(d.x, d.y), 0.0) + length(max(d, 0.0)); }
float sdCylY(vec3 p, float r, float hl){ vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(r, hl); return min(max(d.x, d.y), 0.0) + length(max(d, 0.0)); }
vec2 U(vec2 a, vec2 b){ return a.x < b.x ? a : b; }

// ---- the set -------------------------------------------------------------------------
float bommie(vec3 p){
  float d = 1e9;
  for (int i = 0; i < 4; i++) d = smin(d, sdEll(p - lumpC[i].xyz, lumpR[i]), 0.5);
  d += 0.06 * sin(3.1 * p.x) * sin(2.7 * p.y + 1.0) * sin(3.3 * p.z);
  // doorways: it's an apartment block. (world.js leaves them out: its checks stay conservative)
  const vec3 DOORS[5] = vec3[5](vec3(0.2, 0.62, 0.1), vec3(1.1, 1.3, -0.14), vec3(-0.3, 1.9, -0.47), vec3(1.6, 0.45, -0.01), vec3(0.62, 2.3, -0.51));
  for (int i = 0; i < 5; i++) d = max(d, -sdEll(p - DOORS[i], vec3(0.15, 0.19, 0.2) * (i == 0 ? 1.2 : 1.0)));
  return max(d, -p.y);
}
float sand(vec3 p){ return p.y - 0.018 * sin(p.x * 7.0 + 2.0 * sin(p.z * 1.7)) * smoothstep(8.0, 2.0, length(p.xz)) + 0.02; }
vec2 decor(vec3 p){
  vec2 r = vec2(1e9, 0.0);
  // brain coral, right of the bommie
  r = U(r, vec2(max(sdEll(p - vec3(2.75, 0.18, -0.35), vec3(0.5, 0.42, 0.46)), -p.y), 3.0));
  // tube sponges, back left: open-topped
  for (int i = 0; i < 3; i++) {
    vec3 c = vec3(-3.5 + 0.38 * float(i), 0.0, -1.7 + 0.25 * float(i % 2));
    float h = 0.55 + 0.22 * float(i);
    vec3 q = p - c - vec3(0.0, h, 0.0);
    float tube = max(sdCylY(q, 0.17 - 0.02 * float(i), h), -sdCylY(q - vec3(0.0, 0.15, 0.0), 0.12 - 0.02 * float(i), h));
    r = U(r, vec2(tube - 0.01, 4.0));
  }
  // staghorn on the right shoulder
  vec3 s0 = vec3(1.9, 1.35, -0.55);
  float st = sdCap(p, s0, s0 + vec3(0.25, 0.55, 0.1), 0.06);
  st = min(st, sdCap(p, s0 + vec3(0.12, 0.25, 0.05), s0 + vec3(-0.2, 0.62, 0.15), 0.05));
  st = min(st, sdCap(p, s0 + vec3(0.2, 0.45, 0.08), s0 + vec3(0.5, 0.75, -0.05), 0.045));
  st = min(st, sdCap(p, s0 + vec3(0.0, 0.0, 0.1), s0 + vec3(0.1, 0.35, 0.45), 0.05));
  r = U(r, vec2(st, 5.0));
  // a sea fan, far back
  vec3 fq = p - vec3(-1.6, 1.3, -3.2);
  r = U(r, vec2(sdEll(fq, vec3(1.0, 1.05, 0.03)), 6.0));
  r = U(r, vec2(sdCap(p, vec3(-1.6, 0.0, -3.2), vec3(-1.6, 0.4, -3.2), 0.06), 6.0));
  // seaweed: three strands swaying, behind right
  for (int i = 0; i < 3; i++) {
    vec3 b = vec3(3.4 + 0.3 * float(i), 0.0, -1.2 - 0.35 * float(i));
    float sw = 0.0;
    vec3 a = b;
    for (int k = 0; k < 4; k++) {
      float fk = float(k + 1);
      vec3 nb = b + vec3(0.14 * sin(TW * 0.9 + fk * 0.7 + float(i)) * fk * 0.35, 0.42 * fk, 0.06 * sin(TW * 0.7 + fk + float(i) * 2.0) * fk * 0.3);
      r = U(r, vec2(sdCap(p, a, nb, 0.05 - 0.008 * fk), 7.0));
      a = nb;
    }
  }
  // far rocks, into the blue
  r = U(r, vec2(max(sdEll(p - vec3(-6.5, 0.0, -7.5), vec3(3.0, 2.2, 2.0)), -p.y) + 0.2 * noise(p * 1.5), 2.0));
  r = U(r, vec2(max(sdEll(p - vec3(7.0, 0.0, -8.0), vec3(3.5, 1.6, 2.2)), -p.y) + 0.2 * noise(p * 1.5), 2.0));
  return r;
}

// ---- the anemone -----------------------------------------------------------------------
vec2 anemone(vec3 p){
  vec3 q = p - pipV.xyz;
  if (length(q - vec3(0.0, 0.3, 0.0)) > 1.1) return vec2(length(q - vec3(0.0, 0.3, 0.0)) - 1.0, 0.0);
  // her rock, and her column
  vec2 r = vec2(max(sdEll(q + vec3(0.0, 0.32, 0.0), vec3(0.55, 0.36, 0.5)), -p.y), 2.0);
  r = U(r, vec2(sdCone(q, vec3(0.0, -0.05, 0.0), vec3(0.0, 0.22, 0.0), 0.2, 0.27) - 0.01, 10.0));
  // tentacles: one, repeated round the disc (a ring of 16 and an inner ring of 10), each swaying
  float best = 1e9;
  for (int ring = 0; ring < 2; ring++) {
    float n = ring == 0 ? 16.0 : 10.0, rad = ring == 0 ? 0.24 : 0.13, L = ring == 0 ? 0.34 : 0.26;
    float a = atan(q.z, q.x), cell = floor(a / (2.0 * PI / n) + 0.5), ac = cell * 2.0 * PI / n;
    vec3 dirOut = vec3(cos(ac), 0.0, sin(ac));
    vec3 base = vec3(0.0, 0.24, 0.0) + dirOut * rad;
    float sway = sin(TW * 1.1 + cell * 0.9 + float(ring)) * 0.07 + sin(TW * 0.45) * 0.05;
    vec3 tip = base + dirOut * L * (ring == 0 ? 0.55 : 0.3) + vec3(sway, L, sway * 0.6);
    best = min(best, sdCone(q, base, tip, 0.04, 0.022));
  }
  r = U(r, vec2(best, 11.0));
  return r;
}

// ---- a fish ----------------------------------------------------------------------------
vec3 fishLocal(vec3 p, int i){
  vec3 d = p - fP[i].xyz;
  float cy = cos(fP[i].w), sy = sin(fP[i].w);
  vec3 fwd = vec3(sy, 0.0, cy), rgt = vec3(cy, 0.0, -sy);
  vec3 l = vec3(dot(d, fwd), d.y, dot(d, rgt));
  float cp = cos(fA[i].x), sp = sin(fA[i].x);
  l.xy = vec2(cp * l.x + sp * l.y, -sp * l.x + cp * l.y);
  // the swim: a travelling wave, growing toward the tail
  float L = fS[i].x;
  l.z -= fA[i].z * L * sin(fA[i].y - l.x / L * 4.0) * smoothstep(0.35 * L, -0.6 * L, l.x);
  return l;
}
vec2 fish(vec3 p, int i, float best){
  float L = fS[i].x, H = fS[i].y, W = fS[i].z, TL = fS[i].w;
  if (length(p - fP[i].xyz) - L * 1.0 > best) return vec2(1e9, 0.0);
  vec3 l = fishLocal(p, i);
  float id = float(20 + i);
  float body = sdEll(l, vec3(L * 0.5, H * 0.5, W * 0.5));
  if (i == 3) body = smin(body, sdEll(l - vec3(L * 0.36, -H * 0.06, 0.0), vec3(L * 0.2, H * 0.34, W * 0.42)), 0.08);   // Barry's beak
  // the mouth: a notch at the nose, dark inside
  float m = fA[i].w;
  vec3 mq = l - vec3(L * 0.5, -H * 0.08, 0.0);
  body = max(body, -sdEll(mq, vec3(0.03 + 0.05 * m, 0.008 + 0.05 * m * H / 0.2, W * 0.35)));
  vec2 r = vec2(body, id);
  r = U(r, vec2(sdEll(mq + vec3(0.03, 0.0, 0.0), vec3(0.03 + 0.04 * m, 0.006 + 0.04 * m * H / 0.2, W * 0.28)), 9.0));
  // tail: a thin fan, forked on the wrasse and the parrotfish
  vec3 tq = l - vec3(-L * 0.5 - TL * 0.45, 0.0, 0.0);
  float tail = sdEll(tq, vec3(TL * 0.55, TL * 0.95, 0.018));
  if (i == 0 || i == 3) tail = max(tail, -sdEll(tq - vec3(-TL * 0.55, 0.0, 0.0), vec3(TL * 0.35, TL * 0.35, 0.1)));
  float fin = tail;
  // dorsal and belly fins
  fin = min(fin, sdEll(l - vec3(-L * 0.05, H * 0.46, 0.0), vec3(L * 0.32, H * 0.28, 0.014)));
  fin = min(fin, sdEll(l - vec3(-L * 0.18, -H * 0.42, 0.0), vec3(L * 0.14, H * 0.18, 0.012)));
  // pectoral fins, sculling
  float sc = sin(T * 7.0 + float(i) * 2.0) * 0.5;
  for (int s = -1; s <= 1; s += 2) {
    vec3 pq = l - vec3(L * 0.12, -H * 0.1, float(s) * W * 0.5);
    pq.xz = vec2(cos(sc) * pq.x - sin(sc) * pq.z * float(s), sin(sc) * pq.x * float(s) + cos(sc) * pq.z);
    fin = min(fin, sdEll(pq - vec3(-0.04, 0.0, float(s) * 0.03), vec3(L * 0.13, H * 0.2, 0.012)));
  }
  r = U(r, vec2(fin, id + 10.0));
  // button eyes: big, glossy, set forward and high
  for (int s = -1; s <= 1; s += 2) {
    float er = H * (i == 3 ? 0.13 : 0.19);
    r = U(r, vec2(length(l - vec3(L * 0.3, H * 0.13, float(s) * W * 0.42)) - er, 8.0));
  }
  return r;
}

// ---- Gus -------------------------------------------------------------------------------
vec2 gus(vec3 p, float best){
  vec3 c0 = gP.xyz + vec3(0.0, 0.2, 0.0);
  if (length(p - c0) - 0.75 > best || gW.x > 0.5) return vec2(1e9, 0.0);
  float cy = cos(gP.w), sy = sin(gP.w);
  vec3 f = vec3(sy, 0.0, cy), rt = vec3(cy, 0.0, -sy), up = vec3(0.0, 1.0, 0.0);
  float out_ = gV.x;
  vec3 c = c0 + f * (0.06 - 0.24 * (1.0 - out_));
  vec3 d = p - c; vec3 l = vec3(dot(d, rt), d.y, dot(d, f));
  vec2 r = vec2(sdEll(l, vec3(0.14, 0.1, 0.13)), 50.0);
  // the soft abdomen, only when he has no shell
  if (gW.y > 0.5) r = U(r, vec2(sdEll(l - vec3(0.0, 0.02, -0.2), vec3(0.11, 0.1, 0.17)), 52.0));
  // claws: the big one on his left, raised when he talks
  float cl = gV.y;
  vec3 sh = vec3(0.1, -0.02, 0.1), el = vec3(0.2, 0.06 + 0.12 * cl, 0.2), hand = vec3(0.16, 0.08 + 0.2 * cl, 0.32);
  float arms = sdCone(l, sh, el, 0.045, 0.04);
  arms = min(arms, sdCone(l, el, hand, 0.045, 0.06));
  vec2 claw = vec2(sdEll(l - hand - vec3(0.0, 0.0, 0.06), vec3(0.07, 0.065, 0.11)), 51.0);
  claw = U(claw, vec2(sdCone(l, hand + vec3(0.02, 0.04, 0.1), hand + vec3(0.0, 0.03 + 0.03 * cl, 0.2), 0.03, 0.015), 51.0));
  vec3 sh2 = vec3(-0.1, -0.02, 0.1), el2 = vec3(-0.17, 0.02, 0.18), hand2 = vec3(-0.12, 0.04, 0.26);
  arms = min(arms, sdCone(l, sh2, el2, 0.035, 0.03));
  arms = min(arms, sdCone(l, el2, hand2, 0.03, 0.035));
  claw = U(claw, vec2(sdEll(l - hand2 - vec3(0.0, 0.0, 0.04), vec3(0.04, 0.035, 0.07)), 51.0));
  r = U(r, vec2(arms, 50.0)); r = U(r, claw);
  // eyestalks and eyes
  for (int s = -1; s <= 1; s += 2) {
    vec3 b = vec3(float(s) * 0.045, 0.06, 0.1), tp = b + vec3(float(s) * 0.03 + gV.z * 0.1, 0.17, 0.04 + gV.z * 0.04 * float(s));
    r = U(r, vec2(sdCap(l, b, tp, 0.018), 50.0));
    r = U(r, vec2(length(l - tp - vec3(0.0, 0.03, 0.0)) - 0.042, 8.0));
    // antennae
    r = U(r, vec2(sdCap(l, b + vec3(0.0, -0.02, 0.03), b + vec3(float(s) * 0.12, 0.28 + 0.03 * sin(T * 3.0 + float(s)), 0.2), 0.006), 50.0));
  }
  // legs, from the world-space joints world.js planted
  float lg = 1e9;
  for (int k = 0; k < 4; k++) { lg = min(lg, sdCone(p, gH[k], gK[k], 0.03, 0.026)); lg = min(lg, sdCone(p, gK[k], gF[k], 0.026, 0.012)); }
  r = U(r, vec2(lg, 50.0));
  return r;
}

// ---- props -----------------------------------------------------------------------------
vec2 whelk(vec3 p, float best){
  if (length(p - wP) - 0.55 > best) return vec2(1e9, 0.0);
  vec3 l = wM * (p - wP);
  float s = sdEll(l, vec3(0.17, 0.17, 0.24));
  s = smin(s, sdCone(l, vec3(0.0, 0.0, -0.1), vec3(0.0, 0.0, -0.44), 0.13, 0.015), 0.06);
  s = max(s, -sdEll(l - vec3(0.0, -0.02, 0.23), vec3(0.1, 0.11, 0.08)));     // the door
  return vec2(s, 60.0);
}
vec2 tincan(vec3 p, float best){
  if (length(p - cP) - 0.6 > best) return vec2(1e9, 0.0);
  vec3 l = cM * (p - cP);
  float s = sdCylX(l, 0.3, 0.36) - 0.01;
  s = max(s, -sdCylX(l - vec3(0.06, 0.0, 0.0), 0.27, 0.36));               // open at +x
  return vec2(s, 61.0);
}
vec2 conch(vec3 p, float best){
  if (length(p - kP) - 0.8 > best) return vec2(1e9, 0.0);
  vec3 l = kM * (p - kP);
  float s = sdEll(l, vec3(0.34, 0.24, 0.44));
  s = smin(s, sdCone(l, vec3(0.0, 0.05, -0.2), vec3(0.0, 0.12, -0.62), 0.22, 0.02), 0.1);
  for (int i = 0; i < 5; i++) { float a = float(i) * 0.9 - 1.8; s = smin(s, length(l - vec3(0.26 * sin(a), 0.2, 0.26 * cos(a) - 0.1)) - 0.06, 0.06); }
  s = smin(s, sdEll(l - vec3(0.24, -0.02, 0.12), vec3(0.14, 0.2, 0.3)), 0.05);    // the flared lip
  s = max(s, -sdEll(l - vec3(0.28, -0.04, 0.16), vec3(0.08, 0.14, 0.24)));
  return vec2(s, 62.0);
}

vec2 map(vec3 p){
  vec2 r = vec2(sand(p), 1.0);
  r = U(r, vec2(bommie(p), 2.0));
  r = U(r, decor(p));
  r = U(r, anemone(p));
  for (int i = 0; i < 4; i++) r = U(r, fish(p, i, r.x));
  r = U(r, gus(p, r.x));
  r = U(r, whelk(p, r.x));
  r = U(r, tincan(p, r.x));
  r = U(r, conch(p, r.x));
  return r;
}
vec3 normalAt(vec3 p){
  const vec2 k = vec2(1.0, -1.0); const float e = 0.0015;
  return normalize(k.xyy * map(p + k.xyy * e).x + k.yyx * map(p + k.yyx * e).x + k.yxy * map(p + k.yxy * e).x + k.xxx * map(p + k.xxx * e).x);
}

// ---- light -----------------------------------------------------------------------------
vec3 sunDir(){ return normalize(vec3(0.35, 1.0, 0.3)); }
vec3 sunCol(){ return lightW.x * vec3(0.12, 0.2, 0.42) + lightW.y * vec3(1.1, 0.78, 0.62) + lightW.z * vec3(1.0, 0.98, 0.9) + lightW.w * vec3(1.15, 0.62, 0.55); }
vec3 waterCol(){ return lightW.x * vec3(0.01, 0.03, 0.08) + lightW.y * vec3(0.12, 0.28, 0.42) + lightW.z * vec3(0.1, 0.42, 0.55) + lightW.w * vec3(0.14, 0.2, 0.36); }
float caustic(vec2 x){
  // the tank's light: two moving interference patterns, sharpened
  vec2 q = x * 1.8;
  float c = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    q += vec2(sin(q.y * 1.3 + TW * (0.6 + 0.2 * fi)), cos(q.x * 1.1 - TW * (0.5 + 0.15 * fi))) * 0.55;
    c += abs(sin(q.x + q.y) * sin(q.x * 0.7 - q.y * 1.2));
  }
  return pow(clamp(1.0 - c / 3.0, 0.0, 1.0), 4.0) * 3.0;
}
float shadow(vec3 ro, vec3 rd){
  float res = 1.0, t = 0.03;
  for (int i = 0; i < 24; i++) { float h = map(ro + rd * t).x; res = min(res, 10.0 * h / t); t += clamp(h, 0.03, 0.4); if (res < 0.02 || t > 6.0) break; }
  return clamp(res, 0.0, 1.0);
}
float ao(vec3 p, vec3 n){
  float o_ = 0.0, w = 1.0;
  for (int i = 1; i <= 5; i++) { float h = 0.05 * float(i); o_ += (h - map(p + n * h).x) * w; w *= 0.7; }
  return clamp(1.0 - 2.2 * o_, 0.0, 1.0);
}
// a material: colour, shininess, emission
vec3 fishColor(int i, vec3 l){
  float L = fS[i].x, H = fS[i].y;
  float x = l.x / L, y = l.y / H;
  if (i == 1 || i == 2) {
    // clownfish: orange, three white bands edged in black
    vec3 c = vec3(1.0, 0.45, 0.08);
    for (int b = 0; b < 3; b++) {
      float cx = b == 0 ? 0.22 : b == 1 ? -0.02 : -0.36, w = b == 1 ? 0.07 : 0.05;
      float d = abs(x - cx);
      if (d < w) c = vec3(0.98, 0.97, 0.94); else if (d < w + 0.022) c = vec3(0.05, 0.03, 0.03);
    }
    return c;
  }
  if (i == 0) {
    // cleaner wrasse: blue above, white below, a black stripe nose to tail widening back
    vec3 c = y > 0.05 ? vec3(0.2, 0.55, 1.0) : vec3(0.93, 0.95, 1.0);
    if (abs(y + 0.02) < 0.1 + 0.18 * clamp(-x + 0.2, 0.0, 1.0)) c = vec3(0.04, 0.05, 0.12);
    return c;
  }
  // Barry: green-teal scales, a pink edge to each, the beak pale
  vec3 c = mix(vec3(0.16, 0.72, 0.58), vec3(0.3, 0.5, 0.95), smoothstep(-0.3, 0.4, y));
  vec2 sc = vec2(l.x * 14.0, l.y * 14.0 + 0.5 * floor(l.x * 14.0));
  if (length(fract(sc) - 0.5) > 0.42) c = mix(c, vec3(1.0, 0.5, 0.65), 0.6);
  if (x > 0.36) c = vec3(0.75, 0.95, 0.9);
  return c;
}
vec4 material(vec3 p, float id){
  if (id < 1.5) { float n = noise(p * 6.0); return vec4(mix(vec3(0.86, 0.76, 0.58), vec3(0.76, 0.65, 0.48), n), 8.0); }
  if (id < 2.5) {
    // coral rock: sculpted, with patches: coralline purple low, algae green on top, polyps
    float n = noise(p * 2.2), n2 = noise(p * 9.0), n3 = noise(p * 1.3 + 7.0);
    // colonies in patches: rose, coral orange, violet; algae green on the top; paler polyps all over
    vec3 c = mix(vec3(0.95, 0.55, 0.52), vec3(0.98, 0.66, 0.36), smoothstep(0.35, 0.65, n));
    c = mix(c, vec3(0.62, 0.42, 0.85), smoothstep(0.55, 0.75, n3));
    c = mix(c, vec3(0.5, 0.7, 0.35), smoothstep(0.62, 0.85, n + 0.3 * normalize(p - vec3(0.3, 0.0, -1.3)).y) * 0.7);
    float pol = smoothstep(0.62, 0.74, noise(p * 13.0));
    c = mix(c * (0.85 + 0.2 * n2), vec3(1.0, 0.92, 0.8), pol * 0.55);
    return vec4(c, 6.0);
  }
  if (id < 3.5) { float g = sin(p.x * 26.0 + 4.0 * sin(p.z * 18.0) + 3.0 * sin(p.y * 20.0)); return vec4(mix(vec3(0.95, 0.75, 0.4), vec3(0.75, 0.52, 0.28), smoothstep(-0.2, 0.3, g)), 10.0); }
  if (id < 4.5) return vec4(vec3(1.0, 0.82, 0.25), 6.0);
  if (id < 5.5) return vec4(vec3(0.78, 0.6, 0.95), 10.0);
  if (id < 6.5) { float lat = step(0.82, max(abs(sin(p.x * 22.0)), abs(sin(p.y * 22.0 + p.x * 8.0)))); return vec4(mix(vec3(0.62, 0.22, 0.6), vec3(0.4, 0.12, 0.42), lat), 6.0); }
  if (id < 7.5) return vec4(vec3(0.35, 0.68, 0.3), 8.0);
  if (id < 8.5) return vec4(vec3(0.02), 120.0);                                // button eyes
  if (id < 9.5) return vec4(vec3(0.35, 0.05, 0.1), 4.0);                       // inside a mouth
  if (id < 10.5) return vec4(vec3(0.62, 0.36, 0.85), 14.0);                    // Pip's column
  if (id < 11.5) return vec4(vec3(0.82, 0.55, 1.0), 20.0);                     // Pip's tentacles
  if (id < 29.5) { int i = int(id) - 20; return vec4(fishColor(i, fishLocal(p, i)), 40.0); }
  if (id < 39.5) { int i = int(id) - 30; vec3 c = i == 1 || i == 2 ? vec3(1.0, 0.5, 0.1) : i == 0 ? vec3(0.35, 0.65, 1.0) : vec3(0.4, 0.55, 1.0);
    vec3 l = fishLocal(p, i); if (i == 1 || i == 2) c = mix(c, vec3(0.05), smoothstep(0.02, 0.0, abs(length(l.xy - vec2(-fS[i].x * 0.5 - fS[i].w * 0.45, 0.0)) - fS[i].w * 0.8) - 0.02) * 0.9);
    return vec4(c, 30.0); }
  if (id < 50.5) return vec4(mix(vec3(0.92, 0.36, 0.2), vec3(0.93, 0.84, 0.66), gV.w * 0.7), 18.0);   // Gus (dusted after Barry)
  if (id < 51.5) return vec4(mix(vec3(0.95, 0.25, 0.15), vec3(0.93, 0.84, 0.66), gV.w * 0.6), 24.0);
  if (id < 52.5) return vec4(vec3(1.0, 0.72, 0.72), 12.0);                     // the soft abdomen
  if (id < 60.5) { vec3 l = wM * (p - wP); float sp = sin(atan(l.y, l.x) * 1.0 + l.z * 26.0); return vec4(mix(vec3(0.96, 0.9, 0.8), vec3(0.62, 0.38, 0.24), smoothstep(0.2, 0.6, sp)), 24.0); }
  if (id < 61.5) { vec3 l = cM * (p - cP); bool label = abs(l.x) < 0.2 && length(l.yz) > 0.28; float seam = step(0.97, cos(atan(l.z, l.y)));
    vec3 c = label ? mix(vec3(0.9, 0.15, 0.12), vec3(0.98, 0.95, 0.9), step(0.08, abs(l.x - 0.02))) : vec3(0.72, 0.75, 0.8); return vec4(c * (1.0 - 0.4 * seam), label ? 30.0 : 80.0); }
  vec3 l = kM * (p - kP);
  vec3 c = mix(vec3(1.0, 0.82, 0.6), vec3(0.72, 0.45, 0.3), smoothstep(0.3, 0.8, sin(l.z * 18.0 + l.x * 6.0)) * 0.6);
  c = mix(c, vec3(1.0, 0.5, 0.58), smoothstep(0.12, 0.26, l.x));            // the flared lip and its pink
  return vec4(c, 30.0);
}

vec3 background(vec3 rd){
  vec3 w = waterCol();
  vec3 c = mix(w * 0.35, w * 1.6, smoothstep(-0.4, 0.6, rd.y));
  // the surface, far above: bright and moving
  float surf = smoothstep(0.55, 0.95, rd.y);
  c += surf * (sunCol() * 0.35) * (0.6 + 0.4 * caustic(rd.xz / max(rd.y, 0.1) * 2.0));
  return c;
}
vec3 shade(vec3 ro, vec3 rd, float t, float id){
  vec3 p = ro + rd * t, n = normalAt(p);
  if (id > 1.5 && id < 2.5 && t < 12.0) {
    // coral isn't smooth: a bumped normal (lumps and polyps), cheaper than the geometry
    const float e = 0.02;
    float b0 = noise(p * 7.0) + 0.5 * noise(p * 15.0);
    vec3 g = vec3(noise((p + vec3(e, 0, 0)) * 7.0) + 0.5 * noise((p + vec3(e, 0, 0)) * 15.0), noise((p + vec3(0, e, 0)) * 7.0) + 0.5 * noise((p + vec3(0, e, 0)) * 15.0), noise((p + vec3(0, 0, e)) * 7.0) + 0.5 * noise((p + vec3(0, 0, e)) * 15.0)) - b0;
    n = normalize(n - g / e * 0.035);
  }
  vec4 m = material(p, id);
  vec3 L = sunDir();
  float dif = clamp(dot(n, L) * 0.8 + 0.2, 0.0, 1.0);          // wrapped: soft, like a lamp over a tank
  float sh = dif > 0.001 ? shadow(p + n * 0.01, L) : 0.0;
  float occ = ao(p, n);
  float cau = caustic(p.xz + p.y * 0.3) * smoothstep(-0.2, 0.8, n.y) * (1.0 - lightW.x * 0.9) * 0.8;
  vec3 sc = sunCol();
  vec3 amb = waterCol() * 1.6 + vec3(0.05);
  vec3 col = m.rgb * (amb * occ * (0.6 + 0.4 * n.y) + sc * dif * sh * (0.75 + 0.55 * cau));
  // a toy's gloss
  vec3 h = normalize(L - rd);
  col += sc * pow(max(dot(n, h), 0.0), m.a) * sh * (m.a > 60.0 ? 1.4 : 0.25);
  // eyes catch a second light, the camera's, so they read at night too
  if (id > 7.5 && id < 8.5) col += vec3(0.9) * pow(max(dot(n, normalize(-rd + vec3(0.3, 0.5, 0.0))), 0.0), 60.0);
  // a rim of the water's colour on every edge
  col += waterCol() * 0.8 * pow(1.0 - max(dot(n, -rd), 0.0), 3.0);
  // Pip glows: her tentacle tips, and more when she speaks and at night
  if (id > 10.5 && id < 11.5) { float tipness = smoothstep(0.35, 0.62, p.y - pipV.y); col += vec3(0.7, 0.35, 1.0) * tipness * (0.25 + pipV.w) * (0.4 + 1.2 * lightW.x); }
  return col;
}
vec3 fogged(vec3 col, vec3 rd, float t){
  // the water between here and there: red goes first, then everything to the water's colour
  col *= exp(-t * vec3(0.075, 0.03, 0.018));
  return mix(col, background(rd), 1.0 - exp(-t * 0.055));
}

void main(){
  vec2 s = (uv * 2.0 - 1.0) * vec2(res.x / res.y, 1.0) * tanF;
  vec3 rd = normalize(camF + camR * s.x + camU * s.y), ro = camE;
  float t = 0.05, id = -1.0;
  for (int i = 0; i < 120; i++) {
    vec2 h = map(ro + rd * t);
    if (h.x < 0.0012 * t) { id = h.y; break; }
    t += h.x * 0.85;
    if (t > 28.0) break;
  }
  vec3 col = id < 0.0 ? background(rd) : fogged(shade(ro, rd, t, id), rd, t);
  float depth = id < 0.0 ? 28.0 : t;
  // light shafts from the surface, stronger toward the top of the frame
  float shafts = 0.0;
  for (int k = 0; k < 3; k++) { float fk = float(k); shafts += pow(0.5 + 0.5 * sin(s.x * (5.0 + 3.0 * fk) + s.y * 1.5 + TW * (0.15 + 0.07 * fk) + fk * 2.0), 8.0); }
  col += sunCol() * shafts * 0.05 * smoothstep(-0.6, 1.0, s.y + 0.4) * (1.0 - lightW.x) * (1.0 - exp(-depth * 0.2));
  // marine snow, and at night the plankton's sparks
  for (int k = 0; k < 3; k++) {
    float z = 2.0 + float(k) * 2.5;
    if (z > depth) break;
    vec2 g = s * (8.0 + 6.0 * float(k)) + vec2(TW * 0.05 * float(k + 1), TW * (0.12 + 0.05 * float(k)));
    vec2 cell = floor(g), f = fract(g) - 0.5;
    float h = hash3(vec3(cell, float(k)));
    vec2 off = vec2(hash3(vec3(cell, 7.0 + float(k))), hash3(vec3(cell, 13.0 + float(k)))) - 0.5;
    float d = length(f - off * 0.6);
    if (h > 0.82) {
      col += vec3(0.8, 0.9, 1.0) * smoothstep(0.06, 0.0, d) * 0.12 * (1.0 - lightW.x);
      float spark = lightW.x * smoothstep(0.08, 0.0, d) * pow(0.5 + 0.5 * sin(TW * 2.0 + h * 40.0), 6.0);
      col += vec3(0.3, 0.9, 1.0) * spark * 0.9;
    }
  }
  // a vignette, as a lens on a tank sees it
  col *= 1.0 - 0.28 * dot(uv - 0.5, uv - 0.5) * 2.0;
  col = pow(col / (1.0 + col * 0.25), vec3(1.0 / 1.1));      // a gentle roll-off, never a hard clip
  o = vec4(col, 1.0);
}`;

// ---- the frame's state, packed ----------------------------------------------------------
// columns: local x, y, z in world. Yaw as the cast's: forward (local z) = (sin, 0, cos), right (local x) = (cos, 0, −sin)
const rotY = (a) => { const c = Math.cos(a), s = Math.sin(a); return [[c, 0, -s], [0, 1, 0], [s, 0, c]]; };
const rotX = (a) => { const c = Math.cos(a), s = Math.sin(a); return [[1, 0, 0], [0, c, s], [0, -s, c]]; };
const rotXaxis = rotX;
const mulM = (A, B) => B.map((col) => [0, 1, 2].map((r) => A[0][r] * col[0] + A[1][r] * col[1] + A[2][r] * col[2]));
// a world→local matrix (the transpose of local→world), column-major for uniformMatrix3fv
const worldToLocal = (M) => [M[0][0], M[1][0], M[2][0], M[0][1], M[1][1], M[2][1], M[0][2], M[1][2], M[2][2]];
// local frame of a prop: yaw about y (0: its +z faces the camera), then tilt about its x, then roll about its own x (the can)
function propFrame(yaw, tilt = 0, roll = 0) {
  let M = rotY(yaw);
  if (tilt) M = mulM(M, rotX(tilt));          // + tips its front (local z) down
  if (roll) M = mulM(M, rotXaxis(roll));
  return worldToLocal(M);
}

/** Everything the shader needs at t. `pose`: the time the cast is posed at (on twos). */
export function frameState(t, pose = t) {
  const cam = cameraAt(t);
  const f = norm(sub(cam.target, cam.eye)), r = norm(cross(f, [0, 1, 0])), u = cross(r, f);
  const fish = FISH.map((n) => fishAt(n, pose));
  const G = gusAt(pose), Pr = propsAt(pose), pip = pipAt(pose), L = lightAt(t);
  return { cam: { eye: cam.eye, f, r, u, tanF: Math.tan(cam.fov / 2), name: cam.name }, fish, G, Pr, pip, L };
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** Where a world point lands on a canvas of w × h (for the particles drawn over it), or null behind. */
export function project(S, p, w, h) {
  const v = sub(p, S.cam.eye), z = v[0] * S.cam.f[0] + v[1] * S.cam.f[1] + v[2] * S.cam.f[2];
  if (z < 0.05) return null;
  const x = (v[0] * S.cam.r[0] + v[1] * S.cam.r[1] + v[2] * S.cam.r[2]) / (z * S.cam.tanF * (w / h));
  const y = (v[0] * S.cam.u[0] + v[1] * S.cam.u[1] + v[2] * S.cam.u[2]) / (z * S.cam.tanF);
  return [(x * 0.5 + 0.5) * w, (0.5 - y * 0.5) * h, z];
}

export function makeRenderer(canvas) {
  const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  if (!gl) throw new Error('WebGL2 is not available');
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const pg = gl.createProgram();
  gl.attachShader(pg, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pg, sh(gl.FRAGMENT_SHADER, FS));
  gl.bindAttribLocation(pg, 0, 'p'); gl.linkProgram(pg);
  if (!gl.getProgramParameter(pg, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pg));
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = {}; const U = (n) => (n in loc ? loc[n] : (loc[n] = gl.getUniformLocation(pg, n)));

  function draw(S, t) {
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(pg);
    gl.uniform2f(U('res'), canvas.width, canvas.height);
    gl.uniform1f(U('T'), t); gl.uniform1f(U('TW'), t);
    gl.uniform3fv(U('camE'), S.cam.eye); gl.uniform3fv(U('camF'), S.cam.f); gl.uniform3fv(U('camR'), S.cam.r); gl.uniform3fv(U('camU'), S.cam.u);
    gl.uniform1f(U('tanF'), S.cam.tanF);
    gl.uniform4f(U('lightW'), S.L.night, S.L.dawn, S.L.day, S.L.dusk);
    LUMPS.forEach(([c, r], i) => { gl.uniform4f(U(`lumpC[${i}]`), ...c, 0); gl.uniform3fv(U(`lumpR[${i}]`), r); });
    S.fish.forEach((F, i) => {
      gl.uniform4f(U(`fP[${i}]`), ...F.pos, F.yaw);
      gl.uniform4f(U(`fA[${i}]`), F.pitch, F.phase, F.amp, F.mouth);
      gl.uniform4f(U(`fS[${i}]`), F.len, F.h, F.w, F.tail);
    });
    const G = S.G;
    gl.uniform4f(U('gP'), ...G.pos, G.yaw);
    gl.uniform4f(U('gV'), G.out, G.claw, G.eyes, G.dust);
    gl.uniform2f(U('gW'), G.inCan ? 1 : 0, G.shell === 'none' ? 1 : 0);
    G.legs.forEach((l, i) => { gl.uniform3fv(U(`gH[${i}]`), l.hip); gl.uniform3fv(U(`gK[${i}]`), l.knee); gl.uniform3fv(U(`gF[${i}]`), l.foot); });
    const { whelk, can, conch } = S.Pr;
    gl.uniformMatrix3fv(U('wM'), false, propFrame(whelk.yaw, whelk.tilt)); gl.uniform3fv(U('wP'), whelk.at);
    gl.uniformMatrix3fv(U('cM'), false, propFrame(can.yaw, 0, can.roll)); gl.uniform3fv(U('cP'), can.at);
    gl.uniformMatrix3fv(U('kM'), false, propFrame(conch.yaw, conch.tilt)); gl.uniform3fv(U('kP'), conch.at);
    gl.uniform4f(U('pipV'), ...S.pip.at, S.pip.glow);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  return { draw, gl };
}
