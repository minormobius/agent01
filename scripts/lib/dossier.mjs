// dossier.mjs — turn a repository into something an agent can be dogged in.
//
// THE RESEARCH TOOL IS GREP, AND THAT IS THE DESIGN. The build agent in this
// factory has no Bash and no network, for a reason that has not changed: the
// gates read published FILES, so an agent that can open a socket is a channel
// nothing here would ever see. That looks like a handicap for research and is
// not, because Read/Glob/Grep over a corpus ON DISK is exactly the loop dogged
// research needs — search a term, read the hits, notice a word they actually
// use, search again. No new tool, no new capability, no new hole.
//
// So the harness's job is to put the whole repository on disk in a shape Grep
// is good at, and the agent's job is to work it.
//
//   corpus/by-year/2024.tsv   one post per line: rkey, date, kind, text
//   corpus/all.tsv            the same, unsharded, for a first sweep
//   corpus/README.md          the layout, and how to cite what it finds
//   context/<rkey>.md         hydrated threads — WHAT THEY WERE REPLYING TO
//
// ONE POST PER LINE IS THE WHOLE CONTRACT. Grep reports matching LINES, so a
// post that spans lines is a post whose match arrives without its own text.
// Newlines are escaped on the way in and the README tells the agent to expect
// that — otherwise it reads "\n" as a typo and starts cleaning up the data.
//
// WHY THE CAR AND NOT searchPosts. Bluesky's search index is incomplete for old
// posts and its ranking is undocumented; com.atproto.sync.getRepo is one
// unauthenticated request that returns EVERY post they have ever made. For
// "everything X has said about Y", complete beats ranked. Engagement counts and
// takedown status are the two things the CAR cannot know, and both come from
// the AppView below, where they belong.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const APPVIEW = 'https://public.api.bsky.app/xrpc';

/** Post text on one line, reversibly.
 *
 *  Backslash first, or every later escape is ambiguous — "\\n" in the source
 *  would come back as a newline. Tabs go too, because tab is the field
 *  separator and a post containing one would silently shift every column. */
export function escapeText(text) {
  return String(text ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\t/g, '\\t')
    .replace(/\r?\n/g, '\\n')
    .trim();
}

/** What kind of post it is, in one token the agent can grep for. A reply and a
 *  standalone post mean different things in a dossier: "they said X" and "they
 *  said X to somebody" are different claims. */
export function postKind(p) {
  if (p.isReply) return 'reply';
  if (p.embed === 'record' || p.embed === 'recordWithMedia') return 'quote';
  return 'post';
}

export function corpusLine(p) {
  const date = String(p.createdAt || '').slice(0, 10) || '????-??-??';
  return [p.rkey || '-', date, postKind(p), escapeText(p.text)].join('\t');
}

/** bsky.app URL for a post, which is what a citation has to be — an at:// URI
 *  is correct and unclickable. */
export function postUrl(handle, rkey) {
  return `https://bsky.app/profile/${handle}/post/${rkey}`;
}
export function postUri(did, rkey) {
  return `at://${did}/app.bsky.feed.post/${rkey}`;
}

const README = (handle, did, counts) => `# The complete public post history of @${handle}

Every post in their repository, read straight from their PDS
(\`com.atproto.sync.getRepo\`). ${counts.total.toLocaleString('en-US')} posts,
${counts.first} to ${counts.last}. This is not a search index and not a sample —
it is all of it.

## Layout

    all.tsv           every post, newest last
    by-year/YYYY.tsv  the same posts, split by year — grep these when a sweep
                      over all.tsv returns more than you can read

Four tab-separated fields per line, ONE POST PER LINE:

    rkey    date        kind    text

    kind is one of: post (standalone) · reply (to someone) · quote (of a post)

**Newlines inside a post are escaped as literal \\n, and tabs as \\t.** That is
not corruption — it is what keeps one post on one line so that grep can find it.
A literal backslash in the original is \\\\.

## How to work this

Grep is the tool. Search a term, read the hits, notice the words THEY actually
use for the thing, and search again with those. People do not name their own
subjects the way an outsider would: somebody who never types "machine learning"
may have four hundred posts about it under "the models".

    grep -i "term" all.tsv
    grep -iE "term1|term2|term3" by-year/2024.tsv

Counting is evidence too. A term that appears twice in six years is not a
position; one that appears four hundred times, all in one quarter, is a story
about that quarter.

## Citing what you find

The rkey in column 1 is the citation. It becomes:

    ${postUrl(handle, '<rkey>')}
    ${postUri(did, '<rkey>')}

Quote the rkey and never invent one. Every claim in the dossier has to land on
a real post, and a citation that does not resolve is worse than no citation —
it is a fabricated quote attributed to a real person.

## What is NOT here

- Other people's posts. Only this account's repository was read. Where a reply
  matters, the thread it sits in may have been hydrated for you in ../context/
  — check there before assuming you cannot see what they were answering.
- Likes, follows, blocks. Not read, deliberately.
- Engagement counts. The repository does not carry them; likes live in other
  people's repositories.
- Deleted posts. Deletions are honoured by the repository, so if it is gone from
  here they removed it.
`;

/**
 * Write the whole repository out as a greppable corpus.
 * @returns {{dir: string, total: number, years: string[], first: string, last: string}}
 */
export function writeCorpus(posts, dir, { handle, did }) {
  mkdirSync(join(dir, 'by-year'), { recursive: true });

  const withText = posts.filter((p) => String(p.text || '').trim());
  const sorted = [...withText].sort((a, b) =>
    String(a.createdAt || '').localeCompare(String(b.createdAt || '')));

  const byYear = new Map();
  const lines = [];
  for (const p of sorted) {
    const line = corpusLine(p);
    lines.push(line);
    const year = String(p.createdAt || '').slice(0, 4) || 'undated';
    if (!byYear.has(year)) byYear.set(year, []);
    byYear.get(year).push(line);
  }

  writeFileSync(join(dir, 'all.tsv'), lines.join('\n') + '\n');
  for (const [year, rows] of byYear) {
    writeFileSync(join(dir, 'by-year', `${year}.tsv`), rows.join('\n') + '\n');
  }

  const counts = {
    total: sorted.length,
    first: String(sorted[0]?.createdAt || '').slice(0, 10) || '?',
    last: String(sorted[sorted.length - 1]?.createdAt || '').slice(0, 10) || '?',
  };
  writeFileSync(join(dir, 'README.md'), README(handle, did, counts));
  return { dir, years: [...byYear.keys()].sort(), ...counts };
}

// ── the two things the corpus cannot answer ──────────────────────────────────

async function appview(method, params) {
  const url = new URL(`${APPVIEW}/${method}`);
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) for (const one of v) url.searchParams.append(k, one);
    else url.searchParams.set(k, v);
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${method} ${res.status}`);
  return res.json();
}

/**
 * THE OTHER HALF OF A CONVERSATION. A reply in the corpus is one side of an
 * exchange; the agent can read "absolutely, and it gets worse in the rain" and
 * have no idea what does. getPostThread returns the ancestors, which is the
 * missing half — and it is the AppView, so a deleted or taken-down parent comes
 * back absent rather than resurrected.
 *
 * Called BETWEEN the two agent passes: pass one reads the corpus and says which
 * posts it needs context for, the harness fetches exactly those, pass two
 * writes the dossier. That is the same shape as lab-fetch-refs.mjs — the
 * privileged half fetches, the agent reads files.
 */
export async function hydrateThreads(rkeys, dir, { did, handle, max = 40 }) {
  mkdirSync(dir, { recursive: true });
  const done = [];
  for (const rkey of rkeys.slice(0, max)) {
    if (!/^[a-z0-9]{6,20}$/i.test(rkey)) continue;
    try {
      const { thread } = await appview('app.bsky.feed.getPostThread', {
        uri: postUri(did, rkey), depth: '2', parentHeight: '6',
      });
      const out = [`# Thread context for ${postUrl(handle, rkey)}`, ''];

      const chain = [];
      for (let n = thread?.parent; n?.post; n = n.parent) chain.push(n.post);
      chain.reverse();
      if (chain.length) {
        out.push('## What came before, oldest first', '');
        for (const p of chain) {
          out.push(`**@${p.author?.handle}** (${String(p.record?.createdAt || '').slice(0, 10)}):`);
          out.push(String(p.record?.text || '').split('\n').map((l) => `> ${l}`).join('\n'), '');
        }
      } else {
        out.push('_No ancestors — this was a top-level post, or the parent is gone._', '');
      }

      const self = thread?.post;
      out.push('## The post itself', '');
      out.push(String(self?.record?.text || '').split('\n').map((l) => `> ${l}`).join('\n'), '');
      if (self) {
        out.push(`_${self.likeCount ?? 0} likes · ${self.repostCount ?? 0} reposts · ${self.replyCount ?? 0} replies_`, '');
      }

      const replies = (thread?.replies || []).filter((r) => r?.post).slice(0, 6);
      if (replies.length) {
        out.push('## What was said back', '');
        for (const r of replies) {
          out.push(`**@${r.post.author?.handle}**: ${String(r.post.record?.text || '').replace(/\s+/g, ' ').slice(0, 400)}`);
        }
      }
      writeFileSync(join(dir, `${rkey}.md`), out.join('\n') + '\n');
      done.push(rkey);
    } catch {
      // A thread that will not load is a thread the dossier does without.
    }
  }
  return done;
}

/**
 * Resolve citations to strong refs, THROUGH THE APPVIEW, and that routing is
 * the safety property rather than a convenience.
 *
 * A quote embed needs a cid as well as a uri, and the CAR does carry one — but
 * asking the AppView instead buys two things the CAR cannot: a post the author
 * has since DELETED comes back missing rather than quoted, and so does one
 * under a moderation takedown. The same distinction the content gate draws
 * between the AppView and the firehose, one layer up.
 *
 * Anything that does not resolve is dropped from the citation list rather than
 * cited without an embed.
 */
export async function resolveCitations(rkeys, { did }) {
  const uris = [...new Set(rkeys)].filter((r) => /^[a-z0-9]{6,20}$/i.test(r)).map((r) => postUri(did, r));
  const found = new Map();
  for (let i = 0; i < uris.length; i += 25) {
    try {
      const { posts } = await appview('app.bsky.feed.getPosts', { uris: uris.slice(i, i + 25) });
      for (const p of posts || []) {
        found.set(p.uri.split('/').pop(), {
          rkey: p.uri.split('/').pop(),
          uri: p.uri,
          cid: p.cid,
          text: p.record?.text || '',
          createdAt: p.record?.createdAt || p.indexedAt,
          likes: p.likeCount ?? 0,
        });
      }
    } catch { /* a page that fails costs its citations, not the dossier */ }
  }
  return found;
}
