/* Layer 4 — the discourse graph; plus Desire, and the epiphany ladder.
 *
 * WHAT THIS REPLACES, AND WHY.
 * The medieval tales here are laid against Propp's Morphology of the Folktale
 * (1928): 31 functions in fixed order — Absentation, Villainy, Departure, the
 * Donor, Struggle, Victory, Return, Recognition. Run Portrait through that
 * spine and you get almost nothing. No villain, no donor, no struggle, no task,
 * no victory, no return. Propp analyses what HAPPENS, and in Portrait almost
 * nothing happens: a boy is beaten once, wins a prize, visits a brothel,
 * confesses, declines a job, and leaves. Five chapters, no plot.
 *
 * The instrument that fits is the one built for exactly this literature.
 * Gérard Genette's DISCOURS DU RÉCIT (1972; Narrative Discourse, 1980) took its
 * whole apparatus from a modernist novel — Proust — and asks not what happened
 * but how the telling is arranged. It has five categories, and they behave like
 * Propp's functions: a finite inventory, each either realised or absent in a
 * given work, each locatable in a particular passage.
 *
 *   ORDER      the sequence of telling against the sequence of events
 *              (analepsis, prolepsis, ellipsis, achrony)
 *   DURATION   how much page a stretch of time gets
 *              (scene, summary, pause, ellipsis, stretch)
 *   FREQUENCY  how many tellings for how many happenings
 *              (singulative, iterative, repeating, pseudo-iterative)
 *   MOOD       who perceives, and at what distance
 *              (zero / internal / external focalisation; reported speech)
 *   VOICE      who narrates, from where, at which level
 *              (heterodiegetic, homodiegetic, metadiegetic, interpolated)
 *
 * That substitution is the whole methodological argument of this site's
 * modernist toolkit: Propp is a morphology of EVENTS, Genette a morphology of
 * TELLING, and a novel whose subject is its own prose needs the second.
 *
 * `passage` indexes the nineteen movements (1 = I.1 … 19 = V.4).
 * Attaches to window.PORTRAIT. */
window.PORTRAIT = window.PORTRAIT || {};

window.PORTRAIT.discourse = {
  intro: "Propp's thirty-one functions describe what a story <em>does</em>. Run <em>Portrait</em> against them and the page comes back blank: there is no villain, no donor, no interdiction, no struggle, no victory, no return. The book has almost no plot at all — a beating, a prize, a brothel, a confession, a refused job, a departure. What it has instead is <strong>arrangement</strong>, and the instrument for that was built on a modernist novel: Gérard Genette's <em>Narrative Discourse</em> (1972), whose whole apparatus came out of reading Proust. Genette's five categories — <strong>order, duration, frequency, mood, voice</strong> — work exactly the way Propp's functions do in the other tales on this site: a fixed inventory, each item realised or not, each realisation locatable in a movement. What follows is <em>Portrait</em> laid against that spine. The payoff is the same as with Propp — <a href=\"#discourse-absent\">what the book refuses</a> is as telling as what it uses.",
  acts: [
    { id: "order",     label: "Order — telling against happening", color: "#d9a441" },
    { id: "duration",  label: "Duration — page against time",      color: "#7fa3c9" },
    { id: "frequency", label: "Frequency — tellings against events", color: "#7fb37f" },
    { id: "mood",      label: "Mood — who perceives, how near",    color: "#c97f9a" },
    { id: "voice",     label: "Voice — who narrates, from where",  color: "#a58fd0" },
  ],
  moves: [
    /* ── ORDER ─────────────────────────────────────────────────────────── */
    { sym: "A⁰", node: "achrony", name: "Achrony — narrative without chronology", act: "order", passage: 1,
      gloss: "Genette's limit case: events told with no determinable position on a timeline. Not a flashback, not a flash-forward — simply outside sequence.",
      realized: "The overture. A moocow, a wet bed, a hornpipe, a rhyme about eagles — with no dates, no ages, no connectives, and no order that can be reconstructed. The novel begins by refusing the one thing a chronicle must have." },
    { sym: "P", node: "prolepsis", name: "Prolepsis — telling ahead", act: "order", passage: 2,
      gloss: "An anticipation: the narrative reaches forward to something that has not yet occurred.",
      realized: "The delirium in the Clongowes infirmary, where Stephen sees Parnell's body brought ashore and Dante walking past in maroon and green. The Christmas dinner quarrel of I.3 is announced here, in colour, before the boy can read it." },
    { sym: "An", node: "analepsis", name: "Analepsis — external", act: "order", passage: 8,
      gloss: "A return to a time before the narrative's own starting point — someone else's past, imported.",
      realized: "Cork. Stephen is walked through his father's youth: the initials cut in a desk by medical students thirty years dead, the anecdotes told for the fourth time. The reach backwards is not his memory but his father's, and he cannot enter it." },
    { sym: "An²", node: "analepsis²", name: "Analepsis — internal, recalling", act: "order", passage: 11,
      gloss: "A return to earlier material within the narrative's own span, used to rhyme two moments.",
      realized: "Father Arnall reappears at Belvedere and the sight of him drops Stephen straight back into Clongowes — the wide playgrounds, the square ditch, the smell of the corridor. The retreat is thereby staged as a return to childhood, which is exactly how it works on him." },
    { sym: "E", node: "ellipsis", name: "Ellipsis — the unnarrated", act: "order", passage: 6,
      gloss: "Time passed over in silence. Genette's most consequential category, because what is skipped is a choice.",
      realized: "The Dedalus family's ruin. There is no scene of financial collapse: between sections, furniture is carried out by men who are never named, and the family is poorer. The novel skips every event a Victorian novel would have built a chapter on." },

    /* ── DURATION ──────────────────────────────────────────────────────── */
    { sym: "S", node: "scene", name: "Scene — near-isochrony", act: "duration", passage: 3,
      gloss: "Narrative time and story time run at roughly the same rate — conventionally, dialogue.",
      realized: "The Christmas dinner. Roughly one evening, roughly one evening's worth of page, and 34% of its sentences direct speech: the highest proportion of the first half of the book. Stephen barely speaks in the longest scene of his childhood." },
    { sym: "Σ", node: "summary", name: "Summary — time compressed", act: "duration", passage: 5,
      gloss: "Months or years given in paragraphs; the workhorse tempo of the nineteenth-century novel.",
      realized: "Blackrock. A whole season of morning walks with uncle Charles, evening runs with the trainer, and Sunday reading of <em>The Count of Monte Cristo</em>, compressed into a few pages of habitual past." },
    { sym: "Π", node: "pause", name: "Descriptive pause — time stopped", act: "duration", passage: 13,
      gloss: "The narrative dwells while story time does not advance at all.",
      realized: "The devotional timetable: Sunday to the Trinity, Monday to the Holy Ghost, Tuesday to the Guardian Angels. Nothing happens for the length of the paragraph, and the paragraph is the most syntactically elaborate in the novel — 38.3 words per sentence. Stopped time and maximum ornament, together." },
    { sym: "St", node: "stretch", name: "Stretch — time dilated", act: "duration", passage: 15,
      gloss: "Narrative time exceeds story time: a few seconds given several pages.",
      realized: "The girl in midstream. She looks at him, he turns away, and the crossing of that glance takes longer to read than to live. Joyce's word for this dilation is <em>epiphany</em>; Genette's is stretch, and the two are describing the same page." },

    /* ── FREQUENCY ─────────────────────────────────────────────────────── */
    { sym: "1n", node: "singulative", name: "Singulative — told once, happened once", act: "frequency", passage: 12,
      gloss: "The default: one telling for one occurrence.",
      realized: "The confession in Church Street chapel. It happens once, is told once, and the prose contracts to 11.0 words a sentence to do it — the book's second-shortest, against 21.1 in the sermon immediately before." },
    { sym: "n1", node: "iterative", name: "Iterative — told once, happened often", act: "frequency", passage: 13,
      gloss: "<em>Every morning he would…</em> One telling standing for an indefinite number of occurrences.",
      realized: "The whole devotional régime of IV.1: the rosaries told off on the fingers, the three chaplets, the ejaculations, the ledger of grace poured into a heavenly cashbox. Habit rendered as grammar — and habit is what the chapter has to destroy." },
    { sym: "n¹", node: "pseudo-iter", name: "Pseudo-iterative", act: "frequency", passage: 5,
      gloss: "Genette's catch: a scene given in fully particular detail while claiming to be habitual. It cannot literally have happened that way every time.",
      realized: "Uncle Charles in the outhouse — <em>every morning, therefore</em> — and then a completely specific old man greasing his back hair and putting on his tall hat. The iterative frame is a fiction; what we are shown is one morning, wearing the costume of all of them." },
    { sym: "1n̄", node: "repeating", name: "Repeating — told often, happened once", act: "frequency", passage: 17,
      gloss: "Several tellings of a single occurrence — the modernist signature, and the mechanism of leitmotif.",
      realized: "The villanelle. Its two refrains return five times across the movement, each time with more of the poem attached to them, so that the reader watches a single act of composition recur. The novel's leitmotifs work the same way at book scale: see the <a href=\"#motifs\">Leitmotif index</a>." },

    /* ── MOOD ──────────────────────────────────────────────────────────── */
    { sym: "F", node: "internal", name: "Internal focalisation — fixed", act: "mood", passage: 1,
      gloss: "The narrative is restricted throughout to what one character perceives and knows.",
      realized: "The entire book, without a single lapse. There is no sentence in <em>Portrait</em> that reports what Simon Dedalus is thinking, or what Emma thinks of Stephen. The restriction is total, and it is why the novel can be so ironic without ever commenting." },
    { sym: "F⁻", node: "external", name: "External focalisation", act: "mood", passage: 4,
      gloss: "The narrator reports less than the character knows — behaviour only, no interiority.",
      realized: "The schoolyard talk about the boys caught at the Hill of Lyons: an exchange of voices with no attribution beyond <em>one fellow said</em>. The reader is given the sound of a rumour and left to assemble what it means, exactly as a nine-year-old must." },
    { sym: "D", node: "fid", name: "Free indirect discourse — the Uncle Charles Principle", act: "mood", passage: 5,
      gloss: "Character idiom pervades third-person narration without quotation marks. Kenner's name for Joyce's version of it (Joyce's Voices, 1978): the narrative idiom need not be the narrator's.",
      realized: "<em>Every morning, therefore, uncle Charles repaired to his outhouse</em>. Nobody but uncle Charles would say <em>repaired</em>. The device runs the whole book — the child's <em>moocow</em>, the schoolyard's <em>smugging</em>, the preacher's <em>abode of demons</em>, the manual's timetable — and the <a href=\"#read\">Voice column</a> is nothing but an index of it." },
    { sym: "R", node: "reported", name: "Reported speech — maximum mimesis", act: "mood", passage: 11,
      gloss: "Speech given verbatim and unframed, the narrator at zero distance.",
      realized: "The sermons. Twelve thousand words of Father Arnall with no quotation frame, no ironic tag, no narrator standing beside them. The reader is put in the pew and made to take it at full strength, which is the only way the chapter's effect on Stephen becomes intelligible." },

    /* ── VOICE ─────────────────────────────────────────────────────────── */
    { sym: "N³", node: "heterodiegetic", name: "Heterodiegetic narration", act: "voice", passage: 2,
      gloss: "A narrator absent from the story he tells; third person.",
      realized: "Movements I.1 through V.3 — eighteen of the nineteen. And a strange kind of third person: one that owns no vocabulary of its own and is continuously colonised by whoever is nearest." },
    { sym: "N¹", node: "homodiegetic", name: "Homodiegetic switch — the diary", act: "voice", passage: 19,
      gloss: "The narrator becomes a character in his own narrative; first person.",
      realized: "<em>March 20. Long talk with Cranly on the subject of my revolt.</em> After 83,000 words of third person the book changes person on its last pages — and the prose immediately shortens to 7.75 words a sentence, the briefest in the novel. Stephen wins his <em>I</em> and loses his syntax." },
    { sym: "N⁰", node: "interpolated", name: "Interpolated narrating", act: "voice", passage: 19,
      gloss: "Narration inserted between the moments of the action rather than after them — the diary and the epistolary novel's tense.",
      realized: "The diary entries are written between the events they record, so the narrator cannot know how it comes out. The book's last line is therefore a petition, not a report: <em>stand me now and ever in good stead</em>." },
    { sym: "M", node: "metadiegetic", name: "Metadiegetic narrative — a story inside the story", act: "voice", passage: 16,
      gloss: "A character narrates; the embedded tale acquires its own teller and its own time.",
      realized: "Davin's story of walking home from the hurling match and the woman who opened her door to him half-undressed and asked him to stay. It lodges in Stephen as the image of his whole race — <em>a batlike soul waking to the consciousness of itself in darkness</em> — and it is the only story in the novel he does not tell himself." },
  ],
  absent: {
    note: "With Propp, the comparative payoff is which of the thirty-one functions a tale skips. With Genette the same trick works, and it is sharper here, because <em>Portrait</em> declines things the nineteenth-century novel could not do without. These are not oversights; each refusal is what makes the book modern.",
    groups: [
      { syms: "F⁰", label: "Zero focalisation — the omniscient narrator", text: "Never, not once, in 84,921 words. No sentence in the novel knows anything Stephen does not know. Eliot, Thackeray and Dickens all step outside a character to explain him; Joyce has removed the exit." },
      { syms: "Ex", label: "Exposition for the reader", text: "Parnell, the Fenians, the Church's condemnation, the collapse of the Dedalus fortune, who Michael Davitt was — none of it explained. The reader is left in the position of the child at the table: surrounded by an argument whose terms are assumed." },
      { syms: "Cl", label: "Closure", text: "No marriage, no death, no inheritance, no homecoming, no achieved work. Stephen has written one villanelle and a page of aesthetics. The novel ends at a departure and asks a dead craftsman for help." },
      { syms: "Cs", label: "The causal chapter-join", text: "Chapters do not follow from one another; they undercut one another. The fountain of Chapter I is answered by uncle Charles's pipe, the ciborium by a devotional timetable, the girl on the strand by a third cup of watery tea. The joins carry the book's judgement — see the <a href=\"#epiphanies\">Epiphany ladder</a>." },
      { syms: "Pr⁺", label: "Prolepsis of success", text: "A Künstlerroman is expected to guarantee its artist. This one never does. Nothing in the narration confirms Stephen will write anything, and the reader who knows <em>Ulysses</em> knows he comes back to Dublin having failed." },
    ],
    verdict: "Propp's inventory is a grammar of events, and this novel has almost no events. Genette's is a grammar of telling, and this novel is nothing but telling — which is why the swap works, and why the absences above are more informative than any of the twenty realisations. What <em>Portrait</em> refuses is precisely the apparatus by which a nineteenth-century novel tells you what to think.",
  },
};

/* ── Desire ─────────────────────────────────────────────────────────────
   Greimas's actantial model still fits — it is general enough to survive the
   move from folktale to novel — but on its own it mis-describes Portrait,
   because it wants an Object that is a thing and an Opponent who is a person,
   and this book has neither. So it is run here alongside René Girard's
   MENSONGE ROMANTIQUE ET VÉRITÉ ROMANESQUE (1961), which was written about the
   novel specifically and adds the term Greimas lacks: the MEDIATOR. Girard's
   claim is that novelistic desire is never a straight line from subject to
   object; it is triangular. We want what we want because someone we admire
   wants it first. Portrait's mediator is the priesthood — and the giveaway is
   that Stephen describes his vocation as an artist in the exact vocabulary of
   the one he refused. */
window.PORTRAIT.desire = {
  intro: "Greimas asks six questions of a story: who wants, what is wanted, who dispatches the wanting, who profits by it, what helps, what blocks. The medieval tales on this site answer all six with people and things — Rhiannon, a stolen son, a rival suitor. <em>Portrait</em> answers almost none of them that way, and the mismatch is the finding. The Object is not a thing but a <em>vocation that does not exist yet</em>; the Opponent is not a person but three discourses; and there are essentially no Helpers. What the diagram cannot show, René Girard supplies: novelistic desire is <strong>triangular</strong> — it runs through a model. Stephen's model is the priest he refuses to become.",
  subject: "Stephen Dedalus", subjectRef: "stephen",
  object: "the uncreated conscience of his race — a vocation with no existing holder",
  value: "authority over reality: the power to transmute experience into permanent form",
  sender: "the name itself — Dedalus, the old artificer, and Ovid's epigraph",
  receiver: "“my race” — the Ireland he is leaving in order to write it",
  mediator: "the priesthood",
  mediatorNote: "Girard's third term, and the one Greimas has no slot for. Stephen refuses ordination in IV.2 and then describes his art in the refused office's own words: <em>a priest of eternal imagination, transmuting the daily bread of experience into the radiant body of everlasting life</em>. The consecration, the transubstantiation, the daily office, even the word <em>epiphany</em> — a feast of the Church — are all carried across intact. He does not escape the model; he inherits its powers. The <a href=\"#style\">Style curve</a> measures the transfer: religious vocabulary outnumbers aesthetic vocabulary 21.5 to 1 in Chapter III and 0.87 to 1 in Chapter V, the only chapter where art outweighs God.",
  helpers: [
    { name: "Cranly", ref: "cranly", note: "hears the confession the priests no longer can, and asks the two questions that hurt — about his mother, and whether he has ever loved anyone" },
    { name: "Lynch", ref: "lynch", note: "supplies an ear for the aesthetic theory and the interruptions that keep it from going unchallenged" },
    { name: "The girl in midstream", ref: "birdgirl", note: "not an ally but an image: the sign that authorises the vocation, and she is never asked" },
  ],
  opponent: "the three nets — nationality, language, religion", opponentRef: null,
  unreachable: true,
  note: "The tale-shaped reading would make the Church the villain and departure the victory. The actantial diagram refuses that, because the Opponent here is not a party to a conflict — it is the medium Stephen is made of. He cannot fight nationality, language and religion; he speaks all three, and says so in V.1: <em>the language in which we are speaking is his before it is mine.</em> Hence the dotted arrow. The Object cannot be reached inside the book: nothing is written, nothing is achieved, and the last page is a prayer to a mythical father. Kenner's reading — that Stephen is not Daedalus the artificer but Icarus the son who fell — is the actantial diagram read honestly.",
};

/* ── The epiphany ladder ────────────────────────────────────────────────
   The oral-formulaic THEME (Parry–Lord) is the medieval layer here: a recurring
   scene-type with a fixed internal shape — the feast in hall, the arming of the
   hero. Portrait has an exact counterpart, and unusually the author defined it
   himself. In Stephen Hero Joyce calls the epiphany "a sudden spiritual
   manifestation, whether in the vulgarity of speech or of gesture or in a
   memorable phase of the mind itself," and gives the artist the job of recording
   them. Like a type-scene it recurs, has a fixed shape (a rise into cadence, a
   held image, a fall), and appears at structurally predictable places.

   Hugh Kenner's "The Portrait in Perspective" (1948) supplies the rest of the
   pattern: every chapter closes on an exaltation that the NEXT chapter's opening
   deflates. Both the closings and the openings below are verbatim, extracted
   mechanically from the same spans the Style curve measures. */
window.PORTRAIT.epiphanies = {
  intro: "A folk tale's recurring unit is the <strong>type-scene</strong>: the feast in hall, the arming of the hero, a shape the audience recognises before the words arrive. <em>Portrait</em>'s recurring unit was named by its own author. In <em>Stephen Hero</em> Joyce defines the <strong>epiphany</strong> as “a sudden spiritual manifestation, whether in the vulgarity of speech or of gesture or in a memorable phase of the mind itself,” and it behaves exactly like a type-scene: fixed internal shape (a rise into cadence, one held image, a fall), and predictable structural position — the end of a chapter. Hugh Kenner added the other half of the pattern in 1948: each of these exaltations is deflated by the opening of the chapter that follows. Set the pairs side by side and the novel's architecture is visible in eight quotations. The joins are the argument.",
  rungs: [
    { id: "r1", label: "The fountain, answered by a pipe", passage: 4, next: 5,
      close: "…the sound of the cricket bats: pick, pack, pock, puck: like drops of water in a fountain falling softly in the brimming bowl.",
      open: "Uncle Charles smoked such black twist that at last his nephew suggested to him to enjoy his morning smoke in a little outhouse at the end of the garden.",
      note: "Stephen has just been carried in triumph for facing down the rector, and the prose declines to say so — it goes to the sound of cricket bats instead and turns them into water. The next chapter opens on an old man's black tobacco and a shed. Nothing in between explains the drop; the join does the work." },
    { id: "r2", label: "The kiss, answered by stew", passage: 9, next: 10,
      close: "…he felt an unknown and timid pressure, darker than the swoon of sin, softer than sound or odour.",
      open: "The swift December dusk had come tumbling clownishly after its dull day and as he stared through the dull square of the window of the schoolroom he felt his belly crave for its food. He hoped there would be stew for dinner, turnips and carrots…",
      note: "The one rung whose exaltation is a surrender rather than a flight — and, measurably, the one chapter-close that does not chant. Its coordination rate sits at the 70.8th percentile of its own chapter where the others reach 97.5, 96.7, 89.3 and 84.8. The next chapter answers a swoon with an appetite, which is the same appetite in a lower register." },
    { id: "r3", label: "The ciborium, answered by a timetable", passage: 12, next: 13,
      close: "—<em>Corpus Domini nostri</em>. The ciborium had come to him.",
      open: "Sunday was dedicated to the mystery of the Holy Trinity, Monday to the Holy Ghost, Tuesday to the Guardian Angels, Wednesday to Saint Joseph…",
      note: "The quietest ending in the book — six words, no cadence at all — followed by the most elaborate prose in the book. Grace arrives as a plain sentence and is immediately converted into administration. The style curve shows the join as its steepest single step: 11.0 words a sentence to 38.3." },
    { id: "r4", label: "The bird-girl, answered by tea-dregs", passage: 15, next: 16,
      close: "…the tide was flowing in fast to the land with a low whisper of her waves, islanding a few last figures in distant pools.",
      open: "He drained his third cup of watery tea to the dregs and set to chewing the crusts of fried bread that were scattered near him, staring into the dark pool of the jar.",
      note: "The clearest rung, and the cruellest. Both spans are about water. One is a tide islanding figures at dusk; the other is a pool of dripping scooped out like a boghole. Chapter IV's closing 400 words carry the second-highest coordination rate in the novel; Chapter V's opening drops to 42.5 per thousand and stays down." },
    { id: "r5", label: "The prayer, answered by nothing", passage: 19, next: null,
      close: "<em>April</em> 27. Old father, old artificer, stand me now and ever in good stead.",
      open: null,
      note: "The last rung has no next chapter to deflate it, so the deflation had to be built in: the great sentence about forging the uncreated conscience of his race is followed, seven days later, by a two-line prayer to a mythical craftsman — and the prose of the whole diary runs at 7.75 words a sentence, shorter than the infant overture that opened the book. Joyce supplies the fall himself, and then <em>Ulysses</em> supplies it again." },
  ],
  inner: [
    { id: "e-ivory", label: "Ivory, ivoire, avorio, ebur", passage: 8,
      lines: "<em>Ivory, ivoire, avorio, ebur.</em> One of the first examples that he had learnt in Latin had run: <em>India mittit ebur</em>…",
      note: "A word declined across four languages until it stops meaning anything and becomes a sound. Joyce's <em>vulgarity of speech</em> class of epiphany: the manifestation is in the language itself, not in an event." },
    { id: "e-foetus", label: "The word carved in the desk", passage: 8,
      lines: "The word <em>Foetus</em> cut in the dark stained wood of a desk in the anatomy theatre at Queen's College, Cork.",
      note: "The negative epiphany. A word cut by a medical student dead thirty years, and it tells Stephen more about his own body and his father's youth than anything either of them says. Sudden manifestation, and nothing spiritual about it." },
    { id: "e-tundish", label: "Tundish", passage: 16,
      lines: "—Is that called a <em>tundish</em> in Ireland? asked the dean. I never heard the word in my life.",
      note: "An English priest does not recognise an English word, and Stephen discovers that the language he writes in belongs to somebody else. The epiphany arrives disguised as a small social humiliation — and it is the moment the novel's whole voice-problem becomes conscious." },
    { id: "e-name", label: "The name called out of the water", passage: 15,
      lines: "—Stephanos Dedalos! Bous Stephanoumenos! Bous Stephaneforos!",
      note: "Boys shouting a schoolboy Greek joke at a bather, heard by Stephen as a prophecy of his vocation. The purest case of an epiphany's mechanism in Joyce: the manifestation is entirely in the receiver, and the vulgarity of the source is the point." },
  ],
};
