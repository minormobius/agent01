/* The cast of Owain, neu Iarlles y Ffynnon — the third stratum of the
   annotation layer. Each entry carries its role, the movements it appears
   in (links into the reading), and typed relationships (which seed the
   character web).

   COMPLETE. The full cast of the nine-movement romance — twenty figures
   across six roles — with appearance arrays keyed to the movements each is
   active in, and typed relationships that seed the character web and the
   mythograph. Attaches to window.OWAIN. */
window.OWAIN = window.OWAIN || {};
window.OWAIN.characters = {
  intro: "<em>Owain</em> braids a small principal cast against a wide gallery of figures who are named by office rather than by name — the Welsh romance's habit, shared with <em>Pwyll</em>, of letting role carry weight. At the centre: <strong>Owain</strong> son of Urien, the historical sixth-century North-British prince refashioned as Arthur's knight; <strong>Cynon</strong>, whose reported defeat sets the quest going; <strong>the Countess of the Fountain</strong>, the widow Owain makes and then weds; <strong>Luned</strong>, her quick-witted maid, the true engine of the plot; and <strong>the lion</strong>, the grateful beast whose loyalty measures Owain's redemption. Around them stand the court (Arthur, Cei, Gwalchmei, Gwenhwyfar, the porter Glewlwyd), the marvels of the road (the great black keeper of beasts, the Black Knight of the Fountain), and the figures of Owain's long wandering after his fall (the healing Countess of the park, the man-eating giant, the Black Oppressor and his twenty-four despoiled ladies).",
  roles: [
    { id: "principal",  label: "Principals",                       color: "#c9a24a" },
    { id: "court",      label: "Arthur's court at Caer Llion",     color: "#6f9ac9" },
    { id: "fountain",   label: "The fountain and its lady",        color: "#c97f9a" },
    { id: "road",       label: "Marvels and keepers of the road",  color: "#b07a4b" },
    { id: "creature",   label: "Creatures and helpers",            color: "#8aa363" },
    { id: "wander",     label: "Figures of the wandering road",    color: "#9a6f9a" },
  ],
  cast: [
    // — Principals —
    { id: "owain", name: "Owain ab Urien", role: "principal", alt: "Yvain (Chrétien); Owain mab Urien Rheged", epithet: "knight of Arthur's court; lord of the fountain; the knight of the lion",
      blurb: "The hero. A knight of Arthur's court who, stung by Cei's mockery and moved by Cynon's tale of defeat, rides alone to the magic fountain, pours the water, endures the storm, and meets and mortally wounds its Black Knight. Trapped in the dead man's castle, made invisible by Luned's ring, he falls in love with the widow he has just made and — through Luned's contrivance — weds her and takes up the fountain's defence. Then Arthur's company finds him; he returns to court for a visit, overstays the term his wife set, and loses everything: she sends a messenger to strip the ring from his finger, and he runs mad and naked into the wilderness. Healed by a noblewoman's ointment, companioned by a lion he saves from a serpent, he wins his way back through a chain of rescues to reconciliation. Historically <strong>Owain mab Urien</strong> was a real sixth-century king of Rheged in the Hen Ogledd (the Old North), praised in Taliesin's elegies — euhemerised demotion in reverse, a historical prince climbing into Arthurian romance.",
      appears: [1, 2, 3, 4, 5, 6, 7, 8, 9], pending: true,
      rel: [{ to: "countess", label: "husband of" }, { to: "luned", label: "saved by / saviour of" }, { to: "lion", label: "companion of" }, { to: "black-knight", label: "slayer of" }, { to: "cynon", label: "completes the quest of" }, { to: "arthur", label: "knight of" }, { to: "cei", label: "mocked by" }, { to: "gwalchmei", label: "fights unknowing" }] },

    { id: "cynon", name: "Cynon ab Clydno", role: "court", alt: "Calogrenant (Chrétien)", epithet: "the knight whose defeat opens the tale",
      blurb: "A knight of Arthur's court who, at Cei's prompting, tells the tale that frames the whole romance: how in his youth he rode out seeking adventure, was directed by a great black keeper of beasts to the magic fountain, poured the water, raised the storm, and was unhorsed and shamed by the fountain's Black Knight — riding home defeated and silent. His reported humiliation is the seed Owain takes up; the romance's deep structure is a relay, one man's defeat becoming another's quest. (In Chrétien he is Calogrenant.)",
      appears: [1, 2, 6], pending: true,
      rel: [{ to: "cei", label: "tells his tale at the prompting of" }, { to: "owain", label: "whose adventure Owain completes" }, { to: "black-knight", label: "defeated by" }, { to: "keeper", label: "directed by" }, { to: "arthur", label: "knight of" }] },

    { id: "countess", name: "The Countess of the Fountain", role: "fountain", alt: "Iarlles y Ffynnon; Laudine (Chrétien)", epithet: "the lady of the magic spring; the widow Owain makes and weds",
      blurb: "The title figure — <em>Iarlles y Ffynnon</em>, the Lady (Countess) of the Fountain. Widow of the Black Knight Owain kills, mistress of the castle and the magic spring whose defender must hold it against all comers. Persuaded by Luned's blunt logic — that she needs a champion to keep the fountain, and the man who beat her husband is the strongest available — she weds Owain and entrusts him with its defence. When Owain breaks his term and is lost, she takes back the ring she gave him; at the tale's end the two are reconciled. (In Chrétien she is Laudine.)",
      appears: [4, 5, 6, 9], pending: true,
      rel: [{ to: "owain", label: "wife of" }, { to: "luned", label: "served and counselled by" }, { to: "black-knight", label: "widow of" }] },

    { id: "luned", name: "Luned", role: "fountain", alt: "Lunete (Chrétien)", epithet: "the Countess's maid; keeper of the ring of invisibility",
      blurb: "The Countess's quick-witted handmaid and the true engine of the plot. She hides the trapped Owain, gives him the ring that makes its wearer invisible, feeds and shelters him, and then — by sheer force of argument — talks her grieving mistress into marrying the very man who killed her husband. Later, having defended Owain's name at court, she is imprisoned in a stone vault by two of the Countess's pages and condemned to burn unless a champion comes; the lion-companioned Owain arrives in time to save her, closing the circle of obligation. The cleverest figure in the romance. (In Chrétien she is Lunete.)",
      appears: [4, 5, 8, 9], pending: true,
      rel: [{ to: "countess", label: "maid and counsellor of" }, { to: "owain", label: "saviour of / saved by" }, { to: "ring", label: "keeper of" }] },

    { id: "lion", name: "The lion", role: "creature", alt: "the Knight of the Lion's lion", epithet: "the grateful beast; emblem of loyalty",
      blurb: "The romance's most famous image — the grateful lion Owain rescues from a serpent that has it by the tail, and which thereafter follows him \"like a greyhound he had reared,\" hunting for him, guarding his sleep, and fighting at his side. The lion is loyalty made visible: it measures, by contrast, the broken faith that drove Owain mad, and its companionship marks his moral recovery. It gives the Continental twin its title — <em>Yvain, le Chevalier au Lion</em>, the Knight of the Lion — and the sigil of this site.",
      appears: [8, 9], pending: true,
      rel: [{ to: "owain", label: "companion of" }] },

    { id: "black-knight", name: "The Black Knight of the Fountain", role: "fountain", alt: "Esclados the Red (Chrétien)", epithet: "the fountain's defender",
      blurb: "The dark champion who answers the storm whenever a traveller pours water on the fountain's slab — the defender Cynon could not beat and Owain mortally wounds. Husband of the Countess. His death creates the vacancy that Owain, through Luned, fills: to win the lady Owain must first take the dead man's office. (In Chrétien he is Esclados le Ros.)",
      appears: [2, 3, 4], pending: true,
      rel: [{ to: "countess", label: "husband of" }, { to: "owain", label: "slain by" }, { to: "cynon", label: "vanquisher of" }, { to: "fountain", label: "defender of" }] },

    { id: "fountain", name: "The fountain", role: "fountain", alt: "the storm-spring; the well of the Lady", epithet: "the magic storm-making spring",
      blurb: "The spring beneath the great green tree, with its marble slab and a silver bowl on a silver chain — pour a bowlful on the slab and a tempest breaks over the wood, and then the Black Knight rides to answer. The bounded Otherworld threshold the whole tale orbits: its guardian must be killed to be succeeded, so to win the Countess Owain must first take the fountain. A place, not a person, but the gravity-well of the cast — defended in turn by the Black Knight, raised by Cynon and by Owain, and held at last by Owain himself.",
      appears: [2, 3, 5, 6], pending: true,
      rel: [{ to: "black-knight", label: "guarded by" }, { to: "owain", label: "later held by" }, { to: "countess", label: "well of" }] },

    // — Arthur's court —
    { id: "arthur", name: "Arthur", role: "court", alt: "Yr Amherawdyr Arthur", epithet: "the emperor; lord of Caer Llion",
      blurb: "The emperor (<em>amherawdyr</em>) at whose court at Caer Llion ar Wysc the tale is told and to which it returns. He dozes while his men trade stories in the opening frame, and later leads the company that rides out to find the fountain — and Owain — bringing the hero back to court for the fateful visit that breaks his marriage-term.",
      appears: [1, 2, 6, 9], pending: true,
      rel: [{ to: "owain", label: "lord of" }, { to: "cei", label: "lord of" }, { to: "cynon", label: "lord of" }, { to: "gwenhwyfar", label: "husband of" }] },

    { id: "cei", name: "Cei ab Cynyr", role: "court", alt: "Sir Kay", epithet: "the sharp-tongued steward",
      blurb: "Arthur's seneschal, already the court's caustic edge — bargaining for his tale before he will serve the mead, and quick to mock. His gibes goad both Cynon and, later, Owain; in the romance's pattern of courtesy-as-friction he is the abrasive that sets the hero in motion. (The later Sir Kay.)",
      appears: [1, 2, 6], pending: true,
      rel: [{ to: "arthur", label: "steward of" }, { to: "cynon", label: "goads" }, { to: "owain", label: "mocks" }] },

    { id: "gwalchmei", name: "Gwalchmei ab Gwyar", role: "court", alt: "Gwalchmai; Gawain", epithet: "the courteous champion",
      blurb: "Arthur's nephew and the court's paragon of courtesy — and, in this tale, the knight who fights a long, evenly matched, unwitting combat against the disguised Owain when Arthur's company reaches the fountain, neither recognising the other until they name themselves. The same hero as our <em>Sir Gawain and the Green Knight</em>, seen here in his Welsh form.",
      appears: [6], pending: true,
      rel: [{ to: "owain", label: "fights unknowing" }, { to: "arthur", label: "nephew of" }] },

    { id: "gwenhwyfar", name: "Gwenhwyfar", role: "court", alt: "Guinevere", epithet: "the queen",
      blurb: "Arthur's queen, at needlework with her handmaids by the window in the opening frame. (Guinevere.)",
      appears: [1, 2], pending: true,
      rel: [{ to: "arthur", label: "wife of" }] },

    { id: "glewlwyd", name: "Glewlwyd Gafaelfawr", role: "court", alt: "Glewlwyd Mighty-Grasp", epithet: "the porter who is not a porter",
      blurb: "\"Mighty-Grasp\" — Arthur's porter in office though the text insists the court has none, here purely a figure of welcome. He keeps the same gate in <em>Culhwch ac Olwen</em>, where his function is the opposite: to bar it. The same name, the inverted role — one of the clean comparative seams between the two Red Book tales.",
      appears: [1], pending: true,
      rel: [{ to: "arthur", label: "porter of" }] },

    // — Marvels of the road —
    { id: "keeper", name: "The keeper of beasts", role: "road", alt: "the great black man of the wood", epithet: "the one-eyed, one-footed herdsman",
      blurb: "A huge black man seated on a mound in a forest clearing, one-eyed and one-footed, with an iron club, lord over all the wild animals of the wood — who gather and bow to him at his summons. He directs the questing knight (first Cynon, then Owain) to the magic fountain. A figure straight out of the older Insular Otherworld: the monstrous herdsman as threshold-guardian and giver-of-directions.",
      appears: [2, 3, 6], pending: true,
      rel: [{ to: "cynon", label: "directs" }, { to: "owain", label: "directs" }] },

    // — Creatures and tokens —
    { id: "ring", name: "The ring of invisibility", role: "creature", alt: "Luned's ring", epithet: "the token that conceals its wearer",
      blurb: "Luned's ring: turn the stone into the palm and close the hand, and \"as long as you hide it, it will hide you.\" It carries the trapped Owain out from between the castle gates, past the household come to kill him, and lets him watch the funeral — and the Countess — unseen. A token, not a character, but the hinge of Movement IV: the hero survives by a woman's gift and a woman's plan. The same ring is stripped from his finger in Movement VII, the public sign of his broken word.",
      appears: [4, 7], pending: true,
      rel: [{ to: "luned", label: "kept and given by" }, { to: "owain", label: "conceals" }] },

    // — Figures of the wandering road (the fall and after) —
    { id: "park-countess", name: "The Countess of the park", role: "wander", alt: "the widow with the balsam", epithet: "Owain's healer; the second widow",
      blurb: "The widowed Countess of the fairest park in the world, who finds the mad, wasted Owain by her lake and has him anointed with a flask of precious balsam \u2014 sevenscore pounds' worth, poured out all at once by her kind-hearted maid \u2014 and nursed back to health over three months. Owain repays her by capturing the young Earl who has seized her two earldoms and besieges her last castle for refusing to wed him. The mirror-image of the Countess of the Fountain: the first widow is the cause of Owain's fall, the second the agent of his recovery.",
      appears: [7], pending: true,
      rel: [{ to: "owain", label: "healer of" }, { to: "young-earl", label: "besieged by" }] },

    { id: "young-earl", name: "The young Earl", role: "wander", alt: "the besieging neighbour", epithet: "the suitor who makes war on a widow",
      blurb: "A young earl, neighbour to the Countess of the park, who has stripped her of two earldoms and besieges her last dwelling because she would not become his wife. Owain, newly healed, drags him bodily from his saddle and delivers him to the Countess; for his life the Earl restores the earldoms, and for his freedom gives half his lands, his treasure, and hostages. A dark mirror of Owain, who also won a widow's land by force.",
      appears: [7], pending: true,
      rel: [{ to: "park-countess", label: "besieger of" }, { to: "owain", label: "captured by" }] },

    { id: "earl-host", name: "The hospitable Earl", role: "wander", alt: "\"the most hospitable man in the world\"", epithet: "the grieving host of the towered castle",
      blurb: "The lord of the great towered castle, \"the most hospitable man in the world,\" whose house Owain finds drowned in grief: a man-eating giant has seized his two sons and demands his only daughter. Owain, with the lion, kills the giant and restores the sons. The grateful-host episode that pairs, in the same movement, with the saving of Luned.",
      appears: [8], pending: true,
      rel: [{ to: "owain", label: "saved by" }, { to: "giant", label: "tormented by" }] },

    { id: "giant", name: "The man-eating giant", role: "wander", alt: "the mountain monster", epithet: "the cannibal ogre of the mountain",
      blurb: "A man-shaped monster, no smaller than a giant, who kills and devours men on the mountain. He seizes the hospitable Earl's two sons at the hunt and demands the Earl's daughter on pain of slaying the sons before his eyes. When the giant balks at fighting \"the beast,\" Owain shuts the lion away out of honour and is overmatched — until the lion bursts out and tears the giant from shoulder to hip. The first of the back half's two mirror-combats over the lion.",
      appears: [8], pending: true,
      rel: [{ to: "owain", label: "slain by" }, { to: "earl-host", label: "tormentor of" }] },

    { id: "du-traws", name: "The Black Oppressor", role: "wander", alt: "y Du Traws; the Black Tyrant", epithet: "the robber-lord turned hospitaller",
      blurb: "<em>Y Du Traws</em> \u2014 the Black Oppressor, the last antagonist of the road: a robber-lord who drugs his guests at their welcome-feast, murders the men for their goods, and heaps his hall with corpses. He greets Owain with false-brotherly love; Owain overcomes and binds him, and spares his life on the vow that he will keep the charnel-house thereafter as a true hospice \"for the weak and the strong.\" His defeat was foretold (<em>darogan</em>). The dark mirror of every gracious host in the tale.",
      appears: [9], pending: true,
      rel: [{ to: "owain", label: "subdued by" }, { to: "ladies-24", label: "despoiler of" }] },

    { id: "ladies-24", name: "The twenty-four ladies", role: "wander", alt: "the daughters of earls", epithet: "the despoiled widows of the Black Oppressor's hall",
      blurb: "Four-and-twenty earls' daughters, the fairest ever seen, in rags worth less than twenty-four pence \u2014 widows of the men the Black Oppressor murdered at their welcome-feast, stripped of horses, clothes, gold and silver. Owain frees them, restores their goods, and brings them to Arthur's court, where each may stay or go as she wishes.",
      appears: [9], pending: true,
      rel: [{ to: "du-traws", label: "despoiled by" }, { to: "owain", label: "freed by" }] },
  ],
};
