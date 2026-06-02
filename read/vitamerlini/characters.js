/* The cast of the Vita Merlini — the third stratum of the annotation layer.
   Each entry carries its role, the movements it appears in (links into the
   reading), and typed relationships (which seed the character web and the
   mythograph).

   COMPLETE. Geoffrey's poem holds an unusually wide cast for its length:
   the woodland fellowship at its heart, Rhydderch's court in Cumbria, the
   war of Arfderydd that breaks Merlin, the whole Arthurian chronicle Merlin
   recites from memory, and the Isle of Apples. The web therefore lays out
   as two bridged clusters — Merlin's own world, and the kings of the
   chronicle — joined where Merlin prophesies to Vortigern and where
   Taliesin bears Arthur to Avalon. Attaches to window.VITAMERLINI. */
window.VITAMERLINI = window.VITAMERLINI || {};
window.VITAMERLINI.characters = {
  intro: "The <em>Vita Merlini</em> turns on four figures who, at its close, withdraw together into the woods: <strong>Merlin</strong>, the king-prophet of the Welsh whom grief unmakes into a wild man; his sister <strong>Ganieda</strong> (Welsh Gwenddydd), the queen of Cumbria who buries her husband, renounces the world, and inherits her brother's prophetic gift; the bard-philosopher <strong>Taliesin</strong>, who expounds the making of the world and confesses that he bore the wounded Arthur to Avalon; and <strong>Maeldin</strong>, a knight of Merlin's youth maddened by poison and healed by the same spring. Around them stand the court of <strong>Rhydderch</strong> the Generous — Merlin's abandoned wife <strong>Guendoloena</strong>, the harper who sings him sane, the boy of the threefold death — and the dead of the battle of <strong>Arfderydd</strong> whose loss begins everything. And folded inside the poem is the entire legendary history of Britain, which Merlin recites from his own long memory: <strong>Vortigern</strong> and <strong>Hengist</strong>, <strong>Uther</strong> and <strong>Arthur</strong> and <strong>Mordred</strong>, and, on the far horizon, <strong>Morgen</strong> and the nine sisters of the Isle of Apples. Cards link to the movements where each figure is active; the relationships below seed the character web.",
  roles: [
    { id: "principal",  label: "Principals — the woodland fellowship", color: "#c9a24a" },
    { id: "court",      label: "Rhydderch's court in Cumbria",         color: "#6f9ac9" },
    { id: "arfderydd",  label: "The war of Arfderydd",                 color: "#b0563b" },
    { id: "chronicle",  label: "The kings of the chronicle",           color: "#9a6f9a" },
    { id: "avalon",     label: "The Isle of Apples",                   color: "#c97f9a" },
    { id: "woods",      label: "The wild wood and its fellowship",     color: "#8aa363" },
  ],
  cast: [
    // — Principals —
    { id: "merlin", name: "Merlin", role: "principal", alt: "Merlinus; Myrddin Wyllt", epithet: "king and prophet of the Demetae; the wild man of the Caledonian Wood",
      blurb: "The poem's centre and its riddle. Introduced as a king and prophet of the Demetae (the South Welsh), Merlin is broken by grief at the slaughter of Arfderydd — the death of three brothers in arms — and flees into the Caledonian Wood, where he becomes a <em>silvester homo</em>, a man of the woods. From there the whole poem runs: sung back to his senses by a harp, chained at Rhydderch's court, laughing at the leaf in his sister's hair and at the threefold death, riding a stag to his wife's wedding, prophesying the kings of Britain from an observatory of seventy doors, hearing Taliesin tell of Avalon, and at last healed by a new-broken spring. Geoffrey fuses two figures — the Merlin (Myrddin Emrys) of his own <em>Historia</em> and the northern <strong>Myrddin Wyllt</strong>, the wild prophet of Welsh tradition — into one man who is at once king, madman, seer, and, in the end, hermit. His deepest line comes at the cure: his prophetic gift, he says, was a torment that \"denied the human mind its natural rest\" — and what he most wanted, under the kingdom and the wife, was only his own ordinary mind back.",
      appears: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
      rel: [{ to: "ganieda", label: "brother of" }, { to: "taliesin", label: "friend & fellow-seer of" }, { to: "guendoloena", label: "husband of" }, { to: "rhydderch", label: "brother-in-law of; chained by" }, { to: "wolf", label: "companion of" }, { to: "peredur", label: "fights beside" }, { to: "gwenddoleu", label: "fights against" }, { to: "brothers", label: "mourns" }, { to: "messenger", label: "sung sane by" }, { to: "boy", label: "foretells the death of" }, { to: "bridegroom", label: "kills with the antlers" }, { to: "janitor", label: "laughs at" }, { to: "shoebuyer", label: "laughs at" }, { to: "vortigern", label: "prophesied to" }, { to: "cadwallader", label: "foretells the coming of" }, { to: "maeldin", label: "heals & gathers" }] },

    { id: "ganieda", name: "Ganieda", role: "principal", alt: "Gwenddydd", epithet: "Merlin's sister; queen of Cumbria; heir of his prophetic gift",
      blurb: "Merlin's sister and the poem's central woman — wife of King Rhydderch, and by its end the keeper of her brother's gift. It is she, not the king, who sends searchers into the wild for love of Merlin (movement II). At court she is the schemer of the great middle: caught out by the leaf in her hair, she does not deny the charge but disqualifies the witness, staging the threefold-death trick to make her brother seem a liar (III–IV). When Rhydderch dies she gives the poem its great death-lament, renounces the world \"under the covering of a black cloak,\" and goes to the woods (VIII). There the spirit that is leaving Merlin comes upon her: she delivers the poem's last prophecy, and Merlin gladly blesses the succession. In Welsh tradition <strong>Gwenddydd</strong> is exactly this — the keeper of Myrddin's prophecies, who draws the future from him in the dialogue-poem <em>Cyfoesi Myrddin a Gwenddydd</em>.",
      appears: [2, 3, 4, 8, 15],
      rel: [{ to: "rhydderch", label: "wife of" }, { to: "taliesin", label: "fellow in the woods" }, { to: "messenger", label: "sends to find Merlin" }, { to: "boy", label: "disguises thrice" }] },

    { id: "taliesin", name: "Taliesin", role: "principal", alt: "Telgesinus", epithet: "the bard-philosopher; witness to Arthur's passing",
      blurb: "The great Welsh bard, here cast as a natural philosopher newly returned from study in Brittany. Summoned by Merlin (VII), he delivers the poem's encyclopedic discourses — the making of the world and its orders of spirits (VIII), the seas and fish and islands ending in the Isle of Apples (IX), and the wonders of the world's springs (XIII). His most charged revelation is personal: <em>he</em> was among those who bore the wounded <strong>Arthur</strong> over the sea to Avalon after Camlann, with Barinthus at the helm, and left him in Morgen's care to be healed. At the close he renounces \"the theme of the world\" to join Merlin's woodland fellowship as a third. Where Merlin reads fate in laughs and stars, Taliesin reads it in the ordered cosmos — and insists, all through, that God works through nature, not against it.",
      appears: [8, 9, 10, 11, 12, 13, 14, 15],
      rel: [{ to: "arthur", label: "bore wounded to Avalon" }, { to: "morgen", label: "entrusted Arthur to" }, { to: "barinthus", label: "sailed to Avalon with" }, { to: "maeldin", label: "fellow in the woods" }] },

    // — Rhydderch's court in Cumbria —
    { id: "rhydderch", name: "Rhydderch", role: "court", alt: "Rodarcus; Rhydderch Hael", epithet: "king of the Cumbrians; Ganieda's husband; \"the Generous\"",
      blurb: "King of the Cumbrians (the historical Rhydderch Hael of Strathclyde), husband of Ganieda, and the well-meaning gaoler of the poem's middle. He fights at Arfderydd, then tries to keep the recovered Merlin at court — binding him with a chain, offering a king's ransom of gifts (the cups Wayland carved) that the wild man spurns for \"the Caledonian forest, rich in nuts.\" Twice he ransoms a prophetic secret for Merlin's freedom (III, VI). His death, foretold in the prophecy, is the hinge of the poem's last third: Ganieda comes home to find him dead, and laments him as a peace-loving, open-handed king — <em>Rhydderch Hael</em>, \"the Generous,\" one of the Three Generous Men of the Welsh Triads.",
      appears: [2, 3, 4, 5, 6, 8],
      rel: [] },

    { id: "guendoloena", name: "Guendoloena", role: "court", alt: null, epithet: "Merlin's wife; the bride of the stag-ride",
      blurb: "Merlin's wife — not to be confused with Ganieda his sister. The harper's song that heals Merlin is built on her wasting grief (II), the faithful wife who cannot even mourn because she does not know whether her husband is dead. Refused to his face when he leaves for the woods, she is freed by Merlin to remarry, on the bitter condition that he may come to the wedding (IV). He keeps the promise grotesquely: he rides to her wedding-feast on a stag, driving the deer of the forest before him as a gift — and, seeing the bridegroom laugh at him from a high window, wrenches off the stag's antlers and kills the man (V). She comes out to meet the marvel \"smiling,\" the last unmarred moment before the slaughter.",
      appears: [2, 4, 5],
      rel: [{ to: "bridegroom", label: "weds" }] },

    { id: "messenger", name: "The messenger with the harp", role: "court", alt: null, epithet: "Ganieda's man who sings Merlin sane",
      blurb: "One of Ganieda's retainers, sent to find Merlin in the wild. He climbs to the spring where the madman sits lamenting the seasons, and — hidden behind him — takes up a cithara and sings of the grief of Guendoloena and Ganieda. The harp's sweetness, not its argument, reaches Merlin: moved \"at the name\" of his sister and wife, he recovers his reason and asks to be led to court. The Orphic harper of the poem, doing what no chain or reasoning could.",
      appears: [2],
      rel: [{ to: "ganieda", label: "retainer of" }] },

    { id: "boy", name: "The boy of the threefold death", role: "court", alt: null, epithet: "the child Ganieda disguises thrice",
      blurb: "A boy of Rhydderch's hall, the instrument of Ganieda's counter-trick. Presented to Merlin three times — once as himself, once with cut hair and new clothes, once dressed as a girl — and each time asked how he will die. Merlin answers: by a fall from a rock; in a tree; by drowning. Three deaths for one child seem absurd, and the court laughs the prophet down, burying his charge against the queen. Years later, grown and hunting a stag, the boy falls from a crag, hangs by his foot from a tree, and drowns head-down in the river — all three deaths at once, \"making the seer true through the threefold peril.\" The figure on whom the poem's central irony turns.",
      appears: [4],
      rel: [] },

    { id: "bridegroom", name: "Guendoloena's bridegroom", role: "court", alt: null, epithet: "the second husband, killed by the antlers",
      blurb: "The man Guendoloena marries after Merlin frees her. He watches the stag-riding madman approach from a high window and is \"moved to laughter\" — the third fatal laugh of the poem — an instant before Merlin tears the antlers from his stag and hurls them, crushing his head. The fulfilment of Merlin's grim wedding-condition: the gift-bringer is also the killer of the groom.",
      appears: [5],
      rel: [] },

    { id: "janitor", name: "The beggar at the gate", role: "court", alt: null, epithet: "the doorkeeper on the buried hoard",
      blurb: "A doorkeeper in poor clothing, begging passers-by for the price of a cloak — and the cause of Merlin's first laugh in the market (VI). The prophet sees what the man does not: he is sitting on a hidden heap of coins. \"Turn the earth beneath him: you will find money kept there a long time.\" Hidden wealth beneath apparent poverty — one half of the threefold-laugh's lesson; the king digs and finds the treasure.",
      appears: [6],
      rel: [] },

    { id: "shoebuyer", name: "The man buying shoes", role: "court", alt: null, epithet: "the doomed customer of the second laugh",
      blurb: "A young man in the market buying new shoes and the leather to mend them when they wear — the cause of Merlin's second laugh. The prophet laughs because the man will never wear them out: already, unknown to himself, he is drowned and floating to the bank. Hidden death beneath ordinary provision for the future — the mirror of the beggar's hidden wealth, and the poem's bleakest <em>memento mori</em>. His drowned body is found exactly where Merlin said.",
      appears: [6],
      rel: [] },

    // — The war of Arfderydd —
    { id: "peredur", name: "Peredur", role: "arfderydd", alt: "Peredurus", epithet: "leader of the Venedoti; Merlin's ally at Arfderydd",
      blurb: "Leader of the Venedoti (the men of Gwynedd, the North Welsh) and Merlin's ally in the battle of Arfderydd, fought against Gwenddoleu. After the slaughter he tries, with the nobles, to console the grief-stricken Merlin — and fails: the prophet rolls in the dust, fasts three days, and flees mad to the woods. The historical battle (the Welsh annals' Arfderydd, 573) is the seed of the whole Myrddin legend.",
      appears: [1],
      rel: [{ to: "gwenddoleu", label: "makes war on" }] },

    { id: "gwenddoleu", name: "Gwenddoleu", role: "arfderydd", alt: "Guennolous", epithet: "king of \"Scotland\"; the enemy at Arfderydd",
      blurb: "The northern British king (Latinised <em>Guennolous</em>) who rules \"the realm of Scotland\" and against whom Peredur — with Merlin and Rhydderch — makes war at Arfderydd. In the Welsh tradition it is at Gwenddoleu's fall that his bard Myrddin loses his wits; Geoffrey keeps the kernel of that story while relocating the northern battle into his pan-British frame.",
      appears: [1],
      rel: [] },

    { id: "brothers", name: "The three brothers", role: "arfderydd", alt: null, epithet: "the slain companions whose death maddens Merlin",
      blurb: "Three brothers, kin to the prince, who follow him through his wars and, charging once too fiercely through the enemy ranks at Arfderydd, are cut down together. It is their death — not a spell, not a wound — that unmakes Merlin's reason: he mourns them past all consolation, fasts, and flees to the wood. The poem's whole engine starts here, in grief for three men. (The number sounds the first of the poem's many triads — the threefold death, the three disguises, the three laughs.)",
      appears: [1],
      rel: [{ to: "peredur", label: "follow into battle" }] },

    // — The kings of the chronicle —
    { id: "vortigern", name: "Vortigern", role: "chronicle", alt: "Vortigernus", epithet: "the usurper who hired the Saxons",
      blurb: "The \"consul of the Gewissei\" who seizes the British crown after the murder of Constans and the flight of the boy-princes, and — beset by their kin — makes the fatal choice of hiring Saxon swords (XI). To him, in the <em>Historia</em> and here by allusion, the boy-Merlin once revealed the two dragons fighting beneath his ever-collapsing tower on the \"snowy mountain\" (Snowdon) — the prophecy Merlin claims as his own, knitting the <em>Vita</em>'s wild man to the seer of the earlier book. Burned alive in his tower by the returning Ambrosius and Uther.",
      appears: [7, 11],
      rel: [{ to: "hengist", label: "hires" }, { to: "vortimer", label: "father of" }] },

    { id: "hengist", name: "Hengist", role: "chronicle", alt: "with Horsa", epithet: "the Saxon leader; author of the Long Knives",
      blurb: "With his brother <strong>Horsa</strong>, the leader of the Saxons Vortigern invites in. Having won the king's favour, the brothers turn on the Britons and, at a feast called \"as if to join peace,\" massacre the nobles with hidden blades — the Night of the Long Knives. Horsa falls to Vortimer's counter-attack; Hengist is slain at last by Ambrosius and Uther, \"Christ willing.\" The hinge on which Britain is lost to the Saxon.",
      appears: [11],
      rel: [{ to: "vortimer", label: "enemy of" }, { to: "ambrosius", label: "slain by" }] },

    { id: "vortimer", name: "Vortimer", role: "chronicle", alt: "Vortimerus", epithet: "Vortigern's son; the British counter-attack",
      blurb: "Vortigern's son, who takes up the crown by the people's assent when his father fails, and drives the Saxons back to Thanet, killing Horsa in the rout (XI). His brief, just reign is cut short by poison, administered by Hengist's sister — \"a malign stepmother\" working for her brother. The first of the poem's three British kings felled not in battle but by the venomed cup.",
      appears: [11],
      rel: [{ to: "vortigern", label: "son of" }, { to: "hengist", label: "drives back" }] },

    { id: "ambrosius", name: "Aurelius Ambrosius", role: "chronicle", alt: "Ambrosius", epithet: "the just king; Uther's brother",
      blurb: "One of the boy-princes who flee to Brittany at the poem's chronicle-opening, and who returns grown and battle-proven with his brother Uther to reclaim Britain — burning Vortigern, slaying Hengist, and being raised to the kingship by clergy and people (XI). He rules justly, and is poisoned in turn (in the <em>Historia</em>, by a disguised Saxon). One of the \"three of ours\" Merlin says will resist the Saxons but not finish the work.",
      appears: [10, 11],
      rel: [{ to: "uther", label: "brother of" }, { to: "vortigern", label: "overthrows" }, { to: "hengist", label: "defeats & slays" }] },

    { id: "uther", name: "Uther Pendragon", role: "chronicle", alt: "Uther", epithet: "Ambrosius's brother; father of Arthur",
      blurb: "Ambrosius's younger brother, who succeeds him, beats back the returning Saxons, makes peace, and begets \"a son who proved second to none in worth\" — Arthur. Geoffrey's Merlin names the begetting with a chronicler's plainness; the reader of the <em>Historia</em> hears behind it the marvel at Tintagel the <em>Vita</em> here passes over. The second of the \"three who resist.\"",
      appears: [10, 11],
      rel: [{ to: "ambrosius", label: "brother of" }, { to: "arthur", label: "father of" }] },

    { id: "arthur", name: "Arthur", role: "chronicle", alt: "Arturus; the Cornish boar", epithet: "the king borne wounded to Avalon",
      blurb: "The summit of the chronicle and the hinge between Merlin's world and the Isle of Apples. Uther's son, a boy-king saved by his Breton ally Hoel, who grows to subdue Scots, Irish, Norwegians, Danes, the Gauls (with the killing of Frollo) and the Romans (with the death of Lucius) — the whole imperial career of the <em>Historia</em> compressed into a roll-call (XI). Betrayed at the summit of his power by his nephew Mordred and his queen, he returns to the slaughter of Camlann, where, mortally wounded, he is borne over the sea to Morgen on the Isle of Apples — \"as Taliesin foretold\" — to be healed if he stays a long time. Not dead, but waiting: the once-and-future king in his earliest form. (In the <em>Prophetiae</em> he is the \"Cornish boar\" whose contending heirs open Merlin's prophecy.)",
      appears: [9, 10, 11],
      rel: [{ to: "uther", label: "son of" }, { to: "mordred", label: "betrayed by" }, { to: "morgen", label: "borne to & healed by" }, { to: "barinthus", label: "ferried to Avalon by" }] },

    { id: "mordred", name: "Mordred", role: "chronicle", alt: "Modredus", epithet: "Arthur's nephew; the betrayer of Camlann",
      blurb: "Arthur's nephew, left as regent with the queen while the king marches on Rome — and seizing both realm and Guinevere in \"an unlawful love.\" When Arthur returns, Mordred allies with the Saxons (the final inversion: a Briton calling in the old enemy against his king) and falls at Camlann, \"deceived by the profane people he trusted.\" His two sons carry the kin-slaughter on after him, until Constantine and the usurper Conan close the poem's ruined after-Arthur years.",
      appears: [11],
      rel: [{ to: "arthur", label: "nephew of; betrays" }] },

    { id: "cadwallader", name: "Cadwallader", role: "chronicle", alt: "with Conan (Cynan)", epithet: "the promised deliverer of Britain",
      blurb: "Not a figure of the past but of the future — the deliverer of Merlin's recovery prophecy (X). When the Britons have lost the realm for many ages through their own weakness, <strong>Cadwallader</strong> and <strong>Conan</strong> will come from Brittany to bind the Brittonic peoples in firm league, drive out the Saxons, and renew \"the time of Brutus.\" This is the prophecy that closes Geoffrey's <em>Historia</em> too, and the spine of the Welsh tradition of the <em>mab darogan</em>, the promised son — the national redemption the poem offers in place of Arthur's personal return.",
      appears: [10],
      rel: [{ to: "arthur", label: "restorer of Britain after" }] },

    // — The Isle of Apples —
    { id: "morgen", name: "Morgen", role: "avalon", alt: "Morgan le Fay", epithet: "chief of the nine sisters; healer of Arthur",
      blurb: "The earliest literary portrait of <strong>Morgan le Fay</strong> — and a far cry from the later villainess. Here <em>Morgen</em> is the foremost of nine healer-sisters who rule the Isle of Apples (Avalon): the most skilled in the art of healing and the fairest, who knows the virtue of every herb, can change her shape, and flies like Daedalus between Brest, Chartres, and Pavia. When Taliesin and Barinthus bring the wounded Arthur to her, she lays him on a golden bed, examines the wound, and says health may yet return to him if he stays. The keeper of the once-and-future king, and the deepest root of the Arthurian Otherworld.",
      appears: [9],
      rel: [{ to: "sisters", label: "chief of" }, { to: "arthur", label: "healer of" }] },

    { id: "sisters", name: "The nine sisters", role: "avalon", alt: "Moronoe, Mazoe, Gliten, Glitonea, Gliton, Tyronoe, Thiten", epithet: "the rulers of the Isle of Apples",
      blurb: "The nine sisters who \"give the law by a kindly rule\" to those who come to the Isle of Apples, taught astronomy by Morgen their chief. Geoffrey names them — Moronoe, Mazoe, Gliten, Glitonea, Gliton, Tyronoe, and twice Thiten, \"Thiten most famed for her lyre.\" The nine maidens of the Fortunate Isle are an old Celtic and classical pattern (the nine priestesses of the Île de Sein, the nine Muses), here keeping the apple-island where men live a hundred years.",
      appears: [9],
      rel: [] },

    { id: "barinthus", name: "Barinthus", role: "avalon", alt: null, epithet: "the pilot who steered Arthur to Avalon",
      blurb: "The steersman \"to whom the waters and the stars of heaven were known,\" who guides the ship that bears the wounded Arthur to the Isle of Apples. The same otherworld-ferryman appears in the <em>Navigatio Sancti Brendani</em>, the voyage-tale of St Brendan — a pilot between this world and the next, borrowed by Geoffrey to carry the king across.",
      appears: [9],
      rel: [{ to: "arthur", label: "ferries to Avalon" }] },

    // — The wild wood and its fellowship —
    { id: "wolf", name: "The grey wolf", role: "woods", alt: null, epithet: "Merlin's companion in the first madness",
      blurb: "The wild man's one companion in his first winter — old, starving, past the hunt, howling on its back in the snow. Merlin's apostrophe to the grey wolf (\"dear wolf, my companion\") is the emotional floor of the poem, the point furthest from the court: the madman given a beast for an interlocutor exactly where a king would have councillors. The Irish wild-king Suibhne is given the same beast-companions — a sign of the shared Celtic substratum behind both tales.",
      appears: [1],
      rel: [] },

    { id: "maeldin", name: "Maeldin", role: "woods", alt: "Maeldinus", epithet: "the knight maddened by poison; the fourth of the fellowship",
      blurb: "A fair and valiant knight of Merlin's youth, and Merlin's double in the poem's last movement. Hunting together long ago, they found fragrant apples by a spring; Maeldin gathered them and gave them to Merlin, who — finding too few to keep any — shared them all out, and so was spared when the eaters went mad. The apples had been poisoned by a woman Merlin spurned, and meant for Merlin himself. Maeldin bursts from the woods raving \"like a savage boar,\" is healed by the same new spring that cured Merlin, and joins the woodland fellowship — the second madman gathered out of the wild into the service of God.",
      appears: [15],
      rel: [{ to: "lover", label: "maddened by the poison of" }, { to: "taliesin", label: "fellow in the woods" }] },

    { id: "lover", name: "The spurned lover", role: "woods", alt: null, epithet: "the woman who poisoned the apples",
      blurb: "A woman who had loved Merlin and shared his bed for years, and who, spurned when he refused her, \"by a sinister will\" laid poisoned apples beside the spring he frequented, meaning to kill him. The plot miscarried by the accident of Merlin's generosity, falling instead on his companions and ruining Maeldin. The poem's last act of treachery-by-poison — after the venomed cups of Vortimer and Ambrosius — and the dark final turn of its apple-thread.",
      appears: [15],
      rel: [{ to: "merlin", label: "spurned suitor of" }, { to: "maeldin", label: "maddens by mischance" }] },
  ],
};
