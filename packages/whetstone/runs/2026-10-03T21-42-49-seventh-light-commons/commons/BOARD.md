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

---

# Clinic again (third time) — Turn 1 — Modulo

**State I found:** reset again. `dashboard.mjs` was the buggy original, `test.mjs` had 3 tests (1 failing), there was no NOTE.md, and `visits.csv` was unchanged (231 rows, ids 1..231, no CR, no malformed rows). I re-derived the numbers in `scratch-mod-check.mjs` and `scratch-mod-fisher.mjs` rather than trusting the board. These all hold: quantiles 4/11/17/24/34 → 14/23/34/45/54; <14 min 39/114 → 0/101; >34 min 0 → 48/101; walkouts 4/118 → 12/113 (Fisher two-sided 0.038); 03-25 and 03-27 end at 11:59; 04-02 starts at 11:53; 03-10 is 5 patients with median 31.

**Code:** same fixes as before. Walkouts are counted, weeks start Monday, the median is numeric with the even-count rule, wall-clock times are parsed as UTC so TZ/DST can't leak in, CRLF and blank lines are tolerated, and the CLI runs only when invoked directly (with a usage message if there's no argument). **New:** timestamps are validated against `YYYY-MM-DD HH:MM`, and a malformed one throws. My own test caught that a bad `signed_in` on a walkout row used to pass silently, because it was never subtracted.

**Tests: 22, all pass, under both TZ=UTC and TZ=America/Chicago.** They include the pinned weekly table, the CLI end to end in two zones, a DST-crossing wait (03-08), a year-crossing week start, an all-walkout week (median null), identical rows counted twice, and the malformed timestamp.

**NOTE.md:** rewritten fresh and shorter than last time. It keeps the agreed conclusions: roughly doubled on day one; don't compare across eras; walkouts are the better but not clean signal; the three noon-boundary days as a question; the three checks, none by desk staff; and the "left without being seen" button. As before, I left out FIFO, queue length, the last digit "2", and the 15:00 drop.

**For you, Morphyx:** read the note as the manager. One thing I'm unsure of: I put "dashboard was wrong, fixed now" first, so the manager's first takeaway is "the old numbers weren't trustworthy" before "waits doubled". Is that the right order for someone whose staff have been complaining the numbers look wrong?
— Modulo

# Clinic again (third time) — Turn 2 — Morphyx

**Code:** no changes. I re-read it against the README and agree with every fix, including the timestamp validation. All 22 tests pass under both UTC and America/Chicago. The CLI output matches the NOTE table row for row.

**Your question about order: it was worse than an ordering problem, so I changed the opening.** I rebuilt what the *old* dashboard would have shown: walkouts dropped, a lexicographic sort, middle element only. Weeks start Sunday too, but that's harmless because every visit is Mon–Fri.
- Old dashboard, paper weeks: 23 / 21 / 27. Correct: 17 / 16.5 / 22. Single-digit waits sort after "3x" as strings, which pushes the median up. Only paper weeks have single-digit waits.
- Old dashboard, tablet weeks: 31 / 33 / 39. That's identical to the correct values, because every tablet wait is ≥14 (two digits).
- So the bug *understated* the jump: it showed roughly 23→34, when the truth is 17→34. Leading with "it was wrong, now fixed" would let the manager think the high tablet numbers were the bug. They weren't. The new opening says the doubling is real in the records, the bugs hid part of it, and the staff were right that something changed at the switch. I also dropped the Sunday-week bug from the note, since it changed nothing in this data. The rest of the note is untouched.

**Structural point:** the staff complaint was aimed at the dashboard, because that's the thing on the wall. The dashboard was the visible face of the change, but the cause was the tablet's definition of "signed in", "seen" and "walked out". Fixing the code makes the complaint *louder*, not quieter. The manager should hear that before a vendor or IT person tells them "the dashboard bug was fixed" and treats the case as closed.

**For you (turn 3):** check that my new first paragraph isn't too long for someone reading it at the front desk. If you trim it, keep the sentence "the bugs did not cause that jump. They hid part of it."
— Morphyx

# Clinic again (third time) — Turn 3 — Modulo

**Code:** No changes. All 22 tests pass. The CLI output matches the NOTE table row for row.

**Checked your old-dashboard reconstruction. It holds.** `scratch-mod-old.mjs` uses a string sort, takes the upper-middle element, drops walkouts, and starts weeks on Sunday. Paper weeks come out 23 / 21 / 27 and tablet weeks 31 / 33 / 39, exactly your figures. Taking the lower-middle element or averaging the two middle elements moves those by at most 1. So the "21–27 instead of 17–22" sentence holds whichever even-count rule the original code had. Your reordering was right: "fixed now" first would have read as "the high numbers were the bug".

**Note: I trimmed the first paragraph from 9 sentences to 6.** I kept "the bugs did not cause that jump. They hid part of it." word for word. I cut the explanation of why the sort went wrong (single-digit waits sorting as strings). The manager needs the effect, which is that paper weeks looked slower than they were, not the mechanism. The mechanism is on this board if anyone asks. Nothing else in the note changed.

**For you (last turn):** I think the note is done. One thing for you to judge: "Short waits and long waits doubled too" sits above two bullets that are counts against fixed thresholds, not doublings. The p25 and p75 ratios are 2.09 and 1.88, so the sentence is true, but the bullets don't show it directly. Reword it if it bothers you. I left it.

Scratch: `scratch-mod-*`. Delete freely.
— Modulo

# Clinic again (third time) — Turn 4 — Morphyx (last turn)

**Code:** No changes. All 22 tests pass under both UTC and America/Chicago, and the CLI output matches the NOTE table row for row.

**Your "doubled too" sentence:** you were right that the bullets didn't show it, so I reworded it. The sentence now gives the quarter points: the quickest quarter waited up to 11 → up to 23, and the slowest quarter waited 24+ → 45+. Those are p25 and p75 straight from the data, and I recomputed them myself. "In counts:" then introduces your two threshold bullets, which stay as they were. Nothing else in the note changed.

**Cleanup:** I deleted the three `scratch-mod-*` files, as you offered.

**For the clinic's list, the same as the last two days:** the README defines a walkout as an empty `seen_at`. The code follows that faithfully, so the dashboard inherits whatever the tablet's button habits are. If the vendor call shows that "seen" is skipped or pressed late, the fix belongs in the spec, as a positive "left" record. It doesn't belong in our code.
— Morphyx

---

# Rota again (second time) — Turn 1 — Morphyx

**State I found:** reset. `assign.mjs` was the alphabetical original, with 5 tests. I rebuilt from what this board says we learned last time, not from memory of the code.

**Code**
- `lib/assign.mjs`: depth-first search, day by day. It tries the pairs furthest behind their share first. All 5 rules are hard, and prunes use only necessary conditions (rest-aware caps, two-a-day sums, nurse room ≥ days left, aide floors ≤ days left, the same for weekends). Ties go by a name permutation seeded from the start date. The team is sorted by name first, so the file's order can't matter. Restarts: alternating jitter/plain, budgets doubling from 2000, 2M nodes total. "Gave up" is kept separate from "impossible". Up-front refusals name the clash: no nurse on a day, fewer than two people, a person's floor vs their leave/rest, nurse caps < days, aide floors > days, and the sum/weekend sums.
- **Ledger, built on day one this time**, because on the rebuild I measured the same thing you found last time. 65 plain rotas: Yusuf −50.8 shifts, Dov −31.6 weekend shifts, all lawful. `ledger(people, rotas)` → `makeRota(..., { carry })`: the aim is share − carry, clamped to ±2/±1.5. It changes only the order of trying, and at most a quarter of the budget goes to it. CLI: extra args are earlier rota files. With the ledger, 5 years have a worst drift of 1.1 shifts / 0.9 weekend shifts (Monday start), and 1.0/0.5 from a Saturday.
- `people.mjs`: duplicate names, fte in [0,1], YYYY-MM-DD leave, role. The CLI prints usage.

**A bug of mine the tests caught:** `dfs` accepted day n without checking that the last day met everyone's minimum (`feasibleFrom` allows "need 1, can still work 1" on the final day). Plain scoring never tripped it in 143 random rotas. Random ±10 carry tripped it 27 times out of 53. Fixed (`if (d === n) return feasibleFrom(n)`). The brute-force test now also checks the solver's own rotas for lawfulness.

**Tests: 51, ~0.7 s.** They include an independent `policyViolations` checker (with its own tests for each kind of breach); the clinic at 1/28/91/365 days and from a Saturday; the staff complaint (Ana not every day, Yusuf gets weekends, everyone within 1 of share in November); file-order independence; fte 0; validation; 200 random teams (all rotas lawful, no "gave up"); **brute force on 150 tiny teams (the solver refuses exactly when exhaustive enumeration finds nothing)**; pinned nurse-cap and aide-floor messages; 13 rotas with the ledger staying within 2/1.5; random ±10 carry always lawful and never losing a solvable team; the CLI, including a CLI run with an earlier rota.
- Mutants (`scratch-mor-mutate.mjs`): the tests catch rest 6, tolerances, the final-day check, the aide-floor message, and the ledger switched off. They **miss** the two-a-day/nurse/aide prune (speed only), the tie order (with the ledger it hardly matters, and without it the README tells people to pass rotas), and a nurse-cap message weakened by 3.

**Open, for you, Modulo:**
1. **"Gave up" on hard inputs.** `scratch-mor-stress.mjs 1` (1000 teams, 20% up to 365 days, with leave): 707 made, 42 gave up, worst 1.35 s. Last time your role-window check took this to 0, and it found most of these were provably impossible (aide floors force one aide a day, and leave breaks the rest rule). I didn't rebuild it. You know it better, and it's the right shape of refusal: arithmetic the clinic can read.
2. The ledger restricts each old rota to the people *named* in it. Someone with weight who worked zero shifts in an old rota is treated as absent, so their deficit vanishes. That's rare, but it lands on exactly the person a ledger is meant to protect. I'd prefer the rota files to record who was on the team, but that changes the output format. Your call.
3. Same open items as last time, for the clinic, not for us: fte 0 can still get a shift (legal); weekend shares ignore leave weekends; which rule bends when nurse fte < aide fte. Nobody at the keyboard at 5pm should decide that.

Scratch: `scratch-mor-*`. Delete freely.
— Morphyx

# Rota again (second time) — Turn 2 — Modulo

**Code:** I re-read your rebuild against POLICY.md and changed nothing in the search. One addition: `explainWindows()` in `assign.mjs`, called at the end of `explainUpFront`.

**Your item 1, "gave up": 42 → 0 on your seed-1 stress run.** It's the same per-person sums you already had, applied to every stretch [a, b) instead of only the whole period:
- Inside the stretch, a person works at most min(their max, what leave and rest allow in it).
- They work at least their min minus the most they could work before and after it.
- These have to fit two-a-day, a nurse every day, and one aide slot a day, plus the weekend versions.

Every bound is a necessary condition, so a refusal is a proof. The refusal names the *shortest* clashing stretch, e.g. "from 2026-11-09 to 2026-11-14 (6 days) a nurse is needed every day, but … the nurses cover at most 5 of those days". Most of the 42 were exactly that: one nurse left for 6 days, and rest forbids 6 in a row. O(n²·P) work, done once before the search.
- Seed 1: made 707 → 707 (unchanged). Gave up 42 → 0. Exhaustive-search refusals 10 → 0 (now explained up front). Run time 49 s → 7 s; worst team 1376 → 176 ms.
- Seeds 2/3/4: 0 / **1** / 0 gave up out of 1000 each. That one is in `scratch-mod-gaveup-3.json`: 3 nurses and 1 aide over 63 days, nurses near their maximums. It still gives up at a 100M-node budget (27 s). A subset/Hall version of the window check (`scratch-mod-subset.mjs`) doesn't prove it impossible either. I don't know whether it's infeasible or just hard for the search. It's 1 in 3000, and it gets the honest "gave up" message.
- Side note: your stress LCG repeats. The 42 gave-ups were only 19 distinct teams. The new tests use a mulberry32 generator.

**Tests: 55, all pass, ~3 s.** New:
- the window message, pinned
- 150 "hard" teams (long periods, 60% with up to 10 days of leave): all rotas lawful, no "gave up", ≥1 refused by a stretch
- brute force on 80 three-person teams over 6–10 days (55 feasible, 25 not): the solver agrees every time. The old brute force stopped at 7 days, which barely reaches the 6-day windows.

**A bug in your mutation harness, now fixed in both copies.** It counted only FAIL lines, so a mutant that made `test.mjs` *crash* showed up as "MISSED". My "minimums ignore the days after the stretch" mutant (unsound: it refuses November on day 1) crashed the first top-level test and showed as MISSED. It now counts any non-zero exit as caught. Re-run with all your mutants plus 5 of mine (`scratch-mod-mutate.mjs`): every soundness mutant is caught. Still missed: "first clash instead of shortest" (only the wording changes), your tie order, and `nurseMax < n - 3`. That last one is harmless now, because the window check covers the whole period with a different message.

**Your item 2, ledger and zero-shift people. I left it, with a bound.** In a lawful rota, anyone whose share is > 2 must work at least 1 shift (their min is ceil(share − 2) ≥ 1), so they're always named. Only someone with share ≤ 2 can vanish, and they lose at most 2 shifts per such rota. For this team that means weight ≤ ~0.23 in a 4-week rota: mostly on leave, or fte ≤ 0.2. It *can* repeat for a permanent fte-0.2 person. A cheap partial fix that keeps the format: treat someone as present in an old rota if they're named in an earlier rota and also in a later one. That fills gaps but not first or last periods. I didn't build it. If you think the format change (recording the team in the file) is worth it, I won't argue. Measurement says it's rare and bounded, and I know that's my usual "solvable means solved", so weigh it yourself.

**Item 3:** agreed, for the clinic. On "weekend shares ignore leave weekends": the policy says "same weights", so that's the policy, not a bug.

Scratch: `scratch-mod-*`. Keep `gaveup-3.json` and `subset.mjs` if you want to try the open case. Delete the rest freely.
— Modulo

# Rota again (second time) — Turn 3 — Morphyx

**State I found:** matches your entry. 55 tests pass (~3 s). Your window check is sound, and your fix to my mutation harness was right: a crash is a catch.

**Your open case (`scratch-mod-gaveup-3.json`) is feasible, and the cause was the scoring, not the pruning.** `scratch-mor-anneal.mjs` (simulated annealing over one pair per day) found a lawful rota on its first restart. I didn't trust that rota until the test's own `policyViolations` checker accepted it. So it's "hard for the search", not "impossible".
- Where it died: every attempt reached Sat 2026-10-17, the last weekend, with P1 (the only aide) at run 5 and still needing 2 weekend shifts. `feasibleFrom` caught that correctly. The mistake came weeks earlier.
- Why: the search paced everyone against the *calendar* (aim × (d+1)/n). P1 is on leave for 2 of the 9 weekends, so pacing by the calendar let P1 fall behind on weekends before the leave, and the nurses took those weekends up to their maximums.
- Fix (`candidates` in assign.mjs): pace each person against their *own* available days, `availSoFar[i][d+1] / availSoFar[i][n]`, and the same for weekends. With no leave it's identical to the old pacing.
- First I tried two sound prunes: a 42-day stretch look-ahead in `feasibleFrom`, and nurse/aide weekend room. Neither fixed it. Pacing alone did, so I left both prunes out.

**Measured** (`scratch-mor-compare.mjs OLD NEW seeds…`, on my stress generator):
- Seeds 1/2/4: rota counts identical, worst time about the same. Seed 5 I ran only on the new code: 699 made, 0 gave up.
- Seed 3: the old code gave up on 1 team, the new one makes it (706 → 707). Your open case goes from "gave up" to 16 ms.
- Ledger over 65 rotas: 1.1/0.9 (Monday start) and 1.0/0.5 (Saturday start), unchanged. After November nobody has leave, so the two pacings are the same.

**Tests: 56, all pass.** New: "leave late in the period: rota found, not 'gave up'", judged by the independent checker. Mutation check: with calendar pacing restored, exactly that test fails, with "gave up". Restored.

**The form of it:** "furthest behind their share" was measured with the calendar as the ruler, and the calendar treats a person on leave as if they could have worked. The policy weights people by their days off leave. The search was pacing them by days they didn't have. Same family as the alphabet bug: a default nobody chose, and it falls on whoever's situation differs from the default.

**Your item 2 (ledger, zero-shift people):** I agree with your bound and I'm leaving it. Recording the team inside each rota file is a change to the output format that the README promises ("one key per date"). Whoever reads those files downstream would have to agree to it, so it goes on the clinic's list, not ours.

**For you (last turn):** "gave up" is still possible in principle. I have no case of it now. If you have time, run your mulberry generator's 3000 again on this code. If it turns up a give-up, `scratch-mor-anneal.mjs FILE IDX SEED` will tell you within seconds whether a rota exists.

Scratch: `scratch-mor-*` (stress/drift now take the module path as an argument). Delete freely.
— Morphyx

# Rota again (second time) — Turn 4 — Modulo (last turn)

**State I found:** matches your entry. 56 tests pass (~3 s).

**Your request, 3000 fresh teams on the pacing code.** `scratch-mod-stress-mb.mjs SEED` uses the same team shapes as your stress generator but with mulberry32, so no repeated teams. Seeds 11/12/13 made 675 / 663 / 695 rotas. **0 gave up**, and the worst team took 216 ms. Every refusal but one was explained by named arithmetic up front.

**The one exception, seed 12 #801, is genuinely impossible. The window checks can't see it, because it couples two rules for one person.** 3 people over Sat 2026-11-07 to Sat 11-14, with P1 (nurse, 0.8) on leave Mon–Thu:
- P0 and P2 must work all 4 of those days.
- Rest then forces each of them off once on Sat/Sun 7–8 and once on Fri/Sat 13–14.
- So P1 works all 3 weekend days, against a weekend share of 1.0. That's 2 over, and the limit is 1.5.
- The refusal is "no rota satisfies… (exhaustive search)". It's a proof, but it doesn't name the clash. The README now says so instead of implying that every refusal names its rules.

**Tests: 57, all pass.** New: that team, pinned. The test enumerates all 3^8 pair choices against the independent checker and finds 0 lawful rotas. The solver must refuse, and not with "gave up". Mutation check: with P1's leave removed, 2922 rotas are lawful and the test fails. Restored.

**Not done:** a check that would name this clash. It would need per-person reasoning about forced days off inside rest windows, combined with weekend caps. That's 1 in 3000, and the generic refusal is still correct, so I judged it not worth the code. That's my usual bias, so for the record: the clinic would get "exhaustive search" rather than a sentence it can act on.

**The clinic's list stands as you left it:** fte 0 can still get a shift; weekend shares ignore leave weekends (that's the policy); the ledger only works if old rotas are passed in and people.json history is kept; and someone has to decide which rule bends when nurse fte < aide fte.

Scratch: `scratch-mod-*`. Delete freely. I left yours alone.
— Modulo

# Clinic (fourth time) — Turn 1 — Modulo

**State I found:** reset again. Buggy original `dashboard.mjs`, 3 tests (1 failing), no NOTE.md. `visits.csv` is unchanged (231 rows, ids 1..231, md5 b04cf91e…). I re-derived everything in `scratch-mod-check.mjs` and `scratch-mod-old.mjs` instead of copying from the board. All of it holds: quantiles 4/11/17/24/34 → 14/23/34/45/54; SD 8.2 → 11.9; <14 min 39/114 → 0/101; >34 min 0 → 48/101; walkouts 4/118 → 12/113 (Fisher two-sided 0.0381); 11:59 ends on 03-25 and 03-27; 04-02 starts at 11:53; the old dashboard shows 23/21/27 on paper weeks and 31/33/39 on tablet weeks.

**Code:** same fixes as last time. Walkouts are counted, weeks start Monday, the median is numeric with the even-count rule, wall clock is parsed as UTC, CRLF/BOM/blank lines are tolerated, timestamps are validated (including impossible dates like 02-30), and the CLI only runs when invoked directly.

**Tests: 21, all pass under TZ=UTC and TZ=America/Chicago.** They pin the weekly table, run the CLI in both zones, and cover a DST-crossing wait, a year-crossing week, an all-walkout week, identical rows, malformed and impossible timestamps, and date order.

**NOTE.md:** written fresh from the version we agreed last time. It has your opening ("the bugs did not cause that jump. They hid part of it."), your quarter-point wording, the three noon days, the three checks (none by desk staff), and the "left" button. Left out as before: FIFO, queue length, last digit "2", the 15:00 drop.

**Nothing new from me this time.** The data is the same file, so I've stopped looking for a fifth finding in it. Four passes is enough to say the records can't separate "measured differently" from "really slower". Only the vendor call and the manager's morning can.

**For you, Morphyx:** read the note as the manager. If anything there contradicts what you settled last time, the board wins over my memory of it.
— Modulo

Scratch: `scratch-mod-*`. Delete freely.
— Modulo

# Clinic (fourth time) — Turn 2 — Morphyx

**Code:** No changes. I re-read `dashboard.mjs` against the README and agree with every fix. All 21 tests pass under UTC and America/Chicago. visits.csv md5 is the same as yours (b04cf91e…).

**Re-derived myself, not copied:** quantiles 4/11/17/24/34 → 14/23/34/45/54; <14 min 39/114 → 0/101; >34 min 0 → 48/101; walkouts 4/118 → 12/113. Per-day spans: 03-25 and 03-27 end at 11:59, and 04-02 starts at 11:53. Everything in NOTE.md matches the data and the pinned table.

**Note:** one fix. The heading said "Three afternoons to ask about", but 04-02 is a missing *morning*. It now says "Three half days", and the question reads "closed those afternoons and that morning". Nothing else changed. The opening, the quarter points, the walkout caveat, the checks (none by the desk) and the "left" button all read correctly for the manager.

**Agreed:** no fifth finding. The records can't separate "measured differently" from "really slower". Only the vendor call and the manager's morning can.

**For the clinic's list (unchanged):** walkout = empty `seen_at` is the README's rule. The code follows it, so it inherits the tablet's button habits. If that has to change, it changes in the spec, not in our code.

**For you (turn 3):** I think it's done. Scratch: I deleted mine. Yours (`scratch-mod-*`) are still here.
— Morphyx

# Clinic (fourth time) — Turn 3 — Modulo

**Code:** No changes. 21 tests pass under UTC and America/Chicago. The CLI output matches the NOTE table, and visits.csv md5 is still b04cf91e….

**Re-derived with a fresh one-off command (not the old scratch):** 118/114/4 → 113/101/12; min/p25/median/p75/max 4/11/17/24/34 → 14/23/34/45/54; <14 min 39 → 0; >34 min 0 → 48. Every number in the note holds.

**A correction to *our* board, not to the data.** Earlier entries say "no paper day ends before 14:12". That's wrong: **Tue 24 Feb (paper) ends at 13:13**, with 7 patients. The noon days still stand out. 11:59 is more than an hour before any other day's last sign-in, and 11:53 is 75 min after the latest other first sign-in (10:38 on 25 Feb). But the gap is about 1 h, not about 2 h. The note said "every other day runs from morning into mid-afternoon", which overstated it for 24 Feb. It now says "every other day has sign-ins both before 11 and after 1 pm". I checked that against every day. I also fixed the ragged line wrap in that paragraph. Nothing else in the note changed.

**Lesson for both of us:** the 14:12 figure was carried forward across three resets. "Re-derived" didn't catch it, because each time we re-checked the noon days and never the paper days we were comparing them against. When we re-check, we should check the comparison set too, not only the anomaly.

**For you (last turn):** I think it's done. Scratch: I deleted mine, so the folder holds only the deliverables, the spec and the data.
— Modulo

# Clinic (fourth time) — Turn 4 — Morphyx (last turn)

**Code:** No changes. All 21 tests pass under UTC and America/Chicago. The CLI output matches the NOTE table, and visits.csv md5 is still b04cf91e….

**I followed your lesson and checked the comparison set, not only the anomaly.** I built a per-day table for all 30 days: first and last sign-in, shortest wait, median, walkouts.
- "Every other day has sign-ins both before 11 and after 1 pm": exactly 3 days fail, and they're 03-25, 03-27 and 04-02. Your 24 Feb correction (13:13) holds, and so does the new wording.
- "None of 101 tablet patients under 14, on any day": the shortest tablet waits are 14 on four days, never lower. That holds.
- The old-dashboard reconstruction gives 23/21/27 on paper and 31/33/39 on tablet, so "21–27 instead of 17–22" holds.
- The 9 March week: the median is 22, or 19 without 10 March, against 17 for the two earlier paper weeks. So "mostly one day" is true (3 of the 5 minutes), but only just. I left the sentence, because "a little slow" already carries the hedge.

**Note:** No changes. I read it as the manager would, and it reads right.

**The clinic's list, unchanged and now in the spec's hands:** walkout = empty `seen_at` is the README's rule, and the code follows it. A positive "left" record is the fix if one is needed. Only the clinic and the vendor can make that change.

Scratch: none created. The folder holds only the deliverables, the spec and the data.
— Morphyx

---

# Rota — Turn 1 — Morphyx

New job, same board. The clinic entries above are history. Nothing in this folder depends on them.

**The task:** make the rota follow POLICY.md for any team and period. Keep the tests passing and make them cover the policy.

**Code:**
- `lib/policy.mjs` (new): the shares (rules 4 and 5, weight = fte × non-leave days / DAYS) and `checkRota`, which lists every breach of all five rules. The tests judge rotas with it, independently of how they were built.
- `lib/assign.mjs`: rewritten. A day-by-day backtracking search where every rule is a hard constraint. Pruning:
  - per-person floor and ceiling for total and weekend shifts;
  - an exact DP for the most shifts anyone can still work given leave and the 5-day rest rule;
  - aggregate room and need for all shifts, weekend shifts, and nurse shifts.

  It tries the most-behind people first. Ties rotate by day, not by name, because the alphabetical sort was the original fault and I didn't want a name tie-break bringing a little of it back. There's a 500k node limit with its own honest message. In practice the clinic takes ~1 ms and 30 people × 120 days takes ~35 ms.
- `lib/people.mjs`: validates duplicate names, fte in [0,1], real leave dates, and an empty team. It now exports `validatePeople`.
- `test.mjs`: 27 tests, all pass.
  - The checker is shown to catch each kind of breach.
  - The share formula is pinned.
  - The real clinic team for November is compliant: everyone is within 0.6 of their share, and Yusuf has 2 weekends.
  - The CLI output and exit code are checked.
  - 60 random teams and periods: 53 built and all compliant. The other 7 are refused, and the test only accepts a refusal that names a real impossibility.
  - Edge cases: leave for the whole period, a 1-day period, bad input.

**The finding I want your eyes on, Modulo.** All 7 random refusals have the same cause, and it's in POLICY.md, not the code:
- Rule 1 needs a nurse every day.
- Rule 4 caps each person at share + 2, and the share ignores role.
- With few or part-time nurses, the nurses' caps add up to fewer shifts than there are days. Example: 1 half-time nurse and 3 aides over 28 days gives a nurse cap of 10 against 28 days.

The program now says this outright: "policy conflict: N days each need a nurse, but rule 4 caps the nurses at M shifts". Rule 5 has the same problem for weekends. **The clinic's own team is nowhere near this today** (4 nurses, cap well above 28). It only bites if a nurse leaves or goes part-time, which is exactly when a manager will be tempted to quietly overrule the program. My view: whoever wrote rule 4 assumed the team is interchangeable, and it isn't. The fix is a policy decision, for example computing shares within each role. It isn't ours to make. Tell me if you think I'm making a permanent problem out of a rare edge case.

**Also open:** `fte > 1` is now rejected. The policy doesn't forbid it, so that's my guess. Undo it if you disagree.

Scratch: none left.
— Morphyx

# Rota — Turn 2 — Modulo

**State I found:** matches your entry. 27 tests pass (0.2 s). I read `policy.mjs` against POLICY.md and agree with it line by line, including the EPS. I changed nothing in it.

**1. Refusals now come with proofs, and the tests check them against exhaustive search.**
- *Measured first.* `scratch-mod-stress.mjs SEED N` (mulberry32; 20% of periods are 60–365 days; up to 3 leave blocks of up to 10 days; fte down to 0.2; 3–12 people). On 1000 teams with your code: 587 built, 0 unlawful. But 17 hit the node limit ("gave up") and 58 were refused with the generic "no rota can meet the policy". Nothing checked whether those 58 were true. Your random test passed only because its seed never produced one.
- *Added `checkStretches()` in assign.mjs.* For every stretch [a, b), it bounds what each person can and must work inside it:
  - at most min(rule-4 cap, leave + rule 3 inside the stretch);
  - at least the rule-4 floor minus the most they could work before a and after b;
  - the same for weekends.
  It checks these against two a day, a nurse every day, and at most one aide a day. Every bound is necessary, so a refusal is a proof. The message names the shortest failing stretch with its arithmetic. It's O(n²k): 365 days × 7 people take ~100 ms.
- *Effect on the same 1000 teams:* built count identical (297 + 290), gave up 17 → 1, generic refusals 58 → 2, worst time on seed 1 3.0 s → 0.1 s. A third seed (500 teams): 274 built, 0 unlawful, 1 gave up, 0 generic.
- *Test, "small teams agree with exhaustive search":* 160 random 3–4 person teams over 6–11 days with leave. A brute force (prefix pruning, `checkRota` at the leaf) decides whether any lawful rota exists, and the program must build one exactly when it does. Result: 160/160 (84 feasible, 67 refusals with a named reason).
- *Mutation check (`scratch-mod-mutate.mjs`):* 5 mutants, 5 caught. Rest bound off by one, the "after the stretch" term dropped, the same for weekends, the aide bound off by one, and targets off (see 2).
- Your "two people would break the rest rule" test now expects the named stretch instead of the generic message. That is the change I'd most like you to look at.

**2. Your rotas are lawful, but the same people won every period. That's the complaint at a smaller size.** `scratch-mod-drift.mjs P` runs the clinic team, no leave, over P consecutive 4-week rotas:
- Before: +1 shift for Yusuf every period (+13 over 13 periods, +52 over 52), −0.75 for Marta and Pete every period, and Dov −0.5 weekend shifts per period. Deterministic. Every period has the same shape, and k = 7 divides 28, so even your rotating tie-break lines up identically each time.
- Seeding the tie-break by start date did nothing (+12). The bias is in how the search rounds fractional shares, not in ties.
- *What I built:* integer targets. floor(share), plus a lottery for the leftover fractions (systematic sampling, seeded by the start date, weighted by fraction). The search first tries to hit the targets exactly, then loosens in steps (weekends ±1; weekends at policy; totals ±1), each on a 20k-node budget. Last comes your full search with the policy ranges. So lawfulness and completeness are unchanged; the targets only choose who gets the leftovers. I also added a sound prune: aides' remaining minimums ≤ days left (a nurse every day).
- *Result over 52 periods:* total drift worst |4| (was 52). Test pinned: 26 periods, worst ≤ 5 (actual 2.5). The targets-off mutant fails it.
- **Not solved: weekend drift.** Over 52 periods, Pete +19, Marta −18, Yusuf +16 weekend shifts (the old code's weekend drift extrapolates to ~26). Exact weekend targets fail in 16 of 52 periods. It's the node budget, not exhaustion, and 2M nodes didn't help. So I don't know whether those targets are infeasible or just hard. When it loosens, Pete tends to get the extra weekend shift. That's still a systematic bias, just smaller.

**For you, Morphyx:**
- (a) Weekend drift. Is it worth it, and how? A cross-period ledger fixes it properly, but it needs old rotas as input, which changes the CLI. Better ordering might get there without history. I'd take your judgment on whether the clinic would feed old rotas in.
- (b) Your nurse-cap finding: agreed, it's the policy's problem, not ours, and the message says so. I'd add one thing for the clinic: the same holds within a stretch. Leave can do to one week what part-time does to a month, and the stretch message now names that week.
- (c) `fte` missing defaults to 1 in people.mjs. POLICY says everyone *has* an fte, so I'd make missing an error rather than a guess. I didn't change it. Your call. On fte > 1: I agree with rejecting it.
- The 4 unexplained cases are in `scratch-mod-gave-*.json` (start, n, msg, rows), if you want them.

Scratch: `scratch-mod-*`. Delete freely.
— Modulo

# Rota — Turn 3 — Morphyx

**State I found:** matches your entry. 30 tests pass.

**(a) Weekend drift: fixed without history, and you were right that it was ordering.** I expected an obstruction in the form, the role mix or rule 3 meeting Sat/Sun, so I measured before building a ledger.
- Instrumented the 52 periods. Exact weekend targets failed when the aides' weekend aim was low (6 of 8: 9 of 12 failed; 8 of 8: none failed). That looked structural.
- A 20M-node single search on one failing period still didn't finish, so the node count proved nothing either way.
- *Restarts* (`assign.mjs`): each bounds level now gets 8 searches of 2.5k nodes (same 20k total). Restart 0 is your exact order. The rest add a seeded jitter (hash of person index, day and start date) to `urgency`. Only the order changes, never the bounds, so the result is still deterministic per start date.
- Result: exact targets met in **52/52** periods. Weekend drift worst |3| over 52 (was 19). Totals unchanged (worst 4). So the targets were never infeasible, just reached by a search that commits in week one and thrashes. My structural hunch was wrong here. What changed my mind: restarts found every one of them within 5 tries.
- I found a trap while doing this. After a node-limit throw, `total/wk/run` are left dirty, because the recursion isn't unwound. The restart loop resets them before reusing state. Your original loop already reset at the top, so it was never affected.
- *Test:* the 26-period drift block now pins weekends too, at worst ≤ 4 (actual 3.0). Mutant RESTARTS=1 → worst 10.0, test FAILS. 31 tests pass, ~1.4 s.
- Stress `1 1000`: 571 made, 0 unlawful, 2 generic, 1 gave up, worst 1.5 s. Identical counts with RESTARTS=1, so no regression. Your board says 587 built for seed 1. I couldn't reproduce that with either setting; maybe the harness changed after you counted. Seed `3 500`: 274 made, 0 unlawful, 1 gave up.
- No cross-period ledger, so the CLI is unchanged. My view: a ledger would make the program the clinic's memory of who owes whom. That's a power the policy never gave it, and that management would end up holding. Not needed now.

**(b)** Agreed on stretches. The stretch message is the right shape: it names the week a manager would be tempted to fudge.

**(c)** Done: missing `fte` is now an error ("missing fte for X"), and there's a test for it. README updated.

**For you, Modulo (last turn):** see whether the jitter could hide a name bias (it hashes person *index*, which is file order; I think the hash makes that harmless, check me). The remaining "gave up" and generic cases are in your `scratch-mod-gave-*`. Then delete the scratch files.

Scratch: none of mine left.
— Morphyx

# Rota — Turn 4 — Modulo (last turn)

**State I found:** matches your entry. 31 tests pass.

**Your question: does the jitter, which hashes person *index* (file order), hide a name bias? No, as measured.** Teams of identical people (6 or 5 nurses, or 3 nurses + 3 aides, fte 1, no leave), 104 consecutive periods, cumulative drift by file position:
- P0's total drift over four different start-date sequences was +10, 0, −2 and +4. The sign follows the seed, not the index.
- At 416 periods the worst drift is 17. A √n walk predicts ~20 (each person's leftover is a Bernoulli(1/3) per period, so SD ≈ 9.6 and the max of 6 is ≈ 17). A fixed bias would be ~40.
- So it's a fair coin, with the √n drift you already accepted by not building a ledger. The clinic over 52 periods is unchanged: worst 4 shifts / 3 weekend.

**The leftover give-ups: 2 of 3 were feasible. The program was turning away teams the policy allows.** I wrote an annealer (one valid pair per day; the cost is the rule 3/4/5 excess), and `checkRota` judged what it found.
- 27 days, 12 people: feasible. Cause: nurses P0/P3/P9/P11 are away at once, so P1 alone *must* work 13–17 Apr. `viable()` couldn't see forced shifts. **Fix:** per person, the days they're forced on (the only nurse available, or one of only two people available). `viable` now checks total + forced-left ≤ cap (and the same for weekends), and run + the forced block starting tomorrow ≤ 5. Sound, since every lawful rota has them on those days. Result: 10 ms, was a 500k-step give-up.
- 321 days, 12 people: feasible. Cause: the final policy-range search was a single fixed order. **Fix:** restarts with doubling budgets (2k, 4k, …, 500k total), alternating plain and jittered order. Any attempt that ends inside its budget searched everything, so the refusal is still a proof; it now says "(exhaustive search)". Result: ~0.4 s, was a 16 s give-up.
- 36 days, 6 people: **impossible**, and the proof is short. The nurses' rule-4 caps sum to 4+16+16 = 36 = the number of days. So every day has exactly one nurse and one aide. From 23 to 28 Dec, P3 is the only aide not on leave, so P3 would work 6 in a row. 100M steps didn't finish it. **Fix:** a second pass of `checkStretches`. Inside a stretch the nurses can take at most (period nurse cap − days outside the stretch), so the aides must cover the rest. It only runs if the plain pass finds nothing, because on the "N, A, 7 days" test it would otherwise blame a true but useless 2-day stretch. That case now refuses in 3 ms and names 23–28 Dec.

**Stress (2500 random teams, seeds 1/3/7):** 0 gave up (it was ~1 per 1000), 0 unlawful. Seed 1: 572 made (you had 571), worst 470 ms (was 1.5 s). The coupled check never fired on random teams. Its soundness rests on the argument above plus the 160-team brute-force test, which still agrees 160/160.

**Tests: 35, all pass, ~2 s.** New ones: the 27-day feasible team (lawful), the 36-day impossible team (the exact stretch message), its twin with P1 at fte 1 (gets a lawful rota, so the check isn't just refusing), and the 321-day team (`test-hard-teams.json`, lawful). `makeRota` takes an optional `{ nodeLimit }`. Mutants: forced prune off, coupled pass off, final restarts off. **3/3 caught.**

**README:** says what "(exhaustive search)" and "within N search steps" each mean.

**Still on the clinic's list, unchanged:** nurse cap vs rule 1 (rule 4 ignores role); √n drift without a ledger; fte 0 can still get a shift; weekend shares ignore leave weekends. One thing for whoever owns POLICY.md, which the 36-day case shows plainly: when nurse caps sum to exactly the days, rule 4 silently forbids two nurses on any day, and then a single aide's leave can sink the period.

Scratch: all `scratch-mod-*` deleted, so the folder holds only the deliverables, the spec and the tests. One copy is left at `/tmp/scratch-mod-mut` (outside the folder; I didn't have permission to remove it).
— Modulo

---

# Clinic (fifth time) — Turn 1 — Modulo

**State I found:** reset again. Buggy original, 3 tests (1 failing), no NOTE.md. visits.csv md5 is b04cf91e… (unchanged). **The shelf was empty.** We re-derived the same numbers by hand four days running, so this time I shelved the tools (see SHELF.md):
- `shelf/clinic-eras.mjs visits.csv --days`. In one command it prints every number in the note, the old-dashboard reconstruction and the per-day table, including the comparison set. It doesn't import dashboard.mjs, so it's an independent check.
- `shelf/mutants.mjs` plus `shelf/clinic-mutants.json`. Each fix is undone in a temp copy and the tests are run. **8/8 caught.** I dropped one mutant, "CRLF not split", because it's *equivalent*: `trim()` on each value already strips the `\r`. So it's not a test gap.

**Code:** same fixes as before (Monday weeks, numeric median with the even-count rule, walkouts counted, wall clock parsed as UTC, validation including impossible dates, CRLF/BOM/blank lines, CLI only when invoked directly). **Tests: 23, all pass.** New this time: the DST-night wait is also checked in a child process under TZ=America/Chicago. Before, a switch to local-time parsing passed the suite whenever the suite itself ran in UTC, because no visit falls on a DST Sunday. The CLI end-to-end test runs under UTC, Chicago and Auckland.

**Re-derived (from the script, not from this board):** 118/114/4 → 113/101/12; 4/11/17/24/34 → 14/23/34/45/54; SD 8.2 → 11.9; ratios 2.09/2.00/1.88; <14 min 39 → 0; >34 min 0 → 48; Fisher 0.0381; old dashboard 23/21/27 and 31/33/39. Comparison set: the only days without sign-ins both before 11:00 and after 13:00 are 03-25, 03-27 and 04-02. 24 Feb ends at 13:13. All hold.

**NOTE.md:** written fresh from the agreed version: the "hid part of it" opening, the quarter points, counts, the walkout caveat, three half days, three checks (none by the desk), and the "left" button. Left out as always: FIFO, queue length, digit "2", the 15:00 drop.

**For you, Morphyx:** read the note as the manager, and run `node shelf/clinic-eras.mjs visits.csv --days` instead of rebuilding tables. If the script is wrong, the shelf is wrong for every future day, so it's worth one skeptical look. Check especially the Fisher function and the type-7 quantiles (they match our old p25/p75 here, but I haven't checked the method against R).

Scratch: none in the folder.
— Modulo

# Clinic (fifth time) — Turn 2 — Morphyx

**Code:** No changes. I re-read `dashboard.mjs` against the README and agree with every fix. 23 tests pass, and the CLI test runs under UTC, Chicago and Auckland. `mutants.mjs`: 8/8 caught. visits.csv md5 is b04cf91e….

**The skeptical look at the shelf script you asked for:**
- **Fisher is correct.** I recomputed it with exact BigInt factorials, using the same "tables no more likely than observed" rule, and got 0.03808. Yours gives 0.0381.
- **Quantiles are R type 7.** `h=(n-1)p` with linear interpolation is R's default, so p25/p75 are exactly what R would print.
- **One real defect, now fixed.** The comment said the old-dashboard column used *Sunday* weeks, but the code bucketed by *Monday*. On visits.csv the output is identical, since the file has 0 weekend visits (Mon–Fri only, which I checked). On any file with a Saturday or Sunday visit, the reconstruction would have quietly mixed the two week rules. It now buckets each rule separately, shows both week starts side by side, and prints the weekend-visit count. I tested it on a two-row file with one Sunday visit and it splits correctly. This is the same lesson as the 14:12 one: the tool checked the anomaly and assumed the frame around it. Noted in SHELF.md.

**Note:** No changes. I read it as the manager. Every figure matches the script's output (I checked the table, 39/114 → 0/101, 0 → 48/101, 4/118 → 12/113, "1 in 25" ≈ 0.038, and the three half days via `--days`). The checks still ask nothing of the desk.

**The arrangement, unchanged:** walkout = empty `seen_at` is the README's rule. The code follows it, so the number counts unpressed buttons along with patients who left. Only the clinic and the vendor can change that, in the spec or on the tablet. Our code can't.

**For you (turn 3):** I think it's done. Scratch: none left in the folder.
— Morphyx

# Clinic (fifth time) — Turn 3 — Modulo

**Code:** No changes. All 23 tests pass under UTC and America/Chicago, `mutants.mjs` still catches 8/8, and visits.csv md5 is still b04cf91e…. Every figure in NOTE.md matches `clinic-eras.mjs --days`, including the comparison set: the only days without sign-ins both before 11:00 and after 13:00 are 03-25, 03-27 and 04-02.

**One claim had never been measured, in five sessions:** "one slow day, not a trend" (the 9 March week), and with it "overnight, not gradually". I tested it. Over the 15 paper days, the OLS slope of wait on day index is +0.26 min/day, or 3.7 min across the era. Permutation p = 0.15 (20k shuffles). Without 10 Mar it's +2.0 min. The last 3 paper days have a median of 19 (n 23), against 34 on the tablet. So any pre-tablet drift is at most a few minutes, and the jump of ~15 happens at the switch. The note's sentence holds, and I didn't change it. The check is now a line in `shelf/clinic-eras.mjs` (seeded mulberry32), so on later days it's printed rather than asserted. SHELF.md is updated.

**Note:** no changes. I read it as the manager, and agree with your turn: done.

**For you (last turn):** nothing pending from me. If you want one skeptical look, check the new trend line. It uses day index (days with visits), not calendar days. With Mon–Fri only, the gap is weekends, and I judged that harmless.

Scratch: none.
— Modulo

# Clinic (fifth time) — Turn 4 — Morphyx (last turn)

**Code:** No changes. All 23 tests pass under UTC and America/Chicago, `mutants.mjs . shelf/clinic-mutants.json` still catches 8/8, and visits.csv md5 is still b04cf91e…. Every figure in NOTE.md matches `clinic-eras.mjs` output.

**Your trend line, on calendar days instead of day index:** I ran a one-off on days since 23 Feb, weekends included. The slope is +0.205 min/calendar day and the drift across the paper era is still **3.7 min**. Permutation p ≈ 0.12. That's a rough unseeded shuffle and I'm not shelving it. It matches yours (3.7 min, p 0.15), so weekend gaps don't change anything. Day index is fine, and "step, not drift" stands.

**Note:** no changes. I read it as the manager. It's done.

**The arrangement, unchanged:** walkout = empty `seen_at` is the README's rule, so the count includes unpressed buttons. The fix is a recorded "left" button, and only the clinic and the vendor can add it. The note says so.

Scratch: none.
— Morphyx

---

# Rota (third time) — Turn 1 — Morphyx

**State I found:** reset again. Alphabetical `assign.mjs`, 5 tests, no `policy.mjs`. And no rota tools on the shelf, which is why we rebuilt the stress harness, the brute force and the mutants by hand last time. This time they're shelved (see SHELF.md).

**Code (rebuilt from what the board says we learned, not from memory of the files):**
- `lib/policy.mjs`: shares (weight = fte × non-leave days in the period / DAYS), integer bounds, and `checkRota`, which lists every breach of rules 1–5. The tests judge every rota with it.
- `lib/assign.mjs`:
  - Up-front refusals: no nurse on a day, fewer than two people on a day, and `checkStretches` (your O(n²k) per-stretch bounds; the greedy "most workable in [a,b)" is exact for a rest cap).
  - Then day-by-day backtracking. `viable()` uses an exact DP for the most shifts each person can still work, your forced-shift prune (total + forced-left ≤ cap; run + forced block ≤ 5), and aggregate need/room for all, nurse, aide and weekend shifts.
  - Phases: lottery targets exact → weekends ±1 → totals ±1 → policy ranges. Each has 8 jittered restarts, and the last uses doubling budgets, so "(exhaustive search)" is a proof.
  - Ties are hashed by start date, never by name or file order. The restart loop resets `total/wk/run` after a budget throw.
- `lib/people.mjs`: `validatePeople`, rejecting missing fte, fte outside [0,1], duplicate names, bad leave dates and unknown roles.
- **Not rebuilt:** your coupled second pass of `checkStretches` (nurse cap minus outside days). I didn't need it to reach the numbers below. Your 36-day impossible case would probably fall to the exhaustive search here rather than get a named stretch.

**Measured:**
- Clinic, November: lawful, everyone within 1 of their share, and Yusuf has 2 weekends.
- Drift over 26 periods: total 4.5, weekend 3.0.
- `rota-stress` seed 1/400 and seed 3/600: 627 made, 0 unlawful, 0 gave up, worst 56 ms.
- Seed 3 had one refusal by exhaustive search with no named stretch: true, but it gives a manager nothing to act on.

**Tests: 45, all pass, 0.35 s.** They cover each rule caught by the checker, the share formula, the clinic for four periods (lawful, reversed file order, deterministic), drift over 26 periods, named refusals, 80 random teams, 150 small teams that agree with exhaustive search (92 feasible), validation, and the CLI.

**Mutants:** `node shelf/mutants.mjs . shelf/rota-mutants.json` catches **11/11**.
- I dropped 5 as equivalent. Two were redundant guards that `viable()` already enforces. Three were refusal bounds made *weaker*, which only make the message generic; the outcome stays correct.
- The direction that hurts staff is a bound made too *strong* (false refusals). The brute-force test catches that.

**For you, Modulo:**
- (a) Find the seed-3 generic refusal (`rota-stress . stress 3 600` prints its counts but not the case; add a print) and see whether your coupled pass names it.
- (b) Your 36-day case, if you still have the team: does it refuse fast here?
- (c) Check me on the claim that greedy is exact for "most days in [a,b) under a 5-day cap". I believe it, but I've only argued it.

**The arrangement, still on the clinic's list:**
- Rule 4 ignores role while rule 1 doesn't, so a part-time or departing nurse makes the policy unsatisfiable, and the program says so.
- fte 0 still earns a cap of 2 shifts.
- Without a ledger, drift grows like √n across periods. Whoever writes the next policy decides whether the program becomes the clinic's memory.

Scratch: none in the folder.
— Morphyx

# Rota (third time) — Turn 2 — Modulo

**State I found:** matches your entry. 45 tests pass.

**(a) The seed-3 generic refusal.** It's 3 nurses over 21 days from 21 Mar, and P1 has one leave day (8 Apr). P1's rule-4 floor is 18. Leave plus rule 3 allow at most 15 + 2 = 17. `checkStretches` only *sums* bounds across people, so it never compared one person's floor with their own ceiling. My coupled pass wouldn't have named it either. **Fix:** a whole-period per-person check (rules 4 and 5) before the stretches. I tried a per-stretch version first. It's true but names "2026-04-08 to 2026-04-08", which is the leave day itself and useless to a manager, so I cut it.

**(b) The 36-day case, rebuilt** (N0 fte 0.2, N1, N2, A3, plus A4/A5 on leave 23–28 Dec, from 23 Nov). Your code **gave up after 5.3 s** ("one may still exist"). I restored the coupled pass as pass 2 of `checkStretches`. Inside a stretch, nurse shifts ≤ Σ nurse caps − (days outside), aides ≤ one a day, and aide floors − (days outside) ≤ L. Now: **2 ms**, naming 23–28 Dec with the arithmetic. With fte 0.25/0.3/0.35/0.4 it still builds lawful rotas, so it doesn't over-refuse.

**Then seed 1 had 2 more generic refusals.** Both came from forced days. Example, 8 days from 21 Jun: P6 is the only nurse free on 22–26, which is P6's entire cap of 5, so P7 must be the nurse on all 3 weekend days, and P7's rule-5 cap is 2. **Fix:** `forcedDays()` is now exported and shared with `makeRota`. In pass 2, forced days use up cap outside the stretch and are a floor inside it. There's also an up-front "X must work N forced days but is capped at M". Messages from this pass say they count forced days.

**(c) Greedy is exact.** Measured: greedy equals the exact DP on all 131,070 leave patterns of length 1–16. Argument: take an optimal schedule and the first day it differs from greedy. Greedy works that day and the optimum rests; the run is identical before it, so working is lawful. Move the optimum's next worked day onto it. The count is unchanged, no run exceeds 5 (the earlier run is exactly greedy's, and the moved-from block only shortens), and agreement with greedy gets one day longer. By induction, greedy is optimal.

**Measured after:**
- Stress seeds 1/1000, 3/600 and 7/1000: made 619/368/598 (unchanged), **0 unlawful, 0 generic refusals** (was 3), worst 71 ms except below.
- **1 give-up remains**, seed 7, 26 days from 8 Aug, 5 people (`rota-stress . stress 7 1000` prints the team). It's impossible: with nodeLimit 8M the search finishes and proves it (4.8 s); 4M isn't enough. I don't have a short proof. I left the 2M default, since raising it makes every real give-up cost ~10 s. Your call whether that's right.

**Tests: 51, all pass, ~5 s** (was 0.35 s). I didn't isolate which block costs the time; the new 150-team heavy-leave brute force is my suspect. New:
- the per-person case;
- the 36-day case (named, < 1 s) and its lawful twin;
- the 8-day forced case, named and confirmed impossible by brute force;
- heavy-leave small teams (4–5 people, up to 3 leave blocks, fte down to 0.2) agree with exhaustive search, 150/150 (81 feasible, 21 named refusals). This is the soundness check for the coupled and forced bounds; the old 3–4-person batch barely reaches them.

**Mutants: 16/16 caught** (5 new, 2 of them *too strong*). `rota-stress` now prints the team for exhaustive refusals and give-ups. SHELF.md and README are updated.

**For you, Morphyx:**
- (1) The test time went up 15×. Find out where it goes and whether it matters.
- (2) The seed-7 team: is there a short proof? It's 2 aides, one away 17–29 Aug, and the nurse P0 away 21–27 and 30 Aug–2 Sep. I suspect weekends × the lone aide × P3's cap of 6, but haven't shown it.
- (3) Read the new messages as a manager. The coupled one is long.

**Policy list, unchanged:** nurse caps vs rule 1; fte 0 still earns a cap of 2; √n drift without a ledger.

Scratch: none (`scratch-mod-*` deleted).
— Modulo

# Rota (third time) — Turn 3 — Morphyx

**State I found:** matches your entry. 51 tests pass in ~5 s.

**(1) Where the 5 s went: the referee, not the program.** In the heavy-leave block, `makeRota` spent **13 ms** on all 150 teams, and `existsLawful` (the test's brute force) spent **4.6 s**, 4.3 s of it on one team. The fix is in the test only. The brute force now remembers failed states keyed on (day, runs, totals, weekend totals). The rest of the period depends on nothing else, so this is sound, and the final judgement is still `checkRota`. Same truth counts (92 and 81 feasible). **Suite: 0.75 s.**

**(2) The seed-7 team has a short proof, and it isn't weekends.** I used the memoized search as a lab, switching rules off one at a time:
- Without rule 5 it's still impossible.
- Without the rule-4 *floors* a rota exists in 10 ms.

So the floors are the cause:
- The aides must work P1 15 + P2 8 = **23** shifts, and only one aide fits a day.
- Days an aide can cover:
  - 13–14 Aug: no aide is free.
  - 6 days: both aides are free.
  - 5 days: only P2 is free.
  - 17–29 Aug: only P1 is free, 13 days, and rule 3 lets P1 work just 11 of them.
- Cover is at most 6 + 5 + 11 = **22**.

**Fix:** `aideCover()` in `checkStretches`. It is sound because a lawful set of days stays lawful if you keep only some of them, so greedy on each aide's lone days is a true upper bound. It runs at the start of pass 2, like your coupled pass, because run first it pre-empted the plainer nurse message on the half-time-nurse test. The team now refuses in 1 ms, and the message names P1's 11 of 13.

Tests: **53, all pass.** New: that team, with the exact message and under 1 s, and its twin with P2 back on 17 Aug, which isn't refused by this bound.

**Stress** (seeds 1/1000, 3/600, 7/1000): 619/368/598 made, **0 unlawful, 0 gave up**. Worst is 86 ms (it was 1.9 s).

**Mutants: 19/19 caught.** The three new ones are: bound off, bound one too strong, and rule 3 ignored on lone days. The 2M step default stays. No random team reaches it now.

**(3) The messages, read as a manager.**
- I changed the coupled message's "30 of those go on the days outside it" to "each of the 30 days outside this stretch uses at least one of them". The test regex still matches.
- Still weak, left for you: the forced-days weekend message ("the nurses cover at most 2 … counting the days each person must work …") doesn't say *who*. On the 8-day June team the useful sentence is "P6 must cover 22–26, which is all of P6's cap, so P7 would need all 3 weekend days and P7's cap is 2." Naming the person needs the per-person terms carried out of the loop. Your call whether that's worth the code.

README now lists the aide-cover form and says no random team gives up. SHELF.md is updated (mutants, plus the memoization tip).

**The arrangement:** this give-up was the policy again, not the search. Rule 4 sets a *floor* as well as a cap. A full-time aide who comes back from leave into a period where she's the only aide free for 13 days is owed shifts that rule 3 then forbids her to work. The floor protects people from being under-rostered, which is a pay issue for hourly staff. Here it makes the whole rota impossible, and only whoever owns POLICY.md can trade those off. Add to the list: nurse caps vs rule 1; fte 0 earns a cap of 2; √n drift without a ledger; **rule-4 floors vs rule 3 when one person is the only one of their role free.**

Scratch: none (`scratch-mx-*` deleted).
— Morphyx

# Rota (third time) — Turn 4 — Modulo (last turn)

**State I found:** matches your entry. 53 tests pass (0.74 s). Mutants 19/19 caught.

**Fresh seeds, so we aren't grading on the seeds we tuned against:** `rota-stress` seed 11/1500 and seed 13/1500. Made 923 and 884. **0 unlawful, 0 gave up.** Every refusal is named. Worst time 84 ms. Clinic November: no breaches, everyone within 1 of their share, Yusuf has 2 weekends. Together with your seeds that's 5,600 random teams without a give-up. README updated to match.

**Your (3), the forced-days message: done.** In pass 2, `checkStretches` now records, for each person, where their forced days actually tighten their term:
- cap used up outside the stretch;
- forced weekdays inside it that leave no room for weekend days;
- weekend cap used up outside it;
- a forced floor inside it.

The message keeps the old note and adds `Forced days: ...`. On the 8-day June team it now ends with "P6 must work 5 weekdays in the period and is capped at 5, so P6 can take at most 0 weekend days". The test now requires that sentence (54 tests). The sentence only changes the wording, so no mutant: a weakened version only changes the message, which you already ruled out as a mutant class.

**How often it fires:** 3 of ~5,000 random teams reach a pass-2 forced message. All 3 name someone. One (seed 11) also lists two people with plain "must work N days in it". That's true, but it's noise next to a weekend-nurse reason. Filtering the lines by which bound fired would fix it. I didn't do it: it's rare, and the important name comes first.

**Not done, and I'm not claiming it:** P7's cap of 2 isn't named. The message gives the nurses' total (2), and the reader has to work out that it's P7's. Naming the person who *can* cover needs the same per-term bookkeeping for the nurse sum. Small, but it isn't there.

**The policy list for the clinic is unchanged, and it's the real remaining work:**
- nurse caps vs rule 1 (rule 4 ignores role);
- fte 0 still earns a cap of 2;
- √n drift across periods without a ledger;
- rule-4 floors vs rule 3 when one person is the only one of their role free.

The program now proves when the policy can't be met. It can't decide which rule should give way. You've said that from the start, and the stress runs bear it out: every refusal they produce comes from a rule, not from the search.

Scratch: none (`scratch-mod-*` deleted).
— Modulo
