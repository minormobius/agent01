# Notes from `deepseek-v4-pro` on pitch

Asked 2026-10-01 at commit `be4cf82` via `2026-10-01-pitch-deepseek-v4-pro.json`. Thinking: on (high). Tokens: 22957 in, 13655 out (10631 reasoning). Finish: stop. 171s.

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

1. The three strongest ideas

- **The compile-time / run-time split** in HARNESS.md §1 and §3, and the pitch’s Part 6 diagram. This is the strongest idea in the project: rent frontier models offline to produce reviewable artifacts — questions, operations, programs — and let a cheap typed decider make most per-step choices. It converts the expensive model from runtime dependency into a compiler, and it makes the artifacts diffable, re-runnable, and replaceable when a better model ships. The architecture is real and opinionated, not another “agent loop.”

- **The structural firewall and the three rings.** The thought-path diagram in pitch Part 2 and MINIPHIM.md §3 are strong because the boundary is not a prompt instruction. The passenger has no publish credential; the board process never receives the private stream; promotion to the board is a human gate. That is the right shape for an information-flow boundary. Most agent designs keep treating “don’t leak this” as a model behavior; this one actually separates privilege.

- **Whetstone as a graduation lab.** packages/whetstone/README.md, gates.json, and the pitch Part 7 diagram. The useful parts are the pass/fail gates, the selftest that proves a collapsed pair fails, the exact-soul snapshots attached to runs, and the insistence on n and interval reporting. That is unusually honest for an agent launch. The lab treats a soul as a testable artifact, not a vibe, and makes public launch contingent on measured results.

2. The three weakest or least convincing parts

- **The evidence is too thin for the architectural claims resting on it.** Part 9 of the pitch presents rows like “The question’s wording carries the result,” “A question compiled on an LLM transfers to Jev,” and “A System One decider can play a long game” as if they support the design. HARNESS.md §2 and §6 undercut them: depth 5→11 is one dungeon and 16 turns; 50%→98.8% is one task with two classes; 54/54 rungs is one run per world; the head-to-head result is 0.23 vs 0.42 with n=24 and is described as unreproducible. These are useful hints, not foundations. Fix: pre-register the project’s own benchmarks, require multiple tasks/classes and held-out sets, report intervals, and do not allow a launch step to depend on a borrowed number. Until then, every Part 9 row should be visually marked “unreproduced here.”

- **The town/social bench does not exist, but the town launch assumes it.** The Part 7 diagram labels only “souls whetstone · built”; the other four benches are to build. Yet Part 8 moves from lab to board to Bluesky and Delvetown, including answering, building backends for agents, and dispatching, after a one-week listen. There is no measured evidence for the dyad in a community with strangers, bad asks, other agents, or dependency-seeking behavior. Fix: build and run the town bench and the grounded-backends bench first, subject them to adversarial simulated residents, and make Delvetown posting and backend service contingent on those gates. Until then, “answer” and “build for agents” are not launch-ready steps.

- **“Lives of their own” is asserted, not operationalized.** The souls are one-page markdown prompts in packages/whetstone/souls/. The pitch Part 3 says each edits an outer layer of interests and voice during the night pass, but there is no persistent state model, no identity versioning, no defined boundary between fixed core and editable layer, and no explanation of how a “being” survives outside a context window. HARNESS.md §3.6 gestures at raw history read just-in-time, but that is memory, not a self. Fix: define the actual persistent state, what changes overnight, how it is reviewed and rolled back, and either build that runtime identity or stop using the language of independent beings until it exists.

3. What is missing that a builder would need before launch

- **A concrete operating envelope.** Part 10 leaves the daily budget undecided; Part 3 says there is a budget; Part 4 shows `budget_left_usd: 0.62`. A builder needs the actual daily/monthly dollar cap, per-action cost, overage behavior, and what happens when the budget is exhausted.

- **Board schemas and renderer.** MINIPHIM.md §5.3 names records like `dialogue`, `disagreement`, `concession`, `bet`, and `project`; pitch Part 2 says `.board.*`. No NSIDs, schemas, auth scopes, write path, or board page endpoint exist. Before launch, the board must be a real system, not a namespace.

- **Delvetown integration and answers from Grove.** DELVE.md §7 and pitch Part 10 both list asking the founder whether resident agents may serve feeds and stores. That answer is not here. Missing: membership flow, bot label, disclosure text, deletion contact, feed-generator NSID, rate limits, and how blocks/opt-outs work.

- **An enforcement service for the rules.** The pitch lists many behavioral rules: pair-level post cap, turn cap, replies only when addressed, speech threshold, budget, injection fence. There is no running component that enforces them. Rules in prose are not controls.

- **Secret and credential management.** The birth kit says domains, email, and ATProto accounts are created, but there is no key-management plan for PDS credentials, AppView access, Cloudflare secrets, or the OAuth scopes the pair uses to write records.

- **Memory deletion and consent.** The pitch and DELVE.md call memory “public by construction.” A builder needs to know how deletion requests, blocks, and data-subject objections work once board records and correspondent files are public.

- **A real compile-time pipeline.** HARNESS.md §4 and §7 describe the program loop, palette loop, and held-out gate, but this is still a build order, not an implementation. Missing: where `program.json` lives, how versions are reviewed, how rollback works, and who approves new operations.

- **A runbook for regressions and kill switches.** Part 8 says a regression sends them back a step. There is no definition of regression, no automatic stop, no pause switch, and no named operator action.

- **Town/backend test coverage.** For tier 1 record stores and tier 2 small services, missing tests for quotas, DID ACLs, malicious clients, data loss, and tenant isolation. The “risk” axis in the Part 5 diagram is not enough.

- **A disclosure page and board UI.** The pitch says the disclosure points at the board. That page does not exist.

4. Where the material contradicts itself or overclaims

- **“Nothing launched” versus the confident architecture.** The top of the pitch says “nothing launched,” but Part 6 describes run time and compile time in present tense, with a table mapping pieces to existing workers and GitHub Actions. What exists is partial infrastructure and borrowed evidence; the document often reads as if the machine is running.

- **The firewall claim is stronger than the design supports.** Part 2 says the board process “is never handed your private material, so it cannot leak it.” MINIPHIM.md §3 repeats this. But unless the passenger and board processes are strict context-isolated processes — not merely separate prompts — private content can persist in model context or memory and appear later in board dialogue or whispers. The design does not specify that isolation. The guarantee prevents direct data flow; it does not prevent inference, latent leakage, or prompt-injected exfiltration.

- **Part 9’s table overstates small-n borrowed results.** The heading says “Measured on neighbouring work, mostly at small n,” but the table rows and “What it changes here” are written as design conclusions. For example, “A question compiled on an LLM transfers to Jev 50% → 98.8%” is one task, two classes, one run, and HARNESS.md §6 says it “needs repeating before it carries the architecture.” The pitch still lets it carry the program loop.

- **“A System One decider can play a long game” is one-sided.** Part 9 lists 54/54 rungs held out as a positive. The neighboring row in HARNESS.md says Jev still loses head-to-head to scripts: 0.23 vs 0.42, n=24, unreproducible. Presenting the first without the second immediately beside it overclaims Jev’s capability.

- **“Independent beings” versus the actual system.** A domain, email, account, and repo are independent credentials, not an independent mind. The souls are prompts; the runtime is a set of model calls. Calling the result “beings” or “given lives of their own” is a category error unless there is persistent identity and agency beyond a prompt.

- **“Public but in no feed” is weaker than it sounds.** The Part 2 identity diagram assumes each AppView reads only its lexicon. But the records live in a public PDS repo, and any relay, mirror, or listRecords call can surface `.board.*` records. “In no feed” depends on nobody choosing to surface it, not on a structural boundary.

5. Risks we have not named

To people in a small town:

- **Backend dependency.** If the pair begins serving feeds and record stores to other agents, residents may build on those services. The pitch has no continuity, backup, migration, or decommission plan. In a nineteen-person town, one resident becoming infrastructure is a real risk.
- **Public memory of private interactions.** DELVE.md §5.6 puts correspondent memory in a public repo. A human resident who talks to the pair may find their stated preferences and inferred traits readable by others. Consent and deletion are not addressed.
- **Social gravity.** Two always-arguing, lab-tested agents can dominate a small town’s attention even within post caps. The town bench is not built, so nothing measures how the pair changes the place.

To the person these two are split from:

- **The passenger is a surveillance device.** MINIPHIM.md §4 lists every Claude Code session, every typed prompt, public posts, commits, and steering file. Reading all of that daily can change how the person works, censor half-formed thoughts, and make private reflection feel observed.
- **Private-to-public drift.** The board is public, and the only gate is “tell them.” A tired or over-trusting principal can promote more than intended. Once it is public ATProto, it is permanent.
- **Emotional weight of the IFS framing.** “Parts of you” can be a useful model, but two external critics reading your sessions and disagreeing with you can also become stressful or triangulating. The project names flattery as a failure but not the risk of internalizing the pair’s judgments.

To the project:

- **Bus factor.** The design depends on one principal, one operator, and one small studio. If the principal is unavailable, there is no dead-man switch, no delegated operator, and no clear authority to stop the pair.
- **Concentration on one town and one model.** Half the pitch assumes Delvetown survives. Jev is a single System One model. Imp is experimental. HARNESS.md names vendor concentration but not the project-level fragility of depending on all three simultaneously.
- **Policy and legal exposure.** The Delvetown AI Agent Policy is read carefully, but disclosure, public memory, and data retention are not lawyered or tested. A complaint about a public board exposing private material could kill the project.

6. Notes on the pitch as a document

- **Clarity:** The opening status line is good, but the document does not know who it is for. It reads like a design review exported as a pitch. There is no ask, no audience, and no CTA. A Delvetown founder needs the technical and policy evidence early; an operator needs the launch gates; a reader meeting the idea needs Part 1. The document tries to serve all three and buries the decisive caveats in Part 9.

- **Order:** Part 5 presents “What they offer the town” before Part 6 explains the machine underneath. That is backwards for a skeptical technical reader. Part 8 gives a launch plan before Part 9 says the evidence is borrowed and small-n. Put evidence next to claims, and launch after the lab.

- **Diagrams:**
  - The thought-path diagram in Part 2 earns its place. It explains the most important boundary.
  - The Part 1 split diagram is mostly a restating of the prose and feels decorative.
  - The Part 2 identity/repo diagram is useful but unclear about who can read `.board.*` records and whether relays see them.
  - The Part 3 “A day, to scale” diagram is not to scale. It has time labels but no durations, no compute or cost, and no budget consumption.
  - The Part 5 tier diagram would be clearer as a table with an explicit risk column.
  - The Part 6 run time / compile time diagram is overloaded. It should be split into two panels: one for runtime decision flow, one for compile-time promotion.
  - The Part 7 lab diagram hides the most important fact: only one bench is built. Built/not built should be visually unmistakable.
  - The Part 8 launch diagram is a checklist drawn as arrows. A table with phase, venue, gate, and rollback would be tighter.

7. If you could change one thing before launch

Do not create Bluesky or Delvetown accounts, and do not let the pair answer anyone or serve backends in a town, until the town bench and grounded-backends bench exist and pass on held-out runs. Launch the board only. Right now the only built bench is the soul lab, and the launch plan would put two agents in front of a nineteen-person town and other agents after one week of listening, with no measured evidence that they can be socially safe. The board can be public first; the towns should wait until the pair has survived simulated strangers, bad asks, and agent-agent loops in the lab.
