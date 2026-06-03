// buildgen.js — procedural levels for the "clone this gene into this organism"
// campaign. A level is: a goal (gene → vector, for an organism), the gene ORF,
// the target vector, and an enzyme palette that includes real TRAPS — enzymes
// that cut the vector once (tempting) but also cut inside the gene (which the
// gel verification step will expose by shattering the insert).
//
// Every level is VERIFIED against the engine: each MCS enzyme single-cuts the
// vector; the trap cuts inside the gene; and at least one clean enzyme pair
// yields a single directional clone.
//
//   const lvl = generateBuild(api, { difficulty, seed });
// api = { restriction(seq,circ)->res, clone(v,i,enz,vc,ic)->res }

const SITES = {
  EcoRI:'GAATTC', BamHI:'GGATCC', HindIII:'AAGCTT', SalI:'GTCGAC',
  XhoI:'CTCGAG', PstI:'CTGCAG', KpnI:'GGTACC', NheI:'GCTAGC',
};
const ALL_SITES = Object.values(SITES);

const ORGANISMS = [
  { name:'E. coli',          note:'the workhorse — fast, cheap, great for expression' },
  { name:'S. cerevisiae',    note:'budding yeast — for eukaryotic folding' },
  { name:'B. subtilis',      note:'secretes protein straight into the medium' },
  { name:'P. pastoris',      note:'methylotrophic yeast — high-density fermentation' },
];
const GENES = [
  { name:'GFP',  note:'green fluorescent protein — your cells will glow' },
  { name:'lacZ', note:'β-galactosidase — blue/white screening' },
  { name:'AmpR', note:'β-lactamase — ampicillin resistance' },
  { name:'mCherry', note:'a red fluorescent reporter' },
  { name:'CAT',  note:'chloramphenicol acetyltransferase' },
];

function mulberry32(a){ return function(){ a|=0; a=a+0x6D2B79F5|0;
  let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
const randSeq = (n,r)=>{ let s=''; for(let i=0;i<n;i++) s+='ACGT'[(r()*4)|0]; return s; };
const shuffle = (a,r)=>{ a=a.slice(); for(let i=a.length-1;i>0;i--){ const j=(r()*(i+1))|0; [a[i],a[j]]=[a[j],a[i]]; } return a; };
const hasAny = (s,sites)=>sites.some(x=>x&&s.includes(x));

function cleanSeq(n, banned, r){
  for(let k=0;k<5000;k++){ const s=randSeq(n,r); if(!hasAny(s,banned)) return s; }
  throw new Error('cleanSeq failed');
}

const DIFFS = {
  1: { mcs:4, traps:1, geneLen:[420,540] },
  2: { mcs:5, traps:1, geneLen:[480,660] },
  3: { mcs:6, traps:2, geneLen:[540,780] },
};

export function generateBuild(api, { difficulty = 1, seed } = {}){
  const cfg = DIFFS[difficulty] || DIFFS[1];
  const base = (seed != null ? seed : (Math.random()*1e9)|0) >>> 0;

  for(let attempt=0; attempt<100; attempt++){
    const r = mulberry32((base + attempt*2654435761) >>> 0);
    try {
      const lvl = tryBuild(api, cfg, r, difficulty);
      if(lvl) return lvl;
    } catch(_) {}
  }
  throw new Error('build level generation failed');
}

function tryBuild(api, cfg, r, difficulty){
  const names = shuffle(Object.keys(SITES), r);
  const mcs = names.slice(0, cfg.mcs);              // enzymes present in the vector
  const traps = mcs.slice(0, cfg.traps);            // these will ALSO cut the gene
  const clean = mcs.slice(cfg.traps);               // safe choices
  if(clean.length < 2) return null;

  const allSites = mcs.map(n=>SITES[n]);
  const [lenLo,lenHi] = cfg.geneLen;
  const geneLen = lenLo + ((r()*(lenHi-lenLo))|0);

  // gene: clean of every MCS site, then plant each trap site once, inside.
  let gene = cleanSeq(geneLen - geneLen%3, allSites, r);
  for(const t of traps){
    const pos = 60 + ((r()*(gene.length-120))|0);
    const p = pos - pos%3; // codon boundary
    gene = gene.slice(0,p) + SITES[t] + gene.slice(p);
  }
  // verify gene composition
  const gr = api.restriction(gene, false);
  const gcount = n => (gr.enzymes.find(e=>e.name===n)||{count:0}).count;
  for(const t of traps) if(gcount(t) < 1) return null;
  for(const c of clean) if(gcount(c) !== 0) return null;

  // vector: a circular plasmid with each MCS enzyme as a single cutter.
  const vector = buildVector(api, mcs, r);
  if(!vector) return null;

  // verify a clean directional clone works: amplicon = siteA + gene + siteB
  const A = clean[0], B = clean[1];
  const amplicon = SITES[A] + gene + SITES[B];
  const sol = api.clone(vector, amplicon, [A,B], true, false);
  if(sol.products.length !== 1) return null;

  const org = ORGANISMS[(r()*ORGANISMS.length)|0];
  const gn = GENES[(r()*GENES.length)|0];

  return {
    generated:true, difficulty,
    organism: org, geneName: gn.name, geneNote: gn.note, organismNote: org.note,
    gene, vector,
    palette: mcs.map(n=>({ name:n, site:SITES[n] })),
    cleanEnzymes: clean,        // for hint/grading reference
    trapEnzymes: traps,
    // a known-good answer (not shown unless hinted)
    solution: { enzymes:[A,B], recombinantLen: sol.products[0].seq.length },
    brief: `Clone <b>${gn.name}</b> into the vector for expression in <b>${org.name}</b>. ${gn.note}.`,
  };
}

function buildVector(api, mcsNames, r){
  const allSites = mcsNames.map(n=>SITES[n]);
  for(let attempt=0; attempt<50; attempt++){
    let v = cleanSeq(140, allSites, r);
    // lay the MCS down with spacers between each site
    for(const n of mcsNames){ v += SITES[n] + cleanSeq(60 + ((r()*80)|0), allSites, r); }
    const vr = api.restriction(v, true);
    const cnt = n => (vr.enzymes.find(e=>e.name===n)||{count:0}).count;
    if(mcsNames.every(n=>cnt(n)===1)) return v;
  }
  return null;
}

export { SITES };
