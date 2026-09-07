// hopper — the survey, off the main thread. The page posts a level number
// and a tiling; this runs the same engine the page runs, stacks the level's
// packs to the end, and answers with how high that reached — which is where
// the bucket goes. Deterministic, so the answer is the level's forever.

import { level, survey } from "./level.js";

self.onmessage = (e) => {
  const n = e.data && e.data.n, shape = e.data && e.data.shape;
  const lv = level(n, shape);
  const res = survey(lv, (i, reach) => self.postMessage({ n: lv.n, shape: lv.shape, progress: i + 1, of: lv.packs.length, reach }));
  self.postMessage({ n: lv.n, shape: lv.shape, done: true, reach: res.reach, bricks: res.bricks, ticks: res.ticks });
};
