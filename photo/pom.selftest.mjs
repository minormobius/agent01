#!/usr/bin/env node
// pom.selftest.mjs — proves the pure half of /pom, and proves the committed
// catalogue is the shape the page expects.
//
//   node photo/pom.selftest.mjs
//
// `node scripts/preflight.mjs` runs it whenever photo/ changes.
//
// The thing this file exists to stop is the failure that has no symptom in the
// code: upload.wikimedia.org serves ELEVEN thumbnail widths and returns a 400
// HTML page for every other width. A refactor that computes `240px-…` instead
// of `250px-…` produces a grid of 7,581 broken frames from code that reads
// perfectly, so every URL the module can emit is checked against the list.

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const M = await import(join(HERE, 'public', 'pom', 'js', 'pom.js'));

let failures = 0;
let checks = 0;
function ok(cond, what, detail) {
  checks++;
  if (cond) return;
  failures++;
  console.error(`  ✗ ${what}${detail ? `\n      ${detail}` : ''}`);
}
function group(name) { console.error(`\n${name}`); }

const packed = JSON.parse(readFileSync(join(HERE, 'public', 'pom', 'data', 'index.json'), 'utf8'));
const index = M.unpack(packed);

// ── the catalogue ──────────────────────────────────────────────────────────

group('the committed catalogue');
ok(index.count > 7000, 'holds the collection', `count = ${index.count}`);
ok(index.rows.length === index.count, 'unpacks to as many rows as it claims');
ok(new Set(index.rows.map((r) => r.id)).size === index.count, 'every barcode is distinct');
ok(index.rows.every((r) => r.id >= 1 && r.id <= 7584), 'every barcode is inside the collection');
{
  const sorted = index.rows.every((r, i) => i === 0 || index.rows[i - 1].id < r.id);
  ok(sorted, 'rows arrive in barcode order');
}
{
  // A Commons row with no shard is a row whose <img src> cannot be built —
  // it renders as a broken frame and nothing in the app would say why.
  const bad = index.rows.filter((r) => r.src === M.COMMONS && !/^[0-9a-f]{2}$/.test(r.shard));
  ok(bad.length === 0, 'every Commons plate carries an md5 shard', bad.slice(0, 3).map((r) => M.barcode(r.id)).join(', '));
}
{
  // The shard is the first two hex characters of the md5 of the underscored
  // filename. Recomputing it here is what makes the harvester's arithmetic
  // reviewable without a network: if this drifts, every tile 404s.
  const sample = index.rows.filter((r) => r.src === M.COMMONS).slice(0, 200);
  const wrong = sample.filter((r) => {
    const file = `Pomological_Watercolor_${M.barcode(r.id)}.jpg`;
    return createHash('md5').update(file, 'utf8').digest('hex').slice(0, 2) !== r.shard;
  });
  ok(wrong.length === 0, 'the shard really is md5(filename)[0..2]', wrong.slice(0, 3).map((r) => M.barcode(r.id)).join(', '));
}
{
  const withFacet = index.rows.filter((r) => r.fruit || r.variety || r.sci).length;
  ok(withFacet / index.count > 0.98, 'over 98% of plates carry catalogue facets',
    `${withFacet}/${index.count}`);
  const dated = index.rows.filter((r) => r.year).length;
  ok(dated / index.count > 0.9, 'over 90% carry a date', `${dated}/${index.count}`);
}
ok(index.years[0] === 1886 && index.years[1] <= 1950,
  'the span is the collection\'s', `${index.years[0]}–${index.years[1]}`);
{
  const ia = index.rows.filter((r) => r.src === M.IA);
  ok(ia.length > 0 && ia.length < 20, 'a handful of plates come from the Internet Archive', `${ia.length}`);
  ok(ia.every((r) => !r.shard), 'Internet Archive plates carry no Commons shard');
}

// ── the eleven widths ──────────────────────────────────────────────────────

group('the eleven permitted Commons widths');
ok(M.COMMONS_WIDTHS.every((w, i) => i === 0 || w > M.COMMONS_WIDTHS[i - 1]), 'the list is ascending');
for (const want of [1, 19, 20, 21, 61, 119, 120, 121, 240, 250, 251, 331, 499, 700, 961, 1281, 5000]) {
  const b = M.bucket(want);
  ok(M.COMMONS_WIDTHS.includes(b), `bucket(${want}) is a permitted width`, `got ${b}`);
  ok(b >= want || b === 3840, `bucket(${want}) rounds up, never down`, `got ${b}`);
}
{
  // The real guarantee: no reachable width, at any device pixel ratio or
  // viewport, can produce a URL Wikimedia will refuse.
  const commonsRow = index.rows.find((r) => r.src === M.COMMONS);
  let offList = 0;
  for (let want = 1; want <= 4200; want++) {
    const url = M.thumbUrl(commonsRow, want);
    const px = Number(/\/(\d+)px-/.exec(url)?.[1]);
    if (!M.COMMONS_WIDTHS.includes(px)) offList++;
  }
  ok(offList === 0, 'no requested size produces an off-list URL', `${offList} of 4200 would 400`);
}
{
  const row = index.rows.find((r) => r.src === M.COMMONS);
  const url = M.thumbUrl(row, 250);
  const file = `Pomological_Watercolor_${M.barcode(row.id)}.jpg`;
  ok(url === `https://upload.wikimedia.org/wikipedia/commons/thumb/${row.shard[0]}/${row.shard}/${file}/250px-${file}`,
    'a Commons thumbnail URL is built exactly the way upload.wikimedia.org shards', url);
  ok(M.fullUrl(row) === `https://upload.wikimedia.org/wikipedia/commons/${row.shard[0]}/${row.shard}/${file}`,
    'the full scan URL drops the /thumb/ segment and the size', M.fullUrl(row));
}
{
  const ia = index.rows.find((r) => r.src === M.IA);
  if (ia) {
    ok(M.thumbUrl(ia, 250).endsWith('_thumb.jpg'), 'an Internet Archive tile uses the small derivative');
    ok(!M.thumbUrl(ia, 960).includes('_thumb'), 'an Internet Archive lightbox falls through to the original');
    ok(!M.thumbUrl(ia, 250).includes('px-'), 'an Internet Archive URL never borrows the Commons size syntax');
  }
}
group('the mirror');
{
  // The tile fallback. Both archives hold the same barcode, so the retry is a
  // string substitution — but only in the direction that has somewhere to go.
  let wrong = 0;
  for (const row of index.rows) {
    const m = M.mirrorUrl(row);
    if (!/^https:\/\/(archive\.org|upload\.wikimedia\.org)\//.test(m)) wrong++;
    if (!m.includes(M.barcode(row.id))) wrong++;
    if (row.src === M.COMMONS && !m.startsWith('https://archive.org/')) wrong++;
  }
  ok(wrong === 0, 'every plate has a mirror on the other archive', `${wrong} bad`);
  const commonsRow = index.rows.find((r) => r.src === M.COMMONS);
  ok(M.mirrorUrl(commonsRow) !== M.thumbUrl(commonsRow, 250),
    'and the mirror is a different host from the primary — a retry against the same URL is not a retry');
  const ia = index.rows.find((r) => r.src === M.IA);
  if (ia) {
    ok(!M.mirrorUrl(ia).includes('upload.wikimedia.org'),
      'an Internet Archive plate is not sent to Commons, which never received it');
  }
}

{
  // Every plate on the page, at every size the app can ask for. This is the
  // check that would have caught a shard column silently emptied by a harvest
  // regression, which no unit test of `bucket()` ever would.
  let bad = 0;
  for (const row of index.rows) {
    for (const want of [120, 250, 330, 960, 1280]) {
      const u = M.thumbUrl(row, want);
      if (!/^https:\/\/(upload\.wikimedia\.org|archive\.org)\//.test(u)) bad++;
      if (u.includes('undefined') || u.includes('//thumb') || /\/\/[a-z]\//.test(u.slice(8))) bad++;
    }
  }
  ok(bad === 0, 'all 7,581 plates build a well-formed URL at every size used', `${bad} malformed`);
}

// ── selection ──────────────────────────────────────────────────────────────

group('filtering');
{
  const all = M.select(index, {});
  ok(all.length === index.count, 'no filters selects everything');

  const apples = M.select(index, { fruit: 'apples' });
  ok(apples.length > 3000 && apples.length < index.count, 'the fruit facet narrows', `${apples.length}`);
  ok(apples.every((i) => index.rows[i].fruit === 'apples'), 'and narrows to exactly that fruit');

  const region = M.select(index, { region: 'California' });
  ok(region.length > 100, 'the region facet narrows', `${region.length}`);
  ok(region.every((i) => index.rows[i].region === 'California'), 'and to exactly that region');
  ok(region.every((i) => index.rows[i].place.includes('California')),
    'a region is derived from the place string, so the two agree');

  const artist = M.facet(index, all, 'artist')[0][0];
  const byArtist = M.select(index, { artist });
  ok(byArtist.every((i) => index.rows[i].artist === artist), `the painter facet narrows to ${artist}`);

  const both = M.select(index, { fruit: 'apples', artist });
  ok(both.length <= Math.min(apples.length, byArtist.length), 'two facets intersect rather than union');
  ok(both.every((i) => index.rows[i].fruit === 'apples' && index.rows[i].artist === artist),
    'and every row satisfies both');
}
{
  const span = M.select(index, { y0: 1900, y1: 1909 });
  ok(span.every((i) => index.rows[i].year >= 1900 && index.rows[i].year <= 1909), 'a year span holds');
  // The rule that makes the count honest: an undated plate is not quietly
  // carried through a year filter.
  ok(span.every((i) => index.rows[i].year), 'a year span excludes undated plates');
  const open = M.select(index, { y1: 1899 });
  ok(open.every((i) => index.rows[i].year && index.rows[i].year <= 1899), 'a half-open span holds too');
}
{
  const q = M.select(index, { q: 'winesap' });
  ok(q.length > 0, 'a text search finds something');
  ok(q.every((i) => JSON.stringify(index.rows[i]).toLowerCase().includes('winesap')),
    'and every hit really contains the term');

  // Terms are ANDed across the whole record, not within one field — the point
  // of typing three words is to combine them.
  const two = M.select(index, { q: 'winesap virginia' });
  ok(two.length < q.length, 'a second term narrows further', `${q.length} → ${two.length}`);
  ok(M.select(index, { q: '   ' }).length === index.count, 'whitespace is not a search');
  ok(M.select(index, { q: 'POM00000001' }).length === 1, 'a barcode finds its one plate');
}
{
  const none = M.select(index, { fruit: 'no such fruit at all' });
  ok(none.length === 0, 'an impossible filter selects nothing rather than everything');
}

group('facet counts');
{
  const all = M.select(index, {});
  const fruits = M.facet(index, all, 'fruit');
  ok(fruits.length > 100, 'the collection covers a hundred-odd fruits', `${fruits.length}`);
  ok(fruits[0][0] === 'apples', 'apples lead', fruits[0].join(' '));

  // A facet with one value is not a filter. `kind` shipped as one — every
  // plate in the collection is catalogued as a watercolour — and a control
  // whose only move is a no-op is worse than no control.
  for (const key of ['fruit', 'artist', 'sci', 'region', 'place']) {
    ok(M.facet(index, all, key).length > 1, `the ${key} facet has more than one value`);
  }
  // And the painters really are the collection's painters, not two spellings
  // of each: the batch wrote "Arnold, Mary Daisy, ca. 1873-1955" in some
  // records and {{creator:...}} in others.
  const artists = M.facet(index, all, 'artist');
  const solo = artists.filter(([a]) => !a.includes(' & '));
  ok(solo.length <= 24, 'the painter list is people, not spellings', `${solo.length} names`);
  const surnames = solo.map(([a]) => a.split(' ').pop());
  ok(new Set(surnames).size === surnames.length,
    'no two painter entries share a surname — the tell for an un-inverted duplicate',
    surnames.filter((s2, i) => surnames.indexOf(s2) !== i).join(', '));
  ok(!artists.some(([a]) => /,/.test(a) && !a.includes(' & ')),
    'no painter is still in "Surname, Forename" order',
    artists.filter(([a]) => /,/.test(a) && !a.includes(' & ')).map(([a]) => a).join(' | '));
  ok(!artists.some(([a]) => /\b\d{4}\b/.test(a)), 'no painter carries a life span');
  ok(fruits.every((f, i) => i === 0 || fruits[i - 1][1] >= f[1]), 'counts descend');
  const summed = fruits.reduce((a, [, n]) => a + n, 0);
  ok(summed <= all.length, 'no plate is counted into two values of one facet');

  const apples = M.select(index, { fruit: 'apples' });
  const painters = M.facet(index, apples, 'artist');
  ok(painters.reduce((a, [, n]) => a + n, 0) <= apples.length,
    'a facet counted over a narrowed set stays inside it');
  ok(M.facet(index, all, 'fruit', 5).length === 5, 'the limit is honoured');
}

group('the year histogram');
{
  const all = M.select(index, {});
  const bars = M.histogram(index, all);
  ok(bars.length === index.years[1] - index.years[0] + 1, 'a bar per year across the whole span, gaps included');
  ok(bars[0][0] === index.years[0], 'it starts at the first year');
  const total = bars.reduce((a, [, n]) => a + n, 0) + bars.undated;
  ok(total === all.length, 'every plate lands in exactly one bar or in `undated`',
    `${total} vs ${all.length}`);
  ok(bars.undated > 0, 'and undated plates are counted out loud rather than dropped');
}

group('sorting');
{
  const all = M.select(index, {});
  for (const sort of Object.keys(M.SORTS)) {
    const s = M.sortIds(index, all, sort);
    ok(s.length === all.length, `sort ${sort} keeps every row`);
    ok(new Set(s).size === s.length, `sort ${sort} duplicates nothing`);
    // Determinism: the same set sorted twice must not disagree, or toggling a
    // control reshuffles the grid for no reason the reader can see.
    ok(JSON.stringify(M.sortIds(index, all.slice().reverse(), sort)) === JSON.stringify(s),
      `sort ${sort} is total — input order cannot change the result`);
  }
  const byYear = M.sortIds(index, all, 'year').map((i) => index.rows[i].year || 9999);
  ok(byYear.every((y, i) => i === 0 || byYear[i - 1] <= y), 'earliest-first really ascends');
  const byLatest = M.sortIds(index, all, '-year').map((i) => index.rows[i].year || 0);
  ok(byLatest.every((y, i) => i === 0 || byLatest[i - 1] >= y), 'latest-first really descends');
  ok(M.sortIds(index, all, 'nonsense').length === all.length, 'an unknown sort falls back rather than throwing');
}

// ── layout ─────────────────────────────────────────────────────────────────

group('the justified layout');
{
  const aspects = index.rows.slice(0, 400).map((r) => r.aspect);
  const W = 1000; const T = 230; const G = 10;
  const plan = M.justify(aspects, W, T, G);
  ok(plan.rows.length > 0, 'it produces rows');
  ok(plan.rows[0].from === 0, 'the first row starts at the first plate');
  ok(plan.rows[plan.rows.length - 1].to === aspects.length, 'the last row ends at the last plate');
  for (let i = 1; i < plan.rows.length; i++) {
    ok(plan.rows[i].from === plan.rows[i - 1].to, `row ${i} continues where ${i - 1} stopped`);
  }
  // Every full row spans the container exactly — that is the whole claim of a
  // justified layout, and the arithmetic is easy to get half a pixel wrong.
  let ragged = 0;
  for (let i = 0; i < plan.rows.length - 1; i++) {
    const r = plan.rows[i];
    let w = 0;
    for (let k = r.from; k < r.to; k++) w += aspects[k] * r.h;
    w += G * (r.to - r.from - 1);
    if (Math.abs(w - W) > 0.5) ragged++;
  }
  ok(ragged === 0, 'every row but the last spans the width exactly', `${ragged} ragged`);
  // The last row keeps the target height instead of blowing one plate up to
  // full width, which reads as a bug every time.
  ok(plan.rows[plan.rows.length - 1].h <= T + 0.001, 'the last row is not stretched');
  const heights = plan.rows.map((r) => r.h);
  ok(heights.every((h) => h > 0 && Number.isFinite(h)), 'no row has a degenerate height');
  ok(Math.abs(plan.height - (plan.rows.at(-1).y + plan.rows.at(-1).h)) < 0.001,
    'the reported total height is where the last row ends');

  ok(M.justify([], W, T, G).rows.length === 0, 'no plates lays out no rows');
  ok(M.justify([0.66], W, T, G).rows.length === 1, 'one plate is one row');
  ok(M.justify(aspects, 0, T, G).rows.length === 0, 'a zero-width container lays out nothing rather than looping');
}

group('virtualisation');
{
  const aspects = index.rows.map((r) => r.aspect);
  const plan = M.justify(aspects, 1200, 230, 10);
  const [a, b] = M.visibleRows(plan, 0, 800);
  ok(a === 0, 'the top of the scroll starts at the first row');
  ok(b < plan.rows.length, 'and does not mount the whole collection', `${b} of ${plan.rows.length}`);
  const [c, d] = M.visibleRows(plan, plan.height - 400, 800);
  ok(d === plan.rows.length, 'the bottom reaches the last row');
  ok(c > 0, 'and does not start from the top');
  // The window must cover the viewport with nothing missing in the middle —
  // a binary search off by one shows up as a band of blank page.
  for (const top of [0, 500, 5000, 50000, plan.height / 2, plan.height - 10]) {
    const [from, to] = M.visibleRows(plan, top, 900);
    const covered = plan.rows.slice(from, to);
    const gap = plan.rows.some((r) => r.y + r.h > top && r.y < top + 900 && !covered.includes(r));
    ok(!gap, `nothing visible at scrollTop=${Math.round(top)} is left unmounted`);
  }
}

// ── the address bar ────────────────────────────────────────────────────────

group('the address bar');
{
  const trip = (s) => M.parseState(M.encodeState({ ...M.EMPTY_STATE, ...s }));
  const cases = [
    {}, { q: 'winesap' }, { fruit: 'apples' }, { fruit: 'apples', artist: 'Mary Daisy Arnold' },
    { y0: 1900, y1: 1909 }, { y1: 1899 }, { sort: 'year' }, { id: 5861 },
    { region: 'California' }, { place: 'Washington, D.C., United States' },
    { q: 'a b', fruit: 'peaches', y0: 1930, y1: 1940, sort: 'artist', id: 12 },
  ];
  for (const c of cases) {
    const round = trip(c);
    for (const [k, v] of Object.entries(c)) {
      ok(round[k] === v, `${k}=${v} survives the round trip`, `got ${round[k]}`);
    }
  }
  ok(M.encodeState({ ...M.EMPTY_STATE }) === '', 'the empty state is an empty query string');
  ok(!M.encodeState({ ...M.EMPTY_STATE, id: 0 }).includes('id'), 'a zero id is not written');
  ok(M.parseState('?sort=nope').sort === 'id', 'a bogus sort falls back rather than selecting nothing');
  const flipped = M.parseState('?y0=1930&y1=1900');
  ok(flipped.y0 === 1900 && flipped.y1 === 1930, 'a backwards year span is repaired, not obeyed');
  ok(M.parseState('').q === '', 'no query string is the empty state');
  // A shared link is the whole point of state living in the URL.
  const shared = M.parseState(M.encodeState({ ...M.EMPTY_STATE, fruit: 'apples', q: 'red june' }));
  ok(M.select(index, shared).length === M.select(index, { fruit: 'apples', q: 'red june' }).length,
    'a link reproduces the same selection');
}

// ── the two doors ──────────────────────────────────────────────────────────

group('the doors out');
{
  const row = index.rows.find((r) => r.src === M.COMMONS && r.variety && r.artist);
  const shop = M.shopUrl(row);
  const bloom = M.bloomUrl(row);
  ok(shop.startsWith('/shop/?'), 'shop takes a picture at /shop/', shop);
  ok(bloom.startsWith('/bloom/?u='), 'bloom takes a picture at /bloom/', bloom);
  const u = new URLSearchParams(shop.slice('/shop/?'.length));
  ok(u.get('u').startsWith('https://upload.wikimedia.org/'), 'and is handed a real image URL');
  ok(M.COMMONS_WIDTHS.includes(Number(/\/(\d+)px-/.exec(u.get('u'))[1])),
    'at a permitted width — a 400 here would open the editor onto an error page');
  // The alt text rides along, exactly as /explore's lightbox does it.
  ok(u.get('alt') && u.get('alt').includes(row.variety), 'the description travels with the picture', u.get('alt'));
  ok(!u.get('u').includes('/api/img'), 'and is NOT routed through the proxy — Commons already sends CORS');
  ok(!M.bloomUrl(row).includes('/api/img'), 'nor is bloom\'s');
}

group('captions');
{
  for (const row of index.rows) {
    const c = M.caption(row);
    ok(typeof c === 'string' && c.length > 0, `every plate has a caption (${M.barcode(row.id)})`);
    if (failures) break;
  }
  const bare = index.rows.find((r) => !r.variety && !r.fruit && !r.desc);
  if (bare) ok(M.caption(bare) === M.barcode(bare.id), 'a plate with no record falls back to its barcode');
  ok(M.barcode(1) === 'POM00000001' && M.barcode(7584) === 'POM00007584', 'barcodes are zero-padded to eight');
}

// ── it is wired into the surface ───────────────────────────────────────────

group('wiring');
{
  const cat = readFileSync(join(HERE, 'src', 'lib', 'catalogue.js'), 'utf8');
  ok(/href:\s*'\/pom\/'/.test(cat), 'the tool is in the surface catalogue — otherwise it is reachable by nobody');
  const html = readFileSync(join(HERE, 'public', 'pom', 'index.html'), 'utf8');
  ok(html.includes('./js/app.js'), 'the page loads its app');
  ok(!/<script[^>]+src=["']https?:/.test(html), 'and pulls in no third-party script');
}

console.error(`\n${failures ? '✗' : '✓'} pom: ${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
