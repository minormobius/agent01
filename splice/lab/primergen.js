// primergen.js — procedural generator for primer-design puzzles.
//
// A puzzle gives the player a DNA template and a region to amplify. The player
// adjusts two primer windows (forward grows right from the region's left edge;
// reverse grows left from the right edge, taken as reverse-complement). Win =
// both primers amplify, both Tm within tol of target, |dTm| small, score ok.
//
// The generator VERIFIES solvability by running the engine's own designer
// (op_design) on the region — if the designer can't find a passing pair, the
// level is rejected. So every generated puzzle has at least one engine-proven
// solution, and the game grades against the SAME scorer (score_w) the lab uses.
//
//   const level = generatePrimerLevel(api, { difficulty, seed });
// api = {
//   design: (template,start,end,targetTm,{naMm,dnaNm,minLen,maxLen}) => result,
//   score:  (seq, targetTm, naMm, dnaNm) => primerMetrics,
//   pcr:    (template, fwd, rev, circular) => pcrResult,
// }

function mulberry32(a){ return function(){ a|=0; a=a+0x6D2B79F5|0;
  let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }

// build a template region with a controllable GC skew so the two ends differ
function biasedSeq(n, gcBias, r){
  // gcBias in [0,1]: probability of G/C at each position
  let s='';
  for(let i=0;i<n;i++){
    if(r() < gcBias) s += (r()<0.5?'G':'C');
    else             s += (r()<0.5?'A':'T');
  }
  return s;
}

const DIFFS = {
  1: { region:[180,260], tol:4.0, dTmMax:4.0, flankGcEqual:true,  targetTm:60 },
  2: { region:[200,320], tol:3.0, dTmMax:3.0, flankGcEqual:false, targetTm:60 },
  3: { region:[240,420], tol:2.0, dTmMax:2.0, flankGcEqual:false, targetTm:62 },
};

export function generatePrimerLevel(api, { difficulty = 1, seed } = {}){
  const cfg = DIFFS[difficulty] || DIFFS[1];
  const base = (seed != null ? seed : (Math.random()*1e9)|0) >>> 0;

  for(let attempt=0; attempt<120; attempt++){
    const r = mulberry32((base + attempt*2654435761) >>> 0);
    const regLen = cfg.region[0] + Math.floor(r()*(cfg.region[1]-cfg.region[0]));
    // flank GC: difficulty>1 gives the two ends DIFFERENT GC so you can't tune
    // both primers the same way — the cross-constraint that makes it a puzzle.
    const leftGc  = cfg.flankGcEqual ? 0.5 : 0.40 + r()*0.10;
    const rightGc = cfg.flankGcEqual ? 0.5 : 0.58 + r()*0.12;
    const flank = 40;
    const template =
      biasedSeq(flank, 0.5, r) +          // 5' pad
      biasedSeq(40, leftGc, r) +          // forward-primer landing zone
      biasedSeq(regLen-80, 0.5, r) +      // middle
      biasedSeq(40, rightGc, r) +         // reverse-primer landing zone
      biasedSeq(flank, 0.5, r);           // 3' pad
    const start = flank, end = flank + regLen;

    // engine must be able to design a passing pair here
    const d = api.design(template, start, end, cfg.targetTm, { minLen:18, maxLen:30 }).value || api.design(template, start, end, cfg.targetTm, { minLen:18, maxLen:30 });
    const des = d.value || d;
    if(des.error || !des.fwd || !des.rev) continue;
    const okTm = Math.abs(des.fwd.tm-cfg.targetTm) <= cfg.tol
              && Math.abs(des.rev.tm-cfg.targetTm) <= cfg.tol
              && des.deltaTm <= cfg.dTmMax;
    if(!okTm) continue;
    // confirm the engine's own solution amplifies (sanity)
    const pcr = api.pcr(template, des.fwd.seq, des.rev.seq, false);
    const pv = pcr.value || pcr;
    if(!pv.products || !pv.products.length) continue;

    return {
      generated:true, difficulty,
      title: ['', 'Primer · easy', 'Primer · medium', 'Primer · hard'][difficulty],
      template, start, end,
      targetTm: cfg.targetTm, tol: cfg.tol, dTmMax: cfg.dTmMax,
      minLen:18, maxLen:30,
      // the engine's reference solution (for hint / par scoring), not shown unless asked
      solution: { fwdLen: des.fwd.len, revLen: des.rev.len,
                  fwdTm: des.fwd.tm, revTm: des.rev.tm, pairScore: des.pairScore },
      brief: `Design primers to amplify the ${end-start} bp region. Slide each primer's 3' length so both melt near ${cfg.targetTm} °C (±${cfg.tol}) and their Tms match within ${cfg.dTmMax} °C — but the two ends have different GC, so you can't tune them the same way.`,
    };
  }
  throw new Error('primer level generation failed');
}
