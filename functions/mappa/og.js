// functions/mappa/og.js — Pages Function: /mappa/og?w=<token>  (or ?seed=)
// Renders the world for a permalink to a PNG link-card image (the zoomed-out
// biome map). Deterministic + content-addressed by the config → cached forever.
import { generateWorld } from '../../mappa/engine.js';
import { renderWorldCard } from '../../mappa/lib/og-render.js';
import { decodeConfig, loadWorld } from '../../mappa/lib/world-share.js';

function atFromQuery(url) {
  const at = url.searchParams.get('at'); if (at) return at;
  const did = url.searchParams.get('did'), rkey = url.searchParams.get('rkey');
  return did && rkey ? 'at://' + did + '/com.minomobi.mappa.world/' + rkey : null;
}
async function configFromQuery(url) {
  const w = url.searchParams.get('w');
  if (w) { const c = decodeConfig(w); if (c) return c; }
  const s = url.searchParams.get('seed');
  if (s != null && s !== '' && !isNaN(+s)) return { seed: (+s) >>> 0, genome: {} };
  const at = atFromQuery(url);
  if (at) { try { const { config } = await loadWorld(at); if (config) return config; } catch (e) { /* fall through */ } }
  return null;
}

export async function onRequest(context) {
  try {
    const url = new URL(context.request.url);
    const cfg = await configFromQuery(url);
    if (!cfg) return new Response('missing ?w / ?seed / ?at', { status: 400 });
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
