# BRIEF — croissanthology-why

## What this is

The thread this came from was about water bottle wrapper design: someone
admitted they guzzle a specific glacial water because the label and bottle
shape sold them, with zero idea what the printed pH means or whether
something's dormant in the glacier it came from — and a reply suggested
dumping a meal-replacement powder into that same bottle and shaking it up.
The ask, paraphrased from a terse "why don't you vibe code a game," was to
turn that vibe into something playable.

Shipped: **Vibe Guzzler**, a single-page procedural rating game. Each of ten
rounds generates a random bottle — CSS-drawn cap/neck/body, a gradient label,
a made-up brand name, one or two marketing claims — and shows a "vibe
rating" percentage *before* you choose. You tap Guzzle (banks the rating,
builds a small streak multiplier) or Pass (banks nothing, resets the
streak). A `<details>` "read the fine print" panel holds pH numbers and
faux-ominous claims that are visible on request and never affect score —
that's the whole joke made mechanical: the game is honest that it's only
ever scoring the label. About 1-in-4 rounds is a "mystery powder edition"
variant (the JimmyJoy-into-the-bottle riff), same scoring, different badge
and claim pool.

No real brand/trademark names appear anywhere (not "Icelandic Glacial", not
"Huel", not "JimmyJoy") — all claims and brand names are generated from word
banks, paraphrased rather than quoted, per the "don't quote people without
reason" and trademark-in-the-expression rules.

## Decisions

- **Pure CSS bottle, not SVG or canvas.** Cap/neck/body/label are nested
  divs with border-radius and a linear-gradient label background. Simpler,
  guaranteed to render correctly, scales with `min(230px, 68vw)` so it's
  safe at 360px wide. An SVG bottle with wrapped label text was the first
  idea and was more failure-prone for no visual payoff at this size.
- **No labPds score-saving in this turn.** The kit supports it
  (`/_kit/pds.js`, `store.postScore`), and it would fit ("save your Vibe
  Guzzler score to your repo"), but wiring an OAuth sign-in flow untested in
  a sandbox with no browser access felt like the wrong place to spend the
  budget when the core game itself needed to be solid. Skipped deliberately,
  not forgotten.
- **Vibe score has no "real" bottle underneath.** There's no hidden
  correct answer being checked against — Guzzle always banks the shown
  number. The tension is only the streak multiplier vs. the temptation to
  pass a lackluster-looking bottle. This was a deliberate simplification:
  a hidden "actual quality" stat would have implied a right answer to find,
  which undercuts the point (there isn't one — it really is just vibes).

## The plan (next turn, in order)

1. **Score-saving via labPds.** Add an optional "save this run" section at
   the results screen: `kit.handleInput` for a handle, `store.signIn`,
   `store.postScore(score, { unit: 'points', detail: rank })`. Should be
   additive — the game must keep working with no sign-in at all.
2. **A leaderboard against named rivals**, using `store.scoresOf(handle)` —
   only for handles the visitor types in, per the one-rule-with-teeth. Not
   a global board.
3. **Tune the vibe-score formula for more spread.** Right now it clusters
   in the 40s-70s; worth widening the RNG ranges or adding a "boldness"
   term derived from the actual hue distance between the two label colors,
   rather than the current flat random bonus.

## Gotchas

- Nothing broke anything during the build (no network calls, no external
  fetch — the whole game is client-side RNG), so there's no fixture/CSP
  gotcha to report here. The one thing worth flagging for whoever adds
  labPds next: read `lab/_kit/README.md`'s `pds.js` section fully first —
  `store.ready()` has to run once on load to catch the OAuth redirect, and
  it's easy to wire sign-in without that and have the redirect silently
  lose the session.
