/* The motif index — Sir Orfeo classified against the folklorists' "Dewey
   decimal": the Thompson Motif-Index (letter-classed call-numbers) and
   the Aarne-Thompson-Uther (ATU) tale-type index.

   The poem sits in three families at once: the classical Orpheus and
   Eurydice descent (radically transformed), the international "Man on a
   Quest for his Lost Wife" family (ATU 400), and the Celtic-Insular
   Otherworld-abduction tradition (Étaín, Pwyll, Tam Lin). The motif-level
   analysis lets us see how the Pearl-Poet's contemporary scrubs the
   classical pessimism, fits the international folk-quest shape, and
   imports the Celtic Otherworld whole.

   Where the same motif appears in our other annotated tales, the gloss
   notes the cross-reference; this is the first pass at a comparative
   motif layer across the read.mino.mobi corpus.

   This doubles as the second layer of the synergistic graph: each motif
   is a typed node, and its `passages` array is its set of EXHIBITS edges
   (motif → movement) in the shared annotation shape.

   Honesty: exact call-numbers are best-effort identifications, not the
   authoritative index. Each motif carries a confidence flag:
     high = well-attested code & application   med = code right, application interpretive
     spec = the number itself is a guess (shown by class letter where omitted).
   Attaches to window.ORFEO. */
window.ORFEO = window.ORFEO || {};
window.ORFEO.motifs = {
  intro: "Folklorists have their own Dewey decimal: the <strong>Thompson Motif-Index</strong> files every recurring story-atom under a letter-class and number (A mythological, D magic, F marvels, H tests, K deceptions, M ordaining the future, N chance & fate, Q reward & punishment, T love, Z formulas), while the <strong>ATU index</strong> classifies whole tale-types. Sir Orfeo sits at the meeting point of three traditions and the motif-level call-numbers show all three at once: the classical Orpheus and Eurydice (radically transformed), the international folk-quest family <em>ATU 400 The Man on a Quest for his Lost Wife</em>, and the Celtic-Insular Otherworld-abduction tradition (Étaín, Pwyll, Tam Lin). Where the same motif appears in <em>Sir Gawain and the Green Knight</em> on this site, the gloss notes the cross-reference — the first pass at a comparative layer across our annotated corpus.",
  taletypes: [
    { code: "Orpheus and Eurydice", name: "Classical descent — radically transformed", conf: "high",
      gloss: "Ovid (<em>Metamorphoses</em> X-XI) and Virgil (<em>Georgics</em> IV): a bard descends into Hades after his snake-bit wife and recovers her on condition he not look back; he looks back, loses her, and is dismembered by Maenads. Boethius (<em>Consolation</em> III.12) allegorised this in the 6th century; King Alfred translated Boethius's gloss into Old English in the 890s. Sir Orfeo inherits the framework but converts every load-bearing element: Hades → the Otherworld of Faerie; snakebite → a noon-time vision; the conditional contract → an unconditional binding rash promise; the backward look → scrupulously absent; dismemberment → a quiet ten-year mourning followed by a clean recovery. The change of antagonist (gods of the dead → the Fairy King) is the change of moral universe." },
    { code: "ATU 400", name: "The Man on a Quest for his Lost Wife", conf: "high",
      gloss: "The international folk-tale type for which Sir Orfeo is a clean and frequently cited example. A wife is taken from the husband (by abduction, by magic, by enchantment); the husband undertakes a long perilous quest; he reaches the place she is held; he wins her release by passing some test or making some bargain; they return together. The type accommodates very different antagonists (giant, ogre, fairy king, troll) and very different tests (combat, riddle, music, promise). Sir Orfeo's antagonist is the Fairy King and the test is musical performance + the moral leverage of a binding word — a particularly elegant variant." },
    { code: "Otherworld abduction", name: "The Celtic-Insular tradition — Étaín, Pwyll, Tam Lin", conf: "high",
      gloss: "The substrate that the Breton-lay layer welded onto the classical frame. The Otherworld in Sir Orfeo is not Hades and is not Christian Hell; it is a parallel kingdom, accessed through a particular threshold (rock-cleft, mound, hill, hawthorn), populated by a king with a queen and a court of snow-white riders, where time runs differently and the abducted are <em>held</em> rather than killed. The closest analogues are the taking of Étaín in <em>Tochmarc Étaíne</em> (Old Irish), Pwyll's year in Annwn in the First Branch of the <em>Mabinogi</em> (Welsh), and the later ballad <em>Tam Lin</em> (Scottish). The shared substrate is older than any of the literary texts and runs in folk-belief until well into the modern era." },
  ],
  classOrder: ["A", "D", "F", "H", "K", "M", "N", "Q", "T", "Z"],
  classes: { A: "Mythological", D: "Magic", F: "Marvels & the Otherworld", H: "Tests & tasks", K: "Deceptions", M: "Ordaining the future", N: "Chance & fate", Q: "Reward & punishment", T: "Love & marriage", Z: "Formulas & symbols" },
  list: [
    // — A · Mythological —
    { cls: "A", code: "A1450", name: "Origin of a lay / craft of harping", conf: "med", passages: [6],
      gloss: "The closing colophon: harpers in Britain heard the marvel and made of it a lay of good liking and named it after the king. Aetiological closure folded into the song. (Compare Gawain's A1654 in the closing adoption of the green sash as Round Table livery.)" },
    { cls: "A", code: "A186", name: "Demoted divinity walking as king", conf: "med", passages: [1, 2, 5],
      gloss: "Two moves in the same poem. (a) Pluto and Juno, named in the opening as Orfeo's ancestors, are immediately glossed: <em>that sum time were as godes y hold</em> — were <em>held</em> for gods, demoted by the lay's own framing from gods to ancient kings. (b) The Fairy King is named <em>king o fairy</em> without any Christian framing — a divinity in all but the word, ruling his own kingdom with his queen and court. The poem allows the pre-Christian power to stand under a fae name, where it cannot stand under the classical names." },

    // — D · Magic —
    { cls: "D", code: "D1275", name: "Magic music charms all hearers", conf: "high", passages: [3, 5, 6],
      gloss: "The classical core preserved: Orpheus's music charms the beasts. Sir Orfeo carries the motif through three audiences with three different effects — the wild beasts of the wilderness (gather while he plays, leave when he stops); the Fairy King's court (lay at his feet, the king's good will <em>outlasts</em> the song); the steward's hall (the harp is recognised before the man). The same gift, three resolutions; the poem's argument about what music actually does." },
    { cls: "D", code: "D1810.8", name: "Magic dream-vision: warning", conf: "high", passages: [1, 2],
      gloss: "Heurodis falls asleep at noon under the ympe-tree and wakes screaming. In the vision she has just had, the Fairy King's two scouts came to her, then the king himself with his retinue, and named the next morning at the same tree as the date of her abduction. The vision is half-prophecy and half-summons — the taking begins with the warning." },
    { cls: "D", code: "D900", name: "Magic place of fairy-frequenting", conf: "high", passages: [1, 2],
      gloss: "The <em>ympe-tree</em> — a grafted/doubled orchard tree, two trunks twisted into one. In medieval English folk-belief such trees were known fae-frequenting spots; Heurodis sleeps under one at noon, the most dangerous hour, in the most open place. Every condition for being taken." },
    { cls: "D", code: "D1361.17", name: "Magic invisibility / sudden vanishing", conf: "med", passages: [2],
      gloss: "From the very middle of a locked shield-wall around the ympe-tree, the queen is twitched away in a single instant. The thousand knights see nothing. Fae-taking by sudden vanishing — no physical force, no warning, no resistance possible." },

    // — F · Marvels & the Otherworld —
    { cls: "F", code: "F320", name: "Fairies abduct mortals to fairyland", conf: "high", passages: [2],
      gloss: "The poem's central act. Heurodis taken <em>with fairi forth y nome</em>. The classical Orpheus's antagonist is Death itself; Sir Orfeo's antagonist is a king of a parallel realm whose rules and protocols are intact and bindable." },
    { cls: "F", code: "F255.2", name: "Fairies take at noon / under-tide", conf: "high", passages: [1, 3, 6],
      gloss: "The central temporal motif. Heurodis is abducted at the noon hour. Orfeo's three apparitions in the wilderness all come <em>in hot under tides</em> — at the same hour. He enters his own city in disguise <em>ogain none tide</em> — at the same hour. Noon is the hour when the membrane between worlds is thinnest, and the poem returns to it three times for major thresholds." },
    { cls: "F", code: "F156", name: "Door to Otherworld in a cleft of rock", conf: "high", passages: [4],
      gloss: "The threshold. A great rock with a vertical cleft, three miles through solid stone, opens onto the bright country of the Otherworld. (Compare Gawain's F156 the Green Chapel as a hollow barrow with three openings — the same motif, two different terrain forms.)" },
    { cls: "F", code: "F151.1", name: "Perilous path to the Otherworld", conf: "med", passages: [4],
      gloss: "Three miles of dark solid stone. Orfeo spares neither stub nor stone — no physical obstacle holds him. The poet treats the impossible as a fact of geography." },
    { cls: "F", code: "F771.6", name: "Castle of crystal / precious stones", conf: "high", passages: [4],
      gloss: "Outer wall of clear crystal; a hundred towers stoutly battlemented; buttresses arching out of the moat in red gold; cornice carved with every manner of beast; inner chambers all of precious stones; the worst pillar of burnished gold. The poet stacks superlatives and then climaxes on the most uncanny detail — see below." },
    { cls: "F", code: "F165.6", name: "Ever-light Otherworld lit by jewels", conf: "high", passages: [4],
      gloss: "<em>Al that lond was ever light, for when it schuld be therk and night, the riche stones light gonne, as bright as doth at none the sonne.</em> The castle's gems give out their own light at night, as bright as noonday sun. The Otherworld has no nightfall — and the noon hour is its perpetual condition. The temporal motif of F255.2 (taking at noon) becomes the spatial condition here." },
    { cls: "F", code: "F243", name: "Single-jewel crown of the Otherworld king", conf: "med", passages: [2, 5],
      gloss: "The Fairy King's crown is named in Heurodis's vision: <em>it nas of silver, no of gold red, ac it was of a precious ston — as bright as the sonne it schon.</em> No metal — one stone. The Otherworld king's signature regalia. Both king and queen wear the same kind of crown in Movement V, shining beyond the bearable." },
    { cls: "F", code: "F252", name: "The Otherworld court", conf: "high", passages: [2, 3, 4, 5],
      gloss: "A hundred snow-white knights and a hundred milk-white damsels, a Fairy King and a Fairy Queen on thrones in a tabernacle of light, a porter at the crystal gate, an inner court of courtiers, attendants, and the silent half-taken. The Otherworld is built as a real court with real protocol — which is exactly what makes it bindable." },
    { cls: "F", code: "F379.1", name: "The half-taken — body remains as if dead while self is in fairyland", conf: "high", passages: [4],
      gloss: "The poem's distinctive contribution to the Otherworld tradition. <em>Of folk that were thider y brought, and thought dede and nare nought</em> — thought to be dead, and weren't. Inside the castle wall: figures held in the postures they were taken in — some headless, some bound and mad, some armed on horseback, some choked while eating, some drowned, some shrivelled by fire, women in childbed, sleeping at noon. The bodies stayed in the upper world (presumably buried); the selves are held here, frozen in the instant of trauma. Not the dead. Not the damned. The half-taken." },
    { cls: "F", code: "F230", name: "Appearance of the fairy court in our world", conf: "high", passages: [2, 3],
      gloss: "The retinue spills through the membrane: in Heurodis's vision, the hundred snow-white riders; in Orfeo's wilderness, three apparitions at noon (a hunt with no kill, a host with no destination, a dance with minstrelsy); and the sixty hawking ladies whose path Orfeo follows to the rock-cleft." },
    { cls: "F", code: "F375", name: "Mortal returns from fairyland alive and unchanged", conf: "high", passages: [5, 6],
      gloss: "Heurodis is recovered intact — no aging, no madness, no condition. The poem firmly refuses both the classical \"you lose her at the threshold\" outcome and the folk-tradition \"a hundred years have passed while you were gone\" outcome. She walks out the same lady she walked in, and the steward at Winchester is still the steward Orfeo named ten years ago." },

    // — H · Tests & tasks —
    { cls: "H", code: "H1556", name: "Test of fidelity (of a servant)", conf: "high", passages: [6],
      gloss: "The steward's test in Movement VI. Orfeo, unrecognised, tells the steward the lying tale of his own death — and watches what the steward does. Total grief. <em>That was mi lord, sir Orfeo!</em> The barons must lift him with the formula <em>there is no remedy for a man's death.</em> The test passes itself. (Compare Gawain's H1556, where the exchange-of-winnings tests Gawain himself; here it is the hero who tests, and the keeper of the throne who is tested.)" },
    { cls: "H", code: "H1242", name: "Hero brings back lost person from the Otherworld", conf: "high", passages: [5, 6],
      gloss: "The poem's whole task, completed in the binding-rebuke scene. The test passed not by combat or riddle but by holding the antagonist to the form of his own word." },
    { cls: "H", code: "H1554", name: "Test of curiosity (the recognised harp)", conf: "med", passages: [6],
      gloss: "After the harping at the steward's feast, the steward sees the harp and recognises it before he recognises the man. He has to ask: <em>where hadestow this harp, and hou?</em> The curiosity sets up the lying tale and the steward's test." },

    // — K · Deceptions —
    { cls: "K", code: "K1812", name: "King in disguise", conf: "high", passages: [5, 6],
      gloss: "Orfeo carries three disguises in succession. (a) At the Fairy King's gate: <em>Icham a minstrel lo, to solas thi lord with my gle.</em> (b) On returning to Winchester: at the town's edge with a beggar, <em>as a minstrel of pover liif</em>. (c) Into the city in the borrowed beggar's clothes. Each disguise is sincere as a working description; none is a lie. The poet is careful." },
    { cls: "K", code: "K1837", name: "Disguise as harper / minstrel", conf: "high", passages: [4, 5, 6],
      gloss: "The minstrel-disguise specifically. Music is the universal passport — the porter at the Otherworld asks no further question, and the steward at Winchester welcomes every good harper for the king's sake. The same disguise opens the door of the antagonist and of the loyal servant." },
    { cls: "K", code: "K1971", name: "Hero in disguise tests faithful servant", conf: "high", passages: [6],
      gloss: "The Odyssean motif — Odysseus in beggar's rags tests Eumaeus and Eurycleia in <em>Odyssey</em> XIX. Sir Orfeo executes the same logic with the same precision, with a steward instead of a swineherd. The poem is much closer here to Homer than to anything classical-Orphic." },

    // — M · Ordaining the future —
    { cls: "M", code: "M223", name: "The rash promise", conf: "high", passages: [5],
      gloss: "The hinge of the rescue. After Orfeo's harping, the Fairy King: <em>now aske of me what it be — largelich Ichil the pay; now speke, and tow might asay.</em> Asked in the fairest possible form — speak, and you may put it to the proof. The king does not know what he is committing to. (Compare Gawain's M223 — Arthur granting Bertilak's challenge before he hears the terms, and Bertilak's exchange-of-winnings on the same form. The motif is one of the cleanest bridges between the two poems on this site.)" },
    { cls: "M", code: "M201", name: "Pledge given — and held on honour", conf: "high", passages: [5],
      gloss: "When the Fairy King refuses to give up Heurodis on grounds of taste, Orfeo binds him with the form: <em>yete were it a wele fouler thing to here a lesing of thy mouthe.</em> A lie from the king's mouth would be a worse loathliness than any couple. The pledge holds; the king yields. Music charmed the door open; honour walked them out." },
    { cls: "M", code: "M341", name: "Death foretold by a condition", conf: "med", passages: [2],
      gloss: "The Fairy King's threat in the vision: come tomorrow at the ympe-tree, or be fetched and torn limb from limb. Even resistance leads to the same outcome — the bargain is one-sided. The taking is fated." },

    // — N · Chance & fate —
    { cls: "N", code: "N886", name: "Recognition by an instrument", conf: "high", passages: [6],
      gloss: "The steward recognises the harp before he recognises the man. The instrument is the through-line of the poem — the single object Orfeo refused to give up, and the single object that closes the Odyssean recognition. The hero is what he carries." },
    { cls: "N", code: "N825.3", name: "Old person as helper at the threshold", conf: "high", passages: [6],
      gloss: "The Winchester beggar at the town's edge, in his narrow hut. Gives Orfeo lodging, tells him the city's news, lends him the clothes for the next morning's disguise, and houses Heurodis until she is brought into the city in procession. The smallest figure with the most door-keeping to do." },
    { cls: "N", code: "N777", name: "Adventure follows from the hunt", conf: "high", passages: [3, 4],
      gloss: "The sixty hawking ladies are an Otherworld hunt; Orfeo, after a decade in the wild, laughs at the sight and follows. The hunt leads him to the wordless meeting with Heurodis and then, when the ladies ride home, straight into the rock-cleft. The hunt-as-threshold to adventure preserved cleanly." },

    // — Q · Reward & punishment —
    { cls: "Q", code: "Q40", name: "Kindness rewarded — the steward made heir", conf: "high", passages: [6],
      gloss: "The steward, who held the kingdom faithfully for ten years and grieved without dissembling at the false news of Orfeo's death, is named heir to the throne in the conditional reveal. Loyalty in absence rewarded with the kingdom in fullness." },
    { cls: "Q", code: "Q450", name: "Punishment of villain — absent here", conf: "high", passages: [5],
      gloss: "The single most striking <em>absence</em> in the poem. The Fairy King is not punished; he is constrained. He yields to the binding word and the poem moves on. (Compare Gawain, where the Green Knight similarly is not punished but at least is unmasked as Bertilak; here the Fairy King's mask is also his face, and the poem accepts that he goes on being the king of a different country.)" },

    // — T · Love & marriage —
    { cls: "T", code: "T211", name: "Faithful husband (to wife in fairyland)", conf: "high", passages: [3, 4, 5, 6],
      gloss: "Ten years on bark and roots without considering remarriage (<em>never eft y nil no woman se</em>); the wordless meeting where the look held and the tear fell; the journey through the cleft; the rescue; the carrying-back. The whole second half of the poem is the husband's faithfulness made action. (Note the explicit pre-emption of the classical Orphic looking-back: he does not look back, and the poet flags it: <em>right as he came the way he yede</em>.)" },
    { cls: "T", code: "T81.6", name: "Hero rescues abducted wife", conf: "high", passages: [4, 5],
      gloss: "The exact action the international tale-type ATU 400 is named for. Sir Orfeo's version is structurally pure: no test of strength, no riddle, no third party — only the hero's musical performance, his correct ask, and the binding of the antagonist's own word." },
    { cls: "T", code: "T68", name: "Bride/queen as prize won by a deed", conf: "med", passages: [5, 6],
      gloss: "The lay's deed-prize structure preserved, with one inversion: Heurodis is not a bride newly won but a wife restored. The poem's W (in Propp's sense) is re-coronation, not wedding." },

    // — Z · Formulas & symbols —
    { cls: "Z", code: "Z71.1", name: "Formulistic number: three", conf: "high", passages: [3, 5],
      gloss: "Three apparitions of the fae in the wilderness (hunt, host, dance — each reducing in martial weight). Three laments by Orfeo (at the bedside, in the wilderness, at the wordless meeting). Three harpings (wild beasts, Fairy King's court, steward's hall) with three distinct audience-effects. The poem keeps the three but does not lean on it heavily. (Compare Gawain, where Z71.1 is everywhere — three blows, three hunts, three temptations, three exchanges, three days, three kisses.)" },
    { cls: "Z", code: "Z71.5", name: "Formulistic number: ten", conf: "high", passages: [3, 6],
      gloss: "Ten years in the wilderness. Ten years the steward holds the kingdom. The poem's largest interval is the symmetrical decade — and what is held in faerie's stasis (Heurodis) and what is held in faithful service (the kingdom) are both held for the same length of time. The number is moral, not arithmetic." },
    { cls: "Z", code: "Z65", name: "Colour symbolism: white as Otherworld", conf: "med", passages: [2, 3, 4],
      gloss: "The Fairy King's retinue ride snow-white horses, with robes as white as milk. The Otherworld's colour is not green (Gawain's tradition) but <em>white</em> — the white of the milk-white horse, the white of the bone of the harp, the white of the crystal castle's walls. (Compare Gawain's pervasive Z65 green; Orfeo's Z65 is white. Two different fae-traditions, two different palettes.)" },
    { cls: "Z", code: "Z356", name: "The unique exception: the ever-light land", conf: "med", passages: [4],
      gloss: "The poet stops the catalogue of the Otherworld castle's wonders to mark the single most uncanny detail: <em>al that lond was ever light.</em> The land has no night. The stones give their own light when sun fails. The wonder named within the catalogue, separately from the catalogue's tally — Z356's classic pattern." },
  ],
};
