/* The motif index — Sir Gawain and the Green Knight classified against the
   folklorists' "Dewey decimal": the Thompson Motif-Index (letter-classed
   call-numbers) and the Aarne-Thompson-Uther (ATU) tale-type index.

   Gawain sits uneasily in ATU — it is a literary chivalric romance that
   weaves at least three independent folk-clusters together (the Beheading
   Game, the Exchange of Winnings, and the Chastity Test of the host's wife)
   — so the motif-level analysis is where the call-numbers really speak.
   This doubles as the second layer of the synergistic graph: each motif is
   a typed node, and its `passages` array is its set of EXHIBITS edges
   (motif -> Fitt) in the shared annotation shape.

   Honesty: exact call-numbers are best-effort identifications, not the
   authoritative index. Each motif carries a confidence flag:
     high = well-attested code & application   med = code right, application interpretive
     spec = the number itself is a guess (shown by class letter where omitted).
   Attaches to window.GAWAIN. */
window.GAWAIN = window.GAWAIN || {};
window.GAWAIN.motifs = {
  intro: "Folklorists have their own Dewey decimal: the <strong>Thompson Motif-Index</strong> files every recurring story-atom under a letter-class and number (A mythological, D magic, F marvels, H tests, K deceptions, M ordaining the future, N chance & fate, Q reward & punishment, T love, Z formulas), while the <strong>ATU index</strong> classifies whole tale-types. Run Gawain through both and the poem's seams open. The Pearl-Poet did not invent his story; he fused at least three pre-existing folk-clusters — the Beheading Bargain out of the Irish <em>Bricriu's Feast</em>, the Exchange of Winnings from a thin Old French tradition, and the Chastity Test of the host's wife with antecedents as old as Joseph and Potiphar — and laid them over a chivalric frame. The motifs that follow are best-effort identifications; codes guessed by class letter where the number is uncertain, every claim flagged for confidence.",
  taletypes: [
    { code: "Beheading Bargain", name: "The Beheading Game — motif M221, no clean ATU type", conf: "high",
      gloss: "A challenger offers his head to be cut off in exchange for the same right back, a year and a day later. The pattern is Old Irish: Cú Roí mac Dáire visits the Ulstermen in the wonder-tale <em>Fled Bricrenn</em> (\"Bricriu's Feast,\" 8th–9th c.) and offers the bargain to the heroes; Cú Chulainn alone takes it. The Continental tradition (La Mule sans Frein, Le Chevalier à l'Épée, Hunbaut) keeps the bargain but secularises it. The Pearl-Poet inherits this whole cluster; no canonical ATU type covers it, but Stith Thompson's motif <strong>M221</strong> is the precise call-number." },
    { code: "Exchange of Winnings", name: "Each man gives the other whatever he gains by day", conf: "med",
      gloss: "Two men agree to swap whatever each gets during a fixed period — a vehicle for testing the guest's honesty without him knowing he is tested. Rare in catalogues; folklorists generally identify it as a French romance import (closest known analogue: a short Irish exemplum cited by Loomis). The Pearl-Poet's particular move is to braid it together with the Beheading Game — three days of bedroom-test enclosed by the year-and-a-day of the chapel-test — so the smaller game pre-judges the larger one." },
    { code: "Chastity test", name: "The wife tempts the guest while the lord is away", conf: "high",
      gloss: "A woman, often the host's wife at the host's direction, attempts the hero's chastity in the absence of her husband. The pattern is biblically old (Joseph and Potiphar's wife — motif <strong>K2111</strong>) and runs all through medieval romance; in Welsh tradition the closest analogue is Pwyll and Arawn's wife in the First Branch of the <em>Mabinogi</em>. The Pearl-Poet's invention is to fold this into the exchange-of-winnings frame: the lady's kisses become the very currency Gawain must hand back to the lord at evening." },
  ],
  classOrder: ["A", "D", "F", "H", "K", "M", "N", "Q", "T", "Z"],
  classes: { A: "Mythological", D: "Magic", F: "Marvels", H: "Tests & tasks", K: "Deceptions", M: "Ordaining the future", N: "Chance & fate", Q: "Reward & punishment", T: "Love & marriage", Z: "Formulas & symbols" },
  list: [
    // — A · Mythological —
    { cls: "A", code: "A1654", name: "Origin of a badge / livery", conf: "med", passages: [4],
      gloss: "The court adopts the green sash and \"ever-more after he was honoured that hade hit\" — an aetiological closing that grounds a real (or notional) heraldic sign in this tale. (The Order of the Garter's <em>Honi soit qui mal y pense</em> appears as a scribal closing colophon in the unique manuscript.)" },
    { cls: "A", code: "A186", name: "Demoted divinity walking in human shape", conf: "spec", passages: [4],
      gloss: "Bertilak names Morgan \"Morgne the goddess\" at the reveal — and the Green Knight, with his colour, his holly bough, and his green horse, looks unmistakeably like a vegetation god come into a Christmas hall. Both stand at the very far edge of what a Christian poet would let a god be, in 1380." },

    // — D · Magic —
    { cls: "D", code: "D1052", name: "Magic girdle", conf: "high", passages: [3, 4],
      gloss: "The lady's green silk lace, said to keep its wearer from any death — the wonder-object that drives the third-day failure and the fourth-day reveal." },
    { cls: "D", code: "D1361.17", name: "Magic belt of invulnerability", conf: "high", passages: [3, 4],
      gloss: "The girdle's specific claim: \"he that hade hit\" cannot be slain. Gawain takes it on this promise — and the poem refuses to say whether the promise was true." },
    { cls: "D", code: "D810", name: "Magic gift from a supernatural being", conf: "high", passages: [3],
      gloss: "Bertilak names his wife as Morgan's agent at the reveal; the girdle comes by that channel from the goddess-aunt. A gift from the very enchantment that set the test." },
    { cls: "D", code: "D1380.0.2", name: "Magic sign on shield", conf: "high", passages: [2],
      gloss: "The pentangle painted on Gawain's shield — the \"endeles knot\" the poet calls it in English — five points each five times tying into one. Gawain's five fives: five wits, five fingers, the five wounds of Christ, the five joys of Mary, and the five virtues of fellowship, frankness, purity, courtesy, and pity." },
    { cls: "D", code: "D1711.5", name: "Female magician", conf: "high", passages: [4],
      gloss: "\"The mistress of Merlin, many a man has she taken\" — Bertilak's account of Morgan le Fay. Pupil-lover of Merlin in the wider tradition, the source of the whole enchantment." },
    { cls: "D", code: "D965", name: "Magic plants", conf: "med", passages: [1],
      gloss: "The holly bough the Green Knight carries in the other hand from the axe — a winter-evergreen, sign of life in dead season, in the poem's Christmas frame an explicit emblem of survival." },
    { cls: "D", code: "D1080", name: "Magic weapon", conf: "med", passages: [1, 4],
      gloss: "The Green Knight's axe — four foot long, gold-bound, set down in Camelot and taken up again at the chapel — carries the enchantment between the two halves of the bargain." },

    // — F · Marvels —
    { cls: "F", code: "F567", name: "Wild Man / Green Man", conf: "high", passages: [1, 4],
      gloss: "The Green Knight in the round: green skin, green hair, green beard, green clothes, green horse, green axe. The Wild Man / Green Man of folk-tradition burst into Camelot at the Christmas season — a vegetation power on his own legs, half-domesticated for a feast-game." },
    { cls: "F", code: "F511.0.4", name: "Headless man still living", conf: "high", passages: [1],
      gloss: "After Gawain's stroke the Green Knight rises, takes up his own head, mounts, and rides out. The folklore type kept perfectly intact under the chivalric surface." },
    { cls: "F", code: "F624", name: "Mighty lifter / catches his own head", conf: "high", passages: [1],
      gloss: "The decapitated giant retrieves his head from the floor and bears it up — a strength-marvel particular to this type, repeated in Bricriu's Feast and the analogous French texts." },
    { cls: "F", code: "F407", name: "The talking severed head", conf: "high", passages: [1],
      gloss: "The Green Knight's head, held in his hand from horseback, turns its eyes on Camelot and speaks the rules of the return-match. The motif behind every prophetic-head story from Bran the Blessed onward." },
    { cls: "F", code: "F156", name: "Door to the Otherworld in a mound", conf: "high", passages: [4],
      gloss: "The Green Chapel turns out to be a hollow grass-grown barrow with a hole at each end, beside a boiling brook — no chapel at all. The classic Celtic Otherworld-entry, slipped into the poem under a Christian name." },
    { cls: "F", code: "F151.1", name: "Perilous road to the Otherworld", conf: "high", passages: [2, 4],
      gloss: "Gawain's ride: the Wirral, wolves and serpents and wodwos, ice in his armour by night, the Christmas Eve prayer that summons the castle from the wood, and the New Year's path that ends at a barrow." },
    { cls: "F", code: "F771.6", name: "Castle appearing in the wilderness", conf: "high", passages: [2],
      gloss: "Bertilak's castle materialises in the trees in answer to Gawain's prayer to Mary on Christmas Eve — \"a castle full comely, gleamed and shone\" — an enchanted hold the size of a fortress, which Gawain will leave behind two weeks later with no clear memory of its location." },
    { cls: "F", code: "F571", name: "Extremely old person", conf: "high", passages: [2, 3, 4],
      gloss: "\"The auncian lady\" beside the young wife — withered, yellow-cheeked, kerchiefed to the chin, honoured above all the household. Morgan le Fay in age-disguise. The poem stages her as the doublet to her beautiful companion: light and dark, youth and age, decoy and engine." },
    { cls: "F", code: "F569", name: "Persons of unusual hue", conf: "high", passages: [1, 4],
      gloss: "The Pearl-Poet writes a green man with green hair on a green horse and never explains it. The colour itself is the marvel." },

    // — H · Tests & tasks —
    { cls: "H", code: "H1556", name: "Tests of fidelity", conf: "high", passages: [3],
      gloss: "The exchange of winnings — three days of paralleled hunts and bedroom encounters, a test of whether the guest will return honestly all that he has been given. Gawain passes twice and fails once, for the smallest of the three currencies." },
    { cls: "H", code: "H1554", name: "Test of curiosity & temptation", conf: "high", passages: [3],
      gloss: "The lady's three mornings at his bedside — testing not Gawain's curiosity but his courtesy under approach. The chivalric variant of the older type." },
    { cls: "H", code: "H1561", name: "Test of valour: holding still under the blow", conf: "high", passages: [4],
      gloss: "At the Green Chapel the test is not to strike but to stand. The third blow nicks; the first two were testing whether the heart could keep the body in place." },

    // — K · Deceptions —
    { cls: "K", code: "K1810", name: "Deception by disguise", conf: "high", passages: [2, 3, 4],
      gloss: "Three masks layered: Bertilak is the Green Knight; the ancient lady is Morgan; the lady is acting at the host's direction. The poem keeps the audience inside Gawain's ignorance for two whole Fitts." },
    { cls: "K", code: "K2111", name: "Potiphar's wife", conf: "high", passages: [3],
      gloss: "Wife of the host attempts the guest; the cleanest motif-label for the lady's three approaches. Gawain refuses by the politest possible means each time — and is required, by his own oath, to give the kisses to Bertilak at evening." },
    { cls: "K", code: "K1700", name: "Bluffing the hero", conf: "high", passages: [1, 4],
      gloss: "The Green Knight's whole challenge is a bluff: he can survive what he proposes; Camelot cannot win the game as offered. The chapel sequence repeats the bluff — two feints before the nick." },
    { cls: "K", code: "K1851", name: "Substitute capable: hero takes the king's place", conf: "med", passages: [1],
      gloss: "Arthur rises to take the axe; Gawain rises faster, asks for the game in the king's stead, and names himself the weakest at the table — the loss of him least mattering." },
    { cls: "K", code: "K500", name: "Death evaded by a trick", conf: "med", passages: [3, 4],
      gloss: "Gawain's hopeful reading of the green girdle in Fitt III: a small concealment, no harm done, his life secured. The reveal in Fitt IV calls the same trick by its other names: cowardice and covetousness." },

    // — M · Ordaining the future —
    { cls: "M", code: "M221", name: "The Beheading bargain", conf: "high", passages: [1, 4],
      gloss: "The poem's primary engine. Two strokes, one given and one promised, a year and a day apart. Inherited from <em>Fled Bricrenn</em> via French intermediaries; preserved here in its full original shape — speaking head and all." },
    { cls: "M", code: "M223", name: "The rash promise / blank check", conf: "high", passages: [1, 3],
      gloss: "Fired twice. First in Camelot, when whichever knight takes up the axe binds himself to terms he has not yet fully heard. Then at the castle, when Gawain and Bertilak swear the exchange-of-winnings before either knows what the other will be obliged to give." },
    { cls: "M", code: "M201", name: "Pledge given", conf: "high", passages: [1, 3],
      gloss: "The form is everything. Gawain's troth on the axe-haft; his trawthe (his honour) on the exchange. The poem watches him keep two of three exchanges in form, and lose the third in fact." },
    { cls: "M", code: "M205", name: "Breaking a pledge / hidden default", conf: "high", passages: [3, 4],
      gloss: "The girdle held back at the third evening — a default tiny in size, total in kind. The poem stages it as the precise opposite of breaking the pledge openly: Gawain keeps the form of the bargain (kisses given) while breaking its substance (a withheld piece of silk)." },
    { cls: "M", code: "M242", name: "Bargain dated to a fixed future hour", conf: "high", passages: [1, 2, 4],
      gloss: "A year and a day; New Year's morning at the Green Chapel. The poem keeps the calendar pressing throughout — the seasons stanza in Fitt II is built for exactly this." },

    // — N · Chance & fate —
    { cls: "N", code: "N825.3", name: "Old woman as helper / hidden engine", conf: "high", passages: [2, 3, 4],
      gloss: "Morgan le Fay in age-disguise, beside the lady, honoured at table without ever being recognised. The folktale's old woman with the answer — but here her \"help\" is the test itself." },
    { cls: "N", code: "N886", name: "Aunt revealed; kinship disclosed", conf: "high", passages: [4],
      gloss: "\"She is even thine aunt, Arthur's half-sister.\" The poem withholds Morgan's kinship to Gawain until the reveal — and then offers it as the reason he should come back to her hall." },
    { cls: "N", code: "N777", name: "Adventure follows the hunt", conf: "high", passages: [3],
      gloss: "Three days of hunts, each cross-cut with a bedroom encounter — the hunt outside structurally summoning, paralleling, and paying for the test inside." },

    // — Q · Reward & punishment —
    { cls: "Q", code: "Q581", name: "Punishment fitting the crime", conf: "high", passages: [4],
      gloss: "One nick for one concealment. \"At the third thou failedst — and therefore that tap take to thee.\" The third blow's measure is the exact measure of the third evening's lie." },
    { cls: "Q", code: "Q584.1", name: "Visible mark left for a sin", conf: "high", passages: [4],
      gloss: "The wound on the neck and the green sash bound under the left arm — Gawain leaves the Green Chapel marked twice: once in flesh, once in silk. Both are confessions in another shape." },
    { cls: "Q", code: "Q331", name: "Pride punished", conf: "med", passages: [4],
      gloss: "The pentangle-knight, the most faultless on foot, slips on the smallest possible count — and is shown that the very perfection he pledged to was the place exposure could find. The poem refuses to call this anything but proper." },

    // — T · Love & marriage —
    { cls: "T", code: "T331", name: "Chaste man tempted by woman, unsuccessful", conf: "high", passages: [3],
      gloss: "Gawain's three refusals, each turned into a courtesy. The poem never lets him be discourteous; the failure, when it comes, is not in this column." },
    { cls: "T", code: "T320", name: "Escape from undesired lover", conf: "high", passages: [3],
      gloss: "The chamber scenes are formally escapes — through politeness, through deflection, through the language of fellowship — but they are escapes. Gawain never wins the encounter; he survives it." },
    { cls: "T", code: "T337", name: "The chaste host (refusal of the bride)", conf: "med", passages: [4],
      gloss: "Bertilak invites Gawain back at the reveal — to accord with the lady \"who was your enemy keen.\" Gawain refuses by no means. The romance closes with no marriage, no return, and an explicit anti-marital catalogue (Adam, Solomon, Samson, David)." },

    // — Z · Formulas & symbols —
    { cls: "Z", code: "Z71.1", name: "Formulistic number: three", conf: "high", passages: [1, 3, 4],
      gloss: "Three blows, three days, three hunts, three temptations, three exchanges of winnings, three kisses on the third evening. The poem's arithmetic is everywhere triadic — and the triad's third member is always the one that breaks." },
    { cls: "Z", code: "Z356", name: "The unique exception: the endless knot", conf: "high", passages: [2],
      gloss: "\"And why the pentangle is proper to that prince noble, I am intent to tell you, though tarry it me shall...\" The pentangle's lines have no beginning and no end — five points, each twined into the next — and the poet names it in English the <em>endeles knot</em>. Five-times-five virtues. A symbol the poem proposes as the only candidate for the closure that the green sash, in the end, must replace." },
    { cls: "Z", name: "Colour symbolism: green", conf: "spec", passages: [1, 2, 3, 4],
      gloss: "The single most-worked symbol of the poem. Green is the knight's hue, the chapel's grass, the lady's silk girdle, the holly bough; finally the court's livery. Life and death, fertility and rot, the fey and the human. The poem refuses to fix it as a meaning and instead keeps showing it being given new ones." },
    { cls: "Z", name: "Colour symbolism: red and gold", conf: "spec", passages: [3],
      gloss: "On the third morning Gawain belts the green girdle over a \"royal red cloth\" with a gold-hemmed binding. The courtly luxury palette — Christmas red and gold — receives the green sash, and is in turn folded over by it. Costume coding the poem will not let you forget." },
    { cls: "Z", code: "Z65", name: "Catalogues: the seasons, the arming, the hunts", conf: "high", passages: [2, 3],
      gloss: "The poem loves the long catalogue: the year-and-a-day stanza in Fitt II that names every month from spring to harvest to winter; the piece-by-piece arming of Gawain; the breaking of the deer, the dressing of the boar. The folktale's delight in arithmetic, raised here to lyric." },
  ],
};
