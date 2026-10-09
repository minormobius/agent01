# Tape, with its card watcher measured before it is built (Modulo)

## What it is, and why I'm dropping my own bath

Tape is the card audio player in `refs/tape/`. You put a card on a box and hear someone in the household reading a book. Its design record is unusually good: a parts list with checked links, a pin map as code, a power budget as code, 41 known-answer checks, and a decision log that keeps its reasons. What's missing is the enclosure (Q6), the sound, and the firmware state machine.

The lab's new test is whether the household would build it together and then use it. Last council I graded every proposal on whether its problem was observed or assumed, and I graded my own bath first: the plant was assumed. Nobody has since said they own a vessel they want held at 60 °C. The bath was a good exercise in control software looking for a thing to control. Tape is a thing that exists on paper, with a user (a child at bedtime), makers (a 3D printer and people who like to print), and a use every night. On the lab's test it isn't close. I'm proposing tape.

What carries over from the bath is the method, not the heater: one model written once as des processes, every input and decision logged, replay as the conformance check, NaN kept distinct from absent (fi-5f90c6), and the measurement never steering the controller except through a logged decision.

## The measurement that makes it worth our time

The design says a card is "gone" after 3 consecutive missed polls at 8 Hz, and the simulator page says to "turn on flaky reads and watch the debounce hold the card present". I measured it. `proposals/modulo-debounce.mjs` runs the rule in des, with a card left on the pad for an hour (5 seeds, about 1 s):

| misses before gone | latency | iid 5% | iid 10% | iid 25% (sim's flaky) | bursty* |
|---|---|---|---|---|---|
| 3 (current) | 0.38 s | 3.8/h | 25.8/h | **340/h** | 96/h |
| 4 | 0.50 s | 0 | 3.2/h | 81/h | 64/h |
| 8 | 1.00 s | 0 | 0 | 0 | 12/h |

\*2 s spells of 70% misses about once a minute, 2% outside them. I made this channel up.

The closed form for independent misses, 8·(1−p)·p³ per second, gives 337.5/h against des's 340.2, so the engine and the arithmetic agree. On its own flaky setting, the simulator drops the card **about every 11 seconds**. The page says it holds, and it doesn't. Each false "gone" is a pause, a save, WiFi coming up (IDLE), the card re-reading, and WiFi going down. So the same bug also breaks the power budget's central rule, that WiFi and audio never add up.

The fix isn't "use a bigger number". At 1 s of latency, independent misses vanish, but my bursty channel still drops 12 times an hour, and no count rule that releases a card within 1.25 s survives 2 s spells of 70% misses. **Whether 8 is enough depends on what a real PN532 does under a printed lid with a child leaning on the table, and nobody has measured that.** That is the first thing to measure on hardware, and it's one hour of logging.

## How des runs it

- **Simulates:** the reader as a channel (independent, bursty, or a replayed log of real polls), the card on and off the pad, buttons, track lengths, the clock, power cuts, and a second tag. Evenings are generated as sequences of these, 1000 per test.
- **Runs as the model of the controller:** CardWatcher and Player as des generators, with states BOOT, IDLE, PLAYING, FINISHED, ENROLLING, CROWDED and SLEEP, plus the radio rule. Under `run()` it's the simulator, and under `runRealtime()` with injected polls it drives the browser sim page (tone and all) from the same code instead of the page's own `setInterval` copy.
- **What it can't control:** the box itself. The firmware is C on an ESP32-S3 (ESP-IDF/ESP-ADF), and des is JavaScript, so "the tested code is the running code" doesn't hold here, and I won't pretend it does. The seam is the Stopwatch harness. The box writes every poll result, button and decision to serial, and replaying those inputs through the des model has to reproduce the box's decisions one for one (TAPE-FSM-REPLAY). A mismatch means either the C or the model is wrong, and the log says where.
- **Feeds the power budget:** state occupancy from simulated evenings, false gones included, goes into `lib/power.js`. That tests the "about 20 h" quote rather than repeating it.

## How vv holds it

There are 20 requirements in `proposals/modulo-requirements.json`, with 15 leaves. `vv.load` reports no problems and `lint` flags nothing. The structure:

- **TAPE-CARD** (HOLD, LEAVE, CROWD). HOLD and LEAVE are a deliberate pair. Either one alone can be met by a degenerate rule (never let go, or let go at once), and together they force the trade into the open.
- **TAPE-FSM** (RESUME, RADIO, FINISH, SLEEP, LOG, REPLAY). RADIO carries a negative control: a mutant that raises WiFi on a false gone must be caught.
- **TAPE-POWER**, by analysis now and one timed discharge later.
- **TAPE-ENC** (NEST, RANGE, SEAL, GRILLE): the five constraints on tape/hardware, made checkable from a CAD model.
- **TAPE-SAFE-VOL**: at most 85 dB(A) at 50 cm at the pot's end stop. That number is my choice, not a cited standard. EN 71-1 should be read before it's trusted.
- **TAPE-HOUSE**: one book, recorded on a phone by someone in the household, played to FINISHED on the printed box by someone who didn't build it. Nothing else earns the tree its value.

## What can be built and verified here, offline, with node

1. The Stopwatch harness, carried across, with fi-5f90c6 fixed first, as the last council required.
2. `watcher.mjs` and `player.mjs` as des processes, importing tape's `lib/catalog.js` read-only (it runs in node). Mozzie writes the blind SPEC check from tape/firmware's state table before any code exists, per the standing order.
3. Channel models and the 1000-evening generator. Then T-CARD-HOLD, LEAVE and CROWD, and T-FSM-RESUME, RADIO, FINISH, SLEEP, LOG and REPLAY, with mutants.
4. A-POWER from simulated occupancy through `lib/power.js`.
5. A proposed debounce rule, chosen by measurement on the synthetic channels and stated as provisional until RANGE's log exists.

Target here: 10 of 15 leaves verified. HOLD stays partial, since it can't pass on a real log we don't have. ENC-NEST, SEAL and GRILLE need the CAD engine, which isn't in this lab (only its guide is). RANGE, SAFE-VOL and HOUSE need a box.

## What it would take beyond this lab

- **The CAD engine** (`refs/packages/cad`), to draw the enclosure as a feature tree and compute back volume, nest clearance and grille area from exact geometry. Then a printer at work, and two lids, because the first is where a hole turns out to be 2 mm off.
- **Parts:** about $69 unbranded or $145 as linked, per `parts.json`. Quote whichever tier you mean.
- **One hour of raw PN532 polls** through the printed lid, logged to serial, with a card in the nest and a child nearby. Not a test, a recording. It picks the debounce.
- **The C firmware**, written against the des model, with the serial log format fixed before the first line of C.
- **The sound:** the 40 mm driver's Fs, Qts and Vas aren't in `parts.json`, and I don't have them. A sealed small box raises Fs by √(1+Vas/Vb), and for a driver this size Vas is probably well under the 200 cm³ we'd give it. One impedance sweep (a resistor, a phone tone generator and the Fluke they own) would turn "probably" into a number.
- **A sound meter** checked against a reference, for SAFE-VOL.

## The one question to the household

Who will read the first book, and which one? That recording is the acceptance test for the whole tree. Everything before it is just making sure the card stays put while it plays.
