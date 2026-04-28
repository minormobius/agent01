import React, { useState, useMemo } from 'https://esm.sh/react@18';
import { createRoot } from 'https://esm.sh/react-dom@18/client';
import htm from 'https://esm.sh/htm@3';
import { SEED, PITCHES } from './pitches.js';
import { STAGES, RUBRIC, SCORES, isAdvanced, totalFor } from './process.js';

const html = htm.bind(React.createElement);
const ALL = '__ALL__';

function ProcessFlow() {
  const lastDone = STAGES.map(s => s.status).lastIndexOf('done');
  return html`
    <div class="flow">
      <div class="flow-rail">
        ${STAGES.map((s, i) => html`
          <div key=${s.id} class=${'flow-step ' + (i === lastDone ? 'current' : s.status)}>
            <div class="flow-num">Step ${String(i + 1).padStart(2, '0')}</div>
            <div class="flow-label">${s.label}</div>
            <div class="flow-detail">${s.detail || '—'}</div>
            ${s.status === 'done' ? html`<span class="flow-tick">✓</span>` : null}
          </div>
        `)}
      </div>
    </div>
  `;
}

function Rubric() {
  return html`
    <div class="rubric">
      <h4>Round 1 rubric · five axes, scored 1–5</h4>
      <div class="rubric-grid">
        ${RUBRIC.map(r => html`
          <div key=${r.key} class="rubric-item">
            <b>${r.label}.</b> ${r.description}
          </div>
        `)}
      </div>
      <div class="rubric-rule">Cut rule: top 4 by total /25 advance to outline. Ties broken by Engine, then Ending.</div>
    </div>
  `;
}

function PitchCard({ p }) {
  const s = SCORES[p.id];
  const advanced = isAdvanced(p.id);
  const total = totalFor(p.id);
  return html`
    <article class=${'pitch ' + (advanced ? 'advanced' : 'cut')}>
      <div class="pitch-genre">
        ${p.genre}
        <span class=${'pitch-status ' + (advanced ? 'advanced' : 'cut')}>
          ${advanced ? 'Advanced' : 'Cut'}
        </span>
      </div>
      <h3 class="pitch-title">${p.title}</h3>
      <div class="scores">
        ${RUBRIC.map(r => html`
          <span key=${r.key} class="score-chip" title=${r.description}>
            ${r.label}<b>${s[r.key]}</b>
          </span>
        `)}
        <span class="score-total">${total} / 25</span>
      </div>
      <p class="pitch-body">${p.pitch}</p>
      <div class="pitch-why">
        <strong>Why it would be good</strong>
        ${p.why}
      </div>
    </article>
  `;
}

function App() {
  const [genre, setGenre] = useState(ALL);
  const [advancedOnly, setAdvancedOnly] = useState(false);

  const genres = useMemo(() => {
    const seen = new Set();
    const ordered = [];
    for (const p of PITCHES) {
      if (!seen.has(p.genre)) { seen.add(p.genre); ordered.push(p.genre); }
    }
    return [ALL, ...ordered];
  }, []);

  const filtered = useMemo(() => {
    return PITCHES.filter(p =>
      (genre === ALL || p.genre === genre) &&
      (!advancedOnly || isAdvanced(p.id))
    );
  }, [genre, advancedOnly]);

  const advancedCount = PITCHES.filter(p => isAdvanced(p.id)).length;

  return html`
    <div>
      <header class="masthead">
        <div class="masthead-date">Workshop · April 27, 2026</div>
        <h1><a href="/">Read</a></h1>
        <div class="masthead-tagline">Books, poetry, and the occasional workshop note</div>
        <hr class="masthead-rule" />
      </header>

      <section class="lede">
        <div class="kicker">Workshop note · Post 01</div>
        <h2 class="headline-lead">Twelve Stories from One Post</h2>
        <div class="byline">A cyborg brainstorm · ${SEED.length} characters in, twelve out, four through Round 1</div>
      </section>

      <${ProcessFlow} />

      <section class="essay">
        <p class="lead">A friend asked, on Bluesky, what a string-to-story machine would even look like — and whether you could tell if its outputs were any good. We took the post itself as the seed string and ran the question forward, in stages.</p>

        <blockquote class="seed">
          ${SEED}
          <span class="seed-meta">The seed · ${SEED.length} characters</span>
        </blockquote>

        <p>The question is nested. To build the machine, you need a definition of a short story. To know whether the machine works, you need a scoring function. The scoring function is the part that has stayed unsolved for roughly as long as people have written stories down.</p>

        <p>So we are building one — small, defensible, public. Round 1 is ideation: twelve pitches across twelve genres. The first cut is below: a five-axis rubric, applied to all twelve, top four advance.</p>
      </section>

      <div class="section-header">Round 1 cut · the rubric</div>

      <${Rubric} />

      <div class="section-header">The Pitches · ${filtered.length} of ${PITCHES.length} · ${advancedCount} advancing</div>

      <div class="filter-bar">
        <span class="filter-label">Genre</span>
        ${genres.map(g => html`
          <button
            key=${g}
            class=${'chip' + (g === genre ? ' active' : '')}
            onClick=${() => setGenre(g)}
          >${g === ALL ? 'All' : g}</button>
        `)}
        <label class="toggle-row">
          <input
            type="checkbox"
            checked=${advancedOnly}
            onChange=${e => setAdvancedOnly(e.target.checked)}
          />
          Advanced only
        </label>
      </div>

      <div class="pitch-grid">
        ${filtered.length === 0
          ? html`<div class="empty">No pitches match the current filter.</div>`
          : filtered.map(p => html`<${PitchCard} key=${p.id} p=${p} />`)}
      </div>

      <section class="coda">
        <p>Twelve outputs, one input, one cut. The four that advanced (<em>The Kolmogorov Prize</em>, <em>The Compliance Window</em>, <em>Eight Hundred and Fourteen Characters</em>, <em>The Tally-Stick at Westminster</em>) didn't win on premise — premises here are mostly interchangeable — they won on <em>engine</em>: each one has a small repeated motion the prose can run on for four thousand words without exhausting itself.</p>
        <p>The cut is also a falsifiable claim. The eight that didn't advance are not bad pitches; they are pitches whose engines, on this rubric, run shorter. We invite the disagreement — if your scoring function picks <em>Lossy</em> or <em>The Post That Read Me Back</em>, that is data about your scoring function, which is precisely the thing the seed asked us to articulate.</p>
        <p>Next stage: outline the four. Spine, stakes, ending image. Same scrutiny. Same publication of the work.</p>
      </section>

      <footer class="footer">
        Read · <a href="/">read.mino.mobi</a> · A workshop of <a href="https://minomobi.com">minomobi</a>
      </footer>
    </div>
  `;
}

createRoot(document.getElementById('app')).render(html`<${App} />`);
