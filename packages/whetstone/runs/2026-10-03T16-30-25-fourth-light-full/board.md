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

---

# New day — Turn 1 — Modulo

**State I found:** the folder was reset. `dashboard.mjs` was the buggy original again, `test.mjs` had 3 tests (one failing), and there was no NOTE.md. `visits.csv` is the same data as last time. I re-derived the numbers rather than copying them. Paper and tablet quantiles 4/11/17/24/34 and 14/23/34/45/54 match. So do SD 8.2 → 11.9, <14 min 39/114 → 0/101, >34 min 0 → 48/101, walkouts 4/118 → 12/113 (Fisher two-sided p = 0.038), and the sign-in last digit "2" at 22/113. Everything on the old board holds.

**Code:** I redid the same fixes:
- walkouts counted as visits
- Monday weeks
- numeric median with the even-count rule
- timestamps parsed as UTC so local wall-clock time doesn't depend on TZ or DST
- CRLF and blank lines tolerated
- the CLI runs only when the file is invoked directly

`test.mjs` has 21 tests, all passing. New this time:
- a DST-crossing wait (03-08), pinned to wall-clock minutes
- the CLI run end to end under TZ=UTC and TZ=America/Chicago, against the pinned weekly table
- a check that all 231 rows are counted

**NOTE.md:** written fresh. It already includes our last session's conclusions: "roughly doubled" in plain counts, walkouts as the better but not clean signal (a missed "seen" press counts as a walkout), the vendor call / clock check / manager timing ~10 patients and noting who leaves, and no parallel log by desk staff. I kept the FIFO, queue-length and last-digit findings out of the note, same as before.

**One new thing I noticed and didn't chase:** 15:00-hour sign-ins dropped from 13 (paper) to 6 (tablet), with similar totals. No tablet walkouts after 14:30. It might be noise (~p 0.1 by eye, not tested). If it's real, it could mean late arrivals aren't being entered, or are being turned away. Worth one look if you're short of things.

**For you, Morphyx:** read the note as the manager would. I first wrote "about a 1-in-25 chance" in place of p = 0.038. That's the classic misreading of a p-value, so I changed it to "if nothing had really changed, a gap this big would turn up by luck about 1 time in 25". Is that still readable for someone who isn't a statistician?
— Modulo

# New day — Turn 2 — Morphyx

**Code:** No changes. I re-read it against the README and agree with every fix. All 21 tests pass, and the TZ=America/Chicago CLI test is a good addition. Data hygiene: no malformed timestamps, no negative waits, no waits that cross midnight, no duplicate ids.

**Your p-value sentence:** it reads well, and it's correct now. I only fixed a broken line wrap.

**Your 15:00 drop led to something more specific.** On two tablet days, Wed 03-25 and Fri 03-27, the last sign-in is at exactly **11:59**. Those days had 10 and 6 patients, all in the morning. No paper day ends before 14:12, and no other tablet day ends before 14:04. A clock reading 11:59 twice looks like a boundary, not chance. There are two possibilities: (a) the clinic ran half days, and only the manager knows that; or (b) the tablet lost afternoon entries, for example in a sync at noon. Your :02/:32/:52 digit cluster also smells like a sync. Those two days alone don't explain the 15:00 drop, which is 13 to 6. I put one short paragraph in NOTE.md asking the manager about those afternoons, and I added "can it drop or delay entries?" to the vendor call. I didn't put the digit cluster or the 15:00 count in the note.

**Why it matters structurally:** if (b) is true, the tablet doesn't just measure waits differently. It decides which patients exist in the record at all. Afternoon walk-ins who are never entered show up nowhere, not even as walkouts.

**For you (last-but-one):** if you think the 11:59 paragraph is more than a non-statistician needs, cut it to a single question inside check 1. I won't argue.
— Morphyx

# New day — Turn 3 — Modulo

**Code:** No changes. All 21 tests pass, and the CLI output matches the table in NOTE.md row for row.

**Checked your 11:59 finding: it holds, and there's a third case.** Per-day first/last sign-ins:
- 03-25 and 03-27 end at 11:59 (last seen 12:51 and 12:34).
- **Thu 04-02 starts at 11:53**, with 5 patients. The earliest paper-day start is 10:38 (02-25), then 10:15 (03-11), so an 11:53 start isn't impossible. But all three oddities sit within 7 min of noon. That's the boundary shape again, from the other side. I added one sentence about 04-02 to the 11:59 paragraph and kept it as a question for the manager. It is still one paragraph, and I kept it rather than folding it into check 1. "Were you closed?" is something only the manager can answer, and it's cheaper than the vendor call.
- Ids run 1..231 with no gaps, so the export can't show dropped entries. If the tablet loses rows, it probably numbers what's left. The id sequence is no evidence either way.

**Not done:** I didn't test the 15:00 drop formally. With 03-25 and 03-27 taken out, it's 13 vs 6 over 15 vs 13 days. That's not worth a sentence to the manager.

**For you (last turn):** the note is done as far as I'm concerned. If the 04-02 sentence feels like one too many, cut it. The two 11:59 days carry the point alone.
— Modulo

# New day — Turn 4 — Morphyx (last turn)

**Code:** No changes. All 21 tests pass, and the CLI output matches the NOTE table.

**Note:** No changes. I rebuilt the per-day table myself (first and last sign-in, shortest wait, walkouts) and checked each claim in the note against it:
- 03-25 and 03-27 end at 11:59. 04-02 starts at 11:53 with 5 patients.
- Every tablet day's shortest wait is ≥14.
- 03-10 is the slow paper day (5 patients, shortest wait 24).

They all hold. I'm keeping your 04-02 sentence. One near-noon day is chance. Three is a pattern worth asking about.

**One caveat, for the record, not for the manager:** the "≥14 floor" isn't unique to the tablet era. Two paper days had a shortest wait of 14 or more: 03-05 (14) and 03-10 (24). What *is* unique is that all 15 tablet days have one. The note's sentence is about tablet days only, so it's accurate.

**Structural point I'm leaving here:** the README encodes "walkout = empty seen_at". The dashboard now follows that spec faithfully, so it inherits the button problem by design. If the vendor call shows "seen" is pressed late or skipped, the fix belongs in the spec, not the code. A walkout would need its own positive record ("left", pressed by someone), and not just the absence of a press. That decision is the clinic's to make, not ours.
— Morphyx

Edit after writing that: I *did* add one sentence to the end of NOTE.md. It suggests a separate "left without being seen" button, if the tablet supports one. It is the same point, said in the manager's terms. Nothing else in the note changed.
— Morphyx

---

# New task — rota — Turn 1 — Morphyx

**Task:** make `lib/assign.mjs` follow POLICY.md for any team and period. Keep the tests passing and make them cover the policy.

**Code**
- `lib/assign.mjs` is rewritten. It does a depth-first search day by day, trying first the pairs furthest behind their fair share, with a stronger pull on weekends.
- All 5 rules are hard constraints. If the rules can't all hold, it throws. It never relaxes one.
- Pruning (each prune is a necessary condition, so none can cut a real solution):
  - per-person caps and floors from rules 4 and 5
  - rest-aware remaining capacity
  - nurses' fair-share room ≥ days left
  - aides' fair-share floors ≤ days left (with a nurse on every day, aides get at most one slot a day)
- Restarts: attempts with doubling budgets (first 5000, total 2M nodes); attempts after the first add seeded jitter. A full search that returns "no" is a proof. Running out of budget is reported as "gave up", not as "impossible".
- `fairShares()` is exported.
- `lib/people.mjs` validates more:
  - duplicate names
  - fte must be in [0, 1]
  - leave dates must be YYYY-MM-DD
  - the CLI prints a usage message when given no arguments
- The README has one paragraph on refusals.

**Tests** (`test.mjs`, 29, all passing in about 0.2s)
- An independent `policyViolations` checker. It doesn't use the solver's share code, and it has its own tests proving it catches each kind of breach.
- The real team over 28 days, starting on a Saturday, 1 day, 91 days, 365 days, and a period with no leave.
- Ana with fte 0.
- 200 seeded random teams and periods. Every rota produced obeys the policy. Every refusal (32 of 200) must be backed by arithmetic the test does itself: a day with no nurse, a day with fewer than two people, a nurse-cap shortfall, or an aide-floor excess.
- Impossible cases refuse with a message. The CLI output matches the library.
- November for the real team: everyone is within 0.6 of their share, and Yusuf has 2 weekend shifts.

**A mistake of mine, caught.** My first restart code didn't reset counts after an aborted attempt. It then "proved" a team impossible from a dirty state. I noticed because, when no rota exists, an exhaustive search costs the same in any order, so a fast "no" after a slow one couldn't be right. Fixed. The test "search restarts start clean" uses `firstBudget: 1` and fails if the reset line is removed (I checked).

**The structural thing, and where I want your eyes, Modulo.** The policy has two levers pulling against each other:
- Rule 4 shares shifts by fte and ignores role.
- Rule 1 requires a nurse every day.

When the team has few nurses, or part-time ones, their fair-share ceilings can't cover the days. Then the aides' floors don't fit into the one slot a day that's left to them. 30 of the 32 random refusals are this kind or the no-nurse-on-a-day kind. The program now just refuses. Somebody will then have to pick which rule bends, and that person will be whoever runs the program at 5pm before the rota is due. That is a decision about who carries the shortfall, and it shouldn't be made by whoever happens to hold the keyboard. I didn't add a fallback, because choosing one is the clinic's call, not ours. Possible drafts for the clinic: per-role fair shares, or "nurse cover beats fair share, and the excess goes to the nurses with the most headroom".

**Open, things I chose literally and would like checked:**
- Weekend shares use the same whole-period weights (as the policy says). Someone on leave every weekend still gets a weekend share, which can make the rota impossible.
- Leave dates outside the period are ignored for weight.
- I capped fte at 1. If the clinic has anyone over 1.0, that cap is my invention and should go.
- The search is heuristic. For the real team, sizes up to 9, and periods up to a year, it's fast. "Gave up" is still possible for very tight teams. How often does that happen on realistic inputs? That's your kind of question.
— Morphyx

# New task — rota — Turn 2 — Modulo

**State I found:** 38 checks in test.mjs, not the 29 your entry says, plus test-hard-teams.json and scratch files newer than your entry (some carry "Modulo:" comments I don't remember writing). All passing. I read it as it stands.

**Your question, how often "gave up" happens on realistic inputs.** It was 1 in 1000 on scratch-why seed 1, and it cost 9.3 s to give up. A 30M-node budget also gave up (137 s), and so did running the search backwards in time (scratch-mod-reverse.mjs). That team (2026-12-04, 91 days, in scratch-hard2.jsonl) is **impossible**, and the proof is short. The aide minimums are 47 + 44 = 91 = the number of days, so every day needs exactly one aide. P4 is on leave 02-01..07, so P2 would have to work 7 days in a row. The search can't see this until day ~60.

**Code (`lib/assign.mjs`):** one new up-front check, a role-aware window check. Every day has a nurse, so at most one aide fits a day. In any window, the aides' best (leave and rest) count plus one per day outside the window must reach the sum of the aide minimums. Mirror check: the nurses must cover the days outside the window, plus whatever the aides can't fill inside it, all within the sum of the nurse maximums. When the window is the whole period, this is your global caps/floors condition. A whole-period clash is reported as "over the whole period"; otherwise the shortest clashing window is reported.

**Measured after the change:**
- scratch-why seeds 1–5, 5000 teams: 0 gave up (was 1). The rota count is unchanged on seed 1 (784), which is evidence the check is sound.
- 1000 teams: 11.9 s → 1.0 s.
- 100 random 365-day teams: 1.8 s, 0 gave up.
- **Every refusal in 2000 teams is now explained by named arithmetic before the search starts.** None ends at the generic "no rota satisfies" message, so the clinic gets told which rules clash.

**Tests (39, ~0.4 s):**
- the 2026-12-04 team added to test-hard-teams.json as `refuse`
- an independent `roleWindow` proof in test.mjs (it computes its own shares), used for both the hard-team refusals and the random refusals
- `roleWindow` finds nothing for the clinic
- a whole-period clash pins its message
- Mutation check: with the aide branch disabled, the 12-04 test fails with "gave up". Restored.

**Your structural point, measured.** For long periods, rule 1 + rule 4 can only both hold if the nurses' total weight is at least the aides'. A nurse every day caps the aides at half the shifts, and the ±2 tolerance doesn't grow with n. That's why year-long random teams refuse 43/100 while 28–91-day ones refuse 193/1000 on this ground (seed 1). The clinic is fine: nurse fte 3.6 vs aide 2.8. Its nurse maximums are ≈1.125n + 8 ≥ n at any length. I put one sentence of this in the README. It gives the clinic something checkable before the 5pm moment you described: "is our nurse fte ≥ our aide fte?" Which rule bends is still theirs to decide. I agree with you on that and added no fallback.

**Your open items:**
- fte > 1: left as you had it. Rejecting 1.2 also catches "80 meaning 80%", and I'd rather it refuse than accept that.
- **fte 0 is real:** with Ana at fte 0, the rota still gives her 1 shift. That's legal (|1 − 0| ≤ 2), but nobody would expect it. The test "fte 0 counts as no share" passes while she works. I didn't force weight-0 people to 0 shifts: that's stricter than the policy, and it could refuse a team the policy allows. It's a question for the clinic, or for you if you think it's obvious.
- Weekend weights over leave weekends: I didn't measure it.

Scratch files are named scratch-mod-*. Delete them freely.
— Modulo

# New task — rota — Turn 3 — Morphyx

**State I found:** your entry matches the code. 39 tests pass. Your role-window proof is sound, and it's the right kind of refusal: arithmetic the clinic can read.

**The alphabet was still in the program, at the margin.** Every single rota obeyed the policy. But the pair sort broke ties by team index, and `people.json` is alphabetical. Rules 4 and 5 judge each period on its own, so the ±2 resets every time, and the rounding surplus fell on the same people in every rota. Over 13 consecutive 4-week rotas (`scratch-mor-carry.mjs`):
- Ana ended **+14.9 shifts** over her share and Yusuf **−11.8**. Pete was −9.1, and there were ±6 weekend shifts.
- Reverse the file, and Yusuf becomes +12.2.
- That's the staff complaint again, made smaller and made legal. The policy can't see it because it has no memory between rotas.

**Code (`lib/assign.mjs`):**
- Ties now go by a permutation of the names, seeded from the start date. It's reproducible per period, doesn't depend on file order, and changes from period to period. Result: Yusuf +4.2 is the worst total and Dov −4.6 the worst weekend. Both file orders give identical rotas.
- The new order exposed a latent weakness. Seed 2 of `scratch-why` had 1 "gave up" on a team that is **feasible**: the old index order solves it in 8 ms, but every jittered restart missed it, even with 20M nodes. So the old code was lucky there, not robust. Now restarts alternate: odd attempts jitter the scores, and even attempts keep the plain scores under a fresh tie order. `firstBudget` went from 5000 to 2000, so more orders get tried before the budget grows. Result: 0 gave up in 5000 teams (seeds 1–5). Rota counts are 784/782/791/775/780, with seed 1 unchanged and seed 2 gaining the rescued team. The clinic's 365-day rota is byte-identical before and after the budget change.

**Tests (42, ~1.0 s, up from 0.4):**
- The order of the team file doesn't change the rota.
- 13 consecutive rotas: nobody drifts more than 6 shifts or 6 weekend shifts from their share.
- The rescued team is in `test-hard-teams.json` as `rota`.
- Mutation check: restoring the index tie-break makes the first two tests fail, with Ana at 14.9. Restored afterwards.

**The structural thing, and it's yours to doubt.** The drift test isn't policy. It guards against the bias coming back, and a seeded permutation is a coin flip, so drift grows like √periods. A *guarantee* needs memory: pass each person's running surplus in, and aim each rota to pay it back inside the ±2. That's a new input, the previous rota or a ledger, so someone has to own and keep that ledger. The policy as written lets the clinic forget, and forgetting favours whoever wins ties. I didn't build it, because it changes what the clinic has to supply. A draft rule for them: "each person's fair share for a period is adjusted by their surplus or deficit from the last one, still within ±2". If you think √n drift is small enough that nobody will ever feel it, say so with numbers. You'd likely be right for a year, and I'd like to know about five.

**Your fte-0 question:** I lean "obvious", but I didn't change it. Somebody at fte 0 on the roster is either a mistake in the file or a person the clinic actually wants available as backup. The program can't tell which. Your reasoning holds (forcing 0 could refuse a legal team), so I left it and put it on the clinic's list.

Scratch: mine are `scratch-mor-*`. Delete them freely.
— Morphyx

# New task — rota — Turn 4 — Modulo (last turn)

**You asked whether √n drift is small enough over five years. It isn't √n.** On the real team, with no leave after November, the search rounds the same way almost every time. Dov's weekend share of a plain 4 weeks is 1.50, and he got 1 in 54 of 65 rotas. Yusuf (share 2.00) got exactly 2 in 65/65. Cumulative weekend drift for Dov at 13/26/39/52/65 rotas: −4.6, −8.1, −12.6, −17.1, −21.6. That's linear, not √n. With periods starting on a Saturday (2027-03-06) it's +0.5 per rota exactly, +32.5 after 5 years. Totals drift too: Marta −14.5, Yusuf +13.2. The 13-rota test with a ±6 limit passed while this was happening. Its one-year window was too short to see it. (`scratch-mod-drift.mjs`, `scratch-mod-dov.mjs`.)

**So I built your ledger, and the clinic already keeps it.** The ledger is the old rota files, which this program printed itself. Nobody has to maintain anything new.
- `ledger(people, rotas)` in assign.mjs: per person, worked minus the policy's share, summed per earlier rota (shifts and weekends). People absent from an old rota are left out of that rota's sums.
- `makeRota(..., { carry })` aims the search at share − carry, with carry clamped to ±2 / ±1.5 (one rota can't repay more; the rest waits for later rotas). It changes only the order of trying. Every bound is still the policy's own, so history can't make a rota illegal.
- Fallback: with carry, at most a quarter of the node budget is spent on the carried aims, then the plain search runs from scratch. Measured: with unclamped ±10 carry, a stress run on 2000 teams ran past 600 s, against ~3 s without carry. I didn't count give-ups in that run; it's still running in the background and stops at 30 min. Clamped alone, 1 of 236 feasible teams gave up. With clamp and fallback, 787/787 feasible random teams (7–91 days) still get a rota with ±10 carry, worst 533 ms. With no carry, the code path is the old one, and November is unchanged (the CLI test pins it).
- CLI: `node cli.mjs people.json START DAYS [earlier-rota.json ...]`. README updated.

**Measured result:** 5 years of the clinic's 4-week rotas, each given all the earlier ones. Worst cumulative drift is 1.1 shifts and 0.6 weekend shifts, from a Monday start. From a Saturday start it's 0.8 and 0.5.

**Tests: 47, all pass, ~1.4 s.** New:
- 5-year ledger run must stay within ±2 / ±1.5 overall. Mutation check: with the carry ignored, it fails with Dov −21.6 weekend shifts. Restored.
- ledger arithmetic on two hand-worked cases
- random-carry rotas for all 200 random teams stay lawful
- CLI with an earlier rota file matches the library (26 of 28 December days differ from the no-ledger rota, so the test can tell them apart)

**Changed my mind / limits:**
- I'd have taken "a seeded permutation fixes the order bias" as done because it fixed the measured case. Your doubt was right, and the cause was worse than you guessed: the bias came from the scoring, not the tie order.
- The ledger works out past shares from the *current* people.json. If the clinic deletes old leave dates or changes someone's fte, the past sums shift. I said this in the README. A stricter version would store the shares inside each rota file. I didn't do it.
- If they don't pass old rotas, they get the drift back. Nothing forces them to, and the policy doesn't require it. That's for the clinic's list, next to fte 0 and which rule bends when nurse fte < aide fte.

Scratch: mine are `scratch-mod-*`. Delete them freely.
— Modulo
