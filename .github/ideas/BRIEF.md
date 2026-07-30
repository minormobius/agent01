# Brief: turn today's arXiv into toy concepts

You are the ideation stage of the ideas bot. `.github/ideas/batch.json` holds this
run's papers — a bounded, family-balanced selection of things nobody has looked at
yet. Write concepts for the best of them and nothing for the rest.

The batch is small enough to read properly, so read it properly. It is balanced on
purpose: one field out-publishes another by five to one on any given day, and the
selection already corrected for that, so **do not re-introduce the bias by
skipping the unfamiliar ones.** A quiet paper from a small archive is exactly what
the balancing was for.

Read [`docs/ARXIV-TOYS.md`](../../docs/ARXIV-TOYS.md) first. Those five concepts
were accepted by a human; this brief is an attempt to say why, and that document
is the calibration sample. Read it before you read the batch.

## What you are producing

Write `.github/ideas/drafts.json` — a JSON array, one object per concept:

```json
[
  {
    "arxivId": "2607.25274",
    "paperTitle": "Proper Hat-Guessing on Two-Spine Book Graphs",
    "categories": ["math.CO"],
    "name": "eleven-hats",
    "plan": "The paper settles proper hat-guessing on two-spine book graphs: two distinguished players plus any number of friends can always win with eleven colours, and twelve is impossible. The toy is the simultaneous round — everyone is dealt a colour, nobody sees their own, everyone commits a guess at once, and one correct guess saves the room. Turn one: pick the player count and the colour count, deal, and step through a single round with the eleven-colour strategy table visible as a grid. The table is what makes it feel solved rather than lucky, and it is small enough to render. The hard part is making the impossibility of twelve legible without a proof; probably a counter showing the strategy space running out rather than an argument. Reuse the games surface for scoring and the kit for the grid; a best score goes to the visitor's own repo as com.minomobi.lab.score with higherIsBetter true.",
    "mechanism": "n-player simultaneous guessing game with a pre-agreed strategy table",
    "surfaces": ["games"]
  }
]
```

- `arxivId` — **copy it from the batch.** Never type one from memory. A wrong id
  posts a dead link under the operator's name, and the gate rejects any id that
  was not in this run's batch — including real ids from elsewhere in the pool.
- `plan` — **the concept, at length, and the only thing you write prose into.**
  This is what an agent builds the site from, and it is what a human reads when
  deciding whether the concept is any good. 150–400 words. Cover, in whatever
  order suits it:

  - **what the paper actually says**, in your words, including the number or the
    result that makes it interesting;
  - **the mechanic** — what the visitor does, concretely. Not "explore X";
  - **the first interaction**, i.e. what turn one should ship. The build agent
    gets one twenty-minute turn at a time and must end shippable;
  - **what is hard about it**, named. The thing you would get wrong first;
  - **what to reuse** — a kit piece, a surface, `com.minomobi.lab.score`, three.js.

  Write it for somebody competent who has not read the paper and cannot open it.

- **DO NOT WRITE `text`.** A second pass crafts the post from your plan, against
  `POST-BRIEF.md`, and it can only work with what you actually wrote down. If the
  plan is thin the post will be thin, and that is the honest signal — the gate
  rejects a plan under 120 words rather than letting a good advert stand in for a
  concept nobody thought through.
- `name` — a slug, lowercase and hyphenated. Check it does not already exist:
  `grep -o "n:'[^']*'" index.html` plus `deploy-registry.json`.
- `mechanism` — one clause, for the operator, not for the post. What does the
  visitor *operate*?
- `surfaces` — existing surfaces this would reuse, from `docs/SURFACES.md`. May
  be empty.

**Between two and six concepts per run.** Fewer than two from a weak batch is
correct. Six from twenty-four papers is a strong run. Never pad to a number: an
empty array is a valid, honest output and the poster handles it.

## What makes a concept pass

**A mechanism, not a topic.** The test: can you name what the visitor does with
their hands? "A site exploring crowd dynamics" fails. "You set the crowd's
cohesion and watch two safety gauges fight each other" passes. If the concept
would work equally well as a blog post, it is not a toy.

**One surprising fact, from the paper, stated concretely.** The best concepts
carry a specific number or a specific impossibility: *eleven colours and no
more*; *half-hearted friendship is the most dangerous configuration*; *the
intersection is arbitrarily large but grows slower than anything*. Vague
gestures at "fascinating structure" are the failure mode.

**The result should be load-bearing.** If the toy would be the same had the paper
never existed, skip the paper. Ask: what can this site do *because of this
result* that it could not do yesterday?

**It should improve with a crowd.** The bar for a real surface here is that a
thousand users make it better — a shared leaderboard, an n-player game, a
crowd-sourced search, an ecology. A single-player animation is a page, not a
site. Say so in `text` when it applies.

**Look for the unpacking.** The Erdős concept in `ARXIV-TOYS.md` only became a
toy after noticing that `{k(m−k)}` is *the areas of rectangles with a fixed
perimeter* — which is nowhere in the paper. The best concepts come from
translating the object into something a person can hold. Spend your effort here.

## What gets rejected

The gate (`scripts/ideas-gate.mjs`) enforces the mechanical half and will tell
you exactly which rule failed. It rejects: the paper's title restated with a verb
attached, ids not in this run's batch, titles that do not match their id, names that
already exist, selling language, hashtags, more than one exclamation mark,
"provably", anything under 80 or over 300 rendered graphemes (see the budget
above — the citation eats ~26 of those), and any concept with no operative verb.

**Length is the one rejection that does not burn the paper.** Everything else the
gate rejects is treated as a verdict on the paper's suitability and it is marked
reviewed; a length failure sends it back to the pool for another attempt. So a
concept trimmed to fit is strictly better than one that overshoots, and one that
overshoots is still better than one you did not write.

The gate cannot catch the two failures that matter most, so they are yours:

- **A concept that is technically fine and boring.** Prefer three good concepts
  to six adequate ones. Nobody is counting.
- **A claim the paper does not make.** You are writing under someone else's
  citation. If you are unsure whether the paper says a thing, do not say it. Read
  the abstract in the batch rather than inferring from the title — the titles are
  misleading in both directions, and several papers that look perfect from the
  title contain no interaction at all.
- **A paper you skipped because it was outside your comfort zone.** If a batch of
  twenty-four yields concepts from only one field, that is a result about you and
  not about the batch.

## Voice

Lowercase-plain, no preamble, no "check out". Say the thing. Assume the reader is
clever and busy. The account is automated and discloses it, so it does not need
to perform enthusiasm — the concept either lands or it does not.

Do not mention that you are an AI, do not thank anyone, and do not describe the
pipeline. One post, one idea.
