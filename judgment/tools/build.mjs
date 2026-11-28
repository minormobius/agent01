#!/usr/bin/env node
// Bakes judgment/tools/index.html from registry.json.
//   node judgment/tools/build.mjs           # write
//   node judgment/tools/build.mjs --check   # exit 1 if index.html is stale
// registry.json is hand-edited (seeded by a survey of the repo, 2026-11-28). Never edit index.html.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const reg = JSON.parse(readFileSync(join(here, 'registry.json'), 'utf8'));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lib = JSON.parse(readFileSync(join(here, '..', 'sources', 'library.json'), 'utf8'));
const byId = Object.fromEntries(lib.works.map((w) => [w.id, w]));

const FN = reg.functions; // [{id, name, blurb}]
const STATUS = { live: 'Live', 'built-disabled': 'Built, switched off', proposed: 'Designed, not built', retired: 'Retired' };
const SYSTEM = { loop: 'the loop', 'lab-factory': 'lab factory', miniphim: 'miniphim', 'repo-ops': 'repo operations', harness: 'harness & evaluation', other: 'other' };

const built = reg.built, lit = reg.unexplored;
const count = (arr, f, pred = () => true) => arr.filter((t) => t.function === f && pred(t)).length;

const matrix = FN.map((f) => `<tr><th scope="row"><a href="#f-${f.id}">${esc(f.name)}</a></th>` +
  `<td>${count(built, f.id, (t) => t.status === 'live') || '<span class="zero">0</span>'}</td>` +
  `<td>${count(built, f.id, (t) => t.status !== 'live') || '<span class="zero">0</span>'}</td>` +
  `<td>${count(lit, f.id) || '<span class="zero">0</span>'}</td></tr>`).join('\n');

function builtCard(t) {
  return `<li class="tool" id="t-${esc(t.id)}" data-fn="${esc(t.function)}" data-sys="${esc(t.system)}" data-status="${esc(t.status)}">
<h4>${esc(t.name)}</h4>
<p class="meta"><span class="tag">${esc(SYSTEM[t.system] || t.system)}</span> <span class="tag st-${esc(t.status)}">${esc(STATUS[t.status] || t.status)}</span>${t.secondary ? ` <span class="tag">also: ${esc(FN.find((f) => f.id === t.secondary)?.name || t.secondary)}</span>` : ''} <span class="tag">portable: ${esc(t.portable)}</span></p>
<p>${esc(t.what)}</p>
${t.evidence && !/^none recorded/i.test(t.evidence) ? `<p class="ev"><b>Evidence.</b> ${esc(t.evidence)}</p>` : ''}
${t.lesson ? `<p class="ev"><b>Lesson.</b> ${esc(t.lesson)}</p>` : ''}
<p class="where">${(t.where || []).map((w) => `<code>${esc(w)}</code>`).join(' ')}</p>
</li>`;
}
function litCard(t) {
  const src = (t.sources || []).map((id) => byId[id] ? `<a href="/sources/#${id}">${esc(byId[id].authors[0].split(' ').pop())}${byId[id].authors.length > 1 ? ' et al.' : ''}, <cite>${esc(byId[id].title.split(':')[0])}</cite></a>` : esc(id)).join('; ');
  return `<li class="tool lit" id="u-${esc(t.id)}" data-fn="${esc(t.function)}">
<h4>${esc(t.name)}</h4>
<p class="meta"><span class="tag st-unexplored">${t.partial ? 'Partly explored' : 'Not yet tried'}</span>${t.tests ? ` <span class="tag">tests: ${esc(t.tests)}</span>` : ''}</p>
<p>${esc(t.what)}</p>
<p class="ev"><b>Here.</b> ${esc(t.here)}</p>
<p class="where">From ${src}</p>
</li>`;
}

const sections = FN.map((f) => {
  const b = built.filter((t) => t.function === f.id), u = lit.filter((t) => t.function === f.id);
  return `<section class="fn" id="f-${f.id}" aria-labelledby="h-${f.id}">
<h2 id="h-${f.id}">${esc(f.name)}</h2>
<p class="muted">${esc(f.blurb)}</p>
${f.note ? `<p class="callout">${esc(f.note)}</p>` : ''}
<h3>Built here <span class="count">${b.length}</span></h3>
${b.length ? `<ul class="tools">${b.map(builtCard).join('\n')}</ul>` : '<p class="none">Nothing yet.</p>'}
<h3>From the literature, not yet tried here <span class="count">${u.length}</span></h3>
${u.length ? `<ul class="tools">${u.map(litCard).join('\n')}</ul>` : '<p class="none">None proposed.</p>'}
</section>`;
}).join('\n');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tools — judgment</title>
<meta name="description" content="A registry of supervisory tools: ${built.length} mechanisms this repo has built for keeping judgment over agent work, and ${lit.length} the literature proposes that have not been tried yet, sorted by what each one is for.">
<link rel="stylesheet" href="/judge.css">
<style>
.zero { color: var(--warn); font-weight: 700; }
ul.tools { list-style: none; padding: 0; margin: 0; }
li.tool { border-top: 1px solid var(--rule); padding: 0.9rem 0; }
li.tool h4 { margin: 0 0 0.3rem; font-size: 1.1rem; }
li.tool p { margin: 0 0 0.4rem; }
.meta { font-family: var(--sans); }
.tag { display: inline-block; font-size: 0.82rem; background: var(--tag-bg); padding: 0.1rem 0.45rem; border-radius: 3px; margin: 0 0.2rem 0.2rem 0; }
.st-live { color: var(--full); background: var(--full-bg); }
.st-built-disabled, .st-proposed, .st-retired { color: var(--warn); background: var(--warn-bg); }
.st-unexplored { color: var(--pub); background: var(--pub-bg); }
.ev { font-size: 1rem; }
.where { font-size: 0.9rem; color: var(--muted); }
.where code { font-family: var(--mono); font-size: 0.8rem; word-break: break-all; }
.count { font-family: var(--sans); font-size: 0.9rem; font-weight: 400; color: var(--muted); }
.none { color: var(--muted); font-style: italic; }
section.fn { margin-top: 3rem; }
section.fn > h3 { font-size: 1.05rem; font-family: var(--sans); margin-top: 1.5rem; }
.draft { font-family: var(--sans); font-size: 0.95rem; background: var(--warn-bg); color: var(--warn); padding: 0.5rem 0.75rem; border-radius: 4px; display: inline-block; margin: 0 0 1rem; }
.arch ol > li { margin-bottom: 0.6rem; }
</style>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="site-header">
  <a class="home" href="/">judgment</a>
  <nav aria-label="Site">
    <ul>
      <li><a href="/">About</a></li>
      <li><a href="/sources/">Sources</a></li>
      <li><a href="/thesis/">Thesis</a></li>
      <li><a href="/testbed/">Testbed</a></li>
      <li><a href="/field/">Field</a></li>
      <li><a href="/tools/" aria-current="page">Tools</a></li>
    </ul>
  </nav>
</header>
<main id="main">
<h1>Tools: a registry</h1>
<p class="draft">Surveyed 28 November 2026 from the whole repository and the reading list. Hand-maintained from here.</p>
${reg.intro}
<div class="table-wrap">
<table>
  <caption>Tools by what they are for</caption>
  <thead><tr><th scope="col">Function</th><th scope="col">Built and live</th><th scope="col">Built but off, or only designed</th><th scope="col">Proposed by the literature, untried</th></tr></thead>
  <tbody>
${matrix}
  </tbody>
</table>
</div>
${reg.reading}
<section class="arch" id="architecture" aria-labelledby="h-arch">
<h2 id="h-arch">Assembling an architecture</h2>
${reg.architecture}
</section>
${sections}
</main>
<footer class="site-footer">
  <p>The data is <a href="registry.json">registry.json</a>. Paths are in the agent01 repository; miniphim paths are on the branch named in each entry.</p>
  <p>judge.mino.mobi is part of <a href="https://mino.mobi">mino.mobi</a>.</p>
</footer>
</body>
</html>
`;
const out = join(here, 'index.html');
if (process.argv.includes('--check')) {
  if (!existsSync(out) || readFileSync(out, 'utf8') !== html) { console.error('judgment/tools: stale — run node judgment/tools/build.mjs'); process.exit(1); }
  console.log('judgment/tools: up to date');
} else { writeFileSync(out, html); console.log(`judgment/tools: wrote index.html (${built.length} built, ${lit.length} from the literature)`); }
