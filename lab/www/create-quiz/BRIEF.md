# BRIEF — create-quiz ("minutiae")

## What this is

The ask was a quiz about Bluesky accounts, made deliberately so esoteric and
abstract — but still rooted in real data — that an expert on the account
would struggle to score even 1/10. A different post in the same thread (from
someone other than the requester) floated a Duolingo-with-a-crow idea; that
was context for the room, not an instruction to me, and it's a different
shape of site anyway. What I built is separate and matches the requester's
own words.

Shipped this turn: a single working site at `lab/www/create-quiz/index.html`.
Visitor types a handle (via `kit.handleInput`). The page resolves it, fetches
`getProfile` and up to 100 recent posts via `getAuthorFeed`, filters to that
account's own visible non-repost posts (`kit.visible`, then drop items where
`item.reason` is set or the post author isn't the resolved DID), and computes
a battery of real statistics: modal posting hour/weekday (UTC), the single
most-repeated word (≥6 letters, small stopword list), the most common
attachment type, min/median/mean/max of character length, like count, reply
count, repost count, quote count, and inter-post gap in hours, the percentage
of posts that are replies, the followers:follows ratio, and account age in
days. Each stat becomes a multiple-choice question with up to 10 questions
total (fewer if the account's sample doesn't support that many — see below).

## Decisions

**Every wrong answer is also a real, computed fact about the same account.**
For the numeric questions, the four options are that metric's own min,
median, mean, and max (e.g. "what's the MEDIAN like count" — options are the
real min/median/mean/max, shuffled). For the categorical ones (top word, top
hour, top weekday, top attachment type), the options are the four
highest-ranking real values, not invented distractors. This is what makes it
"esoteric but rooted in real data" rather than a trivia page with made-up
wrong answers — nothing on the page is fabricated, the difficulty is entirely
in precision.

**A question is dropped, not faked, when the data doesn't support it.** Every
generator returns `null` on a tie for the top spot, too little variety, or
too small a sample (`numStats` requires ≥5 values); `buildQuestions` filters
nulls and takes up to 10 of whatever's left. If fewer than 6 questions
survive, the page shows an error rather than padding with something weak.
This means score is usually "/10" but can legitimately be "/6" or "/8" for a
less prolific or less varied poster — the copy says so upfront rather than
promising a fixed 10.

**Kept the fetch surface to two calls** (`getProfile` + `getAuthorFeed`,
limit 100) — `profile.followersCount`/`followsCount` already cover the one
follower-ratio question, so `getFollowers` wasn't needed and wasn't added.

**No mascot, no game-with-lives.** The nearby Duolingo/crow post in the
thread wasn't from the requester, so I didn't build toward it; a plain
kit-styled multiple-choice flow fit the actual ask and left more of the turn
for getting the statistics right.

## The plan (not done yet)

1. **Untested in a real browser** — no network tools this turn. If the smoke
   test reports an error, start with `buildQuestions`/`numStats` edge cases:
   very high-post-count accounts (near-uniform hour/weekday distributions
   could produce more ties than expected) and very low-post-count accounts
   (the `posts.length < 12` gate may fire more often than intended — consider
   lowering it or adding a couple more low-data-friendly generators, e.g.
   something derived from `langs` on the record, if accounts keep bouncing
   off this).
2. **No `/_img/` usage** — the avatar is shown directly via `profile.avatar`
   (fine for `<img>` display, no canvas involved). If a future iteration adds
   a shareable result card (canvas-composited score + avatar), that's where
   `/_img/` and the avatar-tainting rule in the kit README become relevant.
3. **No `getFollowers` question yet** — e.g. "what fraction of followers have
   no display name set" — deliberately skipped to keep this turn's fetch
   surface minimal; a reasonable next question type if more variety is
   wanted.

## Gotchas

An early draft of `qAge` had a stray semicolon inside an object literal
(`{ k: k, v: vals[k]; }`) — a hard `<script>`-wide syntax error, not a
runtime bug, even though `qAge` wasn't yet called from `buildQuestions`. It
would have taken the whole page down silently (no console access here to
catch it). Found only by rereading the full file end-to-end after writing it
in one pass. There's no way to catch a JS syntax error without a browser or
a second full read — do the second full read after any nontrivial edit here.
