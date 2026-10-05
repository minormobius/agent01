// models-proxy.mjs — other models for the souls, without their keys. The lab starts this on the
// runner for a run whose request names `models`; sessions reach it at MINIPHIM_MODELS_URL through
// the `models` engine (packages/models-client). The keys stay in this process. Every call is
// counted against the run's budget and logged with who made it, for the scorecard.
//
//   POST /ask { model, system?, prompt, max_tokens? } → { text, tokens, model, left }
//   GET  /    → { models, left }
import { createServer } from 'node:http';
import { compatModel, cliModel, PROVIDERS } from './model.mjs';

const providerOf = (model) => Object.entries(PROVIDERS).find(([, p]) => p.models.includes(model))?.[0] || null;

export async function startModelsProxy({ models = [], calls = 200, maxTokens = 4096, makeCall } = {}) {
  const callers = {};
  for (const m of models) {
    if (makeCall) callers[m] = makeCall(m);
    else if (m.startsWith('claude-')) callers[m] = cliModel({ model: m });
    else if (providerOf(m)) callers[m] = compatModel({ provider: providerOf(m), model: m, maxTokens });
    else throw new Error(`models: no provider for ${m}`);
  }
  const log = [];
  let left = calls;
  const json = (res, code, o) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  const server = createServer(async (req, res) => {
    if (req.method === 'GET') return json(res, 200, { models, left });
    if (req.method !== 'POST' || !req.url.startsWith('/ask')) return json(res, 404, { error: 'POST /ask' });
    let body = ''; for await (const c of req) { body += c; if (body.length > 400_000) return json(res, 413, { error: 'prompt too large' }); }
    let q; try { q = JSON.parse(body); } catch { return json(res, 400, { error: 'body must be JSON' }); }
    const who = String(req.headers['x-soul'] || 'unknown').slice(0, 20);
    if (!callers[q.model]) return json(res, 400, { error: `model must be one of: ${models.join(', ')}` });
    if (typeof q.prompt !== 'string' || !q.prompt) return json(res, 400, { error: 'prompt is required' });
    if (left <= 0) return json(res, 429, { error: 'this run\'s budget of model calls is spent' });
    left--;
    const t0 = Date.now();
    try {
      const r = await callers[q.model]({ system: String(q.system || ''), prompt: q.prompt });
      log.push({ who, model: q.model, ms: Date.now() - t0, tokens: r.tokens || null, cost: r.cost || 0, ok: true });
      json(res, 200, { model: q.model, text: r.text, tokens: r.tokens || null, left });
    } catch (e) {
      log.push({ who, model: q.model, ms: Date.now() - t0, ok: false, error: String(e.message).slice(0, 200) });
      json(res, 502, { error: String(e.message).slice(0, 300), left });
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}`;
  return { url, log, left: () => left, close: () => new Promise((r) => server.close(r)) };
}
