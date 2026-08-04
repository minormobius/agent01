# Vision

**This file is the operator's channel into the loop.** Everything else the
agents read is derived — the ledger, the graph, the findings, the gates. This
is the one input that is simply *asserted*, and every planning turn reads it
verbatim before it proposes anything.

It is not a spec. `foam/FACTORIO.md` is the spec, and it describes what the
thing is. This describes **what matters right now, and why** — the judgement a
machine cannot derive from a repository, only inherit from a person.

Edit it whenever the answer changes. It takes effect on the next planning turn.
No deploy, no restart, no ceremony.

---

## What we are actually trying to find out

Whether a loop of agents can make something a stranger would want to play.

Not whether it can pass gates — it can, and turns 3 through 5 proved the
machinery works end to end. The open question is whether work that passes every
machine check adds up to a game, or to a very well-tested pile of correct
functions. That is the thing the curve is supposed to measure and currently
cannot, because no signal in this loop has ever come from outside it.

## The operator's verdict on what is built so far

> *"I notice this isn't the foam game with object placement, but an explainer
> for how it might be achieved."*

That is correct and it is the most important sentence in this file. What exists
at `plant.minomobi.com` is a **summon inspector** — it demonstrates the
primitive beautifully and nobody can play it. You cannot place a source next to
a processor and watch something flow. There is no pocket, no player, no
failure that isn't a slider going red.

**Stop making the explainer better. Make the game.**

An explainer is the natural attractor for a loop like this, and that is exactly
why the warning is needed: explaining the primitive is legible, gateable,
provable, and safe. The game is none of those things until it exists. Every
turn that polishes the inspector is a turn that scores well and moves nothing.

## What matters right now — in order

1. **PRODUCTION. `FACTORIO.md` §3, oracle-stack gate 5.** Sources emit at a
   rate, processors consume and emit, sinks demand. A factory is a flow
   network, so *"is this puzzle satisfiable?"* is a feasibility question over a
   small non-negative linear system — exact, cheap, no search, no heuristics,
   and **no model opinion anywhere in the judge**. That is the next real gate
   and the last one that is straightforwardly buildable before §4's build
   certificate, which is the genuinely hard one. Start here.
2. **PLACEMENT IN A REAL POCKET.** A constellation summoned into an actual
   `foamworld` pocket, next to seeds that already exist, refused when it does
   not fit. `clearanceNeeded`, `selfCompatible` and `pairGap` were all built
   for this and nothing calls them against a real pocket yet.
3. **A LEVEL SOMEONE CAN LOSE.** One screen, a source, a sink, a constraint
   that bites. Ugly is fine. Unbalanced is fine. *Unplayable is not.*
4. **Ask me the taste questions.** I would rather answer three real asks a week
   than read a hundred green runs. See "asks" below.

## What does not matter right now

- **More inspector.** It is done. It has a job — showing a stranger the
  primitive in thirty seconds — and it does it.
- Coverage matrices whose axes the implementation does not distinguish.
  See `lp-dff7a6` — that lesson cost a turn and it should not cost another.
- Perfecting anything in `plant/` that no level uses yet.
- Anything in `foam/`. That tree is hand-authored and the loop never touches it.

## The bar for "playable"

So this is not a matter of opinion later: a person who has never seen this
opens a URL, and within thirty seconds **does something that can fail**. Not a
slider that turns a label red — an intention they formed, acted on, and got
refused for. Until that exists, the loop is building toward it and nothing
else.

## Standing answers

Things I have already decided, so nobody spends an ask on them:

- **You do not need my sign-off to finish a turn.** Decide, record the
  decision, continue. Human review happens at a coarser grain than the turn.
- **Breaking `plant/` is fine.** It is the loop's tree and it is reversible.
  Breaking `foam/` is not, and you cannot reach it.
- **Ugly and playable beats elegant and inert.**

---

## Asks — how to get my attention

You cannot wait for me. Your turn ends, the chain continues, and you will never
see the answer; a later agent reads it as memory. That is the design, and it is
what makes asking safe.

Put this in your outbox. All three protocol fields are required and the
validator refuses an ask without them:

```json
"asks": [{
  "title": "Does the tetrahedron summon read as a *source* or as decoration?",
  "body": "Why this is not decidable from here, and what I already tried.",
  "do":     "Open plant/levels/2, place one tetrahedron, play for two minutes.",
  "watch":  "Whether you try to route into it without being told to.",
  "soThat": "If yes I build the processor next. If no I put the glyph work first."
}]
```

`do` / `watch` / `soThat` exist because "what do you think?" is not an ask, it
is a shrug pointed at a human. **`soThat` is the one that matters**: if you
cannot say what each answer would change, the ask is spending the only
resource this loop cannot manufacture on nothing. Don't file it.

Answers arrive as `decision` beads in the memory every brief carries.
