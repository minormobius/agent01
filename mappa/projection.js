// mappa/projection.js — the ATLAS as a projection onto a generated world.
//
// The mino.mobi sites are NOT part of the engine. Given any world + the site
// list, this lays politics on top of habitability: it scores every land cell
// for habitability, partitions the habitable land into one region per wing via
// spherical k-means, assigns wings to regions (most-habitable region ↔ heaviest
// wing), and places each surface as a city inside its wing's region (capital at
// the core, others spread, older surfaces toward the interior). Deterministic.

import { mulberry32 } from './engine.js';

// habitability weight per biome index (parallel to engine BIOMES order)
const HAB = [0,0,0, 0.02,0.22,0.5, 0.16,0.72,0.92,0.82, 0.12,0.66,0.78,0.62, 0.05,0];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const norm=a=>{const l=Math.hypot(a[0],a[1],a[2])||1;return[a[0]/l,a[1]/l,a[2]/l]};

export function projectAtlas(world, wings, sites){
  const {N,V,water,biome,elev,adj,meta}=world;
  const rnd=mulberry32((meta.seed*2654435761>>>0)^0x9e3779b9);
  const K=wings.length;

  // 1. habitability ----------------------------------------------------------
  const habit=new Float32Array(N);
  for(let i=0;i<N;i++) habit[i]= water[i]!==0?0: HAB[biome[i]]*(1-Math.min(0.55,Math.max(0,elev[i])*0.45));
  const land=[]; for(let i=0;i<N;i++) if(water[i]===0) land.push(i);
  if(!land.length) return {cities:[],region:new Int16Array(N).fill(-1),centroids:[]};

  // 2. spherical k-means → K regions ----------------------------------------
  // k-means++ seeding weighted by habitability
  const seeds=[];
  seeds.push(land[Math.floor(rnd()*land.length)]);
  while(seeds.length<K){
    let best=-1,bs=-1;
    for(let t=0;t<64;t++){const i=land[Math.floor(rnd()*land.length)];
      let nd=2;for(const s of seeds){const d=1-dot(V[i],V[s]);if(d<nd)nd=d}
      const score=nd*(0.3+habit[i])*(0.6+rnd()*0.8);
      if(score>bs){bs=score;best=i}}
    seeds.push(best);
  }
  let cent=seeds.map(i=>V[i].slice());
  const region=new Int16Array(N).fill(-1);
  for(let it=0;it<14;it++){
    const acc=Array.from({length:K},()=>[0,0,0]), wsum=new Float64Array(K);
    for(const i of land){let bk=0,bd=-2;for(let k=0;k<K;k++){const d=dot(V[i],cent[k]);if(d>bd){bd=d;bk=k}}region[i]=bk;
      const wgt=0.15+habit[i];acc[bk][0]+=V[i][0]*wgt;acc[bk][1]+=V[i][1]*wgt;acc[bk][2]+=V[i][2]*wgt;wsum[bk]+=wgt}
    for(let k=0;k<K;k++) if(wsum[k]>0) cent[k]=norm(acc[k]);
  }

  // 3. assign wings to regions: heaviest wing ↔ most-habitable region --------
  const regHab=new Float64Array(K), regSize=new Int32Array(K);
  for(const i of land){regHab[region[i]]+=habit[i];regSize[region[i]]++}
  const regOrder=[...Array(K).keys()].sort((a,b)=>regHab[b]-regHab[a]);
  const wingWeight={}; for(const w of wings) wingWeight[w.id]=0;
  for(const s of sites) wingWeight[s.w]=(wingWeight[s.w]||0)+s.k;
  const wingOrder=wings.slice().sort((a,b)=>wingWeight[b.id]-wingWeight[a.id]);
  const wingRegion={}, regionWing=new Array(K);
  wingOrder.forEach((w,idx)=>{const rk=regOrder[idx];wingRegion[w.id]=rk;regionWing[rk]=w.id});
  // relabel region[] to carry the wing index (into wings[]) for the renderer
  const wingIdx={}; wings.forEach((w,i)=>wingIdx[w.id]=i);
  const regionWingIdx=new Int16Array(N).fill(-1);
  for(const i of land) if(regionWing[region[i]]!=null) regionWingIdx[i]=wingIdx[regionWing[region[i]]];

  // 4. place cities ----------------------------------------------------------
  const cellsByWing={}; for(const w of wings) cellsByWing[w.id]=[];
  for(const i of land){const wid=regionWing[region[i]];if(wid)cellsByWing[wid].push(i)}
  const byW={}; for(const w of wings) byW[w.id]=[]; for(const s of sites) byW[s.w].push(s);
  const cities=[];
  function borderCells(aId,bId){const ar=wingRegion[aId],br=wingRegion[bId],out=[];
    for(const i of cellsByWing[aId]||[]){for(const j of adj[i]){if(region[j]===br){out.push(i);break}}}return out}
  for(const w of wings){
    const mem=byW[w.id].slice().sort((p,q)=>q.k-p.k);
    const cand=cellsByWing[w.id]||[]; const placed=[];
    // region centroid (for age bias / capital)
    let cm=[0,0,0];for(const i of cand)cm=[cm[0]+V[i][0],cm[1]+V[i][1],cm[2]+V[i][2]];cm=cand.length?norm(cm):(cent[wingRegion[w.id]]||[0,0,1]);
    mem.forEach((nd,rank)=>{let site=-1;
      if(nd.w2){const bc=borderCells(nd.w,nd.w2);if(bc.length)site=bc[Math.floor(rnd()*bc.length)]}
      if(site<0&&cand.length){
        if(rank===0){let bs=-1;for(const i of cand){const sc=habit[i]*0.6+dot(V[i],cm)*0.4;if(sc>bs){bs=sc;site=i}}}
        else{let bs=-1e9;for(let t=0;t<28;t++){const i=cand[Math.floor(rnd()*cand.length)];
          let mind=2;for(const p of placed){const d=1-dot(V[p],V[i]);if(d<mind)mind=d}
          const dCen=1-dot(V[i],cm),ageBias=(nd.f-0.5)*dCen*1.4;
          const sc=mind*1.2+habit[i]*0.5+ageBias+rnd()*0.05;if(sc>bs){bs=sc;site=i}}}}
      if(site<0)site=cand.length?cand[0]:land[0];placed.push(site);
      cities.push({n:nd.n,u:nd.u,k:nd.k,a:nd.a,f:nd.f,b:nd.b,w:nd.w,w2:nd.w2,v:V[site],site,capital:rank===0});
    });
  }
  return {cities, region:regionWingIdx, centroids:cent, wingRegion};
}
