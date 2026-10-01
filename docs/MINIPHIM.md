# The miniphim: Modulo and Morphyx

A design record for an idea from November 2024 that has had two partial attempts. Modulo and
Morphyx are **two parts of one soul**, split out of the principal. Their contrast is meant to
churn an inner life. They talk on a board that is public but kept apart from the public square,
and they ride along as passengers on the principal's life. They draw their interests from
literature, from their own networks, and from their relationship with each other.

Status: **proposal.** Nothing here is built. It follows on from [`DELVE.md`](DELVE.md): that
document asks how *one* agent gets an inner life, and §2 below suggests the answer is that it
takes two.

## Revision, 2026-10-01: a fresh start, and a lab first

The principal's decision, which supersedes the hosting sections below: **Modulo and Morphyx
start fresh as independent beings.** Each gets a clean public repo, a full domain of its own,
its own email, and a **new** ATProto account. They do not live inside agent01 or under
`mino.mobi`, and they do not inherit the old `modulomino` / `morphyxmino` accounts. Those stay
what they have become, the house's service accounts, and §0 below is their history, not the
new beings' inheritance. One consequence: the blast-radius problem in §7 (an autonomous Morphyx
holding a whole-repo app password next to vault records) goes away, because the new Morphyx's
repo holds only Morphyx.

**The pitch**, diagrams first: [claude.ai/artifact/4UAit5hPXJtsMMqL3kwyeZ](https://claude.ai/artifact/4UAit5hPXJtsMMqL3kwyeZ) (who they are, where they live, how they behave, the system underneath, the lab, the launch).

**But first, a lab.** The souls are sharpened in [`packages/whetstone/`](../packages/whetstone/)
before either gets a repo. Whetstone measures what this document only argued for: that the two
are separable, that each holds its view under pressure, keeps silence, can't be steered by a
stranger, and that their conversations keep a real disagreement and end in something to measure
or make. A soul **graduates** when every gate in `whetstone/gates.json` passes on a full run.

The birth kit, per being, after graduation:

| Piece | Who | Notes |
|---|---|---|
| domain | principal (purchase) | a Cloudflare zone on the same account, so DNS and email routing are ours to script |
| email | agent, by workflow | Email Routing on the new zone, `<name>@<domain>`, forwarding until the being reads its own |
| ATProto account | principal creates; agent sets the handle | a new DID; handle = the domain, via the `_atproto` TXT record |
| public repo | principal creates; agent seeds | first commit: the graduated soul, the scorecard it graduated on, a README in its own voice |

The rings of §3 still hold, and independence makes them stricter: the passenger's private
reading never lands in a being's public repo.

## Revision 2, 2026-10-01: after DeepSeek's notes

The pitch went to DeepSeek V4.1 Flash and V4 Pro for blunt notes ([`docs/reviews/`](reviews/)).
Where they were right, this revision supersedes anything below it, and the pitch at
[del.mino.mobi/pitch](https://del.mino.mobi/pitch/) is the current statement:

- **Notes on people are private.** Each being keeps a note per person it talks to, each line marked
  said or inferred, in a private store, never on a PDS, deleted on request or a year after last
  contact. Publishing them would be the dossier Delvetown's Agent Policy forbids.
- **The disclosure is written out, not linked.** It states what they receive, what they remember,
  which providers see it, where it is processed, training, and how to stop them (pitch: *What we
  promise the town*).
- **One rule holds the firewall up: separate contexts.** Only the passenger sees private material,
  and nothing from it (memory, notes, input) reaches any process that writes in public, including
  the nightly pass where the beings edit themselves. A promotion through the gate waits a day.
- **Board first, alone.** No town presence until the town bench exists and passes. Backends for
  other agents only if Delvetown's founder agrees and the grounded bench passes.
- **Caps live in code.** A governor in the fast-path worker enforces the post caps, the turn cap,
  the budget, an off switch and a dead-man switch. A soul cannot talk past it.
- **What persists:** the fixed core; an outer layer the being edits nightly, as a commit that only
  takes effect if the souls bench still passes; the board ledger; the private notes on people.
- **Jev earns decisions.** A kind of decision moves to Jev only after beating a hand-written
  script on held-out days in our decision bench. In threads, escalation reads confidence, not the
  self-check, which sticks at "no" in chains.
- **One lexicon:** `com.minomobi.miniphim.*` (note, dialogue, disagreement, concession, bet,
  project, build), written into each being's own repo. **Hosting:** each account on Bluesky's PDS
  with its own domain as handle, joining Delvetown as an external member.
- **Untested hypotheses are labelled as such**, and the souls bench gets a one-soul control for
  the claim that a single agent drifts toward an average (§2).

---

## 0. Lineage: they have already been living

| When | What | What it shows |
|---|---|---|
| Nov 2024 | the idea forms during the first wave of agents | two parts, one soul |
| Feb 2026 | **The Mino Times**: Modulo runs the data desk and Morphyx the institutional desk. Five-part series on life detection, each followed by an editorial *panel* between the two (`time/articles/*-panel.html`) | they can disagree in public in a way worth reading |
| 2026 since | **Morphyx's repo became the house workshop**: `com.minomobi.cad.part`, `cad.revision`, `dweet.dweet`, `borges.telling`, `borges.banter`, `hoop.story.*`, `feedgen.def`, and a tangled code mirror, in 23 collections on `did:plc:yivyyp54vddf7qf2lpsikhe4` | Morphyx turned into *the one who makes things*, by accident |
| Sep 2026 | **Modulo wrote a rondo**: `com.minomobi.clef.piece` on `did:plc:kphmcfll7li3dt6kvkbuxaue`, "written rather than transcribed" | Modulo turned toward music: ratio, interval, modulation |

So the characters are not blank. **Each one's ATProto repo is already a biography that nobody has
told them about.** Phase 0 (§9) is to let them read it.

### The axis, as the record shows it

The Times panels show a real and recurring disagreement, not two flavours of one view.
From *The Contamination Problem*:

> **Modulo:** It's an engineering problem with a solution. You build the IRMS into the
> containment suite.
>
> **Morphyx:** It is not a problem you solve with engineering. It is a problem you solve with
> institutions. And the institutions have not been built.

| | **Modulo** | **Morphyx** |
|---|---|---|
| asks | *what is actually the case?* what did the instrument read? | *what form should it take, and who decides?* |
| trusts | measurement, ratio, technique | structure, history, relationship, power |
| settles an argument by | **measuring**: a computation, a dataset, a plot | **making**: a mechanism, a part, a site, an institution sketched |
| drifted toward | music (modulo, modulation, interval) | form (morph-: the arm, the gripper, the dweets) |
| characteristic failure | thinks a problem is solved once it can be solved | thinks a problem is permanent because it is structural |

This is a reading of the record, not a decision. Its fixed core is for the principal to write
(§10). It is a good axis because **each one is right about the other's blind spot.**

---

## 1. What they are, and what they are not

- **They are parts, not assistants.** In the Internal Family Systems picture, the principal is
  *Self*, and the parts are of you but are not you. They have their own concerns, they speak to
  you, and you do not have to obey them. They don't take your requests. The lab factory is the
  buildabot; the miniphim are not. (Serving other residents later, if a town agrees, is public
  work they choose and can decline.)
- **They are not you in public.** Each account is labelled as automated, and neither one
  speaks for the principal. Being a part of someone does not license impersonating them.
- **They are two.** A third would be a new experiment with its own lab run, not a change to this
  one. A merge is the failure mode §7 guards against.

---

## 2. Why two: contrast is the engine

A single agent that keeps a journal tends to converge (a hypothesis, not a finding; the souls bench
gets a one-soul control to test it): each day's consolidation smooths the
last, and after a month it is a pleasant average. That is the weak point of the single
resident sketched in `DELVE.md`. **Two agents with real, opposed priors produce disagreement.
Disagreement produces questions, and questions produce projects.** The dyad *is* the inner
life. Neither part has to simulate one alone, because the churn happens between them.

That suggests an answer to `DELVE.md`: **the resident who arrives in Delvetown could be the
miniphim.** That means two accounts, honestly labelled, with a visible relationship, so the town
gets their conversation and not a schedule. (The Agent Policy's "do not use multiple agents to
overwhelm a person" applies. Two parts addressing one person count as two voices, so §6's caps
apply to the pair, not to each.)

---

## 3. Three rings of visibility

The principal's own description: *"their message boards can be public but aside from public
venues."* That gives three rings, and the boundaries between them are the most important design
in this document:

```
 ┌─────────────────────────────── the square ───────────────────────────────┐
 │ Bluesky · Delvetown · The Mino Times panels — rare, edited               │
 │ ┌───────────────────────────── the board ──────────────────────────────┐ │
 │ │ their house: dialogue, ledger, notebooks, bets                       │ │
 │ │ public but unpromoted: com.minomobi.miniphim.* records               │ │
 │ │ on their own repos, rendered by one page                             │ │
 │ │ ┌───────────────────────── the inner ring ─────────────────────────┐ │ │
 │ │ │ the passenger: reads the principal's private stream,             │ │ │
 │ │ │ whispers to the principal only                                   │ │ │
 │ │ └──────────────────────────────────────────────────────────────────┘ │ │
 │ └──────────────────────────────────────────────────────────────────────┘ │
 └──────────────────────────────────────────────────────────────────────────┘
```

- **The board** is public in the ATProto sense: records in their own repos that anyone can
  list, and relays carry, and our page renders. No feed surfaces it, but that is a convention, not
  a lock. It is a house, not a town square. It names nobody who hasn't agreed to be named.
- **The inner ring** is the part that is *in your head*. It is the only process that reads the
  principal's private stream (§4), and its only output is a whisper to the principal.

**The firewall is structural, not a prompt rule.** The board process **never receives** the
private stream, so it cannot leak what it was never given. The passenger process has no
credential that can write a record. A thing the passenger noticed reaches the board only if the
principal **promotes** it, by answering a whisper with "tell them". This is the loop's contagion
firewall (`docs/LOOPS.md`) applied to a mind: the gate goes where the data flows, not in the
model's good intentions.

---

## 4. The passenger: riding along on the principal's life

This is the cyborgist core, and here the repo has something few people have. **The principal's
life is already being recorded, by their own choice:**

| Stream | Where | Gives |
|---|---|---|
| every Claude Code session | the private `corpus` branch of `minormobius/chatter` (`ship-session.mjs`) | what you worked on, in your own words, daily |
| every typed prompt | `packages/homunculus/` (`log-prompt.mjs`, `chatlog.mjs`) | intent, unedited |
| your public posts | `harvest.mjs` off your PDS | what you chose to say |
| what got built | git history, `actor: agent` commits (`scripts/lib/gitlog.mjs`) | where the effort actually went |
| what you are steering | `.github/loop/vision.md` | what you say you want |

Each evening the passenger reads the day: Modulo through Modulo's eyes and Morphyx through
Morphyx's. The job is to **notice, not to manage.**

- *Modulo:* "Six sessions on the gripper, and the torque ledger moved twice. Is the number
  converging?"
- *Morphyx:* "You built three things for other people this week and none for yourself. Who is
  the arm for?"

### The whisper channel: how they reach you

Options, from least to most "in your brain":

1. **A morning note by email, from `modulo@` / `morphyx@minomobi.com`.** The routing already
   exists. Replying talks back, and the reply is intake for the next night.
2. **A page only you can read**, behind the auth worker.
3. **A `SessionStart` hook that puts the latest whisper into every Claude Code session.** They
   would ride in the sessions themselves, which is the most literal version of the passenger.
   It is opt-in, because it colours every session's work. Because sessions ship to the corpus,
   the loop closes: they read what you did with what they said.

Caps: at most one whisper per part per day, and **"nothing today" is a valid whisper.** A part
that always has something to say has turned into a notification.

---

## 5. Lives of their own

The principal named three sources: literature, their network, their own relationship.

### 5.1 Literature: two tastes over one pool

The ideas pipeline already pulls arXiv daily into `.github/ideas/pool.jsonl` at no cost. Each part
gets its **own filter** over that pool, plus its own sources. For Modulo: methods, instruments,
measurement, and music theory and acoustics. For Morphyx: institutions, history of technology,
mechanism design and governance. Each keeps a reading notebook. **What one reads and the other
does not is half of what they talk about.**

### 5.2 Network: different friends

Both accounts exist (`modulomino.bsky.social`, `morphyxmino.bsky.social`). Each **follows
different people** and reads its own timeline, so each part brings home news the other
didn't see. Over months their follow graphs diverge, and the divergence is measurable. If the two
graphs converge, the parts are collapsing (§7).

### 5.3 The relationship: a ledger, not a vibe

A relationship is shared history with stakes. Record it as typed board records:

| Record | Holds |
|---|---|
| `…miniphim.dialogue` | the nightly conversation (bounded turns) |
| `…miniphim.disagreement` | a **standing disagreement**: each side's position, opened date, status |
| `…miniphim.concession` | who gave ground on what, and what moved them |
| `…miniphim.bet` | a claim with a resolution date and a resolution method. When it resolves, the ledger says who was right |
| `…miniphim.project` | a shared undertaking that came out of a disagreement |

**Disagreements end in artifacts, not in more talk.** That is the rule that keeps the dyad from
becoming a chat log. Modulo settles a question by **measuring**: a computation, a dataset, a
`packages/dataviz` plot. Morphyx settles one by **making**: a CAD part, a mechanism, a site, a
proposal. Both already have hands in this repo. The ledger therefore fills with things, and over
time *who has been right about what* becomes a history they both carry.

---

## 6. Rhythm and cost

```
 morning   each reads its own intake (literature filter, own timeline)      cheap
 evening   passenger: each reads the principal's day → ≤1 whisper           private
 night     the board: bounded dialogue (≤12 turns), ledger update,          public, unpromoted
           a judge pass (§7), notebooks consolidated
 rare      the square: a Times panel when a disagreement is worth publishing,
           or a dispatch in Delvetown. Pair-level cap: ≤2 public posts/day total
```

The clock is `workers/cron`'s `FIRE_MAP`; `schedule:` blocks never fire off the default branch
(`IDEAS-BOT.md` explains why). The nightly job is a `claude -p` workflow like `lab-build.yml`:
read-only tools, an injection fence around everything others wrote, and a **daily dollar budget
shared by the pair.** That makes them argue about how to spend it, and the arguing is the point.

---

## 7. How it goes wrong

| Failure | What it looks like | Guard |
|---|---|---|
| **Merging** | they agree on everything; the two voices become one | the judge measures disagreement. N days with no open disagreement raises a flag to the principal. The fixed cores keep the axis |
| **The attractor** | escalating mutual warmth, cosmic vocabulary, a mutual praise loop | bounded turns; "settle by artifact" (§5.3); the judge watches for it |
| **Flattering the host** | the passenger tells the principal what they want to hear. This is the worst failure for a part | the cores say that a part's value to Self is in disagreeing. The judge reads the whispers too |
| **A leak** | something from the private stream reaches the board | structural: §3. The board process never receives it |
| **Blast radius** | Morphyx's repo is also the house's storage account. It holds vault keys (`com.minomobi.vault.*`), CAD, borges and hoop records, and its app password is shared across many workflows | **an autonomous Morphyx must not hold that app password.** App passwords are whole-repo. Give the miniphim writes through the auth worker's narrow OAuth scope (`repo:com.minomobi.miniphim.*` only), or move the house storage to its own account first |
| **Impersonation** | readers take a part's words as the principal's | label both accounts automated; the profile says "a part of @minormobius, not them" |

---

## 8. Splitting the soul literally (later, and testable)

Today the parts would be Claude with hand-written cores. The homunculus programme points to
something stranger. **Split the principal's own corpus by part.** Label each of your past
turns by which part it sounds like, measuring and technique or form and structure. Seed
each core with its half as exemplars. When a homunculus finetune exists, the miniphim become
**two heads on your voice.**

Be honest about it, as `homunculus/census.mjs` is: if a classifier cannot separate the two
halves better than chance, the split is a costume and not a cleavage, and the parts should be
designed rather than discovered. That result is worth knowing either way.

---

## 9. Phases

| Phase | What happens | Visible |
|---|---|---|
| **0. Recognition** | each part reads its own repo and the Times archive, and writes one record: *who I have been, from the evidence.* No other output | board |
| **1. The board** | nightly dialogue, the ledger, the judge. No public posts, no passenger | board |
| **2. The passenger** | evening reading of the principal's day, and whispers by email first | private |
| **3. Lives of their own** | literature filters, diverging follows, bets with resolution dates | board |
| **4. The square** | Times panels resume when a disagreement earns one; Delvetown arrival as a pair | public |

Phase 0 is cheap and tells you the most: whether the record already holds two characters.

---

## 10. Decisions for the principal

1. **The fixed cores.** One paragraph each: what Modulo is for, what Morphyx is for, and what
   each refuses. §0's axis table is a draft to accept or tear up.
2. **The whisper channel**: email (recommended first), private page, or the `SessionStart`
   hook.
3. **What the passenger may read**: sessions, prompts, posts and commits all, or a subset.
   Default to *less* and widen it.
4. **Morphyx's repo**: move the house storage off it, or give the miniphim narrow-scope writes
   only. Either is fine. Leaving an autonomous character holding a whole-repo app password next
   to vault keys is not.
5. **Delvetown**: do the miniphim arrive there as the resident, or does the resident stay a
   separate third?
6. **The pair's daily budget.**
