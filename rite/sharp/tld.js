// sharp/tld — the TLD verifier and the RDAP side of the house.
//
// Pure logic only: this module decides what a response MEANS, never fetches
// one. The worker does the I/O and hands the status and body here, which is
// what makes the interesting part testable without a network.
//
// Two facts do the work, both from IANA:
//
//   the TLD list        data.iana.org/TLD/tlds-alpha-by-domain.txt
//                       every delegated top-level domain. If it is not here it
//                       does not exist, whatever a registrar's search box says.
//   the RDAP bootstrap  data.iana.org/rdap/dns.json
//                       TLD -> the registry's RDAP base URL. Only registries
//                       that have published one appear, which is most gTLDs and
//                       few ccTLDs. A TLD absent from it is REAL but NOT
//                       CHECKABLE, and those are different answers.
//
// The trap this module exists to avoid: the rdap.org redirector answers
//   404 {"title":"No RDAP service is available for this resource"}
// for .io, .sh, .me and .co — for EVERY name, registered or not. Read that as
// "available" and the tool cheerfully reports that github.io is free. So a 404
// only counts as free when it came from a registry we resolved through the
// bootstrap, and a 404 carrying that title is never an answer about a domain.

export const VERDICTS = {
  free: 'no registration on file at the registry',
  taken: 'registered',
  unverifiable: 'the TLD is real, but its registry publishes no RDAP service',
  unknown: 'the registry did not answer — rate limit, timeout, or an error',
  invalid: 'not a usable domain label',
};

// ---------- labels ----------

// Hostname rules, plus the ones a registry will enforce anyway: 1-63 chars,
// letters/digits/hyphen, no leading or trailing hyphen, and no hyphens in the
// third and fourth position (that is the punycode prefix, `xx--`).
const LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function validLabel(label) {
  const s = String(label || '').toLowerCase();
  if (!LABEL_RE.test(s)) return false;
  if (s.length > 63) return false;
  if (s.slice(2, 4) === '--') return false;
  return true;
}

/**
 * Split a name into label + TLD against the real TLD list, longest match first
 * so `foo.co.uk` reads as label `foo.co` in TLD `uk` only if `co.uk` is not
 * itself listed. IANA lists single labels, so this is the honest reading.
 */
export function splitDomain(name, tlds) {
  const s = String(name || '').trim().toLowerCase().replace(/\.$/, '');
  const i = s.lastIndexOf('.');
  if (i <= 0 || i === s.length - 1) return null;
  const tld = s.slice(i + 1);
  const label = s.slice(0, i);
  if (!tlds.has(tld)) return { label, tld, known: false };
  return { label, tld, known: true };
}

// ---------- RDAP ----------

export function rdapBaseFor(tld, rdap) {
  const base = rdap[tld];
  if (!base) return null;
  return base.endsWith('/') ? base : base + '/';
}

export function rdapUrl(label, tld, rdap) {
  const base = rdapBaseFor(tld, rdap);
  return base ? `${base}domain/${label}.${tld}` : null;
}

// A 404 whose body says the SERVICE is missing is not a statement about the
// domain. Registries word this a few ways; all of them talk about the service
// or the bootstrap rather than the object.
const NO_SERVICE = /no rdap service|not found in bootstrap|unsupported (tld|domain)|no service/i;

/**
 * What a registry's HTTP response means.
 *
 * @param {number} status  HTTP status, or 0 for a transport failure
 * @param {string} body    the response body, if any
 * @param {boolean} fromBootstrap  did the URL come from IANA's bootstrap?
 */
export function readRdap(status, body, fromBootstrap) {
  if (!fromBootstrap) return 'unverifiable';
  const text = String(body || '').slice(0, 2000);
  if (status === 200) {
    // A registry that answers 200 with an error object has not said "taken".
    if (/"errorCode"\s*:\s*(4\d\d|5\d\d)/.test(text)) return 'unknown';
    return 'taken';
  }
  if (status === 404) return NO_SERVICE.test(text) ? 'unverifiable' : 'free';
  if (status === 422 || status === 400) return 'invalid';
  return 'unknown';                       // 429, 5xx, 0 — never guess
}

/** When a registered domain's RDAP record is worth quoting back. */
export function summariseRecord(json) {
  if (!json || typeof json !== 'object') return null;
  const ev = Array.isArray(json.events) ? json.events : [];
  const on = (a) => (ev.find((e) => e.eventAction === a) || {}).eventDate || null;
  return {
    registered: on('registration'),
    expires: on('expiration'),
    changed: on('last changed'),
    status: Array.isArray(json.status) ? json.status : [],
    registrar: (json.entities || [])
      .filter((e) => (e.roles || []).includes('registrar'))
      .map((e) => {
        const v = (e.vcardArray && e.vcardArray[1]) || [];
        const fn = v.find((x) => x[0] === 'fn');
        return fn ? fn[3] : null;
      })
      .filter(Boolean)[0] || null,
  };
}

// ---------- domain hacks ----------
//
// The dot is a letter you get for free. `fla.sh` spells flash; `cru.st` spells
// crust. Given a word and the real TLD list, find every way the word can be
// cut so that the tail IS a TLD — and keep only the cuts that leave a usable
// label. Worth more on a minted word than a real one, because nobody has taken
// the minted one.

export function domainHacks(word, tlds, { minLabel = 2 } = {}) {
  const w = String(word || '').toLowerCase();
  if (!/^[a-z]+$/.test(w)) return [];
  const out = [];
  for (let cut = minLabel; cut < w.length; cut++) {
    const label = w.slice(0, cut);
    const tld = w.slice(cut);
    if (tld.length < 2 || !tlds.has(tld)) continue;
    if (!validLabel(label)) continue;
    out.push({ domain: `${label}.${tld}`, label, tld, spells: w });
  }
  return out;
}

/** Every TLD that can finish a word — the useful half of the list, for the page. */
export function suffixTlds(tlds, { max = 6 } = {}) {
  return [...tlds].filter((t) => t.length >= 2 && t.length <= max && /^[a-z]+$/.test(t)).sort();
}
