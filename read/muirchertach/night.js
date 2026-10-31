/* The Samhain series analysis layer (see read/nera/night.js for the
   schema). Attaches to window.MUIRCHERTACH. */
window.MUIRCHERTACH = window.MUIRCHERTACH || {};
window.MUIRCHERTACH.night = {
  title: "Aided Muirchertaig",
  festival: { name: "Samhain week", local: "adaig máirt iar samain", when: "the Tuesday after Samhain: the seventh night of the enchantment", passage: 7 },
  places: { 0: "the bed; the vat", 1: "the hall of Cletech", 2: "the door", 3: "the green of the Bruig", 4: "the mound; the church in the Bruig" },
  crossings: [
    { who: "Sín", from: 4, to: 1, passage: 1, outcome: "safe", deferred: true, label: "brought home from the grave-mound" },
    { who: "Duaibsech and the Children of Niall", from: 1, to: 4, passage: 2, outcome: "safe", label: "put out of the house; they live" },
    { who: "Cairnech", from: 4, to: 2, passage: 3, outcome: "stopped", label: "kept from the door; digs the grave outside" },
    { who: "Muirchertach", from: 1, to: 3, back: true, passage: 5, outcome: "safe", label: "out to fight the armies of stone, and back, day after day" },
    { who: "Muirchertach", from: 3, to: 4, passage: 6, outcome: "safe", label: "the Cross over his eyes; digs the church trench" },
    { who: "Muirchertach", from: 4, to: 1, passage: 6, outcome: "safe", deferred: true, label: "goes home and sits at her right hand" },
    { who: "Muirchertach", from: 4, to: 1, passage: 7, outcome: "fatal", label: "back in from the clerics' fire on the last night, at once" },
    { who: "the phantom host", from: 3, to: 2, passage: 8, outcome: "fatal", label: "around the house; spears turned inward at the door" },
    { who: "Sín", from: 1, to: 3, passage: 8, outcome: "safe", label: "leaves the burning house" },
    { who: "Muirchertach", from: 1, to: 0, passage: 8, outcome: "fatal", label: "fire in the doorway; into the vat of wine" },
  ],
  rules: [
    { rule: "Never speak my name", kind: "speech", giver: "villain", keptBy: "the king, for six nights", brokenBy: "Muirchertach", why: "her names are the weather: he says “storm” and “winter-night”", cost: "the house and his life", passage: 1 },
    { rule: "Your wife must not be in my sight", kind: "house", giver: "villain", keptBy: "Muirchertach", brokenBy: "—", why: "", cost: "Duaibsech and the kindred put out", passage: 1 },
    { rule: "No cleric may enter a house I am in", kind: "house", giver: "villain", keptBy: "Muirchertach", brokenBy: "— (he goes out to them instead)", why: "", cost: "the rescue can never reach him indoors", passage: 1 },
    { rule: "Do not sleep in the House of Cletech", kind: "movement", giver: "villain", keptBy: "—", brokenBy: "Muirchertach", why: "she also says “sleep, and leave the watching to me”", cost: "his life", passage: 7 },
  ],
  dread: [
    { device: "vanish", text: "Under the Cross the armies are “fern and stones and puffballs”.", passage: 6 },
    { device: "count", text: "Six nights of enchantment pass, and the seventh is the one: the Tuesday after Samhain.", passage: 7 },
    { device: "invert", text: "Her names are the weather, so the forbidden words are “storm” and “winter-night”, in winter.", passage: 1 },
    { device: "repeat", text: "Every man he kills gets up again, all day.", passage: 5 },
    { device: "foreknow", text: "Three dreams, a druid's reading, a prophecy of burning, and her own warning in verse. All are understood and all are ignored.", passage: 7 },
    { device: "explain", text: "“It is Tuathal Máelgarb, avenging Granard.” A human enemy is supplied for him to fight.", passage: 8 },
    { device: "silence", text: "Alone in the dark, she turns the spears to face inward and gets back into bed.", passage: 8 },
    { device: "withhold", text: "Who she is, and why, is told only at the graveside.", passage: 9 },
  ],
  readings: [
    { what: "Sín", older: "a goddess of great power (bandéa); a woman of the síd from the Bruig", newer: "a witch working druid-craft against the clerics", passage: 4 },
    { what: "Sín, at the end", older: "the last of the old tribes of Tara, avenging her people", newer: "a penitent who confesses and is buried in consecrated ground", passage: 9 },
    { what: "The armies", older: "hosts of the otherworld", newer: "fern, stones and puffballs, seen through the Cross", passage: 6 },
  ],
  names: [
    { who: "the woman on the mound", name: "Osnad, Esnad, Sín, Gaeth Garb, Gemadaig, Ochsad, Iachtad, Taethean", gloss: "Sigh, Sough, Storm, Rough Wind, Winter-Night, Groan, Cry, Wail", kind: "weather", passage: 1 },
    { who: "the woman on the mound", name: "(any of them)", gloss: "never to be spoken by the king", kind: "forbidden", passage: 1 },
    { who: "Sín's father", name: "Sige son of Dían son of Trén", gloss: "given only at the graveside", kind: "late", passage: 9 },
    { who: "the host around the house", name: "Tuathal Máelgarb", gloss: "a real king's name, used as a lie", kind: "false", passage: 8 },
  ],
  truth: { mode: "legend", vouch: "four saints and a rival king named as its tellers; the annals' record of a king “drowned and burned”", note: "An aided, a death-tale, that explains a real king's recorded death. Its colophon claims the saints wrote it down." },
};
