# homunculus

Corpus tooling for a personalised finetune, in the sense of Gwern's
[Guardian Angel](https://gwern.net/guardian-angel) essay: a model trained on
one principal's own text, to amplify them rather than to be a generic
assistant.

This package covers only the first stage of that programme — **assembling the
corpus and deciding whether it is worth training on**. It deliberately stops
short of the finetune. Everything here is node-only, dependency-free, and runs
in a sandbox with nothing but outbound HTTPS.

## Why this exists before any training code

The expensive mistake is finetuning on a corpus that was never going to work
and reading the resulting slop as a modelling problem. Post count is a
flattering metric: it counts bare links, `same`, and reposts of your own blog.
The census reports the pessimistic numbers instead, and says plainly what the
corpus can and cannot support.

## Use

```bash
node harvest.mjs <handle-or-did> --out corpus.jsonl --hydrate
node census.mjs corpus.jsonl
```

`harvest` pages the principal's entire `app.bsky.feed.post` collection off
their PDS via `com.atproto.repo.listRecords` — public records, no auth — and
normalises each one to a flat JSONL row.

`--hydrate` runs a second pass attaching the **text of each reply's parent**.
Do not skip it. An isolated post teaches voice; a post sitting next to what it
answered teaches the response function, which is the thing worth having. Both
passes are resumable: re-running appends only what is missing, so a rate-limit
costs one page rather than the whole run.

`census` then reports over the result. Run the selftest before touching the
measurement code:

```bash
node homunculus.selftest.mjs
```

## Sources

| source | tool | what it gives |
|---|---|---|
| ATProto repo (Bluesky, whtwnd, any lexicon) | `harvest.mjs` | posts, dialogue pairs, long-form entries |
| claude.ai conversation export | `chatlog.mjs` | every prompt the principal ever typed, already paired with a response |
| live prompts, from now on | `log-prompt.mjs` (hook) | the same stream, continuously |

The chat export is the densest of the three. It is intent, unedited, at
volume — closest to the active elicitation Gwern argues a corpus should be
built from, except it already happened.

To get it: **Settings → Privacy → Export data** on the web app or Claude
Desktop. It cannot be run from iOS or Android. A download link arrives by
email and expires 24 hours later. Projects and memory are not included;
memory exports separately.

```bash
node chatlog.mjs export.zip --inspect                 # what's actually in there
node chatlog.mjs export.zip --out chats.jsonl
```

`chatlog.mjs` detects the export's layout rather than assuming it — the schema
is undocumented and carries no compatibility promise, and a corpus builder
that silently yields an empty file is worse than one that fails. It finds the
message array, role field and text location by inspection, prints them under
`--inspect`, and refuses to write anything when it recognises nothing.

## The numbers that decide it

Of everything the census prints, three lines carry the decision:

| Line | Why it matters |
|---|---|
| **est. tokens** | Under ~100k, this is a prompt-engineering problem and no finetune will help. Under ~2M it is LoRA-only — a full finetune memorises rather than generalises. |
| **trainable pairs** | Replies to *other people*, with the parent resolved, where the reply says something. This is the highest-value material in a microblog corpus and should be weighted up in any mixture. |
| **longest thread** | Self-reply runs are the only essay-shaped structure a microblog has. If the longest is a few hundred words, the corpus cannot train long-form generation, and setting Gwern's "three essays a day" as the eval guarantees failure. |

Set the eval to what the corpus can actually support. For post-shaped data
that means *can it draft your replies*, not *can it write your essays*.

## What this is not

Not a trainer, not a solver, and not an endorsement of any particular base
model. Once a corpus clears the census, the next step is a LoRA on a model
built to be finetuned — [Inkling-Small](https://thinkingmachines.ai/news/introducing-inkling/)
via Tinker is the obvious current candidate at this scale — and that runs
outside this repo, against an API key this sandbox does not have.

The later Guardian Angel components — dynamic evaluation, ensemble uncertainty,
attested encrypted serving — are out of scope here by a wide margin. Gwern is
pitching a company for those, not a package.

## Record shape

```jsonc
{
  "uri": "at://did:plc:…/app.bsky.feed.post/3l…",
  "rkey": "3l…",
  "author": "did:plc:…",
  "text": "…",
  "createdAt": "2026-01-01T00:00:00.000Z",
  "langs": ["en"],
  "replyParent": "at://…",   // null if top-level
  "replyRoot": "at://…",
  "quoteOf": "at://…",       // null if not a quote post
  "embed": "external",       // images | record | recordWithMedia | video
  "facets": { "links": [], "mentions": [], "tags": [] },

  // added by --hydrate, on replies only
  "parentText": "…",
  "parentAuthor": "did:plc:…",
  "parentHandle": "someone.bsky.social",
  "parentIsSelf": false,     // true = continued thought, not a response
  "parentMissing": true      // parent deleted or unreachable
}
```

Deleted parents are recorded as `parentMissing` rather than dropped, so the
census reports real coverage instead of an optimistic one.
