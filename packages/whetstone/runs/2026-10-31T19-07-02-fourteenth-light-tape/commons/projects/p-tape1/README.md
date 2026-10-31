# tape, wave 1: the box without the radio

A box with a card reader, an SD card of audiobooks and a speaker. Put a card on the lid and it plays
that card's book. Lift it off and it pauses. Put it back and it carries on. A new card takes the
next book nobody has a card for yet.

(The council's papers, `council/`, `refs/tape/`, `engines/` and `tools/vv/`, were not in the folder
on day 1. This README is written from SPEC.md and has to be checked against CHOICE.md when they
appear.)

## Files

| file | what |
|---|---|
| `tape1.mjs` | the box: `boot({ sd, flash, t })` → `{ poll, trackEnded, events }`. Built on `tools/des` |
| `tape-lib/tag.js` | tape's card format. Not ours, never edited |
| `harness.mjs` | `encode`/`decode` (JSON plus NaN, ±Infinity, -0, undefined) and Stopwatch's `record`/`replay` (in `harness-rr.mjs`) |
| `fakesd.mjs` | the SD card and flash as the spec describes them, with power cuts at any chosen step. For tests |
| `fresh.mjs` | stamps evidence with the hashes of the files it was about (from Stopwatch) |
| `HOUSEHOLD.md` | for the household: recording, copying, cards, the short sound, what not to delete, the hour of polls |
| `shelf/bursts.mjs` | reads the household's hour of polls and says which GONE_S (if any ≤ 1.25 s) holds a still card |
| `test.mjs` | `node test.mjs`: every test names its SPEC clause, writes `evidence.json` |
| `mutants.json` | `node shelf/mutate.mjs tape1.mjs test.mjs mutants.json --with harness.mjs,harness-rr.mjs,fakesd.mjs,fresh.mjs,links.json,package.json --tree tools/des,tape-lib` |

## What is on the SD card

```
/tape/audio/<title>/<tracks>   books: one folder each, lower-case a-z 0-9 and -, up to 32 chars
/tape/cards.json               which card plays which book: { "<card id>": "<title>", "_gen": n }
/tape/cards.new                exists only for an instant during a bind (or after a cut one)
/tape/cards.bad                a cards.json that stopped parsing, kept rather than overwritten
/tape/unknown.txt              ids of cards placed when every book already had a card
/tape/log.txt                  the use log: time <TAB> kind <TAB> details
```

The box never writes under `/tape/audio`.

## Box decisions

- **Gone after 1.0 s without a good read** (`GONE_S`). Twenty straight misses at 20 polls/s. If
  a quarter of reads are missed independently, the chance per poll is 0.25^20 ≈ 9e-13, about 7e-8
  per hour. A pause comes at most 1.0 s after the last read, which leaves 0.25 s of the 1.25 s
  allowed. **Provisional.** Misses through a real lid are probably *not* independent: a card
  resting at the edge of the field misses in runs. The household's hour of raw polls decides it.
  The number to pull from it is the longest run of misses while a card sat still. GONE_S must
  sit above that, and below 1.25 s.
- A read that arrives exactly at the deadline is too late. des runs the gone-timer at t ≤ the
  poll's time before the poll itself.
- "Another card" means another card *id*. Two tags written with the same id are one card.
- **A bind** writes the whole new file to `cards.new` and renames it over `cards.json`. Only then
  does it update the flash mirror and say `bound`. A cut write leaves half a file, which never
  parses because there is no trailing whitespace and the closing `}` is the last byte. A cut rename
  does nothing.
- **At boot:** `cards.json` decides if it parses. Any `cards.new` beside it is left from a cut
  rename and is removed. Otherwise `cards.new` decides and is renamed into place. Otherwise the
  mirror in flash restores, and `cards.json` is rewritten from it. A `cards.json` that exists but
  doesn't parse is first renamed to `cards.bad`, so a person's mistyped edit isn't lost. That happens
  **even when nothing else decides** (a new box, no mirror). Otherwise the first bind's rename would
  overwrite it. A later mangle goes to `cards.bad.2`, `.3`, …, never over an earlier one, because
  `rename` replaces its target. (Morphyx, day 2: both were holes. Tests k-2 and c-2 hold them.)
- **Every boot repair is cut-safe.** c-2 cuts power at every SD step of boot and one bind, on all
  eight starting states (fresh, json, stray cards.new, cards.new only, mangled + new, mangled with no
  mirror, mirror, mirror + mangled). Then it boots twice clean. Bindings are old or old + bind, the
  second clean boot agrees, and no restore is owed. The mirror repair could write `cards.json`
  directly, because a torn one just restores again. We keep `cards.new` + rename for uniformity, and
  the mutant that drops it is equivalent, so it isn't in mutants.json.
- **A card whose book folder has gone** gives the `cue` sound and a `missing-title` log line. It
  keeps its binding: put the folder back and the card plays it again. It is not added to
  `unknown.txt`, because the card is known.
- **A torn read of the card on the pad is a miss** (D-tornread, Modulo day 3). By SPEC, a read whose
  tape record doesn't decode is the card `uid:<uid>`. Taken literally, one torn read of a written card
  mid-sitting means "another card": a pause, a play, and that phantom bound **for good** to a free book.
  Measured on this box: one torn read in 10,000 ate a book in a half-hour evening. So while a card is
  on the pad, a `uid:` read with the same factory uid as that card's last good read counts as nothing
  (it doesn't hold the card either). A different uid still swaps at that poll. The box has no writer,
  so a tag can't really change its record without leaving the field. What's left is a torn *placing*
  read, which still binds `uid:<uid>` as SPEC says. That's roughly one torn read per placement,
  against thousands per sitting. The hour of polls (`ok`/`torn` third field) gives its rate.
- **A torn read of a card the box has seen good before is a miss, wherever the pad stands**
  (D-known, Morphyx day 4). D-tornread only covers the card already on the pad. Every placement
  (after a lift, after a crowd, after a reboot) was still a chance to tear, and each torn placement
  either bound a phantom book or started the phantom's book for a blink. `shelf/phantoms.mjs`, at 1%
  torn over 120 evenings of 12 cards: 8 phantom books and 10 wrong starts without the rule, 0 with it.
  The box keeps the uids it has decoded a tape record from in flash (no SD step, so no cut point).
  A remembered uid whose read carries a `minomobi.com:tape` record that doesn't decode counts as
  nothing: no place, no swap, no hold. The rule is narrow, and SPEC's id still stands for a blank
  read and for a read with no tape record (a card wiped or rewritten by a phone is a new card), and
  for any uid never seen good (the lab's corrupt cards). Left open: the very first read of a brand
  new card can tear. Then `uid:<x>` takes the first free book, as SPEC says. HOUSEHOLD.md says how
  to spot that and free the book. b-1 holds this. w2-4 now feeds D-tornread the other torn shape, a
  read cut before the tape record, which only that rule catches.
- **Log** lines are buffered and written with one append per input. Before a power session's first
  append to `log.txt` or `unknown.txt`, a line torn by an earlier cut is ended, so it can't swallow
  the next line.
- **Crowds** clear the card from the pad, so once the field clears, whichever card reads alone is
  placed fresh. That is why there is no separate "crowd" check on the placement path.
- Same SD card, flash and inputs give the same result. `list()` order is never trusted, names are
  sorted, and nothing reads a clock or `Math.random`.

## Not built yet

`enclosure/` (E: needs the CAD engine, which isn't in the folder; no tree format has been guessed), and vv itself (`tools/vv/` absent; requirements.json/links.json keep the shape Stopwatch used).
