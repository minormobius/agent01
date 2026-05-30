// levelgen.js — in-browser procedural generator for assembly-puzzle levels.
//
// Generates a circular vector + linear insert + enzyme palette, then VERIFIES
// against the real engine that exactly one enzyme choice produces the target
// recombinant (a unique directional clone). Difficulty adds distractors the
// engine certifies: decoy single-cutters in the vector, and internal cutters
// hidden inside the gene. The same generate-then-verify discipline as
// author-levels.mjs, but run live.
//
//   const level = generateLevel(api, { difficulty: 2, seed });
// where api = {
//   clone:       (vector, insert, enzymes[], vCirc, iCirc) => parsedCloneResult,
//   restriction: (seq, circular) => parsedRestrictionResult,
// }

const COMP = { A:'T', T:'A', G:'C', C:'G' };
const comp = s => s.split('').map(b => COMP[b] || 'N').join('');
const revcomp = s => s.split('').reverse().map(b => COMP[b] || 'N').join('');

function mulberry32(a){ return function(){ a|=0; a=a+0x6D2B79F5|0;
  let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
const randSeq = (n,r) => { let s=''; for(let i=0;i<n;i++) s+='ACGT'[(r()*4)|0]; return s; };
const shuffle = (arr,r) => { const a=arr.slice(); for(let i=a.length-1;i>0;i--){ const j=(r()*(i+1))|0; [a[i],a[j]]=[a[j],a[i]]; } return a; };
const hasAny = (seq,sites) => sites.some(x => x && seq.includes(x));

// circular equality (a molecule and its reverse-complement are the same plasmid)
function circEqual(a,b){ if(a.length!==b.length) return false;
  if((a+a).includes(b)) return true; if((a+a).includes(revcomp(b))) return true; return false; }

// pull the engine's enzyme catalog (name -> site/overhang) from one scan
function catalog(api){
  const r = api.restriction('GAATTC', false);
  const m = {};
  for(const e of r.enzymes){
    m[e.name] = { name:e.name, site:e.site, type:e.overhangType, ov:e.overhang,
                  blunt:e.blunt, fam: (e.blunt?'blunt':e.overhangType)+':'+e.overhang, len:e.site.length };
  }
  return m;
}

const DIFFS = {
  1: { palette:4, internalDecoys:0, vectorDecoys:0, payMin:300, payMax:480 },
  2: { palette:6, internalDecoys:1, vectorDecoys:1, payMin:340, payMax:560 },
  3: { palette:8, internalDecoys:2, vectorDecoys:1, payMin:380, payMax:680 },
};

// clean, well-behaved 6-bp sticky cutters to draw flanks/decoys from
const PREFERRED = ['EcoRI','BamHI','HindIII','SalI','XhoI','PstI','KpnI','SacI',
  'NheI','SpeI','XbaI','AvrII','NcoI','NdeI','SphI','MluI','AgeI','BspEI','BglII',
  'AflII','ClaI','AatII'];

export function generateLevel(api, { difficulty = 1, seed } = {}){
  const cfg = DIFFS[difficulty] || DIFFS[1];
  const cat = catalog(api);
  const usable = PREFERRED.filter(n => cat[n]);            // present in the engine
  const baseSeed = (seed != null ? seed : (Math.random()*1e9)|0) >>> 0;

  for(let attempt=0; attempt<80; attempt++){
    const r = mulberry32((baseSeed + attempt*2654435761) >>> 0);
    try {
      const lvl = tryBuild(api, cat, usable, cfg, r, difficulty);
      if(lvl) return lvl;
    } catch(_) { /* regenerate */ }
  }
  throw new Error('level generation failed');
}

function tryBuild(api, cat, usable, cfg, r, difficulty){
  const pool = shuffle(usable, r);
  // pick two flank enzymes with incompatible (different) overhang families -> directional
  let A=null, B=null;
  for(const n of pool){ if(!A){ A=n; continue; }
    if(cat[n].fam !== cat[A].fam){ B=n; break; } }
  if(!A || !B) return null;
  const aSite = cat[A].site, bSite = cat[B].site;

  const rest = pool.filter(n => n!==A && n!==B);
  const internalDecoys = rest.slice(0, cfg.internalDecoys);
  const vectorDecoys    = rest.slice(cfg.internalDecoys, cfg.internalDecoys + cfg.vectorDecoys);
  // pad palette with pure distractors (cut neither vector nor insert)
  const chosen = new Set([A, B, ...internalDecoys, ...vectorDecoys]);
  const fillers = rest.slice(cfg.internalDecoys + cfg.vectorDecoys)
                      .filter(n => !chosen.has(n));
  const palette = shuffle([...chosen, ...fillers].slice(0, cfg.palette), r);
  const paletteSites = palette.map(n => cat[n].site);

  // ---- insert: A.site | payload(+internal decoy sites) | B.site ----
  const payLen = cfg.payMin + ((r()*(cfg.payMax-cfg.payMin))|0);
  // payload must avoid A,B and every NON-internal-decoy palette site,
  // but intentionally contain the internal-decoy sites.
  const bannedInPay = paletteSites.filter(s => !internalDecoys.map(n=>cat[n].site).includes(s));
  let payload = cleanSeq(payLen, bannedInPay, r);
  for(const d of internalDecoys){
    const pos = 40 + ((r()*(payload.length-80))|0);
    payload = payload.slice(0,pos) + cat[d].site + payload.slice(pos);
  }
  const insert = 'CA' + aSite + payload + bSite + 'TG';

  // verify insert: A & B cut once at the flanks, internal decoys cut inside,
  // nothing else in the palette cuts the insert.
  const ir = api.restriction(insert, false);
  const icount = n => (ir.enzymes.find(e=>e.name===n)||{count:0}).count;
  if(icount(A)!==1 || icount(B)!==1) return null;
  for(const d of internalDecoys) if(icount(d) < 1) return null;
  for(const n of palette) if(n!==A && n!==B && !internalDecoys.includes(n) && icount(n)!==0) return null;

  // ---- vector: A + B single cutters, plus tempting vectorDecoy single cutters ----
  const inVector = [A, B, ...vectorDecoys];
  const vector = buildVector(api, cat, palette, inVector, r);
  if(!vector) return null;

  // ---- target + uniqueness: exactly one palette choice yields it ----
  const sol = api.clone(vector, insert, [A,B], true, false);
  if(sol.products.length !== 1) return null;
  const target = sol.products[0].seq;

  let solutions = 0;
  const test = enz => {
    const res = api.clone(vector, insert, enz, true, false);
    if(res.products.length===1 && circEqual(res.products[0].seq, target)) solutions++;
  };
  for(let i=0;i<palette.length;i++){
    test([palette[i]]);                                   // singles (non-directional)
    for(let j=i+1;j<palette.length;j++) test([palette[i],palette[j]]);
  }
  if(solutions !== 1) return null;                        // not a unique puzzle

  return {
    id: 'gen', generated:true, difficulty,
    title: ['', 'Random · easy', 'Random · medium', 'Random · hard'][difficulty],
    brief: 'A freshly generated construct. Find the enzyme pair that cuts the vector and flanks the insert to build the target plasmid — without shredding the gene.',
    vector, insert, palette, goalType:'directional', target, par:2,
    hint: `Two enzymes flank the insert and each cut the vector once. ${cfg.internalDecoys?'Watch for cutters hiding inside the gene.':''}`.trim(),
  };
}

// a sequence free of every banned site (palindromic sites: top-strand check suffices)
function cleanSeq(n, banned, r){
  for(let k=0;k<4000;k++){ const s=randSeq(n,r); if(!hasAny(s,banned)) return s; }
  throw new Error('cleanSeq failed');
}

// build a circular vector that single-cuts exactly the enzymes in `single`,
// and is cut zero times by every other palette enzyme.
function buildVector(api, cat, palette, single, r){
  const allSites = palette.map(n=>cat[n].site);
  for(let attempt=0; attempt<40; attempt++){
    let v = cleanSeq(120, allSites, r);
    for(const n of single){ v += cat[n].site + cleanSeq(70 + ((r()*60)|0), allSites, r); }
    const vr = api.restriction(v, true);
    const cnt = n => (vr.enzymes.find(e=>e.name===n)||{count:0}).count;
    const ok = single.every(n=>cnt(n)===1)
            && palette.filter(n=>!single.includes(n)).every(n=>cnt(n)===0);
    if(ok) return v;
  }
  return null;
}
