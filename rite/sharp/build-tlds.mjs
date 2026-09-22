// node rite/sharp/build-tlds.mjs
//
// Builds data/tlds.json from IANA. Like build-corpus.mjs this needs the network
// and its output is committed, so it is NOT part of preflight. Re-run it when
// the TLD list moves — IANA republishes daily, but the list barely changes and
// a stale copy only means a brand-new TLD reads as "not a TLD", which is the
// safe direction to be wrong in.
//
//   tlds-alpha-by-domain.txt  every delegated TLD. The verifier's ground truth.
//   rdap/dns.json             TLD -> registry RDAP base. Only registries that
//                             published one; absence means real-but-uncheckable.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'data', 'tlds.json');
const LIST = 'https://data.iana.org/TLD/tlds-alpha-by-domain.txt';
const BOOTSTRAP = 'https://data.iana.org/rdap/dns.json';

async function text(url) {
  const res = await fetch(url, { headers: { accept: 'text/plain, application/json' } });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.text();
}

process.stderr.write(`fetching ${LIST}\n`);
const listRaw = await text(LIST);
process.stderr.write(`fetching ${BOOTSTRAP}\n`);
const bootRaw = await text(BOOTSTRAP);

const version = (listRaw.match(/^# Version (\d+)/m) || [])[1] || null;
const tlds = listRaw.split('\n')
  .map((l) => l.trim().toLowerCase())
  .filter((l) => l && !l.startsWith('#'))
  .sort();

const boot = JSON.parse(bootRaw);
const rdap = {};
for (const [names, urls] of boot.services) {
  // Prefer https, and the first entry — the bootstrap lists them in the
  // registry's own order of preference.
  const url = urls.find((u) => u.startsWith('https://')) || urls[0];
  if (!url) continue;
  for (const name of names) {
    const t = name.toLowerCase();
    if (!rdap[t]) rdap[t] = url.endsWith('/') ? url : url + '/';
  }
}

// A TLD in the bootstrap but not in the delegated list is stale bootstrap data;
// drop it so the two halves cannot disagree.
const known = new Set(tlds);
let dropped = 0;
for (const t of Object.keys(rdap)) if (!known.has(t)) { delete rdap[t]; dropped++; }

const ascii = tlds.filter((t) => /^[a-z]+$/.test(t));
const out = {
  $source: 'IANA: tlds-alpha-by-domain.txt + rdap/dns.json',
  $fields: {
    tlds: 'every delegated TLD, lowercase, sorted — xn-- forms included',
    rdap: 'TLD -> registry RDAP base URL. Absent means real but not RDAP-checkable.',
  },
  version,
  bootstrapPublished: boot.publication || null,
  counts: {
    tlds: tlds.length,
    ascii: ascii.length,
    verifiable: Object.keys(rdap).length,
    suffixable: ascii.filter((t) => t.length >= 2 && t.length <= 6).length,
  },
  tlds,
  rdap,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
const body = JSON.stringify(out);
fs.writeFileSync(OUT, body);
console.log(`tlds.json   ${(body.length / 1024).toFixed(0)} KB`);
console.log(`  ${out.counts.tlds} delegated TLDs (list version ${version}), ${out.counts.ascii} plain-ASCII`);
console.log(`  ${out.counts.verifiable} publish an RDAP service — ${out.counts.tlds - out.counts.verifiable} are real but uncheckable`);
console.log(`  ${out.counts.suffixable} short enough to finish a word${dropped ? `; dropped ${dropped} stale bootstrap entries` : ''}`);
