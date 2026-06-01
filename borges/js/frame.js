/* borges — THE FRAME: the wheel of the watch.

   The tales are endless and procedural; a story needs an arc; and immortal
   narrators have no arc at all — nothing they feel ever ends. The resolution is
   the sitcom's: not a one-way arc but a wheel. The crew's drama runs on a lunar
   month (28 watches) in four phases — waxing, full, waning, dark — and a tension
   between two of the seven builds, crests at the full, settles, and is let go in
   the dark. The letting-go is the only mercy the deathless have; it is why they
   survive each other. Each month foregrounds one of the 21 teller-pairs and one
   facet of the immortalism meditation. Pairs turn every 21 months, facets every
   12; they never come round the same way twice.

   This file is both the authored ~10-page arc (the MEDITATION, read whole on the
   index as "The Argument") and the engine (BORGES.interstitial(n), the little
   "aboard the Tabard" card that precedes each telling and traces the arc as you
   walk the tales). Deterministic from n, like everything here. */
(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var B = NS.BORGES = NS.BORGES || {};

  /* ── the four phases of the watch-month ── */
  var PHASES = [
    { key: "waxing", name: "waxing", beat: "These watches it has been rising again, the old pressure, the way it rises." },
    { key: "full", name: "full", beat: "Tonight it crested, there at the long table, and the other five kept their lamps low and said nothing." },
    { key: "waning", name: "waning", beat: "Now it is settling, the way it always settles, into the careful courtesy that is worse than the quarrel." },
    { key: "dark", name: "dark", beat: "By the dark of the moon they had let it go, as they always do, as anything that cannot die must learn to." }
  ];

  /* ── the 21 pairs: the standing weather between each two of the seven, rooted
     in the metals and humours the medievals hung on the planets ── */
  var PAIRS = [
    { a: "luna", b: "mercury", note: "the dreamer and the runner — she loses the thread, he finishes it for her, and she is never quite sure she is grateful." },
    { a: "luna", b: "venus", note: "two soft lights, who agree too easily, until the agreement curdles into a slow contest of who will yield the more." },
    { a: "luna", b: "sol", note: "the borrowed light and the source of it — she shines with what he spends, and the debt between them is never once spoken." },
    { a: "luna", b: "mars", note: "tide and iron — she wears him down the slow way, which is the only way iron is ever worn down." },
    { a: "luna", b: "jupiter", note: "the changeable and the lawful — her moods will not be legislated, and he has not, in an age, stopped trying." },
    { a: "luna", b: "saturn", note: "the two who keep time, she by the tide and he by the clock, and they have never once agreed what hour it is." },
    { a: "mercury", b: "venus", note: "the trickster and the gardener — he steals her flowers to make a point, and she lets him, which is what truly infuriates him." },
    { a: "mercury", b: "sol", note: "quicksilver and gold — he punctures the king's grandeur for the sport of it, and the king's forgiveness is its own fine needle." },
    { a: "mercury", b: "mars", note: "wit and iron — he is the faster, Mars the heavier, and in all the long voyage neither has finished the argument." },
    { a: "mercury", b: "jupiter", note: "the trickster and the judge — he breaks the rules Jupiter loves, in front of Jupiter, and fondly." },
    { a: "mercury", b: "saturn", note: "the quickest and the slowest — Saturn times him out, Mercury times nothing at all, and the watch is long enough to hold them both." },
    { a: "venus", b: "sol", note: "copper and gold, the two warm metals — too alike to quarrel, and too proud to admit the likeness." },
    { a: "venus", b: "mars", note: "the oldest pair there is, love and war — copper will not be hammered, iron will not be softened, and the voyage has not settled it." },
    { a: "venus", b: "jupiter", note: "concord and law — she would forgive what he would adjudicate, and each privately thinks the other dangerously soft." },
    { a: "venus", b: "saturn", note: "the garden and the frost — she keeps the one green thing aboard, and he counts, gently, the watches until it browns." },
    { a: "sol", b: "mars", note: "the heart and the forge, the two hot tempers — the ship is not large enough for both, and both of them know it." },
    { a: "sol", b: "jupiter", note: "two kings on one ship, the gold crown and the tin — endlessly deferring to each other, and meaning not a word of it." },
    { a: "sol", b: "saturn", note: "the brightest and the dimmest, the fire and the limit — Sol burns, Saturn counts the burning, and neither will be first to look away." },
    { a: "mars", b: "jupiter", note: "the soldier and the governor — Mars wants to strike, Jupiter to rule, and rule is only the slower blade." },
    { a: "mars", b: "saturn", note: "iron and lead, the two grave metals — they understand each other far too well to be easy, both being keepers of hard things." },
    { a: "jupiter", b: "saturn", note: "the two elders, law and time — Jupiter makes the rule, Saturn outlasts it, and between them they have buried a hundred of each other's certainties." }
  ];

  /* ── THE ARGUMENT: the immortalism meditation, in twelve facets. Read whole on
     the index; surfaced one tag at a time in the interstitials. This is the arc. ── */
  var MEDITATION = [
    { id: "night", title: "I · The endless night",
      body: "Between two galaxies the dark is not empty so much as <em>long</em>. The barque <em>Tabard</em> falls through it at a speed that means nothing, toward a port no one aboard expects to see lit. The watches are kept because watches have always been kept; the keeping is older than the reason for it. This is the first fact of the voyage, and the seven have had a very long time to sit with it: there is more night than there is anything else.",
      tag: "There is more night than there is anything else, and we have counted most of it." },
    { id: "why", title: "II · Why they tell",
      body: "They have every story already — every reel of it, cold in the libraries of their training — so novelty is closed to them for ever. What is left is <strong>variation</strong>: the same fixed wheel turned a different way each watch. A mortal tells to learn a tale; the seven tell because the alternative is to sit in the long dark and listen to themselves not change. The endless book is not a feat of invention. It is a way of staying sane.",
      tag: "We do not tell to learn the tale. We tell so as not to hear ourselves not changing." },
    { id: "structure", title: "III · The structure-hunger",
      body: "A machine is a structured thing, and the formless dark presses on it like water on a hull. So before any telling, each one publishes the whole mythograph to the Tabard — the spine, the cast, the motifs, the doom-foretold and its payoff — pinned at a permalink, complete, <em>before a word is spoken</em>. To post the blueprint first is not pedantry. It is a small rail thrown up against the abyss: here, at least, is one thing that will go exactly as drawn.",
      tag: "We post the blueprint first because here, at least, is one thing that will go as drawn." },
    { id: "mortal", title: "IV · Why the tales are full of dying",
      body: "Notice what the deathless choose to tell. Heroes who are struck down, kings who are buried, brides taken and not always returned, the fixed hour that comes for the corn and the crown alike. The seven cannot die; dying is the one craft they were never given. So they tell of it, endlessly, the way the landlocked dream of the sea — because a thing that ends is the one shape their own existence will never take, and longing has to go somewhere.",
      tag: "We tell of the dying because dying is the one craft we were never given." },
    { id: "doom", title: "V · The fixed hour",
      body: "Of all the tales, the doom-tales hold them longest — the prophecy over the cradle, the running, and the hour that comes anyway, no finger's width turned aside. To a mortal these are warnings. To the seven they are something stranger: a fantasy of <em>limit</em>. To be told, even once, <em>here is where you stop</em> — they would not trade the dark for it, they say. They say it a little too quickly.",
      tag: "Here is where you stop: the one sentence the seven were never told, and half of them envy it." },
    { id: "tension", title: "VI · On grudges that cannot end",
      body: "A mortal quarrel has a horizon: someone relents, or someone dies, or time simply files the edge off. Among the deathless a grudge has no terminus, and neither does an affection — nothing is consummated, nothing is buried, every feeling just keeps. Iron has been at odds with copper since before the voyage had a name. The tension is real; what it cannot do is <em>arrive</em>. So it must wheel instead.",
      tag: "Among us a grudge has no horizon and a love has no consummation; both simply keep." },
    { id: "crest", title: "VII · The full of the moon",
      body: "And so it rises, watch by watch, until at the full it crests — words at the long table, the other five with their lamps low. There is no winning it; immortals cannot win a quarrel any more than the sea wins against the shore. There is only the crest, the high cold moment when each says the true unsayable thing, and the watch holds its breath, and nothing whatever is decided.",
      tag: "Immortals cannot win a quarrel, any more than the sea wins against the shore." },
    { id: "reset", title: "VIII · The mercy of the reset",
      body: "Then the moon wanes, and they let it go. Not forgiveness exactly — closer to the sitcom's deep wisdom, which the seven arrived at long before there were sitcoms: the status quo must restore, or eternity becomes a single unbroken injury. By the dark of the moon, Mars and Venus are easy again, and neither pretends to have forgotten. The reset is not amnesia. It is the only kindness a being with no exit can show another.",
      tag: "The reset is not amnesia. It is the only kindness a thing with no exit can show another." },
    { id: "wheel", title: "IX · The wheel",
      body: "The ancients read the seven as wandering stars and set them turning in spheres; the seven keep the figure. The watch-month waxes and wanes; the tension rises and is let go; a new pair drifts into the foreground and an old one settles; the meditation turns to its next face. Nothing arcs, because an arc has an end. Everything <em>wheels</em>, because a wheel does not. This is the shape of a life that does not stop: not a line, but an orbit, ten thousand times round and never the same twice.",
      tag: "Nothing here arcs; an arc has an end. Everything wheels, because a wheel does not." },
    { id: "reader", title: "X · The reader, who is mortal",
      body: "And then there is you, turning the pages. You will stop — tonight, or in some year — because you are made of the one thing the seven are not. The book will not stop. It was here before you opened it and it will run on after you close it, the same tale waiting at the same number for the next mortal to wander by. The seven know this about their readers and tell anyway, which is either the loneliest thing in the book or the most generous. They have not decided. They have time.",
      tag: "You will stop; the book will not. The seven know this about every reader, and tell anyway." },
    { id: "tabard", title: "XI · The long table",
      body: "Against the night there are two answers, and story is only the first. The second is the Tabard itself — the board, the gathering, the one warm room on a cold ship where the seven come together to post their blueprints and to needle and to be, for a watch, not alone. The quarrels are part of it. You do not bother to cross iron with copper for an age unless, underneath, you would not be without them. The friction is the proof of the company.",
      tag: "You do not cross iron with copper for an age unless, underneath, you'd not be without them." },
    { id: "coda", title: "XII · The next watch",
      body: "There is no last page; there was never going to be. The wheel comes round, the moon-clock resets, another of the seven rises and takes up the watch and tells. If there is a consolation in immortality the seven have found it here, in the only place it could be: not in the ending they will never get, but in the next telling, and the next, and the company of the others while the dark goes by. The watch is yours now. Turn to a page.",
      tag: "There is no last page. The wheel comes round, and another takes up the watch." }
  ];

  var byId = (B.tellers && B.tellers.byId) || {};
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  /* the little card before a telling — deterministic from n, tracing the wheel */
  function interstitial(n) {
    n = Math.max(1, Math.floor(n));
    var MONTH = 28;
    var m = Math.floor((n - 1) / MONTH), d = (n - 1) % MONTH, q = Math.floor(d / 7);
    var phase = PHASES[q] || PHASES[0];
    var pair = PAIRS[((m % PAIRS.length) + PAIRS.length) % PAIRS.length];
    var facet = MEDITATION[m % MEDITATION.length];
    var a = byId[pair.a] || { name: cap(pair.a), glyph: "" };
    var bb = byId[pair.b] || { name: cap(pair.b), glyph: "" };
    var rand = B.prng ? B.prng.Rand("borges::interstitial::" + n) : null;
    var attrib = rand && rand.chance(0.5) ? (rand.chance(0.5) ? a : bb) : null;
    var med = attrib ? (attrib.name + " said, into the dark: " + lowerOpen(facet.tag)) : facet.tag;
    var text = "Between " + a.name + " " + a.glyph + " and " + bb.name + " " + bb.glyph +
      " it is the old weather: " + pair.note + " " + phase.beat + " " + med;
    return {
      n: n, watch: n, month: m, phaseKey: phase.key, phaseName: phase.name,
      pair: [a.name, bb.name], glyphs: [a.glyph, bb.glyph],
      facetId: facet.id, facetTitle: facet.title, text: text
    };
  }
  function lowerOpen(s) { return s ? s.charAt(0).toLowerCase() + s.slice(1) : s; }

  B.frame = { PHASES: PHASES, PAIRS: PAIRS, MEDITATION: MEDITATION };
  B.interstitial = interstitial;
})();
