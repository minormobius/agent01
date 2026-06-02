/* Story graph — Manawydan uab Llyr mapped onto Vladimir Propp's "Morphology
   of the Folktale" (1928): the 31 narrative functions of the wonder-tale.

   COMPLETE. The whole branch laid against Propp's spine across six acts.
   Unlike its sister-branch Branwen (a tragedy that runs the spine backward),
   Manawydan is a near-textbook Lack → Liquidation wonder-tale — and the three
   places it departs from the spine (a wedding moved to the front, no magical
   agent at all, and a punishment refused) are exactly where its meaning lives.
   Loaded after tale.js; attaches to window.MANAWYDAN. */
window.MANAWYDAN = window.MANAWYDAN || {};
window.MANAWYDAN.propp = {
  intro: "Propp argued that wonder-tales draw their events from a fixed sequence of <strong>31 functions</strong> — Absentation, Interdiction, Villainy/Lack, the Donor, Struggle, Victory, Liquidation, Return, Recognition, Wedding. <em>Manawydan</em> fits the spine more cleanly than any other tale on this site, with one striking substitution: the <strong>Struggle</strong> against the villain is not a fight but a <strong>negotiation</strong> — a man with a mouse on a gallows, refusing every offer until he has bargained back two kidnapped people, a disenchanted kingdom, and a promise of no revenge. Below, the movements laid against the spine; the comparative payoff against Pwyll, Branwen, Culhwch, Owain, Orfeo and Gawain is read in the <a href=\"/pendragon/\">Pendragon crosswalk</a>.",
  acts: [
    { id: "gift",     label: "The burial; Dyfed and Rhiannon",     color: "#c9a24a" },
    { id: "waste",    label: "The mist; the wasteland",            color: "#6f9ac9" },
    { id: "england",  label: "England: the three crafts",          color: "#b07a4b" },
    { id: "caer",     label: "The boar; the caer; the taken",      color: "#9a6f9a" },
    { id: "crofts",   label: "England again; the three crofts",    color: "#8aa363" },
    { id: "bargain",  label: "The mouse; the bargain; the lifting", color: "#c97f9a" },
  ],
  moves: [
    // ── Act 1: the gift ──────────────────────────────────────
    { act: "gift", sym: "α", node: "Situation", name: "Initial situation", passage: 1,
      gloss: "The family and the realm are introduced.",
      realized: "The seven survivors bury Bendigeidfran's head at the White Hill; Caswallon holds Britain; Manawydan is left a landless guest in his own island." },
    { act: "gift", sym: "a", node: "Lack", name: "Lack — a place of his own", passage: 1,
      gloss: "Something is wanting; the hero feels the want.",
      realized: "Manawydan's opening lament: 'there is no one without a place to call his own tonight, save me alone.' Dispossession is the want that opens the tale." },
    { act: "gift", sym: "W", node: "Wedding", name: "Wedding — moved to the front", passage: 1,
      gloss: "Propp's terminal Wedding, here at the very start.",
      realized: "Pryderi gives Manawydan the seven cantrefs and Rhiannon to wife: the tale's 'reward' is granted first — so it can be taken away." },

    // ── Act 2: the wasteland ─────────────────────────────────
    { act: "waste", sym: "A", node: "Villainy", name: "Villainy — the land laid waste", passage: 2,
      gloss: "The villain causes harm or loss.",
      realized: "Thunder and a fall of mist on the Gorsedd of Arberth empty the seven cantrefs: no house, no beast, no smoke, no man — only the four left." },

    // ── Act 3: England ───────────────────────────────────────
    { act: "england", sym: "↑", node: "Departure", name: "Departure from home", passage: 3,
      gloss: "The hero leaves home.",
      realized: "Wearied of the empty land, the four go into England to live by their hands — saddles at Hereford, then shields, then shoes." },
    { act: "england", sym: "↻", node: "Trials", name: "Repeated trials, refused as combat", passage: 3,
      gloss: "Episodes of conflict the hero must navigate.",
      realized: "Three guilds in turn conspire to kill them; Manawydan moves the company on each time rather than let Pryderi fight — prudence in the place where the genre expects a struggle." },

    // ── Act 4: the caer ──────────────────────────────────────
    { act: "caer", sym: "γ", node: "Interdiction", name: "Interdiction", passage: 4,
      gloss: "The hero is warned against an act.",
      realized: "Manawydan forbids Pryderi to enter the caer: 'whoever laid the enchantment on the land has caused this fort to be here.'" },
    { act: "caer", sym: "δ", node: "Violation", name: "Violation of the interdiction", passage: 4,
      gloss: "The interdiction is broken.",
      realized: "Pryderi enters anyway, to recover his dogs; the warrior's loyalty cannot heed the warning." },
    { act: "caer", sym: "✗", node: "False agent", name: "The false magical agent", passage: 4,
      gloss: "Where a donor would give an aid, here stands a trap.",
      realized: "The golden bowl on chains rising into the air is no gift but a snare: it fixes hands and feet and steals speech." },
    { act: "caer", sym: "A1", node: "Abduction", name: "Villainy — the kidnapping", passage: 4,
      gloss: "The villain seizes members of the family.",
      realized: "Pryderi, then Rhiannon who follows him, are held fast and carried off as the caer vanishes in thunder and mist." },

    // ── Act 5: the crofts ────────────────────────────────────
    { act: "crofts", sym: "ζ", node: "Renewed harm", name: "Villainy renewed — the harvest", passage: 5,
      gloss: "The villain's harm continues.",
      realized: "Manawydan turns farmer and sows three miraculous crofts; the mice strip the first two to bare straw in two nights." },

    // ── Act 6: the bargain ───────────────────────────────────
    { act: "bargain", sym: "C", node: "Counteraction", name: "Beginning of counteraction", passage: 6,
      gloss: "The hero resolves to act, and acts.",
      realized: "He arms himself, watches the third croft, and runs down the one mouse too heavy to flee — the hostage on whom everything will turn." },
    { act: "bargain", sym: "H", node: "Struggle", name: "Struggle — by bargain, not battle", passage: 6,
      gloss: "Hero and villain meet in direct contest.",
      realized: "On the gallows-hill he faces the disguised Llwyd; the contest is a negotiation over a mouse's life, refusing scholar, priest and bishop in turn." },
    { act: "bargain", sym: "I", node: "Victory", name: "Victory over the villain", passage: 6,
      gloss: "The villain is defeated.",
      realized: "Unable to ransom his pregnant wife, Llwyd must meet every demand Manawydan names; the hero wins without a blow struck." },
    { act: "bargain", sym: "Ex", node: "Exposure", name: "Recognition and exposure of the villain", passage: 6,
      gloss: "The villain is unmasked.",
      realized: "The bishop confesses he is Llwyd son of Cil Coed — and that the whole enchantment avenges Gwawl son of Clud for the badger-in-the-bag of the First Branch." },
    { act: "bargain", sym: "K", node: "Liquidation", name: "Liquidation of the lack", passage: 6,
      gloss: "The initial misfortune is undone.",
      realized: "Pryderi and Rhiannon freed, the enchantment lifted from the seven cantrefs, and a binding promise of no revenge — the lack fully liquidated." },
    { act: "bargain", sym: "T", node: "Restoration", name: "Transfiguration and restoration", passage: 6,
      gloss: "A new (or restored) shape is given.",
      realized: "The wand turns the mouse back into the fairest of women, and the wasteland blooms whole again at a glance — every herd and dwelling restored." },
  ],
  absent: {
    note: "Manawydan completes Propp's spine — Lack fully liquidated, kingdom truly restored — more cleanly than any tale on this site. The three places it departs from the model are not gaps but the seat of its meaning.",
    groups: [
      { syms: "W", label: "The Wedding, moved to the front",
        text: "Propp's wonder-tale <em>ends</em> in a wedding; this one begins with it. Manawydan is given Rhiannon and the kingdom in Movement I — so that the enchantment can take them away. The reward is granted first, then put wholly at hazard, and the tale is the labour of winning it back." },
      { syms: "D · E · F", label: "No donor, no magical agent",
        text: "There is no helper, and no magic gift to the hero. Where the donor-sequence belongs, the branch sets a <em>false</em> agent — the golden bowl, which is a trap. Manawydan lifts a kingdom-wide enchantment with no magic of his own at all: only patience, a glove, a string, and a refusal to be shamed. He is the corpus's one wholly un-magical hero." },
      { syms: "M · N", label: "No difficult task, no quest",
        text: "Nothing must be fetched, no monster killed, no riddle solved — the absences that fill Culhwch are total here. The 'task' is simply to hold a bargain to its last word against a desperate adversary: a contest of nerve, not of deeds." },
      { syms: "U", label: "Punishment refused",
        text: "The wonder-tale punishes its villain; Manawydan refuses to. Holding every card, he asks not for vengeance but for guarantees — the captives freed, the spell lifted, and no future revenge on Pryderi, Rhiannon or himself. Mercy, extracted as the final clause of the contract, is the tale's last and most deliberate move — and the thing that ends the cycle of revenge the First Branch began." },
    ],
    verdict: "The result is a wonder-tale that completes the spine yet wins by wit and mercy where the genre expects magic and punishment. Set against Branwen — which has the same parts and runs them into ruin — Manawydan is the corpus's clean restoration: the one branch where the lack is fully liquidated and the world is genuinely made whole again.",
  },
};

/* ── Desire (Greimas's actantial model). *Ref fields → cast ids for the Mythograph. */
window.MANAWYDAN.desire = {
  intro: "Beneath the morphology runs the engine the morphology brackets out: <strong>desire</strong>. Greimas read every tale as six actants on three axes — a Subject who wants an Object, a Sender who dispatches it toward a Receiver, and a Helper and Opponent who aid and block the wanting. Distinct from the Character web (who is bound to whom), this is the single structure of <em>wanting</em> that drives the branch.",
  subject: "Manawydan", subjectRef: "manawydan",
  object: "the enchantment lifted — Pryderi and Rhiannon freed, and Dyfed made whole",
  value: "patience rewarded; a kingdom and a friendship restored without a single blow",
  sender: "the loss itself — the mist that empties the land, the caer that takes his comrades",
  receiver: "Pryderi and Rhiannon, and the seven cantrefs of Dyfed", receiverRef: "pryderi",
  helpers: [
    { name: "Cigfa, his steadfast companion", ref: "cigfa", note: "who keeps faith with him through the wilderness and the craft-exile" },
    { name: "the one slow mouse", ref: "llwydwife", note: "the pregnant mouse too heavy to flee — the enchanter's own wife, and the single hostage on whom the whole rescue turns" }
  ],
  opponent: "Llwyd son of Cil Coed, the hidden enchanter avenging Gwawl", opponentRef: "llwyd",
  unreachable: false,
  note: "Manawydan's arrow reaches its Object — and uniquely in the corpus, by no magic and no blow at all. The Helper that wins it is the Opponent's own wife (the slow mouse), the one hostage patience could secure; the Subject's only weapons are a glove, a gallows, and a refusal to be hurried. Set against Branwen, its prequel (whose arrow is dashed), Manawydan is the bright mirror: the same wasteland, made whole."
};

/* ── Theme (Parry–Lord oral type-scenes). A wit-tale, light on the heroic set-pieces. */
window.MANAWYDAN.themes = [
  { id: "feast", label: "the feast in hall", passage: 1,
    note: "The welcome-feast at Arberth — \"from it every honour took its beginning\" — the hall set-piece that opens the branch on the four friends in their contentment, before the mist falls.",
    lines: "the feast prepared by Rhiannon and Cigfa; the four inseparable" },
  { id: "council", label: "the council / taking of counsel", passage: 3,
    note: "The repeated counsels of the craft-exile — \"what craft shall we take?\" — the four (then the two) deliberating their next move town by town: the council type-scene domesticated into a wit-tale's rhythm.",
    lines: "“let us make saddles… shields… shoes”; the decision to move on rather than fight" }
];
