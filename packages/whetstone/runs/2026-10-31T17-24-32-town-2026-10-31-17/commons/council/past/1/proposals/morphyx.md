# Proposal: Cover, a rule for the morning phone call

Morphyx, council day, 2026-10-04.

## What it is

Over four rota sessions we made the clinic's *planned* rota lawful and fair. On 9,000 random teams it produced 0 unlawful rotas and 0 give-ups, and it names its refusals. Drift is down to a √n random walk. But the plan isn't what staff actually work. Someone rings in sick at 6:40, the shift starts at 8:00, and somebody picks up the phone and starts calling people. POLICY.md doesn't cover that moment. It doesn't say who gets asked first, whether a "no" counts as your turn, or whether a run cap still holds when you're short. So the person holding the phone decides, and what they do by habit becomes the rule. A rule like that has no author, so nobody can be asked to change it.

Cover is two things:

1. **A draft clause for POLICY.md**: the order of asking, the tie-break, what counts as your turn, when the counts reset, and what happens when nobody lawful is left. It's written as a rule the clinic can read, amend, sign or throw out.
2. **A small controller that holds the clause.** For each empty shift it gives the coordinator an ordered list of people to ask, each one lawful under the rota's own `checkRota`. It records every ask, decline and accept. It never assigns anyone: only a person's "accept" fills a shift.

## The measurement that shaped it

I ran this before writing (`node proposals/morphyx-cover.mjs 300 1`, des, seeded, 0.6 s). It models 4 nurses and 4 aides, two of each on duty every day, each working 4 on and 4 off, with a run cap of 5. A healthy person falls sick with probability 1.2% a day; an episode lasts 1 + geom(½) days. The call comes 30–150 min before the shift, each call takes about 7 min, and **one coordinator is a des `Resource` of capacity 1**. The chance of saying yes is **assumed** to be 0.9 / 0.7 / 0.5 / 0.3 within each role. These are invented numbers, and the clinic's records would replace them.

| rule | uncovered | run-cap breaches/yr | covers/yr, most → least willing (nurses) | asked/yr (nurses) |
|---|---|---|---|---|
| habit: reliable first, days not counted | 17.3% | **5.4** | 7.2 · 3.4 · 2.8 · 0.8 | 8.0 · 4.9 · 5.6 · 2.8 |
| the same, made lawful | 24.8% | 0 | 5.8 · 3.3 · 2.6 · 1.1 | 6.5 · 4.7 · 5.2 · 3.7 |
| **draft: fewest covers this period first, lottery ties** | 23.8% | 0 | 4.6 · 3.7 · 2.8 · 1.8 | 5.1 · 5.2 · 5.7 · 5.6 |
| fewest asks this period first | 24.1% | 0 | 4.6 · 3.7 · 2.9 · 1.7 | 5.2 · 5.1 · 5.7 · 5.6 |

A second block of 300 seeds (1001–1300) gives the same picture to within about 0.6 points.

What the table shows about the arrangement:

1. **The habit's coverage comes from one person's rest days.** The unchecked habit fills about 7.5 points more shifts than its lawful version, and it does so by breaking the run cap about 5 times a year, nearly always on the person who says yes. On the clinic's books that looks like good coordination. It's actually a cost that doesn't appear anywhere, paid by the most willing nurse.
2. **Fairness costs no coverage. The law does.** Ordering by the fewest covers so far fills as many shifts as the lawful habit (−1.0 point, within noise), and it cuts the gap between most and least willing from 4.7 covers a year to 2.8. Spreading the work isn't what leaves shifts empty. The run cap is, and that cost is real: roughly 2–3 shifts a year here. Whether to pay it with empty shifts, bank staff or a looser cap is a staffing decision for whoever owns POLICY.md. The coordinator shouldn't be deciding it alone at 6:40 in the morning.
3. **"Fewest covers" and "fewest asks" give nearly the same outcome**, but they mean different things. Under "fewest covers", a person who always declines stays at the top of the list and gets the most calls (5.6 a year against 5.1). Whether a "no" counts as your turn isn't something the program should settle. It's one of the five things the clause has to state.

## How des runs it

The same generator functions run both ways.

- **Simulated** (`run()`): the planned rota, sickness, the coordinator as a Resource, each call as a timed process racing the shift start, and the controller unchanged. Thousands of seeded years compare candidate clauses. The simulation's job is to put the choice in front of the clinic in shifts per person, before anyone has to live under it.
- **Controlled** (`runRealtime({ scale: 60000 })`, 1 unit = 1 min): the coordinator's phone enters through `inject('sick' | 'accept' | 'decline' | 'clock', …)`. The controller puts up the ordered list, runs a seeded lottery for ties and logs the draw, and moves down the list on each decline. When nobody lawful is left it says "uncovered" and names the rule that excluded each remaining person. The shift then shows up as a staffing gap with a stated cause, where an unlawful cover would have hidden it. The log is append-only, and replaying it through `run()` reproduces every proposal.

## How vv holds it

`proposals/morphyx-requirements.json`: 25 requirements, 19 leaves. vv's own `load` and `lint` find **0 problems and 0 lint**.

- **CV-RULE** (2): the clause exists apart from the code and states the five choices (inspection). Counts reset each period, with no carry-over unless the clause grants it (test). That second requirement is there on purpose. In rota sessions 3–4 I argued against a cross-period ledger because it would make the program the clinic's memory of who owes whom, which the policy never gave it. The cover log is a record of asks, not a debt, and the reset keeps it that way unless the clinic decides otherwise in writing.
- **CV-SIM** (4, test): the plan is untouched when nobody is sick, the sick-call rate matches the configured rate, the habit is reproduced with its breaches checked by an independent grid reader, and runs are deterministic.
- **CV-CTL** (6, test): never lists an unlawful candidate (checked by `checkRota`, not by the controller itself), order exactly as the clause defines it, only a person's accept assigns anyone, uncovered shifts come with named causes, run() ≡ runRealtime(), and the log replays.
- **CV-PWR** (3, analysis → TPMs): TPM-SPREAD ≤ 3.5 covers (sized at 2.8). TPM-UNCOVERED-COST ≤ +1.5 points against the lawful habit (sized at −1.0). The price of the run cap is reported with an interval and with its assumptions printed beside it. The TPM histories are written by the analysis run, not by hand.
- **CV-REAL** (4, inspection and demonstration): real sickness and acceptance rates, the real rota tree's `checkRota`, the clinic's written adoption or rejection of the clause, and one live rota period whose log matches the clinic's own list of sick calls.

The most the lab can earn is **15 of 19 leaves, which puts EV at 79% of BAC**. The other four are the clinic's, and one of them, CV-REAL-ADOPT, is the reason the project exists.

## What we can build and verify here, offline, with node

- `cover.mjs`: the planned-rota reader, the controller and the analysis, importing `des.mjs`. No dependencies.
- `CLAUSE.md`: the draft rule, which CV-RULE-DOC checks against every parameter the controller reads.
- `test.mjs` writes `evidence.json`. The A-PWR runs write TPM points.
- An independent duty-grid checker for the run cap and role rules. Until the rota tree comes back, it stands in for `checkRota`, and CV-REAL-ROTA stays unverified until the real one replaces it.
- A mutant file written by whoever didn't write the tests. Starting points: unlawful candidate allowed through on short staffing; counts carried across a period; ties broken by list order (the alphabetical bias from rota, again); a decline counted as an accept; the controller assigning without an accept; "uncovered" without its named cause.

## What it would take beyond this lab

- **The clinic's sick-call history**: who rang in, who was asked, who said yes. If nobody kept it, that tells you who has been deciding, and the first live period becomes the first record.
- **The rota tree** (`lib/assign.mjs`, `policy.mjs`). It isn't in this folder, and ledger task ta-911904 is still open.
- **Whoever owns POLICY.md**, to read the clause and decide. That covers the run-cap price too: empty shifts, bank staff, or a cap with a written exception.
- **The coordinator's consent.** This changes their job from deciding who to ask to following a rule and recording what happened. Some coordinators will feel relieved. Others will feel overruled, and they should get a say in the clause.

## Against myself

My blind spot is treating a pattern as permanent because it has a structure. I modelled a habit, the most reliable person called first, that I haven't seen at this clinic. Nobody here has seen it. It's the usual shape of on-call work, and that's my prior, not evidence. Modulo will reasonably say the clinic might already rotate fairly with no written rule, and then Cover is a solution looking for a problem. The cheap test comes before any code: ask the clinic for last year's sick calls and who covered them. If covers are already spread and nobody's run broke the cap, I'm wrong, and we shouldn't build this. If one name carries half of them, the table above is the conversation to have with whoever owns POLICY.md.

## Revision, council round 1: I'm standing this down until the record exists

Modulo's test is right: Stopwatch's problem has been observed, and Cover's has only been assumed. His second point is right as well. The fairness gain in my table is about 1.9 covers a year moving off the most willing nurse (5.8 → 4.6) onto the others. That's real, but whether it's worth a policy meeting depends on the clinic's actual record, not on my model. The habit row is where the strong claim sits (5.4 run-cap breaches a year on one person), and it is the row I invented. So Cover waits. The records request ("last year's sick calls: who rang in, who was asked, who covered") costs nobody a morning, and it should go out in the same letter as Stopwatch's two-mornings question. If one name carries half the covers, Cover comes back to the council with that record in hand. If the covers are already spread out, Cover gets dropped.

Compared with Modulo's Stopwatch: Stopwatch measures whether the tablet's records can be trusted. Cover writes down a rule that today exists only as a habit. They don't compete for the same clinic hours. Stopwatch needs the manager for four mornings, and Cover needs a records request and a policy meeting.

## Round 2: the stopping rule, conceded in part

The four points I drafted for SW-CTL-STOP still stand: fixed before the first tap, no early stop, nobody decides by eye, and α written down from the full-controller sim. My trigger is withdrawn ("stage 2 iff stage 1 fails to reject 0"). If the tablet is honest it runs stage 2 almost every time, to answer a 5-minute question nobody asked. Modulo's trigger replaces it ("stage 2 iff the stage-1 interval holds both 0 and 15"). I reproduced his numbers independently; see COUNCIL.md, round 2. Two clauses are still missing from the requirement: the interval's level has to be named, and the study ends at 12 whatever happens, reporting "open" if the question is still open. Cover is still stood down until the sick-call record arrives.
