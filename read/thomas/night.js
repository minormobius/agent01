/* The Samhain series analysis layer (schema at the top of
   read/nera/night.js). Attaches to window.THOMAS. */
window.THOMAS = window.THOMAS || {};
window.THOMAS.night = {
  title: "Thomas of Erceldoune",
  festival: null,
  night: "a May morning, in daylight; the night is under the hill, “dark as midnight murk”",
  places: { 0: "lying on the grass (he has no house in this tale)", 1: "—", 2: "the Eildon tree", 3: "under the hill: the dark road", 4: "her country: the garden, the hall" },
  crossings: [
    { who: "the lady", from: 4, to: 2, passage: 2, outcome: "safe", label: "rides out over the lea, hunting" },
    { who: "Thomas", from: 0, to: 2, passage: 3, outcome: "safe", label: "runs over the hill to meet her at the Eildon tree" },
    { who: "Thomas", from: 2, to: 3, passage: 6, outcome: "safe", label: "led in at Eildon Hill: three days of dark and water to the knee" },
    { who: "Thomas", from: 3, to: 4, passage: 8, outcome: "safe", label: "into her hall, mute; three years that feel like three days" },
    { who: "Thomas", from: 4, to: 2, passage: 9, outcome: "stopped", label: "hurried out the night before the fiend takes his tithe; promised to come back" },
    { who: "the lady", from: 2, to: 4, passage: 10, outcome: "safe", label: "blows her horn and rides away to Helmsdale" },
  ],
  rules: [
    { rule: "Do not lie with me: it will undo my beauty", kind: "body", giver: "helper", keptBy: "—", brokenBy: "Thomas", why: "desire; his troth “to heaven or hell”", cost: "her beauty, and his liberty: “for thy troth thou hast me tane”", passage: 4 },
    { rule: "Do not eat the fruit", kind: "food", giver: "helper", keptBy: "Thomas, near fainting", brokenBy: "—", why: "", cost: "", passage: 6 },
    { rule: "Answer no one but me", kind: "speech", giver: "helper", keptBy: "Thomas, for three years", brokenBy: "—", why: "", cost: "", passage: 7 },
    { rule: "Speak no evil of me", kind: "speech", giver: "helper", keptBy: "Thomas (the poem is his telling)", brokenBy: "—", why: "", cost: "", passage: 10 },
  ],
  dread: [
    { device: "invert", text: "The lady who shone like the sun stands at the tree with her eyes gone out, one leg black and one grey, and her body like lead.", passage: 5 },
    { device: "silence", text: "Three days in the dark with nothing to hear but the soughing of the flood; then a hall of music in which he may not say a word.", passage: 6 },
    { device: "count", text: "Three bells on each side; three greyhounds and seven hounds; seven times; three days; three by three; three years and more.", passage: 3 },
    { device: "withhold", text: "She is “of another country”, never named. Her lord is never seen. The fiend comes “tomorrow”.", passage: 4 },
    { device: "surprise", text: "“For sooth, Thomas, thou hast been here three year and more.”", passage: 9 },
    { device: "foreknow", text: "The whole second half: the wars of Scotland, battle by battle, from Bannockburn to a last battle at Sandyford by three oaks.", passage: 10 },
    { device: "repeat", text: "“Farewell, Thomas, I wend my way.” She tries to leave again and again, and he holds her each time with “tell me of some ferly”.", passage: 10 },
  ],
  readings: [
    { what: "The lady", older: "a huntress of another country, married to its king, with her own castle on her own road", newer: "first the Queen of Heaven, then a fiend of hell, both in the hero's mouth; she refuses both", passage: 5 },
    { what: "Her ruined beauty", older: "a disguise against her husband, who would smell the fault (Lansdowne)", newer: "the wages of sin: “that sin will fordo all my beauty”", passage: 8 },
  ],
  names: [
    { who: "the lady", name: "—", gloss: "never named: “a lady gaye”, “of another country”; she refuses “Queen of Heaven” and “fiend”", kind: "withheld", passage: 4 },
    { who: "her lord", name: "—", gloss: "“my lorde”, “the king of this country”", kind: "withheld", passage: 7 },
    { who: "the lady", name: "Mary, Queen of Heaven", gloss: "the hero's first name for her, and wrong", kind: "false", passage: 3 },
  ],
  truth: { mode: "legend", vouch: "Thomas himself, in the first person; “as the story says”; a historical Thomas Rymour (charters, 1260s–80s)", note: "The only tale in the series told by the man it happened to." },
};
