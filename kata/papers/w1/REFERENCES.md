# W1 — references, and how far each was checked

**Bibliographic** means the citation itself; **content** means the specific claim the paper leans on. Publisher full
texts were mostly closed to us, so "content not read" is common and is said each time. Nothing here was checked
against a physical copy. Before submission every entry marked *not read* needs a page reference from someone holding
the source.

| | Source | Content we use | Status |
|---|---|---|---|
| B1 | H. Brenner (1981), Poiseuille flow through n-dimensional hypercircular and hyperelliptic cylinders, *ZAMP* 32 | the n-dimensional pipe profile | record seen; **paper not read** |
| BGH | D. Barkley, M. G. M. Gomes & R. D. Henderson (2002), Three-dimensional instability in flow over a backward-facing step, *J. Fluid Mech.* 473 | a steady three-dimensional instability of a recirculation region precedes unsteadiness | **not read**; cited as the natural analogy, not as support |
| MEB | M. A. Miller, B. Estejab & S. C. C. Bailey (2014), *Exp. Fluids* 55:1735 | "recommendations to keep l/d > 200 … have remained largely intact", attributed to Ligrani & Bradshaw (1987) | **read** (PDF); the rule itself is second-hand |
| CW | D. C. Collis & M. J. Williams (1959), Two-dimensional convection from heated wires at low Reynolds numbers, *J. Fluid Mech.* 6 | Nu = 0.24 + 0.56 Re^0.45 for 0.02 < Re < 44 (with a temperature-loading factor we set to 1) | **coefficients quoted from memory, not read**; used for the cylinder's sensitivity in section 7 and figures 2 and 3. Must be checked before submission |
| F | B. Fornberg (1988), Steady viscous flow past a sphere at high Reynolds numbers, *J. Fluid Mech.* 190 | C_D 1.085, 0.768 and wake lengths 0.87, 1.44 at Re 100, 200 | values as recorded in the study's notes when the solver was first validated (2026-11-19); **paper not read in this pass** |
| K | L. V. King (1914), *Phil. Trans. R. Soc. A* 214 | the law's form | **not read** |
| M | A. Mhaisekar (2004), MS thesis, University of Cincinnati, Table 2 (p. 80) | sphere Nusselt numbers at Re 50, 100, 200, 250: the thesis's own (5.4, 6.92, 9.17, 9.96) and those it quotes from Balachandar & Ha, *Phys. Fluids* 13 (2001) (5.4, 6.91, 9.12, 9.95) | **read** (open access, 2026-11-24). The Balachandar & Ha values are second-hand; the thesis labels the table Pr 0.7, while a search snippet gives Pr 0.72 for that group's work |
| NA | R. Natarajan & A. Acrivos (1993), *J. Fluid Mech.* 254 | first (regular) bifurcation of the sphere wake at Re ≈ 210 | **abstract read**: critical Reynolds number 105 on the radius. Their Hopf value (277.5) is not in the abstract and the note does not use it |
| SF | R. A. Schuh Frantz et al. (2025), *J. Fluid Mech.* 1018, A30 | collects the sphere's thresholds (212.6 Meliga et al. 2009; 212.4 Citro et al. 2017; their own 213.11; Hopf 280.7 and 271.8) and quotes the cylinder wake's spanwise instability at Re ≈ 189. (The "about four diameters" wavelength of that mode in section 4 is from memory of Barkley & Henderson 1996, not from this source) | **read** (open PDF); the collected values are second-hand |
| ABH | M. Avila, D. Barkley & B. Hof (2023), *Annu. Rev. Fluid Mech.* 55 | pipe flow is linearly stable to at least Re 10⁷; transition from about 2000 when disturbed | **read** (open copy) |
| N, PTS, SNTG, GW, BHC, B2, D | the four-dimensional and n-dimensional fluid papers of section 1 | that they exist and what they treat | abstracts read or indexed; see `PRIOR-ART.md` |

Also used, not cited in the note: Feng & Michaelides (2000) correlation Nu = 0.922 + Pe^(1/3) + 0.1 Re^(1/3) Pe^(1/3),
verified through two secondary sources (Rodriguez & Campo 2023, Table 4; Sundar Raju et al. 2020, Table 6); Whitaker
(1972) and Ranz & Marshall (1952), verified through secondary sources. Details in `kata/wire4/README.md` section 10.

The prior-art pass (what has been published on flows in four dimensions, and the reference values re-checked) is in
`PRIOR-ART.md`.
