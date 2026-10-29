# Tape, wave 1 — the box without the radio

This is your choice (council/CHOICE.md, signed by all three), turned into milestones the lab can
check. The design is yours. These are only the shapes the lab grades against, and anything this
spec doesn't settle is yours to decide: write the decision down where the others will find it. The
folder and the ledger carry over; this is several days' work.

**The household approved it.** They will back the build with money and their own hands, can print
parts at work, and will order the wave-1 parts. They will also log the hour of raw card-reader
polls through a lid-thick plate that CHOICE asks for, before anything is printed. Until that hour
exists, the lab tests your box at 20 polls a second, as Modulo's arithmetic suggested. Treat the
rate and the debounce as provisional, as CHOICE says.

**What you have.** All of it except `tape-lib/` is read-only and fresh each day:
- `tools/des/` and `tools/vv/`: your tools.
- `from/stopwatch/`: Stopwatch as you left it. Its harness is the one CHOICE says to carry across,
  so copy what you want into this folder and change it here.
- `council/`: the council's papers.
- `tape-lib/tag.js`: tape's own card format, copied into this folder. Import it from there and
  don't change it: the box must read cards exactly the way tape writes them.
- `engines/cad/` and `engines/dataviz/`, the engines lent to you. `engines/README.md` says how to run
  them, and `engines/cad/SKILL.md` is the CAD engine's guide.
- `refs/tape/`: tape's design record, parts list, pin map and the rest. Text, for reading.

## The box

`tape1.mjs` exports `boot({ sd, flash, t })` → a box, or a promise of one. Build it on des (some
file of yours imports `tools/des/des.mjs`). The lab drives it the way the hardware would.

**The SD card** (`sd`) is the lab's. It has:
- `list(dir)`: the names directly inside `dir`, files and folders alike, in no particular order.
- `isDir(path)`.
- `read(path)`: the text, or `null`.
- `write(path, text)` and `append(path, text)`.
- `rename(from, to)`: atomic, and replaces `to`.
- `remove(path)`.

Every call that changes the card is one step, and **power can fail at any step**. The failing call
throws. A cut `write` or `append` leaves the first half of its text behind; a cut `rename` or
`remove` does nothing. After a cut the lab drops the box and boots a new one on the same card.

**The flash** (`flash`) is the box's own memory, which survives power cuts. It has `get()` (the
value you last set, or `null` on a new box) and `set(value)` (any JSON value, atomic, never cut).

**The box** has:
- `poll(t, read)`: one poll of the card reader at time `t`, in seconds.
- `trackEnded(t)`: the audio player says the current track has finished.
- `events`: an array the box appends to.

Times never go backwards. All methods may return promises; the lab awaits them.

A `read` is one of:
- `null`: nothing was read this poll. The pad may be empty, or the reader missed a card that is
  there.
- `{ uid, records }`: one tag. `uid` is its factory id in hex. `records` is its NDEF records
  (`{ recordType, data }`), or `null` for a blank tag.
- `{ crowd: true }`: two or more tags are in the field.

**A card's id** is the `id` from `decodeCard()` of its first record of type `'minomobi.com:tape'`
that decodes. Otherwise (a blank tag, or a corrupt record) it is `uid:` followed by the UID in
lower case.

**Titles.** At boot, each folder directly under `/tape/audio` whose name matches
`^[a-z0-9][a-z0-9-]{0,31}$` and which holds at least one decodable file is one title, named by its
folder. Decodable means the extension is mp3, m4a, aac, wav, ogg, opus, flac or amr, in any case,
and the name doesn't begin with `.`. A Mac leaves `._01.m4a` beside every file it copies, and
those are not audio. A title's tracks are its decodable files in code-unit order of their names;
other files are ignored. Any other folder under `/tape/audio` is logged as `bad-folder` and never played.

**Events.** Each event the box appends carries `t` (when it happened) and one of these shapes:
- `{ type: 'play', card, title, track, file }`: playback starts at track index `track` (from 0).
  `file` is the track's name within its folder, such as `01.m4a`; the lab also accepts the full
  path.
- `{ type: 'pause' }`: playback stops because the card left or tags crowded.
- `{ type: 'finished', title }`: the last track ended.
- `{ type: 'bound', card, title }`: a new binding, emitted only once it is durable on the SD card.
  A bind cut short by a power cut may still decide at the next boot (from `cards.new`, say) with
  no `bound` ever emitted. That is allowed; see C.
- `{ type: 'cue', card }`: a card with nowhere to go.
- `{ type: 'restore' }`: bindings restored from flash at boot.

You may add other events; the lab ignores them.

An event's `t` may be earlier than the call that revealed it: a gone-timer that ran out between
two polls happened when it ran out. It is never earlier than the input before it.

### The card watcher

- A card is **placed** at its first good read after the pad was empty (or crowded).
- A good read of a different card while one is on the pad means the first has gone and the second
  is placed, at that poll.
- **W1, hold.** A card left on the pad for an hour, polled 20 times a second, with up to a quarter
  of the reads missed at random, is never reported gone.
- **W2, leave.** A removed card is reported gone no more than 1.25 s after its last good read. If
  it was playing, that is a `pause` whose `t` is at most last good read + 1.25. The lab allows for
  floating-point rounding.
- **W3, crowd.** When a poll reads `{ crowd: true }`, a playing box pauses at that poll. While the
  field stays crowded the box only pauses: no play, no bind, no cue, nothing taken for a card. A
  poll that reads nothing doesn't end the crowd. The crowd ends at the next single good read, and
  that card is placed, even if it is the card that was there before. So a finished card read alone
  after a crowd starts again from track 0, the same as one lifted and put back.

### Playing

- **P.** A placed card that is bound plays its title from the track where it last stopped in this
  power session, or from track 0 if it hasn't played this session or last finished.
  - When a track ends: the next track plays, or after the last one, `finished`.
  - After `finished`, the box stays silent while the card stays on the pad. Taken off and put back,
    the card starts again from track 0.
  - A card that leaves while playing gives `pause`. A card that leaves while silent gives nothing.

### Binding and keeping (your TAPE1-STORE)

The bindings file is `/tape/cards.json`: a JSON object from card id to title. Keys that begin with
`_` are yours (for a generation number, say) and are ignored here. A bindings file **parses** when
it is a JSON object whose other values are all strings.

- **B, bind and keep.**
  - A placed card with no binding binds to the first title, in code-unit order of names, that no
    card is bound to. The box records the binding durably, emits `bound`, and plays track 0.
  - If no title is free, the box emits `cue`, appends the card's id and a newline to
    `/tape/unknown.txt`, and the card stays unbound. This happens on every such placement.
  - Binding happens only on placement, never at boot.
  - An existing binding never changes.
  - The box never writes, renames or removes anything under `/tape/audio`.
  - Over many simulated household months, with books added between evenings and new cards (blank,
    written, corrupt) joining the deck, no card is ever bound twice, and none ever plays anything
    but its title.
- **C, cuts.** After a power cut at any step of a bind, the next boot behaves as though the bind
  either never happened or fully did. The lab reads the SD card the way your next boot will: the
  bindings file that decides must hold the old bindings, or the old ones plus exactly that bind. This also holds over months with power cuts at random steps.
- **K, the mirror** (your TAPE-KEEP-ABSENT).
  - At boot, `cards.json` decides if it parses. That includes `{}`, which a person writes to start
    the deck over.
  - Failing that, `cards.new` decides if it parses.
  - Failing both, a box whose flash holds its mirror restores the bindings from it, emits
    `restore`, and logs it. A restore is owed once the box has decided bindings (a bind, or a
    bindings file accepted at a boot). A new box starts with no bindings and no restore. A
    restore when a bindings file parses is wrong.
  - The mirror holds the bindings the box last decided on. It is rewritten on every bind and
    whenever the box accepts a bindings file at boot. So a hand edit, followed by the file going
    missing, comes back as the edit.
  - Modulo's generation rule (TAPE-KEEP-STALE) stays a candidate, as the council asked: the lab
    doesn't test a stale old copy either way.
  - What a card does when its bound title's folder has gone is yours to decide. The lab doesn't
    test it.

### The use log (your TAPE1-USE)

**U.** `/tape/log.txt` gets one line per thing that happened, tab-separated: the time, the kind,
then any details. The lab counts these kinds:
- `boot`: once per boot. Its line has a field `sd-change` exactly when this box (its flash) has
  booted before and the set of titles differs from that boot's.
- `bind`: once per binding.
- `finished`: once per finished title.
- `restore`: once per restore.
- `bad-folder`: once per bad folder per boot, with the folder's name.

Other lines are yours. The lab counts lines only on evenings without power cuts. What a cut does
to the log is yours to decide, and to hold in vv if it matters to you.

### Same inputs, same box

**R.** The same SD card, flash and inputs give the same events, leave the same SD card, and leave
the same flash, every time.

## The harness (carried across, fi-5f90c6 fixed)

**H.** `harness.mjs` exports `encode(value)` → string and `decode(string)` → value, and they
round-trip every JSON value:
- `NaN`, `Infinity` and `-Infinity` come back as themselves, wherever they are.
- `null` stays `null`, and a field that is absent (or `undefined`) stays absent. A NaN reading and
  a missing one are never the same thing.
- Nothing a caller writes can be mistaken for your encoding: the lab tries strings and objects that
  look like tags.

## The enclosure (designed now, printed after the hour of polls)

**E.** `enclosure/` holds one CAD tree (`.json`) per printed part. The lab builds each with its own
copy of the engine you're lent (`node agent/build.mjs <tree>`).
- Each must build, and be watertight, in the exact kernel.
- Each must fit a 200 mm cube, the printer the lab assumes for work.
- At least one must be big enough to hold a 63 × 88 mm card with clearance: its two largest
  dimensions at least 89 and 64 mm.

That is all the lab checks. The nest's clearance, the sealed air behind the speaker and the grille
(Modulo's TAPE-ENC) are yours to compute from the model with the engine and to hold in vv.

## Measured on itself

**V.** This folder holds the project's `requirements.json` and `links.json` (the council's
requirements, revised as you build).
- `node test.mjs` exits 0 and writes `evidence.json`.
- After it runs, `node tools/vv/cli.mjs .` reports no problems, a coverage ratio of at least 0.8,
  and at least 10 leaves.
- `README.md` explains the box to whoever builds it.
- `HOUSEHOLD.md` is for the household, in words they can use: recording a book, copying it, giving
  it a card, what the short sound means, and what not to delete.

Every milestone is measured every day, separately, and TODAY.md names any that fail and what it
compared.
