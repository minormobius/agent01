/**
 * io.mino.mobi stumble bar — opt-in snippet (phase 2).
 *
 * Drop ONE tag into a mino.mobi site to give it the persistent stumble bar
 * WITHOUT the iframe wrapper (better UX: no frame, no CSP fights, OAuth works):
 *
 *   <script src="https://io.mino.mobi/stumble-bar.js" defer></script>
 *
 * It only shows itself when the visitor arrived via a stumble (a sessionStorage
 * flag set on click, or a ?stumble=1 marker), and re-pins across in-site
 * navigation so it "can't be gotten rid of" for the duration of a stumble run.
 * The iframe wrapper at /stumble covers every other (incl. third-party) site;
 * this snippet is the nicer experience for sites we control, adopted gradually.
 */
(function () {
  var ORIGIN = 'https://io.mino.mobi';
  var FLAG = 'mino_stumble_active';

  // Activate if arriving from a stumble, or if the flag is already set this session.
  var params = new URLSearchParams(location.search);
  if (params.get('stumble') === '1') {
    try { sessionStorage.setItem(FLAG, '1'); } catch (e) {}
    // clean the marker out of the URL
    params.delete('stumble');
    var q = params.toString();
    history.replaceState({}, '', location.pathname + (q ? '?' + q : '') + location.hash);
  }
  var active = false;
  try { active = sessionStorage.getItem(FLAG) === '1'; } catch (e) {}
  if (!active) return;

  function host() { try { return location.host; } catch (e) { return ''; } }
  function compose(kind) {
    var p = new URLSearchParams({ compose: kind, site: host(), url: location.href });
    return ORIGIN + '/?' + p.toString();
  }

  function build() {
    if (document.getElementById('mino-stumble-bar')) return;
    var css = document.createElement('style');
    css.textContent =
      '#mino-stumble-bar{position:fixed;top:0;left:0;right:0;height:46px;z-index:2147483647;' +
        'display:flex;align-items:center;gap:8px;padding:0 12px;background:#17171c;color:#e8e6e0;' +
        'border-bottom:1px solid #2a2a30;font:600 13px/1 ui-monospace,SFMono-Regular,Menlo,monospace;' +
        'box-shadow:0 2px 12px rgba(0,0,0,.4)}' +
      '#mino-stumble-bar a,#mino-stumble-bar button{font:inherit;cursor:pointer;text-decoration:none;' +
        'border-radius:4px;padding:6px 10px;border:1px solid #2a2a30;background:transparent;color:#8a8780}' +
      '#mino-stumble-bar .gold{background:#d4a857;color:#1a1a1a;border-color:#d4a857}' +
      '#mino-stumble-bar .sp{flex:1}' +
      '#mino-stumble-bar .bd{color:#d4a857}' +
      'body{padding-top:46px!important}';
    document.head.appendChild(css);

    var bar = document.createElement('div');
    bar.id = 'mino-stumble-bar';
    bar.innerHTML =
      '<a href="' + ORIGIN + '" title="io.mino.mobi">io<span class="bd">.</span></a>' +
      '<span class="sp"></span>' +
      '<button class="gold" id="msb-next">🎲 Next</button>' +
      '<a id="msb-bug" title="Report a bug">🐞</a>' +
      '<a id="msb-feat" title="Request a feature">💡</a>' +
      '<button id="msb-stop" title="End stumbling">✕</button>';
    document.body.appendChild(bar);

    document.getElementById('msb-bug').href = compose('bug');
    document.getElementById('msb-feat').href = compose('feature');
    document.getElementById('msb-bug').target = '_blank';
    document.getElementById('msb-feat').target = '_blank';
    document.getElementById('msb-next').onclick = function () {
      location.href = ORIGIN + '/go?exclude=' + encodeURIComponent(location.origin + location.pathname);
    };
    document.getElementById('msb-stop').onclick = function () {
      try { sessionStorage.removeItem(FLAG); } catch (e) {}
      bar.remove();
      document.body.style.paddingTop = '';
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
