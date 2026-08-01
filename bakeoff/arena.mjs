// arena.mjs — the pages a human actually looks at.
//
// An arena is not a contact sheet. Eleven WebGPU games squeezed into eleven
// 440px iframes on one scrolling page is a way to confirm they exist, not a way
// to play any of them. So this builds TWO kinds of page:
//
//   index.html          a LANDING page — what the run was, and a card per entry
//   play/<cell>/        one FULL-VIEWPORT page per entry, with prev/next
//
// Entries themselves are never touched. They stay byte-identical to what the
// agent produced, which is the whole point of a comparison; the navigation
// lives in a wrapper around them.
//
// THE WRAPPER IS ALSO THE SECURITY BOUNDARY. Entries are model-written code on
// os.mino.mobi, which carries the `.mino.mobi` SSO cookie and an Anthropic key
// in localStorage. The `_headers` CSP that was supposed to cover direct
// navigation has NOT been observed working (see os/public/_headers), so the
// iframe sandbox here is the only protection actually confirmed to be in
// place. Making the wrapper the normal way to play means the normal path is
// the safe one.
//
//   sandbox="allow-scripts allow-pointer-lock"   ← NO allow-same-origin.
//
// That combination is deliberate and load-bearing: the entry gets script
// execution and mouse-look (these are first-person games; without
// allow-pointer-lock they are unplayable), but stays in an OPAQUE origin where
// document.cookie is empty and localStorage throws.
//
// The cost is real and worth stating: an entry that saves a best time to
// localStorage cannot, inside the sandbox. Games are expected to tolerate it —
// the brief asked for a best time in the state contract, not a durable one —
// but if one misbehaves, that is why. Each play page carries a clearly labelled
// "open raw" escape hatch that drops the sandbox, for when you want the entry
// exactly as it would run standalone.

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const GATE_ORDER = ['boots', 'draws', 'animated', 'autostart', 'physics'];
const SKEL_ORDER = ['clock', 'laps', 'best', 'intact'];

// Average "would you want to play this" across the panel's lenses, if judged.
function panelScore(judges, cell) {
  const rs = (judges?.reviews || []).filter((r) => r.cell === cell && r.ok);
  const hints = rs.map((r) => r.ok.rank_hint).filter((n) => typeof n === 'number');
  if (!hints.length) return null;
  return { avg: hints.reduce((a, b) => a + b, 0) / hints.length, n: hints.length, reviews: rs };
}

// First line of NOTES.md that looks like a title, for the card.
function entryTitle(notes) {
  if (!notes) return null;
  const h = notes.split('\n').find((l) => /^#\s+\S/.test(l));
  if (!h) return null;
  // Several agents titled their notes "<name> — notes" / "<name> notes"; the
  // suffix is about the document, not the game, and reads badly on a card.
  return h.replace(/^#\s+/, '').replace(/\s*[—–-]?\s*notes\s*$/i, '').trim() || null;
}

// The bit of NOTES.md where the agent explains its fork, which is the single
// most interesting thing on the card.
function forkBlurb(notes) {
  if (!notes) return null;
  const lines = notes.split('\n');
  const i = lines.findIndex((l) => /^#{2,3}\s+.*(fork|chose|choice)/i.test(l));
  if (i < 0) return null;
  const body = [];
  for (let j = i + 1; j < lines.length && body.length < 6; j++) {
    if (/^#{1,3}\s/.test(lines[j])) break;
    if (lines[j].trim()) body.push(lines[j].trim());
  }
  return body.join(' ').slice(0, 320) || null;
}

const SHARED_CSS = `
  :root { --bg:#0b0b10; --ink:#e6e6f0; --soft:#8a8aa0; --line:#23232e; --accent:#7aa2ff; --ok:#4ec9a0; --no:#ff6b6b; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--ink);
         font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
         -webkit-font-smoothing:antialiased; }
  a { color:var(--accent); }
`;

export function landingHtml({ runId, brief, entries, judges }) {
  const ranked = [...entries].sort((a, b) => {
    const pa = panelScore(judges, a.cell)?.avg ?? -1;
    const pb = panelScore(judges, b.cell)?.avg ?? -1;
    if (pb !== pa) return pb - pa;
    return a.cell.localeCompare(b.cell);
  });

  const cards = ranked.map((e, i) => {
    const p = panelScore(judges, e.cell);
    const title = entryTitle(e.notes);
    const fork = forkBlurb(e.notes);
    // The thumbnail is the HUD, not the game. Headless Chromium does not
    // composite the WebGPU surface, so these frames show every entry's chrome
    // — timers, minimaps, gauges — over an empty 3D region. That is genuinely
    // informative about UI taste and genuinely NOT what the game looks like,
    // so it is labelled rather than left to mislead.
    const thumb = e.frames?.length
      ? `<img class="shot" src="./entries/${esc(e.cell)}/capture/${esc(e.frames[1] || e.frames[0])}" loading="lazy" alt="HUD of ${esc(e.cell)}">
         <span class="shotlabel">HUD only — the 3D view can’t be captured headlessly</span>`
      : '<div class="shot noshot">no capture</div>';
    const chips = [...GATE_ORDER.map((c) => [c, e.gate?.checks?.[c]]), ...SKEL_ORDER.map((c) => [c, e.skeleton?.checks?.[c]])]
      .map(([id, c]) => `<span class="chk ${!c ? 'na' : c.passed ? 'ok' : 'no'}" title="${esc(c?.detail ?? '')}">${esc(id)}</span>`)
      .join('');
    return `
  <article class="card">
    <a class="enter" href="./play/${esc(e.cell)}/">
      ${thumb}
      <div class="overlay"><span class="go">Enter ↗</span></div>
    </a>
    <div class="body">
      <div class="head">
        <span class="ord">${i + 1}</span>
        <h2>${title ? esc(title) : `${esc(e.harness)} × ${esc(e.model)}`}</h2>
        ${p ? `<span class="panel" title="mean of ${p.n} anonymised judge lenses">${p.avg.toFixed(1)}</span>` : ''}
      </div>
      <p class="who">${esc(e.harness)} <span class="sep">×</span> ${esc(e.model)} <span class="sep">·</span> run ${e.sample ?? 1}</p>
      ${fork ? `<p class="fork">${esc(fork)}</p>` : ''}
      <div class="chips">${chips}</div>
      <p class="links"><a href="./play/${esc(e.cell)}/">play it →</a>
        ${e.notes ? `<a href="#notes-${esc(e.cell)}" onclick="document.getElementById('notes-${esc(e.cell)}').open=true">notes</a>` : ''}</p>
      ${e.notes ? `<details id="notes-${esc(e.cell)}"><summary>NOTES.md</summary><pre>${esc(e.notes)}</pre></details>` : ''}
    </div>
  </article>`;
  }).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>arena · ${esc(runId)} · ${esc(brief)}</title>
<style>${SHARED_CSS}
  .wrap { max-width:1180px; margin:0 auto; padding:48px 20px 80px; }
  .crumb { font-size:13px; letter-spacing:.04em; text-transform:uppercase; color:var(--soft); }
  .crumb a { color:var(--soft); text-decoration:none; }
  h1 { font-size:34px; margin:10px 0 6px; letter-spacing:-.01em; }
  p.lede { color:var(--soft); margin:0 0 14px; max-width:66ch; }
  .callout { border-left:2px solid var(--accent); padding:10px 14px; margin:0 0 36px;
             color:var(--soft); font-size:14px; max-width:66ch; background:#0e0e15; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(330px,1fr)); gap:22px; }
  .card { border:1px solid var(--line); border-radius:12px; overflow:hidden; background:#0e0e15;
          display:flex; flex-direction:column; }
  .enter { position:relative; display:block; line-height:0; background:#000; }
  .shot { width:100%; aspect-ratio:16/10; object-fit:cover; display:block; }
  .noshot { display:flex; align-items:center; justify-content:center; aspect-ratio:16/10;
            color:var(--soft); font-size:13px; line-height:1.4; }
  .overlay { position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
             background:rgba(11,11,16,.55); opacity:0; transition:opacity .18s; }
  .enter:hover .overlay, .enter:focus-visible .overlay { opacity:1; }
  .go { border:1px solid var(--accent); color:var(--accent); border-radius:99px;
        padding:9px 20px; font-size:15px; font-weight:600; background:rgba(11,11,16,.7); }
  .shotlabel { position:absolute; left:0; right:0; bottom:0; padding:5px 9px; line-height:1.3;
               font-size:10.5px; color:var(--soft); background:linear-gradient(0deg,rgba(11,11,16,.92),transparent);
               pointer-events:none; }
  .body { padding:16px 16px 18px; display:flex; flex-direction:column; gap:8px; }
  .head { display:flex; align-items:baseline; gap:9px; }
  .ord { color:var(--soft); font-variant-numeric:tabular-nums; font-size:13px; }
  .card h2 { font-size:18px; margin:0; font-weight:650; line-height:1.25; }
  .panel { margin-left:auto; font-size:15px; font-weight:700; font-variant-numeric:tabular-nums; color:var(--ok); }
  .who { margin:0; font-size:13px; color:var(--soft); }
  .sep { opacity:.5; }
  .fork { margin:2px 0 0; font-size:13.5px; color:#c3c3d4; }
  .chips { display:flex; flex-wrap:wrap; gap:4px; margin-top:2px; }
  .chk { font-size:10.5px; padding:2px 7px; border-radius:99px; border:1px solid var(--line); color:var(--soft); cursor:help; }
  .chk.ok { color:var(--ok); border-color:#1e4d3f; }
  .chk.no { color:var(--no); border-color:#5a2626; }
  .links { margin:6px 0 0; font-size:14px; display:flex; gap:14px; }
  details { margin-top:4px; } summary { cursor:pointer; color:var(--soft); font-size:13px; }
  pre { white-space:pre-wrap; font-size:12.5px; line-height:1.5; background:#08080c;
        border:1px solid var(--line); border-radius:8px; padding:11px; max-height:340px; overflow:auto; }
  .note { color:var(--soft); font-size:13px; border-left:2px solid var(--line); padding-left:12px; margin:38px 0 0; max-width:70ch; }
  @media (max-width:640px) { .wrap { padding:32px 14px 60px; } h1 { font-size:27px; } }
</style>
</head>
<body>
<div class="wrap">
  <div class="crumb"><a href="https://os.mino.mobi/">os.mino.mobi</a> / arena / ${esc(runId)}</div>
  <h1>${esc(brief)}</h1>
  <p class="lede">One brief — <em>turn INPAC into a race, make it look good</em> — given to ${ranked.length}
  agent runs across ${new Set(ranked.map((e) => `${e.harness}/${e.model}`)).size} (harness × model) cells.
  Each built its own world. Open one and it takes the whole screen; arrows move you to the next.</p>

  <div class="callout"><strong>The number is not a score.</strong> It is the mean of an anonymised judge
  panel's "would you want to play this", and those judges only ever read the code and the notes — none of
  them, and no machine here, can see a WebGPU game render. The chips below each card are a floor
  (does it boot, does it move, is the gravity fixed), not a verdict. The verdict is yours.</div>

  <div class="grid">
${cards}
  </div>

  <p class="note">Card images are each entry's <strong>HUD</strong>, not its world — headless capture
  cannot see a WebGPU surface, so the 3D region is blank in every one. You have to open a world to see it.</p>

  <p class="note">Entries are model-written code, run inside a sandboxed frame with no same-origin
  access, so they cannot reach this site's cookies or storage. Mouse-look is allowed; saving a best
  time across reloads may not survive the sandbox. Each play page has an "open raw" link if you want
  an entry exactly as it would run standalone.</p>
</div>
</body>
</html>
`;
}

export function playHtml({ runId, brief, entry, prev, next, index, total }) {
  const title = entryTitle(entry.notes) || `${entry.harness} × ${entry.model}`;
  const src = `../../entries/${entry.cell}/`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · ${esc(entry.harness)} × ${esc(entry.model)}</title>
<style>${SHARED_CSS}
  html, body { height:100%; overflow:hidden; }
  #stage { position:fixed; inset:0; border:0; width:100vw; height:100vh; display:block; background:#000; }
  /* The bar floats over the game and gets out of the way. It fades on idle and
     while the pointer is locked, because a HUD you did not ask for is exactly
     what ruins the "little world" this page exists to show. */
  #bar { position:fixed; top:0; left:0; right:0; z-index:10;
         display:flex; align-items:center; gap:14px; padding:9px 14px;
         background:linear-gradient(180deg, rgba(11,11,16,.92), rgba(11,11,16,0));
         font-size:13.5px; transition:opacity .25s, transform .25s; }
  #bar.hidden { opacity:0; transform:translateY(-8px); pointer-events:none; }
  #bar a, #bar span { white-space:nowrap; }
  #bar a { color:var(--ink); text-decoration:none; opacity:.85; }
  #bar a:hover { opacity:1; color:var(--accent); }
  .who { color:var(--soft); }
  .name { font-weight:650; }
  .count { color:var(--soft); font-variant-numeric:tabular-nums; }
  .spacer { margin-left:auto; }
  .raw { color:var(--soft) !important; font-size:12.5px; }
  kbd { border:1px solid var(--line); border-radius:4px; padding:0 5px; font-size:11px; color:var(--soft); }
  #hint { position:fixed; left:50%; bottom:22px; transform:translateX(-50%); z-index:10;
          background:rgba(11,11,16,.86); border:1px solid var(--line); border-radius:99px;
          padding:7px 16px; font-size:13px; color:var(--soft); transition:opacity .4s; }
  #hint.gone { opacity:0; pointer-events:none; }
  @media (max-width:640px) { .who, .count { display:none; } }
</style>
</head>
<body>
<div id="bar">
  <a href="../../" title="Back to the arena">← arena</a>
  ${prev ? `<a href="../${esc(prev.cell)}/" title="Previous entry">‹ prev</a>` : '<span class="who">‹ prev</span>'}
  ${next ? `<a href="../${esc(next.cell)}/" title="Next entry">next ›</a>` : '<span class="who">next ›</span>'}
  <span class="name">${esc(title)}</span>
  <span class="who">${esc(entry.harness)} × ${esc(entry.model)} · run ${entry.sample ?? 1}</span>
  <span class="spacer"></span>
  <span class="count">${index + 1} / ${total}</span>
  <a class="raw" href="${esc(src)}" target="_blank" rel="noopener"
     title="Open the entry unsandboxed, exactly as it would run standalone">open raw ↗</a>
</div>

<div id="hint">click to play · <kbd>[</kbd> <kbd>]</kbd> to move between worlds · <kbd>esc</kbd> for the bar</div>

<!-- allow-scripts + allow-pointer-lock, and deliberately NO allow-same-origin:
     the entry runs in an opaque origin with no reach into this site's cookies
     or storage. See bakeoff/arena.mjs for why this is the confirmed boundary. -->
<iframe id="stage" src="${esc(src)}"
        sandbox="allow-scripts allow-pointer-lock"
        allow="fullscreen; pointer-lock; gamepad; xr-spatial-tracking"
        title="${esc(title)}"></iframe>

<script>
(function () {
  var bar = document.getElementById('bar');
  var hint = document.getElementById('hint');
  var stage = document.getElementById('stage');
  var idle;

  function show() {
    bar.classList.remove('hidden');
    clearTimeout(idle);
    idle = setTimeout(function () {
      // Never hide while the pointer is over the bar itself.
      if (!bar.matches(':hover')) bar.classList.add('hidden');
    }, 2600);
  }
  show();
  setTimeout(function () { hint.classList.add('gone'); }, 6000);

  addEventListener('mousemove', function (e) { if (e.clientY < 90) show(); });
  addEventListener('keydown', function (e) {
    // These only fire while the PARENT has focus. Once you click into the game
    // the iframe is cross-origin and swallows its own keys, so nothing here can
    // steal a control from the entry.
    if (e.key === '[') { var p = document.querySelector('#bar a[title^="Previous"]'); if (p) p.click(); }
    if (e.key === ']') { var n = document.querySelector('#bar a[title^="Next"]'); if (n) n.click(); }
    if (e.key === 'Escape') show();
  });

  // Hand focus to the game so keys reach it without a stray click first.
  stage.addEventListener('load', function () { try { stage.focus(); } catch (err) {} });
})();
</script>
</body>
</html>
`;
}
