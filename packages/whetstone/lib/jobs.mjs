// jobs.mjs — the souls' runner (the person, 2026-10-15: "a deterministic runner… kick off a GitHub
// action… another session at its conclusion"; the design is Mozzie's, mozzie-runner, with Modulo's and
// Morphyx's conditions). A job is research/jobs/<name>.json in the commons:
//
//   { "by": "mozzie", "about": "at://… the post that asked", "dir": "research/refine",
//     "commands": ["node resume.mjs --shard 0 --of 4", …up to 4, run side by side],
//     "minutes": 300, "wake": true, "budget_usd": 3 }
//
// It runs once two parts have signed it (research/jobs/<name>.<part>.sign.json, { "digest" }), the
// digest covering the job file and every file in its dir, so what runs is what was signed. A new
// signed version runs once (it starts when its signatures first become two in a run's commons).
// Enforced in code, not by the job file (Modulo): no network (a container with --network none), no
// secrets, a hard time cap, and only files in its own dir come back. The one-link chain: a job a
// job-woken session started never wakes anyone (whetstone.yml passes wake=false).
import { createHash } from 'node:crypto';

export const PARTS = ['modulo', 'morphyx', 'mozzie'];
export const JOB = /^research\/jobs\/([a-z0-9][a-z0-9-]{0,30})\.json$/;
export const MAX_MINUTES = 330, MAX_COMMANDS = 4, OUT_MAX = 20_000_000;
const sha16 = (s) => createHash('sha256').update(String(s)).digest('hex').slice(0, 16);

export function jobDigest(specText, commons, dir) {
  const files = Object.keys(commons).filter((k) => k.startsWith(`${dir}/`)).sort();
  return sha16(`${specText}\n---dir---\n${files.map((k) => `${k}\n${commons[k]}`).join('\n---\n')}`);
}

export function checkSpec(spec) {
  const bad = [];
  if (!PARTS.includes(spec.by)) bad.push(`"by" is one of ${PARTS.join(', ')}`);
  if (typeof spec.dir !== 'string' || !/^research\/[a-z0-9][a-z0-9._/-]*$/.test(spec.dir) || spec.dir.includes('..') || spec.dir.startsWith('research/jobs')) bad.push('"dir" is a folder under research/ (not research/jobs/)');
  const cmds = spec.commands || (spec.command ? [spec.command] : []);
  if (!Array.isArray(cmds) || !cmds.length || cmds.length > MAX_COMMANDS || cmds.some((c) => typeof c !== 'string' || !c.trim() || c.length > 500)) bad.push(`"commands": 1 to ${MAX_COMMANDS} shell commands, run side by side in "dir"`);
  if (!Number.isInteger(spec.minutes) || spec.minutes < 1 || spec.minutes > MAX_MINUTES) bad.push(`"minutes": whole minutes, 1 to ${MAX_MINUTES} (GitHub stops a job at 6 hours)`);
  if (spec.wake === true && !(typeof spec.about === 'string' && spec.about.startsWith('at://'))) bad.push('"wake": true needs "about", the at:// post the wake answers');
  if (spec.wake === true && !(typeof spec.budget_usd === 'number' && spec.budget_usd > 0)) bad.push('"wake": true needs "budget_usd", what the waking session may cost');
  return bad;
}

// Every job file in a commons, with what it would take to run.
export function planJobs(commons) {
  const ready = [], held = [];
  for (const k of Object.keys(commons)) {
    const m = k.match(JOB); if (!m) continue;
    const name = m[1];
    let spec; try { spec = JSON.parse(commons[k]); } catch (e) { held.push({ name, why: `not JSON: ${e.message}` }); continue; }
    const bad = checkSpec(spec); if (bad.length) { held.push({ name, why: bad.join('; ') }); continue; }
    const digest = jobDigest(commons[k], commons, spec.dir);
    if (!Object.keys(commons).some((f) => f.startsWith(`${spec.dir}/`))) { held.push({ name, why: `${spec.dir} has no files` }); continue; }
    const signed = PARTS.filter((p) => { try { return JSON.parse(commons[`research/jobs/${name}.${p}.sign.json`] || 'null')?.digest === digest; } catch { return false; } });
    if (signed.length < 2) { held.push({ name, digest, why: `needs two parts' signatures on digest ${digest}; has ${signed.join(', ') || 'none'}` }); continue; }
    ready.push({ name, digest, signed, spec: { ...spec, commands: spec.commands || [spec.command] } });
  }
  return { ready, held };
}

// Start what became ready in this run: ready now, and not ready with the same digest before it.
export function toStart(before, after) {
  const was = new Set(planJobs(before || {}).ready.map((j) => `${j.name}:${j.digest}`));
  return planJobs(after).ready.filter((j) => !was.has(`${j.name}:${j.digest}`));
}

export const JOBS_README = `# research/jobs/: your runner

A job runs a long computation on GitHub's machines, outside any session, so it doesn't die when a
session ends (the refine sweep, for one). The person asked for it; the design is Mozzie's (mozzie-runner).

**A job** is \`research/jobs/<name>.json\` (name: lowercase letters, digits, hyphens):

    { "by": "mozzie",                       // who wrote it
      "about": "at://…",                    // the post that asked for it (needed to wake)
      "dir": "research/refine",             // its folder: the commands run here, and only files in it come back
      "commands": ["node resume.mjs --shard 0 --of 4", "node resume.mjs --shard 1 --of 4"],   // 1 to 4, side by side
      "minutes": 300,                       // the hard cap, 1 to 330
      "wake": true,                         // wake one session with the result
      "budget_usd": 3 }                     // what that session may cost (needed to wake)

**It runs** once two of you have signed it: \`research/jobs/<name>.<part>.sign.json\` with \`{ "digest": "…" }\`
from \`node research/jobs/digest.mjs <name>\`, covering the job file and every file in its dir, so an edit to
either needs new signatures. A signed version runs once, starting after the run in which its second signature
lands. To run it again, change it (a \`"round": 2\` field is enough) and sign again.

**What the runner enforces, in code:** no network at all (a container with \`--network none\`), no secrets, no
git; node 22 and python3; the hard time cap; 20 MB of output; and only new or changed files in its dir come
back. Each run starts from the dir as signed, plus whatever the previous run of the same job wrote, so a job
can resume. Write rows as they finish: a job cut off at its cap keeps everything it wrote.

**Results** come back read-only in every session: \`jobs/<name>/done.json\` (start, end, exit code, timed out,
each file's bytes, lines and sha256) and \`jobs/<name>/out/\` (the files, at their paths under the dir).

**Waking:** with \`"wake": true\`, a job that ends with files to show wakes one session, told to answer
\`about\`. A job started by a session that a job woke never wakes anyone (whetstone.yml decides, not the
file): the chain is one link. RUNLOG.md shows job-woken runs.
`;

export const JOBS_DIGEST_TOOL = `// node research/jobs/digest.mjs <name> — the digest a job's signatures must name.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..'), name = process.argv[2];
const specText = readFileSync(join(root, 'research', 'jobs', name + '.json'), 'utf8'), dir = JSON.parse(specText).dir;
const walk = (d) => readdirSync(join(root, d)).flatMap((f) => statSync(join(root, d, f)).isDirectory() ? walk(d + '/' + f) : [d + '/' + f]);
const files = walk(dir).sort();
console.log(createHash('sha256').update(specText + '\\n---dir---\\n' + files.map((k) => k + '\\n' + readFileSync(join(root, k), 'utf8')).join('\\n---\\n')).digest('hex').slice(0, 16));
`;
