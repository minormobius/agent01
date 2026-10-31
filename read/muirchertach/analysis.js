/* Story graph: Aided Muirchertaig meic Erca against Propp's 31
   functions, with Greimas and the type-scenes. The tale is the test
   case for the series hypothesis. Unlike Þiðrandi, it gets well past
   the preparatory section: there is a donor (the saint), a magical
   agent (the Cross over the eyes), and the agent WORKS. Then the hero
   gives it back and walks home to the villain. The fatal move is the
   ↓ Return itself. Loaded after tale.js; attaches to window.MUIRCHERTACH. */
window.MUIRCHERTACH = window.MUIRCHERTACH || {};
window.MUIRCHERTACH.propp = {
  intro: "This is the test case. <em>Echtra Nerai</em> runs Propp's spine and loses only the return. <em>Þiðranda þáttr</em> stops at the villainy. <em>Aided Muirchertaig</em> does something neither does and Propp has no number for. It reaches the <strong>donor</strong>, who gives the hero a <strong>magical agent</strong> (the Cross over his eyes), and the agent <strong>works</strong>: the armies become stones and the hero sees the truth. Then he hands it back and walks home to the villain. The interdiction comes from the villain herself, the rescue arrives in time and is refused, and the return home is what kills him. Below are seventeen moves.",
  acts: [
    { id: "mound",   label: "The mound and the bargain",        color: "#e0663f" },
    { id: "house",   label: "The house given away",             color: "#c9a24a" },
    { id: "spell",   label: "The enchantment",                  color: "#6f9ac9" },
    { id: "cross",   label: "The Cross, and the refusal",       color: "#d8d0bf" },
    { id: "fire",    label: "Samhain week: the burning",        color: "#c94a4a" },
    { id: "graves",  label: "Three graves",                     color: "#9c8fb8" },
  ],
  moves: [
    { act: "mound", sym: "α", node: "Cletech", name: "Initial situation", gloss: "The family and the hero are introduced.",
      realized: "A king of Ireland in his great house above the Boyne, facing the Bruig, with his wife beside him. His companions leave him alone on his hunting-mound, and the tale begins where all three of the series' tales begin, with a man alone at the edge.", passage: 1 },
    { act: "mound", sym: "ε/ζ", node: "“I know you”", name: "Reconnaissance and delivery", gloss: "The villain seeks information, and receives it.",
      realized: "She needs none. <em>I know you and all the men of Ireland besides.</em> In Propp's preparatory section the villain must gather intelligence. Sín arrives already knowing everything, and it is the hero who asks the questions (<em>do you know me? will you come with me?</em>).", passage: 1 },
    { act: "mound", sym: "γ", node: "Three gessa", name: "Interdiction — issued by the villain", gloss: "An interdiction is addressed to the hero.",
      realized: "Never speak my name; your wife must never be in my sight; the clerics must never enter a house I am in. In Nera and in Þiðrandi the rule came from the helper, a fairy wife or a seer. Here it comes from the <em>villain</em>, and every clause of it serves her. It is the first interdiction in the series designed to be broken.", passage: 1 },
    { act: "mound", sym: "θ", node: "His word", name: "Complicity", gloss: "The victim submits to deception, unwittingly helping the enemy.",
      realized: "<em>I'll give you power over me.</em> He gives his word before she names a price, and keeps it when she does: <em>it would be easier for me to give you half of Ireland</em>.", passage: 1 },
    { act: "house", sym: "A¹", node: "House emptied", name: "Villainy (first): expulsion", gloss: "The villain causes harm to a member of the family.",
      realized: "Duaibsech and her children, and then two battalions of the Children of Niall, are put out of Cletech. It is Propp's A9, expulsion, carried out by the hero's own hand at the villain's word.", passage: 2 },
    { act: "house", sym: "B", node: "To the saint", name: "Mediation", gloss: "Misfortune is made known; a helper is approached.",
      realized: "The expelled wife goes to her soul-friend: <em>I am afraid of death tonight; go yourself to Eógan and Conall.</em> In Þiðrandi the tale stopped at B. Here B dispatches someone, though not the hero. The counter-agent is a saint.", passage: 3 },
    { act: "house", sym: "C", node: "The curse", name: "Counteraction", gloss: "The seeker decides upon counteraction.",
      realized: "Kept from the door, Cairnech counteracts with a curse: a grave dug for the living king, bells rung on it, <em>it is the end of his kingship</em>. The church's opening move is as deadly as the witch's.", passage: 3 },
    { act: "spell", sym: "η", node: "Wine, swine", name: "Trickery", gloss: "The villain attempts to deceive the victim.",
      realized: "Battles staged for entertainment, Boyne water made wine, ferns made pigs. Everything in Sín's boast comes true and nothing is real.", passage: 4 },
    { act: "spell", sym: "A²", node: "Wasting", name: "Villainy (second): the enchantment", gloss: "A11/A17: the villain casts a spell; the villain threatens.",
      realized: "The king and his host wake as if wasting. Then come four battalions of stone, blue men and goat-headed men, and every man he kills rises again. Then blue men from the north and headless men from the south, and he falls strengthless on the floor. The villainy takes a week, and its means is exhaustion.", passage: 5 },
    { act: "cross", sym: "D", node: "The clerics", name: "First function of the donor", gloss: "The hero is tested or questioned, preparing for a magical agent.",
      realized: "Three clerics find him hacking at stones: <em>why are you felling the stones?</em> The test is a question, and it is about seeing.", passage: 6 },
    { act: "cross", sym: "F", node: "The Cross", name: "Receipt of a magical agent", gloss: "The hero acquires the use of a magical agent.",
      realized: "<em>Put Christ's Cross across your eyes.</em> He does, and sees only stones and sods. Then confession, blessed water and communion follow. The agent works completely. This is the furthest any hero in the series has got toward rescue.", passage: 6 },
    { act: "cross", sym: "K?", node: "Sight", name: "Liquidation (of the deception)", gloss: "The initial misfortune or lack is liquidated.",
      realized: "He knows. He even tells Sín what her armies were made of: <em>fern and stones and puffballs</em>. By Propp's logic the lack is liquidated and the hero is ready to defeat the villain.", passage: 6 },
    { act: "cross", sym: "F⁻", node: "Gives it back", name: "Refusal of the agent (outside Propp)", gloss: "Not in Propp's 31: the hero renounces the magical agent he has received.",
      realized: "<em>Your face is dearer to me than the churches of the clerics.</em> Propp's morphology has no function for this, because his heroes never decline the magic that would save them. This is the tale's centre, and possibly the genre's.", passage: 6 },
    { act: "fire", sym: "δ", node: "Her name", name: "Violation", gloss: "The interdiction is violated.",
      realized: "On the Tuesday after Samhain, with the snow coming in from the north-west, he says <em>osnad</em>, <em>gemadaig</em>, <em>sín</em> (sigh, winter-night, storm), talking about the weather. The interdiction she designed to be broken is broken by a remark about the wind.", passage: 7 },
    { act: "fire", sym: "↓", node: "Back in", name: "Return — the fatal one", gloss: "The hero returns.",
      realized: "He walks out across the dark field to the clerics' little fire in the church he dug, tells them everything, and <em>goes back in at once</em>. The return home, which Nera never gets and Þiðrandi never needs, happens here, and it kills him.", passage: 7 },
    { act: "fire", sym: "A³", node: "Burned, drowned", name: "Villainy (third): murder", gloss: "A14: murder.",
      realized: "Sleep-spell, inward-turned spears, phantom host, fire scattered along the walls, and the vat of Boyne-wine. Burned and drowned, as the annals say. The household runs onto its own spears.", passage: 8 },
    { act: "graves", sym: "Ex · U", node: "Sín confesses", name: "Exposure and punishment — self-inflicted", gloss: "The villain is exposed; the villain is punished.",
      realized: "She comes to the graveside, says who she is and why, confesses, and dies of grief. No one exposes or punishes her; she does both herself. Then the posthumous rescue (Rs) comes: Cairnech prays the king's soul out of hell.", passage: 9 },
  ],
  absent: {
    note: "Unlike Þiðrandi, this tale is not short of functions. Its oddities are inversions, and each one is a measurement of the genre.",
    groups: [
      { syms: "γ from the villain", label: "The rule-giver is the enemy", text: "In Nera the rules come from the fairy wife and from the dead man's own lips. In Þiðrandi they come from the seer. Here the villain sets the interdiction in order to have it broken. A rule in a spooky tale is never neutral: someone set it, and the reader has to ask who." },
      { syms: "F → F⁻", label: "The agent refused", text: "Propp's donor sequence assumes the hero keeps the magic. Muirchertach receives it, uses it, sees truly, and gives it back. This is the most important single move in the series so far." },
      { syms: "↓ fatal", label: "The return kills", text: "The series hypothesis was that these are tales without a ↓ Return. Muirchertach has one, repeatedly. He goes out to the church and comes back to the house, and the coming back is fatal. <strong>The hypothesis, as first stated, is broken.</strong>" },
      { syms: "H", label: "No struggle with the villain", text: "He fights for a week, but never her. He fights stones and phantoms. The villain is in his bed the whole time." },
      { syms: "W", label: "The wedding is the villainy", text: "Propp's last function is the hero's marriage. Here the bride is taken on the mound in the first movement, and the whole tale is the marriage running its course." },
    ],
    verdict: "Three tales in, the hypothesis that these are <em>the tales without a ↓ Return</em> has to be restated, because this tale returns and dies of it. What holds across all three is narrower and stranger. <strong>The danger is never out there; it is at the door of the house on the festival night, in either direction.</strong> Nera survives by going out and stays out. Þiðrandi dies by going out. Muirchertach dies by coming back in. The constant is the threshold and the date, not the direction of travel, and the house is never the safe place. That is the restated hypothesis. It also means the first analysis these tales need is a map of the threshold: who crosses it, which way, how often, and what it costs. The Compared section on the hub now carries this.",
  },
};

/* ── Desire (Greimas). Two Subjects whose Objects are each other. */
window.MUIRCHERTACH.desire = {
  intro: "In Nera the hero wanted. In Þiðrandi the hero was wanted. Here both happen at once. <strong>Two Subjects</strong>, each the other's Object, close into a loop that only fire can break. The diagram below follows Sín's axis, since hers is the one that drives the plot. The king's mirror axis is in the note.",
  subject: "Sín", subjectRef: "sin",
  object: "the death of the king who destroyed her people — and the king himself",
  value: "vengeance owed to the dead, and a love she did not intend",
  sender: "the dead: her father Sige, her mother and sister, and the old tribes of Tara cut down at the battle of Cerb", senderRef: "sige",
  receiver: "the dispossessed dead, and in the end herself, who dies of it",
  helpers: [
    { name: "The king's own desire", ref: "muirchertach", note: "his word given before her price was named; his choice of her face over the churches" },
    { name: "The enchanted feast", ref: "feast", note: "the wine of the Boyne that wastes him, and the vat he drowns in" },
    { name: "The armies of stone", ref: "bluemen", note: "they spend his strength fighting nothing" }
  ],
  opponent: "Cairnech and his clerics — the curse, the Cross, the confession", opponentRef: "cairnech",
  unreachable: false,
  note: "Mirror it and the king's axis reads: Subject Muirchertach, Object Sín, Sender his own sight at the mound, Helper her magic, Opponent the same clerics. Both Subjects get their Objects. She gets his death, and he gets her, in her bed, in her house, to the end. Both die of it. It is the only tale in the series where the otherworld figure and the human want each other, and the only one where everyone who wants anything gets it. Greimas's model predicts a satisfied Subject at the end of a successful quest. Here two of them are buried a day apart."
};

/* ── Type-scenes. */
window.MUIRCHERTACH.themes = [
  { id: "mound", label: "the woman on the mound", passage: 1,
    note: "A king alone on a grave-mound meets a woman of the otherworld and is bound to her. It is the sovereignty encounter of Irish kingship-tales (the woman who gives the land to a king) turned round: this woman takes it away.",
    lines: "a woman alone on the turf of the mound; a green mantle; “I am the sweetheart of Muirchertach”" },
  { id: "feast", label: "the feast in hall", passage: 2,
    note: "The hall at its height, every craftsman of Ireland in it, a verse made by each — just before it is emptied. Like Nera's household cooking at Crúachan and Hallr's autumn feast, the tale's catastrophe grows out of a feast.",
    lines: "the nobles of the Children of Niall consuming the tribute of every province; “a good house we have come to”" },
  { id: "curse", label: "the saint's curse", passage: 3,
    note: "A saint, refused hospitality or entry, curses a king with bell and crozier. It is common in Irish hagiography (the Banquet of Dún na nGéd has the same curse). Here he goes further and digs the grave first.",
    lines: "the grave of the living king; the mound of the bells; “may its corn and its milk be bad”" },
  { id: "dream", label: "the dream and its reading", passage: 8,
    note: "A prophetic dream told to a learned man and interpreted point by point: ship, sea, griffin, nest, fire. Every reading in this tale is correct, and none of them is acted on.",
    lines: "the sinking ship; the taloned griffin; the burning nest; Dub Dá Rind's rede" },
  { id: "burning", label: "the burning of the hall", passage: 8,
    note: "The great hall-burning of northern literature: <em>Togail Bruidne Da Derga</em> in Ireland, the burning of Njáll at Bergþórshváll in Iceland, the hall of Finnsburh in Old English. A king dies in his own house at night, surrounded. In this version the besiegers are illusions and the arsonist is in his bed.",
    lines: "spears turned inward in the doorways; fire scattered along the walls; the vat of wine" },
];
