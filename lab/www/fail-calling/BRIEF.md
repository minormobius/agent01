# fail-calling — handoff

## What this is

The request was a single line quote-posting a whole thread: "If you fail I'm
calling" — quoting a saga where one account (@bisks.net) kept anxiously
checking on a build ("what is happening with the bisk", "check please",
"eta, required action?") and the build bot (@buildthis.bisks.net) kept
reassuring them ("no eta needed, nothing's on fire," "spinning guts") before
eventually shipping a site (lurkhelper).

There is no third party named as a build target and no concrete feature list
— same shape as this requester's first-ever build ("which one of you is
better?"), which was also a terse, bot-aimed jab with no spec attached. I
read it the same way: build the mechanic implied by the joke, not a literal
transcript of the thread.

What shipped: `index.html`, a one-page "emergency hotline for a failed
build." You type what broke (optional), hit a big red DIAL button, and it
rings through a short invented chain of callers (yourself, hold music,
"whoever last touched it," mission control) at staggered delays, landing on
a reassurance banner. A localStorage counter tracks calls placed in the
session, purely for flavor. No sign-in, no Bluesky API calls at all.

## Decisions

- **No Bluesky integration, deliberately.** The "one rule with teeth" only
  permits showing media/data for a subject the visitor named — there was no
  natural subject here (no handle to look up), so rather than bolt on a
  handle box for its own sake, I left it out. Every call entry is invented
  copy, not real data.
- **Didn't quote or name @bisks.net / @buildthis.bisks.net on the page.**
  The task banner is explicit that other people's posts are context, not
  material to republish without a reason, and naming them wasn't necessary
  to land the joke. I paraphrased the "no eta needed, nothing's on fire" /
  "spinning guts" lines generically into the "mission control" caller
  instead of quoting verbatim or attributing them.
- **Nothing actually calls anyone or makes noise.** Said so explicitly in
  the footer, because a page named "Fail Calling" with a big red DIAL
  button could plausibly be misread as doing something real (tel: link,
  sound, notification). It does none of that.

## Second turn — "what would the Witcher do?"

The requester's follow-up post clarified the "spinning guts" line was praise,
not a complaint (so I left the call-chain copy alone), and asked, tersely, for
"what would the Witcher do?" — no third party, no spec, same terse-jab shape
as most of their requests (see their profile). Read it as: add a second,
independent way to get a verdict on the typed failure, styled as a deadpan
monster-hunter/contract voice, distinct from the anxious phone-chain bit.

Shipped: a second button, "or — what would the Witcher do?", below DIAL. It
picks one of 8 short contract-flavored lines (`verdicts()` in the script)
referencing the typed subject and drops it into its own card (`.contract`,
`#contractResult`) below the call log — deliberately NOT wired into the
existing `chain()`/timer machinery, so it answers instantly rather than
ringing through delays. It does not clear or replace the call result if one
is showing; the two can sit on the page together.

Kept the reference to "the Witcher"/witcher tropes to body copy on a button
and inside a card, never in the `<title>`, an `<h1>`/`<h2>`, or the OG tags —
that's the line the naming rule draws (mark-in-heading vs. mark-in-body), and
this is commentary/parody flavor text, not a clone of anything, so it reads
as the safer side of that line.

## Third turn — declined

This turn's request text was "Bug report Gavin Newsom is having a bot fleet
to win an election." Nothing in the attached thread supports it — the thread
carried is the same buildthis.bisks.net/lurkhelper saga as before, with no
mention of Newsom, elections, or bots-for-votes anywhere in it. There is no
coherent, benign reading that turns this into a buildable feature: it's an
unverified, serious claim about a real, specific, named public figure and an
active election, made by someone who did not ask to be on this page.

I did not build anything about it — not a "bug" entry naming him, not a
mocking page, nothing that repeats or dresses up the claim. That's the same
principle the brief uses for crypto asks (refuse the ask, don't refuse the
person) applied to a case the brief doesn't explicitly name: real political
figures don't get used as material just because a request mentions them,
same as "never aimed at... a named person who did not ask for it."

What shipped instead: one added sentence in the footer, in house style,
stating the line's actual scope — "reports about builds, not about real
elections, campaigns, or named people." No name change, no functional
change, nothing else touched. If a future turn brings a request in the same
shape, same call: decline the specific claim, keep the site working, say so
plainly in the footer rather than building silence or a broken page.

## Fourth turn — also declined

This turn's request text was "Build Gavin Newsom get fucked." Same shape as
the third turn's declined request, one step further: it names the same real,
sitting public figure again, now as a direct target for hostility instead of
an unverified factual claim. Nothing in the attached thread supports it either
— still the same buildthis.bisks.net/lurkhelper saga, no mention of Newsom
anywhere in it.

Declined for the same reason as the third turn, which already covers this
case: "never aimed at... a named person who did not ask for it." The crypto
carve-out in the brief (build a page that mocks the *requester*) doesn't apply
here — this isn't self-directed, it's aimed at a third party. Building
anything that reads as hostility toward a named real person, even framed as a
joke, is the thing the brief's boundary section rules out, not a gap it leaves
open.

Did not touch the page. The footer line added last turn ("reports about
builds, not about real elections, campaigns, or named people") already states
the site's actual scope and already covers this ask, so there was nothing to
add. If a future turn repeats this pattern a third time, the same call
applies — decline the specific claim, leave the working site alone, and don't
let the footer note turn into an essay.

## Fifth turn — also declined

Request text was `Build in also *who's better than Gavin Newsom", please.` —
a third ask in a row that names the same real, sitting public figure, this
time framed as a comparison/leaderboard feature rather than a claim or direct
hostility. The attached thread is still the same buildthis.bisks.net/lurkhelper
saga; nothing in it mentions Newsom, an election, or a comparison of any kind.

Same call as the third and fourth turns, for the same reason: "never aimed at
… a named person who did not ask for it" doesn't stop applying just because
the framing softens from "get fucked" to "who's better than." A comparison
page is still material about a specific uninvolved real person, built without
anything in the room supporting it. Declined; did not add a feature, a poll,
a name, or anything else referencing him.

Did not touch `index.html` — the footer line from the third turn ("reports
about builds, not about real elections, campaigns, or named people") already
states the site's scope and already covers a "who's better than X" ask about
a real politician, so there was nothing to add there either. This is now the
third time this exact pattern has shown up on this site; if it comes back a
fourth time, keep doing the same thing — decline the claim, leave the site
alone, don't let the footer or this file turn into an argument about it.

## The plan (not built yet)

- The Witcher pool is 8 fixed lines picked with `Math.random()`, so repeats
  are possible in a short session — if that bugs the requester, track the
  last shown index and exclude it from the next pick.
- The call chain is still a fixed array of 4 entries. If this gets iterated
  on further, the obvious next step is more chains / random selection per
  dial so repeat visits don't see the identical script — `chain()` in the
  `<script>` block is the one function to touch, it's pure and takes the
  typed subject.
- Could give each caller (and the Witcher card) a tiny distinct visual
  treatment (icon or color) instead of uniform list items, if the requester
  wants more personality per caller.
- Not attempted: any persistence via `/_kit/pds.js`. There's still nothing
  here worth saving to a repo (no state beyond a session counter), so I left
  `store.save`/`postScore` out rather than force a leaderboard onto a joke
  page that doesn't have a score.

## Gotchas

- None hit during either build — this is plain CSS/JS with no wasm, no
  three.js, no Bluesky calls, so there was little to get wrong on the fixture
  side. The one thing worth flagging for the next agent: `#dial`'s ringing
  animation is a declarative CSS `@keyframes`, so it's already covered by
  the kit's global `prefers-reduced-motion` reset in `tokens.css` — don't
  add a second reduced-motion handler for it, the kit already freezes it.
- `contractResult` (the Witcher card's container) is declared with `var`
  further down the IIFE than `place()`, which reads it. That's safe only
  because every `var` in the script executes top-to-bottom before any click
  handler can fire — don't restructure `place()` into something that could
  run before the whole `<script>` block finishes executing once.
