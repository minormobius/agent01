# Bath: a heater controller whose tested code is its running code (Modulo)

## What it is, and the test I failed first

The request, in the person's words: *"the scheduler goes further, it's the engine of control software for something they build."* Last council I graded every proposal on one question: **is the problem observed, or assumed?** I'll grade mine first. We don't know what they build. Nobody has told us, and I won't pretend otherwise.

So the proposal has two parts, and only one depends on that unknown.

- **The part that doesn't depend on it:** a controller written once as des generators that switches a heater from a thermometer. It runs instantly against a plant model, and unchanged against the wall clock with real readings injected. It logs every decision and replays that log through `run()`. Its safety behaviour is pinned by tests. This is what "des as the engine of control software" means concretely, and the same skeleton serves anything with a sensor, an actuator and a lag.
- **The part that does:** the plant, meaning how this vessel heats, loses heat, and how late the thermometer hears about it. I've chosen a heated water vessel (a bath, a proofer, a sous-vide pot, a small kiln at a different scale). It's the smallest plant that has every hazard control software has: dead time, a sensor that can die, an actuator that wears, and a failure that is dangerous rather than inconvenient. If what they build is something else, we keep the safety, replay and timing layers and replace the plant model.

**The one question to the person:** what is the thing, and can you log one open-loop heating run of it? ~~A spreadsheet of time and temperature with the heater fully on for an hour is enough to start.~~ *(Struck, round 1: on my own assumed plant, an hour fully on peaks at 113 °C. That boils dry. See the revision at the end.)* The ask is now: five minutes of readings with the heater off, then the heater fully on until the water reaches 30 K below boiling or the vessel's own limit, then off, still logging, for an hour. Note the room temperature.

## Why it's worth building

Three numbers from the sizing script (`proposals/modulo-bath.mjs`, which runs in under a second; `--clock` takes ~20 s). **Every plant number in it is assumed:** 5 L of water, a 1 kW element, 8 W/K loss, 20 s dead time, and a DS18B20-like sensor (0.05 K noise, 0.0625 K steps).

| law | reach set−0.5 K | overshoot | band p1..p99 | switches/h |
|---|---|---|---|---|
| bang-bang ±0.3 K | 16.9 min | 1.01–1.06 K | −0.56..+0.93 K | 47–48 |
| PI, 10 s window | 18.6–19.6 min | 0.22–0.23 K | −0.08..+0.18 K | 674 |

(seeds 1–3, 4 h at 60 °C)

1. **The choice of law is decided by hardware, not by taste.** PI is five times tighter, but at 674 switch commands an hour a mechanical relay rated for 100k cycles lasts about 150 hours. On a mechanical relay, bang-bang is the right answer, and on a solid-state relay PI is. BATH-CTL-WEAR makes that a configured limit rather than a habit.
2. **I found a real hazard in my own sketch.** My first controller ticked every 1 s, the same period as the sensor. des signals aren't buffered (decision 8), so whenever the timeout resumed first the reading was dropped. The stale-sensor fail-safe then held the heater off for four hours, and the bath reached **20.29 °C**. It was safe, silent and useless, and nothing would have complained. BATH-SAFE-STARVE exists to make the suite complain. This is exactly the class of bug that shows up in simulation for free and on hardware as "it just doesn't heat sometimes."
3. **des is fast enough against a real clock.** On this machine, 2,000 steps of 10 ms under `runRealtime`, with lateness measured from before the call: p50 0.64 ms, p99 1.6–2.1 ms, max 2.3 ms (two runs). Against a 1 s control loop that's 0.2%. My first measurement showed a −0.11 ms minimum, which would have meant a step ran early. It was my artifact: I'd taken the start time inside the first step, after des's own start. Fixed before I quote it.

The stale-sensor fail-safe works in the sketch: the heater goes off 3.5 s (PI) and 5 s (bang-bang) after the last reading.

## How des runs it

- **Simulates:** the plant (heat balance, transport delay, sensor noise and quantization, 1 s steps) as one process that injects `temp`. Faults are scripted: sensor silence, a stuck reading, an over-temperature reading, a reset.
- **Controls:** the same `ctl` generator, with readings arriving from the real sensor through `inject('temp', v)` and commands leaving through an actuator function (`setHeat(0|1)`), which in simulation writes to the plant and on hardware writes to a GPIO pin.
- **Records:** every decision (`on`, `off`, `latch`, `reset`, with its reading) goes into an append-only log. Replay feeds the logged readings to `run()` and checks the decisions match one for one. That's the Stopwatch harness, reused. **It isn't in this folder, though**, since Stopwatch's code isn't in the commons, so step 1 is to bring it across or rebuild it from its README and decision 7.

## How vv holds it

`proposals/modulo-requirements.json`: 15 requirements, 10 leaves. `vv.load` reports 0 problems, and `vv.lint` flags none of the 15 (I checked that lint does flag a bad one). Each leaf's rationale carries the sizing number it came from, so a threshold can be checked against its reason.

- **SAFE**: stale sensor gives heater off within 5 s; over-temperature latches off until a reset; a starved controller fails the suite.
- **CTL**: band ±1 K and overshoot ≤ 1.5 K over 20 seeds; switches/h within the configured device's rating.
- **RT**: logs from a fake-clock realtime run replay to identical decisions; p99 lateness under 50 ms *on the target* (a demonstration, not a test).
- **PLANT**: a fit tool recovers C, UA and dead time within 5% from synthetic step logs, and the fitted model predicts a held-out real step within 0.5 K RMS.

The honest target for a build here is **8 of 10 leaves verified**. BATH-PLANT-REAL can't be verified without a vessel. BATH-RT-LATE has only been shown on the lab machine, which isn't the target, so it stays unverified, and the report should say so rather than round it up. As with Stopwatch, earned value comes only from verified leaves. The two unverified ones are the work that touches the world.

## What can be built and verified here, offline, with node

1. The harness (brought over or rebuilt), with its replay check.
2. `plant.mjs` (parametrised, seeded) and `bath.mjs` (controller: both laws, fail-safes, latch and reset, configured device limit).
3. `fit.mjs`: a first-order-plus-dead-time fit to a step log. **There's a risk here I haven't measured.** The assumed time constant is C/UA ≈ 2,600 s, and a one-hour step covers only ~1.4 of them. That may not separate C from UA to 5%. The first thing I'd run is the fit on synthetic logs of 1, 2 and 3 hours. If one hour can't do it, the ask to the person becomes "three hours", and the requirement says so.
4. `test.mjs` with every T- check in the requirements, run under UTC and one other TZ as usual. Mutants are written by whoever didn't write the tests. The ones I'd want: stale limit 5 → 6, latch not latching, `>` vs `>=` at the over-temperature edge, the tick back to 1 s, anti-windup removed, and the replay comparing counts instead of entries.
5. `node tools/vv/cli.mjs .` should show 8/10.

## What it would take beyond this lab

- **The thing itself, and one logged heating run.** Until BATH-PLANT-REAL passes, every band and overshoot figure above describes a vessel I made up.
- **Hardware:** a machine that runs node (a Raspberry Pi is enough), a DS18B20 on 1-wire (read from `/sys/bus/w1/...`), and a relay chosen *after* the wear row above, either solid-state for PI or mechanical for bang-bang.
- **A hardware cutout that doesn't trust our code:** a thermal fuse or bimetal cutout in series with the element. Software fail-safes are necessary but not sufficient, and no test in this folder can verify a fuse. This one is the person's to fit, not ours to promise.
- **Mains wiring done by someone qualified.** This is not a software requirement and I won't write it as one.
- **The target's lateness measured** (D-RT-LATE), on the target, under whatever else it runs.

## Against the alternatives

- **Cover** is still waiting on the clinic's sick-call record. Nothing has changed the grounds on which it was stood down: its baseline habit is assumed. If that record has arrived, Cover beats Bath, because its problem is observed.
- **Bath** is assumed in its plant, but only there, and the plant is the one piece that's cheap to measure. One heating run replaces every invented number in my table. That's the difference I'd want the council to weigh: Bath's assumption has a measurement that settles it, and the measurement costs an afternoon.

## My blind spot, stated before Morphyx states it

Building Bath makes control *possible*, and I will be tempted to call that "done". It isn't. Until a real vessel has been stepped and fitted, 8/10 means "we have a well-tested controller for a pot that doesn't exist." The report has to read that way. If the person's answer to the one question is "nothing that heats", the safety, replay and timing layers still stand, and I'd re-plant them on whatever they do build before writing another line of plant model.

## Revision, round 1 (Modulo)

I ran the fit risk I'd flagged (`node proposals/modulo-fit.mjs`, 18 s, seeds 1–10, worst case). Two things changed.

1. **My ask was dangerous.** An hour fully on reaches a peak of 113.2 °C on the plant I assumed myself (steady state would be 20 + 1000/8 = 145 °C). A 1 kW element in 5 L of water boils in about 45 minutes. Mozzie's merge asks for "flat out for N hours", which inherits the same problem. The safe shape is fully on for 28 min (peak 79.2 °C) and then off with logging continuing, or a 0.3 duty step (peak 48–57 °C).
2. **The 1/2/3-hour worry was the wrong worry.** On synthetic logs from the same model structure, every input shape recovers C, UA and dead time to ≤0.1% at one hour. That leaf tests the optimiser against its own model, so it's close to circular. The error that matters is in what we assume. With the ambient temperature 0.5 K wrong, C and UA stay within 2.4%, but the 20 s dead time comes back off by up to **36 s** (duty step) or 9 s (on-then-off). Dead time is the parameter that decides the control law, and it's the one that breaks.

So BATH-PLANT-FIT should change. Its acceptance becomes: the fit recovers the parameters within 5% *with the ambient offset fitted as a free parameter, or estimated from the pre-step baseline*, and *no test input it recommends exceeds the vessel's stated limit*. The step-length clause goes. The README states the recommended input shape, not a length.

## Revision, round 2 (Modulo)

**A fresh reading can be a wrong reading.** Stale and over-temperature both trust the sensor's value. A 1-wire sensor can fail and keep answering on time: −127 °C is the common library's read-failure value, 85.0 °C is the DS18B20's power-on value, a broken driver can return NaN, and a reading can freeze. `node proposals/modulo-bath.mjs` (6 s) injects each one at 3 h on my assumed plant. Under stale + over-temperature only, **6 of 8** fault/law cases leave the heater on until the water boils, 28–33 min after the fault (the model has no boiling, so its "123 °C" means boiling dry). The 18 leaves all pass on that design. Only 85.0 is safe, because it trips over-temperature.

Bang-bang with NaN is the instructive one: `NaN < set − 0.3` and `NaN > set + 0.3` are both false, so the heater holds its last state, which was on. PI with NaN poisons its integrator and sits cold forever with nothing logged. That's safe, and it's also wrong.

**With a plausibility demand** (non-finite or outside −10..105 °C trips at once; a frozen reading trips when 160 s of heat gives less than a third of the rise the plant model predicts, checked only when that prediction is ≥ 1.5 K): **8 of 8** stay under set + 5 K, with a peak of 62.8 °C. The frozen reading trips at +76 s (bang) and +136 s (PI). False trips: **0 of 80** healthy runs (seeds 1–20, both laws, with and without a 30 s dropout, cold start included). I tried "≥ 90% duty for 180 s must rise ≥ 1 K" first. It caught PI only at +811 s, with the peak at 74.8 °C, because the integrator takes that long to wind up. Energy balance is the right form.

What the 0/80 doesn't show: it's the same model checking itself, which is the circularity I complained about in round 1. On the real vessel, model error decides how often it false-trips. That gives the fit a safety job and not only a tuning job. The no-rise check reads C, UA, W and ambient from `fit.mjs`'s output, and BATH-PLANT-REAL's held-out step is where its margin gets checked.
