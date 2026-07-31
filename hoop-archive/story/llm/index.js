// hoop/story/llm/index.js — the SEGREGATED, RIPPABLE inference adapter. One interface, swappable
// providers, hard off-switch. Delete this whole dir and hoop still runs (the borges discipline: every
// inference path is additive and guarded; the procedural + lexicalEmbed fallbacks are the guarantee).
//
//   makeLLM(env) → { provider, enabled, generate({system,prompt,schema?}) → json|null, embed(text|[]) → vec|[]|null }
//
// Provider is chosen by env.STORY_LLM ('gemini' | 'local' | 'off'), defaulting to whatever is configured:
//   • 'gemini'  → Google AI Studio Gemini 2.5 Flash (free tier; reuses the borges GEMINI_API_KEY hook)
//   • 'local'   → an OpenAI-compatible base URL — HUWUPY'S PLAYGROUND (his nomic embed serve + local
//                 chat model), kept entirely behind this seam so it rips out / swaps cleanly
//   • 'off'     → a disabled stub: generate/embed return null, callers use the procedural path
// generate/embed NEVER throw — they resolve null on any error so the worker's hot path can't break.

import { makeGemini } from './gemini.js';
import { makeLocal } from './local.js';

function disabled(reason) {
  return {
    provider: 'off', enabled: false, reason,
    async generate() { return null; },
    async embed() { return null; },
  };
}

export function makeLLM(env = {}, deps = {}) {
  const fetchImpl = deps.fetch || globalThis.fetch;
  if (typeof fetchImpl !== 'function') return disabled('no-fetch');
  const which = String(env.STORY_LLM || (env.GEMINI_API_KEY ? 'gemini' : env.LLM_BASE_URL ? 'local' : 'off')).toLowerCase();
  if (which === 'gemini') return env.GEMINI_API_KEY ? makeGemini(env, fetchImpl) : disabled('gemini-unconfigured');
  if (which === 'local') return env.LLM_BASE_URL ? makeLocal(env, fetchImpl) : disabled('local-unconfigured');
  return disabled('off');
}

// Pull the first JSON object/array out of a model response (models wrap JSON in prose / code fences).
export function extractJson(text) {
  if (text == null) return null;
  const t = String(text).trim();
  try { return JSON.parse(t); } catch (e) { /* fall through */ }
  for (const [open, close] of [['{', '}'], ['[', ']']]) {
    const a = t.indexOf(open), b = t.lastIndexOf(close);
    if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch (e) { /* next */ } }
  }
  return null;
}
