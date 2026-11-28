// keys.mjs — how the lab holds its keys without the souls' sessions being able to read them.
//
// The problem (found 2026-11-28): SESSION_WITHHELD deletes keys from each session's environment,
// but a session has a shell running as the same user as the lab, and a process's STARTING
// environment is readable by any same-user process at /proc/<pid>/environ. The lab was started
// with every key in its environment (the workflow step's env:), so a session could read them from
// its ancestors, including MINIPHIM_APP_PASSWORD, which posts as the account around the two-key
// approval and the caps. The scrubber kept them out of the public repo; nothing kept them off the
// network.
//
// The fix: no process a session can reach is STARTED with a key. The workflow seals the keys into
// a file in a step of their own; launch.mjs reads it once, deletes it, and hands the keys to each
// run.mjs on file descriptor 3. Importing this module (first, in run.mjs) reads fd 3 into
// process.env, which changes this process's memory and not its /proc environ. Memory is not
// readable from a child on Ubuntu's default Yama ptrace scope (1), which the self-check reports.
//
// assertSealed() is the instrument that keeps this true: before any session starts, it walks this
// process's ancestors and refuses to run if any of them was started with a withheld key.
import { readFileSync } from 'node:fs';

if (process.env.WHETSTONE_KEYS_FD) {
  const fd = Number(process.env.WHETSTONE_KEYS_FD);
  delete process.env.WHETSTONE_KEYS_FD;
  const raw = readFileSync(fd, 'utf8');
  for (const [k, v] of Object.entries(JSON.parse(raw || '{}'))) if (typeof v === 'string' && v) process.env[k] = v;
}

const procRead = (pid, f) => { try { return readFileSync(`/proc/${pid}/${f}`, 'utf8'); } catch { return null; } };

// Every ancestor of `pid` (and `pid` itself) whose starting environment carries one of `names`
// with a non-empty value. An ancestor we can't read is one a session can't read either.
export function exposedKeys(names, pid = process.pid) {
  const found = [];
  const seen = new Set();
  for (let p = pid; p > 1 && !seen.has(p); ) {
    seen.add(p);
    const env = procRead(p, 'environ');
    if (env) {
      for (const kv of env.split('\0')) {
        const i = kv.indexOf('=');
        if (i > 0 && names.includes(kv.slice(0, i)) && kv.length > i + 1) found.push({ pid: p, key: kv.slice(0, i) });
      }
    }
    const status = procRead(p, 'status');
    const m = status && status.match(/^PPid:\s*(\d+)/m);
    p = m ? Number(m[1]) : 0;
  }
  return found;
}

export function ptraceScope() {
  const s = procRead('sys/kernel/yama', 'ptrace_scope');
  return s == null ? null : Number(s.trim());
}

// On CI, refuse to start sessions if a key is exposed. Locally (no GITHUB_ACTIONS) it only reports,
// so a developer running `node run.mjs` with keys in their shell is not blocked.
export function assertSealed(names, { strict = !!process.env.GITHUB_ACTIONS, log = console.error } = {}) {
  const found = exposedKeys(names);
  const scope = ptraceScope();
  log(`keys: ${found.length ? 'EXPOSED in ' + found.map((f) => `${f.key}@${f.pid}`).join(', ') : 'sealed (no ancestor started with a withheld key)'}; yama ptrace_scope ${scope ?? 'absent'}`);
  if (found.length && strict) {
    throw new Error(`refusing to start sessions: ${found.map((f) => f.key).join(', ')} readable from /proc/<pid>/environ by any session. Seal the keys (launch.mjs) instead of putting them in the step's env.`);
  }
  return { found, scope };
}
