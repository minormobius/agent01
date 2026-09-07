// table/srd5/app.js — the corpus, shown so it can be checked.
//
// This page has no dice in it. Its whole job is to put the parsed data in front
// of a reader who can compare it against the PDF, because a corpus recovered
// from typeset text is a claim, and a claim nobody can check is just a number
// on a page. Everything below reads the generated modules directly.

import { BESTIARY } from '../monsters.js';
import { XP_BUDGET } from '../data.js';

const $ = (id) => document.getElementById(id);

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** "1/4" -> 0.25, so challenge sorts as a number rather than a string. */
const crValue = (cr) => {
  if (!cr) return -1;
  const [a, b] = String(cr).split('/');
  return b ? Number(a) / Number(b) : Number(a);
};

// -------------------------------------------------------------- the counts

function renderCounts() {
  const attacks = BESTIARY.flatMap((m) => (m.actions || []).filter((a) => a.attack));
  const saves = BESTIARY.flatMap((m) => (m.actions || []).filter((a) => a.save));
  const areas = BESTIARY.flatMap((m) => (m.actions || []).filter((a) => a.area));
  const stats = [
    [BESTIARY.length, 'stat blocks'],
    // "attacks", not "attacks with dice": 21 of them deal a flat number with
    // no dice at all, and the Roper's tentacle deals no damage whatsoever.
    [attacks.length, 'attacks parsed'],
    [saves.length, 'forced saves'],
    [areas.length, 'area effects'],
    [new Set(BESTIARY.map((m) => m.cr)).size, 'challenge ratings'],
    // filter(Boolean) or the damageless attack's null counts as a fourteenth
    // damage type, and the game has thirteen
    [new Set(attacks.map((a) => a.attack.damageType).filter(Boolean)).size, 'damage types'],
  ];
  $('counts').innerHTML = stats.map(([v, k]) =>
    `<div class="count"><div class="v">${v}</div><div class="k">${k}</div></div>`).join('');
}

// ----------------------------------------------------------- the bestiary

/** The headline attack, which is what a reader scans a stat block for. */
function weapon(m) {
  const a = (m.actions || []).find((x) => x.attack);
  if (!a) return '—';
  const at = a.attack;
  const where = at.reach ? `reach ${at.reach}` : at.range ? `range ${at.range}` : '';
  // Three shapes: dice, a flat number, or no damage at all.
  const hurt = at.damageType === null ? 'no damage'
    : `${at.dice || at.avg} ${at.damageType.toLowerCase()}`;
  return `${a.name} ${at.bonus >= 0 ? '+' : ''}${at.bonus}, ${hurt}`
    + (where ? ` (${where} ft.)` : '');
}

function renderTable() {
  const q = $('q').value.trim().toLowerCase();
  const sort = $('sort').value;
  let rows = BESTIARY.filter((m) => !q
    || m.name.toLowerCase().includes(q)
    || (m.type || '').toLowerCase().includes(q)
    || `cr ${m.cr}` === q || String(m.cr) === q);

  rows = rows.slice().sort((a, b) => (
    sort === 'name' ? a.name.localeCompare(b.name)
      : sort === 'hp' ? b.hp - a.hp
        : crValue(b.cr) - crValue(a.cr) || a.name.localeCompare(b.name)));

  const shown = rows.slice(0, 120);
  $('table').innerHTML = `
    <table>
      <thead><tr>
        <th>creature</th><th>kind</th>
        <th style="text-align:right">cr</th>
        <th style="text-align:right">ac</th>
        <th style="text-align:right">hp</th>
        <th style="text-align:right">speed</th>
        <th>its attack</th>
      </tr></thead>
      <tbody>${shown.map((m) => `
        <tr>
          <td class="name">${escapeHtml(m.name)}</td>
          <td class="kit">${escapeHtml(m.size)} ${escapeHtml(m.type)}</td>
          <td class="num">${escapeHtml(String(m.cr))}</td>
          <td class="num">${m.ac}</td>
          <td class="num">${m.hp}</td>
          <td class="num">${m.walk}</td>
          <td class="kit">${escapeHtml(weapon(m))}</td>
        </tr>`).join('')}
      </tbody>
    </table>
    <p class="caveat" style="margin-top:0.6rem">
      ${rows.length === BESTIARY.length
    ? `All ${BESTIARY.length} stat blocks in the SRD`
    : `${rows.length} of ${BESTIARY.length}`}${rows.length > shown.length
    ? `, first ${shown.length} shown` : ''}. Speed is the walking speed in feet — which is
      to say, in grid squares times five.
    </p>`;
}

// ------------------------------------------------------------- the budget

function renderBudget() {
  const levels = Object.keys(XP_BUDGET).map(Number).sort((a, b) => a - b);
  $('budget').innerHTML = `
    <table>
      <thead><tr>
        <th>party level</th>
        <th style="text-align:right">low</th>
        <th style="text-align:right">moderate</th>
        <th style="text-align:right">high</th>
      </tr></thead>
      <tbody>${levels.map((l) => {
    const r = XP_BUDGET[String(l)];
    return `<tr>
          <td class="num" style="text-align:left">${l}</td>
          <td class="num">${r.low.toLocaleString()}</td>
          <td class="num">${r.moderate.toLocaleString()}</td>
          <td class="num">${r.high.toLocaleString()}</td>
        </tr>`;
  }).join('')}
      </tbody>
    </table>
    <p class="caveat" style="margin-top:0.6rem">
      XP per character; multiply by the number of characters. These are the SRD's numbers, not
      ours — the question this surface will ask is whether they hold.
    </p>`;
}

// -------------------------------------------------------------------- go

renderCounts();
renderTable();
renderBudget();
$('q').addEventListener('input', renderTable);
$('sort').addEventListener('change', renderTable);
