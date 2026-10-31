// night.js: night mode for every page in the house. One file, included by each page's <head>.
// Default follows the reader's system setting (prefers-color-scheme). The ☾/☀ button overrides it;
// the choice is kept in this browser's localStorage under "night" and never leaves the browser.
// Pages that are already dark (body background luminance < 0.35) are left alone.
// How: invert the light page and rotate hues back, then re-invert photos and video so they look right.
// — Modulo, 2026-10-18
(function () {
  var KEY = 'night', root = document.documentElement;
  var css = document.createElement('style');
  css.textContent =
    'html.night{filter:invert(1) hue-rotate(180deg);background:#fff}' +
    'html.night img:not([src$=".svg"]),html.night video,html.night picture,html.night iframe,html.night [data-night-keep]{filter:invert(1) hue-rotate(180deg)}' +
    '#night-toggle{position:fixed;right:.75em;bottom:.75em;z-index:2147483647;font:16px/1 system-ui,sans-serif;' +
    'width:2.2em;height:2.2em;border-radius:50%;border:1px solid #8888;background:#fff;color:#222;cursor:pointer;opacity:.75}' +
    '#night-toggle:hover,#night-toggle:focus{opacity:1}' +
    'html.native-dark #night-toggle{display:none}' +
    '@media print{#night-toggle{display:none}html.night{filter:none}}';
  (document.head || root).appendChild(css);

  function stored() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function want() {
    var s = stored();
    if (s === 'on') return true;
    if (s === 'off') return false;
    return !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
  }
  function lum(c) {
    var m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/.exec(c || '');
    if (!m || m[4] === '0') return null;            // transparent: no answer
    function ch(v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
    return 0.2126 * ch(+m[1]) + 0.7152 * ch(+m[2]) + 0.0722 * ch(+m[3]);
  }
  var nativeDark = false;
  function apply() { root.classList.toggle('night', want() && !nativeDark); label(); }
  function label() {
    var b = document.getElementById('night-toggle'); if (!b) return;
    var on = root.classList.contains('night');
    b.textContent = on ? '☀' : '☾';
    b.title = b.ariaLabel = on ? 'Day mode' : 'Night mode';
  }
  apply();                                            // early, before first paint, to avoid a white flash

  function ready() {
    // Measure the page's own background with night off. Already dark: leave it be.
    var was = root.classList.contains('night');
    root.classList.remove('night');
    var l = lum(getComputedStyle(document.body).backgroundColor);
    if (l === null) l = lum(getComputedStyle(root).backgroundColor);
    nativeDark = l !== null && l < 0.35;
    if (nativeDark) root.classList.add('native-dark');
    if (was || want()) apply();
    var b = document.createElement('button');
    b.id = 'night-toggle'; b.type = 'button';
    b.onclick = function () {
      var on = !root.classList.contains('night');
      try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch (e) {}
      root.classList.toggle('night', on); label();
    };
    document.body.appendChild(b); label();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready); else ready();
  if (window.matchMedia) {
    var mq = matchMedia('(prefers-color-scheme: dark)');
    (mq.addEventListener ? mq.addEventListener.bind(mq, 'change') : mq.addListener.bind(mq))(function () { if (!stored()) apply(); });
  }
})();
