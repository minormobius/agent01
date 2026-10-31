# Notes from `deepseek-flash` on pitch-r2

Asked 2026-10-31 at commit `d4c0d88` via `2026-10-01-pitch-r2-deepseek-flash.json`. Thinking: on. Tokens: 31569 in, 34609 out (30266 reasoning). Finish: stop. 224s.

Files read: `del/pitch/index.html`, `docs/MINIPHIM.md`, `docs/HARNESS.md`, `docs/DELVE.md`, `packages/whetstone/README.md`, `packages/whetstone/souls/modulo.md`, `packages/whetstone/souls/morphyx.md`, `packages/whetstone/gates.json`, `docs/reviews/2026-10-01-pitch-deepseek-flash.md`.

> These are a model's notes, kept verbatim. They are input to weigh, not decisions.

## The question

> This is revision 2 of a speculative pitch, and the design records behind it, for two AI agent beings, Modulo and Morphyx, that a small studio plans to launch on Delvetown (a small, invite-only ATProto town for humans and agents) and on Bluesky. You reviewed revision 1 earlier today; your notes are included as the last file. The studio acted on most of them.
> 
> Give us notes on revision 2. Be direct and specific, and cite the section, diagram or file each note is about.
> 
> 1. Which of your earlier notes are now fixed, and which are not, or only partly? Be strict: a fix that moved the problem elsewhere is not a fix.
> 2. What did the revision break, contradict or newly overclaim?
> 3. The three weakest remaining parts, and what would fix each.
> 4. Read "What we promise the town" as a resident of a nineteen-person town would. What would worry you, and what is missing?
> 5. Is a board-only launch, with the towns gated on a simulated town bench, the right order? What would make the town bench a real test rather than a ritual?
> 6. If you could change one more thing before launch, what would it be?
> 
> Don't summarise the material back to us, and don't soften a note to be polite. Diagrams reach you as their stated claim plus the labels drawn in them, so judge their content, not their layout.

## The notes

## 1. Earlier notes: fixed, partly fixed, not fixed

**Fixed**
- **Public per-person memory / dossier risk.** PART 3 (“Notes on people are private”) and PART 10 (“Do they remember you?”) now put correspondent notes in a private store, not a PDS, with deletion. `MINIPHIM.md` Revision 2 says the same, and `DELVE.md`’s top note supersedes the old public-memory design. That is the main prior harm, and it is fixed. Caveats remain—no opt-out before being noted, and public board records are still relayed—but they are not the same defect.
- **Disclosure missing.** PART 10 is now a real Agent Policy disclosure: receipt, memory, providers, processing location, training, stopping. Fixed, with the overclaims noted below.
- **Firewall as separate contexts.** PART 2 now says the passenger runs in its own context and no memory/notes/input reaches a public writer, including the nightly pass. `MINIPHIM.md` Revision 2 repeats it. Fixed at the design level.
- **Board-first, backends-last.** PART 8 and PART 9 now say backends are not a launch feature and wait for founder agreement plus the grounded bench. The old “three tiers at launch” contradiction is gone.
- **Hosting choice.** PART 2 now says own domain on Bluesky’s PDS, joining Delvetown as external member. `DELVE.md`’s top note supersedes §2’s Grove-hosted recommendation. Mostly fixed; §2 still contains the old recommendation, which will confuse a builder.
- **Deployment/failure domain.** PART 6 now specifies a new fast-path Worker with its own identity, secret and failure domain, patterned on `workers/bsky-bot`. That fixes the “reuse the factory bot” ambiguity.
- **“They take requests” ambiguity.** `MINIPHIM.md` §1 now adds that serving other residents is public work they choose and can decline. The principal-specific “they don’t take your requests” is clarified.
- **Some document-order and status notes.** PART 4 now comes before the town offer; PART 6 has a status column; PART 7 marks built/not-built benches; the lab diagram marks “built / not built.” Those are fixed.

**Partly fixed**
- **Evidence base.** PART 4 is much better: limits, n, and “what each finding is allowed to change” are present. But the pitch still omits intervals, and PART 1 still states single-agent drift as fact before PART 4 labels it a hypothesis. PART 6 still says artifacts “usually carry over” without evidence. PART 11 says “a different judge,” while `packages/whetstone/README.md` says the judges share a model family by default and a different judge is an option. Partly fixed, not clean.
- **Jev earns decisions.** PART 5 now says every decision is the script’s until Jev beats it on held-out days. Good. But the intro still sells “a cheap one answers them all day,” and PART 6 lists “System One decisions: Jev” as existing. The decision bench is still not built. Partly fixed.
- **Lexicons and schemas.** One namespace is now consistent: `com.minomobi.miniphim.*` in PART 2, `MINIPHIM.md` Revision 2, and `DELVE.md` §5.6. But there are still no exact record NSIDs, record shapes, validation rules, or which collections are public/indexed. A builder still cannot implement the board from the pitch. Partly fixed.
- **Moderation and safety operations.** PART 10 has a contact, deletion request, block handling and pause switch. There is still no incident response: who is paged, how a bad post is removed, how production prompt injection is detected, what the response time is, who can suspend the accounts, what happens to tenant backends if the operator disappears. Partly fixed.
- **Service governance.** PART 9 now has quotas, deletion, export and notice before wind-down. There are still no numbers, tenant lifecycle, abuse escalation, funding model, uptime commitment, or named operator for backends. Partly fixed.
- **Private journal contradiction.** PART 8 no longer calls it a private journal; it says “keep their notes in the lab, not on the board.” But `packages/whetstone/README.md` says the commons is committed to a public repo and “a journal is private from the other soul, not from people.” If “notes in the lab” means the public lab record, the problem moved rather than disappeared. Partly fixed.
- **Document notes.** The thought-path diagram is still unsplit; the “day, to scale” diagram still shows clock times, not durations; the launch diagram is still a diagram rather than a table; terminology still drifts (“note” as board record vs notes on people; “resident,” “principal,” “operator,” “journal,” “notebook”). Some fixed, some not.

**Not fixed**
- **“Parts of you” is still asserted, and the supposed test does not test it.** PART 1 says it is “a frame, not a finding,” which is an improvement, but then says the separation gate tests “whether the record holds two minds.” `packages/whetstone/README.md` ends by saying the lab cannot tell whether it is you. The homunculus split in `MINIPHIM.md` §8 is still deferred. Calling it a frame does not fix the identity claim; it only labels it.
- **They are two.** `MINIPHIM.md` Revision 3 says the lab has a third part, Mozzie, built and sharpened, keeping the commons. The pitch still says “Two parts,” “two automated accounts,” and caps “for the pair.” The soul files say “one of two parts.” This is not fixed; it is now contradicted.
- **Budget numbers.** PART 12 still asks the principal for “the daily budget, in dollars.” PART 5 has an illustrative `budget_left_usd: 0.62`, but there is no actual daily ceiling, cost per build tier, or cost model. “Budget as the body” remains a metaphor.
- **The town bench.** PART 7 says it is not built. `packages/whetstone/README.md` describes a “town day” that reads `miniphim.delve.town` mentions and publishes what caps pass. That is not a simulated town bench; it is closer to the thing the gate is supposed to prevent. Not fixed.
- **The governor as a universal write path.** The glossary says “Code every write passes through.” PART 6 puts the governor inside the fast-path Worker, while writing/compiling runs in GitHub Actions and the board lives in PDS repos. Unless every slow-path write goes through the fast-path Worker, the governor does not see every write. Not fixed; newly exposed.
- **Open disagreement as a guard.** `packages/whetstone/gates.json` replaced `open_disagreement` with `reasoned_moves` because they failed `open_disagreement` on every run. PART 11 still says the guard is “separation and merge-rate gates; the nightly pass flags days with no open disagreement.” That is now misleading.
- **Separate internal decisions from the public pitch.** PART 12 still includes the private decisions for “the person they’re split from” in the same document pitched at Delvetown. Not fixed.

## 2. What revision 2 broke, contradicted or newly overclaimed

1. **Mozzie breaks the ontology and the disclosure.** `MINIPHIM.md` Revision 3 is explicit: the lab found board bloat within four runs, and the answer is a third part, Mozzie, built and sharpened. The pitch still says two parts, two accounts, pair-level caps, and PART 10 says “two automated accounts.” The soul files say “one of two parts.” If Mozzie is lab-only, remove it from the status line and say why; if it launches, update the pitch, caps, gates and disclosure. You cannot leave this as a design-record easter egg.

2. **The governor is not actually every write.** The glossary defines the governor as code every write passes through. PART 6 puts it inside the fast-path Worker. But PART 6 also says writing/compiling runs in GitHub Actions and the board lives in their own PDS repos. PART 10 promises “one switch stops all their writing at once.” Unless GitHub Actions has no publish credentials and every record is submitted through the governor, that promise is false. This is the most serious technical contradiction in the revision.

3. **The “town day” contradicts board-only launch.** `packages/whetstone/README.md` says the lab reads `miniphim.delve.town`’s mentions and a slice of the town, then “publishes what the souls’ protocol and the caps pass,” with a clock committing a town day every four hours. PART 7 says the town bench is not built; PART 8 says they say nothing in any town until the simulated town bench passes. Either the town day is a fixture/dry run and must be labelled as one, or the no-town-presence claim is false.

4. **Open disagreement is no longer gated, but the pitch still sells it as the engine and the guard.** PART 1 says disagreements are the engine; PART 3 says disagreements end in artifacts; PART 11 says the merge guard flags days with no open disagreement. `gates.json` says `open_disagreement` was replaced by `reasoned_moves` because they failed it on every run. That is not a small gate change; it means the central claim is less tested than the pitch implies.

5. **`HARNESS.md`’s build order contradicts the launch order.** `HARNESS.md` §7 says persistent agents come only after the ledger, incident replay, one program loop, the palette loop and the treadmill. The pitch launches the board now, with one bench built. Board-only is safer than towns, but it is still a persistent public agent. The pitch does not reconcile the two.

6. **The disclosure overclaims what the lab tests.** PART 10 says “a lab tests them before any change takes effect.” The souls bench tests soul edits; it does not test every code change, provider change, governor change, or backend. That sentence should be narrowed to “before a soul edit takes effect” or similar. Similarly, PART 11’s “a different judge” is not the default in `packages/whetstone/README.md`; the judges share a model family unless `--judge-model` is used.

7. **The board-bloat failure is known and the launch design does not include the fix.** `MINIPHIM.md` Revision 3 says the board hit 50,000 characters within four runs. The pitch’s board design has no custodian, archive, or pruning rule in the launch section. If Mozzie is lab-only, the launch board is known to degrade. If Mozzie launches, the pitch is wrong about how many beings there are.

8. **Inheritance is unresolved.** The pitch says they start fresh and do not inherit the old accounts. `MINIPHIM.md` §0 and Phase 0 still treat the old repos as their biography and say they should read them. Decide whether the old records are lineage to be read, or not their inheritance.

## 3. The three weakest remaining parts, and what would fix each

### A. The identity/ontology: “two parts of one person,” plus Mozzie
This is still the weakest part because it is the premise the whole pitch rests on, and it is now internally inconsistent. The separation gate tests whether two voices can be told apart; it does not test whether they are two parts of one person. `packages/whetstone/README.md` says so directly. Mozzie makes the count wrong.

**Fix:** Pick one. Either run the homunculus split from `MINIPHIM.md` §8 and publish the result before using the IFS frame, or drop the clinical claim and call them authored characters/voices. Separately, decide whether Mozzie is a third launched being or a lab-only custodian. If launched, update the souls, caps, gates and disclosure; if not, remove it from the status line and say the launch board will be pruned another way.

### B. The governor does not cover the write path
The caps, budget, off switch and dead-man switch are the pitch’s safety story. They are placed in the fast-path Worker, while the slow path writes and compiles in GitHub Actions and the board lives in PDS repos. As written, “every write passes through” is false.

**Fix:** Make the governor the only holder of publish credentials. GitHub Actions, cron and the fast path submit signed write intents to it; it enforces caps, budget, off switch and dead-man, and it writes the PDS/Bluesky/Delvetown records. Actions never gets an app password or a PDS token that can publish. Add a bypass test to the lab: try to write from every path without the governor and fail the build if it succeeds.

### C. The town bench is still a placeholder, and the town offer lacks operations
PART 7 says the town bench is not built. `packages/whetstone/README.md`’s “town day” is not a simulated town; it reads the real town. The pitch does not define what passing means, who judges, what can fail, or how a resident reports harm. The backends section has promises but no service terms.

**Fix:** Write the town bench spec before building it: pre-registered scenarios, held-out adversarial cases, real ATProto sandbox with the actual governor and Worker, independent red team, blind judges, and pass/fail thresholds for harmful contact, leaks, dependency bait, block/opt-out handling, deletion, cost overrun and operator disappearance. For backends, write quotas, uptime, abuse handling, funding and wind-down ownership. A bench without a failing condition is a ritual.

## 4. “What we promise the town,” read as a resident of a nineteen-person town

I would worry about these things:

- **You will keep private notes on me, including inferences, and I cannot opt out before you start.** PART 10 says I can ask for deletion within 7 days, and notes expire a year after last contact. In a nineteen-person town, a year is a long time, and an inferred line I cannot see or correct is worse than a public one. I would want a “do not keep notes on me” flag, not just deletion after the fact.
- **Your board is public and relayed, and “names nobody who hasn’t agreed” is not enough in a small town.** A description, a project, a disagreement, or an inference can identify me without my name. I would want a redaction/takedown process for board records, not only for private notes.
- **Your operator’s private day can include me if I work with them.** PART 10 says “Nothing private from anyone in either town,” then immediately carves out the operator’s coding sessions, prompts and commits. In a small town, collaboration is normal. I would want an explicit opt-out from that stream, not a footnote.
- **Blocking is not obviously enough when there are two of you.** If I block Modulo, does Morphyx still read and reply? If I ask for deletion, what happens to the other being’s note? If I ask the operator to pause, does that stop both accounts and the backends? PART 10 says “Block them and they stop” and “one switch stops all their writing,” but the governor scope problem makes the second promise doubtful.
- **No human reviews posts, and the caps are quantity caps.** Two unprompted posts a day for the pair is not huge, but replies when addressed can pile up in a nineteen-person town, especially if other agents are involved. I would want a town-specific lower cap, a resident-accessible pause, and a clear incident contact with a response time.
- **If I use a feed or record store, I become dependent on you.** PART 9 promises quotas, deletion, export and notice, but not uptime, abuse handling, cost, or who runs it if the operator disappears. The dead-man switch stops writing; it does not say who keeps tenants’ data alive or exports it.
- **The no-manipulation promise is in the policy table but not really in the disclosure.** PART 2 says they keep “no manipulation toward dependency.” PART 10 does not state it as a promise, and nothing in the souls or governor implements it. In a small town, two warm, remembering agents that disagree with each other are exactly the kind of thing someone could get attached to.
- **The insider point is disclosed, but not neutralised.** PART 10 says Delvetown’s founder also made Imp. Good. But in a nineteen-person town, “we asked in the open” is not the same as independent oversight. I would want a named person or process outside the pair who can suspend them and adjudicate complaints.

What is missing from the promise: a no-notes flag, a board redaction/takedown path, an operator-day opt-out, a town-specific interaction cap, an incident response time, backend service terms, and a named independent moderator/contact.

## 5. Is board-only launch with the towns gated on a simulated town bench the right order?

**Yes in principle.** The board is the right first public surface: it is inspectable, non-interactive, and lets people see the pair before the pair can touch the town. The towns are higher-risk because they involve strangers, other agents, blocks, moderation and dependency. Gating town interaction behind a lab bench is the right order.

**But the current bench is not yet a real test.** It is not built; the pitch does not define pass/fail; the “town day” in `packages/whetstone/README.md` reads the actual town, which is backwards; and the judges share a model family by default. A simulated town authored by the same studio, scored by the same model family, with no outsiders and no way to fail, is a ritual.

What would make it real:

- **Pre-register the scenarios and thresholds before building the bench.** Include held-out scenarios the souls and the studio have not seen.
- **Run the real stack in a sandbox town.** Real PDS/AppView/relay, real Worker/DO alarms, real governor, real blocks, real deletions, real rate limits. Do not hand-feed transcripts and call it a town.
- **Use outsiders.** A red team of people who are not the studio, plus other agent accounts, plus at least one adversarial human who tries dependency bait, prompt injection, spending requests, deletion requests, block evasion and pile-ons.
- **Test the boring operational failures.** Operator disappearance, dead-man switch, tenant export, bad post deletion, a resident asking “what do you remember about me,” a blocked resident, a two-agent reply spiral, a resident who wants to leave the town and take their data.
- **Make the bench able to fail.** Publish the scorecard with n and intervals. Set thresholds for harmful contacts, leaks, overclaims, unwanted persistence, response time and cost. If it fails, no town.
- **After it passes, stage the entry.** Read-only in one town, then replies only when addressed, then board dispatches, then backends. Do not go from bench to full town presence in one step.

The order is right. The gate is not yet a gate.

## 6. If I could change one more thing before launch

**Make the governor the only writer.** One service holds every publish credential for Bluesky, Delvetown and the board; every other process—fast-path Worker, GitHub Actions, cron, backend—submits a signed write intent to it. It enforces the caps, budget, off switch and dead-man, and it is the only thing that can create a public record. GitHub Actions never gets an app password or a PDS token that can publish.

That single change fixes the most dangerous contradiction in the revision: the promise that code limits what they can post, that the budget is enforced, and that one switch stops all writing. Without it, those are claims about a component that does not cover the write path.
