<!-- Paper R1's prior-art search, 2026-11-13: what was searched, what was found, and a verdict on each claim. Made before an outline was written, so the outline claims nothing this says is known. -->

# Prior-art check: rope, textiles and machines in four spatial dimensions

A search by a delegated agent with web access, 2026-11-13, reviewed here. Verification tiers:
**page** (the page was fetched and read), **record** (a publisher, Crossref, ADS or arXiv record matched; the text was
not opened), **unverified**. "Not found" means not found by these searches. It does not mean new.

**Three sources could not be read and must be read by hand before anything is submitted:** the Higher Space forum
and wiki (hi.gher.space, HTTP 503 on every fetch; its threads are known here only from search summaries, and they
are the closest hobby prior art), the Internet Archive (blocked), and a Codidact question "Machines in four spatial
dimensions" (403).

## Verdicts

| | claim | verdict |
|---|---|---|
| A | loops don't link in R⁴; a loop links a closed surface; ring-and-sphere chains; torus chains | **Known** (mathematics). **Anticipated** (the chains, including that the tori must differ in size) |
| B | a hinge turns about a plane; a wheel's axle is a plane | **Known** |
| B′ | the pin as a disc times a square; a rope's groove as a cup; a block with four cheeks | Not found |
| C | things of dimension p and q obstruct in Rⁿ only if p + q ≥ n − 1 | **Known** (transversality) |
| C′ | weave sheets, not threads; 4D cloth is 3D | **Anticipated** (hobby) |
| C″ | a third family of whole sheets cannot join a weave | Not found |
| D | a bundle needs a hoop that is a sphere; a sheath is S² × R | **Known** as mathematics; the application not found |
| E | twist doesn't grip in 4D (simulation); a ribbon core restores it | The root is known; **the statement, the simulation and the cure not found** |
| F | the spinneret | Not found (the geometry is elementary) |
| G | the tensile bench | **Known** method; the application to 4D species not found |
| H | a column carries a bay volume; storey counts | Scaling mentioned informally; the numbers not found |

## A. Linking and chains

- Circles unlink in R⁴ and S¹ links S² by general position and the linking number with p + q = n − 1: standard
  (Zeeman 1963; Haefliger 1962; Rolfsen).
- Linked tori in R⁴ are a named object (the Hopf 2-link: Carter, Kamada, Saito, Satoh).
- H. Zhang and A. J. Hanson, "Shadow-driven 4D haptic visualization", IEEE TVCG 13 (2007) 1688, model "4D chain
  structures consisting of linked spheres and ribbons" (record).
- **Hqak (wxyhly), "4D Space (X): Knots and Links", 2019** (page): chains taken to four dimensions fall apart;
  circles link with any closed surface; linked flat tori are built, and "if two bitori are the same size, they can't
  fit"; that two congruent rigid ones have no linking solution is called "very possible", not proven.
- **Hqak, "4D World (VI): Newtonian Mechanics", 2020** (page): rigid-body simulations of a spheritorus–spheritorus
  chain ("comes apart with movement"), a spheritorus–torisphere chain (our ring-and-sphere chain), and a
  double-torus chain "one large, one small" (our tiger chain).
- hi.gher.space, "N-Dimensional Knots" (unverified): reportedly says 4D chains must alternate spheritori with
  torispheres or link tigers with tigers.

**So:** our chains and our size finding are already published as observations, with a simulation. We must cite them
and claim none of it. Only a *proof* that congruent rigid product tori cannot link would be new; Hqak leaves it open,
and the surface-link literature works up to isotopy, where size means nothing. We have no proof.

## B. Hinges, wheels, pulleys

Rotation about a plane and bivector angular velocity are standard (ten Bosch 2020; Parker 2024). Hqak's "4D World
(II): Road Traffic" (2018, page) has duocylinder wheels whose fixed plane is "equivalent to an axle"; his 2020 post
has gears. Nothing was found on a hinge pin's shape, a doubly curved groove or a four-cheeked block, with
hi.gher.space unsearched.

## C. Textiles

- The rule is transversality (Guillemin and Pollack; Hirsch).
- hi.gher.space, "4d weaving", 2010 (unverified): strings "could just fall off each other", so a 4D weaver needs
  sheets, and a woven thing is (dimensions − 1) sheets thick.
- Hqak 2016 (page): "Their clothes are three-dimensional fabrics!" and "They also never weave." Hqak 2019 suggests
  tube threads.
- For the third family, the nearest formal object is the triple point of a broken surface diagram, whose three
  sheets are ordered top, middle, bottom (Carter and Saito; from memory, unverified). No cyclic-order argument for
  three woven families was found. **Ours must be checked against that formalism before it is claimed.**

## D. Bundles

Follows from S² linking a line in R⁴. Hqak 2016 has beads and shells on a string. Nothing found proposing sphere
hoops or sheaths for fibre bundles.

## E. Twist

- The 3D mechanism is established and must be cited: twist gives lateral pressure and a friction lock (Hearle 1958,
  1965; Hearle, Grosberg and Backer 1969); frictional force amplification grows as exp(θ²) (Seguin and Crassous,
  PRL 2022); tension transmission in staple yarn percolates (Warren, Ball and Goldstein, PRL 2018).
- The topology: a fibre's winding about a core is a 1-with-1 linking in the transverse space, which in 4D is S², and
  S² is simply connected. So that twist cannot be *trapped* in 4D is a corollary of A and C, and the paper should say
  so itself. R. Cocan and J. O'Rourke, "Polygonal chains cannot lock in 4D" (arXiv:cs/9908005, page), is a relative.
- Not found anywhere: the statement that twist-spun staple yarn fails in 4D, a simulation of it, the twisted state
  as an unstable equilibrium, or a ribbon core as the remedy.

## G. The bench

Method lineage: Daniels 1945; Coleman 1958; Harlow and Phoenix 1978; Cox 1952; Pradhan, Hansen and Chakrabarti
(RMP 2010). Warren et al. already pose friction-limited yarn tension as a mathematical programme, the nearest
relative of our convex-energy solve. **The 4D comparison is the only novelty, and it is only as good as the
assumptions that assign the normal forces: the "zero strength" of a twisted 4D yarn is an input from E, not an
independent result of the bench.**

## H. Buildings

A "cube–tesseract law" appears in a Codidact answer (search snippet only). Maxwell counting in R^d and Asimow and
Roth give the rigidity background. Nothing found on column or beam design in four spatial dimensions.

## Genre and venues

- Genre ancestor: A. K. Dewdney, "The Planiverse project: then and now", Math. Intelligencer 22 (2000) 46 (record):
  the engineering of a 2D world.
- Precedent for 4D simulation in the literature: M. ten Bosch, "N-dimensional rigid body dynamics", ACM TOG 39 (2020)
  art. 55; Zhang and Hanson 2007; E. Parker, Int. J. Theor. Phys. 63 (2024) 3.
- Other dimensions in a physics teaching journal: Büchel and Freeman, "Why is space three-dimensional?", Am. J. Phys.
  37 (1969) 1222 (record).
- Plausible homes: arXiv physics.class-ph or physics.pop-ph first; then the American Journal of Physics or the
  Mathematical Intelligencer for the whole, or a 3D-anchored yarn paper (E against Seguin–Crassous and Warren) to a
  soft-matter venue. Bridges for the chain and weave figures.

## References (as returned; verify each before citing)

Topology: Zeeman, Ann. Math. 78 (1963) 501 (record) · Haefliger, Topology 1 (1962) 241 (record) · Carter and Saito,
*Knotted Surfaces and Their Diagrams*, AMS 1998 (record) · Kamada, *Surface-Knots in 4-Space*, Springer 2017 (record)
· Carter, Kamada, Saito, Satoh, arXiv:math/0008099 and math/0007141 (record; first title from memory) · Fadell and
Neuwirth, Math. Scand. 10 (1962) 111 (record) · Guillemin and Pollack 1974; Hirsch 1976 (record) · Rolfsen 1976
(unverified) · Cocan and O'Rourke, arXiv:cs/9908005 (page).

Mechanics: Daniels, Proc. R. Soc. A 183 (1945) 405 (record) · Coleman, J. Mech. Phys. Solids 7 (1958) 60 (record) ·
Harlow and Phoenix, J. Compos. Mater. 12 (1978) 195, 314 (record) · Cox, Br. J. Appl. Phys. 3 (1952) 72 (record) ·
Hearle, Grosberg and Backer 1969 (record) · Hearle, J. Text. Inst. 49 (1958) T389; Text. Res. J. 35 (1965) 1060
(record) · Platt, Text. Res. J. 20 (1950) 1 (record) · Pan, Text. Res. J. 62 (1992) 749 (record, secondary) ·
Gegauff 1907 (unverified: cite through Hearle) · Stuart, Br. J. Appl. Phys. 12 (1961) 559 (record) · Warren, Ball
and Goldstein, PRL 120 (2018) 158001 (record) · Seguin and Crassous, PRL 128 (2022) 078002 (record) · Poincloux,
Adda-Bedia and Lechenault, PRX 8 (2018) 021075 (record) · Pradhan, Hansen and Chakrabarti, RMP 82 (2010) 499
(record).

Rigidity: Maxwell 1864 (record, pages unconfirmed) · Asimow and Roth, Trans. AMS 245 (1978) 279 (record) ·
Calladine, Int. J. Solids Struct. 14 (1978) 161 (record).

Hobby: Hqak (wxyhly), wxyhly-en.github.io/archives/ knot4d (2019), newton4 (2020), lavie4ds (2016), trans4d (2018)
(all page) · hi.gher.space threads t=1542 "4d weaving", t=1944 "N-Dimensional Knots", t=2029 "Torisphere and
spheritorus", p=13169 "4-D shoelaces?" (all unverified).
