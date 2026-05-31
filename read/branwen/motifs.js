/* The motif index — Branwen ferch Llŷr classified against the folklorists'
   "Dewey decimal": the Thompson Motif-Index (letter-classed call-numbers) and
   the Aarne-Thompson-Uther (ATU) tale-type index.

   COMPLETE. The motif index for the whole branch — across eight Thompson
   classes — each keyed to the movement(s) that realise it, with cross-
   references into the sister tales (especially Pwyll, the First Branch).

   Honesty: exact call-numbers are best-effort identifications, not the
   authoritative index. Each motif carries a confidence flag:
     high = well-attested code & application   med = code right, application interpretive
     spec = the number itself is a guess.
   Attaches to window.BRANWEN. */
window.BRANWEN = window.BRANWEN || {};
window.BRANWEN.motifs = {
  intro: "Folklorists file every recurring story-atom under a letter-class and number: B animals, D magic, E the dead, F marvels &amp; giants, K deceptions &amp; death-traps, S cruelty, Z formulas. <em>Branwen</em>, like its sister-branch <em>Pwyll</em>, is a native Welsh cycle rather than an ATU wonder-tale, but it carries some of the most potent motifs in the Insular tradition: the <strong>Cauldron of Rebirth</strong> that gives the dead back to battle but not to speech, the <strong>living severed head</strong> that feasts and counsels for fourscore years, the <strong>giant king</strong> no house can hold who makes his own body a bridge, and the <strong>messenger bird</strong> that carries a wronged queen's word across the sea. Below, the motif index for the whole branch, keyed to the movements that realise each.",
  taletypes: [
    { code: "The Four Branches", name: "Native Welsh cycle (no clean ATU type)", conf: "high",
      gloss: "Branwen is the Second of the Four Branches of the Mabinogi, bound to Pwyll (the First) by the House of Llŷr and by shared figures (Pryderi, Rhiannon's birds, Manawydan — whose own Third Branch opens where this ends). It is not an ATU wonder-tale but a native mythological-historical cycle; its motifs are Insular and old, several with Irish cognates." },
    { code: "Cauldron → Grail", name: "The Otherworld cauldron-of-plenty / rebirth complex", conf: "med",
      gloss: "The Cauldron of Rebirth belongs to the wider Insular cauldron tradition — the cauldron of Diwrnach in Culhwch, the cauldron of the Head of Annwn in <em>Preiddeu Annwn</em>. Roger Sherman Loomis and others traced a line from these regenerative/abundance cauldrons toward the Grail itself — making Branwen a distant relation of the legend's central mutating symbol." },
  ],
  classOrder: ["B", "C", "D", "E", "F", "K", "S", "Z"],
  classes: { B: "Animals", C: "Tabu &amp; the forbidden", D: "Magic", E: "The dead", F: "Marvels &amp; giants", K: "Deceptions &amp; death-traps", S: "Cruelty", Z: "Formulas &amp; refrains" },
  list: [
    // — B · Animals —
    { cls: "B", code: "B291.1", name: "Bird as messenger (the starling)", conf: "high", passages: [3],
      gloss: "Branwen rears a starling at her kneading-trough through three years of servitude, teaches it to know her brother, binds a letter under its wing, and sends it across the sea to Brân. The animal-messenger that brings the host of Britain to Ireland. <em>Enters in Movement III.</em>" },

    // — C · Tabu &amp; the forbidden —
    { cls: "C", code: "C611", name: "The forbidden door", conf: "high", passages: [6],
      gloss: "At Gwales the seven survivors feast fourscore years out of time, all grief forgotten and Brân's head a living guest, while two doors stand open and the third — toward Cornwall — must not be opened. Heilyn opens it, and the whole weight of memory and loss returns in an instant; the timeless idyll ends. Thompson C611, the forbidden chamber, in its noblest Insular form — a myth of the suspension and the return of sorrow. <em>Realised in Movement VI.</em>" },

    // — D · Magic —
    { cls: "D", code: "D1171.3", name: "The Cauldron of Rebirth (magic cauldron)", conf: "high", passages: [2, 5],
      gloss: "<em>Pair Dadeni</em>: a cauldron from the Irish lake (with the back-story of the giant Llasar Llaes Gyfnewid and his wife, and the iron house the Irish tried to burn them in). Brân gives it to Matholwch as part of the amends for Efnisien's outrage. The central magical object of the branch. <em>Enters in Movement II.</em>" },

    // — E · The dead —
    { cls: "E", code: "E64.1", name: "Resurrection by cauldron — the dead return, but dumb", conf: "spec", passages: [2, 5],
      gloss: "Cast a slain man into the Cauldron of Rebirth and by next day he rises as good a fighter as before — but mute, never able to speak again. In Ireland it is turned against the Britons, reviving the Irish dead each night, until Efnisien bursts it with his own body. Resurrection without the soul's voice: the tale's bleakest marvel. (Thompson's E64 is &ldquo;resurrection by magic object&rdquo;; the cauldron-specific decimal is our best guess, hence <em>spec</em>.) <em>Enters in Movements II &amp; V.</em>" },
    { cls: "E", code: "E783", name: "The vital (living / talking) severed head", conf: "high", passages: [6],
      gloss: "Mortally wounded by a poisoned spear, Brân has his own head struck off; it stays undecayed, eats, and counsels the seven survivors through a seven-year feast at Harlech (with the birds of Rhiannon) and fourscore years at Gwales, before its burial at the White Hill of London facing France, a talisman against invasion. Thompson's E783 &ldquo;vital head&rdquo; — and Brân is the motif's canonical Insular instance. The Pendragon crosswalk's severed-head row points here (the Gawain-poet's talking head is its later literary cousin). <em>Enters in Movement VI.</em>" },

    // — F · Marvels & giants —
    { cls: "F", code: "F531", name: "The giant king (no house can hold him)", conf: "high", passages: [1, 4],
      gloss: "Bendigeidfran is a giant: the wedding-feast must be held in tents, \"for no house could ever hold Bendigeidfran.\" Later he wades the Irish sea (no ship can bear him) and makes his own body a bridge for his host — <em>a fo ben, bid bont</em>, \"he who would be chief, let him be a bridge.\" The giant's scale is the hinge of the plot when the Irish build a house to hold him. Realised first in Movement I." },

    // — K · Deceptions & death-traps —
    { cls: "K", code: "K754.1", name: "Warriors concealed in bags (the flour-bag ambush)", conf: "spec", passages: [4],
      gloss: "The Irish hang two hundred leather bags on the pillars of the house built for Brân, an armed man in each, and tell anyone who asks that they hold meal. Efnisien, reading the trap, goes down the row crushing each hidden head through the bone \u2014 \"What is in this bag?\" \"Meal\" \u2014 and caps it with a grim englyn. The hidden-army ambush undone by a counter-deception; the death-trap house of Mvt II returned as a battlefield. (Kin to K312, &ldquo;thieves hidden in oil-casks&rdquo; / Ali Baba; the exact bag-ambush decimal is our best guess, hence <em>spec</em>.) <em>Enters in Movement IV.</em>" },

    { cls: "K", code: "K811", name: "Victims lured into a house and burned (the iron house)", conf: "med", passages: [2, 4],
      gloss: "Twice in the tale a house is a trap. In the cauldron's back-story the Irish pack the giant couple into an iron house and heat it white-hot to kill them; they burst out. The motif then rhymes forward: the house the Irish build to hold Brân hides armed warriors in flour-bags. The death-trap dwelling, Insular and grim. <em>Enters in Movements II &amp; IV.</em>" },

    // — S · Cruelty —
    { cls: "S", code: "S302", name: "Murder of a child (cast into the fire)", conf: "high", passages: [5],
      gloss: "Efnisien, called to fondle his nephew Gwern at the feast of reconciliation, throws the boy headlong into the fire — the act that ignites the battle and dooms both islands. The killing of the innocent child-king, handled by the Welsh with stark, unbearable brevity. <em>Realised in Movement V.</em>" },

    { cls: "S", code: "S411", name: "The persecuted / banished wife (Branwen's blow)", conf: "med", passages: [3],
      gloss: "Not calumny (as with Pwyll's Rhiannon) but scapegoating: to avenge Efnisien's insult on someone, Matholwch's court drives Branwen from the king's bed to the kitchen, where the butcher boxes her ear every day. Her three years of servile suffering — and the blow, <em>paluawt Branwen</em>, named in the colophon as one of the Three Unhappy Blows of Britain. (Thompson S411 is the banished/persecuted wife; S62 proper is &ldquo;cruel husband,&rdquo; so the application is filed here, conf <em>med</em>.) <em>Enters in Movement III.</em>" },

    // — Z · Formulas & refrains —
    { cls: "Z", code: "Z10", name: "End-formula: the refrain of the two ruined islands", conf: "med", passages: [6],
      gloss: "Branwen's dying words — <em>\"Alas that I was ever born: two good islands have been laid waste because of me\"</em> — and the colophon's tally (Ireland left with five pregnant women, Britain with seven men) give the branch its formulaic close: the marriage that should have joined two islands has emptied them both. Thompson Z10 &ldquo;formulistic framework&rdquo; / end-formula, rather than Z71's numeral-formulas. <em>Enters in Movement VI.</em>" },
  ],
};
