// table/cairn/app.js — the page around the roller.
//
// roll.js owns the dice and the rules; this file owns the DOM and the two
// things a player does to a rolled sheet before play: swap two attributes
// (which Cairn explicitly allows) and decide which items their background
// results actually handed them. Those edits live only in the page — the seed
// still reproduces the sheet as rolled, which is the point of the permalink.

import { rollCharacter, rollParty, packInventory, parseItem, swapAttributes, coinSeed } from './roll.js';

const $ = (id) => document.getElementById(id);
const sheetsEl = $('sheets');
const overviewEl = $('overview');

/** Sheets currently on screen, each with its local player edits. */
let state = { seed: '', size: 1, sheets: [] };

// ------------------------------------------------------------------ helpers

const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** The SRD's light markdown: **item** and *quality*. Escaped first. */
const md = (s) => escapeHtml(s)
  .replace(/\*\*([^*]+)\*\*/g, '<span class="t">$1</span>')
  .replace(/\*([^*]+)\*/g, '<em>$1</em>');

function readHash() {
  const p = new URLSearchParams(location.hash.replace(/^#/, ''));
  return { seed: p.get('s') || '', size: Math.min(6, Math.max(1, Number(p.get('n')) || 1)) };
}

function writeHash() {
  const p = new URLSearchParams({ s: state.seed });
  if (state.size > 1) p.set('n', String(state.size));
  history.replaceState(null, '', `#${p}`);
}

function say(message) {
  $('status').textContent = message;
  clearTimeout(say.timer);
  say.timer = setTimeout(() => { $('status').textContent = ''; }, 2600);
}

// --------------------------------------------------------------- the sheets

/** A rolled character plus the edits the player has made to it in the page. */
function makeSheet(character) {
  return { character, extras: [], fatigue: 0, picked: [], taken: new Set() };
}

/** Everything the player added to the sheet in the page: items and fatigue. */
function addedOf(sheet) {
  return [...sheet.extras, ...Array.from({ length: sheet.fatigue }, () => ({
    ...parseItem('Fatigue'), fatigue: true,
  }))];
}

/** Gear as rolled + items added from background results + fatigue. */
const itemsOf = (sheet) => [...sheet.character.gear, ...addedOf(sheet)];

function load() {
  const { seed, size } = state;
  state.sheets = size === 1
    ? [makeSheet(rollCharacter(seed))]
    : rollParty(seed, size).members.map(makeSheet);
  render();
}

function render() {
  sheetsEl.innerHTML = '';
  state.sheets.forEach((sheet, i) => sheetsEl.appendChild(renderSheet(sheet, i)));
  renderOverview();
  writeHash();
}

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
  const pcs = state.sheets.map((s) => scorer.toCombatant(s.character, addedOf(s)));
  overviewEl.hidden = false;
  overviewEl.innerHTML = scorer.card(pcs, {
    tail: `<p class="ov-note"><a href="kit/${location.hash}">Kit them out</a> — hand round a
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
    const drop = part !== 2 && (item.fatigue || sheet.extras.includes(item))
      ? `<button class="drop" data-drop="${index}" data-name="${escapeHtml(item.name)}" title="Remove">×</button>` : '';
    // No "(bulky)" badge: the item's own text says so, and it visibly occupies
    // two slots — three tellings of the same fact is two too many.
    return `<div class="${cls}"><span class="n">${n}</span><span>${label}</span>${drop}</div>`;
  };

  const cells = [];
  for (let n = 1; n <= inv.capacity; n++) cells.push(slotCell(n, inv.slots[n - 1]));

  const tables = c.background.tables.map((t) => `
    <div class="qa">
      <div class="q">${escapeHtml(t.prompt)} <span class="r">d6 → ${t.roll}</span></div>
      <div class="a">${t.title ? `<span class="t">${escapeHtml(t.title)}.</span> ` : ''}${md(t.text)}</div>
      ${t.offers.length ? `<div class="chips">${t.offers.map((o) => {
        const taken = sheet.taken.has(o.label);
        return `<button class="chip" data-add="${index}" data-item="${escapeHtml(o.label)}" ${taken ? 'disabled' : ''}>${taken ? '✓ ' : '+ '}${escapeHtml(o.label)}</button>`;
      }).join('')}</div>` : ''}
    </div>`).join('');

  const showOmen = state.size === 1 || c.readsOmen;

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
      <h2>Omen <span class="note">d20 → ${c.omen.n}${state.size > 1 ? ' — the youngest reads it aloud' : ''}</span></h2>
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
      sheet.character = swapAttributes(sheet.character, a, b);
      sheet.picked = [];
      say(`swapped ${a} and ${b}`);
    } else {
      sheet.picked = picked;
    }
    return render();
  }

  const add = e.target.closest('[data-add]');
  if (add) {
    const sheet = state.sheets[Number(add.dataset.add)];
    const label = add.dataset.item;
    sheet.extras.push(parseItem(label));
    sheet.taken.add(label);
    return render();
  }

  const fatigue = e.target.closest('[data-fatigue]');
  if (fatigue) {
    state.sheets[Number(fatigue.dataset.fatigue)].fatigue++;
    return render();
  }

  const drop = e.target.closest('[data-drop]');
  if (drop) {
    const sheet = state.sheets[Number(drop.dataset.drop)];
    const name = drop.dataset.name;
    if (name === 'Fatigue') {
      sheet.fatigue = Math.max(0, sheet.fatigue - 1);
    } else {
      const i = sheet.extras.findIndex((x) => x.name === name);
      if (i >= 0) {
        sheet.taken.delete(sheet.extras[i].text);
        sheet.extras.splice(i, 1);
      }
    }
    return render();
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
  state.sheets[Number(form.dataset.form)].extras.push(parseItem(label));
  render();
});

$('roll').addEventListener('click', () => {
  state.seed = coinSeed();
  $('seed').value = state.seed;
  load();
});

$('seed').addEventListener('change', () => {
  state.seed = $('seed').value.trim() || coinSeed();
  $('seed').value = state.seed;
  load();
});

$('size').addEventListener('change', () => {
  state.size = Number($('size').value);
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
    seed: state.seed,
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
  a.download = `cairn-${state.seed}.json`;
  a.click();
  URL.revokeObjectURL(url);
  say('downloaded');
});

// ------------------------------------------------------------------- start

const fromUrl = readHash();
state.seed = fromUrl.seed || coinSeed();
state.size = fromUrl.size;
$('seed').value = state.seed;
$('size').value = String(state.size);
load();
