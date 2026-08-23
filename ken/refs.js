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
      n: 'The founding act: a latent variable inferred from the correlations among imperfect indicators, none of which measures it directly.',
      u: 'https://doi.org/10.2307/1412107' },
    cronbach1951: {
      a: 'Cronbach, L. J.', y: 1951,
      t: 'Coefficient alpha and the internal structure of tests',
      v: 'Psychometrika 16(3), 297–334',
      n: 'Read it alongside its modern critics — α is routinely reported as though it established validity, which it does not.',
      u: 'https://doi.org/10.1007/bf02310555' },
    cronbach1955: {
      a: 'Cronbach, L. J. & Meehl, P. E.', y: 1955,
      t: 'Construct validity in psychological tests',
      v: 'Psychological Bulletin 52(4), 281–302',
      n: 'THE paper of Unit I. What it means for a number to be a measurement of something rather than merely a number.',
      u: 'https://doi.org/10.1037/h0040957' },
    campbell1959: {
      a: 'Campbell, D. T. & Fiske, D. W.', y: 1959,
      t: 'Convergent and discriminant validation by the multitrait-multimethod matrix',
      v: 'Psychological Bulletin 56(2), 81–105',
      n: 'A measure must agree with other measures of the same thing AND disagree with measures of different things. Most evaluation suites test only the first half.',
      u: 'https://doi.org/10.1037/h0046016' },
    lord1968: {
      a: 'Lord, F. M. & Novick, M. R.', y: 1968,
      t: 'Statistical Theories of Mental Test Scores',
      v: 'Addison-Wesley',
      n: 'Classical test theory. Chapters 2–4 carry the model to master.',
      u: 'https://openlibrary.org/works/OL12817464W' },
    rasch1960: {
      a: 'Rasch, G.', y: 1960,
      t: 'Probabilistic Models for Some Intelligence and Attainment Tests',
      v: 'Danish Institute for Educational Research',
      u: 'https://openlibrary.org/works/OL4506215W' },
    messick1995: {
      a: 'Messick, S.', y: 1995,
      t: 'Validity of psychological assessment',
      v: 'American Psychologist 50(9), 741–749',
      n: 'Extends validity to the consequences of using the measure — which is where a gate that reshapes the work it scores belongs.',
      u: 'https://doi.org/10.1037/0003-066x.50.9.741' },
    embretson2000: {
      a: 'Embretson, S. E. & Reise, S. P.', y: 2000,
      t: 'Item Response Theory for Psychologists',
      v: 'Lawrence Erlbaum',
      u: 'https://openlibrary.org/works/OL19810970W' },
    cohen1960: {
      a: 'Cohen, J.', y: 1960,
      t: 'A coefficient of agreement for nominal scales',
      v: 'Educational and Psychological Measurement 20(1), 37–46',
      u: 'https://doi.org/10.1177/001316446002000104' },
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
      n: 'Ch. 2 is the lady tasting tea — eight cups, and the entire logic of randomisation as the thing that licenses the inference.',
      u: 'https://openlibrary.org/works/OL1153859W' },
    student1908: {
      a: '"Student" (Gosset, W. S.)', y: 1908,
      t: 'The Probable Error of a Mean',
      v: 'Biometrika 6(1), 1–25',
      u: 'https://doi.org/10.2307/2331554' },
    neyman1923: {
      a: 'Neyman, J.', y: 1923,
      t: 'On the Application of Probability Theory to Agricultural Experiments',
      v: 'trans. Statistical Science 5(4), 465–472 (1990)',
      n: 'Potential outcomes, sixty years before they were adopted.' },
    rubin1974: {
      a: 'Rubin, D. B.', y: 1974,
      t: 'Estimating causal effects of treatments in randomized and nonrandomized studies',
      v: 'Journal of Educational Psychology 66(5), 688–701',
      u: 'https://doi.org/10.1037/h0037350' },
    wald1945: {
      a: 'Wald, A.', y: 1945,
      t: 'Sequential Tests of Statistical Hypotheses',
      v: 'Annals of Mathematical Statistics 16(2), 117–186',
      n: 'How to stop early without lying about your error rate. Directly the budget-governor problem.',
      u: 'https://doi.org/10.1214/aoms/1177731118' },
    box2005: {
      a: 'Box, G. E. P., Hunter, J. S. & Hunter, W. G.', y: 2005,
      t: 'Statistics for Experimenters (2nd ed.)',
      v: 'Wiley',
      n: 'The working text for Unit II. Ch. 1–5, then the factorial chapters.',
      u: 'https://openlibrary.org/works/OL28985605W' },
    ioannidis2005: {
      a: 'Ioannidis, J. P. A.', y: 2005,
      t: 'Why Most Published Research Findings Are False',
      v: 'PLoS Medicine 2(8), e124',
      u: 'https://doi.org/10.1371/journal.pmed.0020124' },
    simmons2011: {
      a: 'Simmons, J. P., Nelson, L. D. & Simonsohn, U.', y: 2011,
      t: 'False-Positive Psychology: Undisclosed Flexibility in Data Collection and Analysis Allows Presenting Anything as Significant',
      v: 'Psychological Science 22(11), 1359–1366',
      n: 'Researcher degrees of freedom. Read immediately before writing any analysis plan of your own.',
      u: 'https://doi.org/10.1177/0956797611417632' },
    nosek2018: {
      a: 'Nosek, B. A., Ebersole, C. R., DeHaven, A. C. & Mellor, D. T.', y: 2018,
      t: 'The preregistration revolution',
      v: 'PNAS 115(11), 2600–2606',
      u: 'https://doi.org/10.1073/pnas.1708274114' },
    lai1985: {
      a: 'Lai, T. L. & Robbins, H.', y: 1985,
      t: 'Asymptotically efficient adaptive allocation rules',
      v: 'Advances in Applied Mathematics 6(1), 4–22',
      u: 'https://doi.org/10.1016/0196-8858(85)90002-8' },
    auer2002: {
      a: 'Auer, P., Cesa-Bianchi, N. & Fischer, P.', y: 2002,
      t: 'Finite-time Analysis of the Multiarmed Bandit Problem',
      v: 'Machine Learning 47, 235–256',
      u: 'https://doi.org/10.1023/a:1013689704352' },
    lattimore2020: {
      a: 'Lattimore, T. & Szepesvári, C.', y: 2020,
      t: 'Bandit Algorithms',
      v: 'Cambridge University Press',
      n: 'Ch. 33 (best-arm identification) is the chapter that maps onto "which of these turns deserved the budget".',
      u: 'https://openlibrary.org/works/OL22803554W' },

    // ── Unit III — delegation under unobservable effort ────────────────
    ross1973: {
      a: 'Ross, S. A.', y: 1973,
      t: 'The Economic Theory of Agency: The Principal’s Problem',
      v: 'American Economic Review 63(2), 134–139' },
    holmstrom1979: {
      a: 'Holmström, B.', y: 1979,
      t: 'Moral Hazard and Observability',
      v: 'Bell Journal of Economics 10(1), 74–91',
      n: 'The informativeness principle: any signal carrying information about effort belongs in the contract, however noisy. The argument against a single headline metric.',
      u: 'https://doi.org/10.2307/3003320' },
    grossman1983: {
      a: 'Grossman, S. J. & Hart, O. D.', y: 1983,
      t: 'An Analysis of the Principal-Agent Problem',
      v: 'Econometrica 51(1), 7–45',
      u: 'https://doi.org/10.2307/1912246' },
    holmstrom1987: {
      a: 'Holmström, B. & Milgrom, P.', y: 1987,
      t: 'Aggregation and Linearity in the Provision of Intertemporal Incentives',
      v: 'Econometrica 55(2), 303–328',
      n: 'Where the linear-exponential-normal setting comes from, and why a linear contract is optimal in it. The tractable model of Unit III.',
      u: 'https://doi.org/10.2307/1913238' },
    holmstrom1991: {
      a: 'Holmström, B. & Milgrom, P.', y: 1991,
      t: 'Multitask Principal-Agent Analyses: Incentive Contracts, Asset Ownership, and Job Design',
      v: 'Journal of Law, Economics, & Organization 7, 24–52',
      n: 'The centrepiece. When effort spans several tasks and only some are measurable, effort flows to the measured ones — and the optimal response is often to WEAKEN the measured incentive, not to strengthen it.',
      u: 'https://doi.org/10.1093/jleo/7.special_issue.24' },
    baker1992: {
      a: 'Baker, G. P.', y: 1992,
      t: 'Incentive Contracts and Performance Measurement',
      v: 'Journal of Political Economy 100(3), 598–614',
      n: 'Separates distortion from risk. A metric can be perfectly reliable and still be the wrong thing to pay for.',
      u: 'https://doi.org/10.1086/261831' },
    kerr1975: {
      a: 'Kerr, S.', y: 1975,
      t: 'On the Folly of Rewarding A, While Hoping for B',
      v: 'Academy of Management Journal 18(4), 769–783',
      n: 'The readable one. Assign it to anyone who needs convincing that this is a real subject.',
      u: 'https://doi.org/10.2307/255378' },
    gibbons1998: {
      a: 'Gibbons, R.', y: 1998,
      t: 'Incentives in Organizations',
      v: 'Journal of Economic Perspectives 12(4), 115–132',
      n: 'The survey to read first if the formal papers are heavy going.',
      u: 'https://doi.org/10.3386/w6695' },
    prendergast1999: {
      a: 'Prendergast, C.', y: 1999,
      t: 'The Provision of Incentives in Firms',
      v: 'Journal of Economic Literature 37(1), 7–63',
      u: 'https://doi.org/10.1257/jel.37.1.7' },

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
      n: 'Campbell’s Law, and independently the better statement of it.',
      u: 'https://doi.org/10.1016/0149-7189(79)90048-x' },
    strathern1997: {
      a: 'Strathern, M.', y: 1997,
      t: '"Improving ratings": audit in the British University system',
      v: 'European Review 5(3), 305–321',
      n: 'Source of the familiar phrasing, and an ethnographer’s account of what a measured institution becomes.',
      u: 'https://doi.org/10.1002/(sici)1234-981x(199707)5:3<305::aid-euro184>3.0.co;2-4' },
    manheim2018: {
      a: 'Manheim, D. & Garrabrant, S.', y: 2018,
      t: 'Categorizing Variants of Goodhart’s Law',
      v: 'arXiv:1803.04585',
      n: 'Four mechanisms — regressional, extremal, causal, adversarial — that are usually conflated. Diagnosing WHICH one you have determines the fix.',
      u: 'https://arxiv.org/abs/1803.04585' },
    amodei2016: {
      a: 'Amodei, D., Olah, C., Steinhardt, J., Christiano, P., Schulman, J. & Mané, D.', y: 2016,
      t: 'Concrete Problems in AI Safety',
      v: 'arXiv:1606.06565',
      n: '§3 reward hacking and §4 scalable supervision are the two halves of this curriculum, stated together in 2016.',
      u: 'https://arxiv.org/abs/1606.06565' },
    krakovna2020: {
      a: 'Krakovna, V. et al.', y: 2020,
      t: 'Specification gaming: the flip side of AI ingenuity',
      v: 'DeepMind blog, with an accompanying public example list',
      n: 'The specimen cabinet. Read the list before designing any gate.' },
    skalse2022: {
      a: 'Skalse, J., Howe, N. H. R., Krasheninnikov, D. & Krueger, D.', y: 2022,
      t: 'Defining and Characterizing Reward Hacking',
      v: 'NeurIPS 2022',
      n: 'Gives "unhackable" a formal definition, and shows how restrictive it is.',
      u: 'https://arxiv.org/abs/2209.13085' },
    pan2022: {
      a: 'Pan, A., Bhatia, K. & Steinhardt, J.', y: 2022,
      t: 'The Effects of Reward Misspecification: Mapping and Mitigating Misaligned Models',
      v: 'ICLR 2022',
      n: 'Finds phase transitions — a more capable agent can flip abruptly from tracking the proxy to exploiting it.',
      u: 'https://arxiv.org/abs/2201.03544' },
    gao2023: {
      a: 'Gao, L., Schulman, J. & Hilton, J.', y: 2023,
      t: 'Scaling Laws for Reward Model Overoptimization',
      v: 'ICML 2023',
      n: 'The quantitative anchor for this whole programme: functional forms for how true quality diverges from measured quality as optimisation pressure rises. This is the shape our own curve is a special case of.',
      u: 'https://arxiv.org/abs/2210.10760' },

    // ── Unit V — judgment as an instrument ─────────────────────────────
    thurstone1927: {
      a: 'Thurstone, L. L.', y: 1927,
      t: 'A Law of Comparative Judgment',
      v: 'Psychological Review 34(4), 273–286',
      n: 'Why "which of these two is better" is a more reliable question than "score this out of ten".',
      u: 'https://doi.org/10.1037/h0070288' },
    bradley1952: {
      a: 'Bradley, R. A. & Terry, M. E.', y: 1952,
      t: 'Rank Analysis of Incomplete Block Designs: I. The Method of Paired Comparisons',
      v: 'Biometrika 39(3/4), 324–345',
      n: 'The model to master in Unit V. Fits in forty lines and turns pairwise verdicts into a scale with standard errors.',
      u: 'https://doi.org/10.2307/2334029' },
    elo1978: {
      a: 'Elo, A. E.', y: 1978,
      t: 'The Rating of Chessplayers, Past and Present',
      v: 'Arco',
      u: 'https://openlibrary.org/works/OL6807294W' },
    zheng2023: {
      a: 'Zheng, L. et al.', y: 2023,
      t: 'Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena',
      v: 'NeurIPS 2023 Datasets and Benchmarks',
      n: 'Documents position bias, verbosity bias and self-enhancement bias, and reports judge–human agreement against the human–human ceiling. The methods section is the template for calibrating our judge.',
      u: 'https://arxiv.org/abs/2306.05685' },
    chiang2023: {
      a: 'Chiang, C.-H. & Lee, H.-Y.', y: 2023,
      t: 'Can Large Language Models Be an Alternative to Human Evaluations?',
      v: 'ACL 2023',
      u: 'https://arxiv.org/abs/2305.01937' },
    dubois2024: {
      a: 'Dubois, Y., Galambosi, B., Liang, P. & Hashimoto, T. B.', y: 2024,
      t: 'Length-Controlled AlpacaEval: A Simple Way to Debias Automatic Evaluators',
      v: 'arXiv:2404.04475',
      n: 'A worked example of removing a known bias from a judge by regression rather than by asking it nicely.',
      u: 'https://arxiv.org/abs/2404.04475' },

    // ── Unit VI — oversight beyond your ken ────────────────────────────
    christiano2017: {
      a: 'Christiano, P., Leike, J., Brown, T. B., Martic, M., Legg, S. & Amodei, D.', y: 2017,
      t: 'Deep Reinforcement Learning from Human Preferences',
      v: 'NeurIPS 2017',
      n: 'Comparative judgment (Unit V) used as the training signal itself. The hinge between the two halves of this curriculum.',
      u: 'https://arxiv.org/abs/1706.03741' },
    irving2018: {
      a: 'Irving, G., Christiano, P. & Amodei, D.', y: 2018,
      t: 'AI Safety via Debate',
      v: 'arXiv:1805.00899',
      u: 'https://arxiv.org/abs/1805.00899' },
    christiano2018: {
      a: 'Christiano, P., Shlegeris, B. & Amodei, D.', y: 2018,
      t: 'Supervising strong learners by amplifying weak experts',
      v: 'arXiv:1810.08575',
      u: 'https://arxiv.org/abs/1810.08575' },
    saunders2022: {
      a: 'Saunders, W. et al.', y: 2022,
      t: 'Self-critiquing models for assisting human evaluators',
      v: 'arXiv:2206.05802',
      n: 'Critiques help humans find flaws they would otherwise miss — the most directly usable result in Unit VI.',
      u: 'https://arxiv.org/abs/2206.05802' },
    bowman2022: {
      a: 'Bowman, S. R. et al.', y: 2022,
      t: 'Measuring Progress on Scalable Oversight for Large Language Models',
      v: 'arXiv:2211.03540',
      n: 'The sandwiching paradigm: place the system between a non-expert supervisor and a ground-truth expert, and measure whether the non-expert can still steer it to the expert answer. This is the experimental design for "managing beyond your ken", and it is runnable here.',
      u: 'https://arxiv.org/abs/2211.03540' },
    bai2022: {
      a: 'Bai, Y. et al.', y: 2022,
      t: 'Constitutional AI: Harmlessness from AI Feedback',
      v: 'arXiv:2212.08073',
      u: 'https://arxiv.org/abs/2212.08073' },
    michael2023: {
      a: 'Michael, J. et al.', y: 2023,
      t: 'Debate Helps Supervise Unreliable Experts',
      v: 'arXiv:2311.08702',
      u: 'https://arxiv.org/abs/2311.08702' },
    burns2023: {
      a: 'Burns, C. et al.', y: 2023,
      t: 'Weak-to-Strong Generalization: Eliciting Strong Capabilities With Weak Supervision',
      v: 'arXiv:2312.09390',
      n: 'What happens when the supervisor is definitively weaker than the supervised. The empirical core of the ceiling problem.',
      u: 'https://arxiv.org/abs/2312.09390' },

    // ── Unit IV — organisation: structure, authority, knowledge ────────
    coase1937: {
      a: 'Coase, R. H.', y: 1937,
      t: 'The Nature of the Firm',
      v: 'Economica 4(16), 386–405',
      n: 'Why organisations exist at all: because using the market has costs. The same question decides when to spawn a sub-agent and when to do the work in one context.',
      u: 'https://doi.org/10.1111/j.1468-0335.1937.tb00002.x' },
    simon1947: {
      a: 'Simon, H. A.', y: 1947,
      t: 'Administrative Behavior',
      v: 'Macmillan',
      n: 'Bounded rationality, and the organisation as the structure that copes with it. The founding text for treating attention as the scarce resource.',
      u: 'https://openlibrary.org/works/OL1205037W' },
    march1958: {
      a: 'March, J. G. & Simon, H. A.', y: 1958,
      t: 'Organizations',
      v: 'Wiley',
      u: 'https://openlibrary.org/works/OL1952350W' },
    chandler1962: {
      a: 'Chandler, A. D.', y: 1962,
      t: 'Strategy and Structure: Chapters in the History of the American Industrial Enterprise',
      v: 'MIT Press',
      n: 'Structure follows strategy, established historically across four firms. The multidivisional form as a response to co-ordination load.',
      u: 'https://openlibrary.org/works/OL9163907W' },
    galbraith1973: {
      a: 'Galbraith, J. R.', y: 1973,
      t: 'Designing Complex Organizations',
      v: 'Addison-Wesley',
      n: 'The information-processing view: structure is chosen to match the volume of exceptions that must travel up it. The most directly transferable framing in the unit.',
      u: 'https://openlibrary.org/works/OL3526904W' },
    mintzberg1979: {
      a: 'Mintzberg, H.', y: 1979,
      t: 'The Structuring of Organizations',
      v: 'Prentice-Hall',
      u: 'https://openlibrary.org/works/OL1837472W' },
    williamson1985: {
      a: 'Williamson, O. E.', y: 1985,
      t: 'The Economic Institutions of Capitalism',
      v: 'Free Press',
      n: 'Transaction cost economics. Asset specificity, hold-up, and the make-or-buy boundary.',
      u: 'https://openlibrary.org/works/OL3477521W' },
    hart1990: {
      a: 'Hart, O. & Moore, J.', y: 1990,
      t: 'Property Rights and the Nature of the Firm',
      v: 'Journal of Political Economy 98(6), 1119–1158',
      n: 'Incomplete contracts: when you cannot specify everything in advance, who holds residual control rights determines behaviour.',
      u: 'https://doi.org/10.1086/261729' },
    aghion1997: {
      a: 'Aghion, P. & Tirole, J.', y: 1997,
      t: 'Formal and Real Authority in Organizations',
      v: 'Journal of Political Economy 105(1), 1–29',
      n: 'Formal authority is the right to decide; real authority is effective control over the decision. An overloaded principal who keeps formal authority has less real authority than one who delegates. The direct model of the abstraction-ladder problem.',
      u: 'https://doi.org/10.1086/262063' },
    garicano2000: {
      a: 'Garicano, L.', y: 2000,
      t: 'Hierarchies and the Organization of Knowledge in Production',
      v: 'Journal of Political Economy 108(5), 874–904',
      n: 'The model to master in Unit IV. Workers handle routine problems and escalate exceptions; the optimum sets span of control and the number of layers from communication cost and problem difficulty. It is a theory of orchestration written before there was anything to orchestrate.',
      u: 'https://doi.org/10.1086/317671' },
    dessein2002: {
      a: 'Dessein, W.', y: 2002,
      t: 'Authority and Communication in Organizations',
      v: 'Review of Economic Studies 69(4), 811–838',
      n: 'Delegation beats an informed principal issuing instructions once the preference gap is small enough, because communication loses information. Quantifies when to stop specifying and start delegating.',
      u: 'https://doi.org/10.1111/1467-937x.00227' },
    milgrom1990: {
      a: 'Milgrom, P. & Roberts, J.', y: 1990,
      t: 'The Economics of Modern Manufacturing: Technology, Strategy, and Organization',
      v: 'American Economic Review 80(3), 511–528',
      n: 'Complementarities: practices that pay off together and not separately, so a partial adoption can score worse than none.' },
    holmstrom1994: {
      a: 'Holmström, B. & Milgrom, P.', y: 1994,
      t: 'The Firm as an Incentive System',
      v: 'American Economic Review 84(4), 972–991',
      n: 'Incentive intensity, asset ownership and job design are one decision, not three. Read directly after the 1991 multitask paper.' },
    gibbons2013: {
      a: 'Gibbons, R. & Roberts, J. (eds.)', y: 2013,
      t: 'The Handbook of Organizational Economics',
      v: 'Princeton University Press',
      n: 'The reference shelf for the whole unit. Use it to find the survey on a question rather than reading it through.' },

    // ── Unit IV(b) — communication networks: the experiment we are redoing ──
    bavelas1950: {
      a: 'Bavelas, A.', y: 1950,
      t: 'Communication Patterns in Task-Oriented Groups',
      v: 'Journal of the Acoustical Society of America 22(6), 725–730',
      n: 'The origin of the whole line. Groups are wired into fixed communication patterns and the pattern is the treatment. Introduces centrality as a structural quantity predicting who leads and how fast the group converges.',
      u: 'https://doi.org/10.1121/1.1906679' },
    leavitt1951: {
      a: 'Leavitt, H. J.', y: 1951,
      t: 'Some effects of certain communication patterns on group performance',
      v: 'Journal of Abnormal and Social Psychology 46(1), 38–50',
      n: 'WP2 is this experiment with agents instead of undergraduates. Five-person groups wired as circle, chain, Y and wheel; the wheel is fastest and most accurate, and its peripheral members are the least satisfied. Read it before running anything here — the design, the confounds and the morale result are all already worked out.',
      u: 'https://doi.org/10.1037/h0057189' },
    shaw1964: {
      a: 'Shaw, M. E.', y: 1964,
      t: 'Communication Networks',
      v: 'Advances in Experimental Social Psychology 1, 111–147',
      n: 'The review that complicates Leavitt: centralised networks win on simple tasks and lose on complex ones. If that interaction reproduces here, task difficulty belongs in the design and shape alone will not do.',
      u: 'https://doi.org/10.1016/s0065-2601(08)60050-7' },
    freeman1977: {
      a: 'Freeman, L. C.', y: 1977,
      t: 'A Set of Measures of Centrality Based on Betweenness',
      v: 'Sociometry 40(1), 35–41',
      n: 'The betweenness definition used in roles.mjs, from the same tradition as Bavelas. Load as the share of paths through a node.',
      u: 'https://doi.org/10.2307/3033543' },
    mckay2014: {
      a: 'McKay, B. D. & Piperno, A.', y: 2014,
      t: 'Practical graph isomorphism, II',
      v: 'Journal of Symbolic Computation 60, 94–112',
      n: 'nauty: refinement plus individualisation, which is the algorithm roles.mjs implements in miniature. Read it before trusting the orbit search on anything larger than a dozen nodes.',
      u: 'https://doi.org/10.1016/j.jsc.2013.09.003' },
    babai2016: {
      a: 'Babai, L.', y: 2016,
      t: 'Graph Isomorphism in Quasipolynomial Time',
      v: 'Proceedings of the 48th ACM Symposium on Theory of Computing, 684–697',
      n: 'Why the orbit search carries a step cap rather than a guarantee. Plan graphs are tiny and the cap has never fired; the point is that it is there.',
      u: 'https://doi.org/10.1145/2897518.2897542' },
    orbanz2015: {
      a: 'Orbanz, P. & Roy, D. M.', y: 2015,
      t: 'Bayesian Models of Graphs, Arrays and Other Exchangeable Random Structures',
      v: 'IEEE Transactions on Pattern Analysis and Machine Intelligence 37(2), 437–461',
      n: 'The bridge WP2 leans on: exchangeability is invariance of a distribution under a group action. Our group is the automorphism group of the plan, so "which turns may be pooled" has a structural answer before any data exists.',
      u: 'https://doi.org/10.1109/tpami.2014.2334607' },
    birkhoff1937: {
      a: 'Birkhoff, G.', y: 1937,
      t: 'Rings of sets',
      v: 'Duke Mathematical Journal 3(3), 443–454',
      n: 'The representation theorem: the downsets of a finite poset form a distributive lattice, and every finite distributive lattice arises that way. The general statement behind the ancestry order of a plan graph, whose image is a meet-semilattice on every shape we have enumerated and a full lattice on 99% of them.',
      u: 'https://doi.org/10.1215/s0012-7094-37-00334-x' },
    diaconis1980: {
      a: 'Diaconis, P. & Freedman, D.', y: 1980,
      t: 'Finite Exchangeable Sequences',
      v: 'Annals of Probability 8(4), 745–764',
      n: 'The finite-sample correction to de Finetti, and the reason a six-turn orbit is not an infinite exchangeable sequence. Cite it whenever a small orbit is treated as a sample.',
      u: 'https://doi.org/10.1214/aop/1176994663' },

    // ── Unit V — the case file ─────────────────────────────────────────
    lazear2000: {
      a: 'Lazear, E. P.', y: 2000,
      t: 'Performance Pay and Productivity',
      v: 'American Economic Review 90(5), 1346–1361',
      n: 'The Safelite windscreen study: a switch from hourly wages to piece rates raised output about 44%, roughly half from existing workers and half from who the scheme attracted. The control case where incentives worked, and the reason the unit is not simply a catalogue of failures.',
      u: 'https://doi.org/10.1257/aer.90.5.1346' },
    bevan2006: {
      a: 'Bevan, G. & Hood, C.', y: 2006,
      t: 'What\u2019s Measured Is What Matters: Targets and Gaming in the English Public Health Care System',
      v: 'Public Administration 84(3), 517–538',
      n: 'The best empirical study of target gaming in a real institution: ambulance clocks restarted, waiting lists reclassified, patients held in corridors so the trolley clock never began. Every mechanism has an analogue in an agent gate.',
      u: 'https://doi.org/10.1111/j.1467-9299.2006.00600.x' },
    hood2006: {
      a: 'Hood, C.', y: 2006,
      t: 'Gaming in Targetworld: The Targets Approach to Managing British Public Services',
      v: 'Public Administration Review 66(4), 515–521',
      u: 'https://doi.org/10.1111/j.1540-6210.2006.00612.x' },

    // ── methods ────────────────────────────────────────────────────────
    schulz2010: {
      a: 'Schulz, K. F., Altman, D. G. & Moher, D.', y: 2010,
      t: 'CONSORT 2010 Statement: Updated Guidelines for Reporting Parallel Group Randomised Trials',
      v: 'BMJ 340, c332',
      n: 'The canonical reporting checklist. Our house standard is a smaller version of the same idea: fix what must be reported so that omitting it is visible.',
      u: 'https://doi.org/10.1186/1745-6215-11-32' },

    // ── Working paper 1 — variance, and simulating a design ────────────
    fisher1925: {
      a: 'Fisher, R. A.', y: 1925,
      t: 'Statistical Methods for Research Workers',
      v: 'Oliver & Boyd',
      n: 'Where the analysis of variance and the intraclass correlation come from. Ch. 7 is the ancestor of every variance decomposition in this programme.',
      u: 'https://openlibrary.org/works/OL1153861W' },
    yates1935: {
      a: 'Yates, F.', y: 1935,
      t: 'Complex Experiments',
      v: 'Supplement to the Journal of the Royal Statistical Society 2(2), 181–247',
      n: 'The split-plot design: what to do when one factor is expensive to change and another is cheap. Our model is the whole plot and the task is the sub-plot, which means the naive analysis uses the wrong error term.',
      u: 'https://doi.org/10.2307/2983638' },
    cochran1977: {
      a: 'Cochran, W. G.', y: 1977,
      t: 'Sampling Techniques (3rd ed.)',
      v: 'Wiley',
      n: 'Cluster sampling and the design effect. A task with repeated runs is a cluster, and the effective sample size is smaller than the run count by a factor that depends on the ICC.',
      u: 'https://openlibrary.org/works/OL1351802W' },
    searle1992: {
      a: 'Searle, S. R., Casella, G. & McCulloch, C. E.', y: 1992,
      t: 'Variance Components',
      v: 'Wiley',
      n: 'The canonical treatment, including the point this working paper rediscovered the expensive way: variance components need far larger samples than means do.',
      u: 'https://openlibrary.org/works/OL4090978W' },
    satterthwaite1946: {
      a: 'Satterthwaite, F. E.', y: 1946,
      t: 'An Approximate Distribution of Estimates of Variance Components',
      v: 'Biometrics Bulletin 2(6), 110–114',
      n: 'The classical approximate interval for a variance component, and the analytic alternative to the simulation used here.',
      u: 'https://doi.org/10.2307/3002019' },
    efron1993: {
      a: 'Efron, B. & Tibshirani, R. J.', y: 1993,
      t: 'An Introduction to the Bootstrap',
      v: 'Chapman & Hall',
      n: 'What to reach for when the normal-theory interval on a variance component is not trustworthy, which at these sample sizes it is not.',
      u: 'https://openlibrary.org/works/OL3905086W' },
    burton2006: {
      a: 'Burton, A., Altman, D. G., Royston, P. & Holder, R. L.', y: 2006,
      t: 'The design of simulation studies in medical statistics',
      v: 'Statistics in Medicine 25(24), 4279–4292',
      u: 'https://doi.org/10.1002/sim.2673' },
    morris2019: {
      a: 'Morris, T. P., White, I. R. & Crowther, M. J.', y: 2019,
      t: 'Using simulation studies to evaluate statistical methods',
      v: 'Statistics in Medicine 38(11), 2074–2102',
      n: 'The modern standard for simulating a design before running it, including how to report the simulation itself. The direct justification for R13.',
      u: 'https://doi.org/10.1002/sim.8086' },
    pfister2013: {
      a: 'Pfister, R., Schwarz, K. A., Janczyk, M., Dale, R. & Freeman, J. B.', y: 2013,
      t: 'Good things peak in pairs: a note on the bimodality coefficient',
      v: 'Frontiers in Psychology 4, 700',
      n: 'Sarle\u2019s coefficient, its reference values, and an honest account of when it misleads.',
      u: 'https://doi.org/10.3389/fpsyg.2013.00700' },
    wang2023: {
      a: 'Wang, X., Wei, J., Schuurmans, D., Le, Q., Chi, E., Narang, S., Chowdhery, A. & Zhou, D.', y: 2023,
      t: 'Self-Consistency Improves Chain of Thought Reasoning in Language Models',
      v: 'ICLR 2023',
      n: 'Sampling a model repeatedly and aggregating. Treats run-to-run variation as a resource rather than a nuisance, which is the opposite framing to ours and worth holding alongside it.',
      u: 'https://arxiv.org/abs/2203.11171' },
  };

  root.KEN_REFS = REFS;
  if (typeof module !== 'undefined' && module.exports) module.exports = REFS;
})(typeof globalThis !== 'undefined' ? globalThis : this);
