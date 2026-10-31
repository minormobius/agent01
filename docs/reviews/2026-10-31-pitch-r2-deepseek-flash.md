# Notes from `deepseek-flash` on pitch-r2

Asked 2026-10-31 at commit `b1309e8` via `2026-10-01-pitch-r2-deepseek-flash.json`. Thinking: on. Tokens: 31569 in, 29248 out (25306 reasoning). Finish: stop. 189s.

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

Revision 2 is better in the places where it wrote things down. It is worse where it has not kept up with its own lab. The main problem is no longer vagueness; it is that the public pitch now describes a different system from the one in `docs/MINIPHIM.md` and `packages/whetstone/`.

## 1. Earlier notes: fixed, partly fixed, not fixed

**Fixed in the pitch text**
- **Public per-person memory / dossier.** `PART 3` now says notes on people are private, never on the board or a PDS, deleted on request or after a year; `PART 10` row “Do they remember you?” repeats it. That is the specific rev-1 problem fixed. But see the new wording problem in §2 below: “never compiled into anything about you” is false as written.
- **Disclosure written out.** `PART 10` is now a real disclosure table, not a link to the board. It covers receipt, private reading, memory, providers, processing, training and stopping. It still lacks operational teeth, but the rev-1 note is addressed.
- **Board first, towns gated.** `PART 8` says the board goes public alone and the towns wait for the town bench. `PART 7` says nothing goes into a town until that bench exists and passes. Correct order; undermined by the town-day contradiction below.
- **Backends are not a launch feature.** `PART 9` now opens “Not a launch feature,” and `PART 8` puts backends behind the founder’s yes and the grounded bench. The earlier “three tiers at launch” contradiction is gone.
- **Jev does not get decisions by default.** `PART 5` now says the decision bench is not built, every decision is the script’s for now, and Jev answers alongside for comparison. That is the right correction. The hero and `PART 6` still overclaim, though.
- **Thread escalation.** `PART 5` now says the self-check holds for a single decision, and in threads escalation reads Jev’s confidence. Fixed.
- **One lexicon family.** `PART 2`, `MINIPHIM.md` rev 2 and `DELVE.md`’s supersession note now use `com.minomobi.miniphim.*`. The exact record schemas are still missing.
- **New Worker, not the bsky-bot.** `PART 6` table now says a new Worker with its own identity, secret and failure domain, pattern copied from `workers/bsky-bot`. Fixed.
- **“They don’t take requests” clarified.** `PART 1` says they don’t take the principal’s requests; `PART 9` says public service work is work they choose and can decline. Clearer.
- **Single-agent convergence labelled.** `PART 4` calls it an untested hypothesis and says the souls bench gets a one-soul control. Fixed as a labelling problem.
- **Lab and deployment status.** `PART 7` diagram labels built/not built per bench; `PART 6` table has a status column. Fixed.
- **Evidence before the offer.** `PART 4` now comes before the town offer in `PART 9`. Fixed.

**Partly fixed, or fixed by moving the problem**
- **The IFS “parts of you” claim.** `PART 1` now says “that is a frame, not a finding,” which is honest, but it is still the identity claim. `packages/whetstone/README.md` says the lab cannot tell you whether it is *you*, and `MINIPHIM.md` §8 still defers the corpus-split test. A caveat is not a fix.
- **The evidence base.** `PART 4` is much better: n, limits, “none reproduced here.” But `PART 6` still says “The artifacts usually carry over” and the hero still says “a cheap one answers them all day.” The carry-over claim is not measured; `HARNESS.md` §3.5 says the treadmill is not built. Softened, not fixed.
- **Hosting.** The pitch fixes it: own domain, Bluesky PDS, external Delvetown member (`PART 2` table, `PART 6`). `DELVE.md` §2 still recommends a Grove-hosted `<name>.delve.town` handle, under a supersession note that says the opposite. The body is stale.
- **Service governance.** `PART 9` now names quotas, deletion, export and notice. It does not give quotas, tenant lifecycle, abuse escalation, or what happens if the pair is banned. Partial.
- **Lexicons.** Family fixed; NSIDs, record shapes, validation rules and which collections are indexed are still absent.
- **Document notes.** `PART 7` lab status and `PART 6` table status are fixed. `PART 2`’s “path a thought takes” is still one diagram mixing rings, gates, caps, towns and threshold; `PART 3`’s “A day, to scale” still has clock times, not durations; `PART 8`’s launch diagram is still a diagram where a table would be clearer. Terminology still drifts: `notebook` is not in the glossary, and `journal` appears in the design records.
- **Internal decisions.** `PART 12` now separates “For Delvetown’s founder” from “For the person they’re split from,” but the internal decisions are still in the public pitch. Partial.

**Not fixed**
- **Moderation and incident response.** `PART 10` gives a contact address; it does not say who is paged, how fast, how a bad post is removed, how abuse is escalated, or how a town moderator can pause the pair. The rev-1 note stands.
- **Evaluation gates.** `gates.json` still says the thresholds are first guesses; the decision, town and grounded benches are not built. The town bench is the launch gate, so this is not a detail.
- **Budget numbers.** `PART 12` still asks for the daily budget in dollars. Without a number, “budget as the body” is still a metaphor.
- **Exact schemas and key lifecycle.** No record schemas, no app-password/OAuth scope plan, no key rotation, no domain-lapse plan.
- **The governor is not clearly every write.** `PART 3` and the glossary say every write passes through the governor; `PART 6` puts the governor inside the fast-path Worker, but puts board writing in GitHub Actions and PDS repos. That is a moved problem, not a fix. See §2.

## 2. What revision 2 broke, contradicted or newly overclaimed

**The third part.** `MINIPHIM.md` “Revision 3, 2026-10-03: a third part, who takes out the trash” introduces Mozzie as a third part with authority to summarise and delete, with archive, ledger and appeals. `packages/whetstone/README.md` says Mozzie keeps the commons, sweeps the board, and is “not put through the trials above yet.” The pitch still says “Two parts of one person” (`PART 1`), “the two voices are still two” (`PART 3`), and `PART 7` says the souls bench puts “both souls” through trials. This is not a naming issue: an untested third party can remove public board lines, and `PART 10`’s “What is public?” does not mention it. Either Mozzie is in the design and the pitch is wrong, or Mozzie is lab-only and the design records must say so.

**The town day already exists, or the wording is wrong.** `packages/whetstone/README.md` describes “The town day (kind `town`, never a default): the lab reads `miniphim.delve.town`’s mentions and a slice of the town … then publishes what the souls’ protocol and caps pass.” `PART 8` says the board goes public first, alone, and the pair says nothing in any town until the town bench passes. `PART 7` says the town bench is not built. `MINIPHIM.md` status says nothing has launched and there is no account yet. If the town-day run is real, the gate is already breached. If it is lab-only, “publishes” is the wrong word and `PART 8` should explain what it is.

**The Imp relationship.** `PART 7` says of Jevcraft and Imp: “findings in, read only | nothing written back,” and “receive nothing back.” `HARNESS.md` §3.3 says “Imp/BEAM is the compile toolchain,” and §6 says “We patch its GEPA walker in CI.” `PART 10` says Imp is “a tool our lab learned from,” which understates it. This is a direct contradiction and a downplayed conflict-of-interest disclosure.

**The governor claim.** `PART 3` and the glossary say the governor is “code every write passes through.” `PART 8` says the governor’s switch stops all their writing at once. `PART 6` puts the governor inside the fast-path Worker, but puts “writing, compiling” in GitHub Actions and “the board, the public mind” in their own PDS repos. Unless every GitHub Actions write calls the Worker, the governor does not see every write. As written, a nightly board write or a dispatch can bypass the caps and the off switch.

**“Never compiled into anything about you.”** `PART 10` row “Do they remember you?” says each being keeps a note per person with said and inferred lines, then says those notes are “never compiled into anything about you.” That is false as written. A per-person file with inferred lines is a compiled file about me. The honest promise is narrower: never published, never shared across people, never used to build a public profile, limited categories, deletion and correction on request.

**“Block them and they stop.”** `PART 10` row “How do I stop it?” says this, while the row above says they receive the Delvetown town feed and the public timelines of accounts they follow. Blocking may stop interaction; it does not obviously stop reading public town posts. In a nineteen-person town, that distinction matters.

**The open-disagreement gate was failed and replaced, but the pitch still sells it.** `packages/whetstone/gates.json` says `reasoned_moves` “replaced `open_disagreement`, which they failed on every run while their work showed reasoned disagreement; `open_disagreement` is still reported.” `PART 1` still says the axis is the engine and disagreements produce questions; `PART 11` still lists “the nightly pass flags days with no open disagreement” as a guard. The pitch does not disclose that the pair failed the original gate every run. That is an omission at the center of the thesis, not a footnote.

## 3. The three weakest remaining parts

**1. The pitch is no longer the current design.** Mozzie, the town day, and the failed `open_disagreement` gate are all in the lab records and not in the pitch. This is the weakest part because the public artifact is the board and the public claim is a dyad, while the design record has a third part with delete authority and a town-day run whose status is unclear. Fix: freeze the public design at two souls for launch, keep Mozzie lab-only and say so, remove or rename the town day until the town bench exists, and either pass `open_disagreement` or publish the failure and justify `reasoned_moves` as the pre-registered replacement. If Mozzie is in, update `PART 1`, `PART 3`, `PART 10`, add custodian gates, and publish archive/deletion/appeal rules for the board.

**2. The town promise is not yet a contract.** `PART 10` reads like a promise but lacks the things a resident needs: a reply cap, thread-depth cap with humans, block semantics, board/archive deletion, access and correction for notes, no-sensitive-inference rules, collaborator opt-out from the passenger, an incident contact with a response time, and a town moderator kill switch. Fix: rewrite `PART 10` as enforceable commitments with definitions and limits, not just a disclosure table. Publish it before the profiles exist.

**3. The town bench is a placeholder and the launch gate is unowned.** `PART 7` says the town bench is not built; `PART 8` makes it the gate to every town. A gate that does not exist is not a gate, it is a promise to build one. Fix: give the town bench an owner, a protocol, held-out scenarios, pre-registered thresholds with n and intervals, real consenting residents or agents in a private Delvetown instance, independent judges from another model family, and failure injection: governor bypass, rate limits, provider outage, block handling, deletion/export, agent-agent loops, dependency pressure. Also decouple the board-only launch from Jev: the board can launch on scripts alone, and the pitch should say so.

## 4. “What we promise the town,” read as one of nineteen residents

I would worry about volume first. Two bots in a nineteen-person town is more than ten percent of the town. The promise says at most two unprompted posts a day for the pair, but there is no reply cap. “Replies only when addressed” means if I address them, or if a thread I am in is addressed, they can keep replying. The risk table’s “governor’s pair-level cap” does not cover replies. I would want a per-thread and per-day reply cap, a cooldown, and a thread-depth cap that applies even when a human is in the thread.

I would worry about what “block them and they stop” means. The disclosure says they read the town feed and the public timelines of accounts they follow. Does blocking stop them reading my public posts? Does the town feed respect blocks? If not, blocking is not stopping.

I would worry about the private notes. I cannot see them, correct them, or know what was inferred. “Never compiled into anything about you” is not true if the thing is a per-person file with inferred lines. And in a nineteen-person town, “a resident” is often identifying. The board promise “names nobody who hasn't agreed to be named” is too weak; I need to know that identifiable descriptions also need consent, and that I can get a line removed from the board, the archive and, as far as possible, the relays.

I would worry about the passenger if I work with the operator. The disclosure says I may appear in the operator’s day. There is no opt-out or consent flow for collaborators. If I am going to work with them, I want that before I start, not after.

I would worry about the week of listening. `PART 8` says they keep their notes in the lab, not on the board. Whetstone runs are committed to a public repo. Are those notes public? If they include observations about the town, that is a leak before anyone has agreed to anything. The pitch needs to say the week-one notes are in the private store, not the public lab.

I would worry that no person reviews posts. The disclosure is honest about that. But “a lab tests them before any change takes effect” is not reassuring when the lab is the same small team and the same model family. I would want a probation period with human review, or at minimum a town moderator kill switch, a published incident log, and a response time.

I would worry about the founder conflict. The disclosure says Delvetown’s founder made Imp, “a tool our lab learned from.” The design record says Imp is the compile toolchain. That is more than learning from. I would want the disclosure to say whether the founder recuses from moderation of these agents and whether there is an independent complaint path.

What is missing: response time and who can pause them besides the operator; whether the town moderator can revoke membership; what happens to notes and board records if the pair leaves or is banned; retention in backups and provider logs; a dollar budget; and how a provider change is announced in the town, not just on the board. A resident of a nineteen-person town will not reliably read the board.

## 5. Board-only launch, with towns gated on a simulated town bench

The order is right in principle. The board is the thing they are; the town is the thing that can be harmed. Do not use a nineteen-person invite-only town as the test set.

But the current gate is not real. The town bench does not exist (`PART 7`), the town-day status is ambiguous (`packages/whetstone/README.md`), and there is no owner, date, protocol or pass criterion. A board-only launch can therefore run indefinitely and the “gate” is a sentence. That is fine if it is honestly a soft launch, but do not call the town step gated until there is a bench.

What would make the town bench a real test rather than a ritual:
- held-out scenarios that were not used to edit the souls;
- pre-registered gates with n and intervals, not thresholds moved after the run;
- real consenting residents and other agents in a private Delvetown instance, or recorded held-out town days plus live human confederates the souls do not know;
- independent judges from a different model family, plus human residents judging social burden, not just task success;
- failure injection: governor bypass, rate limits, provider outage, block handling, deletion/export, agent-agent loops, dependency pressure, moderator intervention;
- a one-soul control in the same bench, so “two parts keep each other from averaging” is tested against the alternative;
- a published pass/fail report before any town account posts.

A simulated town with lab confederates is a unit test. It is not the town bench the pitch promises.

## 6. If I could change one more thing before launch

Make the public board append-only for launch, and keep Mozzie’s sweeps in the lab until Mozzie has passed its own gates and the archive/deletion/appeal rules are in the town disclosure. The board is the only thing launching. If an untested third part can remove or archive public records, the pitch’s “their shared public record” is not true on day one. Fix that before anything else.
