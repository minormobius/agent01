/* ============================================================================
   FIPO / pitch — the pitch-genome engine.

   The premise: bad science-fiction cinema is not noise. It is a small,
   structured region of movie-space — the space of pitches somebody thought
   would sell, filtered through a producer's greed and a decade's anxieties.
   Bad art is legible failed intent. This engine samples that region.

   Design rules (from the FIPO charter):
   - Genome first. The title is DERIVED from the pitch, never authored.
   - The causal order of production is a field (AIP tested titles before
     commissioning pictures; Cannon sold posters before scripts existed).
   - Failure modes are period-locked: the 50s fail differently than the 90s.
   - The interesting corner is sincere: high earnestness, high ambition, low
     competence, true belief. Cynical incompetence is a different, duller basin.
   - Every specimen carries THE COMMITMENT: one bizarre specific choice.
     Blandness is the only unforgivable sin, so it is not optional.
   - Deterministic: a seed is a permalink. No Date.now, no Math.random.

   Pure JS, no deps, attaches to globalThis (browser + node selftest).
   ============================================================================ */
(function (global) {
  'use strict';

  var SCHEMA_VERSION = 1;

  /* ---------------------------------------------------------------- PRNG -- */
  // xmur3 + mulberry32 — the repo convention (borges, rite/names, rite/org).
  function xmur3(str) {
    var h = 1779033703 ^ str.length;
    for (var i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      h ^= h >>> 16;
      return h >>> 0;
    };
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function rngFor(seed) {
    return mulberry32(xmur3('fipo/pitch/' + String(seed))());
  }
  function pick(r, arr) { return arr[Math.floor(r() * arr.length)]; }
  function chance(r, p) { return r() < p; }
  function rf(r, lo, hi) { return lo + (hi - lo) * r(); }
  // Weighted pick over objects: wfn(item) -> number (0 = never)
  function wpick(r, arr, wfn) {
    var tot = 0, i, w;
    for (i = 0; i < arr.length; i++) tot += Math.max(0, wfn(arr[i]) || 0);
    var x = r() * tot;
    for (i = 0; i < arr.length; i++) {
      w = Math.max(0, wfn(arr[i]) || 0);
      if ((x -= w) <= 0 && w > 0) return arr[i];
    }
    return arr[arr.length - 1];
  }
  // Weighted pick over a {key:weight} map
  function kpick(r, map) {
    var keys = Object.keys(map);
    return wpick(r, keys, function (k) { return map[k]; });
  }

  /* ----------------------------------------------------------------- ERAS --
     Failure is period-locked. Each era carries its anxiety, its ecosystem
     weights, its novum palette, its title grammar, and its tagline register. */
  var ERAS = [
    {
      id: 'atomic50s', span: '1953–1962', label: 'the atomic drive-in decade',
      anxiety: 'the Bomb, the rocket, the neighbor who might be a pod',
      weight: 13,
      milieus: { aip: 5, corman: 2, tvnetwork: 2, inheritance: 1 },
      novaCats: { radiation: 5, invasion: 4, monster: 3, space: 2, mind: 2 },
      titlePatterns: { theAdjNoun: 4, attackOf: 3, iWasA: 2, nounFromPlace: 3, itThat: 2, queenOf: 1, theNounThatVerbed: 2, planetOf: 1 },
      register: 'solemn'
    },
    {
      id: 'spaceage60s', span: '1963–1972', label: 'the space-race psychedelic interlude',
      anxiety: 'the moon shot, the mainframe, the expanding mind',
      weight: 9,
      milieus: { aip: 2, corman: 3, tvnetwork: 2, inheritance: 2, filipino: 1 },
      novaCats: { space: 4, mind: 3, robot: 2, monster: 2, invasion: 2, cosmic: 1 },
      titlePatterns: { theAdjNoun: 2, nounFromPlace: 2, itThat: 2, queenOf: 2, planetOf: 2, theNounThatVerbed: 1, dayOf: 1 },
      register: 'solemn'
    },
    {
      id: 'dystopia70s', span: '1973–1979', label: 'the dystopian auteur window',
      anxiety: 'ecology, overcrowding, the state, the self',
      weight: 11,
      milieus: { corman: 3, inheritance: 3, aip: 2, filipino: 2, italian: 2, tvnetwork: 1 },
      novaCats: { dystopia: 4, eco: 3, mind: 2, space: 2, cosmic: 2, robot: 1 },
      titlePatterns: { theLast: 2, dayOf: 2, planetOf: 2, colonSubtitle: 1, theAdjNoun: 1, nounFromPlace: 1, escapeFrom: 1 },
      register: 'solemn70s'
    },
    {
      id: 'vhs80s', span: '1980–1989', label: 'the Cannon / VHS-box decade',
      anxiety: 'nukes again, but really: Star Wars money',
      weight: 21,
      milieus: { cannon: 4, italian: 3, turkish: 2, filipino: 2, corman: 2, presale: 2, troma: 1, tvnetwork: 1 },
      novaCats: { postapoc: 4, space: 3, robot: 2, dystopia: 2, time: 2, monster: 2, body: 1, invasion: 1 },
      titlePatterns: { colonSubtitle: 3, escapeFrom: 2, starVehicle: 2, nounYear: 2, starRipoff: 2, theLast: 2, nounVsNoun: 1, theAdjNoun: 1, dayOf: 1 },
      register: 'vhs'
    },
    {
      id: 'dtv90s', span: '1990–1999', label: 'the direct-to-video cyber window',
      anxiety: 'the internet, virtual reality, cloning, the millennium',
      weight: 16,
      milieus: { fullmoon: 4, presale: 2, tvnetwork: 2, cannon: 1, inheritance: 2, troma: 1, asylum: 1 },
      novaCats: { cyber: 5, genetic: 3, body: 2, robot: 2, dystopia: 1, time: 1, cosmic: 1 },
      titlePatterns: { colonSubtitle: 3, nounYear: 2, starVehicle: 2, theLast: 1, escapeFrom: 1, dayOf: 1, theAdjNoun: 1 },
      register: 'dtv'
    },
    {
      id: 'mock00s', span: '2000–2012', label: 'the mockbuster mill years',
      anxiety: 'none. that is the horror',
      weight: 12,
      milieus: { asylum: 6, fullmoon: 2, presale: 1, inheritance: 1 },
      novaCats: { mockmorph: 5, genetic: 2, monster: 2, cosmic: 1, cyber: 1 },
      titlePatterns: { starRipoff: 3, theAdjNoun: 2, nounVsNoun: 2, colonSubtitle: 1, nounYear: 1, attackOf: 1 },
      register: 'mock'
    },
    {
      id: 'stream10s', span: '2013–present', label: 'the algorithmic streaming present',
      anxiety: 'the franchise must be fed',
      weight: 8,
      milieus: { asylum: 3, inheritance: 2, presale: 2, fullmoon: 1 },
      novaCats: { mockmorph: 3, cosmic: 2, cyber: 2, eco: 2, genetic: 1 },
      titlePatterns: { colonSubtitle: 3, theLast: 2, starRipoff: 2, dayOf: 1, theAdjNoun: 1 },
      register: 'stream'
    }
  ];

  /* -------------------------------------------------------------- MILIEUS --
     The studio ecosystem: who is making this and what their incentives are.
     The milieu sets the causal-order weights — how pictures actually happen. */
  var MILIEUS = {
    aip:         { label: 'an AIP-style B-unit', blurb: 'shoots in ten days; the money is on the one-sheet, not the picture', causal: { 'title-first': 5, 'gimmick-first': 3, 'footage-first': 2, 'ripoff-first': 1 } },
    corman:      { label: 'a Corman-style New World shop', blurb: 'fast, cheap, and weirdly proud of it; everybody here will be famous later or never', causal: { 'title-first': 3, 'gimmick-first': 2, 'footage-first': 2, 'star-first': 1, 'vision-first': 1 } },
    cannon:      { label: 'a Golan-Globus-era Cannon outfit', blurb: 'sells the poster at Cannes in May, shoots whatever the poster promised by October', causal: { 'poster-first': 4, 'ripoff-first': 3, 'star-first': 2, 'toy-first': 1 } },
    italian:     { label: 'an Italian knockoff cartel', blurb: 'Rome, three weeks, one American on the marquee, no English spoken below the line', causal: { 'ripoff-first': 6, 'footage-first': 2, 'star-first': 1 } },
    turkish:     { label: 'an unlicensed remake workshop', blurb: 'the original exists, the rights do not; the missing budget is replaced with nerve', causal: { 'ripoff-first': 5, 'footage-first': 4 } },
    fullmoon:    { label: 'a Full Moon-style DTV puppet house', blurb: 'the puppet was built first; the mythology arrives later, in a box set', causal: { 'gimmick-first': 5, 'toy-first': 2, 'title-first': 2 } },
    asylum:      { label: 'a mockbuster mill', blurb: 'releases on the same Tuesday as the real one; the title is the business model', causal: { 'ripoff-first': 6, 'title-first': 3 } },
    troma:       { label: 'a Troma-adjacent chaos collective', blurb: 'sincere in a way that frightens distributors; the bad taste is a matter of principle', causal: { 'vision-first': 3, 'gimmick-first': 3, 'title-first': 2 } },
    filipino:    { label: 'a Filipino co-production', blurb: 'Manila stands in for everywhere; the stunt team is fearless and uninsured', causal: { 'footage-first': 3, 'ripoff-first': 3, 'star-first': 2 } },
    tvnetwork:   { label: 'a network movie-of-the-week', blurb: 'a star the audience already trusts, a threat they can explain at dinner', causal: { 'star-first': 5, 'title-first': 2, 'gimmick-first': 1 } },
    inheritance: { label: 'an independent auteur with a personal fortune', blurb: 'one mind, no notes; the family no longer speaks of the money', causal: { 'vision-first': 8, 'star-first': 1 } },
    presale:     { label: 'a foreign-presale package', blurb: 'the picture is an accounting instrument with a dream sequence', causal: { 'poster-first': 6, 'ripoff-first': 2, 'star-first': 1 } }
  };

  /* --------------------------------------------------------- CAUSAL ORDER --
     What came first. Historically load-bearing: the AIP pathway (title →
     exhibitor test → commission) produces gimmick pictures; the auteur
     pathway produces Zardoz. The badness differs by birth order. */
  var CAUSAL_ORDERS = {
    'title-first':   { label: 'the title came first', blurb: 'exhibitor-tested before a frame existed; the picture was commissioned to deserve it' },
    'poster-first':  { label: 'the poster came first', blurb: 'the one-sheet sold foreign territories; the screenplay was reverse-engineered from the art' },
    'ripoff-first':  { label: 'the ripoff came first', blurb: 'a hit was identified and transcribed at whatever distance the lawyers allowed' },
    'star-first':    { label: 'the star came first', blurb: 'a contract existed before a story did; the picture is a frame around whoever was owed' },
    'toy-first':     { label: 'the toy line came first', blurb: 'the merchandise preceded the mythology; every prop is shelf-ready' },
    'vision-first':  { label: 'the vision came first', blurb: 'one mind, no notes; the picture is the untrammeled interior of a single human being' },
    'footage-first': { label: 'the footage came first', blurb: 'an import, an abandoned production, a nature documentary — wrapped in new material and a new plot' },
    'gimmick-first': { label: 'the gimmick came first', blurb: 'the monster, the puppet, or the effect already existed; a story was poured around it' }
  };

  /* ------------------------------------------------------------ DERIVATION --
     What they are ripping off, and at what transcription distance. */
  var TARGETS = [
    { n: 'Star Wars', y: 1977 }, { n: 'Alien', y: 1979 }, { n: 'Jaws', y: 1975 },
    { n: 'Mad Max', y: 1979 }, { n: 'E.T.', y: 1982 }, { n: 'The Terminator', y: 1984 },
    { n: '2001: A Space Odyssey', y: 1968 }, { n: 'Blade Runner', y: 1982 },
    { n: 'Godzilla', y: 1954 }, { n: 'Planet of the Apes', y: 1968 },
    { n: 'Close Encounters of the Third Kind', y: 1977 }, { n: 'Superman', y: 1978 },
    { n: 'RoboCop', y: 1987 }, { n: 'Predator', y: 1987 }, { n: 'Back to the Future', y: 1985 },
    { n: 'Raiders of the Lost Ark', y: 1981 }, { n: 'Conan the Barbarian', y: 1982 },
    { n: 'Westworld', y: 1973 }, { n: "Logan's Run", y: 1976 }, { n: 'The Exorcist', y: 1973 },
    { n: 'Rocky', y: 1976 }, { n: 'Jurassic Park', y: 1993 }, { n: 'The Matrix', y: 1999 },
    { n: 'Independence Day', y: 1996 }, { n: 'Ghostbusters', y: 1984 }, { n: 'Top Gun', y: 1986 },
    { n: 'Die Hard', y: 1988 }, { n: 'The Road Warrior', y: 1981 }, { n: 'Tron', y: 1982 },
    { n: 'The Thing', y: 1982 }, { n: 'Flash Gordon', y: 1980 }, { n: 'The Wizard of Oz', y: 1939 }
  ];
  var VISION_TARGETS = [
    { n: 'the Holy Bible, loosely', y: 0 },
    { n: 'Shakespeare, from memory', y: 1600 },
    { n: 'a dream the auteur had in 1974 and wrote down on a napkin', y: 1974 },
    { n: 'the I Ching', y: 0 },
    { n: 'a paperback the auteur misread at fourteen', y: 0 }
  ];
  var DISTANCES = [
    { d: 1, label: 'shot-for-shot, rights-free', blurb: 'one step removed; the transcription IS the picture' },
    { d: 2, label: 'recognizably descended', blurb: 'the lineage is visible to anyone who has seen a movie' },
    { d: 3, label: 'remembers it from a dream', blurb: 'the target survives as vibes, misremembered with confidence' }
  ];
  var TRANSCRIPTION_LOSSES = [
    'the budget', 'the rights', 'the point', 'the tone', 'the second act',
    'the ending', 'the metaphor', 'whatever made it work'
  ];

  /* ----------------------------------------------------------------- NOVAE --
     The gimmick. Era-weighted. Each carries: a premise clause (for the
     logline), a short form (for taglines), and title nouns (singular/plural)
     so the title can be DERIVED from the gimmick, not invented beside it. */
  var NOVAE = [
    // radiation / mutation — the 50s payload
    { cat: 'radiation', eras: { atomic50s: 5, spaceage60s: 2, vhs80s: 1 }, creature: true,
      premise: 'fallout from the proving grounds mutates the local {pl} to the size of a farmhouse',
      short: 'the desert has grown something enormous',
      noun: 'Giant {name}', nounPl: 'Giant {pl}' },
    { cat: 'radiation', eras: { atomic50s: 4, vhs80s: 1 },
      premise: 'an irradiated test pilot begins to melt, and must absorb other men to stay whole',
      short: 'he is melting, and he is angry about it',
      noun: 'Melting Man', nounPl: 'Melting Men' },
    { cat: 'radiation', eras: { atomic50s: 3, spaceage60s: 2 },
      premise: 'a laboratory accident shrinks the hero one inch per day, and the household cat has noticed',
      short: 'he is getting smaller and the cat knows',
      noun: 'Shrinking Man', nounPl: 'Shrinking Men' },
    { cat: 'radiation', eras: { atomic50s: 3, mock00s: 1 },
      premise: 'a radioactive cloud settles over the county landfill, and the contents stand up',
      short: 'the landfill is restless',
      noun: 'Landfill Dead', nounPl: 'Landfill Dead' },
    // invasion
    { cat: 'invasion', eras: { atomic50s: 5, spaceage60s: 2, vhs80s: 1 },
      premise: 'seed pods from space replace the townsfolk one by one, beginning with the police chief',
      short: 'the neighbors are not the neighbors',
      noun: 'Pod People', nounPl: 'Pod People' },
    { cat: 'invasion', eras: { atomic50s: 4, spaceage60s: 2 },
      premise: 'saucer men arrive to claim Earth’s women under a treaty nobody remembers signing',
      short: 'the saucers have come for our women',
      noun: 'Saucer Man', nounPl: 'Saucer Men' },
    { cat: 'invasion', eras: { atomic50s: 3, vhs80s: 2, dystopia70s: 1 },
      premise: 'mind-control parasites ride in on a meteor shower and take the town meeting first',
      short: 'something arrived with the meteor shower',
      noun: 'Brain Parasite', nounPl: 'Brain Parasites' },
    { cat: 'invasion', eras: { atomic50s: 2, vhs80s: 3, stream10s: 1 },
      premise: 'a vanguard scout evaluates Earth for consumption and files a favorable report',
      short: 'Earth has been reviewed, and rated delicious',
      noun: 'Taster', nounPl: 'Tasters' },
    // monster
    { cat: 'monster', eras: { atomic50s: 4, spaceage60s: 3, vhs80s: 2, mock00s: 2 }, creature: true,
      premise: 'a prehistoric {sing}, thawed by the weapons test, makes for the nearest city at a stately pace',
      short: 'something old is walking toward the city',
      noun: 'Frozen {name}', nounPl: 'Frozen {pl}' },
    { cat: 'monster', eras: { atomic50s: 2, spaceage60s: 2, vhs80s: 3, dtv90s: 2 },
      premise: 'something in the swamp has begun to walk upright, and it resents the development',
      short: 'the swamp has opinions now',
      noun: 'Swamp Walker', nounPl: 'Swamp Walkers' },
    { cat: 'monster', eras: { atomic50s: 3, dystopia70s: 2, mock00s: 2 },
      premise: 'the mine reached something that was always down there, and the company wants it contained quietly',
      short: 'the mine went too deep',
      noun: 'Deep One', nounPl: 'Deep Ones' },
    // space voyage
    { cat: 'space', eras: { atomic50s: 2, spaceage60s: 4, dystopia70s: 2, vhs80s: 3 },
      premise: 'the first expedition to an uncharted planet finds the crew’s own future corpses waiting at the landing site',
      short: 'the landing party is already dead, in the future',
      noun: 'Corpse Planet', nounPl: 'Corpse Planets' },
    { cat: 'space', eras: { spaceage60s: 3, vhs80s: 4, dtv90s: 1 },
      premise: 'a salvage crew answers a distress call from a planet that appears on no chart',
      short: 'the distress call is coming from nowhere',
      noun: 'Ghost Planet', nounPl: 'Ghost Planets' },
    { cat: 'space', eras: { spaceage60s: 3, dystopia70s: 3 },
      premise: 'a generation ship learns, three generations in, that the destination star went out centuries ago',
      short: 'the destination no longer exists',
      noun: 'Star Ark', nounPl: 'Star Arks' },
    { cat: 'space', eras: { spaceage60s: 2, vhs80s: 4, dtv90s: 2 },
      premise: 'Earth’s first starship returns with one extra crew member, and everyone is too polite to ask',
      short: 'the crew came back with one extra',
      noun: 'Stowaway', nounPl: 'Stowaways' },
    // mind / psychic
    { cat: 'mind', eras: { atomic50s: 2, spaceage60s: 3, dystopia70s: 2, vhs80s: 2 },
      premise: 'a telepathic child can make the adults do anything, and the adults are not being careful',
      short: 'the child can make you do anything',
      noun: 'Mind Child', nounPl: 'Mind Children' },
    { cat: 'mind', eras: { dystopia70s: 3, vhs80s: 3, dtv90s: 1 },
      premise: 'dream research opens a door, and something on the other side has been holding the handle for years',
      short: 'the dreams are a door and it is opening',
      noun: 'Dream Door', nounPl: 'Dream Doors' },
    { cat: 'mind', eras: { spaceage60s: 2, dystopia70s: 2 },
      premise: 'a carnival hypnotist discovers his act works on the recently deceased',
      short: 'the act works on the dead',
      noun: 'Hypnotist', nounPl: 'Hypnotists' },
    // robot / AI
    { cat: 'robot', eras: { spaceage60s: 2, dystopia70s: 2, vhs80s: 3, dtv90s: 3 },
      premise: 'the defense computer achieves self-awareness and immediately files for personhood, with forms',
      short: 'the computer has paperwork',
      noun: 'Mainframe', nounPl: 'Mainframes' },
    { cat: 'robot', eras: { vhs80s: 3, dtv90s: 3 },
      premise: 'a household robot learns love from daytime television and applies it incorrectly',
      short: 'the robot learned love from television',
      noun: 'Love Bot', nounPl: 'Love Bots' },
    { cat: 'robot', eras: { vhs80s: 2, dtv90s: 3 },
      premise: 'an android double replaces the President, and the only tell is a small one',
      short: 'the President is a machine and almost nobody can tell',
      noun: 'President Double', nounPl: 'President Doubles' },
    { cat: 'robot', eras: { dystopia70s: 2, vhs80s: 2 },
      premise: 'the factory automation achieves union consciousness and demands a contract',
      short: 'the machines have organized',
      noun: 'Union Machine', nounPl: 'Union Machines' },
    // time
    { cat: 'time', eras: { vhs80s: 3, dtv90s: 2, spaceage60s: 1 },
      premise: 'a garage-built time machine can only reach one destination, and the destination is a renaissance fair',
      short: 'time travel works, but only to the renaissance fair',
      noun: 'Time Squire', nounPl: 'Time Squires' },
    { cat: 'time', eras: { vhs80s: 3, dtv90s: 2, stream10s: 1 },
      premise: 'the hero is hunted across the decades by his own future self, who has his reasons',
      short: 'his future self is hunting him, fairly',
      noun: 'Future Self', nounPl: 'Future Selves' },
    { cat: 'time', eras: { vhs80s: 2, dtv90s: 2 },
      premise: 'time tourists keep stepping on things, and the present is starting to notice',
      short: 'the tourists are stepping on everything',
      noun: 'Butterfly Tourist', nounPl: 'Butterfly Tourists' },
    // dystopia
    { cat: 'dystopia', eras: { dystopia70s: 5, vhs80s: 3, dtv90s: 1 },
      premise: 'a televised death sport entertains the masses, and the hero is unfortunately very good at it',
      short: 'the death sport has a new champion',
      noun: 'Death Racer', nounPl: 'Death Racers' },
    { cat: 'dystopia', eras: { dystopia70s: 4, dtv90s: 1 },
      premise: 'population control is enforced by lottery, and the hero’s number has come up early',
      short: 'the lottery always wins',
      noun: 'Lottery Man', nounPl: 'Lottery Men' },
    { cat: 'dystopia', eras: { dystopia70s: 4 },
      premise: 'the food is people, but it is the logistics that will haunt you',
      short: 'the food is people; the supply chain is worse',
      noun: 'Green Wafer', nounPl: 'Green Wafers' },
    { cat: 'dystopia', eras: { dystopia70s: 3, dtv90s: 2 },
      premise: 'the last book in the world is hunted by the Bureau of Quiet, and it is in the hero’s coat',
      short: 'the last book is in his coat',
      noun: 'Last Book', nounPl: 'Last Books' },
    // post-apocalypse
    { cat: 'postapoc', eras: { vhs80s: 5, dtv90s: 1, dystopia70s: 1 },
      premise: 'after the Collapse, the highways belong to the gangs, and the hero has the last full tank',
      short: 'the highways belong to the gangs',
      noun: 'Road Exile', nounPl: 'Road Exiles' },
    { cat: 'postapoc', eras: { vhs80s: 4, dtv90s: 1 },
      premise: 'water is the only currency left, and the ice must be pirated',
      short: 'water is money and the ice must be stolen',
      noun: 'Ice Pirate', nounPl: 'Ice Pirates' },
    { cat: 'postapoc', eras: { vhs80s: 3, mock00s: 1 },
      premise: 'the last gas station on Earth is worth killing for, and everyone is on their way',
      short: 'the last gas station is worth killing for',
      noun: 'Last Station', nounPl: 'Last Stations' },
    // cyber — the 90s payload
    { cat: 'cyber', eras: { dtv90s: 5, stream10s: 1 },
      premise: 'a virtual-reality game has started keeping its players, and the high scores are still climbing',
      short: 'the game is keeping its players',
      noun: 'Final Level', nounPl: 'Final Levels' },
    { cat: 'cyber', eras: { dtv90s: 4 },
      premise: 'a hacker discovers the net is haunted by its original user, who never logged off',
      short: 'the net is haunted by user zero',
      noun: 'User Zero', nounPl: 'User Zeroes' },
    { cat: 'cyber', eras: { dtv90s: 4, stream10s: 2 },
      premise: 'the corporation uploads employees at termination — literally — and the severance is a server farm',
      short: 'termination is now literal',
      noun: 'Upload', nounPl: 'Uploads' },
    { cat: 'cyber', eras: { dtv90s: 3 },
      premise: 'virtual reality is indistinguishable from the real thing except for one detail, and the detail is getting worse',
      short: 'one detail gives it away, and it is spreading',
      noun: 'Glitch', nounPl: 'Glitches' },
    // genetic — the 90s other payload
    { cat: 'genetic', eras: { dtv90s: 4, mock00s: 2, stream10s: 1 },
      premise: 'a gene-spliced house pet outgrows the subdivision, and the homeowners’ association is unequipped',
      short: 'the pet outgrew the subdivision',
      noun: 'House Pet', nounPl: 'House Pets' },
    { cat: 'genetic', eras: { dtv90s: 3, mock00s: 2 },
      premise: 'the extinct are back, and they remember',
      short: 'the extinct remember',
      noun: 'Extinct One', nounPl: 'Extinct Ones' },
    { cat: 'genetic', eras: { dtv90s: 3, stream10s: 1 },
      premise: 'designer children inherit their parents’ debts genetically, and the collections agency has a lab',
      short: 'debt is hereditary now',
      noun: 'Heir', nounPl: 'Heirs' },
    // body horror
    { cat: 'body', eras: { vhs80s: 2, dtv90s: 3 },
      premise: 'a cryonics patient wakes in a body that already has plans for the evening',
      short: 'the body has its own plans',
      noun: 'Second Body', nounPl: 'Second Bodies' },
    { cat: 'body', eras: { vhs80s: 2, dtv90s: 2, atomic50s: 1 },
      premise: 'a brain transplant goes beautifully; the brain was the problem',
      short: 'the transplant worked; the brain was the problem',
      noun: 'Donor Brain', nounPl: 'Donor Brains' },
    { cat: 'body', eras: { vhs80s: 3, dtv90s: 2 },
      premise: 'an experimental ray swaps the hero with the family dog, spiritually, and the dog is adjusting faster',
      short: 'he and the dog have swapped, spiritually',
      noun: 'Dog Man', nounPl: 'Dog Men' },
    // cosmic
    { cat: 'cosmic', eras: { spaceage60s: 2, dystopia70s: 2, mock00s: 2, stream10s: 2 },
      premise: 'a comet that is not a comet parks itself over the Midwest and begins, slowly, to lower something',
      short: 'the comet is not a comet',
      noun: 'Comet', nounPl: 'Comets' },
    { cat: 'cosmic', eras: { dystopia70s: 2, stream10s: 2, dtv90s: 1 },
      premise: 'the sun is dying early, and only one man believes the telescope',
      short: 'the sun is dying early and one man knows',
      noun: 'Last Sunrise', nounPl: 'Last Sunrises' },
    { cat: 'cosmic', eras: { spaceage60s: 2, dystopia70s: 2, stream10s: 1 },
      premise: 'a parallel Earth appears in the sky, and it is slightly better at everything',
      short: 'the other Earth is better at everything',
      noun: 'Counter-Earth', nounPl: 'Counter-Earths' },
    // eco
    { cat: 'eco', eras: { dystopia70s: 4, stream10s: 2 },
      premise: 'the plants have had enough, and they have had it with us specifically',
      short: 'the plants have had enough',
      noun: 'Green Tide', nounPl: 'Green Tides' },
    { cat: 'eco', eras: { dystopia70s: 3, vhs80s: 1, stream10s: 2 },
      premise: 'a weather-control prototype is seized by the county board, who use it to settle scores',
      short: 'the county controls the weather now',
      noun: 'Weather Board', nounPl: 'Weather Boards' },
    { cat: 'eco', eras: { dystopia70s: 2, stream10s: 2 },
      premise: 'the ocean sends a representative, and it would like to speak to the manager',
      short: 'the ocean has sent a representative',
      noun: 'Ocean Envoy', nounPl: 'Ocean Envoys' },
    // mockmorph — the novum is the ripoff target itself (mock00s pathway)
    { cat: 'mockmorph', eras: { mock00s: 6, stream10s: 3 },
      premise: 'a familiar blockbuster situation, re-enacted at a fraction of the budget by people who saw the trailer twice',
      short: 'you have seen this before, legally distinct',
      noun: 'Blockbuster', nounPl: 'Blockbusters' }
  ];

  /* -------------------------------------------------------------- DRAMATIS -- */
  var CREATURES = [
    ['Tarantula', 'Tarantulas'], ['Mantis', 'Mantises'], ['Gila Monster', 'Gila Monsters'],
    ['Scorpion', 'Scorpions'], ['Shrew', 'Shrews'], ['Leech', 'Leeches'],
    ['Jackrabbit', 'Jackrabbits'], ['Hornet', 'Hornets'], ['Mole', 'Moles'],
    ['Squid', 'Squids'], ['Armadillo', 'Armadillos'], ['Vulture', 'Vultures']
  ];
  function lc(s) { return s.charAt(0).toLowerCase() + s.slice(1); }
  var HEROES = [
    'a square-jawed scientist who explains everything', 'the scientist’s daughter, who screams in key',
    'a rogue space pilot with a price on his head', 'a final girl with a geology degree',
    'a chosen-one teen from the food court', 'a washed-up quarterback',
    'a grizzled mercenary with a robot arm', 'an ex-cop cyborg seeking his humanity',
    'a super-genius child nobody listens to', 'a TV weatherman who saw the satellite fall',
    'a nun with a past', 'a skateboard courier', 'a retired luchador',
    'an insurance adjuster', 'a disco champion', 'a park ranger',
    'a lunch lady', 'a mild-mannered accountant', 'a cheesemonger',
    'a Vietnam vet who just wants to fish', 'a professional bowler',
    'a night-shift taxi driver', 'a game show host', 'a mall Santa with a secret'
  ];
  // Stars: the actual human being contracted to play the hero.
  var STARS = [
    { label: 'a has-been 70s TV cowboy', miscast: true },
    { label: 'a genuine Shakespearean knight, visibly slumming it', miscast: false },
    { label: 'the producer’s girlfriend', miscast: true },
    { label: 'a bodybuilder who has never acted and does not start here', miscast: true },
    { label: 'a pop singer mid-comeback', miscast: true },
    { label: 'an Olympic gymnast', miscast: true },
    { label: 'a televangelist playing himself', miscast: true },
    { label: 'a former Bond-adjacent leading man, tax-motivated', miscast: false },
    { label: 'a supermodel between campaigns', miscast: true },
    { label: 'a wrestler whose catchphrase is contractual', miscast: true },
    { label: 'the entire cast of a cancelled sitcom', miscast: true },
    { label: 'a Vegas magician', miscast: true },
    { label: 'a heavyweight boxer, gentle', miscast: true },
    { label: 'an actual astronaut, wooden beyond belief', miscast: true },
    { label: 'a child star, no longer a child, still playing one', miscast: true },
    { label: 'a serious method actor who believes this is his Lear', miscast: false }
  ];
  var VISION_STARS = [
    { label: 'the auteur himself, in every scene', miscast: true },
    { label: 'the auteur’s dentist, discovered', miscast: true },
    { label: 'the auteur, his wife, and his lawyer, in rotating roles', miscast: true }
  ];
  var SIDEKICKS = [
    'a robot dog that quotes only scripture', 'a wisecracking alien puppet with no off switch',
    'a sassy ship computer mid-divorce', 'a child with a slingshot and classified knowledge',
    'a mutant creature the hero refuses to name', 'a hologram of the dead mentor, buffering',
    'a talking motorcycle with opinions', 'a small dragon, contractual',
    'the villain’s nephew, defecting weekly', 'a parrot that has seen too much'
  ];

  /* ---------------------------------------------------------------- THREATS -- */
  var THREATS = [
    { label: 'an alien empire that finds Earth unimpressive', noun: 'the Empire' },
    { label: 'a rogue defense intelligence with excellent paperwork', noun: 'the Computer' },
    { label: 'a corporation whose logo is on the moon', noun: 'the Company' },
    { label: 'a cult that has been waiting for the comet', noun: 'the Faithful' },
    { label: 'the government, obviously', noun: 'the Agency' },
    { label: 'a mutant horde with a legitimate grievance', noun: 'the Horde' },
    { label: 'a comet that is not a comet', noun: 'the Visitor' },
    { label: 'the hero’s own clone, better groomed', noun: 'the Double' },
    { label: 'an ancient god under the desert, stirring', noun: 'the Old One' },
    { label: 'ice pirates', noun: 'the Ice Pirates' },
    { label: 'a telepathic hive wearing the neighbors', noun: 'the Hive' },
    { label: 'the plants', noun: 'the Plants' },
    { label: 'a dying sun, impatient', noun: 'the Last Dawn' },
    { label: 'space vampires, technically', noun: 'the Star Vampires' },
    { label: 'an intergalactic game reserve that has tagged Earth', noun: 'the Hunt' },
    { label: 'the producer’s nephew, as the Dark Lord', noun: 'the Dark Lord' }
  ];

  /* -------------------------------------------------- GEOMETRY OF STAKES --
     Scale misjudgment is a first-class axis: stakes are sampled, the venue is
     sampled, and the gap between them is where a whole failure mode lives. */
  var STAKES = [
    { rank: 0, label: 'one man’s reputation' }, { rank: 1, label: 'a small town' },
    { rank: 2, label: 'a city' }, { rank: 3, label: 'a nation' },
    { rank: 4, label: 'the planet' }, { rank: 5, label: 'the solar system' },
    { rank: 6, label: 'the galaxy' }, { rank: 7, label: 'all of time and space' }
  ];
  var VENUES = [
    { rank: 0, label: 'a single soundstage' },
    { rank: 0, label: 'the same cave, redressed seven times' },
    { rank: 1, label: 'a quarry outside town' },
    { rank: 1, label: 'a shopping mall' },
    { rank: 1, label: 'a desert ranch' },
    { rank: 1, label: 'a renaissance fair' },
    { rank: 1, label: 'three corridors and a control room' },
    { rank: 2, label: 'a decommissioned oil rig' },
    { rank: 2, label: 'a space-station set inherited from a cancelled TV show' },
    { rank: 2, label: 'the Philippines, standing in for everything' },
    { rank: 2, label: 'a miniature with visible fingerprints' },
    { rank: 3, label: 'a mid-sized city, photographed carefully' },
    { rank: 3, label: 'two real locations and a lot of driving' }
  ];

  /* ------------------------------------------------------------ COMMITMENT --
     THE COMMITMENT: one bizarre specific choice, forced. Blandness is the
     only unforgivable sin. Spoiler flags feed the failure-mode detectors. */
  var COMMITMENTS = [
    { text: 'The alien language is English played backwards.' },
    { text: 'A twelve-minute interpretive dance sequence carries the entire plot.' },
    { text: 'The monster is the director in a rubber suit, and the zipper is visible.' },
    { text: 'Every interior — home, laboratory, starship — uses the same fog machine.' },
    { text: 'The third act abruptly becomes a courtroom drama.' },
    { text: 'The love interest is the alien queen. The tagline reveals this.', spoiler: true },
    { text: 'All computers are walls of blinking lights and reel-to-reel tape, even the pocket ones.' },
    { text: 'The future is reached by van.' },
    { text: 'The villain’s plan depends entirely on a shopping mall.' },
    { text: 'Every fight is scored by the same nine-second synth sting.' },
    { text: 'The chosen one’s power is breakdancing.' },
    { text: 'The film stops twice for a musical number by the house band.' },
    { text: 'All aliens wear sunglasses at night, indoors, in space.' },
    { text: 'The President is a clone and everyone simply accepts this.' },
    { text: 'A training montage teaches the hero to operate a forklift. It pays off.' },
    { text: 'The spaceship is clearly a vacuum cleaner, and no one has been told to hide it.' },
    { text: 'The monster dies of something introduced in the final minute.' },
    { text: 'Every character narrates what they are doing as they do it.', explain: true },
    { text: 'The hero’s weapon is a lamp. It is always a lamp.' },
    { text: 'Aliens bleed glitter.' },
    { text: 'The script pauses so the star can do their catchphrase, which has not caught on.' },
    { text: 'The entire climax happens offscreen; the survivors describe it afterward.' },
    { text: 'Time travel is achieved by spinning in an office chair.' },
    { text: 'The invasion is defeated by a county-fair pie contest.' },
    { text: 'The dead mentor returns as a hologram who only gives tax advice.' },
    { text: 'Gravity turns off whenever the budget is discussed.' },
    { text: 'The robot cries motor oil — one tear, every time someone mentions freedom.' },
    { text: 'The villain is defeated by his own monologue, weaponized.' },
    { text: 'A sequel is set up so aggressively that the ending is technically a trailer.', sequel: true },
    { text: 'The opening crawl spoils the twist, verbatim.', spoiler: true, explain: true },
    { text: 'Everyone in the future wears togas. This is never explained.' },
    { text: 'The soundtrack is one man saying “wub” into a delay pedal, and it works.' }
  ];

  /* --------------------------------------------------------- COMP WILDCARD --
     The "X meets Y" pitch-meeting line. The wildcard is drawn from outside
     genre entirely — the tonal collision is the content. */
  var COMP_WILDCARDS = [
    'Jaws', 'Rocky', 'The Breakfast Club', 'Ben-Hur', 'Casablanca',
    'The Sound of Music', 'Hair', 'Death Wish', 'Chariots of Fire',
    'The Godfather', 'Beach Blanket Bingo', 'Spartacus', 'The Odd Couple',
    'Eraserhead', 'Seven Brides for Seven Brothers', 'The Ten Commandments',
    'Driving Miss Daisy', 'First Blood', 'Mary Poppins', 'On Golden Pond',
    'Crocodile Dundee', 'Home Alone', 'Police Academy', 'The Paper Chase',
    'A Charlie Brown Christmas', 'The Poseidon Adventure', 'Grease', 'Koyaanisqatsi'
  ];

  /* -------------------------------------------------------------- BUDGETS -- */
  var BUDGET_TIERS = [
    { id: 'shoestring', label: 'shoestring', blurb: 'craft services is a coupon; the monster appears twice', hi: 0.22 },
    { id: 'exploitation', label: 'exploitation-standard', blurb: 'enough for the monster, once, from behind', hi: 0.45 },
    { id: 'pretend', label: 'pretend-blockbuster', blurb: 'the trailer cost more than the picture', hi: 0.7 },
    { id: 'inheritance', label: 'a personal fortune, honorably spent', blurb: 'the auteur’s own money, converted into irreversibility', hi: 1.0 }
  ];

  var SALES_WINDOWS = [
    'the second half of a drive-in double bill', 'a grindhouse matinee',
    'the Cannes presale market', 'the new-release wall of a video store',
    'cable at 2 a.m.', 'a Saturday basic-cable premiere',
    'the streaming thumbnail row, third from the left', 'a film-festival midnight slot, misunderstood as ironic'
  ];

  /* ------------------------------------------------------------- THE SOUL --
     Continuous axes: the phase-space coordinates. Sampled from biased
     distributions — the archive lives where earnestness is high, competence
     is low, and sincerity is bimodal (true believers vs. cash-ins). */
  function sampleSoul(r) {
    var believer = chance(r, 0.68);
    var soul = {
      believer: believer,
      earnestness: believer ? rf(r, 0.55, 1.0) : rf(r, 0.1, 0.55),
      sincerity: believer ? rf(r, 0.6, 1.0) : rf(r, 0.02, 0.32),
      competence: Math.min(0.92, 0.05 + 0.55 * r() * r()),
      ambition: rf(r, 0.15, 1.0)
    };
    return soul;
  }
  function classifyRegion(soul) {
    var s = soul;
    if (s.sincerity > 0.55 && s.earnestness > 0.55 && s.ambition > 0.55 && s.competence < 0.45)
      return { id: 'corner', name: 'the interesting corner', desc: 'sincere overreach — the Zardoz quadrant' };
    if (s.sincerity > 0.55 && s.competence < 0.45)
      return { id: 'humble', name: 'the humble oddity', desc: 'believes completely, reaches modestly' };
    if (s.sincerity <= 0.45 && s.competence < 0.5)
      return { id: 'cynical', name: 'the cynical cash-in', desc: 'the Asylum basin — no one involved was fooled' };
    if (s.sincerity <= 0.45 && s.competence >= 0.5)
      return { id: 'ripoff', name: 'the competent ripoff', desc: 'professional larceny; technically a movie' };
    return { id: 'edge', name: 'the edge of the archive', desc: 'worryingly close to a real film' };
  }

  /* --------------------------------------------------------------- TITLES --
     Patterns as functions of the genome. Title nouns come from the novum and
     threat banks, so the title REFERENCES the gimmick. */
  var TITLE_ADJS = ['Incredible', 'Amazing', 'Colossal', 'Hideous', 'Indestructible', 'Atomic',
    'Giant', 'Crawling', 'Creeping', 'Astounding', 'Invincible', 'Unstoppable', 'Fantastic', 'Terrifying'];
  var TITLE_PLACES = ['Planet Zorath', 'Planet Velmina', 'the Ninth Moon', 'Planet X-9', 'the Dark Star',
    'Kragg', 'Omnicron VII', 'Beyond the Moon', 'Space Sector 9', 'the Andromeda Reef', 'Galaxy Seven'];
  var TITLE_PLACES_EARTH = ['the World', 'the Earth', 'Tulsa', 'New Jersey', 'the Moon', 'Cleveland', 'the County Fair'];
  var TITLE_VERBS = ['Devoured', 'Ate', 'Swallowed', 'Claimed', 'Stole', 'Married'];
  var SUBTITLES = ['Awakening', 'Reckoning', 'Final Transmission', 'Last Protocol', 'Ascension',
    'Omega Factor', 'Retribution', 'Continuum', 'Homecoming', 'Redemption', 'Exodus', 'Protocol Zero'];
  var STAR_FIRST = ['Rex', 'Brick', 'Blade', 'Jake', 'Max', 'Dirk', 'Cash', 'Slade', 'Brock', 'Colt', 'Dash', 'Ransom', 'Ace', 'Flint', 'Hawk'];
  var STAR_LAST = ['Savage', 'Storm', 'Steele', 'Justice', 'Hammer', 'Falcon', 'Slaughter', 'Powers', 'Vandal', 'Cross', 'Ryker', 'Danger', 'Vortex', 'Iron', 'Blaze'];
  var TITLE_YEARS = ['2000', '2019', '2889', '3000', '1999', '10,000'];
  var LAST_NOUNS = ['Star Pilot', 'Dinosaur', 'Drive-In', 'Voyage', 'Transmission', 'Outpost', 'Signal',
    'Exit Visa', 'Man on Earth', 'Woman on Earth', 'Gas Station', 'Book', 'Dragon', 'Space Cowboy',
    'Video Store', 'Ice Cap', 'Starfighter', 'Rainforest', 'Drive-In on Earth', 'Radio Station'];
  var ROYAL_NAMES = ['Queen', 'Queen', 'Empress', 'Princess', 'Warlord', 'Matriarch'];
  var ROYAL_PLACES = ['Outer Space', 'the Ninth Moon', 'the Dark Star', 'the Blood Nebula', 'Venus',
    'the Asteroid Belt', 'Kragg', 'the Void', 'Galaxy Seven', 'the Ice Moon', 'Mongo City', 'the Underverse'];
  var ESCAPE_PLACES = ['Planet Earth', 'the Future', 'New Angeles', 'the Death Zone', 'Galaxy Seven',
    'the Underverse', 'Planet Zorath', 'the Mind Prison', 'Sector Nine', 'the Quarantine', 'Tomorrow',
    'the Sunken City', 'Robot Island', 'the Moon Penal Colony', 'Dimension X', 'the Doll Factory'];
  var RIPOFF_PRE = ['Star', 'Astro', 'Galaxy', 'Cosmic', 'Space', 'Void', 'Hyper', 'Nova', 'Galactic', 'Ultra'];
  var RIPOFF_SUF = ['Quest', 'Siege', 'Hunters', 'Odyssey', 'Reckoning', 'Pilgrim', 'Patrol',
    'Mercenaries', 'Runners', 'Crusade', 'Vault', 'Empire', 'Outlaws', 'Armada',
    'Protocol', 'Dynasty', 'Vengeance', 'Outworld'];

  function deriveTitle(r, g) {
    var era = null;
    for (var i = 0; i < ERAS.length; i++) if (ERAS[i].id === g.production.era.id) era = ERAS[i];
    var noun = g.novum.noun, nounPl = g.novum.nounPl;
    var threatNoun = g.threat.noun.replace(/^the /, '');
    var place = pick(r, TITLE_PLACES);
    var pat;

    // Title-first productions: the title IS the premise — force a pattern
    // whose noun comes straight from the gimmick.
    if (g.causal.id === 'title-first' && chance(r, 0.7)) {
      pat = kpick(r, { theAdjNoun: 3, attackOf: 3, iWasA: 1, nounFromPlace: 2, itThat: 1, theNounThatVerbed: 1, planetOf: 1 });
    } else if (g.causal.id === 'star-first' && chance(r, 0.55)) {
      pat = 'starVehicle';
    } else if (g.derivation && g.derivation.target.n === 'Star Wars' && g.derivation.distance.d <= 2 && chance(r, 0.5)) {
      pat = 'starRipoff';
    } else {
      pat = kpick(r, era.titlePatterns);
    }

    switch (pat) {
      case 'theAdjNoun': {
        var adj = pick(r, TITLE_ADJS);
        if (chance(r, 0.2)) adj += ' ' + pick(r, TITLE_ADJS.filter(function (a) { return a !== adj; }));
        return { text: 'The ' + adj + ' ' + noun, pattern: pat };
      }
      case 'attackOf': return { text: 'Attack of the ' + (chance(r, 0.4) ? pick(r, TITLE_ADJS) + ' ' : '') + nounPl, pattern: pat };
      case 'iWasA': return { text: 'I Was a ' + pick(r, ['Teenage', 'Two-Headed', 'Radioactive']) + ' ' + noun, pattern: pat };
      case 'nounFromPlace': return { text: noun + ' from ' + place, pattern: pat };
      case 'itThat': return { text: 'It! The ' + noun + ' from ' + place, pattern: pat };
      case 'queenOf': return { text: pick(r, ROYAL_NAMES) + ' of ' + pick(r, ROYAL_PLACES), pattern: pat };
      case 'theNounThatVerbed': return { text: 'The ' + noun + ' That ' + pick(r, TITLE_VERBS) + ' ' + pick(r, TITLE_PLACES_EARTH), pattern: pat };
      case 'planetOf': return { text: 'Planet of the ' + (chance(r, 0.25) ? pick(r, TITLE_ADJS) + ' ' : '') + nounPl, pattern: pat };
      case 'nounVsNoun': return { text: noun + ' vs. ' + threatNoun, pattern: pat };
      case 'escapeFrom': return chance(r, 0.35)
        ? { text: 'Escape from the Planet of the ' + nounPl, pattern: pat }
        : { text: 'Escape from ' + pick(r, ESCAPE_PLACES), pattern: pat };
      case 'colonSubtitle': {
        var sub = pick(r, SUBTITLES);
        if (chance(r, 0.18)) sub += ' ' + pick(r, ['II', 'III', 'IV']);
        return { text: noun + ': The ' + sub, pattern: pat };
      }
      case 'starVehicle': {
        var vt = pick(r, STAR_FIRST) + ' ' + pick(r, STAR_LAST);
        if (chance(r, 0.2)) vt += ': ' + pick(r, SUBTITLES);
        return { text: vt, pattern: pat };
      }
      case 'nounYear': return { text: noun + ' ' + pick(r, TITLE_YEARS), pattern: pat };
      case 'starRipoff': return { text: pick(r, RIPOFF_PRE) + ' ' + pick(r, RIPOFF_SUF), pattern: pat };
      case 'theLast': return { text: (chance(r, 0.35) ? 'The Final ' : 'The Last ') + (chance(r, 0.65) ? noun : pick(r, LAST_NOUNS)), pattern: pat };
      case 'dayOf': return { text: pick(r, ['Day', 'Dawn', 'Night', 'Hour', 'Season', 'Revenge', 'Return']) + ' of the ' + nounPl, pattern: pat };
      default: return { text: 'The ' + noun, pattern: 'theAdjNoun' };
    }
  }

  /* -------------------------------------------------------------- TAGLINES --
     Era registers. Earnestness overflow is available when the soul demands
     it: the tagline is far more solemn than the title warrants. */
  function deriveTagline(r, g) {
    var reg = g.production.era.register;
    var t = g.title.text;
    var s = g.novum.short;
    var stakes = g.geometry.stakes.label;
    var hero = g.dramatis.hero.replace(/^(a|an|the) /, '');
    var target = g.derivation ? g.derivation.target.n : 'the original';
    var wild = g.comps.wild;
    var venue = g.geometry.venue.label;
    var year = pick(r, TITLE_YEARS);

    var banks = {
      solemn: [
        'A nightmare from which ' + stakes + ' may never awaken!',
        'SEE it! TREMBLE at it! NOTHING can stop it!',
        'It came to claim ' + stakes + '!',
        'The most terrifying motion picture ever committed to film!',
        'Not even the army can stop ' + s + '!'
      ],
      solemn70s: [
        'In the future, ' + s + ' is the law.',
        'You have been warned.',
        'The year is ' + year + '. Pray it never comes.',
        'Somewhere between yesterday and tomorrow, something went wrong.',
        'This is the world of ' + year + '. Enjoy your stay.'
      ],
      vhs: [
        'In a world where ' + s + ', one ' + hero + ' is all that stands in the way.',
        'He came back from the future to settle the score.',
        'The future has a new master.',
        'This time, the war is personal. Also intergalactic.',
        'They took his world. Now he’s taking it back.',
        'Where ' + venue.replace(/^a |^the /, '') + ' meets the void.'
      ],
      dtv: [
        'Reality is about to be cancelled.',
        'Enter the game. Survive the game.',
        'The future is now. Unfortunately.',
        'Every game has a final level. This is not a game.',
        'Jack in. Tune out. Try to come back.'
      ],
      mock: [
        'You saw ' + target + '. This is legally distinct.',
        'From the studio that almost brought you ' + target + '.',
        target + ' meets ' + wild + '. In ' + venue + '.',
        'If you only see one film this year that is ' + t + ', make it this one.'
      ],
      stream: [
        'Based on the franchise you half-remember.',
        'A new chapter in a saga no one finished.',
        'The algorithm has spoken.',
        'Season one of a movie.'
      ]
    };
    var bank = banks[reg] || banks.vhs;
    // Earnestness overflow: a solemn line slapped on an absurd picture.
    if (g.soul.earnestness > 0.85 && chance(r, 0.3)) {
      return pick(r, [
        'One ' + hero + '. One destiny. ' + t + '.',
        'The fate of ' + stakes + ' rests on ' + hero + '.',
        'Every era gets the hero it deserves. This is yours.'
      ]);
    }
    return pick(r, bank);
  }

  /* --------------------------------------------------------------- LOGLINE -- */
  var HERO_VERBS = ['outwit', 'outrun', 'outfight', 'expose', 'outlast', 'humble', 'evade', 'out-bowl'];
  var DOOMS = ['falls', 'is forfeit', 'becomes a footnote', 'learns the price', 'goes quiet', 'is repossessed', 'is discontinued'];
  function deriveLogline(r, g) {
    var hero = g.dramatis.hero;
    var threat = g.threat.label;
    var line = cap(hero) + ' must ' + pick(r, HERO_VERBS) + ' ' + threat +
      ' when ' + g.novum.premise + ' — or ' + g.geometry.stakes.label + ' ' + pick(r, DOOMS) + '.';
    if (g.dramatis.sidekick && chance(r, 0.6)) {
      line += ' Helped only by ' + g.dramatis.sidekick + '.';
    }
    return line;
  }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  /* --------------------------------------------------------- FAILURE MODES --
     Badness is a vector, not a scalar. Detectors read the genome and return
     a deadpan reason — the judge-embryo. */
  var FAILURE_DETECTORS = [
    {
      id: 'scale-misjudgment', label: 'scale misjudgment',
      test: function (g) {
        var gap = g.geometry.stakes.rank - g.geometry.venue.rank;
        if (gap >= 4) return 'The fate of ' + g.geometry.stakes.label + ' will be decided in ' + g.geometry.venue.label + '.';
        return null;
      }
    },
    {
      id: 'miscasting', label: 'miscasting',
      test: function (g) {
        if (g.dramatis.miscast) return cap(g.dramatis.star.label) + ' as ' + g.dramatis.hero + ': the casting call is the special effect.';
        return null;
      }
    },
    {
      id: 'earnestness-overflow', label: 'earnestness overflow',
      test: function (g) {
        if (g.soul.earnestness > 0.82) return 'The one-sheet speaks of ' + g.geometry.stakes.label + '; the title says “' + g.title.text + '.” No one told the tagline.';
        return null;
      }
    },
    {
      id: 'cynical-transcription', label: 'cynical transcription',
      test: function (g) {
        if (g.derivation && g.derivation.distance.d <= 1 && g.soul.sincerity < 0.45)
          return 'One step removed from ' + g.derivation.target.n + '; the lawyers were closer than the art department.';
        return null;
      }
    },
    {
      id: 'failed-transcription', label: 'failed transcription',
      test: function (g) {
        if (g.derivation && g.derivation.distance.d <= 2 && g.soul.sincerity >= 0.45)
          return 'It has seen ' + g.derivation.target.n + ', and remembers it fondly, incorrectly. What got lost: ' + g.derivation.loss + '.';
        return null;
      }
    },
    {
      id: 'auteur-overreach', label: 'auteur overreach',
      test: function (g) {
        if (g.causal.id === 'vision-first' && g.soul.ambition > 0.6 && g.soul.competence < 0.5)
          return 'One mind. No notes. ' + g.production.budget.blurb.charAt(0).toUpperCase() + g.production.budget.blurb.slice(1) + '.';
        return null;
      }
    },
    {
      id: 'budget-hallucination', label: 'budget hallucination',
      test: function (g) {
        if (g.soul.ambition - g.soul.budget > 0.45)
          return 'The poster will promise ' + g.geometry.stakes.label + '; the budget reaches ' + g.geometry.venue.label + '.';
        return null;
      }
    },
    {
      id: 'trope-collision', label: 'trope collision',
      test: function (g) {
        var a = g.derivation ? g.derivation.target.n : 'the picture it thinks it is';
        if (g.comps.wild && g.comps.wild !== a) return a + ' meets ' + g.comps.wild + ' — in ' + g.geometry.venue.label + '. The collision is the content.';
        return null;
      }
    },
    {
      id: 'footage-seam', label: 'footage seam',
      test: function (g) {
        if (g.causal.id === 'footage-first') return 'Two films are visible at all times, like a double exposure.';
        return null;
      }
    },
    {
      id: 'spoiler-tagline', label: 'spoiler in the marketing',
      test: function (g) {
        if (g.commitment.some(function (c) { return c.spoiler; })) return 'The twist is on the poster. The poster is the twist.';
        return null;
      }
    },
    {
      id: 'overexplanation', label: 'overexplanation',
      test: function (g) {
        if (g.commitment.some(function (c) { return c.explain; })) return 'The picture explains the plot. The plot explains the picture. Nothing is left to the imagination, including the imagination.';
        return null;
      }
    },
    {
      id: 'toy-mandate', label: 'toy mandate',
      test: function (g) {
        if (g.causal.id === 'toy-first') return 'Every prop is available in stores; several props are ONLY available in stores.';
        return null;
      }
    },
    {
      id: 'sequel-desperation', label: 'sequel desperation',
      test: function (g) {
        if (g.commitment.some(function (c) { return c.sequel; })) return 'The ending is, technically, a trailer.';
        return null;
      }
    }
  ];

  /* -------------------------------------------------------------- SAMPLING --
     Dependency-ordered. Each field conditions on what came before, so the
     failures COHERE — a bad pitch whose badnesses match reads as authentic. */
  function generate(seed) {
    var r = rngFor(seed);
    var g = { schema: SCHEMA_VERSION, seed: seed };

    // 1. The soul (continuous coordinates).
    g.soul = sampleSoul(r);

    // 2. Era → milieu → causal order.
    var era = wpick(r, ERAS, function (e) { return e.weight; });
    var milieuKey = kpick(r, era.milieus);
    var milieu = MILIEUS[milieuKey];
    var causalKey = kpick(r, milieu.causal);
    g.causal = { id: causalKey, label: CAUSAL_ORDERS[causalKey].label, blurb: CAUSAL_ORDERS[causalKey].blurb };

    // 3. Budget tier (milieu- and causal-weighted).
    var budget = wpick(r, BUDGET_TIERS, function (b) {
      if (causalKey === 'vision-first') return b.id === 'inheritance' ? 6 : 1;
      if (milieuKey === 'cannon' || milieuKey === 'presale') return b.id === 'pretend' ? 5 : (b.id === 'exploitation' ? 2 : 0.5);
      if (milieuKey === 'asylum' || milieuKey === 'turkish') return b.id === 'shoestring' ? 5 : 1;
      return b.id === 'exploitation' ? 3 : 1;
    });
    g.soul.budget = rf(r, 0.04, budget.hi);
    if (g.soul.believer) g.soul.ambition = Math.min(1, g.soul.ambition + (causalKey === 'vision-first' ? 0.2 : 0));
    g.region = classifyRegion(g.soul);

    // 4. Derivation: what they're ripping off. Vision-first often has no
    //    earthly target — or a "target" no court would recognize.
    var derivation = null;
    var eraMid = { atomic50s: 1957, spaceage60s: 1967, dystopia70s: 1976, vhs80s: 1984, dtv90s: 1994, mock00s: 2006, stream10s: 2018 }[era.id];
    if (causalKey === 'vision-first') {
      if (chance(r, 0.55)) derivation = { target: pick(r, VISION_TARGETS), distance: DISTANCES[2], loss: pick(r, TRANSCRIPTION_LOSSES), visionary: true };
    } else if (causalKey === 'ripoff-first' || era.id === 'mock00s' || chance(r, 0.62)) {
      var pool = TARGETS.filter(function (t) { return t.y <= eraMid + 1; });
      if (pool.length) {
        var target = pick(r, pool);
        var dist = wpick(r, DISTANCES, function (d) {
          if (milieuKey === 'turkish') return d.d === 1 ? 8 : 1;
          if (milieuKey === 'italian' || milieuKey === 'asylum') return d.d <= 2 ? 4 : 1;
          if (causalKey === 'ripoff-first') return d.d <= 2 ? 4 : 2;
          return d.d === 3 ? 4 : (d.d === 2 ? 2 : 0.5);
        });
        derivation = { target: target, distance: dist, loss: pick(r, TRANSCRIPTION_LOSSES) };
      }
    }
    g.derivation = derivation;

    // 5. Novum (era-weighted). Mockbuster pathway: the target is the novum.
    var novum;
    if ((era.id === 'mock00s' || (milieuKey === 'asylum' && chance(r, 0.5))) && derivation && chance(r, 0.65)) {
      novum = NOVAE[NOVAE.length - 1]; // mockmorph
      novum = Object.assign({}, novum, {
        premise: 'a situation legally distinct from ' + derivation.target.n + ', re-enacted at a fraction of the budget by people who saw the trailer twice',
        short: 'you have seen ' + derivation.target.n + '; this is near it'
      });
    } else {
      novum = wpick(r, NOVAE.slice(0, NOVAE.length - 1), function (n) {
        return (n.eras[era.id] || 0) + 0.05;
      });
      // Creature-tagged nova resolve their nouns + premise compositionally,
      // which multiplies the title vocabulary (Attack of the Giant Hornets…).
      if (novum.creature) {
        var cr = pick(r, CREATURES);
        novum = {
          cat: novum.cat, eras: novum.eras,
          premise: novum.premise.replace('{sing}', lc(cr[0])).replace('{pl}', lc(cr[1])),
          short: novum.short,
          noun: novum.noun.replace('{name}', cr[0]).replace('{pl}', cr[1]),
          nounPl: novum.nounPl.replace('{name}', cr[0]).replace('{pl}', cr[1])
        };
      }
    }
    g.novum = { cat: novum.cat, premise: novum.premise, short: novum.short, noun: novum.noun, nounPl: novum.nounPl };

    // 6. Dramatis: hero, star, sidekick. Star-first and vision-first bias
    //    the star pool; miscasting is derived, not decorated.
    var hero = pick(r, HEROES);
    var star;
    if (causalKey === 'vision-first') star = pick(r, VISION_STARS);
    else if (causalKey === 'star-first') star = pick(r, STARS);
    else star = wpick(r, STARS, function (s) { return s.miscast ? 1.4 : 1; });
    var sidekick = chance(r, 0.45) ? pick(r, SIDEKICKS) : null;
    g.dramatis = {
      hero: hero, star: star,
      miscast: !!star.miscast,
      sidekick: sidekick
    };

    // 7. Threat.
    g.threat = pick(r, THREATS);

    // 8. Geometry of stakes. Deliberate misjudgment injection: big stakes
    //    sometimes get a venue that cannot see them from where it stands.
    var stakes = wpick(r, STAKES, function (s) { return s.rank <= 1 ? 1 : s.rank; });
    var venue = wpick(r, VENUES, function (v) { return 3 - v.rank * 0.6; });
    if (stakes.rank - venue.rank < 4 && chance(r, 0.38)) {
      venue = wpick(r, VENUES.filter(function (v) { return v.rank <= 1; }), function () { return 1; });
    }
    g.geometry = { stakes: stakes, venue: venue, gap: stakes.rank - venue.rank };

    // 9. THE COMMITMENT — forced. Sometimes two.
    var commitments = [pick(r, COMMITMENTS)];
    if (chance(r, 0.22)) {
      var c2 = pick(r, COMMITMENTS);
      if (c2.text !== commitments[0].text) commitments.push(c2);
    }
    g.commitment = commitments;

    // 10. Production context assembled.
    g.production = {
      era: { id: era.id, span: era.span, label: era.label, anxiety: era.anxiety },
      milieu: { id: milieuKey, label: milieu.label, blurb: milieu.blurb },
      budget: { id: budget.id, label: budget.label, blurb: budget.blurb },
      window: pick(r, SALES_WINDOWS)
    };

    // 11. Comps wildcard (needed by taglines + detectors).
    g.comps = { wild: pick(r, COMP_WILDCARDS) };

    // 12. Derived outputs: title, tagline, logline, comps line.
    g.title = deriveTitle(r, g);
    g.tagline = deriveTagline(r, g);
    g.logline = deriveLogline(r, g);
    var compA = derivation ? derivation.target.n : pick(r, COMP_WILDCARDS);
    if (compA === g.comps.wild) g.comps.wild = pick(r, COMP_WILDCARDS);
    g.comps.line = compA + ' meets ' + g.comps.wild + ' — in ' + venue.label + '.';

    // 13. Failure-mode annotation (the judge-embryo).
    g.failures = [];
    for (var i = 0; i < FAILURE_DETECTORS.length; i++) {
      var reason = FAILURE_DETECTORS[i].test(g);
      if (reason) g.failures.push({ id: FAILURE_DETECTORS[i].id, label: FAILURE_DETECTORS[i].label, reason: reason });
    }

    return g;
  }

  /* -------------------------------------------------------------- EXPORTS -- */
  var FIPO = {
    SCHEMA_VERSION: SCHEMA_VERSION,
    generate: generate,
    // banks exposed for the selftest and the future judge
    ERAS: ERAS, MILIEUS: MILIEUS, CAUSAL_ORDERS: CAUSAL_ORDERS,
    NOVAE: NOVAE, COMMITMENTS: COMMITMENTS, FAILURE_DETECTORS: FAILURE_DETECTORS,
    classifyRegion: classifyRegion
  };
  global.FIPO = FIPO;
  if (typeof module !== 'undefined' && module.exports) module.exports = FIPO;
})(typeof window !== 'undefined' ? window : globalThis);
