// palm/corpus/corpus.js — the reference pool, tiled.
//
// Everything here comes out of two committed JSON files. No repos are read, no
// axis is recomputed, nothing is fetched from a PDS: `corpus.json` already holds
// each member's six percentiles and composite, so 76 tiles cost one request and
// no work. That is what makes this page instant where /palm is a 90 MB download.

import { miniCard } from '../radar.js';
import { AXES, pole } from '../axes.js';
import { BANDS, band } from '../baseline.js';
import { archetype } from '../matrix.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const num = (n) => Number(n).toLocaleString('en-US');

let members = [];

// The corpus rows carry percentiles only, so the archetype is derived here with
// the same function the reading uses — one definition of the pair, not two.
function readingFor(m) {
  const axes = AXES.map((a, i) => ({
    key: a.key, label: a.label, pct: m.pcts[i], soft: m.pcts[i] === null,
  }));
  return { arch: archetype(axes), band: m.score === null ? null : band(m.score) };
}

// Sorting by a single line has to CHANGE WHAT THE TILE SHOWS, or the order looks
// arbitrary: a grid sorted by Vigil while every tile displays its composite reads
// as shuffled. So when a line is selected, its own percentile and pole word take
// the tile, and the rollup steps back to a small suffix.
function tile(m, axisIdx) {
  const { arch, band: b } = readingFor(m);
  const yr = m.first ? m.first.slice(0, 4) : '';
  const onAxis = axisIdx >= 0;
  const ax = onAxis ? AXES[axisIdx] : null;
  const val = onAxis ? m.pcts[axisIdx] : m.score;
  const caption = onAxis
    ? `${esc(ax.label)} · ${esc(pole(ax, m.pcts[axisIdx]))}`
    : (arch ? esc(arch.name) : (b ? esc(b.name) : ''));

  return `<a class="tile" href="/palm/?u=${encodeURIComponent(m.handle)}" title="${esc(m.handle)} — read this palm">
    <span class="plot">${miniCard({ pcts: m.pcts, score: m.score ?? 50, size: 150, highlight: axisIdx })}</span>
    <span class="meta">
      <span class="h"><span class="name">${esc(m.handle)}</span><span class="sc">${val === null || val === undefined ? '—' : Math.round(val)}</span></span>
      <span class="n">${num(m.posts)} posts${yr ? ' · since ' + yr : ''}${onAxis && m.score !== null ? ' · rollup ' + m.score : ''}</span>
      <span class="arch">${caption}</span>
    </span>
  </a>`;
}

function render() {
  const q = $('filter').value.trim().toLowerCase();
  const mode = $('sort').value;
  const axisIdx = mode.startsWith('axis:') ? AXES.findIndex((a) => a.key === mode.slice(5)) : -1;

  let rows = members.slice();
  if (q) {
    rows = rows.filter((m) => {
      const { arch, band: b } = readingFor(m);
      return m.handle.toLowerCase().includes(q)
        || (arch && arch.name.toLowerCase().includes(q))
        || (b && b.name.toLowerCase().includes(q))
        || AXES.some((a, i) => pole(a, m.pcts[i]).includes(q));
    });
  }

  if (axisIdx >= 0) {
    rows.sort((a, b) => (b.pcts[axisIdx] ?? -1) - (a.pcts[axisIdx] ?? -1));
  } else {
    rows.sort({
      'score-desc': (a, b) => (b.score ?? -1) - (a.score ?? -1),
      'score-asc': (a, b) => (a.score ?? 999) - (b.score ?? 999),
      handle: (a, b) => a.handle.localeCompare(b.handle),
      posts: (a, b) => b.posts - a.posts,
      first: (a, b) => String(a.first || '9999').localeCompare(String(b.first || '9999')),
    }[mode]);
  }

  $('grid').innerHTML = rows.map((m) => tile(m, axisIdx)).join('');
  $('count').textContent = rows.length === members.length
    ? `${members.length} accounts`
    : `${rows.length} of ${members.length}`;
  $('sortNote').textContent = axisIdx >= 0
    ? `${AXES[axisIdx].gloss} — ${AXES[axisIdx].machine} at 100, ${AXES[axisIdx].animal} at 0`
    : '';
}

// One option per line, plus the rollups. Built from AXES so a seventh line would
// appear here without anyone remembering to add it.
function buildSortOptions() {
  const sel = $('sort');
  const grp = document.createElement('optgroup');
  grp.label = 'by one line';
  for (const a of AXES) {
    const o = document.createElement('option');
    o.value = `axis:${a.key}`;
    o.textContent = `${a.label.toLowerCase()} — most ${a.machine} first`;
    grp.appendChild(o);
  }
  sel.appendChild(grp);
}

(async () => {
  try {
    const [corpus, baseline] = await Promise.all([
      fetch('../corpus.json').then((r) => r.json()),
      fetch('../baseline.json').then((r) => r.json()).catch(() => null),
    ]);
    members = corpus.members || [];
    $('n').textContent = members.length;
    buildSortOptions();
    render();

    // Named, not counted — the same list the reading page shows, for the same
    // reason: "everyone is in the corpus" is a claim someone should be able to check.
    if (baseline && baseline.rejected && baseline.rejected.length) {
      const byReason = new Map();
      for (const r of baseline.rejected) {
        const why = /only \d+ posts/.test(r.why) ? 'too few posts to measure at all'
          : r.why.includes('short') ? 'not enough words to fit the vocabulary curve over the same range as everyone else'
            : r.why;
        if (!byReason.has(why)) byReason.set(why, []);
        byReason.get(why).push(r.handle);
      }
      $('missing').innerHTML = `${baseline.rejected.length} of the ${baseline.attempted} accounts attempted are not here. `
        + `A shorter corpus measures a different thing, so including them would corrupt the comparison rather than widen it — `
        + `they are named rather than quietly dropped.<br><br>`
        + [...byReason].map(([why, hs]) =>
          `<b>${esc(why)}</b> (${hs.length}):<br><code>${hs.map(esc).join(', ')}</code>`).join('<br><br>');
    }
  } catch (e) {
    $('grid').innerHTML = `<p style="color:#b4472e;font-family:var(--mono);font-size:0.8rem">could not load the corpus: ${esc(e.message)}</p>`;
  }
})();

$('sort').addEventListener('change', render);
$('filter').addEventListener('input', render);
