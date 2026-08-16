// table/srd5/app.js — the roller's page. Rendering only; roll.js owns the rules.
//
// Every number shown here comes off the character object, never recomputed for
// display. A page that does its own arithmetic is a second implementation, and
// the two drift the first time one of them is edited.

import { rollParty, rollBalancedParty, partyBalance, ROLES, ABILITIES, signed } from './roll.js';

const $ = (id) => document.getElementById(id);

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const state = { seed: 'oak-fen-317', size: 4, level: 1, balanced: false, multiclass: false, open: null };

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
  if (p.get('b') === '1') state.balanced = true;
  if (p.get('m') === '1') state.multiclass = true;
}

function writeHash() {
  const p = new URLSearchParams({ s: state.seed });
  if (state.size !== 4) p.set('n', String(state.size));
  if (state.level !== 1) p.set('l', String(state.level));
  if (state.balanced) p.set('b', '1');
  if (state.multiclass) p.set('m', '1');
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

/** "d8" for one class, "d8 + d6" once the character has taken two. */
function hitDice(c) {
  const dice = [...new Set(Object.keys(c.classLevels || {}).map((n) => c.path
    .find((e) => e.klass === n).hp.die))];
  return dice.map((d) => `d${d}`).join(' + ');
}

function sheet(c) {
  const trained = c.skills.filter((s) => s.proficient);
  const untrained = c.skills.filter((s) => !s.proficient);

  return `<article class="sheet">
    <header>
      <span class="who">${escapeHtml(c.species.name)} ${escapeHtml(c.classLine || c.klass.name)}</span>
      <span class="sub">${escapeHtml(c.background.name)} · ${escapeHtml(c.species.size)} · ${c.speed} ft.</span>
      <span class="lvl">level ${c.level} · PB ${signed(c.proficiencyBonus)}</span>
    </header>

    <div class="abilities">${ABILITIES.map((a) => abilityBox(c, a)).join('')}</div>

    <div class="stats">
      <div class="stat"><div class="v">${c.ac}</div><div class="k">armour class</div>
        <div class="why">${escapeHtml(c.acHow)}</div></div>
      <div class="stat"><div class="v">${c.hp}</div><div class="k">hit points</div>
        <div class="why">${escapeHtml(hitDice(c))}${c.tough ? ' + dwarven toughness' : ''}</div></div>
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

    <div class="block pathblock">
      <button class="showpath" data-i="__I__">show the path</button>
      <div class="pathhost"></div>
    </div>

    <details class="dice">
      <summary>the dice</summary>
      ${c.rolls.map((r, i) => `<div class="roll">
        4d6 <b>${r.dice.join(' ')}</b> → keep ${r.kept.join(' ')} = <b>${r.total}</b>
      </div>`).join('')}
      <div class="roll">assigned by class, then ${escapeHtml(c.applied.join(' and '))} from the background</div>
      ${c.path.map((e) => `<div class="roll">level ${e.level}: ${e.hp.whole
    ? `d${e.hp.die} taken whole` : `d${e.hp.die} rolled ${e.hp.roll}`} → <b>+${e.hp.gained}</b> HP</div>`).join('')}
    </details>
  </article>`;
}

/**
 * The path: one row per level, with the decisions marked.
 *
 * Drawn as a spine rather than a table because the interesting thing is not
 * what you have at level 10, it is WHERE the level 10 was decided — and the
 * branches you did not take, which a table has nowhere to put.
 */
function pathView(c) {
  return `<div class="path">
    ${c.path.map((e) => {
    const decided = e.decisions.length > 0;
    const branch = e.couldHaveTaken && e.couldHaveTaken.length;
    return `<div class="step${decided ? ' decided' : ''}${branch ? ' branch' : ''}">
        <div class="mark"><span class="lv">${e.level}</span></div>
        <div class="body">
          <div class="head">
            <b>${escapeHtml(e.klass)}</b> <span class="dim">level ${e.classLevel}</span>
            <span class="hp">${e.hp.whole
      ? `d${e.hp.die} taken whole` : `d${e.hp.die} rolled ${e.hp.roll}`} → <b>+${e.hp.gained}</b> HP</span>
          </div>
          ${e.gained.length ? `<div class="got">${e.gained.map((g) =>
        `<span class="chip">${escapeHtml(g)}</span>`).join('')}</div>` : ''}
          ${e.decisions.map((d) => `<div class="decision">
            <span class="k">${d.kind === 'asi' ? 'a choice' : 'a fork'}</span>
            <b>${escapeHtml(d.chose)}</b>
            ${d.alternatives.length
        ? `<span class="alt">instead of ${d.alternatives.map(escapeHtml).join(', ')}</span>`
        : `<span class="alt">${escapeHtml(d.note || '')}</span>`}
          </div>`).join('')}
          ${branch ? `<div class="couldve">could have gone
            ${e.couldHaveTaken.slice(0, 6).map(escapeHtml).join(', ')}</div>` : ''}
        </div>
      </div>`;
  }).join('')}
  </div>`;
}

/** The balance report: what the party covers, and what it does not. */
function balanceView(b, plainScore) {
  const row = (label, covered, missing) => `<div class="cov">
    <span class="k">${label}</span>
    <span class="chips">
      ${covered.map((x) => `<span class="chip on">${escapeHtml(x)}</span>`).join('')}
      ${missing.map((x) => `<span class="chip gap">${escapeHtml(x)}</span>`).join('')}
    </span></div>`;
  return `<section class="panel balance">
    <h2>What this party covers</h2>
    <div class="score">
      <span class="v">${b.score}</span> <span class="k">of ${b.max}</span>
      ${plainScore !== undefined && plainScore !== b.score
    ? `<span class="gain">searched ${state.tries || 40} parties · an unsearched roll of this seed scored ${plainScore}</span>`
    : ''}
    </div>
    ${row('saving throws', b.savesCovered, b.savesMissing)}
    ${row('roles', ROLES.filter((r) => b.roles[r.key].length).map((r) => r.label),
    ROLES.filter((r) => !b.roles[r.key].length).map((r) => `no one ${r.label}`))}
    <div class="cov"><span class="k">skills</span>
      <span class="chips"><span class="chip on">${b.skillsCovered.length} of 18</span>
      ${b.skillsMissing.slice(0, 8).map((x) => `<span class="chip gap">${escapeHtml(x)}</span>`).join('')}
      ${b.skillsMissing.length > 8 ? `<span class="chip gap">+${b.skillsMissing.length - 8} more</span>` : ''}
      </span></div>
    <p class="caveat" style="margin-top:0.7rem">
      <b>Saving-throw coverage is the SRD's, the roles are ours.</b> Every class grants exactly two
      of the six saves, so a gap there is a real hole a monster can aim at — and a rolled party of
      four has one about <b>sixty per cent</b> of the time. The four roles below it are this site's
      invention, defined by evidence on the sheet rather than by folk wisdom, and weighted by a
      judgement we made up. When the combat simulator lands, this stops being a theory and becomes
      something we can test.
    </p>
    <p class="caveat">
      ${ROLES.map((r) => `<b>${escapeHtml(r.label)}</b> — ${escapeHtml(r.why)}`).join('<br>')}
    </p>
  </section>`;
}

function render() {
  const opts = { level: state.level, multiclass: state.multiclass };
  let members;
  let plainScore;
  if (state.balanced) {
    const found = rollBalancedParty(state.seed, state.size, opts);
    members = found.members;
    plainScore = found.plainScore;
    state.tries = found.tries;
  } else {
    members = rollParty(state.seed, state.size, opts).members;
  }
  const b = partyBalance(members);
  $('balance').innerHTML = balanceView(b, plainScore);
  $('party').innerHTML = members.map((m, i) => sheet(m).replace('__I__', String(i))).join('');
  // The path is heavy, so it opens on demand — one character at a time.
  document.querySelectorAll('.sheet .showpath').forEach((btn) => {
    btn.addEventListener('click', () => {
      const host = btn.closest('.sheet').querySelector('.pathhost');
      if (host.innerHTML) { host.innerHTML = ''; btn.textContent = 'show the path'; return; }
      host.innerHTML = pathView(members[Number(btn.dataset.i)]);
      btn.textContent = 'hide the path';
    });
  });
  writeHash();
}

// -------------------------------------------------------------------- go

$('level').innerHTML = Array.from({ length: 20 }, (_, i) =>
  `<option value="${i + 1}">${i + 1}</option>`).join('');

readHash();
$('balanced').classList.toggle('on', state.balanced);
$('multiclass').classList.toggle('on', state.multiclass);
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
$('balanced').addEventListener('click', () => {
  state.balanced = !state.balanced;
  $('balanced').classList.toggle('on', state.balanced);
  render();
});
$('multiclass').addEventListener('click', () => {
  state.multiclass = !state.multiclass;
  $('multiclass').classList.toggle('on', state.multiclass);
  render();
});
$('roll').addEventListener('click', () => {
  state.seed = freshSeed();
  $('seed').value = state.seed;
  render();
});
$('print').addEventListener('click', () => window.print());
