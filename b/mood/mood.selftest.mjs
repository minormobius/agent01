// mood.selftest.mjs — the parts of /mood that can be wrong while looking right.
//
//   node b/mood/mood.selftest.mjs
//
// The headline test is THE AVERAGING TRAP. jev's colour-axis finding says a
// `score` averages over an ordering, so averaging something unordered puts
// "red or violet" at green. A mood ring can make that exact mistake in two
// places — the primitive it asks with, and the way it combines ten readings
// into one stone — and in both cases the output is a confident, plausible,
// wrong colour. Nothing about the page would look broken.

import {
  VALENCE, ENERGY, FLAVOURS, N_POSTS, buildState, buildQuestions, readMoods,
  circumplex, hueFor, moodColour, aggregate, spread, moodName, flavourTally,
  ringSegments, arcPath, HUE_AT_ZERO,
} from './mood.js';

let failures = 0;
const ok = (c, m) => { if (!c) { failures++; console.error('  ✗ ' + m); } };
const eq = (a, b, m) => ok(Object.is(a, b), `${m} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);
const near = (a, b, tol, m) => ok(Math.abs(a - b) <= tol, `${m} (got ${a}, want ${b}±${tol})`);
// Hue is circular, so "how far apart" is angular distance — the same fact that
// forced flavour to be a choice shows up again in the assertions themselves.
const hueGap = (a, b) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

console.log('mood selftest');

// ── 1. the questions are the contract with the model ─────────────────────────
{
  const posts = Array.from({ length: 10 }, (_, i) => ({ text: `post ${i}`, uri: `at://x/app.bsky.feed.post/${i}` }));
  const q = buildQuestions(posts);
  eq(Object.keys(q).length, 30, 'ten posts ask thirty questions in one call');

  // The primitive per variable IS the finding. If someone "simplifies" flavour
  // into a score later, this is what stops them.
  eq(q.valence_0.type, 'score', 'valence is ordered, so it is a score');
  eq(q.energy_0.type, 'score', 'energy is ordered, so it is a score');
  eq(q.flavour_0.type, 'choice', 'flavour is UNORDERED, so it is a choice and never a score');
  ok(Array.isArray(q.valence_0.criteria) && q.valence_0.criteria.length >= 2, 'a score names an ordered array of at least two rungs');
  ok(!Array.isArray(q.flavour_0.criteria) && typeof q.flavour_0.criteria === 'object', 'a choice names a map of option → description');
  for (const k of Object.keys(q)) ok(typeof q[k].instructions === 'string' && q[k].instructions.length > 10, `${k} carries real instructions`);
  ok(Object.keys(q).length <= 256, 'the call stays under the proxy question cap');

  const st = buildState(posts, { handle: 'a.bsky.social' });
  eq(st.posts.length, 10, 'every post reaches the state');
  eq(st.posts[3].id, 3, 'posts are identified by the index the questions use');
  ok(/author/i.test(st.note), 'the state tells the model to read the author, not the subject');
}

// ── 2. the plane, and that the hue map closes ────────────────────────────────
{
  // A map that does not close gives one mood two colours depending on the
  // route taken to it.
  near(hueFor(0), hueFor(360), 1e-9, 'the hue map closes after a full turn');
  eq(hueFor(-1) >= 0 && hueFor(-1) < 360, true, 'a negative angle still lands inside the wheel');
  near(hueFor(0), HUE_AT_ZERO, 1e-9, 'angle zero is the anchor hue');

  const band = (v, e) => moodColour(v, e, 1).h;
  near(hueGap(band(3.5, 3.5), 55), 0, 6, 'delighted + charged is gold');
  near(hueGap(band(0.5, 3.5), 325), 0, 6, 'bleak + charged is magenta-red');
  near(hueGap(band(0.5, 0.5), 235), 0, 6, 'bleak + becalmed is indigo');
  near(hueGap(band(3.5, 0.5), 145), 0, 6, 'delighted + becalmed is green');

  eq(circumplex(2, 2).intensity, 0, 'dead centre has no intensity');
  ok(circumplex(4, 4).intensity === 1, 'a corner saturates at one, never above');
  ok(moodColour(2, 2, 1).s < moodColour(4, 4, 1).s, 'a flat post is less saturated than an extreme one');
  ok(moodColour(2, 2, 1).s > 0, 'but never colourless — a flat post is muted, not a hole in the ring');

  // Confidence is the haze, and it has to be VISIBLE or it is not honest.
  const sure = moodColour(3.5, 3.5, 0.98), unsure = moodColour(3.5, 3.5, 0.32);
  ok(unsure.a < sure.a, 'a reading jev was unsure of is hazier');
  ok(sure.a - unsure.a > 0.3, 'and visibly so, not by a rounding error');
  eq(sure.h, unsure.h, 'confidence changes the haze and never the hue');
}

// ── 3. THE AVERAGING TRAP ────────────────────────────────────────────────────
{
  // Half furious, half serene. Their HUES average to indigo — melancholy —
  // which is a mood neither post had, reported with a straight face.
  const furious = { answered: true, valence: 0.5, energy: 3.5, confidence: 0.9 };
  const serene = { answered: true, valence: 3.5, energy: 0.5, confidence: 0.9 };
  const hFurious = moodColour(furious.valence, furious.energy).h;
  const hSerene = moodColour(serene.valence, serene.energy).h;
  const naive = Math.round((hFurious + hSerene) / 2);
  near(hueGap(naive, 235), 0, 12, 'the naive hue mean really does land on indigo (the bug being prevented)');

  const agg = aggregate([furious, serene]);
  near(agg.valence, 2, 0.001, 'averaging on the PLANE puts them at neutral valence');
  near(agg.energy, 2, 0.001, 'and neutral energy');
  near(agg.intensity, 0, 0.001, 'so the stone has no intensity — "no coherent mood"');
  ok(hueGap(agg.h, 235) > 60, 'and is emphatically NOT the indigo the hue mean invented');
  eq(moodName(agg.valence, agg.energy), 'even', 'and it is named "even" rather than given a diagnosis');

  // The spread is the only thing that can tell those two apart from ten flat
  // posts, which share their stone exactly.
  const flat = Array.from({ length: 10 }, () => ({ answered: true, valence: 2, energy: 2, confidence: 0.9 }));
  const wild = [furious, serene, furious, serene];
  near(aggregate(flat).intensity, aggregate(wild).intensity, 0.05, 'ten flat posts and a torn ring share a stone');
  ok(spread(wild) > spread(flat) + 0.5, 'and only the spread tells them apart');
  eq(spread([furious]), 0, 'one reading has no spread');
}

// ── 4. weighting, and refusing to divide by zero ─────────────────────────────
{
  const sure = { answered: true, valence: 4, energy: 4, confidence: 1 };
  const guess = { answered: true, valence: 0, energy: 0, confidence: 0 };
  const agg = aggregate([sure, guess]);
  ok(agg.valence > 2, 'a confident reading pulls the stone harder than a coin-flip one');
  ok(agg.valence < 4, 'but an unconfident one is not discarded either');

  const none = aggregate([{ answered: false }, { answered: false }]);
  eq(none.n, 0, 'a ring of unreadable posts reports zero readings');
  eq(none.confidence, 0, 'at zero confidence');
  ok(Number.isFinite(none.h), 'and still yields a drawable colour rather than NaN');
  eq(aggregate([]).n, 0, 'an empty ring does not throw');
  eq(spread([]), 0, 'nor does its spread');
}

// ── 5. reading jev's answers, including when they are missing ────────────────
{
  const posts = [{ text: 'a', uri: 'at://x/1' }, { text: 'b', uri: 'at://x/2' }, { text: 'c', uri: 'at://x/3' }];
  const answers = {
    valence_0: { score: 3.97, confidence: 0.98 }, energy_0: { score: 2.4, confidence: 0.9 },
    flavour_0: { choice: 'funny', confidence: 0.67 },
    valence_1: { score: 1.2, confidence: 0.4 }, energy_1: { score: 0.8, confidence: 0.5 },
    flavour_1: { choice: 'bleak', confidence: 0.3 },
    // post 2: the model returned nothing at all for it
  };
  const moods = readMoods(answers, posts);
  eq(moods.length, 3, 'one reading per post, always');
  eq(moods[0].answered, true, 'a full answer is marked answered');
  near(moods[0].confidence, 0.94, 0.001, 'the haze is the mean of the two axes that make the colour');
  eq(moods[0].flavourConfidence, 0.67, 'the flavour keeps its own confidence, separately');
  eq(moods[2].answered, false, 'a missing answer is marked unanswered');
  eq(moods[2].valence, 2, 'and falls to dead centre');
  eq(moods[2].confidence, 0, 'at zero confidence, so it is drawn as a ghost and not as calm');
  eq(moods[2].flavour, null, 'with no flavour invented for it');
  eq(aggregate(moods).n, 2, 'and it is left out of the stone entirely');

  // Out-of-range answers must not escape into the colour maths.
  const wild = readMoods({ valence_0: { score: 99, confidence: 5 }, energy_0: { score: -4, confidence: -1 } }, [posts[0]]);
  eq(wild[0].valence, 4, 'a score above the top rung is clamped');
  eq(wild[0].energy, 0, 'and below the bottom one');
  ok(wild[0].confidence >= 0 && wild[0].confidence <= 1, 'confidence is clamped into 0..1');
}

// ── 6. the ring geometry ─────────────────────────────────────────────────────
{
  const segs = ringSegments(10);
  eq(segs.length, 10, 'ten segments');
  near(segs[0].mid, -72, 0.001, 'the newest post sits at the top of the ring');
  ok(segs[0].to < segs[1].from, 'and the segments do not touch — the gap is real');
  const span = segs[9].to - segs[0].from;
  ok(span < 360 && span > 350, 'the ring closes without overlapping itself');
  eq(ringSegments(1).length, 1, 'a one-post ring does not divide by zero');

  const d = arcPath(100, 100, 40, 60, -90, -45);
  ok(/^M[\d.]+ [\d.]+A60 60 0 0 1 /.test(d), 'an arc starts on the outer radius and sweeps forward');
  ok(d.endsWith('Z') && d.includes('A40 40 0 0 0'), 'and returns along the inner radius, closed');
  ok(!/NaN/.test(d), 'with no NaN in the path');
  ok(!/NaN/.test(arcPath(0, 0, 0, 1, 0, 359)), 'not even at a degenerate inner radius');
}

// ── 7. the tally, and the vocabulary itself ──────────────────────────────────
{
  const t = flavourTally([{ flavour: 'wry' }, { flavour: 'funny' }, { flavour: 'wry' }, { flavour: null }]);
  eq(t[0].flavour, 'wry', 'the commonest flavour leads');
  eq(t[0].n, 2, 'counted');
  eq(t.length, 2, 'and a post with no flavour is not a flavour');

  eq(VALENCE.length, ENERGY.length, 'both scales have the same number of rungs, so the plane is square');
  ok(VALENCE.length >= 2, 'a score needs at least two levels');
  eq(new Set(Object.keys(FLAVOURS)).size, Object.keys(FLAVOURS).length, 'no flavour is listed twice');
  ok(Object.keys(FLAVOURS).includes('plain'), 'there is a way to say "no tone here" without inventing one');
  for (const [k, v] of Object.entries(FLAVOURS)) ok(typeof v === 'string' && v.length > 3, `${k} is described for the model, not just named`);
  eq(N_POSTS, 10, 'ten posts, as asked');
}

if (failures) { console.error(`\n✗ ${failures} failure(s)`); process.exit(1); }
console.log('✓ mood selftest passed');
