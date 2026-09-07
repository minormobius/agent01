/* jurassic — the Daohugou roster, the ears that might have been listening, and
 * the plants in between.
 *
 * ── Where these numbers come from ──────────────────────────────────────────
 *
 * This file is the ONLY place any palaeontology lives. The Rust kernel knows
 * about resonators, files and air; it has never heard of an insect.
 *
 * The nine species below ARE the nine of Gu, J.-J., Montealegre-Z, F., Jonsson,
 * T., Woodrow, C., Celiker, E., Islam, M. N., Linde, J. B., Sarria-S, F. A.,
 * Shi, F., Song, H., Robert, D. & Ren, D. (2026) "Reconstruction of an extinct
 * soundscape reveals ultrasonic communication in the Jurassic", PNAS
 * 123(36):e2615107123 — open access, CC BY 4.0. Twenty fossil forewings, seven
 * prophalangopsid species and two haglid, all from the Jiulongshan Formation at
 * Daohugou, co-occurring at 157–165 Ma: the oldest palaeo-acoustic assemblage
 * yet put together.
 *
 * Every acoustic parameter carries a `from` tag, and the site shows it:
 *
 *   "published"  — printed as a number in that paper. Carrier frequencies and
 *                  quality factors are the FFT of their reconstructed syllable
 *                  (their Fig. 4D); the wing-resonance figures are their FEA
 *                  eigenfrequencies (their Fig. 3).
 *   "digitised"  — read off one of their published figures rather than a
 *                  printed number: the tooth counts and the shape of each
 *                  file's inter-tooth spacing (their Fig. 4B). Faithful to what
 *                  the figure shows, to about the precision of an eye.
 *   "modelled"   — ours. Source levels, chirp rhythm and abundance are not in
 *                  the paper's main text (their syllable rates come from a
 *                  Gaussian-process model reported in the SI Appendix, which we
 *                  did not have). Plausible, not results.
 *   "hypothesis" — a claim about something that does not fossilise at all,
 *                  chiefly what a Jurassic ear could hear. Argument, not datum.
 *
 * The frequencies and the Q values are theirs. The rhythm is ours. The site
 * says which is which everywhere it shows a number.
 *
 * Also cited below: Gu, Engel & Ren 2012, PNAS 109:3868, on *Archaboilus
 * musicus* — the first extinct animal whose song was reconstructed from its
 * instrument, and the precedent this whole assemblage extends.
 */

/** Where and when. Everything on the map is this one bed. */
export const LOCALITY = {
  bed: "Daohugou beds, Jiulongshan Formation",
  place: "Ningcheng County, Inner Mongolia, China",
  age: "Middle Jurassic, ~165 Ma (assemblage 157–165 Ma)",
  modern: { lat: 41.32, lon: 119.24 },
  palaeo: { lat: 42, note: "mid-latitude eastern Laurasia, north of the Tethys" },
  climate:
    "Warm temperate and wet — a lake margin under conifers, ginkgoaleans and " +
    "czekanowskialeans, with ferns and horsetails at the water. The default " +
    "air here (24 °C, 80 % RH) is a summer night in that forest.",
};

/**
 * The singers, in the order Gu et al. present them.
 *
 * Acoustic fields feed straight into the Rust kernel:
 *   carrierHz  — fc of the reconstructed syllable (their Fig. 4D).
 *   feaHz      — the wing's FEA eigenfrequency (their Fig. 3). Where the two
 *                differ, the file is driving the wing off its own resonance.
 *   q          — quality factor, −3 dB width of that syllable's spectrum.
 *                A mammalian cochlea resolves direction to about Q 9–13, so
 *                anything far above that is hard for a predator to place.
 *   teeth      — teeth on the file. With the strike rate this fixes the
 *                syllable length: the note lasts exactly as long as the
 *                traverse.
 *   file       — the SHAPE of the inter-tooth spacing, their Fig. 4B, as
 *                multipliers on the mean: `sweep`/`flare` for a rise toward
 *                the basal end, `ripple`/`rippleCycles` for a regular
 *                rise-and-fall, `jitter` for scatter, `pegs`/`pegRatio` for a
 *                bipartite file.
 *   opening    — these wings are symmetric, so the call is radiated on the
 *                opening stroke as well as the closing one.
 *   syllables / gapS / periodS / splDb / count — ours.
 */
export const SPECIES = [
  {
    id: "bacharaboilus-curvus",
    name: "Bacharaboilus curvus",
    family: "Prophalangopsidae",
    carrierHz: 5000,
    feaHz: 5000,
    q: 56.8,
    from: "published",
    teeth: 185,
    file: { sweep: 1.6, flare: 6, ripple: 0, rippleCycles: 0, jitter: 0.05, pegs: 0, pegRatio: 1 },
    fileNote:
      "The longest file in the assemblage: ~185 teeth held at an even ~50 µm " +
      "for almost the whole traverse, then flaring past 150 µm over the last " +
      "few. Even spacing is what a pure tone requires, and at Q 56.8 this is " +
      "one of the purest calls here.",
    opening: 0.75,
    strokeGapS: 0.014,
    syllables: 1,
    gapS: 0.05,
    periodS: 1.7,
    splDb: 91,
    count: 6,
    note:
      "Named in the paper as one of the low-frequency singers, and the clearest " +
      "case of a file built for purity: long, regular, and ringing at Q 56.8 — " +
      "four times sharper than a mammal can resolve a direction from.",
  },
  {
    id: "gurenia-caii",
    name: "Gurenia caii",
    family: "Haglidae",
    carrierHz: 5100,
    feaHz: 5900,
    q: 18.3,
    from: "published",
    teeth: 185,
    file: { sweep: 1.4, flare: 2.5, ripple: 0, rippleCycles: 0, jitter: 0.05, pegs: 0, pegRatio: 1 },
    fileNote:
      "~185 teeth whose spacing climbs steadily from about 20 µm to 80 µm — a " +
      "smooth, accelerating widening rather than the late flare of curvus, so " +
      "the call glides down through the whole stroke.",
    opening: 0.7,
    strokeGapS: 0.016,
    syllables: 1,
    gapS: 0.05,
    periodS: 2.4,
    splDb: 90,
    count: 4,
    note:
      "A haglid, and one of the three files the authors single out as built for " +
      "pure tones. Described as Liassophyllum caii by Gu & Ren in 2012; the " +
      "paper uses the Gurenia combination.",
  },
  {
    id: "aboilinae-sp1",
    name: "Aboilinae sp. 1",
    family: "Prophalangopsidae: Aboilinae",
    carrierHz: 6140,
    feaHz: 6000,
    q: 60,
    from: "published",
    teeth: 100,
    file: { sweep: 0.15, flare: 1, ripple: 0.1, rippleCycles: 2, jitter: 0.2, pegs: 0, pegRatio: 1 },
    fileNote:
      "~100 teeth at 60–110 µm with no clean trend — scattered, but scattered " +
      "around a stable mean, which is why the call still comes out at Q 60.",
    opening: 0.8,
    strokeGapS: 0.012,
    syllables: 1,
    gapS: 0.05,
    periodS: 1.4,
    splDb: 89,
    count: 7,
    note:
      "Undescribed — the paper carries it as Aboilinae sp. 1, a real specimen " +
      "without a species name yet. The sharpest resonance in the assemblage " +
      "alongside Aboilus stratosus.",
  },
  {
    id: "novaboilus-ovatus",
    name: "Novaboilus ovatus",
    family: "Prophalangopsidae",
    carrierHz: 5600,
    feaHz: 5600,
    q: 9,
    from: "published",
    teeth: 78,
    file: { sweep: 0.12, flare: 1, ripple: 0, rippleCycles: 0, jitter: 0.12, pegs: 0, pegRatio: 1 },
    fileNote: "~78 teeth at a wide and fairly even 90–100 µm.",
    opening: 0.7,
    strokeGapS: 0.012,
    syllables: 2,
    gapS: 0.04,
    periodS: 1.1,
    splDb: 88,
    count: 6,
    note:
      "Q 9 — the broadest call here, and the one sitting right inside the 9–13 " +
      "band a mammalian cochlea can resolve. If the eavesdropping argument is " +
      "right, this is the animal that was easiest to find.",
  },
  {
    id: "allaboilus-gigantus",
    name: "Allaboilus gigantus",
    family: "Prophalangopsidae",
    carrierHz: 4930,
    feaHz: 8800,
    q: 8.2,
    from: "published",
    teeth: 43,
    file: { sweep: 0.1, flare: 1, ripple: 0, rippleCycles: 0, jitter: 0.08, pegs: 8, pegRatio: 5 },
    fileNote:
      "A bipartite file, and the strangest instrument in the assemblage: about " +
      "eight enormously spaced pegs at 400–600 µm, then ~35 ordinary teeth at " +
      "~100 µm. At a steady scraper speed the pegs arrive as separate clicks " +
      "with the wing ringing down between each — then the file proper arrives " +
      "as one burst. You can hear the two halves of the wing.",
    opening: 0.6,
    strokeGapS: 0.02,
    syllables: 1,
    gapS: 0.06,
    periodS: 2.1,
    splDb: 90,
    count: 4,
    note:
      "The authors' showcase for an elaborated repertoire: two regions of the " +
      "same file doing two different jobs, a design that turns up independently " +
      "in living katydids and crickets. Its wing resonates at 8.8 kHz but the " +
      "file drives it to a 4.93 kHz call — the widest gap here between what " +
      "the wing wants and what the file gives it.",
  },
  {
    id: "novaboilus-multifurcatus",
    name: "Novaboilus multifurcatus",
    family: "Prophalangopsidae",
    carrierHz: 8300,
    feaHz: 10500,
    q: 25.6,
    from: "published",
    teeth: 85,
    file: { sweep: 0.18, flare: 1, ripple: 0, rippleCycles: 0, jitter: 0.14, pegs: 0, pegRatio: 1 },
    fileNote: "~85 teeth at 50–70 µm, mildly irregular, drifting a little wider toward the base.",
    opening: 0.7,
    strokeGapS: 0.01,
    syllables: 2,
    gapS: 0.03,
    periodS: 1.3,
    splDb: 87,
    count: 5,
    note:
      "One of the three the paper names as singing above 10 kHz — up where the " +
      "authors suggest callers were finding better transmission off the ground, " +
      "in the understorey or on a perch.",
  },
  {
    id: "archaboilus-polyneurus",
    name: "Archaboilus polyneurus",
    family: "Prophalangopsidae",
    carrierHz: 10200,
    feaHz: 13100,
    q: 36,
    from: "published",
    teeth: 92,
    file: { sweep: 0.12, flare: 1, ripple: 0.28, rippleCycles: 3, jitter: 0.06, pegs: 0, pegRatio: 1 },
    fileNote:
      "~92 teeth whose spacing rises and falls three times along the file, " +
      "between about 30 and 60 µm. Three specimens all show it, which is why " +
      "the authors read it as design rather than damage.",
    opening: 0.75,
    strokeGapS: 0.01,
    syllables: 3,
    gapS: 0.025,
    periodS: 1.2,
    splDb: 87,
    count: 5,
    note:
      "Mechanical frequency modulation, in the Jurassic. The regular ripple in " +
      "its file makes the strike rate rise and fall inside a single stroke, so " +
      "the call warbles — the same trick a modern leaf-mimicking katydid uses. " +
      "Listen for the wobble.",
  },
  {
    id: "aboilus-stratosus",
    name: "Aboilus stratosus",
    family: "Prophalangopsidae: Aboilinae",
    carrierHz: 10500,
    feaHz: 11800,
    q: 63,
    from: "published",
    teeth: 78,
    file: { sweep: 0.1, flare: 1, ripple: 0.08, rippleCycles: 2, jitter: 0.18, pegs: 0, pegRatio: 1 },
    fileNote: "~78 teeth at 60–90 µm, irregular tooth to tooth but with no overall trend.",
    opening: 0.75,
    strokeGapS: 0.01,
    syllables: 2,
    gapS: 0.03,
    periodS: 1.0,
    splDb: 88,
    count: 6,
    note:
      "The sharpest call in the assemblage at Q 63, and one of the three above " +
      "10 kHz. High, loud and almost impossible for a mammalian ear to place: " +
      "the anti-eavesdropping argument in one animal.",
  },
  {
    id: "sigmaboilus-peregrinus",
    name: "Sigmaboilus peregrinus",
    family: "Prophalangopsidae",
    carrierHz: 22500,
    feaHz: 20500,
    q: 18.9,
    from: "published",
    teeth: 50,
    file: { sweep: 0.7, flare: 1, ripple: 0, rippleCycles: 0, jitter: 0.08, pegs: 0, pegRatio: 1 },
    fileNote:
      "The shortest file here — only ~50 teeth, at 30–60 µm and widening " +
      "toward the base. Few teeth and a fast strike rate make for a very short " +
      "traverse: a couple of milliseconds of ultrasound per stroke.",
    opening: 0.8,
    strokeGapS: 0.008,
    syllables: 6,
    gapS: 0.012,
    periodS: 0.8,
    splDb: 86,
    count: 5,
    note:
      "The reason this page exists. Its call sits above the top of human " +
      "hearing — the oldest ultrasonic communication known from any animal, " +
      "165 million years and roughly 110 before the first bat. Turn the " +
      "detector on to hear it. Then look at how small its circle is: the air " +
      "erases ultrasound within a few tens of metres. Whatever it bought this " +
      "animal, it was not range.",
  },
];

/**
 * Ears.
 *
 * Each is a threshold curve: the quietest sound, in dB SPL, that this listener
 * can detect at a given frequency. The map turns it into a radius — the circle
 * inside which a given singer is audible TO THIS LISTENER — by asking the
 * kernel how far that call carries before it drops below the curve.
 *
 * Only the first is a measurement. The Jurassic ears are the argument the paper
 * is making, rendered as numbers so you can play with it. Gu et al. are careful
 * here and so are we: they conclude only that "early mammals and non-mammalian
 * ancestors were also listening in", and explicitly reject bats as the sole
 * driver. Treat the last three as three positions in an open debate.
 */
export const EARS = [
  {
    id: "human",
    label: "You",
    from: "measured",
    kind: "absolute",
    blurb:
      "A typical adult human audiogram. Superb from 1–4 kHz, and falling off a " +
      "cliff above 14 kHz — which is why the ultrasonic singer is a silent dot " +
      "on your map until you switch the detector on.",
    curve: [
      [125, 20], [250, 12], [500, 7], [1000, 4], [2000, 1], [4000, 3],
      [8000, 10], [10000, 15], [12500, 24], [14000, 34], [16000, 50],
      [18000, 72], [20000, 92], [25000, 120],
    ],
  },
  {
    id: "female",
    label: "A female of his own species",
    from: "hypothesis",
    kind: "conspecific",
    blurb:
      "The audience the song is actually for. Extant Prophalangopsidae have a " +
      "simple inner ear — a plesiomorphic crista acustica, no fluid-filled " +
      "vesicle, an unspecialised bifurcated trachea — and the paper notes they " +
      "detect below about 13 kHz. Modelled as most sensitive at whatever the " +
      "male is singing and about 22 dB worse an octave either side. Switch to " +
      "it and every circle is roughly the animal's true broadcast range.",
    best: 38,
    perOctave: 22,
  },
  {
    id: "mammaliaform",
    label: "An early mammal",
    from: "hypothesis",
    kind: "absolute",
    blurb:
      "The eavesdropper in the paper's argument. Daohugou is full of small " +
      "mammaliaforms, and high-frequency hearing is thought to have been " +
      "present in nocturnal mammalian ancestors long before bat echolocation. " +
      "This curve is a small extant insectivore's, borrowed wholesale — no " +
      "Jurassic audiogram exists or can. Note what it does to the ultrasonic " +
      "circle: if this ear is right, calling above 20 kHz did not hide anyone " +
      "from THIS listener. Which is the paper's point — the pitch was never the " +
      "whole defence.",
    curve: [
      [500, 70], [1000, 52], [2000, 40], [5000, 18], [10000, 10],
      [20000, 8], [40000, 15], [60000, 35], [80000, 60],
    ],
  },
  {
    id: "archosaur",
    label: "A pterosaur or small theropod",
    from: "hypothesis",
    kind: "absolute",
    blurb:
      "The other predator, and the contrast that makes the story work. " +
      "Archosaur hearing is good at low frequencies and gone by 8 kHz. Against " +
      "this ear, ultrasound is genuinely private — every circle above 12 kHz " +
      "collapses to nothing. Which of these two ears mattered more in the " +
      "Jurassic is the question the fossils cannot answer.",
    curve: [
      [125, 35], [250, 22], [500, 14], [1000, 12], [2000, 18], [3000, 28],
      [5000, 48], [8000, 75], [12000, 105], [20000, 140],
    ],
  },
];

/**
 * The band of quality factors a mammalian cochlea can resolve a direction
 * within — Gu et al. put it at Q ≈ 9–13, and that number is the hinge of their
 * pure-tone argument: a call much sharper than this is hard for a mammal to
 * place, so narrowing the band is a way to sing loudly and still not be found.
 * Five of these nine sit far above it.
 */
export const MAMMAL_LOCALISATION_Q = { lo: 9, hi: 13, from: "published" };

/** Threshold in dB SPL for `ear` at `f` Hz, log-interpolated between knots. */
export function threshold(ear, f, carrierHz) {
  if (ear.kind === "conspecific") {
    const octaves = Math.abs(Math.log2(f / (carrierHz || f)));
    return ear.best + ear.perOctave * octaves;
  }
  const c = ear.curve;
  if (f <= c[0][0]) return c[0][1];
  for (let i = 1; i < c.length; i++) {
    if (f <= c[i][0]) {
      const t = (Math.log(f) - Math.log(c[i - 1][0])) / (Math.log(c[i][0]) - Math.log(c[i - 1][0]));
      return c[i - 1][1] + t * (c[i][1] - c[i - 1][1]);
    }
  }
  // Past the last knot, keep climbing at the final slope — hearing does not
  // plateau at the top, it stops.
  const n = c.length;
  const slope = (c[n - 1][1] - c[n - 2][1]) / (Math.log(c[n - 1][0]) - Math.log(c[n - 2][0]));
  return c[n - 1][1] + slope * (Math.log(f) - Math.log(c[n - 1][0]));
}

/**
 * The plants, for the map. Daohugou's flora is well described and it is not a
 * jungle: conifers and ginkgoaleans over ferns and horsetails, at a lake edge.
 */
export const FLORA = [
  { id: "conifer", name: "Pityocladus / Elatocladus", w: 30, r: 2.6, kind: "tree" },
  { id: "ginkgo", name: "Yimaia / Ginkgoites", w: 18, r: 2.3, kind: "tree" },
  { id: "czek", name: "Czekanowskia", w: 14, r: 1.8, kind: "tree" },
  { id: "bennett", name: "Bennettitales", w: 10, r: 1.7, kind: "shrub" },
  { id: "fern", name: "Coniopteris and other ferns", w: 34, r: 1.0, kind: "ground" },
  { id: "horsetail", name: "Equisetum", w: 16, r: 0.7, kind: "ground" },
];

/** Total voices the roster asks for — must fit the kernel's MAX_VOICES. */
export const TOTAL_VOICES = SPECIES.reduce((n, s) => n + s.count, 0);

/** Extent of the plot, metres. The listener starts in the middle. */
export const PLOT_M = 180;
