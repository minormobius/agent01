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

// 7 — the P(doom) video: its compiled dance is current, and its checks hold -------
console.log('\nThe P(doom) video (a dance, compiled per body)');
{
  const { execFileSync } = await import('node:child_process');
  let stale = false;
  try { execFileSync(process.execPath, [join(root, 'tools', 'build-pdoom.mjs'), '--check'], { stdio: 'pipe' }); } catch { stale = true; }
  ok(!stale, 'pdoom/dance.json is current (node studio/tools/build-pdoom.mjs)');
  const rep = JSON.parse(await rf(join(root, 'pdoom', 'report.json'), 'utf8'));
  const bad = rep.dancers.flatMap((d) => d.checks.filter((c) => !c.ok).map((c) => `${d.name}: ${c.name} ${c.detail}`));
  ok(!bad.length, `every dancer holds up through the whole song (report.json)${bad.length ? ': ' + bad.slice(0, 3).join('; ') : ''}`);
}

// 8 — The Bommie: a sitcom on a coral head. What can be checked without eyes or ears ----
console.log('\nThe Bommie (a reef sitcom)');
{
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
console.log('\nA Voice of Arithmetic (formant speech)');
{
  const V = await import('../lib/chipvoice.js');
  const T = await import('../voice/texts.js');
  const lex = JSON.parse(await rf(join(root, 'voice', 'lexicon.json'), 'utf8')).words;
  const missing = [...new Set(V.words([T.PARAGRAPH, ...T.HARVARD].join(' ')))].filter((w) => !lex[w]);
  ok(!missing.length, `the lexicon has every word the voice is tested on${missing.length ? ': missing ' + missing.join(', ') : ''} (node studio/tools/voice-lexicon.mjs <cmudict>)`);
  const t0 = Date.now(), a = V.speak(T.PARAGRAPH, lex).audio, b = V.speak(T.PARAGRAPH, lex).audio, ms = (Date.now() - t0) / 2;
  let same = a.length === b.length, finite = true, peak = 0;
  for (let i = 0; i < a.length; i++) { if (a[i] !== b[i]) same = false; if (!Number.isFinite(a[i])) finite = false; peak = Math.max(peak, Math.abs(a[i])); }
  ok(same && finite && peak > 0.5 && peak <= 0.91, `the paragraph renders the same every time, finite, normalised (${(a.length / 16000).toFixed(1)} s of speech in ${ms.toFixed(0)} ms)`);
  const rep = JSON.parse(await rf(join(root, 'voice', 'report.json'), 'utf8'));
  ok(rep.sentences.length === T.PARAGRAPH_SENTENCES.length + T.HARVARD.length, `report.json scores every test sentence (Harvard WER ${rep.harvard.wer}%, ${rep.date}; rescore: studio/tools/voice.mjs --report)`);
}

// 10 — Descending: the voice on the beat, the feet on the stairs ------------------------------------
console.log('\nDescending (Daisy Bell, sung by arithmetic)');
{
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
  const rsrc = await rf(join(root, 'descending', 'render.js'), 'utf8');
  ok(/return \{ draw/.test(rsrc), 'makeRenderer returns { draw }, the shape lib/extras.js exports with (a bare function broke Export video)');
  const c1 = JSON.stringify(Env.circuit(40)), c2 = JSON.stringify(Env.circuit(40)), cc = Env.circuit(40);
  const inside = cc.traces.flat().every(([x, z]) => x >= 0 && x <= 1 && z >= 0 && z <= 1);
  ok(c1 === c2 && inside && c1 !== JSON.stringify(Env.circuit(41)), 'each tread\'s circuit board is the same every time, different from the next, and on the tread');
  ok(Math.abs(end.ankleL[1] - end.ankleR[1]) < 0.01 && end.ankleL[0] > F.STEPS * F.RUN - 0.01, 'it ends with both feet on the floor at the foot of the stairs');
}

// 11 — Attractor Bodies: the bestiary is strange, a seed is a character, every point lands --------------
console.log('\nAttractor Bodies (packages/attractor)');
{
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
}

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
