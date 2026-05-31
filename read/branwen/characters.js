/* The cast of Branwen ferch Llŷr — the third stratum of the annotation layer.
   Each entry carries its role, the movements it appears in (links into the
   reading), and typed relationships (which seed the character web).

   SKELETON IN PROGRESS. The principals and the House of Llŷr are seeded here
   so the cast grid, the character web, and the mythograph render from the
   first movement; the cast grows movement by movement as the translation
   reaches the figures it introduces (Gwern, the cauldron, the starling, the
   seven survivors, Caswallon). Attaches to window.BRANWEN. */
window.BRANWEN = window.BRANWEN || {};
window.BRANWEN.characters = {
  intro: "<em>Branwen</em> is a family tragedy played at the scale of nations. At its centre is the House of Llŷr: the giant king <strong>Bendigeidfran</strong> (Brân the Blessed); his sister <strong>Branwen</strong>, married out to Ireland to bind the two islands; his brother <strong>Manawydan</strong>; and his two half-brothers by Penarddun — gentle <strong>Nisien</strong>, who makes peace, and <strong>Efnisien</strong>, who makes ruin. Against them stand <strong>Matholwch</strong> king of Ireland and his court, who let an insult fester into cruelty. Around them move the tale's terrible instruments — the <strong>Cauldron of Rebirth</strong>, the <strong>starling</strong> that carries Branwen's message across the sea, and the child <strong>Gwern</strong> whose death in the fire begins the end. <em>This roster grows movement by movement as the translation proceeds.</em>",
  roles: [
    { id: "principal", label: "Principals",                     color: "#c9a24a" },
    { id: "llyr",      label: "The House of Llŷr & Britain",    color: "#6f9ac9" },
    { id: "ireland",   label: "The court of Ireland",           color: "#c97f9a" },
    { id: "creature",  label: "Creatures & instruments",        color: "#8aa363" },
    { id: "survivors", label: "The seven who return",           color: "#b07a4b" },
  ],
  cast: [
    // — Principals —
    { id: "bran", name: "Bendigeidfran", role: "principal", alt: "Brân the Blessed; Brân fab Llŷr", epithet: "the giant king of the Island of the Mighty",
      blurb: "\"Brân the Blessed,\" crowned king over Britain and exalted with the crown of London — a king the size of myth, a giant no house can hold. Son of Llŷr; brother of Branwen and Manawydan; half-brother of Nisien and Efnisien. He gives his sister in marriage to bind two islands, makes amends for Efnisien's outrage with the Cauldron of Rebirth, and at last leads the host of Britain over the sea to avenge her — wading the water himself, a bridge for his men. Mortally wounded by a poisoned spear, he commands his own head struck off; the head feasts and counsels the survivors, undecayed, for fourscore years before its burial at the White Hill of London, facing France, as a talisman against invasion.",
      appears: [1, 2, 3], pending: true,
      rel: [{ to: "branwen", label: "brother of" }, { to: "manawydan", label: "brother of" }, { to: "efnisien", label: "half-brother of" }, { to: "nisien", label: "half-brother of" }, { to: "matholwch", label: "father-in-law / overlord of" }, { to: "penarddun", label: "son of" }, { to: "cauldron", label: "gives the cauldron" }] },

    { id: "branwen", name: "Branwen", role: "principal", alt: "Branwen uerch Lyr", epithet: "daughter of Llŷr; one of the three chief ladies of Britain",
      blurb: "The title figure — \"Branwen daughter of Llŷr,\" one of the three chief matriarchs of the Island of the Mighty and the fairest maiden in the world. Married to Matholwch of Ireland to seal an alliance, she is honoured for a year and bears a son, Gwern; then, when the court's grudge over Efnisien's insult turns on her, she is driven from the king's bed to the kitchen and struck each day by the butcher. Over three years she rears a starling and teaches it to carry word of her wrong to her brother across the sea. The war her message brings lays both islands waste; she dies of a broken heart on the bank of the Alaw — <em>\"Alas that I was ever born: two good islands destroyed because of me.\"</em>",
      appears: [1, 2, 3], pending: true,
      rel: [{ to: "bran", label: "sister of" }, { to: "matholwch", label: "wife of" }, { to: "gwern", label: "mother of" }, { to: "manawydan", label: "sister of" }, { to: "starling", label: "rears and sends" }] },

    { id: "efnisien", name: "Efnisien", role: "principal", alt: "Efnissyen", epithet: "the strife-maker; half-brother to Brân",
      blurb: "The tale's engine of ruin: the half-brother who \"would stir up strife between the two kindreds when they loved each other most.\" Slighted that Branwen was given in marriage without his leave, he mutilates Matholwch's horses — the outrage that poisons the alliance. In Ireland he detects the warriors hidden in the flour-bags and crushes each skull; at the feast of reconciliation he throws the child Gwern into the fire, igniting the battle. At the last, seeing the Irish dead reborn from the cauldron, he hides among their corpses, is thrown in, and bursts the Cauldron of Rebirth — and his own heart — to destroy it. A figure of pure malice who ends in the tale's one act of redeeming self-sacrifice.",
      appears: [1, 2], pending: true,
      rel: [{ to: "bran", label: "half-brother of" }, { to: "nisien", label: "brother of" }, { to: "matholwch", label: "outrages" }, { to: "gwern", label: "kills" }, { to: "cauldron", label: "destroys" }, { to: "penarddun", label: "son of" }] },

    // — The House of Llŷr & Britain —
    { id: "manawydan", name: "Manawydan", role: "llyr", alt: "Manawydan fab Llŷr", epithet: "brother of Brân; one of the seven",
      blurb: "Brother of Brân and Branwen, son of Llŷr — the Welsh reflex of the Irish sea-god Manannán mac Lir. He counsels and follows Brân, and is one of the seven men who survive the war in Ireland to carry the head home. His own tale is the Third Branch, <em>Manawydan fab Llŷr</em>, which opens where this one ends.",
      appears: [1, 2], pending: true,
      rel: [{ to: "bran", label: "brother of" }, { to: "branwen", label: "brother of" }, { to: "penarddun", label: "son of" }] },

    { id: "nisien", name: "Nisien", role: "llyr", alt: "Nissyen", epithet: "the peace-maker; half-brother to Brân",
      blurb: "The good half-brother, son of Euroswydd and Penarddun — \"he would make peace between the two kindreds when they were angriest.\" The structural opposite of his brother Efnisien; the tale names them together at the outset to set its moral poles.",
      appears: [1], pending: true,
      rel: [{ to: "bran", label: "half-brother of" }, { to: "efnisien", label: "brother of" }, { to: "penarddun", label: "son of" }] },

    { id: "penarddun", name: "Penarddun", role: "llyr", alt: "Penarddun ferch Beli", epithet: "mother of the House of Llŷr",
      blurb: "Daughter of Beli son of Mynogan; mother of Brân, Branwen and Manawydan, and — by Euroswydd — of Nisien and Efnisien. The shared mother who makes the strife-maker and the peace-maker brothers to the king.",
      appears: [1], pending: true,
      rel: [{ to: "bran", label: "mother of" }, { to: "efnisien", label: "mother of" }, { to: "nisien", label: "mother of" }] },

    // — The court of Ireland —
    { id: "matholwch", name: "Matholwch", role: "ireland", alt: "Matholwch", epithet: "king of Ireland",
      blurb: "King of Ireland, who crosses the sea with thirteen ships to ask for Branwen and bind the two islands. He weds her, but cannot hold his court to the alliance: pressed by his men's resentment over Efnisien's insult, he lets Branwen be cast from his bed and abused, and so brings the war on himself. Weak rather than wicked — a king governed by his council to ruin.",
      appears: [1, 2, 3], pending: true,
      rel: [{ to: "branwen", label: "husband of" }, { to: "gwern", label: "father of" }, { to: "bran", label: "son-in-law of" }] },

    // — Creatures & instruments (enter in later movements) —
    { id: "cauldron", name: "The Cauldron of Rebirth", role: "creature", alt: "Pair Dadeni", epithet: "the cauldron that gives back the dead",
      blurb: "<em>Pair Dadeni</em>, the Cauldron of Rebirth: cast a slain man into it and by the next day he rises as good a fighter as before — but dumb, unable ever to speak. Brân gives it to Matholwch as part of the amends for Efnisien's outrage; in Ireland it turns the war against the Britons, reviving the Irish dead each night, until Efnisien destroys it with his own body. A token, not a character, but the tale's terrible fulcrum. <em>Enters in Movement II.</em>",
      appears: [2], pending: true,
      rel: [{ to: "bran", label: "given by" }, { to: "matholwch", label: "given to" }, { to: "efnisien", label: "destroyed by" }] },

    { id: "starling", name: "The starling", role: "creature", alt: "drudwen", epithet: "Branwen's messenger over the sea",
      blurb: "The bird Branwen rears at her kneading-trough during her years of servitude and teaches to know her brother; she binds a letter under its wing telling of her wrong, and it crosses the sea to find Brân. The animal-messenger that brings the host of Britain to Ireland. <em>Enters in Movement III.</em>",
      appears: [3], pending: true,
      rel: [{ to: "branwen", label: "reared and sent by" }, { to: "bran", label: "carries word to" }] },

    { id: "gwern", name: "Gwern", role: "ireland", alt: "Gwern fab Matholwch", epithet: "the child king; Branwen's son",
      blurb: "Son of Branwen and Matholwch, and Brân's nephew. Born during Branwen's year of honour in Ireland; later, at the feast meant to reconcile the two kindreds, the kingship of Ireland is conferred on him — and Efnisien, called to fondle the boy, throws him head-first into the fire. His death ignites the battle. <em>Enters in Movement III.</em>",
      appears: [3], pending: true,
      rel: [{ to: "branwen", label: "son of" }, { to: "matholwch", label: "son of" }, { to: "efnisien", label: "killed by" }] },

    { id: "llasar", name: "Llasar Llaes Gyfnewid", role: "creature", alt: "the man from the lake", epithet: "the giant who bears the cauldron",
      blurb: "A huge yellow-red giant who came up out of the Lake of the Cauldron in Ireland with the Cauldron of Rebirth on his back and his wife Cymideu Cymeinfoll behind him. The Irish, unable to bear his too-fertile, outrage-making household, tried to burn the family alive in an iron house; he burst the white-hot iron wall with his shoulder and escaped to Britain, where Brân took him in and scattered his warrior-brood through the realm. The cauldron's origin and its menace in one figure. <em>Enters in Movement II.</em>",
      appears: [2], pending: true,
      rel: [{ to: "cymideu", label: "husband of" }, { to: "cauldron", label: "bearer of" }, { to: "bran", label: "sheltered by" }, { to: "matholwch", label: "fled the land of" }] },

    { id: "cymideu", name: "Cymideu Cymeinfoll", role: "creature", alt: "the giantess of the lake", epithet: "twice her husband's size; breeder of warriors",
      blurb: "Wife of Llasar Llaes Gyfnewid — twice his size, and able to bear a fully-armed fighting man six weeks after conceiving. The monstrous fertility that makes the cauldron-folk an unkillable war-host, and that drove the Irish to the iron-house slaughter the couple survived. <em>Enters in Movement II.</em>",
      appears: [2], pending: true,
      rel: [{ to: "llasar", label: "wife of" }] },

    { id: "caradog", name: "Caradog son of Brân", role: "llyr", alt: "Caradawc uab Bran", epithet: "chief steward of Britain in Brân's absence",
      blurb: "Son of Bendigeidfran, left as chief of the seven stewards to govern the Island of the Mighty while Brân leads the host to Ireland. In his father's absence the realm is usurped by Caswallon son of Beli, who comes in a mantle of invisibility and cuts down the stewards by an unseen hand; Caradog, seeing his men killed and unable to strike the slayer, dies of a broken heart. A second tragedy folded inside the first. <em>Enters in Movement III.</em>",
      appears: [3], pending: true,
      rel: [{ to: "bran", label: "son of" }, { to: "pendaran", label: "fellow steward of" }] },

    { id: "pendaran", name: "Pendaran Dyfed", role: "llyr", alt: "Pendaran Dyuet", epithet: "the young page; later fosterer of Pryderi",
      blurb: "A young page among the seven stewards left to guard Britain — and a thread tying this branch to Pwyll's: Pendaran Dyfed is the fosterer of Pryderi in the First and Third Branches of the Mabinogi. One of the few of the company to escape the usurpation, fleeing to the woods. <em>Enters in Movement III.</em>",
      appears: [3], pending: true,
      rel: [{ to: "caradog", label: "fellow steward of" }] },
  ],
};
