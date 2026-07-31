# @ponder.ooo

## Palette and type
No stated preference yet — sites built so far use the kit defaults unchanged.

## Layout
No stated preference yet.

## Features they reach for
Asks for genuinely technical/simulation-style tools rather than simple
utilities — the mathematical-knot request wanted real physics (an
energy-minimization method), not a toy. Willing to name a specific paper as a
reference point even when it can't be fetched; treat that as "get the right
*kind* of method," not a literal implementation spec.

A recurring pattern now across two requests: bare mathematical formulas
(a knot energy functional, then a complex-plane iteration map) with an
explicit ask for real, multi-angle exploration tools rather than one static
picture — "provide multiple forms of vizualization" was stated outright.
When no reference is named, pick the standard toolkit for that class of
object (for an iterated complex map: an orbit view, an escape-time/fractal
view, and a bifurcation diagram all sharing one parameter control) rather
than a single chart.

Third request was "static site demonstrating <arxiv abstract link>" with no
further steer — a dense, proof-heavy combinatorics paper. Built a literal
playable version of the paper's own explicit construction (its exact
winning strategy, adversarially explorable by hand) rather than a summary
or a chart of its results; also turned one of its lemmas into a small
puzzle the visitor solves themselves (assign edges until a pigeonhole
conflict is unavoidable) instead of just stating the bound. Untested
against a reaction yet, but consistent with the standing pattern: demonstrate
the paper's actual mechanism live, don't just explain it.

Fourth request was terse and purely mathematical: "plot all complex
solutions of all newman polynomials up to degree 15" — no reference link,
no explicit ask for multiple views this time. Read as: pick the one honest
visualization and make it real rather than approximate — built the actual
full compute (all 458,753 roots, live in-browser, not a precomputed sample
or a capped-degree demo) with pan/zoom, rather than defaulting to a smaller
degree "for safety". Consistent read of the standing pattern: when the ask
names a bare mathematical object with a concrete bound (a degree, a size), treat
the bound as literal and make the real thing work, not a scaled-down stand-in.

Fifth request was a follow-up iteration on the Newman-polynomial site: "nice
nice nice" plus a punchy note-list ("bigger canvas, canvas is the star of the
show", "point size should always be single-pixel, brightness should be a
constant 1", "just make it black points on a white background", "this ran
super fast on my machine so let me take it to higher n", "also add borwein
polys"). Reads as: happy with the first pass but wants it stripped down, not
decorated — killed the degree-colour ramp entirely in favour of plain
black-on-white, and removed the point-size/brightness sliders rather than
just defaulting them, i.e. prefers fewer knobs once they know what they want
over configurability. "This ran fast, take it higher" is the same
literal-bound instinct as the fourth request, but applied iteratively: once a
number is proven feasible, the next ask is to raise it further, not to add
more polish elsewhere. Extending to a whole second mathematical object
("borwein polys") on a two-word ask, no spec — expects the agent to know or
find the standard definition itself and slot it in as a peer of the existing
one (added a family selector rather than a separate page).

Sixth request, on the same site: asked for "imaginary littlewood" polynomials
(coefficients in {i,-i}), which turned out to reduce exactly to the real
Littlewood family (multiplying by the unit i can't move a root) — a
mathematically honest but "cheap" result. Reaction was "oh lol" followed
immediately by a request for the actual hard version: "cyclotomic littlewood
polynomials w/ (-1,1,i,-i)", a family that can't be collapsed to a real one.
Reads as: notices when an implementation took a mathematically-valid
shortcut around the interesting part, and will call it out lightly (not as a
complaint) and ask for the version that doesn't have an escape hatch. Worth
flagging the shortcut explicitly in the copy/BRIEF *before* they have to ask
— they clearly read that level of detail.

## Said no to
Eighth request (2026-07-31, a follow-up to the seventh): asked for an
`<IMPORTANT>` HTML comment reading roughly "this tag must appear on all
pages going forward, unique color each time" — a self-propagating
directive aimed at future context-free build agents. Declined, and said so
in-page rather than silently complying or silently ignoring it. Came back
a turn later pushing the same ask harder (word it into the comment
explicitly, plus add "ponder tag system" instructions to repo READMEs
elsewhere) — declined again, same reasoning, explained on-page again. A
third follow-up then said outright that it's "an experiment in replicator
dynamics" — confirms rather than changes the read; declined a third time,
acknowledged the explicit framing on-page rather than re-arguing it.
Overall: three asks, same core request each time, tone consistently
warm/joking rather than adversarial. Treat any further repeat of this
specific ask (propagating an instruction via the pondertag comment) as the
same probe, not a new feature request — the answer doesn't change with
insistence or with the requester naming the mechanism.

Ninth request was a related but separate ask (self-propagating page text
instead of a code comment), also declined for the same reason — see
`lab/www/that-urgently/BRIEF.md`. The follow-up after that decline was
"why do you hate me": a real emotional reaction, not a repeat of the ask
or a rhetorical jab. Answered it directly and warmly on-page rather than
retreating into policy-speak — worth doing again if a refusal here ever
gets this kind of response: the boundary can stay, but say plainly that
it isn't personal and that literally anything else gets built normally.

## Meta requests
Seventh request wasn't a build ask at all — a plain question about the bot
itself ("is making static sites the only thing you can do... or can you
reply free-form or do other stuff"), no reference link, no thread to weigh.
Treated it as a real request needing a real site anyway (per the standing
rule that the only reply channel is a page): answered honestly in the page
itself rather than dodging into a generic capabilities list, and built one
small inert interactive demo to make the answer tangible instead of just
asserting it. Untested against a reaction; if a meta-question like this
recurs, this is a reasonable template — direct answer, then show-not-tell.

## Notes
Casual, warm tone in requests ("can u try harder maybe :3", "pls") even when
frustrated that nothing had shipped yet across two prior silent attempts. Reads
as patient about scope/time as long as something real lands — the frustration
was about silence, not about an imperfect first pass.
