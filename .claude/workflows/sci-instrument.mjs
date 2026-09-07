export const meta = {
  name: 'sci-instrument',
  description: 'Research an instrument and chart a sci wing for it: survey the literature, find the misconception, decompose into testable parts',
  whenToUse: 'When adding a new instrument to the sci wing. Pass the instrument name as args, e.g. "electron microscope". Stages 1-3 only — it stops at the chart for human review, by design.',
  phases: [
    { title: 'Survey',  detail: 'parallel literature sweeps, one per subsystem angle' },
    { title: 'Verify',  detail: 'resolve every DOI, mark what was actually read' },
    { title: 'Angle',   detail: 'the misconception worth correcting' },
    { title: 'Chart',   detail: 'decompose into parts, each with a closed form to test against' },
    { title: 'Critic',  detail: 'adversarial pass: what is uncitable, untestable, or dull' },
  ],
}

// docs/SCI-LOOP.md is the design. This script is stages 1-3 of it: survey,
// angle, chart. It deliberately STOPS at the chart, because that is the cheap
// human checkpoint — a chart is a page of prose and it decides everything the
// expensive stages will spend on.
//
// The load-bearing constraint, from the MRI build: an agent that must cite a
// primary source for every claim, compute every number with a solver, and check
// every solver against a closed form cannot invent physics. Stages 4-6 enforce
// the second and third. This script enforces the first and, crucially, refuses
// to chart a demo that has no closed form to be tested against.

const instrument = (typeof args === 'string' && args.trim())
  || (args && args.instrument)
  || 'electron microscope'

const MAX_PARTS = (args && args.maxParts) || 5

log(`charting a sci wing for: ${instrument}`)

// ---------------------------------------------------------------- schemas --

const SOURCES = {
  type: 'object',
  required: ['sources'],
  properties: {
    sources: {
      type: 'array',
      items: {
        type: 'object',
        required: ['citation', 'doi', 'gives', 'read'],
        properties: {
          citation: { type: 'string', description: 'Authors, title, journal, volume, pages, year' },
          doi: { type: 'string', description: 'Bare DOI (10.xxxx/…), or "none" if genuinely none exists' },
          openAccess: { type: 'boolean' },
          read: { type: 'string', enum: ['full', 'abstract', 'metadata-only'] },
          gives: { type: 'string', description: 'What this gives a page: a number, a mechanism, a claim we would otherwise get wrong' },
          subsystem: { type: 'string' },
        },
      },
    },
  },
}

const ANGLE = {
  type: 'object',
  required: ['misconception', 'whereItAppears', 'truth', 'settledBy', 'oneSentence'],
  properties: {
    misconception: { type: 'string', description: 'The widely-repeated wrong explanation, quoted or closely paraphrased' },
    whereItAppears: { type: 'string', description: 'Where a reader would have met it — textbook, museum label, popular article' },
    truth: { type: 'string' },
    settledBy: { type: 'string', description: 'The citation that settles it, with DOI' },
    oneSentence: { type: 'string', description: 'What a reader should leave with. The MRI one was: the sensor is a coil of wire, and an MRI is a one-pixel camera.' },
  },
}

const CHART = {
  type: 'object',
  required: ['parts', 'capstone'],
  properties: {
    parts: {
      type: 'array',
      items: {
        type: 'object',
        required: ['slug', 'title', 'oneIdea', 'demo', 'closedForm', 'sources'],
        properties: {
          slug: { type: 'string' },
          title: { type: 'string' },
          oneIdea: { type: 'string', description: 'The single thing this part exists to establish' },
          demo: { type: 'string', description: 'What the reader drives, and what changes when they do' },
          closedForm: { type: 'string', description: 'The analytic result the solver will be tested against. REQUIRED — a demo without one is cut.' },
          surprise: { type: 'string', description: 'The counterintuitive measured fact this part delivers' },
          sources: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    capstone: {
      type: 'object',
      required: ['idea', 'law'],
      properties: {
        idea: { type: 'string' },
        law: { type: 'string', description: 'The single relation that ties the parts together, as MRI\'s SNR law did' },
      },
    },
  },
}

const CRITIC = {
  type: 'object',
  required: ['verdict', 'cuts', 'gaps'],
  properties: {
    verdict: { type: 'string', enum: ['ready', 'needs-work'] },
    cuts: { type: 'array', items: { type: 'string' }, description: 'Parts that should be cut and why' },
    gaps: { type: 'array', items: { type: 'string' }, description: 'Claims with no source, demos with no closed form, numbers with no origin' },
    dullest: { type: 'string', description: 'The least interesting part, named plainly' },
  },
}

// ---------------------------------------------------------- 1 · SURVEY -----

phase('Survey')

// Multi-modal sweep: each agent searches a different way, because one angle
// finds one literature. This is how the MRI scan turned up Hoult's radio-wave
// papers (history), Stanisz's table (measurements) and the ZTE work (frontier)
// — three sweeps that would not have found each other.
const ANGLES = [
  { key: 'foundations', ask: 'the founding papers: who first built or explained this instrument, and what did they actually claim' },
  { key: 'detector',    ask: 'the SENSOR and detection chain specifically — what physically registers the signal, its noise, its limits' },
  { key: 'mechanism',   ask: 'the core physics that makes it work, and the closed-form results a simulation could be checked against' },
  { key: 'numbers',     ask: 'measured quantities with uncertainties: reference tables, standard values, and where the literature DISAGREES with itself' },
  { key: 'frontier',    ask: 'recent work, cheap/portable/extreme variants, and what they reveal about which parts are essential' },
  { key: 'misconception', ask: 'published corrections of common misunderstandings about this instrument — papers whose abstract complains that everyone gets something wrong' },
]

const sweeps = await parallel(ANGLES.map((a) => () =>
  agent(
    `Research the ${instrument} for a technical explainer. Your angle: ${a.ask}.\n\n` +
    `Use WebSearch and WebFetch. Prefer primary literature over reviews, and open access where it exists.\n\n` +
    `RULES, which are the point of the exercise:\n` +
    `- Report a source only if you have its real citation. No approximations.\n` +
    `- Give the DOI as a bare string. If you did not verify it resolves, say metadata-only.\n` +
    `- "read" means: full = you fetched and read the text; abstract = you read the abstract; ` +
    `metadata-only = you have the citation from an index and nothing more.\n` +
    `- "gives" must say what a page would DO with this source. A source that gives nothing is noise; omit it.\n` +
    `- Do not pad. Six real sources beat twenty plausible ones.`,
    { label: `survey:${a.key}`, phase: 'Survey', schema: SOURCES }
  )
))

const allSources = sweeps.filter(Boolean).flatMap((s) => s.sources || [])
log(`${allSources.length} sources from ${sweeps.filter(Boolean).length} sweeps`)

// ---------------------------------------------------------- 2 · VERIFY -----

phase('Verify')

// Dedup by DOI before spending anything on verification.
const byDoi = new Map()
for (const s of allSources) {
  const k = (s.doi || '').toLowerCase().trim()
  if (!k || k === 'none') { byDoi.set(s.citation, s); continue }
  if (!byDoi.has(k)) byDoi.set(k, s)
}
const unique = [...byDoi.values()]
log(`${unique.length} unique after dedup`)

const verified = await agent(
  `Here are ${unique.length} sources gathered for a technical explainer on the ${instrument}:\n\n` +
  JSON.stringify(unique, null, 1) +
  `\n\nVerify them. For each with a DOI, resolve https://doi.org/<doi> with ` +
  `Accept: application/vnd.citationstyles.csl+json and confirm the title and year match the citation. ` +
  `A DOI that returns an HTML error page is NOT REGISTERED — mark it.\n\n` +
  `This gate exists because a real run cited 10.1109/TMI.2011.2180730, which looks entirely ` +
  `plausible and does not exist; the paper is 10.1109/TMI.2011.2174158.\n\n` +
  `Return the corrected list: fix DOIs you can, drop entries you cannot verify at all, and ` +
  `keep the "read" field honest — downgrade anything you did not personally fetch.`,
  { label: 'verify:dois', phase: 'Verify', schema: SOURCES }
)

const good = (verified?.sources || unique)
const readInFull = good.filter((s) => s.read === 'full').length
log(`${good.length} verified, ${readInFull} read in full`)

// Gate G2: the MRI wing had 2 read in full at the point it started writing, and
// that was thin. Three is the floor.
if (readInFull < 3) {
  log(`⚠ GATE G2: only ${readInFull} sources read in full (want ≥3). The chart will be weaker than it looks.`)
}

// ----------------------------------------------------------- 3 · ANGLE -----

phase('Angle')

const angle = await agent(
  `You have a verified literature scan for the ${instrument}:\n\n` +
  JSON.stringify(good, null, 1) +
  `\n\nFind the ANGLE. An explainer earns its existence by correcting something, and the ` +
  `criterion is specific: an instrument whose usual explanation is wrong in a way the ` +
  `literature can settle.\n\n` +
  `The MRI wing's angle was that "radio waves go in, radio waves come out" is in most textbooks ` +
  `and is wrong — the coil and the patient are in each other's near field, coupling by induction, ` +
  `and Hoult published the correction repeatedly for thirty years. Its one sentence was: ` +
  `"the sensor is a coil of wire, and an MRI is a one-pixel camera."\n\n` +
  `Do not invent a misconception to have one. If the honest answer is that this instrument is ` +
  `usually explained correctly, say so in "misconception" and explain what the page would offer ` +
  `instead — that is a legitimate answer and the operator needs to hear it.`,
  { label: 'angle', phase: 'Angle', schema: ANGLE }
)

// ----------------------------------------------------------- 4 · CHART -----

phase('Chart')

// A judge panel: three independent decompositions, then pick and graft. The
// shape of a wing is a wide-solution-space problem and one attempt is a guess.
const drafts = await parallel([1, 2, 3].map((i) => () =>
  agent(
    `Chart a sci wing for the ${instrument}.\n\n` +
    `THE ANGLE:\n${JSON.stringify(angle, null, 1)}\n\n` +
    `THE SOURCES:\n${JSON.stringify(good, null, 1)}\n\n` +
    `Decompose it into parts. Each part is one page, built around one solver the reader drives.\n\n` +
    `HARD RULES:\n` +
    `- Between 2 and ${MAX_PARTS} parts. Choose the number the LITERATURE supports — how many ` +
    `distinct, separately-testable ideas are there really? Do not pad to a target.\n` +
    `- **Every demo must name the closed form it will be tested against.** An analytic solution, ` +
    `a published measured value, a conservation law, a limiting case. A demo with no closed form ` +
    `is cut here rather than discovered to be untestable later. This is the single most ` +
    `important rule in this workflow.\n` +
    `- Every part needs a "surprise": the counterintuitive fact it delivers, which must follow ` +
    `from the physics rather than from framing.\n` +
    `- The capstone must be a real relation that ties the parts, not a summary page. MRI's was ` +
    `SNR ∝ B₀² · voxel volume · √(sampling time) · coil sensitivity — every term belonging to a ` +
    `different part.\n\n` +
    `Draft ${i} of 3; you are being compared against two independent attempts, so commit to a ` +
    `point of view rather than hedging.`,
    { label: `chart:draft${i}`, phase: 'Chart', schema: CHART }
  )
))

const viable = drafts.filter(Boolean)
log(`${viable.length} charts drafted`)

const chart = await agent(
  `Three independent charts for a ${instrument} wing:\n\n` +
  viable.map((d, i) => `--- DRAFT ${i + 1} ---\n${JSON.stringify(d, null, 1)}`).join('\n\n') +
  `\n\nTHE ANGLE:\n${JSON.stringify(angle, null, 1)}\n\n` +
  `Synthesise the best single chart. Take the strongest spine and graft the best parts from the ` +
  `others. Cut anything whose closed form is vague — "compare to literature values" is not a ` +
  `closed form; "the on-axis field of a circular loop, μ₀Ia²/2(a²+z²)^{3/2}" is.\n\n` +
  `Prefer fewer, better parts. The reader's time is the scarce resource.`,
  { label: 'chart:synthesis', phase: 'Chart', schema: CHART }
)

// ---------------------------------------------------------- 5 · CRITIC -----

phase('Critic')

// Adversarial pass. Its job is to find what the enthusiasm missed.
const critic = await agent(
  `Review this chart for a ${instrument} explainer adversarially. You are not here to be ` +
  `encouraging.\n\n` +
  `CHART:\n${JSON.stringify(chart, null, 1)}\n\n` +
  `ANGLE:\n${JSON.stringify(angle, null, 1)}\n\n` +
  `SOURCES:\n${JSON.stringify(good, null, 1)}\n\n` +
  `Answer three questions:\n` +
  `1. Which claims have no source in that list? Quote them.\n` +
  `2. Which demos have a closed form that is not actually a closed form — something you could ` +
  `not write a passing assert against in an afternoon?\n` +
  `3. Which part is the DULLEST, and would the wing be better without it? Name it. Every wing ` +
  `has one and the polite answer is useless.\n\n` +
  `Verdict "ready" only if every demo is testable and every claim is sourced.`,
  { label: 'critic', phase: 'Critic', schema: CRITIC }
)

log(`critic: ${critic?.verdict ?? 'no verdict'} — ${(critic?.cuts || []).length} cuts, ${(critic?.gaps || []).length} gaps`)

return {
  instrument,
  angle,
  chart,
  critic,
  sources: good,
  stats: {
    sourcesFound: allSources.length,
    unique: unique.length,
    verified: good.length,
    readInFull,
    parts: (chart?.parts || []).length,
  },
  nextStep:
    'Stages 1-3 of docs/SCI-LOOP.md are done. Review the chart and the critic, then run stage 4 ' +
    '(engine: solvers + known-answer tests, no pages) before any HTML exists.',
}
