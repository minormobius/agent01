# Electron microscope — loop run 1 (stages 1–3)

Produced by `.claude/workflows/sci-instrument.mjs` on 2026-08-16. 13 agents,
0 errors. Stats: {"sourcesFound":68,"unique":64,"verified":64,"readInFull":20,"parts":4}.

**This chart is not approved.** The adversarial critic returned
`needs-work` — 5 cuts, 22 gaps, listed at the foot. Nothing here
should be authored into a page until those are resolved. See
[`docs/SCI-LOOP.md`](../../docs/SCI-LOOP.md) §gates.

---

## The angle

### The misconception

"As the wavelength of an electron can be more than 100,000 times smaller than that of visible light, electron microscopes have a much higher resolution of about 0.1 nm, which compares to about 200 nm for light microscopes." (Wikipedia, "Electron microscope", lead paragraph, fetched verbatim.)

The claim is that the electron's short wavelength is what buys the resolution. The sentence refutes itself: it reports a 100,000-fold improvement in wavelength producing a 2,000-fold improvement in resolution, and does not notice the missing factor of fifty. If wavelength were the operative limit, a 300 kV instrument (λ = 1.97 pm) would resolve about a picometre — roughly one hundredth of an atom. No electron microscope has ever come close, and the reason is not engineering slack. It is a theorem.

The comparison that makes it vivid runs the other way from how it is always told: a good light microscope resolves ~200 nm using ~500 nm light — it resolves *finer than its own wavelength*. An electron microscope resolves ~50 times *coarser* than its own. The glass instrument is the one operating at the physical limit. The electron instrument never has been.

### Where it appears

The wavelength-is-the-reason sentence is the standard public explanation, and it propagates nearly word-for-word:

- **Wikipedia, "Electron microscope"** — the lead, quoted above. Notably, the same article's body says "For many years the resolution of TEMs was limited by aberrations of the electron optics, primarily the spherical aberration." The article contradicts its own opening claim and neither statement is edited to acknowledge the other. That is the cleanest available evidence that the field knows and the popular account does not.
- **University imaging-facility teaching pages** (e.g. Utah's Advanced Microscopy "Introduction to Electron Microscopy") carry the same ratio-and-resolution pairing.
- **Undergraduate textbook problem sets** teach it as an exercise: a Pearson/Tro *General Chemistry* problem opens "The resolution limit of a microscope is roughly equal to the wavelength of light," then has the student compute an electron's de Broglie wavelength — i.e. students are drilled on the false premise and rewarded for reaching the conclusion the instrument does not deliver.
- **Museum labels** typically dodge to magnification instead, which is worse: Oxford's Museum of Natural History EM page offers "a light microscope can magnify things up to 2000x, but an electron microscope can magnify between 1 and 50 million times" — a number that is mostly empty magnification and says nothing about what is resolved.

A reader has met this in school, on the wall of a museum, and in the first line of the encyclopaedia article. It is not an obscure error.

### Truth

**The wavelength was never the binding constraint. The lens was, and it was proved to be, in 1936.**

Scherzer showed that for any static, rotationally symmetric, space-charge-free electron lens forming a real image of a real object, the spherical and chromatic aberration coefficients Cs and Cc are *necessarily positive*. This is the structural break with glass optics: an optician cancels a positive aberration with a negative one and builds a corrected doublet. An electron optician cannot, because no round magnetic lens of the required kind has the opposite sign to combine with. The defect cannot be cancelled — only outrun by closing the aperture until the rays that suffer it are thrown away.

So they are thrown away. The working aperture is about 2 × 10⁻² rad — 1.1°. An oil-immersion glass objective at NA 1.4 collects about 67°. The electron microscope images through a needle of its own beam, and that is where the factor of fifty in Wikipedia's sentence goes.

Scherzer's 1949 quantitative form makes the misconception arithmetically explicit: point resolution d ≈ 0.66·Cs^(1/4)·λ^(3/4), with optimum defocus Δf ≈ −1.2(Csλ)^(1/2). Wavelength enters as the **three-quarter power**, and Cs — a property of the iron, not of the electron — carries the rest. Quadrupling the accelerating voltage roughly halves λ and buys only a 1.7× improvement. That single exponent is the whole correction: resolution is not proportional to wavelength, and never was.

**The founders got this right, and the popular version lost it.** Knoll and Ruska's 1932 naming paper did not quote a wavelength. They substituted λ at 75 kV *and* the 2 × 10⁻² rad aperture into Abbe's relation and predicted 2.2 Å — about fifty times the wavelength, the honest number with the lens defect already in it. Ruska records in his Nobel lecture that most experts "regarded it as a pipe-dream"; it was reached roughly forty years later. Note the aperture they used is, per Ruska, still the working aperture today. The correct account was in the founding paper. The public one dropped the aperture and kept the wavelength.

**What actually broke the limit was not a shorter wavelength.** Haider et al. (1998) built the first working hexapole Cs-corrector by attacking one of Scherzer's four premises — rotational symmetry. Then computation retired the lens outright: Jiang et al. (2018) reached 0.39 Å by ptychography, ~2.5× beyond the diffraction limit *of the optics they used*; Nguyen et al. (2024) reached 0.44 Å in a commercially available **uncorrected** STEM, exploiting the residual aberrations as structured, dose-efficient illumination rather than tolerating them; Blackburn et al. (2025) reached 0.67 Å in a modified **SEM at 20 keV** — and reported it as a resolution-to-wavelength ratio of **7.8**, which is the field quietly measuring its own performance in units of "how many times worse than our wavelength are we." Resolution has migrated out of the objective lens and into the detector and the reconstruction algorithm.

**And the floor it has run into is not optical.** Chen et al. (2021), 300 keV ptychography on 21 nm PrScO₃: measured atomic-column FWHM 0.44 ± 0.01 Å (Pr), of which 0.23 Å FWHM is thermal broadening derived independently from Debye-Waller factors, leaving residual *instrumental* blur of only 0.16 ± 0.01 Å. Abbe resolution better than 0.15 ± 0.01 Å. The microscope is now sharper than the specimen: what blurs the best images in the world is the atoms vibrating in place. That limit is thermodynamic, it is still ~8× the electron's wavelength, and it will not close, because the target moves.

**Why the correction matters practically, not just pedantically.** Because the public story says "shorter wavelength = better," it implies higher kV is always better — and that is false in exactly the places people care about. McMullan et al. (2023) built a purpose-designed **100 keV** cryo-EM instrument and solved eleven structures from 140 kDa to 2 MDa, because for thin biological specimens lower energy scatters more usefully per unit radiation damage; 300 keV is a legacy choice. Venugopal et al. (2025) bolted a modern direct detector onto an ordinary **120 kV LaB₆** microscope and got 2.65 Å apoferritin — the field-emission gun and the 300 kV column were carrying less of the performance than the sensor was. Chen et al. (2020) found that for hybrid perovskites *higher* voltage reduces damage and *cooling accelerates* it, inverting two more rules of thumb. And Ochner et al. (2021) imaged single antibody molecules with **no electron lenses at all** — a field-emitting nanotip, a specimen, a screen, and numerical reconstruction of the inline hologram. No lens, therefore no spherical aberration to correct.

The honest summary: the electron microscope is not a light microscope with a shorter ruler. It is an instrument built around an optic so poor it must be stopped down to a degree of collection angle, whose entire modern history is a series of escapes from that optic — first by breaking its symmetry, now by computing it away — and which has finally hit a wall made of the specimen's own heat rather than of anything in the column.

### Settled By

**The spine (three citations, all DOI-verified):**

1. **O. Scherzer, "Über einige Fehler von Elektronenlinsen," Zeitschrift für Physik 101(9–10), 593–603 (1936). DOI: 10.1007/BF01349606** — the theorem. Cs and Cc necessarily positive for static, round, space-charge-free lenses forming a real image of a real object; the defect cannot be cancelled by any combination of round lenses. This is the citation that settles "why doesn't it reach the wavelength limit," and it predates almost every popular account still in circulation. (Metadata-verified; no abstract indexed — do not attribute specific wording to it.)

2. **O. Scherzer, "The Theoretical Resolution Limit of the Electron Microscope," Journal of Applied Physics 20(1), 20–29 (1949). DOI: 10.1063/1.1698233** — the quantitative form that makes the misconception falsifiable on a napkin: χ(k) = π·Δf·λk² + (π/2)·Cs·λ³k⁴, Δf ≈ −1.2(Csλ)^(1/2), d ≈ 0.66·Cs^(1/4)·λ^(3/4). The λ^(3/4) exponent is the correction in one symbol.

3. **Z. Chen et al., "Electron ptychography achieves atomic-resolution limits set by lattice vibrations," Science 372(6544), 826–831 (2021). DOI: 10.1126/science.abg2533** — the modern floor, with the instrumental and thermal contributions separated by quadrature subtraction against Debye-Waller factors: 0.44 Å measured column FWHM, 0.23 Å thermal, 0.16 ± 0.01 Å residual instrumental. Read in full via arXiv:2101.00465; every quoted number confirmed in text.

**Supporting, for the historical and the "escape" sections:**
- E. Ruska, Nobel Lecture, Rev. Mod. Phys. 59(3), 627–638 (1987). **DOI: 10.1103/RevModPhys.59.627** — the 2.2 Å prognosis at 75 kV with the 2 × 10⁻² rad aperture "still used today," the "pipe-dream" reception, the ~40-year lag. Free full text at nobelprize.org; read directly.
- Knoll & Ruska, "Das Elektronenmikroskop," Z. Phys. 78(5–6), 318–339 (1932). **DOI: 10.1007/BF01342199** — the prognosis itself.
- Haider et al., Nature 392, 768–769 (1998). **DOI: 10.1038/33823** — first working hexapole Cs-corrector; the hinge from "the theorem forbids it" to "here is how they got round it." Metadata only — quote no numbers to it.
- Jiang et al., Nature 559, 343–349 (2018). **DOI: 10.1038/s41586-018-0298-5** — 0.39 Å, ~2.5× beyond the optics' diffraction limit.
- Nguyen et al., Science 383(6685), 865–870 (2024). **DOI: 10.1126/science.adl2029** — 0.44 Å in an *uncorrected* instrument.
- Blackburn et al., Nat. Commun. 16, 8977 (2025). **DOI: 10.1038/s41467-025-64133-3** — 0.67 Å at 20 keV in an SEM; resolution-to-wavelength ratio 7.8 stated by the authors.
- McMullan et al., PNAS 120(49), e2312905120 (2023). **DOI: 10.1073/pnas.2312905120** — 100 keV beats the "more volts is better" corollary.
- Ochner et al., PNAS 118(51), e2112651118 (2021). **DOI: 10.1073/pnas.2112651118** — the lensless limiting case.

**One caveat to carry into the page:** Scherzer 1936 and Haider 1998 are metadata-only in the verified scan (no abstract indexed for either). The theorem's content and the corrector's description are sourced from secondary literature; state them as the field states them, do not put a specific number or a quoted phrase against either DOI without reading the papers.

### One Sentence

A light microscope resolves finer than its own wavelength; an electron microscope resolves about fifty times coarser than its own — the limit was never the electron, it was the lens, and now that computation has replaced the lens, what blurs the picture is the atoms shaking.

---

## The chart

### Part 1 — The Missing Factor of Fifty (`/missing-factor-of-fifty`)

**oneIdea**

Resolution measured in units of its own wavelength depends on nothing but the collection half-angle — so the factor of fifty Wikipedia's own sentence loses is not slack, it is the aperture, and Scherzer's theorem is why that aperture cannot be opened.

**demo**

One bench, three dials: accelerating voltage (which sets λ relativistically), Cs, and aperture half-angle α. Sweeping α draws two discs crossing — diffraction 0.61λ/α falling, spherical Cs·α³ rising — and their quadrature sum has a minimum the reader has to hunt for. Past it, opening the aperture makes the image *worse*, which no glass optic does; a 67° oil-immersion cone is drawn to scale beside the 1.1° electron needle so the reader sees what is being thrown away. A second panel plots the wave-optic version of the same lens, sin χ(k), and marks the passband edge, so the reader watches a ray-optic minimum and a wave-optic first zero land on the same number. The headline readout is d/λ at every setting, with four published points pinned to it that the reader drags onto the curve and reads the implied α off the axis: an NA 1.4 oil objective, Knoll & Ruska's 1932 prognosis, Wikipedia's 0.1 nm at 300 kV, and a Cs-corrected column. Two switches carry the argument. 'Cs = 0' opens the passband to the edge of the plot — the only condition under which the encyclopaedia sentence is true — and then, with Δf also zeroed, the contrast panel goes flat black: a perfect lens at exact focus shows a weak phase object nothing at all. 'Convention' toggles Abbe's coherent form λ/α against the incoherent λ/2α, because the factor of two between them is the one honest ambiguity in the whole argument and the page states it rather than hiding it.

**closedForm**

(1) λ(V) = h/√(2m₀eV(1+eV/2m₀c²)) → 8.588 pm at 20 kV, 4.322 pm at 75 kV (4.478 pm non-relativistic), 1.969 pm at 300 kV. (2) Knoll & Ruska reconstructed, not quoted: λ(75 kV)/α at the α = 2×10⁻² rad they actually used = 216 pm against their published 2.2 Å prognosis — their famous number *is* the wavelength divided by the aperture. (3) Scherzer 1949, which the swept minimum must land on: d = 0.66·Cs^(1/4)·λ^(3/4) with Δf = −1.2(Csλ)^(1/2) → 1.95 Å for Cs = 1 mm at 300 kV, the standard uncorrected point resolution; optimum aperture α_opt = 1.41(λ/Cs)^(1/4) = 9.4 mrad. (4) Independent wave-optic derivation that must agree to the digit: χ(k) = πΔfλk² + (π/2)Csλ³k⁴ at Scherzer defocus has its first zero at k₁ = 1.51·Cs^(−1/4)·λ^(−3/4), so 1/k₁ = 0.66·Cs^(1/4)·λ^(3/4) and the passband edge sits at α = λk₁ = 10.1 mrad. (5) The inversion, which is the whole part: Wikipedia's 0.1 nm at λ = 1.969 pm is d/λ = 50.8; inverted under the incoherent convention that is 1/(2×50.8) = 9.84 mrad, within 3% of the 10.1 mrad Scherzer passband of an ordinary uncorrected 300 kV instrument, and under the coherent convention 19.7 mrad, within 2% of the 20 mrad aperture Knoll & Ruska used in 1932 and which Ruska says is still used. Both readings land on a real aperture of the instrument. (6) Glass, scored in its own wavelength: 0.61×550/1.4 = 240 nm, i.e. d/λ = 0.44 (0.36 under λ/2NA). (7) Exact limiting case: Cs = 0 and Δf = 0 ⇒ χ ≡ 0 ⇒ sin χ ≡ 0 at every frequency ⇒ zero phase contrast. (8) Exponent test: 75 → 300 kV shortens λ by 2.195× and improves d by 2.195^(3/4) = 1.80×, not 2.2×.

**surprise**

A good glass objective resolves at 0.44 times its own wavelength — finer than its light. The electron optic resolves at about fifty times its own, and inverting that fifty returns the aperture, to within 3%. It was in the founding paper: Knoll and Ruska's 2.2 Å is just λ/α, honest about the lens from the start; the popular account kept the wavelength and dropped the only term carrying the answer. And the lens is worse than 'blurry': a perfectly corrected lens at exact focus makes a weak phase object completely invisible. Every atomic-resolution phase-contrast image ever published is produced by deliberately introducing a defect — defocus — to beat against a residual one.

**sources**

- O. Scherzer, Über einige Fehler von Elektronenlinsen, Z. Phys. 101, 593–603 (1936). DOI 10.1007/BF01349606 [metadata-only: state the theorem as the field states it; attribute no wording or number to this DOI]
- O. Scherzer, The Theoretical Resolution Limit of the Electron Microscope, J. Appl. Phys. 20, 20–29 (1949). DOI 10.1063/1.1698233 [abstract read; χ(k), Scherzer defocus, d = 0.66 Cs^¼λ^¾]
- M. Knoll & E. Ruska, Das Elektronenmikroskop, Z. Phys. 78, 318–339 (1932). DOI 10.1007/BF01342199 [metadata-only; the 2.2 Å prognosis, the 75 kV and the 2×10⁻² rad aperture are taken from Ruska's Nobel lecture, read in full]
- E. Ruska, Nobel Lecture, Rev. Mod. Phys. 59, 627–638 (1987). DOI 10.1103/RevModPhys.59.627 [read in full via the free Nobel Foundation PDF: the aperture 'still used today', the 'pipe-dream' reception, the ~40-year lag]
- E. Abbe, Beiträge zur Theorie des Mikroskops, Arch. Mikrosk. Anat. 9, 413–468 (1873). DOI 10.1007/BF02956173 [both conventions; the factor of two must be stated, not chosen silently]
- L. de Broglie, Recherches sur la théorie des quanta, Ann. Phys. (10) 3, 22–128 (1925). DOI 10.1051/anphys/192510030022
- H. Busch, Berechnung der Bahn von Kathodenstrahlen im axialsymmetrischen elektromagnetischen Felde, Ann. Phys. 386, 974–993 (1926). DOI 10.1002/andp.19263862507 [the lens is Busch's; Ruska built one]
- M. Haider et al., Electron microscopy image enhanced, Nature 392, 768–769 (1998). DOI 10.1038/33823 [metadata-only: cite as the hinge — break rotational symmetry and Cs is no longer forced positive — quote no numbers]
- R. Erni et al., Atomic-Resolution Imaging with a Sub-50-pm Electron Probe, Phys. Rev. Lett. 102, 096101 (2009). DOI 10.1103/PhysRevLett.102.096101 [predicted 29% contrast at 47 pm against 11–18% measured]
- J.-O. Malm & M. A. O'Keefe, Deceptive 'lattice spacings' in high-resolution micrographs of metal nanoparticles, Ultramicroscopy 68, 13–23 (1997). DOI 10.1016/S0304-3991(97)00005-3 [metadata-only: past the first zero the fringes are not lattice planes]

### Part 2 — Angle Is Paid For in Electrons (`/angle-costs-electrons`)

**oneIdea**

Collection angle is not free: scattering at high angle is rare, so reaching it costs dose — and the specimen caps how many electrons it will lend while the detector throws most of them away, which makes usable angle a product of two measurable numbers, D_c × DQE.

**demo**

Two coupled meters over one budget. Upstream, an element picker and a voltage dial: the page computes the maximum energy a beam electron can hand a nucleus head-on and draws it against that element's displacement-threshold *distribution* (a band with a width, not a constant), so the reader sweeps kV and watches the crossing point where atoms start leaving; a second curve is the critical exposure per resolution shell, so setting a target resolution reads out an electron allowance. Downstream, a single-electron event simulator run at a chosen dose rate and frame rate: in integrating mode the Landau spread of deposited energy alone caps DQE(0); in counting mode a threshold is applied and two electrons landing in one footprint within one frame become one count — the reader drags the beam current up, watches the picture get brighter and the DQE fall, then buys it back with frame rate. A third slider walks out to Nyquist and hits an aliasing ceiling a geometrically perfect pixel cannot beat. The two meters are wired together: the readout that matters is electrons-per-Å² that actually reach the file, and the scattering angle at which the signal falls below one count — the θ the next part will spend. Two traps are built in. Injecting one hot pixel does nothing to the integrating image and puts a bright, entirely credible false atom into the counted one. Switching the specimen to a hybrid perovskite makes the knock-on panel and the measured damage disagree: raising kV makes panel A worse and the specimen better, and cooling makes it worse still.

**closedForm**

(1) Relativistic two-body kinematics T_max = 2E(E + 2m₀c²)/(Mc²): for carbon (M = 12.011 u) 15.8 eV at 80 keV and 20.1 eV at 100 keV, so against graphene's threshold — 20.0 eV (DFTB, 0 K) to 21.2–21.3 eV (fitted to STEM measurement, width ~0.5–1.0 eV) — the onset voltage computes to 99.8–105.5 keV, against Meyer et al.'s measured 80–100 kV onset (erratum applied). Same equation, gold at ~36 eV: 1.38 MeV. (2) Critical exposure N_e = 0.245·k^(−1.665) + 2.81 (R² = 0.997; no uncertainties published on a, b, c — the page must say so) → 44.9 e⁻/Å² at 22 Å, 14.1 at 10 Å, 5.1 at 3.8 Å. (3) DQE(0) = M₁²/M₂ from the first and second moments of the single-electron pulse-height distribution: the CSDA Landau deposit of a backthinned sensor gives M₁ = 1.87, M₂ = 4.4 → 0.795. (4) The arithmetic ceiling no fabrication lifts: a geometrically perfect square pixel has MTF(Nyquist) = 2/π = 0.637 and DQE(Nyquist) = (2/π)² = 0.4053 from noise aliasing alone. (5) Coincidence loss as Poisson arrivals in an event footprint of a pixels at frame rate f: kept = (1 − e^(−x))/x with x = a·rate/f. One fitted parameter — a = 9.5 px at the K2's fixed 400 fps — reproduces both published points: 11.0% loss at 10 e⁻/px/s and 30.0% at 32 e⁻/px/s, against the measured ~11% and ~29%. The reader recovers the event footprint rather than being told it. (6) Ground truth to overlay, measured not vendor-quoted, at 0 / 0.5 / 1.0 × Nyquist: K2 counting at 300 keV 0.81 / 0.54 / 0.18; Falcon II at 200 keV 0.43 / 0.32 / 0.09; US4000 scintillator at 200 keV 0.37 / 0.11 / 0.02. Integrating-mode ceilings set by energy-deposition variance, not electronics: 0.34 / 0.47 / 0.48.

**surprise**

A flawless detector — perfect pixels, zero read noise, every electron registered — is arithmetically forbidden from exceeding 40.5% DQE at its own Nyquist frequency. And a counting detector's headroom is a clock, not a well depth: DQE falls with exactly the beam current you would raise to see more. Upstream the numbers are just as unintuitive: the entire 1.3 eV of a genuinely unresolved theory-experiment disagreement about carbon's threshold moves the design voltage by only 6 kV, while the same beam that ejects carbon atoms one at a time cannot move a gold atom below 1.4 MV — damage is set by the mass ratio, not the beam. The corollary of the wavelength story fails in the place people care most: a purpose-built 100 keV cryo-EM instrument solved eleven structures from 140 kDa to 2 MDa, and a modern sensor bolted onto an ordinary 120 kV LaB₆ column reached 2.65 Å. The sensor was carrying more of the performance than the 300 kV column and the field-emission gun.

**sources**

- J. C. Meyer et al., Accurate Measurement of Electron Beam Induced Displacement Cross Sections for Single-Layer Graphene, Phys. Rev. Lett. 108, 196102 (2012). DOI 10.1103/PhysRevLett.108.196102 [abstract only; do not print barn values without the full text]
- J. C. Meyer et al., Erratum, Phys. Rev. Lett. 110, 239902 (2013). DOI 10.1103/PhysRevLett.110.239902 [the canonical cross sections were wrong on publication; any quoted value must state which version it is]
- A. I. Chirita Mihaila, T. Susi & J. Kotakoski, Influence of temperature on the displacement threshold energy in graphene, Sci. Rep. 9, 12981 (2019). DOI 10.1038/s41598-019-49565-4 [read in full; threshold as a distribution, 20.0 eV DFTB at 0 K vs 21.2–21.3 eV fitted, residual discrepancy stated as unresolved]
- T. Grant & N. Grigorieff, Measuring the optimal exposure for single particle cryo-EM using a 2.6 Å reconstruction of rotavirus VP6, eLife 4, e06980 (2015). DOI 10.7554/eLife.06980 [read in full; a = 0.245, b = −1.665, c = 2.81]
- S. Chen et al., TEM of organic–inorganic hybrid perovskites: myths and truths, Sci. Bull. 65, 1643–1649 (2020). DOI 10.1016/j.scib.2020.05.020 [read in full via arXiv:2004.12262; cooling accelerates damage, higher kV reduces it, facet-dependent]
- G. McMullan et al., Structure determination by cryoEM at 100 keV, PNAS 120, e2312905120 (2023). DOI 10.1073/pnas.2312905120 [eleven structures, 140 kDa to 2 MDa]
- G. McMullan, S. Chen, R. Henderson & A. R. Faruqi, Detective quantum efficiency of electron area detectors, Ultramicroscopy 109, 1126–1143 (2009). DOI 10.1016/j.ultramic.2009.04.002 [read in full via PMC2864625; DQE(0) = M₁²/M₂, 1.87 / 4.4, (2/π)² = 0.405]
- X. Li et al., Electron counting and beam-induced motion correction…, Nat. Methods 10, 584–590 (2013). DOI 10.1038/nmeth.2472 [read in full via PMC3684049; 400 fps, 87% QE at low dose, 11% / 29% coincidence loss, 1/32-pixel centroiding]
- R. S. Ruskin, Z. Yu & N. Grigorieff, Quantitative characterization of electron detectors for TEM, J. Struct. Biol. 184, 385–393 (2013). DOI 10.1016/j.jsb.2013.10.016 [read in full via PMC3876735; Table 2 measured DQEs, below vendor claims]
- G. McMullan, A. R. Faruqi, D. Clare & R. Henderson, Comparison of optimal performance at 300 keV of three direct electron detectors, Ultramicroscopy 147, 156–163 (2014). DOI 10.1016/j.ultramic.2014.08.002 [read in full via arXiv:1406.1389; integrating ceilings 0.34 / 0.47 / 0.48; counting's own pathologies, hot pixels]
- H. Guo et al., Electron-event representation data enable efficient cryoEM file storage, IUCrJ 7, 860–869 (2020). DOI 10.1107/S205225252000929X [read in full; ~99% zeros — counting works because the frame is empty; 2.4 Å against a 3.28 Å physical Nyquist]
- H. T. Philipp et al., Very-High Dynamic Range, 10,000 Frames/Second Pixel Array Detector, Microsc. Microanal. 28, 425–440 (2022). DOI 10.1017/S1431927622000174 [read in full via arXiv:2111.05889; 2.6 keV noise floor against single-electron SNR 115 at 300 keV]
- A. Agarwal, J. Simonaitis & K. K. Berggren, Image-histogram-based secondary electron counting to evaluate DQE in SEM, Ultramicroscopy 224, 113238 (2021). DOI 10.1016/j.ultramic.2021.113238 [read in full via arXiv:2008.01917; secondary emission is compound Poisson, so the signal is not Poisson; measured DQE 0.16 / 0.32]
- H. Venugopal et al., High-resolution cryo-EM using a common LaB₆ 120-keV microscope with a sub-200-keV direct detector, Sci. Adv. 11, eadr0438 (2025). DOI 10.1126/sciadv.adr0438 [2.65 Å apoferritin]
- P. Rez, L. Houben, S. Seifer & M. Elbaum, Contrast by electron microscopy in thick biological specimens, J. Microsc. 300, 341–355 (2025). DOI 10.1111/jmi.70026 [read in full; EFTEM discards >90% of incident electrons; thick-specimen contrast optimum near ~700 keV]

### Part 3 — The Aperture Moves to the Detector (`/aperture-moves-to-the-detector`)

**oneIdea**

Ptychography does not beat the aperture limit — it obeys the same relation with a different aperture, the detector's angular reach, which has no optimum because a recorded scattering angle cannot be aberrated.

**demo**

The reader is handed a recorded diffraction pattern per probe position and drags a circular mask over it — the detector's angular edge θ_max — while an in-page iterative reconstruction updates. Resolution tracks λ/(2θ_max) with no minimum: unlike Part 1's curve, wider is always better, and the α³ penalty that punished the reader there is simply absent from the plot. A toggle runs the same specimen through a conventional lens at its Scherzer optimum for side-by-side comparison. Then the reader injects a known aberration (Cs, defocus, astigmatism) into the simulated probe and reads back the coefficients the solver recovered, comparing recovered against injected. A dose slider — spending the allowance earned in Part 2 — drives the reconstruction into failure, and a 'reference bias' mode reconstructs pure noise against a supplied template so the reader watches structure appear where there is none, then runs a gold-standard FSC on genuinely independent half-sets to catch it. Finally the reader inverts three published results: type in a resolution and a voltage, read out the angular reach that instrument must have recorded.

**closedForm**

(1) d = λ/(2θ_max), i.e. d/λ = 1/(2θ_max) — the identical relation from Part 1 with the objective aperture replaced by the detector's angular reach and the α³ penalty deleted. Tested against three published results spanning 15× in wavelength: Blackburn et al., 0.67 Å at 20 keV (λ = 8.588 pm) → ratio 7.80, matching the authors' own stated resolution-to-wavelength ratio of 7.8, implying θ_max = 64.1 mrad; Jiang et al., 0.39 Å at 80 keV (λ = 4.176 pm) → ratio 9.34, θ_max = 53.5 mrad; Chen et al., Abbe 0.15 Å at 300 keV → ratio 7.62, θ_max = 65.6 mrad. (2) Self-consistency: recovered aberration coefficients must equal the injected ones within the reconstruction's stated error. (3) Forward-model validation of the simulation stack, both zero-parameter: the multislice transmit-and-propagate must reproduce the two-beam Pendellösung I_g(t) = sin²(πt/ξ_g) with extinction distance ξ_g = πV_c cos θ_B/(λF_g), the oscillation period read off the simulation equalling the analytic ξ_g; and STEM/TEM reciprocity must return the same image computed both ways. (4) The interaction constant σ = 2πmeλ/h² must carry the relativistic mass factor — drop it and λ stays right while contrast goes quietly wrong, which the reader can toggle. (5) Convergence budget: PRISM interpolation must shift refitted atomic-column positions by 0.86 pm at f = 5, 2.8 pm at f = 10, 21 pm at f = 20 against conventional multislice on a 7 nm Pt decahedron.

**surprise**

Three instruments whose wavelengths differ fifteenfold — a 20 keV SEM, an 80 keV STEM, a 300 keV column — all land within 20% of the same resolution-to-wavelength ratio, about 8. That ratio has nothing to do with the electron: it is 1/(2θ_max), and the modern ~63 mrad is simply six times the ~10 mrad Scherzer allowed. The entire computational era is that one factor of six. And an *uncorrected* microscope beats a corrected one — Nguyen's 0.44 Å comes out of a commercial instrument with no corrector, because the residual aberrations spread the probe into illumination more dose-efficient than an ideal focused one. The defect gets promoted to the lamp.

**sources**

- Y. Jiang et al., Electron ptychography of 2D materials to deep sub-ångström resolution, Nature 559, 343–349 (2018). DOI 10.1038/s41586-018-0298-5 [0.39 Å, ~2.5× beyond the diffraction limit of the optics used; figures cross-checked against Chen et al. 2021, read in full]
- K. X. Nguyen et al., Achieving sub-0.5-angstrom-resolution ptychography in an uncorrected electron microscope, Science 383, 865–870 (2024). DOI 10.1126/science.adl2029 [0.44 Å; residual aberrations exploited as dose-efficient illumination]
- A. M. Blackburn, C. Cordoba, M. R. Fitzpatrick & R. A. McLeod, Sub-ångström resolution ptychography in a scanning electron microscope at 20 keV, Nat. Commun. 16, 8977 (2025). DOI 10.1038/s41467-025-64133-3 [read in full; 0.67 Å, authors' own ratio 7.8, Quadro detector with dead layer removed]
- J. M. Cowley & A. F. Moodie, The scattering of electrons by atoms and crystals I, Acta Cryst. 10, 609–619 (1957). DOI 10.1107/S0365110X57002194 [the multislice algorithm the reconstruction's forward model runs on]
- H. Bethe, Theorie der Beugung von Elektronen an Kristallen, Ann. Phys. 392, 55–129 (1928). DOI 10.1002/andp.19283921704 [metadata-only; origin of dynamical theory and Pendellösung]
- K. Fujiwara, Relativistic Dynamical Theory of Electron Diffraction, J. Phys. Soc. Jpn. 16, 2226–2238 (1961). DOI 10.1143/JPSJ.16.2226 [the second relativistic correction, in σ, that the simulation must carry]
- J. M. Cowley, Image contrast in a transmission scanning electron microscope, Appl. Phys. Lett. 15, 58–59 (1969). DOI 10.1063/1.1652901 [reciprocity: a free zero-parameter test of the whole stack]
- C. Ophus, A fast image simulation algorithm for STEM, Adv. Struct. Chem. Imaging 3, 13 (2017). DOI 10.1186/s40679-017-0046-1 [read in full; PRISM error budget 0.86 / 2.8 / 21 pm at f = 5 / 10 / 20]
- R. Henderson, Avoiding the pitfalls of single particle cryo-EM: Einstein from noise, PNAS 110, 18037–18041 (2013). DOI 10.1073/pnas.1314449110 [read in full; ~1000 pure-noise images aligned to a template reproduce the template; gold-standard FSC on independent half-sets is the only defence]
- H. Ochner et al., Low-energy electron holography imaging of conformational variability of single-antibody molecules, PNAS 118, e2112651118 (2021). DOI 10.1073/pnas.2112651118 [the limiting case: no lens at all, therefore no spherical aberration to correct]
- Z. Chen et al., Electron ptychography achieves atomic-resolution limits set by lattice vibrations, Science 372, 826–831 (2021). DOI 10.1126/science.abg2533 [read in full via arXiv:2101.00465; Abbe better than 0.15 ± 0.01 Å, Rayleigh 0.18 ± 0.01 Å, depth resolution 3.9 nm against the aperture-limited 5.1 nm]

### Part 4 — The Floor Is the Specimen Shaking (`/the-floor-is-the-specimen-shaking`)

**oneIdea**

The best images in the world are now blurred more by the atoms' own thermal motion than by the instrument, and that term contains neither wavelength nor angle — so the sequence of escapes stops here.

**demo**

The reader drives specimen temperature — through the Debye-Waller factor to an r.m.s. displacement — and residual instrumental blur, separately, and watches a simulated atomic column's measured width. The two contributions add in quadrature, and the reader is then asked to run the experiment backwards exactly as Chen et al. did: given the measured column broadening and a Debye-Waller factor taken independently from diffraction, subtract in quadrature and recover the instrument's own blur — arriving at a number smaller than the specimen's. A frozen-phonon toggle shows what the thermal term physically *is*: an average over displaced-atom configurations, not a factor applied to the potential; with it off, the thermal-diffuse background and the entire HAADF signal vanish. A final readout divides the recovered instrumental blur by the electron's wavelength and puts the answer beside Part 3's ratios, and beside Part 1's fifty.

**closedForm**

(1) FWHM_thermal = 2√(2 ln 2)·u_rms = 2.3548·√(B/8π²), with B = 8π²⟨u²⟩. (2) Anchor on an independently fitted value: Loane, Xu & Silcox's silicon r.m.s. amplitude 0.085(5) Å near room temperature → 0.200 Å FWHM. (3) Chen et al.'s quadrature subtraction reproduced exactly (300 keV, 21 nm PrScO₃, 42 slices of 0.5 nm): measured Pr column FWHM 0.44 ± 0.01 Å (Sc 0.45, O 0.54), total broadening 0.28 Å, thermal 0.23 Å from independently tabulated Debye-Waller factors → √(0.28² − 0.23²) = 0.1597 Å against their published residual instrumental blur of 0.16 ± 0.01 Å (0.15 Å for Sc). (4) Inverting their thermal term: 0.23 Å FWHM ⇒ u_rms = 0.0977 Å ⇒ B = 0.75 Å², a number the reader checks against tabulated DWFs. (5) The closing ratio, computed not asserted: 0.16 Å at 300 keV is 8.13 × λ(300 kV) = 1.969 pm — the same factor of eight as every ptychographic result in Part 3, and the number the popular account says should be about one. (6) Absolute-scale validation that makes the subtraction trustworthy at all: HAADF intensities normalised to the incident beam must match frozen-phonon multislice with no fitting parameter for SrTiO₃ up to 120 nm, provided finite source size is included.

**surprise**

Strip the vibration out and the instrument that made the sharpest images ever recorded is still 0.16 Å wide — but the specimen is 0.23 Å wide, so the microscope is now sharper than the thing it is looking at. What blurs the best pictures in the world is atoms shaking in place: a thermodynamic limit that does not close, because the target moves. And the field is honest about the units even as the popular account is not — the residual instrument is 8.1 wavelengths across, and has never been below about seven.

**sources**

- Z. Chen et al., Electron ptychography achieves atomic-resolution limits set by lattice vibrations, Science 372, 826–831 (2021). DOI 10.1126/science.abg2533 [read in full via arXiv:2101.00465; every quoted number confirmed in text]
- R. F. Loane, P. Xu & J. Silcox, Thermal vibrations in convergent-beam electron diffraction, Acta Cryst. A 47, 267–278 (1991). DOI 10.1107/S0108767391000375 [frozen phonon; Si u_rms = 0.085(5) Å, validated against Si(100) CBED to at least 550 Å thickness]
- J. M. LeBeau, S. D. Findlay, L. J. Allen & S. Stemmer, Quantitative Atomic Resolution Scanning Transmission Electron Microscopy, Phys. Rev. Lett. 100, 206101 (2008). DOI 10.1103/PhysRevLett.100.206101 [absolute-scale HAADF with no fitting parameter]
- L.-M. Peng, G. Ren, S. L. Dudarev & M. J. Whelan, Robust Parameterization of Elastic and Absorptive Electron Atomic Scattering Factors, Acta Cryst. A 52, 257–276 (1996). DOI 10.1107/S0108767395014371 [scattering and absorptive factors, 1–1000 K]
- D. Van Dyck, Persistent misconceptions about incoherence in electron microscopy, Ultramicroscopy 111, 894–900 (2011). DOI 10.1016/j.ultramic.2011.01.007 [HAADF is not simply Z-contrast; ⟨u²⟩ enters the signal too]
- M. J. Hÿtch & W. M. Stobbs, Quantitative comparison of high resolution TEM images with image simulations, Ultramicroscopy 53, 191–203 (1994). DOI 10.1016/0304-3991(94)90034-5 [metadata-only: the contrast-mismatch concession; do not quote its size without the text]
- H.-C. Ni, R. Busch & J.-M. Zuo, PyExtal: quantitative convergent-beam electron diffraction, J. Appl. Cryst. 59, 687–699 (2026). DOI 10.1107/S1600576726001469 [read in full; five-figure structure factors coexisting with a ~12% three-method spread on Si V(222)]
- A. J. Noble et al., Routine single particle CryoEM sample and grid characterization by tomography, eLife 7, e34257 (2018). DOI 10.7554/eLife.34257 [~90% of particles adsorbed to an air–water interface: the specimen is not what the diagram shows]

### Capstone

**idea**

Every microscope ever built, glass or electron, obeys one relation — and the wavelength cancels out of it. What an instrument resolves, measured in its own wavelengths, is the reciprocal of twice its collection angle, plus a thermal term that does not know what a wavelength is. A 1.4-NA oil objective sits at d/λ ≈ 0.4: it resolves finer than its own light. A 1932 electron microscope sat at 50, and so does the encyclopaedia's modern number — and inverting that fifty returns, under one Abbe convention, 9.84 mrad against the 10.1 mrad Scherzer passband of an ordinary uncorrected 300 kV column, and under the other 19.7 mrad against the 20 mrad aperture Knoll and Ruska used in 1932. Either way the missing factor is not slack, it is the aperture. Scherzer's 1936 theorem is why it cannot be opened: it is the one aperture in all of optics that makes the image worse when widened, because Cs is forced positive and the penalty grows as α³ while the reward falls as 1/α. Every escape since has been an attack on θ, never on λ. Break the lens's rotational symmetry (1998) and θ roughly doubles. Stop forming an image altogether — record the whole diffraction pattern and reconstruct — and θ becomes the detector's angular reach, which has no optimum because a recorded angle cannot be aberrated: a 20 keV SEM, an 80 keV STEM and a 300 keV column all land at θ ≈ 53–66 mrad and therefore all at d/λ ≈ 8, despite a fifteenfold spread in wavelength. That factor of six in θ, from 10 mrad to 63, is the entire computational era, and it is paid for in electrons — how far out in θ the pattern is still signal is set by how many electrons the specimen will lend times how much of each one the detector keeps. Push θ as far as dose and DQE allow and you arrive at 0.16 Å of instrumental blur — still 8.1 wavelengths — sitting in quadrature against 0.23 Å of atoms vibrating in place. The final page assembles the whole relation live: the reader carries their own kV, Cs, aperture, dose, DQE and temperature through from Parts 1–4, and the panel evaluates it for a 1932 Berlin instrument, an uncorrected 300 kV column and a 2021 ptychographic reconstruction — three rows, one equation, the binding term migrating from the lens to the detector to the specimen's own heat. The closed-form check is that the 1932 row must return Knoll and Ruska's 2.2 Å and the 2021 row must return Chen's 0.16 ± 0.01 Å.

**law**

d = λ/(2θ) ⊕ 2√(2 ln 2)·u_rms — where ⊕ is quadrature and θ is whatever collection angle the instrument can pay for. When a round lens forms the image, θ ∝ (λ/Cs)^(1/4) (Part 1), which folds back into d = 0.66·Cs^(1/4)·λ^(3/4) and is why shrinking λ returns only its three-quarter power. When computation forms the image, θ is the detector's angular reach (Part 3), independent of λ and bounded only by where the product D_c · DQE stops producing counts — the specimen's critical exposure N_e = 0.245k^(−1.665) + 2.81 times a DQE capped at (2/π)² = 0.405 at Nyquist (Part 2). Wavelength cancels out of d/λ = 1/(2θ) entirely, so the whole history of the instrument is the history of θ: 10 mrad → 25 → 63. And the quadrature term, 2√(2 ln 2)·√(B/8π²) with B = 8π²⟨u²⟩ (Part 4), contains neither λ nor θ — which is why it is the floor.

---

## The critic

Verdict: **needs-work**

### Dullest part

Part 4, "The Floor Is the Specimen Shaking." It is the only part that hands the reader its answer before asking a question: 0.44, 0.23 and 0.16 are all stated in the oneIdea and closedForm, and the demo then asks the reader to recover 0.16 by subtracting 0.23 from 0.28 in quadrature — an operation with no minimum to hunt for, no trap, no failure mode, and no disagreement, which every other part has at least one of. Its closed form is one subtraction and three unit conversions. Its surprise restates the angle's truth section and the capstone's last line. Its eight sources include three that are never used, and its one genuine validation (6) is untestable. The wing would be better with it demoted to a two-panel coda inside the capstone: keep the quadrature subtraction and the 8.13 ratio, lose the part.

### Cuts

1. **Part 4, 'The Floor Is the Specimen Shaking' — cut as a part, keep two numbers.** It is the only part with no trap, no failure mode, no disagreement, and nothing for the reader to find. Part 1 has the contrast panel going flat black; Part 2 has the hot pixel that manufactures a credible atom; Part 3 has Einstein-from-noise. Part 4 tells the reader 0.44, 0.23 and 0.16 up front and then asks them to reproduce √(0.28²−0.23²) with two sliders — an operation with no discovery in it. Its 'surprise' ('the microscope is now sharper than the thing it is looking at') is already stated verbatim in the angle's truth section and again in the capstone. Its unique payload is 2.3548 and one subtraction. Fold the quadrature panel and the 8.13 ratio into the capstone as its closing readout; the wing loses a part and keeps its ending.

2. **Part 1's headline inversion, as currently framed.** 'Inverting that fifty returns the aperture, to within 3%' is not a result, it is a fit with two free parameters the chart chose after seeing the target. Wikipedia gives 0.1 nm and no voltage; the chart supplies 300 kV, and 300 kV is what makes 50.8 come out. It then supplies the Abbe convention *after* the fact — the incoherent reading lands near Scherzer, the coherent reading lands near Knoll and Ruska, and both are presented as confirmations. A factor-of-two free parameter that is allowed to be resolved differently in two consecutive sentences will hit almost any target. Keep the genuine finding, which is λ(75 kV)/α = 216 pm against a published 2.2 Å — that one has no free parameters and is the best thing in the wing. Drop the Wikipedia inversion to an aside stated as coincidence, or state the sensitivity: at 200 kV the same arithmetic gives 12.5 mrad and the agreement evaporates.

3. **Part 3's θ_max column (64.1 / 53.5 / 65.6 mrad) and the 'three instruments cluster at θ ≈ 53–66 mrad' surprise built on it.** No source reports a collection angle for any of the three. The chart defines θ ≡ λ/(2d) from the published resolution, then reports that θ clusters — which is arithmetically the identical statement to 'd/λ clusters', already made one line earlier. The surprise is the same sentence twice. Either verify the three instruments' actual recorded angular reach against the papers (Blackburn's Quadro geometry is in a paper read in full) and show that the inversion *recovers* it, which would be a real test, or delete the column and keep the honest observation that d/λ ≈ 8 across a fifteenfold wavelength spread.

4. **The capstone's 'law', as written.** d = λ/(2θ) ⊕ 2√(2 ln 2)·u_rms fails both closed-form checks the capstone sets for it. The 1932 row returns λ/(2×0.02) = 1.08 Å, not 2.2 Å — the founding number needs λ/θ, the convention the law does not use. The 2021 row returns λ/(2×0.0656) = 0.150 Å, which is Chen's *Abbe resolution*, not the 0.16 Å residual instrumental blur the capstone says it must return; those are different quantities (a diffraction cutoff and a Gaussian FWHM), and adding the thermal term in quadrature gives 0.275 Å, matching nothing. Also: two of the six inputs the panel asks the reader to carry through (dose, DQE) enter no equation in the law. Either write a law whose two stated checks pass, or stop calling it a law.

5. **The decorative citations.** Erni, Malm & O'Keefe and Busch appear in Part 1's source list and nowhere in Part 1's idea, demo, closed form or surprise. Same for Ochner in Part 3, and Hÿtch & Stobbs, Peng and Noble et al. in Part 4 — Noble is about particles adsorbing to the air–water interface, which has no bearing on a thermal-blur part at all. Nine sources are carried as ballast. Cut them or use them; Erni in particular is the only Cs-corrected data point in the whole set and the capstone needed it (see gaps).

### Gaps

1. **Part 1 closed form (3): α_opt = 1.41(λ/Cs)^(1/4) = 9.4 mrad contradicts the demo it describes.** The demo sweeps the quadrature sum of 0.61λ/α and Cs·α³. Minimizing that gives α = (0.61λ/(√3·Cs))^(1/4) = 0.770(λ/Cs)^(1/4) = 5.13 mrad, not 9.4 mrad. At the chart's own 9.4 mrad that curve reads d = 8.38 Å, not 1.95 Å; at the true minimum it reads 2.70 Å. The demo's swept minimum cannot land on the stated closed form, so the assert fails on the first run. Whatever textbook the 1.41 comes from, it is not this blur-disc convention, and no source in the list gives α_opt at all.

2. **Part 1 closed form (4): the wave-optic constant is back-fitted, and the 'two derivations agree to the digit' claim is false.** With χ/π = −1.2c² + 0.5c⁴ (Scherzer defocus, c = k·Cs^(1/4)λ^(3/4)), the only real zero is c = √2.4 = 1.5492, giving 1/k₁ = 0.6455·Cs^(1/4)λ^(3/4) and a passband edge at 10.32 mrad. The chart's 1.51 → 0.66 → 10.1 mrad is the value required to make the wave-optic answer equal Scherzer's 0.66, chosen backwards. (Note also χ_min = −0.72π, so there is no second zero to appeal to.) The honest statement is that the ray-optic optimum and the wave-optic passband edge differ by ~9%, which is a more interesting thing to show the reader than a manufactured identity.

3. **'Wikipedia's 0.1 nm at 300 kV' — Wikipedia states no accelerating voltage.** The quoted lead sentence gives 0.1 nm and nothing else. The voltage is the chart's, and it is the sole reason d/λ = 50.8 and the inversion lands at 9.84 mrad. Every 'within 3%' and 'within 2%' in Part 1 and the capstone inherits this unsourced choice.

4. **'the standard uncorrected point resolution' for Cs = 1 mm.** No source in the list gives a Cs value for any instrument. Cs = 1 mm is the input that produces 1.95 Å, 9.4 mrad and 10.1 mrad — the three numbers Part 1's whole argument turns on.

5. **The 0.61 Rayleigh coefficient and the Cs·α³ blur-disc form have no source.** Scherzer 1936 is metadata-only (the chart's own note forbids attributing wording or numbers to it); Scherzer 1949 is abstract-only, and the source entry's verification says only that a 532-character abstract was read — it does not confirm that χ(k), Δf = −1.2(Csλ)^(1/2) or d = 0.66Cs^(1/4)λ^(3/4) appear there. Part 1's source line asserts '[abstract read; χ(k), Scherzer defocus, d = 0.66 Cs^¼λ^¾]', which claims more than the verification supports. Abbe 1873 is also metadata-only and does not supply 0.61.

6. **'a 67° oil-immersion cone drawn to scale'** requires n = 1.515–1.518 for immersion oil, which is stated nowhere. Related: the chart computes 240 nm for the glass objective and never reconciles it with the 200 nm in the misconception it is correcting.

7. **'Every atomic-resolution phase-contrast image ever published is produced by deliberately introducing a defect — defocus.'** Universal quantifier, no source, and contradicted by this wing's own Part 3 (ptychography recovers phase without a defocus-beating scheme) and by negative-Cs and HAADF imaging, both present in the source list.

8. **Gold's displacement threshold, '~36 eV'.** No source. The 1.38 MeV headline of Part 2's surprise ('cannot move a gold atom below 1.4 MV') rests entirely on it. The arithmetic checks out; the input does not exist in the list.

9. **Part 2 closed form (6): '0.34 / 0.47 / 0.48' are mis-slotted.** They are printed in the same 0 / 0.5 / 1.0 × Nyquist format as the three lines above them, but per the McMullan 2014 source entry they are DQE(0) values for three *different detectors* (DE-20, Falcon II, K2). Read as written they describe a detector whose DQE rises with spatial frequency, which is impossible. A reader building the panel from this line will build it wrong.

10. **Part 2's knock-on 'crossing point' is a disagreement presented as a check.** The chart computes an onset of 99.8–105.5 keV and sets it 'against Meyer et al.'s measured 80–100 kV onset (erratum applied)' — the computed band sits entirely above the measured one and does not overlap it. Meyer is abstract-only, and its own source note says the cross sections are unverified and the erratum must be applied before printing any number. 'Erratum applied' implies a reconciliation nothing in the source list performs.

11. **Part 3 closed form (2) is not a closed form.** 'Recovered aberration coefficients must equal the injected ones within the reconstruction's stated error' — no error is stated, and the test presupposes a converging in-page iterative ptychographic solver. There is no assert to write until someone fixes a tolerance and the solver exists.

12. **Part 3 closed form (5) is a research reproduction, not a check.** Matching PRISM against conventional multislice at 0.86 / 2.8 / 21 pm on a 7 nm Pt decahedron over 360 refitted peaks is weeks of work with no pass/fail tolerance given (does 0.9 pm pass?). Same for the Pendellösung and reciprocity tests in (3): well-posed in principle, but each requires a validated multislice engine before the first assertion runs.

13. **Part 4 closed form (6) has no fixture and no tolerance.** 'HAADF intensities normalised to the incident beam must match frozen-phonon multislice with no fitting parameter for SrTiO₃ up to 120 nm' — the experimental intensities are not in the source list, 'match' is undefined, and frozen-phonon multislice to 120 nm is not an afternoon.

14. **Part 4 closed form (4) has nothing to check against.** 'B = 0.75 Å², a number the reader checks against tabulated DWFs' — no Debye-Waller table for PrScO₃ (or any perovskite) is in the source list. Peng et al. supplies absorptive factors for 17 *zinc-blende* materials.

15. **Part 2's perovskite trap has no closed form at all.** 'Raising kV makes panel A worse and the specimen better, and cooling makes it worse still' is a qualitative inversion; Chen et al. 2020 supports the direction and supplies no damage model, so nothing in the panel can be asserted numerically.

16. **Part 3's bias check has no criterion.** 'Runs a gold-standard FSC on genuinely independent half-sets to catch it' — no threshold (0.143? 0.5?) is specified, so the demo cannot report pass or fail.

17. **Chen's Abbe resolution is an upper bound used as a point.** The source says 'better than 0.15 ± 0.01 Å'. Part 3 tabulates it as 0.15 Å to get ratio 7.62 and θ = 65.6 mrad, and the capstone then quotes 63 mrad as the modern angle. A bound cannot anchor a cluster.

18. **Nguyen's 0.44 Å carries Part 3's surprise but is missing from Part 3's ratio table, and its accelerating voltage appears nowhere in the sources.** The one result the chart calls out as most striking is the one it declines to test against its own relation.

19. **Capstone: 'θ: 10 mrad → 25 → 63' — the 25 has no source.** Haider 1998 is metadata-only and the chart's own note says quote no numbers to it. The only Cs-corrected datum in the entire source list is Erni's 47 pm at 300 keV, which inverts to 20.9 mrad, not 25 — and Erni is cited in Part 1 and used nowhere. 'Break the lens's rotational symmetry and θ roughly doubles' is likewise unsourced. 'The entire computational era is that one factor of six' is arithmetic on two numbers, one of which is invented and one of which is derived from an upper bound.

20. **Capstone: 'the wavelength cancels out of it' is a tautology in the first half and false in the second.** λ cancels from d/λ = 1/(2θ) by construction — that is not a discovery about microscopes, it is division. And once the thermal term is added in quadrature against an absolute length, d/λ *does* depend on λ, so the capstone's central claim does not survive its own law.

21. **Part 4: 'has never been below about seven'** — universal claim over the field's history, no source.

22. **Part 1: 'a Cs-corrected column' is listed as one of four published points the reader drags onto the curve, with no number attached and no source giving one.**

---

## Sources

64 sources survived dedup and verification. 20 were read in full.

- Ruska, E. "The development of the electron microscope and of electron microscopy." Nobel Lecture, 8 December 1986; published in Reviews of Modern Physics 59(3):627–638, July 1987. — DOI 10.1103/RevModPhys.59.627 — full
- Busch, H. "Berechnung der Bahn von Kathodenstrahlen im axialsymmetrischen elektromagnetischen Felde." Annalen der Physik 386(25):974–993, 1926. — DOI 10.1002/andp.19263862507 — metadata-only
- Busch, H. "Über die Wirkungsweise der Konzentrierungsspule bei der Braunschen Röhre." Archiv für Elektrotechnik 18(6):583–594, November 1927. — DOI 10.1007/BF01656203 — metadata-only
- Knoll, M. and Ruska, E. "Beitrag zur geometrischen Elektronenoptik. I." Annalen der Physik 404(5):607–640, 1932 (Part II: 404(6):641–661); submitted 10 September 1931. — DOI 10.1002/andp.19324040506 — metadata-only
- Knoll, M. and Ruska, E. "Das Elektronenmikroskop." Zeitschrift für Physik 78(5–6):318–339, 1932; submitted 16 June 1932. — DOI 10.1007/BF01342199 — metadata-only
- Ruska, E. "Über ein magnetisches Objektiv für das Elektronenmikroskop." Zeitschrift für Physik 89(1–2):90–128, 1934; submitted 5 March 1934 (TH Berlin dissertation submitted 31 August 1933). — DOI 10.1007/BF01333236 — metadata-only
- Ruska, E. "Über Fortschritte im Bau und in der Leistung des magnetischen Elektronenmikroskops." Zeitschrift für Physik 87(9–10):580–602, 1934; submitted 12 December 1933. — DOI 10.1007/BF01333326 — metadata-only
- Marton, L. "Electron Microscopy of Biological Objects." Nature 133(3372):911, 16 June 1934. — DOI 10.1038/133911b0 — metadata-only
- Scherzer, O. "Über einige Fehler von Elektronenlinsen." Zeitschrift für Physik 101(9–10):593–603, 1936. — DOI 10.1007/BF01349606 — metadata-only
- von Ardenne, M. "Das Elektronen-Rastermikroskop. Theoretische Grundlagen." Zeitschrift für Physik 109(9–10):553–572, September 1938. — DOI 10.1007/BF01341584 — metadata-only
- Knoll, M. "Aufladepotentiel und Sekundäremission elektronenbestrahlter Körper." Zeitschrift für technische Physik 16:467–475, 1935. — DOI none — metadata-only
- McMullan, D. "An improved scanning electron microscope for opaque specimens." Proceedings of the IEE – Part II: Power Engineering 100(75):245–256, June 1953. — DOI 10.1049/pi-2.1953.0095 — metadata-only
- Smith, K.C.A. and Oatley, C.W. "The scanning electron microscope and its fields of application." British Journal of Applied Physics 6(11):391–399, November 1955. — DOI 10.1088/0508-3443/6/11/304 — abstract
- Rüdenberg, R. "The Early History of the Electron Microscope." Journal of Applied Physics 14(8):434–436, August 1943. — DOI 10.1063/1.1715011 — metadata-only
- van Gorkom, J., van Delft, D. and van Helvoort, T. "The Early Electron Microscopes: A Critical Study." Advances in Imaging and Electron Physics, vol. 205, pp. 1–137, Elsevier, 2018 (P.W. Hawkes, ed.). — DOI 10.1016/bs.aiep.2018.01.001 — metadata-only
- de Broglie, L. "Recherches sur la théorie des quanta." Thèse, Paris: Masson & Cie, 1924; Annales de Physique (10th ser.) 3:22–128, 1925. — DOI 10.1051/anphys/192510030022 — metadata-only
- Abbe, E. "Beiträge zur Theorie des Mikroskops und der mikroskopischen Wahrnehmung." Archiv für Mikroskopische Anatomie 9(1):413–468, December 1873. — DOI 10.1007/BF02956173 — metadata-only
- McMullan, G., Chen, S., Henderson, R. & Faruqi, A. R. Detective quantum efficiency of electron area detectors in electron microscopy. Ultramicroscopy 109(9), 1126–1143 (2009). — DOI 10.1016/j.ultramic.2009.04.002 — full
- Ruskin, R. S., Yu, Z. & Grigorieff, N. Quantitative characterization of electron detectors for transmission electron microscopy. Journal of Structural Biology 184(3), 385–393 (2013). — DOI 10.1016/j.jsb.2013.10.016 — full
- Li, X., Mooney, P., Zheng, S., Booth, C. R., Braunfeld, M. B., Gubbens, S., Agard, D. A. & Cheng, Y. Electron counting and beam-induced motion correction enable near-atomic-resolution single-particle cryo-EM. Nature Methods 10(6), 584–590 (2013). — DOI 10.1038/nmeth.2472 — full
- McMullan, G., Faruqi, A. R., Clare, D. & Henderson, R. Comparison of optimal performance at 300 keV of three direct electron detectors for use in low dose electron microscopy. Ultramicroscopy 147, 156–163 (2014). — DOI 10.1016/j.ultramic.2014.08.002 — full
- Hart, J. L., Lang, A. C., Leff, A. C., Longo, P., Trevor, C., Twesten, R. D. & Taheri, M. L. Direct Detection Electron Energy-Loss Spectroscopy: A Method to Push the Limits of Resolution and Sensitivity. Scientific Reports 7, 8243 (2017). — DOI 10.1038/s41598-017-07709-4 — full
- Guo, H., Franken, E., Deng, Y., Benlekbir, S., Singla Lezcano, G., Janssen, B., Yu, L., Ripstein, Z. A., Tan, Y. Z. & Rubinstein, J. L. Electron-event representation data enable efficient cryoEM file storage with full preservation of spatial and temporal resolution. IUCrJ 7(5), 860–869 (2020). — DOI 10.1107/S205225252000929X — full
- Agarwal, A., Simonaitis, J. & Berggren, K. K. Image-histogram-based secondary electron counting to evaluate detective quantum efficiency in SEM. Ultramicroscopy 224, 113238 (2021). — DOI 10.1016/j.ultramic.2021.113238 — full
- Everhart, T. E. & Thornley, R. F. M. Wide-band detector for micro-microampere low-energy electron currents. Journal of Scientific Instruments 37(7), 246–248 (1960). — DOI 10.1088/0950-7671/37/7/307 — abstract
- Tate, M. W., Purohit, P., Chamberlain, D., Nguyen, K. X., Hovden, R., Chang, C. S., Deb, P., Turgut, E., Heron, J. T., Schlom, D. G., Ralph, D. C., Fuchs, G. D., Shanks, K. S., Philipp, H. T., Muller, D. A. & Gruner, S. M. High Dynamic Range Pixel Array Detector for Scanning Transmission Electron Microscopy. Microscopy and Microanalysis 22(1), 237–249 (2016). — DOI 10.1017/S1431927615015664 — abstract
- Philipp, H. T., Tate, M. W., Shanks, K. S., Mele, L., Peemen, M., Dona, P., Hartong, R., van Veen, G., Shao, Y.-T., Chen, Z., Thom-Levy, J., Muller, D. A. & Gruner, S. M. Very-High Dynamic Range, 10,000 Frames/Second Pixel Array Detector for Electron Microscopy. Microscopy and Microanalysis 28(2), 425–440 (2022). — DOI 10.1017/S1431927622000174 — full
- H. Bethe, "Theorie der Beugung von Elektronen an Kristallen", Annalen der Physik 392(17), 55–129, 1928 — DOI 10.1002/andp.19283921704 — metadata-only
- O. Scherzer, "The Theoretical Resolution Limit of the Electron Microscope", Journal of Applied Physics 20(1), 20–29, 1949 — DOI 10.1063/1.1698233 — abstract
- J. M. Cowley and A. F. Moodie, "The scattering of electrons by atoms and crystals. I. A new theoretical approach", Acta Crystallographica 10(10), 609–619, 1957 — DOI 10.1107/S0365110X57002194 — abstract
- K. Fujiwara, "Relativistic Dynamical Theory of Electron Diffraction", Journal of the Physical Society of Japan 16(11), 2226–2238, 1961 — DOI 10.1143/JPSJ.16.2226 — abstract
- J. M. Cowley, "Image contrast in a transmission scanning electron microscope", Applied Physics Letters 15(2), 58–59, 1969 — DOI 10.1063/1.1652901 — abstract
- R. F. Loane, P. Xu and J. Silcox, "Thermal vibrations in convergent-beam electron diffraction", Acta Crystallographica Section A 47(3), 267–278, 1991 — DOI 10.1107/S0108767391000375 — abstract
- L.-M. Peng, G. Ren, S. L. Dudarev and M. J. Whelan, "Robust Parameterization of Elastic and Absorptive Electron Atomic Scattering Factors", Acta Crystallographica Section A 52(2), 257–276, 1996 — DOI 10.1107/S0108767395014371 — abstract
- M. Haider, S. Uhlemann, E. Schwan, H. Rose, B. Kabius and K. Urban, "Electron microscopy image enhanced", Nature 392(6678), 768–769, 1998 — DOI 10.1038/33823 — metadata-only
- M. J. Hÿtch and W. M. Stobbs, "Quantitative comparison of high resolution TEM images with image simulations", Ultramicroscopy 53(3), 191–203, 1994 — DOI 10.1016/0304-3991(94)90034-5 — metadata-only
- J. M. LeBeau, S. D. Findlay, L. J. Allen and S. Stemmer, "Quantitative Atomic Resolution Scanning Transmission Electron Microscopy", Physical Review Letters 100(20), 206101, 2008 — DOI 10.1103/PhysRevLett.100.206101 — abstract
- R. Erni, M. D. Rossell, C. Kisielowski and U. Dahmen, "Atomic-Resolution Imaging with a Sub-50-pm Electron Probe", Physical Review Letters 102(9), 096101, 2009 — DOI 10.1103/PhysRevLett.102.096101 — abstract
- Y. Jiang, Z. Chen, Y. Han, P. Deb, H. Gao, S. Xie, P. Purohit, M. W. Tate, J. Park, S. M. Gruner, V. Elser and D. A. Muller, "Electron ptychography of 2D materials to deep sub-ångström resolution", Nature 559(7714), 343–349, 2018 — DOI 10.1038/s41586-018-0298-5 — abstract
- C. Ophus, "A fast image simulation algorithm for scanning transmission electron microscopy", Advanced Structural and Chemical Imaging 3(1), 13, 2017 — DOI 10.1186/s40679-017-0046-1 — full
- Z. Chen, Y. Jiang, Y.-T. Shao, M. E. Holtz, M. Odstrčil, M. Guizar-Sicairos, I. Hanke, S. Ganschow, D. G. Schlom and D. A. Muller, "Electron ptychography achieves atomic-resolution limits set by lattice vibrations", Science 372(6544), 826–831, 2021 — DOI 10.1126/science.abg2533 — full
- A. Bangun, O. Melnyk and B. März, "Eigenstructure Analysis of Bloch Wave and Multislice Formulations for Dynamical Scattering in Transmission Electron Microscopy", arXiv:2412.21119 (v1 30 Dec 2024, v2 10 Dec 2025); preprint, no journal version — DOI 10.48550/arXiv.2412.21119 — abstract
- Meyer JC, Eder F, Kurasch S, Skakalova V, Kotakoski J, Park HJ, Roth S, Chuvilin A, Eyhusen S, Benner G, Krasheninnikov AV, Kaiser U. Accurate Measurement of Electron Beam Induced Displacement Cross Sections for Single-Layer Graphene. Physical Review Letters 108(19), 196102, 2012. — DOI 10.1103/PhysRevLett.108.196102 — abstract
- Meyer JC, Eder F, Kurasch S, Skakalova V, Kotakoski J, Park HJ, Roth S, Chuvilin A, Eyhusen S, Benner G, Krasheninnikov AV, Kaiser U. Erratum: Accurate Measurement of Electron Beam Induced Displacement Cross Sections for Single-Layer Graphene [Phys. Rev. Lett. 108, 196102 (2012)]. Physical Review Letters 110(23), 239902, 2013. — DOI 10.1103/PhysRevLett.110.239902 — metadata-only
- Chirita Mihaila AI, Susi T, Kotakoski J. Influence of temperature on the displacement threshold energy in graphene. Scientific Reports 9, 12981, 2019. — DOI 10.1038/s41598-019-49565-4 — full
- Tanuma S, Powell CJ, Penn DR. Calculation of electron inelastic mean free paths (IMFPs) VII. Reliability of the TPP-2M IMFP predictive equation. Surface and Interface Analysis 35(3), 268–275, 2003. — DOI 10.1002/sia.1526 — abstract
- Grant T, Grigorieff N. Measuring the optimal exposure for single particle cryo-EM using a 2.6 Å reconstruction of rotavirus VP6. eLife 4, e06980, 2015. — DOI 10.7554/eLife.06980 — full
- Rice WJ, Cheng A, Noble AJ, Eng ET, Kim LY, Carragher B, Potter CS. Routine determination of ice thickness for cryo-EM grids. Journal of Structural Biology 204(1), 38-44, 2018. — DOI 10.1016/j.jsb.2018.06.007 — abstract
- Brown HG, Hanssen E. MeasureIce: accessible on-the-fly measurement of ice thickness in cryo-electron microscopy. Communications Biology 5(1), 817, 2022. — DOI 10.1038/s42003-022-03698-x — full
- Ni H-C, Busch R, Zuo J-M. PyExtal: a Python package for quantitative convergent-beam electron diffraction. Journal of Applied Crystallography 59(2), 687-699, 2026. — DOI 10.1107/S1600576726001469 — full
- Kuzyk C, Dimitrakopoulos A, Nojeh A. Concept and demonstration of a low-cost compact electron microscope enabled by a photothermionic carbon nanotube cathode. Nature Communications 16, 8067 (2025). — DOI 10.1038/s41467-025-63413-2 — full
- Blackburn AM, Cordoba C, Fitzpatrick MR, McLeod RA. Sub-ångström resolution ptychography in a scanning electron microscope at 20 keV. Nature Communications 16, 8977 (2025). — DOI 10.1038/s41467-025-64133-3 — full
- Nguyen KX, Jiang Y, Lee C-H, Kharel P, Zhang Y, van der Zande AM, Huang PY. Achieving sub-0.5-angstrom-resolution ptychography in an uncorrected electron microscope. Science 383(6685):865-870 (2024). — DOI 10.1126/science.adl2029 — abstract
- McMullan G, Naydenova K, Mihaylov D, Yamashita K, Peet MJ, Wilson H, Dickerson JL, Chen S, Cannone G, Lee Y, Hutchings KA, Gittins O, Sobhy MA, Wells T, El-Gomati MM, Dalby J, Meffert M, Schulze-Briese C, Henderson R, Russo CJ. Structure determination by cryoEM at 100 keV. Proceedings of the National Academy of Sciences 120(49):e2312905120 (2023). — DOI 10.1073/pnas.2312905120 — abstract
- Venugopal H, Mobbs J, Taveneau C, Fox DR, Vuckovic Z, Gulati S, Knott G, Grinter R, Thal D, Mick S, Czarnik C, Ramm G. High-resolution cryo-EM using a common LaB6 120-keV electron microscope equipped with a sub-200-keV direct electron detector. Science Advances 11(1):eadr0438 (2025). — DOI 10.1126/sciadv.adr0438 — abstract
- Ochner H, Szilagyi S, Abb S, Gault J, Robinson CV, Malavolti L, Rauschenbach S, Kern K. Low-energy electron holography imaging of conformational variability of single-antibody molecules from electrospray ion beam deposition. Proceedings of the National Academy of Sciences 118(51):e2112651118 (2021). — DOI 10.1073/pnas.2112651118 — abstract
- Krysztof M. Field-emission electron gun for a MEMS electron microscope. Microsystems & Nanoengineering 7, 43 (2021). — DOI 10.1038/s41378-021-00268-9 — abstract
- D. Van Dyck, "Persistent misconceptions about incoherence in electron microscopy," Ultramicroscopy 111(7), 894-900, 2011. — DOI 10.1016/j.ultramic.2011.01.007 — abstract
- J.-O. Malm and M. A. O'Keefe, "Deceptive 'lattice spacings' in high-resolution micrographs of metal nanoparticles," Ultramicroscopy 68(1), 13-23, 1997. — DOI 10.1016/S0304-3991(97)00005-3 — metadata-only
- A. J. Noble, V. P. Dandey, H. Wei, J. Brasch, J. Chase, P. Acharya, Y. Z. Tan, Z. Zhang, L. Y. Kim, G. Scapin, M. Rapp, E. T. Eng, W. J. Rice, A. Cheng, C. J. Negro, L. Shapiro, P. D. Kwong, D. Jeruzalmi, A. des Georges, C. S. Potter, and B. Carragher, "Routine single particle CryoEM sample and grid characterization by tomography," eLife 7, e34257, 2018. — DOI 10.7554/eLife.34257 — abstract
- R. Henderson, "Avoiding the pitfalls of single particle cryo-electron microscopy: Einstein from noise," Proceedings of the National Academy of Sciences USA 110(45), 18037-18041, 2013. — DOI 10.1073/pnas.1314449110 — full
- P. Rez, L. Houben, S. Seifer, and M. Elbaum, "Contrast by electron microscopy in thick biological specimens," Journal of Microscopy 300(3), 341-355, 2025. — DOI 10.1111/jmi.70026 — full
- S. Chen, Y. Zhang, J. Zhao, Z. Mi, J. Zhang, J. Cao, J. Feng, G. Zhang, J. Qi, J. Li, and P. Gao, "Transmission electron microscopy of organic-inorganic hybrid perovskites: myths and truths," Science Bulletin 65(19), 1643-1649, 2020. — DOI 10.1016/j.scib.2020.05.020 — full
- D. E. Newbury and N. W. M. Ritchie, "Is scanning electron microscopy/energy dispersive X-ray spectrometry (SEM/EDS) quantitative?," Scanning 35(3), 141-168, 2013 (published online 9 August 2012). — DOI 10.1002/sca.21041 — abstract
