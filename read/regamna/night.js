/* The Samhain series analysis layer (schema at the top of
   read/nera/night.js). Attaches to window.REGAMNA. */
window.REGAMNA = window.REGAMNA || {};
window.REGAMNA.night = {
  title: "Táin Bó Regamna",
  festival: null,
  night: "a night: no festival is named (the cow is taken in the year between Nera's two Samhains)",
  places: { 0: "his bed at Dún Imrith", 1: "the house", 2: "the door", 3: "the green; the great road", 4: "the Ford of the Two Graves; the síd of Crúachan" },
  crossings: [
    { who: "the cry", from: 4, to: 0, passage: 1, outcome: "safe", label: "out of the north, straight to his bed" },
    { who: "Cú Chulainn", from: 0, to: 1, passage: 1, outcome: "safe", label: "thrown from his bed to the floor “like a sack”" },
    { who: "Cú Chulainn", from: 1, to: 3, passage: 1, outcome: "safe", label: "out onto the green without weapons or clothes" },
    { who: "his wife", from: 1, to: 3, passage: 1, outcome: "safe", label: "runs out after him with his weapons" },
    { who: "Cú Chulainn", from: 3, to: 4, passage: 2, outcome: "safe", deferred: true, label: "to the Ford of the Two Graves; meets the red woman" },
    { who: "the red woman, the man, the horse, the cow", from: 4, to: 4, passage: 4, outcome: "stopped", label: "all vanish when he leaps at them; a black bird on the branch" },
    { who: "the Morrígan", from: 4, to: 4, passage: 5, outcome: "safe", label: "back into the síd of Crúachan with the cow (Egerton)" },
    { who: "Cú Chulainn", from: 4, to: 1, passage: 5, outcome: "safe", deferred: true, label: "home, unharmed — his death now in her keeping" },
  ],
  rules: [
    { rule: "Nothing leaves Ulster without his knowledge", kind: "movement", giver: "geis", keptBy: "Cú Chulainn", brokenBy: "the Morrígan", why: "she is the war-goddess; the cow must reach the Brown Bull", cost: "her enmity, and a fixed deadline on his life", passage: 3 },
    { rule: "Name yourself by your true name", kind: "speech", giver: "hero", keptBy: "—", brokenBy: "the Morrígan", why: "a true name is never given by the otherworld", cost: "he never learns it", passage: 3 },
    { rule: "You will never have healing from me, unless you let me be", kind: "speech", giver: "hero", keptBy: "—", brokenBy: "— (in the Táin she tricks him into healing her)", why: "", cost: "", passage: 5 },
  ],
  dread: [
    { device: "surprise", text: "The greatest hero in Ireland thrown out of bed by a sound, like a sack.", passage: 1 },
    { device: "invert", text: "A one-legged red horse, the chariot-pole driven through its body.", passage: 2 },
    { device: "withhold", text: "Names given as mockery and weather, and the true name refused at spear-point.", passage: 3 },
    { device: "vanish", text: "Neither the horse, nor the woman, nor the chariot, nor the man, nor the cow — only a black bird on the branch.", passage: 4 },
    { device: "foreknow", text: "“You will live until the calf in this cow's womb is a yearling.”", passage: 4 },
    { device: "count", text: "Three shapes, three threats, three counter-threats.", passage: 5 },
  ],
  readings: [
    { what: "The red woman", older: "the Morrígan, war-goddess, who guards his death", newer: "a woman satirist paid with a cow (her own mask)", passage: 3 },
    { what: "The title", older: "Táin Bó Mórrigna? — “the Morrígan's cattle-drive” (Windisch's guess)", newer: "Táin Bó Regamna, though no Regamain appears", passage: 1 },
  ],
  names: [
    { who: "the big man", name: "Úar-gáeth-sceo Luachair-sceo", gloss: "Cold-Wind-and-Plenty, Rushes-and-Plenty", kind: "weather", passage: 3 },
    { who: "the red woman", name: "Faebor-begbeoil-cuimdiuir-folt-scenbgairit-sceo-úath", gloss: "Edge-Little-Mouth… Plenty-and-Terror", kind: "mockery", passage: 3 },
    { who: "the red woman", name: "a bancháinte", gloss: "a woman satirist", kind: "false", passage: 3 },
    { who: "the black bird", name: "the Badb", gloss: "the battle-crow: the narrator's name for her, given only as she leaves", kind: "late", passage: 5 },
  ],
  truth: { mode: "tale", vouch: "none named; cited by name in the Lebor na hUidre Táin and in Echtra Nerai", note: "A fore-tale. Its truth-claim is borrowed from the Táin it prepares: everything it foretells is “fulfilled” there." },
};
