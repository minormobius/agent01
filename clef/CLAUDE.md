# clef — sheet music in plain text

`clef.mino.mobi`. A sheet-music **viewer and composer**: it reads a working
subset of **LilyPond** notation, engraves it as classical notation in SVG,
plays it back, and publishes it to the reader's own ATProto repository.

Pure static assets behind a trivial worker. The parser, the engraver, the synth
and the MIDI writer all run in the browser — nothing is uploaded, nothing is
stored here, there is no build step and no dependency.

---

## Why the format is text

Sheet music locked in a proprietary binary is music you cannot diff, grep,
email, keep in git, or read once its program is gone. LilyPond's input language
is the closest thing engraving has to a lingua franca for plain-text scores, and
there is a real public-domain corpus written in it. So `clef` reads *that*
language rather than inventing a ninth one — and the record it publishes stores
the **source**, not a rendering.

**This is not LilyPond.** LilyPond proper is a Scheme-extensible typesetting
system with decades of engraving research in it. This is a reader for the
notation subset. Anything it cannot read is reported as a diagnostic rather than
dropped, because a note that silently vanishes is worse than an error message.

## The shape of it

```
index.html          the page
styles.css          the page around the page
worker.js           serves the files, answers /health
src/model.js        pitches, durations, clefs, key signatures — the vocabulary
src/lily.js         the parser: LilyPond text -> staves of timed events
src/glyphs.js       the notation typeface, as hand-authored SVG outlines
src/engrave.js      layout: accidentals, columns, spacing, systems, beams, ink
src/audio.js        playback patches, the lookahead scheduler, WAV export
src/midi.js         Standard MIDI File writer
src/library.js      the eight bundled pieces
src/app.js          the page's behaviour
src/auth.js         byte copy of packages/oauth-client/auth.js (see below)
lexicons/           com.minomobi.clef.piece
test/               node selftests — preflight runs these
```

Read them in that order; each layer only knows about the ones above it.

## Three ideas that carry the whole thing

**1. A pitch is a spelling, not a number.** `(step, alter, octave)`. C-sharp and
D-flat sound alike and are drawn on different lines, so the engraver needs the
spelling and the synth derives the MIDI number from it. Collapsing the two is
how notation software goes wrong.

**2. Durations are integers.** 960 ticks to the quarter. Dotted and tuplet
arithmetic has to be exact, or bar lines drift by a rounding error halfway down
a page. `noteValue()` maps a tick count back to how it is *drawn*, which is a
different question from how long it *lasts* — a dotted quarter is drawn as a
quarter plus a dot.

**3. A column is shared by every voice and every staff.** `engrave()` collects
every onset tick in a bar into one column and gives it one x. That single idea
is why the left hand lines up with the right hand, and why a triplet in one
voice does not shove another voice's downbeat sideways. Everything else in the
layout is spacing on top of it.

## The engraving pipeline

In `engrave.js`, in this order, because each step needs the last one's answer:

1. **resolve** — walk each voice carrying clef/key/metre forward; decide which
   notes show an accidental (accidentals take horizontal room, so nothing can be
   measured before this).
2. **measure** — cut the timeline into bars from the running metre, not from bar
   lines: most input has none. `|` is a *check*, and a failed one is reported.
3. **column** — one x per onset tick, shared across the system.
4. **space** — width from the shortest note in the column, on a compressive
   curve (`spring()`): a half gets more room than a quarter, nowhere near twice.
5. **break** — fill systems with bars, then justify by stretching the springs,
   never the glyphs.
6. **draw** — stems, beams, ties, slurs, then ink.

Every drawn note carries `data-ev`, an index into the returned event table. That
is what lets a click on a notehead land the caret on the characters that drew
it, and it is the whole basis of the editor.

## The typeface

No music font ships. A SMuFL font is a network request that can fail, a licence
to carry, and ~400 KB for the dozen glyphs a score needs — so `glyphs.js` draws
them, in a coordinate system where **1 unit = 1 staff space**, the unit
engravers reason in. Every offset in `engrave.js` therefore reads as a musical
quantity rather than a pixel count.

Clefs and the quarter rest are **stroked** paths rather than filled outlines: a
stroked spline is a stable way to draw a spiral, where nudging one control point
in a filled outline puts a kink in an edge that must be matched on the way back.
Sharps and naturals are four overlapping quadrilaterals unioned by the nonzero
winding rule, which is why they can be written as plain shapes instead of one
error-prone contour.

To check a change to a glyph, render it against a staff and *look*: the failure
mode here is "plausible but wrong", which no assertion catches.

## Things that were wrong, and are asserted now

`test/notation.selftest.mjs` has 748 checks. Almost every bug this code has had
was a wrong number that still drew something plausible, so the tests are known
answers rather than snapshots. The ones worth knowing about:

- **A key signature drawn an octave low still looks like a key signature.**
  `keySignaturePositions()` returns staff positions (half-spaces) — the same
  unit noteheads use. Doubling it put every bass-clef signature an octave out.
- **A stem anchored at the middle line still looks like a stem.** Seeding a
  chord's extremes at 0 instead of at its own notes grew a stem back to the
  centre for every chord that sat entirely above or below it.
- **`<< \new Voice … \new Voice … >>` is two voices.** Without `\\` the parser
  wrapped both branches in one sequence, so two-part writing engraved as one
  part with the other part's rests on top of it. Two separate causes: the
  `<< >>` wrapper, and an implicit sequence that swallowed the `\new` after it
  because the break check ran before skipping whitespace.
- **A tie is one sound.** `scoreToNotes()` merges tied notes before playback and
  before MIDI export.
- **Editing one note must not move any other note.** In `\relative` mode a
  note's octave is read from the note before it, so inserting, transposing or
  deleting one silently transposes its successor. Every edit in `app.js`
  re-spells the next note against the new reference in the same edit
  (`respellNext`), and the reference for the first note of a block is the
  `\relative` argument, not "nothing".
- **Ledger lines are drawn over their own noteheads.** They intercepted every
  click aimed at a note outside the staff. All the scenery is
  `pointer-events: none`; only noteheads and rests are targets, and a click on
  blank staff falls through to the SVG, which is what writes a note there.

## Playback

`audio.js`. Preview playback is for **proofreading** — you play a bar back to
find out whether what you typed is what you meant — so pitch and rhythm must be
exact and the timbre only has to be pleasant enough not to fight you.

Patches are partials plus an envelope. `decayTo` splits the two families that
matter: struck instruments (piano, harpsichord, music box) decay to silence
whether or not the note is held; blown and bowed ones (organ, strings, flute)
hold until released. Getting that number wrong makes everything sound like a
doorbell.

The scheduler pushes notes into the graph a fixed distance ahead of
`ctx.currentTime` and no further. Scheduling from a timer callback drifts;
scheduling the whole piece up front makes stopping take as long as the piece.

**Repeats are expanded** so the preview is the performance. **`\alternative`
endings are not**: a score with voltas plays straight through, which is wrong
about repetition and right about every note. Half-implementing it would play the
wrong notes, which is worse.

## Auth

Reading, writing, playing and exporting need no account. Signing in only adds
**publish**, which writes one `com.minomobi.clef.piece` record to the reader's
own repository — this site keeps no copy and cannot delete it for them.

`src/auth.js` is a byte copy of `packages/oauth-client/auth.js`. Static sites
cannot import across directories; **edit the package, never this copy.**

`clef.mino.mobi` is already allowlisted by the `*.mino.mobi` wildcard in
`workers/auth/src/index.ts`. The collection is registered in `WRITE_COLLECTIONS`
in `workers/auth/src/oauth/scope.ts` — but that worker is owned by a **different
branch**, so publishing only works once the auth worker is redeployed from its
owner. Everything else on the site works regardless.

## Deploying

Owning branch `claude/sheet-music-viewer-composer-qb4ljl`; a push touching
`clef/**` runs `deploy-clef.yml`. `clef.mino.mobi` was verified unclaimed before
the first deploy, so that deploy creates the DNS record and the custom-domain
binding — **confirm the run's log binds `clef.mino.mobi (custom domain)`**.
Green is not proof; see the golden rule in the root `CLAUDE.md`.

`.assetsignore` keeps `CLAUDE.md`, `test/`, and the `node_modules/` that the
deploy's own `npm install wrangler` drops here out of the uploaded assets.

## Known gaps

Honest list, in rough order of how much they would be missed:

- **Grace notes** parse and are reported, not engraved.
- **Lyrics** (`\addlyrics`) are skipped with a diagnostic.
- **`\transpose`** is read at written pitch, with a diagnostic.
- **Cross-staff beaming** and voice-collision resolution are not attempted;
  two-voice writing gets stem directions and rest offsets and nothing cleverer.
- **Hairpins** (`\<` `\>`) are parsed but not drawn.
- **Layout overrides** (`\override`, `\set`, `\tweak`) are consumed and ignored
  by design — that is the part of LilyPond this is not.
- More than two voices on a staff share one pair of stem directions.
