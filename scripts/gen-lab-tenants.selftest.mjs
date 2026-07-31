#!/usr/bin/env node
// gen-lab-tenants.selftest.mjs — the metadata join, and the rules that keep the
// request ledger's untrusted half off the landing page.
//
//   node scripts/gen-lab-tenants.selftest.mjs
//
// WHAT IS ACTUALLY AT RISK HERE. .github/lab-requests/<slug>.json is written
// from a Bluesky thread: `requester` is a handle a stranger chose, `task` and
// `refs_from` are other people's posts quoted verbatim, and the at:// URIs come
// from the same place. The landing page puts a handle, a date and a LINK on
// minomobi.com — so the join has to be the narrow part of the pipe, not the
// page. These cases are the ones that would matter if it were not.

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { threadUrl, readRequest, listTenants } from './gen-lab-tenants.mjs';

let pass = 0, fail = 0;
const ck = (cond, msg) => { if (cond) { pass++; } else { fail++; console.error(`  ✗ ${msg}`); } };
const eq = (a, b, msg) => ck(a === b, `${msg}\n      expected: ${JSON.stringify(b)}\n      actual:   ${JSON.stringify(a)}`);

// --- threadUrl: constructed from validated parts, never passed through ------
eq(
  threadUrl('at://did:plc:mssgex5rqek4wc66wgvzztbc/app.bsky.feed.post/3mrrxqapvic23'),
  'https://bsky.app/profile/did:plc:mssgex5rqek4wc66wgvzztbc/post/3mrrxqapvic23',
  'a real post URI becomes a bsky.app profile link',
);
eq(threadUrl('at://did:web:example.com/app.bsky.feed.post/abc'),
   'https://bsky.app/profile/did:web:example.com/post/abc',
   'did:web is a legitimate DID method and is accepted');

// The whole point of building rather than validating: none of these can produce
// a link, because none of them can produce a (did, rkey) pair that matches.
for (const hostile of [
  'https://evil.example/pwned',
  'at://did:plc:abc/app.bsky.feed.post/../../evil',
  'at://did:evil:abc/app.bsky.feed.post/xyz',
  'at://did:plc:abc/app.bsky.graph.follow/xyz',
  'at://did:plc:abc/app.bsky.feed.post/x?next=//evil',
  'at://did:plc:abc/app.bsky.feed.post/x#frag',
  'javascript:alert(1)',
  'at://did:plc:ab c/app.bsky.feed.post/xyz',
  '',
  null,
  undefined,
  42,
  {},
]) {
  eq(threadUrl(hostile), null, `refuses to build a URL from ${JSON.stringify(hostile)}`);
}

// A collection that is not a feed post must not become a post link, even though
// the URI is otherwise well-formed — that is the one an allowlist would miss.
eq(threadUrl('at://did:plc:abc/app.bsky.actor.profile/self'), null,
   'a non-post collection yields no link');

// --- readRequest: the fields that ship, and the ones that must not ---------
const dir = mkdtempSync(join(tmpdir(), 'labreq-'));
try {
  writeFileSync(join(dir, 'good.json'), JSON.stringify({
    slug: 'good',
    requester: 'norvid-studies.bsky.social',
    requestedAt: '2026-07-30T14:27:00.744Z',
    thread_root: 'at://did:plc:abc/app.bsky.feed.post/rk1',
    root_uri: 'at://did:plc:abc/app.bsky.feed.post/rk2',
    task: 'a stranger\'s words, quoted verbatim, which must not reach the page',
    refs_from: 'and a whole thread of other people, likewise',
  }));
  const good = readRequest(dir, 'good');
  eq(good.requester, 'norvid-studies.bsky.social', 'a valid handle is kept');
  eq(good.requestedAt, '2026-07-30', 'the timestamp is reduced to a day');
  eq(good.thread, 'https://bsky.app/profile/did:plc:abc/post/rk1', 'thread_root wins over root_uri');

  // THE LOAD-BEARING ASSERTION. Adding a field to the manifest is a one-word
  // change; this is what makes that a deliberate one rather than an accident
  // that republishes a thread of strangers under the factory's name.
  eq(Object.keys(good).sort().join(','), 'requestedAt,requester,thread',
     'exactly three fields ship — task and refs_from are not among them');
  ck(!JSON.stringify(good).includes('verbatim'), 'the task text is nowhere in the output');
  ck(!JSON.stringify(good).includes('other people'), 'refs_from is nowhere in the output');

  // Fallback: no thread_root, so root_uri is used.
  writeFileSync(join(dir, 'fallback.json'), JSON.stringify({
    requester: 'a.bsky.social', root_uri: 'at://did:plc:abc/app.bsky.feed.post/rk2',
  }));
  eq(readRequest(dir, 'fallback').thread, 'https://bsky.app/profile/did:plc:abc/post/rk2',
     'root_uri is the fallback when thread_root is absent');

  // A handle is rendered as text, but it is also the only identity on the card,
  // so a value that is not handle-shaped is dropped rather than displayed.
  for (const bad of ['<script>alert(1)</script>', 'Not A Handle', '', '.leading.dot',
                     'trailing.dot.', 'has_underscore.social', 42, null]) {
    writeFileSync(join(dir, 'badh.json'), JSON.stringify({ requester: bad }));
    eq(readRequest(dir, 'badh').requester, null, `drops a non-handle requester: ${JSON.stringify(bad)}`);
  }

  writeFileSync(join(dir, 'baddate.json'), JSON.stringify({ requestedAt: 'not a date' }));
  eq(readRequest(dir, 'baddate').requestedAt, null, 'an unparseable date becomes null');

  // Both are normal states, not errors: the earliest tenants predate the ledger.
  const missing = readRequest(dir, 'nope');
  eq(missing.requester, null, 'a missing request file lists with nulls');
  eq(missing.thread, null, 'a missing request file yields no link');

  writeFileSync(join(dir, 'broken.json'), '{ not json');
  eq(readRequest(dir, 'broken').requester, null, 'malformed JSON degrades instead of throwing');

  // --- listTenants: directories are the source of truth -------------------
  const site = mkdtempSync(join(tmpdir(), 'labsite-'));
  try {
    for (const d of ['good', 'zeta', 'alpha']) mkdirSync(join(site, d));
    mkdirSync(join(site, '_kit'));            // infrastructure, never a site
    mkdirSync(join(site, 'Uppercase'));       // not slug-shaped
    writeFileSync(join(site, 'index.html'), 'x');  // a file, not a directory

    const list = listTenants(site, dir);
    eq(list.map((t) => t.name).join(','), 'alpha,good,zeta', 'slug dirs only, sorted');
    ck(!list.some((t) => t.name === '_kit'), '_kit is never listed as a tenant');
    eq(list.find((t) => t.name === 'good').requester, 'norvid-studies.bsky.social',
       'a listed tenant carries its metadata');
    eq(list.find((t) => t.name === 'alpha').requester, null,
       'a tenant with no request file still lists');
  } finally {
    rmSync(site, { recursive: true, force: true });
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log(fail ? `✗ gen-lab-tenants: ${fail} failed, ${pass} passed` : `✓ gen-lab-tenants — ${pass} passed`);
process.exit(fail ? 1 : 0);
