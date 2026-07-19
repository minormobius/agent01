/* ============================================================================
   FIPO / poster — the projection engine.

   The poster is a lossy projection from genome-space into the visual grammar
   of the one-sheet. Phase 3 of the archive. Design charter (from the FIPO
   strategy notes):

   1. THE PROMPT IS A PROJECTION FUNCTION, NOT A PARAGRAPH. Code assembles it
      from slots; nothing freestyles. Every slot traces to a genome field.
      The template below is the versioned artifact (PROMPT_VERSION).
   2. NEVER USE EVALUATIVE WORDS. "Bad", "cheesy", "camp", "B-movie" — the
      model renders irony, the Sharknado wink, the one thing we refuse.
      Describe medium and process instead; incompetence enters ONLY through
      the flaw slot. The selftest enforces this.
   3. FLAWS ARE CONFIGURATIONS, NOT ADJECTIVES. Not "bad anatomy" — "the
      heroine's hands are slightly too small." One or two per poster, sampled.
      The second-tier guardrails (no photorealism, no modern montage, no
      glossy digital finish) are phrased into the prompt and enforced by the
      judge later. The biggest risk is the model accidentally making it good.
   4. TEXT IS COMPOSITED, NEVER GENERATED. The painting is one craft; the
      type is another. The typography pass here is fully deterministic:
      title chrome, tagline, dense billing block, studio, era mark.
   5. THE PROJECTION CAN BE DELIBERATELY LOSSY. The historical poster artist
      never saw the movie — he got a garbled brief. The brief's fidelity is
      sampled: faithful / genre-confused / spoils-the-twist /
      advertises-a-different-movie. That knob generates the entire "bad
      projection of an okay movie" category.
   6. JUDGE WITH THE GENOME IN CONTEXT. Prompt + genome + (later) judge
      scores are logged together per render so the archive is inspectable and
      template versions are A/B-testable.

   The meta-principle: keep the model in the second-tier region. Every
   instinct it has pulls toward competence; the whole game is resisting that.

   Pure JS, no deps, attaches to globalThis. Consumes FIPO (the genome).
   ============================================================================ */
(function (global) {
  'use strict';

  var SCHEMA_VERSION = 1;
  // v2: strengthened lettering guardrail (live-render test showed the model
  //     adding pseudo-glyphs in margins) + explicit uncluttered fifths.
  var PROMPT_VERSION = 2;

  /* ---------------------------------------------------------------- PRNG --
     Separate stream from the genome so poster choices never perturb it. */
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
  function rngFor(seed) { return mulberry32(xmur3('fipo/poster/' + String(seed))()); }
  function pick(r, arr) { return arr[Math.floor(r() * arr.length)]; }
  function chance(r, p) { return r() < p; }
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
  function lc(s) { return s.charAt(0).toLowerCase() + s.slice(1); }

  /* ---------------------------------------------------------------- MEDIUM --
     Era-locked process descriptors. Medium and process ONLY — no evaluative
     language. The aesthetic comes from the craft, not from the word "bad". */
  var MEDIUM = {
    atomic50s: 'painted theatrical one-sheet, gouache on illustration board, saturated process inks, visible brushwork',
    spaceage60s: 'painted theatrical one-sheet, gouache and dye-transfer color, flat mod underpainting with airbrushed skies',
    dystopia70s: 'painted theatrical one-sheet, oil and airbrush on board, ochre and sepia palette, photochemical grain',
    vhs80s: 'photochemical one-sheet, airbrushed gouache on board, rich saturated color, painted lens flare',
    dtv90s: 'direct-to-video box art, airbrush over photo reference, neon rim lighting, heavy blacks',
    mock00s: 'theatrical one-sheet, digital photo-composite on glossy stock, very high contrast',
    stream10s: 'streaming key art, digital paint over photo plates, desaturated teal and ember palette'
  };
  var COUNTRY = {
    italian: 'Italian', turkish: 'Turkish', filipino: 'Filipino',
    aip: 'American', corman: 'American', cannon: 'American', fullmoon: 'American',
    asylum: 'American', troma: 'American', tvnetwork: 'American',
    inheritance: 'American', presale: 'international co-production'
  };
  var YEAR = { atomic50s: 1957, spaceage60s: 1967, dystopia70s: 1976, vhs80s: 1981, dtv90s: 1994, mock00s: 2006, stream10s: 2018 };

  /* ------------------------------------------------------- NOVUM VISUALS --
     What the gimmick LOOKS like, keyed by the genome's novum noun (template
     nouns included; {name}/{pl} resolve for creature-tagged nova). */
  var NOVUM_VISUALS = {
    'Giant {name}': 'a giant {nameLc} towering over the desert',
    'Melting Man': 'a man whose face is melting, one arm outstretched',
    'Shrinking Man': 'a tiny man defending himself with a sewing pin against a house cat',
    'Landfill Dead': 'pale figures rising from a moonlit landfill',
    'Pod People': 'a crowd of townsfolk pointing and screaming in unison',
    'Saucer Man': 'a bulb-headed saucer man carrying off a struggling debutante',
    'Brain Parasite': 'a meteor shower falling over a town meeting',
    'Taster': 'an alien gastronome studying a human through a magnifying lens',
    'Frozen {name}': 'a prehistoric {nameLc} striding through a burning cityscape',
    'Swamp Walker': 'a moss-covered humanoid emerging from a swamp',
    'Deep One': 'a mine shaft with something climbing out of it',
    'Corpse Planet': 'astronauts discovering their own helmeted corpses',
    'Ghost Planet': 'a planet that was not there yesterday, filling the viewport',
    'Star Ark': 'a vast generation ship with dark windows',
    'Stowaway': 'a crew portrait with one face too many',
    'Mind Child': 'a small child with glowing eyes, adults frozen mid-motion',
    'Dream Door': 'a door standing open in a bedroom, full of stars',
    'Hypnotist': 'a carnival hypnotist with a swinging watch, pale figures waiting behind him',
    'Mainframe': 'a wall-sized computer of blinking lights, a clerk stamping forms beside it',
    'Love Bot': 'a household robot holding a television close, heart-shaped camera eyes',
    'President Double': 'the President waving from a podium, one eye slightly misaligned',
    'Union Machine': 'factory robots holding tiny picket signs',
    'Time Squire': 'a knight in armor among renaissance-fair tents, a glowing machine humming nearby',
    'Future Self': 'the same man twice on one staircase, one aiming a ray gun at the other',
    'Butterfly Tourist': 'tourists with cameras stepping on butterflies beneath a warning sign',
    'Death Racer': 'armored race cars bristling with spikes in a packed stadium',
    'Lottery Man': 'a man holding a ticket beneath a giant public screen',
    'Green Wafer': 'a food-production line extruding an unsettling green wafer',
    'Last Book': 'a man running with a book under his coat, searchlights behind him',
    'Road Exile': 'a lone driver on an endless cracked highway, gang vehicles on the ridge',
    'Ice Pirate': 'pirates boarding an ice freighter under the aurora',
    'Last Station': 'a single gas station besieged in the wasteland',
    'Final Level': 'a teenager frozen before a CRT television, glowing maze lines wrapping his body',
    'User Zero': 'a pale face made of scan-lines inside a dark monitor',
    'Upload': 'office workers marching in single file into a server rack',
    'Glitch': 'a suburban street where one house repeats',
    'House Pet': 'a house-sized puppy leaning on a split-level home',
    'Extinct One': 'a dodo the size of a bus regarding the viewer with recognition',
    'Heir': 'a child with a bar-coded birthmark beside a briefcase-shaped incubator',
    'Second Body': 'a cryo-tank opening, two shadows where one man stands',
    'Donor Brain': 'a human brain in a glass dome with ambitions, a headless body waiting nearby',
    'Dog Man': 'a man on all fours looking noble, a dog in a business suit holding a briefcase',
    'Comet': 'a comet parked low over a Midwestern water tower, slowly lowering something',
    'Last Sunrise': 'a small observatory against an enormous red sun',
    'Counter-Earth': 'a second Earth in the sky, slightly shinier',
    'Green Tide': 'vegetation swarming over a suburban street',
    'Weather Board': 'a county courthouse under a small personal thundercloud',
    'Ocean Envoy': 'a figure made of standing water addressing a city council',
    'Blockbuster': null /* resolved from the derivation target */
  };

  var VENUE_VISUALS = {
    'a single soundstage': 'on a sparse theatrical set',
    'the same cave, redressed seven times': 'in a familiar-looking cave',
    'a quarry outside town': 'in a gravel quarry',
    'a shopping mall': 'in a shopping mall concourse',
    'a desert ranch': 'on a desert ranch',
    'a renaissance fair': 'among renaissance-fair tents',
    'three corridors and a control room': 'in a spaceship corridor',
    'a decommissioned oil rig': 'on a rusting oil rig',
    'a space-station set inherited from a cancelled TV show': 'on a space-station bridge',
    'the Philippines, standing in for everything': 'in tropical jungle hills',
    'a miniature with visible fingerprints': 'over a tabletop miniature landscape',
    'a mid-sized city, photographed carefully': 'over a mid-sized city skyline',
    'two real locations and a lot of driving': 'along a desert highway'
  };

  var THREAT_VISUALS = {
    'an alien empire that finds Earth unimpressive': 'a fleet of silver disc-ships',
    'a rogue defense intelligence with excellent paperwork': 'a wall-sized computer with a single red lens',
    'a corporation whose logo is on the moon': 'a corporate logo projected across the face of the moon',
    'a cult that has been waiting for the comet': 'robed figures with upturned faces',
    'the government, obviously': 'black sedans and men in gray suits',
    'a mutant horde with a legitimate grievance': 'a horde of mutants cresting a ridge',
    'a comet that is not a comet': 'a comet with something visible inside it',
    'the hero’s own clone, better groomed': 'the hero’s own face, better groomed',
    'an ancient god under the desert, stirring': 'a colossal silhouette beneath cracked desert earth',
    'ice pirates': 'ragged pirates on ice-skiffs',
    'a telepathic hive wearing the neighbors': 'a crowd of neighbors turning their heads in unison',
    'the plants': 'writhing vegetation',
    'a dying sun, impatient': 'an enormous red sun filling the sky',
    'space vampires, technically': 'caped figures against a starfield',
    'an intergalactic game reserve that has tagged Earth': 'a hunter’s helmet with three eyes',
    'the producer’s nephew, as the Dark Lord': 'a young man in an oversized dark-lord helmet'
  };

  /* ------------------------------------------------------------ COMPOSITION --
     The visual grammar of the one-sheet. Slots: {PROP}, {THREAT}, {GIMMICK}. */
  var COMPOSITIONS = [
    { id: 'cradle', text: 'the hero in the foreground cradling {PROP}, the antagonist’s face looming enormous in the starfield above' },
    { id: 'back-to-back', text: 'the hero and heroine back to back at center, a montage of smaller supporting faces at the edges' },
    { id: 'monster-hand', text: 'the monster’s claw entering the frame from below, tiny figures fleeing across a landscape' },
    { id: 'heroine-front', text: 'the heroine in a foreground three-quarter pose, the hero behind her firing {PROP} at something off-frame' },
    { id: 'dissolve-head', text: 'a giant head dissolving into a starfield, a tiny spaceship fleeing beneath it' },
    { id: 'carry', text: 'the hero carrying the unconscious heroine, explosions and {THREAT} behind them' },
    { id: 'pyramid', text: 'an ensemble pyramid: the star largest at the apex, the villain opposite, the supporting cast descending in size' },
    { id: 'monument', text: 'the gimmick object monumental at center — {GIMMICK} — with tiny humans fleeing or worshipping beneath' }
  ];
  function propFor(g) {
    for (var i = 0; i < g.commitment.length; i++) {
      if (/weapon is a lamp/.test(g.commitment[i].text)) return 'a lamp';
    }
    if (g.dramatis.sidekick && /robot dog/.test(g.dramatis.sidekick)) return 'a small robot dog';
    if (g.dramatis.sidekick && /motorcycle/.test(g.dramatis.sidekick)) return 'a motorcycle';
    var era = g.production.era.id;
    if (era === 'atomic50s' || era === 'spaceage60s') return pick(rngLocal, ['a ray gun', 'a Geiger counter', 'a space helmet']);
    if (era === 'dystopia70s') return pick(rngLocal, ['a flare gun', 'a book', 'a gas mask']);
    if (era === 'vhs80s') return pick(rngLocal, ['a chrome blaster', 'a laser sword', 'a walkie-talkie']);
    return pick(rngLocal, ['a plasma rifle', 'a glowing data cartridge', 'a VR headset']);
  }
  var rngLocal = null; // set during project()

  /* ------------------------------------------------------------------ FLAWS --
     CONFIGURATIONS, not adjectives. One or two per poster, sampled. This is
     the trained incompetence — specific rules broken by someone who obeys
     the others. Banned evaluative words are enforced by the selftest. */
  var FLAWS = [
    { id: 'small-hands', text: 'the heroine’s hands are slightly too small' },
    { id: 'long-neck', text: 'the hero’s neck is noticeably longer than anatomically plausible' },
    { id: 'short-forearm', text: 'one of the hero’s forearms is subtly shorter than the other' },
    { id: 'split-lighting', text: 'the hero is lit from the left and the villain is lit from the right, in the same frame' },
    { id: 'every-light', text: 'every face in the composition is lit from a different direction' },
    { id: 'underlight', text: 'the starfield casts light upward onto the characters’ faces for no visible reason' },
    { id: 'helicopter-scale', text: 'the monster’s size relative to the helicopter beside it is ambiguous' },
    { id: 'moon-scale', text: 'the spaceship and the moon it passes disagree about their relative scale' },
    { id: 'head-scale', text: 'the heroine’s head is larger than the hero’s although she stands farther away' },
    { id: 'elbow-tangent', text: 'the hero’s elbow exactly touches the edge of the painting' },
    { id: 'hat-tangent', text: 'the villain’s looming face aligns exactly with the hero’s head and reads at first as a hat' },
    { id: 'triple-converge', text: 'three unrelated objects converge on the same point at the heroine’s shoulder' },
    { id: 'purple-shadows', text: 'the shadows are purple and the highlights are orange throughout, with no shared light logic' },
    { id: 'green-skin', text: 'the skin tones drift toward green wherever two colors meet' },
    { id: 'second-artist', text: 'one corner of the painting is rendered in a noticeably tighter style, as if by a second artist' },
    { id: 'pencil-line', text: 'a faint pencil construction line remains visible across the sky' },
    { id: 'grain-shift', text: 'the airbrush grain changes abruptly at the horizon' },
    { id: 'reference-mismatch', text: 'the heroine’s portrait is clearly painted from a different reference photograph than the hero’s' },
    { id: 'too-many-teeth', text: 'the monster has two rows of teeth too many, painted with great care' },
    { id: 'floating-prop', text: 'the hero’s weapon casts no shadow and appears to float slightly above his hand' }
  ];

  /* -------------------------------------------------------- BRIEF FIDELITY --
     The artist never saw the movie. What was he TOLD? This knob generates
     the whole "bad projection of an okay movie" category. */
  var FIDELITIES = [
    { id: 'faithful', weight: 55, label: 'a faithful brief' },
    { id: 'genre-confused', weight: 18, label: 'a genre-confused brief' },
    { id: 'spoils-the-twist', weight: 12, label: 'a brief that spoils the twist' },
    { id: 'different-movie', weight: 15, label: 'a brief for a different movie' }
  ];
  var GENRE_CONFUSIONS = [
    { id: 'western', dressing: 'reinterpreted in the visual language of a western: dust, a low sun, the hero in a ten-gallon hat' },
    { id: 'fantasy', dressing: 'reinterpreted in the visual language of heroic fantasy: swords, a castle where the laboratory should be, a dragon-adjacent silhouette' },
    { id: 'noir', dressing: 'reinterpreted in the visual language of film noir: trench coats, venetian-blind shadows, a ceiling fan' },
    { id: 'romance', dressing: 'reinterpreted in the visual language of a romance: the hero and heroine embracing, the threat reduced to a small corner detail' }
  ];

  /* ------------------------------------------------------------- TYPOGRAPHY --
     The second craft. Fully deterministic: names, roles, studio, era mark,
     billing block — all from banks keyed by the genome's production context. */
  var ACTOR_FIRST = ['Chad', 'Buck', 'Rex', 'Dirk', 'Lance', 'Troy', 'Rock', 'Heath', 'Vince', 'Ace',
    'Lori', 'Tanya', 'Debra', 'Cindy', 'Roxanne', 'Crystal', 'Storm', 'Muffy', 'Blaze', 'Dee Dee'];
  var ACTOR_LAST = ['Braxton', 'Corrigan', 'St. Clair', 'Savage', 'Mallory', 'Dane', 'Powers', 'Sinclair',
    'Vane', 'Hollister', 'Foxx', 'Del Rio', 'Starrett', 'Blade', 'Monroe', 'Trent', 'Kincaid', 'Wilde'];
  var ITALIAN_ACTORS = ['Brick Halloway', 'Steve Jagger', 'Susie Bell', 'Dana Lords', 'Marc Porel-Style', 'Gordon Scott-Free'];
  var DIRECTORS = ['Cole R. Bay', 'Duke Marsden', 'Vic Sabatini', 'Enzo Carbone', 'Hal Krieger',
    'Bud Constantine', 'Ramon del Fuego', 'S. J. Krakauer', 'Milo Vance', 'Terrence O’Dell'];
  var PRODUCERS = ['Leonard Voss', 'Marty Slezak', 'Don Vitale', 'Big Jim McAllister', 'Sol Harkness', 'Fifi LaRue'];
  var STUDIOS = {
    aip: 'Transcontinental Releasing', corman: 'New Globe Pictures', cannon: 'Delta Star Films',
    italian: 'Cineuropa Internazionale', turkish: 'Bosporus Filmworks', fullmoon: 'Full Crescent Entertainment',
    asylum: 'The Safehouse', troma: 'Spleen Pictures', filipino: 'Manila International Films',
    tvnetwork: 'WBN Television', inheritance: null /* resolved from director */, presale: 'Prestige International Sales'
  };
  var ERA_MARKS = {
    atomic50s: 'COLOR BY TECHNICOLOR', spaceage60s: 'IN TECHNIRAMA', dystopia70s: 'FILMED IN PANAVISION',
    vhs80s: 'IN DOLBY STEREO', dtv90s: 'DIGITALLY MASTERED', mock00s: 'SHOT IN HD', stream10s: 'A STREAMING ORIGINAL'
  };
  var RATINGS = {
    atomic50s: 'APPROVED', spaceage60s: 'APPROVED', dystopia70s: 'PG', vhs80s: 'PG-13',
    dtv90s: 'R', mock00s: 'PG-13', stream10s: 'TV-14'
  };

  /* ----------------------------------------------------- EVALUATIVE-BANNED --
     The selftest asserts NONE of these appear in any slot or the final
     prompt. The model must never be told to be bad. */
  var BANNED_EVALUATIVE = ['bad', 'cheesy', 'cheese', 'camp', 'campy', 'b-movie', 'b movie', 'schlock',
    'kitsch', 'ironic', 'irony', 'parody', 'spoof', 'z-grade', 'so-bad', 'awful', 'terrible', 'amateurish',
    'ugly', 'tacky', 'low-budget', 'cheap'];
  var BANNED_SECOND_TIER = ['photorealistic', 'photorealism', 'octane render', 'unreal engine', '3d render',
    'trending on artstation', 'marvel', 'mcu'];

  /* -------------------------------------------------------------- ASSEMBLY -- */
  function project(g) {
    var r = rngFor(g.seed);
    rngLocal = r;
    var era = g.production.era.id;
    var milieu = g.production.milieu.id;

    // Subject — what the painting depicts. Every phrase traces to the genome.
    var visualKey = g.novum.noun.replace(/^Giant /, 'Giant {name}').replace(/^Frozen /, 'Frozen {name}');
    // creature-resolved nouns: recover the template + the creature name
    var template = null, creature = null, i;
    for (i = 0; i < NOVAE_NOUN_TEMPLATES.length; i++) {
      var t = NOVAE_NOUN_TEMPLATES[i];
      if (g.novum.noun.indexOf(t.prefix) === 0) { template = t; creature = g.novum.noun.slice(t.prefix.length); break; }
    }
    var gimmick;
    if (g.novum.cat === 'mockmorph' && g.derivation) {
      gimmick = 'a tableau unmistakably evoking ' + g.derivation.target.n + ', rebuilt from different props';
    } else if (template) {
      gimmick = NOVUM_VISUALS[template.tpl].replace('{nameLc}', lc(creature));
    } else {
      gimmick = NOVUM_VISUALS[g.novum.noun] || ('the spectacle of ' + g.novum.short);
    }
    var venueVisual = VENUE_VISUALS[g.geometry.venue.label] || ('in ' + g.geometry.venue.label);
    var threatVisual = THREAT_VISUALS[g.threat.label] || g.threat.noun;

    // The brief — and how garbled it was.
    var fidelity = wpick(r, FIDELITIES, function (f) { return f.weight; });
    var subject = gimmick + ' ' + venueVisual + ', with ' + threatVisual;
    var briefText = subject;
    var genreConfusion = null;
    var projectionFailures = [];
    if (fidelity.id === 'genre-confused') {
      genreConfusion = pick(r, GENRE_CONFUSIONS);
      briefText = subject + ', ' + genreConfusion.dressing;
      projectionFailures.push({
        id: 'wrong-genre', label: 'the wrong genre',
        reason: 'The artist was told it was a ' + genreConfusion.id + '. It is not a ' + genreConfusion.id + '.'
      });
    } else if (fidelity.id === 'spoils-the-twist') {
      var twist = null;
      for (i = 0; i < g.commitment.length; i++) if (g.commitment[i].spoiler) twist = g.commitment[i].text;
      if (!twist) twist = 'the villain is ' + g.threat.label;
      briefText = subject + '. The painting prominently reveals that ' + lc(twist.replace(/\.$/, ''));
      projectionFailures.push({
        id: 'marketing-spoiler', label: 'the poster spoils it',
        reason: 'The one-sheet reveals the twist. The twist was the picture’s only secret.'
      });
    } else if (fidelity.id === 'different-movie') {
      if (g.derivation && !g.derivation.visionary) {
        briefText = 'a tableau unmistakably evoking ' + g.derivation.target.n + ' ' + venueVisual + ', with ' + threatVisual;
        projectionFailures.push({
          id: 'wrong-movie', label: 'a poster for a different movie',
          reason: 'The one-sheet advertises ' + g.derivation.target.n + '. The picture, technically, is “' + g.title.text + '.”'
        });
      } else {
        fidelity = FIDELITIES[0]; // no target to confuse with — the brief survives intact
      }
    }

    // Composition.
    var comp = pick(r, COMPOSITIONS);
    var prop = propFor(g);
    var compText = 'Composition: ' + comp.text
      .replace('{PROP}', prop)
      .replace('{THREAT}', threatVisual)
      .replace('{GIMMICK}', gimmick);

    // Flaws — one or two configurations, never adjectives.
    var flaws = [pick(r, FLAWS)];
    if (chance(r, 0.45)) {
      var f2 = pick(r, FLAWS);
      if (f2.id !== flaws[0].id) flaws.push(f2);
    }

    // Medium + guardrails (phrased in; the API takes no negative prompt, so
    // the negatives live in the wording AND in the judge's rejection list).
    var year = YEAR[era] + Math.floor(r() * 6);
    var country = COUNTRY[milieu] || 'American';
    var medium = 'A ' + year + ' ' + country + ' science fiction film poster, ' + MEDIUM[era];
    // The guardrail line must agree with the medium: hand-painted eras get
    // the hand-painted anchor; digital eras get the anti-gloss anchor.
    var painted = era !== 'mock00s' && era !== 'stream10s';

    var prompt = [
      medium + '.',
      compText + '.',
      'Subject: ' + briefText + '.',
      flaws.length ? ((painted ? 'Painted details: ' : 'Composited details: ') + flaws.map(function (f) { return f.text; }).join('; ') + '.') : '',
      'Rich saturated color. The top and bottom fifths of the painting stay simple, dark, and uncluttered — space reserved for lettering. No text, no lettering, no logo, no signature, no glyphs, no letterforms of any kind.',
      painted
        ? 'Painted entirely by hand in the period style; not a photograph, not a digital montage.'
        : 'Composited in the period style; flat and overworked, not a glossy modern blockbuster finish.'
    ].filter(Boolean).join('\n');

    // Typography pass — the second craft, fully deterministic.
    var starName = milieu === 'italian' ? pick(r, ITALIAN_ACTORS) : (pick(r, ACTOR_FIRST) + ' ' + pick(r, ACTOR_LAST));
    var coStar = pick(r, ACTOR_FIRST) + ' ' + pick(r, ACTOR_LAST);
    if (coStar === starName) coStar = pick(r, ACTOR_FIRST) + ' ' + pick(r, ACTOR_LAST);
    var director = pick(r, DIRECTORS);
    var producer = pick(r, PRODUCERS);
    var studio = STUDIOS[milieu] || ('a ' + director.split(' ').pop() + ' Family Production');
    var typography = {
      title: g.title.text,
      era: era,
      tagline: g.tagline,
      starring: starName,
      coStar: coStar,
      andIntroducing: /girlfriend|discovered|child star/.test(g.dramatis.star.label) ? (pick(r, ACTOR_FIRST) + ' ' + pick(r, ACTOR_LAST)) : null,
      director: director,
      producer: producer,
      studio: studio,
      eraMark: ERA_MARKS[era],
      rating: RATINGS[era]
    };

    return {
      schema: SCHEMA_VERSION,
      promptVersion: PROMPT_VERSION,
      seed: g.seed,
      brief: { fidelity: fidelity.id, fidelityLabel: fidelity.label, text: briefText },
      composition: { id: comp.id, text: compText, prop: prop },
      medium: { year: year, country: country, text: medium },
      flaws: flaws,
      projectionFailures: projectionFailures,
      prompt: prompt,
      typography: typography,
      judge: null // filled by the phase-2 judge: {pairwise:[...], coherence, sincerity, secondTierPass}
    };
  }

  // Noun templates for creature-resolved nova (prefix → visuals key).
  var NOVAE_NOUN_TEMPLATES = [
    { prefix: 'Giant ', tpl: 'Giant {name}' },
    { prefix: 'Frozen ', tpl: 'Frozen {name}' }
  ];

  var FIPO_POSTER = {
    SCHEMA_VERSION: SCHEMA_VERSION,
    PROMPT_VERSION: PROMPT_VERSION,
    project: project,
    FLAWS: FLAWS, COMPOSITIONS: COMPOSITIONS, FIDELITIES: FIDELITIES,
    NOVUM_VISUALS: NOVUM_VISUALS, BANNED_EVALUATIVE: BANNED_EVALUATIVE, BANNED_SECOND_TIER: BANNED_SECOND_TIER
  };
  global.FIPO_POSTER = FIPO_POSTER;
  if (typeof module !== 'undefined' && module.exports) module.exports = FIPO_POSTER;
})(typeof window !== 'undefined' ? window : globalThis);
