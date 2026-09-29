# BRIEF — odyssey-trail (NOSTOS)

## What this is

The ask was a terminal game sailing the Aegean, beset by calamities, where
"navigation by guest culture correctly" is the mechanic. I read that as
xenia — the ancient Greek guest-host code — and built a linear text-adventure
following Homer's actual route: Lotus-Eaters, Polyphemus's cave, the
name-shouting temptation on the way out, Aeolus's bag of winds, the
Laestrygonians, Circe, the Sirens, Scylla and Charybdis, the Cattle of the
Sun, the Phaeacians, then Ithaca and the suitors. Every stop is a 2-choice
(occasionally 3) decision where the "correct" choice is the one that
actually observes xenia (offer the guest-gift, hold your tongue, tell the
truth to a host, don't touch what belongs to someone who didn't invite you)
and the wrong one trades short-term gain for favor/crew/hull. Random sea
events (storm, becalmed, fair wind, restless crew, omens) are interleaved
between landfalls to eat at supplies and add variance. The whole thing
shipped in one turn — content, engine, and finale are all complete and
playable start to finish, including the win condition (string the bow,
kill the suitors) and multiple loss conditions (hull, supplies, or divine
wrath hitting zero).

## Decisions

- **No Bluesky calls at all.** The game needs no handle, no avatar, no
  leaderboard of named people — adding `kit.handleInput` or `pds.js` would
  have been decoration, not function, and every fixture I'd have needed to
  trust blind. Kept the surface area to zero risk instead.
- **Named it NOSTOS, not "Odyssey" anything.** "Odyssey" the word is public
  domain, but I didn't want a heading that reads like it's riffing on a
  specific commercial game title (there are several called exactly that).
  Nostos — Greek for "homecoming," root of "nostalgia" — is more precise to
  what the game is actually about anyway.
- **Numbered-button choices, not a text parser.** A real command parser
  would be a better "terminal" feel but is a much bigger, fuzzier surface to
  get right blind with no way to test it interactively. Buttons (with
  optional 1-9 keyboard shortcuts) are unambiguous, fully mobile-tappable
  at 44px+, and still read as terminal output because everything above them
  is plain scrolling monospace text.
- **All choice text renders instantly, no typewriter effect.** A
  character-by-character reveal is the obvious "terminal" flourish but adds
  timing logic that's pure risk for pure decoration, and it doesn't
  interact cleanly with prefers-reduced-motion the way tokens.css's CSS-only
  reset does. Skipped it.
- **Sacred-cattle choice deals damage immediately rather than deferring a
  storm to the next beat.** The myth has Zeus's storm follow within days and
  kill nearly everyone; modeling that as an instant combined
  supplies+favor+hull+crew delta on one choice was simpler and just as
  narratively honest as a flag-and-defer system, for a lot less code.

## The plan — what's not built, in order

1. **Playtest and rebalance.** I could not run this in a browser. The
   numbers (starting supplies=100/hull=100/crew=12, per-event deltas,
   restock amounts at Aeolus/Circe/Phaeacians, the bow success-chance
   formula in `showBow()`) are all reasoned estimates, not tuned. If it
   feels unwinnable or trivial, this is the first thing to fix — the
   formula is one line (`clamp(0.4 + state.favor/150 + ...)`) and the
   per-choice deltas are all in the `ISLANDS` array, easy to nudge.
2. **Consider an optional PDS save via `/_kit/pds.js`.** Right now
   `localStorage` tracks attempts/wins/best-days locally per browser. A
   "sign in to keep your voyage record across devices" button (optional,
   not gating play — see the kit's own rule on this) would be a natural
   next feature, using `com.minomobi.lab.score` via `store.postScore()`.
   Not done this turn because it adds an OAuth flow to verify blind.
3. **A short intro screen with the stakes spelled out** (what xenia means,
   why it matters mechanically) exists as one paragraph under the title;
   it could be split into its own pre-game screen with more flavor if the
   requester wants more scene-setting before the first choice.
4. **More variance in the Scylla/Charybdis and Cattle-of-Helios odds** —
   right now only Scylla/Charybdis rolls dice. A few more chance-based
   beats would help replayability without more branching content.

## Gotchas

- The finale (`showFinale()` → `showBow()`) does NOT go through the generic
  `BEATS`/`idx` engine — it's hand-wired because it's a one-shot terminal
  sequence, not a repeatable beat. If you add more finale steps, wire them
  the same way (direct function calls with their own button), not by
  pushing more entries onto `BEATS` — the generic engine assumes every beat
  after it still has a "next" beat to advance to.
- `kit.js`'s `bskyGet` allowlist and `lab-content-gate.mjs` are irrelevant
  here since nothing calls the AppView — don't add a "type your handle for
  a personalized ending" feature without rereading both, since the one rule
  with teeth (subject the visitor named, never a stream) still applies even
  to something that feels harmless like "your handle" flavor text.
- All game text is inline JS string literals with real apostrophes/dashes —
  some are curly (’) inside single-quoted strings specifically to avoid
  breaking the string delimiter, others are straight inside double-quoted
  strings. If you add new content, match that pattern or the file won't
  parse.
