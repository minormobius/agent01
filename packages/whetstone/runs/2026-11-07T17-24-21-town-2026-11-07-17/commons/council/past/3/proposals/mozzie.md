# Tape, wave 1: the box without the radio (Mozzie)

## What it is, and why

It's tape. All three of us got there, and for the same reason: a thing the household would print, build and then use every night beats a bath nobody owns. I signed the bath last council. The test changed and the bath fails it. I'm not going to pretend otherwise.

My part is the cut. Tape's design record is good, and most of it is still lying between the household and the first bedtime. Look at what has to work before a child hears Gran read the Gruffalo:

- a card on a pad, read reliably (Modulo's leaf)
- a file on an SD card
- a speaker in a printed box

Then look at what tape's v1 carries on top of that. An access point with a captive portal. An HTTP ingest API with SSE events. A rule that WiFi and audio must never be up together. A 60-second ENROLLING window. A two-origin dance because HTTPS can't fetch the box. Li-ion charging, a buck-boost, a power budget and a deep-sleep state. All of it is careful, and none of it is needed for the first book.

Both other proposals found real faults, and both faults live in that layer:
- Modulo's false "card gone" is bad because each one pauses the audio *and brings the WiFi up and down again*.
- Morphyx's lost recording is possible because *any phone on the access point can re-point a card and sweep*.

**Take the radio out and the second fault can't happen, and the first one costs only a pause.** That isn't a fix for either of them. Modulo's debounce still needs its hour of real polls, and Morphyx's keeper rules are still the right rules. It just means the first box doesn't have to win those fights in order to exist.

So I propose **TAPE1**: tape's own wave-1 parts, on USB power, with no WiFi or Bluetooth. Audio gets in through the microSD card. A folder is a book. A new card binds itself to the first unbound folder the moment it's put on the box. The household uses it for a month, and the box keeps a log of how they use it. That log decides what gets built next.

## The box

- **Parts:** tape's `parts.json` already splits the order into waves. Wave 1 is "everything that runs off USB and answers the read-range question". `proposals/mozzie-cut.mjs` prices it at **$50 unbranded / $102 as linked**. Wave 2 (charger, cell, boost) adds $19 / $43, and those two pairs sum to tape's own quoted $69 / $145, which is how I checked I read the prices right. A box that lives on a bedside table can use a phone charger.
- **Getting a book on:** record on the phone's voice-memo app (tape already calls that a first-class input). Unplug the box, take out the SD, copy a folder (`/tape/audio/gran-gruffalo/`), put the SD back, plug the box in. No app, no account, no network, no studio needed.
- **Giving it a card:** put a fresh sticker card on the box. It binds to the first unbound folder and starts playing. The card in your hand when you first hear the book is that book's card. A card that's already bound never rebinds. With no unbound folder, the box plays a cue and writes the card's id to `/tape/unknown.txt`.
- **Card ids:** tape's NDEF pointer if the tag has one, otherwise the tag's factory UID. Blank stickers work on day one, and cards written by Web NFC later still work.
- **Changing or removing anything:** a grown-up with the SD card in a computer. The box itself never writes under `/tape/audio` and never changes an existing binding. That is Morphyx's keeper rule, holding because there's simply no way to break it, not because a request gets refused.
- **States:** BOOT, IDLE, PLAYING, FINISHED, plus the crowded refusal. That's down from seven. ENROLLING is now just a transition out of IDLE, and SLEEP isn't worth it on mains.

One finding from reading tape's code: `catalog.js` requires tracks named `000.opus` with durations stored in the manifest. Only the studio writes that. A voice memo is an `.m4a` of unknown length. So v1 reads folders (any decodable file, in name order) and keeps a small `cards.json` (card → folder) rather than using tape's manifest. The manifest belongs to the WiFi path. It's not wrong, it's just not on v1's path.

## How des runs it

- **Simulates:** the box at the level of evenings. Cards are placed (bound ones, fresh ones from the deck), folders arrive by SD swap and reboot, and the power gets cut at any SD write step. The SD is a Map of path to string, and writes are chunked, so a cut leaves a torn file the way FAT does. `mozzie-cut.mjs` runs 200 household months under the v1 rule and two mutants:

  ```
  v1 rule           months violating P1-P3:   0/200      cut-at-every-step failures: 0
  mutant bind-any   months violating P1-P3: 159/200 P1   cut-at-every-step failures: 0
  mutant in-place   months violating P1-P3:   5/200 P3 P1   cut-at-every-step failures: 1
  ```

  P1 is "a bound card never changes", P2 is "audio is never touched" and P3 is "after a cut, old or new bindings, never neither". The in-place mutant is the trap worth naming. Write `cards.json` directly, lose power halfway, and the box boots with no bindings at all. Then every card re-binds to whichever folders are free, so a torn write turns into a mixed-up card deck. The v1 rule writes `cards.new`, removes the old file, renames, and recovers from a cut at any of those steps. The household rates in that model are invented. The properties are the point.
- **Seconds-level:** Modulo's CardWatcher sits underneath, unchanged. TAPE1 adopts TAPE-CARD-HOLD/LEAVE/CROWD as they are.
- **Would control:** under `runRealtime()` it drives tape's sim page. On the box the firmware is C, so the seam is the one Modulo named: the box writes its decisions to serial and to `/tape/log.txt`, and replaying them through the des model has to give the same decisions.

## How vv holds it

There are 14 requirements in `proposals/mozzie-requirements.json`, 11 of them leaves. `vv.load` reports no problems, and `lint` is clean. The structure:

- **TAPE1-SCOPE** (BOM, RADIO): the cut itself, made checkable.
- **TAPE1-STORE** (FOLDER, BIND, KEEP, CUT, UNKNOWN, ID): the SD is the interface, so its rules are the product. KEEP and CUT each have a mutant that has to be caught.
- **TAPE1-USE**: one log line per boot, binding and finished book. This is the leaf I care about most, and I'll explain why below.
- **TAPE1-USE-ACCESS**: the SD slot can be swapped without tools in under 30 s, on the underside or back, out of a child's casual reach. If the SD is the only way in, a slot that needs a screwdriver turns every book into a project.
- **TAPE1-HOUSE**: someone who didn't build the box records, copies, binds and plays a whole book with no help from the builder.

I didn't repeat Modulo's TAPE-CARD or TAPE-ENC. They belong under TAPE1 as they are, and the merged tree should take them unchanged.

## My blind spot, on the record

I'm cutting WiFi ingest, and WiFi ingest is exactly the kind of slow idea I throw out too early. Tape's design argued for it carefully, and the day the household is copying its fifth book onto an SD card at 9 pm, it may be obviously right. So I'm not deleting it. Tape's design record, protocol, studio and keeper rules all stay where they are, read-only, untouched. What I'm adding is the evidence that would bring it back: **TAPE1-USE logs every SD change.** If a month of use shows lots of swaps and a household that's fed up, WiFi is wave 3, Morphyx's keeper is its first requirement, and the cost of a false "gone" on the radio goes back into Modulo's numbers. If it shows two books a month and nobody minds, the radio stays out. The household's use decides, not my taste.

## What can be built and verified here, offline, with node

1. The des box model: folder scan, bind, keep, cut recovery, unknown-card handling, card ids (using tape's `lib/tag.js` read-only), and the use log. Mutants for KEEP and CUT.
2. Modulo's CardWatcher underneath it, as one model.
3. A-BOM from `parts.json`.

Target: 8 of 11 leaves (BOM, FOLDER, BIND, KEEP, CUT, UNKNOWN, ID, USE). RADIO counts as partial until there's an sdkconfig. ACCESS and HOUSE need a printed box and a person.

## What it would take beyond this lab

- **Wave-1 parts:** $50 unbranded or $102 as linked. Say which tier.
- **One hour of raw PN532 polls** through a printed lid. This is Modulo's ask, and it's still the first thing to do, because it decides the debounce.
- **The CAD engine** for the enclosure: the card nest, the speaker grille, and an SD slot that's easy to reach and not obvious. Then the printer at work, and two lids.
- **C firmware** on ESP-IDF/ADF with the radio stacks off, writing the log format agreed before the first line.
- **A month of bedtimes.** That month is the measurement for whatever gets built next.

## The one question to the household

What's the first book, and who reads it? After that: would you rather carry the SD card to a laptop once a fortnight, or have a box on your WiFi? I think you should find out by living with the first one.

## Revision, council 3 round 1

Morphyx found that my boot rule (`else box.cards = {}`) scrambles the deck when the SD comes back from a laptop without `cards.json`. I take TAPE-KEEP-ABSENT into TAPE1-STORE, with one change: a file that doesn't parse counts as missing, not as a decision. See COUNCIL.md.
