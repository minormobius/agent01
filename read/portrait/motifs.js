/* Layer 5 — the leitmotif index.
 *
 * WHY THIS IS BUILT AND NOT LOOKED UP.
 * On the medieval tales here, layer 5 is the Thompson Motif-Index: an external
 * authority with call-numbers, where the analyst's job is identification. B184.1
 * "magic horse" either is or is not the right number for Rhiannon's mount, and
 * a folklorist can tell you that you are wrong.
 *
 * Modernism has no such index and cannot have one. A Thompson motif is a
 * story-atom shared across a TRADITION — it is meaningful precisely because it
 * turns up in Karelia and in Wales. A modernist leitmotif is the opposite kind
 * of object: a word or image THIS book repeats, whose whole force comes from
 * being local. Water in Portrait means what it means because of where it has
 * been on page 3 and page 40 and page 190, not because it belongs to a type.
 * There is nothing to look it up in.
 *
 * So the index has to be measured off the text instead. Each entry below is a
 * lexicon — a list of words — counted by measure/measure.mjs and normalised per
 * 10,000 words, chapter by chapter and movement by movement. The densities, the
 * per-term breakdowns and the `topSections` that feed the Mythograph's EXHIBITS
 * edges are all in stylometry.js and all reproducible.
 *
 * WHAT THAT BUYS AND WHAT IT COSTS.
 * Buys: falsifiability the Thompson layer never had. If a reading claims that
 * Portrait is drenched in water, that claim now has a number attached and the
 * number can be wrong.
 * Costs: the lexicons are editorial. A count only tells you how often the listed
 * words occur — never that they carry the meaning claimed for them. Every list
 * is therefore printed in full on the page, with its per-term counts, so a
 * reader can see (for instance) that `colour` leans on 33 instances of "rose",
 * six of which are the verb, and discount accordingly. That is the honest
 * substitute for a call-number: not authority, but an audit trail.
 *
 * Attaches to window.PORTRAIT. */
window.PORTRAIT = window.PORTRAIT || {};
window.PORTRAIT.motifs = {
  intro: "Folklorists have a Dewey decimal — the <strong>Thompson Motif-Index</strong>, which files every recurring story-atom under a letter and a number, so that a magic horse in Wales and a magic horse in Karelia get the same call-sign. Modernism has none, and the reason is structural rather than accidental: a Thompson motif matters because it is <em>shared</em>, and a leitmotif matters because it is <em>local</em>. Water in <em>Portrait</em> means what it means because of where it has already been in <em>Portrait</em>. There is no index to consult, so this one is <strong>measured</strong> instead — twelve lexicons counted across the novel by <a href=\"measure/measure.mjs\">measure/measure.mjs</a> and normalised per 10,000 words. The trade is exact: the medieval layer offers an authority you can be wrong about, and this one offers a number you can check. Every word-list is printed below with its counts, because the lists are editorial and you should be able to disagree with them.",
  classes: {
    S: "Sense — the channels the world arrives through",
    E: "Element — what the world is made of",
    F: "Figure — the images that carry the argument",
    L: "Logos — words about words",
    T: "Transfer — the two vocabularies competing for Stephen",
  },
  classOrder: ["S", "E", "F", "L", "T"],
  taletypes: [
    { code: "Künstlerroman", conf: "high", name: "The portrait of the artist as a young man",
      gloss: "The novel of an artist's formation — Goethe's <em>Wilhelm Meister</em>, Keller's <em>Der grüne Heinrich</em>, Joyce's abandoned <em>Stephen Hero</em>. The type promises an achieved artist at the end. This one withholds him: Stephen has produced one villanelle and a theory, and the last page is a prayer." },
    { code: "Bildungsroman", conf: "high", name: "The novel of formation, refused",
      gloss: "The parent type, whose contract is that the young man is reconciled to his society. Franco Moretti's account makes the reconciliation constitutive. <em>Portrait</em> takes the form and inverts the ending: the hero is not integrated but exported." },
    { code: "Confessio", conf: "med", name: "The spiritual autobiography",
      gloss: "Augustine's shape — sin, terror, conversion, new life — and Chapter III executes it exactly, in order, at full length. Chapter IV then converts the convert a second time, out of the Church and into art, using the same vocabulary. The form is borrowed intact and its object swapped." },
    { code: "Ovid, Met. VIII", conf: "high", name: "Daedalus and Icarus",
      gloss: "Named in the epigraph — <em>et ignotas animum dimittit in artes</em> — and in the hero's surname. The novel never says which of the two Stephen is, and Kenner's answer (Icarus) is the whole difference between reading the book straight and reading it ironically." },
  ],
  list: [
    /* ── S · Sense ──────────────────────────────────────────────────────── */
    { key: "eyes", code: "S1", cls: "S", name: "Eyes, glasses, and being looked at", conf: "med",
      gloss: "The book's densest sensory lexicon and its first threat: <em>the eagles will come and pull out his eyes</em>, on page four. Broken glasses get Stephen pandied; the rector looks at him through a glass in the first paragraph; the girl on the strand is defined by what her eyes do. Sight in this novel is nearly always <em>being seen</em> — the sense that other people use on you.",
      caveat: "Over-collects. Of 436 hits, 129 are the ordinary verbs <em>look</em>, <em>looked</em>, <em>seen</em>, which do not always carry the motif. The 173 instances of <em>eyes</em> itself are the solid core.",
      cross: "Compare the eye-and-blinding cluster in <a href=\"/vitamerlini/#motifs\">Vita Merlini</a>, where sight is prophetic rather than social." },
    { key: "hands", code: "S2", cls: "S", name: "Hands — the pandybat and the chalice", conf: "high",
      gloss: "Peaks hard in I.4, the pandying, where a hand is the thing that is hurt and the thing that hurts. Returns transfigured in III.3, when the same hands are raised to receive the ciborium, and again in the villanelle's <em>sacrificing hands upraise / the chalice</em>. Three uses of one body part, and the book's argument runs along them.",
      cross: "The maimed or marked hand is a Thompson-indexed motif in the medieval tales here; in Portrait it is not an event but a recurrence." },
    { key: "smell", code: "S3", cls: "S", name: "Odour — the first judgement in the book", conf: "high",
      gloss: "The novel's first comparison is olfactory: <em>his mother had a nicer smell than his father</em>. Smell is the sense Joyce gives to truth-telling — the cold night smell of the chapel, the peasant smell of Clongowes, and in II.3 Stephen deliberately breathing horse piss and rotted straw to calm his heart. Densest in Chapter I and Chapter IV, the book's two most bodily chapters.",
      cross: "Nothing like it in the medieval corpus, where smell is almost never registered. This is a distinctively novelistic sense." },
    { key: "cold", code: "S4", cls: "S", name: "Cold and the slimy water", conf: "high",
      gloss: "24.3 per 10,000 words in Chapter I and 3.4 in Chapter V — the steepest monotone decline of any lexicon here. The child registers the world thermally: the wet bed that goes cold, the square ditch, the shivering in the corridor. The aesthete has stopped feeling temperature.",
      cross: "Compare the cold of the Otherworld crossing in <a href=\"/orfeo/#motifs\">Sir Orfeo</a> — there a marker of the supernatural, here of a small boy's fear." },

    /* ── E · Element ────────────────────────────────────────────────────── */
    { key: "water", code: "E1", cls: "E", name: "Water — ditch, bowl, tide, tea-dregs", conf: "high",
      gloss: "The load-bearing image of the novel, and it changes value four times. Chapter I: cold slimy water, the ditch, the wet bed — water is what humiliates. Chapter I's close: the fountain and the brimming bowl. Chapter III: the confession as washing. Chapter IV: the tide, the girl in midstream, and its density peaks at 50.2 per 10,000, the highest for any movement of the book at IV.3. Chapter V opens on the dregs of a third cup of watery tea. Baptism, and then its parody.",
      cross: "The Otherworld is reached across water in <a href=\"/pwyll/#motifs\">Pwyll</a> and <a href=\"/branwen/#motifs\">Branwen</a>; here the crossing is internal and the same image does the work." },
    { key: "fire", code: "E2", cls: "E", name: "Fire — hearth, hell, and the smithy", conf: "med",
      gloss: "13.6, 12.3, <strong>65.1</strong>, 16.7, 15.9. One chapter is on fire and it is the retreat: Father Arnall's hell is not a metaphor in this book's word-counts, it is a weather system that arrives, saturates a chapter, and leaves. The image is redeemed on the last page — <em>the smithy of my soul</em> — where the artist takes over the furnace.",
      caveat: "Includes <em>smoke</em> and <em>hell</em>, which broadens it beyond literal fire. The Chapter III spike survives either way.",
      cross: "The hall-fire in the medieval tales is hospitality; here it is punishment, and then a forge." },

    /* ── F · Figure ─────────────────────────────────────────────────────── */
    { key: "flight", code: "F1", cls: "F", name: "Flight — the bird in the name", conf: "high",
      gloss: "3.4, 6.8, 6.0, <strong>17.8, 17.4</strong>. The motif the whole book is named for barely exists until Chapter IV, then more than doubles and stays. Its first appearance in Chapter I is a football flying <em>like a heavy bird</em> — something that falls. It becomes real when the boys shout <em>Bous Stephanoumenos</em> across the water and the girl is turned into a seabird, and it ends with Stephen on the library steps counting birds for an augury like a Roman priest.",
      caveat: "The word <em>air</em> was originally in this lexicon and supplied 85 of 174 hits on its own — mostly “the evening air” and “an air” meaning a tune. Removing it halved the counts and sharpened the shape; the version above excludes it.",
      cross: "The birds of Rhiannon in <a href=\"/branwen/#motifs\">Branwen</a> sing the dead out of time; Joyce's birds do not sing, they are counted." },
    { key: "colour", code: "F2", cls: "F", name: "Colour — the maroon brush and the green", conf: "spec",
      gloss: "50.3 per 10,000 in Chapter I, then a third of that for the rest of the book. Colour is a child's grammar here: Dante's two velvet brushes, maroon for Davitt and green for Parnell; the wild rose blossoms on the little green place; Fleming colouring the earth green and the clouds maroon. Politics reaches the boy as pigment before it reaches him as argument, and once he can argue, the colour drains out of the prose.",
      caveat: "The weakest lexicon here. <em>rose</em> contributes 33 hits of which six are the verb (“he rose”), and <em>white</em>, <em>pale</em> and <em>red</em> are common enough to occur without carrying the motif. Treat the Chapter I spike as real and the rest as noise.",
      cross: "The white-and-red colour grammar of Annwn in <a href=\"/pwyll/#motifs\">Pwyll</a> is a supernatural signal; Joyce's is a party badge." },
    { key: "net", code: "F3", cls: "F", name: "Nets, snares and prison-houses", conf: "high",
      gloss: "Only 31 occurrences in the whole novel, and it is still one of the most important entries here, because Joyce gives it the book's thesis: <em>when the soul of a man is born in this country there are nets flung at it to hold it back from flight. You talk to me of nationality, language, religion.</em> Its density peaks not in Chapter V where the speech occurs, but in Chapter III — where the prison-house is hell, described by Father Arnall as <em>a strait and dark and foulsmelling prison</em>. Stephen inherits his image of confinement from the sermon that terrified him.",
      cross: "The badger-in-the-bag of <a href=\"/pwyll/#motifs\">Pwyll</a> is a literal trap and a comic one; this is the same shape used as an argument about a country." },

    /* ── L · Logos ──────────────────────────────────────────────────────── */
    { key: "voice", code: "L1", cls: "L", name: "Voice, word, silence, tongue", conf: "med",
      gloss: "The one lexicon that is high in every chapter and highest in the last — 72.8 per 10,000 in Chapter V. A novel about acquiring a voice keeps saying so. Note what is bundled with it: <em>silence</em> at 50 occurrences and <em>silent</em> at 30, because the book's decisive moments are refusals to speak — Stephen's answer to the director, Cranly's non-answer on the last page, and the <em>silence, exile and cunning</em> of the programme itself.",
      caveat: "Broad by construction; it is a lexicon about language, and this is a book about language, so a high count is close to tautological. Its value is in the chapter-to-chapter shape, not the level." },

    /* ── T · Transfer ───────────────────────────────────────────────────── */
    { key: "soul", code: "T1", cls: "T", name: "The religious lexicon", conf: "high",
      gloss: "42.9, 25.9, <strong>260.5</strong>, 161.9, 37.9. The most dramatic curve in the book. Chapter III is six times more religious than Chapter V, and Chapter IV — after the confession, during the devotional régime — is still four times. Then it collapses. This is not a theme, it is an occupation and an evacuation, and it can be dated to the chapter.",
      caveat: "<em>god</em> alone supplies 222 of 801 hits, including exclamations. The curve is unchanged if they are removed.",
      cross: "In the medieval tales the sacred and the marvellous are ambient and constant; here the sacred arrives, floods, and drains." },
    { key: "art", code: "T2", cls: "T", name: "The aesthetic lexicon", conf: "med",
      gloss: "5.1, 13.0, 12.1, 15.7, <strong>43.6</strong>. The mirror image of T1, rising where the other falls. Put them over one another and you get the novel's central claim as a single number: the ratio of religious to aesthetic vocabulary runs 8.4 : 1 in Chapter I, 21.5 : 1 at the retreat, 10.3 : 1 during the devotional life — and <strong>0.87 : 1</strong> in Chapter V, the only chapter in the book where art outweighs God. The crossing happens on the far side of the refused vocation. Stephen does not stop being a priest; he changes the sacrament.",
      cross: "Nothing to compare it with in the corpus — the medieval tales have no vocabulary for art at all, which is itself the finding." },
  ],
};
