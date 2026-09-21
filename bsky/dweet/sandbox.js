/**
 * The execution boundary for a dweet.
 *
 * A dweet is 140 characters of a stranger's JavaScript, and this surface runs
 * it. On dwitter.net that is merely bold; HERE it would be an account
 * takeover, because of three facts about our own infrastructure:
 *
 *   workers/auth/src/index.ts:132  the SSO cookie is `Domain=.mino.mobi`
 *   workers/auth/src/index.ts:57   the origin allowlist has a `*.mino.mobi` wildcard
 *   workers/auth/src/index.ts:431  /pds/repo/createRecord is `needsAuth: true`
 *
 * So a dweet running in THIS document could post to the reader's PDS as the
 * reader, across every collection in WRITE_COLLECTIONS:
 *
 *   fetch('https://auth.mino.mobi/pds/repo/createRecord',
 *         {method:'POST',credentials:'include',body:…})
 *
 * `HttpOnly` does not help — the code never reads the cookie, it just makes the
 * browser send it. `SameSite=Lax` does not help — bsky.mino.mobi to
 * auth.mino.mobi is same-site. A dweet whose payload is *posting itself* would
 * be a worm with a feed for a vector.
 *
 * Hence four defences, in the order they matter:
 *
 *  1. OPAQUE ORIGIN. The frame is `sandbox="allow-scripts"` and **never**
 *     `allow-same-origin`. That pair is not a stricter sandbox, it is no
 *     sandbox: a frame holding both can reach into its own parent and delete
 *     the sandbox attribute. With allow-scripts alone the frame is an opaque
 *     origin — not same-site with anything, so the SSO cookie is never
 *     attached and auth.mino.mobi's allowlist rejects its `Origin: null`.
 *
 *  2. CSP `default-src 'none'`. Belt to the sandbox's braces: no fetch, no
 *     WebSocket, no beacon, no image — so a dweet cannot phone home even with
 *     nothing to steal. `'unsafe-eval'` is present and is NOT a weakening:
 *     arbitrary evaluation is the product. The CSP is here for the network.
 *     A blob: Worker inherits this policy, which is what makes defence 4 safe.
 *
 *  3. NO INJECTION SURFACE. `harnessDoc()` is a constant, and so is the worker
 *     program inside it. The dweet source is never interpolated into either —
 *     it arrives by postMessage after load. A dweet containing `</script>` is
 *     therefore uninteresting rather than a breakout, and there is no escaping
 *     routine to get subtly wrong.
 *
 *  4. A TERMINABLE THREAD. `while(1)` is seven characters, and removing a
 *     hung iframe does NOT stop it — see below. The dweet therefore runs in a
 *     Worker on an OffscreenCanvas, because `Worker.terminate()` is the only
 *     primitive in the platform that reliably stops a runaway loop.
 *
 * ─── why the dweet runs in a Worker ─────────────────────────────────────────
 *
 * The obvious design is to run the dweet on the frame's own main thread and
 * have the parent remove the iframe when it stops responding. That was the
 * first design here, and it is broken in a way that only shows up on the
 * second dweet. Measured in Chromium:
 *
 *   while(1) ; then any other dweet  ->  the SECOND one is killed too
 *   while(1) ; then a plain js dweet ->  also killed
 *   a plain js dweet, then anything  ->  fine
 *
 * Removing the element does not stop the script. The runaway keeps its
 * renderer thread, and every subsequently created sandboxed frame is allocated
 * into that same starved process — so one nine-character dweet poisons every
 * dweet for the rest of the session. The watchdog removed the element and
 * reported success while the page was already dead.
 *
 * `terminate()` genuinely aborts a worker mid-loop. So the frame's main thread
 * stays responsive, the process is never starved, and a hung dweet costs
 * exactly one worker. Verified: fetch is still blocked inside the worker (the
 * blob: worker inherits `default-src 'none'`), OffscreenCanvas transfers and
 * draws, and the frame answers normally while its worker spins.
 *
 * Pacing is driven from the frame, one tick per rAF, and the next tick is only
 * sent once the worker has acknowledged the last. That bounds the message
 * queue and makes liveness exact: a worker that has not acked within
 * WATCHDOG_MS is not slow, it is stuck.
 *
 * Invariants 1-3 are asserted by sandbox.selftest.mjs, which preflight runs.
 */

/**
 * The only sandbox tokens this surface will ever emit.
 *
 * Adding 'allow-same-origin' here defeats the whole file. It is a named
 * constant so that the selftest can assert on it rather than on a string
 * buried in a DOM call.
 */
export const SANDBOX_TOKENS = Object.freeze(['allow-scripts']);

/**
 * The frame's own CSP. `default-src 'none'` with no `connect-src` is the
 * load-bearing half; everything else just lets the harness paint.
 *
 * `blob:` appears in script-src/worker-src so the harness can spawn its
 * terminable worker. That is not a hole: the worker inherits this same policy,
 * so `default-src 'none'` still blocks its network — measured, not assumed.
 */
export const FRAME_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline' 'unsafe-eval' blob:",
  "worker-src blob:",
  "style-src 'unsafe-inline'",
].join('; ');

/** Dwitter's limit, kept deliberately. See CLAUDE.md for why. */
export const MAX_CHARS = 140;

/** Canvas size, also dwitter's. */
export const WIDTH = 1920;
export const HEIGHT = 1080;

export const LANGS = Object.freeze(['js', 'glsl']);

/**
 * How often the frame relays liveness UP to the embedder, in milliseconds.
 * The frame<->worker tick is per animation frame; this only throttles the
 * report, so the parent is not handed 60 messages a second per card.
 */
export const BEAT_MS = 250;

/**
 * No acknowledgement from the worker for this long and it is terminated.
 *
 * Deliberately a clock, not a frame count. An earlier version beat every 30
 * frames, which measures progress in the wrong unit: a legitimate but
 * expensive dweet — a full-screen shader under software rasterisation, or
 * anything on a weak GPU — misses that deadline while working perfectly. A
 * clock separates "slow" from "stuck", which is the only distinction the
 * watchdog is entitled to make.
 */
export const WATCHDOG_MS = 2500;

/**
 * Count the way dwitter counts: user-perceived characters, not UTF-16 code
 * units. `'👩‍👩‍👧'.length` is 8 and `[...'👩‍👩‍👧'].length` is 5, but it is one
 * character to the person typing it and one grapheme to the lexicon's
 * `maxGraphemes`. Intl.Segmenter is the only one of the three that agrees.
 */
export function countChars(src) {
  const s = String(src ?? '');
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    let n = 0;
    for (const _ of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s)) n++;
    return n;
  }
  return [...s].length;
}

/**
 * Validate a dweet before it is stored or run. Returns `{ok}` or
 * `{ok:false, error}` — never throws, because it runs on every keystroke in
 * the composer.
 */
export function validate(dweet) {
  const src = String(dweet?.src ?? '');
  const lang = String(dweet?.lang ?? 'js');
  if (!LANGS.includes(lang)) return { ok: false, error: `unknown lang: ${lang}` };
  if (!src.trim()) return { ok: false, error: 'empty' };
  const n = countChars(src);
  if (n > MAX_CHARS) return { ok: false, error: `${n}/${MAX_CHARS} chars` };
  return { ok: true, chars: n };
}

/**
 * The worker program. CONSTANT — the dweet arrives by postMessage.
 *
 * Workers have no requestAnimationFrame, which is why the frame drives the
 * clock and this only ever draws one tick on request.
 */
const WORKER_SRC = `
'use strict';
var canvas = null, mode = 'js', dead = false;
var x = null, gl = null, uT = null, uR = null, u = null;
var S = Math.sin, C = Math.cos, T = Math.tan;
function R(r, g, b, a) {
  return 'rgba(' + (r|0) + ',' + (g|0) + ',' + (b|0) + ',' + (a === undefined ? 1 : a) + ')';
}
function fail(stage, e) {
  dead = true;
  self.postMessage({ type: 'fail', stage: stage, message: String((e && e.message) || e) });
}

var VERT = '#version 300 es\\nin vec2 p;void main(){gl_Position=vec4(p,0,1);}';

function initGL(src) {
  gl = canvas.getContext('webgl2', { antialias: false });
  if (!gl) return fail('compile', new Error('WebGL2 unavailable here'));
  var frag = '#version 300 es\\nprecision highp float;uniform float t;uniform vec2 r;out vec4 o;'
           + 'void main(){vec2 FC=gl_FragCoord.xy;' + src + '}';
  function sh(type, text) {
    var s = gl.createShader(type);
    gl.shaderSource(s, text); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error((gl.getShaderInfoLog(s) || 'shader error').trim().split('\\n')[0]);
    }
    return s;
  }
  var prog;
  try {
    prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, frag));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error((gl.getProgramInfoLog(prog) || 'link error').trim());
    }
  } catch (e) { return fail('compile', e); }
  gl.useProgram(prog);
  var buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  // One oversized triangle covers the clip square with no index buffer.
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
  var loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  uT = gl.getUniformLocation(prog, 't');
  uR = gl.getUniformLocation(prog, 'r');
  gl.viewport(0, 0, canvas.width, canvas.height);
}

function draw(f) {
  var t = f / 60;
  if (mode === 'glsl') {
    gl.uniform1f(uT, t);
    gl.uniform2f(uR, canvas.width, canvas.height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  } else {
    u(t, S, C, T, R, canvas, x);
  }
}

self.onmessage = function (e) {
  var d = e.data;
  if (!d || typeof d !== 'object') return;

  if (d.type === 'init') {
    canvas = d.canvas;
    mode = d.lang === 'glsl' ? 'glsl' : 'js';
    if (mode === 'glsl') { initGL(d.src); }
    else {
      x = canvas.getContext('2d');
      try { u = new Function('t','S','C','T','R','c','x', d.src); }
      catch (err) { return fail('compile', err); }
    }
    self.postMessage({ type: 'ready' });
    return;
  }

  if (d.type === 'tick') {
    if (dead) return;
    try { draw(d.f); }
    catch (err) { return fail('runtime', err); }
    // The ack IS the liveness signal. The frame will not send another tick
    // until it arrives, which bounds the queue and makes a stall unambiguous.
    self.postMessage({ type: 'drew', f: d.f });
  }
};
`;

/**
 * The sandboxed document. CONSTANT — no argument, no interpolation, nothing of
 * the dweet in it. It boots a canvas, hands it to a worker, drives the clock,
 * and kills the worker if it stops answering.
 *
 * Written as an ES5-ish IIFE on purpose: it is a string, so a syntax error
 * here is a blank frame at runtime rather than a build failure.
 */
export function harnessDoc() {
  return `<!doctype html>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${FRAME_CSP}">
<style>
  html,body{margin:0;height:100%;background:#000;overflow:hidden}
  canvas{display:block;width:100%;height:100%;object-fit:contain}
</style>
<canvas id="c" width="${WIDTH}" height="${HEIGHT}"></canvas>
<script>
(function(){
  'use strict';
  var c = document.getElementById('c');
  var started = false, stopped = false, paused = false, worker = null;
  var f = 0, pending = false, lastAck = 0, lastRelay = 0, raf = 0;

  function up(m){ try { window.parent.postMessage(m, '*'); } catch (e) {} }
  function die(stage, message){
    stopped = true;
    if (raf) cancelAnimationFrame(raf);
    if (worker) { try { worker.terminate(); } catch (e) {} worker = null; }
    up({ type:'dweet:error', stage: stage, message: message });
  }

  function run(src, lang){
    var off;
    try { off = c.transferControlToOffscreen(); }
    catch (e) { return die('compile', 'OffscreenCanvas unavailable: ' + e.message); }

    try {
      var url = URL.createObjectURL(new Blob([${JSON.stringify(WORKER_SRC)}], { type:'text/javascript' }));
      worker = new Worker(url);
    } catch (e) { return die('compile', 'worker blocked: ' + e.message); }

    worker.onerror = function(e){ die('runtime', String(e.message || 'worker error')); };
    worker.onmessage = function(e){
      var d = e.data;
      if (!d) return;
      if (d.type === 'fail') return die(d.stage, d.message);
      if (d.type === 'ready') { lastAck = Date.now(); tick(); return; }
      if (d.type === 'drew') {
        pending = false;
        lastAck = Date.now();
        var n = lastAck;
        if (n - lastRelay > ${BEAT_MS}) { lastRelay = n; up({ type:'dweet:beat', frame: d.f }); }
      }
    };

    worker.postMessage({ type:'init', canvas: off, src: src, lang: lang }, [off]);
    lastAck = Date.now();
    // Watch from HERE, not from the embedder: this thread stays responsive
    // however hard the worker spins, so it is the one that can act.
    setInterval(function(){
      if (stopped || paused || !worker) return;
      if (Date.now() - lastAck < ${WATCHDOG_MS}) return;
      die('hang', 'stopped — this dweet did not yield for ${WATCHDOG_MS / 1000}s');
    }, 500);
  }

  function tick(){
    if (stopped || paused || !worker) return;
    raf = requestAnimationFrame(tick);
    if (pending) return;          // the worker has not finished the last frame
    pending = true;
    worker.postMessage({ type:'tick', f: f++ });
  }

  window.addEventListener('message', function(e){
    // Only the embedder talks to us. Without this check any frame that got a
    // handle to this one could inject a different program.
    if (e.source !== window.parent) return;
    var d = e.data;
    if (!d || typeof d !== 'object') return;

    // PAUSE is not teardown. A card scrolled out of view is paused and
    // resumed constantly; terminating its worker there would mean a dweet
    // could never come back, since a terminated worker cannot be restarted.
    if (d.type === 'dweet:pause') {
      paused = true;
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      return;
    }
    if (d.type === 'dweet:resume') {
      if (!started || stopped || !paused) return;
      paused = false;
      pending = false;              // a tick in flight at pause time is moot
      lastAck = Date.now();         // do not count paused time against it
      tick();
      return;
    }
    // STOP is teardown: the frame is going away and the worker must die with
    // it, whatever it is doing. This is the only call that reliably stops a
    // runaway, so it runs before the element is removed, not after.
    if (d.type === 'dweet:stop') {
      stopped = true;
      if (raf) cancelAnimationFrame(raf);
      if (worker) { try { worker.terminate(); } catch (err) {} worker = null; }
      return;
    }
    if (d.type !== 'dweet:run' || started) return;
    started = true;
    if (typeof d.src !== 'string') return die('compile', 'no source');
    run(d.src, d.lang === 'glsl' ? 'glsl' : 'js');
  });

  up({ type: 'dweet:ready' });
})();
<\/script>`;
}

/**
 * One running dweet.
 *
 * Deliberately not reusable across sources: a frame runs exactly one program
 * for its whole life. Re-running means a new frame, which is also the cheapest
 * way to guarantee a dweet cannot leave state behind for the next one.
 */
export class DweetFrame {
  /**
   * @param {object} opts
   * @param {string} opts.src                the dweet
   * @param {'js'|'glsl'} [opts.lang]
   * @param {(e:{stage:string,message:string}) => void} [opts.onError]
   * @param {() => void} [opts.onHang]       the frame never booted at all
   * @param {() => void} [opts.onLive]       first frame painted; fired once
   */
  constructor(opts) {
    this.opts = opts;
    this.lang = opts.lang === 'glsl' ? 'glsl' : 'js';
    this.el = null;
    this.running = false;
    this.lastBeat = 0;
    this._timer = 0;
    this._launched = false;
    this._live = false;
    this._onMessage = this._onMessage.bind(this);
  }

  /** Build the iframe and attach it. Does not start the program. */
  mount(container) {
    const el = document.createElement('iframe');
    // The two lines this whole file exists for.
    el.setAttribute('sandbox', SANDBOX_TOKENS.join(' '));
    el.setAttribute('referrerpolicy', 'no-referrer');
    el.setAttribute('title', 'dweet');
    el.className = 'dweet-frame';
    el.srcdoc = harnessDoc();
    this.el = el;
    window.addEventListener('message', this._onMessage);
    container.appendChild(el);
    return this;
  }

  /** Hand the frame its program. Idempotent. */
  start() {
    if (this.running || !this.el) return this;
    this.running = true;
    this.lastBeat = Date.now();

    // Already launched once: this is the observer scrolling it back into view,
    // so resume the existing worker rather than trying to run a second program
    // in a frame that will refuse it.
    if (this._launched) {
      try { this.el.contentWindow?.postMessage({ type: 'dweet:resume' }, '*'); } catch {}
      clearInterval(this._timer);
      this._timer = setInterval(() => this._check(), 500);
      return this;
    }
    this._launched = true;

    const post = () => {
      if (!this.el?.contentWindow) return;
      this.el.contentWindow.postMessage(
        { type: 'dweet:run', src: this.opts.src, lang: this.lang },
        '*', // an opaque origin cannot be named; the source is public anyway
      );
    };
    // The frame announces itself with dweet:ready, but a srcdoc frame can be
    // ready before the listener is attached. Post on load as well and let the
    // frame's `started` flag drop the duplicate.
    if (this.el.contentWindow) post();
    this.el.addEventListener('load', post, { once: true });

    // A BACKSTOP only. The frame kills its own worker; this catches a frame
    // that never booted at all (blocked srcdoc, no OffscreenCanvas, a harness
    // that threw before its listener was installed).
    clearInterval(this._timer);
    this._timer = setInterval(() => this._check(), 500);
    return this;
  }

  _check() {
    if (!this.running) return;
    if (Date.now() - this.lastBeat < WATCHDOG_MS * 2) return;
    this.destroy();
    this.opts.onHang?.();
  }

  _onMessage(e) {
    // Any page can postMessage to us. Only our own frame is listened to.
    if (!this.el || e.source !== this.el.contentWindow) return;
    const d = e.data;
    if (!d || typeof d !== 'object') return;
    if (d.type === 'dweet:beat' || d.type === 'dweet:ready') {
      this.lastBeat = Date.now();
      // A beat means the worker acknowledged a drawn frame, so there are
      // pixels now — the right moment to drop any placeholder, and the only
      // signal that distinguishes "running" from "mounted but blank".
      if (d.type === 'dweet:beat' && !this._live) {
        this._live = true;
        this.opts.onLive?.();
      }
      return;
    }
    if (d.type === 'dweet:error') {
      this.running = false;
      clearInterval(this._timer);
      this.opts.onError?.({ stage: d.stage, message: d.message });
    }
  }

  /** Scrolled out of view: stop burning frames, keep the worker. */
  stop() {
    this.running = false;
    clearInterval(this._timer);
    try { this.el?.contentWindow?.postMessage({ type: 'dweet:pause' }, '*'); } catch {}
    return this;
  }

  /**
   * Gone for good. The kill goes FIRST and the element is removed after,
   * because removing the iframe is not what stops a runaway worker —
   * terminate() is, and only the frame's own thread can call it.
   */
  destroy() {
    this.running = false;
    clearInterval(this._timer);
    try { this.el?.contentWindow?.postMessage({ type: 'dweet:stop' }, '*'); } catch {}
    window.removeEventListener('message', this._onMessage);
    const el = this.el;
    this.el = null;
    // One turn of the event loop so the frame can act on dweet:stop before its
    // document is discarded.
    setTimeout(() => el?.remove(), 0);
  }
}
