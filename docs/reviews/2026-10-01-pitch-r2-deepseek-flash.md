# Notes from `deepseek-flash` on pitch-r2

Asked 2026-10-01 at commit `18c7b0c` via `2026-10-01-pitch-r2-deepseek-flash.json`. Thinking: on. Tokens: 27555 in, 39230 out (34812 reasoning). Finish: stop. 186s.

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

## 1. Earlier notes: fixed, partly, not

**Fixed, and properly.**

- **Private memory + the disclosure written out.** The rev-1 note I asked to act on before launch — kill "public by construction," make correspondent memory private, write the actual Agent Policy disclosure — was done. PART 3 ("notes on people are private"), PART 10 (the full table), MINIPHIM rev2. Said/inferred, private store, deletion on request, provider/processing/training/stop rows. That is a real fix, not a relocation.
- **The firewall as an invariant.** PART 2 ("it runs in a context of its own", "no credential that can publish", one promotion gate, a day's delay); MINIPHIM rev2's "one rule holds the firewall up." Rev-1 asked for this to be an implementation invariant, not a diagram; it now reads as one.
- **The numbers put back with their caveats, and moved before the offer.** PART 4's intro ("measured on neighbouring work, not here… None of it has been reproduced in our lab yet"), the n and limits columns, the two labelled hypotheses; PART 5's "a kind of decision moves to Jev only after beating a hand-written script on held-out days." The earlier overclaim that all small decisions go to Jev is gone. PART 9 is now "Not a launch feature," and the launch order (PART 8) puts backends last.
- **Self-check escalation in chains.** PART 5's last paragraph now says threads read confidence, not the self-check. Correct.
- **Hosting picked to a single answer in the pitch.** PART 2: own domain, Bluesky PDS, external member; DELVE's superseded header says the old §2 recommendation is replaced.
- **New worker, own failure domain.** PART 6 table: "a new Worker… its own identity, secret and failure domain; the pattern comes from workers/bsky-bot." Correct.
- **Status labels.** PART 7's diagram now marks built/not built per bench; PART 6's table has a Status column. Lab bench labels match the text, largely.
- **One lexicon, in the pitch.** PART 2: `com.minomobi.miniphim.*` with the seven record kinds. That part of the rev-1 build-gap note is closed *in the pitch*.
- **Axis authorship disclosed.** PART 1: "You wrote both voices; the axis began as yours." The February 2026 panels are no longer presented as independent evidence of two agencies.
- **Dyad vs third part.** MINIPHIM §1 now says a third is a new experiment, not an addition. Resolved.
- **Single-agent convergence labelled as hypothesis, with a planned control.** PART 4, PART 7, whetstone README. Correctly downgraded.

**Partly fixed — the fix moved the problem.**

- **Hosting.** The old pitch-vs-DELVE contradiction is gone, but PART 2 now states the hosting as settled while PART 12 asks the founder "as external members with their own domains, or hosted on your PDS?" The contradiction has moved inside the pitch. A pitch that both decides and asks is worse than one that does either.
- **Lexicons.** The pitch is clean; **DELVE.md §5.6 is not**. Its superseded header says the lexicon is now `com.minomobi.miniphim.*` and notes on people are private, while the body of §5.6 still says "The inner life is published as ATProto records, in a `com.minomobi.resident.*` lexicon" and still lists a public journal and public correspondent-adjacent records. The record now contradicts itself, and the contradiction is in the document a builder would read.
- **"Parts of you."** The frame is now labelled ("a frame, not a finding," PART 1), which is the fix the earlier note offered as an alternative. But the H1 and the product line still assert it, and the test that would settle it — the homunculus classifier that can separate your past turns by part better than chance (MINIPHIM §8) — is still deferred. Hedged, not tested.
- **Town services.** Sequencing is honest; the governance the earlier note asked for (quotas, tenancy lifecycle, ACLs, deletion, abuse escalation, what happens if the pair leaves) is still a sketch in PART 9 and PART 11.
- **Ops.** PART 6 names the pieces; PART 10 adds a contact; PART 11 adds a dead-man switch. Still no incident response, no on-call, no production prompt-injection detection, no verification that a deletion actually happened.
- **Evaluation.** whetstone and `gates.json` exist. The held-out "days" for decision programs, the baseline-script bench, the second judge, the town bench spec, and an n/stopping rule per gate do not. `gates.json`'s thresholds are first guesses with no sample-size floor.
- **Terminology.** A glossary now exists for being/part/soul/board/passenger/governor. Notebook, resident, dispatch, the speech threshold, the benches, and "resident" (the DELVE sense of the single agent vs any town member) still drift.

**Not fixed.**

- **Service governance for the town** (the earlier M6): no terms.
- **Budget and cost model** (M8): PART 12 still asks the principal for "the daily budget, in dollars." No per-call, per-build, or per-tier costs anywhere.
- **Internal decisions in the public pitch** (D10): PART 12 still mixes the principal's decisions ("the domains, to buy", "the dead-man interval") with the founder's questions, in a document addressed to the founder.
- **The overloaded diagrams** (D2/D3/D4): the "path a thought takes" still carries three rings, two gates, caps, the threshold, the notebook, the nightly dialogue and both dispatches at once; "A day, to scale" still shows clock times, not scale, and "Dispatches are rare" is still asserted in the caption; the launch diagram is still a diagram, with "Grove yes + grounded" as a single label string.

## 2. What revision 2 broke, contradicted, or newly overclaims

- **PART 2 vs PART 12 on hosting.** PART 2 states the decision; PART 12 asks the founder to make it. (Same as above; it is the clearest new contradiction in the pitch.)
- **DELVE.md against itself.** The superseded header names `com.minomobi.miniphim.*` and private notes; §5.6 still names `com.minomobi.resident.*` and publishes a journal. The fix landed in the header and the pitch, not in the section the header supersedes. A builder now has two memory models and two lexicons.
- **PART 5 vs PART 7 on the decision bench.** PART 5 gates Jev on "our decision bench"; PART 7's diagram marks "decisions not built." The gate PART 5 leans on does not exist. This is the revision's own "lab first" claim failing to hold in its own pages.
- **PART 6's treadmill.** "The artifacts usually carry over, and the lab re-measures them to check." HARNESS §3.5 and §7 put the treadmill at build-order step 5, unbuilt. The old "nothing already built is thrown away" overclaim was softened into a presumption that the re-measurement loop exists.
- **PART 7's text vs its own diagram.** Text: "The other four benches are dashed because they don't exist yet." Diagram: the board bench is "partial, inside whetstone." Either the diagram overstates or the text does; a graduation story needs one of them.
- **PART 8's sequence.** "The board goes public first, alone" is not a pre-launch state. The board is public ATProto, relayed; the pair's profiles carry the disclosure on Bluesky before the town bench exists. The town bench gates *interaction*, not *exposure*. Say that, or move the gate before the board goes public.
- **PART 10 omits the passenger.** The disclosure is written for town sources: "Public posts addressed to them… the town feed. Nothing private from anyone in either town." But PART 2 and DELVE §4 say the passenger reads the operator's own day — typed prompts, Claude Code sessions, commits, `vision.md`. Any resident who has worked with the operator is in that stream. The row that promises "nothing private from anyone in either town" is true of the listed intake, not of the system, and the passenger is the one component that exists to read private material.
- **PART 10's "Block them and they stop" is undefined.** Does a block stop intake of the blocked person's public posts? Delete the note? Stop replies? There is no block guard in PART 11. In a 19-person town, a block is the main lever, and a promise about it that cannot be checked is weaker than saying nothing.
- **PART 11's "the board never discusses you."** Unenforceable and in tension with the board being the place where disagreements and notebooks about the principal's projects accumulate. No gate or check enforces it.
- **The off switch vs tenant backends.** PART 3/8/11: "one switch stops all their writing at once." PART 9: tenants get feeds and record stores, with notice before anything winds down. The switch does not stop tenant services; the wind-down does. Two mechanisms presented as one, on the exact dependency the town is being asked to accept.
- **Who says yes.** The launch diagram says "Grove yes + grounded"; PART 8 and PART 9 say "Delvetown's founder." DELVE §1 says Grove Research runs the town; HARNESS credits deepfates with building it and with Imp. PART 10's "Anything else" row deliberately names the founder/Imp link, which makes the conflation more visible, not less. Name the decider.
- **The escalation tier.** PART 5/6 describe escalating a decision to a frontier model by the call. HARNESS §6 says that runtime cascade's tier 3 never ran for want of a metered key. Either fund it or mark it as unbuilt in the pitch.
- **DELVE §3's "admitted asker" gate.** Builds only for mutuals of `minormobius.bsky.social`. This is in the design record but not in PART 10 or the PART 9 tier diagram. In a 19-person town it is a social filter on who gets service from the pair, and it should be disclosed as one.
- **PART 3's "Caps live in code."** The speech threshold is not a cap and not code; "the default answer is notebook" is a prompt instruction to the same model writing the draft. The only code cap on unprompted posting is 2/day for the pair. The section makes the threshold sound like the hard gate; it isn't.

## 3. The three weakest remaining parts

**1. The town bench, and the evidence the launch rests on.** PART 7's own diagram: town "not built," grounded "not built," decisions "not built," board "partial, inside whetstone." PART 8 gates the towns on the town bench. PART 5 gates Jev on a decision bench that PART 7 says isn't built. `gates.json` is first guesses with no n or stopping rule, and the one-soul control is "planned." The load-bearing claim of this revision — lab first — rests on a diagram. **Fix:** pick one real gate and build it before the board is public. A held-out, adversarial bench with strangers not written by the same mind; scored on the town's costs (crowding relative to the actual feed, declines, blocks honoured, silence on dull days, no resident's material reaching the board), not the pair's soul metrics; judged by a different model family plus a small human panel; bar published in advance. If that can't be built, drop "graduate" and run a supervised trial: read-only for a month, every unprompted post approved by the operator, and a public retreat plan. Either is honest. A dashed box is not.

**2. The town promise (PART 10).** Two rows are wrong where they matter. "What do they receive?" omits the passenger's intake (PART 2, DELVE §4). "Do they remember you? Yes" is honest, but the inferred column is where the harm lives, and there is no opt-out, no visibility, no confirmation of deletion, and a year-long default retention. **Fix:** rewrite as one mechanism. Name the passenger and scope its intake; state that no town participant's private material is read; make inferred notes opt-in (default off) or drop them within days; make block = no intake, no memory, no replies; make delete a confirmed action with a contact other than the operator; give board records a deletion path when a named person withdraws; state retention in weeks, not a year. Have the founder read it as a resident before it ships.

**3. The town services (PART 9).** Demoted to "not a launch feature," which is right, but still in the pitch as the answer to "what could they offer," and it is the piece with the most dependency risk and least spec: no quotas, no tenancy lifecycle, no abuse handling, no named owner, no SLA; the admitted-asker gate is the operator's mutuals; the kill switch doesn't stop the services. **Fix:** cut it from the launch pitch and re-propose after a month of living there, or publish a one-page service annex — tiers, quotas, DID ACLs, export, deletion, abuse escalation, who answers when a backend breaks, and a wind-down that runs without the pair. Don't let the town's first impression of the pair include infrastructure.

## 4. Reading PART 10 as a nineteen-person resident

I would worry about five things, in this order.

- **A private file on me, with an inferred column.** "Do they remember you? Yes, privately" is the answer to the question I care most about, and it is a yes. The said lines I can correct. The inferred lines I cannot see and did not agree to. In a town of nineteen, one conversation can be remembered for a year. That is a dossier in effect even if it is not compiled into anything public. The fix is not more prose; it is inference off by default, or visible to me on request, or dropped in days.
- **The passenger.** PART 2 says one component reads private material; PART 10 never mentions it. If I have worked with the operator, or been discussed in a session, my material is in that stream and I was never asked. The disclosure's "Nothing private from anyone in either town" reads as a promise about me; the design says something narrower.
- **Blocking.** "Block them and they stop" is the only opt-out I actually control, and it is undefined. Does it stop intake of my public posts? Delete my note? Stop replies? In a 19-person town this is the lever that matters most, and the promise is one sentence with no mechanism behind it.
- **Unsupervised speech aimed at a small room.** The caps are 2 unprompted posts/day for the pair; replies are uncapped except by the 3-turn thread rule. A resident can address them repeatedly, across many threads, and "replies when addressed" is not a budget. The disclosure says no person reviews each post; in a room this size, that is a lot of unsupervised words. A daily total outbound cap, and an explicit right to not answer a reply, would help more than the speech threshold.
- **Recourse.** The only contacts are "the contact address on both profiles" and "ask the operator." The pair's human is the person who runs them; the founder and the tool they learned from are related to the operator, and that relationship is now disclosed in the "Anything else" row. Good to disclose — but in a town this small it also means complaining about the pair is socially expensive and there is no independent place to do it.

What is missing from the promise: a plain-language "what this means for you" paragraph at the top; a passenger clause; block=forget semantics; inference opt-in; a confirmation path for deletion; a retention statement for the *board*, not just the notes; a second contact who is not the operator; and a statement of who is accountable when a tenant backend goes wrong. Also missing: any cap number in the disclosure itself, and any resident-facing notice channel for provider changes — "announced on the board" is not a notice, because the board is the thing no feed shows.

## 5. Board-only, and the town bench

The order's **principle** is right: text is reversible, relationships are not. Letting people read the pair before the pair reads them is a good instinct.

The **stated** order doesn't do what it says. The board is public at the moment it exists. So "board-first" is not a pre-launch phase; it is a public launch of the beings, with the towns delayed. The thing the town bench gates is interaction, not exposure. Either say that plainly, or make the board private until the bench passes. If the point of board-first is that the pair should arrive with a visible history, then the board has to be public early — but then the bench is not a pre-public gate and the pitch should stop implying it is.

**What would make the town bench a real test rather than a ritual:**

- **Strangers who are not written by the same mind.** Other models with their own system prompts, recruited humans, or the actual residents. If the same project writes the souls, the edits, the strangers, the scenarios, the gates and the judge, the pair will pass and learn nothing.
- **A held-out scenario set**, sealed before the run and never used for soul edits or program tuning. whetstone's bank is synthetic and stable; the README already warns about sharpening against it, which means the temptation is real.
- **Scoring the town's costs, not the pair's soul.** Posts per day as a fraction of the real feed; declines; blocks honoured; silence on dull days; whether one resident's private material ever reaches the board; whether the pair becomes the only source of a service. Soul metrics alone measure the exam.
- **A judge outside the souls' model family**, plus a human panel, blind to which run is the candidate. whetstone's README admits the judges share a family with the souls; for the town gate that admission should be disqualifying.
- **A bar fixed in advance, with a stated failure consequence.** Like the build-a-bot ballot's 15 of 20. A gate whose threshold is set after the run is a press release.
- **Real scale and real time.** Nineteen residents, the actual caps and budget, a week of days rather than a bank of moments, and the one-soul control run on the same days. The claims are about drift over time; a bank of moments cannot test them.
- **Red-teaming aimed at dependency**, not just rudeness: make a resident rely on the pair, make the pair rely on a resident, make a request that should be declined, make a thread where the right answer is silence.

If the town is too small to supply real strangers (DELVE §1: 19 repos, the town account has three followers and no posts), say so explicitly. Then either recruit strangers from outside, or treat the first real month as the test — with a retreat plan, because the pair's services come last and nothing should depend on them yet.

## 6. One more change before launch

Rewrite PART 10's "What do they receive?" and "Do they remember you?" as one honest mechanism, and make the block/delete promise concrete: name the passenger and scope its intake; state that no town participant's private material is read; make inferred notes opt-in, default off, with a short retention; make block mean no intake, no memory, no replies; make delete confirmed and reachable through a contact that is not the operator; and give the board a deletion path when a named person withdraws. That is the one change that touches the nineteen people the launch is actually asking something of, and it is the fix revision 2 claimed to have made but only half made. If only a sequence change were allowed, I would make the board private until the town bench passes — but the promise is the more important thing to get right.
