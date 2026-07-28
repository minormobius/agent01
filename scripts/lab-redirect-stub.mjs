#!/usr/bin/env node
// lab-redirect-stub.mjs — leave a forwarding address at a renamed site's old path.
//
//   node scripts/lab-redirect-stub.mjs lab/www/<old>/index.html <new-slug>
//
// WHY A PAGE AND NOT A 301. A real redirect would have to live in
// lab/www/worker.js, which means the worker carrying a map of every rename
// forever — state, in the one component that currently has none and is better
// for it. A stub is self-describing: the old directory explains its own fate,
// and deleting the directory deletes the rule. For a lab where renames are rare
// and exceptional, that trade is the right way round.
//
// WHAT IT HAS TO GET RIGHT, because the whole point is not breaking things:
//  - <link rel="canonical"> so search engines follow the move rather than
//    indexing two pages
//  - og: tags, because the link ALREADY POSTED to Bluesky points here, and a
//    card that renders as bare text is the visible half of the breakage
//  - a visible link, because meta-refresh is not guaranteed and a dead end with
//    no way forward is worse than a slow one
//  - noindex on the stub itself
//
// It is written by the harness during publish, never by the build agent — the
// agent cannot write outside its own directory and this is, by definition,
// somebody else's.

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const [out, slug] = process.argv.slice(2);
if (!out || !slug) {
  console.error('usage: node scripts/lab-redirect-stub.mjs <out-file> <new-slug>');
  process.exit(2);
}
if (!/^[a-z0-9][a-z0-9-]{0,30}$/.test(slug)) {
  console.error(`bad slug ${JSON.stringify(slug)}`);
  process.exit(2);
}

const url = `/${slug}/`;
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>moved — /${slug}/</title>
<meta name="robots" content="noindex">
<link rel="canonical" href="https://minomobi.com${url}">
<meta http-equiv="refresh" content="0; url=${url}">
<meta property="og:title" content="this page has moved">
<meta property="og:description" content="It lives at minomobi.com${url} now.">
<link rel="stylesheet" href="/_kit/kit.css">
<main style="max-width:32rem;margin:20vh auto;padding:0 1.5rem;text-align:center">
  <h1>this moved</h1>
  <p>It lives at <a href="${url}">minomobi.com${url}</a> now.</p>
</main>
<script>location.replace(${JSON.stringify(url)});</script>
`);
console.log(`  ✓ ${out} → ${url}`);
