/* conjectures dataset — window.CONJECTURES
   136 open mathematical conjectures across 9 fields (number theory, combinatorics,
   graph theory, geometry, analysis & dynamics, algebra & arithmetic geometry,
   group theory, theoretical CS, logic). Curated; extend by appending entries.

   Schema per entry:
     id           kebab-case slug (used as the ?id= route on c.html) — keep unique
     name         display name
     field        top-level field string (drives colour/label via common.js)
     subfield     optional finer area
     posedYear    year the conjecture was first stated (number, or null)
     posedBy      who posed it
     statement    one-sentence plain statement of what it asserts
     form         compact logical form (unicode math)
     counterexample  what a disproving object concretely is
     disproof     counterexample | counterexample-hard | existence | other
     status       open | mostly-open | partial
     evidence     best partial results / verified-up-to bound
     prize        e.g. "Clay Millennium ($1M)" or ""
     tags         string[]
     links        [{label,url}] background reading
     note         2–4 sentence context paragraph for a curious non-specialist

   To add one: append an object with a unique id. The hub and detail pages,
   field filters, counts, and cross-links all derive from this array — no other
   file needs touching. (disproof "existence" flags the mirror-image problems
   that assert something exists; those don't yield to a lucky counterexample search.)
*/
window.CONJECTURES = [
  {
    "id": "birch-swinnerton-dyer",
    "name": "Birch and Swinnerton-Dyer Conjecture",
    "field": "Algebra / arithmetic geometry",
    "subfield": "Elliptic curves / L-functions",
    "posedYear": 1965,
    "posedBy": "Bryan Birch, Peter Swinnerton-Dyer",
    "statement": "The rank of the group of rational points on an elliptic curve over Q equals the order of vanishing of its Hasse–Weil L-function at s = 1.",
    "form": "rank E(ℚ) = ord_{s=1} L(E, s)",
    "counterexample": "An elliptic curve E/ℚ where the Mordell–Weil rank provably differs from ord_{s=1} L(E,s) (e.g. a rank-2 curve whose L-function has a simple zero at s=1).",
    "disproof": "counterexample-hard",
    "status": "open",
    "evidence": "Proven for analytic rank 0 and 1 (Gross–Zagier 1986, Kolyvagin 1990); Bhargava–Skinner–Zhang show a positive proportion of curves satisfy BSD. Higher rank fully open.",
    "prize": "Clay Millennium ($1M)",
    "tags": [
      "arithmetic-geometry",
      "elliptic-curves",
      "millennium"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Birch_and_Swinnerton-Dyer_conjecture"
      },
      {
        "label": "Clay Institute",
        "url": "https://www.claymath.org/millennium/birch-and-swinnerton-dyer-conjecture/"
      }
    ],
    "note": "One of the seven Clay Millennium Problems. It ties an analytic quantity (behavior of an L-function) to an algebraic one (how many independent rational solutions a cubic equation has). The full conjecture also predicts the leading coefficient in terms of arithmetic invariants like the Tate–Shafarevich group, whose finiteness is itself not known in general."
  },
  {
    "id": "bombieri-lang",
    "name": "Bombieri–Lang Conjecture",
    "field": "Algebra / arithmetic geometry",
    "subfield": "Diophantine geometry",
    "posedYear": 1974,
    "posedBy": "Enrico Bombieri, Serge Lang",
    "statement": "For a variety of general type over a number field, the rational points are not Zariski dense — they lie in a proper closed subvariety.",
    "form": "X of general type over k ⇒ X(k) not Zariski-dense in X",
    "counterexample": "A general-type variety over a number field with a Zariski-dense set of rational points.",
    "disproof": "counterexample-hard",
    "status": "open",
    "evidence": "Faltings proved the subvariety (Mordell/Lang) case for subvarieties of abelian varieties; the general higher-dimensional statement is open. A function-field analogue is known in cases.",
    "prize": "",
    "tags": [
      "arithmetic-geometry",
      "diophantine",
      "rational-points"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Bombieri%E2%80%93Lang_conjecture"
      }
    ],
    "note": "A sweeping higher-dimensional generalization of Faltings' theorem (Mordell conjecture): varieties whose canonical geometry is 'sufficiently positive' should have very few rational points. It would imply, for instance, uniform bounds on rational points and connects the geometry (type) of a variety to its arithmetic."
  },
  {
    "id": "fontaine-mazur",
    "name": "Fontaine–Mazur Conjecture",
    "field": "Algebra / arithmetic geometry",
    "subfield": "p-adic Galois representations",
    "posedYear": 1995,
    "posedBy": "Jean-Marc Fontaine, Barry Mazur",
    "statement": "An irreducible p-adic Galois representation of the absolute Galois group of a number field that is unramified outside finitely many primes and de Rham (potentially semistable) at p arises from geometry — i.e. from a subquotient of étale cohomology of an algebraic variety.",
    "form": "ρ irreducible, unramified a.e., de Rham at p ⇒ ρ is 'geometric'",
    "counterexample": "An irreducible de Rham, almost-everywhere-unramified p-adic representation that provably does not appear in the étale cohomology of any variety.",
    "disproof": "counterexample-hard",
    "status": "open",
    "evidence": "Major two-dimensional cases over ℚ proven via modularity lifting (Kisin, Emerton, and others building on Taylor–Wiles). Higher dimension largely open.",
    "prize": "",
    "tags": [
      "arithmetic-geometry",
      "galois",
      "langlands"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Fontaine%E2%80%93Mazur_conjecture"
      }
    ],
    "note": "A cornerstone linking the Langlands program to arithmetic geometry: it characterizes exactly which p-adic Galois representations 'come from geometry' by two local-global conditions. Progress in dimension two is intertwined with the modularity techniques that resolved Fermat's Last Theorem and the Sato–Tate conjecture."
  },
  {
    "id": "hodge-conjecture",
    "name": "Hodge Conjecture",
    "field": "Algebra / arithmetic geometry",
    "subfield": "Algebraic geometry / Hodge theory",
    "posedYear": 1950,
    "posedBy": "W. V. D. Hodge",
    "statement": "On a smooth complex projective variety, every rational Hodge class is a rational linear combination of the cohomology classes of algebraic subvarieties.",
    "form": "Hdg^k(X) = H^{k,k}(X) ∩ H^{2k}(X,ℚ) ⊆ image(cycle class map)",
    "counterexample": "A projective variety with a rational (k,k)-class that is provably not a ℚ-combination of algebraic cycle classes.",
    "disproof": "counterexample-hard",
    "status": "open",
    "evidence": "Known for divisors (Lefschetz (1,1)-theorem), for abelian varieties in many cases, and low dimensions; Grothendieck corrected the naive integral version. General case open.",
    "prize": "Clay Millennium ($1M)",
    "tags": [
      "arithmetic-geometry",
      "hodge-theory",
      "millennium"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Hodge_conjecture"
      },
      {
        "label": "Clay Institute",
        "url": "https://www.claymath.org/millennium/hodge-conjecture/"
      }
    ],
    "note": "A Millennium Problem asking how much of the topology of an algebraic variety is 'seen' by its algebraic subvarieties. It is a bridge between analysis (harmonic differential forms), topology (cohomology), and algebraic geometry. The integer-coefficient version is false, so the conjecture is stated with rational coefficients."
  },
  {
    "id": "tate-conjecture",
    "name": "Tate Conjecture",
    "field": "Algebra / arithmetic geometry",
    "subfield": "Étale cohomology / motives",
    "posedYear": 1963,
    "posedBy": "John Tate",
    "statement": "On a smooth projective variety over a finitely generated field, the Galois-invariant classes in ℓ-adic étale cohomology are spanned by classes of algebraic cycles.",
    "form": "H^{2i}_{ét}(X̄, ℚ_ℓ(i))^{G_k} = image(cycle class map) ⊗ ℚ_ℓ",
    "counterexample": "A variety and a Galois-fixed ℓ-adic cohomology class provably not in the span of algebraic cycle classes.",
    "disproof": "counterexample-hard",
    "status": "open",
    "evidence": "Known for divisors on abelian varieties (Tate, Faltings, Zarhin), K3 surfaces (Nygaard, Charles, Madapusi Pera), and some Shimura varieties. Open in general.",
    "prize": "",
    "tags": [
      "arithmetic-geometry",
      "galois",
      "motives"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Tate_conjecture"
      }
    ],
    "note": "The arithmetic-geometry sibling of the Hodge conjecture: instead of Hodge classes over ℂ, it predicts that Galois-symmetry-invariant cohomology classes come from algebraic subvarieties. It underlies much of the theory of motives and is closely tied to finiteness statements for varieties over finite and number fields."
  },
  {
    "id": "zauner-sic-povm",
    "name": "Zauner's Conjecture (SIC-POVMs)",
    "field": "Algebra / arithmetic geometry",
    "subfield": "Algebraic number theory / quantum information",
    "posedYear": 1999,
    "posedBy": "Gerhard Zauner",
    "statement": "In every finite dimension d there exists a symmetric informationally complete positive-operator-valued measure — a set of d² equiangular unit vectors in ℂ^d.",
    "form": "∀ d ≥ 2, ∃ {|ψ_j⟩}_{j=1}^{d²} ⊂ ℂ^d with |⟨ψ_i|ψ_j⟩|² = 1/(d+1) for i ≠ j",
    "counterexample": "A dimension d for which one could prove no such configuration of d² equiangular lines exists (a non-existence proof for one d).",
    "disproof": "existence",
    "status": "open",
    "evidence": "Exact solutions constructed in dimensions 1–21, 24, 28, 30, 31, 35, 37, 39, 43, 48, 124, 323, etc.; numerical solutions up to ~151 and beyond. A 2024–2025 program (Kopp, Appleby, et al.) constructs SICs in infinitely many dimensions conditional on the Stark conjectures — still not unconditional.",
    "prize": "",
    "tags": [
      "number-theory",
      "quantum-information",
      "existence"
    ],
    "links": [
      {
        "label": "Wikipedia (SIC-POVM)",
        "url": "https://en.wikipedia.org/wiki/SIC-POVM"
      },
      {
        "label": "arXiv 2407.08048",
        "url": "https://arxiv.org/abs/2407.08048"
      }
    ],
    "note": "An existence conjecture from quantum measurement theory that turned out to be deep number theory: the vectors' entries generate abelian extensions of real quadratic fields, tying SIC existence to Hilbert's 12th problem and the Stark conjectures. Verified in many dimensions by exact and numerical construction, but no proof covers all d."
  },
  {
    "id": "berry-tabor-conjecture",
    "name": "Berry–Tabor conjecture",
    "field": "Analysis & dynamics",
    "subfield": "Quantum chaos / mathematical physics",
    "posedYear": 1977,
    "posedBy": "Michael Berry and Michael Tabor",
    "statement": "For a generic classically-integrable quantum system, the local statistics of high-energy eigenvalues follow those of a Poisson (random, uncorrelated) point process.",
    "form": "Generic integrable H ⇒ rescaled eigenvalue spacings of Ĥ converge (as E→∞) to Poisson statistics",
    "counterexample": "A generic integrable system whose eigenvalue-spacing distribution demonstrably deviates from Poisson (e.g. shows level repulsion) in the semiclassical limit.",
    "disproof": "counterexample",
    "status": "open",
    "evidence": "Genericity is essential — non-generic integrable systems (e.g. the harmonic oscillator, rational flat tori) violate Poisson statistics. Rigorous results exist for the pair-correlation of eigenvalues of flat tori for almost every metric (Sarnak; Eskin–Margulis–Mozes on the Oppenheim/quadratic-forms side), but the full spacing conjecture is open.",
    "prize": "",
    "tags": [
      "quantum-chaos",
      "mathematical-physics",
      "spectral-statistics"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Berry%E2%80%93Tabor_conjecture"
      }
    ],
    "note": "The companion to the Bohigas–Giannoni–Schmit picture: chaotic quantum systems show random-matrix (repelling) spectra, while integrable ones should show uncorrelated, Poisson-like levels. Making 'generic' precise is the crux — special integrable systems break Poisson statistics — and even the eigenvalue pair-correlation for flat tori is only partially proven."
  },
  {
    "id": "casas-alvero-conjecture",
    "name": "Casas-Alvero conjecture",
    "field": "Analysis & dynamics",
    "subfield": "Complex analysis / polynomials",
    "posedYear": 2001,
    "posedBy": "Eduard Casas-Alvero",
    "statement": "A univariate polynomial over a characteristic-zero field that shares a common root with each of its derivatives f′, f″, …, f^(d−1) must be a power of a linear polynomial.",
    "form": "char K = 0, deg f = d, ∀ i∈{1,…,d−1} gcd(f, f^(i)) ≠ 1 ⇒ f = c(x−a)ᵈ",
    "counterexample": "A polynomial of degree d, not of the form c(x−a)ᵈ, that nonetheless has a root in common with every one of its derivatives.",
    "disproof": "counterexample",
    "status": "mostly-open",
    "evidence": "Verified for degrees d = pᵉ, 2pᵉ, 3pᵉ, 4pᵉ, 5pᵉ (p prime) via reduction mod p (Graf von Bothmer–Labs–Schicho–van de Woestijne 2007) and low degrees by computer. A January 2025 preprint (S. Ghosh, arXiv:2501.09272) claims a full proof for all d ≥ 3 over characteristic-zero fields using Koszul homology, but it is not yet peer-reviewed/verified.",
    "prize": "",
    "tags": [
      "polynomials",
      "complex-analysis",
      "algebra"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Casas-Alvero_conjecture"
      },
      {
        "label": "Ghosh 2025 preprint",
        "url": "https://arxiv.org/abs/2501.09272"
      }
    ],
    "note": "A crisp finiteness question: sharing a root with all your derivatives is a strong constraint — strong enough to force the polynomial to be a pure power? It fails in positive characteristic (giving explicit counterexamples there), which is why the characteristic-zero case is subtle. A 2025 preprint claims to close it, but until that is checked the general conjecture is treated as open."
  },
  {
    "id": "crouzeix-conjecture",
    "name": "Crouzeix's conjecture",
    "field": "Analysis & dynamics",
    "subfield": "Matrix analysis / operator theory",
    "posedYear": 2004,
    "posedBy": "Michel Crouzeix",
    "statement": "For every square matrix A and every polynomial p, the operator-norm bound ‖p(A)‖ ≤ 2·max{|p(z)| : z ∈ W(A)} holds, where W(A) is the numerical range.",
    "form": "∀ A ∈ ℂⁿˣⁿ, ∀ p ∈ ℂ[z]: ‖p(A)‖ ≤ 2 · sup_{z∈W(A)} |p(z)|",
    "counterexample": "A specific matrix A and polynomial p for which ‖p(A)‖ exceeds twice the sup of |p| over the numerical range.",
    "disproof": "counterexample",
    "status": "open",
    "evidence": "Crouzeix–Palencia (2017) proved the constant 1+√2 in place of 2; this remains the best universal bound. The sharp constant 2 is known for special classes: normal matrices, 2×2 matrices, nearly-Jordan blocks, certain tridiagonal and shift matrices. Numerical experiments strongly support 2 and it is conjectured sharp.",
    "prize": "",
    "tags": [
      "matrix-analysis",
      "numerical-range",
      "operator-theory"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Crouzeix%27s_conjecture"
      },
      {
        "label": "Crouzeix–Palencia (SIAM)",
        "url": "https://epubs.siam.org/doi/10.1137/17M1143757"
      }
    ],
    "note": "A clean, concrete inequality linking how much a polynomial can amplify a matrix to the polynomial's size on the matrix's numerical range (field of values). It is directly disprovable: one matrix-polynomial pair breaking the factor of 2 kills it. Best proven constant is 1+√2 ≈ 2.414; closing the gap to 2 is the open problem."
  },
  {
    "id": "dixmier-conjecture",
    "name": "Dixmier conjecture",
    "field": "Analysis & dynamics",
    "subfield": "Operator algebras / noncommutative analysis",
    "posedYear": 1968,
    "posedBy": "Jacques Dixmier",
    "statement": "Every algebra endomorphism of the Weyl algebra Aₙ (the algebra of polynomial differential operators) is an automorphism.",
    "form": "∀ φ ∈ End(Aₙ), φ ≠ 0 ⇒ φ ∈ Aut(Aₙ)",
    "counterexample": "A nonzero endomorphism of the Weyl algebra A₁ = ⟨x, ∂ : [∂,x]=1⟩ that is not surjective.",
    "disproof": "counterexample",
    "status": "open",
    "evidence": "Open even for A₁. Tsuchimoto (2005) and Belov-Kanel–Kontsevich (2007) proved the stable equivalence Dixmierₙ ⇔ Jacobian₂ₙ, tying it to the Jacobian conjecture. Partial results for endomorphisms preserving extra structure.",
    "prize": "",
    "tags": [
      "weyl-algebra",
      "noncommutative",
      "operator-algebras"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Weyl_algebra#Dixmier_conjecture"
      },
      {
        "label": "Belov-Kanel–Kontsevich",
        "url": "https://arxiv.org/abs/math/0512171"
      }
    ],
    "note": "The Weyl algebra is the quantum-mechanical algebra generated by position and momentum. Dixmier asks whether it has no proper endomorphisms — a rigidity statement. Remarkably, it was shown to be essentially equivalent to the Jacobian conjecture, so the noncommutative 'quantum' problem and the classical polynomial-map problem stand or fall together."
  },
  {
    "id": "four-exponentials-conjecture",
    "name": "Four exponentials conjecture",
    "field": "Analysis & dynamics",
    "subfield": "Transcendental number theory",
    "posedYear": 1944,
    "posedBy": "Independently by Alaoglu–Erdős, Leonidas Alaoglu, and later Schneider/Lang/Ramachandra",
    "statement": "If x₁, x₂ are two complex numbers linearly independent over ℚ, and y₁, y₂ likewise linearly independent over ℚ, then at least one of the four numbers exp(xᵢyⱼ) is transcendental.",
    "form": "x₁,x₂ ℚ-lin. indep.; y₁,y₂ ℚ-lin. indep. ⇒ ∃ i,j: exp(xᵢyⱼ) ∉ ℚ̄",
    "counterexample": "A pair (x₁,x₂) and pair (y₁,y₂), each ℚ-linearly independent, making all four exp(xᵢyⱼ) simultaneously algebraic.",
    "disproof": "counterexample",
    "status": "open",
    "evidence": "The six exponentials theorem (Siegel, Lang, Ramachandra) — the analogous 2×3 statement — is fully proven. The sharp four exponentials case remains open. The weaker 'strong/sharp six exponentials' and 'five exponentials' theorems are known (Waldschmidt, Damien Roy).",
    "prize": "",
    "tags": [
      "transcendence",
      "number-theory",
      "complex-analysis"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Four_exponentials_conjecture"
      }
    ],
    "note": "A tantalizing near-miss in transcendence theory: replace the six exponentials theorem's 2×3 grid with a 2×2 grid and the same conclusion is conjectured but unproven. Concretely, it would follow that numbers like 2^(√2·t) can't all be algebraic for independent exponents — but the missing case has resisted the current analytic methods that comfortably handle six exponentials."
  },
  {
    "id": "furstenberg-times2-times3",
    "name": "Furstenberg ×2, ×3 conjecture",
    "field": "Analysis & dynamics",
    "subfield": "Ergodic theory",
    "posedYear": 1967,
    "posedBy": "Hillel Furstenberg",
    "statement": "The only Borel probability measures on the circle simultaneously invariant and ergodic under both x↦2x and x↦3x are Lebesgue measure and measures supported on finite (rational) orbits.",
    "form": "μ ergodic and invariant under ×2 and ×3 on ℝ/ℤ ⇒ μ = Lebesgue or μ atomic on a finite rational orbit",
    "counterexample": "A non-atomic, ×2- and ×3-invariant ergodic measure on the circle that is not Lebesgue measure.",
    "disproof": "counterexample",
    "status": "open",
    "evidence": "Furstenberg (1967) proved every closed ×2,×3-invariant subset of the circle is finite or everything (the topological analogue). Rudolph (1990) and Johnson proved the measure conjecture under the extra hypothesis of positive entropy for one of the maps; the zero-entropy case is exactly what remains open.",
    "prize": "",
    "tags": [
      "ergodic-theory",
      "dynamics",
      "measure-rigidity"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Furstenberg_conjecture"
      }
    ],
    "note": "Multiplication by 2 and by 3 on the circle are individually chaotic, but the conjecture says that requiring a measure to respect both is enormously rigid — it must be either the obvious uniform measure or trivially supported on rationals. Rudolph's theorem settles the positive-entropy case; the stubborn zero-entropy possibility is the open frontier and a prototype for measure-rigidity phenomena."
  },
  {
    "id": "invariant-subspace-problem",
    "name": "Invariant subspace problem (Hilbert space)",
    "field": "Analysis & dynamics",
    "subfield": "Operator theory / functional analysis",
    "posedYear": 1935,
    "posedBy": "John von Neumann (attributed; classical formulation mid-20th century)",
    "statement": "Every bounded linear operator on an infinite-dimensional separable complex Hilbert space has a nontrivial closed invariant subspace.",
    "form": "∀ T ∈ B(H), dim H = ∞ separable ⇒ ∃ closed M ⊂ H, {0} ⊊ M ⊊ H, T(M) ⊆ M",
    "counterexample": "A bounded operator on ℓ² whose only closed invariant subspaces are {0} and the whole space.",
    "disproof": "counterexample",
    "status": "mostly-open",
    "evidence": "False on general Banach spaces — Enflo (1975/1987) and Read (1984) built operators with no nontrivial invariant subspace. For Hilbert space it remains unsettled; Per Enflo posted a preprint claiming a positive proof (arXiv:2305.15442, 2023) but it is not peer-reviewed or accepted by the community as of 2026. Positive for many operator classes (normal, compact — Aronszajn–Smith 1954; polynomially compact — Bernstein–Robinson 1966).",
    "prize": "",
    "tags": [
      "operator-theory",
      "functional-analysis"
    ],
    "links": [
      {
        "label": "Enflo 2023 preprint",
        "url": "https://arxiv.org/abs/2305.15442"
      },
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Invariant_subspace_problem"
      }
    ],
    "note": "Does every operator on Hilbert space leave some non-trivial subspace invariant? The Banach-space version is famously false, but the Hilbert case — the one that matters most — is still open. A 2023 preprint by Enflo (who disproved the Banach case) claims a positive resolution, but it has not passed peer review, so the problem is treated as unresolved."
  },
  {
    "id": "jacobian-conjecture",
    "name": "Jacobian conjecture",
    "field": "Analysis & dynamics",
    "subfield": "Complex analysis / algebraic geometry",
    "posedYear": 1939,
    "posedBy": "Ott-Heinrich Keller",
    "statement": "A polynomial map F: ℂⁿ → ℂⁿ whose Jacobian determinant is a nonzero constant is invertible, with polynomial inverse.",
    "form": "F: ℂⁿ → ℂⁿ polynomial, det(JF) ∈ ℂ∖{0} ⇒ F is bijective and F⁻¹ is polynomial",
    "counterexample": "A polynomial self-map of ℂⁿ (n ≥ 2) with constant nonzero Jacobian that fails to be injective (or lacks a polynomial inverse).",
    "disproof": "counterexample",
    "status": "open",
    "evidence": "Trivial for n = 1. Reduction to degree-3 cubic-homogeneous maps in all dimensions (Bass–Connell–Wright 1982; Yagzhev). Reduction to the case of nilpotent Jacobian. Wang (1980) proved it for maps of degree ≤ 2. Numerous false proofs; no counterexample known for any n ≥ 2. Equivalent to the Dixmier conjecture in the stable limit.",
    "prize": "",
    "tags": [
      "polynomial-maps",
      "algebraic-geometry",
      "complex-analysis"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Jacobian_conjecture"
      }
    ],
    "note": "Listed by Smale among his problems for the 21st century. A constant nonzero Jacobian is exactly the algebraic shadow of local invertibility everywhere; the conjecture says that for polynomial maps this forces global polynomial invertibility. It is notorious for attracting flawed proofs, and remains open even in dimension 2."
  },
  {
    "id": "lindelof-hypothesis",
    "name": "Lindelöf hypothesis",
    "field": "Analysis & dynamics",
    "subfield": "Analytic number theory / complex analysis",
    "posedYear": 1908,
    "posedBy": "Ernst Leonard Lindelöf",
    "statement": "The Riemann zeta function grows subpolynomially on the critical line: ζ(1/2 + it) = O(t^ε) for every ε > 0.",
    "form": "∀ ε > 0: ζ(½ + it) = O_ε(|t|^ε) as t → ∞",
    "counterexample": "An exponent δ > 0 and a sequence tₙ → ∞ with |ζ(½ + itₙ)| ≥ tₙ^δ (a genuine polynomial lower spike), refuting subpolynomial growth.",
    "disproof": "counterexample",
    "status": "open",
    "evidence": "Implied by the Riemann Hypothesis. Equivalent to a bound on the number of zeros in vertical strips slightly right of the critical line. Steadily improving subconvexity exponents μ(1/2): from 1/6 (Hardy–Littlewood, Weyl) down to 13/84 ≈ 0.1548 (Bourgain 2017), versus the target 0.",
    "prize": "",
    "tags": [
      "zeta-function",
      "analytic-number-theory",
      "complex-analysis"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Lindel%C3%B6f_hypothesis"
      },
      {
        "label": "Bourgain 2017",
        "url": "https://arxiv.org/abs/1408.5794"
      }
    ],
    "note": "A statement about how large the zeta function can get on the critical line — weaker than the Riemann Hypothesis but still unproven. It is equivalent to a natural density condition on zeta zeros and drives error terms in the distribution of primes. The 'subconvexity' industry has pushed the exponent from 1/6 toward 0 over a century, reaching 13/84, but the target of arbitrarily small growth is still out of reach."
  },
  {
    "id": "littlewood-conjecture",
    "name": "Littlewood conjecture",
    "field": "Analysis & dynamics",
    "subfield": "Diophantine approximation / ergodic theory",
    "posedYear": 1930,
    "posedBy": "John Edensor Littlewood",
    "statement": "For every pair of real numbers α, β, the product n·‖nα‖·‖nβ‖ can be made arbitrarily small (‖·‖ = distance to the nearest integer).",
    "form": "∀ α,β ∈ ℝ: liminf_{n→∞} n · ‖nα‖ · ‖nβ‖ = 0",
    "counterexample": "A pair (α, β) and a constant c > 0 with n·‖nα‖·‖nβ‖ ≥ c for all n ≥ 1.",
    "disproof": "counterexample",
    "status": "open",
    "evidence": "Einsiedler–Katok–Lindenstrauss (2006) proved, via measure rigidity of the diagonal action on SL(3,ℝ)/SL(3,ℤ), that the set of exceptional pairs (α,β) has Hausdorff dimension 0. Holds whenever α or β is not badly approximable.",
    "prize": "",
    "tags": [
      "diophantine-approximation",
      "ergodic-theory",
      "dynamics"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Littlewood_conjecture"
      },
      {
        "label": "EKL 2006 (Annals)",
        "url": "https://annals.math.princeton.edu/2006/164-2/p02"
      }
    ],
    "note": "A simultaneous-approximation statement: no matter which two irrationals you pick, some multiple n makes both nα and nβ jointly very close to integers, weighted against n. The homogeneous-dynamics attack of Einsiedler–Katok–Lindenstrauss shrank any possible set of counterexamples to dimension zero, but did not eliminate it — so the conjecture stands."
  },
  {
    "id": "mlc-mandelbrot-locally-connected",
    "name": "MLC — the Mandelbrot set is locally connected",
    "field": "Analysis & dynamics",
    "subfield": "Complex dynamics",
    "posedYear": 1982,
    "posedBy": "Adrien Douady and John Hubbard",
    "statement": "The Mandelbrot set is locally connected (and hence combinatorially rigid, described by Thurston's pinched-disk/lamination model).",
    "form": "∀ c ∈ ∂M, ∀ ε>0 ∃ connected open U ∋ c with diam(U) < ε and U∩M connected",
    "counterexample": "A parameter c on the boundary of M around which M is not locally connected — e.g. an infinitely renormalizable parameter with divergent geometry (no a priori bounds).",
    "disproof": "counterexample-hard",
    "status": "open",
    "evidence": "Yoccoz proved MLC at all finitely renormalizable parameters. A priori bounds and MLC established for large infinitely-renormalizable classes: bounded primitive type (Kahn), and Feigenbaum/period-doubling and certain bounded satellite parameters (Dudko–Lyubich 2023, arXiv:2309.02107). The general infinitely-renormalizable case remains open.",
    "prize": "",
    "tags": [
      "complex-dynamics",
      "fractals",
      "renormalization"
    ],
    "links": [
      {
        "label": "Dudko–Lyubich 2023",
        "url": "https://arxiv.org/abs/2309.02107"
      },
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Mandelbrot_set#Local_connectivity"
      }
    ],
    "note": "MLC would imply that the Mandelbrot set is completely described by a simple combinatorial model and that quadratic dynamics is rigid — arguably the central open problem in one-dimensional complex dynamics. Decades of deep renormalization theory have chipped away at the infinitely-renormalizable parameters; recent Dudko–Lyubich work closed the celebrated Feigenbaum point, but the full conjecture stands."
  },
  {
    "id": "montgomery-pair-correlation",
    "name": "Montgomery's pair correlation conjecture",
    "field": "Analysis & dynamics",
    "subfield": "Analytic number theory / mathematical physics",
    "posedYear": 1973,
    "posedBy": "Hugh Montgomery",
    "statement": "The pair correlation of the nontrivial zeros of the Riemann zeta function matches that of eigenvalues of large random Hermitian (GUE) matrices, with correlation kernel 1 − (sin πu / πu)².",
    "form": "As T→∞, pair-correlation density of normalized zeros → 1 − (sin(πu)/(πu))² (the GUE form factor)",
    "counterexample": "Statistical evidence or a proof that the zero pair-correlation deviates from the GUE sine-kernel form (e.g. lacks the characteristic small-gap repulsion).",
    "disproof": "counterexample",
    "status": "open",
    "evidence": "Montgomery (1973) proved the conjecture for test functions whose Fourier transform is supported in (−1,1), assuming RH — matching GUE in that range. Extended and supported by Odlyzko's large-scale numerical computations of zeros, and by function-field analogues (Katz–Sarnak). The full statement (all support) is open and generally taken to require RH.",
    "prize": "",
    "tags": [
      "zeta-function",
      "random-matrix-theory",
      "analytic-number-theory"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Montgomery%27s_pair_correlation_conjecture"
      }
    ],
    "note": "The origin of the celebrated link between the Riemann zeros and random-matrix theory — sparked by Montgomery's 1973 conversation with Freeman Dyson. It predicts that zeta zeros repel each other exactly like energy levels of a chaotic quantum system (GUE statistics). Montgomery proved it in a restricted range under RH, and Odlyzko's computations match spectacularly, but the general conjecture is unproven."
  },
  {
    "id": "navier-stokes-global-regularity",
    "name": "Navier–Stokes existence and smoothness",
    "field": "Analysis & dynamics",
    "subfield": "PDE",
    "posedYear": 1934,
    "posedBy": "Jean Leray (existence question); formalized as a Clay Millennium Problem (2000)",
    "statement": "For the 3D incompressible Navier–Stokes equations, smooth, finite-energy initial data always yields a globally defined smooth solution (no finite-time blow-up).",
    "form": "∀ u₀ ∈ C^∞_σ, finite energy ⇒ ∃! u ∈ C^∞(ℝ³×[0,∞)) solving ∂ₜu + (u·∇)u = −∇p + νΔu, ∇·u = 0",
    "counterexample": "A smooth, finite-energy velocity field whose solution develops a singularity (unbounded velocity/vorticity) in finite time.",
    "disproof": "counterexample-hard",
    "status": "open",
    "evidence": "Leray–Hopf weak solutions exist globally but need not be smooth or unique; local-in-time smooth solutions exist (Kato, Fujita). Conditional regularity criteria (Prodi–Serrin, Beale–Kato–Majda 1984); partial regularity (Caffarelli–Kohn–Nirenberg 1982). Averaged-equation blow-up (Tao 2016) shows the energy method alone cannot settle it.",
    "prize": "Clay Millennium ($1M)",
    "tags": [
      "pde",
      "fluid-dynamics",
      "millennium"
    ],
    "links": [
      {
        "label": "Clay Institute",
        "url": "https://www.claymath.org/millennium/navier-stokes-equation/"
      },
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Navier%E2%80%93Stokes_existence_and_smoothness"
      }
    ],
    "note": "One of the seven Clay Millennium Problems. It asks whether the equations governing viscous fluid flow can ever produce a singularity from smooth data, or whether solutions stay smooth forever. A finite-time blow-up solution would refute global regularity; a proof of no-blow-up would confirm it. Either resolution would transform PDE theory."
  },
  {
    "id": "palis-density-hyperbolicity",
    "name": "Palis conjecture (finitude / density of dynamics)",
    "field": "Analysis & dynamics",
    "subfield": "Dynamical systems",
    "posedYear": 1995,
    "posedBy": "Jacob Palis",
    "statement": "A dense set of smooth dynamical systems has only finitely many attractors, whose basins cover almost all of phase space, and which are stochastically stable under noise.",
    "form": "∃ dense D ⊆ Diff^r(M): ∀ f ∈ D, f has finitely many attractors A₁,…,A_k with ⋃ basin(Aᵢ) of full Lebesgue measure and each Aᵢ stochastically stable",
    "counterexample": "A whole open set of diffeomorphisms none of which can be approximated by a system with finitely many physical measures — e.g. persistent infinitely-many-attractor (Newhouse) phenomena filling an open region.",
    "disproof": "counterexample",
    "status": "mostly-open",
    "evidence": "Proven in one-dimensional dynamics: hyperbolicity is dense among real polynomial/analytic and C^k unimodal maps (Kozlovski–Shen–van Strien 2007; earlier Graczyk–Świątek, Lyubich for quadratics). Wide-open in dimension ≥ 2, where Newhouse and Bonatti–Díaz phenomena make the picture far subtler.",
    "prize": "",
    "tags": [
      "dynamical-systems",
      "attractors",
      "hyperbolicity"
    ],
    "links": [
      {
        "label": "Palis programme (overview)",
        "url": "https://en.wikipedia.org/wiki/Palis_conjecture"
      }
    ],
    "note": "Palis's grand program asks whether 'typical' dynamical systems are ultimately tame: finitely many attractors capturing almost every orbit, robust against small noise. It was fully confirmed in one dimension by the density-of-hyperbolicity theorems, but in two or more dimensions the coexistence of infinitely many attractors on open sets makes even the right formulation delicate, and it remains a guiding open problem in dynamics."
  },
  {
    "id": "quantum-unique-ergodicity",
    "name": "Quantum unique ergodicity (Rudnick–Sarnak)",
    "field": "Analysis & dynamics",
    "subfield": "Quantum chaos / spectral theory",
    "posedYear": 1994,
    "posedBy": "Zeév Rudnick and Peter Sarnak",
    "statement": "On a compact negatively-curved (Anosov) manifold, the probability densities of high-energy Laplace eigenfunctions equidistribute — converging to the uniform (Liouville) measure — with no exceptional subsequence.",
    "form": "M compact, negatively curved; Δφⱼ = −λⱼφⱼ, λⱼ→∞ ⇒ |φⱼ|² dvol ⇀ dvol/vol(M) (whole sequence, no escape of mass)",
    "counterexample": "A sequence of eigenfunctions whose mass concentrates (scars) on a submanifold or a closed geodesic instead of spreading uniformly.",
    "disproof": "counterexample",
    "status": "partial",
    "evidence": "Quantum ergodicity (equidistribution along a density-1 subsequence) holds generally (Šnirelman–Zelditch–Colin de Verdière). Arithmetic QUE proven: Hecke-eigenfunctions on arithmetic hyperbolic surfaces (Lindenstrauss 2006, using measure rigidity; completed by Soundararajan) and the holomorphic case (Holowinsky–Soundararajan 2010). The general (non-arithmetic) conjecture is open; scarring is known in some non-QUE toy models (e.g. quantized cat maps).",
    "prize": "",
    "tags": [
      "quantum-chaos",
      "spectral-theory",
      "ergodic-theory"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Quantum_ergodicity#Quantum_unique_ergodicity"
      },
      {
        "label": "Lindenstrauss 2006 (Annals)",
        "url": "https://annals.math.princeton.edu/2006/163-1/p05"
      }
    ],
    "note": "Do high-energy quantum states on a chaotic billiard/surface spread out evenly, or can they 'scar' onto classical orbits? QUE says they must spread out completely. Lindenstrauss's Fields-Medal-cited proof settled the arithmetic (Hecke) case via measure rigidity, but the conjecture for general negatively-curved manifolds — and the possibility of exceptional scarring sequences — remains open."
  },
  {
    "id": "sendov-conjecture",
    "name": "Sendov's conjecture",
    "field": "Analysis & dynamics",
    "subfield": "Complex analysis",
    "posedYear": 1958,
    "posedBy": "Blagovest Sendov",
    "statement": "If every root of a complex polynomial of degree ≥ 2 lies in the closed unit disk, then every root has a critical point (root of the derivative) within distance 1 of it.",
    "form": "deg f = n ≥ 2, all zeros in {|z|≤1}, f(λ)=0 ⇒ ∃ ζ: f′(ζ)=0 and |ζ−λ| ≤ 1",
    "counterexample": "A polynomial with all roots in the unit disk and one root λ such that every critical point is farther than distance 1 from λ.",
    "disproof": "counterexample",
    "status": "partial",
    "evidence": "Proven for degree n < 9 (Brown–Xiang 1999) and for all sufficiently large n (Tao 2020, arXiv:2012.04125). The gap of intermediate degrees between 9 and Tao's (ineffective) threshold n₀ remains open.",
    "prize": "",
    "tags": [
      "complex-analysis",
      "polynomials",
      "geometry-of-zeros"
    ],
    "links": [
      {
        "label": "Tao 2020",
        "url": "https://arxiv.org/abs/2012.04125"
      },
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Sendov%27s_conjecture"
      }
    ],
    "note": "A deceptively simple statement about how the roots of a polynomial's derivative track its roots. Tao's 2020 paper settled all sufficiently high degrees using a compactness/limiting-polynomial argument, but because the threshold is ineffective, a finite band of degrees is still formally unresolved — so it counts as a striking partial result rather than a full theorem."
  },
  {
    "id": "riemann-zeta-simple-zeros",
    "name": "Simple zeros conjecture for the Riemann zeta function",
    "field": "Analysis & dynamics",
    "subfield": "Analytic number theory / complex analysis",
    "posedYear": 1900,
    "posedBy": "Classical (attributed to the analytic-number-theory tradition; studied by Montgomery and others)",
    "statement": "All nontrivial zeros of the Riemann zeta function are simple (each has multiplicity one).",
    "form": "ζ(ρ) = 0, 0 < Re ρ < 1 ⇒ ζ′(ρ) ≠ 0",
    "counterexample": "A single nontrivial zero ρ of ζ at which ζ′(ρ) = 0 as well — a multiple zero.",
    "disproof": "counterexample",
    "status": "open",
    "evidence": "At least ~70% of nontrivial zeros are known to be simple (Bui–Heath-Brown and later refinements; Montgomery's pair-correlation heuristic predicts a full-density proportion under RH). No multiple zero has ever been found in extensive computation, but no proof of full simplicity exists.",
    "prize": "",
    "tags": [
      "zeta-function",
      "analytic-number-theory",
      "complex-analysis"
    ],
    "links": [
      {
        "label": "Simple zeros (overview)",
        "url": "https://en.wikipedia.org/wiki/Riemann_zeta_function#Zeros,_the_critical_line,_and_the_Riemann_hypothesis"
      }
    ],
    "note": "Beyond asking where the zeta zeros lie (the Riemann Hypothesis), one can ask whether any of them coincide. The simple-zeros conjecture says no — every zero is a clean single root. It matters because multiple zeros would disrupt explicit formulas relating zeros to primes. Roughly two-thirds of the zeros are provably simple, and none has ever been seen to be otherwise, but a full proof is open."
  },
  {
    "id": "weinstein-conjecture",
    "name": "Weinstein conjecture",
    "field": "Analysis & dynamics",
    "subfield": "Symplectic / contact dynamics",
    "posedYear": 1979,
    "posedBy": "Alan Weinstein",
    "statement": "Every Reeb vector field on a closed contact manifold has at least one closed (periodic) orbit.",
    "form": "(M²ⁿ⁺¹, α) closed contact manifold, R the Reeb field of α ⇒ R has a periodic orbit",
    "counterexample": "A closed contact manifold in some dimension whose Reeb flow has no periodic orbit whatsoever.",
    "disproof": "counterexample",
    "status": "partial",
    "evidence": "Proven in dimension 3 for all closed oriented 3-manifolds by Taubes (2007) via Seiberg–Witten Floer theory / embedded contact homology. Established earlier in many higher-dimensional settings (Viterbo 1987 for hypersurfaces of contact type in ℝ²ⁿ; Hofer 1993 for overtwisted and S³-type). The general higher-dimensional case remains open.",
    "prize": "",
    "tags": [
      "contact-geometry",
      "symplectic",
      "periodic-orbits"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Weinstein_conjecture"
      },
      {
        "label": "Hutchings survey of Taubes",
        "url": "https://arxiv.org/abs/0906.2444"
      }
    ],
    "note": "A statement about Hamiltonian dynamics: on the right kind of energy surface, motion must always contain a closed loop. Taubes's landmark 2007 proof settled every closed 3-manifold using deep gauge theory, which is why this is a strong partial result. In higher dimensions many cases are known but the full conjecture is unresolved."
  },
  {
    "id": "one-third-two-thirds",
    "name": "1/3–2/3 Conjecture",
    "field": "Combinatorics",
    "subfield": "Order theory",
    "posedYear": 1968,
    "posedBy": "Sergey Kislitsyn (also Fredman; Linial)",
    "statement": "Every finite partially ordered set that is not a total order contains a pair of elements x, y such that the fraction of linear extensions placing x before y lies between 1/3 and 2/3.",
    "form": "P finite poset, not a chain ⟹ ∃x,y : 1/3 ≤ Pr[x<y in random linear extension] ≤ 2/3",
    "counterexample": "A finite non-total poset in which every pair of incomparable elements is 'unbalanced' — each ordered one way in either under 1/3 or over 2/3 of all linear extensions.",
    "disproof": "counterexample-hard",
    "status": "open",
    "evidence": "Known for posets of width 2, semiorders, height-2 posets, N-free posets, Boolean/partition/subspace lattices, posets from Young diagrams, and all posets with at most 11 elements. Kahn–Saks proved a weaker 3/11–8/11 balance in general. The exact 1/3–2/3 constants are conjectured optimal (tight on the 3-element V/Λ poset).",
    "prize": "",
    "tags": [
      "posets",
      "order-theory",
      "linear-extensions",
      "sorting"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/1/3%E2%80%932/3_conjecture"
      }
    ],
    "note": "Interpreted via sorting, it says any unknown partial order can always be probed with a comparison that resolves close to a third-versus-two-thirds split of remaining possibilities — near-optimal information. Despite piecemeal verification for many families, the general statement resists proof, and a disproof would be a single unbalanced poset."
  },
  {
    "id": "alon-tarsi",
    "name": "Alon–Tarsi Conjecture",
    "field": "Combinatorics",
    "subfield": "Design theory",
    "posedYear": 1992,
    "posedBy": "Noga Alon and Michael Tarsi",
    "statement": "For every even order n, the number of even Latin squares of order n differs from the number of odd Latin squares of order n.",
    "form": "n even ⟹ EL(n) ≠ OL(n), where a Latin square's parity is the product of the signs of its row and column permutations",
    "counterexample": "An even order n for which even and odd Latin squares of order n are exactly equinumerous (EL(n) = OL(n)).",
    "disproof": "existence",
    "status": "open",
    "evidence": "Trivially EL(n) = OL(n) for odd n. Proved for n = p+1 (Drisko 1997) and n = p−1 (Glynn 2010) with p an odd prime, hence for infinitely many even n; a stronger form (more even than odd, with sign matching) is supported by data. General even n open.",
    "prize": "",
    "tags": [
      "latin-squares",
      "design-theory",
      "permanents",
      "list-coloring"
    ],
    "links": [
      {
        "label": "Wolfram MathWorld",
        "url": "https://mathworld.wolfram.com/Alon-TarsiConjecture.html"
      },
      {
        "label": "Open Problem Garden",
        "url": "http://garden.irmacs.sfu.ca/op/even_vs_odd_latin_squares"
      }
    ],
    "note": "A Latin square's parity comes from the signs of its 2n row/column permutations. The conjecture would imply results on list-edge-colorings of graphs and is linked to Rota's basis conjecture. Proven for orders one away from an odd prime, it remains open for general even n; a disproof is one even order with matching even/odd counts."
  },
  {
    "id": "beck-fiala",
    "name": "Beck–Fiala Conjecture",
    "field": "Combinatorics",
    "subfield": "Combinatorial discrepancy",
    "posedYear": 1981,
    "posedBy": "József Beck and Tibor Fiala",
    "statement": "Any set system in which each element lies in at most t sets can be two-colored so that every set is balanced up to O(√t).",
    "form": "degree(x) ≤ t for all elements ⟹ ∃ χ:X→{±1} with max_S |Σ_{x∈S} χ(x)| = O(√t)",
    "counterexample": "A bounded-degree set system (max degree t) for which every ±1 coloring leaves some set with imbalance growing faster than any constant times √t.",
    "disproof": "counterexample-hard",
    "status": "open",
    "evidence": "The Beck–Fiala theorem gives the degree-independent bound 2t−1; Banaszczyk's method yields O(√(t log n)). Recent work (Bansal–Jiang and successors) establishes the O(√t) bound when the degree t is at least (log T)^{1+o(1)}. The conjectured constant-times-√t bound for all t is unproven.",
    "prize": "",
    "tags": [
      "discrepancy",
      "set-systems",
      "colorings"
    ],
    "links": [
      {
        "label": "Wikipedia (discrepancy)",
        "url": "https://en.wikipedia.org/wiki/Discrepancy_of_hypergraphs"
      },
      {
        "label": "Bansal–Jiang et al. (arXiv)",
        "url": "https://arxiv.org/abs/2205.01023"
      }
    ],
    "note": "Discrepancy measures how evenly a set system can be split by a two-coloring. Beck and Fiala proved a bound independent of the number of sets but linear in the degree t; they conjectured the truth is only √t. Closing the gap from their 2t−1 to O(√t) has driven decades of discrepancy theory; only the large-degree regime is settled."
  },
  {
    "id": "caccetta-haggkvist",
    "name": "Caccetta–Häggkvist Conjecture",
    "field": "Combinatorics",
    "subfield": "Directed graph theory",
    "posedYear": 1978,
    "posedBy": "Louis Caccetta and Roland Häggkvist",
    "statement": "Every directed graph on n vertices in which each vertex has out-degree at least n/r contains a directed cycle of length at most r.",
    "form": "D on n vertices, δ⁺(D) ≥ n/r ⟹ D has a directed cycle of length ≤ r",
    "counterexample": "A digraph on n vertices with every out-degree ≥ n/r whose shortest directed cycle has length greater than r (e.g., the notorious r = 3 case: min out-degree ≥ n/3 but no directed triangle).",
    "disproof": "counterexample",
    "status": "open",
    "evidence": "Proved for r = 2 (original), r = 3 by Hamidoune, and r = 4, 5 by Hoàng–Reed. The central r = 3 girth case (out-degree ≥ n/3 forces a triangle) is open; best results give out-degree ≥ 0.3465n (Hladký–Kráľ–Norin). Proven for digraphs with small independence number.",
    "prize": "",
    "tags": [
      "digraphs",
      "directed-cycles",
      "girth",
      "graph-theory"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Caccetta%E2%80%93H%C3%A4ggkvist_conjecture"
      },
      {
        "label": "Open Problem Garden",
        "url": "https://www.openproblemgarden.org/op/caccetta_haggkvist_conjecture"
      }
    ],
    "note": "The most-studied special case asserts that out-degree at least n/3 forces a directed triangle — deceptively simple yet unsolved. It connects to additive combinatorics and has ties to the Behrend-type constructions and to problems on Latin squares. A single digraph beating the bound would disprove it."
  },
  {
    "id": "chvatal-conjecture",
    "name": "Chvátal's Conjecture",
    "field": "Combinatorics",
    "subfield": "Extremal set theory",
    "posedYear": 1974,
    "posedBy": "Václav Chvátal",
    "statement": "In any downward-closed family of sets, a largest intersecting subfamily can always be taken to be a 'star' — all sets containing one fixed element.",
    "form": "D a downset ⟹ max intersecting subfamily size = max over x of |{A∈D : x∈A}|",
    "counterexample": "A downset possessing an intersecting subfamily strictly larger than every one of its stars.",
    "disproof": "counterexample",
    "status": "open",
    "evidence": "Proved by Chvátal for left-compressed downsets; by Kleitman–Magnanti when the intersecting family lies in the union of two stars; by Sterboul / Snevily for downsets of rank ≤ 3; and verified computationally for ground sets up to 7 elements.",
    "prize": "",
    "tags": [
      "set-systems",
      "downsets",
      "intersecting-families",
      "extremal-set-theory"
    ],
    "links": [
      {
        "label": "Open Problem Garden",
        "url": "http://www.openproblemgarden.org/op/chvatals_conjecture"
      },
      {
        "label": "arXiv (small rank)",
        "url": "https://arxiv.org/abs/1703.00494"
      }
    ],
    "note": "A downset (ideal) is a family closed under taking subsets. Chvátal's conjecture generalizes the Erdős–Ko–Rado phenomenon that maximum intersecting families are stars, from the uniform setting to arbitrary ideals. It has been on Erdős's list of favorite problems; a disproof is one ideal with an oversized non-star intersecting subfamily."
  },
  {
    "id": "erdos-gyarfas",
    "name": "Erdős–Gyárfás Conjecture",
    "field": "Combinatorics",
    "subfield": "Graph theory",
    "posedYear": 1995,
    "posedBy": "Paul Erdős and András Gyárfás",
    "statement": "Every finite graph with minimum degree at least three contains a cycle whose length is a power of two.",
    "form": "G finite, δ(G) ≥ 3 ⟹ ∃ cycle C in G with |C| = 2^k for some k",
    "counterexample": "A finite graph in which every vertex has degree ≥ 3 yet no cycle has length 4, 8, 16, 32, … (a power of two).",
    "disproof": "counterexample",
    "status": "open",
    "evidence": "Verified for 3-connected cubic planar graphs (Heckman–Krakovski), for P₁₀-free (Hu–Shen 2024) and further P₁₃-free graphs, and for diameter-2 graphs (cycle of length 4 or 8). Computer search shows any counterexample needs ≥17 vertices (≥30 if cubic or bipartite).",
    "prize": "",
    "tags": [
      "graph-theory",
      "cycles",
      "minimum-degree"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Erd%C5%91s%E2%80%93Gy%C3%A1rf%C3%A1s_conjecture"
      },
      {
        "label": "West's open problems page",
        "url": "http://dwest.web.illinois.edu/openp/2powcyc.html"
      }
    ],
    "note": "Erdős reportedly conjectured this expecting it to be false and offered a reward either way. It sits at the boundary of graph theory and combinatorics: a very local hypothesis (degree ≥ 3) forcing a rigid global arithmetic structure (a power-of-two cycle length). Extensive computer searches have found no counterexample, keeping its truth genuinely uncertain."
  },
  {
    "id": "erdos-hajnal",
    "name": "Erdős–Hajnal Conjecture",
    "field": "Combinatorics",
    "subfield": "Structural graph theory",
    "posedYear": 1977,
    "posedBy": "Paul Erdős and András Hajnal",
    "statement": "For every fixed graph H there is a constant c > 0 such that every graph avoiding H as an induced subgraph contains a clique or an independent set of size at least n^c.",
    "form": "∀H ∃c(H)>0 : G on n vertices, H-induced-free ⟹ ω(G) ≥ n^{c} or α(G) ≥ n^{c}",
    "counterexample": "For some fixed H, an infinite sequence of H-induced-free graphs whose largest clique and largest independent set both stay below n^{ε} for every ε > 0 (only polylogarithmic homogeneity).",
    "disproof": "counterexample-hard",
    "status": "open",
    "evidence": "Known for all H on ≤ 4 vertices, for the 5-vertex path P₅ (Nguyen–Scott–Seymour, announced 2023–24), for the 5-cycle C₅ (Chudnovsky et al. 2023), and for infinite new families and tournament analogues. General case still open; general graphs only guarantee ~log n homogeneous sets (Ramsey).",
    "prize": "",
    "tags": [
      "graph-theory",
      "ramsey-theory",
      "induced-subgraphs"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Erd%C5%91s%E2%80%93Hajnal_conjecture"
      },
      {
        "label": "Survey (Chudnovsky, arXiv)",
        "url": "https://arxiv.org/abs/1606.08827"
      }
    ],
    "note": "Ordinary graphs guarantee only logarithmic-size cliques or independent sets (Ramsey's theorem). Erdős–Hajnal says forbidding any single induced pattern boosts that to polynomial size — a dramatic order-from-restriction principle. Recent years have cracked several small cases (notably C₅ and P₅), but the full conjecture remains one of the deepest open problems in structural graph theory."
  },
  {
    "id": "erdos-sos",
    "name": "Erdős–Sós Conjecture",
    "field": "Combinatorics",
    "subfield": "Extremal graph theory",
    "posedYear": 1963,
    "posedBy": "Paul Erdős and Vera T. Sós",
    "statement": "Any graph whose average degree exceeds k−1 contains every tree with k edges as a subgraph.",
    "form": "G on n vertices with more than (k−1)n/2 edges ⟹ G ⊇ T for every tree T with k edges",
    "counterexample": "A graph with more than (k−1)n/2 edges that nonetheless omits some specific k-edge tree as a subgraph.",
    "disproof": "counterexample",
    "status": "open",
    "evidence": "Ajtai–Komlós–Simonovits–Szemerédi announced a proof for all sufficiently large k (using the regularity method), but the general result is not fully published. Proven for paths (Erdős–Gallai), spiders, trees of diameter ≤ 4, bounded-degree trees in dense hosts, and a spectral analogue (2022). Small trees remain largely open.",
    "prize": "",
    "tags": [
      "graph-theory",
      "trees",
      "extremal-graph-theory",
      "turan-type"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Erd%C5%91s%E2%80%93S%C3%B3s_conjecture"
      }
    ],
    "note": "A tight Turán-type bound: the extremal edge count for forcing a k-edge tree should be exactly the one achieved by disjoint cliques of order k. It contains the Erdős–Gallai path result as a special case. The large-k proof by AKSS is celebrated but unpublished in full, so the conjecture is still officially open; a disproof is one dense graph missing one tree."
  },
  {
    "id": "erdos-szekeres-exact",
    "name": "Erdős–Szekeres Conjecture (exact happy-ending bound)",
    "field": "Combinatorics",
    "subfield": "Combinatorial geometry / Ramsey theory",
    "posedYear": 1935,
    "posedBy": "Paul Erdős and George Szekeres",
    "statement": "The minimum number of points in general position guaranteeing n of them in convex position is exactly 2^{n−2}+1.",
    "form": "ES(n) = 2^{n−2} + 1",
    "counterexample": "Either a configuration of 2^{n−2}+1 points in general position with no convex n-gon (bound too low), or a proof that fewer than 2^{n−2}+1 always suffice (bound not tight) — for some n ≥ 7.",
    "disproof": "counterexample",
    "status": "open",
    "evidence": "Erdős–Szekeres proved 2^{n−2}+1 ≤ ES(n) ≤ C(2n−4, n−2)+1; the lower bound is conjectured exact. Known to be exact for n ≤ 6 (n = 6 needs 17 points, computer-verified 2006 and formally verified 2016). Suk (2016) proved the near-optimal upper bound ES(n) ≤ 2^{n+o(n)}. Exact value open for n ≥ 7.",
    "prize": "",
    "tags": [
      "combinatorial-geometry",
      "ramsey-theory",
      "convex-position",
      "happy-ending"
    ],
    "links": [
      {
        "label": "Wikipedia (Happy ending problem)",
        "url": "https://en.wikipedia.org/wiki/Happy_ending_problem"
      }
    ],
    "note": "The 'happy ending problem', so named by Erdős because it led to the marriage of Szekeres and Klein. Suk's 2016 upper bound 2^{n+o(n)} nearly matches the conjectured 2^{n−2}+1, so the conjecture is 'asymptotically almost' proved — but the exact constant is still open beyond n = 6, and a single extremal point set could decide it."
  },
  {
    "id": "graceful-tree",
    "name": "Graceful Tree Conjecture (Ringel–Kotzig)",
    "field": "Combinatorics",
    "subfield": "Graph labeling",
    "posedYear": 1967,
    "posedBy": "Gerhard Ringel, Anton Kotzig, and Alexander Rosa",
    "statement": "Every tree admits a graceful labeling: its vertices can be labeled with distinct integers 0..m (m = number of edges) so that the edge labels, taken as absolute differences of endpoints, are exactly 1..m.",
    "form": "T a tree with m edges ⟹ ∃ injective f:V(T)→{0,…,m} with { |f(u)−f(v)| : uv∈E } = {1,…,m}",
    "counterexample": "A specific tree for which no assignment of distinct vertex labels in {0,…,m} yields all edge-differences 1 through m.",
    "disproof": "counterexample",
    "status": "open",
    "evidence": "Verified by computer for all trees on at most 35 vertices, and proved by hand for many families (paths, caterpillars, symmetrical trees, spiders, olive trees, etc.). A 2022 arXiv preprint claiming a full proof has not been accepted by the community. The general conjecture is still open.",
    "prize": "",
    "tags": [
      "graph-labeling",
      "trees",
      "graceful-labeling"
    ],
    "links": [
      {
        "label": "Wikipedia (graceful labeling)",
        "url": "https://en.wikipedia.org/wiki/Graceful_labeling"
      },
      {
        "label": "Open Problem Garden",
        "url": "http://www.openproblemgarden.org/op/graceful_tree_conjecture"
      }
    ],
    "note": "Motivated by Ringel's problem on decomposing complete graphs into isomorphic trees (Rosa introduced graceful — originally 'β' — labelings as a tool). Note Ringel's own conjecture on K_{2n+1} decompositions was proved in 2020, but the graceful tree conjecture itself remains open. A single non-graceful tree would refute it, and none has ever been found."
  },
  {
    "id": "komlos-conjecture",
    "name": "Komlós Conjecture",
    "field": "Combinatorics",
    "subfield": "Combinatorial discrepancy",
    "posedYear": 1983,
    "posedBy": "János Komlós",
    "statement": "For any collection of vectors of length at most one, signs can be chosen so that the signed sum has all coordinates bounded by an absolute constant.",
    "form": "‖vᵢ‖₂ ≤ 1 for all i ⟹ ∃ εᵢ∈{±1} : ‖Σᵢ εᵢ vᵢ‖_∞ = O(1)",
    "counterexample": "A finite set of unit-length vectors for which every ±1 signing produces a signed sum whose largest coordinate is unbounded (grows with the dimension or number of vectors).",
    "disproof": "counterexample-hard",
    "status": "open",
    "evidence": "Banaszczyk (1998) proved the bound O(√(log n)); this was recently improved to Õ((log n)^{1/4}). Special cases (e.g., vector colorings, sparse instances) are known. The conjectured absolute-constant bound O(1) remains open. It generalizes the Beck–Fiala conjecture.",
    "prize": "",
    "tags": [
      "discrepancy",
      "vectors",
      "colorings"
    ],
    "links": [
      {
        "label": "Wikipedia (discrepancy)",
        "url": "https://en.wikipedia.org/wiki/Discrepancy_theory"
      },
      {
        "label": "Banaszczyk-type bounds (arXiv)",
        "url": "https://arxiv.org/abs/1301.4039"
      }
    ],
    "note": "The strongest natural conjecture in discrepancy theory: a dimension- and count-independent constant bound for signing unit vectors. It implies the Beck–Fiala conjecture as a special case. The best known bounds still carry a slowly-growing logarithmic factor, and a refuting family of unit vectors would settle it negatively."
  },
  {
    "id": "rota-basis-conjecture",
    "name": "Rota's Basis Conjecture",
    "field": "Combinatorics",
    "subfield": "Matroid theory",
    "posedYear": 1989,
    "posedBy": "Gian-Carlo Rota",
    "statement": "Given n bases of an n-dimensional vector space, their vectors can be arranged in an n×n grid so that every row is one of the given bases and every column is also a basis.",
    "form": "B₁,…,Bₙ bases of an n-dim space ⟹ ∃ n×n arrangement with rows = the Bᵢ and every column a basis",
    "counterexample": "An n-dimensional space and n specified bases for which no rearrangement of each basis makes all n columns simultaneously bases.",
    "disproof": "counterexample-hard",
    "status": "open",
    "evidence": "Proved for n ≤ 3 and for some small/special cases; an asymptotic version (n − o(n) disjoint 'rainbow' bases of size n − o(n)) is known, and (1/2 − o(1))n disjoint transversal bases can always be found. True for paving matroids and matroids of density near one. General matroid and even the vector-space case remain open.",
    "prize": "",
    "tags": [
      "matroids",
      "linear-algebra",
      "bases",
      "latin-squares"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Rota%27s_basis_conjecture"
      },
      {
        "label": "Open Problem Garden",
        "url": "http://www.openproblemgarden.org/op/rotas_basis_conjecture"
      }
    ],
    "note": "Stated by Rota shortly before his death, it generalizes to arbitrary matroids and connects to Latin squares (the columns-as-bases condition echoes Latin-square structure). Despite a Polymath collaborative attack and strong asymptotic results, the exact statement is unproven even over the reals, and a single bad configuration would refute it."
  },
  {
    "id": "ryser-brualdi-stein",
    "name": "Ryser–Brualdi–Stein Conjecture (Latin square transversals)",
    "field": "Combinatorics",
    "subfield": "Design theory",
    "posedYear": 1967,
    "posedBy": "Herbert Ryser (odd n); Richard Brualdi and Sherman Stein (general n)",
    "statement": "Every Latin square of order n has a partial transversal using n−1 distinct symbols, and a full transversal (n distinct symbols) whenever n is odd.",
    "form": "L Latin square order n ⟹ ∃ partial transversal of size n−1; n odd ⟹ ∃ full transversal of size n",
    "counterexample": "A Latin square whose largest partial transversal (a set of cells, one per row and column, with distinct symbols) has size at most n−2.",
    "disproof": "counterexample-hard",
    "status": "partial",
    "evidence": "Montgomery (2023) proved that every sufficiently large Latin square has a transversal of size n−1, settling the n−1 part for large n. Keevash–Pokrovskiy–Sudakov–Yepremyan earlier reached n−O(log n/log log n). The full-transversal (odd-n) statement remains open in general.",
    "prize": "",
    "tags": [
      "latin-squares",
      "transversals",
      "design-theory"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Ryser%27s_conjecture"
      },
      {
        "label": "Montgomery 2023 (arXiv)",
        "url": "https://arxiv.org/abs/2310.19779"
      }
    ],
    "note": "A transversal picks one cell from each row and column so that all n symbols appear exactly once. The famous order-6 counterexample (no full transversal) forces the 'odd n' hedge. Montgomery's 2023 result nearly finishes the n−1 half for large orders, but the conjecture as a whole (all n, exact) is still open."
  },
  {
    "id": "ryser-conjecture-hypergraph",
    "name": "Ryser's Conjecture (covering vs matching in r-partite hypergraphs)",
    "field": "Combinatorics",
    "subfield": "Hypergraph theory",
    "posedYear": 1971,
    "posedBy": "Herbert Ryser (via J. R. Henderson's thesis)",
    "statement": "In every r-partite r-uniform hypergraph, the minimum vertex cover is at most (r−1) times the maximum matching.",
    "form": "H r-partite r-uniform ⟹ τ(H) ≤ (r−1)·ν(H)",
    "counterexample": "An explicit r-partite r-uniform hypergraph (for some r ≥ 4) whose smallest vertex cover exceeds (r−1) times its largest matching.",
    "disproof": "counterexample",
    "status": "open",
    "evidence": "The case r = 2 is König's theorem; r = 3 was proved by Aharoni (2001) using Aharoni–Haxell topological methods. For intersecting hypergraphs, Tuza settled r ≤ 5. Open for all r ≥ 4 in general (and r ≥ 6 even for the intersecting case).",
    "prize": "",
    "tags": [
      "hypergraphs",
      "covering",
      "matching",
      "extremal-set-theory"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Ryser%27s_conjecture"
      },
      {
        "label": "Open Problem Garden",
        "url": "http://garden.irmacs.sfu.ca/op/rysers_conjecture"
      }
    ],
    "note": "A far-reaching generalization of König's theorem to r partite classes. The r = 3 case already required deep topological combinatorics; the general conjecture is one of the central open problems linking covers and matchings. A disproof needs one hypergraph violating the bound for a fixed r."
  },
  {
    "id": "sunflower-erdos-rado",
    "name": "Sunflower Conjecture (Erdős–Rado exact bound)",
    "field": "Combinatorics",
    "subfield": "Extremal set theory",
    "posedYear": 1960,
    "posedBy": "Paul Erdős and Richard Rado",
    "statement": "For each fixed number of petals r, there is a constant C(r) such that any family of more than C(r)^k sets each of size k must contain a sunflower with r petals.",
    "form": "∀r ∃C(r) : |F| > C(r)^k, (∀A∈F |A|=k) ⟹ F contains an r-sunflower",
    "counterexample": "A family of k-element sets, exponentially large in k (beyond any single-exponential base), containing no three sets whose pairwise intersections all coincide.",
    "disproof": "counterexample-hard",
    "status": "open",
    "evidence": "Alweiss–Lovett–Wu–Zhang (2019) improved the bound to (O(r·log k·log log k))^k, later refined toward (O(r·log k))^k; still super-exponential in the log factor. The exact single-exponential C(r)^k bound conjectured by Erdős and Rado remains unproven.",
    "prize": "$1000 (Erdős)",
    "tags": [
      "set-systems",
      "extremal-set-theory",
      "sunflowers"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Sunflower_(mathematics)"
      },
      {
        "label": "Alweiss–Lovett–Wu–Zhang 2019 (arXiv)",
        "url": "https://arxiv.org/abs/1908.08483"
      }
    ],
    "note": "A sunflower is a family of sets sharing a common 'core', with all remaining elements disjoint. Erdős called the exact bound one of his favorite problems and offered $1000. The 2019–2021 'robust sunflower' breakthrough was a genuine leap, but the gap between the best bound and the conjectured c^k is still open."
  },
  {
    "id": "union-closed-frankl",
    "name": "Union-Closed Sets Conjecture (Frankl's Conjecture)",
    "field": "Combinatorics",
    "subfield": "Extremal set theory",
    "posedYear": 1979,
    "posedBy": "Péter Frankl",
    "statement": "In any finite family of sets closed under union (other than the family containing only the empty set), some element belongs to at least half of the sets.",
    "form": "F finite, A,B∈F ⇒ A∪B∈F, F≠{∅} ⟹ ∃x : |{A∈F : x∈A}| ≥ |F|/2",
    "counterexample": "A concrete finite union-closed family in which, for every element of the ground set, that element lies in strictly fewer than half of the member sets.",
    "disproof": "counterexample",
    "status": "open",
    "evidence": "Gilmer (2022) proved some element lies in at least a 0.01 fraction; sharpened by several groups to (3−√5)/2 ≈ 0.38 (the natural barrier of the entropy method). Verified for families over ground sets up to ~12 elements and for families with a small number of sets.",
    "prize": "",
    "tags": [
      "set-systems",
      "extremal-set-theory",
      "union-closed"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Union-closed_sets_conjecture"
      },
      {
        "label": "Gilmer 2022 (arXiv)",
        "url": "https://arxiv.org/abs/2211.09055"
      }
    ],
    "note": "One of the most famous elementary-to-state open problems in combinatorics. The 2022 entropy-method breakthrough by Justin Gilmer broke the problem open after decades of stagnation, but the constant it yields (~0.38) falls short of the conjectured 1/2, which remains out of reach. A single carefully engineered finite family would settle it in the negative."
  },
  {
    "id": "bellman-lost-in-forest",
    "name": "Bellman's Lost-in-a-Forest Problem",
    "field": "Geometry",
    "subfield": "Optimization / search",
    "posedYear": 1956,
    "posedBy": "Richard E. Bellman",
    "statement": "For a forest of known shape (but with the hiker's position and heading unknown), find the escape path minimizing the worst-case distance walked before reaching the boundary — unsolved for most shapes.",
    "form": "minimize over paths γ of  max over (start, heading) of length(γ until it exits the region);  optimal γ unknown for general regions",
    "counterexample": "A shorter guaranteed-escape path than a claimed optimum for some region (settling that region differently).",
    "disproof": "other",
    "status": "open",
    "evidence": "Solved only for special regions: the straight line, circular sectors of angle ≥ 60°, regular polygons with more than 3 sides (a straight diameter-length walk is optimal), and the infinite strip (Zalgaller's specific curve). No general method exists; the problem is unsolved even for many simple convex shapes.",
    "prize": "",
    "tags": [
      "optimization",
      "search",
      "minimax"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Bellman%27s_lost-in-a-forest_problem"
      }
    ],
    "note": "You know the forest's exact shape but not where you are or which way you face — what route guarantees the shortest worst-case walk to the edge? Even for the infinite strip the answer is a nontrivial curve, and for most regions no optimal path is known."
  },
  {
    "id": "borsuk-small-dimensions",
    "name": "Borsuk Problem in Small Dimensions",
    "field": "Geometry",
    "subfield": "Combinatorial geometry / convexity",
    "posedYear": 1932,
    "posedBy": "Karol Borsuk",
    "statement": "Every bounded subset of ℝⁿ can be partitioned into n+1 pieces each of strictly smaller diameter — still unresolved for dimensions 4 through 63.",
    "form": "∀ bounded S ⊂ ℝⁿ : S = ⋃_{i=1}^{n+1} S_i with diam(S_i) < diam(S)   (open for 4 ≤ n ≤ 63)",
    "counterexample": "A bounded set in some dimension 4 ≤ n ≤ 63 that cannot be split into n+1 parts of smaller diameter.",
    "disproof": "counterexample",
    "status": "partial",
    "evidence": "True for n ≤ 3 (Perkal, Eggleston). FALSE for large n: Kahn–Kalai (1993) disproved it, and the smallest known counterexample is in dimension 64 (Bondarenko 2013 for dim 65; Jenrich–Brouwer 2013 extracted a dim-64 two-distance set needing ≥ 71 parts). The range 4 ≤ n ≤ 63 is open.",
    "prize": "",
    "tags": [
      "convexity",
      "combinatorial-geometry",
      "partitions"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Borsuk%27s_conjecture"
      },
      {
        "label": "64-dim two-distance counterexample (2013)",
        "url": "https://arxiv.org/abs/1308.0206"
      }
    ],
    "note": "This repo's 'borsuk' page covers the famous high-dimensional disproof (n+1 pieces is wildly false around dimension 64 and up). What survives is the low-dimensional remnant: the conjecture is proven only up to n=3 and disproven from n=64, leaving a wide unexplored middle band."
  },
  {
    "id": "chromatic-number-of-space",
    "name": "Chromatic Number of 3-Space",
    "field": "Geometry",
    "subfield": "Combinatorial geometry / graph coloring",
    "posedYear": 1950,
    "posedBy": "After Nelson & Hadwiger (spatial analogue)",
    "statement": "The chromatic number of 3-dimensional space — the fewest colors to color ℝ³ so that no two points one unit apart share a color — is unknown; it lies between 6 and 15.",
    "form": "6 ≤ χ(ℝ³) ≤ 15,   χ(ℝ³) = ?",
    "counterexample": "A 5-coloring of ℝ³ with no monochromatic unit distance (refuting χ≥6), or a unit-distance graph in ℝ³ forcing 16 colors (refuting χ≤15).",
    "disproof": "counterexample",
    "status": "partial",
    "evidence": "Lower bound χ ≥ 6 (Nechushtan 2002); upper bound χ ≤ 15 (Coulson; Radoičić–Tóth, independently). The gap is far wider than in the plane. In high dimensions χ(ℝⁿ) is known to grow exponentially (Frankl–Wilson, Raigorodskii).",
    "prize": "",
    "tags": [
      "graph-coloring",
      "combinatorial-geometry"
    ],
    "links": [
      {
        "label": "Hadwiger–Nelson problem (Wikipedia)",
        "url": "https://en.wikipedia.org/wiki/Hadwiger%E2%80%93Nelson_problem"
      }
    ],
    "note": "The spatial sibling of the plane-coloring problem, and even less understood: the true value could be anywhere from 6 to 15. Cross-references the plane's Hadwiger–Nelson problem, which has the much tighter window 5–7."
  },
  {
    "id": "danzer-set",
    "name": "Danzer's Problem",
    "field": "Geometry",
    "subfield": "Discrete geometry / point sets",
    "posedYear": 1965,
    "posedBy": "Ludwig Danzer",
    "statement": "There exists a point set in ℝᵈ meeting every convex body of volume 1 (a Danzer set) whose density is bounded — i.e. with at most O(r^d) points in every ball of radius r.",
    "form": "∃ S ⊂ ℝᵈ : S ∩ K ≠ ∅ ∀ convex K with vol(K)=1,  and #(S ∩ B_r) = O(r^d)",
    "counterexample": "A proof that no bounded-density set can pierce all unit-volume convex bodies (i.e. every Danzer set must be super-linearly dense) would refute the existence claim.",
    "disproof": "existence",
    "status": "open",
    "evidence": "Solomon–Weiss constructed sets piercing all unit-volume convex bodies with growth O(T^d log T) — off from bounded density only by a logarithm. Related 'dense forest' constructions give effective visibility bounds. Neither a bounded-density construction nor an impossibility proof is known.",
    "prize": "",
    "tags": [
      "discrete-geometry",
      "point-sets",
      "convexity"
    ],
    "links": [
      {
        "label": "Danzer set (Wikipedia)",
        "url": "https://en.wikipedia.org/wiki/Danzer_set"
      },
      {
        "label": "Around the Danzer problem (2020)",
        "url": "https://arxiv.org/abs/2010.06756"
      }
    ],
    "note": "Can you scatter points so thinly that they still stab every possible unit-volume convex region, however long and thin? The best known constructions miss bounded density by only a logarithmic factor, and it is unknown whether that gap can be closed."
  },
  {
    "id": "equidissection-spectrum",
    "name": "Equidissection Spectrum / Stein's Conjectures",
    "field": "Geometry",
    "subfield": "Dissections",
    "posedYear": 1970,
    "posedBy": "Paul Monsky (square case); Sherman Stein (generalizations)",
    "statement": "Characterize, for each polygon, the set of numbers n for which it can be cut into n triangles of equal area; in particular Stein's conjecture that no 'balanced' polygon admits an odd equidissection is unproven.",
    "form": "S(P) = { n : P has an equidissection into n equal-area triangles };  Stein: P balanced ⇒ S(P) contains no odd n",
    "counterexample": "A balanced polygon cut into an odd number of equal-area triangles (refuting Stein), or an unexpected value in some polygon's spectrum.",
    "disproof": "counterexample",
    "status": "open",
    "evidence": "Monsky (1970) proved the square admits no odd equidissection (via a 2-adic valuation coloring + Sperner's lemma) — still the only known proof technique. Monsky (1990) proved centrally symmetric polygons likewise. Stein's broader 'balanced polygon' conjecture and full spectrum determinations for general polygons remain open.",
    "prize": "",
    "tags": [
      "dissections",
      "combinatorial-geometry"
    ],
    "links": [
      {
        "label": "Monsky's theorem (Wikipedia)",
        "url": "https://en.wikipedia.org/wiki/Monsky%27s_theorem"
      },
      {
        "label": "Equidissection (Wikipedia)",
        "url": "https://en.wikipedia.org/wiki/Equidissection"
      }
    ],
    "note": "Monsky's startling 1970 theorem says a square can never be cut into an odd number of equal-area triangles — proved only via 2-adic numbers, with no elementary proof known. The open frontier (Stein's conjectures) extends this to which counts are possible for general polygons."
  },
  {
    "id": "erdos-unit-distance",
    "name": "Erdős Unit Distance Conjecture",
    "field": "Geometry",
    "subfield": "Combinatorial geometry",
    "posedYear": 1946,
    "posedBy": "Paul Erdős",
    "statement": "The number of pairs at exactly unit distance among n points in the plane is at most n^{1+o(1)}.",
    "form": "u(n) = max #{ (i,j) : |p_i − p_j| = 1 } = n^{1+o(1)}",
    "counterexample": "A family of point sets whose unit-distance count grows like c·n^{1+ε} for a fixed ε > 0.",
    "disproof": "counterexample-hard",
    "status": "open",
    "evidence": "Erdős's √n × √n grid achieves n^{1+c/log log n}, conjectured extremal. Best proven upper bound is O(n^{4/3}) (Spencer–Szemerédi–Trotter 1984), with no improvement to the exponent in 40 years. The gap between 4/3 and 1+o(1) is enormous.",
    "prize": "",
    "tags": [
      "combinatorial-geometry",
      "incidences"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Unit_distance_graph"
      }
    ],
    "note": "The cleanest of Erdős's distance problems and still stubbornly open; this repo has a dedicated 'erdos' page. Its cousin, the distinct-distances problem, was essentially resolved by Guth–Katz (also a repo page), but the unit-distance count remains far from settled."
  },
  {
    "id": "erdos-oler-circle-packing",
    "name": "Erdős–Oler Conjecture (Circles in a Triangle)",
    "field": "Geometry",
    "subfield": "Packing",
    "posedYear": 1961,
    "posedBy": "Norman Oler; Paul Erdős",
    "statement": "When n is a triangular number, an optimal packing of n−1 unit circles in the smallest equilateral triangle is obtained by removing a single circle from the optimal packing of n circles.",
    "form": "n = T_k = k(k+1)/2  ⇒  minimal-triangle side for (n−1) circles = minimal-triangle side for n circles",
    "counterexample": "A triangular number n for which the optimal (n−1)-circle packing fits in a strictly smaller triangle than any packing obtained by deleting one circle from the optimal n-circle packing.",
    "disproof": "counterexample",
    "status": "open",
    "evidence": "Verified for small triangular sizes (n ≤ 15). Graham–Lubachevsky found further conjectured optimal families for larger n (e.g. n = 37, 40, 42, 43, 46, 49). The general statement is unproven.",
    "prize": "",
    "tags": [
      "packing",
      "circles",
      "extremal"
    ],
    "links": [
      {
        "label": "Circle packing in an equilateral triangle (Wikipedia)",
        "url": "https://en.wikipedia.org/wiki/Circle_packing_in_an_equilateral_triangle"
      }
    ],
    "note": "When circle counts hit triangular numbers (1, 3, 6, 10, …) the perfect triangular-grid packing is snug; the conjecture says the packing for one-fewer circle is exactly as tight, obtained by just plucking one out. Proven only through n = 15."
  },
  {
    "id": "falconer-distance-set",
    "name": "Falconer's Distance Set Conjecture",
    "field": "Geometry",
    "subfield": "Geometric measure theory",
    "posedYear": 1985,
    "posedBy": "Kenneth Falconer",
    "statement": "Any compact set in ℝᵈ (d ≥ 2) whose Hausdorff dimension exceeds d/2 determines a set of pairwise distances of positive Lebesgue measure.",
    "form": "dim_H(E) > d/2  ⇒  |Δ(E)| > 0,  where Δ(E) = { |x − y| : x, y ∈ E }",
    "counterexample": "A compact set of Hausdorff dimension greater than d/2 whose distance set has Lebesgue measure zero.",
    "disproof": "counterexample-hard",
    "status": "open",
    "evidence": "Falconer's original threshold d/2 + 1/2 has been steadily lowered: in the plane Guth–Iosevich–Ou–Wang (2020) reached dim > 5/4, with parallel gains in higher dimensions (Du–Zhang and others). The sharp d/2 threshold is unproven in every dimension. A dimension-version holds for Ahlfors-regular sets.",
    "prize": "",
    "tags": [
      "geometric-measure-theory",
      "harmonic-analysis",
      "distances"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Falconer%27s_conjecture"
      }
    ],
    "note": "A continuous cousin of the Erdős distinct-distances problem: a fractal 'big enough' (dimension past half the ambient) should span a solid interval's worth of distances. The exact size threshold is the crux and remains open, driving much modern harmonic analysis."
  },
  {
    "id": "gilbert-pollak-steiner-ratio",
    "name": "Gilbert–Pollak Steiner Ratio Conjecture",
    "field": "Geometry",
    "subfield": "Optimization / networks",
    "posedYear": 1968,
    "posedBy": "Edgar Gilbert & Henry Pollak",
    "statement": "For every finite set of points in the Euclidean plane, the Steiner minimal tree is at least √3/2 times the length of the minimum spanning tree.",
    "form": "∀ finite P ⊂ ℝ² : SMT(P) / MST(P) ≥ √3/2 ≈ 0.86603,  with the triangle attaining equality",
    "counterexample": "A finite planar point set whose Steiner-tree to spanning-tree length ratio drops below √3/2.",
    "disproof": "counterexample",
    "status": "open",
    "evidence": "The equilateral triangle gives exactly √3/2, conjectured worst case. Du–Hwang's celebrated 1990/92 proof is now widely regarded as containing essential gaps (the informal 'characteristic area' argument, which cannot be made rigorous). The best proven lower bound is ≈ 0.8241 (Chung–Graham), so the conjecture is again considered open.",
    "prize": "",
    "tags": [
      "optimization",
      "networks",
      "steiner-trees"
    ],
    "links": [
      {
        "label": "Steiner ratio (Wikipedia)",
        "url": "https://en.wikipedia.org/wiki/Steiner_ratio"
      },
      {
        "label": "Open problems on Steiner trees (2025)",
        "url": "https://arxiv.org/pdf/2511.18217"
      }
    ],
    "note": "Adding extra 'Steiner' junction points can shorten a network connecting given cities; the conjecture says you never save more than the ~13.4% seen for a triangle. A famous 1990 proof was celebrated, then found to have irreparable gaps, restoring the problem to open status."
  },
  {
    "id": "hadwiger-nelson-plane",
    "name": "Hadwiger–Nelson Problem (Chromatic Number of the Plane)",
    "field": "Geometry",
    "subfield": "Combinatorial geometry / graph coloring",
    "posedYear": 1950,
    "posedBy": "Edward Nelson; Hugo Hadwiger",
    "statement": "The chromatic number of the plane — the fewest colors needed to color ℝ² so that no two points exactly one unit apart share a color — is unknown; it lies between 5 and 7.",
    "form": "5 ≤ χ(ℝ²) ≤ 7,   χ(ℝ²) = ?",
    "counterexample": "A proper 4-coloring of the plane avoiding monochromatic unit distances (refuting χ≥5), or a finite unit-distance graph requiring 8 colors (refuting χ≤7).",
    "disproof": "counterexample",
    "status": "partial",
    "evidence": "χ ≥ 4 is classical (Moser spindle); de Grey (2018) raised the lower bound to 5 via a 1581-vertex unit-distance graph (since reduced). The upper bound 7 comes from a hexagonal tiling coloring (Isbell). The value is pinned only to {5,6,7}.",
    "prize": "",
    "tags": [
      "graph-coloring",
      "combinatorial-geometry"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Hadwiger%E2%80%93Nelson_problem"
      }
    ],
    "note": "This repo has a dedicated 'hadwiger' page. For 68 years only 4 ≤ χ ≤ 7 was known; amateur-turned-hero Aubrey de Grey narrowed it to 5 ≤ χ ≤ 7 in 2018, a rare recent move on a classic — but the exact number (5, 6, or 7) is still open."
  },
  {
    "id": "hadwiger-covering-illumination",
    "name": "Hadwiger's Covering / Illumination Conjecture (Levi–Hadwiger)",
    "field": "Geometry",
    "subfield": "Convexity",
    "posedYear": 1957,
    "posedBy": "Hugo Hadwiger; Friedrich Levi; also Gohberg–Markus",
    "statement": "Every n-dimensional convex body can be covered by 2^n smaller homothetic copies of itself (equivalently, illuminated by 2^n external light directions), with 2^n needed only for parallelepipeds.",
    "form": "∀ convex body K ⊂ ℝⁿ : H(K) ≤ 2ⁿ, with equality ⇔ K is a parallelepiped",
    "counterexample": "A convex body in some dimension n ≥ 3 that cannot be covered by 2^n smaller copies, or a non-parallelepiped requiring exactly 2^n.",
    "disproof": "counterexample",
    "status": "open",
    "evidence": "Settled for n = 2 by Levi (1955): four copies suffice, four needed only for parallelograms. Best general upper bound is subexponentially below the classical 4^n binomial bound, ≈ 4^n·exp(−Ω(n/(log n)^8)). Verified for special classes (cap bodies, highly symmetric bodies, zonotopes). Open for all n ≥ 3.",
    "prize": "",
    "tags": [
      "convexity",
      "covering",
      "illumination"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Hadwiger_conjecture_(combinatorial_geometry)"
      },
      {
        "label": "On Hadwiger's covering problem in small dimensions (2024)",
        "url": "https://arxiv.org/abs/2404.00547"
      }
    ],
    "note": "Ask how many shrunken copies of a shape you need to cover it, or equivalently how many light sources illuminate its whole boundary; the cube needs 2^n, and the conjecture is that nothing needs more. Even three dimensions is unsolved."
  },
  {
    "id": "inscribed-square-toeplitz",
    "name": "Inscribed Square Problem (Toeplitz Conjecture)",
    "field": "Geometry",
    "subfield": "Curves & Topology of the plane",
    "posedYear": 1911,
    "posedBy": "Otto Toeplitz",
    "statement": "Every continuous simple closed curve (Jordan curve) in the plane contains four points that are the vertices of a square.",
    "form": "∀ Jordan curve γ ⊂ ℝ² ∃ square Q with all 4 vertices on γ",
    "counterexample": "A single continuous simple closed curve on which no four points form a square.",
    "disproof": "counterexample",
    "status": "open",
    "evidence": "Proven for convex curves, piecewise-analytic and sufficiently smooth curves; Greene–Lobb (2020) settled all rectangle aspect ratios for smooth curves and (2021) Jordan curves with Lipschitz constant < √2. The general continuous (C⁰) case is open; a Nov 2025 AI-assisted claim is unverified.",
    "prize": "",
    "tags": [
      "curves",
      "topology",
      "combinatorial-geometry"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Inscribed_square_problem"
      }
    ],
    "note": "One of the most beguiling 'obvious but unproved' statements in geometry: draw any loop and it should hold four points squared off, yet nobody can rule out some infinitely jagged loop that dodges every square. The difficulty is entirely in the roughest, non-smooth curves."
  },
  {
    "id": "kakeya-conjecture-higher-dim",
    "name": "Kakeya Set Conjecture (dimension n ≥ 4)",
    "field": "Geometry",
    "subfield": "Geometric measure theory / harmonic analysis",
    "posedYear": 1971,
    "posedBy": "After A. Besicovitch; modern formulation mid-20th c.",
    "statement": "Every Kakeya set in ℝⁿ — a set containing a unit line segment in every direction — has full Hausdorff (and Minkowski) dimension n; still open for n ≥ 4.",
    "form": "K ⊂ ℝⁿ contains a unit segment in every direction  ⇒  dim_H(K) = n",
    "counterexample": "A Kakeya set in some dimension n ≥ 4 with Hausdorff dimension strictly less than n.",
    "disproof": "counterexample-hard",
    "status": "partial",
    "evidence": "n = 2 classical (Davies 1971). Wang–Zahl (Feb 2025) proved the n = 3 case — every Kakeya set in ℝ³ has dimension 3 — a landmark result (Guth's 2025 exposition follows). For n ≥ 4 only partial dimension bounds are known (polynomial method: Katz–Tao, Guth–Zahl); the full conjecture is open.",
    "prize": "",
    "tags": [
      "geometric-measure-theory",
      "harmonic-analysis"
    ],
    "links": [
      {
        "label": "Wikipedia (Kakeya set)",
        "url": "https://en.wikipedia.org/wiki/Kakeya_set"
      },
      {
        "label": "Wang–Zahl, R³ Kakeya (2025)",
        "url": "https://arxiv.org/abs/2502.17655"
      }
    ],
    "note": "This repo's 'kakeya' page covers the finite-field version (resolved by Dvir 2008). The Euclidean conjecture just fell in dimension 3 (Wang–Zahl 2025, called a once-in-a-century proof) — so the genuinely open frontier is now n ≥ 4."
  },
  {
    "id": "kissing-number",
    "name": "Kissing Number Problem",
    "field": "Geometry",
    "subfield": "Packing / sphere arrangements",
    "posedYear": 1694,
    "posedBy": "Isaac Newton & David Gregory (n=3 debate, 1694)",
    "statement": "Determine τ_n, the maximum number of non-overlapping unit spheres that can simultaneously touch a central unit sphere in ℝⁿ; it is known only for n = 1, 2, 3, 4, 8, 24.",
    "form": "τ_n = ?  for n ∉ {1,2,3,4,8,24}",
    "counterexample": "For a target dimension, an arrangement of unit spheres touching the center that exceeds the best conjectured configuration.",
    "disproof": "other",
    "status": "mostly-open",
    "evidence": "Solved: n=1,2 (trivial), n=3 τ=12 (Schütte–van der Waerden 1953), n=4 τ=24 (Musin 2003), n=8 τ=240 and n=24 τ=196560 (Levenshtein; Odlyzko–Sloane 1979, via linear programming). All other dimensions are open, with recent lower-bound gains in dims 11, 17–21, 25–31.",
    "prize": "",
    "tags": [
      "packing",
      "spheres",
      "lattices"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Kissing_number"
      }
    ],
    "note": "Newton was right that 12 spheres kiss a central one in 3D (Gregory thought 13 might fit). The problem is exactly solved only in the six 'magic' dimensions tied to remarkable lattices (E8, Leech); everywhere else even the exact count is unknown."
  },
  {
    "id": "kobon-triangle",
    "name": "Kobon Triangle Problem",
    "field": "Geometry",
    "subfield": "Line arrangements",
    "posedYear": 1970,
    "posedBy": "Kobon Fujimura",
    "statement": "Determine the maximum number N(k) of nonoverlapping triangles whose sides lie on an arrangement of k straight lines; conjecturally the Clément–Bader refinement of Tamura's upper bound ⌊k(k−2)/3⌋ is achievable for all admissible k.",
    "form": "N(k) = ⌊k(k−2)/3⌋ − (1 if k ≡ 0,2 mod 6 else 0)  for all k ?",
    "counterexample": "An arrangement of k lines producing more triangles than the conjectured bound, or a proof the bound is unreachable for some k (settling the value differently).",
    "disproof": "other",
    "status": "open",
    "evidence": "Tamura proved N(k) ≤ ⌊k(k−2)/3⌋; Clément–Bader showed it drops by one when k ≡ 0 or 2 (mod 6). The bound is met for k = 3–9 and many odd k up to 33, but is unproven in general and unmet for k = 10, 11, 12. No closed formula is known.",
    "prize": "",
    "tags": [
      "line-arrangements",
      "combinatorial-geometry",
      "extremal"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Kobon_triangle_problem"
      }
    ],
    "note": "A deceptively elementary optimization: with k drawn lines, how many disjoint triangles can you carve out? Even the exact maximum for modest k is unknown, and no general formula has been proven."
  },
  {
    "id": "lonely-runner",
    "name": "Lonely Runner Conjecture",
    "field": "Geometry",
    "subfield": "Diophantine approximation / geometry of numbers",
    "posedYear": 1967,
    "posedBy": "J. M. Wills (1967); T. W. Cusick (1973)",
    "statement": "For k runners starting together on a unit-circumference circular track at distinct constant speeds, each runner is at some instant at distance at least 1/k (along the track) from every other runner.",
    "form": "∀ distinct v₁,…,v_k ∀ i ∃ t : min_{j≠i} ‖(v_i−v_j)t‖ ≥ 1/k   (‖·‖ = distance to nearest integer)",
    "counterexample": "A set of speeds and a runner who is never simultaneously at track-distance ≥ 1/k from all the others.",
    "disproof": "counterexample",
    "status": "mostly-open",
    "evidence": "Proven for k ≤ 7 (Barajas–Serra 2008 for k=6; Rosenfeld 2025 for k=7); 2025 preprints announce k=8, 9, 10. The general case remains open, and the bound 1/k is known to be tight.",
    "prize": "",
    "tags": [
      "number-theory",
      "combinatorial-geometry"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Lonely_runner_conjecture"
      },
      {
        "label": "The Lonely Runner Conjecture turns 60 (2024)",
        "url": "https://arxiv.org/abs/2409.20160"
      }
    ],
    "note": "A view-obstruction / gaps-in-a-torus problem with a charming runners metaphor. This repo has a dedicated 'runner' explainer page; verified through 7 runners with recent progress claimed on 8–10, but wide open in general."
  },
  {
    "id": "moving-sofa",
    "name": "Moving Sofa Problem",
    "field": "Geometry",
    "subfield": "Optimization / rigid motion",
    "posedYear": 1966,
    "posedBy": "Leo Moser (problem); Joseph Gerver (conjectured optimum, 1992)",
    "statement": "The largest-area rigid planar shape that can be maneuvered around a right-angle corner in a unit-width hallway is Gerver's sofa, of area ≈ 2.2195.",
    "form": "sup { area(S) : S can slide through an L-shaped corridor of width 1 } = Gerver's constant ≈ 2.2195",
    "counterexample": "A connected planar region of area > 2.2195 that can be continuously moved around the unit-width right-angle corner.",
    "disproof": "counterexample",
    "status": "mostly-open",
    "evidence": "Gerver (1992) constructed the conjectured optimal 18-arc shape; Kallus–Romik (2018) gave a computer-assisted upper bound of 2.37. Jineon Baek posted a 119-page proof of optimality (Nov 2024) that is under peer review at Annals of Mathematics as of 2026 and is widely believed correct (a Scientific American 'top math breakthrough of 2025'). Pending formal confirmation the problem is effectively — but not yet officially — resolved.",
    "prize": "",
    "tags": [
      "optimization",
      "planar",
      "rigid-motion"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Moving_sofa_problem"
      },
      {
        "label": "Baek, Optimality of Gerver's Sofa (2024)",
        "url": "https://arxiv.org/abs/2411.19826"
      }
    ],
    "note": "The 'Friends pivot!' problem, made precise. Listed here with a clear caveat: unlike the truly-open entries, this one has a claimed complete proof (Baek 2024) that the community expects to hold — it is included only because peer review at Annals has not yet finished, so it is not formally closed."
  },
  {
    "id": "weaire-phelan-optimal-foam",
    "name": "Optimal Foam / Weaire–Phelan Optimality (post-Kelvin)",
    "field": "Geometry",
    "subfield": "Minimal surfaces / partitions",
    "posedYear": 1993,
    "posedBy": "Denis Weaire & Robert Phelan (structure); after Lord Kelvin's 1887 question",
    "statement": "The Weaire–Phelan structure partitions space into equal-volume cells with the least interface (surface) area per cell of any such partition.",
    "form": "Weaire–Phelan ∈ argmin over equal-volume partitions of ℝ³ of (total interface area per cell)",
    "counterexample": "A partition of space into unit-volume cells with smaller surface area per cell than Weaire–Phelan's (≈ 5.288 per cell).",
    "disproof": "counterexample",
    "status": "open",
    "evidence": "Kelvin's original conjecture (the bitruncated cubic / truncated-octahedron foam is optimal) was DISPROVEN by Weaire–Phelan in 1993, whose structure has ≈0.3% less area. Whether Weaire–Phelan is itself optimal is unproven; it merely holds the record. Other counterexamples to Kelvin exist but none beat it.",
    "prize": "",
    "tags": [
      "minimal-surfaces",
      "packing",
      "foams"
    ],
    "links": [
      {
        "label": "Weaire–Phelan structure (Wikipedia)",
        "url": "https://en.wikipedia.org/wiki/Weaire%E2%80%93Phelan_structure"
      },
      {
        "label": "Kelvin's conjecture (MathWorld)",
        "url": "https://mathworld.wolfram.com/KelvinsConjecture.html"
      }
    ],
    "note": "Kelvin asked in 1887 for the most economical soap-foam partition of space; his own answer stood for a century until Weaire–Phelan beat it (the structure later inspired the Beijing 'Water Cube'). The disproof is settled — the open question is whether the new champion is truly optimal."
  },
  {
    "id": "reinhardt-smoothed-octagon",
    "name": "Reinhardt Conjecture (Smoothed Octagon)",
    "field": "Geometry",
    "subfield": "Packing / convexity",
    "posedYear": 1934,
    "posedBy": "Karl Reinhardt",
    "statement": "The centrally-symmetric convex body in the plane whose densest packing is least dense is the smoothed octagon (packing density ≈ 0.902414).",
    "form": "argmin over centrally-symmetric convex K ⊂ ℝ² of δ_max(K) = smoothed octagon,  δ ≈ 0.902414",
    "counterexample": "A centrally symmetric convex disk whose optimal packing density is below ≈ 0.902414.",
    "disproof": "counterexample",
    "status": "open",
    "evidence": "The smoothed octagon is a proven local minimum (Nazarov 1986). Hales–Vajjha (2023–24) proved the worst-packing centrally symmetric shape must be a smoothed polygon and reformulated the problem as optimal control; identifying it as the octagon specifically is still open.",
    "prize": "",
    "tags": [
      "packing",
      "convexity",
      "planar"
    ],
    "links": [
      {
        "label": "Smoothed octagon (Wikipedia)",
        "url": "https://en.wikipedia.org/wiki/Smoothed_octagon"
      },
      {
        "label": "Reinhardt as optimal control (Hales 2017)",
        "url": "https://arxiv.org/abs/1703.01352"
      }
    ],
    "note": "The two-dimensional analogue of Ulam's problem: which symmetric shape is hardest to pack? The strange favorite is an octagon with corners rounded by hyperbola arcs — it packs at only ~90%, less than the circle, and is conjectured to be the pessimal shape."
  },
  {
    "id": "sausage-conjecture",
    "name": "Sausage Conjecture (L. Fejes Tóth)",
    "field": "Geometry",
    "subfield": "Finite packing",
    "posedYear": 1975,
    "posedBy": "László Fejes Tóth",
    "statement": "In dimensions d ≥ 5, the tightest packing of any finite number of unit balls (minimizing convex-hull volume) is the 'sausage' — all centers in a straight line; unproven for 5 ≤ d ≤ 41.",
    "form": "d ≥ 5  ⇒  optimal finite unit-ball packing has collinear centers (a sausage)",
    "counterexample": "A finite collection of unit balls in some dimension 5 ≤ d ≤ 41 whose optimal (minimal-hull) arrangement is a clustered, non-collinear blob.",
    "disproof": "counterexample",
    "status": "partial",
    "evidence": "Proven for all d ≥ 42 (Betke–Henk 1998; earlier Betke–Henk–Wills for d ≥ 13387). Open for 5 ≤ d ≤ 41. In d = 3, 4 the sausage is known to be non-optimal for large ball counts (the 'sausage catastrophe'), so the conjecture is genuinely a high-dimensional phenomenon.",
    "prize": "",
    "tags": [
      "packing",
      "finite-packing",
      "convexity"
    ],
    "links": [
      {
        "label": "Sausage conjecture (MathWorld)",
        "url": "https://mathworld.wolfram.com/SausageConjecture.html"
      },
      {
        "label": "Packings, sausages and catastrophes (2020)",
        "url": "https://arxiv.org/abs/2005.04267"
      }
    ],
    "note": "Surprisingly, in 5+ dimensions the most compact way to bundle finitely many balls is to line them up single-file like sausages, not to clump them — in 3D and 4D clumping eventually wins (the 'sausage catastrophe'). Proven above dimension 41, it stays open in the band 5–41."
  },
  {
    "id": "ulam-packing",
    "name": "Ulam's Packing Conjecture",
    "field": "Geometry",
    "subfield": "Packing / convexity",
    "posedYear": 1972,
    "posedBy": "Stanisław Ulam (posthumous, via Martin Gardner)",
    "statement": "Among all convex bodies in three-dimensional space, the ball has the smallest optimal packing density — it is the worst-packing convex solid.",
    "form": "∀ convex body K ⊂ ℝ³ : δ_opt(K) ≥ δ_opt(ball) = π/√18 ≈ 0.7405",
    "counterexample": "A convex 3D solid whose densest possible packing has density below π/√18.",
    "disproof": "counterexample",
    "status": "open",
    "evidence": "Kallus (2014) proved the ball is a local pessimum among centrally symmetric convex bodies (any nearly-spherical symmetric body packs strictly denser), consistent with the conjecture. Numerical searches over many solids have found nothing worse than the ball, but no proof or counterexample exists for general convex bodies.",
    "prize": "",
    "tags": [
      "packing",
      "convexity"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Ulam%27s_packing_conjecture"
      }
    ],
    "note": "A curious dual to the Kepler sphere-packing problem: instead of asking which packing is best, Ulam asked which shape is worst, and guessed the round ball wastes the most space. Every convex solid tested packs at least as tightly, but a proof is elusive."
  },
  {
    "id": "albertson-conjecture",
    "name": "Albertson Conjecture",
    "field": "Graph theory",
    "subfield": "Crossing numbers / coloring",
    "posedYear": 2007,
    "posedBy": "Michael O. Albertson",
    "statement": "Every graph with chromatic number r has crossing number at least that of the complete graph K_r.",
    "form": "∀G: χ(G) ≥ r ⟹ cr(G) ≥ cr(K_r)",
    "counterexample": "A graph requiring r colors that can be drawn in the plane with fewer crossings than any drawing of K_r.",
    "disproof": "counterexample",
    "status": "open",
    "evidence": "The case r=5 is equivalent to the Four Color Theorem. Verified for r ≤ 24 (Albertson–Cranston–Fox, Barát–Tóth, Ackerman, and later work), with potential counterexamples for r ∈ {25,26} severely constrained. Open in general.",
    "prize": "",
    "tags": [
      "crossing-number",
      "coloring"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Albertson_conjecture"
      }
    ],
    "note": "Among all graphs needing r colors, the complete graph K_r is conjectured to be the easiest to draw with few edge crossings. The r=5 case is exactly the Four Color Theorem in disguise; the conjecture pushes that intuition to all r. It's checked up to 24 colors, but a single r-chromatic graph beating K_r's crossing number would refute it."
  },
  {
    "id": "barnette-conjecture",
    "name": "Barnette's Conjecture",
    "field": "Graph theory",
    "subfield": "Hamiltonicity",
    "posedYear": 1969,
    "posedBy": "David W. Barnette",
    "statement": "Every 3-connected cubic bipartite planar graph is Hamiltonian.",
    "form": "∀G (cubic ∧ 3-connected ∧ bipartite ∧ planar): G is Hamiltonian",
    "counterexample": "A single cubic, 3-connected, bipartite, planar graph that has no Hamiltonian cycle.",
    "disproof": "counterexample",
    "status": "open",
    "evidence": "Verified by computer for all such graphs up to 90 vertices. Known to hold under extra conditions (e.g. Barnette graphs whose faces meet certain size constraints). A carefully chosen compromise between Tait's and Tutte's disproven conjectures — all known counterexamples to those violate exactly one of bipartite/planar.",
    "prize": "",
    "tags": [
      "hamiltonicity",
      "planar",
      "cubic-graphs"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Barnette%27s_conjecture"
      },
      {
        "label": "MathWorld",
        "url": "https://mathworld.wolfram.com/BarnettesConjecture.html"
      }
    ],
    "note": "Tait guessed all 3-connected cubic planar graphs are Hamiltonian (false), Tutte weakened it (also false). Barnette added bipartiteness on top of planarity as the sweet spot. It has survived every computer search to date, but a single non-Hamiltonian graph meeting all four conditions would end it."
  },
  {
    "id": "berge-fulkerson-conjecture",
    "name": "Berge–Fulkerson Conjecture",
    "field": "Graph theory",
    "subfield": "Edge coloring / matchings",
    "posedYear": 1971,
    "posedBy": "Claude Berge and D. R. Fulkerson",
    "statement": "Every bridgeless cubic graph has six perfect matchings such that each edge belongs to exactly two of them.",
    "form": "∀G bridgeless cubic ∃ M_1,…,M_6 perfect matchings: every edge lies in exactly 2 of the M_i",
    "counterexample": "A bridgeless cubic graph (necessarily a snark) with no family of six perfect matchings covering each edge exactly twice.",
    "disproof": "counterexample-hard",
    "status": "open",
    "evidence": "Trivial for 3-edge-colorable cubic graphs, so any counterexample is a snark. Verified for the Petersen graph and various infinite snark families (e.g. Máčajová–Škoviera rotation snarks, 2021). Implies the cycle double cover conjecture.",
    "prize": "",
    "tags": [
      "edge-coloring",
      "matchings",
      "cubic-graphs",
      "snarks"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Berge%E2%80%93Fulkerson_conjecture"
      },
      {
        "label": "Open Problem Garden",
        "url": "http://www.openproblemgarden.org/op/the_berge_fulkerson_conjecture"
      }
    ],
    "note": "A strengthening of the fact that every bridgeless cubic graph has a perfect matching: it demands six of them arranged to cover each edge exactly twice. Since it's automatic for graphs whose edges 3-color, a refuting graph would have to be a snark."
  },
  {
    "id": "cycle-double-cover-conjecture",
    "name": "Cycle Double Cover Conjecture",
    "field": "Graph theory",
    "subfield": "Cycles and cubic graphs",
    "posedYear": 1973,
    "posedBy": "George Szekeres and Paul Seymour (independently)",
    "statement": "Every bridgeless graph has a collection of cycles such that every edge lies in exactly two of them.",
    "form": "∀G bridgeless ∃ family C of cycles: every edge e ∈ E(G) is covered exactly twice",
    "counterexample": "A bridgeless graph (a snark is the expected shape of any minimal counterexample) admitting no family of cycles that double-covers every edge.",
    "disproof": "counterexample-hard",
    "status": "open",
    "evidence": "A minimal counterexample would have to be a snark (bridgeless cubic, chromatic index 4). Implied by the Petersen coloring conjecture. As of mid-2026 an unrefereed, AI-assisted proof claim was circulating but had not passed peer review, so the conjecture is still considered open.",
    "prize": "",
    "tags": [
      "cycles",
      "cubic-graphs",
      "snarks"
    ],
    "links": [
      {
        "label": "MathWorld",
        "url": "https://mathworld.wolfram.com/CycleDoubleCoverConjecture.html"
      },
      {
        "label": "Open Problem Garden",
        "url": "http://www.openproblemgarden.org/op/cycle_double_cover_conjecture"
      }
    ],
    "note": "It asks whether every 2-edge-connected graph can be 'wrapped' by a set of cycles so that each edge is used exactly twice — the discrete analogue of an orientable surface embedding. Any counterexample must be a snark, one of the hard-to-color cubic graphs that resist so many conjectures at once."
  },
  {
    "id": "gyarfas-sumner-conjecture",
    "name": "Gyárfás–Sumner Conjecture",
    "field": "Graph theory",
    "subfield": "Graph coloring / χ-boundedness",
    "posedYear": 1981,
    "posedBy": "András Gyárfás and David Sumner",
    "statement": "For every tree T and complete graph K, the class of graphs containing neither T nor K as an induced subgraph is χ-bounded.",
    "form": "∀ tree T, ∀k ∃f: (T,K_k)-induced-free G ⟹ χ(G) ≤ f(ω(G))",
    "counterexample": "For some fixed tree T and clique K_k, a family of graphs excluding both as induced subgraphs yet with clique number bounded and chromatic number unbounded — witnessed by a single graph of bounded clique number and arbitrarily large chromatic number.",
    "disproof": "counterexample",
    "status": "open",
    "evidence": "Proven when T is a path (Gyárfás) and for brooms/multibrooms (Kierstead–Penrice 1994, Kierstead–Zhu 2004) and various small trees. Even the bound for excluding P_5 is not known to be polynomial. General case open.",
    "prize": "",
    "tags": [
      "coloring",
      "chi-boundedness",
      "induced-subgraphs"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Gy%C3%A1rf%C3%A1s%E2%80%93Sumner_conjecture"
      }
    ],
    "note": "Graphs can need many colors while staying triangle-free, but only if they contain complicated induced structures. The conjecture says forbidding any one tree (plus a clique) tames the chromatic number to a function of the clique size. It is proven for paths but open for almost every other tree."
  },
  {
    "id": "hadwiger-conjecture",
    "name": "Hadwiger's Conjecture",
    "field": "Graph theory",
    "subfield": "Graph coloring / minors",
    "posedYear": 1943,
    "posedBy": "Hugo Hadwiger",
    "statement": "Every graph with no K_t minor can be properly colored with at most t−1 colors.",
    "form": "∀G: K_t ⋠ G ⟹ χ(G) ≤ t−1",
    "counterexample": "A single finite graph G that has no K_t minor yet requires t or more colors (i.e. χ(G) ≥ t while K_t is not a minor of G).",
    "disproof": "counterexample",
    "status": "open",
    "evidence": "Proven for t ≤ 6 (t=5 and t=6 reduce to the Four Color Theorem, via Robertson–Seymour–Thomas 1993); open for t ≥ 7. Best general bound O(t·log log t) colors for K_t-minor-free graphs (Delcourt–Postle 2021).",
    "prize": "",
    "tags": [
      "coloring",
      "minors"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Hadwiger_conjecture_(graph_theory)"
      },
      {
        "label": "MathWorld",
        "url": "https://mathworld.wolfram.com/HadwigerConjecture.html"
      }
    ],
    "note": "A sweeping generalization of the Four Color Theorem: it says needing many colors always forces a large complete-graph minor. It is widely regarded as one of the deepest open problems in graph theory; a counterexample would be a specific graph that is hard to color yet contains no big clique minor."
  },
  {
    "id": "jorgensen-conjecture",
    "name": "Jørgensen's Conjecture",
    "field": "Graph theory",
    "subfield": "Graph minors",
    "posedYear": 1994,
    "posedBy": "Leif K. Jørgensen",
    "statement": "Every 6-connected graph with no K_6 minor can be made planar by deleting a single vertex.",
    "form": "∀G (6-connected ∧ K_6 ⋠ G): ∃v such that G−v is planar",
    "counterexample": "A 6-connected graph with no K_6 minor such that no single vertex deletion leaves a planar graph (a non-apex counterexample).",
    "disproof": "counterexample",
    "status": "open",
    "evidence": "Proven for all sufficiently large graphs by Kawarabayashi, Norin, Thomas and Wollan (2012), and for 6-connected graphs of bounded tree-width. The remaining open range is the 'small but not tiny' 6-connected graphs. A natural strengthening of the (proven) t≤6 cases of Hadwiger's conjecture.",
    "prize": "",
    "tags": [
      "minors",
      "connectivity",
      "apex"
    ],
    "links": [
      {
        "label": "Open Problem Garden",
        "url": "https://openproblemgarden.org/op/jorgensens_conjecture"
      }
    ],
    "note": "It refines Hadwiger's conjecture for K_6: rather than just bounding colors, it pins down the structure of highly connected K_6-minor-free graphs as 'planar plus one vertex' (apex). The large-graph case is a theorem; a counterexample would be a moderately sized 6-connected graph that is stubbornly non-apex without a K_6 minor."
  },
  {
    "id": "list-edge-coloring-conjecture",
    "name": "List Edge Coloring Conjecture",
    "field": "Graph theory",
    "subfield": "Graph coloring",
    "posedYear": 1975,
    "posedBy": "Vizing, Gupta, Albertson–Collins, Bollobás–Harris (independently)",
    "statement": "For every graph, the list chromatic index equals the ordinary chromatic index.",
    "form": "∀G: χ'_ℓ(G) = χ'(G)",
    "counterexample": "A graph G together with lists of χ'(G) colors on each edge for which no proper edge coloring picking each edge's color from its list exists.",
    "disproof": "counterexample",
    "status": "open",
    "evidence": "Galvin (1995) proved it for bipartite multigraphs; Kahn (1996) proved it asymptotically; holds for regular planar class-1 graphs (Ellingham–Goddyn) and complete graphs of prime degree. General case open.",
    "prize": "",
    "tags": [
      "coloring",
      "list-coloring",
      "edge-coloring"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/List_edge-coloring"
      },
      {
        "label": "Open Problem Garden",
        "url": "http://www.openproblemgarden.org/op/edge_list_coloring_conjecture"
      }
    ],
    "note": "Edge coloring stays just as easy even when each edge must draw its color from its own private list, as long as the lists are as long as the ordinary edge-chromatic number. Unusually for list coloring (where lists usually make things harder), edges are conjectured to behave exactly as well as with a shared palette."
  },
  {
    "id": "lovasz-vertex-transitive-conjecture",
    "name": "Lovász Conjecture (Hamiltonicity of Vertex-Transitive Graphs)",
    "field": "Graph theory",
    "subfield": "Hamiltonicity / symmetry",
    "posedYear": 1969,
    "posedBy": "László Lovász",
    "statement": "Every finite connected vertex-transitive graph contains a Hamiltonian path.",
    "form": "∀G (connected ∧ vertex-transitive): G has a Hamiltonian path",
    "counterexample": "A finite connected vertex-transitive graph with no Hamiltonian path (a spanning path visiting each vertex once).",
    "disproof": "counterexample",
    "status": "open",
    "evidence": "Confirmed for all connected vertex-transitive graphs of odd order and for many order families (kp with k ≤ 6, p^j with small j, 2p^2, etc.). Only five connected vertex-transitive graphs are known without a Hamiltonian cycle (K_2, Petersen, Coxeter, and two derived), and all still have Hamiltonian paths. Open in general.",
    "prize": "",
    "tags": [
      "hamiltonicity",
      "symmetry",
      "cayley-graphs"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Lov%C3%A1sz_conjecture"
      },
      {
        "label": "MathWorld",
        "url": "https://mathworld.wolfram.com/LovaszConjecture.html"
      }
    ],
    "note": "Vertex-transitive graphs look the same from every vertex — the most symmetric graphs there are. Lovász asked whether such symmetry forces a spanning path. Remarkably, only five symmetric graphs are known to lack even a Hamiltonian cycle, and every one still has a path; a counterexample would be a symmetric graph with no spanning path at all."
  },
  {
    "id": "negami-planar-cover-conjecture",
    "name": "Negami's Planar Cover Conjecture",
    "field": "Graph theory",
    "subfield": "Topological graph theory",
    "posedYear": 1988,
    "posedBy": "Seiya Negami",
    "statement": "A connected graph has a finite planar cover if and only if it embeds in the projective plane.",
    "form": "∀G connected: (∃ finite planar cover of G) ⟺ G embeds in the projective plane",
    "counterexample": "A connected graph that has a finite planar cover (a planar graph mapping onto it locally isomorphically) but does not embed in the projective plane.",
    "disproof": "counterexample",
    "status": "open",
    "evidence": "The whole conjecture reduces to a single graph: it holds if and only if K_{1,2,2,2} has no finite planar cover. Of the 32 minor-minimal non-projective-planar graphs, 31 are known to have no planar cover. Negami published a new rotation-system approach in 2024. Open since 1988.",
    "prize": "",
    "tags": [
      "planar",
      "covers",
      "topological"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Negami%27s_conjecture"
      }
    ],
    "note": "A planar cover is a planar graph that wraps finitely many times around a target graph. Negami conjectured these exist exactly for graphs drawable on the projective plane. The entire question now hinges on one specific graph, K_{1,2,2,2}: settling whether it has a planar cover settles the conjecture."
  },
  {
    "id": "new-digraph-reconstruction-conjecture",
    "name": "New Digraph Reconstruction Conjecture",
    "field": "Graph theory",
    "subfield": "Structural graph theory",
    "posedYear": 1981,
    "posedBy": "S. Ramachandran",
    "statement": "Every digraph is reconstructible from its deck of vertex-deleted subdigraphs when each card is labeled with the in-degree and out-degree of the deleted vertex.",
    "form": "∀D,D': Ndeck(D) = Ndeck(D') ⟹ D ≅ D'",
    "counterexample": "Two non-isomorphic digraphs whose vertex-deleted subdigraphs match up in pairs even after each is tagged with the ordered (out-degree, in-degree) of the removed vertex.",
    "disproof": "counterexample",
    "status": "open",
    "evidence": "Introduced to repair Harary's original digraph reconstruction conjecture after Stockmeyer (1977) found infinite families of counterexamples (including tournaments). The degree-augmented version has resisted the known counterexample constructions and remains open.",
    "prize": "",
    "tags": [
      "reconstruction",
      "digraphs"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/New_digraph_reconstruction_conjecture"
      }
    ],
    "note": "The plain directed-graph version of the reconstruction conjecture is known to be false, so Ramachandran added degree information to each card. Whether that extra data is enough to make digraphs reconstructible is still unknown; a counterexample would be a single pair of small digraphs."
  },
  {
    "id": "petersen-coloring-conjecture",
    "name": "Petersen Coloring Conjecture",
    "field": "Graph theory",
    "subfield": "Edge coloring / cubic graphs",
    "posedYear": 1988,
    "posedBy": "François Jaeger",
    "statement": "The edges of every bridgeless cubic graph can be colored using the edges of the Petersen graph so that adjacent edges receive adjacent Petersen edges.",
    "form": "∀G bridgeless cubic ∃ homomorphism-like map E(G) → E(Petersen) preserving adjacency of edges",
    "counterexample": "A bridgeless cubic graph admitting no edge-coloring by Petersen-graph edges that maps adjacent edges to adjacent Petersen edges (equivalently, no normal edge-coloring with ≤ 5 colors).",
    "disproof": "counterexample-hard",
    "status": "open",
    "evidence": "Equivalent (Jaeger) to: every bridgeless cubic graph has a normal edge-coloring with at most 5 colors. Best known upper bound on the normal chromatic index is 7. Implies both the Cycle Double Cover and Berge–Fulkerson conjectures. A minimal counterexample is a snark.",
    "prize": "",
    "tags": [
      "edge-coloring",
      "cubic-graphs",
      "snarks"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Petersen_coloring_conjecture"
      }
    ],
    "note": "The Petersen graph is the 'universal' obstruction in cubic graph theory, and this conjecture makes that literal: every bridgeless cubic graph should map onto it edge-adjacency-preservingly. It is one of the strongest conjectures in the area — proving it would immediately deliver several other famous conjectures."
  },
  {
    "id": "reconstruction-conjecture",
    "name": "Reconstruction Conjecture (Kelly–Ulam)",
    "field": "Graph theory",
    "subfield": "Structural graph theory",
    "posedYear": 1942,
    "posedBy": "Paul Kelly and Stanislaw Ulam",
    "statement": "Every finite graph on at least three vertices is determined up to isomorphism by its multiset of vertex-deleted subgraphs (its deck).",
    "form": "∀G,H (|V|≥3): deck(G) = deck(H) ⟹ G ≅ H",
    "counterexample": "Two non-isomorphic graphs G and H on n ≥ 3 vertices whose decks — the multisets of the n one-vertex-deleted subgraphs — are identical.",
    "disproof": "counterexample",
    "status": "open",
    "evidence": "Verified computationally for all graphs with at most 13 vertices (McKay 2022). Known to hold for trees, regular graphs, disconnected graphs, and several other classes. Digraph analogue is FALSE (Stockmeyer), but the undirected case is wide open.",
    "prize": "",
    "tags": [
      "reconstruction",
      "isomorphism"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Reconstruction_conjecture"
      },
      {
        "label": "MathWorld",
        "url": "https://mathworld.wolfram.com/GraphReconstructionConjecture.html"
      }
    ],
    "note": "Can you rebuild a graph knowing only the collection of subgraphs obtained by deleting each vertex one at a time? For over 80 years no one has found two different graphs with the same deck, nor proven none exist. A single such pair would settle it instantly."
  },
  {
    "id": "seymour-second-neighborhood-conjecture",
    "name": "Seymour's Second Neighborhood Conjecture",
    "field": "Graph theory",
    "subfield": "Directed graphs",
    "posedYear": 1990,
    "posedBy": "Paul Seymour",
    "statement": "Every oriented graph has a vertex whose second out-neighborhood is at least as large as its first out-neighborhood.",
    "form": "∀ oriented graph D ∃v: |N⁺⁺(v)| ≥ |N⁺(v)|",
    "counterexample": "An oriented graph (no 2-cycles) in which every vertex has strictly fewer vertices at out-distance exactly two than at out-distance one.",
    "disproof": "counterexample",
    "status": "open",
    "evidence": "Proven for tournaments (Fisher 1996, via the Dean–Latka conjecture) and several other classes; holds for random orientations. Huang–Peng (2024) improved the general constant factor to 0.715538 for the first time in over two decades. General case open.",
    "prize": "",
    "tags": [
      "digraphs",
      "neighborhoods"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Second_neighborhood_problem"
      },
      {
        "label": "Open Problem Garden",
        "url": "http://www.openproblemgarden.org/op/seymours_second_neighborhood_conjecture"
      }
    ],
    "note": "In any directed graph without mutual arcs, someone should have at least as many 'friends of friends' (reachable in exactly two steps) as direct 'friends'. It is proven for tournaments but wide open in general; a counterexample would be one directed graph where every vertex bucks the trend."
  },
  {
    "id": "sheehan-conjecture",
    "name": "Sheehan's Conjecture",
    "field": "Graph theory",
    "subfield": "Hamiltonicity",
    "posedYear": 1975,
    "posedBy": "John Sheehan",
    "statement": "No 4-regular graph has exactly one Hamiltonian cycle.",
    "form": "∀G 4-regular Hamiltonian: G has ≥ 2 distinct Hamiltonian cycles",
    "counterexample": "A 4-regular graph containing exactly one Hamiltonian cycle (a 'uniquely Hamiltonian' 4-regular graph).",
    "disproof": "counterexample",
    "status": "open",
    "evidence": "Thomassen proved it for all k-regular graphs with k ≥ 300 (via the Lovász Local Lemma). Verified for 4-regular graphs up to 21 vertices (up to 26 with girth ≥ 5). The intermediate degrees between 5 and 300 — including the target case 4 — remain open.",
    "prize": "",
    "tags": [
      "hamiltonicity",
      "regular-graphs"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Sheehan%27s_conjecture"
      },
      {
        "label": "Open Problem Garden",
        "url": "http://www.openproblemgarden.org/op/sheehans_conjecture"
      }
    ],
    "note": "Smith's theorem says cubic graphs never have exactly one Hamiltonian cycle. Sheehan conjectured the same for 4-regular graphs. Thomassen settled all large degrees at once, but the smallest and original case, degree 4, still stands; a counterexample would be one uniquely-Hamiltonian 4-regular graph."
  },
  {
    "id": "thomassen-chord-conjecture",
    "name": "Thomassen's Chord Conjecture",
    "field": "Graph theory",
    "subfield": "Cycles / connectivity",
    "posedYear": 1976,
    "posedBy": "Carsten Thomassen",
    "statement": "Every longest cycle in a 3-connected graph has a chord.",
    "form": "∀G 3-connected, ∀ longest cycle C in G: C has a chord",
    "counterexample": "A 3-connected graph whose longest cycle is chordless (an induced cycle — no edge joins two non-consecutive cycle vertices).",
    "disproof": "counterexample",
    "status": "open",
    "evidence": "Proven for 3-connected cubic graphs (Thomassen) and for 3-connected planar graphs that are cubic or have minimum degree ≥ 4; also for 2-connected cubic graphs. Open in general, even for planar graphs.",
    "prize": "",
    "tags": [
      "cycles",
      "connectivity",
      "chords"
    ],
    "links": [
      {
        "label": "Open Problem Garden",
        "url": "http://www.openproblemgarden.org/op/chords_of_longest_cycles"
      }
    ],
    "note": "A chord is a shortcut edge across a cycle. Thomassen conjectured that in any reasonably well-connected graph, the longest cycle can never be a bare, chordless loop. It's known for cubic graphs but open even for planar graphs; a counterexample would be a 3-connected graph whose longest cycle has no shortcut."
  },
  {
    "id": "total-coloring-conjecture",
    "name": "Total Coloring Conjecture (Behzad–Vizing)",
    "field": "Graph theory",
    "subfield": "Graph coloring",
    "posedYear": 1964,
    "posedBy": "Mehdi Behzad and Vadim Vizing (independently)",
    "statement": "Every graph can have its vertices and edges together colored with at most Δ+2 colors so that no two adjacent or incident elements share a color.",
    "form": "∀G: χ''(G) ≤ Δ(G) + 2",
    "counterexample": "A single graph G whose total chromatic number exceeds Δ(G)+2, i.e. no proper vertex-and-edge coloring exists with Δ+2 colors.",
    "disproof": "counterexample",
    "status": "open",
    "evidence": "Proven for Δ ≤ 5, for all planar graphs except possibly Δ = 6, and for many other classes. The lower bound Δ+1 is always necessary; the conjecture is that just one more color always suffices. Open in general since the 1960s.",
    "prize": "",
    "tags": [
      "coloring",
      "total-coloring"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Total_coloring"
      },
      {
        "label": "Open Problem Garden",
        "url": "http://www.openproblemgarden.org/op/behzads_conjecture"
      }
    ],
    "note": "Total coloring colors vertices and edges simultaneously. You clearly need at least Δ+1 colors; the conjecture says Δ+2 always suffices — a remarkably tight bound. It has held up for six decades, verified for small maximum degrees, but a single graph needing Δ+3 would break it."
  },
  {
    "id": "tutte-3-flow-conjecture",
    "name": "Tutte's 3-Flow Conjecture",
    "field": "Graph theory",
    "subfield": "Nowhere-zero flows",
    "posedYear": 1972,
    "posedBy": "W. T. Tutte",
    "statement": "Every 4-edge-connected graph admits a nowhere-zero 3-flow.",
    "form": "∀G 4-edge-connected ∃ nowhere-zero ℤ_3-flow on G",
    "counterexample": "A 4-edge-connected graph with no orientation and edge-labeling by {±1} (mod 3) satisfying flow conservation at every vertex.",
    "disproof": "counterexample",
    "status": "open",
    "evidence": "Thomassen (2012) proved 8-edge-connected graphs have a nowhere-zero 3-flow; improved to 6-edge-connected by Lovász–Thomassen–Wu–Zhang (2013). Holds for almost all 5-regular graphs. The gap between 6-edge-connected (proven) and 4-edge-connected (conjectured) remains.",
    "prize": "",
    "tags": [
      "flows"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Nowhere-zero_flow"
      },
      {
        "label": "Open Problem Garden",
        "url": "http://www.openproblemgarden.org/op/3_flow_conjecture"
      }
    ],
    "note": "The dual of the statement that 4-edge-connected planar graphs are 3-colorable, but for all graphs. High edge-connectivity versions are now theorems (down to 6), yet the conjectured threshold of 4-edge-connectivity is still out of reach; a counterexample would be one explicit 4-edge-connected graph."
  },
  {
    "id": "tutte-5-flow-conjecture",
    "name": "Tutte's 5-Flow Conjecture",
    "field": "Graph theory",
    "subfield": "Nowhere-zero flows",
    "posedYear": 1954,
    "posedBy": "W. T. Tutte",
    "statement": "Every bridgeless graph admits a nowhere-zero 5-flow.",
    "form": "∀G bridgeless ∃ nowhere-zero ℤ_5-flow on G",
    "counterexample": "A bridgeless graph with no assignment of nonzero values from {±1,±2,±3,±4} (mod 5) to oriented edges satisfying conservation at every vertex.",
    "disproof": "counterexample-hard",
    "status": "open",
    "evidence": "Seymour (1981) proved every bridgeless graph has a nowhere-zero 6-flow; the Petersen graph shows 5 is best possible (no nowhere-zero 4-flow). A minimal counterexample would be a snark. Open since 1954.",
    "prize": "",
    "tags": [
      "flows",
      "cubic-graphs",
      "snarks"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Nowhere-zero_flow"
      },
      {
        "label": "Open Problem Garden",
        "url": "http://www.openproblemgarden.org/op/5_flow_conjecture"
      }
    ],
    "note": "A nowhere-zero flow is a dual notion to graph coloring, defined on any graph rather than just planar ones. Tutte conjectured 5 values always suffice; Seymour got the bound down to 6, and the Petersen graph proves you can't do better than 5, but closing the final gap has been open for 70 years."
  },
  {
    "id": "vizing-domination-conjecture",
    "name": "Vizing's Conjecture (Domination of Graph Products)",
    "field": "Graph theory",
    "subfield": "Domination",
    "posedYear": 1968,
    "posedBy": "Vadim Vizing",
    "statement": "The domination number of the Cartesian product of two graphs is at least the product of their domination numbers.",
    "form": "∀G,H: γ(G □ H) ≥ γ(G)·γ(H)",
    "counterexample": "A pair of graphs G, H whose Cartesian product G □ H can be dominated by fewer than γ(G)·γ(H) vertices.",
    "disproof": "counterexample",
    "status": "open",
    "evidence": "Best general bound: γ(G □ H) ≥ ½ γ(G)γ(H) (Clark–Suen 2000), later refined by Brešar. Known to hold when one factor has domination number ≤ 3, is a tree, a cycle, or is chordal, etc. Open in full generality since posed.",
    "prize": "",
    "tags": [
      "domination",
      "graph-products"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Vizing%27s_conjecture"
      }
    ],
    "note": "A dominating set is a set of vertices adjacent to everything else. Vizing conjectured that dominating a product grid is at least as hard as the product of dominating each factor. The best proven bound is only half the conjectured one; a counterexample would be two explicit graphs whose product is unexpectedly easy to dominate. (Distinct from Vizing's edge-coloring theorem.)"
  },
  {
    "id": "andrews-curtis",
    "name": "Andrews–Curtis Conjecture",
    "field": "Group theory",
    "subfield": "Combinatorial group theory",
    "posedYear": 1965,
    "posedBy": "James J. Andrews, Morton L. Curtis",
    "statement": "Every balanced presentation of the trivial group can be reduced to the empty presentation by a finite sequence of elementary Andrews–Curtis (Nielsen plus conjugation and stabilization-free) moves.",
    "form": "⟨x_1,…,x_n | r_1,…,r_n⟩ ≅ 1 ⇒ reducible to ⟨x_1,…,x_n | x_1,…,x_n⟩ via AC-moves",
    "counterexample": "A balanced presentation of the trivial group that provably cannot be AC-trivialized (e.g. an Akbulut–Kirby or Miller–Schupp presentation shown to be stuck).",
    "disproof": "counterexample",
    "status": "open",
    "evidence": "Many candidate counterexamples (Akbulut–Kirby AK(n), Miller–Schupp series); some trivialized by computer search / reinforcement learning (2024). The prevailing belief is that it is false, but no counterexample is confirmed.",
    "prize": "",
    "tags": [
      "combinatorial-group-theory",
      "low-dimensional-topology"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Andrews%E2%80%93Curtis_conjecture"
      },
      {
        "label": "arXiv 2412.12293",
        "url": "https://arxiv.org/abs/2412.12293"
      }
    ],
    "note": "A question about 'simplifying' presentations of the trivial group with elementary moves, linked to low-dimensional topology (the Zeeman conjecture and smooth 4-dimensional Poincaré). Most experts suspect it is false, and much recent work uses machine learning and search to attack the standard families of potential counterexamples."
  },
  {
    "id": "bounded-burnside-exponent-5",
    "name": "Bounded Burnside Problem (small exponents)",
    "field": "Group theory",
    "subfield": "Finiteness / periodic groups",
    "posedYear": 1902,
    "posedBy": "William Burnside",
    "statement": "For exponents where the answer is unknown (notably exponent 5), is every finitely generated group in which every element satisfies xⁿ = 1 necessarily finite?",
    "form": "B(m,n) = F_m / ⟨⟨ wⁿ ⟩⟩ finite? — open for n = 5 and most n",
    "counterexample": "An infinite finitely generated group of a given small exponent (e.g. an infinite 2-generated group of exponent 5).",
    "disproof": "counterexample",
    "status": "mostly-open",
    "evidence": "Finite for n = 2, 3, 4, 6 (Sanov, Marshall Hall, others). Infinite for large odd n ≥ 665 (Novikov–Adian 1968) and large even n (Ivanov, Lysënok). Exponent 5 and various other cases remain unresolved.",
    "prize": "",
    "tags": [
      "periodic-groups",
      "finiteness"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Burnside_problem"
      }
    ],
    "note": "The general Burnside problem (drop the exponent bound) was answered 'no' by Golod–Shafarevich, and the restricted Burnside problem was solved by Zelmanov (Fields Medal). But the original bounded free Burnside groups B(m,n) are known finite only for n = 2, 3, 4, 6 and known infinite only for large n — the smallest genuinely open exponent is 5."
  },
  {
    "id": "kaplansky-zero-divisor",
    "name": "Kaplansky Zero-Divisor Conjecture",
    "field": "Group theory",
    "subfield": "Group rings",
    "posedYear": 1970,
    "posedBy": "Irving Kaplansky",
    "statement": "The group ring K[G] of a torsion-free group G over a field K has no nonzero zero divisors.",
    "form": "G torsion-free, K a field, a,b ∈ K[G], ab = 0 ⇒ a = 0 or b = 0",
    "counterexample": "A torsion-free group G, field K, and nonzero elements a, b ∈ K[G] with ab = 0.",
    "disproof": "counterexample",
    "status": "open",
    "evidence": "Known for orderable groups, unique-product groups, elementary amenable and residually-nilpotent cases. The related unit conjecture was disproved by Gardam (2021), but the zero-divisor conjecture remains open.",
    "prize": "",
    "tags": [
      "group-rings",
      "algebra"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Kaplansky%27s_conjectures"
      }
    ],
    "note": "The strongest of Kaplansky's three group-ring conjectures (zero-divisor ⇒ idempotent). Its sibling, the unit conjecture, was famously refuted by Giles Gardam in 2021 using a torsion-free group in characteristic 2, which sharpened interest in whether the zero-divisor version might also fail."
  },
  {
    "id": "whitehead-asphericity",
    "name": "Whitehead Asphericity Conjecture",
    "field": "Group theory",
    "subfield": "Geometric/combinatorial group theory",
    "posedYear": 1941,
    "posedBy": "J. H. C. Whitehead",
    "statement": "Every connected subcomplex of an aspherical 2-dimensional CW-complex is itself aspherical.",
    "form": "K aspherical 2-complex, L ⊆ K subcomplex ⇒ π_2(L) = 0",
    "counterexample": "An aspherical 2-complex containing a subcomplex L with π_2(L) ≠ 0.",
    "disproof": "counterexample",
    "status": "open",
    "evidence": "Known under added hypotheses (e.g. finite or when the ambient complex is a standard 2-complex of certain LOT/labelled-oriented-tree presentations, Rosebrock and others). General case open since 1941.",
    "prize": "",
    "tags": [
      "asphericity",
      "2-complexes",
      "topology"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Whitehead_conjecture"
      }
    ],
    "note": "Asphericity means the space has no higher homotopy — it is a K(π,1). Whitehead asked whether this good property is inherited by subcomplexes in dimension 2. It connects to group-theoretic questions about relation modules and to the Eilenberg–Ganea and Andrews–Curtis circles of problems."
  },
  {
    "id": "zariski-cancellation-char0",
    "name": "Zariski Cancellation Problem (characteristic 0)",
    "field": "Group theory",
    "subfield": "Affine algebraic geometry",
    "posedYear": 1949,
    "posedBy": "Oscar Zariski",
    "statement": "Over a field of characteristic 0, if a variety X satisfies X × 𝔸¹ ≅ 𝔸^{n+1}, must X be isomorphic to affine space 𝔸ⁿ?",
    "form": "X × 𝔸¹ ≅ 𝔸^{n+1} over char-0 field ⇒ X ≅ 𝔸ⁿ",
    "counterexample": "A non-affine-space variety X over ℂ with X × 𝔸¹ ≅ 𝔸^{n+1} (a 'fake affine space' that becomes standard after one stabilization).",
    "disproof": "counterexample",
    "status": "partial",
    "evidence": "True for n = 1 (Abhyankar–Eakin–Heinzer) and n = 2 (Fujita, Miyanishi–Sugie in char 0). Neena Gupta (2014) proved it FALSE in positive characteristic for n ≥ 3; the characteristic-0 case for n ≥ 3 remains open.",
    "prize": "",
    "tags": [
      "affine-geometry",
      "cancellation"
    ],
    "links": [
      {
        "label": "Wikipedia (Zariski)",
        "url": "https://en.wikipedia.org/wiki/Zariski%27s_cancellation_problem"
      }
    ],
    "note": "A 'cancellation' question: can you always divide out a factor of the affine line? Neena Gupta earned wide recognition for showing it fails in positive characteristic in dimension ≥ 3, but her counterexamples do not descend to characteristic 0, where the problem (n ≥ 3) is still unsolved."
  },
  {
    "id": "continuum-hypothesis",
    "name": "Continuum Hypothesis",
    "field": "Logic",
    "subfield": "Set theory / cardinal arithmetic",
    "posedYear": 1878,
    "posedBy": "Georg Cantor",
    "statement": "There is no set whose cardinality lies strictly between that of the integers and that of the real numbers.",
    "form": "2^{ℵ_0} = ℵ_1 (no cardinal κ with ℵ_0 < κ < 2^{ℵ_0})",
    "counterexample": "Not counterexample-disprovable within ZFC: CH is independent of ZFC, so no ZFC-provable object can settle it either way.",
    "disproof": "other",
    "status": "open",
    "evidence": "Gödel (1938): CH consistent with ZFC (constructible universe L). Cohen (1963, Fields Medal): ¬CH consistent with ZFC (forcing). Hence formally independent of ZFC. Ongoing programs (Woodin's Ω-logic, the inner-model program, forcing axioms) argue for a 'correct' value but reach no consensus.",
    "prize": "",
    "tags": [
      "set-theory",
      "independence",
      "logic"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Continuum_hypothesis"
      },
      {
        "label": "SEP",
        "url": "https://plato.stanford.edu/entries/continuum-hypothesis/"
      }
    ],
    "note": "Hilbert's first problem, and the classic example of independence: Gödel and Cohen together showed the standard ZFC axioms can neither prove nor refute it, so it is not 'disprovable by counterexample' in the usual sense. It remains open in the philosophical sense — set theorists debate whether new axioms should decide it, and if so, which way."
  },
  {
    "id": "hilbert-tenth-over-q",
    "name": "Hilbert's Tenth Problem over ℚ",
    "field": "Logic",
    "subfield": "Decidability / Diophantine geometry",
    "posedYear": 1970,
    "posedBy": "after Matiyasevich; classical for the field ℚ",
    "statement": "Is there an algorithm that decides whether an arbitrary polynomial equation with rational coefficients has a solution in the rational numbers?",
    "form": "∃ algorithm: {f ∈ ℚ[x_1,…,x_n] : ∃ a ∈ ℚⁿ, f(a)=0} decidable ?",
    "counterexample": "A decision procedure for rational solvability (proving decidability), or a Diophantine definition of ℤ in ℚ (which would transfer undecidability from ℤ and prove it undecidable).",
    "disproof": "existence",
    "status": "open",
    "evidence": "Over ℤ, undecidable (Matiyasevich 1970, on Davis–Putnam–Robinson). Over ℚ open: the usual attack is to show ℤ is Diophantine in ℚ, but Mazur's conjecture on topology of rational points suggests it is not; Koenigsmann (2010) gave a universal (∀) definition of ℤ in ℚ.",
    "prize": "",
    "tags": [
      "decidability",
      "diophantine",
      "logic"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Hilbert%27s_tenth_problem"
      }
    ],
    "note": "Matiyasevich's theorem killed Hilbert's dream of a general algorithm for integer solutions, but the analogous question over the rationals is wide open and considered one of the deepest problems in undecidability and arithmetic geometry. Whether it is decidable hinges on subtle geometry of rational points captured by Mazur's conjectures."
  },
  {
    "id": "abc-conjecture",
    "name": "abc conjecture",
    "field": "Number theory",
    "subfield": "Diophantine / Diophantine approximation",
    "posedYear": 1985,
    "posedBy": "Joseph Oesterlé and David Masser",
    "statement": "For every ε>0, only finitely many coprime triples a+b=c have c exceeding the radical (product of distinct primes) of abc raised to the power 1+ε.",
    "form": "∀ ε>0: |{(a,b,c): a+b=c, gcd(a,b)=1, c > rad(abc)^{1+ε}}| < ∞",
    "counterexample": "Not a single triple: refuting it means producing, for some fixed ε>0, an infinite family of coprime triples with c > rad(abc)^{1+ε}.",
    "disproof": "other",
    "status": "open",
    "evidence": "Widely regarded as open and unresolved. Shinichi Mochizuki's Inter-universal Teichmüller Theory claims a proof (published 2020), but Scholze and Stix (2018) identified a gap they consider fatal; the dispute is not settled in the wider community. Extensive 'abc triples' databases exist but no triple violates the conjecture.",
    "prize": "",
    "tags": [
      "diophantine",
      "radical",
      "abc"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Abc_conjecture"
      },
      {
        "label": "Scholze–Stix (2018)",
        "url": "https://en.wikipedia.org/wiki/Abc_conjecture#Claimed_proofs"
      }
    ],
    "note": "A central conjecture from which a vast web of results would follow — Fermat's Last Theorem for large exponents, Roth's theorem, Hall's conjecture, finiteness for Brocard and Fermat–Catalan, and more — because it controls how much repeated prime factors can concentrate in a+b=c. Its proof status is genuinely contested: Mochizuki's IUT is published but the Scholze–Stix objection remains unresolved, so the community does not treat abc as proven. Included here as an open problem whose refutation would be a counter-object (an infinite exceptional family), not a single triple."
  },
  {
    "id": "agoh-giuga-conjecture",
    "name": "Agoh–Giuga conjecture",
    "field": "Number theory",
    "subfield": "Primality characterization",
    "posedYear": 1950,
    "posedBy": "Giuseppe Giuga (1950); equivalent form by Takashi Agoh (1990)",
    "statement": "A number n is prime if and only if the sum 1^(n−1)+2^(n−1)+…+(n−1)^(n−1) is congruent to −1 modulo n (equivalently n·B_{n−1} ≡ −1 mod n).",
    "form": "∀ composite n: Σ_{i=1}^{n−1} i^{n−1} ≢ −1 (mod n)",
    "counterexample": "A single composite n satisfying the congruence (a 'Giuga number' that is also a Carmichael number).",
    "disproof": "counterexample",
    "status": "open",
    "evidence": "The 'only if' direction (primes satisfy it) is elementary; the open part is that no composite does. Any composite counterexample must be simultaneously a Carmichael number and a Giuga number, and would have at least 13,800 digits — none is known.",
    "prize": "",
    "tags": [
      "primes",
      "primality",
      "bernoulli"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Agoh%E2%80%93Giuga_conjecture"
      },
      {
        "label": "MathWorld",
        "url": "https://mathworld.wolfram.com/GiugasConjecture.html"
      }
    ],
    "note": "If true, it would give a clean 'if and only if' primality criterion in terms of a single power-sum congruence — remarkable, since most simple congruence tests admit composite pseudoprimes. The difficulty is ruling out an exotic composite that mimics a prime here; such a number would have to combine two rare properties (Carmichael and Giuga) at once. The 13,800-digit lower bound shows how tightly the two constraints squeeze any would-be counterexample."
  },
  {
    "id": "amicable-numbers-opposite-parity",
    "name": "Amicable Numbers of Opposite Parity",
    "field": "Number theory",
    "subfield": "Divisors / perfect-number lore",
    "posedYear": 1968,
    "posedBy": "Folklore; studied by Lee, te Riele, and others",
    "statement": "No amicable pair consists of one even and one odd number (equivalently, the two members of every amicable pair share the same parity).",
    "form": "∀ amicable pairs (m,n) with σ(m)−m=n, σ(n)−n=m :  m ≡ n (mod 2)",
    "counterexample": "An amicable pair (m, n) with m even and n odd.",
    "disproof": "counterexample",
    "status": "open",
    "evidence": "Over 1.2 billion amicable pairs are known and every one is same-parity (both even or both odd); no opposite-parity pair has ever been found, and related open questions include whether infinitely many amicable pairs exist and whether any amicable pair is coprime.",
    "prize": "",
    "tags": [
      "amicable-numbers",
      "divisors",
      "parity"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Amicable_numbers"
      },
      {
        "label": "OEIS A259180",
        "url": "https://oeis.org/A259180"
      }
    ],
    "note": "Amicable numbers — like 220 and 284, each equal to the sum of the other's proper divisors — have fascinated mathematicians since Pythagoras. Among the more than a billion pairs now catalogued, the two members always match in parity, and finding an even-odd pair would overturn a long-standing empirical law. It sits among a cluster of stubborn open questions about amicable numbers, including whether coprime pairs or infinitely many pairs exist."
  },
  {
    "id": "andrica-conjecture",
    "name": "Andrica's conjecture",
    "field": "Number theory",
    "subfield": "Prime gaps",
    "posedYear": 1985,
    "posedBy": "Dorin Andrica",
    "statement": "The difference between the square roots of consecutive primes is always less than 1.",
    "form": "∀ n≥1, √(p_{n+1}) − √(p_n) < 1",
    "counterexample": "A single index n where √(p_{n+1}) − √(p_n) ≥ 1.",
    "disproof": "counterexample",
    "status": "open",
    "evidence": "Verified using tables of maximal prime gaps well beyond 4×10^18; the strong quantitative version is checked for all primes below 2^64 ≈ 1.8×10^19. The maximum value of the Andrica function occurs at the gap between 7 and 11 (≈0.6708) and no later gap has come close.",
    "prize": "",
    "tags": [
      "primes",
      "gaps"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Andrica%27s_conjecture"
      },
      {
        "label": "MathWorld",
        "url": "https://mathworld.wolfram.com/AndricasConjecture.html"
      }
    ],
    "note": "Equivalent to saying the prime gap after p_n is smaller than 2√(p_n)+1, a bound comfortably beyond what current gap estimates can prove (the best is on the order of p^0.525). The Andrica function's peak sits early, at the very first primes, and decays thereafter, which is why it looks obviously true yet stays unproven. A clean, concrete conjecture a newcomer can test with a pocket calculator."
  },
  {
    "id": "beal-conjecture",
    "name": "Beal's conjecture",
    "field": "Number theory",
    "subfield": "Diophantine equations",
    "posedYear": 1993,
    "posedBy": "Andrew Beal",
    "statement": "If A^x + B^y = C^z with positive integers and exponents x, y, z all greater than 2, then A, B, and C share a common prime factor.",
    "form": "∀ positive integers A,B,C,x,y,z with x,y,z>2 and A^x+B^y=C^z ⟹ gcd(A,B,C) > 1",
    "counterexample": "A single explicit solution A^x+B^y=C^z with x,y,z>2 in which A, B, C are pairwise coprime.",
    "disproof": "counterexample",
    "status": "open",
    "evidence": "No counterexample found in extensive computer searches over large ranges of bases and exponents. Many individual exponent triples are settled (e.g. results flowing from Fermat's Last Theorem and from work on generalized Fermat equations). Beal's conjecture would follow from the abc conjecture for all but finitely many cases.",
    "prize": "Beal Prize (AMS), $1,000,000",
    "tags": [
      "diophantine",
      "fermat",
      "coprimality"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Beal_conjecture"
      },
      {
        "label": "AMS Beal Prize",
        "url": "https://www.ams.org/profession/prizes-awards/ams-supported/beal-prize"
      }
    ],
    "note": "A generalization of Fermat's Last Theorem: it says the only way three perfect powers with exponents above 2 can add up is if the bases already share a prime factor (as in 2³+2³=2⁴, which shares the factor 2). The American Mathematical Society holds a $1,000,000 prize for a proof or a single coprime counterexample. It sits in the same territory as Fermat–Catalan and the abc conjecture, and would follow from abc for all but finitely many exponent triples."
  },
  {
    "id": "brocard-problem",
    "name": "Brocard's problem",
    "field": "Number theory",
    "subfield": "Diophantine equations",
    "posedYear": 1876,
    "posedBy": "Henri Brocard (independently Srinivasa Ramanujan, 1913)",
    "statement": "The only integers n for which n!+1 is a perfect square are n = 4, 5, and 7.",
    "form": "∀ n>7, n! + 1 ≠ m² (no integer m)",
    "counterexample": "A single n>7 with n!+1 equal to a perfect square (a fourth 'Brown number' pair).",
    "disproof": "counterexample",
    "status": "open",
    "evidence": "The only known solutions give the Brown-number pairs (4,5), (5,11), (7,71). Computational searches (Berndt & Galway and later work) have found no further solutions well past 10^9, with extended searches reported to much larger bounds. Overholt (1993) showed only finitely many solutions exist if the abc conjecture holds.",
    "prize": "",
    "tags": [
      "factorial",
      "squares",
      "diophantine"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Brocard%27s_problem"
      },
      {
        "label": "MathWorld",
        "url": "https://mathworld.wolfram.com/BrocardsProblem.html"
      }
    ],
    "note": "It asks whether the factorial is ever exactly one below a square — and after n=7 it apparently never is again, but nobody can prove the list of three is complete. Unconditional finiteness is unknown; the cleanest known handle is via the abc conjecture, tying this humble-looking puzzle to one of the deepest tools in the subject. A single new solution, however astronomically large, would settle it."
  },
  {
    "id": "bunyakovsky-conjecture",
    "name": "Bunyakovsky conjecture",
    "field": "Number theory",
    "subfield": "Prime values of polynomials",
    "posedYear": 1857,
    "posedBy": "Viktor Bunyakovsky",
    "statement": "An irreducible integer polynomial of degree ≥ 2 with positive leading coefficient whose values have no common divisor > 1 produces infinitely many prime values.",
    "form": "f irreducible, deg f ≥ 2, positive leading coeff, gcd{f(m): m≥1}=1 ⟹ |{m : f(m) prime}| = ∞",
    "counterexample": "Not a single number: refuting it means exhibiting one qualifying polynomial that yields only finitely many primes.",
    "disproof": "other",
    "status": "open",
    "evidence": "Not proven for a single polynomial of degree ≥ 2 — not even for n²+1 (Landau's problem). The linear case is Dirichlet's theorem on primes in arithmetic progressions. On average it holds for 100% of polynomials (Skorobogatov & Sofos, generalizing to Schinzel's Hypothesis H).",
    "prize": "",
    "tags": [
      "primes",
      "polynomials"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Bunyakovsky_conjecture"
      },
      {
        "label": "Encyclopedia of Math",
        "url": "https://encyclopediaofmath.org/wiki/Bunyakovskii_conjecture"
      }
    ],
    "note": "A single-polynomial version of the deep question of when a formula generates infinitely many primes; its multi-polynomial generalization is Schinzel's Hypothesis H, and the quantitative refinement is Bateman–Horn. The stunning fact is that it is unknown even for n²+1 — whether infinitely many primes are one more than a perfect square is a famous open case (one of Landau's problems). It is an existence claim, so a hypothetical disproof is itself a hard finiteness theorem, not a stray counterexample."
  },
  {
    "id": "carmichael-totient-conjecture",
    "name": "Carmichael's totient function conjecture",
    "field": "Number theory",
    "subfield": "Multiplicative functions",
    "posedYear": 1907,
    "posedBy": "Robert Daniel Carmichael",
    "statement": "For every n, the equation φ(x)=φ(n) has at least one other solution — no value of Euler's totient is attained exactly once.",
    "form": "∀ n, ∃ m ≠ n: φ(m) = φ(n)",
    "counterexample": "A single n whose totient value φ(n) is achieved by no other integer (multiplicity 1).",
    "disproof": "counterexample",
    "status": "open",
    "evidence": "No totient of multiplicity 1 is known; any counterexample must exceed 10^(10^10) (Ford; earlier Schlafly & Wagon verified past 10^(10^7)). Ford (1999) proved every multiplicity k ≥ 2 does occur, and showed a counterexample would force a positive proportion of all totients to also be counterexamples.",
    "prize": "",
    "tags": [
      "totient",
      "multiplicative"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Carmichael%27s_totient_function_conjecture"
      },
      {
        "label": "MathWorld",
        "url": "https://mathworld.wolfram.com/CarmichaelsTotientFunctionConjecture.html"
      }
    ],
    "note": "Totient values are never solitary — that's the claim, and it's been checked past numbers with ten billion digits. Ford's structural theorem is the intriguing twist: a lone counterexample couldn't be an isolated fluke, it would drag a whole positive density of other counterexamples along with it, which is part of why one is so hard to find or rule out. A good gateway into the surprisingly rich behavior of the totient's fibers."
  },
  {
    "id": "catalan-dickson",
    "name": "Catalan–Dickson Conjecture (Aliquot Sequences)",
    "field": "Number theory",
    "subfield": "Integer sequences",
    "posedYear": 1888,
    "posedBy": "Eugène Catalan; Leonard E. Dickson",
    "statement": "Every aliquot sequence — repeatedly replace n by the sum of its proper divisors — is bounded, so it eventually terminates at 0 or falls into a cycle.",
    "form": "∀ n∈ℕ⁺  the orbit {s^k(n)} is bounded,  s(n)=σ(n)−n",
    "counterexample": "A starting number whose aliquot sequence increases without bound (never terminating or becoming periodic).",
    "disproof": "counterexample-hard",
    "status": "open",
    "evidence": "The five smallest undecided starts — 276, 552, 564, 660, 966 (the 'Lehmer five') — have been iterated for thousands of terms into 200+ digit sizes without resolving; 276 shows no sign of terminating or cycling. Guy and Selfridge conjectured the opposite: that many sequences diverge.",
    "prize": "",
    "tags": [
      "integer-sequences",
      "divisors",
      "iteration"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Aliquot_sequence"
      },
      {
        "label": "OEIS A098007",
        "url": "https://oeis.org/A098007"
      }
    ],
    "note": "Iterating the sum-of-proper-divisors map, where do you end up? Perfect numbers fix, amicable pairs and sociable cycles loop, and most starts crash to 0 — but 276 has resisted for over a century of computation. Catalan and Dickson bet everything stays bounded; Guy and Selfridge bet some sequences run away to infinity."
  },
  {
    "id": "collatz",
    "name": "Collatz Conjecture (3n+1 Problem)",
    "field": "Number theory",
    "subfield": "Iteration / arithmetic dynamics",
    "posedYear": 1937,
    "posedBy": "Lothar Collatz",
    "statement": "Starting from any positive integer and repeatedly applying n↦n/2 (if even) or n↦3n+1 (if odd), you always eventually reach 1.",
    "form": "∀ n∈ℕ⁺ ∃ k T^k(n) = 1,  where T(n)=n/2 if 2|n else 3n+1",
    "counterexample": "A single starting integer whose trajectory either diverges to infinity or falls into a cycle other than 4→2→1.",
    "disproof": "counterexample-hard",
    "status": "open",
    "evidence": "Verified for all n up to ≈2^68 ≈ 2.95×10^20 by David Bařina (2020), with distributed computations pushing the frontier further; Tao (2019) showed almost all orbits attain almost bounded values. No divergent orbit or nontrivial cycle is known.",
    "prize": "",
    "tags": [
      "iteration",
      "dynamics",
      "famous"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Collatz_conjecture"
      },
      {
        "label": "OEIS A006577",
        "url": "https://oeis.org/A006577"
      }
    ],
    "note": "The most famous unsolved problem about a trivially simple rule: halve evens, triple-plus-one odds. Every number tested so far tumbles down to 1, but no proof forces this in general, and Paul Erdős reportedly said 'mathematics may not be ready for such problems.' A counterexample would be a single seed that escapes to infinity or loops forever elsewhere."
  },
  {
    "id": "cramer-conjecture",
    "name": "Cramér's conjecture",
    "field": "Number theory",
    "subfield": "Prime gaps",
    "posedYear": 1936,
    "posedBy": "Harald Cramér",
    "statement": "The gap after the n-th prime is at most about (log p_n)² — precisely, the limsup of (gap)/(log p_n)² equals 1.",
    "form": "limsup_{n→∞} (p_{n+1} − p_n)/(ln p_n)² = 1",
    "counterexample": "Asymptotic statement: refuted by exhibiting an infinite family of gaps growing faster than (log p)², i.e. showing the limsup exceeds 1 (or is infinite).",
    "disproof": "other",
    "status": "mostly-open",
    "evidence": "No known prime gap exceeds (log p)²; the largest known gaps stay below it. However, Granville, refining Cramér's probabilistic model via Maier's theorem, argues the constant should be at least ~1.1229 rather than 1, so the exact form is widely believed false while the order of magnitude (gaps = O((log p)²)) remains open.",
    "prize": "",
    "tags": [
      "primes",
      "gaps",
      "probabilistic"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Cram%C3%A9r%27s_conjecture"
      },
      {
        "label": "MathWorld",
        "url": "https://mathworld.wolfram.com/Cramer-GranvilleConjecture.html"
      }
    ],
    "note": "Cramér modeled the primes as if each integer n were 'prime' independently with probability 1/log n, and read off the maximal gap size from that random model. The subtlety is that the primes are not truly random on short scales — Maier's theorem shows the model fails — so most experts now expect the precise constant to be wrong even though gaps of order (log p)² are the right ballpark. A good entry point into how heuristics guide, and mislead, number theory."
  },
  {
    "id": "dicksons-conjecture",
    "name": "Dickson's Conjecture",
    "field": "Number theory",
    "subfield": "Prime distribution",
    "posedYear": 1904,
    "posedBy": "Leonard Eugene Dickson",
    "statement": "For any finite set of linear forms a_i + b_i·n with no fixed prime divisor forcing a common factor, there are infinitely many n making all the forms simultaneously prime.",
    "form": "For admissible {a_i + b_i n}_{i=1}^{k},  |{ n : ∀i, a_i+b_i n is prime }| = ∞",
    "counterexample": "An admissible tuple of linear forms that yields only finitely many simultaneous-prime values of n.",
    "disproof": "existence",
    "status": "open",
    "evidence": "Generalizes the twin-prime and Sophie Germain conjectures (k=2 cases) and is subsumed by the quantitative Hardy–Littlewood k-tuple conjecture; the Green–Tao theorem and Maynard–Tao bounded-gaps work give related unconditional results, but Dickson's statement itself is unproven for any k≥2.",
    "prize": "",
    "tags": [
      "primes",
      "linear-forms",
      "existence"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Dickson%27s_conjecture"
      }
    ],
    "note": "A sweeping generalization: as long as there's no obvious local reason a set of linear forms can't all be prime at once, they should be prime infinitely often. It contains the twin-prime conjecture (forms n and n+2) and Sophie Germain primes as special cases, which is exactly why it is so far beyond current techniques. The only obstruction allowed is a small-prime one that's easy to check."
  },
  {
    "id": "erdos-moser",
    "name": "Erdős–Moser Conjecture",
    "field": "Number theory",
    "subfield": "Diophantine equations / power sums",
    "posedYear": 1950,
    "posedBy": "Paul Erdős (to Leo Moser)",
    "statement": "The only solution in positive integers of 1^m + 2^m + ⋯ + k^m = (k+1)^m is the trivial 1 + 2 = 3.",
    "form": "∀ m,k≥1 :  Σ_{i=1}^{k} i^m = (k+1)^m  ⇒  (m,k)=(1,2)",
    "counterexample": "A second solution (m,k) with m≥2 to the power-sum equation.",
    "disproof": "counterexample",
    "status": "open",
    "evidence": "Moser proved no solution with even m and, using continued-fraction/Bernoulli-number bounds, showed any further solution must have k > 10^{10^9} and m odd (Schinzel: m odd). Not even finiteness of the solution set is established.",
    "prize": "",
    "tags": [
      "diophantine",
      "power-sums",
      "erdos"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Erd%C5%91s%E2%80%93Moser_equation"
      },
      {
        "label": "MathWorld",
        "url": "https://mathworld.wolfram.com/Erdos-MoserEquation.html"
      }
    ],
    "note": "Sums of consecutive m-th powers almost never land exactly on the next m-th power — the lone exception being 1+2=3. Moser's 1953 analysis forced any second solution to be so gigantic (over 10^(10^9)) that a computer search is hopeless, yet no proof rules it out. The equation ties surprisingly deep into Bernoulli numbers and irregular primes."
  },
  {
    "id": "erdos-straus-conjecture",
    "name": "Erdős–Straus conjecture",
    "field": "Number theory",
    "subfield": "Egyptian fractions",
    "posedYear": 1948,
    "posedBy": "Paul Erdős and Ernst G. Straus",
    "statement": "For every integer n ≥ 2, the fraction 4/n can be written as a sum of three positive unit fractions.",
    "form": "∀ n≥2, ∃ x,y,z ∈ ℤ⁺: 4/n = 1/x + 1/y + 1/z",
    "counterexample": "A single n ≥ 2 for which 4/n admits no representation as a sum of three unit fractions.",
    "disproof": "counterexample",
    "status": "open",
    "evidence": "Verified for all n up to at least 10^17 (Salez) and extended toward 10^18 (2025). Many congruence classes of n are settled by explicit identities; only n that are prime (and ≡ 1, 11, 13, 17, 19, or 23 mod 24 after sieving) resist, so the problem reduces to certain primes.",
    "prize": "",
    "tags": [
      "egyptian-fractions",
      "diophantine"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Erd%C5%91s%E2%80%93Straus_conjecture"
      },
      {
        "label": "OEIS Wiki",
        "url": "https://oeis.org/wiki/Erd%C5%91s%E2%80%93Straus_conjecture"
      }
    ],
    "note": "Egyptian fractions — sums of distinct-denominator unit fractions — are ancient, and this asks the specific question of whether 4/n always needs only three of them. Whole arithmetic-progression classes of n fall to one-line algebraic identities, which is why the unsolved cases funnel down to sparse families of primes. Accessible enough to experiment with by hand, yet the residual prime cases have defeated every general argument."
  },
  {
    "id": "erdos-turan-additive-basis",
    "name": "Erdős–Turán Conjecture on Additive Bases",
    "field": "Number theory",
    "subfield": "Additive combinatorics",
    "posedYear": 1941,
    "posedBy": "Paul Erdős and Pál Turán",
    "statement": "If a set B of natural numbers is an additive basis of order 2 (every natural number is a sum of two elements of B), then the number of representations r_B(n) is unbounded as n grows.",
    "form": "B additive basis of order 2  ⇒  limsup_{n→∞} r_B(n) = ∞",
    "counterexample": "A set B such that every n is a sum of two elements of B, yet r_B(n) stays bounded by some constant.",
    "disproof": "counterexample",
    "status": "open",
    "evidence": "No basis of order 2 with bounded representation function is known; Erdős (1956) proved bases exist with r_B(n) = Θ(log n), showing the representation count can grow arbitrarily slowly, but whether it can stay bounded is completely open.",
    "prize": "",
    "tags": [
      "additive-basis",
      "representation-function",
      "erdos"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Erd%C5%91s%E2%80%93Tur%C3%A1n_conjecture_on_additive_bases"
      }
    ],
    "note": "If a set is efficient enough that every number is a sum of two of its members, must some numbers have many such representations? Erdős and Turán conjectured you can never keep the representation count uniformly bounded — the basis is forced to be 'redundant' somewhere. Erdős offered $500 for a solution; despite showing the count can grow as slowly as log n, no one can rule out boundedness."
  },
  {
    "id": "erdos-woods",
    "name": "Erdős–Woods Conjecture",
    "field": "Number theory",
    "subfield": "Prime factorization / arithmetic sequences",
    "posedYear": 1981,
    "posedBy": "Paul Erdős; Alan R. Woods",
    "statement": "There is a fixed k such that every positive integer n is uniquely determined by the sets of prime divisors of n, n+1, …, n+k.",
    "form": "∃ k ∀ n,m :  (∀ i≤k, rad(n+i)=rad(m+i)) ⇒ n=m",
    "counterexample": "For each candidate k, a pair n≠m where n+i and m+i share the same prime divisors for every 0≤i≤k — showing no uniform k works.",
    "disproof": "other",
    "status": "open",
    "evidence": "The set of 'Erdős–Woods numbers' k for which the run n…n+k can fail to determine n has been studied (smallest is 16), but whether a single k eventually forces uniqueness for all n is unresolved; the conjecture also connects to definability questions in logic (Woods' thesis).",
    "prize": "",
    "tags": [
      "prime-factorization",
      "arithmetic-sequences",
      "logic"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Erd%C5%91s%E2%80%93Woods_number"
      }
    ],
    "note": "How much does knowing just the prime supports of a run of consecutive integers pin down where you are on the number line? The conjecture says a fixed-length window is enough to identify n uniquely everywhere. It arose partly from mathematical logic, where it bears on whether addition is definable from a divisibility-like predicate."
  },
  {
    "id": "fermat-catalan-conjecture",
    "name": "Fermat–Catalan conjecture",
    "field": "Number theory",
    "subfield": "Diophantine equations",
    "posedYear": 1994,
    "posedBy": "Henri Darmon and Andrew Granville (building on Fermat/Catalan; also Tijdeman–Zagier)",
    "statement": "The equation a^m + b^n = c^k with pairwise-coprime positive integers a,b,c and exponents satisfying 1/m+1/n+1/k < 1 has only finitely many solutions.",
    "form": "|{(a,b,c,m,n,k): gcd's =1, a^m+b^n=c^k, 1/m+1/n+1/k<1}| < ∞ (distinct powers)",
    "counterexample": "Not a single solution: refuting it means producing infinitely many such coprime solutions with 1/m+1/n+1/k < 1.",
    "disproof": "other",
    "status": "open",
    "evidence": "Exactly ten solutions are known (as of 2024), including 1+2³=3², 2⁵+7²=3⁴, and 33⁸+1549034²=15613³; all but the trivial 1+2³=3² involve an exponent 2. Darmon & Granville proved finiteness for each fixed exponent triple. Full finiteness would follow from the abc conjecture.",
    "prize": "",
    "tags": [
      "diophantine",
      "fermat",
      "catalan"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Fermat%E2%80%93Catalan_conjecture"
      },
      {
        "label": "MathWorld",
        "url": "https://mathworld.wolfram.com/Fermat-CatalanConjecture.html"
      }
    ],
    "note": "A common generalization of Fermat's Last Theorem and Catalan's conjecture, weighting the exponents so the 'small' cases are excluded and asking whether only finitely many sporadic hits remain. Just ten are known and each new one is a minor sensation, but proving the list eventually stops is out of reach without abc. Because it asserts finiteness, its refutation would be an infinite family, not a lone solution — the opposite flavor from finding one more example."
  },
  {
    "id": "firoozbakht-conjecture",
    "name": "Firoozbakht's conjecture",
    "field": "Number theory",
    "subfield": "Prime gaps",
    "posedYear": 1982,
    "posedBy": "Farideh Firoozbakht",
    "statement": "The n-th root of the n-th prime forms a strictly decreasing sequence.",
    "form": "∀ n≥1, (p_{n+1})^{1/(n+1)} < (p_n)^{1/n}",
    "counterexample": "A single n where (p_{n+1})^{1/(n+1)} ≥ (p_n)^{1/n}.",
    "disproof": "counterexample",
    "status": "open",
    "evidence": "Verified for all primes below 4×10^18 using the table of first-occurrence prime gaps combined with bounds on the prime-counting function (Kourbatov, 2015). It is one of the strongest prime-gap conjectures — it implies Legendre's, Andrica's, and Oppermann's.",
    "prize": "",
    "tags": [
      "primes",
      "gaps"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Firoozbakht%27s_conjecture"
      },
      {
        "label": "OEIS A182514",
        "url": "https://oeis.org/A182514"
      }
    ],
    "note": "Equivalent to a very tight upper bound on prime gaps, roughly p_{n+1} − p_n < (log p_n)² − log p_n, which is even sharper than Cramér's prediction and would be violated by the gaps Granville's model expects. That tension is exactly what makes it interesting: some heuristics suggest Firoozbakht's conjecture should eventually fail, yet no counterexample has surfaced across quintillions of primes. A vivid example of computation and heuristics pointing in opposite directions."
  },
  {
    "id": "gauss-circle-problem",
    "name": "Gauss Circle Problem (Error-Term Exponent)",
    "field": "Number theory",
    "subfield": "Lattice-point counting",
    "posedYear": 1837,
    "posedBy": "Carl Friedrich Gauss (problem); Hardy conjecture on exponent",
    "statement": "The number of integer lattice points inside a circle of radius r equals πr² with error O(r^{1/2+ε}) for every ε>0.",
    "form": "N(r) = πr² + E(r)  with  E(r) = O(r^{1/2+ε})  ∀ε>0",
    "counterexample": "A demonstration that the error grows faster than r^{1/2+ε} for some fixed ε — i.e. an exponent above 1/2.",
    "disproof": "other",
    "status": "open",
    "evidence": "Hardy and Landau proved the exponent cannot be below 1/2 (the true value is at least 1/2); the best known upper bound is 517/824 ≈ 0.6274 (Bourgain–Watt, 2017), well above the conjectured 1/2. The gap between 0.5 and 0.627 remains.",
    "prize": "",
    "tags": [
      "lattice-points",
      "asymptotics",
      "error-term"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Gauss_circle_problem"
      }
    ],
    "note": "Counting lattice points inside a growing circle gives roughly its area, πr²; the deep question is how large the leftover error can be. Hardy conjectured the exponent is exactly 1/2 (up to ε), and it's known it can't be smaller, but a century of refinements has only lowered the upper bound to about 0.627. This is an asymptotic conjecture, so 'disproof' means establishing a larger true exponent rather than exhibiting one number."
  },
  {
    "id": "gilbreath-conjecture",
    "name": "Gilbreath's conjecture",
    "field": "Number theory",
    "subfield": "Prime patterns",
    "posedYear": 1958,
    "posedBy": "Norman Gilbreath (anticipated by François Proth, 1878)",
    "statement": "Taking repeated absolute differences of the sequence of primes, every resulting row begins with 1.",
    "form": "For the triangle d_0 = primes, d_{k+1}(i) = |d_k(i+1) − d_k(i)|: ∀ k≥1, d_k(1) = 1",
    "counterexample": "A single row of the iterated-absolute-difference triangle whose leading entry is not 1.",
    "disproof": "counterexample",
    "status": "open",
    "evidence": "Verified for the primes up to 10^13 (about 3.46×10^11 rows) by Odlyzko (1993), and extended further. Hallard Croft observed the phenomenon is likely not special to primes but holds for many sequences with similar density and gap structure.",
    "prize": "",
    "tags": [
      "primes",
      "differences",
      "patterns"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Gilbreath%27s_conjecture"
      },
      {
        "label": "MathWorld",
        "url": "https://mathworld.wolfram.com/GilbreathsConjecture.html"
      }
    ],
    "note": "A strikingly visual conjecture: write the primes in a row, take absolute differences repeatedly, and the left edge of the triangle is all 1s forever. Croft's insight is that this may be a statement about any sufficiently prime-like sequence rather than the primes specifically, which paradoxically makes it feel both more robust and harder to pin down. Anyone can generate the triangle by hand and watch the pattern hold."
  },
  {
    "id": "giuga",
    "name": "Giuga's Conjecture",
    "field": "Number theory",
    "subfield": "Primality congruences",
    "posedYear": 1950,
    "posedBy": "Giuseppe Giuga",
    "statement": "An integer n>1 is prime if and only if the power sum 1^{n-1}+2^{n-1}+⋯+(n-1)^{n-1} is congruent to −1 modulo n.",
    "form": "∀ composite n>1 :  Σ_{k=1}^{n-1} k^{n-1} ≢ −1 (mod n)",
    "counterexample": "A composite number n satisfying Σ k^{n-1} ≡ −1 (mod n) — a 'Giuga number' passing the prime-like congruence.",
    "disproof": "counterexample",
    "status": "open",
    "evidence": "Borwein, Borwein, Borwein & Girgensohn (1996) proved any counterexample must be a squarefree composite with more than 13,800 digits and at least eight prime factors; no counterexample has ever been found.",
    "prize": "",
    "tags": [
      "primality",
      "congruences",
      "power-sums"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Giuga%27s_conjecture"
      }
    ],
    "note": "The 'if' direction (primes satisfy the congruence) is an easy consequence of Fermat's little theorem; the hard 'only if' claim is that no composite sneaks through — which would make the congruence a clean primality test. Any counterexample must be an astronomically large squarefree number of very special form, so its non-appearance is strong but not conclusive evidence."
  },
  {
    "id": "goldbach-strong",
    "name": "Goldbach's conjecture (strong)",
    "field": "Number theory",
    "subfield": "Additive number theory",
    "posedYear": 1742,
    "posedBy": "Christian Goldbach (in correspondence with Leonhard Euler)",
    "statement": "Every even integer greater than 2 is the sum of two prime numbers.",
    "form": "∀ even n>2, ∃ primes p,q: n = p + q",
    "counterexample": "A single even integer n>2 that cannot be written as a sum of two primes.",
    "disproof": "counterexample",
    "status": "open",
    "evidence": "Verified for all even n up to 4×10^18 by Oliveira e Silva, Herzog and Pardi (2013). The weak/ternary Goldbach conjecture (every odd n>5 is a sum of three primes) was proved by Helfgott (2013) and is no longer open.",
    "prize": "",
    "tags": [
      "primes",
      "additive"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Goldbach%27s_conjecture"
      },
      {
        "label": "MathWorld",
        "url": "https://mathworld.wolfram.com/GoldbachConjecture.html"
      }
    ],
    "note": "One of the oldest and most famous open problems in mathematics: elementary to state, brutally resistant to proof. Sieve methods get close — Chen Jingrun proved every large even number is a prime plus a number with at most two prime factors — but the parity barrier blocks the final step. A curious reader should start by noticing how the number of representations grows with n, which is why nobody expects a counterexample."
  },
  {
    "id": "grimm-conjecture",
    "name": "Grimm's conjecture",
    "field": "Number theory",
    "subfield": "Prime factors of consecutive integers",
    "posedYear": 1969,
    "posedBy": "Carl Albert Grimm",
    "statement": "For any run of consecutive composite numbers, one can assign to each a distinct prime that divides it.",
    "form": "If n+1,…,n+k are all composite, ∃ distinct primes p_1,…,p_k with p_i | (n+i)",
    "counterexample": "A single run of consecutive composites for which no such system of distinct prime divisors exists.",
    "disproof": "counterexample",
    "status": "open",
    "evidence": "Verified for all runs with n ≤ 1.9×10^10. Even the weaker form — that the product of a prime-free run [n+1, n+k] has at least k distinct prime factors — is open. Grimm's conjecture would imply a prime exists between consecutive squares, something beyond even the Riemann hypothesis.",
    "prize": "",
    "tags": [
      "primes",
      "divisors",
      "consecutive-integers"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Grimm%27s_conjecture"
      },
      {
        "label": "ProofWiki",
        "url": "https://proofwiki.org/wiki/Grimm%27s_Conjecture"
      }
    ],
    "note": "A deceptively modest bookkeeping question — match each composite in a gap to its own distinct prime factor — that turns out to be extraordinarily strong: it implies prime-gap results (like a prime between consecutive squares) that are out of reach of every current method, RH included. That downstream power is precisely why proving it is so hard. The weaker distinct-prime-factors version is a natural first target for a reader."
  },
  {
    "id": "hall-conjecture",
    "name": "Hall's conjecture",
    "field": "Number theory",
    "subfield": "Diophantine approximation",
    "posedYear": 1971,
    "posedBy": "Marshall Hall Jr.",
    "statement": "For any ε>0 there is a constant so that whenever x³ ≠ y², the gap |x³ − y²| is at least about the square root of x (up to an x^ε factor).",
    "form": "∀ ε>0, ∃ C(ε)>0: x³ ≠ y² ⟹ |x³ − y²| > C(ε)·x^{1/2−ε}",
    "counterexample": "Not a single point: refuting the (weak) form means an infinite family of x,y driving |x³−y²|/x^{1/2−ε} to 0 for some fixed ε.",
    "disproof": "other",
    "status": "open",
    "evidence": "The modern weak form (with the ε) is open and follows from the abc conjecture. Hall's original stronger form, |x³−y²| > C·√x, is now believed false: Danilov exhibited infinitely many x,y with 0 < |x³−y²| < 0.97·√x. Record small values of |x³−y²|/√x are catalogued and searched extensively.",
    "prize": "",
    "tags": [
      "diophantine",
      "approximation",
      "abc"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Hall%27s_conjecture"
      },
      {
        "label": "OEIS A078933",
        "url": "https://oeis.org/A078933"
      }
    ],
    "note": "How close can a perfect cube get to a perfect square without coinciding? Hall's conjecture says: not very — the gap must grow roughly like √x. The original sharp form was overturned by explicit families pushing the ratio below 0.97, so the surviving conjecture is the softer ε-version, which sits downstream of the abc conjecture. A concrete, computable playground where records for tiny |x³−y²| are actively hunted."
  },
  {
    "id": "juggler-sequences",
    "name": "Juggler Sequence Convergence",
    "field": "Number theory",
    "subfield": "Iteration / arithmetic dynamics",
    "posedYear": 1982,
    "posedBy": "Clifford A. Pickover",
    "statement": "Every juggler sequence — floor(n^{1/2}) when n is even, floor(n^{3/2}) when n is odd — eventually reaches 1.",
    "form": "∀ n∈ℕ⁺ ∃ k a_k = 1,  a_{i+1} = ⌊a_i^{1/2}⌋ if 2|a_i else ⌊a_i^{3/2}⌋",
    "counterexample": "A starting value whose juggler sequence grows without bound or enters a cycle avoiding 1.",
    "disproof": "counterexample-hard",
    "status": "open",
    "evidence": "Verified computationally for all starting values into the tens of billions; sequences can spike to enormous intermediate heights (e.g. from 30817) before collapsing, but all tested seeds reach 1. No proof of universal convergence exists.",
    "prize": "",
    "tags": [
      "iteration",
      "dynamics",
      "integer-sequences"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Juggler_sequence"
      },
      {
        "label": "OEIS A094683",
        "url": "https://oeis.org/A094683"
      }
    ],
    "note": "A Collatz cousin using square-root and three-halves-power floors instead of doubling and tripling. The wild volatility — some sequences climb to hundreds of digits before crashing — makes divergence feel plausible, yet every computed case lands on 1. Whether some seed escapes is completely open."
  },
  {
    "id": "landau-primes-n-squared-plus-one",
    "name": "Landau's Fourth Problem (Primes of the Form n²+1)",
    "field": "Number theory",
    "subfield": "Prime distribution",
    "posedYear": 1912,
    "posedBy": "Edmund Landau",
    "statement": "There are infinitely many primes of the form n² + 1.",
    "form": "|{ n∈ℕ :  n²+1 is prime }| = ∞",
    "counterexample": "A proof that only finitely many n give prime n²+1 (i.e. a largest such prime).",
    "disproof": "existence",
    "status": "open",
    "evidence": "Iwaniec (1978) proved infinitely many n²+1 are prime or a product of at most two primes; Bunyakovsky's conjecture and the Bateman–Horn heuristic both predict infinitude with a precise density, and such primes are abundant computationally, but the statement is unproven.",
    "prize": "",
    "tags": [
      "primes",
      "polynomial-primes",
      "existence"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Landau%27s_problems"
      }
    ],
    "note": "One of the four problems Landau called 'unattackable at the present state of science' in 1912 — and still unattacked. We cannot even prove a single non-constant polynomial takes infinitely many prime values, and n²+1 is the cleanest test case. Iwaniec got tantalizingly close by allowing 'almost primes,' but the pure prime version stays open."
  },
  {
    "id": "lander-parkin-selfridge",
    "name": "Lander–Parkin–Selfridge Conjecture",
    "field": "Number theory",
    "subfield": "Diophantine equations / equal sums of powers",
    "posedYear": 1967,
    "posedBy": "Leon Lander, Thomas Parkin, John Selfridge",
    "statement": "In any equality of two sums of equal positive n-th powers, Σa_i^n = Σb_j^n with distinct terms, the total number of terms on the two sides is at least n.",
    "form": "Σ_{i=1}^{m} a_i^n = Σ_{j=1}^{k} b_j^n  ⇒  m + k ≥ n",
    "counterexample": "An equal sum of like n-th powers with fewer than n total terms — e.g. some new k-term = j-term identity violating m+k ≥ n.",
    "disproof": "counterexample",
    "status": "open",
    "evidence": "Consistent with all known equal-sums-of-powers identities, including Elkies' and Frye's counterexamples to Euler's related (now disproved) conjecture; extensive computer searches have found no violation, but the bound is proven for no general n.",
    "prize": "",
    "tags": [
      "diophantine",
      "equal-sums-of-powers",
      "computational"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Lander,_Parkin,_and_Selfridge_conjecture"
      }
    ],
    "note": "After Euler's conjecture on sums of powers collapsed (Elkies found 2682440^4+15365639^4+18796760^4 = 20615673^4), Lander, Parkin and Selfridge proposed a subtler replacement counting terms on both sides. It generalizes Fermat's Last Theorem (the m=k=1 case) and remains an active target for large computer searches, none of which has produced a violation."
  },
  {
    "id": "legendre-conjecture",
    "name": "Legendre's conjecture",
    "field": "Number theory",
    "subfield": "Prime gaps",
    "posedYear": 1808,
    "posedBy": "Adrien-Marie Legendre",
    "statement": "There is at least one prime between every pair of consecutive perfect squares.",
    "form": "∀ n≥1, ∃ prime p: n² < p < (n+1)²",
    "counterexample": "A single n≥1 with no prime strictly between n² and (n+1)².",
    "disproof": "counterexample",
    "status": "open",
    "evidence": "Verified computationally to very large n; a search confirming the stronger Oppermann's conjecture (which implies Legendre's) reached N = 3.33×10^13 (2024). Known prime-gap bounds (gaps < p^0.525, Baker–Harman–Pintz 2001) are far too weak to prove it.",
    "prize": "",
    "tags": [
      "primes",
      "gaps"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Legendre%27s_conjecture"
      },
      {
        "label": "MathWorld",
        "url": "https://mathworld.wolfram.com/LegendresConjecture.html"
      }
    ],
    "note": "One of Landau's four 'unattackable' problems on primes. It would follow from a prime always appearing in an interval of length about 2√n around n², but the best unconditional gap bounds only guarantee primes in much longer intervals. Even the Riemann hypothesis is not known to imply it. Sits just out of reach of every current technique."
  },
  {
    "id": "lehmer-totient-problem",
    "name": "Lehmer's totient problem",
    "field": "Number theory",
    "subfield": "Multiplicative functions",
    "posedYear": 1932,
    "posedBy": "D. H. Lehmer",
    "statement": "There is no composite number n whose Euler totient φ(n) divides n−1.",
    "form": "∀ composite n: φ(n) ∤ (n−1)",
    "counterexample": "A single composite n with φ(n) | (n−1) (primes always satisfy this, so the claim is that only primes do).",
    "disproof": "counterexample",
    "status": "open",
    "evidence": "Any composite solution must be odd, squarefree, and (Cohen & Hagis, 1980) satisfy n > 10^20 with at least 14 distinct prime factors; if divisible by 3 the constraints explode to more than 10^360,000,000 with over 40,000,000 prime factors (Burcsi, Czirbusz, Farkas).",
    "prize": "",
    "tags": [
      "totient",
      "multiplicative"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Lehmer%27s_totient_problem"
      },
      {
        "label": "MathWorld",
        "url": "https://mathworld.wolfram.com/LehmersTotientProblem.html"
      }
    ],
    "note": "Fermat's little theorem makes φ(n) | n−1 automatic when n is prime; Lehmer asked whether any composite can sneak in. Decades of work pile up ever more staggering requirements a counterexample must meet — thousands then millions of prime factors — yet cannot close the door entirely. It's a striking case where a conjecture is 'almost certainly true' and yet every explicit constraint still leaves room for a monster."
  },
  {
    "id": "lychrel-number",
    "name": "Lychrel Number Conjecture (the 196 Problem)",
    "field": "Number theory",
    "subfield": "Integer sequences",
    "posedYear": 1984,
    "posedBy": "Wade Van Landingham (name); problem folkloric",
    "statement": "There exist Lychrel numbers in base 10 — integers, conjecturally including 196, that never produce a palindrome under repeated reverse-and-add.",
    "form": "∀ k  R^k(196) is not a palindrome,  R(m)=m+reverse(m)",
    "counterexample": "A palindrome appearing somewhere in 196's (or another candidate's) reverse-and-add trajectory, proving it is not Lychrel.",
    "disproof": "counterexample",
    "status": "open",
    "evidence": "Romain Deb (2015) carried the 196 iteration past a billion steps, producing a number of hundreds of millions of digits with no palindrome; yet no base-10 number has ever been proven to be Lychrel, so existence itself remains unproved.",
    "prize": "",
    "tags": [
      "integer-sequences",
      "palindromes",
      "iteration"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Lychrel_number"
      },
      {
        "label": "MathWorld",
        "url": "https://mathworld.wolfram.com/LychrelNumber.html"
      }
    ],
    "note": "Take a number, add it to its digit-reversal, repeat: almost every number hits a palindrome fast, but 196 has resisted through over a billion iterations. The twist is that this problem is open in both directions — nobody can prove 196 never palindromes, and nobody has proven any base-10 Lychrel number exists at all. A single palindrome in the orbit would settle it instantly."
  },
  {
    "id": "mahler-z-numbers",
    "name": "Mahler's Z-Number Conjecture",
    "field": "Number theory",
    "subfield": "Iteration / distribution mod 1",
    "posedYear": 1968,
    "posedBy": "Kurt Mahler",
    "statement": "No Z-number exists: there is no positive real ξ whose fractional parts {ξ·(3/2)ⁿ} all lie in [0, 1/2) for every n ≥ 0.",
    "form": "¬∃ ξ>0 ∀ n≥0 :  0 ≤ { ξ·(3/2)ⁿ } < 1/2",
    "counterexample": "A single real number ξ whose entire orbit under multiplication by 3/2 stays in the lower half of the unit interval mod 1.",
    "disproof": "counterexample",
    "status": "open",
    "evidence": "Mahler proved the set of possible Z-numbers below any bound X has size O(X^{0.7}), and Flatto–Lagarias–Pollington (1995) related the problem to the distribution of {(3/2)ⁿ}; no Z-number is known and their non-existence is widely believed, but unproven.",
    "prize": "",
    "tags": [
      "distribution-mod-1",
      "powers-of-3-2",
      "iteration"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Z-number"
      }
    ],
    "note": "The powers of 3/2 mod 1 are notoriously mysterious — nobody even knows they're dense or equidistributed. Mahler asked whether any real number, scaled by these powers, could keep every fractional part trapped in the bottom half of [0,1); he conjectured none can. The problem sits alongside Collatz as an innocent-looking question about the interaction of the primes 2 and 3 that is far harder than it appears."
  },
  {
    "id": "three-consecutive-powerful-numbers",
    "name": "No Three Consecutive Powerful Numbers",
    "field": "Number theory",
    "subfield": "Multiplicative number theory",
    "posedYear": 1975,
    "posedBy": "Paul Erdős; Richard Mollin and Peter Walsh (1986)",
    "statement": "There do not exist three consecutive integers that are all powerful (every prime dividing them appears to at least the second power).",
    "form": "∀ n :  ¬( powerful(n) ∧ powerful(n+1) ∧ powerful(n+2) )",
    "counterexample": "Three consecutive powerful integers n, n+1, n+2.",
    "disproof": "counterexample",
    "status": "open",
    "evidence": "Pairs of consecutive powerful numbers exist (e.g. 8, 9), but no triple is known; if one exists its smallest term is ≡ 7, 27, or 35 (mod 36). Conditional on the abc conjecture, only finitely many triples could exist; Chan and others have proven various partial nonexistence results (2025).",
    "prize": "",
    "tags": [
      "powerful-numbers",
      "consecutive-integers",
      "abc"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Powerful_number"
      }
    ],
    "note": "A powerful number is 'square-full' — like 4, 8, 9, 25, 27. Consecutive powerful pairs such as (8,9) turn up, but stacking three in a row seems impossible. The abc conjecture would make triples at most finite, and a single explicit triple would demolish the conjecture, but none has ever been found."
  },
  {
    "id": "odd-perfect-number",
    "name": "Nonexistence of odd perfect numbers",
    "field": "Number theory",
    "subfield": "Perfect numbers / divisor sums",
    "posedYear": 1747,
    "posedBy": "Studied since antiquity; structure results by Euler (1747)",
    "statement": "No odd number equals the sum of its proper divisors — i.e. there are no odd perfect numbers.",
    "form": "∄ odd n: σ(n) = 2n  (equivalently, ∀ odd n, σ(n) ≠ 2n)",
    "counterexample": "A single odd perfect number.",
    "disproof": "counterexample",
    "status": "open",
    "evidence": "Any odd perfect number must exceed 10^1500 (Ochem & Rao, 2012), have at least 101 prime factors counted with multiplicity and at least 10 distinct prime factors, and (Euler) take the form p^(4a+1)·m² with p ≡ 1 mod 4. None has ever been found.",
    "prize": "",
    "tags": [
      "perfect-numbers",
      "divisors",
      "multiplicative"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Perfect_number#Odd_perfect_numbers"
      },
      {
        "label": "Ochem–Rao data",
        "url": "https://www.lirmm.fr/~ochem/opn/"
      }
    ],
    "note": "Every known perfect number is even and, by the Euclid–Euler theorem, tied to a Mersenne prime; whether an odd one can exist has been open for over two thousand years. Rather than a lower-bound race with no proof in sight, the field accumulates ever-tighter structural constraints — size, number and shape of prime factors — hemming any hypothetical odd perfect number into an increasingly implausible corner. Refuting the conjecture needs just one explicit example; proving it needs a genuinely new idea."
  },
  {
    "id": "oppermann-conjecture",
    "name": "Oppermann's conjecture",
    "field": "Number theory",
    "subfield": "Prime gaps",
    "posedYear": 1877,
    "posedBy": "Ludvig Oppermann",
    "statement": "For every integer n>1 there is a prime between n²−n and n², and another prime between n² and n²+n.",
    "form": "∀ n>1, ∃ primes in (n²−n, n²) and in (n², n²+n)",
    "counterexample": "A single n>1 for which one of the two intervals contains no prime.",
    "disproof": "counterexample",
    "status": "open",
    "evidence": "Verified computationally up to N = 3.33×10^13 (2024), improving the previous 2×10^9 bound. It is strictly stronger than Legendre's conjecture and would imply Andrica's and Brocard's conjectures.",
    "prize": "",
    "tags": [
      "primes",
      "gaps"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Oppermann%27s_conjecture"
      },
      {
        "label": "arXiv verification (2024)",
        "url": "https://arxiv.org/abs/2401.13753"
      }
    ],
    "note": "A refinement of Legendre that pins primes into two half-length intervals straddling each perfect square, forcing prime gaps to be at most about √n. Because it implies several other famous prime-interval conjectures at once, proving it would be a landmark; disproving it needs only one bad square. Like its cousins, it sits beyond every unconditional prime-gap bound currently known."
  },
  {
    "id": "pillai-conjecture",
    "name": "Pillai's conjecture",
    "field": "Number theory",
    "subfield": "Perfect powers",
    "posedYear": 1931,
    "posedBy": "Subbayya Sivasankaranarayana Pillai",
    "statement": "For any fixed positive integers A, B, C the equation A x^m − B y^n = C has only finitely many solutions; equivalently, the gaps between consecutive perfect powers tend to infinity.",
    "form": "∀ fixed A,B,C>0: |{(x,y,m,n), m,n≥2, (m,n)≠(2,2): A x^m − B y^n = C}| < ∞",
    "counterexample": "Not a single point: refuting it means one fixed (A,B,C) — e.g. one fixed gap C — realized by infinitely many pairs of perfect powers.",
    "disproof": "other",
    "status": "open",
    "evidence": "Open for every C ≠ 1. The case C = 1, A = B = 1 is Catalan's conjecture (only 8 and 9 are consecutive perfect powers), proved by Mihăilescu (2002). No result is known unless at least one of the variables is fixed; even 'is every gap between perfect powers taken finitely often?' is unresolved.",
    "prize": "",
    "tags": [
      "perfect-powers",
      "diophantine"
    ],
    "links": [
      {
        "label": "Wikipedia (Catalan's conjecture)",
        "url": "https://en.wikipedia.org/wiki/Catalan%27s_conjecture"
      },
      {
        "label": "Waldschmidt survey",
        "url": "https://webusers.imj-prg.fr/~michel.waldschmidt/articles/pdf/PerfectPowers.pdf"
      }
    ],
    "note": "The perfect powers (1, 4, 8, 9, 16, 25, 27, …) thin out, and Pillai conjectured their consecutive gaps march off to infinity — so each fixed difference occurs only finitely often. The single case of difference 1 is Catalan's conjecture, spectacularly resolved by Mihăilescu, but every other fixed difference remains open, and unconditionally almost nothing is known. It asserts finiteness, so a disproof would be an infinite family with a common difference, tying it closely to the abc circle of ideas."
  },
  {
    "id": "polignac-conjecture",
    "name": "Polignac's conjecture (incl. twin primes)",
    "field": "Number theory",
    "subfield": "Prime gaps",
    "posedYear": 1849,
    "posedBy": "Alphonse de Polignac",
    "statement": "For every even number 2k, there are infinitely many consecutive prime pairs differing by exactly 2k; the case 2k=2 is the twin prime conjecture.",
    "form": "∀ even 2k>0, |{ n : p_{n+1} − p_n = 2k }| = ∞",
    "counterexample": "Not a single number: refuting it means proving that for some even 2k only finitely many consecutive prime pairs differ by 2k.",
    "disproof": "other",
    "status": "mostly-open",
    "evidence": "Zhang (2013) proved some gap ≤ 70,000,000 occurs infinitely often; Maynard and the Polymath8 project reduced the bound to 246, so at least one even value 2k ≤ 246 is realized as a prime gap infinitely often — but no single specific value (including 2, the twin primes) is known to work.",
    "prize": "",
    "tags": [
      "primes",
      "gaps",
      "twin-primes"
    ],
    "links": [
      {
        "label": "Wikipedia (Polignac)",
        "url": "https://en.wikipedia.org/wiki/Polignac%27s_conjecture"
      },
      {
        "label": "Wikipedia (Twin primes)",
        "url": "https://en.wikipedia.org/wiki/Twin_prime"
      }
    ],
    "note": "This is an existence (infinitude) statement, so unlike a plain ∀-conjecture a single counterexample can't refute it — a disproof would have to show some gap size occurs only finitely often. The bounded-gaps breakthroughs of 2013–2014 proved the framework works for at least one gap value, a spectacular step, yet the specific twin-prime case (gap 2) remains untouched by these methods. The parity barrier is the fundamental obstruction."
  },
  {
    "id": "riemann-hypothesis",
    "name": "Riemann hypothesis",
    "field": "Number theory",
    "subfield": "Analytic number theory",
    "posedYear": 1859,
    "posedBy": "Bernhard Riemann",
    "statement": "Every nontrivial zero of the Riemann zeta function has real part exactly 1/2.",
    "form": "∀ ρ with ζ(ρ)=0 and 0<Re(ρ)<1 ⟹ Re(ρ) = 1/2",
    "counterexample": "A single nontrivial zero of ζ(s) with real part ≠ 1/2 (a zero off the critical line).",
    "disproof": "counterexample-hard",
    "status": "open",
    "evidence": "More than 10^13 nontrivial zeros have been computed and all lie exactly on the critical line (Gourdon and Demichel, 2004); the first ~10^13 zeros are verified. A positive proportion of zeros are proved to lie on the line (Conrey, >40%).",
    "prize": "Clay Millennium ($1M)",
    "tags": [
      "primes",
      "zeta",
      "analytic"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Riemann_hypothesis"
      },
      {
        "label": "Clay Institute",
        "url": "https://www.claymath.org/millennium/riemann-hypothesis/"
      }
    ],
    "note": "The deepest open problem about the primes: the location of zeta's zeros controls the error term in the prime-counting function, so RH is equivalent to the primes being as regularly distributed as possible. Its refutation would be a single zero off the line, but finding one is not a naive computation — the zeros marching up the line are checked to enormous height with no exception. A reader should begin with the explicit formula linking zeros to prime counts."
  },
  {
    "id": "singmaster",
    "name": "Singmaster's Conjecture",
    "field": "Number theory",
    "subfield": "Combinatorial number theory",
    "posedYear": 1971,
    "posedBy": "David Singmaster",
    "statement": "There is a finite absolute bound on how many times any integer greater than 1 can appear in Pascal's triangle.",
    "form": "∃ C ∀ n>1 :  #{ (r,c) : C(r,c)=n } ≤ C",
    "counterexample": "An integer appearing as a binomial coefficient more times than any proposed bound — ultimately, integers with unbounded multiplicity.",
    "disproof": "other",
    "status": "open",
    "evidence": "The number 3003 appears eight times, the current record; Singmaster conjectured the true bound may be as low as 8 or 10. Kane (2007) and later Matomäki–Radziwiłł–Shao–Sawhney–Tao (2022) proved strong bounds on how many binomials equal a given N, but boundedness itself is unproven.",
    "prize": "",
    "tags": [
      "binomial-coefficients",
      "combinatorics",
      "multiplicity"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Singmaster%27s_conjecture"
      }
    ],
    "note": "Numbers like 3003 = C(3003,1) = C(78,2) = C(15,5) = C(14,6) show up in Pascal's triangle a surprising eight times. Singmaster asked whether any number can appear arbitrarily often, conjecturing a universal ceiling. Heuristics suggest the true maximum is tiny — perhaps 8 — but even proving mere boundedness is out of reach."
  },
  {
    "id": "sum-of-three-cubes",
    "name": "Sum of Three Cubes Representability",
    "field": "Number theory",
    "subfield": "Diophantine equations",
    "posedYear": 1953,
    "posedBy": "Louis Mordell (question); Heath-Brown (conjecture, 1992)",
    "statement": "Every integer not congruent to ±4 modulo 9 is the sum of three (positive or negative) integer cubes, in infinitely many ways.",
    "form": "∀ k with k ≢ ±4 (mod 9), ∃ x,y,z∈ℤ :  x³ + y³ + z³ = k",
    "counterexample": "An integer k ≢ ±4 (mod 9) provably not expressible as x³+y³+z³.",
    "disproof": "counterexample-hard",
    "status": "open",
    "evidence": "The obstruction k≡±4 (mod 9) is the only known one; Booker (2019, for 33) and Booker–Sutherland (2019, for 42) closed the last small cases below 100. As of 2026 the smallest integer whose status is unknown is 114, with 390, 627, 633, 732, 921, 975 also open below 1000.",
    "prize": "",
    "tags": [
      "diophantine",
      "cubes",
      "computational"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Sums_of_three_cubes"
      },
      {
        "label": "Quanta",
        "url": "https://www.quantamagazine.org/why-the-sum-of-three-cubes-is-a-hard-math-problem-20191105/"
      }
    ],
    "note": "Excluding numbers that are ±4 mod 9 (which provably fail), can every integer be written as three cubes? The famous solutions for 33 and 42 required planetary-scale computation and terms with 16-digit cubes. The conjecture predicts representability is universal, but proving that any specific number like 114 has no solution — versus just an undiscovered huge one — is the real difficulty."
  },
  {
    "id": "ulam-sequence-regularity",
    "name": "Ulam Sequence Regularity",
    "field": "Number theory",
    "subfield": "Integer sequences",
    "posedYear": 1964,
    "posedBy": "Stanisław Ulam",
    "statement": "The Ulam numbers (start 1, 2; each subsequent term is the least integer that is a sum of two distinct earlier terms in exactly one way) have a well-defined asymptotic density, empirically ≈ 0.07398.",
    "form": "lim_{N→∞} |{ Ulam numbers ≤ N }| / N  exists (≈ 0.07398)",
    "counterexample": "A proof that the counting function has no limiting density, or that the density differs from the observed constant.",
    "disproof": "other",
    "status": "open",
    "evidence": "Over millions of computed terms the density hovers near 0.07398; Steinerberger (2015) discovered a hidden near-periodic signal — the Ulam numbers avoid a residue band with respect to a specific real constant λ ≈ 2.5714 — but no proof that the density even exists has been given.",
    "prize": "",
    "tags": [
      "integer-sequences",
      "density",
      "quasiperiodicity"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Ulam_number"
      },
      {
        "label": "OEIS A002858",
        "url": "https://oeis.org/A002858"
      }
    ],
    "note": "Ulam's greedily-defined sequence (1, 2, 3, 4, 6, 8, 11, 13, …) looks erratic but its density stubbornly clings to about 0.074, and Steinerberger found the numbers mysteriously cluster in phase with a hidden frequency — as if the sequence secretly obeys a wave. Yet nothing is proven: not the density, not the quasi-periodic structure, not even that the sequence has any large-scale regularity at all."
  },
  {
    "id": "evasiveness-akr",
    "name": "Evasiveness Conjecture (Aanderaa–Karp–Rosenberg)",
    "field": "Theoretical CS",
    "subfield": "Decision-tree complexity",
    "posedYear": 1973,
    "posedBy": "Stål Aanderaa, Richard Karp, Arnold Rosenberg",
    "statement": "Every nontrivial monotone graph property on n vertices is evasive: any decision-tree algorithm must, in the worst case, query all C(n,2) possible edges.",
    "form": "P nontrivial, monotone, graph property ⇒ D(P) = C(n,2)",
    "counterexample": "A nontrivial monotone graph property computable by querying strictly fewer than C(n,2) edge-slots in the worst case.",
    "disproof": "counterexample",
    "status": "open",
    "evidence": "Proven when n is a prime power (Kahn–Saks–Sturtevant 1984, via topological fixed-point methods) and for bipartite graphs. Best general lower bound D(P) ≥ (1/3 − o(1))·n² (Scheidweiler–Triesch); the weaker Ω(n²) is classical (Rivest–Vuillemin).",
    "prize": "",
    "tags": [
      "complexity",
      "decision-trees",
      "combinatorics"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Aanderaa%E2%80%93Karp%E2%80%93Rosenberg_conjecture"
      }
    ],
    "note": "A question about worst-case queries: to decide a monotone graph property you seemingly must inspect every potential edge. The prime-power case was proved with a surprising topological argument (group actions and fixed points on simplicial complexes), but a general combinatorial proof — even a matching Ω(n²) constant — remains out of reach."
  },
  {
    "id": "exponential-time-hypothesis",
    "name": "Exponential Time Hypothesis (ETH)",
    "field": "Theoretical CS",
    "subfield": "Fine-grained complexity",
    "posedYear": 2001,
    "posedBy": "Russell Impagliazzo, Ramamohan Paturi",
    "statement": "3-SAT cannot be solved in subexponential time — there is a constant δ > 0 such that no algorithm decides n-variable 3-SAT in time 2^{o(n)}.",
    "form": "∃ δ>0 : 3-SAT ∉ TIME(2^{δn}), and no 2^{o(n)} algorithm exists",
    "counterexample": "A 2^{o(n)}-time algorithm for 3-SAT (refuting ETH), or its stronger form SETH refuted by a faster-than-2^n CNF-SAT algorithm.",
    "disproof": "counterexample",
    "status": "open",
    "evidence": "Assumed as a hardness axiom underlying fine-grained complexity; implies tight conditional lower bounds (e.g. for edit distance, orthogonal vectors under SETH). Not implied by P ≠ NP; unproven and possibly false, but no subexponential algorithm is known.",
    "prize": "",
    "tags": [
      "complexity",
      "fine-grained"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Exponential_time_hypothesis"
      }
    ],
    "note": "A quantitative sharpening of P ≠ NP: it posits that 3-SAT really needs exponential time, not merely super-polynomial. Fine-grained complexity uses ETH and its stronger cousin SETH as axioms to prove tight running-time lower bounds for polynomial-time problems, so a refutation would ripple through the whole field."
  },
  {
    "id": "log-rank-conjecture",
    "name": "Log-Rank Conjecture",
    "field": "Theoretical CS",
    "subfield": "Communication complexity",
    "posedYear": 1988,
    "posedBy": "László Lovász, Michael Saks",
    "statement": "The deterministic two-party communication complexity of a Boolean function is polynomially bounded in the logarithm of the rank of its communication matrix.",
    "form": "D(f) = (log rank(M_f))^{O(1)}",
    "counterexample": "A family of Boolean matrices where deterministic communication complexity is super-polynomial in log(rank) — a super-polynomial separation.",
    "disproof": "counterexample",
    "status": "open",
    "evidence": "Best upper bound D(f) = O(√rank · log rank) (Lovett 2016); best separation is a polynomial gap D(f) ≈ (log rank)^{~1.63} (Göös–Pitassi–Watson and later improvements). Exponent of the true relationship unknown.",
    "prize": "",
    "tags": [
      "complexity",
      "communication"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Log-rank_conjecture"
      }
    ],
    "note": "A central question in communication complexity: is the rank of the communication matrix an essentially complete measure of how much two parties must talk? The gap between the best upper bound (roughly √rank) and the conjectured poly(log rank) is enormous, and closing it connects to matrix theory and polynomial approximations of Boolean functions."
  },
  {
    "id": "np-vs-conp",
    "name": "NP versus coNP",
    "field": "Theoretical CS",
    "subfield": "Proof complexity",
    "posedYear": 1971,
    "posedBy": "Stephen Cook, Robert Reckhow",
    "statement": "Is NP closed under complement — equivalently, does every tautology have a polynomial-size proof in some propositional proof system?",
    "form": "NP = coNP ?",
    "counterexample": "A polynomially bounded proof system for propositional tautologies (would give NP = coNP), or a proof that no such system exists.",
    "disproof": "other",
    "status": "open",
    "evidence": "Believed NP ≠ coNP (which implies P ≠ NP). Proof complexity provides super-polynomial lower bounds for weak systems (resolution, bounded-depth Frege) but not for strong systems like Frege or Extended Frege.",
    "prize": "",
    "tags": [
      "complexity",
      "proof-complexity"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Co-NP"
      }
    ],
    "note": "A finer question than P vs NP: whether 'no' answers (like proving a formula is unsatisfiable) always have short certificates the way 'yes' answers do. By the Cook–Reckhow program, NP ≠ coNP is equivalent to showing every propositional proof system has hard-to-prove tautologies — the driving goal of proof complexity."
  },
  {
    "id": "p-equals-bpp",
    "name": "P = BPP (Derandomization)",
    "field": "Theoretical CS",
    "subfield": "Pseudorandomness",
    "posedYear": 1982,
    "posedBy": "complexity theory community (post-Solovay–Strassen)",
    "statement": "Every problem solvable by a randomized polynomial-time algorithm with bounded error can be solved deterministically in polynomial time.",
    "form": "P = BPP ?",
    "counterexample": "A problem provably in BPP but not in P (would refute), i.e. an inherent, non-removable role for randomness in efficient computation.",
    "disproof": "other",
    "status": "open",
    "evidence": "Widely believed P = BPP. Follows from plausible circuit lower bounds: if E requires exponential-size circuits then P = BPP (Impagliazzo–Wigderson 1997). So proving it is tied to proving strong lower bounds; unconditionally open.",
    "prize": "",
    "tags": [
      "complexity",
      "randomness"
    ],
    "links": [
      {
        "label": "Wikipedia (BPP)",
        "url": "https://en.wikipedia.org/wiki/BPP_(complexity)"
      }
    ],
    "note": "Unlike P vs NP, most theorists expect P = BPP — that randomness does not give super-polynomial speedups for decision problems. The hardness-vs-randomness paradigm shows this would follow from strong circuit lower bounds, so derandomization and lower-bound theory are two sides of the same coin."
  },
  {
    "id": "p-vs-np",
    "name": "P versus NP",
    "field": "Theoretical CS",
    "subfield": "Computational complexity",
    "posedYear": 1971,
    "posedBy": "Stephen Cook (and Leonid Levin)",
    "statement": "Every problem whose solutions can be verified in polynomial time can also be solved in polynomial time.",
    "form": "P = NP ?",
    "counterexample": "A polynomial-time algorithm for an NP-complete problem (proving P = NP), or a proof that some NP problem has no polynomial-time algorithm (P ≠ NP).",
    "disproof": "other",
    "status": "open",
    "evidence": "Widely believed P ≠ NP. Barriers rule out major proof techniques: relativization (Baker–Gill–Solovay 1975), natural proofs (Razborov–Rudich 1994), algebrization (Aaronson–Wigderson 2008). No unconditional separation known.",
    "prize": "Clay Millennium ($1M)",
    "tags": [
      "complexity",
      "millennium"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/P_versus_NP_problem"
      },
      {
        "label": "Clay Institute",
        "url": "https://www.claymath.org/millennium/p-vs-np/"
      }
    ],
    "note": "The central open problem of theoretical computer science and a Clay Millennium Problem: is finding a solution fundamentally harder than checking one? A proof of P = NP would upend cryptography and optimization; almost everyone expects P ≠ NP, but known proof techniques are provably too weak to settle it."
  },
  {
    "id": "p-vs-pspace",
    "name": "P versus PSPACE",
    "field": "Theoretical CS",
    "subfield": "Computational complexity",
    "posedYear": 1970,
    "posedBy": "complexity theory community (Savitch-era)",
    "statement": "There exist problems solvable in polynomial space that are not solvable in polynomial time.",
    "form": "P ⊊ PSPACE ?",
    "counterexample": "A proof that P = PSPACE (a polynomial-time algorithm for every polynomial-space problem, e.g. TQBF), or a separating problem proving P ≠ PSPACE.",
    "disproof": "other",
    "status": "open",
    "evidence": "Almost universally believed P ≠ PSPACE (it would follow from P ≠ NP, since NP ⊆ PSPACE). Known: P ⊆ NP ⊆ PSPACE ⊆ EXP, and P ⊊ EXP (time hierarchy), but no single inclusion in that chain is proven strict at the P/PSPACE ends.",
    "prize": "",
    "tags": [
      "complexity",
      "space-complexity"
    ],
    "links": [
      {
        "label": "Wikipedia (PSPACE)",
        "url": "https://en.wikipedia.org/wiki/PSPACE"
      }
    ],
    "note": "Space seems far more powerful than time — PSPACE contains all of NP and the entire polynomial hierarchy — yet no one can prove polynomial space buys you strictly more than polynomial time. It is a striking illustration of how weak our unconditional lower bounds remain: we cannot even separate P from PSPACE."
  },
  {
    "id": "unique-games-conjecture",
    "name": "Unique Games Conjecture",
    "field": "Theoretical CS",
    "subfield": "Hardness of approximation",
    "posedYear": 2002,
    "posedBy": "Subhash Khot",
    "statement": "For every ε > 0, distinguishing near-satisfiable from highly-unsatisfiable instances of the Unique Games constraint-satisfaction problem is NP-hard.",
    "form": "∀ε>0 ∃ label set: gap-Unique-Games(1−ε, ε) is NP-hard",
    "counterexample": "A polynomial-time algorithm solving the Unique Games gap problem (refuting the conjecture), e.g. via improved SDP or subexponential structure exploited efficiently.",
    "disproof": "counterexample",
    "status": "open",
    "evidence": "Implies optimal inapproximability for MAX-CUT, Vertex Cover, and many CSPs (Raghavendra 2008 gives a universal SDP-optimality under UGC). The related 2-to-2 Games Conjecture was proved (Khot–Minzer–Safra 2018), giving strong partial support; a subexponential algorithm (Arora–Barak–Steurer 2010) shows it isn't NP-hard in the strongest sense.",
    "prize": "",
    "tags": [
      "complexity",
      "approximation"
    ],
    "links": [
      {
        "label": "Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Unique_games_conjecture"
      }
    ],
    "note": "If true, this single conjecture pins down the exact approximability threshold for a huge swath of optimization problems — for many, semidefinite programming would be provably optimal. The 2018 proof of the closely related 2-to-2 Games theorem was major evidence in its favor, but the full conjecture remains unresolved."
  }
];
