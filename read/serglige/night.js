/* The Samhain series analysis layer (schema at the top of
   read/nera/night.js). Attaches to window.SERGLIGE. */
window.SERGLIGE = window.SERGLIGE || {};
window.SERGLIGE.night = {
  title: "Serglige Con Culainn",
  festival: { name: "Samhain — twice", local: "óenach na samna", when: "the seven-day assembly, and the eve of the next Samhain a year later", passage: 1 },
  places: { 0: "the wasting-bed", 1: "the house; the assembly", 2: "the pillar-stone; the strand", 3: "the plain; the lake", 4: "Mag Mell, across the water" },
  crossings: [
    { who: "the chained birds", from: 4, to: 3, passage: 2, outcome: "safe", label: "settle on the lake at the Samhain assembly" },
    { who: "Cú Chulainn", from: 1, to: 2, passage: 3, outcome: "stopped", label: "sits against the pillar-stone; whipped in a vision, undone a year later" },
    { who: "Cú Chulainn", from: 2, to: 0, passage: 3, outcome: "safe", label: "carried to the wasting-bed; a year without speech" },
    { who: "Óengus", from: 4, to: 0, passage: 4, outcome: "safe", label: "walks past the four guards and sits on the bed, the eve of Samhain" },
    { who: "Cú Chulainn", from: 0, to: 2, passage: 5, outcome: "safe", label: "back to the same stone; Lí Ban waiting" },
    { who: "Láeg", from: 2, to: 4, back: true, passage: 5, outcome: "safe", label: "crosses by bronze boat to look, and comes back to report (twice)" },
    { who: "Cú Chulainn", from: 2, to: 4, passage: 8, outcome: "safe", label: "crosses in his chariot; the battle; a month with Fand" },
    { who: "Cú Chulainn", from: 4, to: 1, passage: 9, outcome: "safe", label: "comes home; the return is not even remarked" },
    { who: "Emer and fifty women", from: 1, to: 2, passage: 9, outcome: "stopped", label: "come to the strand with sharpened knives" },
    { who: "Manannán", from: 4, to: 2, passage: 10, outcome: "safe", label: "rides over the sea to the strand, visible only to Fand" },
    { who: "Fand", from: 2, to: 4, passage: 10, outcome: "lost", label: "goes back with her husband; the cloak shaken between them for ever" },
    { who: "Cú Chulainn", from: 2, to: 3, passage: 10, outcome: "stopped", label: "mad on the mountains; brought home with the drink of forgetting" },
  ],
  rules: [
    { rule: "A sword across the thigh turns on a liar", kind: "speech", giver: "custom", keptBy: "the boasters at the assembly", brokenBy: "—", why: "", cost: "", passage: 1 },
    { rule: "Don't go near the chained birds", kind: "movement", giver: "helper", keptBy: "—", brokenBy: "Cú Chulainn", why: "his promise to his wife, and pride", cost: "a whipping and a year's wasting", passage: 2 },
    { rule: "Don't wake a man who is seeing a vision", kind: "movement", giver: "custom", keptBy: "the Ulstermen (Fergus forbids it)", brokenBy: "—", why: "", cost: "", passage: 3 },
    { rule: "Go back to the same stone", kind: "movement", giver: "hero", keptBy: "Cú Chulainn (Conchobar's ruling)", brokenBy: "—", why: "", cost: "", passage: 4 },
    { rule: "Not on a woman's invitation", kind: "movement", giver: "hero", keptBy: "Cú Chulainn, twice", brokenBy: "Cú Chulainn, at the third asking", why: "Láeg's report; Emer's shaming", cost: "Fand, and his memory of her", passage: 5 },
  ],
  dread: [
    { device: "surprise", text: "Two smiling women, taking turns to whip the greatest warrior in Ireland nearly to death in his sleep.", passage: 3 },
    { device: "silence", text: "A year without speaking a word to anyone.", passage: 3 },
    { device: "count", text: "Missed twice, then only grazed; three praise-chants unanswered; three vats to cool him.", passage: 2 },
    { device: "withhold", text: "The stranger on the bed names himself, then goes, and “they did not know where he went or where he had come from”.", passage: 4 },
    { device: "invert", text: "The women who whipped him are the ones who will heal him; the villain is the donor.", passage: 5 },
    { device: "vanish", text: "The birds go under the water; the sea-god is visible to no one but his wife.", passage: 10 },
  ],
  readings: [
    { what: "The two women and Mag Mell", older: "the people of the síd: a king, his court, a sea-god, a land with no lies", newer: "“a vision of destruction worked by demons; it is these apparitions that the ignorant call síde” (the scribe's last paragraph)", passage: 10 },
    { what: "The swords that speak", older: "an ordeal at the Samhain boasts", newer: "“demons used to speak to them from their weapons”", passage: 1 },
  ],
  names: [
    { who: "the woman in green", name: "Lí Ban", gloss: "“beauty of women”: given freely, at the stone, the moment she speaks", kind: "given", passage: 5 },
    { who: "Fand", name: "Fand daughter of Áed Abrát", gloss: "“the tear on the eye, daughter of the eye's fire”: given with her father's name, and explained", kind: "given", passage: 5 },
    { who: "the stranger on the bed", name: "Óengus son of Áed Abrát", gloss: "given at once, with his father's name; then he vanishes and no one knows where he went", kind: "given", passage: 4 },
    { who: "Labraid's enemy", name: "Senach Siaborthe", gloss: "“Senach the Spectral”", kind: "mockery", passage: 5 },
  ],
  truth: { mode: "tale", vouch: "none named; the scribe disowns its supernatural content as demonic illusion", note: "The only tale in the series whose own last paragraph tells you not to believe it." },
};
