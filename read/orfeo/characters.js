/* The cast of Sir Orfeo — the second stratum of the annotation layer.
   Each entry carries its role, the movements it appears in (links into
   the reading), and typed relationships (which seed the character web).
   Compared with Culhwch's Welsh roll-call of hundreds, and even with
   Gawain's chamber piece, Orfeo's cast is the tightest yet — a king, a
   queen, a Fairy King and a silent Fairy Queen, a steward, a porter, a
   beggar, two maidens of the court, a few group-figures (the retinue,
   the half-taken, the harpers of Britain), and at the very edge of
   reference, two euhemerised ancestral kings. Attaches to window.ORFEO. */
window.ORFEO = window.ORFEO || {};
window.ORFEO.characters = {
  intro: "The poem's cast is the smallest in our set so far. Three principals — Orfeo, Heurodis, and the Fairy King — and a Fairy Queen who shines on the throne without ever speaking; a steward whose loyalty across ten years is the final test the poem will pose; two maidens, a porter, and a beggar who turn the wheel at three thresholds; and three group entries — the Fairy King's snow-white retinue, the half-taken in the yard, and the harpers of Britain who closed the story by composing the lay. At the very edge of reference stand Pluto and Juno, named as Orfeo's distant ancestors and euhemerised in the opening as ancient kings later mistaken for gods. Each card notes the movements where the figure appears (click to read) and the relationships that bind them — the raw material for a character web.",
  roles: [
    { id: "principal",   label: "Principals",                   color: "#c9a24a" },
    { id: "winchester",  label: "The court at Winchester",      color: "#6fa8c9" },
    { id: "otherworld",  label: "The Otherworld and its court", color: "#b07a4b" },
    { id: "wild",        label: "Threshold figures",            color: "#8aa363" },
    { id: "frame",       label: "Powers in the frame",          color: "#9a8fd0" },
  ],
  cast: [
    // — Principals —
    { id: "orfeo", name: "Sir Orfeo", role: "principal", alt: "Orfeo", epithet: "king of Winchester, harper before all other roles",
      blurb: "King of Winchester (which the poem matter-of-factly identifies with Thrace), descended from Pluto and Juno but no demigod. The poem rebuilds him as <em>harper</em> before all other roles: when he abdicates after Heurodis is taken, he strips down to a pilgrim's cloak and keeps only his harp; through ten years on bark and roots his beard grows to his girdle and his harp hangs in a hollow tree, brought out when the weather is clear; the same harp opens the Fairy King's gate, the steward's eye, and the throne. The classical Orpheus loses his Eurydice at the threshold for not containing himself; Orfeo's whole rescue depends on holding himself in reserve until the right moment. Three laments, three harpings, one conditional reveal at the end.",
      appears: [1, 2, 3, 4, 5, 6],
      rel: [{ to: "heurodis", label: "husband of" }, { to: "fairyking", label: "binds with own word" }, { to: "steward", label: "lord of" }, { to: "fairyretinue", label: "follows" }, { to: "wildbeasts", label: "harps to" }, { to: "porter", label: "talks past" }, { to: "beggar", label: "lodges with" }, { to: "harpers", label: "named in their lay" }, { to: "pluto", label: "descended from" }, { to: "juno", label: "descended from" }, { to: "twomaidens", label: "lord of" }] },

    { id: "heurodis", name: "Lady Heurodis", role: "principal", alt: "Heurodis (Eurydice)", epithet: "the queen taken, the queen recovered",
      blurb: "Eurydice in the Middle English. The fairest lady that ever went on body and bones — the poet's strongest superlative — and the figure on whom the poem turns. She is taken not by snakebite but by a noon-time vision under a grafted-orchard tree (an <em>ympe-tree</em>, fae-frequenting in folk belief), led into the Otherworld where she is held asleep in the posture of her own taking. Recovered without a single backward look and without a single condition. She speaks twice in the whole poem — once to tell Orfeo the vision, once silently with her eyes at the wordless meeting in the wilderness — and her recovery, when it comes, is wordless too: \"his wife he took by the hand, and went swiftly out of that land.\"",
      appears: [1, 2, 3, 4, 5, 6],
      rel: [{ to: "orfeo", label: "wife of" }, { to: "fairyking", label: "taken by" }, { to: "twomaidens", label: "attended by" }, { to: "halftaken", label: "held among" }, { to: "fairyretinue", label: "rides among" }] },

    { id: "fairyking", name: "The Fairy King", role: "principal", alt: "the king o fairy",
      blurb: "The poem's antagonist and, by the end, its honourable counterparty. He appears first to Heurodis as the rider with a hundred knights and a hundred damsels on snow-white steeds, his crown of no silver and no red gold but a single jewel that shone as bright as the sun. His court runs on protocol — \"no one has dared come here unbidden since I began to reign\" — but the same protocol grants the harper passage. He gives Orfeo a clean <em>rash boon</em> (M223), refuses on aesthetic grounds (a sorry couple you would be), and yields the moment Orfeo names the test correctly: <em>it were a far fouler thing to hear a lying out of thy mouth</em>. Bound not by force but by the form of his own promise. The Insular Otherworld king at his most legible.",
      appears: [2, 3, 5],
      rel: [{ to: "fairyqueen", label: "king to" }, { to: "heurodis", label: "captor of" }, { to: "porter", label: "master of" }, { to: "fairyretinue", label: "leads" }, { to: "halftaken", label: "holds" }, { to: "orfeo", label: "bound by own word to" }] },

    { id: "fairyqueen", name: "The Fairy Queen", role: "principal", alt: "her quen fair and swete", epithet: "shining beside him, never speaking",
      blurb: "Beside the Fairy King on the throne in the tabernacle of light — \"her crounes, her clothes, schine so bright that unnethe bihold he hem might.\" She enjoys Orfeo's harping along with the king — <em>the riche quen al so hadde he</em> — and otherwise the poem keeps her silent. A figure of pure radiance and witness, mirroring the radiance and witness of Heurodis at Winchester. Two queens at the start and end of the rescue; one taken, one taken-from in trade.",
      appears: [5],
      rel: [{ to: "fairyking", label: "queen to" }] },

    // — The court at Winchester —
    { id: "steward", name: "The high steward", role: "winchester", epithet: "the man tested, the man rewarded",
      blurb: "Named once at Movement II — \"Ich ordainy min heigh steward / to wite mi kingdom afterward\" — and held over the entire ten years of exile by that one designation. He keeps the kingdom honestly, welcomes Orfeo back unrecognised because \"every good harper is welcome with me, for my lord's love, Sir Orfeo,\" recognises the harp before the man, swoons at the lying tale of Orfeo's death, and is rewarded by being named heir to the throne in the same conditional speech that does the recognition. The steward's loyalty is the structural counterweight to the abduction: Heurodis was held faithfully in the Otherworld, the steward holds the kingdom faithfully in the upper world, and both fidelities meet again at the end.",
      appears: [2, 6],
      rel: [{ to: "orfeo", label: "servant and heir of" }] },

    { id: "twomaidens", name: "The two maidens", role: "winchester", epithet: "Heurodis's companions in the May orchard",
      blurb: "Two maidens of price who accompany Heurodis on the May morning when she walks out to the orchard. They sit with her under the ympe-tree, dare not wake her when she falls asleep, and when she wakes screaming and mad they run to the palace and bring back \"sexti damisels and mo\" with the knights. They are the first to see the abduction-vision register on a body, and the first witnesses the poem trusts.",
      appears: [1],
      rel: [{ to: "heurodis", label: "attendants of" }, { to: "orfeo", label: "subjects of" }] },

    { id: "beggar", name: "The Winchester beggar", role: "winchester", epithet: "host at the town's edge",
      blurb: "On Orfeo's return after ten years, he stops at the town's edge and takes lodging \"with a begger y bilt ful narwe\" — a beggar housed in a narrow place. The beggar tells him the city's version of the past decade: the queen taken, the king in exile, the steward holding the land. He lends Orfeo his clothes the next morning for the disguise that walks into the city, and when the queen is brought back in procession, she is fetched from his hut. The smallest figure with the most door-keeping to do.",
      appears: [6],
      rel: [{ to: "orfeo", label: "host of" }, { to: "heurodis", label: "host of" }] },

    // — The Otherworld and its court —
    { id: "porter", name: "The porter of the Otherworld", role: "otherworld",
      blurb: "Stands ready at the crystal gate of the Fairy King's castle. Asks Orfeo only what he would have done; accepts \"I am a minstrel, look you, to bring your lord solace with my glee\" without further question, and lets him in. Music is the universal passport, and the porter is the figure of that protocol. Wordless after the opening exchange.",
      appears: [4],
      rel: [{ to: "fairyking", label: "servant of" }, { to: "orfeo", label: "admits" }] },

    { id: "fairyretinue", name: "The Fairy King's retinue", role: "otherworld", epithet: "snow-white riders, hunters, dancers, hawking ladies",
      blurb: "A hundred knights and a hundred damsels on snow-white steeds, robes as white as milk, who first appear in Heurodis's vision and re-appear to Orfeo in the wilderness as the three apparitions (the hunt with no kill, the host with no destination, the dance with minstrelsy), and finally as the sixty hawking ladies whose path Orfeo follows through the rock-cleft. They never take anything in this world. They are the Otherworld court visible through the membrane, and the door Orfeo finds by walking parallel to them long enough.",
      appears: [2, 3, 4],
      rel: [{ to: "fairyking", label: "follow" }, { to: "orfeo", label: "guide unwittingly" }, { to: "heurodis", label: "ride with" }] },

    { id: "halftaken", name: "The half-taken", role: "otherworld", epithet: "those held in the posture they were taken in",
      blurb: "<em>Thought dede and nare nought</em> — thought to be dead, and were not. Inside the Fairy King's castle wall, lying full of folk brought thither: some headless, some without arms, some wounded through, some bound and mad, some armed on horseback, some choked at the meal, some drowned, some shrivelled by fire, women in childbed, and a wondrous many besides sleeping just as they had been at noon. Each in this world taken, with faerie come thither. One of the most uncanny crowds in medieval English, and the poem's distinctive contribution to the Otherworld tradition — not the dead, not the damned, but the half-taken at the moment of their trauma, held there.",
      appears: [4],
      rel: [{ to: "fairyking", label: "captives of" }, { to: "heurodis", label: "include" }] },

    // — Threshold figures —
    { id: "wildbeasts", name: "The wild beasts and birds", role: "wild", epithet: "audience to Orfeo's harp in the ten years",
      blurb: "Through ten years in the wilderness, when the weather is clear and bright, Orfeo takes his harp from a hollow tree and plays at his own will — and all the wild beasts of the wood gather around him for joy, and all the birds come and sit on every briar to hear the harping. So much melody is in it. When he stops, no beast will stay. The classical Orpheus's audience preserved exactly, with the limit of the gift named honestly: his power's reach is the song's duration. Set against the Fairy King's after-effect later, the comparison becomes the poem's argument about what music actually does.",
      appears: [3],
      rel: [{ to: "orfeo", label: "audience to" }] },

    // — Powers in the frame —
    { id: "harpers", name: "The harpers of Britain", role: "frame", epithet: "who composed the lay",
      blurb: "Named in the closing colophon. After the marvel was over, harpers in Britain heard how it began, and made of it a lay of good liking, and named it after the king. The form is its own provenance-claim — the Breton-lay convention preserved cleanly. The poem's last act is to fold its hero back into the song forever and to name itself within its own ending.",
      appears: [6],
      rel: [{ to: "orfeo", label: "name their lay for" }] },

    { id: "pluto", name: "Pluto", role: "frame", epithet: "named ancestor, euhemerised",
      blurb: "Named in the second sentence of the poem as Orfeo's father's ancestor — \"His fader was comen of king Pluto\" — and immediately demoted from god to ancient king: he and Juno \"sum time were as godes y hold, for aventours that thai dede and told.\" Were <em>held</em> for gods. The opening's quietest move and one of its most important: classical pagan myth is being read euhemerically, and the king who follows is not a demigod but a high lord in England.",
      appears: [1],
      rel: [{ to: "orfeo", label: "ancestor of" }, { to: "juno", label: "fellow euhemerised king" }] },

    { id: "juno", name: "Juno", role: "frame", epithet: "named ancestor, euhemerised",
      blurb: "Named just after Pluto as Orfeo's mother's ancestor. The same euhemerism applies — once held for a god, now read as an ancient king whose deeds were told and exaggerated. Two classical figures the medieval poet won't mythologise. Orfeo himself, descended from them, is therefore not a hero of myth but a king of romance.",
      appears: [1],
      rel: [{ to: "orfeo", label: "ancestor of" }, { to: "pluto", label: "fellow euhemerised king" }] },
  ],
};
