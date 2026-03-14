/* reader-rsvp.js — Rapid Serial Visual Presentation engine */

const RSVPReader = (() => {
  let container = null;
  let words = [];
  let wordIndex = 0;
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

  // ORP: optimal recognition point index within a word
  function orpIndex(len) {
    if (len <= 1) return 0;
    if (len <= 5) return 1;
    if (len <= 9) return 2;
    if (len <= 13) return 3;
    return 4;
  }

  function computeDelay(token) {
    const base = 60000 / settings.rsvp.wpm;
    let mult = 1;
    if (token.length > 12) mult = 1.5;
    else if (token.length > 8) mult = 1.3;
    if (token.isSentenceEnd) mult *= 2.0;
    else if (token.isClause) mult *= 1.4;
    if (token.isParagraph) mult *= 2.5;
    return base * mult;
  }

  function renderWord(token) {
    if (!container) return;
    const word = token.word;
    const orp = orpIndex(word.length);

    const pre = word.substring(0, orp);
    const pivot = word[orp] || '';
    const post = word.substring(orp + 1);

    const display = container.querySelector('.rsvp-word');
    const preEl = display.querySelector('.rsvp-pre');
    const pivotEl = display.querySelector('.rsvp-pivot');
    const postEl = display.querySelector('.rsvp-post');

    if (settings.rsvp.bionic) {
      const mid = Math.ceil(word.length * 0.5);
      // Bionic: bold front half, still show ORP highlight
      preEl.innerHTML = orp <= mid
        ? `<b>${pre}</b>`
        : `<b>${pre.substring(0, mid)}</b>${pre.substring(mid)}`;
      pivotEl.textContent = pivot;
      postEl.innerHTML = orp < mid
        ? `<b>${post.substring(0, mid - orp - 1)}</b>${post.substring(mid - orp - 1)}`
        : post;
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

  function tick(timestamp) {
    if (!playing) return;
    if (timestamp - lastFrameTime < currentDelay) {
      rafId = requestAnimationFrame(tick);
      return;
    }
    lastFrameTime = timestamp;

    if (wordIndex >= words.length) {
      playing = false;
      if (onFinished) onFinished();
      return;
    }

    const token = words[wordIndex];
    renderWord(token);
    currentDelay = computeDelay(token);
    wordIndex++;

    if (onProgress) onProgress(wordIndex, words.length);
    rafId = requestAnimationFrame(tick);
  }

  function buildUI(el) {
    container = el;
    el.innerHTML = '';
    el.className = 'rsvp-reader';

    // Alignment marker
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
    wordIndex = opts.wordIndex || 0;
    onProgress = opts.onProgress || null;
    onFinished = opts.onFinished || null;
    colorIndex = 0;
    playing = false;

    buildUI(el);

    if (words.length > 0 && wordIndex < words.length) {
      renderWord(words[wordIndex]);
    }
  }

  function play() {
    if (wordIndex >= words.length) wordIndex = 0;
    settings = Storage.getSettings();
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

  function updateWPMLabel() {
    if (!container) return;
    const label = container.querySelector('.rsvp-wpm');
    if (label) label.textContent = `${settings.rsvp.wpm} WPM`;
  }

  function skipBack(n) {
    wordIndex = Math.max(0, wordIndex - (n || 10));
    if (words[wordIndex]) renderWord(words[wordIndex]);
    if (onProgress) onProgress(wordIndex, words.length);
  }

  function skipForward(n) {
    wordIndex = Math.min(words.length - 1, wordIndex + (n || 10));
    if (words[wordIndex]) renderWord(words[wordIndex]);
    if (onProgress) onProgress(wordIndex, words.length);
  }

  function getWordIndex() { return wordIndex; }
  function isPlaying() { return playing; }

  function destroy() {
    pause();
    if (container) container.innerHTML = '';
    container = null;
    words = [];
  }

  return { init, play, pause, toggle, adjustWPM, skipBack, skipForward, getWordIndex, isPlaying, destroy };
})();
