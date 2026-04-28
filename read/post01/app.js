import React, { useState, useMemo } from 'https://esm.sh/react@18';
import { createRoot } from 'https://esm.sh/react-dom@18/client';
import htm from 'https://esm.sh/htm@3';
import { SEED, PITCHES } from './pitches.js';
import { STAGES, RUBRIC, SCORES, isAdvanced, totalFor, RUBRIC_R2, SCORES_R2, isDrafting, totalR2 } from './process.js';
import { CASTS } from './characters.js';
import { OUTLINES } from './outlines.js';

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

function Rubric({ title, items, rule }) {
  return html`
    <div class="rubric">
      <h4>${title}</h4>
      <div class="rubric-grid">
        ${items.map(r => html`
          <div key=${r.key} class="rubric-item">
            <b>${r.label}.</b> ${r.description}
          </div>
        `)}
      </div>
      <div class="rubric-rule">${rule}</div>
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

function Beat({ b }) {
  return html`
    <div class="beat">
      <div class="beat-num">${b.num}</div>
      <div class="beat-body">
        <div class="beat-head">
          <div class="beat-title">${b.title}</div>
          <span class="beat-words">${b.words}w</span>
        </div>
        <div class="beat-what">${b.what}</div>
        <div class="beat-shift">${b.shift}</div>
      </div>
    </div>
  `;
}

function OutlineCard({ pitch, outline }) {
  const totalBeatWords = outline.beats.reduce((acc, b) => acc + b.words, 0);
  const r2 = SCORES_R2[pitch.id];
  const drafting = isDrafting(pitch.id);
  const r2total = totalR2(pitch.id);
  return html`
    <article class=${'outline ' + (drafting ? 'advanced' : 'cut')}>
      <div class="outline-head">
        <span class="outline-genre">${pitch.genre}</span>
        <h4 class="outline-title">${pitch.title}</h4>
        <span class=${'pitch-status ' + (drafting ? 'advanced' : 'cut')}>
          ${drafting ? 'Drafting' : 'Held'}
        </span>
        <span class="outline-target">~${outline.wordTarget}w</span>
      </div>
      ${r2 ? html`
        <div class="scores">
          ${RUBRIC_R2.map(r => html`
            <span key=${r.key} class="score-chip" title=${r.description}>
              ${r.label}<b>${r2[r.key]}</b>
            </span>
          `)}
          <span class="score-total">${r2total} / 25</span>
        </div>
      ` : null}
      <div class="outline-pov">${outline.pov}</div>
      <div class="beats">
        ${outline.beats.map(b => html`<${Beat} key=${b.num} b=${b} />`)}
      </div>
      <div class="beat-budget">Beat budget: ${totalBeatWords.toLocaleString()}w</div>
      <dl class="outline-meta">
        <dt>Stakes</dt><dd>${outline.stakes}</dd>
        <dt>Ending</dt><dd>${outline.ending}</dd>
        <dt>Risk</dt><dd class="risk">${outline.risk}</dd>
      </dl>
    </article>
  `;
}

function OutlineSection() {
  const finalists = PITCHES.filter(p => OUTLINES[p.id]);
  return html`
    <div class="outline-stack">
      ${finalists.map(p => html`<${OutlineCard} key=${p.id} pitch=${p} outline=${OUTLINES[p.id]} />`)}
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
        <div class="byline">A cyborg brainstorm · ${SEED.length} characters in · twelve pitches → four outlines → two drafts</div>
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

      <${Rubric}
        title="Round 1 rubric · five axes, scored 1–5"
        items=${RUBRIC}
        rule="Cut rule: top 4 by total /25 advance to outline. Ties broken by Engine, then Ending."
      />

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

      <section class="essay essay-narrow">
        <p>Before we outline, we cast. The principle is small: if you can put two characters and one relationship on the page in a couple thousand words, that is enough story. Stretch the cast only when the engine actually needs it. Below, v1 dossiers for the four finalists — possessions, habits, contradictions, what each character wants on the surface and what they want under it. We will revisit these once storyboards are logged.</p>
      </section>

      <${CastSection} />

      <div class="section-header">Round 2 cut · the spark rubric</div>

      <section class="essay essay-narrow">
        <p>Round 1 asked whether each pitch <em>could</em> be a story. Round 2 asks whether <em>this particular plan</em> has the spark to survive 2,500 words of prose. The cut here is sharper — half of what survived Round 1 stops here, on a fresh rubric tuned for the artifacts we now have in hand (outline + cast).</p>
      </section>

      <${Rubric}
        title="Round 2 rubric · five axes, scored 1–5"
        items=${RUBRIC_R2}
        rule="Cut rule: top 2 by total /25 go to draft. Tiebreak: Spark, then Character force, then Engine sustain."
      />

      <div class="section-header">The Outlines · 4 finalists · 2 advancing to draft</div>

      <${OutlineSection} />

      <section class="coda">
        <p>Two go forward: <em>The Compliance Window</em> (24/25) and <em>The Kolmogorov Prize</em> (22/25, tiebreak on Spark). Two are held: <em>The Tally-Stick at Westminster</em> (22/25) — same total, weaker spark — and <em>Eight Hundred and Fourteen Characters</em> (19/25), where the metafictional engine could not promise to keep finding new things at beat 5 and 6.</p>
        <p>The cut hurts a little, which is the point. Tally-Stick has the most disciplined engine in the lineup; its sustain score is a 5. But "the boy was named Thomas" is one move, and the load-bearing scene wants more voltage than the historical period can ethically supply. Eight Hundred has a rare risk note ("cleverness eats tenderness") that names exactly the failure mode metafiction has been falling into for forty years; we'd rather hold it for a careful drafting pass later than rush it now.</p>
        <p>Compliance and Kolmogorov earned their places by being unlike each other: a procedural deadpan over four days, and a six-hour computational vigil. The Spark scores were both 5 — the kitchen-doorway "Derek, your father called", and the codepoint that decompresses to the rest of Iris's life. Those are the scenes the drafts are written to deserve.</p>
        <p>Next stage: draft. One story in full, then the second. Round 3 rubric will be sentence-level — we are no longer scoring plans, we are scoring prose.</p>
      </section>

      <footer class="footer">
        Read · <a href="/">read.mino.mobi</a> · A workshop of <a href="https://minomobi.com">minomobi</a>
      </footer>
    </div>
  `;
}

createRoot(document.getElementById('app')).render(html`<${App} />`);
