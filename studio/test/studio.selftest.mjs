#!/usr/bin/env node
// studio.selftest.mjs — what can be checked about a piece without eyes or ears.
//
//   node studio/test/studio.selftest.mjs
//
// 1. The borrowed piano is clef's, byte for byte.
// 2. The score is a well-formed performance: sorted, in range, few enough notes.
// 3. The cues the plant grows by happen in the order a plant grows.
// 4. The whole piece renders through the piano: finite, not silent, not
//    clipping, loudest at the bloom — and fast enough to stream.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { instantiate, begin } from '../lib/pfsynth-core.js';
import { events, cues, duration } from '../anthesis/score.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
let failed = 0;
const ok = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) failed++; };

// 1 ---------------------------------------------------------------------------
const ours = await readFile(join(root, 'vendor/pfsynth/pfsynth.wasm'));
const clefs = await readFile(join(root, '..', 'clef/vendor/pfsynth/pfsynth.wasm'));
ok(Buffer.compare(ours, clefs) === 0, `pfsynth.wasm is byte-identical to clef's (${ours.length} bytes)`);

// 2 ---------------------------------------------------------------------------
ok(events.length > 100 && events.length < 32768, `${events.length} notes, under the model's 32768`);
ok(events.every((e, i) => i === 0 || e.at >= events[i - 1].at), 'events are sorted by onset');
ok(events.every((e) => e.midi >= 21 && e.midi <= 108), 'every note is on a piano keyboard');
ok(events.every((e) => e.velocity > 0 && e.velocity <= 1 && e.dur > 0), 'velocities in (0, 1], durations positive');
ok(events.every((e) => Number.isFinite(e.at) && Number.isFinite(e.dur)), 'all times finite');

// 3 ---------------------------------------------------------------------------
const order = [
  ['first drop', cues.drops[0].at], ['crack', cues.crack], ['root', cues.root],
  ['hypocotyl', cues.hypocotyl], ['emerge', cues.emerge], ['cotyledons', cues.cotyledons],
  ['coat falls', cues.coatFalls], ['leaf 1', cues.leaves[0]], ['leaf 6', cues.leaves[5]],
  ['bud', cues.bud], ['lift', cues.lift], ['bloom', cues.bloom],
  ['petal 1', cues.petals[0]], ['petal 8', cues.petals[7]], ['pollen', cues.pollen[0]],
  ['last chord', cues.last], ['end', cues.end],
];
ok(order.every(([, t], i) => i === 0 || t > order[i - 1][1]), `the plant grows in order: ${order.map(([n]) => n).join(' → ')}`);
ok(cues.leaves.length === 6, 'six true leaves, one per bar of the melody');
ok(cues.petals.length === 8 && cues.petals.every((t, i) => i === 0 || t > cues.petals[i - 1]), 'eight cascade notes, rising in time: one per stage of opening');
ok(Math.abs(duration - cues.end) < 1e-9 && duration > 60 && duration < 150, `duration ${duration.toFixed(1)} s`);

// 4 ---------------------------------------------------------------------------
const SR = 22050;   // half rate keeps the test quick; the model is rate-agnostic
const X = await instantiate(ours);
const t0 = performance.now();
const r = begin(X, events, SR);
const parts = [];
let c;
while ((c = r.pull())) parts.push(c);
const wall = (performance.now() - t0) / 1000;
const pcm = new Float32Array(parts.reduce((s, p) => s + p.length, 0));
let at = 0;
for (const p of parts) { pcm.set(p, at); at += p.length; }
const secs = pcm.length / 2 / SR;
let finite = true, peak = 0, hot = 0;
for (const v of pcm) {
  if (!Number.isFinite(v)) finite = false;
  const a = Math.abs(v);
  if (a > peak) peak = a;
  if (a > 0.97) hot++;
}
const rms = (a, b) => {
  let s = 0, n = 0;
  for (let i = Math.floor(a * SR) * 2; i < Math.min(pcm.length, Math.floor(b * SR) * 2); i++) { s += pcm[i] * pcm[i]; n++; }
  return Math.sqrt(s / Math.max(1, n));
};
ok(finite, 'rendered audio is finite');
ok(secs >= duration - 5, `rendered ${secs.toFixed(1)} s, covering the score's ${duration.toFixed(1)} s`);
ok(rms(0, cues.root) > 1e-3, 'the opening is not silent');
ok(hot / pcm.length < 0.001, `under 0.1% of samples in the tanh knee (${(100 * hot / pcm.length).toFixed(4)}%, peak ${peak.toFixed(3)})`);
const bloom = rms(cues.bloom, cues.pollen[0]);
ok(bloom > rms(cues.cotyledons, cues.bud) && bloom > rms(cues.bud, cues.bloom) * 0.95 && bloom > rms(cues.pollen[0], cues.end),
  'the bloom is the loudest section (or level with the bud that leads into it)');
ok(secs / wall > 1.5, `renders at ${(secs / wall).toFixed(1)}x real time at ${SR} Hz (streams if > 1)`);

// 5 — Coquelicots ----------------------------------------------------------------
console.log('\nCoquelicots');
const Q = await import('../coquelicots/score.js');
const { layout, buildWorld } = await import('../coquelicots/world.js');
const { Wash, Bristle, Ink, Dab } = await import('../lib/paint.js');
const qe = Q.events, qc = Q.cues;
ok(qe.length > 200 && qe.length < 32768 && qe.every((e, i) => i === 0 || e.at >= qe[i - 1].at), `${qe.length} notes, sorted`);
ok(qe.every((e) => e.midi >= 21 && e.midi <= 108 && e.velocity > 0 && e.velocity <= 1 && Number.isFinite(e.at + e.dur)), 'every note on the keyboard, finite, velocity in (0, 1]');
const stages = [
  ['ink', qc.ink], ['first drop', qc.drops[0]], ['root', qc.root], ['soil', qc.soil[0]], ['hypocotyl', qc.hypocotyl],
  ['emerge', qc.emerge], ['cotyledons', qc.cotyledons], ['field', qc.field[0]], ['leaf 1', qc.leaves[0]], ['sky', qc.sky[0]],
  ['trees', qc.trees[0]], ['bud', qc.bud], ['poppies', qc.poppies[0]], ['lift', qc.lift], ['bloom', qc.bloom],
  ['petal 8', qc.petals[7]], ['arrive', qc.arrive], ['birds', qc.birds[0]], ['last chord', qc.last], ['end', qc.end],
];
ok(stages.every(([, t], i) => i === 0 || t > stages[i - 1][1]), `the world is painted in order: ${stages.map(([nm]) => nm).join(' → ')}`);
ok(qc.leaves.length === 6 && qc.petals.length === 8 && qc.bursts.length >= 8, 'six leaves, eight cascade notes, a wave of red per bloom melody note');

// The music fills out as the world does: each stage louder than the one before, up to the bloom.
const q = begin(X, qe, SR);
const qp = [];
let qq;
while ((qq = q.pull())) qp.push(qq);
const qpcm = new Float32Array(qp.reduce((s, p) => s + p.length, 0));
at = 0;
for (const p of qp) { qpcm.set(p, at); at += p.length; }
const qrms = (a, b) => {
  let s = 0, n = 0;
  for (let i = Math.floor(a * SR) * 2; i < Math.min(qpcm.length, Math.floor(b * SR) * 2); i++) { s += qpcm[i] * qpcm[i]; n++; }
  return 20 * Math.log10(Math.sqrt(s / Math.max(1, n)) + 1e-12);
};
const levels = [
  ['seed', 0, qc.soil[0]], ['soil', qc.soil[0], qc.emerge], ['ground', qc.emerge, qc.field[0]],
  ['field', qc.field[0], qc.sky[0] + 10], ['sky', qc.sky[0] + 10, qc.lift - 4], ['bloom', qc.bloom, qc.arrive + 3],
].map(([nm, a, b]) => [nm, qrms(a, b)]);
ok(levels.every(([, v], i) => i === 0 || v > levels[i - 1][1]),
  `the texture fills out: ${levels.map(([nm, v]) => `${nm} ${v.toFixed(1)}`).join(' < ')} dB`);
let qfinite = true, qhot = 0;
for (const v of qpcm) { if (!Number.isFinite(v)) qfinite = false; if (Math.abs(v) > 0.97) qhot++; }
ok(qfinite && qhot / qpcm.length < 0.001, `finite, ${(100 * qhot / qpcm.length).toFixed(4)}% of samples in the tanh knee`);

// The world: every mark has a time inside the piece, and building it twice gives the same painting.
const Lw = layout(1280, 800);
const w1 = buildWorld(Lw, qc), w2 = buildWorld(Lw, qc);
ok(w1.length > 1000 && w1.every((mk) => Number.isFinite(mk.t0) && mk.t1 >= mk.t0 && mk.t0 >= 0 && mk.t0 < qc.end + 5), `${w1.length} marks, each timed inside the piece`);
ok(w1.every((mk, i) => mk.t0 === w2[i].t0 && mk.constructor === w2[i].constructor), 'building the world twice gives the same marks at the same times');
ok(w1.filter((mk) => mk.t0 < qc.ink).length === 0, 'nothing is painted before the first ink dot');

// A mark drawn in slices must be the SAME mark as one drawn at once, or scrubbing
// and replay would paint a different picture. Record the canvas calls both ways.
const recorder = () => {
  const log = [];
  const r6 = (v) => (typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v);
  return {
    log,
    ctx: new Proxy({}, {
      get: (_, k) => (...args) => log.push([k, ...args.map(r6)]),
      set: (_, k, v) => { log.push(['=' + String(k), r6(v)]); return true; },
    }),
  };
};
const samples = [
  new Wash({ poly: [[0, 0, 1], [40, 0, 1], [40, 30, 1], [0, 30, 1]], color: [100, 120, 140], t0: 0, id: 11 }),
  new Wash({ polyAt: (f) => [[-f * 50, -5, 1], [f * 50, -5, 1], [f * 50, 5, 1], [-f * 50, 5, 1]], color: [1, 2, 3], t0: 0, id: 12 }),
  new Bristle({ pts: Array.from({ length: 12 }, (_, i) => [i * 5, Math.sin(i), 1]), width: 8, color: [200, 50, 40], t0: 0, id: 13 }),
  new Ink({ pts: Array.from({ length: 9 }, (_, i) => [i * 4, i, 1]), t0: 0, id: 14 }),
];
const sliced = samples.every((mk, si) => {
  const a = recorder(), b = recorder();
  mk.draw(a.ctx, 0, 1);
  for (const [f0, f1] of [[0, 0.13], [0.13, 0.5], [0.5, 0.77], [0.77, 1]]) mk.draw(b.ctx, f0, f1);
  // strip state-setting calls: slices re-set style, which is harmless; the geometry must match
  const geo = (l) => JSON.stringify(l.filter((c) => !String(c[0]).startsWith('=')));
  const same = geo(a.log) === geo(b.log) && a.log.length > 0;
  if (!same) console.log(`  slice mismatch in sample ${si} (${mk.constructor.name})`);
  return same;
});
ok(sliced, 'wash, widening wash, bristle and ink draw the same geometry in slices as at once');

// 5b — Nocturne ---------------------------------------------------------------------
console.log('\nNocturne');
const N = await import('../nocturne/score.js');
const { buildCity, GROUND, colX } = await import('../nocturne/city.js');
ok(N.events.length > 200 && N.events.every((e, i) => i === 0 || e.at >= N.events[i - 1].at), `${N.events.length} notes, sorted`);
ok(N.events.every((e) => e.midi >= 21 && e.midi <= 108 && e.velocity > 0 && e.velocity <= 1), 'every note on the keyboard, velocity in (0, 1]');
const ncity = buildCity();
ok(ncity.buildings.length === N.BARS, `one building per bar (${ncity.buildings.length})`);
// Every note is a window in its own building, at its beat and floor; the notes
// under the city are lamps. None is lost, none lands outside a wall.
const above = N.written.filter((w) => w.midi >= GROUND), below = N.written.filter((w) => w.midi < GROUND);
const winKeys = new Set(ncity.buildings.flatMap((b) => b.windows.map((w) => `${b.bar}:${w.col}:${w.floor}`)));
const noteKeys = new Set(above.map((w) => { const on = w.written ?? w.beat; const bar = Math.floor(on / 4) + 1; return `${bar}:${Math.min(7, Math.floor((on - (bar - 1) * 4) * 2 + 1e-6))}:${w.midi - GROUND}`; }));
ok([...noteKeys].every((k) => winKeys.has(k)) && winKeys.size === noteKeys.size, `every note above E2 is a window (${winKeys.size} windows)`);
ok(ncity.buildings.every((b) => b.windows.every((w) => w.col >= 0 && w.col < 8 && w.floor >= 0 && w.floor < b.floors && colX(b, w.col) > b.x0 && colX(b, w.col) < b.x1)), 'every lit window is inside its building, below its roof');
ok(ncity.lamps.length === below.length && below.length > 0, `every note below the city is a lamp on the quay (${below.length})`);
ok(ncity.buildings.every((b) => b.drawTo <= N.sec(b.start) + 1.9 && b.windows.every((w) => w.at >= b.drawFrom)), 'the pen finishes each building by its downbeat, and no window lights before its building is begun');
ok(N.cues.melody < N.cues.summit && N.cues.summit < N.cues.ret && N.cues.ret < N.cues.coda && N.cues.coda < N.cues.last && N.cues.last < N.cues.end, 'the cues run in order');
// Bar 22 is where the melody peaks, so it is the tallest tower of the piece
// proper; the one note higher is the last star, alone atop the last building.
const body = ncity.buildings.slice(0, 36);
ok(Math.max(...body.map((b) => b.floors)) === ncity.buildings[21].floors && ncity.buildings[37].windows.length === 1,
  'bar 22, where the melody peaks, is the tallest tower; bar 38 holds only the last star');
{
  const q = begin(X, N.events, SR);
  const qp = [];
  let c2;
  while ((c2 = q.pull())) qp.push(c2);
  const pcm2 = new Float32Array(qp.reduce((a2, p) => a2 + p.length, 0));
  let o = 0;
  for (const p of qp) { pcm2.set(p, o); o += p.length; }
  const lv = (a2, b2) => { let s2 = 0, k = 0; for (let i = Math.floor(a2 * SR) * 2; i < Math.min(pcm2.length, Math.floor(b2 * SR) * 2); i++) { s2 += pcm2[i] * pcm2[i]; k++; } return 10 * Math.log10(s2 / Math.max(1, k) + 1e-12); };
  const secs2 = N.notation.sections.map(([bar, nm]) => [nm, N.sec((bar - 1) * 4)]);
  const levels2 = secs2.map(([nm, a2], k) => [nm, lv(a2, secs2[k + 1]?.[1] ?? N.cues.end)]);
  const loud = levels2.reduce((a2, b2) => (b2[1] > a2[1] ? b2 : a2));
  let finite2 = true; for (const v of pcm2) if (!Number.isFinite(v)) { finite2 = false; break; }
  ok(finite2 && loud[0] === 'the city at full height', `the B-flat minor climb is the loudest section: ${levels2.map(([nm, v]) => `${nm} ${v.toFixed(1)}`).join(', ')}`);
}

// 6 — the scores clef opens -----------------------------------------------------
console.log('\nScores (View the score -> clef)');
const { parseLily } = await import('../../clef/src/lily.js');
const { midiOf, PPQ } = await import('../../clef/src/model.js');
const { PIECES, generate } = await import('../tools/lily.mjs');
const { readFile: rf } = await import('node:fs/promises');
for (const { slug, subtitle } of PIECES) {
  const committed = await rf(join(root, slug, 'score.ly'), 'utf8');
  ok(committed === await generate(slug, subtitle), `${slug}/score.ly is current (node studio/tools/lily.mjs)`);
  const parsed = parseLily(committed);
  ok(parsed.diagnostics.length === 0, `${slug}: clef reads it with no diagnostics${parsed.diagnostics.length ? ': ' + parsed.diagnostics.map((d) => d.message).slice(0, 3).join('; ') : ''}`);
  // Every written note comes back from clef at its beat and pitch, and clef
  // strikes nothing that was not written (tied continuations are not strikes).
  const S = await import(join(root, slug, 'score.js'));
  const want = new Set(S.written.map((n) => `${Math.round((n.written ?? n.beat) * 8) / 8}:${n.midi}`));
  const got = new Set();
  for (const st of parsed.staves) for (const v of st.voices) {
    const held = new Map();                    // midi -> tick its tie lands on
    for (const e of v) {
      if (e.kind !== 'note' && e.kind !== 'chord') continue;
      for (const p of e.pitches) {
        const mm = midiOf(p);
        const cont = held.get(mm) === e.tick;
        held.delete(mm);
        if (!cont) got.add(`${e.tick / PPQ}:${mm}`);
        if (e.tie || p.tie) held.set(mm, e.tick + e.ticks);
      }
    }
  }
  const missing = [...want].filter((k) => !got.has(k)), extra = [...got].filter((k) => !want.has(k));
  ok(!missing.length && !extra.length, `${slug}: all ${want.size} written notes round-trip through clef's parser`
    + (missing.length ? ` — missing ${missing.slice(0, 5).join(', ')}` : '') + (extra.length ? ` — extra ${extra.slice(0, 5).join(', ')}` : ''));
  ok(parsed.title === S.title && parsed.staves.length === 2, `${slug}: titled, on a piano grand staff`);
}

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
