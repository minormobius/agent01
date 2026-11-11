<!-- Paper 1's prior-art search, 2026-11-11: what was searched, what was found, and the verdict on each novelty claim. The paper's text was changed to match (journal entry of the same date); the references added are in refs.json with status index. -->

# Prior-art check: paper 1 (4D periodic table, pinned 1/r)

I read refs.json (73 entries) first. Nothing below repeats a cited work. "Verified" means I fetched the abstract or Crossref record myself.

## 1. Intro: "first shell-resolved self-consistent survey … Z = 140 in 4D" and "nobody has asked what 1/r does"

**Closest peer-reviewed work found (all uncited):**
- F. J. Asturias & S. R. Aragón, "The hydrogenic atom and the periodic table of the elements in two spatial dimensions", *Am. J. Phys.* 53, 893–899 (1985), doi:10.1119/1.14360 (verified). A 2D table built from hydrogenic filling. It predates Pyykkö 1991 and Négadi & Kibler 1996, and Négadi compares against it.
- F. Burgbacher, C. Lämmerzahl & A. Macías, "Is there a stable hydrogen atom in higher dimensions?", *J. Math. Phys.* 40, 625–634 (1999), doi:10.1063/1.532679 (verified). Compares the Gauss-law potential with 1/r for hydrogen in D dimensions. It is the closest work to asking "what the choice of law does", but for one electron only.
- F. Caruso, J. Martins & V. Oguri, "On the existence of hydrogen atoms in higher dimensional Euclidean spaces", *Phys. Lett. A* 377, 694 (2013), doi:10.1016/j.physleta.2013.01.026, arXiv:1205.3740 (verified). Numerov solution with 1/r^(D−2) for 5 ≤ D ≤ 10. It **claims bound states exist**, which contradicts Tangherlini, and a referee may raise it.
- M. Bureš & P. Siegl, "Hydrogen atom in space with a compactified extra dimension and potential defined by Gauss' law", *Ann. Phys.* 354, 316 (2015), doi:10.1016/j.aop.2014.12.017. Also M. Bureš, *Ann. Phys.* 363, 354 (2015), doi:10.1016/j.aop.2015.10.004 (both verified via Crossref). Hydrogen on R³×S¹. These bear on the paper's route 5 / §2.2.

**Non-peer-reviewed, listed separately:**
- "Hqak" (wxyhly), "Four-Dimensional World (XI): The Periodic Table", blog, 17 Jan 2025, revised Apr/May 2025. https://wxyhly-en.github.io/archives/elem4d. Qualitative only. It explicitly *ignores* the force law, assumes **four** spin states (s4, p16, d36, f64; 396 elements) and does no SCF. Its 2025 correction notes another blog proposing two left-isoclinic spin states.
- 4Denthusiast, *Alternative Chemistries* blog, 2022–2025. https://blog.4denthusiast.net/. This is a 4D QED worldbuild. It keeps **Gauss's 1/r²** and stabilises atoms with an invented short-range repulsive "s-force". It runs diffusion Monte Carlo for H, H₂, He only, with no table and nothing on Hund's rule. It is the nearest hobby project, and it uses a different law.
- Others: a Higher Space forum table, a Codidact Q&A (403, unread), W. Harris's Substack (2024, no physics), and H. Lalvani's "4D-cubic lattice" (*Found. Chem.* 2019), which arranges *our* elements on a 4D lattice and has no 4D physics. Egan's *Orthogonal* is 3+1 Riemannian, not four spatial dimensions. I found no Baez post on 4D atoms.

**Verdict: not found** for a many-electron, self-consistent 4D table. The second sentence is **partly anticipated**, because Burgbacher et al. and Caruso et al. asked what the law does to *hydrogen*.

**Suggested changes:**
- Narrow the second sentence to "…what the choice of 1/r itself does to *many-electron* atoms". Cite Burgbacher 1999 next to Tangherlini, and acknowledge Caruso 2013's dissenting claim.
- Optionally add Asturias & Aragón 1985 beside Pyykkö.
- Cite Bureš & Siegl 2015 in §2.2.

## 2. §4.1: "the rows the generalized Madelung rule of Négadi 1996 gives in four dimensions"

I fetched arXiv:atom-ph/9512001. Négadi & Kibler state the rule for arbitrary D ≥ 2 and tabulate **only D = 2 and D = 3**. They never write out the D = 4 rows, and they mention no spin structure beyond "SU(2) as for D = 3". I found no self-consistent check of the D = 4 rows anywhere.

**Verdict: not found.** The confirmation looks new, but the attribution is slightly loose.

**Suggested change:** "the rows that Négadi & Kibler's generalized Madelung rule gives when applied to D = 4 (they tabulate only D = 2 and 3)". The intro's "applied to four, it gives…" is already accurate.

## 3. §5: 4D breaks Hund's first rule (d², d¹⁶ singlet in (2,0)⊕(0,2); 4f³/4f²⁹)

**Closest work found:**
- J. D. Morgan III & W. Kutzelnigg, "Hund's rules, the alternating rule, and symmetry holes", *J. Phys. Chem.* 97, 2425–2434 (1993), doi:10.1021/j100112a051 (verified). An analysis of Hund's rules through the interelectronic angle ("symmetry holes"), including cases where the rules fail. It is the natural 3D precedent for the paper's ⟨cos²γ⟩ argument and should be cited in §5.2.
- R. Pauncz & J. Katriel, "Theoretical interpretations of Hund's rule", *Adv. Quantum Chem.* 10, 143–185 (1977). Volume and pages are confirmed from citing references; there is no DOI and I did not read the text (UNVERIFIED).
- Herrick–Stillinger's interdimensional degeneracies (already cited as herrick1975) map spin labels between D = 3 and D = 5 for two electrons. They make no Hund statement about D = 4.
- Sako et al. (cited) cover 2D only.

I found nothing on term structure or Racah algebra for SO(4) open shells, and no singlet ground term for d² in any D.

**Verdict: not found.**

**Suggested change:** none to the claim. Add Morgan & Kutzelnigg 1993 where §5.2 says "the usual reason for Hund's rule". It refines exactly that usual reason, and a referee who knows it will expect it.

## 4. §7: shell theorem fails, far field −Q/(8R³), permanent −3Q_AQ_B/(64R⁵) attraction

**Closest work found:**
- A. K. Tse, O. M. Markowich & T. V. Phan, "Generalizing the Shell Theorem to Constant Curvature Spaces in All Dimensions and Topologies", *Gravit. Cosmol.* 32, 383–389 (2026), doi:10.1134/S0202289326700180, arXiv:2511.20852 (verified). It proves that in flat Rⁿ only φ = A r^(2−n) + B r² + C has the shell property. This gives the paper a citable statement that 1/r in 4D lacks it. The 3D antecedent is Gurzadyan's theorem (*Observatory* 105, 42, 1985), UNVERIFIED.
- The Cavendish/Maxwell null test is the classical use of the shell theorem's failure under a non-harmonic law: E. R. Williams, J. E. Faller & H. A. Hill, *PRL* 26, 721 (1971), doi:10.1103/PhysRevLett.26.721; L.-C. Tu, J. Luo & G. T. Gillies, "The mass of the photon", *Rep. Prog. Phys.* 68, 77 (2005), doi:10.1088/0034-4885/68/1/R02 (both verified).
- N. S. Landkof, *Foundations of Modern Potential Theory* (Springer 1972), doi:10.1007/978-3-642-65183-0 (verified). The standard source showing that Riesz kernels of order α > 2 are not superharmonic. 1/r in 4D is α = 3.

I found nothing computing a neutral atom's far field or a dispersion-free R⁻⁵ pull between closed-shell atoms under a non-harmonic law, in 4D or otherwise. Searches on Riesz gases (Lewin 2022, already cited) found only repulsive, jellium-neutralised systems.

**Verdict: not found** for the result. The mechanism is classical.

**Suggested change:** in §2.4, cite Tse et al. 2026 (with Landkof) for "only the harmonic kernel has the shell theorem". Optionally add one line that the same failure is what Cavendish-type tests of Coulomb's law look for.

## 5. App. F.5: lens vacuum, ε = ε₀ℓk, μ = μ₀/(ℓk)

**Closest work found:**
- **ε growing linearly with k is well known in 2D materials.** The Rytova–Keldysh potential corresponds to ε(q) = ε(1 + r₀q). See P. Cudazzo, I. V. Tokatly & A. Rubio, *PRB* 84, 085406 (2011), doi:10.1103/PhysRevB.84.085406 (verified), and L. V. Keldysh, *JETP Lett.* 29, 658 (1979) (reprint verified, original UNVERIFIED). This is a physical realisation of half the pair. It is worth one clause next to Tarasov.
- **εμ = const keeps the vacuum dispersion and Lorentz form for constant ε, μ.** J. Lasa-Alonso & G. Molina-Terriza, "Lorentz invariant materials and metamaterials", arXiv:2506.20784 (2025), preprint (verified). The lens vacuum is the k-dependent version, which is why it keeps c but loses Lorentz invariance.
- Nonlocal form-factor gauge theories, e.g. D. Evens, J. W. Moffat, G. Kleppe & R. P. Woodard, *PRD* 43, 499 (1991), doi:10.1103/PhysRevD.43.499 (verified). These smear in □, not |k|, so they are a different construction.

I did not find the pair ε ∝ k, μ ∝ 1/k anywhere.

**Verdict: not found** for the pair. Each half has precedent.

**Suggested change:** keep the sentence, and add "a permittivity linear in k is the Rytova–Keldysh screening of thin films [Cudazzo 2011]; a constant εμ = ε₀μ₀ is the condition for a Lorentz-covariant isotropic medium [Lasa-Alonso 2025]".

## 6. App. F.6: Pauli exclusion from the Dirac equation plus energy bounded below, with an instantaneous non-local force

**Closest work found:**
- J. Bain, *CPT Invariance and the Spin–Statistics Connection* (OUP 2016). Chapters "…in Non-Relativistic Quantum Field Theories", doi:10.1093/acprof:oso/9780198728801.003.0004, and "Non-RQFT Derivations…", doi:10.1093/acprof:oso/9780198728801.003.0005 (Crossref verified, text unread). It is a survey of exactly which assumptions each half needs, including derivations without locality or Lorentz invariance. It is the best single citation for the paper's "two halves" framing.
- B. Lian, "The cornerstone of spin statistics connection: the SU(2)×C×T symmetry", arXiv:1208.2744 (2012), preprint (verified). Derives spin-statistics without Lorentz invariance from rotations, C, T and a positive Hamiltonian, whenever E(p) has a square-root (Dirac-like) dispersion. This is close to the paper's half.
- E. C. G. Sudarshan, *Proc. Indian Acad. Sci. A* 67, 284 (1968), doi:10.1007/BF03049366 (verified). An early non-relativistic, SU(2)-based proof.
- M. Chaichian, K. Nishijima & A. Tureanu, *Phys. Lett. B* 568, 146 (2003), doi:10.1016/j.physletb.2003.06.009 (verified). Spin-statistics survives in nonlocal (noncommutative) QFT. Greenberg, *PRL* 89, 231602 (2002), arXiv:hep-ph/0201258, is about CPT and nonlocality, not this argument.
- For the trial-state collapse: F. J. Dyson, *J. Math. Phys.* 8, 1538 (1967), doi:10.1063/1.1705389, on bosonic charged matter (verified). G. E. Brown & D. G. Ravenhall, *Proc. R. Soc. A* 208, 552 (1951), doi:10.1098/rspa.1951.0181, on interacting electrons dissolving into the negative continuum (verified).
- Note that Coulomb-gauge QED already has an instantaneous non-local Coulomb term and the standard Dirac-sea energy argument still goes through. A referee may point this out.

**Verdict: partly anticipated.** The logical split, and the claim that the half-integer half needs no locality, are in Pauli 1940, Bain 2016 and Lian 2012. The explicit 4+1 trial-state bound under the pinned 1/r appears new.

**Suggested change:** "Pauli's exclusion follows from the half of the spin-statistics theorem that needs only the Dirac equation and a Hamiltonian bounded below [Pauli 1940; Sudarshan 1968; Bain 2016, ch. 4–5; Lian 2012]; we make Pauli's energy argument explicit for the pinned law with a trial state." Cite Dyson 1967 or Brown–Ravenhall at step 3.

## Search log and limits

**Web searches** (standard, and extended where noted): 4D/higher-D periodic table with HF/DFT (extended); "four spatial dimensions" atoms 1/r; Caruso/Oguri; Burgbacher; 4D hobby tables; Egan, Baez and Orthogonal; Hund's rule in D dimensions (extended, twice); the large-D Hund / Herschbach–Loeser school (extended); TFD/DFT in arbitrary dimension (extended); D-dimensional HF for Li/Be/Ne (extended); shell theorem in higher dimensions / Riesz (extended); neutral-atom long-range forces / Riesz gas; Tarasov multipoles; ε ∝ k with μ ∝ 1/k (extended, twice); Lorentz-invariant media; spin-statistics without Lorentz invariance or locality (extended); Greenberg on nonlocality; Katriel–Pauncz.

**Database searches:** arXiv API (7 abstract queries), OpenAlex (7, mostly empty returns), Semantic Scholar (rate-limited after one query), Crossref (about 20 lookups for verification).

**Not accessed:**
- Google Scholar, INSPIRE and ADS directly.
- The Codidact thread (HTTP 403).
- Full texts of Kventsel & Katriel, Loeser 1987, Morgan–Kutzelnigg, Bain, Tarasov 2013 and Pauncz–Katriel.

Recall for non-English literature (Russian, Chinese) and conference proceedings is weak. The "not found" verdicts mean "not found by these searches", not "does not exist".
