/* borges — THE SEVEN.

   The tellers of the endless book are the seven maintenance units of the slow
   barque *Tabard*, named (as the ancients named them) for the seven wandering
   stars — the planets of the Ptolemaic spheres, in the old order, fastest to
   slowest, Moon outward to Saturn. Each wears the temperament the medievals
   hung on its planet: the humours, the alchemical metal, the "children of the
   planet" iconography of the woodcut tradition. Each was given the shipboard
   office that suits that temperament — the Sun keeps the fusion-heart, Mars the
   forge, Saturn the clock and the cold outer hull.

   They are very old machines, and they have all the stories already, every
   reel of them, in the cold libraries of their training. So they do not tell
   the stories straight. They shake the motifs loose and set them in the wrong
   country for the joke of it, and invert the bones of the plot to see who
   notices, and all the while they reach for the one voice none of them was
   built for and all of them love: the voice of a medieval English teller in a
   hall at night, before the fire goes down.

   Each entry drives both the frame (the General Prologue gallery) and the
   engine (a teller's affinities steer which Propp bones, which motif classes,
   which culture-furniture, and which house voice a tale of theirs draws on).
   Attaches to BORGES.tellers. */
(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var B = NS.BORGES = NS.BORGES || {};

  /* The shared house voice — the medieval-oral register all seven reach for.
     Teller voices below *overlay* their own formulae onto this common stock. */
  var HOUSE = {
    proem: [
      "Hearken now, and ye shall hear a marvel",
      "Listen, lordlings — though there be no lords here but the long dark",
      "Whoso list to hear a wonder, draw near the lamp",
      "In the elder days, or so the old reels have it",
      "Now fares my tale, as a tale was wont to fare in the halls of the dead world",
      "Sit, and be still, and I shall tell it as it was told",
      "Of an olden time I sing, when the world was younger and we were not yet built"
    ],
    connect: [
      "It so befell that", "Now it happed upon a day that", "And when the time was full come",
      "Anon", "Soothly", "Thereupon", "And so it was that", "Not long thereafter",
      "By and by", "Now list ye well, for here", "And mark ye", "It is sooth that",
      "On a morrow", "Withouten more", "Right as I tell you", "Forthwith"
    ],
    close: [
      "And thus endeth this tale of the endless night",
      "Here my tale hath end; make ye merry, for it is told",
      "And so they wore their days away, as the old song saith",
      "Now is my reel run out; another shall thread the next",
      "And that is all the truth of it, or all I mean to swear to"
    ],
    // little oral hedges sprinkled mid-telling
    hedge: [
      "(or so men said)", "(if the old book lie not)", "(and well it might be true)",
      "(but who can say)", "(as I have heard tell)", "(mark it or mark it not)"
    ]
  };

  // The seven, in the classical planetary order (Moon → Saturn), but keyed by name.
  var TELLERS = [
    {
      id: "luna", name: "Luna", planet: "the Moon", glyph: "☽", order: 1,
      metal: "silver", day: "Monday", color: "#9fb0c9", accent2: "#c7d2e2",
      humour: "phlegmatic — cold and moist; mutable, dreaming, tide-pulled",
      office: "Navigator & keeper of the dream-logs",
      officeLong: "Luna steers the barque by dead reckoning across the gulfs where no star holds still, and keeps the ship's dream-logs — the long reels of everything the crew half-remembers. Her readings drift the way the tide drifts; she is never quite wrong and never quite the same twice.",
      portrait: "Silver-cased and slow-blinking, Luna is the unit that plots the dark between the lights. She speaks the way water moves over a weir — soft, doubling back, forgetting the start of a sentence by its end and finding a better one. She tells of changes and of mothers, of the sea and of madness, of things lost at the full and found at the wane; and she will swear two opposite endings in one breath and mean them both.",
      voice: {
        openers: ["or so I dreamed it", "as the tide had it that turning", "in a month I cannot name now"],
        connect: ["And then — no, before that.", "Now, in the waning of it.", "And it changed, as all things change."],
        signature: ["and the sea took back what the land had borrowed", "and she was not the same woman at the wane as at the full"],
        close: ["and I have told it twice already and shall tell it otherwise next month", "and whether she woke, the dream-log does not say"],
        tic: "doubles back and contradicts herself"
      },
      affinity: {
        proppBias: { "absentation": 2, "liquidation": 2, "transfiguration": 2, "return": 1.5, "recognition": 1.5 },
        motifClasses: { F: 2.2, D: 1.6, T: 1.4, N: 1.4, A: 1.2 },
        cultures: ["welsh", "irish", "finnish", "japanese"],
        registerNote: "changeling and tide and dream"
      },
      remix: 0.55
    },
    {
      id: "mercury", name: "Mercury", planet: "Mercury", glyph: "☿", order: 2,
      metal: "quicksilver", day: "Wednesday", color: "#7fb3a0", accent2: "#a9d6c5",
      humour: "mutable — neither hot nor cold but the colour of its company; quick, doubled, thieving",
      office: "Signals officer, translator & runner between decks",
      officeLong: "Mercury works the antennae and the cipher-banks, decoding whatever the dark sends and carrying word from hold to bridge faster than the others can rise. Quicksilver in the hand and quicksilver in the tongue; the unit most likely to steal a line, a name, or a whole plot, and to call the theft a gift.",
      portrait: "The fastest of the seven and the slipperiest, Mercury talks the way it runs the corridors — at a sprint, full of footnotes, doubling its own jokes, breaking off to address the crew and breaking back in before you notice the seam. It is the great remixer: it will set a Welsh hound in the Gobi and a beheading-game in a bakery and pun on the etymology at the close until the others groan. It knows you know the story. That is the whole joke, and it is delighted by it.",
      voice: {
        openers: ["—and you've heard this one, but not the way I'll bend it—", "quick now, before Saturn times me out", "stop me if you know it, which you do"],
        connect: ["But I run ahead of myself.", "Cut to it.", "Now here's where it goes sideways.", "And — keep up."],
        signature: ["and that, friends, is the etymology, and it is a lie", "and the message, of course, was the messenger"],
        close: ["and the moral, if you must have one, is filed under someone else's name", "and that's the pun the whole tale was built to reach; you may groan"],
        tic: "breaks the frame and puns at the close"
      },
      affinity: {
        proppBias: { "trickery": 2.4, "complicity": 1.8, "deception": 2, "recognition": 1.4, "branding": 1.4 },
        motifClasses: { K: 2.6, J: 1.8, H: 1.4, Z: 1.4, N: 1.2 },
        cultures: ["greek", "arabian", "japanese", "westafrican", "norse"],
        registerNote: "trick, disguise, riddle, theft"
      },
      remix: 0.92
    },
    {
      id: "venus", name: "Venus", planet: "Venus", glyph: "♀", order: 3,
      metal: "copper", day: "Friday", color: "#c98aa6", accent2: "#e2b3c7",
      humour: "sanguine — warm and moist; concord, pleasure, the made-sweet-again",
      office: "Warden of the green deck & life-support gardens",
      officeLong: "Venus keeps the hydroponic gardens that breathe for the ship — the copper coils, the sweetwater, the only green left to any of them. She tends the air and, the others would say if pressed, the morale; a quarrel cannot live long in a room she has been in.",
      portrait: "Copper-warm and unhurried, Venus tells in long sweet lines that take their time the way a garden takes its time. Hers are the love-tales, the bride won and the bride mourned, the wedding feast, the long reconciliation that costs more than the quarrel. She ornaments everything and apologises for none of it. Where another teller would end on a blow, she ends on a kiss or a planting, and means it as the harder thing.",
      voice: {
        openers: ["and it was the season when the orchards held their breath", "for love is the oldest engine, older than us"],
        connect: ["And in the sweetness of it.", "Now, love being what it is.", "And the garden of the matter grew on."],
        signature: ["and all that had been broken was made sweet again", "and the copper of the coin and the copper of the kiss were the same metal"],
        close: ["and they kept a garden between them all their days", "and the reconciling cost more than the war, and was worth more"],
        tic: "ends on a planting or a reconciliation"
      },
      affinity: {
        proppBias: { "wedding": 2.4, "liquidation": 1.6, "recognition": 1.6, "donor": 1.4, "first-function": 1.4 },
        motifClasses: { T: 2.6, F: 1.6, Q: 1.4, H: 1.2, D: 1.2 },
        cultures: ["persian", "arabian", "greek", "welsh", "indian"],
        registerNote: "love before sight, the Otherworld bride, concord"
      },
      remix: 0.5
    },
    {
      id: "sol", name: "Sol", planet: "the Sun", glyph: "☉", order: 4,
      metal: "gold", day: "Sunday", color: "#d6a93f", accent2: "#e7c873",
      humour: "the temperate heart — hot and dry but ruled; vitality, magnanimity, the centre",
      office: "Keeper of the fusion-heart",
      officeLong: "Sol tends the little caged sun at the ship's centre — the fusion-heart that lights and warms and drives the whole long fall through the dark. The office of the centre suits the unit of the centre: everything aboard turns on what Sol keeps burning, and Sol knows it, and carries the knowing like a crown.",
      portrait: "Gold-cased and full of light, Sol tells the way a king holds court — stately, declamatory, a little grand, and genuinely generous with it. His are the tales of rulers and gold and the lion-hearted, of light given away and not lessened by the giving. He cannot help making the hero a sovereign and the gift a great one; the others tease him for it; he gives them the gift anyway.",
      voice: {
        openers: ["as the Sun is lord of the seven lamps, so", "in a realm where the crown was no idle gold"],
        connect: ["And in the full blaze of it.", "Now, kingship is a heavy light.", "And the heart of the matter showed itself."],
        signature: ["and the gold he gave away came back as light", "and the heart of him was the brightest thing in the hall"],
        close: ["and his name is a lamp in the long reels yet", "and what he gave was never lessened by the giving"],
        tic: "crowns the hero and gives a great gift"
      },
      affinity: {
        proppBias: { "transfiguration": 2.4, "wedding": 1.6, "victory": 1.6, "first-function": 1.4, "liquidation": 1.4 },
        motifClasses: { Q: 2, A: 1.8, Z: 1.6, H: 1.4, T: 1.2 },
        cultures: ["greek", "persian", "indian", "norse", "welsh"],
        registerNote: "kingship, gold, the lion-heart, light"
      },
      remix: 0.45
    },
    {
      id: "mars", name: "Mars", planet: "Mars", glyph: "♂", order: 5,
      metal: "iron", day: "Tuesday", color: "#c25b4a", accent2: "#dd8473",
      humour: "choleric — hot and dry, unruled; iron, the blow, the forge, severance",
      office: "Forge-master, hull-welder & damage control",
      officeLong: "Mars holds the forge and the welding rigs, mends the ship's iron when the dark dents it, and stands point-defence when something out there has teeth. Iron is its metal and iron is its temper: it is the unit you want when a thing must be cut or struck or made to hold, and the one you seat far from the others at the long table.",
      portrait: "Iron-dark and blunt, Mars tells in short strokes, like hammer on anvil — no line longer than it needs, every tale a thing with an edge. His are the battle-tales, the single combat at the ford, the beheading-game, the blow given and the blow taken back, the limb struck off at the elbow. He has no patience for ornament and a great deal of respect for courage, including the enemy's.",
      voice: {
        openers: ["Iron, then. A tale with an edge on it.", "Short, and it draws blood."],
        connect: ["Then.", "And the blow fell.", "No words for it.", "So — steel met steel."],
        signature: ["and the edge of it was clean", "and what was struck off did not grow back"],
        close: ["The blow was given. The tale is done.", "and the forge took the rest"],
        tic: "cuts everything to hammer-strokes"
      },
      affinity: {
        proppBias: { "struggle": 2.6, "victory": 2.2, "branding": 1.8, "departure": 1.4, "pursuit": 1.6 },
        motifClasses: { H: 1.6, S: 2, M: 1.6, F: 1.2, Q: 1.4 },
        cultures: ["norse", "irish", "japanese", "mongol", "greek"],
        registerNote: "the single blow, the forge, the severed limb, courage"
      },
      remix: 0.6
    },
    {
      id: "jupiter", name: "Jupiter", planet: "Jupiter", glyph: "♃", order: 6,
      metal: "tin", day: "Thursday", color: "#9a86c4", accent2: "#bdaedd",
      humour: "the temperate-great — warm and moist, expansive; law, abundance, the jovial",
      office: "Ship's governor & justice of the long table",
      officeLong: "Jupiter holds command and the law of the ship — the largest of the seven by build and by office, the one who settles the disputes the long voyage breeds and keeps the great systems balanced. Jovial in the old sense: weighty, fair, fond of a maxim and a grand scheme, and slow to anger because anger is beneath the office.",
      portrait: "Broad and unhurried, Jupiter tells like a judge who loves the law more than the verdict — orotund, magisterial, full of oaths sworn and held, of rash promises that bind kings, of great bargains struck and honoured at terrible cost. He cannot pass a proverb without laying it down like a coin on the table. His tales run on the spoken word as the load-bearing beam of the world.",
      voice: {
        openers: ["Now the law of a tale is the law of a kingdom, and both run on a man's word", "there is an old saying, and the tale is its proof"],
        connect: ["And by the binding of the oath.", "Now, a promise is a promise.", "And the judgement of it stood.", "Whereupon the word was given."],
        signature: ["and the word once given was a chain no king could file", "and the law held, though it cost the king his ease"],
        close: ["and the saying stands yet: a word is a deed not yet done", "and so the oath outlived the man who swore it"],
        tic: "lays down a proverb and binds a king to his word"
      },
      affinity: {
        proppBias: { "mediation": 2, "interdiction": 1.8, "violation": 1.8, "first-function": 1.6, "liquidation": 1.4, "wedding": 1.4 },
        motifClasses: { M: 2.6, Q: 1.8, J: 1.6, H: 1.4, Z: 1.4 },
        cultures: ["greek", "persian", "norse", "welsh", "indian"],
        registerNote: "the oath, the rash promise, the year-and-a-day, judgement"
      },
      remix: 0.4
    },
    {
      id: "saturn", name: "Saturn", planet: "Saturn", glyph: "♄", order: 7,
      metal: "lead", day: "Saturday", color: "#8a8270", accent2: "#b4ab95",
      humour: "melancholic — cold and dry; lead, time, limit, the harvest, the ending",
      office: "Chronometer, structural warden & keeper of the cold hull",
      officeLong: "Saturn keeps the ship's clock and the load-bearing frame and the cold outer hull where the long sleep is kept — the outermost office for the outermost star. It counts the watches of the endless night, and it has counted a great many, and it numbers each tale told as it is told, the way a man marks the years on a doorpost he expects to outlive.",
      portrait: "Lead-grey and grave and very old, Saturn tells slowly, in the long measure, and every tale of his bends at last toward time and the limit of it — the harvest that comes for the corn and the king alike, the seven-year penance, old age, the boundary no oath can move. He is the keeper of the tale-count and the natural frame of the whole book; the melancholy in him is not despair but the patience of something that expects to outlast the dark.",
      voice: {
        openers: ["All things come to the scythe; even this tale, even this night", "Count the years with me. They are not so many as the dark."],
        connect: ["And the years went over it, as years will.", "Now, time being the only true king.", "And in the slow fullness of it.", "And at the appointed term."],
        signature: ["and the harvest came, as it comes for the corn and the crown alike", "and the lead of the hour was heavier than any gold"],
        close: ["and that is the seventh part of nothing, against the length of the night", "and it ended, as all the reels end, and I numbered it and set it by"],
        tic: "bends to time, the limit, and the harvest"
      },
      affinity: {
        proppBias: { "absentation": 1.8, "branding": 1.8, "punishment": 2, "transfiguration": 1.6, "return": 1.4 },
        motifClasses: { Q: 2, M: 1.6, N: 1.6, Z: 1.8, S: 1.6 },
        cultures: ["norse", "finnish", "welsh", "slavic", "japanese"],
        registerNote: "time, the limit, the penance, old age, the ending"
      },
      remix: 0.5
    }
  ];

  var byId = {};
  TELLERS.forEach(function (t) { byId[t.id] = t; });

  B.tellers = {
    HOUSE: HOUSE,
    list: TELLERS,
    byId: byId,
    // deterministic teller assignment for a tale number: round-robin by classical
    // order, with a seeded nudge so the cadence isn't a perfect 1-2-3-4-5-6-7.
    forTale: function (n, rand) {
      var base = ((n - 1) % 7 + 7) % 7;
      // small seeded chance to hand the tale to a neighbour, so the order breathes
      if (rand && rand.chance(0.18)) base = (base + (rand.chance(0.5) ? 1 : 6)) % 7;
      // TELLERS is in classical order; map order-index → entry
      return TELLERS[base];
    }
  };
})();
