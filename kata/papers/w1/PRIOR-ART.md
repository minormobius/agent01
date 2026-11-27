# W1 — prior art: what a search found, 2026-11-27

One pass by a search agent over the open web, the arXiv API, Semantic Scholar, OpenAlex, Crossref and zbMATH. Not
searched: Google Scholar, Scopus, Web of Science, non-English literature, anything before 1980, textbooks. **"Nothing
found" below means nothing in those places, and is not proof of absence**, least of all for textbook exercises or
recreational pieces. *Read* = the page, abstract or PDF was read; *indexed* = metadata or abstract through an index
only; *snippet* = seen only in a search summary.

## 0. What this search missed (found by the audit, 2026-11-27)

**Finite-Reynolds-number flow past a body in four dimensions has been simulated.** T. Kawamura, "Numerical simulation
of the flow around a four-dimensional sphere in a four-dimensional duct", Natural Science Report, Ochanomizu
University 72(1–2), 27–35 (2022), https://teapot.lib.ocha.ac.jp/records/2000439 (Re 100 and 3000; primary text read
by the auditor), and T. Kawamura, "Numerical simulation of the flow around 4-dimensional hypercube", Bulletin of
Shiga Bunkyo Junior College 26, 59–74 (2024), doi:10.32125/0002000017 (Re 40, 200, 2000; abstract and selected
methods read by the auditor). Both are in university bulletins, which the search below did not reach. Neither treats
a body endless in one direction, its wake's instability along that direction, or anemometry. The audit also names a
lead to a four-dimensional cavity flow (Komurasaki 2021), not yet followed up here. **So section 2's "no 4D flow past
a body was found" below is superseded**, and the same kind of miss may apply elsewhere in this file.

## 1. Pipe flow in n dimensions

**Found prior work for the flow; nothing for friction factor or heat transfer.**

- H. Brenner, "Poiseuille flow through n-dimensional hypercircular and hyperelliptic cylinders", ZAMP 32, 347–356
  (1981), doi:10.1007/BF00946650. *Indexed* (title, keywords). Not read: whether it has our profile or a friction
  factor is unverified. Three or four citations, none on heat transfer.
- V. E. Tarasov, "Flow of fractal fluid in pipes", Chaos Solitons Fractals 67 (2014), arXiv:1503.02842. *Read.* A
  different generalisation (non-integer mass dimension), adjacent only.
- A Graetz–Nusselt problem in n dimensions: nothing found.

## 2. A body in a 4D stream; stability along an added direction

**Adjacent work only, as the search stood (see section 0).** The search found no 4D flow past a body, wake, vortex
shedding, pipe or Taylor–Couette flow, and no stability analysis of the sphere's axisymmetric base flow with an added homogeneous wavenumber.

| Work | Status | What it is |
|---|---|---|
| Suzuki, Nakano, Takahashi & Gotoh, Phys. Fluids 17, 081702 (2005) | indexed | decaying 4D turbulence |
| Gotoh, Watanabe, Shiga, Nakano & Suzuki, Phys. Rev. E 75, 016310 (2007) | indexed | decaying 4D turbulence |
| Berera, Ho & Clark, Phys. Fluids 32 (2020), arXiv:2007.10953 | read | forced 4D homogeneous turbulence |
| Clark, Ho & Berera, J. Fluid Mech. 912, A40 (2021); Clark, Armua, Ho & Berera, J. Fluid Mech. 930, A17 (2022); Ho et al., arXiv:2512.00449 (2025) | abstracts read | turbulence in d dimensions |
| **N. Nikitin, "Four-dimensional turbulence in a plane channel", J. Fluid Mech. 680, 67–79 (2011)** | abstract read | the closest structural precedent: a formal fourth, homogeneous coordinate added to a 3D turbulent channel; small 4D disturbances grow; self-sustained 4D turbulence has about 55% of the 3D friction |
| **Pandey, Tiwari & Sreenivasan, "Thermal convection in one, two, three and four dimensions", J. Fluid Mech. 1042, R3 (2026)** | read | 4D Rayleigh–Bénard convection in a periodic box |
| Shashikanth, "Vortex dynamics in R⁴", arXiv:1110.2717 | snippet | inviscid vortex membranes |

**The nearest analogue in our world, and a coincidence.** A cylinder's wake becomes unstable along its span at
Re = 188.5 ± 1.0, wavelength 3.96 ± 0.02 D (Barkley & Henderson 1996; the authors' repository abstract, read by
the auditor). Our threshold is 191. Different
problems (a periodic 2D base flow there, a steady axisymmetric one here), but a reader will notice; the paper says
so in section 4 and the audit sheet asks for it to be ruled out.

"Codimension" appears in the bluff-body literature only in the bifurcation-theory sense.

## 3. Heat transfer and anemometry by dimension; Stokes drag and the paradox

**Prior work for hypersphere Stokes drag and its low-Reynolds expansion; nothing found for King's law or hot-wire
theory in d dimensions, for heat transfer from a hypersphere or hypercylinder, or for any statement that the body
of codimension 2 is the natural anemometer.**

- H. Brenner, J. Fluid Mech. 111, 197–215 (1981): n-dimensional Stokes fields, force and torque on a hypersphere.
  *Abstract read.*
- A. M. J. Davis, ZAMP 34, 935–942 (1983): the small-Reynolds expansion of the n-dimensional drag. *Indexed.*
- Charbonneau et al., J. Chem. Phys. 139, 164502 (2013), arXiv:1210.6073: explicit d-dimensional stick drag, "we
  assume m ≥ 3 to avoid the Stokes paradox in m = 2". *Read.*
- T. Yoshino, FORMA 34 (2019): Stokes flow round a hypersphere, visualised. *Abstract read.*
- The Stokes paradox is stated in the sources only as a two-dimensional fact. That it belongs to bodies of
  codimension 2 in any dimension is this paper's restatement (elementary) and is presented as such.

## 4. Reference values re-checked

| Value | What a readable source says | Read where |
|---|---|---|
| sphere, first instability | regular bifurcation at Re 105 on the radius, 210 on the diameter | Natarajan & Acrivos 1993, abstract |
| | 212.6 (Meliga et al. 2009), 212.4 (Citro et al. 2017), 213.11 | Schuh Frantz et al. 2025, open PDF |
| | steady non-axisymmetric from 210, unsteady above 270 | Johnson & Patel 1999, abstract |
| sphere, Hopf | 280.7 on the axisymmetric base flow (Meliga); 271.8 on the bifurcated one (Citro) | Schuh Frantz et al. 2025 |
| low-Péclet sphere | Nu = 2 + Pe/2 + ¼ Pe² ln Pe + …, Pe on the diameter | arXiv:2007.10214 eq. 3 (secondary; the primary, Acrivos & Taylor 1962, was not read, and a factor of 2 hangs on its definition of Pe) |
| hot-wire length | "l/d > 200", attributed to Ligrani & Bradshaw (1987) | Miller, Estejab & Bailey, Exp. Fluids 55 (2014) |
| | end-conduction parameter Γ = (l/d)√(4a(k_f/k)Nu) > 14 | Hultmark, Ashok & Smits 2011, abstract |
| pipe flow | linearly stable to at least Re 10⁷; transition from about 2000 when disturbed | Avila, Barkley & Hof 2023, open copy |

## 5. Not verified

- The contents of Brenner's ZAMP paper.
- Tomboulides & Orszag's 212 (their abstract has no numbers); the note no longer cites it.
- Natarajan & Acrivos's Hopf value 277.5 (not in the abstract).
- King's 1914 paper beyond its abstract; Ligrani & Bradshaw, Bruun and Comte-Bellot at first hand; a readable
  source for the hot wire's "cold length".
- **Collis & Williams's coefficients** (0.24, 0.56, 0.45): not part of this pass; still quoted from memory.
