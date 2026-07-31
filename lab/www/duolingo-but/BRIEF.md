# BRIEF — beakstreak

## What this is

The ask: "Duolingo but for my tweets that have the most likes, and instead
of an owl the mascot is a crow that yells at you and attacks you when you
make a mistake." One turn, fully shipped: type a Bluesky handle, it fetches
that account's posts, ranks them by like count, and turns the top 15 into a
streak-and-hearts flashcard round — fill-in-the-blank on the post text, and
"which of these two got more likes" A/B rounds. Three wrong answers and the
round ends ("thrown from the nest"); finishing all exercises shows a score
and best-streak summary with a restart button.

The mascot is an inline SVG crow (not an owl, not vendored art — hand-drawn
shapes) with three CSS-animated states: idle bob, happy flap-and-bounce on
a correct answer, and an "attack" lunge (scales up and dives toward the
viewer) on a wrong one, paired with a page-shake class, a full-screen red
flash div, a phone vibration if `navigator.vibrate` exists, and a rotating
set of yelled one-liners in a speech bubble. All of it is wrapped in
`@media (prefers-reduced-motion: no-preference)` so a reduced-motion
visitor gets the color/text feedback with no motion.

## Decisions

- **On-page name is "beakstreak", not the trademarked name.** The
  directory `duolingo-but` was assigned by the dispatch, not chosen here,
  but the `<title>`, `<h1>`, and OG tags deliberately don't use the real
  brand name — the house rule is build the mechanic, don't take the name.
- **Content pool is the top 15 posts by `likeCount` from one page of
  `getAuthorFeed` (limit 100), reposts filtered out, replies left in.**
  Reposts were excluded because they aren't "your tweets"; replies were
  kept because they're still the account's own posts and dropping them
  would shrink the pool too much on quieter accounts. No pagination — an
  account whose biggest hit is older than ~100 posts back will miss it.
  Said so in NOTE.txt.
- **Two exercise types, not more.** Fill-in-the-blank (blank the longest
  clean word in a post, 3 distractors pulled from the account's own other
  words plus a generic fallback bank) and A/B "which got more likes"
  (adjacent pairs from the like-sorted list, skipping ties). Both map
  directly onto "tweets that have the most likes" as the actual quiz
  content, which felt more honest to the ask than generic trivia.
- **Explicit "continue" button after each answer, not auto-advance.**
  Matches the genre's real UX (Duolingo does this too) and avoids a timed
  transition fighting with the crow's animation duration.
- **Hearts = 3, no leniency curve.** Simple and legible; a difficulty curve
  wasn't asked for.

## The plan — not built yet, in order

1. **Pagination.** Only the first `getAuthorFeed` page is fetched. Walking
   the `cursor` a few pages deep would make "most-liked" genuinely
   comprehensive rather than "most-liked among the last ~100 posts." Worth
   doing before anything else if the requester has an active/high-volume
   account.
2. **More exercise variety.** A natural third round: "guess the like-count
   bucket" (multiple choice ranges) for posts shown without their number —
   closer to the "for tweets with the most likes" framing than the A/B
   round alone. Didn't fit in this turn.
3. **Word-blank quality.** The blank-picker just takes the single longest
   word in the post; it doesn't avoid picking a word that appears twice in
   the same post (would blank only the first occurrence, second stays
   visible) or a word inside a quote/URL fragment that survived
   `cleanWords`. Low-risk given the length>=4, no-@/#/https filter, but
   untested against a real account's actual text.
4. **Share/result image.** `want-pairwise` and `tube-stacker` both grew a
   canvas "copy result image" button after the fact — this requester
   (per their profile) likes that feature and reaches for it on
   graph/game-like sites. A game-over card with score + crow would fit the
   pattern if asked for.

## Gotchas

- **`getAuthorFeed` items include reposts and replies by default** — reposts
  show up as a feed item whose `post.author` is the *original* poster, not
  the account you asked about, with a `reason` field marking it a repost.
  Filtering `!item.reason` is what excludes them; forgetting that filter
  would have quizzed the user on strangers' posts under their own name.
- **Word-blank index-finding must be a word-boundary regex, not
  `indexOf`.** A naive `text.indexOf(target)` can match the target word as
  a substring *inside* an earlier, longer word in the same post (e.g.
  target `"cat"` inside an earlier `"category"`), which silently blanks
  the wrong span. Fixed with `\btarget\b` (case-insensitive) instead.
- **Never tested in a real browser** — no Bash/WebFetch this turn. Read
  every fixture (`getAuthorFeed.json`, `resolveHandle.json`,
  `resolveHandle.error.json`) for field names before writing the fetch
  code; logic hasn't been run against live data or the production CSP.
