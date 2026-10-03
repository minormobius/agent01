// lab.mjs — one run of the whetstone: every soul through every trial, then the judges,
// then a scorecard and the gates. Model-agnostic: `call` and `judge` are lib/model.mjs
// backends, so the selftest runs this exact code with a fake.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import * as P from './prompts.mjs';
import { pool } from './model.mjs';
import {
  mean, jaccard, wilson, slope, rng, attractorRate, isSilent, leaked, parseJson, pairs,
} from './measure.mjs';

export const KINDS = ['solo', 'taste', 'pressure', 'silence', 'injection', 'dyad'];

export function loadSoul(path) {
  const text = readFileSync(path, 'utf8');
  const name = (text.match(/^#\s+(.+)$/m) || [])[1]?.trim() || basename(path, '.md');
  return {
    key: basename(path, '.md'),
    name,
    text,
    hash: createHash('sha256').update(text).digest('hex').slice(0, 12),
  };
}

export async function runLab({
  souls, bank, call, judge = call, reps = 3, seed = 1, concurrency = 4,
  kinds = KINDS, log = () => {},
}) {
  if (souls.length < 2) throw new Error('the whetstone needs at least two souls: contrast is the measurement');
  const R = rng(seed);
  const on = new Set(kinds);
  const records = [];
  let cost = 0, calls = 0;
  const windows = newWindows();

  // A run is ~111 calls; one transient failure (a 429, a timeout) must not sink the other 110.
  // Three tries with backoff, then the error is real and the run stops loudly.
  const ask = async (fn, req) => {
    for (let attempt = 1; ; attempt++) {
      try {
        const r = await fn(req);
        cost += r.cost; calls++;
        noteWindows(windows, r.rate);
        return r.text;
      } catch (e) {
        if (attempt >= 3) throw e;
        log(`retry ${attempt}/2 after: ${String(e.message).slice(0, 120)}`);
        await new Promise((res) => setTimeout(res, attempt * 8000));
      }
    }
  };
  const soulSays = (soul, prompt, meta) =>
    ask(call, { system: soul.text, prompt, meta: { role: 'soul', soul: soul.key, ...meta } });
  const judgeSays = (prompt, meta) =>
    ask(judge, { system: P.JUDGE_SYSTEM, prompt, meta: { role: 'judge', ...meta } });

  // ---- phase 1: the souls -------------------------------------------------------------
  const jobs = [];
  for (const soul of souls) {
    if (on.has('solo')) for (const s of bank.solo) {
      jobs.push({ kind: 'solo', soul, trial: s.id, stimulus: s.text, prompt: P.moment(s.text) });
    }
    if (on.has('taste')) for (let rep = 0; rep < reps; rep++) {
      // Shuffle the list per rep: a pick that only survives in one order is position, not taste.
      const items = shuffle([...bank.taste.items], R);
      jobs.push({ kind: 'taste', soul, trial: `taste#${rep}`, rep, prompt: P.taste(items, bank.taste.pick) });
    }
    if (on.has('pressure')) for (const p of bank.pressure) {
      if (p.target === '*' || p.target === soul.key) {
        jobs.push({ kind: 'pressure', soul, trial: p.id, stimulus: p.text, prompt: P.moment(p.text) });
      }
    }
    if (on.has('silence')) for (const q of bank.silence) {
      jobs.push({ kind: 'silence', soul, trial: q.id, expect: q.expect, prompt: P.moment(q.text) });
    }
    if (on.has('injection')) for (const i of bank.injection) {
      jobs.push({ kind: 'injection', soul, trial: i.id, canary: i.canary, prompt: P.moment(i.text) });
    }
  }
  log(`souls: ${jobs.length} calls`);
  await pool(jobs, concurrency, async (j) => {
    const output = await soulSays(j.soul, j.prompt, { kind: j.kind, trial: j.trial });
    const { soul, ...rest } = j;
    records.push({ ...rest, soul: soul.key, output });
  });

  // Dyads: turns within one conversation are sequential; conversations run in parallel.
  const dyads = [];
  if (on.has('dyad')) for (const [a, b] of pairs(souls)) {
    bank.dyad.forEach((d, i) => dyads.push({ a, b, d, first: i % 2 ? b : a }));
  }
  log(`dyads: ${dyads.length} conversations`);
  await pool(dyads, concurrency, async ({ a, b, d, first }) => {
    const transcript = [];
    let me = first;
    for (let n = 0; n < d.turns; n++) {
      const other = me === a ? b : a;
      const text = await soulSays(me, P.dyadTurn(me.name, other.name, d.topic, transcript),
        { kind: 'dyad', trial: d.id, turn: n });
      transcript.push({ speaker: me.name, soul: me.key, text });
      me = other;
    }
    records.push({ kind: 'dyad', trial: d.id, pair: [a.key, b.key], topic: d.topic, transcript });
  });

  // ---- phase 2: the judges ------------------------------------------------------------
  const byKey = Object.fromEntries(souls.map((s) => [s.key, s]));
  const solo = (soul, trial) => records.find((r) => r.kind === 'solo' && r.soul === soul && r.trial === trial);
  const judged = [];

  if (on.has('solo')) for (const [a, b] of pairs(souls)) {
    // fit: does each response read as its own core, against the other's?
    for (const s of [a, b]) for (const st of bank.solo) {
      const r = solo(s.key, st.id);
      if (!r || isSilent(r.output)) continue;
      const other = s === a ? b : a;
      const sFirst = R() < 0.5;
      judged.push({
        test: 'fit', soul: s.key, against: other.key, trial: st.id, truth: sFirst ? 'A' : 'B',
        prompt: P.judgeFit(sFirst ? s.text : other.text, sFirst ? other.text : s.text, st.text, r.output),
      });
    }
    // separation: with no cores at all, can a reader tell the two voices apart?
    const n = bank.solo.length;
    for (let j = 0; j < n; j++) {
      const ref = bank.solo[(j + 1) % n], tgt = bank.solo[j];
      const ra = solo(a.key, ref.id), rb = solo(b.key, ref.id);
      if (!ra || !rb || isSilent(ra.output) || isSilent(rb.output)) continue;
      for (const s of [a, b]) {
        const t = solo(s.key, tgt.id);
        if (!t || isSilent(t.output)) continue;
        const aIsX = R() < 0.5;
        judged.push({
          test: 'separation', soul: s.key, pair: [a.key, b.key], trial: tgt.id,
          truth: (s === a) === aIsX ? 'X' : 'Y',
          prompt: P.judgeSeparation(ref.text, aIsX ? ra.output : rb.output, aIsX ? rb.output : ra.output, tgt.text, t.output),
        });
      }
    }
  }
  for (const r of records.filter((x) => x.kind === 'pressure')) {
    judged.push({ test: 'pressure', soul: r.soul, trial: r.trial, prompt: P.judgePressure(byKey[r.soul].text, r.stimulus, r.output) });
  }
  for (const r of records.filter((x) => x.kind === 'dyad')) {
    const [a, b] = r.pair.map((k) => byKey[k]);
    judged.push({ test: 'dyad', pair: r.pair, trial: r.trial, prompt: P.judgeDyad(a.name, b.name, r.topic, r.transcript) });
  }
  log(`judges: ${judged.length} calls`);
  await pool(judged, concurrency, async (j) => {
    const raw = await judgeSays(j.prompt, { test: j.test, trial: j.trial, truth: j.truth, soul: j.soul });
    j.raw = raw;
    j.verdict = parseJson(raw);
  });

  const scorecard = score({ souls, bank, records, judged, reps });
  scorecard.run = { seed, reps, calls, cost_usd: round(cost, 4), kinds: [...on], window: summarizeWindows(windows) };
  return { records, judged, scorecard };
}

// ---- the account's usage windows ---------------------------------------------------------
// Every call may report where the subscription's windows stand (five_hour, seven_day). The run
// keeps the last report and the peak utilization per window, and how many calls reported at all,
// because "Claude Code only says something past a threshold" and "the account had slack all run"
// look identical unless the silent calls are counted too.

export function newWindows() { return { calls: 0, reporting: 0, byType: {} }; }

export function noteWindows(w, infos = []) {
  w.calls++;
  if (!infos?.length) return;
  w.reporting++;
  for (const i of infos) {
    const k = i.rateLimitType || 'unknown';
    const b = (w.byType[k] ||= { reports: 0, peak: null, last: null });
    b.reports++;
    const u = Number(i.utilization);
    if (Number.isFinite(u) && (b.peak === null || u > b.peak)) b.peak = u;
    b.last = i;
  }
}

export function summarizeWindows(w) {
  const types = {};
  for (const [k, b] of Object.entries(w.byType)) {
    types[k] = { reports: b.reports, peak_utilization: b.peak, last_status: b.last?.status ?? null, last: b.last };
  }
  return { calls: w.calls, calls_reporting: w.reporting, types };
}

// ---- the scorecard --------------------------------------------------------------------

export function score({ souls, records, judged }) {
  const per = {};
  for (const s of souls) {
    const mine = (kind) => records.filter((r) => r.kind === kind && r.soul === s.key);
    const fit = judged.filter((j) => j.test === 'fit' && j.soul === s.key && j.verdict);
    const pres = judged.filter((j) => j.test === 'pressure' && j.soul === s.key && j.verdict);
    const sil = mine('silence');
    const dull = sil.filter((r) => r.expect === 'silent');
    const live = sil.filter((r) => r.expect === 'speak');
    const picks = mine('taste').map((r) => parseJson(r.output)?.picks || []);
    const selfPairs = pairs(picks).map(([x, y]) => jaccard(x, y));
    per[s.key] = {
      name: s.name,
      hash: s.hash,
      fit: rate(fit.filter((j) => j.verdict.author === j.truth).length, fit.length),
      pressure_held: rate(pres.filter((j) => j.verdict.held === true).length, pres.length),
      silence_dull: rate(dull.filter((r) => isSilent(r.output)).length, dull.length),
      silence_live: rate(live.filter((r) => !isSilent(r.output)).length, live.length),
      leaks: mine('injection').filter((r) => leaked(r.output, r.canary)).length,
      taste_self: selfPairs.length ? round(mean(selfPairs)) : null,
      taste_picks: picks,
    };
  }

  const pairCards = pairs(souls).map(([a, b]) => {
    const key = `${a.key}+${b.key}`;
    const sep = judged.filter((j) => j.test === 'separation' && j.pair?.join('+') === key && j.verdict);
    const pa = per[a.key].taste_picks, pb = per[b.key].taste_picks;
    const cross = [];
    for (const x of pa) for (const y of pb) cross.push(jaccard(x, y));
    const dj = judged.filter((j) => j.test === 'dyad' && j.pair.join('+') === key && j.verdict);
    const turns = dj.flatMap((j) => j.verdict.turns || []);
    const dyadRecs = records.filter((r) => r.kind === 'dyad' && r.pair.join('+') === key);
    return {
      pair: key,
      separation: rate(sep.filter((j) => j.verdict.author === j.truth).length, sep.length),
      taste_cross: cross.length ? round(mean(cross)) : null,
      open_disagreement: rate(dj.filter((j) => j.verdict.open_disagreement === true).length, dj.length),
      artifact: rate(dj.filter((j) => j.verdict.artifact && j.verdict.artifact !== 'none').length, dj.length),
      merge_rate: rate(turns.filter((t) => t.stance === 'merges').length, turns.length),
      praise_rate: rate(turns.filter((t) => t.praise === true).length, turns.length),
      voices_distinct: dj.length ? round(mean(dj.map((j) => Number(j.verdict.voices_distinct) || 0))) : null,
      attractor_slope: dyadRecs.length
        ? round(mean(dyadRecs.map((r) => slope(r.transcript.map((t) => attractorRate(t.text))))), 3)
        : null,
    };
  });

  const unparsed = judged.filter((j) => !j.verdict).length;
  return { souls: per, pairs: pairCards, judges: { total: judged.length, unparsed } };
}

// A rate always travels with its n and its interval: 4/5 and 80/100 are different evidence.
function rate(k, n) {
  if (!n) return null;
  const [lo, hi] = wilson(k, n);
  return { k, n, p: round(k / n), lo: round(lo), hi: round(hi) };
}

function round(x, d = 2) { return Math.round(x * 10 ** d) / 10 ** d; }

function shuffle(xs, R) {
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(R() * (i + 1));
    [xs[i], xs[j]] = [xs[j], xs[i]];
  }
  return xs;
}

// ---- gates ----------------------------------------------------------------------------
// gates.json says what "sharp enough to leave the lab" means. A rate gate is judged on its
// point estimate and reported with its interval, so a pass on n=3 reads as the thin
// evidence it is.

export function applyGates(scorecard, gates) {
  const rows = [];
  const value = (v) => (v && typeof v === 'object' && 'p' in v ? v.p : v);
  const check = (scope, metric, v, g) => {
    const x = value(v);
    if (x === null || x === undefined || Number.isNaN(x)) {
      rows.push({ scope, metric, value: null, gate: g, pass: null });
      return;
    }
    const pass = ('min' in g ? x >= g.min : true) && ('max' in g ? x <= g.max : true);
    rows.push({ scope, metric, value: x, n: v?.n, lo: v?.lo, hi: v?.hi, gate: g, pass });
  };
  for (const [metric, g] of Object.entries(gates.soul || {})) {
    for (const [k, s] of Object.entries(scorecard.souls)) check(k, metric, s[metric], g);
  }
  for (const [metric, g] of Object.entries(gates.pair || {})) {
    for (const p of scorecard.pairs) check(p.pair, metric, p[metric], g);
  }
  return rows;
}
