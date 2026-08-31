// tape/lib/protocol.js — how a recording gets from a phone onto the box.
//
// THE CONSTRAINT THAT SHAPES THIS FILE: a page served over HTTPS cannot fetch
// http://tape.local. Browsers block it as mixed content, and no header on
// either side changes that. The box cannot practically hold a real TLS
// certificate (it has no public name and no way to renew one), so a studio
// page served from tape.mino.mobi can never talk to the box directly.
//
// So there are three transports, and the design leans on the first:
//
//   LAN      the box serves the studio itself, over plain HTTP, from the SD
//            card. Same source as tape/studio/, built into the firmware image.
//            Recording and uploading happen on one origin, so nothing is mixed.
//            Zero cloud, zero accounts, works with the internet down.
//   CARD     write the files to the SD card from a computer and put it back.
//            Always works. The fallback when WiFi is being WiFi.
//   RELAY    opt-in: the studio encrypts a recording in the browser and parks
//            it in an inbox the box polls over HTTPS. This is the only way a
//            grandparent in another city records a story, and the only path
//            that touches a server. Off by default; the key never leaves the
//            two devices, so the relay stores ciphertext it cannot read.
//
// The API below is what the box serves on LAN, and what RELAY replays into it.

export const TRANSPORTS = ['lan', 'card', 'relay'];
export const DEFAULT_BOX_ORIGIN = 'http://tape.local';
export const API_VERSION = 1;

export const ROUTES = {
  hello:    { method: 'GET',    path: '/api/hello' },
  manifest: { method: 'GET',    path: '/api/manifest' },
  events:   { method: 'GET',    path: '/api/events' },
  putTitle: { method: 'POST',   path: '/api/title' },
  delTitle: { method: 'DELETE', path: '/api/title/:titleId' },
  putCard:  { method: 'PUT',    path: '/api/card/:cardId' },
  delCard:  { method: 'DELETE', path: '/api/card/:cardId' },
  enroll:   { method: 'POST',   path: '/api/enroll' },
  say:      { method: 'POST',   path: '/api/say' },
};

/** Events the box pushes down /api/events as server-sent events. */
export const EVENTS = [
  'card',      // { id, known, label }        a card arrived on or left the pad
  'playback',  // { state, titleId, track, position }
  'enrolled',  // { id }                      a blank tag was just written
  'ingest',    // { titleId, received, total }
  'error',     // { message }
];

export function url(origin, route, params = {}) {
  const r = ROUTES[route];
  if (!r) throw new Error(`no such route: ${route}`);
  const path = r.path.replace(/:([a-zA-Z]+)/g, (_, k) => {
    if (params[k] == null) throw new Error(`route ${route} needs a ${k}`);
    return encodeURIComponent(params[k]);
  });
  return new URL(path, origin).toString();
}

/**
 * What GET /api/hello answers. The studio uses `schema` to refuse to talk to a
 * box running firmware it does not understand, rather than half-writing one.
 */
export function validateHello(h) {
  const bad = [];
  if (!h || typeof h !== 'object') return ['not an object'];
  if (h.api !== API_VERSION) bad.push(`box speaks api ${h.api}, this studio speaks ${API_VERSION}`);
  for (const k of ['name', 'firmware']) if (typeof h[k] !== 'string') bad.push(`${k} missing`);
  for (const k of ['freeBytes', 'titles', 'cards']) if (typeof h[k] !== 'number') bad.push(`${k} missing`);
  return bad;
}

/**
 * ENROLMENT — and the reason iPhones are not second-class here.
 *
 * Web NFC writes tags from Chrome on Android only. Safari has never shipped it,
 * so half of all parents cannot write a card from their phone at all. Rather
 * than ship a native app, the *box* is the tag writer of record: POST /api/enroll
 * arms it, the next blank tag laid on the pad gets written, and an `enrolled`
 * event comes back. The phone only ever needs a microphone.
 *
 * Web NFC, where it exists, is then a shortcut and not a dependency.
 */
export function enrollBody({ cardId, label = '', ttlSeconds = 60 }) {
  return { cardId, label, ttlSeconds };
}

/** True when this browser can write a tag without the box's help. */
export function hasWebNfc() {
  return typeof globalThis.NDEFReader === 'function';
}

/**
 * Which transports are usable from here, most preferred first. Pure so the
 * studio's "how do I get this onto the box?" panel is testable.
 */
export function availableTransports({ sameOriginAsBox, pageIsHttps, relayEnabled }) {
  const out = [];
  if (sameOriginAsBox) out.push('lan');
  else if (!pageIsHttps) out.push('lan');
  if (relayEnabled && pageIsHttps) out.push('relay');
  out.push('card');
  return out;
}

/** Why a transport is unavailable, in words a parent can act on. */
export function transportBlockedReason(transport, ctx) {
  if (availableTransports(ctx).includes(transport)) return null;
  if (transport === 'lan') {
    return 'This page is on tape.mino.mobi over HTTPS, so the browser will not let it '
      + 'reach the box at http://tape.local. Open the box\'s own page instead — it serves '
      + 'the same studio.';
  }
  if (transport === 'relay') return 'The relay is switched off for this box.';
  return null;
}
