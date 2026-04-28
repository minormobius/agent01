import React, { useState, useMemo } from 'https://esm.sh/react@18';
import { createRoot } from 'https://esm.sh/react-dom@18/client';
import htm from 'https://esm.sh/htm@3';
import { SEED, PITCHES } from './pitches.js';
import { STAGES, RUBRIC, SCORES, isAdvanced, totalFor } from './process.js';
import { CASTS } from './characters.js';

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

function Character({ c }) {
  return html`
    <div class="character">
      <h5>${c.name}</h5>
      <div class="character-id">${c.identity}</div>
      <dl class="trait-list">
        <dt>Possession</dt><dd>${c.possession}</dd>
        <dt>Habit</dt><dd>${c.habit}</dd>
        <dt>Contradiction</dt><dd>${c.contradiction}</dd>
      </dl>
      <div class="want-row">
        <div class="label">Wants</div><div>${c.surfaceWant}</div>
        <div class="label">Actually</div><div>${c.hiddenWant}</div>
      </div>
    </div>
  `;
}

function Dossier({ pitch, cast }) {
  return html`
    <article class="dossier">
      <div class="dossier-head">
        <span class="dossier-genre">${pitch.genre}</span>
        <h4 class="dossier-title">${pitch.title}</h4>
      </div>
      ${cast.note ? html`<div class="dossier-note">${cast.note}</div>` : null}
      <div class="cast-grid">
        ${cast.mains.map(c => html`<${Character} key=${c.name} c=${c} />`)}
      </div>
      <div class="relation">
        <span class="relation-label">The relationship</span>
        ${cast.relationship}
      </div>
      ${cast.supporting && cast.supporting.length ? html`
        <div class="supporting">
          <span class="supporting-label">Supporting</span>
          <ul>
            ${cast.supporting.map(s => html`<li key=${s.name}><b>${s.name}.</b> ${s.sketch}</li>`)}
          </ul>
        </div>
      ` : null}
    </article>
  `;
}

function CastSection() {
  const finalists = PITCHES.filter(p => CASTS[p.id]);
  return html`
    <div class="cast-stack">
      ${finalists.map(p => html`<${Dossier} key=${p.id} pitch=${p} cast=${CASTS[p.id]} />`)}
    </div>
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
        <div class="byline">A cyborg brainstorm · ${SEED.length} characters in, twelve pitches out, four cast</div>
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

      <div class="section-header">Round 2 prep · the cast</div>

      <section class="essay" style="text-align:center;max-width:680px;">
        <p>Before we outline, we cast. The principle is small: if you can put two characters and one relationship on the page in a couple thousand words, that is enough story. Stretch the cast only when the engine actually needs it. Below, v1 dossiers for the four finalists — possessions, habits, contradictions, what each character wants on the surface and what they want under it. We will revisit these once storyboards are logged.</p>
      </section>

      <${CastSection} />

      <section class="coda">
        <p>Twelve outputs, one input, one cut, four casts. The four that advanced won on <em>engine</em>: a small repeated motion the prose can run on for four thousand words. The casts now give that engine a body — Iris and her decompressed brother, Derek and Janet across four days, Ines and the brother she promised not to write, Pyatt and Whibley with one stove between them.</p>
        <p>None of these are finished people. They are first-pass dossiers that can survive contact with an outline. The contradictions are the load-bearing parts: Iris encrypts what she publishes, Janet keeps a private file of the protests she removed, Tomás built things to last and refused to be photographed, Whibley wants to modernise without being the man who lit the match.</p>
        <p>Next stage: outline the four. Spine, stakes, ending image, where each character is at sentence one and where they are at sentence last. Then we revisit the casts.</p>
      </section>

      <footer class="footer">
        Read · <a href="/">read.mino.mobi</a> · A workshop of <a href="https://minomobi.com">minomobi</a>
      </footer>
    </div>
  `;
}

createRoot(document.getElementById('app')).render(html`<${App} />`);
