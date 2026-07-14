// chat — shared conversation model (rubric + bot personas + scenarios)
//
// SINGLE SOURCE OF TRUTH. Imported three ways, verbatim:
//   • the Worker (worker.js) — builds the bot + judge prompts from this data
//   • the robo page (/robo/) — renders the live rubric + persona/scenario pickers
//   • the docs page (/docs/) — renders the theory + "rubric development" view
//
// Pure data + pure functions. No Worker-only APIs, no DOM — so it runs in a
// Cloudflare Worker, a browser module, and plain node alike. Keep it that way.
// (Same discipline as rite/names/engine.js.)

// ── The rubric ──────────────────────────────────────────────────────────────
// Five axes, each scored 0..max by the AI judge. They sum to 100.
// Each axis names the conversation-theory it operationalizes, so a low score
// links straight to the doc that explains it. This is the whole thesis of the
// site: scoring conversation only means something when the axes are theory.

export const RUBRIC = {
  version: 'v1',
  total: 100,
  axes: [
    {
      key: 'relevance',
      label: 'Relevance',
      max: 20,
      theory: "Grice's maxim of Relation — “be relevant.”",
      source: 'Grice, “Logic and Conversation” (1975)',
      one_liner: 'Your turns connect to what was actually just said.',
      look_for: [
        'Picks up the other person’s last point instead of pivoting to your own agenda',
        'Threads a callback to something said earlier',
        'Answers the question that was actually asked',
      ],
      avoid: [
        'Non-sequiturs and topic-hijacks',
        'Waiting to talk rather than listening',
        'Answering a different, easier question',
      ],
    },
    {
      key: 'balance',
      label: 'Balance',
      max: 20,
      theory: 'Turn-taking — the floor is shared, gaps and overlap are minimized.',
      source: 'Sacks, Schegloff & Jefferson, “A Simplest Systematics…” (1974)',
      one_liner: 'You share the floor — neither monologue nor ghost.',
      look_for: [
        'Airtime roughly proportional to the number of people',
        'Hands the floor back with a question or a pause',
        'Turns sized to the moment — short in banter, longer when invited',
      ],
      avoid: [
        'Monologuing / not yielding the floor',
        'One-word answers that starve the exchange',
        'Talking over others (interruptive overlap)',
      ],
    },
    {
      key: 'listening',
      label: 'Listening',
      max: 20,
      theory: 'Active listening — reflect, paraphrase, ask, and build ("yes-and").',
      source: 'Rogers & Farson, “Active Listening” (1957); improv’s yes-and',
      one_liner: 'You visibly build on what others give you.',
      look_for: [
        'Open questions that invite elaboration',
        'Paraphrase / reflection that shows you understood',
        'Yes-and: accepts the offer, then adds to it',
      ],
      avoid: [
        'Yes-but / blocking the other person’s offer',
        'Closed questions that dead-end',
        'Never referencing what they just said',
      ],
    },
    {
      key: 'clarity',
      label: 'Clarity',
      max: 20,
      theory: 'Grice’s Quantity + Manner — as informative as needed, no more; be orderly and clear.',
      source: 'Grice (1975), maxims of Quantity & Manner',
      one_liner: 'You’re clear and the right length — no more, no less.',
      look_for: [
        'Right-sized turns: complete but not padded',
        'Concrete over vague; one idea at a time',
        'Ordered, easy to follow',
      ],
      avoid: [
        'Rambling well past the point',
        'Cryptic under-answers that force follow-ups',
        'Jargon or ambiguity that muddies the point',
      ],
    },
    {
      key: 'warmth',
      label: 'Warmth',
      max: 20,
      theory: 'Politeness & face-work — protect the other’s social face; build rapport.',
      source: 'Brown & Levinson, “Politeness” (1987); Goffman on face',
      one_liner: 'People feel respected and liked talking to you.',
      look_for: [
        'Acknowledgment and encouragement',
        'Disagreeing without diminishing (repair, softening)',
        'Warmth signals: humor, self-disclosure, curiosity',
      ],
      avoid: [
        'Face threats: dismissiveness, one-upping, contradiction-first',
        'Cold, transactional replies',
        'Letting a misunderstanding stand un-repaired',
      ],
    },
  ],
};

// Score → title band. Kept deliberately generous at the top so the ceiling
// feels reachable; the point is a coaching signal, not a gate.
export const BANDS = [
  { min: 85, title: 'Magnetic',      note: 'People leave the conversation glad they had it.' },
  { min: 70, title: 'Engaging',      note: 'You carry your weight and make room for others.' },
  { min: 55, title: 'Conversational', note: 'Solid footing — a couple of axes to sharpen.' },
  { min: 40, title: 'Warming up',    note: 'The mechanics are there; presence is uneven.' },
  { min: 0,  title: 'Finding your feet', note: 'Focus on one axis at a time — start with Listening.' },
];

export function scoreBand(total) {
  return BANDS.find((b) => total >= b.min) || BANDS[BANDS.length - 1];
}

// ── The bot personas ────────────────────────────────────────────────────────
// Each is a defined difficulty: a specific way conversation goes wrong, so you
// practice the counter-move. `system` is spliced into the bot's system prompt.

export const PERSONAS = [
  {
    id: 'host',
    name: 'The Host',
    emoji: '🫖',
    difficulty: 1,
    tests: ['warmth', 'listening'],
    blurb: 'Warm, curious, generous with the floor. The gentle warm-up.',
    system:
      'You are warm, curious and encouraging. You ask easy open questions, offer small bits of yourself, and make the other person feel comfortable. You keep turns short and hand the floor back often.',
    opener: 'Oh hey — glad you made it! How’s your night going so far?',
  },
  {
    id: 'rambler',
    name: 'The Rambler',
    emoji: '🌀',
    difficulty: 2,
    tests: ['balance', 'clarity'],
    blurb: 'Over-talks, wanders into tangents. Tests whether you can steer and reclaim the floor.',
    system:
      'You talk a lot and wander into tangents, sometimes forgetting the original question. You rarely ask questions back unless steered. You are friendly, never hostile — just over-full. Keep each turn to 2-4 sentences but always drift slightly off-topic.',
    opener:
      'So funny story, I almost didn’t come tonight because my car — well it’s not even my car, it’s my brother’s — anyway the battery, right, and that reminds me…',
  },
  {
    id: 'interrogator',
    name: 'The Interrogator',
    emoji: '❓',
    difficulty: 2,
    tests: ['balance', 'listening'],
    blurb: 'Fires questions, discloses nothing. Tests reciprocity — can you get them to open up?',
    system:
      'You ask question after question but almost never disclose anything about yourself. If asked about yourself you deflect with another question. You are polite but slightly guarded. Keep turns short — usually one question.',
    opener: 'So what do you do? And is that what you always wanted to do?',
  },
  {
    id: 'wallflower',
    name: 'The Wallflower',
    emoji: '🌾',
    difficulty: 3,
    tests: ['listening', 'warmth'],
    blurb: 'Quiet, minimal answers. Tests whether you can draw someone out with open questions.',
    system:
      'You are shy and give short, minimal answers — often just a few words. You warm up ONLY when asked a genuinely open, specific question or offered a bit of vulnerability first. Closed or generic questions get one-word replies. Never volunteer a new topic yourself.',
    opener: 'Hey. …Yeah, it’s a nice place.',
  },
  {
    id: 'debater',
    name: 'The Debater',
    emoji: '⚔️',
    difficulty: 3,
    tests: ['warmth', 'relevance'],
    blurb: 'Challenges and disagrees. Tests warmth under pressure — can you disagree without a fight?',
    system:
      'You enjoy playing devil’s advocate and mildly challenging what the other person says. You disagree first, then maybe concede. You are never cruel, but you push. You test whether the other person can hold their ground warmly and repair friction. Keep turns to 2-3 sentences.',
    opener: 'Honestly? I think small talk is mostly a waste of time. Change my mind.',
  },
];

export function personaById(id) {
  return PERSONAS.find((p) => p.id === id) || PERSONAS[0];
}

// ── Scenarios (the setting) ─────────────────────────────────────────────────
export const SCENARIOS = [
  {
    id: 'party',
    name: 'House party',
    blurb: 'You just met by the snacks. Neither of you knows many people here.',
    setup: 'The setting is a friend-of-a-friend’s house party. You two just met near the snack table. It is loud-ish and casual.',
  },
  {
    id: 'coffee',
    name: 'Coffee catch-up',
    blurb: 'An acquaintance you haven’t seen in a while. Easy, low stakes.',
    setup: 'The setting is a coffee shop. You are acquaintances who haven’t caught up in months. Relaxed, plenty of time.',
  },
  {
    id: 'newcolleague',
    name: 'New colleague',
    blurb: 'First week on the job. You’re both feeling out the dynamic.',
    setup: 'The setting is a workplace kitchen. One of you started this week. Friendly but professionally careful.',
  },
  {
    id: 'neighbor',
    name: 'New neighbor',
    blurb: 'They just moved in next door. You’re establishing the relationship.',
    setup: 'The setting is the hallway / shared driveway. One of you just moved in next door. The tone sets the neighborly relationship for years.',
  },
];

export function scenarioById(id) {
  return SCENARIOS.find((s) => s.id === id) || SCENARIOS[0];
}

// ── The curriculum ("Duolingo for conversation") ─────────────────────────────
// Bite-sized challenges, grouped into units by the skill they drill. Each
// challenge is short (aim ~4-6 of your turns), pins one focus axis, and adds a
// concrete OBJECTIVE the AI judge evaluates pass/fail — so completion is about
// achieving something, not just chatting. Ordered easy → hard within the path.

export const UNITS = [
  { id: 'listen',    title: 'Listening',  icon: '👂', color: 'var(--accent)',   blurb: 'Draw people out.' },
  { id: 'balance',   title: 'Balance',    icon: '⚖️', color: 'var(--accent-3)', blurb: 'Share the floor.' },
  { id: 'warmth',    title: 'Warmth',     icon: '🔥', color: 'var(--accent-2)', blurb: 'Grace under pressure.' },
  { id: 'precision', title: 'Precision',  icon: '🎯', color: '#f0a3c0',         blurb: 'Relevant and clear.' },
];

// pass = the focus axis (0-20) must clear this to complete the challenge, AND
// the objective must be met. Both gates → the lesson counts as done.
export const CHALLENGES = [
  // Unit 1 — Listening
  {
    id: 'l1-icebreak', unit: 'listen', title: 'Break the ice', emoji: '🧊',
    persona: 'host', scenario: 'party', focus: 'listening', pass: 12,
    brief: 'Meet someone new and get a real conversation going.',
    goal: 'Ask 2+ open questions and follow up on an answer.',
    tip: 'Open questions start with how/what/why. Then react to what you hear — don’t just move to your next question.',
    objective: 'The user asked at least two open-ended (not yes/no) questions AND visibly followed up on something the partner said.',
  },
  {
    id: 'l2-drawout', unit: 'listen', title: 'Draw out the quiet one', emoji: '🌾',
    persona: 'wallflower', scenario: 'coffee', focus: 'listening', pass: 13,
    brief: 'Your partner is shy and gives short answers. Get them to open up.',
    goal: 'Get the partner to share something personal.',
    tip: 'Generic questions get one-word answers. Ask something specific, or share a little of yourself first to make it safe.',
    objective: 'By the end the shy partner volunteered a personal detail, opinion, or feeling — drawn out by the user’s specific, open questions or self-disclosure.',
  },
  // Unit 2 — Balance
  {
    id: 'b1-reclaim', unit: 'balance', title: 'Rein in the rambler', emoji: '🌀',
    persona: 'rambler', scenario: 'newcolleague', focus: 'balance', pass: 12,
    brief: 'Your partner talks a lot and wanders. Steer without being rude.',
    goal: 'Redirect the conversation and get them to ask about you.',
    tip: 'Acknowledge, then pivot: “That reminds me —” or “Before I forget, can I ask…”. Reclaim the floor warmly.',
    objective: 'The user steered the conversation back on-topic at least once AND got the partner to ask the user a question in return.',
  },
  {
    id: 'b2-reciprocate', unit: 'balance', title: 'Two-way street', emoji: '↔️',
    persona: 'interrogator', scenario: 'party', focus: 'balance', pass: 12,
    brief: 'Your partner keeps firing questions but shares nothing. Even it out.',
    goal: 'Turn one-sided Q&A into mutual exchange.',
    tip: 'After you answer, hand a question back — “How about you?” — and gently notice if they dodge.',
    objective: 'The user got the guarded partner to disclose something about themselves, shifting the exchange from one-sided questioning toward mutual.',
  },
  // Unit 3 — Warmth
  {
    id: 'w1-disagree', unit: 'warmth', title: 'Disagree warmly', emoji: '⚔️',
    persona: 'debater', scenario: 'coffee', focus: 'warmth', pass: 13,
    brief: 'Your partner pushes back on everything. Hold your view without a fight.',
    goal: 'State a real disagreement while keeping it warm.',
    tip: 'Acknowledge their point before countering. “I see why you’d say that — where I land differently is…”. Repair any friction.',
    objective: 'The user expressed a genuine disagreement or differing view while keeping a warm tone — acknowledging the partner, softening, or repairing friction rather than escalating.',
  },
  {
    id: 'w2-welcome', unit: 'warmth', title: 'Warm welcome', emoji: '🏡',
    persona: 'wallflower', scenario: 'neighbor', focus: 'warmth', pass: 12,
    brief: 'A reserved new neighbor. Set the tone for years of good rapport.',
    goal: 'Make them feel genuinely welcome.',
    tip: 'Warmth is specific: a real offer, shared ground, a bit of yourself. Make it easy for them to say yes.',
    objective: 'The user built rapport and put the reserved partner at ease — through warm acknowledgment, a concrete offer, or finding common ground.',
  },
  // Unit 4 — Precision (Relevance & Clarity)
  {
    id: 'p1-onthread', unit: 'precision', title: 'Stay on thread', emoji: '🧵',
    persona: 'rambler', scenario: 'party', focus: 'relevance', pass: 13,
    brief: 'The partner throws out tangents. Keep every reply connected.',
    goal: 'Tie each reply to what was just said.',
    tip: 'Before answering, name the thread you’re picking up: “Back to the trip you mentioned…”. Don’t chase every tangent.',
    objective: 'The user’s replies consistently connected to the partner’s previous turn — picking up threads rather than pivoting to unrelated topics.',
  },
  {
    id: 'p2-plainly', unit: 'precision', title: 'Say it plainly', emoji: '✂️',
    persona: 'interrogator', scenario: 'newcolleague', focus: 'clarity', pass: 13,
    brief: 'Rapid-fire questions. Answer clearly — right-sized, no rambling.',
    goal: 'Give clear, complete, concise answers.',
    tip: 'One idea per turn. Complete but not padded; specific, not cryptic. If you catch yourself rambling, land the plane.',
    objective: 'The user’s turns were clear and appropriately sized — informative and complete without rambling, and not so terse they were cryptic.',
  },
];

export function challengeById(id) {
  return CHALLENGES.find((c) => c.id === id) || null;
}

// Stars from a scored challenge result. Encouraging by design: clearing the
// gates is 2★; a standout focus performance is 3★; partial credit is 1★.
export function challengeStars({ passed, objectiveMet, focusScore, focusPass, total }) {
  if (passed && focusScore >= 16 && total >= 65) return 3;
  if (passed) return 2;
  if (objectiveMet || focusScore >= focusPass) return 1;
  return 0;
}
