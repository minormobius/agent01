// author-levels.mjs — generate + VERIFY assembly-puzzle levels against the real
// engine, then emit splice/game/levels.js. Run from splice/engine.
//
// Each level: a circular vector + a linear insert + an enzyme palette. The
// "solution" enzymes are run through the engine to produce the target plasmid;
// the game later grades any player attempt by circular-equality to that target.
import { readFileSync, writeFileSync } from 'node:fs';

const wasm = readFileSync('../lab/splice_engine.wasm');
const ex = new WebAssembly.Instance(new WebAssembly.Module(wasm), {}).exports;
const mem = () => new Uint8Array(ex.memory.buffer);
const enc = new TextEncoder(), dec = new TextDecoder();
function call(fn, s){ const b=enc.encode(s); const p=ex.walloc(b.length||1); mem().set(b,p);
  const big=BigInt.asUintN(64, ex[fn](p,b.length)); const op=Number(big>>32n), ol=Number(big&0xffffffffn);
  const r=dec.decode(mem().slice(op,op+ol)); ex.wfree(op,ol); ex.wfree(p,b.length||1); return r; }
const clone = (v,i,enz,vc,ic)=>JSON.parse(call('clone_w',`${vc?1:0}|${ic?1:0}|${enz.join(',')}|${v}|${i}`));
const restr = (s,c)=>JSON.parse(call('restriction_w',`${c?1:0}|${s}`));

const SITES = { EcoRI:'GAATTC', BamHI:'GGATCC', HindIII:'AAGCTT', SalI:'GTCGAC', XhoI:'CTCGAG', SpeI:'ACTAGT', KpnI:'GGTACC', PstI:'CTGCAG' };

function rng(seed){ let s=seed>>>0||1; return ()=>{ s^=s<<13; s^=s>>>17; s^=s<<5; return s>>>0; }; }
function randSeq(n,r){ let s=''; for(let i=0;i<n;i++) s+='ACGT'[r()%4]; return s; }
const hasAny = (seq,sites)=>sites.some(x=>seq.includes(x));

// a spacer free of every listed site
function spacer(n, banned, seed){
  for(let k=0;k<2000;k++){ const s=randSeq(n,rng(seed+k*9173)); if(!hasAny(s,banned)) return s; }
  throw new Error('spacer gen failed');
}

const ALL = Object.values(SITES);

// ---- shared vector: a small plasmid with a clean MCS (EcoRI-BamHI-SalI-HindIII) ----
function buildVector(seed){
  const ban = ALL;
  for(let attempt=0; attempt<200; attempt++){
    const sd = seed + attempt*1000003;
    const v = spacer(140, ban, sd)
      + SITES.EcoRI + spacer(90, ban, sd+1)
      + SITES.BamHI + spacer(120, ban, sd+2)
      + SITES.SalI  + spacer(90, ban, sd+3)
      + SITES.HindIII + spacer(160, ban, sd+4);
    const r = restr(v, true);
    const cnt = name => r.enzymes.find(e=>e.name===name).count;
    if(['EcoRI','BamHI','SalI','HindIII'].every(n=>cnt(n)===1)
       && ['XhoI','SpeI','KpnI','PstI'].every(n=>cnt(n)===0))
      return v;
  }
  throw new Error('vector gen failed');
}

// payload clean of `ban`; optionally force-contains `must` site in the middle
function buildPayload(len, ban, seed, must){
  for(let k=0;k<3000;k++){
    let s = randSeq(len, rng(seed + k*7919));
    if(must){ const mid=(len/2)|0; s = s.slice(0,mid) + must + s.slice(mid); }
    if(!hasAny(s, ban)) {
      // if must, re-check excludes must from ban
      return s;
    }
  }
  throw new Error('payload gen failed');
}

const vector = buildVector(12345);
console.error('vector:', vector.length, 'bp');

// ---- levels ----
const levels = [];

// L1: straightforward directional clone (EcoRI + HindIII)
{
  const pay = buildPayload(420, [SITES.EcoRI,SITES.HindIII,SITES.BamHI,SITES.SalI], 5551);
  const insert = 'AA'+SITES.EcoRI+pay+SITES.HindIII+'AA';
  const sol = clone(vector, insert, ['EcoRI','HindIII'], true, false);
  if(sol.products.length!==1) throw new Error('L1 solution not single product');
  levels.push({
    id:'L1', title:'Your first clone',
    brief:'Insert the gene into the vector. Pick the two enzymes that cut the vector’s MCS and flank the insert, so the gene goes in one way only (directional).',
    vector, insert, palette:['EcoRI','BamHI','SalI','HindIII'],
    goalType:'directional', target:sol.products[0].seq, par:2,
    hint:'The insert is flanked by EcoRI and HindIII. Use both.',
  });
  console.error('L1 target:', sol.products[0].length, 'bp');
}

// L2: an internal cutter trap — BamHI sits INSIDE the gene
{
  const pay = buildPayload(380, [SITES.EcoRI,SITES.HindIII,SITES.SalI], 8861, SITES.BamHI);
  const insert = 'AA'+SITES.EcoRI+pay+SITES.HindIII+'AA';
  // sanity: BamHI cuts the insert internally
  const ins_r = restr(insert, false);
  if(ins_r.enzymes.find(e=>e.name==='BamHI').count<1) throw new Error('L2 needs internal BamHI');
  const sol = clone(vector, insert, ['EcoRI','HindIII'], true, false);
  // trap: using BamHI fragments the gene -> should NOT equal target
  const trap = clone(vector, insert, ['BamHI','HindIII'], true, false);
  const trapWins = trap.products.some(p=>p.seq.length===sol.products[0].seq.length);
  if(sol.products.length!==1) throw new Error('L2 sol bad');
  levels.push({
    id:'L2', title:'Mind the gene',
    brief:'Same job — but one of the MCS enzymes also cuts INSIDE the gene, which would shred it. Find the pair that flanks the insert without cutting the payload.',
    vector, insert, palette:['EcoRI','BamHI','SalI','HindIII'],
    goalType:'directional', target:sol.products[0].seq, par:2,
    hint:'Scan the insert: an enzyme with a site in the middle of the gene is a trap.',
  });
  console.error('L2 target:', sol.products[0].length,'bp · BamHI-trap distinct:', !trapWins);
}

// L3: bigger palette, only one valid flank pair (EcoRI + SalI)
{
  const pay = buildPayload(300, [SITES.EcoRI,SITES.SalI,SITES.HindIII,SITES.BamHI], 2027);
  const insert = 'AA'+SITES.EcoRI+pay+SITES.SalI+'AA';
  const sol = clone(vector, insert, ['EcoRI','SalI'], true, false);
  if(sol.products.length!==1) throw new Error('L3 sol bad');
  levels.push({
    id:'L3', title:'Pick from the panel',
    brief:'The bench has more enzymes now. The insert is flanked by a different pair. Find the two that flank the insert AND each cut the vector exactly once.',
    vector, insert, palette:['EcoRI','BamHI','SalI','HindIII','XhoI','SpeI'],
    goalType:'directional', target:sol.products[0].seq, par:2,
    hint:'Only EcoRI and SalI flank this insert.',
  });
  console.error('L3 target:', sol.products[0].length,'bp');
}

const out = `// AUTO-GENERATED by splice/engine/author-levels.mjs — do not edit by hand.\n`
  + `// Each level's target plasmid was produced and verified by the engine.\n`
  + `window.LEVELS = ${JSON.stringify(levels)};\n`;
writeFileSync('../game/levels.js', out);
console.error('wrote ../game/levels.js with', levels.length, 'levels,', out.length, 'bytes');
