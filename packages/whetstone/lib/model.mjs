// model.mjs — how the lab talks to a model. Two backends, one signature:
//
//   const call = cliModel({ model });            // the real thing, via `claude -p`
//   const call = fakeModel(fn);                  // the selftest's deterministic stand-in
//   const { text, cost } = await call({ system, prompt, meta });
//
// The real backend is the Claude Code CLI, not raw HTTP, because that is how every model
// call in this repo's Actions is made (lab-build.yml, the loop, the ideas bot), and it works
// with either secret the repo holds: ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN.
//
// Isolation matters more than usual here: the system prompt IS the soul, so nothing else
// may leak into it. So: --system-prompt replaces the default prompt outright, --tools ""
// gives the soul no tools, and the process runs in an empty temp dir so no CLAUDE.md is
// discovered. --bare would also skip hooks and plugins, but it only reads ANTHROPIC_API_KEY
// (never OAuth), so it is added only when a key is present.

import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const DEFAULT_MODEL = 'claude-opus-5-5';

export function cliModel({ model = DEFAULT_MODEL, effort, bin = 'claude', timeoutMs = 300_000 } = {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'whetstone-'));
  return async function call({ system, prompt }) {
    // stream-json, not json: the single-result format drops the rate_limit_event lines, and
    // those are the only place the subscription's usage windows are reported (see parseStream).
    const args = ['-p', '--model', model, '--system-prompt', system, '--tools', '',
      '--output-format', 'stream-json', '--verbose', '--no-session-persistence'];
    if (process.env.ANTHROPIC_API_KEY) args.push('--bare');
    if (effort) args.push('--effort', effort);
    const out = await run(bin, args, prompt, cwd, timeoutMs);
    const r = parseStream(out);
    if (!r.found) throw new Error(`claude -p wrote no result line: ${out.slice(-200)}`);
    if (r.isError) throw new Error(`claude -p error: ${String(r.text).slice(0, 200)}`);
    return { text: r.text, cost: r.cost, rate: r.rate };
  };
}

// Read a `claude -p --output-format stream-json --verbose` transcript: one JSON object per line.
// The last `result` line carries the answer and the cost. Any `rate_limit_event` lines carry the
// account's usage windows, as Claude Code reports them:
//   { type: 'rate_limit_event', rate_limit_info: { status, rateLimitType, utilization, ... } }
// (shape as captured in scripts/lab-agent-outcome.selftest.mjs). Whether Claude Code emits one
// on every call or only past a warning threshold is exactly what recording them will tell us.
export function parseStream(text) {
  let result = null;
  const rate = [];
  for (const line of String(text ?? '').split('\n')) {
    const t = line.trim();
    if (!t.startsWith('{')) continue;
    let e;
    try { e = JSON.parse(t); } catch { continue; }
    if (e.type === 'result') result = e;
    else if (e.type === 'rate_limit_event' && e.rate_limit_info) rate.push(e.rate_limit_info);
  }
  return {
    found: !!result,
    isError: !!result?.is_error,
    text: String(result?.result ?? '').trim(),
    cost: Number(result?.total_cost_usd) || 0,
    rate,
  };
}

export function fakeModel(fn, { rate = () => [] } = {}) {
  return async (req) => ({ text: String(await fn(req)), cost: 0, rate: rate(req) });
}

function run(bin, args, stdin, cwd, timeoutMs) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = '';
    const t = setTimeout(() => { p.kill('SIGKILL'); reject(new Error(`timeout after ${timeoutMs}ms`)); }, timeoutMs);
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', (e) => { clearTimeout(t); reject(e); });
    p.on('close', (code) => {
      clearTimeout(t);
      if (code !== 0 && !out) reject(new Error(`claude exited ${code}: ${err.slice(0, 300)}`));
      else resolve(out);
    });
    p.stdin.end(stdin);
  });
}

// Bounded concurrency without a dependency.
export async function pool(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(lanes);
  return results;
}
