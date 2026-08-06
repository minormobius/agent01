/**
 * Corpus harvester — pulls a principal's complete ATProto post history off
 * their PDS and normalises it to JSONL, one record per line.
 *
 * Node-only. No dependencies, no auth: a repo's posts are public records, so
 * this reads them straight from the PDS with com.atproto.repo.listRecords.
 *
 *   node harvest.mjs <handle-or-did> --out corpus.jsonl
 *   node harvest.mjs <handle-or-did> --out corpus.jsonl --hydrate
 *
 * --hydrate runs a second pass that attaches the text of each reply's parent.
 * That pass is what turns a pile of utterances into supervised pairs: an
 * isolated post teaches voice, a post next to what it answered teaches the
 * response function. Run it. It is the point.
 *
 * Both passes are resumable — re-running appends only what is missing, so a
 * rate-limit or a dropped connection costs you one page, not the whole run.
 */

import { createWriteStream, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolveHandle, resolvePds } from '../atproto/pds.js';
import { readRepo } from './car.mjs';

const PUBLIC_API = 'https://public.api.bsky.app';
const PAGE_SIZE = 100; // listRecords ceiling
const HYDRATE_BATCH = 25; // getPosts ceiling
const POSTS = 'app.bsky.feed.post';

// ─── Fetch with backoff ──────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * GET a JSON endpoint, retrying on 429 and 5xx with exponential backoff.
 * Honours Retry-After when the server sends one.
 */
async function getJson(url, attempt = 0) {
  let res;
  try {
    res = await fetch(url);
  } catch (err) {
    if (attempt >= 4) throw err;
    await sleep(2000 * 2 ** attempt);
    return getJson(url, attempt + 1);
  }

  if (res.status === 429 || res.status >= 500) {
    if (attempt >= 4) throw new Error(`${res.status} after 5 attempts: ${url}`);
    const retryAfter = Number(res.headers.get('retry-after'));
    await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2000 * 2 ** attempt);
    return getJson(url, attempt + 1);
  }

  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${url}`);
  return res.json();
}

// ─── Normalisation ───────────────────────────────────────────────

/** Pull link/mention/tag targets out of a post's richtext facets. */
function readFacets(facets) {
  const out = { links: [], mentions: [], tags: [] };
  for (const facet of facets ?? []) {
    for (const feature of facet.features ?? []) {
      if (feature.$type === 'app.bsky.richtext.facet#link') out.links.push(feature.uri);
      else if (feature.$type === 'app.bsky.richtext.facet#mention') out.mentions.push(feature.did);
      else if (feature.$type === 'app.bsky.richtext.facet#tag') out.tags.push(feature.tag);
    }
  }
  return out;
}

/**
 * Identify what a post quotes, if anything. Quotes live in two shapes
 * depending on whether the post also carries media.
 */
function readQuote(embed) {
  if (!embed) return null;
  if (embed.$type === 'app.bsky.embed.record') return embed.record?.uri ?? null;
  if (embed.$type === 'app.bsky.embed.recordWithMedia') return embed.record?.record?.uri ?? null;
  return null;
}

/** Collapse a raw PDS record into the flat training-facing shape. */
function normalise(uri, value, did) {
  const v = value ?? {};
  const embedType = v.embed?.$type?.replace('app.bsky.embed.', '') ?? null;

  return {
    uri,
    rkey: uri.split('/').pop(),
    author: did,
    text: v.text ?? '',
    createdAt: v.createdAt ?? null,
    langs: v.langs ?? [],
    replyParent: v.reply?.parent?.uri ?? null,
    replyRoot: v.reply?.root?.uri ?? null,
    quoteOf: readQuote(v.embed),
    embed: embedType,
    facets: readFacets(v.facets),
  };
}

// ─── Pass 1: harvest ─────────────────────────────────────────────

/** Read an existing JSONL corpus, tolerating a truncated final line. */
function readCorpus(path) {
  if (!existsSync(path)) return [];
  const rows = [];
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      rows.push(JSON.parse(line));
    } catch {
      // A partial write from an interrupted run. Drop it and carry on.
    }
  }
  return rows;
}

/**
 * Page the principal's whole post collection into `out`.
 * Already-harvested URIs are skipped, so re-running resumes.
 */
export async function harvest(actor, out, { onPage } = {}) {
  const did = actor.startsWith('did:') ? actor : await resolveHandle(actor);
  const pds = await resolvePds(did);

  const seen = new Set(readCorpus(out).map((r) => r.uri));
  const sink = createWriteStream(out, { flags: 'a' });

  let cursor = null;
  let fetched = 0;
  let added = 0;

  do {
    const url =
      `${pds}/xrpc/com.atproto.repo.listRecords` +
      `?repo=${encodeURIComponent(did)}&collection=${POSTS}&limit=${PAGE_SIZE}` +
      (cursor ? `&cursor=${encodeURIComponent(cursor)}` : '');

    const page = await getJson(url);
    const records = page.records ?? [];
    fetched += records.length;

    for (const record of records) {
      if (seen.has(record.uri)) continue;
      seen.add(record.uri);
      sink.write(JSON.stringify(normalise(record.uri, record.value, did)) + '\n');
      added++;
    }

    cursor = page.cursor ?? null;
    onPage?.({ fetched, added });

    // listRecords stops sending a cursor when the collection is exhausted.
  } while (cursor);

  await new Promise((resolve) => sink.end(resolve));
  return { did, pds, fetched, added };
}

// ─── Pass 1, the fast way: whole-repo CAR export ─────────────────

/**
 * Download the principal's entire repository as a CAR.
 *
 * One request for everything, versus one per hundred records. On a 50k-post
 * repo this is ~90MB in a few seconds against several minutes of paging, and
 * it leaves a local file you can re-parse without touching the PDS again.
 */
export async function fetchCar(actor, out) {
  const did = actor.startsWith('did:') ? actor : await resolveHandle(actor);
  const pds = await resolvePds(did);

  const url = `${pds}/xrpc/com.atproto.sync.getRepo?did=${encodeURIComponent(did)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} fetching repo for ${did}`);

  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(out, buf);
  return { did, pds, bytes: buf.length };
}

/**
 * Normalise the posts out of a CAR export into the same JSONL shape the
 * paged harvester produces, so --hydrate and the census cannot tell which
 * route the corpus arrived by.
 *
 * The other collections are counted and returned but not written: likes and
 * reposts are preference signal rather than text, and belong to a later
 * stage than this one.
 */
export function harvestFromCar(carPath, out) {
  const repo = readRepo(new Uint8Array(readFileSync(carPath)));
  const posts = repo.collections.get(POSTS) ?? [];

  const sink = createWriteStream(out, { flags: 'w' });
  for (const { rkey, value } of posts) {
    const uri = `at://${repo.did}/${POSTS}/${rkey}`;
    sink.write(JSON.stringify(normalise(uri, value, repo.did)) + '\n');
  }
  sink.end();

  const counts = [...repo.collections].map(([name, rs]) => [name, rs.length]);
  return { did: repo.did, rev: repo.rev, posts: posts.length, records: repo.total, counts };
}

// ─── Pass 2: hydrate reply parents ───────────────────────────────

/**
 * Attach parent text to every reply. This is the pass that produces
 * (prompt, response) pairs rather than free-floating utterances.
 *
 * Parents that were deleted, or live on a repo that has gone away, come back
 * missing — they get recorded as `parentMissing` rather than silently dropped,
 * so the census can report real coverage instead of an optimistic one.
 */
export async function hydrate(path, out, { onBatch } = {}) {
  const rows = readCorpus(path);
  const byUri = new Map(rows.map((r) => [r.uri, r]));

  // Only replies need a parent, and only ones not already hydrated.
  const wanted = [
    ...new Set(
      rows
        .filter((r) => r.replyParent && r.parentText === undefined)
        .map((r) => r.replyParent)
    ),
  ];

  const parents = new Map();
  let done = 0;

  for (let i = 0; i < wanted.length; i += HYDRATE_BATCH) {
    const batch = wanted.slice(i, i + HYDRATE_BATCH);
    const url =
      `${PUBLIC_API}/xrpc/app.bsky.feed.getPosts` +
      `?${batch.map((u) => `uris=${encodeURIComponent(u)}`).join('&')}`;

    const { posts = [] } = await getJson(url);
    for (const post of posts) {
      parents.set(post.uri, {
        text: post.record?.text ?? '',
        author: post.author?.did ?? null,
        handle: post.author?.handle ?? null,
      });
    }

    done += batch.length;
    onBatch?.({ done, total: wanted.length, resolved: parents.size });
  }

  const sink = createWriteStream(out, { flags: 'w' });
  for (const row of rows) {
    if (row.replyParent && row.parentText === undefined) {
      const parent = parents.get(row.replyParent);
      if (parent) {
        row.parentText = parent.text;
        row.parentAuthor = parent.author;
        row.parentHandle = parent.handle;
        // A reply to yourself is a continued thought, not a response to
        // someone else. The census counts these separately because they
        // train different things.
        row.parentIsSelf = parent.author === row.author;
      } else {
        row.parentMissing = true;
      }
    }
    sink.write(JSON.stringify(row) + '\n');
  }
  await new Promise((resolve) => sink.end(resolve));

  void byUri; // reserved for in-corpus parent lookup, cheaper than refetching
  return { rows: rows.length, wanted: wanted.length, resolved: parents.size };
}

// ─── CLI ─────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { actor: null, out: 'corpus.jsonl', car: null, hydrate: false, paged: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') args.out = argv[++i];
    else if (argv[i] === '--car') args.car = argv[++i];
    else if (argv[i] === '--hydrate') args.hydrate = true;
    else if (argv[i] === '--paged') args.paged = true;
    else if (!args.actor) args.actor = argv[i];
  }
  return args;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  if (!args.actor && !args.car) {
    console.error(
      'usage: node harvest.mjs <handle-or-did> [--out FILE] [--hydrate]\n' +
        '       --car FILE   reuse (or write) a CAR export instead of refetching\n' +
        '       --paged      page listRecords instead of pulling the whole repo'
    );
    process.exit(1);
  }

  if (args.paged) {
    const result = await harvest(args.actor, args.out, {
      onPage: ({ fetched, added }) =>
        process.stderr.write(`\r  harvest: ${fetched} seen, ${added} new`),
    });
    process.stderr.write(`\n  ${result.did} via ${result.pds}\n`);
  } else {
    // Default: one request for the whole repository.
    const car = args.car ?? `${args.out.replace(/\.jsonl$/, '')}.car`;
    if (!existsSync(car)) {
      const f = await fetchCar(args.actor, car);
      process.stderr.write(
        `  fetched ${(f.bytes / 1e6).toFixed(1)}MB from ${f.pds}\n`
      );
    } else {
      process.stderr.write(`  reusing ${car}\n`);
    }

    const r = harvestFromCar(car, args.out);
    process.stderr.write(`  ${r.did} @ ${r.rev} — ${r.records} records, ${r.posts} posts\n`);
    for (const [name, count] of r.counts.sort((a, b) => b[1] - a[1]).slice(0, 6)) {
      process.stderr.write(`    ${name.padEnd(28)} ${String(count).padStart(8)}\n`);
    }
  }

  if (args.hydrate) {
    const h = await hydrate(args.out, args.out, {
      onBatch: ({ done, total, resolved }) =>
        process.stderr.write(`\r  hydrate: ${done}/${total} requested, ${resolved} resolved`),
    });
    process.stderr.write(`\n  ${h.resolved}/${h.wanted} parents resolved\n`);
  }

  console.log(args.out);
}
