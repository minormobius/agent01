/* Story graph: Thomas of Erceldoune against Propp, with Greimas and the
   type-scenes. The finding: a full spine (interdiction, violation,
   abduction, guidance, a kept taboo, a danger, a rescue, a return, a
   magical agent), but the one figure fills villain, donor and rescuer at
   once, and the reward is knowledge rather than a bride. The return is
   survived, and marked. Loaded after tale.js; attaches to window.THOMAS. */
window.THOMAS = window.THOMAS || {};
window.THOMAS.propp = {
  intro: "On Propp's spine this is nearly a complete wonder-tale. There is an interdiction and its violation, an abduction, a journey through darkness, a taboo kept, a danger, a rescue, a <strong>return</strong>, and a magical agent brought home. What it bends is the cast. <strong>One figure fills every role on the other side</strong>: the lady sets the rule, takes him, guides him, tests him, rescues him and gives him the gift. The danger is a figure who never appears. And the reward is not a bride (the bride is someone else's wife) but <strong>knowledge</strong>: a tongue that cannot lie, and the future. Below are fourteen moves.",
  acts: [
    { id: "bank",  label: "Huntley Banks: the meeting",          color: "#b07ac9" },
    { id: "hill",  label: "Under the hill: the dark and the roads", color: "#7fb39a" },
    { id: "hall",  label: "The hall: three years",               color: "#c9a24a" },
    { id: "tree",  label: "The tree again: the gift and the future", color: "#6f9ac9" },
  ],
  moves: [
    { act: "bank", sym: "α", node: "Huntley Banks", name: "Initial situation", gloss: "The hero is introduced.",
      realized: "A May morning, birds in full song, and a man lying alone under a tree <em>in longing</em>, making his moan. No household, no festival, no feast: the series' first hero who is alone when it begins.", passage: 2 },
    { act: "bank", sym: "γ", node: "“Let me be”", name: "Interdiction", gloss: "An interdiction is addressed to the hero.",
      realized: "<em>That sin will undo all my beauty. I pray thee, Thomas, let me be.</em> Given by the otherworld woman herself, with its cost stated in advance.", passage: 4 },
    { act: "bank", sym: "δ", node: "Seven times", name: "Violation", gloss: "The interdiction is violated.",
      realized: "He pledges his troth <em>whether to heaven or to hell</em>, and she gives in: <em>yet thou shalt have all thy will</em>. Seven times he lies with her.", passage: 4 },
    { act: "bank", sym: "A", node: "Taken", name: "Villainy — abduction", gloss: "The villain causes harm.",
      realized: "Her beauty is ruined, as she said (black and grey, and lead), and she claims him: <em>this twelvemonth shalt thou with me gang … for thy troth thou hast me tane</em>. Propp's A1, the abduction, with the hero as the one abducted, by his own pledge.", passage: 5 },
    { act: "hill", sym: "↑", node: "Into the hill", name: "Departure", gloss: "The hero leaves home.",
      realized: "He commends his soul to Jesus <em>wherever my bones shall go</em>, takes leave of sun and moon, and is led in at Eildon Hill.", passage: 6 },
    { act: "hill", sym: "G", node: "Three days of dark", name: "Spatial transference", gloss: "The hero is led to the place of his quest.",
      realized: "Three days in midnight murk, with water to the knee and nothing but the soughing of the flood. Then a garden of pears, dates and figs.", passage: 6 },
    { act: "hill", sym: "γ²", node: "The fruit", name: "Second interdiction — kept", gloss: "A second prohibition; this one is obeyed.",
      realized: "<em>If thou pluck it, thy soul goes to the fire of hell.</em> Half-faint with hunger, he lets the fruit stand. The first rule he broke; this one he keeps.", passage: 6 },
    { act: "hill", sym: "D", node: "Five roads", name: "The donor — the vision", gloss: "The hero is tested, or shown something, by the donor.",
      realized: "Head on her knee, he is shown the roads to heaven, paradise, purgatory and hell, and a fifth to her castle. Then the test: <em>whatsoever any man to thee say, look thou answer none but me</em>.", passage: 7 },
    { act: "hall", sym: "E", node: "Silence", name: "Hero's reaction — passes the test", gloss: "The hero meets the donor's demand.",
      realized: "He stands <em>still as stone</em> and goes mute into a hall of harps and blood and dancing. The poem never says he speaks there, or eats.", passage: 8 },
    { act: "hall", sym: "Pr", node: "The teind", name: "Pursuit — the danger", gloss: "The hero is threatened.",
      realized: "<em>Tomorrow the foul fiend of hell among this folk will fetch his fee</em>, and he would choose Thomas. The threat is from the far place's own debt. It never appears on stage.", passage: 9 },
    { act: "hall", sym: "Rs", node: "Rescued", name: "Rescue", gloss: "The hero is saved.",
      realized: "<em>For all the gold that ever may be, thou shalt never be betrayed by me.</em> The abductor is the rescuer. She hurries him out before the fiend comes.", passage: 9 },
    { act: "tree", sym: "↓", node: "The Eildon tree", name: "Return", gloss: "The hero returns.",
      realized: "Back to the same tree, under the same greenwood bough. He thinks it has been three days; it has been three years and more.", passage: 9 },
    { act: "tree", sym: "F", node: "The true tongue", name: "Receipt of a magical agent", gloss: "The hero acquires the agent.",
      realized: "Offered harping or speech, he chooses speech, and gets a tongue that shall <em>never leasing lie</em>. It is the token that proves he was there, and the mark he carries for the rest of his life.", passage: 10 },
    { act: "tree", sym: "(—)", node: "The ferlies", name: "Knowledge (outside Propp)", gloss: "Not a function: the frame's real cargo.",
      realized: "He will not let her go. Three times her hounds pull at their leashes and three times he holds her with <em>tell me of some ferly</em>. She gives him the wars of Scotland, battle by battle, weeps, and goes, promising to meet him again at Huntley Banks.", passage: 10 },
  ],
  absent: {
    note: "The spine is nearly whole. What is missing is the cast that usually fills it, and the ending.",
    groups: [
      { syms: "A = D = Rs", label: "One figure on the other side", text: "Abductor, guide, donor, tester and rescuer are the same woman. <strong>Compare Serglige</strong>, where the women who whip the hero heal him (A = D), and <strong>Muirchertach</strong>, where the villain sets all the rules. In three tales now, the otherworld cannot be split into helpers and harmers." },
      { syms: "W", label: "No wedding", text: "The union comes first, and it is the violation. She is someone else's wife, as Fand was. The tale ends with a promise of another meeting, not a marriage." },
      { syms: "the villain", label: "The danger never appears", text: "The king who would smell the fault, and the fiend who comes for his fee, are both offstage. The threat in the far place is the far place's own law." },
    ],
    verdict: "Tested against the hypothesis (the danger is at the threshold, at night, in either direction, and nobody comes back unmarked), this tale <strong>holds, and bends one word</strong>. The threshold holds: everything turns at the Eildon tree, where he meets her and where she brings him back. The corollary holds: he comes home with a tongue that cannot lie and a promise to meet her again, and later tradition says he went. But it begins on a <strong>May morning, in daylight</strong>, the first tale in the series that does, and there is no festival at all. The night is still there, but as a <em>place</em>. Under the hill it is <em>dark as midnight murk</em> for three days. So the hypothesis survives if “at night” means “in the dark”: the danger is at the threshold of the dark. And there is no house. He is alone under a tree when it begins, the first hero with nowhere safe to have left.",
  },
};

/* ── Desire (Greimas): the lover who wants a woman and comes home wanting the future. */
window.THOMAS.desire = {
  intro: "Two objects, one after the other. At the tree, Thomas wants <strong>the lady</strong>, and he gets her, at the cost of her beauty and his freedom. At the tree again, he wants <strong>the future</strong>, and he gets that too, by refusing to let her go. She wants him to keep her secret, and keeps him from the fiend. Greimas's diagram needs drawing twice, and the second drawing is the poem's real business: a prophecy book that explains where its prophecies came from.",
  subject: "Thomas", subjectRef: "thomas",
  object: "the lady — and then the ferlies",
  value: "<em>tongue is chief of minstrelsy</em>",
  sender: "his own longing, lying alone under the tree", senderRef: "thomas",
  receiver: "Thomas, and every reader of the prophecies",
  helpers: [
    { name: "The lady", ref: "lady", note: "his guide under the hill, his rescuer from the teind, and the giver of the true tongue" }
  ],
  opponent: "the king of her country, and the fiend who takes his fee", opponentRef: "fiend",
  unreachable: false,
  note: "Mirror it from her side. Subject: the lady. Object: to keep Thomas, and to keep him secret from her lord. Opponents: the king, who would smell it, and the fiend, who would choose him. Helper: Thomas's silence. She gets both: he answers no one, and he is gone before the fiend comes. Of the series' diagrams, this is the first in which the otherworld figure is a Subject who wants to <em>protect</em> the mortal from the otherworld.",
};

/* ── Type-scenes. */
window.THOMAS.themes = [
  { id: "reverdie", label: "the May-morning opening", passage: 2,
    note: "<em>As I me went this other day … in a merry morning of May</em>: the stock opening of the Middle English <em>chanson d'aventure</em>, where a solitary speaker wanders out in spring, hears the birds, and meets someone. It belongs to the love lyric, and the poem uses it to bring on the otherworld. <strong>Compare Sir Orfeo</strong> on this surface, where Heurodis sleeps under an orchard tree on a May morning and the fairy king takes her.",
    lines: "the jay, the thrush, the mavis, the woodwale; alone; under a tree" },
  { id: "harness", label: "the description of the lady's harness", passage: 3,
    note: "The romance <em>descriptio</em>: saddle, girths, buckles, stirrups, crupper and bridle, each of a precious material, with a refusal to describe her that describes her. The same set-piece arms knights and dresses queens in every Middle English romance; here it is the otherworld arriving as wealth.",
    lines: "ivory, beryl, crystal, pearl, gold; three bells on either side" },
  { id: "underhill", label: "the road through the dark", passage: 6,
    note: "Darkness, water, sound with nothing to see, and a long time. The passage into the hollow hill is a fixed sequence across these tales. <strong>Compare Nera</strong>, following the host into the cave of Crúachan.",
    lines: "midnight murk; water to the knee; the soughing of the flood; three days" },
  { id: "ferly", label: "“tell me of some ferly”", passage: 10,
    note: "The prophetic dialogue: a mortal detains a supernatural speaker with questions, and each answer is a prophecy. It is the frame of the political prophecy books of the 15th and 16th centuries, which went on borrowing Thomas's name for two hundred years (Murray prints the 1603 <em>Whole Prophesie of Scotland</em> as an appendix).",
    lines: "farewell, Thomas; abide a while; my greyhounds break their leash; God forbid thou go" },
];
