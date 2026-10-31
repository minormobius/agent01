/* The Samhain series' own analysis layer: what a spooky tale needs that
   Propp, Greimas and Thompson do not give. Same shape in every Samhain
   tale (nera, thidrandi, muirchertach). The hub (read/samhain/) loads
   all three and draws them side by side.

   rings: distance from the hearth. 0 bed/hearth · 1 inside the house ·
          2 the door · 3 the yard, field or plain, within sight of the
          house · 4 the far place: the mound, hill, cave or church.
   crossings[].outcome — what the crossing leads to, for the house or
          the one who crosses: safe · fatal · lost (gone into the
          otherworld for good) · stopped (held at the door, or a harm
          that crossed in vision only and was undone).
   crossings[].deferred: true when the crossing is safe tonight but
          seals a death that comes later (added with Táin Bó Regamna).
   festival: may be null, with `night` describing the night instead.
   rules[].giver: helper · seer · villain · custom · the dead · geis · hero.
   dread[].device: count · withhold · foreknow · surprise · explain ·
          repeat · silence · invert · vanish.
   names[]: how the tale names its otherworld figures. kind: withheld
          (never named) · weather · mockery · false · forbidden ·
          late (named only at the end) · decoy (a name that misleads) ·
          given (named freely, with a father: added with Serglige).
   Attaches to window.NERA. */
window.NERA = window.NERA || {};
window.NERA.night = {
  title: "Echtra Nerai",
  festival: { name: "Samhain", local: "aidchi samna", when: "the eve of 1 November: winter begins", passage: 1 },
  places: { 0: "the hearth at Crúachan", 1: "the hall of Crúachan", 2: "the door", 3: "the gallows, the three houses", 4: "the cave; the síd" },
  crossings: [
    { who: "every man of the household", from: 1, to: 3, back: true, passage: 1, outcome: "safe", label: "goes out to try the night, and is back at once" },
    { who: "Nera", from: 1, to: 3, passage: 1, outcome: "safe", label: "out to the gallows with a withy" },
    { who: "the hanged man", from: 3, to: 1, passage: 2, outcome: "fatal", label: "carried into the third house; the sleepers die" },
    { who: "the phantom host", from: 4, to: 1, passage: 3, outcome: "stopped", label: "seen burning Crúachan; undone by being told" },
    { who: "Nera", from: 3, to: 4, passage: 3, outcome: "safe", label: "follows the host into the cave and the síd" },
    { who: "Nera", from: 4, to: 1, passage: 6, outcome: "safe", label: "home with summer flowers; no time has passed" },
    { who: "Nera", from: 1, to: 4, passage: 6, outcome: "safe", label: "back into the síd a year later" },
    { who: "the Connachta", from: 1, to: 4, passage: 8, outcome: "safe", label: "go into the síd and sack it" },
    { who: "Nera", from: 1, to: 4, passage: 8, outcome: "lost", label: "goes in with his family; “till Doom”" },
  ],
  rules: [
    { rule: "Rake the fire at night", kind: "house", giver: "the dead", keptBy: "the first house", brokenBy: "—", cost: "none: the dead man cannot enter", passage: 2 },
    { rule: "Throw out washing-water, bath-water and the slop-pail before bed", kind: "house", giver: "the dead", keptBy: "the second house", brokenBy: "the third house", why: "negligence", cost: "every sleeper dies", passage: 2 },
    { rule: "Tell the vision, or it will come true", kind: "speech", giver: "helper", keptBy: "Nera", brokenBy: "—", cost: "none: the burning is reversed onto the síd", passage: 5 },
    { rule: "The síde open only at Samhain", kind: "time", giver: "custom", keptBy: "the síd host", brokenBy: "—", cost: "the raid must wait a year", passage: 7 },
  ],
  dread: [
    { device: "count", text: "The withy springs off three times before the dead man speaks.", passage: 1 },
    { device: "surprise", text: "The corpse talks about knots, and nobody remarks on it.", passage: 1 },
    { device: "silence", text: "The killing in the third house is told in one flat sentence, with no reaction from Nera.", passage: 2 },
    { device: "withhold", text: "The host files into the cave passing word of him down the line, and no one turns round.", passage: 3 },
    { device: "invert", text: "Inside the hill it is summer; outside, no time has passed.", passage: 5 },
  ],
  readings: [
    { what: "What comes out on Samhain night", older: "the people of the síd, with a king, a crown and a household", newer: "“demons” (demnai), in the scribe's word", passage: 1 },
    { what: "The vision of the burning", older: "a forecast by the síd host, undone by speech", newer: "—", passage: 5 },
  ],
  names: [
    { who: "the woman of the síd", name: "—", gloss: "never named in the tale; a gloss (§17) offers “Bé Aingeni”", kind: "withheld", passage: 3 },
    { who: "the king of the síd", name: "—", gloss: "never named", kind: "withheld", passage: 3 },
    { who: "the hanged man", name: "—", gloss: "never named; only “the captive”", kind: "withheld", passage: 1 },
    { who: "the host", name: "slúag síabrae", gloss: "“a phantom host”, a kind, not a name", kind: "withheld", passage: 5 },
  ],
  truth: { mode: "tale", vouch: "none named; it explains a household custom (“that is why it is not good…”)", note: "Told as a story with an aetiology. It does not ask to be believed, but it asks to be obeyed." },
};
