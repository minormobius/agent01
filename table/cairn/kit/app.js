// table/cairn/kit/app.js — the page around the allocator.
//
// condition.js owns the measurement; this file owns the DOM and one thing that
// matters more than it looks: the allocator is a GENERATOR, and this drives it
// in slices between animation frames. Running it straight through would freeze
// the tab for two or three seconds with no explanation, on a page whose whole
// pitch is that it is doing real work — so the work is visible.

import { rollParty, packInventory, coinSeed } from '../roll.js';
import { combatantFromCharacter } from '../combat.js';
import { kitParty } from '../condition.js';
import { overviewCard } from '../overview-card.js';

const $ = (id) => document.getElementById(id);
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/** The SRD's light markdown: **item** and *quality*. Escaped first. */
const md = (s) => escapeHtml(s)
  .replace(/\*\*([^*]+)\*\*/g, '<span class="t">$1</span>')
  .replace(/\*([^*]+)\*/g, '<em>$1</em>');

const state = { seed: '', size: 4, source: 'found', count: 8, party: [], result: null, running: false };

function readHash() {
  const p = new URLSearchParams(location.hash.replace(/^#/, ''));
  return {
    seed: p.get('s') || '',
    size: Math.min(6, Math.max(1, Number(p.get('n')) || 4)),
    source: p.get('src') === 'bought' ? 'bought' : 'found',
    count: Math.min(12, Math.max(4, Number(p.get('h')) || 8)),
  };
}

function writeHash() {
  const p = new URLSearchParams({ s: state.seed, n: String(state.size) });
  if (state.source !== 'found') p.set('src', state.source);
  if (state.count !== 8) p.set('h', String(state.count));
  history.replaceState(null, '', `#${p}`);
}

function say(message) {
  $('status').textContent = message;
  clearTimeout(say.timer);
  say.timer = setTimeout(() => { $('status').textContent = ''; }, 3000);
}

// ------------------------------------------------------------------ the card

function renderCard() {
  const now = (state.result ? state.result.members : state.party).map((c) => combatantFromCharacter(c));
  const was = state.result ? state.party.map((c) => combatantFromCharacter(c)) : null;
  $('overview').hidden = false;
  $('overview').innerHTML = overviewCard(now, {
    was,
    tail: was
      ? '<p class="ov-note">The dashed shape is the party as they were rolled. Everything '
        + 'outside it was bought with a slot.</p>'
      : '',
  });
}

// --------------------------------------------------------------- the results

function renderResult() {
  const r = state.result;
  if (!r) { $('result').innerHTML = ''; return; }

  const gain = (g, se) => `+${g.toFixed(3)} <span class="se">± ${se.toFixed(3)}</span>`;

  const awards = r.awards.map((a) => {
    const others = a.alternatives
      .filter((x) => x.who !== a.to)
      .sort((x, y) => y.gain - x.gain)
      .map((x) => (x.noRoom
        ? `${escapeHtml(x.who)} no room`
        : `${escapeHtml(x.who)} ${x.gain >= 0 ? '+' : ''}${x.gain.toFixed(3)}`))
      .join(' · ');
    const notes = [];
    if (a.tiedWith.length) {
      notes.push(`<b>A tie.</b> ${escapeHtml(a.tiedWith.join(' and '))} `
        + `${a.tiedWith.length === 1 ? 'gains' : 'gain'} the same within the error, so this went `
        + 'to whoever had the most room — the simulation did not choose');
    }
    if (a.droppedFor.length) {
      notes.push(`dropped ${a.droppedFor.map(escapeHtml).join(', ')} to make space`);
    }
    return `<li class="award">
      <div class="top">
        <span class="what">${md(a.item.text)}</span>
        <span class="to">${escapeHtml(a.to)}</span>
        <span class="gain">${gain(a.gain, a.se)}</span>
      </div>
      <div class="why"><span class="alt">${others}</span>${notes.length ? ` — ${notes.join('; ')}` : ''}</div>
    </li>`;
  }).join('');

  // The floor. Grouped by reason, because eight identical lines is not eight
  // findings — and a page that lists what it REFUSED to hand out is telling you
  // something a page that only lists winners cannot.
  const byReason = new Map();
  for (const l of r.left) {
    if (!byReason.has(l.why)) byReason.set(l.why, []);
    byReason.get(l.why).push(l.item.name);
  }
  const floor = [...byReason].map(([why, items]) => `<div class="floor">
      <b>Left on the floor</b> — ${escapeHtml(why)}.
      <div class="items">${items.map(escapeHtml).join(' · ')}</div>
    </div>`).join('');

  const packs = r.members.map((m, i) => {
    const inv = packInventory(m.gear);
    const got = new Set(r.awards.filter((a) => a.holder === i).map((a) => a.item.name));
    const lines = inv.slots
      .map((cell) => (cell && cell.part !== 2 ? cell.item : null))
      .filter(Boolean)
      .map((item) => `<li class="${got.has(item.name) ? 'got' : ''}">${escapeHtml(item.name)}</li>`)
      .join('');
    return `<div class="pack">
      <h3>${escapeHtml(m.name)} <span>${inv.used}/${inv.capacity} · ${inv.armor} armour</span></h3>
      <ul>${lines}</ul>
    </div>`;
  }).join('');

  const total = r.awards.reduce((s, a) => s + a.gain, 0);
  $('result').innerHTML = `
    <div class="sec">
      <h2>What went where
        <span class="note">${r.awards.length} of ${r.awards.length + r.left.length} handed out ·
        about ${total.toFixed(2)} of a body's worth of casualties averted</span>
      </h2>
      <ul class="awards">${awards || '<li class="award"><div class="why">Nothing in this haul was worth a slot.</div></li>'}</ul>
      ${floor}
      <p class="ov-note" style="margin-top:0.7rem">
        Each figure is the fraction of the party that stops dying across a
        goblin swarm, a bandit pack and an ogre, measured with and without the item on the same
        dice, ${r.trials} trials in ${r.blocks} blocks — the ± is the spread across those blocks.
        A gain smaller than its own ± is not a finding, and nothing below that line was handed out.
      </p>
    </div>

    <div class="sec">
      <h2>The packs <span class="note">Cairn leaves the tenth slot empty on purpose — a full pack is 0 HP</span></h2>
      <div class="packs">${packs}</div>
    </div>

    <div class="onward-row">
      <a href="../encounter/${location.hash}"><b>Encounter oracle →</b>
        <span>Pick a fight and see what it costs this party, now that they are carrying this.</span></a>
      <a href="../trials/${location.hash}"><b>The trials →</b>
        <span>Eight fights up a ladder, wounds carried between them. Strength does not come back.</span></a>
      <a href="../arena/${location.hash}"><b>The arena →</b>
        <span>Watch one fight play out round by round, or pilot it yourself.</span></a>
    </div>`;
}

// -------------------------------------------------------------- the allocator

function reroll() {
  state.party = rollParty(state.seed, state.size).members;
  state.result = null;
  renderCard();
  renderResult();
  writeHash();
}

function run() {
  if (state.running) return;
  state.running = true;
  $('run').disabled = true;
  $('run-progress').hidden = false;

  // kitParty owns the seed derivation, so the trials screen this links to
  // reproduces exactly this haul and exactly this allocation.
  const it = kitParty(state.party, {
    seed: state.seed, count: state.count, source: state.source, trials: 400,
  });

  // Slice the work between frames. Roughly 60ms per slice keeps the bar moving
  // without spending more time yielding than simulating.
  const step = () => {
    const until = performance.now() + 60;
    let next = it.next();
    while (!next.done && performance.now() < until) next = it.next();
    if (next.done) {
      state.result = next.value;
      state.running = false;
      $('run').disabled = false;
      $('run-progress').hidden = true;
      renderCard();
      renderResult();
      const n = state.result.haul.items.length;
      if (!n) { say('that budget buys nothing'); return; }
      say(`${state.result.awards.length} of ${n} were worth a slot`);
      return;
    }
    const { progress, of, note } = next.value;
    $('bar').style.width = `${Math.min(100, (progress / of) * 100).toFixed(1)}%`;
    $('progress-note').textContent = `playing the fights — ${note}`;
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ---------------------------------------------------------------- behaviour

$('run').addEventListener('click', run);
// A fresh party AND a fresh haul, because the seed drives both. Without this
// the screen was one party for as long as you stayed on it.
$('roll').addEventListener('click', () => {
  if (state.running) return;
  state.seed = coinSeed();
  $('seed').value = state.seed;
  reroll();
  say('new party, new haul');
});
$('seed').addEventListener('change', () => {
  state.seed = $('seed').value.trim() || coinSeed();
  $('seed').value = state.seed;
  reroll();
});
for (const [id, key, cast] of [['size', 'size', Number], ['source', 'source', String], ['count', 'count', Number]]) {
  $(id).addEventListener('change', () => {
    state[key] = cast($(id).value);
    // Party size changes who is here; haul settings only change what is on the
    // table, so they do not need a reroll — but both invalidate an allocation.
    if (key === 'size') reroll(); else { state.result = null; renderCard(); renderResult(); writeHash(); }
  });
}
$('copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(location.href);
    say('link copied — it rolls this party and this haul');
  } catch { say(location.href); }
});

// ------------------------------------------------------------------- start

// Take every field readHash returns, so adding one there cannot be silently
// dropped here — see the same note in ../trials/app.js, where it was.
Object.assign(state, readHash());
state.seed = state.seed || coinSeed();
$('seed').value = state.seed;
$('size').value = String(state.size);
$('source').value = state.source;
$('count').value = String(state.count);
reroll();
