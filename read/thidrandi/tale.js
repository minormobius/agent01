/* Þiðranda þáttr ok Þórhalls — "The Tale of Þiðrandi and Þórhallr".
   Old Norse-Icelandic prose, a short episode (þáttr) set in East
   Iceland in the last years before the conversion of c. 999/1000. It
   survives inside the Greatest Saga of Óláfr Tryggvason (Óláfs saga
   Tryggvasonar en mesta, c. 1300), most fully in Flateyjarbók
   (GKS 1005 fol., written 1387–94), whose text this is. Njáls saga
   (c. 1280) already remembers Þiðrandi as the man the dísir killed.

   The source column is the diplomatic edition of Flateyjarbók by
   Guðbrandur Vigfússon and C. R. Unger, vol. I (Christiania, 1860),
   pp. 418–421, chapters 335–336 — public domain. Transcribed from the
   Internet Archive scan (Flateyjarbok, 1. b. 1860), keeping the
   edition's spelling (u for v, j for í, æ for ei, z clusters) and
   correcting only OCR noise: the doubled drop-capital (Þþ), stray
   footnote markers, and a handful of misread letters, each of which is
   noted where it matters. The raw OCR is preserved at source/.

   The English is an original translation. Attaches to window.THIDRANDI. */
window.THIDRANDI = window.THIDRANDI || {};
window.THIDRANDI.tale = {
  meta: {
    blurb: "<strong>Þiðranda þáttr</strong>, <em>the Tale of Þiðrandi</em>, is a short Old Norse ghost story from the edge of the conversion of Iceland. At <em>vetrnætr</em>, the Winter Nights of mid-October that open the Norse winter, the chieftain Hallr of Síða gives his autumn feast. His friend Þórhallr the seer warns the whole house that nobody must go out that night, whatever knocks. Late in the night something knocks three times. Hallr's eldest son Þiðrandi, eighteen, courteous and the best-loved young man in the East Fjords, cannot bear to leave a guest standing at the door, so he takes his sword and goes out. From the north ride nine women in black with drawn swords. From the south ride nine in white on white horses. The black ones reach him first.<br><br>It is told as true. The people are real, the farm is real, and Hallr of Síða will be one of the first great men of Iceland to be baptised. The seer's explanation is the most unsettling thing in it. These were the family's own <em>dísir</em>, their guardian spirits, taking their last tribute before the new faith came. The tale ends with the seer smiling at a window as <em>many a hill opens</em> and the old powers pack up and leave. Below is the <strong>complete episode</strong> in seven movements. The Old Norse is the 1860 diplomatic edition of Flateyjarbók, and the English is an <strong>original translation</strong>.",
    sources: [
      { label: "Flateyjarbók, ed. Guðbrandur Vigfússon & C. R. Unger, vol. I (1860), pp. 418–421 (public domain)", url: "https://archive.org/details/Flateyjarbokensa4fc93f5d-b3bf-4c75-b62f-3243911eddfcv1FlatReyk", host: "Internet Archive" },
      { label: "Flateyjarbók (GKS 1005 fol.) — the manuscript", url: "https://handrit.is/manuscript/view/is/GKS02-1005", host: "handrit.is" },
      { label: "Þiðranda þáttr ok Þórhalls — overview", url: "https://en.wikipedia.org/wiki/%C3%9Ei%C3%B0randa_%C3%BE%C3%A1ttr_ok_%C3%9E%C3%B3rhalls", host: "Wikipedia" },
    ],
  },
  roadmap: [
    { t: "Source text transcribed (Flateyjarbók I, 1860)", done: true },
    { t: "I · The seer and the chieftain", done: true },
    { t: "II · The seer falls silent", done: true },
    { t: "III · The Winter Nights feast", done: true },
    { t: "IV · The knock; riders from the north and the south", done: true },
    { t: "V · Moonlight and frost", done: true },
    { t: "VI · The reading", done: true },
    { t: "VII · Many a hill opens", done: true },
  ],
  passages: [
    {
      title: "I. The seer and the chieftain",
      segments: [
        { w: "Fra Þidranda. Þorhallr het madr norrænn. hann kom til Jslandz a dögum Hakonar jalls. hann tok land j Syrlækiarosi ok bio a Hörgslande. Þorhallr uar madr frodr ok miog framsynn ok var kalladr Þorhallr spamadr.",
          e: "Of Þiðrandi. There was a man called Þórhallr, a Norwegian. He came to Iceland in the days of Earl Hákon. He made land at the mouth of the Sýrlækur and lived at Hörgsland. Þórhallr was a wise man and saw far ahead, and he was called Þórhallr the Seer.",
          n: "<em>framsýnn</em>, “far-seeing” or foresighted, and <em>spámaðr</em>, “prophet” or seer. Earl Hákon ruled Norway c. 975–995, so this is the last generation before the conversion. Hörgsland is in the south-east, below the Síða district. Its name contains <em>hörgr</em>, a heathen altar or cairn, which seems apt for a seer's farm." },
        { w: "Þorhallr bio þa a Hörgslande en Siduhallr bio at Hofui j Alftafirde, ok var med þeim hin mesta uinatta. gisti Hallr a Hörgslande huert sumar er hann kom til þings. Þorhallr for oft til hæimboda austr þangat ok uar löngum þar.",
          e: "Þórhallr lived at Hörgsland then, and Síðu-Hallr lived at Hof in Álftafjörður, and there was the greatest friendship between them. Hallr stayed at Hörgsland every summer on his way to the Althing, and Þórhallr often went east to feasts there and stayed a long time.",
          n: "<strong>Hallr of Síða</strong> (Síðu-Hallr) is one of the best-documented chieftains of the conversion era. He appears in <em>Njáls saga</em> and <em>Kristni saga</em>, and Ari's <em>Íslendingabók</em> counts him among the leading men at the Althing that adopted Christianity. His farm is <strong>Hof</strong>, “temple”, a common name for farms that held a heathen temple. The friendship of a seer and a temple-chieftain is the old order in miniature." },
        { w: "Sonr Hallz hinn ellzsti het Þidrande. hann uar manna uænstr ok efniligazstr. unni Hallr honum mest allra sona sinna. Þidrande for landa a medal þegar hann hafde alldr til. hann uar hinn uinsælsti huar sem hann kom, þuiat hann uar hinn mesti atgiorvimadr, litilatr ok blidr vit alþydu ok huert barn.",
          e: "Hallr's eldest son was called Þiðrandi. He was the handsomest of men and the most promising, and Hallr loved him most of all his sons. Þiðrandi travelled between countries as soon as he was old enough. He was the best-liked man wherever he came, because he was very accomplished, modest, and gentle with ordinary people and with every child.",
          n: "The saga does not usually spend this much on a young man's character. Þiðrandi's best qualities, his gentleness and modesty and his kindness to everyone, are the ones that will kill him. He will not leave a guest at the door." },
      ],
    },
    {
      title: "II. The seer falls silent",
      segments: [
        { w: "Þat uar æitt sumar at Hallr baud Þorhalli vin sinum austr þangat, þa er hann ræid af þinge. Þorhallr for austr litlu sidar, ok tok Hallr uel uid honum sem hann uar uanr, med hinum mesta blidskap. dualdizst Þorhallr þar um sumarit, ok sagde Hallr at hann skyllde æigi fyrr hæim fara en lokit uære haustbode.",
          e: "One summer Hallr invited his friend Þórhallr to come east with him when he rode home from the Assembly. Þórhallr came east a little later, and Hallr received him well, as he always did, with the greatest warmth. Þórhallr stayed there that summer, and Hallr told him he must not go home until the autumn feast was over.",
          n: "<em>haustboð</em>, the autumn feast. In the farming year it falls when the animals that cannot be fed through the winter are slaughtered. Bede's name for the English November, <em>Blótmonath</em>, “sacrifice-month”, points at the same season." },
        { w: "Þat sumar kom Þidrande vt j Berufirde, þa var hann atian vetra. for hann heim til fodur sins, ok dadduzst menn þa enn miog at honum sem oft adr ok lofudu atgerui hans. en Þorhallr spamadr þagde jafnan þa er menn lofudu hann mest.",
          e: "That summer Þiðrandi came home to Iceland at Berufjörður. He was eighteen winters old. He went home to his father, and people admired him greatly, as they often had before, and praised his accomplishments. But Þórhallr the Seer always fell silent when people praised him most.",
          n: "Iceland counted ages in winters. The seer's silence while everyone else praises the boy is the first chill in the tale, and it touches a belief found all over the north: too much praise is dangerous to the one praised." },
        { w: "Þa fretti Hallr hui þat sætti, «þuiat mer þikir þat merkiligt er þu mælir.» Þorhallr suarar: «ekki gengr mer þat til þess at mer mislike nokkurr hlutr vid hann edr þig, eda ek siai sidr en adrir menn hans uænleik ok atgerui; helldr berr hitt til at margir lofa hann, hefir hann ok marga hluti til þess, þoat hann virde sig litils sialfr. kann uera at hans nioti æigi leingi, ok mun þer þa ærin eftirsia at vm son þinn suo uel mannadan, þoat æigi lofui firir þer allir menn hans atgerui.»",
          e: "Then Hallr asked why that was — “because I think what you say is worth marking.” Þórhallr answered: “It isn't that I dislike anything about him or about you, or that I see his good looks and gifts any less than other people do. It is rather that so many people praise him. And he has a great deal to be praised for, though he thinks little of himself. It may be that he will not be with you long. And then you will have grief enough over a son so well made, without everyone praising his gifts to you.”",
          n: "The seer's answer is kind and terrible at once. He is not refusing to praise the boy. He is trying to spare his friend more grief than he will already have." },
        { w: "En er aleid sumarit tok Þorhallr at ogledjazst. Hallr spurde hui þat sætti. Hann segir: «illt hygg ek til haustbods þessa, þuiat mer bydr suo firir at spamadr mune vera drepinn at þeirre ueitzslu.»",
          e: "As the summer wore on, Þórhallr grew gloomy. Hallr asked why. He said: “I have a bad feeling about this autumn feast, because it comes to me that a seer will be killed at that feast.”",
          n: "<em>mér býðr svá fyrir</em>, “it presents itself to me”: the idiom for a premonition. Notice exactly what he says. A <em>spámaðr</em> will be killed. Neither of them takes him to mean anyone but himself." },
        { w: "«Þar kann ek at gera græin a», sagde bonde. «ek a uxa æinn .xij. uetra gamlan, þann er ek kalla Spamann, þuiat hann er spakare en huert naut annat, en hann skal drepa at haustbodinu. ok þarf þig þetta æigi at ugledia, þuiat ek ætla at þessi min uæitzsla sem adrar skal þer ok öllum minum monnum uerda til sæmdar.»",
          e: "“I can sort that out,” said the farmer. “I have an ox, twelve winters old, that I call Seer, because he is wiser than any other beast. He shall be slaughtered at the autumn feast. So you needn't be gloomy about it; I mean this feast of mine, like the others, to bring honour to you and to all my people.”",
          n: "A wonderful, desperate joke. Hallr tries to fulfil the prophecy harmlessly by killing an old ox nicknamed <em>Spámaðr</em>. It is the oldest move in the prophecy story, the attempt to satisfy the wording and dodge the meaning (Thompson's M370, vain attempts to escape a prophecy). The ox is also the feast's sacrifice: autumn slaughter and heathen offering are the same act." },
        { w: "Þorhallr suaradi: «ek finn ok æigi þetta til af þui at ek væri hræddr um mitt lif, ok bodar mer firir mæiri tidende ok undarligri, þau er ek mun æigi at sinne upp kueda.» Hallr mællti: «þa er ok ekki firir at bregda ueitzslunne.» Þorhallr suarar: «ekki mun þat gera at mæla, þuiat þat mun fram ganga sem ætlat er.»",
          e: "Þórhallr answered: “I don't say this because I'm afraid for my own life. It foretells greater and stranger news to me, which I will not speak out for now.” Hallr said: “Then there's no need to call off the feast.” Þórhallr answered: “There's no use saying so, because what is meant will come to pass.”",
          n: "<em>þat mun fram ganga sem ætlat er</em>, “it will go forward as it is intended”. That is the Norse fatalism of the sagas in a single sentence. The seer knows, and does not say, and does not try to stop it." },
      ],
    },
    {
      title: "III. The Winter Nights feast",
      segments: [
        { w: "Ueitzslan uar buin at uetrnattum. kom þar fatt bodsmanna, þuiat uedrit uar huast ok uitgerdarmikit.",
          e: "The feast was made ready at the Winter Nights. Few of the invited guests came, because the weather was harsh and stormy.",
          n: "<strong>vetrnætr</strong>, the Winter Nights: the start of the Icelandic winter half-year, falling in the second half of October. Sagas set sacrifices (<em>dísablót</em>, <em>álfablót</em>) and great feasts at this time. The OCR reads <em>ueirnattum</em>, an obvious misreading of <em>uetrnattum</em>. Bad weather keeps the guests away and leaves the house half-empty and listening for arrivals." },
        { w: "En er menn settuzst til borda um kuelldit, þa mællti Þorhallr: «bidia uillda ek at menn hefde mitt rad um þat, at æingi madr kæmi vt a þessi nott, þuiat mikil mein munu a liggia ef af þessu er brugdit; ok huerir hlutir sem verda j bendingum, gefui menn æigi gaum at, þuiat illu mun furda ef nökkurr anzar til.»",
          e: "When people sat down at table in the evening, Þórhallr said: “I would ask everyone to take my advice: that no one go outside tonight. Great harm will follow if anyone breaks this. And whatever things happen as signs, let no one pay attention to them, because it will turn out badly if anyone answers.”",
          n: "The <strong>interdiction</strong>, stated before the whole household, with its exact terms. Don't go out, and don't respond to any signal. <em>bendingar</em> are signs or beckonings. The rule is about answering, as much as about the door." },
        { w: "Hallr bad menn hafa ok hallda ord Þorhallz, «þuiat þau riufazst ekki», segir hann, «ok er vm heilli bezst at bua.»",
          e: "Hallr told everyone to take Þórhallr's words and keep them — “because they never fail,” he said, “and it is best to keep on the side of good luck.”",
          n: "<em>um heilli er bezt at búa</em>, “it's best to keep on the side of luck”: a proverb of practical caution. The chieftain backs the seer completely. Nobody in the house fails to understand the warning." },
        { w: "Þidrandi gek vm bæina; uar hann j þui sem odru miukr ok litilatr. En er menn gengu at sofa, þa skipade Þidrande gestum sæng sina, en hann slo ser nidr j seti yzst vid þile.",
          e: "Þiðrandi served the drinks round the hall; in this as in everything he was gentle and modest. And when people went to bed, Þiðrandi gave his own bed to the guests and lay down on the bench furthest out, by the wooden wall.",
          n: "<em>yzt við þili</em>, “outermost, against the panelling”, meaning the place nearest the door. His courtesy puts him in the one spot where he will hear the knock first." },
      ],
    },
    {
      title: "IV. The knock; riders from the north and the south",
      segments: [
        { w: "En er flestir menn voru sofnadir, þa var kuatt dyra, ok let æingi madr sem visse; ok for suo þrysuar.",
          e: "And when most people had gone to sleep, there was a knock at the door. No one let on that he had heard it. And so it went, three times.",
          n: "<em>kvatt dura</em>, “the door was hailed”: the ordinary way a visitor announced himself at an Icelandic farm. The OCR's <em>kualt</em> is a misreading of <em>kuatt</em>. Everyone heard it, and everyone pretended not to. The tale is never more frightening than in this sentence, a whole hall full of people lying still and listening." },
        { w: "Þa spratt Þidrandi upp ok mællti: «þetta er skam mikil at menn lata her allir sem sofui, ok munu bodsmenn komnir.» Hann tok suerd j hond ser ok gek vt.",
          e: "Then Þiðrandi sprang up and said: “It's a great shame that everyone here is pretending to be asleep — it'll be guests arriving.” He took a sword in his hand and went out.",
          n: "This is the violation, and its motive is a <em>virtue</em>. In a culture where hospitality was a sacred duty, ignoring guests at the door in a storm is shameful (<em>skömm mikil</em>). He breaks the seer's rule in order to keep an older one. He takes his sword, so he is not a fool either." },
        { w: "Hann sa öngan mann. kom honum þa þat j hug at nökkurir bodsmenn munde hafa ridit firir heim til bæiarins, ok ridit sidan aftr j moti þeim er seinna ridu.",
          e: "He saw no one. Then it came into his mind that some of the guests might have ridden on ahead to the farm and then ridden back to meet the ones coming behind.",
          n: "The reasonable explanation, which he supplies for himself. Sensible people in ghost stories do this, and it does not save them." },
        { w: "Hann gek þa undir uidarkostinn, ok heyrde at ridit uar nordan a uollinn. hann sa at þar uoru konur .ix., ok voru allar j suortum klædum ok höfdu brugdin suerd j hondum.",
          e: "He went then into the shelter of the woodpile, and heard riding from the north onto the home-field. He saw that there were women there, nine of them, all in black clothes, and they had drawn swords in their hands.",
          n: "<em>viðarköstr</em>, the woodstack: the winter's fuel piled by the house. The <em>völlr</em> is the home-field, the mown grass round the farmhouse. North, in Norse cosmology, is the direction of the giants and of Hel. The OCR has <em>suðrtum</em> for <em>svörtum</em>, “black”." },
        { w: "Hann heyrde ok at ridit uar sunnan a uollinn; þar voru ok .ix. konur, allar j liosum klædum ok a huitum hestum.",
          e: "He heard too that someone was riding from the south onto the home-field. There were nine women there as well, all in bright clothes and on white horses.",
          n: "Two companies of nine riding in from opposite directions on the same field: black from the north, white from the south. The white women have <em>no swords</em> in the text." },
        { w: "Þa uillde Þidrande snua inn aftr ok segia monnum synina. Þa bar þar at fyrr konurnar þær hinar suartklæddu ok sottu at honum, en hann uardizst uel ok dreingiliga.",
          e: "Then Þiðrandi wanted to turn back in and tell people what he had seen. But the black-clad women got there first and attacked him, and he defended himself well and like a man.",
          n: "<em>fyrr</em>, “first”, is the hinge word. It was a race, and the white riders lost it. <em>drengiliga</em>, bravely and honourably; the word gives him a warrior's death in his own home-field." },
      ],
    },
    {
      title: "V. Moonlight and frost",
      segments: [
        { w: "Langri stundu sidarr uaknade Þorhallr ok spurde huort Þidrandi uekti, ok uar honum æigi suarat. Þorhallr quad þa mundu ofsofit.",
          e: "A long while later Þórhallr woke and asked whether Þiðrandi was awake, and there was no answer. Þórhallr said they must have slept too long.",
          n: "<em>ofsofit</em>, “over-slept”, meaning slept through something. The seer knew a seer would be killed, and he too slept through it." },
        { w: "Uar þa vt gengit. uar a tunglskin ok frostuidri. Þeir fundu Þidranda liggia særdan, ok uar hann borinn jnn.",
          e: "So they went out. There was moonlight and frost. They found Þiðrandi lying wounded, and he was carried in.",
          n: "<em>tunglskin ok frostviðri</em>, moonlight and frosty weather. The storm that kept the guests away has gone, and the field lies clear and white. It is the only description of the weather on the night itself, and the tale gives no more than that." },
        { w: "Ok er menn hofdu ord uit hann, segir hann þetta allt sem firir hann hafdi borit. Hann andadizst þann sama morgin j lysing, ok var lagdr j haug at fornum sid heiðinna manna.",
          e: "And when they spoke with him, he told them all that had appeared to him. He died that same morning at first light, and he was laid in a mound after the old custom of heathen men.",
          n: "He lives long enough to be a witness, which is how the tale can know what happened by the woodpile. He is the last of the family buried <em>at fornum sið</em>, the old way, in a mound. The next generation will lie in churchyards. His mound joins the hills that the last movement says are opening." },
        { w: "Sidan var halldit frettum um manna ferdir, ok uissu menn ekki uonir vvina Þidranda.",
          e: "Afterwards inquiries were made about people's movements, and no one knew of any enemies of Þiðrandi.",
          n: "A legal, practical sentence: someone was killed, so they look for a killer. There is no human one. A saga normally follows a killing with a feud, and here the investigation simply finds nothing." },
      ],
    },
    {
      title: "VI. The reading",
      segments: [
        { w: "Hallr spurde Þorhall hueriu gegna munde þessi hinn undarligi hlutr. Þorhallr suarar: «þat væit ek æigi, en geta ma ek til at þetta hafui öngar konur uerit adrar en fylgiur ydrar frænda.»",
          e: "Hallr asked Þórhallr what this strange thing could mean. Þórhallr answered: “I don't know. But I can guess that these were no other women than the fylgjur of your kin.”",
          n: "<em>fylgjur</em>, “followers”: the attendant spirits of a person or a family, seen as animals or as women and usually just before a death. The seer says <em>I don't know… but I can guess</em>, and the tale keeps his reading clearly marked as interpretation." },
        { w: "«Get ek at her komi sidaskipti, ok mun þessu næst koma sidr betri hingat til landz. ætla ek þær diser ydrar er fylgt hafua þessum atrunade nu hafua vitat firir sidaskipte, ok þat at þær munu verda afhendar þeim frændum. nu munu þær æigi una þui at hafa önguan skatt af ydr adr þær skiliazst vid, ok munu þær hafua þetta j sinn hlut. en hinar betri diser mundu uilia hialpa honum, ok kuomuzst æigi uit at suo bunu.»",
          e: "“I guess that a change of faith is coming here, and that after this a better faith will come to this land. I think those dísir of yours who have followed this old belief knew beforehand of the change of faith, and that they will be cast off by your family. Now they would not bear to have no tribute from you before they parted, and they will have taken this as their share. But the better dísir would have wanted to help him, and could not reach him in time.”",
          n: "The centre of the whole tale. <em>siðaskipti</em>, “change of custom”, is the Icelandic word for the conversion. The black dísir are the family's own guardian powers of the old religion. They know they are about to be abandoned, and they take a <em>skattr</em>, a tax or tribute, on the way out, which is the best son of the house. The white dísir belong to the new faith and arrive too late. So the old gods are not called demons here. They are a family's household spirits, wronged and departing. The OCR's <em>alrunade</em> is read as <em>átrúnaði</em>, “faith”." },
        { w: "Nu bodade þessi atburdr firir sem Þorhallr sagde, ok margir hlutir þuilikir, þenna fagnadartima sem eftir kom, at allzualldande gud læit miskunnar augum a þenna lyd er Jsland bygde, ok leysti þat folk firir sina eyrendreka af longu fiandans þrældome, ok læiddi sidan til samlags eilifrar erfdar sina elskuliga sonu, sem hann hefir hæitit ollum þeim er honum vilia þiona med stadfestu godra verka.",
          e: "Now this event foretold, as Þórhallr said, and so did many other such things, the joyful time that came after, when God Almighty looked with the eyes of mercy on the people who lived in Iceland, and freed that people through his messengers from the long slavery of the fiend, and afterwards led his beloved sons into the fellowship of the eternal inheritance, as he has promised to all who will serve him with steadfastness in good works.",
          n: "Here the compiler's voice takes over. The register shifts from saga prose to the sermon style of the 14th century, with its long periods and its <em>allsvaldandi guð</em>. For him the dísir story is a sign of the coming conversion." },
        { w: "Suo ok æi sidr synde vvinr allz mannkyns opinberliga j slikum hlutum ok morgum ödrum þeim er j frasagnir eru færdir, huersu naudigr hann let laust sitt ranfænge, þat er at skilia þann lyd er hann hafdi adr allan tima halldit hertekinn j villuböndum sinna boluadra skurgoda, þa er hann hneykti med slikum ahlaupum sinnar grimdarfullrar ræide a þeim sem hann hafde uölld yfir, sem hann uisse nalgazst sina skam ok makligan skada sins herfangs.",
          e: "And no less did the Enemy of all mankind show openly, in such things and in many others that are set down in stories, how unwillingly he let go his plunder, that is to say the people he had always before held captive in the bonds of error of his accursed idols; for he struck at those he had power over with such onslaughts of his savage fury, as he knew his shame was drawing near, and the just loss of his spoils.",
          n: "The second reading flatly contradicts the first. For Þórhallr the black women were the family's own guardian spirits taking their due. For the compiler they were the Devil, lashing out as he lost Iceland. The tale keeps both, side by side, without reconciling them, which is how the belief of one age gets preserved inside the faith of the next. Þórhallr's reading is the one that frightens, because in it the thing that killed Þiðrandi had looked after his family for generations." },
      ],
    },
    {
      title: "VII. Many a hill opens",
      segments: [
        { w: "En Halli þotti suo mikit laat Þidranda sonar sins at hann unde æigi leingr at bua at Hofui. færde hann bygd sina til Þuottár.",
          e: "And Hallr took the loss of his son Þiðrandi so hard that he could not bear to live at Hof any longer. He moved his household to Þvottá.",
          n: "He leaves the farm called “Temple”. Þvottá means “washing river”, and tradition (<em>Kristni saga</em>, <em>Njáls saga</em>) says Hallr and his household were baptised there by the missionary Þangbrandr, and that the river took its name from that baptism. The move from Hof to the place of washing is the conversion told as geography." },
        { w: "Þat uar einn tima at Þuotta, þa er Þorhallr spamadr uar þar at hæimbode med Halli. Hallr la j huilugolfui en Þorhallr j annare rekkiu, en gluggr var a huilugolfinu.",
          e: "Once at Þvottá, when Þórhallr the Seer was staying there as Hallr's guest, Hallr was lying in the bed-closet and Þórhallr in another bed, and there was a window in the bed-closet." },
        { w: "Ok æinn morgin er þeir uoktu badir, þa brosti Þorhallr. Hallr mællte: «hui broser þu nu?» Þorhallr suarar: «af þui brosi ek at margr hollr opnaz, ok huert kuikuendi byr sinn bagga, bæde sma ok stor, ok gera fardaga.»",
          e: "And one morning, when they were both awake, Þórhallr smiled. Hallr said: “Why are you smiling now?” Þórhallr answered: “I am smiling because many a hill is opening, and every living creature is packing its bag, small ones and great, and they are making their flitting.”",
          n: "The last image in the tale, and its strangest. <em>fardagar</em> are the legal “moving days” of the Icelandic year, the four days in late May when tenants changed farms and everyone carried their goods to a new house. The seer looks out of the window and sees the land-spirits (the <em>landvættir</em>, the people of the hills) moving out of Iceland like tenants whose lease has ended. It is the exact counterpart of <em>Echtra Nerai</em>'s <em>the síde of Ireland are always open at Samhain</em>. In both tales the hills open. In Ireland they open every year and something comes out. Here they open once and everything leaves." },
        { w: "Ok litlu sidar urdu þau tidende sem nu skal fra segia. Þangbrandr kom til Jslandz ok baud cristni.",
          e: "And a little after that came the news that will now be told: Þangbrandr came to Iceland and preached Christianity.",
          n: "The next chapter begins Þangbrandr's mission, and Hallr of Síða is his first great convert. Þórhallr the Seer, it is said elsewhere in the same compilation, also took the faith. The þáttr has been a prelude all along: it is the old world's last night." },
      ],
    },
  ],
};
