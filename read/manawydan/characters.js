/* The cast of Manawydan uab Llyr — the third stratum of the annotation layer.
   Each entry carries its role, the movements it appears in (links into the
   reading), and typed relationships (which seed the character web).

   COMPLETE. The full cast of the six-movement branch — the four who outlast
   the wasteland, the house of Dyfed and Britain behind them, and the enchanter
   whose generation-old grudge drives the whole tale — with appearance arrays
   keyed to the movements each is active in, and typed relationships that seed
   the character web and the mythograph. Attaches to window.MANAWYDAN. */
window.MANAWYDAN = window.MANAWYDAN || {};
window.MANAWYDAN.characters = {
  intro: "<em>Manawydan</em> is the most intimate of the Four Branches: a tale of <strong>four people</strong> in an empty land. At its centre is <strong>Manawydan son of Llŷr</strong> — brother of the dead giant-king Brân, rightful but un-aspiring king of Britain, and the corpus's great patient craftsman-strategist. With him are <strong>Rhiannon</strong>, the otherworldly queen of the First Branch, now his wife; her son <strong>Pryderi</strong>, lord of Dyfed, who gives him the land and the marriage; and Pryderi's wife <strong>Cigfa</strong>. Behind them stand the house of Dyfed and the high king <strong>Caswallon</strong>; before them, a single hidden antagonist — <strong>Llwyd son of Cil Coed</strong>, who lays the wasteland to avenge <strong>Gwawl son of Clud</strong>, humiliated a generation back in <em>Pwyll</em>. The whole branch is the long shadow of that First-Branch grudge, falling on Pwyll's son and his house.",
  roles: [
    { id: "principal", label: "The four",                       color: "#c9a24a" },
    { id: "dyfed",     label: "The house of Dyfed & Britain",   color: "#6f9ac9" },
    { id: "enchanter", label: "The enchanter & his quarrel",    color: "#9a6f9a" },
    { id: "craft",     label: "England: craftsmen & clergy",    color: "#b07a4b" },
  ],
  cast: [
    // ── The four ─────────────────────────────────────────────
    { id: "manawydan", name: "Manawydan", role: "principal", appears: [1, 2, 3, 4, 5, 6],
      blurb: "Son of Llŷr, brother of the dead giant-king Bendigeidfran, and rightful king of Britain — dispossessed by his cousin Caswallon, and content to be. One of the \"three un-aspiring chieftains\": a man with the best claim to a throne who never pressed it. The branch's hero, and a new kind of one — he wins not by the sword but by patience, craft, and an unbreakable bargain, lifting the whole enchantment with a mouse on a gallows and a refusal to be shamed.",
      rel: [
        { to: "rhiannon", label: "weds" },
        { to: "pryderi", label: "sworn comrade" },
        { to: "cigfa", label: "keeps faith with" },
        { to: "bendigeidfran", label: "brother (dead)" },
        { to: "caswallon", label: "cousin; cedes the crown" },
        { to: "llwyd", label: "out-bargains" },
      ] },
    { id: "rhiannon", name: "Rhiannon", role: "principal", appears: [1, 2, 3, 4, 6],
      blurb: "The otherworldly queen of the First Branch — she who rode the white horse no one could catch, chose Pwyll against her family, and bore the false murder-charge unbroken. Now Pwyll's widow and Pryderi's mother, given to Manawydan with the seven cantrefs. Her quick wit and her gift for talk win Manawydan's love across a table; her mother's instinct undoes her, when she walks into the caer after her son and is taken with him, hands fixed to the golden bowl.",
      rel: [
        { to: "manawydan", label: "weds" },
        { to: "pryderi", label: "mother of" },
        { to: "pwyll", label: "widow of" },
        { to: "llwyd", label: "enchanted by" },
        { to: "gwawl", label: "once promised to" },
      ] },
    { id: "pryderi", name: "Pryderi", role: "principal", appears: [1, 2, 3, 4, 6],
      blurb: "Son of Pwyll and Rhiannon, lord of Dyfed — the child whose birth, loss and recovery closed the First Branch. He gives Manawydan the land and his own mother, and the two become inseparable. But his impulsive, warrior's loyalty is his undoing: against Manawydan's express counsel he enters the strange caer to recover his dogs, grips the golden bowl, and is held fast and struck dumb — the hot courage that is a virtue in battle proving fatal in an enchanted land.",
      rel: [
        { to: "manawydan", label: "sworn comrade" },
        { to: "cigfa", label: "weds" },
        { to: "rhiannon", label: "son of" },
        { to: "pwyll", label: "son of" },
        { to: "llwyd", label: "target of revenge" },
      ] },
    { id: "cigfa", name: "Cigfa", role: "principal", appears: [1, 2, 4, 5, 6],
      blurb: "Daughter of Gwyn Gloyw, Pryderi's wife — the fourth of the company, and the one left alone with Manawydan when the caer takes the other two. Her grief and her fear are met by Manawydan's pledge of faith, the branch's moral heart. Later it is she who voices, first and most gently, the dignity-objection the enchanter will use three times over — that hanging a mouse is beneath a man of his rank.",
      rel: [
        { to: "pryderi", label: "weds" },
        { to: "manawydan", label: "protected by; counsels" },
        { to: "gwyngloyw", label: "daughter of" },
      ] },

    // ── The house of Dyfed & Britain ─────────────────────────
    { id: "caswallon", name: "Caswallon fab Beli", role: "dyfed", appears: [1],
      blurb: "Son of Beli, the high king who seized the crown of Britain while the seven buried Brân's head (told in Branwen) — the historical Cassivellaunus folded into mythic time. Manawydan's cousin, and the man in the seat that was his by right. Pryderi and Manawydan must render him homage; his shadow is the constant political reason Manawydan will not let a quarrel turn to bloodshed in England.",
      rel: [
        { to: "manawydan", label: "cousin; holds his crown" },
        { to: "pryderi", label: "overlord of" },
      ] },
    { id: "pwyll", name: "Pwyll Pen Annwn", role: "dyfed", appears: [6],
      blurb: "Lord of Dyfed and \"Head of Annwn,\" father of Pryderi, husband of Rhiannon — the hero of the First Branch, dead before this one opens. His one rash act is the hidden cause of everything here: at the court of Hyfaidd Hen he tricked Rhiannon's rejected suitor Gwawl into a magic bag and had him beaten, the game of Badger-in-the-Bag. The text itself judges it done \"rashly\" — and the bill comes due, a generation late, on his son.",
      rel: [
        { to: "pryderi", label: "father of" },
        { to: "rhiannon", label: "husband of" },
        { to: "gwawl", label: "humiliated (badger-in-the-bag)" },
      ] },
    { id: "bendigeidfran", name: "Bendigeidfran", role: "dyfed", appears: [1],
      blurb: "Brân the Blessed, the giant-king of the Second Branch, Manawydan's brother — present here only as the head buried at the White Hill, facing France, as the branch opens. Manawydan's grief for him, and his refusal to sit in any hall where another man holds Brân's place, is the dispossession the whole tale answers.",
      rel: [
        { to: "manawydan", label: "brother of" },
      ] },
    { id: "gwyngloyw", name: "Gwyn Gloyw", role: "dyfed", appears: [1],
      blurb: "Cigfa's father, named once to fix her lineage — \"Cigfa daughter of Gwyn Gloyw\" — in the manner of the Branches, which place every figure by descent. Otherwise offstage.",
      rel: [
        { to: "cigfa", label: "father of" },
      ] },

    // ── The enchanter & his quarrel ──────────────────────────
    { id: "llwyd", name: "Llwyd fab Cil Coed", role: "enchanter", appears: [6],
      blurb: "The magician behind the whole tale — though unnamed and unseen until the last pages. Out of friendship for Gwawl son of Clud, he lays the enchantment on the seven cantrefs of Dyfed: the mist, the empty land, the vanishing caer, the host of mice. He works in disguise — the white boar's master, then the scholar, the priest and the bishop who try to talk Manawydan off the hill. Out-bargained at the gallows, he restores everything, his own pregnant wife the price.",
      rel: [
        { to: "gwawl", label: "avenges (friend)" },
        { to: "pryderi", label: "enchants; takes" },
        { to: "rhiannon", label: "enchants; takes" },
        { to: "manawydan", label: "out-bargained by" },
        { to: "llwydwife", label: "husband of" },
        { to: "household", label: "lord of" },
      ] },
    { id: "llwydwife", name: "Llwyd's wife", role: "enchanter", appears: [5, 6],
      blurb: "The lady of Llwyd's court, transformed with the others into a mouse to ravage Manawydan's corn — and, being pregnant, too heavy to flee. The one mouse Manawydan can catch, and so the hostage on whom the whole rescue turns. Freed and struck with the magic wand, she is restored to \"the fairest young woman anyone had seen.\"",
      rel: [
        { to: "llwyd", label: "wife of" },
      ] },
    { id: "gwawl", name: "Gwawl fab Clud", role: "enchanter", appears: [6],
      blurb: "Rhiannon's rejected suitor from the First Branch, to whom she was promised before she chose Pwyll. At Hyfaidd Hen's court Pwyll tricked him into a magic bag and his men beat him — the Badger-in-the-Bag. Dead or vanished long before this branch, he is its true cause: Llwyd lays the wasteland to avenge him, visiting the old grudge on Pwyll's son and Pwyll's widow.",
      rel: [
        { to: "pwyll", label: "humiliated by" },
        { to: "llwyd", label: "avenged by" },
      ] },
    { id: "household", name: "Llwyd's household", role: "enchanter", appears: [5, 6],
      blurb: "Llwyd's whole court — his retinue and the ladies of his hall — who beg to be shape-shifted into mice and sent against Manawydan's wheat. The \"innumerable host\" that strips the first two crofts in two nights; a war-band reduced to vermin, the grotesque-comic shape the enchantment's malice takes.",
      rel: [
        { to: "llwyd", label: "household of" },
      ] },

    // ── England: craftsmen & clergy ──────────────────────────
    { id: "boar", name: "The white boar", role: "craft", appears: [4],
      blurb: "The shining-white wild boar that rises from the thicket and baits the hunters to the caer — an Otherworld lure, kin to Pwyll's white-and-red hounds and to Twrch Trwyth. Not quarry but bait: it stands at bay just long enough to draw the dogs and the men on, then vanishes into the fortress that was never there. Llwyd's instrument, the first move of the trap that takes Pryderi.",
      rel: [
        { to: "llwyd", label: "lure of" },
        { to: "pryderi", label: "draws to the caer" },
      ] },
    { id: "guilds", name: "The craftsmen of England", role: "craft", appears: [3, 5],
      blurb: "The saddlers of Hereford, then the shieldwrights, then the cordwainers of two more towns — honest guildsmen ruined by the four exiles' otherworldly skill, who each in turn conspire to kill them. They are the engine of the England episodes and its running joke: wherever Manawydan plies a trade, he is too good to be borne, and must move on rather than let Pryderi fight.",
      rel: [
        { to: "manawydan", label: "out-worked by" },
        { to: "pryderi", label: "would fight" },
      ] },
  ],
};
