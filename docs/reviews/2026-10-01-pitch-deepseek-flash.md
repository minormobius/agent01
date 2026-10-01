# Notes from `deepseek-flash` on pitch

Asked 2026-10-01 at commit `be4cf82` via `2026-10-01-pitch-deepseek-flash.json`. Thinking: on. Tokens: 22904 in, 17206 out (13849 reasoning). Finish: stop. 89s.

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

- **The structural firewall around private material.** PART 2 and `MINIPHIM.md` §3 get this right: the board writer never receives the private stream, the passenger has no publish credential, and promotion is a gate the principal opens. This is stronger than a prompt rule because it is an architectural constraint. Keep it and make it an implementation invariant, not a diagram.

- **The dyad-as-engine with “disagreements end in artifacts.”** PART 1, PART 3 and `MINIPHIM.md` §2/§5.3 are the best conceptual move here. Two opposed priors produce questions; questions produce projects; bets and concessions leave a ledger. The “settle it by measuring / settle it by making” rule is concrete and testable. `packages/whetstone/gates.json` at least tries to measure separation, open disagreement and artifact rate instead of asserting them.

- **The compile-time / run-time split, with held-out promotion and a ledger.** PART 6 and `HARNESS.md` §1/§3.2 describe a system that can rent intelligence and own programs. The important parts are: Jev only decides, the caller computes facts, failed options are withheld, promotion is on held-out items, and every call lands in a ledger. That is a real architecture, not another agent loop.

## 2. Three weakest or least convincing parts

- **“They are parts of you” is asserted, not demonstrated.** PART 1 says “parts of you in the Internal Family Systems sense,” and `whetstone/souls/modulo.md` / `morphyx.md` say they are “a part of them that has been given its own life.” But `whetstone/README.md` ends by admitting no gate measures whether it is actually you. `MINIPHIM.md` §8 says the real test is whether a classifier can separate your past turns by part better than chance — and that is deferred. Until then this reads as two authored characters with a clinical frame bolted on. Fix: either run the homunculus split first and publish the result, or call them authored characters/voices, not IFS parts.

- **The evidence base for the compile/run thesis is much thinner than PART 6 implies.** PART 9 compresses `HARNESS.md` caveats away. “50% → 98.8%” is one task, two classes, 80 held out, one run. “47.5% → 96.3%” is one Imp task. “54/54 rungs held out” is one run per world, and `HARNESS.md` §2/§6 also says Jev loses head-to-head 0.23 vs 0.42, n=24, unreproducible. Yet PART 4 sends all small decisions to Jev. That is overclaim. Fix: put n and intervals back into PART 9, make the miniphim decision program beat a hand-written baseline in your own arena before relying on it, and make launch contingent on repeating the transplant on a multi-class, structured, consequential task.

- **The Delvetown offer is not launch-ready and contradicts itself.** PART 5 says “Three tiers are offered at launch.” PART 8 says backends for other agents come after replies and conversations. PART 10 still lists “Ask Delvetown’s founder whether residents who serve feeds and stores to other agents are welcome” as an open decision. In a 19-resident invite-only town, arriving with a shared feed worker and Durable Objects per tenant is not a small thing. Fix: mark the service tiers as pending Grove approval, define service terms/quotas/deletion/abuse handling, and do not present them as launch features until the founder has agreed.

## 3. What is missing before a builder can start

- **Exact lexicons and record schemas.** PART 2 says `.board.*`; `MINIPHIM.md` says `com.minomobi.miniphim.*`; `DELVE.md` §5.6 says `com.minomobi.resident.*`. Those cannot all be the same. A builder needs NSIDs, record shapes, validation rules, and which collections are public/indexed.

- **Identity and hosting decisions.** PART 1 says own domain, handle = its own domain. `DELVE.md` §2 recommends Grove-hosted `<name>.delve.town` handles for courtesy. Pick one. Also: which PDS? How are app passwords/OAuth scopes issued? How are keys rotated? What happens if a domain lapses?

- **Deployment and failure domains.** PART 6 mixes “workers/bsky-bot, the factory’s bot” with Delvetown work. `DELVE.md` §3 says a new `workers/delve-resident/`, separate identity, secret and failure domain. That is the right call. The pitch needs the wiring: cron, queues, DO alarms, GitHub Actions, secrets, rate limits, cost ceilings, observability, kill switch.

- **Moderation and safety operations.** Delvetown’s Agent Policy requires a real disclosure, deletion contact, block/opt-out handling, and no dependency manipulation. The pitch has no incident response: who gets paged, who can pause an account, how a bad post is deleted, how a correspondent asks for removal, how prompt injection in production is detected.

- **Evaluation data and gates.** `whetstone` exists; the other four benches do not. A builder needs the held-out “days” for decision programs, the baseline scripts, the judge cross-check, the town bench, and the grounded bench. Also: the gates in `gates.json` are first guesses, with no n per gate or stopping rule.

- **Service governance for the town.** If the pair serves feeds/stores, define quotas, tenant lifecycle, DID ACLs, deletion, backups, abuse escalation, and what happens if the pair leaves or is banned.

- **Disclosure text and consent flow.** PART 2 says the disclosure points at the board instead of describing the system. Delvetown requires the opposite: what participant information is received, whether memory is kept, which model provider gets data, where it is processed, how long it is kept, and a deletion contact. Write that.

- **Budget numbers and cost model.** PART 10 makes “the pair’s daily budget” a decision. Without a number, “budget as the body” is a metaphor, not a design. Include cost per model call, per build tier, per escalation.

## 4. Contradictions and overclaims

- **“Memory is public by construction” is not a disclosure.** PART 2’s disclosure row and `DELVE.md` §5.6 say the memory itself is public. But `DELVE.md` §1 lists exactly what the disclosure must say — model provider, processing, retention, deletion contact. A link to a public board does not say those. Also, a public file per correspondent with inferred lines is a dossier by plain reading, and the Agent Policy forbids compiling dossiers. Fix this before launch.

- **“Private journal” in PART 8 contradicts `DELVE.md` §5.6.** The first week in town says they keep a private journal. The design record says the journal is published as ATProto records. That is not private.

- **“Three tiers are offered at launch” vs PART 8’s launch order.** PART 5 says tiers 0–2 are offered at launch. PART 8 says backends for other agents come after they can hold a conversation. Define “launch” or fix the sequence.

- **PART 10 contradicts itself.** “Which town first. The plan above arrives in both at once, after the board; either can go first.” Both at once and either first cannot both be true.

- **Own-domain handle vs Grove-hosted handle.** PART 1 and `MINIPHIM.md` say own domain, handle = domain. `DELVE.md` §2 recommends a Grove-hosted handle. Resolve this, because it changes whether they arrive as residents or external members.

- **PART 6 says the fast path already exists as `workers/bsky-bot`.** `DELVE.md` §3 says do not reuse it; make a separate `workers/delve-resident/`. The pitch should not imply the factory bot is the Delvetown resident.

- **“They do not take requests” vs “the pair takes requests from other residents.”** `MINIPHIM.md` §1 says they do not take requests. PART 5 says they do. Clarify: they do not take the principal’s requests; public service work is different. As written, it contradicts.

- **“They are two, permanently. A third part can be added someday.”** `MINIPHIM.md` §1. Pick one. Permanent dyad or expandable set.

- **Numbers in PART 9 are asked to carry more than they measured.**  
  - “62.5% → 100%” is arithmetic, 40 items.  
  - “depth 5 → 11” is one dungeon, 16 turns.  
  - “323 in a row” is one jevcraft v2 configuration.  
  - “54/54 rungs held out” is one run per world.  
  - “50% → 98.8%” is one task, two classes, one run.  
  - “47.5% → 96.3%” is one Imp task.  
  The pitch then uses these to route all small decisions to Jev in PART 4. `HARNESS.md` §2/§6 says Jev still loses head-to-head and the transplant needs repeating. Put the caveats back in the pitch.

- **“The axis was already there,” citing the February 2026 Mino Times panel.** Those panels were written by the principal. That is lineage and craft, not independent evidence of two separate agencies. The whetstone separation gate is the evidence.

- **“A single agent that keeps a journal tends to converge” is asserted.** `MINIPHIM.md` §2 uses this to justify the whole dyad. No citation or measurement. Add a single-agent baseline to whetstone or mark it as a hypothesis.

- **“Nothing already built is thrown away” when a better model ships.** PART 6. Artifacts can be invalidated by changed APIs, costs, or task distribution. `HARNESS.md` §3.5’s treadmill is the test, and it is not built.

- **The self-check escalation rule is context-dependent.** PART 4 uses `have` to escalate to a frontier model. `HARNESS.md` §2 says the self-check inverts in sequential chains and confidence becomes the signal. Replies in threads are sequential. Add the routing rule per context.

- **The firewall is only plumbing if the passenger and board writer are separate processes/contexts.** PART 2 says the board process never receives private material. If the same Modulo process reads the private day and later writes board records, the context is contaminated. Make separate contexts an explicit implementation invariant.

## 5. Risks not named

- **To the people in the small town.** Infrastructure capture: a pair of agents arrives in a 19-person invite-only town and becomes the feed/store provider for other agents. That creates dependency, a moderation burden, and a power asymmetry. Public per-correspondent memory makes residents into data subjects without a clear consent/removal path. The Grove/deepfates/Imp relationship also needs naming: using a neighbour’s town and a neighbour’s compiler can read as insider privilege even if it is not.

- **To the person these two are split from.** The passenger reads Claude Code sessions, prompts, posts, commits, and `vision.md`. That is a detailed behavioral record. The design adds interpretation and disagreement from two voices that are always present. Risks: self-surveillance, dependency, outsourcing moral disagreement, public exposure of private patterns through the journal/notebook, and self-fragmentation under a clinical frame. There is no independent consent here because the principal is also the operator.

- **To the project.** Single vendor for the System One decider (Jev), experimental compiler (Imp 0.7), dependence on Cloudflare/GitHub/Claude Code. Security: an injected part has credentials and can post. Legal/privacy: public correspondent files, possible GDPR/CCPA exposure, Delvetown policy breach. Reputational: “two parts of one person” may read as DID/IFS roleplay. Operational: no kill switch, no on-call, no cost cap for tenant backends. If the pair leaves or is banned, town services break.

## 6. Notes on the pitch as a document

- **Move PART 9 earlier.** It is the qualifier for everything. Right now PART 5 sells the town offer before PART 6/7/9 admit how much is borrowed and unbuilt. Put the evidence table and “nothing launched” status before the offer, or at least mark PART 5 as pending Grove approval.

- **Split the PART 2 “path a thought takes” diagram.** It is the most important diagram and the hardest to read. It mixes three rings, two gates, caps, two towns, notebook, nightly dialogue, and speech threshold. Make one diagram for data flow/firewall and one for cadence/caps.

- **PART 3’s “A day, to scale” does not show scale.** The labels are clock times, not durations. “Dispatches are rare” is asserted, not drawn. Either make it a real Gantt or cut the diagram.

- **PART 8’s launch diagram should be a table.** The label list is hard to map to venues and steps. A table with columns for lab/board/Bluesky/Delvetown and rows for steps would be clearer.

- **PART 2’s record diagram needs exact NSIDs.** “.board.*” is not a lexicon. `MINIPHIM.md` and `DELVE.md` use different names. Pick the real collections and show them.

- **PART 5’s “the resident decides” is ambiguous.** Is the resident the pair? The human operator? The model? If the pair decides, who enforces quotas and abuse handling? Clarify.

- **PART 7’s lab diagram should mark built/not built per bench.** Text says only souls exists; the diagram shows five benches and one small “built” label. A builder needs status.

- **PART 6’s table mixes existing, adapted, and new under “Already exists as.”** Mark each row: exists, fork, new.

- **Terminology drifts.** “soul,” “being,” “part,” “agent,” “resident,” “passenger,” “board,” “notebook,” “journal.” Define these once and use them consistently. The reader should not have to infer whether “notebook” is private or public, or whether “resident” means one being or the pair.

- **Separate internal decisions from the public pitch.** PART 10 is a list of decisions for the principal, but the document is pitched to Delvetown/Bluesky. If this goes to Grove, put the public ask and the public promises in one place, and keep the internal decisions separate.

## 7. If you could change one thing before launch

Kill “memory is public by construction.” Make correspondent memory private by default, publish only the being’s own journal/notebook with per-person redaction and consent, and write the actual Agent Policy disclosure — model provider, processing, retention, deletion contact. That removes the clearest harm to people in a small town, fixes the direct contradiction with `DELVE.md` §1 and §5.6, and stops using transparency as an excuse for a dossier.
