# Pressure — `/pressure/`

The hub for the decisions-under-pressure games, and the design brief for what
comes next. A single hand-written page, no build step, served through the
assets fallback in `games/worker.js` like the games it indexes.

Shipped so far: [Hold the Line](../horde/) (`/horde/`) and
[Telegraph](../telegraph/) (`/telegraph/`).

---

## The thesis

**Pressure is a tax on deliberation.** Deliberation is free in the abstract; a
game becomes a game about decisions the moment thinking starts costing you
something. Each game in this family picks a different tax and charges it.

That framing is useful but it is not the load-bearing one. Taxes alone get you
reskins — swap the clock for a fuel gauge and you have the same game wearing a
hat. The axis that actually produced two *different* games is narrower:

> Each game should make a **different thing measurable** about your decision.
> Not "was it fun" — what, precisely, can be computed about the choice you just
> made?

Hold the Line can only say "a better player would have got further", inferred
from bots. Telegraph can say "4 of 812". That is a difference in kind, and it
came from a structural choice (remove the clock and the randomness, so a turn
becomes exhaustively searchable), not from a theme.

Once you see it that way the space opens up, because "correct" can be:

| shape of correctness | game |
|---|---|
| better or worse, no ground truth | Hold the Line |
| a countable set | Telegraph |
| whether a future still exists | The Ratchet |
| a timing — when to stop | Cold Read |
| a probability distribution | Standoff |

Everything below is chosen to fill a row nothing else fills.

---

## 1. The Ratchet — *tax: irreversibility*

**Pitch.** A route you cross exactly once. You carry a small kit of single-use
verbs — a bridge, a bribe, a shortcut, a night's rest. Each stage poses an
obstacle that several tools could solve. The whole route is visible from the
start. Spending the right tool on stage two can strand you on stage six.

No clock. No opponent. No hidden information. The pressure is entirely the
future shrinking behind each choice.

**Why it is not Telegraph.** Telegraph's pressure is spatial and resets every
turn: a bad turn costs integrity, not options. Here a choice permanently deletes
a capability, so the difficulty compounds across the whole run. Telegraph asks
"what do you allow *now*"; the Ratchet asks "what will I still be able to do".

### Shape

- 8–12 stages, linear, all visible up front.
- A kit of ~6 tools, each usable **once** per run. Some stages accept several
  tools at different costs; some accept exactly one.
- A stage you cannot pay for costs a life/supply; run out and the run ends.
- Deterministic from the seed. No randomness after generation.

### The measurable

Not "was that stage optimal" — **the exact move where the run became
unwinnable.** A forward search over remaining kit-orderings can answer "does any
assignment of my remaining tools complete the remaining route?" after every
choice. So the game can name the moment you actually lost, which is usually
several stages before you found out.

```
stage 6 — you are out of options.
the run became unwinnable at stage 2, when you spent the BRIDGE on the ravine.
41 of 720 orderings completed the route at that point. 0 of them used the bridge there.
```

That readout does not exist in either shipped game, and it is brutal in a way a
per-turn score cannot be.

### Feasibility

Kit orderings are `6! = 720` at worst, and pruning is trivial (a tool that
cannot pay for any remaining stage is dead). Exhaustive per-choice search is
cheap. The generator must guarantee at least one completing ordering, exactly
like Telegraph's answerability repair — and that check is the same search.

### Risks

- **Trivially loose or brutally tight.** If most orderings complete, no choice
  matters; if one does, it is a lock-picking exercise. The generator needs a
  target band on "fraction of orderings that complete", which is the direct
  analogue of Telegraph's tightness and should be tuned the same way.
- **Perfect information plus no clock means a determined player can solve it by
  hand.** That is acceptable — so can a chess puzzle — but the stage count must
  stay small enough that the *interesting* difficulty is noticing the trap, not
  bookkeeping.

---

## 2. Cold Read — *tax: the cost of knowing*

**Pitch.** Contacts come in and you must call each one — friend or hostile —
before you are sure. Every probe that sharpens your read costs something: a
second, a resource, a risk of being noticed. Guess early and cheap, or pay until
you are certain and be too late for the next one.

**Why it is not Hold the Line.** Both have a clock, but Hold the Line's clock
pressures *execution* — you know what to do and must do it fast. Here you know
exactly how to act and cannot yet tell *which* action applies. The scarce thing
is confidence, not time, and time is merely one currency you can spend on it.

### Shape

- A queue of contacts, each with a hidden true type.
- Probes: each returns a noisy signal (a known likelihood ratio) and costs.
- You commit a call at any point. Right calls pay; wrong calls hurt, and
  asymmetrically — a missed hostile costs far more than a wasted probe.
- The asymmetry is the design: it makes the optimal confidence threshold
  something other than 50%, which is where the game lives.

### The measurable

**Optimal stopping.** The belief state is one number (a posterior), the update
is Bayesian, and the cost structure is known — so the value-maximising stop
point is computable exactly by backward induction. The readout grades *when* you
decided rather than what you decided:

```
you called it at 71% after 2 probes.
the optimal stop was 1 probe ago — at 64%, the third probe cost more than it bought.
over this run you probed 1.4× more than optimal. you are paying for comfort.
```

A per-run calibration score falls out for free: of the calls you made at ~70%
confidence, how many were actually right?

### Feasibility

Discretise the posterior into ~50 buckets and backward-induct over a bounded
probe count. Milliseconds. The hard part is not the maths, it is presenting a
posterior to a player without a number — colour, blur, and how *steady* a
reading looks are all better than "71%".

### Risks

- **It can become a spreadsheet.** If the player can compute the posterior, the
  game is arithmetic. The signals must be legible as *impressions*, not as
  numbers — which means the honest readout at the end is doing a lot of the
  teaching.
- **Bayesian games are notoriously unfun when the feedback is noisy**: you can
  play perfectly and lose. The scoring has to grade the *decision* (against the
  optimal stop) and not the *outcome*, or it punishes correct play. This is the
  single most important design constraint of the three.

---

## 3. Standoff — *tax: another mind*

**Pitch.** Both sides commit blind, then reveal. A small verb set with a
rock-paper-scissors heart — strike, guard, feint — plus resources that make some
verbs affordable and others desperate. The opponent is an **exploiter**: it
builds a model of your tendencies and punishes them.

**Why it is not Telegraph.** Telegraph is a solitaire puzzle against a
deterministic system that never bluffs, because a bluff is hidden information.
This is the mirror: everything hinges on hidden simultaneous choice, and the
system is *trying to read you*.

### Shape

- Both sides pick one verb per round, simultaneously, then reveal.
- A cyclic core (strike beats feint, feint beats guard, guard beats strike) so
  no verb dominates.
- Resources break the symmetry: strike costs stamina, guard restores it, being
  out of stamina removes options — so the matrix *changes* each round and the
  right mix changes with it.
- The opponent tracks your conditional frequencies ("what do they do after
  taking a hit?") and best-responds, with a floor of randomness so it is not
  itself trivially exploitable.

### The measurable

**Exploitability.** For a matrix this small the equilibrium mixed strategy is
computable, so the game can report how much a perfect reader of your patterns
would win against you:

```
20 rounds. you were 23% exploitable.
your tell: after taking a hit you guard 68% of the time. equilibrium says 34%.
```

This is the only game in the family where a single move cannot be right or
wrong. What can be wrong is your *habit* — and being told your own tell is a
genuinely novel thing for a game to say to you.

### Feasibility

3–5 verbs means a 3×3 to 5×5 zero-sum matrix; solve by linear programming or
just fictitious play, both trivial at this size. Conditional-frequency tracking
is a few counters.

### Risks

- **Small matrices are solvable and then boring.** The resource layer is what
  keeps the matrix moving; if it is too weak the game collapses into "play the
  equilibrium mix" and there is nothing to learn. This is the main thing to
  playtest first, and it is testable without art: does the equilibrium mix
  change materially between resource states?
- **Exploiters feel unfair.** If the opponent adapts too fast it reads as
  cheating even when it is not. It needs a visible model — show the player what
  the opponent believes about them — or the punishment is illegible.

---

## Notes for whoever builds these

Everything that worked twice, and would work again:

1. **Write the analysis tool before the pixels.** In both shipped games the tool
   found design-breaking problems that no amount of playing would have surfaced:
   an uncapped upgrade that deleted the core mechanic, one opening in five that
   was unanswerable, a resolution order that made the game lie about itself.
2. **Bots in a spread, never one.** A single number tells you nothing. The *gap*
   between a deliberately bad policy, a naive one and a good one is the game's
   skill headroom. If the naive bot matches the good one, the mechanic you are
   proudest of is decorative.
3. **Keep the sim pure and seeded.** No DOM, no clock, no `Math.random`. It is
   what makes the tool possible and what makes a URL a permalink to a run.
4. **Guarantee the contract the genre implies.** Telegraph promises a right
   answer exists, so the generator verifies one does. The Ratchet promises a
   completable route; Cold Read promises the optimal stop is reachable. Verify
   it at generation time and assert it in the selftest.
5. **Grade the decision, not the outcome** — this matters most for Cold Read,
   where correct play loses often.

Build order if you want the cheapest first: **The Ratchet** (no new maths, the
solver is a search you have already written twice), then **Standoff** (small
matrices, well-understood), then **Cold Read** (the most delicate to make
enjoyable rather than merely correct).
