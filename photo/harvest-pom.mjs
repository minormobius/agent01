#!/usr/bin/env node
// harvest-pom.mjs — build public/pom/data/*.json from Wikimedia Commons.
//
// Run by hand, from a machine with network. Everything it produces is
// COMMITTED, so the site itself talks to nobody at build time and to exactly
// two hosts at runtime (upload.wikimedia.org for pixels, and whichever
// permalink the reader clicks).
//
//   node photo/harvest-pom.mjs            # write photo/public/pom/data/
//   node photo/harvest-pom.mjs --limit 200  # a quick sample while developing
//
// WHY COMMONS AND NOT THE NATIONAL AGRICULTURAL LIBRARY.
// The collection's own site (usdawatercolors.nal.usda.gov) is a 502 and has
// been folded into an Ex Libris Primo instance whose image URLs are neither
// stable nor CORS-clean. Commons holds all 7,584 plates under names that are
// a pure function of the NAL barcode —
//   File:Pomological Watercolor POM00000001.jpg
// — serves any width from upload.wikimedia.org with
// `access-control-allow-origin: *`, and carries the NAL catalogue record in
// the file's own wikitext. That combination is what makes a no-hosting
// dashboard possible: an id is enough to build an <img src>.
//
// The description line is machine-written by the original upload batch and is
// regular enough to parse:
//   "Image of the Ben Davis variety of apples (scientific name: Malus
//    domestica), with this specimen originating in <place>."
// A little under 2% of plates deviate; those keep their full description as
// free text and simply carry fewer facets. `--report` prints the coverage.

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, 'public', 'pom', 'data');

const API = 'https://commons.wikimedia.org/w/api.php';
const UA = 'minomobi-pom-harvest/1.0 (https://photo.mino.mobi/pom/; one-off metadata build)';
const PREFIX = 'Pomological Watercolor POM';

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n, d) => { const i = argv.indexOf(n); return i < 0 ? d : argv[i + 1]; };
const LIMIT = Number(opt('--limit', '0')) || 0;

async function api(params) {
  const url = new URL(API);
  url.search = new URLSearchParams({ format: 'json', formatversion: '2', ...params });
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      if (j.error) throw new Error(j.error.info || 'api error');
      return j;
    } catch (err) {
      if (attempt >= 4) throw err;
      await new Promise((res) => setTimeout(res, 1000 * 2 ** attempt));
    }
  }
}

/** Every File: page whose name starts with the collection prefix. */
async function listTitles() {
  const titles = [];
  let cont;
  do {
    const j = await api({
      action: 'query',
      list: 'allimages',
      aiprefix: PREFIX,
      ailimit: '500',
      aiprop: 'size',
      ...(cont ? { aicontinue: cont } : {}),
    });
    for (const im of j.query.allimages) {
      if (!/^Pomological Watercolor POM\d+\.(jpg|jpeg|png|tif|tiff)$/i.test(im.name.replace(/_/g, ' '))) continue;
      titles.push({ title: `File:${im.name.replace(/_/g, ' ')}`, w: im.width, h: im.height });
    }
    cont = j.continue?.aicontinue;
    process.stderr.write(`\r  listed ${titles.length}`);
    if (LIMIT && titles.length >= LIMIT) break;
  } while (cont);
  process.stderr.write('\n');
  return LIMIT ? titles.slice(0, LIMIT) : titles;
}

/** Wikitext + dimensions for a batch of up to 50 titles. */
async function fetchBatch(titles) {
  const j = await api({
    action: 'query',
    prop: 'revisions|imageinfo',
    rvprop: 'content',
    rvslots: 'main',
    iiprop: 'size',
    titles: titles.join('|'),
  });
  return j.query?.pages || [];
}

// ── parsing ────────────────────────────────────────────────────────────────

/**
 * Strip the wiki markup that survives inside a description body.
 *
 * ⚠️ The language wrapper has to be UNWRAPPED before the generic
 * template-stripping pass, or it takes the sentence with it: every
 * description on these pages is `{{en|Image of the …}}`, and deleting
 * `{{…}}` wholesale leaves an empty string for all 7,584 plates. That was the
 * first run, and it looked like Commons had no descriptions at all.
 */
function plain(s) {
  let t = String(s);
  for (let pass = 0; pass < 3; pass++) {
    t = t.replace(/\{\{\s*(?:en|de|fr|es|lang\|[a-z-]+)\s*\|([^{}]*)\}\}/gi, '$1');
  }
  return t
    .replace(/\{\{[Ww]\|([^|}]+)(\|[^}]*)?\}\}/g, '$1')
    .replace(/\{\{[^{}]*\}\}/g, ' ')
    .replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, '$1')
    .replace(/\[\[([^\]]*)\]\]/g, '$1')
    .replace(/'''?/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Read one `|field=` out of a template body, stopping at the next `|` that is
 * at brace/bracket depth zero — values routinely contain `{{creator:...}}`
 * and `[[...|...]]`, both of which carry their own pipes.
 */
function field(text, name) {
  const re = new RegExp(`\\|\\s*${name}\\s*=`, 'i');
  const m = re.exec(text);
  if (!m) return '';
  let depth = 0;
  let i = m.index + m[0].length;
  const start = i;
  for (; i < text.length; i++) {
    const two = text.slice(i, i + 2);
    if (two === '{{' || two === '[[') { depth++; i++; continue; }
    if (two === '}}' || two === ']]') { depth--; i++; continue; }
    if (text[i] === '|' && depth <= 0) break;
    if (text[i] === '\n' && depth <= 0 && /^\s*[|}]/.test(text.slice(i + 1, i + 40))) break;
  }
  return text.slice(start, i).trim();
}

/**
 * Take the machine-written description apart clause by clause rather than
 * with one big pattern.
 *
 * The batch wrote four shapes, not one, and a single regex that demanded all
 * of them dropped ~10% of the collection to free text — including every plate
 * of a species with no named cultivar, which is most of the plant-explorer
 * material and the most interesting part of the archive:
 *
 *   Image of the Ben Davis variety of apples (scientific name: Malus domestica),
 *     with this specimen originating in <place>.
 *   Image of apples (scientific name: Malus domestica).
 *   Image of the Sanguinea variety, with this specimen originating in <place>.
 *   Image of apples (scientific name: Malus domestica), showing copper injury
 *     on the fruits and leaves.
 *
 * So: strip the clauses that announce themselves, and whatever is left over
 * is the common name. Anything that does not start "Image of" keeps its whole
 * description as free text and carries no facets.
 */
function parseDesc(desc) {
  const out = { variety: '', fruit: '', sci: '', place: '', note: '', desc: '' };
  // `{{en|1=Image of …}}` — the named-parameter form the uploader reached for
  // whenever the description contained an `=` (a URL, a hybrid cross). Unwrapping
  // the template leaves the `1=` behind, and 4 plates lost every facet to it.
  let s = desc.replace(/\s+/g, ' ').replace(/^1=\s*/, '').trim();
  // A handful say "Image (scientific name: …)" with no "of" — species-only
  // plates from the plant explorers, which is exactly the material worth having.
  if (!/^Image\b/i.test(s)) { out.desc = s; return out; }
  s = s.replace(/^Image(?:\s+of)?\s*/i, '');

  const variety = /^the\s+(.+?)\s+variet(?:y|ies)(?:\s+of\s+|(?=\s*[,.])|$)/i.exec(s);
  if (variety) { out.variety = tidy(variety[1]); s = s.slice(variety[0].length); }

  const sci = /\(scientific name:\s*([^()]*?)\s*\)/i.exec(s);
  if (sci) { out.sci = tidy(sci[1]); s = `${s.slice(0, sci.index)} ${s.slice(sci.index + sci[0].length)}`; }

  const place = /,?\s*with this specimen (?:originating|collected)\s+(?:in|from|at)\s+(.+?)\s*\.?$/i.exec(s);
  if (place) { out.place = tidy(place[1]); s = s.slice(0, place.index); }

  // "showing copper injury on the fruits and leaves", "as it appeared in 1937"
  const note = /,\s*((?:showing|depicting|as |illustrating)[^,]*(?:,[^,]*)*)\.?\s*$/i.exec(s);
  if (note) { out.note = tidy(note[1]); s = s.slice(0, note.index); }

  out.fruit = tidy(s).replace(/^(?:an?|the)\s+/i, '').toLowerCase();
  if (!out.fruit && !out.variety && !out.sci) out.desc = desc;
  return out;
}

/** The date templates the batch used: {{ISOdate|1908-09-03}}, plain ISO, a bare year. */
function parseDate(raw) {
  const iso = /(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/.exec(raw || '');
  if (!iso) return { date: '', year: 0 };
  const y = Number(iso[1]);
  if (y < 1850 || y > 1960) return { date: '', year: 0 };
  const date = [iso[1], iso[2], iso[3]].filter(Boolean).join('-');
  return { date, year: y };
}

/**
 * "Passmore, Deborah Griscom, 1840-1911" and `{{creator:…}}` both land here,
 * and both have to come out as "Deborah Griscom Passmore" — the *same* string,
 * or one painter appears twice in the facet list with her work split between
 * the two spellings. That is not hypothetical: the first pass shipped 26
 * painters where the collection has 21, because "Steadman, Royal Charles,
 * b. 1875" carried a death-less life span the date-stripper did not know, and
 * "Strange, M" had a one-letter forename the inverter would not accept.
 *
 * Three shapes, each of which had a plate behind it:
 *   Arnold, Mary Daisy, ca. 1873-1955        →  Mary Daisy Arnold
 *   Steadman, Royal Charles, b. 1875         →  Royal Charles Steadman
 *   Passmore, Deborah Griscom, 1840-1911 , Heiges, Bertha
 *                                            →  Deborah Griscom Passmore & Bertha Heiges
 *
 * The joint form is separated by a **space-comma-space** where the inverted
 * form uses a bare comma, which is the only thing distinguishing "surname,
 * forename" from "painter, painter" — so the split has to be on the spaces.
 */
function parseArtist(raw) {
  let s = raw;
  const creator = /\{\{\s*[Cc]reator:([^}|]+)/.exec(s);
  if (creator) s = creator[1];
  const names = plain(s).split(/\s+,\s+(?=[A-Z])/).map(oneArtist).filter(Boolean);
  return [...new Set(names)].join(' & ');
}

function oneArtist(raw) {
  const s = raw
    // "1840-1911", "b. 1875", "ca. 1873-1955", "1873-" — every life span the
    // batch used, trailing.
    .replace(/,?\s*(?:b\.|d\.|fl\.|ca\.)?\s*\d{4}\??\s*(?:-\s*(?:ca\.\s*)?\d{0,4}\??)?\s*$/, '')
    .replace(/\s*\(.*?\)\s*$/, '')
    // A trailing full stop is NOT stripped: it belongs to an initial ("Burn,
    // W. L."), and taking it turned two painters into "W. L Burn".
    .replace(/[,;]\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  const comma = s.indexOf(',');
  if (comma <= 0 || s.indexOf(',', comma + 1) !== -1) return s;
  const last = s.slice(0, comma).trim();
  const first = s.slice(comma + 1).trim();
  return /^[A-Z]/.test(last) && /^[A-Z]/.test(first) ? `${first} ${last}` : s;
}

/**
 * The broad geography, off the end of the place string.
 *
 * Places arrive fully qualified — "Hood River, Hood River County, Oregon,
 * United States" — which is precise and useless as a filter: 1,658 distinct
 * values, almost all of them singletons. The last component is the country,
 * and for the United States the one before it is the state, which turns the
 * same data into fifty-odd browsable buckets and makes the collection's
 * geography legible: where the department was collecting fruit, and when it
 * started sending people abroad for it.
 */
function regionOf(place) {
  if (!place) return '';
  const parts = place.split(',').map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return '';
  const country = parts[parts.length - 1];
  if (country !== 'United States') return country;
  return parts.length >= 2 ? parts[parts.length - 2] : country;
}

function parse(page, dims) {
  const title = page.title.replace(/^File:/, '');
  const idm = /POM(\d+)\./i.exec(title);
  if (!idm) return null;
  const id = Number(idm[1]);
  const text = page.revisions?.[0]?.slots?.main?.content || '';
  const ii = page.imageinfo?.[0] || {};

  const rawDesc = field(text, 'description');
  const desc = plain(rawDesc)
    // The batch appended the same provenance sentence to a subset of plates;
    // it is the same for all of them and is stated once on the page instead.
    .replace(/\s*Source: U\.S\. Department of Agriculture Pomological Watercolor Collection\..*$/i, '')
    .trim();

  const m = parseDesc(desc);
  const artistRaw = field(text, 'artist') || field(text, 'author') || '';
  const { date, year } = parseDate(field(text, 'date'));

  const medium = plain(field(text, 'medium'));
  return {
    id,
    w: ii.width || dims?.w || 0,
    h: ii.height || dims?.h || 0,
    shard: shardOf(title),
    file: title,
    variety: m.variety,
    fruit: m.fruit,
    sci: m.sci,
    place: m.place,
    note: m.note,
    desc: m.desc,
    date,
    year,
    artist: parseArtist(artistRaw),
    region: regionOf(m.place),
    medium,
  };
}

function tidy(s) {
  return plain(s).replace(/^[,\s]+|[,.\s]+$/g, '').replace(/\s+/g, ' ');
}

/**
 * upload.wikimedia.org shards by the md5 of the underscored filename: the
 * first hex character, then the first two. Computing it here rather than in
 * the browser is what lets a tile be a plain <img src> with no redirect and
 * no md5 implementation on the client.
 */
function shardOf(file) {
  return createHash('md5').update(file.replace(/ /g, '_'), 'utf8').digest('hex').slice(0, 2);
}

// ── packing ────────────────────────────────────────────────────────────────

/**
 * Columnar + dictionary-encoded. 7,584 rows of prose is ~1.4 MB of JSON and
 * the same data packed this way is under 500 kB before compression, which
 * matters because the whole point of the page is that every plate is in the
 * tab at once — filtering 7,584 rows is instant, fetching them one screen at
 * a time is not.
 */
function pack(rows) {
  rows.sort((a, b) => a.id - b.id);
  const dicts = {};
  const encode = (name, values) => {
    const index = new Map();
    const list = [];
    const out = values.map((v) => {
      const k = v || '';
      if (!k) return -1;
      if (!index.has(k)) { index.set(k, list.length); list.push(k); }
      return index.get(k);
    });
    dicts[name] = list;
    return out;
  };

  return {
    $comment: 'GENERATED by photo/harvest-pom.mjs from Wikimedia Commons. Do not hand-edit.',
    source: {
      catalogue: 'Wikimedia Commons — Category:USDA Pomological Watercolors',
      images: 'upload.wikimedia.org',
      collection: 'USDA Pomological Watercolor Collection, National Agricultural Library',
      license: 'Public domain (work of the U.S. federal government)',
      harvested: new Date().toISOString().slice(0, 10),
    },
    count: rows.length,
    dicts,
    cols: {
      id: rows.map((r) => r.id),
      // 0 = Wikimedia Commons, 1 = Internet Archive. See SOURCES in js/pom.js.
      src: rows.map((r) => (r.src === 'ia' ? 1 : 0)),
      shard: rows.map((r) => r.shard),
      w: rows.map((r) => r.w),
      h: rows.map((r) => r.h),
      year: rows.map((r) => r.year),
      date: rows.map((r) => r.date),
      variety: rows.map((r) => r.variety),
      note: rows.map((r) => r.note),
      desc: rows.map((r) => r.desc),
      fruit: encode('fruit', rows.map((r) => r.fruit)),
      sci: encode('sci', rows.map((r) => r.sci)),
      place: encode('place', rows.map((r) => r.place)),
      region: encode('region', rows.map((r) => r.region)),
      artist: encode('artist', rows.map((r) => r.artist)),
    },
  };
}

// ── main ───────────────────────────────────────────────────────────────────

const t0 = Date.now();
console.error(`harvesting "${PREFIX}*" from Commons…`);
const titles = await listTitles();
console.error(`  ${titles.length} plates`);

const byTitle = new Map(titles.map((t) => [t.title, t]));
const rows = [];
const batches = [];
for (let i = 0; i < titles.length; i += 50) batches.push(titles.slice(i, i + 50).map((t) => t.title));

let done = 0;
const CONCURRENCY = 4;
await Promise.all(Array.from({ length: CONCURRENCY }, async (_, lane) => {
  for (let b = lane; b < batches.length; b += CONCURRENCY) {
    const pages = await fetchBatch(batches[b]);
    for (const page of pages) {
      if (page.missing) continue;
      const row = parse(page, byTitle.get(page.title));
      if (row) rows.push(row);
    }
    done++;
    process.stderr.write(`\r  ${done}/${batches.length} batches · ${rows.length} rows`);
  }
}));
process.stderr.write('\n');

// ── the gap, and who else has it ───────────────────────────────────────────
// Commons is 7 plates short of the collection's 7,584. Four of those seven are
// on the Internet Archive's mirror of the NAL scans, so the dashboard can still
// show them — with no catalogue record, because IA holds the pixels and nothing
// else. The remaining three are on neither and are named on the page rather
// than quietly dropped: "7,581 of 7,584" is a fact about the archives, and
// rounding it to "all of them" would be the first lie the page tells.
const IA_ITEM = 'usda-pomological-watercolor-collection';

/**
 * The four, recorded. archive.org is checked when it answers and this list is
 * the fallback when it does not — a metadata endpoint that hands back an HTML
 * error page (it does, under load) must not throw away a harvest that already
 * cost 152 API round trips, and it must not silently produce a catalogue four
 * plates shorter than the last one either.
 */
const IA_ONLY = [2828, 3313, 3535, 4681];

async function iaCoverage() {
  try {
    const r = await fetch(`https://archive.org/metadata/${IA_ITEM}`, { headers: { 'user-agent': UA } });
    const text = await r.text();
    const meta = JSON.parse(text);
    const ids = new Set();
    for (const f of meta.files || []) {
      const m = /^POM(\d{8})\.jpg$/.exec(f.name);
      if (m) ids.add(Number(m[1]));
    }
    if (ids.size < 7000) throw new Error(`only ${ids.size} scans listed`);
    return ids;
  } catch (err) {
    console.error(`  ! archive.org would not answer (${err.message}); using the recorded list`);
    return new Set(IA_ONLY);
  }
}

if (!LIMIT && !flag('--no-ia')) {
  const have = new Set(rows.map((r) => r.id));
  const iaHas = await iaCoverage();
  const fresh = [...iaHas].filter((id) => !have.has(id) && id <= 7584).sort((a, b) => a - b);
  if (fresh.join() !== IA_ONLY.join()) {
    console.error(`  ! IA_ONLY is stale — the archives now differ by [${fresh}], recorded [${IA_ONLY}]`);
  }
  let added = 0;
  for (let id = 1; id <= 7584; id++) {
    if (have.has(id) || !iaHas.has(id)) continue;
    rows.push({
      id, src: 'ia', w: 0, h: 0, shard: '', file: `POM${String(id).padStart(8, '0')}.jpg`,
      variety: '', fruit: '', sci: '', place: '', region: '', note: '', desc: '', date: '', year: 0,
      artist: '', medium: '',
    });
    added++;
  }
  console.error(`  + ${added} plates from the Internet Archive mirror (not on Commons)`);
}

const packed = pack(rows);
await mkdir(OUT_DIR, { recursive: true });
await writeFile(join(OUT_DIR, 'index.json'), `${JSON.stringify(packed)}\n`);

const structured = rows.filter((r) => r.fruit || r.variety || r.sci).length;
const report = {
  plates: rows.length,
  structured,
  freeText: rows.filter((r) => r.desc).length,
  withFruit: rows.filter((r) => r.fruit).length,
  withVariety: rows.filter((r) => r.variety).length,
  withDate: rows.filter((r) => r.year).length,
  withArtist: rows.filter((r) => r.artist).length,
  withPlace: rows.filter((r) => r.place).length,
  fruits: packed.dicts.fruit.length,
  species: packed.dicts.sci.length,
  artists: packed.dicts.artist.length,
  places: packed.dicts.place.length,
  regions: packed.dicts.region.length,
  years: [Math.min(...rows.filter((r) => r.year).map((r) => r.year)),
    Math.max(...rows.filter((r) => r.year).map((r) => r.year))],
  bytes: JSON.stringify(packed).length,
  seconds: Math.round((Date.now() - t0) / 1000),
};
// The collection is 7,584 plates. Whatever Commons is missing is a real hole in
// the dashboard, so it gets counted out loud rather than rounded away: the
// Internet Archive mirror has POM00000001–POM00007584 and is where a gap would
// have to be filled from.
if (!LIMIT) {
  const have = new Set(rows.map((r) => r.id));
  report.missing = [];
  for (let i = 1; i <= 7584; i++) if (!have.has(i)) report.missing.push(`POM${String(i).padStart(8, '0')}`);
}
console.error(JSON.stringify(report, null, 2));

if (flag('--report')) {
  const counts = new Map();
  for (const r of rows) counts.set(r.fruit || '(free text)', (counts.get(r.fruit || '(free text)') || 0) + 1);
  console.error([...counts].sort((a, b) => b[1] - a[1]).slice(0, 40)
    .map(([k, v]) => `  ${String(v).padStart(5)}  ${k}`).join('\n'));
  console.error('\nunparsed samples:');
  for (const r of rows.filter((x) => !x.fruit).slice(0, 15)) console.error(`  POM${String(r.id).padStart(8, '0')}  ${r.desc.slice(0, 110)}`);
}
