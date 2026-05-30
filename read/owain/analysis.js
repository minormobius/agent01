/* Story graph — Owain, neu Iarlles y Ffynnon mapped onto Vladimir Propp's
   "Morphology of the Folktale" (1928): the 31 narrative functions of the
   wonder-tale.

   SKELETON IN PROGRESS. The frame and the opening functions are seeded so
   the spine, the cards, and the mythograph render from Movement I; the full
   morphology — Owain's departure, the donor sequence at the fountain, the
   two struggles (Black Knight; later the unwitting duel with Gwalchmei), the
   broken interdiction and the descent into madness, the lion-helper, and the
   chain of liquidations that close the tale — is laid in as the translation
   reaches each movement. The `absent` section below is provisional and will
   be finalised once the whole text is rendered. Loaded after tale.js;
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
    // The violated term (δ), the descent into madness, the lion-helper, and the
    // closing liquidations are seeded as the translation reaches each movement.
  ],
  absent: {
    note: "<em>Provisional — to be finalised once the full text is rendered.</em> On the evidence of the frame and the known shape of the romance, Owain's distinctive Propp profile (relative to the Welsh sister-tales) is shaping up around three features:",
    groups: [
      { label: "Interdiction & Violation drive the tale", syms: "γ δ", text: "Unlike Pwyll, Culhwch, or Orfeo — where no interdiction governs the plot — <em>Owain</em> turns on one: the term the Countess sets for her husband's absence, which Owain overstays. The violated interdiction (γ→δ) is the hinge that topples the whole back half of the tale into the fall-and-redemption arc. The most Continental-romance feature in the corpus." },
      { label: "The spine traversed twice", syms: "A…W ×2", text: "An ascending arc (quest → won bride → held office) and a descending-then-redemptive arc (madness → donor → helper → rescues → reconciliation). Pwyll braids three arcs across two heroes; Owain runs two arcs through one hero, joined at a moral fault-line rather than a generational one." },
      { label: "The grateful-helper animal", syms: "the lion (helper)", text: "Propp's helper-slot is filled by a beast bound to the hero by gratitude rather than magic or kinship — a feature absent from the Welsh sister-tales (whose helpers are the Oldest Animals of Culhwch, the donor-heroine of Pwyll) and shared instead with the international grateful-animal tradition (ATU 156 / B301)." },
    ],
    verdict: "<em>Verdict pending the full translation.</em> The working thesis: where the native Welsh tales (Pwyll, Culhwch) refuse the indelible mark and the governing interdiction, <em>Owain</em> — the tale with a French twin — accepts both, and builds its second half on a broken promise and a beast's kept faith. That contrast is exactly the Welsh↔Continental seam the Pendragon evolutionary tree exists to trace.",
  },
};
