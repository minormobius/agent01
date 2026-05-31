/* Story graph — Branwen ferch Llŷr mapped onto Vladimir Propp's "Morphology
   of the Folktale" (1928): the 31 narrative functions of the wonder-tale.

   COMPLETE. The whole branch laid against Propp's spine across six acts. The
   distinctive thing about Branwen, against the rest of the corpus, is that it
   is a TRAGEDY: the wonder-tale spine that Pwyll, Owain, Culhwch and the
   English romances complete (Lack → … → Liquidation → Wedding) here runs
   backwards into ruin — the donor's gift becomes the enemy's weapon, the
   rescue empties two kingdoms, and there is no restoration. The `absent`
   section reads that inversion. Loaded after tale.js; attaches to
   window.BRANWEN. */
window.BRANWEN = window.BRANWEN || {};
window.BRANWEN.propp = {
  intro: "Propp argued that wonder-tales drew their events from a fixed sequence of <strong>31 functions</strong> — Absentation, Interdiction, Villainy, the Donor, Struggle, Victory, Liquidation, Return, Recognition, Wedding. <em>Branwen</em> is the corpus's great counter-example: it has the parts but runs them toward catastrophe. A marriage made to bind two islands; a villainy (Efnisien's outrage) that is patched, not punished; a magical agent (the Cauldron of Rebirth) given as <em>amends</em> that returns as the enemy's weapon; a rescue-expedition that wins the field and empties both kingdoms; and, at the end, no wedding and no restoration — only seven survivors, a buried head, and a woman dead of grief. Below, the movements are laid against the spine as they are translated; the comparative payoff is read against Pwyll, Culhwch, Owain, Orfeo and Gawain in the <a href=\"/pendragon/\">Pendragon crosswalk</a>.",
  acts: [
    { id: "marriage", label: "The marriage at Aberffraw",        color: "#c9a24a" },
    { id: "outrage",  label: "Efnisien's outrage; the cauldron", color: "#6f9ac9" },
    { id: "ireland",  label: "Branwen in Ireland; the message",  color: "#c97f9a" },
    { id: "crossing", label: "Brân's crossing; the house",       color: "#b07a4b" },
    { id: "ruin",     label: "The feast, the fire, the battle",  color: "#9a6f9a" },
    { id: "head",     label: "The seven; the wondrous head",     color: "#7fb37f" },
  ],
  moves: [
    // ── Act 1: marriage ──────────────────────────────────────────
    { act: "marriage", sym: "α", node: "Initial situation", name: "Initial situation", gloss: "The family is introduced.",
      realized: "The House of Llŷr on the rock of Harlech: the giant king Bendigeidfran, his brother Manawydan, and the half-brothers Nisien the peace-maker and Efnisien the strife-maker. The tale names its moral poles before anything happens — peace and ruin already seated side by side.", passage: 1 },
    { act: "marriage", sym: "W°(pre)", node: "The binding marriage", name: "Marriage as alliance", gloss: "A wedding opens the tale rather than closing it.",
      realized: "Matholwch of Ireland sails with thirteen ships to ask for Branwen; the counsel grants her, to bind the Island of the Mighty to Ireland. The feast at Aberffraw, in tents because no house can hold Brân, and Branwen becomes Matholwch's wife. Branwen inverts the wonder-tale: it puts the wedding at the START, as the thing that will be undone, not the reward that crowns the end.", passage: 1 },
    // ── Act 2: outrage ───────────────────────────────────────────
    { act: "outrage", sym: "A", node: "Villainy", name: "Efnisien's outrage", gloss: "A wrong opens the conflict.",
      realized: "Slighted that his sister was married without his leave, Efnisien mutilates Matholwch's horses — lips, ears, tails, eyelids cut to the bone. The villainy is inward and familial: not a monster from outside but the king's own half-brother, doing what the prologue named him for. The alliance is poisoned at its root.", passage: 2 },
    { act: "outrage", sym: "K(false)", node: "False liquidation", name: "The amends", gloss: "The lack is patched, not healed.",
      realized: "Brân buys the peace back: a sound horse for each ruined one, a silver staff and gold plate measured to Matholwch's own body, and — the offender being his own brother, whom he can neither kill nor disown — a plea for reconciliation. The Irish council accepts for fear of a greater shame. A liquidation that settles nothing; the insult is paid for but not forgotten.", passage: 2 },
    { act: "outrage", sym: "F→", node: "The fatal gift", name: "The Cauldron of Rebirth given", gloss: "The donor's magical agent — given to the enemy.",
      realized: "To perfect the amends, Brân gives Matholwch the Cauldron of Rebirth, which returns slain men to battle but not to speech, with its iron-house back-story of the unkillable giant-couple. Propp's magical agent (F) normally arms the hero; here it is handed to the other side as compensation, and will return in Movement V as the weapon that nearly destroys the host of Britain. The tale's central irony, seeded as a gift of peace.", passage: 2 },
    // ── Act 3: ireland ───────────────────────────────────────────
    { act: "ireland", sym: "A²", node: "Persecution", name: "Branwen scapegoated", gloss: "A second villainy, on the innocent.",
      realized: "After a bright year and the birth of Gwern, the Irish court's grudge over the horse-insult turns on Branwen: she is driven from the king's bed to cook for the court, and the butcher boxes her ear every day for three years. Not calumny (Pwyll's Rhiannon) but scapegoating — the wronged queen punished for her brother's offence by a husband too weak to refuse his men.", passage: 3 },
    { act: "ireland", sym: "B", node: "The call for rescue", name: "The starling's message", gloss: "News of the lack reaches the rescuer.",
      realized: "Cut off by a three-year embargo on all crossings, Branwen rears a starling, teaches it her brother's face, and sends it over the sea with a letter bound under its wing. It finds Brân in council at Caer Seint; he reads of her pain. The smallest instrument in the branch sets the largest in motion — Propp's mediation carried by a hand-reared bird.", passage: 3 },
    { act: "ireland", sym: "C↑", node: "Muster & departure", name: "The host of Britain raised", gloss: "The avenger gathers and sets out.",
      realized: "Brân musters the whole Island of the Mighty — a hundred and forty-four districts — for one woman's wrong, and leaves seven stewards under his son Caradog to hold Britain. The scale tips from family to nation; and the stewards left behind seed a second disaster (Caswallon's usurpation in Brân's absence) folded inside the first.", passage: 3 },
    // ── Act 4: crossing ──────────────────────────────────────────
    { act: "crossing", sym: "↑G", node: "The crossing", name: "Brân a bridge for his host", gloss: "The hero crosses to the enemy's land.",
      realized: "The host of Britain sails and Brân wades the sea (the swineherds' riddle of the moving forest and mountain, read by Branwen); the Irish break the bridge over the Llinon, and Brân lays his own body across it — <em>a fo ben, bit bont</em>, \"he who would be chief, let him be a bridge.\" The branch's image of kingship, and the road to the slaughter.", passage: 4 },
    { act: "crossing", sym: "θ", node: "The false peace", name: "The kingdom offered; the house built", gloss: "Complicity — the victim is drawn into the deception that traps him.",
      realized: "The Irish offer Gwern the throne, then — on Branwen's counsel, to spare the country — build a house to hold the giant who never had one, the highest honour, with homage and the kingship handed over. The settlement is sincere on Branwen's side and treacherous on the court's: the honour is the bait.", passage: 4 },
    { act: "crossing", sym: "η/¬η", node: "The bagged ambush", name: "Trickery and counter-trickery", gloss: "Deception met by deception.",
      realized: "Two hundred armed men are hidden in leather bags on the pillars, called \"meal.\" Efnisien reads the trap and crushes every head through the bone, capping it with an englyn — the strife-maker's malice, for once, the Britons' deliverance. The peace is a battlefield before the feast begins.", passage: 4 },
    // ── Act 5: ruin ──────────────────────────────────────────────
    { act: "ruin", sym: "A³", node: "The spark", name: "Gwern cast into the fire", gloss: "The act that turns peace to war.",
      realized: "At the feast of reconciliation, the kingship conferred on the boy, Efnisien is called to fondle his nephew — and flings Gwern headlong into the fire. Branwen would leap in after him but Brân holds her back with one hand, his shield in the other; the hall erupts. The alliance, embodied in the child, is murdered.", passage: 5 },
    { act: "ruin", sym: "F⁻", node: "The gift turned weapon", name: "The cauldron against its giver", gloss: "The donor's magical agent (F) returned, inverted, as the enemy's weapon.",
      realized: "The Irish kindle the Cauldron of Rebirth and cast in their dead, who rise each dawn mute and tireless, while the British dead stay dead. The gift Brân gave for peace in Movement II is now the engine of his host's destruction — the F→A inversion the absences below describe, played out in full.", passage: 5 },
    { act: "ruin", sym: "†(redempt)", node: "Self-sacrifice", name: "Efnisien breaks the cauldron", gloss: "The villain's one redeeming act, at the cost of his life.",
      realized: "Efnisien — who began the ruin and lit its spark — feigns death among the Irish corpses, is flung into the cauldron alive, and bursts it into four pieces, and his own heart with it. The strife-maker's single act of grace undoes his worst work, but saves only seven men. Propp has no slot for it: a villainy and a heroism in one body.", passage: 5 },
    // ── Act 6: head ──────────────────────────────────────────────
    { act: "head", sym: "↓K°", node: "Pyrrhic liquidation", name: "Victory as catastrophe", gloss: "The lack is 'resolved' by mutual ruin.",
      realized: "The field is won and the world is emptied: seven men of Britain escape, Brân mortally wounded by a poisoned spear, and Ireland left to five pregnant women in a cave. Propp's liquidation (K) here restores no order — the rescue of one woman has unmade two kingdoms. The wonder-tale spine completes only as tragedy.", passage: 6 },
    { act: "head", sym: "T†", node: "The wondrous head", name: "Brân's head; the timeless feast", gloss: "Transfiguration — into a marvel beyond death.",
      realized: "Brân has his own head struck off; it stays undecayed, feasting and counselling the seven through seven years at Harlech (the birds of Rhiannon) and fourscore at Gwales, until the forbidden door is opened and grief floods back. Buried at the White Hill facing France, it becomes Britain's talisman against invasion. Propp's transfiguration carried past death itself.", passage: 6 },
    { act: "head", sym: "W̶", node: "No wedding; only graves", name: "The refused close", gloss: "Where the wonder-tale weds, this branch buries.",
      realized: "Branwen dies of grief on the Alaw (\"two good islands laid waste because of me\"); Caradog's heart breaks at Caswallon's unseen sword; Ireland is re-peopled from a cave. There is no wedding, no restoration, no return to order — only the five provinces refounded over a battlefield, and a head in the ground. The structural negative of every other tale in the corpus.", passage: 6 },
    // Translation complete: all six movements rendered.
  ],
  absent: {
    note: "With the whole branch rendered, Branwen's distinctive Propp profile is plain: it is the inversion of the wonder-tale, in three features.",
    groups: [
      { label: "The wedding at the wrong end", syms: "W", text: "Where Pwyll, Culhwch, Owain and Orfeo <em>close</em> on a wedding or restoration, Branwen <em>opens</em> on one — and spends the rest of the tale destroying it. The marriage is not the reward but the fuse." },
      { label: "The donor's gift as the enemy's weapon", syms: "F→A", text: "Propp's magical agent (F) is normally what wins the hero his victory. The Cauldron of Rebirth is given by Brân as <em>amends</em>, and in Ireland it is turned against his own men, reviving the Irish dead each night. The gift becomes the villainy it was meant to settle." },
      { label: "Liquidation that empties the world", syms: "K↓", text: "The rescue succeeds and ruins everything: the field is won, but Ireland is left with five pregnant women and Britain with seven men. There is no K (liquidation of lack) that restores an order — only a victory indistinguishable from catastrophe." },
    ],
    verdict: "Branwen is the corpus's structural negative. It is built from the same wonder-tale parts as its sister-branch Pwyll, but assembled to run the engine backwards — alliance into war, gift into weapon, rescue into desolation, marriage into a grave on the Alaw. Set against the restorative closes of the other five tales, it measures exactly how much the Welsh imagination could also refuse the happy ending.",
  },
};
