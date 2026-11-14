# R1 — references, and how far each was checked

Checked 2026-11-14 by a web pass against Crossref DOI records, arXiv and library catalogues. **Bibliographic** means
the citation itself; **content** means the specific claim we lean on. Most publisher full texts were paywalled, so
"content not re-read" is common and is said each time. Nothing here has been checked against a physical copy.
Before submission every entry marked *partial* or *not checked* needs a page reference from someone holding the source.

## A. Strength of bundles and load sharing (what PULL's bench is a toy version of)

| | Source | Bibliographic | Content we use | Content status |
|---|---|---|---|---|
| A1 | H. E. Daniels (1945), "The statistical theory of the strength of bundles of threads. I", *Proc. R. Soc. Lond. A* 183(995), 405–435. doi:10.1098/rspa.1945.0011 | confirmed | an equal-load-sharing bundle's strength is asymptotically normal, mean per fibre max ₓ x[1 − F(x)] | not re-read |
| A2 | W. Weibull (1951), "A Statistical Distribution Function of Wide Applicability", *J. Appl. Mech.* 18(3), 293–297. doi:10.1115/1.4010337 | confirmed | the weakest-link strength distribution (our link strengths) | not re-read |
| A3 | B. D. Coleman (1958), "On the strength of classical fibres and fibre bundles", *J. Mech. Phys. Solids* 7(1), 60–70. doi:10.1016/0022-5096(58)90039-5 | confirmed | a loose bundle of Weibull fibres is weaker than the mean fibre, more so the wider the scatter (our "loose bundle 0.70") | not re-read |
| A4 | B. W. Rosen (1964), "Tensile failure of fibrous composites", *AIAA J.* 2(11), 1985–1991. doi:10.2514/3.2699 | confirmed | chain of bundles; a broken fibre carries load again beyond an ineffective length | not re-read |
| A5 | D. G. Harlow, S. L. Phoenix (1978), "The Chain-of-Bundles Probability Model for the Strength of Fibrous Materials I: Analysis and Conjectures", *J. Compos. Mater.* 12(2), 195–214, doi:10.1177/002199837801200207; "II: A Numerical Study of Convergence", 12(3), 314–334, doi:10.1177/002199837801200308 | confirmed | local load sharing | not re-read |
| A6 | H. L. Cox (1952), "The elasticity and strength of paper and other fibrous materials", *Br. J. Appl. Phys.* 3(3), 72–79. doi:10.1088/0508-3443/3/3/302 | confirmed | shear lag: load enters a fibre through interface shear over a length | not re-read |
| A7 | A. Kelly, W. R. Tyson (1965), "Tensile properties of fibre-reinforced metals: Copper/tungsten and copper/molybdenum", *J. Mech. Phys. Solids* 13(6), 329–350. doi:10.1016/0022-5096(65)90035-9 | confirmed | the critical transfer length l_c = σ_f d / 2τ (TWIST's "shortest fibre that holds") | formula from memory |

## B. Twist, helices and lateral pressure

| | Source | Bibliographic | Content we use | Content status |
|---|---|---|---|---|
| B1 | J. W. S. Hearle, P. Grosberg, S. Backer (1969), *Structural Mechanics of Fibers, Yarns, and Fabrics*, vol. 1, Wiley-Interscience, New York | confirmed (catalogues; no DOI) | twisted-yarn mechanics; lateral pressure from tension and curvature | **not checked**: the book could not be opened |
| B2 | Gégauff (1907), *Bull. Soc. Ind. Mulhouse* 77, 153 | **uncertain**: one reference list gives 177:150; original not seen, title unverified | filament strain = yarn strain × cos²θ, so yarn modulus ∝ cos²θ (our `laid`: stiffness cos³θ along the rope) | from secondary literature |
| B3 | M. M. Platt (1950), "Mechanics of Elastic Performance of Textile Materials. III. Some Aspects of Stress Analysis of Textile Structures—Continuous-Filament Yarns", *Text. Res. J.* 20(1), 1–15. doi:10.1177/004051755002000101 | confirmed | twist angle and yarn modulus, after Gégauff | from secondary literature |
| B4 | J. W. S. Hearle, H. M. A. E. El-Behery, V. M. Thakur (1959), "The mechanics of twisted yarns: tensile properties of continuous-filament yarns", *J. Text. Inst. Trans.* 50(1), T83–T111. doi:10.1080/19447025908662487 | confirmed | as B3 | not re-read |
| B5 | G. A. Costello, *Theory of Wire Rope*, Springer, 1990; 2nd ed. 1997. doi:10.1007/978-1-4612-1970-5 | confirmed | a helical wire's contact line load. **Convention:** Costello measures the helix angle α from the cross-section, so curvature is cos²α / r; our sin²θ / r is the same with θ from the axis. **The law:** X = N′τ − Tκ′, which is T × curvature only when the wire's bending shear N′ is neglected (ours has none: bead chains don't bend-resist) | checked in a thesis reproducing the framework, not in the book |
| B6 | J. W. Phillips, G. A. Costello (1973), "Contact Stresses in Twisted Wire Cables", *J. Eng. Mech. Div. ASCE* 99(2), 331–341. doi:10.1061/JMCEA3.0001739 | confirmed | as B5 | not re-read |
| B7 | I. M. Stuart (1961), "Capstan equation for strings with rigidity", *Br. J. Appl. Phys.* 12(10), 559–562, doi:10.1088/0508-3443/12/10/309; J. H. Jung, N. Pan, T. J. Kang (2008), "Capstan equation including bending rigidity and non-linear frictional behavior", *Mech. Mach. Theory* 43(6), 661–675, doi:10.1016/j.mechmachtheory.2007.06.002 | confirmed | normal load per length = tension / radius of curvature, and the capstan equation from it | not re-read; Euler's and Eytelwein's originals not checked |
| B8 | J. W. S. Hearle (1965), "Theoretical Analysis of the Mechanics of Twisted Staple Fiber Yarns", *Text. Res. J.* 35(12), 1060–1071, doi:10.1177/004051756503501202; J. Gregory (1953), "Cotton Yarn Structure Part IV", *J. Text. Inst. Trans.* 44(11), T499–T514, doi:10.1080/19447025308662613 | confirmed | staple yarn strength rises with twist (slippage) then falls (obliquity) | **the statement was not seen verbatim** in anything readable |

## C. Braids

| | Source | Bibliographic | Content we use | Content status |
|---|---|---|---|---|
| C1 | C.-P. Chou, B. Hannaford (1996), "Measurement and modeling of McKibben pneumatic artificial muscles", *IEEE Trans. Robot. Autom.* 12(1), 90–102. doi:10.1109/70.481753 | confirmed | a braided sleeve's force vanishes at a braid angle of 54.7° from the axis (factor 3cos²θ − 1) | formula from memory; the paper may not call the angle "neutral" |
| C2 | J. T. Evans, A. G. Gibson (2002), "Composite angle ply laminates and netting analysis", *Proc. R. Soc. A* 458(2028), 3079–3088. doi:10.1098/rspa.2002.1066 | confirmed | netting analysis: hoop to axial stress = tan²θ (our `trap` law's tan²θ) | not re-read |
| C3 | D. Brunnschweiler (1954), "The structure and tensile properties of braids", *J. Text. Inst. Trans.* 45(1), T55–T77. doi:10.1080/19447025408662631 | confirmed | braid geometry and jamming | not re-read |
| C4 | H. A. McKenna, J. W. S. Hearle, N. O'Hear (2004), *Handbook of Fibre Rope Technology*, Woodhead | confirmed | **nothing yet.** That a straight core is stiffer than its braided cover and loads first is our bench's result and plain mechanics (cos²θ); it was **not found** in any text that could be read, so it must not be attributed to this book without a page |  |
| — | "finger trap" as a term for a sleeve that tightens when pulled | **no citable source found** | use C1 and C2 for the mechanism and drop the nickname, or keep it as a nickname only |  |

## D. Shells, fits, packings (PULL's press: `js/skin.js`)

| | Source | Bibliographic | Content we use | Content status |
|---|---|---|---|---|
| D1 | S. Timoshenko, S. Woinowsky-Krieger, *Theory of Plates and Shells*, 2nd ed., McGraw-Hill, 1959 | confirmed (catalogues) | thin vessels: a cylinder's hoop stress PR/t, a sphere's PR/2t (the bench's `wall`) | location in the book from memory |
| D2 | S. P. Timoshenko, J. N. Goodier, *Theory of Elasticity*, 3rd ed., McGraw-Hill, 1970 | **not checked** | shrink fits and Lamé's solution (what "HOOP = half strength" means physically) |  |
| D3 | R. Schneider, *Convex Bodies: The Brunn–Minkowski Theory*, Cambridge University Press, 1993 (doi:10.1017/CBO9780511526282); 2nd expanded ed. 2014 | confirmed | Steiner's formula for a parallel body's area and mean curvature (the `HULL` estimate) | section not located |
| D4 | K. Schütte, B. L. van der Waerden, "Das Problem der dreizehn Kugeln", *Math. Ann.* 125(1), 325–334. doi:10.1007/BF01343127 (dated 1952 in the publisher's record; usually cited as 1953) | confirmed | twelve balls round one, and no more | — |
| D5 | J.-N. Roux (2000), "Geometric origin of mechanical properties of granular materials", *Phys. Rev. E* 61(6), 6802–6836, doi:10.1103/PhysRevE.61.6802; C. F. Moukarzel (1998), "Isostatic Phase Transition and Instability in Stiff Granular Materials", *Phys. Rev. Lett.* 81(8), 1634–1637, doi:10.1103/PhysRevLett.81.1634 | confirmed | **stated carefully:** a generic packing of rigid frictionless spheres is isostatic and its forces are fixed by geometry. A regular packing with more contacts than that, like ours (36 contacts among 13), is over-determined, and then the forces depend on the contacts' stiffness. That is why `sharing` gives a spread | abstracts read |

## E. Topology (CAD⁴'s braids)

| | Source | Bibliographic | Content we use | Content status |
|---|---|---|---|---|
| E1 | C. Damiani (2017), "A journey through loop braid groups", *Expo. Math.* 35(3), 252–285. doi:10.1016/j.exmath.2016.12.003; arXiv:1605.02323 | confirmed | the loop braid group as motions of unlinked circles in R³; its identification with ribbon braids in the 4-ball and with welded braids; the σᵢ generate a copy of the classical braid group (Remark 4.4) | **read** (arXiv text) |
| E2 | T. E. Brendle, A. Hatcher (2013), "Configuration spaces of rings and wickets", *Comment. Math. Helv.* 88(1), 131–162. doi:10.4171/CMH/280 | confirmed | the space of unlinked circles and its fundamental group | abstract |
| E3 | J. C. Baez, D. K. Wise, A. S. Crans (2007), "Exotic statistics for strings in 4d BF theory", *Adv. Theor. Math. Phys.* 11(5), 707–749. doi:10.4310/ATMP.2007.v11.n5.a1 | confirmed | the loop braid group's presentation (the braid-permutation group) | abstract |
| E4 | D. M. Dahm (1962), "A Generalization of Braid Theory", PhD thesis, Princeton (unpublished); D. L. Goldsmith (1981), "The theory of motion groups", *Michigan Math. J.* 28(1), 3–17. doi:10.1307/mmj/1029002454 | Goldsmith confirmed; Dahm via citing papers only | motion groups of circles | — |
| E5 | S. Satoh (2000), "Virtual knot presentation of ribbon torus-knots", *J. Knot Theory Ramifications* 9(4), 531–542. doi:10.1142/S0218216500000293 | confirmed | the **Tube map**: a (welded) braid gives tubes in 4-space. *Not* Artin's spinning, which turns a knotted arc into a knotted sphere | — |
| E6 | P. Bellingeri, A. Bodin (2016), "The braid group of a necklace", *Math. Z.* 283(3–4), 995–1010. doi:10.1007/s00209-016-1630-0; arXiv:1404.2511 | confirmed | "the natural map Bₙ → WBₙ sending σᵢ into σᵢ is injective": every classical braid is a distinct loop braid | **read** (arXiv text) |
| E7 | R. Fenn, R. Rimányi, C. Rourke (1997), "The braid-permutation group", *Topology* 36(1), 123–135. doi:10.1016/0040-9383(95)00072-0 | confirmed | as E3 | — |

**One gap in E.** That *revolving a planar braid about an axis* (how CAD⁴ builds the hose braid and the maypole)
realises exactly the map of E6 is our inference; no source states it. It is very likely the standard picture
(a circle's motion through a coaxial circle is the generator σᵢ), but the paper should either prove it in a line or
find it stated.
