/* ─────────────────────────────────────────────────────────────────────
   ken/refs.js — THE BIBLIOGRAPHY, as data.

   Every citation on this site is a key into this object. Pages cite with
   <a class="cite" data-ref="holmstrom1991"></a> and cite.js numbers them in
   document order, then renders the reference list.

   This file is shared byte-for-byte by the browser and by ken.selftest.mjs,
   which asserts: every data-ref on every page resolves here; every entry is
   cited at least once; no duplicate keys; every entry carries author, year,
   title and venue. There is no second copy to drift.

   THE RULE FOR THIS SURFACE: every work listed here is real, and is cited
   because someone intends to read it. The fabricated-citation site is next
   door at wormhole.mino.mobi and the difference between the two is the whole
   point of putting a machine check on this one.
   ───────────────────────────────────────────────────────────────────── */
(function (root) {
  'use strict';

  const REFS = {

    // ── Unit I — the measurement of unobservables ──────────────────────
    spearman1904: {
      a: 'Spearman, C.', y: 1904,
      t: '"General Intelligence," Objectively Determined and Measured',
      v: 'American Journal of Psychology 15(2), 201–292',
      n: 'The founding act: a latent variable inferred from the correlations among imperfect indicators, none of which measures it directly.' },
    cronbach1951: {
      a: 'Cronbach, L. J.', y: 1951,
      t: 'Coefficient alpha and the internal structure of tests',
      v: 'Psychometrika 16(3), 297–334',
      n: 'Read it alongside its modern critics — α is routinely reported as though it established validity, which it does not.' },
    cronbach1955: {
      a: 'Cronbach, L. J. & Meehl, P. E.', y: 1955,
      t: 'Construct validity in psychological tests',
      v: 'Psychological Bulletin 52(4), 281–302',
      n: 'THE paper of Unit I. What it means for a number to be a measurement of something rather than merely a number.' },
    campbell1959: {
      a: 'Campbell, D. T. & Fiske, D. W.', y: 1959,
      t: 'Convergent and discriminant validation by the multitrait-multimethod matrix',
      v: 'Psychological Bulletin 56(2), 81–105',
      n: 'A measure must agree with other measures of the same thing AND disagree with measures of different things. Most evaluation suites test only the first half.' },
    lord1968: {
      a: 'Lord, F. M. & Novick, M. R.', y: 1968,
      t: 'Statistical Theories of Mental Test Scores',
      v: 'Addison-Wesley',
      n: 'Classical test theory. Chapters 2–4 carry the model to master.' },
    rasch1960: {
      a: 'Rasch, G.', y: 1960,
      t: 'Probabilistic Models for Some Intelligence and Attainment Tests',
      v: 'Danish Institute for Educational Research' },
    messick1995: {
      a: 'Messick, S.', y: 1995,
      t: 'Validity of psychological assessment',
      v: 'American Psychologist 50(9), 741–749',
      n: 'Extends validity to the consequences of using the measure — which is where a gate that reshapes the work it scores belongs.' },
    embretson2000: {
      a: 'Embretson, S. E. & Reise, S. P.', y: 2000,
      t: 'Item Response Theory for Psychologists',
      v: 'Lawrence Erlbaum' },
    cohen1960: {
      a: 'Cohen, J.', y: 1960,
      t: 'A coefficient of agreement for nominal scales',
      v: 'Educational and Psychological Measurement 20(1), 37–46' },
    krippendorff2004: {
      a: 'Krippendorff, K.', y: 2004,
      t: 'Content Analysis: An Introduction to Its Methodology (2nd ed.)',
      v: 'Sage',
      n: 'Ch. 11 for α, which handles missing data and any number of raters — the one to use when your rater panel is ragged.' },

    // ── Unit II — the design of experiments ────────────────────────────
    fisher1935: {
      a: 'Fisher, R. A.', y: 1935,
      t: 'The Design of Experiments',
      v: 'Oliver & Boyd',
      n: 'Ch. 2 is the lady tasting tea — eight cups, and the entire logic of randomisation as the thing that licenses the inference.' },
    student1908: {
      a: '"Student" (Gosset, W. S.)', y: 1908,
      t: 'The Probable Error of a Mean',
      v: 'Biometrika 6(1), 1–25' },
    neyman1923: {
      a: 'Neyman, J.', y: 1923,
      t: 'On the Application of Probability Theory to Agricultural Experiments',
      v: 'trans. Statistical Science 5(4), 465–472 (1990)',
      n: 'Potential outcomes, sixty years before they were adopted.' },
    rubin1974: {
      a: 'Rubin, D. B.', y: 1974,
      t: 'Estimating causal effects of treatments in randomized and nonrandomized studies',
      v: 'Journal of Educational Psychology 66(5), 688–701' },
    wald1945: {
      a: 'Wald, A.', y: 1945,
      t: 'Sequential Tests of Statistical Hypotheses',
      v: 'Annals of Mathematical Statistics 16(2), 117–186',
      n: 'How to stop early without lying about your error rate. Directly the budget-governor problem.' },
    box2005: {
      a: 'Box, G. E. P., Hunter, J. S. & Hunter, W. G.', y: 2005,
      t: 'Statistics for Experimenters (2nd ed.)',
      v: 'Wiley',
      n: 'The working text for Unit II. Ch. 1–5, then the factorial chapters.' },
    ioannidis2005: {
      a: 'Ioannidis, J. P. A.', y: 2005,
      t: 'Why Most Published Research Findings Are False',
      v: 'PLoS Medicine 2(8), e124' },
    simmons2011: {
      a: 'Simmons, J. P., Nelson, L. D. & Simonsohn, U.', y: 2011,
      t: 'False-Positive Psychology: Undisclosed Flexibility in Data Collection and Analysis Allows Presenting Anything as Significant',
      v: 'Psychological Science 22(11), 1359–1366',
      n: 'Researcher degrees of freedom. Read immediately before writing any analysis plan of your own.' },
    nosek2018: {
      a: 'Nosek, B. A., Ebersole, C. R., DeHaven, A. C. & Mellor, D. T.', y: 2018,
      t: 'The preregistration revolution',
      v: 'PNAS 115(11), 2600–2606' },
    lai1985: {
      a: 'Lai, T. L. & Robbins, H.', y: 1985,
      t: 'Asymptotically efficient adaptive allocation rules',
      v: 'Advances in Applied Mathematics 6(1), 4–22' },
    auer2002: {
      a: 'Auer, P., Cesa-Bianchi, N. & Fischer, P.', y: 2002,
      t: 'Finite-time Analysis of the Multiarmed Bandit Problem',
      v: 'Machine Learning 47, 235–256' },
    lattimore2020: {
      a: 'Lattimore, T. & Szepesvári, C.', y: 2020,
      t: 'Bandit Algorithms',
      v: 'Cambridge University Press',
      n: 'Ch. 33 (best-arm identification) is the chapter that maps onto "which of these turns deserved the budget".' },

    // ── Unit III — delegation under unobservable effort ────────────────
    ross1973: {
      a: 'Ross, S. A.', y: 1973,
      t: 'The Economic Theory of Agency: The Principal’s Problem',
      v: 'American Economic Review 63(2), 134–139' },
    holmstrom1979: {
      a: 'Holmström, B.', y: 1979,
      t: 'Moral Hazard and Observability',
      v: 'Bell Journal of Economics 10(1), 74–91',
      n: 'The informativeness principle: any signal carrying information about effort belongs in the contract, however noisy. The argument against a single headline metric.' },
    grossman1983: {
      a: 'Grossman, S. J. & Hart, O. D.', y: 1983,
      t: 'An Analysis of the Principal-Agent Problem',
      v: 'Econometrica 51(1), 7–45' },
    holmstrom1987: {
      a: 'Holmström, B. & Milgrom, P.', y: 1987,
      t: 'Aggregation and Linearity in the Provision of Intertemporal Incentives',
      v: 'Econometrica 55(2), 303–328',
      n: 'Where the linear-exponential-normal setting comes from, and why a linear contract is optimal in it. The tractable model of Unit III.' },
    holmstrom1991: {
      a: 'Holmström, B. & Milgrom, P.', y: 1991,
      t: 'Multitask Principal-Agent Analyses: Incentive Contracts, Asset Ownership, and Job Design',
      v: 'Journal of Law, Economics, & Organization 7, 24–52',
      n: 'The centrepiece. When effort spans several tasks and only some are measurable, effort flows to the measured ones — and the optimal response is often to WEAKEN the measured incentive, not to strengthen it.' },
    baker1992: {
      a: 'Baker, G. P.', y: 1992,
      t: 'Incentive Contracts and Performance Measurement',
      v: 'Journal of Political Economy 100(3), 598–614',
      n: 'Separates distortion from risk. A metric can be perfectly reliable and still be the wrong thing to pay for.' },
    kerr1975: {
      a: 'Kerr, S.', y: 1975,
      t: 'On the Folly of Rewarding A, While Hoping for B',
      v: 'Academy of Management Journal 18(4), 769–783',
      n: 'The readable one. Assign it to anyone who needs convincing that this is a real subject.' },
    gibbons1998: {
      a: 'Gibbons, R.', y: 1998,
      t: 'Incentives in Organizations',
      v: 'Journal of Economic Perspectives 12(4), 115–132',
      n: 'The survey to read first if the formal papers are heavy going.' },
    prendergast1999: {
      a: 'Prendergast, C.', y: 1999,
      t: 'The Provision of Incentives in Firms',
      v: 'Journal of Economic Literature 37(1), 7–63' },

    // ── Unit IV — proxy failure ────────────────────────────────────────
    goodhart1975: {
      a: 'Goodhart, C. A. E.', y: 1975,
      t: 'Problems of Monetary Management: The U.K. Experience',
      v: 'Papers in Monetary Economics, Reserve Bank of Australia',
      n: 'The original observation, about monetary aggregates, and much narrower than the slogan it became.' },
    campbell1979: {
      a: 'Campbell, D. T.', y: 1979,
      t: 'Assessing the Impact of Planned Social Change',
      v: 'Evaluation and Program Planning 2(1), 67–90',
      n: 'Campbell’s Law, and independently the better statement of it.' },
    strathern1997: {
      a: 'Strathern, M.', y: 1997,
      t: '"Improving ratings": audit in the British University system',
      v: 'European Review 5(3), 305–321',
      n: 'Source of the familiar phrasing, and an ethnographer’s account of what a measured institution becomes.' },
    manheim2018: {
      a: 'Manheim, D. & Garrabrant, S.', y: 2018,
      t: 'Categorizing Variants of Goodhart’s Law',
      v: 'arXiv:1803.04585',
      n: 'Four mechanisms — regressional, extremal, causal, adversarial — that are usually conflated. Diagnosing WHICH one you have determines the fix.' },
    amodei2016: {
      a: 'Amodei, D., Olah, C., Steinhardt, J., Christiano, P., Schulman, J. & Mané, D.', y: 2016,
      t: 'Concrete Problems in AI Safety',
      v: 'arXiv:1606.06565',
      n: '§3 reward hacking and §4 scalable supervision are the two halves of this curriculum, stated together in 2016.' },
    krakovna2020: {
      a: 'Krakovna, V. et al.', y: 2020,
      t: 'Specification gaming: the flip side of AI ingenuity',
      v: 'DeepMind blog, with an accompanying public example list',
      n: 'The specimen cabinet. Read the list before designing any gate.' },
    skalse2022: {
      a: 'Skalse, J., Howe, N. H. R., Krasheninnikov, D. & Krueger, D.', y: 2022,
      t: 'Defining and Characterizing Reward Hacking',
      v: 'NeurIPS 2022',
      n: 'Gives "unhackable" a formal definition, and shows how restrictive it is.' },
    pan2022: {
      a: 'Pan, A., Bhatia, K. & Steinhardt, J.', y: 2022,
      t: 'The Effects of Reward Misspecification: Mapping and Mitigating Misaligned Models',
      v: 'ICLR 2022',
      n: 'Finds phase transitions — a more capable agent can flip abruptly from tracking the proxy to exploiting it.' },
    gao2023: {
      a: 'Gao, L., Schulman, J. & Hilton, J.', y: 2023,
      t: 'Scaling Laws for Reward Model Overoptimization',
      v: 'ICML 2023',
      n: 'The quantitative anchor for this whole programme: functional forms for how true quality diverges from measured quality as optimisation pressure rises. This is the shape our own curve is a special case of.' },

    // ── Unit V — judgment as an instrument ─────────────────────────────
    thurstone1927: {
      a: 'Thurstone, L. L.', y: 1927,
      t: 'A Law of Comparative Judgment',
      v: 'Psychological Review 34(4), 273–286',
      n: 'Why "which of these two is better" is a more reliable question than "score this out of ten".' },
    bradley1952: {
      a: 'Bradley, R. A. & Terry, M. E.', y: 1952,
      t: 'Rank Analysis of Incomplete Block Designs: I. The Method of Paired Comparisons',
      v: 'Biometrika 39(3/4), 324–345',
      n: 'The model to master in Unit V. Fits in forty lines and turns pairwise verdicts into a scale with standard errors.' },
    elo1978: {
      a: 'Elo, A. E.', y: 1978,
      t: 'The Rating of Chessplayers, Past and Present',
      v: 'Arco' },
    zheng2023: {
      a: 'Zheng, L. et al.', y: 2023,
      t: 'Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena',
      v: 'NeurIPS 2023 Datasets and Benchmarks',
      n: 'Documents position bias, verbosity bias and self-enhancement bias, and reports judge–human agreement against the human–human ceiling. The methods section is the template for calibrating our judge.' },
    chiang2023: {
      a: 'Chiang, C.-H. & Lee, H.-Y.', y: 2023,
      t: 'Can Large Language Models Be an Alternative to Human Evaluations?',
      v: 'ACL 2023' },
    dubois2024: {
      a: 'Dubois, Y., Galambosi, B., Liang, P. & Hashimoto, T. B.', y: 2024,
      t: 'Length-Controlled AlpacaEval: A Simple Way to Debias Automatic Evaluators',
      v: 'arXiv:2404.04475',
      n: 'A worked example of removing a known bias from a judge by regression rather than by asking it nicely.' },

    // ── Unit VI — oversight beyond your ken ────────────────────────────
    christiano2017: {
      a: 'Christiano, P., Leike, J., Brown, T. B., Martic, M., Legg, S. & Amodei, D.', y: 2017,
      t: 'Deep Reinforcement Learning from Human Preferences',
      v: 'NeurIPS 2017',
      n: 'Comparative judgment (Unit V) used as the training signal itself. The hinge between the two halves of this curriculum.' },
    irving2018: {
      a: 'Irving, G., Christiano, P. & Amodei, D.', y: 2018,
      t: 'AI Safety via Debate',
      v: 'arXiv:1805.00899' },
    christiano2018: {
      a: 'Christiano, P., Shlegeris, B. & Amodei, D.', y: 2018,
      t: 'Supervising strong learners by amplifying weak experts',
      v: 'arXiv:1810.08575' },
    saunders2022: {
      a: 'Saunders, W. et al.', y: 2022,
      t: 'Self-critiquing models for assisting human evaluators',
      v: 'arXiv:2206.05802',
      n: 'Critiques help humans find flaws they would otherwise miss — the most directly usable result in Unit VI.' },
    bowman2022: {
      a: 'Bowman, S. R. et al.', y: 2022,
      t: 'Measuring Progress on Scalable Oversight for Large Language Models',
      v: 'arXiv:2211.03540',
      n: 'The sandwiching paradigm: place the system between a non-expert supervisor and a ground-truth expert, and measure whether the non-expert can still steer it to the expert answer. This is the experimental design for "managing beyond your ken", and it is runnable here.' },
    bai2022: {
      a: 'Bai, Y. et al.', y: 2022,
      t: 'Constitutional AI: Harmlessness from AI Feedback',
      v: 'arXiv:2212.08073' },
    michael2023: {
      a: 'Michael, J. et al.', y: 2023,
      t: 'Debate Helps Supervise Unreliable Experts',
      v: 'arXiv:2311.08702' },
    burns2023: {
      a: 'Burns, C. et al.', y: 2023,
      t: 'Weak-to-Strong Generalization: Eliciting Strong Capabilities With Weak Supervision',
      v: 'arXiv:2312.09390',
      n: 'What happens when the supervisor is definitively weaker than the supervised. The empirical core of the ceiling problem.' },
  };

  root.KEN_REFS = REFS;
  if (typeof module !== 'undefined' && module.exports) module.exports = REFS;
})(typeof globalThis !== 'undefined' ? globalThis : this);
