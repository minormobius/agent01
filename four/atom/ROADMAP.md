# The road to a 4D Earth

The goal: **a worked 4D Earth.** What its ocean, rock and air are made of; how dense the rock is, which sets G and the
planet's size; and so whether an airplane can fly in its sky. Every link is tagged computed, rough or chosen, as the book
tags everything.

It started with the airplane: gravity, a planet, air, lift and propulsion need to know what things are made of, and
that turned out to need the abundance of the elements, which needed nuclei, which needed the strong force. The nuclear
groundwork is now in the nuclei chapter. What the goal needs from it is not a full abundance table but three things:
element 10 against element 9 (which water), the few commonest rock-forming elements, and what is volatile (the air).

One lesson shapes the route. Anything that depends only on **which stage a star reaches** is robust: a capture rate is
so steep in temperature that a millionfold uncertainty in it moves the temperature a stage lights at by about two.
Anything that depends on **rate ratios at one temperature** (what a burning core turns into, element by element) is
uncertain by orders of magnitude. The route leans on the first kind.

## Where we are (done)

- The strong force: a stronger one than ours is needed, inside a window set by the deuteron and the diproton, checked
  with two forces of different shape.
- Helium-4 exact; nuclear matter held by the crowd; mass 8 bound and mass 5 unbound, the latter microscopically with the
  Pauli principle exact, checked on our own helium-5 and lithium-5.
- The first minutes stop at helium where the deuteron binds as ours.
- Stars climb the helium-4 ladder a rung per step in core mass; the rungs to element 10 are computed, and run at or
  below the barrier-only temperature.

## The path

| step | question | why it's on the path | method | status |
|---|---|---|---|---|
| 1. Odd against even | Can element 9, and the other odd elements, be made and survive about as easily as pxygen? | Decides the ocean. Ours make fluorine ~30,000× rarer than oxygen: odd elements sit off the helium ladder, and protons destroy fluorine. | A nucleon on a ladder nucleus, microscopically (Brink, as mass 5), checked on ours; then the routes in and out. | done. The "+1" nuclei bind (element 9 at mass 17 by 11–153 MeV over both draws of the core; plusone-1, plusone-2), and proton-in, helium-4-out reactions are uphill by ≥ 10 MeV, so odd elements survive. Where hydrogen remains, ladder nuclei catch protons, not helium-4s (≥ 10⁵×, protonflow), and climb a rung per four protons through the odd elements, as our nitrogen is made; unlike ours the climb has no closed-shell bottleneck (pxygen-20 holds a nucleon by 70–216 MeV, plusone-2). What stops it is the electric barrier; where, is step 2. |
| 2. The ash | Does a helium-burning core's product pile up just below the first rung it can't light, whatever the uncertain rates do? And how hot are the zones where hydrogen and helium burn together, which step 1 left to decide element 9 against element 10? | If so, what each core mass makes is robust, and step 3 needs no precise rates; the zone temperatures settle the water. | A network of captures (protons, helium-4s, nuclei by charge) at each temperature, every rate a ratio to proton + proton's so density drops out, checked on our Sun's centre (hburn). | first estimate: in 4D helium-4 + helium-4 is electromagnetic and proton + proton weak, so above ~7–10 MK helium burns as fast as hydrogen and every core that hot burns both. A zone then turns wholly into the element where the protons' climb stops: element 8 at 10–12 MK, 9 at ~12–17, pxygen at ~17–22, 12–15 by 40; below ~8 MK hydrogen goes to helium and helium cores take the ladder by core mass. A core with the Sun's pace runs at 15–21 MK: element 9 (47–91%) if proton + proton's nuclear size is 4 fm, pxygen (39–85%) if 1 fm. So element 9 isn't rare; which leads goes to step 3. |
| 3. What stars give back | The rough proportions of the commonest elements in the gas planets form from. | The rock's elements, and element 9 against pxygen. | Declared choices, reported as a band: stars that finish before a Sun-like one forms, down to 10³–10⁴ times shorter-lived; our mass function or a top-heavy one; lifetime ∝ M^−2 to M^−3; a fixed share of each star given back as core ash, its make-up from step 2 (giveback). | first estimate, for the hydrogen-and-helium ash: the gas comes back rich in gluorine (4D's fluorine), oeon (its neon) and pxygen; oitrogen at 0–20%, metals a few percent. Pxygen outnumbers oitrogen in every case (oitrogen 0.06–0.41 of it at 4 fm, almost none at 1 fm), so Xater's element leads on abundance; gluorine's hydride, our HF's counterpart, joins the candidates. With the main sequence (starmix): G decides the mix — at 10⁻¹⁴ todium and nagnesium come back with pxygen, gluorine and oeon; at 10⁻²⁰ mostly two of pxygen, gluorine, oeon; pxygen ahead of oitrogen throughout; and below ~10⁻²² of our gravity nothing comes back for tens of billions of years (even the heaviest star light holds, ~7 M_Ch, takes 3.5 × 10¹⁰ years at 10⁻²³): the stars set a floor on G. Open: tilicon, from the heavy cores' later stages (step 4). |
| 3b. The main sequence, by G | How bright, big, hot and long-lived is a 4D star of each mass, at each strength of gravity? | G is open, and 4D starlight thins as 1/r³: brightness and G together set where a planet can sit and how long its star lasts, and a star's core temperature sets what it makes. | A main-sequence solver for any d (js/mainseq.js): shooting fit, Fermi–Dirac electrons, pinned gravity from the whole profile, electron scattering through the lens vacuum, the book's own rates; ours reproduced first (mainseq-1). | first estimate: L ∝ M⁵ at the bright end, burning per kilogram ∝ G^(2/3) at a fixed share of M_Ch; 4D opacity worked out (lens-vacuum scattering, and free–free with no Gaunt logarithm, run ×0.5–2 as its band), which dims the faint end 16–40× and halves its surface temperature. A star as long-lived as our Sun is blue-hot (27,000–37,000 K) at G 10⁻¹⁴–10⁻²⁰ of ours, none in the window that brief at 10⁻²³ and below; a sunlight-coloured star lives 10¹⁴–10¹⁶ years; years at 288 K from weeks to ~75 years (mainseq-3). Open: surfaces below ~5,000 K, where 4D's iydrogen recombines. |
| 4. Rock | Which rock-forming elements the later stages of stars make (burning after hydrogen and helium are gone, and what massive stars and dead ones throw out), what they make with pxygen and gluorine, and how dense it is. | Density gives G and the planet's size (js/gscale.js). | The ash fusing pairwise, barrier-only checked on our carbon + carbon, with the liquid drop's energies and what the hot product sheds; equilibrium's end at the drop's N = Z peak (heavy). Then the book's Hartree–Fock and crystal search on the abundant elements' compounds. | under way: only cores at the Chandrasekhar mass burn on (the ash fuses at 2.6–9 billion K); the products shed 5–9 nucleons, never a helium-4, and end as elements 13–23, the rock row (todium, bluminium, tilicon, qhosphorus, tulfur, dhlorine). From ~11–16 billion K equilibrium takes over and ends at element 103–137, this world's iron. The ash lights with the electrons far more squeezed than ours at carbon (Fermi/kT 11–115 for cores up to 1.1 M_Ch, 2–5 at 1.5–2; ours 0.5–3) on 6–11 MeV per nucleon, 1.2–40× the core's binding (runaway): cores near M_Ch most likely explode, throwing out the rock row and the iron. An exploding core burns almost wholly (explode: each layer heated by the burning, densities spread 30–100× first as our white dwarfs need, ours checked against Arnett's full-density nickel): to iron (97–100%) up to 1.01 M_Ch, mixed at 1.05, mostly the rock row at 1.1 for oitrogen or pxygen ash (a mix for gluorine or oeon), a few percent unburnt. Which stars get there (cores, from the main sequence's stirred cores, 3–19% of a star, grown ×1.5–2 after; dead stars keep lighter cores, winds return 3–30% of their ash): stars from ~2.8–3.8 M_Ch explode, the first after 18 years at G 10⁻⁸ to 1.8 × 10⁹ at 10⁻²⁰, none within 10 Gyr below ~10⁻²²; the gas gets back this world's iron 10–68% and the rock row 8–68%, the hydrogen-and-helium ash 1–75%: rock isn't short where heavy stars finish. Open: core growth after the main sequence (with none, only stars past the solved 5 M_Ch could explode), and winds. Rock, first estimate: 4D's rock salts computed (tools/salt.mjs, our NaF and MgO within 2–3% in density; doubly charged anions held in a Watson shell): nagnesium pxide 2.3 × 10¹³, todium gluoride 1.8 × 10¹³ kg/m⁴. An Earth-g, Earth-sized planet of that rock needs G = 3.2–4.0 × 10⁻¹⁷ of ours (down to 2 × 10⁻¹⁷ with an iron core), inside the stars' window; there a Sun-long star is 1.1 M_Ch, ~31,000 K, and a 288 K planet sits at 1.1 × 10¹¹ m with a year of ~1.2 of ours. Open: bluminium pxide and tilicon's compounds (structure searches: the ionic model behind them, js/ionic.js, doesn't yet rank our corundum first against θ-alumina and the blind search's best; Hartree–Fock on Al³⁺–O²⁻–Al³⁺ says the electron gas's frozen repulsion is ~30% too weak and the clouds' relaxation, −1.3 to −2.4 eV a bond, is missing, so the model is being rebuilt term by term against that reference before any Bl₂Px₃ structure is reported), this world's iron (elements past 78). |
| 5. Ocean and air | Xater, XH₃, hydrogen gluoride, or a molecule without hydrogen (PxGl₂, Gl₂); at what temperature (see the hot-world hypothesis below); what the air is (oeon, a noble gas, is among the commonest elements given back); how dense. | Closes the planet. | Step 3's proportions and the census's chemistry; the liquid simulations; the volatile molecules (air.mjs: H₂ and the He and H₂ pairs by MP2, ours the check). | under way: 4D hydrogen makes a long, weak molecule (3.0 bohr, 1.1 eV; ours 1.4 bohr, 4.4 by the same method); wells by MP2, He–He 61–71 K and H₂–H₂ 48 K (ours 5.1 and 15.5 by the same method, about half of measured). With 4D's simulated critical-point ratios, helium condenses below ~210–1,200 K and hydrogen below ~140–900 K: both straddle 288 K, and oeon is solid. The air is hydrogen and helium near critical, or a surface wet with liquid hydrogen. Next: Gibbs-ensemble runs on these pulls, a larger basis, vapour pressure at 288 K; then which liquid the ocean is. |
| 6. The airplane | Lift, drag and thrust in 4D air on that planet. | The first question. | 4D aerodynamics. | |

### Step 5's working hypothesis: a hot world

What step 5 has found so far, put together (2026-11-02; each piece first-estimate, the falsifiers below):

- **4D hydrogen is weak.** Bonds to it are 0.46–0.80 of ours (darbon's less than half); bonds without it match ours
  (0.99–1.08). Hydrides are salt-like: Xater behaves like lithium oxide, hydrogens as cations round pxygen.
- **4D matter is sticky.** The missing shell theorem pulls neutral molecules together even at the Hartree–Fock level, and
  4D atoms are very polarizable: Gl₂ molecules hold each other about 25× harder than F₂'s; element 12 condenses far above
  our neon; Xater's liquid is held by >100 kcal/mol a molecule. At 300 K nearly everything is solid.
- **Xater is a liquid from at most 1500 K to near 9000 K** (on its Hartree–Fock-fitted field, rigid molecules): dense,
  ionic-like, as fluid at 1500 K as our water at room temperature; its crowd adds nothing (three-body −10 ± 19 kcal/mol).
  It stops flowing below about 1000 K (caged in 27-ps runs at 500–1000 K, cooled at constant volume). Its crystal
  search has **not** converged: cells of 4 reach −170.6 kcal/mol a molecule and cells of 6 −168.6, each lowest found
  once (an earlier note here said it was converging on −168.8; run 45 showed otherwise). Our water's field on the same
  method condenses at 250 K against 647 measured, so the 9000 K could be low by up to that factor, or not (Xater's
  correlation weakens its pair). Run 50: three-body from 176 liquid triples is −9 ± 12 / −10 ± 19 kcal/mol a
  molecule (a few percent); 12000 crystal starts in cells of 4 found 1084 minima, the lowest once; Hartree–Fock on the
  crystals' closest pairs says the field overbinds them (−59 vs −8 summed over 24), while in the liquid it is unbiased.
  So the liquid stands to the field's rms; the crystal energies don't.
- **It's a hydrogen problem.** Bonds without hydrogen match ours (0.99–1.08); heavy-atom molecules bond to each other
  (Gl₂ crossed −0.85 eV at 4 bohr and falling; PxGl₂ pairs bound down to Gl–Gl 3.7 bohr). Their condensed phases are
  likely networks. The MP2-pair → field → liquid chain's OF₂ check: no liquid in the D basis; with the d split (pairs 1.72× deeper)
  OF₂ condenses but with Tc ≈ 117–124 K against 258 measured (0.45×), as our water on a Hartree–Fock field (0.39×). Fitted
  pair fields underbind liquids; read their liquids as lower bounds. The well's bottom was fine; the basis wasn't: the book's
  Dd equals aug-cc-pVDZ, and all 92 pairs redone in aug-cc-pVTZ (PySCF) bind 1.19× deeper. The refitted field's liquid:
  Tc ≈ 163–178 K (0.63× measured, from 0.45×). The basis limit and CCSD(T) add ~13% more to the pair; the rest is
  three-body, which no pair field carries.
- **Deep burning ends at element 101–136** (NSE, trusted drops; ours, checked, at Ti-44 vs measured Ni-56).
- **4D rock stays solid hotter.** 4D's salts bind 10–40% harder than ours; scaled by our MgO and NaF, nagnesium pxide
  (4D's mantle oxide) melts about 3600–6100 K, ToG (4D's NaF) about 1000–1800 K.
- **So: a planet near 1500–2500 K** with solid pxide rock, a molten-Xater ocean, molten salts, and an air of what is
  still gas there (4D helium, hydrogen partly broken into atoms, perhaps Gl₂ vapour). At G = 10⁻¹⁷ of ours a Sun-long
  star (1.25 M_Ch, 32,800 K) puts a 2000 K planet at 0.058 AU, 63 star-radii out, with a 7.5-day year; at 10⁻²⁰, 1.6 AU
  and 210 days. Close in, so tidally locked (the planets chapter: the star then never moves in the sky).

What would break it: Xater's crystal melting above about 2500 K (the melting bracket is next); Xater coming apart or
sharing protons in its own liquid at those temperatures (rigid molecules can't show it); 4D rock's melting point
computed rather than scaled; and the PxGl₂ and Gl₂ liquids (pair scans running) giving a cooler ocean instead.

Step 1 comes first because it is cheap beside everything after it, it uses tools just built, and on its own it may
decide the ocean. If element 9 turns out easy to make, chemistry decides instead (the census has XH₃ ahead by its bond),
and step 1 still says so. Steps 4 and 5 can start in parallel as soon as step 3 names even a rough top five.

## Off the path, on purpose

Where the most massive stars stop (4D's iron) matters for a planet's core; the stages before it now matter for the rock
(step 4). The first minutes' clock and gravity's law: G comes out of step 4. The spin–orbit force in
mass 5.
