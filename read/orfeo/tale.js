/* Sir Orfeo. The English shown alongside the Middle English is an
   original translation written movement by movement in subsequent
   passes. The Middle English is a lightly normalised reading text
   after Martha Hale Shackford's 1913 anthology "Legends and Satires
   from Mediaeval Literature" (Ginn and Company, Boston, pp. 141–160),
   itself printed after David Laing's "Select Pieces of Ancient Popular
   Poetry of Scotland" (Edinburgh, repr. 1884), itself from the
   Auchinleck Manuscript (NLS Advocates 19.2.1, c. 1330).

   The Auchinleck text is missing its opening leaf, so the 24-line
   Breton-lay prologue ("We redeth oft and findeth y-write…") is not
   present here; it is preserved only in the later Harley 3810 and
   Ashmole 61 manuscripts and may be added on a later pass. The full
   diplomatic source is preserved at source/orfeo-shackford-1913.txt.
   Attaches to window.ORFEO. */
window.ORFEO = window.ORFEO || {};
window.ORFEO.tale = {
  meta: {
    blurb: "<strong>Sir Orfeo</strong> — an anonymous Middle English Breton lay of about 600 lines, preserved earliest in the Auchinleck Manuscript (c. 1330). One of the strangest acts of cultural translation in the medieval canon: the classical Orpheus and Eurydice retold as a king of Winchester and his queen taken not into Hades but into Faerie — and brought back. Below is <strong>Movement I</strong> (the king of Winchester, his queen Heurodis, and the strange waking). The English is an <strong>original translation</strong>. The Middle English beside it is a <em>lightly normalised reading text</em> after Martha Hale Shackford's 1913 anthology (Ginn and Company, Boston), which prints David Laing's 1884 edition of the Auchinleck text — thorns and yoghs modernised for readability. The full diplomatic source is preserved verbatim at <a href=\"source/orfeo-shackford-1913.txt\">source/orfeo-shackford-1913.txt</a>.",
    sources: [
      { label: "Sir Orfeo in the Auchinleck Manuscript — National Library of Scotland", url: "https://auchinleck.nls.uk/mss/orfeo.html", host: "NLS" },
      { label: "Sir Orfeo (TEAMS edition) — Laskaya & Salisbury 1995", url: "https://metseditions.org/read/kx0QpvAhal5RCWAMT63kWFj90aee895", host: "Middle English Texts Series" },
      { label: "Legends and Satires from Mediaeval Literature — Shackford 1913", url: "https://elfinspell.com/LegendandSatiresLaySirOrfeo.html", host: "Elfinspell" },
      { label: "Sir Orfeo — background", url: "https://en.wikipedia.org/wiki/Sir_Orfeo", host: "Wikipedia" },
    ],
  },
  roadmap: [
    { t: "Source text in hand", done: true },
    { t: "I · King Orfeo, Queen Heurodis, and the strange waking", done: true },
    { t: "II · The vision, the abduction at the ympe-tree, the abdication", done: false },
    { t: "III · Ten years in the wilderness", done: false },
    { t: "IV · The fairy hunt and the rock-cleft", done: false },
    { t: "V · The Otherworld, the harping, the rash boon", done: false },
    { t: "VI · Return, the steward's test, recognition", done: false },
  ],
  passages: [
    {
      title: "I. King Orfeo, Queen Heurodis, and the strange waking",
      segments: [
        { w: "Orfeo was a king, in Inglond an heighe lording, a stalworth man and hardi bo, large and curteys, he was al so; his fader was comen of king Pluto, and his moder of king Juno, that sum time were as godes y hold, for aventours that thai dede and told.",
          e: "Orfeo was a king — a high lord in England, a stalwart man and bold, generous and courteous all at once. His father was descended from King Pluto, his mother from King Juno, who in their own day were held for gods, for the strange deeds men did and told of them.",
          n: "The opening euhemerises classical myth: Pluto and Juno are not gods but ancient kings later mistaken for gods. Orfeo himself, of their stock, is a king. By line eight the poet has already done his most important work — he has refused to read Orpheus mythologically." },

        { w: "This king sojurned in Traciens, that was a cite of noble defens, for Winchester was cleped tho Traciens, with outen no.",
          e: "This king dwelt in Thrace — a city of noble strength; for Winchester was called Thrace in those days, no lie.",
          n: "Winchester was called Thrace, the poet says, with the offhand confidence of <em>with outen no</em> — without contradiction. The myth is being naturalised into England by simple renaming. Thrace, the bard-country of Orpheus in Ovid, is Winchester, capital of the old English kings." },

        { w: "The king hadde a quen of priis, that was y cleped dame Herodis. The fairest levedi for the nones, that might gon on bodi and bones, ful of love and godenisse; ac no man may telle hir fairnise.",
          e: "The king had a queen of price, who was called Lady Heurodis: the fairest lady, in truth, that ever went on body and bones — full of love and goodness; nor could any man tell out her fairness." },

        { w: "Bifel so in the comessing of May, when miri and hot is the day, and oway beth winter schours, and everi feld is ful of flours, and blosme breme on everi bough, over al wexeth miri anough, this ich quen dame Heurodis tok to maidens of priis, and went in an undren tide to play bi an orchard side, to se the floures sprede and spring, and to here the foules sing.",
          e: "It befell at the start of May, when the day grows merry and warm and the winter showers have gone, and every field is full of flowers and the blossom is bright on every bough — over all, the world grows merry enough — that this same queen, Lady Heurodis, took two maidens of price and went out at the morning hour to walk by an orchard-side, to see the flowers spread and spring, and to hear the birds sing.",
          n: "Twelve lines on May. The lay convention requires a spring opening, but the poem invests in it: every field, every bough, the world over. The lavishness is foreboding — high May, full sun, the open orchard, three women walking. The folk frame is loaded." },

        { w: "Thia sett hem doun al thre, under a fair ympe tre, and wel sone this fair quene fel on slepe opon the grene. The maidens durst hir nought awake, bot let hir ligge and rest take, so sche slepe til after none, that under tide was al y done.",
          e: "They sat down all three under a fair grafted-orchard tree (an <em>ympe-tree</em>, the old tales called it); and very soon this fair queen fell asleep upon the green. The maidens did not dare wake her, but let her lie and take her rest; so she slept till past noon, when the morning hour was all done.",
          n: "The <em>ympe-tree</em> — a grafted fruit tree — is the poem's single most loaded object. In medieval English folk-belief, the place where two trees were grown together as one was a known fae-frequenting spot. The queen sleeps at the solar zenith, under the doubled tree, in the open: every condition for being taken." },

        { w: "Ac as sone as sche gan awake, sche crid and lothli bere gan make; sche froted hir honden and hir fet, and crached her visage, it blede wete; hir riche robe hye al to rett, and was reneyd out of hir witt.",
          e: "But as soon as she began to wake she cried out and made a hideous outcry; she rubbed her hands and her feet, scratched her face till it bled wet, tore her rich robe to pieces, and was driven out of her wits.",
          n: "The waking is the abduction's first stage, and the queen's response is the response of someone who has just <em>seen something</em>. She has not yet been taken, but in some sense she already has — what the poem will gradually reveal is that the fae take the soul before they take the body." },

        { w: "The two maidens hir biside no durst with hir no leng abide, but ourn to the palays ful right, and told bothe squier and knight that her quen awede wold, and bad hem go and hir at hold. Knightes urn, and levedis al so, damisels sexti and mo, in the orchard to the quen hye come, and her up in her armes nome, and brought hir to bed attelast, and held hir there fine fast; ac ever sche held in o cri, and wold up and owy.",
          e: "The two maidens beside her did not dare stay with her any longer, but ran straight to the palace and told both squire and knight that their queen would go mad, and bade them come and hold her. Knights ran, and ladies also — sixty damsels and more — and came in the orchard to the queen, and took her up in their arms, and brought her at the last to bed, and held her there full fast. But ever she held to one cry, and would be up and away." },

        { w: "When Orfeo herd that tiding, never him nas wers for no thing; he come with knightes tene to chaumber right bifor the quene, and biheld and seyd with grete pite:",
          e: "When Orfeo heard the news, never had he been more grieved by anything. He came with ten knights to the chamber, right before the queen, and looked, and said with great pity:" },

        { w: "“O lef liif, what is te, that ever yete hast ben so stille, and now gredest wonder schille? Thi bodi, that was so white y core, with thine nailes is al to tore. Allas! thi rode, that was so red, is al wan as thou were ded; and also thine fingres smale beth al blodi and al pale. Allas! thi lovesum eyghen to loketh so man doth on his fo. A dame, Ich biseche merci, let ben al this reweful cri, and tel me what the is, and hou, and what thing may the help now?”",
          e: "“O dear life, what is the matter with you, who have always been so still, and now criest out so loud and wild? Your body that was so white of choice is, with your own nails, all to-torn. Alas! your cheek, that was so red, is as wan as if you were dead; and your small fingers are all bloody and pale. Alas! your two lovely eyes look on me as a man does on his foe. Lady, I beseech mercy — let this rueful cry be done, and tell me what it is, and how, and what may help you now?”",
          n: "Orfeo's first speech, and the first of two great laments in this poem (the second at the rock-cleft door of the Otherworld). The king does not yet know what has happened to her. Movement II will be her telling of it." },
      ],
    },
  ],
};
