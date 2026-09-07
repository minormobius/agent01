// table/cairn/app.js — the page around the roller.
//
// roll.js owns the dice and the rules; this file owns the DOM and the two
// things a player does to a rolled sheet before play: swap two attributes
// (which Cairn explicitly allows) and decide which items their background
// results actually handed them. Those edits live only in the page — the seed
// still reproduces the sheet as rolled, which is the point of the permalink.

import { packInventory, parseItem, coinSeed } from './roll.js';
import {
  emptyFormation, editsFor, encodeFormation, decodeFormation, buildParty, offersOf,
} from './formation.js';

const $ = (id) => document.getElementById(id);
const sheetsEl = $('sheets');
const overviewEl = $('overview');

/**
 * THE FORMATION IS THE STATE. Not a party plus some edits held in the page:
 * the seed, the size and every decision made since, in one object that
 * encodes to the URL and decodes back to exactly this party. Every screen
 * downstream reads the same string — see formation.js for why that had to
 * become true.
 */
let state = { formation: emptyFormation('', 1), sheets: [] };

// ------------------------------------------------------------------ helpers

const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** The SRD's light markdown: **item** and *quality*. Escaped first. */
const md = (s) => escapeHtml(s)
  .replace(/\*\*([^*]+)\*\*/g, '<span class="t">$1</span>')
  .replace(/\*([^*]+)\*/g, '<em>$1</em>');

function writeHash() {
  history.replaceState(null, '', `#${encodeFormation(state.formation)}`);
}

/** The hash to hand to the next screen in the formation. */
const onward = () => `#${encodeFormation(state.formation)}`;

function say(message) {
  $('status').textContent = message;
  clearTimeout(say.timer);
  say.timer = setTimeout(() => { $('status').textContent = ''; }, 2600);
}

// --------------------------------------------------------------- the sheets
//
// A sheet is DERIVED, never edited. `picked` is the only thing the page keeps
// of its own — which two attribute boxes are lit while you choose a swap — and
// it is deliberately not in the formation, because a half-finished gesture is
// not a decision anyone should be able to link to.

function load() {
  const lit = state.sheets.map((s) => s.picked || []);
  state.sheets = buildParty(state.formation).map((m, i) => ({
    ...m, picked: lit[i] || [],
  }));
  render();
}

/** Gear as rolled + everything the player has added since. */
const itemsOf = (sheet) => [...sheet.character.gear, ...sheet.added];

function render() {
  sheetsEl.innerHTML = '';
  state.sheets.forEach((sheet, i) => sheetsEl.appendChild(renderSheet(sheet, i)));
  renderOverview();
  // Any static link marked `data-onward` leads deeper into the formation, so it
  // has to carry it. Left alone they point at a bare `kit/` — a second route to
  // the next screen that silently arrives with no party at all, which is the
  // same bug as the stale one above wearing different clothes.
  for (const a of document.querySelectorAll('a[data-onward]')) {
    a.setAttribute('href', `${a.getAttribute('href').split('#')[0]}${onward()}`);
  }
  writeHash();
}

/** Re-derive from the formation and redraw. Every edit ends with this. */
const commit = () => load();

// ------------------------------------------------------------- the overview
//
// The card above the sheets: what this party is good at, before you take it
// anywhere. Two deliberate choices.
//
// IT USES THE SIMULATOR'S OWN CONVERSION. `combatantFromCharacter` is what the
// encounter oracle fights with, so the radar is scored on exactly the numbers
// the fight will consume. A second, lighter adapter here would have been a
// third of the bytes and a standing invitation for the card and the oracle to
// quietly disagree about the same party.
//
// IT LOADS LATE. That conversion drags in the bestiary and the item tables —
// about 150KB the roller has no other use for — so it arrives after the sheets
// are on screen and the card fills itself in. A slow connection gets a working
// roller first and a radar a moment later, rather than neither.
let scorer = null;
let scorerAsked = false;

function ensureScorer() {
  if (scorerAsked) return;
  scorerAsked = true;
  Promise.all([import('./overview-card.js'), import('./combat.js')])
    .then(([card, combat]) => {
      scorer = { card: card.overviewCard, toCombatant: combat.combatantFromCharacter };
      renderOverview();
    })
    .catch(() => { /* the sheets are the page; the card is a bonus */ });
}

function renderOverview() {
  if (!scorer) { ensureScorer(); return; }
  const pcs = state.sheets.map((s) => scorer.toCombatant(s.character, s.added));
  overviewEl.hidden = false;
  overviewEl.innerHTML = scorer.card(pcs, {
    // `onward()`, not `location.hash`: this runs BEFORE writeHash() in the same
    // render, so reading the address bar gives the formation as it was one edit
    // ago. The link silently dropped whatever you had just done — the last
    // Fatigue, the last swap — and the next screen was right to show a party
    // without it.
    tail: `<p class="ov-note"><a href="kit/${onward()}">Kit them out</a> — hand round a
      haul, measured: each thing goes to whoever it saves most, and what nobody gains from
      stays on the floor.</p>`,
  });
}

function renderSheet(sheet, index) {
  const c = sheet.character;
  const inv = packInventory(itemsOf(sheet));
  const el = document.createElement('section');
  el.className = 'sheet';

  const attrBox = (key) => `
    <div class="stat swappable ${sheet.picked.includes(key) ? 'picked' : ''}" data-swap="${key}" data-sheet="${index}" title="Click two attributes to swap them">
      <div class="k">${key}</div><div class="v">${c.attributes[key]}</div>
      <div class="sub">save ≤ ${c.attributes[key]}</div>
    </div>`;

  const slotCell = (n, cell) => {
    if (!cell) return `<div class="slot ${n <= 4 ? 'body' : ''}"><span class="n">${n}</span></div>`;
    const { item, part, of } = cell;
    const cls = ['slot', 'filled', n <= 4 ? 'body' : '', item.fatigue ? 'fatigue' : '', part === 2 ? 'cont' : ''].join(' ');
    const label = part === 2 ? `${escapeHtml(item.name)} (cont.)` : md(item.text);
    const drop = part !== 2 && sheet.added.includes(item)
      ? `<button class="drop" data-drop="${index}" data-at="${sheet.added.indexOf(item)}" title="Remove">×</button>` : '';
    // No "(bulky)" badge: the item's own text says so, and it visibly occupies
    // two slots — three tellings of the same fact is two too many.
    return `<div class="${cls}"><span class="n">${n}</span><span>${label}</span>${drop}</div>`;
  };

  const cells = [];
  for (let n = 1; n <= inv.capacity; n++) cells.push(slotCell(n, inv.slots[n - 1]));

  // Offers are addressed by their FLAT INDEX across all of this character's
  // tables, not by their label. Two offers can carry the same words, and a
  // label cannot tell them apart — the same mistake the combat layer made with
  // two sets of Soporific Darts. The index is also what goes in the URL.
  const offers = offersOf(c);
  const taken = E(index).taken;
  let at = -1;
  const tables = c.background.tables.map((t) => `
    <div class="qa">
      <div class="q">${escapeHtml(t.prompt)} <span class="r">d6 → ${t.roll}</span></div>
      <div class="a">${t.title ? `<span class="t">${escapeHtml(t.title)}.</span> ` : ''}${md(t.text)}</div>
      ${t.offers.length ? `<div class="chips">${t.offers.map((o) => {
        at += 1;
        const got = taken.includes(at);
        return `<button class="chip" data-add="${index}" data-offer="${at}" ${got ? 'disabled' : ''}>${got ? '✓ ' : '+ '}${escapeHtml(o.label)}</button>`;
      }).join('')}</div>` : ''}
    </div>`).join('');

  const showOmen = state.formation.size === 1 || c.readsOmen;

  el.innerHTML = `
    <div class="sheet-head">
      <div class="who">${escapeHtml(c.name)} <span class="bg">the ${escapeHtml(c.background.name)}</span></div>
      <div class="whence">seed ${escapeHtml(c.seed)}<br>age ${c.age} · d20 → ${c.background.roll}</div>
    </div>
    <p class="blurb">${escapeHtml(c.background.blurb)}</p>

    <div class="stat-row">
      ${attrBox('STR')}${attrBox('DEX')}${attrBox('WIL')}
      <div class="stat"><div class="k">HP</div><div class="v">${c.hp}</div><div class="sub">hit protection</div></div>
      <div class="stat"><div class="k">Armor</div><div class="v">${inv.armor}</div><div class="sub">max 3</div></div>
    </div>

    <div class="sec">
      <h2>Inventory
        <span class="note ${inv.full ? 'warn' : ''}">
          ${inv.used} / ${inv.capacity} slots${inv.full ? ' — full pack: reduced to 0 HP' : ''}
        </span>
      </h2>
      <div class="slots">${cells.join('')}</div>
      ${inv.petty.length ? `<div class="petty-line"><b>Petty</b> (no slot): ${inv.petty.map((p) => md(p.text)).join(' · ')}</div>` : ''}
      <div class="chips no-print">
        <form class="add-item" data-form="${index}">
          <input type="text" name="item" placeholder="add an item — Rope (25ft), Torch (3 uses)…"
                 aria-label="Add an item to the pack" spellcheck="false">
        </form>
        <button class="chip" data-fatigue="${index}">+ Fatigue</button>
        ${inv.weapons.length ? `<span class="chip static">damage: ${inv.weapons.map((w) => `${escapeHtml(w.name)} ${w.damage}`).join(' · ')}</span>` : ''}
      </div>
    </div>

    <div class="sec">
      <h2>Background <span class="note">${escapeHtml(c.background.name)}</span></h2>
      ${tables}
    </div>

    <div class="sec">
      <h2>Traits</h2>
      <div class="traits">
        ${Object.entries(c.traits).map(([k, t]) =>
          `<span><b>${k}</b>${escapeHtml(t.value)}</span>`).join('')}
      </div>
    </div>

    <div class="sec">
      <h2>Bond <span class="note">d20 → ${c.bond.n}</span></h2>
      <div class="qa"><div class="a">${md(c.bond.text)}</div></div>
    </div>

    ${showOmen ? `
    <div class="sec">
      <h2>Omen <span class="note">d20 → ${c.omen.n}${state.formation.size > 1 ? ' — the youngest reads it aloud' : ''}</span></h2>
      <div class="qa"><div class="a">${md(c.omen.text)}</div></div>
    </div>` : ''}

    <details class="log">
      <summary>Every die that made this character</summary>
      <table class="log-table">
        ${c.log.map((l) => `<tr><td>${escapeHtml(l.label)}</td><td class="dice">${l.notation} → ${l.rolls.join(' + ')}${l.rolls.length > 1 || l.notation.includes('+') ? ` = ${l.total}` : ''}</td></tr>`).join('')}
      </table>
    </details>`;

  return el;
}

// ---------------------------------------------------------------- behaviour
//
// EVERY EDIT WRITES TO THE FORMATION AND RE-DERIVES. Nothing mutates a sheet
// in place any more: a sheet is a view of the formation, and the formation is
// the URL. That is the only arrangement in which the party on this screen and
// the party on the next one cannot drift apart.

const E = (i) => editsFor(state.formation, i);

sheetsEl.addEventListener('click', (e) => {
  const swap = e.target.closest('[data-swap]');
  if (swap) {
    const sheet = state.sheets[Number(swap.dataset.sheet)];
    const key = swap.dataset.swap;
    const picked = sheet.picked.includes(key)
      ? sheet.picked.filter((k) => k !== key)
      : [...sheet.picked, key];
    if (picked.length === 2) {
      const [a, b] = picked;
      E(Number(swap.dataset.sheet)).swaps.push([a, b]);
      sheet.picked = [];
      say(`swapped ${a} and ${b}`);
      return commit();
    }
    sheet.picked = picked;
    return render();
  }

  const add = e.target.closest('[data-add]');
  if (add) {
    E(Number(add.dataset.add)).taken.push(Number(add.dataset.offer));
    return commit();
  }

  const fatigue = e.target.closest('[data-fatigue]');
  if (fatigue) {
    const ed = E(Number(fatigue.dataset.fatigue));
    ed.fatigue = Math.min(9, ed.fatigue + 1);
    return commit();
  }

  // Removing an added item, by its position in the derived `added` list. That
  // list is built taken-then-typed-then-fatigue, so the position tells us which
  // of the three to undo — no name matching, which could not tell two identical
  // items apart.
  const drop = e.target.closest('[data-drop]');
  if (drop) {
    const i = Number(drop.dataset.drop);
    const ed = E(i);
    let k = Number(drop.dataset.at);
    if (k < ed.taken.length) ed.taken.splice(k, 1);
    else if ((k -= ed.taken.length) < ed.typed.length) ed.typed.splice(k, 1);
    else ed.fatigue = Math.max(0, ed.fatigue - 1);
    return commit();
  }
});

// Whatever the offer chips miss — a book named in prose, loot from the first
// session — the player can just type. Qualities in the text are parsed the same
// way as the SRD's own gear lines, so "Rope (25ft)" and "Shield (+1 Armor)"
// both land in the slots correctly.
sheetsEl.addEventListener('submit', (e) => {
  const form = e.target.closest('[data-form]');
  if (!form) return;
  e.preventDefault();
  const label = form.item.value.trim();
  if (!label) return;
  E(Number(form.dataset.form)).typed.push(label);
  commit();
});

/** A new seed is a new party, so every edit made to the old one goes with it. */
function reseed(seed) {
  state.formation = { ...state.formation, seed, edits: {} };
  $('seed').value = seed;
  state.sheets = [];
  load();
}

$('roll').addEventListener('click', () => reseed(coinSeed()));
$('seed').addEventListener('change', () => reseed($('seed').value.trim() || coinSeed()));

$('size').addEventListener('change', () => {
  // Changing the size renumbers everybody, so the edits no longer refer to the
  // people they were made about. Dropping them is the honest move; silently
  // re-applying member 3's swap to a different member 3 is not.
  state.formation = { ...state.formation, size: Number($('size').value), edits: {} };
  state.sheets = [];
  load();
});

$('print').addEventListener('click', () => window.print());

$('copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(location.href);
    say('link copied — it rolls this exact party');
  } catch {
    say(location.href);
  }
});

$('json').addEventListener('click', () => {
  const payload = {
    system: 'cairn-2e',
    source: 'https://cairnrpg.com/second-edition/ (CC BY-SA 4.0, Yochai Gal)',
    seed: state.formation.seed,
    formation: `${location.origin}${location.pathname}#${encodeFormation(state.formation)}`,
    party: state.sheets.map((s) => {
      const inv = packInventory(itemsOf(s));
      return {
        ...s.character,
        inventory: { used: inv.used, capacity: inv.capacity, armor: inv.armor, items: itemsOf(s).map((i) => i.text) },
      };
    }),
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `cairn-${state.formation.seed}.json`;
  a.click();
  URL.revokeObjectURL(url);
  say('downloaded');
});

// ------------------------------------------------------------------- start
//
// A hash with no seed at all still has to mean "one fresh character", which is
// what this page has always opened on.
// The roller opens on ONE character when the URL does not say otherwise; every
// screen after it opens on four. Both defaults are stated at the call site.
state.formation = decodeFormation(location.hash, { defaultSize: 1 });
if (!state.formation.seed) state.formation.seed = coinSeed();
$('seed').value = state.formation.seed;
$('size').value = String(state.formation.size);
load();
