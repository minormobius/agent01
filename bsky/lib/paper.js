/**
 * Read the paper, in the feed.
 *
 * A preprint feed whose links all bounce you out to a publisher's site is a
 * list of homework. This renders the actual PDF underneath the post: scrollable,
 * zoomable, with its hyperlinks live.
 *
 * WHAT IS AND IS NOT POSSIBLE, measured 2026-09-05. The blocker is CORS again,
 * and this time the answer is unusually good for exactly the source that
 * matters most to this feed:
 *
 *   | host                   | browser-fetchable          |
 *   |------------------------|----------------------------|
 *   | arxiv.org              | YES — `ACAO: *` AND Range  |
 *   | osf.io                 | no (Range, but no CORS)    |
 *   | ncbi PMC               | no                         |
 *   | biorxiv / medrxiv      | no                         |
 *   | plos, mdpi             | no                         |
 *
 * arXiv allowing both a cross-origin read AND byte ranges is what makes this
 * work at all: pdf.js can then fetch the structure and only the pages being
 * looked at, instead of pulling a 20 MB download before drawing anything.
 *
 * Everywhere else the browser cannot read the bytes — see the CORS note in this
 * surface's CLAUDE.md; `no-cors` yields an opaque body, which is not a PDF you
 * can parse. Those links stay ordinary links, and the UI says why rather than
 * offering a button that fails.
 *
 * pdf.js is ~448 KB plus a 1.3 MB worker, so it is imported ONLY when a reader
 * actually opens a paper. It is never in the app shell.
 */

const PDFJS_URL = '/lib/vendor/pdfjs/pdf.min.mjs';
const WORKER_URL = '/lib/vendor/pdfjs/pdf.worker.min.mjs';

/** Hosts whose PDFs a browser may actually read. Measured, not assumed. */
const READABLE = ['arxiv.org'];

/**
 * The PDF for a link, when one is reachable.
 *
 * arXiv is quietly generous here: `/abs/<id>`, `/pdf/<id>` and `/pdf/<id>v2`
 * all describe the same paper, and `/pdf/<id>` serves it. So an abstract link —
 * which is what people actually post — becomes a readable PDF.
 *
 * @param {string} url
 * @returns {{pdf: string, label: string} | null}
 */
export function paperPdf(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  const host = u.hostname.replace(/^www\./, '');
  if (!READABLE.includes(host)) return null;

  if (host === 'arxiv.org') {
    const m = /^\/(?:abs|pdf)\/(.+?)(?:\.pdf)?$/.exec(u.pathname);
    if (!m) return null;
    const id = m[1];
    return { pdf: `https://arxiv.org/pdf/${id}`, label: `arXiv:${id}` };
  }
  return null;
}

/** The first readable paper among a post's links, or null. */
export function paperOf(links) {
  for (const l of links || []) {
    const p = paperPdf(l);
    if (p) return p;
  }
  return null;
}

// ─── the viewer ──────────────────────────────────────────────────

let pdfjs = null;

async function lib() {
  if (pdfjs) return pdfjs;
  pdfjs = await import(PDFJS_URL);
  // Without a worker pdf.js parses on the main thread and the scroll stutters
  // on exactly the long documents this is for.
  pdfjs.GlobalWorkerOptions.workerSrc = WORKER_URL;
  return pdfjs;
}

/**
 * Open a PDF full-screen.
 *
 * Pages are rendered ON DEMAND, by an IntersectionObserver, and a page is
 * rendered at the CURRENT zoom rather than scaled with CSS: a paper is text,
 * and an upscaled bitmap of text is unreadable, which defeats the point of
 * zooming into a figure caption. The trade is a re-render on zoom, which is why
 * zoom settles before it redraws.
 *
 * @param {{pdf: string, label: string}} paper
 */
export async function openPaper(paper) {
  const stage = document.createElement('div');
  stage.className = 'paper';
  stage.innerHTML = `
    <div class="paper-bar">
      <button class="pill" data-act="close">close</button>
      <span class="paper-title"></span>
      <span class="spacer"></span>
      <button class="pill" data-act="out">−</button>
      <span class="paper-zoom">100%</span>
      <button class="pill" data-act="in">+</button>
      <a class="pill" target="_blank" rel="noopener" data-act="open">open ↗</a>
    </div>
    <div class="paper-scroll"><div class="paper-status">loading the paper…</div></div>`;
  document.body.append(stage);
  document.body.style.overflow = 'hidden';

  const scroll = stage.querySelector('.paper-scroll');
  const status = stage.querySelector('.paper-status');
  const zoomLabel = stage.querySelector('.paper-zoom');
  stage.querySelector('[data-act="open"]').href = paper.pdf;
  stage.querySelector('.paper-title').textContent = paper.label;

  let doc = null;
  // The LOADING TASK, which is what owns the worker. `getDocument()` returns
  // this; `.promise` resolves to the document. In pdf.js 6 the document has NO
  // `destroy()` — teardown is `loadingTask.destroy()`. The old code called
  // `doc?.destroy?.()`, and the optional call made a missing method SILENT, so
  // the worker was never torn down at all and pdf.js threw `Cannot read
  // properties of null (reading '_post')` out of the orphaned port. Optional
  // chaining on a method you believe exists hides exactly this.
  let loading = null;
  let scale = 1;
  let observer = null;
  // Bumped on every zoom. A render that finishes against a stale generation
  // throws its result away instead of being cancelled — see setZoom.
  let generation = 0;
  const pages = new Map();          // pageNumber -> { wrap, canvas, rendered, task }

  /**
   * Teardown order matters. Destroying the document while a page render is
   * still in flight makes pdf.js throw `Cannot read properties of null
   * (reading '_post')` from inside its own worker plumbing — harmless to the
   * reader, but an uncaught console error, and a console that cries wolf is
   * worse than a quiet one. So: stop observing, cancel every render, let those
   * cancellations settle, and only then destroy.
   */
  const close = () => {
    observer?.disconnect();
    observer = null;
    const inflight = [];
    for (const p of pages.values()) {
      if (!p.task) continue;
      try { p.task.cancel(); } catch { /* already finished */ }
      // A cancelled render rejects; that rejection is expected, not a fault.
      inflight.push(Promise.resolve(p.task.promise).catch(() => {}));
      p.task = null;
    }
    stage.remove();
    document.body.style.overflow = '';
    window.removeEventListener('keydown', onKey);
    const task = loading;
    loading = null;
    doc = null;
    // Not optional: if `destroy` ever stops existing here too, this must fail
    // loudly rather than leak a worker in silence.
    Promise.all(inflight)
      .then(() => (task ? task.destroy() : undefined))
      .catch((err) => console.error('paper: teardown failed', err));
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  window.addEventListener('keydown', onKey);

  stage.querySelector('.paper-bar').addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'close') close();
    if (act === 'in') setZoom(scale * 1.25);
    if (act === 'out') setZoom(scale / 1.25);
  });

  try {
    const { getDocument } = await lib();
    // withCredentials off: this is a public paper on someone else's origin and
    // sending cookies would be both useless and rude.
    loading = getDocument({ url: paper.pdf, withCredentials: false });
    doc = await loading.promise;
  } catch (err) {
    status.innerHTML = `Could not read this paper.<br><span class="muted">${escapeHtml(err.message)}</span>`
      + `<br><a href="${escapeHtml(paper.pdf)}" target="_blank" rel="noopener">open it at arXiv instead ↗</a>`;
    return { close };
  }

  status.remove();

  // Fit the first page to the viewport, so a phone opens at a readable width
  // instead of at some arbitrary 100%.
  const first = await doc.getPage(1);
  const natural = first.getViewport({ scale: 1 });
  scale = Math.min(2.5, Math.max(0.4, (scroll.clientWidth - 16) / natural.width));

  for (let n = 1; n <= doc.numPages; n++) {
    const wrap = document.createElement('div');
    wrap.className = 'paper-page';
    wrap.dataset.page = String(n);
    const canvas = document.createElement('canvas');
    wrap.append(canvas);
    scroll.append(wrap);
    pages.set(n, { wrap, canvas, rendered: false, task: null });
  }
  await layout();

  observer = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) render(Number(e.target.dataset.page));
  }, { root: scroll, rootMargin: '600px 0px' });
  for (const p of pages.values()) observer.observe(p.wrap);

  /** Reserve each page's box at the current scale, so scrolling never jumps. */
  async function layout() {
    if (!doc) return;
    zoomLabel.textContent = `${Math.round(scale * 100)}%`;
    for (const [n, p] of pages) {
      const page = await doc.getPage(n);
      const vp = page.getViewport({ scale });
      p.wrap.style.width = `${Math.round(vp.width)}px`;
      p.wrap.style.height = `${Math.round(vp.height)}px`;
    }
  }

  /**
   * Render one page — and never two renders of the SAME page at once.
   *
   * pdf.js cannot have two `render()` calls in flight on one page object; doing
   * it throws `Cannot read properties of null (reading '_post')` from inside
   * its worker plumbing. It is easy to cause here without noticing: the
   * IntersectionObserver starts a render, the reader zooms before it finishes,
   * and `setZoom` starts another on the same page. Isolated, every other
   * operation this viewer performs — concurrent renders of DIFFERENT pages,
   * annotations, teardown — is clean; this was the one.
   *
   * So each page keeps its in-flight render and the next one waits for it.
   */
  async function render(n) {
    const p = pages.get(n);
    if (!p || p.rendered || !doc) return;
    p.rendered = true;
    const gen = generation;

    if (p.task) {
      // Let the previous render finish rather than cancelling it: cancelling
      // mid-flight is the other way to hit the same internal fault.
      try { await p.task.promise; } catch { /* superseded */ }
      if (gen !== generation || !doc) { p.rendered = false; return; }
    }
    const page = await doc.getPage(n);
    if (gen !== generation || !doc) { p.rendered = false; return; }
    const vp = page.getViewport({ scale });
    // Render at device pixel ratio or text is soft on a phone.
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    p.canvas.width = Math.round(vp.width * dpr);
    p.canvas.height = Math.round(vp.height * dpr);
    p.canvas.style.width = `${Math.round(vp.width)}px`;
    p.canvas.style.height = `${Math.round(vp.height)}px`;
    const ctx = p.canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    p.task = page.render({ canvasContext: ctx, viewport: vp });
    try { await p.task.promise; } catch { p.rendered = false; return; }
    p.task = null;
    if (gen !== generation) { p.rendered = false; return; }
    await addLinks(page, vp, p.wrap);
  }

  /**
   * Live hyperlinks. A canvas is a picture — the links in it are not links
   * until they are given real anchors, positioned from the annotation layer.
   */
  async function addLinks(page, vp, wrap) {
    wrap.querySelectorAll('.paper-link').forEach((a) => a.remove());
    let annots = [];
    try { annots = await page.getAnnotations({ intent: 'display' }); } catch { return; }
    for (const a of annots) {
      if (a.subtype !== 'Link' || !a.url) continue;
      const [x1, y1, x2, y2] = rectToViewport(a.rect, vp.transform);
      const el = document.createElement('a');
      el.className = 'paper-link';
      el.href = a.url;
      el.target = '_blank';
      el.rel = 'noopener noreferrer';
      el.style.left = `${x1}px`;
      el.style.top = `${y1}px`;
      el.style.width = `${x2 - x1}px`;
      el.style.height = `${y2 - y1}px`;
      wrap.append(el);
    }
  }

  function setZoom(next) {
    scale = Math.min(6, Math.max(0.25, next));
    // NOT cancel(). Cancelling a render mid-flight makes pdf.js throw
    // `Cannot read properties of null (reading '_post')` out of its own worker
    // plumbing, which is uncaught and unfixable from here. A page render is
    // fast; letting it finish and discarding the result against a bumped
    // generation costs a few milliseconds and removes the race completely.
    generation++;
    for (const p of pages.values()) p.rendered = false;
    layout().then(() => {
      // Re-render whatever is on screen now; the observer handles the rest.
      for (const [n, p] of pages) {
        const r = p.wrap.getBoundingClientRect();
        if (r.bottom > 0 && r.top < window.innerHeight) render(n);
      }
    });
  }

  // Pinch. Same lesson as lib/lightbox.js: `touch-action: none` on the stage or
  // the browser claims the gesture, and the zoom settles before it re-renders —
  // re-rendering per frame on a 30-page document is unusable.
  let pinchStart = 0;
  let scaleStart = 1;
  let settle = null;
  scroll.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 2) return;
    pinchStart = dist(e.touches);
    scaleStart = scale;
  }, { passive: true });
  scroll.addEventListener('touchmove', (e) => {
    if (e.touches.length !== 2 || !pinchStart) return;
    e.preventDefault();
    const next = scaleStart * (dist(e.touches) / pinchStart);
    // Cheap CSS preview while the fingers move; a real render when they stop.
    scroll.style.setProperty('--paper-preview', String(next / scale));
    clearTimeout(settle);
    settle = setTimeout(() => {
      scroll.style.removeProperty('--paper-preview');
      setZoom(next);
    }, 140);
  }, { passive: false });
  scroll.addEventListener('touchend', () => { pinchStart = 0; }, { passive: true });

  return { close };
}

/**
 * An annotation rect, in PDF space, mapped into viewport pixels.
 *
 * Done with arithmetic rather than through pdf.js's helpers, because those have
 * moved twice in one afternoon: `viewport.convertToViewportRectangle` was
 * REMOVED in v6, and `Util.applyTransform` exists but no longer returns a point
 * you can destructure. Both failures are silent in the same way — the call
 * throws inside the annotation pass and every link vanishes, which is
 * indistinguishable from a PDF that has no links.
 *
 * The viewport transform is an ordinary 2D affine matrix `[a, b, c, d, e, f]`:
 *   x' = a·x + c·y + e
 *   y' = b·x + d·y + f
 * That is stable, it is testable without a browser, and it cannot be renamed.
 *
 * @param {number[]} rect  [x1, y1, x2, y2] in PDF user space
 * @param {number[]} m     the viewport's 6-element transform
 * @returns {number[]} [left, top, right, bottom] in viewport pixels
 */
export function rectToViewport(rect, m) {
  const [a, b, c, d, e, f] = m;
  const pt = (x, y) => [a * x + c * y + e, b * x + d * y + f];
  const [px1, py1] = pt(rect[0], rect[1]);
  const [px2, py2] = pt(rect[2], rect[3]);
  // PDF's y axis points up and the viewport's points down, so the corners swap.
  return [Math.min(px1, px2), Math.min(py1, py2), Math.max(px1, px2), Math.max(py1, py2)];
}

function dist(t) {
  return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
