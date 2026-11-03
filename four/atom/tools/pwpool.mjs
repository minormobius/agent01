/* k-points shared out to worker threads for js/pw.js's SCF (a runner has four cores; a 4D crystal needs them). Each
   worker rebuilds the species from a recipe (makePseudo arguments: a pseudopotential's transforms are closures, which
   can't be sent), holds its share of the k-points and their bands between iterations, and answers through shared
   memory, so the SCF loop stays synchronous (the main thread blocks in Atomics.wait).
     const pool = makePool(recipe, nWorkers); pw.scf({ pool }); pool.nonlocalForces(); pool.close();
   recipe: { d, H, atoms, ecut, nelec, nbands, kpts, pseudos: { key: { args (for makePseudo), qmax } } } */
import { Worker, isMainThread, workerData } from "node:worker_threads";
import { makePseudo, forPW } from "../js/pseudo.js";
import { PW } from "../js/pw.js";

export function speciesFrom(pseudos) { return Object.fromEntries(Object.entries(pseudos).map(([k, p]) => [k, forPW(makePseudo(p.args), { qmax: p.qmax })])); }

export function makePool(recipe, nw) {
  const nk = recipe.kpts.length; nw = Math.max(1, Math.min(nw, nk));
  const share = Array.from({ length: nw }, (_, w) => recipe.kpts.map((_, i) => i).filter((i) => i % nw === w));
  const probe = new PW({ ...recipe, species: speciesFrom(recipe.pseudos), kpts: [recipe.kpts[0]] }), ntot = probe.ntot, na = recipe.atoms.length, d = recipe.d;
  const ctrl = new Int32Array(new SharedArrayBuffer(4 * (3 * nw + 1))), V = new Float64Array(new SharedArrayBuffer(8 * ntot));
  const bufs = share.map((ks) => ({ rho: new Float64Array(new SharedArrayBuffer(8 * ntot)), scal: new Float64Array(new SharedArrayBuffer(8 * 4)), eig: new Float64Array(new SharedArrayBuffer(8 * ks.length * recipe.nbands)), nlf: new Float64Array(new SharedArrayBuffer(8 * na * d)) }));
  const workers = share.map((ks, w) => new Worker(new URL(import.meta.url), { workerData: { recipe: { ...recipe, kpts: ks.map((i) => recipe.kpts[i]) }, w, ctrl, V, buf: bufs[w], nw } }));
  for (let w = 0; w < nw; w++) Atomics.wait(ctrl, 3 * w + 2, 0); // each worker sets its ready flag once built
  const cmd = (code, iters = 0) => { for (let w = 0; w < nw; w++) { bufs[w].scal[3] = iters; Atomics.store(ctrl, 3 * w + 1, 0); Atomics.store(ctrl, 3 * w, code); Atomics.notify(ctrl, 3 * w); }
    for (let w = 0; w < nw; w++) Atomics.wait(ctrl, 3 * w + 1, 0); };
  return {
    nw, share,
    run(Vin, iters) { V.set(Vin); cmd(1, iters); const rho = new Float64Array(ntot); let kin = 0, nl = 0, res = 0; const eigs = new Array(nk);
      bufs.forEach((b, w) => { for (let j = 0; j < ntot; j++) rho[j] += b.rho[j]; kin += b.scal[0]; nl += b.scal[1]; res = Math.max(res, b.scal[2]); share[w].forEach((ki, s) => (eigs[ki] = Array.from(b.eig.subarray(s * recipe.nbands, (s + 1) * recipe.nbands)))); });
      return { rho, kin, nl, res, eigs }; },
    nonlocalForces() { cmd(2); const F = Array.from({ length: na }, () => new Float64Array(d)); for (const b of bufs) for (let i = 0; i < na; i++) for (let c = 0; c < d; c++) F[i][c] += b.nlf[i * d + c]; return F; },
    close() { cmd(3); workers.forEach((w) => w.terminate()); },
  };
}

if (!isMainThread && workerData?.recipe) {
  const { recipe, w, ctrl, V, buf } = workerData, pw = new PW({ ...recipe, species: speciesFrom(recipe.pseudos) });
  let states = recipe.kpts.map(() => null);
  Atomics.store(ctrl, 3 * w + 2, 1); Atomics.notify(ctrl, 3 * w + 2);
  for (;;) {
    Atomics.wait(ctrl, 3 * w, 0); const code = Atomics.load(ctrl, 3 * w);
    if (code === 1) { const iters = buf.scal[3]; states = states.map((s, ki) => pw.bands(ki, V, s?.X, { iters }));
      buf.rho.set(pw.density(states)); const be = pw.bandEnergies(states); buf.scal[0] = be.kin; buf.scal[1] = be.nl; buf.scal[2] = Math.max(...states.map((s) => s.res));
      states.forEach((s, i) => buf.eig.set(s.e.slice(0, recipe.nbands), i * recipe.nbands)); }
    else if (code === 2) { pw.nonlocalForces(states).forEach((f, i) => buf.nlf.set(f, i * recipe.d)); }
    Atomics.store(ctrl, 3 * w, 0); Atomics.store(ctrl, 3 * w + 1, 1); Atomics.notify(ctrl, 3 * w + 1);
    if (code === 3) break;
  }
}
