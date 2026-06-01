/* The motif index — Math uab Mathonwy classified against the folklorists'
   "Dewey decimal": the Thompson Motif-Index (letter-classed call-numbers) and
   the Aarne-Thompson-Uther (ATU) tale-type index.

   COMPLETE. The motif index for the whole branch — across eight Thompson
   classes — each keyed to the movement(s) that realise it, with cross-
   references into the sister tales (especially Pwyll, the First Branch, and
   Manawydan, the Third, with which Math shares its magical vocabulary).

   Honesty: exact call-numbers are best-effort identifications, not the
   authoritative index. Each motif carries a confidence flag:
     high = well-attested code & application   med = code right, application interpretive
     spec = the number itself is a guess.
   Attaches to window.MATH. */
window.MATH = window.MATH || {};
window.MATH.motifs = {
  intro: "Folklorists file every recurring story-atom under a letter-class and number: B animals, D magic, F marvels, K deceptions, Q rewards &amp; punishments, S cruelty, T sex &amp; marriage, Z formulas. <em>Math</em> is the most <strong>magic-dense</strong> of the Four Branches — the wand that transforms, the men turned to paired beasts, the woman made of flowers and unmade into an owl, the man who becomes an eagle, the illusory armies, the song that calls a god out of a tree. Below, the index for the whole branch, keyed to the movements that realise each, with cross-references into the sister tales — above all <em>Manawydan</em>, with which it shares the <em>hudlath</em>, and <em>Pwyll</em>, whose Annwn and whose hunt-engine return here.",
  taletypes: [
    { code: "The Four Branches", name: "Native Welsh cycle (no clean ATU type)", conf: "high",
      gloss: "Math is the Fourth and last Branch of the Mabinogi, the sequel to Manawydan; its first movement closes the Pryderi thread that runs through all four. It is a native mythological cycle of the children of Dôn — a family of magicians whose Irish cousins are the Túatha Dé Danann — not an ATU wonder-tale; its motifs are Insular and very old, several with Irish analogues (Lleu/Lugh, Gofannon/Goibniu, Dôn/Danu)." },
    { code: "ATU 590-cluster", name: "The treacherous wife and the hero's secret weakness", conf: "med",
      gloss: "The Lleu–Blodeuwedd–Gronw triangle is the Insular form of an international structure: a wife learns, by a false show of love, the one near-impossible way her husband can be killed, and betrays it to her lover (cf. the 'external soul' / unique-vulnerability tales, ATU 302/590 and the deaths of Samson, Llew's cousins across myth). Math keeps the secret as a liminal 'neither–nor' riddle rather than an object — see Z312 below." },
  ],
  classes: { B: "Animals", D: "Magic", F: "Marvels", K: "Deceptions", Q: "Rewards and punishments", S: "Cruelty", T: "Sex and marriage", Z: "Miscellaneous (formulas)" },
  classOrder: ["B", "D", "F", "K", "Q", "S", "T", "Z"],
  list: [
    // ── B · Animals ──────────────────────────────────────────
    { code: "B184", cls: "B", conf: "med", name: "Otherworld swine", passages: [1],
      gloss: "The swine of Annwn — the first pigs ever to come to Britain, sent to Pryderi by Arawn king of Annwn, \"better than the flesh of oxen.\" Prestige- and Otherworld-animals, and the bait Gwydion uses to start his war. Cross: <em>Pwyll</em> (First Branch), where Arawn and Annwn are introduced — the Otherworld gift-economy of the cycle." },
    { code: "B563.2", cls: "B", conf: "med", name: "Animal leads hero to the hidden", passages: [6],
      gloss: "The bondman's sow vanishes each morning by a road no one can follow, and Gwydion, following her to Nantlleu, is led to the rotting eagle in the oak. The beast-guide who knows what people do not. Cross: the shining-white boar that lures the hunters to the caer in <em>Manawydan</em> — the animal that draws a searcher across a threshold." },

    // ── D · Magic ────────────────────────────────────────────
    { code: "D1254.1", cls: "D", conf: "high", name: "The magic wand (hudlath)", passages: [2, 3, 6],
      gloss: "The branch's central instrument: Math's (and Gwydion's) <em>hudlath</em> tests Aranrhod, turns the brothers to beasts and back, and restores the eagle to a man. One object that transforms, punishes and heals alike. Cross: the same word and instrument is Llwyd's wand in <em>Manawydan</em>, which un-mouses his wife and restores the wasteland — the shared magical vocabulary of the two enchanter-branches." },
    { code: "D2031", cls: "D", conf: "high", name: "Magic illusion", passages: [1, 4],
      gloss: "Gwydion's signature: horses, hounds and gilded shields conjured from fungus (and dissolving in a day); a whole besieging fleet raised out of nothing to frighten Aranrhod; a ship and fine leather made from seaweed. Cross: the illusion-magic (<em>hud a lledrith</em>) of <em>Manawydan</em> — the vanishing caer and the emptying mist — and the wider Welsh tradition." },
    { code: "D114.1", cls: "D", conf: "med", name: "Transformation: men to wild beasts", passages: [2],
      gloss: "Math turns Gwydion and Gilfaethwy, three years running, into a hind and stag, a boar and sow, a wolf and she-wolf — bound to be \"of one nature\" with the beasts they wear, and to breed as they do. Forced animal-transformation as a fitted punishment; the sexes swapped each year so each bears young." },
    { code: "D152.2", cls: "D", conf: "high", name: "Transformation: man to eagle", passages: [5, 6],
      gloss: "Struck by the spear, Lleu does not die but flies up as a wounded eagle with a dreadful scream, and roosts rotting in the high oak — the solar god (Lugus) in the world-tree. The single most striking image of the branch, and the one the englynion are sung to undo." },
    { code: "D153.2", cls: "D", conf: "high", name: "Transformation: woman to owl", passages: [6],
      gloss: "Gwydion's punishment of Blodeuwedd: not death but the owl's shape, condemned to shun the day and be mobbed by all other birds, keeping her name as a curse — <em>blodeuwedd</em> is still a Welsh word for the owl. The made-woman unmade, with an etiology attached (why the birds hate the owl)." },
    { code: "T543", cls: "D", conf: "spec", name: "Woman created from flowers", passages: [5],
      gloss: "Math and Gwydion conjure Blodeuwedd — \"Flower-Face\" — from the blossoms of oak, broom and meadowsweet, to beat Aranrhod's curse that Lleu have no wife of any earthly race. The artificial bride, made for one man and owing no loyalty she was not given, is one of the most famous and resonant inventions in Welsh myth. (Filed under D for the conjuring; the exact Thompson code is uncertain.)" },
    { code: "D1275", cls: "D", conf: "med", name: "Magic song", passages: [6],
      gloss: "The three englynion Gwydion sings to call the eagle down out of the oak, branch by branch, into his lap. Poetry as power — the proof that Gwydion's bardic disguise was never only a disguise — in a tradition where the <em>cyfarwydd</em>'s craft shades into magic." },

    // ── F · Marvels ──────────────────────────────────────────
    { code: "F571.2", cls: "F", conf: "spec", name: "The king whose feet must rest in a virgin's lap", passages: [1],
      gloss: "Math's sacral condition: save in time of war, he cannot live unless his feet lie in the lap of a virgin foot-holder. A marvel of archaic kingship — the king bound to a fragile, ritual dependence — and the one loophole (war) that Gwydion exploits to wreck everything." },
    { code: "D1810.0.2", cls: "F", conf: "spec", name: "Wind-borne omniscience", passages: [1],
      gloss: "Math hears every whisper that passes between people, however low, \"if the wind meet it.\" The sovereign's magical hearing makes ordinary scheming impossible — which is exactly why the conspirators need something louder than a whisper: a war." },
    { code: "F611.3.2", cls: "F", conf: "med", name: "Prodigiously fast-growing child", passages: [4],
      gloss: "The child Gwydion hides in the chest grows at double speed — a year old he is as big as a two-year-old, at four as big as eight. Cross: Pryderi's same uncanny acceleration in <em>Pwyll</em>, and the year-old heroes of the wider Celtic tradition (Lleu's Irish cousin Lugh among them)." },
    { code: "F420.5", cls: "F", conf: "spec", name: "The sea-child", passages: [3],
      gloss: "Dylan Eil Ton, baptised, makes straight for the sea and takes its nature — swimming like the best fish, no wave ever breaking beneath him. A sea-divinity in all but name, given a single haunting paragraph before his death." },

    // ── K · Deceptions ───────────────────────────────────────
    { code: "K1810", cls: "K", conf: "high", name: "Deception by disguise", passages: [1, 4],
      gloss: "Gwydion's constant method: he enters Pryderi's court as the chief of a company of bards (and again at Caer Aranrhod), and plays a gilded shoemaker at Aranrhod's gate. Cross: disguise-entries across the corpus — Cei in <em>Culhwch</em>, Pwyll's beggar, Orfeo's minstrel, Owain's ring — and, pointedly, the cobbler's bench Manawydan also takes up (see Z, the Three Gold-shoemakers)." },
    { code: "K2213", cls: "K", conf: "med", name: "Treacherous wife learns the fatal secret", passages: [5],
      gloss: "Blodeuwedd extracts from Lleu the one way he can be killed under a false show of fear for his safety, and betrays it to Gronw. The wife who worms out her husband's secret weakness and hands it to his enemy — the Insular cousin of an international pattern (see the ATU 590-cluster above)." },

    // ── Q · Rewards and punishments ──────────────────────────
    { code: "Q261", cls: "Q", conf: "high", name: "Treachery punished", passages: [6],
      gloss: "Both betrayers are punished in the reckoning: Blodeuwedd into an owl, Gronw by the return-blow. And Gronw's war-band, who refuse to take the blow for their lord, earn a place in the Triads as one of the Three Disloyal War-Bands of Britain." },
    { code: "Q582", cls: "Q", conf: "high", name: "Punishment fitted to the crime (talion)", passages: [2, 6],
      gloss: "The branch's signature: a sexual violation answered by enforced bestial breeding and the shame of bearing young; and a spear-cast answered by the <em>exact</em> return-blow, Gronw made to stand where Lleu stood. Justice as precise symmetry — the work the wonder-tale usually gives to a wedding." },

    // ── S · Cruelty ──────────────────────────────────────────
    { code: "S062", cls: "S", conf: "spec", name: "The ravisher; violation of the foot-holder", passages: [1, 2],
      gloss: "Gilfaethwy's rape of Goewin — the core villainy of the first two movements, and a crime against three things at once: her person, the sacral office of the virgin foot-holder, and the king's honour and very life-condition. The tale names it plainly and answers it doubly: amends to Goewin, the beast-punishment to the brothers." },

    // ── T · Sex and marriage ─────────────────────────────────
    { code: "H411", cls: "T", conf: "med", name: "Chastity / virginity test", passages: [3],
      gloss: "Math's wand-ordeal — step over the bent wand, \"and if you are a virgin, I shall know it.\" Aranrhod fails it on the spot, giving birth at the step. The magical virginity-test, with the foot-holder's required purity as its stake." },
    { code: "T481", cls: "T", conf: "high", name: "Adultery", passages: [5],
      gloss: "Blodeuwedd and Gronw, lovers from the first look, betray and plot to murder Lleu. The tale does not moralise the love itself — there is real pathos in a being made for one man discovering a feeling no one conjured — but its fruit is murder, and the reckoning is total." },

    // ── Z · Formulas ─────────────────────────────────────────
    { code: "Z312", cls: "Z", conf: "med", name: "The 'neither–nor' fatal condition", passages: [5],
      gloss: "Lleu can be killed only under impossible, liminal conditions — not in a house nor out, not on horse nor foot, by a spear a year in the making and worked only at the forbidden hour of Sunday mass, with one foot on a cauldron-rim and one on a buck. The hedged death of a god, a deep Indo-European pattern of the hero slain only at the threshold of every category." },
    { code: "Z71.5", cls: "Z", conf: "high", name: "Formulistic number three", passages: [2, 4, 6],
      gloss: "The branch runs on threes: three years of beast-punishment in three shapes, three beast-sons, Aranrhod's three curses, the three englynion that call the eagle down. The fairy-tale triple structures the whole tale." },
    { code: "Z16", cls: "Z", conf: "high", name: "Onomastic etiology", passages: [1, 4, 6],
      gloss: "Math is the most place-name-dense of the Branches: Mochdref and Mochnant and Creuwryon (the swine's road), Dinas Dinlleu (\"Lleu's fort\"), Nantlleu (\"Lleu's brook\"), Llech Gronw (the holed slab still by the Cynfael), and the owl forever named Blodeuwedd. The cycle remembers itself in the land. Cross: the naming-closes of the sister branches (Tal Ebolyon, Calch Lassar, the Mynweir colophon)." },
    { code: "Z (Triads)", cls: "Z", conf: "high", name: "Triadic references", passages: [3, 4, 6],
      gloss: "The branch threads three figures of the Welsh Triads through the tale: the Three Ill-Fated Blows (Gofannon's killing of Dylan), the Three Gold-shoemakers (Gwydion at Aranrhod's gate — the very Triad that names Manawydan), and the Three Disloyal War-Bands (Gronw's men who would not take his blow). The prose and the Triadic catalogue cross-referencing each other." },
  ],
};
