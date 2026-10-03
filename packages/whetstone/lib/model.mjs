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
//
// Work mode (the workbench): pass `cwd` and `tools` per call and the soul gets hands — file
// tools and `node`, confined by --restricted to its own working folder, with edits accepted and
// only the listed shell commands allowed. The soul file is still the whole system prompt. The
// call then also returns `trace` (every tool use, in order) and `turns`.

export const WORK_TOOLS = ['Read', 'Glob', 'Grep', 'Edit', 'Write', 'Bash'];
export const WORK_ALLOW = ['Read', 'Glob', 'Grep', 'Edit', 'Write',
  'Bash(node:*)', 'Bash(ls:*)', 'Bash(cat:*)', 'Bash(head:*)', 'Bash(tail:*)', 'Bash(wc:*)', 'Bash(grep:*)', 'Bash(sort:*)'];

import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const DEFAULT_MODEL = 'claude-opus-5-5';

export function cliModel({ model = DEFAULT_MODEL, effort, bin = 'claude', timeoutMs = 300_000, workTimeoutMs = 900_000, workBudgetUsd = 3 } = {}) {
  const empty = mkdtempSync(join(tmpdir(), 'whetstone-'));
  return async function call({ system, prompt, cwd, tools, env }) {
    const work = !!(cwd && tools?.length);
    // stream-json, not json: the single-result format drops the rate_limit_event lines, and
    // those are the only place the subscription's usage windows are reported (see parseStream).
    const args = ['-p', '--model', model, '--system-prompt', system,
      '--output-format', 'stream-json', '--verbose', '--no-session-persistence'];
    if (work) {
      args.push('--restricted', '--tools', tools.join(','), '--permission-mode', 'acceptEdits',
        '--allowedTools', ...WORK_ALLOW, '--max-budget-usd', String(workBudgetUsd));
    } else {
      args.push('--tools', '');
    }
    if (process.env.ANTHROPIC_API_KEY) args.push('--bare');
    if (effort) args.push('--effort', effort);
    const { out, timedOut } = await run(bin, args, prompt, work ? cwd : empty, work ? workTimeoutMs : timeoutMs, env);
    const r = parseStream(out, work ? cwd : null);
    // A work session that runs out of time did work: keep what it did, say it stopped, move on.
    // (Retrying it in the same folder just repeats whatever held it.) A text trial that times out
    // is an error, and the lab retries it.
    if (timedOut) {
      if (!work) throw new Error(`timeout after ${timeoutMs}ms`);
      return { text: r.found ? r.text : '', cost: r.cost, rate: r.rate, trace: r.trace, turns: r.turns, stop: 'timeout' };
    }
    if (!r.found) throw new Error(`claude -p wrote no result line: ${out.slice(-200)}`);
    // A work session that ran out of budget still did work; keep it and say so.
    if (r.isError && !(work && r.subtype)) throw new Error(`claude -p error: ${String(r.text).slice(0, 200)}`);
    return { text: r.text, cost: r.cost, rate: r.rate, trace: r.trace, turns: r.turns, stop: r.isError ? r.subtype : null };
  };
}

// Read a `claude -p --output-format stream-json --verbose` transcript: one JSON object per line.
// The last `result` line carries the answer and the cost. Any `rate_limit_event` lines carry the
// account's usage windows, as Claude Code reports them:
//   { type: 'rate_limit_event', rate_limit_info: { status, rateLimitType, utilization, ... } }
// (shape as captured in scripts/lab-agent-outcome.selftest.mjs). Whether Claude Code emits one
// on every call or only past a warning threshold is exactly what recording them will tell us.
export function parseStream(text, cwd = null) {
  let result = null;
  const rate = [];
  const trace = [];
  const byId = new Map();
  for (const line of String(text ?? '').split('\n')) {
    const t = line.trim();
    if (!t.startsWith('{')) continue;
    let e;
    try { e = JSON.parse(t); } catch { continue; }
    if (e.type === 'result') result = e;
    else if (e.type === 'rate_limit_event' && e.rate_limit_info) rate.push(e.rate_limit_info);
    else if (e.type === 'assistant' || e.type === 'user') {
      for (const c of e.message?.content || []) {
        if (c.type === 'tool_use') {
          const t = { tool: c.name, input: toolInput(c.name, c.input, cwd) };
          byId.set(c.id, t);
          trace.push(t);
        } else if (c.type === 'tool_result' && byId.has(c.tool_use_id) && c.is_error) {
          byId.get(c.tool_use_id).error = String(Array.isArray(c.content) ? c.content.map((x) => x.text || '').join(' ') : c.content).slice(0, 160);
        }
      }
    }
  }
  return {
    found: !!result,
    isError: !!result?.is_error,
    text: String(result?.result ?? '').trim(),
    cost: Number(result?.total_cost_usd) || 0,
    rate,
    trace,
    turns: Number(result?.num_turns) || 0,
    subtype: result?.subtype && result.subtype !== 'success' ? result.subtype : null,
  };
}

// One line per tool use, paths relative to the work folder: enough to read what a soul did.
function toolInput(name, input = {}, cwd) {
  const rel = (p) => (cwd && typeof p === 'string' && p.startsWith(cwd) ? p.slice(cwd.length).replace(/^\//, '') || '.' : p);
  const v = name === 'Bash' ? input.command
    : input.file_path ? rel(input.file_path)
    : input.pattern ? `${input.pattern}${input.path ? ` in ${rel(input.path)}` : ''}`
    : JSON.stringify(input);
  return String(v ?? '').slice(0, 240);
}

export function fakeModel(fn, { rate = () => [] } = {}) {
  return async (req) => {
    const r = await fn(req);
    const o = typeof r === 'object' && r ? r : { text: r };
    return { text: String(o.text), cost: 0, rate: rate(req), trace: o.trace || [], turns: o.turns || 0, stop: null };
  };
}

// `env` adds to the environment, never replaces it: the session's identity (WHETSTONE_SOUL) is
// how the ledger tool knows who is writing, and the lab checks it again on the way back.
//
// Two lessons from eighth light, where one pair session "hung" three times and took the run down:
//  - Wait for the process to EXIT, not for its pipes to CLOSE. A soul with a shell can start a
//    background job; it inherits stdout, so `close` never comes even after claude has finished.
//  - Kill the whole process GROUP, on exit and on timeout, so nothing a session started outlives it.
// A timeout resolves with what was written so far and `timedOut`, so the caller decides whether a
// stopped session is an error (a text trial) or a result (a work session that ran out of time).
export function run(bin, args, stdin, cwd, timeoutMs, env) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'], detached: true, env: env ? { ...process.env, ...env } : process.env });
    let out = '', err = '', settled = false;
    const killGroup = () => { try { process.kill(-p.pid, 'SIGKILL'); } catch { try { p.kill('SIGKILL'); } catch { /* gone */ } } };
    const finish = (v) => { if (settled) return; settled = true; clearTimeout(t); killGroup(); resolve(v); };
    const t = setTimeout(() => finish({ out, code: null, timedOut: true }), timeoutMs);
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', (e) => { if (settled) return; settled = true; clearTimeout(t); reject(e); });
    p.on('exit', (code) => {
      // Let the last of claude's own output drain, then end it, whatever is still holding the pipe.
      setTimeout(() => {
        if (code !== 0 && !out) { if (!settled) { settled = true; clearTimeout(t); killGroup(); reject(new Error(`claude exited ${code}: ${err.slice(0, 300)}`)); } return; }
        finish({ out, code, timedOut: false });
      }, 500);
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
