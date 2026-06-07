// Node self-test for mappa/engine.js — structural + statistical invariants.
// Run: node scripts/test-mappa-engine.mjs
import { generateWorld, BIOMES } from '../mappa/engine.js';

let ok = true;
const fail = m => { ok = false; console.error('  ✗ ' + m); };

// determinism: same seed → identical biome histogram + elev sum
function fingerprint(w){let e=0;for(let i=0;i<w.N;i++)e+=w.elev[i]*(i+1);
  const bh=new Array(BIOMES.length).fill(0);for(let i=0;i<w.N;i++)bh[w.biome[i]]++;return e.toFixed(2)+'|'+bh.join(',')}

const macro = []; // continental "centre of mass" per seed → must differ
for (const seed of [1,2,3,7,42,99,2026,31337]) {
  const w = generateWorld(seed);
  const euler = w._euler.tris === 2*w._euler.Vc - 4;
  if(!euler) fail(`seed ${seed}: Euler F=2V-4 violated (${w._euler.tris} vs ${2*w._euler.Vc-4})`);
  // determinism
  if(fingerprint(w)!==fingerprint(generateWorld(seed))) fail(`seed ${seed}: NOT deterministic`);
  // climate ranges
  let tmin=1e9,tmax=-1e9; for(let i=0;i<w.N;i++){if(w.temperature[i]<tmin)tmin=w.temperature[i];if(w.temperature[i]>tmax)tmax=w.temperature[i]}
  if(tmin<-80||tmax>60) fail(`seed ${seed}: temperature out of range [${tmin|0},${tmax|0}]`);
  // land fraction sane
  let land=0,lake=0; for(let i=0;i<w.N;i++){if(w.water[i]===0)land++;else if(w.water[i]===2)lake++}
  const lf=land/w.N; if(lf<0.18||lf>0.62) fail(`seed ${seed}: land fraction ${(lf*100|0)}% out of band`);
  // biome diversity: a real world has many biomes among land
  const bset=new Set(); for(let i=0;i<w.N;i++)if(w.water[i]===0)bset.add(w.biome[i]);
  if(bset.size<5) fail(`seed ${seed}: only ${bset.size} land biomes (want ≥5)`);
  // macro variability: centroid of land
  let cm=[0,0,0],c=0; for(let i=0;i<w.N;i++)if(w.water[i]===0){cm[0]+=w.V[i][0];cm[1]+=w.V[i][1];cm[2]+=w.V[i][2];c++}
  cm=cm.map(x=>x/c); macro.push({seed,cm,lf,bset:bset.size,lake,rivers:w.rivers.length,plates:w.meta.plateCount});
  const bh={}; for(let i=0;i<w.N;i++)if(w.water[i]===0){const id=BIOMES[w.biome[i]].id;bh[id]=(bh[id]||0)+1}
  const top=Object.entries(bh).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([k,v])=>k+':'+(v/land*100|0)+'%').join(' ');
  console.log(`seed ${String(seed).padStart(5)}: plates=${w.meta.plateCount} ocean=${(w.meta.oceanFraction*100|0)}% land=${(lf*100|0)}% biomes=${bset.size} lakes=${lake} rivers=${w.rivers.length} | ${top}`);
}

// prove worlds differ at macro scale (the original complaint)
let minSep=1e9;
for(let i=0;i<macro.length;i++)for(let j=i+1;j<macro.length;j++){
  const d=Math.hypot(macro[i].cm[0]-macro[j].cm[0],macro[i].cm[1]-macro[j].cm[1],macro[i].cm[2]-macro[j].cm[2]);
  if(d<minSep)minSep=d;
}
console.log(`\nmacro land-centroid min separation across seeds: ${minSep.toFixed(3)} (want > 0.05 — worlds are genuinely different)`);
if(minSep<0.05) fail('worlds too similar at macro scale');

console.log(ok ? '\n✓ engine self-test passed' : '\n✗ engine self-test FAILED');
process.exit(ok?0:1);
