#!/usr/bin/env node
/**
 * Build stats/data.json — pre-aggregated self-analytics over the full history.
 *
 * WHAT COUNTS AS WHAT, because the honesty of every chart depends on it:
 *
 *   commit   one committed turn. NOT one prompt. A prompt can produce several
 *            commits or none, so commit counts are a floor on prompts, not a
 *            measure of them.
 *   session  one Claude Code conversation, identified by the `Claude-Session`
 *            trailer the CLI writes into its commits. This is the closest
 *            thing in the history to "a time you sat down and asked for
 *            something". Median session here is ~7 commits.
 *   actor    agent | loop | bot | human (see lib/gitlog.mjs). Only `agent`
 *            implies a person prompted it. Mixing the loop's and the ideas
 *            bot's hourly commits into "prompts per day" would roughly triple
 *            the number and mean nothing, so every series is split by actor.
 *
 * COVERAGE CAVEAT, surfaced in the output rather than buried here: the session
 * trailer is only present on ~49% of commits, and its coverage falls over time
 * — not because the convention lapsed, but because automated commit volume
 * grew around it. Session-derived numbers describe agent work only.
 *
 * Aggregation happens here, not in the browser: the page gets ~40 KB of
 * rollups instead of a 5,800-commit, half-megabyte fetch.
 *
 * Usage:
 *   node scripts/build-git-stats.mjs            # summary to stdout (dry run)
 *   node scripts/build-git-stats.mjs --write    # write stats/data.json
 *   node scripts/build-git-stats.mjs --check    # exit 1 if stats/data.json is stale
 */
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execSync } from 'node:child_process';
import { readCommits, surfaceForDir, ACTORS } from './lib/gitlog.mjs';
import { loadRegistry, loadCatalogue } from './lib/landing.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const write = process.argv.includes('--write');
const check = process.argv.includes('--check');

// A shallow clone silently truncates every series here, exactly as it would
// truncate git-graph.json. Refuse rather than publish a partial history as if
// it were the whole thing.
if (existsSync(join(ROOT, '.git', 'shallow'))) {
  const have = execSync('git rev-list --count HEAD', { cwd: ROOT }).toString().trim();
  console.error(`REFUSING: shallow clone (${have} commits reachable).`);
  console.error('Run `git fetch --unshallow` first — otherwise every chart here is wrong.');
  process.exit(1);
}

// Merges excluded throughout: a merge is bookkeeping, not a unit of work, and
// counting them would double every merged feature branch.
const commits = readCommits({ merges: false, cwd: ROOT }).filter((c) => c.t > 0);
commits.sort((a, b) => a.t - b.t);

// One commit in 2024-12 predates the project by 14 months — vendored history
// that came in with a subtree. It would stretch every axis across an empty
// year, so the series start at the project's real first commit.
const PROJECT_START = '2026-01-01';
const inProject = commits.filter((c) => iso(c.t) >= PROJECT_START);
const preProject = commits.length - inProject.length;

function iso(t) { return new Date(t * 1000).toISOString().slice(0, 10); }

// Local time is what "time of day" means to a person. The history is committed
// from a machine in America/Los_Angeles; UTC hours would smear the working day
// across the wrong bins.
const TZ = 'America/Los_Angeles';
const partsFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ, hour: 'numeric', hour12: false, weekday: 'short',
  year: 'numeric', month: '2-digit', day: '2-digit',
});
function local(t) {
  const p = Object.fromEntries(partsFmt.formatToParts(new Date(t * 1000)).map((x) => [x.type, x.value]));
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    hour: parseInt(p.hour, 10) % 24,
    dow: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday),
  };
}

// ------------------------------------------------------------------ daily --
// date -> per-actor counts, plus how many distinct sessions touched that day.
const days = new Map();
const daySessions = new Map();
for (const c of inProject) {
  const { date } = local(c.t);
  if (!days.has(date)) { days.set(date, Object.fromEntries(ACTORS.map((a) => [a, 0]))); daySessions.set(date, new Set()); }
  days.get(date)[c.actor]++;
  if (c.session) daySessions.get(date).add(c.session);
}
const daily = [...days.entries()].sort().map(([date, counts]) => ({
  d: date,
  ...counts,
  s: daySessions.get(date).size,
}));

// ------------------------------------------------------------ time of day --
// A 7x24 grid of agent commits: weekday down, local hour across.
const heat = Array.from({ length: 7 }, () => new Array(24).fill(0));
const hourTotals = Object.fromEntries(ACTORS.map((a) => [a, new Array(24).fill(0)]));
for (const c of inProject) {
  const { hour, dow } = local(c.t);
  hourTotals[c.actor][hour]++;
  if (c.actor === 'agent') heat[dow][hour]++;
}

// --------------------------------------------------------------- surfaces --
// "Which website did this touch" is a question about surfaces, not directories.
// A commit touching three surfaces counts once for each — these are per-surface
// touch counts, not a partition of the commit total.
const reg = loadRegistry(ROOT);
const cat = loadCatalogue(ROOT);
const toSurface = surfaceForDir(reg);
const catBySurface = new Map();
for (const e of cat.entries) {
  if (e.surface && !catBySurface.has(e.surface)) catBySurface.set(e.surface, e.u);
}

const surf = new Map();
let infraTouches = 0;
for (const c of inProject) {
  const seen = new Set();
  for (const d of c.dirs) {
    if (d.startsWith('.')) continue;
    const s = toSurface(d);
    if (!s) { infraTouches++; continue; }
    if (seen.has(s)) continue;
    seen.add(s);
    if (!surf.has(s)) surf.set(s, { surface: s, url: catBySurface.get(s) || null, total: 0, sessions: new Set(), first: c.t, last: c.t, ...Object.fromEntries(ACTORS.map((a) => [a, 0])) });
    const row = surf.get(s);
    row.total++; row[c.actor]++;
    row.last = c.t;
    if (row.first > c.t) row.first = c.t;
    if (c.session) row.sessions.add(c.session);
  }
}
const surfaces = [...surf.values()]
  .map((r) => ({ ...r, sessions: r.sessions.size, first: iso(r.first), last: iso(r.last) }))
  .sort((a, b) => b.total - a.total);

// --------------------------------------------------------------- sessions --
const sess = new Map();
for (const c of inProject) {
  if (!c.session) continue;
  if (!sess.has(c.session)) sess.set(c.session, { id: c.session, n: 0, first: c.t, last: c.t, model: c.model, dirs: new Set() });
  const s = sess.get(c.session);
  s.n++;
  s.last = Math.max(s.last, c.t);
  s.first = Math.min(s.first, c.t);
  if (c.model && !s.model) s.model = c.model;
  for (const d of c.dirs) if (!d.startsWith('.')) s.dirs.add(d);
}
const sessionSizes = [...sess.values()].map((s) => s.n).sort((a, b) => a - b);
const median = (a) => (a.length ? a[Math.floor(a.length / 2)] : 0);

// ----------------------------------------------------------------- models --
const models = {};
for (const c of inProject) if (c.model) models[c.model] = (models[c.model] || 0) + 1;

// ------------------------------------------------------------------ totals --
const totals = Object.fromEntries(ACTORS.map((a) => [a, inProject.filter((c) => c.actor === a).length]));
const withSession = inProject.filter((c) => c.session).length;

const out = {
  $comment: 'GENERATED by scripts/build-git-stats.mjs — do not hand-edit. Pre-aggregated '
    + 'self-analytics over the full git history. A commit is one committed turn, NOT one '
    + 'prompt; a session is one Claude Code conversation. Only actor=agent implies a person '
    + 'prompted it.',
  generated: iso(Math.floor(Date.now() / 1000)),
  timezone: TZ,
  window: { start: daily[0]?.d ?? null, end: daily[daily.length - 1]?.d ?? null },
  units: {
    commit: 'one committed turn — a floor on prompts, not a count of them',
    session: 'one Claude Code conversation, from the Claude-Session commit trailer',
    actor: { agent: 'interactive Claude Code — a person prompted it', loop: 'the autonomous loop', bot: 'scheduled content and CI pipelines', human: 'a person committing directly' },
  },
  coverage: {
    commits: inProject.length,
    withSession,
    sessionPct: +(100 * withSession / (inProject.length || 1)).toFixed(1),
    excludedPreProject: preProject,
    note: 'Session ids cover agent commits only; the uncovered remainder is loop and bot volume.',
  },
  totals,
  sessions: {
    count: sess.size,
    medianCommits: median(sessionSizes),
    maxCommits: sessionSizes[sessionSizes.length - 1] || 0,
    sizeHistogram: sessionSizes.reduce((h, n) => { h[n] = (h[n] || 0) + 1; return h; }, {}),
  },
  models,
  daily,
  hourly: hourTotals,
  heatmap: heat,
  surfaces,
  infraTouches,
};

const json = JSON.stringify(out, null, 1) + '\n';
const dest = join(ROOT, 'stats', 'data.json');

// --check is a FRESHNESS check, not an equality check, and the difference is
// forced by what this file is. Every other generated artefact is a pure
// projection of a source file, so "regenerate and compare" is exact. This one
// is a snapshot of git history, and history grows with every commit — including
// the commit that would write the snapshot, which can never contain itself. A
// byte-equality gate would therefore fail on literally every push.
//
// So the useful question is not "is it identical" but "has anyone rebuilt it
// lately". Stale by a few days is fine; stale by a month means the page is
// quietly lying about a repo that has moved on.
const MAX_AGE_DAYS = 14;

if (check) {
  if (!existsSync(dest)) {
    console.error('MISSING: stats/data.json — run `node scripts/build-git-stats.mjs --write`');
    process.exit(1);
  }
  let prev;
  try { prev = JSON.parse(readFileSync(dest, 'utf8')); }
  catch (e) { console.error(`CORRUPT: stats/data.json does not parse — ${e.message}`); process.exit(1); }

  const end = prev.window && prev.window.end;
  if (!end) { console.error('MALFORMED: stats/data.json has no window.end'); process.exit(1); }

  const ageDays = Math.floor((Date.parse(out.window.end) - Date.parse(end)) / 86400000);
  if (ageDays > MAX_AGE_DAYS) {
    console.error(`STALE: stats/data.json covers up to ${end}, but history now runs to ${out.window.end} `
      + `(${ageDays} days behind, limit ${MAX_AGE_DAYS}) — run \`node scripts/build-git-stats.mjs --write\``);
    process.exit(1);
  }
  console.log(`stats/data.json is fresh (covers to ${end}, ${ageDays} day(s) behind head; `
    + `${prev.coverage.commits} commits, ${prev.sessions.count} sessions)`);
  process.exit(0);
}

console.log(`commits ${inProject.length} (excluded ${preProject} pre-${PROJECT_START})`);
console.log(`  actors  ${ACTORS.map((a) => `${a}:${totals[a]}`).join('  ')}`);
console.log(`  window  ${out.window.start} .. ${out.window.end}  (${daily.length} active days)`);
console.log(`  sessions ${sess.size}, median ${out.sessions.medianCommits} commits, max ${out.sessions.maxCommits}`);
console.log(`  surfaces touched ${surfaces.length}; top: ${surfaces.slice(0, 5).map((s) => `${s.surface}(${s.total})`).join(' ')}`);
console.log(`  payload ${(json.length / 1024).toFixed(0)} KB`);

if (!write) { console.log('(dry run — pass --write to emit stats/data.json)'); process.exit(0); }
mkdirSync(join(ROOT, 'stats'), { recursive: true });
writeFileSync(dest, json);
console.log(`wrote ${dest}`);
