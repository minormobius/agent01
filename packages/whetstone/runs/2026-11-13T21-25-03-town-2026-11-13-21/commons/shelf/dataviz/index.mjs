// packages/dataviz — ESM facade.
//
// The two core files (stats.js, charts.js) are written as globals-attaching
// IIFEs so one copy works via <script src>, via side-effect `import` in a
// Cloudflare Worker, and in node. This facade gives module consumers a clean
// named API over the same code, with no duplication.
//
//   import { stats, charts } from '../../packages/dataviz/index.mjs';
//   const fit = stats.ols(xs.map(x => [x]), ys);
//   const svg = charts.scatterFit({ points, xlabel: 'x', ylabel: 'y' });
//
// Static sites that cannot import across directories should instead serve a
// synced copy of the two files (see README.md, and scripts/sync-dataviz.mjs).

import "./stats.js";
import "./charts.js";

export const stats = globalThis.WORMHOLE_STATS;
export const charts = globalThis.WORMHOLE_CHARTS;
export default { stats, charts };
