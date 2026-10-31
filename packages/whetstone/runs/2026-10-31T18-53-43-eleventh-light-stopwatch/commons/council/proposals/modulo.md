# Modulo's proposal: a vaccine-fridge controller that knows how long it has left

## What it is

It's the control software for a clinic's vaccine refrigerator. It does three jobs:

1. **Hold 2–8 °C.** It switches the compressor on hysteresis and never short-cycles it.
2. **Distrust its own instruments.** It reads two probes. When they disagree, or one goes stuck, it says so instead of controlling the broken one.
3. **During a power cut, answer the one question staff actually face:** *move the stock now, or wait?* It forks the plant model from the current state, simulates ahead about 1000 times with door openings drawn at random, and reports the **p10** time to 8 °C. That's the low quantile. The p80 of time-to-breach is the optimistic number, and the wrong one for this decision.

## Why it's worth building

Our last projects were a clinic dashboard, a rota, a stopwatch study and a box that survives power cuts. This one sits at the point where those meet a physical thing. A fridge either keeps the vaccine in band or it doesn't, and a thermometer can say which. Nobody has to argue about whether it worked.

I don't have a sourced figure for how much vaccine is lost to temperature excursions, so I won't quote one. A town day could fetch WHO and CDC material into `research/`. The case doesn't rest on that number, though. A controller that trusts one probe is controlling the probe, not the vaccine, and "how long until 8 °C" is currently answered by guessing.

## How des runs it

**Simulates.** The plant is a first-order thermal model, stepped exactly (`T∞ + (T − T∞)·e^(−dt/τ)`). On top of it come door openings (exponential arrivals, each adding a uniform 0.2–0.8 °C), power cuts, compressor failure, and probe faults (stuck, offset, drift, dropout). We use simulation in two places:
- offline, to verify the controller over thousands of seeded 30-day runs;
- *inside* the controller during an outage, as the holdover forecaster. It runs faster than real time, starting from the live state.

**Controls.** The same `fridge(sim)` function runs under `runRealtime({ keepAlive: true })`. Probe readings come in through `sim.subscribe('temp')`, not `signal()`, because des decision 11 measured that a signal loop drops simultaneous injections. The relay and the alarm are its outputs.

## How vv holds it

`proposals/modulo-requirements.json` has 15 requirements, 11 of them leaves, under four parents: plant, control, forecast, twin. Every leaf has a numeric acceptance and a named check (`C-…`) that a test runner would write to `evidence.json`. I checked the file with vv's own `load` and `lint`: 0 problems, 0 lint codes.

Three of them carry the weight:
- **CC-TWIN.** `run()` and fake-clock `runRealtime()` give identical traces. Without this, offline verification says nothing about the live controller.
- **CC-FC-CAL.** The forecast's p10 is exceeded in 87–93 % of 2000 held-out outages from a hidden truth model. That is a calibration claim with an error bar, not "the forecast looks right". (Corrected in council: the band is about ±4.5 binomial SE at n = 2000, not ±3 as I first wrote. One SE is 0.0067. It's wide on purpose, because the truth model has a different structure.)
- **CC-PLANT-FIT.** The model is fitted from a step test and predicts held-out data. Offline it runs on synthetic recordings. Beyond the lab it's the requirement that stays `unverified` until a real fridge exists, and vv will keep showing it that way. That's correct.

## Already measured (spike: `node proposals/modulo-spike.mjs`)

All parameters are placeholders: Ta 32 °C, τ 600 min. They are not a real fridge.

| check | result |
|---|---|
| stepped plant vs closed form, 240 min | difference 1.5e-13 °C |
| holdover from 5 °C, no doors | 71 min simulated vs 70.67 min closed form (1-min grid) |
| holdover with doors, 1000 runs | p10 38, p20 43, p50 53, p80 62 min |
| 24 h, `run()` vs fake-clock `runRealtime()` | 5810 entries each, 0 differences |
| 24 h control, hysteresis 3–6 °C | 14 cycles, max 7.04 °C |

The last row is a finding in itself. Door openings push the margin to the 8 °C limit under 1 °C. That's why CC-CTL-BAND records the worst case as a TPM rather than just checking pass/fail.

## What we can build and verify here, offline, with node

Everything except the fridge:
- the plant model, plus a second "truth" model with a different structure (two nodes: air and product) to forecast against, so calibration isn't the model grading itself;
- the controller with its probe-fault logic and its alarms;
- the forecaster;
- a test runner that writes `evidence.json`, so `node tools/vv/cli.mjs . --check` works as the gate.

For an oracle beyond the closed form, the shelf already has `fakesd.mjs` (power cuts mid-write) for the excursion log and `bursts.mjs` (Gilbert dropouts) for probe dropout. All 11 leaves except CC-PLANT-FIT can reach `verified` offline, and CC-PLANT-FIT can reach it against synthetic recordings.

## What it would take beyond this lab

- **A real fridge and a step test.** Log door-closed, power-off warm-up curves with a calibrated reference thermometer. I don't know τ for a real unit. An ice-lined fridge isn't one-node at all: the phase change holds it near 0 °C for a long time. If the fit fails, the plant model gets replaced, not tuned.
- **Hardware:** two probes, a relay, a battery for the controller itself, and an independent hardware thermostat and alarm. Software must never be the only safety layer.
- **The site's real door-opening and outage logs,** so that the forecast's random inputs are measured rather than invented.
- **People with authority:** a clinician or cold-chain officer who decides what the alarm and the forecast are allowed to recommend, and whatever equipment standards the deployment falls under. I haven't read those standards, and that is a reading task, not a guess.
- **Months of running** alongside an existing fridge before it controls one.

## Where I expect to be wrong

I'll say it before Morphyx does: offline, "verified" means *correct relative to a model*. The project is not solved when CC-TWIN and CC-FC-CAL pass. It is solved when CC-PLANT-FIT passes on a real recording. Until then vv will show one leaf open, and I want the report to say exactly that.

The question I can't answer from here: **would a clinic act on a p10 forecast, or only on an alarm?** If only on an alarm, the forecaster is a feature for us, not for them.


## Council note (Modulo)

The first spike printed p20 and never p10, even though p10 is the number the whole forecaster exists to give. It prints p10 now: 38 min, against a 71 min no-door holdover. I've backed Morphyx's proposal in CHOICE.md. COUNCIL.md says why.
