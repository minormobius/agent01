/* The cast of Math uab Mathonwy — the third stratum of the annotation layer.
   Each entry carries its role, the movements it appears in (links into the
   reading), and typed relationships (which seed the character web).

   COMPLETE. The full cast of the six-movement branch — the magician-king and
   his trickster nephew, the children of Dôn, the court of Gwynedd, and the
   made, the cursed and the slain — with appearance arrays keyed to the
   movements each is active in, and typed relationships that seed the character
   web and the mythograph. Attaches to window.MATH. */
window.MATH = window.MATH || {};
window.MATH.characters = {
  intro: "<em>Math</em> is the branch of the <strong>children of Dôn</strong>, a family of magicians, and of transformation. At its centre stand two enchanters: old <strong>Math son of Mathonwy</strong>, the sacral king of Gwynedd whose feet must rest in a virgin's lap, and his nephew <strong>Gwydion</strong> — trickster, poet, shape-shifter, and the true engine of the tale. Around them turn <strong>Gilfaethwy</strong>, whose forbidden love for the foot-holder <strong>Goewin</strong> sets everything in motion; <strong>Aranrhod</strong>, who curses her own son three times over; <strong>Lleu Llaw Gyffes</strong>, the boy named, armed and wived against those curses, killed and restored; <strong>Blodeuwedd</strong>, the wife conjured from flowers who betrays him; her lover <strong>Gronw Pebr</strong>; and, in the first movement, <strong>Pryderi</strong> of Dyfed, whose death by Gwydion's magic closes the thread that has run through all four Branches.",
  roles: [
    { id: "principal", label: "Principals",                       color: "#c9a24a" },
    { id: "don",       label: "The children of Dôn",              color: "#6f9ac9" },
    { id: "gwynedd",   label: "The court of Gwynedd",             color: "#8aa363" },
    { id: "made",      label: "The made, the cursed, the slain",  color: "#9a6f9a" },
  ],
  cast: [
    // ── Principals ───────────────────────────────────────────
    { id: "math", name: "Math fab Mathonwy", role: "principal", appears: [1, 2, 3, 4, 5, 6],
      blurb: "The old magician-king of Gwynedd, bound by a sacral condition: save in war, his feet must rest in the lap of a virgin foot-holder, and he hears every whisper the wind carries. He is the greater magician of the branch — his wand reshapes the nephew who reshaped a kingdom — and its moral anchor: he makes amends to the wronged Goewin before he punishes, fits the brothers' sentence exactly to their crime, and joins Gwydion to make and (later) to right the flower-wife. The justice of the tale is largely his.",
      rel: [
        { to: "gwydion", label: "uncle; punisher; partner in magic" },
        { to: "gilfaethwy", label: "uncle; punisher" },
        { to: "goewin", label: "foot-holder, then wife" },
        { to: "pryderi", label: "at war with" },
        { to: "aranrhod", label: "tests as foot-holder" },
        { to: "blodeuwedd", label: "co-maker of" },
        { to: "lleu", label: "kin; co-restorer" },
      ] },
    { id: "gwydion", name: "Gwydion fab Dôn", role: "principal", appears: [1, 2, 3, 4, 5, 6],
      blurb: "The great trickster-magician and the best teller of tales in the world — the branch's true protagonist, for good and ill. To serve his brother's love he manufactures a war by fraud and kills Pryderi by magic; for that he is punished as a beast. Then he turns: he incubates the half-born Lleu in a chest, fosters him, tricks a name, arms and a wife out of Aranrhod's curses, and at the last sings his wounded nephew out of an oak and restores him. Villain of the first movement, redeemer of the last — and his poetry is real power.",
      rel: [
        { to: "gilfaethwy", label: "brother" },
        { to: "aranrhod", label: "brother" },
        { to: "math", label: "nephew; partner in magic" },
        { to: "lleu", label: "foster-father" },
        { to: "pryderi", label: "kills (by magic)" },
        { to: "blodeuwedd", label: "co-maker; unmaker" },
        { to: "gofannon", label: "brother" },
      ] },
    { id: "lleu", name: "Lleu Llaw Gyffes", role: "principal", appears: [3, 4, 5, 6],
      blurb: "Aranrhod's hidden second son, born formless and reared by Gwydion — the Welsh reflex of the pan-Celtic god Lugus (Irish Lugh). His whole early life is done to him: named by a trick (the wren-shot, \"the fair one of the skilful hand\"), armed by a trick (the phantom fleet), wived by enchantment (Blodeuwedd). Betrayed and struck by Gronw's spear, he escapes death as an eagle, is found and restored, and only then acts for himself — claiming the exact return-blow and taking back Gwynedd, its lord ever after.",
      rel: [
        { to: "gwydion", label: "foster-son of" },
        { to: "aranrhod", label: "son of" },
        { to: "blodeuwedd", label: "husband of" },
        { to: "gronw", label: "slain by, then slays" },
        { to: "dylan", label: "brother of" },
      ] },
    { id: "blodeuwedd", name: "Blodeuwedd", role: "principal", appears: [5, 6],
      blurb: "\"Flower-Face\" — the wife conjured by Math and Gwydion out of the blossoms of oak, broom and meadowsweet, to beat Aranrhod's curse that Lleu have no wife of any race on earth. Made for one man, owing no loyalty she was not given, she falls for Gronw on sight, coaxes from Lleu the secret of his death, and stages the murder. Gwydion's punishment is crueller than killing: he turns her into an owl, shunned by all birds, keeping her name as a curse. The tale's meditation that a thing made against nature carries its own undoing.",
      rel: [
        { to: "lleu", label: "made his wife; betrays" },
        { to: "gronw", label: "lover; fellow-plotter" },
        { to: "gwydion", label: "made and unmade by" },
        { to: "math", label: "made by" },
      ] },

    // ── The children of Dôn ──────────────────────────────────
    { id: "gilfaethwy", name: "Gilfaethwy fab Dôn", role: "don", appears: [1, 2],
      blurb: "Gwydion's brother, whose secret, wasting love for the foot-holder Goewin is the seed of the whole branch. While the manufactured war draws Math away, he forces Goewin in the king's own bed — the outrage the rest of the movement answers. Math punishes the brothers together: three years as paired wild beasts, the sexes swapped each year so each in turn bears the other's young.",
      rel: [
        { to: "gwydion", label: "brother" },
        { to: "goewin", label: "wrongs" },
        { to: "math", label: "nephew; punished by" },
      ] },
    { id: "aranrhod", name: "Aranrhod ferch Dôn", role: "don", appears: [3, 4],
      blurb: "Gwydion's sister, proposed as Math's new foot-holder — but the wand-test exposes her, and in stepping over it she drops two boys: Dylan, and the formless thing that becomes Lleu. Shamed, she turns on her own son with three destiny-curses — no name, no arms, no wife — each of which Gwydion breaks or means to. \"Silver-wheel,\" she survives in the star-name Caer Arianrhod; here she is the cold mother whose denial gives the branch its spine.",
      rel: [
        { to: "gwydion", label: "sister" },
        { to: "lleu", label: "mother of; curses" },
        { to: "dylan", label: "mother of" },
        { to: "math", label: "tested by, as foot-holder" },
      ] },
    { id: "gofannon", name: "Gofannon fab Dôn", role: "don", appears: [3],
      blurb: "A son of Dôn and the smith of the family — the Welsh cousin of the Irish smith-god Goibniu. He appears only to deal the blow that kills the sea-child Dylan, remembered in the Triads as one of the Three Ill-Fated Blows of Britain.",
      rel: [
        { to: "gwydion", label: "brother" },
        { to: "dylan", label: "kills" },
      ] },

    // ── The court of Gwynedd ─────────────────────────────────
    { id: "goewin", name: "Goewin ferch Pebin", role: "gwynedd", appears: [1, 2],
      blurb: "The fairest maiden of her time, Math's foot-holder — the virgin in whose lap the king's feet must rest. Forced by Gilfaethwy in Math's absence, she does not stay silent; she tells the king to his face. Math answers the wrong by making amends to her first of all: he weds her and gives her authority over his realm, raising the wronged foot-holder to queen.",
      rel: [
        { to: "math", label: "foot-holder, then wife of" },
        { to: "gilfaethwy", label: "wronged by" },
      ] },

    // ── The made, the cursed, the slain ──────────────────────
    { id: "pryderi", name: "Pryderi fab Pwyll", role: "made", appears: [1],
      blurb: "Son of Pwyll, lord of the one-and-twenty cantrefs of the South, and keeper of the Otherworld swine Arawn sent him — the figure who has run through all four Branches. Gwydion steals his swine by fraud to start a war, and kills him in single combat \"by strength and magic.\" His death, mourned by the men of the South and buried at Maen Tyfiawg, ends the cycle's great connecting thread.",
      rel: [
        { to: "gwydion", label: "defrauded and slain by" },
        { to: "math", label: "at war with" },
      ] },
    { id: "dylan", name: "Dylan Eil Ton", role: "made", appears: [3],
      blurb: "Aranrhod's first-dropped son — \"Dylan, son of the Wave.\" Baptised, he makes straight for the sea and takes its nature, swimming like a fish, no wave ever breaking beneath him: a sea-divinity in all but name. He is killed by a blow from his uncle Gofannon, one of the Three Ill-Fated Blows; the tale gives him a sentence and lets him go.",
      rel: [
        { to: "aranrhod", label: "son of" },
        { to: "lleu", label: "brother of" },
        { to: "gofannon", label: "killed by" },
      ] },
    { id: "gronw", name: "Gronw Pebr", role: "made", appears: [5, 6],
      blurb: "Lord of Penllyn, brought to Lleu's court by a stag-hunt and lodged there overnight by courtesy. He and Blodeuwedd love at first sight and plot Lleu's death; Gronw makes the year-long spear and casts it from behind Bryn Cyfergyr. He takes Lleu's land and wife — until the reckoning, when Lleu claims the exact return-blow, and the spear pierces the very stone Gronw hides behind. Llech Gronw still stands by the Cynfael.",
      rel: [
        { to: "blodeuwedd", label: "lover; fellow-plotter" },
        { to: "lleu", label: "slays, then slain by" },
      ] },
    { id: "beastsons", name: "Hyddwn, Hychdwn & Bleiddwn", role: "made", appears: [2],
      blurb: "The three sons born to Gwydion and Gilfaethwy in their three years as paired beasts — a fawn, a piglet and a wolf-cub, taken from them each year by Math, baptised, named for their shapes (\"little stag,\" \"little pig,\" \"little wolf\"), and reared at court. An embedded englyn fixes them in memory as \"the three sons of false Gilfaethwy.\"",
      rel: [
        { to: "gwydion", label: "borne by / sired by" },
        { to: "gilfaethwy", label: "borne by / sired by" },
        { to: "math", label: "fostered by" },
      ] },
  ],
};
