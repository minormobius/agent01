// lab.selftest.mjs — the paper book and the metric layer.
//
// Most of this file exists to stop the lab flattering itself. A trading demo
// goes wrong in exactly four ways — free trading, a missing control, a
// mark-to-market that peeks, and a headline with no error bar — so each one
// is pinned here.
//
//   node mega/jev/test/lab.selftest.mjs

import { newBook, step, summary, pct, targetPosition, changeCost, ACTIONS } from '../lab/book.mjs';
import { newRing, push, compute, returnsBps, stateDoc, RING } from '../lab/metrics.mjs';
import { fold, newState, drain } from '../lab/feed.mjs';
import { decide, buildQuestions, GATE, ACTION_CRITERIA } from '../lab/ask.mjs';

let passed = 0;
const failures = [];
const ok = (c, l) => { c ? passed++ : failures.push(l); };
const near = (a, b, eps, l) => ok(Number.isFinite(a) && Math.abs(a - b) < eps, `${l} (got ${a}, want ~${b})`);

// --------------------------------------------------------------- actions ---
ok(targetPosition('buy', 0) === 1 && targetPosition('sell', 0) === -1, 'buy is long, sell is short');
ok(targetPosition('bail', -1) === 0, 'bail goes flat from either side');
ok(targetPosition('hold', -1) === -1 && targetPosition('hold', 1) === 1, 'hold keeps whatever it was');
ok(targetPosition('nonsense', 1) === 1, 'an action outside the set changes nothing');
ok(ACTIONS.length === 4, 'four actions');

// ----------------------------------------------------------------- costs ---
{
  const b = newBook();
  ok(changeCost(b, 0, 0, 10) === 0, 'not moving is free');
  near(changeCost(b, 0, 1, 0) * 1e4, 4.5, 1e-9, 'a one-way fill pays the taker fee');
  near(changeCost(b, 0, 1, 10) * 1e4, 9.5, 1e-9, 'and half the spread on top');
  near(changeCost(b, -1, 1, 10) * 1e4, 19.0, 1e-9, 'a flip pays for two units of size');
  const free = newBook({ costs: { feeBps: 0, payHalfSpread: false } });
  ok(changeCost(free, 0, 1, 100) === 0, 'costs are configurable, including to zero');
}
{
  // THE test: churning must lose money in a flat market. A demo where it
  // does not is a demo with the costs left out.
  const b = newBook();
  const flip = ['buy', 'sell'];
  for (let i = 0; i < 60; i++) step(b, { px: 77000, spreadBps: 2, action: flip[i % 2] });
  ok(pct(b.jev) < -2, `flipping 60 times in a dead flat market bleeds (got ${pct(b.jev).toFixed(2)}%)`);
  ok(b.jev.costPaid > 0 && b.jev.fills === 60, 'every flip is a charged fill');
  // Buy-and-hold is not free either: it pays one entry (4.5bp fee + 1bp half
  // spread) and then nothing, which is exactly the point of having it.
  near(pct(b.hold), -0.055, 1e-6, 'buy-and-hold pays exactly one entry in a flat market');
  ok(b.hold.fills === 1, 'and never fills again');
}

// --------------------------------------------------- mark to market timing ---
{
  // A position taken at this tick must NOT earn this tick's move. Getting
  // this wrong is the most flattering bug available.
  const b = newBook({ costs: { feeBps: 0, payHalfSpread: false } });
  step(b, { px: 100, action: 'hold' });     // flat, establishes the price
  step(b, { px: 110, action: 'buy' });      // decides to go long AS it jumps
  near(pct(b.jev), 0, 1e-9, 'going long on the tick that jumped earns nothing from that jump');
  step(b, { px: 121, action: 'hold' });
  near(pct(b.jev), 10, 1e-6, 'and earns the NEXT move in full');
}
{
  const b = newBook({ costs: { feeBps: 0, payHalfSpread: false } });
  step(b, { px: 100, action: 'sell' });
  step(b, { px: 90, action: 'hold' });
  near(pct(b.jev), 10, 1e-6, 'short earns when the price falls');
  near(pct(b.hold), -10, 1e-6, 'and buy-and-hold loses the same move');
}

// ------------------------------------------------------------ the control ---
{
  // The random leg must trade exactly as often as Jev — otherwise the
  // comparison measures trading frequency, not decision quality.
  const b = newBook({ seed: 5 });
  for (let i = 0; i < 200; i++) {
    step(b, { px: 77000 + Math.sin(i / 7) * 60, spreadBps: 1, action: ACTIONS[i % 4] });
  }
  ok(b.rand.fills > 0, 'the random control actually trades');
  ok(Math.abs(b.rand.fills - b.jev.fills) < b.jev.fills, 'at a comparable frequency, not a token one');
  ok(b.hold.fills === 1, 'buy-and-hold fills exactly once, at the start');
  ok(b.hold.pos === 1, 'and stays long');
}
{
  // Ticks with no decision must still move every leg's equity.
  const b = newBook({ costs: { feeBps: 0, payHalfSpread: false } });
  step(b, { px: 100, action: 'buy' });
  for (let i = 0; i < 5; i++) step(b, { px: 100 * 1.01 ** (i + 1), action: null });
  ok(pct(b.jev) > 4, 'a position earns on ticks where no decision was taken');
  ok(b.decisions === 1 && b.history.length === 1, 'but only decisions are recorded as rows');
}
{
  const b = newBook();
  ok(step(b, { px: 0 }) === null && step(b, { px: NaN }) === null, 'a bad price is refused, not propagated');
  ok(b.ticks === 0, 'and does not advance the clock');
}

// ----------------------------------------------------- the honest headline ---
{
  const b = newBook();
  for (let i = 0; i < 10; i++) step(b, { px: 77000 + i, action: 'hold' });
  ok(summary(b).verdict === 'too few decisions to say anything', 'a short run refuses to draw a conclusion');
}
{
  // A tiny edge over a noisy run must NOT be reported as a result.
  const b = newBook({ costs: { feeBps: 0, payHalfSpread: false }, seed: 11 });
  let px = 77000;
  for (let i = 0; i < 300; i++) {
    px *= 1 + (Math.sin(i * 12.9898) * 43758.5453 % 1) * 0.0004 - 0.0002;
    step(b, { px, action: ACTIONS[i % 4] });
  }
  const s = summary(b);
  ok(Number.isFinite(s.tStat), 't is computed');
  ok(s.verdict.includes('indistinguishable') || s.verdict.includes('than random'),
    'a long run gets a verdict drawn from t, not from the raw curve');
  ok(Math.abs(s.tStat) < 2 ? s.verdict === 'indistinguishable from random' : true,
    'and below |t| = 2 it says so in as many words');
}

// --------------------------------------------------------------- metrics ---
{
  const r = newRing(10);
  for (let i = 0; i < 25; i++) push(r, { mid: 100 + i });
  ok(r.buf.length === 10, 'the ring stays bounded');
  ok(r.buf[r.buf.length - 1].mid === 124, 'and keeps the newest');
  ok(RING === 300, 'five minutes of one-second ticks by default');
}
ok(compute(newRing()) === null, 'with no history, compute returns null rather than a confident zero');
{
  const r = newRing();
  for (let i = 0; i < 19; i++) push(r, { mid: 100 });
  ok(compute(r) === null, 'and still refuses just below the threshold');
}
{
  const rets = returnsBps([{ mid: 100 }, { mid: 101 }, { mid: 100 }]);
  ok(rets.length === 2 && rets[0] > 0 && rets[1] < 0, 'returns are signed and one shorter than the ticks');
  ok(returnsBps([{ mid: 0 }, { mid: 100 }]).length === 0, 'a zero price is skipped, not turned into Infinity');
}
{
  // A clean ramp is maximally efficient; a sawtooth that ends where it began
  // is not. This is the regime number, so it has to be right.
  const up = newRing(); for (let i = 0; i < 80; i++) push(up, { mid: 77000 + i * 5, spreadBps: 1 });
  const chop = newRing(); for (let i = 0; i < 80; i++) push(chop, { mid: 77000 + (i % 2) * 5, spreadBps: 1 });
  const mu = compute(up), mc = compute(chop);
  ok(mu.w60_efficiency > 0.95, `a straight ramp is efficient (${mu.w60_efficiency.toFixed(3)})`);
  ok(mc.w60_efficiency < 0.1, `a sawtooth is not (${mc.w60_efficiency.toFixed(3)})`);
  ok(mu.w60_upFrac === 1, 'every bar up on the ramp');
  ok(mu.w60_volBps < mc.w60_volBps, 'and the chop is the more volatile of the two');
}
{
  const r = newRing();
  for (let i = 0; i < 80; i++) push(r, { mid: 77000, mark: 77010, oracle: 77000, spreadBps: 2, funding: 0.00001,
    bookImbalance: 1.4, buyVol: 3, sellVol: 1 });
  const m = compute(r);
  near(m.markVsOracleBps, 1.298, 0.01, 'mark-vs-oracle is in basis points');
  near(m.fundingBps, 0.1, 1e-9, 'funding is converted to bp, not left as a raw fraction');
  near(m.w60_takerSkew, 0.5, 1e-9, 'taker skew is signed and normalised');
  const doc = stateDoc(m, 1, { jev: { equity: 1.01 }, decisions: 7 });
  ok(doc.includes('LONG') && doc.includes('last  15s'), 'the state document names the position and the windows');
  ok(!/\d{5}\.\d,\s*\d{5}/.test(doc), 'and carries no raw price series — numbers only');
  ok(doc.includes('EFFICIENCY is'), 'it defines its own unfamiliar terms rather than assuming them');
}

// ------------------------------------------------------------ the feed ----
{
  const s = newState();
  fold(s, { channel: 'l2Book', data: { levels: [
    [{ px: '77400', sz: '1' }, { px: '77399', sz: '2' }],
    [{ px: '77404', sz: '0.5' }, { px: '77405', sz: '0.5' }]] } });
  near(s.spreadBps, 0.5168, 0.01, 'spread is computed in bp off the top of book');
  near(s.bookImbalance, 3, 1e-9, 'book imbalance is resting bid size over ask size');
  fold(s, { channel: 'l2Book', data: { levels: [[{ px: '0', sz: '1' }], [{ px: '1', sz: '1' }]] } });
  near(s.spreadBps, 0.5168, 0.01, 'a nonsense book is ignored rather than overwriting good state');
}
{
  const s = newState();
  fold(s, { channel: 'trades', data: [{ side: 'B', sz: '3' }, { side: 'A', sz: '1' }, { side: 'B', sz: '1' }] });
  ok(s.buyVol === 4 && s.sellVol === 1, 'aggressor volume is split by side');
  ok(s.beat === false, 'trades alone do not produce a tick');
  fold(s, { channel: 'activeAssetCtx', data: { ctx: { midPx: '77402', markPx: '77403', oraclePx: '77400',
    funding: '0.00001', premium: '-0.0003', openInterest: '35000' } } });
  ok(s.beat === true, 'the context channel is the heartbeat');
  const tick = drain(s);
  ok(tick.mid === 77402 && tick.buyVol === 4, 'the tick samples the heartbeat and the accumulated flow');
  ok(s.buyVol === 0 && s.sellVol === 0 && s.beat === false,
    'and the accumulators reset, so a tick is one second of flow rather than a running total');
}
{
  const s = newState();
  ok(fold(s, null) === s && fold(s, { nope: 1 }) === s, 'junk messages are survivable');
}

// ------------------------------------------------ the gate and the latch ---
{
  const full = { action: { choice: 'buy', confidence: 0.9 }, have_figures: { noul: 0.97 },
    have_decidable: { noul: 0.24 }, regime: { choice: 'trending_up', confidence: 0.8 } };
  ok(decide(full, 0).action === 'buy', 'a supported, confident buy is taken');

  // THE regression: a confident action whose state is absent must not act.
  // This is the 15/15 case that a plain confidence gate got wrong.
  const absent = { ...full, have_figures: { noul: 0.11 } };
  const d = decide(absent, 0);
  ok(d.action === 'hold' && d.blocked, 'a CONFIDENT action on an insufficient state is refused');
  ok(/insufficient/.test(d.reason), 'and says so');
  ok(full.action.confidence > GATE.enter, 'the refused case would have cleared the confidence bar — the point');

  ok(decide({ ...full, have_figures: undefined }, 0).blocked, 'a missing self-check blocks rather than defaulting to trust');
  ok(decide({ ...full, have_figures: undefined, have_state: { noul: 0.97 } }, 0).action === 'buy',
    'the older single-self-check shape still routes, so a recorded run does not silently change meaning');
  ok(decide(full, 0).decidable === 0.24,
    'the decidability number is carried through even when it does not gate — it is for showing, not hiding');
  ok(decide({}, 0).blocked, 'so does a missing answer');
}
{
  // Hysteresis: the bar to open is higher than the bar to stay.
  const at = (c) => ({ action: { choice: 'buy', confidence: c }, have_figures: { noul: 0.95 } });
  ok(decide(at(0.5), 0).action === 'hold', 'a lukewarm buy does not open a position');
  ok(decide(at(0.5), 1).action === 'buy', 'but does keep one already held');
  ok(decide(at(0.3), 1).action === 'hold', 'and a cold one lets it go to the hold path');
  ok(decide(at(0.9), 0, { ...GATE, enter: 0.95 }).action === 'hold', 'the bar is a parameter, not a constant');
  ok(GATE.enter > GATE.exit, 'the enter bar is above the exit bar, which is what stops dithering');
  const bail = { action: { choice: 'bail', confidence: 0.2 }, have_figures: { noul: 0.95 } };
  ok(decide(bail, 1).action === 'bail', 'bail is never blocked by the confidence bar — getting out stays cheap');
}
{
  const q = buildQuestions();
  // The SET must match what the book can execute; the order need not, and
  // deliberately does not — option order was measured to move the answer by
  // 0.000, so these are grouped for a reader instead.
  ok(q.action.type === 'choice' &&
    [...Object.keys(q.action.criteria)].sort().join() === [...ACTIONS].sort().join(),
    'the action question offers exactly the four the book can execute');
  ok(q.regime.type === 'choice' && /already happened/.test(q.regime.instructions),
    'the regime question is explicitly about the past');
  ok(!JSON.stringify(q).match(/will |predict the price|going to/),
    'nothing asks the model to forecast a price');
  // The framing is load-bearing, not cosmetic: asked what the position
  // SHOULD DO it answered hold 5/5 at 0.46-0.79; asked which stance MATCHES
  // the tape it answered sell 5/5 at 0.70-0.96 on the identical states.
  ok(/observably doing right now/.test(q.action.instructions),
    'the action question asks what the tape IS doing, not what to do about it');
  ok(/not a forecast/.test(q.action.instructions), 'and says so');
  ok(Object.values(ACTION_CRITERIA).every((v) => /observ|Nothing observable/.test(v)),
    'every option is described by what is observable, not by what it predicts');
  ok(!/worth paying for|worth its cost/.test(q.action.instructions),
    'the model is not asked to weigh the cost — that is the harness\'s job');
  ok(/AVAILABILITY/.test(q.have_figures.instructions), 'the gating self-check asks about availability');
  ok(/AVAILABILITY/.test(q.have_decidable.instructions), 'so does the honest one');
  ok(q.have_figures.instructions !== q.have_decidable.instructions,
    'and they are different questions — 0.84 against 0.24 on the same state, which is the finding');
  ok(/spread|volatility|efficiency/.test(q.have_figures.instructions),
    'the gating one names the figures it is asking about the presence of');
}

if (failures.length) {
  console.error(`✗ lab selftest: ${failures.length} failure(s) of ${passed + failures.length} checks\n`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`✓ lab selftest: ${passed} checks passed`);
