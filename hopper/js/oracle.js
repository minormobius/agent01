// hopper — the survey, off the main thread. The page posts a level number;
// this runs the same engine the page runs, stacks the level's packs to the
// end, and answers with how high that reached — which is where the bucket
// goes. Deterministic, so the answer is the level's forever.

import { level, survey } from "./level.js";

self.onmessage = (e) => {
  const n = e.data && e.data.n;
  const lv = level(n);
  const res = survey(lv, (i, reach) => self.postMessage({ n: lv.n, progress: i + 1, of: lv.packs.length, reach }));
  self.postMessage({ n: lv.n, done: true, reach: res.reach, bricks: res.bricks, ticks: res.ticks });
};
