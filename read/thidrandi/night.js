/* The Samhain series analysis layer (see read/nera/night.js for the
   schema). Attaches to window.THIDRANDI. */
window.THIDRANDI = window.THIDRANDI || {};
window.THIDRANDI.night = {
  title: "Þiðranda þáttr",
  festival: { name: "The Winter Nights", local: "vetrnætr", when: "late October: winter begins", passage: 3 },
  places: { 0: "the beds", 1: "the hall at Hof", 2: "the door", 3: "the woodpile, the home-field", 4: "the mound; the hills" },
  crossings: [
    { who: "the knock", from: 3, to: 2, passage: 4, outcome: "safe", label: "something hails the door three times" },
    { who: "the household", from: 1, to: 1, passage: 4, outcome: "safe", label: "lies still and lets on to nothing" },
    { who: "Þiðrandi", from: 1, to: 3, passage: 4, outcome: "fatal", label: "out to the woodpile to greet “guests”" },
    { who: "the white dísir", from: 4, to: 3, passage: 4, outcome: "stopped", label: "ride from the south, and arrive too late" },
    { who: "Þórhallr and the men", from: 1, to: 3, passage: 5, outcome: "safe", label: "out at moonrise; find him" },
    { who: "Þiðrandi", from: 3, to: 4, passage: 5, outcome: "fatal", label: "dies at dawn; laid in a mound" },
    { who: "Hallr", from: 1, to: 4, passage: 7, outcome: "safe", label: "leaves Hof (“Temple”) for Þvottá (“Washing River”)" },
    { who: "the hill-folk", from: 4, to: 4, passage: 7, outcome: "lost", label: "“many a hill opens”: everything packs and leaves" },
  ],
  rules: [
    { rule: "No one go out tonight", kind: "movement", giver: "seer", keptBy: "everyone else", brokenBy: "Þiðrandi", why: "virtue: the shame of leaving guests at the door", cost: "his life", passage: 3 },
    { rule: "Whatever signs come, let no one answer", kind: "speech", giver: "seer", keptBy: "the sleepers", brokenBy: "Þiðrandi", why: "virtue", cost: "his life", passage: 3 },
    { rule: "Too much praise invites harm", kind: "speech", giver: "custom", keptBy: "Þórhallr (falls silent)", brokenBy: "everyone who praises him", why: "love", cost: "—", passage: 2 },
  ],
  dread: [
    { device: "foreknow", text: "“A seer will be killed at the feast”, and the ox called Seer changes nothing.", passage: 2 },
    { device: "silence", text: "The seer falls silent whenever the boy is praised.", passage: 2 },
    { device: "count", text: "Three knocks, and nobody moves until the third.", passage: 4 },
    { device: "withhold", text: "A whole hall lying awake pretending to sleep.", passage: 4 },
    { device: "explain", text: "“It'll be guests — some must have ridden ahead.”", passage: 4 },
  ],
  readings: [
    { what: "The nine in black", older: "the family's own fylgjur / dísir, taking a last tribute", newer: "the Devil, raging as he loses Iceland (the compiler's sermon)", passage: 6 },
    { what: "The nine in white", older: "the “better dísir” of the coming faith", newer: "—", passage: 6 },
  ],
  truth: { mode: "legend", vouch: "a named family of real people; the dying man's own testimony", note: "Told as true, filed in a king's saga as a sign before the conversion. Njáls saga already remembers him as the man the dísir slew." },
};
