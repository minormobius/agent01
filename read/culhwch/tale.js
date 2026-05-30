/* Culhwch ac Olwen — pilot passage (the opening).
   The English is an original translation. The Welsh is a NORMALIZED reading
   text — the medieval wording in modern Welsh orthography — after the
   public-domain Red Book of Hergest edition of Rhys & Evans (1887, p.100).
   It is a reading text, not a strict diplomatic transcription; the facsimile
   is linked for the manuscript's own spelling. Welsh-reader corrections welcome.
   Attaches to the standalone window.CULHWCH namespace. */
window.CULHWCH = window.CULHWCH || {};
window.CULHWCH.tale = {
  meta: {
    blurb: "<strong>Culhwch ac Olwen</strong> is the oldest surviving Arthurian tale (c. 1100), preserved complete in the Red Book of Hergest and in part in the White Book of Rhydderch. This is the <strong>complete tale</strong>, in twelve movements. The English is an <strong>original translation</strong>. The Welsh beside it is a <em>normalized reading text</em>: the medieval wording rendered in modern Welsh orthography (dd, f, w…), after the public-domain Red Book edition of Rhys &amp; Evans (1887, from p.100). It is a reading text, <em>not</em> a strict diplomatic transcription — see the linked facsimile for the manuscript's own letterforms, and Lady Guest's public-domain version for comparison. The hunt's long place-name catalogue is the one stretch condensed (and flagged); everything else is in full. Corrections from Welsh-readers are welcome.",
    sources: [
      { label: "Red Book Welsh text — Rhys & Evans, 1887 (facsimile, from p.100)", url: "https://archive.org/details/textofmabinogion00rhysiala", host: "Internet Archive" },
      { label: "Lady Guest's translation (public domain)", url: "https://www.gutenberg.org/ebooks/search/?query=Mabinogion+Guest", host: "Project Gutenberg" },
      { label: "Culhwch and Olwen — background", url: "https://en.wikipedia.org/wiki/Culhwch_and_Olwen", host: "Wikipedia" },
    ],
  },
  // The tale's movements, for the progress bar. Flip `done` as passages land.
  roadmap: [
    { t: "I · Birth & the curse", done: true },
    { t: "II · Arthur's gate & the invocation", done: true },
    { t: "III · The boon & six companions", done: true },
    { t: "IV · The fort & the giant herdsman", done: true },
    { t: "V · The herdsman's house & Goreu", done: true },
    { t: "VI · Olwen", done: true },
    { t: "VII · Ysbaddaden's hall & the spears", done: true },
    { t: "VIII · The impossible tasks (anoethau)", done: true },
    { t: "IX · The great helpers & first quests", done: true },
    { t: "X · The hunt for Twrch Trwyth", done: true },
    { t: "XI · The Black Witch's blood", done: true },
    { t: "XII · Ysbaddaden slain; Olwen won", done: true },
  ],
  passages: [
   {
    title: "I. How Culhwch was born, and the destiny laid upon him",
    segments: [
      { w: "Kilydd fab Celyddon Wledig a fynnai wraig kyn gyfurdd ag ef ei hun. Sef gwraig a fynnwys, Goleuddydd ferch Anlawdd Wledig.",
        e: "Cilydd son of Celyddon Wledig wanted a wife as well-born as himself. The wife he chose was Goleuddydd, daughter of Anlawdd Wledig.",
        n: "Anlawdd Wledig is the legendary grandfather who, in Welsh tradition, ties Culhwch to Arthur — which is why the two will turn out to be first cousins. <a data-wiki='arthur'>Arthur</a> here is still a Welsh warlord at the head of a fabulous warband, not yet a courtly king." },

      { w: "Gwedy yd aeth hi gyd ag ef, gweddïo a oruc y wlad gaffel etifedd udunt; ac o nerth gweddi y wlad y kawsant fab. Ac o'r awr y beichioges, yd aeth yn wyllt, heb gyrchu kyfannedd.",
        e: "After she had come to live with him, the whole land prayed that they might be granted an heir; and through the strength of that prayer a son was got. But from the hour she grew great with child she went wild, and would come near no dwelling." },

      { w: "Pan ddoeth ei hamser, ei synnwyr a ddoeth iddi yng nghyfyl moch. Ac rhag ofn y moch y ganed y mab. Ac am hynny y dodet arnaw Kulhwch, kanys y mewn twlc moch y kafad. Bonheddig ddyn oedd ef: kefnder oedd i Arthur.",
        e: "When her time came, her senses returned to her in the midst of a herd of swine. And for sheer terror of the swine the boy was born. For that reason they laid on him the name Culhwch — “pig-run” — because he was found in a sty. Yet he was of gentle blood: he was Arthur's own cousin.",
        n: "The name is a folk-etymology — <em>cul</em> (a narrow place, a lair) + <em>hwch</em> (sow, pig). The tale keeps grounding the marvellous in the earthy: a king's heir born in a pig-sty." },

      { w: "Y mab a rodet ar fagwyr. Ac yn ol hynny clafychu a oruc y frenhines. Gelwis ei gŵr atti, a dywawt wrthaw: “Mi a fyddaf farw o'r clefyd hwn, a thi a fynny wraig arall. Eithr nac amgen, na wna gam â'th fab. Sef a archaf it: na ddyco wraig hyd pan welych ddraenen ddwybenn ar fy medd.”",
        e: "The boy was put out to be fostered. Afterwards the queen fell sick. She called her husband to her and said: “I shall die of this sickness, and you will want another wife. But even so, do your son no wrong. This is what I ask of you: that you take no wife until you see a two-headed briar grow upon my grave.”" },

      { w: "Ac yntau a addawes hynny iddi. Hi a alwes ei hathro, ac a erchis iddo lanhau ei bedd bob blwyddyn, fal na thyfei dim arnaw. Bu farw y frenhines. Y brenin a anfonai was bob bore i edrych a dyfei dim ar y bedd. Ymhen y seithfed flwyddyn yd esgeuluses yr athro yr hyn a addawsai; ac un diwrnod, wrth hela, y kyrchwys y brenin y fynwent, a llyna pan welei y ddraenen wedy tyfu.",
        e: "And he promised her this. She called her teacher and bade him weed her grave every year, so that nothing should grow upon it. The queen died. The king sent a servant every morning to see whether anything grew on the grave. At the end of the seventh year the teacher let slip what he had promised; and one day, out hunting, the king came to the burial-ground — and there he saw the briar grown upon it.",
        n: "The briar is the loophole the dying queen leaves: a delay, not a true ban. Its growth — through the teacher's neglect — is what sets the whole story in motion." },

      { w: "Ac yna y kymerth y brenin gyngor pa le y kaffai wraig. “Mi a wn wraig da a fyddai dda it,” heb un o'i gynghorwyr; “gwraig brenin Doged yw hi.” Mynd i'w cheisaw a wnaethant: lladd y brenin, a dwyn ei wraig ef ganthunt, a'i unig ferch gyd â hi, a goresgyn tir y brenin.",
        e: "Then the king took counsel as to where he might find a wife. “I know a good wife who would suit you well,” said one of his counsellors; “she is the wife of King Doged.” They went to seek her: they killed the king, carried off his wife, and her one daughter with her, and seized the king's land.",
        n: "Winning a bride by killing her husband is told flatly, without comment — the older, harsher heroic register showing through the tale's later courtly polish." },

      { w: "Y wraig newydd a ofynnawd a oedd blant i'r brenin. Managwyd iddi fod iddaw un mab. Yna yd aeth hi i ymweled â'r gwas, ac y dywawt wrthaw:",
        e: "The new wife asked whether the king had any children. She was told he had one son. So she went to visit the youth, and said to him:" },

      { w: "“Da y gŵr wyt. Mi a roddaf it dynged: na chyffyrdda dy ystlys â gwraig hyd pan ennillych Olwen ferch Ysbaddaden Bencawr.”",
        e: "“A fine young man you are. I will lay a destiny upon you: that your side shall touch no wife until you win Olwen, daughter of Ysbaddaden Bencawr — the Chief Giant.”",
        n: "<em>Tynged</em> — a binding destiny, the spoken doom (akin to the Irish <em>geis</em>) that drives so many Celtic tales. <em>Ysbaddaden Bencawr</em> means “Ysbaddaden, Chief of Giants.” From this curse on, <a data-wiki='fae-thread'>the Otherworld</a> is woven through the plot." },

      { w: "Y mab a wridodd, a serch y forwyn a aeth ym mhob aelod iddaw, kyd nas gwelsai hi erioed.",
        e: "The youth flushed red, and love of the maiden ran into every limb of him — though he had never once set eyes on her.",
        n: "Love before sight is a romance motif this tale shares with the later French tradition — but here it arrives by way of a curse, not a glance." },

      { w: "“A fab,” heb ei dad, “paham y gwridy? Beth a'th archolla?” “Tynghedwys fy llysfam na chaffwyf wraig hyd pan gaffwyf Olwen ferch Ysbaddaden Bencawr.” “Hawdd yw it gaffel hynny, fab,” heb ei dad. “Arthur yssydd gefnder it. Dos at Arthur i eillaw dy wallt, ac arch hynny iddaw yn gyfarws.”",
        e: "“My son,” said his father, “why do you blush? What wounds you?” “My stepmother has sworn a destiny on me — that I shall have no wife until I win Olwen, daughter of Ysbaddaden Bencawr.” “That will be easy for you to come by, my son,” said his father. “Arthur is your first cousin. Go to Arthur to have your hair trimmed, and ask Olwen of him as your boon.”",
        n: "Hair-trimming was an intimate rite of kinship and acknowledgement; by asking Arthur to cut his hair, Culhwch claims his place in the family — and earns the right to a <em>cyfarws</em>, a gift the lord is bound not to refuse." },

      { w: "Kychwynnu a oruc y mab ar orwydd penlluwch pedwargaeaf, carngragen, a ffrwyn eur-gymibiaith yn ei ben, a chyfrwy eur gwerthfawr dano; a deuwaywffon arian llifaid yn ei law, a bwyallig ryfel, a hyd y dwrn gŵr rhwng ei dau ymyl, a chleddyf eurddwrn ar ei glun.",
        e: "The youth set out on a steed with a pale-grey head, four winters old, well-jointed of limb and shell-shaped of hoof, a tubular bridle-bit of gold in its mouth and a costly gold saddle beneath him; in his hand two whetted spears of silver, a battle-axe a man's forearm long from edge to edge, and a gold-hilted sword on his thigh.",
        n: "The arming-and-riding catalogue is one of the great set-pieces of early Welsh prose; I've kept a representative stretch. The full passage piles on greyhounds in ruddy-gold collars, a purple mantle with a gold apple at each corner, and a steed so light the grass-tips do not bend beneath its tread." },

      { w: "Ac yna y kyrchwys y mab borth llys Arthur.",
        e: "And so the youth came to the gate of Arthur's court.",
        n: "What follows is the famous porter-scene and then the roll-call of <a data-wiki='culhwch-note'>Arthur's warband</a> — the longest such list in early Welsh." },
    ],
   },
   {
    title: "II. At Arthur's gate: the porter, and the invocation of the host",
    segments: [
      { w: "“A oes borthawr yma?” “Oes; a thithau, na bo it dy ben am ei ofyn. Glewlwyd Gafaelfawr wyf i, sef porthawr i Arthur bob calan gaeaf.” “Agor y porth.” “Nac agoraf.” “Paham nas egyr?”",
        e: "“Is there a porter here?” “There is — and as for you, may you keep your head for the asking. I am Glewlwyd Mighty-Grasp, Arthur's porter on every New Year's Day.” “Open the gate.” “I will not.” “Why will you not open it?”",
        n: "Glewlwyd Gafaelfawr (“Mighty-Grasp”) is Arthur's gatekeeper; the brusque exchange at the door is a stock opening of Welsh heroic tale." },

      { w: "“Kyllell a aeth ym mwyd, a llyn yng nghorn, ac ymgynnull yn neuadd Arthur. Eithr mab brenin gwlad gyfreithawl, neu gerddawr a ddyco ei gerdd, nid agorir iddo. Bwyd i'th gŵn a cheirch i'th feirch, a golwython poeth i tithau, a gwin goferadwy, a cherddau y'th ddiddanu. Bwyd deugain marchawg a ddyger it i'r llety.”",
        e: "“The knife has gone into the meat and the drink into the horn, and the throng is gathered in Arthur's hall. None is let in now but the son of a king of a rightful land, or a craftsman who brings his craft. But food shall be brought for your dogs and oats for your horses, and hot peppered chops for yourself, and flowing wine, and songs to entertain you; and food for fifty men shall be brought to your lodging.”" },

      { w: "“Nid ystyriaf i hynny. Onis egyr y porth, mi a ddodaf deir diaspad ar drws y porth hwn, na bo uwch o ben Pengwaedd yng Nghernyw hyd ym Mhen Blathaon ym Mhrydyn, ac yn Esgair Oerfel yn Iwerddon. A chynifer beichiog yssydd yn y llys hon, eu beichiogi a ddatodir; a'r rhai ni byddant feichiog, amhlantadwy fyddant o'r dydd hwn allan.”",
        e: "“I will not stand for that. If you do not open the gate, I will raise three shouts at the mouth of it, so loud they will carry from the headland of Pengwaedd in Cornwall to Pen Blathaon in the north of Britain, and to Esgair Oerfel in Ireland. And every pregnant woman in this court shall lose her burden; and those not with child shall be barren from this day forth.”",
        n: "The three points name the far corners of the Brythonic world — the tip of Cornwall, the north of Pictland, and a place in Ireland. The deadly shout that blights wombs is a flourish of the tale's older, magical register." },

      { w: "“Pa gymaint bynnag a waeddych, yn erbyn cyfraith Arthur ni ddoi di i mewn hyd pan elwyf i yn gyntaf i ymddiddan ag Arthur.”",
        e: "“However much you shout, you shall not come in against Arthur's law until I have first gone to speak with Arthur.”" },

      { w: "Glewlwyd a ddoeth i'r neuadd. “A oes gennyt chwedlau o'r porth?” heb Arthur. “Oes,” heb yntau. “Y mab tecaf a welais erioed yssydd wrth y porth.”",
        e: "Glewlwyd came into the hall. “Have you news from the gate?” said Arthur. “I have,” said he. “At the gate is the fairest youth I ever set eyes on.”" },

      { w: "“Os ar gerdded y doeth, gadewch ef i mewn,” heb Arthur. “Mwyaf y rhoddwn, mwyaf fydd ein bonedd a'n clod.” Ebe Cai: “Myn llaw fy nghyfaill, pei gwrandewid fy nghyngor, ni thorrid cyfreithiau'r llys erddo.” “Nac wir, Gai deg,” heb Arthur. “Gwŷr bonheddig ym ni hyd tra yn dygyrcher.”",
        e: "“If he came on foot, let him be brought in,” said Arthur. “The more we give, the greater our nobility and our fame.” Said Cei: “By the hand of my friend, were my counsel taken, the laws of the court would not be broken for his sake.” “Not so, fair Cei,” said Arthur. “We are noble men so long as others come to us; the greater our bounty, the greater our renown.”",
        n: "Cei (Sir Kay) is already the prickly one; Arthur's reply is a small manifesto of heroic largesse." },

      { w: "Y mab a ddoeth i mewn ar ei farch hyd y neuadd. “Henpych gwell, pen teyrnedd yr ynys hon!” heb ef.",
        e: "The youth rode in on his horse, right into the hall. “Hail to you, chief of the kings of this island!” he said.",
        n: "Riding a horse into the hall is a breach of courtesy the tale lets us notice — Culhwch arrives as a force, not a supplicant." },

      { w: "“Eistedd rhwng dau o'r gwŷr, a gwledd a chyfeddach it.” “Ni ddeuthum i yma am fwyd na llyn, eithr am gyfarws.” “Kany doethost am fwyd, kymer dy gyfarws: a enwo dy dafawd a'i caffy, hyd y sych y gwynt, hyd y gwlych y glaw, hyd y try haul, hyd yd ymgyrhaedd môr, hyd yd estyn daear—",
        e: "“Sit between two of the men, with feasting and good cheer.” “I came here not for food or drink, but for a boon.” “Since you did not come for food, take your boon: whatever your tongue shall name, you shall have it — as far as the wind dries, as far as the rain wets, as far as the sun runs, as far as the sea reaches, as far as the earth extends—" },

      { w: "—eithr fy llong a'm llen, a Chaledfwlch fy nghleddyf, a Rhongomyniad fy ngwayw, a Wynebgwrthucher fy nharian, a Charnwennan fy nghyllell, a Gwenhwyfar fy ngwraig.”",
        e: "—save only my ship and my mantle, and Caledfwlch my sword, and Rhongomyniad my spear, and Wynebgwrthucher my shield, and Carnwennan my dagger, and Gwenhwyfar my wife.”",
        n: "<em>Caledfwlch</em> is the Welsh name that becomes <a data-wiki='excalibur'>Excalibur</a>; <a data-wiki='guinevere'>Gwenhwyfar</a> is Guinevere. This is among the oldest naming of Arthur's treasures anywhere." },

      { w: "“Yr hyn a fynnaf: ennill ohonot fy ngwallt.” “Hynny a gaffy.” Kymerth Arthur grib eur a gwellau ariannaid, ac a eilliodd ei ben.",
        e: "“What I want is this: that you trim my hair for me.” “That you shall have.” Arthur took a comb of gold and shears looped with silver, and dressed his hair." },

      { w: "“Dywed i mi pwy wyt.” “Mi a'i dywedaf: Culhwch mab Cilydd mab Celyddon Wledig, o Oleuddydd ferch Anlawdd Wledig fy mam.” “Gwir yw hynny: kefnder wyt ti i mi. Pa beth bynnag a fynnych, ti a'i ceffy.”",
        e: "“Tell me who you are.” “I will: Culhwch son of Cilydd son of Celyddon Wledig — and my mother was Goleuddydd, daughter of Anlawdd Wledig.” “That is true: you are my cousin. Whatever you may ask, you shall have it.”" },

      { w: "“Mynnaf gennyt Olwen ferch Ysbaddaden Bencawr; ac yn enw dy wŷr y'th archaf di.” Ac archu a oruc ei gyfarws yn eu henwau hwy oll:",
        e: "“I ask of you Olwen, daughter of Ysbaddaden Bencawr; and I claim her of you in the name of your warriors.” And he asked his boon in the name of them all:",
        n: "What follows is the famous invocation: Culhwch names Arthur's men one after another, each with his marvel. The Red Book lists well over two hundred; here is a representative handful — the ones whose epithets are finest, and who outlast this tale in the later legend. The list is <strong>abridged</strong>." },

      { w: "Cai, yr hwn a allai naw nos a naw dydd dan ddwfr heb anadlu, ac a fyddai naw nos a naw dydd heb gysgu. Ni allai meddyg iachau dyfn-glwyf cleddyf Cai. Pan fynnai, kyfuwch fyddai â'r pren uchaf yn y koed; a chymaint fyddai ei wres, pan fyddai oeraf ei gymdeithion, hynny a fyddai gynnud iddunt i gynnau tân.",
        e: "Cei — who could go nine nights and nine days underwater without breathing, and nine nights and nine days without sleep. No physician could heal a wound from Cei's sword. When he pleased, he could make himself as tall as the tallest tree in the wood; and so great was his heat that, when his companions were coldest, it served them as kindling to light a fire.",
        n: "Cei — Sir Kay — is here a hero of outright superpowers, long before the French romances cut him down into Arthur's surly steward." },

      { w: "A Bedwyr, yr hwn ni waharddai neb mewn rhuthr, kanys kyn gyflymed oedd â'r gwynt; ac er nad oedd ond unllaw, tri ymladdwr ni waedent gynt nag ef mewn cad. Gwayw arall a wnâi un briw wrth fynd i mewn a naw wrth ei dynnu allan.",
        e: "And Bedwyr — whom none could withstand in the charge, for he was as swift as the wind; and though he was one-handed, three warriors could not draw blood faster than he in battle. His spear would make one wound going in and nine as it was drawn out.",
        n: "Bedwyr is the Welsh Bedivere — here a one-handed champion, not yet the knight who returns Excalibur to the lake." },

      { w: "A Gwalchmai mab Gwyar, kanys ni ddoeth eirioed adref heb y neges yd aethai i'w cheisaw. Gorau troediawg ydoedd a gorau marchawg; nai i Arthur oedd ef, mab ei chwaer, a'i gefnder.",
        e: "And Gwalchmai son of Gwyar — for he never once came home without the errand he had gone to seek. He was the best of walkers and the best of riders; he was Arthur's nephew, his sister's son, and his cousin.",
        n: "Gwalchmai is <a data-wiki='gawain'>Gawain</a> — already, in the oldest tale, the unfailing nephew who never abandons a quest." },

      { w: "A Menw mab Teirgwaedd, kanys pei delent i wlad anghred, ef a allai ddwyn lledrith arnunt fal nas gwelai neb wynt, ac wynt a welent bawb. Ac yn enw'r rhai hyn oll, ac yn enw cant cyfeillt a mwy, yd archawd Culhwch ei gyfarws.",
        e: "And Menw son of Teirgwaedd — for if they came into a heathen land, he could cast an enchantment over them so that none could see them, while they could see everyone. And in the name of all these, and of a hundred companions and more, Culhwch claimed his boon.",
        n: "Menw is the warband's magician. The full invocation runs on through warriors, women and frank absurdities; the tale's sheer delight in the catalogue is the point — Arthur's court summoned as a whole mythic world in a single breath." },
    ],
   },
   {
    title: "III. The boon granted, and the six companions",
    segments: [
      { w: "Heb Arthur: “A unben, ni chigleu i eirioed son am y forwyn a ddywedy di, nac am ei rhieni. Mi a anfonaf genhadau i'w cheisaw yn llawen. Dyro i mi amser i hynny.” “Yn llawen,” heb y mab; “o'r nos heno hyd ymhen y flwyddyn.”",
        e: "Said Arthur: “Chieftain, I have never heard tell of the maiden you name, nor of her parents. I will gladly send messengers to seek her. Give me time for that.” “Gladly,” said the youth; “from tonight to a year from tonight.”" },

      { w: "Yna yd anfones Arthur genhadau i bob gwlad o'i gyfoeth i geisaw y forwyn; ac ymhen y flwyddyn y doeth cenhadau Arthur drachefn heb na chwedl na chyfarwyddyd am Olwen, mwy nag y dydd cyntaf.",
        e: "So Arthur sent messengers into every land of his realm to seek the maiden; and at the year's end Arthur's messengers came back with no word or trace of Olwen, no more than on the first day." },

      { w: "Ac yna y dywawt Culhwch: “Pawb a gafas ei gyfarws, a minnau etwa heb fy un. Mi a af ymaith, a'th anrhydedd gennyf.” Heb Cai: “A unben, rhy amharch a wney di ar Arthur. Dyred gyd â ni.”",
        e: "Then Culhwch said: “Everyone has had his boon, and I am still without mine. I will go my way — and carry your honour off with me.” Said Cei: “Chieftain, you do Arthur too much dishonour. Come with us.”",
        n: "Cei the prickly turns champion: the man who argued against letting Culhwch in is now the one who swears to see the quest through." },

      { w: "“Ni'th ymadawn hyd pan gyffesych nad oes y forwyn yn y byd, neu hyd pan ei caffom.” Yna y dewisawd Arthur ei wŷr i fynd gyd â'r mab.",
        e: "“We will not part from you until you either own that the maiden is nowhere in the world, or until we win her.” Then Arthur chose his men to go with the youth." },

      { w: "Galw a oruc ef ar Cai a Bedwyr; ar Gynddylig Gyfarwydd; ar Wrhyr Gwalstawd Ieithoedd; ar Walchmai mab Gwyar; ac ar Menw mab Teirgwaedd.",
        e: "He called on Cei and Bedwyr; on Cynddylig the Guide; on Gwrhyr Interpreter of Tongues; on Gwalchmai son of Gwyar; and on Menw son of Teirgwaedd." },

      { w: "Cynddylig Gyfarwydd: kyn hawsed iddo gyfarwyddaw mewn gwlad nas gwelsai eirioed ag yn ei wlad ei hun.",
        e: "Cynddylig the Guide — for it was as easy for him to find the way in a land he had never seen as in his own country.",
        n: "The ideal quest-companion: the man who is never lost." },

      { w: "Gwrhyr Gwalstawd Ieithoedd: ef a wyddiad bob ieithoedd, ie, ieithoedd yr adar a'r anifeiliaid.",
        e: "Gwrhyr Interpreter of Tongues — he knew every language, yes, even the languages of the birds and the beasts.",
        n: "Gwrhyr's gift drives the tale's climax, when the heroes must question the oldest animals in the world — the Blackbird, the Stag, the Owl, the Eagle, the Salmon — to find a man lost since the dawn of time." },

      { w: "A'r gwŷr hyn oll a gymerth Culhwch yn gydymdeithion, a chychwyn a wnaethant.",
        e: "All these men Culhwch took as his companions, and they set out.",
        n: "The road now runs toward the giant's daughter — and, before her, to Custennin the herdsman and the first sight of Ysbaddaden's stronghold." },
    ],
   },
   {
    title: "IV. The unreachable fort and the giant herdsman",
    segments: [
      { w: "Kerdded a wnaethant hyd pan ddoethant i faes mawr eang, ac yno y gwelynt gaer, mwyaf o geyrydd y byd. Kerdded a wnaethant tu a hi y dydd hwnnw; a phan dybyent eu bod yn agos i'r gaer, nid oedd hi nes no chynt.",
        e: "They travelled on until they came to a great wide plain, and there they saw a fort — the greatest of the forts of the world. They journeyed toward it all that day; and when they thought themselves close to the fort, it was no nearer than before.",
        n: "The stronghold that never comes closer as you walk toward it is pure folktale dream-logic — the Otherworld keeping its distance." },

      { w: "Yr ail a'r trydydd dydd y kerddasant, ac o'r braidd y doethant hyd ati. A phan ddoethant gyfewin â hi, gwelynt ddiadell o ddefaid diderfyn diderfysg, a bugail yn cadw'r defaid ar ben gorsedd.",
        e: "The second day and the third they travelled, and only with great toil did they reach it. And when they came level with it, they saw a flock of sheep boundless and without number, and a herdsman keeping the sheep on the top of a mound." },

      { w: "Llen o grwyn amdano, ac wrth ei ystlys gi gefllwyd, mwy nag amws naw gaeaf. Defod oedd iddo na chollasai eirioed nac oen nac anifail, namyn eu cadw yn ddianaf.",
        e: "He wore a mantle of skins, and at his side a shaggy grey mastiff, bigger than a stallion nine winters old. It was his way that he had never lost even a lamb, let alone a full-grown beast, but kept them all unharmed." },

      { w: "Ni cherddasai gydymaith heibio iddo heb ei archolli neu ei ladd; a chymaint o brennau crinion a phrysgwydd a fyddai ar y maes, ei anadl ef a'u llosgasai hyd y llawr.",
        e: "No traveller had ever passed him unhurt or unkilled; and every dead tree and bush upon the plain, his breath had burned them down to the bare ground.",
        n: "The fiery-breathed giant herdsman with his monstrous hound is a guardian-of-the-threshold figure straight out of native Welsh myth." },

      { w: "Heb Cai: “Gwrhyr Gwalstawd Ieithoedd, dos i ymddiddan â'r gŵr accw.” “Cai,” heb ef, “nid addewais i fynd ddim pellach nag y delych dithau.” Yna yd aethant ynghyd; a Menw mab Teirgwaedd a ddyge ledrith ar y ci, fal na allai wneuthur niwed iddunt.",
        e: "Said Cei: “Gwrhyr Interpreter of Tongues, go and speak with that man yonder.” “Cei,” said he, “I promised to go no further than you go yourself.” So they went together; and Menw son of Teirgwaedd cast an enchantment over the dog, so that it could do them no harm." },

      { w: "Gofyn a wnaethant iddo pieu y defaid a gadwai, a phieu y gaer. “Wŷr ynfyd! Hyspys yw drwy'r byd mai caer Ysbaddaden Bencawr yw hon.”",
        e: "They asked him whose sheep he kept, and whose was the fort. “You witless men! It is known through all the world that this is the fort of Ysbaddaden Bencawr.”" },

      { w: "“A thi, pwy wyt ti?” “Custennin mab Mynwiedig wyf i; ac o achos fy ngwraig y'm hanrheithiodd fy mrawd, Ysbaddaden Bencawr. A chwithau, pwy ydych?” “Cenhadau Arthur yssydd yma, yn ceisaw Olwen.”",
        e: "“And you — who are you?” “I am Custennin son of Mynwiedig; and it is for my wife's sake that my own brother, Ysbaddaden Bencawr, has stripped me of everything I had. And you — who are you?” “We are Arthur's messengers, come to seek Olwen.”" },

      { w: "“Och, wŷr! Nawdd Duw arnoch. Er a fo'r byd, na wnewch hynny. Ni ddoeth neb eirioed i ofyn hynny a ddihangawd yn fyw.” Ac yna y kyfodes y bugail i fynd ymaith.",
        e: "“Alas, men! God's protection be on you. For all the world, do not do this. No one ever came to ask that, and went away alive.” And with that the herdsman rose to go home.",
        n: "Custennin is the giant's own wronged brother — and, as the company will soon learn, Culhwch's uncle by marriage. His warning marks the threshold: from here the tale turns from court-comedy to ordeal." },
    ],
   },
   {
    title: "V. The herdsman's house, and the hidden son",
    segments: [
      { w: "Rhoi a oruc Culhwch iddo fodrwy eur. Ceisaw a wnaeth y bugail ei gwisgo, ac ni mynnai am ei fys. A'i dodi a oruc yng nghymal ei faneg, a mynd adref, a rhoi y faneg i'w wraig i'w chadw.",
        e: "Culhwch gave him a gold ring. The herdsman tried to put it on, but it would not go onto his finger. So he set it in the finger of his glove, went home, and gave the glove to his wife to keep." },

      { w: "Tynnu y fodrwy o'r faneg a oruc hi. “Y ŵr,” heb hi, “o ble y daeth y fodrwy hon it? Nid hawdd it gaffel tlws.” “Mi a euthum,” heb ef, “i lan y môr i geisaw bwyd môr; ac wele, gwelais gorff yn dyfod gyd â'r llanw.”",
        e: "She drew the ring out of the glove. “Husband,” she said, “where did this ring come to you from? It is not often you come by a jewel.” “I went,” said he, “to the shore to look for sea-food; and behold, I saw a body come in on the tide.”" },

      { w: "“Ni welais eirioed gorff degach; ac ar ei fys y kefais y fodrwy hon.” “Y ŵr, gan nad yw'r môr yn goddef tlws gŵr marw ynddo, dangos i mi y corff hwnnw.” “Y wraig, yr hwn bieu y corff hwnnw, ti a'i gwely yma yn ebrwydd.”",
        e: "“I never saw a fairer body; and on its finger I found this ring.” “Husband — since the sea will not suffer a dead man's jewel to stay in it, show me that body.” “Wife, the man whose body that is, you shall see him here before long.”" },

      { w: "“Pwy yw hwnnw?” “Culhwch mab Cilydd mab Celyddon Wledig, o Oleuddydd ferch Anlawdd Wledig, a ddoeth i geisaw Olwen.” Deuddryd fu arni: llawen am ddyfod ei nai, mab ei chwaer, atti; a thrist, kanys ni welsai hi neb a ddêl i ofyn hynny a ddianghai â'i einioes.",
        e: "“Who is that?” “Culhwch son of Cilydd son of Celyddon Wledig, by Goleuddydd daughter of Anlawdd Wledig — come to seek Olwen.” She was of two minds: glad that her nephew, her sister's son, was coming to her; and grieved, for she had never seen anyone come on that errand who escaped with his life.",
        n: "So Custennin's wife is Culhwch's aunt — his dead mother's sister. The questers have walked, all unknowing, straight into kin." },

      { w: "Tu a drws llys y bugail y kerddasant. Clywed eu dyfod a oruc hi, a rhedeg o lawenydd i'w cyfarfod. Cipiaw a oruc Cai esgyrnbren o'r pentwr; a phan ddoeth hi i'w cyfarfod i'w cofleidio, dodi a oruc Cai y pren rhwng ei dwy law.",
        e: "They went toward the door of the herdsman's house. She heard them coming, and ran out for joy to meet them. Cei snatched a billet of wood from the pile; and when she came to embrace them, Cei thrust the log between her two hands." },

      { w: "Gwasgu a oruc hi y pren hyd nad oedd namyn gwden droellog. “Y wraig,” heb Cai, “pei myfi a wasgesit fal hyn, ni byddai raid i neb fyth fy ngharu mwy. Cas serch fu hwnnw.”",
        e: "She squeezed the log until it was nothing but a twisted withe. “Woman,” said Cei, “had you squeezed me like that, there would be no need for anyone ever to love me again. That was an ill sort of love.”",
        n: "The bone-crushing welcome is played for comedy — and as a hint of the giant's blood running in the family." },

      { w: "I'r tŷ y doethant, a chael gwasanaeth. Ymhen ennyd, agori a oruc y wraig gist faen yn ymyl yr aelwyd, ac o honi y kyfodes mab a gwallt melyn crych iddo.",
        e: "They came into the house and were served. After a while the woman opened a stone chest beside the hearth, and out of it rose a youth with curling yellow hair." },

      { w: "Heb Gwrhyr: “Tru yw cuddiaw mab fal hwn. Mi a wn nad ei fai ei hun a ddielir arno.” “Hwn yw'r unig fab a erys i mi,” heb hi. “Lladdes Ysbaddaden Bencawr dri ar hugain o'm meibion, ac nid mwy fy ngobaith am hwn nag am y rhai eraill.” Heb Cai: “Caffed ef fy nghydymdeithas i, ac ni'n lleddir namyn ynghyd.”",
        e: "Said Gwrhyr: “It is a pity to hide a lad like this away. I am sure it is no fault of his own that is being avenged on him.” “This is the one son left to me,” she said. “Ysbaddaden Bencawr has killed twenty-three of my sons, and I have no more hope for this one than for the rest.” Said Cei: “Let him keep company with me, and we shall not be killed except together.”",
        n: "The hidden boy is Goreu son of Custennin — kept safe here because, the tale will reveal, he is the one destined to take Ysbaddaden's head at the very end." },

      { w: "Bwyta ac yfed a wnaethant. Gofyn a oruc y wraig pa neges oedd eu dyfod. “Ceisaw Olwen yd ŷm.” “Yr Duw, gan nad ymddangosodd neb o'r gaer i chwi etwa, trowch yn ôl.” “Na wnawn; ni a fynnwn ei gweled.”",
        e: "They ate and drank. The woman asked what errand had brought them. “We are seeking Olwen.” “For God's sake — since no one from the fort has seen you yet, turn back.” “We will not; we mean to see her.”",
        n: "Olwen, the woman tells them, comes to this very house every Saturday to wash her hair — the opening the questers have been waiting for." },
    ],
   },
   {
    title: "VI. Olwen of the white track",
    segments: [
      { w: "“Ni a wnawn hynny yn llawen,” heb y wraig, “os addewwch na wnewch ddrwg iddi.” “Ni addawn,” heb wynt. Ac yna yd anfonwyd amdani.",
        e: "“I will do that gladly,” said the woman, “if you promise to do her no harm.” “We promise,” they said. And so word was sent for her." },

      { w: "A dyfod a oruc y forwyn: gwisg sidan fflamgoch amdani, a gordorch rhudd-aur am ei mynwgl, a pherlau gwerthfawr a gemau rhudd ynddi.",
        e: "And the maiden came: a robe of flame-red silk about her, and a torque of red gold around her neck, set with precious pearls and red gemstones." },

      { w: "Melynach oedd ei phen no blodau y banadl. Gwynnach oedd ei chnawd no distrych y don. Gwynnach oedd ei dwylo a'i bysedd no chanawon y godrwyth o blith man-raean ffynnon ffrydiog.",
        e: "Yellower was her head than the flowers of the broom. Whiter was her flesh than the foam of the wave. Whiter were her hands and her fingers than the young shoots of the marsh-trefoil among the fine gravel of a welling spring." },

      { w: "Ni bu lygad hebog mufedig na gwalch teirmufedig deccach no'i llygad hi. No bron alarch gwyn, gwynnach oedd ei dwy fron. Cochach oedd ei deurudd no'r ffion.",
        e: "Neither the eye of the mewed hawk nor of the thrice-mewed falcon was fairer than her eye. Than the breast of the white swan, whiter were her two breasts. Redder were her cheeks than the foxglove." },

      { w: "Y neb a'i gwelai, kyflawn fyddai o'i serch. Pedair meillionen wen a dyfai yn ei hôl pa fan bynnag y kerddai; ac am hynny y gelwid hi Olwen.",
        e: "Whoever looked on her was filled with love of her. Four white trefoils would spring up in her track wherever she walked; and for that reason she was called Olwen — “White-track.”",
        n: "Her name is <em>ol</em> (track, footprint) + <em>(g)wen</em> (white, fair): the maiden in whose every footstep white clover blooms. The portrait is the single most famous passage of description in medieval Welsh." },

      { w: "I mewn y doeth, ac eistedd ar y fainc gerllaw Culhwch. Ac fal y'i gwelas ef, ei hadnabod a oruc. “A forwyn,” heb ef, “tydi yw'r hon a gerais. Tyred gyd â mi.”",
        e: "She came in and sat on the bench beside Culhwch. And the moment he saw her, he knew her. “Maiden,” he said, “it is you I have loved. Come away with me.”" },

      { w: "“Ni allaf hynny,” heb hi, “rhag y bai a gawn i a thithau. Tynghedwyd i'm tad nad êl ei einioes namyn hyd pan elwyf i at ŵr. Eithr mi a rof gyngor it, os kymeri.”",
        e: "“I cannot do that,” she said, “for the blame it would bring on you and me. A destiny is laid on my father: that his life lasts only until I am given to a husband. But I will give you counsel, if you will take it.”",
        n: "Ysbaddaden is fated to die when Olwen weds — so every obstacle he raises is a giant fighting for his own life." },

      { w: "“Dos at fy nhad i'm gofyn; a pha beth bynnag a archo ef it, addaw ei gaffel, a thi a'm keffy innau. Ac os bydd amheuaeth ganddo, ni'm keffy; a da fydd it o ddianghi â'th einioes.”",
        e: "“Go to my father and ask for me; and whatever he demands of you, promise to get it, and you shall have me. But if he finds any cause to doubt you, you will not have me — and you will be fortunate to escape with your life.”",
        n: "And so the trap is set: the giant will pile up impossible tasks — the <em>anoethau</em> — certain that no man can meet them. Culhwch will agree to every one." },

      { w: "“Mi a addawaf hynny oll, ac a'i caffaf,” heb ef. A mynd a oruc hi tu a'r gaer; a chyfodi a wnaethant hwythau i'w chanlyn.",
        e: "“I promise all of it, and I will get it,” he said. And she went back toward the fort; and they too rose and followed after her.",
        n: "Next: the hall of Ysbaddaden Bencawr — the poisoned stone-spears flung back and forth, and the giant's roll-call of impossible demands." },
    ],
   },
   {
    title: "VII. The hall of Ysbaddaden, and the three spears",
    segments: [
      { w: "Tu a'r gaer y kerddasant. Lladd a wnaethant y naw porthawr oedd ar y naw porth heb i un ohonunt waeddi, a'r naw gellgi heb i un gyfarth. Ac yna i mewn i'r neuadd y doethant.",
        e: "They went on to the fort. They slew the nine porters who were at the nine gates without one of them crying out, and the nine mastiffs without one of them barking. And then they came into the hall.",
        n: "Entering Ysbaddaden's fort means cutting silently through nine gates — a folktale threshold-count, and a grim mirror of the comic gate at Arthur's court." },

      { w: "“Henpych gwell, Ysbaddaden Bencawr, gan Dduw a dyn.” “A chwithau, i ba beth y deuthoch?” “Dyfod i ofyn Olwen, dy ferch, i Gulhwch mab Cilydd.” “Mae fy ngweision drwg a'm hangraff? Dyrchefwch y ffyrch dan fy aeliau a syrthiasai dros fy llygaid, fal y gwelwyf furf fy nâb.”",
        e: "“Greetings, Ysbaddaden Bencawr, from God and man.” “And you — what have you come for?” “We come to ask for Olwen your daughter, for Culhwch son of Cilydd.” “Where are my worthless servants and my rogues? Raise up the forks beneath my eyebrows that have fallen over my eyes, so that I may see the look of my would-be son-in-law.”",
        n: "Ysbaddaden's brows are so vast they must be propped on forks before he can see — one of the great grotesque-giant images in the literature." },

      { w: "“Dewch yma yfory; chwi a gewch ateb.” Fal yd oeddynt yn kyfodi, kymerth Ysbaddaden un o'r tri llechwaywffon gwenwynig oedd yn ei ymyl, a'i fwrw ar eu hôl. A'i ddal a oruc Bedwyr, a'i fwrw drachefn, nes treiddiaw trwy ben-glin Ysbaddaden.",
        e: "“Come here tomorrow; you shall have your answer.” As they were rising to leave, Ysbaddaden took one of the three poisoned stone-spears that lay beside him and hurled it after them. Bedwyr caught it and flung it back, so that it passed clean through Ysbaddaden's kneecap." },

      { w: "“Y mab-yng-nghyfraith melltigedig anwar! Gwaeth y cerddaf i fyny rhiw o hyn allan. Mal brathiad cleren y gwân y dur gwenwynig hwn fi. Melltith ar y gof a'i gwnaeth, a'r einion — mor llem yw!”",
        e: "“Cursed, savage son-in-law! I shall walk the worse up a hill from now on. This poisoned iron stings me like the bite of a gadfly. A curse on the smith who made it, and on the anvil — so sharp it is!”",
        n: "The giant takes a seemingly mortal wound and answers only with a grumbling, comic curse — the tale's signature mix of horror and farce." },

      { w: "Y nos honno y buant yn llety. A'r ail ddydd y doethant drachefn, ac y gofynnasant Olwen. Fal yd oeddynt yn mynd ymaith, kymerth yntau yr ail waywffon a'i fwrw ar eu hôl. A'i ddal a oruc Menw mab Teirgwaedd, a'i fwrw drachefn, nes treiddiaw trwy ganol ei ddwyfron ac allan trwy ei gefn.",
        e: "That night they lodged there. On the second day they came back and asked again for Olwen. As they were leaving, the giant took the second spear and hurled it after them. Menw son of Teirgwaedd caught it and flung it back, so that it passed through the middle of his breast and out through his back." },

      { w: "“Y mab-yng-nghyfraith melltigedig! Mal brathiad gele y gwân y dur caled hwn fi. Melltith ar y ffwrnais y twymwyd ynddi. Pan elwyf i fyny rhiw, bydd cyfyngder anadl arnaf, a chnoad cylla, a chyfog mynych.”",
        e: "“Cursed son-in-law! This hard iron stings me like the bite of a leech. A curse on the furnace it was heated in. When I go up a hill now, I shall be short of breath, with cramps in my belly and frequent sickness.”" },

      { w: "Y trydydd dydd y doethant drachefn. “Na fwrw waywffon arnaf mwy,” heb Culhwch. Bwrw a oruc yntau y trydydd waywffon; a'i ddal a oruc Culhwch, a'i fwrw drachefn ag anel, nes treiddiaw trwy gannwyll ei lygad ac allan trwy gefn ei wegil.",
        e: "On the third day they came back again. “Throw no more spears at me,” said Culhwch. But the giant hurled the third spear; and Culhwch caught it and flung it back with true aim, so that it passed through the pupil of his eye and out through the nape of his neck." },

      { w: "“Y mab-yng-nghyfraith melltigedig anwar! Tra fwyf byw, gwaeth fydd fy ngolwg. Pan gerddwyf yn erbyn y gwynt, dyfrllyd fydd fy llygaid; cur pen a gaf, a phendro bob lleuad newydd. Mal brath ci cynddeiriog yw'r dur gwenwynig.” Yna yd aethant i fwyta; ac o'r diwedd yd eisteddodd y cawr i ymgyngori â hwynt am amodau.",
        e: "“Cursed, savage son-in-law! As long as I live, my sight will be the worse for it. When I walk against the wind my eyes will water; I shall have headaches, and a dizziness at every new moon. Like the bite of a mad dog is this poisoned iron.” Then they went to meat; and at last the giant sat down to bargain terms with them.",
        n: "Thrice wounded and still alive, Ysbaddaden finally sits to terms — which means the <em>anoethau</em>: the long roll of impossible things Culhwch must fetch before he can have Olwen. That list is next." },
    ],
   },
   {
    title: "VIII. The impossible tasks (the anoethau)",
    segments: [
      { w: "“A wyt ti yr hwn a gais fy merch?” “Mi yw.” “Rhaid i mi gael dy gred na wnei i mi ond cyfiawnder; a phan gaffwyf yr hyn a enwaf, ti a gei fy merch.” “Mi a'i caf yn llawen. Enwa'r hyn a fynnych.”",
        e: "“Are you the one who seeks my daughter?” “I am.” “I must have your pledge that you will do me nothing but right; and when I have what I name, you shall have my daughter.” “You shall have it gladly. Name what you will.”",
        n: "What follows is the full roll of the <em>anoethau</em> — the “impossible things.” The count varies across manuscripts (around forty); here they are complete, grouped where the tale itself nests them. The drumbeat formula — <em>“though you get that, you will not get this”</em> — runs beneath the whole list." },

      { w: "“Gweli di y prysglwyn mawr accw? Rhaid yw ei ddiwreiddiaw a'i losgi i'r llawr, a'r lludw yn wrtaith i'r tir; a'i aredig a'i hau a'i fedi mewn un dydd, fal y bo'r bwyd yn barod erbyn dy neithior.”",
        e: "(1) “Do you see that great thicket yonder? It must be torn up by the roots and burned to the ground, the ashes worked into the soil, and the land ploughed, sown, and reaped — all in a single day — so the food may be ready for your wedding feast.”" },

      { w: "“Ni all neb drin y tir hwnnw eithr Amaethon mab Dôn; ni ddaw ef gyd â thi o'i fodd, ac ni elli ei orfod. A Gofannon mab Dôn i ddyfod i'r pen-tir i lanhau'r heyrn; ni wna ef waith ond i frenin cyfiawn.”",
        e: "(2) “No one can work that land but Amaethon son of Dôn — and he will not come with you willingly, nor can you force him. (3) And Gofannon son of Dôn must come to the headland to set the iron; he does no work save for a rightful king.”" },

      { w: "“Deu ychen Gwlwlydd Wineu, ynghyd dan un iau, i drin y tir garw. A'r Melyn Gwanwyn a'r Ych Brych yn gyfartal dan iau. A'r ddau ychen gorniog: Nynniaw a Pheibaw, a wnaeth Duw yn ychen am eu pechod, dan un aradr.”",
        e: "(4) “The two oxen of Gwlwlydd Wineu, yoked together, to break the rough ground. (5) And the Yellow-of-Spring and the Speckled Ox, matched under one yoke. (6) And the two horned oxen — Nynniaw and Peibaw, whom God made into oxen for their sins — set under one plough.”",
        n: "Nynniaw and Peibaw were kings turned to oxen as a penance — one of the tale's many tossed-off marvels." },

      { w: "“Llin gwyn i'w hau yn y tir newydd, i wneuthur gwisg-ben gwyn i'm merch erbyn dy neithior; ni thyf y llin namyn o'r had a fo yn y ddaear honno, ac nid oes ohonaw yno. A mêl naw gwaith melysach no mêl haid gyntaf, heb wenyn heb wybed ynddo, i wneuthur bragod i'r wledd.”",
        e: "(7) “White flax to sow in the new-broken ground, to make a white veil for my daughter's head at your wedding — and it will grow from no seed but that which is in that very soil, of which none is left. (8) And honey nine times sweeter than the honey of a first swarm, with no bees and no drones in it, to brew the bragget for the feast.”" },

      { w: "“Cwpan Llwyr mab Llwyryon, kanys nid eil llestr a ddeil y llyn hwnnw. Mwys Gwyddneu Garanhir: pei delai'r byd ato, dair naw gŵr, y caffai bawb y bwyd a fynnai; ohonaw y bwytâf y nos y kysco fy merch gennyt. Ni'i rydd i neb o'i fodd.”",
        e: "(9) “The cup of Llwyr son of Llwyryon, for no other vessel will hold that drink. (10) The hamper of Gwyddneu Garanhir: were the whole world to come to it, thrice nine men at a time, each would find in it the food he wished; from it I must eat the night your daughter lies with you. He will give it to no one willingly.”" },

      { w: "“Corn Gwlgawd Gododdin i dywallt i ni y nos honno. Telyn Teirtu i'm diddanu: pan fynner, y can ohoni ei hun; pan fynner, y tau. Ni'i rydd ef o'i fodd.”",
        e: "(11) “The horn of Gwlgawd Gododdin to pour for us that night. (12) The harp of Teirtu to entertain me: when one wishes, it plays of itself; when one wishes, it falls silent. He will not give it willingly.”" },

      { w: "“Adar Rhiannon, y rhai a ddihuna'r marw ac a huna'r byw, i'm diddanu y nos honno. Pair Diwrnach Wyddel, distain Odgar mab Aedd brenin Iwerddon, i ferwi bwyd dy neithior.”",
        e: "(13) “The Birds of Rhiannon, those that wake the dead and lull the living to sleep, to entertain me that night. (14) The cauldron of Diwrnach the Irishman, steward of Odgar son of Aedd, king of Ireland, to boil the meat for your wedding guests.”" },

      { w: "“Ysgithr Ysgithyrwyn Ben Baedd, i'm heillaw; ni thycia onid ei dynnu o'i ben ac yntau'n fyw. Ac ni'i tyn neb namyn Odgar mab Aedd, brenin Iwerddon. Ac ni rof ei gadw i neb namyn Cadw o Brydyn; trigain cantref Prydyn yssydd dano; ni ddaw ef o'i deyrnas o'i fodd.”",
        e: "(15) “The tusk of Ysgithyrwyn Chief Boar, to shave myself with — it is no use unless drawn from his head while he lives. (16) And none can draw it but Odgar son of Aedd, king of Ireland. (17) And I will trust its keeping to none but Cadw of Pictland; the sixty cantrefs of Pictland are under him, and he will not leave his kingdom willingly.”" },

      { w: "“Rhaid yw trin fy marf cyn fy eillaw. Ni lonydda fyth onis iro â gwaed y Widon Ddu, merch y Widon Wen, o ben Pant Gofid yng nghyffiniau Uffern.”",
        e: "(18) “My beard must be dressed before I can be shaved. It will never lie still unless it is anointed with the blood of the Black Witch, daughter of the White Witch, from the head of the Valley of Grief on the borders of Hell.”" },

      { w: "“Ni thycia'r gwaed onis ceidw'n wresog; ac ni cheidw llestr ei wres namyn costrelau Gwyddolwyn Gorr, y rhai a geidw'r gwres yn y dwyrain pan dywaller yn y gorllewin. Ac ni cheidw llaeth namyn costrelau Rhynnon Rhin-farf, na thry llaeth byth yn sur ynddunt.”",
        e: "(19) “The blood is useless unless kept warm; and no vessel keeps its heat save the bottles of Gwyddolwyn the Dwarf, which keep warmth in the east though the liquid is poured in the west. (20) And no vessel keeps milk save the bottles of Rhynnon Stiff-Beard, in which no liquor ever turns sour.”" },

      { w: "“Nid oes grib na gwellau yn y byd a dycia i drin fy ngwallt, mor arw yw, namyn y grib a'r gwellau yssydd rhwng dwy glust Twrch Trwyth mab Taredd Wledig. Ni'i rydd ef o'i fodd, ac ni elli ei orfod.”",
        e: "(21) “There is no comb and shears in the world that will serve to dress my hair, so stiff it is, save the comb and shears that lie between the two ears of Twrch Trwyth, son of Taredd Wledig. He will not give them up willingly, nor can you force him.”",
        n: "Here the list folds in on itself: the comb and shears require hunting the great boar Twrch Trwyth — and that single hunt demands a whole nested cascade of further <em>anoethau</em>, the apparatus of dog, leash, collar, chain, huntsman and horse that follows." },

      { w: "“Ni ellir hela Twrch Trwyth onis ceffir Drudwyn, cenau Greid mab Eri.”",
        e: "(22) “Twrch Trwyth cannot be hunted unless you get Drudwyn, the whelp of Greid son of Eri.”" },

      { w: "“Ni ddeil tennyn yn y byd ef namyn tennyn Cors Cant Ewin. Ac ni ddeil torch y tennyn namyn torch Canhastyr Can Llaw. A chadwyn Cilydd Canhastyr i ddal y dorch ynghyd â'r tennyn.”",
        e: "(23) “No leash in the world will hold him but the leash of Cors Hundred-Claws. (24) And no collar will hold the leash but the collar of Canhastyr Hundred-Hands. (25) And the chain of Cilydd Hundred-Holds to hold the collar together with the leash.”" },

      { w: "“Nid oes heliwr yn y byd a allo hela â'r ci hwnnw namyn Mabon mab Modron, a ddygwyd yn dair nos oed oddi wrth ei fam; ni wŷs pa le y mae, na pha un ai byw ai marw ef.”",
        e: "(26) “There is no huntsman in the world who can hunt with that hound save Mabon son of Modron, who was taken from his mother when three nights old; it is not known where he is, nor whether he is alive or dead.”",
        n: "Mabon (“Divine Son”) son of Modron (“Divine Mother”) is an old Celtic god in disguise; rescuing him is the tale's most mythic sub-quest, and ends with a council of the world's oldest animals." },

      { w: "“Gwyn Mygdwn, march Gweddw, cyn gyflymed â'r don, i ddwyn Mabon i hela Twrch Trwyth; ni'i rydd o'i fodd, ac ni elli ei orfod.”",
        e: "(27) “Gwyn Dun-Mane, the horse of Gweddw, swift as the wave, to carry Mabon in the hunt of Twrch Trwyth; he will not give it willingly, nor can you compel him.”" },

      { w: "“Ni cheffir Mabon byth, ny wys pa le y mae, onis ceffir Eidoel mab Aer, ei gar, yn gyntaf; o hwnnw y dechreuir y cais.”",
        e: "(28) “Mabon will never be found, for no one knows where he is, unless his kinsman Eidoel son of Aer is found first; the search must begin from him.”" },

      { w: "“Garselit Wyddel yssydd ben heliwr yn Iwerddon; ni heliir Twrch Trwyth byth hebddo.”",
        e: "(29) “Garselit the Irishman is the chief huntsman of Ireland; Twrch Trwyth can never be hunted without him.”" },

      { w: "“Tennyn o farf Dillus Farfawg, kanys ni ddeil dim arall y ddau genau, Aned ac Aethlem. Ac ni thycia onis tynnir â gefel bren ac yntau'n fyw; ac ni edy ei ddal yn fyw, a marw ni thycia, kanys breu fydd.”",
        e: "(30) “A leash made from the beard of Dillus the Bearded, for nothing else will hold the two whelps Aned and Aethlem. And it is no use unless plucked out with wooden tweezers while he is alive; and he will not let himself be taken alive, and dead it is brittle and worthless.”" },

      { w: "“Nid oes heliwr a ddeil y ddau genau hynny namyn Cynedyr Wyllt mab Hetwn Glaif; naw gwaith gwylltach yw ef no'r bwystfil gwylltaf yn y mynydd.”",
        e: "(31) “There is no huntsman who can hold those two whelps save Cynedyr the Wild, son of Hetwn the Leper; he is nine times wilder than the wildest beast on the mountain.”" },

      { w: "“Ni heliir Twrch Trwyth heb Wyn mab Nudd, y rhoes Duw ynddo ynni ellyllon Annwn rhag difa'r byd; ni'i harbedir oddi yno. Ac nid oes farch a'i dyco i hela Twrch Trwyth namyn Du, march Mor o Oerfeddawg.”",
        e: "(32) “Twrch Trwyth cannot be hunted without Gwyn son of Nudd, into whom God put the fury of the demons of Annwn, lest the world be destroyed; he cannot be spared from there. (33) And there is no horse to carry Gwyn to that hunt save Du, the horse of Mor of Oerfeddawg.”",
        n: "Gwyn ap Nudd is the lord of Annwn, the Welsh Otherworld, and king of the fair folk — the deepest this tale reaches into the <a data-wiki=\"fae-thread\">fae</a> world." },

      { w: "“Hyd pan ddêl Gilennhin, brenin Ffrainc, ni heliir Twrch Trwyth fyth. A heb fab Alun Dyfed ni heliir ef, kanys gollyngwr da yw. A heb Aned ac Aethlem, dau gi cyn gyflymed â'r gwynt, ni ollyngwyd eirioed ar fwystfil nas lladdent, ni heliir Twrch Trwyth byth.”",
        e: "(34) “Until Gilennhin king of France comes, Twrch Trwyth will never be hunted. (35) And without the son of Alun Dyfed it cannot be done, for he is a good unleasher of hounds. (36) And without Aned and Aethlem — two dogs as swift as the wind, never loosed on a beast they did not kill — Twrch Trwyth will never be hunted.”" },

      { w: "“Arthur a'i helwyr i hela Twrch Trwyth; gŵr nerthol yw ef, ac ni ddaw gyd â thi o'i fodd, ac ni elli ei orfod. A Bwlch a Chyfwlch a Sefwlch, wyrion Cleddyf Cyfwlch, ni heliir Twrch Trwyth hebddunt.”",
        e: "(37) “Arthur and his huntsmen to hunt Twrch Trwyth; he is a mighty man, and he will not come at your bidding, nor can you force him. (38) And Bwlch, Cyfwlch and Sefwlch, the grandsons of Cleddyf Cyfwlch, without whom Twrch Trwyth cannot be hunted.”",
        n: "The grandsons of Cleddyf Cyfwlch arrive, in the full Welsh, with a dizzying alliterative cascade of three-of-everything — three shields, three spears, three hounds, three wives — a comic verbal aria the storyteller plainly relished." },

      { w: "“Cleddyf Wrnach Gawr; ni ellir ei ladd ef byth namyn ag ef. Ni'i rydd ef i neb, na thros werth na thros gymwynas, ac ni elli ei orfod.”",
        e: "(39) “The sword of Wrnach the Giant — for he can be slain by no weapon but his own. He will give it to no one, neither for price nor for favour, and you cannot force him.”" },

      { w: "“Anhawdderau a gei, a nosweithiau heb gysgu, yn ceisaw hyn; ac nis ceffy, ac ni cheffy fy merch.” “Meirch a gaf i, a marchogaeth; a'm harglwydd a'm car, Arthur, a gaiff i mi yr holl bethau hyn. Ac mi a gaf dy ferch, a thithau a golli dy einioes.”",
        e: "(40) “Hardships you shall meet, and nights without sleep, in seeking these things; and you will not get them, and you will not get my daughter.” “Horses I shall have, and horsemanship; and my lord and kinsman Arthur will win me all these things. And I shall have your daughter — and you shall lose your life.”",
        n: "Culhwch answers every impossibility the same way: <em>Arthur will get it for me.</em> The whole back half of the tale is the making-good on that boast — exactly the movements still unfilled on the progress bar." },
    ],
   },
   {
    title: "IX. The oldest animals, and the freeing of Mabon",
    segments: [
      { w: "Drachefn at Arthur y doethant, a managu iddo'r anoethau. Heb Arthur: “Pa un o'r rhain a fydd hawsaf ei gael yn gyntaf?” “Hawsaf fydd ceisaw Mabon mab Modron; ac ni cheffir ef hyd pan gaffer Eidoel mab Aer, ei gar, yn gyntaf.”",
        e: "They came back to Arthur and told him the tasks. Said Arthur: “Which of these will be easiest to win first?” “It will be best to seek Mabon son of Modron; and he will not be found until we first find his kinsman, Eidoel son of Aer.”" },

      { w: "Kychwyn a oruc Arthur a'i niferoedd hyd at gaer Glini, lle yd oedd Eidoel yng ngharchar. Rhyddhau Eidoel a wnaethant, ac ymuno a oruc ef â'r cais.",
        e: "Arthur and his hosts set out as far as the fort of Glini, where Eidoel lay in prison. They freed Eidoel, and he joined the search.",
        n: "The hunt for the lost god begins, fittingly, by freeing one prisoner in order to find another." },

      { w: "Yna yd aeth Gwrhyr Gwalstawd Ieithoedd a'r cwmni i geisaw Mabon; a dyfod a wnaethant yn gyntaf at Fwyalch Cilgwri.",
        e: "Then Gwrhyr Interpreter of Tongues and the company set out to seek Mabon; and first they came to the Blackbird of Cilgwri.",
        n: "What follows is the council of the oldest animals — among the most beloved passages in Welsh, and a version of a folk-motif found the world over: a chain of ever-older creatures, each measuring time by the slow wearing-away of something vast." },

      { w: "“Dywed i ni, a wyddost ti ddim am Fabon mab Modron, a ddygwyd yn dair nos oed oddi rhwng ei fam a'r pared?” “Pan ddeuthum i yma gyntaf, yd oedd einion gof yma, a minnau'n aderyn ieuanc; ni wnaethpwyd gwaith arni namyn tra fûm i'n ei churo â'm gylfin bob hwyr; heddiw nid oes ohoni gymaint â chneuen heb dreulaw. Eithr ni chigleu ddim am y gŵr a ofynnwch. Er hynny, mi a'ch tywysaf at genedl hŷn no mi.”",
        e: "“Tell us — do you know anything of Mabon son of Modron, taken when three nights old from between his mother and the wall?” “When I first came here, there was a smith's anvil here, and I was a young bird; no work has been done upon it but my striking it with my beak each evening — and today there is not so much of it left as a nut, all worn away. Yet in all that time I have heard nothing of the man you ask after. Even so, I will guide you to a kindred older than I.”" },

      { w: "At Garw Rhedynfre y doethant. “Garw Rhedynfre, a wyddost ti ddim am Fabon?” “Pan ddeuthum i yma gyntaf, nid oedd namyn un fonllost i mi, ac nid oedd yma o bren namyn un mesen. Tyfodd honno yn dderwen ganghennog, a syrthiodd wedy hynny yn fonyn crin. O'r dydd hwnnw hyd heddiw yr wyf yma, ac ni chigleu ddim am y gŵr. Mi a'ch tywysaf at rai hŷn.”",
        e: "They came to the Stag of Rhedynfre. “Stag of Rhedynfre, do you know anything of Mabon?” “When I first came here, I had but a single tine, and there was no tree here save one oak sapling. It grew into a branching oak, and afterwards fell into a withered stump. From that day to this I have been here, and have heard nothing of the man. But I will guide you to ones older still.”" },

      { w: "At Dylluan Cwm Cawlwyd y doethant. “Tylluan Cwm Cawlwyd, a wyddost ti ddim am Fabon?” “Pan ddeuthum i yma gyntaf, glyn coediog oedd y cwm mawr. Daeth cenedl o ddynion a'i ddiwreiddiaw; tyfodd ail goed, a hwn yw'r trydydd. A'm hadenydd, nid ydynt namyn bonion. O'r dydd hwnnw ni chigleu ddim am y gŵr. Eithr mi a'ch tywysaf at hynaf anifail y byd, Eryr Gwernabwy.”",
        e: "They came to the Owl of Cwm Cawlwyd. “Owl of Cwm Cawlwyd, do you know anything of Mabon?” “When I first came here, the great valley was a wooded glen. A race of men came and rooted it out; a second wood grew; and this is the third. As for my wings, they are mere stumps. From that day I have heard nothing of the man. But I will guide you to the oldest creature in the world — the Eagle of Gwernabwy.”" },

      { w: "At Eryr Gwernabwy y doethant. “Eryr Gwernabwy, a wyddost ti ddim am Fabon?” “Pan ddeuthum i yma gyntaf, yd oedd maen gennyf, ac o'i ben y pigwn y sêr bob hwyr; bellach nid yw namyn dyrnfedd o uchder. Ni chigleu ddim am y gŵr, eithr un tro yr euthum i geisaw bwyd hyd Lyn Llyw; gwân a wneuthum â'm crafanc yn eog, a'm tynnu a wnaeth ef i'r dwfn. Mi a'ch tywysaf ato; ef yw hynaf creadur y byd.”",
        e: "They came to the Eagle of Gwernabwy. “Eagle of Gwernabwy, do you know anything of Mabon?” “When I first came here, I had a stone, and from its top I would peck at the stars each evening; now it is no more than a span high. I have heard nothing of the man — except that once I went to seek food at Llyn Llyw, and struck a salmon with my talon, and he dragged me down into the deep. I will guide you to him; he is the oldest creature in the world.”" },

      { w: "At Eog Llyn Llyw y doethant. “Eog Llyn Llyw, a wyddost ti ddim am Fabon mab Modron?” “Cymaint ag a wn, mi a'i dywedaf. Â phob llanw yd af i fyny'r afon hyd at fur Caer Loyw; ac yno y kefais gymaint o ddrygedd ag ni chefais eirioed. Ac fal y credoch, deled dau ohonoch ar fy ysgwyddau.” A Chai a Gwrhyr a aeth ar ddwy ysgwydd yr eog.",
        e: "They came to the Salmon of Llyn Llyw. “Salmon of Llyn Llyw, do you know anything of Mabon son of Modron?” “As much as I know, I will tell. With every tide I swim up the river to the wall of Caer Loyw; and there I found such wickedness as I never found before. So that you may believe it, let two of you come upon my shoulders.” And Cei and Gwrhyr went upon the salmon's two shoulders.",
        n: "Caer Loyw is Gloucester. Riding the oldest animal in the world to a prison-wall is the tale at its most dreamlike." },

      { w: "Hyd at fur y gaer y nofiasant, ac yno y clywsant gwynfan ac achwyn dirfawr o'r tu arall i'r mur. Heb Gwrhyr: “Pwy yssydd yn cwynfan yn y tŷ maen hwn?” “Och! Mabon mab Modron yssydd yma yng ngharchar; ni charcharwyd neb eirioed mor dost â mi.”",
        e: "They swam to the wall of the fort, and there they heard a grievous wailing and lament from the far side of the wall. Said Gwrhyr: “Who is it that laments in this house of stone?” “Alas! It is Mabon son of Modron who is held here in prison; no one was ever so cruelly imprisoned as I.”",
        n: "Mabon — from Maponos, a youthful god worshipped in Roman Britain — is the divine youth shut out of the world; his freeing reads as a small myth of the return of light." },

      { w: "Drachefn at Arthur y doethant, a managu lle yd oedd Mabon yng ngharchar. Galw a oruc Arthur ei ryfelwyr, a chyrchu Caer Loyw. Tra fu Arthur yn ymladd y gaer, yd aeth Cai a Bedwyr ar ysgwyddau'r eog; a thra fu'r ymladd yn torri'r mur, dug Cai Mabon ar ei gefn allan. A rhydd fu Mabon.",
        e: "They went back to Arthur and told him where Mabon lay imprisoned. Arthur summoned his warriors and fell upon Caer Loyw. While Arthur stormed the fort, Cei and Bedwyr went on the salmon's shoulders; and while the assault broke the wall, Cei bore Mabon out upon his back. And Mabon was free.",
        n: "With Mabon won, the company has the one huntsman who can handle Drudwyn — and the road now runs to the boar Twrch Trwyth himself." },
    ],
   },
   {
    title: "X. The hunt for Twrch Trwyth",
    segments: [
      { w: "Yna y clybu Arthur fod Twrch Trwyth yn Iwerddon. Anfon a oruc Menw mab Teirgwaedd i edrych a oedd y tlysau rhwng dwy glust y baedd, megis y dywedasid.",
        e: "Then Arthur learned that Twrch Trwyth was in Ireland. He sent Menw son of Teirgwaedd to see whether the treasures were truly between the boar's two ears, as had been told." },

      { w: "Yn rhith aderyn yd aeth Menw, a disgyn uwchben ei wâl; a cheisaw cipiaw un o'r tlysau a oruc, ac ni chafas namyn un o'i wrych. Cyfodi a oruc y baedd yn ffroenuchel ac ymysgwyd, hyd pan dasgodd ei wenwyn ar Fenw; ac ni bu Menw byth wedy hynny yn gwbl iach.",
        e: "In the shape of a bird Menw went, and alighted above the boar's lair; he tried to snatch one of the treasures, and got nothing but a single bristle. The boar rose up bristling and shook himself, until his venom spattered Menw; and Menw was never wholly well again after that.",
        n: "Twrch Trwyth, the tale tells us, was a king whom God turned into a swine for his sins — venomous, vast, and with seven young pigs at his side." },

      { w: "Galw a oruc Arthur niferoedd y byd, a mynd i Iwerddon. Naw nos a naw dydd yd ymladdasant â'r Twrch Trwyth a'i seith banw; ac ni laddasant namyn un o'i foch. Difa a oruc y Twrch bumed ran Iwerddon.",
        e: "Arthur called together the hosts of the world and went to Ireland. Nine nights and nine days they fought with Twrch Trwyth and his seven pigs; and they killed but one of his swine. The boar laid waste a fifth part of Ireland." },

      { w: "Anfon a oruc Arthur Wrhyr Gwalstawd Ieithoedd i ymddiddan ag ef yn rhith aderyn. Heb Grugyn Gwrych Eraint, un o'r moch: “Yr Duw a'n gwnaeth ni yn y rhith hwn, ni a awn i wlad Arthur i wneuthur y mwyaf a allom o ddrwg yno.” A mynd dros y môr a wnaethant tu a Chymru.",
        e: "Arthur sent Gwrhyr Interpreter of Tongues to parley with them in the shape of a bird. Said Grugyn Silver-bristle, one of the pigs: “By God who made us into this shape, we will go to Arthur's own land and do there the greatest harm we can.” And they went over the sea toward Wales.",
        n: "The boar and his pigs were transformed kings, and they speak — choosing, out of pure spite, to carry the war into Arthur's own country." },

      { w: "I Borth Cleis yn Nyfed y daeth y Twrch Trwyth i'r tir. A'r nos honno y doeth Arthur hyd Fynyw. A thrannoeth y dywedwyd i Arthur ei fod wedy mynd heibio; a chyrchu a oruc Arthur ar ei ôl â'i nifer a'i gŵn.",
        e: "It was at Porth Cleis in Dyfed that Twrch Trwyth came to land. That night Arthur came as far as Mynyw; and the next day Arthur was told the boar had already passed by, and he set off after him with his host and his hounds." },

      { w: "Yng Nghwm Cerwyn y trodd y Twrch i'w herbyn, ac yno y lladdodd lawer o wŷr Arthur: y cyntaf a laddwyd oedd Gwarthegydd; ac yna y lladdwyd Gwydre, mab Arthur, ac eraill lawer o'i ryfelwyr. Deirgwaith yr ymladdasant ag ef, a llawer a las o bob tu.",
        e: "At Cwm Cerwyn the boar turned to face them, and there he killed many of Arthur's men: the first slain was Gwarthegydd; and there too fell Gwydre, Arthur's son, and many another of his warriors. Three times they joined battle with him, and many were killed on either side." },

      { w: "Oddi yno y gyrrwyd ef o le i le drwy holl Ddyfed a Morgannwg: trwy Fynydd Amanw, a Dyffryn Amanw, a Llwch Ewin, ac Ystrad Yw. Ac ymhob lle yd ymladdwyd ag ef, ac y lladdwyd ei foch un ac un — Twrch Llawin, a Gwys, a Banw, a Benwig — ac y rhoed enw i bob man o'r weithred a wnaethpwyd yno.",
        e: "From there he was driven from place to place across all Dyfed and Glamorgan: through Mynydd Amanw and Dyffryn Amanw, Llwch Ewin and Ystrad Yw. And in every place there was a fight with him, and his pigs were slain one by one — Twrch Llawin, Gwys, Banw and Benwig — and each spot was given its name from the deed done there.",
        n: "Here the tale becomes a place-name litany: much of the hunt is aetiological, explaining how a dozen Welsh hills, valleys and fords came by their names through this one chase. I've kept its shape and a representative handful of the places rather than the full topographic roll — the one stretch I've condensed in the whole tale, and only because it is a catalogue of names, not story." },

      { w: "O'r diwedd y gyrrwyd y Twrch Trwyth tu a Hafren. Heb Arthur: “Yma y caf i ymdaro ag ef, am fy einioes ac am eiddo eraill.”",
        e: "At last Twrch Trwyth was driven toward the Severn. Said Arthur: “Here I shall close with him — for my own life and for the lives of others.”" },

      { w: "Yn nŵr Hafren y kyrchwyd ef. Mabon mab Modron, ar Wyn Mygdwn march Gweddw, a gipiodd yr ellyn oddi rhwng ei ddwy glust; a Chyledyr Wyllt a gipiodd y gwellau. Eithr cyn caffel y grib, y cafas y Twrch y tir â'i draed; ac ni bu na chi na gŵr a allai nesáu ato hyd nes ymysgwyd ohonaw.",
        e: "In the waters of the Severn they fell upon him. Mabon son of Modron, upon Gwyn Dun-Mane, the horse of Gweddw, snatched the razor from between his two ears; and Cyledyr the Wild snatched the shears. But before the comb could be won, the boar got his feet onto dry land, and from that moment neither hound nor man could come near him until he had shaken himself free." },

      { w: "Tu a Chernyw y gyrrwyd ef wedy hynny. A pha gymaint bynnag o ddrwg a gafwyd yn ei geisaw cyn hynny, gwaeth a gafwyd yn ceisaw y grib. Ac o'r diwedd, o anhawster i anhawster, y cafwyd y grib.",
        e: "After that he was driven on into Cornwall. And however much trouble had been met in winning the razor and the shears before, worse was met in winning the comb. But at the last, from one hardship to the next, the comb was taken.",
        n: "Comb, shears and razor — the three treasures from between the boar's ears — are now all won: the chief of Ysbaddaden's tasks is done." },

      { w: "Ac yna y gyrrwyd y Twrch Trwyth o Gernyw, ac yn union i'r môr. Ac o'r dydd hwnnw hyd heddiw ni wybu neb i ba le yd aeth.",
        e: "And then Twrch Trwyth was driven out of Cornwall and straight into the sea. And from that day to this, no one has known where he went.",
        n: "The great boar vanishes into the ocean, undefeated and never seen again — the hunt's wild, unresolved close." },

      { w: "A'r tlysau a ddygwyd at Ysbaddaden Bencawr, fal y gellid ei eillaw erbyn rhoddi Olwen i Gulhwch.",
        e: "And the treasures were carried back to Ysbaddaden Bencawr, so that he might be shaved before Olwen was given to Culhwch.",
        n: "Last of all: the shaving of the giant, the death of Ysbaddaden, and Olwen won at last." },
    ],
   },
   {
    title: "XI. The blood of the Black Witch",
    segments: [
      { w: "Un ac un y kawsid yr anoethau eraill — cleddyf Wrnach, a phair Diwrnach Wyddel, ac ysgithr Ysgithyrwyn — hyd nad oedd weddill namyn gwaed y Widon Ddu, merch y Widon Wen, o Bennant Gofid yng nghyffiniau Uffern.",
        e: "One by one the other wonders had been won — the sword of Wrnach, the cauldron of Diwrnach the Irishman, the tusk of Ysgithyrwyn — until nothing remained but the blood of the Black Witch, daughter of the White Witch, from Pennant Gofid, the Valley of Grief, on the borders of Hell.",
        n: "The tale tells several more winning-episodes — Cei outwitting the giant Wrnach for his sword, the raid on Ireland for Diwrnach's cauldron — which this reading passes over in summary; here we rejoin it at the very last task." },

      { w: "Kychwyn a oruc Arthur tu a'r Gogledd, hyd pan ddoeth i ogof y widon. Mynnu mynd i mewn a oruc Arthur; eithr ei wŷr a'i kynghorasant nad gweddus oedd iddo ymgiprys â gwrach. Anfon a wnaethant Hygwydd a Chacamwri i'r ogof.",
        e: "Arthur set out toward the North, until he came to the witch's cave. Arthur wished to go in himself; but his men counselled him that it was unseemly for him to grapple with a hag. So they sent Hygwydd and Cacamwri into the cave." },

      { w: "Pan ddoethant i mewn, ymafael a oruc y widon ynddunt; gafael yng ngwallt Hygwydd a'i lawr-ladd hyd y llawr. Cacamwri a'i daliodd hi, ond ei churo a oruc hithau ill dau hyd nad oedd un asgwrn cyfan ynddunt, a'u gyrru allan dan ddolef ac ubain.",
        e: "When they came inside, the witch fell upon them; she caught Hygwydd by the hair and dashed him to the ground. Cacamwri laid hold of her, but she beat the two of them until there was not a whole bone left in them, and drove them out howling and shrieking." },

      { w: "Llidiaw a oruc Arthur a mynnu cyrchu drws yr ogof; eithr ei wŷr a'i lluddiasant, a'i anfon ill dau, Amren ac Eidil. Os drwg fu i'r ddau gyntaf, gwaeth fu i'r ddau hyn; ac ni allasai un o'r pedwar fynd oddi yno oni bai eu dodi ill pedwar ar Lamrei, caseg Arthur.",
        e: "Arthur grew angry and made to rush the door of the cave; but his men held him back, and sent in two more, Amren and Eidil. If it had gone badly for the first two, it went worse for these; and not one of the four could have got away from there had they not all four been heaved onto Llamrei, Arthur's mare." },

      { w: "Ac yna y kymerth Arthur ddrws yr ogof, ac o'r drws yd anelodd â Charnwennan, ei gyllell, a tharo y widon ar ei thraws, hyd pan fu yn ddwy gerwyn. A Chadw o Brydyn a gymerth waed y widon, a'i gadw.",
        e: "And then Arthur came to the mouth of the cave, and from the door he took aim with Carnwennan, his knife, and struck the witch across the middle, so that she fell in two halves, like two tubs. And Cadw of Pictland took the witch's blood, and kept it.",
        n: "Arthur kills the hag himself, from the threshold, with his own dagger — and the last of the <em>anoethau</em> is won. Nothing now stands between Culhwch and the shaving of the giant." },
    ],
   },
   {
    title: "XII. The shaving of Ysbaddaden, and Olwen won",
    segments: [
      { w: "Yna y doeth y nifer i lys Ysbaddaden Bencawr, a'r holl anoethau gantunt. A Chadw o Brydyn a ddoeth i eillaw ei farf, kig a chroen hyd yr asgwrn, a'i ddwy glust yn llwyr.",
        e: "Then the company came to the court of Ysbaddaden Bencawr, with all the wonders in their hands. And Cadw of Pictland came to shave his beard — flesh and skin down to the bone — and his two ears outright.",
        n: "The grooming Ysbaddaden demanded is delivered as a flaying: the giant is shaved to the bone, ears and all." },

      { w: "“A eilliwyd di, ŵr?” heb Culhwch. “Eilliwyd,” heb yntau. “Ai eiddof i bellach dy ferch?” “Eiddot. Ac nid rhaid it ddiolch hynny i mi, eithr diolch i Arthur a'i kafas it. O'm bodd fy hun ni chawsit hi byth.”",
        e: "“Are you shaved, man?” said Culhwch. “I am shaved,” said he. “And is your daughter mine now?” “She is. And you need not thank me for it, but thank Arthur, who has won her for you. Of my own will, you would never have had her.”" },

      { w: "“Ac yn awr,” heb Ysbaddaden, “mae'n hen bryd dwyn fy einioes oddi arnaf.” Ac yna y kymerth Goreu mab Custennin ef erfyn y gwallt, a'i lusgo ar ei ôl hyd y domen.",
        e: "“And now,” said Ysbaddaden, “it is high time to take my life from me.” And then Goreu son of Custennin seized him by the hair, and dragged him behind him to the mound." },

      { w: "A thorri ei ben a oruc, a'i ddodi ar bawl y gadlas. A goresgyn a oruc Goreu y gaer a'i holl gyfoeth. Ac felly y dialodd ar Ysbaddaden gam ei dri brawd ar hugain a laddasid.",
        e: "And he cut off his head, and set it on the stake of the bailey. And Goreu took possession of the fort and all its wealth. And so he avenged on Ysbaddaden the wrong of his three-and-twenty brothers whom the giant had killed.",
        n: "Goreu — the one son hidden in the stone chest back in movement V — is the blade the tale kept in reserve. The giant's own nephew takes his head." },

      { w: "A'r nos honno y kysgodd Culhwch gydag Olwen, a hi a fu wraig iddo tra fu fyw. A gwasgaru a oruc niferoedd Arthur, pawb tu a'i wlad ei hun.",
        e: "And that night Culhwch slept with Olwen, and she was his wife as long as he lived. And Arthur's hosts scattered, each man toward his own land." },

      { w: "Ac fal hyn y kafas Culhwch Olwen, merch Ysbaddaden Bencawr. A dyma ddiwedd y chwedl hon.",
        e: "And in this way did Culhwch win Olwen, daughter of Ysbaddaden the Chief Giant. And here ends this tale.",
        n: "So closes <em>Culhwch ac Olwen</em> — the oldest Arthurian story we have — complete, from the pig-run birth to the giant's stake. Twelve movements; the whole tale." },
    ],
   },
  ],
};
