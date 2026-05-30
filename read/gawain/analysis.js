/* Story graph — Sir Gawain and the Green Knight mapped onto Vladimir Propp's
   "Morphology of the Folktale" (1928): the 31 narrative functions of the
   wonder-tale. This is an interpretive mapping, not a canonical one — Propp
   built his scheme on Russian fairy tales, and fitting a 14th-century
   Christian chivalric romance to it is a reading, not a measurement. What
   the poem KEEPS, what it SKIPS, and what it INVERTS are the real material.
   `passage` points at the tale's four Fitts so each function links to the
   text that realises it. Loaded after tale.js; attaches to window.GAWAIN. */
window.GAWAIN = window.GAWAIN || {};
window.GAWAIN.propp = {
  intro: "Propp argued that wonder-tales, however different on the surface, drew their events from a single fixed sequence of <strong>31 functions</strong> — Absentation, Interdiction, Violation, Villainy, Lack, Departure, the Donor, Struggle, Branding, Victory, Return, Recognition, Wedding. Gawain is not a wonder-tale; it is a late-14th-century alliterative <em>chivalric romance</em>, deeply Christian, organised around a moral test rather than a marriage. So the fit is instructive: the poem follows the Departure → Donor → Struggle → Branding → Return arc almost exactly, then <strong>refuses</strong> the Wedding that ordinarily closes it. Where <em>Culhwch ac Olwen</em> skips Propp's deception cluster entirely (no scheming villain, no trickery), Gawain is built on it — Reconnaissance, Trickery and Complicity are the whole of Fitts I and III. The two poems sit at opposite ends of the same scheme. Below, each beat links to the Fitt that realises it.",
  acts: [
    { id: "camelot",  label: "Camelot — the beheading game",       color: "#c9a24a" },
    { id: "year",     label: "The year between",                   color: "#8aa363" },
    { id: "castle",   label: "Bertilak's castle — the exchange",   color: "#b07a4b" },
    { id: "chapel",   label: "The Green Chapel — the reckoning",   color: "#6fa86e" },
    { id: "home",     label: "Return — and the token",             color: "#9a8fd0" },
  ],
  moves: [
    { act: "camelot", sym: "α", node: "Setting", name: "Initial situation", gloss: "The court and the hero are introduced.",
      realized: "Christmas at Camelot in the Brutus frame: Arthur young, restless, waiting at the high table for a marvel before he will eat.", passage: 1 },
    { act: "camelot", sym: "ε", node: "Reconnaissance", name: "Reconnaissance", gloss: "The antagonist scouts the hero or his community.",
      realized: "The Green Knight enters mid-feast and surveys the hall in silence, calling out their reputation before he names his terms — a deliberate audit of the Round Table's <em>surquidry</em>.", passage: 1 },
    { act: "camelot", sym: "A", node: "The challenge", name: "Villainy / lack", gloss: "A harm is threatened or a lack opens up.",
      realized: "The beheading game is proposed: trade one blow for one blow, a year and a day hence. The lack is a question — is the Round Table's renown true?", passage: 1 },
    { act: "camelot", sym: "η", node: "The trick", name: "Trickery", gloss: "The antagonist attempts to deceive.",
      realized: "The terms hide a fact only the Green Knight knows: he can survive what he offers. The game is rigged; the audience in the hall sees a joke, the player a fair bargain.", passage: 1 },
    { act: "camelot", sym: "C", node: "Counteraction", name: "Beginning counteraction", gloss: "The hero agrees to act.",
      realized: "When Arthur reaches for the axe, Gawain steps from the table and asks to take the game in the king's stead — naming himself the weakest, his loss the lightest.", passage: 1 },
    { act: "camelot", sym: "θ", node: "Compliance", name: "Complicity", gloss: "The hero is taken in.",
      realized: "Gawain accepts under the rules as given — believing the bargain will be settled at one stroke in this hall, rather than over a year of unseen tests.", passage: 1 },
    { act: "camelot", sym: "J", node: "First blow", name: "Victory (illusory)", gloss: "The antagonist appears defeated.",
      realized: "Gawain beheads the Green Knight at one stroke. The head speaks from the floor; the giant catches it up and rides out carrying it. Camelot has won — and lost.", passage: 1 },
    { act: "camelot", sym: "γ", node: "The bond", name: "Interdiction", gloss: "A command is laid on the hero.",
      realized: "Before he goes, the Green Knight binds Gawain to seek him at the Green Chapel by the next New Year's morning. The hero is sealed to a date.", passage: 1 },

    { act: "year", sym: "↑", node: "Departure", name: "Departure", gloss: "The hero leaves home.",
      realized: "After the seasons turn (the great <em>annus mirabilis</em> stanza), Gawain is armed with the pentangle — faith, fellowship, the five wounds, the five joys — and rides out alone.", passage: 2 },
    { act: "year", sym: "G", node: "Guidance", name: "Guidance", gloss: "The hero is led toward the object of search.",
      realized: "The wild road through North Wales and the Wirral, the marvels and the wolves, the long cold; on Christmas Eve he prays for shelter, and a castle appears in the wood.", passage: 2 },

    { act: "castle", sym: "D", node: "The bargain", name: "Donor: first function", gloss: "The donor proposes a test.",
      realized: "Bertilak proposes the exchange-of-winnings: each day, the hunt outside will be traded for whatever Gawain gains inside. A bargain dressed as a parlour game.", passage: 3 },
    { act: "castle", sym: "E", node: "Acceptance", name: "Hero's reaction", gloss: "The hero responds to the test.",
      realized: "Gawain accepts in courtesy, comfortably, without seeing that the second beheading game has just begun in another shape.", passage: 3 },
    { act: "castle", sym: "D₁", node: "Day 1", name: "Donor: first probe", gloss: "Test by the donor (the lady) — day one.",
      realized: "The lady comes to his bed; he holds the line and lets her have one kiss. At evening it is traded honestly: deer-meat for kiss. Honour intact.", passage: 3 },
    { act: "castle", sym: "D₂", node: "Day 2", name: "Donor: second probe", gloss: "Test by the donor — day two.",
      realized: "Two kisses given, two returned. The boar's head for two kisses. Honour intact.", passage: 3 },
    { act: "castle", sym: "D₃", node: "Day 3", name: "Donor: third probe", gloss: "Test by the donor — day three. The fork.",
      realized: "Three kisses — and the lady's green silk girdle, said to keep its wearer from any death. Gawain accepts the kisses, and accepts the girdle.", passage: 3 },
    { act: "castle", sym: "F", node: "The girdle", name: "Receipt of magical agent", gloss: "The hero takes a charm — but a forbidden one.",
      realized: "At the evening exchange, three kisses are duly given; the girdle is kept hidden. Propp's gift from the donor — only here, accepting it is the failure.", passage: 3 },

    { act: "chapel", sym: "H", node: "Three blows", name: "Struggle (inverted)", gloss: "Hero and antagonist meet — but the hero must stand still.",
      realized: "The Green Chapel turns out to be a hollow grass-grown barrow. Three swings of the axe: feint, feint, nick. Gawain's struggle is not to strike but not to flinch.", passage: 4 },
    { act: "chapel", sym: "I", node: "The nick", name: "Branding", gloss: "The hero is marked.",
      realized: "The third blow draws blood — a nick at the neck, blood on snow. The mark Gawain will carry for life.", passage: 4 },
    { act: "chapel", sym: "K", node: "Survival", name: "Liquidation of lack", gloss: "The original threat is undone.",
      realized: "Gawain survives the bargain. The terms set at Camelot are discharged in full at the cost of one wound — and one piece of green silk.", passage: 4 },
    { act: "chapel", sym: "Q", node: "Reveal", name: "Recognition", gloss: "The truth is disclosed.",
      realized: "Bertilak names himself: he and the Green Knight are one. The lady's wooing was at his direction. Morgan le Fay, Gawain's aunt and Merlin's pupil, is named as prime mover.", passage: 4 },
    { act: "chapel", sym: "Ex", node: "Self-exposure", name: "Exposure (reflexive)", gloss: "Concealment is uncovered — but in the hero, not an impostor.",
      realized: "Bertilak produces the girdle as evidence; Gawain hears himself name the fault as <em>cowardice and covetousness</em>, flings the sash back, refuses Bertilak's gentle verdict and accepts the harder one.", passage: 4 },

    { act: "home", sym: "↓", node: "Return", name: "Return", gloss: "The hero rides home.",
      realized: "Gawain takes the gold-hemmed girdle back at Bertilak's urging — but as a sign of his fault. He rides to Camelot through wild ways, the green sash bound baldric-fashion under his left arm.", passage: 4 },
    { act: "home", sym: "T", node: "The token", name: "Transfiguration", gloss: "The hero's standing is changed.",
      realized: "The court hears the tale and laughs lovingly; lords and ladies adopt the green band as livery, a uniform of brotherhood honouring Gawain ever after. He wears it as confession — the same token, two readings. The poem closes on its opening note: Troy, Brutus, benediction.", passage: 4 },
  ],
  absent: {
    note: "Romance is not folktale. Where Gawain bends Propp's spine, it bends it on purpose — and the bends are the meaning. Three things this poem will not give you:",
    groups: [
      { label: "The wedding", syms: "W", text: "Propp's quest tale closes on marriage. Gawain's closes on refusal — Bertilak invites him back to feast and accord himself with the lady; Gawain says no by no means. There is no bride; there is, in fact, an explicit anti-marital turn at stanza XVIII, when Gawain catalogues Adam, Solomon, Samson and David as men ruined by women. The Donor's gift here cannot become a Wedding gift." },
      { label: "The false hero", syms: "L Q-impostor Ex-of-other", text: "No one steals the hero's victory; there is no impostor to unmask. The Exposure function still fires — but reflexively. Gawain exposes Gawain. The girdle, the would-be magical token, becomes the token of fault." },
      { label: "Pursuit and rescue", syms: "Pr Rs", text: "No one chases the hero; no one is chased. The Green Knight rides away wherever he would go; Gawain rides away wherever he would go; the closing image is two greens dispersing." },
      { label: "Punishment of the villain", syms: "U", text: "Bertilak is forgiven before the question is even raised — he and Morgan ordained the test; the test was the point. The only ongoing penance is the hero's, voluntarily, in silk." },
      { label: "Role-fusion", syms: "(A = D = host)", text: "The antagonist (Green Knight), the donor (Bertilak), and the host (lord of the castle) are one man. The temptress (the lady) is also a donor (the girdle) and an agent of the antagonist's plan. Propp's roles fuse in a way the wonder-tale never does — which is why the poem keeps its riddle even after the reveal." },
    ],
    verdict: "And what the poem KEEPS that <em>Culhwch ac Olwen</em> skips is the deception cycle — ε ζ η θ, Reconnaissance, Delivery, Trickery, Complicity. Culhwch had no scheming villain; Gawain is built on one. Strip away the wedding and the false-hero machinery, foreground the donor-test triptych and the deception scaffold, and what remains is a chivalric <strong>honour-test romance</strong> with the structural backbone of a Proppian quest — a wonder-tale that has been bent toward confession.",
  },
};
