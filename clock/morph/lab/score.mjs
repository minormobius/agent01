// score.mjs — measuring whether a composition has anything to listen to.
//
// The complaint this exists to answer is "there is not much texture in the
// continuous morphing", which sounds subjective and is not. Pluck pitch is
//
//     step = round(clamp(depth / maxDepth, 0, 1) * 14)
//
// a pure function of a gate's depth. So on a structure that has finished
// growing, **every gate plays the same note forever** and the only thing that
// can vary is which gates fire: the piece can be reordered but never retuned.
// That is arithmetic rather than opinion, and this file measures it — along
// with the two things that *do* break it, which are incommensurate feedback
// loops and structural turnover.
//
// (Whether such a piece is exactly *periodic* is a subtler question than it
// first looks: the injection interval is `depth / rate` and therefore usually
// fractional, so most of them are quasi-periodic — coming round to almost the
// same place forever without ever repeating exactly. "period ∞" from a real
// piece is weaker evidence of variety than it appears, which is why `drift` is
// the number to trust.)
//
// Two families of score, both over the stream the sonifier would actually
// *play* rather than the stream the engine produces — the audio takes at most
// MAX_FIRES_PER_FRAME notes from each tick, by a deterministic stratified
// sample, so a piece can be busy and still hand you the same six notes every
// time round. Scoring the engine's output would miss that entirely, and it is
// exactly the failure mode a dense structure has.
//
//   variety — is it still telling you something new after a minute?
//     Repetition at short lags is rhythm; repetition at long lags is a loop.
//     Measured as self-similarity of the heard note-set at lags from 1 to 512
//     ticks, entropy over the 15 reachable pitches, and exact cycle detection.
//
//   harmony — is what it plays *together* pleasant, and does it use its range?
//     Pairwise interval consonance over notes still sounding, mean polyphony
//     against a target band, and how much of the register gets used.
//
// **What these are not.** Harmony here is a proxy: interval consonance, voice
// density and register spread. It cannot tell you a piece is beautiful. It can
// tell you a piece plays three distinct notes and repeats every twelve ticks,
// which is the thing actually wrong with a static structure, and it can rank
// candidates so that taste is spent on a shortlist rather than on a sweep.
//
//   node clock/morph/lab/score.mjs            # every preset and every piece
//   node clock/morph/lab/score.mjs medusa     # one, with its detail
//   node clock/morph/lab/score.mjs --sweep    # settings sweep for the top few

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

// Mirrors of the sonifier's constants. Kept as literals rather than imported,
// because audio.js reaches for AudioContext at module scope-adjacent points and
// this has to run in node — but they are asserted against audio.js by the
// selftest, so a change there fails here rather than silently rescoring.
export const SCALE = [0, 3, 5, 7, 10];
export const MAX_FIRES_PER_FRAME = 6;
export const PITCH_STEPS = 15; // round(t * 14) for t in [0,1]

const STAT = { cells: 0, edges: 1, buds: 3, maxDepth: 6, grown: 7, capped: 8, gates: 13, firings: 17, deaths: 18, regrowths: 19 };
const PARAM = { RATE: 6, THRESH: 7, LEAK: 8, STARVE: 9 };
const EV = { STRIDE: 5, FIRE: 0, BORN: 1, DIED: 2 };

/**
 * Interval-class consonance, 0 (worst) to 1 (best), indexed by semitone
 * distance mod 12. Unison and octave are perfect but say nothing, so they sit
 * below the fifth and the thirds rather than at the top — a piece that plays
 * one note in three octaves is not harmonious, it is monotonous, and a table
 * that ranks the octave highest would call it a triumph.
 */
const CONSONANCE = [
  0.55, // 0  unison — clean, but no information
  0.05, // 1  minor second
  0.25, // 2  major second
  0.85, // 3  minor third
  0.90, // 4  major third
  0.80, // 5  perfect fourth
  0.15, // 6  tritone
  1.00, // 7  perfect fifth
  0.85, // 8  minor sixth
  0.88, // 9  major sixth
  0.45, // 10 minor seventh
  0.10, // 11 major seventh
];

/** The sonifier's pluck pitch, as semitones above its root. */
export function pluckSemitone(depth, maxDepth) {
  const t = Math.min(1, Math.max(0, depth / Math.max(1, maxDepth)));
  const step = Math.round(t * 14);
  return 12 * (2 + Math.floor(step / SCALE.length)) + SCALE[step % SCALE.length];
}

// ---------------------------------------------------------------------------
// Running a piece
// ---------------------------------------------------------------------------

export async function loadEngine() {
  const { instance } = await WebAssembly.instantiate(readFileSync(join(ROOT, 'morph.wasm')), {});
  const w = instance.exports;
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const stats = () => new Float32Array(w.memory.buffer, w.stats_ptr(), 20);
  return {
    w,
    stats,
    err: () => dec.decode(new Uint8Array(w.memory.buffer, w.err_ptr(), w.err_len())),
    compile(src, seed = 1337) {
      const b = enc.encode(src);
      new Uint8Array(w.memory.buffer, w.src_ptr(), w.src_capacity()).set(b);
      return w.compile(b.length, seed) === 1;
    },
    growAll(limit = 8000) {
      for (let i = 0; i < limit; i++) {
        w.step(128, 0, 1);
        if (stats()[STAT.grown] === 1) return true;
      }
      return false;
    },
    events() {
      const n = w.drain_events();
      return new Float32Array(w.memory.buffer, w.event_ptr(), n * EV.STRIDE);
    },
  };
}

/**
 * Run one tick and return the notes the sonifier would *start*, in order.
 *
 * The stratified sample is copied from `Sonifier.update` rather than
 * approximated: taking the first six of a burst instead of six spread across it
 * scores a wide level as its leading edge, which is precisely the thing the
 * even spread exists to avoid.
 */
function heardThisTick(eng, grow) {
  eng.w.step(grow, 1, 1);
  const ev = eng.events();
  const maxDepth = Math.max(1, eng.stats()[STAT.maxDepth]);
  const fires = [];
  let births = 0;
  let deaths = 0;
  for (let i = 0; i * EV.STRIDE < ev.length; i++) {
    const kind = ev[i * EV.STRIDE];
    if (kind === EV.FIRE) fires.push(i);
    else if (kind === EV.DIED) deaths++;
    else births++;
  }
  const n = Math.min(fires.length, MAX_FIRES_PER_FRAME);
  const notes = [];
  for (let i = 0; i < n; i++) {
    const o = fires[Math.floor((i * fires.length) / n)] * EV.STRIDE;
    notes.push(pluckSemitone(ev[o + 2], maxDepth));
  }
  const st = eng.stats();
  return { notes, fired: fires.length, births, deaths, maxDepth, gates: st[STAT.gates] };
}

// ---------------------------------------------------------------------------
// The scores
// ---------------------------------------------------------------------------

const LAGS = [1, 8, 64, 512];

/** Jaccard similarity of two note sets. 1 = identical, 0 = disjoint. */
function jaccard(a, b) {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

/**
 * Score a run of ticks. `ticks` is the transcript from `heardThisTick`.
 *
 * The two headline numbers are deliberately built from different things:
 * variety from *when* notes repeat, harmony from *which* notes coincide. A
 * piece can score well on one and badly on the other, and knowing which is
 * which is the whole point of measuring rather than listening once.
 */
export function score(ticks) {
  // Compared over a window rather than a single tick, because a per-tick set
  // punishes sparseness and calls it repetition. A piece playing one note every
  // fourth tick has tiny sets that collide constantly and scores as a loop; the
  // same piece heard over half a second is obviously varied. Windowing puts a
  // sparse piece and a saturated one on the same footing, which matters here —
  // raising the threshold is the main way to stop a piece being a wall of
  // sound, and the metric must not punish exactly the fix.
  const WINDOW = 16;
  const sets = ticks.map((_, i) => {
    const s = new Set();
    for (let j = i; j < Math.min(ticks.length, i + WINDOW); j++) for (const p of ticks[j].notes) s.add(p);
    return s;
  });
  const n = sets.length;

  // ---- variety ----
  // Self-similarity at rising lags. Repetition at lag 1 is texture; the same
  // set 512 ticks later is a loop you have already heard.
  const sim = {};
  for (const lag of LAGS) {
    if (n <= lag) { sim[lag] = 1; continue; }
    let acc = 0;
    for (let i = 0; i + lag < n; i++) acc += jaccard(sets[i], sets[i + lag]);
    sim[lag] = acc / (n - lag);
  }

  // Entropy over the pitches actually heard, against the 15 reachable ones.
  const counts = new Map();
  let total = 0;
  for (const t of ticks) for (const p of t.notes) { counts.set(p, (counts.get(p) || 0) + 1); total++; }
  let H = 0;
  for (const c of counts.values()) { const p = c / total; H -= p * Math.log2(p); }
  const entropy = total ? H / Math.log2(PITCH_STEPS) : 0;

  // Distinct heard note-sets, and exact cycle detection. A finished DAG under a
  // periodic injector has a real, findable period; saying "period 12" is a far
  // better bug report than "sounds repetitive".
  const key = (s) => [...s].sort((a, b) => a - b).join(',');
  const distinctSets = new Set(sets.map(key)).size;
  // Period is detected on the *raw per-tick* sets, never the windowed ones. A
  // window longer than the cycle contains the whole cycle at every offset, so
  // the windowed key is constant and every short cycle reads as period 1 —
  // which is what this reported for a planted cycle of 6. Windowing is right
  // for similarity, where it stops sparseness being mistaken for repetition,
  // and wrong for exactness.
  const keys = ticks.map((t) => key(new Set(t.notes)));
  let period = Infinity;
  const tail = Math.floor(n / 2);
  // Once `p` grows past the comparison range the inner loop runs zero times, so
  // *every* large period "held" vacuously and the first such `p` won — this
  // reported 450 for a transcript of period 6. A minimum number of actual
  // comparisons is what stops a vacuous truth being reported as a discovery.
  for (let p = 1; p <= Math.min(600, tail); p++) {
    let ok = true;
    let compared = 0;
    for (let i = tail; i + p < n; i++) {
      compared++;
      if (keys[i] !== keys[i + p]) { ok = false; break; }
    }
    if (ok && compared >= Math.max(32, p)) { period = p; break; }
  }

  // Structural motion — the other way to get texture, and the only one that
  // changes the *pitches* rather than the order they arrive in, since maxDepth
  // rescales every note when the structure is pruned.
  const churn = ticks.reduce((a, t) => a + t.births + t.deaths, 0) / n;

  // "Morphing", literally: does the structure itself keep changing? This is the
  // metric the original complaint names, and it is the sharpest of the lot —
  // maxDepth is the divisor in the pitch map, so a structure whose depth drifts
  // is one where *every gate's note moves*, not merely one where the notes
  // arrive in a new order. Nothing else here can shift absolute pitch at all.
  const drift = stdev(ticks.map((t) => t.maxDepth));
  const massDrift = stdev(ticks.map((t) => t.gates));

  const variety = clamp01(
    0.45 * (1 - sim[512]) +
    0.20 * (1 - sim[64]) +
    0.25 * entropy +
    0.10 * Math.min(1, distinctSets / Math.min(n, 256)),
  );

  // ---- harmony ----
  // Notes still sounding, not merely struck: a pluck decays over roughly half a
  // second to two seconds, which at one tick per frame is tens of ticks. Chords
  // here are made of overlap, so scoring only simultaneous onsets would find
  // almost no intervals at all and call a sweeping arpeggio silent.
  const RING = 24;
  let pairs = 0;
  let cons = 0;
  let polyAcc = 0;
  const octaves = [];
  for (let i = 0; i < n; i++) {
    const sounding = [];
    for (let j = Math.max(0, i - RING); j <= i; j++) for (const p of ticks[j].notes) sounding.push(p);
    polyAcc += Math.min(sounding.length, 24);
    for (const p of ticks[i].notes) octaves.push(Math.floor(p / 12));
    for (let a = 0; a < sounding.length; a++) {
      for (let b = a + 1; b < sounding.length; b++) {
        cons += CONSONANCE[Math.abs(sounding[a] - sounding[b]) % 12];
        pairs++;
        if (pairs > 400000) break;
      }
      if (pairs > 400000) break;
    }
  }
  const consonance = pairs ? cons / pairs : 0;
  const polyphony = polyAcc / n;
  // A band, not a maximum: one voice is a melody nobody called harmony, and
  // twenty at once is a wash whatever the intervals are.
  const densityFit = bell(polyphony, 7, 6);
  const register = octaves.length ? clamp01(stdev(octaves) / 1.6) : 0;

  const harmony = clamp01(0.5 * consonance + 0.3 * densityFit + 0.2 * register);

  return {
    variety, harmony,
    sim, entropy, distinctSets, period, churn, drift, massDrift,
    consonance, polyphony, densityFit, register,
    notes: total, ticks: n,
  };
}

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const bell = (x, mid, width) => Math.exp(-((x - mid) ** 2) / (2 * (width / 2) ** 2));
function stdev(xs) {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
}

/** Grow a program at some settings and score what it does next. */
export async function measure(eng, src, settings = {}, ticks = 2000) {
  const s = { waves: 1.4, threshold: 0.5, leak: 0.3, starve: 0, grow: 2, ...settings };
  if (!eng.compile(src)) return { error: eng.err() };
  const grown = eng.growAll();
  eng.w.set_param(PARAM.THRESH, s.threshold);
  eng.w.set_param(PARAM.LEAK, s.leak);
  eng.w.set_param(PARAM.STARVE, s.starve);
  // A piece that runs with the driver off still needs one kick to start.
  eng.w.set_param(PARAM.RATE, s.waves === 0 ? 40 : s.waves);
  eng.w.step(0, 0, 1);
  if (s.waves === 0) eng.w.set_param(PARAM.RATE, 0);
  eng.events();
  // Settle first: the opening is all bells and is not what "texture" refers to.
  for (let i = 0; i < 300; i++) heardThisTick(eng, s.grow);
  const transcript = [];
  for (let i = 0; i < ticks; i++) transcript.push(heardThisTick(eng, s.grow));
  const st = eng.stats();
  return { ...score(transcript), grown, gates: st[STAT.gates], depth: st[STAT.maxDepth] };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

if (import.meta.url === `file://${process.argv[1]}`) {
  const { PRESETS } = await import(join(ROOT, 'presets.js'));
  const { PIECES } = await import(join(ROOT, 'showcase', 'pieces.js'));
  const only = process.argv.slice(2).find((a) => !a.startsWith('-'));
  const eng = await loadEngine();

  const subjects = [
    ...PRESETS.map((p) => ({ kind: 'preset', name: p.name, src: p.src, settings: {} })),
    ...PIECES.map((p) => ({ kind: 'piece', name: p.name, src: p.src, settings: p.settings })),
  ].filter((s) => !only || s.name === only);

  const fmt = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '∞');
  console.log('\n                      variety harmony │ sim@512  ent  sets  period  churn  drift  mass │ cons  poly  reg');
  const rows = [];
  for (const s of subjects) {
    const r = await measure(eng, s.src, s.settings);
    if (r.error) { console.log(`${s.name.padEnd(14)} ERROR ${r.error}`); continue; }
    rows.push({ ...r, name: s.name, kind: s.kind });
    console.log(
      `${(s.kind === 'piece' ? '▸ ' : '  ') + s.name.padEnd(18)}` +
      `${fmt(r.variety).padStart(6)} ${fmt(r.harmony).padStart(7)} │ ` +
      `${fmt(r.sim[512]).padStart(7)} ` +
      `${fmt(r.entropy).padStart(4)} ${String(r.distinctSets).padStart(5)} ${fmt(r.period, 0).padStart(7)} ` +
      `${fmt(r.churn).padStart(6)} ${fmt(r.drift, 1).padStart(6)} ${fmt(r.massDrift, 0).padStart(5)} │ ` +
      `${fmt(r.consonance).padStart(4)} ${fmt(r.polyphony, 1).padStart(5)} ${fmt(r.register).padStart(4)}`,
    );
  }

  if (process.argv.includes('--sweep')) {
    // Settings are not decoration. A piece that is periodic at one threshold
    // can be aperiodic at another, because the threshold decides whether cells
    // starve and starvation is one of the only two things here that break a
    // cycle. So the sweep is over the axes that change *kind*, not level.
    console.log('\nsweep — waves × threshold × starvation');
    for (const s of subjects) {
      const best = [];
      for (const waves of [0, 0.6, 1.4, 4]) {
        for (const threshold of [0.5, 0.9, 1.15]) {
          for (const starve of [0, 1.5, 3]) {
            const r = await measure(eng, s.src, { ...s.settings, waves, threshold, starve }, 1200);
            if (r.error) continue;
            best.push({ waves, threshold, starve, ...r });
          }
        }
      }
      best.sort((a, b) => b.variety + b.harmony - (a.variety + a.harmony));
      const top = best[0];
      const aper = best.filter((b) => !Number.isFinite(b.period)).length;
      console.log(
        `  ${s.name.padEnd(18)} best waves ${top.waves} thresh ${top.threshold} starve ${top.starve}` +
        ` → variety ${fmt(top.variety)} harmony ${fmt(top.harmony)} period ${fmt(top.period, 0)}` +
        `  (${aper}/${best.length} settings aperiodic)`,
      );
    }
  }

  rows.sort((a, b) => b.variety + b.harmony - (a.variety + a.harmony));
  console.log('\nbest combined:');
  for (const r of rows.slice(0, 5)) {
    console.log(`  ${r.name.padEnd(14)} variety ${fmt(r.variety)}  harmony ${fmt(r.harmony)}  period ${fmt(r.period, 0)}`);
  }
  const dead = rows.filter((r) => Number.isFinite(r.period));
  if (dead.length) {
    console.log(`\nexactly periodic — heard in full after one cycle:\n  ${dead.map((r) => `${r.name} (${r.period})`).join(', ')}`);
  }
}
