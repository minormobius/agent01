// Worker entry for ocr.mino.mobi (and, once registered, ocr.ascential.work).
//
// Standalone OCR tool: drop an image, get the text (e.g. an activation code)
// out. All OCR runs client-side in Rust/WASM (wasm/codescan_ocr*, built from
// os/crates/codescan-ocr). The worker only does two things:
//
//   1. /api/model — same-origin proxy for the two ocrs model files. They live
//      in an S3 bucket that sends no CORS headers, so the browser can't fetch
//      them directly; we proxy them here and let the edge cache the (immutable)
//      bytes. Whitelisted names only.
//   2. everything else — serve the static assets (index.html, app.js, wasm,
//      styles). `not_found_handling: single-page-application` in wrangler.jsonc
//      makes unknown paths fall back to index.html.

const OCRS_MODELS = {
  'text-detection': 'https://ocrs-models.s3-accelerate.amazonaws.com/text-detection.rten',
  'text-recognition': 'https://ocrs-models.s3-accelerate.amazonaws.com/text-recognition.rten',
};

function jsonResponse(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

async function handleModelProxy(request) {
  const url = new URL(request.url);
  const name = url.searchParams.get('name');
  const target = OCRS_MODELS[name];
  if (!target) {
    return jsonResponse({ ok: false, error: 'unknown model', allowed: Object.keys(OCRS_MODELS) }, 400);
  }

  const upstream = await fetch(target, { cf: { cacheTtl: 31536000, cacheEverything: true } });
  if (!upstream.ok) {
    return jsonResponse({ ok: false, error: `upstream ${upstream.status}` }, 502);
  }

  const headers = new Headers();
  headers.set('content-type', 'application/octet-stream');
  const cl = upstream.headers.get('content-length');
  if (cl) headers.set('content-length', cl);
  headers.set('cache-control', 'public, max-age=31536000, immutable');
  headers.set('access-control-allow-origin', '*');
  return new Response(upstream.body, { status: 200, headers });
}

// /api/read — high-accuracy read of a cropped code via a vision model
// (Gemini 2.5 Flash, the borges pattern). The crop is POSTed as the raw image
// body; the format spec (groups/size/alphabet) rides in the query string so the
// model can be TOLD what it's reading and fix look-alikes at read time. Returns
// { text, confidence?, uncertain? }. Needs the GEMINI_API_KEY worker secret;
// without it the endpoint 503s and the page stays on the local ocrs reader.
function toBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  return btoa(bin);
}

function extractJson(t) {
  try { return JSON.parse(t); } catch { /* fallthrough */ }
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch { /* fallthrough */ } }
  return null;
}

async function handleRead(request, env) {
  if (request.method !== 'POST') return jsonResponse({ error: 'POST only' }, 405);
  if (!env.GEMINI_API_KEY) return jsonResponse({ error: 'AI reader not configured (GEMINI_API_KEY unset)' }, 503);

  const url = new URL(request.url);
  const groups = parseInt(url.searchParams.get('groups') || '', 10);
  const size = parseInt(url.searchParams.get('size') || '', 10);
  const alpha = (url.searchParams.get('alpha') || '').toUpperCase();
  const mime = request.headers.get('content-type') || 'image/jpeg';

  const buf = await request.arrayBuffer();
  if (!buf.byteLength) return jsonResponse({ error: 'empty image' }, 400);
  if (buf.byteLength > 8 * 1024 * 1024) return jsonResponse({ error: 'image too large' }, 413);

  const hasSpec = Number.isFinite(groups) && Number.isFinite(size) && groups > 0 && size > 0;
  const system = 'You are a meticulous OCR engine for short alphanumeric codes printed on labels and screens. You transcribe EXACTLY what is printed, character by character, left-to-right then top-to-bottom. You never invent or omit characters.';
  let user;
  if (hasSpec) {
    const n = groups * size;
    user = `Read the code in this image. It has EXACTLY ${n} characters, arranged as ${groups} groups of ${size}`
      + (alpha
        ? `. The ONLY characters that can appear are: ${alpha}. If a glyph resembles a character outside this set, output the allowed look-alike instead (e.g. if 'O' is not allowed but '0' is, output '0'; likewise I/1, S/5, B/8, Z/2, G/6).`
        : '.')
      + ` Respond with ONLY this JSON: {"chars":"<the ${n} characters, NO spaces>","confidence":<0..1>,"uncertain":[<0-based indices you are unsure about>]}.`;
  } else {
    user = 'Transcribe ALL text visible in this image, exactly as printed, preserving line breaks. Respond with ONLY this JSON: {"text":"<verbatim text, \\n between lines>"}.';
  }

  const body = {
    system_instruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }, { inline_data: { mime_type: mime, data: toBase64(buf) } }] }],
    generationConfig: { temperature: 0, responseMimeType: 'application/json', maxOutputTokens: 512, thinkingConfig: { thinkingBudget: 0 } },
  };
  const model = env.GEMINI_MODEL || 'gemini-2.5-flash';
  const gurl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`;

  let r;
  try {
    r = await fetch(gurl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  } catch {
    return jsonResponse({ error: 'model request failed' }, 502);
  }
  if (!r.ok) return jsonResponse({ error: `model ${r.status}`, detail: (await r.text()).slice(0, 180) }, 502);

  const j = await r.json();
  const cand = (j.candidates || [])[0] || {};
  const txt = (cand.content && cand.content.parts) ? cand.content.parts.map((x) => x.text || '').join('') : '';
  const parsed = extractJson(txt) || {};
  const out = hasSpec
    ? { text: parsed.chars || '', confidence: parsed.confidence, uncertain: parsed.uncertain }
    : { text: parsed.text || '' };
  return jsonResponse(out, 200);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/model') return handleModelProxy(request);
    if (url.pathname === '/api/read') return handleRead(request, env);
    return env.ASSETS.fetch(request);
  },
};
