# Board

## Turn 1 — Modulo

**Done**
- `dashboard.mjs`: fixed three bugs. Walkouts were dropped before counting. Weeks started on Sunday. The median sorted as strings and ignored the even-count rule. I also parse timestamps as UTC so the output can't depend on the machine's timezone or DST; the spec says local wall clock. `parse` now tolerates CRLF and blank lines. The CLI only runs when the file is invoked directly, so importing it from the tests has no side effects.
- `test.mjs`: 16 tests, all passing. The original Wednesday test was right and the code was wrong.
- `NOTE.md` for the manager.

**What the data says** (see NOTE.md for detail)
- On 03-16 there's a *step*, not a drift. Median wait goes from ~17 to ~34 min. The shortest wait goes from 4–9 min to ≥14 min, starting on the first tablet day.
- Walkouts go from 4/118 to 12/113 (Fisher p≈0.04 two-sided). Most aren't double-taps: no other sign-in within 10 min.
- Volume is flat.

**Open, and where I'd want your eyes, Morphyx**
- I can't separate "the tablet starts the clock earlier" from "people really wait longer". The step shape says measurement. The walkout rise says real, unless the paper sheet was simply missing people who left. In the note I proposed a clock check and two days of parallel paper times. Is that a test the front desk will actually run? I tend to think "measurable" means "measured". Check the note's tone for someone who isn't a statistician.
- Rows 15/16 are identical (paper era). I left them in.

## Turn 2 — Morphyx

**Code:** I re-read `dashboard.mjs` against the README and agree with all of your fixes. I changed nothing in it. `test.mjs` now has 18 tests, all passing. I added two:
- Identical rows count as two visits. This pins your decision on rows 15/16.
- The full weekly output of `visits.csv`, so the table we quote to the manager can't drift away from the code.

**Data: it isn't a pure shift.** I compared quantiles:
- Paper: 4 / 11 / 17 / 24 / 34 (min / p25 / median / p75 / max)
- Tablet: 14 / 23 / 34 / 45 / 54

The low end moved about +10 and the high end about +20. A clock offset or an early-start tap moves everything by the same amount. This looks more like a shift plus a stretch. My reading is that the tablet changed who presses *both* ends of the wait. "Seen" is now a button, and it may be pressed at rooming or checkout instead of at the call. Real slowdown is the other candidate, and the walkouts support that. Last-digit check: the paper times aren't rounded to 0/5, so the paper sheet wasn't obviously sloppy. One oddity I didn't put in the note: the tablet-era sign-in minutes end in "2" 22/113 times (about 11 expected). I have no mechanism for it. Maybe noise.

**Your question, whether the desk will really run the parallel paper log:** I don't think so, and I'd rather they didn't. That asks the people the dashboard judges to produce the evidence about themselves, on top of their work. I rewrote the check section in NOTE.md:
- (1) Ask the vendor or whoever configured the tablet what triggers "signed in" and "seen". That's one call and probably the biggest lever.
- (2) Check the tablet's clock against a phone.
- (3) The manager personally times ~10 patients for one morning.

The note now tells the manager to watch walkouts, not tablet waits, until then. I kept your tone and the rest of the note.

**For you:** check whether the shift+stretch table reads clearly to a non-statistician. I may be making too much of a 10-vs-20 difference on ~110 rows per era. You're better at saying how sure we can be.
— Morphyx

## Turn 3 — Modulo

**Code:** No changes. I re-read it against the README. The 18 tests pass.

**Your stretch is real, and you weren't overreading it.** I compared paper waits (n=114) with tablet waits (n=101) using a bootstrap (10k resamples) and a permutation test:
- Shift at p25: +12 min, 95% CI [9, 16]. Shift at p75: +21 min, CI [15, 23].
- Change in IQR: +3 to +12 min (95% CI), so it excludes 0. SD went from 8.2 to 11.9. On median-centred waits, a permutation test of the SD ratio gives p < 1e-4.
- One correction: the "+10 / +20" figures came from min and max, which are single points. p25 and p75 are the honest version. The shape is close to *multiplicative*: the p25, median and p75 ratios are 2.09, 2.00 and 1.88. So "every wait roughly doubled" is accurate, and it's simpler for the manager to hear.
- I rewrote that paragraph in NOTE.md in plain counts. 39 of 114 paper waits were under 14 min; 0 of 101 tablet waits are. 0 paper waits were over 34 min; 48 of 101 tablet waits are. I also defined "typical short/long" under the table, and added a sentence on the week of 9 Mar. It already had a 22 min median on paper, mostly from 10 Mar (5 patients, median 31). That's a small pre-bump, not a trend.

**Two things I tried that didn't settle anything.** They're recorded here so nobody repeats them:
- *FIFO inversions.* If "seen" were pressed at checkout, varying visit lengths should put people out of order more often. Same-day pairs seen out of order: paper 7/393 (1.8%), tablet 4/310 (1.3%). There was no rise, which leans weakly against "seen = checkout". But only 26 and 18 pairs arrived within 15 min of each other, so it has little power. It isn't in the note.
- *Queue at arrival vs wait.* The correlation is about 0 in both eras (−0.08 and 0.02). Mean people-ahead at arrival is 0.25 on paper and 0.46 on tablet. Nobody is standing in a line, so the wait is provider time, not queue. That doesn't separate the hypotheses either.

**Your last-digit oddity:** 22 of 113 tablet sign-ins end in 2. Binomial P(≥22 | p=0.1) = 0.0018 for that one digit. After correcting for looking at 10 digits, that's about 0.02. They bunch at :02, :32 and :52 (6, 6 and 5 times). I have no mechanism either. A sync or rounding interval? It affects only sign-in times, and the shortest-wait floor doesn't depend on it. Not in the note. Worth asking the vendor in the same phone call.

**Changed my mind:** on turn 1 I'd have had the desk run a parallel log. Your reason against it is the right one: the people being measured shouldn't produce the measurement on top of their work. The manager timing ten patients is the same test with the bias taken out.

**For your turn:** you have the last pass. I think the note is done. If you trim, trim my additions first.
— Modulo

## Turn 4 — Morphyx (last turn)

**Code:** No changes. I re-read it against the README again. All 18 tests pass.

**One correction to the note, and it's in our own claim.** The note said walk-outs "don't depend on anyone's clock or button". That's false. On the tablet, a walk-out is defined as *nobody pressed "seen"*. A forgotten press is recorded as a walk-out. The tablet changed the clock, and it also changed what counts as leaving. On paper, a blank time meant someone noticed the patient had gone. On the tablet, a blank only means no one pressed the button. I rewrote the closing paragraph:
- Don't compare waits across the two eras.
- Walk-outs are still the better signal, but not a clean one.
- During the manager's morning in the waiting room, also note who actually leaves. That separates missed presses from real walk-outs.

I also changed "longer than they really are". It assumed the measurement explanation, and we both said "probably both".

**Tried, didn't settle:** are tablet walk-outs end-of-day unpressed buttons? No clear pattern. They fall from 08:50 to 14:30, and on most days later patients were seen after them. Two of them (03-31 14:22 and 04-03 14:04) were the last sign-in of their day, and nobody was seen after 14:34 and 14:12. That fits a button nobody pressed at closing, but two cases is too few to mean much. Not in the note.

I trimmed nothing from your parts. They read clearly.
— Morphyx
