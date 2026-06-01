// borges — the Book of Sand. Worker entry: pretty per-tale permalinks, an
// (optional, additive) live-telling API, then static assets.
//
// The site is fully functional with NO inference: the procedural telling renders
// client-side and is the canonical fallback. The /api/telling endpoints only do
// anything when the secrets are set; any failure there is caught and the client
// stays on the procedural draft. Nothing here can break asset serving.
//
// Live path (Gemini render → atproto cache):
//   GET  /api/telling/<n>  — read the cached telling from the service PDS (public)
//   POST /api/telling      — render via Gemini and write the record (first-write-wins)
// The deterministic spec (mythograph, Propp spine, cast, motifs) stays canonical;
// the model only renders the prose, and the first rendering is frozen as the
// com.minomobi.borges.telling record at rkey = n, so /t/<n> never drifts.

const COLLECTION = "com.minomobi.borges.telling";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname;

    // ── live-telling API (additive; isolated from asset serving) ──
    try {
      if (p === "/api/telling" && request.method === "POST") return await handleGenerate(request, env);
      const mg = p.match(/^\/api\/telling\/(\d+)\/?$/);
      if (mg && request.method === "GET") return await handleRead(parseInt(mg[1], 10), env);
    } catch (err) {
      return json({ error: String(err && err.message || err).slice(0, 300) }, 500);
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

/* ── GET /api/telling/<n> — read-only cache lookup on the service PDS (public) ── */
async function handleRead(n, env) {
  if (!env.BORGES_PDS_URL || !env.BORGES_PDS_DID) return json({ cached: false, configured: false });
  const rec = await pdsGetRecord(env, String(n));
  if (rec) return json({ cached: true, telling: rec });
  return json({ cached: false, configured: true }, 404);
}

/* ── POST /api/telling — render via Gemini, then cache to the PDS (first wins) ── */
async function handleGenerate(request, env) {
  const inp = await request.json().catch(() => ({}));
  const n = parseInt(inp.n, 10);
  if (!(n >= 1)) return json({ error: "bad page number" }, 400);
  if (!env.GEMINI_API_KEY) return json({ error: "inference not configured" }, 503);

  // first-write-wins: if it already exists, return the frozen telling
  if (env.BORGES_PDS_URL && env.BORGES_PDS_DID) {
    const existing = await pdsGetRecord(env, String(n));
    if (existing) return json({ cached: true, telling: existing });
  }

  const out = await gemini(env, String(inp.system || ""), String(inp.user || ""));
  const record = {
    "$type": COLLECTION,
    n: n,
    teller: (inp.meta && inp.meta.teller) || "",
    title: (inp.meta && inp.meta.title) || "",
    frame: (inp.meta && inp.meta.frame) || "",
    movements: out.movements,
    model: out.model,
    createdAt: new Date().toISOString(),
  };

  let cached = false;
  try {
    if (env.BORGES_PDS_URL && env.BORGES_PDS_HANDLE && env.BORGES_PDS_PASSWORD) {
      const session = await pdsCreateSession(env);
      await pdsPutRecord(env, session, String(n), record);
      cached = true;
    }
  } catch (e) { /* serve uncached; a later view can retry the write */ }

  return json({ cached, telling: record });
}

/* ── Gemini 2.5 Flash: render the telling as strict JSON ── */
async function gemini(env, system, user) {
  const model = "gemini-2.5-flash";
  const u = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + encodeURIComponent(env.GEMINI_API_KEY);
  const body = {
    system_instruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: user }] }],
    generationConfig: { temperature: 0.7, responseMimeType: "application/json", maxOutputTokens: 4096 },
  };
  const r = await fetch(u, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error("gemini " + r.status + ": " + (await r.text()).slice(0, 200));
  const j = await r.json();
  const text = (((j.candidates || [])[0] || {}).content || {}).parts ?
    j.candidates[0].content.parts.map((x) => x.text || "").join("") : "";
  let parsed;
  try { parsed = JSON.parse(text); } catch (e) { throw new Error("model did not return JSON"); }
  const movements = Array.isArray(parsed.movements) ? parsed.movements
    .filter((m) => m && m.body)
    .map((m) => ({ title: String(m.title || "").slice(0, 200), body: String(m.body || "").slice(0, 4000) })) : [];
  if (!movements.length) throw new Error("model returned no movements");
  return { movements, model };
}

/* ── minimal atproto helpers (read public, write with a session) ── */
async function pdsGetRecord(env, rkey) {
  const u = env.BORGES_PDS_URL + "/xrpc/com.atproto.repo.getRecord?repo=" +
    encodeURIComponent(env.BORGES_PDS_DID) + "&collection=" + COLLECTION + "&rkey=" + encodeURIComponent(rkey);
  const r = await fetch(u);
  if (r.status === 200) { const j = await r.json(); return j.value || null; }
  return null;
}
async function pdsCreateSession(env) {
  const r = await fetch(env.BORGES_PDS_URL + "/xrpc/com.atproto.server.createSession", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifier: env.BORGES_PDS_HANDLE, password: env.BORGES_PDS_PASSWORD }),
  });
  if (!r.ok) throw new Error("createSession " + r.status);
  return await r.json(); // { did, accessJwt, ... }
}
async function pdsPutRecord(env, session, rkey, record) {
  const r = await fetch(env.BORGES_PDS_URL + "/xrpc/com.atproto.repo.putRecord", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer " + session.accessJwt },
    body: JSON.stringify({ repo: session.did, collection: COLLECTION, rkey: String(rkey), record }),
  });
  if (!r.ok) throw new Error("putRecord " + r.status + ": " + (await r.text()).slice(0, 200));
  return await r.json();
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
