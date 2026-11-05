/* ATOM⁴ — the Bluminium viewer's solver thread: js/multiplet.js's levels() off the page's own thread, so a slider never
   freezes it (a 4D d⁴ block is 1296 determinants, seconds). Told the angular tensors once, then one request at a time:
   { id, m, n, H, F, beta, list: [s…] } → { id, out: [levels…] } */
import { levels } from "./multiplet.js";
let A = {};
self.onmessage = ({ data }) => {
  if (data.init) { A = { 5: data.A3, 9: data.A4 }; return; }
  const { id, m, n, H, F, beta, list } = data;
  try { self.postMessage({ id, out: list.map((s) => levels(m, n, H, s, { m, A: A[m] }, F, beta)) }); }
  catch (e) { self.postMessage({ id, error: String(e.message || e) }); }
};
