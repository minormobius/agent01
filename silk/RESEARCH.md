# Spiderweb Physarum — has it been built, and what would it be?

A literature search and a design record, written before and alongside
[`js/weaver.mjs`](js/weaver.mjs). The condensed version is on the page's
*what this is* tab; this is the long form with the citations.

---

## 1. Has the agent already been made?

**Partly, twice, in two literatures that barely cite one another.** Neither has
made the thing this surface is about, but both have made most of it, and it
would be dishonest to present any of the mechanics below as new.

### 1.1 Rule-based orb-web builders: settled work since 1997

Thiemo Krink and Fritz Vollrath, *Analysing spider web-building behaviour with
rule-based simulations and genetic algorithms*, **Journal of Theoretical
Biology 185(3): 321–331 (1997)** —
<https://www.sciencedirect.com/science/article/abs/pii/S0022519396903069>.

They built "cyber spiders" whose construction was driven by a set of rule
parameters encoded as artificial genes, and ran a genetic algorithm over a
population of them against an adjustable ecological niche. The validation is
the part that matters: they compared the best evolved webs against real
*Araneus diadematus* webs built under controlled laboratory conditions, and
matched spiral distances, eccentricity and vertical hub position.

A follow-up, *Artificial intelligence modelling of web-building in the garden
cross spider* (JTB) —
<https://www.sciencedirect.com/science/article/abs/pii/S0022519305803947> —
put a virtual spider robot under a rule system and evolved its path-finding
rules under cost–benefit evaluation.

So: "a local-rule agent that produces a plausible orb" is thirty-year-old
settled work. The stage sequence, the radius-splitting rule and the spiral
gauges in `weaver.mjs` are all in this tradition.

### 1.2 The behavioural side, sharpened in 2021

Abel Corver, Nicholas Wilkerson, Jeremiah Miller & Andrew Gordus, *Distinct
movement patterns generate stages of spider web building*, **Current Biology
(2021)** —
<https://www.cell.com/current-biology/fulltext/S0960-9822(21)01270-7>
(code: <https://github.com/GordusLab/Corver-Wilkerson-Miller-Gordus-2021>).

They tracked millions of individual leg actions of *Uloborus diversus* with
machine vision and clustered the movements without supervision. A hierarchical
hidden Markov model recovers **stages** of web-building as stereotyped action
sequences largely shared across individuals — and, the finding that shaped the
design here, those stages can run in *atypical* progressions without becoming
different behaviour.

That is a stage machine whose transitions fire on local conditions rather than
on a schedule, which is exactly the shape of `Weaver.step()`.

Adjacent and useful:

- William Eberhard, *Orb web construction in a new generation of behavioral
  analysis: a user's guide* (Advances in the Study of Behavior, 2024) —
  <https://www.sciencedirect.com/science/article/abs/pii/S0065345424000019>.
  The decision the spider repeats most is *where to attach the sticky spiral to
  each radius it crosses*, and it uses at least ten cues to make it. The two
  gauges in `do_capture` are a two-cue caricature of this, and the honest label
  for the other eight is "not modelled".
- Zschokke and others on frame and anchor threads: the overall shape of the web
  and much else is fixed by the frame and its anchors, and spiders avoid
  attaching radii to the frame close to an anchor. *The secondary frame in
  spider orb webs* (Scientific Reports, 2016) —
  <https://www.nature.com/articles/srep31265>.

### 1.3 The Physarum side, developed entirely separately

Jeff Jones' multi-agent model of *Physarum polycephalum* — *The emergence and
dynamical evolution of complex transport networks from simple low-level
behaviours* (<https://arxiv.org/abs/1503.06579>), and the 2015 book *From
Pattern Formation to Material Computation* — is the canonical
environment-as-memory agent. Particles deposit a trace, sense its gradient and
reinforce what they sense; transport networks form, grow and minimise with no
particle holding a map. Everything the word "physarum" now evokes in a
simulation context (Fogleman's and Jenson's renderers among them) descends from
it.

### 1.4 What I could not find

Work that treats web-building **explicitly as the Physarum problem with a
different deposition medium** — boundary conditions as the input, the admissible
*family* as the output, and the within-family spread attributed to construction
order and measured as such. Searches across the orb-web behaviour literature,
the Physarum modelling literature and open-source web simulations turn up the
two traditions separately and nothing joining them.

Open-source spider-web code is almost all one of two things: decorative
mouse-reactive canvas cobwebs, or Verlet cloth with a spider sprite on it. The
honourable exception is Prajwal Souza's physics simulation
(<https://prajwalsouza.github.io/Experiments/Spider-Web-Simulation.html>),
which credits Krink & Vollrath — but it simulates the *finished* web's
mechanics rather than the construction sequence.

**So the agent has been made. The reading offered here has not, as far as I can
find. That is a literature search, not a priority claim** — a negative result
from web search and abstract-reading, not from a systematic review, and the
obvious way for it to be wrong is a paper phrased in vocabulary I did not
search.

---

## 2. What properties does such an agent have?

Ten. Each is implemented in [`js/weaver.mjs`](js/weaver.mjs) and, where it is
checkable, asserted in [`test/weaver.selftest.mjs`](test/weaver.selftest.mjs).

**1. Embodied and local.** A position, a heading, and two reaches. It cannot see
the web; it can only touch what it is standing on. Every question it asks is one
of three sense calls resolved against the fabric as it currently hangs.

**2. Its own output is its only road.** It moves on substrate and on silk it has
already laid. This is the source of everything else: the structure under
construction is simultaneously the scaffolding, the ruler and the map. An anchor
it fails to reach during framing is not merely unused — it is *unreachable
thereafter*, because there is no silk road to it.

**3. The environment holds the state.** Internal registers never exceed what an
animal could plausibly carry: which side it last worked, which radius it is on,
how far out it is, the distance of the previous attachment. This is the Physarum
correspondence and it is exact.

**4. The trace does not decay — and this is where it stops being Physarum.**
A chemoattractant evaporates, so a slime mould can forget a bad early commitment
and re-optimise; its final network is largely independent of the order the tubes
were laid in. Silk cannot be un-laid. Construction order is therefore carried
into the finished object, which is why the family is generated by path
dependence rather than by noise, and why the damage from a perturbation is a
monotone function of *when* it happened. **This is the whole thesis of the
surface, and the path-dependence view is its measurement.**

**5. A stage machine, not a plan.** Bridge → frame → hub → radii → auxiliary
spiral → capture spiral → finish, with transitions firing on local conditions
("no rim gap wider than a leg span remains"), never on a clock or a target
count. Following Corver et al.

**6. Bodily stopping rules.** Radius count is not a parameter: it is rim
perimeter ÷ leg span, because a gap the animal cannot straddle is a gap it must
split. Mesh height is a different, much shorter reach — the inner foreleg held
on the previous turn. In a real orb the first is ~6× the second, which is why a
web has ~30 radii and ~15 spiral turns rather than ~30 of each.

**7. Gravity-asymmetric by behaviour, not by mechanics.** It stops short on its
drop, so the hub rides high; it lets the mesh run wider above the hub than
below. On the square reveal: hub rise +0.113, capture area below ÷ above 1.44,
mesh above ÷ below 1.21. With gravity set to zero: −0.011, 0.95, 1.06. The
control is what makes this a result rather than a coincidence.

**8. It destroys as it builds.** The auxiliary spiral is a handrail, not a
product; the capture spiral eats it turn by turn and recovers ~85% of the
protein. The agent is standing on the thing it is removing.

**9. Resource-bounded, degrading in a fixed order.** Frame and radii are
non-negotiable; a shortfall lands on the capture spiral. Run it short and it
stops mid-inward with a real, usable, unfinished web — and the scaffolding it
never reached still hanging, which is the visible signature of the shortfall.

**10. Deterministic given a seed, with separated decision streams.** Without
determinism there is no family, only anecdotes. Without *separate streams per
decision class* there is no path-dependence measurement, because perturbing an
early decision would reshuffle every later draw and you could not distinguish
structural propagation from a different roll.

---

## 3. What the measurements say

Sixteen seeds, `window reveal`, from `test/weaver.selftest.mjs` and the family
view:

| | mean | CV |
|---|---|---|
| capture area | 341 400 | 0.5% |
| capture silk | 26 540 | 1.9% |
| spiral turns | 18.2 | 1.9% |
| silk used | 44 600 | 2.3% |
| mesh below hub | 15.2 | 4.7% |
| radii | 34 | 4.4% |
| mesh above hub | 18.3 | 5.7% |
| mesh above ÷ below | 1.21 | 10.3% |
| area below ÷ above | 1.44 | 13.9% |
| hub rise | 0.113 | 21.4% |

Meanwhile a thread in seed 1's web lies on average **12.2 world units** from the
nearest thread of another member. Two *identical* webs slid half a mesh cell out
of register would score 8.4 — so the members are past the point where one could
be a shifted copy of another. **Tight numbers, uncorrelated geometry.** That is
what "a family" means here.

Path dependence, seed 3, one decision nudged at a time:

| perturbation | divergence (world units) |
|---|---|
| the bridge line | 15.0 |
| radius #1 | 7.0 |
| radius #3 | 5.3 |
| radius #7 | 4.7 |
| radius #15 | 2.9 |
| radius #27 | 0.5 |
| spiral attachment #60 | 0.2 |
| spiral attachment #400 | 0.1 |
| *(reference: a different seed — every decision re-drawn)* | *12.3* |

Two orders of magnitude, monotone in construction time. And note the bridge:
re-casting that one line is worth **more** divergence than re-drawing the entire
night, because a new seed may well re-draw the same bridge while the
perturbation forces a different one — and everything after it is measured
against where it landed.

---

## 4. What is not modelled, and would change the answer

Said plainly, because a model's silences are where it misleads.

- **Two dimensions.** Real webs are built in a plane held in a three-dimensional
  tangle, and the bridge line is cast through a volume. Here silk cannot cross
  the leaf; in a real web it passes in front of it.
- **Eight of the ten cues.** Eberhard's count for the sticky-spiral attachment
  decision is at least ten; `do_capture` uses two.
- **Repair and re-tensioning.** A real spider re-tightens and re-attaches
  throughout. Here nothing is revised once laid, which *overstates* path
  dependence — the honest version of the thesis is that an undecaying trace
  makes revision expensive, not impossible.
- **Prey, cost and selection.** There is no fitness here at all. Krink &
  Vollrath's contribution was precisely the cost–benefit loop, and without it
  this agent cannot say which member of a family is *better*, only that they are
  all admissible.
- **Species.** The body constants are a caricature of a large orb-weaver. The
  ratio of leg span to mesh gauge is the parameter that would move most between
  species, and it is exposed on the page as two sliders for exactly that reason.
