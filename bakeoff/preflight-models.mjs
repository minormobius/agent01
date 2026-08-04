#!/usr/bin/env node
// preflight-models.mjs — does each model id actually answer?
//
//   node bakeoff/preflight-models.mjs [model ...]
//
// WHY. On smoke-01 every `kimi3` judge call returned HTTP 200 with an EMPTY
// content array. Not an error, not a refusal — nothing. The cause turned out
// not to be a bad model id: kimi-k3 has THINKING ALWAYS ON, and the caller's
// max_tokens was small enough that the entire budget went to reasoning blocks
// with no text block ever emitted.
//
// So this probe deliberately budgets for a thinking model, and reports
// "thought but never answered" separately from "said nothing at all" — those
// have completely different fixes (raise the budget vs. fix the id) and look
// identical if you only check for text.
//
// A key that exists is not the same as a model that answers, and the gap
// between them is cells that burn runner time producing nothing.
//
// Exit code is always 0: a dead model is a finding to report, not a reason to
// abort a run that can still produce useful cells.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const cells = JSON.parse(readFileSync(join(HERE, 'cells.json'), 'utf8'));

export async function probe(modelKey) {
  const m = cells.models[modelKey];
  if (!m) return { model: modelKey, status: 'unknown', detail: 'not in cells.json' };

  const key = process.env[m.keyEnv];
  if (!key) return { model: modelKey, status: 'nokey', detail: `${m.keyEnv} not set` };

  const base = m.anthropicBase.replace(/\/$/, '');
  const t0 = Date.now();
  try {
    const res = await fetch(`${base}/v1/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: m.model,
        // Generous on purpose: a reasoning model with thinking always on needs
        // room to think BEFORE it can emit a single word. 16 tokens would fail
        // every such model and look exactly like a dead endpoint.
        max_tokens: 4096,
        messages: [{ role: 'user', content: 'Reply with the single word: ready' }],
      }),
    });
    const ms = Date.now() - t0;
    if (!res.ok) {
      const body = (await res.text().catch(() => '')).slice(0, 200);
      return { model: modelKey, modelId: m.model, status: 'http', detail: `${res.status}: ${body}`, ms };
    }
    const data = await res.json().catch(() => null);
    const blocks = data?.content || [];
    const text = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
    if (!text) {
      const thought = blocks.some((b) => b.type === 'thinking' || b.type === 'redacted_thinking');
      return {
        model: modelKey, modelId: m.model, ms,
        status: thought ? 'thinking-only' : 'empty',
        detail: thought
          ? `answers, but spent 4096 tokens thinking without emitting text (stop_reason=${data?.stop_reason}) — callers must budget generously`
          : `200 with no content blocks — model id "${m.model}" is probably wrong or retired`,
      };
    }
    return { model: modelKey, modelId: m.model, status: 'ok', detail: text.slice(0, 40), ms };
  } catch (e) {
    return { model: modelKey, modelId: m.model, status: 'error', detail: String(e.message || e).slice(0, 200) };
  }
}

export async function probeAll(models) {
  const list = models?.length ? models : Object.keys(cells.models);
  return Promise.all(list.map(probe));
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  const results = await probeAll(process.argv.slice(2));
  const summary = process.env.GITHUB_STEP_SUMMARY;
  const md = ['## Model preflight', '', '| model | id | result |', '|---|---|---|'];

  for (const r of results) {
    const mark = r.status === 'ok' ? '✅' : r.status === 'nokey' ? '⏭️' : r.status === 'thinking-only' ? '⚠️' : '❌';
    console.log(`${mark} ${r.model.padEnd(11)} ${(r.modelId || '-').padEnd(20)} ${r.status.padEnd(7)} ${r.detail}`);
    md.push(`| \`${r.model}\` | \`${r.modelId || '-'}\` | ${mark} ${r.status} — ${String(r.detail).replace(/\|/g, '\\|').slice(0, 160)} |`);
    if (r.status === 'thinking-only') {
      console.log(`::warning::model ${r.model} reasons before answering — every caller must allow a large max_tokens or it returns nothing`);
    }
    if (r.status === 'empty' || r.status === 'http' || r.status === 'error') {
      console.log(`::warning::model ${r.model} (${r.modelId}) is not answering — its cells will produce nothing. ${r.detail}`);
    }
  }

  const dead = results.filter((r) => r.status === 'empty' || r.status === 'http' || r.status === 'error');
  if (dead.length) {
    md.push('', `> **${dead.length} model(s) not answering.** Their cells will still run and still cost runner time, but will not produce a usable entry. Fix the model id in \`os/api/wrangler.toml\` and \`bakeoff/cells.json\` (the selftest keeps them in step).`);
  }
  if (summary) { const { appendFileSync } = await import('node:fs'); appendFileSync(summary, md.join('\n') + '\n'); }
}
