import React, { useState, useMemo } from 'https://esm.sh/react@18';
import { createRoot } from 'https://esm.sh/react-dom@18/client';
import htm from 'https://esm.sh/htm@3';
import { SEED, PITCHES } from './pitches.js';

const html = htm.bind(React.createElement);
const ALL = '__ALL__';

function App() {
  const [genre, setGenre] = useState(ALL);

  const genres = useMemo(() => {
    const seen = new Set();
    const ordered = [];
    for (const p of PITCHES) {
      if (!seen.has(p.genre)) { seen.add(p.genre); ordered.push(p.genre); }
    }
    return [ALL, ...ordered];
  }, []);

  const filtered = useMemo(
    () => genre === ALL ? PITCHES : PITCHES.filter(p => p.genre === genre),
    [genre]
  );

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
        <div class="byline">A cyborg brainstorm · ${SEED.length} characters in, twelve out</div>
      </section>

      <section class="essay">
        <p class="lead">A friend asked, on Bluesky, what a string-to-story machine would even look like — and whether you could tell if its outputs were any good. We took the post itself as the seed string and ran the question forward.</p>

        <blockquote class="seed">
          ${SEED}
          <span class="seed-meta">The seed · ${SEED.length} characters</span>
        </blockquote>

        <p>The question is nested. To build the machine, you need a definition of a short story. To know whether the machine works, you need a scoring function. The scoring function is the part that has stayed unsolved for roughly as long as people have written stories down.</p>

        <p>One way to make progress on a definition is to point at examples. The pitches below are intentionally diverse — twelve genres, twelve registers — but each one has a shape we recognize as <em>a story</em>: a person, a place, a transgression, an ending image. Whether they are <em>good</em> is the harder question; we have left a one-line "why" with each, less as defense than as falsifiable claim.</p>
      </section>

      <div class="section-header">The Pitches · ${filtered.length} of ${PITCHES.length}</div>

      <div class="filter-bar">
        <span class="filter-label">Filter</span>
        ${genres.map(g => html`
          <button
            key=${g}
            class=${'chip' + (g === genre ? ' active' : '')}
            onClick=${() => setGenre(g)}
          >${g === ALL ? 'All' : g}</button>
        `)}
      </div>

      <div class="pitch-grid">
        ${filtered.length === 0
          ? html`<div class="empty">No pitches in this genre.</div>`
          : filtered.map(p => html`
              <article key=${p.id} class="pitch">
                <div class="pitch-genre">${p.genre}</div>
                <h3 class="pitch-title">${p.title}</h3>
                <p class="pitch-body">${p.pitch}</p>
                <div class="pitch-why">
                  <strong>Why it would be good</strong>
                  ${p.why}
                </div>
              </article>
            `)}
      </div>

      <section class="coda">
        <p>Twelve outputs, one input — same machine, twelve different score directions. A few things the seed string never said but kept implying:</p>
        <p><strong>1.</strong> A short story is not its premise; it is its <em>engine</em> — the small repeated motion that makes a reader keep going past sentence fifty. Several of these pitches share premises (an archive, a list, a compression rule) but their engines are unmistakably distinct.</p>
        <p><strong>2.</strong> A scoring function that always agrees is a constant, not a function. The twelve "why" lines are twelve different scoring functions, mutually contradictory in places, all defensible.</p>
        <p><strong>3.</strong> Compression is half the answer. <em>Selection</em> is the other half — what the machine refuses to expand is at least as story-shaped as what it does.</p>
      </section>

      <footer class="footer">
        Read · <a href="/">read.mino.mobi</a> · A workshop of <a href="https://minomobi.com">minomobi</a>
      </footer>
    </div>
  `;
}

createRoot(document.getElementById('app')).render(html`<${App} />`);
