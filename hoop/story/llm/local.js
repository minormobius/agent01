// hoop/story/llm/local.js — HUWUPY'S PLAYGROUND seam. An OpenAI-compatible client (chat/completions +
// embeddings) so a local model — his llama.cpp chat serve + the nomic-embed-text serve from
// hoop-backend/lib/llm.py — drops straight in behind the adapter with no other change. Kept here,
// isolated, so it rips out cleanly and the shared canon stays separable (provenance 'local:<model>').
//
// Config (env): LLM_BASE_URL (chat), LLM_MODEL (default 'local'); EMBED_BASE_URL (defaults to LLM_BASE_URL),
// EMBED_MODEL (default 'nomic-embed-text-v1.5'); optional LLM_API_KEY (bearer, if his serve wants one).
// This mirrors the backend's lib/llm.py routing so his existing prompts/serve carry over. Resolves null
// on any failure (never throws). When he pulls his serve into the repo for review, it lands here.

import { extractJson } from './index.js';

export function makeLocal(env, fetchImpl) {
  const base = String(env.LLM_BASE_URL || '').replace(/\/$/, '');
  const model = env.LLM_MODEL || 'local';
  const embedBase = String(env.EMBED_BASE_URL || env.LLM_BASE_URL || '').replace(/\/$/, '');
  const embedModel = env.EMBED_MODEL || 'nomic-embed-text-v1.5';
  const provider = 'local:' + model;
  const auth = env.LLM_API_KEY ? { authorization: 'Bearer ' + env.LLM_API_KEY } : {};
  const headers = { 'content-type': 'application/json', ...auth };

  async function generate({ system, prompt, schema } = {}) {
    try {
      const sys = [system, schema ? `Respond ONLY with JSON matching this shape: ${JSON.stringify(schema)}` : '']
        .filter(Boolean).join('\n\n');
      const messages = [...(sys ? [{ role: 'system', content: sys }] : []), { role: 'user', content: prompt || '' }];
      const r = await fetchImpl(base + '/v1/chat/completions', {
        method: 'POST', headers, body: JSON.stringify({ model, messages, temperature: 0.9 }),
      });
      if (!r.ok) return null;
      const j = await r.json();
      const text = j?.choices?.[0]?.message?.content || '';
      return schema ? extractJson(text) : text;
    } catch (e) { return null; }
  }

  async function embed(input) {
    try {
      const r = await fetchImpl(embedBase + '/v1/embeddings', {
        method: 'POST', headers, body: JSON.stringify({ model: embedModel, input }),
      });
      if (!r.ok) return null;
      const j = await r.json();
      const vecs = (j?.data || []).map((d) => d.embedding);
      return Array.isArray(input) ? vecs : (vecs[0] || null);
    } catch (e) { return null; }
  }

  return { provider, enabled: true, generate, embed };
}
