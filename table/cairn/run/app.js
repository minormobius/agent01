// table/cairn/run/app.js — the descent.
//
// run.js owns the game; this owns the screen and the turn-taking. The piloted
// fight is the interesting part: `fight()` is a generator that yields a
// decision request and waits, so the page's job is to draw the request, let a
// person answer it, and hand the answer back. No game loop, no tick — the
// fight advances exactly as fast as you decide.
//
// One rule the layout follows: THE PARTY IS ALWAYS ON SCREEN. Every other page
// on this surface can afford to make you scroll for the roster; this one
// cannot, because every decision is about them.

import { coinSeed } from '../roll.js';
import { decodeFormation, encodeFormation } from '../formation.js';
import { pcOptions } from '../combat.js';
import {
  newRun, sheetOf, standing, scout, enterRung, settle,
  takeHeal, takePack, advise, summary, RUNGS, PACK_SIZE, HEAL,
} from '../run.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const S = {
  formation: null,
  run: null,
  bout: null,        // { sent, pcs, foes, generator } while a fight is live
  request: null,     // the decision the fight is waiting on
  events: null,      // the fight's LIVE recorder array, captured once per bout
  drawn: 0,          // how much of it we have rendered
  lines: [],
  held: null,        // the pack card picked up, awaiting a delver
  placement: [],
  oracle: null,      // what the advisor suggested, once asked
  busy: false,
};

function say(m) {
  $('status').textContent = m;
  clearTimeout(say.timer);
  say.timer = setTimeout(() => { $('status').textContent = ''; }, 3200);
}
function busy(on, note = '') {
  S.busy = on;
  $('progress').hidden = !on;
  $('progress-note').textContent = note;
  if (!on) $('bar').style.width = '0%';
}
const writeHash = () => history.replaceState(null, '', `#${encodeFormation(S.formation)}`);

// ------------------------------------------------------------------ drawing

function drawTrack() {
  const run = S.run;
  $('track').innerHTML = RUNGS.map((t, i) => {
    const past = run && run.history[i];
    const cls = past ? (past.lost.length ? 'done cost' : 'done')
      : (run && i === run.rung && !run.over ? 'now' : '');
    return `<div class="pip ${cls}" title="target ${Math.round(t * 100)}% toll${
      past ? ` — ${past.count}× ${esc(past.monster)}` : ''}">${i + 1}</div>`;
  }).join('');
}

/** The band of delvers. Doubles as the target picker while placing a card. */
function drawBand() {
  const run = S.run;
  if (!run) { $('band').innerHTML = ''; return; }
  const live = standing(run);
  const acting = S.request && S.request.actor;
  $('band').innerHTML = run.roster.map((e) => {
    const sheet = sheetOf(e);
    const maxStr = sheet.attributes.STR;
    const str = e.dead ? 0 : (e.str === null ? maxStr : e.str);
    // Hit protection is only meaningful mid-fight; between rungs it is full.
    const inBout = S.bout && S.bout.sent.find((x) => x.entry === e);
    const hp = e.dead ? 0 : (inBout ? inBout.combatant.hp : sheet.hp);
    const holderIndex = live.indexOf(e);
    const pickable = S.held !== null && holderIndex >= 0;
    const scars = e.scars.length;
    const grew = ['hp', 'STR', 'DEX', 'WIL']
      .filter((k) => e.bonus[k]).map((k) => `+${e.bonus[k]} ${k === 'hp' ? 'HP' : k}`).join(' ');
    return `<div class="mate ${e.dead ? 'gone' : ''} ${pickable ? 'pickable' : ''} ${
      acting === e.character.name ? 'acting' : ''}"
      ${pickable ? `data-holder="${holderIndex}"` : ''}>
      <div class="nm"><span>${esc(e.character.name)}</span>
        <em>${e.dead ? 'dead' : `${hp}/${sheet.hp} · STR ${str}/${maxStr}`}</em></div>
      <div class="bars">
        <div class="bar2"><i style="width:${sheet.hp ? (hp / sheet.hp) * 100 : 0}%"></i></div>
        <div class="bar2 str"><i style="width:${(str / maxStr) * 100}%"></i></div>
      </div>
      <div class="tags">${esc(e.character.background.name)}${
  scars ? ` · <b>${scars} scar${scars === 1 ? '' : 's'}${grew ? ` ${grew}` : ''}</b>` : ''}${
  e.won.length ? ` · +${e.won.length} won` : ''}</div>
    </div>`;
  }).join('');
}

function drawFoes() {
  if (!S.bout || !S.request) { $('foes').hidden = true; return; }
  $('foes').hidden = false;
  $('foes').innerHTML = S.request.foes.map((f) => `<button class="foe ${f.down ? 'down' : ''} ${
    S.mark === f.name ? 'marked' : ''}" ${f.down ? 'disabled' : `data-foe="${esc(f.name)}"`}>
    ${esc(f.name)} ${f.down ? '' : `<span style="opacity:.6">${f.hp}hp</span>`}</button>`).join('');
}

/**
 * Drain whatever the fight has recorded since we last drew.
 *
 * Reads `S.events` — the live recorder array captured when the bout began —
 * rather than the current request. Reading it off the request meant the last
 * exchange of every fight was never drawn, because by the time the generator
 * is done there is no request left to read it from.
 */
function drainEvents() {
  const all = S.events || [];
  for (; S.drawn < all.length; S.drawn++) {
    const e = all[S.drawn];
    const line = describe(e);
    if (line) S.lines.push(line);
  }
  $('feed').hidden = !S.lines.length;
  $('feed').innerHTML = S.lines.slice(-40).join('');
  $('feed').scrollTop = $('feed').scrollHeight;
}

/**
 * One recorded event as a line of the feed.
 *
 * The recorder emits `{ kind, ...fields }` — flat, and the discriminator is
 * `kind`. An earlier version of this switched on `e.type`, which is undefined
 * on every event, so `describe` returned '' for all of them and the feed was
 * silently, permanently empty. Nothing threw; the fight just looked mute.
 */
function describe(e) {
  const d = e;
  switch (e.kind) {
    case 'hit': return `<div>${esc(d.actor || '?')} hits ${esc(d.target)} `
      + `<span class="die">${d.raw}</span>${d.blocked ? ` −${d.blocked} armour` : ''}`
      + `${d.toStr ? ` · ${d.toStr} into STR` : ''}</div>`;
    case 'scar': return `<div class="scar">${esc(d.target)} is brought to exactly 0 — a scar</div>`;
    case 'down': return `<div>${esc(d.target)} ${d.dead ? 'is killed' : 'goes down'}</div>`;
    case 'withdraw': return `<div>${esc(d.actor)} withdraws</div>`;
    case 'rout': return '<div>they break and run</div>';
    default: return '';
  }
}

// ------------------------------------------------------------- the stages

function drawStage() {
  const run = S.run;
  if (!run) { $('stage').innerHTML = ''; return; }

  if (run.over) {
    $('stage').innerHTML = '';
    drawEnding();
    return;
  }
  $('ending').innerHTML = '';

  // --- piloting a fight
  if (S.request) {
    const r = S.request;
    const needTarget = (o) => o.needsTarget && !S.mark;
    $('stage').innerHTML = `
      <h2>${esc(r.actor)} acts</h2>
      <div class="sub">round ${r.round} · ${S.mark ? `aiming at <b>${esc(S.mark)}</b>` : 'pick a foe above, or an action that needs none'}</div>
      <div class="acts">${r.options.map((o, i) => {
    const label = o.kind === 'attack' ? `${esc(o.weapon)}`
      : o.kind === 'withdraw' ? 'Withdraw'
        : `${esc(o.source)}`;
    return `<button class="act ${o.kind === 'withdraw' ? 'leave' : ''} ${
      o.kind === 'attack' && i === 0 ? 'primary' : ''}"
      data-opt="${i}" ${o.disabled || needTarget(o) ? 'disabled' : ''}>
      ${label}<small>${esc(o.note || '')}</small></button>`;
  }).join('')}</div>`;
    return;
  }

  // --- the spoils
  if (run.phase === 'spoils' && run.spoils && !run.spoils.taken) {
    drawSpoils();
    return;
  }

  // --- scouting: the odds before you commit
  if (run.pending && run.phase === 'fighting') {
    const v = run.pending.verdict;
    $('extra').innerHTML = '';
    $('stage').innerHTML = `
      <h2>Rung ${run.rung + 1} of ${RUNGS.length} — ${run.pending.count}× ${esc(run.pending.monster.name)}</h2>
      <div class="sub">the oracle weighed this against your party as they stand:
        <b class="${v.band}">${v.band}</b> · <b>${Math.round(v.toll * 100)}%</b> of you expected to fall
        · <b>${Math.round(v.swing * 100)}%</b> chance of a wipe</div>
      <div class="acts"><button class="act primary" data-go="1">Go in</button></div>`;
    return;
  }

  $('stage').innerHTML = `<h2>Ready</h2>
    <div class="sub">${standing(run).length} standing</div>
    <div class="acts"><button class="act primary" data-scout="1">Scout the next rung</button></div>`;
}

function drawSpoils() {
  const run = S.run;
  const sp = run.spoils;
  const hurt = sp.heal.filter((h) => h.missing > 0);
  $('stage').innerHTML = `
    <h2>Rung ${sp.rung + 1} cleared</h2>
    <div class="sub">one or the other, not both</div>
    <div class="acts">
      <button class="act primary" data-heal="1">Bind wounds
        <small>${hurt.length ? `d${HEAL.strDice} STR back to each of ${hurt.length}` : 'nobody is short of Strength'}</small></button>
      <button class="act" data-ask="1" ${S.oracle ? 'disabled' : ''}>Ask the oracle
        <small>${S.oracle ? 'asked' : 'measure who gains most'}</small></button>
      <button class="act" data-done="1">Take the pack
        <small>${S.placement.length} of ${PACK_SIZE} placed</small></button>
    </div>`;

  $('extra').innerHTML = `
    <div class="hint">${S.held !== null
    ? '<b>Now tap whoever should carry it</b>, or tap the card again to put it down.'
    : 'Tap a card to pick it up, then tap a delver. Anything you leave stays on the floor.'}</div>
    <div class="cards">${sp.pack.map((c) => {
    const put = S.placement.find((p) => p.at === c.at);
    const who = put ? standing(run)[put.holder] : null;
    const adv = S.oracle && S.oracle.awards.find((a) => a.item.at === c.at);
    const advWho = adv ? standing(run)[adv.holder] : null;
    return `<div class="card ${S.held === c.at ? 'held' : ''} ${put ? 'placed' : ''}" data-card="${c.at}">
        <div class="nm">${esc(c.name)}</div>
        <div class="q">${esc(c.text.replace(c.name, '').replace(/^[\s(]+|[)\s]+$/g, '').trim()
    || c.kind || 'gear')} · ${c.slots} slot${c.slots === 1 ? '' : 's'}</div>
        ${who ? `<div class="to">→ ${esc(who.character.name)}</div>` : ''}
        ${S.oracle ? `<div class="oracle">${adv
    ? `oracle: <b>${esc(advWho ? advWho.character.name : '?')}</b> +${adv.gain.toFixed(3)} ± ${adv.se.toFixed(3)}`
    : 'oracle: not worth a slot'}</div>` : ''}
      </div>`;
  }).join('')}</div>`;
}

function drawEnding() {
  const s = summary(S.run);
  const won = s.outcome === 'survived';
  $('ending').innerHTML = `<div class="ending ${won ? '' : 'bad'}">
    <h2>${won ? `All ${s.of} rungs — ${s.alive.length} walked out`
    : `The descent ends at rung ${s.rungs} of ${s.of}`}</h2>
    <p>${s.dead.length ? `Buried: <strong>${s.dead.map(esc).join(', ')}</strong>. ` : 'Nobody died. '}
      Forecast ${Math.round(s.forecast * 100)}% a rung, actually cost ${Math.round(s.actual * 100)}% —
      ${s.luck > 0.08 ? 'the dice were against you' : s.luck < -0.08 ? 'the dice were kind' : 'about as weighed'}.
      <strong>${s.scars}</strong> scar${s.scars === 1 ? '' : 's'} earned.</p>
    ${s.grew.length ? `<ul>${s.grew.map((g) => `<li><b>${esc(g.who)}</b> — d12 ${g.scars.join(', ')} →
      ${['hp', 'STR', 'DEX', 'WIL'].filter((k) => g[k]).map((k) => `+${g[k]} ${k === 'hp' ? 'HP' : k}`).join(', ') || 'nothing raised'}</li>`).join('')}</ul>`
    : '<p>Nobody was brought to exactly 0 and lived, so nobody grew. That is the bargain.</p>'}
    <div class="acts"><button class="act primary" data-again="1">Descend again</button></div>
  </div>`;
  $('extra').innerHTML = '';
}

function draw() { drawTrack(); drawBand(); drawFoes(); drainEvents(); drawStage(); }

// ------------------------------------------------------------- the driving

function beginRun() {
  S.run = newRun(S.formation);
  S.bout = null; S.request = null; S.lines = []; S.drawn = 0; S.events = null;
  S.held = null; S.placement = []; S.oracle = null; S.mark = null;
  $('feed').hidden = true;
  writeHash();
  doScout();
}

function doScout() {
  if (S.busy) return;
  busy(true, `weighing rung ${S.run.rung + 1}…`);
  // findRung is a few hundred milliseconds; one frame gets the bar up first.
  requestAnimationFrame(() => setTimeout(() => {
    scout(S.run);
    busy(false);
    draw();
  }, 0));
}

function enter() {
  S.bout = enterRung(S.run);
  S.lines = [];
  S.drawn = 0;
  S.events = null;
  S.mark = null;
  step(null);
}

/** Advance the fight by handing back one answer. */
function step(answer) {
  const next = answer === null ? S.bout.generator.next() : S.bout.generator.next(answer);
  if (next.done) {
    const trial = settle(S.run, S.bout, next.value);
    for (const s of trial.scarred) {
      S.lines.push(`<div class="scar">${esc(s.who)} rolls the Scars table — d12 → ${s.roll}`
        + `${['hp', 'STR', 'DEX', 'WIL'].filter((k) => s[k]).map((k) => `, +${s[k]} ${k === 'hp' ? 'HP' : k}`).join('')}</div>`);
    }
    S.bout = null;
    S.request = null;
    S.held = null; S.placement = []; S.oracle = null;
    draw();          // S.events still points at the finished fight, so the last
    return;          // blow and the scar that followed it both get drawn
  }
  S.request = next.value;
  S.events = next.value.events;
  S.mark = null;
  draw();
}

function askOracle() {
  if (S.busy || S.oracle) return;
  const it = advise(S.run, { trials: 300 });
  busy(true, 'measuring who gains most…');
  const pump = () => {
    const until = performance.now() + 60;
    let n = it.next();
    while (!n.done && performance.now() < until) n = it.next();
    if (n.done) {
      S.oracle = n.value;
      busy(false);
      // Suggest, never apply — the placement stays the player's.
      say(n.value.awards.length
        ? `the oracle would place ${n.value.awards.length} of ${PACK_SIZE}`
        : 'the oracle would leave all three');
      draw();
      return;
    }
    $('bar').style.width = `${Math.min(100, (n.value.progress / n.value.of) * 100).toFixed(1)}%`;
    requestAnimationFrame(pump);
  };
  requestAnimationFrame(pump);
}

// ------------------------------------------------------------- interaction

document.body.addEventListener('click', (ev) => {
  const run = S.run;
  const hit = (sel) => ev.target.closest(sel);

  const foe = hit('[data-foe]');
  if (foe) { S.mark = foe.dataset.foe; return draw(); }

  const opt = hit('[data-opt]');
  if (opt && S.request) {
    const o = S.request.options[Number(opt.dataset.opt)];
    if (!o) return undefined;
    return step({ kind: o.kind, at: o.at, weapon: o.weapon, target: S.mark || undefined });
  }

  if (hit('[data-go]')) return enter();
  if (hit('[data-scout]')) return doScout();
  if (hit('[data-again]')) return beginRun();
  if (hit('[data-ask]')) return askOracle();

  if (hit('[data-heal]')) {
    const healed = takeHeal(run);
    say(healed.some((h) => h.back) ? healed.filter((h) => h.back).map((h) => `${h.who} +${h.back}`).join(', ')
      : 'nothing to bind');
    S.held = null; S.placement = []; S.oracle = null;
    return doScout();
  }

  if (hit('[data-done]')) {
    takePack(run, S.placement);
    S.held = null; S.placement = []; S.oracle = null;
    return doScout();
  }

  const card = hit('[data-card]');
  if (card) {
    const at = Number(card.dataset.card);
    // Tapping a placed card takes it back off whoever had it.
    S.placement = S.placement.filter((p) => p.at !== at);
    S.held = S.held === at ? null : at;
    return draw();
  }

  const holder = hit('[data-holder]');
  if (holder && S.held !== null) {
    S.placement = [...S.placement.filter((p) => p.at !== S.held),
      { at: S.held, holder: Number(holder.dataset.holder) }];
    S.held = null;
    return draw();
  }
  return undefined;
});

$('roll').addEventListener('click', () => {
  if (S.busy) return;
  S.formation = { ...S.formation, seed: coinSeed(), edits: {} };
  $('seed').value = S.formation.seed;
  beginRun();
});
$('seed').addEventListener('change', () => {
  S.formation = { ...S.formation, seed: $('seed').value.trim() || coinSeed(), edits: {} };
  $('seed').value = S.formation.seed;
  beginRun();
});
$('size').addEventListener('change', () => {
  S.formation = { ...S.formation, size: Number($('size').value), edits: {} };
  beginRun();
});
$('copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(location.href);
    say('link copied — it replays this exact descent');
  } catch { say(location.href); }
});

// ------------------------------------------------------------------- start

S.formation = decodeFormation(location.hash);
if (!S.formation.seed) S.formation.seed = coinSeed();
$('seed').value = S.formation.seed;
$('size').value = String(S.formation.size);
void pcOptions;   // the option shapes this page renders come from combat.js
beginRun();
