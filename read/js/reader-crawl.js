/* reader-crawl.js — Star Wars opening crawl mode */

const CrawlReader = (() => {
  let container = null;
  let crawlEl = null;
  let rafId = null;
  let scrollPos = 0;
  let playing = false;
  let speed = 1.0;
  let crawlHeight = 0;
  let viewHeight = 0;
  let onFinished = null;
  let onProgress = null;
  let lastTime = 0;

  function render(chapter, el, opts = {}) {
    container = el;
    el.innerHTML = '';
    el.className = 'crawl-reader';
    speed = Storage.getSettings().crawl.speed;
    onFinished = opts.onFinished || null;
    onProgress = opts.onProgress || null;
    scrollPos = opts.scrollPos || 0;
    playing = false;

    const viewport = document.createElement('div');
    viewport.className = 'crawl-viewport';

    const perspective = document.createElement('div');
    perspective.className = 'crawl-perspective';

    crawlEl = document.createElement('div');
    crawlEl.className = 'crawl-content';

    // Title
    const title = document.createElement('h2');
    title.className = 'crawl-title';
    title.textContent = chapter.title;
    crawlEl.appendChild(title);

    // Paragraphs
    const paragraphs = chapter.text.split(/\n\s*\n/);
    for (const p of paragraphs) {
      const trimmed = p.trim();
      if (!trimmed) continue;
      if (trimmed === chapter.title) continue;
      const pEl = document.createElement('p');
      pEl.textContent = trimmed;
      crawlEl.appendChild(pEl);
    }

    perspective.appendChild(crawlEl);
    viewport.appendChild(perspective);
    el.appendChild(viewport);

    // Click to play/pause
    viewport.addEventListener('click', () => {
      if (playing) pause(); else play();
    });

    // Measure after layout
    requestAnimationFrame(() => {
      crawlHeight = crawlEl.scrollHeight;
      viewHeight = viewport.clientHeight;
      crawlEl.style.transform = `translateY(${viewHeight - scrollPos}px)`;
    });
  }

  function tick(timestamp) {
    if (!playing) return;
    if (!lastTime) lastTime = timestamp;
    const dt = timestamp - lastTime;
    lastTime = timestamp;

    scrollPos += (speed * 50 * dt) / 1000; // pixels per second
    crawlEl.style.transform = `translateY(${viewHeight - scrollPos}px)`;

    if (onProgress) {
      const total = crawlHeight + viewHeight;
      onProgress(Math.min(scrollPos / total, 1));
    }

    if (scrollPos > crawlHeight + viewHeight) {
      playing = false;
      if (onFinished) onFinished();
      return;
    }

    rafId = requestAnimationFrame(tick);
  }

  function play() {
    playing = true;
    lastTime = 0;
    rafId = requestAnimationFrame(tick);
  }

  function pause() {
    playing = false;
    if (rafId) cancelAnimationFrame(rafId);
  }

  function toggle() {
    if (playing) pause(); else play();
  }

  function adjustSpeed(delta) {
    speed = Math.max(0.2, Math.min(5.0, speed + delta));
    const s = Storage.getSettings();
    s.crawl.speed = speed;
    Storage.saveSettings(s);
  }

  function getScrollPos() { return scrollPos; }
  function getSpeed() { return speed; }
  function isPlaying() { return playing; }

  function destroy() {
    pause();
    if (container) container.innerHTML = '';
    container = null;
    crawlEl = null;
  }

  return { render, play, pause, toggle, adjustSpeed, getSpeed, getScrollPos, isPlaying, destroy };
})();
