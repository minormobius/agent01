// Fetch every holder of each position in positions.json from Wikidata.
// Writes raw/wd-<QID>.json per position (cached; delete to refetch), then
// raw/parties.json (labels for every party QID seen).
// Usage: node wikidata.mjs [--force]
import fs from 'node:fs';
import path from 'node:path';
const here = path.dirname(new URL(import.meta.url).pathname);
const raw = path.join(here, 'raw'); fs.mkdirSync(raw, { recursive: true });
const UA = 'minomobi-polity-builder/0.1 (https://cards.mino.mobi/polity/)';
const force = process.argv.includes('--force');
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function sparql(q, tries = 4) {
  for (let i = 0; i < tries; i++) {
    const r = await fetch('https://query.wikidata.org/sparql', {
      method: 'POST',
      headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'query=' + encodeURIComponent(q),
    });
    if (r.ok) { const t = await r.text(); try { return JSON.parse(t).results.bindings; } catch {} }
    console.error('  retry', i + 1, r.status); await sleep(5000 * (i + 1));
  }
  throw new Error('sparql failed');
}
const id = v => v?.value?.split('/').pop();

const positions = JSON.parse(fs.readFileSync(path.join(here, 'positions.json')));
for (const pos of positions) {
  const f = path.join(raw, `wd-${pos.q}.json`);
  if (!force && fs.existsSync(f)) continue;
  const q = `SELECT ?st ?p ?name ?article ?start ?end ?grp ?dist ?term ?tstart ?tend ?born WHERE {
    ?p p:P39 ?st . ?st ps:P39 wd:${pos.q} . FILTER NOT EXISTS { ?st wikibase:rank wikibase:DeprecatedRank }
    OPTIONAL { ?st pq:P580 ?start } OPTIONAL { ?st pq:P582 ?end }
    OPTIONAL { ?st pq:P4100 ?grp } OPTIONAL { ?st pq:P768 ?dist }
    OPTIONAL { ?st pq:P2937 ?term . OPTIONAL { ?term wdt:P580 ?tstart } OPTIONAL { ?term wdt:P582 ?tend } }
    OPTIONAL { ?p rdfs:label ?name FILTER(lang(?name)='en') }
    OPTIONAL { ?p wdt:P569 ?born }
    OPTIONAL { ?article schema:about ?p ; schema:isPartOf <https://en.wikipedia.org/> }
  }`;
  const rows = await sparql(q);
  // person parties (P102) with their own dates, fetched separately to avoid row explosion
  const pq = `SELECT ?p ?party ?ps ?pe WHERE {
    ?p p:P39/ps:P39 wd:${pos.q} . ?p p:P102 ?s . ?s ps:P102 ?party .
    OPTIONAL { ?s pq:P580 ?ps } OPTIONAL { ?s pq:P582 ?pe } }`;
  const prow = await sparql(pq);
  const people = {}, stmts = {};
  for (const r of rows) {
    const p = id(r.p), s = r.st.value;
    people[p] ??= { name: r.name?.value, wiki: r.article?.value ? decodeURIComponent(r.article.value.split('/wiki/')[1]).replace(/_/g, ' ') : null, born: r.born?.value?.slice(0, 4) };
    const o = stmts[s] ??= { p, s: r.start?.value?.slice(0, 10), e: r.end?.value?.slice(0, 10), g: id(r.grp), d: r.dist ? id(r.dist) : null, ts: r.tstart?.value?.slice(0, 10), te: r.tend?.value?.slice(0, 10), t: [] };
    if (r.term && !o.t.includes(id(r.term))) o.t.push(id(r.term));
    // multiple terms/qualifiers -> widen the window
    if (r.tstart && (!o.ts || r.tstart.value < o.ts)) o.ts = r.tstart.value.slice(0, 10);
    if (r.tend && (!o.te || r.tend.value > o.te)) o.te = r.tend.value.slice(0, 10);
  }
  const parties = {};
  for (const r of prow) (parties[id(r.p)] ??= []).push({ q: id(r.party), s: r.ps?.value?.slice(0, 10), e: r.pe?.value?.slice(0, 10) });
  fs.writeFileSync(f, JSON.stringify({ pos, people, stmts: Object.values(stmts), parties }));
  console.log(pos.q, pos.st, pos.b, Object.keys(people).length, 'people', Object.keys(stmts).length, 'stmts');
  await sleep(1000);
}

// party labels + district labels
const qids = new Set();
for (const pos of positions) {
  const d = JSON.parse(fs.readFileSync(path.join(raw, `wd-${pos.q}.json`)));
  for (const s of d.stmts) { if (s.g) qids.add(s.g); }
  for (const l of Object.values(d.parties)) for (const x of l) qids.add(x.q);
}
const labels = {};
const all = [...qids];
for (let i = 0; i < all.length; i += 300) {
  const rows = await sparql(`SELECT ?q ?l ?a WHERE { VALUES ?q { ${all.slice(i, i + 300).map(q => 'wd:' + q).join(' ')} } OPTIONAL { ?q rdfs:label ?l FILTER(lang(?l)='en') } OPTIONAL { ?a schema:about ?q ; schema:isPartOf <https://en.wikipedia.org/> } }`);
  for (const r of rows) labels[id(r.q)] = { l: r.l?.value, w: r.a ? decodeURIComponent(r.a.value.split('/wiki/')[1]).replace(/_/g, ' ') : null };
}
fs.writeFileSync(path.join(raw, 'parties.json'), JSON.stringify(labels, null, 1));
console.log('party labels', Object.keys(labels).length);

// electoral-term items: dates, or a year range in the label ("1975-1976 Massachusetts legislature")
const tq = new Set();
for (const pos of positions) {
  const d = JSON.parse(fs.readFileSync(path.join(raw, `wd-${pos.q}.json`)));
  for (const s of d.stmts) for (const t of s.t || []) tq.add(t);
}
const terms = {};
const tl = [...tq];
for (let i = 0; i < tl.length; i += 250) {
  const rows = await sparql(`SELECT ?q ?l ?a ?b ?c ?d ?e WHERE { VALUES ?q { ${tl.slice(i, i + 250).map(q => 'wd:' + q).join(' ')} }
    OPTIONAL { ?q rdfs:label ?l FILTER(lang(?l)='en') } OPTIONAL { ?q wdt:P580 ?a } OPTIONAL { ?q wdt:P582 ?b }
    OPTIONAL { ?q wdt:P571 ?c } OPTIONAL { ?q wdt:P576 ?d } OPTIONAL { ?q wdt:P585 ?e } }`);
  for (const r of rows) terms[id(r.q)] = { l: r.l?.value, s: (r.a || r.c)?.value?.slice(0, 10), e: (r.b || r.d)?.value?.slice(0, 10), pt: r.e?.value?.slice(0, 10) };
}
fs.writeFileSync(path.join(raw, 'terms.json'), JSON.stringify(terms));
console.log('term items', Object.keys(terms).length);
