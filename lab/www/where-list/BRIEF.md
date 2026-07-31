# BRIEF — where-list

## What this is

The original ask (earlier in the thread) was "make a page where you list the
apps you have built including their slugs and a brief description" — a
self-referential index of lab-factory sites. The requester then followed up
with "disregard and cancel the build, or if you can't do that just make a
page which displays a committee having a mundane discussion about mundane
committee things."

There's no way to actually cancel a turn from inside it, so this build took
the explicit fallback: it ships a fake committee-minutes page instead of the
app list. `index.html` is a static, self-contained transcript of a committee
working through a nine-item agenda (apologies, approval of minutes, matters
arising, treasurer's report, biscuits, room booking, date of next meeting,
AOB, motion to adjourn) one line at a time via a "Next" button, plus a "Skip
to end of item" button for anyone who doesn't want the slow reveal. When the
agenda runs out, it starts the next meeting automatically and keeps going —
the joke is that the committee never actually finishes.

This shipped complete in one turn — it's a closed, finite piece of content,
not a skeleton of something bigger.

## Decisions

- **No app-list page was built at all**, deliberately — the most recent
  instruction superseded the original ask rather than adding to it. If a
  future turn gets a request to "actually do the app list now," that's a
  fresh, unrelated page; don't try to bolt it onto this one.
- **Visual identity deliberately breaks from the kit's dark theme.** Overrode
  `--bg`/`--fg`/`--accent`/`--radius` to a pale, serif, photocopied-form look
  (cream background, double rule under the header, serif type) instead of the
  kit's dark monospace default. The mismatch is the point — a page about
  bureaucratic mundanity should look like a bureaucratic document, not like
  the rest of the factory. `tokens.css` is still linked (kept the input/button
  base shapes) but nearly every colour token is overridden locally, which the
  house rules explicitly allow.
- **No Bluesky lookup, no kit.js, no handleInput.** This requester (profile
  in `lab/_profiles/ezba.bsky.social.md`) has asked for pure-narrative pages
  with no handle box before (`where-role`), and this is another one — there's
  nothing here that names an actor, so pulling in the Bluesky helpers would
  have been dead weight.
- **Direct manipulation, not autoplay.** The transcript advances one line per
  tap of "Next," not on a timer. The profile notes a preference for direct
  manipulation over autoplay animation on a different (dataviz) page; applied
  the same instinct here even though this page has no numbers in it.
- Content is a fixed, hand-written script (nine agenda items, ~35 lines of
  dialogue) rather than randomly generated banter — deliberate, so every
  meeting reads the same and the callbacks (the whiteboard marker, the
  semicolon, the biscuits) land the second time through.

## The plan (if there is a next turn)

Nothing is unfinished in the sense of "broken" — the page works standalone.
If the requester wants more:

1. **Vary the loop.** Right now meeting 2, 3, 4... replays the identical
   script with only the meeting-count line changing. The easy next step is a
   small pool of alternate lines per agenda item, picked pseudo-randomly per
   meeting, so a visitor who lets it run doesn't see verbatim repeats. Keep
   the callbacks (marker, semicolon, biscuits) — vary the filler around them.
2. **If the app-list page still gets requested**, build it as its own thing:
   walk `deploy-registry.json`'s `surfaces[]` for slug + dir + a short
   description per lab tenant. That's a different page with a different job;
   don't try to retrofit it into the committee transcript.
3. Nothing here depends on network, OAuth, or any fixture — there's no
   fixture-reading risk to flag for a future pass.

## Gotchas

- Nothing broke during the build; there was no API to get wrong. The only
  thing worth flagging: the containment gate only allows this directory, so
  don't be tempted to add a link back to a factory-wide app index from here —
  that index doesn't exist yet, and a dead link would be worse than no link.
- The "Skip to end of item" button renders every remaining line in the
  current item instantly without the fade-in animation (animation only
  applies to lines added one at a time via "Next"). That's deliberate, not a
  bug — instant skip should feel instant.
