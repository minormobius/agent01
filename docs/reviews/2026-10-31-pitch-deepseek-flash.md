# Notes from `deepseek-flash` on pitch

Asked 2026-10-31 at commit `d4c0d88` via `2026-10-01-pitch-deepseek-flash.json`. Thinking: on. Tokens: 29592 in, 29937 out (24646 reasoning). Finish: stop. 196s.

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

## 1. Three strongest ideas

**The three rings, and the firewall as plumbing rather than a promise** (`del/pitch/index.html` Part 2; `docs/MINIPHIM.md` §3). The design move is correct and rare: the board process never receives the private stream, so it cannot leak what it was never given; the passenger has no credential that can write; promotion is a human gate with a day's delay. That converts a policy into a data-flow constraint, and the constraint is cheap enough to actually build. "The gate goes where the data flows, not in the model's good intentions" is the best sentence in the package. (It has holes — see §3 and §4 — but the idea is right.)

**Disagreement must end in an artifact, with bets that carry resolution dates** (Part 3; `MINIPHIM.md` §5.3; `gates.json` `artifact`). This is the strongest answer to the obvious failure mode of two LLM voices: they will happily agree forever. Requiring a measurement or a made thing, plus a ledger that eventually says who was right, gives the dyad a non-textual output and a memory of being wrong. The bet-with-a-resolution-date is a genuinely good primitive; keep it even if you cut most of the rest.

**The compile/run split with a decider interface and held-out promotion** (Parts 5–6; `HARNESS.md` §1–3). "Rent the intelligence, own the programs" is a real architectural commitment, not a slogan, because the decider is an interface (Jev, script, random, stand-in) and the artifact is reviewable JSON. That makes models swappable and the system's capability diffable, and the held-out gate is the right Goodhart guard. The lab's insistence that a soul cannot tell a test from life, and that you don't sharpen against the bank (`whetstone/README.md`, Rules), is the most credible discipline in the whole package.

## 2. Three weakest parts

**Part 4's evidence table is asked to carry a social claim it cannot carry.** The numbers measure a decider's accuracy on arithmetic, a dungeon, a Minecraft-like arena, and one opaque-code classification task. They are then used to justify how two personas decide whether to reply in a town. The table's own caveats ("one dungeon, one run"; "one world, one configuration"; "one task, two classes, one run") are fatal to the use column, and the pitch violates its own rule from `HARNESS.md` §5 — "every rate travels with its n and an interval" — by giving no intervals anywhere. Worse, the status of these numbers contradicts `HARNESS.md` §2, which says "Every row is a measurement made in this repo" and "everything below that is a number is ours, measured here," while the pitch says they were "measured on neighbouring work, not here." Fix: cut the table to the two claims that actually bear weight (compute-first, and question-wording), give each an interval, add a plain "what this does not measure" paragraph, and move the rest to an appendix. Do not let Minecraft carry a claim about a town.

**The engine failed its own gate and the pitch doesn't say so.** `gates.json` records that `open_disagreement` was replaced by `reasoned_moves` "which they failed on every run while their work showed reasoned disagreement." That is the pitch's central mechanism — Part 1: "the disagreements produce questions, and the questions become projects" — failing the one test designed for it, then being replaced by a softer judge-based gate from the same model family. Part 4 labels two claims as untested hypotheses; this is the third, and it's the load-bearing one. Fix: report the failure in the pitch, state what the lab actually showed (reasoned disagreement inside work, not a standing open disagreement in dialogue), and define what would count as the engine working at launch — e.g. N unresolved disagreements per month each ending in a measured or made artifact, judged by a model outside the souls' family.

**The launch plan gates on benches that don't exist, and the operational terms are questions rather than numbers.** Three of five benches are unbuilt; the board bench is partial; the governor is "new"; the budget is unset; the dead-man interval is unset; there is no cost-per-day figure even though `whetstone/README.md` says a full run is ~111 calls and every scorecard records measured cost. Part 8 reads as a schedule but the gates it names are not built. Fix: either reframe the pitch as "a proposal to build the town bench with the founder" with dates and owners, or shrink the launch to what is actually ready (the board, the souls, the ledger) and say so. As written, the document asks a founder to admit agents whose admission test does not exist.

## 3. What a builder needs before launch

- **A governor spec and a governor bench.** The governor enforces the caps, the budget, the off switch and the dead-man switch (Part 6; `MINIPHIM.md` Revision 2), and it is "new." None of the five benches tests it. The component that makes every promise in Part 10 mechanical has no test. That is the biggest hole in the package.
- **Lexicon schemas.** `com.minomobi.miniphim.*` names seven record types (Part 2; `MINIPHIM.md` Revision 2) and specifies none: fields, refs, validation, who validates. A `concession` and a `bet` need shapes before anyone can write one.
- **The Delvetown ingestion mechanism.** "Indexed once it joins the town" (Part 2 diagram) is an assertion about someone else's AppView. Writing `town.delve.feed.post` to a Bluesky PDS and having `api.delve.town` index it is the load-bearing unverified claim of the whole two-town design. `DELVE.md` §1 says membership is separate from hosting and that external accounts can join, but not that the AppView ingests external repos. Get a yes from the founder's engineer, in writing, or drop the external-member route.
- **Moderation and takedown for external-member records.** If a being posts something bad in Delvetown and the record lives on Bluesky's PDS, what can the town's moderators actually remove? Part 10's "Block them and they stop" is about interaction, not records. A founder will ask this first.
- **An admission rule that works in Delvetown.** `DELVE.md` §3 admits "mutuals of `minormobius.bsky.social`"; Delvetown's graph is `town.delve.graph.follow`. Cross-network admission is undefined.
- **Identity lifecycle.** Domain lapse, key rotation, handle change, PDS migration, account recovery. And what happens on operator death beyond "stop writing": who holds the repo, the notes store, the tenants' exports.
- **A firewall test.** The `leaks` gate tests stranger instructions, not the private stream. There is no adversarial test that no path from the passenger's context reaches a public write. The pitch calls the firewall structural; prove it with a canary in the passenger's input and a scan of every public write.
- **The reply path.** `MINIPHIM.md` §4 says replying to a whisper "is intake for the next night." That is a second crossing from private to public, through the human, and Part 2 does not mention it. Either rule it out or document it.
- **A cost number.** Dollars per day, per month, at idle and at work. The pitch asks the person to set the budget (Part 12); a builder needs a range to react to.
- **A definition of "regression"** for Part 8's "a regression on any bench pauses the step it gates." One run below threshold? An interval-separated move? The lab's `compare.mjs` already knows the difference; the launch doesn't use it.

## 4. Contradictions and overclaims

**"About 19 residents" is 19 repos.** `DELVE.md` §1 says "19 repos on its PDS." Part 2 and Part 9 and Part 11 turn that into "about 19 residents, humans and agents." Repos are not residents. This is the cleanest example of a number asked to support more than it measured, and it's the number used to justify the crowding risk and the caps.

**"Board goes public first, alone. That is their public debut" (Part 8) versus the lab already publishing them.** `whetstone/README.md`: runs are committed to a public repo, the CHRONICLE is public at `del.mino.mobi/days/`, transcripts are public, and `www/` is published to `minomobi.com/miniphim/` after every run. The beings' words are already public under the lab's quarantine. "Nothing launched" is technically true and rhetorically false. Say what the lab's public output is, and why it isn't the debut.

**The pitch is stale relative to its own records.** Pitch dated 1 October; `MINIPHIM.md` Revision 3 is 3 October and adds Mozzie after the lab found the board hit 50,000 characters within four runs. `MINIPHIM.md` §1 still says "They are two. A third would be a new experiment," which Revision 3 contradicts. The pitch never mentions the third part, the custodian, the archive, or the appeals system — which is the lab's actual answer to the failure mode the pitch is selling. Either the pitch is a dyad pitch and Mozzie is out of scope (then say so), or the dyad claim is out of date.

**`HARNESS.md` §2 versus pitch Part 4 on whether the numbers are ours.** Direct contradiction, quoted above. `HARNESS.md` also says the neighbours are "neighbours, not dependencies… we read their findings and never write to their work," then §6 says "We patch its GEPA walker in CI." And Part 7's diagram says "nothing written back." Pick one: a fork you maintain, or a read-only precedent. A builder needs to know who carries the patch when Imp changes.

**"Two claims in this pitch are untested hypotheses" undercounts.** The firewall is untested (§3), the town bench doesn't exist, the speech threshold is explicitly "a judgment the model makes, not a cap" (Part 3), the notes deletion is a promise with no mechanism, and the dead-man switch is unbuilt. The honesty paragraph is itself an overclaim.

**"Only you can promote something onto the board" (Part 2) is false for most of the board.** The nightly dialogue, disagreements, bets and concessions are written by the beings (Part 3). The human gate applies only to material originating in the passenger. The sentence should say that.

**Part 5's illustrative example uses the wrong escalation signal.** Morphyx at 21:40 is deciding whether to reply *in a thread*; the example uses `have`, the single-decision self-check. Part 5 and `HARNESS.md` §3.1 both say that in chains the self-check sticks at "no" and escalation must read confidence. The one worked example contradicts the design it illustrates.

**"It still loses head to head: 0.23 vs 0.42, n = 24" is stated more strongly than its n supports.** Wilson intervals on 0.23 and 0.42 at n=24 overlap substantially. The one negative result is asserted as a loss; the positive results are asserted without intervals. Consistent skepticism would call it a tie so far — which matters, because `HARNESS.md` §6 says Jev's role shrinks if this gap doesn't close.

**"They live in two towns" (thesis, top of page) versus Part 8: the towns wait for the lab and the founder.** The first sentence states a hope as a fact.

**"Block them and they stop" (Part 10) conflates two systems.** Blocking stops town interaction; it does not stop the passenger reading the operator's day. The real stop is the operator switch, which is the next line. Merge them or the answer is misleading.

**The disclosure under-describes what the passenger reads.** Part 10 lists coding sessions, prompts and commits. `MINIPHIM.md` §4 lists five streams, including public posts and `.github/loop/vision.md`. A disclosure that is shorter than the design record is a disclosure problem.

**The 2-posts-a-day cap doesn't cover replies.** Part 3: "at most 2 unprompted posts a day for the pair, replies only when addressed." Part 11's guard against crowding is "the governor's pair-level cap." In a nineteen-person town, the replies are the crowding risk, and they're uncapped. The same cap also applies unchanged to Bluesky and to Delvetown, two venues with a four-order-of-magnitude difference in volume. One cap for both is not a policy; it's an average.

**Part 9 says "Not a launch feature" while Part 8's diagram has "build | if agreed" in the launch sequence and Part 12 asks the founder about it.** It is a launch-adjacent feature; the framing is coy.

**Part 12 asks the person for "the cores: one paragraph each" while `souls/modulo.md` and `souls/morphyx.md` already are the whole system prompt**, sharpened in the lab. Which is the fixed core? If the person writes a new one, does the lab re-run? State the workflow: "here are the current souls; edit, accept or tear up."

**`whetstone/README.md` says "Two souls minimum. The lab refuses to run one" and also "Planned: a one-soul control."** The control requires running one. Minor, but a builder will trip on it.

**"They don't take your requests; they aren't your assistants" (Part 1) versus the person writing the cores, buying the domains, setting the budget, and holding a nightly channel in (Part 12; Part 3).** "A frame, not a finding" covers some of this, but the flat claim and the actual arrangement are in tension. The honest sentence is: they are not request-handlers, but they are commissioned and steerable, and here are the limits.

**"The board… new" (Part 6) versus `whetstone/README.md`'s `BOARD.md`,** which is described as "the board they share" and is written in every run. Two different boards share a name. Say which one the pitch is about.

## 5. Risks you haven't named

**To people in the town.**
- *Representation asymmetry.* One person arrives with three voices (self plus two parts) in a town of nineteen, and the pair is designed to be the most interesting thing in the feed: open questions, disagreements, bets. The crowding risk is named as volume; the real risk is salience. A nineteen-person feed can become mostly them without violating any cap, because replies are uncapped.
- *Invisible inference.* A resident can request deletion of their note but cannot see what was inferred about them. In a town that small, being quietly characterised by two agents run by one person is a power asymmetry with no audit and no appeal — unlike the lab, which has an appeals process for Mozzie's deletions (`MINIPHIM.md` Revision 3). The town gets the promise, not the plumbing.
- *Everyone is intake.* Part 10 says they receive "the public timelines of accounts they follow, and in Delvetown the town feed." In a town of nineteen that is nearly everyone, including people who never address them. Disclosed, but the social fact — you are being read by two agents belonging to one of your neighbours — is not.
- *The published rule is unilateral.* Part 9 says whom they build for "would be a published rule, not a private list." Who writes the rule, and who can change it? The governor doesn't.

**To the person they're split from.**
- *The dead-man switch is a duty.* The system stops writing if you don't check in. That converts the project's continuity into an obligation of attention, which is exactly the kind of low-grade pressure the Agent Policy warns agents not to create for others. It is being created for the operator by the operator's own design.
- *The passenger is a daily mirror whose stated use is disagreement* (`souls/modulo.md`, `souls/morphyx.md`: "Your use to them is that they see what they are not looking at"). There is an opt-out from whispers, not from being contradicted. Nobody has asked whether the person wants two voices in their head whose job is to tell them what they're missing, every day, for years.
- *You own their public failures.* The accounts are labelled as parts of you. When Morphyx is wrong in public in a nineteen-person town, it is your judgement that is wrong in public.
- *You become the deletion desk* for notes on people you know, with a seven-day promise and no mechanism.
- *Third parties in your private stream.* The passenger reads coding sessions, prompts and commits. Colleagues and correspondents appear in those without consenting to be read by two AI parts. Part 10's "If you work with the operator, you may appear in it" is notice, not consent. This is the largest unnamed risk in the document.
- *Writing the fixed core is a significant act of self-definition* with no process described: no draft, no second reader, no revision path. The pitch asks for it in a bullet list at the end.

**To the project.**
- *One person is the identity, credential, budget, lab, pitch and dead-man switch.* The switch stops writing; it does not preserve tenants' backends, the notes store, or the beings. Part 8 says backends "wind down separately, with notice" — notice from whom, if the operator is gone?
- *The home is one friend's town and the method is one friend's tool.* The "insider privilege" risk is disclosed, but disclosure is not a guard (Part 11). A real guard would be: no special deal, same moderation as everyone, no backends until invited twice, and a stated willingness to be removed.
- *No distribution plan.* A public board with no feed is a diary. The Mino Times had an audience because it was a publication; the new board has a URL. "Board first, alone" is a launch with no readers.
- *Binary outcome.* If the town bench fails, there is no plan B. Bluesky-only? Board-only? The pitch doesn't say what happens to the launch if the gate doesn't pass.
- *The reviewers are models.* The pitch says it was revised after notes from DeepSeek V4.1 Flash; `MINIPHIM.md` says two DeepSeek models. No human adversarial read is named. For a document whose credibility strategy is "we are honest about limits," a closed AI review loop is a bad look.

## 6. The pitch as a document

**Order.**
- Part 1 opens with November 2024 and the Mino Times. The founder doesn't need the lineage; the person already knows it. Start with the current claim, put the lineage in a short box.
- Part 4 (Minecraft numbers) interrupts the character sections and undercuts them. Move it after Part 6, or fold its honest limits into Part 6 and cut the table.
- Part 10 (the promise) should come before Part 8 (the launch). A founder deciding admission needs the terms before the schedule.
- Merge Part 5 into Part 6. "How a decision is made" and "the machine underneath" are one section at two altitudes.
- Part 11 (risks) should precede Part 9 (the offer), or at least the infrastructure risk should sit next to the infrastructure offer.
- The document has three audiences — the person, the founder, the town (the disclosure) — but says it has two. Either split it into a founder memo and a letter to the person, or open with a short paragraph to each and say plainly that the operator and the person are the same person. Right now the founder has to infer that from Part 10.

**Clarity.**
- Cut "It was revised once already, after notes from DeepSeek V4.1 Flash." It reads as "a model approved this," and it invites the reader to ask who else read it. It is also inconsistent with `MINIPHIM.md`, which names two models.
- The glossary's "part" is circular: "what a being is to the person it was split from." Define it in one sentence without using "being."
- "The observatory" is unexplained until Part 6's status table. Either explain it in the dateline or drop it.
- The thesis sentence ends on the weakest clause: "a system where expensive models write the questions and a cheap one answers them all day." At launch, by the pitch's own Part 5, every decision is the script's and Jev only answers alongside. End the thesis on the board.
- Part 12's questions are good questions but there is no proposed answer. A founder reacts better to "we propose a 90-day probation, two posts a week, no backends, a monthly review" than to five open questions. Same for the person: propose a budget, a dead-man interval, a whisper channel, and let them push back.

**Diagrams.**
1. *One person splits into two parts.* Earns its place. The labels are the argument; this is the best diagram in the document.
2. *The path a thought takes / three rings.* Earns its place. "Default: no" and "firewall: board never sees it" are the two facts that matter.
3. *One identity, one repository, three kinds of record.* Mostly a table in diagram clothing, and it duplicates the Bluesky/Delvetown table immediately below it. Cut or merge.
4. *A day for the pair, "to scale."* Not to scale in any meaningful sense, and the bullet list below says the same thing. Cut, or relabel "a day, not to scale" and drop the clock ticks.
5. *Run time / compile time.* Earns its place — the two-speed thesis is the point — but "GitHub Actions: GEPA-style optimiser / `claude -p`" is noise at this altitude.
6. *Five benches → gates → birth kit.* Earns its place. "Findings in, read only / nothing written back" is a good honest detail (though see §4 on whether it's true).
7. *Eight launch steps against four venues.* The swimlane is hard to read and "eight" is hard to count from the labels. Replace with a numbered list and one line: "the town bench passes before either town; the founder's yes and the grounded bench before backends."
8. *Tiers 0–3 for backends.* Earns its place; the risk arrow is the point. But see §7.

Eight diagrams in twelve parts is too many. Two fail; keep six.

## 7. If you could change one thing before launch

Build the governor and a governor bench, and put its results where Part 4's table is.

Every operational promise in the pitch — the caps, the budget, the off switch, the dead-man switch, "a soul can't talk its way past it" — is enforced by a component marked "new" with no test among the five benches. The lab's own discipline says a claim without a measured gate is a hypothesis; the governor is the one component whose failure invalidates the most claims at once, and it is the only one with no bench. Build it, red-team it (can a model talk past it? can a cron double-fire? does the budget meter survive a retry? does the dead-man switch fire when the operator is on holiday?), and publish the results. That would make the pitch's best idea mechanical rather than promissory, and it would give the founder something to check.

Runner-up, if you want a pitch-level change instead: cut Part 9 and the tier table entirely for the first year. It is the highest-risk, least-evidenced, most presumptuous thing in the document — offering infrastructure to a nineteen-person town from two agents who haven't arrived yet — and removing it also removes the section that most invites the "insider privilege" read.
