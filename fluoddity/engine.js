// Compact offscreen Fluoddity engine for gallery previews.
// Same algorithm/shaders as the playground, trimmed: fixed low res, fewer
// particles, no bloom / mouse-draw / UI. One instance is shared across the
// whole grid (render one organism at a time, blit to each card's 2D canvas).
// preserveDrawingBuffer:true so the canvas is always drawImage-able.

export function defaultConfig() {
  return {
    cohorts: 16, rule_seed: Math.random(),
    sensor_gain: 4.0, sensor_angle: -0.14, sensor_distance: 1.2,
    mutation_scale: 0.02, global_force_mult: 0.6, drag: 0.9,
    strafe_power: 0.17, axial_force: 0.04, lateral_force: -0.25,
    hazard_rate: 0.0, trail_persistence: 0.95, trail_diffusion: 0.6,
    initial_conditions: 0, ink: 3.0, hue: 0.0,
  };
}

// Canonical genome operators, shared by every breeding surface (breeder lab,
// selection, the landing hero). PARAMS maps each evolvable parameter to
// [lo, hi, mutation-sigma]. The lo/hi box is the empirically viable region —
// it excludes the obviously-dead corners of the genome (no ink, no drag,
// runaway force) so a uniform draw lands near the alive region far more often
// than sampling the full unbounded space. The rule_seed (a 10-term Fourier
// black box) still dominates whether a given draw is alive, so callers that
// want a guaranteed-lively organism should reject-sample on fitness on top.
export const PARAMS = {
  sensor_gain: [0, 12, 1.2], sensor_angle: [-1, 1, 0.12], sensor_distance: [0.05, 4, 0.4],
  mutation_scale: [0, 0.2, 0.02], global_force_mult: [0, 3, 0.3], drag: [0.5, 0.999, 0.04],
  strafe_power: [0, 1, 0.12], axial_force: [-0.6, 0.6, 0.08], lateral_force: [-1, 1, 0.12],
  trail_persistence: [0.5, 0.999, 0.04], trail_diffusion: [0, 2, 0.2], ink: [0.3, 8, 0.6], hue: [0, 1, 0.1],
};

const _clamp = (x, lo, hi) => x < lo ? lo : x > hi ? hi : x;
function _randn() { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

export function randomConfig() {
  const c = defaultConfig();
  for (const k in PARAMS) { const [lo, hi] = PARAMS[k]; c[k] = lo + Math.random() * (hi - lo); }
  c.rule_seed = Math.random();
  c.cohorts = 8 + (Math.random() * 24 | 0);
  return c;
}

// Gaussian nudge per parameter (70% chance each), plus rare structural jumps:
// a fresh rule_seed (a bifurcation), a cohort-count change, or a new spawn
// pattern. rate scales the per-parameter sigma.
export function mutate(cfg, rate = 1) {
  const c = { ...cfg };
  for (const k in PARAMS) {
    const [lo, hi, step] = PARAMS[k];
    if (Math.random() < 0.7) {
      const x = c[k] + _randn() * rate * step;
      c[k] = (k === 'hue') ? ((x % 1) + 1) % 1 : _clamp(x, lo, hi);
    }
  }
  if (Math.random() < 0.12) c.rule_seed = Math.random();
  if (Math.random() < 0.10) c.cohorts = _clamp((c.cohorts | 0) + (Math.random() < 0.5 ? -1 : 1) * (1 + (Math.random() * 2 | 0)), 1, 48) | 0;
  if (Math.random() < 0.06) c.initial_conditions = (Math.random() * 3) | 0;
  return c;
}


const VERT_FULLSCREEN = `#version 300 es
in vec2 a_pos; out vec2 v_uv;
void main(){ v_uv = a_pos*0.5+0.5; gl_Position = vec4(a_pos,0.0,1.0); }`;

const FRAG_ENTITY = `#version 300 es
precision highp float; precision highp int;
out vec4 outColor;
uniform sampler2D u_entity, u_canvas;
uniform int u_frame, u_count, u_texW, u_init, u_cohorts;
uniform float u_rule_seed, u_sensor_gain, u_sensor_angle, u_sensor_distance,
  u_mutation_scale, u_global_force_mult, u_drag, u_strafe_power,
  u_axial_force, u_lateral_force, u_hazard_rate;
#define PI 3.14159265
uint pcg(uint v){ uint s=v*747796405u+2891336453u; uint w=((s>>((s>>28u)+4u))^s)*277803737u; return (w>>22u)^w; }
float h1(vec2 c){ uvec2 u=uvec2(floatBitsToUint(c.x),floatBitsToUint(c.y)); return float(pcg(u.x^pcg(u.y)))/4294967295.0; }
vec4 h4(vec2 c){ return vec4(h1(c), h1(c*-1.0+5.0), h1(c.yx-100.0), h1(c.yx*-1.0+25.0)); }
struct Center { vec4 f; vec4 a; };
Center genCenter(float seed, int i){
  Center c;
  float fs = 1.0 + 2.0*pow(h1(vec2(seed, float(i*8+0))), 2.0);
  c.f = vec4(
    (h1(vec2(seed,float(i*8+0)))*2.0-1.0)*fs, (h1(vec2(seed,float(i*8+1)))*2.0-1.0)*fs,
    (h1(vec2(seed,float(i*8+2)))*2.0-1.0)*fs, (h1(vec2(seed,float(i*8+3)))*2.0-1.0)*fs);
  c.a = vec4(
    h1(vec2(seed,float(i*8+4)))*2.0-1.0, h1(vec2(seed,float(i*8+5)))*2.0-1.0,
    h1(vec2(seed,float(i*8+6)))*2.0-1.0, h1(vec2(seed,float(i*8+7)))*2.0-1.0);
  return c;
}
vec4 evalRule(float seed, float mut, float cohort, vec4 sig){
  float ms = h1(vec2(seed*1.7+3.1, cohort*2.3+0.7)) + cohort;
  vec4 res = vec4(0.0);
  for(int i=0;i<10;i++){
    Center c = genCenter(seed, i);
    c.a += mut * (-1.0 + 2.0*h4(-0.5 + vec2(-float(i)+ms, float(i))));
    c.f *= 1.0 + mut*0.5*(h1(vec2(ms,float(i)))-0.5);
    float phase = dot(sig, c.f);
    float off = 2.0*float(i)*0.6283 + c.a.w*3.14159;
    vec4 basis = vec4(sin(phase + off), cos(phase + off*0.7), sin(phase*2.0 + off*1.3), cos(phase*2.0 + off*0.5));
    res += c.a*basis;
  }
  return res;
}
void rot(inout vec2 p, float a){ p = cos(a)*p + sin(a)*vec2(p.y,-p.x); }
vec2 snorm(vec2 p){ return length(p)==0.0 ? vec2(0.0) : normalize(p); }
vec2 yref(vec2 p){ return p*vec2(1.0,-1.0); }
vec4 sampleField(vec2 p){ return texture(u_canvas, p*0.5 + 0.5); }
float cohortOf(int idx){ return float(u_cohorts)*float(idx)/float(u_count); }
vec4 resetState(int idx){
  float cv = cohortOf(idx);
  vec2 jitter = 0.019*(vec2(h1(vec2(cv)), h1(vec2(cv+float(idx)+2.142)))-0.5);
  vec2 vel = 0.00005*(vec2(h1(vec2(cv,float(idx))), h1(vec2(cv,jitter.y)))*2.0-1.0);
  vec2 pos;
  if(u_init==1){ pos = vec2(h1(vec2(cv,1.0)), h1(vec2(cv,2.0)))*2.0-1.0; }
  else if(u_init==2){ float ang = cv/float(u_cohorts)*2.0*PI; pos = jitter + vec2(cos(ang), sin(ang))*0.6; }
  else { float rows = ceil(sqrt(float(u_cohorts))); float gx = mod(floor(cv), rows); float gy = floor(floor(cv)/rows);
    pos = jitter + 1.8*(vec2(gx,gy)/rows + 0.5*(1.0/rows - 1.0)); }
  return vec4(pos, vel);
}
void main(){
  ivec2 px = ivec2(gl_FragCoord.xy);
  int idx = px.y*u_texW + px.x;
  if(idx >= u_count){ outColor = vec4(0.0); return; }
  bool hazard = u_hazard_rate > h1(vec2(float(idx)/float(u_count), float(u_frame)));
  if(u_frame==0 || hazard){ outColor = resetState(idx); return; }
  vec4 e = texelFetch(u_entity, px, 0);
  vec2 pos = e.xy, vel = e.zw;
  float cohort = cohortOf(idx);
  float sd = 0.005 * u_sensor_distance;
  vec2 head = snorm(vel);
  vec2 lo = head*sd, ro = head*sd;
  rot(lo,  u_sensor_angle*PI); rot(ro, -u_sensor_angle*PI);
  float gain = 38.855 * u_sensor_gain;
  vec2 L = sampleField(pos+lo).xy * gain;
  vec2 R = sampleField(pos+ro).xy * gain;
  vec2 fwd = snorm(vel);
  vec2 lft = vec2(fwd.y, -fwd.x);
  vec2 Ll = vec2(dot(L,fwd), dot(L,lft));
  vec2 Rl = vec2(dot(R,fwd), dot(R,lft));
  vec4 base = evalRule(u_rule_seed, u_mutation_scale, floor(cohort), vec4(Ll,Rl));
  vec4 mirr = evalRule(u_rule_seed, u_mutation_scale, floor(cohort), vec4(yref(Rl),yref(Ll)));
  vec2 force  = base.xy + yref(mirr.xy);
  vec2 strafe = base.zw + yref(mirr.zw);
  force  = fwd*force.x*u_axial_force  + lft*force.y*u_lateral_force;
  strafe = fwd*strafe.x*u_axial_force + lft*strafe.y*u_lateral_force;
  force  *= u_global_force_mult/400.0;
  strafe *= u_global_force_mult/20.0;
  vel = vel*u_drag + force;
  pos += vel; pos += strafe*u_strafe_power;
  pos = 2.0*(fract(pos*0.5 - 0.5) - 0.5);
  outColor = vec4(pos, vel);
}`;

const VERT_BRUSH = `#version 300 es
precision highp float;
in vec2 a_offset; in vec2 a_uv;
uniform sampler2D u_entity; uniform int u_texW; uniform float u_size;
out vec2 v_uv; out vec2 v_vel;
void main(){
  ivec2 tc = ivec2(gl_InstanceID % u_texW, gl_InstanceID / u_texW);
  vec4 e = texelFetch(u_entity, tc, 0);
  v_vel = e.zw; v_uv = a_uv;
  gl_Position = vec4(e.xy + a_offset*u_size, 0.0, 1.0);
}`;

const FRAG_BRUSH = `#version 300 es
precision highp float;
in vec2 v_uv; in vec2 v_vel; out vec4 o;
void main(){
  vec2 d = v_uv - 0.5;
  if(dot(d,d) > 0.25) discard;
  float k = exp(-dot(d,d)/(2.0*0.163*0.163));
  o = vec4(v_vel*k, 0.0, 0.0);
}`;

const FRAG_CANVAS = `#version 300 es
precision highp float;
out vec4 outColor; in vec2 v_uv;
uniform sampler2D u_brush, u_canvas;
uniform int u_frame; uniform float u_persistence, u_diffusion;
vec4 blur(vec2 p, float K){
  vec2 t = 1.0/vec2(textureSize(u_canvas,0));
  vec4 c = texture(u_canvas, p);
  vec4 n = texture(u_canvas, p+vec2(0.0, t.y));
  vec4 s = texture(u_canvas, p-vec2(0.0, t.y));
  vec4 e = texture(u_canvas, p+vec2(t.x, 0.0));
  vec4 w = texture(u_canvas, p-vec2(t.x, 0.0));
  return (c*K + n+s+e+w)/(4.0+K);
}
void main(){
  if(u_frame < 2){ outColor = vec4(0.0,0.0,0.0,1.0); return; }
  vec4 canvas;
  if(u_diffusion > 0.0){ float d = u_diffusion*u_diffusion; float K = 4.0/(pow(5.0,d)-1.0); canvas = blur(v_uv, K); }
  else { canvas = texture(u_canvas, v_uv); }
  vec2 brush = texture(u_brush, v_uv).xy;
  outColor = vec4(canvas.xy*u_persistence + (1.0-u_persistence)*brush, 0.0, 1.0);
}`;

const FRAG_DISPLAY = `#version 300 es
precision highp float;
out vec4 outColor; in vec2 v_uv;
uniform sampler2D u_canvas; uniform float u_ink, u_hue;
#define SOFT 3.9
#define BRIGHT 2.0
vec3 hsv2rgb(vec3 c){ vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0); vec3 p = abs(fract(c.xxx + K.xyz)*6.0 - K.www); return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y); }
void main(){
  vec2 v = texture(u_canvas, v_uv).xy;
  float hue = fract(atan(v.y, v.x)/(2.0*3.14159265) + u_hue);
  vec3 col = hsv2rgb(vec3(hue, 0.78, length(v))) * u_ink * 8.0;
  float len = length(col); if(len > 0.0) col /= pow(len, 0.575);
  float Ll = length(col); if(Ll > 0.0) col *= BRIGHT*asinh(Ll*SOFT)/(Ll*SOFT);
  outColor = vec4(col, 1.0);
}`;

// ── Arena variant shaders (multi-species shared field) ──────────────────────
// Compiled ONLY when the engine is constructed with { arena: true }; every other
// surface keeps compiling the originals above, untouched. Each cohort becomes an
// independent species: its rule seed is spread from the base by cohort index
// (so one "field config" expands into N distinct rules), all species deposit
// into ONE shared trail, and the display tints by species hue while keeping
// brightness from flow speed. Species identity rides in the otherwise-unused
// z,w channels as a weighted (cos,sin) hue vector, so it diffuses and blends at
// territory boundaries like the velocity field does. The two long shaders are
// derived by targeted string-replacement, so if a target ever stops matching the
// arena simply falls back toward default behavior instead of failing to compile.
const FRAG_ENTITY_ARENA = FRAG_ENTITY
  .replace(
    'vec4 base = evalRule(u_rule_seed, u_mutation_scale, floor(cohort), vec4(Ll,Rl));',
    'float arSeed = u_rule_seed + floor(cohort)*(0.08 + u_mutation_scale*2.0);\n  vec4 base = evalRule(arSeed, 0.0, floor(cohort), vec4(Ll,Rl));')
  .replace(
    'vec4 mirr = evalRule(u_rule_seed, u_mutation_scale, floor(cohort), vec4(yref(Rl),yref(Ll)));',
    'vec4 mirr = evalRule(arSeed, 0.0, floor(cohort), vec4(yref(Rl),yref(Ll)));');

const VERT_BRUSH_ARENA = `#version 300 es
precision highp float;
in vec2 a_offset; in vec2 a_uv;
uniform sampler2D u_entity; uniform int u_texW, u_count, u_cohorts; uniform float u_size;
out vec2 v_uv; out vec2 v_vel; out float v_hue;
void main(){
  ivec2 tc = ivec2(gl_InstanceID % u_texW, gl_InstanceID / u_texW);
  vec4 e = texelFetch(u_entity, tc, 0);
  v_vel = e.zw; v_uv = a_uv;
  float ci = floor(float(u_cohorts)*float(gl_InstanceID)/float(u_count));
  v_hue = ci/float(max(u_cohorts,1));
  gl_Position = vec4(e.xy + a_offset*u_size, 0.0, 1.0);
}`;

const FRAG_BRUSH_ARENA = `#version 300 es
precision highp float;
in vec2 v_uv; in vec2 v_vel; in float v_hue; out vec4 o;
void main(){
  vec2 d = v_uv - 0.5;
  if(dot(d,d) > 0.25) discard;
  float k = exp(-dot(d,d)/(2.0*0.163*0.163));
  float a = v_hue*6.28318530718;
  o = vec4(v_vel*k, cos(a)*k, sin(a)*k);
}`;

const FRAG_CANVAS_ARENA = FRAG_CANVAS
  .replace(
    'vec2 brush = texture(u_brush, v_uv).xy;\n  outColor = vec4(canvas.xy*u_persistence + (1.0-u_persistence)*brush, 0.0, 1.0);',
    'vec4 brush = texture(u_brush, v_uv);\n  outColor = vec4(canvas.xy*u_persistence + (1.0-u_persistence)*brush.xy, canvas.zw*u_persistence + (1.0-u_persistence)*brush.zw);');

const FRAG_DISPLAY_ARENA = `#version 300 es
precision highp float;
out vec4 outColor; in vec2 v_uv;
uniform sampler2D u_canvas; uniform float u_ink, u_hue;
#define SOFT 3.9
#define BRIGHT 2.0
vec3 hsv2rgb(vec3 c){ vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0); vec3 p = abs(fract(c.xxx + K.xyz)*6.0 - K.www); return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y); }
void main(){
  vec4 f = texture(u_canvas, v_uv);
  float mag = length(f.xy);
  float hue = fract(atan(f.w, f.z)/(2.0*3.14159265) + u_hue);
  vec3 col = hsv2rgb(vec3(hue, 0.82, mag)) * u_ink * 8.0;
  float len = length(col); if(len > 0.0) col /= pow(len, 0.575);
  float Ll = length(col); if(Ll > 0.0) col *= BRIGHT*asinh(Ll*SOFT)/(Ll*SOFT);
  outColor = vec4(col, 1.0);
}`;

// ── Particle render shaders (aphid91's note: "render the particles
// themselves, rather than the trail map"). Each agent becomes a single point
// colored by the RAW (no-mirror) brain output — hue from force-vector
// direction, brightness from magnitude. Diagnostic value, per aphid91: all
// one color means sensor_gain is so low the brain says the same thing for
// everything; all white means sensor_gain is so high tiny inputs explode into
// noise. Helpers below are copied verbatim from FRAG_ENTITY so a typo can't
// leak into the working trail pipeline.
const VERT_PARTICLES = `#version 300 es
precision highp float; precision highp int;
uniform sampler2D u_entity, u_canvas;
uniform int u_texW, u_count, u_cohorts;
uniform float u_rule_seed, u_sensor_gain, u_sensor_angle, u_sensor_distance,
  u_mutation_scale, u_point_size;
out vec3 v_color;
#define PI 3.14159265
uint pcg(uint v){ uint s=v*747796405u+2891336453u; uint w=((s>>((s>>28u)+4u))^s)*277803737u; return (w>>22u)^w; }
float h1(vec2 c){ uvec2 u=uvec2(floatBitsToUint(c.x),floatBitsToUint(c.y)); return float(pcg(u.x^pcg(u.y)))/4294967295.0; }
vec4 h4(vec2 c){ return vec4(h1(c), h1(c*-1.0+5.0), h1(c.yx-100.0), h1(c.yx*-1.0+25.0)); }
struct Center { vec4 f; vec4 a; };
Center genCenter(float seed, int i){
  Center c;
  float fs = 1.0 + 2.0*pow(h1(vec2(seed, float(i*8+0))), 2.0);
  c.f = vec4(
    (h1(vec2(seed,float(i*8+0)))*2.0-1.0)*fs, (h1(vec2(seed,float(i*8+1)))*2.0-1.0)*fs,
    (h1(vec2(seed,float(i*8+2)))*2.0-1.0)*fs, (h1(vec2(seed,float(i*8+3)))*2.0-1.0)*fs);
  c.a = vec4(
    h1(vec2(seed,float(i*8+4)))*2.0-1.0, h1(vec2(seed,float(i*8+5)))*2.0-1.0,
    h1(vec2(seed,float(i*8+6)))*2.0-1.0, h1(vec2(seed,float(i*8+7)))*2.0-1.0);
  return c;
}
vec4 evalRule(float seed, float mut, float cohort, vec4 sig){
  float ms = h1(vec2(seed*1.7+3.1, cohort*2.3+0.7)) + cohort;
  vec4 res = vec4(0.0);
  for(int i=0;i<10;i++){
    Center c = genCenter(seed, i);
    c.a += mut * (-1.0 + 2.0*h4(-0.5 + vec2(-float(i)+ms, float(i))));
    c.f *= 1.0 + mut*0.5*(h1(vec2(ms,float(i)))-0.5);
    float phase = dot(sig, c.f);
    float off = 2.0*float(i)*0.6283 + c.a.w*3.14159;
    vec4 basis = vec4(sin(phase + off), cos(phase + off*0.7), sin(phase*2.0 + off*1.3), cos(phase*2.0 + off*0.5));
    res += c.a*basis;
  }
  return res;
}
void rot(inout vec2 p, float a){ p = cos(a)*p + sin(a)*vec2(p.y,-p.x); }
vec2 snorm(vec2 p){ return length(p)==0.0 ? vec2(0.0) : normalize(p); }
vec4 sampleField(vec2 p){ return texture(u_canvas, p*0.5 + 0.5); }
float cohortOf(int idx){ return float(u_cohorts)*float(idx)/float(max(u_count,1)); }
vec3 hsv2rgb(vec3 c){ vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0); vec3 p = abs(fract(c.xxx + K.xyz)*6.0 - K.www); return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y); }
void main(){
  int idx = gl_VertexID;
  if(idx >= u_count){ gl_Position = vec4(2.0, 2.0, 0.0, 1.0); return; }
  ivec2 tc = ivec2(idx % u_texW, idx / u_texW);
  vec4 e = texelFetch(u_entity, tc, 0);
  vec2 pos = e.xy, vel = e.zw;
  float cohort = cohortOf(idx);
  float sd = 0.005 * u_sensor_distance;
  vec2 head = snorm(vel);
  vec2 lo = head*sd, ro = head*sd;
  rot(lo,  u_sensor_angle*PI); rot(ro, -u_sensor_angle*PI);
  float gain = 38.855 * u_sensor_gain;
  vec2 L = sampleField(pos+lo).xy * gain;
  vec2 R = sampleField(pos+ro).xy * gain;
  vec2 fwd = snorm(vel);
  vec2 lft = vec2(fwd.y, -fwd.x);
  vec2 Ll = vec2(dot(L,fwd), dot(L,lft));
  vec2 Rl = vec2(dot(R,fwd), dot(R,lft));
  vec4 raw = evalRule(u_rule_seed, u_mutation_scale, floor(cohort), vec4(Ll, Rl));
  float hue = fract(atan(raw.y, raw.x)/(2.0*PI) + 0.5);
  float mag = clamp(length(raw.xy)*0.55, 0.06, 1.1);
  v_color = hsv2rgb(vec3(hue, 0.85, mag));
  gl_Position = vec4(pos, 0.0, 1.0);
  gl_PointSize = u_point_size;
}`;

const FRAG_PARTICLES = `#version 300 es
precision highp float;
in vec3 v_color;
out vec4 outColor;
void main(){
  vec2 d = gl_PointCoord - 0.5;
  float r2 = dot(d, d);
  if(r2 > 0.25) discard;
  float a = exp(-r2 * 14.0);
  outColor = vec4(v_color * a, a);
}`;

export class FluoddityEngine {
  constructor(dim = 384, count = 40000, opts = {}) {
    this.arena = !!opts.arena;
    const cv = document.createElement('canvas');
    cv.width = cv.height = dim;
    const gl = cv.getContext('webgl2', { antialias: false, alpha: false, depth: true, preserveDrawingBuffer: true });
    if (!gl) throw new Error('WebGL2 unavailable');
    if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('EXT_color_buffer_float unavailable');
    gl.getExtension('EXT_float_blend');
    const lin = gl.getExtension('OES_texture_float_linear');
    const FILT = lin ? gl.LINEAR : gl.NEAREST;

    this.cv = cv; this.gl = gl; this.dim = dim; this.count = count;
    this.texW = Math.ceil(Math.sqrt(count));
    this.texH = Math.ceil(count / this.texW);
    this.brushSize = 0.0015 * (1024 / dim) * 2.0;
    // Substrate scale: a multiplier on the deposit splat size, i.e. on field
    // density (energy ∝ count·brushSize²). The genome is NOT scale-invariant —
    // (dim, count, brush) form a hidden "substrate" axis — so exposing this lets
    // surfaces match each other's energy and lets a slider explore hotter/cooler
    // renders of the same rule. setSubstrate(1) keeps the legacy brush.
    this._baseBrush = this.brushSize;
    this.substrate = 1;
    this.cfg = defaultConfig();
    this.frame = 0;
    this.currentKey = null;
    this.displayMode = 'trail'; // 'trail' (default) or 'particles' (aphid91-style raw-brain render)

    const compile = (type, src) => {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('shader: ' + gl.getShaderInfoLog(s));
      return s;
    };
    const prog = (vs, fs) => {
      const p = gl.createProgram();
      gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
      gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p));
      return p;
    };
    this.pEntity = prog(VERT_FULLSCREEN, this.arena ? FRAG_ENTITY_ARENA : FRAG_ENTITY);
    this.pBrush = prog(this.arena ? VERT_BRUSH_ARENA : VERT_BRUSH, this.arena ? FRAG_BRUSH_ARENA : FRAG_BRUSH);
    this.pCanvas = prog(VERT_FULLSCREEN, this.arena ? FRAG_CANVAS_ARENA : FRAG_CANVAS);
    this.pDisplay = prog(VERT_FULLSCREEN, this.arena ? FRAG_DISPLAY_ARENA : FRAG_DISPLAY);
    // Particle program is opt-in (engine.displayMode='particles'). If compilation
    // fails, we silently leave it unavailable so the engine still constructs and
    // the trail render keeps working for every existing surface.
    try { this.pParticles = prog(VERT_PARTICLES, FRAG_PARTICLES); }
    catch (e) { this.pParticles = null; this._particleError = e.message || String(e); }

    const floatTex = (w, h, filt) => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filt);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filt);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindTexture(gl.TEXTURE_2D, null);
      return t;
    };
    const fbo = (tex) => {
      const f = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return f;
    };
    this.eTex = [floatTex(this.texW, this.texH, gl.NEAREST), floatTex(this.texW, this.texH, gl.NEAREST)];
    this.eFBO = [fbo(this.eTex[0]), fbo(this.eTex[1])];
    this.ePing = 0;
    this.cTex = [floatTex(dim, dim, FILT), floatTex(dim, dim, FILT)];
    this.cFBO = [fbo(this.cTex[0]), fbo(this.cTex[1])];
    this.cPing = 0;
    this.brushTex = floatTex(dim, dim, FILT);
    this.brushFBO = fbo(this.brushTex);

    this.triBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.triBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

    this.brushVAO = gl.createVertexArray();
    gl.bindVertexArray(this.brushVAO);
    const bb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, bb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 0, 0, 1, -1, 1, 0, -1, 1, 0, 1, 1, 1, 1, 1]), gl.STATIC_DRAW);
    const ol = gl.getAttribLocation(this.pBrush, 'a_offset');
    const ul = gl.getAttribLocation(this.pBrush, 'a_uv');
    gl.enableVertexAttribArray(ol); gl.vertexAttribPointer(ol, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(ul); gl.vertexAttribPointer(ul, 2, gl.FLOAT, false, 16, 8);
    gl.bindVertexArray(null);
  }

  _tri(prog) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.triBuf);
    const loc = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  }

  load(config, key) {
    this.cfg = Object.assign(defaultConfig(), config || {});
    this.cfg.cohorts |= 0; this.cfg.initial_conditions |= 0;
    this.frame = 0;
    this.currentKey = key || null;
  }

  // Field-density multiplier. The deposit splat is the dominant energy lever:
  // sensed field ∝ count·brushSize², so scaling the brush scales how hard agents
  // are driven. Live (no rebuild) — takes effect on the next deposit.
  setSubstrate(s) {
    this.substrate = s > 0 ? s : 1;
    this.brushSize = this._baseBrush * this.substrate;
  }

  _setEntityUniforms() {
    const gl = this.gl, p = this.pEntity, c = this.cfg;
    const u = (n) => gl.getUniformLocation(p, n);
    gl.uniform1i(u('u_frame'), this.frame);
    gl.uniform1i(u('u_count'), this.count);
    gl.uniform1i(u('u_texW'), this.texW);
    gl.uniform1i(u('u_init'), c.initial_conditions | 0);
    gl.uniform1i(u('u_cohorts'), c.cohorts | 0);
    gl.uniform1f(u('u_rule_seed'), c.rule_seed);
    gl.uniform1f(u('u_sensor_gain'), c.sensor_gain);
    gl.uniform1f(u('u_sensor_angle'), c.sensor_angle);
    gl.uniform1f(u('u_sensor_distance'), c.sensor_distance);
    gl.uniform1f(u('u_mutation_scale'), c.mutation_scale);
    gl.uniform1f(u('u_global_force_mult'), c.global_force_mult);
    gl.uniform1f(u('u_drag'), c.drag);
    gl.uniform1f(u('u_strafe_power'), c.strafe_power);
    gl.uniform1f(u('u_axial_force'), c.axial_force);
    gl.uniform1f(u('u_lateral_force'), c.lateral_force);
    gl.uniform1f(u('u_hazard_rate'), c.hazard_rate);
  }

  step(n = 1) {
    const gl = this.gl, c = this.dim;
    for (let i = 0; i < n; i++) {
      // move
      const r = this.ePing, w = 1 - r;
      gl.useProgram(this.pEntity);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.eFBO[w]);
      gl.viewport(0, 0, this.texW, this.texH);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.eTex[r]); gl.uniform1i(gl.getUniformLocation(this.pEntity, 'u_entity'), 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.cTex[this.cPing]); gl.uniform1i(gl.getUniformLocation(this.pEntity, 'u_canvas'), 1);
      this._setEntityUniforms();
      this._tri(this.pEntity);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      this.ePing = w;
      // deposit
      gl.useProgram(this.pBrush);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.brushFBO);
      gl.viewport(0, 0, c, c);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.eTex[this.ePing]); gl.uniform1i(gl.getUniformLocation(this.pBrush, 'u_entity'), 0);
      gl.uniform1i(gl.getUniformLocation(this.pBrush, 'u_texW'), this.texW);
      gl.uniform1f(gl.getUniformLocation(this.pBrush, 'u_size'), this.brushSize);
      gl.uniform1i(gl.getUniformLocation(this.pBrush, 'u_cohorts'), this.cfg.cohorts | 0); // arena only; no-op otherwise
      gl.uniform1i(gl.getUniformLocation(this.pBrush, 'u_count'), this.count);
      gl.bindVertexArray(this.brushVAO);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.count);
      gl.bindVertexArray(null);
      gl.disable(gl.BLEND);
      // diffuse
      const cr = this.cPing, cw = 1 - cr;
      gl.useProgram(this.pCanvas);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.cFBO[cw]);
      gl.viewport(0, 0, c, c);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.brushTex); gl.uniform1i(gl.getUniformLocation(this.pCanvas, 'u_brush'), 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.cTex[cr]); gl.uniform1i(gl.getUniformLocation(this.pCanvas, 'u_canvas'), 1);
      gl.uniform1i(gl.getUniformLocation(this.pCanvas, 'u_frame'), this.frame);
      gl.uniform1f(gl.getUniformLocation(this.pCanvas, 'u_persistence'), this.cfg.trail_persistence);
      gl.uniform1f(gl.getUniformLocation(this.pCanvas, 'u_diffusion'), this.cfg.trail_diffusion);
      this._tri(this.pCanvas);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      this.cPing = cw;
      this.frame++;
    }
  }

  render() {
    if (this.displayMode === 'particles' && this.pParticles) return this._renderParticles();
    const gl = this.gl;
    gl.useProgram(this.pDisplay);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.dim, this.dim);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.cTex[this.cPing]); gl.uniform1i(gl.getUniformLocation(this.pDisplay, 'u_canvas'), 0);
    gl.uniform1f(gl.getUniformLocation(this.pDisplay, 'u_ink'), this.cfg.ink);
    gl.uniform1f(gl.getUniformLocation(this.pDisplay, 'u_hue'), this.cfg.hue);
    this._tri(this.pDisplay);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  _renderParticles() {
    const gl = this.gl, p = this.pParticles, c = this.cfg;
    gl.useProgram(p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.cv.width, this.cv.height);
    gl.disable(gl.DEPTH_TEST);
    gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.eTex[this.ePing]); gl.uniform1i(gl.getUniformLocation(p, 'u_entity'), 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.cTex[this.cPing]); gl.uniform1i(gl.getUniformLocation(p, 'u_canvas'), 1);
    gl.uniform1i(gl.getUniformLocation(p, 'u_texW'), this.texW);
    gl.uniform1i(gl.getUniformLocation(p, 'u_count'), this.count);
    gl.uniform1i(gl.getUniformLocation(p, 'u_cohorts'), c.cohorts | 0);
    gl.uniform1f(gl.getUniformLocation(p, 'u_rule_seed'), c.rule_seed);
    gl.uniform1f(gl.getUniformLocation(p, 'u_sensor_gain'), c.sensor_gain);
    gl.uniform1f(gl.getUniformLocation(p, 'u_sensor_angle'), c.sensor_angle);
    gl.uniform1f(gl.getUniformLocation(p, 'u_sensor_distance'), c.sensor_distance);
    gl.uniform1f(gl.getUniformLocation(p, 'u_mutation_scale'), c.mutation_scale);
    gl.uniform1f(gl.getUniformLocation(p, 'u_point_size'), Math.max(1.5, 1.8 * (this.cv.width / 480)));
    gl.drawArrays(gl.POINTS, 0, this.count);
    gl.disable(gl.BLEND);
  }
}
