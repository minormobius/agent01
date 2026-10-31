/* The motif index — Aided Muirchertaig meic Erca against the Thompson
   Motif-Index. As for Nera, T. P. Cross's Motif-Index of Early Irish
   Literature (1952) is the specialised index and is not cited by
   number; codes are Thompson's, and motifs without a secure number are
   shown by class letter. Confidence flags as on the sister tales.
   Attaches to window.MUIRCHERTACH. */
window.MUIRCHERTACH = window.MUIRCHERTACH || {};
window.MUIRCHERTACH.motifs = {
  intro: "This is the densest motif-load in the series. <strong>C</strong> (tabu) and <strong>D</strong> (magic) dominate, because the whole tale is a set of conditions and a set of illusions, and <strong>M</strong> (the future) is heavy with dreams and prophecies that all come true. Where Nera's tale was rich in E (the dead) and Þiðrandi's in V (religion), this one is rich in <strong>K</strong>, deception. Below are 23 motifs, cross-referenced to Nera and Þiðrandi.",
  taletypes: [
    { code: "Aided", name: "A death-tale — one of the native Irish tale-genres", conf: "high",
      gloss: "The Irish tale-lists file stories by genre, and <em>aitte</em> or <em>oitte</em> (deaths) are one of the largest: the deaths of Cú Chulainn, Conchobar, Fergus, Diarmait and many kings. An <em>aided</em> explains how a famous man died, and here it explains the annals' strange phrase for Muirchertach: drowned and burned." },
    { code: "The threefold death", name: "A king dies by several means at once", conf: "med",
      gloss: "A recurrent pattern in Irish, Welsh and Scottish kingship-tales, with Diarmait mac Cerbaill, Lailoken and Merlin: a king or prophet dies by wounding, burning and drowning together, usually as the price of a broken bond with the sacred. Muirchertach's death fits it nearly, with the spears in the doorways, the fire and the vat. Scholars have read the pattern as an old sacrificial form, though how old is disputed." },
    { code: "Sovereignty, inverted", name: "The woman of the land who takes the kingship away", conf: "med",
      gloss: "In Irish kingship-tales a supernatural woman met by a lone man gives him the sovereignty of the land (Niall and the hag at the well, in <em>Echtra Mac nEchach</em>). Sín meets a king alone on a mound, as the sovereignty-woman does, and takes it all back. She speaks for the <em>old tribes of Tara</em>, the people of the land before his dynasty." },
  ],
  classOrder: ["C", "D", "E", "F", "K", "M", "Q", "V", "Z"],
  classes: { C: "Tabu", D: "Magic", E: "The dead", F: "Marvels &amp; the otherworld", K: "Deceptions", M: "Ordaining the future", Q: "Rewards &amp; punishments", V: "Religion", Z: "Formulas &amp; symbols" },
  list: [
    // — C · Tabu —
    { cls: "C", code: "C432", name: "Tabu: uttering the name of a supernatural creature", conf: "high", passages: [1, 7],
      gloss: "<em>My name must never be spoken by you.</em> Thompson's C432 covers the tabu on speaking a supernatural being's name, as in Rumpelstiltskin, Lohengrin and Melusine. Here the tabu is cruelly designed, because her names are the weather of winter (storm, sigh, winter-night), so he breaks it by describing the night, three times. <strong>Compare Þiðranda þáttr</strong>: <em>whatever signs come, let no one answer</em>. Both tales make a rule about speech and response." },
    { cls: "C", code: null, name: "Tabu: the clerics must not enter the house", conf: "high", passages: [1, 3, 6],
      gloss: "The condition that keeps the Church out of Cletech. The tale enforces it physically (Sín will not let Cairnech near the fort), and it is broken only by the king going out to the clerics. The threshold again: the clerics' fire burns in the church across the field, and the danger is the house." },
    { cls: "C", code: null, name: "Geis broken by circumstance", conf: "med", passages: [7],
      gloss: "The Irish hero is destroyed when his <em>gessa</em> are forced into conflict or broken without intent (Conaire in <em>Togail Bruidne Da Derga</em>, Cú Chulainn eating dog-meat). Muirchertach breaks his by remarking on the weather. <strong>Compare Echtra Nerai</strong>, where Cú Chulainn's gessa are listed in a gloss." },

    // — D · Magic —
    { cls: "D", code: "D2031", name: "Magic illusion — stones and sods as armies", conf: "high", passages: [4, 5, 6],
      gloss: "Stones become blue men, goat-headed men and headless men, and sods and stalks become hosts. Under the Cross they are <em>fern and stones and puffballs</em>. D2031 (magic illusion) is the class. The detail that every man the king kills rises again is the nightmare's own, the inexhaustible enemy." },
    { cls: "D", code: "D478", name: "Water turned to wine; fern turned to swine", conf: "med", passages: [4, 5],
      gloss: "<em>Wine of the Boyne… sheep of stones, and swine of ferns.</em> Transformations of substance (D470s; the exact number is uncertain), and a deliberate parody of the miracle at Cana. Sín claims to match any miracle of the clerics' God. The parody is in the substance: water to wine." },
    { cls: "D", code: "D1364", name: "Sleep-producing drink", conf: "high", passages: [8],
      gloss: "<em>bricht súain</em>, a sleep-spell in <em>fín mbréci</em>, lying wine. D1364 (object causes magic sleep). <strong>Compare Þiðranda þáttr</strong>, where the whole household sleeps through the killing, and Þórhallr says they <em>overslept</em>." },
    { cls: "D", code: "D2140", name: "Magic control of the weather — the snowstorm from the north-west", conf: "high", passages: [7],
      gloss: "She shapes a great snowfall, <em>from the north-west, precisely</em>, on the night she has chosen. The storm both is her and is her name. <strong>Compare Þiðranda þáttr</strong>, where a storm keeps the guests away on the night of the killing." },
    { cls: "D", code: "D788", name: "The Cross over the eyes dispels the illusion", conf: "high", passages: [6],
      gloss: "<em>Put Christ's Cross across your eyes.</em> The sign of the Cross breaks enchantment, a near-universal Christian folk motif (disenchantment by making the sign of the Cross). What is remarkable is that it <em>works</em> and is then refused." },

    // — E · The dead —
    { cls: "E", code: null, name: "The dead slain who rise again", conf: "high", passages: [5],
      gloss: "<em>Every man of them he killed rose up again straight away after him.</em> A ghost-army that cannot be destroyed, like the Norse <em>Hjaðningavíg</em>, the eternal battle whose dead are raised every night to fight again. Thompson's E155.1, slain warriors who revive nightly, is the nearest number. In the Irish tale the dead are stones." },
    { cls: "E", code: "E500", name: "Phantom host around the house", conf: "high", passages: [7, 8],
      gloss: "<em>slúag síabra</em>, the phantom host, seen in his dreams and then around the burning house. <strong>Compare Echtra Nerai</strong>, where Nera sees a phantom host burn Crúachan and is told it can be averted by telling. Muirchertach tells it twice, and it is not averted." },

    // — F · Marvels & the otherworld —
    { cls: "F", code: "F302", name: "Fairy mistress — the woman on the grave-mound", conf: "high", passages: [1, 2],
      gloss: "A woman alone in a green mantle on a burial mound by the Bruig, <em>at home in places more secret than this</em>. <strong>Compare Echtra Nerai</strong>, where the fairy woman marries the hero and saves his people. Here she marries the hero and destroys his house. And Pwyll's Rhiannon rides out of a mound to choose her husband. The Insular fairy bride is never a prize." },
    { cls: "F", code: "F211", name: "The Bruig — the síd of the Boyne", conf: "high", passages: [1, 5, 6],
      gloss: "Brú na Bóinne (Newgrange, Knowth, Dowth) is the home of the Dagda and Óengus in Irish tradition. Cletech faces it across the river, Sín appears on a mound at its edge, her armies are drawn up on its green, and the king digs a church trench into it, <em>the first time ever the green of the Bruig was broken</em>." },

    // — K · Deceptions —
    { cls: "K", code: "K1810", name: "Deception by false identity — “I am the sweetheart of Muirchertach”", conf: "high", passages: [1, 9],
      gloss: "She tells him the truth (she loves him; she knows him) and hides the rest (whose daughter she is) until he is dead. Every true thing she says works as a lie." },
    { cls: "K", code: "K2213", name: "Treacherous wife / mistress", conf: "high", passages: [7, 8],
      gloss: "<em>Sleep, and leave the watching to me.</em> Thompson's K2213 is the treacherous wife. Sín is a revenger as much as a traitor, and she warns him in verse (<em>do not sleep</em>) an hour before she sets the fire." },
    { cls: "K", code: null, name: "Weapons turned against their owners", conf: "high", passages: [8],
      gloss: "<em>She set the spears and javelins of the hosts ready in the doorways, with all their points turned towards the house.</em> A house is made into a trap with its own arms, and the household is wounded by its own spears as it breaks out. It is the most precise act of malice in the series." },
    { cls: "K", code: null, name: "False report of the attacker", conf: "high", passages: [8],
      gloss: "<em>It is Tuathal Máelgarb, avenging Granard.</em> She gives him a human enemy to fight so he will not look at her. The scribe interrupts to correct it: <em>no bodily host</em>." },

    // — M · Ordaining the future —
    { cls: "M", code: "M341", name: "Death foretold — as the grandfather died", conf: "high", passages: [6, 7],
      gloss: "<em>It was foretold to me that my death would be like the death of Loarn my grandfather… he was burned.</em> M341 (death prophesied). He killed his grandfather, and the prophecy makes him repeat him. <strong>Compare Þiðranda þáttr</strong>: <em>it will go forward as it is intended</em>. Neither prophecy can be dodged." },
    { cls: "M", code: "D1812.3.3", name: "Prophetic dreams — three of them, all correct", conf: "high", passages: [7, 8],
      gloss: "A phantom host and a red fire; the ship, the griffin and the burning nest; the house burning over him. Each is told, one is expertly read, and all are ignored. In Nera a vision told is a vision undone. Here telling changes nothing. The Irish tales disagree with each other on what speech can do." },

    // — Q · Rewards & punishments —
    { cls: "Q", code: null, name: "Death of grief — the wife at the tree, the witch at the grave", conf: "high", passages: [9],
      gloss: "Duaibsech dies against the old tree at Óenach Reil of a burst heart, and Sín dies at the graveside, confessed. Two women die of grief for the same man, a day apart. The killer is punished by nothing but her love." },

    // — V · Religion —
    { cls: "V", code: "V331", name: "The saint against the sorceress", conf: "high", passages: [3, 6, 9],
      gloss: "Cairnech's curse, his three clerics, the Cross, the confession, and the prayer out of hell. The Church wins every engagement but the one that matters, and wins that one after the king's death. <strong>Compare Þiðranda þáttr</strong>, where the new faith's white riders arrive too late. In both tales the Christian rescue comes just after it was needed." },
    { cls: "V", code: null, name: "Soul released from hell by a saint's prayer", conf: "high", passages: [9],
      gloss: "<em>Parce mihi, Domine</em>, recited until the king's soul is given back, and an angel says it would save Judas. The tale ends by undoing its own damnation." },

    // — Z · Formulas & symbols —
    { cls: "Z", code: "Z71.1", name: "Formulistic number: three", conf: "high", passages: [1, 4, 6, 9],
      gloss: "Three conditions, three vats of wine, three clerics, three dreams, three graves. <strong>Compare both sister tales</strong>, which also count to three: the withy, the houses and the bellows in Nera, the knocks in Þiðrandi." },
    { cls: "Z", code: "Z71.5", name: "Formulistic number: seven — the seventh night", conf: "high", passages: [7],
      gloss: "<em>That was the seventh night Sín had been working her magic on them.</em> A week of enchantment, ending on the Tuesday after Samhain." },
  ],
};
