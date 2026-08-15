// table/cairn/encounter/app.js — the page around the oracle.
//
// combat.js owns the fight; this owns the controls, the URL, and the wording of
// the verdict. The wording matters as much as the number: a percentage with no
// sentence attached invites a Warden to read it as a promise, and it isn't one.

import { rollParty, rollCharacter } from '../roll.js';
import { BESTIARY } from '../monsters.js';
import {
  assess, findEncounters, combatantFromCharacter, combatantFromMonster, applyScars,
} from '../combat.js';

const $ = (id) => document.getElementById(id);

const state = {
  seed: 'oak-fen-317',
  size: 4,
  scars: 0,
  monster: 'goblin',
  count: 4,
  morale: true,
  surprise: false,
  target: 'deadly',
};

const pct = (x) => `${(x * 100).toFixed(x >= 0.1 ? 0 : 1)}%`;

const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** The bestiary's prose carries the SRD's light markdown, same as the tables. */
const md = (s) => escapeHtml(s)
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  .replace(/\*([^*]+)\*/g, '<em>$1</em>');

// ------------------------------------------------------------------- party

/** The rolled party, aged by `scars`, as combatants. */
function party() {
  const members = state.size === 1
    ? [rollCharacter(state.seed)]
    : rollParty(state.seed, state.size).members;
  return members
    .map((m) => (state.scars ? applyScars(m, state.scars) : m))
    .map((m) => combatantFromCharacter(m));
}

function renderParty(pcs) {
  $('party').innerHTML = `<table>${pcs.map((c) => `
    <tr>
      <td class="who">${escapeHtml(c.name)}</td>
      <td class="kit">${escapeHtml(c.attacks[0].name)} (d${c.attacks[0].dice.join('+d')})</td>
      <td class="num">${c.hp} HP</td>
      <td class="num">${c.armor} armour</td>
      <td class="num">STR ${c.STR} · DEX ${c.DEX} · WIL ${c.WIL}</td>
    </tr>`).join('')}</table>`;
  $('sheets').href = `/cairn/#s=${encodeURIComponent(state.seed)}${state.size > 1 ? `&n=${state.size}` : ''}`;
}

// ----------------------------------------------------------------- verdict

/**
 * The sentence under the numbers. Each band gets a different one because each
 * means a different thing at the table, and "23%" alone does not say which.
 */
function reading(v, pcs, foesLabel) {
  const first = v.meanFirstCasualtyRound
    ? `When someone does go down, it is usually round ${v.meanFirstCasualtyRound.toFixed(1)} — that is the round the party should already be leaving.`
    : 'Nobody went down in any trial.';
  const rout = v.routRate > 0.15
    ? ` The enemy broke and ran in ${pct(v.routRate)} of fights, which is doing a lot of the party's work.`
    : '';
  const lead = {
    routine: `${foesLabel} is not a threat to this party in a straight fight: someone is hurt in ${pct(1 - v.unscathedRate)} of them, and the party is wiped in ${pct(v.wipeRate)}.`,
    risky: `${foesLabel} costs this party something in ${pct(1 - v.unscathedRate)} of fights — a body on the ground ${pct(v.meanCasualties / pcs.length)} of the time per head — but a wipe is rare at ${pct(v.wipeRate)}.`,
    deadly: `${foesLabel} is a real fight: ${v.meanCasualties.toFixed(1)} of ${pcs.length} go down on average and the whole party is wiped ${pct(v.wipeRate)} of the time. Run it only if the party can leave.`,
    lethal: `${foesLabel} kills this party ${pct(v.wipeRate)} of the time, with ${v.meanCasualties.toFixed(1)} of ${pcs.length} down on average. This is not an encounter, it is a hazard — signpost it.`,
  }[v.band];
  return `${lead} ${first}${rout}`;
}

function renderVerdict(v, pcs, monster, count) {
  const label = `${count} × ${monster.name}`;
  $('verdict').innerHTML = `
    <div class="verdict" style="margin-top:0.9rem">
      <div class="band ${v.band}">${v.band}</div>
      <div class="kpis">
        <div class="kpi"><div class="v">${pct(v.wipeRate)}</div><div class="k">party wiped</div></div>
        <div class="kpi"><div class="v">${v.meanCasualties.toFixed(2)}</div><div class="k">of ${pcs.length} down</div></div>
        <div class="kpi"><div class="v">${pct(v.unscathedRate)}</div><div class="k">nobody hurt</div></div>
        <div class="kpi"><div class="v">${v.meanRounds.toFixed(1)}</div><div class="k">rounds</div></div>
        <div class="kpi"><div class="v">${pct(v.routRate)}</div><div class="k">enemy routs</div></div>
      </div>
    </div>
    <p class="reading">${reading(v, pcs, label)}</p>
    ${monster.unmodelled ? `<p class="warn">⚠ ${escapeHtml(monster.name)} has abilities the model
      ignores, so the real fight is harder than this: ${md(monster.notes.slice(1).join(' '))}</p>` : ''}
    <table class="results" style="margin-top:0.9rem">
      <thead><tr><th>who</th><th style="text-align:right">goes down</th><th>kit</th></tr></thead>
      <tbody>${pcs.map((c, i) => `
        <tr><td>${c.name}</td>
            <td class="num">${pct(v.perCharacterDownRate[i])}</td>
            <td class="kit" style="color:var(--muted)">${c.hp} HP · ${c.armor} armour · ${c.attacks[0].name}</td></tr>`).join('')}
      </tbody>
    </table>
    <p class="caveat" style="margin-top:0.6rem">${v.trials.toLocaleString()} simulated fights,
      seeded on <code>${state.seed}</code> — the same inputs always give this same verdict.</p>`;
}

function weigh() {
  const pcs = party();
  const monster = BESTIARY.find((m) => m.id === state.monster);
  const foes = Array.from({ length: state.count }, (_, i) => combatantFromMonster(monster, i));
  const t0 = performance.now();
  const v = assess(pcs, foes, {
    trials: 5000,
    seed: `${state.seed}/${state.monster}/${state.count}`,
    morale: state.morale,
    surprise: state.surprise,
  });
  renderVerdict(v, pcs, monster, state.count);
  $('status').textContent = `${Math.round(performance.now() - t0)}ms`;
  writeHash();
}

// ------------------------------------------------------------------ search

function search() {
  const pcs = party();
  $('searchStatus').textContent = 'playing every fight in the bestiary…';
  // let the status paint before the synchronous search blocks the thread
  setTimeout(() => {
    const t0 = performance.now();
    const found = findEncounters(pcs, BESTIARY, {
      target: state.target,
      trials: 300,
      seed: `${state.seed}/search`,
      morale: state.morale,
    });
    $('results').innerHTML = found.length ? `
      <table class="results">
        <thead><tr>
          <th>encounter</th><th>group</th>
          <th style="text-align:right">wiped</th>
          <th style="text-align:right">down</th>
          <th style="text-align:right">rounds</th>
          <th></th>
        </tr></thead>
        <tbody>${found.map((f) => `
          <tr class="pick" data-monster="${f.monster.id}" data-count="${f.count}">
            <td><strong>${f.count} ×</strong> ${f.monster.name}</td>
            <td style="color:var(--muted)">${f.monster.group || '—'}</td>
            <td class="num">${pct(f.verdict.wipeRate)}</td>
            <td class="num">${f.verdict.meanCasualties.toFixed(2)}</td>
            <td class="num">${f.verdict.meanRounds.toFixed(1)}</td>
            <td class="flag">${f.monster.unmodelled ? '⚠ has abilities' : ''}</td>
          </tr>`).join('')}
        </tbody>
      </table>
      <p class="caveat" style="margin-top:0.6rem">
        ${found.length} of ${BESTIARY.length} creatures can be scaled to <b>${state.target}</b>
        against this party, <b>most typical of that band first</b> — not most lethal first, because
        the encounters nearest a band's edge are the ones whose label is least reliable. Click any
        row to weigh it properly at 5,000 trials. Creatures marked ⚠ will run harder than shown.</p>`
      : `<p class="caveat" style="margin-top:0.6rem">Nothing in the bestiary lands in
         <b>${state.target}</b> against this party at up to twelve of a kind — try another band.</p>`;
    $('searchStatus').textContent = `${Math.round(performance.now() - t0)}ms`;
  }, 20);
}

$('results').addEventListener('click', (e) => {
  const row = e.target.closest('[data-monster]');
  if (!row) return;
  state.monster = row.dataset.monster;
  state.count = Number(row.dataset.count);
  $('monster').value = state.monster;
  $('count').value = String(state.count);
  weigh();
  $('verdict').scrollIntoView({ behavior: 'smooth', block: 'center' });
});

// ------------------------------------------------------------------- chrome

function fillMonsters() {
  const groups = new Map();
  for (const m of BESTIARY) {
    const g = m.group || 'Other';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(m);
  }
  $('monster').innerHTML = [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([g, list]) => `<optgroup label="${g}">${list
      .map((m) => `<option value="${m.id}">${m.name} — ${m.hp} HP, ${m.armor} armour${
        m.attacks.length ? `, ${m.attacks[0].name} (d${m.attacks[0].dice.join('+d')})` : ', no attack'}</option>`)
      .join('')}</optgroup>`).join('');
  $('monster').value = state.monster;
}

function readHash() {
  const p = new URLSearchParams(location.hash.replace(/^#/, ''));
  if (p.get('s')) state.seed = p.get('s');
  if (p.get('n')) state.size = Math.min(6, Math.max(1, Number(p.get('n')) || 4));
  if (p.get('v')) state.scars = Math.min(10, Math.max(0, Number(p.get('v')) || 0));
  if (p.get('m') && BESTIARY.some((m) => m.id === p.get('m'))) state.monster = p.get('m');
  if (p.get('c')) state.count = Math.min(30, Math.max(1, Number(p.get('c')) || 4));
}

function writeHash() {
  const p = new URLSearchParams({ s: state.seed, n: String(state.size), m: state.monster, c: String(state.count) });
  if (state.scars) p.set('v', String(state.scars));
  history.replaceState(null, '', `#${p}`);
}

function refreshParty() {
  renderParty(party());
}

$('seed').addEventListener('change', () => { state.seed = $('seed').value.trim() || state.seed; refreshParty(); writeHash(); });
$('size').addEventListener('change', () => { state.size = Number($('size').value); refreshParty(); writeHash(); });
$('vet').addEventListener('input', () => {
  state.scars = Number($('vet').value);
  $('vetOut').textContent = state.scars;
  refreshParty();
  writeHash();
});
$('count').addEventListener('change', () => { state.count = Math.max(1, Number($('count').value) || 1); });
$('monster').addEventListener('change', () => { state.monster = $('monster').value; });
$('morale').addEventListener('click', () => { state.morale = !state.morale; $('morale').classList.toggle('on', state.morale); });
$('surprise').addEventListener('click', () => { state.surprise = !state.surprise; $('surprise').classList.toggle('on', state.surprise); });
$('weigh').addEventListener('click', weigh);
$('search').addEventListener('click', search);

// -------------------------------------------------------------------- start

readHash();
fillMonsters();
$('seed').value = state.seed;
$('size').value = String(state.size);
$('vet').value = String(state.scars);
$('vetOut').textContent = state.scars;
$('count').value = String(state.count);
$('flagCount').textContent = `${BESTIARY.filter((m) => m.unmodelled).length} of ${BESTIARY.length}`;
refreshParty();
weigh();
