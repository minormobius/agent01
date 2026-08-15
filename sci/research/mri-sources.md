# MRI — canonical sources

Literature scan for the first `sci` instrument breakdown (`sci.mino.mobi/mri`).
**No explainer is written yet.** This file is the source list we draw from, plus
the one answer that motivated the page.

Every entry says *what it gives us* — a number to put on the page, a mechanism
to animate, or a claim we would otherwise get wrong. Entries marked
**[unverified]** were not read in full from this sandbox (paywall); citation
metadata was confirmed from at least two independent indexes, but the content
summary comes from abstracts and secondary sources and must be checked against
the paper before anything is asserted on the page.

---

## 0. The question: what is the sensor?

**A tuned coil of wire.** That is the whole answer, and it is a much stranger
answer than it sounds.

The receive coil is an **LC resonator** — an inductor (the loop, or a birdcage,
or one element of an array) with capacitors that tune it to the Larmor
frequency and match it to 50 Ω. The precessing transverse nuclear magnetisation
of the sample is a rotating magnetic dipole distribution; by **Faraday's law**
it induces an EMF in that loop. The coil is not a transducer of anything
exotic. It is an antenna in the same sense a crystal-radio loop is an antenna,
detecting a signal of order nanovolts–microvolts. Four consequences, each of
which is a page section waiting to be written:

1. **It is not radio waves.** At 1.5 T the Larmor frequency is ~64 MHz, so the
   free-space wavelength is ~4.7 m — the sample and the coil sit deep in the
   **near field**. The coupling is magnetic induction, not radiation. Hoult has
   argued this in print for thirty years and the misconception is still in most
   textbooks (§2, Hoult 1989 / 2009). Getting this right is the single biggest
   pedagogical differentiator available to this page.
2. **The sensor has no spatial resolution whatsoever.** One coil integrates the
   whole sample into one time-varying voltage. Every bit of spatial information
   in an MR image comes from the *gradients* modulating precession frequency and
   phase during that readout — the image is a Fourier transform of a voltage
   trace, not a projection onto a detector array. **An MRI is a one-pixel
   camera.** (The one nuance: modern arrays *do* carry spatial information in
   their sensitivity profiles, and parallel imaging is exactly the exploitation
   of it — §5.)
3. **The noise is the patient, not the coil.** In a well-designed clinical coil
   the dominant noise source is thermal (Johnson) noise from random currents in
   the conductive body itself. This is why coil design is about getting *close*
   and *small*, why the loaded/unloaded Q ratio is the bench figure of merit,
   and why there is a computable ceiling on SNR that no hardware can beat
   (§2, Edelstein 1986; Ocali & Atalar 1998).
4. **Induction is not the only possible sensor,** and the alternatives reveal
   the physics. Faraday detection scales with frequency, so it collapses at low
   field — which is why ultra-low-field MRI uses **SQUIDs** or **optically
   pumped atomic magnetometers**, whose sensitivity is frequency-flat (§7).
   Field strength buys signal twice over: once through polarisation, once
   through the sensor.

Two more facts that belong on the page early, both cheap to state and both
startling:

- **The polarisation is ~ppm.** The Curie-law thermal population difference
  between spin states for protons at body temperature is of order 10⁻⁵ at
  1–1.5 T. Essentially the entire sample cancels; the image is built from the
  few-in-a-million residue. `[verify the exact figure at 1.5 T and 3 T against
  Haacke ch. 6 before printing a number]`
- **The proton gyromagnetic ratio, γ/2π = 42.58 MHz/T**, is the one constant
  the whole instrument is built around — magnet, RF, gradients, receiver
  bandwidth all follow from it.

The best single entry point for the detection chain specifically, and it is
**open access**, is Gruber et al. 2018 (§2).

---

## 1. Foundations — the resonance itself

| Source | Why it matters / what we take |
|---|---|
| **Bloch F, Hansen WW, Packard M.** *Nuclear induction.* Phys Rev 70, 460–474 (1946); and *The nuclear induction experiment*, Phys Rev 70, 474–485 (1946). [doi:10.1103/PhysRev.70.460](https://doi.org/10.1103/PhysRev.70.460) | The founding document of the *sensor*. Bloch's method was literally an induction coil picking up the precessing magnetisation — "nuclear induction" is the original and more honest name for the technique. The Bloch equations from this paper are the equations any interactive simulator on our page will integrate. **[unverified]** |
| **Purcell EM, Torrey HC, Pound RV.** *Resonance absorption by nuclear magnetic moments in a solid.* Phys Rev 69, 37–38 (1946). | The independent, simultaneous discovery, by absorption rather than induction. Bloch and Purcell shared the 1952 Nobel. Useful as the page's "two ways to see the same thing" framing device. **[unverified]** |
| **Hahn EL.** *Spin echoes.* Phys Rev 80, 580–594 (1950). [doi:10.1103/PhysRev.80.580](https://doi.org/10.1103/PhysRev.80.580) | The echo. Dephasing from field inhomogeneity is reversible; a refocusing pulse un-mixes it. This is the most animatable idea in all of MR (the runners-on-a-track picture) and the basis of T2 vs T2*. **[unverified]** |
| **Ernst RR, Anderson WA.** *Application of Fourier transform spectroscopy to magnetic resonance.* Rev Sci Instrum 37, 93–102 (1966). | Pulse-and-transform replaces slow frequency sweeping. Nobel 1991. Everything downstream is Fourier because of this. **[unverified]** |
| **Damadian R.** *Tumor detection by nuclear magnetic resonance.* Science 171, 1151–1153 (1971). [doi:10.1126/science.171.3976.1151](https://doi.org/10.1126/science.171.3976.1151) | Relaxation times differ between tissues — the claim that made a *medical* instrument conceivable. Also the centre of the field's ugliest priority dispute (Damadian was not included in the 2003 Nobel); the page should note the dispute exists without adjudicating it. |

---

## 2. The sensor and the detection chain — the core of this page

This is the section the whole instrument breakdown hangs on.

| Source | Why it matters / what we take |
|---|---|
| ⭐ **Hoult DI, Richards RE.** *The signal-to-noise ratio of the nuclear magnetic resonance experiment.* J Magn Reson 24, 71–85 (1976). [doi:10.1016/0022-2364(76)90233-X](https://doi.org/10.1016/0022-2364(76)90233-X) · [ADS](https://ui.adsabs.harvard.edu/abs/1976JMagR..24...71H/abstract) | **The** paper on MR as a detection problem, and the origin of the **principle of reciprocity**: a coil's receive sensitivity at a point equals the field it would produce at that point per unit current. That equivalence is the key that makes coil design tractable — and it is a beautiful interactive: draw a coil, get its sensitivity map for free. Also derives the SNR–frequency scaling (often quoted as ω^7/4 in the *coil-noise-dominated* regime; closer to linear once sample noise dominates — **check which regime before we print an exponent**). **[unverified]** |
| ⭐ **Hoult DI.** *The magnetic resonance myth of radio waves.* Concepts Magn Reson 1, 1–5 (1989). [doi:10.1002/cmr.1820010104](https://doi.org/10.1002/cmr.1820010104) · [PDF](https://www.mriquestions.com/uploads/3/4/5/7/34572113/hoult_1989_radio_waves_548825.pdf) | Five pages, freely mirrored, demolishing the "MRI uses radio waves" story and giving the correct classical account of transmission and reception in terms of magnetic fields alone. Directly load-bearing for §0.1. |
| **Hoult DI.** *The origins and present status of the radio wave controversy in NMR.* Concepts Magn Reson A 34A, 193–216 (2009). [doi:10.1002/cmr.a.20142](https://doi.org/10.1002/cmr.a.20142) · [PDF](https://mriquestions.com/uploads/3/4/5/7/34572113/20142_ftp.pdf) | The twenty-year sequel — history of the misconception plus the harder cases (high field, where sample size approaches the wavelength and the simple picture strains). Read this before we make any absolute claim. |
| **Hoult DI.** *The principle of reciprocity in signal strength calculations — a mathematical guide.* Concepts Magn Reson 12, 173–187 (2000). [doi](https://doi.org/10.1002/1099-0534(2000)12:4%3C173::AID-CMR1%3E3.0.CO;2-Q) | The careful derivation, including where reciprocity needs care (conductive samples, wavelength comparable to sample). Also describes a bench experiment validating it — a candidate for a "you could check this yourself" box. **[unverified]** |
| ⭐ **Gruber B, Froeling M, Leiner T, Klomp DWJ.** *RF coils: a practical guide for nonphysicists.* J Magn Reson Imaging 48(3), 590–604 (2018). [PMC6175221](https://pmc.ncbi.nlm.nih.gov/articles/PMC6175221/) · [doi:10.1002/jmri.26187](https://doi.org/10.1002/jmri.26187) | **Open access, and the best single reference for our purposes.** Covers the entire chain at exactly our altitude: EMF induction, the LC resonator (ω = 1/√(L·C_tune)), tuning and 50 Ω matching, Q = ωL/R and the loaded/unloaded ratio as the sample-noise-dominance test, low-noise preamps (~27 dB first-stage gain), active/passive decoupling, and arrays. Verified by reading. Its radio-tuning analogy is good and we should not simply copy it. |
| **Edelstein WA, Glover GH, Hardy CJ, Redington RW.** *The intrinsic signal-to-noise ratio in NMR imaging.* Magn Reson Med 3, 604–618 (1986). [doi:10.1002/mrm.1910030413](https://doi.org/10.1002/mrm.1910030413) · [PubMed 3747821](https://pubmed.ncbi.nlm.nih.gov/3747821/) | Establishes body-noise dominance: the signal from a voxel competes against thermally generated random currents *in the patient*. The reason "better coil" has a hard ceiling. **[unverified]** |
| **Ocali O, Atalar E.** *Ultimate intrinsic signal-to-noise ratio in MRI.* Magn Reson Med 39, 462–473 (1998). [doi:10.1002/mrm.1910390317](https://doi.org/10.1002/mrm.1910390317) | Computes the SNR ceiling at a point inside an arbitrary body by optimising over *all possible* EM fields — the best any coil could ever do. A gorgeous "here is the wall" graphic. **[unverified]** |
| **Hayes CE, Edelstein WA, Schenck JF, Mueller OM, Eash M.** *An efficient, highly homogeneous radiofrequency coil for whole-body NMR imaging at 1.5 T.* J Magn Reson 63, 622–628 (1985). [PDF](https://fmri.ucsd.edu/ecwong/birdcage.pdf) · [ADS](https://ui.adsabs.harvard.edu/abs/1985JMagR..63..622H/abstract) | The **birdcage** coil — the ladder-of-LC-resonators whose current distribution approximates a cosine and produces a uniform transverse field. Virtually every clinical body coil is one. A birdcage mode animation (which resonance mode gives the homogeneous field) is an obvious centrepiece graphic. PDF appears freely mirrored. |
| ⭐ **Roemer PB, Edelstein WA, Hayes CE, Souza SP, Mueller OM.** *The NMR phased array.* Magn Reson Med 16, 192–225 (1990). [doi:10.1002/mrm.1910160203](https://doi.org/10.1002/mrm.1910160203) · [PubMed 2266841](https://pubmed.ncbi.nlm.nih.gov/2266841/) | Many small coils at once: small-coil SNR over a large FOV, with the optimal combination weights derived. Reports 2–3× SNR at spine depth vs a single rectangular coil. Every 32-channel head coil descends from this. |
| **Mispelter J, Lupu M, Briquet A.** *NMR Probeheads for Biophysical and Biomedical Experiments.* Imperial College Press, 2006 (2nd ed. 2015). | The engineering bible for probe/coil construction if we need real component values for a "build the resonator" toy. Book, paywalled. **[unverified]** |
| **Elster AD.** *NMR receiver chain* and related pages, [mriquestions.com](https://mriquestions.com/receiver-chain.html) | Free, illustrated, reliable walkthrough of coil → T/R switch → LNA → mixer/filter → ADC, including the modern direct-digitisation variant. Good for getting the block diagram right; cite the primary literature for claims. |

---

## 3. Spatial encoding — how one wire makes a picture

| Source | Why it matters / what we take |
|---|---|
| ⭐ **Lauterbur PC.** *Image formation by induced local interactions: examples employing nuclear magnetic resonance.* Nature 242, 190–191 (1973). [doi:10.1038/242190a0](https://doi.org/10.1038/242190a0) | The origin of imaging: apply a gradient, and frequency becomes position. Lauterbur called it *zeugmatography*, from ζεῦγμα, "that which joins" — the joining of the two fields. Nobel 2003. **[unverified]** |
| **Mansfield P, Grannell PK.** *NMR "diffraction" in solids?* J Phys C 6, L422–L426 (1973). [doi:10.1088/0022-3719/6/22/007](https://doi.org/10.1088/0022-3719/6/22/007) | Independent and simultaneous, from the reciprocal-space side — Fourier transforms of gradient-encoded signals resolving lattice planes. The "diffraction" framing is arguably the better route into k-space for a technical audience. **[unverified]** |
| **Kumar A, Welti D, Ernst RR.** *NMR Fourier zeugmatography.* J Magn Reson 18, 69–83 (1975). | Phase encoding — the actual reconstruction method used by every scanner today, as opposed to Lauterbur's back-projection. **[unverified]** |
| **Edelstein WA, Hutchison JMS, Johnson G, Redpath T.** *Spin warp NMR imaging and applications to human whole-body imaging.* Phys Med Biol 25, 751–756 (1980). [doi:10.1088/0031-9155/25/4/017](https://doi.org/10.1088/0031-9155/25/4/017) | Spin-warp: constant-duration, variable-amplitude phase encoding — the robust practical form of the above, and what a real sequence diagram on our page should depict. **[unverified]** |
| **Twieg DB.** *The k-trajectory formulation of the NMR imaging process…* Med Phys 10, 610–621 (1983). [PDF](https://mriquestions.com/uploads/3/4/5/7/34572113/twieg-kspace.pdf) · [PubMed 6646065](https://pubmed.ncbi.nlm.nih.gov/6646065/) | **k-space, named and formalised**: gradients steer a point through spatial-frequency space; the pulse sequence is a *trajectory*. This is the single best interactive on the page — drive the gradients, watch the k-space pen move, watch the image resolve. PDF freely mirrored. |
| **Ljunggren S.** *A simple graphical representation of Fourier-based imaging methods.* J Magn Reson 54, 338–343 (1983). | The companion k-space formulation, independent of Twieg. Cite both. **[unverified]** |
| **Mansfield P.** *Multi-planar image formation using NMR spin echoes.* J Phys C 10, L55–L58 (1977). | **EPI** — traverse all of k-space in one shot. The reason fMRI and diffusion imaging exist, and the reason the scanner is so loud. **[unverified]** |

---

## 4. Sequences and contrast — why images look different

| Source | Why it matters |
|---|---|
| **Hennig J, Nauerth A, Friedburg H.** *RARE imaging: a fast imaging method for clinical MR.* Magn Reson Med 3, 823–833 (1986). [doi:10.1002/mrm.1910030602](https://doi.org/10.1002/mrm.1910030602) | Echo trains: one excitation, many phase-encoded echoes (FSE/TSE). **[unverified]** |
| **Haase A, Frahm J, Matthaei D, Hänicke W, Merboldt KD.** *FLASH imaging: rapid NMR imaging using low flip-angle pulses.* J Magn Reson 67, 258–266 (1986). | Low flip angles + gradient echoes: seconds instead of minutes. The Ernst-angle trade-off is a natural slider-toy. **[unverified]** |
| ⭐ **Ogawa S, Lee TM, Kay AR, Tank DW.** *Brain magnetic resonance imaging with contrast dependent on blood oxygenation.* PNAS 87, 9868–9872 (1990). [doi:10.1073/pnas.87.24.9868](https://doi.org/10.1073/pnas.87.24.9868) · [PDF](https://www.pnas.org/doi/pdf/10.1073/pnas.87.24.9868) | **BOLD.** Deoxyhaemoglobin is paramagnetic, so it is an endogenous contrast agent and brain activity becomes visible. Freely available PDF. The whole of fMRI in five pages. |

---

## 5. Reconstruction — where the sensor's spatial information gets used

| Source | Why it matters |
|---|---|
| **Pruessmann KP, Weiger M, Scheidegger MB, Boesiger P.** *SENSE: sensitivity encoding for fast MRI.* Magn Reson Med 42, 952–962 (1999). | Coil sensitivity profiles *are* spatial encoding: undersample k-space, unfold the aliasing with the array. The correction to "the sensor has no spatial resolution". **[unverified]** |
| **Griswold MA et al.** *Generalized autocalibrating partially parallel acquisitions (GRAPPA).* Magn Reson Med 47, 1202–1210 (2002). | The k-space-domain counterpart; the one in widest clinical use. **[unverified]** |
| **Lustig M, Donoho D, Pauly JM.** *Sparse MRI: the application of compressed sensing for rapid MR imaging.* Magn Reson Med 58, 1182–1195 (2007). | Compressed sensing: random undersampling + sparsity prior. The incoherent-aliasing-as-noise demo is very visual. **[unverified]** |
| **Ma D, Gulani V, Seiberlich N, Liu K, Sunshine JL, Duerk JL, Griswold MA.** *Magnetic resonance fingerprinting.* Nature 495, 187–192 (2013). [doi:10.1038/nature11971](https://doi.org/10.1038/nature11971) | Deliberately incoherent acquisition, then dictionary-match each voxel's signal *trajectory* to get quantitative T1/T2 simultaneously. The strangest and most game-like idea in modern MR — pattern matching as reconstruction. **[unverified]** |
| **BART** — Berkeley Advanced Reconstruction Toolbox, [mrirecon.github.io/bart](https://mrirecon.github.io/bart/) | Open-source reference implementations if we ever want to generate real reconstruction figures rather than cartoons. |

---

## 6. The rest of the machine — magnet, gradients, noise, safety

| Source | Why it matters |
|---|---|
| **Turner R.** *Gradient coil design: a review of methods.* Magn Reson Imaging 11, 903–920 (1993); and *A target field approach to optimal coil design*, J Phys D 19, L147 (1986). | The target-field method: specify the field you want, solve for the current density, then discretise into wire paths. Explains the fingerprint-like gradient winding patterns — a great "here is why it looks like that" graphic. **[unverified]** |
| **Winkler SA et al.** *Gradient and shim technologies…* / **Overview of methods for noise and heat reduction in MRI gradient coils**, [PMC9733908](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9733908/) | **Why the scanner screams**: gradient currents in a 1.5–3 T field feel Lorentz forces, the coil former flexes, and it radiates sound. EPI reaches 110–120 dB SPL against an 85 dB NIOSH threshold. Open access. This is the fact every visitor has personally experienced and cannot explain — a mandatory section. |
| **ACR Manual on MR Safety** (current edition), and **ACR guidance document on MR safe practices: 2013**, J Magn Reson Imaging 37, 501–530. [doi:10.1002/jmri.24011](https://doi.org/10.1002/jmri.24011) · [manual PDF](https://files.nyit.edu/files/medicine/Manual_on_MR_Safety.pdf) | Zones, projectiles, quench procedure, implant screening. The authoritative source for anything we say about safety; do not paraphrase from memory. |
| **Shellock FG.** *Radiofrequency energy-induced heating during MR procedures: a review.* J Magn Reson Imaging 12, 30–36 (2000); [MRIsafety.com](https://www.mrisafety.com/) | SAR and RF heating — the constraint that limits how hard you may pulse. Ties back to the transmit side of the same coil. **[unverified]** |

---

## 7. Other sensors for the same magnetisation

The section that actually closes the loop on "what is the sensor" — by showing
it could be something else entirely.

| Source | Why it matters |
|---|---|
| **Clarke J, Hatridge M, Mößle M.** *SQUID-detected magnetic resonance imaging in microtesla fields.* Annu Rev Biomed Eng 9, 389–413 (2007); and **Kraus/Espy et al.**, *SQUID-based instrumentation for ultra-low-field MRI*, [arXiv:0705.0661](https://arxiv.org/pdf/0705.0661) | SQUID pickup: sensitivity independent of frequency, so imaging works at microtesla where induction gives nothing. Prepolarise in mT, then detect in μT. Directly demonstrates that Faraday's ∝ω is a property of *the sensor*, not of the physics. arXiv copy is open. **[review paper unverified]** |
| **Optically pumped / SERF atomic magnetometers for NMR detection** (Budker & Romalis lineage; see review pointers in the arXiv item above) | A vapour cell and a laser as the MR detector. Comparable sensitivity to SQUIDs without cryogenics. |
| ⭐ **Cooley CZ et al.** *A portable scanner for magnetic resonance imaging of the brain.* Nat Biomed Eng 5, 229–239 (2021). [doi:10.1038/s41551-020-00641-5](https://www.nature.com/articles/s41551-020-00641-5) | 80 mT, 122 kg **Halbach** permanent-magnet array with a built-in readout gradient, no cryogens, plugs into a wall socket, 2.2 × 1.3 × 6.8 mm resolution. The magnet-as-array idea is very drawable, and it makes the whole instrument feel buildable. |
| **Liu Y, Leong ATL, Zhao Y, … Wu EX.** *A low-cost and shielding-free ultra-low-field brain MRI scanner.* Nat Commun 12, 7238 (2021). [doi:10.1038/s41467-021-27317-1](https://www.nature.com/articles/s41467-021-27317-1) | 0.055 T, **no RF shielded room** — electromagnetic interference cancelled computationally with deep learning. Open access. Reframes the Faraday cage as software. |
| **ezyMRI: how to build an MRI machine from scratch — experience from a four-day hackathon.** [arXiv:2411.11365](https://arxiv.org/pdf/2411.11365) | People actually building one in four days. Best available source for concrete parts, costs and failure modes if we want a "what it takes" section. Open. |

---

## 8. Textbooks and teaching sources

| Source | Use |
|---|---|
| **Haacke EM, Brown RW, Thompson MR, Venkatesan R.** *Magnetic Resonance Imaging: Physical Principles and Sequence Design.* Wiley. | The standard graduate text; first eight chapters cover signal detection and acquisition. Our default for checking a derivation or a number. |
| **Bernstein MA, King KF, Zhou XJ.** *Handbook of MRI Pulse Sequences.* Elsevier, 2004. | The reference for what any given sequence actually does, gradient waveform by gradient waveform. Use for accurate sequence diagrams. |
| **Nishimura DG.** *Principles of Magnetic Resonance Imaging.* | Compact, signal-processing-flavoured; the clearest short treatment of k-space and sampling. **[edition/citation unverified]** |
| **Levitt MH.** *Spin Dynamics.* Wiley. | If we ever need the quantum treatment done properly rather than badly. |
| **Abragam A.** *Principles of Nuclear Magnetism* (1961); **Slichter CP.** *Principles of Magnetic Resonance*. | The classical monographs. Relaxation theory lives here. |
| ⭐ **Hanson LG.** *Is quantum mechanics necessary for understanding magnetic resonance?* Concepts Magn Reson A 32A, 329–340 (2008). [doi:10.1002/cmr.a.20123](https://onlinelibrary.wiley.com/doi/10.1002/cmr.a.20123) · [PDF](https://mri-q.com/uploads/3/4/5/7/34572113/hanson._concept_mri_2008_quantum.pdf) · [companion site](https://www.drcmr.dk/mr) | **Editorially load-bearing.** Argues that basic MR is a classical effect and that the usual "spin-up/spin-down, photons" story actively misleads. Combined with Hoult 1989, this fixes the register of our whole explainer: classical fields, classical induction, no hand-waving quanta. The companion site includes Hanson's **Bloch simulator**. |
| **Hanson LG.** *Introduction to Magnetic Resonance Imaging Techniques.* [PDF](https://fmri.ucsd.edu/ttliu/be280a_09/MRI_English_letter.pdf) | Free ~50-page compendium; good structural model for how to sequence an explanation. |
| ⭐ **Elster AD.** *Questions and Answers in MRI*, [mriquestions.com](https://mriquestions.com/) | Hundreds of short, illustrated, reliable answers, and it mirrors many of the classic papers above as free PDFs. Best index into the literature; **not** a citable primary source. |

---

## 9. Simulation and interactive prior art

What already exists, so we build what does not.

| Tool | Note |
|---|---|
| **JEMRIS** — [jemris.org](https://jemris.org) | C++ Bloch solver, arbitrary sequences/samples, parallel. The reference-quality simulator. GPL. |
| **KomaMRI.jl** — [arXiv:2301.02702](https://arxiv.org/abs/2301.02702), [doi:10.1002/mrm.29635](https://onlinelibrary.wiley.com/doi/10.1002/mrm.29635) | Julia, GPU, Pulseq-compatible, **web-technology GUI**, explicitly evaluated for teaching (~8× faster than JEMRIS; 65% of student testers recommended it). Closest existing thing to what we want, which is useful both as a validation target and as a statement about where our niche is not. |
| **MRiLab** — GPU Bloch simulator (2017) | Older, less extensible. |
| **Pulseq** — Layton KJ et al., Magn Reson Med 77, 1544–1552 (2017), [doi:10.1002/mrm.26235](https://onlinelibrary.wiley.com/doi/abs/10.1002/mrm.26235); [opensourceimaging.org](https://www.opensourceimaging.org/project/pulseq-open-source-pulse-sequences/) | An **open file format for pulse sequences**, runnable on real scanners. If our sequence-builder toy emits Pulseq, its output is a real artefact rather than a cartoon. Strong candidate hook. |
| **Hanson's Bloch simulator** — [drcmr.dk/mr](https://www.drcmr.dk/mr) | The classic teaching simulator; pairs with the 2008 paper. |
| **CompassMR** — Physica Medica (2016), interactive site + Android app | Compass-needle analogy for precession/nutation/FID. Prior art for the most elementary interaction; we should not duplicate it. |

**Where the gap is.** Everything above simulates *spins*. Nothing in this list
is a good interactive explanation of **the detector** — reciprocity, coil
geometry → sensitivity map, Q and loading, sample-vs-coil noise, array
combination. That is exactly the thing the principal wanted to understand, and
it is unoccupied ground. The `/mri` page should be built around it.

---

## 10. Candidate interactives, mapped to sources

Not a commitment — the shortlist that fell out of the reading, each anchored to
a source above so nothing gets invented.

1. **Reciprocity sandbox** — draw a coil, get its receive sensitivity map, move
   the sample, watch SNR. *Hoult & Richards 1976; Hoult 2000; Gruber 2018.*
2. **The one-pixel camera** — one coil, one voltage trace, no image; then turn
   on gradients and watch the picture appear from the same wire. *Lauterbur
   1973; Twieg 1983.*
3. **Drive k-space** — a game: steer the gradient waveforms to fill k-space,
   with score = image quality per unit time. Spin-warp vs EPI vs spiral emerge
   as strategies. *Twieg 1983; Ljunggren 1983; Mansfield 1977; export Pulseq.*
4. **The refocusing trick** — dephasing runners, then the 180° flip. *Hahn 1950.*
5. **Why it screams** — Lorentz force on gradient windings, with the actual
   audio. *PMC9733908; Turner 1993.*
6. **Turn down the field** — sweep B₀ and watch the induction signal die, then
   swap in a SQUID and watch it not. *Clarke 2007; Cooley 2021; Liu 2021.*
7. **Noise budget** — sliders for coil size, distance and body conductivity
   against the ultimate-intrinsic ceiling. *Edelstein 1986; Ocali & Atalar 1998.*

---

## 11. Verification status

- **Read in full from this sandbox:** Gruber 2018 (PMC), Hoult 1989 (mirrored
  PDF). Everything cited from these two is checked.
- **Citation metadata confirmed** (≥2 independent indexes: publisher, PubMed,
  ADS, or Semantic Scholar) **but text not read:** all entries marked
  **[unverified]**. Titles, authors, journals, volumes and years are reliable;
  the one-line characterisations are from abstracts and secondary summaries.
- **Freely available** (no institutional access needed) and therefore first in
  line for a full read: Gruber 2018, Hoult 1989 & 2009, Hanson 2008 + the
  compendium, Ogawa 1990, Twieg 1983, Hayes 1985, Liu 2021, Cooley 2021 (open),
  arXiv:0705.0661, arXiv:2411.11365, KomaMRI, PMC9733908, the ACR manual.
- **Known conflict to resolve:** one automated fetch returned "Concepts Magn
  Reson 1, 4–15 (1982)" for the Hoult radio-waves paper. The publisher record
  and the PDF header both give **1989, vol. 1, pp. 1–5**; that is what is used
  here.
- **Numbers not yet sourced to a primary reference,** and which must not appear
  on the page until they are: the exact thermal polarisation at 1.5 T / 3 T,
  the induced-EMF magnitude in volts, and the SNR-vs-B₀ exponent (regime
  dependent — see the Hoult & Richards note in §2).
