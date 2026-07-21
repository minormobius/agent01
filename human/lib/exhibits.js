// HUMAN MACHINERY — the exhibit registry. One record per exhibit; the lobby,
// /stats, /about/sources and the exhibit pages themselves all read from here.
// badge ∈ well-replicated | contested | failed-replication (see /about/sources).
window.HUMAN_EXHIBITS = [
  {
    slug: 'stroop',
    title: 'Stroop Sprint',
    wing: 'perception',
    year: 1935,
    badge: 'well-replicated',
    hook: 'The word says RED. The ink says blue. Your brain is about to fight itself in public.',
    mechanic: 'Name the ink colour of 12 words as fast as you can. Half of them are lying.',
    citations: [
      {
        label: 'Stroop, J. R. (1935). “Studies of interference in serial verbal reactions.” Journal of Experimental Psychology, 18(6), 643–662.',
        url: 'https://doi.org/10.1037/h0054651',
      },
      {
        label: 'MacLeod, C. M. (1991). “Half a century of research on the Stroop effect: An integrative review.” Psychological Bulletin, 109(2), 163–203.',
        url: 'https://doi.org/10.1037/0033-2909.109.2.163',
      },
    ],
    related: ['change-blindness', 'framing', 'anchoring'],
  },
  {
    slug: 'change-blindness',
    title: 'Change Blindness Gallery',
    wing: 'perception',
    year: 1997,
    badge: 'well-replicated',
    hook: 'A whole detail vanishes from the scene in front of you. You will swear nothing moved.',
    mechanic: 'Two scenes flicker and alternate. One thing changes each round. Find it — if you can.',
    citations: [
      {
        label: 'Rensink, R. A., O’Regan, J. K., & Clark, J. J. (1997). “To see or not to see: The need for attention to perceive changes in scenes.” Psychological Science, 8(5), 368–373.',
        url: 'https://doi.org/10.1111/j.1467-9280.1997.tb00427.x',
      },
      {
        label: 'Simons, D. J., & Levin, D. T. (1998). “Failure to detect changes to people during a real-world interaction.” Psychonomic Bulletin & Review, 5(4), 644–649.',
        url: 'https://doi.org/10.3758/BF03208840',
      },
    ],
    related: ['stroop', 'sunk-cost', 'contested'],
  },
  {
    slug: 'anchoring',
    title: 'Anchoring Auction',
    wing: 'judgment',
    year: 1974,
    badge: 'well-replicated',
    hook: 'A spinning wheel you know is random is about to move your estimate. Watch it happen.',
    mechanic: 'The wheel lands on a number. Then you estimate: what share of UN member states are in Africa?',
    citations: [
      {
        label: 'Tversky, A., & Kahneman, D. (1974). “Judgment under uncertainty: Heuristics and biases.” Science, 185(4157), 1124–1131.',
        url: 'https://doi.org/10.1126/science.185.4157.1124',
      },
      {
        label: 'Klein, R. A., et al. (2014). “Investigating variation in replicability: A ‘Many Labs’ replication project.” Social Psychology, 45(3), 142–152. (Anchoring replicated across 36 labs.)',
        url: 'https://doi.org/10.1027/1864-9335/a000178',
      },
    ],
    related: ['framing', 'sunk-cost', 'stroop'],
  },
  {
    slug: 'framing',
    title: 'Framing Clinic',
    wing: 'judgment',
    year: 1981,
    badge: 'well-replicated',
    hook: 'Same disease. Same numbers. Same you. One changed word flips your decision.',
    mechanic: 'A hypothetical outbreak, two treatment programmes, one choice. The math never changes — the wording does.',
    citations: [
      {
        label: 'Tversky, A., & Kahneman, D. (1981). “The framing of decisions and the psychology of choice.” Science, 211(4481), 453–458.',
        url: 'https://doi.org/10.1126/science.7455683',
      },
      {
        label: 'Kühberger, A. (1998). “The influence of framing on risky decisions: A meta-analysis.” Organizational Behavior and Human Decision Processes, 75(1), 23–55. (Robust, but smaller than the original.)',
        url: 'https://doi.org/10.1006/obhd.1998.2781',
      },
    ],
    related: ['anchoring', 'sunk-cost', 'contested'],
  },
  {
    slug: 'sunk-cost',
    title: 'Sunk Cost Simulator',
    wing: 'judgment',
    year: 1985,
    badge: 'contested',
    hook: 'You paid for two ski trips. They’re the same weekend. One is worse. Your wallet will choose for you.',
    mechanic: 'Two classic scenarios about money you can’t get back. Choose what you’d actually do.',
    citations: [
      {
        label: 'Arkes, H. R., & Blumer, C. (1985). “The psychology of sunk cost.” Organizational Behavior and Human Decision Processes, 35(1), 124–140.',
        url: 'https://doi.org/10.1016/0749-5978(85)90049-4',
      },
      {
        label: 'Ronayne, D., Sgroi, D., & Tuckwell, A. (2021). “Evaluating the sunk cost effect.” Journal of Economic Behavior & Organization, 186, 318–327. (Across many studies the effect is often weaker — or absent. We badge this one contested.)',
        url: 'https://doi.org/10.1016/j.jebo.2021.03.029',
      },
    ],
    related: ['framing', 'anchoring', 'contested'],
  },
  {
    slug: 'contested',
    title: 'The Contested Wing',
    wing: 'contested',
    year: 2012,
    badge: 'failed-replication',
    hook: 'Three famous effects that failed to replicate. The museum keeps them on display — that’s the point.',
    mechanic: 'Social priming, ego depletion, power posing: what we believed, what the big replications found, and whether you’d have been fooled.',
    citations: [
      {
        label: 'Doyen, S., Klein, O., Pichon, C.-L., & Cleeremans, A. (2012). “Behavioral priming: It’s all in the mind, but whose mind?” PLOS ONE, 7(1), e29081.',
        url: 'https://doi.org/10.1371/journal.pone.0029081',
      },
      {
        label: 'Hagger, M. S., et al. (2016). “A multilab preregistered replication of the ego-depletion effect.” Perspectives on Psychological Science, 11(4), 546–573.',
        url: 'https://doi.org/10.1177/1745691616652873',
      },
      {
        label: 'Ranehill, E., et al. (2015). “Assessing the robustness of power posing: No effect on hormones and risk tolerance in a large sample of men and women.” Psychological Science, 26(5), 653–656.',
        url: 'https://doi.org/10.1177/0956797614553946',
      },
    ],
    related: ['sunk-cost', 'framing', 'stroop'],
  },
];

window.HUMAN_WINGS = [
  { id: 'perception', label: 'Perception', blurb: 'Your senses are a press office, not a camera.' },
  { id: 'judgment', label: 'Judgment', blurb: 'Decisions, made for you, by context.' },
  { id: 'contested', label: 'The Contested Wing', blurb: 'Beautiful ideas that didn’t survive replication. Kept on display.' },
];
