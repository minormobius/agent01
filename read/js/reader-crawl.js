/* reader-crawl.js — Star Wars opening crawl mode */

const CrawlReader = (() => {
  let container = null;
  let crawlEl = null;
  let viewport = null;
  let rafId = null;
  let scrollPos = 0;
  let autoPlay = false;   // user intent: should it be auto-scrolling?
  let animating = false;   // is the rAF loop running?
  let speed = 1.0;
  let crawlHeight = 0;
  let viewHeight = 0;
  let onFinished = null;
  let onProgress = null;
  let lastTime = 0;

  // Manual override
  let dragging = false;
  let dragStartY = 0;
  let lastDragY = 0;
  let lastDragTime = 0;
  let velocity = 0;
  let coasting = false;
  let wheelTimer = null;

  function render(chapter, el, opts = {}) {
    destroy();
    container = el;
    el.innerHTML = '';
    el.className = 'crawl-reader';
    speed = Storage.getSettings().crawl.speed;
    onFinished = opts.onFinished || null;
    onProgress = opts.onProgress || null;
    scrollPos = opts.scrollPos || 0;
    autoPlay = false;
    animating = false;
    dragging = false;
    coasting = false;
    velocity = 0;

    viewport = document.createElement('div');
    viewport.className = 'crawl-viewport';

    const perspective = document.createElement('div');
    perspective.className = 'crawl-perspective';

    crawlEl = document.createElement('div');
    crawlEl.className = 'crawl-content';

    const title = document.createElement('h2');
    title.className = 'crawl-title';
    title.textContent = chapter.title;
    crawlEl.appendChild(title);

    const paragraphs = chapter.text.split(/\n\s*\n/);
    for (const p of paragraphs) {
      const trimmed = p.trim();
      if (!trimmed || trimmed === chapter.title) continue;
      const pEl = document.createElement('p');
      pEl.textContent = trimmed;
      crawlEl.appendChild(pEl);
    }

    perspective.appendChild(crawlEl);
    viewport.appendChild(perspective);
    el.appendChild(viewport);

    // Touch
    viewport.addEventListener('touchstart', onPointerDown, { passive: false });
    viewport.addEventListener('touchmove', onPointerMove, { passive: false });
    viewport.addEventListener('touchend', onPointerUp);
    viewport.addEventListener('touchcancel', onPointerUp);
    // Mouse
    viewport.addEventListener('mousedown', onPointerDown);
    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mouseup', onPointerUp);
    // Wheel
    viewport.addEventListener('wheel', onWheel, { passive: false });

    requestAnimationFrame(() => {
      measure();
      applyTransform();
    });
  }

  function measure() {
    if (viewport) viewHeight = viewport.clientHeight;
    if (crawlEl) crawlHeight = crawlEl.scrollHeight;
  }

  function applyTransform() {
    if (!crawlEl) return;
    if (viewHeight === 0 || crawlHeight === 0) measure();
    scrollPos = Math.max(0, scrollPos);
    crawlEl.style.transform = `translateY(${viewHeight - scrollPos}px)`;
  }

  // ── Unified animation loop ──

  function startLoop() {
    if (animating) return;
    animating = true;
    lastTime = 0;
    rafId = requestAnimationFrame(loop);
  }

  function stopLoop() {
    animating = false;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  }

  function loop(timestamp) {
    if (!animating) return;
    if (!lastTime) { lastTime = timestamp; rafId = requestAnimationFrame(loop); return; }
    const dt = timestamp - lastTime;
    lastTime = timestamp;

    if (coasting) {
      // Inertia
      scrollPos += velocity * dt;
      velocity *= Math.pow(0.93, dt / 16);
      if (Math.abs(velocity) < 0.02) {
        coasting = false;
        // If auto-play was on, resume it seamlessly
        if (!autoPlay) { stopLoop(); reportProgress(); return; }
      }
    } else if (autoPlay && !dragging) {
      // Normal auto-scroll
      scrollPos += (speed * 50 * dt) / 1000;
    }

    applyTransform();
    reportProgress();

    // Check if finished
    if (crawlHeight > 0 && scrollPos > crawlHeight + viewHeight) {
      autoPlay = false;
      stopLoop();
      if (onFinished) onFinished();
      return;
    }

    rafId = requestAnimationFrame(loop);
  }

  // ── Pointer handling ──

  function getY(e) {
    return (e.touches && e.touches.length) ? e.touches[0].clientY : e.clientY;
  }

  function onPointerDown(e) {
    dragStartY = getY(e);
    lastDragY = dragStartY;
    lastDragTime = performance.now();
    velocity = 0;
    dragging = false;
    coasting = false;
    if (e.type === 'mousedown') e.preventDefault();
  }

  function onPointerMove(e) {
    if (dragStartY === 0) return;
    const y = getY(e);

    if (!dragging) {
      if (Math.abs(y - dragStartY) < 5) return;
      dragging = true;
      coasting = false;
      // Keep the loop running so we don't need to restart it
      startLoop();
    }

    e.preventDefault();
    const now = performance.now();
    const dt = now - lastDragTime;
    const dy = y - lastDragY;

    scrollPos -= dy;
    if (dt > 0) velocity = -dy / dt;

    lastDragY = y;
    lastDragTime = now;
  }

  function onPointerUp() {
    if (!dragging) {
      // Tap: toggle auto-play
      dragStartY = 0;
      toggle();
      return;
    }

    dragging = false;
    dragStartY = 0;

    if (Math.abs(velocity) > 0.05) {
      // Coast with inertia, then resume auto-play if it was on
      coasting = true;
      startLoop();
    } else if (autoPlay) {
      // No velocity, just resume
      startLoop();
    } else {
      stopLoop();
      applyTransform();
    }
  }

  function onWheel(e) {
    e.preventDefault();
    scrollPos += e.deltaY * 0.5;
    applyTransform();
    reportProgress();

    // Temporarily pause auto-scroll, resume after idle
    clearTimeout(wheelTimer);
    if (autoPlay) {
      stopLoop();
      wheelTimer = setTimeout(() => {
        if (autoPlay && !dragging) startLoop();
      }, 600);
    }
  }

  function reportProgress() {
    if (!onProgress) return;
    const total = crawlHeight + viewHeight;
    if (total > 0) onProgress(Math.min(Math.max(scrollPos / total, 0), 1));
  }

  // ── Public API ──

  function play() {
    autoPlay = true;
    coasting = false;
    startLoop();
  }

  function pause() {
    autoPlay = false;
    coasting = false;
    stopLoop();
  }

  function toggle() {
    if (autoPlay) pause(); else play();
  }

  function adjustSpeed(delta) {
    speed = Math.max(0.2, Math.min(5.0, speed + delta));
    const s = Storage.getSettings();
    s.crawl.speed = speed;
    Storage.saveSettings(s);
  }

  function getScrollPos() { return scrollPos; }
  function getSpeed() { return speed; }
  function isPlaying() { return autoPlay; }

  function destroy() {
    stopLoop();
    clearTimeout(wheelTimer);
    dragging = false;
    coasting = false;
    // Remove window-level listeners
    window.removeEventListener('mousemove', onPointerMove);
    window.removeEventListener('mouseup', onPointerUp);
    if (container) container.innerHTML = '';
    container = null;
    crawlEl = null;
    viewport = null;
  }

  return { render, play, pause, toggle, adjustSpeed, getSpeed, getScrollPos, isPlaying, destroy };
})();
