// HUMAN MACHINERY — shared exhibit runtime.
// Stats are anonymous aggregate counters: each event bumps one (exhibit,
// bucket) row server-side. No ids, no cookies, nothing raw — exhibits bin
// values client-side before tracking. Fire-and-forget; failures are silent
// (the site is fully functional with the API down).

window.Human = (() => {
  const API = '/api/human';

  function track(exhibit, bucket) {
    const body = JSON.stringify({ exhibit, bucket });
    try {
      if (navigator.sendBeacon) {
        const sent = navigator.sendBeacon(`${API}/event`, new Blob([body], { type: 'application/json' }));
        if (sent) return;
      }
    } catch (e) { /* fall through to fetch */ }
    try { fetch(`${API}/event`, { method: 'POST', body, headers: { 'content-type': 'application/json' }, keepalive: true }); } catch (e) { /* stats are optional */ }
  }

  async function summary(exhibit) {
    try {
      const r = await fetch(`${API}/summary?exhibit=${encodeURIComponent(exhibit)}`);
      if (!r.ok) return null;
      return await r.json();
    } catch (e) { return null; }
  }

  async function all() {
    try {
      const r = await fetch(`${API}/all`);
      if (!r.ok) return null;
      return await r.json();
    } catch (e) { return null; }
  }

  const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('en-US'));
  const pct = (n, total) => (total > 0 ? Math.round((100 * n) / total) : 0);

  // A labelled CSS bar. opts: {you, ghost, right}
  function bar(label, n, total, opts = {}) {
    const p = pct(n, total);
    const cls = opts.you ? 'bar-fill you' : opts.ghost ? 'bar-fill ghost' : 'bar-fill';
    const right = opts.right != null ? opts.right : `${p}%`;
    return `<div class="bar-row">
      <div class="bar-label"><span>${label}</span><span><b>${right}</b>${opts.noCount ? '' : ` · ${fmt(n)}`}</span></div>
      <div class="bar-track"><div class="${cls}" style="width:${Math.max(p, 1)}%"></div></div>
    </div>`;
  }

  function badgeHTML(badge) {
    const label = badge.replace(/-/g, ' ');
    return `<span class="badge ${badge}">${label}</span>`;
  }

  function citeHTML(citations) {
    return `<h3>Sources</h3><ul class="cites">` + citations.map((c) =>
      `<li>${c.label} <a class="doi" href="${c.url}">${c.url.replace('https://doi.org/', 'doi:')}</a></li>`
    ).join('') + `</ul>`;
  }

  function exhibit(slug) {
    return (window.HUMAN_EXHIBITS || []).find((e) => e.slug === slug);
  }

  function wormholeHTML(currentSlug) {
    const me = exhibit(currentSlug);
    if (!me) return '';
    const links = me.related.map((s) => exhibit(s)).filter(Boolean);
    return `<h2>Wormholes</h2><div class="wormhole">` + links.map((e) =>
      `<a href="/exhibits/${e.slug}/"><span class="wt">${e.title}</span><div class="wh">${e.hook}</div></a>`
    ).join('') + `</div>`;
  }

  // Shared page furniture for every exhibit: crumb + footer + reveal scaffold.
  function crumbHTML(title) {
    return `<nav class="crumb">
      <a href="https://mino.mobi">mino.mobi</a><span class="sep">/</span>
      <a href="/">human machinery</a><span class="sep">/</span>
      <span class="here">${title.toLowerCase()}</span>
    </nav>`;
  }

  function footerHTML() {
    return `<footer>
      human.mino.mobi — an arcade of user error ·
      <a href="/stats/">live stats</a> ·
      <a href="/about/sources/">sources &amp; badges</a> ·
      a <a href="https://mino.mobi">minomobi</a> property
    </footer>`;
  }

  return { track, summary, all, fmt, pct, bar, badgeHTML, citeHTML, exhibit, wormholeHTML, crumbHTML, footerHTML };
})();
