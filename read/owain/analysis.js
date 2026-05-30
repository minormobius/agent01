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
    // The bride won, the violated term, the descent into madness, the
    // lion-helper, and the closing liquidations are seeded as the
    // translation reaches each movement.
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
