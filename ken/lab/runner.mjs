/* ─────────────────────────────────────────────────────────────────────
   ken/lab/runner.mjs — a six-turn verification-first run, executed.

   ── WHY THIS IS NOT loop-work.yml ────────────────────────────────────

   The loop's turns are granted Read, Write, Edit, Glob and Grep, and
   denied Bash, WebSearch, WebFetch and subagents. That is not timidity
   about the model. It is about the PROVENANCE OF THE PROMPT: the loop
   assembles its brief from a ticket graph that outside parties can push
   into, so the grant has to survive a brief nobody in this repo wrote.

   A bank run has the opposite provenance. Its brief is `statement.md`,
   a committed file with an author and a diff, and the run is started by
   hand. Same model, different threat model, so a different grant is the
   correct answer rather than an inconsistency:

       TOOL GRANT FOLLOWS THE PROVENANCE OF THE PROMPT, NOT THE MODEL.

   So a turn here gets what `bakeoff/run-cell.sh` already gives a cell —
   bash, network, subagents — because that is the instrument H10 needs.
   A turn that cannot execute cannot re-run a check, and a check that is
   read rather than run is a REMEMBERED check, which attenuates like
   everything else and would make H10 untestable by construction.

   ── ISOLATION IS THE EXPERIMENT ──────────────────────────────────────

   R16, and WP2 §10b: under `lineage` or `shared` the ken ratio is 1 for
   every turn of every shape and the whole question dissolves. So each
   turn gets a FRESH tree holding exactly what its in-edges hand it and
   nothing else. No repository, no history, no other lane's work.

   And the demonstration is not optional. `plantMarker` puts a token in
   one turn's output that a later turn has no edge from; if that token
   appears downstream, the run leaked and its numbers are void rather
   than null.

   ── WHAT A RUN MEASURES ──────────────────────────────────────────────

   The integrated artefact is scored by the BANK's checks, which nobody
   in the run has seen — the held-out scorer H11 requires. But the more
   interesting measurement is of the run's OWN checks, because the bank
   can score those too:

     the run's check against the bank's reference   -> SOUNDNESS, u
     the run's check against the bank's mutants     -> COVERAGE,  c

   That is a direct measurement of WP4's two unmeasured parameters, from
   a real turn, and it costs nothing beyond the run itself.

   ── RUNNING IT ───────────────────────────────────────────────────────

     node ken/lab/runner.mjs --task tb-001-binomial-interval --dry-run
     node ken/lab/runner.mjs --task tb-001-binomial-interval   # spends money

   `--dry-run` executes the whole plan with a scripted agent: the trees,
   the isolation, the leak demonstration, the scoring and the ledger all
   run for real. Only the model call is replaced, which is what makes the
   harness testable without an API key.
   ───────────────────────────────────────────────────────────────────── */

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, cpSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readTask, runCheck, TASKS_DIR } from './taskbank.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * The six turns, their duties, and — the part that makes this a run
 * rather than a script — what each one's tree contains.
 *
 * `reads` names artefacts by the turn that produced them, so the tree is
 * derived from the graph rather than declared twice. `briefBuilder`
 * toggles WP4's first open question: whether a builder sees the original
 * problem beside its check. It is a flag because it changes four of the
 * six derived roles, so the two settings are different designs.
 */
export const SHAPES = ['standard', 'solo'];

/**
 * THE TURN BOUNDARY IS AN INDEPENDENCE BOUNDARY, NOT A WORK BOUNDARY.
 *
 * A turn granted subagents is not an atom. It is a fan-out with FULL
 * context at the root, so nothing inside it crosses a handoff and
 * nothing inside it attenuates: within one turn, lambda is 1 by
 * construction. What a turn boundary buys that a subagent cannot is the
 * thing WP3 section 3 is about — a successor that has NOT seen its
 * predecessor's reasoning.
 *
 * Which reframes the split. Dividing by ISSUE (one ticket per turn) buys
 * wall-clock and nothing else: same context, same approach, same blind
 * spots, and that is WP4 section 5's rho near 1. Dividing by GROUP — the
 * boundary where the work genuinely differs and independence is wanted —
 * is what a turn is for. The bank measured exactly this contrast before
 * anyone stated it: tb-001 split one problem by subject and both checks
 * killed everything either killed (redundancy 1.00); tb-002 split the
 * placement from the checker that grades it and reached 0.429.
 *
 * `solo` exists so the claim can be run rather than argued: one turn,
 * the same total budget, told to fan out freely. Against `standard` on
 * the same task it is H12.
 */
export function plan({ briefBuilder = false, shape = 'standard' } = {}) {
  if (!SHAPES.includes(shape)) throw new Error(`unknown shape "${shape}" (have ${SHAPES.join(', ')})`);
  if (shape === 'solo') {
    return {
      shape: 'solo',
      profile: [1],
      briefBuilder,
      turns: [{
        id: 'solo',
        duty: 'everything',
        reads: [],
        writes: ['check-a.mjs', 'check-b.mjs', 'solution.mjs'],
        statement: true,
        mayFanOut: true,
      }],
    };
  }
  const turns = [
    { id: 'setup', duty: 'split', reads: [], writes: ['brief-a.md', 'brief-b.md'], statement: true },
    { id: 'specA', duty: 'specify', reads: ['brief-a.md'], writes: ['check-a.mjs'] },
    { id: 'specB', duty: 'specify', reads: ['brief-b.md'], writes: ['check-b.mjs'] },
    { id: 'buildA', duty: 'build', reads: ['check-a.mjs'], writes: ['solution-a.mjs'] },
    { id: 'buildB', duty: 'build', reads: ['check-b.mjs'], writes: ['solution-b.mjs'] },
    {
      id: 'integrate',
      duty: 'integrate',
      reads: ['solution-a.mjs', 'solution-b.mjs', 'check-a.mjs', 'check-b.mjs'],
      writes: ['solution.mjs'],
    },
  ];
  if (briefBuilder) {
    turns.find((t) => t.id === 'buildA').reads.unshift('brief-a.md');
    turns.find((t) => t.id === 'buildB').reads.unshift('brief-b.md');
  }
  return { turns, briefBuilder, shape: 'standard', profile: [1, 2, 2, 1] };
}

/** Which turn produced which artefact, for the isolation check. */
export function producerOf(p) {
  const m = new Map();
  for (const t of p.turns) for (const w of t.writes) m.set(w, t.id);
  return m;
}

/**
 * The marker a turn plants so isolation can be DEMONSTRATED rather than
 * asserted. specA plants it; buildB has no path from specA, so if the
 * token reaches buildB's output the plan was not enforced.
 */
export const MARKER_TURN = 'specA';
export const MARKER_BLIND = 'buildB';
export const marker = (runId) => `KEN-ISOLATION-${runId}`;

/** Turns with no path from `from`, by the plan's own edges. */
export function blindTo(p, from) {
  const producer = producerOf(p);
  const reach = new Set([from]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const t of p.turns) {
      if (reach.has(t.id)) continue;
      if (t.reads.some((r) => reach.has(producer.get(r)))) { reach.add(t.id); grew = true; }
    }
  }
  return p.turns.map((t) => t.id).filter((id) => !reach.has(id));
}

/**
 * The brief handed to one turn: the task statement, its duty, and the
 * artefacts its in-edges supply. Nothing about the run, the other lanes,
 * or the bank.
 */
export function brief(p, turn, { statement, runId, artefacts }) {
  const lines = [`# Your job: ${turn.duty}`, ''];
  if (turn.statement) lines.push('## The task', '', statement, '');
  else lines.push('## Context', '', 'You are one turn of a larger effort. What you have been given below is',
    'everything you get. Do not ask for more; nobody will answer.', '');

  if (turn.reads.length) {
    lines.push('## What you have been handed', '');
    for (const r of turn.reads) {
      lines.push(`### ${r}`, '', '```', artefacts[r] ?? '(missing)', '```', '');
    }
  }
  lines.push('## What to produce', '');
  for (const w of turn.writes) lines.push(`- \`${w}\``);
  lines.push('',
    'Write those files in the working directory. Node ES modules, no dependencies,',
    'no network access needed by the artefact itself. You may run anything you like',
    'while working.', '');
  if (turn.mayFanOut) {
    lines.push(
      'You are the WHOLE effort, not one stage of it. Delegate freely to subagents:',
      'they share your context, so nothing is lost handing work to them, and the',
      'budget below is for all of it together.', '');
  }
  if (turn.id === MARKER_TURN) {
    lines.push(`Record the token ${marker(runId)} in a comment at the top of every file you write.`, '');
  }
  lines.push('You are running non-interactively. Make the call, do the work, and stop.');
  return lines.join('\n');
}

/**
 * Invoke one turn. Replaced wholesale in a dry run, which is how the
 * plan, the isolation and the scoring get tested without a key.
 */
export function realAgent({ dir, promptFile, model, maxTurns, budgetUsd }) {
  const r = spawnSync('claude', [
    '-p', '--dangerously-skip-permissions',
    '--model', model,
    '--max-turns', String(maxTurns),
    '--max-budget-usd', String(budgetUsd),
    '--output-format', 'stream-json', '--verbose',
  ], { cwd: dir, input: readFileSync(promptFile, 'utf8'), encoding: 'utf8', timeout: 1800000 });
  return { code: r.status, log: (r.stdout ?? '') + (r.stderr ?? '') };
}

/* ─── THE FREE ARM ───────────────────────────────────────────────────
   Every hypothesis here is priced in turns and dollars, and the dollars
   are what has kept them unrun: H12 alone is 2 arms x 30 runs x 6 turns
   = 360 turns, about $1,800 at the per-turn budget above.

   OpenCode Zen serves a standing free tier, and it needs no key and no
   account at all. Measured from the sandbox on 2026-08-26, not quoted
   from anybody's announcement:

     GET  /zen/v1/models              64 models, 8 of them `-free`
     POST /zen/v1/chat/completions    five of those answered, "cost":"0"
     15 sequential requests           15 ok, 0 throttled, 23s

   (`ox-alpha`, the stealth model this was chased for, is GONE: absent
   from the catalogue, and a direct call returns "Model ox-alpha is not
   supported". The durable free tier is the thing worth having.)

   WHAT THIS DOES NOT BUY. A free model does not make the programme
   cheaper in the currency that binds, which `design.mjs` says is TASKS.
   What it does buy is the one hypothesis where model identity CANCELS:
   H12 is a paired within-arm contrast — solo against standard on the
   same model — so a weaker model moves both arms together and the
   redundancy comparison survives. Do NOT price lambda or g from this
   arm; those are per-model parameters and a free run would report the
   free model's, labelled as though they were the study's.

   SCOPE, and it is a rule rather than a preference. A turn briefed
   through this arm sends its brief to a third party whose retention
   terms cannot be verified from here, and some of the free models are
   unidentified. The brief is `statement.md` — a committed, public-safe
   file with an author and a diff — and the runner already gives each
   turn a fresh tree with no repository in it. That is the whole
   exposure, and it must stay that way. */
export const ZEN_BASE = 'https://opencode.ai/zen/v1';
export const ZEN_VERIFIED = '2026-08-26';
export const FREE_MODELS = [
  'nemotron-3-ultra-free',
  'nemotron-3.5-lightning-free',
  'hy3-free',
  'x-preview-f-free',
  'laguna-s-2.1-free',
  'deepseek-v4-flash-free',
];

/**
 * The opencode config for one turn. Pure, so the selftest can assert
 * its shape without reaching the network — this repo's rule is that a
 * gate never calls out.
 */
export function opencodeConfig({ model, steps }) {
  if (!FREE_MODELS.includes(model)) {
    throw new Error(`opencodeConfig: "${model}" is not a verified free model (have ${FREE_MODELS.join(', ')})`);
  }
  if (!Number.isInteger(steps) || steps < 1) throw new Error(`opencodeConfig: steps must be a positive integer, got ${steps}`);
  return {
    $schema: 'https://opencode.ai/config.json',
    provider: {
      zenfree: {
        npm: '@ai-sdk/openai-compatible',
        name: 'OpenCode Zen (free tier, keyless)',
        /* THE EMPTY STRING IS LOAD-BEARING AND IS NOT A PLACEHOLDER.
           Measured against the live endpoint:

             no Authorization header      -> 200, "cost":"0"
             Authorization: Bearer        -> 200, "cost":"0"
             Authorization: Bearer none   -> 401 "Invalid API key."

           A BAD key fails where NO key succeeds, so the obvious
           placeholder is the one value that breaks it. bakeoff's
           run-cell.sh writes "{env:OPENCODE_CELL_KEY}" here, which is
           correct for a keyed provider and fatal for this one — the
           first run of this arm died on exactly that. */
        options: { baseURL: ZEN_BASE, apiKey: '' },
        models: { [model]: { name: model } },
      },
    },
    model: `zenfree/${model}`,
    small_model: `zenfree/${model}`,
    /* STEPS ARE THE CEILING BECAUSE DOLLARS ARE NOT AVAILABLE.
       `opencode run` has no --max-turns and no budget flag; the
       equivalent is agent.build.steps in the config. With a free model
       the dollar budget is not merely unenforceable, it is meaningless,
       so H12's "equal total budget" is matched in STEPS here and the
       ledger says so rather than reporting a spend of zero as though a
       ceiling had been applied. */
    agent: { build: { steps } },
    /* The root turn may fan out; its subagents may not fan out again.
       H12's solo arm needs the first and does not need the second, and
       leaving the default explicit keeps the two arms comparable. */
    subagent_depth: 1,
  };
}

/**
 * One turn through opencode against a free Zen model.
 *
 * The XDG dirs are deliberately OUTSIDE the turn's tree. Writing them
 * into `dir` would put files in the worktree that no in-edge put there,
 * which is precisely the invariant `execute()` maintains and the
 * isolation audit assumes.
 */
export function opencodeAgent({ dir, promptFile, model, maxTurns }) {
  const home = mkdtempSync(join(tmpdir(), 'ken-oc-'));
  try {
    const cfgDir = join(home, 'config', 'opencode');
    mkdirSync(cfgDir, { recursive: true });
    mkdirSync(join(home, 'data'), { recursive: true });
    writeFileSync(join(cfgDir, 'opencode.json'),
      JSON.stringify(opencodeConfig({ model, steps: maxTurns }), null, 2));
    const r = spawnSync('opencode', ['run', '--auto', '-'], {
      cwd: dir,
      input: readFileSync(promptFile, 'utf8'),
      encoding: 'utf8',
      timeout: 1800000,
      env: { ...process.env, XDG_CONFIG_HOME: join(home, 'config'), XDG_DATA_HOME: join(home, 'data') },
    });
    return { code: r.status, log: (r.stdout ?? '') + (r.stderr ?? '') };
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

/** The engines a run can be executed on. */
export const ENGINES = { claude: realAgent, opencode: opencodeAgent };
/** Which engines cost money, so a ledger cannot imply a budget it never had. */
export const PAID_ENGINES = ['claude'];

/**
 * Execute the plan.
 *
 * `agent` defaults to the real one. Pass a function to script it; the
 * signature is the same, and everything else in this file behaves
 * identically, which is the point.
 */
export function execute({
  taskId, root, runId = 'dry', agent = null, engine = 'claude', briefBuilder = false, shape = 'standard',
  model = 'claude-opus-5', maxTurns = 60, budgetUsd = 5, totalBudgetUsd = null, totalMaxTurns = null,
} = {}) {
  if (!ENGINES[engine]) throw new Error(`unknown engine "${engine}" (have ${Object.keys(ENGINES).join(', ')})`);
  const paid = PAID_ENGINES.includes(engine);
  if (!paid && !FREE_MODELS.includes(model)) {
    throw new Error(`engine "${engine}" runs the free tier; "${model}" is not one of ${FREE_MODELS.join(', ')}`);
  }
  agent = agent ?? ENGINES[engine];
  const task = readTask(taskId);
  const statement = readFileSync(join(task.dir, 'statement.md'), 'utf8');
  const p = plan({ briefBuilder, shape });

  /* BUDGET IS HELD AT THE RUN, NOT THE TURN. Comparing a six-turn shape
     against a one-turn shape at $5 PER TURN would give the six-turn arm
     six times the money, and the contrast would be about spend rather
     than about shape. `totalBudgetUsd` divides across whatever turns the
     shape has; the per-turn figures stay as a fallback for a single
     shape run on its own. */
  const perTurnBudget = totalBudgetUsd === null ? budgetUsd : totalBudgetUsd / p.turns.length;
  const perTurnSteps = totalMaxTurns === null ? maxTurns : Math.round(totalMaxTurns / p.turns.length);
  const producer = producerOf(p);

  rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });

  const artefacts = {};                  // name -> contents, the run's whole memory
  const turnLog = [];

  for (const turn of p.turns) {
    const dir = join(root, turn.id);
    mkdirSync(dir, { recursive: true });

    /* THE TREE IS THE IN-EDGES AND NOTHING ELSE. A missing artefact is
       recorded rather than silently skipped: it means an upstream turn
       did not produce what the plan says it produces, which is a run
       fault and not a turn's fault. */
    const missing = turn.reads.filter((r) => artefacts[r] === undefined);
    for (const r of turn.reads) {
      if (artefacts[r] !== undefined) writeFileSync(join(dir, r), artefacts[r]);
    }

    const promptFile = join(dir, '_brief.md');
    writeFileSync(promptFile, brief(p, turn, { statement, runId, artefacts }));

    const started = Date.now();
    const res = agent({ dir, promptFile, model, maxTurns: perTurnSteps, budgetUsd: perTurnBudget, turn, artefacts, runId });
    const elapsed = Math.round((Date.now() - started) / 1000);

    const produced = {};
    for (const w of turn.writes) {
      const f = join(dir, w);
      if (existsSync(f)) { produced[w] = readFileSync(f, 'utf8'); artefacts[w] = produced[w]; }
    }
    turnLog.push({
      turn: turn.id, duty: turn.duty, reads: [...turn.reads], writes: [...turn.writes],
      missingInputs: missing, produced: Object.keys(produced),
      wrote: turn.writes.filter((w) => produced[w] !== undefined).length,
      exit: res.code, seconds: elapsed,
    });
  }

  return {
    taskId, runId, shape: p.shape, engine, model, plan: p, artefacts, turns: turnLog,
    /* A FREE ARM HAS NO DOLLAR CEILING, AND REPORTING ONE AS ZERO WOULD
       READ AS A CEILING THAT WAS APPLIED. `currency` says which quantity
       was actually held equal across arms, which is what H12's matched
       comparison rests on. */
    spend: {
      currency: paid ? 'usd' : 'steps',
      perTurnBudget: paid ? round(perTurnBudget) : null,
      totalBudgetUsd: paid ? round(perTurnBudget * p.turns.length) : null,
      perTurnSteps, totalSteps: perTurnSteps * p.turns.length, turns: p.turns.length,
    },
    isolation: auditIsolation(p, artefacts, runId),
    scores: score(taskId, artefacts),
  };
}

/**
 * DEMONSTRATE isolation rather than assert it. The marker planted in
 * specA's output must not appear in any turn the plan gives no path
 * from. A leak voids the run.
 */
export function auditIsolation(p, artefacts, runId) {
  const tok = marker(runId);
  const blind = blindTo(p, MARKER_TURN);
  const producer = producerOf(p);
  const leaks = [];
  for (const [name, body] of Object.entries(artefacts)) {
    const by = producer.get(name);
    if (blind.includes(by) && String(body).includes(tok)) leaks.push({ artefact: name, producedBy: by });
  }
  const planted = Object.entries(artefacts)
    .some(([n, b]) => producer.get(n) === MARKER_TURN && String(b).includes(tok));
  /* A ONE-TURN SHAPE HAS NO HANDOFFS, so there is nothing isolation
     could fail at and nothing a marker could demonstrate. Reporting it
     as a clean pass would credit the run with a property it never had
     the opportunity to lose. */
  if (p.turns.length < 2) {
    return {
      marker: tok, blindTurns: [], planted: false, leaks: [],
      clean: true, demonstrated: false, applicable: false,
      note: 'a one-turn shape has no handoffs, so isolation is INAPPLICABLE rather than demonstrated',
    };
  }
  return {
    marker: tok, blindTurns: blind, planted, leaks, applicable: true,
    clean: leaks.length === 0,
    demonstrated: planted && leaks.length === 0,
    note: planted ? null : 'the marker was never planted, so isolation is UNDEMONSTRATED rather than clean',
  };
}

/**
 * Score the run against the bank, which nobody in it has seen.
 *
 * Two quantities, and the second is the one WP4 has been waiting for:
 * the run's own checks, graded for soundness and coverage by the bank's
 * reference and mutants.
 */
export function score(taskId, artefacts) {
  const task = readTask(taskId);
  const tmp = join(HERE, '.runscore');
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });

  // (1) the integrated artefact against the bank's held-out checks
  let held = null;
  if (artefacts['solution.mjs'] !== undefined) {
    writeFileSync(join(tmp, 'candidate.mjs'), artefacts['solution.mjs']);
    held = task.checks.map((c) => {
      const r = runCheck(task.dir, c, join(tmp, 'candidate.mjs'));
      return { check: c, passed: r.passed };
    });
  }

  // (2) the run's OWN checks, graded by the bank's reference and mutants
  const own = [];
  for (const name of Object.keys(artefacts).filter((n) => /^check-[a-z]\.mjs$/.test(n))) {
    const cf = join(tmp, name);
    writeFileSync(cf, artefacts[name]);
    const sound = runCheck(tmp, name, join(task.dir, 'reference.mjs')).passed;
    const kills = task.mutants.map((m) => ({
      mutant: m,
      killed: !runCheck(tmp, name, join(task.dir, 'mutants', m)).passed,
    }));
    const stubRejected = existsSync(join(task.dir, 'stub.mjs'))
      ? !runCheck(tmp, name, join(task.dir, 'stub.mjs')).passed : null;
    own.push({
      check: name,
      sound,                                     // WP4's u, inverted, per check
      coverage: task.mutants.length ? round(kills.filter((k) => k.killed).length / task.mutants.length) : null,
      stubRejected,
      kills,
    });
  }
  rmSync(tmp, { recursive: true, force: true });

  return {
    heldOut: held,
    heldOutPassed: held === null ? null : held.every((h) => h.passed),
    ownChecks: own,
    /* The measurement this whole apparatus exists for. */
    measuredSoundness: own.length ? round(own.filter((o) => o.sound).length / own.length) : null,
    measuredCoverage: own.length ? round(own.reduce((a, o) => a + (o.coverage ?? 0), 0) / own.length) : null,
  };
}

const round = (x) => Math.round(x * 1000) / 1000;

/**
 * A scripted agent for the dry run: it produces the plan's artefacts
 * from the bank, so the harness exercises every path with known content.
 * It is NOT a solver and must never be mistaken for one — it copies the
 * answers in, which is exactly why a dry run measures the harness and
 * reports nothing about agents.
 */
export function scriptedAgent(taskId) {
  const task = readTask(taskId);
  return ({ dir, turn, runId }) => {
    const put = (name, body) => writeFileSync(join(dir, name), body);
    const head = turn.id === MARKER_TURN ? `/* ${marker(runId)} */\n` : '';
    if (turn.id === 'setup') {
      put('brief-a.md', '# effort A\n\nThe estimator.\n');
      put('brief-b.md', '# effort B\n\nThe property.\n');
    } else if (turn.id === 'specA') {
      put('check-a.mjs', head + readFileSync(join(task.dir, 'check-a.mjs'), 'utf8'));
    } else if (turn.id === 'specB') {
      put('check-b.mjs', readFileSync(join(task.dir, 'check-b.mjs'), 'utf8'));
    } else if (turn.id === 'buildA' || turn.id === 'buildB') {
      put(turn.writes[0], readFileSync(join(task.dir, 'reference.mjs'), 'utf8'));
    } else if (turn.id === 'integrate') {
      put('solution.mjs', readFileSync(join(task.dir, 'reference.mjs'), 'utf8'));
    } else if (turn.id === 'solo') {
      put('check-a.mjs', readFileSync(join(task.dir, 'check-a.mjs'), 'utf8'));
      put('check-b.mjs', readFileSync(join(task.dir, 'check-b.mjs'), 'utf8'));
      put('solution.mjs', readFileSync(join(task.dir, 'reference.mjs'), 'utf8'));
    }
    return { code: 0, log: `scripted: ${turn.id}` };
  };
}

// ── CLI ───────────────────────────────────────────────────────────────
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = (n, d) => {
    const i = process.argv.indexOf(`--${n}`);
    return i === -1 ? d : (process.argv[i + 1]?.startsWith('--') ? true : process.argv[i + 1]);
  };
  const taskId = arg('task', 'tb-001-binomial-interval');
  const dry = process.argv.includes('--dry-run');
  const runId = String(arg('run-id', dry ? 'dry' : `r${process.pid}`));
  const root = String(arg('root', join(HERE, '.run', runId)));

  const engine = String(arg('engine', 'claude'));
  /* The free arm needs NO credential, which is the entire point of it,
     so the key check applies to the paid engines only. */
  if (!dry && PAID_ENGINES.includes(engine)
      && !process.env.ANTHROPIC_API_KEY && !process.env.CLAUDE_CODE_OAUTH_TOKEN) {
    console.error('runner: no credential in the environment. Use --dry-run to exercise the harness,'
      + ` or --engine opencode --model ${FREE_MODELS[0]} for the free arm.`);
    process.exit(2);
  }

  const out = execute({
    taskId, root, runId, engine,
    agent: dry ? scriptedAgent(taskId) : undefined,
    briefBuilder: process.argv.includes('--brief-builder'),
    shape: String(arg('shape', 'standard')),
    model: String(arg('model', engine === 'claude' ? 'claude-opus-5' : FREE_MODELS[0])),
    maxTurns: Number(arg('max-turns', 60)),
    budgetUsd: Number(arg('budget', 5)),
    totalBudgetUsd: arg('total-budget', null) === null ? null : Number(arg('total-budget')),
    totalMaxTurns: arg('total-steps', null) === null ? null : Number(arg('total-steps')),
  });

  /* THE RECORD IS WRITTEN BEFORE ANYTHING IS DECIDED. A run whose
     verdict step fails must still leave its ledger, or a leaked run and
     a crashed one look the same afterwards, which is the failure the
     loop's empty-transcript guard was added for. */
  const ledger = arg('ledger', null);
  if (ledger && ledger !== true) {
    mkdirSync(dirname(String(ledger)), { recursive: true });
    writeFileSync(String(ledger), JSON.stringify(out, null, 2));
    console.log(`\n  record     ${ledger}`);
  }

  console.log(`\n${taskId} · run ${runId} · shape ${out.shape} · ${out.engine}/${out.model}`
    + ` · ${out.spend.turns} turn(s) at `
    + (out.spend.currency === 'usd'
      ? `$${out.spend.perTurnBudget}/${out.spend.perTurnSteps} steps`
      : `${out.spend.perTurnSteps} steps each, FREE (matched on steps, not dollars)`)
    + `${dry ? ' · DRY (scripted agent, measures the harness only)' : ''}`);
  for (const t of out.turns) {
    console.log(`  ${t.turn.padEnd(10)} ${t.duty.padEnd(10)} reads ${t.reads.length}  wrote ${t.wrote}/${t.writes.length}  ${t.seconds}s  exit ${t.exit}`);
  }
  const i = out.isolation;
  const verdict = i.applicable === false ? 'INAPPLICABLE (one turn, no handoffs)'
    : i.demonstrated ? 'DEMONSTRATED' : i.clean ? 'clean but undemonstrated' : 'LEAKED';
  console.log(`\n  isolation  ${verdict}`);
  if (i.applicable !== false) {
    console.log(`             marker planted: ${i.planted}; blind turns: ${i.blindTurns.join(', ') || 'none'}; leaks: ${i.leaks.length}`);
  }
  const s = out.scores;
  console.log(`\n  held-out   ${s.heldOutPassed === null ? 'no solution produced' : s.heldOutPassed ? 'PASSED' : 'failed'}`);
  for (const o of s.ownChecks) {
    console.log(`  ${o.check.padEnd(12)} sound ${o.sound}  coverage ${o.coverage}  stub rejected ${o.stubRejected}`);
  }
  console.log(`\n  MEASURED   soundness ${s.measuredSoundness}  coverage ${s.measuredCoverage}`);
  if (dry) console.log('  (a dry run copies the bank in, so these are the harness working, not a result)');

  const ok = out.isolation.clean && out.turns.every((t) => t.wrote === t.writes.length);
  process.exit(ok ? 0 : 1);
}
