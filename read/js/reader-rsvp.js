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

  // Build chunks from word tokens, grouping short words to meet minChars
  function buildChunks(tokens, minChars) {
    if (minChars <= 0) {
      // No grouping — each word is its own chunk
      return tokens.map(t => ({
        text: t.word,
        words: [t],
        charLen: t.word.length
      }));
    }

    const result = [];
    let buf = [];
    let bufLen = 0;

    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      buf.push(t);
      bufLen += t.word.length;

      // Flush if we've met the minimum, or if this token ends a sentence/paragraph
      const metMin = bufLen >= minChars;
      const boundary = t.isSentenceEnd || t.isParagraph;

      if (metMin || boundary || i === tokens.length - 1) {
        const text = buf.map(w => w.word).join(' ');
        result.push({
          text,
          words: buf,
          charLen: text.length
        });
        buf = [];
        bufLen = 0;
      }
    }
    return result;
  }

  function computeDelay(chunk) {
    const base = 60000 / settings.rsvp.wpm;
    // Scale by number of words in the chunk
    let wordTime = base * chunk.words.length;
    // Apply complexity multiplier from the last word in chunk
    const last = chunk.words[chunk.words.length - 1];
    let mult = 1;
    if (last.isSentenceEnd) mult = 1.6;
    else if (last.isClause) mult = 1.3;
    if (last.isParagraph) mult *= 2.0;
    // Also slow for very long chunks
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

    // Color flash between frames
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

  function init(chapter, el, opts = {}) {
    settings = Storage.getSettings();
    words = Gutenberg.tokenize(chapter.text);
    chunks = buildChunks(words, settings.rsvp.minChars);
    chunkIndex = opts.wordIndex || 0;
    onProgress = opts.onProgress || null;
    onFinished = opts.onFinished || null;
    colorIndex = 0;
    playing = false;

    buildUI(el);

    if (chunks.length > 0 && chunkIndex < chunks.length) {
      renderChunk(chunks[chunkIndex]);
    }
  }

  function play() {
    if (chunkIndex >= chunks.length) chunkIndex = 0;
    settings = Storage.getSettings();
    // Rebuild chunks if minChars changed
    chunks = buildChunks(words, settings.rsvp.minChars);
    chunkIndex = Math.min(chunkIndex, chunks.length - 1);
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

  function destroy() {
    pause();
    if (container) container.innerHTML = '';
    container = null;
    words = [];
    chunks = [];
  }

  return { init, play, pause, toggle, adjustWPM, getWPM, skipBack, skipForward, getWordIndex, isPlaying, destroy };
})();
