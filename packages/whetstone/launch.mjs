#!/usr/bin/env node
// launch.mjs — run each request with the keys sealed (lib/keys.mjs says why).
//
//   WHETSTONE_KEYS_FILE=/path/keys.json LIST="requests/a.json
//   requests/b.json" node launch.mjs
//
// Reads the key file once and deletes it before any session can exist, then starts one
// `node run.mjs --request <r>` per request with the keys on file descriptor 3. No process here is
// started with a key in its environment. Each run's stdout (its scorecard) goes to the step summary,
// as the workflow's loop did. Exit: 0 if every run exited 0 or 3 (3 = a gate failed: a result,
// not an error), otherwise the last other code.
import { readFileSync, rmSync, appendFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const file = process.env.WHETSTONE_KEYS_FILE;
let keys = '{}';
if (file) {
  try { keys = readFileSync(file, 'utf8'); } finally { rmSync(file, { force: true }); }
}
delete process.env.WHETSTONE_KEYS_FILE;

const list = String(process.env.LIST || '').split('\n').map((s) => s.trim()).filter(Boolean);
let status = 0;
for (const r of list) {
  console.log(`::group::${r}`);
  const code = await new Promise((resolve) => {
    const p = spawn(process.execPath, ['run.mjs', '--request', r], {
      cwd: HERE, stdio: ['ignore', 'pipe', 'inherit', 'pipe'], env: { ...process.env, WHETSTONE_KEYS_FD: '3' },
    });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stdio[3].on('error', () => {}); // a run that exits before reading its keys
    p.stdio[3].end(keys);
    p.on('exit', (c) => {
      if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, out);
      else process.stdout.write(out);
      resolve(c ?? 1);
    });
  });
  console.log('::endgroup::');
  if (code !== 0 && code !== 3) status = code;
}
keys = null;
process.exit(status);
