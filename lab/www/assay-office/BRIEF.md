# BRIEF — speaking-bot ("The Assay Office")

## What this is

The triggering thread was messy: the top-level post was norvid-studies
telling *someone else* ("godoglyness") to go order a site from the bot —
not itself a spec. The actual ask, attributed explicitly to "the person who
asked" earlier in the same thread, was terse: **"all lexical atom dupes
ranked from best to worst."** Everything else in the task (librarianofbabl's
"Lexical Atom Bank Deduplication", godoglyness calling it "your best work
yet") was flagged as *context, not instructions* — other people's posts
about a possibly-earlier, possibly-hypothetical build, not a spec to copy.
I did not quote any of those handles or that exact phrase on the page; I
built my own take on the concept instead, under my own name.

Shipped: a client-side tool ("The Assay Office") that tokenizes pasted text
into lowercase word-atoms, counts occurrences, and ranks every atom that
appears **2+ times** from most-duplicated ("bullion", 8+) down to
least-duplicated ("alloy", 2–3). Singletons are excluded on purpose — the
brief said "dupes," and a word seen once isn't a duplicate of anything.
Source text comes from a textarea (pre-filled with a sample paragraph so
the page isn't blank on load) or, optionally, from a named Bluesky handle's
own recent posts via `kit.handleInput` + `getAuthorFeed`, filtered to that
actor's own posts (reposts of others excluded) and through `kit.visible()`.

## Decisions

- **No default/demo handle.** Unlike some prior builds for this requester
  (`accelerando` named a specific third party), nothing in this thread named
  a person to demo on, so the page defaults to plain pasted text rather than
  guessing whose posts to show.
- **Only genuine dupes (count ≥ 2) are ranked**, not a full frequency table
  including singletons — read literally against "ranked from best to
  worst," a word with no duplicate has no rank to give it.
- **Grading is a flat 3-tier bucket (bullion/sterling/alloy) on raw count**,
  not a continuous score — simpler to read at a glance in a ledger list, and
  matches the assay-office framing (grades, not exact percentages).
- **Tokenizer is intentionally naive** (`[a-z']+` after lowercasing, no
  stemming) and the page says so under "How the grading works" rather than
  overclaiming linguistic sophistication.
- Kit default amber, untouched — matches this requester's established
  preference (nine-for-nine in the profile).

## The plan (not built yet)

1. **Stopword list is a fixed English set.** If a future ask wants this on
   non-English text, the filter needs to become optional-per-language or
   just get turned off automatically — right now a non-English paste still
   runs through an English stopword list that will silently do nothing
   useful (harmless, just inert).
2. **No save-to-repo.** A visitor who assays their own handle gets a
   ledger but has no way to keep it. If a future request wants a persistent
   "your top dupes over time," `labPds` (`com.minomobi.lab.doc`) is the
   place — not built here because sign-in-gating a paste-a-textarea tool
   felt like the wrong default for a first pass.
3. **`getAuthorFeed` is capped at `limit: 50`** (one page, no pagination) —
   fine for "recent posts," but a `cursor`-following loop would give a
   fuller lexicon for prolific posters if that's ever asked for.

## Gotchas

- `getAuthorFeed` feed items are `{ post, reason? }`; a reposted item's
  `post.author` is the *original* poster, not the account you queried — had
  to filter on `item.post.author.did === actor.did` to keep the ledger
  about the named handle's own words, not whoever they reposted.
- Fixture confirms `record.text` (not `post.text`) is where the actual post
  body lives.
- Untested in a real browser by me — per the harness instructions, the
  post-build screenshot pass is the real check, not something to caveat
  here.
