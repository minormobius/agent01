// lab.selftest.mjs — the paper book and the metric layer.
//
// Most of this file exists to stop the lab flattering itself. A trading demo
// goes wrong in exactly four ways — free trading, a missing control, a
// mark-to-market that peeks, and a headline with no error bar — so each one
// is pinned here.
//
//   node mega/jev/test/lab.selftest.mjs

import { newBook, step, summary, pct, targetPosition, changeCost, ACTIONS,
  LADDER, exposureFromScore, applyDeadband } from '../lab/book.mjs';
import { newRing, push, compute, returnsBps, stateDoc, RING } from '../lab/metrics.mjs';
import { fold, newState, drain, replay } from '../lab/feed.mjs';
import { toCandles, isUp, extent, BUCKET_MS } from '../lab/candles.mjs';
import { ORACLES, readOracles, majorityTarget, bestOracleTarget, oracleDoc, oracleCriteria, T } from '../lab/oracles.mjs';
import * as B from '../lab/streamb.mjs';
import { decide, buildQuestions, GATE, ACTION_CRITERIA, EXPOSURE_LEVELS } from '../lab/ask.mjs';

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const fix = (n) => JSON.parse(readFileSync(join(here, '..', 'lab', 'fixtures', n), 'utf8'));

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
  ok(/indistinguishable|random|rules/.test(s.verdict),
    'a long run gets a verdict drawn from t, not from the raw curve');
  // With no oracles running, the majority leg never moves, so the verdict
  // falls back to the random comparison and must still say when it is null.
  ok(Math.abs(s.tStat) < 2 ? /indistinguishable/.test(s.verdict) : true,
    'and below |t| = 2 it says so in as many words');
  ok(Number.isFinite(s.tStatVsMajority), 'the comparison against averaging the rules is always computed');
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
  ok(full.action.confidence > 0.8,
    'the refused case was a high-confidence answer — which is exactly the 15/15 case a confidence gate got wrong');

  ok(decide({ ...full, have_figures: undefined }, 0).blocked, 'a missing self-check blocks rather than defaulting to trust');
  ok(decide({ ...full, have_figures: undefined, have_state: { noul: 0.97 } }, 0).action === 'buy',
    'the older single-self-check shape still routes, so a recorded run does not silently change meaning');
  ok(decide(full, 0).decidable === 0.24,
    'the decidability number is carried through even when it does not gate — it is for showing, not hiding');
  ok(decide({}, 0).blocked, 'so does a missing answer');
}
{
  // The deadband replaced the confidence latch when the target went
  // continuous. Same job — stop paying for noise — measured in exposure
  // rather than in confidence.
  const at = (score) => ({ exposure: { score, confidence: 0.7 }, have_figures: { noul: 0.95 } });
  const LG = { response: { deadZone: 0, floor: 0 } };
  ok(decide(at(3.2), 0, LG).action === 'hold', 'a target a hair off flat does not open a position');
  ok(decide(at(4.5), 0, LG).exposure === 1.5, 'a target well clear of it does');
  ok(decide(at(4.6), 1.5, LG).action === 'hold', 'and a small drift from an existing position is ignored');
  ok(decide(at(3), 1.5, LG).exposure === 0, 'but the flat rung always gets out, deadband or not');
  ok(GATE.deadband > 0, 'there is a deadband at all, which is what stops the resize dithering');
  ok(decide(at(4.6), 1.5, { ...LG, deadband: 0 }).exposure === 1.6,
    'and it is a parameter, not a constant');
  ok(Number.isInteger(decide(at(4.6), 0, LG).exposure * 100),
    'the target is rounded to 0.01x, so float dust cannot trip the deadband or litter the log');

  // A blocked-by-deadband decision is still reported as blocked, so the page
  // can show how often the harness is declining to act on a real read.
  ok(decide(at(4.6), 1.5, LG).blocked === true, 'a deadband hold is reported as blocked, not as a free hold');
  ok(decide(at(4.5), 1.5, LG).blocked === false, 'and an exact match is not');
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

// ------------------------------------------------------- the exposure ladder ---
{
  ok(LADDER.length === 7 && LADDER[0] === -3 && LADDER[6] === 3 && LADDER[3] === 0,
    'the ladder is symmetric with flat in the middle');
  ok(EXPOSURE_LEVELS.length === LADDER.length, 'one written level per rung');
  ok(EXPOSURE_LEVELS.every((d, i) => i === 0 || d !== EXPOSURE_LEVELS[i - 1]), 'and no duplicates');

  // The ladder is discrete, the output is continuous: that is the whole
  // reason `score` was chosen over `choice` here. LIN is the original plain
  // interpolation, kept as the control the response shape is measured against.
  const LIN = { deadZone: 0, floor: 0 };
  near(exposureFromScore(0, 3, LIN), -3, 1e-9, 'level 0 is max short');
  near(exposureFromScore(3, 3, LIN), 0, 1e-9, 'the middle rung is flat');
  near(exposureFromScore(6, 3, LIN), 3, 1e-9, 'the top rung is max long');
  near(exposureFromScore(1.28, 3, LIN), -1.72, 1e-9, 'a fractional score interpolates — the continuum');
  near(exposureFromScore(4.5, 3, LIN), 1.5, 1e-9, 'and does so on the long side too');

  // The type is what enforces the ceiling. Nothing off the end gets through.
  near(exposureFromScore(99, 3, LIN), 3, 1e-9, 'a score past the top of the ladder cannot exceed the cap');
  near(exposureFromScore(-99, 3, LIN), -3, 1e-9, 'nor past the bottom');
  near(exposureFromScore(6, 1, LIN), 1, 1e-9, 'and a lower cap clamps the whole ladder');
  near(exposureFromScore(99), 3, 1e-9, 'the cap holds under the commit response too');
  ok(exposureFromScore(NaN) === 0 && exposureFromScore(undefined) === 0, 'a missing score is flat, never a guess');

  // The commit response: a dead zone, then never a position too small to pay
  // for its own round trip.
  const R = { deadZone: 0.25, floor: 0.6 };
  // THE bug this shape was nearly shipped with: a dead zone that returns 0
  // forces an exit, and exits are exempt from the deadband, so the setting
  // meant to cut turnover doubles it. "No view" must mean "keep what you
  // have", which is what null says.
  ok(exposureFromScore(3, 3, R) === null, 'dead centre is NO VIEW, not a view that flat is right');
  ok(exposureFromScore(3.6, 3, R) === null, 'and so is a weak view inside the dead zone');
  ok(exposureFromScore(3, 3, LIN) === 0, 'while under the linear control the middle rung really is flat');
  ok(exposureFromScore(4.0, 3, R) >= 3 * 0.6,
    'the first position it DOES take is already past the floor, not a token size');
  near(exposureFromScore(6, 3, R), 3, 1e-9, 'and a maximal view is still the full cap');
  ok(exposureFromScore(2.0, 3, R) <= -3 * 0.6, 'symmetric on the short side');
  ok(exposureFromScore(4.2, 3, R) < exposureFromScore(5.4, 3, R),
    'past the dead zone it still grades rather than being a pure step');
  ok(exposureFromScore(4.0, 3, R) > exposureFromScore(4.0, 3, LIN),
    'and the same score commits harder than the linear mapping did — the point');
}
{
  // and the caller must honour it: a dead-zone read keeps the position.
  const R = { deadZone: 0.25, floor: 0.6 };
  const at = (score) => ({ exposure: { score, confidence: 0.7 }, have_figures: { noul: 0.95 } });
  const d = decide(at(3.4), 2.4, { response: R });
  ok(d.exposure === 2.4 && d.action === 'hold', 'a dead-zone read holds the position it already had');
  ok(/dead zone/.test(d.reason), 'and says so');
  ok(d.blocked === false, 'this is a decision to hold, not a gate refusing to act');
  ok(decide(at(3.4), 0, { response: R }).exposure === 0, 'from flat, a dead-zone read stays flat');
  ok(decide(at(5.5), 2.4, { response: R, deadband: 0 }).exposure > 2.4,
    'while a conviction outside the zone still moves it');
}
{
  ok(applyDeadband(-1.72, -1.7, 0.35) === -1.7, 'a target inside the deadband does not move the book');
  ok(applyDeadband(-1.72, 0, 0.35) === -1.72, 'a target outside it does');
  ok(applyDeadband(0, -0.1, 0.35) === 0, 'going flat is exempt — getting out stays cheap');
  ok(applyDeadband(2, 1.8, 0) === 2, 'a zero deadband moves on anything');
}

// ------------------------------------------------------- leverage and ruin ---
{
  // Exposure scales the return, and the cost scales with the SIZE of the
  // change, so 0 → 3x costs three times what 0 → 1x does.
  const b = newBook({ costs: { feeBps: 10, payHalfSpread: false } });
  near(changeCost(b, 0, 3, 0) * 1e4, 30, 1e-9, 'a three-unit move pays three units of fee');
  near(changeCost(b, -3, 3, 0) * 1e4, 60, 1e-9, 'and a full flip pays six');
}
{
  const b = newBook({ costs: { feeBps: 0, payHalfSpread: false } });
  step(b, { px: 100, exposure: 3, action: 'buy' });
  step(b, { px: 101, action: null });
  near(pct(b.jev), 3, 1e-6, '3x earns three times the move');
  near(pct(b.hold), 1, 1e-6, 'while buy-and-hold stays unlevered at 1x');
}
{
  // Ruin, which is the thing leverage actually introduces. A demo that
  // cannot be liquidated is lying about what leverage is.
  const b = newBook({ costs: { feeBps: 0, payHalfSpread: false } });
  step(b, { px: 100, exposure: 3, action: 'buy' });
  step(b, { px: 60, action: null });                 // a 40% drop at 3x
  ok(b.jev.liquidated, 'a move past the account is a liquidation');
  ok(b.jev.equity === 0 && pct(b.jev) === -100, 'equity stops at zero rather than going negative');
  ok(b.jev.pos === 0, 'and the position is forced flat');
  step(b, { px: 120, exposure: 3, action: 'buy' });
  ok(b.jev.equity === 0 && b.jev.pos === 0, 'a liquidated leg cannot take a new position and cannot recover');
  ok(summary(b).verdict === 'liquidated — the run ended in ruin', 'and the verdict says so before anything else');
  ok(!b.hold.liquidated, 'the unlevered reference survives the same move');
}
{
  const b = newBook({ costs: { feeBps: 0, payHalfSpread: false } });
  step(b, { px: 100, exposure: 2, action: 'buy' });
  step(b, { px: 90, action: null });
  step(b, { px: 100, action: null });
  const s = summary(b);
  ok(s.maxDD > 15, `max drawdown is reported, and leverage makes it bigger (${s.maxDD.toFixed(1)}%)`);
  ok(s.maxDD > s.holdMaxDD, 'larger than the unlevered reference over the identical ticks');
  // Volatility drag, which is the other thing leverage does and the one
  // demos leave out: the price came back to exactly where it started and the
  // levered book did not. 100 → 90 → 100 at 2x compounds to -2.2%.
  near(s.jev, -2.22, 0.05, 'a levered round trip finishes DOWN on a price that finished flat');
  near(s.hold, 0, 1e-6, 'while the unlevered reference finishes where it started');
}
{
  // The cap is enforced by the book too, not only by the ladder.
  const b = newBook({ risk: { cap: 1 }, costs: { feeBps: 0, payHalfSpread: false } });
  step(b, { px: 100, exposure: 9, action: 'buy' });
  ok(b.jev.pos === 1, 'the book clamps an out-of-range exposure to its own cap');
}
{
  // The control must be leverage-matched, or the comparison measures size.
  const b = newBook({ seed: 3, costs: { feeBps: 0, payHalfSpread: false } });
  for (let i = 0; i < 120; i++) step(b, { px: 77000 + Math.sin(i / 5) * 40, exposure: (i % 7) - 3, action: 'buy' });
  ok(Math.abs(b.rand.pos) > 0 || b.rand.fills > 0, 'the random control trades the ladder as well');
  ok(b.rand.turnover > 0 && b.jev.turnover > 0, 'both legs carry real turnover');
  ok(Math.abs(b.rand.pos) <= 3, 'and stays inside the same cap');
}

// -------------------------------------------- deciding a continuous target ---
{
  const A = (score, have = 0.9) => ({ exposure: { score, confidence: 0.7 },
    have_figures: { noul: have }, have_decidable: { noul: 0.24 }, regime: { choice: 'ranging' } });
  const LINGATE = { response: { deadZone: 0, floor: 0 } };
  near(decide(A(1.28), 0, LINGATE).exposure, -1.72, 1e-9, 'the ladder score becomes the target exposure');
  ok(decide(A(1.28), 0, LINGATE).action === 'sell', 'and the mark reflects the direction of the change');
  ok(decide(A(5), -1).action === 'buy', 'increasing exposure marks as a buy whichever side it starts');
  ok(decide(A(3), -2, LINGATE).action === 'bail' && decide(A(3), -2, LINGATE).exposure === 0,
    'under the linear control the flat rung is a bail');
  ok(decide(A(3), -2).action === 'hold' && decide(A(3), -2).exposure === -2,
    'but with a dead zone the same score is no view, and the position stands');
  ok(decide(A(1.28), -1.72, LINGATE).action === 'hold', 'a target inside the deadband holds');

  // The gate still outranks everything, exactly as it does without leverage.
  const g = decide(A(0, 0.11), 2);
  ok(g.exposure === 2 && g.blocked, 'an insufficient state does NOT resize, however extreme the ladder reads');
  ok(/insufficient/.test(g.reason), 'and says why');
  ok(decide({ ...A(0), have_figures: undefined }, 1).exposure === 1, 'a missing self-check leaves the book alone');

  // Conviction must not be counted twice.
  const sure = { ...A(0), exposure: { score: 0, confidence: 0.99 } };
  const hedged = { ...A(0), exposure: { score: 0, confidence: 0.30 } };
  ok(decide(sure, 0).exposure === decide(hedged, 0).exposure,
    'the target is NOT scaled again by confidence — the score is already the expectation over the distribution');
}
{
  const q = buildQuestions();
  ok(q.exposure.type === 'score', 'exposure is asked as a score, not a choice');
  ok(Array.isArray(q.exposure.criteria) && q.exposure.criteria.length === 7,
    'with an ordered array of rungs, which is what makes it a ladder rather than a set');
  ok(/not a forecast/.test(q.exposure.instructions), 'and it is still a description, not a prediction');
}

// ------------------------------------------------------------- levels -----
// Everything above the level block is a RATE. These say WHERE, and without
// them a decision cannot tell selling into a five-minute low from selling
// into a five-minute high. Measured: 58.8% -> 93.8% on determinate probes.
{
  // A clean ramp: price ends at the top of every window, above every mean.
  const r = newRing();
  for (let i = 0; i < 120; i++) push(r, { mid: 77000 + i, spreadBps: 1 });
  const m = compute(r);
  ok(m.mid > m.sma60 && m.sma60 > m.sma300, 'on a ramp, price leads the fast mean which leads the slow one');
  ok(m.z60 > 1, `price is well above its own 60s mean in sd units (${m.z60.toFixed(2)})`);
  near(m.rangePos60, 1, 1e-9, 'and sits exactly at the top of the 60s range');
  ok(m.maSpreadBps > 0 && m.maSpreadZ > 0, 'the fast mean is above the slow one, in bp and in sd');
  near(m.offHighBps, 0, 1e-9, 'a new high means zero distance from the high');
  ok(m.offLowBps > 0, 'and a positive distance from the low');
  ok(m.secsSinceHigh === 0, 'the high was set on this very tick');
  ok(m.secsSinceLow > m.secsSinceHigh, 'and the low was set before it');
}
{
  const r = newRing();
  for (let i = 0; i < 120; i++) push(r, { mid: 77000 - i, spreadBps: 1 });
  const m = compute(r);
  ok(m.z60 < -1 && m.maSpreadBps < 0, 'the signs all invert on the way down');
  near(m.rangePos60, 0, 1e-9, 'and price sits at the bottom of the range');
  ok(m.secsSinceLow === 0 && m.secsSinceHigh > 0, 'with the low the fresher extreme');
}
{
  // A flat tape has no level information to give, and must not invent any.
  const r = newRing();
  for (let i = 0; i < 120; i++) push(r, { mid: 77000, spreadBps: 1 });
  const m = compute(r);
  near(m.z60, 0, 1e-9, 'a flat tape is zero deviations from its own mean, not NaN');
  near(m.rangePos60, 0.5, 1e-9, 'and its range position is the midpoint by convention, not a divide by zero');
  near(m.maSpreadBps, 0, 1e-9, 'with no gap between the means');
  ok(Number.isFinite(m.volPctile), 'and a finite volatility percentile');
}
{
  // Scale-freedom is the point of the sd forms: the same SHAPE at a
  // different price and a different volatility must read the same.
  const mk = (base, amp) => { const r = newRing();
    for (let i = 0; i < 120; i++) push(r, { mid: base + Math.sin(i / 9) * amp, spreadBps: 1 });
    return compute(r); };
  const a = mk(77000, 30), b = mk(3000, 30 * 3000 / 77000);
  near(a.z60, b.z60, 0.05, 'the same shape at a tenth the price gives the same z-score');
  near(a.rangePos60, b.rangePos60, 0.02, 'and the same range position');
  ok(Math.abs(a.maSpreadBps - b.maSpreadBps) < 0.5, 'bp forms are scale-free too');
}
{
  const quiet = newRing(); for (let i = 0; i < 120; i++) push(quiet, { mid: 77000 + (i % 2), spreadBps: 1 });
  const wild = newRing();
  for (let i = 0; i < 100; i++) push(wild, { mid: 77000 + (i % 2), spreadBps: 1 });
  for (let i = 0; i < 20; i++) push(wild, { mid: 77000 + (i % 2) * 90, spreadBps: 1 });
  ok(compute(wild).volPctile > compute(quiet).volPctile,
    'a tape that just turned wild ranks its own volatility higher than one that never did');
}

// --------------------------------------------- the state document, both ways ---
{
  const r = newRing();
  for (let i = 0; i < 120; i++) push(r, { mid: 77000 + i, spreadBps: 1, mark: 77000 + i, oracle: 77000 + i });
  const m = compute(r);
  const b = { jev: { equity: 1.01 }, decisions: 7 };
  const rich = stateDoc(m, -1.5, b);
  const thin = stateDoc(m, -1.5, b, { levels: false });

  ok(rich.includes('LEVELS'), 'the rich document has a level block');
  ok(!thin.includes('LEVELS'), 'and the control does not — it is the version the block was measured against');
  ok(rich.length > thin.length, 'so the rich one is longer');
  ok(thin.includes('RATES'), 'both carry the rates');
  ok(/standard deviations/.test(rich), 'the bands are stated in sd, not raw price');
  ok(/0 = the low, 1 = the high/.test(rich), 'and the range position defines its own ends');
  ok(/percentile/.test(rich) && (rich.match(/volatility right now/g) || []).length === 1,
    'volatility is stated ONCE — two views of one fact cost 12 points on a probe');
  ok(/SHORT 1.50x/.test(rich), 'the document states the levered position, not just a direction');
  ok(!/\d{5}\.\d,\s*\d{5}/.test(rich), 'and still carries no price series');
}

// ------------------------------------------------------------- candles ----
{
  const mk = (t, mid) => ({ t, mid });
  const ticks = [
    mk(10_000, 100), mk(11_000, 104), mk(12_000, 98), mk(13_000, 102), mk(14_000, 101),
    mk(15_000, 101), mk(16_000, 99), mk(17_000, 97), mk(18_000, 95), mk(19_000, 96),
  ];
  const cs = toCandles(ticks, 5000);
  ok(cs.length === 2, 'ten one-second ticks make two five-second candles');
  const [a, b] = cs;
  ok(a.o === 100 && a.c === 101 && a.h === 104 && a.l === 98, 'open, close, high and low are the right four numbers');
  ok(a.n === 5 && b.n === 5, 'and each carries how many ticks went into it');
  ok(isUp(a) && !isUp(b), 'up and down are decided by close against open');
  ok(a.t0 === 10_000 && b.t0 === 15_000, 'buckets are aligned to absolute time, not to the first tick');
}
{
  // Alignment is what stops candles sliding sideways as ticks arrive.
  const base = Array.from({ length: 12 }, (_, i) => ({ t: 20_000 + i * 1000, mid: 100 + i }));
  const first = toCandles(base, 5000);
  const later = toCandles([{ t: 17_000, mid: 90 }, ...base], 5000);
  const same = later.filter((c) => c.t0 >= 20_000);
  ok(JSON.stringify(same) === JSON.stringify(first),
    'an earlier tick arriving does not shift the candles that follow it');
}
{
  ok(toCandles([], 5000).length === 0 && toCandles(null).length === 0, 'no ticks, no candles');
  ok(toCandles([{ t: 1000, mid: 0 }, { t: 1000, mid: NaN }], 5000).length === 0,
    'a bad price never opens a candle');
  ok(toCandles([{ t: 1000, mid: 5 }], 0).length === 0, 'a zero bucket is refused rather than looping');
  const one = toCandles([{ t: 1000, mid: 7 }], 5000);
  ok(one.length === 1 && one[0].o === 7 && one[0].h === 7 && one[0].l === 7 && one[0].c === 7,
    'a single tick is a doji — all four prices equal, not a crash');
  ok(isUp(one[0]), 'and counts as up rather than being undefined');
}
{
  const cs = toCandles([{ t: 0, mid: 10 }, { t: 1000, mid: 30 }, { t: 6000, mid: 5 }], 5000);
  const e = extent(cs);
  ok(e.lo === 5 && e.hi === 30, 'the extent spans every wick, not just the closes');
  ok(extent([]) === null, 'and an empty set has no extent rather than an infinite one');
  ok(BUCKET_MS === 5000, 'five-second candles by default');
}
{
  // Real tape, real shape.
  const { ticks: real } = fix('btc-ticks.json');
  const cs = toCandles(real, 5000);
  ok(cs.length > 30, `the recorded tape makes a usable number of candles (${cs.length})`);
  ok(cs.every((c) => c.h >= Math.max(c.o, c.c) && c.l <= Math.min(c.o, c.c)),
    'every candle body sits inside its own wick');
  ok(cs.every((c) => c.n > 0), 'and no candle is empty');
}

// ------------------------------------------------------- replay stamping ---
{
  // The tape is one-second data and its stamps must say so however fast it
  // is played. Stamping with Date.now() folded 180 ticks into three candles.
  const tape = Array.from({ length: 12 }, (_, i) => ({ mid: 100 + i, t: 999 }));
  const got = [];
  const h = replay(tape, { onTick: (k) => got.push(k), speed: 1000 });
  await new Promise((r) => setTimeout(r, 120));
  h.stop();
  ok(got.length >= 6, `the tape plays fast when asked (${got.length} ticks in 120ms)`);
  const gaps = got.slice(1).map((k, i) => k.t - got[i].t);
  ok(gaps.every((g) => g === 1000), 'yet every stamp is exactly one second after the last');
  ok(toCandles(got, 5000).length >= 2, 'so the candles come out right regardless of playback speed');
  ok(got[0].mid === 100 && got[1].mid === 101, 'and the prices are the tape\'s own, in order');
}

// ------------------------------------------------------------- oracles ----
{
  const { ticks: real } = fix('btc-ticks.json');
  const r = newRing(); for (const k of real) push(r, k);
  const m = compute(r);
  const reads = readOracles(m, 3);
  ok(reads.length === ORACLES.length, 'every rule reports');
  ok(reads.every((x) => Math.abs(x.target) <= 3), 'and none can exceed the cap it was given');
  ok(reads.every((x) => ['long', 'short', 'flat'].includes(x.side)), 'each takes a side or declines to');
  ok(new Set(reads.map((x) => x.side)).size > 1,
    'on the real tape they DISAGREE — which is the whole reason to ask which one fits');
  ok(reads.every((x) => x.says.length > 10), 'each says why in words Jev can read');
  ok(readOracles(null).length === 0, 'no metrics, no readings — never a default view');
}
{
  // The rules must be rules: same input, same output, always.
  const r = newRing(); for (let i = 0; i < 120; i++) push(r, { mid: 77000 + i, spreadBps: 1, funding: 0.00001 });
  const m = compute(r);
  ok(JSON.stringify(readOracles(m, 3)) === JSON.stringify(readOracles(m, 3)), 'deterministic');
  const up = readOracles(m, 3);
  ok(up.find((x) => x.id === 'ma_cross').side === 'long', 'a clean ramp is long on the cross');
  ok(up.find((x) => x.id === 'breakout').side === 'long', 'and long on the breakout');
  ok(up.find((x) => x.id === 'zscore_rev').side !== 'long', 'while the reversion rule does NOT chase it');
}
{
  const flat = newRing(); for (let i = 0; i < 120; i++) push(flat, { mid: 77000, spreadBps: 1, funding: 0 });
  const reads = readOracles(compute(flat), 3);
  ok(reads.every((x) => x.side === 'flat'), 'a dead flat tape gives every rule no view at all');
  ok(majorityTarget(reads, 3) === 0, 'so the average of them is flat too');
}
{
  const reads = [{ id: 'a', conviction: 1 }, { id: 'b', conviction: -1 }, { id: 'c', conviction: 0 }];
  ok(majorityTarget(reads, 3) === 0, 'rules in perfect disagreement average to flat');
  ok(majorityTarget([{ id: 'a', conviction: 1 }, { id: 'b', conviction: 1 }], 3) === 3,
    'and in agreement to the cap');
  ok(majorityTarget([], 3) === 0, 'with none of them, flat');
}
{
  // best-oracle must never see the bar it is about to trade.
  const reads = [{ id: 'a', target: 3 }, { id: 'b', target: -3 }];
  const eq = { a: 1.05, b: 0.9 };
  ok(bestOracleTarget(reads, eq, { decisions: 3, warmup: 10 }).target === 0,
    'before warmup it has no basis for a pick and stays flat');
  const pick = bestOracleTarget(reads, eq, { decisions: 40, warmup: 10 });
  ok(pick.target === 3 && pick.follows === 'a', 'after warmup it follows whoever is ahead on PAST equity');
  ok(bestOracleTarget(reads, {}, { decisions: 40 }).target === 0,
    'and with no equity history yet, flat rather than a guess');
}
{
  const reads = readOracles(compute((() => { const r = newRing();
    for (let i = 0; i < 120; i++) push(r, { mid: 77000 + i, spreadBps: 1 }); return r; })()), 3);
  const doc = oracleDoc(reads);
  ok(doc.includes('tally:'), 'the block tallies the sides so the disagreement is legible at a glance');
  ok(doc.includes('none of them can see the future either'),
    'and says plainly that the rules are not oracles in the prophetic sense');
  const crit = oracleCriteria(reads);
  ok(Object.keys(crit).length === reads.length + 1, 'the choice offers one option per rule plus none');
  ok(/None of them fits/.test(crit.none), 'and "none" is a real option, not an implied one');
}
{
  // The rules trade in the book, at the same costs, only on decision ticks.
  const b = newBook({ costs: { feeBps: 0, payHalfSpread: false } });
  step(b, { px: 100, action: 'buy', exposure: 1, oracleTargets: { r1: 2, r2: -2 }, majorityTarget: 0, bestTarget: 0 });
  step(b, { px: 110, action: null, oracleTargets: { r1: 2, r2: -2 } });
  near(pct(b.oracles.r1), 20, 1e-6, 'a rule leg earns its own exposure');
  near(pct(b.oracles.r2), -20, 1e-6, 'including on the short side');
  ok(b.oracles.r1.fills === 1, 'and pays for its fills like everyone else');
  const s = summary(b);
  ok(s.oracles.r1 && Number.isFinite(s.oracles.r1.pct), 'the summary reports each rule');
  ok(s.ranking[0][0] === 'r1', 'and ranks every leg, Jev included, best first');
  ok(s.ranking.some((x) => x[0] === 'jev'), 'Jev is in the ranking rather than above it');
  ok(s.ranking.every((x) => Number.isFinite(x[2]) && Number.isFinite(x[3])),
    'every leg carries its own drawdown and fill count, not just the rules');
  ok(s.ranking.some((x) => x[0] === 'majority') && s.ranking.some((x) => x[0] === 'best oracle'),
    'the two mechanical controls are ranked alongside everything else');
}
{
  const b = newBook({ risk: { cap: 1 }, costs: { feeBps: 0, payHalfSpread: false } });
  step(b, { px: 100, action: 'buy', exposure: 1, oracleTargets: { r: 9 } });
  ok(b.oracles.r.pos === 1, 'a rule cannot exceed the cap either');
}

// ------------------------------------------- gross, drag, and doing nothing ---
{
  // The decomposition that found the problem. Gross is the SAME trades run
  // free, so net-minus-gross is the drag exactly, not a fee times a turnover.
  const b = newBook();
  let px = 100;
  for (let i = 0; i < 40; i++) { px *= 1 + (i % 2 ? 0.004 : -0.004);
    step(b, { px, spreadBps: 2, action: 'buy', exposure: i % 2 ? 2 : -2 }); }
  const s = summary(b);
  ok(s.gross > s.jev, 'gross is above net, because the trades were free in the gross book');
  near(s.drag, s.gross - s.jev, 1e-9, 'and the drag is exactly the difference');
  ok(s.drag > 0.5, `flipping 2x every bar into a 2-sided spread costs real money (${s.drag.toFixed(2)}%)`);
  ok(s.dragShareOfLoss > 0 && s.dragShareOfLoss < 100,
    'here the gross loss dominates, so the fees are only part of it — the share says so');
}
{
  // The case that actually happened on the tape, and the reason the tile
  // exists: the timing was mildly POSITIVE and the fees alone made the run
  // negative, so the drag is more than 100% of the loss.
  const b = newBook({ costs: { feeBps: 8, payHalfSpread: false } });
  let px = 100;
  for (let i = 0; i < 30; i++) { px *= 1.0004;      // a gentle, genuine uptrend
    step(b, { px, spreadBps: 0, action: 'buy', exposure: i % 2 ? 1 : 0.2 }); }
  const s = summary(b);
  ok(s.gross > 0, `the trades themselves made money (${s.gross.toFixed(2)}%)`);
  ok(s.jev < 0, `and the run still finished down (${s.jev.toFixed(2)}%)`);
  ok(s.dragShareOfLoss > 100,
    `so the fees are MORE than the whole loss (${s.dragShareOfLoss.toFixed(0)}%) — which is what the tape showed`);
}
{
  const b = newBook();
  for (let i = 0; i < 10; i++) step(b, { px: 100 + i, spreadBps: 2, action: 'buy', exposure: 3 });
  ok(summary(b).dragShareOfLoss === null,
    'and on a WINNING run it declines to express the drag as a share of a loss that is not there');
}
{
  // Doing nothing. When the gross edge is near zero, trading less always
  // moves toward flat — so "closer to zero" needs the zero on the board to
  // be readable as what it is.
  const b = newBook();
  let px = 77000;
  for (let i = 0; i < 60; i++) { px *= 1 + Math.sin(i / 5) * 0.001;
    step(b, { px, spreadBps: 2, action: 'buy', exposure: i % 3 - 1 }); }
  near(pct(b.flat), 0, 1e-9, 'the do-nothing leg returns exactly zero, whatever the tape did');
  ok(b.flat.fills === 0 && b.flat.costPaid === 0, 'having never traded and never paid');
  const s = summary(b);
  ok(s.ranking.some((x) => x[0] === 'do nothing'), 'and it is ranked alongside everything else');
  ok(s.ranking.find((x) => x[0] === 'do nothing')[1] === 0, 'at exactly zero');
}

// ------------------------------------------------------------ stream B ----
{
  const cs = B.closes([
    { t: 0, mid: 10 }, { t: 4000, mid: 12 }, { t: 9000, mid: 11 },
    { t: 10_000, mid: 20 }, { t: 19_000, mid: 25 },
    { t: 20_000, mid: 30 },
  ], 10_000, 30);
  ok(cs.length === 3, 'ticks fold into buckets of the asked-for width');
  ok(cs[0] === 11 && cs[1] === 25 && cs[2] === 30, 'and each bucket keeps its CLOSE, not its open or its mean');
  ok(B.closes([], 10_000).length === 0, 'no ticks, no closes');
  ok(B.closes([{ t: 0, mid: 0 }, { t: 0, mid: NaN }], 10_000).length === 0, 'a bad price never opens a bucket');
  ok(B.closes([{ t: 0, mid: 5 }], 10_000, 30).length === 1, 'a short history is short, not padded with invention');
}
{
  const s = B.stateFrom([1.05, 2.5, 3]);
  ok(s === '1.1\n2.5\n3.0', 'the state is literally the numbers, one per line');
  ok(!/price|BTC|market|bp|value/i.test(s), 'with no units, no labels and no mention of what any of it is');
  ok(B.QUESTION.next.type === 'score', 'the forecast is a score, because a ladder is the only way to get a number out');
  ok(B.QUESTION.next.criteria.length === B.CENTRES.length, 'one bucket centre per rung');
  ok(!/price|market|trade|buy|sell/i.test(JSON.stringify(B.QUESTION)),
    'and the question never says what the sequence is either — that is the whole design');
}
{
  near(B.forecastBps(3), 0, 1e-9, 'the middle rung forecasts no change');
  near(B.forecastBps(0), -15, 1e-9, 'the bottom rung forecasts the largest fall');
  near(B.forecastBps(6), 15, 1e-9, 'and the top the largest rise');
  ok(B.forecastBps(4.5) > 0 && B.forecastBps(4.5) < 8, 'a fractional score interpolates between centres');
  ok(B.forecastBps(NaN) === 0 && B.forecastBps(undefined) === 0, 'no score, no forecast');
}
{
  ok(B.targetFrom(5, 40) === 40, 'a positive forecast slams the cap long');
  ok(B.targetFrom(-5, 40) === -40, 'and a negative one short');
  ok(B.targetFrom(1, 40, 3, -40) === -40, 'a forecast inside the dead zone keeps the position');
  ok(B.targetFrom(0, 40, 0, 12) === 12, 'and a forecast of exactly nothing changes nothing');
  ok(B.targetFrom(NaN, 40, 0, 7) === 7, 'as does a missing one');
}
{
  // THE arithmetic. Leverage must not appear, because it multiplies the gain
  // and the cost by the same factor — that is the finding, not an omission.
  const m = B.meanAbsAt(1);
  near(m, 4.79, 0.05, 'mean |move| at one minute, from a 6.0bp standard deviation');
  ok(B.breakEven({ meanAbsMoveBps: m }) > 1,
    `flipping every minute needs an IMPOSSIBLE accuracy (${(B.breakEven({ meanAbsMoveBps: m }) * 100).toFixed(0)}%)`);
  ok(B.breakEven({ meanAbsMoveBps: B.meanAbsAt(60) }) < 0.7, 'at an hour it comes back inside the possible');
  ok(B.breakEven({ meanAbsMoveBps: B.meanAbsAt(1440) }) < 0.55, 'and at a day it is nearly a coin flip');
  ok(B.breakEven({ meanAbsMoveBps: m, flip: false }) < B.breakEven({ meanAbsMoveBps: m }),
    'going flat and back is cheaper than reversing, because it trades half the size');
  ok(B.breakEven({ meanAbsMoveBps: 20, costBps: 4.7 }) === B.breakEven({ meanAbsMoveBps: 20, costBps: 4.7 }),
    'the calculation is deterministic');
  ok(B.breakEven({ meanAbsMoveBps: 0 }) === Infinity, 'a market that never moves can never pay for a trade');
}
{
  // The two streams must be separately scored, never blended.
  const b = newBook({ costs: { feeBps: 0, payHalfSpread: false } });
  step(b, { px: 100, action: 'buy', exposure: 1, streambTarget: -3 });
  step(b, { px: 110, action: null });
  near(pct(b.jev), 10, 1e-6, 'stream A earns its own position');
  near(pct(b.streamb), -30, 1e-6, 'and stream B its own, in the other direction');
  const s = summary(b);
  ok(s.ranking.some((x) => x[0] === 'stream B'), 'stream B is ranked beside everything else');
  ok(Number.isFinite(s.streamb), 'and reported in the summary');
}

if (failures.length) {
  console.error(`✗ lab selftest: ${failures.length} failure(s) of ${passed + failures.length} checks\n`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`✓ lab selftest: ${passed} checks passed`);
