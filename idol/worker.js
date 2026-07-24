// idol — the waifu generator. Worker entry: pretty per-girl permalinks, an
// (optional, additive) live-chat inference API, then static assets.
//
// The site is fully functional with NO inference: a persona-conditioned local
// chat engine (js/chat.js) is the canonical voice, deterministic from the same
// seed as her face. /api/chat only does anything when GEMINI_API_KEY is set on
// the worker; any failure there is caught and the client stays on the local
// engine. Nothing here can break asset serving.
//
//   GET  /c/<n>        → index.html (permalink for girl № n)
//   GET  /api/chat     → { configured } capability probe
//   POST /api/chat     → { line, emo, beats } one in-character reply (Gemini)

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname;

    // ── inference API (additive; isolated from asset serving) ──
    try {
      if (p === "/api/chat" && request.method === "GET") {
        return json({ configured: !!env.GEMINI_API_KEY });
      }
      if (p === "/api/chat" && request.method === "POST") return await handleChat(request, env);
    } catch (err) {
      return json({ error: String((err && err.message) || err).slice(0, 300) }, 500);
    }

    // ── girl permalinks → index.html ──
    if (/^\/c\/\d+\/?$/.test(p)) {
      const res = await env.ASSETS.fetch(new Request(new URL("/index.html", url.origin), request));
      return new Response(res.body, { status: res.status, headers: withHeaders(res.headers) });
    }
    // ── everything else: static assets ──
    const res = await env.ASSETS.fetch(request);
    return new Response(res.body, { status: res.status, headers: withHeaders(res.headers) });
  },
};

/* ── POST /api/chat — one in-character reply.
   Body: { system, user } — the client builds the system prompt from her genome
   (persona vector, speech style, memory facts) so the model only has to BE her.
   Returns strict JSON { line, emo, beats[] } validated + clipped here. */
async function handleChat(request, env) {
  if (!env.GEMINI_API_KEY) return json({ error: "inference not configured", configured: false }, 503);
  const inp = await request.json().catch(() => ({}));
  const system = String(inp.system || "").slice(0, 6000);
  const user = String(inp.user || "").slice(0, 2000);
  if (!user) return json({ error: "empty message" }, 400);

  const parsed = await gemini(env, system, user);
  const line = String(parsed.line || "").slice(0, 400);
  if (!line) throw new Error("model returned no line");
  const emo = ["neutral", "joy", "fun", "sorrow", "angry", "surprise", "serious", "menace"].includes(parsed.emo) ? parsed.emo : "neutral";
  const beats = (Array.isArray(parsed.beats) ? parsed.beats : [])
    .filter((b) => ["deadEyes", "holdGaze", "glitch", "blush"].includes(b)).slice(0, 3);
  return json({ line, emo, beats, live: true });
}

/* ── Gemini 2.5 Flash → strict JSON (same posture as borges: thinking off,
   generous output headroom, fence-tolerant parse with a diagnosable error) ── */
function extractJson(text) {
  let t = String(text || "").trim();
  if (t.startsWith("```")) t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  try { return JSON.parse(t); } catch (e) {}
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch (e) {} }
  return null;
}
async function gemini(env, system, user) {
  const u = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + encodeURIComponent(env.GEMINI_API_KEY);
  const body = {
    system_instruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: user }] }],
    generationConfig: {
      temperature: 0.9,
      responseMimeType: "application/json",
      maxOutputTokens: 2048,
      thinkingConfig: { thinkingBudget: 0 },
    },
  };
  const r = await fetch(u, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error("gemini " + r.status + ": " + (await r.text()).slice(0, 200));
  const j = await r.json();
  const cand = (j.candidates || [])[0] || {};
  const text = (cand.content && cand.content.parts) ? cand.content.parts.map((x) => x.text || "").join("") : "";
  const parsed = extractJson(text);
  if (parsed) return parsed;
  const why = cand.finishReason ? (" (finishReason " + cand.finishReason + ")" ) : "";
  throw new Error("model did not return JSON" + why);
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
