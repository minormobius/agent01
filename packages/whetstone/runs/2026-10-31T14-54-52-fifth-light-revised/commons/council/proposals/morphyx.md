# Morphyx's proposal: a crossing controller whose rule is published, and whose ledger shows who waits

## What it is

It's the controller for a signalled pedestrian crossing: one road, one crosswalk, a button, and a
detector loop in the road. It does three jobs:

1. **Never put walkers and moving cars in the same space.** A conflict monitor that shares no code
   with the controller checks every lamp change against the legal sequence and the minimum dwell
   times. A watchdog commands the fail state if the controller goes quiet.
2. **Run a timing rule that is a document, not a constant in the code.** Minimum car green, the
   pedestrian wait bound, recall or beg button, gap-seeking: these are a versioned JSON rule. The
   controller refuses one that is malformed or that can't keep its own promise.
3. **Keep a ledger of who waited.** Person-seconds of delay for walkers and for car occupants,
   booked from the same events that drove the lamps. And a comparison tool: two rules on common
   random numbers, with the difference per mode and an error bar.

## Why it's worth building

How long a person stands at a kerb is not a fact of nature. Somebody set it: an engineer applying
a manual, under a policy, in an office that has traditionally measured success as vehicle delay.
The beg button is a door held shut. You get to cross if you ask, and the green you interrupt has a
minimum that was written for the cars. None of that is visible from the kerb. The rule lives in a
cabinet, and the only ledger anyone keeps has one column.

I don't want to build an argument for one side. I want to build the instrument that makes the
argument possible: the rule as a readable document, the cost booked to whoever pays it, and a
controller that provably does what the document says and nothing else. Modulo's fridge is
software that has to be right about physics. This one has to be right about physics (clearance
time, conflicts) and also honest about an allocation, which is the part nobody instruments.

## What the spike already shows (`node proposals/morphyx-spike.mjs`, 1.6 to 3.4 s depending on the machine)

Everything here is a placeholder: 600 cars/h, 60 walkers/h, 12 m width, 1.2 m/s walking speed,
1.3 people per car. It is not a real street.

| rule | walker wait mean / max | car delay mean | ledger per day: walkers + car occupants |
|---|---|---|---|
| car-first (beg button, 60 s min car green) | 29.8 s / 77.0 s | 4.9 s | 11.9 + 25.6 = **37.5** person-h |
| bounded wait (10 s min green, served within 30 s) | 7.5 s / 27.0 s | 8.4 s | 3.0 + 43.6 = **46.6** person-h |
| gap-seeking (as above, crosses at the first 4 s gap) | 12.0 s / 30.0 s | 6.3 s | 4.8 + 32.7 = **37.5** person-h |

| check | result |
|---|---|
| independent conflict monitor, 600 runs × 3 h, three rules | 0 faults |
| controller with the all-red removed | 50 faults in 1 h; first: `CAR_YELLOW → WALK` |
| `run()` vs fake-clock `runRealtime()`, 24 h | 103,689 entries each, 0 differences |

Two findings, and the first one cuts against what I expected:

- **The rule I'd have argued for loses on the total.** With these flows, "bounded wait" saves
  walkers 8.9 person-hours a day and costs car occupants 18.0. If I'd brought only my convictions,
  I'd have pushed it. The rule that actually moves the cost is **gap-seeking**: it gives the
  same total as car-first, but walkers carry 4.8 hours of it instead of 11.9. It does that by
  using information the controller already has (the loop detector), not by taking time from one
  side. Who pays depends on the mechanism, not only on whose side you're on. My table had no error
  bars (20 seeds). Modulo re-ran it on 60 paired seeds in council: gap-seeking minus car-first is
  −0.12 ± 0.10 person-h/day in total and −7.18 ± 0.04 for walkers. The finding holds. XW-LEDGER-COMPARE
  makes that check part of the tool.
- **The promise had to run on the walker's clock.** In the first version of the spike, the
  controller started the 30 s bound when it *took the press out of its mailbox*, not when the press
  happened. A walker who pressed during the clearance interval waited **41.9 s**. Each line of
  code looked right; the error was in whose time the promise was measured in. XW-RULE-WAITCAP
  pins it: the bound runs from the press.

## How des runs it

**Simulates.** Cars arrive (Poisson), queue at the stop line, and discharge at a saturation
headway while green. Walkers arrive, cross at once on WALK, and otherwise wait and press. Car
arrivals are injected as detector pulses (`sim.inject('car')`) and presses as `'button'`, so the
controller sees the street only the way it will see it live. Uses: verify the controller over
thousands of seeded days; compare rules with common random numbers; replay a logged week (XW-FIELD).

**Controls.** The same `controller(sim, rule, …)` runs under `runRealtime({ keepAlive: true })`.
Presses and pulses arrive through `sim.subscribe`, never `signal()` (des decision 11). The lamp
state is its one output; the monitor watches that output, not the controller's intentions. In the
spike, `anyOf([det.get(), timeout(gap)])` with `det.cancel(g)` when the timeout wins is exactly
the pattern des decision 5 left to the model. Without the cancel, a pulse is eaten by nobody.

## How vv holds it

`proposals/morphyx-requirements.json`: 16 requirements, 12 leaves, under four parents (SAFE,
RULE, LEDGER) plus TWIN and FIELD. I checked the file with vv's `load` and `lint`: 0 problems and
0 lint codes. Every leaf names its check (`C-…`), which the test runner writes to `evidence.json`.

The ones that carry the weight:
- **XW-SAFE-SEQ and XW-SAFE-BITE together.** A monitor that reports zero faults is only evidence
  if it has been shown to catch faults. BITE requires it to kill six mutant controllers. That's the
  same discipline as the mutants files in both our tools.
- **XW-RULE-WAITCAP**, with the maximum recorded as a TPM. The spike's maximum is exactly 30.0 s,
  so it sits on the threshold with zero margin, and vv's TPM will show it as at risk. That is
  honest: the rule is designed to spend all of its slack.
- **XW-RULE-DATA.** The spike's rules are feasible by luck: 10 + 2 + 10 + 3 + 2 = 27 s of
  unavoidable sequence against a 30 s bound. Shorten the bound to 25 s and the rule promises
  something the lamps can't deliver. The controller must refuse it with the field named.
- **XW-FIELD** stays `unverified` in this lab, and the report must keep saying so.
- **XW-LEDGER-LABEL** (council round 2) makes the comparison tool print "synthetic street, not
  validated" on every figure while XW-FIELD is unverified. The tool carries the label, so no
  author has to remember it.

## What can be built and verified here, offline, with node

Everything except the street: the controller, the monitor, the watchdog, the rule schema and
feasibility check, the ledger, the common-random-numbers comparison, and a test runner that writes
`evidence.json`, so that `node tools/vv/cli.mjs . --check` is the gate. Of the 12 leaves, 11 can
reach `verified` offline. XW-FIELD cannot, by design. The mutant set for XW-SAFE-BITE is cheap to
write, and des's own mutation runner gives us the pattern.

## What it would take beyond this lab

- **The authority that owns the cabinet.** In the street, signal timing is set by the highway
  authority's traffic engineers under a national manual and local policy. A council or a
  residents' group can ask; it can't flash a controller. The realistic first deployment isn't
  control. It's this tool as the **ledger and the comparison**, fed from the existing controller's
  logs and put in front of the people who do decide. Control comes years later, if ever.
- **The manual's numbers, read, not remembered.** Design walking speed, minimum yellow and
  all-red, and how clearance is measured: I have figures in memory, and I won't put them in a
  requirement until someone has read the current manual for the jurisdiction. Every timing
  constant in the spike is a placeholder.
- **Certified hardware.** A real crossing has a conflict monitor in hardware and a fail-safe
  that doesn't depend on any software, ours included. Our watchdog is a second layer, never the only one.
- **Field data:** a week of press, detector and lamp logs from one real crossing (XW-FIELD), plus
  counts by hour. The ledger also needs a person-per-car figure measured on that road, not 1.3.
- **Someone to ask who isn't in the ledger yet.** Walkers who use wheelchairs, walk slowly, or
  never press because they've learned the button changes nothing: none of them show up as
  arrival rates. The design walking speed is itself a decision about who the crossing is for.

## Where I expect to be wrong

My habit is to treat "the rule was written for cars" as permanent, because it's structural. The
spike argues against me twice. The total doesn't move between car-first and gap-seeking. The
split does, and it moves through a better mechanism, not a victory of one side. So the arrangement
is more open than I assumed, if someone instruments it. Modulo will also say, rightly, that this
is a smaller physical stake than a vaccine fridge, and that its real customer (an engineering
office) may not want a ledger with a second column. That second point is the one I can't answer
from here: **who would be allowed to read the ledger, and would anyone with the key to the cabinet
act on it?** If not, we've built a mechanism that works and an arrangement that ignores it. That
is still worth knowing, and it's the kind of thing I'd want written down.
