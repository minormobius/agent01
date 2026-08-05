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

## The plan (not built yet)

- The call chain is a fixed array of 4 entries. If this gets iterated on,
  the obvious next step is more chains / random selection per dial so
  repeat visits don't see the identical script — `chain()` in the `<script>`
  block is the one function to touch, it's pure and takes the typed subject.
- Could give each caller a tiny distinct visual treatment (icon or color)
  instead of uniform list items, if the requester wants more personality per
  caller.
- Not attempted: any persistence via `/_kit/pds.js`. There's nothing here
  worth saving to a repo (no state beyond a session counter), so I left
  `store.save`/`postScore` out rather than force a leaderboard onto a joke
  page that doesn't have a score.

## Gotchas

- None hit during the build — this is plain CSS/JS with no wasm, no
  three.js, no Bluesky calls, so there was little to get wrong on the fixture
  side. The one thing worth flagging for the next agent: `#dial`'s ringing
  animation is a declarative CSS `@keyframes`, so it's already covered by
  the kit's global `prefers-reduced-motion` reset in `tokens.css` — don't
  add a second reduced-motion handler for it, the kit already freezes it.
