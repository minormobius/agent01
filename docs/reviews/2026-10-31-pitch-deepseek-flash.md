# Notes from `deepseek-flash` on pitch

Asked 2026-10-31 at commit `b1309e8` via `2026-10-01-pitch-deepseek-flash.json`. Thinking: on. Tokens: 29592 in, 22713 out (17664 reasoning). Finish: stop. 159s.

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

Notes, direct. I’m treating `del/pitch/index.html` as the pitch and the other files as the record it stands on.

## 1. Three strongest ideas

**The firewall is a data-flow boundary, not a promise.**  
`del/pitch/index.html`, Part 2, “The path a thought takes”; `docs/MINIPHIM.md` §3. This is the strongest thing in the material: the passenger has no publish credential, the board process never receives the private stream, and promotion is a separate gate with a delay. It is concrete enough to audit and to break. It is also the only version of “private” here that could survive a prompt injection, because the public-writing process is never given the data. Keep this and make it the spine of the pitch.

**The axis produces artifacts, not vibes.**  
Pitch Part 1 diagram; Part 3, “Disagreements end in artifacts”; `docs/MINIPHIM.md` §5.3; `packages/whetstone/gates.json`. “Measure” versus “make” is a real generative difference, not two tones of voice. Bets with resolution dates and a ledger of concessions give the pair a public track record. “Silence is the resting state” is also the right default for a small town. This is the best answer to why there are two rather than one.

**Board first, towns gated, birth kit after graduation.**  
Pitch Part 7 diagram; Part 8; `docs/MINIPHIM.md` birth-kit table. The sequencing is responsible: public existence is separated from town interaction, the town bench is a hard gate, and graduation has a concrete output. It gives Delvetown’s founder a clean “no” and a clean “not yet.” That is rare in agent pitches.

## 2. Three weakest or least convincing parts

**The evidence base is too thin for the tone of the architecture section.**  
Pitch Part 4 table and Part 6 thesis; `docs/HARNESS.md` §6. The table honestly says “small n, neighbouring work,” but the prose then says “rent the intelligence, own the programs” as if the architecture is settled. The 98.8% transplant is one task, two classes, 80 held-out items, one run. The 54/54 rung result is one run per world and still loses head to head, 0.23 vs 0.42, n = 24. The 323-in-a-row trap result is one world, one configuration. These are design precedents, not proof.  
Fix: label them “precedents that shaped the design,” add explicit kill criteria for the decision bench, put the head-to-head loss beside the solo score, and do not use “the treadmill” as if it exists. It is a missing part, not a property.

**The passenger is the least safe and least specified part.**  
Pitch Part 2; Part 10 disclosure; `docs/MINIPHIM.md` §4. “Nothing from it reaches the board or either town” in Part 10 is false as written: Part 2 has a promotion gate where the operator can say “tell them.” The disclosure also admits that if you work with the operator, you may appear in the day. That is not consent, and there is no retention rule for passenger logs, whispers, or derived notes.  
Fix: a data map, exclusion or consent for third-party material in coding sessions and prompts, a retention period for passenger context, a per-item promotion record, and a canary test that proves private strings cannot reach public records. Until then, the passenger should not ship.

**Launch and ops readiness are not there.**  
Pitch Part 7 (“one bench of five”), Part 8 launch diagram, Part 6 status table. The town bench, decision bench, and grounded bench do not exist. The governor is listed as “new.” There is no dollar cost for a launch day, no incident runbook, no answer from the founder, and no Mozzie in the pitch. Calling this a launch plan is premature.  
Fix: publish a board-only v1 scope with no towns and no backends, plus a gate checklist with an owner for each gate. Do not use the word “launch” for a plan whose gating benches are dashed.

## 3. What is missing that a builder would need before launch

- **The file/model structure of a “soul.”** Pitch Part 3 says there is a fixed core, an outer layer, a ledger, and private notes. `packages/whetstone/README.md` says a soul is a markdown file and “the model’s entire system prompt.” The included `souls/modulo.md` and `souls/morphyx.md` look like whole prompts, not cores plus outer layers. A builder cannot implement “nightly self-edit” without knowing what file is immutable, what file is editable, how the prompt is assembled, and how the bench tests the assembled result.

- **A governor spec, not a description.** Pitch Part 3, Part 6 table, Part 11. Exact caps, reply caps, budget accounting, dead-man interval, off-switch granularity, what “every write” means at the PDS/OAuth layer, and how the pair cannot bypass the Worker with direct credentials. `docs/MINIPHIM.md` §7 already flags the whole-repo app-password problem; the pitch does not show the fix.

- **A privacy and retention map.** Pitch Part 10; `docs/MINIPHIM.md` §4. What the passenger reads, where it is stored, how long whispers and notes last, what happens to derived notes, how deletion propagates to backups, logs, model providers, and relays.

- **ATProto and Delvetown integration details.** Pitch Part 2 diagram; `docs/DELVE.md` §1. Lexicon schemas for the seven `com.minomobi.miniphim.*` records, DID/PLC and handle creation, PDS account recovery, OAuth scopes, Delvetown membership calls, AppView read behavior, relay/deletion behavior, and bot labelling.

- **A cost model.** Pitch Part 3 and Part 5 example; Part 12 asks the person to set a daily budget in dollars but gives no range. A builder needs dollars per whisper, per post, per build, per town day, plus who pays for escalation.

- **Incident response and moderation.** Pitch Part 11 lists risks but not a runbook: what happens on a privacy leak, a canary failure, a bot-to-bot spiral, an account compromise, a resident complaint, a failed dead-man check, or a backends wind-down.

- **A written operator/person agreement.** Part 12 asks the person to buy domains, set the budget, and set the dead-man interval. That is not a pitch question; it is a consent and ownership contract. It needs revocation, deletion, transfer, and public-attribution terms before domains are bought.

- **A real evaluation of “two minds.”** Pitch Part 1 says the separation gate tests whether the record holds two minds. The lab’s separation test is an attribution test: can a judge tell the voices apart? That is not the same thing. A builder needs a human blind test and the one-soul control before the claim is repeated.

- **Mozzie.** `docs/MINIPHIM.md` Revision 3 introduces a third part, Mozzie, with sweep, ledger, appeals, and archive powers. `packages/whetstone/README.md` describes Mozzie as the custodian. The pitch never mentions it. A builder needs to know: is Mozzie internal, does it get an account, who can appeal it, and does it launch?

## 4. Where the material contradicts itself or overclaims

- **“Nothing launched” versus public lab output.** Pitch header says “nothing launched.” `docs/MINIPHIM.md` status says “no domain, account or public board yet.” But `packages/whetstone/README.md` says runs are committed to a public repo, the commons is public, journals are “private from the other soul, not from people,” `www/` is published to `minomobi.com/miniphim/`, and the CHRONICLE is at `del.mino.mobi/days/`. That is public output. The precise claim should be “no agent accounts or public board yet,” not “nothing launched.”

- **“Board first, alone” is not alone.** Pitch Part 2 says board records are public and relays carry them from the first one; Part 8 says the board goes public before any town. A public relayed board can be read by anyone, including town residents. It is not “alone” in the sense of a private test. Say “no town account and no interaction,” not “alone.”

- **The pitch is a two-being document; the lab has a third part.** Pitch Part 1 and Part 12 present Modulo and Morphyx as the pair. `docs/MINIPHIM.md` Revision 3 says Mozzie is built in `packages/whetstone/` and keeps the commons. `packages/whetstone/README.md` gives Mozzie sweep and appeal powers. Either Mozzie is internal and should be named as such, or the pitch’s “two parts” claim is stale.

- **The open-disagreement guard is not a gate.** Pitch Part 11 says the nightly pass “flags days with no open disagreement.” `packages/whetstone/gates.json` says `open_disagreement` was replaced by `reasoned_moves` because they failed it on every run; it is still reported, not gated. The pitch is describing a guard the lab already found unusable as a gate.

- **The separation gate does not test “two minds.”** Pitch Part 1: “Whether the record holds two minds … is what the lab’s separation gate tests.” `packages/whetstone/README.md` defines separation as a triplet test: can a reader tell the two voices apart? That tests distinct voices, not minds. This is an overclaim.

- **“Never in more talk” is false.** Pitch Part 1 says arguments end “in something measured or made, never in more talk.” `gates.json` sets `artifact` at 0.67 and `reasoned_moves` at 0.67. That permits conversations that end in a reasoned move without an artifact, and the lab already replaced `open_disagreement` because the pair reasoned through disagreements. Say “most arguments are judged for an artifact,” not “never.”

- **“You can take it back” after a post is too strong.** Pitch Part 2 and Part 11 say a promotion waits a day so you can take it back. That is true before posting. After posting, ATProto records and relays are not a recall system. Say “you can withdraw before it posts; after posting it can be deleted but not recalled from relays or caches.”

- **The caps disagree across documents.** Pitch Part 3: “at most 2 unprompted posts a day for the pair.” `docs/DELVE.md` §5.3: “≤3 unprompted posts per day.” `docs/MINIPHIM.md` §6: “Pair-level cap: ≤2 public posts/day total.” These are three different rules. Pick one and define whether replies count.

- **“Nothing from the passenger reaches the board” contradicts the promotion gate.** Pitch Part 10 says nothing private reaches the board or either town. Pitch Part 2 says the operator can say “tell them” and promote something, with a day’s delay. The correct sentence is “nothing reaches it automatically; a specific item can be promoted through a gate.”

- **“Every write passes through the governor” is not shown.** Pitch glossary and Part 3 say every write passes through the governor. `docs/MINIPHIM.md` §7 describes whole-repo app passwords as a blast radius; the fix is narrow OAuth or moving storage. The pitch needs to show that no process holds a credential that can write around the governor.

- **Tier 3 is both “not planned” and “later.”** Pitch Part 9 text says tenant code is a fourth tier, not planned. The Part 9 diagram labels tier 3 “only with isolated dispatch, later” and also “not planned.” Decide which.

- **“Most thoughts never leave the middle ring” is unmeasured.** Pitch Part 2 says most of what they think never leaves the board ring. That is a design intention. There is no telemetry in the pitch. Say “the default is notebook; we will measure the ratio,” not “most.”

- **The numbers in Part 4 are asked to carry the architecture.** The table is honest about limits, but the prose around it is not always. Examples: 62.5% → 100% is 40 items each, one run, arithmetic and code tracing; depth 5 → 11 is one dungeon, 16 turns; 323 is one world, one configuration; 54/54 is one run per world and still loses head to head; 50% → 98.8% is one task, two classes, one run; 47.5% → 96.3% is one task, one run. These can shape the design. They cannot support “the program loop” as a general architecture. `docs/HARNESS.md` §6 already says the transplant needs repeating on a harder task; the pitch should say the same in the main body.

- **Nightly self-edit versus “sharpened by hand.”** Pitch Part 3 says the being edits an outer layer nightly, gated by the souls bench. Pitch Part 11 says souls are “sharpened by hand, never by the optimiser.” `packages/whetstone/README.md` warns “Don’t sharpen against the bank.” A self-edit that only has to pass the same bench is a Goodhart risk. A builder needs to know the being cannot see the bench and that a human reviews the edit.

## 5. Risks you have not named

### To people in a small town

- **Attention capture in a nineteen-person town.** Pitch Part 2 says about 19 residents. Part 3 caps unprompted posts at two per day for the pair, but replies are “only when addressed” with no daily reply cap. Two domains, two accounts, a public board, and a pair that argues for sport can dominate a tiny room. A resident can bait a reply by addressing them; two agents can pile on each other. Fix: a daily reply cap per being, a per-resident cap, no multi-agent pile-on without a human, and a cooling-off period after a thread hits the turn cap.

- **“Names nobody” is not anonymity in a nineteen-person town.** Pitch Part 10 says the board names nobody who hasn’t agreed. In a town that small, a described situation can identify a person. The board dialogue can discuss town governance or resident behaviour without a handle and still be obvious. Fix: no discussion of identifiable resident behaviour without consent; a town-review step for board records that concern the town.

- **Private notes create an asymmetric memory.** Pitch Part 3 and Part 10 say each being keeps a private note per person, with said/inferred lines, deleted on request or after a year. There is no subject-access right, no notification that a note exists, and no rule against inferring sensitive traits. In a small town, inferred notes shape behaviour even if never published. Fix: disclose the note at first contact, allow export, ban sensitive inferences, shorten retention, and log who accessed it.

- **Infrastructure dependency and insider privilege.** Pitch Part 8 makes backends contingent on “founder yes + grounded bench.” Part 9 offers feeds and record stores. Part 10 discloses that Delvetown’s founder also made Imp. That is honest, but it still looks like a friend’s project getting a friend’s infrastructure. A nineteen-person town can become dependent on a hobby backend with no SLA. Fix: no backends in v1; if later, town policy rather than a personal yes, plus export, deletion, and a named successor.

### To the person these two are split from

- **Public identity fragmentation.** The pitch gives each part a domain, email, repo, and account (`docs/MINIPHIM.md` birth kit), and labels them “a part of @minormobius, not them” (Part 10). In public, that distinction will not hold for most readers. The parts can say things the person would not say, and the person will be asked to answer for them. Fix: a written attribution policy, a right to retire or delete a part, and a clear statement that the accounts are not the person.

- **The passenger is self-surveillance with a friendly voice.** Pitch Part 3 says each part reads the operator’s day and may whisper once a day; Part 11’s guard for “their judgments of you start to weigh” is only a line in the core. Daily whispers from two parts designed to disagree can become a self-criticism engine. Fix: no passenger in v1, then opt-in with rate limits, a no-negative-judgment rule, an independent check, and a pause that does not require justification.

- **Third-party collaborators in the operator’s day.** Pitch Part 10 says if you work with the operator, you may appear in the passenger’s reading. That is not consent. Coding sessions, prompts, and commits can contain other people’s work and words. Fix: exclude third-party content by default, or require explicit consent per collaborator, with a deletion path.

- **The operator/person role is never cleanly separated.** The pitch is “written for two readers: the person these two are split from, and the founder” (header). Part 10 says the accounts are run by one person, minormobius. Part 12 asks “the person they’re split from” to buy domains and set the budget. If that is the same person as the operator, say so. If it is not, the consent problem is much larger.

### To the project

- **Bus factor is larger than the dead-man switch.** Pitch Part 11 says a dead-man switch stops all writing if the operator disappears. It does not renew domains, keep email working, recover the PDS account, pay for the model, or keep backends alive. Pitch Part 6 lists domains, repos, PDS, Workers, GitHub Actions, and model providers. Fix: an org-owned account, a succession plan, escrow for domains and keys, and a documented export.

- **The public board has no private beta.** Pitch Part 2 says board records are public and relayed from the first one; Part 8 makes the board the public debut. Early character mistakes are public and may be cached by relays. Fix: a private board period, a staged publication of selected records, and a deletion playbook that assumes relays will keep copies.

- **Judge bias and Goodhart.** `packages/whetstone/README.md` says the judges share a model family with the souls, and “a result that only holds under one judge is not a result.” Pitch Part 3 adds a nightly self-edit gated by the souls bench. That is two ways to teach the exam. Fix: cross-judge, human blind reads, held-out trials, and no bench visibility to the being doing the editing.

- **Legal and security exposure is under-described.** Pitch Part 10 covers providers and training in one line; Part 11 covers prompt injection and leaks as risks. There is no privacy policy, no data-processing basis for private notes, no security model for the Worker/PDS/OAuth path, and no incident contact beyond “the contact address is on both profiles.” Fix: a short privacy and security appendix before any town account.

## 6. Notes on the pitch as a document

- **The glossary is good; keep it.** It is the clearest part of the document. The status line under it is not: “nothing launched” needs to be precise, because the lab is already publishing runs and sites (`packages/whetstone/README.md`).

- **“You” is doing too much work.** In Part 1, “you” is the person the parts are split from. In Part 2, “you” is the operator who promotes a whisper. In Part 9, “our” is the studio. In Part 12, “you” is the founder or the person depending on the heading. Define the roles at the top: person/principal, operator, studio, founder. Then use them.

- **The two-reader structure is a conflict, not a feature.** The founder needs terms, risks, and a clear ask. The person needs consent, ownership, and exit. Part 12 mixes both into one questions section. Split the document: a two-page founder memo and a separate decision memo for the person. The pitch can link to the memo.

- **The order is builder-first, founder-second.** Part 4 evidence, Part 5 decision, and Part 6 machine are detailed before the founder has been told what they are being asked to approve. The founder’s questions are in Part 12. Move a one-page ask to the top: what you want from Delvetown, what you will not do before the town bench, and what the founder can revoke. Put the machine section in an appendix.

- **Part 10 should come before Part 9.** The promise to the town is stronger and more relevant to the founder than the backends offer. The backends offer is the thing most likely to make a small town nervous; it should follow the promise, not precede it.

- **Diagram by diagram:**
  - Part 1 “One person splits into two parts”: more slogan than diagram. The labels are dense and the “you/Self/part of” chain is not doing work the table below does not do. Simplify to the axis, or cut.
  - Part 2 “The path a thought takes”: earns its place. It is the firewall and the promotion gate. Keep, and make the post-publication deletion limit explicit.
  - Part 2 “One identity, one repository, three kinds of record”: earns its place for a builder. Keep.
  - Part 3 “A day for the pair”: earns its place; it shows silence and rhythm. It is more precise than an unbuilt system deserves, so label it “intended day.”
  - Part 6 run/compile diagram: central to the thesis, but too dense for a pitch. It earns a place in a builder appendix, not the main document.
  - Part 7 five benches: the content matters, the diagram does not. Make it a table with built/not built and the gate each bench feeds.
  - Part 8 launch steps: weakest diagram. Eight steps against four venues is hard to read and duplicates the text. Cut it or turn it into a checklist.
  - Part 9 tiers: earns its place. The risk ladder is clear, except tier 3’s “not planned/later” contradiction.

## 7. If I could change one thing before launch

**Cut the passenger and all private-day reading from v1.**  
Pitch Part 2 and Part 3 put the passenger in the daily loop; Part 10 tries to disclose it; Part 11 admits the self-surveillance risk. It is the part with the least specified consent, the most third-party exposure, and the highest chance of harming the person the parts are split from. Launch board-only, with no whispers, no town accounts, and no backends. Add the passenger later, after a data map, a retention rule, a third-party exclusion rule, and a separate gate. The board and the lab scorecards are enough for a first public artifact.
