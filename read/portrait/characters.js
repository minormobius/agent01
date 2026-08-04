/* Layer 3 — the cast.
 *
 * The medieval tales on this site group their cast by rank and household:
 * principals, the court of Annwn, the men of Dyfed. That grouping is wrong for
 * Portrait, because the people in this novel are not primarily related to each
 * other — they are related to Stephen as CLAIMS on him. Joyce gives the
 * organising figure himself, in V.1:
 *
 *   "When the soul of a man is born in this country there are nets flung at it
 *    to hold it back from flight. You talk to me of nationality, language,
 *    religion. I shall try to fly by those nets."
 *
 * So the roles here are the nets: family, church, nation, school, and the women
 * — each a discourse with a claim, each speaking an idiom the novel at some
 * point makes the narration wear. Read alongside the Voice column: a character's
 * real presence in this book is measured by how much of the prose they occupy,
 * not how many scenes they appear in.
 *
 * `appears` indexes the nineteen movements in order (1 = I.1 … 19 = V.4).
 * Attaches to window.PORTRAIT. */
window.PORTRAIT = window.PORTRAIT || {};
window.PORTRAIT.characters = {
  intro: "Portrait has no <em>cast</em> in the folktale sense — no donors, no helpers, no villains, nobody who exists to move a plot. It has <strong>claimants</strong>. Every figure here wants Stephen to be something, and each speaks a distinct idiom that the novel at some point lets take over the narration entirely: uncle Charles's genteel <em>repaired</em>, Father Dolan's <em>schemer</em>, Father Arnall's twelve thousand words of hellfire, the devotional manual's seven-day timetable. The roles below are the three nets Stephen names — <strong>nationality, language, religion</strong> — plus the two the novel adds without naming: the school, and the women he keeps converting into images. Node size in the Character web marks how much of the book's prose a figure actually occupies, which is not at all the same as how often they appear.",
  roles: [
    { id: "self",   label: "The soul in the net",   color: "#d9a441" },
    { id: "family", label: "Family",                color: "#c97f6a" },
    { id: "church", label: "Church",                color: "#7fa3c9" },
    { id: "nation", label: "Nation",                color: "#7fb37f" },
    { id: "school", label: "School — friends and rivals", color: "#a58fd0" },
    { id: "muse",   label: "The women, and their images",  color: "#c97f9a" },
    { id: "figure", label: "The figures in the name", color: "#8f8f8f" },
  ],
  cast: [
    {
      id: "stephen", name: "Stephen Dedalus", role: "self", epithet: "baby tuckoo · Stephanos Dedalos · the artist",
      blurb: "Present in every sentence of the book and in possession of his own voice for almost none of it. The novel's real action is the succession of idioms he is dressed in and grows out of: his father's story, the schoolyard, the romance he has been reading, the sodality, the preacher, the devotional manual, the aesthetician, and finally — in the diary — a first person with almost no syntax left. Named for the first Christian martyr and for the pagan craftsman who built the labyrinth and the wings, which is a joke he does not get until Chapter IV.",
      appears: [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19],
      rel: [
        { to: "simon", label: "son of" }, { to: "may", label: "son of" },
        { to: "dante", label: "taught by" }, { to: "charles", label: "grand-nephew of" },
        { to: "arnall", label: "terrified by" }, { to: "dolan", label: "pandied by" },
        { to: "conmee", label: "appeals to" }, { to: "director", label: "offered a vocation by" },
        { to: "dean", label: "loses a word to" }, { to: "cranly", label: "confesses to" },
        { to: "davin", label: "argues with" }, { to: "lynch", label: "lectures" },
        { to: "heron", label: "beaten by" }, { to: "emma", label: "writes to" },
        { to: "birdgirl", label: "transfigures" }, { to: "daedalus", label: "named for" },
      ],
    },

    /* ── family ─────────────────────────────────────────────────────────── */
    { id: "simon", name: "Simon Dedalus", role: "family", epithet: "the father, the raconteur, the debtor",
      blurb: "Tells the novel's first sentence and spends the rest of the book losing the family's money. His idiom — anecdotal, sentimental, endlessly repeated (<em>said Mr Dedalus for the fourth time</em>) — is the first one the narration learns to count rather than adopt, and that counting is the beginning of the book's irony. In Cork he introduces his son to strangers as evidence of his own past.",
      appears: [1,3,5,6,7,8,9,16],
      rel: [{ to: "may", label: "married to" }, { to: "charles", label: "nephew of" }, { to: "casey", label: "drinks with" }] },
    { id: "may", name: "Mary “May” Dedalus", role: "family", epithet: "the mother",
      blurb: "The nicer smell in the first paragraph; the pleading voice at the Christmas table; the woman who puts his new secondhand clothes in order in the last diary entry and hopes he may learn away from home what the heart is. Her claim is the one Cranly says Stephen cannot answer, and the diary shows he cannot.",
      appears: [1,3,6,9,16,19],
      rel: [{ to: "simon", label: "married to" }, { to: "dante", label: "houses" }] },
    { id: "charles", name: "Uncle Charles", role: "family", epithet: "the old man in the outhouse",
      blurb: "A minor figure who gave his name to a major principle. Kenner's example — <em>uncle Charles repaired to his outhouse</em> — is the moment a reader can first catch Joyce's narrator wearing a character's diction. He walks Stephen to Blackrock, sings in the chapel, and fades out of the book with the family's money.",
      appears: [1,3,5,6],
      rel: [{ to: "simon", label: "great-uncle of" }] },
    { id: "dante", name: "Dante Riordan", role: "family", epithet: "the two brushes — maroon and green",
      blurb: "Governess and household theologian; owns the maroon brush for Michael Davitt and the green for Parnell, and tears the green backing off when the Church condemns him. Supplies the eagles that will pull out Stephen's eyes, and wins the Christmas argument by leaving the room. The first person in the book to make a political claim on him, and she makes it in the language of damnation.",
      appears: [1,2,3],
      rel: [{ to: "casey", label: "quarrels with" }, { to: "may", label: "lodges with" }] },

    /* ── church ─────────────────────────────────────────────────────────── */
    { id: "arnall", name: "Father Arnall", role: "church", epithet: "the preacher of the retreat",
      blurb: "Teaches Stephen Latin at Clongowes and returns at Belvedere to deliver the sermons on death, judgement and hell — twelve thousand words in which the novel hands its narration over to another man's rhetoric without a frame around it. The single largest occupation of the book by a voice not Stephen's.",
      appears: [2,4,10,11],
      rel: [{ to: "conmee", label: "under" }] },
    { id: "dolan", name: "Father Dolan", role: "church", epithet: "the prefect of studies, and the pandybat",
      blurb: "Breaks Stephen's hands for broken glasses and calls him a <em>schemer</em>, a word the boy then carries in his head for pages. Proof that an idiom can be installed by force.",
      appears: [4],
      rel: [{ to: "conmee", label: "overruled by" }] },
    { id: "conmee", name: "Father Conmee", role: "church", epithet: "the rector",
      blurb: "Hears the appeal in his study and grants it, producing Chapter I's triumph. Later reappears as the man who arranges Belvedere — and Stephen learns the rector told the story of the pandying as a joke at dinner.",
      appears: [4,7], rel: [] },
    { id: "director", name: "The director", role: "church", epithet: "the offer at the window",
      blurb: "Stands with his back to the light dangling a blind-cord and offers Stephen the priesthood. Speaks the most syntactically perfect prose in the novel and receives, in reply, a silence and a decision.",
      appears: [14], rel: [] },
    { id: "dean", name: "The dean of studies", role: "church", epithet: "the Englishman, the convert, the lamp",
      blurb: "Lights a fire badly and takes Stephen's word <em>tundish</em> for an Irishism he has never heard — though it is the older and better English. Provokes the passage in which Stephen works out for himself what this whole apparatus is about: <em>the language in which we are speaking is his before it is mine</em>.",
      appears: [16], rel: [] },

    /* ── nation ─────────────────────────────────────────────────────────── */
    { id: "casey", name: "Mr John Casey", role: "nation", epithet: "the Fenian at the table",
      blurb: "Three cramped fingers from making birthday presents for Queen Victoria; spits in a Parnellite heckler's eye and weeps for his dead king. Carries the Christmas dinner's case against the priests, and loses the argument to a woman leaving the room.",
      appears: [3], rel: [{ to: "dante", label: "quarrels with" }, { to: "simon", label: "friend of" }] },
    { id: "davin", name: "Davin", role: "nation", epithet: "the peasant student",
      blurb: "The Gaelic League, hurling, and a plain decency Stephen cannot argue with and will not join. Receives the <em>nets</em> speech and answers <em>too deep for me, Stevie</em>. Tells the story of the woman at the cottage door, which lodges in Stephen as the image of his race — a bat-like soul waking to consciousness in darkness.",
      appears: [16,18], rel: [{ to: "cranly", label: "fellow student" }] },
    { id: "maccann", name: "MacCann", role: "nation", epithet: "the petition for universal peace",
      blurb: "Collects signatures for the Tsar's rescript and cannot get Stephen's. Stands for every claim the novel treats as a net with a good conscience: progress, committee, the general welfare.",
      appears: [16], rel: [{ to: "temple", label: "followed by" }] },

    /* ── school ─────────────────────────────────────────────────────────── */
    { id: "cranly", name: "Cranly", role: "school", epithet: "the confessor, the severed head",
      blurb: "The friend who takes Stephen's confession now that the priests cannot: hears the <em>non serviam</em>, presses him on his mother, and asks whether he has ever loved anyone. Ends the last scene by not answering a question, and ends up in the diary as the man who wanted a disciple rather than a friend.",
      appears: [16,18,19], rel: [{ to: "davin", label: "fellow student" }, { to: "temple", label: "despises" }] },
    { id: "lynch", name: "Lynch", role: "school", epithet: "the ear for the theory",
      blurb: "Walks the length of Dublin being told what beauty is, and punctures it at intervals — <em>my mind has a better opinion of itself than yours</em>. His interruptions are the only thing standing between the aesthetic theory and the reader's unqualified agreement, which is exactly why Joyce put him there.",
      appears: [16], rel: [] },
    { id: "heron", name: "Vincent Heron", role: "school", epithet: "the bird-faced rival",
      blurb: "Bird by name and by face, and the first person in the book to beat Stephen with a cane for admiring Byron. Holds the school's other claim: be a decent fellow, admire the right poets, take the joke.",
      appears: [7], rel: [] },
    { id: "temple", name: "Temple", role: "school", epithet: "the believer in the collective",
      blurb: "Follows the arguments about with an inexhaustible admiration and a bad stammer, and calls Stephen a terrible man. The novel's picture of what discipleship looks like from outside.",
      appears: [16], rel: [{ to: "cranly", label: "hated by" }] },
    { id: "wells", name: "Wells", role: "school", epithet: "the square ditch",
      blurb: "Shoulders Stephen into the cold slimy water for refusing to swap his snuffbox for a hacking chestnut, and asks whether he kisses his mother before he goes to bed — the question that has no right answer, and the first time in the book Stephen learns that a sentence can be a trap.",
      appears: [2,4], rel: [{ to: "fleming", label: "classmate" }] },
    { id: "fleming", name: "Fleming", role: "school", epithet: "the friend in the lower line",
      blurb: "Colours the earth green and the clouds maroon in Stephen's geography book, writes the doggerel on the flyleaf, and is pandied first. The one boy in Chapter I who is simply kind.",
      appears: [2,4], rel: [{ to: "wells", label: "classmate" }] },

    /* ── the women, and their images ────────────────────────────────────── */
    { id: "emma", name: "E—— C—— (Emma)", role: "muse", epithet: "the girl on the tram, the temptress of the villanelle",
      blurb: "Named only by initials and never given a line of her own worth the name. Receives verses in Chapter II, is watched on the library steps in Chapter V, and is turned into <em>the lure of the fallen seraphim</em> in the villanelle. The novel's most sustained act of conversion of a person into an image — and in V.1 Stephen briefly wonders whether he has judged her harshly.",
      appears: [6,7,16,17,19], rel: [] },
    { id: "mercedes", name: "Mercedes", role: "muse", epithet: "the imagined one, out of Dumas",
      blurb: "Not a person at all: the heroine of <em>The Count of Monte Cristo</em>, transplanted to a rose-covered cottage in Blackrock, where Stephen expects to meet her and be <em>transfigured</em>. The first of the book's borrowed aesthetic voices, and the model for every later one.",
      appears: [5], rel: [] },
    { id: "prostitute", name: "The young woman in the pink gown", role: "muse", epithet: "Nighttown",
      blurb: "Bows his head and joins her lips to his; the chapter ends in her arms and the next opens in hell. Given the only kiss in the book that is not imagined, and no name.",
      appears: [9], rel: [] },
    { id: "birdgirl", name: "The girl in midstream", role: "muse", epithet: "the seabird on the strand",
      blurb: "Stands in the tide with her skirts kilted, looks at Stephen, and is converted into a bird before the end of the second sentence. The climax of the novel and its most beautiful prose — and an appropriation the book stages carefully enough that a reader can object to it.",
      appears: [15], rel: [] },

    /* ── the figures inside the name ────────────────────────────────────── */
    { id: "daedalus", name: "Daedalus", role: "figure", epithet: "the old artificer",
      blurb: "The labyrinth-builder and wing-maker inside Stephen's surname, announced by the epigraph from Ovid — <em>et ignotas animum dimittit in artes</em>, he turns his mind to unknown arts — and invoked in the book's last line as a saint would be. His name is called out on the strand by boys in the water and Stephen hears it as a prophecy.",
      appears: [15,18,19], rel: [{ to: "icarus", label: "father of" }] },
    { id: "icarus", name: "Icarus", role: "figure", epithet: "the son who fell",
      blurb: "Never named in the novel, and the reason the Mythograph has a dotted edge in it. Kenner's reading is that Stephen is not the artificer but the boy who flew too near the sun — which is why the last page is a prayer to the father rather than a flight, and why <em>Ulysses</em> opens with Stephen back in Dublin, in mourning, having got no further than Paris.",
      appears: [19], rel: [{ to: "daedalus", label: "son of" }] },
  ],
};
