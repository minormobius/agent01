/* Story graph: Echtra Nerai laid against Propp's 31 functions (1928),
   with Greimas's actants and the Parry–Lord type-scenes. The tale is
   short but runs the spine twice. First comes an ordeal-and-otherworld
   arc (dare, donor test, guidance into the hill, the magical
   knowledge). Then a counter-raid arc (the warning, the raid on the
   síd, the treasure seized). The comparative payoff is in the ending,
   where Propp's last two functions are inverted: there is no ↓ Return
   and no W Wedding at home, because the hero's return and his marriage
   are both on the other side. Loaded after tale.js; attaches to
   window.NERA. */
window.NERA = window.NERA || {};
window.NERA.propp = {
  intro: "Propp argued that wonder-tales, however they differ on the surface, draw their events from one fixed sequence of <strong>31 functions</strong>. <em>Echtra Nerai</em> is a short tale, about four printed pages, and it still runs that sequence <strong>twice</strong>. The first run is an <em>ordeal arc</em>: a dare, a donor who tests the hero (here a corpse), a guided passage into the otherworld, and a magical agent, which turns out to be <em>knowledge</em>. The second is a <em>counter-raid arc</em>: a warning carried home, a raid on the villain's stronghold, and a treasure seized. The comparison is most useful at the end. Propp's closing functions are the hero's <strong>return</strong> and his <strong>wedding</strong>. Nera does both on the wrong side of the hill: he marries in the síd and goes back there for good. Twenty moves are listed below. The absences after them (no punishment of the villain, no return, no reward of a throne) show what kind of story this is.",
  acts: [
    { id: "dare",   label: "Samhain at Crúachan: the dare",             color: "#d9822b" },
    { id: "dead",   label: "The hanged man: the donor's test",          color: "#9c8fb8" },
    { id: "hill",   label: "Into the hill",                             color: "#8fae6a" },
    { id: "warn",   label: "The warning and the tokens",                color: "#c9a24a" },
    { id: "raid",   label: "The bulls, the raid, the one who stayed",   color: "#c96a5a" },
  ],
  moves: [
    { act: "dare", sym: "α", node: "Samhain", name: "Initial situation", gloss: "The family and the hero are introduced.",
      realized: "Ailill and Medb and their whole household are in Ráth Crúachan on Samhain night, cooking. Two captives hang outside from the day before. The setting is a date as much as a place: <em>demons would always appear on that night</em>.", passage: 1 },
    { act: "dare", sym: "B", node: "The dare", name: "Mediation, the connective incident", gloss: "A call goes out; the hero is approached with a request or challenge.",
      realized: "Ailill offers a reward of the man's own choosing to whoever will tie a withy round a hanged man's foot. Each man tries the night and comes straight back. Propp's B usually answers a misfortune; here the call is pure ordeal, a test of nerve for its own sake.", passage: 1 },
    { act: "dare", sym: "C", node: "I'll go", name: "Beginning counteraction", gloss: "The seeker agrees to, or decides upon, counteraction.",
      realized: "<em>I'll have the reward from you, and I'll go out.</em> Nera names his price (the gold-hilted sword) and arms himself.", passage: 1 },
    { act: "dare", sym: "↑", node: "Out", name: "Departure", gloss: "The hero leaves home.",
      realized: "Nera goes out into the dark of Samhain toward the gallows. The departure is a few steps from the door, and that is enough to leave the human world.", passage: 1 },

    { act: "dead", sym: "D", node: "The peg", name: "First function of the donor", gloss: "The hero is tested, interrogated or attacked, preparing for a magical agent or helper.",
      realized: "The withy springs off three times, and the dead man tells him how to peg it. Then comes the real test: the corpse praises his manhood and calls on it to make him carry the corpse to a drink. <em>By the truth of your valour…</em>", passage: 1 },
    { act: "dead", sym: "E", node: "Carries him", name: "The hero's reaction", gloss: "The hero reacts to the actions of the future donor.",
      realized: "<em>Come up on my back, then.</em> Nera carries the hanged man past the house with the ring of fire and the house with the ring of water to the third house, sets him down, and lets him drink and kill. Then he carries him back. He passes the test by obeying it, which is the only way to pass a test set by the dead.", passage: 2 },
    { act: "dead", sym: "A", node: "Fort burned", name: "Villainy (as vision)", gloss: "The villain causes harm or injury to a member of the family.",
      realized: "Returning, Nera finds Crúachan burned and the heads of its household heaped by warriors from the fort. The villainy has been <em>shown</em>, not done: it is a forecast of next Samhain. Propp has no slot for a villainy that has not happened yet, and this tale is built on one.", passage: 3 },
    { act: "hill", sym: "G", node: "The cave", name: "Spatial transference / guidance", gloss: "The hero is led to the whereabouts of an object of search.",
      realized: "He follows the host into the Cave of Crúachan. Its warriors pass word of him down the column (<em>a man on the track; the heavier the track</em>) and lead him, without ever turning, into the síd.", passage: 3 },
    { act: "hill", sym: "o", node: "Unrecognised", name: "Unrecognised arrival", gloss: "The hero, unrecognised, arrives home or in another country.",
      realized: "The king asks what brought him and gives him a house, a woman and the job of carrying firewood. He lives in the síd as a household servant, with nobody asking who he is.", passage: 3 },
    { act: "hill", sym: "ε", node: "The crown", name: "Reconnaissance (by the hero)", gloss: "The villain makes an attempt at reconnaissance; here inverted: the hero spies out the villain's treasure.",
      realized: "Day after day he watches the blind man carry the lame man to the well and hears <em>is it there?</em>, and he asks his wife what it means. The treasure, where it is kept and how it is guarded are all learned by watching.", passage: 4 },
    { act: "hill", sym: "F", node: "Knowledge", name: "Receipt of a magical agent", gloss: "The hero acquires the use of a magical agent.",
      realized: "The agent is information. The fairy wife tells him that the vision was a forecast, that telling it will undo it, that the síd can be struck first, and how to prove where he has been. It is the most valuable thing anyone carries out of the hill.", passage: 5 },

    { act: "warn", sym: "↓", node: "Home (no time)", name: "Return", gloss: "The hero returns.",
      realized: "He goes back up to Crúachan and finds the household still round the same cauldron. Three days and nights inside have taken no time outside. This is the only true return in the tale, and it is temporary.", passage: 6 },
    { act: "warn", sym: "Q", node: "Summer flowers", name: "Recognition (by tokens)", gloss: "The hero is recognised by a mark or token.",
      realized: "His proof is <em>the fruits of summer</em>, wild garlic, primrose and golden fern, carried into Connacht on the first night of winter. He is believed and paid his sword.", passage: 5 },
    { act: "warn", sym: "Ex", node: "The warning", name: "Exposure", gloss: "The false hero or villain is exposed.",
      realized: "The síd's plan is exposed before it is carried out: <em>they will come to destroy you on the coming Samhain night</em>. Ailill's answer, <em>we'll get to them first</em>, turns the forecast against its makers.", passage: 6 },

    { act: "raid", sym: "↑²", node: "Back in", name: "Second departure", gloss: "The hero sets out again.",
      realized: "Ailill sends him back to fetch his family and cattle before the raid. His wife has carried his firewood for a year and told the king he was sick. He resumes his place in the síd as if he had never left, and the Morrígan steals his son's cow.", passage: 6 },
    { act: "raid", sym: "H", node: "Bull v. bull", name: "Struggle", gloss: "The hero and the villain join in direct combat.",
      realized: "The struggle is moved onto the beasts. The bull-calf from the síd (sired by the Brown Bull on the Morrígan's errand) fights the Whitehorn of Connacht for a day and a night on the plain of Crúachan. The human war is fought first between animals.", passage: 8 },
    { act: "raid", sym: "J", node: "Bellow", name: "Branding (as prophecy)", gloss: "The hero is branded or marked.",
      realized: "The calf is beaten and bellows. The cowherd reads the bellow as a mark laid on the future: <em>if its father came… the Whitehorn would not be left standing in Aí</em>. Medb takes the mark as an oath.", passage: 8 },
    { act: "raid", sym: "I", node: "Síd sacked", name: "Victory", gloss: "The villain is defeated.",
      realized: "The Connachta and the Ulster exiles go into the síd and sack it, taking out everything that was in it. This is the vision of Movement III exactly reversed: the síd falls instead of Crúachan, because the vision was told.", passage: 8 },
    { act: "raid", sym: "K", node: "The crown", name: "Liquidation of the lack", gloss: "The initial misfortune or lack is liquidated.",
      realized: "The Crown of Brión is carried off to Connacht and becomes one of <em>the three wonderful gifts of Ireland</em>. The treasure Nera saw guarded by maimed men in a well is now above ground.", passage: 8 },
    { act: "raid", sym: "W⁻", node: "Stays", name: "Wedding / accession (inverted)", gloss: "The hero is married and ascends the throne.",
      realized: "Nera's marriage is in the síd, and so is his ending: <em>Nera was left with his people in the síd, and has not come out until now, nor will he come till Doom.</em> Propp's last function happens, but in the other world. The hero's reward is to be lost.", passage: 8 },
  ],
  absent: {
    note: "Propp's spine assumes a hero who leaves home, wins something and brings it back. <em>Echtra Nerai</em> has a hero who leaves home, brings something back, and then leaves again for good. What it leaves out, or turns round, tells you what kind of story it is.",
    groups: [
      { syms: "↓ · W", label: "Return and wedding", text: "Both happen on the far side. Nera's one return to Crúachan lasts a year and ends with him walking back into the hill. The tale's closing line puts his permanent home under the mound. In Propp terms the hero is <em>lost to the tale</em>, a structural position the morphology has no name for." },
      { syms: "U", label: "Punishment of the villain", text: "Nobody is punished. The síd is raided for its treasure, but its king is not killed, its host is not named, and the tale does not say what happens to them. The hanged man who killed a household is carried back to his gallows and never mentioned again." },
      { syms: "Pr · Rs", label: "Pursuit and rescue", text: "None. The síd never pursues, and nobody is rescued. The only rescue is the warning itself, which happens before the harm." },
      { syms: "L · M · N", label: "False claims, difficult task, solution", text: "Absent. The one difficult task, pegging a withy onto a corpse, is set at the start and solved with the dead man's help." },
      { syms: "A (as vision)", label: "A villainy that has not happened", text: "The tale's main originality. Propp's villainy is something done. Nera's is something <em>seen</em>, a forecast that can be undone by being told (<em>that will come true, unless he tells it</em>). The tale's whole second half depends on this." },
    ],
    verdict: "Propp's morphology was built on Russian tales whose heroes come home. Run against it, this Irish otherworld tale has every function up to the return and then a hole where the return should be. That hole is what makes it a ghost story. The hero has been <em>transferred</em>: he crosses into the other world and does not come back, and every later Irish and Scottish tale of the man who goes into the hill and stays there (from <em>Echtrae Chonnlai</em> to Thomas the Rhymer and Tam Lin's seven-year tithe) is a member of the same family. The spine of this Samhain series is a sequence of tales with no ↓.",
  },
};

/* ── Desire (Greimas's actantial model). */
window.NERA.desire = {
  intro: "Beneath the morphology runs what drives it: <strong>desire</strong>. Greimas read every tale as six actants on three axes. A Subject wants an Object; a Sender dispatches the Subject toward it for a Receiver; a Helper and an Opponent aid and block the wanting. This is not the Character web (who is bound to whom). It is the single structure of <em>wanting</em>, and <em>Echtra Nerai</em>'s Subject turns out to want two incompatible things.",
  subject: "Nera", subjectRef: "nera",
  object: "safety — of Crúachan from the síd, and then of his family from Crúachan",
  value: "loyalty owed both ways across the hill",
  sender: "Ailill — first with the dare, then with the order to fetch his family out before the raid", senderRef: "ailill",
  receiver: "Crúachan, which is saved, and the household in the síd, which escapes the sack",
  helpers: [
    { name: "The woman of the síd", ref: "wife", note: "she gives the knowledge that saves Crúachan, and covers for him in the síd for a year" },
    { name: "The hanged man", ref: "captive", note: "an appalling helper: his ride is the price of entry, and it is on the way back from it that the vision appears" }
  ],
  opponent: "the host of the síd, who mean to burn Crúachan at the next Samhain", opponentRef: "sidking",
  unreachable: false,
  note: "The actants split along the hill. For the first half Nera is Crúachan's man: Ailill sends him, the síd opposes him, and the fairy wife helps him against her own people. Then the axes fold. The Object he brings out of the síd (his wife, son and drove) is exactly what the raid would destroy, and the Sender who ordered the raid is the one who tells him to save them. Nera gets both Objects, and he can keep them only by leaving one world for the other. The diagram resolves the way the tale does, by losing the Subject."
};

/* ── Theme (Parry–Lord oral type-scenes). */
window.NERA.themes = [
  { id: "feast", label: "the feast and the dare", passage: 1,
    note: "The hall on a festival night, food on the fire, the king calling for a feat. The same type-scene opens <em>Fled Bricrenn</em> and <em>Scéla Mucce Meic Dathó</em>; here the feat is going out into the dark rather than a fight for the hero's portion.",
    lines: "Ailill and Medb in Crúachan on Samhain night; the cooking; the offer of a reward" },
  { id: "houses", label: "the three houses", passage: 2,
    note: "A triad of approaches (fire, water, the open door) in which the third succeeds. Triads organise the whole of early Irish learning, and the three-house sequence is a teaching device built into the plot: each refusal states a household rule.",
    lines: "a lake of fire round the first house; a lake of water round the second; the drink in the third" },
  { id: "cattle", label: "the cattle-drive", passage: 7,
    note: "The <em>táin</em> type-scene itself, a beast driven across a province by a supernatural drover and challenged at a border. This tale and <em>Táin Bó Regamna</em> stage it in miniature before the Táin stages it as a war.",
    lines: "the Morrígan with the cow; Cú Chulainn on the plain of Muirthemne; “this drove will not be taken”" },
  { id: "oath", label: "the vow before battle", passage: 8,
    note: "The hero's (here the queen's) oath of abstention — no sleep, no food, no ale until the deed is done — sworn <em>by the gods my people swear by</em>. The Ulster Cycle's formula for committing to a war.",
    lines: "Medb's oath: not to lie down, eat or drink until she sees the two bulls fight" },
];
