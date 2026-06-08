// functions/mappa/og.js — Pages Function: /mappa/og?w=<token>  (or ?seed=)
// Renders the world for a permalink to a PNG link-card image (the zoomed-out
// biome map). Deterministic + content-addressed by the config → cached forever.
import { generateWorld } from '../../mappa/engine.js';
import { renderWorldCard } from '../../mappa/lib/og-render.js';
import { decodeConfig } from '../../mappa/lib/world-share.js';

function configFromQuery(url) {
  const w = url.searchParams.get('w');
  if (w) { const c = decodeConfig(w); if (c) return c; }
  const s = url.searchParams.get('seed');
  if (s != null && s !== '' && !isNaN(+s)) return { seed: (+s) >>> 0, genome: {} };
  return null;
}

export async function onRequest(context) {
  try {
    const url = new URL(context.request.url);
    const cfg = configFromQuery(url);
    if (!cfg) return new Response('missing ?w or ?seed', { status: 400 });
    const N = Math.min(4000, cfg.n || 3000);                  // coarse mesh: fast, plenty for a card
    const world = generateWorld(cfg.seed, { N, ...cfg.genome });
    const png = await renderWorldCard(world, { width: 1200, height: 600 });
    return new Response(png, {
      headers: {
        'content-type': 'image/png',
        'cache-control': 'public, max-age=31536000, immutable',
        'access-control-allow-origin': '*',
      },
    });
  } catch (e) {
    return new Response('og render error: ' + (e && e.message || e), { status: 500 });
  }
}
