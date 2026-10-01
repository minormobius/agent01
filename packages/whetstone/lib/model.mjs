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
    const args = ['-p', '--model', model, '--system-prompt', system, '--tools', '',
      '--output-format', 'json', '--no-session-persistence'];
    if (process.env.ANTHROPIC_API_KEY) args.push('--bare');
    if (effort) args.push('--effort', effort);
    const out = await run(bin, args, prompt, cwd, timeoutMs);
    let j;
    try { j = JSON.parse(out); } catch { throw new Error(`claude -p returned non-JSON: ${out.slice(0, 200)}`); }
    if (j.is_error) throw new Error(`claude -p error: ${String(j.result).slice(0, 200)}`);
    return { text: String(j.result ?? '').trim(), cost: Number(j.total_cost_usd) || 0 };
  };
}

export function fakeModel(fn) {
  return async (req) => ({ text: String(await fn(req)), cost: 0 });
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
