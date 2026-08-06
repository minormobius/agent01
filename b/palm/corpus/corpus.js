// palm/corpus/corpus.js — the reference pool, tiled.
//
// Everything here comes out of two committed JSON files. No repos are read, no
// axis is recomputed, nothing is fetched from a PDS: `corpus.json` already holds
// each member's six percentiles and composite, so 76 tiles cost one request and
// no work. That is what makes this page instant where /palm is a 90 MB download.

import { miniCard } from '../radar.js';
import { AXES } from '../axes.js';
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

function tile(m) {
  const { arch, band: b } = readingFor(m);
  const yr = m.first ? m.first.slice(0, 4) : '';
  return `<a class="tile" href="/palm/?u=${encodeURIComponent(m.handle)}" title="${esc(m.handle)} — read this palm">
    <span class="plot">${miniCard({ pcts: m.pcts, score: m.score ?? 50, size: 150 })}</span>
    <span class="meta">
      <span class="h"><span class="name">${esc(m.handle)}</span><span class="sc">${m.score ?? '—'}</span></span>
      <span class="n">${num(m.posts)} posts${yr ? ' · since ' + yr : ''}</span>
      <span class="arch">${arch ? esc(arch.name) : (b ? esc(b.name) : '')}</span>
    </span>
  </a>`;
}

function render() {
  const q = $('filter').value.trim().toLowerCase();
  const mode = $('sort').value;

  let rows = members.slice();
  if (q) {
    rows = rows.filter((m) => {
      const { arch, band: b } = readingFor(m);
      return m.handle.toLowerCase().includes(q)
        || (arch && arch.name.toLowerCase().includes(q))
        || (b && b.name.toLowerCase().includes(q));
    });
  }
  const cmp = {
    'score-desc': (a, b) => (b.score ?? -1) - (a.score ?? -1),
    'score-asc': (a, b) => (a.score ?? 999) - (b.score ?? 999),
    handle: (a, b) => a.handle.localeCompare(b.handle),
    posts: (a, b) => b.posts - a.posts,
    first: (a, b) => String(a.first || '9999').localeCompare(String(b.first || '9999')),
  }[mode];
  rows.sort(cmp);

  $('grid').innerHTML = rows.map(tile).join('');
  $('count').textContent = rows.length === members.length
    ? `${members.length} accounts`
    : `${rows.length} of ${members.length}`;
}

(async () => {
  try {
    const [corpus, baseline] = await Promise.all([
      fetch('../corpus.json').then((r) => r.json()),
      fetch('../baseline.json').then((r) => r.json()).catch(() => null),
    ]);
    members = corpus.members || [];
    $('n').textContent = members.length;
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
