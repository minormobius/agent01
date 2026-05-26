/* Pendragon — a historiography of the Arthurian legend.
   All content in one structured object so the renderers stay dumb.
   Link hosts are deliberately stable landing/search pages (Wikipedia,
   Wikisource, Project Gutenberg & Internet Archive search, the Camelot
   Project, IMSLP) rather than fragile deep-links. */

const PENDRAGON = {

  meta: {
    title: "Pendragon",
    tagline: "A historiography of the Arthurian legend — where it came from, what shapes it took, and how the memes mutated across fifteen centuries.",
    updated: "2026",
  },

  /* Stable link builders. Every external link goes through one of these so
     it resolves even if a specific edition ID would not. */
  link: {
    wp:  (t, l) => ({ host: "Wikipedia",        url: "https://en.wikipedia.org/wiki/" + t, label: l }),
    ws:  (t, l) => ({ host: "Wikisource",       url: "https://en.wikisource.org/wiki/" + t, label: l }),
    gb:  (q, l) => ({ host: "Gutenberg",         url: "https://www.gutenberg.org/ebooks/search/?query=" + encodeURIComponent(q), label: l }),
    ia:  (q, l) => ({ host: "Internet Archive",  url: "https://archive.org/search?query=" + encodeURIComponent(q), label: l }),
    cp:  (l)    => ({ host: "Camelot Project",   url: "https://d.lib.rochester.edu/camelot", label: l || "Camelot Project" }),
    teams:(l)   => ({ host: "TEAMS",             url: "https://d.lib.rochester.edu/teams", label: l || "TEAMS Middle English Texts" }),
    com: (q, l) => ({ host: "Wikimedia Commons", url: "https://commons.wikimedia.org/w/index.php?search=" + encodeURIComponent(q), label: l }),
    imslp:(q,l) => ({ host: "IMSLP",             url: "https://imslp.org/index.php?title=Special:Search&search=" + encodeURIComponent(q), label: l }),
  },

  /* ── TIMELINE ─────────────────────────────────────────────────────────
     kind drives the colour dot: source | pseudohistory | romance | english
     | modern | art | music | scholarship | screen | event                */
  timeline: [
    { year: 540,  span: "c. 540",        kind: "source", strand: "Insular",
      title: "Gildas — De Excidio Britanniae",
      body: "The earliest near-contemporary witness to the period — and it never names Arthur. Gildas laments the Saxon wars, names the siege of <em>Mons Badonicus</em> and the Romano-British leader Ambrosius Aurelianus. Arthur's <strong>absence</strong> here is the central problem of the historical-Arthur debate.",
      links: ["wp:Gildas|Gildas", "wp:De_Excidio_et_Conquestu_Britanniae|De Excidio", "ia:Gildas De Excidio Britanniae|read"] },

    { year: 600,  span: "c. 600 (MS 13th c.)", kind: "source", strand: "Insular",
      title: "Y Gododdin — the first whisper",
      body: "An Old Welsh elegy attributed to Aneirin. One line praises a warrior who “glutted black ravens on the rampart … <strong>though he was no Arthur</strong>.” If that line is early, Arthur was already a proverbial yardstick of valour. The dating of the line itself is fiercely disputed — it may be a later interpolation.",
      links: ["wp:Y_Gododdin|Y Gododdin", "wp:Aneirin|Aneirin"] },

    { year: 830,  span: "c. 829–830", kind: "source", strand: "Insular",
      title: "Historia Brittonum (“Nennius”) — Arthur the war-leader",
      body: "The first narrative Arthur. He is <em>dux bellorum</em> (“leader of battles”), <strong>not a king</strong>, who wins twelve battles culminating at Badon, where he carries the image of the Virgin on his shoulders. The appended <em>Mirabilia</em> already treat him as folklore — Carn Cabal (his dog's footprint in stone) and the ever-changing tomb of his son Anir.",
      links: ["wp:Historia_Brittonum|Historia Brittonum", "ws:History_of_the_Britons|Wikisource text", "cp:|Camelot Project"] },

    { year: 970,  span: "c. 970 (entries for 516 & 537)", kind: "source", strand: "Insular",
      title: "Annales Cambriae — Badon & Camlann",
      body: "Two terse annal entries. 516: Badon, where “Arthur carried the cross of Christ for three days.” 537: “the strife of <strong>Camlann</strong>, in which Arthur and <strong>Medraut</strong> fell.” The first appearance of Camlann and of Medraut (Mordred) — though the annal does not say they were enemies.",
      links: ["wp:Annales_Cambriae|Annales Cambriae", "wp:Battle_of_Camlann|Camlann"] },

    { year: 1100, span: "c. 1100", kind: "source", strand: "Insular",
      title: "Culhwch and Olwen — the deep Celtic well",
      body: "The earliest substantial Arthurian <em>tale</em>, preserved in the Welsh <em>Mabinogion</em>. Arthur presides over a teeming warband of folklore heroes; the climax is the great hunt for the boar Twrch Trwyth. This is Arthur before the courtly veneer — magical, exuberant, native British myth.",
      links: ["wp:Culhwch_and_Olwen|Culhwch and Olwen", "wp:Mabinogion|Mabinogion", "gb:Mabinogion|Gutenberg"] },

    { year: 1130, span: "c. 1100–1140", kind: "source", strand: "Insular",
      title: "Welsh Triads & the Saints' Lives",
      body: "The <em>Trioedd Ynys Prydein</em> mention Arthur, Gwenhwyfar and Medrawd. Monastic <em>Vitae</em> (the Life of Cadoc; Caradoc of Llancarfan's Life of Gildas, c. 1130) cast Arthur as a regional <strong>king</strong> — sometimes a bully — and tell of Guinevere's abduction and her recovery at Glastonbury.",
      links: ["wp:Trioedd_Ynys_Prydein|Welsh Triads", "wp:Caradoc_of_Llancarfan|Caradoc of Llancarfan"] },

    { year: 1136, span: "c. 1136", kind: "pseudohistory", strand: "Galfridian", pivot: true,
      title: "Geoffrey of Monmouth — Historia Regum Britanniae ★",
      body: "The Big Bang. Geoffrey welds scraps of Welsh tradition to wholesale invention and gives Arthur a complete royal biography: conception at <strong>Tintagel</strong> by Merlin's shape-shifting magic, the sword <em>Caliburn</em>, conquest of half of Europe, the treason of Mordred, the last battle, and his bearing-away to the <strong>Isle of Avalon</strong>. Over 200 manuscripts survive — a medieval bestseller that fixed the legend's spine for everyone after.",
      links: ["wp:Historia_Regum_Britanniae|Historia Regum Britanniae", "wp:Geoffrey_of_Monmouth|Geoffrey of Monmouth", "gb:Geoffrey of Monmouth history kings Britain|Gutenberg", "ia:Geoffrey of Monmouth History Kings Britain|Internet Archive"] },

    { year: 1150, span: "c. 1150", kind: "pseudohistory", strand: "Galfridian", fae: true,
      title: "Geoffrey — Vita Merlini & the first Morgan",
      body: "Geoffrey's verse life of Merlin describes Avalon — the <em>Insula Pomorum</em>, “Isle of Apples” — ruled by <strong>Morgen</strong> and her nine sisters, mistresses of healing and shape-shifting flight. This is the first literary Morgan le Fay: not a villain but a benevolent otherworld healer. The fae are present at the very root.",
      links: ["wp:Vita_Merlini|Vita Merlini", "wp:Morgan_le_Fay|Morgan le Fay"] },

    { year: 1155, span: "1155", kind: "romance", strand: "Galfridian",
      title: "Wace — Roman de Brut & the Round Table",
      body: "Wace renders Geoffrey into elegant Anglo-Norman verse for a courtly audience — and adds the <strong>Round Table</strong>, the seat with no head where no baron could claim precedence. He also hedges Arthur's end with “fairy” talk and the promise of return.",
      links: ["wp:Wace|Wace", "wp:Roman_de_Brut|Roman de Brut", "ia:Arthurian Chronicles Wace Layamon|Mason translation"] },

    { year: 1170, span: "c. 1170s", kind: "romance", strand: "French", fae: true,
      title: "Marie de France — Lais (Lanval, Chevrefoil)",
      body: "Short Breton lays. <em>Lanval</em> gives an Arthurian knight a <strong>fairy mistress</strong> who carries him off to Avalon — the otherworld-bride motif in pure form. <em>Chevrefoil</em> is an early Tristan fragment. Marie shows the Celtic fae current running parallel to the courtly mainstream.",
      links: ["wp:Marie_de_France|Marie de France", "wp:Lanval|Lanval", "gb:Marie de France lais|Gutenberg"] },

    { year: 1180, span: "c. 1170–1191", kind: "romance", strand: "French", pivot: true,
      title: "Chrétien de Troyes — the romance turn ★",
      body: "Five verse romances reinvent the genre and shift the spotlight from the king to the individual questing knight. <em>Le Chevalier de la Charrette</em> introduces <strong>Lancelot</strong> and his adulterous love for Guinevere; <em>Le Conte du Graal</em> introduces the <strong>Grail</strong> (a mysterious serving-dish, not yet Christian) and Perceval. Courtly love, interior conflict, the unfinished quest — all begin here.",
      links: ["wp:Chrétien_de_Troyes|Chrétien de Troyes", "wp:Perceval,_the_Story_of_the_Grail|Conte du Graal", "gb:Chretien de Troyes Arthurian romances|Gutenberg", "cp:Camelot Project"] },

    { year: 1195, span: "c. 1190–1200", kind: "romance", strand: "French", fae: true,
      title: "Robert de Boron — the Grail made holy",
      body: "Robert's trilogy (<em>Joseph d'Arimathie</em>, <em>Merlin</em>, <em>Perceval</em>) <strong>Christianizes the Grail</strong> — now the vessel of the Last Supper that caught Christ's blood, brought to Britain by Joseph of Arimathea. He also gives us the <strong>Sword in the Stone</strong> as proof of royal election. Sacred history fuses with romance.",
      links: ["wp:Robert_de_Boron|Robert de Boron", "wp:Holy_Grail|Holy Grail"] },

    { year: 1195, span: "c. 1185–1210", kind: "romance", strand: "German",
      title: "Hartmann von Aue — Erec, Iwein",
      body: "Hartmann adapts Chrétien into Middle High German, opening the great German branch of the tradition that will eventually feed Wagner.",
      links: ["wp:Hartmann_von_Aue|Hartmann von Aue"] },

    { year: 1205, span: "c. 1200–1210", kind: "romance", strand: "German",
      title: "Wolfram von Eschenbach — Parzival",
      body: "The towering German Grail romance, expanding Chrétien's Perceval. Wolfram's Grail is a <strong>stone</strong> (<em>lapsit exillis</em>) tended by a Templar-like order — a strikingly different Grail that Wagner would later mine for <em>Parsifal</em>.",
      links: ["wp:Wolfram_von_Eschenbach|Wolfram von Eschenbach", "wp:Parzival|Parzival", "gb:Parzival Wolfram|Gutenberg"] },

    { year: 1210, span: "c. 1210", kind: "romance", strand: "German",
      title: "Gottfried von Strassburg — Tristan",
      body: "The supreme medieval treatment of Tristan and Isolde, after Thomas of Britain. Its ecstatic, fatalistic love-philosophy is the direct seed of Wagner's <em>Tristan und Isolde</em>.",
      links: ["wp:Gottfried_von_Strassburg|Gottfried von Strassburg", "wp:Tristan_(Gottfried_von_Strassburg)|Tristan"] },

    { year: 1200, span: "c. 1200", kind: "english", strand: "English",
      title: "Layamon — Brut (the first English Arthur)",
      body: "A Worcestershire priest turns Wace into sprawling Middle English alliterative verse — the first Arthur in English. Layamon adds folk-magic: <strong>elves</strong> attend Arthur's birth and bless him, and elvish smiths forge his armour.",
      links: ["wp:Layamon's_Brut|Layamon's Brut", "wp:Layamon|Layamon"] },

    { year: 1220, span: "c. 1210–1235", kind: "romance", strand: "French", pivot: true,
      title: "The Lancelot-Grail (Vulgate Cycle) ★",
      body: "The vast French prose synthesis in five branches — <em>Estoire del Saint Graal</em>, <em>Estoire de Merlin</em>, the prose <em>Lancelot</em>, the <em>Queste del Saint Graal</em>, and the <em>Mort Artu</em>. It introduces <strong>Galahad</strong>, the spotless knight who alone achieves the Grail in a Cistercian key, and braids every storyline together with the technique of <em>interlace</em>. This is the reservoir Malory will draw from.",
      links: ["wp:Lancelot-Grail|Lancelot-Grail (Vulgate)", "wp:Galahad|Galahad", "wp:Quest_for_the_Holy_Grail|Queste del Saint Graal"] },

    { year: 1235, span: "c. 1230–1240", kind: "romance", strand: "French",
      title: "Post-Vulgate Cycle & Prose Tristan",
      body: "A darker, tighter reworking of the Vulgate, and the immense <em>Prose Tristan</em>, which folds Tristan into the Round Table as a full Arthurian knight. Both are major Malory sources.",
      links: ["wp:Post-Vulgate_Cycle|Post-Vulgate Cycle", "wp:Prose_Tristan|Prose Tristan"] },

    { year: 1350, span: "c. 1350", kind: "english", strand: "English",
      title: "Stanzaic Morte Arthur",
      body: "A Middle English verse account of the affair and the fall, close to the Vulgate <em>Mort Artu</em>. Malory leaned on it directly for his last books.",
      links: ["wp:Le_Morte_Arthur_(stanzaic)|Stanzaic Morte Arthur", "teams:TEAMS edition"] },

    { year: 1390, span: "c. 1375–1400", kind: "english", strand: "English", fae: true,
      title: "Sir Gawain and the Green Knight",
      body: "The alliterative masterpiece of the “Gawain Poet.” An otherworldly green challenger tests Gawain's honour in a beheading game — and the whole enchantment is revealed at the end to have been engineered by <strong>Morgan le Fay</strong>. Native English alliterative verse at its peak, saturated with the fae.",
      links: ["wp:Sir_Gawain_and_the_Green_Knight|Sir Gawain and the Green Knight", "gb:Sir Gawain Green Knight|Gutenberg", "teams:TEAMS edition"] },

    { year: 1400, span: "c. 1400", kind: "english", strand: "English",
      title: "Alliterative Morte Arthure",
      body: "A heroic, war-epic Arthur — the Roman campaign and Mordred's treason in muscular alliterative lines. The other great Middle English source feeding Malory's “Tale of Arthur and Lucius.”",
      links: ["wp:Alliterative_Morte_Arthure|Alliterative Morte Arthure", "teams:TEAMS edition"] },

    { year: 1470, span: "1469–70 (printed 1485)", kind: "english", strand: "English", pivot: true,
      title: "Sir Thomas Malory — Le Morte d'Arthur ★",
      body: "Written in prison, Malory melts the French prose cycles and the English verse romances into one continuous English narrative — the <strong>canonical</strong> version for the entire English-speaking world. William Caxton printed and chaptered it in <strong>1485</strong>. The earlier Winchester Manuscript, closer to Malory's own text, was only rediscovered in <strong>1934</strong>.",
      links: ["wp:Le_Morte_d'Arthur|Le Morte d'Arthur", "ws:Le_Morte_d'Arthur|Wikisource text", "gb:Le Morte d'Arthur Malory|Gutenberg", "ia:Le Morte Darthur Malory|Internet Archive"] },

    { year: 1590, span: "1590–96", kind: "modern", strand: "Modern", fae: true,
      title: "Spenser — The Faerie Queene",
      body: "Prince Arthur quests through a fairyland in Spenser's vast Protestant allegory, his “Faery Queene” a figure for Elizabeth I. The Tudors had claimed British/Arthurian descent (Henry VII named his heir <strong>Arthur</strong>) — myth as dynastic propaganda. After Spenser the legend goes largely dormant for two centuries.",
      links: ["wp:The_Faerie_Queene|The Faerie Queene", "wp:Edmund_Spenser|Edmund Spenser", "gb:Faerie Queene Spenser|Gutenberg"] },

    { year: 1634, span: "1634", kind: "event", strand: "Modern",
      title: "The long silence",
      body: "Stansby's 1634 print is the last edition of Malory for nearly 200 years. To the Enlightenment, Arthur is a childish “monkish fable.” The legend survives only in chapbooks and antiquarian curiosity until the Romantics revive it.",
      links: ["wp:Arthurian_literature|Arthurian literature"] },

    { year: 1817, span: "1816–17", kind: "event", strand: "Modern",
      title: "The Romantic revival",
      body: "Three new editions of Malory appear at once (including Robert Southey's). Walter Scott's medievalism and the new taste for the Gothic reopen the matter of Britain. The stage is set for the Victorians.",
      links: ["wp:Robert_Southey|Robert Southey"] },

    { year: 1842, span: "1832 / 1842", kind: "modern", strand: "Modern", art: true,
      title: "Tennyson — The Lady of Shalott",
      body: "Tennyson's haunting ballad (drawn from an Italian novella rather than Malory) becomes the single most-painted Arthurian subject of the century — the seed of the Pre-Raphaelite Arthurian obsession.",
      links: ["wp:The_Lady_of_Shalott|The Lady of Shalott", "ws:The_Lady_of_Shalott|Wikisource text"] },

    { year: 1865, span: "1859–1885", kind: "modern", strand: "Modern", pivot: true,
      title: "Tennyson — Idylls of the King ★",
      body: "Twelve linked poems retell Malory as a Victorian moral epic: Camelot as an ideal order that rises and rots from within through Lancelot and Guinevere's sin. Wildly popular, it makes Arthur a household possession again and sets the tone — earnest, elegiac, ethical — for a century of retellings.",
      links: ["wp:Idylls_of_the_King|Idylls of the King", "ws:Idylls_of_the_King|Wikisource text", "gb:Idylls of the King Tennyson|Gutenberg"] },

    { year: 1875, span: "1848–1898", kind: "art", strand: "Modern", art: true,
      title: "The Pre-Raphaelites paint Camelot",
      body: "Rossetti, Burne-Jones, William Morris, Arthur Hughes, and later J.W. Waterhouse (<em>The Lady of Shalott</em>, 1888) turn Tennyson and Malory into the defining <strong>visual</strong> language of the legend. Aubrey Beardsley's stark illustrations for the 1893–94 <em>Morte Darthur</em> cap the movement.",
      links: ["wp:Pre-Raphaelite_Brotherhood|Pre-Raphaelites", "wp:The_Lady_of_Shalott_(painting)|Waterhouse's Lady of Shalott", "com:Arthurian legend paintings|browse images"] },

    { year: 1882, span: "1865 / 1882", kind: "music", strand: "German", music: true,
      title: "Wagner — Tristan und Isolde, Parsifal",
      body: "Wagner converts the German medieval branch into music drama: <em>Tristan und Isolde</em> (1865), whose unresolved “Tristan chord” helps break tonality open, and <em>Parsifal</em> (1882), a sacred Grail festival-play after Wolfram. The legend re-enters high art as sound.",
      links: ["wp:Tristan_und_Isolde|Tristan und Isolde", "wp:Parsifal|Parsifal", "imslp:Parsifal Wagner|scores"] },

    { year: 1889, span: "1889", kind: "modern", strand: "Modern",
      title: "Mark Twain — A Connecticut Yankee",
      body: "A 19th-century engineer is thrown back into Malory's world. Twain weaponizes the legend for satire — against feudalism, established religion, and the romantic medievalism Tennyson had made fashionable. The first great <strong>ironic</strong> Arthur.",
      links: ["wp:A_Connecticut_Yankee_in_King_Arthur's_Court|A Connecticut Yankee", "gb:Connecticut Yankee Twain|Gutenberg"] },

    { year: 1920, span: "1920–1922", kind: "scholarship", strand: "Scholarship",
      title: "Weston — From Ritual to Romance",
      body: "Jessie Weston reads the Grail as a survival of a pagan fertility/vegetation ritual. The thesis is now largely rejected, but it electrified the modernists — T.S. Eliot built <em>The Waste Land</em> (1922) on it, fusing the Fisher King and the wasteland into 20th-century myth.",
      links: ["wp:From_Ritual_to_Romance|From Ritual to Romance", "gb:From Ritual to Romance Weston|Gutenberg", "wp:The_Waste_Land|The Waste Land"] },

    { year: 1958, span: "1938–1958", kind: "modern", strand: "Modern", pivot: true,
      title: "T.H. White — The Once and Future King ★",
      body: "Beginning with <em>The Sword in the Stone</em> (1938), White retells Malory as a humane, funny, anti-war meditation on “Might versus Right.” Merlyn lives backwards through time; the Wart is tutored by becoming animals. The dominant modern English-language Arthur — and the direct source for the musical and the Disney film.",
      links: ["wp:The_Once_and_Future_King|The Once and Future King", "wp:T._H._White|T. H. White", "ia:Once and Future King White|Internet Archive"] },

    { year: 1963, span: "1960–1963", kind: "screen", strand: "Modern", screen: true,
      title: "Camelot, Disney, and the Kennedy myth",
      body: "Lerner & Loewe's musical <em>Camelot</em> (1960) and Disney's <em>The Sword in the Stone</em> (1963), both from White, push the legend into mass culture. After JFK's assassination, Jacqueline Kennedy named his presidency “Camelot” — the myth annexed to American political memory.",
      links: ["wp:Camelot_(musical)|Camelot (musical)", "wp:The_Sword_in_the_Stone_(film)|Disney film"] },

    { year: 1975, span: "1975", kind: "screen", strand: "Modern", screen: true,
      title: "Monty Python and the Holy Grail",
      body: "The total comic deflation of the quest — coconut horses, the Black Knight, killer rabbits. It proves the legend is now so deeply shared it can be parodied beat-for-beat and everyone gets the joke.",
      links: ["wp:Monty_Python_and_the_Holy_Grail|Monty Python and the Holy Grail"] },

    { year: 1971, span: "1966–1971", kind: "scholarship", strand: "Scholarship",
      title: "Archaeology — Alcock at South Cadbury",
      body: "Leslie Alcock's excavations at South Cadbury hillfort (long folk-identified as Camelot) reveal a major refortified post-Roman stronghold. His <em>Arthur's Britain</em> (1971) gives the historical question its most serious modern archaeological footing — without ever proving an Arthur.",
      links: ["wp:Cadbury_Castle,_Somerset|South Cadbury", "ia:Arthur's Britain Alcock|Internet Archive"] },

    { year: 1981, span: "1981", kind: "screen", strand: "Modern", screen: true,
      title: "Boorman — Excalibur",
      body: "John Boorman films Malory whole — birth to last battle — in a single mythic, rain-soaked sweep. The most influential screen image of the legend, and a deliberate return to the fae and the land-king bond.",
      links: ["wp:Excalibur_(film)|Excalibur (film)"] },

    { year: 1983, span: "1983", kind: "modern", strand: "Modern", fae: true, pivot: true,
      title: "Marion Zimmer Bradley — The Mists of Avalon ★",
      body: "The legend retold from the women's side — Morgaine, Igraine, Viviane, Gwenhwyfar — as the tragedy of a pagan Goddess-religion eclipsed by patriarchal Christianity. Bradley drags the <strong>fae substratum</strong> back to the centre after centuries of suppression. (Bradley's own later-exposed abuse complicates her legacy; the book's cultural impact remains large.)",
      links: ["wp:The_Mists_of_Avalon|The Mists of Avalon", "wp:Marion_Zimmer_Bradley|Marion Zimmer Bradley", "ia:Mists of Avalon Bradley|Internet Archive"] },

    { year: 1994, span: "1977–2018", kind: "scholarship", strand: "Scholarship", pivot: true,
      title: "The revisionist consensus hardens ★",
      body: "David Dumville (1977), Oliver Padel's “The Nature of Arthur” (1994), and Nicholas Higham (2002, 2018) make the sceptical case dominant in academic history: there is no good evidence for a historical Arthur, and the figure is best understood as <strong>legend and folklore</strong> retro-fitted with history by Geoffrey. Literary scholarship (Lacy's <em>New Arthurian Encyclopedia</em>, 1991) flourishes alongside.",
      links: ["wp:King_Arthur|King Arthur (historicity)", "wp:Historicity_of_King_Arthur|Historicity debate"] },

    { year: 1996, span: "1995–1997", kind: "modern", strand: "Modern",
      title: "Bernard Cornwell — The Warlord Chronicles",
      body: "A gritty, demythologized 5th-century Arthur — warlord, not king — that absorbs the revisionist history while keeping the emotional pull of the legend. The leading edge of the modern “realist” retelling.",
      links: ["wp:The_Warlord_Chronicles|The Warlord Chronicles"] },

    { year: 2010, span: "2004–2021", kind: "screen", strand: "Modern", screen: true,
      title: "The legend keeps mutating on screen",
      body: "Fuqua's <em>King Arthur</em> (2004, Sarmatian-cavalry theory), BBC's <em>Merlin</em> (2008–12), Guy Ritchie's <em>Legend of the Sword</em> (2017), and David Lowery's <em>The Green Knight</em> (2021) show the meme still recombining — historical, romantic, blockbuster, and art-house variants all alive at once.",
      links: ["wp:King_Arthur_(2004_film)|King Arthur (2004)", "wp:Merlin_(2008_TV_series)|Merlin (BBC)", "wp:The_Green_Knight_(film)|The Green Knight"] },
  ],

  /* ── PHYLOGENY ────────────────────────────────────────────────────────
     Nodes placed by strand (column) and year (row). Edges typed:
       descends  = direct textual descent / adaptation (solid)
       influence = looser influence / shared matter (dashed)
       context   = background, not-quite-source (dotted)                   */
  tree: {
    strands: [
      { id: "Insular",     label: "Insular — Welsh & Latin",  color: "#7fb37f" },
      { id: "Galfridian",  label: "Galfridian pseudo-history", color: "#c9a24a" },
      { id: "French",      label: "French romance",            color: "#c97f9a" },
      { id: "German",      label: "German romance",            color: "#9a8fd0" },
      { id: "English",     label: "Middle English",            color: "#6fa8c9" },
      { id: "Modern",      label: "Modern & screen",           color: "#cf7a5a" },
    ],
    nodes: [
      { id: "gildas",     strand: "Insular",    year: 540,  label: "Gildas" },
      { id: "gododdin",   strand: "Insular",    year: 600,  label: "Y Gododdin" },
      { id: "nennius",    strand: "Insular",    year: 830,  label: "Historia Brittonum" },
      { id: "annales",    strand: "Insular",    year: 970,  label: "Annales Cambriae" },
      { id: "culhwch",    strand: "Insular",    year: 1100, label: "Culhwch & Olwen", fae: true },
      { id: "geoffrey",   strand: "Galfridian", year: 1136, label: "Geoffrey of Monmouth", pivot: true },
      { id: "vitamerlini",strand: "Galfridian", year: 1150, label: "Vita Merlini", fae: true },
      { id: "wace",       strand: "Galfridian", year: 1155, label: "Wace — Brut" },
      { id: "layamon",    strand: "English",    year: 1200, label: "Layamon — Brut" },
      { id: "marie",      strand: "French",     year: 1170, label: "Marie de France", fae: true },
      { id: "chretien",   strand: "French",     year: 1185, label: "Chrétien de Troyes", pivot: true },
      { id: "tristanverse",strand: "French",    year: 1175, label: "Tristan (verse)" },
      { id: "boron",      strand: "French",     year: 1195, label: "Robert de Boron", fae: true },
      { id: "hartmann",   strand: "German",     year: 1195, label: "Hartmann von Aue" },
      { id: "wolfram",    strand: "German",     year: 1205, label: "Wolfram — Parzival" },
      { id: "gottfried",  strand: "German",     year: 1210, label: "Gottfried — Tristan" },
      { id: "vulgate",    strand: "French",     year: 1220, label: "Vulgate Cycle", pivot: true },
      { id: "postvulgate",strand: "French",     year: 1235, label: "Post-Vulgate" },
      { id: "prosetristan",strand: "French",    year: 1240, label: "Prose Tristan" },
      { id: "stanzmorte", strand: "English",    year: 1350, label: "Stanzaic Morte" },
      { id: "sggk",       strand: "English",    year: 1390, label: "Gawain & Green Knight", fae: true },
      { id: "allitmorte", strand: "English",    year: 1400, label: "Alliterative Morte" },
      { id: "malory",     strand: "English",    year: 1470, label: "Malory — Morte d'Arthur", pivot: true },
      { id: "spenser",    strand: "Modern",     year: 1590, label: "Spenser — Faerie Queene", fae: true },
      { id: "tennyson",   strand: "Modern",     year: 1860, label: "Tennyson — Idylls", pivot: true },
      { id: "praph",      strand: "Modern",     year: 1875, label: "Pre-Raphaelite art" },
      { id: "wagner",     strand: "German",     year: 1875, label: "Wagner" },
      { id: "twain",      strand: "Modern",     year: 1889, label: "Twain — Yankee" },
      { id: "white",      strand: "Modern",     year: 1958, label: "T.H. White", pivot: true },
      { id: "bradley",    strand: "Modern",     year: 1983, label: "Bradley — Mists", fae: true },
      { id: "screen",     strand: "Modern",     year: 2005, label: "Stage & screen" },
    ],
    edges: [
      ["gildas", "nennius", "context"],
      ["gododdin", "nennius", "context"],
      ["nennius", "annales", "influence"],
      ["nennius", "geoffrey", "descends"],
      ["annales", "geoffrey", "influence"],
      ["culhwch", "geoffrey", "influence"],
      ["culhwch", "chretien", "influence"],
      ["geoffrey", "vitamerlini", "descends"],
      ["geoffrey", "wace", "descends"],
      ["wace", "layamon", "descends"],
      ["geoffrey", "chretien", "influence"],
      ["chretien", "boron", "descends"],
      ["chretien", "hartmann", "descends"],
      ["chretien", "wolfram", "descends"],
      ["chretien", "vulgate", "descends"],
      ["tristanverse", "gottfried", "descends"],
      ["tristanverse", "prosetristan", "descends"],
      ["marie", "vulgate", "influence"],
      ["boron", "vulgate", "descends"],
      ["vulgate", "postvulgate", "descends"],
      ["vulgate", "prosetristan", "influence"],
      ["vulgate", "sggk", "influence"],
      ["chretien", "sggk", "influence"],
      ["vulgate", "malory", "descends"],
      ["postvulgate", "malory", "descends"],
      ["prosetristan", "malory", "descends"],
      ["stanzmorte", "malory", "descends"],
      ["allitmorte", "malory", "descends"],
      ["malory", "spenser", "influence"],
      ["malory", "tennyson", "descends"],
      ["tennyson", "praph", "descends"],
      ["tennyson", "twain", "influence"],
      ["malory", "twain", "descends"],
      ["wolfram", "wagner", "descends"],
      ["gottfried", "wagner", "descends"],
      ["malory", "white", "descends"],
      ["malory", "bradley", "descends"],
      ["vitamerlini", "bradley", "influence"],
      ["vulgate", "bradley", "influence"],
      ["malory", "screen", "descends"],
      ["white", "screen", "influence"],
    ],
  },

  /* ── WIKI ─────────────────────────────────────────────────────────────
     Cross-linked encyclopedia. `see` ids must match other entry ids.      */
  wiki: [
    // — People —
    { id: "arthur", term: "Arthur", cat: "Person",
      body: "The once and future king. In the earliest layer (<em>Historia Brittonum</em>, <em>Annales Cambriae</em>) a battle-leader, perhaps wholly legendary; in Geoffrey a conquering emperor; in the French romances a mostly passive monarch whose court frames others' adventures; in Malory a tragic king betrayed from within. Whether any historical figure stands behind him is unresolved — most historians now think not.",
      links: ["wp:King_Arthur|King Arthur"], see: ["historicity", "geoffrey-p", "malory-p", "camelot", "avalon"] },

    { id: "merlin", term: "Merlin", cat: "Person",
      body: "Prophet, shape-shifter, kingmaker. Geoffrey fused the Welsh prophet <em>Myrddin</em> with the boy-seer Ambrosius of the <em>Historia Brittonum</em> to create Merlin, then gave him a demon father in some traditions. He engineers Arthur's conception, sets up the Sword in the Stone (via Robert de Boron), and is finally entombed by the fae Nimue/Viviane.",
      links: ["wp:Merlin|Merlin"], see: ["geoffrey-p", "boron-t", "ladyofthelake", "swordinstone"] },

    { id: "guinevere", term: "Guinevere (Gwenhwyfar)", cat: "Person",
      body: "Arthur's queen. Already abducted-and-recovered in the Welsh Saints' Lives; given her famous adulterous love for Lancelot by Chrétien; her fall, with Lancelot's, becomes the engine of Camelot's ruin in the Vulgate, Malory and Tennyson.",
      links: ["wp:Guinevere|Guinevere"], see: ["lancelot", "chretien-p", "roundtable"] },

    { id: "lancelot", term: "Lancelot du Lac", cat: "Person",
      body: "The greatest knight — and the flaw at the heart of the order. A French invention: Chrétien introduces him as Guinevere's lover, the Vulgate gives him a full biography (raised by the Lady of the Lake, hence “du Lac”) and makes him the father of Galahad. His adultery dooms the Round Table.",
      links: ["wp:Lancelot|Lancelot"], see: ["guinevere", "galahad", "ladyofthelake", "chretien-p"] },

    { id: "gawain", term: "Gawain (Gwalchmai)", cat: "Person",
      body: "Arthur's nephew and, in the older/English tradition, the model knight — courteous, sun-strong, loyal. The French cycles demote him in favour of Lancelot and Galahad; English texts (<em>Sir Gawain and the Green Knight</em>, the alliterative Morte) keep him central.",
      links: ["wp:Gawain|Gawain"], see: ["sggk-t", "morgan"] },

    { id: "morgan", term: "Morgan le Fay", cat: "Person",
      body: "Arthur's half-sister and the legend's great shape-shifter of meaning. She begins (<em>Vita Merlini</em>, 1150) as a benevolent otherworld <strong>healer</strong> who receives the dying Arthur on Avalon; the prose cycles recast her as a malevolent <strong>enchantress</strong> and Arthur's enemy; Bradley rehabilitates her as a tragic priestess of the Goddess. “le Fay” = <em>la fée</em>, the fairy.",
      links: ["wp:Morgan_le_Fay|Morgan le Fay"], see: ["avalon", "fae-thread", "ladyofthelake", "bradley-t"] },

    { id: "mordred", term: "Mordred (Medraut)", cat: "Person",
      body: "Arthur's betrayer and (in the later tradition) incestuous son. He appears first, neutrally, beside Arthur in the <em>Annales Cambriae</em> at Camlann; Geoffrey makes him the usurper who seizes kingdom and queen; the Vulgate adds the incest that turns the fall into doom foretold.",
      links: ["wp:Mordred|Mordred"], see: ["arthur", "camelot"] },

    { id: "galahad", term: "Galahad", cat: "Person",
      body: "The perfect, sinless knight invented by the Vulgate <em>Queste</em> to achieve the Grail where the flawed Lancelot (his father) cannot. A Cistercian ideal in armour — spiritual purity displacing martial or courtly virtue.",
      links: ["wp:Galahad|Galahad"], see: ["grail", "vulgate-t", "lancelot"] },

    { id: "geoffrey-p", term: "Geoffrey of Monmouth", cat: "Person",
      body: "Cleric (d. 1155) whose <em>Historia Regum Britanniae</em> (c. 1136) invented the Arthur the world remembers. Part historian, part novelist, part propagandist; later medieval writers half-knew he was unreliable and used him anyway.",
      links: ["wp:Geoffrey_of_Monmouth|Geoffrey of Monmouth"], see: ["hrb-t", "merlin", "avalon", "historicity"] },

    { id: "chretien-p", term: "Chrétien de Troyes", cat: "Person",
      body: "Late-12th-century poet at the court of Champagne who created Arthurian <em>romance</em>: courtly love, the questing knight, psychological interiority, and — crucially — both Lancelot and the Grail. Every later romance is downstream of him.",
      links: ["wp:Chrétien_de_Troyes|Chrétien de Troyes"], see: ["grail", "lancelot", "conte-t"] },

    { id: "boron-t", term: "Robert de Boron", cat: "Person",
      body: "Late-12th-century poet whose trilogy (<em>Joseph d'Arimathie</em>, <em>Merlin</em>, <em>Perceval</em>) did two decisive things: it <strong>Christianized the Grail</strong> into the vessel of the Last Supper brought to Britain by Joseph of Arimathea, and it gave us the <strong>Sword in the Stone</strong> as the test of true kingship. Sacred history fused onto romance.",
      links: ["wp:Robert_de_Boron|Robert de Boron"], see: ["grail", "swordinstone", "merlin", "vulgate-t"] },

    { id: "malory-p", term: "Sir Thomas Malory", cat: "Person",
      body: "15th-century knight (and repeat prisoner) who compiled the French and English material into <em>Le Morte d'Arthur</em>, the canonical English version. Identity debated; the strongest candidate is Sir Thomas Malory of Newbold Revel, Warwickshire.",
      links: ["wp:Thomas_Malory|Thomas Malory"], see: ["morte-t", "vulgate-t"] },

    // — Texts —
    { id: "hrb-t", term: "Historia Regum Britanniae", cat: "Text",
      body: "Geoffrey's c. 1136 “history” of the kings of Britain, from Brutus the Trojan to Cadwallader, with Arthur as its climax. The single most consequential Arthurian text: it created the biography that every later treatment assumes.",
      links: ["wp:Historia_Regum_Britanniae|details", "ia:Geoffrey Monmouth History Kings Britain|read"], see: ["geoffrey-p", "brut-t"] },

    { id: "brut-t", term: "The Bruts (Wace & Layamon)", cat: "Text",
      body: "Wace's Anglo-Norman <em>Roman de Brut</em> (1155) translated Geoffrey for courts and added the <strong>Round Table</strong>; Layamon's Middle English <em>Brut</em> (c. 1200) translated Wace and added elf-magic. The bridge from Latin pseudo-history to vernacular story.",
      links: ["wp:Roman_de_Brut|Roman de Brut", "wp:Layamon's_Brut|Layamon's Brut"], see: ["hrb-t", "roundtable"] },

    { id: "conte-t", term: "Perceval, le Conte du Graal", cat: "Text",
      body: "Chrétien's last, unfinished romance (c. 1190) — the <strong>first Grail story</strong>. The Grail here is an enigmatic radiant serving-dish in a mysterious castle, not yet the Holy Chalice. Its incompleteness spawned a century of “Continuations.”",
      links: ["wp:Perceval,_the_Story_of_the_Grail|details"], see: ["chretien-p", "grail", "fisherking"] },

    { id: "vulgate-t", term: "The Lancelot-Grail (Vulgate Cycle)", cat: "Text",
      body: "The vast French prose cycle (c. 1210–35) that systematized everything: Grail history, Merlin, Lancelot's life, the Grail Quest, and the fall. It introduced Galahad and the incest-doom of Mordred, and is Malory's principal quarry.",
      links: ["wp:Lancelot-Grail|details"], see: ["galahad", "grail", "morte-t"] },

    { id: "sggk-t", term: "Sir Gawain and the Green Knight", cat: "Text",
      body: "Anonymous late-14th-century alliterative romance, a jewel of Middle English. A beheading-game and a seduction-test probe Gawain's honour; the whole scheme proves to be Morgan le Fay's. Frequently read alongside the same poet's <em>Pearl</em>.",
      links: ["wp:Sir_Gawain_and_the_Green_Knight|details", "gb:Sir Gawain Green Knight|read"], see: ["gawain", "morgan", "fae-thread"] },

    { id: "morte-t", term: "Le Morte d'Arthur", cat: "Text",
      body: "Malory's 1469–70 compilation, printed by Caxton in 1485 — the canonical English Arthur and the source for Tennyson, Twain, White, Steinbeck and most film. The Winchester Manuscript (found 1934) preserves a version closer to Malory's intention than Caxton's.",
      links: ["wp:Le_Morte_d'Arthur|details", "ws:Le_Morte_d'Arthur|read", "gb:Le Morte d'Arthur|Gutenberg"], see: ["malory-p", "idylls-t", "once-t"] },

    { id: "idylls-t", term: "Idylls of the King", cat: "Text",
      body: "Tennyson's twelve-poem cycle (1859–85) reframes Malory as a Victorian parable of an ideal order corrupted by private sin. The most influential 19th-century retelling and the spark for Pre-Raphaelite painting.",
      links: ["wp:Idylls_of_the_King|details", "ws:Idylls_of_the_King|read"], see: ["morte-t"] },

    { id: "once-t", term: "The Once and Future King", cat: "Text",
      body: "T.H. White's mid-20th-century retelling of Malory (1938–58): tragicomic, pacifist, psychologically modern. The dominant English-language Arthur of the last century and the source of <em>Camelot</em> and Disney's <em>The Sword in the Stone</em>.",
      links: ["wp:The_Once_and_Future_King|details"], see: ["morte-t", "swordinstone"] },

    { id: "bradley-t", term: "The Mists of Avalon", cat: "Text",
      body: "Marion Zimmer Bradley's 1983 retelling from the women's and the pagans' side, centring Morgaine and a Goddess-religion losing ground to Christianity. The fullest modern recovery of the legend's fae substratum.",
      links: ["wp:The_Mists_of_Avalon|details"], see: ["morgan", "avalon", "fae-thread"] },

    { id: "mabinogion-t", term: "The Mabinogion (Culhwch, etc.)", cat: "Text",
      body: "The medieval Welsh prose collection (compiled from older material) that preserves the most archaic Arthur — above all <em>Culhwch and Olwen</em>, plus three romances paralleling Chrétien. Lady Charlotte Guest's 1838–45 translation made it famous in English and fed Tennyson.",
      links: ["wp:Mabinogion|details", "gb:Mabinogion Guest|read"], see: ["culhwch-note", "otherworld"] },

    // — Motifs —
    { id: "grail", term: "The Holy Grail", cat: "Motif",
      body: "From Chrétien's enigmatic dish (c. 1190) to Robert de Boron's chalice of the Last Supper to Wolfram's stone to the Vulgate's Cistercian mystery. The Grail is the legend's great <strong>mutating symbol</strong> — each age refills the vessel with its own longing. Scholars debate a Celtic cauldron-of-plenty origin (Loomis) versus pure Christian-literary invention.",
      links: ["wp:Holy_Grail|Holy Grail"], see: ["galahad", "fisherking", "conte-t", "celtic-debate"] },

    { id: "excalibur", term: "Excalibur (Caliburn)", cat: "Motif",
      body: "Arthur's sword. <em>Caliburn</em> in Geoffrey (forged in Avalon); <em>Excalibur</em> in the French. Note the two distinct stories often conflated: the Sword <strong>in the Stone</strong> (proof of kingship) and the sword given by the <strong>Lady of the Lake</strong> — and returned to her hand as Arthur dies.",
      links: ["wp:Excalibur|Excalibur"], see: ["swordinstone", "ladyofthelake", "avalon"] },

    { id: "roundtable", term: "The Round Table", cat: "Motif",
      body: "Invented by Wace (1155) as the table with no head, so no knight could claim precedence — a literal geometry of equality. Robert de Boron tied it to the Grail table of Joseph of Arimathea; later texts populate it with a fixed roster and the perilous empty <em>Siege Perilous</em>.",
      links: ["wp:Round_Table|Round Table"], see: ["brut-t", "grail"] },

    { id: "swordinstone", term: "The Sword in the Stone", cat: "Motif",
      body: "The test of true kingship — only the rightful king can draw it. A relatively late addition (Robert de Boron, c. 1200), distinct from Excalibur-of-the-Lake though popular culture merges them. White made it the centre of Arthur's boyhood.",
      links: ["wp:Sword_in_the_Stone|Sword in the Stone"], see: ["excalibur", "merlin", "once-t"] },

    { id: "fisherking", term: "The Fisher King & the Wasteland", cat: "Motif",
      body: "The wounded Grail-keeper whose infirmity blights his land, healed only when the Grail knight asks the right question. Weston read it as a fertility-ritual survival; Loomis traced it to Celtic sovereignty myth. Eliot's <em>The Waste Land</em> made it a 20th-century emblem.",
      links: ["wp:Fisher_King|Fisher King"], see: ["grail", "weston-note", "celtic-debate"] },

    { id: "rexquondam", term: "Rex quondam rexque futurus", cat: "Motif",
      body: "“The once and future king.” The promise that Arthur did not die but sleeps in Avalon, to return at Britain's hour of need — the <em>Breton hope</em>. Already hedged by Wace; Malory reports the epitaph; White took it for his title. The myth's built-in resurrection clause.",
      links: ["wp:King_Arthur's_messianic_return|the return"], see: ["avalon", "arthur"] },

    { id: "fae-thread", term: "The fae substratum", cat: "Motif",
      body: "The supernatural-Celtic layer that underlies the whole tradition: Avalon and its healing sisters, Morgan the fairy, the Lady of the Lake, the otherworld Grail, fairy mistresses and otherworld challengers. Suppressed by the Christianizing prose cycles and Victorian moralizing, it keeps resurfacing — most fully in Bradley's <em>Mists of Avalon</em>. <a href=\"#fae\">→ Full essay: The fae angle</a>.",
      links: ["wp:Matter_of_Britain|Matter of Britain"], see: ["avalon", "morgan", "ladyofthelake", "celtic-debate", "otherworld"] },

    // — Places —
    { id: "camelot", term: "Camelot", cat: "Place",
      body: "Arthur's chief court — and, notably, <strong>absent from the earliest tradition</strong>. It first appears in Chrétien, almost in passing. Folklore later attached it to South Cadbury (excavated by Alcock), Winchester, and Caerleon. Camelot as a shining ideal-then-lost is largely a modern (Tennyson, White, Lerner & Loewe) elaboration.",
      links: ["wp:Camelot|Camelot", "wp:Cadbury_Castle,_Somerset|South Cadbury"], see: ["roundtable", "historicity"] },

    { id: "avalon", term: "Avalon", cat: "Place",
      body: "The otherworld isle where Excalibur is forged and the dying Arthur is borne. Geoffrey's <em>Vita Merlini</em> makes it the apple-isle of Morgen and her nine sisters — a Celtic Isle of the Blessed. In 1191 the monks of Glastonbury conveniently “discovered” Arthur's grave, identifying their abbey as Avalon.",
      links: ["wp:Avalon|Avalon", "wp:Glastonbury_Abbey|Glastonbury"], see: ["morgan", "rexquondam", "fae-thread", "otherworld"] },

    { id: "tintagel", term: "Tintagel", cat: "Place",
      body: "The Cornish cliff-castle where, in Geoffrey, Arthur is conceived when Merlin disguises Uther as Igerna's husband. Archaeology shows a genuine high-status post-Roman trading site there — fuelling, without confirming, the legend.",
      links: ["wp:Tintagel_Castle|Tintagel"], see: ["geoffrey-p", "merlin"] },

    { id: "otherworld", term: "The Celtic Otherworld (Annwn)", cat: "Place",
      body: "Annwn, the Welsh otherworld of feasting and plenty. The early poem <em>Preiddeu Annwfn</em> tells of Arthur raiding it for a magic cauldron — an image many scholars see behind the Grail castle and its endlessly-feeding vessel.",
      links: ["wp:Annwn|Annwn", "wp:Preiddeu_Annwfn|Preiddeu Annwfn"], see: ["grail", "celtic-debate", "avalon"] },

    // — Scholarship / notes —
    { id: "historicity", term: "Was there a historical Arthur?", cat: "Scholarship",
      body: "The debate runs from credulous (Geoffrey Ashe's Riothamus theory; Alcock's archaeology) to sceptical (Dumville 1977, Padel 1994, Higham 2002/2018). The sceptical view dominates academic history today: no reliable evidence places an Arthur in the 5th–6th century, and the figure is better explained as legend later dressed as history. The argument turns on Gildas's silence, the late date of the <em>Historia Brittonum</em>, and the folkloric texture of the early material.",
      links: ["wp:Historicity_of_King_Arthur|the debate"], see: ["celtic-debate", "geoffrey-p"] },

    { id: "celtic-debate", term: "The Celtic-origins debate", cat: "Scholarship",
      body: "R.S. Loomis argued that much of romance — Grail, Morgan, the Otherworld, the Fisher King — descends from Celtic (Welsh/Irish) myth, transmitted by Breton conteurs. Later scholars caution that medieval authors were inventive artists, not passive folklore-conduits, and that some “Celtic” parallels are loose. The truth is probably mixed: a Celtic substratum, heavily reworked by literary genius.",
      links: ["wp:Roger_Sherman_Loomis|R.S. Loomis"], see: ["grail", "otherworld", "fae-thread"] },

    { id: "weston-note", term: "Jessie Weston & From Ritual to Romance", cat: "Scholarship",
      body: "Weston's 1920 thesis derived the Grail from a pagan fertility/vegetation ritual. Now largely rejected by specialists, but historically vast in influence — chiefly through T.S. Eliot, who footnoted it in <em>The Waste Land</em>.",
      links: ["wp:From_Ritual_to_Romance|the book", "gb:From Ritual to Romance|read"], see: ["fisherking", "grail"] },

    { id: "culhwch-note", term: "Culhwch and Olwen", cat: "Text",
      body: "The oldest substantial Arthurian tale (c. 1100), in the Mabinogion. Arthur leads a fantastical warband on impossible tasks culminating in the hunt for the boar Twrch Trwyth. Pure native British myth — the bedrock beneath the courtly accretions.",
      links: ["wp:Culhwch_and_Olwen|details"], see: ["mabinogion-t", "otherworld"] },

    { id: "ladyofthelake", term: "The Lady of the Lake", cat: "Person",
      body: "The water-fae (Nimue / Viviane / Niniane) who gives Arthur Excalibur, fosters the orphan Lancelot beneath her lake (“du Lac”), and seals Merlin away forever. One of the legend's purest surviving fairy figures.",
      links: ["wp:Lady_of_the_Lake|Lady of the Lake"], see: ["excalibur", "lancelot", "merlin", "fae-thread"] },
  ],

  /* ── FAE ESSAY ────────────────────────────────────────────────────────  */
  fae: {
    intro: "How important is the fae angle? More than the moralizing Victorian surface suggests. The supernatural-Celtic substratum is arguably the legend's <strong>recessive gene</strong>: load-bearing at the Welsh root, deliberately suppressed by the Christianizing prose cycles and Tennyson's earnest ethics, then re-expressed, full-strength, in the 20th-century neo-pagan revival. The fairy element never leaves — it only goes underground and resurfaces.",
    sections: [
      { h: "Avalon and the apple-isle", wikiSee: "avalon",
        p: "The otherworld is present at the very root. Geoffrey's <em>Vita Merlini</em> (1150) describes Avalon as the <em>Insula Pomorum</em> — the Isle of Apples — a Celtic Isle of the Blessed ruled by Morgen and her nine healing sisters. Apples, healing, an island beyond death: this is myth, not history, and it sits directly under the “historical” Arthur Geoffrey built elsewhere. The promise that Arthur sleeps there and will return (<em>rex quondam rexque futurus</em>) is a fairy-immortality clause grafted onto a war-leader." },
      { h: "Morgan le Fay's long fall and rise", wikiSee: "morgan",
        p: "<em>le Fay</em> is simply <em>la fée</em> — the fairy. Morgan very likely descends from a Celtic divine figure (the Welsh mother-goddess Modron, herself from the Gaulish Matrona). She enters literature in 1150 as a benevolent healer, is demoted across the prose cycles into a malevolent enchantress and Arthur's enemy, lurks behind the enchantment in <em>Sir Gawain and the Green Knight</em>, and is finally rehabilitated by Bradley as a tragic priestess. Her 800-year arc — goddess → healer → villain → heroine — is the single clearest case study in how a meme mutates to fit each era's anxieties." },
      { h: "The Lady of the Lake and the water-fae", wikiSee: "ladyofthelake",
        p: "Excalibur comes from a hand in the water and returns to it; Lancelot is fostered beneath a lake; Merlin is undone by the same fairy. The Lady of the Lake is the legend's most intact surviving fairy — even Malory and Tennyson, who scrub out much of the magic, cannot remove her without breaking the plot. The fae here is structurally <strong>irremovable</strong>." },
      { h: "The Grail as a baptised cauldron", wikiSee: "celtic-debate",
        p: "Loomis argued the Grail castle, its wounded king and its endlessly-feeding vessel descend from the Celtic Otherworld feast and the cauldron of plenty — the cauldron Arthur raids from Annwn in <em>Preiddeu Annwfn</em>. Robert de Boron then baptised the cauldron into the chalice of the Last Supper. If Loomis is even partly right, the most Christian object in the legend is a fairy artefact in disguise. (Specialists since have stressed that medieval authors were inventors, not mere transmitters — so read this as a strong substratum, not a clean pedigree.)" },
      { h: "Fairy mistresses and otherworld challengers", wikiSee: "sggk-t",
        p: "Marie de France's <em>Lanval</em> gives a knight a fairy lover who bears him off to Avalon; the Green Knight is an otherworld being whose game bends the rules of death. These are not decorative — they are the Celtic marvellous breaking into the courtly world, the same energy that powers the Grail quest." },
      { h: "Why it keeps coming back", wikiSee: "bradley-t",
        p: "The Christianizing Vulgate, the Tudor allegory, and Tennyson's moral epic each tried to discipline the fae into doctrine or ethics. Each time it returned: in Spenser's literal fairyland, in Wagner's sacred-pagan music, and — decisively — in Bradley's <em>Mists of Avalon</em>, which inverts the whole tradition to make the losing fairy-religion its heart. The fae is not a detachable ornament on the Arthur legend. It is the oldest layer, and it is still load-bearing." },
    ],
  },

  /* ── BIBLIOGRAPHY ─────────────────────────────────────────────────────  */
  papers: [
    { group: "Primary sources (translations online)", items: [
      { cite: "Geoffrey of Monmouth, <em>The History of the Kings of Britain</em> (c. 1136; Sebastian Evans / Thompson trans.)", note: "The foundational pseudo-history. Free translations on Internet Archive & Gutenberg.", link: "ia:Geoffrey Monmouth History Kings Britain" },
      { cite: "Chrétien de Troyes, <em>Arthurian Romances</em> (W.W. Comfort trans.)", note: "Erec, Cligès, Yvain, Lancelot — the romance turn, in public-domain English.", link: "gb:Chretien de Troyes Arthurian romances" },
      { cite: "<em>The Mabinogion</em> (Lady Charlotte Guest trans., 1838–45)", note: "Includes Culhwch and Olwen — the archaic Welsh Arthur.", link: "gb:Mabinogion Guest" },
      { cite: "Sir Thomas Malory, <em>Le Morte d'Arthur</em> (1485; Caxton text)", note: "The canonical English version. Full text on Wikisource & Gutenberg.", link: "ws:Le_Morte_d'Arthur" },
      { cite: "Wace & Layamon, <em>Arthurian Chronicles</em> (Eugene Mason trans.)", note: "The Round Table's first appearance, in English.", link: "ia:Arthurian Chronicles Wace Layamon" },
      { cite: "Alfred, Lord Tennyson, <em>Idylls of the King</em> (1859–85)", note: "The Victorian retelling.", link: "ws:Idylls_of_the_King" },
      { cite: "<em>The Camelot Project</em> (Robbins Library, Univ. of Rochester)", note: "The single best online gateway: edited texts, images, bibliographies, and the TEAMS Middle English editions of Gawain, the Mortes, etc.", link: "cp:" },
    ]},
    { group: "The historical-Arthur question", items: [
      { cite: "O.J. Padel, “The Nature of Arthur”, <em>Cambrian Medieval Celtic Studies</em> 27 (1994)", note: "The influential folklore-first, sceptical case.", link: "wp:Historicity_of_King_Arthur" },
      { cite: "David Dumville, “Sub-Roman Britain: History and Legend”, <em>History</em> 62 (1977)", note: "The demolition of credulous source-reading; “no historical Arthur” in respectable form.", link: "ia:Dumville Sub-Roman Britain history legend" },
      { cite: "N.J. Higham, <em>King Arthur: Myth-Making and History</em> (2002); <em>King Arthur: The Making of the Legend</em> (2018)", note: "The fullest modern sceptical synthesis.", link: "ia:Higham King Arthur myth-making history" },
      { cite: "Leslie Alcock, <em>Arthur's Britain</em> (1971)", note: "The archaeological high-water mark (South Cadbury), more open to a historical kernel.", link: "ia:Arthur's Britain Alcock" },
      { cite: "T.M. Charles-Edwards, “The Arthur of History”, in <em>The Arthur of the Welsh</em> (1991)", note: "Careful weighing of the Welsh/Latin evidence.", link: "ia:Arthur of the Welsh" },
    ]},
    { group: "Origins, motifs & the fae", items: [
      { cite: "Roger Sherman Loomis, <em>Celtic Myth and Arthurian Romance</em> (1927); <em>The Grail: From Celtic Myth to Christian Symbol</em> (1963)", note: "The classic Celticist argument for the legend's mythic roots.", link: "ia:Loomis Celtic Myth Arthurian Romance" },
      { cite: "Jessie L. Weston, <em>From Ritual to Romance</em> (1920)", note: "The fertility-ritual Grail thesis — superseded, but historically huge (Eliot).", link: "gb:From Ritual to Romance Weston" },
      { cite: "Rachel Bromwich (ed.), <em>Trioedd Ynys Prydein: The Welsh Triads</em>", note: "The standard edition of the Welsh tradition's connective tissue.", link: "ia:Trioedd Ynys Prydein Bromwich" },
      { cite: "Richard Barber, <em>The Holy Grail: Imagination and Belief</em> (2004)", note: "Balanced modern history of the Grail across literature and cult.", link: "ia:Barber Holy Grail imagination belief" },
    ]},
    { group: "Reference & overviews", items: [
      { cite: "Norris J. Lacy (ed.), <em>The New Arthurian Encyclopedia</em> (1991/1996)", note: "The standard reference for everything Arthurian.", link: "ia:New Arthurian Encyclopedia Lacy" },
      { cite: "Archibald & Putter (eds.), <em>The Cambridge Companion to the Arthurian Legend</em> (2009)", note: "Best one-volume scholarly survey of the whole tradition.", link: "ia:Cambridge Companion Arthurian Legend" },
      { cite: "R.S. & L.H. Loomis, <em>Arthurian Legends in Medieval Art</em> (1938)", note: "The legend's visual life before the Pre-Raphaelites.", link: "ia:Arthurian Legends Medieval Art Loomis" },
    ]},
  ],
};
