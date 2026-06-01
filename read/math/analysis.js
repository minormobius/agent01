/* Story graph — Math uab Mathonwy mapped onto Vladimir Propp's "Morphology
   of the Folktale" (1928): the 31 narrative functions of the wonder-tale.

   COMPLETE. The whole branch laid against Propp's spine across six acts. Math
   is the corpus's outlier: it keeps the spine's pieces but redistributes them
   — Villainy multiplied across four villains, Punishment run twice, the hero
   split between a passive protagonist (Lleu) and the trickster who is villain
   and redeemer at once (Gwydion), and the Wedding reached mid-tale and undone.
   The `absent` section reads those redistributions. Loaded after tale.js;
   attaches to window.MATH. */
window.MATH = window.MATH || {};
window.MATH.propp = {
  intro: "Propp's <strong>31 functions</strong> laid against the Fourth Branch. <em>Math</em> is the most magic-driven and least quest-driven of the Branches: its engine is not a journey but a chain of <strong>Trickery</strong> (η) and <strong>Villainy</strong> (A), and its one magical agent is a single object — the <strong>wand</strong> (<em>hudlath</em>), which transforms, punishes and restores. It runs Propp's pieces, but redistributes them: four villainies from four villains, two full punishment-cycles, a hero who is acted upon for four movements, and a wedding that is a trap rather than a resolution. Below, the movements laid against the spine; the comparative payoff against the sister tales is read in the <a href=\"/mabinogi/\">Mabinogi</a> and <a href=\"/pendragon/\">Pendragon</a> crosswalks.",
  acts: [
    { id: "swine",   label: "The swine-war; Pryderi's death",      color: "#c9a24a" },
    { id: "outrage", label: "The outrage; the beast-punishment",   color: "#6f9ac9" },
    { id: "births",  label: "The foot-holder test; the births",    color: "#8aa363" },
    { id: "curses",  label: "Aranrhod's three curses",             color: "#b07a4b" },
    { id: "flowers", label: "Blodeuwedd; the betrayal",            color: "#9a6f9a" },
    { id: "eagle",   label: "The eagle; the finding; the reckoning", color: "#c97f9a" },
  ],
  moves: [
    // ── Act 1: the swine-war ─────────────────────────────────
    { act: "swine", sym: "α", node: "Situation", name: "Initial situation", passage: 1,
      gloss: "The court and the magical order are set out.",
      realized: "Math, magician-king of Gwynedd, can live only with his feet in a virgin's lap save in war, and hears every whisper the wind carries; his nephews Gwydion and Gilfaethwy ride the land for him." },
    { act: "swine", sym: "a", node: "Lack (love)", name: "Lack — a forbidden desire", passage: 1,
      gloss: "A want opens the tale.",
      realized: "Gilfaethwy wastes away with secret love for the foot-holder Goewin — the desire the whole branch is set in motion to serve." },
    { act: "swine", sym: "η", node: "Trickery", name: "Trickery — the swine-fraud", passage: 1,
      gloss: "The villain deceives to get what he wants.",
      realized: "Gwydion, disguised as a bard, defrauds Pryderi of the Otherworld swine with horses and shields conjured from fungus — manufacturing a war to draw Math from his court." },
    { act: "swine", sym: "A", node: "Villainy", name: "Villainy — the war and Pryderi's death", passage: 1,
      gloss: "The villain causes harm and a death.",
      realized: "The engineered war kills men of both sides and, in single combat \"by strength and magic,\" Pryderi himself — ending the thread that ran through all four Branches." },

    // ── Act 2: the outrage ───────────────────────────────────
    { act: "outrage", sym: "A", node: "The rape", name: "Villainy — the wrong to Goewin", passage: 2,
      gloss: "A second villainy, by a second villain.",
      realized: "With Math drawn off to the war, Gilfaethwy forces Goewin in the king's own bed — the outrage the whole movement answers." },
    { act: "outrage", sym: "K", node: "Amends", name: "Liquidation — amends to the victim", passage: 2,
      gloss: "The harm to the victim is repaired.",
      realized: "Math makes amends to Goewin first of all: he weds her and gives her authority over his realm, raising the wronged foot-holder to queen." },
    { act: "outrage", sym: "U", node: "Punishment", name: "Punishment of the villains (1)", passage: 2,
      gloss: "The villains are punished — in the middle, not the end.",
      realized: "Math turns the brothers into paired beasts (hind/stag, boar/sow, wolf/she-wolf) for three years, the sexes swapped each year so each in turn bears the other's young." },

    // ── Act 3: the births ────────────────────────────────────
    { act: "births", sym: "D", node: "Test", name: "Test — the foot-holder ordeal", passage: 3,
      gloss: "A test reveals a hidden truth.",
      realized: "Aranrhod, proposed as the new foot-holder, is set Math's wand virginity-test: step over the bent wand." },
    { act: "births", sym: "✶", node: "Births", name: "Marvellous birth", passage: 3,
      gloss: "An uncanny, instantaneous birth.",
      realized: "She fails, dropping a sea-bound boy (Dylan) and a formless thing Gwydion snatches and hides in a chest — the half-born child who will become Lleu." },

    // ── Act 4: the curses ────────────────────────────────────
    { act: "curses", sym: "a", node: "Lack (curses)", name: "Lack — the three destiny-curses", passage: 4,
      gloss: "The hero is denied the things that make a man.",
      realized: "Aranrhod lays three tynged on her son: he shall have no name, no arms, and no wife of any race on earth — unless from her." },
    { act: "curses", sym: "η", node: "Trickery", name: "Trickery — the curses broken", passage: 4,
      gloss: "Deceit liquidates the lack.",
      realized: "Gwydion breaks the first two: the shoemaker ruse and the wren-shot win the name Lleu Llaw Gyffes; the illusory besieging fleet frightens Aranrhod into arming him herself." },

    // ── Act 5: the flower-wife ───────────────────────────────
    { act: "flowers", sym: "F", node: "Made agent", name: "The made magical agent — Blodeuwedd", passage: 5,
      gloss: "Where a bride would be won, here one is made.",
      realized: "To beat the third curse, Math and Gwydion conjure a wife of no earthly race at all — Blodeuwedd, made from the flowers of oak, broom and meadowsweet." },
    { act: "flowers", sym: "W", node: "Wedding", name: "Wedding — mid-tale, and a trap", passage: 5,
      gloss: "Propp's terminal Wedding, reached early and poisoned.",
      realized: "Lleu weds Blodeuwedd and is given the cantref of Dinoding, with a court at Mur Castell — the calm before the betrayal." },
    { act: "flowers", sym: "A", node: "The murder", name: "Villainy — the betrayal and the spear", passage: 5,
      gloss: "A fourth villainy, by the made wife and her lover.",
      realized: "Blodeuwedd loves Gronw on sight, coaxes from Lleu the neither-nor secret of his death, and stages the spear-cast — but Lleu escapes as an eagle and is gone." },

    // ── Act 6: the eagle and the reckoning ───────────────────
    { act: "eagle", sym: "↑", node: "Quest", name: "Departure and guidance — the search", passage: 6,
      gloss: "The seeker sets out, and is led.",
      realized: "Gwydion will not rest until he finds his nephew; he wanders Gwynedd and Powys, and the bondman's strange sow leads him to the rotting eagle in the oak." },
    { act: "eagle", sym: "K", node: "Restoration", name: "Liquidation — the finding and the cure", passage: 6,
      gloss: "The greatest harm is undone.",
      realized: "Three englynion call the eagle down branch by branch into Gwydion's lap; the wand restores Lleu to a man, healed over a year at Caer Dathyl." },
    { act: "eagle", sym: "U", node: "Reckoning", name: "Punishment of the villains (2)", passage: 6,
      gloss: "The second punishment-cycle; justice exact.",
      realized: "Blodeuwedd is turned to an owl, shunned by all birds; Gronw is killed by the exact return-blow, the spear piercing the very stone he hides behind." },
    { act: "eagle", sym: "T", node: "Lordship", name: "Transfiguration and restoration", passage: 6,
      gloss: "The hero is restored — but no wedding closes the tale.",
      realized: "Lleu, eagle made man again, takes back Gwynedd and is its lord ever after; the line of Dôn rises as the line of Pwyll closes. The made wife is unmade; there is no closing union." },
  ],
  absent: {
    note: "Math keeps every piece of Propp's spine, but it is the corpus's great redistributor: it multiplies the functions that wonder-tales keep single, and splits the one role they keep whole.",
    groups: [
      { syms: "A × 4", label: "Villainy, four times over, four villains",
        text: "The wonder-tale has one villain and one villainy; Math has at least four — Gwydion's fraud-and-war, Gilfaethwy's rape, Aranrhod's curses, and Blodeuwedd-and-Gronw's murder. The villain-role is passed from hand to hand, and the worst offender of the first movement, Gwydion, becomes the hero of the last. No other tale on the site distributes its villainy so widely." },
      { syms: "U × 2", label: "Two full punishment-cycles",
        text: "Propp's Punishment is terminal; Math runs it twice, and both are central to its meaning: the beast-punishment of the brothers in the very middle (Act 2), and the owl-and-return-blow reckoning at the end (Act 6). The branch is as much about fitting a punishment exactly to a crime as it is about any quest." },
      { syms: "— ", label: "No single hero; the passive protagonist",
        text: "Lleu, the nominal hero, is acted upon for four movements — named, armed, wived, killed and restored, all by others — and acts for himself only at the very end, claiming the return-blow. The agency belongs to Gwydion, villain and redeemer in one. The lone questing hero of the genre is split in two: the one who does, and the one things are done to." },
      { syms: "W", label: "The Wedding reached early, and undone",
        text: "Math arrives at a Wedding mid-tale — Lleu and Blodeuwedd — but the bride is conjured, not won, and the marriage is a villainy-vector, not a resolution. The branch ends with the wife unmade into an owl and the hero ruling alone; the genre's closing union is turned inside out (compare Gawain, who declines a wedding, and Branwen, which destroys one)." },
    ],
    verdict: "Math is the least heroic-questing and most magic-driven of the Branches: villainy multiplied, punishment doubled, the hero split, the wedding poisoned. Where the wonder-tale gives the closing work to a marriage, Math gives it to justice — fitted, doubled and exact — and to a single instrument, the wand, that does the transforming, the punishing and the mending alike.",
  },
};
