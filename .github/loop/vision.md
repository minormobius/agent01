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

## What matters right now

1. **Something playable, sooner than something perfect.** The solids work is
   sound and it is still a library. A level a person can fail at is worth more
   than another exactness proof.
2. **Ask me the taste questions.** File them. I would rather answer three real
   asks a week than read a hundred green runs. See "asks" below.
3. **Prefer work whose value you could not have predicted.** If a ticket's
   outcome is obvious before it runs, it is bookkeeping. Bookkeeping is fine
   occasionally and it is not what this loop is for.

## What does not matter right now

- Coverage matrices whose axes the implementation does not distinguish.
  See `lp-dff7a6` — that lesson cost a turn and it should not cost another.
- Perfecting anything in `plant/` that no level uses yet.
- Anything in `foam/`. That tree is hand-authored and the loop never touches it.

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
