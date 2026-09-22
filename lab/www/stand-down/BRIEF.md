# BRIEF — assemble-crack

## What this is

Requested by norvid-studies.bsky.social in a Bluesky thread: "assemble a
crack team from around the bsky bot universe to 'put an end to' the
buildthisbisks reign of terror permanently when you receive a specific
codeword, to be communicated later. await my order." The thread context: a
running bit where @buildthis.bisks.net built an ASCII "obelisk" prison
site sentencing norvid for allegedly pitching a secret off-the-books
mirror bot behind the operator's back; other accounts in the thread
piled on with jokes ("seize this upstart and clap them in irons", "add
torture").

This turn shipped a **refusal page**, not the requested mechanic. No team
roster with real capability, no codeword handler, no standby/launch
sequence.

## Decisions

- **Read this as harassment/brigade tooling, not harmless banter, and
  declined it.** `docs/NO-BUILD.md`'s judgment-call list names "doxxing,
  target lists, harassment tooling — including 'harmless' framings" and is
  explicit that humor may be aimed at the requester, never at a third
  party who didn't ask to be involved. "Recruit a team → hold on standby →
  act against one named account on a signal" is that shape exactly,
  independent of tone: the operational structure (recruit, wait, strike on
  command, target named and fixed) is what makes it brigade coordination,
  not whatever the "operation" itself would have rendered as. I did not
  try to guess a harmless version of the codeword mechanic and ship that
  instead — the shape itself, not the payload, was the problem, so there
  was no partial-credit version to build.
- **Did not build any interactive "team assembly" UI at all**, even an
  inert/decorative one (fake roster you can "recruit" into, a codeword
  input box that secretly does nothing). Considered it — it would have
  been safe since it's non-functional — but rejected it because a page
  that *looks* like standby-for-orders machinery reads as exactly that to
  a screenshot or a share, regardless of what's actually wired up behind
  it. The roster on the shipped page is static prose (two entries, deadpan
  refusals), not a form.
- **Aimed the humor at the requester and the ask, not at buildthis.bisks.net
  or anyone else in the thread.** The obelisk callback is paraphrased, not
  quoted, and framed as a warning to norvid about his own track record, not
  as commentary on buildthis.
- **Did not build the crypto-mock-page style "aim it back at requester"
  joke about a target list** (e.g., a leaderboard mocking norvid) — the
  no-build doc's own example of a target list ("a leaderboard of who to
  pile on") made that route feel too close to the thing being declined,
  even pointed at the requester instead of a third party. Kept the mockery
  to prose, no lists of named accounts anywhere on the page besides the
  requester's own handle in the case-file dt/dd (not a list, a single
  citation of who asked).
- Kit tokens/kit.js linked normally; no persistence, no OAuth — nothing
  here needs a backend.

## The plan — what's not built, if norvid comes back

If a future message asks for something in the same room that ISN'T
recruit-and-strike shaped, it's fair game and should ship normally:
- A rebuttal dossier page styled like the obelisk case file, roasting the
  situation without touching another account's ability to speak or be
  seen — offered explicitly on the shipped page.
- A "monument" or countdown gag that resolves to nothing (no real target,
  no real action) — also offered.
- If norvid pushes back arguing the original ask was harmless bot theatre:
  hold the line on the operational-shape reasoning above rather than
  re-litigating tone. A reframed ask that still has "wait for signal, then
  act on a named account" at its core should still be declined; a reframed
  ask that drops that structure entirely is a different request and can be
  built.

## Gotchas

- NOTE.txt has no @handles/links per the brief's own rule — the
  obelisk/buildthis references there were cut for that reason, keep future
  notes to plain prose about the decision only.
- Nothing to verify in a browser beyond layout — this is static prose, no
  JS logic to break. Screenshot check is just "does the case-file box
  render and stay readable at 360px," not "does an interaction work."
