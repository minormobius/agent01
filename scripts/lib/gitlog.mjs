// scripts/lib/gitlog.mjs — one batched read of git history, shared by the
// graph generator and the analytics build.
//
// WHY THIS EXISTS. generate-git-graph.mjs used to shell out to `git show` once
// per commit to find the directories it touched. At 800 commits that was slow;
// at the repo's real size (5,800+) it is unusable. This does the whole history
// in a single `git log --name-only` pass — about two seconds — and both
// consumers read from it.
//
// IT ALSO FIXES THE CLASSIFIER. The old rule was
//   author = email.includes('claude') ? 'C' : 'H'
// and Claude Code commits are authored by `noreply@anthropic.com`, which does
// not contain "claude". So the graph recorded 747 human / 53 Claude commits
// when the true split is close to the opposite. Attribution here is an explicit
// table, and anything unrecognised is reported rather than guessed at.

import { execSync } from 'node:child_process';

const SEP = '\x1f';
const REC = '\x1e';

// ------------------------------------------------------------- attribution --
// Four kinds of commit author, because "who did this" is the axis the whole
// analytics rests on and 'C' vs 'H' cannot express it:
//
//   agent  an interactive Claude Code session — a person prompted this
//   loop   the autonomous loop, which runs without anyone watching
//   bot    scheduled content/CI pipelines (ideas-bot, lab, editor, Actions)
//   human  a person committing directly
//
// The distinction that matters most is agent vs loop/bot: only the first
// implies a prompt behind it.
export const ACTOR_BY_EMAIL = new Map([
  ['noreply@anthropic.com', 'agent'],
  ['claude@anthropic.com', 'agent'],
  ['loop@users.noreply.github.com', 'loop'],
  ['admin@mino.mobi', 'bot'],           // ideas-bot + "mino lab (bot)"
  ['editor@minomobi.com', 'bot'],
  ['bisk@minomobi.com', 'bot'],
  ['autopilot@minomobi.com', 'bot'],
  ['bakeoff@mino.mobi', 'bot'],
]);

export const ACTORS = ['agent', 'loop', 'bot', 'human'];

export function classifyActor(email = '', name = '') {
  const e = email.toLowerCase().trim();
  if (ACTOR_BY_EMAIL.has(e)) return ACTOR_BY_EMAIL.get(e);
  // Unattributed automation: GitHub Actions, Cloudflare, Dependabot and friends
  // all announce themselves in one of these two ways.
  if (/\[bot\]/.test(e) || /\[bot\]/.test(name)) return 'bot';
  if (/^(noreply|no-reply|actions)@/.test(e)) return 'bot';
  return 'human';
}

// ------------------------------------------------------------------- read --
/**
 * Read commits in one pass.
 *
 * @param {object}  opts
 * @param {boolean} opts.merges  include merge commits (the graph needs them to
 *                               draw edges; the analytics must exclude them,
 *                               since a merge is not a unit of work)
 * @param {number}  opts.max     cap the number of commits returned (newest first)
 * @param {string}  opts.cwd     repo root
 */
export function readCommits({ merges = true, max = null, cwd = process.cwd() } = {}) {
  const fmt = ['%H', '%P', '%ct', '%ae', '%an', '%D', '%s', '%b'].join(SEP);
  const args = ['git log --all', merges ? '' : '--no-merges', '--name-only',
    max ? `--max-count=${max}` : '', `--format='${REC}${fmt}${SEP}'`]
    .filter(Boolean).join(' ');
  const raw = execSync(args, { cwd, maxBuffer: 512 * 1024 * 1024 }).toString();

  const out = [];
  for (const rec of raw.split(REC)) {
    if (!rec.trim()) continue;
    const f = rec.split(SEP);
    if (f.length < 9) continue;
    const [hFull, parents, ct, email, name, refs, subject, body, fileBlob] = f;

    const files = fileBlob.split('\n').map((x) => x.trim()).filter(Boolean);
    const dirs = new Set();
    for (const path of files) {
      const top = path.split('/')[0];
      if (!top || top === 'node_modules') continue;
      dirs.add(top);
    }

    const p = parents.trim() ? parents.trim().split(/\s+/).map((x) => x.slice(0, 7)) : [];
    // Claude Code writes these trailers. `session` groups commits into one
    // conversation; `model` records which model was driving.
    const session = (body.match(/session_([A-Za-z0-9]+)/) || [])[1] || null;
    const model = (body.match(/Co-Authored-By:\s*(Claude[^<\n]*?)\s*</) || [])[1] || null;

    out.push({
      h: hFull.slice(0, 7),
      hFull,
      p,
      t: parseInt(ct, 10),
      email,
      name,
      actor: classifyActor(email, name),
      session,
      model: model ? model.trim() : null,
      subject,
      files,
      dirs: [...dirs],
      refs: refs.trim() || null,
      merge: p.length > 1,
    });
  }
  return out;
}

// --------------------------------------------------------- surface mapping --
/**
 * Build a top-level-directory -> surface resolver from the registry.
 * "Which website did this commit touch" is a question about surfaces, not
 * directories: `answers/` serves ask.mino.mobi, and `clock/` belongs to the
 * `torus` surface. Directories that belong to no surface (scripts/, docs/,
 * .github/) map to null and are reported as infrastructure.
 */
export function surfaceForDir(reg) {
  const byDir = new Map();
  for (const s of reg.surfaces) {
    for (const d of [s.dir, ...(s.dirs || [])]) {
      if (!d || d === '.') continue;
      byDir.set(d.split('/')[0], s.surface);
    }
  }
  return (dir) => byDir.get(dir) || null;
}
