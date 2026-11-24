# Paper 2: where it stands

<!-- The status page for paper 2 (fusion, stars, abundances and gravity in four dimensions): what is established, what
     it means, what comes next. Every number is a token read by build.mjs from the committed data, so the page moves
     when a run lands; write numbers as tokens, never by hand. Rewrite the prose when a result changes its meaning. -->

**In one screen.** Paper 2 asks what kind of stars a four-dimensional universe would have, and what they would make.
The forces that decide it are not given, so the paper narrows them in windows: how strong the nucleon force is (its
strength $s$, with 1.5152 the value nearest ours), how strong the weak force is, and how strong gravity is ($G$, in
multiples of ours). The latest stretch of work aged the stars themselves, shell by shell, instead of judging their
lives from a frozen zero-age core. Five things came out of it.

1. **Sun-like stars live far longer than assumed.** Of the 29 Sun analogues, 28 burn half their central
   hydrogen in 10.6–177 Gyr, 2.3–39 times the 4.6 Gyr the earlier convention gave every one of
   them. Time is not what limits this universe.
2. **Near our strength, the stars make heavy elements while still burning hydrogen.** At $s$ ≤ 1.55, 9–30% of a star
   is past helium by the end of its run, mostly element 8, oitrogen, pxygen and gluorine. Our own main-sequence stars make only helium.
3. **What metals do depends on which metals.** One to two per cent of the first stars' own ash (elements 6–12) moves a
   four-dimensional star's opacity by only −0.4% to +4.2%: absorption by a light ion falls much faster
   with its charge than in our world. The rock row (elements 13–23) is different:
   ×1.03–6.5 at the centre and ×1.97–14 at 0.9 of the mass, where heavy ions keep their inner electrons.
   The first second-generation star bears that out: the Sun analogue at $G$ = 10⁻¹⁷, $s$ = 1.5152, built with 2% of
   the rock row, comes out 29% fainter, 23% larger and 17% cooler at the surface than the same star built
   primordial, and over its first 3 Gyr its centre burns 15% slower. With 2% of the stars' own ash instead,
   nothing moves by more than 11%. But the exploding stars return mostly elements around 116–122 (finding 4),
   far past the ions the book computes (4–23), so what the first stars' metals do to the next generation is open.
4. **What comes back is heavy, and less of it the further the strength is from ours.** Stars heavy enough to grow a
   Chandrasekhar-mass core explode. A 4D core gets hot enough to light its ash only at that mass itself, far denser than
   our exploding white dwarfs, so it burns almost wholly to equilibrium. That is 64–100% of what returns near our
   strength over the choices (the rest is light ash from dead stars' winds, most where winds take 30% of a core) and
   95% from $s$ = 1.6 up at the middle choice. Equilibrium here doesn't end at one nucleus, as
   ours ends at nickel-56. It makes nuclei of mass 253–290, most of them elements 132–139, which decay along their
   mass to the stable line and end mostly as elements 116–122. Near our strength the metals returned come to
   0.049–0.25 of the mass the stars lock away; at $s$ = 1.8, 0.00038–0.0015. Where the band sits is the least certain step: held
   to our own masses and to the book's light 4D nuclei, the liquid drop could put it anywhere from about element 100 to
   250 (supplement S1, stage "The liquid drop, checked"). (Revised 2026-11-24. This finding used to say the exploding
   cores return the rock row and this world's iron in comparable amounts, the iron at one element, 137. Both came from
   the explosion model letting cores stand above the Chandrasekhar mass, which they cannot, and from placing equilibrium
   on the drop's single most bound nucleus.)
5. **The one limit was missing physics, now added.** Two stars at $s$ = 1.5152 stopped when their core's oitrogen ran out
   and the stirred core collapsed faster than a solver in thermal balance could follow. With the energy of contraction in
   the solver, checked first on our Sun, both pass that point and live on (1.5 Gyr and 150 Myr), before stopping
   again where their centres reheat.

What is still declared rather than computed is the stars' lives after hydrogen: how their cores grow, and which end
as dead remnants and which explode. That decides what goes back into the gas for the next generation, and it is the
largest open question.

![**The four-dimensional Sun analogues, aged.** For each strength of the nucleon force (horizontal) and each strength
of gravity (a line per $G$, in multiples of ours), the time the star's centre takes to burn half its hydrogen. Each
point is shaded by how much of the star is past helium when its run ends. The dashed rings mark the two runs that stop
in the oitrogen stall; the lower one stops just short of half its hydrogen. The dashed line is the 4.6 Gyr every
analogue was given before the stars were aged.](../figures/ages.svg)

![**What the first stars give back, at $G$ = 10⁻¹⁷ × ours.** (a) Each aged star of the mass ladders
(vertical: its mass in Chandrasekhar masses) at each strength $s$ of the nucleon force, filled by its share past helium
when its run ends; a dashed outline marks a star whose run was cut short of exhaustion and whose life is carried on at
its last rate. Below the solid line a star outlives 30 Gyr and its mass stays locked away (the dashed grey line: 10
Gyr). Above it a star dies, as a dead remnant returning its envelope, or, once its core grown by $g$ reaches the
Chandrasekhar mass, by exploding and returning everything. The hatched band is where that depends on $g$, from 1 at
its top to 1.5 at its bottom; the dashed orange line is $g$ = 1.25, by which each star's outline is coloured. From
$s$ = 1.75 up the stars burn hydrogen to helium and little further. (b) The net yield $p$, the elements past helium
returned per unit of mass locked away, over every declared choice (shaded) and at the middle choice (α = 2.35, $g$ =
1.25, winds 3%, stars dying within 30 Gyr; the line), with the middle choice's make-up beneath: the exploding cores'
equilibrium (decayed to elements 116–122), the rock row (elements 13–23), and the light ash the stars held.](../figures/fates.svg)

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
  0.37–0.38, pxygen 0.59 and oitrogen 0.03–0.04 by mass, without the energy a contracting core releases.
- **The energy of contraction** (computed; section 4). In the solver behind a switch, so no result above moved. It moves
  our Sun by at most 0.099% and a 2 M☉ star to the end of its hydrogen by at most 0.14%. With it both stalled
  analogues pass the stall: the stirred core switches off and the centre cools and contracts, then reheats, and they
  stop again at 44.77 and 2.707 Gyr where a stirred core begins to re-form.
- **Past the end of the hydrogen** (provisional; one star, paused). The 1.25 M~Ch~ star on the explosion line, carried
  220 Myr past it into a red giant: its hydrogen-free core grows from 0.026 to 0.29 M~Ch~ and the star
  swells ×410, its surface cooling to 2,400 K. Whether the core reaches the 1 M~Ch~ it needs to explode is not
  settled yet, and the last stretch's energy books are off (the shells burn 0.76–0.97 of what the structure
  assumes): the burning shell has outgrown the composition grid's resolution.
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
- **What the stars give back** (computed on declared endings; [section 4](ageing.html)). On mass ladders at six
  strengths, the metals returned per unit of mass locked away (the net yield $p$) are 0.049–0.25 at $s$ ≤ 1.55,
  0.011–0.088 at 1.6–1.65, 0.00062–0.027 at 1.7 and 0.00038–0.0015 at 1.8. How the cores grow decides which masses explode and sets most
  of the band. It is the exploding cores' burnt ash, almost all of it burnt to equilibrium at the Chandrasekhar mass:
  64–100% of $p$ near our strength ($s$ ≤ 1.55) over the choices, 95% from 1.6 up at the middle choice, the
  rock row (elements 13–23) 1%. Equilibrium makes elements 132–139, which decay to 116–122
  (1.5 MeV a nucleon). Only 0–4% is the light ash the stars held (1–29% with strong winds). 1 of the 29 short-lived stars stopped or were cut short of exhaustion (at most
  0.00 of their central hydrogen left) and are carried on at their last rate.

## What it means

**A four-dimensional universe near our forces is not short of time, and not short of heavy elements.** Its Sun-like
stars outlive ours several times over, and at the strengths nearest ours they turn a large share of themselves into
elements 8–12 on the main sequence, which ours never do. Whether those elements reach the next generation depends on
how the stars end. On the declared endings the heavy ones explode and return elements far down the table, around
116–122, a band with no light rock-forming elements in it. Near our strength the metals they give back come to 0.049–0.25 of the mass they lock away; at
$s$ = 1.8, where stars burn hydrogen to helium and little further, 0.00038–0.0015.

**Whether the second generation looks like the first depends on what comes back.** In our world a star's metals set
its opacity, and so its size, colour and life. In four dimensions the first stars' own light ash barely touches it,
and the rock row thickens the outer layers several times over: a star built with it is fainter, larger and cooler,
and burns more slowly. But what the exploding stars actually return is a band of very heavy elements, around
116–122, and their opacity is not computed yet. Heavy ions keep many bound electrons, so it is likely to be large;
how large decides what the second generation looks like.

**The strongest gravity behaves differently.** At $G$ = 10⁻¹¹ the Sun analogue chosen at zero age burns far faster
once aged than any other, and stalls early: the zero-age choice of analogue is not reliable there.

## What comes next

1. **Following cores past the end of the hydrogen** (the compute runner; one star, paused on the composition grid's resolution of the burning shell). The energy of contraction
   is now in the solver. The mass ladders are done: 28 of the 29 stars that die within 30 Gyr reach
   the end of their central hydrogen. What is left declared is how their cores grow afterwards, which sets which stars
   explode and so how much of what they return is the heavy equilibrium band. The first star past it, the one on the
   explosion line, decides whether computing that for every ladder star is worth the runner time. This is the step that
   most changes what the paper can claim. Checking the same energy books across the finished main-sequence tracks found stretches off by several per cent
   where a convective core sits, and single models further off where one grows into fresh hydrogen; what that does to
   the ages is being measured.
2. **Second-generation stars, whole lives** (the compute runner). The first look above covers one analogue's zero age
   and first 3 Gyr; next, its whole life, the other strengths, and the gas mix the yields actually return. That
   mix is mostly elements around 116–122, and the book's ions stop at 23, so their opacity comes first.
3. **Writing it up.** Sections 4 and 5 (abundances over time) from the data above, and the outline brought up to date.

## How it was built

How each link is modelled (the techniques, their checks on our world, the code and what each leaves out) is
[how the stars are modelled](methods.html). The full record of every stage that changed a result, checked one or replaced a convention, with its runs and what it
moved, is [supplement S1](stages.html). The claim map is the [outline](../OUTLINE.md). The aged stars can be looked
inside at [four.mino.mobi/star/](https://four.mino.mobi/star/).
