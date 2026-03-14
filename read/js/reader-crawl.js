/* reader-crawl.js — Star Wars opening crawl mode */

const CrawlReader = (() => {
  let container = null;
  let crawlEl = null;
  let viewport = null;
  let rafId = null;
  let scrollPos = 0;
  let playing = false;
  let speed = 1.0;
  let crawlHeight = 0;
  let viewHeight = 0;
  let onFinished = null;
  let onProgress = null;
  let lastTime = 0;

  // Manual override state
  let dragging = false;
  let dragStartY = 0;
  let dragStartPos = 0;
  let velocity = 0;        // px/ms from drag gesture
  let coasting = false;     // true while inertia is decelerating after release
  let wasPlayingBeforeDrag = false;

  function render(chapter, el, opts = {}) {
    container = el;
    el.innerHTML = '';
    el.className = 'crawl-reader';
    speed = Storage.getSettings().crawl.speed;
    onFinished = opts.onFinished || null;
    onProgress = opts.onProgress || null;
    scrollPos = opts.scrollPos || 0;
    playing = false;
    dragging = false;
    coasting = false;
    velocity = 0;

    viewport = document.createElement('div');
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

    // Touch events for manual scroll
    viewport.addEventListener('touchstart', onDragStart, { passive: false });
    viewport.addEventListener('touchmove', onDragMove, { passive: false });
    viewport.addEventListener('touchend', onDragEnd);
    viewport.addEventListener('touchcancel', onDragEnd);

    // Mouse events for desktop drag
    viewport.addEventListener('mousedown', onDragStart);
    viewport.addEventListener('mousemove', onDragMove);
    viewport.addEventListener('mouseup', onDragEnd);
    viewport.addEventListener('mouseleave', onDragEnd);

    // Wheel for scroll override
    viewport.addEventListener('wheel', onWheel, { passive: false });

    // Measure after layout
    requestAnimationFrame(() => {
      crawlHeight = crawlEl.scrollHeight;
      viewHeight = viewport.clientHeight;
      applyTransform();
    });
  }

  function applyTransform() {
    if (!crawlEl) return;
    // Clamp: can't scroll above the start
    scrollPos = Math.max(0, scrollPos);
    crawlEl.style.transform = `translateY(${viewHeight - scrollPos}px)`;
  }

  // ── Drag handling ──

  function getY(e) {
    if (e.touches && e.touches.length) return e.touches[0].clientY;
    return e.clientY;
  }

  let lastDragY = 0;
  let lastDragTime = 0;

  function onDragStart(e) {
    // Don't treat plain clicks as drags — track in dragMoved
    dragStartY = getY(e);
    dragStartPos = scrollPos;
    lastDragY = dragStartY;
    lastDragTime = performance.now();
    velocity = 0;
    dragging = false; // set true on first move
    coasting = false;
    wasPlayingBeforeDrag = playing;

    if (e.type === 'mousedown') {
      e.preventDefault(); // prevent text selection
    }
  }

  function onDragMove(e) {
    if (dragStartY === 0 && !dragging) return;

    const y = getY(e);
    const dy = y - (dragging ? lastDragY : dragStartY);

    // Start dragging after a small threshold to distinguish from taps
    if (!dragging) {
      if (Math.abs(y - dragStartY) < 5) return;
      dragging = true;
      if (playing) pause();
      e.preventDefault();
    } else {
      e.preventDefault();
    }

    const now = performance.now();
    const dt = now - lastDragTime;

    // Dragging up (negative dy) = scroll forward; dragging down = scroll back
    scrollPos -= dy;
    applyTransform();
    reportProgress();

    // Track velocity for inertia (negative = scrolling backward/up on screen)
    if (dt > 0) {
      velocity = -dy / dt; // px/ms
    }

    lastDragY = y;
    lastDragTime = now;
  }

  function onDragEnd() {
    if (!dragging) {
      // It was a tap, not a drag — toggle play
      if (playing) pause(); else play();
      dragStartY = 0;
      return;
    }

    dragging = false;
    dragStartY = 0;

    // Start inertia coast if there's meaningful velocity
    if (Math.abs(velocity) > 0.05) {
      coasting = true;
      lastTime = 0;
      rafId = requestAnimationFrame(coastTick);
    } else {
      // No velocity — resume auto-play if it was running
      if (wasPlayingBeforeDrag) play();
    }
  }

  function onWheel(e) {
    e.preventDefault();
    // Scroll: deltaY > 0 = scroll down = move text forward
    scrollPos += e.deltaY * 0.5;
    applyTransform();
    reportProgress();

    // Briefly interrupt auto-play for manual positioning
    if (playing) {
      pause();
      wasPlayingBeforeDrag = true;
      // Resume after a short idle
      clearTimeout(wheelResumeTimer);
      wheelResumeTimer = setTimeout(() => {
        if (wasPlayingBeforeDrag && !playing && !dragging) play();
      }, 800);
    }
  }
  let wheelResumeTimer = null;

  // ── Inertia coast ──

  function coastTick(timestamp) {
    if (!coasting) return;
    if (!lastTime) lastTime = timestamp;
    const dt = timestamp - lastTime;
    lastTime = timestamp;

    // Apply velocity with friction
    scrollPos += velocity * dt;
    velocity *= Math.pow(0.95, dt / 16); // friction: ~5% per frame at 60fps

    applyTransform();
    reportProgress();

    // Stop coasting when velocity is negligible
    if (Math.abs(velocity) < 0.02) {
      coasting = false;
      if (wasPlayingBeforeDrag) play();
      return;
    }

    rafId = requestAnimationFrame(coastTick);
  }

  // ── Auto-play tick ──

  function tick(timestamp) {
    if (!playing) return;
    if (!lastTime) lastTime = timestamp;
    const dt = timestamp - lastTime;
    lastTime = timestamp;

    scrollPos += (speed * 50 * dt) / 1000;
    applyTransform();
    reportProgress();

    if (scrollPos > crawlHeight + viewHeight) {
      playing = false;
      if (onFinished) onFinished();
      return;
    }

    rafId = requestAnimationFrame(tick);
  }

  function reportProgress() {
    if (!onProgress) return;
    const total = crawlHeight + viewHeight;
    if (total > 0) onProgress(Math.min(Math.max(scrollPos / total, 0), 1));
  }

  function play() {
    coasting = false;
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
    coasting = false;
    dragging = false;
    clearTimeout(wheelResumeTimer);
    if (container) container.innerHTML = '';
    container = null;
    crawlEl = null;
    viewport = null;
  }

  return { render, play, pause, toggle, adjustSpeed, getSpeed, getScrollPos, isPlaying, destroy };
})();
