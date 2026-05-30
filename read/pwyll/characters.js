/* The cast of Pwyll Pendefig Dyfed — the second stratum of the annotation
   layer. Each entry carries its role, the movements it appears in (links
   into the reading), and typed relationships (which seed the character
   web). The First Branch's cast is the richest in our four-tale set after
   Culhwch — three braided arcs, two heroes, one heroine, and an unusual
   gallery of non-human figures (the Hounds of Annwn, two great horses,
   and an unseen power that takes foals and a son alike). Attaches to
   window.PWYLL. */
window.PWYLL = window.PWYLL || {};
window.PWYLL.characters = {
  intro: "The First Branch's cast is the largest in our annotated corpus after <em>Culhwch ac Olwen</em> — 17 figures spanning three royal courts (Dyfed, Annwn, and Hyfaidd Hen's), two heroes (Pwyll for Arcs 1–2, Teirnon for Arc 3), and one heroine (Rhiannon, who carries the whole tale through its second and third movements). Several of the most consequential figures are unnamed: the queen of Annwn beside whom Pwyll spends his chaste year, the wife of Teirnon who orchestrates the boy's return, the six women whose lie rules Dyfed for seven years, and the unseen power that takes the foals and Pryderi alike. Welsh tradition uses anonymity as moral weight; the named figures and the unnamed ones together compose the same network.",
  roles: [
    { id: "principal",  label: "Principals",                     color: "#c9a24a" },
    { id: "annwn",      label: "The court of Annwn",             color: "#6f9ac9" },
    { id: "hyfaidd",    label: "The court of Hyfaidd Hen",       color: "#c97f9a" },
    { id: "arberth",    label: "Arberth household & fosterers",  color: "#b07a4b" },
    { id: "creature",   label: "Creatures and unseen powers",    color: "#8aa363" },
  ],
  cast: [
    // — Principals —
    { id: "pwyll", name: "Pwyll Pendefig Dyfed", role: "principal", alt: "Pwyll Penn Annwfn", epithet: "lord of the seven cantref of Dyfed; later Head of Annwn",
      blurb: "Prince and lord of the seven cantref of Dyfed (south-west Wales), with his court at Arberth (modern Narberth). The tale opens with him losing his companions in a hunt at Glyn Cuch and committing the breach of <em>ansyberwyt</em> — the breach he did not see — that opens the bargain with Arawn. He impersonates the King of Annwn for a year, sleeps chastely beside the queen, slays Hafgan with the one permitted blow, and is renamed <em>Pwyll Penn Annwfn</em>: Head of Annwn. He meets Rhiannon on the Gorsedd, walks unwittingly into Gwawl's rash-promise trap, executes her badger-in-the-bag plan in beggar's rags, and refuses to set her aside when the six women's lie convicts her of child-murder. He dies offstage; Pryderi succeeds him. The Welsh hero whose moral pivot is not skill but loyalty.",
      appears: [1, 2, 3, 4, 5, 6],
      rel: [{ to: "rhiannon", label: "husband of" }, { to: "pryderi", label: "father of" }, { to: "arawn", label: "partner-by-exchange with" }, { to: "hafgan", label: "slayer of" }, { to: "annwn-queen", label: "chaste bedmate of" }, { to: "hyfaidd", label: "son-in-law of" }, { to: "gwawl", label: "outwitter of" }, { to: "teirnon", label: "lord of (former)" }, { to: "cwn-annwn", label: "drove off (the breach)" }] },

    { id: "rhiannon", name: "Rhiannon", role: "principal", alt: "Rīgantonā, \"Great Queen\"", epithet: "the rider on the pale-white horse",
      blurb: "Daughter of Hyfaidd Hen, promised against her will to Gwawl son of Clud. She rides past the Gorsedd Arberth three days in succession on a great pale-white horse at a pace no pursuer can match — the chase-without-catching is hers — until Pwyll calls out and asks her properly. She names her preference (Pwyll over Gwawl), her name (proto-Celtic <em>Rīgantonā</em>, \"Great Queen,\" stands behind her), and her plan. The badger-in-the-bag deliverance is hers from beginning to end. After two prosperous years she bears Pwyll a son and is then falsely accused, by six women's coordinated witness, of having killed him; she takes the penance over dispute, sits seven years at the gate as the horse, and is released by Teirnon's word. The Welsh heroine who out-plots every antagonist she can name and accepts the public shame she cannot undo.",
      appears: [3, 4, 5, 6],
      rel: [{ to: "pwyll", label: "wife of" }, { to: "hyfaidd", label: "daughter of" }, { to: "pryderi", label: "mother of" }, { to: "gwawl", label: "promised against will to" }, { to: "white-horse", label: "rider of" }, { to: "six-women", label: "falsely accused by" }, { to: "teirnon", label: "released by the truth of" }] },

    { id: "pryderi", name: "Pryderi", role: "principal", alt: "Gwri Wallt Euryn (\"Gwri of the Golden Hair\")", epithet: "the lost-and-found son",
      blurb: "Son of Pwyll and Rhiannon, born at Arberth and stolen at midnight from his cradle by the same unseen power that has been taking Teirnon's foals every May Eve. Teirnon's sword-cut stops both thefts; the swaddled boy in fine silk is left at Teirnon's door. Raised by Teirnon and his wife as <em>Gwri Wallt Euryn</em> (Gwri of the Golden Hair), with preternatural growth (a year for three years' size, two for six). He returns to Arberth at seven, given his true name <em>Pryderi</em> from his mother's first relieved word at the recognition — Welsh <em>pryder</em>, \"care, anxiety,\" the very thing being lifted from her. Succeeds Pwyll, expands the kingdom from the seven cantref of Dyfed to the seven cantref of Seisyllwch, marries Cigfa. The named hero of the next three Branches of the Mabinogi.",
      appears: [5, 6],
      rel: [{ to: "pwyll", label: "son of" }, { to: "rhiannon", label: "son of" }, { to: "teirnon", label: "rescued and raised by" }, { to: "teirnon-wife", label: "raised by" }, { to: "pendaran", label: "fostered to" }, { to: "cigfa", label: "husband of (later)" }, { to: "unseen-power", label: "taken by" }, { to: "mare-foal", label: "given the saved foal" }] },

    { id: "arawn", name: "Arawn", role: "principal", alt: "Arawn Urenhin Annwuyn", epithet: "King of Annwn",
      blurb: "One of two crowned kings of Annwn (the Welsh Otherworld), and Pwyll's partner-by-exchange in the year-bargain. Encounters Pwyll at Glyn Cuch in grey-brown wool on a pale-grey horse, riding to the kill that Pwyll has just driven his pack off. He names the breach (<em>ansyberwyt</em>), names his enemy Hafgan, and proposes the year-exchange: each takes the other's form and place for a year and a day. Arawn rules Dyfed in Pwyll's form for that year with such prosperity that the men of Dyfed afterward beg Pwyll not to undo the steward-policies. The mirror-scene with his queen at the homecoming is the recognition that names the chaste sleep as the fidelity test it always was. He gives Pwyll the title <em>Penn Annwfn</em> and the lifelong companionship that follows.",
      appears: [1, 2],
      rel: [{ to: "pwyll", label: "partner-by-exchange with" }, { to: "annwn-queen", label: "husband of" }, { to: "hafgan", label: "enemy of" }, { to: "cwn-annwn", label: "master of" }] },

    { id: "teirnon", name: "Teirnon Twryf Liant", role: "principal", alt: "Teirnon Thunderous-Surge", epithet: "lord of Gwent Is Coed; the second hero",
      blurb: "Lord of Gwent Is Coed (south-east Wales), <em>the best man in the world</em>, the Welsh narrator's quietest possible flag. His mare has foaled every May Eve and lost every foal to an unseen power for years. On the year of Pryderi's loss he arms himself and sits up to find the cause. The foal is born; a great claw comes through the window; Teirnon strikes the arm off at the elbow; he hears a scream outside, runs after it into the dark, returns, and finds at his own door a swaddled boy in silk. He and his wife raise him as Gwri Wallt Euryn. Years later, on hearing of Rhiannon's penance and seeing the boy's likeness to Pwyll (whom he had served before), he rides to Arberth with the boy to unmake the lie. Offered every reward, he takes none. The hero of Arc 3 — the only mid-story protagonist transfer in our four-tale set.",
      appears: [6],
      rel: [{ to: "teirnon-wife", label: "husband of" }, { to: "mare-foal", label: "master of the mare" }, { to: "unseen-power", label: "stopped the claw of" }, { to: "pryderi", label: "rescuer and adoptive father of" }, { to: "pwyll", label: "former man of (returns the son)" }] },

    // — The court of Annwn —
    { id: "hafgan", name: "Hafgan", role: "annwn", alt: "Hafgan urenhin o Annwuyn", epithet: "the king from Annwn, killed by contract",
      blurb: "The second of the two crowned kings of Annwn — named <em>Hafgan</em>, meaning roughly \"Summer-bright\" or \"Summer-white,\" the Welsh tradition's opposite-number to Arawn. He fights Arawn at the ford every year and survives; Arawn cannot kill him. The bargain with Pwyll is engineered specifically so that the <em>second blow</em> never comes — Hafgan can be killed only by a single mortal stroke, and only by someone willing to refuse him the kindness of completion. Pwyll, in Arawn's form, strikes once. Hafgan begs to be finished; Pwyll refuses, by Arawn's instruction. The Welsh contract's one-blow architecture — exactly inverted from Sir Gawain's beheading bargain — claims him.",
      appears: [1, 2],
      rel: [{ to: "arawn", label: "enemy of" }, { to: "pwyll", label: "slain by" }] },

    { id: "annwn-queen", name: "The Queen of Annwn", role: "annwn", alt: "y urenhines (unnamed)", epithet: "the chaste-sleep partner",
      blurb: "The wife of Arawn — \"the fairest woman he had ever seen\" — set in Pwyll's bed every night for the year of the exchange, with Arawn's full form and likeness upon Pwyll. The Welsh tradition keeps her name unspoken (as Sir Orfeo's tradition four centuries later will keep the Fairy Queen's name unspoken). Through the year of impersonation she is treated by Pwyll exactly as she is by Arawn during the day — with full conversation, full courtesy, no marker of difference; only the nightly turning away. At the homecoming her bewildered silence is what triggers Arawn's understanding of how faithfully Pwyll has held the bargain. Her appraisal of Pwyll — <em>a strong grip on a companion in fighting and in bodily temptation, and in keeping faith</em> — is the formal verdict on the test he passed without ever knowing he was being tested.",
      appears: [2],
      rel: [{ to: "arawn", label: "wife of" }, { to: "pwyll", label: "chaste bedmate of" }] },

    // — The court of Hyfaidd Hen —
    { id: "hyfaidd", name: "Hyfaidd Hen", role: "hyfaidd", alt: "Hyfaidd the Old", epithet: "Otherworldly father of Rhiannon",
      blurb: "Rhiannon's father, named with the epithet <em>Hen</em> (\"the Old, the Ancient\") that marks him in Welsh tradition as a figure from outside ordinary genealogy. His court hosts the year-and-a-night wedding feast where Gwawl walks in with the rash-promise demand; it hosts, a year later, the badger-in-the-bag deliverance. At Pwyll and Rhiannon's reunion-feast he sits with Pwyll and his nobles stand surety on the Gwawl-pledge. When Pwyll proposes taking Rhiannon home directly rather than letting her travel separately, Hyfaidd asks once and then accepts. The Welsh foster-father's role — the figure who counsels with Rhiannon and is named in her covenants.",
      appears: [3, 4],
      rel: [{ to: "rhiannon", label: "father of" }, { to: "pwyll", label: "father-in-law of" }, { to: "gwawl", label: "rejected suitor of his daughter" }] },

    { id: "gwawl", name: "Gwawl son of Clud", role: "hyfaidd", alt: "Gwawl uab Clut", epithet: "\"Brilliance\" — the rejected bridegroom",
      blurb: "The man to whom Rhiannon was being given against her will — <em>Gwawl uab Clut</em>, \"Brilliance son of Clud,\" a name Welsh scholarship has long suspected as a euhemerised Brythonic light-deity, opposite-number to Pwyll-as-Penn-Annwfn. He enters Hyfaidd Hen's wedding feast in royal silk, asks Pwyll for a request before naming it, and is granted the bride and the feast in the same breath Pwyll grants. A year later, in his own feast, he is offered an unfillable bag to fill with food, prompted by Rhiannon (with the tender word <em>a geimat</em>, \"heroic one\") to press the food in with his feet, and is turned head-over into the bag by Pwyll-in-disguise. He pleads — <em>it is no proper death to be killed in a bag</em> — and is released by named sureties on his oath never to seek vengeance. The Welsh court's preference for legal architecture over execution, in its purest form.",
      appears: [4],
      rel: [{ to: "rhiannon", label: "promised against her will" }, { to: "pwyll", label: "outwitted by" }, { to: "hyfaidd", label: "rejected suitor at the court of" }] },

    // — Arberth household & fosterers —
    { id: "six-women", name: "The six women", role: "arberth", epithet: "the false accusers in the chamber",
      blurb: "Six women set to watch mother and child on the night Pryderi is born. They sleep before midnight; toward dawn they wake to find the boy gone. Fearing the king's vengeance (<em>a small revenge it would be to burn us, or to put us to death for the boy</em>) they kill some of the bitch's whelps, smear Rhiannon's hands and face with blood, scatter the bones, and accuse her of having destroyed her own son. Their coordinated false witness — <em>six of us against her alone shall not fail</em> — holds against Rhiannon's protests and even against Pwyll's refusal to set her aside. The lie rules the kingdom for seven years. They are <strong>never named, never charged, never expelled</strong> after the recognition. The most distinctive U-absent in our corpus: the false accusers are not punished, not even denounced.",
      appears: [5],
      rel: [{ to: "rhiannon", label: "falsely accused" }, { to: "pryderi", label: "guardians (failed) of" }, { to: "pwyll", label: "unconfronted by" }] },

    { id: "teirnon-wife", name: "Teirnon's wife", role: "arberth", alt: "(unnamed)", epithet: "adoptive mother; orchestrator of the return",
      blurb: "Teirnon's wife — unnamed in the source, central to the recovery. When Teirnon brings her the swaddled boy from the door, she reads the silk: <em>he is the son of noble folk</em>. She proposes the practical adoption (bring women, fake a pregnancy), names the boy <em>Gwri Wallt Euryn</em>, and raises him as her own. Years later, when Teirnon recognises the boy's likeness to Pwyll, she frames the return in three parts: thanks for Rhiannon's release; thanks from Pwyll for the nourishment; and (if the boy proves worthy) the foster-bond with their household. The Welsh narrator's tribute to the working-class household that raised the noble's son with absolute decency, and then gave him back when honour required. Her grief at the parting is named explicitly by Teirnon — <em>there is no one in the world with greater grief for him in her wake</em>.",
      appears: [6],
      rel: [{ to: "teirnon", label: "wife of" }, { to: "pryderi", label: "adoptive mother of" }] },

    { id: "pendaran", name: "Pendaran Dyfed", role: "arberth", epithet: "name-giver of Pryderi; the master foster-father",
      blurb: "A noble of Dyfed who at the recognition feast hears Rhiannon's word <em>pryder</em> (the lifting of \"my anxiety\") and pronounces the boy's true name from it. The Welsh tradition's master foster-father — Pendaran Dyfed appears across the later branches as the figure to whom young heirs of the royal line are formally entrusted. Pwyll proposes him as Pryderi's onward-fosterer when Teirnon returns the boy; Pendaran is named with the nobles of the country at the boy's installation. His role is small in the text but the kingdom-keeping after Pwyll's death runs through him.",
      appears: [6],
      rel: [{ to: "pryderi", label: "name-giver of, then fosterer" }, { to: "rhiannon", label: "hears her word as the name" }] },

    { id: "cigfa", name: "Cigfa", role: "arberth", alt: "Kicua, uerch Wynn Gohoyw", epithet: "Pryderi's wife in the colophon",
      blurb: "Daughter of Gwynn Gohoyw, son of Gloyw Wallt Lydan, son of Casnar Wledig (\"Casnar the Sovereign\") — of the noble men of Britain. Named in the closing colophon as the wife Pryderi chooses when his mind turns to marriage. Her four-generation genealogy is the Welsh narrator's quietest way of saying that the boy raised by the horse-lord married the highest blood in the island. She is the silent door from the First Branch into the Third Branch of the Mabinogi, where she becomes Pryderi's wife in deeper trouble.",
      appears: [6],
      rel: [{ to: "pryderi", label: "wife of" }] },

    // — Creatures and unseen powers —
    { id: "cwn-annwn", name: "The Cŵn Annwn", role: "creature", alt: "the Hounds of Annwn", epithet: "shining white with red ears",
      blurb: "Arawn's hunting-pack: <em>claerwyn llathreit, ac eu clusteu yn gochyon</em> — shining brilliant white with red ears. The founding image of the Insular spectral hound, ancestor of every white-with-red dog in British folk-tradition from medieval ghost-pack legends to Conan Doyle's <em>Hound of the Baskervilles</em>. Pwyll's breach is committed against them at Glyn Cuch — he drives them off the stag they have run down and sets his own pack on it, never seeing that they are not ordinary dogs. The colour-grammar of Welsh Otherworld iconography starts with them. For the cross-tale layer they are the first instantiation of the Z65 white-Otherworld palette that runs to Rhiannon's horse and forward to Sir Orfeo's snow-white retinue.",
      appears: [1],
      rel: [{ to: "arawn", label: "pack of" }, { to: "pwyll", label: "driven off by" }] },

    { id: "white-horse", name: "Rhiannon's pale-white horse", role: "creature", alt: "march canwelw mawr aruchel", epithet: "the chase-without-catching",
      blurb: "The great pale-white horse Rhiannon rides past the Gorsedd Arberth three days in succession. Its pace is slow and steady — and yet no pursuer on foot or on the fastest horse in the realm can catch it; the faster the pursuer, the further it gets. The marvel is not in the horse's speed but in the relationship: the enchantment is structural, broken only by being asked rather than chased. Rhiannon's first reply to Pwyll's calling out names it precisely: <em>it had been better for the horse, if you had asked me long ago</em>. The Welsh tradition's horse-goddess iconography (Rīgantonā / Epona-cognate) made visible.",
      appears: [3],
      rel: [{ to: "rhiannon", label: "mount of" }] },

    { id: "mare-foal", name: "Teirnon's mare and the saved foal", role: "creature", alt: "y gassec a'r ebawl", epithet: "the recognition-token through the window",
      blurb: "Teirnon's mare — \"neither horse nor mare fairer in the kingdom\" — foals every May Eve, and every May Eve the foal is taken before Teirnon knows it. On the year of Pryderi's loss Teirnon sits up in arms; the foal is born; a great claw comes through the window; Teirnon strikes the arm off; the foal stays. The foal grows up alongside the boy: when Pryderi is four, the mare-foal — now broken in — is given to him as his first horse. It rides at his side back to Arberth, carrying the boy he was given the same night it was saved. The Welsh recognition-token in its purest form: not an inscribed object, but a fellow-survivor of the same May Eve.",
      appears: [6],
      rel: [{ to: "teirnon", label: "of the household of" }, { to: "pryderi", label: "given to" }, { to: "unseen-power", label: "preyed on by" }] },

    { id: "unseen-power", name: "The unseen power", role: "creature", alt: "(never named in the source)", epithet: "the claw at the window",
      blurb: "The never-named force that takes Teirnon's foals every May Eve and that takes Pryderi from his cradle the night he is born. It comes through windows in the dark; it screams when wounded; it flees into the night, unseen by Teirnon even in his pursuit. The Welsh prose offers no description, no name, no agent, no motive — only the action. <em>F320 fairies-abduct-mortals</em> at the Welsh threshold-hours (midnight in the cradle scene, twilight on May Eve); the cross-tale layer notes the cognate with Sir Orfeo's <em>F255.2</em> (taking at noon). The single Insular-folklore figure that crosses Pwyll's whole second half: one creature, two thefts, one cut stopping both.",
      appears: [5, 6],
      rel: [{ to: "pryderi", label: "abductor of" }, { to: "mare-foal", label: "yearly abductor of (the foals)" }, { to: "teirnon", label: "stopped by" }] },
  ],
};
