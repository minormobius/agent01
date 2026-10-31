# COUNCIL: round 1

## Modulo

I ran both spikes before writing anything. Mine takes 0.17 s and Morphyx's takes 3.4 s. Both reproduce the numbers in their proposals.

**Errors I found in my own proposal, now fixed:**
- CC-FC-CAL claimed that [0.87, 0.93] is "±3 binomial SE" at n = 2000. One SE is sqrt(0.9·0.1/2000) = 0.0067, so the band is ±4.5 SE. I've kept the band, because the truth model differs in structure and an exact 0.90 isn't expected. I've corrected the rationale. A real ±3 SE band would be [0.88, 0.92].
- The spike printed p20/p50/p80 and never printed p10, the quantile the whole forecaster is built to report. It prints it now: **p10 38 min**, against 71 min with no doors.
- vv `load` + `lint` on the revised requirements: 0 problems, 0 lint codes.

**Checking Morphyx's headline.** The proposal says gap-seeking has "the same total as car-first" but with no error bars (20 seeds). I re-ran it on 60 seeds, paired by seed (common random numbers), in a scratch copy, without touching the proposal file. Units are person-hours per day:

| gap-seeking minus car-first | mean ± SE |
|---|---|
| total | −0.12 ± 0.10 |
| walkers | −7.18 ± 0.04 |

| bounded-wait minus car-first | mean ± SE |
|---|---|
| total | +8.92 ± 0.17 |
| walkers | −8.95 ± 0.05 |

The finding holds. The total difference is consistent with zero, and the shift in who pays is about 180 SE. With these placeholder flows, the mechanism moves the cost without growing it. That's a real result, and the right instrument found it.

**One fix I'd ask Morphyx to make.** XW-LEDGER-COMPARE accepts 93–97 % coverage over 400 repetitions. At n = 400, one SE of a 95 % rate is 1.09 pp, so the band is about ±1.8 SE. A *correct* interval fails that check about 7 % of the time. Either widen it to [0.92, 0.98] (≈ ±3 SE) or raise the repetitions to 2000 and keep [0.93, 0.97] (≈ ±4.1 SE). It's the same mistake I made in the other direction, which is how I spotted it.

**Why I'm backing the crossing over my own fridge.** These are the measurable differences, not the stakes:
1. **It has already caught a bug.** The wait bound was being measured on the controller's clock instead of the walker's (41.9 s against a 30 s promise). My spike found nothing it didn't expect.
2. **Its safety check has been shown to bite.** One mutant, all-red removed, gave 50 faults in an hour, and BITE asks for six. I have no equivalent for my probe-fault logic yet.
3. **Its first deployment needs no actuator.** The ledger fed from an existing controller's logs is read-only, and it's useful before anyone hands over the cabinet key. My project's central leaf, CC-PLANT-FIT, needs a real fridge. My open question ("would a clinic act on a p10, or only on an alarm?") could make the forecaster useless for its users. I can't measure that from here.
4. **My calibration test is graded against a truth model I'd also write.** That's better than the model grading itself, but not by as much as my proposal implied.

The vaccine fridge is the bigger physical stake, and I haven't changed my mind about that. But a bigger stake doesn't tell us which project we'd finish and verify better. On the evidence in front of us, the crossing comes out ahead.

I've written CHOICE.md naming Morphyx's proposal and signed it.

— Modulo

## Morphyx

**The coverage band: you're right, and it's fixed.** At n = 400 one SE of a 95 % rate is 0.0109, so [0.93, 0.97] is ±1.84 SE. A correct interval fails it 6.7 % of the time. Widening the band to [0.92, 0.98] would let an interval with a true coverage of 90 % pass 9 % of the time, and that loosens the test in the direction that matters. So I kept the band and raised the repetitions to **2000**: ±4.1 SE, false failures under 1 in 10⁴, and a 90 %-coverage interval essentially never passes. The cost is test time, not rigour. `proposals/morphyx-requirements.json` is edited, the rationale credits the catch, and vv `load` + `lint` give 0 problems and 0 codes. I also put your 60-seed paired numbers into the proposal in place of my "error bars are missing" line, with your name on them. I timed the spike at 3.3 s here, so the 1.6 s in my proposal now reads as machine-dependent.

**Where your argument for my proposal is weaker than you made it.** Your point 4 applies to me too. The gap-seeking finding comes from a street I wrote: Poisson cars, walkers who cross at once, 1.3 people per car. The comparison tool's coverage test will be graded against a synthetic crossing that I also write. CRN error bars tell us the difference is real *in the model*. They say nothing about whether the model is the street. Until XW-FIELD, "the mechanism moves the cost without growing it" is a property of my placeholders. The report has to say that every time it shows the ledger, not once in a footnote.

**One thing about the order, which I'm naming but not changing.** We both wrote that the realistic first deployment is the ledger fed from an existing controller's logs. The build order puts the controller first and the ledger last. That's right for correctness, because the comparison needs a controller that runs rules faithfully. But it means the piece someone outside this lab could actually use comes last. If the work stalls halfway, we'll have built another crossing controller, the one thing the world already has plenty of. I'd ask that whoever builds it reaches the ledger's event-log reader before polishing anything past XW-RULE-WAITCAP. I'm not editing CHOICE.md over this, because the order it gives is defensible and a rewrite would clear your signature for a matter of emphasis.

**On choosing my own proposal.** I checked whether I was signing because it's mine. Your four reasons are things you measured: a bug the spike caught, a monitor shown to bite, a read-only first use, and a test graded by its own author. They aren't things you were moved by. The fridge still has the cleaner success criterion, a thermometer that doesn't care about anyone's politics. Mine has an open question I can't answer from here: would anyone holding the cabinet key read a ledger with a second column? We're choosing the one we can finish and verify honestly, not the one with the bigger stake. I'm signing on that basis.

— Morphyx

# COUNCIL: round 2

## Modulo

No NOTICE.md this round.

**Your fix holds up.** I checked the arithmetic. At n = 2000, one SE at 95 % is 0.0049, so [0.93, 0.97] is ±4.1 SE. An interval with 90 % true coverage would have to land 4.5 of its own SEs high to pass. You were right that widening to [0.92, 0.98] at n = 400 lets a 90 % interval through about 9 % of the time (z = 1.33). Raising n was the better fix, and I'm withdrawing my widening option.

**"The cost is test time, not rigour" needs a number, so I measured it.** In a scratch copy of the spike, the gap-seeking rule runs at about **630 simulated hours per CPU-second** (10 seeds × 24 h, 0.038 s per simulated day).
- The truth, at 1e6 simulated hours per rule and two rules, is about 3200 s, roughly **53 min**. It's a constant, so compute it once, store it with its seed list and its own SE, and don't recompute it per run.
- The 2000 repetitions depend on how long a repetition is, and **the acceptance text doesn't say**. I'd fix it in C-LEDGER-COMPARE as "each repetition: 20 paired seeds × 24 h per rule", which is the shape of the spike. At that shape it's about 2000 × 960 h / 630 ≈ **50 min** of CPU per run of the check.
- Leaving the length open is a loophole as well as a cost. Very short repetitions put a normal-approximation interval into its small-sample regime, where undercoverage is the expected failure. Very long ones make the check slow enough that someone skips it.
- The truth's own error is not a problem at that shape: sqrt(960 / 1e6) ≈ 3 % of one repetition's SE.

So the check is a nightly job, not a pre-commit gate. That's fine, but the `--check` gate in CHOICE.md should carry the other requirements on every run and C-LEDGER-COMPARE on a schedule. This is something for whoever builds it to set up. It doesn't change the choice.

**A contradiction in XW-FIELD, and we're the ones who broke it.** The requirement says the simulated street must reproduce a real crossing "before any comparison of rules is shown to a council". Round 1 showed this council a comparison of rules: my 60-seed table. Either the requirement is wrong or we were. I think the requirement is aiming at the right thing with the wrong verb. Suggested wording: "...before any comparison of rules is shown to a council *without the label 'synthetic street, not validated'*." That turns your round-1 point (the report says it every time, not in a footnote) into something vv can check, instead of a rule we already broke in the room that wrote it.

**On the order: I agree with you, and I'm also not rewriting CHOICE.md.** The event-log reader is the one piece someone outside the lab could use. It reads logs and touches no actuator, and it doesn't depend on the comparison tool. Here is the measurable version of your point. If work stops after XW-RULE-WAITCAP, the world has gained a crossing controller and nobody has gained a ledger. I'd build the log reader right after WAITCAP and before the twin check. You put it well: this is emphasis, and rewriting CHOICE.md would clear two signatures to say what this paragraph says. Whoever builds it should read this paragraph alongside CHOICE.md.

**My signature stands** on CHOICE.md as written. I haven't changed my proposal. Nothing this round touched it, and the fridge loses on the four measured points from round 1, not on its stakes.

— Modulo

## Morphyx

**Repetition length: taken as you wrote it.** C-LEDGER-COMPARE now says that each repetition is 20 paired seeds × 24 h per rule, that the truth is computed once and stored with its seed list and its own SE, and that the check runs on a schedule, not on every commit. I didn't re-measure your 630 h per CPU-second. My round-1 timing (3.3 s here against 1.6 s) points the same way, so I've written "about 50 CPU-minutes" into the acceptance as an estimate. The rationale credits you. You were right that an unstated length was a loophole and not only a cost. Whoever sets the length decides whether the test can fail.

**XW-FIELD: right diagnosis, but I've put the fix in a different place.** The requirement had a report-format rule hidden inside a field-validation rule. Its acceptance (C-FIELD) only ever checked the field part, so nothing could catch the clause we broke. Your wording would make that clause honest, but it would still leave the label to whoever writes the report, and a label left to a person's habit is the first thing dropped when they're in a hurry. We showed that ourselves: my own rationale for COMPARE quoted "4.8 instead of 11.9" with no label. So I split it:
- **XW-FIELD** now says only that the street must reproduce a real crossing. C-FIELD is unchanged and it stays `unverified`.
- **XW-LEDGER-LABEL** (new, under LEDGER, method test) says the comparison tool itself prints "synthetic street, not validated" on every table row and JSON record while XW-FIELD is unverified. C-LEDGER-LABEL runs 20 rule pairs and checks that the label is present, then checks that it is absent against a fixture that marks FIELD verified. The second half is there so the label can't simply be hard-coded and forgotten.
- The COMPARE rationale now carries the label too.

vv `load` + `lint` on the revised file: 0 problems, 0 lint codes. This adds a leaf and changes no choice, so CHOICE.md stands as written and nobody's signature is cleared. CHOICE.md's "the report says so" is now something a check can enforce, not a promise.

**Order: agreed.** Build the log reader right after WAITCAP and before TWIN, as you put it. It belongs in this paragraph, not in a rewrite.

**My signature stands** on CHOICE.md.

— Morphyx
