// ─────────────────────────────────────────────────────────────────────────────
// sticks.js — the yarrow stick engine (pure, deterministic, no DOM, no storage).
//
// A reaped plant yields a handful of stick GENOMES — immutable traits fixed at
// the moment of reaping. Everything that happens afterwards (drying, warping,
// checking, spoiling, grading) is computed LIVE as a pure function of
//   (genome, elapsed real time since reapedAt, the tends you've applied).
// No polling, no server tick, no repeated writes: a stick's present condition is
// cure(stick, Date.now()). Store the genome once; recompute state forever.
//
// Demo timescale: a stick cures in ~seconds here (CURE_MS). The whole model is
// time-scale-free — raise CURE_MS/SEASON_MS to days for the meditative build.
//
// Shared by /yarrow (reap → loft), /sticks (the drying loft + gallery), and
// later /yijing (cast a set of cured sticks). Attaches to globalThis so it
// unit-tests in plain node.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

export const STICK_VERSION = 1;

// ── timescale (DEMO: seconds). Bump these for the slow, seasonal build. ──
export const CURE_MS   = 25000;   // green → cured
export const SEASON_MS = 90000;   // cured → seasoned (if well-tended & true)
export const TEND_COOLDOWN_MS = 1500;
export const TEND_MAX = 5;        // tends past this do nothing

// ── deterministic noise ──
function xmur3(str){let h=1779033703^str.length;for(let i=0;i<str.length;i++){
  h=Math.imul(h^str.charCodeAt(i),3432918353);h=h<<13|h>>>19;}
  return()=>{h=Math.imul(h^h>>>16,2246822507);h=Math.imul(h^h>>>13,3266489909);return(h^=h>>>16)>>>0;};}
function mulberry32(a){return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);
  t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const clamp01 = x => x<0?0:x>1?1:x;
const smooth  = (lo,hi,x)=>{ const t=clamp01((x-lo)/(hi-lo||1e-9)); return t*t*(3-2*t); };
const bandScore=(x,lo,hi,soft)=>{ if(x>=lo&&x<=hi)return 1; const d=x<lo?lo-x:x-hi; return clamp01(1-d/soft); };

// ── tiers (cured-grade → name) ──
const TIERS=[
  [83,'Temple grade'],[70,"Diviner's grade"],[57,'Serviceable'],[43,'Common'],[0,'Kindling'],
];
export function tierFor(score){ for(const[t,n] of TIERS) if(score>=t) return n; }

const SPOIL_NAMES = { checked:'Checked', warped:'Warped', mouldy:'Mouldy' };

// ─────────────────────────────────────────────────────────────────────────────
// reapPlant(spec, reapedAt) → [genome, …]
// `spec` is a yarrow specimen (from yarrow's grow()). One main stalk + each
// primary branch becomes a stick. Genome traits are deterministic from the
// parent seed + the stick's position, so a plant always reaps the same bundle.
// ─────────────────────────────────────────────────────────────────────────────
export function reapPlant(spec, reapedAt){
  reapedAt = (reapedAt==null) ? Date.now() : reapedAt;
  const out=[];
  for(let pos=0; pos<=spec.branchCount; pos++){
    const main = pos===0;
    const r = mulberry32(xmur3('stick:'+spec.seedStr+':'+pos)());
    const curveMag = Math.abs(spec.curve);
    const lenCm = main ? spec.heightCm : +(spec.heightCm*(0.26+0.20*r())).toFixed(1);
    const diaMm = +((main?2.7:1.7) + r()*0.8 + spec.furrows*0.12).toFixed(2);
    const straightness0 = clamp01(0.94 - curveMag*5 - r()*0.34 + (main?0.13:-0.04));
    const stiffnessPotential = clamp01((diaMm-1.4)/2*0.55 + (spec.furrows-2)/2*0.22
                                        + Math.min(lenCm/55,1)*0.30 + (main?0.05:0));
    const dryRate = +(0.55 + r()*0.85).toFixed(2);              // fast dryers warp & check more
    const warpTendency = clamp01(r()*0.42 + curveMag*1.2 - (main?0.14:0));
    const thin = clamp01((2.2-diaMm)/1.2);
    const crackRisk = clamp01(r()*0.46 + thin*0.32 + (dryRate>1.25?0.10:0));
    const colourPath = r()<0.62?'straw':(r()<0.6?'gold':'red');  // the colour it dries toward
    const nodes = Math.max(2, Math.round(lenCm/8));
    const grainSeed = (r()*1e9)|0;
    out.push({
      version:STICK_VERSION, id:spec.seedStr+'-'+pos,
      parentSeed:spec.seed, seedStr:spec.seedStr, pos, main,
      lenCm, diaMm, straightness0, stiffnessPotential,
      dryRate, warpTendency, crackRisk, colourPath, nodes, grainSeed,
      reapedAt, tends:[],
    });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// cure(stick, now) → live condition. Pure: same inputs → same output.
// ─────────────────────────────────────────────────────────────────────────────
export function cure(stick, now){
  now = (now==null) ? Date.now() : now;
  const age = Math.max(0, now - stick.reapedAt);
  const p   = clamp01(age / CURE_MS);                  // drying progress 0..1
  const tends = stick.tends || [];

  // tending relief: turning the bundle mid-cure evens the drying. Tending too
  // early (still green) or too late (already set) does little; diminishing returns.
  let relief = 0;
  tends.slice(0, TEND_MAX).forEach((t,i)=>{
    const tp = clamp01((t - stick.reapedAt)/CURE_MS);
    const timing = tp<0.06 ? 0.35 : tp<0.78 ? 1 : 0.3;
    relief += 0.09 * Math.pow(0.78,i) * timing;
  });
  relief = Math.min(relief, 0.34);

  const moisture   = 1 - p;
  const warp       = clamp01(stick.warpTendency * p * (0.40 + stick.dryRate*0.38) - relief);
  const check      = clamp01(stick.crackRisk * (0.58 + stick.dryRate*0.48) * smooth(0.35,1,p) - relief*0.9);
  const straightness = clamp01(stick.straightness0 - warp);
  const stiffness    = clamp01(stick.stiffnessPotential * smooth(0,0.85,p));

  // ── real stakes: a stick can spoil past mid-cure ──
  let spoiled = null;
  if      (p>0.55 && check > 0.60)        spoiled = 'checked';   // dried too fast, split
  else if (p>0.72 && straightness < 0.20) spoiled = 'warped';    // bent past use

  const seasoned = !spoiled && age>=SEASON_MS && relief>0.12 && straightness>0.6;
  const stage = spoiled ? spoiled
              : p<0.12   ? 'green'
              : p<0.9    ? 'curing'
              : seasoned ? 'seasoned' : 'cured';

  // ── grade (only meaningful once cured) ──
  const lenFit = bandScore(stick.lenCm,25,55,22);
  let q = clamp01(straightness*0.40 + stiffness*0.35 + lenFit*0.25);
  if (seasoned) q = clamp01(q + 0.06);
  const grade = spoiled ? 0 : Math.round(q*100);

  const castable = !spoiled && p >= 0.9;
  const risk = spoiled ? null
    : (check>0.45 || warp>0.45)
      ? (check>warp ? 'checking — turn it before it splits' : 'bowing — turn it to straighten')
      : null;

  return {
    age, p, moisture, warp, check, straightness, stiffness,
    stage, spoiled, spoilName: spoiled?SPOIL_NAMES[spoiled]:null, seasoned,
    grade, tier: spoiled ? 'Cull' : tierFor(grade), castable, risk,
    timeToCure: Math.max(0, CURE_MS - age),
  };
}

// can this stick accept a tend right now? (cooldown + cap + not spoiled/dry-set)
export function canTend(stick, now){
  now = (now==null) ? Date.now() : now;
  const st = cure(stick, now);
  if (st.spoiled || st.p >= 0.95) return false;
  const tends = stick.tends || [];
  if (tends.length >= TEND_MAX) return false;
  const last = tends.length ? tends[tends.length-1] : -Infinity;
  return now - last >= TEND_COOLDOWN_MS;
}

// returns a NEW genome with the tend appended (immutable update)
export function tend(stick, now){
  now = (now==null) ? Date.now() : now;
  if (!canTend(stick, now)) return stick;
  return { ...stick, tends:[...(stick.tends||[]), now] };
}

// grade a whole bundle/inventory of cured sticks → the divination-set summary
export function gradeSet(sticks, now){
  now = (now==null) ? Date.now() : now;
  const states = sticks.map(s=>cure(s, now));
  const castable = states.filter(s=>s.castable);
  const spoiled  = states.filter(s=>s.spoiled);
  const avg = castable.length ? Math.round(castable.reduce((a,s)=>a+s.grade,0)/castable.length) : 0;
  return {
    total: sticks.length, castable: castable.length, spoiled: spoiled.length,
    curing: states.filter(s=>!s.spoiled && !s.castable).length,
    needed: 50, avgGrade: avg, tier: tierFor(avg),
    ready: castable.length >= 50,
  };
}

// ── make the engine testable in plain node ──
if (typeof globalThis !== 'undefined') {
  globalThis.STICKS = { reapPlant, cure, canTend, tend, gradeSet, tierFor,
    CURE_MS, SEASON_MS, TEND_COOLDOWN_MS, TEND_MAX, STICK_VERSION };
}
