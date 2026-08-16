// table/cairn/arena/app.js — one fight, played back.
//
// The oracle answers "how bad is this?" with a number. This answers "what does
// that actually look like?", which is a different question and not one a
// percentage can settle. It runs ONE fight through the same simulator the
// oracle runs five thousand times, records the events, and replays them.
//
// It does not re-implement combat. Everything on screen comes out of
// combat.js's event stream, so what you watch and what the oracle counts can
// never disagree — if the replay looks wrong, the model IS wrong.
//
// On the map: Cairn has no positions and this model simulates none. The two
// ranks are a reading aid, nothing more. Nobody moves, nobody flanks, and
// distance means nothing — drawing a tactical grid would be inventing rules the
// game does not have, in the one place a reader would believe them.

import { rollParty, rollCharacter, makeRng } from '../roll.js';
import { BESTIARY } from '../monsters.js';
import { simulate, assess, combatantFromCharacter, combatantFromMonster } from '../combat.js';
import { delve } from '../delve.js';

const $ = (id) => document.getElementById(id);
const SVG = 'http://www.w3.org/2000/svg';

const state = {
  seed: 'oak-fen-317', size: 4, delves: 0, monster: 'goblin', count: 4,
  fight: 1,            // which fight of this encounter we are watching
  events: [], at: 0, playing: false, timer: null,
  tokens: new Map(),   // name -> { el, hp, maxHp, x, y }
};

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ------------------------------------------------------------------ setup

function readHash() {
  const p = new URLSearchParams(location.hash.replace(/^#/, ''));
  if (p.get('s')) state.seed = p.get('s');
  if (p.get('n')) state.size = Math.min(6, Math.max(1, Number(p.get('n')) || 4));
  if (p.get('v')) state.delves = Math.min(10, Math.max(0, Number(p.get('v')) || 0));
  if (p.get('m') && BESTIARY.some((m) => m.id === p.get('m'))) state.monster = p.get('m');
  // the same ceiling the oracle uses, so a link from it never quietly becomes
  // a different encounter than the one it just weighed
  if (p.get('c')) state.count = Math.min(30, Math.max(1, Number(p.get('c')) || 4));
  if (p.get('f')) state.fight = Math.max(1, Number(p.get('f')) || 1);
}

function writeHash() {
  const p = new URLSearchParams({
    s: state.seed, n: String(state.size), m: state.monster, c: String(state.count), f: String(state.fight),
  });
  if (state.delves) p.set('v', String(state.delves));
  history.replaceState(null, '', `#${p}`);
}

function buildParty() {
  const members = state.size === 1
    ? [rollCharacter(state.seed)]
    : rollParty(state.seed, state.size).members;
  return (state.delves ? members.map((m, i) => delve(m, state.delves, { seed: `${i}` })) : members)
    .map((m) => combatantFromCharacter(m));
}

const buildFoes = () => {
  const monster = BESTIARY.find((m) => m.id === state.monster);
  return Array.from({ length: state.count }, (_, i) => combatantFromMonster(monster, i));
};

// -------------------------------------------------------------------- map

/**
 * Two facing ranks. Enemies along the top, the party along the bottom, each
 * spread evenly across the width — which is legibility, not geography.
 */
function layout(list, row, total) {
  return list.map((c, i) => ({
    name: c.name,
    x: (100 / (total + 1)) * (i + 1),
    y: row,
  }));
}

/**
 * Up to eight abreast; a crowd stacks into ranks behind the first, split
 * evenly so the last row is never a lonely straggler. Above one row the
 * per-token names come off — thirty identical labels are noise, and the feed
 * says who is doing what anyway.
 */
function ranks(list, max = 8) {
  const rows = Math.max(1, Math.ceil(list.length / max));
  const per = Math.ceil(list.length / rows);
  const out = [];
  for (let i = 0; i < list.length; i += per) out.push(list.slice(i, i + per));
  return out;
}

/**
 * The viewBox follows the shape of the space it is given, so the two ranks sit
 * near the top and bottom of the actual map area rather than inside a square
 * letterboxed into a tall phone screen.
 */
function fieldBox() {
  const map = $('map');
  const w = map.clientWidth || 390;
  const h = map.clientHeight || 480;
  const height = Math.max(60, Math.min(160, (h / w) * 100));
  return { height };
}

/** One token on the field, registered so events can find it by name. */
function token(c, spot, cls, { labels = true, barWidth = 9, size = 1 } = {}) {
  // Two groups, not one: the outer carries the position, the inner carries the
  // classes. A CSS transform (.tok.acting scales) REPLACES an SVG transform
  // attribute rather than composing with it, so a token that held its own
  // translate would jump to the corner the moment it acted.
  const wrap = document.createElementNS(SVG, 'g');
  wrap.setAttribute('transform', `translate(${spot.x} ${spot.y})`);
  const g = document.createElementNS(SVG, 'g');
  g.setAttribute('class', `tok ${cls}`);
  wrap.appendChild(g);

  // shape carries the side: the party are circles, the enemy diamonds
  const body = document.createElementNS(SVG, cls === 'pc' ? 'circle' : 'rect');
  body.setAttribute('class', 'body');
  body.setAttribute('stroke-width', String(1.6 * size));
  if (cls === 'pc') {
    body.setAttribute('r', String(4.2 * size));
  } else {
    const half = 3.4 * size;
    body.setAttribute('x', String(-half)); body.setAttribute('y', String(-half));
    body.setAttribute('width', String(half * 2)); body.setAttribute('height', String(half * 2));
    body.setAttribute('transform', 'rotate(45)');
  }
  g.appendChild(body);

  const barY = 5.6 * size;
  for (const cls2 of ['hpbar', 'hpfill']) {
    const r = document.createElementNS(SVG, 'rect');
    r.setAttribute('class', cls2);
    r.setAttribute('x', String(-barWidth / 2)); r.setAttribute('y', String(barY));
    r.setAttribute('width', String(barWidth)); r.setAttribute('height', '0.9');
    r.setAttribute('rx', '0.45');
    g.appendChild(r);
  }
  const fill = g.querySelector('.hpfill');

  if (labels) {
    const label = document.createElementNS(SVG, 'text');
    label.setAttribute('class', 'name');
    label.setAttribute('y', cls === 'pc' ? '9.5' : '-6');
    label.textContent = tokenLabel(c.name, cls);
    g.appendChild(label);
  }

  $('field').appendChild(wrap);
  state.tokens.set(c.name, {
    el: g, fill, barWidth, hp: c.hp, maxHp: Math.max(1, c.maxHp), x: spot.x, y: spot.y,
  });
  return g;
}

function drawField(pcs, foes) {
  const field = $('field');
  const { height } = fieldBox();
  field.innerHTML = '';
  field.setAttribute('viewBox', `0 0 100 ${height}`);
  state.tokens.clear();
  state.box = { height };

  const fx = document.createElementNS(SVG, 'g');
  fx.setAttribute('class', 'fx');
  field.appendChild(fx);
  state.fx = fx;

  const place = (list, row, cls, { labels = true, size = 1 } = {}) => {
    // The bar is a fraction of the space each token has, not a fixed width:
    // at eight abreast a 9-unit bar in an 11-unit slot merges with its
    // neighbours into one continuous rule across the field.
    const pitch = 100 / (list.length + 1);
    const barWidth = Math.min(9, pitch * 0.62);
    layout(list, row, list.length).forEach((spot, i) => {
      token(list[i], spot, cls, { labels, barWidth, size });
    });
  };

  // Ranks at roughly a third and two thirds of the field's real height: enough
  // ground between them to read a blow crossing it, not so much that a tall
  // phone is mostly empty floor. A party never needs more than one row; the
  // oracle will happily throw thirty goblins, so the enemy stacks.
  const rows = ranks(foes);
  const gap = Math.min(13, (height * 0.28) / Math.max(1, rows.length - 1));
  const size = rows.length > 1 ? 0.8 : 1;      // a horde stands closer together
  rows.forEach((row, i) => place(row, height * 0.30 + i * gap, 'foe',
    { labels: rows.length === 1, size }));
  place(pcs, height * 0.72, 'pc');
}

/** "Bandit (leader)" -> "Bandit ldr"; long names crowd a phone. */
function shortName(name) {
  return name
    .replace('Spellbook: ', '')
    .replace(' (leader)', ' ldr')
    .replace(' (summoned)', ' ✧')
    .slice(0, 13);
}

/** Spells arrive as "Spellbook: Charm"; on the page they are just the spell. */
const spellName = (s) => escapeHtml(String(s).replace('Spellbook: ', ''));

/**
 * On the field, six copies of "Bandit 4" is six labels the reader already
 * knows the answer to — the title says what they all are. So the enemy rank
 * keeps only what distinguishes one from another. The feed still says the
 * whole name, because there it is a sentence rather than a tag.
 */
function tokenLabel(name, cls) {
  if (cls !== 'foe') return shortName(name);
  const base = (BESTIARY.find((m) => m.id === state.monster) || {}).name;
  if (base && name.startsWith(base)) {
    const rest = name.slice(base.length).trim();
    return rest ? shortName(rest.replace(/^\(|\)$/g, '')) : shortName(base);
  }
  return shortName(name);
}

function setHp(name, hp) {
  const t = state.tokens.get(name);
  if (!t) return;
  t.hp = Math.max(0, hp);
  t.fill.setAttribute('width', String(t.barWidth * Math.min(1, t.hp / t.maxHp)));
}

function flag(name, cls, on = true) {
  const t = state.tokens.get(name);
  if (t) t.el.classList.toggle(cls, on);
}

function flash(name, cls, ms = 300) {
  const t = state.tokens.get(name);
  if (!t) return;
  t.el.classList.add(cls);
  setTimeout(() => t.el.classList.remove(cls), ms);
}

/** A line from attacker to target — the only motion on the field. */
function swing(from, to) {
  const a = state.tokens.get(from);
  const b = state.tokens.get(to);
  if (!a || !b) return;
  // Stop short of both tokens: a line that lands on the shapes reads as a
  // tether joining them, a line with air at each end reads as a blow.
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const [ux, uy] = [dx / len, dy / len];
  const inset = Math.min(6, len / 3);
  const line = document.createElementNS(SVG, 'line');
  line.setAttribute('x1', a.x + ux * inset); line.setAttribute('y1', a.y + uy * inset);
  line.setAttribute('x2', b.x - ux * inset); line.setAttribute('y2', b.y - uy * inset);
  line.setAttribute('stroke', a.el.classList.contains('pc') ? 'var(--pc)' : 'var(--foe)');
  state.fx.appendChild(line);
  requestAnimationFrame(() => line.classList.add('show'));
  setTimeout(() => line.remove(), 500);
}

function ripple(from) {
  const a = state.tokens.get(from);
  if (!a) return;
  const c = document.createElementNS(SVG, 'circle');
  c.setAttribute('class', 'ripple');
  c.setAttribute('cx', a.x); c.setAttribute('cy', a.y);
  c.setAttribute('stroke', 'var(--gold)');
  state.fx.appendChild(c);
  requestAnimationFrame(() => c.classList.add('show'));
  setTimeout(() => c.remove(), 700);
}

/** A damage number rising off a token. */
function pop(name, text, colour) {
  const t = state.tokens.get(name);
  if (!t) return;
  const map = $('map');
  const el = document.createElement('div');
  el.className = 'pop';
  const box = state.box || { height: 100 };
  el.style.left = `${t.x}%`;
  el.style.top = `${(t.y / box.height) * 100}%`;
  el.style.color = colour;
  el.textContent = text;
  map.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => el.remove(), 950);
}

// ------------------------------------------------------------------- feed

function say(html, cls = '') {
  const feed = $('feed');
  const p = document.createElement('p');
  p.className = cls;
  p.innerHTML = html;
  feed.appendChild(p);
  feed.scrollTop = feed.scrollHeight;
}

function separator(text) {
  const feed = $('feed');
  const d = document.createElement('div');
  d.className = 'sep';
  d.textContent = text;
  feed.appendChild(d);
  feed.scrollTop = feed.scrollHeight;
}

const who = (name) => `<b>${escapeHtml(shortName(name))}</b>`;
const sideOf = (name) => (state.tokens.get(name)
  && state.tokens.get(name).el.classList.contains('pc') ? 'pc' : 'foe');

/**
 * One event -> what the map does and what the feed says. The wording is doing
 * real work: "9, armour stops 1, 4 to hit protection and 4 into STR" is the
 * whole of Cairn's damage chain in one line, and watching it happen is the
 * fastest way to understand why the game is so lethal.
 */
function apply(e) {
  switch (e.kind) {
    case 'round':
      $('round').textContent = `round ${e.round}`;
      separator(`round ${e.round}`);
      break;

    case 'flatfooted':
      say(`${who(e.actor)} is caught flat-footed — no action this round.`, 'note');
      break;

    case 'attack':
      flash(e.actor, 'acting', 420);
      if (e.blast) {
        ripple(e.actor);
        say(`${who(e.actor)} sets off <span class="n">${escapeHtml(e.weapon)}</span> — it catches everyone.`, sideOf(e.actor));
      } else {
        swing(e.actor, e.target);
        const mod = e.mod === 'impaired' ? ' <span class="n">(impaired, d4)</span>'
          : e.mod === 'enhanced' ? ' <span class="n">(enhanced, d12)</span>' : '';
        say(`${who(e.actor)} swings ${escapeHtml(e.weapon)} at ${who(e.target)}${mod}.`, sideOf(e.actor));
      }
      break;

    case 'hit': {
      const t = state.tokens.get(e.target);
      if (t) setHp(e.target, e.hp);
      flash(e.target, 'hurt', 320);
      const parts = [`<span class="n">${e.raw}</span> rolled`];
      if (e.blocked) parts.push(`armour stops <span class="n">${e.blocked}</span>`);
      if (e.toHp) parts.push(`<span class="n">${e.toHp}</span> off hit protection`);
      if (e.toStr) parts.push(`<span class="n">${e.toStr}</span> straight into STR`);
      if (!e.toHp && !e.toStr) parts.push('nothing gets through');
      pop(e.target, e.toStr ? `−${e.toStr} STR` : `−${e.toHp}`,
        e.toStr ? 'var(--foe)' : 'var(--muted)');
      say(`${who(e.target)}: ${parts.join(', ')}.`, sideOf(e.target));
      break;
    }

    case 'down':
      flag(e.target, 'down');
      if (e.dead) flag(e.target, 'dead');
      say(`${who(e.target)} ${e.dead ? 'is killed' : 'goes down'} — ${escapeHtml(e.cause || '')}.`,
        sideOf(e.target));
      break;

    case 'cast':
      flash(e.actor, 'acting', 420);
      if (e.fumbled) {
        say(`${who(e.actor)} fumbles <em>${spellName(e.spell)}</em> — the Fatigue is spent for nothing.`, 'note');
      } else if (e.immune) {
        say(`${who(e.actor)} reads <em>${spellName(e.spell)}</em>; ${who(e.target)} shrugs it off.`, 'note');
      } else if (e.effect === 'ward') {
        flag(e.target, 'warded');
        ripple(e.target);
        say(`${who(e.actor)} reads <em>${spellName(e.spell)}</em> — ${who(e.target)} is shielded from mundane attacks.`, 'pc');
      } else if (e.effect === 'summon') {
        // It steps in between the ranks rather than joining the line: the
        // party's spacing is already drawn, and a servant sent forward is what
        // this actually is.
        if (e.summoned && !state.tokens.get(e.summoned.name)) {
          const caster = state.tokens.get(e.actor);
          const box = state.box || { height: 100 };
          token(e.summoned, { x: caster ? caster.x : 50, y: box.height * 0.53 }, 'pc',
            { barWidth: 7, size: 0.85 }).classList.add('summoned');
          ripple(e.summoned.name);
        }
        say(`${who(e.actor)} reads <em>${spellName(e.spell)}</em> and something answers.`, 'pc');
      } else if (e.resisted) {
        say(`${who(e.actor)} reads <em>${spellName(e.spell)}</em>; ${who(e.target)} resists.`, 'note');
      } else {
        say(`${who(e.actor)} reads <em>${spellName(e.spell)}</em> at ${who(e.target)}. One Fatigue — a slot gone.`, 'pc');
      }
      break;

    case 'power':
      flash(e.actor, 'acting', 420);
      say(`${who(e.actor)} uses <em>${escapeHtml(String(e.source).replace("Spellbook: ", ""))}</em>${e.target ? ` on ${who(e.target)}` : ''}.`, 'pc');
      break;

    case 'ability':
      flash(e.actor, 'acting', 500);
      if (e.scope === 'all') ripple(e.actor);
      say(`${who(e.actor)}: <em>${escapeHtml((e.note || e.effect).split('—')[0].trim())}</em>`, 'foe');
      break;

    case 'warded':
      say(`${who(e.target)} is untouched behind the shield.`, 'note');
      break;

    case 'shake':
      flag(e.target || e.actor, 'disabled', false);
      flag(e.actor, 'down', false);
      say(`${who(e.actor)} shakes it off and stands up.`, sideOf(e.actor));
      break;

    case 'regenerate':
      flag(e.actor, 'down', false);
      setHp(e.actor, e.hp);
      say(`${who(e.actor)} gets back up. Only fire or acid would have stopped that.`, 'foe');
      break;

    case 'rout':
      say(`The enemy breaks and runs — ${escapeHtml(e.reason)}.`, 'note');
      break;

    case 'end': {
      const lost = [...state.tokens.entries()]
        .filter(([, t]) => t.el.classList.contains('pc') && t.el.classList.contains('down')).length;
      separator('after');
      const line = lost === 0
        ? 'Everyone walks away.'
        : lost === state.size ? 'Nobody walks away.' : `${lost} of ${state.size} down.`;
      say(`${line} ${e.round} round${e.round === 1 ? '' : 's'}.`, 'verdict');
      say(`This was one fight. The oracle plays it five thousand times — press <b>New fight</b> to see another, and watch how much the same encounter varies.`, 'note');
      break;
    }
    default:
      break;
  }
}

// -------------------------------------------------------------- playback

function stop() {
  state.playing = false;
  clearInterval(state.timer);
  $('play').textContent = '▶ Play';
}

function step() {
  if (state.at >= state.events.length) { stop(); return false; }
  const e = state.events[state.at++];
  apply(e);
  // A hit reads as the consequence of the swing above it, so it follows fast;
  // everything else gets a beat to be read.
  return true;
}

function play() {
  if (state.at >= state.events.length) return;
  state.playing = true;
  $('play').textContent = '❚❚ Pause';
  clearInterval(state.timer);
  state.timer = setInterval(() => {
    const more = step();
    if (!more) stop();
  }, 620);
}

// ------------------------------------------------------------------ start

function run({ nextFight = false } = {}) {
  stop();
  if (nextFight) state.fight += 1;

  const pcs = buildParty();
  const foes = buildFoes();
  const monster = BESTIARY.find((m) => m.id === state.monster);

  // The verdict for this encounter, so a single fight can be read against the
  // distribution it came from rather than mistaken for it.
  const verdict = assess(pcs, foes, {
    trials: 2000, seed: `${state.seed}/${state.monster}/${state.count}`,
  });
  $('title').innerHTML = `${state.count} × ${escapeHtml(monster.name)}
    <small>vs ${state.size} · fight ${state.fight}</small>`;
  $('band').textContent = verdict.band;
  $('band').className = `band ${verdict.band}`;

  // One fight, recorded. Its seed includes the fight number, so "New fight"
  // is a different fight of the same encounter and "Replay" is the same one.
  const rng = makeRng(`${state.seed}/${state.monster}/${state.count}/watch/${state.fight}`);
  const result = simulate(pcs.map((c) => ({ ...c })), foes.map((c) => ({ ...c })), rng, { events: true });

  state.events = result.events;
  state.at = 0;
  $('feed').innerHTML = '';
  $('round').textContent = 'before the first round';

  const opening = state.events[0];
  drawField(opening.pcs, opening.foes);
  state.at = 1;                                   // the start event is the drawing

  separator('the field');
  for (const c of opening.pcs) {
    say(`${who(c.name)} — ${c.hp} HP, ${c.armor} armour, ${escapeHtml(c.weapon || 'unarmed')}.`, 'pc');
  }
  say(`Against ${state.count} × ${escapeHtml(monster.name)}: ${monster.hp} HP, ${monster.armor} armour.`, 'foe');
  if (opening.surprise) say('The party is ambushed — no one acts in the first round.', 'note');

  writeHash();
  play();
}

$('play').addEventListener('click', () => (state.playing ? stop() : play()));
$('step').addEventListener('click', () => { stop(); step(); });
$('again').addEventListener('click', () => run());
$('next').addEventListener('click', () => run({ nextFight: true }));

readHash();
run();
