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

    const bionic = Storage.getSettings().bionic;
    const paragraphs = chapter.text.split(/\n\s*\n/);
    for (const p of paragraphs) {
      const trimmed = p.trim();
      if (!trimmed || trimmed === chapter.title) continue;
      const pEl = document.createElement('p');
      if (bionic) {
        pEl.innerHTML = bionicFormat(trimmed);
      } else {
        pEl.textContent = trimmed;
      }
      crawlEl.appendChild(pEl);
    }

    perspective.appendChild(crawlEl);
    viewport.appendChild(perspective);

    // Depth fog overlay — blur strips that intensify toward the top
    const depthOn = Storage.getSettings().depthTrail;
    if (depthOn) {
      viewport.classList.add('crawl-depth');
      const fog = document.createElement('div');
      fog.className = 'crawl-fog';
      // 4 strips: bottom of the fog (mild blur) to top (heavy blur)
      for (let i = 0; i < 4; i++) {
        const strip = document.createElement('div');
        strip.className = 'crawl-fog-strip';
        strip.dataset.level = i;
        fog.appendChild(strip);
      }
      viewport.appendChild(fog);
    }

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
    crawlEl.style.transform = `rotateX(28deg) translateY(${viewHeight - scrollPos}px)`;
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
  // Simple model: touching = manual control. Release = auto-play resumes.

  function getY(e) {
    return (e.touches && e.touches.length) ? e.touches[0].clientY : e.clientY;
  }

  function onPointerDown(e) {
    dragging = true;
    coasting = false;
    lastDragY = getY(e);
    lastDragTime = performance.now();
    velocity = 0;
    if (e.type === 'mousedown') e.preventDefault();
  }

  function onPointerMove(e) {
    if (!dragging) return;
    e.preventDefault();

    const y = getY(e);
    const now = performance.now();
    const dt = now - lastDragTime;
    const dy = y - lastDragY;

    scrollPos -= dy;
    applyTransform();
    reportProgress();

    if (dt > 0) velocity = -dy / dt;
    lastDragY = y;
    lastDragTime = now;
  }

  function onPointerUp() {
    if (!dragging) return;
    dragging = false;

    // Coast if there's velocity, then auto-play resumes via the loop
    if (Math.abs(velocity) > 0.05) {
      coasting = true;
    }
    // Always keep the loop running if auto-play is on
    if (autoPlay) startLoop();
  }

  function onWheel(e) {
    e.preventDefault();
    scrollPos += e.deltaY * 0.5;
    applyTransform();
    reportProgress();
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

  function remeasure() {
    requestAnimationFrame(() => {
      measure();
      applyTransform();
    });
  }

  function getScrollPos() { return scrollPos; }
  function getSpeed() { return speed; }
  function isPlaying() { return autoPlay; }

  function destroy() {
    stopLoop();
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

  function bionicFormat(text) {
    return text.replace(/\S+/g, word => {
      const mid = Math.ceil(word.length * 0.5);
      return `<b>${word.substring(0, mid)}</b>${word.substring(mid)}`;
    });
  }

  return { render, play, pause, toggle, adjustSpeed, getSpeed, getScrollPos, isPlaying, remeasure, destroy };
})();
