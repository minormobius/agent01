#!/usr/bin/env node
// seed.mjs — found communities and post parts into them, from a spec file.
//
//   node parts/agent/seed.mjs [spec.json]            # the plan, writes nothing
//   node parts/agent/seed.mjs [spec.json] --write    # BLUESKY_BOT_* in the env
//
// The page is how a person does this, one form at a time; this is how the
// house account does five communities and a handful of posts in one go, and
// how a workflow can re-run it without making duplicates. Every record it
// writes is the same shape the page writes and `parts/lib/index.js` accepts —
// `parts.selftest.mjs` drives this file against a fake PDS and then indexes
// what it produced, so the two cannot drift.
//
// Idempotent twice over: a community is keyed by its slug (the rkey), so a
// re-run updates it in place and keeps its founding date; a post is keyed by
// its community and title, so a re-run recognises the post it already made.
// A post points at the part's CURRENT REVISION, never at its head — what
// people voted on must not change under them.
import fs from 'node:fs';
import path from 'node:path';
import { SessionBackend } from '../../packages/cad/lib/drive.js';
import { COMMUNITY, POST, SLUG } from '../lib/index.js';

const SITE = 'https://cad.mino.mobi';
const PART = 'com.minomobi.cad.part';

/// Every published file in a repo, through the cad site's own gateway — the
/// same read the page makes, so a part this cannot see is a part the page
/// cannot see either.
export async function partsOf(repo, { site = SITE, fetch: f = globalThis.fetch } = {}) {
  const out = new Map();
  let cursor;
  do {
    const u = new URL(`${site}/xrpc/com.atproto.repo.listRecords`);
    u.searchParams.set('repo', repo); u.searchParams.set('collection', PART); u.searchParams.set('limit', '100');
    if (cursor) u.searchParams.set('cursor', cursor);
    const res = await f(u); if (!res.ok) throw new Error(`listing ${repo}: ${res.status}`);
    const page = await res.json();
    for (const r of page.records || []) if (r.value?.path && r.value?.head?.uri) out.set(r.value.path, r.value.head);
    cursor = page.cursor;
  } while (cursor);
  return out;
}

const same = (a, b) => (a ?? null) === (b ?? null);

/// Apply a spec to one repo. `backend` is anything with the four repo methods
/// (SessionBackend here, a fake in the selftest); `parts` maps a path to the
/// strongRef of its current revision.
export async function seed(backend, spec, { parts, write = false, now = () => new Date().toISOString(), log = console.log } = {}) {
  const did = backend.did;
  const done = { communities: [], posts: [], skipped: [] };
  const refs = new Map(); // slug → strongRef of the community record

  for (const c of spec.communities || []) {
    if (!SLUG.test(c.name)) throw new Error(`community \`${c.name}\`: a slug is lowercase, 3–32, letters digits dashes, no leading or trailing dash`);
    const existing = await backend.getRecord(COMMUNITY, c.name);
    const value = { $type: COMMUNITY, name: c.name, title: c.title, description: c.description, ...(c.rules ? { rules: c.rules } : {}), createdAt: existing?.value?.createdAt || now() };
    const unchanged = existing && ['title', 'description', 'rules'].every((k) => same(existing.value?.[k], value[k]));
    if (unchanged) { refs.set(c.name, { uri: existing.uri, cid: existing.cid }); done.skipped.push(`community ${c.name}`); log(`= ${c.name.padEnd(10)} ${existing.uri}`); continue; }
    if (!write) { refs.set(c.name, { uri: `at://${did}/${COMMUNITY}/${c.name}`, cid: existing?.cid || 'PENDING' }); done.communities.push(c.name); log(`${existing ? '~' : '+'} ${c.name.padEnd(10)} ${c.title}`); continue; }
    const r = await backend.putRecord(COMMUNITY, c.name, value);
    refs.set(c.name, { uri: r.uri, cid: r.cid });
    done.communities.push(c.name);
    log(`${existing ? '~' : '+'} ${c.name.padEnd(10)} ${r.uri}`);
  }

  // what this repo has already posted, so a re-run adds nothing twice
  const mine = [];
  for (let page = await backend.listRecords(POST, 100); ; page = await backend.listRecords(POST, 100, page.cursor)) {
    mine.push(...(page.records || []));
    if (!page.cursor) break;
  }
  const posted = new Set(mine.map((r) => `${r.value?.community?.uri}\0${r.value?.title}`));

  for (const p of spec.posts || []) {
    const community = refs.get(p.community);
    if (!community) throw new Error(`post \`${p.title}\`: no community \`${p.community}\` in this spec`);
    const part = p.part.startsWith('at://') ? { uri: p.part, cid: p.cid } : parts.get(p.part);
    if (!part) throw new Error(`post \`${p.title}\`: no part \`${p.part}\` in ${did} — publish it first (packages/cad/agent/publish.mjs)`);
    if (!part.uri.includes('/com.minomobi.cad.revision/')) throw new Error(`post \`${p.title}\`: \`${part.uri}\` is not a revision; a post pins the version people voted on`);
    if (posted.has(`${community.uri}\0${p.title}`)) { done.skipped.push(`post ${p.title}`); log(`= ${p.community.padEnd(10)} ${p.title}`); continue; }
    if (!write) { done.posts.push(p.title); log(`+ ${p.community.padEnd(10)} ${p.title}  → ${part.uri.split('/').pop()}`); continue; }
    const r = await backend.createRecord(POST, { $type: POST, community, part, title: p.title, ...(p.text ? { text: p.text } : {}), createdAt: now() });
    done.posts.push(p.title);
    log(`+ ${p.community.padEnd(10)} ${p.title}  → ${r.uri}`);
  }
  return { did, ...done };
}

// ── CLI ───────────────────────────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const write = args.includes('--write');
  const specPath = args.find((a) => !a.startsWith('--')) || path.join(path.dirname(new URL(import.meta.url).pathname), 'minomobi.json');
  const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
  const handle = process.env.BLUESKY_BOT_HANDLE, password = process.env.BLUESKY_BOT_APP_PASSWORD;
  if (write && !(handle && password)) { console.error('--write needs BLUESKY_BOT_HANDLE and BLUESKY_BOT_APP_PASSWORD'); process.exit(2); }
  const repo = spec.repo || handle;
  if (!repo) { console.error('the spec needs a `repo` (a handle), or set BLUESKY_BOT_HANDLE'); process.exit(2); }
  const parts = await partsOf(repo);
  console.log(`${specPath}: ${(spec.communities || []).length} communities, ${(spec.posts || []).length} posts · ${parts.size} published parts in ${repo}${write ? '' : ' · DRY RUN'}`);
  const backend = write
    ? await SessionBackend.login(handle, password)
    : { did: `did:plc:<${repo}>`, getRecord: async () => null, listRecords: async () => ({ records: [] }), putRecord: async () => { throw new Error('dry run'); }, createRecord: async () => { throw new Error('dry run'); } };
  const r = await seed(backend, spec, { parts, write });
  if (!write) { console.log('\nnothing written (no --write)'); process.exit(0); }
  console.log(`\ndid=${r.did}`);
  // tell the index at once, the way the page does after every write: the
  // sweep would find this within the quarter hour, but a person watching
  // should not have to wait for it
  const ping = await fetch(`${SITE}/parts/api/index?repo=${encodeURIComponent(r.did)}`, { method: 'POST' });
  console.log(`index: ${ping.status} ${(await ping.text()).slice(0, 200)}`);
  console.log(`${SITE}/parts/`);
}
