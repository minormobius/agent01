/* The motif index — Echtra Nerai classified against the Thompson
   Motif-Index, Christiansen's Migratory Legends and the native Irish
   tale-list genres. For Irish material the specialised index is T. P.
   Cross, Motif-Index of Early Irish Literature (1952); its numbers are
   not cited here because they could not be checked from the sandbox,
   so codes are Thompson's, and a motif with no secure Thompson number
   is shown by class letter alone.

   Confidence flags, as on the sister tales:
     high = well-attested code and application
     med  = code right, application interpretive
     spec = speculative (no secure number, or a contested reading)
   Attaches to window.NERA. */
window.NERA = window.NERA || {};
window.NERA.motifs = {
  intro: "Folklorists have their own Dewey decimal. The <strong>Thompson Motif-Index</strong> files every recurring story-atom under a letter-class and a number: B animals, C tabu, D magic, E the dead, F marvels, H tests, M ordaining the future, N chance, Z formulas. Two other indexes matter here: the <strong>ATU</strong> index of tale-types, and Christiansen's index of <strong>Migratory Legends</strong> (ML), which covers the believed-true stories that cluster round fairies and the dead. <em>Echtra Nerai</em> scores high in exactly the classes a ghost story should, <strong>E</strong> (the dead) and <strong>F</strong> (the otherworld), and it carries one class few medieval tales do: <strong>C</strong>, a household tabu that was still being collected from Irish storytellers a thousand years later. Below are 26 motifs, with cross-references to the sister tales on this site where the same atom lands.",
  taletypes: [
    { code: "Echtrae", name: "The otherworld adventure — a native Irish tale-genre", conf: "high",
      gloss: "The medieval Irish tale-lists sort stories by genre: <em>tána</em> (cattle-raids), <em>togla</em> (destructions), <em>aitheda</em> (elopements), <em>echtrai</em> (adventures, specifically journeys into the otherworld). This tale is named <em>Echtra Nerai</em> in the Book of Leinster's list. Its siblings are <em>Echtrae Chonnlai</em>, whose hero sails off with a fairy woman and is never seen again, <em>Echtrae Cormaic</em> and <em>Echtra Láegairi</em>, and the genre is the native Irish ancestor of the fairy-abduction legend." },
    { code: "Remscél", name: "A fore-tale of the Táin Bó Cúailnge", conf: "high",
      gloss: "The Book of Leinster names it among the <em>remscéla</em>, the fore-tales that explain how the Cattle Raid of Cooley came about, and H. 2. 16 closes with the same claim. Its job in the cycle is to get a calf of the Brown Bull's begetting onto the plain of Crúachan and Medb's oath into the record. It is the ghost story through which the epic begins. The other copy calls it <em>Táin Bé Aingen</em>." },
    { code: "ML 4075", name: "Visits to fairy dwellings (Christiansen, Migratory Legends)", conf: "med",
      gloss: "The migratory legend of the mortal who enters a fairy hill, lives or works there, and comes out to find time has run strangely. It is collected all over Ireland, Scotland and Scandinavia in the 19th and 20th centuries. Nera is the earliest literary member of the family, and he runs it backwards: three days inside are no time outside, where later tellings make one night a hundred years." },
    { code: "ATU 470", name: "Friends in Life and Death — the otherworld visit with time-slip", conf: "spec",
      gloss: "The international tale-type in which a living man visits the other world (often at a dead friend's invitation) and finds time has passed differently there. The resemblance to <em>Echtra Nerai</em> is in the structure, not the plot, and it is listed for comparison only. The hanged man who invites Nera into the night is the closest thing to the dead host of ATU 470." },
  ],
  classOrder: ["B", "C", "D", "E", "F", "H", "M", "N", "Z"],
  classes: { B: "Animals", C: "Tabu", D: "Magic", E: "The dead", F: "Marvels &amp; the otherworld", H: "Tests &amp; tokens", M: "Ordaining the future", N: "Chance &amp; fate", Z: "Formulas &amp; symbols" },
  list: [
    // — B · Animals —
    { cls: "B", code: "B140", name: "Prophetic animal", conf: "med", passages: [8],
      gloss: "The bull-calf bellows three times coming out of the síd, and Fergus makes prophetic verse of it (<em>there will be calves without cows…</em>). Beaten by the Whitehorn, it bellows again, and the cowherd Buaigle reads the bellow as a forecast of the Brown Bull's vengeance. The Táin itself is full of animal speech. This is where it starts." },
    { cls: "B", code: "B260", name: "Animal warfare — the bulls as proxies", conf: "med", passages: [8],
      gloss: "Bull-calf against Whitehorn for a day and a night on the plain of Crúachan: a duel of beasts on behalf of two provinces, a rehearsal for the meeting of the Donn and the Finnbennach at the end of the Táin. In <em>De Chophur in Dá Muccida</em> the two bulls are reincarnated swineherds of the síd, so the war over cattle is an otherworld quarrel that has taken animal form." },
    { cls: "B", code: null, name: "The otherworld cow bulled by the Brown Bull", conf: "high", passages: [7],
      gloss: "The Morrígan carries Aingen's cow across Ireland to be put to the Donn Cúailnge, so that the calf of the síd will be a son of the Táin's bull. The same episode is told in <em>Táin Bó Regamna</em>, where the goddess tells Cú Chulainn the calf will be the cause of the war. Compare <strong>Pwyll</strong>'s foal stolen every May Eve from Teirnon's mare by an unseen claw: in Wales too an otherworld power takes a beast at a calendar threshold, and the theft brings on the story." },

    // — C · Tabu —
    { cls: "C", code: null, name: "Tabu: leaving foot-water, bath-water or a slop-pail in the house overnight", conf: "high", passages: [2],
      gloss: "The second house is safe because its water was emptied; the third dies because it was not. The tale states the rule outright: <em>it is not good to have washing-water, or bathing-water… or a slop-tub in a house after bedtime</em>. The belief has an extraordinary afterlife. The National Folklore Collection's Schools' Collection (1937–39) and later fieldwork record all over Ireland that <em>uisce na gcos</em>, the water feet were washed in, must be thrown out before bed, with a warning call (<em>Chugaibh an t-uisce!</em>, “water coming to you!”) so that the good people or the dead are not struck by it, and that dirty water left standing lets them in. The rule in an 11th-century manuscript is a rule 20th-century children could recite." },
    { cls: "C", code: null, name: "Tabu: the unraked fire", conf: "high", passages: [2],
      gloss: "The first house is ringed by a lake of fire, and the dead man will not go in: <em>there is never a fire there without its being raked</em>. The raking of the hearth (<em>coigilt na tine</em>), banking the embers under ash at bedtime, was a nightly household ritual in Ireland and Gaelic Scotland, done with a prayer, and the smoored fire was a protection. The tale pairs it with the water rule, so the two universal domestic chores of the last thing at night both appear as defences against the dead." },
    { cls: "C", code: null, name: "Geis — the hero's binding prohibitions", conf: "high", passages: [7],
      gloss: "A bracketed list of Cú Chulainn's <em>gessa</em>: no woman, no bird, no fish and no foreign warrior to cross his country without his knowledge or challenge. The <em>geis</em> is the signature institution of early Irish narrative. A hero's prohibitions define him, and breaking them kills him (Conaire in <em>Togail Bruidne Da Derga</em>, Cú Chulainn himself in his death-tale). Here they explain why he is standing on the road when the Morrígan comes by." },

    // — D · Magic —
    { cls: "D", code: "D1825.1", name: "Second sight — a vision of what is to come", conf: "med", passages: [3, 5],
      gloss: "Nera sees Crúachan burned and its household beheaded. The fairy wife explains that it was a phantom host showing him the future, and that it will come true unless it is told. The vision is real and conditional at once. It is closer to the later Gaelic <em>an dà shealladh</em> (“the two sights”, second sight) than to a dream, because Nera is awake on the road when it comes." },
    { cls: "D", code: "D2011", name: "The time-slip (cf. Years thought days)", conf: "med", passages: [5, 6],
      gloss: "Three days and three nights in the síd, and at Crúachan <em>they are still round the same cauldron</em>. The tale's direction is the rare one, where the otherworld runs fast and the world stands still. The usual later form, one night a century, is Oisín's, Rip Van Winkle's and that of every ML 4075 legend. For the canonical fairyland form see <strong>F377</strong> below. <strong>Compare Sir Orfeo</strong>, where ten years pass outside while the queen is held in the fairy king's hall unchanged." },

    // — E · The dead —
    { cls: "E", code: "E422", name: "The living corpse", conf: "high", passages: [1, 2, 3],
      gloss: "A hanged man who talks about knots, flatters, asks for a drink, rides on a man's back and kills a household, then lets himself be put back on the gallows. Thompson's E422 (“the living corpse: dead body animated”) has no better early instance. He is not a ghost (no spirit is mentioned, and he is all body: thirst, weight, mouth) and not quite a revenant, since he does not come back to anyone. The Norse <em>draugr</em> of the sagas is his nearest kin: heavy, physical, dangerous to households." },
    { cls: "E", code: null, name: "The thirsty dead", conf: "med", passages: [2],
      gloss: "<em>I had a great thirst on me when I was hanged.</em> The dead man wants a drink, and only from the house with dirty water left out. Across Europe the dead are thought to come back to houses on certain nights for warmth, food and water. Bretons and many others left food out on the eve of All Souls (2 November), and Irish custom swept the hearth and left the door unlatched for them on the night of All Souls. This tale shows the darker side of that hospitality: the dead drink, and what they drink kills." },
    { cls: "E", code: null, name: "The deadly spittle", conf: "spec", passages: [2],
      gloss: "<em>He spat the last mouthful from his lips into the faces of the people… so that they all died.</em> I know of no exact parallel. The nearest are the Irish beliefs that a corpse's breath or the water used to wash a corpse is lethal, and that such water must not be thrown out on a path where people walk. The act is told without comment, which is what makes it so frightening." },
    { cls: "E", code: "E500", name: "Phantom host", conf: "high", passages: [3],
      gloss: "<em>slúag síabrae</em>, the host of phantoms that burns Crúachan before Nera's eyes and files back into the hill passing word of him down the line. The same atom gives the later European Wild Hunt (E501) and the Scottish <em>sluagh</em>, the host of the unforgiven dead who fly on the west wind. <strong>Compare Sir Orfeo</strong>: the fairy king's hunt and riding host seen in the wilderness, and the courtyard of the taken frozen as they were at the moment of their taking." },

    // — F · Marvels & the otherworld —
    { cls: "F", code: "F211", name: "Fairyland in a hollow hill", conf: "high", passages: [3, 4, 5, 6, 8],
      gloss: "The síd of Crúachan, with a king, a fort, houses, a well, herds and a woman living alone, all under the hill. <em>Síd</em> means the mound, the world inside it, and its people at once (<em>áes síde</em>). Ireland's síde are Neolithic and Bronze Age burial mounds, which medieval Irish took to be the houses of the old gods. The Rathcroghan complex in Co. Roscommon has more than 240 recorded monuments." },
    { cls: "F", code: "F92", name: "Cave entrance to the lower world", conf: "med", passages: [3],
      gloss: "<em>Úaimh Chrúachan</em>, the Cave of Crúachan: Oweynagat (“the cave of the cats”), a stone-lined souterrain opening into a natural limestone fissure, still visitable. Medieval texts send otherworld beasts out of it: the pigs that blight the land in <em>Cath Maige Mucrama</em> come from here, and the Dindshenchas makes it the Morrígan's dwelling. Later tradition called it Ireland's gate to hell." },
    { cls: "F", code: null, name: "The síde stand open at Samhain", conf: "high", passages: [1, 7],
      gloss: "<em>ar it aursluicthi síde hÉrenn dogrés im samain</em>, “for the fairy-mounds of Ireland are always opened about Samhain”. This is the plainest medieval statement of the belief behind modern Halloween. Samhain stories cluster on it: Fionn guarding Tara against Aillén, who burns the hall every Samhain (<em>Acallam na Senórach</em>); Cú Chulainn's wasting-sickness (<em>Serglige Con Culainn</em>, set at the Samhain assembly); the swan-transformation of <em>Aislinge Óenguso</em> at Samhain. <strong>Compare Pwyll</strong>, where the threshold night is May Eve (<em>nos Calan Mai</em>) and the otherworld takes Teirnon's foals. <strong>Compare Þiðranda þáttr</strong>, the Norse counterpart, where the seer watches as <em>many a hill is opening</em> and the land-spirits pack up and leave Iceland for good."},
    { cls: "F", code: "F302", name: "Fairy wife — mortal man lives with fairy woman", conf: "high", passages: [3, 4, 5, 6, 7],
      gloss: "The king sends him to “a woman living alone”, and from then on the text calls her his wife. She is a fairy wife of an unusual sort: practical, clear-headed and on his side against her own people, and nothing in the tale suggests she is a lure. <strong>Compare Pwyll</strong>'s Rhiannon, who rides out of the Gorsedd mound and chooses her mortal husband herself. The Irish and Welsh otherworld brides are agents, not prizes." },
    { cls: "F", code: "F305", name: "Offspring of fairy and mortal", conf: "high", passages: [5, 6],
      gloss: "<em>I will be with child by you, and I'll bear you a son.</em> Aingen is born during Nera's year above ground. Through his cow he becomes, without doing anything, the cause of the Táin." },
    { cls: "F", code: "F377", name: "Supernatural lapse of time in fairyland", conf: "high", passages: [5],
      gloss: "Thompson's canonical code for the time-slip. Its usual form is the fast outside world, but the code covers any supernatural difference between the two clocks. See <strong>D2011</strong> above for the direction of Nera's slip." },
    { cls: "F", code: null, name: "The mortal who stays in the hill forever", conf: "high", passages: [8],
      gloss: "<em>Nera was left with his people in the síd, and has not come out until now, nor will he come till Doom.</em> The ending is the oldest Irish form of an ending later tradition never stopped retelling: Connla in his crystal boat, Thomas the Rhymer's seven years, the Scottish and Irish legends of men “taken” by the fairies, and Tam Lin, captured, whose rescue is set on Halloween night. <strong>The sharp contrast is Sir Orfeo</strong>, the English Breton lay in which the hero walks into the hollow hill and walks out again with his wife. Nera walks in with his family and stays." },

    // — H · Tests & tokens —
    { cls: "H", code: "H1400", name: "Test of fear — the dare on Samhain night", conf: "high", passages: [1],
      gloss: "A king's challenge to go out in the dark and do something to a corpse. Thompson's H1400 (fear test) covers the European folktale of the youth who wants to learn what fear is (ATU 326), who is sent among hanged men at night and talks to the corpses. Nera passes the oldest form of that test, and passing it is only the beginning." },
    { cls: "H", code: "F971.5", name: "Flowers of summer on the first night of winter", conf: "med", passages: [5],
      gloss: "<em>Take the fruits of summer with you</em>: wild garlic, primrose and golden fern, carried out of the hill on the night summer ends. They are the proof-token (H80, identification by tokens) that he has been inside, where it is still summer. The image of out-of-season bloom as proof of the otherworld recurs in the Middle Irish voyage tales and in the Book of Taliesin's Caer Siddi, where neither plague nor old age touches anyone." },

    // — M · Ordaining the future —
    { cls: "M", code: "M340", name: "Unfavourable prophecy — averted by being told", conf: "med", passages: [5, 6, 8],
      gloss: "<em>That will come true, unless he tells it to his friends.</em> An unusual mechanic: the vision is fixed unless spoken, and speaking it reverses it. In the event the sack falls on the síd, the side that made the prophecy. It is the hinge of the second half, and an argument for telling ghost stories." },
    { cls: "M", code: null, name: "The queen's vow of abstention", conf: "high", passages: [8],
      gloss: "<em>I swear by the gods my people swear by, that I will not lie down… nor taste food, until I see those two bulls fighting before my eyes.</em> This is a heroic vow (M100s, vows and oaths) in the Ulster Cycle's stock formula (<em>tongu do dia toinges mo thúath</em>), spoken by the queen. It turns the bull-calf's bellow into a war aim." },

    // — N · Chance & fate —
    { cls: "N", code: "N886", name: "Blind man carries lame man", conf: "high", passages: [4],
      gloss: "Every day a blind man carries a lame one to the well where the king's crown is kept. They were maimed so that they could be trusted: neither can steal the crown alone. The motif is ancient. The Babylonian Talmud (Sanhedrin 91a–b) gives Rabbi Judah's parable of a king's orchard guarded by a blind man and a lame man who steal its figs together, the lame on the blind man's shoulders, as an image of body and soul judged together. It passes into Christian homiletic and the <em>Gesta Romanorum</em>, and in Sanskrit logic it is the stock <em>andha-paṅgu-nyāya</em>, the maxim of the blind and the lame. The Irish tale uses it as statecraft rather than allegory, and as a mirror: Nera too came into this world carrying a body that could not walk." },

    // — Z · Formulas & symbols —
    { cls: "Z", code: "Z71.1", name: "Formulistic number: three", conf: "high", passages: [1, 2, 4, 5, 8],
      gloss: "The withy springs off three times, there are three houses, Nera spends three days and three nights in the síd, the calf bellows three times, he brings his drove out on the third day before Samhain, and there are three treasures of Ireland. Early Irish learning was organised in triads (<em>Trecheng Breth Féne</em>, “the Triads of Ireland”), and the tale is triadic at every scale." },
    { cls: "Z", code: null, name: "The whispered relay down the line", conf: "spec", passages: [3],
      gloss: "<em>A man on the track here — The heavier the track</em>, passed from the last man to the first and never answered by anyone turning round. I know no indexed motif for it, but it is the most modern-feeling moment in the tale: dread built by withholding, the host aware of the follower and not looking back." },
  ],
};
