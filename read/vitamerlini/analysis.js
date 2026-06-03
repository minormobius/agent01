/* Vita Merlini — Layer 4 (Propp story graph) plus the Desire (Greimas) and
   Theme (Parry–Lord type-scene) lenses.

   COMPLETE. The Vita is an unusual Propp subject precisely because it bends
   the morphology: the "lack" is the hero's own lost reason, the "departure"
   is a flight FROM society rather than a quest out of it, the lack is
   liquidated by a spring (given, not won), the final reward is REFUSED, and
   the long discourses (cosmology, Avalon, the chronicle, the springs and
   birds) fall outside narrative function altogether. The Desire lens reads
   straight off the poem's deepest line, at the cure: Merlin's Object was
   never a kingdom or a wife but his own ordinary mind. Attaches to
   window.VITAMERLINI.propp / .desire / .themes. */
window.VITAMERLINI = window.VITAMERLINI || {};

window.VITAMERLINI.propp = {
  intro: "The <em>Vita Merlini</em> is not a wonder-tale, and laying it against Propp's thirty-one functions shows exactly how it is not. The morphology threads the poem's <em>biography</em> — the madness, the cure, the refused crown — but cannot touch its <em>encyclopedia</em>: the cosmology, the Isle of Apples, the chronicle of kings, the catalogues of springs and birds have no narrative function at all. And where the functions do fire, they fire <em>inverted</em>: the hero flees society instead of questing out of it, his lack is his own reason, his cure is given by a fountain rather than won, and his reward — the throne offered back — he turns down. The spine below is the wonder-tale buried inside the encyclopedia; the <strong>Desire</strong> lens names what it is really about.",
  acts: [
    { id: "madness",  label: "Arfderydd; grief; the flight to the wood", color: "#c9a24a" },
    { id: "firstcure", label: "The harp; the court; the leaf",            color: "#6f9ac9" },
    { id: "trick",    label: "The threefold death; the stag-ride",        color: "#b0563b" },
    { id: "prophet",  label: "The laughs; the observatory; the prophecy", color: "#9a6f9a" },
    { id: "discourse", label: "Taliesin; the cosmos; Avalon; the chronicle", color: "#c97f9a" },
    { id: "cure",     label: "The healing spring; the crown refused; the fellowship", color: "#8aa363" },
  ],
  moves: [
    { act: "madness", sym: "α", node: "Setting", name: "Initial situation", passage: 1,
      gloss: "The hero and his world are introduced.",
      realized: "Merlin is named a king and a prophet of the Demetae — the South Welsh — who gives laws to his people and sings the future to their war-leaders. The double office, <em>rex et vates</em>, is the whole poem in miniature: a man who rules and a man who raves. It is the high, stable point from which everything falls." },
    { act: "madness", sym: "A", node: "The slaughter of Arfderydd", name: "Villainy", passage: 1,
      gloss: "A harm is done — but here by war and fate, not by any villain.",
      realized: "At the battle of Arfderydd, three brothers who had followed the prince through his wars are cut down together. There is no villain to defeat: the harm is done by war itself, and the wound is grief. The poem's distinctive opening — the \"villainy\" function filled by a bereavement, with no antagonist anywhere in the tale to punish or overcome." },
    { act: "madness", sym: "a", node: "The reason lost", name: "Lack", passage: 1,
      gloss: "Something is missing that the tale must restore.",
      realized: "What Merlin lacks is his own mind. Grief past consolation tips into madness — \"new fury seized him\" — and his reason is gone. This is the lack the entire poem, across fifteen movements, exists to liquidate; and uniquely in the corpus it is <em>internal</em>: the Object of the quest is the hero's own self." },
    { act: "madness", sym: "↑", node: "Flight to the wood", name: "Departure (inverted)", passage: 1,
      gloss: "The hero leaves home — here, runs from the human world entirely.",
      realized: "Propp's hero departs to seek and repair the lack abroad; Merlin departs <em>away</em> from all seeking, fleeing into the Caledonian Wood to live as a beast. The departure function is turned inside out: the journey is not outward toward a remedy but inward and downward, into the wild and into the self. The whole first movement is a descent, ending at the winter lament to the grey wolf." },
    { act: "firstcure", sym: "B", node: "Ganieda's search", name: "Mediation", passage: 2,
      gloss: "The lack is made known; searchers are dispatched.",
      realized: "Merlin's sister Ganieda, grieving, sends retainers into the woods and far fields to find and recall him. The dispatch comes not from a king commissioning a champion but from a sister's love — and it sets in motion the relay of finders that will reach, link by link, into the wild." },
    { act: "firstcure", sym: "F", node: "The cithara", name: "Receipt of a magical agent", passage: 2,
      gloss: "The hero gains the magic means that will work the change.",
      realized: "The magical agent of this tale is music. The messenger climbs to the spring where Merlin sits raving and, hidden behind him, plays a cithara and sings of his wife's and sister's grief. The harp's sweetness — not its argument — does what no chain or reasoning could: it is the Orphic instrument, the same power <a href=\"/orfeo/\"><em>Sir Orfeo</em></a> turns on the Otherworld." },
    { act: "firstcure", sym: "↓", node: "Led back to the city", name: "Return", passage: 2,
      gloss: "The hero comes back.",
      realized: "Moved \"at the name\" of his sister and wife, Merlin recovers his reason and asks to be led to Rhydderch's court. But the return is fragile and social — it holds only as long as the music and the names do — and the movement closes on the word <em>urbem</em>, the city, the exact opposite of the wood, where the cure will at once break." },
    { act: "firstcure", sym: "M", node: "The riddle of the laugh", name: "Difficult task", passage: 3,
      gloss: "A task is set the hero.",
      realized: "Relapsed and chained at court, Merlin laughs — once — when the king plucks a leaf from the queen's hair, and the whole court demands to know why. The task of the poem's middle is always the same: to make the prophet explain a laugh, and so drag his buried second sight into the open." },
    { act: "firstcure", sym: "N", node: "The leaf revealed", name: "Solution", passage: 3,
      gloss: "The task is accomplished — and ransomed.",
      realized: "Merlin solves it, and names the price: his freedom. Released, he reveals that the leaf is the witness of Ganieda's tryst in the bushes — the king \"blamed and praised by the same act.\" His sight is proven; but the prophet's curse is that he cannot help being disbelieved, as the next movement shows." },
    { act: "trick", sym: "L", node: "The threefold death", name: "False discrediting", passage: 4,
      gloss: "A false claim overturns the true hero.",
      realized: "Ganieda's counter-trick: she shows Merlin one boy three times, disguised, and asks how he will die — rock, tree, river. Three deaths for one child seem absurd, the court laughs the prophet down, and the leaf is buried. The true prophet is made to look a liar; only years later, when the boy dies all three deaths at once, is he vindicated — too late to matter." },
    { act: "trick", sym: "Pr·Rs", node: "The stag-ride", name: "Pursuit and capture", passage: 5,
      gloss: "The hero, breaking loose, is pursued and retaken.",
      realized: "Reading in the stars that his freed wife is remarrying, Merlin gathers the herds of the forest, rides the lead stag to the wedding-feast, and kills the bridegroom with the stag's torn-off antlers. He flees, but the river foils him as it drowned the boy; he is caught swimming and handed back, bound, to Ganieda. The wild crashing into the hall, and the cage closing again." },
    { act: "prophet", sym: "M·N", node: "The threefold laugh", name: "Task and proof", passage: 6,
      gloss: "The hero is tested again, and proven.",
      realized: "Led through the market, Merlin laughs at a beggar sitting on a buried hoard and at a man buying shoes he will never wear (already drowned). Both are proved true within the hour — the treasure dug up, the body found — and this time the proof buys his freedom outright. The prophet's gift, doubted since the threefold death, is vindicated; he uses the moment to leave the court for good." },
    { act: "prophet", sym: "—", node: "The seventy-doored house", name: "The vocation (no function)", passage: 7,
      gloss: "Outside the morphology: the prophet's gift made manifest.",
      realized: "Ganieda builds Merlin an observatory of seventy doors and seventy windows, with seventy scribes, and from it he prophesies the whole future of Britain. Here the wonder-tale stops and the prophetic poem begins: vaticination is not a Propp function. From this point the morphology thins to almost nothing, as the poem turns to prophecy, philosophy, and chronicle." },
    { act: "discourse", sym: "K′", node: "Arthur borne to Avalon", name: "The mirror-cure", passage: 9,
      gloss: "A doubled liquidation: the king's healing rhymes with the prophet's to come.",
      realized: "In Taliesin's discourse the wounded Arthur is carried over the sea to Morgen on the Isle of Apples, to be healed \"if he stays a long time.\" It is the poem's structural rhyme: the king borne to an otherworld of healing prefigures the prophet about to be healed by a spring. Two afflicted men, two waters of restoration — Avalon and the Caledonian fountain — set three movements apart." },
    { act: "cure", sym: "K", node: "The healing spring", name: "Lack liquidated", passage: 12,
      gloss: "The missing thing is restored.",
      realized: "A new spring breaks from the hills; Merlin, caught by simple thirst, drinks, and the madness lifts — \"his reason recovered again.\" The pivotal function of the whole poem, and its strangest: the lack is liquidated not by the hero's deed nor a helper's gift but by <em>water</em>, the cure given rather than won, and explained (by Taliesin) as plain hydrology. The Object of the inward quest — his own mind — is attained at last." },
    { act: "cure", sym: "W", node: "The crown refused", name: "Reward (declined)", passage: 14,
      gloss: "The hero is offered the reward — and turns it down.",
      realized: "The morphology ends in a wedding or a throne; the <em>Vita</em> ends in a refusal. Offered his kingship back, the sane Merlin declines it — he is older than the oak, and \"content with apples and herbs,\" he will keep to Caledonia and cleanse his flesh with fasting. The reward function, inverted: the hero rejects the crown for a hermit's peace. Unique in the corpus." },
    { act: "cure", sym: "T", node: "The woodland fellowship", name: "Transfiguration & transfer", passage: 15,
      gloss: "A new and final equilibrium.",
      realized: "Maeldin, a second madman, is healed by the same spring and gathered in; Taliesin and Ganieda join; and the prophetic gift passes from Merlin to his sister, who speaks the poem's last vaticination. The new equilibrium is not a restored kingdom but a contemplative fellowship in the woods — and the wild man's affliction, transfigured, has become a chosen vocation that draws others to it." },
  ],
  absent: {
    note: "With the whole poem rendered, the <em>Vita Merlini</em>'s Propp profile — set beside the Welsh and Middle-English sister-tales on this site — rests on four features, every one of them an inversion or an absence:",
    groups: [
      { syms: "a · K", label: "The lack is the hero's own mind",
        text: "In every sister-tale the lack is external — a stolen wife, a withheld bride, a fountain to be held, a daughter to be won. Here it is <em>internal</em>: what Merlin lacks is his own reason, and the quest is wholly inward. And its liquidation (K) is the strangest in the corpus — not won by the hero, not given by a donor, but <em>broken from the earth</em> as a spring, the cure handed to him by nature and afterward explained as hydrology. The one tale whose Object is the hero's self." },
      { syms: "↑ · W", label: "Departure inverted, reward refused",
        text: "The frame functions run backwards. The departure (↑) is a flight <em>from</em> society into the wild, not a quest out of home; and the closing reward (W) — the throne offered back — is <em>declined</em>, the hero choosing the woods over the crown. Where Pwyll, Owain and the rest end in marriage, office, or restored rule, Merlin ends in a refusal and a hermitage. No wedding, no coronation; a renunciation." },
      { syms: "—", label: "Half the poem is outside the morphology",
        text: "The whole back two-thirds — Taliesin's cosmology, the Isle of Apples, the chronicle of the Saxon wars, the catalogues of springs and birds — has <em>no narrative function at all</em>. Propp's spine threads only the biography of the madman; the encyclopedia hung upon it is invisible to the morphology. The <em>Vita</em> is a short wonder-tale wrapped inside a long compendium of the world." },
      { syms: "∅", label: "No villain, no struggle, no victory",
        text: "There is no antagonist to overcome: the harm is grief and war, the opponent is the hero's own affliction, and the central functions of combat — struggle (H), victory (I), pursuit-and-rescue as a duel — barely register. The one act of violence the hero does (killing the bridegroom) is a symptom of his madness, not a victory over a foe. A wonder-tale with no one to defeat." },
    ],
    verdict: "So the morphology, honestly applied, mostly reports what the <em>Vita Merlini</em> is <em>not</em>: not a quest, not a combat, not a courtship. What it leaves standing is a bare, inverted spine — a man unmade by grief, fleeing inward, cured by water, refusing the world — around which Geoffrey has wound the largest body of learning in any tale on this site. The story is the thread; the poem is the encyclopedia strung on it. To find what the thread is really about, read the Desire lens.",
  },
};

window.VITAMERLINI.desire = {
  intro: "Beneath the morphology runs the engine the morphology brackets out: <strong>desire</strong>. Greimas read every tale as six actants on three axes — a Subject who wants an Object, a Sender who dispatches it toward a Receiver, and a Helper and an Opponent who aid and block the wanting. For most tales the Object is a person or a prize. The <em>Vita Merlini</em> is the one whose Object is the Subject himself: what Merlin wants, under the kingdom and the wife and the gift of prophecy, is to be given back to his own ordinary mind.",
  subject: "Merlin",
  subjectRef: "merlin",
  object: "his own lost reason — sanity, an ordinary human mind, to be \"given back to himself\"",
  value: "peace; release from a prophetic sight that \"denied the human mind its natural rest\"",
  sender: "the grief of Arfderydd — the slaughter of his companions that unmakes his reason and sets the whole long return in motion",
  senderRef: "brothers",
  receiver: "Merlin himself — Subject and Receiver are one, the quest wholly inward",
  receiverRef: "merlin",
  helpers: [
    { name: "Ganieda", ref: "ganieda", note: "the sister who sends the searchers, keeps and feeds him, builds his observatory, and tends his returning — present at every stage of the long cure" },
    { name: "the harper-messenger", ref: "messenger", note: "the cithara that first beguiles the madness back to reason, the Orphic agent of the first recovery" },
    { name: "Taliesin", ref: "taliesin", note: "the philosopher-friend whose discourse on the ordered world frames the cure, and who explains the healing spring as nature, not miracle" },
    { name: "the healing spring", note: "the decisive helper, and no person at all: the fountain that breaks from the earth and lifts the madness when he drinks — the cure given by the world itself" },
  ],
  opponent: "Merlin's own affliction — the madness, and the prophetic gift itself, which he names at the cure as the torment that robbed his mind of its natural rest",
  unreachable: false,
  note: "The arrow reaches its Object — Merlin is cured — but the diagram's strangeness is that Subject, Object, and Receiver collapse into one man: the wanting is wholly inward, a self trying to recover itself. The Sender is not a king or a quest but a grief; the decisive Helper is not a person but a spring; and the Opponent is internal — not a rival or a monster but Merlin's own raving, and, more deeply, his own second sight. At the moment of attainment he realises that the gift the whole world prizes was itself the enemy of his peace: \"I had been rapt away from my own self … this tormented me, and denied my human mind its natural rest.\" The Object he reaches, and the Opponent he escapes, turn out to be the same thing — himself.",
};

window.VITAMERLINI.themes = [
  {
    id: "lament", label: "the lament / the wild man", passage: 1,
    note: "The poem's signature type-scene, sounded again and again: Merlin's grief-cry over the slain at Arfderydd, and the great winter lament to the grey wolf in the snow — grief past speech, the voice that drives him into the <em>gwyllt</em>. The wild-man lament is the kernel the whole Myrddin tradition grows from; it returns as Ganieda's lament for the dead Rhydderch (movement VIII).",
    lines: "the apostrophe to the slain youths; the winter cry to the starving wolf",
  },
  {
    id: "feast", label: "the feast in hall", passage: 3,
    note: "Rhydderch's hall — the welcome-feast that turns to relapse, the chain, the gifts the wild man spurns, and the single fatal laugh at the leaf. The hall set-piece as the place where the wild and the court collide; darkly echoed by the wedding-feast Merlin invades on a stag (movement V).",
    lines: "the king's gifts held out and refused; the leaf plucked from the queen's hair",
  },
  {
    id: "supplication", label: "the supplication", passage: 4,
    note: "Guendoloena, summoned, comes as a suppliant and begs Merlin to stay; Ganieda pleads with starting tears. The suppliant-at-the-threshold type-scene — the petition that the departing hero refuses, sharpening his turn away from the human world.",
    lines: "the wife on her knees; the tearing of hair; the prayer to remain, spurned",
  },
  {
    id: "voyage", label: "the voyage to the Otherworld", passage: 9,
    note: "The sea-crossing to the Isle of Apples, bearing the wounded Arthur, with Barinthus — \"to whom the waters and the stars were known\" — at the helm. The otherworld-voyage type-scene, the ship that carries the king out of the world to be healed; kin to Branwen's crossing to Ireland and to the immram voyage-tales.",
    lines: "the ship steered by the star-wise pilot; the king laid on the golden bed",
  },
  {
    id: "threshold", label: "the crossing / the marked place", passage: 12,
    note: "The new spring as the threshold of the cure — the marked place by the water where Merlin crosses back from madness to reason. It rhymes with the spring on the mountaintop where the messenger first found him raving (movement II): the same element, the same posture, now turned from affliction to healing.",
    lines: "the fountain risen from the turf; the draught that settles the inner vapour",
  },
  {
    id: "council", label: "the council / the assembly", passage: 14,
    note: "The dukes and nobles gather to beg the healed Merlin to take up his sceptre and rule again — the assembly type-scene, here met with refusal. The council that would restore the king to the world is answered by the oak speech and the choice of the woods.",
    lines: "the gathered leaders; the offered crown; the refusal for apples and herbs",
  },
];
