// table/cairn/trials/app.js — the page around the ladder.
//
// trials.js owns the run; this owns the DOM and the pacing. The pacing is the
// design: the oracle weighs each rung BEFORE you commit to it, so the page
// always shows you the odds and then waits. A roguelite that rolls the next
// fight the instant you finish the last one is a slot machine; one that tells
// you the fight ahead costs 27% of your party and makes you press the button is
// a decision.
//
// Everything slow — searching for a rung, allocating a reward — is a generator
// or a chunked loop, so the tab never locks up without saying why.

import { coinSeed } from '../roll.js';
import { combatantFromCharacter } from '../combat.js';
import { kitParty } from '../condition.js';
import { decodeFormation, encodeFormation, partyWithGear } from '../formation.js';
import { overviewCard } from '../overview-card.js';
import {
  RUNGS, MODES, newRun, combatants, standing, findRung, fightRung, rewardRung,
} from '../trials.js';

const $ = (id) => document.getElementById(id);
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// The formation IS the state: the roll, the size, the player's edits on the
// roller, and the kit settings, all in one string. Every field this page needs
// used to be re-parsed here with its own defaults, which is how a party built
// two screens ago arrived as somebody else. See ../formation.js.
const state = {
  formation: null, extras: null,
  party: [], run: null, entry: null, pending: null, busy: false,
};

function writeHash() {
  history.replaceState(null, '', `#${encodeFormation(state.formation)}`);
}
function say(m) {
  $('status').textContent = m;
  clearTimeout(say.timer);
  say.timer = setTimeout(() => { $('status').textContent = ''; }, 3200);
}
function busy(on, note = '') {
  state.busy = on;
  $('begin').disabled = on;
  $('progress').hidden = !on;
  $('progress-note').textContent = note;
  if (!on) $('bar').style.width = '0%';
}

// -------------------------------------------------------------- the drawing

function drawRungs() {
  const run = state.run;
  $('rungs').innerHTML = RUNGS.map((t, i) => {
    const trial = run && run.history[i];
    const cls = trial
      ? (trial.lost.length ? 'done cost' : 'done')
      : (run && i === run.rung && !run.over ? 'now' : '');
    return `<div class="rung ${cls}" title="target toll ${t.toFixed(2)}${
      trial ? ` — ${trial.count}× ${trial.monster}` : ''}">
      <span class="n">${i + 1}</span>${Math.round(t * 100)}%</div>`;
  }).join('');
}

function drawRoster() {
  const run = state.run;
  if (!run) { $('roster').innerHTML = ''; return; }
  $('roster').innerHTML = run.roster.map((r) => {
    const max = r.character.attributes.STR;
    const now = r.dead ? 0 : (r.str === null ? max : r.str);
    const frac = max ? now / max : 0;
    return `<div class="who ${r.dead ? 'gone' : ''} ${frac < 0.6 ? 'hurt' : ''}">
      <div class="nm"><span>${escapeHtml(r.character.name)}</span>
        <em>${r.dead ? 'dead' : `STR ${now}/${max}`}</em></div>
      <div class="str"><i style="width:${(frac * 100).toFixed(0)}%"></i></div>
      <div class="line">${escapeHtml(r.character.background.name)}${
  r.fell ? ` · dragged back ×${r.fell}` : ''}${
  r.extras.length ? ` · +${r.extras.length} carried` : ''}</div>
    </div>`;
  }).join('');
}

function drawCard() {
  const run = state.run;
  // Before the run starts, show the party AS THEY WILL WALK IN — kit included.
  // This page used to draw the bare roll here and only apply the kit once you
  // pressed Begin, so a party you had just built next door appeared to lose its
  // weapon and half its score the moment you arrived.
  const now = run
    ? combatants(run).filter((c) => !c.dead)
    : state.party.map((c, i) => combatantFromCharacter(c, (state.extras && state.extras[i]) || []));
  if (!now.length) { $('overview').hidden = true; return; }
  $('overview').hidden = false;
  $('overview').innerHTML = overviewCard(now, { was: state.entry });
}

function drawNext() {
  const run = state.run;
  const p = state.pending;
  if (!p || !run || run.over) { $('next').hidden = true; return; }
  const v = p.verdict;
  $('next').hidden = false;
  $('next').innerHTML = `
    <h2>Rung ${run.rung + 1} of ${RUNGS.length} — ${p.count}× ${escapeHtml(p.monster.name)}</h2>
    <div class="odds">
      the oracle weighed this fight against your party as they stand:
      <b class="${v.band}">${v.band}</b> ·
      <b>${Math.round(v.toll * 100)}%</b> of the party expected to fall ·
      <b>${Math.round(v.swing * 100)}%</b> chance of a wipe
      ${p.approximate ? ' · <em>closest available — nothing in the bestiary lands on this rung for you</em>' : ''}
    </div>
    <div class="go">
      <button class="primary" data-act="fight">Go in</button>
      <button data-act="auto">Run the rest automatically</button>
    </div>`;
}

function drawLog() {
  const run = state.run;
  if (!run || !run.history.length) { $('log').innerHTML = ''; return; }
  const rows = run.history.map((t) => {
    const worse = t.actualToll > t.forecast.toll + 0.15;
    const better = t.actualToll < t.forecast.toll - 0.15;
    const verdict = t.lost.length
      ? `${t.lost.length} dead`
      : (t.stabilised.length ? `${t.stabilised.length} down, dragged back` : 'clean');
    return `<div class="trial">
      <div class="head">
        <span class="r">rung ${t.rung + 1}</span>
        <span>${t.count}× ${escapeHtml(t.monster)}</span>
        <span class="verdict ${t.lost.length ? 'bad' : (t.stabilised.length ? '' : 'clean')}">${verdict}</span>
      </div>
      <div class="note">
        forecast ${Math.round(t.forecast.toll * 100)}% · actual ${Math.round(t.actualToll * 100)}%
        ${worse ? ' — <b>worse than the oracle said</b>' : ''}${better ? ' — better than the oracle said' : ''}
        · ${t.rounds} round${t.rounds === 1 ? '' : 's'}${t.routed ? ' · they broke and ran' : ''}
        ${t.lost.length ? ` · <b>lost ${t.lost.map(escapeHtml).join(', ')}</b>` : ''}
      </div>
      ${t.log && t.log.length ? `<details><summary>every blow</summary>
        <div class="log">${t.log.map(escapeHtml).join('<br>')}</div></details>` : ''}
    </div>`;
  }).join('');

  // Forecast vs actual, over the whole run. A player who lost a party wants to
  // know whether the ladder was unfair or the dice were, and the two are
  // distinguishable: the oracle's forecast is on record for every rung.
  const f = run.history.reduce((s, t) => s + t.forecast.toll, 0) / run.history.length;
  const a = run.history.reduce((s, t) => s + t.actualToll, 0) / run.history.length;
  $('log').innerHTML = `<div class="sec">
    <h2>The run so far
      <span class="note">forecast ${Math.round(f * 100)}% a rung, actually cost ${Math.round(a * 100)}% —
      ${a > f + 0.08 ? 'the dice were against you' : (a < f - 0.08 ? 'the dice were kind' : 'about as weighed')}</span>
    </h2>${rows}</div>`;
}

function drawOutcome() {
  const run = state.run;
  if (!run || !run.over) { $('outcome').innerHTML = ''; return; }
  const left = standing(run);
  const dead = run.roster.filter((r) => r.dead).map((r) => r.character.name);
  const won = run.outcome === 'survived';
  $('outcome').innerHTML = `<div class="outcome ${won ? '' : 'wiped'}">
    <h2>${won ? `All ${RUNGS.length} rungs, and ${left.length} walked out`
    : `The run ends at rung ${run.history.length} of ${RUNGS.length}`}</h2>
    <p>
      ${dead.length ? `Buried: <strong>${dead.map(escapeHtml).join(', ')}</strong>. ` : 'Nobody died. '}
      ${left.length ? `Still standing: ${left.map((r) => escapeHtml(r.character.name)).join(', ')}.` : 'Nobody is left to carry the bodies.'}
      ${run.mode === 'scaled'
    ? ' This ladder re-weighed itself against you at every rung, so growing stronger bought a bigger fight rather than better odds — the loot changed what you faced, not whether you lived. Try <em>fixed at the door</em> if you want the kit to count.'
    : ' This ladder was weighed once, at the door. Everything you were given along the way was worth something.'}
    </p>
  </div>`;
}

function draw() {
  drawRungs(); drawRoster(); drawCard(); drawNext(); drawLog(); drawOutcome();
}

// --------------------------------------------------------------- the driving

/** Weigh the next rung. Chunked so the bar moves while the oracle works. */
function scout(then) {
  const run = state.run;
  if (run.over) { state.pending = null; draw(); return; }
  busy(true, `weighing rung ${run.rung + 1} against your party…`);
  // findRung is not a generator — it is a few hundred milliseconds — so one
  // frame of breathing room is enough to get the bar on screen first.
  requestAnimationFrame(() => setTimeout(() => {
    const against = run.mode === 'fixed' ? state.entryCombatants : combatants(run).filter((c) => !c.down);
    state.pending = findRung(against, RUNGS[run.rung], { seed: `${run.seed}/find/${run.rung}`, trials: 200 });
    busy(false);
    if (!state.pending) { run.over = true; run.outcome = 'no fight found'; }
    draw();
    if (then) then();
  }, 0));
}

function reward(then) {
  const run = state.run;
  if (run.over || !standing(run).length) { then(); return; }
  const it = rewardRung(run, { count: 3, trials: 250 });
  busy(true, 'sharing out what they found…');
  const step = () => {
    const until = performance.now() + 60;
    let next = it.next();
    while (!next.done && performance.now() < until) next = it.next();
    if (next.done) {
      busy(false);
      const got = next.value.awards.length;
      say(got ? `${got} thing${got === 1 ? '' : 's'} worth carrying` : 'nothing worth a slot');
      draw();
      then();
      return;
    }
    $('bar').style.width = `${Math.min(100, (next.value.progress / next.value.of) * 100).toFixed(1)}%`;
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function goIn(auto = false) {
  const run = state.run;
  if (!state.pending || run.over || state.busy) return;
  fightRung(run, state.pending);
  state.pending = null;
  draw();
  if (run.over) { say(run.outcome === 'survived' ? 'they made it' : 'the run is over'); return; }
  reward(() => scout(auto && !run.over ? () => goIn(true) : null));
}

/**
 * Kit the party out before the first rung — by calling the same function the
 * kit screen calls, with the same settings out of the same hash. This page
 * used to roll its own haul from a different seed, so a party you had just
 * built next door arrived carrying somebody else's loot and its score fell.
 */
function kitThenStart(then) {
  const f = state.formation;
  const it = kitParty(state.party, {
    seed: f.seed, count: f.count, source: f.source, trials: 400,
  });
  busy(true, 'kitting them out before the door…');
  const step = () => {
    const until = performance.now() + 60;
    let next = it.next();
    while (!next.done && performance.now() < until) next = it.next();
    if (next.done) { busy(false); then(next.value.extras); return; }
    $('bar').style.width = `${Math.min(100, (next.value.progress / next.value.of) * 100).toFixed(1)}%`;
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function begin() {
  if (state.busy) return;
  state.run = newRun(state.party, {
    seed: state.formation.seed, extras: state.extras, mode: state.formation.mode,
  });
  state.entryCombatants = combatants(state.run);
  draw();
  scout();
}

// ---------------------------------------------------------------- behaviour

$('next').addEventListener('click', (e) => {
  const act = e.target.closest('[data-act]');
  if (!act) return;
  if (act.dataset.act === 'fight') goIn(false);
  if (act.dataset.act === 'auto') goIn(true);
});
$('begin').addEventListener('click', begin);
// Without this the screen was one party for as long as you stayed on it.
/** A new seed is a new party, so the edits made to the old one go with it. */
function reseed(seed) {
  state.formation = { ...state.formation, seed, edits: {} };
  $('seed').value = seed;
  reset();
}
$('roll').addEventListener('click', () => {
  if (state.busy) return;
  reseed(coinSeed());
  say('new party');
});
$('seed').addEventListener('change', () => reseed($('seed').value.trim() || coinSeed()));
$('size').addEventListener('change', () => {
  // Renumbering everybody makes the roller's edits describe strangers, so they
  // go — the same rule the other two screens follow.
  state.formation = { ...state.formation, size: Number($('size').value), edits: {} };
  reset();
});
$('mode').addEventListener('change', () => {
  state.formation = { ...state.formation, mode: $('mode').value };
  reset();
});
$('kit').addEventListener('change', () => {
  state.formation = { ...state.formation, kit: $('kit').checked };
  reset();
});
$('copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(location.href);
    say('link copied — it replays this exact run');
  } catch { say(location.href); }
});

/**
 * Roll the party and, if the kit is on, kit them — BEFORE the run starts, so
 * the card on arrival is the party you are about to send in rather than the
 * bare sheet. The kit is the slow part, so `Begin` stays disabled through it.
 */
function reset() {
  state.run = null;
  state.pending = null;
  state.extras = null;
  // Rebuilt from the formation, never re-rolled: this is the party the roller
  // showed, swaps and background picks and all.
  state.party = partyWithGear(state.formation);
  // The ghost on the radar is always the party as ROLLED, so the card shows
  // everything the kit and then the run have done to them, cumulatively.
  state.entry = state.party.map((c) => combatantFromCharacter(c));
  writeHash();
  draw();
  if (state.formation.kit) kitThenStart((extras) => { state.extras = extras; draw(); });
}

// ------------------------------------------------------------------- start

// One decode, one object. There is no longer a per-page reader to forget a
// field in — which is what happened when `src` and `h` were added to the URL
// and this page went on kitting from a default haul that looked plausible.
state.formation = decodeFormation(location.hash);
if (!state.formation.seed) state.formation.seed = coinSeed();
$('seed').value = state.formation.seed;
$('size').value = String(state.formation.size);
$('mode').value = state.formation.mode;
$('kit').checked = state.formation.kit;
reset();
