/* A Portrait of the Artist as a Young Man — layers 1 and 2.
 *
 * On the medieval tales of this site, layer 1 is the source and layer 2 is a
 * translation: Middle Welsh on the left, English on the right. Portrait is
 * already in English, so a translation column would be empty — and that is
 * exactly the interesting problem, because the prose of this novel is never
 * plainly the author's. Hugh Kenner named the procedure the UNCLE CHARLES
 * PRINCIPLE (Joyce's Voices, 1978): "the normally neutral narrative vocabulary
 * pervaded by a little cloud of idioms which a character might use if he were
 * managing the narrative." Uncle Charles does not go to the outhouse; he
 * REPAIRS to it, because that is his word, and the third person has borrowed it.
 *
 * So the right-hand column is not a translation but an ATTRIBUTION: whose
 * idiom is wearing the narration here. That is the modernist counterpart of the
 * facing-page translation — the text is in English and still in someone else's
 * language, and naming the owner is what a reader needs.
 *
 * Every quotation in the `w` field is verbatim from
 * source/portrait-gutenberg-4217.txt (Project Gutenberg #4217, the 1916 text,
 * public domain). Openings and closings were extracted mechanically rather than
 * retyped, because the Style curve measures those same spans and the two layers
 * must be looking at the same words. Italics in the source (_like this_) are
 * rendered as <em>.
 *
 * The novel divides into five chapters and nineteen sections. Print editions
 * mark the sections with blank space; the Gutenberg plain text does not
 * preserve that, so each boundary here is anchored by its opening words —
 * see measure/measure.mjs, which fails loudly if an anchor stops matching.
 *
 * Attaches to window.PORTRAIT. */
window.PORTRAIT = window.PORTRAIT || {};
window.PORTRAIT.tale = {
  meta: {
    blurb: "<strong>A Portrait of the Artist as a Young Man</strong> — James Joyce, serialised 1914–15 in <em>The Egoist</em>, published 1916. Five chapters, nineteen sections, 84,921 words. A boy at Clongowes becomes a schoolboy at Belvedere becomes a sinner becomes a penitent becomes a candidate for the priesthood becomes an artist, and the prose changes with him at every step — that is the book's method and its argument. Below, each of the nineteen movements is opened and closed in Joyce's own words, with a facing column naming <strong>whose idiom the narration is wearing</strong>. The apparatus around it — <a href=\"#discourse\">discourse graph</a>, <a href=\"#motifs\">leitmotif index</a>, <a href=\"#style\">style curve</a>, <a href=\"#myth\">mythograph</a> — is the same seven-layer apparatus this site built for <em>Sir Gawain</em> and the Four Branches, with the folklorists' instruments swapped out for ones that fit a modernist novel. Why they had to be swapped, and what broke when they were, is set out on the <a href=\"#method\">Method</a> page.",
    sources: [
      { label: "A Portrait of the Artist as a Young Man — Project Gutenberg #4217 (1916 text, public domain)", url: "https://www.gutenberg.org/ebooks/4217", host: "Project Gutenberg" },
      { label: "The full source text as used here, verbatim", url: "source/portrait-gutenberg-4217.txt", host: "this site" },
      { label: "Read the whole novel in this site's speed reader", url: "/", host: "read.mino.mobi" },
      { label: "Hugh Kenner, “The Portrait in Perspective” (Kenyon Review, 1948)", url: "http://www.ricorso.net/rx/library/criticism/major/Joyce_JA/Kenner_H1.htm", host: "Ricorso" },
      { label: "Uncle Charles Principle — Kenner, Joyce's Voices (1978)", url: "https://en.wikipedia.org/wiki/Uncle_Charles_Principle", host: "Wikipedia" },
      { label: "Gérard Genette, Narrative Discourse: An Essay in Method (1972/1980)", url: "https://dn790007.ca.archive.org/0/items/NarrativeDiscourseAnEssayInMethod/NarrativeDiscourse-AnEssayInMethod.pdf", host: "Internet Archive" },
    ],
  },
  roadmap: [
    { t: "Source text in hand (Gutenberg #4217)", done: true },
    { t: "Nineteen movements anchored and measured", done: true },
    { t: "Voice attribution — openings and closings", done: true },
    { t: "Voice attribution — every pivot passage", done: false },
    { t: "Discourse graph (Genette)", done: true },
    { t: "Leitmotif index (measured)", done: true },
    { t: "Epiphany ladder", done: true },
    { t: "Style curve", done: true },
    { t: "Mythograph", done: true },
  ],

  passages: [
    /* ══════════════════ CHAPTER I ══════════════════ */
    {
      id: "I.1", chapter: "I", title: "I.1 · The overture",
      sub: "Bray, infancy — the moocow, the wet bed, the eagles",
      segments: [
        {
          w: "Once upon a time and a very good time it was there was a moocow coming down along the road and this moocow that was coming down along the road met a nicens little boy named baby tuckoo…. His father told him that story: his father looked at him through a glass: he had a hairy face.",
          e: "<strong>His father's, then his own.</strong> The novel opens by quoting somebody else — the story as the father tells it — and then keeps the child's words to describe the man telling it. <em>Moocow</em>, <em>nicens</em>, <em>baby tuckoo</em> are not available to an adult narrator; they are what the third person has borrowed. Nothing here is focalised <em>about</em> the child; the sentence is built out of him.",
          n: "This is the Uncle Charles Principle at its purest — before there is a character there is already an idiom. Note also what is missing: no scene-setting, no date, no name for the father. Genette's <em>zero degree</em> of narrative information."
        },
        {
          w: "His mother had a nicer smell than his father. She played on the piano the sailor's hornpipe for him to dance. He danced: Tralala lala, Tralala tralaladdy, Tralala lala, Tralala lala.",
          e: "<strong>The sensorium, ranked.</strong> The organising fact of the paragraph is a comparison of <em>smells</em>. The book's first act of judgement is olfactory, and its first aesthetic form is a nonsense refrain the boy performs himself.",
          n: "The novel will end with an aesthetic theory in scholastic Latin. It begins with a smell and a noise, and the whole distance between those two registers is what the Style curve measures."
        },
        {
          w: "His mother said:<br>—O, Stephen will apologise.<br>Dante said:<br>—O, if not, the eagles will come and pull out his eyes.—<br><br>Pull out his eyes,<br>Apologise,<br>Apologise,<br>Pull out his eyes.<br><br>Apologise,<br>Pull out his eyes,<br>Pull out his eyes,<br>Apologise.",
          e: "<strong>Dante's threat, metabolised into the child's own rhyme.</strong> Two adult sentences go in; what comes out is a chant that has lost its speaker. The threat is no longer <em>said</em> by anyone — it has become a form, and the form is the child's.",
          n: "The first of the five chapter-closings, and already the pattern: the section ends not on an event but on a <em>cadence</em>. Chapter I's closing 400 words run 72.5 <em>and</em>s per thousand — the 97.5th percentile of its own chapter. See the Style curve."
        },
      ],
    },
    {
      id: "I.2", chapter: "I", title: "I.2 · Clongowes",
      sub: "The playground, the square ditch, the infirmary, the death of Parnell",
      segments: [
        {
          w: "The wide playgrounds were swarming with boys. All were shouting and the prefects urged them on with strong cries. The evening air was pale and chilly and after every charge and thud of the footballers the greasy leather orb flew like a heavy bird through the grey light.",
          e: "<strong>The school's idiom, with one word of Stephen's in it.</strong> The sentence is public and factual until <em>greasy</em>, which is a small boy's disgust, and <em>like a heavy bird</em>, which is the novel's first flight image — attached, at the start, to something that falls.",
          n: "The bird-image enters the book here as a football. It will not be a bird properly until IV.3, and the Leitmotif index shows exactly that shape: flight sits at 17.5 per 10,000 in Chapter I and 36.6 in Chapter IV."
        },
        {
          w: "It would be nice to lie on the hearthrug before the fire, leaning his head upon his hands, and think on those sentences. He shivered as if he had cold slimy water next his skin.",
          e: "<strong>The body doing the thinking.</strong> The paragraph begins in reverie and ends in the skin. Cold and wet are, in Chapter I, the words for everything that has gone wrong — the square ditch, the bed, the fear.",
          n: "The <em>cold</em> lexicon runs at 24.3 per 10,000 words in Chapter I and 3.4 in Chapter V: the highest and the lowest in the book. The child registers the world thermally; the aesthete has stopped feeling temperature at all."
        },
        {
          w: "…is dead! They fell upon their knees, moaning in sorrow.<br><br>And he saw Dante in a maroon velvet dress and with a green velvet mantle hanging from her shoulders walking proudly and silently past the people who knelt by the water's edge.",
          e: "<strong>A child's dream, in pure colour.</strong> The politics of the next section arrive here first as two velvet brushes — maroon for Michael Davitt, green for Parnell — with no argument attached. The narration knows only what the sleeping boy knows.",
          n: "Genette would call this a <em>prolepsis</em>: the Christmas dinner quarrel is announced before it happens, in a form the child cannot yet read. The colour lexicon peaks in Chapter I (50.3 per 10,000) and never recovers."
        },
      ],
    },
    {
      id: "I.3", chapter: "I", title: "I.3 · The Christmas dinner",
      sub: "Bray — Dante, Mr Casey, and the dead king",
      segments: [
        {
          w: "A great fire, banked high and red, flamed in the grate and under the ivytwined branches of the chandelier the Christmas table was spread. They had come home a little late and still dinner was not ready: but it would be ready in a jiffy, his mother had said.",
          e: "<strong>The house's own voice.</strong> The register is domestic and slightly festive — <em>in a jiffy</em> is his mother's phrase, reported without quotation marks and left to colour the sentence around it. Stephen is present in this section almost entirely as a listener.",
          n: "The one movement of the novel in which the adults hold the floor: 34% of its sentences are direct speech, against 1.5% in IV.1. The narration abdicates and lets Ireland argue."
        },
        {
          w: "…from his holders, suddenly bowed his head on his hands with a sob of pain.<br>—Poor Parnell! he cried loudly. My dead king!<br>He sobbed loudly and bitterly.<br><br>Stephen, raising his terrorstricken face, saw that his father's eyes were full of tears.",
          e: "<strong>Flat registration, no comment.</strong> After a scene of enormous rhetoric — hell, priests, Ireland, the dead king — the last sentence has no rhetoric in it at all. The narration declines to say what the boy makes of it, because he does not yet make anything of it.",
          n: "Kenner's structural claim is that each chapter closes on a note the next chapter's opening deflates. This close is the exception that proves the design: it deflates itself, in advance, in its own last line."
        },
      ],
    },
    {
      id: "I.4", chapter: "I", title: "I.4 · The pandybat",
      sub: "Clongowes — the broken glasses, Father Dolan, the appeal to the rector",
      segments: [
        {
          w: "The fellows talked together in little groups.<br>One fellow said:<br>—They were caught near the Hill of Lyons.<br>—Who caught them?<br>—Mr Gleeson and the minister. They were on a car.",
          e: "<strong>The schoolyard, unmediated.</strong> Pure exchange, no attribution beyond <em>one fellow</em>. The narration has become a recording device — which is how the section will be able to stage an injustice without ever calling it one.",
          n: "Genette's <em>external focalisation</em>: the narrator reports less than the characters know. Joyce uses it to make the reader do the moral work."
        },
        {
          w: "…schemers. At your work, I tell you. Father Dolan will be in to see you every day. Father Dolan will be in tomorrow.<br>He poked one of the boys in the side with his pandybat, saying:<br>—You, boy! When will Father Dolan be in again?",
          e: "<strong>The prefect's idiom, repeating itself.</strong> The sentence structure is the man's tic, not the narrator's ear: the same clause twice, then a third time as a question put in a child's mouth. Violence here is a matter of <em>diction</em>.",
          n: "<em>Schemer</em> is Father Dolan's word and the novel keeps it in the boy's head for pages afterwards. An idiom is installed by force; the Uncle Charles Principle has a dark side."
        },
        {
          w: "…silence he could hear the bump of the balls: and from here and from there through the quiet air the sound of the cricket bats: pick, pack, pock, puck: like drops of water in a fountain falling softly in the brimming bowl.",
          e: "<strong>The first full epiphany-cadence.</strong> Triumph is not narrated — the boys have just carried Stephen in victory and the prose declines to say so. Instead the sound of cricket bats is heard, named onomatopoeically, and then converted into water. Nobody's idiom: this is the book's own.",
          n: "Four monosyllables and a simile that turns a game into a fountain. The cadence recurs at the end of every chapter, and the measurement of it is the parataxis test on the Style curve page."
        },
      ],
    },

    /* ══════════════════ CHAPTER II ══════════════════ */
    {
      id: "II.1", chapter: "II", title: "II.1 · Blackrock",
      sub: "Uncle Charles, the trainer, and Mercedes",
      segments: [
        {
          w: "Uncle Charles smoked such black twist that at last his nephew suggested to him to enjoy his morning smoke in a little outhouse at the end of the garden.<br>—Very good, Simon. All serene, Simon, said the old man tranquilly. Anywhere you like.",
          e: "<strong>Uncle Charles's, entirely.</strong> The chapter opens by handing the narration to a minor character. <em>All serene</em> is his phrase; the sentence rhythm is his amiability.",
          n: "Two paragraphs later comes the sentence Kenner built a whole theory on: <em>Every morning, therefore, uncle Charles repaired to his outhouse…</em> Nobody but uncle Charles would say <em>repaired</em>, and the narrator says it anyway."
        },
        {
          w: "Every morning, therefore, uncle Charles repaired to his outhouse but not before he had greased and brushed scrupulously his back hair and brushed and put on his tall hat.",
          e: "<strong>The Uncle Charles Principle, in one word.</strong> <em>Repaired</em> — a genteel old man's verb for walking to the shed. Wyndham Lewis read it as Joyce writing badly. Kenner saw that the diction had been lent: the narrative idiom need not be the narrator's.",
          n: "This is the founding example of the whole apparatus in this column. Once you can hear it here you can hear it everywhere in the book — including in places where the borrowed idiom is a preacher's, or a devotional manual's, and much harder to laugh at."
        },
        {
          w: "…and in that moment of supreme tenderness he would be transfigured. He would fade into something impalpable under her eyes and then in a moment, he would be transfigured. Weakness and timidity and inexperience would fall from him in that magic moment.",
          e: "<strong>Dumas, via Stephen.</strong> The Mercedes fantasy is written in the idiom of the romance Stephen has been reading. <em>Transfigured</em> twice in three sentences is not the narrator running out of words — it is a boy running the same sentence again because he likes it.",
          n: "The first of the novel's borrowed <em>aesthetic</em> voices, and the template for the villanelle in V.2. The prose will get better at this and never stop being a quotation of something."
        },
      ],
    },
    {
      id: "II.2", chapter: "II", title: "II.2 · The move to Dublin",
      sub: "The caravans, Harold's Cross, the tram, the verses to E—— C——",
      segments: [
        {
          w: "Two great yellow caravans had halted one morning before the door and men had come tramping into the house to dismantle it. The furniture had been hustled out through the front garden which was strewn with wisps of straw and rope ends and into the huge vans at the gate.",
          e: "<strong>The passive voice of decline.</strong> Nobody decides anything: furniture <em>had been hustled</em>, men <em>had come</em>. The family's ruin arrives as agentless grammar, which is precisely how a child experiences it.",
          n: "Genette's <em>iterative</em> and <em>pluperfect</em> doing social history. The Dedalus fortune collapses across the book without a single scene in which it is discussed."
        },
        {
          w: "…had been mutton hash that day and he knew that his father would make him dip his bread in the gravy. But he did not relish the hash for the mention of Clongowes had coated his palate with a scum of disgust.",
          e: "<strong>The palate again.</strong> A social humiliation is registered as a taste. The chapter's ending is domestic, greasy and small — exactly the deflation Kenner describes following the previous chapter's fountain.",
          n: "Chapter I closes on water in a brimming bowl; Chapter II opens with a man's morning pipe and closes in mutton fat. The ladder of the book is built out of these joins."
        },
      ],
    },
    {
      id: "II.3", chapter: "II", title: "II.3 · Belvedere",
      sub: "The Whitsuntide play, Heron and the ashplant, the heresy in the essay",
      segments: [
        {
          w: "—I walked bang into him, said Mr Dedalus for the fourth time, just at the corner of the square.<br>—Then I suppose, said Mrs Dedalus, he will be able to arrange it. I mean about Belvedere.",
          e: "<strong>Simon Dedalus's, for the fourth time.</strong> The narration counts the repetitions. That counting is the first clearly ironic act by the book's narrator — a small distance opening between the prose and the father.",
          n: "The distance will widen until, in V.1, Stephen can say <em>a father is a necessary evil</em>. But the mechanism is already here, and it is grammatical, not editorial."
        },
        {
          w: "…wall of the lane and breathed slowly the rank heavy air. That is horse piss and rotted straw, he thought. It is a good odour to breathe. It will calm my heart. My heart is quite calm now. I will go back.",
          e: "<strong>Stephen's own, for the first time — flat, present-tense, willed.</strong> Five short declarative sentences with no ornament. He is issuing instructions to himself, and the prose obeys them. This is the voice that will write the diary in V.4.",
          n: "The most modern-sounding paragraph in the first half of the book, and it is about horse piss. The novel's route to a mature style runs through disgust, not beauty."
        },
      ],
    },
    {
      id: "II.4", chapter: "II", title: "II.4 · Cork",
      sub: "The night mail with his father, the auction, the word carved in the desk",
      segments: [
        {
          w: "Stephen was once again seated beside his father in the corner of a railway carriage at Kingsbridge. He was travelling with his father by the night mail to Cork. As the train steamed out of the station he recalled his childish wonder of years before…",
          e: "<strong>The narrator's, at maximum distance.</strong> Two flat sentences of pure information — the only place in the chapter where the prose sounds like a report. Stephen is being moved through his father's past and the style refuses to warm to it.",
          n: "Genette's <em>analepsis</em>: the section's whole business is a return to a time before the novel began, conducted in someone else's memory."
        },
        {
          w: "…Of climbing heaven and gazing on the earth,<br>Wandering companionless…?<br><br>He repeated to himself the lines of Shelley's fragment. Its alternation of sad human ineffectiveness with vast inhuman cycles of activity chilled him and he forgot his own human and ineffectual grieving.",
          e: "<strong>Shelley's, then a borrowed critical idiom.</strong> Stephen escapes his father's voice by quoting a poet, and the prose that follows is not his either: <em>alternation of sad human ineffectiveness with vast inhuman cycles</em> is undergraduate criticism, a register he has just acquired.",
          n: "The relative-pronoun rate leaps from 1.0 per thousand in Chapter I to 4–10 in Chapter II. Subordination is the sound of a boy learning to sound educated."
        },
      ],
    },
    {
      id: "II.5", chapter: "II", title: "II.5 · The prize money",
      sub: "Foster Place, the brief order and elegance, and the woman in the yellow gown",
      segments: [
        {
          w: "Stephen's mother and his brother and one of his cousins waited at the corner of quiet Foster Place while he and his father went up the steps and along the colonnade where the Highland sentry was parading.",
          e: "<strong>Civic and financial.</strong> The Bank of Ireland, a sentry, a colonnade: the language of institutions, briefly borrowed by a boy who has just won money and believes it will hold his family together.",
          n: "The exhibition and essay prize — £33 — is the only time in the book the Dedalus family has money, and it is spent in about nine pages."
        },
        {
          w: "…parting lips. They pressed upon his brain as upon his lips as though they were the vehicle of a vague speech; and between them he felt an unknown and timid pressure, darker than the swoon of sin, softer than sound or odour.",
          e: "<strong>Nobody's — the cadence again, but inverted.</strong> The chapter's exaltation is a surrender rather than a flight, and the prose registers it: comparatives without a comparison, the senses trading places, the sentence closing on two nouns that cancel each other.",
          n: "The one chapter-close that does <em>not</em> spike in coordination (70.8th percentile of its own chapter, against 97.5 / 96.7 / 89.3 / 84.8 for the rest). Where Joyce's endings usually chant, this one dissolves — which is the difference between an ecstasy and a capitulation, measured."
        },
      ],
    },

    /* ══════════════════ CHAPTER III ══════════════════ */
    {
      id: "III.1", chapter: "III", title: "III.1 · Stew and sin",
      sub: "The schoolroom, the nightly rounds of Nighttown, the retreat announced",
      segments: [
        {
          w: "The swift December dusk had come tumbling clownishly after its dull day and as he stared through the dull square of the window of the schoolroom he felt his belly crave for its food. He hoped there would be stew for dinner, turnips and carrots…",
          e: "<strong>The belly's, in a fallen decorative register.</strong> <em>Tumbling clownishly</em> is Stephen's aestheticism running on empty; the sentence then drops straight into turnips. The chapter's subject — appetite dressed as devotion — is set out in one sentence.",
          n: "He is at this point prefect of the sodality of the Blessed Virgin Mary and a nightly visitor to the brothels of Monto. The prose holds both without comment."
        },
        {
          w: "…<em>thy last things and thou shalt not sin for ever</em>—words taken, my dear little brothers in Christ, from the book of Ecclesiastes, seventh chapter, fortieth verse. In the name of the Father and of the Son and of the Holy Ghost. Amen.",
          e: "<strong>Father Arnall's — and from here it will not give the book back for twelve thousand words.</strong> The section ends by handing the microphone over. What follows is the longest sustained borrowing of another voice in the novel.",
          n: "This is the structural joke of Chapter III: a book about a boy learning to speak spends its central third silent, occupied by someone else's rhetoric."
        },
      ],
    },
    {
      id: "III.2", chapter: "III", title: "III.2 · The sermons",
      sub: "Death, judgement, hell — and the vision in the room",
      segments: [
        {
          w: "Stephen sat in the front bench of the chapel. Father Arnall sat at a table to the left of the altar. He wore about his shoulders a heavy cloak; his pale face was drawn and his voice broken with rheum.",
          e: "<strong>Plain, observational — the last plain sentences for a long while.</strong> The narration takes one careful look at the man before surrendering the page to him.",
          n: "The longest movement in the book: 12,052 words, 24 full type-token windows. It is also where the novel's religious lexicon reaches 260.5 hits per 10,000 words — six times its rate in Chapter V."
        },
        {
          w: "…strait and dark and foulsmelling prison, an abode of demons and lost souls, filled with fire and smoke. The straitness of this prison house is expressly designed by God to punish those who refused to be bound by His laws.",
          e: "<strong>The preacher's, wholesale and undisclaimed.</strong> No quotation frame, no ironic marker, no narrator standing beside it. The reader is put in the pew and made to take the rhetoric at full strength — which is the only way the chapter's effect on Stephen becomes intelligible.",
          n: "The <em>fire</em> lexicon runs 65.1 per 10,000 words in Chapter III against 12–17 everywhere else. The sermon is not a metaphor in this book; it is a measurable weather system."
        },
        {
          w: "…Must, must. Or how could he explain without dying of shame? Or how could he have done such things without shame? A madman! Confess! O he would indeed to be free and sinless again! Perhaps the priest would know. O dear God!",
          e: "<strong>Stephen's — but built entirely out of the preacher's parts.</strong> The syntax has shattered into imperatives and exclamations. He has his voice back and it is speaking someone else's sentences.",
          n: "Mean sentence length across this movement is 21.1 words; across the confession that follows it, 11.0. The collapse is the plot."
        },
      ],
    },
    {
      id: "III.3", chapter: "III", title: "III.3 · The confession",
      sub: "The chapel in Church Street, and the ciborium",
      segments: [
        {
          w: "He walked on and on through ill-lit streets, fearing to stand still for a moment lest it might seem that he held back from what awaited him, fearing to arrive at that towards which he still turned with longing.",
          e: "<strong>Penitential, balanced, self-cancelling.</strong> Two parallel participles pulling in opposite directions — the sentence performs the approach-avoidance it describes. This is the most <em>controlled</em> prose Stephen has yet been given.",
          n: "And the second-shortest sentences in the book: 11.0 words on average, against 21.1 in the sermon immediately before. Contrition arrives as a change of syntax."
        },
        {
          w: "…purified body.<br>—<em>In vitam eternam. Amen.</em><br>Another life! A life of grace and virtue and happiness! It was true. It was not a dream from which he would wake. The past was past.<br>—<em>Corpus Domini nostri</em>.<br>The ciborium had come to him.",
          e: "<strong>The liturgy's, then five words of nobody's.</strong> The chapter's exaltation is spliced out of Latin formulae and short English acclamations — and then closes on the flattest sentence in the novel.",
          n: "<em>The ciborium had come to him.</em> Six words, no adjective, no cadence. It is the quietest chapter-ending in the book and the one Chapter IV will spend forty pages undoing."
        },
      ],
    },

    /* ══════════════════ CHAPTER IV ══════════════════ */
    {
      id: "IV.1", chapter: "IV", title: "IV.1 · The devotional life",
      sub: "The week of offices, the rosaries, the ledger of grace",
      segments: [
        {
          w: "Sunday was dedicated to the mystery of the Holy Trinity, Monday to the Holy Ghost, Tuesday to the Guardian Angels, Wednesday to Saint Joseph, Thursday to the Most Blessed Sacrament of the Altar, Friday to the Suffering Jesus, Saturday to the Blessed Virgin Mary.",
          e: "<strong>The devotional manual's, copied out.</strong> Seven clauses of identical shape. There is no observer in this sentence at all — it is a timetable that has replaced a consciousness.",
          n: "By every stylometric measure this is the most advanced prose in the novel: 38.3 words per sentence, 12.4% polysyllables, 9.9 relative pronouns per thousand, and 1.5% direct speech — all book maxima. It is also a parody. See the Style curve: this is where measurement and meaning point in opposite directions."
        },
        {
          w: "…for his sin? But the surest sign that his confession had been good and that he had had sincere sorrow for his sin was, he knew, the amendment of his life.<br>—I have amended my life, have I not? he asked himself.",
          e: "<strong>The manual's — until the question mark.</strong> The long subordinated sentence is pure catechism; the short spoken line that follows is Stephen, and it is a question the catechism cannot answer.",
          n: "The whole movement's rhetoric is undone by seven syllables. Genette would call the tag <em>—he asked himself</em> a shift of narrative level; the book uses it as a crowbar."
        },
      ],
    },
    {
      id: "IV.2", chapter: "IV", title: "IV.2 · The director",
      sub: "The offer of a vocation, and the refusal that is never spoken",
      segments: [
        {
          w: "The director stood in the embrasure of the window, his back to the light, leaning an elbow on the brown crossblind, and, as he spoke and smiled, slowly dangling and looping the cord of the other blind…",
          e: "<strong>Watchful, exact, faintly sinister.</strong> The narration has come back — and it comes back as <em>observation</em>. A man's face is in shadow and his hands are making a noose out of a blind-cord, and neither fact is commented on.",
          n: "The skill Stephen acquires in this chapter is not eloquence but noticing. From here to the end of the book the prose will keep choosing the physical detail over the ecclesiastical abstraction."
        },
        {
          w: "…that Newman had heard this note also in the broken lines of Virgil, “giving utterance, like the voice of Nature herself, to that pain and weariness yet hope of better things which has been the experience of her children in every time.”",
          e: "<strong>Newman's, at one remove.</strong> The Church's finest English prose, quoted inside quotation marks at last — the borrowing has become visible, which means Stephen is no longer inside it.",
          n: "Contrast III.2, where the preacher's rhetoric ran without quotation marks. When Joyce starts putting an idiom in quotes, the character has stopped believing it."
        },
      ],
    },
    {
      id: "IV.3", chapter: "IV", title: "IV.3 · The strand",
      sub: "The university, the Greek name called out, and the girl in midstream",
      segments: [
        {
          w: "He could wait no longer. From the door of Byron's public-house to the gate of Clontarf Chapel, from the gate of Clontarf Chapel to the door of Byron's public-house and then back again to the chapel and then back again to the public-house he had paced…",
          e: "<strong>Pacing, rendered as syntax.</strong> The clause walks the same route the boy does, twice each way, with no variation permitted. Meaning is carried by repetition rather than by any word in the sentence.",
          n: "Pub and chapel, chapel and pub. The sentence is a diagram of the two institutions between which the chapter's decision is being made — and he is refusing both by walking."
        },
        {
          w: "A girl stood before him in midstream, alone and still, gazing out to sea. She seemed like one whom magic had changed into the likeness of a strange and beautiful seabird. Her long slender bare legs were delicate as a crane's and pure save where an emerald trail of seaweed had fashioned itself as a sign upon the flesh.",
          e: "<strong>Stephen's, at its highest pitch — and quotable against him.</strong> The girl is converted into a bird in the second sentence and never gets to be a person. The prose is beautiful and it is also an act of appropriation, and the novel lets both stand.",
          n: "The image the whole first four chapters have been assembling — bird, water, girl, flight — arrives all at once. The Leitmotif index shows water at 50.2 per 10,000 in this chapter, its book maximum, and flight at 36.6, also its maximum."
        },
        {
          w: "…moon cleft the pale waste of skyline, the rim of a silver hoop embedded in grey sand; and the tide was flowing in fast to the land with a low whisper of her waves, islanding a few last figures in distant pools.",
          e: "<strong>The epiphany register, pure.</strong> Coordination rather than subordination — <em>and… and…</em> — nouns doing the work, one invented verb (<em>islanding</em>). Nobody in the book speaks like this. It is the closest the novel comes to a voice of its own.",
          n: "This movement carries the highest coordination rate in the book (56.8 <em>and</em>s per thousand) and one of the lowest subordination rates (2.8). Joyce's ecstasies are paratactic: they chant. The parataxis test on the Style curve page measures precisely this."
        },
      ],
    },

    /* ══════════════════ CHAPTER V ══════════════════ */
    {
      id: "V.1", chapter: "V", title: "V.1 · The university day",
      sub: "Watery tea, the dean of studies, Davin, MacCann, Lynch and the theory of beauty",
      segments: [
        {
          w: "He drained his third cup of watery tea to the dregs and set to chewing the crusts of fried bread that were scattered near him, staring into the dark pool of the jar. The yellow dripping had been scooped out like a boghole and the pool under it…",
          e: "<strong>The deflation, immediately.</strong> The previous chapter ended on a tide and a silver hoop; this one opens on tea-dregs and dripping scooped like a bog. Same water, no transfiguration.",
          n: "The clearest instance of Kenner's ladder in the whole book — and the joins are quotable side by side because both spans were extracted mechanically for the Style curve."
        },
        {
          w: "—The language in which we are speaking is his before it is mine. How different are the words <em>home, Christ, ale, master,</em> on his lips and on mine! I cannot speak or write these words without unrest of spirit. His language, so familiar and so foreign, will always be for me an acquired speech.",
          e: "<strong>Stephen's — and it is the thesis of this whole column.</strong> He has worked out for himself what the novel has been doing to him since page one: the words in his mouth belong to somebody else. The Uncle Charles Principle, discovered from the inside.",
          n: "It follows the <em>tundish</em> exchange with the English dean — Stephen's word turns out to be the older and better English, and the dean has never heard it. The humiliation is real and the etymology is on Stephen's side."
        },
        {
          w: "—When the soul of a man is born in this country there are nets flung at it to hold it back from flight. You talk to me of nationality, language, religion. I shall try to fly by those nets.",
          e: "<strong>Stephen's, in his prepared manner.</strong> Note the rhetorical staging — a sentence he has clearly composed before Davin arrived. The novel gives him his best line and immediately has Davin reply <em>too deep for me, Stevie</em>.",
          n: "Three nets, and the Character web is organised by them: family, church, nation. The Desire diagram treats them as the Opponent — not people, but discourses."
        },
        {
          w: "…he had judged her harshly? If her life were a simple rosary of hours, her life simple and strange as a bird's life, gay in the morning, restless all day, tired at sundown? Her heart simple and wilful as a bird's heart?",
          e: "<strong>Stephen's, interrogative and unsure.</strong> Three questions in a row, all about whether he has got another person wrong. The imagery is the same bird-imagery he used to transfigure the girl on the strand — used here, for once, to wonder rather than to convert.",
          n: "The chapter that contains the aesthetic theory ends by doubting the aesthete. Joyce closes Stephen's longest movement on a question mark."
        },
      ],
    },
    {
      id: "V.2", chapter: "V", title: "V.2 · The villanelle",
      sub: "Waking at dawn, and the poem to the temptress",
      segments: [
        {
          w: "Towards dawn he awoke. O what sweet music! His soul was all dewy wet. Over his limbs in sleep pale cool waves of light had passed. He lay still, as if his soul lay amid cool waters, conscious of faint sweet music.",
          e: "<strong>Stephen's, at its most self-intoxicated.</strong> <em>O what sweet music!</em> is the diction of a nineties poet, and the paragraph will not stop repeating its own adjectives — <em>cool</em>, <em>sweet</em>, <em>waves</em>, and <em>waters</em> all twice inside four sentences.",
          n: "The single place in the novel where Joyce prints Stephen's actual art and lets the reader judge it. Nothing in the narration tells you whether the villanelle is any good — which is itself the judgement."
        },
        {
          w: "While sacrificing hands upraise<br>The chalice flowing to the brim.<br>Tell no more of enchanted days.<br><br>And still you hold our longing gaze<br>With languorous look and lavish limb!<br>Are you not weary of ardent ways?<br>Tell no more of enchanted days.",
          e: "<strong>Stephen's own composition, quoted whole.</strong> A villanelle: nineteen lines, two refrains, and every image in it borrowed from the liturgy he has renounced — chalice, sacrifice, seraphim. The apostasy is written in the vocabulary of the faith.",
          n: "The religious lexicon has not left the book in Chapter V; it has been repurposed. The transfer ratio — religious words to aesthetic words — is 21.5 in Chapter III and 0.87 in Chapter V, the only chapter where art outweighs God."
        },
      ],
    },
    {
      id: "V.3", chapter: "V", title: "V.3 · The birds and Cranly",
      sub: "Augury on the library steps, the row with Cranly, non serviam",
      segments: [
        {
          w: "What birds were they? He stood on the steps of the library to look at them, leaning wearily on his ashplant. They flew round and round the jutting shoulder of a house in Molesworth Street. The air of the late March evening made clear their flight…",
          e: "<strong>The augur's, borrowed from Rome.</strong> He is standing on steps counting birds for a sign, which is a Roman priest's job. Having refused one priesthood he has quietly taken up an older one.",
          n: "The <em>flight</em> lexicon is at 25.4 per 10,000 in this chapter — second only to Chapter IV. Daedalus arrives late and never quite lands."
        },
        {
          w: "—I will not serve that in which I no longer believe, whether it call itself my home, my fatherland, or my church: and I will try to express myself in some mode of life or art as freely as I can…",
          e: "<strong>Lucifer's, adapted.</strong> <em>Non serviam</em> — the exact phrase the preacher used in III.2 for the sin of the fallen angels. Stephen's declaration of freedom is a quotation from the sermon that terrified him.",
          n: "The nets named again, in the same order, in the same rhetorical shape: home, fatherland, church. He has one speech and he keeps rewriting it."
        },
        {
          w: "…wished to be? Stephen watched his face for some moments in silence. A cold sadness was there. He had spoken of himself, of his own loneliness which he feared.<br>—Of whom are you speaking? Stephen asked at length.<br>Cranly did not answer.",
          e: "<strong>Nobody's, and that is the point.</strong> The prose ends this movement by recording a silence. After a chapter of theory and rhetoric the book's last long scene finishes with a friend refusing to speak.",
          n: "36% of this movement is direct speech — the most conversational stretch in the novel. Which makes its final unanswered question land harder."
        },
      ],
    },
    {
      id: "V.4", chapter: "V", title: "V.4 · The diary",
      sub: "March to April — first person, at last",
      segments: [
        {
          w: "<em>March</em> 20. Long talk with Cranly on the subject of my revolt. He had his grand manner on. I supple and suave. Attacked me on the score of love for one's mother. Tried to imagine his mother: cannot.",
          e: "<strong>Stephen's, unmediated — and it has almost no syntax left.</strong> Verbs without subjects, sentences without verbs. The book arrives at the first person by giving up the sentence.",
          n: "7.75 words per sentence — the shortest prose in the novel, shorter than the infant overture's 10.85. The Künstlerroman's style curve does not end at its peak; it ends below its own starting point."
        },
        {
          w: "…encounter for the millionth time the reality of experience and to forge in the smithy of my soul the uncreated conscience of my race.<br><br><em>April</em> 27. Old father, old artificer, stand me now and ever in good stead.",
          e: "<strong>Two voices in four lines.</strong> The famous sentence is Stephen at full rhetorical height — <em>the millionth time</em>, <em>the smithy of my soul</em> — and the last entry immediately drops to a prayer, addressed to a pagan craftsman in the cadence of a Catholic one.",
          n: "<em>Old father, old artificer</em>: Daedalus, invoked in the rhythm of the liturgy Stephen has renounced, on the last line of a book that began with his father telling him a story. The novel closes by borrowing one more voice."
        },
      ],
    },
  ],
};
