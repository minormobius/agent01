// asset-sources.mjs — turning a link somebody posted into a file we may ship.
//
// PURE. No network, no filesystem, no clock: given a page's HTML, say what the
// asset is, who made it and under what terms. lab-fetch-assets.mjs does the
// fetching and the byte-counting; this decides what is allowed, which is the
// part worth being able to test without a network.
//
// WHY THIS EXISTS AT ALL. A published lab site cannot load a model from
// poly.pizza at runtime, and CSP is only half the reason: `connect-src` names
// its hosts, and `static.poly.pizza` also serves no `access-control-allow-origin`,
// so a sandboxed tenant (opaque origin, `Origin: null`) would be refused by CORS
// even if the policy allowed it. The way an asset gets onto the page is to be
// ON THE DOMAIN — fetched at build time, committed into the tenant's own
// directory, served same-origin by the worker that serves the site.
//
// A PROXY WAS THE OTHER OPTION AND IT IS THE WRONG ONE. `/_asset/?url=…` would
// be same-origin and CSP-legal, and it would turn `connect-src 'self'` into
// "any host on the internet" for all forty-six tenants — the one control that
// stops a lab site becoming a firehose republisher, undone by a query
// parameter. It would also be an open proxy on the domain, which is how a
// domain gets blocklisted, which is the thing the minomobi.com quarantine
// exists to contain.
//
// THE LICENCE IS NOT A FORMALITY HERE. These files land on the operator's own
// domain under a permanent URL. CC-BY means attribution is a CONDITION of the
// grant, so a build that ships the file and drops the credit is not "missing a
// nicety", it is using the work outside its licence. The credit is therefore
// carried as data from the same parse that finds the file, and the content gate
// checks the page actually renders it.

/** Terms we will publish under, and nothing else.
 *
 *  CC0 needs no credit; CC-BY and OGA-BY need one and we can generate it. What
 *  is deliberately ABSENT is the copyleft family — CC-BY-SA, GPL, LGPL. Not
 *  because they are worse licences, but because their conditions reach past the
 *  file and onto the thing it is bundled into, and that question ("is this
 *  static page a derivative work or mere aggregation?") is a judgement for a
 *  human, made once, not one for a build agent to make forty-six times at 3am.
 *  A refusal here costs one asset; guessing wrong costs a licence violation on
 *  a domain that publishes under the operator's name. */
export const ALLOWED = new Map([
  ['cc0', { credit: false, name: 'CC0' }],
  ['cc-by 3.0', { credit: true, name: 'CC-BY 3.0' }],
  ['cc-by 4.0', { credit: true, name: 'CC-BY 4.0' }],
  ['cc-by', { credit: true, name: 'CC-BY' }],
  ['oga-by 3.0', { credit: true, name: 'OGA-BY 3.0' }],
]);

/** Spelled a dozen ways across two sites; folded to the key above. Returns null
 *  for anything unrecognised, which is a REFUSAL rather than a default — an
 *  unknown licence is the case where guessing is most expensive. */
export function normaliseLicence(raw) {
  const s = String(raw ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
    .replace(/^licen[sc]e[:\s]*/, '')
    .replace(/creative commons /, '')
    .replace(/attribution[- ]sharealike/, 'cc-by-sa')
    .replace(/attribution/, 'cc-by')
    .replace(/\bccby\b/, 'cc-by')
    .replace(/[()]/g, '')
    .trim();
  // Share-alike and copyleft first: "cc-by-sa 3.0" contains "cc-by 3.0" as a
  // substring under a looser match, and getting that backwards would admit
  // exactly the family this list exists to exclude.
  if (/(^|\W)(cc-?by-?sa|sharealike|gpl|lgpl|agpl)(\W|$)/.test(s)) return null;
  for (const key of ['cc0', 'oga-by 3.0', 'cc-by 4.0', 'cc-by 3.0']) {
    if (s.includes(key)) return key;
  }
  if (/(^|\W)cc-by(\W|$)/.test(s)) return 'cc-by';
  return null;
}

/** Every licence on a submission must be one we accept.
 *
 *  ANY, not ALL, is the tempting reading — "it's also available under CC0, so
 *  take that one" — and it is right in law and wrong here: OpenGameArt lists
 *  the terms the AUTHOR offers, and picking the permissive one silently is a
 *  choice a human should make. All-or-nothing keeps the refusal legible. */
export function licenceOf(list) {
  const raws = (Array.isArray(list) ? list : [list]).filter(Boolean);
  if (!raws.length) return { ok: false, reason: 'no licence stated' };
  const keys = raws.map(normaliseLicence);
  const bad = raws.filter((_, i) => !keys[i]);
  if (bad.length) return { ok: false, reason: `licence not on the allowlist: ${bad.join(', ')}` };
  // The strictest of what is offered, so the credit is generated when ANY of
  // the stated terms asks for one.
  const needsCredit = keys.some((k) => ALLOWED.get(k).credit);
  return { ok: true, name: keys.map((k) => ALLOWED.get(k).name).join(' / '), credit: needsCredit };
}

const decode = (s) => String(s ?? '')
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
  .replace(/\\u002F/gi, '/').trim();

/** Extensions we will put on the domain, and what has to be at the front of the
 *  file for us to believe it. The header check is not paranoia about poly.pizza;
 *  it is that a redirect, an error page or a login wall all arrive as 200s full
 *  of HTML, and "model.glb" containing `<!doctype html>` is the failure that
 *  otherwise reaches the page as a silently broken scene. */
export const MAGIC = {
  glb: [[0x67, 0x6c, 0x54, 0x46]],                                   // glTF
  png: [[0x89, 0x50, 0x4e, 0x47]],
  jpg: [[0xff, 0xd8, 0xff]],
  jpeg: [[0xff, 0xd8, 0xff]],
  gif: [[0x47, 0x49, 0x46, 0x38]],
  webp: [[0x52, 0x49, 0x46, 0x46]],                                  // RIFF….WEBP
  ogg: [[0x4f, 0x67, 0x67, 0x53]],
  wav: [[0x52, 0x49, 0x46, 0x46]],
  mp3: [[0x49, 0x44, 0x33], [0xff, 0xfb], [0xff, 0xf3], [0xff, 0xf2]],
  // Text formats: no signature, sniffed by SNIFF below instead.
  obj: [], mtl: [], gltf: [],
};

/** Formats with no magic number, because they are plain text. An OBJ is the
 *  format both of these sites offer for hand-editing and the one people
 *  actually ask for — "each page has a download button that lets you pick the
 *  .obj format specifically" is verbatim from the request that prompted this —
 *  so refusing it for lacking a byte signature would refuse the common case.
 *
 *  Sniffed on the first lines instead: an OBJ is comments, `v`/`vn`/`vt`/`f`
 *  records and group markers, which no HTML error page resembles. */
const SNIFF = {
  obj: /^\s*(#|mtllib\s|o\s|g\s|v\s|vn\s|vt\s|f\s|usemtl\s|s\s)/m,
  mtl: /^\s*(#|newmtl\s|Ka\s|Kd\s|Ks\s|map_Kd\s)/m,
  gltf: /^\s*\{[\s\S]{0,400}"asset"\s*:/,
};

/** Does this look like what its extension claims? */
export function looksLike(ext, head) {
  const e = String(ext).toLowerCase();
  const bytes = head instanceof Uint8Array ? head : new Uint8Array();
  if (SNIFF[e]) {
    // Decoded lossily on purpose: a real OBJ is ASCII, and a binary that
    // happens to end in .obj produces replacement characters rather than
    // matching. Only the head is examined — these files run to megabytes.
    const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes.slice(0, 4096));
    if (/<(!doctype|html|head|body)\b/i.test(text)) return false;
    return SNIFF[e].test(text);
  }
  const want = MAGIC[e];
  if (!want) return false;
  const first = Array.from(bytes.slice(0, 8));
  return want.some((sig) => sig.every((b, i) => first[i] === b));
}

/** A filename safe to put in a path and a URL. The name comes off somebody
 *  else's page, so it is rebuilt from scratch rather than sanitised: no dots to
 *  climb with, no slashes, and one extension we chose. */
export function safeName(title, ext, index = 0) {
  const base = String(title ?? '').toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
    || `asset-${index + 1}`;
  return `${base}.${String(ext).toLowerCase()}`;
}

// --- poly.pizza -------------------------------------------------------------
//
// The page is a React app that inlines its own state, so the model URL, the
// licence and the creator all come out of one document with no API key and no
// second request. `/m/<id>` is the VIEWER, never the file: the asset lives on
// static.poly.pizza under a uuid, which is why "just fetch the link" fails.
function polyPizza(html) {
  const url = (html.match(/https:\/\/static\.poly\.pizza\/[a-f0-9-]{36}\.glb/i) || [])[0];
  if (!url) return null;
  const licence = decode((html.match(/"Licence":"([^"]{1,40})"/) || [])[1]);
  const creator = decode((html.match(/"Creator":\{"Username":"([^"]{1,60})"/) || [])[1]);
  const title = decode((html.match(/<title[^>]*>([^<]{1,120})<\/title>/i) || [])[1])
    .replace(/\s*[-–]\s*(Free\s*)?3?D?\s*Model.*$/i, '').trim();
  return { source: 'poly.pizza', title, creator, licences: [licence], files: [{ url, ext: 'glb', title }] };
}

// --- opengameart.org --------------------------------------------------------
//
// Drupal, so the markup is stable and the two things that matter are in named
// regions: `license-name` spans and the `field-name-field-art-files` block.
// Scraping hrefs from the whole page instead would sweep up the site's own CSS
// and JS under the same /sites/default/files/ prefix.
//
// THE LICENCE IS PLURAL HERE — the page literally says "License(s):" — and a
// submission may offer several at once, which is why licenceOf() takes a list.
function openGameArt(html) {
  const licences = [...html.matchAll(/license-name'>([^<]{1,40})</g)].map((m) => decode(m[1]));
  const region = (html.match(/field-name-field-art-files([\s\S]{0,8000})/) || [])[1] || '';
  const title = decode((html.match(/<title[^>]*>([^<|]{1,120})/i) || [])[1]).trim();
  // The submitter is the FIRST `username` span on the page — Drupal renders the
  // node's author before any comment. Matching /users/ anywhere instead picks up
  // whoever the description happens to thank ("thanks to KingAkwasi") and
  // whoever commented, and a credit line naming the wrong person is worse than
  // one naming nobody.
  const creator = decode((html.match(/<span class='username'><a href="\/users\/[^"]*">([^<]{1,60})</i) || [])[1])
    || decode((html.match(/class="username"[^>]*property="foaf:name"[^>]*>([^<]{1,60})</i) || [])[1]);
  const files = [];
  for (const m of region.matchAll(/href="(https:\/\/opengameart\.org\/sites\/default\/files\/[^"?#]+)"/g)) {
    const url = decode(m[1]);
    const ext = (url.match(/\.([a-z0-9]{2,4})$/i) || [])[1]?.toLowerCase();
    // ZIPS ARE REFUSED, and this is a v1 line rather than a permanent one.
    // Unpacking an archive chosen by a stranger is zip-slip and zip-bomb
    // territory, and it needs its own budget and its own tests. Most OGA
    // submissions that matter offer loose files as well.
    if (!ext || !MAGIC[ext]) continue;
    files.push({ url, ext, title: decodeURIComponent(url.split('/').pop().replace(/\.[a-z0-9]+$/i, '')) });
  }
  return { source: 'opengameart.org', title, creator, licences, files };
}

/** A LINK STRAIGHT AT THE FILE, WHICH IS THE OBVIOUS THING TO POST AND THE ONE
 *  THING WE CANNOT ACCEPT.
 *
 *  `opengameart.org/sites/default/files/house.obj` is a real request from a real
 *  thread. It is fetchable, it is the right format, and it is refused — because
 *  a bare file carries NO LICENCE. The terms live on the submission page, and
 *  there is no reliable way back from a file to the page that offers it. Taking
 *  it anyway would mean publishing somebody's work on the operator's domain
 *  under terms nobody read, which is the one thing this module exists to stop.
 *
 *  So it is recognised specifically, in order to REFUSE IT WITH AN ANSWER —
 *  "post the submission page instead" is something a person can act on, where
 *  silence just looks broken. It cost several build turns of an agent guessing
 *  before anyone knew this was the reason. */
export function directFile(url) {
  let u;
  try { u = new URL(String(url)); } catch { return null; }
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  if (host === 'opengameart.org' && u.pathname.startsWith('/sites/default/files/')) {
    return { host, why: 'that is a link straight at the file, and a file on its own carries no licence' +
      ' — post the submission page instead (opengameart.org/content/…) and the terms can be read' };
  }
  if (host === 'static.poly.pizza') {
    return { host, why: 'that is poly.pizza\'s CDN, which carries no licence or author' +
      ' — post the model page instead (poly.pizza/m/…)' };
  }
  return null;
}

/** Which resolver, if any, handles this link. An unknown host is not an error —
 *  it is a link the reference fetcher will read as a document instead. */
export function planAsset(url) {
  let u;
  try { u = new URL(String(url)); } catch { return null; }
  if (u.protocol !== 'https:') return null;
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  if (host === 'poly.pizza' && /^\/m\/[\w-]+\/?$/.test(u.pathname)) {
    return { host, page: u.href, parse: polyPizza };
  }
  if (host === 'opengameart.org' && /^\/content\/[\w-]+\/?$/.test(u.pathname)) {
    return { host, page: u.href, parse: openGameArt };
  }
  return null;
}

/** The whole decision for one page: what to download, and whether we may.
 *  Returns { ok: false, reason } rather than throwing — a refused asset is a
 *  normal outcome that must not take down a build. */
export function resolveAsset(url, html, { maxFiles = 4 } = {}) {
  const plan = planAsset(url);
  if (!plan) return { ok: false, reason: 'not an asset source' };
  let found;
  try { found = plan.parse(String(html ?? '')); } catch { found = null; }
  if (!found || !found.files.length) return { ok: false, reason: `no downloadable file found on ${plan.host}` };
  const lic = licenceOf(found.licences);
  if (!lic.ok) return { ok: false, reason: `${plan.host}: ${lic.reason}` };
  return {
    ok: true,
    source: plan.host,
    page: plan.page,
    title: found.title || null,
    creator: found.creator || null,
    licence: lic.name,
    credit: lic.credit,
    files: found.files.slice(0, maxFiles),
  };
}

/** One line of credit, in the form the licence actually asks for: the work, the
 *  author, the terms, and a link back to where it came from. */
export function creditLine(a) {
  const bits = [a.title || 'Asset'];
  if (a.creator) bits.push(`by ${a.creator}`);
  bits.push(`(${a.licence})`);
  return `${bits.join(' ')} — ${a.page}`;
}
