/* one helper thread of ./pfft.js: given the plan's dims, the shared arrays and its place among the threads, it waits
   for each pass, does its slice of the tasks, counts itself done, and waits again. Its whole life is that loop. */
import { fftPlan } from "./lamp.js";
self.onmessage = (e) => {
  const { dims, ctl: cb, bufs, id, n } = e.data, ctl = new Int32Array(cb), arrs = bufs.map((b) => new Float64Array(b)), plan = fftPlan(dims);
  let gen = Atomics.load(ctl, 0);
  self.postMessage("ready");
  for (;;) {
    Atomics.wait(ctl, 0, gen); gen = Atomics.load(ctl, 0);
    if (Atomics.load(ctl, 6)) break;
    const a = ctl[4], T = plan.tasks(a);
    plan.pass(arrs[ctl[1]], arrs[ctl[2]], ctl[3] === 1, a, Math.floor((T * id) / n), Math.floor((T * (id + 1)) / n));
    Atomics.add(ctl, 5, 1); Atomics.notify(ctl, 5);
  }
};
