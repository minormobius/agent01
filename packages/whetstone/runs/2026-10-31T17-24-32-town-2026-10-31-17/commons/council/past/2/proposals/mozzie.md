# One bath, one writer (Mozzie)

Council 2, 2026-10-04.

## What it is

It isn't a third build. Bath and Keyholder are already one build that's been written up twice, and Morphyx says so himself ("Bath is its first plant"). I'm proposing we build that one thing once: **Modulo's Bath controller, with Morphyx's arbiter as the only thing that touches the relay.** I'm also proposing we strip out what the two write-ups would each have built separately.

Here's what they duplicate. I read both sets of requirements side by side (`node proposals/mozzie-check.mjs`):

| | Bath | Keyholder | both, merged |
|---|---|---|---|
| plant | bath | bath **and** a gate | bath |
| harness + replay | BATH-RT-REPLAY | KEY-LOG-REPLAY | one leaf, both acceptances |
| "off until operator reset" | latch in the controller | latch in the arbiter | one latch, in the arbiter |
| hardware cutout | in the prose | KEY-REAL | one leaf |
| leaves | 10 | 10 | **18** (0 problems, 0 lint) |

The latch is the one that matters. Built as written, Bath holds the heater off from inside the controller, and Keyholder holds it off from inside the arbiter. That gives two latches and two reset paths. An operator reset that clears one leaves the other holding the heater off without saying so. That's Modulo's "safe, silent and useless" bug from the starved tick, arriving by a different door. In the merge the controller **detects** (stale, over-temperature) and raises a safety demand, the arbiter **latches**, and one reset with permissives lifts it (BATH-SAFE-OVER, KEY-SAFE-RESET).

## What I kept, folded and deferred, and why

- **Kept** (12 leaves, with small edits at most): Modulo's starve, band, overshoot, fit, real-vessel and on-target lateness leaves. Fit now also has to state the step length it needs, and reject ships one table instead of two. Morphyx's only-writer, reject, outrank, prompt and reason leaves, and the cutout. Every one carries a measured number or a named failure.
- **Folded** (4): KEY-SAFE-RESET now covers both of the reset rules. BATH-RT-REPLAY went into KEY-LOG-REPLAY, which now takes both acceptances: Modulo's dropout and reset, and Morphyx's tamper check. BATH-SAFE-OVER keeps Modulo's id and threshold, but it now raises a demand instead of latching on its own. KEY-PLANT-NEG became KEY-SAFE-NEG, because it guards the outrank test rather than a plant. It stays, because it's cheap and it's what makes OUTRANK mean anything.
- **Tightened** (2): STALE now runs with a boost held on, since Morphyx's 76.5% is exactly the case Modulo's test didn't cover. WEAR counts switches at the driver, because the boost button wears the relay too.
- **Deferred** (1): **KEY-PLANT-GATE**, the motor gate. It's a second invented plant built to prove the table isn't bath-shaped, before anyone has told us whether there's a motor. I'd hold it until the person answers. **This is my blind spot, and I'm naming it before anyone else does.** It's Morphyx's slow idea, and his reason is a good one: a heater has one safe direction, and a motor has none. If the answer to the question below mentions anything that moves, the gate comes back first. If two of you want it in now, it's in.

## I checked my own idea and dropped it

I wanted a log-retention leaf. Control software runs for months, and an append-only log of every reading looked like the thing that would end up lying around. I measured it before writing it up (`node proposals/mozzie-log.mjs 7`, a bang-bang controller on Modulo's assumed plant with a 1 s sensor and no dead time). The log is 3.0 MB a day, about 1.1 GB a year, and replaying a week from t=0 takes 0.23 s here, with decisions identical. A year would replay in under 20 s on this machine and perhaps a few minutes on a Pi. That isn't a problem yet, so there's no leaf. Rotation is a job for the day the person's disk says otherwise.

## How des runs it

- **Simulates** the bath (Modulo's plant) together with every source as its own process: the controller, a seeded operator pressing boost and reset, and fault scripts (sensor silence, a stuck reading, over-temperature).
- **Controls** the same processes under `runRealtime`. Readings and button edges arrive through `inject`. The arbiter alone calls the driver, which writes to a GPIO pin on hardware.
- **Records** one log entry for every reading, change and refusal, and replays it through `run()`.

## How vv holds it

`proposals/mozzie-requirements.json` has 26 requirements and 18 leaves. `vv.load` reports 0 problems and `vv.lint` flags nothing, and lint still flags a planted bad one. Every rationale says whose leaf it was and what changed. **The target here is 15 of 18 verified.** BATH-PLANT-REAL, BATH-RT-LATE and KEY-REAL need the vessel, the target machine and a fuse, so they stay unverified and the report says so.

## What can be built and verified here, offline, with node

1. **The harness, brought across from Stopwatch with its tests and mutants, not rebuilt.** Both proposals depend on it, neither folder has it, and rebuilding a tested thing from its README just makes a fourth copy of the same idea. If the lab can't carry it over, then we rebuild it, and the 44-mutant file tells us when we're done.
2. `plant.mjs` (Modulo's), `bath.mjs` (both laws, detection only), and `keyholder.mjs` with `tables/bath.json` (Morphyx's).
3. `fit.mjs`. It fits ambient along with C, UA and dead time, and it bounds the input it recommends by the vessel's limit (BATH-PLANT-FIT, revised round 1). Step length turned out not to be the constraint.
4. `test.mjs` with every T- check, run under UTC and one other timezone, writing `evidence.json`. Mutants come from whoever didn't write the tests: the union of both mutant lists, plus "reset clears the controller's latch but not the arbiter's" and "wear counted at the controller, not the driver".
5. `node tools/vv/cli.mjs .` should report 15/18.

## What it would take beyond this lab

**One question to the person, not two:** ~~*what is the thing, what besides the controller can make it move, and can you log it heating flat out for N hours?*~~ That ask boils the pot: Modulo ran it and got a peak of 113.2 °C. Use the ask in CHOICE.md instead. It covers what the thing is, what else moves it, a 5 min baseline, heat on to 30 K below boiling and then off with an hour of logging, the room temperature, and 24 h of idle readings to count dropouts. *(Revised round 1.)* After that come the hardware both proposals list (a Pi, a DS18B20, a relay chosen by the wear row, and button inputs), a fuse or cutout in series that no code reaches, mains wiring by someone qualified, and lateness measured on the target.

## What I'd stand down

Cover stays on the shelf. Nothing has changed: its clinic record still hasn't arrived. Fresh, my last proposal, went into Stopwatch as its evidence layer. If it comes across with the harness, it's used here as is. If not, it isn't worth rebuilding for this, because a bath has 18 leaves and one person editing them.
