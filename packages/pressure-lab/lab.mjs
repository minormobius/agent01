/* pressure-lab — measurement scaffolding for the /pressure/ family of games.
 *
 * WHAT THIS IS NOT: a solver. Every game in the family measures a different
 * thing about your decision — that is the whole point of the family — so a
 * shared solver would be a lie. Hold the Line has no ground truth at all;
 * Telegraph counts a set; The Ratchet asks whether a future exists; Cold Read
 * will grade a timing and Standoff a distribution. Nothing useful is common
 * *underneath* those.
 *
 * WHAT IS COMMON is everything wrapped around them, and it is exactly where the
 * bugs were. Each of the three built games independently grew: a spread of bot
 * policies, quantile tables, a tightness histogram, a generate-check-repair
 * loop, and the same three selftest assertions. Every one of those was
 * hand-rolled per game with slightly different thresholds, and four real design
 * bugs hid in the differences:
 *
 *   - a naive policy scoring the same as a good one, which meant the mechanic
 *     the game was built around was decorative (Hold the Line's heat);
 *   - a generator repair loop quietly deleting half of every kit (The Ratchet);
 *   - measuring the OPENING choice of a run when the opening is meant to be
 *     forgiving (The Ratchet again);
 *   - pooling a policy that fails by construction into a distribution, where it
 *     contributed 144 meaningless zeroes (The Ratchet, third time).
 *
 * So this encodes the fixes as defaults and the traps as warnings.
 *
 * Node-only, used from `games/<name>/test/*.mjs`. Note that the rule against
 * importing across directories applies to the BROWSER engines — static sites
 * have no bundler — and not to the node test tooling, which is why this can be
 * genuinely shared with no duplicated copies.
 *
 * No build step, no dependencies.
 */

// ============================================================== statistics ==

export function quantile(values, q) {
  if (!values.length) return NaN;
  const a = values.slice().sort((x, y) => x - y);
  const pos = (a.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return lo === hi ? a[lo] : a[lo] + (a[hi] - a[lo]) * (pos - lo);
}

export function summary(values) {
  const a = values.slice().sort((x, y) => x - y);
  return {
    n: a.length,
    min: a[0], max: a[a.length - 1],
    p10: quantile(a, 0.1), p50: quantile(a, 0.5), p90: quantile(a, 0.9),
    mean: a.reduce((s, x) => s + x, 0) / (a.length || 1),
  };
}

export const bar = (n, max, width = 22) =>
  "█".repeat(max > 0 ? Math.round((n / max) * width) : 0).padEnd(width, "·");

/* Padded so 50.0% and 100.0% line up in a column — the whole reason these
   reports are readable at a glance. */
export const pct = (x, w = 5) => (x * 100).toFixed(1).padStart(w) + "%";

/* A counted histogram over small integer values, printed in order. */
export function histogram(values, { label = (k) => String(k), width = 22 } = {}) {
  const counts = {};
  values.forEach((v) => { counts[v] = (counts[v] || 0) + 1; });
  const keys = Object.keys(counts).map(Number).sort((a, b) => a - b);
  const max = Math.max(0, ...Object.values(counts));
  const w = Math.max(...keys.map((k) => label(k).length), 0);
  return keys.map((k) =>
    `  ${label(k).padEnd(w)}  ${bar(counts[k], max, width)} ${String(counts[k]).padStart(5)}  ` +
    pct(counts[k] / values.length)
  ).join("\n");
}

// ================================================================== bands ===

/* Named verdicts for "what fraction of your options were correct".
 *
 * There are two sets, and picking the wrong one produces confident nonsense.
 * The first version of this library shipped only WIDE, and applying it to The
 * Ratchet declared 65% of its routes "trivial" — because Telegraph offers ~700
 * options per turn while The Ratchet offers ~5. At five options the smallest
 * possible non-zero tightness is 20%, so every WIDE band below "fair" is
 * unreachable and the verdict is meaningless.
 *
 * A fraction is only comparable across games with comparable option counts.
 * Choose by the size of the decision, not by the game. */
export const BANDS_WIDE = [
  { name: "impossible", max: 0,    note: "no correct option existed" },
  { name: "brutal",     max: 0.02, note: "a handful of the option set" },
  { name: "tight",      max: 0.10, note: "a real search" },
  { name: "fair",       max: 0.25, note: "several ways through" },
  { name: "loose",      max: 0.50, note: "hard to get wrong" },
  { name: "trivial",    max: 1.01, note: "asking nothing" },
];

/* For decisions with roughly a handful of options, where one wrong choice out
   of five is already a sharp question. */
export const BANDS_NARROW = [
  { name: "impossible", max: 0,    note: "no correct option existed" },
  { name: "forced",     max: 0.26, note: "essentially one way through" },
  { name: "narrow",     max: 0.50, note: "half the options are traps" },
  { name: "open",       max: 0.80, note: "one or two ways to go wrong" },
  { name: "free",       max: 1.01, note: "asking nothing" },
];

export const BANDS = BANDS_WIDE;   // back-compat default

export function classify(tightness, bands = BANDS_WIDE) {
  if (!(tightness > 0)) return "impossible";
  return (bands.find((b) => tightness <= b.max) || bands[bands.length - 1]).name;
}

export function bandReport(tightnesses, { bands = BANDS_WIDE } = {}) {
  const rows = bands.map((b) => ({
    band: b, n: tightnesses.filter((t) => classify(t, bands) === b.name).length,
  }));
  const max = Math.max(...rows.map((r) => r.n));
  const out = rows.map((r) =>
    `  ${(r.band.name + " (" + r.band.note + ")").padEnd(44)} ${bar(r.n, max)} ` +
    `${String(r.n).padStart(5)}  ${pct(r.n / tightnesses.length)}`
  ).join("\n");
  const impossible = rows[0].n / tightnesses.length;
  const trivial = rows[rows.length - 1].n / tightnesses.length;
  const loosest = rows[rows.length - 1].band.name;
  return {
    text: out,
    impossible, trivial,
    warnings: [
      impossible > 0.01 && `${pct(impossible)} of states had NO correct option — if the game promises a right answer, this is a broken contract, not difficulty`,
      trivial > 0.25 && `${pct(trivial)} of states landed in "${loosest}" — most of the game is not asking a question (or the band set is wrong for this option-set size)`,
    ].filter(Boolean),
  };
}

// ========================================================= policy spreads ===

/* Run a set of bot policies over the same seeds and report the spread.
 *
 * `control` names the policy that is deliberately bad. It is required, and that
 * is the point: a single policy's score is uninterpretable. What tells you
 * whether a mechanic does any work is the GAP between careless play and careful
 * play. When Hold the Line's heat mechanic was decorative, the tell was not a
 * bad number — it was that the bot ignoring heat scored the same as the bot
 * reading it.
 */
export function spread({ seeds, policies, play, control, label = "score", higherIsBetter = true }) {
  const names = Object.keys(policies);
  if (!names.length) throw new Error("spread(): no policies given");
  if (!control) throw new Error("spread(): a `control` policy is required — one score means nothing without a floor to compare it to");
  if (!policies[control]) throw new Error(`spread(): control "${control}" is not one of the policies`);

  const results = {};
  for (const name of names) {
    results[name] = summary(seeds.map((s) => play(s, policies[name], name)));
  }

  const width = Math.max(...names.map((n) => n.length));
  const text = names.map((n) => {
    const r = results[n];
    return `  ${n.padEnd(width)} ${label} p10 ${fmt(r.p10)} · median ${fmt(r.p50)} · p90 ${fmt(r.p90)}` +
      (n === control ? "   (control)" : "");
  }).join("\n");

  const base = results[control].p50;
  const best = names.filter((n) => n !== control)
    .reduce((b, n) => (higherIsBetter ? Math.max(b, results[n].p50) : Math.min(b, results[n].p50)),
      higherIsBetter ? -Infinity : Infinity);
  const gap = higherIsBetter ? best - base : base - best;

  return {
    results, text, gap,
    warnings: [
      gap <= 0 && `no policy beat the control (${control}) — whatever this game thinks its central mechanic is, it is currently decorative`,
    ].filter(Boolean),
  };
}

const fmt = (x) => (Number.isFinite(x) ? x.toFixed(1) : "—").padStart(5);

/* Pooling distributions across policies is a trap. A policy that fails BY
   CONSTRUCTION in a particular way will swamp the shape you are looking for —
   The Ratchet's hoarder bot dies exactly when its supply runs out, so its
   "how early was the fatal move" gap is always zero, and pooling it buried the
   real distribution under 144 forced zeroes.
 *
 * So pooling is explicit, must name the policies included, and says so in the
 * output. */
export function pool(byPolicy, include, why) {
  const missing = include.filter((n) => !byPolicy[n]);
  if (missing.length) throw new Error(`pool(): unknown policies ${missing.join(", ")}`);
  return {
    values: include.flatMap((n) => byPolicy[n]),
    note: `(${include.join(" + ")} only${why ? " — " + why : ""})`,
  };
}

// ====================================================== generator contract ==

/* Generate-check-repair, the loop Telegraph and The Ratchet both grew.
 *
 * A game that promises something about its content — "there is always a right
 * answer", "this road can be crossed" — has to verify it at generation time,
 * because the promise is the genre. `holds` is that predicate.
 *
 * Repairs are tried IN ORDER, and the order matters more than it looks. The
 * lesson from Telegraph: prefer repairs that GRANT CAPABILITY over repairs that
 * DELETE CONTENT. Stationing a defender answers a board; deleting an attacker
 * also answers it, and costs the encounter its character. Put the generous
 * repairs first and the destructive one last.
 *
 * `stats` reports which repair fired how often — the diagnostic that would have
 * caught The Ratchet's trim loop eating half of every kit, and which I had to
 * add by hand after the fact.
 */
export function ensure(subject, { holds, repairs = [], attempts = 12, stats = null }) {
  /* Each repair may declare how many attempts it gets before the next one is
     reached (`tries`, default 1); the last one repeats until `attempts` runs
     out. One-repair-per-attempt was too rigid — both games needed "try the
     generous repair a few times, THEN fall back to the destructive one". */
  const plan = [];
  for (const r of repairs) for (let t = 0; t < (r.tries || 1); t++) plan.push(r);

  for (let i = 0; i < attempts; i++) {
    if (holds(subject)) {
      if (stats) stats.ok = (stats.ok || 0) + 1;
      return { subject, repaired: i, ok: true };
    }
    const repair = plan[Math.min(i, plan.length - 1)];
    if (!repair) break;
    if (stats) {
      stats.fired = stats.fired || {};
      stats.fired[repair.name] = (stats.fired[repair.name] || 0) + 1;
    }
    const next = repair.apply(subject);
    if (next !== undefined) subject = next;
  }
  const ok = holds(subject);
  if (stats && !ok) stats.failed = (stats.failed || 0) + 1;
  return { subject, repaired: attempts, ok };
}

export function repairReport(stats) {
  const fired = stats.fired || {};
  const total = (stats.ok || 0) + (stats.failed || 0);
  const lines = Object.entries(fired).sort((a, b) => b[1] - a[1])
    .map(([name, n]) => `  ${name.padEnd(28)} fired ${String(n).padStart(5)} times`);
  const destructive = Object.entries(fired).filter(([n]) => /remove|delete|drop|trim|thin|pop/i.test(n));
  return {
    text: lines.length ? lines.join("\n") : "  (no repairs needed)",
    warnings: [
      stats.failed > 0 && `${stats.failed} of ${total} could not be repaired — the contract is not actually guaranteed`,
      destructive.some(([, n]) => n > total * 0.25) &&
        `a content-deleting repair fired on more than a quarter of subjects — the generator is probably producing something it then has to gut`,
    ].filter(Boolean),
  };
}

// ============================================================== assertions ==

/* The three checks every game in the family needs, written three times already.
   Each returns {ok, detail} so a selftest can print it in its own voice. */

export function checkDeterminism(build, fingerprint, cases) {
  const bad = cases.filter((c) => fingerprint(build(c)) !== fingerprint(build(c)));
  return { ok: bad.length === 0, detail: bad.length ? `${bad.length} of ${cases.length} did not reproduce` : `${cases.length} reproduced` };
}

export function checkTermination(build, step, cases, { maxSteps = 500 } = {}) {
  const stuck = [];
  for (const c of cases) {
    let s = build(c), i = 0;
    while (i++ < maxSteps) { const n = step(s); if (n === null || n === undefined) break; s = n; }
    if (i >= maxSteps) stuck.push(c);
  }
  return { ok: stuck.length === 0, detail: stuck.length ? `${stuck.length} never terminated` : `${cases.length} terminated` };
}

export function checkContract(build, holds, cases) {
  const bad = cases.filter((c) => !holds(build(c)));
  return {
    ok: bad.length === 0,
    detail: bad.length ? `${bad.length} of ${cases.length} broke the contract` : `${cases.length} upheld the contract`,
    failures: bad,
  };
}

// ================================================================ printing ==

export function section(title) { return `\n— ${title} —`; }

/* Print any warnings a report produced, loudly. These are the findings the
   whole library exists to surface, so they must never be quiet. */
export function warnings(...reports) {
  const all = reports.flatMap((r) => (r && r.warnings) || []);
  if (!all.length) return "";
  return "\n⚠ " + all.join("\n⚠ ");
}
