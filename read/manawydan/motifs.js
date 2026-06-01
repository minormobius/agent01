/* The motif index — Manawydan uab Llyr classified against the folklorists'
   "Dewey decimal": the Thompson Motif-Index (letter-classed call-numbers) and
   the Aarne-Thompson-Uther (ATU) tale-type index.

   COMPLETE. The motif index for the whole branch — across nine Thompson
   classes — each keyed to the movement(s) that realise it, with cross-
   references into the sister tales (especially Pwyll, the First Branch, whose
   old grudge is the engine here, and Branwen, the Second, its prequel).

   Honesty: exact call-numbers are best-effort identifications, not the
   authoritative index. Each motif carries a confidence flag:
     high = well-attested code & application   med = code right, application interpretive
     spec = the number itself is a guess.
   Attaches to window.MANAWYDAN. */
window.MANAWYDAN = window.MANAWYDAN || {};
window.MANAWYDAN.motifs = {
  intro: "Folklorists file every recurring story-atom under a letter-class and number: B animals, C taboo, D magic, F marvels, K deceptions, N fate, P society, Q rewards &amp; punishments, Z formulas. <em>Manawydan</em> is a native Welsh branch, not an ATU wonder-tale, but it is the most motif-dense of the Branches for the folklorist: the <strong>enchanted wasteland</strong> and its lifting, the <strong>vanishing otherworld fort</strong> with its fatal golden bowl, the <strong>magician's shape-shift</strong> of a whole household into a host of mice, and the <strong>life-bargain over a captured wife</strong>. Below, the index for the whole branch, keyed to the movements that realise each, with cross-references into the sister tales — above all <em>Pwyll</em>, whose badger-in-the-bag is the hidden cause of everything here.",
  taletypes: [
    { code: "The Four Branches", name: "Native Welsh cycle (no clean ATU type)", conf: "high",
      gloss: "Manawydan is the Third of the Four Branches of the Mabinogi, opening on the seven survivors of Branwen (the Second) and closing the revenge-arc begun in Pwyll (the First): Llwyd lays the wasteland to avenge Gwawl son of Clud, whom Pwyll tricked in the badger-in-the-bag game. It is not an ATU wonder-tale but a native cycle; its motifs are Insular and old." },
    { code: "Wasteland → Grail", name: "The enchanted wasteland / terre gaste complex", conf: "med",
      gloss: "The kingdom-wide enchantment that empties Dyfed is the Insular cousin of the Continental Grail Wasteland — a realm sunk into desolation by a magical act, waiting for the right person and the right deed to lift it. Manawydan is the corpus's purest wasteland tale, and the only one whose waste is fully undone." },
  ],
  classes: {
    B: "Animals",
    C: "Tabu",
    D: "Magic",
    F: "Marvels",
    K: "Deceptions",
    N: "Chance and fate",
    P: "Society",
    Q: "Rewards and punishments",
    Z: "Miscellaneous (formulas)",
  },
  classOrder: ["B", "C", "D", "F", "K", "N", "P", "Q", "Z"],
  list: [
    // ── B · Animals ──────────────────────────────────────────
    { code: "B184.3", cls: "B", conf: "med", name: "The otherworld boar as lure", passages: [4],
      gloss: "The shining-white (<em>claerwyn</em>) wild boar that rises from the thicket and baits hunters and hounds to the vanishing caer. White or white-and-red beasts in the Mabinogi are always from Annwn; this one is no quarry but a deliberate lure. Cross: the white-red hounds of Annwn in <em>Pwyll</em> (First Branch), and the great hunted boar Twrch Trwyth in <em>Culhwch</em>." },
    { code: "B871", cls: "B", conf: "spec", name: "Devastating host of small animals", passages: [5, 6],
      gloss: "The <em>eliwlu</em>, the 'innumerable host' of mice that strips the crofts ear by ear — a ravaging swarm beyond counting. Here it is also a transformation (see D117): a war-band and a whole court shrunk to vermin, the grotesque-comic shape the enchantment's malice takes." },

    // ── C · Tabu ─────────────────────────────────────────────
    { code: "C611", cls: "C", conf: "med", name: "The forbidden place / threshold", passages: [4],
      gloss: "Manawydan's interdiction: do not enter the caer, for it is the enchanter's work. Pryderi crosses the forbidden threshold and is lost. Cross: the forbidden door at Gwales in <em>Branwen</em> (the survivors may feast undecayed until the door toward Cornwall is opened) — adjacent branches, the same tabu of the threshold that must not be crossed." },
    { code: "C920", cls: "C", conf: "med", name: "Loss / captivity for breaking tabu", passages: [4],
      gloss: "The breach of the interdiction is punished at once: Pryderi grips the bowl and is held fast and dumb; Rhiannon, following, shares it. The violation (Propp's δ) and its instant penalty are a single motion." },

    // ── D · Magic ────────────────────────────────────────────
    { code: "D2031", cls: "D", conf: "high", name: "Magic illusion (hud a lledrith)", passages: [2, 4, 6],
      gloss: "The branch's master-motif, named in its own words — <em>hud a lledrith</em>, 'enchantment and illusion.' The fall of mist that wipes the inhabited world, the fort that appears where no stone stood and vanishes again, the disguises of the enchanter: all one sustained illusion, laid by one hand and lifted by one bargain." },
    { code: "D2090", cls: "D", conf: "med", name: "Land laid waste by magic", passages: [2, 5],
      gloss: "Thunder and mist empty the seven cantrefs of Dyfed — no house, no beast, no smoke, no neighbour — and the crops that do grow are reaped by night. The enchanted wasteland is unique among the Four Branches; cross: the Grail <em>terre gaste</em> of the Continental romances, a kingdom waiting to be redeemed." },
    { code: "D2171", cls: "D", conf: "high", name: "Magic adhesion to an object", passages: [4],
      gloss: "The golden bowl on the marble slab fixes Pryderi's hands to it and his feet to the stone, and takes his speech. Cross: the wide family of sticky-traps (the tar-baby type) — but turned here into a beautiful, fatal Otherworld snare baited with gold." },
    { code: "D117", cls: "D", conf: "med", name: "Transformation: men to mice", passages: [5, 6],
      gloss: "Llwyd shape-shifts his whole household — and, the third night, his wife and the ladies of his court — into the host of mice that ravages the wheat. The enchanter's signature power, and the mechanism by which a court's revenge is delivered as vermin." },
    { code: "D1254.1", cls: "D", conf: "high", name: "Magic wand (hudlath)", passages: [6],
      gloss: "Llwyd strikes the freed mouse with a <em>hudlath</em>, restoring her to 'the fairest young woman anyone had seen.' Cross: the same word and instrument is the enchanter's-rod of <em>Math</em> (the Fourth Branch), where Math and Gwydion transform with it — a shared magical vocabulary across the Branches." },
    { code: "D700", cls: "D", conf: "high", name: "Disenchantment", passages: [6],
      gloss: "The spell lifted at a word: the wife un-moused, and the whole wasteland restored in a glance — every herd, dwelling and neighbour back as they were at their best. The clean, total liquidation that no other branch grants." },

    // ── F · Marvels ──────────────────────────────────────────
    { code: "F771.1", cls: "F", conf: "med", name: "Castle that appears / vanishes", passages: [4],
      gloss: "The 'great, lofty caer with new-built work upon it,' standing where the four had never seen stone or building, and gone again in thunder and mist with its captives inside. Cross: the Grail Castle of Continental romance, which appears to the worthy and is not found again." },
    { code: "F771.4", cls: "F", conf: "spec", name: "Chains rising into the air with no end", passages: [4],
      gloss: "The golden bowl hangs by four chains 'going up toward the air, and no end to them that he could see' — a marvel that makes the vessel a thing suspended between worlds. One of the eeriest single images in the Branches." },

    // ── K · Deceptions ───────────────────────────────────────
    { code: "K1810", cls: "K", conf: "high", name: "Deception by disguise", passages: [6],
      gloss: "Llwyd approaches the gallows-hill three times in rising rank — poor scholar, mounted priest, bishop with a baggage-train — each a disguise, each pressing Manawydan to give up the mouse. The ascending splendour is itself the tell that one power is dressing three times over." },
    { code: "K717", cls: "K", conf: "med", name: "Deception into a bag (the badger-in-the-bag)", passages: [6],
      gloss: "The off-stage cause of the whole branch: in <em>Pwyll</em>, Gwawl son of Clud was tricked into a magic bag at Hyfaidd Hen's court and beaten — the game of Badger-in-the-Bag. Llwyd lays the wasteland to avenge him. Cross: <em>Pwyll</em> (First Branch) — the trick whose bill comes due, a generation late, on Pwyll's son Pryderi." },

    // ── N · Chance and fate ──────────────────────────────────
    { code: "N339", cls: "N", conf: "spec", name: "The one vulnerable adversary", passages: [5, 6],
      gloss: "Of an innumerable host, exactly one mouse is too heavy and slow to escape — the enchanter's pregnant wife. That single accident of nature is the one flaw in a flawless enchantment, and the whole salvation of a kingdom hangs on it. Fate hands the patient man his one catchable hostage." },

    // ── P · Society ──────────────────────────────────────────
    { code: "P50", cls: "P", conf: "spec", name: "Noble incognito masters humble crafts", passages: [3, 5],
      gloss: "The rightful king of Britain lives as saddler, shieldwright and cobbler, mastering each trade with otherworldly skill and earning the Triadic title of one of the Three Gold-shoemakers. The dispossessed prince who will not stand on his dignity — and whose refusal to be shamed by rank is, in the end, exactly what defeats the enchanter." },

    // ── Q · Rewards and punishments ──────────────────────────
    { code: "Q281", cls: "Q", conf: "med", name: "Mercy; punishment withheld", passages: [6],
      gloss: "Holding every card, Manawydan asks not for vengeance but for guarantees — the captives freed, the spell lifted, and a binding promise of no future revenge on anyone. The villain is spared. Mercy, written as the last clause of the contract, ends the cycle of revenge the First Branch began; cross: the contrast with the genre's (and Branwen's) appetite for punishment." },

    // ── Z · Formulas ─────────────────────────────────────────
    { code: "Z71.5", cls: "Z", conf: "high", name: "Formulistic number three", passages: [3, 5, 6],
      gloss: "The branch runs on threes: three crafts (saddles, shields, shoes), three crofts of wheat, three nights of mice, three visitors to the gallows (scholar, priest, bishop). The fairy-tale triple structures the whole second half." },
    { code: "Z16", cls: "Z", conf: "high", name: "Onomastic etiology", passages: [3, 6],
      gloss: "The tale explains names: the blue enamel 'still called Calch Lassar' after Llasar Llaes Gyfnewid, and the colophon that calls the branch the 'Mabinogi of Mynweir and Mynordd' after the gate-knockers and ass-collars Pryderi and Rhiannon wore in bondage. Cross: the Branches' love of the naming-close — <em>Tal Ebolyon</em> in Branwen, the naming of Pryderi in Pwyll." },
  ],
};
