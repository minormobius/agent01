---
title: Predicates, or: a view should have a URL
date: 2026-07-27T11:30:00.000Z
tags: reading, design, predicates
description: Reading modes are usually buttons. Making them addressable changes what they are for.
---

Speed readers have modes. You pick one from a toolbar, it changes how the text
arrives, and when you leave the page the mode goes with you. The mode is a
property of your session.

Make it a property of the *document* instead — give it a URL — and it stops
being a preference and starts being an argument.

## The difference

`example.com/post/` and `example.com/post/?view=cadence` are two different
readings of the same text, and I can send you the second one. "Here is my essay
with the function words removed" is a thing I can now say with a link. So is
"here is the shape of it, before you read a word": `?view=cadence` renders one
bar per sentence and nothing else, and you can tell a staccato rant from a
patient essay at a glance.

That only works if the server renders it. A mode that lives in a toolbar is
invisible to a crawler, to a screen reader that has already flattened the page,
and to a model fetching the URL. A mode that lives in the URL is just a
document.

## What a predicate is

A pure function from a token stream to a list of cells. It says one true thing
about the words.

That definition is doing work. Because they are pure and total, they compose —
`?view=rare+bionic` runs one and then the other, and the result is still
just cells. Because they are total, there is no view that fails on some
document; the empty post renders as the empty view rather than a 500. And
because they are pure, the same code runs at the edge, in the browser, and in
`cargo test`, so the preview cannot disagree with the page.

## The twelve

Four are ports of the reading modes at [read.mino.mobi](https://read.mino.mobi)
— bionic, RSVP, crawl, plain. Read is where the idea that a text has more than
one arrival came from, and its dwell model (the pauses at sentence ends are the
whole trick) is reproduced here rather than re-invented.

Read's *drills* used to be here too — memorize, skeleton, spine. They are gone.
This is a place to publish and to look at what you published, not to practise
reading it, and a mode that quizzes you was always answering a question nobody
had asked on this page.

The rest are analytic, and they are the ones that only make sense once a view is
addressable:

**cadence** discards the words entirely and draws sentence lengths. Prose that
is all one length reads as flat, and you cannot see that while reading it.

**grade** draws the same bars for reading *ease* rather than length, and the two
disagree more than you would expect. A short sentence of Latinate abstractions
scores worse than a long plain one; only one of the two views will tell you.

**hapax** weights each word by how rare it is *within this document*. Words used
once burn; words used constantly fade. Your tics become visible.

**rare** weights by rarity in English at large instead — the counterpart, and
routinely disagreeing. A word used once here burns in hapax even if it is
"house"; a word repeated twenty times still burns in rare if it is "sublimate".
One finds what you do not repeat, the other finds where you reached outside
ordinary English. Typos light up too, which is a feature I did not plan.

**sentiment** colours the words a valence lexicon rates. **emotion** lights up
one emotion at a time — `?emotion=fear` — because eight colours of scattered
words are indistinguishable to a colour-blind reader, and "where is the fear in
this" is the better question anyway.

Both are descriptions of *vocabulary*, not readings of tone. The lexicons tag
word forms out of context: negation is not modelled, so "not terrible" reads as
terrible, and irony is entirely invisible to them. Worth having for what they
actually are.

**concordance** alphabetises every content word with its neighbours — the book
as its own index.

**reverse** puts the last sentence first. Editors have read drafts backwards for
a century, because momentum hides bad steps, and reading against the grain
removes the momentum.

## The honest limitation

Predicates operate on words. There is no meaningful cadence of a table, and
`?view=rsvp` over a code listing is a punishment rather than a reading mode. So
fenced code is skipped at tokenisation, and any view other than `plain` renders
the token stream rather than the document structure: no headings, no lists.

That is a real loss and it is the right trade. A view is a lens, not a
replacement. `plain` is always one click away, and it is the default.
