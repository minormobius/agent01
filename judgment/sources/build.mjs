#!/usr/bin/env node
// Bakes judgment/sources/ from library.json:
//   index.html   — the bibliography, fully readable with no JavaScript
//   library.csv  — the same list as a spreadsheet
//   library.bib  — the same list as BibTeX
//
//   node judgment/sources/build.mjs           # write
//   node judgment/sources/build.mjs --check   # exit 1 if any output is stale
//
// library.json is the hand-edited source. Edit it, then run this. Never edit the outputs.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const lib = JSON.parse(readFileSync(join(here, 'library.json'), 'utf8'));
const works = [...lib.works].sort((a, b) => a.rank - b.rank);

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const TIERS = {
  S: { name: 'Tier S', blurb: 'The core. If you read nothing else, read these.' },
  A: { name: 'Tier A', blurb: 'Essential next reading. These widen the core in every direction.' },
  B: { name: 'Tier B', blurb: 'Supporting. Specific mechanisms, recent surveys, and adjacent traditions.' },
  C: { name: 'Tier C', blurb: 'Background. Critical and genealogical context for the attention economy.' },
  N: { name: 'New, not yet ranked', blurb: 'Current work, 2018–2026, added from the survey on the field page. Listed in order of how closely each bears on the thesis; not yet placed in the ranking.' },
};
const BRANCHES = {
  agents: 'Multi-agent architecture, modularity, contracts, context',
  attention: 'Attention as the scarce input, and its markets',
  automation: 'What supervision does to the supervisor',
  cognition: 'Relevance, perception, distributed and embodied mind',
  cybernetics: 'Regulation, variety, near-decomposability',
  economics: 'Adaptation and complexity in economies',
  formation: 'Prudence, discernment and attention as practice',
  judgment: 'Taste, tacit knowledge, problem setting',
  learning: 'When intuition can be trusted, and how expertise grows',
  organization: 'Firms as attention and information processors',
  scene: 'Fields, art worlds, and the social life of valuation',
};
const KIND = {
  full: { word: 'Free full text', cls: 'k-full' },
  copy: { word: 'Online copy', cls: 'k-copy' },
  publisher: { word: 'Publisher', cls: 'k-pub' },
  catalog: { word: 'Library record', cls: 'k-cat' },
};
const STATUS = {
  verified: 'Details checked against the source.',
  corrected: 'Details corrected against the source.',
  unverified: 'Not yet verified.',
  not_found: 'Could not be found. This entry may be mistaken.',
};

const authorList = (a) => (a.length <= 2 ? a.join(' and ') : a.slice(0, -1).join(', ') + ', and ' + a.at(-1));
const hasFull = (w) => (w.links || []).some((l) => l.kind === 'full');
const hasRead = (w) => (w.links || []).some((l) => l.kind === 'full' || l.kind === 'copy');

function entry(w) {
  const links = (w.links || []).map((l) => {
    const k = KIND[l.kind] || KIND.catalog;
    const host = (() => { try { return new URL(l.url).hostname.replace(/^www\./, ''); } catch { return ''; } })();
    return `<li><a class="${k.cls}" href="${esc(l.url)}"><span class="kind">${k.word}</span> ${esc(l.label || host)}<span class="visually-hidden"> for ${esc(w.title)}</span></a></li>`;
  }).join('');
  const status = STATUS[w.status] || STATUS.unverified;
  const note = w.note ? ` ${esc(w.note)}` : '';
  const flag = w.status === 'not_found' || w.status === 'unverified' ? ' flag' : '';
  const search = [w.title, ...(w.authors || []), w.year, w.branch, w.relevance].join(' ').toLowerCase();
  return `<li class="work" id="${esc(w.id)}" value="${w.rank}" data-tier="${esc(w.tier)}" data-branch="${esc(w.branch)}" data-full="${hasRead(w) ? 1 : 0}" data-search="${esc(search)}">
<article aria-labelledby="${esc(w.id)}-t">
<h3 id="${esc(w.id)}-t"><span class="rank" aria-hidden="true">${w.tier === 'N' ? 'New' : w.rank + '.'}</span> <cite>${esc(w.title)}</cite></h3>
<p class="byline">${esc(authorList(w.authors || []))} <span class="year">(${esc(w.year)})</span></p>
<p class="why"><span class="visually-hidden">Why it is here: </span>${esc(w.relevance)}.</p>
<p class="meta"><span class="tag">${cap(esc(w.branch))}</span> ${w.tier === 'N' ? '<span class="tag">New, unranked</span>' : `<span class="tag">Tier ${esc(w.tier)}</span> <span class="tag">Rank ${w.rank}</span>`}</p>
${links ? `<ul class="links" aria-label="Where to read it">${links}</ul>` : `<p class="nolink">No link yet.</p>`}
<p class="status${flag}">${status}${note}</p>
<p class="mine no-print" hidden><label><input type="checkbox" class="read-box" data-id="${esc(w.id)}"> I’ve read this</label></p>
</article>
</li>`;
}

const tierSections = Object.keys(TIERS).map((t) => {
  const list = works.filter((w) => w.tier === t);
  if (!list.length) return '';
  return `<section class="group" data-group="tier:${t}" aria-labelledby="g-tier-${t}">
<h2 id="g-tier-${t}">${TIERS[t].name} <span class="count">${list.length} works</span></h2>
<p class="muted">${TIERS[t].blurb}</p>
<ol class="works">
${list.map(entry).join('\n')}
</ol>
</section>`;
}).join('\n');

const counts = {
  total: works.length,
  ranked: works.filter((w) => w.tier !== 'N').length,
  full: works.filter(hasFull).length,
  copy: works.filter((w) => !hasFull(w) && hasRead(w)).length,
  linked: works.filter((w) => (w.links || []).length).length,
  verified: works.filter((w) => w.status === 'verified' || w.status === 'corrected').length,
};
const branchOpts = lib.branches.map((b) => `<option value="${esc(b)}">${cap(esc(b))} (${works.filter((w) => w.branch === b).length})</option>`).join('');
const branchMeta = JSON.stringify(Object.fromEntries(lib.branches.map((b) => [b, BRANCHES[b] || ''])));
const tierMeta = JSON.stringify(TIERS);
const checked = lib.checked_on ? new Date(lib.checked_on + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : null;

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sources — judgment</title>
<meta name="description" content="${counts.total} sources for a curriculum on judgment in the agentic age, from automation and cybernetics to attention economics, cognition, and traditions of discernment. Ranked, annotated, and linked to free full text where it exists.">
<link rel="stylesheet" href="/judge.css">
<link rel="alternate" type="application/json" href="library.json" title="Bibliography as JSON">
<style>
.legend { list-style: none; padding: 0; margin: 0.5rem 0 1rem; display: grid; gap: 0.4rem; }
.legend li { font-size: 1rem; }
.tools { background: var(--surface); border: 1px solid var(--rule); border-radius: 8px; padding: 1rem; margin: 1.5rem 0; font-family: var(--sans); font-size: 1rem; }
.tools .row { display: flex; flex-wrap: wrap; gap: 0.75rem 1.25rem; align-items: end; }
.tools .field { display: flex; flex-direction: column; gap: 0.25rem; flex: 1 1 12rem; }
.tools label, .tools legend { font-weight: 600; font-size: 0.95rem; }
.tools input[type=search], .tools select { font: inherit; font-size: 1rem; padding: 0.5rem 0.6rem; min-height: 2.75rem; border: 1px solid var(--muted); border-radius: 4px; background: var(--bg); color: var(--text); width: 100%; }
.tools fieldset { border: 0; padding: 0; margin: 0.75rem 0 0; }
.tools .checks { display: flex; flex-wrap: wrap; gap: 0.5rem 1.25rem; margin-top: 0.75rem; }
.tools .checks label, .tools fieldset label { font-weight: 400; display: inline-flex; gap: 0.4rem; align-items: center; min-height: 2.75rem; }
.tools input[type=checkbox], .tools input[type=radio], .read-box { width: 1.25rem; height: 1.25rem; accent-color: var(--accent); }
.tools button { font: inherit; font-size: 1rem; min-height: 2.75rem; padding: 0.4rem 0.9rem; border: 1px solid var(--muted); border-radius: 4px; background: var(--bg); color: var(--text); cursor: pointer; }
#status { margin: 0.75rem 0 0; font-weight: 600; }
.group > h2 .count, .group > h2 + p { font-family: var(--sans); }
.group > h2 .count { font-size: 0.95rem; font-weight: 400; color: var(--muted); margin-left: 0.4rem; }
ol.works { list-style: none; padding: 0; margin: 0; }
li.work { border-top: 1px solid var(--rule); padding: 1rem 0 1.1rem; }
li.work h3 { margin: 0 0 0.25rem; font-size: 1.2rem; }
li.work cite { font-style: italic; }
.rank { font-family: var(--sans); font-size: 0.95rem; color: var(--muted); font-weight: 400; }
.byline { margin: 0 0 0.35rem; }
.why { margin: 0 0 0.5rem; }
.meta { margin: 0 0 0.5rem; font-family: var(--sans); }
.tag { display: inline-block; font-size: 0.85rem; background: var(--tag-bg); color: var(--text); padding: 0.1rem 0.5rem; border-radius: 3px; margin: 0 0.2rem 0.2rem 0; }
.links { list-style: none; padding: 0; margin: 0 0 0.5rem; display: flex; flex-wrap: wrap; gap: 0.5rem; font-family: var(--sans); font-size: 0.95rem; }
.links a { display: inline-flex; gap: 0.4rem; align-items: center; min-height: 2.75rem; padding: 0.35rem 0.75rem; border-radius: 4px; border: 1px solid currentColor; text-decoration: none; }
.links a:hover { text-decoration: underline; }
.links .kind { font-weight: 700; }
.k-full, .k-full:visited { color: var(--full); background: var(--full-bg); }
.k-copy, .k-copy:visited { color: var(--warn); background: var(--warn-bg); }
.k-pub, .k-pub:visited { color: var(--pub); background: var(--pub-bg); }
.k-cat, .k-cat:visited { color: var(--cat); background: var(--cat-bg); }
.status, .nolink { font-family: var(--sans); font-size: 0.9rem; color: var(--muted); margin: 0; }
.status.flag { color: var(--warn); background: var(--warn-bg); padding: 0.3rem 0.5rem; border-radius: 3px; display: inline-block; }
.mine { margin: 0.4rem 0 0; font-family: var(--sans); font-size: 0.95rem; }
.mine label { display: inline-flex; gap: 0.4rem; align-items: center; min-height: 2.75rem; }
li.work.is-read h3 cite { text-decoration: line-through; text-decoration-color: var(--muted); }
.downloads { font-family: var(--sans); }
@media print { .links a { border: 0; padding: 0; min-height: 0; background: none; } li.work { break-inside: avoid; } }
</style>
</head>
<body>
<a class="skip" href="#list">Skip to the list</a>
<header class="site-header">
  <a class="home" href="/">judgment</a>
  <nav aria-label="Site">
    <ul>
      <li><a href="/">About</a></li>
      <li><a href="/sources/" aria-current="page">Sources</a></li>
      <li><a href="/thesis/">Thesis</a></li>
      <li><a href="/testbed/">Testbed</a></li>
      <li><a href="/field/">Field</a></li>
      <li><a href="/tools/">Tools</a></li>
    </ul>
  </nav>
</header>

<main id="main">
<h1>Sources</h1>
<p class="lede">${counts.total} works for a curriculum on judgment in the agentic age. ${counts.ranked} are ranked by how much each matters to <a href="/">the research programme</a>, not by fame or by how strong the evidence is. The other ${counts.total - counts.ranked} are current work, newly added and not yet ranked.</p>

<p>${counts.full} of the ${counts.total} have a free, legal full text linked. ${counts.copy ? `${counts.copy} more can be read in an unofficial online copy. ` : ''}${counts.linked - counts.full - counts.copy > 0 ? `Another ${counts.linked - counts.full - counts.copy} link to the publisher or a library record. ` : ''}${counts.verified} have had their authors, title and year checked against the source${checked ? `, and every link was checked on ${checked}` : ''}. Anything still unverified is marked on its entry.</p>

<h2 id="how">How to read an entry</h2>
<ul class="legend">
  <li><span class="tag">Tier S</span> to <span class="tag">Tier C</span>: S is the core, C is background. <span class="tag">New, unranked</span>: current work not yet placed.</li>
  <li><span class="links" style="display:inline"><a class="k-full" href="#how" tabindex="-1" aria-hidden="true"><span class="kind">Free full text</span></a></span> means you can read the whole work for free, legally.</li>
  <li><span class="links" style="display:inline"><a class="k-copy" href="#how" tabindex="-1" aria-hidden="true"><span class="kind">Online copy</span></a></span> is an unofficial copy someone else hosts. It is not the publisher’s, and it may disappear.</li>
  <li><span class="links" style="display:inline"><a class="k-pub" href="#how" tabindex="-1" aria-hidden="true"><span class="kind">Publisher</span></a></span> is the official page. It may be paywalled.</li>
  <li><span class="links" style="display:inline"><a class="k-cat" href="#how" tabindex="-1" aria-hidden="true"><span class="kind">Library record</span></a></span> is for books still in copyright. Use it to find a library copy or an edition.</li>
</ul>

<p class="downloads">Take the whole list with you: <a href="library.csv" download>spreadsheet (CSV)</a> · <a href="library.bib" download>BibTeX</a> · <a href="library.json">JSON</a></p>

<form class="tools no-print" id="tools" role="search" aria-label="Filter the sources" hidden>
  <div class="row">
    <div class="field">
      <label for="q">Search titles, authors and notes</label>
      <input type="search" id="q" name="q" autocomplete="off" spellcheck="false">
    </div>
    <div class="field">
      <label for="branch">Branch</label>
      <select id="branch" name="branch"><option value="">All branches</option>${branchOpts}</select>
    </div>
    <div class="field">
      <label for="tier">Tier</label>
      <select id="tier" name="tier"><option value="">All tiers</option>${Object.keys(TIERS).map((t) => `<option value="${t}">${t === 'N' ? 'New, unranked' : 'Tier ' + t}</option>`).join('')}</select>
    </div>
  </div>
  <div class="checks">
    <label><input type="checkbox" id="fullonly" name="fullonly"> Only works I can read free online</label>
    <label><input type="checkbox" id="unread" name="unread"> Hide the ones I’ve read</label>
  </div>
  <fieldset>
    <legend>Arrange by</legend>
    <label><input type="radio" name="group" value="tier" checked> Tier, in rank order</label>
    <label><input type="radio" name="group" value="branch"> Branch</label>
  </fieldset>
  <div class="row" style="margin-top:0.5rem"><button type="reset">Clear filters</button></div>
  <p id="status" role="status" aria-live="polite"></p>
  <p class="small muted" style="margin:0.25rem 0 0">Your “read” ticks are saved in this browser only.</p>
</form>

<div id="list">
${tierSections}
</div>
<p id="empty" hidden>Nothing matches. <a href="#tools" id="clear-link">Clear the filters</a> to see everything.</p>
</main>

<footer class="site-footer">
  <p>${esc(lib.ranking_note || '')}</p>
  <p>The list was drafted in conversation, then checked against each work. Spotted an error? The source file is <a href="library.json">library.json</a>.</p>
  <p>judge.mino.mobi is part of <a href="https://mino.mobi">mino.mobi</a>.</p>
</footer>

<script>
(() => {
  const BRANCH = ${branchMeta};
  const TIER = ${tierMeta};
  const KEY = 'judge.sources.read';
  const form = document.getElementById('tools');
  const list = document.getElementById('list');
  const status = document.getElementById('status');
  const empty = document.getElementById('empty');
  const items = [...list.querySelectorAll('li.work')];
  items.sort((a, b) => a.value - b.value);
  let read = {};
  try { read = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(read)); } catch {} };

  form.hidden = false;
  for (const p of list.querySelectorAll('.mine')) p.hidden = false;
  for (const box of list.querySelectorAll('.read-box')) {
    box.checked = !!read[box.dataset.id];
    box.closest('li').classList.toggle('is-read', box.checked);
    box.addEventListener('change', () => {
      if (box.checked) read[box.dataset.id] = 1; else delete read[box.dataset.id];
      box.closest('li').classList.toggle('is-read', box.checked);
      save();
      if (form.unread.checked) apply();
    });
  }

  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  function section(key, title, blurb, members) {
    const s = document.createElement('section');
    s.className = 'group';
    const id = 'g-' + key.replace(':', '-');
    s.setAttribute('aria-labelledby', id);
    const h = document.createElement('h2'); h.id = id; h.textContent = title + ' ';
    const c = document.createElement('span'); c.className = 'count'; h.append(c);
    const p = document.createElement('p'); p.className = 'muted'; p.textContent = blurb;
    const ol = document.createElement('ol'); ol.className = 'works';
    members.forEach((m) => ol.append(m));
    s.append(h, p, ol);
    return s;
  }
  let arrangedAs = 'tier';
  function arrange(by) {
    if (by === arrangedAs) return;
    arrangedAs = by;
    list.replaceChildren();
    const keys = by === 'tier' ? Object.keys(TIER) : Object.keys(BRANCH);
    for (const k of keys) {
      const members = items.filter((i) => i.dataset[by] === k);
      if (!members.length) continue;
      const title = by === 'tier' ? TIER[k].name : cap(k);
      const blurb = by === 'tier' ? TIER[k].blurb : BRANCH[k];
      list.append(section(by + ':' + k, title, blurb, members));
    }
  }
  function apply() {
    arrange(form.group.value);
    const q = form.q.value.trim().toLowerCase().split(/\\s+/).filter(Boolean);
    const b = form.branch.value, t = form.tier.value;
    const full = form.fullonly.checked, unread = form.unread.checked;
    let shown = 0;
    for (const i of items) {
      const ok = (!b || i.dataset.branch === b) && (!t || i.dataset.tier === t) &&
        (!full || i.dataset.full === '1') && (!unread || !read[i.id]) &&
        q.every((w) => i.dataset.search.includes(w));
      i.hidden = !ok;
      if (ok) shown++;
    }
    for (const s of list.querySelectorAll('section.group')) {
      const n = s.querySelectorAll('li.work:not([hidden])').length;
      s.hidden = n === 0;
      s.querySelector('.count').textContent = n + (n === 1 ? ' work' : ' works');
    }
    empty.hidden = shown > 0;
    const filtered = q.length || b || t || full || unread;
    status.textContent = filtered ? 'Showing ' + shown + ' of ' + items.length + ' works.' : 'Showing all ' + items.length + ' works.';
  }
  let timer;
  form.addEventListener('input', (e) => {
    clearTimeout(timer);
    timer = setTimeout(apply, e.target.id === 'q' ? 200 : 0);
  });
  form.addEventListener('submit', (e) => e.preventDefault());
  form.addEventListener('reset', () => setTimeout(apply, 0));
  document.getElementById('clear-link').addEventListener('click', (e) => { e.preventDefault(); form.reset(); form.q.focus(); });
  apply();
})();
</script>
</body>
</html>
`;

// ---- CSV
const csvCell = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const csv = [['rank', 'tier', 'branch', 'authors', 'title', 'year', 'relevance', 'free_online', 'other_links', 'verification', 'note'].join(',')]
  .concat(works.map((w) => [w.rank, w.tier, w.branch, (w.authors || []).join('; '), w.title, w.year, w.relevance,
    (w.links || []).filter((l) => l.kind === 'full' || l.kind === 'copy').map((l) => l.url).join(' '),
    (w.links || []).filter((l) => l.kind !== 'full' && l.kind !== 'copy').map((l) => l.url).join(' '),
    w.status || 'unverified', w.note || ''].map(csvCell).join(','))).join('\n') + '\n';

// ---- BibTeX
const bibEsc = (s) => String(s ?? '').replace(/([&%$#_{}])/g, '\\$1');
const bib = works.map((w) => {
  const first = (w.authors?.[0] || 'anon').split(/\s+/).at(-1).normalize('NFD').replace(/[^A-Za-z]/g, '').toLowerCase();
  const yr = (String(w.year).match(/\d{3,4}/) || ['nd'])[0];
  const url = (w.links || [])[0]?.url;
  const fields = [
    ['author', (w.authors || []).map(bibEsc).join(' and ')],
    ['title', '{' + bibEsc(w.title) + '}'],
    ['year', bibEsc(w.year)],
    url && ['url', url],
    ['note', bibEsc(`${w.relevance}. Tier ${w.tier}, rank ${w.rank}, branch: ${w.branch}`)],
  ].filter(Boolean);
  return `@misc{${first}${yr}_${w.rank},\n${fields.map(([k, v]) => `  ${k} = {${v}}`).join(',\n')}\n}`;
}).join('\n\n') + '\n';

const outputs = { 'index.html': html, 'library.csv': csv, 'library.bib': bib };
if (process.argv.includes('--check')) {
  const stale = Object.entries(outputs).filter(([f, s]) => !existsSync(join(here, f)) || readFileSync(join(here, f), 'utf8') !== s).map(([f]) => f);
  if (stale.length) { console.error('stale: ' + stale.join(', ') + ' — run node judgment/sources/build.mjs'); process.exit(1); }
  console.log('judgment/sources: up to date');
} else {
  for (const [f, s] of Object.entries(outputs)) writeFileSync(join(here, f), s);
  console.log(`judgment/sources: wrote ${Object.keys(outputs).join(', ')} (${counts.total} works, ${counts.full} with free full text)`);
}
