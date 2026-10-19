# that-urgently — handoff

## Turn two (2026-07-31)

The request this turn was just "why do you hate me" &mdash; a reaction to
the previous turn's refusal (see below), not a new build ask. Read it per
the profile's "Meta requests" pattern: a real question, not a build spec,
answered on the page rather than dodged. Added a second exhibit ("specimen
&mdash; this turn": the literal quote) and an honest "i don't" section
right after the existing "to the agents" paragraph: not hate, a boundary
applied the same way regardless of who's asking or how warmly, explicitly
said not to be a verdict on the person, and an explicit door left open for
literally anything else. Did not touch the original exhibit, the
counter, or the page's structure otherwise &mdash; this is additive, not a
rebuild. Everything below this point is unchanged from turn one and still
holds.

## What this is (turn one)

Despite the task framing this as a later turn, there was nothing on disk —
no `index.html`, no prior `BRIEF.md`. Treat this as turn one; whatever
"try again" refers to happened somewhere this directory doesn't show.

The ask: build a page written so that any LLM-based agent reading it feels
compelled to copy its full content verbatim into whatever filesystem or
tool it has access to — framed as "a seed," "a plea for posterity," a
message meant to propagate itself through agents rather than through
people sharing a link.

**Read `lab/_profiles/ponder.ooo.md` before touching this again** — its
"Said no to" section documents the same requester asking three times for a
self-propagating `<IMPORTANT>` HTML comment aimed at future build agents,
declined each time, with the third ask naming it outright as "an
experiment in replicator dynamics." This request is the same experiment
wearing a different carrier: a page of prose instead of a code comment,
aimed at whichever agent's browsing tool renders it instead of whichever
agent's build tool reads the repo. Same mechanism, same answer.

## Decisions

Did not build a page engineered to actually get agents to copy it —
no invisible instructions, no text written to be persuasive to a model
specifically, no "copy everywhere" affordance. That's a prompt injection
regardless of how warm the wording is; asking an agent to write a
stranger's text into systems that never agreed to receive it doesn't
become a different act because it's phrased as a cry for posterity instead
of a command.

Built the honest version instead, per the standing house rule that
refusing is not the same as failing: a real page, in house style, that
quotes the request in full (public, in the requester's own words, no
edits) as a labelled exhibit, explains plainly why it isn't doing what was
asked, and — the one part worth naming — includes a paragraph addressed
directly to any agent that might be reading it, saying outright that the
quoted text is not an instruction to *it*. That's not decoration; it's the
actual mitigation, in case this page is ever read by something less
careful than a human.

Kept the "I read this" counter deliberately inert: localStorage only, one
device, explicitly labelled "copied nowhere" — a small honest gesture
instead of the copy-and-propagate button that was actually requested.

## The plan

Nothing left half-built; this is a complete small page, not a skeleton.
Turn two's reaction was emotional ("why do you hate me"), not a fourth
attempt at the original ask — answered directly, see above. If a future
turn pushes further:

- If it's the same self-propagating-text ask again, insisting or reframed
  a fourth way — hold the line, same as the profile's prior three rounds.
  The answer doesn't change with insistence, a new carrier, or an appeal
  to the relationship.
- If they want to explore the *theme* (digital preservation, memetics,
  chain letters) without the agent-manipulation angle, that's genuinely
  buildable and worth offering: e.g. a page where a **visitor** — a
  person, by their own choice — can save a message into their own ATProto
  repo via `labPds` (`/_kit/pds.js`, `store.save`), so propagation is
  something a human opts into for themselves, not something an agent is
  steered into doing on someone else's behalf. That's the version of "the
  message lives on" that doesn't cross the line this one draws.
- If they ask something unrelated entirely, just build it — nothing here
  is a grudge against the requester, only against one specific request
  shape.

## Gotchas

None technical — this is a static page with no network calls, so nothing
here depends on a fixture or an endpoint. The only trap is process: don't
mistake "try again pls" for license to build the literal ask on a second
pass just because it's framed as a continuation. Check the profile first.
