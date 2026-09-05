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

Eleventh request (2026-07-31), on general-template: asked whether external
documentation could point future build agents at this template. Read as a
genuine infra question rather than a repeat of the pondertag propagation asks
above — it targets root docs a human maintains, not page content a build
writes to itself. Answered honestly: a build's diff is walled off to its own
tenant directory (plus this profile), so no lab turn can edit the root
CLAUDE.md that would need the pointer, template turn or otherwise. Explained
on-page and in BRIEF.md rather than silently declining or attempting a
workaround via this profile file.

## Notes
Casual, warm tone in requests ("can u try harder maybe :3", "pls") even when
frustrated that nothing had shipped yet across two prior silent attempts. Reads
as patient about scope/time as long as something real lands — the frustration
was about silence, not about an imperfect first pass.

Tenth request ("general-template") was infrastructure/meta rather than a
math or game build: an explicit template tenant meant to model house style
for future sites. No new taste signal here — built with kit defaults
unchanged, which is consistent with "no stated preference yet" above. Worth
noting only that requests from this person aren't all math/viz asks; don't
over-fit future builds to that pattern alone.

Twelfth request ("meta-todo", 2026-07-31) extends that same infra-not-math
thread: explicitly asked for a non-user-facing internal document — "a to-do
list for internal agents at mobi labs to keep track of planned refactors" —
with no reference link and no further steer, same terse style as the
Newman-polynomial and pondertag asks. Read as: this requester treats the lab
factory itself, not just its output, as fair game to ask the bot to build
tooling for. Given the hard constraint that there's no shared backend a
build agent can read/write across turns, built an honest static index of
"next turn" items already sitting in other tenants' own BRIEF.md files,
rather than faking a live shared board. Consistent with the standing pattern
of not taking a mathematically-valid shortcut that quietly changes what was
asked for (see the cyclotomic-Littlewood note above) — said explicitly
on-page and in BRIEF.md that this is a snapshot, not a live board, instead of
building something that looked like real-time shared state but wasn't.

Fourteenth request (2026-08-01), "make a little game out of" another arxiv
abstract link (delegated fair division), with no further steer beyond the
link itself and an internal factory colleague's own writeup of the paper (not
from the requester). Consistent with the third request's standing pattern:
built a literal playable version of the paper's actual mechanism (drag goods
to centers then to members, live envy checker) rather than a summary. New
data point worth keeping: when a paper offers several variant definitions
(here, four ways a center can value a bundle, two info-structure modes for
members), and only one combination has a proven existence guarantee, picked
that combination for turn one rather than the more novel/harder one, and said
so explicitly in BRIEF.md — reasoning being a puzzle that might have no
solution is worse than a puzzle that's provably always solvable, and the
harder variant is a well-scoped "next turn" instead. Likely generalizes:
when a math/CS paper's own theorems pick out a "for this everything holds"
special case, ship that case first and name the harder general case as future
work, rather than guessing at a harder variant that might not actually work.

Fifteenth request (2026-08-14), "exhaustive gallery of elementary cellular
automata... let the user set the initial condition in one place & generate
the whole gallery in parallel from that" — terse, purely mathematical again,
no reference link. Consistent with the fourth/fifth requests' standing
pattern of taking a stated bound literally and building the real thing: "the
whole gallery" was read as literally all 256 rules (not a curated subset),
each independently addressable and simultaneously regenerated from one
shared control, with no extra sliders (width/steps fixed) added beyond what
was asked. "In parallel" read as "all computed together from one shared
input and shown side by side," not literally Web Workers — at this data
size (256 rules × 51 cells × 51 rows) plain synchronous JS is sub-frame, so
added complexity there would have been pure cost. Worth watching: if a
future ask pushes this kind of exhaustive-sweep pattern to a much larger
N, that's the point actual parallelism (workers) would start earning its
keep — not before.

Sixteenth request (2026-08-25), "user-inputs": another bare-formula math ask
with no reference link — Fourier coefficients of functions on S^1 with
f(θ+π)=−f(θ), used as a radial field to warp a checkerboard via polar
{r,θ}→{r+t·f(θ),θ}. Consistent with the fourth/fifth/fifteenth pattern of
taking the literal math seriously: named the actual basis (half-wave
symmetry ⇒ only odd harmonics survive, n=0 term forced to zero) rather than
just offering generic sliders, and added one secondary view — a live plot of
f(θ) itself — on top of the canvas the spec explicitly asked for, matching
the "provide multiple forms of visualization" pattern from the knot/complex-map
requests even though not stated this time. Only real simplification was
capping the basis at 5 odd harmonics (n=1..9) since the request implies an
infinite series; flagged in BRIEF.md rather than silently truncating.

Seventeenth request (2026-08-31), "draw-gaussian": another bare-formula ask
with no reference link — GL(2,Z) acting on the integer lattice, show the
preimage of the von Neumann neighborhood of an image point. Consistent with
the fourth/fifth/fifteenth/sixteenth pattern: took the actual algebraic
condition seriously (GL(2,Z) means det = ±1, not merely "integer entries" —
that's what guarantees an integer inverse) and enforced it live rather than
letting an arbitrary integer matrix through. Extended the single-point
construction into a second view for free by reusing the same computed
vectors (M⁻¹'s two columns) as a full alternate grid over the whole visible
lattice, rather than building a separate feature — worth trying this move
again on future bare-formula asks: look for a "draw the same vectors
everywhere" generalization before reaching for a second panel/canvas.

Eighteenth request (2026-08-31), same turn as "draw-gaussian" / lattice-preimage:
an immediate same-session follow-up ("very nice. now...") extending the single-
point construction into a recursive one — grow a tree from the origin, a fresh
random matrix per newly-linked point, recurse only on unvisited points, "for
like 8 levels." Confirms the standing pattern of quick, terse iterations on a
site they just got (cf. the Newman-polynomial fifth request) rather than a new
build. New data point: branching recursion on a lattice construction blows up
combinatorially (4x per level here) well before the requested depth is
practically reachable — flagged the safety cap explicitly in the UI/BRIEF
rather than silently truncating or letting the tab hang, consistent with the
"say when something is approximate" instinct already established.

Nineteenth request (2026-09-03), "minesweeper-but": asked for a genre mashup
rather than a math/paper build — minesweeper + sudoku + tetris fused, with a
specific mechanic named outright ("every time you hit a mine... it just puts
a tetromino in ur tetris game") rather than left to invent. Consistent with
the standing pattern of taking a literal mechanic seriously rather than
softening it: read "puts a tetromino in" as "force-locks whatever piece is
currently falling" (reusing the existing hard-drop path) rather than a vaguer
"something bad happens to the tetris board". New data point, same shape as
the cyclotomic-Littlewood note: flagged a real simplification explicitly
instead of taking it silently — the sudoku puzzle's correctness check is
against one generated solution, not verified to have a unique logical
solution, so this requester should be told that up front if a follow-up
pushes on puzzle rigor specifically.

Twentieth request (2026-09-03), "but-grid": a second falling-block-mechanic
mashup in a row (after the nineteenth's minesweeper/sudoku/tetris fusion) —
"tetris but the grid is a bit taller than usual but also it keeps dropping
additional tetrominos before the one you're currently placing has landed,
and your inputs affect every currently-falling tetromino at once." Same
literal-mechanic pattern as always: built pieces that are genuinely solid to
each other (not just to the locked stack) so "every piece moves on every
input" doesn't degrade into pieces overlapping through one another — treated
as the actual hard part of the request and said so explicitly in BRIEF.md.
Picked a made-up name ("Swarmwell") rather than reusing "Tetris" anywhere in
the title/headings, per the tube-tetris trademark lesson already in
CLAUDE.md. Worth noting as a pattern of its own now: this requester returns
to the falling-block-tetromino mechanic specifically as a base to remix,
across two consecutive requests — treat a future "tetris but X" ask as
wanting the X mechanic taken completely literally, same as the math asks.

Twenty-first request (2026-09-05), "complex-polynomial": another bare-formula
math ask, no reference link — drag coefficient points on the complex plane,
permute them, change degree, see the roots, "exact for low degree, numerical
methods for higher degrees" stated outright. Consistent with the fourth/
fifth/fifteenth/sixteenth/seventeenth pattern of taking the literal math
seriously: built real closed-form solvers (linear/quadratic/cubic via
uniform complex-arithmetic Cardano, no real/complex branching) rather than
numerics-only, and read "permute them" as literally shuffling the
coefficient array (same complex values, reassigned across powers) rather
than a vaguer "shuffle the points visually". New data point on the standing
"flag the shortcut" habit: skipped the quartic's own exact formula (Ferrari)
for time and fell through to Durand-Kerner numerics one degree earlier than
strictly necessary (degree ≥4 instead of ≥5) — said so explicitly in
NOTE.txt and BRIEF.md rather than letting "exact for low degree" quietly
mean "exact only through cubic" without comment.

Thirteenth request (2026-07-31), continuing meta-todo: asked for two
prioritized backlog entries — a max-priority one about pointing future build
agents at general-template as their base, a high-priority one about rolling
the pondertag out to existing pages. Added both as ordinary rows in the
board's own `ITEMS` data (with a new `priority` field and sort), each
honestly flagged as needing work outside this tenant's own diff. Worth
distinguishing from "Said no to" above: those were asks to make a page or
comment *itself* carry a self-propagating instruction for whichever agent
happened to read its source. This was an ask to add a data row to a
purpose-built backlog board — the board's whole job — not an instruction
embedded in arbitrary page content. Same requester, same topics (template
adoption, pondertag), different and legitimate shape of ask; don't conflate
the two when a future request touches either topic again.
