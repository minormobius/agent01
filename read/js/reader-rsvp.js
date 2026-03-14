/* reader-rsvp.js — Rapid Serial Visual Presentation engine */

const RSVPReader = (() => {
  let container = null;
  let words = [];      // raw tokens from Gutenberg.tokenize
  let chunks = [];     // grouped display chunks
  let chunkIndex = 0;
  let playing = false;
  let rafId = null;
  let lastFrameTime = 0;
  let currentDelay = 0;
  let onProgress = null;
  let onFinished = null;
  let settings = null;
  let measureCtx = null; // canvas 2d context for text measurement
  let maxTextWidth = 0;  // available px for chunk text

  // Color palette for inter-frame flashes
  const COLORS = [
    'hsla(220,60%,50%,0.08)', 'hsla(160,60%,50%,0.08)',
    'hsla(280,60%,50%,0.08)', 'hsla(30,60%,50%,0.08)',
    'hsla(340,60%,50%,0.08)', 'hsla(80,60%,50%,0.08)',
  ];
  let colorIndex = 0;

  // ORP: optimal recognition point index within a string
  function orpIndex(len) {
    if (len <= 1) return 0;
    if (len <= 5) return 1;
    if (len <= 9) return 2;
    if (len <= 13) return 3;
    if (len <= 17) return 4;
    if (len <= 21) return 5;
    return Math.floor(len * 0.25);
  }

  // Measure text width in pixels using Canvas (more reliable than DOM offsetWidth)
  function measureText(text) {
    if (!container) return 0;
    if (!measureCtx) {
      measureCtx = document.createElement('canvas').getContext('2d');
    }
    const word = container.querySelector('.rsvp-word');
    if (!word) return 0;
    const style = getComputedStyle(word);
    measureCtx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    return measureCtx.measureText(text).width;
  }

  // Build chunks from word tokens, grouping short words to meet minChars
  function buildChunks(tokens, minChars) {
    if (minChars <= 0) {
      return tokens.map(t => makeChunk([t]));
    }

    const result = [];
    let buf = [];
    let bufLen = 0;

    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      buf.push(t);
      bufLen += t.word.length;

      const metMin = bufLen >= minChars;
      const boundary = t.isSentenceEnd || t.isParagraph;

      if (metMin || boundary || i === tokens.length - 1) {
        result.push(makeChunk(buf));
        buf = [];
        bufLen = 0;
      }
    }
    return result;
  }

  function makeChunk(wordArray) {
    const text = wordArray.map(w => w.word).join(' ');
    return { text, words: [...wordArray], charLen: text.length };
  }

  // After building chunks, split any that overflow the available width
  function fitChunksToWidth(rawChunks) {
    if (maxTextWidth <= 0) return rawChunks;

    const fitted = [];
    for (let i = 0; i < rawChunks.length; i++) {
      let chunk = rawChunks[i];

      // Fast path: single word or fits
      if (chunk.words.length <= 1 || measureText(chunk.text) <= maxTextWidth) {
        fitted.push(chunk);
        continue;
      }

      // Trim words from the end until it fits
      let words = chunk.words;
      let overflow = [];
      while (words.length > 1) {
        const candidate = words.map(w => w.word).join(' ');
        if (measureText(candidate) <= maxTextWidth) break;
        overflow.unshift(words.pop());
      }

      fitted.push(makeChunk(words));

      // The overflow words get prepended to the next chunk
      if (overflow.length > 0) {
        if (i + 1 < rawChunks.length) {
          // Merge overflow into next chunk (which will be re-checked on next iteration)
          rawChunks[i + 1] = makeChunk([...overflow, ...rawChunks[i + 1].words]);
        } else {
          // Last chunk — just add overflow as a new chunk
          fitted.push(makeChunk(overflow));
        }
      }
    }
    return fitted;
  }

  function computeDelay(chunk) {
    const base = 60000 / settings.rsvp.wpm;
    let wordTime = base * chunk.words.length;
    const last = chunk.words[chunk.words.length - 1];
    let mult = 1;
    if (last.isSentenceEnd) mult = 1.6;
    else if (last.isClause) mult = 1.3;
    if (last.isParagraph) mult *= 2.0;
    if (chunk.charLen > 20) mult *= 1.2;
    return wordTime * mult;
  }

  function renderChunk(chunk) {
    if (!container) return;
    const text = chunk.text;
    const orp = orpIndex(text.length);

    const pre = text.substring(0, orp);
    const pivot = text[orp] || '';
    const post = text.substring(orp + 1);

    const display = container.querySelector('.rsvp-word');
    const preEl = display.querySelector('.rsvp-pre');
    const pivotEl = display.querySelector('.rsvp-pivot');
    const postEl = display.querySelector('.rsvp-post');

    if (settings.rsvp.bionic) {
      const mid = Math.ceil(text.length * 0.5);
      preEl.innerHTML = orp <= mid
        ? `<b>${esc(pre)}</b>`
        : `<b>${esc(pre.substring(0, mid))}</b>${esc(pre.substring(mid))}`;
      pivotEl.textContent = pivot;
      postEl.innerHTML = orp < mid
        ? `<b>${esc(post.substring(0, mid - orp - 1))}</b>${esc(post.substring(mid - orp - 1))}`
        : esc(post);
    } else {
      preEl.textContent = pre;
      pivotEl.textContent = pivot;
      postEl.textContent = post;
    }

    if (settings.rsvp.colorFrames) {
      display.style.backgroundColor = COLORS[colorIndex % COLORS.length];
      colorIndex++;
    } else {
      display.style.backgroundColor = '';
    }
  }

  function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function tick(timestamp) {
    if (!playing) return;
    if (timestamp - lastFrameTime < currentDelay) {
      rafId = requestAnimationFrame(tick);
      return;
    }
    lastFrameTime = timestamp;

    if (chunkIndex >= chunks.length) {
      playing = false;
      if (onFinished) onFinished();
      return;
    }

    const chunk = chunks[chunkIndex];
    renderChunk(chunk);
    currentDelay = computeDelay(chunk);
    chunkIndex++;

    if (onProgress) onProgress(chunkIndex, chunks.length);
    rafId = requestAnimationFrame(tick);
  }

  function buildUI(el) {
    container = el;
    el.innerHTML = '';
    el.className = 'rsvp-reader';

    const frame = document.createElement('div');
    frame.className = 'rsvp-frame';

    const marker = document.createElement('div');
    marker.className = 'rsvp-marker';
    frame.appendChild(marker);

    const display = document.createElement('div');
    display.className = 'rsvp-word';

    const preEl = document.createElement('span');
    preEl.className = 'rsvp-pre';
    const pivotEl = document.createElement('span');
    pivotEl.className = 'rsvp-pivot';
    const postEl = document.createElement('span');
    postEl.className = 'rsvp-post';

    display.appendChild(preEl);
    display.appendChild(pivotEl);
    display.appendChild(postEl);
    frame.appendChild(display);

    // WPM indicator
    const wpmLabel = document.createElement('div');
    wpmLabel.className = 'rsvp-wpm';
    wpmLabel.textContent = `${settings.rsvp.wpm} WPM`;
    frame.appendChild(wpmLabel);

    el.appendChild(frame);

    // Tap to toggle
    frame.addEventListener('click', () => {
      if (playing) pause(); else play();
    });
  }

  function measureAvailableWidth() {
    if (!container) return;
    measureCtx = null; // reset so next measureText picks up current font
    const word = container.querySelector('.rsvp-word');
    if (word) {
      const style = getComputedStyle(word);
      maxTextWidth = word.clientWidth
        - parseFloat(style.paddingLeft)
        - parseFloat(style.paddingRight)
        - 4; // safety margin for subpixel rounding
    }
  }

  function init(chapter, el, opts = {}) {
    settings = Storage.getSettings();
    words = Gutenberg.tokenize(chapter.text);
    chunkIndex = opts.wordIndex || 0;
    onProgress = opts.onProgress || null;
    onFinished = opts.onFinished || null;
    colorIndex = 0;
    playing = false;

    buildUI(el);

    // Measure after layout, then build chunks fitted to width
    requestAnimationFrame(() => {
      measureAvailableWidth();
      chunks = fitChunksToWidth(buildChunks(words, settings.rsvp.minChars));
      chunkIndex = Math.min(chunkIndex, Math.max(0, chunks.length - 1));
      if (chunks.length > 0 && chunkIndex < chunks.length) {
        renderChunk(chunks[chunkIndex]);
      }
    });
  }

  function play() {
    if (chunkIndex >= chunks.length) chunkIndex = 0;
    settings = Storage.getSettings();
    measureAvailableWidth();
    chunks = fitChunksToWidth(buildChunks(words, settings.rsvp.minChars));
    chunkIndex = Math.min(chunkIndex, Math.max(0, chunks.length - 1));
    playing = true;
    lastFrameTime = 0;
    currentDelay = 0;
    updateWPMLabel();
    rafId = requestAnimationFrame(tick);
  }

  function pause() {
    playing = false;
    if (rafId) cancelAnimationFrame(rafId);
  }

  function toggle() {
    if (playing) pause(); else play();
  }

  function adjustWPM(delta) {
    settings.rsvp.wpm = Math.max(50, Math.min(1200, settings.rsvp.wpm + delta));
    Storage.saveSettings(settings);
    updateWPMLabel();
  }

  function getWPM() {
    return settings ? settings.rsvp.wpm : 300;
  }

  function updateWPMLabel() {
    if (!container) return;
    const label = container.querySelector('.rsvp-wpm');
    if (label) label.textContent = `${settings.rsvp.wpm} WPM`;
  }

  function skipBack(n) {
    chunkIndex = Math.max(0, chunkIndex - (n || 10));
    if (chunks[chunkIndex]) renderChunk(chunks[chunkIndex]);
    if (onProgress) onProgress(chunkIndex, chunks.length);
  }

  function skipForward(n) {
    chunkIndex = Math.min(chunks.length - 1, chunkIndex + (n || 10));
    if (chunks[chunkIndex]) renderChunk(chunks[chunkIndex]);
    if (onProgress) onProgress(chunkIndex, chunks.length);
  }

  function getWordIndex() { return chunkIndex; }
  function isPlaying() { return playing; }

  // Re-measure and refit chunks (e.g. after font size change)
  function refit() {
    if (!container || words.length === 0) return;
    settings = Storage.getSettings();
    requestAnimationFrame(() => {
      measureAvailableWidth();
      chunks = fitChunksToWidth(buildChunks(words, settings.rsvp.minChars));
      chunkIndex = Math.min(chunkIndex, Math.max(0, chunks.length - 1));
      if (!playing && chunks.length > 0 && chunkIndex < chunks.length) {
        renderChunk(chunks[chunkIndex]);
      }
    });
  }

  function destroy() {
    pause();
    if (container) container.innerHTML = '';
    container = null;
    measureCtx = null;
    words = [];
    chunks = [];
  }

  return { init, play, pause, toggle, adjustWPM, getWPM, skipBack, skipForward, getWordIndex, isPlaying, refit, destroy };
})();
