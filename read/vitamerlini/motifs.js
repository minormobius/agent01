/* Vita Merlini — Layer 5: the motif index. The poem classified against the
   folklorists' "Dewey decimal" — Stith Thompson's Motif-Index of Folk
   Literature and the Aarne–Thompson–Uther tale-type catalogue.

   COMPLETE. The Vita has two natures, and the index honours both: a body of
   genuine, well-attested folk-narrative motifs (the wild man of the woods,
   the threefold death, the seer's enigmatic laugh, the Isle of Apples, the
   healing spring, the poisoned apples) carried by the biography; and a great
   weight of learned, encyclopedic material (the Chartrian cosmology, the
   bestiary of birds, the catalogue of marvellous springs) that is matter for
   the schools more than for the folk — marked "interpretive" accordingly.
   Cross-references to the sister tales are woven into the glosses. Attaches
   to window.VITAMERLINI.motifs. */
window.VITAMERLINI = window.VITAMERLINI || {};
window.VITAMERLINI.motifs = {
  intro: "The <em>Vita Merlini</em> sits across the folklorist's grid at an angle. Its narrative spine is built of some of the most widely-attested motifs in the Celtic and Indo-European stock — the <strong>wild man of the woods</strong> (F567), the <strong>threefold death</strong> (M341.2.4), the <strong>seer's enigmatic laugh</strong> (N456), the <strong>Isle of Apples</strong> and the wounded king who will return — and these it shares, deeply, with the Scottish Lailoken, the Irish Suibhne, and the Welsh Myrddin poems. But hung upon that spine is a mass of <em>learned</em> material — Geoffrey's cosmology, his bird-bestiary, his catalogue of the world's wondrous waters — which belongs less to the folk than to the twelfth-century classroom, and which the index below marks as interpretive rather than well-attested. The folk-tale and the encyclopedia, indexed side by side.",
  taletypes: [
    { code: "Myrddin / Lailoken complex", name: "The mad prophet of the woods", conf: "high",
      gloss: "The international type behind the whole poem: a man of rank driven mad by the horror of battle, who flees to the forest, lives as a beast, gains the gift of prophecy, and is in time recovered. It survives in three close cousins — the Welsh <strong>Myrddin Wyllt</strong> of the early poems (<em>Yr Afallennau</em>, <em>Yr Oianau</em>), the Scottish <strong>Lailoken</strong> of the Kentigern legends, and the Irish <strong>Suibhne Geilt</strong> of <em>Buile Shuibhne</em> — all sharing the battle (Arfderydd / Arderydd), the wood, the beast-companions, and the prophecies. Geoffrey's contribution is to fuse this northern wild-man with the boy-prophet Merlin of his own <em>Historia</em>." },
    { code: "The Threefold Death", name: "The triple death foretold and fulfilled", conf: "high",
      gloss: "A distinct Celtic and Indo-European narrative pattern: a death by three incompatible means at once — typically falling, hanging, and drowning. It attaches to the wild-prophet himself in the Lailoken and Myrddin traditions (the seer foretells his own triple death), and scholars from Jan de Vries to Georges Dumézil have read it as a ritual death touching all three Indo-European \"functions.\" Geoffrey displaces it from the prophet onto the boy of Ganieda's trick, where it serves to vindicate a doubted prophecy." },
    { code: "ATU 759-adjacent", name: "The seer's laugh / hidden justice revealed", conf: "med",
      gloss: "The pattern of the figure who laughs (or weeps) at what bystanders cannot see — the buried treasure beneath the beggar, the doom hanging over the man who buys shoes — and must afterward explain the enigma. It is kin to ATU 759 (<em>God's Justice Vindicated</em>, the angel and the hermit) and to the riddling wisdom-contest of the Solomon-and-Marcolf tradition. In the <em>Vita</em> the laugh is the prophet's involuntary mark, the engine of the poem's whole middle." },
    { code: "Avalon / rex futurus", name: "The wounded king healed in the Otherworld", conf: "high",
      gloss: "The motif-complex of the hero borne to an otherworld island to be healed of a mortal wound — and so not dead but waiting. The <em>Vita</em> gives it its earliest and barest literary form: Arthur carried to the Isle of Apples and Morgen, \"to be healed if he stays a long time.\" From here grows the whole tradition of the <em>rex quondam rexque futurus</em>, the once-and-future king — the deepest root of the Arthurian Otherworld traced across the <a href=\"/pendragon/\">Pendragon</a> hub." },
  ],
  classOrder: ["A", "B", "D", "F", "K", "M", "N", "Z"],
  classes: {
    A: "Creation &amp; the cosmos",
    B: "Animals &amp; the bestiary",
    D: "Magic, transformation &amp; marvellous waters",
    F: "Marvels &amp; the Otherworld",
    K: "Deception, treachery &amp; poison",
    M: "Prophecy &amp; ordaining the future",
    N: "Chance, fate &amp; the revealing sign",
    Z: "Formulas &amp; symbols",
  },
  list: [
    // — A: Creation & the cosmos —
    { cls: "A", code: "A615", name: "The framing of the world: elements, zones, the orders of spirits", conf: "med", passages: [8],
      gloss: "Taliesin's cosmology (Mvt VIII): the four elements yoked in concord, heaven enclosing all \"like a shell round a nut,\" the five climatic zones, the water-cycle of cloud and rain, and the three peopled heavens with their orders of spirits (angels, airy daemons, cacodemons). This is not folk-cosmogony but the learned Platonism of the twelfth-century schools (the <em>Timaeus</em> tradition, the School of Chartres) put into a Welsh bard's mouth — interpretive, a motif of the classroom rather than the hearth." },

    // — B: Animals & the bestiary —
    { cls: "B", code: "B557.*", name: "Person carried by a wild riding-beast; the Lord of the Beasts", conf: "high", passages: [5],
      gloss: "Merlin rides the lead stag to Guendoloena's wedding, driving the herds of deer, does and roes before him \"as a shepherd the sheep\" (Mvt V). The image is the iconography of the antlered <strong>Lord of the Beasts</strong> — the Celtic Cernunnos, the master-of-animals of the wild-man tradition: the madman's sovereignty over the creatures of the wood mirroring the kingship he laid down. He kills the bridegroom with the stag's own torn-off antlers, the marvel turned to murder." },
    { cls: "B", code: "B251.*", name: "Beasts as the madman's only companions (the grey wolf)", conf: "med", passages: [1],
      gloss: "In his first winter the wild man's one companion is a grey wolf — old, starving, past the hunt — to whom he addresses the poem's most desolate apostrophe (Mvt I). The beast-companion of the forest-madman is a shared mark of the type: the Irish Suibhne keeps his fawn and his beasts, and <a href=\"/owain/\">Owain</a> in his madness lives among the deer of the wilderness. The animal stands in for the councillors a king would have, measuring the distance from the court." },
    { cls: "B", code: "B32", name: "The phoenix and the natures of the birds (the bestiary)", conf: "med", passages: [14],
      gloss: "Merlin's bird-discourse (Mvt XIV) is a versified bestiary in the tradition of Isidore and the <em>Physiologus</em>: the vigilant crane with its sentinel-stone, the eagle testing its young against the sun, the carrion-scenting vulture, the self-renewing <strong>phoenix</strong> (B32) and the blood-giving <strong>pelican</strong> — the two great Christ-emblems of the bestiary — the halcyon's calm seas, the talking parrot, the woodpecker that draws out nails. Learned natural history, interpretive as folk-motif, but the bedrock of medieval animal-symbolism." },

    // — D: Magic, transformation & marvellous waters —
    { cls: "D", code: "D1500.1.18", name: "Magic healing water; the marvellous springs of the world", conf: "high", passages: [12, 13],
      gloss: "The new spring that breaks from the hills and lifts Merlin's madness when he drinks (Mvt XII) — the cure of the whole poem, and the culmination of its water-thread (the spring on the mountaintop in Mvt II, the springs of Taliesin's catalogue in Mvt XIII). Pointedly, the healing is explained as <em>hydrology</em>, not miracle. The marvellous-fountain motif is everywhere in Insular tradition — the storm-spring of <a href=\"/owain/\">Owain</a>'s fountain is its martial cousin; here the marvel is mercy, a water that gives a man back his mind." },
    { cls: "D", code: "D630", name: "Transformation and air-flight at will (Morgen)", conf: "high", passages: [9],
      gloss: "Morgen, chief of the nine sisters of the Isle of Apples, \"knows the art by which she can change her shape, and cut the air on new wings like Daedalus\" — at Brest, Chartres or Pavia when she wills, gliding down from the air onto our shores (Mvt IX). Shape-shifting and self-willed flight are the marks of the fay; this is the earliest portrait of Morgan le Fay, and already she is enchantress as well as healer." },
    { cls: "D", code: "D1812.5", name: "Foreknowledge read from the stars (Merlin's astrology)", conf: "high", passages: [5],
      gloss: "From his mountain Merlin reads the cleared winter sky (Mvt V): the red ray of Mars tells him a king is dead and another reigns by murder (Constantine and Conan), and the divided ray of Venus tells him his wife has remarried. Foreknowledge by the legible motion of the stars — the prophet's gift working as astronomy, the same sky-reading the seventy-doored observatory is built to serve." },

    // — F: Marvels & the Otherworld —
    { cls: "F", code: "F567", name: "The Wild Man (homo silvester)", conf: "high", passages: [1, 2],
      gloss: "The keystone motif: <em>fit silvester homo</em>, \"he becomes a man of the woods\" (Mvt I). Grief unmakes Merlin's reason and he flees to the Caledonian Wood to live among the beasts, eating roots and fruit, overgrown \"after the manner of a beast.\" This is the figure the whole tradition of the medieval <strong>Wild Man</strong> grows from — the hairy <em>wodewose</em> of the misericords, the mad Tristan, the Irish Suibhne, the Scottish Lailoken — and the madness <a href=\"/owain/\">Owain</a> falls into in the wilderness. The wisdom that returns is the gift the woods give back." },
    { cls: "F", code: "F111", name: "Voyage to the Isle of Apples (the earthly paradise)", conf: "high", passages: [9],
      gloss: "The <em>Insula Pomorum</em> — the Isle of Apples, the Fortunate Isle — where apples and grain grow untilled, the ground yields all things of its own accord, and men live a hundred years and more (Mvt IX). Geoffrey makes the classical Isle of the Blessed (<em>insulae fortunatae</em>) British, and it is the destination of the poem's whole apple-thread: from the nineteen vanished apple-trees of Merlin's first lament (Mvt I) to the apple-island at the world's edge. The deepest root of Avalon." },
    { cls: "F", code: "F252.1", name: "The healing fay and the nine sisters (Morgen)", conf: "high", passages: [9],
      gloss: "Morgen and her sisterhood — Moronoe, Mazoe, Gliten, Glitonea, Gliton, Tyronoe, Thiten — who \"give the law by a kindly rule\" on the Isle of Apples, the chief of them \"more skilled in the art of healing\" and surpassing in beauty (Mvt IX). The nine maidens of the Fortunate Isle are an old Celtic and classical pattern (the nine priestesses of the Île de Sein); this is the <strong>earliest literary Morgan le Fay</strong>, healer before villainess." },
    { cls: "F", code: "A571 / D1960.2", name: "The wounded king healed in the Otherworld; the king who will return", conf: "high", passages: [9, 10],
      gloss: "Arthur, mortally wounded at Camlann, is borne over the sea to Morgen on the Isle of Apples, to be healed \"if he stays a long time\" (Mvt IX) — not dead, but waiting. When Taliesin proposes recalling him, Merlin declines, setting the longer hope of Cadwallader's recovery in its place (Mvt X). This is the once-and-future king (<em>rex quondam rexque futurus</em>) in his earliest, barest form — the motif of the returning hero (cf. the sleeping king of D1960.2) that the <a href=\"/pendragon/\">Pendragon</a> hub traces to its source." },
    { cls: "F", code: "F471.2", name: "The incubus; demons begetting on women", conf: "med", passages: [8],
      gloss: "In Taliesin's discourse the cacodemons below the moon \"even assail women in coupling, and make them pregnant, begetting after a profane manner\" (Mvt VIII). The medieval incubus belief — and a quiet, dizzying self-reference: in Geoffrey's own <em>Historia</em>, <strong>Merlin himself is the son of just such an incubus</strong>. The natural philosopher Taliesin, expounding the orders of spirits, describes the very kind of being that fathered the man he is speaking to." },

    // — K: Deception, treachery & poison —
    { cls: "K", code: "K1810", name: "Deception by disguise; the threefold-death trick", conf: "high", passages: [4],
      gloss: "Ganieda presents one boy to Merlin three times — as himself, with cut hair and new clothes, and dressed as a girl — asking each time how he will die (Mvt IV). The triple-disguise test is a classic deception-pattern, here turned to a precise end: to make the true prophet's three answers (rock, tree, river) seem the contradictions of a madman, and so discredit his charge against the queen. She clears herself not by disproving the leaf but by disqualifying the witness." },
    { cls: "K", code: "K811", name: "The treacherous feast (the Night of the Long Knives)", conf: "med", passages: [11],
      gloss: "In the chronicle (Mvt XI), Hengist's Saxons, called together with the British nobles \"as if to join peace,\" draw hidden blades and massacre them — the Night of the Long Knives, the lured-and-slaughtered-guests motif. It comes down from Nennius into Geoffrey's <em>Historia</em> and stands here as the hinge on which Britain is lost; one of the poem's chain of treacheries, with the poison-cups that fell Vortimer and Ambrosius." },
    { cls: "K", code: "S111.4", name: "The spurned lover's poisoned apples", conf: "high", passages: [15],
      gloss: "A woman Merlin had loved and then spurned lays poisoned apples by the spring he frequents, meaning to kill him; by the accident of his own generosity (he gives them all away, keeping none) the poison falls instead on his companions, ruining Maeldin (Mvt XV). The poisoned fruit is an old and potent motif (compare the apple of Snow White, ATU 709), and it is the dark final turn of the poem's apple-thread — the fruit of plenty and of Avalon become the fruit of murder." },

    // — M: Prophecy & ordaining the future —
    { cls: "M", code: "M341.2.4", name: "The threefold death foretold (fall, hanging, drowning)", conf: "high", passages: [4],
      gloss: "Merlin foretells that the boy will die by a fall from a rock, in a tree, and by drowning — and years later, grown and hunting a stag, the boy falls from a crag, hangs by his foot from a tree, and drowns head-down in the river, all three at once, \"making the seer true through the threefold peril\" (Mvt IV). One of the most-studied of Indo-European mythic patterns, the death by three elements; in the British wild-prophet tradition it is the seer's own fate (Lailoken, Myrddin), which Geoffrey displaces onto the boy." },
    { cls: "M", code: "M301", name: "The prophet foretells the realm's future; the recovery prophecy", conf: "high", passages: [7, 10, 15],
      gloss: "Merlin's gift as public vaticination: the long animal-cipher prophecy of the kings of Britain from the seventy-doored observatory (Mvt VII), in the manner of Geoffrey's own <em>Prophetiae Merlini</em>; the messianic <strong>recovery prophecy</strong> of Cadwallader and Conan who will renew \"the time of Brutus\" (Mvt X) — the Welsh <em>mab darogan</em> tradition of <em>Armes Prydein</em>; and, at the close, the passing of the prophetic gift to <strong>Ganieda</strong>, who speaks the poem's last prophecy (Mvt XV), exactly as Gwenddydd keeps Myrddin's prophecies in the Welsh <em>Cyfoesi</em>." },

    // — N: Chance, fate & the revealing sign —
    { cls: "N", code: "N456", name: "The seer's enigmatic laugh reveals hidden knowledge", conf: "high", passages: [3, 6],
      gloss: "Merlin laughs at what he alone can see: the leaf in the queen's hair that betrays her tryst (Mvt III), the beggar sitting on a buried hoard, the man buying shoes he will never wear because he is already drowned (Mvt VI). Each laugh is an involuntary eruption of second sight, demanding to be explained — and the explanation drags a hidden truth into the open. The motif is widespread (the laughing angel of ATU 759, the riddling Marcolf); it is the mainspring of the poem's whole comic-uncanny middle." },
    { cls: "N", code: "N511", name: "Treasure in the ground (the beggar on the hoard)", conf: "high", passages: [6],
      gloss: "The cause of Merlin's first market-laugh (Mvt VI): a doorkeeper begs in thin clothing for the price of a cloak while sitting, all unknowing, on \"hidden heaps of coins.\" \"Turn the earth beneath him: you will find money kept there a long time.\" Hidden wealth beneath apparent poverty — the buried-treasure motif, and the mirror of the second laugh's hidden death beneath ordinary provision." },

    // — Z: Formulas & symbols —
    { cls: "Z", code: "Z71.1", name: "The formulistic three (the threefold pattern)", conf: "med", passages: [1, 4, 6],
      gloss: "The number three structures the whole poem: the <strong>three brothers</strong> slain at Arfderydd whose death begins it (Mvt I), the <strong>threefold death</strong> and the boy shown <strong>three times</strong> (Mvt IV), the <strong>three days'</strong> fast of grief, the <strong>three laughs</strong> (the leaf, the beggar, the shoe-buyer). The triadic patterning is deeply Welsh — the literature of the <em>Trioedd</em>, the Welsh Triads, thinks in threes — and runs as a formal spine beneath the narrative." },
  ],
};
