// check-worker.js — the library's checks, off the main thread. The page sends a
// spec; each group of checks is posted as it finishes, so the badge fills in while
// the figure keeps walking. A newer spec does not queue behind an old one: the page
// terminates this worker and starts another.

import { checkProportion, checkSilhouette, checkForm, checkWalk, checkPoses, checkFace, checkHair, checkClothes, checkHands } from '../vendor/figure/lib/check.js';

self.onmessage = ({ data: { id, spec } }) => {
  const steps = [
    ['proportion', () => checkProportion(spec)],
    ['silhouette', () => [...checkSilhouette(spec), ...checkForm(spec)]],
    ['walk', () => checkWalk(spec)],
    ['poses', () => checkPoses(spec)],
    ...(spec.face ? [['face', () => checkFace(spec)]] : []),
    ...(spec.hair ? [['hair', () => checkHair(spec)]] : []),
    ...(spec.outfit ? [['clothes', () => checkClothes(spec)]] : []),
    ['hands', () => checkHands(spec)],
  ];
  steps.forEach(([group, run], i) => {
    let res;
    try { res = run(); } catch (e) { res = [{ name: `${group}: ${e.message}`, ok: false }]; }
    self.postMessage({ id, group, res: res.map(({ name, ok }) => ({ name, ok })), done: i + 1, of: steps.length });
  });
};
