/**
 * Image viewer — overlay, swipeable album, pinch to zoom.
 *
 * Replaces opening the image file in a new tab, which loses the album, loses
 * the alt text, and on a phone dumps you in a browser tab you have to navigate
 * back out of.
 *
 * Gestures, and why each is handled the way it is:
 *
 *   • One finger, zoomed OUT → horizontal drag pages between the post's images.
 *     Vertical drag past a threshold dismisses. The axis is decided once, on the
 *     first few pixels of movement, and then locked — deciding per-frame makes a
 *     diagonal drag jitter between paging and dismissing.
 *   • One finger, zoomed IN → pans the image. Paging is suppressed, because a
 *     drag across a zoomed photo must not skip to the next one.
 *   • Two fingers → pinch. Scale is anchored on the midpoint between them, so
 *     the image grows out of what you are pinching rather than the centre.
 *   • Double-tap toggles between fit and 2.5x, anchored on the tap.
 *
 * `touch-action: none` on the stage is required: without it the browser claims
 * the gesture for its own scroll/zoom before any handler sees it.
 */

const MAX_SCALE = 6;
const MIN_SCALE = 1;

let el = null;      // the overlay, created once
let state = null;

function build() {
  if (el) return el;
  el = document.createElement('div');
  el.className = 'lb';
  el.hidden = true;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.innerHTML = `
    <div class="lb-bar">
      <button class="lb-close" aria-label="Close">✕</button>
      <span class="lb-count"></span>
      <a class="lb-open" target="_blank" rel="noopener" title="Open the full-size file">↗</a>
    </div>
    <div class="lb-stage"><img class="lb-img" alt=""></div>
    <div class="lb-alt"></div>
    <div class="lb-dots"></div>`;
  document.body.append(el);

  el.querySelector('.lb-close').addEventListener('click', close);
  el.addEventListener('click', (e) => { if (e.target === el) close(); });
  wireGestures(el.querySelector('.lb-stage'));
  return el;
}

/**
 * @param {Array<{src:string, full?:string, alt?:string}>} images
 * @param {number} [index]
 */
export function open(images, index = 0) {
  if (!images?.length) return;
  build();
  state = { images, i: Math.max(0, Math.min(index, images.length - 1)),
            scale: 1, x: 0, y: 0 };
  el.hidden = false;
  document.body.style.overflow = 'hidden';   // don't scroll the feed underneath
  render();
  document.addEventListener('keydown', onKey);
}

export function close() {
  if (!el || el.hidden) return;
  el.hidden = true;
  document.body.style.overflow = '';
  state = null;
  document.removeEventListener('keydown', onKey);
}

function onKey(e) {
  if (!state) return;
  if (e.key === 'Escape') close();
  else if (e.key === 'ArrowRight') go(1);
  else if (e.key === 'ArrowLeft') go(-1);
}

function go(delta) {
  if (!state) return;
  const next = state.i + delta;
  if (next < 0 || next >= state.images.length) return;
  state.i = next;
  state.scale = 1; state.x = 0; state.y = 0;   // a new image starts fitted
  render();
}

function render() {
  const { images, i } = state;
  const img = images[i];
  const imgEl = el.querySelector('.lb-img');
  imgEl.src = img.full || img.src;
  imgEl.alt = img.alt || '';
  el.querySelector('.lb-open').href = img.full || img.src;
  el.querySelector('.lb-count').textContent =
    images.length > 1 ? `${i + 1} / ${images.length}` : '';
  const alt = el.querySelector('.lb-alt');
  alt.textContent = img.alt || '';
  alt.hidden = !img.alt;
  el.querySelector('.lb-dots').innerHTML = images.length > 1
    ? images.map((_, n) => `<i class="${n === i ? 'on' : ''}"></i>`).join('')
    : '';
  apply();
}

/**
 * The centre the transform actually pivots around.
 *
 * `transform: translate() scale()` uses `transform-origin`, which defaults to
 * the element's CENTRE — not the viewport's top-left. The zoom anchor maths
 * ignored that and treated `clientX/clientY` as if they were offsets from the
 * origin, so a double-tap in the middle of the screen, which should move the
 * image not at all, threw it 292px sideways and 630px up. The picture ended up
 * mostly outside the viewport, which is why zoom "worked" and panning appeared
 * to do nothing: the drag was moving an image that was no longer on screen.
 */
function stageCentre() {
  const r = el.querySelector('.lb-stage').getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/**
 * Keep the picture reachable.
 *
 * Without this, pan is unbounded: a flick sends the image off into nowhere and
 * there is no way back except closing. The image may be dragged until its edge
 * meets the viewport edge and no further; when an axis is smaller than the
 * viewport it stays centred on that axis.
 */
function clampPan() {
  const imgEl = el.querySelector('.lb-img');
  const w = imgEl.offsetWidth * state.scale;
  const h = imgEl.offsetHeight * state.scale;
  const stage = el.querySelector('.lb-stage').getBoundingClientRect();
  const maxX = Math.max(0, (w - stage.width) / 2);
  const maxY = Math.max(0, (h - stage.height) / 2);
  state.x = Math.max(-maxX, Math.min(maxX, state.x));
  state.y = Math.max(-maxY, Math.min(maxY, state.y));
}

function apply({ clamp = true } = {}) {
  const imgEl = el.querySelector('.lb-img');
  if (clamp) clampPan();
  imgEl.style.transform = `translate(${state.x}px, ${state.y}px) scale(${state.scale})`;
  imgEl.classList.toggle('zoomed', state.scale > 1.01);
}

// ─── gestures ────────────────────────────────────────────────────

function wireGestures(stage) {
  const pointers = new Map();
  let start = null;
  let axis = null;            // 'x' | 'y' | null — locked after the first move
  let lastTap = 0;

  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

  stage.addEventListener('pointerdown', (e) => {
    if (!state) return;
    stage.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size === 1) {
      // Double-tap: two taps close in time AND place. Without the distance
      // check, a quick page-swipe followed by a tap reads as a double-tap.
      const now = Date.now();
      if (now - lastTap < 300) { toggleZoom(e.clientX, e.clientY); lastTap = 0; }
      else lastTap = now;

      start = { x: e.clientX, y: e.clientY, ox: state.x, oy: state.y, t: now };
      axis = null;
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      start = { pinch: dist(a, b), scale: state.scale, mid: mid(a, b), ox: state.x, oy: state.y };
      axis = 'pinch';
    }
  });

  stage.addEventListener('pointermove', (e) => {
    if (!state || !pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size >= 2 && start?.pinch) {
      const [a, b] = [...pointers.values()];
      const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, start.scale * (dist(a, b) / start.pinch)));
      // Anchor on the pinch midpoint so the image grows out of the fingers —
      // measured from the transform's centre, for the same reason as
      // toggleZoom. Anchoring on raw client coords walks the image off screen.
      const m = mid(a, b);
      const c = stageCentre();
      const k = next / start.scale;
      state.x = (m.x - c.x) - ((m.x - c.x) - start.ox) * k;
      state.y = (m.y - c.y) - ((m.y - c.y) - start.oy) * k;
      state.scale = next;
      // Not clamped mid-pinch: clamping every frame fights the gesture and the
      // image judders against the edge. It settles on release.
      apply({ clamp: false });
      return;
    }

    if (pointers.size !== 1 || !start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;

    if (state.scale > 1.01) {          // zoomed: pan, never page
      state.x = start.ox + dx;
      state.y = start.oy + dy;
      apply();
      return;
    }

    // Lock the axis once, on the first meaningful movement.
    if (!axis && Math.hypot(dx, dy) > 8) axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    if (axis === 'x') {
      el.querySelector('.lb-img').style.transform = `translateX(${dx}px)`;
    } else if (axis === 'y') {
      el.querySelector('.lb-img').style.transform = `translateY(${dy}px)`;
      el.style.opacity = String(Math.max(0.35, 1 - Math.abs(dy) / 400));
    }
  });

  const end = (e) => {
    if (!state) return;
    const p = pointers.get(e.pointerId);
    pointers.delete(e.pointerId);

    if (axis === 'pinch') {
      if (pointers.size === 0) {
        if (state.scale <= 1.02) { state.scale = 1; state.x = 0; state.y = 0; }
        axis = null; start = null; apply();
      }
      return;
    }
    if (!start || !p) { start = null; axis = null; return; }

    const dx = p.x - start.x;
    const dy = p.y - start.y;
    el.style.opacity = '';

    if (axis === 'x' && Math.abs(dx) > 60) go(dx < 0 ? 1 : -1);
    else if (axis === 'y' && Math.abs(dy) > 110) close();
    else apply();                       // snap back

    start = null; axis = null;
  };
  stage.addEventListener('pointerup', end);
  stage.addEventListener('pointercancel', end);

  // Trackpad and mouse wheel zoom, for the desktop case.
  stage.addEventListener('wheel', (e) => {
    if (!state) return;
    e.preventDefault();
    const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, state.scale * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
    const k = next / state.scale;
    state.x = e.clientX - (e.clientX - state.x) * k;
    state.y = e.clientY - (e.clientY - state.y) * k;
    state.scale = next;
    if (state.scale === 1) { state.x = 0; state.y = 0; }
    apply();
  }, { passive: false });
}

function toggleZoom(cx, cy) {
  if (state.scale > 1.01) { state.scale = 1; state.x = 0; state.y = 0; }
  else {
    const k = 2.5;
    // Anchored on the tap, measured from the transform's own centre. The point
    // under the finger has image-offset u = (P - C - t)/s; keeping it there
    // after scaling gives t' = (P - C) - u·s'.
    const c = stageCentre();
    const px = cx - c.x;
    const py = cy - c.y;
    state.x = px - (px - state.x) * k;
    state.y = py - (py - state.y) * k;
    state.scale = k;
  }
  apply();
}
