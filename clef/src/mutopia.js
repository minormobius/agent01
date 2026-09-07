// mutopia.js — browsing the Mutopia Project from inside clef.
//
// WHAT THIS IS. The user asked whether LilyPond has a network whose records we
// could browse. It does not: LilyPond is a typesetting PROGRAM, with no API, no
// accounts and no records. But the corpus written in its language does exist,
// and the largest free one is the Mutopia Project — ~2,300 scores, public
// domain or CC, kept as LilyPond SOURCE rather than as page images. That makes
// it the one archive this site can do more than link to: clef already reads the
// format, so a Mutopia piece opens in the editor as editable, playable,
// exportable music rather than as a PDF of a picture of music.
//
// HOW IT IS FETCHED. mutopiaproject.org sends no CORS header, so the browser
// cannot read it directly; requests go through this site's own worker at
// `/mutopia/…`, which is locked to that one origin and two path shapes. See
// worker.js.
//
// HOW IT IS PARSED. Mutopia serves an Apache directory index for the file tree
// and a generated HTML table per composer for the catalogue. Neither is an API
// and both could change under us — so every field is optional, every parse
// failure degrades to "we could not read this" rather than throwing, and
// NOTHING fetched is ever inserted into the page as HTML. We read text out of a
// detached document and build our own elements from it.

const PROXY = '/mutopia';

/** Fetch through the worker. Returns text, or throws with a readable message. */
async function get(path, params) {
  const url = new URL(PROXY + '/' + path.replace(/^\//, ''), location.origin);
  if (params) for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { accept: 'text/html,text/plain' } });
  if (!res.ok) {
    let detail = `${res.status}`;
    try { detail = (await res.json()).error || detail; } catch { /* not JSON */ }
    throw new Error(detail);
  }
  return res.text();
}

/** Parse HTML without running any of it. DOMParser does not execute scripts. */
function parseHTML(text) {
  return new DOMParser().parseFromString(text, 'text/html');
}

// ------------------------------------------------------------- composers ----

/**
 * Turn a directory code into something readable.
 *
 * Mutopia names composer directories `BachJS`, `BeethovenLv`, `MozartWA` —
 * surname followed by initials. Splitting on the case change recovers both,
 * and where it cannot the raw code is shown rather than a mangled guess.
 */
export function composerName(code) {
  const m = /^([A-Z][a-z]+)([A-Z][A-Za-z]*)?$/.exec(code);
  if (!m) return code;
  return m[2] ? `${m[1]}, ${m[2].toUpperCase()}` : m[1];
}

/** Every composer with music in the archive, from the FTP index. */
export async function listComposers() {
  const doc = parseHTML(await get('ftp/'));
  const out = [];
  for (const a of doc.querySelectorAll('a[href]')) {
    const href = a.getAttribute('href') || '';
    // Directory entries only: `BachJS/`. The sort links (`?C=N;O=D`) and the
    // parent link (`/`) are neither.
    const m = /^([A-Za-z][A-Za-z0-9_-]*)\/$/.exec(href);
    if (!m) continue;
    out.push({ code: m[1], name: composerName(m[1]) });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

// ---------------------------------------------------------------- pieces ----

const text = (node) => (node?.textContent || '').replace(/\s+/g, ' ').trim();

/**
 * The catalogue for one composer.
 *
 * Mutopia renders each piece as its own small table: title / composer / opus on
 * the first row, instrument and style on the second, source and licence on the
 * third, and the download links on the fourth. That layout is the only contract
 * available, so it is read positionally and defensively — a piece that does not
 * match the shape is skipped rather than half-read.
 */
export async function listPieces(code) {
  const doc = parseHTML(await get('cgibin/make-table.cgi', { Composer: code }));
  const pieces = [];
  for (const table of doc.querySelectorAll('table.result-table')) {
    const rows = [...table.querySelectorAll('tr')].map((tr) => [...tr.children].map(text));
    if (!rows.length || !rows[0][0]) continue;

    const links = [...table.querySelectorAll('a[href]')].map((a) => a.getAttribute('href') || '');
    const ly = links.find((h) => /\.ly$/i.test(h));
    const zip = links.find((h) => /-lys\.zip$/i.test(h));

    pieces.push({
      title: rows[0][0],
      byline: rows[0][1] || '',
      opus: rows[0][2] || '',
      instrument: (rows[1]?.[0] || '').replace(/^for\s+/i, ''),
      style: rows[1]?.[2] || '',
      source: rows[2]?.[0] || '',
      licence: rows[2]?.[1] || '',
      date: rows[2]?.[3] || '',
      // A single-file piece can be opened here. A multi-file one ships only a
      // zip of parts, which this cannot unpack — say so rather than offering a
      // link that does nothing.
      lyPath: ly ? ly.replace(/^https?:\/\/[^/]+\//, '') : null,
      multiFile: !ly && !!zip,
      page: `https://www.mutopiaproject.org/ftp/${code}/`,
    });
  }
  return pieces;
}

/** The LilyPond source of one piece. */
export async function fetchSource(lyPath) {
  return get(lyPath);
}

/**
 * Does this source lean on another file we did not fetch?
 *
 * Some single-`.ly` pieces `\include` their parts from a sibling file. We fetch
 * one file, so the music in the others is simply absent — and absent music that
 * nobody mentions is the worst outcome on this whole site. Detected here so the
 * caller can say so out loud.
 */
export function missingIncludes(source) {
  const found = [];
  for (const m of String(source).matchAll(/\\include\s*"([^"]+)"/g)) {
    // Language and definition files that ship with LilyPond are handled by the
    // parser itself and are not missing music.
    if (/^(?:english|deutsch|nederlands|italiano|espanol|catalan|portugues|francais|norsk|suomi|svenska|vlaams|arabic|makam|predefined-\w+|gregorian|drumpitch-init)\.ly$/i.test(m[1])) continue;
    found.push(m[1]);
  }
  return found;
}
