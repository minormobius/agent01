/* jurassic — the Daohugou roster, the ears that might have been listening, and
 * the plants in between.
 *
 * ── Read this before trusting a number on the screen ────────────────────────
 *
 * This file is the ONLY place any palaeontology lives. The Rust kernel knows
 * about resonators and air; it has never heard of an insect. That split is on
 * purpose, because this table is the arguable part and the physics is not.
 *
 * Every acoustic parameter carries a `from` tag, and the site shows it:
 *
 *   "measured"  — published for THIS fossil, in the cited paper.
 *   "modelled"  — our value. Consistent with the assemblage as described, and
 *                 with how stridulation works, but nobody measured it. Treat it
 *                 as a plausible voice for a real animal, not as a result.
 *   "hypothesis"— a claim about something that does not fossilise at all,
 *                 chiefly what a Jurassic ear could hear. Argument, not datum.
 *
 * Exactly two carrier frequencies here are "measured". Everything else that
 * makes a sound is "modelled". A site that blurred that line would be a much
 * better demo and a much worse thing to have made.
 *
 * Sources:
 *   Gu, Engel & Ren 2012, PNAS 109:3868 — Archaboilus musicus, 6.4 kHz, file
 *     of 107 teeth over 9.34 mm. The frequency, the tooth count and the
 *     forewing length below are theirs.
 *   Gu et al. 2026, PNAS 123(36):e2615107123 — the assemblage paper: nine
 *     singing species from the Jiulongshan Formation, most calling in pure
 *     tone near 5 kHz, and Sigmaboilus peregrinus above 20 kHz, the oldest
 *     ultrasound known. Paywalled at the time of writing; the two figures we
 *     take from it are the ones its press coverage states outright, and no
 *     per-species table from it has been transcribed here.
 *
 * The nine taxa below are described singing ensiferans from the Daohugou beds.
 * They are the fauna the 2026 paper drew from; they are NOT a transcription of
 * that paper's particular nine, which we could not read.
 */

/** Where and when. Everything on the map is this one bed. */
export const LOCALITY = {
  bed: "Daohugou beds, Jiulongshan Formation",
  place: "Ningcheng County, Inner Mongolia, China",
  age: "Middle Jurassic, Bathonian–Callovian, ~165 Ma",
  // Modern coordinates of the fossil locality.
  modern: { lat: 41.32, lon: 119.24 },
  // Palaeolatitude of the North China Block in the Bathonian. Reconstructions
  // differ by several degrees; this is a mid-range figure, not a measurement.
  palaeo: { lat: 42, note: "mid-latitude eastern Laurasia, north of the Tethys" },
  climate:
    "Warm temperate and wet — a lake margin under conifers, ginkgoaleans and " +
    "czekanowskialeans, with ferns and horsetails at the water. The default " +
    "air here (24 °C, 80 % RH) is a summer night in that forest.",
};

/**
 * The singers.
 *
 * Acoustic fields feed straight into the Rust kernel:
 *   carrierHz  — mirror-cell resonance: the pitch you hear.
 *   q          — resonator sharpness. >30 pure tone, <20 a rasp.
 *   toothRate  — tooth strikes per second. Equal to carrierHz for a resonant
 *                stridulator, which is how all of these are modelled.
 *   teeth      — teeth engaged per closing stroke. With toothRate this fixes
 *                the syllable length: the note lasts exactly as long as the
 *                scraper takes to cross the file.
 *   sweep      — fractional glide in strike rate across the stroke.
 *   jitter     — scatter in tooth spacing, 0–1. Musicality, inverted.
 *   syllables / gapS / periodS — the rhythm of a chirp and its repeat.
 *   splDb      — source level at 1 m. Extant katydids run 75–100 dB.
 *   count      — individuals placed on the map.
 */
export const SPECIES = [
  {
    id: "archaboilus-musicus",
    name: "Archaboilus musicus",
    author: "Gu, Engel & Ren, 2012",
    family: "Prophalangopsidae: Cyrtophyllitinae",
    familyNote:
      "Cyrtophyllitinae is placed in Haglidae by some authors and in " +
      "Prophalangopsidae by others; the disagreement is live.",
    carrierHz: 6400,
    from: "measured",
    cite: "Gu, Engel & Ren 2012, PNAS 109:3868",
    q: 32,
    toothRate: 6400,
    teeth: 107,
    sweep: 0.06,
    jitter: 0.03,
    syllables: 1,
    gapS: 0.05,
    periodS: 1.6,
    splDb: 92,
    count: 6,
    forewingMm: 72,
    fileMm: 9.34,
    note:
      "The one voice here that is not our invention. A 72 mm forewing with 107 " +
      "teeth over 9.34 mm of file, and a call its describers put at 6.4 kHz — " +
      "pure, low, and carrying, the first extinct animal whose song was " +
      "reconstructed from the instrument that made it.",
  },
  {
    id: "archaboilus-polyneurus",
    name: "Archaboilus polyneurus",
    author: "Gu, Qiao & Ren, 2012",
    family: "Prophalangopsidae: Cyrtophyllitinae",
    carrierHz: 5600,
    from: "modelled",
    q: 28,
    toothRate: 5600,
    teeth: 96,
    sweep: 0.07,
    jitter: 0.04,
    syllables: 2,
    gapS: 0.06,
    periodS: 2.2,
    splDb: 90,
    count: 4,
    note:
      "Congener of musicus, and modelled as a near neighbour of it: a shorter " +
      "file, a slightly higher note, paired syllables.",
  },
  {
    id: "aboilus-stratosus",
    name: "Aboilus stratosus",
    author: "Li, Ren & Wang, 2007",
    family: "Prophalangopsidae: Aboilinae",
    carrierHz: 4800,
    from: "modelled",
    q: 22,
    toothRate: 4800,
    teeth: 120,
    sweep: 0.12,
    jitter: 0.06,
    syllables: 3,
    gapS: 0.04,
    periodS: 1.1,
    splDb: 88,
    count: 7,
    note:
      "Modelled with a longer, less regular file than the Archaboilus pair: " +
      "the same mechanism, run coarser, giving a broader and buzzier note. " +
      "The commonest thing you hear at the bottom of the band.",
  },
  {
    id: "ashangopsis-daohugouensis",
    name: "Ashangopsis daohugouensis",
    author: "Lin, Huang & Nel, 2008",
    family: "Prophalangopsidae: Chifengiinae",
    carrierHz: 7200,
    from: "modelled",
    q: 18,
    toothRate: 7200,
    teeth: 70,
    sweep: 0.16,
    jitter: 0.09,
    syllables: 4,
    gapS: 0.03,
    periodS: 0.9,
    splDb: 84,
    count: 9,
    note:
      "Its stridulatory veins occupy only the cubital area, not the anal area " +
      "as in other Chifengiinae — a smaller instrument, so it is modelled " +
      "small and high and quick: the ticking layer of the chorus.",
  },
  {
    id: "sigmaboilus-peregrinus",
    name: "Sigmaboilus peregrinus",
    author: "Gu, Qiao & Ren, 2010",
    family: "Prophalangopsidae: Aboilinae",
    carrierHz: 21000,
    from: "measured",
    cite: "Gu et al. 2026, PNAS 123(36):e2615107123 (20–22 kHz)",
    q: 45,
    toothRate: 21000,
    teeth: 55,
    sweep: 0.04,
    jitter: 0.02,
    syllables: 6,
    gapS: 0.012,
    periodS: 0.7,
    splDb: 86,
    count: 5,
    note:
      "The reason this page exists. Its call sits above the top of human " +
      "hearing — the oldest ultrasound known from any animal, 165 million " +
      "years before a bat. Turn the detector on to hear it. Then look at how " +
      "small its circle is: ultrasound is a whisper that the air erases within " +
      "a few tens of metres. Whatever it bought this animal, it was not range.",
  },
  {
    id: "sigmaboilus-fuscus",
    name: "Sigmaboilus fuscus",
    author: "Gu, Qiao & Ren, 2010",
    family: "Prophalangopsidae: Aboilinae",
    carrierHz: 5200,
    from: "modelled",
    q: 26,
    toothRate: 5200,
    teeth: 100,
    sweep: 0.08,
    jitter: 0.05,
    syllables: 2,
    gapS: 0.05,
    periodS: 1.8,
    splDb: 89,
    count: 5,
    note:
      "Described alongside peregrinus, and modelled where its congener is not: " +
      "in the ordinary 5 kHz band that most of this assemblage shares.",
  },
  {
    id: "sigmaboilus-calophlebius",
    name: "Sigmaboilus calophlebius",
    author: "Gu, Qiao & Ren, 2012",
    family: "Prophalangopsidae: Aboilinae",
    carrierHz: 4400,
    from: "modelled",
    q: 30,
    toothRate: 4400,
    teeth: 130,
    sweep: 0.05,
    jitter: 0.03,
    syllables: 1,
    gapS: 0.05,
    periodS: 2.6,
    splDb: 91,
    count: 3,
    note:
      "Modelled as the long-file, long-interval singer: one slow pure note " +
      "every two and a half seconds, the loudest and lowest of the Sigmaboilus.",
  },
  {
    id: "sigmaboilus-gorochovi",
    name: "Sigmaboilus gorochovi",
    author: "Fang, Zhang, Wang & Zhang, 2007",
    family: "Prophalangopsidae: Aboilinae",
    carrierHz: 5900,
    from: "modelled",
    q: 24,
    toothRate: 5900,
    teeth: 88,
    sweep: 0.1,
    jitter: 0.05,
    syllables: 3,
    gapS: 0.035,
    periodS: 1.3,
    splDb: 87,
    count: 6,
    note: "The type species of the genus. Modelled mid-band, in triplets.",
  },
  {
    id: "liassophyllum-caii",
    name: "Liassophyllum caii",
    author: "Gu & Ren, 2012",
    family: "Haglidae: Cyrtophyllitinae",
    carrierHz: 3800,
    from: "modelled",
    q: 20,
    toothRate: 3800,
    teeth: 150,
    sweep: 0.18,
    jitter: 0.08,
    syllables: 2,
    gapS: 0.08,
    periodS: 2.9,
    splDb: 90,
    count: 3,
    note:
      "The haglid, and the bass of the forest: a big animal with a long, " +
      "coarse file, modelled as the one broadband rasp among eight pure tones. " +
      "It is also the only voice a modern human hears at full strength across " +
      "the whole plot.",
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
 * Only the first one is a measurement. The Jurassic ears are the argument the
 * 2026 paper is making, rendered as numbers so you can play with it; a
 * mammaliaform audiogram is an inference from cochlear anatomy, and an
 * archosaur one is worse than that. Treat the last three as three positions in
 * an open debate that you can switch between, and watch what each implies.
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
      "The audience the song is actually for. Ensiferan tympanal organs are " +
      "broadly tuned near the conspecific carrier, so this ear is modelled as " +
      "most sensitive at whatever the male is singing and worse by about 22 dB " +
      "an octave either side. Switch to it and every circle is roughly the " +
      "animal's true broadcast range — the ultrasonic one included.",
    best: 38,
    perOctave: 22,
  },
  {
    id: "mammaliaform",
    label: "An early mammal",
    from: "hypothesis",
    kind: "absolute",
    blurb:
      "The predator in the 2026 paper's argument. Daohugou is full of small " +
      "mammaliaforms, and a mammalian middle ear with a coiled cochlea buys " +
      "high-frequency hearing that no archosaur had. This curve is a small " +
      "extant insectivore's, borrowed wholesale — no Jurassic audiogram exists " +
      "or can. Note what it does to the ultrasonic circle: if this ear is " +
      "right, calling above 20 kHz did not hide anyone from THIS listener.",
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
      "collapses to nothing. Which of these two ears the Jurassic actually " +
      "held is the question the fossils cannot answer.",
    curve: [
      [125, 35], [250, 22], [500, 14], [1000, 12], [2000, 18], [3000, 28],
      [5000, 48], [8000, 75], [12000, 105], [20000, 140],
    ],
  },
];

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
 * `w` is relative abundance, `r` the drawn radius in metres, `hue` the tint.
 */
export const FLORA = [
  { id: "conifer", name: "Pityocladus / Elatocladus", w: 30, r: 2.6, hue: 152, kind: "tree" },
  { id: "ginkgo", name: "Yimaia / Ginkgoites", w: 18, r: 2.3, hue: 96, kind: "tree" },
  { id: "czek", name: "Czekanowskia", w: 14, r: 1.8, hue: 122, kind: "tree" },
  { id: "bennett", name: "Bennettitales", w: 10, r: 1.7, hue: 78, kind: "shrub" },
  { id: "fern", name: "Coniopteris and other ferns", w: 34, r: 1.0, hue: 138, kind: "ground" },
  { id: "horsetail", name: "Equisetum", w: 16, r: 0.7, hue: 168, kind: "ground" },
];

/** Total voices the roster asks for — must fit the kernel's MAX_VOICES. */
export const TOTAL_VOICES = SPECIES.reduce((n, s) => n + s.count, 0);

/** Extent of the plot, metres. The listener starts in the middle. */
export const PLOT_M = 180;
