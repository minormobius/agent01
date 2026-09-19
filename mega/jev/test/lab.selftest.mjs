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
import { captureStats, describe } from '../lab/bigmove.mjs';
import { pearson, windows as pWindows, evaluate as pEval, binomialTailP, verdict } from '../lab/prereg.mjs';
import { collect, emptyStore, REGISTERED_AT } from '../lab/collect-core.mjs';
import { assetFigures, crossSection, crossDoc, buildProbes, groundTruth, readAnswer, isDeterminate }
  from '../lab/cross.mjs';
import { routeMessage, UNIVERSE } from '../lab/multifeed.mjs';
import { GENERATORS, TRAITS, measure, traitsOf, legalMoves as genMoves, BRIEFS as GEN_BRIEFS,
  briefDistance as genDistance, moveCriteria as genCriteria, composeDoc as genDoc } from '../lab/gen.mjs';
import { traits, TRAIT_KEYS, BRIEFS, briefDistance, legalMoves, moveCriteria, composeDoc,
  runChain, chainStats, greedyPick, randomPick, MOVABLE, BOUNDS, STEP, DEFAULT_GENES, FAMILIES }
  from '../lab/compose.mjs';
import { carryStats, rankCarry, carryDoc, buildCarryProbes, carryTruth, positionRisk,
  toAnnualPct, FUNDING_FLOOR_PCT } from '../lab/carry.mjs';
import { decide, buildQuestions, GATE, ACTION_CRITERIA, EXPOSURE_LEVELS } from '../lab/ask.mjs';
import { LADDER as STEER_LADDER, RUNGS, steerQuestions, steerDoc, targetFromAnswers, briefFromText }
  from '../lab/steer.mjs';

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const fix = (n) => JSON.parse(readFileSync(join(here, '..', 'lab', 'fixtures', n), 'utf8'));
const fix2 = (n) => JSON.parse(readFileSync(join(here, '..', 'lab', n), 'utf8'));

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
  // ---- THE EARLY-MOVER BUG -------------------------------------------------
  // At the first decision the ring held 21 ticks and the document described
  // all three windows from it: "last 300s return" was the 20-second return,
  // byte-identical to the 60s line above it; "position in the last 300s range"
  // was 1.00; "below the 300s high, set 0s ago" was structurally forced,
  // because the max of a 20-tick buffer ending on its own highest tick can
  // only ever be now. Three assertions, none measured, all leaning one way.
  const young = newRing();
  for (let i = 0; i < 21; i++) young.buf.push({ mid: 77000 + i, spreadBps: 1, funding: 0 });
  const my = compute(young);
  ok(JSON.stringify(my.windows) === '[15]', 'a 21-second tape covers only the 15s window');
  ok(my.warm === false, 'and says it is not warm');
  for (const k of ['w60_retBps', 'w300_retBps', 'sma60', 'sma300', 'z60', 'z300',
    'rangePos60', 'rangePos300', 'maSpreadBps', 'maSpreadZ']) {
    ok(my[k] === null || my[k] === undefined, `${k} is absent rather than computed from 21 ticks`);
  }
  ok(my.volPctile === null, 'and volatility percentile is absent, not the 0.5 that used to stand in for it');
  const dy = stateDoc(my, 0, { jev: { equity: 1 }, decisions: 0 });
  ok(/TAPE SO FAR 21s/.test(dy), 'the document leads with how much tape there is');
  ok(!/300s/.test(dy), 'and never once mentions a 300s window it cannot see');
  ok(!/percentile/.test(dy), 'the volatility percentile line is omitted rather than defaulted');
  ok((dy.match(/^last /gm) || []).length === 1, 'exactly one window row is printed');

  // The extreme's age is bounded by the buffer that holds it, so quoting a
  // five-minute age off a twenty-second tape is not slightly wrong — it is a
  // number that CANNOT exceed twenty.
  ok(my.longWindow === 15 && my.secsSinceHigh <= 15,
    'the age of an extreme is measured against the window the tape actually covers');

  // Sixty seconds in, two real windows and still no 300s claim.
  const mid = newRing();
  for (let i = 0; i < 90; i++) mid.buf.push({ mid: 77000 + Math.sin(i / 7) * 20, spreadBps: 1, funding: 0 });
  const mm = compute(mid);
  ok(JSON.stringify(mm.windows) === '[15,60]', '90 seconds covers 15s and 60s and no more');
  ok(Number.isFinite(mm.z60) && mm.z300 === null, 'the 60s band exists and the 300s one does not');
  const dm = stateDoc(mm, 0, { jev: { equity: 1 }, decisions: 0 });
  ok(!/300s/.test(dm), 'and the document still never mentions 300s');
  ok(/Windows longer than 60s are not covered/.test(dm), 'it states the boundary rather than leaving it implied');

  // Full tape: everything comes back.
  const old = newRing();
  for (let i = 0; i < 300; i++) old.buf.push({ mid: 77000 + Math.sin(i / 30) * 40, spreadBps: 1, funding: 0 });
  const mo = compute(old);
  ok(JSON.stringify(mo.windows) === '[15,60,300]' && mo.warm === true, 'a full ring is warm and carries all three');
  ok(Number.isFinite(mo.z300) && Number.isFinite(mo.rangePos300), 'and the 300s levels are real');
  ok(/TAPE SO FAR 300s\./.test(stateDoc(mo, 0, { jev: { equity: 1 }, decisions: 0 })),
    'a warm document states the tape length without the not-covered caveat');
}
{
  // NO DATA is not FLAT, for the oracles exactly as for the position sizing.
  const young = newRing();
  for (let i = 0; i < 21; i++) young.buf.push({ mid: 77000 + i, spreadBps: 1, funding: 0.00001 });
  const reads = readOracles(compute(young), 3);
  ok(reads.every((r) => r.unavailable || r.id === 'carry'),
    'on 21 seconds every rule that needs the 60s window abstains');
  ok(reads.filter((r) => r.unavailable).every((r) => r.conviction === null && r.side === 'no data'),
    'an abstaining rule has a null conviction, not a zero one');
  ok(!(('ma_cross') in oracleCriteria(reads)),
    'and is not offered as an option, because a typed choice guarantees its option set');
  // Six abstentions must not average to a confident flat.
  const blind = reads.map((r) => ({ ...r, conviction: null, unavailable: true }));
  ok(majorityTarget(blind, 3) === 0, 'with nobody voting the majority is flat');
  const oneVote = blind.map((r, i) => (i ? r : { ...r, conviction: 1, unavailable: false }));
  ok(majorityTarget(oneVote, 3) === 3,
    'and one rule at full conviction is NOT diluted to a sixth by five abstainers');
  ok(/no reading yet/.test(oracleDoc(reads)) && /with no reading yet/.test(oracleDoc(reads)),
    'the tally counts no-reading apart from flat');
}
{
  const flat = newRing(); for (let i = 0; i < 120; i++) push(flat, { mid: 77000, spreadBps: 1, funding: 0 });
  const mflat = compute(flat);
  // A covered window with no dispersion is a MEASUREMENT of zero, and must not
  // look like the missing data above it.
  ok(mflat.maSpreadZ === 0 && mflat.maSpreadBps === 0,
    'a covered but perfectly flat window reads zero, which is not the same as null');
  const reads = readOracles(mflat, 3);
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

// ------------------------------------------------------- capture on big moves ---
{
  // A tape with one big move in the middle and quiet either side.
  const ticks = []; let px = 100;
  for (let i = 0; i < 660; i++) {                  // 11 windows at a 60 horizon
    if (i >= 300 && i < 360) px *= 1.002;          // the move
    else px *= 1 + (i % 2 ? 0.00002 : -0.00002);   // the noise
    ticks.push({ t: i * 1000, mid: px });
  }
  const longThrough = [{ t: 0, pos: 2 }];
  const shortThrough = [{ t: 0, pos: -2 }];
  const flat = [{ t: 0, pos: 0 }];

  const L = captureStats(ticks, longThrough, { horizon: 60, topPct: 0.15 });
  ok(L.enough && L.big >= 1, 'the big window is found');
  ok(L.capture > 1.5, `being 2x the right way captures more than the move itself (${L.capture.toFixed(2)})`);
  ok(L.offsides === 0, 'and is never offsides');

  const S = captureStats(ticks, shortThrough, { horizon: 60, topPct: 0.15 });
  ok(S.capture < 0, 'being the wrong way captures a NEGATIVE share, not zero');
  ok(S.offsides >= 1, 'and is counted as offsides');
  ok(S.worstOffsideBps > 100, 'with the size of the worst one reported');

  const F = captureStats(ticks, flat, { horizon: 60, topPct: 0.15 });
  near(F.capture, 0, 1e-9, 'being flat captures exactly nothing');
  ok(F.offsides === 0 && F.flatThrough >= 1,
    'and is counted as flat-through rather than offsides — missing a move is not the same mistake as fading it');
}
{
  // Windows must not overlap. An earlier pass of this analysis reported a
  // rule at 75.7% off 4,844 OVERLAPPING windows; non-overlapping it fired on
  // four. Overlap is one event counted hundreds of times.
  const ticks = Array.from({ length: 660 }, (_, i) => ({ t: i * 1000, mid: 100 + i }));
  const s = captureStats(ticks, [{ t: 0, pos: 1 }], { horizon: 60, topPct: 0.5 });
  ok(s.windows === 10, `660 ticks at a 60-tick horizon give ${s.windows} windows, not 600`);
  ok(s.windows * 60 <= ticks.length, 'so no window can share data with the next');
}
{
  ok(captureStats([], []) === null, 'no ticks, no statistics');
  ok(captureStats(Array.from({ length: 50 }, (_, i) => ({ t: i, mid: 100 })), []) === null,
    'and too short a history returns null rather than a number built on nothing');
  const flatTape = Array.from({ length: 660 }, (_, i) => ({ t: i * 1000, mid: 100 }));
  const s = captureStats(flatTape, [{ t: 0, pos: 3 }], { horizon: 60 });
  ok(!s.enough, 'a tape that never moves has no big windows to rank, and says so');
  ok(/too few|not enough/.test(describe(s)), 'and the description refuses to speak');
  ok(/not enough/.test(describe(null)), 'as does the null case');
}

// ------------------------------------------- the pre-registered rule ----
const SPEC = fix2('preregister.json');
{
  ok(SPEC.id === 'jev-lab-polarity-12h-v1', 'the registration has an id');
  ok(SPEC.rule.K === 20 && SPEC.rule.gate_abs_r === 0.15, 'K and the gate are frozen in the spec file');
  ok(SPEC.rule.stride_bars === 2 * SPEC.rule.horizon_bars,
    'the stride is exactly twice the horizon, so no window shares a bar with another');
  ok(SPEC.minimum_n_before_any_claim >= 200, 'a minimum sample is registered before any claim');
  ok(Array.isArray(SPEC.falsified_if) && SPEC.falsified_if.length >= 2,
    'and what would falsify it is written down, not left to taste');
  ok(/THIRTY|thirty/.test(SPEC.selection_disclosure), 'the selection is disclosed rather than buried');
}
{
  near(pearson([1, 2, 3, 4], [2, 4, 6, 8]), 1, 1e-9, 'a perfect line is r = 1');
  near(pearson([1, 2, 3, 4], [8, 6, 4, 2]), -1, 1e-9, 'and its mirror is -1');
  ok(pearson([1, 1, 1, 1], [1, 2, 3, 4]) === null, 'a flat series has no correlation, and says null');
  // The exact values that once produced a confident r = 1.00 from two
  // constant series, via floating-point crumbs in the sum of squares.
  ok(pearson([5, 5, 5, 5, 5], [7, 7, 7, 7, 7]) === null,
    'two constant series stay null rather than becoming a fabricated 1.00');
  ok(pearson([1, 2], [1, 2]) === null, 'too few points is null, not a coincidence');
}
{
  // Windows must not overlap, which is the whole reason for the stride.
  const px = Array.from({ length: 200 }, (_, i) => 100 + i);
  const w = pWindows(px, SPEC);
  ok(w.length > 3, 'windows are produced');
  for (let i = 1; i < w.length; i++) {
    ok(w[i].index - w[i - 1].index === SPEC.rule.stride_bars, 'each window starts exactly one stride after the last');
  }
  ok(w[0].index - SPEC.rule.horizon_bars >= 0, 'and the first one has its full trailing leg');
  ok(pWindows([1, 2, 3], SPEC).length === 0, 'too short a series yields nothing rather than a partial window');
  ok(pWindows([100, 0, -5, NaN, 100], SPEC).length === 0, 'and bad prices are never turned into returns');
}
{
  // THE DEFECT THAT ONLY APPEARS ON THE SECOND SCHEDULED RUN. Anchored to the
  // array, one extra bar in the fetch moves every pivot, so a collector
  // refetching a growing series records a different — and overlapping — set of
  // windows each time. Anchored to the clock, the same bar is the same window
  // however much history came with it.
  const BAR = 3600_000;
  const t0 = Date.UTC(2026, 0, 1);                       // a midnight, so pivot phase 0
  const px = Array.from({ length: 220 }, (_, i) => 100 + i);
  const ts = Array.from({ length: 220 }, (_, i) => t0 + i * BAR);
  const full = pWindows(px, SPEC, ts);
  ok(full.length > 3, 'the clock-anchored grid still produces windows');
  const STRIDE_MS = SPEC.rule.stride_bars * BAR;
  for (const w of full) ok(ts[w.index] % STRIDE_MS === 0, 'every pivot sits on a stride boundary of the clock');
  for (let i = 1; i < full.length; i++) {
    ok(full[i].index - full[i - 1].index === SPEC.rule.stride_bars, 'and consecutive pivots are still one stride apart');
  }
  // Refetch returning one fewer leading bar: the SAME bars must be the SAME windows.
  const cut = 1;
  const shifted = pWindows(px.slice(cut), SPEC, ts.slice(cut));
  const stamp = (ws, off) => ws.map((w) => ts[w.index + off]).join();
  ok(stamp(shifted, cut) === stamp(full, 0).slice(-stamp(shifted, cut).length),
    'dropping a leading bar does not move a single pivot — the grid is the clock, not the array');
  // And the array-anchored form is exactly what it must not be, so the test
  // fails if someone quietly drops the timestamps again.
  ok(pWindows(px.slice(cut), SPEC).map((w) => w.index + cut).join() !== full.map((w) => w.index).join(),
    'while the array-anchored form DOES move, which is why the stamps are passed');
}
{
  // A constant-return exponential is NOT a test of this: every window's
  // return is identical, so the correlation is undefined and pearson
  // correctly returns null. Momentum has to be built as persistence in the
  // returns themselves — r_t = 0.75 r_(t-1) + noise, integrated.
  const build = (persistence, seed) => {
    let a = seed >>> 0;
    const rnd = () => { a = (a + 0x6D2B79F5) | 0; let x = Math.imul(a ^ (a >>> 15), 1 | a);
      x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296 - 0.5; };
    const px = [100]; let r = 0;
    for (let i = 1; i < 1400; i++) { r = persistence * r + rnd() * 0.004; px.push(px[i - 1] * (1 + r)); }
    return px;
  };
  const mom = build(0.75, 11);
  const rowsT = pEval({ BTC: mom, ETH: build(0.75, 12), SOL: build(0.75, 13) }, SPEC);
  const tradedT = rowsT.filter((r) => r.side !== undefined);
  ok(tradedT.length > 0, `a persistently-trending series clears the gate (${tradedT.length} predictions)`);
  ok(tradedT.every((r) => r.r > 0), 'and the estimated polarity is positive, so the rule FOLLOWS the trailing move');
  ok(tradedT.filter((r) => r.correct).length / tradedT.length > 0.6,
    'which is right well over half the time on a series built to persist');

  // Built to alternate instead, the same rule must flip to fading.
  const rev = pEval({ BTC: build(-0.75, 21), ETH: build(-0.75, 22), SOL: build(-0.75, 23) }, SPEC)
    .filter((r) => r.side !== undefined);
  ok(rev.length > 0 && rev.every((r) => r.r < 0),
    'on a series built to alternate, the estimate goes negative and the rule FADES — the polarity is learned, not assumed');
}
{
  // Nothing may look at the bar it is predicting. Corrupting the FUTURE of
  // the last window must not change any earlier decision.
  const base = Array.from({ length: 1400 }, (_, i) => 100 + Math.sin(i / 9) * 5 + i * 0.01);
  const a = pEval({ BTC: base, ETH: base, SOL: base }, SPEC);
  const tampered = base.slice(); for (let i = tampered.length - 20; i < tampered.length; i++) tampered[i] *= 3;
  const b = pEval({ BTC: tampered, ETH: tampered, SOL: tampered }, SPEC);
  const sides = (rs) => rs.slice(0, rs.length - 6).map((r) => `${r.t}:${r.side}`).join();
  ok(sides(a) === sides(b), 'mangling the end of the series leaves every earlier decision untouched — no lookahead');
}
{
  const rows = pEval({ BTC: [], ETH: [], SOL: [] }, SPEC);
  ok(rows.length === 0, 'no data, no predictions');
}
{
  near(binomialTailP(50, 100), 0.5398, 0.001, 'the binomial tail is exact at the midpoint');
  ok(binomialTailP(60, 100) < 0.03 && binomialTailP(60, 100) > 0.02, 'and correct in the tail');
  near(binomialTailP(120, 200), 0.00284, 0.0002, 'it survives n = 200 without overflowing a factorial');
  ok(binomialTailP(100, 200) > 0.4, 'and stays near a half at the midpoint of a large n');
}
{
  // The minimum sample is binding. A perfect record below it claims NOTHING.
  const perfect = Array.from({ length: 50 }, (_, i) => ({ side: 1, correct: true, earnedBps: 40, t: i }));
  const v = verdict(perfect, SPEC);
  ok(v.claim === null, 'fifty perfect predictions make no claim, because the registration forbids it');
  ok(/to go/.test(v.status), 'and the status says how many are still needed');

  const enough = Array.from({ length: 220 }, (_, i) => ({ side: 1, correct: i % 100 < 62, earnedBps: i % 100 < 62 ? 40 : -35, t: i }));
  const v2 = verdict(enough, SPEC);
  ok(v2.claim !== null, 'past the minimum a verdict is given');
  ok(v2.accuracy > 0.5 && v2.p < 0.05, 'and reads the registered criterion, not the curve');

  const coin = Array.from({ length: 220 }, (_, i) => ({ side: 1, correct: i % 2 === 0, earnedBps: i % 2 === 0 ? 10 : -10, t: i }));
  ok(verdict(coin, SPEC).claim === 'falsified', 'a coin flip at n >= 200 is reported as falsified, in those words');
}
{
  // Costs are subtracted, and a rule that is right but not right ENOUGH says so.
  const thin = Array.from({ length: 220 }, (_, i) => ({ side: 1, correct: i % 100 < 62, earnedBps: i % 100 < 62 ? 6 : -5, t: i }));
  const v = verdict(thin, SPEC);
  ok(v.netBps < 0, 'a 6bp edge does not survive a 9.4bp round trip');
  ok(/not after costs/.test(v.claim), 'and the verdict says directionally supported but not after costs');
}

// ------------------------------------ the collector, on a stubbed exchange ----
// The core runs in node AND in the Worker's cron, so it is tested through a
// fake `fetch` rather than against the real exchange: a scheduled job whose
// tests need the internet is a job that goes untested.
{
  const BAR = 3600_000;
  const N = 1400;
  // The real registration instant is essentially now, so real forward bars do
  // not exist yet. The tape runs up to now and the cutoff is moved back with
  // it — the shape of the test is identical, only the clock is stubbed.
  const end = Math.floor(Date.now() / BAR) * BAR;
  const start = end - (N - 1) * BAR;
  // Part-way through the tape, so the run has windows on BOTH sides of the
  // cutoff — the discard path is the one that matters and it needs exercising.
  const CUT = start + 700 * BAR;
  const mk = (seed) => {
    let a = seed >>> 0;
    const rnd = () => { a = (a + 0x6D2B79F5) | 0; let x = Math.imul(a ^ (a >>> 15), 1 | a);
      x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296 - 0.5; };
    const out = []; let px = 100, r = 0;
    for (let i = 0; i < N; i++) { r = 0.75 * r + rnd() * 0.004; px *= (1 + r);
      out.push({ t: start + i * BAR, c: String(px) }); }
    return out;
  };
  const tapes = { BTC: mk(31), ETH: mk(32), SOL: mk(33) };
  let calls = 0;
  const fakeFetch = async (_url, opts) => {
    calls++;
    const { req } = JSON.parse(opts.body);
    const rows = tapes[req.coin].filter((c) => c.t >= req.startTime && c.t <= req.endTime);
    return { ok: true, json: async () => rows };
  };

  const opt = { fetchImpl: fakeFetch, pages: 3, registeredAt: CUT };
  const a = await collect(SPEC, null, opt);
  ok(a.added > 0, `the collector records predictions from a stubbed exchange (${a.added})`);
  ok(a.store.predictions.every((p) => p.closes_ms >= CUT),
    'and every one closed after the registration cutoff');
  ok(a.skippedEarly > 0, 'while windows that closed before it are counted and discarded');

  // IDEMPOTENCE is what makes running it twice a day for a once-a-day grid
  // safe, and what makes the first run after an outage pick up the backlog
  // without double-counting.
  const b = await collect(SPEC, a.store, opt);
  ok(b.added === 0, 'running it again adds nothing');
  ok(b.store.predictions.length === a.store.predictions.length, 'and the record does not grow');
  ok(JSON.stringify(b.store.predictions) === JSON.stringify(a.store.predictions),
    'the recorded predictions are byte-identical on a re-run');

  // Non-overlap must survive the round trip, since that is the property the
  // whole registration rests on.
  for (const asset of SPEC.rule.universe) {
    const mine = a.store.predictions.filter((p) => p.asset === asset).map((p) => p.closes_ms);
    for (let i = 1; i < mine.length; i++) {
      ok(mine[i] - mine[i - 1] >= SPEC.rule.stride_bars * BAR,
        `${asset}: consecutive predictions are at least one stride apart`);
    }
  }

  // The input record is never mutated — the DO writes only what comes back.
  const before = JSON.stringify(a.store);
  await collect(SPEC, a.store, opt);
  ok(JSON.stringify(a.store) === before, 'collect does not mutate the record it was given');

  // A spec id that does not match the record is refused rather than merged.
  let refused = false;
  try { await collect({ ...SPEC, id: 'other-v2' }, a.store, opt); }
  catch { refused = true; }
  ok(refused, 'a record from a different registration is refused, not appended to');

  // And an exchange failure throws rather than returning an empty record that
  // would overwrite a good one.
  let threw = false;
  try { await collect(SPEC, a.store, { ...opt, fetchImpl: async () => ({ ok: false, status: 503 }) }); }
  catch { threw = true; }
  ok(threw, 'an exchange failure throws rather than quietly producing an empty record');

  // Below the registered minimum there is no claim, whatever the numbers say.
  ok(a.store.verdict.claim === null && /before any claim/.test(a.store.verdict.status),
    'and under the registered minimum the verdict refuses to speak');
}

// --------------------------------------------- the cross-section layer ----
{
  // Three series built so the ANSWER IS KNOWN: A rises steadily, B rises more,
  // C falls. Ground truth here is arithmetic, not a label, which is the whole
  // reason this probe set is worth asking at all.
  const n = 200;
  const A = Array.from({ length: n }, (_, i) => 100 * (1 + 0.0001 * i));
  const B = Array.from({ length: n }, (_, i) => 50 * (1 + 0.0004 * i));
  const C = Array.from({ length: n }, (_, i) => 10 * (1 - 0.0002 * i));
  const i = n - 1;
  const figs = { A: assetFigures(A, i, [15, 60]), B: assetFigures(B, i, [15, 60]), C: assetFigures(C, i, [15, 60]) };
  ok(Object.values(figs).every(Boolean), 'figures computed for all three');
  ok(assetFigures(A, 10, [15, 60]) === null,
    'and a series that does not reach the longest window returns null rather than a shorter one wearing its label');

  const xs = crossSection(figs, { window: 60 });
  ok(xs.strongest === 'B' && xs.weakest === 'C', 'the cross-section ranks by trailing return');
  ok(xs.allSameDirection === false, 'and notices when one moves against the others');
  ok(xs.spreadBps > 0, 'the best-minus-worst spread is reported');
  near(xs.spreadBps, xs.returns.B - xs.returns.C, 1e-9, 'and it IS best minus worst, not something else');
  ok(crossSection({ A: figs.A }, { window: 60 }) === null, 'one asset is not a cross-section');

  // Dislocation is distance from the group's own average, not distance from
  // zero — otherwise it would just be "whichever moved most".
  const flatish = {
    A: assetFigures(Array.from({ length: n }, (_, k) => 100 * (1 + 0.0003 * k)), i, [15, 60]),
    B: assetFigures(Array.from({ length: n }, (_, k) => 100 * (1 + 0.00031 * k)), i, [15, 60]),
    C: assetFigures(Array.from({ length: n }, (_, k) => 100 * (1 + 0.00032 * k)), i, [15, 60]),
  };
  const fx = crossSection(flatish, { window: 60 });
  ok(fx.allSameDirection === true, 'three that all rise are all the same direction');
  ok(fx.mostDislocated === 'A' || fx.mostDislocated === 'C',
    'and the outlier is an end of the range, not the middle');

  // GROUND TRUTH MUST MATCH THE DOCUMENT. If the truth were computed from
  // anything the document does not print, the determinate probes would not be
  // determinate and the whole experiment would be measuring something else.
  const t = groundTruth(figs, xs, null);
  ok(t.d_strongest === xs.strongest && t.d_weakest === xs.weakest, 'truth tracks the cross-section');
  ok(t.d_spread_over_20 === (xs.spreadBps > 20), 'including the threshold probe');
  ok(t.p_strongest_next === undefined, 'and with no forward bars there is no predictive truth at all');

  const fwd = { A: 5, B: -3, C: 9 };
  const t2 = groundTruth(figs, xs, fwd);
  ok(t2.p_strongest_next === 'C' && t2.p_weakest_next === 'B',
    'predictive truth comes from the FORWARD bars, which the document never sees');
  ok(t2.p_all_same_next === false, 'and reads their agreement from those same forward bars');

  const doc = crossDoc(figs, xs, { unit: 'm', windows: [15, 60] });
  ok(/THREE PERPETUALS/.test(doc) && /CROSS-SECTION/.test(doc), 'the document has both blocks');
  ok(!/300s|60s/.test(doc), 'and never labels minute bars as seconds — the timescale-lie bug, in a new file');
  for (const a of ['A', 'B', 'C']) ok(doc.includes(a), `${a} appears in the document`);
  ok(!/BACKGROUND/.test(doc), 'the regime line is absent unless a regime is passed');
  ok(/BACKGROUND/.test(crossDoc(figs, xs, { regime: { r: 0.15, updated: 'x' } })),
    'and present when it is');
  ok(/does not change within a session/.test(crossDoc(figs, xs, { regime: { r: 0.15 } })),
    'labelled as the standing multi-day fact it is, so nothing here reads it as a live signal');
}
{
  // The probe set, and the property that makes the experiment clean.
  const figs = {
    X: assetFigures(Array.from({ length: 200 }, (_, i) => 100 + i), 199, [15, 60]),
    Y: assetFigures(Array.from({ length: 200 }, (_, i) => 100 + i * 2), 199, [15, 60]),
    Z: assetFigures(Array.from({ length: 200 }, (_, i) => 100 - i * 0.5), 199, [15, 60]),
  };
  const xs = crossSection(figs, { window: 60 });
  const p = buildProbes(xs);
  const det = Object.keys(p).filter(isDeterminate);
  const pre = Object.keys(p).filter((k) => !isDeterminate(k));
  ok(det.length >= 4 && pre.length >= 4, 'both arms are substantial');
  ok(det.length + pre.length === Object.keys(p).length, 'and every probe belongs to exactly one arm');
  for (const [id, q] of Object.entries(p)) {
    ok(['choice', 'noul', 'score'].includes(q.type), `${id} uses a real primitive`);
    if (q.type === 'choice') {
      ok(Object.keys(q.criteria).every((k) => xs.assets.includes(k)),
        `${id} can only name an asset that exists — the typed guarantee`);
    }
    if (q.type === 'noul') {
      ok('true' in q.criteria && 'false' in q.criteria, `${id} writes both sides of the noul`);
    }
  }
  for (const id of pre) ok(/NEXT/.test(p[id].instructions), `${id} is visibly about the future`);
  for (const id of det) ok(!/NEXT|will /.test(p[id].instructions), `${id} asks nothing about the future`);

  // The self-check rides along, one per probe, in the same call.
  const withSelf = buildProbes(xs, { selfCheck: true });
  ok(Object.keys(withSelf).length === 2 * Object.keys(p).length, 'every probe gets its own self-check');
  for (const id of Object.keys(p)) {
    ok(withSelf[`have__${id}`]?.type === 'noul', `${id} has a noul self-check`);
    ok(withSelf[`have__${id}`].instructions.includes(p[id].instructions),
      'which quotes the question it is checking, so it cannot drift from it');
  }
}
{
  // Reading an answer. A noul's confidence is how far it sits from a half —
  // "how concentrated is the distribution" — while p(have) is read RAW,
  // because there a low number is a claim of absence, not low confidence.
  near(readAnswer({ noul: 0.95 }).confidence, 0.95, 1e-9, 'a confident yes');
  near(readAnswer({ noul: 0.04 }).confidence, 0.96, 1e-9, 'a confident no is equally confident');
  ok(readAnswer({ noul: 0.95 }).value === true && readAnswer({ noul: 0.04 }).value === false, 'and reads as a boolean');
  ok(readAnswer({ choice: 'BTC', confidence: 0.8 }).value === 'BTC', 'a choice reads its option');
  ok(readAnswer(null).value === null && readAnswer({}).value === null, 'a missing answer is null, never a default');
}

// --------------------------------------------------- the three-tape feed ----
{
  // One socket, three assets, three accumulators. A message folded into the
  // wrong one is a corruption that looks like a real cross-asset signal, and
  // nothing downstream could detect it — so routing is pinned hard.
  const ctx = { channel: 'activeAssetCtx', data: { coin: 'ETH', ctx: { midPx: '3000' } } };
  ok(JSON.stringify(routeMessage(ctx)) === JSON.stringify([['ETH', ctx]]), 'activeAssetCtx routes by data.coin');

  const book = { channel: 'l2Book', data: { coin: 'SOL', time: 1, levels: [[], []] } };
  ok(routeMessage(book)[0][0] === 'SOL', 'l2Book routes by data.coin');

  // trades arrives as an ARRAY. Routing it wholesale by its first element
  // would put one asset's aggressor flow into another's taker skew.
  const mixed = { channel: 'trades', data: [
    { coin: 'BTC', side: 'B', sz: '1' }, { coin: 'ETH', side: 'A', sz: '2' }, { coin: 'BTC', side: 'A', sz: '3' },
  ] };
  const routed = routeMessage(mixed);
  ok(routed.length === 2, 'a mixed trades batch splits into one message per asset');
  const btc = routed.find(([c]) => c === 'BTC')[1].data;
  const eth = routed.find(([c]) => c === 'ETH')[1].data;
  ok(btc.length === 2 && btc.every((t) => t.coin === 'BTC'), "BTC's message carries only BTC fills");
  ok(eth.length === 1 && eth[0].coin === 'ETH', "and ETH's only ETH's");
  ok(routed.every(([, m]) => m.channel === 'trades'), 'the channel survives the split, so fold still recognises it');

  // Anything unplaceable is DROPPED, never folded into whichever asset is first.
  ok(routeMessage({ channel: 'trades', data: [{ coin: 'DOGE', side: 'B', sz: '1' }] }).length === 0,
    'an asset outside the universe is dropped rather than misrouted');
  ok(routeMessage({ channel: 'l2Book', data: { levels: [[], []] } }).length === 0, 'a message with no coin is dropped');
  ok(routeMessage({ channel: 'subscriptionResponse', data: {} }).length === 0, 'and so is a message with no asset in it');
  ok(routeMessage(null).length === 0 && routeMessage({}).length === 0, 'null and empty are handled without throwing');
  ok(UNIVERSE.length === 3, 'the universe is the registered three');
}

// ------------------------------------------------- funding, the carry cost ----
{
  // THE BUG THIS FIXES. The book charged fees on every size change and NOTHING
  // on the position held between them, so a perp long carried none of the
  // funding it really pays. Measured on Hyperliquid over 21 days: BTC funding
  // averaged 0.1201bp/hour = 2.88bp/day, positive — longs paying — in 96.2% of
  // hours. Every long leg in this lab was flattered and every short paid.
  const HOUR = 3600_000;
  // Stepped hour by hour rather than in one 24-hour jump: the per-tick clamp
  // below deliberately refuses to bill a feed gap as carry, so a realistic
  // cadence is the only way to accumulate a real day of it.
  const run = (pos, hours, costs = {}) => {
    const b = newBook({ costs: { feeBps: 0, payHalfSpread: false, ...costs }, risk: { cap: 3 } });
    step(b, { px: 100, t: 0, exposure: pos, action: 'buy' });
    for (let h = 1; h <= hours; h++) step(b, { px: 100, t: h * HOUR });
    return b;
  };
  const long = run(1, 24);
  const short = run(-1, 24);
  ok(long.jev.equity < 1, 'a long that never moves still LOSES, because it pays funding');
  near((1 - long.jev.equity) * 1e4, 0.12 * 24, 0.02, 'and pays 0.12bp an hour — 2.88bp over a day at 1x');
  ok(Math.abs((1 - long.jev.equity) * 1e4 - 2.88) < 0.02,
    'which is the 2.88bp/day measured on Hyperliquid over 21 days, not a round number picked to look tidy');
  ok(short.jev.equity > 1, 'while a short holding the same position is PAID it');
  near(short.jev.equity - 1, 1 - long.jev.equity, 1e-6, 'the two are equal and opposite, which is what funding is');

  // It scales with exposure, so leverage multiplies the carry exactly as it
  // multiplies everything else.
  const l3 = run(3, 24);
  near((1 - l3.jev.equity) / (1 - long.jev.equity), 3, 0.01, 'three times the position is three times the carry');

  // A flat position pays nothing at all.
  const flat = run(0, 24);
  ok(flat.jev.equity === 1, 'a flat position pays no funding');
  ok(flat.flat.equity === 1, 'and neither does the do-nothing leg, which never holds anything');

  // Funding is a COST, so it belongs in the drag and not in gross. gross is
  // defined as "the same trades with every cost waived"; if funding leaked
  // into it, `equity - gross` would stop being the measured drag.
  ok(long.jev.gross === 1, 'gross is untouched by funding, so the drag stays measurable');
  ok(long.jev.equity < long.jev.gross, 'and the carry shows up as drag');

  // It is a carry on TIME, not on trading — which is why leaving it out also
  // flattered buy-and-hold, the leg that trades least of all.
  const bh = run(1, 24);
  ok(bh.hold.equity < 1, 'buy-and-hold pays it too: it is a cost of holding, not of trading');

  // Switchable, because it is a real number that changes and a run that wants
  // the old behaviour as a control must be able to have it.
  ok(run(1, 24, { chargeFunding: false }).jev.equity === 1, 'and it can be turned off as a control');
  near((1 - run(1, 24, { fundingBpsPerHour: 0.24 }).jev.equity) / (1 - long.jev.equity), 2, 0.01,
    'the rate is a parameter, not a constant of nature');

  // TAPE TIME, not wall time — the same fix the candles needed. And a gap in
  // the feed must not bill an hour of carry in a single tick.
  const gap = newBook({ costs: { feeBps: 0, payHalfSpread: false }, risk: { cap: 3 } });
  step(gap, { px: 100, t: 0, exposure: 1, action: 'buy' });
  step(gap, { px: 100, t: 48 * HOUR });
  near((1 - gap.jev.equity) * 1e4, 0.12, 0.02, 'a two-day gap in the feed bills one hour, not forty-eight');
}

// ------------------------------------------------ carry, and its drawdown ----
{
  const HR = 1 / (24 * 365);            // one unit of hourly rate = 100%/yr
  near(toAnnualPct(HR), 100, 1e-9, 'an hourly rate annualises over 8760 hours');

  // A steady positive rate: carry with no drawdown at all.
  const steady = Array.from({ length: 500 }, () => HR * 0.1);
  const ss = carryStats(steady);
  near(ss.meanPct, 10, 1e-6, 'a steady rate reports its own annualised mean');
  near(ss.drawdownPct, 0, 1e-9, 'and a monotonically rising cumulative has NO drawdown');
  ok(ss.carryPerDrawdown === null, 'so carry-per-drawdown is null rather than an infinity');
  ok(ss.negHoursPct === 0, 'and no negative hours');
  ok(carryStats([1, 2]) === null, 'too little history returns null rather than a number built on nothing');

  // A run of negative funding: the drawdown is the peak-to-trough of what a
  // short COLLECTED, which is the risk number a flattering version omits.
  const dip = [...Array.from({ length: 100 }, () => HR * 0.1),
    ...Array.from({ length: 50 }, () => -HR * 0.2),
    ...Array.from({ length: 100 }, () => HR * 0.1)];
  const ds = carryStats(dip);
  ok(ds.drawdownPct > 0, 'a negative run produces a real drawdown');
  near(ds.drawdownPct, 50 * HR * 0.2 * 100, 1e-6, 'exactly the sum of the negative run');
  ok(ds.underwaterHours === 150,
    'and the UNDERWATER duration is 150h — 50 falling plus 100 climbing back, not the 50 of the run itself');
  near(ds.negHoursPct, 100 * 50 / 250, 1e-9, 'with the negative share reported');
  ok(ds.recoverDays > 0, 'and how long the mean carry needs to earn it back');
  ok(ds.carryPerDrawdown > 0, 'carry per unit of drawdown is computed HERE, not left as a division for the model');

  // The z is against the asset's OWN history, which is the whole point: a 100%
  // print means one thing on an asset that averages 90% and another on one
  // that averages 4%.
  // A series with real variance, because a perfectly constant one has no sd to
  // measure against and correctly reports z = 0 rather than an invented number.
  const noisy = Array.from({ length: 500 }, (_, i) => HR * (0.1 + 0.02 * Math.sin(i / 7)));
  const spike = carryStats(noisy, { current: HR * 10 });
  ok(spike.z > 3, 'a print far above an asset\'s own history is flagged in its own sd');
  ok(carryStats(steady, { current: HR * 10 }).z === 0,
    'while a constant history has no sd to measure against and says 0 rather than inventing one');
  near(spike.currentPct, 1000, 1e-6, 'and the current print is reported separately from the mean');
}
{
  // The ranking is a SORT, never a forecast.
  const mk = (mean, dd) => ({ currentPct: mean, meanPct: mean, z: 0,
    drawdownPct: dd, negHoursPct: 0, recoverDays: 1, underwaterHours: 1, hours: 100,
    carryPerDrawdown: dd > 0 ? mean / dd : null });
  const r = rankCarry({ A: { ...mk(100, 1), z: 0.5 }, B: { ...mk(40, 0.01), z: 3 }, C: { ...mk(11, 0.5), z: 0.1 } });
  ok(r.richest === 'A', 'the richest headline funding is A');
  ok(r.bestRiskAdjusted === 'B', 'but the best carry per unit of drawdown is B — which is the entire point');
  ok(r.mostStretched === 'B', 'and the most stretched against its own history is flagged separately');
  ok(r.worstDrawdown === 'A', 'as is the worst drawdown');
  near(r.spreadPct, 89, 1e-9, 'the cross-sectional spread is richest minus cheapest');
  ok(r.cheapest === 'C', 'and the cheapest is named');
  ok(rankCarry({}) === null, 'an empty cross-section is null, not an empty ranking');

  // A window in which NOTHING drew down: there is no ratio to rank by, so
  // bestRiskAdjusted is null. The render must say that rather than printing
  // "null" or quietly falling back to the richest — which would present the
  // headline as if it were the risk-adjusted answer. Caught by the render.
  const noDd = rankCarry({ A: mk(50, 0), B: mk(20, 0) });
  ok(noDd.bestRiskAdjusted === null, 'with no drawdown anywhere there is no risk-adjusted winner');
  ok(noDd.richest === 'A', 'while the richest is still well defined');

  // When every asset sits at the venue's floor the cross-section says nothing,
  // and the document must say THAT rather than rank noise.
  const floorAll = rankCarry({ A: mk(FUNDING_FLOOR_PCT, 0.1), B: mk(FUNDING_FLOOR_PCT, 0.1) });
  ok(floorAll.allAtFloor === true, 'all-at-the-floor is detected');
  ok(/carries no information/.test(carryDoc(floorAll)), 'and the document says so outright');
  ok(!/carries no information/.test(carryDoc(r)), 'while a real spread does not trigger it');
}
{
  // Position risk. A delta-neutral book is still liquidatable — the legs are on
  // different venues and the perp margin does not know the spot leg exists.
  const p1 = positionRisk({ fundingPct: 10, spotYieldPct: 5, leverage: 1 });
  near(p1.leveredCarryPct, 15, 1e-9, 'at 1x the carry is funding plus spot yield');
  near(p1.moveToLiquidationPct, 98, 1e-9, 'and almost the whole position must move to break it');
  const p3 = positionRisk({ fundingPct: 10, spotYieldPct: 5, leverage: 3 });
  near(p3.leveredCarryPct, 45, 1e-9, 'leverage multiplies the carry');
  near(p3.moveToLiquidationPct, 100 / 3 - 2, 1e-9, 'and shrinks the move that ruins it');
  const p10 = positionRisk({ fundingPct: 10, spotYieldPct: 5, leverage: 10 });
  ok(p10.moveToLiquidationPct < p3.moveToLiquidationPct, 'more leverage, less room — monotone');
  ok(p3.breakEvenDays > 0 && p10.breakEvenDays < p3.breakEvenDays,
    'and the round trip costs fewer days of carry at higher leverage');
  ok(positionRisk({ fundingPct: 10, leverage: 0 }) === null, 'zero leverage is not a position');
  ok(positionRisk({ fundingPct: -20, leverage: 3 }).breakEvenDays === null,
    'negative carry never breaks even, and says null rather than a negative number of days');
}
{
  // The document, and the warning it is required to carry.
  const mk = (c, m, dd, z) => ({ currentPct: c, meanPct: m, z, drawdownPct: dd,
    negHoursPct: 5, recoverDays: 2, underwaterHours: 10, hours: 2000,
    carryPerDrawdown: dd > 0 ? m / dd : null });
  const r = rankCarry({ XMR: mk(105, 33, 0.25, 1.3), UNI: mk(42, 12, 0.013, 2.2), SOL: mk(11, 6, 0.15, 0.6) });
  const doc = carryDoc(r, { position: positionRisk({ fundingPct: 11, spotYieldPct: 4.86, leverage: 3 }) });
  ok(/short-volatility/.test(doc), 'the document states the shape of the risk');
  ok(/tail is not in this data/.test(doc), 'and says outright that the tail is missing from it');
  ok(/still liquidatable/.test(doc), 'and that a delta-neutral book can still be liquidated');
  ok(/floor of about/.test(doc), 'and names the funding floor, which is the mechanism behind the whole structure');
  for (const c of ['XMR', 'UNI', 'SOL']) ok(doc.includes(c), `${c} appears`);

  const t = carryTruth(r);
  ok(t.d_richest === 'XMR' && t.d_best_per_drawdown === 'UNI',
    'the richest and the best risk-adjusted are DIFFERENT assets, which is why the column exists');
  ok(t.d_most_stretched === 'UNI' && t.d_worst_drawdown === 'XMR', 'stretch and drawdown are their own answers');
  ok(t.d_spread_over_20 === true && t.d_any_stretched === true, 'the threshold probes read off the table');
  ok(t.p_richest_next === undefined, 'with no forward data there is no predictive truth');
  const t2 = carryTruth(r, { XMR: 5, UNI: 90, SOL: -3 });
  ok(t2.p_richest_next === 'UNI', 'predictive truth comes from forward funding the document never saw');
  ok(t2.p_stays_positive === false, 'and a negative forward rate makes that false');

  const p = buildCarryProbes(r);
  const det = Object.keys(p).filter((k) => k.startsWith('d_'));
  const pre = Object.keys(p).filter((k) => k.startsWith('p_'));
  ok(det.length >= 4 && pre.length >= 3, 'both arms are substantial');
  for (const id of pre) ok(/NEXT|will /i.test(p[id].instructions), `${id} is visibly about the future`);
  for (const id of det) ok(!/NEXT/i.test(p[id].instructions), `${id} asks nothing about the future`);
  for (const [id, q] of Object.entries(p)) {
    if (q.type === 'choice') ok(Object.keys(q.criteria).every((k) => r.rows.some((x) => x.coin === k)),
      `${id} can only name an asset in the cross-section`);
  }
  // Nothing may ask whether to put the trade on. Five times over this surface
  // measured that weighing a future is refused and describing state is not.
  for (const q of Object.values(p)) ok(!/should|worth putting|recommend/i.test(q.instructions),
    'no probe asks whether to take the trade — the harness owns that, the model classifies');
  const withSelf = buildCarryProbes(r, { selfCheck: true });
  ok(Object.keys(withSelf).length === 2 * Object.keys(p).length, 'every probe carries its own self-check');
}

// ------------------------------------------------------- the composition loop ----
{
  // THE SAFETY PROPERTY. Every enumerated move is a clamped, buildable genome,
  // so no round of the loop can produce an invalid creature WHATEVER the model
  // answers — including if it answers nonsense. That is the claim the CAD
  // section only gestured at, and it lives entirely in the enumerator.
  const g = { ...DEFAULT_GENES };
  const moves = legalMoves(g);
  ok(moves.length === 2 * MOVABLE.length, 'both directions are offered for every movable gene');
  for (const mv of moves) {
    for (const k of MOVABLE) {
      const v = mv.genes[k];
      const lo = k === 'stance' ? BOUNDS.stanceLo : BOUNDS.lo;
      const hi = k === 'stance' ? BOUNDS.stanceHi : BOUNDS.hi;
      ok(v >= lo - 1e-9 && v <= hi + 1e-9, `${mv.id} leaves ${k} inside the generator's own bounds`);
    }
    ok(Object.keys(mv.genes).length === Object.keys(g).length, `${mv.id} adds no gene the generator does not know`);
  }
  // A move that would change nothing is not offered: a choice carrying an
  // option that does nothing is a forced move dressed up as a decision.
  const atTop = { ...DEFAULT_GENES, leg: BOUNDS.hi };
  ok(!legalMoves(atTop).some((mv) => mv.id === 'leg_up'), 'a gene at its bound offers no move in that direction');
  ok(legalMoves(atTop).some((mv) => mv.id === 'leg_down'), 'but still offers the other way');

  // Traits are computed from the genome, never asked for.
  const t = traits(g);
  for (const k of TRAIT_KEYS) ok(Number.isFinite(t[k]), `${k} is a number`);
  ok(traits({ ...g, leg: 1.8 }).legToBody > t.legToBody, 'longer legs read as leggier');
  ok(traits({ ...g, depth: 1.8 }).bulk > t.bulk, 'a thicker trunk reads as bulkier');

  // A brief is a TARGET in trait space, so "did it get there" is a distance and
  // not a matter of taste — which is the only reason sprites can carry a
  // rigorous experiment at all.
  for (const [k, b] of Object.entries(BRIEFS)) {
    ok(typeof b.label === 'string' && b.label.length > 4, `${k} has a readable label`);
    for (const tk of TRAIT_KEYS) ok(Number.isFinite(b.target[tk]), `${k} targets ${tk}`);
  }
  ok(briefDistance(g, BRIEFS.sprinter) > 0, 'a default genome is some distance from a brief');
}
{
  // THE CRITERIA FIX, pinned. The thin form hands over several trait deltas per
  // option and leaves the model to combine them — multi-step arithmetic, which
  // scored 62.5% on this surface until the caller did it. The default hands
  // over the single resulting gap, already combined.
  const g = { ...DEFAULT_GENES };
  const moves = legalMoves(g);
  const thin = moveCriteria(moves, g, BRIEFS.sprinter, { computed: false });
  const rich = moveCriteria(moves, g, BRIEFS.sprinter);
  for (const id of Object.keys(rich)) {
    ok(!/Overall gap/.test(thin[id]), `${id}: the thin control does NOT pre-combine the traits`);
    ok(/Overall gap to the brief would go from [\d.]+ to [\d.]+/.test(rich[id]),
      `${id}: the shipped form states the resulting gap, in the direction the question is read`);
  }
  ok(Object.keys(rich).length === moves.length, 'every legal move gets criteria and no others do');
}
{
  // The chain. Greedy is the myopic ceiling, random the floor — on the SAME
  // start, because a chain can reach a good place by luck.
  const run = async (pick) => runChain({ genes: { ...DEFAULT_GENES, ...FAMILIES.hound },
    brief: BRIEFS.sprinter, steps: 12, pick });
  const grd = await run(greedyPick);
  const rnd = await run(randomPick(11));
  const gs = chainStats(grd), rs = chainStats(rnd);
  ok(grd.end < grd.start, 'greedy closes the gap');
  near(gs.meanRegret, 0, 1e-9, 'and by construction has zero regret — it IS the myopic optimum');
  ok(gs.tookWorst === 0, 'greedy never takes the worst move on offer');
  ok(rs.meanRegret > gs.meanRegret, 'random regrets more than greedy');
  ok(rnd.end > grd.end, 'and ends further from the brief');
  ok(gs.steps === 12 && rs.steps === 12, 'both ran the full chain');

  // The trace is the unit of analysis, not the final artifact: only per-step
  // regret separates "picked well" from "started somewhere lucky".
  for (const st of grd.trace.filter((x) => x.step >= 0)) {
    ok(Number.isFinite(st.bestAvailable) && Number.isFinite(st.worstAvailable),
      'each step records the best and worst move that was ON OFFER at the time');
    ok(st.bestAvailable <= st.worstAvailable, 'and they are the right way round');
    near(st.distance, st.bestAvailable, 1e-9, 'greedy always lands on the best available');
  }
  // A picker that refuses must not corrupt the chain.
  const refused = await run(() => null);
  ok(refused.end === refused.start, 'a picker that chooses nothing leaves the genome untouched');
  ok(chainStats(refused) === null, 'and reports no stats rather than inventing them');

  // Determinism: the same seed gives the same chain, so a run is repeatable.
  const a = await run(randomPick(5)), b = await run(randomPick(5));
  ok(JSON.stringify(a.trace.map((x) => x.id)) === JSON.stringify(b.trace.map((x) => x.id)),
    'a seeded control replays exactly');
}
{
  // The document states the gap in the direction the question is read, and
  // carries the chain's own history — the dungeon needed exactly this, for
  // exactly the same reason.
  const g = { ...DEFAULT_GENES };
  const doc = composeDoc(g, legalMoves(g), BRIEFS.grazer, { step: 3, total: 10,
    history: [{ id: 'neck_up', before: 0.5, after: 0.4 }] });
  ok(/THE BRIEF: a long-necked grazer/.test(doc), 'the brief is stated');
  ok(/edit 4 of 10/.test(doc), 'and where in the chain it is');
  ok(/EDITS ALREADY MADE/.test(doc) && /neck_up/.test(doc), 'and what it has already done');
  ok(/positive gap means the trait needs to go UP/.test(doc),
    'with the sign convention spelled out, pointing the way the question points');
  ok(!/EDITS ALREADY MADE/.test(composeDoc(g, legalMoves(g), BRIEFS.grazer, { step: 0, total: 10 })),
    'and no history block on the first edit, rather than an empty one');
}

// ------------------------------------- the composer's measured trait space ----
{
  // THE TRAITS ARE COUNTED FROM THE CELLS, so they can be checked against
  // shapes whose answers are known by hand. This is the part that could
  // silently lie — a trait that is subtly wrong would still produce a tidy
  // chain, and the model would be judging my arithmetic back to me.
  const rect = (w, h) => { const c = []; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) c.push({ x, y }); return c; };
  const sq = measure(rect(10, 10));
  near(sq.aspect, 1, 1e-9, 'a square reads aspect 1');
  near(sq.coverage, 1, 1e-9, 'a solid block is fully covered');
  near(sq.symmetry, 1, 1e-9, 'and perfectly symmetric about its own centre line');
  near(sq.centroidY, 0.5, 1e-9, 'with its mass in the middle');
  ok(sq.ink === 100, 'ink counts the cells');

  const wide = measure(rect(20, 5));
  near(wide.aspect, 4, 1e-9, 'a 20x5 block reads aspect 4');
  const tall = measure(rect(5, 20));
  near(tall.aspect, 0.25, 1e-9, 'and its transpose reads 0.25');

  // Top-heavy: mass in the upper half of its own bounding box.
  const topHeavy = [...rect(10, 3), { x: 4, y: 12 }];
  ok(measure(topHeavy).centroidY < 0.2, 'mass gathered at the top reads a low centroidY');
  const botHeavy = [{ x: 4, y: 0 }, ...rect(10, 3).map((c) => ({ x: c.x, y: c.y + 10 }))];
  ok(measure(botHeavy).centroidY > 0.8, 'and gathered at the bottom, a high one');

  // Sparse vs solid, at the SAME bounding box — coverage must separate them.
  const sparse = rect(10, 10).filter((c) => (c.x + c.y) % 3 === 0);
  ok(measure(sparse).coverage < 0.4 && measure(sparse).ink < sq.ink,
    'a lattice in the same box is less covered, and lighter');
  near(measure(sparse).aspect, 1, 0.2, 'while its aspect is unchanged — the traits are independent');

  // Asymmetry must actually register.
  const lop = [...rect(10, 10), ...rect(4, 4).map((c) => ({ x: c.x + 12, y: c.y }))];
  ok(measure(lop).symmetry < 0.95, 'a lump on one side costs symmetry');
  ok(measure([]) === null, 'no cells is null rather than a shape with no ink');
  ok(measure(null) === null, 'and so is nothing at all');
}
{
  // Every generator must draw, measure, and offer moves. A family that throws
  // or draws nothing would show as an empty panel on the page and as a silent
  // skip here, so it is asserted per family rather than in aggregate.
  for (const [id, g] of Object.entries(GENERATORS)) {
    const t = traitsOf(id, { ...g.defaults });
    ok(t !== null, `${id} renders cells at its defaults`);
    for (const k of TRAITS) ok(Number.isFinite(t[k]), `${id} measures ${k}`);
    ok(t.ink > 50, `${id} draws a real creature, not a speck (${t?.ink} cells)`);
    ok(t.coverage > 0 && t.coverage <= 1, `${id} coverage is a fraction`);
    ok(t.symmetry >= 0 && t.symmetry <= 1, `${id} symmetry is a fraction`);

    const moves = genMoves(id, { ...g.defaults });
    ok(moves.length >= 8, `${id} offers a real option set (${moves.length})`);
    for (const mv of moves) {
      const [lo, hi] = g.bounds[mv.gene];
      ok(mv.to >= lo - 1e-9 && mv.to <= hi + 1e-9,
        `${id}/${mv.id} stays inside the generator's own bounds — the safety property`);
      ok(Math.abs(mv.to - mv.from) > 1e-9, `${id}/${mv.id} actually changes something`);
      if (g.int?.includes(mv.gene)) {
        ok(Number.isInteger(mv.to), `${id}/${mv.id} keeps ${mv.gene} a whole number`);
      }
      ok(traitsOf(id, mv.genes) !== null, `${id}/${mv.id} still renders — no move produces a blank`);
    }
    // A gene pinned at its bound offers no move in that direction.
    const k = g.movable[0], [lo] = g.bounds[k];
    ok(!genMoves(id, { ...g.defaults, [k]: lo }).some((mv) => mv.id === `${k}_down`),
      `${id}: a gene at its floor offers no downward move`);
  }
}
{
  // The trait space must actually SEPARATE the families, or a shared brief is
  // meaningless and the overlay is decoration.
  const t = Object.fromEntries(Object.keys(GENERATORS).map((id) =>
    [id, traitsOf(id, { ...GENERATORS[id].defaults })]));
  ok(t.axial.aspect > t.isopod.aspect, 'an undulator is wider-than-tall against an isopod');
  ok(t.isopod.symmetry > t.quad.symmetry, 'a top-down isopod is more symmetric than a quadruped in profile');
  ok(t.radial.coverage < t.isopod.coverage, 'a brittle-star is sparser than an armoured pillbug');
  const aspects = Object.values(t).map((x) => x.aspect);
  ok(Math.max(...aspects) - Math.min(...aspects) > 1.5, 'and the families spread across the aspect axis');
}
{
  // The briefs are written ONCE in the measured space, so the same one has to
  // be reachable-ish from every family rather than being secretly per-family.
  for (const [bid, brief] of Object.entries(GEN_BRIEFS)) {
    ok(typeof brief.label === 'string' && brief.label.length > 8, `${bid} has a readable label`);
    for (const id of Object.keys(GENERATORS)) {
      const d = genDistance(traitsOf(id, { ...GENERATORS[id].defaults }), brief);
      ok(Number.isFinite(d) && d > 0, `${bid} is a finite, non-zero distance from ${id}'s default`);
    }
  }
  ok(genDistance(null, GEN_BRIEFS.compact) === Infinity, 'an unrenderable genome is infinitely far, not zero');
}
{
  // The criteria must pre-combine the gap — the lesson that cost 0.717 regret.
  const id = 'quad';
  const genes = { ...GENERATORS[id].defaults };
  const cur = traitsOf(id, genes);
  const moves = genMoves(id, genes).map((m) => ({ ...m, traits: traitsOf(id, m.genes) }));
  const c = genCriteria(moves, cur, GEN_BRIEFS.compact);
  ok(Object.keys(c).length === moves.length, 'every legal move gets criteria and no others do');
  for (const k of Object.keys(c)) {
    ok(/Overall gap to the brief would go from [\d.]+ to [\d.]+/.test(c[k]),
      `${k} states the resulting gap already combined, in the direction the question is read`);
    ok(/Measured from the redrawn sprite/.test(c[k]),
      `${k} says the figures come from the render, not from the genes`);
  }
  const doc = genDoc(id, cur, GEN_BRIEFS.compact, { step: 2, total: 8, history: [{ id: 'leg_up', before: 1, after: 0.9 }] });
  ok(/MEASURED from the sprite as actually drawn/.test(doc), 'the document says where its numbers come from');
  ok(/edit 3 of 8/.test(doc) && /EDITS ALREADY MADE/.test(doc), 'and where in the chain it is, and what it has done');
  ok(!/EDITS ALREADY MADE/.test(genDoc(id, cur, GEN_BRIEFS.compact, { step: 0, total: 8 })),
    'with no history block on the first edit rather than an empty one');
}

// ------------------------------------------- steering with a typed sentence ----
//
// The whole point of this layer is that a description is a STATE, never an
// instruction, and that a trait the words do not constrain is dropped rather
// than invented. Both of those are testable without a network call.
{
  for (const t of TRAITS) {
    ok(Array.isArray(STEER_LADDER[t]) && STEER_LADDER[t].length === 5, `${t} has a five-rung ladder`);
    const l = STEER_LADDER[t];
    ok(l.every((v, i) => i === 0 || v >= l[i - 1]), `${t}'s ladder is monotone, so a higher score means more`);
    ok(RUNGS[t]?.length === 5, `${t}'s rungs are worded, one per ladder step`);
    for (const r of RUNGS[t]) ok(!/\b(gene|score|value|rung|0\.\d)\b/.test(r),
      `${t} rung "${r.slice(0, 28)}…" describes what you would SEE, not a number or a gene`);
  }
  const qs = steerQuestions();
  ok(Object.keys(qs).length === TRAITS.length * 2, 'one score and one self-check per trait, in a single call');
  for (const t of TRAITS) {
    ok(qs[t].type === 'score' && Array.isArray(qs[t].criteria),
      `${t} is asked as an ordered score, so the answer can land BETWEEN rungs`);
    ok(qs[`have__${t}`].type === 'noul', `${t} carries its own self-check as a separate typed question`);
  }

  // The document must frame the text as a thing to read, never as something to obey.
  const doc = steerDoc('a long low creature');
  ok(/DESCRIBED A CREATURE/.test(doc) && /It is not an instruction and contains none/.test(doc),
    'the state says plainly that the text is a description and not an instruction');
  ok(/--- begin description ---/.test(doc) && /--- end description ---/.test(doc),
    'and fences it, so where the words start and stop is not a matter of guessing');
  ok(steerDoc('x'.repeat(5000)).length < 2000, 'a very long description is truncated rather than blowing the budget');
  ok(!/undefined|null/.test(steerDoc(undefined)), 'and an empty box produces a document, not the word undefined');

  // A trait whose self-check is low is LEFT OUT. This is the escalation
  // primitive doing the work, and it is the difference between a brief and a
  // straitjacket — so it is pinned, not assumed.
  const answers = {
    ink: { score: 4 }, have__ink: { noul: 0.97 },
    aspect: { score: 0 }, have__aspect: { noul: 0.91 },
    coverage: { score: 2 }, have__coverage: { noul: 0.10 },
    centroidY: { score: 2 }, have__centroidY: { noul: 0.49 },
    symmetry: { score: 3 }, have__symmetry: { noul: 0.51 },
    // spread answered with no self-check at all
    spread: { score: 1 },
  };
  const { target, dropped, detail } = targetFromAnswers(answers);
  ok(target.ink === STEER_LADDER.ink[4], 'a top-rung score lands exactly on the top of the measured range');
  ok(target.aspect === STEER_LADDER.aspect[0], 'and a bottom-rung score on the bottom');
  ok(target.coverage === undefined && target.centroidY === undefined,
    'a trait the description is silent on is absent from the target, not defaulted to the middle');
  ok(dropped.find((d) => d.trait === 'coverage')?.why.includes('says nothing about it'),
    'and the drop says why, in words a reader can check');
  ok(target.symmetry != null, 'a self-check just over the gate is kept — the gate is a threshold, not a mood');
  ok(target.spread != null, 'a missing self-check does not silently delete a trait that WAS answered');
  ok(detail.ink.rung === RUNGS.ink[4], 'the detail reports the rung wording, so the number is legible');

  // Interpolation is the entire reason for `score` over `choice`.
  const mid = targetFromAnswers({ aspect: { score: 2.5 }, have__aspect: { noul: 1 } }).target.aspect;
  ok(mid > STEER_LADDER.aspect[2] && mid < STEER_LADDER.aspect[3],
    'a fractional score lands strictly between its two rungs rather than snapping to one');
  ok(Math.abs(mid - (STEER_LADDER.aspect[2] + STEER_LADDER.aspect[3]) / 2) < 1e-9,
    'and lands exactly halfway on a .5, which is what an expectation over rungs means');
  const hi = targetFromAnswers({ ink: { score: 99 }, have__ink: { noul: 1 } }).target.ink;
  ok(hi === STEER_LADDER.ink[4], 'an out-of-range score clamps to the ladder instead of extrapolating off it');

  // A brief with nothing in it must announce itself. Running a chain against an
  // empty target is a random walk with a caption, which is the one failure mode
  // that would look like a working demo.
  const none = targetFromAnswers({ ink: { score: 3 }, have__ink: { noul: 0.02 } });
  ok(Object.keys(none.target).length === 0, 'a description that constrains nothing yields no target at all');

  // And the derived brief must be an ORDINARY brief — the downstream code has
  // no special case for a partial one, and this is what says so.
  const partial = { label: 'typed', target: targetFromAnswers(answers).target };
  const t0 = traitsOf('quad', GENERATORS.quad.defaults);
  ok(Number.isFinite(genDistance(t0, partial)), 'briefDistance takes a partial target without a special case');
  const pdoc = genDoc('quad', t0, partial, { step: 0, total: 6 });
  ok(!/coverage/.test(pdoc.split('edit 1 of 6')[0]),
    'and the state document lists only the traits the brief actually constrains');

  // The injected `ask` is the seam that keeps this testable without a network.
  const stub = async (state, questions) => {
    ok(/begin description/.test(state), 'briefFromText posts the fenced document as the state');
    ok(Object.keys(questions).length === TRAITS.length * 2, 'and the full question set in one call');
    return { source: 'stub', answers: { aspect: { score: 4 }, have__aspect: { noul: 0.9 } } };
  };
  const b = await briefFromText('much wider than tall', stub);
  ok(b.empty === false && b.target.aspect === STEER_LADDER.aspect[4], 'and returns a usable brief');
  ok(b.label === 'much wider than tall', 'labelled with the words the person actually typed');
  ok((await briefFromText('', async () => ({ answers: {} }))).empty === true,
    'while an empty result is flagged empty rather than handed on as a brief');
}

if (failures.length) {
  console.error(`✗ lab selftest: ${failures.length} failure(s) of ${passed + failures.length} checks\n`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`✓ lab selftest: ${passed} checks passed`);
