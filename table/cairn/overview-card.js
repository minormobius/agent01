// table/cairn/overview-card.js — the party overview card, as markup.
//
// Two pages draw this card (the roller and the kit screen) and they must draw
// the SAME card: a radar that means one thing on /cairn/ and another on
// /cairn/kit/ is worse than no radar. So the markup lives here once, and the
// pages own only their own behaviour.
//
// It returns an HTML string rather than nodes because both callers already
// build their pages by assigning innerHTML, and a DOM-building version would
// be a second idiom in a file that exists to prevent second versions of things.
//
// What the axes are and how they earned their place: `party.js`.

import { overview, radarPoints, ROLES } from './party.js';

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * The radar. Four axes, so the labels land on the compass points.
 *
 * `ghost` draws a second, dashed polygon behind the first — the party as they
 * were before conditioning. It is the whole argument for the kit screen made
 * visually: the shape grows, and you can see which way.
 */
export function radarSvg(axes, ghost = null) {
  const R = 62;
  const pts = radarPoints(axes, R);
  const poly = (ps) => ps.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const ring = (f) => `<circle class="ring" cx="0" cy="0" r="${(R * f).toFixed(1)}"/>`;
  const spokes = pts.map((p) =>
    `<line class="spoke" x1="0" y1="0" x2="${p.ax.toFixed(1)}" y2="${p.ay.toFixed(1)}"/>`).join('');
  const dots = pts.map((p) =>
    `<circle class="dot ${p.value ? '' : 'nil'}" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="2.6"/>`).join('');
  // Anchor by quadrant so no label overhangs the box: top and bottom centred,
  // the flanks pushed outwards.
  const labels = pts.map((p, i) => {
    const axis = axes[i];
    const anchor = Math.abs(p.ax) < 1 ? 'middle' : (p.ax > 0 ? 'start' : 'end');
    const dy = p.ay < -1 ? -8 : (p.ay > 1 ? 14 : 3);
    const dx = anchor === 'middle' ? 0 : (p.ax > 0 ? 6 : -6);
    return `<text class="${axis.weight ? '' : 'off'}" x="${(p.ax + dx).toFixed(1)}" `
      + `y="${(p.ay + dy).toFixed(1)}" text-anchor="${anchor}">${escapeHtml(axis.label)}</text>`;
  }).join('');
  const before = ghost
    ? `<polygon class="shape was" points="${poly(radarPoints(ghost, R))}"/>` : '';
  return `<svg class="radar" viewBox="-100 -84 200 176" role="img"
    aria-label="Party radar: ${axes.map((a) => `${a.label} ${Math.round(a.value * 100)}%`).join(', ')}">
    ${ring(1)}${ring(0.66)}${ring(0.33)}${spokes}${before}
    <polygon class="shape" points="${poly(pts)}"/>${dots}${labels}
  </svg>`;
}

/**
 * The whole card.
 *
 * @param {object[]} pcs      combatants, from combatantFromCharacter
 * @param {object}   [opts]
 * @param {object[]} [opts.was]   the party before conditioning — draws the ghost
 *                                and the score delta
 * @param {string}   [opts.tail]  extra markup appended below the note
 */
export function overviewCard(pcs, opts = {}) {
  const o = overview(pcs);
  const ghost = opts.was ? overview(opts.was) : null;
  const n = pcs.length;

  const legend = o.axes.map((a) => {
    // The correlation is on screen, not buried in a comment. It is the reason
    // the axis is on the chart at all.
    const title = `${a.why}. Correlation with casualties for a party ${o.delves} `
      + `${o.delves === 1 ? 'delve' : 'delves'} in: ${a.corr.toFixed(2)} `
      + `(negative is good). Across delve levels 0–3: ${a.corrByDelve.join(', ')}.`;
    const gi = ghost && ghost.axes.find((x) => x.key === a.key);
    const moved = gi && Math.abs(gi.raw - a.raw) > 0.005
      ? `<span class="was">was ${gi.raw.toFixed(1)}</span>` : '';
    return `<div class="${a.weight ? '' : 'off'}" title="${escapeHtml(title)}">
      <span class="k">${escapeHtml(a.label)}</span>
      <span class="v">${a.raw.toFixed(1)}</span>
      ${moved}
      <span class="c">r ${a.corr.toFixed(2)}</span>
    </div>`;
  }).join('');

  const roleChips = ROLES.map((r) => {
    const who = o.roles[r.key];
    const title = who.length ? `${r.why} — ${who.join(', ')}` : `nobody: ${r.why}`;
    const gained = ghost && !ghost.roles[r.key].length && who.length;
    return `<span class="ov-role ${who.length ? '' : 'gap'} ${gained ? 'new' : ''}" `
      + `title="${escapeHtml(title)}">${escapeHtml(r.label)}`
      + `${who.length > 1 ? ` ×${who.length}` : ''}</span>`;
  }).join('');

  const filled = ROLES.length - o.missing.length;
  const strongest = o.axes.reduce((a, b) => (b.value > a.value ? b : a));
  // Kept as a guard, not as decoration: an axis carrying no weight at this
  // party's delve level is greyed and named rather than drawn as a zero the
  // reader would take for a weakness. Nothing triggers it since `sweep` — the
  // axis that was permanently zero for fresh parties — was replaced by `speed`.
  const notYet = o.axes.filter((a) => !a.weight).map((a) => a.label);
  const enc = o.encumbered;
  const delta = ghost ? Math.round(o.score * 100) - Math.round(ghost.score * 100) : 0;

  return `
    ${radarSvg(o.axes, ghost ? ghost.axes : null)}
    <div class="ov-body">
      <div class="ov-head">
        <span class="n">${Math.round(o.score * 100)}</span>
        <h2>party score</h2>
        ${delta ? `<span class="delta ${delta > 0 ? 'up' : 'down'}">${delta > 0 ? '+' : ''}${delta}</span>` : ''}
      </div>
      <div class="ov-legend">${legend}</div>
    </div>
    <div class="ov-tail">
      <div class="ov-roles">${roleChips}</div>
      <p class="ov-note">
        ${n} ${n === 1 ? 'delver' : 'delvers'} · ${o.hp} HP · ${o.armor} armour ·
        ${filled}/${ROLES.length} roles · strongest at <b>${escapeHtml(strongest.label)}</b>${
  notYet.length ? ` · <b>${notYet.map(escapeHtml).join(' and ')}</b> ${notYet.length === 1 ? 'does' : 'do'} not apply to a party this fresh` : ''}${
  enc.length ? ` · <b class="warn">${enc.map(escapeHtml).join(', ')}</b> ${enc.length === 1 ? 'has a full pack, so is' : 'have full packs, so are'} at 0 HP` : ''}.
        Every axis earned its place by predicting measured casualties — hover one for the number.
      </p>
      ${opts.tail || ''}
    </div>`;
}
