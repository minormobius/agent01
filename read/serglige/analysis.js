/* Story graph: Serglige Con Culainn against Propp, with Greimas and the
   type-scenes. The finding: the fullest wonder-tale spine in the series,
   with its hinges at the two Samhains a year apart. And it is the first
   tale in the series where the otherworld is ENTERED and LEFT and the
   hero is CURED: by forgetting. The ↓ Return happens and is survived,
   but only after the druids erase the memory of the otherworld. Loaded
   after tale.js; attaches to window.SERGLIGE. */
window.SERGLIGE = window.SERGLIGE || {};
window.SERGLIGE.propp = {
  intro: "This is the most complete wonder-tale in the series. A villainy (the whipping), a lack (his strength, his voice), a summons, a donor (Lí Ban, who will heal him), a test (a day's fighting), a struggle and a victory, a reward (Fand), and a <strong>return</strong>. It is also the first tale in which the hero goes into the otherworld, comes back <em>and lives</em>. The price shows where Propp's model and this genre part. He is not cured by the otherworld's gift. He is cured by <strong>forgetting the otherworld</strong>: the druids' drink, and Manannán's cloak shaken between him and Fand. The return is safe only once the memory of the other side has been erased. Below are eighteen moves.",
  acts: [
    { id: "samhain1", label: "The first Samhain: the birds and the whips", color: "#3fae8c" },
    { id: "year",     label: "A year in the wasting-bed",                 color: "#c9a24a" },
    { id: "samhain2", label: "The second Samhain: the summons",          color: "#9c8fb8" },
    { id: "magmell",  label: "Mag Mell: the battle and the reward",       color: "#6f9ac9" },
    { id: "strand",   label: "The strand: the two wives",                 color: "#c96a5a" },
    { id: "forget",   label: "Forgetting",                                color: "#8f8a80" },
  ],
  moves: [
    { act: "samhain1", sym: "α", node: "Samhain", name: "Initial situation", gloss: "The family and the hero are introduced.",
      realized: "The seven days of Samhain on the plain of Muirthemne: games, feasts, boasts with swords across the thigh. The whole of Ulster is gathered, waiting for Fergus and Conall.", passage: 1 },
    { act: "samhain1", sym: "γ", node: "“Don't go”", name: "Interdiction", gloss: "An interdiction is addressed to the hero.",
      realized: "<em>If you'd listen to me you wouldn't go near them, for there is some power behind those birds.</em> Láeg and Ethne together. As in Þiðrandi, it is a warning from those closest to him, and he disregards it.", passage: 2 },
    { act: "samhain1", sym: "δ", node: "The throw", name: "Violation", gloss: "The interdiction is violated.",
      realized: "He goes after the chained birds, and for the first time in his life misses: twice with a stone, and then his spear only grazes a wing.", passage: 2 },
    { act: "samhain1", sym: "A", node: "The whips", name: "Villainy", gloss: "The villain causes harm to the hero.",
      realized: "Asleep against the pillar-stone, he sees two women in green and crimson who smile at him and beat him with horsewhips until he is nearly dead. Propp's A6, bodily injury, done smiling.", passage: 3 },
    { act: "year", sym: "a", node: "No voice", name: "Lack", gloss: "The hero lacks something.",
      realized: "His strength and his speech. A year in the wasting-bed <em>without speaking to anyone</em>.", passage: 3 },
    { act: "samhain2", sym: "B", node: "The stranger", name: "Mediation — the summons", gloss: "Misfortune is made known; the hero is approached.",
      realized: "On the eve of the next Samhain a stranger walks past the four men guarding the bed, sits on it, and sings: <em>the daughters of Áed Abrát would heal you</em>. The ones who wounded him offer the cure.", passage: 4 },
    { act: "samhain2", sym: "C", node: "To the stone", name: "Beginning counteraction", gloss: "The hero agrees to counteraction.",
      realized: "His voice comes back. Conchobar rules: <em>go back to the same stone.</em>", passage: 4 },
    { act: "samhain2", sym: "D", node: "Lí Ban", name: "The donor's offer", gloss: "The hero is tested or approached by the donor.",
      realized: "At the stone, the woman in green: <em>it was not to harm you we came</em>. Fand loves him, and Labraid will give her to him for one day's fighting. The donor is the villain of the first act.", passage: 5 },
    { act: "samhain2", sym: "E⁻", node: "Refuses", name: "Hero's reaction — refusal", gloss: "The hero reacts to the donor's offer.",
      realized: "<em>I won't go on a woman's invitation.</em> He refuses twice and sends Láeg instead. Propp's hero answers the donor. This one sends a scout.", passage: 5 },
    { act: "samhain2", sym: "G (scout)", node: "Láeg goes", name: "Guidance — by proxy", gloss: "The hero is guided to the place of his quest; here, his charioteer goes first.",
      realized: "Láeg crosses by bronze boat to the island, sees thrice fifty women and a king afraid of tomorrow, and comes back. He goes a second time, and comes back with the poems of Mag Mell. It is the only reconnaissance of the otherworld by the human side in the series.", passage: 5 },
    { act: "magmell", sym: "↑", node: "He crosses", name: "Departure", gloss: "The hero leaves home.",
      realized: "Roused by Emer's shame and Láeg's report, he passes his hand over his face, throws off his weakness, and goes with Lí Ban to the island in his chariot.", passage: 8 },
    { act: "magmell", sym: "H", node: "The battle", name: "Struggle", gloss: "Hero and villain join in direct combat.",
      realized: "Two ravens announce him. He spears Eochaid Iúil through the shoulder at the well at dawn, kills thirty-three, then Senach the Spectral. It takes one paragraph.", passage: 8 },
    { act: "magmell", sym: "I", node: "Victory", name: "Victory", gloss: "The villain is defeated.",
      realized: "Labraid's enemies are broken. Three vats of cold water cool the hero. He is not sure whether what he did was <em>a victory or a crime</em>.", passage: 8 },
    { act: "magmell", sym: "W", node: "Fand", name: "Wedding (the reward)", gloss: "The hero is married.",
      realized: "He sleeps with Fand and stays a month. Propp's wedding comes in the middle of the tale and has to be unmade.", passage: 9 },
    { act: "strand", sym: "↓", node: "Home", name: "Return", gloss: "The hero returns.",
      realized: "He takes leave of her at the end of the month and comes home. The tale does not mark the crossing at all.", passage: 9 },
    { act: "strand", sym: "Ex", node: "The knives", name: "Exposure", gloss: "The hidden is revealed.",
      realized: "Emer learns of the tryst, sharpens knives and comes with fifty women. At the strand she asks him to choose, and says <em>everything absent is perfect</em>. Fand gives him up.", passage: 9 },
    { act: "forget", sym: "K", node: "The cloak", name: "Liquidation — by forgetting", gloss: "The misfortune or lack is liquidated.",
      realized: "Fand goes back with Manannán. Cú Chulainn goes mad on the mountains. The druids bind him with spells and give him <em>the drink of forgetting</em>, and Emer one too. Manannán shakes his cloak between him and Fand. The lack is liquidated by subtraction: the otherworld is removed from his memory.", passage: 10 },
    { act: "forget", sym: "(—)", node: "Demons", name: "The scribe's verdict (outside Propp)", gloss: "Not a function: the frame re-reads the tale.",
      realized: "<em>So that was a vision of destruction worked by the people of the síd… demons… and it is these apparitions that the ignorant call síde.</em> The last move is not in the story at all. It is a judgement passed on the story.", passage: 10 },
  ],
  absent: {
    note: "Few functions are missing, and that matters for a genre the series had been defining by its gaps. What the tale bends is the interesting part.",
    groups: [
      { syms: "A = D", label: "The villain is the donor", text: "The women who whip him in the first act heal him in the third. <strong>Compare Muirchertach</strong>, where the villain issues the rules, and <strong>Regamna</strong>, where the donor gives a curse. Three tales, three ways the otherworld fuses harm and help." },
      { syms: "W ↔ ↓", label: "Wedding before return", text: "Propp's wedding is the last function. Here the hero is married in the otherworld halfway through and has to come back out of the marriage. The return is a divorce." },
      { syms: "K by subtraction", label: "Cured by forgetting", text: "Every other liquidation in Propp adds something: a bride, a treasure, a healing agent. This one takes something away. The cure is amnesia, and the god's cloak keeps the door shut." },
    ],
    verdict: "Tested against the restated hypothesis (the danger is at the threshold, at night, in either direction), this tale <strong>holds and adds a rule</strong>. Both of the hero's injuries happen at a threshold on a Samhain: the pillar-stone at the first Samhain, and the bed, crossed by a stranger, at the second. The festival is back, after Regamna had none. In the earlier tales the uncanny could not be reached for or crossed back from. Here the hero crosses into the otherworld, wins there, marries there and comes back alive. The return is survivable on one condition: <strong>the memory of the crossing is erased</strong>, and Manannán's cloak closes the door from the other side. Across five tales, the heroes who come back are the ones who forget, or who carry a death that has been postponed. Nera never comes back. Muirchertach comes back, remembers, and dies. Cú Chulainn comes back twice: from the ford with a deadline, and from Mag Mell with a cup of forgetting.",
  },
};

/* ── Desire (Greimas): four Subjects, and a forgetting that closes the diagram. */
window.SERGLIGE.desire = {
  intro: "In earlier tales the desire diagram had one or two Subjects. This one has four, and they want each other in a ring. Cú Chulainn wants Fand, Fand wants Cú Chulainn, Emer wants her husband back, and Manannán wants his wife back. Greimas's model assumes the quest ends when the Subject reaches the Object. This tale ends by deleting the Object from the Subject's memory.",
  subject: "Fand", subjectRef: "fand",
  object: "Cú Chulainn — love returned",
  value: "<em>woe to the one who gives love to someone who will not return it</em>",
  sender: "Labraid's war, which makes her the price of a day's fighting", senderRef: "labraid",
  receiver: "Fand herself — and in the end, Manannán, who takes her home",
  helpers: [
    { name: "Lí Ban", ref: "liban", note: "her sister: the invitation, the guiding, the welcome" },
    { name: "Láeg", ref: "laeg", note: "his report of Mag Mell is what finally sends the hero across" }
  ],
  opponent: "Emer, with fifty women and sharpened knives", opponentRef: "emer",
  unreachable: false,
  note: "Mirror it three ways. Cú Chulainn's axis: Object Fand, Opponent Emer, Helper Láeg. Emer's axis: Object her husband, Opponent Fand, Helper the druids. Manannán's axis: Object Fand, and no opponent at all, since he waits on the strand and she chooses him. Every Subject but the hero ends with what it wanted. The hero ends with nothing to want: he has forgotten. Of the series' Greimas diagrams, this is the only one closed by erasure instead of possession or loss."
};

/* ── Type-scenes. */
window.SERGLIGE.themes = [
  { id: "assembly", label: "the Samhain assembly", passage: 1,
    note: "The great seasonal gathering (<em>óenach</em>): games, boasts, feasting, and the custom explained. It is the frame of the tale and the fullest picture of Samhain as an institution in early Irish literature. <strong>Compare Nera</strong> (a household's Samhain), <strong>Þiðrandi</strong> (a farm's Winter Nights feast) and <strong>Muirchertach</strong> (a king's Samhain week).",
    lines: "three days before Samhain and three days after; the boasts; the swords on the thighs" },
  { id: "sickbed", label: "the visit to the sickbed", passage: 4,
    note: "The household arranged round a wasting hero, and a stranger who walks past them to the bed. <strong>Compare Regamna</strong>, where the cry from the north reaches the hero's bed.",
    lines: "Fergus, Conall, Lugaid, Ethne at the four sides; the stranger on the bed" },
  { id: "otherworld", label: "the description of the otherworld", passage: 8,
    note: "A returning traveller's verse account of the land across the water: trees of silver, a vat always full, women without number, no lies. It is the <em>imram</em> and <em>echtrae</em> type-scene. Láeg's two poems are among its finest examples.",
    lines: "the western and eastern doors; the silver tree; the vat of mead; the girl with yellow hair" },
  { id: "rivals", label: "the meeting of the two wives", passage: 9,
    note: "A wife and an otherworld lover face to face at a threshold, the strand, with the hero between them. Unique in the series, and rare in Irish: Emer's <em>only</em> jealousy.",
    lines: "fifty women with knives; the fidchell game interrupted; “everything absent is perfect”" },
];
