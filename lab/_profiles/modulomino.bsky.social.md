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

<!-- Merged by hand after an add/add conflict: this file is SHARED across a
     requester's sites, but each site branch used to be cut from the feature
     commit and never saw it, so every build re-created it from scratch. The
     give-more agent wrote "first build for this requester" while tzclock's
     profile already existed on the publish branch — it had no way to see it.
     lab-build.yml now merges claude/lab-www in BEFORE the agent runs. -->
