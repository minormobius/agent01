/**
 * Playing a video in the feed.
 *
 * Bluesky serves video as **HLS** — an `.m3u8` playlist of segments, not a
 * file. Exactly one family of browsers can play that from a plain
 * `<video src>`:
 *
 *   | browser                    | native HLS |
 *   |----------------------------|------------|
 *   | Safari, iOS (every engine) | YES        |
 *   | Chrome (desktop, Android)  | no         |
 *   | Firefox                    | no         |
 *   | Edge                       | no         |
 *
 * This surface used to ship the Safari path only, on the reasoning that the
 * mobile target is iOS and 300 KB of library for a fallback was not worth it.
 * That reasoning had a hole in it: on every other browser the poster appeared,
 * the play button appeared, and pressing it did NOTHING — no error, no
 * message. A control that visibly exists and silently refuses is worse than no
 * control, and "videos don't play" is what it looks like from the outside.
 *
 * So hls.js is loaded — but on the same terms as pdf.js:
 *
 *   - **only where it is needed.** Safari is served natively and never
 *     downloads it. Checked with the browser's own `canPlayType`, not a
 *     user-agent string.
 *   - **only when a video is actually played.** It is a dynamic `import()`
 *     behind a tap, never in the app shell, so a reader who scrolls past a
 *     video pays nothing.
 *   - **and it degrades.** If the import fails the ▶ open video link is still
 *     there, which is where this started.
 */

/** The library, imported at most once per session. */
let hlsLib = null;

const VENDOR = '/lib/vendor/hls/hls.min.js';

/**
 * Can this browser play an HLS playlist from a bare `<video src>`?
 *
 * `canPlayType` returns '', 'maybe' or 'probably' — anything non-empty counts.
 * Both MIME spellings are asked for: Safari answers to the `application/`
 * form, some older WebKit builds only to the `vnd.apple` alias.
 */
let native = null;
export function nativeHls() {
  if (native !== null) return native;
  if (typeof document === 'undefined') return (native = false);
  const v = document.createElement('video');
  native = Boolean(v.canPlayType('application/vnd.apple.mpegurl')
    || v.canPlayType('application/x-mpegURL'));
  return native;
}

async function lib() {
  if (hlsLib) return hlsLib;
  // hls.js ships UMD, not ESM: importing it defines `window.Hls` as a side
  // effect rather than exporting anything, so the module's own namespace is
  // empty and the global is the real result.
  await import(/* @vite-ignore */ VENDOR);
  hlsLib = globalThis.Hls;
  if (!hlsLib?.isSupported?.()) throw new Error('hls.js did not load');
  return hlsLib;
}

/**
 * Every element this has attached to. A Set, not a WeakSet, because these have
 * to be ENUMERATED to be cleaned up — see `reap()`. The entries are removed
 * there, so this does not grow without bound.
 */
const attached = new Set();

/**
 * Make one `<video data-hls="…">` playable, then start it.
 *
 * @param {HTMLVideoElement} video
 * @returns {Promise<void>}
 */
export async function play(video) {
  const src = video.dataset.hls;
  if (!src) return video.play().catch(() => {});

  if (!attached.has(video)) {
    const Hls = await lib();
    const hls = new Hls({
      // The reader asked for this one video. Nothing should be fetched before
      // that tap, and nothing after it should chase a level it cannot use.
      maxBufferLength: 30,
      capLevelToPlayerSize: true,
      startLevel: -1,
    });
    hls.loadSource(src);
    hls.attachMedia(video);
    attached.add(video);
    // The element outlives the feed's DOM ring buffer, so the demuxer worker
    // has to be told when its video is gone or it keeps fetching segments for
    // something nobody can see.
    video._hls = hls;

    // Resolve on the MANIFEST, not on playback. Three reasons, and the middle
    // one is the bug this was written against:
    //   - the manifest is what proves the library attached and the stream is
    //     real; everything after it is the player's own business;
    //   - `video.play()` does NOT reject when a stream stalls, it simply never
    //     settles. Awaiting it left the ▶ button reading "loading…" forever on
    //     a video that was never going to start — a spinner with no end state,
    //     which is worse than the silent play button it replaced;
    //   - and a fatal error has to resolve too, or the same thing happens.
    // The timeout is the backstop for a manifest that neither parses nor errors.
    await new Promise((resolve) => {
      const done = () => { clearTimeout(timer); resolve(); };
      const timer = setTimeout(done, 12_000);
      hls.on(Hls.Events.MANIFEST_PARSED, done);
      hls.on(Hls.Events.ERROR, (_e, data) => { if (data?.fatal) done(); });
    });
  }
  // Started, not awaited — see above. The click is the user gesture that makes
  // this allowed, so it must be called synchronously from here.
  video.play().catch(() => {});
}

/** Destroy the hls.js instance behind any video no longer in the document. */
function reap() {
  for (const v of [...attached]) {
    if (v.isConnected) continue;
    try { v._hls?.destroy(); } catch { /* already gone */ }
    v._hls = null;
    attached.delete(v);
  }
}

/**
 * Wire the whole document, once.
 *
 * Delegated, because the feed is a ring buffer — posts are added and trimmed
 * continuously and a listener per video would leak one per post.
 */
export function installVideo() {
  if (typeof document === 'undefined') return;

  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-vplay]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();          // never let this bubble into "open the thread"
    const cell = btn.closest('.media.video');
    const video = cell?.querySelector('video');
    if (!video) return;
    btn.classList.add('loading');
    btn.textContent = 'loading…';
    try {
      video.controls = true;
      await play(video);
      btn.remove();
    } catch {
      // The ▶ open video link beneath is the honest fallback, and saying so
      // beats leaving a spinner that never resolves.
      btn.textContent = 'cannot play here — use ▶ open video';
    }
  }, true);

  // A video trimmed out of the feed's ring buffer keeps its demuxer worker and
  // keeps fetching segments for something nobody can see. Nothing else in the
  // app would ever tell it to stop.
  //
  // It has to be enumerated from our OWN set: once the element is detached,
  // `document.querySelectorAll('video')` cannot see it any more, which is
  // exactly when it needs collecting.
  setInterval(reap, 30_000);
  document.addEventListener('visibilitychange', () => { if (document.hidden) reap(); });
}
