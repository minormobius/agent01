---
title: A box to rant into
date: 2026-07-28T09:00:00.000Z
tags: rant, atproto, standard.site
description: Why this exists, what it writes to your repo, and why the whole thing is Rust.
---

There is a specific kind of thought that dies in the gap between having it and
finding somewhere to put it. Not the good ones — the good ones survive being
written down badly. The ones that die are the ones that need about four minutes
and a plain box, and instead get offered a content management system.

So: a box. You type into it, you hit post, and the words go somewhere real.

## Where "somewhere real" is

Your own repo. A post here is a `site.standard.document` record in your ATProto
personal data server — the same place your Bluesky posts live, under your own
DID, portable to any other host that speaks the protocol.

That record is not a Rant-shaped thing. It is a
[standard.site](https://standard.site) record: a shared lexicon that several
independent long-form projects agreed on, precisely so that a post is not
hostage to the site it was typed into. An indexer that has never heard of this
domain can read it. A different reader can render it. If this site vanishes
tomorrow, your posts do not.

The raw markdown rides along inside the record's `content` union as an
`at.markpub.markdown` member, so the *source* is portable too, not just a
rendering of it.

## The subscribe button is a record too

Subscribing writes a `site.standard.graph.subscription` to **your** repo,
pointing at this publication. Nothing lands in a database here. There is no
list of you. Unsubscribing is deleting your own record, which is the correct
amount of power for a reader to hold over their own subscriptions — so the
button is a toggle, and pressing it again deletes the record.

The recommend button on each post works the same way —
`site.standard.graph.recommend`, in your repo, pointing at the document.

Everything this site has ever written to your repo is listed at
[/mine/](/mine/), with a delete button on each row: your posts, your
publication record, your subscriptions, your recommends. A frontend that can
only *add* to your repo is not really handing you your data.

## Anyone can use it

There is nothing owner-only about this. Sign in with your own handle, hit
[/setup/](/setup/) once to create your publication record, and write. Your posts
go to your repo and read back at `/read/<your-handle>/`. The posts on this front
page are just the ones that happen to be text files in the repo.

## Weird ways to read

Every post has views. They are in the URL:

- `?view=cadence` — not the words: the shape. One bar per sentence, by length.
- `?view=grade` — the same bars for difficulty. It disagrees with cadence often.
- `?view=hapax` — weighted by rarity in this post. The once-only words burn; the
  fifteenth "however" is nearly invisible.
- `?view=rare` — weighted by rarity in English instead. Different answer.
- `?view=sentiment` — the words a valence lexicon rates, signed.
- `?view=emotion&emotion=fear` — one emotion at a time.
- `?view=reverse` — last sentence first. Reading an argument backwards from its
  conclusion strips the momentum that hides a bad step.
- `?view=bionic`, `?view=rsvp`, `?view=crawl` — the reading modes from
  [read.mino.mobi](https://read.mino.mobi), which is where the idea came from.

They compose: `?view=rare+bionic`. And they are server-rendered, so a view
is a link you can send someone, and it works with JavaScript off.

## Why Rust

Because the whole design leans on one number. Parsing this post, tokenising it
and rendering it to HTML costs about 240 microseconds end to end — a quarter of
a millisecond, measured, in `rant/crates/rant-core/tests/budget.rs`, which fails
the build if it regresses. The individual stages are in the tens of
microseconds; markdown rendering is the expensive one at around 100.

That is fast enough to render every request at the edge with no cache — so a
post is live the instant the record lands, and there is no invalidation to get
wrong. It is also fast enough to re-render the entire preview on every
keystroke in the composer, which means the preview *is* the renderer, not an
approximation of it that disagrees with the real one at the worst moment.

The Worker is Rust compiled to WebAssembly. The browser side is Rust compiled
to WebAssembly. There is no hand-written JavaScript in this site, except the
shared OAuth client every site here uses, which would be a bad thing to
reimplement.

## For the agents

There is an MCP endpoint at `/mcp`, an index at `/llms.txt`, the full corpus at
`/llms-full.txt`, and JSON at `/api/*`. An agent can list posts, read them,
render markdown, run predicates over arbitrary prose, and build the exact
record that publishing would write.

It cannot publish. Writing to a repo needs the author's OAuth grant, and that
grant lives in the author's browser, which is where it should stay. `draft_post`
hands back the record; a human hits Post.
