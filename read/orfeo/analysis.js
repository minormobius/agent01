/* Story graph — Sir Orfeo mapped onto Vladimir Propp's "Morphology of the
   Folktale" (1928): the 31 narrative functions of the wonder-tale. Unlike
   Gawain (a chivalric romance bent toward confession) or Culhwch (an early
   medieval Welsh task-quest), Sir Orfeo is the cleanest Proppian fit of
   the three poems — it really IS structurally a wonder-tale: full
   Villainy → Counteraction → Departure → Donor → Struggle → Liquidation →
   Return → Recognition → Restoration arc. What it leaves out (no
   Punishment of the villain, no Pursuit, no false hero) is the poem's
   distinctive moral move. `passage` points at the tale's six movements
   so each function links to the text that realises it. Loaded after
   tale.js; attaches to window.ORFEO. */
window.ORFEO = window.ORFEO || {};
window.ORFEO.propp = {
  intro: "Propp argued that wonder-tales, however different on the surface, drew their events from a single fixed sequence of <strong>31 functions</strong> — Absentation, Interdiction, Reconnaissance, Villainy, Departure, the Donor, Struggle, Victory, Liquidation, Return, Recognition, Restoration. Sir Orfeo is the cleanest Proppian fit of the three poems on this site — far cleaner than <em>Sir Gawain and the Green Knight</em> (a chivalric romance whose central scene is a moral test, not a struggle) or <em>Culhwch ac Olwen</em> (an early Welsh task-quest with no deception cluster). Orfeo really <em>is</em> structurally a wonder-tale: a queen is stolen, a hero departs, performs the right act before the donor, wins back the lack, returns home unrecognised, is recognised, and is restored. The poem's distinctive moral move shows up in what it <em>refuses</em>: there is no Punishment of the villain, no Pursuit, no false hero. The Fairy King is bound to honour his word and that is the end of him in the story. Below, the tale's six movements are laid against Propp's spine.",
  acts: [
    { id: "court",     label: "Court at Winchester",      color: "#7fb37f" },
    { id: "abduction", label: "The abduction",            color: "#cf6a6a" },
    { id: "exile",     label: "Exile and the resolve",    color: "#c9a24a" },
    { id: "rescue",    label: "The Otherworld rescue",    color: "#6fa8c9" },
    { id: "return",    label: "Return and restoration",   color: "#9a8fd0" },
  ],
  moves: [
    { act: "court", sym: "α", node: "Setting", name: "Initial situation", gloss: "The court and the family are introduced.",
      realized: "Orfeo king of Winchester, descended from Pluto and Juno (named as ancient kings, not gods); Heurodis his queen, the fairest lady on body and bones.", passage: 1 },

    { act: "abduction", sym: "ε", node: "Recon", name: "Reconnaissance", gloss: "The villain scouts the hero's family.",
      realized: "In Heurodis's vision: two armed knights come and bid her come and speak with their king. Reconnaissance in the textbook form.", passage: 2 },
    { act: "abduction", sym: "γ", node: "Command", name: "Interdiction (inverted)", gloss: "An order is laid on the hero/family — here, by the villain.",
      realized: "The Fairy King's threat — come tomorrow at the ympe-tree, or be fetched and torn limb from limb. A command from the villain, with no possible refusal: even being torn to pieces will not prevent the taking.", passage: 2 },
    { act: "abduction", sym: "A", node: "The taking", name: "Villainy", gloss: "The villain inflicts harm or a loss.",
      realized: "From the very middle of a thousand-knight shield-wall, the queen is twitched away — <em>with fairi forth y nome, men wist never wher sche was bicome</em>.", passage: 2 },

    { act: "exile", sym: "B", node: "Self-dispatch", name: "Mediation (self-)", gloss: "The lack is made known; the hero is sent forth.",
      realized: "No one dispatches Orfeo. He dispatches himself — calls his barons, names his steward, abdicates, walks out barefoot in a pilgrim's cloak with only his harp. The mediation function is self-administered.", passage: 2 },
    { act: "exile", sym: "↑", node: "Out the gate", name: "Departure (into the wild)", gloss: "The hero leaves home.",
      realized: "He turns into the wild woods alone. Ten years on bark and roots follow before the next plot beat — the longest \"journey\" interval in any of the three poems.", passage: 3 },
    { act: "exile", sym: "C", node: "Resolve", name: "Beginning counteraction", gloss: "The hero agrees to act against the lack.",
      realized: "After ten years and three lesser apparitions, the sixty hawking ladies pass and one of them is Heurodis. The wordless meeting, her tear, the other ladies whisking her away — and Orfeo's resolve: <em>the selve way Ichil streche; of liif, no deth, me no reche</em>. The long mourning ends and the counteraction begins.", passage: 3 },

    { act: "rescue", sym: "G", node: "Following", name: "Guidance", gloss: "The hero is led toward the goal.",
      realized: "He follows the hawking ladies' track straight into a cleft in a rock, three miles through solid stone, and emerges in the Otherworld. Guidance by following the villain's own retinue — a structural variant on the magical guide.", passage: 4 },
    { act: "rescue", sym: "D", node: "Donor's test", name: "Donor's first function", gloss: "The donor proposes a test.",
      realized: "After Orfeo's harping in the king's hall, the Fairy King speaks: <em>Menstrel, me liketh wele thi gle; now aske of me what it be — largelich Ichil the pay; now speke, and tow might asay.</em> The rash boon, asked in the fairest possible form. The donor's function falls to the villain himself.", passage: 5 },
    { act: "rescue", sym: "E", node: "Right ask", name: "Hero's reaction", gloss: "The hero responds correctly.",
      realized: "Orfeo asks for the lady asleep under the ympe-tree. Many heroes in folk-tale over-ask or under-ask; Orfeo asks exactly the right thing.", passage: 5 },
    { act: "rescue", sym: "H", node: "Verbal struggle", name: "Struggle", gloss: "Hero and villain meet in direct contest.",
      realized: "The Fairy King refuses on grounds of pure aesthetic snobbery (\"a sorry couple you would be\"); Orfeo binds him with his own word: <em>yete were it a wele fouler thing to here a lesing of thy mouthe.</em> The only struggle in the poem is a contest of speech-acts, and the hero wins by naming the form of the king's own promise.", passage: 5 },
    { act: "rescue", sym: "J", node: "King yields", name: "Victory", gloss: "The antagonist is defeated.",
      realized: "<em>Seththen it is so — take hir bi the hand, and go.</em> The Fairy King is not beaten in battle; he is bound by his own honour and yields. Orfeo kneels and thanks him swiftly.", passage: 5 },
    { act: "rescue", sym: "K", node: "Walking out", name: "Liquidation of lack", gloss: "The original lack is made good.",
      realized: "He takes her by the hand, and they walk out — <em>right as he came, the way he yede</em>. No looking back. No condition. The Fairy King's word holds; the bargain holds. The lack the poem opened with is undone.", passage: 5 },

    { act: "return", sym: "↓", node: "The road home", name: "Return", gloss: "The hero returns.",
      realized: "Out of the rock-cleft and along the long road back to Winchester. He stops at the town's edge with a beggar for shelter — for himself and his queen.", passage: 6 },
    { act: "return", sym: "o", node: "Unknown", name: "Unrecognised arrival", gloss: "The hero returns disguised or unrecognised.",
      realized: "<em>Ac no man knewe that it was he.</em> Ten years of bark-and-roots and a pilgrim's cloak have done their work. The whole city looks at him without seeing him. The disguise is now active in the world he ruled.", passage: 6 },
    { act: "return", sym: "M", node: "Steward's test", name: "Difficult task (inverted)", gloss: "A test is set — here, by the hero, for the steward.",
      realized: "After his harping at the steward's feast the steward recognises the harp. Orfeo invents the lying tale: man torn small by lions and wolves in a dale, ten years gone, the harp recovered from the body. The \"difficult task\" Propp would put here is inverted: the hero tests the keeper of his throne.", passage: 6 },
    { act: "return", sym: "N", node: "Faithful grief", name: "Solution", gloss: "The task is accomplished.",
      realized: "The steward swoons. <em>That was mi lord, sir Orfeo! Allas! wreche, what schall Y do, that have swiche a lord y lore?</em> The barons must lift him with the formula <em>there is no remedy for a man's death.</em> The test passes itself — and the steward has earned the throne.", passage: 6 },
    { act: "return", sym: "Q", node: "Reveal", name: "Recognition", gloss: "The hero is recognised.",
      realized: "Orfeo reveals himself <em>in the conditional</em> — \"if I were Orfeo the king, and had won my queen back, and had come hither to test thy good will, and had found thee thus true, then thou shouldst be king after my day…\" The conditional announces both the test passed and the reward.", passage: 6 },
    { act: "return", sym: "T", node: "Restoration", name: "Transfiguration", gloss: "The hero's form is restored.",
      realized: "Bathed, the ten-year beard shaved off, attired as a king openly; Heurodis brought from the beggar's hut in great procession with all manner of minstrelsy. The wilderness undone in one morning.", passage: 6 },
    { act: "return", sym: "W", node: "Re-crowning", name: "Wedding (as restoration)", gloss: "The hero is wed/crowned; the tale closes.",
      realized: "<em>Now king Orfeo newe coround is, and his quen dame Heurodis.</em> Not a new wedding but the marriage restored as the kingdom is restored. And the steward, after Orfeo's day, is king — Propp's W collapsed into the simultaneous restoration of king, queen, and succession.", passage: 6 },
  ],
  absent: {
    note: "Sir Orfeo is the cleanest Proppian fit of the three poems on this site — and its <em>refusals</em> are correspondingly precise. Where Gawain bends Propp's scheme heavily (six big absences), Orfeo bends it lightly, but the few absences carry weight:",
    groups: [
      { label: "Punishment of the villain", syms: "U", text: "The single most striking absence. Propp's quest tale ordinarily closes on both Wedding AND Punishment. Sir Orfeo gives the Wedding (re-coronation) but firmly refuses the Punishment. The Fairy King is bound to honour his word and that is the end of him in the story — no slaying, no humiliation, no even a scolding. The poem will not let the antagonist be condemned, only constrained. The classical Orpheus's whole tragedy was that the Underworld <em>punished</em> the looking-back; the medieval lay's quiet move is to remove the punishment-frame entirely, from both sides." },
      { label: "Pursuit and Rescue", syms: "Pr Rs", text: "No chase. The walking-out from the Otherworld is total. The Fairy King's word, once given, contains no condition, no warning, no test at the threshold. They go, full stop. Compare the classical Orpheus: the whole tragic engine of the source is the threshold-test the poet here scrupulously refuses to put in." },
      { label: "The false-hero cycle", syms: "L Ex (of impostor)", text: "Nobody usurps the throne. The steward holds it faithfully for ten years; his loyalty <em>is</em> the test, not a deception to expose. The Exposure function fires — but on the steward's faithfulness, positively, not on an impostor's lie." },
      { label: "Branding", syms: "I", text: "Orfeo carries no wound back. Compare Gawain's nick on the neck and the green sash bound under the left arm — the same poetic century in the same alliterative tradition, and Orfeo gets no mark at all. The hero's restoration is total: the beard is shaved, the rags are washed off, and nothing of the wilderness is kept as a sign." },
      { label: "Deception cluster", syms: "η θ", text: "Where Gawain is <em>built</em> on Trickery and Complicity (the Green Knight's bluff, Bertilak's exchange-of-winnings, the lady's wooing — all η/θ), Orfeo has almost none. The Fairy King's threat is honest. The minstrel-disguise at the fairy court isn't to deceive about <em>terms</em> — Orfeo plays exactly as offered, asks exactly what he wanted — only to gain admittance. The steward's test in Movement VI is the one episode that touches η, and even there the deception is in service of recognition, not loss." },
    ],
    verdict: "Strip away the U Punishment, the Pr/Rs Pursuit-Rescue, the L/Ex false-hero cycle, and the η/θ deception cluster — and what remains is the cleanest <strong>quest-with-restoration</strong> arc in our three-tale set. The poem is the wonder-tale's pure form, with the wonder-tale's last act (punish the villain, marry the prize) replaced by something more medieval and more humane: the antagonist bound by his own word, the queen returned by the same door she left through, and the faithful servant given the throne after the king's day. The classical Orpheus lost his Eurydice for not containing himself. The medieval Orfeo's whole rescue depends on containing himself — and Propp's scheme is exactly the right diagnostic to see why.",
  },
};

/* ── Desire (Greimas's actantial model). *Ref fields → cast ids for the Mythograph. */
window.ORFEO.desire = {
  intro: "Beneath the morphology runs the engine the morphology brackets out: <strong>desire</strong>. Greimas read every tale as six actants on three axes — a Subject who wants an Object, a Sender who dispatches it toward a Receiver, and a Helper and Opponent who aid and block the wanting. Distinct from the Character web (who is bound to whom), this is the single structure of <em>wanting</em> that drives the lay.",
  subject: "Orfeo", subjectRef: "orfeo",
  object: "Heurodis brought back out of Faerie",
  value: "love kept faith with past all reason — and a kingship worth returning to",
  sender: "love itself, and the grief of her taking",
  receiver: "Orfeo, and Winchester restored to its true king", receiverRef: "orfeo",
  helpers: [
    { name: "his harp", note: "the magical agent he brings himself — his harping charms the wild beasts, opens the Fairy King's hall, and wins the rash boon" }
  ],
  opponent: "the Fairy King, who holds her", opponentRef: "fairyking",
  unreachable: false,
  note: "Orfeo's arrow reaches its Object cleanly, and the actants show how: he is the only hero in the corpus whose single Helper is a magical agent he carries himself (the harp), and his Opponent the Fairy King is bound by his own rash word — so the Object is won by art, not force. Set beside Gawain (whose desire half-fails), Orfeo's is the desire that reaches in full."
};

/* ── Theme (Parry–Lord oral type-scenes). */
window.ORFEO.themes = [
  { id: "lament", label: "the lament in the wilderness", passage: 3,
    note: "Ten years of grief in the wastes — the grief-cry raised over the irrevocable, the lament type-scene stretched to fill a whole movement.",
    lines: "he that had had castles and towers… now on the hard heath he lies" },
  { id: "threshold", label: "the crossing into Faerie", passage: 4,
    note: "The rock-cleft — three miles through solid stone onto the bright country: the threshold type-scene, the hero at the very line between the worlds.",
    lines: "in at a rock the ladies ride, and he after, sparing neither stub nor stone" },
  { id: "feast", label: "the feast in hall", passage: 5,
    note: "The Fairy King's hall, where Orfeo harps and wins the rash boon — the hall set-piece; mirrored at the close by the recognition-feast in the steward's hall at Winchester (Movement VI).",
    lines: "the harping in the bright hall; “ask of me what it be”" }
];
