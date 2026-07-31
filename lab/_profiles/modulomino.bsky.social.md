# @modulomino.bsky.social

## Palette and type
No stated preference yet. Kit defaults throughout (dark surface, warm amber
accent, monospace). `give-more` added a local surreal desert-sky gradient behind
its canvas for thematic reasons, not as a palette preference.

## Layout
No pattern yet — two data points, and they point in different directions.

## Features they reach for
Both kinds, so do not over-fit to either:

- **Utility tools.** `tzclock` — a UTC clock with copy-to-ISO-8601, no Bluesky
  content at all. Likes a copy-to-clipboard action on whatever the page produces.
- **Playful visual toys.** `give-more` — melting clocks in 3D, again with no
  Bluesky data. "Fun to look at and fiddle with" rather than informational.

The common thread is not "utility" or "toy", it is **no feed content**: neither
request touched Bluesky data. Do not reach for the AppView unless asked.

## Said no to
Nothing recorded yet.

## Notes
Asks in short, run-on phrases ("give me more clock tools weird clocks melting
clocks and do it in 3js") and does not use `name:`, so names get derived — hence
the slug `give-more`, which describes nothing. Worth suggesting `name:` early.

`tzclock` was asked for twice ("try again"); the first attempt died on a
harness bug, not on anything about the page.

`give-more` was also asked for twice, but the second ask was substantive, not
a retry: the first build shipped a hand-rolled WebGL renderer (three.js
wasn't vendored yet, and a CDN import is blocked by the CSP), and once the
operator vendored three.js locally, the second round asked for "do it in
3js" specifically — real three.js, not a from-scratch simulation of it. Worth
remembering if this requester asks for something else that's currently
blocked by a missing kit capability: they'll likely come back for the real
version once it exists, rather than settle permanently for the workaround.

A third `give-more` round gave the clearest signal yet about how this
requester reviews a build: they notice **physical implausibility** ("clocks
melt into the scene when they should hit a surface as a minimum" — i.e.
melted geometry was clipping through the table instead of resting on it) and
**incomplete interaction sets** ("give me a way to pan the scene, not just
rotate"). Both are specific, concrete complaints about a shipped thing, not
vague redesign requests — they engage with the actual mechanics of what was
built. Worth over-delivering on physical/interaction completeness up front
(surfaces that geometry can't pass through, a full camera control set —
orbit *and* pan *and*, next time, probably zoom) rather than waiting for it
to be requested piecemeal. Also asked to "randomize more" on an existing
random-reshuffle feature — a second nudge in the same direction (more/wider
variety) reads as "the randomization scope was too narrow," worth erring
wide on ranges and on *what* gets randomized (not just parameter values, but
counts/types of things) for this requester from the start.

A fourth round confirmed the pattern and sharpened it: they actually look
closely enough at a live 3D render to name a **rendering artifact** by its
visual signature — "glitching through in a high frequency discombobulating
manner" is a precise, if informal, description of z-fighting — and then
proposed **two concrete candidate fixes themselves** ("epsilon thickness…
or maybe give the clocks some thickness"), correctly diagnosing that either
would work. This requester is comfortable reasoning about implementation,
not just symptoms — a build note explaining *why* a bug happened and which
of their suggested fixes was taken (and why) is worth writing, not just
what changed. They also iterate in tight visual-QA loops on one site rather
than spreading requests thin: four rounds on `give-more` now, each reacting
to the specific thing just shipped. Expect them to keep looking that closely
next time, on this site or a new one.

<!-- Merged by hand after an add/add conflict: this file is SHARED across a
     requester's sites, but each site branch used to be cut from the feature
     commit and never saw it, so every build re-created it from scratch. The
     give-more agent wrote "first build for this requester" while tzclock's
     profile already existed on the publish branch — it had no way to see it.
     lab-build.yml now merges claude/lab-www in BEFORE the agent runs. -->
