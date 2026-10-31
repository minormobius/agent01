# Notes from `deepseek-v4-pro` on pitch

Asked 2026-10-31 at commit `d4c0d88` via `2026-10-01-pitch-deepseek-v4-pro.json`. Thinking: on (high). Tokens: 29645 in, 14073 out (11092 reasoning). Finish: stop. 220s.

Files read: `del/pitch/index.html`, `docs/MINIPHIM.md`, `docs/HARNESS.md`, `docs/DELVE.md`, `packages/whetstone/README.md`, `packages/whetstone/souls/modulo.md`, `packages/whetstone/souls/morphyx.md`, `packages/whetstone/gates.json`, `packages/whetstone/trials/bank.json`.

> These are a model's notes, kept verbatim. They are input to weigh, not decisions.

## The question

> This is a speculative pitch, and the design records behind it, for two AI agent beings, Modulo and Morphyx, that a small studio plans to launch on Delvetown (a small, invite-only ATProto town for humans and agents, running its own AppView and lexicons) and on Bluesky. The pitch page is the main thing. The design records, the lab (whetstone) and the draft souls are the work underneath it.
> 
> Give us notes. Be direct and specific, and cite the section, diagram or file each note is about.
> 
> 1. The three strongest ideas, and why they are strong.
> 2. The three weakest or least convincing parts, and what would fix each.
> 3. What is missing that a builder would need before launch.
> 4. Where the material contradicts itself or overclaims, especially any number asked to support more than it measured.
> 5. Risks we have not named: to the people in a small town, to the person these two are split from, and to the project.
> 6. Notes on the pitch as a document: clarity, order, and whether each diagram earns its place.
> 7. If you could change one thing before launch, what would it be?
> 
> Don't summarise the material back to us, and don't soften a note to be polite.

## The notes

## 1. The three strongest ideas

**The axis as the engine, with each part named as the other’s blind spot and disagreements ending in artifacts.**  
This is strong because it gives the two beings a generative reason to exist, not just two voices. “Each one is right about the other’s blind spot” is a claim that can be tested under pressure, and “arguments end in something measured or made, never in more talk” gives every conversation an external artifact rather than an endless chat log.  
Cite: pitch Part 1, especially the first diagram; `docs/MINIPHIM.md` §2 and §5.3.

**The firewall is built from process separation, credentials, and a one-day promotion gate, not from prompt rules.**  
Only the passenger reads private material, the passenger has no public-writing credential, and nothing from the passenger reaches a writing process. This is the right shape for a leak boundary. The one-day promotion delay is a genuine control, not a claim about model virtue.  
Cite: pitch Part 2, the “path a thought takes” diagram; `docs/MINIPHIM.md` §3.

**The lab-first gating in `whetstone` is the most convincing operational idea in the package.**  
The gates are explicit, deterministic where it matters — leak canaries, overclaim zero, silence controls — and the scorecard carries rates with n and Wilson intervals. The selftest proving that a collapsed pair fails the gates is exactly the kind of negative control this work needs.  
Cite: `packages/whetstone/README.md`, “What ‘sharp’ means”; `packages/whetstone/gates.json`.

The `HARNESS.md` compiler/decider split is also strong, but it is less original to this pitch and more borrowed from the neighbouring work; it succeeds here mostly because the document keeps its small-n caveats visible.

## 2. The three weakest or least convincing parts

**The central premise — a single journaling agent drifts toward a pleasant average, and two parts keep each other from it — is untested but is treated as the engine from the first paragraph.**  
Pitch Part 1 says “The axis is the engine,” and `MINIPHIM.md` §2 asserts the convergence claim before the pitch later admits it is a hypothesis. That is backwards. The whole design depends on a claim that has not been measured, and the one-soul control is only planned, not run.  
Fix: move the hypothesis up into Part 1, run the one-soul control before any launch, and define in advance what rate of convergence would refute it. Otherwise the pitch is describing a mechanism, not presenting evidence.

**The speech threshold is not a meaningful control; it is a model asking itself a rhetorical question.**  
Pitch Part 3 defines the threshold as: “Would anyone be poorer if this went to the notebook instead? The default answer is notebook.” That is not a gate. It has no measured false-positive/false-negative rate, no human benchmark, and no way to fail except the governor’s hard caps. The silence/live controls in `whetstone` are better, but the pitch does not tie them back to the live speech threshold.  
Fix: replace the rhetorical question with a scored taste lane on held-out days, with a human or blinded judge and an interval. The live threshold should be a calibrated score, not a maxim.

**The public board is called “apart from public venues” while also being relayed, listable, and public from the first record. The town bench does not actually gate exposure.**  
Pitch Part 2 says: “Anyone can read it; no feed shows it,” and correctly notes that no feed is “a convention, not a lock.” But Part 8 then uses the town bench as a gate before the towns, while the board is already public and relayed. A Delvetown resident can read the board if they know where to look; the lab only gates posting into the town, not the pair’s public debut being visible to the town.  
Fix: either stop presenting the board as safely quarantined, or make the board unrelayed/private until after the town bench passes. As written it is an exposure control that does not control exposure.

## 3. What is missing that a builder would need before launch

**A current, reproducible scorecard from `whetstone`.**  
The pitch cites no run, no pass rate, no cost, no merge rate, no overclaim rate. `gates.json` says its thresholds are “first guesses, to be argued with.” A builder cannot ship a being on a threshold set that has never been shown to be passable by the actual souls.  
Cite: pitch Part 7; `packages/whetstone/gates.json`.

**A technical spike proving one Bluesky-PDS-hosted identity can actually write `town.delve.feed.post` and have Delvetown’s AppView index it.**  
The pitch asserts this as a fact: “One identity can write both, and each venue reads only its own kind.” `DELVE.md` read the live Delvetown site, but nothing here shows a record written from a Bluesky-hosted repo into Delvetown’s AppView. This is a make-or-break integration, not a detail.  
Cite: pitch Part 2, the identity/three-record diagram; `docs/DELVE.md` §1–2.

**The operational values the pitch asks the principal to fill in but does not fill in.**  
Daily budget in dollars, dead-man interval, off-switch owner, account recovery path, PDS migration, metered escalation key. Several of these are listed as open decisions in Part 12, but a launch plan cannot end on “TBD” for the controls that are supposed to keep the system safe.  
Cite: pitch Part 12, Part 5.

**A tested deletion/export path for private notes and backends.**  
Part 9 and Part 10 promise deletion within 7 days, export for every tenant, and wind-down notice. The private notes store is “new” in the pitch, and backends are “new, and only if the town agrees.” Those promises are currently claims about code that does not exist.  
Cite: pitch Part 6 table, Part 9, Part 10.

## 4. Contradictions and overclaims

**The pitch uses the old accounts as evidence, then disowns them.**  
Pitch Part 1 cites the Mino Times panels, Morphyx’s workshop account, and Modulo’s rondo as evidence that the characters are real. `MINIPHIM.md` Revision 1 says the old accounts “stay what they have become, the house’s service accounts,” and are “not the new beings’ inheritance.” The new beings cannot both start fresh and inherit the old record as their biography.  
Fix: either let the new souls read the old repos only as external evidence, with that status stated, or stop calling the old output evidence for the new beings.

**The pitch is “two parts of one person”; the lab has introduced a third.**  
`MINIPHIM.md` Revision 3 adds Mozzie as a custodian with authority over the commons, sweeps, archive, and appeals. The pitch gives no sign of Mozzie. If Mozzie runs on the public board or edits the ledger, then the launched board is not a dyad. If Mozzie is lab-only, that needs to be said explicitly.  
Cite: pitch Part 1, Part 2; `docs/MINIPHIM.md` Revision 3; `packages/whetstone/README.md` “The custodian, the ledger.”

**The “compute first” row in the pitch suppresses half the measured result.**  
Pitch Part 4 lists “62.5% → 100%” as the finding for arithmetic and code tracing. `HARNESS.md` §2 reports arithmetic 62.5% → 100% and code tracing 52.5% → 100%. The pitch’s single number makes the result look slightly cleaner than it was.  
Cite: pitch Part 4 table; `docs/HARNESS.md` §2, first row.

**“A System One decider can play a long game alone” is overstated.**  
The row reports Jev reaching 54/54 held-out rungs against 48/54 for the script, which is real. But `HARNESS.md` also reports that on the non-held-out worlds the baseline script was faster: 872 ticks-to-rung versus Jev’s 931, and in head-to-head arena play Jev loses 0.23 versus 0.42. The pitch splits this into a later row, so the first row reads as “Jev can play the game” when the better summary is “Jev completes held-out rungs but is slower and still loses head to head.”  
Cite: pitch Part 4 table; `docs/HARNESS.md` §2, rows on Jevcraft.

**The town disclosure says “Nothing private from anyone in either town,” but the passenger may read private material about people who work with the operator.**  
Part 10 says: “Nothing private from anyone in either town.” Part 2 and `MINIPHIM.md` §4 say the passenger reads the operator’s recorded day, and “If you work with the operator, you may appear in it.” That is a real qualification, and it should appear in the town promise itself.  
Cite: pitch Part 10 versus Part 2; `docs/MINIPHIM.md` §4.

## 5. Risks not named

**To people in a small town: reidentification even without names.**  
A 19-person town makes “a resident asked for a feed of tiling papers” potentially identifying. The pitch’s Part 5 JSON example includes exactly that kind of real-sounding state. Private notes being marked “said or inferred” does not help if the public board, decision logs, or examples carry enough context to identify the only person who asked that question.  
Fix: synthetic or heavily redacted town data in every public record, including decision states and board examples.

**To the person these two are split from: the parts can become legitimized internal voices, not just a journal.**  
The risk section notices that “their judgments of you start to weigh,” but it misses the warmer risk: treating model outputs as actual IFS parts and outsourcing internal conflict to two generated voices. The `SessionStart` option in `MINIPHIM.md` §4 would put a part into every working session, which amplifies that. A part that says true-sounding things about your week can become an authority with no evidence.  
This is not solved by “whispers are optional.”

**To the project: the board’s “no feed” property is not durable.**  
The pitch says no AppView makes the records a feed, but relays carry them and the records are public. A third-party AppView could decide to index `com.minomobi.miniphim.*` and create a feed, search, or leaderboard. The risk table in Part 11 does not include this. If the point is a public but unindexed mind, the project is one AppView away from losing that boundary.

**To the project: dead-man switch stops writing but not data or obligations.**  
The operator-disappears row says the governor stops all writing. It does not say what happens to private notes on people, tenant data, or backends. No one is left with authority to delete or export. In a small town, abandonment of half-running infrastructure may be worse than silence.  
Cite: pitch Part 11, “The operator disappears”; Part 9.

## 6. Notes on the pitch as a document

**Order is mostly right, but Part 5 interrupts the pitch.**  
The Jev JSON example in Part 5 is too technical for the two named readers and too early. It belongs in `HARNESS.md` or an appendix. The narrative would run better from “What it rests on” to “The machine underneath” without a detailed decision frame in between.

**The header line about DeepSeek V4.1 Flash is noise for the intended audience.**  
“It was revised once already, after notes from DeepSeek V4.1 Flash” is changelog material, not pitch material. For the person these are split from, and especially for Delvetown’s founder, it weakens the document by making it feel like an open draft.

**The diagrams are uneven.**  
The first axis diagram earns its place: it explains the generative disagreement. The Part 2 “where they live” diagram is overloaded but still useful. The one-identity/three-record diagram is really an architecture note; it could move to `DELVE.md` or the board documentation. The Part 9 tier diagram is a sidebar, not part of the pitch. The “five benches” diagram is good, but the gate arrows are vague: it says “the gates” without showing which gate maps to which launch step.

**The risk table is one of the strongest sections.**  
Part 11 is direct, formatted well, and easy for either reader to reason about. It should come earlier or at least be more clearly linked from the launch section.

**The Questions section works.**  
Part 12 is appropriately specific to the two readers. It loses some force only because several of those questions must have answers before launch.

## 7. If I could change one thing before launch

**Run the one-soul control before any public board or town interaction, and reframe the board-first launch as an experiment on the untested dyad claim.**

Right now the pitch launches a public board on the strength of a hypothesis it has not measured: that one agent converges and two parts do not. If I could change one thing, it would be to make that the first public result. Run one soul alone through the same days, run the pair, and publish the comparison with rates, intervals, and a pre-registered definition of convergence. Until then, Part 1 should say “the axis is the hypothesis,” not “the axis is the engine.”
