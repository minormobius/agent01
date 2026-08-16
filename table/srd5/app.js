// table/srd5/app.js — the roller's page. Rendering only; roll.js owns the rules.
//
// Every number shown here comes off the character object, never recomputed for
// display. A page that does its own arithmetic is a second implementation, and
// the two drift the first time one of them is edited.

import { rollParty, ABILITIES, signed } from './roll.js';

const $ = (id) => document.getElementById(id);

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const state = { seed: 'oak-fen-317', size: 4, level: 1 };

// ------------------------------------------------------------------ seeds

/**
 * A readable seed. Two words and a number, so it can be said aloud across a
 * table and typed back in — the permalink is only useful if a person can
 * carry it.
 */
const WORDS = ['oak', 'fen', 'ash', 'mire', 'crag', 'holt', 'barrow', 'quill', 'salt', 'ember',
  'thistle', 'wold', 'marsh', 'grey', 'hollow', 'stone', 'briar', 'kiln', 'reed', 'tarn'];

function freshSeed() {
  const r = () => WORDS[Math.floor(Math.random() * WORDS.length)];
  return `${r()}-${r()}-${100 + Math.floor(Math.random() * 900)}`;
}

function readHash() {
  const p = new URLSearchParams(location.hash.replace(/^#/, ''));
  if (p.get('s')) state.seed = p.get('s');
  if (p.get('n')) state.size = Math.min(6, Math.max(1, Number(p.get('n')) || 4));
  if (p.get('l')) state.level = Math.min(20, Math.max(1, Number(p.get('l')) || 1));
}

function writeHash() {
  const p = new URLSearchParams({ s: state.seed });
  if (state.size !== 4) p.set('n', String(state.size));
  if (state.level !== 1) p.set('l', String(state.level));
  history.replaceState(null, '', `#${p}`);
}

// ----------------------------------------------------------------- render

function abilityBox(c, a) {
  const save = c.saves.find((s) => s.ability === a);
  return `<div class="ab${save.proficient ? ' save' : ''}">
    <div class="k">${a}</div>
    <div class="v">${c.scores[a]}</div>
    <div class="m">${signed(c.mods[a])}${save.proficient ? ` · save ${signed(save.mod)}` : ''}</div>
  </div>`;
}

function sheet(c) {
  const trained = c.skills.filter((s) => s.proficient);
  const untrained = c.skills.filter((s) => !s.proficient);

  return `<article class="sheet">
    <header>
      <span class="who">${escapeHtml(c.species.name)} ${escapeHtml(c.klass.name)}</span>
      <span class="sub">${escapeHtml(c.background.name)} · ${escapeHtml(c.species.size)} · ${c.speed} ft.</span>
      <span class="lvl">level ${c.level} · PB ${signed(c.proficiencyBonus)}</span>
    </header>

    <div class="abilities">${ABILITIES.map((a) => abilityBox(c, a)).join('')}</div>

    <div class="stats">
      <div class="stat"><div class="v">${c.ac}</div><div class="k">armour class</div>
        <div class="why">${escapeHtml(c.acHow)}</div></div>
      <div class="stat"><div class="v">${c.hp}</div><div class="k">hit points</div>
        <div class="why">d${c.klass.hitDie}${c.tough ? ' + dwarven toughness' : ''}</div></div>
      <div class="stat"><div class="v">${signed(c.initiative)}</div><div class="k">initiative</div></div>
      <div class="stat"><div class="v">${c.passivePerception}</div><div class="k">passive perception</div></div>
      ${c.casting ? `<div class="stat"><div class="v">${c.casting.saveDc}</div>
        <div class="k">spell save dc</div>
        <div class="why">${c.casting.ability} · attack ${signed(c.casting.attack)}</div></div>` : ''}
    </div>

    <div class="block">
      <h3>attacks</h3>
      ${c.attacks.map((a) => `<div class="line">
        <b>${escapeHtml(a.name)}</b>
        <span class="n">${signed(a.attack)} to hit, ${escapeHtml(a.damage)}</span>
        <span class="dim">${a.range ? `· range ${a.range[0]}/${a.range[1]} ft.` : ''}
        ${a.versatile ? `· versatile ${escapeHtml(a.versatile)}` : ''}
        ${a.properties.length ? `· ${escapeHtml(a.properties.join(', ').toLowerCase())}` : ''}</span>
      </div>`).join('')}
      ${c.worn ? `<div class="line dim">Wearing ${escapeHtml(c.worn)}${c.shield ? ' and a shield' : ''}.</div>`
    : '<div class="line dim">No armour — untrained in all of it.</div>'}
    </div>

    <div class="block">
      <h3>skills</h3>
      <div class="chips">
        ${trained.map((s) => `<span class="chip on">${escapeHtml(s.name)} ${signed(s.mod)}</span>`).join('')}
        ${untrained.map((s) => `<span class="chip">${escapeHtml(s.name)} ${signed(s.mod)}</span>`).join('')}
      </div>
    </div>

    <div class="block">
      <h3>origin</h3>
      <div class="line">
        <b>${escapeHtml(c.background.name)}</b> — ${escapeHtml(c.applied.join(', '))},
        the <b>${escapeHtml(c.feat)}</b> feat, and proficiency with
        ${escapeHtml(c.backgroundSkills.join(' and '))}.
        <span class="dim">Tool: ${escapeHtml(c.background.tool)}.</span>
      </div>
      <div class="line dim" style="margin-top:0.2rem">
        <b>${escapeHtml(c.species.name)}:</b>
        ${c.species.traits.map((t) => escapeHtml(t.name)).join(', ') || '—'}
      </div>
    </div>

    ${c.features.length ? `<div class="block">
      <h3>class features</h3>
      <div class="line dim">${c.features.map((f) =>
    `<b>${f.level}:</b> ${escapeHtml(f.names.join(', '))}`).join(' · ')}</div>
    </div>` : ''}

    <details class="dice">
      <summary>the dice</summary>
      ${c.rolls.map((r, i) => `<div class="roll">
        4d6 <b>${r.dice.join(' ')}</b> → keep ${r.kept.join(' ')} = <b>${r.total}</b>
      </div>`).join('')}
      <div class="roll">assigned by class, then ${escapeHtml(c.applied.join(' and '))} from the background</div>
      ${c.hpLog.map((e) => `<div class="roll">level ${e.level}: ${e.fixed
    ? `d${c.klass.hitDie} taken whole` : `d${c.klass.hitDie} rolled ${e.roll}`} → <b>+${e.gained}</b> HP</div>`).join('')}
    </details>
  </article>`;
}

function render() {
  const party = rollParty(state.seed, state.size, { level: state.level });
  $('party').innerHTML = party.members.map(sheet).join('');
  writeHash();
}

// -------------------------------------------------------------------- go

$('level').innerHTML = Array.from({ length: 20 }, (_, i) =>
  `<option value="${i + 1}">${i + 1}</option>`).join('');

readHash();
$('seed').value = state.seed;
$('size').value = String(state.size);
$('level').value = String(state.level);
render();

$('seed').addEventListener('change', () => {
  state.seed = $('seed').value.trim() || state.seed;
  render();
});
$('size').addEventListener('change', () => { state.size = Number($('size').value); render(); });
$('level').addEventListener('change', () => { state.level = Number($('level').value); render(); });
$('roll').addEventListener('click', () => {
  state.seed = freshSeed();
  $('seed').value = state.seed;
  render();
});
$('print').addEventListener('click', () => window.print());
