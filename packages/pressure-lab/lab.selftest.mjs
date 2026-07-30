/* node packages/pressure-lab/lab.selftest.mjs
 *
 * The lab is measurement tooling, so a bug in it does not crash anything — it
 * quietly reports the wrong number and a game gets tuned against it. That makes
 * it worth more testing than its size suggests, not less.
 */
import {
  quantile, summary, histogram, bar, pct,
  BANDS_WIDE, BANDS_NARROW, classify, bandReport,
  spread, pool, ensure, repairReport,
  checkDeterminism, checkTermination, checkContract, warnings,
} from "./lab.mjs";

let failures = 0;
const ck = (c, m) => { if (c) console.log(`  ✓ ${m}`); else { failures++; console.error(`  ✗ ${m}`); } };
const threw = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };

console.log("— statistics —");
{
  ck(quantile([1, 2, 3, 4, 5], 0.5) === 3, "median of an odd set");
  ck(quantile([1, 2, 3, 4], 0.5) === 2.5, "median interpolates on an even set");
  ck(quantile([5, 1, 3], 0.5) === 3, "input need not be pre-sorted");
  ck(Number.isNaN(quantile([], 0.5)), "empty input gives NaN, not a crash");
  const s = summary([4, 1, 3, 2]);
  ck(s.min === 1 && s.max === 4 && s.n === 4 && s.mean === 2.5, "summary reports min, max, n, mean");
  // Sorting must not mutate the caller's array.
  const orig = [3, 1, 2];
  quantile(orig, 0.5); summary(orig);
  ck(orig.join() === "3,1,2", "the caller's array is never re-ordered");
  ck(bar(1, 2, 4) === "██··", "bar fills proportionally and pads");
  ck(bar(1, 0, 4) === "····", "bar survives a zero maximum");
  ck(pct(0.5) === " 50.0%" && pct(1) === "100.0%", "pct pads so 50% and 100% align in a column");
}

console.log("\n— bands —");
{
  ck(classify(0) === "impossible", "zero is impossible");
  ck(classify(-1) === "impossible", "so is anything below zero");
  ck(classify(0.01, BANDS_WIDE) === "brutal", "wide: 1% is brutal");
  ck(classify(1, BANDS_WIDE) === "trivial", "wide: everything correct is trivial");
  // The bug that made two band sets necessary.
  ck(classify(0.2, BANDS_WIDE) === "fair" && classify(0.2, BANDS_NARROW) === "forced",
    "the same 20% reads as 'fair' on a wide option set and 'forced' on a narrow one");
  ck(BANDS_WIDE.every((b, i, a) => i === 0 || b.max > a[i - 1].max), "wide bands are ordered");
  ck(BANDS_NARROW.every((b, i, a) => i === 0 || b.max > a[i - 1].max), "narrow bands are ordered");

  const all = bandReport([0, 0, 0.5, 1]);
  ck(all.impossible === 0.5, "bandReport counts impossible states");
  ck(all.warnings.some((w) => /NO correct option/.test(w)), "and warns loudly about them");
  const fine = bandReport([0.2, 0.3, 0.2, 0.3]);
  ck(fine.warnings.length === 0, "a healthy distribution warns about nothing");
  const loose = bandReport([1, 1, 1, 0.2]);
  ck(loose.warnings.some((w) => /asking a question/.test(w)), "and a mostly-trivial one is flagged");
}

console.log("\n— policy spreads —");
{
  const seeds = [1, 2, 3, 4];
  const play = (seed, fn) => fn(seed);
  const good = spread({
    seeds, play, control: "bad",
    policies: { bad: (s) => s, good: (s) => s * 3 },
  });
  ck(good.gap > 0, `a real gap is reported (${good.gap})`);
  ck(good.warnings.length === 0, "and no warning is raised");
  ck(/\(control\)/.test(good.text), "the control is marked in the output");

  // The finding the whole library exists for.
  const flat = spread({
    seeds, play, control: "bad",
    policies: { bad: (s) => s, alleged: (s) => s },
  });
  ck(flat.gap <= 0 && flat.warnings.some((w) => /decorative/.test(w)),
    "a policy that ties the control is called decorative");

  ck(/required/.test(threw(() => spread({ seeds, play, policies: { a: (s) => s } })) || ""),
    "omitting the control is an error, not a default");
  ck(threw(() => spread({ seeds, play, control: "nope", policies: { a: (s) => s } })) !== null,
    "naming a control that does not exist is an error");
  ck(threw(() => spread({ seeds, play, control: "a", policies: {} })) !== null,
    "an empty policy set is an error");

  // Lower-is-better games must be gradeable too.
  const golf = spread({
    seeds, play, control: "bad", higherIsBetter: false,
    policies: { bad: (s) => s * 10, good: (s) => s },
  });
  ck(golf.gap > 0, "lower-is-better scoring reports a positive gap for the better policy");
}

console.log("\n— pooling —");
{
  const by = { a: [1, 2], b: [3], c: [0, 0, 0] };
  const p = pool(by, ["a", "b"], "c fails by construction");
  ck(p.values.join() === "1,2,3", "pooling concatenates only what was named");
  ck(/a \+ b/.test(p.note) && /construction/.test(p.note), "and the note says what was included and why");
  ck(threw(() => pool(by, ["a", "zzz"])) !== null, "pooling an unknown policy is an error");
}

console.log("\n— the generator contract —");
{
  // Repairs run in order; the generous one should resolve most cases.
  const stats = {};
  const log = [];
  const res = ensure({ v: 0 }, {
    holds: (s) => s.v >= 2,
    repairs: [
      { name: "grant", apply: (s) => { log.push("grant"); return { v: s.v + 1 }; } },
      { name: "delete", apply: (s) => { log.push("delete"); return { v: 99 }; } },
    ],
    stats,
  });
  ck(res.ok && res.subject.v === 99, "ensure repairs until the predicate holds");
  ck(log.join() === "grant,delete", "repairs fire in the order given");
  ck(stats.fired.grant === 1 && stats.fired.delete === 1, "and each firing is counted");

  // A repair may hold the floor for several attempts before the next is reached.
  const order = [];
  ensure({ v: 0 }, {
    holds: (s) => s.v >= 3,
    repairs: [
      { name: "gentle", tries: 3, apply: (s) => { order.push("g"); return { v: s.v + 1 }; } },
      { name: "blunt", apply: (s) => { order.push("b"); return { v: 9 }; } },
    ],
  });
  ck(order.join("") === "ggg", "a repair with tries:3 is used three times before the next one");

  const already = ensure({ v: 5 }, { holds: (s) => s.v >= 2, repairs: [] });
  ck(already.ok && already.repaired === 0, "a subject that already holds is untouched");

  const hopeless = ensure({ v: 0 }, { holds: () => false, repairs: [{ name: "noop", apply: (s) => s }], attempts: 3 });
  ck(hopeless.ok === false, "an unrepairable subject reports failure rather than looping");

  // The diagnostic that would have caught The Ratchet's kit-eating trim loop.
  const bad = { ok: 1, failed: 0, fired: { "trim tools": 3 } };
  ck(repairReport(bad).warnings.some((w) => /content-deleting/.test(w)),
    "a destructive repair firing constantly is flagged");
  const worse = repairReport({ ok: 1, failed: 2, fired: {} });
  ck(worse.warnings.some((w) => /not actually guaranteed/.test(w)),
    "a contract that could not be repaired is flagged");
}

console.log("\n— shared assertions —");
{
  let n = 0;
  ck(checkDeterminism((c) => ({ c }), (s) => JSON.stringify(s), [1, 2, 3]).ok, "determinism passes on a pure builder");
  ck(!checkDeterminism(() => ({ c: n++ }), (s) => JSON.stringify(s), [1]).ok, "and fails on an impure one");

  ck(checkTermination((c) => c, (s) => (s > 0 ? s - 1 : null), [3, 5]).ok, "termination passes on a shrinking step");
  ck(!checkTermination((c) => c, (s) => s + 1, [1], { maxSteps: 20 }).ok, "and fails on a step that never ends");

  const contract = checkContract((c) => c, (s) => s > 0, [1, 2, -1]);
  ck(!contract.ok && contract.failures.join() === "-1", "contract failures are reported with the cases");
}

console.log("\n— printing —");
{
  const h = histogram([0, 0, 1, 2], { label: (k) => (k === 0 ? "none" : `${k}x`) });
  ck(h.split("\n").length === 3, "histogram prints one row per distinct value");
  ck(/none/.test(h) && /1x/.test(h), "using the supplied labels");
  ck(warnings({ warnings: ["a"] }, { warnings: [] }, null) === "\n⚠ a", "warnings collects across reports and tolerates nulls");
  ck(warnings({ warnings: [] }) === "", "and stays silent when there is nothing to say");
}

console.log(failures ? `\n${failures} FAILED\n` : "\nall good\n");
process.exit(failures ? 1 : 0);
