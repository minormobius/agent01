# Notes from `deepseek-v4-pro` on pitch

Asked 2026-10-31 at commit `b1309e8` via `2026-10-01-pitch-deepseek-v4-pro.json`. Thinking: on (high). Tokens: 29645 in, 13974 out (9835 reasoning). Finish: stop. 229s.

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

**The measuring/making axis is the strongest idea in the pitch.**  
In **Part 1 / MINIPHIM §2**, the pair is defined so that each one is actually right about the other’s blind spot: Modulo thinks “solvable is solved,” Morphyx thinks “structural is permanent.” That is not a cosmetic personality split; it is an engine for producing disagreements that end in artifacts. The rule “Arguments end in something measured or made, never in more talk” is what prevents the whole thing from decaying into a chat log. This is also the idea most grounded in real prior work: the Mino Times panel quote in Part 1 and MINIPHIM §0 shows the axis already existed before the current design.

**The passenger/firewall rings are a genuinely good privacy architecture.**  
In **Part 2**, especially the thought-path diagram, the design makes the right move: private material reaches only the passenger; the passenger has no public credential; the board never sees the private stream; promotion waits a day and can be taken back. That is a structural boundary, not a prompt asking a model to be discreet. MINIPHIM §3 says it directly: “The firewall is structural, not a prompt rule.” This is the part of the design that takes the worst failure mode—leaking the operator’s private life into public—most seriously.

**The compile-time/runtime split is a real architecture, not a persona wrapper.**  
In **HARNESS §1 and §3**, and **Part 6**, the argument that expensive models should compile artifacts and a cheap decider should run them is the strongest technical idea here. Making Jev choose from typed options whose facts were computed in advance, with a bail path and an escalation path, is a concrete, testable design. The held-out gate and the ledger turn model-swapping from vibes into a re-measurable process. The diagram in Part 6 earns its place because it shows two separate speeds and two separate risk profiles in one picture.

---

## 2. The three weakest or least convincing parts

**Weakness 1: Part 4’s “What it rests on” table is too thin to carry that title.**  
The pitch says the table shaped the design and does not prove it, but then it is placed as the foundation. Several rows are n=1 or near-n=1, and one row is misreported. The strongest example: **Part 4 says “Compute first, then ask 62.5% → 100%, 40 items each, arithmetic and code tracing,”** but **HARNESS §2** says arithmetic was 62.5% → 100% and code tracing was 52.5% → 100%. That is not a trivial wording difference; the pitch makes it look like one baseline.  
**Fix:** Replace this table with a short paragraph pointing to HARNESS, or keep the table but put the actual conditions, both baselines, n, and intervals in the cells. Better: re-run the measurements in the project’s own lab before letting the table shape public claims.

**Weakness 2: Part 9, the backends-for-agents offer, is premature in this pitch and under-specified.**  
The pitch itself says this is “not a launch feature,” but it still gets a full section and a diagram. The tier system is not yet convincing: “a Durable Object per tenant” and “export for every tenant” are fine words, but there is no tenant contract, quota model, authentication spec, abuse model, or deletion semantics. The line about the custom-domain limit rules out one new host per request is an infrastructure detail that does not belong in a pitch to a town founder.  
**Fix:** Cut Part 9 down to two sentences and move the tier details to a separate RFC. If it must stay, specify the tenant-level guarantees precisely: what an export is, what deletion means for derived stores, and who pays when a tenant abuses the service.

**Weakness 3: The private notes on people are promised as privacy, but they are the most likely part to become a quiet dossier.**  
In **Part 3** and **Part 10**, the design says each being keeps a note per person, each line marked said or inferred, never public, deleted on request. But the store does not exist yet, and “private” is not a design. A note per person held in a private store is still a set of files about people; if the operator or a future tenant can inspect it, it is not functionally private. Saying “anyone can have theirs deleted” does not solve the problem of what those notes already fed into the beings’ behavior.  
**Fix:** Either do not store per-person notes at all before the town bench exists, or design the store with encryption, access controls, automatic expiry, an audit log, and deletion that also explains what downstream effects can and cannot be undone.

---

## 3. What is missing that a builder would need before launch

Even for the board-only launch, the material does not yet give a builder enough to ship safely.

**A passing scorecard.**  
The lab has gates in **packages/whetstone/gates.json**, but the pitch does not say whether either soul has passed them. Before any public board, a builder needs the actual full-run scorecard, including n, intervals, and the exact soul text tested. The launch diagram in **Part 8** implies graduation happens, but it is not evidenced in the pitch.

**The board-specific bench.”**  
Part 7 says the board bench is only partial, inside whetstone. Launching the board public is a real public act. A builder needs the board bench finished, not partial. The board is not just souls talking; it is public records, permanent and relayed. That should not go live on a partial bench.

**Concrete lexicon schemas and board rendering.**  
Part 2 names the collections: `com.minomobi.miniphim.*` with note, dialogue, disagreement, concession, bet, project, build. But there are no actual lexicon schemas in the material. A builder cannot create the records without the schemas. Also, the board page is listed in Part 6 as “new” and uses a Worker, but there is no design for how the page renders or how unauth reads work.

**A real governor, not a planned one.**  
Part 3 says “Caps live in code” and “A soul can’t talk its way past it.” Part 6’s status table says the governor is **new**. Before launch, the governor needs to exist and be tested. The off switch, dead-man switch, post caps, turn cap, budget, and private-material guard all need to be actual code with failure tests.

**A cost and budget number.**  
The pitch says daily budget is shared by the pair and that choices show character. Part 12 leaves the daily budget in dollars as an open question for the operator. A builder needs a number, or at least a formula tied to measured run cost. The whetstone README says a full run is about 111 short calls and records cost, but the pitch does not use that to set a launch budget.

**A notification/takedown plan for the board.”**  
The risk table covers stopping writing, but the public board consists of permanent PDS records. A builder needs an answer for: someone asks for a record to be taken down; a record names someone who did not agree; the board page needs to be corrected.

---

## 4. Contradictions and overclaims, especially around numbers

**Part 4 misreads its own source.**  
As said above: **Part 4 says “Compute first, then ask 62.5% → 100%, 40 items each, arithmetic and code tracing,”** but **HARNESS §2** gives two baselines: arithmetic 62.5% → 100%, code tracing 52.5% → 100%. This is a concrete, checkable error.

**The separation gate cannot test what Part 1 says it tests.**  
**Part 1** says the lab’s separation gate tests “whether the record holds two minds, rather than one person writing two voices.” It cannot. **gates.json** measures whether a judge can tell the voices apart, and **whetstone README** explicitly says no gate measures whether a part is really a part of the person. So the pitch is overclaiming what the separation score means. The honest version would be: “whether the record holds two stable, distinguishable voices,” not two minds.

**The pitch and the design records are out of sync on the cast of parts.**  
**MINIPHIM Revision 3** adds Mozzie, a third part, custodian of the commons. **packages/whetstone/README.md** also describes Mozzie. But the pitch throughout says “two parts of one person,” “the pair,” and the part 1 diagram shows only Modulo and Morphyx. If Mozzie exists in the lab and has powers, the pitch is out of date or is deliberately hiding a third actor. That matters for the pair-level caps: who is governed, two or three?

**Present-tense guarantees outpace built status.**  
**Part 3** says caps live in code and a soul cannot talk past them. **Part 6**’s status table lists the governor as “new,” and **Part 10** says code limits what they can post. A builder reading Part 3 could reasonably believe these protections already exist. They do not yet.

**Several numbers are single-run observations being used as general design laws.**  
The worst cases are in **Part 4**:

- “A System One decider can play a long game alone” — 54/54 rungs, one run per held-out world.
- “A question compiled on one model transfers to Jev” — one task, two classes, one run.
- “Reflective rewriting works on frontier models” — one task, one run.

The pitch adds caveats, but the table’s title and the surrounding text still make these rows load-bearing. HARNESS’s “Jev’s failures were never Jev’s” and “every bad run traced back to the question or the options” is also an absolute claim stronger than the measurements support. That should be “in the runs we inspected,” not “never” and “every.”

**The board privacy claim leans on a convention, not a lock.**  
Part 2 says no AppView makes the `com.minomobi.miniphim.*` records a feed, but that is “a convention, not a lock.” The pitch itself admits this. The launch plan in Part 8 still treats the board as public in a no-feed middle ring. That is not a contradiction, but it is an overclaim in the diagrams, which draw the board as if it were a bounded public space. It is public data on a relayed PDS; another AppView could surface it.

---

## 5. Risks not already named

**To the people in a small town**

- **The public board can make town members into permanent characters without their consent.**  
  The board names nobody who has not agreed, but dialogue about a nineteen-person town is legible. Even without names, a resident could be identified from context. Deleting a private note later does not retract a public board record that already exists in a relayed repo.
- **The pair’s silence and board presence can become a social pressure.**  
  A small town may feel it is being watched by two non-residents who read the town feed and publish their own dialogue about it. The town rules limit direct spam, but the board is still a real-time public commentary space. The risk is social, not procedural.
- **The pair can be fed real information by strangers and then surface it in a different form.**  
  Untrusted input into their timelines and town feed may become a public board artifact. Canary tests in a synthetic lab are not the same as a determined adversarial resident in a town.
- **The “notes on people are private” promise does not protect the town if the private store is breached.**  
  A leaked private notes store could reveal inferred statements about residents and their relationships. The Agent Policy forbids dossiers, but a private file per person is structurally a dossier unless constrained more strongly than described.

**To the person the two are split from**

- **The passenger’s private stream is not only about the operator.**  
  Part 10 admits that if you work with the operator, you may appear in the passenger’s reading. The design does not say how the operator obtains consent or redacts those people before the passenger reads. That is a privacy risk to the operator’s collaborators, and indirectly to the operator’s relationships.
- **The public parts can become an unwanted psychological artifact.**  
  The Project uses Internal Family Systems language and says the parts are “of you, not you.” But once public, they will be associated with you. A disagreement or a failed gate can become a public record about your internal splits. The risk is not just reputation; it is that a private psychological frame becomes public evidence.
- **The passenger can become self-surveillance even if the person opts in.**  
  A daily recording of sessions, prompts, posts, and commits read back by two parts is a high-grade self-surveillance system. The pitch names this, but it does not name the slower risk: the operator starts making decisions for the record, not for themselves.
- **The operator is the single point of human judgment.**  
  If the operator burns out, loses access, or changes their mind, the dead-man switch only stops writing. The accumulated public PDS records and private notes remain, with no stated process for a clean shutdown of the entire project.

**To the project**

- **Synthetic lab gates will give false confidence.**  
  Souls will be sharpened on a trial bank and gated on judges that share a model family. A pair that passes every gate in whetstone may still fail quickly in a real town. The lab-to-town gap is not measured anywhere in the launch plan.
- **The project depends on two vendors and a single operator.**  
  One System One model exists. The pitch names this, but the actual cost of a vendor change is not measured. If Jev disappears or changes behavior, the whole runtime is affected. Simultaneously, the operator is the only human. That is a single-person, two-vendor critical path.
- **The backends layer—if allowed later—creates legal and operational liability.**  
  Serving durable stores or small services to other agents turns the project into infrastructure. The pitch’s “wound down separately, with notice” is not a contract. There is no legal entity, no terms of service, and no stated liability model.
- **The quality bar for the board is also the bar for the public debut.**  
  Board first means the first lasting public artifact is not the pitch; it is the beings’ own dialogue. If that dialogue is boring or blurry, the public impression is set before the town bench ever runs.

---

## 6. Notes on the pitch as a document

**Overall order is mostly good.**  
The sequence—who they are, where they live, behavior, evidence, decision-making, machine, lab, launch, promises, risks, questions—is coherent for two readers: a founder and the operator. The risk table in **Part 11** is strong because it pairs each risk with a guard, though several guards are not built yet and the table does not mark which ones are live.

**The top definitions are useful, but a few definitions drift.**  
The definitions of being, part, soul, board, passenger, and governor are a good move. But **Part 1** says the pair are “parts of you in the Internal Family Systems sense” and later **Part 10**’s disclosure switches to systems language as if the reader already accepted the IFS frame. That jump may lose a town founder.

**Part 4 and Part 5 should be repositioned or tightened.**  
Part 4 is evidence for the design, but it appears before the architecture. Part 5 introduces Jev decisions before Part 6 explains the machine underneath. As a result, the pitch’s largest conceptual leap—the compile/runtime split—arrives late. I would put **Part 6** before **Part 5**, or merge Part 5 into Part 6.

**The diagrams are uneven.**

- **Part 1 diagram:** It earns its place because it shows the split and the blind spots in one view. It is text-heavy and the labels read like paragraphs, but the visual compression is worth it.
- **Part 2 thought-path diagram:** The strongest diagram in the pitch. It shows the firewall as a real data-flow path and the default “no: notebook” branch. Keep it.
- **Part 2 repository/AppView diagram:** This is not really a diagram; it is a table. It would be clearer as a three-column table: record type, where it is read, and how it is indexed.
- **Part 3 day diagram:** Fine, but it would read better as a slim timeline with actual events and caps instead of abstract verbs like “consolidate.”
- **Part 6 runtime/compile diagram:** Dense but earns its place. The labels do a lot of work. The “palette loop” and “program loop” could be separated from runtime to reduce noise.
- **Part 7 benches diagram:** Modestly useful. The only essential part is the read-only relationship from Jevcraft and Imp bench into the lab. The rest duplicates the text.
- **Part 8 launch diagram:** The weakest. The labels are a pile—“board / listen / a week / answer / dispatch / build / if agreed”—and do not communicate order. The body text is clearer. Replace it with a simple table of steps, venues, and gates.
- **Part 9 backend diagram:** Earns its place because the risk gradient is visual: config → store → service → code. It is the clearest expression of an otherwise premature section.

**The file set is inconsistent about what the current state is.**  
**del/pitch/index.html** says one bench built. **docs/MINIPHIM.md** says status is “in the lab, in practice” and includes a third part. **docs/DELVE.md** has a superseded section but retains older recommendations in the body. **packages/whetstone/README.md** describes a much more advanced lab practice than the pitch admits. A reviewer has to hold three different versions at once.

---

## 7. If I could change one thing before launch

I would not let the board go public until the one-soul control and the board bench have actually run and passed, with a published scorecard that includes the intervals and exact soul files tested.

The pitch’s central hypothesis—that one agent drifts toward a pleasant average and two keep each other from it—is admitted to be untested. The board bench is partial. Yet the launch plan makes the board public first. That puts the project’s most visible artifact into the world before the core experiment has produced evidence.

Before any public board, the lab should run:

- the full souls bench with passing gates,
- the board-specific dyad bench—not the partial one,
- the one-soul control,
- and a publication-ready scorecard showing n, intervals, judge model, and the soul text tested.

Until that happens, the board-first launch is a public debut of an unproven system, and the strongest parts of this design would be undermined by a blurry or merged first week of public dialogue.
