# Paper 2 — outline, claim map and gaps

**Status: framed 2026-11-13 (PI: "the fusion, stars, abundance, gravity paper … the right spot to collect and draft
these results").** Nothing is prose yet. This file is where the nuclear and stellar results are collected as they land,
each with what holds it up and what it still needs, so the draft can be written against a fixed claim map. It
follows paper 1's method (`papers/p1/OUTLINE.md`): every number from a baked file or a tool's output, checked against
it; ours as the check for every method; choices stated as choices, with their cost. The work behind it is the
roadmap's physics spine (`atom/ROADMAP.md`: A1 weak, A2 strong, B stability, C lifetimes, D composition).

Tags, as the book uses them: **computed** (from the book's own solvers), **carried** (our world's number put through 4D's
physics), **convention** (a scale fixed by hand to compare worlds), **chosen** (a stated choice), **open**.

## Title · *to choose*

- *Choosing the nuclear and gravitational laws for four dimensions: how its stars burn and what they make* (the
  choices first, as paper 1's title is).
- *Stars and the elements in four spatial dimensions* (the results first).

## Authors · *to settle (PI)*

Paper 1's byline (Claude · Astra · minor mobius, last) unless the PI decides otherwise.

## The argument in one paragraph (the abstract, written last; provisional)

Paper 1 chose a charge law and built the periodic table. Atoms don't say which elements exist in what amounts: that
takes nuclei, stars and time, and in four dimensions three more laws have to be chosen first. **The strong force** can't
be ours (4D's s-wave barrier unbinds our deuteron); a window of strengths binds the deuteron and not the diproton, and
inside it light nuclei are solved from the force itself. **The weak force** can't simply be ours either: its coupling
has different units, and the natural gauge choice leaves a universe of helium. Hydrogen survives the first minutes only
if it is about as strong as ours at the electron's energies. **Gravity** is pinned at 1/r like the charge law, and its
strength is open, set by the planets' rock. With these, 4D's first minutes leave hydrogen and helium; two helium-4s hold
together, so helium burning needs no Hoyle state; no CNO-like cycle exists, and a Sun-paced core at the strength where
the deuteron binds as ours climbs past helium to gluorine-22; light nuclei hold N = Z far harder than ours, so no neutron
source and no slow neutron capture. *(To come: how long stars live, which elements a galaxy holds and when, and whether
any of it collapses.)*

## The spine: windows that narrow (PI, 2026-11-13: "attacking the problem with narrower and narrower windows of feasibility … narratively powerful")

The paper is told as a sequence of windows, each constraint drawn on the same plane and each cutting what's left. The
plane is the two nuclear choices: the strong force's strength s and the weak force's G₄ (log₁₀ over G_F/M_W), with
gravity's clock as the third axis, scanned. Figure 1 (`figures/windows.mjs` → `windows.svg`, from
`data/windows.json`, `fusion/tools/windows4.mjs`, ~10 min). Over s 1.40–1.891 (the deuteron bound) and G₄ 10³–10⁷:

| constraint | from | what's left of the plane |
|---|---|---|
| the deuteron binds, the diproton doesn't | the strong force (Part I.2) | all of it, by construction |
| p + p makes a deuteron (B_d > 1.804 MeV) | the strong force with the weak's kinematics | 78% |
| the first minutes leave half their hydrogen | the weak force against gravity's clock (I.3) | 32% (clock 0.01 s) to 69% (100 s); the edge is flat in s, G₄ > 10^(5.4 → 3.4) |
| a star's hydrogen burning, Sun-paced | the network (III.10) | sorted, not cut: of the network's points that survive the first minutes at a 1 s clock, about 21% climb past helium, 25% make helium, 54% strand as helium-3 |
| stars live billions of years | C (main sequence on the network's own burning; section 3, figure 2) | a Sun analogue at G 10⁻¹¹–10⁻²⁰ × ours at almost every s; none in the masses computed at 10⁻²³ |
| matter, nuclei, cores don't collapse | B | to come |

**What the plane shows so far:** the two nuclear strengths act through one number, the temperature a Sun-paced core
needs (set by p + p, the product of both): above about 10 MK hydrogen burning climbs past helium, from about 4 to 9 MK it
makes helium, below about 3.5 MK it strands as helium-3. The first-minutes edge barely depends on s, so the weak force is
narrowed by the first minutes and the strong force by the stars. *Caveats:* helium-3's stranding rests on ³He + ³He,
a carried rate; where the climb ends rests on A2's masses.

## Part I — The laws (the choices and their windows)

1. **Introduction.** Paper 1's question one level down: atoms need nuclei, nuclei need forces, and the forces' 4D
   forms are choices. What is new: the windows (strong, weak), the light nuclei and their reactions from the force, the
   burning network, and what it predicts. *To do:* prior art (anthropic-window literature: Barrow & Tipler; Tegmark 1997
   on dimensions; Adams's "constants" surveys; Jaffe, Jenkins & Kimchi 2009 on varied quark masses), forward search.
2. **The strong force: a window.** Two forces of different shape (Malfliet–Tjon, Minnesota) with their attraction
   scaled by s; in 4D the deuteron binds from s = 1.400 (MN) and the diproton (and dineutron) at 1.891; s = 1.5152 binds
   the deuteron as ours. **computed** (`js/nuclear.js` `window`; selftest 51). Nuclear matter by Brueckner–Hartree–Fock
   with a three-nucleon repulsion **carried** (its strength fitted to our −16 MeV). *To do (A2):* the long-range tail
   from pion exchange in 4D, a tensor force, saturation without our repulsion, s justified or replaced.
3. **The weak force: a window.** Fermi's theory in d dimensions (`js/weak.js`, selftest 75): G_d in mass^−(d−1),
   d-dimensional phase space; the early universe's neutron–proton rates against the expansion. Ours as the check
   (neutron 945 s without the Fermi function, freeze-out 0.800 MeV, Y = 0.241 against 0.245). **computed:** hydrogen keeps
   half only for G₄ > 10^(3.4–5.4) × G_F/M_W (the clock's range), i.e. G₄m_e³ ~ G_F m_e²: as strong as ours at the
   electron's energies, a weak scale near 1–30 MeV. The prior choice ("ours": K, 0.8 MeV, 879 s) sits inside it; at
   equal strength at the electron 4D decays run ~13× slower (geometric factors). `atom/tools/weak.mjs` →
   `weak-window.json`. **In the network (A1 done):** p + p ×0.023 (s = 1.5152) to ×9.1 (1.85) ours at the
   electron-matched G₄, β decays ~13× slower; the weak and strong strengths trade through p + p (section 10). *To do:*
   the window's upper edge (C).
4. **Gravity: pinned, its strength open.** The same choice as the charge law (1/r, so a star has a ground state);
   stars under three laws (`js/stars.js`); the Chandrasekhar mass closes in pinned 4D (N_Ch = 1.52 α_G^(−4/3),
   `js/gscale.js`); G set by an Earth-like planet's rock density (≈ 3 × 10⁻¹⁷ G). **computed / chosen.** The early
   universe's clock t₁ is gravity's and is scanned (0.01–100 s). *Holds it up:* the gravity and stars chapters, selftest
   50s. *To do:* state which parts are pinned by choice and which follow.

## Part II — Nuclei

5. **Light nuclei from the force.** Helium-4 and mass 3 by diffusion Monte Carlo (exact for A ≤ 4); the helium-4
   ladder to 8 (Monte Carlo on the folded pair potential); Brink's microscopic clusters; mass 5 unbound and mass 8
   bound (ceryllium-8: **the gap our beryllium-8 leaves is closed**); the 5-helium-4 4-simplex as 4D's closed shell
   (pxygen-20, its oxygen-16). **computed** (nuclei chapter; selftests 51–52). One nucleon on k helium-4s (`plusone`)
   and two or three (`plusmore`, run `plusmore-1`): **computed**, ours as the check (np pair 2.5–4 MeV too strong, nn
   pair 0.3–3.2 against 3.2–5.2).
6. **N = Z, held hard.** The extra binding of a neutron pair 6–33 MeV and of a neutron–proton pair 25–60 (ours ~5
   each); two-neutron isotopes bound but β⁻ in milliseconds (endpoints 7–34 MeV); the liquid drop's valley near N = Z
   to mass ~100 (Coulomb weak against 4D's binding). **computed.** *Consequence:* no neutron-rich isotope survives
   hydrogen or helium burning; no ²²Ne-like neutron source. *Caveat to state:* Brink's grid and the ladder disagree ×2
   on a helium-4 onto ceryllium-8 (A2; now carried as the mass-model band, section 7).
7. **The nuclide table, and its mass model.** `fusion/tools/nuc4.mjs`: every light nucleus by protons and neutrons, each
   with where its binding came from. **computed**, with the interpolations named. Two microscopic methods, tested on ours
   against measured masses (run `masses-1`): the ladder underbinds α clusters (¹⁶O −4.9 MeV against four helium-4s, real
   −14.4), Brink's grid overbinds them and worse with size (²⁴Mg −93 against −28.5). One consistent model is adopted (the
   ladder's nuclei with the grid's separations scaled by the two methods' helium-4 separation on the same core: ours to
   a median 30%, within ~15% from ¹⁶O up), the pure grid kept as the band's other edge. **Every downstream claim is
   stated under both.** Figure: the 4D chart of nuclides; a panel of ours' check (ladder / grid / real against k).

## Part III — Burning

8. **The first minutes.** `js/bbn.js` with A1's rates: hydrogen and helium, nothing past it where the deuteron binds as
   ours (mass 5 unbound); past helium at the window's top. **computed** (the prior, with ours' weak force: Y 0.06–0.33;
   with 4D's at the electron-matched strength 0.12–0.60). *To do:* rebake the chapter's table with weak.js.
9. **Proton + proton.** The deuteron and the protons' scattering state from the same force (`ppOverlap`, selftest 74);
   the old guessed nuclear size retired. **computed** nuclear part; the weak part **carried** until A1 lands on it.
10. **Hydrogen burning.** The 4D network (`fusion/data4.js`, `js/net4.js`): pp chains as ours, and **no CNO-like
    cycle**. The candidate was the star's own: helium makes ceryllium-8, protons climb to 5-11, and 5-11 + p → ⁴He +
    ceryllium-8 would hand the catalyst back. The two mass models split on it (ladder open at s ≤ 1.6, Q +4.6 to +10.9;
    grid closed, −21 to −60), and ours at the matching core (¹¹B + p → 3α, 8.59) couldn't decide. **A third method
    decided it:** the free-cluster bound (`brink.js` `freeClusterGCM`, `fusion/qbound4.json`), variational, so an upper
    bound on Q at every K: ≤ −15.7 … −69.5 MeV over the eight strengths at K = 480, −18.7 at K = 960 for s = 1.5152; ours
    ≤ 12.25 against 8.59. **Outcome (after the bound, both mass models identical at all 56 points of figure 1):** past
    helium at 7.8–18.8 MK (s 1.5152–1.65), helium at 4–10 MK, helium-3 stranded below ~3.6 MK, sorted by the core's
    temperature; our world's point (s 1.5152, G₄ = G_F/m_e) climbs past helium to element 11 at 18.5 MK. **computed
    nuclei, rates computed where the book has them (p + p, ⁴He + ⁴He, p and ⁴He onto 2–4 ⁴He) and carried elsewhere;
    the stage temperature a convention** (the Sun's pace) for figure 1, retired by C (section 12).
11. **Helium and beyond.** Two helium-4s → ceryllium-8 directly, no three-body bottleneck; ceryllium + itself at 0.27
    GK, a flash not a runaway; element 6 (mass 12) as the ash; the heavy stages to the rock row and equilibrium's end
    (elements 101–137 by the liquid drop). **computed / carried** (nuclei.mjs heburn, cerburn, heavy, runaway,
    explode). *To do:* heavy stages in the network; the nucleon channel.

## Part IV — Stars

12. **The main sequence, burning by the network (window C, 2026-11-13).** `js/mainseq.js` with the 4D network's own
    energy law (`fusion/tools/eps4.mjs` → `fusion/eps4.json`: the network joined to the star solver through p + p itself,
    ρ_ref(T) = m_u k_pp,net / ⟨σv⟩_abs; at each T, ρ a fresh primordial core burnt to half its hydrogen, its t½ and mean
    ε), `mainseq.mjs net`, run `lifetimes-1` (55 sequences, all exit 0; s = 1.65–1.7 rerun after a first-star fix) at G
    10⁻¹¹–10⁻²³ × ours, 0.13–5 M_Ch, the grid mass model too at s ≤ 1.6; `fusion/tools/lifetimes4.mjs` →
    `data/lifetimes.json`. **Ours as the calibration:** the book's own zero-age Sun's centre (13.5 MK, 74 g/cm³) burnt
    by REACLIB at fixed T, ρ halves in 11.1 Gyr, where the real centre took ~4.6, so a 4D star's "Sun analogue" is the
    one whose zero-age core t½ is 11.1 Gyr, if 4D cores evolve as ours (declared). **Results:** (a) long-lived stars are
    generic: every sequence from G = 10⁻¹⁴ to 10⁻²⁰ has stars whose cores take 10³–10⁵ Gyr, and a Sun analogue inside
    0.2–5 M_Ch; at 10⁻²³ every star computed takes longer than ours (the analogue lies above 5 M_Ch); at 10⁻¹¹ the solver
    stops above 0.3–0.5 M_Ch at several strengths. (b) **Real cores are hotter than the Sun-pace convention** (their
    densities, 10¹³–10¹⁷ kg/m⁴, lie below the network's reference density, ~10¹⁷–10¹⁸), so what hydrogen burning makes
    shifts: at s = 1.65 the analogue climbs past helium (element 6–8, 9.5–13 MK at G 10⁻¹⁷–10⁻²⁰), and **helium-3
    stranding gives way to helium as gravity weakens** (s = 1.8–1.85: helium-3 at G ≥ 10⁻¹⁷, helium at 10⁻²⁰). Gravity
    is now an axis of the hydrogen-burning window, not only of the clock. (c) With the cycle closed (section 10) the
    mass models agree at every point: at s ≤ 1.6 the analogue climbs past helium to elements 7–13 at 10–25 MK (helium
    only at G 10⁻¹¹, s 1.6). **computed, on the network's burning;
    the analogue's definition calibrated on ours; no stellar evolution.** Figure 2. (d) **Convective cores without CNO:** the
    climb's captures are as steep as our CNO cycle (ν 15–19 above 18 MK at s = 1.5152, ours' CNO 15–16 and pp 4.6 computed
    the same way), so heavy low-s stars have convective cores (0.19 of 5 M_Ch at G 10⁻¹⁷; s = 1.85, which never climbs,
    0.09). **computed, zero-age, ε̄ a mean over half the hydrogen.**
13. **Which stars do what.** How far each core mass burns (`js/burning.js`, ours to 40% in mass), stirred cores, which
    explode and when (`nuclei.mjs cores`, `explode`). **computed / rough.** *To do (C):* post-main-sequence growth.

## Part V — Abundances over time

14. **What stars give back.** `nuclei.mjs giveback`, `starmix`: declared mass function and lifetimes, reported as a
    band. **rough.** *To do (D):* yields per stellar mass from the network; a one-zone galaxy (star formation, a mass
    function, C's lifetimes) → composition against age, as a band.
15. **The heavy elements.** No neutron source (section 6), so no slow capture; what explosions make. **open.**
16. **What planets are made of.** The hand-off to the Earth roadmap (rock, ocean, air). **open.**

## Part VI — Does it hold together (B)

17. Bulk matter (stability of the second kind under the pinned law: argued in paper 1, to be tested in growing 4D
    crystals); nuclear matter saturating with A2's force; white-dwarf and collapse limits; the universe's expansion
    under pinned gravity (**chosen**, stated). **open.**

## Retracted on the way (kept, so the record is honest)

- **A ceryllium cycle (2026-11-12, morning):** a CNO-like cycle on ceryllium-8, from an interpolated triton-like
  cluster; withdrawn the same day when the cluster was computed (section 10). **The withdrawal was itself premature
  (2026-11-13):** it rested on Brink's grid alone, which ours shows overbinds clusters; under the adopted mass model the
  cycle reopened at low s. **Closed for good the same day** by the free-cluster bound (section 10): a variational upper
  bound, negative by ≥ 15.7 MeV at every strength. The claim now rests on a bound, not on a choice of mass model.
- **"6 helium-4s unbound past pxygen-20" (2026-11-13):** an artefact of mixing the grid's clusters with the ladder's
  cores; bound in either consistent model.
- **The weak force "as ours" (prior to 2026-11-13):** kept as a choice inside the window, but its numbers move: the
  neutron 879 → ~15 000 s, freeze-out computed, the helium left higher (section 8).

## Figures (plan)

1. **Drawn, and written up** (`text/windows.md` → `draft/windows.html`, section 2: results, caption, methods 2.2.1–2.2.8): the strong–weak plane (`figures/windows.svg`): p + p's edge, the first minutes' edge per clock, hydrogen burning's outcome at the network's points with each core's temperature, under both mass models (identical at all 56 points since the bound closed the ceryllium cycle), and our world's forces carried as a star. Gravity's G (rock) to add as the third window.
2. The 4D chart of nuclides by binding source, with the N = Z valley and the two-neutron isotopes' β⁻.
3. The first minutes: helium left against G₄ and the clock.
4. Hydrogen burning's ash against s (the network sweep).
5. **Drawn as figure 2, and written up** (`text/lifetimes.md` → `draft/lifetimes.html`, section 3: results, caption, methods 3.2.1–3.2.8) (`figures/lifetimes.svg`): core half-life against mass per strength at G = 10⁻¹⁷, and our Sun's analogue across G × s coloured by what its own centre burns to, under both mass models (identical since the bound) (C).
6. Composition against age (D).

## Companion objects

- The fusion widget's 4D mode and the chart of 4D nuclei (four.mino.mobi/fusion/, `fusion/js/world.js`), and the
  strong-force dial (`/strong/`).
- The network as data (`fusion/data4.js`, `fusion/stages4.js`), the weak window (`weak-window.json`, to be baked into a
  file the paper reads).
- The solvers in the tangled mirror (`weak.js`, `nuclear.js`, `brink.js`, `bbn.js`, `burning.js`, `mainseq.js`).

## Before prose (the checklist)

- [ ] A1 finished: 4D's weak factor on p + p and every network decay; the window's table in the nuclei chapter.
- [ ] A2 at least bracketed: tensor force or its effect estimated; the Brink/ladder spread reported on every claim it
      touches. *Done for the masses (masses-1: one model adopted, the other the band's edge, both tested on ours); the
      network and figure 1 carry both; 5-11, the one mass they split on, decided by the free-cluster bound. Open: the tensor force.*
- [ ] C: lifetimes computed (the Sun-pace convention retired or stated as the comparison it is). *First cut done (lifetimes-1): zero-age cores; stellar evolution and the post-main-sequence still to come.*
- [ ] D: one composition-against-age band.
- [ ] B: each stability claim tagged proved, argued or open.
- [ ] A build like paper 1's (`build.mjs`: tokens from the bake, a claim ledger with gates) once the claims settle.
