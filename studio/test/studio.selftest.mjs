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

// FOUR SHARDS, IN PARALLEL. Run plainly, this file runs itself four times at once (STUDIO_SHARD=0..3),
// each child taking a quarter of the sections, balanced by how long they take (full-length renders of
// whole pieces are most of it), and prints their output in order: the suite took ~5 minutes in a
// row; it takes about as long as its slowest shard. STUDIO_SHARD=n runs just that shard.
const SHARD = process.env.STUDIO_SHARD === undefined ? -1 : Number(process.env.STUDIO_SHARD), SHARDS = 4;
if (SHARD < 0) {
  const { spawn } = await import('node:child_process');
  const t0 = Date.now();
  const runs = Array.from({ length: SHARDS }, (_, k) => new Promise((done) => {
    const c = spawn(process.execPath, [fileURLToPath(import.meta.url)], { env: { ...process.env, STUDIO_SHARD: String(k) }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = ''; c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { out += d; });
    c.on('close', (code) => done({ k, code, out, s: (Date.now() - t0) / 1000 }));
  }));
  const res = await Promise.all(runs);
  let bad = 0;
  for (const r of res) { process.stdout.write(r.out.replace(/\n*(all passed|\d+ failed)\n*$/, '\n')); if (r.code !== 0) { bad++; console.log(`✗ shard ${r.k} exited ${r.code}`); } }
  console.log(`\n(${SHARDS} shards in parallel, ${((Date.now() - t0) / 1000).toFixed(0)} s: ${res.map((r) => `${r.s.toFixed(0)} s`).join(', ')})`);
  console.log(bad ? `\n${bad} shard(s) failed` : '\nall passed');
  process.exit(bad ? 1 : 0);
}

if (SHARD === 0) {   // sections 1–6: the piano pieces and their scores
// 1 ---------------------------------------------------------------------------
const ours = await readFile(join(root, 'vendor/pfsynth/pfsynth.wasm'));
const clefs = await readFile(join(root, '..', 'clef/vendor/pfsynth/pfsynth.wasm'));
ok(Buffer.compare(ours, clefs) === 0, `pfsynth.wasm is byte-identical to clef's (${ours.length} bytes)`);
// the mannequin (figure/) draws packages/figure: its copy must be the package, byte for byte
{
  const { readdirSync } = await import('node:fs');
  const lib = join(root, 'vendor/figure/lib');
  const files = readdirSync(lib);
  const same = await Promise.all(files.map(async (f) => Buffer.compare(await readFile(join(lib, f)), await readFile(join(root, '..', 'packages/figure/lib', f))) === 0));
  ok(files.length >= 9 && same.every(Boolean), `vendor/figure is byte-identical to packages/figure/lib (${files.length} files)`);
}

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

// 5c — Speakeasy ---------------------------------------------------------------------
console.log('\nSpeakeasy');
{
  const S = await import('../speakeasy/score.js');
  const { renderBand, mix, INSTRUMENTS } = await import('../lib/band.js');
  const se = S.events, sc = S.cues;
  ok(se.every((e, i) => i === 0 || e.at >= se[i - 1].at) && se.every((e) => Number.isFinite(e.at + e.dur) && e.dur > 0), `${se.length} events, sorted, finite`);
  ok(S.pianoEvents.every((e) => e.midi >= 21 && e.midi <= 108 && e.velocity > 0 && e.velocity <= 1), `${S.pianoEvents.length} piano notes, all on the keyboard`);
  ok(S.bandEvents.every((e) => INSTRUMENTS.includes(e.inst)), `every band event has an instrument (${new Set(S.bandEvents.map((e) => e.inst)).size} of them)`);
  const story = [['curtain up', sc.curtainUp[1]], ['dame', sc.dame[0]], ['card', sc.card], ['lobby', sc.lobby], ['manager', sc.manager], ['lift', sc.lift[0]],
    ['descent', sc.descent[0]], ['club', sc.club], ['solo', sc.solo], ['shout', sc.shout], ['break', sc.brk], ['knows', sc.knows], ['shot', sc.shot], ['raid', sc.raid[0]], ['fin', sc.fin], ['end', sc.end]];
  ok(story.every(([, t], i) => i === 0 || t > story[i - 1][1]), `the story runs in order: ${story.map(([n]) => n).join(' → ')}`);
  const shots = se.filter((e) => e.inst === 'shot');
  ok(shots.length === 1 && Math.abs(shots[0].at - sc.shot) < 0.02, 'one shot, fired on its cue');
  const chars = S.LINES_TYPED.reduce((n, l) => n + [...l.text].filter((c) => c !== ' ').length, 0);
  ok(se.filter((e) => e.inst === 'type').length === chars && se.filter((e) => e.inst === 'carriage').length === S.LINES_TYPED.length,
    `the typewriter strikes every letter it prints (${chars} keys, ${S.LINES_TYPED.length} carriage bells)`);
  ok(Math.abs(S.duration - sc.end) < 1e-9 && S.duration > 120 && S.duration < 200, `duration ${S.duration.toFixed(1)} s`);

  // the whole band at half rate, mixed with the piano
  const tb = performance.now();
  const band = renderBand(S.bandEvents, SR, { seconds: S.duration, wet: S.wet, slap: S.slap });
  const bandWall = (performance.now() - tb) / 1000;
  const sp = begin(X, S.pianoEvents, SR);
  const n = band.L.length, L = new Float32Array(n), R = new Float32Array(n);
  let f = 0, c;
  while ((c = sp.pull()) && f < n) { for (let i = 0; i < c.length / 2 && f + i < n; i++) { L[f + i] = c[2 * i]; R[f + i] = c[2 * i + 1]; } f += c.length / 2; }
  mix(L, R, band);
  let sfinite = true, speak = 0;
  for (let i = 0; i < n; i++) { if (!Number.isFinite(L[i] + R[i])) sfinite = false; speak = Math.max(speak, Math.abs(L[i]), Math.abs(R[i])); }
  ok(sfinite && speak < 1, `band + piano finite, peak ${speak.toFixed(3)}; the band renders in ${bandWall.toFixed(1)} s`);
  const db = (a, b) => { let q = 0; const i0 = Math.floor(a * SR), i1 = Math.min(n, Math.floor(b * SR)); for (let i = i0; i < i1; i++) q += L[i] * L[i] + R[i] * R[i]; return 10 * Math.log10(q / (2 * (i1 - i0)) + 1e-12); };
  const club = db(sc.club, sc.knows), street = db(sc.street, sc.lobby), lobby = db(sc.lobby, sc.descent[0]);
  const hush = db(sc.shot + 0.6, sc.raid[0]), raid = db(sc.raid[0], sc.raid[1]);
  ok(lobby < street && street < club && club < raid, `the noise builds: lobby ${lobby.toFixed(1)} < street ${street.toFixed(1)} < club ${club.toFixed(1)} < raid ${raid.toFixed(1)} dB`);
  ok(hush < club - 8, `after the shot, the room goes quiet (${hush.toFixed(1)} dB)`);
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

}

// 7 — the P(doom) video: its compiled dance is current, and its checks hold -------
if (SHARD === 1) {
  console.log('\nThe P(doom) video (a dance, compiled per body)');
  const { execFileSync } = await import('node:child_process');
  let stale = false;
  try { execFileSync(process.execPath, [join(root, 'tools', 'build-pdoom.mjs'), '--check'], { stdio: 'pipe' }); } catch { stale = true; }
  ok(!stale, 'pdoom/dance.json is current (node studio/tools/build-pdoom.mjs)');
  const rep = JSON.parse(await readFile(join(root, 'pdoom', 'report.json'), 'utf8'));
  const bad = rep.dancers.flatMap((d) => d.checks.filter((c) => !c.ok).map((c) => `${d.name}: ${c.name} ${c.detail}`));
  ok(!bad.length, `every dancer holds up through the whole song (report.json)${bad.length ? ': ' + bad.slice(0, 3).join('; ') : ''}`);
}

// 8 — The Bommie: a sitcom on a coral head. What can be checked without eyes or ears ----
if (SHARD === 1) {
  console.log('\nThe Bommie (a reef sitcom)');
  const W = await import('../bommie/world.js');
  const Snd = await import('../bommie/sound.js');
  const Sc = await import('../bommie/script.js');
  const D = Sc.DURATION;
  // nobody swims into the building: each fish's centre is at least half its height off the coral
  const worst = {};
  for (const n of Object.keys(W.SPECIES)) {
    let m = 1e9;
    for (let t = 0; t < D; t += 0.1) { const f = W.fishAt(n, t); m = Math.min(m, W.bommieSDF(f.pos) - f.h * 0.5); }
    worst[n] = m;
  }
  ok(Object.values(worst).every((m) => m > 0.05), `every fish clears the coral (closest: ${Object.entries(worst).map(([n, m]) => `${n} ${m.toFixed(2)}`).join(', ')})`);
  // Gus's feet: a planted foot does not slide, and it is on the sand
  let slide = 0, lift = 0;
  for (let t = 0; t < D - 0.02; t += 1 / 60) {
    const a = W.gusAt(t), b = W.gusAt(t + 1 / 60);
    a.legs.forEach((l, i) => { if (l.stance && b.legs[i].stance) { slide = Math.max(slide, Math.hypot(l.foot[0] - b.legs[i].foot[0], l.foot[2] - b.legs[i].foot[2])); lift = Math.max(lift, Math.abs(l.foot[1])); } });
  }
  ok(slide < 1e-6 && lift < 1e-6, `Gus's planted feet never slide or leave the sand (slide ${slide.toExponential(1)}, lift ${lift.toExponential(1)})`);
  // the script: lines don't talk over each other, and every line gets said inside the episode
  const say = Sc.sayings();
  const overlaps = say.filter((L, i) => i && L.at < say[i - 1].end);
  ok(!overlaps.length && say.every((L) => L.end < D), `${say.length} lines, none over another, all inside the episode`);
  // the soundtrack: deterministic, finite, not clipping; the audience louder than the reef at rest, dialogue audible over it
  const t0 = Date.now();
  const A = Snd.renderEpisode(16000), B = Snd.renderEpisode(16000);
  const ms = Date.now() - t0;
  let same = A.L.length === B.L.length, peak = 0, finite = true;
  for (let i = 0; i < A.L.length; i += 7) { if (A.L[i] !== B.L[i] || A.R[i] !== B.R[i]) same = false; if (!Number.isFinite(A.L[i])) finite = false; peak = Math.max(peak, Math.abs(A.L[i]), Math.abs(A.R[i])); }
  ok(same && finite && peak < 0.95, `the soundtrack renders the same every time, finite, under the ceiling (peak ${peak.toFixed(2)}, two renders ${ms} ms at 16 kHz)`);
  const bed = Snd.rmsDb(A, 5.5, 6.5), laugh = Snd.rmsDb(A, 42.5, 44), talk = Snd.rmsDb(A, 15, 18);
  ok(laugh > bed + 10 && talk > bed + 10, `the laughs (${laugh.toFixed(1)} dB) and the dialogue (${talk.toFixed(1)} dB) stand over the reef at rest (${bed.toFixed(1)} dB)`);
}

// 9 — the voice lab: the chip voice renders, deterministically, and knows every word it's tested on
if (SHARD === 1) {
  console.log('\nA Voice of Arithmetic (formant speech)');
  const V = await import('../lib/chipvoice.js');
  const T = await import('../voice/texts.js');
  const lex = JSON.parse(await readFile(join(root, 'voice', 'lexicon.json'), 'utf8')).words;
  const missing = [...new Set(V.words([T.PARAGRAPH, ...T.HARVARD].join(' ')))].filter((w) => !lex[w]);
  ok(!missing.length, `the lexicon has every word the voice is tested on${missing.length ? ': missing ' + missing.join(', ') : ''} (node studio/tools/voice-lexicon.mjs <cmudict>)`);
  const t0 = Date.now(), a = V.speak(T.PARAGRAPH, lex).audio, b = V.speak(T.PARAGRAPH, lex).audio, ms = (Date.now() - t0) / 2;
  let same = a.length === b.length, finite = true, peak = 0;
  for (let i = 0; i < a.length; i++) { if (a[i] !== b[i]) same = false; if (!Number.isFinite(a[i])) finite = false; peak = Math.max(peak, Math.abs(a[i])); }
  ok(same && finite && peak > 0.5 && peak <= 0.91, `the paragraph renders the same every time, finite, normalised (${(a.length / 16000).toFixed(1)} s of speech in ${ms.toFixed(0)} ms)`);
  const rep = JSON.parse(await readFile(join(root, 'voice', 'report.json'), 'utf8'));
  ok(rep.sentences.length === T.PARAGRAPH_SENTENCES.length + T.HARVARD.length, `report.json scores every test sentence (Harvard WER ${rep.harvard.wer}%, ${rep.date}; rescore: studio/tools/voice.mjs --report)`);
}

// 10 — Descending: the voice on the beat, the feet on the stairs ------------------------------------
if (SHARD === 1) {
  console.log('\nDescending (Daisy Bell, sung by arithmetic)');
  const S = await import('../descending/score.js');
  const F = await import('../descending/figure.js');
  const { sing } = await import('../lib/chipsing.js');
  const { LEXICON } = await import('../descending/lexicon.js');
  const words = [...new Set(S.song.lines.flatMap((l) => l.lyric.toLowerCase().replace(/-/g, '').match(/[a-z']+/g)))];
  const missing = words.filter((w) => !LEXICON[w]);
  ok(!missing.length, `lexicon.js has every word sung${missing.length ? ': missing ' + missing.join(', ') : ''} (node studio/tools/descending-lexicon.mjs)`);
  const t0 = Date.now(), r = sing(S.song, LEXICON, { rate: 8000, embody: S.embody });
  const off = r.notes.filter((n) => n.midi !== null).map((n) => Math.abs(n.sungAt - n.t) * 1000);
  ok(Math.max(...off) <= 6, `every sung vowel starts on its beat: worst ${Math.max(...off).toFixed(1)} ms of ${off.length} notes (${((Date.now() - t0) / 1000).toFixed(1)} s to sing)`);
  ok(S.embody(S.cues.chorus1) === 0 && S.embody(S.cues.coda) === 1, 'the voice starts a chip (embody 0 at chorus 1) and is whole by the coda');
  const surf = (x) => (x < F.RUN ? 0 : -Math.min(F.STEPS, Math.floor(x / F.RUN)) * F.RISE);
  let clear = 9, reach = 0, slide = 0, prev = null;
  for (let t = 0; t < S.duration; t += 1 / 30) {
    const P = F.pose(t);
    for (const q of [P.ankleL, P.toeL, P.heelL, P.ankleR, P.toeR, P.heelR]) clear = Math.min(clear, q[1] - surf(q[0]));
    for (const [h, a] of [[P.hipL, P.ankleL], [P.hipR, P.ankleR]]) if (Math.hypot(h[0] - a[0], h[1] - a[1], h[2] - a[2]) > F.THIGH + F.SHIN - 1e-3) reach++;
    if (prev) [[0, P.ankleL, prev.ankleL], [1, P.ankleR, prev.ankleR]].forEach(([i, a, b]) => { if (P.planted[i] && prev.planted[i]) slide = Math.max(slide, Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])); });
    prev = P;
  }
  ok(clear > 0.005, `no foot goes into a tread: the lowest heel or toe clears by ${(clear * 100).toFixed(1)} cm`);
  ok(reach === 0, 'the legs never have to stretch past their length');
  ok(slide < 0.001, `a planted foot stays put (${(slide * 1000).toFixed(2)} mm)`);
  const end = F.pose(S.duration);
  const T = await import('../descending/thought.js');
  const finite = Object.values(T.ATTRACTORS).every((A) => A.p.every(Number.isFinite));
  const Fr = T.frames(F.pose(130)), a1 = T.place(7, Fr, 130, 0.7, 1.4, [0, 0, 0]), a2 = T.place(7, Fr, 130, 0.7, 1.4, [0, 0, 0]);
  ok(finite && a1.every((v, i) => v === a2[i]) && T.POINTS.length > 3000, `the thought: four attractors integrated finite, ${T.POINTS.length} points, placed the same every time`);
  const Env = await import('../descending/env.js');
  let sorted = true;
  for (let i = 1; i < Env.GLINT_COUNT; i++) if (Env.GLINTS[i * 6] < Env.GLINTS[i * 6 - 6]) { sorted = false; break; }
  ok(sorted && Env.GLINT_COUNT > 10000 && Env.GLINTS.every(Number.isFinite), `the wall: ${Env.GLINT_COUNT} glints of the song's spectrum, sorted along the flight`);
  const rsrc = await readFile(join(root, 'descending', 'render.js'), 'utf8');
  ok(/return \{ draw/.test(rsrc), 'makeRenderer returns { draw }, the shape lib/extras.js exports with (a bare function broke Export video)');
  const c1 = JSON.stringify(Env.circuit(40)), c2 = JSON.stringify(Env.circuit(40)), cc = Env.circuit(40);
  const inside = cc.traces.flat().every(([x, z]) => x >= 0 && x <= 1 && z >= 0 && z <= 1);
  ok(c1 === c2 && inside && c1 !== JSON.stringify(Env.circuit(41)), 'each tread\'s circuit board is the same every time, different from the next, and on the tread');
  ok(Math.abs(end.ankleL[1] - end.ankleR[1]) < 0.01 && end.ankleL[0] > F.STEPS * F.RUN - 0.01, 'it ends with both feet on the floor at the foot of the stairs');
}

// 11 — Attractor Bodies: the bestiary is strange, a seed is a character, every point lands --------------
if (SHARD === 1) {
  console.log('\nAttractor Bodies (packages/attractor)');
  const { BESTIARY } = await import('../vendor/attractor/lib/bestiary.js');
  const Av = await import('../vendor/attractor/lib/avatar.js');
  const { makeRig, solve } = await import('../vendor/figure/lib/rig.js');
  const weak = BESTIARY.filter((b) => !(b.dim >= 1.35 && b.lyap > 0));
  ok(!weak.length && BESTIARY.length >= 200, `the bestiary: ${BESTIARY.length} attractors, every one chaotic (λ > 0) and fractal (D ≥ 1.35)${weak.length ? ': not ' + weak.map((b) => b.key.slice(0, 8)).join(', ') : ''}`);
  ok(JSON.stringify(Av.character(4242)) === JSON.stringify(Av.character(4242)) && JSON.stringify(Av.character(4242)) !== JSON.stringify(Av.character(4243)), 'a seed makes the same character every time, and the next seed another');
  let finite = true, count = 0;
  for (const seed of [1, 5, 9]) {
    const A = Av.build(Av.character(seed)), S = solve(makeRig(A.ch.body), {}), F = Av.frames(S.J, S.F.pelvis.z), o = [0, 0, 0];
    for (let i = 0; i < A.points.length; i += 7) { Av.place(A, i, F, 2.5, A.ch.thought, o); if (!o.every(Number.isFinite) || Math.abs(o[1]) > 20) finite = false; count++; }
  }
  ok(finite, `every point of three characters lands finite and near its body (${count} sampled)`);
  // a key read by the page must realise (some finds are transient chaos: realise keeps a bounded run)
  const { realise } = await import('../vendor/attractor/lib/space.js');
  const lost = BESTIARY.filter((b) => !realise(b.key, 16000));
  ok(!lost.length, `every bestiary attractor realises a bounded cloud${lost.length ? ': not ' + lost.map((b) => b.key.slice(0, 8)).join(', ') : ''}`);
  // the other body plans: every family's bones keep their count over a gait, and every point lands
  const { PLANS } = await import('../vendor/attractor/lib/plans.js');
  const bad = [];
  for (const plan of Object.keys(PLANS)) for (const family of Object.keys(PLANS[plan].families)) {
    const A = Av.build(Av.character(31, { plan, family })), o = [0, 0, 0], n = A.parts.length;
    for (const t of [0, 0.7, 1.9]) {
      const bones = Av.bonesAt(A, t), F = Av.boneFrames(bones);
      if (bones.length !== n) bad.push(`${plan}/${family} has ${bones.length} bones at t=${t}, not ${n}`);
      for (let i = 0; i < A.points.length; i += 5) { Av.place(A, i, F, t, A.ch.thought, o, 0.1); if (!o.every(Number.isFinite)) { bad.push(`${plan}/${family} point ${i}`); break; } }
    }
  }
  ok(!bad.length, `every body plan and family (${Object.keys(PLANS).join(', ')}) keeps its bones and lands every point${bad.length ? ': ' + bad.slice(0, 3).join('; ') : ''}`);
  ok(JSON.stringify(Av.character(4242, { plan: 'quadruped' }).genes) === JSON.stringify(Av.character(4242, { plan: 'quadruped' }).genes) && Av.character(4242).plan === 'humanoid', 'a creature is its seed too, and a bare seed is still the humanoid');
}

// 12 — Accretion: a world grows the same every time, flows stay free, and they move by themselves ----
if (SHARD === 1) {
  console.log('\nAccretion (packages/attractor/lib/shell.js)');
  const { World } = await import('../vendor/attractor/lib/shell.js');
  const a = new World(7, 3).run(700), b = new World(7, 3).run(700);
  ok(a.digest() === b.digest() && a.count > 200, `a seed grows the same world every time (${a.count} crystals, 3 creatures, 700 steps)`);
  // the tips stop short of their flow: almost none sits where its own current would dissolve it
  let tips = 0, wet = 0, inward = 0;
  for (const C of a.creatures) {
    const P = C.poseAt(1);
    for (let i = 0; i < C.n; i++) if (C.alive[i]) {
      const L = C.len[i], f = C.field(P, C.base[i * 3] + C.dir[i * 3] * L, C.base[i * 3 + 1] + C.dir[i * 3 + 1] * L, C.base[i * 3 + 2] + C.dir[i * 3 + 2] * L);
      if (f.nutrient < C.g.halo * 0.5) continue;                     // (someone else's reef, or its own left behind)
      tips++; if (f.current > C.g.channel * 1.5) wet++;
      const v = [P.c[0] - C.base[i * 3], P.c[1] - C.base[i * 3 + 1], P.c[2] - C.base[i * 3 + 2]], l = Math.hypot(...v) || 1;
      inward += (v[0] * C.dir[i * 3] + v[1] * C.dir[i * 3 + 1] + v[2] * C.dir[i * 3 + 2]) / l;
    }
  }
  ok(wet / tips < 0.03 && inward / tips > 0.25, `crystals point in at their flow (mean cos ${(inward / tips).toFixed(2)}) and stop short of it (${wet} of ${tips} tips in its current)`);
  // nothing scripts the motion: a long life moves them (by hunger and crowding), stays in the world and finite, and cycles mineral
  const L = new World(1, 3).run(3000), inside = L.creatures.every((C) => C.c.every((v, q) => v > 0 && v < [160, 72, 160][q]));
  let finite = true; for (const C of L.creatures) for (let i = 0; i < C.n; i++) if (C.alive[i] && !(Number.isFinite(C.len[i]) && Number.isFinite(C.base[i * 3]))) finite = false;
  const far = Math.max(...L.creatures.map((C) => C.travelled)), lost = L.creatures.reduce((x, C) => x + C.lost, 0), eaten = L.creatures.reduce((x, C) => x + C.eaten, 0);
  ok(far > 40 && inside && finite && lost > 0 && eaten > 0, `a hungry flow moves on by itself (${far.toFixed(0)} units), all stay in the world and finite, and mineral cycles (grazed ${eaten.toFixed(0)}, ${lost} crystals dissolved)`);
}

// 13 — Grown: bodies grown from programs; each hand-written one must work before evolution may begin --
if (SHARD === 2) {
  console.log('\nGrown (packages/attractor/lib/organism.js)');
  const { World, GENOMES, develop } = await import('../vendor/attractor/lib/organism.js');
  ok(JSON.stringify(develop(GENOMES.swimmer)) === JSON.stringify(develop(GENOMES.swimmer)) && develop(GENOMES.grazer).length === 6, 'a program develops the same plan every time (the grazer: 6 organs)');
  // each alone in three worlds, from the richest place, 3000 steps
  const life = {};
  for (const [name, g] of Object.entries(GENOMES)) {
    life[name] = [1, 2, 3].map((seed) => {
      const W = new World(seed, { cap: 1 }), B = W.add(g, W.richest(), 0.3, 3); W.run(3000);
      // how fast it CAN swim: the same body with its appetite off (it never idles), 1500 steps
      const W2 = new World(seed, { cap: 1 }), B2 = W2.add({ ...g, beat: { ...g.beat, rest: 0 } }, W2.richest(), 0.3, 3); W2.run(1500);
      return { alive: B.alive, grown: B.grown === B.plan.length, speed: B2.travelled / B2.age, armour: B.crystals.length };
    });
  }
  const all = (n, f) => life[n].every(f), mean = (n) => life[n].reduce((a, x) => a + x.speed, 0) / 3;
  ok(Object.keys(GENOMES).every((n) => all(n, (x) => x.alive && x.grown)), 'every hand-written body grows its whole plan and lives 3000 steps, alone, in three worlds');
  ok(mean('swimmer') > 1.3 * mean('grazer') && mean('grazer') > 0.01 && mean('reef') < 0.002, `fins swim: swimmer ${mean('swimmer').toFixed(3)} > grazer ${mean('grazer').toFixed(3)} > reef ${mean('reef').toFixed(4)} units a step`);
  ok(all('reef', (x) => x.armour > 20) && all('grazer', (x) => x.armour === 0), 'shells grow armour (the reef-builder), and only shells do');
  // together: they breed (buds), compete, and some starve; the world is the same every time
  const run = () => { const W = new World(1, { cap: 60 }); ['grazer', 'reef', 'swimmer'].forEach((n, i) => { for (let k = 0; k < 3; k++) { const a = (i * 3 + k) / 9 * 6.283; W.add(GENOMES[n], [80 + Math.cos(a) * 45, 32, 80 + Math.sin(a) * 45], a, 4); } }); return W.run(5000); };
  const A = run(), B2 = run(), born = A.next - 9;
  ok(born > 20 && A.dead.length > 0 && A.bodies.length === B2.bodies.length && A.bodies.every((b, i) => b.p.every((v, q) => v === B2.bodies[i].p[q])), `together they bud (${born} born) and some starve (${A.dead.length} dead), the same every time`);
}

// 14 — Grown, evolving: mutation makes new body plans, deterministically; nothing lives forever --------
if (SHARD === 1) {
  console.log('\nGrown, evolving');
  const { World, GENOMES, signature, mutate, speciesName } = await import('../vendor/attractor/lib/organism.js');
  ok(JSON.stringify(mutate(GENOMES.grazer, 42)) === JSON.stringify(mutate(GENOMES.grazer, 42)) && signature(GENOMES.reef) === 'm(g(bh)hhh)' && speciesName('m(b)') === speciesName('m(b)'), 'a mutation is a function of its seed; a plan\'s signature tells shell (h) from sense (s); a plan\'s name is fixed');
  // one run of 15,000 steps (it has all of it by then), and a second to 5,000 that must match the
  // first exactly where they overlap: determinism needs no second full run
  const state = (W) => JSON.stringify([W.mutants, Object.keys(W.book).sort(), W.bodies.map((b) => b.p.map((v) => v.toFixed(9)))]);
  const run = (n, at) => { const W = new World(1, { cap: 60, mutate: 0.3 }); ['grazer', 'reef', 'swimmer'].forEach((g, i) => { for (let k = 0; k < 3; k++) { const a = (i * 3 + k) / 9 * 6.283; W.add(GENOMES[g], [80 + Math.cos(a) * 45, 32, 80 + Math.sin(a) * 45], a, 4); } }); let snap = null; for (let k = 1; k <= n; k++) { W.run(1000); W.census(); if (k === at) snap = state(W); } W.snap = snap; return W; };
  const A = run(15, 5), B = run(5), plans = Object.keys(A.book).length, old = A.dead.filter((d) => d.cause === 'old').length;
  ok(plans > 8 && A.mutants > 30 && old > 0 && A.snap === state(B), `in 15,000 steps: ${A.mutants} mutants, ${plans} body plans, ${old} died of age; a second run matches the first exactly`);
  // predation: mouths bite other species (some die eaten), armour blunts a bite; the veins drift
  const eaten = A.dead.filter((d) => d.cause === 'eaten').length;
  const W0 = new World(5), r0 = W0.richest(); W0.lay(20000); const r1 = W0.richest();
  ok(eaten > 0 && Math.hypot(r0[0] - r1[0], r0[2] - r1[2]) > 5, `some are eaten (${eaten} in 15,000 steps), and the richest water moves (${Math.hypot(r0[0] - r1[0], r0[2] - r1[2]).toFixed(0)} units in 20,000 steps)`);
  {
    // one bite, by the same mouth, on a bare grazer and on a reef-builder in 30 armour crystals
    const taken = (genome, armour) => {
      const W = new World(9, { cap: 4 }), hunter = W.add({ name: 'h', root: { type: 'mouth', size: 1.5 }, rules: [], beat: { amp: 0, period: 30, steer: 0 } }, [80, 32, 80], 0, 5);
      const prey = W.add(genome, [80, 32, 80.8], 0, 8); prey.grown = prey.plan.length;
      prey.crystals = Array.from({ length: armour }, () => ({ organ: 0, dir: [0, 1, 0], len: 1, born: 0, spin: 0 }));
      prey.cur = prey.pose(1, 1); const E0 = prey.E; hunter.bite(hunter.pose(1, 1).organs[0], 1); return E0 - prey.E;
    };
    const soft = taken(GENOMES.grazer, 0), hard = taken(GENOMES.reef, 30);
    ok(soft > 0 && hard > 0 && soft > 3 * hard, `a bite lands, and armour blunts it: ${soft.toFixed(3)} from a bare grazer, ${hard.toFixed(3)} from an armoured reef-builder`);
  }
  const { EVOLVED } = await import('../vendor/attractor/lib/evolved.js');
  ok(EVOLVED.length >= 8 && EVOLVED.every((e) => signature(e.genome) === e.sig), `the evolved bestiary: ${EVOLVED.length} plans, each program still grows its plan`);
}

// 15 — Grown's sound: the population is the score --------------------------------------------------
if (SHARD === 2) {
  console.log('\nGrown, the sound (grown/sound.js)');
  const { makeEngine, makeConductor } = await import('../grown/sound.js');
  const { World, signature } = await import('../vendor/attractor/lib/organism.js');
  const { EVOLVED } = await import('../vendor/attractor/lib/evolved.js');
  const sr = 22050, dB = (a, i0, i1) => { let e = 0; for (let i = i0; i < i1; i++) e += a[i] * a[i]; return 10 * Math.log10(e / (i1 - i0) + 1e-12); };
  const play = (species, secs, events = []) => { const E = makeEngine(sr); E.state({ species, swim: 0, rich: 0.5 }); events.forEach((e) => E.event(e)); const L = new Float32Array(sr * secs), R = new Float32Array(sr * secs); E.render(L, R, L.length); return L; };
  const choir = Array.from({ length: 6 }, (_, k) => ({ sig: 'm(' + 'b'.repeat(k + 1) + ')', count: 9, organs: 3 })), one = [{ sig: 'm(b)', count: 2, organs: 2 }];
  const full = play(choir, 21), thin = play(one, 21);
  // level per chord (5 s each at 96 bpm): steady across the progression
  const per = [0, 1, 2, 3].map((k) => dB(full, sr * (k * 5 + 1.5), sr * (k * 5 + 4.5))), spread = Math.max(...per) - Math.min(...per);
  ok(full.every(Number.isFinite) && dB(full, sr * 2, sr * 20) > dB(thin, sr * 2, sr * 20) + 6 && spread < 4, `a full choir is louder than one voice (${(dB(full, sr * 2, sr * 20) - dB(thin, sr * 2, sr * 20)).toFixed(1)} dB), and steady across the chords (${spread.toFixed(1)} dB)`);
  // a world, heard: 10 s of an evolved world through the conductor, every step's events
  const W = new World(2, { cap: 60, mutate: 0.3 }); EVOLVED.slice(0, 9).forEach((e, i) => W.add(JSON.parse(JSON.stringify(e.genome)), [80 + Math.cos(i) * 45, 32, 80 + Math.sin(i) * 45], i, 4)); W.run(1500);
  const E = makeEngine(sr), got = { bite: 0, bud: 0, new: 0, eaten: 0 };
  const C = makeConductor((m) => { E.state(m.state); for (const e of m.events) { got[e.type]++; E.event(e); } }, { signature });
  const L = new Float32Array(sr * 10), R = new Float32Array(sr * 10), f = sr / 30;
  for (let k = 0; k < 300; k++) { W.step(); C.listen(W); if (k % 6 === 0) C.tell(W); E.render(L.subarray(k * f, (k + 1) * f), R.subarray(k * f, (k + 1) * f), f); }
  ok(L.every(Number.isFinite) && dB(L, sr * 2, sr * 10) > -40 && got.bite + got.bud > 0, `a world heard for 10 s: ${dB(L, sr * 2, sr * 10).toFixed(1)} dB, ${got.bud} buds, ${got.bite} bites, ${got.new} new plans, ${got.eaten} kills`);
}

// 16 — Nobody Drew It (No. 8): one evolved history, replayed and sung --------------------------------
if (SHARD === 2) {
  console.log('\nNobody Drew It (nobody/)');
  const S = await import('../nobody/score.js');
  const { LEXICON } = await import('../nobody/lexicon.js');
  const { sing } = await import('../lib/chipsing.js');
  const r = sing(S.song, LEXICON, { rate: 16000 });
  ok(r.notes.length > 90 && S.lyric.every((l) => l.to > l.from) && S.duration > 140 && S.duration < 150, `the song sings: ${r.notes.length} notes, ${S.lyric.length} lines, ${S.duration.toFixed(0)} s`);
  const { Replay, choir, CHAPTERS } = await import('../nobody/world.js');
  const { SNAPSHOTS } = await import('../nobody/history.js');
  const last = {}; for (const b of SNAPSHOTS[2].bodies) { const n = SNAPSHOTS[2].genomes[b.g].name; last[n] = (last[n] || 0) + 1; }
  const top = Object.entries(last).sort((a, b) => b[1] - a[1])[0];
  ok(top[0] === 'Quul' && SNAPSHOTS[0].bodies.length === 9, `the history: nine founders, and at step 950,000 the commonest plan is ${top[0]} (${top[1]} of ${SNAPSHOTS[2].bodies.length})`);
  const a = new Replay(), b = new Replay(); a.at(100); b.at(80); b.at(100);
  ok(JSON.stringify(a.W.bodies.map((x) => x.p)) === JSON.stringify(b.W.bodies.map((x) => x.p)), 'the replay is the same however it is reached (straight to 100 s, or through 80 s)');
  const c = choir(8000), dB = (t0, t1) => { let e = 0; for (let i = t0 * 8000; i < t1 * 8000; i++) e += c[i] * c[i]; return 10 * Math.log10(e / ((t1 - t0) * 8000) + 1e-12); };
  ok(c.every(Number.isFinite) && dB(92, 118) > dB(1, 9) + 5, `the choir: finite, and Quul's world (${dB(92, 118).toFixed(1)} dB) sings over the title's bass alone (${dB(1, 9).toFixed(1)} dB)`);
}

// 17 — And Still It Grew (No. 9): the major-key companion; the same machinery, its own music ---------
if (SHARD === 2) {
  console.log('\nAnd Still It Grew (grew/)');
  const S = await import('../grew/score.js');
  const { LEXICON } = await import('../grew/lexicon.js');
  const { sing } = await import('../lib/chipsing.js');
  const lead = sing(S.song, LEXICON, { rate: 12000 }), second = sing(S.harmonySong, LEXICON, { rate: 12000 });
  ok(lead.notes.length > 300 && second.notes.length > 100 && S.duration > 170 && S.duration < 190, `two voices sing: the lead ${lead.notes.length} notes, the second ${second.notes.length}; ${S.duration.toFixed(0)} s`);
  // the harmony, bar by bar: the choruses walk the bass down D C# B; the bridge is Bb C D; the last choruses are in E; the coda borrows A minor
  const at = (bar) => S.chordAt(bar).sym;
  ok([13, 14, 15].map(at).join(' ') === 'D A/C# Bm' && [53, 54, 55].map(at).join(' ') === 'Bb C D' && at(61) === 'E' && [77, 78, 79].map(at).join(' ') === 'A Am E' && S.harmony(0) === S.harmony(1), 'the harmony: the walking bass, the Aeolian lift, the key change, the borrowed iv; one chord object while it lasts');
  const { choir, CHAPTERS, commonest } = await import('../grew/world.js');
  ok(CHAPTERS.length === 4 && commonest(0) === 'grazer' && commonest(3) === 'Quul', `four chapters: from the founders (${commonest(0)} …) to ${commonest(3)}'s world`);
  const c = choir(8000), dB = (t0, t1) => { let e = 0; for (let i = Math.floor(t0 * 8000); i < t1 * 8000; i++) e += c[i] * c[i]; return 10 * Math.log10(e / ((t1 - t0) * 8000) + 1e-12); };
  const bar = (k) => (k - 1) * 240 / S.BPM;
  ok(c.every(Number.isFinite) && dB(bar(61), bar(77)) > dB(bar(1), bar(5)) + 5, `the choir: finite, and the choruses in E (${dB(bar(61), bar(77)).toFixed(1)} dB) over the intro (${dB(bar(1), bar(5)).toFixed(1)} dB)`);
}

// 18 — The Minormobius Lectures (No. 10): a documentary from a public record --------------------------
if (SHARD === 2) {
  console.log('\nThe Minormobius Lectures (lecture/)');
  const S = await import('../lecture/score.js');
  const { OPENING, LECTURES, QUOTED } = await import('../lecture/script.js');
  const { DUR, LEXICON } = await import('../lecture/narration.js');
  const R = await import('../lecture/record.js');
  const { existsSync } = await import('node:fs');
  const lines = [OPENING, ...LECTURES].flatMap((l) => l.lines);
  const words = lines.flatMap((l) => l.say.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g));
  ok(LECTURES.length === 10 && DUR.length === lines.length && words.every((w) => LEXICON[w]), `the script: ten lectures, ${lines.length} lines, every word in narration.js (else: node studio/tools/lecture-narration.mjs)`);
  const T = S.TIMELINE;
  ok(T.every((l, i) => l.to > l.from && (i === 0 || l.from >= T[i - 1].to)) && S.duration > 400 && S.duration < 540, `the clock: lines in order, never overlapping, ${S.duration.toFixed(0)} s`);
  const pics = [...Object.values(R.ORB).flat().flatMap((p) => p[2]), ...Object.values(R.QUOTES).flatMap((q) => q[2])].map(([f]) => f);
  ok(QUOTED.every((q) => R.QUOTES[q]) && Object.values(R.ORB).every((e) => e.length >= 10 && e.every((p) => p[2].length)) && [...pics, ...Object.values(R.PEOPLE).flat().map((p) => p.f).filter(Boolean)].every((f) => existsSync(new URL('../lecture/' + f, import.meta.url))), `the record: all ${QUOTED.length} quoted posts, every orb post with its picture (${pics.length} pictures), every face on disk`);
  const v = await S.vocal(8000), dB = (t0, t1) => { let e = 0; for (let i = Math.floor(t0 * 8000); i < t1 * 8000; i++) e += v.audio[i] * v.audio[i]; return 10 * Math.log10(e / ((t1 - t0) * 8000) + 1e-12); };
  const l0 = T[0];
  ok(v.audio.every(Number.isFinite) && dB(l0.from, l0.to) > dB(0.5, 6) + 20, `the voice: finite, and speaking (${dB(l0.from, l0.to).toFixed(1)} dB) over the title's silence`);
}

// colour cycle (cycle/) ---------------------------------------------------------
// A scene is an index map and a palette, under the real sky. What can be checked: the astronomy
// against known moments; the scene fits 256 colours and is the same twice; the palette moves only
// inside its cycles; the sun walks its painted path through the day; stars are drawn only at
// night; the faces that turn to the sun light up; the 3D world and its flight are sound.
if (SHARD === 3) {
  const { generate, palette, light, paintSunPath, useSky, project } = await import('../cycle/scene.js');
  const { sky, sunEq, daysJ2000 } = await import('../cycle/astro.js');
  const { drawNight } = await import('../cycle/night.js');
  useSky(sky);
  // astronomy: Polaris stands at the latitude; the equinox sun on the equator; a solstice sunrise
  const nyc = [40.71, -74.0];
  const pol = sky(Date.UTC(2026, 9, 6, 3), ...nyc).place(37.95, 89.26);
  const eq = sunEq(daysJ2000(Date.UTC(2026, 2, 20, 14, 46)));
  let rise = Date.UTC(2026, 5, 21, 8); while (sky(rise, ...nyc).sun.alt < -0.833) rise += 30000;
  const riseMin = new Date(rise).getUTCHours() * 60 + new Date(rise).getUTCMinutes();
  const full = sky(Date.UTC(2026, 9, 26, 4, 12), 0, 0).moonLit, nw = sky(Date.UTC(2026, 9, 10, 15, 50), 0, 0).moonLit;
  ok(Math.abs(pol.alt - nyc[0]) < 0.8 && Math.abs(eq.dec) < 0.02 && Math.abs(riseMin - (9 * 60 + 25)) <= 2 && full > 0.99 && nw < 0.01,
    `astro: Polaris at ${pol.alt.toFixed(2)}° from ${nyc[0]}°N, the equinox sun on the equator, New York's solstice sunrise 09:${String(riseMin - 540).padStart(2, '0')} UTC, full and new moons on their days`);

  const view = { lat: 40.71, lon: -74.0, facing: 180, wx: 'clear' };   // the sun's walk, seen on a clear day
  const day = Date.UTC(2026, 9, 6, 0);
  const a = generate(7), b = generate(7);
  let maxIdx = 0; for (const v of a.index) if (v > maxIdx) maxIdx = v;
  ok(a.used <= 256 && maxIdx < a.used && Buffer.compare(Buffer.from(a.index), Buffer.from(b.index)) === 0,
    `cycle: a scene fits ${a.used}/256 colours, every pixel names one, and the same seed paints the same scene`);
  ok(a.cycles.every((c) => c.lo >= 0 && c.lo + c.len <= a.used && c.len >= 3), `cycle: ${a.cycles.length} cycles, each inside the palette`);
  const at = (h) => day + (h + 74 / 15) * 3600000;           // local solar hour h on that day
  paintSunPath(a, view, at(12));
  const inCycle = new Set(a.cycles.flatMap((c) => Array.from({ length: c.len }, (_, i) => c.lo + i)));
  const sk15 = sky(at(15), view.lat, view.lon);
  const p0 = palette(a, view, sk15, 10), p1 = palette(a, view, sk15, 10.37);
  let outside = 0, inside = 0;
  for (let i = 0; i < 256; i++) { const d = Math.abs(p0[i * 3] - p1[i * 3]) + Math.abs(p0[i * 3 + 1] - p1[i * 3 + 1]) + Math.abs(p0[i * 3 + 2] - p1[i * 3 + 2]); if (d > 0) (inCycle.has(i) ? inside++ : outside++); }
  const win = a.entries.filter((e) => e.k === 'window').length;
  ok(outside <= win && inside > 40, `cycle: time moves ${inside} cycling colours and nothing else (but the window's flicker)`);
  // the sun: the brightest of the painted discs walks along them through the day (facing south)
  const discs = a.entries.map((e, i) => (e.k === 'sun' ? i : -1)).filter((i) => i >= 0);
  const placed = discs.filter((i) => a.entries[i].ms > 0).length;
  const brightest = (h) => { const p = palette(a, view, sky(at(h), view.lat, view.lon), 0); let best = -1, bv = -1; for (const i of discs) { const v = p[i * 3] + p[i * 3 + 1] + p[i * 3 + 2]; if (v > bv) { bv = v; best = i; } } return best - discs[0]; };
  const m9 = brightest(9), m12 = brightest(12), m15 = brightest(15);
  ok(placed > 20 && m9 < m12 && m12 < m15, `cycle: the day's real track is painted (${placed} discs) and the sun walks it (disc ${m9} → ${m12} → ${m15})`);
  // the night: real stars only after dark; facing north at 40°N, Polaris is 40° up
  const px = (sk) => new Uint8ClampedArray(640 * 360 * 4);
  const lt0 = light(a, view, sky(at(0), view.lat, view.lon)), lt12 = light(a, view, sky(at(12), view.lat, view.lon));
  const nStars = drawNight(px(), a, view, sky(at(0), view.lat, view.lon), 0, { night: lt0.night, cover: 0 }).length;
  const dStars = drawNight(px(), a, view, sky(at(12), view.lat, view.lon), 0, { night: lt12.night, cover: 0 }).length;
  const north = { ...view, facing: 0 }, sk0 = sky(at(0), view.lat, view.lon), pp = sk0.place(37.95, 89.26);
  const [, py] = project(a, north, pp.alt, pp.az), [, py40] = project(a, north, 40.71, 0);
  ok(nStars > 150 && dStars === 0 && Math.abs(py - py40) < 4, `cycle: ${nStars} real stars at midnight, none at noon; Polaris stands where 40° up is drawn`);
  const faces = a.entries.map((e, i) => (e.k === 'land' && e.name === 'far' ? i : -1)).filter((i) => i >= 0);
  const L = faces[0], Rt = faces[faces.length - 1], sum = (p, i) => p[i * 3] + p[i * 3 + 1] + p[i * 3 + 2];
  // facing south, the morning sun is to the left (east) and the evening sun to the right (west)
  const am = palette(a, view, sky(at(8.5), view.lat, view.lon), 0), pm = palette(a, view, sky(at(15.5), view.lat, view.lon), 0);
  ok(sum(am, L) > sum(am, Rt) && sum(pm, Rt) > sum(pm, L), 'cycle: the faces that turn to the sun light up, east in the morning and west in the afternoon');

  // the 3D world and the flight
  const { buildWorld, cameraAt, heightAt, KIND } = await import('../cycle/world.js');
  const w1 = buildWorld(3), w2 = buildWorld(3);
  const kinds = new Set(w1.kind);
  let minClear = Infinity;
  for (let u = 0; u < 1; u += 0.002) { const c = cameraAt(w1, u); minClear = Math.min(minClear, c.z - heightAt(w1, c.x, c.y)); }
  const c0 = cameraAt(w1, 0), c1 = cameraAt(w1, 1 - 1e-9);
  ok(w1.used <= 256 && Buffer.compare(Buffer.from(w1.index), Buffer.from(w2.index)) === 0 && [KIND.lake, KIND.river, KIND.fall, KIND.cliff].every((k) => kinds.has(k)),
    `fly: a world fits ${w1.used}/256 colours, is the same twice, and has its lake, river, fall and cliffs`);
  ok(minClear > 10 && Math.hypot(c0.x - c1.x, c0.y - c1.y, c0.z - c1.z) < 5 && w1.path.length > 4000,
    `fly: a closed ${(w1.path.length / 1000).toFixed(1)} km loop, never nearer the ground than ${minClear.toFixed(0)} m`);
  const { Flight } = await import('../cycle/fly.js');
  const img = { data: new Uint8ClampedArray(640 * 360 * 4) }, f = new Flight(img, { putImageData() {} }, view);
  f.load(3, 54);
  const t0 = performance.now(); f.frame(1, 5 * 86400000 * 4000.13); const ms = performance.now() - t0;
  let lum = 0; for (let i = 0; i < img.data.length; i += 4) lum += img.data[i] + img.data[i + 1] + img.data[i + 2];
  ok(lum / (640 * 360) > 60 && f.idx.some((v) => v > 0), `fly: a frame renders by day (${ms.toFixed(0)} ms in node, cold)`);

  // the city (cityworld.js): packages/morph's city on its ground, flown down its river and an old road
  const { buildCityWorld } = await import('../cycle/cityworld.js');
  const tc = performance.now(), cw = buildCityWorld(3), tcity = performance.now() - tc, cw2 = buildCityWorld(3);
  let cityClear = Infinity;
  for (let u = 0; u < 1; u += 0.002) { const c = cameraAt(cw, u); cityClear = Math.min(cityClear, c.z - heightAt(cw, c.x, c.y)); }
  const cc0 = cameraAt(cw, 0), cc1 = cameraAt(cw, 1 - 1e-9), legs = new Set(cw.path.samples.map((p) => p.place));
  let walls = 0, water = 0;
  for (let k = 0; k < cw.kind.length; k++) { if (cw.kind[k] === KIND.building) walls++; else if (cw.kind[k] === KIND.lake) water++; }
  ok(cw.used <= 256 && Buffer.compare(Buffer.from(cw.index), Buffer.from(cw2.index)) === 0 && Buffer.compare(Buffer.from(cw.facade.bid.buffer), Buffer.from(cw2.facade.bid.buffer)) === 0
    && cw.city.buildings > 2000 && walls > 50000 && water > 5000 && ['river', 'falls', 'mountains'].every((p) => legs.has(p)),
    `fly: a city of ${cw.city.buildings} buildings in ${cw.used}/256 colours, the same twice, with its river (${(tcity / 1000).toFixed(1)} s to build)`);
  ok(cityClear > 10 && Math.hypot(cc0.x - cc1.x, cc0.y - cc1.y, cc0.z - cc1.z) < 5 && cw.path.samples.every((p) => Number.isFinite(p.z)),
    `fly: the city's ${(cw.path.length / 1000).toFixed(1)} km loop closes and never comes nearer than ${cityClear.toFixed(0)} m to what is under it`);
  // by night, flying down the river: the facades are drawn per row and their windows light
  const fc = new Flight(img, { putImageData() {} }, view);
  fc.load(3, 54, 'city');
  const onRiver = cw.path.samples.flatMap((p, i) => (p.place === 'river' ? [i] : [])), riverU = cw.path.cum[onRiver[onRiver.length >> 1]] / cw.path.length;
  const D5 = 5 * 86400000, msN = (Math.floor(Date.UTC(2026, 0, 10) / D5) + riverU) * D5;
  const utcH = (msN / 3600000) % 24;
  Object.assign(view, { lat: 48, lon: ((((-utcH * 15) % 360) + 540) % 360) - 180 });   // where it is midnight there and then
  fc.frame(1, msN);
  const lit = fc.palette(fc.light(sky(msN, view.lat, view.lon), msN), 1);
  const cwin = cw.facade.win;
  let wpx = 0, bright = 0;
  for (let i = 0; i < fc.idx.length; i++) if (fc.idx[i] >= cwin && fc.idx[i] < cwin + 16 && fc.dep[i] < Infinity) { wpx++; const q = fc.idx[i] * 3; if (lit[q] + lit[q + 1] + lit[q + 2] > 0.9) bright++; }
  ok(wpx > 2000 && bright > wpx * 0.1 && bright < wpx * 0.9, `fly: by night ${wpx} window pixels on the river's facades, ${Math.round(100 * bright / wpx)}% of them lit`);
  // the town's day (packages/morph mobility.js + motion.js): a railway, the journeys, cars drawn with depth
  const Mo = cw.motion; let carPx = 0;
  for (let i = 0; i < fc.idx.length; i++) if (fc.idx[i] >= Mo.car && fc.idx[i] < Mo.car + 6) carPx++;
  ok(cw.day && cw.day.n > 30000 && cw.day.vehicles.length > 0 && Mo.parked.data.length / 5 > 2000 && carPx > 50 && cw.boats,
    `fly: the city's day runs: ${cw.day.n} journeys, ${cw.day.vehicles.length} timetabled services, ${Mo.parked.data.length / 5} parked cars (${carPx} car pixels in that frame), ${cw.boats.list.length} boats on the river`);
}

// the duo (cycle/compose.js, music.js, pfstream.wasm) -------------------------------------
// The stream host must sound exactly like the offline hosts it stands for, the guitar's body
// must be clef's, every guitar note must be playable, and the music must render: audible, finite,
// and faster than it plays.
if (SHARD === 3) {
  const load = async (p) => (await WebAssembly.instantiate(await readFile(p), {})).instance.exports;
  const P = await load(join(root, '..', 'clef/vendor/pfsynth/pfsynth.wasm'));
  const G = await load(join(root, '..', 'clef/vendor/pfsynth/pfguitar.wasm'));
  const X = await load(join(root, 'vendor/pfsynth/pfstream.wasm'));
  const sr = 44100, LEN = 3 * sr, BLK = 2048;
  const piano = Array.from({ length: 10 }, (_, k) => ({ at: k * 0.25, dur: 0.6, midi: 60 + [0, 4, 7, 12, 7][k % 5], vel: 0.5 }));
  const gtr = [[0, 5, 45, 0, 0], [0.3, 3, 57, 0, 0], [0.6, 1, 64, 4, 12], [1.1, 3, 59, 1, 0], [1.6, 2, 62, 0, 0]].map(([at, string, midi, art, ap]) => ({ at, dur: 1.2, string, midi, art, ap, vel: 100 }));
  let dv = new DataView(P.memory.buffer), ptr = P.pfw_notes_ptr();
  piano.forEach((e, i) => { const st = Math.round(e.at * sr); dv.setInt32(ptr + i * 16, st, true); dv.setInt32(ptr + i * 16 + 4, st + Math.round(e.dur * sr), true); dv.setFloat32(ptr + i * 16 + 8, e.midi, true); dv.setFloat32(ptr + i * 16 + 12, e.vel, true); });
  P.pfw_begin(sr, piano.length, 110);
  const op = new Float32Array(LEN * 2); for (let f = 0; f < LEN; f += BLK) { P.pfw_render(BLK); op.set(new Float32Array(P.memory.buffer, P.pfw_out_ptr(), BLK * 2).subarray(0, Math.min(BLK, LEN - f) * 2), f * 2); }
  const nb = G.pgw_note_bytes(); ptr = G.pgw_notes_ptr(); dv = new DataView(G.memory.buffer);
  new Uint8Array(G.memory.buffer, ptr, nb * gtr.length).fill(0);
  gtr.forEach((e, i) => { const q = ptr + i * nb; dv.setFloat64(q, e.at, true); dv.setFloat64(q + 8, e.at + e.dur, true); dv.setFloat32(q + 16, e.midi, true); dv.setFloat32(q + 20, e.vel, true); dv.setFloat32(q + 24, e.ap, true); dv.setInt8(q + 40, e.string); dv.setInt8(q + 41, e.midi - [64, 59, 55, 50, 45, 40][e.string - 1]); dv.setInt8(q + 42, -1); dv.setUint8(q + 43, e.art); });
  G.pgw_set(4, 0); G.pgw_begin(sr, gtr.length, 3);
  const og = new Float32Array(LEN); for (let f = 0; f < LEN;) { const n = G.pgw_render(Math.min(2048, LEN - f)); if (!n) break; og.set(new Float32Array(G.memory.buffer, G.pgw_out_ptr(), n), f); f += n; }
  X.ps_begin(sr, 110);
  const sp = new Float32Array(LEN * 2), sg = new Float32Array(LEN), all = [...piano.map((e) => ({ ...e, inst: 0 })), ...gtr.map((e) => ({ ...e, inst: 1 }))], pushed = new Set();
  for (let f = 0; f < LEN; f += BLK) {
    const due = all.filter((e) => !pushed.has(e) && e.at < f / sr + 0.2), d2 = new DataView(X.memory.buffer), sp0 = X.ps_stage_ptr();
    due.forEach((e, i) => { pushed.add(e); const q = sp0 + i * 40; d2.setFloat64(q, Math.round(e.at * sr), true); d2.setFloat64(q + 8, Math.round(e.at * sr) + Math.round(e.dur * sr), true); d2.setFloat32(q + 16, e.midi, true); d2.setFloat32(q + 20, e.vel, true); d2.setInt32(q + 24, e.inst, true); d2.setInt32(q + 28, e.string || 0, true); d2.setInt32(q + 32, e.art || 0, true); d2.setFloat32(q + 36, e.ap || 0, true); });
    if (due.length) X.ps_push(due.length);
    X.ps_render(BLK); const n = Math.min(BLK, LEN - f);
    sp.set(new Float32Array(X.memory.buffer, X.ps_piano_ptr(), n * 2), f * 2); sg.set(new Float32Array(X.memory.buffer, X.ps_guitar_ptr(), n), f);
  }
  let dp = 0, dg = 0, pg = 0; for (let i = 0; i < op.length; i++) dp = Math.max(dp, Math.abs(op[i] - sp[i])); for (let i = 0; i < og.length; i++) { dg = Math.max(dg, Math.abs(og[i] - sg[i])); pg = Math.max(pg, Math.abs(og[i])); }
  ok(dp === 0 && dg < pg * 1e-4, `duo: the stream host is clef's piano exactly (max diff ${dp}) and upstream's guitar to ${(20 * Math.log10(dg / pg)).toFixed(0)} dB, with notes pushed while it renders`);
  const bodyOurs = await readFile(join(root, 'vendor/pfsynth/bodies/g34.wav')), bodyClef = await readFile(join(root, '..', 'clef/vendor/pfsynth/bodies/g34.wav'));
  ok(Buffer.compare(bodyOurs, bodyClef) === 0, 'duo: the guitar body is clef\'s, byte for byte');

  const { Composer } = await import('../cycle/compose.js');
  const OPEN = [64, 59, 55, 50, 45, 40];
  let bad = 0, total = 0, flamencoThird = true;
  for (const biome of ['alpine', 'canyon', 'autumn', 'alien', 'atlantic', 'tropic', 'nordic']) for (const place of ['lake', 'falls', 'river', 'mountains', 'stars', 'sea']) {
    const c = new Composer({ seed: 3, biome, bpm: 56, surf: { period: 8.4, phase: 1.1 } });
    for (let n = 0; n < 40; n++) for (const x of c.bar(n, { el: 0.4, rising: true, night: place === 'stars' ? 1 : 0, cover: 0.3, moon: 0.5, place, density: 1 })) {
      total++;
      if (!Number.isFinite(x.at) || !(x.dur > 0) || !(x.vel > 0)) bad++;
      if (x.inst === 1) {
        const f = x.midi - OPEN[x.string - 1];
        if (!(x.string >= 1 && x.string <= 6)) bad++;
        else if (x.art === 4 ? ![12, 19, 24].includes(f) : f < 0 || f > 19) bad++;
      }
    }
  }
  const cf = new Composer({ seed: 3, biome: 'canyon', bpm: 56 });
  for (let n = 0; n < 32; n++) { const notes = cf.bar(n, { el: 0.6, rising: true, night: 0, cover: 0.3, moon: 0.5, place: 'mountains', density: 1 }); if (cf.section.chords[n] === 0 && notes.some((x) => x.inst === 0 && ((x.midi - 45) % 12 + 12) % 12 === 3)) flamencoThird = false; }
  ok(bad === 0 && total > 5000, `duo: ${total} notes over every biome and texture, all well-formed, every guitar note on a string and fret (harmonics at 12, 7, 5)`);
  ok(flamencoThird, 'duo: in the canyon the home chord keeps its major third (C# over A, never C), as flamenco does');

  const { Music, parseWav } = await import('../cycle/music.js');
  const bb = await readFile(join(root, 'vendor/pfsynth/bodies/g34.wav'));
  const m = new Music(X, { seed: 4, biome: 'canyon', bpm: 56, sampleRate: 22050, body: parseWav(bb.buffer.slice(bb.byteOffset, bb.byteOffset + bb.byteLength)) });
  m.cond = () => ({ el: 0.5, rising: true, night: 0, cover: 0.3, moon: 0.5, place: 'river', density: 1 });
  const t0 = performance.now(); let pk = 0, sum = 0, n = 0, finite = true, notes = 0;
  while (m.frame < 22050 * 20) { const r = m.render(10); notes += r.notes.length; for (const v of r.pcm) { if (!Number.isFinite(v)) finite = false; pk = Math.max(pk, Math.abs(v)); sum += v * v; n++; } }
  const speed = 20 / ((performance.now() - t0) / 1000), db = 10 * Math.log10(sum / n);
  ok(finite && pk < 1 && db > -40 && notes > 20 && speed > 1.5, `duo: 20 s of the canyon's river render at ${speed.toFixed(1)}× real time (22 kHz), ${notes} notes, ${db.toFixed(1)} dB, peak ${pk.toFixed(2)}`);
}

// 19 — the cycle's weather: a forecast is a pure function of the place and moment, the season decides
// rain or snow, lightning is one schedule for the picture, the thunder and the music
if (SHARD === 3) {
  const { forecast, lightning, strikesIn, weatherLight, KINDS } = await import('../cycle/weather.js');
  const { Precip } = await import('../cycle/precip.js');
  const same = JSON.stringify(forecast(7, 1.8e12, 47, 8)) === JSON.stringify(forecast(7, 1.8e12, 47, 8));
  const count = (month, lat) => { const c = {}; for (let d = 0; d < 400; d++) { const k = forecast(7, Date.UTC(2026, month, 1) + (d % 28) * 86400000 + Math.floor(d / 28) * 365.25 * 86400000, lat, 8).kind; c[k] = (c[k] || 0) + 1; } return c; };
  const jan = count(0, 50), jul = count(6, 50);
  ok(same && (jan.snow || 0) > 20 && !jul.snow && (jul.storm || 0) > 0 && !jan.storm, `weather: deterministic; at 50°N January snows (${jan.snow}/400 days) and never storms, July storms (${jul.storm}) and never snows`);
  let ordered = true, finite = true;
  for (const k of KINDS) { const w = forecast(7, 1.8e12, 47, 8, k); if (w.kind !== k) ordered = false; for (const v of Object.values(w)) if (typeof v === 'number' && !Number.isFinite(v)) finite = false; }
  ok(ordered && finite, `weather: the chooser forces each of ${KINDS.length} kinds, every level finite`);
  const s = strikesIn(7, 0, 600, () => 1), hit = s.filter((x) => lightning(7, x.t + 0.01, 1).flash > 0.9).length;
  ok(s.length > 10 && hit === s.length && lightning(7, 100, 0).flash === 0 && strikesIn(7, 0, 600, () => 0).length === 0, `weather: ${s.length} strikes in 10 min of full storm, each one flashes where the schedule says; none without a storm`);
  const lt = { zen: [0.3, 0.5, 0.9], hor: [0.6, 0.7, 0.9], amb: [0.5, 0.5, 0.5], sunCol: [1, 0.9, 0.8], moonCol: [0.2, 0.2, 0.3], sunI: 1, moonI: 0, night: 0 };
  const dull = weatherLight(lt, forecast(7, 1.8e12, 47, 8, 'storm')), lit = weatherLight(lt, forecast(7, 1.8e12, 47, 8, 'storm'), 1);
  ok(dull.sunI < 0.2 && dull.sunCol[0] < 0.3 && lit.zen[2] > dull.zen[2] + 0.5, 'weather: overcast hides the sun, a flash lights the sky');
  const fx = new Precip(320, 200, 7), px = new Float32Array(320 * 200 * 4).fill(100);
  for (const k of ['rain', 'snow', 'fog', 'storm']) fx.draw(px, { t: 3, wx: forecast(7, 1.8e12, 47, 8, k), lt: lit, flash: lightning(7, s[0].t + 0.01, 1), horizon: 100, fogTop: 60, fogBottom: 160, water: (x, y) => y > 150, sky: (x, y) => y < 100, veil: () => 0.3 });
  ok(px.every(Number.isFinite) && px.some((v) => v !== 100), 'weather: rain, rings, snow, fog and a bolt draw over a frame, every pixel finite');
}

// 20 — the coast: a second kind of scene. It fits its palette; the surf is one wave on two cycles,
// and the sound's breakers land when the painted crest crosses the break line; the lighthouse sweeps
// by night only; boats and gulls move; the world to fly is built for it and renders
if (SHARD === 3) {
  const { generate, palette, turnCycles, light, W: CW, H: CH } = await import('../cycle/scene.js');
  const { sky } = await import('../cycle/astro.js');
  const { surfTimes } = await import('../cycle/sound.js');
  const { Life } = await import('../cycle/life.js');
  const a = generate(5, 'coast'), b = generate(5, 'coast');
  let maxIdx = 0; for (const v of a.index) if (v > maxIdx) maxIdx = v;
  ok(a.kind === 'coast' && a.used <= 256 && maxIdx < a.used && Buffer.compare(Buffer.from(a.index), Buffer.from(b.index)) === 0 && a.cycles.every((c) => c.lo + c.len <= a.used),
    `coast: a scene fits ${a.used}/256 colours, every pixel names one, the same seed paints the same coast (${a.biome})`);
  const kinds = new Set(Array.from({ length: 30 }, (_, i) => generate(i + 1, 'coast').biome));
  ok(kinds.size === 3, `coast: the seeds find all three coasts (${[...kinds].join(', ')})`);
  // the surf: at the moment the sound says a wave breaks, the crest stands on the break line
  const st = surfTimes(a), sea = a.cycles.find((c) => c.name === 'surf'), sand = a.cycles.find((c) => c.name === 'surf on the sand');
  const lit = a.entries.map((e) => [e.k === 'surf' ? e.s : 0, 0, 0]), crestAt = (t) => { const r = turnCycles(lit, [sea], t, a.bpm); let best = 0; for (let i = 1; i < 16; i++) if (r[sea.lo + i][0] > r[sea.lo + best][0]) best = i; return best; };
  const at = [0, 1, 2, 5].map((k) => crestAt(st.phase + k * st.period + 1e-6));
  ok(sea.len === sand.len && sea.perBeat === sand.perBeat && Math.abs(st.period - 8 * 60 / a.bpm) < 1e-9 && at.every((v) => v === at[0]) && at[0] === ((a.surf.breakPos + 12) % 16),
    `coast: one wave every ${st.period.toFixed(2)} s (two bars), the sea's and the sand's halves on one beat; each breaker sounds as the crest reaches slot ${at[0]}`);
  // the lighthouse: by night the beam lights one side at a time and the lamp flashes toward us; by day nothing
  const view = { lat: 40.71, lon: -74, facing: 180, wx: 'clear' }, night = sky(Date.UTC(2026, 9, 8, 4), 40.71, -74), noon = sky(Date.UTC(2026, 9, 7, 17), 40.71, -74);
  const [lo, BB] = a.lighthouse.beam, P = a.lighthouse.period;
  const side = (p, s) => { let v = 0; for (let i = 0; i < BB; i++) { const j = (lo + (s < 0 ? 0 : BB) + i) * 3; v += p[j] + p[j + 1] + p[j + 2]; } return v; };
  const n1 = palette(a, view, night, P * 0.25), n2 = palette(a, view, night, P * 0.75), dn = palette(a, view, noon, P * 0.25), dn2 = palette(a, view, noon, P * 0.75);
  const lampI = a.entries.findIndex((e) => e.k === 'lamp'), lampAt = (t) => { const p = palette(a, view, night, t); return p[lampI * 3] + p[lampI * 3 + 1]; };
  ok(side(n1, 1) > side(n1, -1) + 200 && side(n2, -1) > side(n2, 1) + 200 && Math.abs(side(dn, 1) - side(dn2, 1)) < 30 && lampAt(0) > lampAt(P / 2) + 60,
    'coast: the beam sweeps right then left by night, not by day; the lamp flashes as it turns toward us');
  // life: boats and gulls are drawn, move, and stay finite
  const life = new Life(a), lt = light(a, view, noon, 10);
  const f1 = new Float32Array(CW * CH * 4).fill(100), f2 = new Float32Array(CW * CH * 4).fill(100);
  life.draw(f1, { t: 10, lt }); life.draw(f2, { t: 40, lt });
  let diff = 0; for (let i = 0; i < f1.length; i++) diff += f1[i] !== f2[i];
  ok(life.boats.length >= 2 && life.gulls.length >= 4 && f1.every(Number.isFinite) && diff > 100, `coast: ${life.boats.length} boats and ${life.gulls.length} gulls drawn, and they move (${diff} values differ in 30 s)`);
  // the world to fly: the same coast, the surf on it, and a frame
  const { buildCoastWorld } = await import('../cycle/coastworld.js');
  const { Flight } = await import('../cycle/fly.js');
  const wld = buildCoastWorld(5);
  const img = { data: new Uint8ClampedArray(CW * CH * 4) }, fl = new Flight(img, { putImageData() {} }, view);
  fl.world = wld; fl.load = () => {}; fl.cloud = new Float32Array(512 * 512).fill(0.3);
  const r = fl.frame(20, Date.UTC(2026, 9, 7, 17));
  let lake = 0, foam = 0; for (const k of wld.kind) { if (k === 1) lake++; if (k === 4) foam++; }
  ok(wld.biome === a.biome && wld.used <= 256 && lake > 1e5 && foam > 2000 && r.lt && img.data.every(Number.isFinite) && wld.path.samples.every((p) => Number.isFinite(p.z)),
    `coast: the world to fly is the same ${wld.biome} coast, ${wld.used} colours, sea and ${foam} cells of surf, and renders`);
}

// 21 — the aurora: on the oval round the geomagnetic pole, seen where and when a place would see it
if (SHARD === 3) {
  const { geomag, auroraAt, kp } = await import('../cycle/aurora.js');
  const tro = geomag(69.65, 18.96), ny = geomag(40.71, -74), syd = geomag(-33.87, 151.21);
  const ms = Date.parse('2026-12-10T22:00:00Z'), D = Math.PI / 180;
  const look = (au, alt, az) => { const o = [0, 0, 0]; au.sample(alt * D, az, 20, o); return o; };
  const T2 = auroraAt(7, ms, 69.65, 18.96, -40, 2), N2 = auroraAt(7, ms, 40.71, -74, -40, 2), day = auroraAt(7, ms, 69.65, 18.96, 5, 9);
  const N7 = auroraAt(7, ms, 40.71, -74, -40, 7);
  // from New York in a storm the curtain stands ~400 km north: low it is green, its top red
  let bestG = 0, bestR = 0, gAlt = 0, rAlt = 0;
  for (let a = 1; a < 60; a += 1) { const o = look(N7, a, N7.bearing); if (o[1] > bestG) { bestG = o[1]; gAlt = a; } if (o[0] > bestR) { bestR = o[0]; rAlt = a; } }
  const fin = [0, 10, 30, 60, 89].every((a) => look(T2, a, 1).every(Number.isFinite));
  ok(Math.abs(tro.mlat - 67) < 1.5 && Math.abs(ny.mlat - 50.5) < 1.5 && syd.mlat < -40 && Math.abs(Math.cos(syd.bearing) + 1) < 0.3,
    `aurora: geomagnetic latitudes Tromsø ${tro.mlat.toFixed(1)}°, New York ${ny.mlat.toFixed(1)}°, Sydney ${syd.mlat.toFixed(1)}° (its aurora to the south)`);
  const peak = (au) => { if (!au) return 0; let m = 0; for (let a = 3; a < 60; a++) for (let z = -1; z <= 1; z += 0.5) { const o = look(au, a, au.bearing + z); m = Math.max(m, o[0] + o[1]); } return m; };
  ok(peak(T2) > 0.06 && peak(N2) < 0.02 && !day && N7 && fin && gAlt < rAlt && bestR > 0.05,
    `aurora: a quiet night lights Tromsø (${peak(T2).toFixed(2)}) and not New York (${peak(N2).toFixed(3)}); never by day; a storm reaches New York, green at ${gAlt}° and red above at ${rAlt}°`);
  const ks = Array.from({ length: 400 }, (_, i) => kp(3, ms + i * 86400000, 0)), big = ks.filter((k) => k >= 5).length;
  ok(ks.every((k) => k >= 0 && k <= 9) && big > 4 && big < 60 && kp(3, ms, 0) === kp(3, ms + 3600000, 0), `aurora: each night's Kp is fixed for the night, storms (Kp ≥ 5) on ${big} of 400 nights`);
}

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
