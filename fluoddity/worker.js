// Fluoddity worker: a single private route, /api/tts, that proxies ElevenLabs
// text-to-speech for the /clip surface. The ElevenLabs key lives only here (as a
// Cloudflare secret), and the route is gated by an OAuth whitelist so a casual
// visitor can't spend the operator's credits. Everything else → static assets.
//
// Config (operator, one-time):
//   wrangler secret put ELEVENLABS_API_KEY      ← the key, never in the repo
//   set CLIP_WHITELIST in wrangler.jsonc vars    ← comma-separated bsky handles/dids
//   (optional) CLIP_VOICE = an ElevenLabs voice id (default: Rachel)

const DEFAULT_VOICE = '21m00Tcm4TlvDq8ikWAM';   // ElevenLabs "Rachel"
const DEFAULT_MODEL = 'eleven_turbo_v2_5';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/tts') return handleTTS(request, env);
    return env.ASSETS.fetch(request);
  },
};

async function handleTTS(request, env) {
  if (request.method !== 'POST') return j({ error: 'POST only' }, 405);
  if (!env.ELEVENLABS_API_KEY) return j({ error: 'voiceover not configured (ELEVENLABS_API_KEY unset)' }, 503);

  // 1) authenticate the caller through the shared auth worker
  const authz = request.headers.get('Authorization') || '';
  if (!/^Bearer /.test(authz)) return j({ error: 'sign in required' }, 401);
  let me;
  try {
    const r = await fetch('https://auth.mino.mobi/api/me', { headers: { Authorization: authz } });
    if (!r.ok) return j({ error: 'session invalid' }, 401);
    me = await r.json();
  } catch { return j({ error: 'auth check failed' }, 502); }

  // 2) whitelist (handles or DIDs, comma-separated in CLIP_WHITELIST). /api/me
  //    sometimes returns the DID in the handle field, so we also resolve any
  //    handle-shaped entries to DIDs and match on me.did.
  const allow = (env.CLIP_WHITELIST || '').split(',').map(s => s.trim().toLowerCase().replace(/^@/, '')).filter(Boolean);
  const handle = (me.handle || '').toLowerCase();
  const did = (me.did || '').toLowerCase();
  let ok = allow.includes(handle) || allow.includes(did);
  if (!ok && did) {
    for (const entry of allow) {
      if (entry.startsWith('did:')) continue;
      try {
        const r = await fetch(`https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(entry)}`);
        if (r.ok) { const d = ((await r.json()).did || '').toLowerCase(); if (d && d === did) { ok = true; break; } }
      } catch { /* keep checking other entries */ }
    }
  }
  if (!ok) {
    return j({ error: `${me.handle || me.did || 'you'} is not on the clip whitelist` }, 403);
  }

  // 3) ElevenLabs TTS → stream the audio back (same-origin, no CORS needed)
  let body;
  try { body = await request.json(); } catch { return j({ error: 'bad body' }, 400); }
  const text = (body.text || '').toString().slice(0, 2500);
  if (!text.trim()) return j({ error: 'no text' }, 400);
  const voice = (body.voice_id || env.CLIP_VOICE || DEFAULT_VOICE).toString().replace(/[^A-Za-z0-9]/g, '') || DEFAULT_VOICE;

  let el;
  try {
    el = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}`, {
      method: 'POST',
      headers: { 'xi-api-key': env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text, model_id: body.model_id || DEFAULT_MODEL, voice_settings: { stability: 0.4, similarity_boost: 0.75, style: 0.0 } }),
    });
  } catch (e) { return j({ error: 'elevenlabs unreachable: ' + (e.message || e) }, 502); }
  if (!el.ok) return j({ error: `elevenlabs ${el.status}: ${(await el.text().catch(() => '')).slice(0, 200)}` }, 502);
  return new Response(el.body, { status: 200, headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' } });
}

function j(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}
