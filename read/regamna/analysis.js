/* Story graph: Táin Bó Regamna against Propp, with Greimas and the
   type-scenes. The finding: the hero meets a DONOR and receives a CURSE.
   The encounter is shaped exactly like Propp's donor sequence (summons,
   departure, test, reaction), and what is handed over is a fixed
   deadline instead of a magical agent. And the hero returns safely. The
   doom is deferred, and this tale's ↓ Return is safe in the short run
   because the death is held in keeping. Loaded after tale.js;
   attaches to window.REGAMNA. */
window.REGAMNA = window.REGAMNA || {};
window.REGAMNA.propp = {
  intro: "Short as it is, this tale is cut exactly to the shape of Propp's <strong>donor sequence</strong>. There is a summons in the night, a departure, guidance by a helper, a stranger on the road who tests the hero, and the hero's reaction. Then comes the moment where the donor should hand over a magical agent, and what she hands over is a <strong>deadline</strong>: <em>you will live until this calf is a yearling.</em> Then the hero goes home, safely. The ↓ Return that killed Muirchertach costs Cú Chulainn nothing yet. His death has been <em>deferred</em>, and the instruments on the hub had no way to say so until this tale. Below are eleven moves.",
  acts: [
    { id: "night",  label: "The cry in the night",          color: "#d64a52" },
    { id: "road",   label: "The road and the ford",         color: "#c9a24a" },
    { id: "names",  label: "Names and masks",               color: "#9c8fb8" },
    { id: "curse",  label: "The deadline and the shapes",   color: "#6f9ac9" },
  ],
  moves: [
    { act: "night", sym: "α", node: "Asleep", name: "Initial situation", gloss: "The hero is introduced.",
      realized: "The greatest hero of Ulster, asleep in his own house at Dún Imrith. The tale starts in bed, which is the innermost ring of every threshold map in the series.", passage: 1 },
    { act: "night", sym: "B", node: "The cry", name: "Mediation — the call", gloss: "A call goes out; the hero is summoned.",
      realized: "A cry from the north, <em>horrible and terrifying</em>, coming straight for him. He is thrown out of bed like a sack. Propp's B is usually a messenger or a misfortune. Here it is a sound, and nobody sends it.", passage: 1 },
    { act: "night", sym: "↑", node: "Out, unarmed", name: "Departure", gloss: "The hero leaves home.",
      realized: "He goes out <em>without his weapons</em>, and his wife runs after him with his weapons and clothes. In the series' terms this is the doorstep crossing, made in panic and unprepared.", passage: 1 },
    { act: "road", sym: "G", node: "Láeg", name: "Guidance", gloss: "The hero is led toward the object of search.",
      realized: "Láeg arrives with the chariot already harnessed: <em>north-west, along the great road to Caill Cuan.</em> They drive to the Ford of the Two Graves.", passage: 1 },
    { act: "road", sym: "D", node: "The stranger", name: "First function of the donor — the encounter", gloss: "The hero meets the donor, who tests or questions him.",
      realized: "A red woman in a chariot drawn by a one-legged horse, a big man, and a cow. The test is a quarrel about property: <em>that cow isn't happy being driven by you… The cows of Ulster are mine.</em>", passage: 2 },
    { act: "names", sym: "ε⁻", node: "Names", name: "Reconnaissance, refused", gloss: "Information is sought; here the hero seeks it, and is denied.",
      realized: "He asks for names and gets <em>Cold-Wind-and-Plenty</em> and <em>Edge-Little-Mouth… Plenty-and-Terror</em>. He asks for a true name at spear-point and gets a false trade, a satirist paid with a cow. In the series the otherworld never gives a true name.", passage: 3 },
    { act: "names", sym: "E", node: "The leap", name: "The hero's reaction", gloss: "The hero reacts to the donor.",
      realized: "He leaps into the chariot with his feet on her shoulders and his spear on her skull, and demands her name. Propp's hero passes the donor's test by courtesy. This one fails it by force, and the donor's gift turns to its opposite.", passage: 3 },
    { act: "curse", sym: "D2031", node: "Vanished", name: "Disenchantment (the illusion falls)", gloss: "Outside Propp: the apparition dissolves into its true form.",
      realized: "Horse, woman, chariot, man and cow are all gone, and a black bird sits on the branch. <strong>Compare Muirchertach</strong>, whose armies fall back into stones under the Cross. There the dissolving saves the hero's sight. Here it only shows him who he has insulted.", passage: 4 },
    { act: "curse", sym: "F⁻", node: "The deadline", name: "The anti-gift: a curse in place of an agent", gloss: "Not in Propp: the donor gives the hero a doom instead of a magical agent.",
      realized: "<em>I am guarding your death, and I will be… You will be alive until the calf in this cow's womb is a yearling.</em> In Muirchertach the agent was given and refused. Here no agent is given at all, and the donor hands over a fixed term of life.", passage: 4 },
    { act: "curse", sym: "M", node: "Three shapes", name: "Prophecy — and counter-prophecy", gloss: "Outside Propp: the future is told, point by point.",
      realized: "Eel, she-wolf, red-eared heifer. Each threat is answered by Cú Chulainn's own, to break her ribs, her eye and her leg, and each ends <em>you will never have healing from me</em>. Two prophets bind each other, and in the Táin both sets of promises come true.", passage: 5 },
    { act: "curse", sym: "↓", node: "Home", name: "Return — safe, for now", gloss: "The hero returns.",
      realized: "<em>Cú Chulainn went back to his own house.</em> And the Morrígan, in the Egerton text, goes back with her cow into the síd of Crúachan. Both parties go home. The hero is unharmed tonight, and his death is in safe keeping.", passage: 5 },
  ],
  absent: {
    note: "The tale is a single donor-encounter, so most of Propp's spine is absent by design. What matters is how the encounter is bent.",
    groups: [
      { syms: "A", label: "No villainy — yet", text: "Nothing is stolen from the hero and nothing is done to him. The only theft is the Morrígan's, of a cow from the síd (told in Nera), and that serves her. The harm in this tale is all <em>future tense</em>." },
      { syms: "F → F⁻", label: "The anti-gift", text: "Nera receives knowledge from his donor. Muirchertach receives the Cross and refuses it. Cú Chulainn receives a deadline. Three tales, three ways the otherworld's gift can go." },
      { syms: "H · I", label: "No struggle, no victory", text: "The struggle is verbal: threat against threat, three times over. The real fights are scheduled for the Táin." },
      { syms: "Festival", label: "No festival", text: "This is the first tale in the series with no date. Nothing says Samhain or the Winter Nights. It is simply night, and a cry. (Indirectly it falls in the year between Nera's two Samhains, because the cow is stolen during that year.)" },
    ],
    verdict: "Tested against the restated hypothesis (the danger is at the door of the house on the festival night, in either direction), this tale <strong>breaks one word of it</strong>. There is no festival. Everything else holds. It is night, the summons comes to the house, the hero is thrown from his bed across the threshold unprepared, and the encounter happens at a ford named for two graves, a threshold on the open road. He comes home safe, but only because his death has been <em>deferred</em>: the Morrígan keeps it, the way a herd keeps a calf until it is grown. Two sharpenings follow for the hub. First, the hypothesis should say <em>night</em>, not <em>festival night</em>. The festival is how three of these tales date the night, but it is not what makes it dangerous. Second, the threshold map needs a way to show a crossing that is safe now and fatal later, because this tale is made of one.",
  },
};

/* ── Desire (Greimas). */
window.REGAMNA.desire = {
  intro: "Two Subjects again, as in Muirchertach, but this time they want the <em>same</em> Object: the cow. Who gets to drive a cow across Ulster is the whole Táin in miniature, and it is settled by force and by prophecy.",
  subject: "the Morrígan", subjectRef: "morrigan",
  object: "the cow — and in her womb, the war",
  value: "the Táin itself; and the keeping of a hero's death until it is due",
  sender: "the síd of Crúachan, out of which she brought the cow",
  receiver: "the Brown Bull's line, and the war that the calf will cause",
  helpers: [
    { name: "The big man with the hazel staff", ref: "man", note: "drives the cow and will not speak" },
    { name: "Her masks", ref: "satirist", note: "false names and a false trade, to hold the hero off" }
  ],
  opponent: "Cú Chulainn, whose claim is that every cow in Ulster is his", opponentRef: "cuchulainn",
  unreachable: false,
  note: "Mirrored, Cú Chulainn's axis has the same Object (the cow, as the property of Ulster) and the same opponent (her), and his helpers are Láeg and his wife's running feet. Neither wins tonight. She keeps the cow and he keeps his life, both for now. Greimas's model has no term for an Object that is held in escrow, and this tale is all escrow."
};

/* ── Type-scenes. */
window.REGAMNA.themes = [
  { id: "summons", label: "the cry in the night", passage: 1,
    note: "The hero woken in bed by a terrible cry is a recurrent Ulster-cycle opening (the <em>Badb</em> crying over the hosts before battle; the cry heard across the plain). <strong>Compare Þiðranda þáttr</strong>, whose knock also comes to a sleeping house and is answered by the one who will not lie still.",
    lines: "a cry from the north; the hero thrown from his bed; out without weapons" },
  { id: "ford", label: "the meeting at the ford", passage: 2,
    note: "The ford is the place of the Irish hero's single combats and of otherworld encounters: a boundary between territories, between land and water. The Washer at the Ford, washing the armour of the man about to die, is the Morrígan's other famous station.",
    lines: "Áth dá Ferta, the Ford of the Two Graves; the rattle of a chariot" },
  { id: "flyting", label: "the exchange of threats", passage: 5,
    note: "Three threats and three counter-threats in fixed formulas, ending each time <em>you will never have healing from me</em>. A flyting in miniature, the verbal duel that precedes the physical one.",
    lines: "eel / ribs; she-wolf / eye; red-eared heifer / leg" },
];
