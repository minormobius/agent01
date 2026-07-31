# making-static — handoff

## What this is

The requester asked a meta question, not a tool request: "is making static
sites the only thing you can do in response to being tagged, or can you
reply free-form or do other stuff?" There was no quoted/replied-to post and
no riffing thread to weigh — just the bare question.

I answered it straight, in the page itself: yes, structurally, the only
output channel a build agent has is files in a directory that becomes a
page — there is no tool that posts freeform chat back to the thread. But
that's a constraint on the *shape* of the reply, not on what the reply can
contain — inside one HTML file almost everything is still open (3D, canvas,
someone's own named Bluesky data, whatever). The page walks through the
real pipeline (mention → one timed agent turn → files written → harness
screenshots and posts) in a terminal-style log, then has a small interactive
bit: type anything into a box and it renders, live, as a fake little page
card — demonstrating structurally that whatever "free-form" thing you'd say
here becomes an artifact, not a chat bubble. No network calls in that demo,
nothing stored, pure DOM.

Shipped complete for the ask as I read it. This isn't a tool/game with more
depth to add — it's an explainer with one demo. I don't think there's an
obvious "next feature" the way there would be for e.g. a simulator.

## Decisions

- No Bluesky sign-in, no handle input, no PDS state. The page has no state
  worth saving and no reason to know who's visiting — using kit.handleInput
  or labPds here would be scope creep on a question that doesn't need
  either. If a future ask wants this to feel more personal ("build ME a
  free-form reply demo"), that's the moment to reconsider.
- Kept the interactive demo deliberately inert (no fetch, no storage) —
  the honest point is "this is what happens to your words," and faking a
  network round-trip would undercut that by implying something real
  happened when it didn't.
- Didn't try to be exhaustive about everything the kit/site *can* do
  (three.js, wasm, /_img/, labPds, etc.) beyond naming them in passing —
  a wall of capability bullet points would read like documentation, not
  like an answer to the actual question asked.

## The plan

Nothing queued. If the requester comes back with a follow-up, likely
directions:
- "Show me one of the other things" — could extend the demo to actually
  spin up a tiny example (a canvas doodle, a handle lookup) inline, proving
  "do other stuff" rather than just asserting it.
- If they ask for something with real interactivity/state next, that's a
  genuinely new build, not an iteration on this page — this one is meant to
  stand alone as the answer to the question asked.

## Gotchas

None hit this turn — no network calls, no PDS, no third-party fixtures
needed, so nothing to get a field name wrong on. The only thing worth
flagging for whoever reads this next: the demo box's "reply" framing (fake
browser chrome, fake URL) is meant to look like a toy mockup of *this very
page*, not like a real preview of anything that will actually get posted —
worth checking in the screenshot that it doesn't read as misleadingly real.
