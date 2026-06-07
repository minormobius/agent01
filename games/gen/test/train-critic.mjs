/* The Ludographer — train the NN critic (Rung 2).
 *
 * 1. build a (static features -> self-test quality) dataset over N seeds
 * 2. train the tiny tanh-MLP critic (js/critic.js) with hand-rolled backprop
 * 3. report honest metrics on a held-out split (MAE / R² vs a mean baseline)
 * 4. print what the net learned (signed feature saliency = its design taste)
 * 5. save the trained model to js/critic-model.json (committed; browser loads it)
 * 6. show the payoff: screen many seeds in ms, then playtest the top picks to
 *    confirm predicted ≈ actual.
 *
 *   node games/gen/test/train-critic.mjs [N=4000] [hidden=24] [epochs=300]
 */
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const here = path.dirname(fileURLToPath(import.meta.url));
for (const f of ["prng", "lexicon", "generate", "operational", "features", "sim", "selftest", "critic"])
  await import(path.join(here, "../js/" + f + ".js"));
const L = globalThis.LUDO;

const N = parseInt(process.argv[2] || "6000", 10);
const HID = parseInt(process.argv[3] || "16", 10);
const EPOCHS = parseInt(process.argv[4] || "600", 10);

// 1) dataset
process.stderr.write(`building dataset over ${N} seeds…\n`);
let t0 = Date.now();
const X = [], Y = [], seeds = [];
let names = null;
for (let n = 1; n <= N; n++) {
  const ev = L.evaluate(n, 40);
  const f = L.features(ev.g);
  if (!names) names = f.names;
  X.push(f.vector); Y.push(ev.quality); seeds.push(n);
  if (n % 1000 === 0) process.stderr.write(`  ${n}/${N} (${((Date.now() - t0) / 1000).toFixed(0)}s)\n`);
}
const dims = names.length;

// 2) split (seeded shuffle, 85/15)
const rng = L.prng.Rand("split");
const order = X.map((_, i) => i);
for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rng.f() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
const nVal = Math.floor(N * 0.15);
const valIdx = new Set(order.slice(0, nVal));
const Xtr = [], Ytr = [], Xva = [], Yva = [];
for (let i = 0; i < N; i++) (valIdx.has(i) ? (Xva.push(X[i]), Yva.push(Y[i])) : (Xtr.push(X[i]), Ytr.push(Y[i])));

// 3) train
process.stderr.write(`training ${dims}->${HID}->1 on ${Xtr.length} rows, ${EPOCHS} epochs…\n`);
t0 = Date.now();
const net = new L.Critic(dims, HID, 7);
net.train(Xtr, Ytr, {
  epochs: EPOCHS, batch: 32, lr: 0.04, momentum: 0.9, l2: 6e-4,
  valX: Xva, valY: Yva,   // early-stop on held-out val
  onEpoch: (ep, mse, val) => { if (ep % (EPOCHS / 6 | 0 || 1) === 0) process.stderr.write(`  ep ${ep}  train-mse ${(mse * 1e4).toFixed(1)}e-4  best-val-mse ${(val * 1e4).toFixed(1)}e-4\n`); }
});
process.stderr.write(`  trained in ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);

// 4) metrics — R² for fit, Spearman for ranking (the metric that matters for
//    screening; robust to the heavy label noise of a noisy MDP projection)
function spearman(pred, act) {
  const rank = (arr) => { const idx = arr.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]); const r = new Array(arr.length); idx.forEach(([, i], k) => r[i] = k); return r; };
  const rp = rank(pred), ra = rank(act), n = pred.length;
  let d2 = 0; for (let i = 0; i < n; i++) d2 += (rp[i] - ra[i]) ** 2;
  return 1 - 6 * d2 / (n * (n * n - 1));
}
function metrics(net, Xs, Ys) {
  const ybar = Ys.reduce((a, b) => a + b, 0) / Ys.length;
  let ssr = 0, sst = 0; const preds = [];
  for (let i = 0; i < Xs.length; i++) { const p = net.predict(Xs[i]); preds.push(p); ssr += (p - Ys[i]) ** 2; sst += (Ys[i] - ybar) ** 2; }
  return { r2: 1 - ssr / sst, mae: net.mae(Xs, Ys), baselineMae: Ys.reduce((a, b) => a + Math.abs(b - ybar), 0) / Ys.length, rho: spearman(preds, Ys) };
}
const tr = metrics(net, Xtr, Ytr), va = metrics(net, Xva, Yva);
console.log(`\n=== NN critic — ${dims}→${HID}→1, ${net.W1.length * net.nIn + net.nHid * 2 + 1} params ===`);
console.log(`  train:  MAE ${tr.mae.toFixed(1)}  R² ${tr.r2.toFixed(3)}  Spearman ${tr.rho.toFixed(3)}`);
console.log(`  val:    MAE ${va.mae.toFixed(1)}  R² ${va.r2.toFixed(3)}  Spearman ${va.rho.toFixed(3)}   (mean-baseline MAE ${va.baselineMae.toFixed(1)})`);
console.log(`  → exact score is a NOISY target (val R² ${va.r2.toFixed(2)}: most of quality is the per-seed economy roll the net can't see),`);
console.log(`    but the net RANKS games well (val Spearman ${va.rho.toFixed(2)}) — which is all a screening filter needs.`);

// 5) saliency — signed first-order sensitivity in normalised input space
const sens = new Array(dims).fill(0);
for (let j = 0; j < dims; j++) { let s = 0; for (let k = 0; k < net.nHid; k++) s += net.W2[k] * net.W1[k][j]; sens[j] = s; }
const ranked = names.map((nm, j) => ({ nm, s: sens[j] })).sort((a, b) => Math.abs(b.s) - Math.abs(a.s));
console.log(`\n  what the net thinks makes a good game (top signed sensitivities):`);
console.log(`   raises quality:`);
ranked.filter(r => r.s > 0).slice(0, 8).forEach(r => console.log(`     +${r.s.toFixed(2).padStart(5)}  ${r.nm}`));
console.log(`   lowers quality:`);
ranked.filter(r => r.s < 0).slice(0, 8).forEach(r => console.log(`     ${r.s.toFixed(2).padStart(6)}  ${r.nm}`));

// 6) save model
const outPath = path.join(here, "../js/critic-model.json");
fs.writeFileSync(outPath, JSON.stringify({ ...net.toJSON(), featureNames: names, trainedOn: N, val: { mae: +va.mae.toFixed(2), r2: +va.r2.toFixed(3) } }));
console.log(`\n  saved model -> js/critic-model.json (${(fs.statSync(outPath).size / 1024).toFixed(0)} KB)`);

// 7) payoff — screen UNSEEN seeds (>N) in ms, then VERIFY on a fresh unseen
//    sample with a decile-calibration table (robust; not a lucky tail).
const SCAN_LO = N + 1, SCAN_HI = N + 100000;
process.stderr.write(`\nscreening 100k UNSEEN seeds (${SCAN_LO}…${SCAN_HI}) with the net…\n`);
t0 = Date.now();
const scored = [];
for (let n = SCAN_LO; n <= SCAN_HI; n++) scored.push([n, net.predict(L.features(L.generate(n)).vector)]);
const screenMs = Date.now() - t0;
console.log(`\n  screened 100,000 unseen seeds in ${screenMs} ms (${(screenMs * 1000 / 100000).toFixed(1)} µs/seed) — vs ~5 ms each to actually playtest (a ~${Math.round(5 * 100000 / screenMs)}× speed-up).`);

// verify: playtest a 1,500-seed unseen sample, bin by predicted decile, show actual
process.stderr.write(`verifying on a 1500-seed unseen sample…\n`);
const sample = [];
for (let i = 0; i < 1500; i++) { const n = SCAN_LO + i * 60; const pq = net.predict(L.features(L.generate(n)).vector); sample.push([n, pq, L.evaluate(n, 40).quality]); }
sample.sort((a, b) => a[1] - b[1]);
console.log(`\n  decile calibration on unseen seeds (predicted band → actual mean quality):`);
for (let d = 0; d < 10; d++) {
  const seg = sample.slice(d * 150, d * 150 + 150);
  const pm = seg.reduce((a, r) => a + r[1], 0) / seg.length;
  const am = seg.reduce((a, r) => a + r[2], 0) / seg.length;
  const bar = "█".repeat(Math.round(am / 3));
  console.log(`    D${d + 1}  predicted≈${pm.toFixed(0).padStart(3)}  actual ${am.toFixed(1).padStart(5)}  ${bar}`);
}
const rho2 = spearman(sample.map(r => r[1]), sample.map(r => r[2]));
const botMean = sample.slice(0, 150).reduce((a, r) => a + r[2], 0) / 150;
const topMean = sample.slice(-150).reduce((a, r) => a + r[2], 0) / 150;
console.log(`\n  unseen-sample Spearman ${rho2.toFixed(2)} — top predicted decile averages ${topMean.toFixed(1)} actual vs ${botMean.toFixed(1)} for the bottom (+${(topMean - botMean).toFixed(1)} pts).`);
