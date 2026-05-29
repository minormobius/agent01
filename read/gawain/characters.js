/* The cast of Sir Gawain and the Green Knight — the second stratum of the
   annotation layer. Each entry carries its role, the Fitts where it
   appears (links into the reading), and typed relationships (which seed
   the character web). The poem's compact cast — fewer than twenty named
   figures, sharply drawn — is deliberate: where Culhwch overflows with
   hundreds at Arthur's gate, Gawain's chamber is small, and the centre
   of it is one masked identity. Attaches to window.GAWAIN. */
window.GAWAIN = window.GAWAIN || {};
window.GAWAIN.characters = {
  intro: "The poem's cast is small and pointed. Five named figures at the high table in Camelot, three in Bertilak's hall, and behind them all one off-stage prime mover — Morgan le Fay — who is also one of the three in the hall. Where <em>Culhwch</em> spills its dramatis personae across hundreds, the Pearl-Poet writes a chamber drama: the closer the cast gets to the centre, the more identities each figure carries. The Green Knight is Bertilak; the ancient lady is Morgan; the lord who hunts is the host who befriends is the antagonist who returns the blow. Each card notes the Fitts where the figure appears (click to read), and the relationships that bind them — the raw material for a character web.",
  roles: [
    { id: "principal",  label: "Principals",                color: "#c9a24a" },
    { id: "camelot",    label: "Camelot — Arthur's court",  color: "#6fa8c9" },
    { id: "castle",     label: "Hautdesert — the castle",   color: "#b07a4b" },
    { id: "wild",       label: "The wild & the chapel",     color: "#8aa363" },
    { id: "patroness",  label: "Powers in the pentangle",   color: "#9a8fd0" },
  ],
  cast: [
    // — Principals —
    { id: "gawain", name: "Sir Gawain", role: "principal", alt: "Gawayn", epithet: "the pentangle-knight, Arthur's sister-son",
      blurb: "Arthur's nephew, the youngest at the high table, the knight who steps forward when the king reaches for the axe. He bears a shield with the pentangle on its face and the Virgin on its inside — a five-fold pledge of faith, fellowship, courtesy, charity, and the five wounds. The poem watches him keep that pledge perfectly through three days of paralleled temptation — and fail at the last by a hand's-breadth, on the smallest count, for the smallest reason (he wanted to live). He is the pentangle-knight tested precisely where the pentangle does not protect: in the love of life itself.",
      appears: [1, 2, 3, 4],
      rel: [{ to: "arthur", label: "nephew of" }, { to: "agravain", label: "brother of" }, { to: "morgan", label: "nephew of" }, { to: "greenknight", label: "challenged by" }, { to: "bertilak", label: "guest of" }, { to: "lady", label: "tempted by" }, { to: "gringolet", label: "rides" }, { to: "mary", label: "carries on shield" }, { to: "guinevere", label: "seated by" }] },

    { id: "greenknight", name: "The Green Knight", role: "principal", alt: "the grene knyght", epithet: "Bertilak in his other shape",
      blurb: "Enormous, mantled in green, riding a green horse and carrying a holly bough in one hand and an axe in the other. He bursts into Camelot at Christmas and proposes the beheading game — let one of you strike me; in a year and a day I strike back. When Gawain beheads him, he picks his head up off the floor and rides out, head still speaking. He returns at the Green Chapel as the axe-bearer who deals the three blows. The poem withholds until Fitt IV what he, and Bertilak, and Morgan have all known from the start: he and Bertilak are one man.",
      appears: [1, 4],
      rel: [{ to: "bertilak", label: "same man as" }, { to: "morgan", label: "agent of" }, { to: "gawain", label: "challenger to" }] },

    { id: "bertilak", name: "Bertilak de Hautdesert", role: "principal", alt: "Bernlak de Hautdesert", epithet: "the lord of the wild castle",
      blurb: "The big-bearded, broad-chested, generously-grinning lord whose castle saves Gawain from the Christmas-Eve cold. He proposes the exchange of winnings; he hunts deer, boar and fox while Gawain is kept warm and tested; he reveals himself at the Green Chapel as the Green Knight, and names his enchantment as Morgan le Fay's. The poem's deepest puzzle is that the warmest host and the grimmest antagonist are the same man — and Gawain only sees it at the very end.",
      appears: [2, 3, 4],
      rel: [{ to: "greenknight", label: "same man as" }, { to: "morgan", label: "served by" }, { to: "lady", label: "husband of" }, { to: "gawain", label: "host of" }] },

    { id: "lady", name: "Lady Bertilak", role: "principal", alt: "the lady",
      blurb: "Bertilak's wife — younger than her husband and (the poem keeps insisting) lovelier than Guinevere. On three successive mornings she comes to Gawain's bedside before he has risen, and in three carefully measured conversations probes for one slip: a kiss, a kiss, a kiss; a promise, a promise, a girdle. She is the donor of the green silk girdle that becomes both Gawain's charm and his shame — and she acts, the poem reveals at the end, at her husband's direction and Morgan's design. She is the test, brilliantly executed; she is also (the poem refuses to settle) a woman who liked the game.",
      appears: [2, 3, 4],
      rel: [{ to: "bertilak", label: "wife of" }, { to: "morgan", label: "companion to" }, { to: "gawain", label: "tempts" }] },

    { id: "morgan", name: "Morgan le Fay", role: "principal", alt: "Morgne la Faye / the ancient lady", epithet: "the prime mover",
      blurb: "Arthur's half-sister (Uther begot Arthur on the Duchess of Tintagel; Morgan was the duchess's earlier daughter), Gawain's aunt, and pupil of Merlin — \"Morgne the goddess,\" Bertilak calls her at the reveal. She is the off-stage cause of everything: she sent the Green Knight to Camelot to terrify Guinevere, and at the castle she is the other lady — the veiled, ancient figure beside the young wife, whom Gawain honoured but did not recognise. The poem grants her her name only after the test is done, and never lets her speak.",
      appears: [2, 3, 4],
      rel: [{ to: "arthur", label: "half-sister of" }, { to: "gawain", label: "aunt of" }, { to: "guinevere", label: "would destroy" }, { to: "bertilak", label: "patroness of" }, { to: "lady", label: "veiled companion" }, { to: "merlin", label: "Merlin's pupil" }] },

    // — Camelot —
    { id: "arthur", name: "King Arthur", role: "camelot", alt: "Arthur",
      blurb: "Young here, restless, on the cusp of the marvel he himself half-summons: he will not eat until he has heard a story or seen a wonder. When the Green Knight throws the axe down, it is Arthur who reaches for it — and only Gawain's stepping forward saves the king from being the one who plays the game. He kisses Gawain at the return, and laughs at the green sash; the court turns sash into livery.",
      appears: [1, 4],
      rel: [{ to: "guinevere", label: "husband of" }, { to: "gawain", label: "uncle of" }, { to: "morgan", label: "half-brother of" }] },

    { id: "guinevere", name: "Queen Guinevere", role: "camelot", alt: "Gaynour",
      blurb: "The high queen at the Christmas feast, lovely with grey eyes, set beside Gawain on his left. Morgan's whole plot, Bertilak says at the end, was aimed at her: \"to have grieved Guinevere and made her to die\" at the sight of a beheading talking-head. She survives, and the threat is never told to her.",
      appears: [1, 4],
      rel: [{ to: "arthur", label: "wife of" }, { to: "morgan", label: "target of" }] },

    { id: "baldwin", name: "Bishop Baldwin", role: "camelot", epithet: "the prelate at the high table",
      blurb: "Seated opposite Gawain at the Christmas feast — one of the named worthies who frame the Round Table in Fitt I. A small bright pillar of churchly weight in a poem otherwise constructed of green silk and old stones.",
      appears: [1],
      rel: [{ to: "arthur", label: "in court of" }] },

    { id: "yvain", name: "Yvain son of Urien", role: "camelot", alt: "Ywain fitz Urien", epithet: "(Sir Ywain)",
      blurb: "The hero of his own French and Welsh romances (Chrétien's <em>Yvain</em>, the Mabinogion's <em>Owain</em>); here a young knight at Arthur's table on the New Year of the wager. A reminder that this poem stands at one node of a continent-wide network of stories about the same men.",
      appears: [1],
      rel: [{ to: "arthur", label: "in court of" }] },

    { id: "agravain", name: "Agravain à la dure main", role: "camelot", epithet: "Gawain's brother of the hard hand",
      blurb: "Gawain's brother, named at the Christmas table — \"with the hard hand,\" the formula goes. In Malory he will be the one whose insistence forces the discovery of Lancelot and Guinevere and brings the Round Table down. Here he sits warm, in Christmas firelight, on the safe side of the future.",
      appears: [1],
      rel: [{ to: "gawain", label: "brother of" }, { to: "arthur", label: "in court of" }] },

    // — Bertilak's castle —
    { id: "castle-porter", name: "The porter of Hautdesert", role: "castle",
      blurb: "The first man Gawain meets at Bertilak's gate. He blesses the prince, kneels, prays God to save Gawain's coming, and lets down the drawbridge. A small thread of welcome before the test begins.",
      appears: [2, 4],
      rel: [{ to: "bertilak", label: "servant of" }] },

    // — The wild & the chapel —
    { id: "guide", name: "The guide", role: "wild", epithet: "Bertilak's man on the New Year's road",
      blurb: "Bertilak gives Gawain a servant to lead him to the Green Chapel on New Year's morning. At the last hill the guide tries to dissuade him — \"a man without measure dwells there; I will swear by all the saints that you fled, and never tell.\" Gawain refuses; the guide rides home; the knight goes on alone. The poem's last temptation, in another key — and the last man Gawain sees before the axe.",
      appears: [4],
      rel: [{ to: "bertilak", label: "servant of" }, { to: "gawain", label: "guides" }] },

    { id: "gringolet", name: "Gringolet", role: "wild", epithet: "Gawain's horse",
      blurb: "Gawain's great horse, stabled honourably through the Christmas feast at Bertilak's and \"eager to prance for sheer pent-up spirit\" on New Year's morning. He carries Gawain into the wild, through the storm, down to the Green Chapel, and home again. The companion who never speaks but always returns.",
      appears: [2, 3, 4],
      rel: [{ to: "gawain", label: "ridden by" }] },

    { id: "beasts", name: "The three beasts", role: "wild", epithet: "deer · boar · fox",
      blurb: "Bertilak hunts on three successive days: a herd of hinds (deer) on the first, a great solitary boar on the second, a fox on the third. The poem cuts each hunt against Gawain's bedroom temptation in the same Fitt — and the mood mirrors. Day one: timid deer, easy yields, easy kisses. Day two: a fierce boar fought to the death, a fiercer temptation refused. Day three: the trickster fox, slinking and doubling — and a trick concealed under Gawain's robe.",
      appears: [3],
      rel: [{ to: "bertilak", label: "hunted by" }] },

    // — Powers in the pentangle —
    { id: "mary", name: "The Blessed Virgin Mary", role: "patroness", epithet: "on the inside of Gawain's shield",
      blurb: "The fifth of Gawain's five fives — painted on the inside of his shield, where he can see her face in battle. When he is lost in the Wirral wilderness on Christmas Eve, freezing, he prays to her and to her Son for shelter, and Bertilak's castle appears in the trees. The poem's open religious centre — the patroness against whom the green girdle (a different, older, dangerous magic) is implicitly weighed.",
      appears: [2, 3],
      rel: [{ to: "gawain", label: "patroness of" }] },

    { id: "merlin", name: "Merlin", role: "patroness", epithet: "offstage — Morgan's teacher",
      blurb: "Named once, at the reveal, as the source of Morgan's arts: \"the cunning of clergy, by crafts well learned, the mistress of Merlin — many a man has she taken.\" The poem hints, without insisting, that Morgan was Merlin's lover-pupil. He never enters the action; he is the lineage of the magic that drives it.",
      appears: [4],
      rel: [{ to: "morgan", label: "teacher of" }] },
  ],
};
