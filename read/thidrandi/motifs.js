/* The motif index — Þiðranda þáttr classified against the Thompson
   Motif-Index, with the Norse belief-vocabulary (dísir, fylgjur,
   landvættir) that Thompson's index only half covers. For Old Norse
   material the specialised index is Inger Boberg, Motif-Index of
   Early Icelandic Literature (1966); its numbers are not cited because
   they could not be checked from the sandbox. Codes are Thompson's,
   and a motif with no secure Thompson number is shown by class letter.

   Confidence flags: high = code and application secure;
   med = code right, application interpretive; spec = speculative.
   Attaches to window.THIDRANDI. */
window.THIDRANDI = window.THIDRANDI || {};
window.THIDRANDI.motifs = {
  intro: "The Thompson index sorts story-atoms by class: C tabu, D magic, E the dead and the soul, F spirits and marvels, M ordaining the future, V religion, Z formulas. <em>Þiðranda þáttr</em> is short, and dense in exactly two places: <strong>M</strong>, because the death is foretold from the start, and <strong>V</strong>, because the whole tale is a parable of the conversion. Where <em>Echtra Nerai</em> scored in E (the dead), this tale has <em>no dead at all</em> until Þiðrandi himself. Its supernatural beings are guardian spirits, not ghosts. Below are 17 motifs, cross-referenced to Nera wherever the two tales meet.",
  taletypes: [
    { code: "Þáttr", name: "A short episode set inside a king's saga", conf: "high",
      gloss: "Icelandic <em>þættir</em> (“strands”) are short narratives about Icelanders, preserved inside larger sagas of Norwegian kings. This one is filed in the Greatest Saga of Óláfr Tryggvason among the signs and wonders before the conversion. That placement is an interpretation in itself: the compiler has made a ghost story into a chapter of church history." },
    { code: "Sagn", name: "Legend, not tale — told as true, of named people", conf: "high",
      gloss: "C. W. von Sydow's distinction between the folktale (<em>Märchen</em>, told as fiction, anywhere and anyone) and the legend (<em>sägen</em>, told as true, of a named place and person). This is a legend. The family is real, the farms are on the map, and the dying man's own testimony is the source. <em>Echtra Nerai</em> sits between the two, a tale with a legend's aetiology. The difference matters for the series. A legend is believed, and that is where its dread comes from." },
    { code: "Conversion legend", name: "The old powers' last act before the new faith", conf: "high",
      gloss: "One of a family of Icelandic and Norwegian narratives in which the heathen powers act once more, violently or sorrowfully, as Christianity arrives. Others include the rock-dwelling spirit of <em>Þorvalds þáttr víðförla</em> driven from its stone by holy water, and the land-spirits who turn back the Danish king's spy in <em>Óláfs saga Tryggvasonar</em> in Heimskringla. In such tales the old powers are rarely mere demons. They are dispossessed tenants." },
  ],
  classOrder: ["C", "D", "E", "F", "M", "V", "Z"],
  classes: { C: "Tabu", D: "Magic", E: "The soul &amp; guardian spirits", F: "Spirits &amp; marvels", M: "Ordaining the future", V: "Religion", Z: "Formulas &amp; symbols" },
  list: [
    // — C · Tabu —
    { cls: "C", code: null, name: "Tabu: going out of the house on a perilous night", conf: "high", passages: [3, 4],
      gloss: "<em>That no one go out tonight.</em> The rule is spoken, endorsed and understood. <strong>Compare Echtra Nerai</strong>, where on Samhain night <em>each man went out in turn… and quickly he came back in</em>. In both tales the festival night makes the space just outside the door dangerous, and the hero is the one who goes further than the rest. Nera's tale has rules for the house (rake the fire, empty the water); this one has a rule for the people (stay in). Both are rules about the threshold." },
    { cls: "C", code: null, name: "Tabu: answering a summons at night", conf: "med", passages: [3, 4],
      gloss: "<em>Whatever signs come, let no one answer.</em> The belief that a call or knock in the night may come from something that must not be answered is attested across northern folklore, in Ireland, Scotland and Scandinavia alike, sometimes with the rule that only a <em>third</em> call is safe to answer, since the otherworld calls once or twice. Here it is the third knock that brings Þiðrandi to his feet." },
    { cls: "C", code: null, name: "Tabu: too much praise", conf: "med", passages: [2],
      gloss: "The seer falls silent whenever the boy is praised most. The belief that praise draws misfortune onto the praised is old and widespread: the evil eye, Irish “overlooking” and the blessing that must follow a compliment to a child (<em>God bless it</em>), and the Greek <em>phthonos</em>. Þórhallr's own explanation is gentler (the boy will be grieved for enough), but the silence works as a warning sign." },

    // — D · Magic —
    { cls: "D", code: "D1812", name: "Power of prophecy — the seer", conf: "high", passages: [1, 2, 6, 7],
      gloss: "<em>Þórhallr spámaðr</em>, far-seeing: he foresees the death, the change of faith and the departure of the hill-folk. Norse seers are often women (the <em>völva</em> of <em>Eiríks saga rauða</em>, who also prophesies at a winter feast); a male <em>spámaðr</em> is rarer. <strong>Compare Nera's fairy wife</strong>, the other tale's interpreter. Both tales hinge on a figure who explains to the hero's people what the night meant." },

    // — E · The soul & guardian spirits —
    { cls: "E", code: null, name: "Fylgja — the attendant spirit of a family", conf: "high", passages: [4, 6],
      gloss: "<em>fylgjur yðrar frænda</em>, “your kinsmen's followers”. The <em>fylgja</em> (“follower”) is the Norse attendant spirit, sometimes an animal form seen in dreams before a death, sometimes a woman attached to a family line (<em>ættarfylgja</em>) who passes from one generation to the next. Thompson files the idea near E720 (soul as guardian spirit) without a secure Norse number; Boberg's index treats it at length. Here the family's fylgjur turn on it." },
    { cls: "E", code: null, name: "Dísir — female powers who take a sacrifice", conf: "high", passages: [4, 6],
      gloss: "<em>dísir</em> are female supernatural beings tied to fate, family and fertility. Sagas name a <em>dísablót</em>, a sacrifice to the dísir, held at the Winter Nights, exactly the season of this feast. Þórhallr's reading makes the killing a <em>dísablót</em> turned round: the household holds the feast, and the dísir take the offering themselves. <em>Njáls saga</em> (c. 1280) already remembers Þiðrandi as the man “whom the dísir slew”, so the identification is older than this text." },
    { cls: "E", code: "E501", name: "Riders in the night", conf: "spec", passages: [4],
      gloss: "Two mounted companies crossing the home-field in the dark. Thompson's E501 is the Wild Hunt, the phantom hunt or army riding through the winter sky. The black riders are not the Wild Hunt, but the image belongs to the same northern winter repertoire. <strong>Compare Echtra Nerai</strong>'s phantom host (E500) filing back into the hill, also seen by a single man outside the house on the festival night." },

    // — F · Spirits & marvels —
    { cls: "F", code: "F388", name: "The spirits depart", conf: "med", passages: [7],
      gloss: "<em>Many a hill is opening, and every living creature is packing its bag, small and great, and making its flitting.</em> Thompson's F388, “fairies depart”, is the motif of the hidden people leaving a country, often because of church bells or the coming of Christianity, and it is collected all over Britain and Scandinavia. Þórhallr's vision is one of its oldest written forms, and the funniest. The <em>fardagar</em> are the legal spring moving-days of Iceland, so the land-spirits leave like tenants at the end of a lease. <strong>Compare Echtra Nerai</strong>: <em>the síde of Ireland are always open at Samhain</em>. In both tales the hills open. In Ireland it is every year and something comes out. In Iceland it is once and everything leaves." },
    { cls: "F", code: null, name: "Burial in a mound “after the old custom of heathen men”", conf: "high", passages: [5],
      gloss: "Þiðrandi is laid in a <em>haugr</em>, a burial mound. It is a historical detail (pre-conversion mound burials are well known in Iceland) and a symbolic one: he is buried in the same kind of hill that opens in the last movement. <strong>Compare Nera</strong>, who walks alive into a síd, a burial mound in Irish belief. Both heroes end inside a hill." },

    // — M · Ordaining the future —
    { cls: "M", code: "M370", name: "Vain attempt to escape a prophecy — the ox called Seer", conf: "high", passages: [2],
      gloss: "<em>A seer will be killed at the feast.</em> Hallr tries to fulfil the words harmlessly by slaughtering an old ox nicknamed <em>Spámaðr</em>. It is the classic move of the prophecy tale (Oedipus, Baldr, the sleeping princess's spindles), here done as a farmer's joke, and like all of them it does nothing. The seer had said the news was <em>greater and stranger</em> than his own death." },
    { cls: "M", code: null, name: "Fatalism: it will go forward as it is intended", conf: "high", passages: [2],
      gloss: "<em>þat mun fram ganga sem ætlat er.</em> The saga attitude to fate in one sentence: foreknowledge does not confer the power to prevent. The seer warns, and does not try to stop it." },
    { cls: "M", code: "M340", name: "Unfavourable prophecy", conf: "high", passages: [2, 6],
      gloss: "The death, and the <em>siðaskipti</em>, the change of faith. Both are foretold and both come true. <strong>Compare Echtra Nerai</strong>, where the prophecy is conditional (<em>unless he tells it</em>) and telling it reverses the outcome. Here telling it changes nothing. The Irish vision can be averted; the Norse one cannot." },

    // — V · Religion —
    { cls: "V", code: "V331", name: "Conversion to Christianity", conf: "high", passages: [6, 7],
      gloss: "The whole tale points toward the conversion of Iceland (c. 999/1000), which follows in the next chapter. Hallr of Síða becomes Þangbrandr's great convert, and the compiler's sermon recasts the dísir as the Devil. The tale stands on the line between the two religions and looks both ways." },
    { cls: "V", code: null, name: "Two readings kept side by side", conf: "med", passages: [6],
      gloss: "The seer says the black riders were the family's fylgjur taking their tribute. The compiler says they were the Enemy of mankind raging at his loss. The text keeps both and reconciles neither, and that is why the older belief survives. <strong>Compare Echtra Nerai</strong>, where the Christian scribe writes <em>demnai</em>, demons, for what the tale itself shows to be the people of the síd." },

    // — Z · Formulas & symbols —
    { cls: "Z", code: "Z140", name: "Colour symbolism — black from the north, white from the south", conf: "high", passages: [4, 6],
      gloss: "Black against white, north against south, and drawn swords against none. North is the direction of the giants and of Hel in Norse cosmology. South was the direction of Rome, and of the white-robed newly baptised. The colours are read in the tale itself (the <em>better dísir</em> are the white). <strong>Compare Pwyll</strong>, where the otherworld hounds are white with red ears. Insular and Norse otherworld colour-grammars do not agree." },
    { cls: "Z", code: "Z71.6", name: "Formulistic number: nine", conf: "med", passages: [4],
      gloss: "Nine riders in each company. Nine is the Norse sacred number as three is the Irish: nine worlds, nine nights on the tree for Óðinn, and the great sacrifice at Uppsala every nine years with nine of every kind, according to Adam of Bremen." },
    { cls: "Z", code: "Z71.1", name: "Formulistic number: three", conf: "high", passages: [4],
      gloss: "Three knocks, and only after the third does anyone move. <strong>Compare Echtra Nerai</strong>: the withy springs off three times, there are three houses, and the calf bellows three times. Both tales count to three before the uncanny breaks through." },
  ],
};
