#!/usr/bin/env node
// jobs.mjs — the souls' runner, the lab's side (lib/jobs.mjs says what a job is).
//
//   node jobs.mjs queue   --run runs/<run>                  jobs that became ready in this run (JSON lines)
//   node jobs.mjs prepare --run runs/<run> --name <n> --work <dir>   the job's sandbox: the run's commons,
//                                                             plus what the job's last run wrote, in its dir
//   node jobs.mjs collect --run runs/<run> --name <n> --work <dir> --started <iso> --exit <code> [--timed-out]
//                                                             new or changed files in its dir → jobs/<n>/out/,
//                                                             and jobs/<n>/done.json
//   node jobs.mjs wake    --name <n>                        the request that wakes one session (JSON)
//
// miniphim-job.yml runs prepare, the container, collect and wake; whetstone.yml runs queue.
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, lstatSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readTree } from './lib/commons.mjs';
import { planJobs, toStart, OUT_MAX } from './lib/jobs.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const JOBS_HOME = join(HERE, 'jobs');
const sha = (b) => createHash('sha256').update(b).digest('hex');
const walk = (d) => (existsSync(d) ? readdirSync(d).flatMap((f) => { const p = join(d, f), s = lstatSync(p); return s.isSymbolicLink() ? [] : s.isDirectory() ? walk(p) : [p]; }) : []);

export function previousRun(runsDir, run) {
  const name = run.split('/').filter(Boolean).pop();
  return readdirSync(runsDir).filter((d) => d < name && existsSync(join(runsDir, d, 'commons'))).sort().pop() || null;
}

export function queue(runDir) {
  const runsDir = dirname(runDir.replace(/\/+$/, ''));
  const prev = previousRun(runsDir, runDir);
  const before = prev ? readTree(join(runsDir, prev, 'commons')) : {};
  return toStart(before, readTree(join(runDir, 'commons')));
}

export function prepare(runDir, name, work, home = JOBS_HOME) {
  const commons = readTree(join(runDir, 'commons'));
  const job = planJobs(commons).ready.find((j) => j.name === name);
  if (!job) throw new Error(`no signed job ${name} in ${runDir}`);
  rmSync(work, { recursive: true, force: true }); mkdirSync(work, { recursive: true });
  for (const [k, v] of Object.entries(commons)) { const p = join(work, k); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, v); }
  const out = join(home, name, 'out');
  if (existsSync(out)) cpSync(out, join(work, job.spec.dir), { recursive: true });
  // The commands side by side, each one's output in job-logs/<i>.txt in its dir (which comes back); the
  // script exits with how many failed. It sits at the sandbox root, outside the dir, so it never comes back.
  writeFileSync(join(work, '.job.sh'), ['set -u', 'mkdir -p job-logs', ...job.spec.commands.map((c, i) => `( ${c} ) > job-logs/${i}.txt 2>&1 &`),
    'fails=0', 'for pid in $(jobs -p); do wait "$pid" || fails=$((fails+1)); done', 'exit "$fails"'].join('\n') + '\n');
  return job;
}

export function collect(runDir, name, work, { started, exit, timedOut, ended = new Date().toISOString(), jobsHome = JOBS_HOME }) {
  const commons = readTree(join(runDir, 'commons'));
  const job = planJobs(commons).ready.find((j) => j.name === name);
  const dir = job.spec.dir, base = join(work, dir), home = join(jobsHome, name), out = join(home, 'out');
  const files = [];
  let total = 0, dropped = [];
  for (const p of walk(base).sort()) {
    const rel = relative(base, p), key = `${dir}/${rel}`, buf = readFileSync(p);
    if (commons[key] !== undefined && commons[key] === buf.toString('utf8')) continue; // as signed: not output
    if (total + buf.length > OUT_MAX) { dropped.push(rel); continue; }
    total += buf.length;
    files.push({ path: rel, bytes: buf.length, lines: buf.toString('utf8').split('\n').filter(Boolean).length, sha256: sha(buf), buf });
  }
  rmSync(out, { recursive: true, force: true });
  for (const f of files) { const p = join(out, f.path); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, f.buf); }
  const done = { name, digest: job.digest, by: job.spec.by, signed: job.signed, about: job.spec.about || null, dir, commands: job.spec.commands,
    run: runDir.split('/').filter(Boolean).pop(), started, ended, seconds: Math.round((Date.parse(ended) - Date.parse(started)) / 1000),
    exit: Number(exit), timed_out: !!timedOut, minutes_cap: job.spec.minutes,
    files: files.map(({ buf, ...f }) => f), ...(dropped.length ? { dropped_over_20mb: dropped } : {}) };
  mkdirSync(home, { recursive: true });
  writeFileSync(join(home, 'done.json'), JSON.stringify(done, null, 1) + '\n');
  return { done, job };
}

// The request that wakes one session about a finished job. It carries woken_by_job, so a job that
// session starts is queued with wake=false (whetstone.yml): one link.
export function wakeRequest(name, now = new Date(), home = JOBS_HOME) {
  const done = JSON.parse(readFileSync(join(home, name, 'done.json'), 'utf8'));
  const tmpl = JSON.parse(readFileSync(join(HERE, 'town-day.json'), 'utf8'));
  const { enabled, $comment, kinds_by_hour, summon, ...rest } = tmpl;
  const stamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return { path: `packages/whetstone/requests/${stamp.slice(0, 10)}-job-${name}-${stamp.slice(11)}.json`,
    body: { ...rest, kinds: 'town', label: `job-${name}`, seed: Math.floor(now.getTime() / 60000) % 100000, woken_by_job: name,
      notice: `Your job ${name} finished (${done.timed_out ? `cut off at its ${done.minutes_cap}-minute cap` : `exit ${done.exit}`}, ${Math.round(done.seconds / 60)} min, ${done.files.length} file(s) back). Results: jobs/${name}/done.json and jobs/${name}/out/. It was written by ${done.by} and asked for in ${done.about}: answer there. This session was woken by a job, so a job you start in it will run but won't wake anyone (one link).` } };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [cmd] = process.argv.slice(2);
  const arg = (k) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : null; };
  if (cmd === 'queue') for (const j of queue(arg('run'))) console.log(JSON.stringify({ name: j.name, digest: j.digest, by: j.spec.by, wake: j.spec.wake === true, minutes: j.spec.minutes }));
  else if (cmd === 'prepare') { const j = prepare(arg('run'), arg('name'), arg('work')); console.log(JSON.stringify({ dir: j.spec.dir, minutes: j.spec.minutes, wake: j.spec.wake === true, commands: j.spec.commands })); }
  else if (cmd === 'collect') { const { done } = collect(arg('run'), arg('name'), arg('work'), { started: arg('started'), exit: arg('exit'), timedOut: process.argv.includes('--timed-out') }); console.log(JSON.stringify({ files: done.files.length, exit: done.exit, timed_out: done.timed_out })); }
  else if (cmd === 'wake') console.log(JSON.stringify(wakeRequest(arg('name'))));
  else { console.error('usage: jobs.mjs queue|prepare|collect|wake …'); process.exit(2); }
}
