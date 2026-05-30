/* The motif index — Culhwch ac Olwen classified against the folklorists'
   "Dewey decimal": the Thompson Motif-Index (letter-classed call-numbers) and
   the Aarne-Thompson-Uther (ATU) tale-type index.

   This doubles as the second layer of the synergistic graph: each motif is a
   typed node, and its `passages` array is its set of EXHIBITS edges
   (motif -> movement) in the shared annotation shape.

   Honesty: exact call-numbers are best-effort identifications, not the
   authoritative index. Each motif carries a confidence flag:
     high = well-attested code & application   med = code right, application interpretive
     spec = the number itself is a guess (shown by class letter where omitted).
   Attaches to window.CULHWCH. */
window.CULHWCH = window.CULHWCH || {};
window.CULHWCH.motifs = {
  intro: "Folklorists have their own Dewey decimal: the <strong>Thompson Motif-Index</strong> files every recurring story-atom under a letter-class and number (A mythological, B animals, D magic, F marvels, G ogres, H tests…), while the <strong>ATU index</strong> classifies whole tale-types. Run Culhwch through it and the abstract pattern surfaces — and the call-numbers line up with how the tale already behaves in the <a href=\"#propp\">story graph</a>. Codes here are best-effort, with confidence flagged; where a number is a guess, only the class letter is shown.",
  taletypes: [
    { code: "ATU 513A", name: "Six Go Through the World — the Extraordinary Companions", conf: "high",
      gloss: "A hero gathers companions, each with a marvelous power, and together they achieve what none could alone. Culhwch's six — the guide who is never lost, the man who knows every tongue, the shapeshifter — are a textbook set; Culhwch ac Olwen is a standard cited example of the type." },
    { code: "ATU 313 (rel.)", name: "The Giant's Daughter & the suitor-tasks", conf: "med",
      gloss: "The hero wins a bride by performing impossible tasks set by her ogre father — and is helped by the daughter herself. Culhwch belongs to this international family, though as an early literary text it fits no single type cleanly." },
  ],
  classOrder: ["A", "B", "D", "F", "G", "H", "K", "M", "T", "Z"],
  classes: { A: "Mythological", B: "Animals", D: "Magic", F: "Marvels", G: "Ogres & giants", H: "Tests & tasks", K: "Deceptions", M: "Ordaining the future", T: "Love & marriage", Z: "Formulas" },
  list: [
    // — A · Mythological —
    { cls: "A", name: "Gods surviving as characters", conf: "med", passages: [8, 9],
      gloss: "Mabon son of Modron is the British god Maponos; Gwyn ap Nudd is lord of Annwn, the Otherworld. Old divinities walk the tale demoted to heroes and helpers." },

    // — B · Animals —
    { cls: "B", code: "B211", name: "Speaking animals", conf: "high", passages: [9, 10],
      gloss: "The boar Twrch Trwyth and his pigs argue back; the oldest animals answer the heroes' questions through Gwrhyr." },
    { cls: "B", code: "B841", name: "The oldest animals", conf: "high", passages: [9],
      gloss: "A chain of ever-older creatures — Blackbird, Stag, Owl, Eagle, Salmon — each marking time by something vast worn away. A folk motif found the world over." },
    { cls: "B", code: "B16.1", name: "The devastating giant boar", conf: "med", passages: [10],
      gloss: "Twrch Trwyth, a king turned to a monstrous venomous boar, lays whole regions waste." },

    // — D · Magic —
    { cls: "D", code: "D150", name: "Transformation to bird", conf: "high", passages: [4, 10],
      gloss: "Menw takes bird-shape to scout the boar's treasures, and to parley in the air." },
    { cls: "D", code: "D1711", name: "The magician", conf: "med", passages: [3, 4, 7, 10],
      gloss: "Menw mab Teirgwaedd, the warband's enchanter and shapeshifter." },
    { cls: "D", code: "D1980", name: "Magic invisibility", conf: "med", passages: [4],
      gloss: "Menw casts a glamour so the company passes the giant herdsman unseen." },
    { cls: "D", code: "D1171.2", name: "Magic cauldron", conf: "med", passages: [8],
      gloss: "The cauldron of Diwrnach the Irishman, demanded to boil the wedding feast." },
    { cls: "D", code: "D1652.5", name: "Inexhaustible vessel", conf: "med", passages: [8],
      gloss: "The hamper of Gwyddneu Garanhir feeds any number who come to it — thrice-nine men, each the food he wishes." },
    { cls: "D", code: "D1601", name: "Self-operating object", conf: "med", passages: [8],
      gloss: "The harp of Teirtu plays of itself and falls silent at a wish." },
    { cls: "D", code: "D1364", name: "Sleep- and waking-music", conf: "med", passages: [8],
      gloss: "The Birds of Rhiannon, that wake the dead and lull the living to sleep." },

    // — F · Marvels —
    { cls: "F", code: "F601", name: "Extraordinary companions", conf: "high", passages: [3],
      gloss: "Companions defined by superhuman gifts — the marvel-motif behind ATU 513." },
    { cls: "F", code: "F610", name: "Remarkably mighty man", conf: "high", passages: [3, 9],
      gloss: "Cei goes nine days without sleep or breath, grows tree-tall, burns hot as kindling; Bedwyr's spear makes nine wounds; Cynddylig is never lost; Gwrhyr knows all tongues." },
    { cls: "F", code: "F531", name: "Giants", conf: "high", passages: [4, 7, 8],
      gloss: "Ysbaddaden whose brows must be forked up, the giant Wrnach, and the fire-breathing herdsman Custennin." },
    { cls: "F", name: "The unreachable fort", conf: "spec", passages: [4],
      gloss: "The stronghold that comes no nearer however far you walk — the Otherworld holding its distance." },
    { cls: "F", code: "F252", name: "The Otherworld and its king", conf: "med", passages: [8],
      gloss: "Annwn and its lord Gwyn ap Nudd; behind the whole tradition stands Avalon, the apple-isle." },

    // — G · Ogres & giants —
    { cls: "G", code: "G530.2", name: "Help from the ogre's daughter", conf: "high", passages: [6],
      gloss: "Olwen coaches the hero to out-promise her giant father — a precise and widespread motif, here at its purest." },
    { cls: "G", code: "G610", name: "Theft of treasure from the ogre", conf: "med", passages: [10, 11],
      gloss: "The comb, shears and razor wrested from the boar's head; the sword taken from the giant Wrnach." },

    // — H · Tests & tasks —
    { cls: "H", code: "H335", name: "Tasks set for the suitor", conf: "high", passages: [8],
      gloss: "The bride's father imposes tasks the suitor must accomplish to win her." },
    { cls: "H", code: "H901", name: "Tasks imposed on pain of death", conf: "med", passages: [8],
      gloss: "Ysbaddaden sets the anoethau with death named as the price of failure." },
    { cls: "H", code: "H1010", name: "Impossible tasks", conf: "high", passages: [8],
      gloss: "The ~40 anoethau — clear and reap a hill in one day, the magical ingredients, the comb between the living boar's ears." },
    { cls: "H", code: "H1233", name: "Helpers perform the hero's tasks", conf: "high", passages: [9, 10, 11],
      gloss: "Culhwch himself does almost nothing; Arthur and the companions accomplish every task for him." },
    { cls: "H", code: "H1385.1", name: "Quest for a lost person", conf: "med", passages: [9],
      gloss: "The search for Mabon, gone from the world since he was three nights old." },

    // — K · Deceptions —
    { cls: "K", name: "Entry by a feigned craft", conf: "spec", passages: [11],
      gloss: "Cei gains the giant Wrnach's hall by posing as a sword-burnisher, then kills him with his own blade. (Told here in summary.)" },

    // — M · Ordaining the future —
    { cls: "M", name: "Geis: a binding destiny laid on the hero", conf: "med", passages: [1],
      gloss: "The stepmother's tynged — Culhwch shall touch no wife but Olwen. The spoken doom that starts the tale." },
    { cls: "M", code: "M341", name: "Death foretold by a condition", conf: "spec", passages: [6],
      gloss: "Ysbaddaden is fated to die when his daughter weds — which is why he fights every task." },
    { cls: "M", code: "M223", name: "The rash boon", conf: "med", passages: [2],
      gloss: "Arthur grants whatever Culhwch will name (save a few reserved treasures) before he hears the request." },

    // — T · Love & marriage —
    { cls: "T", code: "T11.1", name: "Love from mere report", conf: "high", passages: [1],
      gloss: "Culhwch loves Olwen at the bare mention of her name, having never set eyes on her." },
    { cls: "T", code: "T68", name: "The bride as prize", conf: "med", passages: [12],
      gloss: "Olwen won by the accomplishing of the set tasks." },

    // — Z · Formulas —
    { cls: "Z", code: "Z71", name: "Formulistic numbers (three, nine)", conf: "high", passages: [2, 3, 7, 10],
      gloss: "Three shouts; nine nights and nine days; nine gates and nine porters; three-and-twenty brothers. The wonder-tale's arithmetic." },
    { cls: "Z", name: "The heroic catalogue", conf: "med", passages: [2, 8],
      gloss: "The court-list invocation and the anoethau roll — the tale's delight in the long, mounting list." },
  ],
};
