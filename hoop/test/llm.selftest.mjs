// llm.selftest.mjs — pins the segregated inference adapter (hoop/story/llm/): provider routing, the
// hard off-switch, the never-throw contract, JSON extraction, and that gemini/local hit the right
// endpoints + parse — all with an INJECTED fake fetch (no network, fully node-testable).
// Run: node hoop/test/llm.selftest.mjs
import { makeLLM, extractJson } from '../story/llm/index.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };

// ── extractJson: bare, fenced, and prose-wrapped ──
ok(extractJson('{"a":1}').a === 1, 'extractJson parses bare JSON');
ok(extractJson('here you go:\n```json\n{"a":2}\n```').a === 2, 'extractJson digs JSON out of a code fence + prose');
ok(extractJson('[1,2,3]').length === 3, 'extractJson parses a JSON array');
ok(extractJson('no json here') === null, 'extractJson returns null when there is none');

// ── routing: default selection ──
ok(makeLLM({}).provider === 'off', 'no config ⇒ disabled stub');
ok(makeLLM({ GEMINI_API_KEY: 'k' }).provider === 'gemini-2.5-flash', 'a GEMINI_API_KEY selects gemini by default');
ok(makeLLM({ LLM_BASE_URL: 'http://x' }).provider === 'local:local', 'an LLM_BASE_URL selects local by default');
ok(makeLLM({ STORY_LLM: 'off', GEMINI_API_KEY: 'k' }).provider === 'off', "STORY_LLM:'off' forces the stub even with a key");
ok(makeLLM({ STORY_LLM: 'gemini' }).enabled === false, 'gemini requested but unconfigured ⇒ disabled (not a throw)');

// ── the disabled stub never throws and yields null (procedural fallback) ──
await (async () => {
  const off = makeLLM({});
  ok((await off.generate({ prompt: 'hi' })) === null, 'disabled generate resolves null');
  ok((await off.embed('hi')) === null, 'disabled embed resolves null');
})();

// ── gemini with a fake fetch: right URL, parses text + JSON, null on !ok / on throw ──
await (async () => {
  let lastUrl = '';
  const fetchOK = async (url, init) => { lastUrl = url; return {
    ok: true, async json() { return { candidates: [{ content: { parts: [{ text: '{"beats":[1,2]}' }] } }] }; } }; };
  const g = makeLLM({ STORY_LLM: 'gemini', GEMINI_API_KEY: 'KEY' }, { fetch: fetchOK });
  ok(g.provider === 'gemini-2.5-flash' && g.enabled, 'gemini adapter is enabled');
  const text = await g.generate({ prompt: 'p' });
  ok(lastUrl.includes('gemini-2.5-flash:generateContent') && lastUrl.includes('KEY'), 'gemini generate hits the flash endpoint with the key');
  ok(text === '{"beats":[1,2]}', 'gemini generate returns raw text when no schema');
  const obj = await g.generate({ prompt: 'p', schema: { beats: [] } });
  ok(obj && obj.beats.length === 2, 'gemini generate parses JSON when a schema is requested');

  const embedFetch = async () => ({ ok: true, async json() { return { embedding: { values: [0.1, 0.2, 0.3] } }; } });
  const ge = makeLLM({ STORY_LLM: 'gemini', GEMINI_API_KEY: 'K' }, { fetch: embedFetch });
  ok((await ge.embed('x')).length === 3, 'gemini embed returns a vector');
  ok((await ge.embed(['a', 'b'])).length === 2, 'gemini embed maps an array of texts to an array of vectors');

  const fetch500 = async () => ({ ok: false, status: 500, async json() { return {}; } });
  const gbad = makeLLM({ STORY_LLM: 'gemini', GEMINI_API_KEY: 'K' }, { fetch: fetch500 });
  ok((await gbad.generate({ prompt: 'p' })) === null, 'gemini generate resolves null on a non-ok response');
  const fetchThrow = async () => { throw new Error('network'); };
  const gthrow = makeLLM({ STORY_LLM: 'gemini', GEMINI_API_KEY: 'K' }, { fetch: fetchThrow });
  ok((await gthrow.embed('x')) === null, 'gemini embed swallows a thrown fetch (never throws)');
})();

// ── local with a fake fetch: OpenAI-compatible chat + embeddings ──
await (async () => {
  let lastUrl = '';
  const fetchLocal = async (url) => { lastUrl = url; return {
    ok: true, async json() {
      return url.includes('/embeddings')
        ? { data: [{ embedding: [1, 0] }] }
        : { choices: [{ message: { content: '{"ok":true}' } }] };
    } }; };
  const l = makeLLM({ STORY_LLM: 'local', LLM_BASE_URL: 'http://serve:8080/', LLM_MODEL: 'qwen' }, { fetch: fetchLocal });
  ok(l.provider === 'local:qwen', 'local provider tag carries the model name (filterable)');
  const obj = await l.generate({ prompt: 'p', schema: { ok: true } });
  ok(lastUrl === 'http://serve:8080/v1/chat/completions', 'local generate hits the OpenAI-compatible chat endpoint (trailing slash trimmed)');
  ok(obj && obj.ok === true, 'local generate parses JSON');
  const v = await l.embed('x');
  ok(lastUrl.endsWith('/v1/embeddings') && v.length === 2, 'local embed hits the embeddings endpoint');
})();

console.log(`llm.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
