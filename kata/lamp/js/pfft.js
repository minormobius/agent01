/* LAVALAMP's threaded FFT: lamp.js's fftPlan passes, split across threads that share the arrays (SharedArrayBuffer,
   which needs the page cross-origin isolated: kata/_headers gives /lamp/ the two headers). The solver's worker is
   thread 0; helpers (./pfft-helper.js) are the rest. For each pass the solver writes which arrays, which direction and
   which axis into a shared control block, bumps its generation and wakes the helpers; every thread does its slice of
   the pass's tasks; the solver waits until all have counted themselves done, then starts the next axis. No messages
   per pass: only Atomics.wait / notify on shared memory.
   control: [0] generation, [1] re's index, [2] im's index, [3] inverse, [4] axis, [5] done count, [6] stop */
import { fftPlan } from "./lamp.js";
export async function makeThreadedFFT(dims, nThreads, arrays) {
  const plan = fftPlan(dims), ctl = new Int32Array(new SharedArrayBuffer(4 * 8)), helpers = [];
  for (let i = 1; i < nThreads; i++) helpers.push(new Worker(new URL("./pfft-helper.js", import.meta.url), { type: "module" }));
  await Promise.all(helpers.map((w, i) => new Promise((res, rej) => { w.onmessage = () => res(); w.onerror = rej; w.postMessage({ dims, ctl: ctl.buffer, bufs: arrays.map((a) => a.buffer), id: i + 1, n: nThreads }); })));
  const slice = (a, id) => { const T = plan.tasks(a); return [Math.floor((T * id) / nThreads), Math.floor((T * (id + 1)) / nThreads)]; };
  function fft(re, im, inverse = false) {
    const ir = arrays.indexOf(re), ii = arrays.indexOf(im);
    if (ir < 0 || ii < 0) throw new Error("threaded FFT: an array it wasn't given");
    for (let a = 0; a < plan.D; a++) {
      ctl[1] = ir; ctl[2] = ii; ctl[3] = inverse ? 1 : 0; ctl[4] = a; Atomics.store(ctl, 5, 0);
      Atomics.add(ctl, 0, 1); Atomics.notify(ctl, 0);
      const [t0, t1] = slice(a, 0); plan.pass(re, im, inverse, a, t0, t1);
      let d; while ((d = Atomics.load(ctl, 5)) < nThreads - 1) Atomics.wait(ctl, 5, d);
    }
  }
  function close() { Atomics.store(ctl, 6, 1); Atomics.add(ctl, 0, 1); Atomics.notify(ctl, 0); for (const w of helpers) w.terminate(); }
  return { fft, close, threads: nThreads };
}
