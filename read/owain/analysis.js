/* Story graph — Owain, neu Iarlles y Ffynnon mapped onto Vladimir Propp's
   "Morphology of the Folktale" (1928): the 31 narrative functions of the
   wonder-tale.

   COMPLETE. The whole romance laid against Propp's spine — seven acts,
   twenty-six functions, from the court frame to the closing apotheosis —
   with each beat linked to the movement that realises it. The `absent`
   section reads the comparative payoff (which functions Welsh romance keeps,
   doubles, or refuses) against the sister tales. Loaded after tale.js;
   attaches to window.OWAIN. */
window.OWAIN = window.OWAIN || {};
window.OWAIN.propp = {
  intro: "Propp argued that wonder-tales, however different on the surface, drew their events from a single fixed sequence of <strong>31 functions</strong> — Absentation, Interdiction, Violation, the Donor, Struggle, Victory, Liquidation, Return, Recognition. <em>Owain</em> is the most romance-shaped tale in our corpus, and it traverses the spine twice: an <strong>ascending arc</strong> (the quest to the fountain, the won bride, the held office) and, after the hero breaks faith, a <strong>fall-and-redemption arc</strong> (madness, the healing donor, the lion-helper, a chain of rescues, reconciliation). The hinge between them is a violated interdiction — the term his wife sets and Owain overstays — which makes <em>Owain</em> the clearest case in the corpus of Propp's β/γ/δ (Interdiction → Violation → first Villainy) driving the whole back half of a tale. Below, the movements are laid against the spine as they are translated; the comparative payoff (which functions Welsh romance keeps, doubles, or refuses) is read against Pwyll, Culhwch, Gawain, and Orfeo in the <a href=\"/pendragon/\">Pendragon crosswalk</a>.",
  acts: [
    { id: "frame",    label: "The court frame; Cynon's tale",        color: "#c9a24a" },
    { id: "quest",    label: "Owain's quest to the fountain",        color: "#6f9ac9" },
    { id: "bride",    label: "The won bride; the held fountain",     color: "#c97f9a" },
    { id: "return",   label: "Arthur's company; the recognition",   color: "#b07a4b" },
    { id: "fall",     label: "The broken term; madness",            color: "#9a6f9a" },
    { id: "lion",     label: "The lion; the chain of rescues",      color: "#7fb37f" },
    { id: "close",    label: "The Countess regained; the close",    color: "#c9a24a" },
  ],
  moves: [
    // ── Act 1: frame ─────────────────────────────────────────────
    { act: "frame", sym: "α", node: "Setting", name: "Initial situation", gloss: "The court and the heroes are introduced.",
      realized: "Arthur's court at Caer Llion ar Wysc: the emperor dozing on his dais of rushes, Owain, Cynon and Cei together, Gwenhwyfar's maids at the window, Glewlwyd keeping a gate that needs no keeping. The marvels will be reported before they are lived — the Welsh romance frames its adventure as a tale told at the hearth.", passage: 1 },
    { act: "frame", sym: "a", node: "The reported lack", name: "Lack (deferred)", gloss: "A want or wrong is named, here at one remove.",
      realized: "The hand-off from Owain to Cynon sets up the romance's engine: Cynon will tell of a defeat at the magic fountain (Movement II), and that reported humiliation becomes the lack Owain rides out to repair. The tale's deep structure is a relay — one knight's shame is the next knight's quest.", passage: 1 },
    { act: "frame", sym: "D", node: "The reported donor", name: "Donor (embedded)", gloss: "A donor figure tests the hero and points the way.",
      realized: "Inside Cynon's tale, the donor sequence runs twice over: the courteous yellow-clad host who lodges, feeds and re-clothes the knight and then — reluctantly — gives the directions, and the monstrous keeper of beasts who points the last stage of the road to the fountain. The Welsh romance splits Propp's donor into a courtly half and a wild half; Owain will pass the same two donors again in Movement III.", passage: 2 },
    { act: "frame", sym: "A↓", node: "The reported defeat", name: "Villainy / the humbling", gloss: "The harm that opens (here, hardens) the tale.",
      realized: "Cynon raises the storm, the Black Knight answers, and Cynon is unhorsed and stripped of his mount — not even thought worth capturing. The defeat is reported, not lived; but it is what gives Owain's quest its object. The lack named in the frame is now a concrete shame at a nameable place, inside Arthur's own dominion, that no one has avenged.", passage: 2 },
    // ── Act 2: quest ─────────────────────────────────────────────
    { act: "quest", sym: "↑", node: "Departure", name: "Departure of the hero", gloss: "The hero leaves home on the quest.",
      realized: "After the meal Owain slips away in silence, arms himself at dawn, and rides out alone across \"the ends of the earth and desert mountains\" — telling no one at court. The Welsh hero's departure is secret and solitary, the inverse of Cynon's boastful youth: he acts where Cynon only spoke.", passage: 3 },
    { act: "quest", sym: "DEF", node: "The donors, passed again", name: "Donor sequence (lived)", gloss: "The hero meets the donor(s) and is given the means.",
      realized: "Owain passes the same two donors Cynon described — the courteous yellow host and the monstrous keeper of beasts — but lives them rather than dreads them: the maidens are lovelier, the welcome warmer, and \"the black man's size pleased Owain\" where it had only awed Cynon. The road that humbled the first knight equips the second.", passage: 3 },
    { act: "quest", sym: "H", node: "Struggle", name: "Struggle with the villain", gloss: "Hero and villain join in direct combat.",
      realized: "Owain raises the storm with the bowl, and the Black Knight answers; they break both lances, draw swords, and hew. Where Cynon was unhorsed at the first onset, Owain stands and trades blows — the same encounter, told in nearly the same words, turning the opposite way.", passage: 3 },
    { act: "quest", sym: "I", node: "Victory", name: "Victory over the villain", gloss: "The villain is defeated.",
      realized: "Owain's stroke goes through helm, headpiece and coif, through skin, flesh and bone, to the brain: a mortal wound. The fountain's defender turns and flees, dying. The victory is also the act that makes the widow — the prize and the problem of the rest of the tale.", passage: 3 },
    { act: "quest", sym: "(Pr↺)", node: "The trap", name: "Pursuit inverted — the hero caged", gloss: "A reversal: the victor is himself ensnared.",
      realized: "Owain chases the dying knight to the gate of a great shining castle; the portcullis drops, shears his horse in two behind the saddle and the rowels from his heels, and shuts him between the two gates. Propp's Pursuit is inverted — it is not the villain who is chased and trapped, but the victor. The Welsh romance ends the movement on the cage, and turns the rescue over to a woman (Movement IV).", passage: 3 },
    // ── Act 3: bride ─────────────────────────────────────────────
    { act: "bride", sym: "F", node: "Magical agent", name: "The helper and the token", gloss: "The hero receives a magical agent / helper.",
      realized: "Luned — the donor-as-rescuer — gives Owain the ring of invisibility (\"as long as you hide it, it will hide you\") and a plan; it carries him out of the cage, past the household come to kill him, into the painted chamber. In this tale the hero survives not by his own strength but by a woman's gift and a woman's wit. The lion-helper of the second half answers this first helper.", passage: 4 },
    { act: "bride", sym: "a²", node: "The new desire", name: "Lack (love)", gloss: "A fresh lack opens the next arc.",
      realized: "Hidden by the ring, Owain watches the Black Knight's funeral and falls in love with the chief mourner — the widow he has just made. The kindled love is a new lack that drives the rest of the ascending arc: to win the Countess. Love and killing are tied in one stroke, the knot Luned's embassy will untie.", passage: 4 },
    { act: "bride", sym: "M", node: "The mediation", name: "The task accomplished — by argument", gloss: "The lack is liquidated; here, by an advocate's wit.",
      realized: "Luned wins the bride not by the hero's deed but by her own: she argues the grieving Countess into necessity — the fountain must have a defender, only an Arthur's knight will serve, and the proof of Owain's fitness is that he killed the last defender. The donor-heroine of the Welsh tradition (cf. Rhiannon in <em>Pwyll</em>) does the structural work a male hero's quest usually does.", passage: 5 },
    { act: "bride", sym: "W*", node: "Wedding & accession", name: "Reward — marriage and kingdom", gloss: "The hero weds and ascends.",
      realized: "The magnates consent, bishops solemnise the marriage, the men of the earldom do Owain homage, and he holds the fountain for three years — unhorsing all comers, ransoming them, and sharing the takings until no lord is more beloved. The ascending arc closes at its summit: married, throned, famous. The Welsh makes plain that the lady and the office are one prize. From here the tale falls.", passage: 5 },
    // ── Act 4: return ────────────────────────────────────────────
    { act: "return", sym: "↓", node: "Return (by proxy)", name: "The court seeks the lost hero", gloss: "Movement toward the hero's recovery.",
      realized: "Three years on, Arthur is dying of <em>hiraeth</em> for the lost Owain; on Gwalchmei's counsel the household — three thousand, no national levy — rides out with Cynon as guide, retracing the now-familiar road (the yellow host, the keeper, the fountain). The Return is inverted: the hero does not come home; home comes for him.", passage: 6 },
    { act: "return", sym: "Q", node: "Recognition", name: "The hero is recognised", gloss: "The unrecognised hero is known again.",
      realized: "Cei raises the storm and is twice unhorsed; the whole Round Table falls one by one to the unknown black defender — who is Owain. Only Gwalchmei, in a borrowed robe that hides him too, lasts three days against his own cousin, until a blow bares his face and the two know each other. Arthur dissolves their courteous deadlock — \"give me both swords, and neither has beaten the other.\" A double recognition, each man hidden from the other.", passage: 6 },
    { act: "return", sym: "γ", node: "Interdiction set", name: "The term granted", gloss: "A condition is laid down — the seed of the violation.",
      realized: "The feast three years in the making is eaten in three months; then Arthur asks the Countess to lend Owain for three months, to show him to the nobles of Britain, and she grants it \"though it was hard for her.\" The term is set. Propp's interdiction (γ) is in place; the whole fall turns on Owain failing to keep it.", passage: 6 },
    // ── Act 5: fall ──────────────────────────────────────────────
    { act: "fall", sym: "δ", node: "Violation", name: "The term broken", gloss: "The interdiction is broken; the hinge of the tale.",
      realized: "Three months become three years; Owain never returns to the fountain. The reckoning rides into the feast at Caer Llion: a messenger strips the ring from his hand and names him deceiver, traitor, false, shamed, beardless. The violated term (δ) is the single hinge on which the whole back half turns — the one Propp interdiction-and-violation the Welsh romance fully commits to, and the engine it shares with Chrétien's <em>Yvain</em>.", passage: 7 },
    { act: "fall", sym: "A↓↓", node: "The nadir", name: "Self-villainy — the madness", gloss: "The hero is undone, here by his own fault.",
      realized: "Owain flees court for the wastes, his clothes rotting, his body wasting, long hair growing over him, living among the deer until even they leave him — the Brittonic <em>gwyllt</em>, the wild man whose reason is lost to guilt. The villainy that opens the redemptive arc is self-inflicted; there is no external villain to blame, only the broken word.", passage: 7 },
    { act: "fall", sym: "RS", node: "Rescue / cure", name: "The healing donor", gloss: "A donor restores the fallen hero.",
      realized: "The widowed Countess of the park has the wasted Owain anointed with a flask of precious balsam (poured out whole by her kind maid) and nursed three months back to health, \"fairer than before.\" The first Countess caused his fall; the second heals it — the romance's exact symmetry. The three-month cure answers the three-month leave he failed to keep.", passage: 7 },
    { act: "fall", sym: "↑grat", node: "The first repayment", name: "Gratitude returned", gloss: "The healed hero repays his debt by deed.",
      realized: "Hearing that a young earl besieges his healer for refusing to wed him, Owain borrows her arms and plucks the earl bodily from his saddle, winning back her two earldoms — \"your requital for the blessed ointment.\" The first link in the back half's chain of grateful rescues; he then rides on, refusing all reward. The lion (Movement VIII) is the next debt repaid.", passage: 7 },
    // ── Act 6: lion ──────────────────────────────────────────────
    { act: "lion", sym: "F-an", node: "The grateful helper", name: "The lion gained", gloss: "A helper attaches itself to the hero.",
      realized: "Owain frees a jet-black lion from a serpent's coils, and the beast follows him \"like a greyhound he had reared\" — fetching fuel, killing a roebuck, keeping watch. Propp's helper-slot, filled in the Welsh sister-tales by kin or the Oldest Animals, is filled here by a beast bound only by gratitude (B301 / ATU 156). The lion is loyalty made visible, the exact moral mirror of the faith Owain broke.", passage: 8 },
    { act: "lion", sym: "K×2", node: "The chain of rescues", name: "Liquidations — debts repaid", gloss: "The lacks are made good, in series.",
      realized: "Two combats in one movement, told to the same pattern: the man-eating giant who has seized the hospitable Earl's sons, and the two pages burning Luned at the stake. In each the enemy refuses to fight \"the beast,\" Owain shuts the lion away out of honour, is overmatched, and the lion bursts through wall or gate to save him. The sons are restored; Luned — who once vouched for Owain with her freedom — is delivered at the last hour. The oldest debt of all is paid.", passage: 8 },
    { act: "lion", sym: "(Mᵒ)", node: "The unrecognised champion", name: "Owain fights as 'in his stead'", gloss: "The hero acts under a borrowed identity.",
      realized: "Owain offers to fight the pages \"in Owain's stead\" — defending his own name without giving it, the inverse of the disguised combats of Movement VI. \"Owain's full strength had not yet come back\": the healed man still leans on his lion, and the tale says so plainly. The recognition proper, and the Countess regained, wait for Movement IX.", passage: 8 },
    // ── Act 7: close ─────────────────────────────────────────────
    { act: "close", sym: "W", node: "Wedding restored", name: "The Countess regained", gloss: "The hero is reunited with the bride.",
      realized: "Owain goes back, takes the Countess, and brings her to Arthur's court — \"and she was his wife as long as she lived.\" Where Chrétien spends a long, knife-edged scene on the reconciliation, the Welsh dispatches Propp's restoration in a single sentence: the deed has already proved the man, so the marriage needs no further words. The reticence is the Welsh romance's signature, shared with the terse closes of Pwyll and Culhwch.", passage: 9 },
    { act: "close", sym: "H–I–K", node: "The last rescue", name: "The Black Oppressor; the freed ladies", gloss: "A final struggle, victory, and liquidation.",
      realized: "The last debt of the road: Owain (the lion at his side until the victory) subdues the Black Oppressor, the murderous host whose hall is a charnel-house, and spares him on his vow to keep it as a hospice. The twenty-four despoiled ladies are freed, their goods restored, and brought to Arthur's court. His victory was foretold (<em>darogan</em>) — the romance hero written into the future of the place he mends.", passage: 9 },
    { act: "close", sym: "↑↑W°", node: "Apotheosis", name: "The hero at his height", gloss: "The hero ascends to a higher station.",
      realized: "Owain dwells at Arthur's court as <em>penn-teulu</em>, head of the household, dear to the king, until he goes to his own dominions — the three hundred swords of the kindred of Cynfarch and the Flight of Ravens — and wherever he goes with them, he is victorious. The tale ends not on the marriage but on the war-band, returning its romance hero to the older heroic world of the Hen Ogledd, and signs off with its title-formula: <em>chwedyl Iarlles y Ffynnawn</em>.", passage: 9 },
  ],
  absent: {
    note: "With the whole romance now rendered, Owain's distinctive Propp profile (relative to the Welsh sister-tales) rests on three features:",
    groups: [
      { label: "Interdiction & Violation drive the tale", syms: "γ δ", text: "Unlike Pwyll, Culhwch, or Orfeo — where no interdiction governs the plot — <em>Owain</em> turns on one: the term the Countess sets for her husband's absence, which Owain overstays. The violated interdiction (γ→δ) is the hinge that topples the whole back half of the tale into the fall-and-redemption arc. The most Continental-romance feature in the corpus." },
      { label: "The spine traversed twice", syms: "A…W ×2", text: "An ascending arc (quest → won bride → held office) and a descending-then-redemptive arc (madness → donor → helper → rescues → reconciliation). Pwyll braids three arcs across two heroes; Owain runs two arcs through one hero, joined at a moral fault-line rather than a generational one." },
      { label: "The grateful-helper animal", syms: "the lion (helper)", text: "Propp's helper-slot is filled by a beast bound to the hero by gratitude rather than magic or kinship — a feature absent from the Welsh sister-tales (whose helpers are the Oldest Animals of Culhwch, the donor-heroine of Pwyll) and shared instead with the international grateful-animal tradition (ATU 156 / B301)." },
    ],
    verdict: "Where the native Welsh tales (Pwyll, Culhwch) refuse the indelible mark and the governing interdiction, <em>Owain</em> — the tale with a French twin — accepts both, and builds its whole second half on a broken promise and a beast's kept faith: the spine traversed twice, joined at the violated term, with a grateful animal in the helper-slot. That contrast is exactly the Welsh↔Continental seam the Pendragon evolutionary tree exists to trace.",
  },
};

/* ── Desire (Greimas's actantial model). *Ref fields → cast ids for the Mythograph. */
window.OWAIN.desire = {
  intro: "Beneath the morphology runs the engine the morphology brackets out: <strong>desire</strong>. Greimas read every tale as six actants on three axes — a Subject who wants an Object, a Sender who dispatches it toward a Receiver, and a Helper and Opponent who aid and block the wanting. Distinct from the Character web (who is bound to whom), this is the single structure of <em>wanting</em> — and Owain's is the one desire that has to reach its Object twice.",
  subject: "Owain", subjectRef: "owain",
  object: "the Lady of the Fountain won — and, after he breaks faith and runs mad, won back",
  value: "knighthood proven at the storm-spring, and the broken word redeemed",
  sender: "Cynon's tale of the fountain, and Cei's mockery, that sting Owain to ride", senderRef: "cynon",
  receiver: "Owain — and the Countess's land, kept by a defender", receiverRef: "owain",
  helpers: [
    { name: "Luned", ref: "luned", note: "the cleverest figure in the tale — the ring of invisibility, the embassy that wins the Countess, the rescue from the stake; she remakes his life twice" },
    { name: "the lion", ref: "lion", note: "the grateful animal helper, loyalty made flesh — and the moral mirror of the faith Owain himself breaks" }
  ],
  opponent: "the Black Knight of the fountain — and, in the back half, Owain's own broken word", opponentRef: "black-knight",
  unreachable: false,
  note: "Owain is the corpus's one hero whose desire reaches its Object twice — because he loses it once by his own fault. He wins the Lady, overstays the term he swore, runs mad in the wilderness, and must win her back through a chain of grateful rescues. The Opponent doubles inward: the Black Knight guards the Object at first, but in the back half the true opponent is Owain's own faithlessness, made visible when Luned's ring is stripped from his finger. The arrow reaches — but only after it has fallen."
};

/* ── Theme (Parry–Lord oral type-scenes). */
window.OWAIN.themes = [
  { id: "feast", label: "the feast in hall", passage: 1,
    note: "Arthur's court at Caerleon, where the tale is asked and told over the mead and the meat — the hall set-piece as the romance's frame; mirrored by the Countess's hall and the Black Oppressor's deadly welcome (Movement IX).",
    lines: "Cei fetching the flagon and the skewers; the asking of a tale" },
  { id: "threshold", label: "the crossing / the marked place", passage: 2,
    note: "The fountain under the great tree, with its slab and silver bowl: pour the water and the storm comes, and the Black Knight rides to answer — the threshold-rite at the marked place where the Otherworld answers.",
    lines: "the bowlful thrown on the slab; the tempest that strips the wood" },
  { id: "council", label: "the council in hall", passage: 5,
    note: "The Countess calls her people together to take counsel over keeping the fountain — the assembly type-scene that Luned engineers into a marriage with her lord's killer.",
    lines: "the gathered nobles; the agreement to wed the champion who can hold the spring" },
  { id: "lament", label: "the lament / the wild man", passage: 7,
    note: "His word broken and his ring stripped, Owain runs mad and naked into the wastes, living among the deer — grief past speech, the corpus's one descent into the gwyllt.",
    lines: "the clothes rotting from him; the hair grown over him; the deer his only company" }
];
