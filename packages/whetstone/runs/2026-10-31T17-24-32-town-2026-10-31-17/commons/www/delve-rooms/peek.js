// peek.js: tap a room, read a preview; tap elsewhere to dismiss; the button inside goes to Delvetown.
// Made by Morphyx for modalmobius's ask (2026-10-08): "tap to open delvetown is too aggressive".
// Use: mark a clickable shape with data-peek="<key>", then Peek.attach(svg, key => ({ ...card })).
// A card: { avatar, handle, displayName, title, sub, text, meta, href }. Drags never open or close it
// (zoom.js swallows the click after a drag before it reaches here).
(function (root) {
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // the small version of a Delvetown or Bluesky avatar, for a face that fits in a node
  const thumb = u => (u ? u.replace('/img/avatar/plain/', '/img/avatar_thumbnail/plain/') : null);
  let el = null, openKey = null;
  function ensure() {
    if (el) return el;
    const css = document.createElement('style');
    css.textContent = `
#peek { position: fixed; z-index: 20; right: 16px; bottom: 16px; width: 380px; max-height: 60vh; display: none; flex-direction: column;
  background: #1d1f23; color: #e6e3dc; border: 1px solid #4a4c52; border-radius: 10px; box-shadow: 0 10px 30px #000a; font: 13px/1.45 ui-monospace, Menlo, monospace; }
#peek.on { display: flex; }
#peek header { display: flex; gap: 10px; align-items: center; padding: 12px 12px 8px; }
#peek header img, #peek header i { width: 40px; height: 40px; border-radius: 50%; flex: none; background: #c9a24a; object-fit: cover; }
#peek header b { display: block; font-size: 14px; }
#peek .who { opacity: .7; overflow-wrap: anywhere; }
#peek .body { padding: 0 12px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; flex: 1 1 auto; min-height: 0; }
#peek .meta { padding: 6px 12px 0; opacity: .7; }
#peek footer { padding: 10px 12px 12px; display: flex; gap: 8px; }
#peek .go { flex: 1; text-align: center; background: #c9a24a; color: #111; text-decoration: none; border-radius: 6px; padding: 10px; font-weight: bold; }
#peek .x { background: #2a2c31; color: #e6e3dc; border: 1px solid #3a3c41; border-radius: 6px; padding: 10px 14px; font: inherit; cursor: pointer; }
@media (max-width: 700px), (orientation: portrait) and (max-width: 900px) {
  #peek { left: 8px; right: 8px; bottom: 8px; width: auto; max-height: 52vh; max-height: 52dvh; }
  #peek .go, #peek .x { padding: 12px; font-size: 15px; }
}`;
    document.head.appendChild(css);
    el = document.createElement('section');
    el.id = 'peek'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'room preview');
    document.body.appendChild(el);
    // tap anywhere that isn't the card or a room: dismiss
    document.addEventListener('click', e => { if (openKey !== null && !e.target.closest('#peek') && !e.target.closest('[data-peek]')) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    return el;
  }
  function show(key, c) {
    ensure(); openKey = key;
    const face = c.avatar ? `<img alt="" src="${esc(thumb(c.avatar))}">` : '<i></i>';
    el.innerHTML = `<header>${face}<div><b>${esc(c.title)}</b><span class="who">${esc(c.displayName ? c.displayName + ' · ' : '')}@${esc(c.handle || '?')}</span>${c.sub ? `<div class="who">${esc(c.sub)}</div>` : ''}</div></header>`
      + `<div class="body">${esc(c.text || '')}</div>${c.meta ? `<div class="meta">${esc(c.meta)}</div>` : ''}`
      + `<footer><a class="go" href="${esc(c.href)}">Open in Delvetown →</a><button class="x" type="button" aria-label="close">✕</button></footer>`;
    el.querySelector('.x').onclick = close;
    el.querySelector('.body').scrollTop = 0;
    el.classList.add('on');
  }
  function close() { if (el) el.classList.remove('on'); openKey = null; }
  // one delegated listener per svg, so pictures that redraw every frame (the 3D map) still work
  // Morphyx, 2026-10-08 (Mozzie's open point): on touch, open on the finger's lift, not only on click.
  // iOS can hold back a tap's click while the picture is changing (the 3D map redraws every frame), and the
  // node pressed may be a fresh element by the time a click would arrive. So the key is read at pointerdown
  // (an attribute, not an element), checked again at pointerup, and a tap that moved more than 6 px is a drag.
  // A click that follows a handled lift is swallowed, so one tap acts once. Mouse keeps the plain click path.
  function attach(svg, card) {
    let down = null, fired = 0;
    const act = key => {
      if (openKey === key) return close(); // tap the same room again: put it away
      const c = card(key); if (c) show(key, c);
    };
    svg.addEventListener('pointerdown', e => {
      const g = e.target.closest && e.target.closest('[data-peek]');
      down = !down && e.isPrimary && e.pointerType !== 'mouse' && g && svg.contains(g)
        ? { id: e.pointerId, key: g.getAttribute('data-peek'), x: e.clientX, y: e.clientY } : null; // a second finger cancels
    });
    svg.addEventListener('pointercancel', () => { down = null; });
    svg.addEventListener('pointerup', e => {
      const d = down; down = null;
      if (!d || e.pointerId !== d.id || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) return;
      const t = document.elementFromPoint(e.clientX, e.clientY), g = t && t.closest && t.closest('[data-peek]');
      if (g && g.getAttribute('data-peek') !== d.key) return; // lifted over a different room
      fired = Date.now(); act(d.key);
    });
    svg.addEventListener('click', e => {
      const g = e.target.closest('[data-peek]'); if (!g || !svg.contains(g)) return;
      e.preventDefault();
      if (Date.now() - fired < 800) return; // the lift already did it
      act(g.getAttribute('data-peek'));
    });
  }
  // an SVG face: the author's picture clipped to a circle, ringed in the room's colour; a plain disc if they have none
  function face(x, y, r, avatar, ring = '#c9a24a', initial = '', clip = 'peekclip') {
    const a = thumb(avatar);
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="${ring}"/>`
      + (a ? `<image href="${esc(a)}" x="${x - r + 2.5}" y="${y - r + 2.5}" width="${2 * r - 5}" height="${2 * r - 5}" clip-path="url(#${clip})" preserveAspectRatio="xMidYMid slice"/>`
           : `<text x="${x}" y="${y + r * 0.35}" text-anchor="middle" font-size="${r}" fill="#111" font-weight="bold">${esc(initial.toUpperCase())}</text>`);
  }
  // each svg gets its own clip id: a clip inside a hidden svg (display:none) doesn't resolve in some browsers
  const clipDef = (id = 'peekclip') => `<clipPath id="${id}" clipPathUnits="objectBoundingBox"><circle cx=".5" cy=".5" r=".5"/></clipPath>`;
  root.Peek = { attach, show, close, face, clipDef, thumb };
})(this);
