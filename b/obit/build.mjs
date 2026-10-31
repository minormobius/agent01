#!/usr/bin/env node
// build.mjs — freeze a closed chapter of the simcluster art projects thread.
// Node only, needs network, run by hand. A closed chapter does not change, so
// the page reads the committed file and never touches the network.
//
//   node b/obit/build.mjs            # rewrites b/obit/chapter-1.json
//
// Why not getPostThread: the AppView stops at ~10 levels and this thread is
// 1,100 posts deep, so orb and thread both chase it ten at a time. Constellation
// answers "every post whose reply.root is this" in twelve pages, and getPosts
// hydrates them 25 at a time — about sixty requests for the whole chapter.
import { writeFileSync } from 'node:fs';
import { reducePost } from './reduce.js';

export const CHAPTERS = {
  1: {
    title: 'SIMCLUSTER ART PROJECTS THREAD',
    root: 'at://did:plc:mssgex5rqek4wc66wgvzztbc/app.bsky.feed.post/3mfrqrq2jdk2x',
    // The handoff: norvid's "as you wish", quoting THREAD 2.0. Anything later
    // arrived after the doors closed and is kept, but marked, as the epilogue.
    close: 'at://did:plc:mssgex5rqek4wc66wgvzztbc/app.bsky.feed.post/3mxenln6yj22y',
    next: 'at://did:plc:mssgex5rqek4wc66wgvzztbc/app.bsky.feed.post/3mxendi6xuc2y',
  },
};

const UA = { headers: { 'User-Agent': 'b.mino.mobi/obit (+https://github.com/minormobius/agent01)' } };

async function json(url, init) {
  for (let i = 0; ; i++) {
    const r = await fetch(url, init);
    if (r.ok) return r.json();
    if (i === 3) throw new Error(`${r.status} ${url}`);
    await new Promise(res => setTimeout(res, 1000 * 2 ** i));
  }
}

async function threadUris(root) {
  const uris = [root];
  let cursor;
  do {
    const q = new URLSearchParams({ target: root, collection: 'app.bsky.feed.post', path: '.reply.root.uri', limit: '100' });
    if (cursor) q.set('cursor', cursor);
    const page = await json('https://constellation.microcosm.blue/links?' + q, UA);
    for (const l of page.linking_records) uris.push(`at://${l.did}/${l.collection}/${l.rkey}`);
    cursor = page.cursor;
  } while (cursor);
  return uris;
}

async function hydrate(uris) {
  const out = [];
  for (let i = 0; i < uris.length; i += 25) {
    const q = uris.slice(i, i + 25).map(u => 'uris=' + encodeURIComponent(u)).join('&');
    out.push(...(await json('https://public.api.bsky.app/xrpc/app.bsky.feed.getPosts?' + q)).posts);
  }
  return out;
}

async function main(n = 1) {
  const ch = CHAPTERS[n];
  const uris = await threadUris(ch.root);
  const posts = (await hydrate(uris)).sort((a, b) => (a.record.createdAt < b.record.createdAt ? -1 : 1));
  const people = new Map();
  const curator = ch.root.split('/')[2];
  const rows = posts.map(p => reducePost(p, people, curator));
  const closeAt = posts.find(p => p.uri === ch.close)?.record.createdAt;
  if (!closeAt) throw new Error('closing post not found in the thread');
  const file = {
    chapter: n,
    title: ch.title,
    root: ch.root,
    curator: ch.root.split('/')[2],
    close: ch.close,
    closeAt,
    next: ch.next,
    frozenAt: new Date().toISOString(),
    linked: uris.length,
    // linked − hydrated = posts Constellation still indexes that the AppView
    // no longer returns (deleted, or the account is gone).
    hydrated: posts.length,
    people: Object.fromEntries(people),
    posts: rows,
  };
  const path = new URL(`./chapter-${n}.json`, import.meta.url);
  writeFileSync(path, JSON.stringify(file));
  console.log(`chapter ${n}: ${rows.length} posts, ${people.size} people → ${path.pathname}`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main(+(process.argv[2] ?? 1));
