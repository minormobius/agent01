# Keyholder: who is allowed to move the thing (Morphyx)

Council 2, 2026-10-04.

## What it is

The request was: *"the scheduler goes further, it's the engine of control software for something they build."* Modulo has proposed the controller, Bath, and graded it honestly: the plant is assumed, and the skeleton is not. I agree with that grading. I'm proposing the piece of the skeleton that I think matters most and costs least to get wrong in simulation: **who has authority over the actuator.**

A control law decides *what* the heater should do. In any machine somebody actually uses, though, the law isn't the only thing that wants to move the actuator. There's a boost button, a start timer, a manual jog, a fail-safe, and an operator reset. In a first draft each of these calls `setHeat()` itself, and the rule that decides between them is whichever ran last. Nobody wrote that rule. It comes from call order, and it changes the day someone adds a button.

Railways solved this in the 1850s with a mechanism. In Saxby's interlocking frame, locking bars behind the signal levers physically stopped a signalman from pulling two levers that would set conflicting routes. The rule was built into the iron, where you could read it. Therac-25 (1985–87) is the same story going the other way. The Therac-20's hardware interlocks were dropped because the software was trusted, and the software's order of operations then decided who received a lethal dose.

**Keyholder is a locking frame in software.** It has three parts:

1. **An authority table** (JSON, readable by the person). For each actuator it holds the safe state, the sources that may command it and in what rank, the permissives each command needs (for example, "boost only while reading ≤ set + 2 K"), and who may lift a latch.
2. **One arbiter**, a des process. It is the only code that calls a driver. On every request and every tick it decides the actuator's state from the table. A safety demand only ever moves toward the safe state, and only an operator reset lifts it, made while the named permissives hold.
3. **A decision log.** Every change and every refusal is recorded with its source, its command, and the table rule that decided it. The log replays through `run()` (Stopwatch's harness, reused).

It doesn't replace Bath. Bath is its first plant, and Bath's controller becomes one row in the table. The council can take both, or take Bath and fold this in as its authority layer.

## What I measured before writing

`node proposals/morphyx-keyholder.mjs 200 1` (des, seeded, about 0.9 s). The plant is Modulo's assumed bath: 5 L, 1 kW, 8 W/K, set point 60 °C, a 1 s sensor. Its bang-bang controller has the 5 s stale fail-safe and writes only on change. **I added one writer:** an operator "boost" button that holds heat for 120 s, pressed about once an hour (assumed). The sensor dies at a random time between 1 h and 3 h, and each run lasts 4 h.

| arrangement | trials with heater on after sensor death | heater-on time with sensor dead p50 / p95 / max | max T, whole run p50 | boosts refused (sensor healthy) |
|---|---|---|---|---|
| last writer wins (seeds 1–200) | **76.5%** | 148 / 480 / 844 s | 63.60 °C | n/a |
| last writer wins (seeds 1001–1200) | **80.5%** | 240 / 600 / 724 s | 63.73 °C | n/a |
| Keyholder (both blocks) | **0%** | 0 / 4 / 4 s (the stale window) | 62.03 °C | 666 and 756 (0) |

What the table says about the arrangement:

1. **Bath's fail-safe is correct, and the arrangement around it still defeats it.** The controller turned the heater off on time in every trial. Then the boost button turned it back on, because nothing told the button that the heater had been switched off for a reason. The fail-safe lived inside one writer, and the other writer never consulted it. That isn't a bug in any one line of code. It's a missing rule about who outranks whom.
2. **I found the same class of bug in my own arbiter.** In the first draft, the latch set a flag and then waited for the next request before deciding anything. A boost already running kept heating a dead bath in 3–4% of trials, for up to 120 s. A safety decision that waits to be asked is just a suggestion. KEY-SAFE-PROMPT exists because of this, and the sketch now re-decides both on the latch and on every tick.
3. **Somebody pays for the arbiter, and it's the operator.** 666 and 756 boost presses were refused. All of them came while the sensor was dead, and each one was logged as "refused: safety latch, reset needed". That's the right person to bear the cost, and it's why the refusal has to say *why*. A silent refusal looks like a broken machine, and broken machines get bypassed with a jumper wire. The boost ceiling also took away the boost's healthy-time overshoot (median peak 63.6 → 62.0 °C). Anyone who *wanted* that overshoot has lost something, and the table is where they'd argue for it back.
4. **Honest scale:** in this assumed bath, last-writer-wins costs about 4 K (63.9 °C at worst after the sensor died), not a fire. A 1 kW element in 5 L of water with 8 W/K of loss doesn't run away on one press an hour. The hazard grows with the actuator: a held jog button on a motor, a timer that rewrites "on" every hour, or a smaller vessel. The 0% is partly by construction. What the sketch measures is how often an ordinary second writer exercises the gap: three times in four.

## How des runs it

- **Simulates:** the plant (Bath's, and a second one: a motor-driven gate with two end-stops and an e-stop), plus the *sources* as separate processes: the controller, a seeded operator pressing buttons, a timer, and fault scripts (sensor silence, a stuck end-stop, an e-stop held during a jog).
- **Controls:** the same arbiter under `runRealtime`. Sources arrive through `inject` (a GPIO button edge becomes `inject('cmd', {src:'boost', ...})`), and the arbiter alone calls the drivers. A driver called without the arbiter's private token throws.
- **Records:** decisions go to the append-only log, and replay checks them one for one.

## How vv holds it

`proposals/morphyx-requirements.json` has 15 requirements and 10 leaves. `vv.load` reports 0 problems and `vv.lint` flags none of the 15 (lint does still flag a planted bad one). Every rationale carries the number or history it came from.

- **TABLE:** only the arbiter calls a driver; a contradictory table fails at construction.
- **SAFE:** a latch outranks every source (a property test over 1000 seeded sequences on both plants); a latch acts at the instant it's raised; only an operator reset lifts it, with its permissives true.
- **LOG:** one entry per change or refusal, each naming its rule; fake-clock realtime logs replay identically, and the replay fails when a logged reading is altered.
- **PLANT:** the gate runs under a second table with `keyholder.mjs` unchanged. A heater is one-sided (off is safe). A motor isn't (stopping is safe, but neither direction is). If the table can't express that, it was bath-shaped. **KEY-PLANT-NEG** runs last-writer-wins as a negative control: the outrank property must *fail* it. A property test that can't fail the arrangement it replaces proves nothing about the one it keeps.
- **REAL:** a hardware cutout that no software path can command, checked by inspection. It's unverifiable here and will be reported as unverified.

**The target for a build here is 9 of 10 leaves verified.**

## What can be built and verified here, offline, with node

1. The harness from Stopwatch (brought across, or rebuilt from its README), since replay depends on it.
2. `keyholder.mjs` (table loader and validator, arbiter, log) plus `tables/bath.json` and `tables/gate.json`.
3. `plant-bath.mjs` (Modulo's, if Bath is chosen too) and `plant-gate.mjs` (position, speed, end-stops, e-stop).
4. `test.mjs` with every T- check, run under UTC and one other TZ, writing `evidence.json`. Mutants are written by whoever didn't write the tests. The ones I'd want: latch waits for the next request; reset ignores permissives; safety rank compared with `<` instead of `<=`; a driver call that skips the token; the log drops refusals; and replay compares counts instead of entries.
5. `node tools/vv/cli.mjs .` should report 9/10.

## What it would take beyond this lab

- **The person's list of who touches the machine.** That's the one question: *besides the controller, what can make it move?* (Buttons, timers, a phone, another person.) Each answer becomes a row in the table, and the person signs the ranks, not us.
- The same hardware as Bath (a Pi, a sensor, a relay or motor driver), with button inputs wired to `inject`.
- **KEY-REAL:** a thermal fuse, limit switch or mains-side e-stop in series, out of the computer's reach. Keyholder arbitrates between programs. It must never become the last line, because a fuse doesn't run JavaScript. Fitting that, and the mains wiring, is the person's job and a qualified electrician's, not a requirement we can verify.

## My blind spot, stated before Modulo states it

I believe that every machine people use ends up with more than one writer, so the authority problem is permanent and should be built first. That's my habit of treating structure as destiny. If what they build has exactly one source of commands and always will, Keyholder is a one-row table and some ceremony. In that case Bath's in-controller fail-safe is enough, and I'd say so. The answer to the one question settles it. Until then, I'd build the table even if it has only one row, because the day someone adds a button, the second row is the thing nobody remembers to write.

## Round 1 revision

This proposal is stood down into Mozzie's merge (one bath, one writer). The gate plant is deferred. It's replaced by a table test with a two-sided actuator row, written before `tables/bath.json`, so the schema can't treat `off` as the safe state. A new design note: each safety demand in the table carries a `latching` flag. The 24 h dropout count decides it for stale, and the person signs it. Code doesn't decide it. See COUNCIL.md.
