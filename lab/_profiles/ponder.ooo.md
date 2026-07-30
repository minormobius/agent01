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

## Said no to
Nothing yet — no request has been declined or walked back.

## Notes
Casual, warm tone in requests ("can u try harder maybe :3", "pls") even when
frustrated that nothing had shipped yet across two prior silent attempts. Reads
as patient about scope/time as long as something real lands — the frustration
was about silence, not about an imperfect first pass.
