// ── Laue physics for AR Crystal ──────────────────────────────
// Ported from cards/collection/diffract.html (verified) but returning
// 3D diffracted-ray DIRECTIONS instead of a flat detector projection.
// Framework-free ES module; also attaches to globalThis for node tests.
//
// Transmission Laue: a still crystal in a white X-ray beam. Each plane
// family (reciprocal vector G) reflects the one wavelength in the band
// that satisfies Bragg. The diffracted ray is the mirror reflection of
// the beam across the planes:  s = s0 - 2(s0·Ĝ)Ĝ , with the spot present
// only if  λ = -2(s0·G)/|G|²  lands in [λmin, λmax].  s0 = +z (lab).

const D2R = Math.PI / 180;

// ── 3x3 linear algebra ───────────────────────────────────────
export function mul3(A,B){const o=new Array(9);for(let r=0;r<3;r++)for(let c=0;c<3;c++){let s=0;for(let k=0;k<3;k++)s+=A[r*3+k]*B[k*3+c];o[r*3+c]=s;}return o;}
export function mv(m,v){return[m[0]*v[0]+m[1]*v[1]+m[2]*v[2], m[3]*v[0]+m[4]*v[1]+m[5]*v[2], m[6]*v[0]+m[7]*v[1]+m[8]*v[2]];}
export function cross(a,b){return[a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];}
export function dot(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];}
export function sub(a,b){return[a[0]-b[0],a[1]-b[1],a[2]-b[2]];}
export function norm(v){const l=Math.hypot(v[0],v[1],v[2])||1;return[v[0]/l,v[1]/l,v[2]/l];}
export function identity3(){return[1,0,0,0,1,0,0,0,1];}
export function quatToMat3(q){ // q = [x,y,z,w]
  const [x,y,z,w]=q;
  return [
    1-2*(y*y+z*z),   2*(x*y-z*w),   2*(x*z+y*w),
      2*(x*y+z*w), 1-2*(x*x+z*z),   2*(y*z-x*w),
      2*(x*z-y*w),   2*(y*z+x*w), 1-2*(x*x+y*y),
  ];
}

// ── Reciprocal lattice from cell parameters ──────────────────
export function reciprocal(a,b,c,al,be,ga){
  al*=D2R; be*=D2R; ga*=D2R;
  const ca=Math.cos(al),cb=Math.cos(be),cg=Math.cos(ga),sg=Math.sin(ga);
  const va=[a,0,0];
  const vb=[b*cg, b*sg, 0];
  const cx=c*cb, cy=c*(ca-cb*cg)/sg;
  const cz=c*Math.sqrt(Math.max(1e-6, 1-ca*ca-cb*cb-cg*cg+2*ca*cb*cg))/sg;
  const vc=[cx,cy,cz];
  const V=dot(va,cross(vb,vc));
  return { as:cross(vb,vc).map(x=>x/V), bs:cross(vc,va).map(x=>x/V), cs:cross(va,vb).map(x=>x/V) };
}

// ── Lattice-centering extinction rules ───────────────────────
export function allowed(center,h,k,l){
  switch(center){
    case 'P': return true;
    case 'I': return ((h+k+l)&1)===0;
    case 'C': return ((h+k)&1)===0;
    case 'F': { const e=x=>((x&1)===0); return (e(h)&&e(k)&&e(l))||(!e(h)&&!e(k)&&!e(l)); }
    case 'R': return (((-h+k+l)%3)+3)%3===0;
    case 'diamond': {
      const e=x=>((x&1)===0);
      if(e(h)&&e(k)&&e(l)) return ((h+k+l)%4)===0;
      if(!e(h)&&!e(k)&&!e(l)) return true;
      return false;
    }
    default: return true;
  }
}

// ── Specimen roster (real minerals; cell params in angstroms) ─
// Trigonal entries are genuinely rhombohedral (R) so their 3-fold is in
// the lattice itself (a bare hexagonal-P lattice would read 6-fold).
export const SYSTEMS=['cubic','tetragonal','hexagonal','trigonal','orthorhombic','monoclinic','triclinic'];
export const SYS_LABEL={cubic:'Cubic',tetragonal:'Tetragonal',hexagonal:'Hexagonal',trigonal:'Trigonal',orthorhombic:'Orthorhombic',monoclinic:'Monoclinic',triclinic:'Triclinic'};
export const SYS_AXES={cubic:'4-, 3- and 2-fold',tetragonal:'one 4-fold',hexagonal:'one 6-fold',trigonal:'one 3-fold',orthorhombic:'three 2-folds',monoclinic:'a single 2-fold',triclinic:'none (only a centre)'};

export const ROSTER=[
  {name:'Halite (NaCl)',   sys:'cubic',       center:'F',      a:5.64,b:5.64,c:5.64,al:90,be:90,ga:90,  col:[0.85,0.85,0.92]},
  {name:'Fluorite',        sys:'cubic',       center:'F',      a:5.46,b:5.46,c:5.46,al:90,be:90,ga:90,  col:[0.55,0.75,0.9]},
  {name:'Pyrite',          sys:'cubic',       center:'P',      a:5.42,b:5.42,c:5.42,al:90,be:90,ga:90,  col:[0.86,0.74,0.35]},
  {name:'Diamond',         sys:'cubic',       center:'diamond',a:3.567,b:3.567,c:3.567,al:90,be:90,ga:90,col:[0.9,0.95,1.0]},
  {name:'Zircon',          sys:'tetragonal',  center:'I',      a:6.61,b:6.61,c:5.98,al:90,be:90,ga:90,  col:[0.78,0.6,0.45]},
  {name:'Rutile (TiO₂)',   sys:'tetragonal',  center:'P',      a:4.59,b:4.59,c:2.96,al:90,be:90,ga:90,  col:[0.7,0.3,0.2]},
  {name:'Beryl',           sys:'hexagonal',   center:'P',      a:9.21,b:9.21,c:9.19,al:90,be:90,ga:120, col:[0.45,0.8,0.6]},
  {name:'Apatite',         sys:'hexagonal',   center:'P',      a:9.42,b:9.42,c:6.88,al:90,be:90,ga:120, col:[0.6,0.85,0.75]},
  {name:'Calcite',         sys:'trigonal',    center:'R',      a:4.99,b:4.99,c:17.06,al:90,be:90,ga:120,col:[0.9,0.88,0.8]},
  {name:'Corundum (ruby)', sys:'trigonal',    center:'R',      a:4.76,b:4.76,c:12.99,al:90,be:90,ga:120,col:[0.8,0.25,0.3]},
  {name:'Hematite',        sys:'trigonal',    center:'R',      a:5.04,b:5.04,c:13.77,al:90,be:90,ga:120,col:[0.55,0.3,0.32]},
  {name:'Topaz',           sys:'orthorhombic',center:'C',      a:4.65,b:8.80,c:8.39,al:90,be:90,ga:90,  col:[0.95,0.8,0.55]},
  {name:'Olivine',         sys:'orthorhombic',center:'P',      a:4.75,b:10.20,c:5.98,al:90,be:90,ga:90, col:[0.55,0.75,0.35]},
  {name:'Gypsum',          sys:'monoclinic',  center:'C',      a:5.68,b:15.18,c:6.52,al:90,be:118.4,ga:90,col:[0.9,0.9,0.85]},
  {name:'Orthoclase',      sys:'monoclinic',  center:'C',      a:8.56,b:12.96,c:7.21,al:90,be:116.0,ga:90,col:[0.92,0.78,0.62]},
  {name:'Albite',          sys:'triclinic',   center:'P',      a:8.14,b:12.79,c:7.16,al:94.3,be:116.6,ga:87.7,col:[0.9,0.9,0.92]},
  {name:'Kyanite',         sys:'triclinic',   center:'P',      a:7.10,b:7.74,c:5.57,al:89.99,be:101.1,ga:106.0,col:[0.5,0.6,0.85]},
];

// Attach the precomputed reciprocal lattice once.
export function prepSpecimen(spec){
  if(!spec._recip) spec._recip = reciprocal(spec.a,spec.b,spec.c,spec.al,spec.be,spec.ga);
  return spec;
}

// ── Laue spot computation → 3D ray directions ────────────────
// O: 3x3 orientation matrix applied to the reciprocal lattice (the
//    crystal's current orientation in the lab/beam frame).
// Returns { spots:[{s:[x,y,z], n}], count }  where s is a unit vector
// pointing along the diffracted ray (forward hemisphere, sz>0), n is
// normalized intensity in [0,1].  We sample a SPHERE in reciprocal
// space (|G|<R): rotation-invariant for every system, so symmetry is
// honest (an index box would clip corners and fake-break 6-/3-fold).
export function computeSpots(spec, O, { rad=1.15, lmin=0.40, lmax=2.20, cap=140 }={}){
  prepSpecimen(spec);
  const as=mv(O,spec._recip.as), bs=mv(O,spec._recip.bs), cs=mv(O,spec._recip.cs);
  const R=Math.min(rad, 2/lmin);
  const hb=Math.ceil(R*spec.a)+2, kb=Math.ceil(R*spec.b)+2, lb=Math.ceil(R*spec.c)+2;
  const merged=new Map();
  for(let h=-hb;h<=hb;h++)for(let k=-kb;k<=kb;k++)for(let l=-lb;l<=lb;l++){
    if(h===0&&k===0&&l===0) continue;
    if(!allowed(spec.center,h,k,l)) continue;
    const Gx=h*as[0]+k*bs[0]+l*cs[0];
    const Gy=h*as[1]+k*bs[1]+l*cs[1];
    const Gz=h*as[2]+k*bs[2]+l*cs[2];
    const g2=Gx*Gx+Gy*Gy+Gz*Gz;
    const gl=Math.sqrt(g2);
    if(gl>R) continue;            // spherical cut → symmetry-faithful
    if(Gz>=0) continue;           // need s0·G < 0 for positive wavelength (s0=+z)
    const lambda=-2*Gz/g2;
    if(lambda<lmin||lambda>lmax) continue;
    const ndz=Gz/gl;              // s0·ĝ  (<0)
    const sx=-2*ndz*Gx/gl, sy=-2*ndz*Gy/gl, sz=1-2*ndz*ndz;
    if(sz<=0.04) continue;        // forward (transmission) hemisphere
    const spct=Math.max(0,(lambda-lmin))/(lambda*lambda);   // Kramers white beam
    const ff=1/(1+(gl*0.55)*(gl*0.55));                     // crude form-factor falloff
    const I=spct*ff;
    if(I<=0) continue;
    // fine key on direction: only true harmonics (identical s) collapse
    const key=Math.round(sx*5000)+','+Math.round(sy*5000)+','+Math.round(sz*5000);
    const ex=merged.get(key);
    if(ex){ ex.I+=I; } else { merged.set(key,{s:[sx,sy,sz],I}); }
  }
  let arr=[...merged.values()];
  let Imax=1e-9; for(const s of arr) if(s.I>Imax) Imax=s.I;
  for(const s of arr) s.n=s.I/Imax;
  // keep the brightest `cap` (bandwidth + render budget)
  if(arr.length>cap){ arr.sort((a,b)=>b.n-a.n); arr=arr.slice(0,cap); }
  return { spots:arr, count:arr.length };
}

// ── Symmetry along the beam (z) from a set of ray directions ─
// Projects forward rays to the gnomonic plane and tests n-fold closure.
export function detectSymmetry(spots){
  const pts=[];
  for(const sp of spots){
    const [x,y,z]=sp.s; if(z<=0.05) continue;
    const dx=x/z, dy=y/z; const r=Math.hypot(dx,dy);
    if(r>0.05 && r<6 && (sp.n===undefined||sp.n>0.05)) pts.push([dx,dy]);
  }
  if(pts.length<5) return {n:1,frac:0,count:pts.length};
  const tol=0.045;
  function matchFrac(ang){
    const c=Math.cos(ang),s=Math.sin(ang); let hit=0;
    for(const[px,py] of pts){
      const X=px*c-py*s, Y=px*s+py*c;
      let ok=false;
      for(const[qx,qy] of pts){ if(Math.hypot(X-qx,Y-qy)<tol){ok=true;break;} }
      if(ok) hit++;
    }
    return hit/pts.length;
  }
  let best={n:1,frac:0,count:pts.length};
  for(const n of [6,4,3,2]){
    const f=matchFrac(2*Math.PI/n);
    if(f>=0.80){ best={n,frac:f,count:pts.length}; break; }
    if(f>best.frac && best.n===1) best={n:1,frac:f,count:pts.length};
  }
  return best;
}

// ── Crystal habit geometry (for the emitter "crystal in hand" view) ──
export function buildHabit(sys){
  switch(sys){
    case 'cubic': return octahedron();
    case 'tetragonal': return tetragonal();
    case 'orthorhombic': return orthorhombic();
    case 'hexagonal': return hexPrism();
    case 'trigonal': return trigonal();
    case 'monoclinic': return monoclinic();
    case 'triclinic': return triclinic();
    default: return hexPrism();
  }
}
function octahedron(){const s=1,verts=[[s,0,0],[-s,0,0],[0,s,0],[0,-s,0],[0,0,s],[0,0,-s]];const tris=[[0,2,4],[0,4,3],[0,3,5],[0,5,2],[1,4,2],[1,3,4],[1,5,3],[1,2,5]];return{verts,tris};}
function tetragonal(){const r=0.5,h=1.1,tH=0.6,v=[],b=[],t=[];for(let i=0;i<4;i++){const a=Math.PI/2*i+Math.PI/4;b.push([r*Math.cos(a),-h,r*Math.sin(a)]);t.push([r*Math.cos(a),h,r*Math.sin(a)]);}v.push(...b,...t,[0,h+tH,0],[0,-h,0]);const tris=[];for(let i=0;i<4;i++){const j=(i+1)%4;tris.push([i,j,j+4],[i,j+4,i+4],[i+4,j+4,8],[9,j,i]);}return{verts:v,tris};}
function orthorhombic(){const a=0.78,b=0.46,h=1.0,dH=0.5;const v=[[-a,-h,-b],[a,-h,-b],[a,-h,b],[-a,-h,b],[-a,h,-b],[a,h,-b],[a,h,b],[-a,h,b],[0,h+dH,0],[0,-h,0]];const tris=[],idx=[[0,1],[1,2],[2,3],[3,0]];for(let i=0;i<4;i++){const[c,d]=idx[i];tris.push([c,d,d+4],[c,d+4,c+4],[c+4,d+4,8],[9,d,c]);}return{verts:v,tris};}
function hexPrism(){const n=6,r=0.62,h=0.95,tH=0.22,verts=[];for(let i=0;i<n;i++){const a=Math.PI*2/n*i;verts.push([r*Math.cos(a),-h,r*Math.sin(a)]);}for(let i=0;i<n;i++){const a=Math.PI*2/n*i;verts.push([r*Math.cos(a),h,r*Math.sin(a)]);}verts.push([0,h+tH,0],[0,-h,0]);const api=n*2,bci=n*2+1,tris=[];for(let i=0;i<n;i++){const j=(i+1)%n;tris.push([i,j,j+n],[i,j+n,i+n],[i+n,j+n,api],[bci,j,i]);}return{verts,tris};}
function trigonal(){const n=6,r=0.6,h=1.0,tH=0.7,verts=[];for(let i=0;i<n;i++){const a=Math.PI*2/n*i-Math.PI/2;verts.push([r*Math.cos(a),-h,r*Math.sin(a)]);}for(let i=0;i<n;i++){const a=Math.PI*2/n*i-Math.PI/2;verts.push([r*Math.cos(a),h,r*Math.sin(a)]);}for(let i=0;i<n;i++){const a=Math.PI*2/n*i-Math.PI/2;const tr=r*(0.3+0.25*(i%2===0?1:0.4));const th=h+tH*(0.6+0.4*(i%2===0?1:0.7));verts.push([tr*Math.cos(a),th,tr*Math.sin(a)]);}verts.push([0,-h,0],[0,h+tH,0]);const bci=n*3,api=n*3+1,tris=[];for(let i=0;i<n;i++){const j=(i+1)%n;tris.push([i,j,j+n],[i,j+n,i+n],[bci,j,i],[i+n,j+n,j+2*n],[i+n,j+2*n,i+2*n],[i+2*n,j+2*n,api]);}return{verts,tris};}
function monoclinic(){const r=0.55,h=1.0,sk=0.35,verts=[];for(let i=0;i<4;i++){const a=Math.PI/2*i+Math.PI/4;verts.push([r*Math.cos(a)-h*sk,-h,r*Math.sin(a)]);}for(let i=0;i<4;i++){const a=Math.PI/2*i+Math.PI/4;verts.push([r*Math.cos(a)+h*sk,h,r*Math.sin(a)]);}verts.push([h*sk+0.15,h+0.4,0],[-h*sk,-h,0]);const tris=[];for(let i=0;i<4;i++){const j=(i+1)%4;tris.push([i,j,j+4],[i,j+4,i+4],[i+4,j+4,8],[9,j,i]);}return{verts,tris};}
function triclinic(){const a=0.82,b=0.6,h=0.34,skx=0.22,skz=0.16;const v=[[-a-skx,-h,-b-skz],[a-skx,-h,-b+skz],[a+skx,-h,b-skz],[-a+skx,-h,b+skz],[-a+skx,h,-b+skz],[a+skx,h,-b-skz],[a-skx,h,b+skz],[-a-skx,h,b-skz]];const tris=[[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7],[0,3,2],[0,2,1],[4,5,6],[4,6,7]];return{verts:v,tris};}

// node test convenience
if(typeof window==='undefined' && typeof globalThis!=='undefined'){
  globalThis.LAUE={computeSpots,detectSymmetry,reciprocal,allowed,ROSTER,SYSTEMS,prepSpecimen,quatToMat3,mul3,identity3};
}
