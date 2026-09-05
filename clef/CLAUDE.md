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
src/mutopia.js      browsing the Mutopia archive (fetch + parse, no HTML injected)
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

`test/notation.selftest.mjs` has 785 checks. Almost every bug this code has had
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
- **An ornament shrinks; a pitch does not.** Grace notes are drawn at 0.62 size
  via a separate `gs` factor. Shadowing `sp` with a smaller staff space instead
  squashes every ornament toward the middle line, because vertical position is a
  pitch.

## The grand staff

A one-staff score is drawn on a grand staff by default, with an empty partner
below it, braced. This is a **presentation** choice and not a reading of the
source: the phantom staff holds no music, reaches neither playback nor export,
and inherits only the key and metre so its signature matches.

Piano paper has two staves whether or not the left hand is playing, and a melody
floating alone above white space reads as a fragment rather than as a piece.
A single-line instrument genuinely wants one staff — which is why it is a switch
(`grandStaff` in the engrave options, a checkbox above the score) and not a law.
It is wrong for a flute part from the archive, and one click turns it off.

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

## The Mutopia explorer

**Browse** opens the [Mutopia Project](https://www.mutopiaproject.org/): ~2,300
scores kept as LilyPond **source**, so a piece opens here as editable, playable,
exportable music rather than as a PDF of a picture of music. It is the one
archive this site can do more than link to.

Say the obvious thing plainly, because the question comes up: **LilyPond is a
program, not a network.** No API, no accounts, no records. What exists is the
corpus written in its language.

Mutopia sends no CORS header, so the browser cannot read it directly. `worker.js`
carries a read proxy at `/mutopia/*`, locked to that one origin, GET only, and
to two path shapes — the FTP tree and the per-composer catalogue. Responses are
capped at 4 MB and cached an hour at the edge, so browsing costs the archive one
request per composer per hour rather than one per visitor. **It is not a general
proxy and must not become one.**

`mutopia.js` parses an Apache directory index and a generated HTML table.
Neither is an API and both can change under us, so every field is optional and a
parse failure degrades to "we could not read this". **Nothing fetched is ever
inserted as HTML** — text is read out of a detached document and our own
elements are built from it.

Two honesty rules the code keeps, both easy to get wrong:

- **The licence shown is the one the archive gave for that piece.** Much of
  Mutopia is public domain and a good deal is Creative Commons; printing "public
  domain" over a CC BY-SA edition is a false statement about someone else's
  terms.
- **A score that `\include`s sibling part files is flagged.** We fetch one file,
  so the music in the others is simply absent, and absent music nobody mentions
  is the worst outcome on this site. `missingIncludes()` finds them and the page
  says so.

## Reading files written by other people

The bundled pieces were written to suit the reader. The archive was not, and
everything below is a shape that came out of a real Mutopia file and broke the
parse for the whole rest of it — each one **silently**, surfacing hundreds of
bars later as nonsense rather than as an error where the problem was. All are
pinned in the selftest.

- **Note-name alphabets.** A large part of the corpus opens
  `\include "english.ly"` and writes `bf` for B flat. Read as Dutch, `bf` scans
  as a B followed by an F: one note becomes two and every bar after it is wrong.
  Dutch, English and German are implemented; anything else is **refused with an
  error** rather than guessed at.
- **`\override` mid-bar.** It used to be consumed "to the end of the line",
  which in `<< { b8( } { s16 \once \override Script #'padding = #2.5 s16 } >>`
  eats the closing `}` and `>>`. Now exactly one statement is consumed.
- **`#'(…)`.** The quote comes before the paren, so a quoted Scheme list has to
  be stepped over as a list, not read as a bare token.
- **`\f-.`** is a forte and a staccato. A command name may contain a hyphen but
  never end in one, or the articulation vanishes into a command called `f-`.
- **`\transpose c c''`.** Common, and ignoring it draws the piece two octaves
  low on a hedge of ledger lines. Implemented for pitches (keeping spelling: F
  sharp up a second is G sharp, never A flat) and for key signatures. It applies
  **after** relative resolution — and the reference for the next note is the
  resolved, **untransposed** pitch, or the interval compounds on every note.
- **`\book { \score {…} \score {…} }`** is a multi-movement file.
- **Page-break hints and direction switches** (`\noPageBreak`, `\slurDown`,
  `\tupletUp`, `\autoBeamOff`, `\crescHairpin`) are valid input with nothing to
  act on here. They are matched by SHAPE rather than by list, because the family
  is open. Reporting each one buries the diagnostics that matter — and the
  unconsumed command derails the bar it sits in.
- **Fingerings** (`c-1`, `f'_5`) are read and drawn. Unread, the digit falls out
  of the note and is scanned as stray input, which wrecks the rest of the bar.

Measured on the three files this was built against — a Bach Polonaise, a CPE
Bach flute sonata, a Chopin étude — diagnostics went 19/60/60 to 0/0/4 and the
sonata's bar count from 352 to its real 160.

What still does not survive: a complex multi-movement score can parse cleanly
and still fail its own bar checks in places (the flute sonata does, in about
half its bars — nested spacer voices and tuplet spanners). That is reported in
the panel rather than hidden, which is the point: an engraving that quietly
disagrees with its source is worse than one that says so.

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

- **Lyrics** (`\addlyrics`) are skipped with a diagnostic.
- **Note-name alphabets** beyond Dutch, English and German are refused.
- **Cross-staff beaming** and voice-collision resolution are not attempted;
  two-voice writing gets stem directions and rest offsets and nothing cleverer.
- **Hairpins** (`\<` `\>`) are parsed but not drawn.
- **Layout overrides** (`\override`, `\set`, `\tweak`) are consumed and ignored
  by design — that is the part of LilyPond this is not.
- More than two voices on a staff share one pair of stem directions.
