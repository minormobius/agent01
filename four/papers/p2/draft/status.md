# Paper 2: where it stands

<!-- The status page for paper 2 (fusion, stars, abundances and gravity in four dimensions): what is established, what
     it means, what comes next. Every number is a token read by build.mjs from the committed data, so the page moves
     when a run lands; write numbers as tokens, never by hand. Rewrite the prose when a result changes its meaning. -->

**In one screen.** Paper 2 asks what kind of stars a four-dimensional universe would have, and what they would make.
The forces that decide it are not given, so the paper narrows them in windows: how strong the nucleon force is (its
strength $s$, with 1.5152 the value nearest ours), how strong the weak force is, and how strong gravity is ($G$, in
multiples of ours). The latest stretch of work aged the stars themselves, shell by shell, instead of judging their
lives from a frozen zero-age core. Four things came out of it.

1. **Sun-like stars live far longer than assumed.** Of the 29 Sun analogues, 28 burn half their central
   hydrogen in 10.6–177 Gyr, 2.3–39 times the 4.6 Gyr the earlier convention gave every one of
   them. Time is not what limits this universe.
2. **Near our strength, the stars make heavy elements while still burning hydrogen.** At $s$ ≤ 1.55, 9–30% of a star
   is past helium by the end of its run, mostly element 8, oitrogen, pxygen and gluorine. Our own main-sequence stars make only helium.
3. **What metals do depends on which metals.** One to two per cent of the first stars' own ash (elements 6–12) moves a
   four-dimensional star's opacity by only −0.4% to +4.2%: absorption by a light ion falls much faster
   with its charge than in our world. The rock row (elements 13–23), which the exploding stars return, is different:
   ×1.03–6.5 at the centre and ×1.97–14 at 0.9 of the mass, where heavy ions keep their inner electrons.
   The first second-generation star bears that out: the Sun analogue at $G$ = 10⁻¹⁷, $s$ = 1.5152, built with 2% of
   the rock row, comes out 29% fainter, 23% larger and 17% cooler at the surface than the same star built
   primordial, and over its first 3 Gyr its centre burns 15% slower. With 2% of the stars' own ash instead,
   nothing moves by more than 11%.
4. **One limit is real physics, not numerics.** Two stars at $s$ = 1.5152 stop when their core's oitrogen runs out and
   the stirred core collapses faster than a solver in thermal balance can follow.

What is still declared rather than computed is the stars' lives after hydrogen: how their cores grow, and which end
as dead remnants and which explode. That decides what goes back into the gas for the next generation, and it is the
largest open question.

![**The four-dimensional Sun analogues, aged.** For each strength of the nucleon force (horizontal) and each strength
of gravity (a line per $G$, in multiples of ours), the time the star's centre takes to burn half its hydrogen. Each
point is shaded by how much of the star is past helium when its run ends. The dashed rings mark the two runs that stop
in the oitrogen stall; the lower one stops just short of half its hydrogen. The dashed line is the 4.6 Gyr every
analogue was given before the stars were aged.](../figures/ages.svg)

## What is established

Each line says how it stands: **computed** (the book's own calculation, checked where a check exists), **carried**
(taken from our world), **declared** (a stated choice) or **provisional** (computed, waiting on a run).

- **Our Sun first, as the check** (computed; [section 4](ageing.html)). The ageing machinery burns 0.96–1.04
  times Model S's energy on its own conditions, puts our Sun's centre at 15.73 MK against the standard model's
  15.70, and on measured opacity (OPAL) gives 1–3 M☉ stars 0.90–0.94 of the published tracks' luminosity
  (MIST) and 0.99–1.03 of their surface temperature at half their hydrogen. The book's own opacity, built from
  its own atoms, does almost as well.
- **The windows** (computed, rates partly carried; [section 2](windows.html)). Of the grid of strong and weak forces,
  14 points burn hydrogen past helium, in the hottest cores (7.8–18.8 MK).
- **Stars that live** (computed at zero age, the analogue's definition calibrated on ours; [section 3](lifetimes.html)).
  Every gravity from 10⁻¹⁴ to 10⁻²⁰ has long-lived stars; 13 analogues climb past helium, to elements
  6–12.
- **The charge law in the stellar plasma** (computed). The pinned $1/r$ screens nuclear reactions (proton + proton
  ×1.02–1.38) and cuts long-wave light out of the opacity (up to ×1.55 at the strongest gravity), and
  changes the pressure by −3.5 to −0.2 %. Both bites are in the aged stars; they barely move the lives.
- **Stars that age** (computed; [section 4](ageing.html)). 28 of 29 analogues halve their central hydrogen
  in 10.6–177 Gyr. The slowest are at $s$ = 1.5152: 43, 125, 177 Gyr from $G$ = 10⁻¹⁴ to 10⁻²⁰.
- **The oitrogen stall** (computed; section 4). At $G$ = 10^−11^ and 10^−14^, $s$ = 1.5152, the centre stops at hydrogen
  0.37–0.38, pxygen 0.59 and oitrogen 0.03–0.04 by mass. Following those stars further needs the energy a
  contracting core releases, which the solver leaves out.
- **What the first stars hold** (computed; section 4). Elements past helium: 9–30% of the star at $s$ ≤ 1.55,
  2–20% at 1.6–1.65 (coron, element 6, darbon, element 8 and oitrogen), 0.3–4% at 1.7, and at most 0.1% from 1.75 up, where stars burn hydrogen to
  helium and stop.
- **The second generation, a first look** (computed; one analogue, zero age and the first 3 Gyr). The star built
  with the metals in its starting composition (as seed nuclei in the burning network) and in its opacity, each switched
  on alone and then together: 2% of the rock row makes it 29% fainter and 23% larger, its stirred core
  0.11 of the mass against 0.13; almost all of that is opacity.
- **What metals do to the opacity** (computed, without spectral lines). The book's own four-dimensional ions, elements
  4–23, every first ionization equal to the periodic table's: the figures in point 3 above. (A first version of this
  line said metals barely change a four-dimensional star at all; a slip in the code had dropped every ion's bound–free
  absorption, leaving only free–free. Corrected the same day.)
- **What the stars give back** (provisional, and resting on declared endings). A first pass on one mass ladder says the
  returned metals are mostly the rock row (elements 13–23), made when the cores of the heaviest stars reach the
  Chandrasekhar mass and explode, with little of the light ash the stars held. The mass ladders that decide it are
  running.

## What it means

**A four-dimensional universe near our forces is not short of time, and not short of heavy elements.** Its Sun-like
stars outlive ours several times over, and at the strengths nearest ours they turn a large share of themselves into
elements 8–12 on the main sequence, which ours never do. Whether those elements reach the next generation depends on
how the stars end, and the first look says the heavy ones explode and return mostly the rock row: the elements that,
in our world, make planets.

**Whether the second generation looks like the first depends on what comes back.** In our world a star's metals set
its opacity, and so its size, colour and life. In four dimensions the first stars' own light ash barely touches it,
but the rock row thickens the outer layers several times over. If, as the first look at the yields says, the rock row
is most of what returns, the second generation's stars are fainter, larger and cooler than the first, and their
centres burn more slowly. The ash's nuclei also act as catalysts, as carbon, nitrogen and oxygen do in our Sun,
quickening the burning by a few per cent; in a rock-rich star the opacity wins.

**The strongest gravity behaves differently.** At $G$ = 10⁻¹¹ the Sun analogue chosen at zero age burns far faster
once aged than any other, and stalls early: the zero-age choice of analogue is not reliable there.

## What comes next

1. **The mass ladders land** (running on the compute runner; automatic). They give the yields by mass at five more
   strengths, settle what the stars give back, and go into section 4 with their declared choices listed.
2. **Second-generation stars, whole lives** (the compute runner). The first look above covers one analogue's zero age
   and first 3 Gyr; next, its whole life, the other strengths, and the gas mix the yields actually return.
3. **The energy of contraction in the structure** (a change to the solver; every aged run redone on the runner). It
   would follow the stalled stars and the giant phase, and replace the declared endings with computed ones. This is
   the step that most changes what the paper can claim.
4. **Writing it up.** Sections 4 and 5 (abundances over time) from the data above, and the outline brought up to date.

## How it was built

How each link is modelled (the techniques, their checks on our world, the code and what each leaves out) is
[how the stars are modelled](methods.html). The full record of every stage that changed a result, checked one or replaced a convention, with its runs and what it
moved, is [supplement S1](stages.html). The claim map is the [outline](../OUTLINE.md). The aged stars can be looked
inside at [four.mino.mobi/star/](https://four.mino.mobi/star/).
