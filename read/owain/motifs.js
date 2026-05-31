/* The motif index — Owain, neu Iarlles y Ffynnon classified against the
   folklorists' "Dewey decimal": the Thompson Motif-Index (letter-classed
   call-numbers) and the Aarne-Thompson-Uther (ATU) tale-type index.

   SKELETON IN PROGRESS. A seed set of the tale's signature motifs — the
   storm-making fountain, the grateful lion, the ring of invisibility, the
   monstrous herdsman, the loathly-to-fair Otherworld threshold — is laid in
   so the motif grid, the cross-references, and the mythograph render from the
   start; the full index grows as the translation reaches the movements that
   realise each motif, and cross-references into Pwyll, Culhwch, Gawain and
   Orfeo are added as they are confirmed.

   Honesty: exact call-numbers are best-effort identifications, not the
   authoritative index. Each motif carries a confidence flag:
     high = well-attested code & application   med = code right, application interpretive
     spec = the number itself is a guess.
   Attaches to window.OWAIN. */
window.OWAIN = window.OWAIN || {};
window.OWAIN.motifs = {
  intro: "Folklorists have their own Dewey decimal: the <strong>Thompson Motif-Index</strong> files every recurring story-atom under a letter-class and number (A mythological, B animals, D magic, F marvels, H tests, K deceptions, M ordaining the future, N chance &amp; fate, Q reward &amp; punishment, T love, Z formulas), while the <strong>ATU index</strong> classifies whole tale-types. <em>Owain</em> sits where two currents meet: the international romance of the <strong>storm-making fountain</strong> and the <strong>grateful lion</strong> (shared with Chrétien's <em>Yvain</em> and, behind both, a deeper Insular and Classical stock), and the native Brittonic Otherworld — the monstrous one-eyed herdsman, the ring of invisibility, the spring whose guardian must be killed to be replaced. Below, a seed set of the signature motifs, with cross-references to the sister tales where the same call-number lands; <em>the index grows movement by movement.</em>",
  taletypes: [
    { code: "Chrétien parallel", name: "Yvain, le Chevalier au Lion (ATU-adjacent romance complex)", conf: "high",
      gloss: "<em>Owain</em> and Chrétien de Troyes' <em>Yvain</em> (c. 1177–81) share the whole armature: the magic storm-fountain and its defender, the won widow, the broken term and the madness, the grateful lion, the imprisoned maid rescued at the last hour. Whether the Welsh tale derives from Chrétien, Chrétien from a Welsh/Breton source, or both from a lost common <em>conte</em>, is the central unresolved question of Arthurian transmission — and the reason this tale anchors the Welsh↔Continental branch of the Pendragon evolutionary tree. No single clean ATU number covers the complex; it is a romance assembled from several tale-type stocks." },
    { code: "ATU 156", name: "The grateful lion (thorn / serpent removed)", conf: "high",
      gloss: "The grateful-animal type behind the lion episode: a hero frees a beast from a tormentor (here a serpent gripping the lion's tail), and the beast becomes his faithful companion. Descends ultimately from the Androcles-and-the-lion stock (Aulus Gellius, 2nd c.). Owain's lion is the type's most famous medieval realisation — the helper bound by gratitude, not magic. <em>To be tied to its movement.</em>" },
  ],
  classOrder: ["B", "D", "F", "H", "N", "T", "Z"],
  classes: { B: "Animals", D: "Magic", F: "Marvels &amp; the Otherworld", H: "Tests &amp; tasks", N: "Chance &amp; fate", T: "Love &amp; marriage", Z: "Formulas &amp; symbols" },
  list: [
    // — B · Animals —
    { cls: "B", code: "B301", name: "Faithful animal / the grateful lion", conf: "high", passages: [],
      gloss: "The grateful lion Owain saves from a serpent, which thereafter follows him \"like a greyhound he had reared,\" hunts for him, guards his sleep, and fights at his side. Loyalty made visible — and the measure, by contrast, of the broken faith that drove Owain mad. Gives the Continental twin its title (<em>le Chevalier au Lion</em>) and this site its sigil. (No animal-helper of this grateful-beast kind in the Welsh sister-tales; cf. instead the Oldest Animals as <em>guides</em> in Culhwch — a different B-class function.) <em>Pending its movement.</em>" },
    { cls: "B", code: "B871.1", name: "Giant serpent as adversary", conf: "med", passages: [],
      gloss: "The serpent gripping the lion's tail — the adversary Owain cuts away to earn the lion's faith. <em>Pending its movement.</em>" },

    // — D · Magic —
    { cls: "D", code: "D1361.17", name: "Ring of invisibility", conf: "high", passages: [4],
      gloss: "Luned's ring: turn the stone into the palm and close the hand, and the wearer cannot be seen. It carries the trapped Owain out from between the castle gates, past the household come to kill him, and lets him watch the funeral — and the Countess — unseen (Mvt IV). The classic magic-ring of romance; compare the broader D1361 magic-mist/concealment family in Insular tradition. The Welsh plays on <em>kudyaw</em>, to hide: \"as long as you hide it, it will hide you.\"" },
    { cls: "D", code: "D2143.1", name: "Storm produced by magic (the fountain rite)", conf: "high", passages: [2, 3, 6],
      gloss: "The romance's engine: pour a bowlful of the fountain's water on the great slab beside it, and a tempest of thunder, hail and lightning breaks over the wood, stripping every leaf — after which the Black Knight rides to answer. A weather-making rite tied to a place, straight from the Brittonic Otherworld stock; Chrétien's Barenton fountain in Brocéliande is its Continental cousin. First raised in Cynon's tale (Mvt II); Owain repeats the rite in Mvt III." },

    { cls: "D", code: "D1244", name: "Magic ointment / healing balsam", conf: "high", passages: [7],
      gloss: "The widowed Countess of the park's precious balsam, poured over the mad Owain's heart (and, by the kind maid's disobedience, over all of him), which raises him from his wasted state and heals him in three months \"fairer than before.\" The tale's instrument of grace \u2014 medicinal, not fairy; sevenscore pounds' worth, spent on a stranger. Contrast Sir Orfeo, recovered out of the Otherworld itself rather than by a salve." },

    // — F · Marvels & the Otherworld —
    { cls: "F", code: "F460", name: "The monstrous keeper of beasts", conf: "high", passages: [2, 3, 6],
      gloss: "The huge black man on the forest mound — one-eyed, one-footed, iron-clubbed — lord of the wild animals, who gather and bow at his call, and who directs the questing knight to the fountain. A threshold-guardian out of the older Insular Otherworld; the wild-herdsman type. Compare the giant Ysbaddaden's gatekeepers and the keepers of the marvels in Culhwch. Realised first in Cynon's tale (Mvt II), then again when Owain rides the same road in Mvt III — \"his size pleased Owain\" where it had only awed Cynon." },
    { cls: "F", code: "F718", name: "The marvellous fountain / spring of the Otherworld", conf: "high", passages: [2, 3, 5, 6],
      gloss: "The spring beneath the great tree, with its silver bowl on a slab — the bounded Otherworld threshold the whole tale orbits. The guardian who must be killed to be succeeded marks it as a place where office passes by combat, not inheritance — borne out in Mvt III, where Owain kills the defender and (the tale will show) takes both his widow and his post. First seen in Cynon's tale (Mvt II)." },

    { cls: "F", code: "F567", name: "The wild man of the woods (madness in the wilderness)", conf: "med", passages: [7],
      gloss: "His word broken and his ring stripped, Owain runs mad and naked into the wastes \u2014 clothes rotting, body wasting, long hair growing over him \u2014 until he lives among the deer and even they leave him behind. The native Brittonic <em>gwyllt</em>, the wild man whose reason is lost to grief and guilt and recovered only in the wilderness: the type behind Myrddin Wyllt (Merlin) and the Irish Suibhne. The Welsh romance's distinctive deepening of the international Yvain-madness, which in Chr\u00e9tien is briefer and less mythic." },

    // — T · Love & marriage —
    { cls: "T", code: "T15", name: "Love at first sight", conf: "high", passages: [4],
      gloss: "Owain falls in love with the Countess at the sight of her in her husband's funeral procession — grief he himself caused. \"When he saw the woman, love of her kindled in him until it filled every part of him.\" The Welsh ties love and killing in a single stroke (\"the wife of the man you killed yesterday\"), the knot Luned will untie. The romance commonplace, here at its starkest; the same hinge drives Chrétien's <em>Yvain</em>." },
    { cls: "T", code: "T231", name: "The widow wed to her husband's slayer", conf: "high", passages: [4, 5],
      gloss: "The Countess will be argued into marrying the very man who killed her husband — not from fickleness (the medieval misogynist reading) but from necessity: the fountain must have a defender, and the strongest defender available is the man who beat the last one. The tale frames it as Luned's cold logic of survival, not the lady's weakness. <em>Realised across Mvt IV–V.</em>" },

    // — Z · Formulas & symbols —
    { cls: "Z", code: "Z71.1", name: "Formulaic three (three days, three blows)", conf: "med", passages: [5, 6],
      gloss: "The romance's threefold rhythms (the repeated journeys to the fountain; the staged combats; the days of the marriage-term). Compare the pervasive Z71.1 across all four sister tales — the folktale's basic counting unit. <em>To be tied to specific movements.</em>" },
  ],
};
