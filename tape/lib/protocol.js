// tape/lib/protocol.js — how a recording gets from a phone onto the box, and
// how the pointer gets onto the card.
//
// TWO BROWSER RULES, PULLING IN OPPOSITE DIRECTIONS. Together they decide the
// whole shape of the pipeline, and neither can be worked around:
//
//   1. getUserMedia() — the microphone — is gated on a SECURE CONTEXT. On a
//      plain-HTTP page `navigator.mediaDevices` is not merely restricted, it is
//      `undefined`. So recording can ONLY happen on https://tape.mino.mobi.
//      (Web NFC is gated the same way, so tag-writing from a phone lands on the
//      same side of the line.)
//
//   2. Mixed content — an HTTPS page cannot fetch http://<the box>. The box has
//      no public name and no way to renew a certificate, so it serves plain
//      HTTP. So uploading can ONLY happen from the box's own origin.
//
// => NO SINGLE ORIGIN HAS BOTH canRecord AND canUpload. That is asserted in the
//    selftest. It is not a bug to be fixed later; it is the reason the pipeline
//    has two halves and something inert — a file — passes between them.
//
// Which is fine, because a file is exactly what a phone is good at holding. It
// also means the simplest path for most parents skips our recorder entirely:
// record in the phone's own voice-memo app (no install, no permissions dance,
// pause/resume and phone-call handling already solved, and the file lands in
// the phone's own backups), then hand that file to the box. ESP-ADF decodes
// MP3/AAC/WAV/OGG/Opus/AMR, which covers everything a phone produces.

export const API_VERSION = 1;

// ---------------------------------------------------------------- network --
// The box runs SoftAP and station mode at the same time. AP is what makes this
// work with no router at all — a grandparent's house, a holiday cottage, a car.
// STA is what stops you switching networks once you are at home.
export const AP_ADDRESS = 'http://192.168.4.1';   // a literal IP: no mDNS, which
export const MDNS_NAME = 'tape.local';            // Android resolves unreliably
export const NET_MODES = ['ap', 'sta', 'ap+sta'];

/** Where to look for the box, best first, given what it is joined to. */
export function boxOrigins({ mode = 'ap+sta', lanAddress = null } = {}) {
  const out = [];
  if (lanAddress && mode !== 'ap') out.push(`http://${lanAddress}`, `http://${MDNS_NAME}`);
  if (mode !== 'sta') out.push(AP_ADDRESS);
  return out;
}

// ------------------------------------------------------------ capabilities --
/**
 * What this page is allowed to do. The whole two-halves design is a consequence
 * of the fact that no input to this function makes canRecord and canUpload both
 * true.
 */
export function originCapabilities({ isSecureContext, sameOriginAsBox, hasNfc = false, boxHasCertificate = false }) {
  // Being same-origin with the box means being on plain HTTP, which is not a
  // secure context. Both at once is a contradiction, not a configuration —
  // unless the box is serving real TLS, which is the documented upgrade below.
  if (isSecureContext && sameOriginAsBox && !boxHasCertificate) {
    throw new Error('originCapabilities: the box serves plain HTTP, so a page on its origin '
      + 'cannot be a secure context. Pass boxHasCertificate to model the TLS upgrade.');
  }
  return {
    canRecord: !!isSecureContext,               // getUserMedia is [SecureContext]
    canWriteTag: !!isSecureContext && !!hasNfc, // Web NFC is too, and Android-only
    canUpload: !!sameOriginAsBox,               // everything else is mixed content
    canPickFile: true,                          // <input type=file> works anywhere
  };
}

/**
 * THE UPGRADE THAT WOULD COLLAPSE THE TWO HALVES INTO ONE PAGE.
 *
 * Plex does this: a public wildcard DNS record whose names resolve to private
 * addresses (`192-168-4-1.box.tape.mino.mobi` -> 192.168.4.1), with a real
 * certificate for it. The page is then HTTPS, on the box's origin: secure
 * context, no mixed content, record and upload together.
 *
 * Not in version one, and the reasons are concrete rather than squeamish:
 * the certificate's private key would ship inside every firmware image and so
 * is public; it expires every 90 days, which turns a toy into something that
 * needs maintaining; and on the box's own access point there is no internet to
 * resolve the name with, so the box would also have to run a DNS server that
 * answers for it. Each is solvable. None is solvable in the first build.
 */
export const TLS_UPGRADE = {
  name: 'wildcard DNS at a private address',
  priorArt: 'Plex (*.plex.direct)',
  unlocks: 'one page: record and upload on the box origin',
  costs: ['a public private-key', '90-day renewals', 'a DNS server on the AP'],
  inVersionOne: false,
};

/** True when this browser can write a tag without the box's help. */
export function hasWebNfc() {
  return typeof globalThis.NDEFReader === 'function';
}

/**
 * THE TRAP THIS FUNCTION EXISTS TO NOT FALL INTO.
 *
 * `localhost` is a secure context *and* serves plain HTTP. It is the one place
 * in the world where both halves are true at once — so a developer running the
 * box's page locally sees recording and uploading work side by side, ships it,
 * and it breaks the moment the page is served from a real LAN address. This
 * function names localhost explicitly rather than letting it look like proof
 * that the constraint is not real.
 */
export const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]', '::1'];

export function capabilitiesHere(global = globalThis) {
  const loc = global.location || {};
  const host = loc.hostname || '';
  const onBoxOrigin = host !== 'tape.mino.mobi' && loc.protocol === 'http:';
  return originCapabilities({
    isSecureContext: !!global.isSecureContext,
    sameOriginAsBox: onBoxOrigin,
    hasNfc: hasWebNfc(),
    // Not a certificate, but the same effect and the same escape hatch: a
    // trusted origin that is nonetheless plain HTTP.
    boxHasCertificate: LOCAL_HOSTS.includes(host),
  });
}

/** True when this page is the misleading development case above. */
export function isLocalDev(global = globalThis) {
  return LOCAL_HOSTS.includes(global.location?.hostname || '');
}

// --------------------------------------------------------------- the paths --
/**
 * The three ways audio reaches the SD card. `box` is the default and involves
 * no server at all; `relay` is the only one that touches one, and it carries
 * ciphertext the relay cannot read.
 */
export const PATHS = {
  box: {
    label: 'Upload at the box',
    record: 'phone voice-memo app, or the studio on tape.mino.mobi',
    hop: 'a file, handed to http://192.168.4.1 or the box on your LAN',
    needs: 'nothing but the box',
    cloud: false,
  },
  card: {
    label: 'Move the SD card',
    record: 'anywhere',
    hop: 'the SD card, in a computer',
    needs: 'a card reader',
    cloud: false,
  },
  relay: {
    label: 'Send it from anywhere',
    record: 'the studio on tape.mino.mobi',
    hop: 'an encrypted blob the box pulls over HTTPS',
    needs: 'the box online, and the key shared once',
    cloud: true,
  },
};

/** Ordered best-first for a given situation. Pure, so the UI is testable. */
export function suggestPath({ sameOriginAsBox, boxReachable, relayEnabled, remote }) {
  if (remote) return relayEnabled ? ['relay', 'card'] : ['card'];
  const out = [];
  if (sameOriginAsBox || boxReachable) out.push('box');
  if (relayEnabled) out.push('relay');
  out.push('card');
  return out;
}

// --------------------------------------------------------------- the wire --
export const ROUTES = {
  hello:    { method: 'GET',    path: '/api/hello' },
  manifest: { method: 'GET',    path: '/api/manifest' },
  events:   { method: 'GET',    path: '/api/events' },
  putTitle: { method: 'POST',   path: '/api/title' },
  delTitle: { method: 'DELETE', path: '/api/title/:titleId' },
  putCard:  { method: 'PUT',    path: '/api/card/:cardId' },
  delCard:  { method: 'DELETE', path: '/api/card/:cardId' },
  enroll:   { method: 'POST',   path: '/api/enroll' },
  wifi:     { method: 'POST',   path: '/api/wifi' },
  say:      { method: 'POST',   path: '/api/say' },
};

/** Events the box pushes down /api/events as server-sent events. */
export const EVENTS = [
  'card',      // { id, known, label }        a card arrived on or left the pad
  'crowd',     // { count }                   more than one tag in the field
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

/** What GET /api/hello answers; checked before the studio writes anything. */
export function validateHello(h) {
  const bad = [];
  if (!h || typeof h !== 'object') return ['not an object'];
  if (h.api !== API_VERSION) bad.push(`box speaks api ${h.api}, this studio speaks ${API_VERSION}`);
  for (const k of ['name', 'firmware']) if (typeof h[k] !== 'string') bad.push(`${k} missing`);
  for (const k of ['freeBytes', 'titles', 'cards']) if (typeof h[k] !== 'number') bad.push(`${k} missing`);
  return bad;
}

/**
 * ENROLMENT — and why the box, not the phone, is the tag writer.
 *
 * Web NFC is Chrome-on-Android only and needs HTTPS. But the phone reaches the
 * box over the box's own AP, which has no internet, so tape.mino.mobi is not
 * even loadable at the moment you want to write a card. The box has an NFC
 * reader that can write, is present by definition, and works the same on every
 * phone. POST /api/enroll arms it; the next tag on the pad is written.
 */
export function enrollBody({ cardId, label = '', ttlSeconds = 60 }) {
  return { cardId, label, ttlSeconds };
}

/** Formats the box accepts on upload; ESP-ADF decodes all of these. */
export const ACCEPTED_AUDIO = ['.m4a', '.aac', '.mp3', '.wav', '.ogg', '.opus', '.amr', '.flac'];
export function acceptsFile(name) {
  return ACCEPTED_AUDIO.some((ext) => name.toLowerCase().endsWith(ext));
}
