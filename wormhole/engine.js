// wormhole — the academic wormhole roulette engine.
//
// Spin the wheel and fall down a rabbit hole: one seed → one entire niche
// academic micro-field, rendered as a dossier. The foundational open-access
// paper, the total granted funding broken down by funder, the roster of
// low-impact journals nobody reads, and — the good part — the incestuous web
// of labs, PIs, and feuding theories that make up the field's whole tiny world.
//
// It is GENERATED, not curated: a seeded combinatorial engine (xmur3 +
// mulberry32, same lineage as borges/js/prng.js and rite/names/engine.js) so
// every seed yields exactly the same field, for ever, on any machine. That
// determinism is what makes a permalink (/f/<seed>) mean something and the
// "roulette" honest — the wheel only chooses which deterministic field to open.
//
// Everything here is FICTIONAL. The fields, papers, DOIs, funders, journals,
// grant amounts and labs are invented satire of how micro-disciplines actually
// look. No real paper, person, or grant is described. Do not cite any of it.
//
// Self-contained (no imports, no build) so it runs identically in the worker,
// the browser (loaded as a module), and node (engine.selftest.mjs). Attaches to
// globalThis so the node selftest can reach it without window.

(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var W = NS.WORMHOLE = NS.WORMHOLE || {};

  // ---------- seeded PRNG ----------
  function xmur3(str) {
    var h = 1779033703 ^ str.length;
    for (var i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      return (h ^= h >>> 16) >>> 0;
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
  function Rand(seedStr) {
    var next = mulberry32(xmur3(String(seedStr))());
    var self = {
      f: function () { return next(); },
      int: function (min, max) { return min + Math.floor(next() * (max - min + 1)); },
      chance: function (p) { return next() < p; },
      pick: function (arr) { return arr[Math.floor(next() * arr.length)]; },
      pickw: function (arr, w) {
        var total = 0, ws = [], i;
        for (i = 0; i < arr.length; i++) { var x = Math.max(0, w(arr[i], i)); ws.push(x); total += x; }
        if (total <= 0) return self.pick(arr);
        var r = next() * total;
        for (i = 0; i < arr.length; i++) { r -= ws[i]; if (r <= 0) return arr[i]; }
        return arr[arr.length - 1];
      },
      sample: function (arr, k) {
        var pool = arr.slice(), out = [];
        k = Math.min(k, pool.length);
        for (var i = 0; i < k; i++) { var j = Math.floor(next() * pool.length); out.push(pool[j]); pool.splice(j, 1); }
        return out;
      },
      shuffle: function (arr) {
        var a = arr.slice();
        for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(next() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
        return a;
      },
      // gaussian-ish via sum of uniforms, in [0,1)
      bell: function () { return (next() + next() + next()) / 3; },
      fork: function (name) { return Rand(seedStr + "::" + name); }
    };
    return self;
  }

  // ---------- the subject wardrobe ----------
  // Each subject carries its own field name, a one-line "what it studies", and a
  // small term bank that keeps paper titles / theories / grants thematically
  // coherent (the way rite/names charters a culture). `parent` is the broad
  // discipline the wormhole opens off of.
  var SUBJECTS = [
    { n: "lichen", field: "Lichenometry", parent: "Geomorphology", studies: "dating exposed rock surfaces by the radial growth of crustose lichens", terms: ["thallus", "substrate", "colonization curve", "saxicolous cover", "growth-rate calibration"] },
    { n: "birdsong", field: "Ornithomusicology", parent: "Bioacoustics", studies: "the tonal grammar of birdsong as if it were composed music", terms: ["motif repertoire", "syllable transition", "dialect drift", "frequency contour", "song-type sharing"] },
    { n: "folktale", field: "Comparative Folk-Narratology", parent: "Folkloristics", studies: "recurring plot-atoms across unrelated oral traditions", terms: ["tale-type", "motifeme", "oicotype", "transmission chain", "narrative kernel"] },
    { n: "dust", field: "Aeolian Micro-sedimentology", parent: "Earth Science", studies: "the provenance and settling behaviour of household and desert dust", terms: ["grain-size mode", "provenance signature", "saltation flux", "loess fraction", "deposition rate"] },
    { n: "laughter", field: "Gelotology", parent: "Affective Science", studies: "the physiology and social choreography of laughter", terms: ["voiced bout", "duration envelope", "contagion cascade", "mirth index", "turn-yielding cue"] },
    { n: "rust", field: "Corrosion Aesthetics", parent: "Materials Culture", studies: "patina and decay as objects of connoisseurship rather than failure", terms: ["oxide bloom", "patina taxonomy", "weathering front", "surface biography", "arrested decay"] },
    { n: "hagiography", field: "Computational Hagiography", parent: "Medieval Studies", studies: "saints' lives as a quantifiable narrative genre", terms: ["miracle count", "topos frequency", "recension stemma", "cult diffusion", "vita formula"] },
    { n: "potsherds", field: "Ceramic Petrography", parent: "Archaeology", studies: "thin-sectioned pottery fragments and their mineral fingerprints", terms: ["temper inclusion", "fabric group", "firing atmosphere", "clay matrix", "provenance cluster"] },
    { n: "marginalia", field: "Marginalia Studies", parent: "Book History", studies: "what readers scribbled in the margins of old books", terms: ["annotating hand", "gloss density", "reader response", "manicule", "interleaved note"] },
    { n: "whistling", field: "Whistled-Language Phonology", parent: "Linguistics", studies: "whistled registers that carry full languages across valleys", terms: ["pitch envelope", "vowel locus", "carrying distance", "articulatory whistle", "tonal transposition"] },
    { n: "lullaby", field: "Ethnolullabiology", parent: "Ethnomusicology", studies: "the cross-cultural structure of songs sung to infants", terms: ["rocking meter", "descending contour", "nonsense refrain", "soothing tempo", "maternal register"] },
    { n: "epitaphs", field: "Epigraphic Thanatology", parent: "Epigraphy", studies: "the formulae and typography of gravestone inscriptions", terms: ["formula slot", "lettering hand", "abbreviation set", "commemorative verb", "stone wear"] },
    { n: "graffiti", field: "Palaeo-graffitology", parent: "Archaeology", studies: "ancient and pre-modern scratched wall writing", terms: ["incised gloss", "wall stratigraphy", "authorial hand", "apotropaic mark", "palimpsest layer"] },
    { n: "potholes", field: "Pavement Distress Semiotics", parent: "Civil Engineering", studies: "road defects read as signs of civic neglect and repair culture", terms: ["distress index", "patch typology", "fatigue cracking", "repair latency", "surface roughness"] },
    { n: "queues", field: "Queue Ethnography", parent: "Sociology", studies: "how people form, police, and abandon waiting lines", terms: ["place-holding norm", "balking rate", "spatial cohesion", "jump event", "server tempo"] },
    { n: "doorways", field: "Threshold Studies", parent: "Architectural Anthropology", studies: "the ritual and cognitive weight of thresholds and doorways", terms: ["liminal marker", "boundary rite", "location-updating effect", "lintel motif", "passage sequence"] },
    { n: "footnotes", field: "Paratextual Studies", parent: "Textual Scholarship", studies: "footnotes, endnotes and apparatus as a genre of their own", terms: ["apparatus density", "citation nesting", "digression ratio", "reference drift", "glossing layer"] },
    { n: "boredom", field: "Boredom Studies", parent: "Psychology", studies: "the phenomenology and productivity of being bored", terms: ["time perception", "arousal trough", "mind-wandering rate", "situational tedium", "engagement gap"] },
    { n: "tides", field: "Tidal Folk-hydrology", parent: "Coastal Studies", studies: "vernacular knowledge of tides before the tide table", terms: ["spring-neap lore", "moon-phase rule", "shore calendar", "flood mark", "estuarine reckoning"] },
    { n: "moss", field: "Bryological Chronology", parent: "Botany", studies: "using moss growth and cushions to age landscapes", terms: ["cushion increment", "gametophyte age", "colonization front", "moisture regime", "peat accretion"] },
    { n: "coral", field: "Sclerochronology", parent: "Marine Science", studies: "reading growth bands in coral and shell like tree rings", terms: ["density band", "growth increment", "isotope proxy", "stress marker", "annual couplet"] },
    { n: "comets", field: "Cometary Folk-astronomy", parent: "History of Science", studies: "how pre-modern cultures recorded and read comets", terms: ["apparition record", "portent reading", "tail description", "sighting chronology", "broom-star omen"] },
    { n: "fungi", field: "Myco-heritage Studies", parent: "Ethnomycology", studies: "the cultural roles of mushrooms in ritual, food and fear", terms: ["fruiting calendar", "fairy-ring lore", "foraging taboo", "spore folklore", "mycophobia index"] },
    { n: "dialect", field: "Micro-dialectology", parent: "Linguistics", studies: "speech variation between neighbouring villages", terms: ["isogloss bundle", "lexical variant", "vowel shift front", "prestige gradient", "shibboleth token"] },
    { n: "shipwrecks", field: "Maritime Taphonomy", parent: "Nautical Archaeology", studies: "how wrecks decay and scatter on the seabed", terms: ["scour pit", "site formation", "hull collapse", "cargo dispersal", "wood-borer damage"] },
    { n: "board games", field: "Ludo-archaeology", parent: "Archaeology", studies: "ancient board games reconstructed from boards and pieces", terms: ["mechanism reconstruction", "gaming stone", "rule inference", "playability test", "board typology"] },
    { n: "knots", field: "Knot Ethnomathematics", parent: "Ethnomathematics", studies: "the combinatorics implicit in traditional knots and cordage", terms: ["crossing number", "cord topology", "hitch grammar", "encoding capacity", "quipu register"] },
    { n: "bells", field: "Campanology", parent: "Organology", studies: "the tuning, ringing and social order of bells", terms: ["strike note", "change-ringing method", "partial spectrum", "peal sequence", "founder mark"] },
    { n: "scarecrows", field: "Agrarian Effigy Studies", parent: "Material Folklore", studies: "the design and belief-world of field effigies", terms: ["deterrent efficacy", "effigy typology", "seasonal cycle", "apotropaic form", "guardian motif"] },
    { n: "old maps", field: "Deep Cartographic Hermeneutics", parent: "History of Cartography", studies: "the silences, errors and rhetoric of historical maps", terms: ["cartographic silence", "projection bias", "toponym drift", "marginal decoration", "authority claim"] },
    { n: "dreams", field: "Oneirostatistics", parent: "Cognitive Science", studies: "the statistical structure of large dream-report corpora", terms: ["report length", "character density", "emotion valence", "bizarreness score", "continuity ratio"] },
    { n: "silence", field: "Acoustic Absence Studies", parent: "Sound Studies", studies: "silence, pause and quiet as structured acoustic objects", terms: ["pause duration", "noise floor", "expectancy gap", "quiet zone", "attentive hush"] },
    { n: "weeds", field: "Ruderal Ecology", parent: "Ecology", studies: "the plants that colonize disturbed and abandoned ground", terms: ["disturbance regime", "seed-bank persistence", "pioneer cover", "edge community", "colonization rate"] },
    { n: "tattoos", field: "Dermatoglyphic Anthropology", parent: "Anthropology", studies: "the social grammar of traditional tattooing", terms: ["motif syntax", "placement rule", "initiation marker", "pigment recipe", "kin signalling"] },
    { n: "riddles", field: "Enigmatology", parent: "Folkloristics", studies: "the formal structure and social use of riddles", terms: ["block element", "misleading image", "answer set", "performance frame", "true-riddle form"] },
    { n: "scent", field: "Historical Osmology", parent: "Sensory History", studies: "how past societies described and valued smell", terms: ["odour lexicon", "scent hierarchy", "olfactory metaphor", "aroma trade", "smellscape"] },
    { n: "clouds", field: "Nephelography", parent: "Meteorological Humanities", studies: "the classification and cultural reading of clouds", terms: ["genus-species key", "sky lore", "observer variance", "formation stage", "portent cloud"] },
    { n: "cheese", field: "Turophilic Microbiology", parent: "Food Science", studies: "the microbial ecology of traditional cheese rinds", terms: ["rind community", "ripening flora", "flavour compound", "starter culture", "cave microbiome"] },
    { n: "cemeteries", field: "Necrogeography", parent: "Cultural Geography", studies: "the spatial logic of how the dead are arranged", terms: ["plot orientation", "burial density", "landscape zoning", "monument gradient", "sacred boundary"] },
    { n: "handwriting", field: "Palaeographic Kinematics", parent: "Palaeography", studies: "reconstructing the pen movements behind old scripts", terms: ["stroke order", "ductus", "pen lift", "letterform drift", "scribal hand"] },
    { n: "wells", field: "Hydro-archaeology of Wells", parent: "Archaeology", studies: "wells as time capsules of daily and ritual life", terms: ["fill sequence", "votive deposit", "water-table proxy", "lining typology", "abandonment layer"] },
    { n: "lace", field: "Textile Combinatorics", parent: "Craft Studies", studies: "the formal patterns encoded in bobbin and needle lace", terms: ["thread crossing", "pattern grammar", "repeat unit", "tension map", "pricking chart"] },
    { n: "mazes", field: "Labyrinthology", parent: "Design History", studies: "the topology and symbolism of mazes and labyrinths", terms: ["unicursal path", "branching ratio", "goal distance", "turn sequence", "wall topology"] },
    { n: "sundials", field: "Gnomonics", parent: "History of Science", studies: "the geometry and craft of sundials", terms: ["gnomon angle", "hour line", "declination correction", "dial furniture", "shadow locus"] },
    { n: "wallpaper", field: "Vernacular Pattern Studies", parent: "Design History", studies: "the symmetry groups hiding in domestic wallpaper", terms: ["wallpaper group", "repeat motif", "colour-count", "glide symmetry", "block print"] }
  ];

  var MODIFIERS = [
    "Computational", "Quantitative", "Comparative", "Critical", "Post-colonial",
    "Applied", "Evolutionary", "Cognitive", "Digital", "Experimental",
    "Speculative", "Forensic", "Vernacular", "Ecological", "Feminist",
    "Radical", "Historical", "Molecular"
  ];

  var METHODS = [
    "multilevel regression", "critical discourse analysis", "GIS density mapping",
    "stable-isotope analysis", "social-network analysis", "close reading",
    "ethnographic fieldwork", "Bayesian phylogenetics", "corpus linguistics",
    "radiocarbon calibration", "agent-based simulation", "grounded theory",
    "spectral decomposition", "thin-section microscopy", "topic modelling"
  ];
  var PROSE_ADJ = ["preliminary", "robust", "tentative", "contested", "unified", "provisional", "situated", "emergent", "granular", "unexpected", "modest", "significant"];
  var PLACES = ["the Faroes", "rural Anatolia", "the Scottish borders", "coastal Kerala", "highland Peru", "the Ruhr valley", "eastern Hokkaido", "the Pripet marshes", "the Aeolian islands", "outer Tasmania", "the Carpathians", "the Yorkshire dales", "lowland Gujarat", "the Jutland coast", "upland Chiapas"];

  // ---------- name generator (real-flavoured author / PI names) ----------
  var GIVEN = [
    "Margaret", "Anika", "Tomás", "Yuki", "Priya", "Lars", "Ingrid", "Hassan", "Mei",
    "Eleanor", "Dmitri", "Fatima", "Rowan", "Kwame", "Sofia", "Henrik", "Anaïs", "Rajesh",
    "Beatrix", "Olek", "Noa", "Kenji", "Lucia", "Emeka", "Astrid", "Farida",
    "Wilhelm", "Saoirse", "Bao", "Camille", "Nils", "Theodora", "Amir", "Greta", "Jun",
    "Cormac", "Ludmila", "Tariq", "Beata", "Hiroshi", "Marta", "Owen", "Yara", "Sven"
  ];
  var SURNAME = [
    "Ashworth", "Voronova", "Okonkwo", "Nakamura", "Fernández", "Bergström", "Haddad", "Chen",
    "Vasquez", "Kowalski", "MacLeod", "Ibrahim", "Rossi", "Petrova", "Singh", "van der Meer",
    "Lindqvist", "Nakashima", "Delacroix", "Abramson", "Yılmaz", "O'Rourke", "Marchetti",
    "Novak", "Tanaka", "Bianchi", "Halvorsen", "Mensah", "Kaufmann", "Dubois", "Reyes",
    "Sørensen", "Weber", "Costa", "Adeyemi", "Grönholm", "Farkas", "Larkin", "Pereira",
    "Schäfer", "Nystrom", "Bhatt", "Whitcombe", "Andersson", "Fabri"
  ];
  function personName(r) { return r.pick(GIVEN) + " " + r.pick(SURNAME); }
  function surnameOnly(r) { return r.pick(SURNAME); }

  var UNIV_HEAD = [
    "University of", "University of", "Institute of Technology,", "Free University of",
    "Polytechnic of", "College of"
  ];
  var UNIV_PLACE = [
    "Utrecht", "Ljubljana", "Aberystwyth", "Tromsø", "Coimbra", "Adelaide", "Tartu",
    "Groningen", "Trondheim", "Palermo", "Dunedin", "Ghent", "Reykjavík", "Lund",
    "Wollongong", "Turku", "Maastricht", "Kraków", "Bergen", "Winnipeg", "Cork",
    "Leipzig", "Padua", "Kanazawa", "Salamanca", "Uppsala"
  ];
  function university(r) {
    if (r.chance(0.25)) return surnameOnly(r) + " " + r.pick(["College", "University", "Institute"]);
    return r.pick(UNIV_HEAD) + " " + r.pick(UNIV_PLACE);
  }

  // ---------- helpers ----------
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function article(word) { return /^[aeiou]/i.test(word) ? "an" : "a"; }
  function money(n) {
    if (n >= 1e6) return "$" + (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + "M";
    if (n >= 1e3) return "$" + Math.round(n / 1e3) + "k";
    return "$" + n;
  }
  function roundish(n, step) { return Math.round(n / step) * step; }

  // ---------- field identity ----------
  function fieldName(seed) {
    var r = Rand(seed + "::name");
    var subj = r.pick(SUBJECTS);
    var mod = r.chance(0.55) ? r.pick(MODIFIERS) + " " : "";
    return mod + subj.field;
  }

  var STATUSES = [
    { s: "emergent", note: "a handful of papers, one very online founder, and a manifesto" },
    { s: "consolidating", note: "past the manifesto stage; now fighting over what the core question is" },
    { s: "mature", note: "settled canon, settled feuds, and a graying conference crowd" },
    { s: "moribund", note: "two labs left and a listserv that mostly forwards obituaries" },
    { s: "in schism", note: "split into rival factions after a famously bitter special issue" },
    { s: "enjoying a minor renaissance", note: "revived by a cheap new method and a viral thread" },
    { s: "contested", note: "adjacent fields deny it is a field at all" },
    { s: "dormant", note: "nothing new since the founder retired, but the journal soldiers on" }
  ];

  // ---------- paper ----------
  function makePaper(r, field, subj, foundYear) {
    var term = r.pick(subj.terms);
    var term2 = r.pick(subj.terms);
    var method = r.pick(METHODS);
    var adj = r.pick(PROSE_ADJ);
    var place = r.pick(PLACES);
    var g = subj.n; // subject noun
    var templates = [
      "Toward a " + adj + " theory of " + term,
      "The " + term + " problem in " + field.replace(/^\w+\s/, "") + ": a " + adj + " reappraisal",
      cap(term) + " revisited: evidence from " + place,
      "On the " + g + " and its " + term,
      "A " + adj + " framework for the study of " + g,
      "Rethinking " + term + ": " + g + " and the limits of " + method,
      cap(term) + " as a unit of analysis",
      "Notes toward a grammar of " + g,
      "The hidden order of " + g + ": " + term + " reconsidered",
      "Between " + term + " and " + term2 + ": mapping the field"
    ];
    var title = r.pick(templates);

    var nAuth = r.pickw([1, 2, 3, 4], function (x) { return [3, 5, 3, 1][x - 1]; });
    var authors = [];
    for (var i = 0; i < nAuth; i++) authors.push({ name: personName(r), affil: university(r) });

    var year = foundYear;
    var vol = year - r.int(1994, 2004);
    if (vol < 1) vol = 1;
    var issue = r.int(1, 4);
    var startPg = r.int(1, 240);
    var pages = startPg + "–" + (startPg + r.int(9, 34));
    var abbr = subj.n.replace(/[^a-z]/gi, "").slice(0, 4).toLowerCase() || "xxx";
    var doi = "10." + r.int(1000, 9999) + "/" + abbr + "." + year + "." + r.int(100, 999);
    // citations: heavy-tailed, foundational papers accrue over the years
    var age = 2026 - year;
    var citations = Math.round(r.int(4, 40) + age * r.int(1, 9) * r.f());

    var abs =
      "This paper argues that " + subj.studies + " constitutes " + article(adj) + " " + adj + " and largely neglected object of study. " +
      "Drawing on " + method + " across " + r.int(3, 40) + " cases from " + place + ", we show that " +
      term + " behaves as a stable and measurable feature of " + g + ". " +
      "We propose the term " + JSON.stringify(cap(term.split(" ")[0]) + (r.chance(0.5) ? "-index" : " signature")).slice(1, -1) +
      " and outline a research programme for the emerging discipline of " + field + ". " +
      "Our findings are " + r.pick(["preliminary but suggestive", "robust to reasonable perturbation", "at odds with the received view", "modest yet, we believe, foundational"]) + ".";

    var journal = null; // filled by caller (needs journal list)
    return { title: title, authors: authors, year: year, volume: vol, issue: issue, pages: pages, doi: doi, citations: citations, abstract: abs, oa: true, journal: journal };
  }

  // ---------- journals ----------
  var J_HEAD = ["Journal", "Annals", "Bulletin", "Review", "Archives", "Quarterly", "Proceedings", "Studies", "Papers", "Transactions"];
  var PUBLISHERS = [
    "Brill", "Routledge (subsidiary rights)", "the Society for " , "Peeters", "De Gruyter (open section)",
    "a university press annex", "Whitmarsh & Fenn", "the field's own listserv co-op", "Lambert Academic",
    "Verlag Dröm", "an unpaid editorial board", "MDPI-adjacent", "Ediciones Marginalia"
  ];
  function makeJournals(r, field, subj) {
    var n = r.int(3, 6);
    var out = [];
    var used = {};
    for (var i = 0; i < n; i++) {
      var head = r.pick(J_HEAD);
      var adj = r.chance(0.5) ? r.pick(MODIFIERS) + " " : "";
      var core = r.chance(0.5) ? subj.field : cap(subj.n) + " Studies";
      var name = "The " + head + " of " + adj + core;
      if (r.chance(0.2)) name = adj + core + " " + r.pick(["Notes", "Letters", "Today", "International"]);
      if (used[name]) { name = name + " (n.s.)"; }
      used[name] = 1;
      var pub = r.pick(PUBLISHERS);
      if (pub === "the Society for ") pub = "the Society for " + core;
      var founded = r.int(1968, 2019);
      // low impact: skewed toward ~0.1–1.3
      var impact = Math.round((0.1 + r.bell() * 1.9) * 100) / 100;
      out.push({
        name: name,
        publisher: pub,
        founded: founded,
        impact: impact,
        perYear: r.int(6, 40),
        oa: r.chance(0.55),
        predatoryIndex: r.chance(0.25) ? r.pick(["low", "whiffs of it", "one editor is three people"]) : "none detected"
      });
    }
    // sort by impact desc so the "flagship" is first
    out.sort(function (a, b) { return b.impact - a.impact; });
    return out;
  }

  // ---------- funding ----------
  var FUNDER_TEMPLATES = [
    function (r, subj) { return "National " + cap(subj.n) + " Foundation"; },
    function (r, subj) { return r.pick(UNIV_PLACE) + " Research Council"; },
    function (r) { return "The " + surnameOnly(r) + " Foundation"; },
    function (r) { return "EU Framework Programme (" + r.pick(["Horizon", "Marie Curie", "COST Action", "ERC Starting"]) + ")"; },
    function (r) { return r.pick(UNIV_PLACE) + " Institute for Advanced Study"; },
    function (r, subj) { return "Society for " + subj.field + " (small grants)"; },
    function (r) { return surnameOnly(r) + " & " + surnameOnly(r) + " Bequest"; },
    function (r) { return "a lapsed departmental discretionary fund"; }
  ];
  function makeFunding(r, subj, foundYear) {
    var nF = r.int(2, 4);
    var funders = r.sample(FUNDER_TEMPLATES, nF);
    var byFunder = [];
    var total = 0;
    for (var i = 0; i < funders.length; i++) {
      var grants = r.int(1, 12);
      // per-grant small: niche fields get scraps
      var per = roundish(r.int(18, 260) * 1000, 1000);
      var amt = grants * per;
      total += amt;
      var term = r.pick(subj.terms);
      byFunder.push({
        funder: funders[i](r, subj),
        grants: grants,
        amount: amt,
        topGrant: "“" + cap(r.pick(["Mapping", "Toward", "Understanding", "Rescuing", "Digitizing", "Modelling"])) + " " + term + " in " + subj.n + "”"
      });
    }
    byFunder.sort(function (a, b) { return b.amount - a.amount; });
    // trend: yearly totals across the field's life, noisy
    var trend = [];
    var y0 = foundYear, y1 = 2025;
    var span = Math.max(1, y1 - y0);
    var peak = y0 + Math.floor(span * (0.4 + r.f() * 0.4));
    var base = total / span;
    for (var y = y0; y <= y1; y++) {
      var dist = Math.abs(y - peak) / span;
      var v = base * (1.6 - dist * 1.4) * (0.6 + r.f() * 0.9);
      trend.push({ year: y, amount: Math.max(0, roundish(v, 5000)) });
    }
    return {
      total: total,
      currency: "USD-equivalent",
      byFunder: byFunder,
      trend: trend,
      note: "Field-wide granted funding since founding, best-effort reconstruction from acknowledgements."
    };
  }

  // ---------- the incestuous web ----------
  var CAMPS = ["formalist", "empiricist", "revisionist", "structuralist", "materialist", "computational", "phenomenological", "traditionalist"];
  var LAB_HEAD = ["Lab", "Group", "Unit", "Centre", "Collective", "Working Group", "Circle"];
  function makeWeb(r, subj, field, foundYear) {
    var nLabs = r.int(4, 7);
    var nTheo = r.int(3, 5);
    var labs = [], theories = [], edges = [];

    // theories first (labs espouse them)
    var theoTemplates = [
      function (rr) { return "the " + rr.pick(UNIV_PLACE) + " School"; },
      function (rr) { return surnameOnly(rr) + "'s " + rr.pick(subj.terms) + " hypothesis"; },
      function (rr) { return rr.pick(["strong", "weak", "hard", "soft"]) + " " + subj.n + "ism"; },
      function (rr) { return "the " + rr.pick(PROSE_ADJ) + " " + rr.pick(subj.terms) + " model"; },
      function (rr) { return rr.pick(CAMPS) + " " + subj.field.toLowerCase(); }
    ];
    var tt = r.shuffle(theoTemplates);
    var claimPool = r.shuffle([
      "that " + r.pick(subj.terms) + " is the field's true unit of analysis",
      "that everything reduces to " + r.pick(subj.terms),
      "that the founders got " + r.pick(subj.terms) + " backwards",
      "that " + subj.n + " can only be read " + r.pick(["synchronically", "diachronically", "in the aggregate", "case by case"]),
      "that the whole thing is really a branch of " + r.pick(SUBJECTS).parent.toLowerCase(),
      "that the field's methods measure the observer, not the " + subj.n,
      "that " + r.pick(subj.terms) + " and " + r.pick(subj.terms) + " are the same thing under two names"
    ]);
    var usedTheo = {};
    for (var t = 0; t < nTheo; t++) {
      var by = personName(r);
      var tname = cap(tt[t % tt.length](r));
      while (usedTheo[tname]) tname = tname + " (rev.)";
      usedTheo[tname] = 1;
      theories.push({
        id: "T" + t,
        name: tname,
        camp: r.pick(CAMPS),
        by: by,
        coined: r.int(foundYear, 2022),
        claim: claimPool[t % claimPool.length]
      });
    }

    var usedLab = {};
    for (var i = 0; i < nLabs; i++) {
      var univ = university(r);
      var lname = r.chance(0.5)
        ? univ + " " + cap(subj.n) + " " + r.pick(LAB_HEAD)
        : "Institute for " + r.pick(MODIFIERS) + " " + subj.field.split(" ").pop() + ", " + r.pick(UNIV_PLACE);
      while (usedLab[lname]) lname = lname + " (annex)";
      usedLab[lname] = 1;
      labs.push({
        id: "L" + i,
        name: lname,
        pi: personName(r),
        univ: univ,
        members: r.int(1, 14),
        founded: r.int(foundYear, 2023),
        camp: r.pick(CAMPS)
      });
    }

    // lab -> theory (each lab espouses 1-2)
    for (var li = 0; li < labs.length; li++) {
      var esp = r.sample(theories, r.int(1, 2));
      for (var e = 0; e < esp.length; e++) {
        edges.push({ from: labs[li].id, to: esp[e].id, type: "espouses", label: "espouses" });
      }
    }
    // theory -> theory (extends / refutes / synthesizes)
    for (var ti = 1; ti < theories.length; ti++) {
      if (r.chance(0.8)) {
        var other = theories[r.int(0, ti - 1)].id;
        edges.push({ from: theories[ti].id, to: other, type: r.pick(["extends", "refutes", "synthesizes"]), label: r.pick(["extends", "refutes", "synthesizes"]) });
      }
    }
    // lab -> lab (the incest: rivalry / offshoot / co-authorship / poaching)
    var relTypes = ["rivalry with", "offshoot of", "co-authors with", "poached a postdoc from", "shares a dataset with", "won't cite"];
    var nRel = r.int(nLabs, nLabs + 3);
    for (var k = 0; k < nRel; k++) {
      var a = r.int(0, labs.length - 1), b = r.int(0, labs.length - 1);
      if (a === b) continue;
      edges.push({ from: labs[a].id, to: labs[b].id, type: "lab", label: r.pick(relTypes) });
    }

    return { labs: labs, theories: theories, edges: edges };
  }

  // ---------- trivia ----------
  function makeTrivia(r, subj, field, web, funding) {
    var lines = [];
    var pi = r.pick(web.labs).pi;
    lines.push("Roughly " + r.int(9, 400) + " people worldwide would call themselves " + subj.field.toLowerCase().replace(/s$/, "") + " researchers.");
    lines.push("The annual conference has been held in " + r.pick(UNIV_PLACE) + " " + r.int(2, 31) + " times running.");
    lines.push("The entire field cites the same " + r.int(3, 9) + " foundational papers.");
    if (r.chance(0.6)) lines.push("A famous feud began over " + r.pick(subj.terms) + " at the " + r.int(1991, 2019) + " meeting and has never healed.");
    lines.push("Total lifetime funding (" + money(funding.total) + ") is less than one mid-size physics grant.");
    lines.push("Everyone under 40 in the field trained under " + pi + ".");
    return r.sample(lines, r.int(3, 4));
  }

  // ---------- top-level ----------
  function generate(seed) {
    seed = (seed === undefined || seed === null || seed === "") ? "1" : String(seed);
    var r = Rand("wormhole::" + seed);
    var subj = r.pick(SUBJECTS);
    var mod = r.chance(0.55) ? r.pick(MODIFIERS) + " " : "";
    var name = mod + subj.field;
    var founded = r.int(1979, 2018);
    var st = r.pick(STATUSES);
    var peakYear = r.int(founded + 2, 2024);

    var journals = makeJournals(r, name, subj);
    var paper = makePaper(r, name, subj, r.int(founded, founded + 4));
    paper.journal = journals[0].name; // foundational paper in the flagship
    paper.url = "https://doi.org/" + paper.doi;
    var funding = makeFunding(r, subj, founded);
    var web = makeWeb(r, subj, name, founded);
    var trivia = makeTrivia(r, subj, name, web, funding);

    var sizeLabel = web.labs.length + " labs · " +
      web.labs.reduce(function (a, l) { return a + l.members; }, 0) + " researchers · " +
      journals.length + " journals";

    return {
      seed: seed,
      field: {
        name: name,
        discipline: subj.parent,
        studies: cap(subj.studies),
        founded: founded,
        peakYear: peakYear,
        status: st.s,
        statusNote: st.note,
        sizeLabel: sizeLabel
      },
      paper: paper,
      funding: funding,
      journals: journals,
      web: web,
      trivia: trivia
    };
  }

  W.generate = generate;
  W.fieldName = fieldName;
  W.SUBJECTS = SUBJECTS;
  W.MODIFIERS = MODIFIERS;
  W.money = money;
  W._Rand = Rand;
})();
