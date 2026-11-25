# Paper 2: where it stands

<!-- The status page for paper 2 (fusion, stars, abundances and gravity in four dimensions): what is established, what
     it means, what comes next. Every number is a token read by build.mjs from the committed data, so the page moves
     when a run lands; write numbers as tokens, never by hand. Rewrite the prose when a result changes its meaning. -->

**In one screen.** Paper 2 asks what kind of stars a four-dimensional universe would have, and what they would make.
The forces that decide it are not given, so the paper narrows them in windows: how strong the nucleon force is (its
strength $s$, with 1.5152 the value nearest ours), how strong the weak force is, and how strong gravity is ($G$, in
multiples of ours). The latest stretch of work aged the stars themselves, shell by shell, instead of judging their
lives from a frozen zero-age core. Five things came out of it.

1. **Sun-like stars live far longer than assumed.** Of the {{a4grid}} Sun analogues, {{a4n}} burn half their central
   hydrogen in {{a4min}}–{{a4max}} Gyr, {{a4rlo}}–{{a4rhi}} times the 4.6 Gyr the earlier convention gave every one of
   them. Time is not what limits this universe.
2. **Near our strength, the stars make heavy elements while still burning hydrogen.** At $s$ ≤ 1.55, {{ashA}} of a star
   is past helium by the end of its run, mostly {{ashAel}}. Our own main-sequence stars make only helium.
3. **What metals do depends on which metals.** One to two per cent of the first stars' own ash (elements 6–12) moves a
   four-dimensional star's opacity by only {{m4HeldLo}} to {{m4HeldHi}}: absorption by a light ion falls much faster
   with its charge than in our world. The rock row (elements 13–23) is different:
   {{m4RockCore}} at the centre and {{m4RockOut}} at {{m4OutQ}} of the mass, where heavy ions keep their inner electrons.
   The first second-generation star bears that out: the Sun analogue at $G$ = 10⁻¹⁷, $s$ = 1.5152, built with 2% of
   the rock row, comes out {{g2L}} fainter, {{g2R}} larger and {{g2T}} cooler at the surface than the same star built
   primordial, and over its first {{g2Gyr}} Gyr its centre burns {{g2B}} slower. With 2% of the stars' own ash instead,
   nothing moves by more than {{g2Held}}. But what the exploding stars actually return is the heavy equilibrium band,
   elements around {{nseAfter}} (finding 4), and it does far more. Its ions keep many bound electrons even at the centre:
   1% of it raises the opacity {{m4Band1}} times along the analogues, 2% {{m4Band2}} times. The same analogue built with
   2% of the band comes out {{g2bF2}} times fainter and burns its hydrogen at {{g2bB2}} of the primordial pace; with 10%,
   about what the gas holds after 3 Gyr near our strength ({{gasZ3}}), {{g2bF10}} times fainter at {{g2bB10}} of the pace.
   **Near our strength the second generation is faint, cool and very long-lived.**
4. **What comes back is heavy, and less of it the further the strength is from ours.** Stars heavy enough to grow a
   Chandrasekhar-mass core explode. A 4D core gets hot enough to light its ash only at that mass itself, far denser than
   our exploding white dwarfs, so it burns almost wholly to equilibrium. That is {{yIronA}} of what returns near our
   strength over the choices (the rest is light ash from dead stars' winds, most where winds take 30% of a core) and
   {{yIronB}} from $s$ = 1.6 up at the middle choice. Equilibrium here doesn't end at one nucleus, as
   ours ends at nickel-56. It makes nuclei of mass {{nseA}}, most of them elements {{nseBefore}}, which decay along their
   mass to the stable line and end mostly as elements {{nseAfter}}. Near our strength the metals returned come to
   {{yPA}} of the mass the stars lock away; at $s$ = 1.8, {{yPD}}. Where the band sits is the least certain step: held
   to our own masses and to the book's light 4D nuclei, the liquid drop could put it anywhere from about element 100 to
   250 (supplement S1, stage "The liquid drop, checked"). (Revised 2026-11-24. This finding used to say the exploding
   cores return the rock row and this world's iron in comparable amounts, the iron at one element, 137. Both came from
   the explosion model letting cores stand above the Chandrasekhar mass, which they cannot, and from placing equilibrium
   on the drop's single most bound nucleus.)
5. **The one limit was missing physics, now added.** Two stars at $s$ = 1.5152 stopped when their core's oitrogen ran out
   and the stirred core collapsed faster than a solver in thermal balance could follow. With the energy of contraction in
   the solver, checked first on our Sun, both pass that point and live on ({{egMore14}} and {{egMore11}}), before stopping
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
equilibrium (decayed to elements {{nseAfter}}), the rock row (elements 13–23), and the light ash the stars held.](../figures/fates.svg)

## What is established

Each line says how it stands: **computed** (the book's own calculation, checked where a check exists), **carried**
(taken from our world), **declared** (a stated choice) or **provisional** (computed, waiting on a run).

- **Our Sun first, as the check** (computed; [section 4](ageing.html)). The ageing machinery burns {{epsLo}}–{{epsHi}}
  times Model S's energy on its own conditions, puts our Sun's centre at {{nowTc}} MK against the standard model's
  {{bpTc}}, and on measured opacity (OPAL) gives 1–3 M☉ stars {{mLlo}}–{{mLhi}} of the published tracks' luminosity
  (MIST) and {{mTlo}}–{{mThi}} of their surface temperature at half their hydrogen. The book's own opacity, built from
  its own atoms, does almost as well.
- **The windows** (computed, rates partly carried; [section 2](windows.html)). Of the grid of strong and weak forces,
  {{nPastL}} points burn hydrogen past helium, in the hottest cores ({{TPastL}} MK).
- **Stars that live** (computed at zero age, the analogue's definition calibrated on ours; [section 3](lifetimes.html)).
  Every gravity from 10⁻¹⁴ to 10⁻²⁰ has long-lived stars; {{nBPast}} analogues climb past helium, to elements
  {{ZPastLo}}–{{ZPastHi}}.
- **The charge law in the stellar plasma** (computed). The pinned $1/r$ screens nuclear reactions (proton + proton
  ×{{lpPPlo}}–{{lpPPhi}}) and cuts long-wave light out of the opacity (up to ×{{lpOpHi}} at the strongest gravity), and
  changes the pressure by {{lpDPlo}} to {{lpDPhi}} %. Both bites are in the aged stars; they barely move the lives.
- **Stars that age** (computed; [section 4](ageing.html)). {{a4n}} of {{a4grid}} analogues halve their central hydrogen
  in {{a4min}}–{{a4max}} Gyr. The slowest are at $s$ = 1.5152: {{a4s15}} Gyr from $G$ = 10⁻¹⁴ to 10⁻²⁰.
- **The oitrogen stall** (computed; section 4). At $G$ = {{a4stGs}}, $s$ = 1.5152, the centre stops at hydrogen
  {{a4cH}}, pxygen {{a4cPx}} and oitrogen {{a4cOx}} by mass, without the energy a contracting core releases.
- **The energy of contraction** (computed; section 4). In the solver behind a switch, so no result above moved. It moves
  our Sun by at most {{egSun}}% and a 2 M☉ star to the end of its hydrogen by at most {{egM2}}%. With it both stalled
  analogues pass the stall: the stirred core switches off and the centre cools and contracts, then reheats, and they
  stop again at {{egStop14}} and {{egStop11}} Gyr where a stirred core begins to re-form.
- **Past the end of the hydrogen** (provisional; one star, paused). The 1.25 M~Ch~ star on the explosion line, carried
  {{egPmyr}} Myr past it into a red giant: its hydrogen-free core grows from {{egPH0}} to {{egPH1}} M~Ch~ and the star
  swells ×{{egPR}}, its surface cooling to {{egPT1}} K. Whether the core reaches the 1 M~Ch~ it needs to explode is not
  settled yet, and the last stretch's energy books are off (the shells burn {{egPbk0}}–{{egPbk1}} of what the structure
  assumes): the burning shell has outgrown the composition grid's resolution.
- **What the first stars hold** (computed; section 4). Elements past helium: {{ashA}} of the star at $s$ ≤ 1.55,
  {{ashB}} at 1.6–1.65 ({{ashBel}}), {{ashC}} at 1.7, and at most {{ashDmax}} from 1.75 up, where stars burn hydrogen to
  helium and stop.
- **The second generation, a first look** (computed; one analogue, zero age and the first {{g2Gyr}} Gyr). The star built
  with the metals in its starting composition (as seed nuclei in the burning network) and in its opacity, each switched
  on alone and then together: 2% of the rock row makes it {{g2L}} fainter and {{g2R}} larger, its stirred core
  {{g2Q}} of the mass against {{g2Q0}}; almost all of that is opacity. Built with the heavy equilibrium band that
  actually returns, it comes out {{g2bF2}} times fainter at 2% and {{g2bF10}} at 10%, its hydrogen burning at
  {{g2bB2}} and {{g2bB10}} of the primordial pace (each a range over two ways of carrying the band's mass: in the
  opacity alone, or also in the composition as an inert stand-in).
- **What metals do to the opacity** (computed, without spectral lines). The book's own four-dimensional ions, elements
  4–23, every first ionization equal to the periodic table's, and every ion of elements 113–125, the heavy band: the
  figures in point 3 above. Those heavy ions are computed without relativity; shifting every level by the Dirac
  equation's correction moves the band's effect by a few per cent at most. (A first version of this
  line said metals barely change a four-dimensional star at all; a slip in the code had dropped every ion's bound–free
  absorption, leaving only free–free. Corrected the same day.)
- **What the stars give back** (computed on declared endings; [section 4](ageing.html)). On mass ladders at {{yNs}}
  strengths, the metals returned per unit of mass locked away (the net yield $p$) are {{yPA}} at $s$ ≤ 1.55,
  {{yPB}} at 1.6–1.65, {{yPC}} at 1.7 and {{yPD}} at 1.8. How the cores grow decides which masses explode and sets most
  of the band. It is the exploding cores' burnt ash, almost all of it burnt to equilibrium at the Chandrasekhar mass:
  {{yIronA}} of $p$ near our strength ($s$ ≤ 1.55) over the choices, {{yIronB}} from 1.6 up at the middle choice, the
  rock row (elements 13–23) {{yRockMid}}. Equilibrium makes elements {{nseBefore}}, which decay to {{nseAfter}}
  ({{nseMeV}} MeV a nucleon). Only {{yLight}} is the light ash the stars held ({{yLight30}} with strong winds). {{yCarried}} of the {{yShort}} short-lived stars stopped or were cut short of exhaustion (at most
  {{yXcMax}} of their central hydrogen left) and are carried on at their last rate.

## What it means

**A four-dimensional universe near our forces is not short of time, and not short of heavy elements.** Its Sun-like
stars outlive ours several times over, and at the strengths nearest ours they turn a large share of themselves into
elements 8–12 on the main sequence, which ours never do. Whether those elements reach the next generation depends on
how the stars end. On the declared endings the heavy ones explode and return elements far down the table, around
{{nseAfter}}, a band with no light rock-forming elements in it. Near our strength the metals they give back come to {{yPA}} of the mass they lock away; at
$s$ = 1.8, where stars burn hydrogen to helium and little further, {{yPD}}.

**Whether the second generation looks like the first depends on what comes back.** In our world a star's metals set
its opacity, and so its size, colour and life. In four dimensions the first stars' own light ash barely touches it,
and the rock row thickens the outer layers several times over. What the exploding stars actually return, a band of
very heavy elements around {{nseAfter}}, does more still, because its ions keep many bound electrons even at the
centre. A second-generation Sun analogue near our strength, born from gas a few per cent to a tenth of which is that
band, is several to more than ten times fainter than the first, much cooler at the surface, and burns its hydrogen
several to ten times more slowly. The second generation is not a copy of the first: near our strength it is a
generation of faint, long-lived stars.

**The strongest gravity behaves differently.** At $G$ = 10⁻¹¹ the Sun analogue chosen at zero age burns far faster
once aged than any other, and stalls early: the zero-age choice of analogue is not reliable there.

## What comes next

1. **Following cores past the end of the hydrogen** (the compute runner; one star, paused on the composition grid's resolution of the burning shell). The energy of contraction
   is now in the solver. The mass ladders are done: {{yReached}} of the {{yShort}} stars that die within 30 Gyr reach
   the end of their central hydrogen. What is left declared is how their cores grow afterwards, which sets which stars
   explode and so how much of what they return is the heavy equilibrium band. The first star past it, the one on the
   explosion line, decides whether computing that for every ladder star is worth the runner time. This is the step that
   most changes what the paper can claim. Checking the same energy books across the finished main-sequence tracks found stretches off by several per cent
   where a convective core sits, and single models further off where one grows into fresh hydrogen; what that does to
   the ages is being measured.
2. **Second-generation stars, whole lives** (the compute runner). The first look above covers one analogue's zero age
   and first {{g2Gyr}} Gyr, the heavy band included; next, its whole life, the other strengths, the gas's actual
   metal share over time, and the band's spectral lines, which the opacity above leaves out.
3. **Writing it up.** Sections 4 and 5 (abundances over time) from the data above, and the outline brought up to date.

## How it was built

How each link is modelled (the techniques, their checks on our world, the code and what each leaves out) is
[how the stars are modelled](methods.html). The full record of every stage that changed a result, checked one or replaced a convention, with its runs and what it
moved, is [supplement S1](stages.html). The claim map is the [outline](../OUTLINE.md). The aged stars can be looked
inside at [four.mino.mobi/star/](https://four.mino.mobi/star/).
