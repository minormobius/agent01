/* Story graph: Þiðranda þáttr against Propp's 31 functions, with
   Greimas's actants and the saga type-scenes. The finding: the þáttr is
   almost exactly Propp's PREPARATORY SECTION (α, γ, ε, η, θ, δ, A) and
   then stops. The villainy is done, the misfortune is made known (B),
   and no hero is ever dispatched. Echtra Nerai runs the spine twice.
   This tale never gets past the eighth function. Loaded after tale.js;
   attaches to window.THIDRANDI. */
window.THIDRANDI = window.THIDRANDI || {};
window.THIDRANDI.propp = {
  intro: "Propp divided his 31 functions into a <strong>preparatory section</strong> (functions β to θ: absentation, interdiction, violation, reconnaissance, delivery, trickery, complicity), the <strong>villainy</strong> (A) that starts the story proper, and then everything after: the hero's departure, the donor, the struggle and the return. <em>Þiðranda þáttr</em> is the preparatory section played almost note for note, with the interdiction, the knock, the deception, the violation and the murder, and then it <strong>stops</strong>. The misfortune is made known, and no hero sets out to repair it, because nothing can be repaired. Set beside <em>Echtra Nerai</em>, which runs the spine twice, it suggests a sharp hypothesis: <em>a ghost story is a wonder-tale that never leaves its preparatory section</em>. Below are its nine moves.",
  acts: [
    { id: "house",  label: "The house at Hof",                 color: "#9fc3e0" },
    { id: "rule",   label: "The rule",                         color: "#c9a24a" },
    { id: "knock",  label: "The knock and the field",          color: "#c96a5a" },
    { id: "after",  label: "What is left",                     color: "#8fae6a" },
  ],
  moves: [
    { act: "house", sym: "α", node: "Hof", name: "Initial situation", gloss: "The family and the hero are introduced.",
      realized: "A seer and a temple-chieftain, close friends. The chieftain's eldest son is the best-loved young man in the East Fjords and has just come home from abroad at eighteen. The tale spends unusual care on how good he is.", passage: 1 },
    { act: "house", sym: "(M)", node: "Foretold", name: "Prophecy (outside Propp's 31)", gloss: "Not one of Propp's functions: the end is told before it happens.",
      realized: "The seer falls silent at the praise, then says outright that <em>a seer will be killed at the feast</em>. Hallr tries to satisfy the words by slaughtering an ox called Seer. Propp's tales do not know their own endings. Legends of this kind usually do, so the dread comes from knowing what will happen, not from wondering whether it will. The form is in fact on the Motifs tab: M370, vain attempts to escape a prophecy.", passage: 2 },
    { act: "rule", sym: "γ", node: "Don't go out", name: "Interdiction", gloss: "An interdiction is addressed to the hero.",
      realized: "At table, before everyone: <em>no one go out tonight… and whatever signs come, let no one answer</em>. The chieftain endorses it. This is the cleanest γ in the corpus. It is addressed to the whole house, it is exact, and everyone understands it.", passage: 3 },
    { act: "knock", sym: "ε", node: "The knock", name: "Reconnaissance", gloss: "The villain makes an attempt at reconnaissance.",
      realized: "Three knocks at the door in the dead of the night. The villain tests the house to see who will answer. Every sleeper hears it and nobody moves, so the reconnaissance is answered by the one man who cannot bear the silence.", passage: 4 },
    { act: "knock", sym: "η", node: "“Guests”", name: "Trickery", gloss: "The villain attempts to deceive the victim.",
      realized: "The knock takes the form of the most ordinary sound at an Icelandic farm, a visitor hailing the door. The deception is not in any words, because there are none. It is in the form the summons takes: a duty, not a danger.", passage: 4 },
    { act: "knock", sym: "θ", node: "Complicity", name: "Complicity", gloss: "The victim submits to the deception, unwittingly helping the enemy.",
      realized: "<em>It'll be guests arriving.</em> Seeing no one, he even supplies a rational explanation for himself: riders gone ahead and come back. The complicity is pure virtue, which is hospitality and the shame of leaving guests outside.", passage: 4 },
    { act: "knock", sym: "δ", node: "Out", name: "Violation", gloss: "The interdiction is violated.",
      realized: "He takes his sword and goes out. In Propp δ follows γ directly; here the knock, the trickery and the complicity come between them, so that we watch the rule being broken in slow motion. The violation is three steps across a threshold, the same distance Nera walked.", passage: 4 },
    { act: "knock", sym: "A", node: "Black riders", name: "Villainy — murder", gloss: "The villain causes harm or injury to a member of the family.",
      realized: "Nine women in black ride from the north with drawn swords and cut him down before the nine in white from the south can reach him. In Propp's typology it is A14, murder. It is also a sacrifice, the <em>skattr</em> the old powers take on their way out.", passage: 4 },
    { act: "after", sym: "B", node: "Told", name: "Mediation — the misfortune made known", gloss: "Misfortune is made known; the hero is approached or dispatched.",
      realized: "Found at moonrise in the frost, he lives long enough to tell what he saw, and dies at first light. Hallr goes to the seer for a reading. Propp's B is the hinge where a hero would be sent, and here nobody is. The only thing dispatched is an interpretation.", passage: 5 },
  ],
  absent: {
    note: "Everything after B is missing. That gap is the structure, not an oversight: the tale has no hero to send, no donor, no struggle and no return. What the tale does instead of the second half is worth noting.",
    groups: [
      { syms: "C ↑ D–G", label: "Counteraction, departure, donor, guidance", text: "None. No one sets out after the riders, and there is nowhere to go. In place of a quest the tale has an <em>interpretation</em>, the seer's reading of who the women were and why they came. The second half of a ghost story is a gloss." },
      { syms: "H I K", label: "Struggle, victory, liquidation", text: "Þiðrandi's fight on the home-field is the only struggle, and he loses it. Nothing is liquidated: the son stays dead. The nearest thing to a K is historical, not narrative. The conversion that follows ends the old powers' claim, though too late for him." },
      { syms: "↓ · W", label: "Return and wedding", text: "The hero dies young and unmarried. The one who leaves is the <em>father</em>: Hallr cannot bear to live at Hof and moves to Þvottá. And the hills empty, <em>every living creature packing its bag</em>. In this tale it is the world that departs." },
      { syms: "Pr · Rs", label: "Pursuit and rescue", text: "The rescue is <em>attempted</em> by the white riders, who come too late. It is a Rs that fails by a few strides, which is unusual. Propp has no function for a rescue that loses the race." },
    ],
    verdict: "Tested against the series hypothesis, which says the northern autumn tales are the tales without a ↓ Return, the tale fits, more radically than Nera does. Nera loses his return at the end of a full tale. Þiðrandi never gets a departure: his whole journey is across his own home-field, and it is fatal. Two tales are enough to sharpen the hypothesis. In both, <strong>the departure is the doorstep</strong>, a few paces into the dark on the festival night, and everything otherworldly happens within sight of the house. What separates them is how much of Propp's spine survives the doorstep. Nera survives and gets a whole wonder-tale on the other side, and the price is never coming back. Þiðrandi does not, and the tale stops at the villainy. The next tales will show whether the ghost story is <em>the preparatory section alone</em>.",
  },
};

/* ── Desire (Greimas). The striking result: the human is the OBJECT. */
window.THIDRANDI.desire = {
  intro: "Greimas's six actants ask: who <em>wants</em>, and what? Run on <em>Echtra Nerai</em> they give a human Subject torn between two worlds. Run here they give something stranger. The only party in the tale that wants anything is the old powers, and what they want is the boy. <strong>The human hero is the Object.</strong>",
  subject: "the black dísir — the family's old guardian spirits", subjectRef: "black",
  object: "a tribute (skattr) from the kin they are about to lose — Þiðrandi",
  value: "what is owed to the old faith before it is abandoned",
  sender: "the change of faith (siðaskipti) itself, which ends their claim and makes them collect it now",
  receiver: "the departing powers of the old religion",
  helpers: [
    { name: "Þiðrandi's own courtesy", ref: "thidrandi", note: "his shame at leaving guests at the door is what opens it" },
    { name: "The storm", ref: "guests", note: "it keeps the guests away and leaves a half-empty house listening for arrivals" }
  ],
  opponent: "the seer's rule, and the white dísir who ride too late", opponentRef: "white",
  unreachable: false,
  note: "Every human in the tale is on the Opponent's side: the seer lays down the rule, the chieftain backs it, the household obeys it. Yet the Subject wins, because the Helper is the victim's virtue. Set beside Nera the two diagrams are mirror images. In Nera a man gets everything he wants on both sides of the hill at the price of his world. In Þiðrandi the otherworld gets what it wants from a man at the price of his life. Two tales, and the series already has its two poles: <em>the one who goes into the hill</em> and <em>the one the hill comes out for</em>."
};

/* ── Saga type-scenes. */
window.THIDRANDI.themes = [
  { id: "feast", label: "the autumn feast", passage: 3,
    note: "The <em>haustboð</em> at the Winter Nights: the great slaughter-feast of the farming year, set when the heathen sacrifices were held. The same scene frames <em>Echtra Nerai</em>, a household at a feast on the night winter begins, with food on the fire and a dare or a warning spoken at table.",
    lines: "the feast made ready at vetrnætr; few guests in the storm; the seer speaking at table" },
  { id: "warning", label: "the seer's warning", passage: 2,
    note: "A foreknowing figure foretells the death in veiled words, and the host tries to get round it. The saga scene of prophecy disregarded, as in Njáll's foreknowledge at Bergþórshváll, with the difference that here the warning is <em>obeyed</em> by everyone but one.",
    lines: "the seer's silence at the praise; “a seer will be killed”; the ox called Seer" },
  { id: "knock", label: "the knock at night", passage: 4,
    note: "The saga haunting begins at the door: something hails the house after dark, and whoever answers it is lost. Glámr rides the roofs of Þórhallsstaðir; at Fróðá the dead come in to sit by the fire. The knock-scene is the hinge of the Icelandic ghost story, and this is one of its earliest and barest forms.",
    lines: "three knocks; the household feigning sleep; the youth going out" },
  { id: "testimony", label: "the deathbed witness", passage: 5,
    note: "The dying man lives just long enough to tell what he saw. It is the legend's guarantee of truth: this is how we know.",
    lines: "found at moonrise in the frost; carried in; tells it all; dies at first light" },
];
