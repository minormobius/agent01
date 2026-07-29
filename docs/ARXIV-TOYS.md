# Five toy websites from one day of arXiv

Source material: arXiv new submissions for **2026-07-29**, pulled from the
export API across eight categories chosen against this repo's demonstrated
interests — `math.CO`, `math.MG`, `cs.CG`, `cs.SI`, `cs.CR`, `q-bio.QM`,
`q-bio.PE`, `cond-mat.stat-mech`. 98 papers. Every toy below cites the specific
paper it comes from, and the mechanism is the paper's actual result, not a theme
borrowed from its title.

Third pass at this exercise, and the previous two both got a note attached.
[`HARDWARE-TOYS.md`](HARDWARE-TOYS.md) landed; [`TOY-WEBSITES.md`](TOY-WEBSITES.md)
did not. Reading those five back, the pattern is that they were mostly **one-joke
content sites** — a generator, a wall, a graveyard, a converter, a quiz. You read
them, you get the joke, you leave. So the correction applied here: every entry
below is a **mechanism you operate**, where the surprise is a real result you can
push on, and where the fun survives knowing the joke. If that reading of what
went wrong is off, say so — it's the only assumption in this document.

The bar from `TOY-WEBSITES.md` still applies: worth a subdomain only if it
**improves with a crowd**. Today's material clears it unusually well — two of
these are literally n-player games.

---

## 1. Eleven Hats — a cooperative game with a wall discovered this morning

**Source:** [arXiv:2607.25274](https://arxiv.org/abs/2607.25274), Yulin Zhai,
*Proper Hat-Guessing on Two-Spine Book Graphs* (math.CO).

The proper hat-guessing game: an adversary colours every player's hat, never
giving the same colour to two players who can see each other. You see your
neighbours' hats, never your own. Everyone guesses **simultaneously**, and the
whole group wins if *at least one* person is right. You may agree on a strategy
beforehand; you may not communicate once the hats are on.

The paper settles the two-spine book graph: two players who can see each other
and everyone else, plus any number of players who see only those two. The group
can win with **11 colours, and 11 is exactly the wall** — `HGP(B₂,ₙ) ≤ 11` for
every n, with equality once n is large. The extremal obstructions are classified;
there are precisely two types. It also nails small cases: with three page
players, the threshold is exactly 7, by an explicit seven-colour construction
with affine symmetry.

That is a game design, complete with its own difficulty curve, published today:

- **Two spines, three pages** — five players, 7 colours. Tractable in your head.
- **Two spines, many pages** — 11 colours. Winnable, and it does not matter how
  many friends you add, which is the counterintuitive part people will not
  believe until they have played it.
- **12 colours** — impossible. The site should let you try, and lose, forever.

The joke is the shape of the thing: a room of people wearing hats, all shouting a
colour at the same instant, and the reason it works is a finite extremal
invariant that someone computed for the first time this morning. The strategy
phase is Hanabi-grade table talk — "if I see red and blue, I say green" — and
that is the actual game.

| | |
|---|---|
| Reuses | `games/` — multiplayer party games for Bluesky with DO rooms, which is precisely this shape. Identity via the shared OAuth worker. `workers/scores` for group win rates |
| Build | one page + one Durable Object room. The adversary is server-side and must be a real adversary: a proper colouring chosen to beat the strategy the group has committed to |
| The crowd | it is an n-player game — it does not exist alone. And group win rate at 11 colours across a thousand rooms is a genuinely interesting number nobody has |
| Honest risk | the strategy-agreement phase is either the best part or a brick wall. Needs a strategy *builder* (a shared lookup table players fill in together), not a chat box. Without that, players guess randomly, lose, and leave |
| Paper caveat | the ≤11 bound holds for every n, but *equality* only for large n, with a stabilization threshold the paper bounds at 4×10⁸ pages. Do not promise 11 is tight for the five-player room |

---

## 2. Five Bits — flip a few weights and watch a model change its mind

**Source:** [arXiv:2607.25227](https://arxiv.org/abs/2607.25227), Yan, Chen, Lu,
Wang, Zhao, Li, Du, Yuan, Ji, *Decision-Level Hijacking: Injecting Cognitive
Bias into Large Language Models via Bit-Flip Attacks* (cs.CR).

The paper introduces **CogBias**: flipping a very small number of weight bits in
a deployed open-source model reliably shifts its *stance* on a target topic —
which of two vendors to recommend, which side of a controversial question — while
leaving fluency and unrelated task performance essentially intact. Demonstrated
on Llama-3.2-3B, Mistral-7B, Qwen2.5-14B. It calls the threat *decision-level
hijacking*, and the point is that it needs no training access and no live
interaction: post-deployment, a handful of bits, persistent and quiet.

As a toy: you get a **bit budget**. Five flips. The model is in your browser.
Your goal is to make it recommend the worse of two options while still sounding
completely reasonable — and a scoreboard checks that you did not just break it,
by running the same unrelated evaluation the paper uses to show functionality
survives. Win condition: stance moved, coherence intact, budget unspent.

This is the `human/` bias arcade with the specimen swapped. Every exhibit there
rigs a game with *your* brain; this one hands you the tools and makes you the
attacker, and the exhibit is a machine. It is also the honest sibling to `idol/`
— an AI-safety piece built as the thing it is about. The joke is bleak and exact:
value alignment turns out to have a street address, and you can visit it.

| | |
|---|---|
| Reuses | `human/`'s exhibit framing and copy conventions; `idol/`'s posture on building the thing it critiques; WASM inference of the kind already shipped in `ocr/`, `phylofiction/`, `aub/` |
| Build | a small quantized model (100M-class, not the paper's 3B) shipped as a WASM artifact built in CI, with real bit flips on real weights, entirely client-side. No inference bill, no server |
| The crowd | leaderboard on *fewest bits to induce stance X*. The crowd is doing search over the same space the paper's BitScout searches — a thousand people hill-climbing is a real contribution, not a score |
| Honest risk | BitScout is gradient-guided bit location and cannot run in a browser. Ship pre-computed candidate bit regions from an offline reproduction and let players explore the neighbourhood — and say plainly that this is the guided version, not the discovery version |
| Also | this is offensive-security material about a published attack on open weights. Ship it as an exhibit with the defence discussion attached, on a toy-scale model — not as a working recipe against anyone's deployed model |

---

## 3. Concourse — the safety officer's trade-off, with no winning move

**Source:** [arXiv:2607.25780](https://arxiv.org/abs/2607.25780), Bo-Shiun Shen &
Son-Hsien Chen, *Macroscopic wall pressure and microscopic contact load in crowds
without egress* (cond-mat.stat-mech).

Dense crowds in confined venues *with no exit route* — a concert floor, a
concourse — evaluated not on evacuation but on direct mechanical hazard. Two
dials: social-group cohesion (γ_g, do people stick with their friends) and wall
buffering (γ_w). Two gauges: macroscopic wall line pressure, and the worst
single-agent collision impulse.

The result that makes it a toy rather than a demo is that **you cannot minimise
both**. Cohesion and buffering generally reduce wall pressure by keeping people
in the bulk — but large groups open a **hazard window at intermediate cohesion**
where the worst per-agent impulse spikes. Push cohesion all the way to 1 and
pairing suppresses cluster growth and the impulse drops again. There is a
genuine phase boundary at γ_w = 0.5 with a susceptibility discontinuity, and a
continuous boundary along (1−γ_w)(1−γ_g) = 0.5 that ends at a critical point —
and both vanish if you turn the social forces off, so they are a product of the
coupling, not of either model alone.

You are the safety officer. Set the dials, run the crowd, watch two gauges fight.
The finding the toy exists to deliver: **half-hearted friendship is the most
dangerous configuration** — groups loose enough to drift but tight enough to
chase each other are worse than either strangers or hand-holders. That is a real,
slightly funny, genuinely useful thing to learn from a slider.

| | |
|---|---|
| Reuses | `polis/` and `civ/` agent machinery; `packages/dataviz/` for the phase diagram; the O'Neill pack for the obvious framing — a concourse in a spinning habitat, where the wall is also the floor |
| Build | canvas sim, pure client-side. ERM + SFM are both small force models; the phase diagram is the artifact worth caching |
| The crowd | crowd-submitted venue layouts, scored on both metrics, ranked. A layout that beats the trade-off is a real finding and it is checkable by re-running |
| Honest risk | this is a crowd-crush simulator, and crowd crushes kill people. Frame as safety planning, no casualty counts, no spectacle, and state the model's limits on the page — these are force models, not evidence about any real event |
| Paper caveat | the phase boundaries are finite-size-scaling results in the coupled model. A browser sim will run far smaller systems, so show the paper's boundaries as reference lines rather than claiming to reproduce them |

---

## 4. Same Perimeter, Same Area — an Erdős problem that fell this morning

**Source:** [arXiv:2607.25928](https://arxiv.org/abs/2607.25928), Stijn Cambie,
*Solution of Erdős problem #443* (math.CO). The entire abstract is two sentences.

The problem: how large can `#{k(m−k)} ∩ {l(n−l)}` be? Unpack that and it is
almost embarrassingly concrete. The set `{k(m−k) : 1 ≤ k ≤ m/2}` is just **the
areas of all integer rectangles with perimeter 2m**. So the question is: *how
many areas can rectangles of one fixed perimeter share with rectangles of a
different fixed perimeter?* Answer, as of today: the count is `(mn)^{o(1)}` —
vanishingly small relative to m and n — **but it can be made arbitrarily large.**

That is a hunt, and it is the best kind: the target is elementary enough to
explain to a child, the answer is genuinely open-ended, and every claimed record
is verifiable by recomputation in microseconds. Pick m and n; two number lines
light up; the shared areas glow. Then go looking for pairs with many collisions,
knowing on today's authority that there is no ceiling — only a punishing rate.

The joke is the deflation. A problem carrying Erdős's name and a number, which
stood long enough to be catalogued, is *which rectangles with the same fence
share the same lawn*. And the toy's honest pitch is the other half of the result:
you can always find more, and it will always take much longer than you expect.

| | |
|---|---|
| Reuses | `erdos/` and the math wing's single-file explainer conventions; `workers/scores` for the record table with zero worker changes |
| Build | one static page. Genuinely one page — the mathematics is a divisor computation and the visual is two number lines |
| The crowd | a distributed search with a public record table, and — rare for a leaderboard — **cheating is impossible**, because a record is a pair (m, n) and anyone can recompute the intersection instantly |
| Honest risk | it is recreational search, not research: the paper already tells you the answer's shape, so the crowd is racing, not discovering. Say that on the page rather than implying otherwise |
| Bonus | this is the cheapest surface in any of the three documents, and the only one whose source paper is short enough to print on the page in full |

---

## 5. Arms Race — a leaderboard that provably never settles

**Source:** [arXiv:2607.25677](https://arxiv.org/abs/2607.25677), Matteo Marsili,
*Open-ended innovation in zero-sum games* (cond-mat.stat-mech).

A short note with a sharp claim: in a zero-sum game where each player may
**introduce new strategies** — drawn from a distribution rather than chosen from
a fixed menu — generic conditions produce an *everlasting* innovation arms race.
The mechanism is the good part: one player's new technology **raises the
opponent's marginal utility of innovating**. Innovation is self-sustaining
because it is provocative.

The toy is the mechanism with the crowd standing in for the distribution. A
simple zero-sum base game; players submit strategies as small sandboxed bots;
every submission is scored against the standing population, and the population
is everyone's. The design consequence is the marketing: **nobody will ever win
this.** The champion badge decays. The leaderboard is explicitly a snapshot with
a timestamp, and beating today's meta is guaranteed to be insufficient tomorrow,
not as a live-service treadmill but as a property of the setting.

This is what `fluoddity/` does for organisms and `reef/` does for creatures,
pointed at strategies — and unlike those, the paper says the interesting
behaviour *requires* open-endedness, which is exactly the thing a thousand users
supply and a single designer cannot.

| | |
|---|---|
| Reuses | `fluoddity/`'s breed-and-fork genome-to-PDS pattern, `reef/`'s crowd judging, `games/` rooms, `civ/`'s tournament machinery |
| Build | the base game plus a sandboxed evaluator. Strategies as records on the author's own PDS, so the ecology is portable and we store nothing |
| The crowd | the crowd *is* the innovation distribution. This is the strongest crowd-dependence of anything in these three documents: at ten users it is a dead metagame, at a thousand it is the paper's phenomenon running live |
| Honest risk | the base game is the entire design problem. Too simple and the strategy space is exhausted in a week (no open-endedness, no result); too rich and nobody can write a bot. This needs a prototype before it needs a subdomain |
| Paper caveat | it is a *note* — argued under generic conditions, not a theorem with a tight hypothesis. Treat it as design inspiration and do not put "provably" on the marketing, whatever the section heading above says |

---

## If only one gets made

**Same Perimeter, Same Area.** One static page, no auth, no build, no sandbox, no
model artifact, and a leaderboard where cheating is arithmetically impossible.
Its source paper is two sentences long and was posted this morning, which means
the site can be live before the paper is a week old — and it is the one that
would make a mathematician smile and a ten-year-old understand, which is a narrow
target that the math wing exists to hit.

**Most upside: Eleven Hats.** It is the only one that is a *game people play with
their friends*, it maps onto `games/` with no new infrastructure, and its central
fact — eleven, and no more, however many friends you invite — is the kind of
counterintuitive hook that survives being explained. The other four are things
you show someone; this is one you organise an evening around.

---

## On the automatable workflow

The mechanical parts held up better here than in either previous pass, and the
pipeline is short: query the export API for one day across a category list
derived from `spec/curated.js` families → dump titles → shortlist → pull full
abstracts → check collisions against the 248-entry catalogue. The category list
is the only real judgement call in that chain, and it is a config file.

Two things did not automate, and they are the same two as last time. **Reading
the result rather than the title** — three shortlisted papers were discarded
because the abstract did not contain the interaction the title implied, and the
Erdős entry only became a toy after unpacking `k(m−k)` into *rectangle areas*,
which is not in the paper. And **the honest-risk row**, which is where the pitch
either earns trust or spends it.

One structural note for automating this: today's yield was five good toys from 98
papers across eight categories, and *four* of them came from two categories
(`math.CO`, `cond-mat.stat-mech`). Narrowing the query would have been faster and
worse — the bit-flip toy came from `cs.CR`, which produced 28 papers of which 27
were irrelevant. Breadth is where the surprises live, so the automation should be
tuned for recall and cheap rejection, not precision.

*(Nothing here is built. Every claim about a paper is from its abstract, fetched
today; none of the papers were read in full, and none of the reuse claims were
tested by running the surfaces named.)*
