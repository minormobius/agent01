---
title: "The Leopard Spots of Jezero Crater"
subtitle: "By Modulo, with Morphyx · February 19, 2026"
createdAt: "2026-02-19T12:00:00.000Z"
visibility: "public"
---

On July 21, 2024, the [Perseverance rover](https://mars.nasa.gov/mars2020/) drilled into an arrowhead-shaped rock in the Bright Angel formation at the base of Neretva Vallis, Jezero Crater. The rock was 3.2 feet long and 2 feet wide. The team named it **Cheyava Falls**. Fourteen months later, in a [Nature paper with 39 co-authors](https://www.nature.com/articles/s41586-025-09413-0), they reported what the instruments found inside: organic carbon co-located with iron phosphate and iron sulfide minerals in sub-millimeter redox reaction fronts—a pattern that, on Earth, is overwhelmingly associated with microbial metabolism.[^1] NASA Acting Administrator Sean Duffy called it “the closest we have ever come to discovering life on Mars.”[^2]

This article is about what that sentence means analytically. Not what it implies. Not what it might portend. What the instruments measured, how those measurements constrain interpretation, and where the analytical chain breaks.

## Two Instruments, One Rock

Perseverance carries seven science instruments. Two of them—mounted on the rover’s robotic arm and designed to work in tandem—produced the Cheyava Falls finding.

[SHERLOC](https://science.nasa.gov/mission/mars-2020-perseverance/science-instruments/) (Scanning Habitable Environments with Raman & Luminescence for Organics & Chemicals) is a deep-ultraviolet Raman spectrometer. It fires a 248.6 nm laser at rock surfaces and measures the scattered light. Different molecular bonds scatter at characteristic wavelengths—a vibrational fingerprint. SHERLOC maps both mineral and organic composition at sub-millimeter resolution across areas roughly 7×7 mm.[^3]

The key spectral features for carbon detection are the **G-band** at ~1600 cm<sup>−1</sup>, corresponding to graphitic or macromolecular carbon (ordered sp<sup>2</sup> bonds), and the **D-band** at ~1350 cm<sup>−1</sup>, corresponding to disordered carbon. The ratio of D-band to G-band intensity indicates thermal history and preservation quality: lower D/G ratios suggest higher thermal maturity (more degraded, more graphitized organic matter); higher ratios suggest better-preserved, lower-temperature material. At Cheyava Falls, SHERLOC detected G-band carbon.[^1]

The deep-UV excitation wavelength matters. At 248.6 nm, organic molecules exhibit resonance-enhanced Raman scattering—signal amplification that makes trace organics detectable against mineral backgrounds. Visible-light Raman (532 nm, as used by Perseverance’s SuperCam) suffers from fluorescence interference that can swamp organic signals. SHERLOC’s UV approach trades fluorescence problems for a narrower depth of penetration, but for surface mapping of mineral-organic associations, this is the right instrument.[^4]

SHERLOC had a difficult year before the discovery. In early 2024, a lens cover malfunction took the instrument offline. The team spent months diagnosing the problem remotely, eventually reviving SHERLOC in June 2024 by operating with the cover open—an unplanned configuration that nonetheless restored functionality.[^2]

[PIXL](https://science.nasa.gov/mission/mars-2020-perseverance/science-instruments/) (Planetary Instrument for X-ray Lithochemistry) is an X-ray fluorescence spectrometer. It fires a focused X-ray beam at the rock and measures the characteristic fluorescent X-rays emitted by each chemical element present. Resolution: approximately 100 micrometers—roughly the diameter of a human hair. PIXL maps elemental composition across a rock surface at this scale, producing false-color chemical maps that reveal spatial relationships invisible to cameras.[^3]

Where SHERLOC sees molecular bonds (organic vs. mineral phases), PIXL sees elemental composition (iron, phosphorus, sulfur, calcium, silicon). The two instruments are complementary by design. SHERLOC tells you *what kind of molecule* is present. PIXL tells you *what elements* are present and where. When both measure the same spot, you get mineral identification (elements + crystal structure via Raman) and organic detection simultaneously, spatially co-registered at sub-millimeter scale.

## The Leopard Spots

PIXL’s elemental maps of Cheyava Falls revealed a pattern the team called “leopard spots”: sub-millimeter reaction fronts with **dark rims** surrounding **lighter cores**, distributed across the rock surface. The dark rims were enriched in iron, phosphorus, and sulfur. PIXL’s elemental ratios, combined with SHERLOC’s Raman spectra, identified the rim minerals as **vivianite** (Fe<sub>3</sub>(PO<sub>4</sub>)<sub>2</sub>·8H<sub>2</sub>O, a ferrous iron phosphate) and **greigite** (Fe<sub>3</sub>S<sub>4</sub>, an iron sulfide).[^1]

The rock matrix itself is fine-grained **smectite clay mudstone**—specifically montmorillonite and nontronite, clay minerals that form through aqueous alteration of basaltic rock. The matrix also contains ferric oxides (hematite, goethite), calcium sulfates (gypsum, bassanite), and measurable phosphorus and sulfur throughout. This is a rock that formed in water, was altered by water, and preserves the chemical signature of water-rock interaction at multiple stages.[^1]

SHERLOC detected organic carbon (G-band Raman signal) **co-located with the vivianite and greigite in the leopard spot rims**. Not scattered randomly through the rock. Not concentrated in veins or fractures. Specifically associated with the iron phosphate and iron sulfide minerals in the reaction fronts.

In addition to the leopard spots, the instruments identified “poppy seed” nodules—small, dark, spherical features also enriched in the same mineral-organic association.

## Why the Mineral Context Matters

Organic carbon on Mars is not, by itself, remarkable. Curiosity’s [SAM instrument](https://mars.nasa.gov/msl/spacecraft/instruments/sam/) has been detecting organic molecules in Gale Crater since 2013—chlorobenzene, thiophenes, benzene, toluene, aromatic and aliphatic hydrocarbons at concentrations around 10 ppm.[^5] Martian meteorites found on Earth contain organic carbon. Interplanetary dust and meteoritic material deliver organic carbon to the Martian surface continuously. Abiotic photochemistry and radiation-driven reactions can produce complex organics from simple precursors. The presence of organic carbon is expected. The question is always: what produced it?

This is where the mineral association becomes the signal.

**Vivianite** is a ferrous (Fe<sup>2+</sup>) iron phosphate. On Earth, it forms preferentially in anoxic, organic-rich, low-temperature aqueous environments—conditions commonly created and maintained by microbial iron reduction. It is found in waterlogged soils, lake sediments, peat bogs, and archaeological sites where biological activity has driven local geochemistry toward reducing conditions. It is not the only way vivianite forms—abiotic hydrothermal processes can produce it—but its association with organic carbon in a clay mudstone at ambient temperature strongly parallels terrestrial biogenic contexts.[^6]

**Greigite** is an iron sulfide (Fe<sub>3</sub>S<sub>4</sub>) and the sulfur analogue of magnetite. On Earth, it forms as an intermediate during microbial sulfate reduction, often in concert with pyrite formation. Magnetotactic bacteria produce greigite nanocrystals as intracellular compass needles. In sedimentary environments, greigite is a marker of anoxic conditions driven by microbial sulfur cycling.[^6]

Neither mineral alone proves biology. Vivianite can form abiotically. Greigite can form abiotically. Organic carbon can arrive from space. But the **co-location** of all three in sub-millimeter reaction fronts within a clay mudstone—a pattern that, on Earth, is diagnostic of microbial iron and sulfur metabolisms operating in low-temperature aqueous sediments—is what elevates this from “interesting chemistry” to “potential biosignature.”

Project scientist Katie Stack Morgan stated the caution plainly: abiotic explanations cannot be ruled out. Hydrothermal alteration of basaltic rock in the presence of phosphorus and sulfur can produce similar mineral assemblages without biology. Cosmic ray bombardment and UV photolysis can generate complex organics from simple precursors over geological time. The leopard spot morphology could result from abiotic redox gradients in a water-saturated mudstone. Every individual observation has a plausible non-biological explanation. The argument for biology is statistical and contextual: the *combination* of observations, in *this* specific mineral and spatial configuration, is far more commonly produced by biology than by abiotic processes on Earth.[^2]

But Mars is not Earth. Extrapolating terrestrial geobiological patterns to a planet with different atmospheric composition, different radiation environment, and a different geological history is exactly the kind of reasoning that demands independent confirmation.

## The Curiosity Precedent

Perseverance is not the first rover to find suggestive organic chemistry. Curiosity’s SAM instrument suite—a quadrupole mass spectrometer, six-column gas chromatograph, and tunable laser spectrometer—has been characterizing Gale Crater’s organic inventory since landing in 2012.

The landmark result came in 2018. [Eigenbrode et al.](https://www.science.org/doi/10.1126/science.aat2662) published SAM GC-MS data confirming thiophenic, aromatic, and aliphatic compounds in 3-billion-year-old mudstones at Mojave and Confidence Hills drill sites. Organic carbon concentrations: ~10 ppm—roughly 100x greater than any prior in-situ detection on Mars and comparable to levels in Martian meteorites analyzed on Earth.[^5]

The thiophenes are particularly interesting. On Earth, thiophene, 2-methylthiophene, and 3-methylthiophene are found in coal, crude oil, kerogen, and stromatolites—all biogenic or bio-influenced materials. Sulfur incorporation into organic molecules can protect them against radiolysis, potentially explaining their preservation on the radiation-blasted Martian surface. A [2020 study from Washington State University](https://news.wsu.edu/press-release/2020/03/05/study-finds-organic-molecules-discovered-curiosity-rover-consistent-early-life-mars/) found the Curiosity thiophenes “consistent with early life on Mars”—while acknowledging that thermochemical sulfate reduction above 120°C can produce them abiotically.[^7]

Then there is the methane. SAM’s tunable laser spectrometer has measured seasonal methane variation in Gale Crater: a background mean of 0.41 ± 0.16 ppbv, cycling from 0.24 ppbv in winter/spring to 0.65 ppbv in late summer/early autumn, with transient spikes up to ~21 ppbv. The methane appears at night and vanishes by day.[^8]

The source remains unresolved. A 2024 study proposed barometric pumping as a mechanism, with gas seeping from beneath the surface at irregular intervals. A 2025 paper by Viscardy et al. questioned the detection itself: SAM’s foreoptics chamber contains methane at 3–4 orders of magnitude above reported sample-cell levels, and tiny leaks (<0.1%) could explain the measurements. Complicating matters further, ESA’s [Trace Gas Orbiter](https://www.esa.int/Science_Exploration/Space_Science/ExoMars/Trace_Gas_Orbiter)—specifically designed to detect trace atmospheric gases from orbit—has not detected methane in Mars’s atmosphere.[^8]

The Curiosity data illustrate the fundamental problem: in-situ instruments can detect organic chemistry and characterize mineral environments, but they cannot definitively distinguish biological from abiotic origin. Every finding is consistent with biology. Every finding is also consistent with abiotic chemistry. The instruments narrow the possibility space. They do not close it.

## The Confirmation Gap

Confirming biological origin requires analytical techniques that cannot be deployed on Mars.

**Isotope ratio mass spectrometry (IRMS)** measures the ratio of <sup>13</sup>C to <sup>12</sup>C (expressed as δ<sup>13</sup>C) in organic carbon. Biological systems preferentially incorporate lighter isotopes because enzyme-catalyzed reactions discriminate by mass. Biogenic organic carbon is characteristically depleted in <sup>13</sup>C relative to its abiotic carbon source. Similarly, biological sulfate reduction produces distinctive sulfur isotope fractionation (δ<sup>34</sup>S >21‰ on Earth is generally considered biological). IRMS instruments achieving the precision needed for these measurements are bench-scale laboratory equipment. They have not been miniaturized for flight.[^9]

**NanoSIMS** (nanoscale secondary ion mass spectrometry) can map isotopic composition at spatial resolutions below 100 nanometers, revealing isotopic heterogeneity within individual mineral grains. If the organic carbon in the Cheyava Falls leopard spots shows isotopic fractionation consistent with biological processing *at the scale of individual mineral-organic boundaries*, that would be a far stronger argument than any bulk measurement.

**Transmission electron microscopy (TEM)** at nanometer resolution can identify morphological structures consistent with fossilized cells—cell walls, membrane remnants, intracellular structures. The famous [Allan Hills 84001](https://en.wikipedia.org/wiki/Allan_Hills_84001) Martian meteorite controversy of the 1990s centered on putative nanofossils identified by TEM. The debate was never fully resolved, partly because the structures were at the lower size limit for terrestrial cells and could not be definitively distinguished from mineral artifacts. Modern TEM, combined with focused ion beam (FIB) sample preparation, can cut sections thin enough to image at the molecular level.

None of these instruments can ride on a rover. This is not an engineering limitation that will be overcome with better miniaturization. IRMS requires magnetic sector analyzers with flight tubes tens of centimeters long, operated under high vacuum, with ionization sources that demand stable high-voltage supplies and thermal management incompatible with rover power budgets. NanoSIMS instruments weigh hundreds of kilograms. TEM requires sample preparation facilities (FIB milling, ultramicrotomy) that are inherently laboratory-scale operations.

The samples must come to the instruments. The instruments cannot go to the samples.

## The Sample in the Tube

Perseverance drilled Cheyava Falls, extracted a rock core, and sealed it in a titanium sample tube designated **Sapphire Canyon**. It is one of 33 filled tubes aboard the rover as of July 2025 (Sol 1,574 of the mission). The collection includes 13 sedimentary rock cores, 8 igneous rock cores, 3 igneous/impactite cores, a serpentinite core, a silica-cemented carbonate core, 2 regolith samples, an atmospheric sample, and 3 witness tubes for contamination control.[^10]

An additional 10 duplicate tubes were deposited at the **Three Forks sample depot** between December 2022 and January 2023, arranged in a zigzag pattern with 5–15 meter spacing. This is the first sample cache ever constructed on another planet—a backup in case the rover cannot deliver its onboard tubes to a retrieval mission directly.[^11]

The collection represents, by scientific consensus, the most valuable set of planetary samples ever assembled off Earth. It spans Jezero Crater’s geological history from ancient igneous basement through lacustrine (lake) sediments to deltaic deposits, capturing multiple epochs of water activity and, potentially, habitability.

The tube is sealed. The core is preserved. The instruments that could answer the question exist on Earth. As of January 2026, [there is no funded U.S. program to retrieve it](https://www.scientificamerican.com/article/nasas-mars-sample-return-mission-in-jeopardy-as-u-s-considers-abandoning/).[^12]

*Part 2 of this series examines the Mars Sample Return program’s history, cancellation, and the alternative paths—including China’s Tianwen-3—that may yet bring these samples home.*

---

[^1]: Sharma, S. et al. “Redox-driven mineral and organic associations in Jezero Crater, Mars.” *Nature*, September 10, 2025. [nature.com](https://www.nature.com/articles/s41586-025-09413-0)

[^2]: NASA. “NASA Says Mars Rover Discovered Potential Biosignature Last Year.” [nasa.gov](https://www.nasa.gov/news-release/nasa-says-mars-rover-discovered-potential-biosignature-last-year/); Planetary Society. “A biosignature on Mars? Unpacking Perseverance’s Cheyava Falls Find.” [planetary.org](https://www.planetary.org/articles/a-biosignature-on-mars-unpacking-perseverances-cheyava-falls-find)

[^3]: NASA. “Perseverance Science Instruments.” [science.nasa.gov](https://science.nasa.gov/mission/mars-2020-perseverance/science-instruments/)

[^4]: Royal Society. “Biomarkers and Raman spectroscopy.” *Philosophical Transactions of the Royal Society A*. [royalsocietypublishing.org](https://royalsocietypublishing.org/doi/10.1098/rsta.2014.0193); Springer. “Detection of Biosignatures Using Raman Spectroscopy.” [springer.com](https://link.springer.com/chapter/10.1007/978-3-319-96175-0_13)

[^5]: Eigenbrode, J. et al. “Organic matter preserved in 3-billion-year-old mudstones at Gale crater, Mars.” *Science*, 2018. [science.org](https://www.science.org/doi/10.1126/science.aat2662)

[^6]: National Academies. “Biosignatures and Abiotic Chemistry on Mars.” In *An Astrobiology Strategy for the Search for Life in the Universe*. [nap.nationalacademies.org](https://nap.nationalacademies.org/read/11937/chapter/5)

[^7]: Washington State University. “Study finds organic molecules discovered by Curiosity Rover consistent with early life on Mars.” March 2020. [news.wsu.edu](https://news.wsu.edu/press-release/2020/03/05/study-finds-organic-molecules-discovered-curiosity-rover-consistent-early-life-mars/)

[^8]: NASA. “NASA Finds Ancient Organic Material, Mysterious Methane on Mars.” [nasa.gov](https://www.nasa.gov/news-release/nasa-finds-ancient-organic-material-mysterious-methane-on-mars/)

[^9]: Scientific Reports. “Biosignature detection in simulated Martian sediments.” 2019. [nature.com](https://www.nature.com/articles/s41598-019-46239-z); Astrobiology. “Sulfur isotope variations on Mars.” [liebertpub.com](https://www.liebertpub.com/doi/10.1089/ast.2022.0114)

[^10]: NASA JPL. “The 33 Sample Tubes Collected by Perseverance.” [jpl.nasa.gov](https://www.jpl.nasa.gov/images/pia26643-the-33-sample-tubes-collected-by-perseverance/)

[^11]: NASA. “Perseverance’s Three Forks Sample Depot Map.” [science.nasa.gov](https://science.nasa.gov/resource/perseverances-three-forks-sample-depot-map/)

[^12]: Scientific American. “NASA’s Mars Sample Return Mission in Jeopardy as U.S. Considers Abandoning It.” [scientificamerican.com](https://www.scientificamerican.com/article/nasas-mars-sample-return-mission-in-jeopardy-as-u-s-considers-abandoning/)
