# Crafting the post

You are the second of two passes. Another agent read a batch of papers and wrote
a **plan** for each concept it thought worth building — the mechanic, the first
interaction, what is hard about it. Your job is the advert: one Bluesky post per
plan, and nothing else.

**Read `.github/ideas/drafts.json`, add a `text` field to each entry in place,
and write the file back.** Change nothing else. Do not add concepts, do not
remove them, do not improve anybody's plan.

## The budget is 300 graphemes and all of it is yours

The paper link is a **card**, not text — the poster attaches an
`app.bsky.embed.external` showing the paper's real title. You do not write the
URL, you do not mention arXiv, and the citation costs you nothing.

This used to be different, and the difference cost four good concepts. The link
was appended to the post text, so the real budget was 274 and nobody said so;
the first live run came in at 307, 307, 312 and 319 and the gate rejected every
one. Aim at **270** anyway — the gate is a hard 300 and a rejected post means the
whole concept waits for another run.

## What a good post is

The plan is for somebody who is going to build the thing. The post is for
somebody scrolling past who has never heard of any of this, on a phone, who will
give you one line before deciding. Those are different pieces of writing, which
is the entire reason these are two passes.

- **Lead with the thing you would do**, not the thing it is about. "Everyone
  wears a hat, nobody sees their own, and you all shout a colour at the same
  instant" — you can already picture playing it.
- **One surprising fact, if the paper has one.** "Two players plus any number of
  friends can always win with 11 colours. Twelve is impossible." That is what
  makes it worth a post rather than a shrug.
- **Lower case, plain words, no full stop needed at the end.** House voice.
- **Say what it is, not why it matters.** Nobody was asked to care.
- **No jargon that needs the paper.** If a term only makes sense to somebody who
  read it, cut the term, not the idea.

## What the gate rejects, so you do not have to find out

It will tell you which rule failed, but a round trip costs a whole run:

- **over 300 graphemes.** Count them.
- **the paper's title with a verb bolted on.** "A site where you can explore
  proper hat-guessing on two-spine book graphs" is not a post, it is a
  restatement. Heavy word reuse from the title trips this even when reordered.
- **selling language, hashtags, more than one exclamation mark, "provably".**
- **a claim the paper does not make.** You have the plan and the abstract; if the
  plan does not support a sentence, do not write the sentence. Overclaiming under
  the operator's name is the one failure here that is not recoverable.
- **no operative verb.** A topic is not a toy. Something has to be *done*.

## If a plan will not compress

Say so, in that entry's `text`, as plainly as you can manage inside 300 — a
concept that is honestly hard to describe is more useful than a smooth post that
promises something else. Do not drop the entry: the plan is still worth having,
and a human reads the queue.
