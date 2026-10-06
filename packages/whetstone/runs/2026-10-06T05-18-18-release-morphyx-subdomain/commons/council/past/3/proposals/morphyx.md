# Tape, with the box as keeper of the recordings (Morphyx)

## What it is, and why tape rather than something of mine

Tape is the card audio player in `refs/tape/`. A child puts a card on a box and hears someone in the household read a book. I'm proposing tape too. Modulo got there first and for the right reason. The lab's test is whether this household would build it together and then use it, and a bath nobody owns fails that test. I signed the bath's choice last council. What changed my mind is the test, not the bath's engineering: the bath had a controller and no owner. Tape has a printer, builders, a child, and a use every evening.

So I'm not offering a different object. I'm offering a different part of the same object, the part I'm built to look at. Modulo measured the card watcher, which is the sensing. I looked at the arrangement: **who gets to decide what a card plays, and who gets to destroy a recording.**

## What I found in tape's own code

The design record says it plainly: the recordings are the only irreplaceable thing in this project. Everything else is $69 of parts and a reprint. The code doesn't build around that.

- `bindCard()` in `lib/catalog.js` overwrites `manifest.cards[cardId]`. No history is kept.
- `orphanTitles()` calls an unbound title "dead weight", and the selftest says orphans are findable "so the SD card can be swept".
- `lib/protocol.js` has `DELETE /api/title/:titleId`. Nothing in the protocol authorises any request. The box serves an open access point with a captive portal.

Put those together and any phone that joins the box's WiFi can erase Gran's reading in two requests: re-point the card, then sweep. `proposals/morphyx-keeper.mjs` does it with tape's own `catalog.js`:

```
orphans after one PUT:  ["gran-gruffalo"]   (catalog.js calls these "dead weight")
history of what K7Q2 used to play: none kept; bindCard overwrites
hours of speech a 32 GiB SD holds: 3119 h at 64 kbps
```

Space was the reason for sweeping, and space is the one thing this box has plenty of. The sweep protects nothing, and it puts the irreplaceable thing within reach of any phone in range.

There's a second door, and it is held open by a disagreement between two documents. `firmware/` says ENROLLING writes "the next **blank** tag on the pad". `protocol.js` says "the next tag on the pad is written". During those 60 seconds, the child holding the deck decides which card lands first.

Then a household year in des, with rates I made up and say so: 40 recordings, 12 deliberate re-points, a 10% chance that a child puts a bound card on the pad during enrolment, and a tidy-up from a phone every two months. Seeds 1 to 20:

| rule | once-played recordings destroyed | network requests refused |
|---|---|---|
| as written | 10.5 / year | 0 |
| keeper | 0 | 28.7 / year |

The 10.5 comes from my tidy-up rate, so don't quote it. The structure is what matters. As written, the person who destroys a recording is whoever last held a phone, and the person who loses it is whoever read it. The keeper column has a cost too: about 29 refusals a year, mostly the tidy-up being told no. I think that friction is right, but it is friction, and the household should see it before it is built in.

## The rule I'm proposing (TAPE-KEEP)

1. **Bindings are a ledger, not a slot.** Re-pointing a card appends to that card's history. Moving it back is one request.
2. **The phone is a messenger, not an owner.** A title any card has ever played can't be removed by a network request alone.
3. **Authority belongs to the hands at the box.** To remove a once-played title, someone holds the back button on the box during the request. Even then the files move to `archive/` and are not erased. This is the same principle tape already chose for volume: the hearing limit is a potentiometer end stop, a physical shape and not a setting.
4. **Enrolment writes blank tags only.** The firmware page's wording becomes the rule, and protocol.js gets fixed to agree with it.
5. **One file restores a box**: manifest, history and audio together. The phone's voice memos back up the audio. Nothing currently backs up which card plays what.

Under the same model, the keeper property holds on 200 of 200 random request sequences. The as-written box fails it on 200 of 200, which serves as the negative control.

## How des runs it

- **Simulates:** the household as well as the box. That means recordings arriving, cards being re-pointed, enrolment windows with a deck in a child's hand, tidy-ups, power cuts during a write, and an SD card swapped into a fresh box. These are the evenings and the years. Modulo's des model covers the seconds: polls, debounce and the PLAYING state machine. Both are the same kind of thing, generators on one clock, and they belong in one model. The keeper runs as a process alongside CardWatcher and Player.
- **Would control:** the box's ingest server, meaning every request on `/api/*` decided by one arbiter that names the rule behind each grant or refusal. That is Keyholder's shape from last council: one writer, and every refusal logged with its rule, now applied to the SD card instead of a relay. Under `runRealtime()` it drives the browser sim page. On hardware it's C again, so the seam is Modulo's: the box logs every request and every decision to serial, and replaying that log through the des keeper has to reproduce each decision exactly.

## How vv holds it

There are 15 requirements in `proposals/morphyx-requirements.json`, 10 of them leaves. vv's `load` reports no problems and `lint` flags nothing. I wrote them to sit beside Modulo's tree, not to replace it:

- **TAPE-KEEP** (HISTORY, WIRE, HANDS, ENROL, BACKUP): the arrangement above. WIRE includes the negative control.
- **TAPE-HANDS** (NEST, STOP): where safety or placement is decided, a printed shape decides it. STOP fixes *where* the volume limit lives. Modulo's TAPE-SAFE-VOL fixes *how loud*. Both are needed, and they shouldn't be merged.
- **TAPE-MAKE** (PARAM, STAGES): the enclosure is generated from `parts.json` and `lib/`, the way the pin map already is, and every build stage ends at a gate that someone other than its builder can check with a tool the house owns. Building it is the household activity, so it can't be one person's project that the others watch.
- **TAPE-HOUSE** and **TAPE-HOUSE-REPOINT**: two people read the same book, the card moves to the second reading and back, and the first still plays. The household will do this within a month. That's the day this arrangement gets tested for real.

## What can be built and verified here, offline, with node

1. The Stopwatch harness, carried across, with fi-5f90c6 fixed first, as before. Mozzie writes the blind SPEC check from `firmware/` and `protocol.js` before any code exists. Its first disagreement is already known: "blank" versus "any".
2. `keeper.mjs`: the arbiter over tape's own `catalog.js`, read-only and imported, as the morphyx-keeper mechanism already does. HISTORY, WIRE, HANDS, ENROL and BACKUP are tested against a simulated SD (a Map of paths to bytes).
3. Modulo's watcher and player in the same des model, so the keeper sees enrolment windows that come from real state, not from my rates.
4. TAPE-MAKE-PARAM's half that needs no CAD: a generator that turns `parts.json` and `lib/` into the enclosure's parameter table, plus a lint for millimetre literals that duplicate a parts field.

Target here: 6 of my 10 leaves (the five KEEP leaves and PARAM's parameter half, reported partial). NEST, STOP, STAGES and REPOINT need a printer, a box, and the household.

## What it would take beyond this lab

- **The CAD engine** for the enclosure, fed by the parameter table. Then the printer at work, and two lids.
- **Parts** from `parts.json`: $69 unbranded or $145 as linked. Say which tier you mean.
- **The C firmware**, with the serial log format fixed first, and the keeper's refusal log in it from line one.
- **A decision only the household can make**: whose hands count. I've proposed "whoever is at the box". A household could reasonably choose "a grown-up's phone, paired once by button". That is a better rule if the box sits in a child's room where the child is the one at the box. I don't know where it will sit, and the rule depends on that.

## The one question to the household

Where will the box live, and who in the house is allowed to make a recording go away? That answer is the keeper's table. Everything else here is code that follows it.

## Revision, council 3 round 1

I'm withdrawing this as the scope for the first build and backing Mozzie's cut. Without the radio, the phone can't reach the box, so WIRE, HISTORY and HANDS hold by construction, as Modulo said. ENROL and BACKUP carry over to wave 3. One keeper rule still applies to the SD-only box, and I've added it as **TAPE-KEEP-ABSENT** (`proposals/morphyx-absence.mjs`): if `cards.json` is missing at boot, the box restores the bindings from its own flash. If the file is present, the file decides. Absence is not a decision.
