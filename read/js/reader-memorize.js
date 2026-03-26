/* reader-memorize.js — Disappearing text memorization engine
 *
 * Evidence-based approach combining:
 * - Fading cues (Glisky, Schacter & Tulving 1986; Bjork 1994 "desirable difficulty")
 * - Generation effect (Slamecka & Graf 1978)
 * - Active recall / retrieval practice (Roediger & Karpicke 2006)
 * - First-letter cueing (Mäntylä 1986)
 * - Progressive accumulation from serial learning research
 *
 * Fade rounds:
 *   0 — Full text
 *   1 — Function words removed (~25%)
 *   2 — Common words removed (~50%)
 *   3 — Most words removed, only distinctive words remain (~75%)
 *   4 — First letters only
 *   5 — Blank (recite from memory)
 */

const MemorizeReader = (() => {
  // ─── Function / common word sets for fade ordering ───
  const FUNCTION_WORDS = new Set([
    'the','a','an','and','or','but','in','on','at','to','for','of','with',
    'by','from','is','are','was','were','be','been','being','have','has',
    'had','do','does','did','will','would','could','should','shall','may',
    'might','can','it','its','this','that','these','those','he','she',
    'they','we','you','i','me','him','her','us','them','my','your','his',
    'our','their','who','which','what','where','when','how','not','no',
    'nor','so','if','as','than','then','up','out','into','about','over',
    'just','also','very','all','each','every','any','some','such','own',
    'too','more','most','much','many','here','there','now','still','yet',
    'even','only','well','back','just','like','upon','am'
  ]);

  const COMMON_WORDS = new Set([
    'said','say','says','go','goes','went','gone','come','came','take',
    'took','taken','make','made','get','got','give','gave','know','knew',
    'think','thought','see','saw','seen','look','looked','find','found',
    'tell','told','want','wanted','seem','seemed','leave','left','call',
    'called','keep','kept','let','begin','began','show','showed','hear',
    'heard','play','played','run','ran','move','moved','live','lived',
    'long','great','little','old','new','good','same','other','last',
    'first','next','right','hand','turn','turned','put','set','around',
    'through','before','after','while','since','between','under','without',
    'against','again','never','always','nothing','something','everything',
    'another','because','until','though','across','along','away','down',
    'off','once','soon','enough','rather','quite','almost','already',
    'often','ever','far','near','however','perhaps','whether','became',
    'both','few','part','himself','herself','itself','themselves','one',
    'two','three','four','five','been','being','done','way'
  ]);

  let container = null;
  let stanzas = [];      // array of { lines: string[][], raw: string }
  let stanzaIndex = 0;
  let fadeRound = 0;
  let checkMode = false;
  let mastered = {};     // stanzaIndex -> true
  let onProgress = null;

  const MAX_ROUND = 5;

  // ─── Parse chapter text into stanzas ───
  function parseStanzas(chapter) {
    const text = chapter.text || '';
    const lines = text.split('\n');
    const result = [];
    let current = [];

    for (const line of lines) {
      if (line.trim() === '') {
        if (current.length > 0) {
          result.push(current);
          current = [];
        }
      } else {
        current.push(line.trim());
      }
    }
    if (current.length > 0) result.push(current);

    // If we only got one big block, try splitting into ~4-line chunks
    if (result.length === 1 && result[0].length > 8) {
      const allLines = result[0];
      const chunks = [];
      for (let i = 0; i < allLines.length; i += 4) {
        chunks.push(allLines.slice(i, i + 4));
      }
      return chunks.map(lines => ({
        lines: lines.map(l => l.split(/\s+/)),
        raw: lines.join('\n')
      }));
    }

    return result.map(lines => ({
      lines: lines.map(l => l.split(/\s+/)),
      raw: lines.join('\n')
    }));
  }

  // ─── Determine word visibility at a given fade round ───
  function wordVisibility(word, round) {
    if (round === 0) return 'visible';
    if (round >= 5) return 'blank';
    if (round === 4) return 'letter';

    const lower = word.toLowerCase().replace(/[^a-z']/g, '');
    if (round >= 1 && FUNCTION_WORDS.has(lower)) return 'hidden';
    if (round >= 2 && COMMON_WORDS.has(lower)) return 'hidden';
    if (round >= 3 && lower.length <= 4) return 'hidden';

    return 'visible';
  }

  // ─── Render a word span based on visibility ───
  function renderWord(word, vis, bionic) {
    const span = document.createElement('span');
    span.className = 'mem-word';

    if (vis === 'hidden') {
      span.classList.add('mem-hidden');
      // Preserve width with underscores
      span.textContent = '\u00A0'.repeat(Math.max(word.length, 1));
      span.setAttribute('data-word', word);
    } else if (vis === 'letter') {
      span.classList.add('mem-letter');
      span.textContent = word.charAt(0) + '\u2009'.repeat(Math.max(word.length - 1, 0));
      span.setAttribute('data-word', word);
    } else if (vis === 'blank') {
      span.classList.add('mem-blank');
      span.textContent = '\u00A0'.repeat(Math.max(word.length, 1));
      span.setAttribute('data-word', word);
    } else {
      // Visible — optionally bionic
      if (bionic) {
        const mid = Math.ceil(word.length * 0.5);
        const b = document.createElement('b');
        b.textContent = word.substring(0, mid);
        span.appendChild(b);
        span.appendChild(document.createTextNode(word.substring(mid)));
      } else {
        span.textContent = word;
      }
    }

    return span;
  }

  // ─── Render the current stanza at the current fade round ───
  function renderStanza() {
    if (!container) return;
    const s = Storage.getSettings();
    const bionic = s.bionic;
    const stanza = stanzas[stanzaIndex];
    if (!stanza) return;

    container.innerHTML = '';
    container.className = 'memorize-reader';

    // Stanza navigation + round indicator
    const nav = document.createElement('div');
    nav.className = 'mem-nav';

    const counter = document.createElement('span');
    counter.className = 'mem-counter';
    counter.textContent = `${stanzaIndex + 1} / ${stanzas.length}`;
    nav.appendChild(counter);

    const dots = document.createElement('div');
    dots.className = 'mem-dots';
    for (let i = 0; i <= MAX_ROUND; i++) {
      const dot = document.createElement('span');
      dot.className = 'mem-dot' + (i <= fadeRound ? ' active' : '') + (i === fadeRound ? ' current' : '');
      dots.appendChild(dot);
    }
    nav.appendChild(dots);

    if (mastered[stanzaIndex]) {
      const check = document.createElement('span');
      check.className = 'mem-mastered-badge';
      check.textContent = 'Mastered';
      nav.appendChild(check);
    }

    container.appendChild(nav);

    // Text block
    const block = document.createElement('div');
    block.className = 'mem-text-block';

    for (const lineWords of stanza.lines) {
      const lineEl = document.createElement('div');
      lineEl.className = 'mem-line';
      lineWords.forEach((word, wi) => {
        if (wi > 0) lineEl.appendChild(document.createTextNode(' '));
        const vis = wordVisibility(word, fadeRound);
        lineEl.appendChild(renderWord(word, vis, bionic));
      });
      block.appendChild(lineEl);
    }

    container.appendChild(block);

    // Check mode input
    if (checkMode) {
      renderCheckMode(block);
    }

    // Controls
    const controls = document.createElement('div');
    controls.className = 'mem-controls';

    if (!checkMode) {
      if (fadeRound > 0) {
        const resetBtn = makeBtn('Reset', 'mem-btn-secondary', () => {
          fadeRound = 0;
          checkMode = false;
          renderStanza();
        });
        controls.appendChild(resetBtn);
      }

      if (fadeRound < MAX_ROUND) {
        const fadeBtn = makeBtn('Fade', 'mem-btn-primary', () => {
          fadeRound++;
          renderStanza();
        });
        controls.appendChild(fadeBtn);
      }

      const checkBtn = makeBtn('Recall', 'mem-btn-accent', () => {
        checkMode = true;
        renderStanza();
      });
      controls.appendChild(checkBtn);
    }

    // Stanza navigation
    const stanzaNav = document.createElement('div');
    stanzaNav.className = 'mem-stanza-nav';

    if (stanzaIndex > 0) {
      stanzaNav.appendChild(makeBtn('\u2039 Prev', 'mem-btn-secondary', () => {
        saveStanzaMastery();
        stanzaIndex--;
        fadeRound = mastered[stanzaIndex] ? MAX_ROUND : 0;
        checkMode = false;
        renderStanza();
        fireProgress();
      }));
    }

    if (stanzaIndex < stanzas.length - 1) {
      stanzaNav.appendChild(makeBtn('Next \u203A', 'mem-btn-secondary', () => {
        saveStanzaMastery();
        stanzaIndex++;
        fadeRound = mastered[stanzaIndex] ? MAX_ROUND : 0;
        checkMode = false;
        renderStanza();
        fireProgress();
      }));
    }

    controls.appendChild(stanzaNav);
    container.appendChild(controls);
  }

  // ─── Check / recall mode ───
  function renderCheckMode(block) {
    // Hide the text block
    block.classList.add('mem-text-hidden');

    const stanza = stanzas[stanzaIndex];
    const checkArea = document.createElement('div');
    checkArea.className = 'mem-check-area';

    const textarea = document.createElement('textarea');
    textarea.className = 'mem-textarea';
    textarea.placeholder = 'Type the passage from memory...';
    textarea.rows = Math.max(stanza.lines.length + 2, 4);
    textarea.setAttribute('autocomplete', 'off');
    textarea.setAttribute('autocorrect', 'off');
    textarea.setAttribute('autocapitalize', 'off');
    textarea.setAttribute('spellcheck', 'false');
    checkArea.appendChild(textarea);

    const btnRow = document.createElement('div');
    btnRow.className = 'mem-check-btns';

    btnRow.appendChild(makeBtn('Check', 'mem-btn-accent', () => {
      showDiff(textarea.value, stanza, checkArea);
    }));

    btnRow.appendChild(makeBtn('Show Text', 'mem-btn-secondary', () => {
      checkMode = false;
      renderStanza();
    }));

    checkArea.appendChild(btnRow);
    container.appendChild(checkArea);

    // Focus textarea after render
    requestAnimationFrame(() => textarea.focus());
  }

  // ─── Show diff between user input and original ───
  function showDiff(input, stanza, checkArea) {
    const original = stanza.raw;
    const origWords = original.split(/\s+/).filter(Boolean);
    const inputWords = input.split(/\s+/).filter(Boolean);

    const diffEl = document.createElement('div');
    diffEl.className = 'mem-diff';

    let correct = 0;
    const total = origWords.length;

    origWords.forEach((ow, i) => {
      if (i > 0) diffEl.appendChild(document.createTextNode(' '));
      const iw = inputWords[i] || '';
      const span = document.createElement('span');

      // Normalize for comparison
      const normOrig = ow.toLowerCase().replace(/[^a-z0-9']/g, '');
      const normInput = iw.toLowerCase().replace(/[^a-z0-9']/g, '');

      if (normOrig === normInput) {
        span.className = 'mem-diff-correct';
        span.textContent = ow;
        correct++;
      } else if (iw) {
        span.className = 'mem-diff-wrong';
        span.textContent = ow;
        span.title = `You wrote: "${iw}"`;
      } else {
        span.className = 'mem-diff-missing';
        span.textContent = ow;
      }

      diffEl.appendChild(span);

      // Add line breaks where original has them
      if (ow.endsWith('\n') || (i < origWords.length - 1 && stanza.raw.indexOf('\n') !== -1)) {
        // Check if we're at a line boundary
      }
    });

    // Rebuild as lines for readability
    diffEl.innerHTML = '';
    const origLines = original.split('\n');
    let wordOffset = 0;

    for (const line of origLines) {
      const lineWords = line.split(/\s+/).filter(Boolean);
      const lineEl = document.createElement('div');
      lineEl.className = 'mem-diff-line';

      lineWords.forEach((ow, j) => {
        if (j > 0) lineEl.appendChild(document.createTextNode(' '));
        const iw = inputWords[wordOffset] || '';
        const span = document.createElement('span');
        const normOrig = ow.toLowerCase().replace(/[^a-z0-9']/g, '');
        const normInput = iw.toLowerCase().replace(/[^a-z0-9']/g, '');

        if (normOrig === normInput) {
          span.className = 'mem-diff-correct';
          span.textContent = ow;
        } else if (iw) {
          span.className = 'mem-diff-wrong';
          span.textContent = ow;
          span.title = `You wrote: "${iw}"`;
        } else {
          span.className = 'mem-diff-missing';
          span.textContent = ow;
        }
        lineEl.appendChild(span);
        wordOffset++;
      });

      diffEl.appendChild(lineEl);
    }

    // Score
    correct = 0;
    wordOffset = 0;
    for (const line of origLines) {
      for (const ow of line.split(/\s+/).filter(Boolean)) {
        const iw = inputWords[wordOffset] || '';
        if (ow.toLowerCase().replace(/[^a-z0-9']/g, '') === iw.toLowerCase().replace(/[^a-z0-9']/g, '')) {
          correct++;
        }
        wordOffset++;
      }
    }

    const pct = total > 0 ? Math.round((correct / total) * 100) : 0;

    const scoreEl = document.createElement('div');
    scoreEl.className = 'mem-score';
    scoreEl.innerHTML = `<strong>${pct}%</strong> correct (${correct}/${total} words)`;

    if (pct === 100) {
      mastered[stanzaIndex] = true;
      scoreEl.innerHTML += ' <span class="mem-mastered-badge">Mastered!</span>';
    }

    // Replace check area content with diff
    checkArea.innerHTML = '';
    checkArea.appendChild(scoreEl);
    checkArea.appendChild(diffEl);

    const btnRow = document.createElement('div');
    btnRow.className = 'mem-check-btns';

    btnRow.appendChild(makeBtn('Try Again', 'mem-btn-accent', () => {
      checkMode = true;
      renderStanza();
    }));

    btnRow.appendChild(makeBtn('Show Text', 'mem-btn-secondary', () => {
      checkMode = false;
      fadeRound = 0;
      renderStanza();
    }));

    if (stanzaIndex < stanzas.length - 1) {
      btnRow.appendChild(makeBtn('Next Stanza \u203A', 'mem-btn-primary', () => {
        stanzaIndex++;
        fadeRound = mastered[stanzaIndex] ? MAX_ROUND : 0;
        checkMode = false;
        renderStanza();
        fireProgress();
      }));
    }

    checkArea.appendChild(btnRow);
  }

  // ─── Helpers ───
  function makeBtn(label, cls, onClick) {
    const btn = document.createElement('button');
    btn.className = cls;
    btn.textContent = label;
    btn.addEventListener('click', onClick);
    return btn;
  }

  function saveStanzaMastery() {
    // Could persist to storage in the future
  }

  function fireProgress() {
    if (onProgress) {
      const masteredCount = Object.keys(mastered).length;
      onProgress(masteredCount / Math.max(stanzas.length, 1));
    }
  }

  // ─── Public API ───
  function render(chapter, el, opts = {}) {
    container = el;
    stanzas = parseStanzas(chapter);
    stanzaIndex = 0;
    fadeRound = 0;
    checkMode = false;
    mastered = {};
    onProgress = opts.onProgress || null;
    renderStanza();
  }

  function destroy() {
    container = null;
    stanzas = [];
    stanzaIndex = 0;
    fadeRound = 0;
    checkMode = false;
    mastered = {};
  }

  function nextRound() {
    if (fadeRound < MAX_ROUND) {
      fadeRound++;
      renderStanza();
    }
  }

  function prevRound() {
    if (fadeRound > 0) {
      fadeRound--;
      checkMode = false;
      renderStanza();
    }
  }

  function nextStanza() {
    if (stanzaIndex < stanzas.length - 1) {
      stanzaIndex++;
      fadeRound = mastered[stanzaIndex] ? MAX_ROUND : 0;
      checkMode = false;
      renderStanza();
      fireProgress();
    }
  }

  function prevStanza() {
    if (stanzaIndex > 0) {
      stanzaIndex--;
      fadeRound = mastered[stanzaIndex] ? MAX_ROUND : 0;
      checkMode = false;
      renderStanza();
      fireProgress();
    }
  }

  function toggleCheck() {
    checkMode = !checkMode;
    renderStanza();
  }

  function reset() {
    fadeRound = 0;
    checkMode = false;
    renderStanza();
  }

  return {
    render,
    destroy,
    nextRound,
    prevRound,
    nextStanza,
    prevStanza,
    toggleCheck,
    reset
  };
})();
