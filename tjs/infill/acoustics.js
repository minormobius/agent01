// acoustics.js — a dependency-free 3D acoustic FDTD for the infill orb.
//
// Heterogeneous-media linear acoustics on a staggered grid (the same scheme
// validated in 1D against the exact transfer-matrix TL of a fluid layer):
//
//   ∂v/∂t = -(1/ρ)∇p            (velocity at staggered faces)
//   ∂p/∂t = -κ(∇·v),  κ = ρc²   (pressure at cell centres)
//
// Every voxel carries its own (ρ, κ). Air is (1.2, ρc²); the printed solid is a
// DENSE, STIFF fluid — high impedance, so it reflects strongly, but a *thin*
// wall still transmits by mass law (finite TL, not the infinite block a perfectly
// rigid wall would give). That's what lets the solid shell and the closed-cell
// Kelvin foam read as real partitions. A phenomenological viscous loss in the
// near-wall air cells supplies the open-cell absorption (dissipation that scales
// with wetted surface area — the dominant mechanism for porous absorbers).
//
// A broadband monopole pulse is injected at the centre; pressure is recorded on
// a sphere outside the orb. The same domain WITHOUT the orb is the free-field
// reference, and TL(f) = 10·log10( Σ|P_ref|² / Σ|P_orb|² ).
//
// Runs in node (validation) and in a Web Worker (the viewer's spectral panel).
// The coarse CPU grid captures mass-law / cavity / scattering / surface-loss
// trends; resolving sub-mm pore detail is the job of the WebGPU port.

const TWO_PI = Math.PI * 2;
function jmod(a, n){ return a - n * Math.floor(a / n); }
function wdist(u){ return Math.abs(jmod(u + Math.PI, TWO_PI) - Math.PI); }

// air + solid material constants
export const AIR   = { rho: 1.2,    c: 343.0 };
export const SOLID = { rho: 1200.0, c: 700.0 };   // PLA-ish areal mass; c kept
                                                  // moderate so the wall stays
                                                  // mass-like through the audio
                                                  // band and the CFL is sane.

// The field — kept identical to the viewer's inline gdist (parity-tested).
export function gdist(pat, cell, x, y, z){
  const f = TWO_PI / cell;
  const qx = x*f, qy = y*f, qz = z*f;
  const s = Math.sin, c = Math.cos;
  switch(pat){
    case 0: return Math.abs(s(qx)*c(qy) + s(qy)*c(qz) + s(qz)*c(qx));
    case 1: return Math.abs(c(qx)+c(qy)+c(qz));
    case 2: return Math.abs(s(qx)*s(qy)*s(qz) + s(qx)*c(qy)*c(qz)
                          + c(qx)*s(qy)*c(qz) + c(qx)*c(qy)*s(qz));
    case 3: return Math.abs(3*(c(qx)+c(qy)+c(qz)) + 4*c(qx)*c(qy)*c(qz));
    case 4: {
      const hh = cell*0.8660254, j = Math.round(z/hh);
      let d1=1e9, d2=1e9;
      for(let dj=-1;dj<=1;dj++){ const jj=j+dj, zc=jj*hh, xoff=(jmod(jj,2)?cell*0.5:0), i=Math.round((x-xoff)/cell);
        for(let di=-1;di<=1;di++){ const xc=(i+di)*cell+xoff, dx=x-xc, dz=z-zc, dd=Math.hypot(dx,dz);
          if(dd<d1){d2=d1;d1=dd;} else if(dd<d2) d2=dd; } }
      return d2-d1; }
    case 5: return Math.min(wdist(qx), Math.min(wdist(qy), wdist(qz)));
    case 6: { const u1=qx, u2=0.5*qx+0.8660254*qz, u3=-0.5*qx+0.8660254*qz;
              return Math.min(wdist(u1), Math.min(wdist(u2), wdist(u3))); }
    default: {
      let d1=1e9, d2=1e9;
      const fcx=Math.floor(x/cell), fcy=Math.floor(y/cell), fcz=Math.floor(z/cell);
      for(let a=0;a<=1;a++)for(let b=0;b<=1;b++)for(let cc=0;cc<=1;cc++){
        const dd=Math.hypot(x-(fcx+a)*cell, y-(fcy+b)*cell, z-(fcz+cc)*cell);
        if(dd<d1){d2=d1;d1=dd;} else if(dd<d2) d2=dd; }
      const fbx=Math.floor(x/cell-0.5), fby=Math.floor(y/cell-0.5), fbz=Math.floor(z/cell-0.5);
      for(let a=0;a<=1;a++)for(let b=0;b<=1;b++)for(let cc=0;cc<=1;cc++){
        const dd=Math.hypot(x-(fbx+a+0.5)*cell, y-(fby+b+0.5)*cell, z-(fbz+cc+0.5)*cell);
        if(dd<d1){d2=d1;d1=dd;} else if(dd<d2) d2=dd; }
      return d2-d1; }
  }
}

// fibonacci sphere — even-ish points on a sphere of radius rad
function fibSphere(count, rad){
  const pts = [], ga = Math.PI * (3 - Math.sqrt(5));
  for(let i=0;i<count;i++){
    const y = 1 - (i + 0.5) / count * 2;
    const r = Math.sqrt(Math.max(0, 1 - y*y));
    const th = ga * i;
    pts.push([Math.cos(th)*r*rad, y*rad, Math.sin(th)*r*rad]);
  }
  return pts;
}

// Per-voxel material + a near-wall mask (air cells touching solid -> viscous loss)
function buildMaterial(opt){
  const { n, half, dx, pattern, cell, T, R, shell, withOrb, cavityR } = opt;
  const N = n*n*n;
  const rho = new Float32Array(N).fill(AIR.rho);
  const kap = new Float32Array(N).fill(AIR.rho*AIR.c*AIR.c);
  const solid = new Uint8Array(N);
  if(withOrb){
    const R2 = R*R, Rin = R - shell, ks = SOLID.rho*SOLID.c*SOLID.c;
    for(let i=0;i<n;i++){ const x = -half + (i+0.5)*dx;
      for(let j=0;j<n;j++){ const y = -half + (j+0.5)*dx;
        for(let k=0;k<n;k++){ const z = -half + (k+0.5)*dx;
          const r2 = x*x+y*y+z*z;
          if(r2 > R2) continue;
          if(r2 < cavityR*cavityR) continue;
          const r = Math.sqrt(r2);
          if((shell > 0 && r > Rin) || gdist(pattern, cell, x, y, z) < T){
            const a = (i*n+j)*n+k;
            solid[a] = 1; rho[a] = SOLID.rho; kap[a] = ks;
          }
        }
      }
    }
  }
  // near-wall = air cell with at least one solid face-neighbour
  const near = new Uint8Array(N);
  if(withOrb){
    const id = (i,j,k)=>(i*n+j)*n+k;
    for(let i=1;i<n-1;i++) for(let j=1;j<n-1;j++) for(let k=1;k<n-1;k++){
      const a = id(i,j,k);
      if(solid[a]) continue;
      if(solid[id(i-1,j,k)]||solid[id(i+1,j,k)]||solid[id(i,j-1,k)]||
         solid[id(i,j+1,k)]||solid[id(i,j,k-1)]||solid[id(i,j,k+1)]) near[a]=1;
    }
  }
  return { rho, kap, near };
}

// One FDTD run; returns per-recorder, per-frequency complex accumulators.
function runField(opt, mat){
  const { n, dx, dt, steps, freqs, recs, srcIdx, spongeN, spongeMin, wallLoss } = opt;
  const N = n*n*n;
  const p = new Float32Array(N), ux = new Float32Array(N), uy = new Float32Array(N), uz = new Float32Array(N);
  const { rho, kap, near } = mat;
  const dxm = dx / 1000;                         // geometry is mm; physics is SI
  const cVbase = dt / dxm;                        // divide by face density inline
  // pressure coefficient folded per cell
  const kc = new Float32Array(N);
  for(let a=0;a<N;a++) kc[a] = dt * kap[a] / dxm;
  const keep = 1 - wallLoss;                      // near-wall velocity retention

  const damp = new Float32Array(n);
  for(let i=0;i<n;i++){ const d = Math.min(i, n-1-i);
    damp[i] = d >= spongeN ? 1.0 : spongeMin + (1-spongeMin) * (d/spongeN); }

  const nn = n*n;
  const idx = (i,j,k) => (i*n+j)*n+k;
  const nRec = recs.length, nF = freqs.length;
  // complex DFT of pressure and radial velocity at each recorder, per frequency
  const reP = new Float64Array(nRec*nF), imP = new Float64Array(nRec*nF);
  const reV = new Float64Array(nRec*nF), imV = new Float64Array(nRec*nF);
  const w = freqs.map(f => TWO_PI*f*dt);
  const t0 = 28*dt, sw = 7*dt;

  for(let s=0;s<steps;s++){
    for(let i=0;i<n-1;i++) for(let j=0;j<n;j++) for(let k=0;k<n;k++){
      const a = idx(i,j,k), b = idx(i+1,j,k);
      ux[a] -= cVbase / (0.5*(rho[a]+rho[b])) * (p[b]-p[a]);
      if(near[a]) ux[a] *= keep;
    }
    for(let i=0;i<n;i++) for(let j=0;j<n-1;j++) for(let k=0;k<n;k++){
      const a = idx(i,j,k), b = idx(i,j+1,k);
      uy[a] -= cVbase / (0.5*(rho[a]+rho[b])) * (p[b]-p[a]);
      if(near[a]) uy[a] *= keep;
    }
    for(let i=0;i<n;i++) for(let j=0;j<n;j++) for(let k=0;k<n-1;k++){
      const a = idx(i,j,k), b = idx(i,j,k+1);
      uz[a] -= cVbase / (0.5*(rho[a]+rho[b])) * (p[b]-p[a]);
      if(near[a]) uz[a] *= keep;
    }
    for(let i=1;i<n;i++) for(let j=1;j<n;j++) for(let k=1;k<n;k++){
      const a = idx(i,j,k);
      const div = (ux[a]-ux[idx(i-1,j,k)]) + (uy[a]-uy[idx(i,j-1,k)]) + (uz[a]-uz[idx(i,j,k-1)]);
      let pv = p[a] - kc[a] * div;
      pv *= damp[i]*damp[j]*damp[k];
      p[a] = pv;
    }
    const tt = s*dt;
    p[srcIdx] += Math.exp(-((tt-t0)*(tt-t0))/(2*sw*sw));

    for(let ri=0; ri<nRec; ri++){
      const rc = recs[ri], a = rc.idx;
      const pv = p[a];
      // centre the staggered velocity at the recorder cell, project to radial
      const vx = 0.5*(ux[a] + ux[a-nn]);
      const vy = 0.5*(uy[a] + uy[a-n]);
      const vz = 0.5*(uz[a] + uz[a-1]);
      const vr = vx*rc.hx + vy*rc.hy + vz*rc.hz;
      const base = ri*nF;
      for(let fi=0; fi<nF; fi++){
        const ph = w[fi]*s, cs = Math.cos(ph), sn = Math.sin(ph);
        reP[base+fi] += pv*cs; imP[base+fi] -= pv*sn;
        reV[base+fi] += vr*cs; imV[base+fi] -= vr*sn;
      }
    }
    if(opt.onStep && (s & 31) === 0) opt.onStep(s);
  }
  return { reP, imP, reV, imV, nRec, nF };
}

// Full transmission-loss computation: reference (free field) vs orb.
export function simulate(params, onProgress){
  const R         = params.R ?? 25;
  const pattern   = params.pattern ?? 0;
  const cell      = params.cell ?? 6;
  const T         = params.T ?? 0.25;
  const shell     = params.shell ?? 0;
  const n         = params.n ?? 44;
  const domainFac = params.domainFactor ?? 1.7;
  const wallLoss  = params.wallLoss ?? 0.006;     // near-wall viscous loss / step

  const half = R * domainFac, L = 2*half, dx = L / n;
  const cMax = Math.max(AIR.c, SOLID.c);
  const dt = 0.9 * (dx/1000) / (cMax * Math.sqrt(3));   // CFL on the stiffest medium
  const crossings = params.crossings ?? 6;
  const steps = Math.round(crossings * (L/1000) / AIR.c / dt);

  const cavityR = Math.max(dx*1.2, R*0.10);
  const toIdx = (x,y,z) => {
    const i = Math.min(n-1, Math.max(0, Math.floor((x+half)/dx)));
    const j = Math.min(n-1, Math.max(0, Math.floor((y+half)/dx)));
    const k = Math.min(n-1, Math.max(0, Math.floor((z+half)/dx)));
    return (i*n+j)*n+k;
  };
  const srcIdx = toIdx(0,0,0);

  const spongeN = Math.max(4, Math.round(n*0.10));
  const rRec = R + (half - R - spongeN*dx) * 0.6;
  const recCells = fibSphere(params.recorders ?? 26, rRec).map(([x,y,z]) => {
    const L = Math.hypot(x,y,z) || 1;
    return { idx: toIdx(x,y,z), hx: x/L, hy: y/L, hz: z/L };
  });

  const fMin = params.fMin ?? 250, fMax = params.fMax ?? 8000, nF = params.nFreq ?? 26;
  const freqs = [];
  for(let i=0;i<nF;i++) freqs.push(fMin * Math.pow(fMax/fMin, i/(nF-1)));

  const baseOpt = { n, dx, dt, steps, freqs, recs: recCells, srcIdx,
                    half, pattern, cell, T, R, shell, cavityR,
                    spongeN, spongeMin: 0.92, wallLoss };

  if(onProgress) onProgress({ phase:'reference', frac:0 });
  const matFree = buildMaterial({ ...baseOpt, withOrb:false });
  const ref = runField({ ...baseOpt, onStep: s => onProgress && onProgress({ phase:'reference', frac: s/steps }) }, matFree);

  if(onProgress) onProgress({ phase:'orb', frac:0 });
  const matOrb = buildMaterial({ ...baseOpt, withOrb:true });
  const orb = runField({ ...baseOpt, onStep: s => onProgress && onProgress({ phase:'orb', frac: s/steps }) }, matOrb);

  // Net outward acoustic power through the recorder sphere, per frequency:
  // W(f) ∝ Σ_rec Re(P · conj(V_r)) = Σ (reP·reV + imP·imV). This flux is
  // well-defined even in the near field, so it avoids the pressure-magnitude
  // artefacts of measuring close to a compact scatterer.
  const tl = new Array(nF);
  for(let fi=0; fi<nF; fi++){
    let Wref = 0, Worb = 0;
    for(let ri=0; ri<ref.nRec; ri++){
      const b = ri*nF + fi;
      Wref += ref.reP[b]*ref.reV[b] + ref.imP[b]*ref.imV[b];
      Worb += orb.reP[b]*orb.reV[b] + orb.imP[b]*orb.imV[b];
    }
    Wref = Math.max(Wref, 1e-30);
    Worb = Math.max(Worb, 1e-30);
    tl[fi] = 10 * Math.log10(Wref / Worb);
  }

  // Display curve: smooth to ~1/3-octave (the per-bin scatter is below the
  // coarse grid's resolution) and clamp to [0, cap]. A passive object can't
  // give negative insertion loss in the far field — sub-zero bins are
  // near-field reactive artefacts of the compact domain, so they floor at 0.
  const tlDisplay = tl.map((_, i) => {
    let s = 0, w = 0; const lf = Math.log(freqs[i]);
    for(let j=0;j<tl.length;j++){ const d = Math.log(freqs[j]) - lf;
      const g = Math.exp(-(d*d)/(2*0.18*0.18)); s += g*tl[j]; w += g; }
    return Math.max(0, Math.min(80, s/w));
  });

  // ka≈1: below ~c/(2πR) the orb is acoustically compact (a point scatterer)
  // and insertion loss is physically ≈0 — TL is only meaningful above it.
  const compactBelow = Math.round(AIR.c / (TWO_PI * R/1000));
  return { freqs, tl, tlDisplay, meta: { n, dx, dt, steps, rRec, cavityR, fMin, fMax,
           cells: n*n*n, recorders: recCells.length, wallLoss, compactBelow } };
}
