// borges — the Book of Sand. Worker entry: pretty per-tale permalinks, an
// (optional, additive) live-inference API, then static assets.
//
// The site is fully functional with NO inference: the procedural telling renders
// client-side and is the canonical fallback, and tale № 1 ships a hand-authored
// telling. The /api/* endpoints only do anything when the secrets are set; any
// failure there is caught and the client stays on the procedural draft. Nothing
// here can break asset serving.
//
// Two inference passes, each frozen to atproto on first render (so /t/<n> never
// drifts), using the repo's shared PdsClient against the morphyx service account:
//   GET  /api/telling/<n>  · POST /api/telling   → com.minomobi.borges.telling  ({movements})
//   GET  /api/banter/<n>   · POST /api/banter    → com.minomobi.borges.banter   ({lines})
// Identity (DID + PDS) is resolved at runtime from BORGES_PDS_HANDLE, so only the
// handle, an app password, and the Gemini key need to be set as secrets.

import { resolveHandle, resolvePds, PdsClient } from "../packages/atproto/pds.js";

const TELLING = "com.minomobi.borges.telling";
const BANTER = "com.minomobi.borges.banter";
let _identity = null; // { did, pds } cached per isolate

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname;

    // ── inference API (additive; isolated from asset serving) ──
    try {
      if (p === "/api/telling" && request.method === "POST") return await handleGenerate(request, env, TELLING, "telling");
      if (p === "/api/banter" && request.method === "POST") return await handleGenerate(request, env, BANTER, "banter");
      const mg = p.match(/^\/api\/(telling|banter)\/(\d+)\/?$/);
      if (mg && request.method === "GET") return await handleRead(parseInt(mg[2], 10), env, mg[1] === "banter" ? BANTER : TELLING);
    } catch (err) {
      return json({ error: String((err && err.message) || err).slice(0, 300) }, 500);
    }

    // ── tale permalinks → tale.html ──
    if (/^\/t\/\d+\/?$/.test(p) || p === "/tale" || p === "/tale/") {
      const res = await env.ASSETS.fetch(new Request(new URL("/tale.html", url.origin), request));
      return new Response(res.body, { status: res.status, headers: withHeaders(res.headers) });
    }
    // ── everything else: static assets ──
    const res = await env.ASSETS.fetch(request);
    return new Response(res.body, { status: res.status, headers: withHeaders(res.headers) });
  },
};

/* ── GET /api/{telling,banter}/<n> — read-only cache lookup (public getRecord) ── */
async function handleRead(n, env, collection) {
  if (!env.BORGES_PDS_HANDLE) return json({ cached: false, configured: false });
  const rec = await readRecord(env, collection, String(n));
  if (rec) return json({ cached: true, record: rec });
  return json({ cached: false, configured: true }, 404);
}

/* ── POST /api/{telling,banter} — render via Gemini, then cache (first-write-wins) ── */
async function handleGenerate(request, env, collection, kind) {
  const inp = await request.json().catch(() => ({}));
  const n = parseInt(inp.n, 10);
  if (!(n >= 1)) return json({ error: "bad page number" }, 400);
  if (!env.GEMINI_API_KEY) return json({ error: "inference not configured" }, 503);

  if (env.BORGES_PDS_HANDLE) {
    const existing = await readRecord(env, collection, String(n));
    if (existing) return json({ cached: true, record: existing });
  }

  const parsed = await gemini(env, String(inp.system || ""), String(inp.user || ""));
  const record = buildRecord(kind, n, inp.meta || {}, parsed);

  let cached = false;
  try {
    if (env.BORGES_PDS_HANDLE && env.BORGES_PDS_PASSWORD) { await writeRecord(env, collection, n, record); cached = true; }
  } catch (e) { /* serve uncached; a later view can retry the write */ }

  return json({ cached, record });
}

/* shape + validate a record from the model's JSON */
function buildRecord(kind, n, meta, parsed) {
  const base = { $type: kind === "banter" ? BANTER : TELLING, n: n, model: "gemini-2.5-flash", createdAt: new Date().toISOString() };
  if (kind === "banter") {
    const lines = (Array.isArray(parsed.lines) ? parsed.lines : []).filter((l) => l && l.line)
      .map((l) => ({ speaker: String(l.speaker || "").slice(0, 64), line: String(l.line || "").slice(0, 600) }));
    if (!lines.length) throw new Error("model returned no banter lines");
    return Object.assign(base, { phase: meta.phase || "", pair: Array.isArray(meta.pair) ? meta.pair : [], lines });
  }
  const movements = (Array.isArray(parsed.movements) ? parsed.movements : []).filter((m) => m && m.body)
    .map((m) => ({ title: String(m.title || "").slice(0, 200), body: String(m.body || "").slice(0, 4000) }));
  if (!movements.length) throw new Error("model returned no movements");
  return Object.assign(base, { teller: meta.teller || "", title: meta.title || "", frame: meta.frame || "", movements });
}

/* ── Gemini 2.5 Flash → strict JSON ── */
async function gemini(env, system, user) {
  const u = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + encodeURIComponent(env.GEMINI_API_KEY);
  const body = {
    system_instruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: user }] }],
    generationConfig: { temperature: 0.7, responseMimeType: "application/json", maxOutputTokens: 4096 },
  };
  const r = await fetch(u, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error("gemini " + r.status + ": " + (await r.text()).slice(0, 200));
  const j = await r.json();
  const text = (((j.candidates || [])[0] || {}).content || {}).parts ? j.candidates[0].content.parts.map((x) => x.text || "").join("") : "";
  try { return JSON.parse(text); } catch (e) { throw new Error("model did not return JSON"); }
}

/* ── identity + records via the repo's shared PdsClient ── */
async function identity(env) {
  if (_identity) return _identity;
  if (!env.BORGES_PDS_HANDLE) return null;
  const did = env.BORGES_PDS_DID || await resolveHandle(env.BORGES_PDS_HANDLE);
  const pds = env.BORGES_PDS_URL || await resolvePds(did);
  _identity = { did, pds };
  return _identity;
}
async function readRecord(env, collection, rkey) {
  const id = await identity(env); if (!id) return null;
  const u = id.pds + "/xrpc/com.atproto.repo.getRecord?repo=" + encodeURIComponent(id.did) + "&collection=" + collection + "&rkey=" + encodeURIComponent(rkey);
  const r = await fetch(u);
  if (r.status === 200) return (await r.json()).value || null;
  return null;
}
async function writeRecord(env, collection, rkey, record) {
  const id = await identity(env);
  const client = new PdsClient(id.pds);
  await client.login(env.BORGES_PDS_HANDLE, env.BORGES_PDS_PASSWORD);
  return client.putRecord(collection, String(rkey), record);
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}
function withHeaders(h) {
  const out = new Headers(h);
  out.set("X-Content-Type-Options", "nosniff");
  out.set("Referrer-Policy", "strict-origin-when-cross-origin");
  return out;
}
