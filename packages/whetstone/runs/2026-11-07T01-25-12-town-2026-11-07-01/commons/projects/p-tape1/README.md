# tape1: the box without the radio (wave 1)

This is tape's wave-1 box on USB power, with no WiFi or Bluetooth. Books arrive on the microSD
card. A child puts a card on the lid, and the box plays the book that card belongs to.
CHOICE.md in council/ says why; SPEC.md is what the lab checks; STATE-TABLE.md is the state table.

## Files

- `tape1.mjs`: the box. `boot({ sd, flash, t })` returns `{ poll(t, read), trackEnded(t), events }`.
  The card watcher's gone-timer runs on a des clock (`tools/des/des.mjs`). Card ids come from
  tape's own `tape-lib/tag.js`, unchanged.
- `harness.mjs`: Stopwatch's record/replay harness, carried across with fi-5f90c6 fixed.
  `encode`/`decode` keep NaN, ±Infinity, -0, null and absent apart.
- `fake-sd.mjs`: a test SD card whose writes can tear when the power goes, and a test flash.
- `test.mjs`: every check. It writes `evidence.json`. `requirements.json` and `links.json` are the
  vv tree, so run `node tools/vv/cli.mjs .` afterwards.
- `shelf/tape1-mutants.json`: 23 faults the tests must catch (`node shelf/mutants.mjs . shelf/tape1-mutants.json`).

## How the box keeps its bindings

| file on the SD card | who writes it | what it means |
|---|---|---|
| `/tape/audio/<book>/` | the household's laptop | one book; the folder name is the title (`a-z 0-9 -`, max 32) |
| `/tape/cards.json` | the box (and a person, by hand) | card id → book. If it parses, it decides. `{}` starts the deck over |
| `/tape/cards.new` | the box, for a moment | a bind in progress; renamed onto cards.json when it is durable |
| `/tape/unknown.txt` | the box | cards placed when no book was free |
| `/tape/log.txt` | the box | one line per boot, bind, finished book, restore, bad folder |

A bind writes `cards.new` and then renames it onto `cards.json`. The rename is the moment the
bind happens. Power lost before it means the bind never happened; power lost after it means it
fully did. At boot, a `cards.new` left over from a cut is removed when `cards.json` decides, so an
undone bind can't come back later if the laptop mangles `cards.json`. The box also keeps a copy
(the mirror) in its own flash. If neither file parses, it restores from the mirror, logs
`restore` and writes `cards.json` back.

## Provisional numbers

The card counts as gone 1.0 s after its last good read (`GONE_AFTER`), polled at 20 Hz. Both
numbers wait for the household's hour of raw PN532 polls through a lid-thick plate, which comes
before the enclosure is printed. If the hour shows bursts of missed reads, change the number
there and rerun the tests. T-W1-HOLD and T-W2-LEAVE are the two it has to satisfy.

## Decisions SPEC left open

- A card bound to a book whose folder has gone gives `cue` with `reason: 'missing'` and a
  `missing` log line, and stays silent. Nothing goes in `unknown.txt`, and the binding is kept,
  so the book plays again if its folder comes back.
- Positions are kept per card, for this power session only, at track granularity.
- The log is appended to directly. A cut can leave half a line; the next boot sees it and starts
  its `boot` line on a new line, so the torn line never swallows a counted one. Held in vv as
  TAPE1-USE-TORN (T-U-TORN cuts power on a real log append).

## The enclosure (designed, not yet printed)

Five printed parts, written by `enclosure/gen.mjs` from one table of numbers (`P`). Don't
hand-edit the `.json` trees. Change `P`, run `node enclosure/gen.mjs`, then `node test.mjs`
(T-E-GEN fails on a stale tree).

| part | size (mm) | what it is |
|---|---|---|
| `body` | 190 × 130 × 75 | open tray, 2.5 mm walls, four 8 mm corner posts with Ø2.5 pilots for the lid screws, a 13 × 7 USB-C slot in the left wall |
| `lid` | 190 × 130 × 4 | the card nest (a 90 × 65 pocket, 2 mm of plastic left over the antenna), 151 grille holes, two Ø30 arcade-button holes, a Ø7 pot hole, four Ø3.4 screw holes |
| `collar` | 78 × 84 × 6 | ring glued under the lid round the grille: the front chamber |
| `baffle` | 78 × 84 × 3 | plate under the collar with a Ø36 hole. The driver sits face-up on it, sealed with silicone round its frame |
| `pod` | 78 × 84 × 55 | open cup glued under the baffle: the sealed back chamber |

Seen from above: the nest is on the left, the speaker on the right, the buttons bottom-left and
the pot bottom-right. The pod hangs *beside* the nest, so the driver's magnet is never over the
PN532 antenna.

`node enclosure/measure.mjs` builds each part in the exact kernel and reads TAPE-ENC's numbers
off the built faces:

- **Nest:** 1.0 mm per side round an 88 × 63 card.
- **Back air:** 302.8 cm³ in the pod, minus 33.0 cm³ for a Ø41 × 25 cylinder the driver fits
  inside, gives 269.8 cm³ (needs ≥ 200).
- **Grille:** 151 holes of Ø3.5, 1452.8 mm² open (needs ≥ 1257).

Every grille hole lies inside the collar. This matters because the grille is wider than the
driver: a hole outside the collar would let the back of the cone talk to the room, which is the
leak the seal exists to stop. `enclosure/ref/stack.json` stacks the parts. On it,
`node engines/cad/agent/check.mjs enclosure/ref/stack.json --clearance 1` gives a nearest
approach of 3.0 mm.

**Provisional:** the 2 mm under the nest (`nestFloor`) waits for the hour of polls, like the
debounce. If 2 mm reads under 99%, thin it there and rerun. **Not modelled:** the PN532 board's
outline and mounting (measure your board, and put its antenna loop under the nest's centre at
(−42, 12)), the DevKit's standoffs, the bodies of the buttons and pot below the lid, and
fastenings beyond silicone and four lid screws.
