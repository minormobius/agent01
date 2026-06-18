// hoop/story/llm/gemini.js — Google AI Studio Gemini 2.5 Flash, ported from borges/worker.js. Free
// tier; the GEMINI_API_KEY secret is the same one borges uses. Both calls resolve null on any failure
// (never throw) so the worker's guard chain stays simple.

import { extractJson } from './index.js';

const GEN_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=';
const EMBED_URL = 'https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=';

export function makeGemini(env, fetchImpl) {
  const key = env.GEMINI_API_KEY;
  const provider = 'gemini-2.5-flash';

  async function generate({ system, prompt, schema } = {}) {
    try {
      const sys = [system, schema ? `Respond ONLY with JSON matching this shape: ${JSON.stringify(schema)}` : '']
        .filter(Boolean).join('\n\n');
      const body = {
        contents: [{ role: 'user', parts: [{ text: prompt || '' }] }],
        ...(sys ? { systemInstruction: { parts: [{ text: sys }] } } : {}),
        generationConfig: { temperature: 0.9, ...(schema ? { responseMimeType: 'application/json' } : {}) },
      };
      const r = await fetchImpl(GEN_URL + encodeURIComponent(key), {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      });
      if (!r.ok) return null;
      const j = await r.json();
      const text = j?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
      return schema ? extractJson(text) : text;
    } catch (e) { return null; }
  }

  // embed one string → vector, or an array of strings → array of vectors (sequential; small corpus).
  async function embedOne(text) {
    try {
      const r = await fetchImpl(EMBED_URL + encodeURIComponent(key), {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'models/text-embedding-004', content: { parts: [{ text: String(text || '') }] } }),
      });
      if (!r.ok) return null;
      const j = await r.json();
      return j?.embedding?.values || null;
    } catch (e) { return null; }
  }
  async function embed(input) {
    if (Array.isArray(input)) { const out = []; for (const t of input) out.push(await embedOne(t)); return out; }
    return embedOne(input);
  }

  return { provider, enabled: true, generate, embed };
}
