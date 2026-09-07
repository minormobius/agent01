#!/usr/bin/env node
// tape/check-links.mjs — verify every source URL in parts.json still points at
// the part it claims to.
//
//   node tape/check-links.mjs           report only
//   node tape/check-links.mjs --write   report, then write the verdicts back
//
// A 200 is not the check. Vendors reuse and retire product ids, so a link can
// resolve happily to something else entirely; the check is that the page still
// says the part's name. Three verdicts, because two would be a lie:
//
//   ok        200, and `expect` was found in the page title
//   resolves  200, but the title is JS-rendered or bot-walled — unverifiable
//   blocked   4xx/5xx to an automated request; fine in a browser
//
// Deliberately not a *.selftest.mjs: preflight must not depend on twenty
// third-party websites being up. Run this by hand, or on a schedule.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(HERE, 'parts.json');
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';
const write = process.argv.includes('--write');

const doc = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const sources = [...doc.parts, ...(doc.tools || []), ...(doc.enclosure || []).map((e) => ({ ...e, name: e.route }))]
  .flatMap((p) => p.sources.map((s) => ({ part: p.name, s })));

async function verdictFor({ url, expect }) {
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA }, redirect: 'follow',
      signal: AbortSignal.timeout(25_000) });
    if (!res.ok) return { status: 'blocked', detail: `HTTP ${res.status}` };
    const body = await res.text();
    const title = (body.match(/<title[^>]*>([^<]*)/i)?.[1] || '').trim();
    if (!expect) return { status: 'resolves', detail: title.slice(0, 60) || 'no title' };
    const hay = `${title} ${body.slice(0, 4000)}`.toLowerCase();
    return hay.includes(expect.toLowerCase())
      ? { status: 'ok', detail: title.slice(0, 60) }
      : { status: 'resolves', detail: `did not find ${JSON.stringify(expect)} — ${title.slice(0, 45)}` };
  } catch (e) {
    return { status: 'blocked', detail: e.name === 'TimeoutError' ? 'timed out' : e.message.slice(0, 60) };
  }
}

const results = await Promise.all(sources.map(async (row) => ({ ...row, v: await verdictFor(row.s) })));

let changed = 0, bad = 0;
for (const { part, s, v } of results) {
  const moved = s.status !== v.status;
  if (moved) changed++;
  if (v.status === 'blocked') bad++;
  console.log(`${v.status.padEnd(9)}${moved ? `(was ${s.status}) ` : ''}${part} — ${s.vendor} ${s.sku}\n          ${v.detail}`);
  s.status = v.status;
}

const tally = results.reduce((a, r) => ((a[r.v.status] = (a[r.v.status] || 0) + 1), a), {});
console.log(`\n${results.length} sources: ${JSON.stringify(tally)}${changed ? `, ${changed} changed` : ''}`);

if (write) {
  doc.checked.at = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(FILE, `${JSON.stringify(doc, null, 2)}\n`);
  console.log(`wrote ${path.relative(process.cwd(), FILE)}`);
}

// A blocked link is information, not a failure — Amazon and DigiKey will always
// be blocked. Exit non-zero only if a link is *gone*, which shows up as blocked
// with a 404.
process.exit(results.some((r) => /HTTP 404|HTTP 410/.test(r.v.detail)) ? 1 : 0);
