/* Owain, neu Chwedyl Iarlles y Ffynnawn — "Owain, or the Tale of the Lady
   of the Fountain," one of the Three Welsh Romances (Y Tair Rhamant). The
   English shown alongside the Welsh is an original translation written
   movement by movement in subsequent passes; Lady Charlotte Guest's
   public-domain version (1849) is consulted as a sense-check, not copied.

   The Welsh is a reading text normalised from the public-domain edition of
   John Rhys & J. Gwenogvryn Evans, "The Text of the Mabinogion ... from the
   Red Book of Hergest" (Oxford, 1887), pp. 163–192 — the same volume from
   which the Culhwch ac Olwen text on this site is taken. The 1887 edition
   sets the tale in a special Welsh typeface that OCR mis-reads heavily, so
   the Welsh here is normalised by hand into a Middle Welsh reading
   orthography (the convention used for Pwyll on this site), cross-checked
   against the White Book of Rhydderch tradition where the OCR is corrupt.

   Both source texts are preserved verbatim under source/:
     owain-rhys-evans-1887-redbook.txt   (Middle Welsh, Red Book)
     owain-guest-1849-english.txt        (Guest's comparison translation)
   Attaches to window.OWAIN. */
window.OWAIN = window.OWAIN || {};
window.OWAIN.tale = {
  meta: {
    blurb: "<strong>Owain, neu Iarlles y Ffynnon</strong> — \"Owain, or the Lady of the Fountain\" — one of the <em>Three Welsh Romances</em> (with Peredur and Geraint), preserved in the White Book of Rhydderch (c. 1350) and the Red Book of Hergest (c. 1382–1410). It is the Brittonic twin of Chrétien de Troyes' <em>Yvain, ou le Chevalier au Lion</em> (c. 1177–81): whether Wales borrowed from France, France from Wales, or both from a lost common source is the central question of Arthurian transmission — and the reason this tale anchors the Welsh↔Continental branch of the <a href=\"/pendragon/#tree\">evolutionary tree</a> at Pendragon. The story: at Arthur's court Cynon tells of a humiliating defeat at a magic fountain; <strong>Owain</strong> rides out, defeats and mortally wounds the fountain's Black Knight, is trapped in the dead man's castle, and — made invisible by Luned's ring — falls in love with the widow he has just made, <strong>the Countess of the Fountain</strong>. Luned wins her for him; Owain holds the fountain; then Arthur's company arrives, Owain returns to court, <em>forgets his wife past the appointed day</em>, runs mad and naked in the wilderness, is healed by a lady's ointment, rescues and is companioned by a <strong>lion</strong>, frees the imprisoned Luned, and is at last reconciled to the Countess. The translation below is <strong>original</strong> and proceeds <strong>movement by movement</strong>; the Welsh beside it is a reading text normalised from Rhys &amp; Evans (1887). Full sources preserved at <a href=\"source/owain-rhys-evans-1887-redbook.txt\">source/owain-rhys-evans-1887-redbook.txt</a> and <a href=\"source/owain-guest-1849-english.txt\">source/owain-guest-1849-english.txt</a>.",
    sources: [
      { label: "The Text of the Mabinogion — Rhys & Evans, 1887 (Oxford, public domain; Red Book of Hergest, pp. 163–192)", url: "https://archive.org/details/textofmabinogion00rhysiala", host: "Internet Archive" },
      { label: "The Mabinogion — Lady Charlotte Guest, 1838–49 (public-domain English translation)", url: "https://www.gutenberg.org/ebooks/5160", host: "Project Gutenberg" },
      { label: "Owain, or the Lady of the Fountain — overview", url: "https://en.wikipedia.org/wiki/Owain,_or_the_Lady_of_the_Fountain", host: "Wikipedia" },
      { label: "Yvain, the Knight of the Lion — Chrétien de Troyes (the Continental twin)", url: "https://en.wikipedia.org/wiki/Yvain,_the_Knight_of_the_Lion", host: "Wikipedia" },
    ],
  },
  roadmap: [
    { t: "Source text in hand (Red Book / Rhys & Evans 1887 + Guest 1849)", done: true },
    { t: "I · Arthur's court at Caer Llion; Cynon is asked for a tale", done: true },
    { t: "II · Cynon's adventure: the Black Knight and the storm at the fountain", done: false },
    { t: "III · Owain rides out, defeats the Black Knight, is trapped in the castle", done: false },
    { t: "IV · Luned's ring; the funeral; Owain and the Countess of the Fountain", done: false },
    { t: "V · The wedding; Owain holds the fountain; Arthur's company arrives", done: false },
    { t: "VI · The broken term; madness in the wilderness; the healing ointment", done: false },
    { t: "VII · The lion; Luned freed from the stone vault; the Black Oppressor", done: false },
    { t: "VIII · Reconciliation with the Countess; return to court", done: false },
  ],
  passages: [
    {
      title: "I. Arthur's court at Caer Llion, and the asking of a tale",
      segments: [
        { w: "Yr amherawdyr Arthur a oed yg Kaer Llion ar Wysc. Sef yd oed yn eisted diwarnawt yn y ystafell, ac y gyt ac ef Owein uab Uryen, a Chynon uab Clydno, a Chei uab Kynyr; a Gwenhwyfar a'e llawforynyon yn gwniaw wrth y ffenestr. A chyd dywettit uot porthawr ar lys Arthur, nyt oed yr un; Glewlwyt Gauaeluawr oed yno hagen ar ureint porthawr, y arfoll gwesteywyr a phellennigyon, ac y dechreu eu hanrydedu, ac y uenegi udunt moes y llys a'e deuawt — yr neb a dylyei uynet yr neuad neu yr ystafell, oe uenegi idaw, a'r neb a dylyei letty, oe uenegi idaw.",
          e: "The emperor Arthur was at Caer Llion on Usk. One day he was sitting in his chamber, and with him were Owain son of Urien, and Cynon son of Clydno, and Cei son of Cynyr; and Gwenhwyfar and her handmaids were sewing by the window. And though it might be said that there was a porter at Arthur's court, there was none — yet Glewlwyd Mighty-Grasp was there in a porter's office, to receive guests and travellers from afar, to begin their honouring, and to make known to them the usage and the custom of the court: whoever should rightly go to the hall or to the chamber, to direct him; and whoever was owed a lodging, to direct him.",
          n: "The romance opens not at the fountain but at the hearth — the Welsh frame is a tale told <em>at</em> court before it is a tale lived in the wilderness. <strong>Caer Llion ar Wysc</strong> (Caerleon-on-Usk, Monmouthshire) is the Galfridian capital of Arthur's Britain. <strong>Glewlwyd Gafaelfawr</strong> (\"Mighty-Grasp\") is Arthur's porter here as he is in <em>Culhwch ac Olwen</em> — but note the wry inversion: Culhwch's Glewlwyd guards a gate that must not be passed, while here \"there was no porter\" and his office is pure hospitality. The same figure, the opposite function: the comparative seam this site is built to show." },

        { w: "Ac ym perued llawr yr ystafell yd oed yr amherawdyr Arthur yn eisted, ar demyl o irurwyn a llenn o bali melyngoch ydanaw, a gobennyd a'e dudet o bali coch dan penn y elin. Ar hynny y dywawt Arthur: \"Ha wyr,\" heb ef, \"pei nam goganewch, mi a gysgwn tra uewn yn aros uy mwyt; ac ymdidan a ellwch chwitheu, a chymryt ysteneit o ued a golwython y gan Gei.\" A chysgu a oruc yr amherawdyr.",
          e: "And in the middle of the chamber-floor sat the emperor Arthur, on a dais of fresh rushes with a covering of red-and-yellow brocade spread beneath him, and a cushion in a case of red brocade under his elbow. At that Arthur said: \"Men,\" he said, \"if you will not think the less of me for it, I would sleep while I wait for my meat; and you can talk among yourselves, and have a flagon of mead and some collops from Cei.\" And the emperor slept.",
          n: "The flame-coloured satin and the king who dozes while his men talk is a deliberately domestic, un-heroic frame — the marvels are about to be reported, not performed. The detail of <em>irvrwyn</em>, fresh-cut rushes strewn for a seat, is the texture of a real medieval Welsh hall." },

        { w: "A gofyn a oruc Cynon uab Clydno y Gei yr hyn a adawssei Arthur udunt. \"Minneu a uynnaf yr ymdidan da a edewit y minneu,\" heb y Cei. \"Iawn,\" heb y Cynon, \"tecaf yw itti wneuthur edewit Arthur yn gyntaf; ac odyna yr ymdidan goreu a wypom ninneu, ni a'e dywedwn itti.\" Ynet a oruc Cei yr gegin ac yr uedgell, a dyuot ac ysteneit o ued gantaw, ac eurgawc, a lloneit y dwrn o uereu yn dwyn golwython arnunt.",
          e: "And Cynon son of Clydno asked Cei for what Arthur had promised them. \"But I will have the good tale that was promised to me,\" said Cei. \"It is only fair,\" said Cynon, \"that you keep Arthur's promise first; and then the best tale we know, we will tell you.\" So Cei went to the kitchen and the mead-cellar, and came back bearing a flagon of mead, and a golden goblet, and a fistful of skewers carrying broiled collops.",
          n: "<strong>Cei</strong> (the later Sir Kay) is already the court's sharp-tongued steward — bargaining for his story before he will serve the mead. The exchange is courtesy as friction: who owes whom, and in what order. It is the same Cei who, a moment later, will mock Owain; the Welsh tale lets the seneschal's edge show early." },

        { w: "Ac yna y bwytaassant y golwython, ac y dechreuassant yuet y med. \"Weithon,\" heb y Cei, \"amser yw ywch talu y minneu uy ymdidan.\" \"Cynon,\" heb yr Owein, \"tal di y Gei y ymdidan a dyly.\" \"Yn wir,\" heb y Cynon, \"hynaf wyt ti, a gwell ymdidanwr, a mwy a weleist o ryfedodeu; tal ditheu y Gei y ymdidan.\" \"Dechreu dy hun,\" heb yr Owein, \"a'r goreu a wypych.\" \"Mi a'e gwnaf,\" heb y Cynon.",
          e: "And then they ate the collops and began to drink the mead. \"Now,\" said Cei, \"it is time you paid me my tale.\" \"Cynon,\" said Owain, \"pay Cei the tale that is his due.\" \"Truly,\" said Cynon, \"you are the elder, and the better teller, and you have seen more marvels than I — you pay Cei his tale.\" \"Begin yourself,\" said Owain, \"with the best you know.\" \"I will,\" said Cynon.",
          n: "The hand-off from Owain to Cynon is the hinge of the frame: the tale we are about to hear (Movement II) is <em>Cynon's defeat</em>, and it is the very adventure Owain will then ride out to avenge and complete. The romance's deep structure is a relay — one man's humiliating story becomes another man's quest. Cynon's narration begins in the next movement." },
      ],
    },
  ],
};
