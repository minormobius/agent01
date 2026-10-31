/* The cast of Táin Bó Regamna: the smallest in the series. A hero, his
   charioteer and his wife on one side; a red woman, a big man, a cow and
   an impossible horse on the other. All of the second group turn out to
   be one figure, and the cow belongs to Nera's son. Attaches to
   window.REGAMNA. */
window.REGAMNA = window.REGAMNA || {};
window.REGAMNA.characters = {
  intro: "The smallest cast in the series, and the one with the fewest true names. On the Ulster side are the hero, his charioteer and his wife, who runs out after him with his weapons. On the other side are a red woman, a big man with a forked staff, a cow, and a one-legged horse with the chariot-pole through its body. They give their names as a mockery and their trades as a lie. When the hero lays hands on them they turn out to be <strong>one figure</strong>: they all vanish, and a black bird is left on a branch. Two figures are absent and still matter: the Brown Bull who has bulled the cow, and the unborn calf who will start a war.",
  roles: [
    { id: "principal",  label: "Principals",                    color: "#d64a52" },
    { id: "ulster",     label: "Dún Imrith — the Ulster side",  color: "#c9a24a" },
    { id: "otherworld", label: "The other side — her shapes",   color: "#9c8fb8" },
    { id: "beast",      label: "Beasts",                        color: "#6f9ac9" },
  ],
  cast: [
    { id: "cuchulainn", name: "Cú Chulainn", role: "principal", alt: "Cuculaind", epithet: "the hound of Ulster, at Dún Imrith",
      blurb: "Asleep at home when a cry comes out of the north, so terrible that he falls out of bed onto the floor like a sack. He goes out without weapons or clothes, follows the cry to a ford with his charioteer, and claims the cow on the road because <em>the cows of Ulster are mine</em>. He demands the strangers' names, gets mockery, leaps into the chariot with his feet on her shoulders and his spear on her skull, and is left holding nothing. He is told the exact span of his life and the three shapes in which she will come against him, matches each threat with one of his own, and goes home. Everything she promises will happen in the Táin.",
      appears: [1, 2, 3, 4, 5],
      rel: [ { to: "morrigan", label: "threatened by; threatens" }, { to: "laeg", label: "master of" }, { to: "wife", label: "husband of" }, { to: "cow", label: "claims" } ] },
    { id: "morrigan", name: "The Morrígan", role: "principal", alt: "the red woman; “Edge-Little-Mouth…”; a satirist; the Badb", epithet: "who guards his death",
      blurb: "First a red woman in a red chariot, with two red eyebrows. She gives a ridiculous name, then claims to be a woman satirist paid with a cow for a poem. Her poem is a rosc too dark to translate. When he touches her she becomes a black bird on a branch and tells him the truth: she brought the cow out of the síd of Crúachan to be bulled by the Brown Bull, and he will live only until its calf is a yearling. <em>I am guarding your death, and I will be.</em> Eel, wolf and red-eared heifer: she names the three shapes in which she will come. The text ends calling her the Badb, the battle-crow. She is the same war-goddess who took the cow of Nera's son.",
      appears: [2, 3, 4, 5],
      rel: [ { to: "cuchulainn", label: "guards the death of" }, { to: "man", label: "speaks for" }, { to: "cow", label: "drives, from the síd of Crúachan" }, { to: "donn", label: "brought the cow to" }, { to: "satirist", label: "disguised as" } ] },

    { id: "laeg", name: "Láeg", role: "ulster", alt: "Láeg mac Riangabra", epithet: "Cú Chulainn's charioteer",
      blurb: "He heard the cry too, across the plain, and came from Ferta Láig in the north with the chariot already harnessed. The cry was not a dream. He points the way north-west, along the great road to Caill Cuan.",
      appears: [1],
      rel: [ { to: "cuchulainn", label: "charioteer of" } ] },
    { id: "wife", name: "Cú Chulainn's wife", role: "ulster", epithet: "unnamed here (Emer, in the rest of the cycle)",
      blurb: "One line: she runs out into the dark after him with his weapons and clothes. In a series built on thresholds, she is the only person who crosses one to bring what is needed.",
      appears: [1],
      rel: [ { to: "cuchulainn", label: "brings his weapons to" } ] },

    { id: "man", name: "The big man", role: "otherworld", alt: "“Cold-Wind-and-Plenty, Rushes-and-Plenty”; “Daire mac Fiachna”", epithet: "with a forked staff of white hazel",
      blurb: "He walks beside the chariot driving the cow with a forked hazel staff, and he will not speak to Cú Chulainn. The woman speaks for him: <em>that is not a man you are talking to</em>. His name is the weather (<em>Úar-gáeth</em>, cold wind) and the marsh (<em>luachair</em>, rushes). She also claims, falsely, that he is Daire mac Fiachna, owner of the Brown Bull. He vanishes with everything else.",
      appears: [2, 3, 4],
      rel: [ { to: "morrigan", label: "spoken for by" }, { to: "cow", label: "drives" } ] },
    { id: "satirist", name: "“The woman satirist”", role: "otherworld", alt: "bancháinte", epithet: "a false identity",
      blurb: "The second mask: a satirist who claims to have earned the cow with a poem. Irish satirists could raise blisters with words, so the claim is a threat as well as a lie. The poem she sings is real, and it is a war-prophecy.",
      appears: [3],
      rel: [ { to: "morrigan", label: "a mask of" } ] },
    { id: "crow", name: "The black bird on the branch", role: "otherworld", alt: "én dub; the Badb", epithet: "what is left when everything vanishes",
      blurb: "Horse, woman, chariot, man and cow are all gone in a single leap, and a black bird sits on the branch beside him. Everything that follows, the deadline and the three shapes, she says in this form. It is the Morrígan's true shape in the tale, and the shape she takes on his shoulder when he dies.",
      appears: [4, 5],
      rel: [ { to: "morrigan", label: "the true shape of" } ] },
    { id: "eel", name: "The eel, the she-wolf, the red-eared heifer", role: "otherworld", epithet: "the three shapes promised for the Táin",
      blurb: "She promises an eel to coil round his feet in the ford, a grey she-wolf to bite him from right hand to left arm, and a white heifer with red ears leading a hundred cows to break fair play at the ford. Each is answered by a threat to break her: ribs, eye, leg. In the Táin it all happens exactly so.",
      appears: [5],
      rel: [ { to: "morrigan", label: "shapes of" }, { to: "cuchulainn", label: "promised against" } ] },

    { id: "cow", name: "The cow", role: "beast", alt: "the cow of Aingen", epithet: "out of the síd of Crúachan",
      blurb: "The whole quarrel is over her. She was brought out of Nera's síd, where she was the cow given to Nera's son Aingen at his birth, and bulled by the Brown Bull of Cúailnge. The calf in her womb is Cú Chulainn's deadline. In Echtra Nerai she comes home by herself, and her calf bellows the Táin into being.",
      appears: [2, 3, 4],
      rel: [ { to: "morrigan", label: "driven by" }, { to: "donn", label: "bulled by" }, { to: "calf", label: "carries" } ] },
    { id: "horse", name: "The red horse", role: "beast", epithet: "one-legged, the chariot-pole through its body",
      blurb: "A single red horse with one leg, the pole of the chariot driven through its body and pinned to the band on its forehead. Nobody remarks on it, and it vanishes with the rest.",
      appears: [2, 4],
      rel: [ { to: "morrigan", label: "draws the chariot of" } ] },
    { id: "donn", name: "The Donn Cúailnge", role: "beast", alt: "the Black Bull of Cúailnge", epithet: "offstage, in the north-east",
      blurb: "Named as the sire. The Táin will be fought to bring him to Medb.",
      appears: [4],
      rel: [ { to: "cow", label: "bulled" }, { to: "calf", label: "sire of" } ] },
    { id: "calf", name: "The unborn calf", role: "beast", epithet: "Cú Chulainn's life measured in its growth",
      blurb: "<em>You will be alive until the calf in this cow's womb is a yearling, and it is that calf that will cause the Táin.</em> In Echtra Nerai it comes out of the síd bellowing three times.",
      appears: [4],
      rel: [ { to: "cuchulainn", label: "measures the life of" } ] },
  ],
};
