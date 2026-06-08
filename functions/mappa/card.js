// functions/mappa/card.js — Pages Function: /mappa/card?w=<token>  (or ?seed=)
// The unfurlable share URL. Serves per-world Open Graph / Twitter meta so a pasted
// link becomes a rich card (the world's name + its interestingness descriptor +
// the rendered map at /mappa/og), then bounces a human visitor to the live viewer.
import { generateWorld } from '../../mappa/engine.js';
import { worldSignals } from '../../mappa/lib/world-signals.js';
import { worldName } from '../../mappa/lib/names.js';
import { decodeConfig } from '../../mappa/lib/world-share.js';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const w = url.searchParams.get('w'), seed = url.searchParams.get('seed');
  const qs = w ? ('?w=' + encodeURIComponent(w)) : (seed ? ('?seed=' + encodeURIComponent(seed)) : '');
  const appUrl = url.origin + '/mappa/' + qs;
  const imgUrl = url.origin + '/mappa/og' + (qs || '');

  let title = 'mappa — a procedural world', desc = 'An endless, deterministic planet engine: tectonics, climate, biomes, rivers, ore, fossils and deep time.';
  try {
    const cfg = w ? decodeConfig(w) : (seed && !isNaN(+seed) ? { seed: (+seed) >>> 0, genome: {} } : null);
    if (cfg) {
      const world = generateWorld(cfg.seed, { N: Math.min(4000, cfg.n || 3000), ...cfg.genome });
      const s = worldSignals(world);
      title = worldName(world) + ' — a mappa world';
      desc = '★ ' + s.score + '/100 · ' + s.descriptor;
    }
  } catch (e) { /* fall back to the generic card */ }

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="mino.mobi · mappa">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(imgUrl)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="600">
<meta property="og:url" content="${esc(appUrl)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(imgUrl)}">
<link rel="canonical" href="${esc(appUrl)}">
<meta http-equiv="refresh" content="0; url=${esc(appUrl)}">
<style>html,body{height:100%}body{margin:0;background:#070a0c;color:#e8dcc0;font:15px/1.6 system-ui,sans-serif;display:grid;place-items:center;text-align:center}a{color:#c79a48;text-decoration:none}.t{font:600 22px/1.2 ui-serif,Georgia,serif;color:#a9802f;margin-bottom:6px}img{max-width:min(560px,86vw);border-radius:10px;border:1px solid #2c2316;margin:14px 0;display:block}</style>
</head><body><div>
<div class="t">${esc(title)}</div><div>${esc(desc)}</div>
<img src="${esc(imgUrl)}" alt="map of ${esc(title)}" width="1200" height="600">
<div>opening the world… <a href="${esc(appUrl)}">enter ↗</a></div>
<script>location.replace(${JSON.stringify(appUrl)})</script>
</div></body></html>`;
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=86400' } });
}
