/* Echtra Nerai — "The Adventure of Nera". Old Irish prose, a remscél
   (fore-tale) to the Táin Bó Cúailnge. Two manuscripts: Egerton 1782
   (BL, fo. 71b–73b, early 16th c.) and the Yellow Book of Lecan
   (TCD H. 2. 16, col. 658–662, late 14th c.), both descending from one
   lost archetype; the language is Old Irish of perhaps the 9th–10th
   century, the tale is named in the tale-list of the Book of Leinster
   (LL 245b) before 1200.

   The source column is Kuno Meyer's diplomatic edition of the Egerton
   text, "The Adventures of Nera", Revue Celtique 10 (1889), 212–228 —
   public domain. It was transcribed here from two independent OCR scans
   of that volume (Internet Archive revueceltique10pari and
   revueceltiqu10pari), read against each other line by line, with
   Meyer's italic expansions of manuscript abbreviations silently
   expanded and the Tironian note kept as ⁊. Where both scans fail, the
   note says so. Square brackets are Meyer's or mark the text supplied
   from H. 2. 16 where Egerton skips a line (homoioteleuton). The raw OCR
   of both scans is preserved at source/.

   The English is an original translation, made against Meyer's own
   English of 1889 and checked against the Old Irish; where it departs
   from Meyer the note says why. Attaches to window.NERA. */
window.NERA = window.NERA || {};
window.NERA.tale = {
  meta: {
    blurb: "<strong>Echtra Nerai</strong> — <em>The Adventure of Nera</em> — has a fair claim to be the oldest Samhain ghost story that survives anywhere. It is Old Irish prose, set on <em>aidchi samna</em>, the night of Samhain, at Ráth Crúachan in Connacht, the royal fort of Ailill and Medb; it is one of the <em>remscéla</em>, the fore-tales that explain how the Cattle Raid of Cooley came about. A dare sends a young man named Nera out into the dark to tie a withy round the foot of a hanged man. The hanged man speaks. What follows is a corpse's thirst, three houses, a vision of the fort burned with the heads of the household piled at the door, a road into the hollow hill, a wife among the <em>áes síde</em>, a blind man carrying a lame man to a well where a golden crown is kept, a cow stolen by the Morrígan, a bull-calf that bellows a prophecy — and an ending in which the hero walks back into the mound, and <em>has not come out until now, nor will he come till Doom</em>.<br><br>Below is the <strong>complete tale</strong> in eight movements, following Meyer's numbered sections. The Old Irish is Kuno Meyer's diplomatic edition of the Egerton text (<em>Revue Celtique</em> 10, 1889), transcribed from two scans of the volume read against each other; the raw OCR is preserved at <a href=\"source/meyer-1889-rc10-ocr-a.txt\">source/</a>. The English is an <strong>original translation</strong>.",
    sources: [
      { label: "Kuno Meyer, “The Adventures of Nera”, Revue Celtique 10 (1889) 212–228 — edition and translation (public domain)", url: "https://archive.org/details/revueceltique10pari/page/212/mode/2up", host: "Internet Archive" },
      { label: "The same volume, second scan", url: "https://archive.org/details/revueceltiqu10pari", host: "Internet Archive" },
      { label: "Egerton MS 1782 — the British Library's manuscript of the text", url: "https://www.bl.uk/manuscripts/FullDisplay.aspx?ref=Egerton_MS_1782", host: "British Library" },
      { label: "Echtra Nerai — overview", url: "https://en.wikipedia.org/wiki/Echtra_Nerai", host: "Wikipedia" },
    ],
  },
  roadmap: [
    { t: "Source text transcribed (Meyer 1889, Egerton 1782)", done: true },
    { t: "I · Samhain night at Crúachan: the dare", done: true },
    { t: "II · The hanged man's thirst", done: true },
    { t: "III · The fort in flames; the road into the hill", done: true },
    { t: "IV · Within the síd: the blind man, the lame man, the crown in the well", done: true },
    { t: "V · The warning, and the fruits of summer", done: true },
    { t: "VI · The year between; Nera goes back", done: true },
    { t: "VII · The Morrígan's cow", done: true },
    { t: "VIII · The bull-calf, the sack of the síd, and the one who stayed", done: true },
  ],
  passages: [
    {
      title: "I. Samhain night at Crúachan: the dare",
      segments: [
        { w: "§1. Bui Ailill ocus Meudb aidqi samnoi hir-Raith Cruachan cona techluch huili. Gaibtiur ar bearbad bid leu. Rocrochta da chimid leo al-laa remiu sin. Asmbert Ailill iarum: «Inti domberud tra», ol se, «id im choiss nechtar nada chimmid fil issien croich, rambiatha log lium-so airiu, amuil bied ail do.»",
          e: "Ailill and Medb were in Ráth Crúachan on the night of Samhain, with their whole household. They set about cooking food. Two captives had been hanged by them the day before. Then Ailill said: “Whoever would now put a withy round the foot of either of the two captives on the gallows shall have a reward from me for it — whatever he likes.”",
          n: "<em>aidqi samnoi</em> (normalised <em>aidchi samna</em>) is the night of Samhain, the eve of 1 November; Meyer, writing in 1889, renders it “Halloween” throughout. The <em>id</em> is a withy — a twisted osier band, the cheapest rope there is. Tying one on a hanged man's foot is a dare and nothing more: the reward is for courage, and the whole household understands what this night is." },
        { w: "§2. Ba mor iarum a dorchotai na haidqi sin, ocus a grandatai, ocus doaidbitis demnoie ind oidqi sin dogres. No teged gach fer ar huair huaidib immach dia fromad ina haidqi sin, ⁊ ba hopunn ticced issin tech doridisi.",
          e: "Great was the darkness of that night, and its horror; and demons would always appear on that night. Each man of them went out in turn to try that night — and quickly he came back into the house.",
          n: "The sentence the whole tradition hangs on. <em>doaidbitis demnoi ind oidqi sin dogres</em> — “demons used to show themselves on that night, always”. The verb is habitual: this is not a description of one night but of what Samhain <em>is</em>. A Christian scribe writes <em>demnai</em>, demons; the tale itself will show that what comes out is the people of the síd." },
        { w: "«Rombith-si a loug lat», oll Neroi, «⁊ ragat himmach.» «Rotmbiad mo claidium orduirn-sie eim», ol Ailill.",
          e: "“I'll have the reward from you,” said Nera, “and I'll go out.” “You shall have this gold-hilted sword of mine, then,” said Ailill.",
          n: "Nera's name is given in several spellings in the one manuscript — <em>Nero, Neroi, Neru, Nerai</em> — which is usual for Egerton's “peculiar orthography” (Meyer). The gold-hilted sword is the stake, and it comes back at the end of Movement VI." },
        { w: "§3. Dochomlui ass iarum inti Nero ⁊ gaibiss gaisced maith fair dochum na cimmido. Atnaid iarum id him choiss indaro fiur dona cimbethuib. Docuirethar iarum ina deguid aitherruch co ma tri. Asmbert iarum in cimmith friss, mano thuco menuth taccuir fair, dia m-be aicci co maitin, ni duinfiuth iarum fair a menod fein ind fedo. Atnaig Nero menod taccuir fair iar sin.",
          e: "So Nera went out, and he put good armour on himself, towards the captives. He put the withy round the foot of one of them. It sprang off again — three times. Then the captive said to him that unless he put a proper peg in it, he could be at it till morning and he would never fix it with his own peg. Then Nera put a proper peg in it.",
          n: "This is the moment the story turns. The withy keeps springing off; and then the dead man, hanging, gives practical advice about how to fasten it. Nobody remarks that a corpse is speaking. A <em>menad</em> is a pin or peg for securing a band; the dead man's point is that the withy must be pinned through itself or it will spring loose. Meyer's “proper peg” for <em>menuth taccuir</em> is kept." },
      ],
    },
    {
      title: "II. The hanged man's thirst",
      segments: [
        { w: "§4. Atbert in cimith assin croich fria Nero: «Ferdoi sin, a Nero!» «Feurdo ecin!» ol Nerai. «Ar fir do laechdachtai fritt, nombeir fort muin con-esbiur dich latt. Rombui hito mor form in tan romcrochad.» «Tair eim form muin!» oll Nero. Dotoet iarum for a muin.",
          e: "The captive on the gallows said to Nera: “That's manly, Nera!” “Manly indeed!” said Nera. “By the truth of your valour, take me on your back so I can get a drink with you. I had a great thirst on me when I was hanged.” “Come up on my back, then,” said Nera. So he came up on his back.",
          n: "<em>Ar fír do láechdachta</em> — “by the truth of your warriorhood” — is a formal appeal; a warrior so adjured cannot refuse without shame. The dead man has just been told he is brave; he immediately cashes it in. The hanged man's thirst is a plain physical detail (hanging is death by thirst as well as by the rope), and it is also the oldest thing the dead are said to want." },
        { w: "«Cedh leth notmber?» oll Neuro. «Dontaich iss nessum duinn», or in cimith.",
          e: "“Which way shall I carry you?” said Nera. “To the house nearest us,” said the captive." },
        { w: "§5. Lotar iarum don taich hi sin. Conaccatar iarum ni: in loch tiniuth immon tech sin. «Ni fil ar n-dig hissin tig siu», ol in cimith. «Ni bi teniu gen cogluid ann dogres. Tair riunn don taich aili dono iss nessim duinn», ol in cimith.",
          e: "So they went to that house. Then they saw something: a lake of fire all round the house. “There's no drink for us in this house,” said the captive. “There is never a fire here without its being raked over. Come on to the next house nearest us,” said the captive.",
          n: "<em>teniu gen cogluid</em> — literally “fire without covering”. The Irish hearth was <em>coiglí</em>, “raked” or “smoored”: the embers banked under ash at bedtime so they would keep till morning. The house the dead man cannot enter is the one where that has been done properly; the burning ring round it is the visible face of a domestic rule." },
        { w: "Lotar dono do sidi. Conaccatar dono loch n-uscci imme suidiu. «Na herich don tich sin», ol in cimith. «Ni gnath athinndlad na athfothraccod na ammor co nemiud ann ind aidchi iar cotlud. Tair riund don toig aili beus», or in cimid.",
          e: "They went to the next one. They saw a lake of water all round it. “Don't go to that house,” said the captive. “There's never washing-water or bathing-water or a slop-tub left standing in it at night after bedtime. Come on to the next house again,” said the captive.",
          n: "The second house is protected by having emptied its water. <em>athinnlad</em> is the water left after washing (hands or feet), <em>athfothrucud</em> the water left after a bath, and the <em>ammor co nemiud</em> a tub of filth — the chamber-pot. The tale's lesson is that standing water left overnight is a door. The belief survived into modern Irish folklore as <em>uisce na gcos</em>, foot-water, which must be thrown out before bed lest the dead or the good people come in to it — see the Motifs layer." },
        { w: "«Ata mu dig-siu isin taig siu immoro», or in cimid. Dolleciu de for lar. Tet issin tech. Athinnlat ocus athfothruccud ann, ocus bid dig hi cectar de. Ammor co nemid dana for lar in taige. Ibid dono dig a cechtar na dosuidiu, ⁊ sroithid loimm ndegenach asa beluib im aigthi na ndoini batar hisin tig, conn-apatar uili.",
          e: "“Now — my drink is in this house,” said the captive. Nera let him down onto the floor. He went into the house. There was washing-water and bathing-water in it, and a drink in each of them; and a slop-tub on the floor of the house as well. He drank a draught from each of them, and spat the last mouthful from his lips into the faces of the people who were in the house, so that they all died.",
          n: "The single most frightening sentence in early Irish literature, delivered with no change of tone. The dead man drinks the household's dirty water and spits the last of it over the sleepers, and they die. Nera — who carried him in — is not said to do or feel anything." },
        { w: "Is iar sin tra ni maith athindlat na athfothraccod na teniu gin cogluid na ammor co nemid a taig iar cotlud.",
          e: "And that is why it is not good to have washing-water, or bathing-water, or a fire unraked, or a slop-tub, in a house after bedtime.",
          n: "An aetiology: the tale stops to explain a household rule. This is the kind of sentence that tells you a story was used — told in houses, to people who raked their own fires." },
      ],
    },
    {
      title: "III. The fort in flames; the road into the hill",
      segments: [
        { w: "§6. Dombar iarum sin dochum a rege doridisiu. Ocus dotet Neru for a chulu do Chruachnuib, conn-facco ni. Roloiscthi in dun ar a chiunn ⁊ conn-facco cendail a muinntiri lasna hoccu on dun.",
          e: "Then he carried him back to his torment again. And Nera went back to Crúachan; and he saw something. The fort had been burned before him, and he saw a heap of the heads of its people, cut off by the warriors from the fort.",
          n: "<em>dochum a rége</em> — “to his torment”, i.e. the gallows; H. 2. 16 reads <em>a réigi</em>. Nera dutifully returns the corpse — and comes home to find home gone. The vision of Crúachan burned is the hinge of the tale: it is false tonight, and will be true in a year, unless it is told." },
        { w: "Tet i n-diaig int sluaig iarum ind uaim Cruachan. «Fer hi lorg so», ol in fer deginach fri Nero. «Trummu al-lorg so», ol in fer deginach; ⁊ asbert cech fer fria cheile in focul sin ond fir deginach cusin fer toisiuch.",
          e: "Then he went after the host into the Cave of Crúachan. “A man on the track here,” said the last man of them, of Nera. “The heavier the track,” said the next — and each man passed that word on to his neighbour, from the last man all the way up to the first.",
          n: "<em>Úaimh Chrúachan</em>, the Cave of Crúachan — Oweynagat, “the cave of the cats”, a souterrain and natural fissure still open at Rathcroghan, Co. Roscommon, and known in later tradition as Ireland's gate to hell. The whispered relay down the column — <em>a man on the track; the heavier the track</em> — is pure ghost-story technique: the host knows he is there and does not turn round. Egerton gives the second line to “the last man” again; H. 2. 16 more sensibly gives it to “his comrade”, which is what I translate." },
        { w: "Iar sin dosegatt sid Cruachan ⁊ lotar issin sid. [Gabair taisbenad na cend iarum don rig fiadosom isin sid.] «Cid dogentar don fiur thanuicc lib?» ol fer dib-sium.",
          e: "After that they reached the síd of Crúachan and went into it. [Then the heads were shown to the king, before him, in the síd.] “What shall be done with the man who came with you?” said one of them.",
          n: "The bracketed sentence is missing from Egerton — the scribe's eye jumped from one <em>isin sid</em> to the next — and is supplied, as Meyer supplies it, from H. 2. 16. A <em>síd</em> is a hollow hill, a burial mound, and the people who live inside it; there is no separating the place from its inhabitants." },
        { w: "«Taet ille conn-accallar-su», ol in rig. Dothaet cucco iarum ocus ispert ind rig friuss: «Cid dotucc lasna hocco issin sid?» ol in rig fris. «A comuitecht do sluaig-si», ol Nerai.",
          e: "“Let him come here, so I can speak to him,” said the king. So he came to them, and the king said to him: “What brought you into the síd with the warriors?” “I came in the company of your host,” said Nera." },
        { w: "«Airc don taig ucut tall tra», ol in rig, «ata ben aentomu ann, denud maith frit. Abair fria iss uaim faiter chuici. Ocus tair-siu cach dia co cuail connuid don taig siuo.»",
          e: "“Go to that house over there, then,” said the king. “There's a woman living alone in it, who will be good to you. Tell her it's from me you're sent to her. And come every day to this house with a load of firewood.”",
          n: "The otherworld is unexpectedly ordinary: there is a house to go to, a woman who lives on her own, and a job — fetching firewood. The fairy court is a household like Ailill's, with chores." },
      ],
    },
    {
      title: "IV. Within the síd: the blind man, the lame man, the crown in the well",
      segments: [
        { w: "§7. Dognith-sium iarum innisin amail isbreth friss. Fertair iarum failte friss ⁊ ispert: «Fochen det, masso he in ri rofuid ille.» «Is he eim», oll Nero.",
          e: "He did then as he was told. The woman made him welcome and said: “Welcome to you, if it's the king who sent you here.” “It is he, indeed,” said Nera." },
        { w: "No teged Nero co cuail connuid don dun gach dia. Atchid assin dun immach cach dia ar a chiunn dall ⁊ baccach for a muin. No tegdis co m-bitis for ur na tiprat i n-dorus in duiniu. «In fil ann?» ol in dall. «Fil ecin», oll in baccach. «Tiagam ass!» ol in baccach.",
          e: "Every day Nera used to go with a load of firewood to the fort. Every day he saw coming out of the fort ahead of him a blind man, with a lame man on his back. They would go until they were at the edge of a well in front of the fort. “Is it there?” the blind man would say. “It is, surely,” the lame man would say. “Let's go,” the lame man would say.",
          n: "An image out of a nightmare, and an exact echo: Nera came into this world carrying a dead man on his back; here, every day, a blind man carries a lame one. The exchange at the well is the same three lines each time." },
        { w: "§8. Rofiarfaig Nero iarum inni sin don mnai. «Cidh tathaigit», ol se, «in dall ⁊ in baccach don tiprait?» «Tathuigid in m-barr fil issin tiprait», ol in ben, «.i. mionn n-oir bis for cionn ind rig. Iss ann dochoisiaiar.»",
          e: "Then Nera asked the woman about this. “Why,” he said, “do the blind man and the lame man keep going to the well?” “They go to see to the crown that is in the well,” said the woman — “that is, the golden diadem the king wears on his head. That is where it is kept.”",
          n: "This is the <em>barr Briúin</em>, the Crown of Brión, one of the three treasures of Ireland (§9). The final verb is uncertain in both scans; H. 2. 16 has <em>dochoisecair</em>. The sense — “it is kept there” — is not in doubt." },
        { w: "«Cid armod in dias ucut dotathuiget?» ol Nero. «Ni ansa», ol si, «huair rob iat roba tairisi lassin rig do thathaigid in bairr. Rodallad indara fer ⁊ robaccad araili.»",
          e: "“Why is it those two who go to it?” said Nera. “That's not hard,” said she: “because they are the ones the king trusts to look after the crown. One of them was blinded, and the other was lamed.”",
          n: "The guardians are trusted <em>because</em> they were maimed: alone, neither can reach the crown — a blind man cannot find it, a lame man cannot carry it off — and together they must both agree. It is a terrible, intelligent piece of statecraft, and an Irish cousin of the ancient parable of the blind man and the lame man set to guard a king's orchard (see Motifs)." },
        { w: "«Tair ille biucc», ol Nero fria a mnai, «conn-ecius dam ni do mo imtechtuib colleic.» «Cid dotarfas?» ol in ben. «Ni ansa», ol Nero. «In tan rombaoc tuidecht issin sid, andarlem rohorta Raith Cruachan ⁊ dorochair Ailill ⁊ Medb cona teglach huili ann.»",
          e: "“Come here a moment,” Nera said to his wife, “so you can tell me something about my adventures now.” “What was it appeared to you?” said the woman. “Not hard,” said Nera. “When I was coming into the síd, I thought Ráth Crúachan had been sacked, and Ailill and Medb had fallen there, with their whole household.”",
          n: "“His wife” — the tale has quietly married him to the woman of the house, without a ceremony, between one sentence and the next." },
      ],
    },
    {
      title: "V. The warning, and the fruits of summer",
      segments: [
        { w: "«Ni fir eim on», ol in ben, «acht is sluag siabrae dotainicc. Firfaigthir inni sin», ol si, «mano foilset-som dia chelib.»",
          e: "“That is not true,” said the woman, “but it was a host of phantoms that came to you. That will come true,” she said, “unless he tells it to his friends.”",
          n: "<em>slúag síabrae</em> — a phantom host, a host of <em>síabra</em>, the otherworld folk in their uncanny aspect. The vision is not a lie but a forecast: what Nera saw is what will happen next Samhain, unless warning is given. Notice the woman shifts to the third person — <em>unless he tells</em> — as if speaking a rule rather than to her husband." },
        { w: "«Cinnus berut-si robud dom muinntir?» ol Nero. «Eircc a n-dochum», ol si. «Atat immon caire cetno beus, ⁊ ni tallad in lucht don tenid cuse.»",
          e: "“How shall I warn my people?” said Nera. “Go to them,” said she. “They are still round the same cauldron, and the stuff has not yet been taken off the fire.”",
          n: "The famous time-slip. Back at Crúachan, the household are still standing round the same pot: no time has passed. Most later fairy-time tales run the other way (a night in the hill is a hundred years outside); Nera's runs this way, and his year inside will be a real year." },
        { w: "Sech bao hairem tri laa ocus teoro n-aidqi leissium bui issin tsid. «Abair friu, airichlithir immon samfuin-si dothaet, mana taesat-som do orgain in sidiu; ar dorairngeiriud doib-sium on: orguin in sido do Ailill ocus do Meidb ocus in barr Briuin do brith doib ass.»",
          e: "And yet it had seemed to him three days and three nights that he had been in the síd. “Tell them to be on their guard at the coming Samhain, unless they come to destroy the síd first. For I promise them this: the síd to be sacked by Ailill and by Medb, and the Crown of Brión carried off by them out of it.”",
          n: "Here the fairy wife does something extraordinary: she tells her mortal husband how her own people can be destroyed — and promises it. Why she does so the tale never says. Meyer construes the end of the speech as her promise; I follow him." },
        { w: "§9. [Ised tredi frith hi suidiu .i. cetach Loeguiri hind-Ard Macho ocus in barr Briuin la Connachto ocus ind enach Dunlaithe la Laigniu hi Cill Daro.]",
          e: "[These are the three things that were found in it: the mantle of Lóegaire in Armagh, and the Crown of Brión among the Connachta, and the shirt of Dúnlang among the Leinstermen in Kildare.]",
          n: "A scribal gloss that has crept into the text, bracketed by Meyer: the three wonderful treasures of Ireland, two of them by now kept as relics in great churches (Armagh, Kildare). It is repeated at the very end." },
        { w: "§10. «Cinnus cretfider uaim-si techt hissin sid?» ol Nero. «Beir toirthe samruid latt», ol in ben. Dobert iarum crem leis ocus sobairche ocus buiderath.",
          e: "“How will it be believed of me that I've been into the síd?” said Nera. “Take the fruits of summer with you,” said the woman. So he took with him wild garlic, and primroses, and golden fern.",
          n: "The proof-tokens are summer plants on the night summer ends — <em>crem</em> (wild garlic, ramsons), <em>sobairche</em> (primrose), <em>buiderath</em> (“yellow fern”, perhaps bracken gone gold, or a buttercup-like plant: uncertain). Inside the hill it is still summer. Nothing could look more out of place on 1 November in Connacht." },
        { w: "«Et biam torruch-so uaitt», ol si, «ocus berot mac duit. Ocus domhisiu fis-scel huait, in tan ticcfoi do muinnter do orguin in sidui, co ruco do muinntir ocus do chetra assin sid.»",
          e: "“And I will be with child by you,” said she, “and I'll bear you a son. And send word to me when your people are coming to sack the síd, so that you can take your family and your cattle out of the síd.”",
          n: "She has already planned for both outcomes: her people's destruction, and her own family's escape from it." },
      ],
    },
    {
      title: "VI. The year between; Nera goes back",
      segments: [
        { w: "§11. Luid Nero iarum co a muinntir, conus-fuair imon coire cetno. Ocus atfet scelo doib. Ocus dobretha do iarum a claidim, ⁊ anuis lia a muintir co cenn m-bliadna iar sin.",
          e: "Then Nera went to his people, and found them round the same cauldron. And he told them the news. And then his sword was given to him, and he stayed with his people until the end of a year.",
          n: "The dare is paid out in full: Ailill's gold-hilted sword." },
        { w: "Is hi in bliadain sin dana intsainrud luidi Fergus mac Roich a crich hUloth for longais co hAilill ocus Meidb co Cruachna Ai. «Tainicc do dal tra, a Nero», oll Ailill fria Nero. «Eircc co tucca do muinntir ⁊ do cetra assin tsid, conn-icsim-ni do orguin in tsido.»",
          e: "That was the very year in which Fergus mac Róich came out of the land of Ulster, in exile, to Ailill and Medb at Crúachan of Aí. “Your time has come, Nera,” said Ailill to Nera. “Go and bring your family and your cattle out of the síd, so that we can go and sack the síd.”",
          n: "The single sentence that bolts this ghost story on to the Ulster Cycle: Fergus's exile is the precondition of the Táin. From here the tale stops being only a Connacht Samhain story and becomes a <em>remscél</em> — one of the fore-tales that explain the great war over the Brown Bull." },
        { w: "§12. Teit Nero iarum co mnai issin sid ⁊ ferais a ben failte friss. «Eircc ass tra don dun», ol a ben fria Nero, «⁊ ber cuail connuid lat. Atu-sa bliadain lain oc a athigid co cuail connaid for mo muin cech dia tar t'eisiu, ⁊ atrubart iss i n-galur robadu-se. ⁊ unnsi do mac sunn ucut dono.»",
          e: "Then Nera went to his wife in the síd, and she made him welcome. “Go out now to the fort,” his wife said to Nera, “and take a load of firewood with you. I've been going there a whole year with a load of firewood on my back every day in your place, and I said you were sick. And there's your son over there, too.”",
          n: "She has carried his firewood for a year and lied to her king for him. The domestic texture of this — a fairy wife covering for an absent husband at work — is unlike anything in the Welsh tales." },
        { w: "Teid-sium ass iarum don dun ⁊ beirid cuail connaid leiss for a muin. «Fochen do betho assin galur hi rabo!» ol ind rig. «Olc lium immoro in ben do feiss lat cin athcomarc.» «Dogentar do riar-so im sodain», ol Nero. «Ni bud hannsa duit-si on», ol in ri.",
          e: "So he went out to the fort and took a load of firewood on his back. “Welcome — alive, out of the sickness you were in!” said the king. “But I'm displeased that the woman should sleep with you without my being asked.” “Your will shall be done in that,” said Nera. “That won't be hard for you,” said the king.",
          n: "A wry, unsettling little exchange. The king's “it won't be hard for you” is the last thing he says in the tale — about a man who has come back, in fact, to arrange his destruction." },
        { w: "Dotaet dia tig for culo. «Ingair tra do bu aniud», ol in ben. «Doratus boin dib dot mac iarna gein fochetoir.» Tet Nero dana lia a cetra in laa sin.",
          e: "He went back to his house. “Now, herd your cows today,” said the woman. “I gave one of them to your son straight after he was born.” So Nera went out with his cattle that day." },
      ],
    },
    {
      title: "VII. The Morrígan's cow",
      segments: [
        { w: "§13. Beirid in Morrigan iarum boin a mic-seom cein buisium ina chotlud, condrodart in Dunn Cuailgne thair hi Cuailgne. Dotoet cona buin doridisi anair. Nosstairthenn Cuculaind hi Muig Muirtemne oc tuidecht tairiss.",
          e: "Then, while he was asleep, the Morrígan took his son's cow, and the Brown Bull of Cúailnge bulled her, away in the east in Cúailnge. She came back again from the east with her cow. Cú Chulainn overtook her on the plain of Muirthemne as she was crossing it.",
          n: "Nera falls asleep minding the cows, like any herd-boy, and the war-goddess takes one. The cow is carried across Ireland to be put to the Donn Cúailnge — so that her calf will be the son of the bull the Táin is fought over. This is the episode told at greater length in <em>Táin Bó Regamna</em>, which Meyer prints as a companion piece." },
        { w: "[Ar ba do geissib Conculaind, cet teit ben asa thir, manip aurderc leis. Ba dia geissib enlaith do thogailt a thiri, mani facbatis ni leiss. Ba dia geissib iascc ind inberuib, muni thuitidis laiss. Ba dia geisib oic echtarchiniuil ina thir, mad i n-agaid thistis, cen imacallaim forru ria matain, mad fria laa thistais, cen imacallaim fria matain. Nach ingen macdacht ⁊ nach ben aentama nobid la hUltu, is for a inchuib-seom no bitis noco n-airailtis for feraib. It e gessa Conculaind in sin.]",
          e: "[For it was one of Cú Chulainn's <em>gessa</em> that even a woman should leave his country without his knowing it. It was one of his gessa that birds should feed on his land unless they left something with him. It was one of his gessa that fish should be in the river-mouths unless they fell to him. It was one of his gessa that warriors of another people should be in his country without his challenging them — before morning if they came by night, before night if they came by day. Every grown girl and every unmarried woman in Ulster was under his protection until they were promised to husbands. Those are the gessa of Cú Chulainn.]",
          n: "A list of Cú Chulainn's <em>gessa</em> (singular <em>geis</em>), the binding prohibitions placed on a hero — bracketed by Meyer as an interpolation. Egerton writes “before morning” for both clauses; the sense needs H. 2. 16's <em>re n-aidchi</em>, “before night”, for the second, and that is what is translated." },
        { w: "Doairthenn Cuculaind in Morrigan cona buin ⁊ asbert: «Ni berthar ind imirge!» ol Cuculaind.",
          e: "Cú Chulainn overtook the Morrígan with her cow, and he said: “This drove will not be taken!”",
          n: "The tale gives no more. In <em>Táin Bó Regamna</em> the encounter becomes a quarrel, the Morrígan turns into a black bird on a branch, and she tells Cú Chulainn how she will come against him in the war to come: as an eel, a wolf, a white heifer — and the calf she carries will be the occasion of it." },
        { w: "§14. Dothaet Nera ass iarum fescur dia thig cona buaib. «Tomesta bo mo mic tra», ol se. «Ni mo du do dul-sa do ingairiu fon ait sin», ol a ben frissim. Tanic in bo fo sodain.",
          e: "Then Nera came home in the evening with his cows. “My son's cow is missing,” he said. “I didn't deserve that you should go and herd the cows like that,” his wife said to him. And just then the cow came.",
          n: "A marriage, in one line: <em>I didn't deserve that of you</em>." },
        { w: "«A ingnad tra, can dodeochaid in bo sa?» «Dodeochaid em», ol in ben, «a Cuailngne iarna tairbiud don Dunn Cuailngne. Erg ass tra», ol in ben, «nachas fogluaisit do oic», ol si. «Forremdeth in coibden hisiu a m-bledna cusin samain aitherrach. Dotiasait aidqi shamna aitherruch, ar it aursluictiu side hErenn dogres im samain.»",
          e: "“A wonder, now — where has this cow come from?” “She has come,” said the woman, “from Cúailnge, after being bulled by the Brown Bull of Cúailnge. Go out now,” said the woman, “in case your warriors set out. This company cannot set out this year, until the next Samhain. They will come on Samhain night next: for the síde of Ireland are always open at Samhain.”",
          n: "<em>ar it aursluicthi síde hÉrenn dogrés im samain</em> — “for the fairy-mounds of Ireland are always opened about Samhain”. This is the single clearest statement in medieval Irish of the belief that underlies everything we now call Halloween: on that night, and only then, the hills stand open. Note again the habitual <em>dogrés</em>, “always”." },
      ],
    },
    {
      title: "VIII. The bull-calf, the sack of the síd, and the one who stayed",
      segments: [
        { w: "§15. Dothet Neru dochum a muintire. «Canas tuthchaid?» or Ailill ⁊ Medb frie Neru, «ocus cait hi rabaduis o duchuduis uainn?» «Roba a tirib cainib», ol Neri, «co setuib ocus muinib moraib, co n-imboth bruitt ocus biid ocus set n-ingnad. Doragat du for n-orccuin oidqi samnoi dotoet, mano foillsigther doib.» «Rosnicfim-ne eim», ol Ailill.",
          e: "Nera went to his people. “Where have you come from?” said Ailill and Medb to Nera, “and where have you been since you went from us?” “I was in fair lands,” said Nera, “with great treasures and riches, with plenty of clothes and food, and wonderful treasures. They will come to destroy you on the Samhain night that's coming — unless it's been revealed to you.” “We shall get to them first,” said Ailill.",
          n: "Nera's report of the otherworld is a list of riches — and, in the same breath, a warning that its people mean to kill everyone at Crúachan. He does not say what he left there." },
        { w: "Biit ann tra co cenn m-bliadna. «Manotdfuil ni tra isin sid», ol Ailill, «a Nero, co tucco ass.» Treiss laa iarum ria samuin co tucc a imirgi assin tsid.",
          e: "So they stayed there till the end of the year. “If you have anything in the síd,” said Ailill, “Nera, bring it out.” And on the third day before Samhain Nera brought his drove out of the síd." },
        { w: "Amail dodechaid iarum in tairbiniu assin sith — .i. loeg bo Aingen; Aingene ainm a mic-sium — adaig a tri geimenna ag in tairbin. Is hi sin huair robui Ailill ocus Fergus ac imbirt fithchilli. Co cualatar ni: geim in tairbini hissin mag. Is ann ispert Fergus:",
          e: "Now as the bull-calf came out of the síd — the calf of the cow of Aingen; Aingen was the name of his son — the bull-calf gave three bellows. At that very hour Ailill and Fergus were playing at <em>fidchell</em>. And they heard something: the bellowing of the bull-calf on the plain. Then Fergus said:",
          n: "The calf is the son of the Brown Bull of Cúailnge, got on the Morrígan's errand. <em>Fidchell</em>, “wood-wisdom”, is a board game, probably of the tafl family — kings at war on a board, on the eve of a real one." },
        { w: "§16. «Ni bud inmuin limm ind ag / geissius hissin Cruachanmag, / mac Duib Chuailngne conodsoid, / macan in tairb o Loch Loig. / Bet loegain de cin buin / i m-Bairchi hi Cuailgniu: / cichis reim roirge ind rig / do ag aide Aingini.»",
          e: "“I do not like the calf<br>that bellows on Crúachan's plain —<br>the Black Bull of Cúailnge's son, who comes this way,<br>the young son of the bull from Loch Lóig.<br>There will be calves without cows<br>on Bairche in Cúailnge;<br>the king will march a ... march<br>for the sake of Aingen's calf.”",
          n: "Fergus's verse, in the oracular <em>rosc</em>-adjacent style of the Ulster Cycle: he hears in a calf's bellow the war to come — the Táin, in which the cattle of Ulster will be driven off and calves left motherless. The seventh line is obscure; Meyer left a gap, and so do I. Fergus is the right man to hear it: an Ulsterman in exile, about to guide Medb's army into his own country." },
        { w: "§17. [Aingene ainm ind fir ocus Be Aingeni ainm na mna, ocus ba hinunn [.....] atcondairc inti Nero forru ocus atconnairc Cuculainn hi Tain Bo Regamna.]",
          e: "[Aingen was the name of the man and Bé Aingeni the name of the woman; and the shape in which Nera saw them was the same as that which Cú Chulainn saw in <em>Táin Bó Regamna</em>.]",
          n: "Another bracketed gloss, tying this tale to its sister. One word here is unreadable in both scans of Meyer's text (I mark it [.....]); his translation gives “appearance”. In <em>Táin Bó Regamna</em> Cú Chulainn meets a red woman in a chariot and a big man driving a cow with a forked hazel staff, and the red woman is the Morrígan. So the glossator thought the otherworld pair Nera dealt with (here given the names Aingen and Bé Aingeni, though §15 makes Aingen the son) were the same pair. If he was right, the woman who keeps house for Nera in the hill is the war-goddess herself. The tale says nothing of it." },
        { w: "§18. Condrecat iarum in toirbine ocus in Finnbennach hi Muig Cruachan. La ocus adaig doib hi comruc ann sin gurro moig forsin toirbine fodeoig. Beccistair in tairbini iarum in tan ro mebuid fair.",
          e: "Then the bull-calf and the Whitehorn met on the plain of Crúachan. A day and a night they were fighting there, until at last the bull-calf was beaten. And the bull-calf bellowed when it was beaten.",
          n: "The <em>Finnbennach</em>, the White-horned Bull of Connacht, Ailill's bull — whose rivalry with the Brown Bull is the whole point of the Táin." },
        { w: "«Ced ro bhecustair ind ag?» ol Medb fria a buachaill. Buaiglu a ainm sidein. «Ro fetar-so ni, a mo bopa, a Fergus, as sin laid ro gabuis imbuaruch», ol Bricriu. Doneco Fergus seco la sodain ocus bentai sethnu a chinn do Bricriu cona durn, co lotar na coic fir fichilli batar hi n-durn Fergusa hi cenn m-Bricrenn, co m-bo buan d'olc do.",
          e: "“What did the calf bellow?” said Medb to her cowherd — Buaigle was his name. “I know something about that, my dear old Fergus,” said Bricriu — “it's that song you sang this morning.” At that Fergus glanced aside and struck Bricriu on the side of the head with his fist, so that the five <em>fidchell</em> pieces that were in Fergus's fist went into Bricriu's head, and it was a lasting injury to him.",
          n: "Bricriu Poison-Tongue, the Ulster Cycle's troublemaker, needles Fergus about his song of the morning — and gets the game-pieces in his skull. A burst of brutal comedy before the end; the Táin itself remembers the wound (Meyer's note to his line 175)." },
        { w: "«Apair frim, a Buaidliuo, cid isrubairt in tarb», ol Medb. «Adubairt eim», ol Buaigliu, «mad a athair-sium tissad do chomrucc friss .i. Dunn Cuailgne, ni fonn-arnaigfed ind Ai ⁊ no mebaid fair reme fo Mag n-Ai huili gach leth.»",
          e: "“Tell me, Buaigle, what the bull said,” said Medb. “It said this,” said Buaigle: “that if its father were to come to fight with him — the Brown Bull of Cúailnge — the Whitehorn would not be left standing in Aí, but would be beaten before him across the whole plain of Aí, on every side.”",
          n: "The cowherd interprets the bellow. An animal's cry read as prophecy — the beaten calf promising its father's vengeance." },
        { w: "Is ann sin ispert Medb o bes luige: «Tonga na dea thongus mo thuath, na tairinnfet ⁊ na coitelfat for cluim na colccaid, ⁊ ni bom blathcha, ⁊ ni cainfuirim mo taib, ⁊ ni cainairbiur dergflatha na finn, ⁊ nirom-airbiur biuth, ronamrabat na da tharb sin ar mo ubelaib a comracc.»",
          e: "Then Medb said, in the manner of an oath: “I swear by the gods my people swear by, that I will not lie down, nor sleep on down or on a flock-bed, nor drink buttermilk, nor ease my side, nor drink red ale or white, nor taste food, until I see those two bulls fighting before my eyes.”",
          n: "Medb's vow is the Táin in embryo: the whole war will be fought so that she can see the two bulls meet. The formula <em>Tongu do dia toinges mo thúath</em>, “I swear by the god my people swear by”, is the classic heroic oath of the Ulster Cycle — a pagan oath preserved by Christian scribes. This speech is the least secure stretch of my transcription: several verb-forms are printed as the scans give them, and the translation leans on Meyer's." },
        { w: "§19. Iar sin tra tiaguit Connachta ⁊ in dublongius hissin sid, gurairgsiut in sith ⁊ co tucsiut ass a m-bui ann, ⁊ co tucsiut ass in m-barr m-Briuin iar sin. Is hi sin tra in tres ascaid issa amra ind-hErinn, ⁊ cetach Loegaire ind-Ard Macho ⁊ enech Dunlainge la Laigniu hi Cill Daro.",
          e: "After that the Connachta and the Black Exiles went into the síd, and sacked the síd, and took away everything that was in it; and then they took away the Crown of Brión. That is the third wonderful gift in Ireland — with the mantle of Lóegaire in Armagh, and the shirt of Dúnlang among the Leinstermen in Kildare.",
          n: "<em>in dublongius</em>, the Black Exile — Fergus and the Ulster exiles who came with him. The sack is told in one sentence. The vision of Movement III has been reversed exactly: not Crúachan burned by the síd, but the síd sacked by Crúachan, because the vision was told." },
        { w: "Forfagbad Nero tra cona muinntir ina sid, ⁊ ni tainic ass cose, ocus ni thicfa co brath. Finit.",
          e: "And Nera was left with his people in the síd, and he has not come out until now; and he will not come out till Doom. <em>Finit.</em>",
          n: "The last line, and the reason this is a ghost story rather than a war story. <em>His people</em> — <em>a muinntir</em> — are now his wife and son and cattle in the hill; it is the same word the tale used for the household of Crúachan. The hero who betrayed the síd goes back into it and stays, and is presumably there still: <em>ni thicfa co bráth</em>, he will not come till Judgement Day. H. 2. 16 ends: <em>conid remscél do Thána Bó Cúailnge sin</em>, “so that this is a fore-tale of the Táin Bó Cúailnge”." },
      ],
    },
  ],
};
