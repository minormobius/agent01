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
    blurb: "<strong>Sir Orfeo</strong> — an anonymous Middle English Breton lay of about 600 lines, preserved earliest in the Auchinleck Manuscript (c. 1330). One of the strangest acts of cultural translation in the medieval canon: the classical Orpheus and Eurydice retold as a king of Winchester and his queen taken not into Hades but into Faerie — and brought back. Below are <strong>Movements I &amp; II</strong> (the king of Winchester and his queen; the vision, the abduction at the ympe-tree, and the abdication). The English is an <strong>original translation</strong>. The Middle English beside it is a <em>lightly normalised reading text</em> after Martha Hale Shackford's 1913 anthology (Ginn and Company, Boston), which prints David Laing's 1884 edition of the Auchinleck text — thorns and yoghs modernised for readability. The full diplomatic source is preserved verbatim at <a href=\"source/orfeo-shackford-1913.txt\">source/orfeo-shackford-1913.txt</a>.",
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
    { t: "II · The vision, the abduction at the ympe-tree, the abdication", done: true },
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

    {
      title: "II. The vision, the abduction at the ympe-tree, the abdication",
      segments: [
        { w: "Tho lay sche stille attelast, and gan to wepe swithe fast, and seyd thus the king to: “Allas! mi lord, sir Orfeo, seththen we first to gider were, ones wroth never we nere, bot ever Ich have y loved the as mi liif, and so thou me; ac now we mot delen ato — do thi best, for y mot go.” “Allas!” quath he, “forlorn Ich am! Whider wiltow go and to wham? Whider thou gost Ichil with the, and whider Y go thou schalt with me.”",
          e: "Then at last she lay still, and began to weep fast and hard, and said to the king thus: “Alas, my lord Sir Orfeo — since we were first together we were never once at odds, but ever I have loved thee as my life, and so thou me; and now we must be parted in two. Do thy best — for I must go.” “Alas!” he said, “forlorn am I! Where wilt thou go, and to whom? Wherever thou goest I will with thee, and wherever I go thou shalt with me.”",
          n: "<em>Ones wroth never we nere</em> — they have never had a single quarrel. The line is the poem's grief in miniature. Orfeo's promise — wherever you go I'll go with you — is the moral knot of the whole work: he <em>cannot</em> follow her where she's going, and the poem will spend its second half finding a way." },

        { w: "“Nay, nay, sir, that nought nis. Ichil the telle al how it is: As Ich lay this under tide, and slepe under our orchard side, ther come to me to fair knightes wele y armed al to rightes, and bad me comen an heighing, and speke with her lord the king; and Ich answerd at wordes bold, y durst nought, no y nold. Thai priked oghain as thai might drive; tho com her king also blive, with an hundred knightes and mo, and damissels an hundred al so — al on snowe white stedes, as white as milke were her wedes. Y no seighe never yete bifore so fair creatours y core!”",
          e: "“Nay, nay, sir — that cannot be. I will tell thee how it is. As I lay this morning-tide and slept beside our orchard, there came to me two fair knights, well armed at every point, and bade me come in haste and speak with their lord the king. And I answered with bold words: I dared not, and would not. They pricked back as fast as they could ride; then came their king as swift, with a hundred knights and more, and a hundred damsels also — all on snow-white steeds, their robes as white as milk. I never saw before so fair creatures of choice!”" },

        { w: "“The king hadde a croun on hed: it nas of silver, no of gold red, ac it was of a precious ston — as bright as the sonne it schon. And as son as he to me cam, wold Ich, nold Ich, he me nam, and made me with him ride opon a palfrey bi his side, and brought me to his pallays wele atired in ich ways; and schewed me castels and tours, rivers, forestes, frith with flours, and his rich stedes ichon, and seththen me brought oghain hom, in to our owhen orchard, and said to me afterward:”",
          e: "“The king had a crown on his head — not silver, nor red gold, but of a single precious stone, that shone as bright as the sun. And as soon as he came to me, would I, would I not, he took me, and made me ride with him on a palfrey at his side; and brought me to his palace, fairly arrayed in every way, and showed me castles and towers, rivers, forests, woods set with flowers, and every one of his rich steeds; and then brought me again home, into our own orchard, and said to me afterward:”",
          n: "A crown of a single jewel that shines like the sun — no metal at all. This is the Otherworld king's signature: no gold, no silver, one stone, full radiance. The palace tour is the bait — castles, towers, rivers, forests, all the goods of a sovereignty offered on terms." },

        { w: "“‘Loke dame, to morwe thatow be right here under this ympe tre, and than thou schalt with ous go and live with ous ever mo. And yif thou makest ous y let, where thou be, thou worst y fet, and to tore thine limes al, that nothing help the no schal; and thei thou best so to torn, yete thou worst with ous y born.’”",
          e: "“‘See, lady, that tomorrow thou be right here, under this ympe-tree; and then thou shalt go with us, and live with us evermore. And if thou seek to hinder us — wheresoever thou be, thou shalt be fetched, and all thy limbs torn to pieces, so that nothing shall help thee; and though thou be so to-torn, yet thou shalt be borne off with us.’”",
          n: "The Fairy King's threat is the most chilling thing in the poem so far: even being torn limb from limb will not prevent the taking. The body is irrelevant. The fae take the soul, and the soul does not survive its own dismemberment." },

        { w: "When king Orfeo heard this cas, “O we!” quath he, “allas, allas! Lever me were to lete mi liif than thus to lese the quen mi wiif.” He asked conseyl at ich man — ac no man him help no can.",
          e: "When King Orfeo heard this case: “Oh me!” he cried, “alas, alas! Better that I lose my own life than thus to lose the queen, my wife.” He asked counsel of every man, but no man could help him." },

        { w: "A morwe the under tide is come, and Orfeo hath his armes y nome, and wele ten hundred knightes with him, ich y armed stout and grim; and with the quen wenten he, right unto that ympe tre. Thai made scheltrom in ich aside, and sayd thai wold there abide, and dye ther everichon, er the quen schuld fram hem gon. Ac yete amiddes hem ful right, the quen was oway y twight, with fairi forth y nome — men wist never wher sche was bicome.",
          e: "On the morrow the morning-tide came, and Orfeo took up his arms, with a full thousand knights about him, each one armed stout and grim; and they went with the queen, right unto that ympe-tree. They made a shield-wall on every side, and said they would there abide and die there every one, ere the queen should from them go. But yet, from the very midst of them, the queen was twitched away — with faerie forth taken; men never knew whither she was gone.",
          n: "A thousand knights in <em>scheltrom</em> (the Anglo-Saxon shield-wall, ringed and locked) around a tree — the most martial possible defence against a foe that does not fight at all. She just vanishes from the centre. The poem refuses to show the taking; we get only the negative space where she was." },

        { w: "Tho was ther criing, wepe and wo; the king into his chamber is go, and oft swoned opon the ston, and made swiche diol and swiche mon, that neighe his liif was y spent — ther was non amendement.",
          e: "Then was there crying, weeping, and woe. The king has gone into his chamber, and often swooned upon the stone, and made such grief and such moan that his life was nearly spent — there was no remedy." },

        { w: "He cleped to gider his barouns, erls, lordes of renouns; and when thai al y comen were: “Lordinges,” he said, “bifor you here Ich ordainy min heigh steward to wite mi kingdom afterward, in mi stede ben he schal, to kepe mi londes over al. For now Ichave mi quen y lore, the fairest levedi that ever was bore — never eft y nil no woman se. Into wildernes Ichil te, and live ther ever more, with wilde bestes in holtes hore. And when ye under stond that y be spent, make you than a parlement, and chese you a newe king: now doth your best with al mi thing.”",
          e: "He called his barons together, earls and lords of renown; and when they were all come: “Lordings,” he said, “before you here I ordain my high steward to keep my kingdom afterward; in my stead he shall be, to hold my lands over all. For now I have my queen lost, the fairest lady that ever was born — never again shall I look on a woman. Into the wilderness I will go, and live there evermore, with the wild beasts in the grey woods. And when you understand that I am spent, make then a parliament and choose you a new king. Now do your best with all my goods.”",
          n: "Orfeo names his <em>heigh steward</em> — the same steward who will rule honestly for ten years and be tested at the poem's end. The abdication is structurally Odyssean: a king goes into exile leaving a steward in charge, will return in disguise. The return-arc is being laid down now, in the moment of the loss." },

        { w: "Tho was ther wepeing in the halle, and grete cri among hem alle; unnethe might old or yong for wepeing speke a word with tong. Thai kneled adoun al y fere, and praid him yif his wille were, that he no schuld nought from hem go. “Do way!” quath he, “it schal be so.”",
          e: "Then was there weeping in the hall, and great cry among them all; scarcely could old or young for weeping speak a word with tongue. They kneeled down all together, and prayed him, if his will would allow, not to go from them. “Have done!” he said. “It shall be so.”",
          n: "The court's plea closes Movement II on a refusal. The grief at Camelot when Gawain rode out had a destination — the Green Chapel, a year and a day. This grief has no destination at all. The next movement opens with him casting off the kingdom for a pilgrim's cloak and walking into the hoary woods alone." },
      ],
    },
  ],
};
