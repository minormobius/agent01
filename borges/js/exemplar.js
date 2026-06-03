/* borges — THE EXEMPLARS. Hand-authored gold-standard tellings: the book's
   seven-teller overture. Pages 1–7 are exactly one tale per teller (Luna,
   Mercury, Venus, Sol, Mars, Jupiter, Saturn), so this set is both the canonical
   content for those pages and a complete few-shot voice library for the live
   render. Each is a faithful retelling of its deterministic spec — same teller,
   frame, cast, desire, movement titles, set-pieces and flagged remixes — so the
   mythograph posted before the telling still matches it. No em-dashes; each in
   its teller's own voice. Two uses: a finish/voice reference in the prompt, and
   the pre-seeded telling served for /t/<n>.
   Attaches to BORGES.exemplars (keyed by n); BORGES.exemplar aliases tale 1. */
(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var B = NS.BORGES = NS.BORGES || {};
  B.exemplars = {

    1: {
      n: 1, teller: "Luna", title: "Yemelya and a firebird whose feather lit a hall",
      frame: "The Slaying at the Water", model: "hand-authored", createdAt: "2026-06-01T00:00:00.000Z",
      movements: [
        { title: "I. How it stood at the river of the dead",
          body: "Listen, lordlings, though there be no lords here but the long dark; or so I dreamed it, or the wane of it, I forget which. This is a Finnic tale with the Slavic smuggled into it, a slaying at the water, out of the days when a song could hammer iron or sink a boat. There dwelt at the river of the dead one Yemelya, and the days were good while they lasted, as days are. The trouble, when it came, wore a kinsman's face, which is the worst door trouble ever comes in by: Lemminkäinen, of Yemelya's own blood, born (they said) upon the knee of the air." },
        { title: "II. The lack that walked the land",
          body: "Lemminkäinen took what was wanted and was gone, and the want of it was a wound the whole country felt, the way a cold is felt in the teeth. Word came to Yemelya by Vasily the Reckless, and was taken up that same hour: this wrong is mine to mend. So the quest was set, to win back the boat that sailed by singing and to bring home Ilmatar, who is the one the whole tale turns upon. And I will tell you now, for I have dreamed the end of it, that this would be no fight of blades but a chase of shapes; and that Yemelya would gather the gifted along the road, each with a single impossible skill, and not one of them yet knowing which skill would be wanted." },
        { title: "III. The road out",
          body: "Now hear how Yemelya set out from the river of the dead with little but a name and a need, and the road took the rest, as the road will. At the edge of the first wood stood Väinämöinen the Ill-Fated, who knew the worth of a traveller, and he gave into Yemelya's hand a ball of yarn that rolled the road ahead of its own accord. Guard it, the old one said, and spend it but the once. And chance leaned Yemelya's way so plainly thereafter that the whole country remarked the thumb upon the scale." },
        { title: "IV. The struggle at the ford",
          body: "Not long after came the meeting it had always been coming to, Yemelya against Lemminkäinen, and the ground between them going quiet. They closed not with blades but as a chase of shapes, hawk after dove and pike after otter, every shape answered by its hunter, until the yarn was spent on the one throw it was good for and Yemelya had the better of him. A mark was taken in it, a wound that would not be hidden after, and the mark was the true coin of the deed. Then they raised the mound high and broad over what had fallen, to be seen far off by folk on the water, and laid the deeds in over the bones; for that, the old tales hold, is the only deathlessness they will grant their mortals. And the singing boat Yemelya lifted from under the very breath of the firebird whose feather had lit the hall, and was three fields gone before the snoring broke." },
        { title: "V. The stolen boast",
          body: "But while the true Yemelya was still on the long road home, Ilmarinen the Smith of Heaven came first to the river of the dead, bearing a head and a heart and a token, and the lie that the deed had all been his. The hall half believed him, for he came with proofs in his hands and the true one bore only the road's grey dust; and Ilmatar alone kept faith, against the whole hall's verdict, and would not give the absent one up for lost. The water remembered it longer than the shore did, the way the water does." },
        { title: "VI. The task that sorts true from false",
          body: "So a task was set, by the old king Koschei, to sort the true from the false, the old impossible kind: to lift the stone, to string the bow, to name the thing that none could name. Yemelya, come home at the last, took it up like a familiar tool, and it was plainly the right hand upon it. And Ilmarinen, seeing how it stood, confessed the whole lie at once and unbidden, out of nothing but boredom, which robbed the scene of every drop of its drama and disappointed the hall entirely. Then there was a wedding and a crowning, and the line went on, which is how the old reels do like to close a door; and the long chase of shapes ended where such chases end, in the one shape the other had no shape to answer. I have told it twice already, and shall tell it otherwise next month; and whether she woke at all, the dream-log does not say." }
      ]
    },

    2: {
      n: 2, teller: "Mercury", title: "The Game at the market of every tongue",
      frame: "The Exchange of Blows", model: "hand-authored", createdAt: "2026-06-02T00:00:00.000Z",
      movements: [
        { title: "I. How it stood at the market of every tongue",
          body: "Quick now, before Saturn times me out, for this is the fortieth telling of it and the best yet, which is a lie, but a useful one. You have heard this tale, though not the way I will bend it tonight: a thing out of the West African manner with the Japanese smuggled in under the cloak, of one blow given and a whole year stood between the giving and the taking of it back. Hearken, and you shall hear a marvel, and a swindle, which in my mouth are the one word. Now Ananse the Spider kept the hall at the market of every tongue in those years, and kept it well, for he understood the single thing the market runs on, which is that a word, once said aloud, is a debt; and that is the beginning of our tale." },
        { title: "II. The fair-seeming snare",
          body: "Then came Momotarō, the Sky-God's debtor, the worker of the harm to come, and he smiled the particular smile that always means there is a clause in it somewhere, and laid a fair-seeming wager on the board. And Ananse, because a tale needs someone to, signed the soft bargain unread, and the hook set in him deep. For here is a thing the old reels hold: the wager was got up as fair sport, with friendly faces all round the board, and the losing of it was fixed and sealed before ever the first die was thrown." },
        { title: "III. The one thing forbidden",
          body: "And the word was laid on Ananse then by Kintarō the Lion's son, the eldest at that hall and the keeper of its rules: by no means open a magic gourd that fed a country or famished it, and by no means cross down into the dragon palace beneath the wave. One rule, said the old one, and a single rule in a tale is the hinge the whole door swings on. Mark the rule. We will come back for it." },
        { title: "IV. The road out",
          body: "Now there was a going-down to the knees and a clasping of them, and the holy name was named in the asking, for a suppliant cannot be turned away without a cost that comes due later, and Ananse knew the price of asking better than any man living. So he rode out toward the dragon palace beneath the wave, and the hall watched the dust of him until there was no more dust to watch. And on the road stood Otohime of the crossroads, the keeper of the way, and she asked of him a courtesy, or a cruelty refused, or a riddle, for that is the toll the road takes of everyone; and Ananse did the kind thing without stopping to weigh it, which is the only way that particular toll is ever paid." },
        { title: "V. The meeting at the dragon palace beneath the wave",
          body: "By and by Ananse and Momotarō met at the ford, and there were no more words to spend between them, only the old account to settle. Now here the tale does a thing for the joke of it: the hero asked, very reasonably, not to be branded this time, no scar, no mark, thank you kindly; and for once the tale allowed it, and the whole hall afterward felt the strange lack of a wound where a wound by rights should sit. For Ananse had no strength in him to match Momotarō, not an ounce of it, and so he used the better tool, which is the head; and folk add that he went in the grey cloak of a pilgrim, which every door opens to and no guard ever thinks to search. And the trick was never the trick; the trick was that you were all of you watching the trick." },
        { title: "VI. The knowing run round the hall",
          body: "Then Mmoatia the Wisdom-Hoarder, a friend at the worst hour, cried it out: it is the hero, it was the hero the whole time, look at him. And without more ado the road's grime washed off Ananse and something kingly stood up underneath it, as if it had been standing there the entire walk. The counsel of it came folded in a riddle, as the best counsel always does, and cost a year to read out straight. And when they offered him the best of the market of every tongue for what he had done, Ananse would take nothing, for the deed, he said, was the wage, and the word kept was the whole of the winning. And the message, of course, was the messenger; and the moral, if you must have one, is filed under someone else's name. My reel is run out; another shall thread the next." }
      ]
    },

    3: {
      n: 3, teller: "Venus", title: "The Penance and the Finding",
      frame: "The Slandered Innocent", model: "hand-authored", createdAt: "2026-06-02T00:00:00.000Z",
      movements: [
        { title: "I. A forest of ascetics and the setting of it",
          body: "And it was the season when the orchards held their breath, which is the season I love best to begin in. This is a tale after the Indic manner with the Arabian smuggled sweetly in, of a lie told at a gate and the long penance walked after it, in the reign of a king the storytellers all loved. There is a tale on the wind tonight, and I have caught the warm end of it first, as I always do. In a forest of ascetics there dwelt Trishanku of the lotus, and the days were good while they lasted, as the good days are; and it is said that Zubaidah the Bodhisattva, the one this whole tale turns upon, rode past once at a pace no pursuit could match, for the faster she was chased the further she was gone." },
        { title: "II. The feast and the crowning",
          body: "So it stood that there was a wedding, and a crowning, and the line went on, which is how the old reels like to open a door as well as close one. For love is the oldest engine, older than us by far, and it had set its patient hand to the turning of that small world. The boards were laid and the lamps burned late, and a garden was planted between the two of them; and all was made sweet, for a season." },
        { title: "III. The empty place at the board",
          body: "But Duban, who had once bargained with death himself, the old raja of that forest of ascetics, went over the water on some grey errand and left the hall unwarded behind him, and that unguarded door was the very door the trouble came in by. And the trouble, when it came, wore the strangest shape that ever I carried in a tale: a fierce small thing, no taller than a churn, that swore it would carry off the child unless its own name were guessed inside of three nights. Believe it as you list; I only tell what was told to me." },
        { title: "IV. The false claim in the hall",
          body: "Then of a sudden Vikram the Riddle-Solver, the false claimant, stood up in the hall and claimed the bride and the praise both, having done nothing in his life but arrive first, which is a talent of a kind. Yet only the right word, gently asked, ever halted Zubaidah where all the hard chasing had failed; and within the marked ring no hand could fall on Trishanku, by a law older than the hall and stronger than the king's own will. So the lie sat down in the high seat, and the truth stood in the dust at the back, and the hall could not yet tell the one from the other." },
        { title: "V. The wound that told the tale",
          body: "Not long thereafter Trishanku took a mark in it, a nick at the throat, a ring closed on the hand, a small scar that would tell the rest of the story ever after, when no tongue would. For the body keeps the account the mouth denies; and the copper of the coin and the copper of the kiss were the same metal, the one paid out and the other kept back. Mark the wound, as you marked the small fierce name; we are near the sewing-up now." },
        { title: "VI. The road out",
          body: "At the very edge of it Trishanku stood, where the one world stops and the other begins, and went over; for the crossing of that line is the whole of what a hero is for, or so the men of that country said. And when the time was full come he set out from the forest of ascetics with little but a name and a need, and the road took the rest, as the road will. And Yunan the Just, a friend at the worst hour, brought him the long way round to a brass city standing in the sand, where the trouble kept its house; and under that same city, it is said, dwelt the folk who forge what cannot be forged above, and they owed Trishanku a making." },
        { title: "VII. The knowing run round the hall",
          body: "Then Yunan cried it out: it is the hero, it was the hero all along, only look at him. And the lie of Vikram came apart in three plain sentences, as such lies always do once the true hand is back in the room. So Trishanku was made new before them, the rags fell from him and a king stood up where a beggar had stood, though who can ever say which was the truer shape. And the small fierce name was guessed at the third asking, and the named thing tore itself clean in two for the rage of being known; and the cleared name was set back over the right head at last. So they kept a garden between them all their days; and the reconciling cost more than the war had, and was worth more." }
      ]
    },

    4: {
      n: 4, teller: "Sol", title: "The Braided Tale",
      frame: "The Braided Tale, in Two Arcs", model: "hand-authored", createdAt: "2026-06-02T00:00:00.000Z",
      movements: [
        { title: "I. How it stood at the river that parts kingdoms",
          body: "The Sun being lord of the seven lamps, and I its keeper, let me give you a bright one. And the crown in this tale was no idle gold, mark that from the start. This is the braided tale, after the Persian manner, out of the reigns the book of kings remembers, and it runs twice over: the two turnings of Zal, the one cast and then the second; and I will tell you the turns as they come to me, not as the dull clock would lay them, for a braided thing is meant to be read in its crossings. Now Zal the World-Seeker kept the hall at the river that parts kingdoms, and kept it well, and that is as good a place as any to begin." },
        { title: "II. The harm done",
          body: "So here is the first turning. The harm was done to that hall, and done plainly; though here the tale shakes itself for the joke of it, for the villain, having done the harm, felt so badly of it afterward that he sat down and wrote out a letter of apology, which is in no copy of Propp that I have read, and which is nonetheless exactly what happened. And Zal took the quest up before the week was out, to win back a feather that summoned the great bird, and to bring home Sindukht who was raised by that bird, the one this turning of the tale stands upon. And he granted the boon before ever it was named, whatever you ask you shall have, which is a king's habit and a king's danger both." },
        { title: "III. Toward the mountain where the bird nests",
          body: "Now hear how Zal set out from the river that parts kingdoms with little but a name and a need, and the road took the rest of it, as the road will take it of any man, be he king or beggar or both at the once." },
        { title: "IV. The meeting at the mountain where the bird nests",
          body: "Then came the boasting, each naming his line and his deeds and what his hand would do to the other, for among such folk half the war is fought in words before ever a blade is drawn. And it came to the meeting it had always been coming to: Zal against Esfandiyar the Champion, the worker of the harm, and the ground between them going still. And the light fell so; and the creature went down, or yielded up its pledge, and the long fear of that mountain was over; and Sindukht was won back, and the feather restored, and the hunger of the kingdom fed at last. And the joke that Esfandiyar had set sprang back upon Esfandiyar, which is the whole of the justice the funny tales allow." },
        { title: "V. The hook in the bargain",
          body: "Now the second turning, for I told you it ran twice. Of a sudden Esfandiyar put on a kind face and offered Zal a bargain with a hook hid in the soft of it; and Zal, being who he was, granted it before the naming, whatever you ask you shall have, and so gave away the feather that summoned the great bird and the half of the river that parts kingdoms along with it. And the hand of Sindukht herself was set up as the prize of a contest, to the one who could outlast all the rest at it; so the thing once won was put back upon the board to be won again." },
        { title: "VI. What the donor gave",
          body: "And here the tale plays its second trick on its own hero. For the magical agent that Rudabeh the White-Haired pressed into his hand, the great gift, the thing he had gone so far to be given, turned out to be a cup that showed the seven climes, which is the single most useless object in all the long reels, and Zal was simply stuck with it. Believe it as you list; there are those who will swear to the cup. And worse, he set out carrying a sealed letter, trusting the very hand that had sealed it." },
        { title: "VII. The struggle at the ford",
          body: "Then Zal closed with a dragon laid athwart the road in the mountain where the bird nests, and the whole world narrowed to the reach of one arm. And it ended in a breath, as such things do: Esfandiyar beaten, the field gone still, the thing that could not be done, done. And then the letter was read out at the road's end, and it had asked, in plain unhurried words, for the death of the very man who carried it. Yet the gold that Zal had given away all down the road came back to him as light, and lit the place where he stood." },
        { title: "VIII. The knowing run round the hall",
          body: "Then Faramarz of the bronze body, a friend at the worst hour, cried it out: it is the hero, it was the hero all along, look. And the marriage was made and the kingdom set on Zal's shoulders, and the tale shut its book upon a full hall; and the naming, when at last it came, carried off the bride and the half of the hall in one breath. For a king is only the lamp the people agree to gather round; and what Zal gave was never once lessened by the giving. Here I lay the tale down, for the lamp is low; but his name is a lamp in the long reels yet." }
      ]
    },

    5: {
      n: 5, teller: "Mars", title: "How Atalanta Was Won Twice",
      frame: "The Animal Bride, Lost and Won Back", model: "hand-authored", createdAt: "2026-06-02T00:00:00.000Z",
      movements: [
        { title: "I. How it stood at the island of the sorceress",
          body: "Iron, then. A tale with an edge on it, and the edge turned inward. Hellenic work, with the Indic smuggled in under the hammer, of a bride who flew and was won a second time, in the age of heroes, when the gods still walked in to dinner uninvited. An edge. A blow. A debt paid, and not in coin. That is the shape of it. The boards were set and groaned, and the cup went round sunwise, and every soul was placed by rank, which in a tale is never an idle thing. In the island of the sorceress there dwelt Sudhana the Stranger-Guest, and the days were good while they lasted. They did not last." },
        { title: "II. The scouting of the ground",
          body: "Then Glaucus, tamer of the winged horse, the worker of the harm to come, came to the gate asking soft questions, the kind that map a house for a later and a darker night. Sudhana gathered the gifted to him on the road, each with one impossible skill and none of them knowing yet which skill would be wanted. And he left a bright blade standing in a tree: while it shone, he lived. Mark the blade. Iron keeps the account." },
        { title: "III. The donor on the road",
          body: "There was a going-down to the knees, the holy name named in the asking, for no suppliant is turned away without a cost that comes due later. On the road stood Vikram, born of the shower of gold, the keeper of the way, and he set a small strange test before he would name any gift; and Sudhana did the kind thing without weighing it, which is the only way that test is passed. Vikram gave him a noose taken back from the lord of death, and said: guard it, and use it but the once. Three wishes also, given into his keeping, to spend with care. The counsel came folded in a riddle, and cost a year to read straight." },
        { title: "IV. The feast and the crowning",
          body: "In that same hour there was a wedding, and a crowning, and the line went on, which is how the old reels like to close a door, though this door did not stay shut. And at the crux each gathered skill was wanted exactly once, in the very order the men had been found in, which is the one tidy thing in the whole telling." },
        { title: "V. The one thing forbidden",
          body: "There was a single rule laid on Sudhana, and it was Admetus the elder, the swift-footed, who laid it; and a single rule in a tale is a hinge: do not open the cup the sun sailed home in. The word was broken, as words in tales are broken, and the cup was opened. And on the morrow one was missing at the morning count, and the empty place at the board said the rest, for there was nothing else to say. What was struck off did not grow back." },
        { title: "VI. The road resolved on",
          body: "Then Sudhana said, right gladly, I shall go; and he meant it more than was wise. He granted the boon before it was named, whatever you ask, you shall have. And he struck a bargain with the thing in the palace of the seven gates, the kind of bargain that is always paid in the one coin you swore you would keep." },
        { title: "VII. Toward the palace of the seven gates",
          body: "So he rode out toward the palace of the seven gates, and the hall watched the dust of him until there was no dust. A thread, a thrown ball of yarn, a bird going on ahead, and Tara of the golden fleece going at his side: by such guides he came to the place, as heroes always come to the place." },
        { title: "VIII. The lack set right",
          body: "In that same hour Atalanta the Returned, the one the tale turns on, was won back, and the cup restored, and the hunger of the kingdom fed. But the island of the sorceress owed a life to the water each year, by the drawing of lots, and this year the lot fell where the lot always falls in tales like this one, which is to say upon the one you could least spare. Iron keeps the account that words forget." },
        { title: "IX. The road home",
          body: "Sudhana set his face back the way the road had come, carrying what he had won and the new weight of the winning, which was heavier than the want had been. The naming, when it came, carried off the bride and the half of the hall in one breath; and of the three wishes, two were spent undoing the first, which is the whole and only history of wishes. He had won her twice, and twice was not enough, for the turn of things does not yield to being asked again. The blow was given. The forge took the rest. The tale is done." }
      ]
    },

    6: {
      n: 6, teller: "Jupiter", title: "The Lie of the False Token",
      frame: "The Wager on the Wife", model: "hand-authored", createdAt: "2026-06-02T00:00:00.000Z",
      movements: [
        { title: "I. How it stood at the island of the sorceress",
          body: "Now the law of a tale is the law of a kingdom, and both of them run on a single man's word; consider this one a case laid before the long table. It is a Hellenic telling, out of the age of heroes, when the gods still walked in to dinner, of a wager laid upon Procne and how the lie of it came at the last undone. In the island of the sorceress there dwelt Bellerophon, swift-footed, and the days were good while they lasted." },
        { title: "II. The feast and the crowning",
          body: "In that same hour Bellerophon wed Procne, the tamer of the winged horse, the one this tale turns upon, and the island kept the feast until the very lamps burned low. And folk add a thing worth the marking: he had kept one secret to the end of it, and it was the keeping, not the deed itself, that he would be made to pay for. Set that by; a kept word and a kept secret are cousins in this tale." },
        { title: "III. The hook in the bargain",
          body: "Then Lykaon the Returned, the worker of the harm to come, came in fair clothing to the island of the sorceress and asked a boon before he would say what it was, which is the oldest snare there is. And it was ever so in that country: the captor had sworn a great oath to keep the door it kept. And the old king, for his part, set Bellerophon a string of impossible labours for Procne's hand, meaning each one of them to be the last of him." },
        { title: "IV. The stolen boast",
          body: "Then Theseus of the golden fleece, the false claimant, stood up in the hall and claimed the bride and the praise both, having done nothing in the world but arrive before the true man did. And by that same great oath Bellerophon was bound; and the door that the oath had sworn to keep was, by the oath, made to open. For a word once given is a chain no king can file through, and it binds the honest hand every bit as fast as the false one." },
        { title: "V. The lack that walked the land",
          body: "And a keening went up then, the old grief-cry, from the hall to the gate to the grey lip of the sea, raised for the thing that had been done and would not be undone. For Lykaon had taken what was wanted and was gone, and the want of it was a wound the whole country felt in its teeth. And mixed into that grief, as the strangest tales will mix things, was a fierce small creature that swore to carry off the child unless its name were guessed inside of three nights." },
        { title: "VI. The road out",
          body: "They ran the keel down to the water and shipped the long oars, and the salt road took them out, days upon days from the sight of any land, the way the sea-tellings always go. And Bellerophon rode out toward the labyrinth under the palace, and the hall watched his dust until there was none; and a thread, a thrown ball of yarn, a bird going on ahead, by such a guide he came to that place. For a death lay unpaid in the account of the island of the sorceress, an old blood owed; and Bellerophon granted the boon before it was named, whatever you ask, you shall have, and so bound himself again." },
        { title: "VII. The knowing run round the hall",
          body: "Then Anchises the Stranger-Guest, a friend at the worst hour, cried it out: it is the hero, it was the hero all along, look at him. And here the tale turns itself over for the joke of it, for the false hero, once exposed, simply explained his lie so charmingly that the whole court came round to his side, and the true hero was left to apologise for the awkwardness of the exposure. Yet the road's grime washed off Bellerophon all the same, and something kingly stood up underneath it, as if it had stood there the whole walk; and the old blood was answered at the last, life for life, by the old reckoning; and the naming, when it came, carried off the bride and the half of the hall in one breath. And the saying stands yet, and the tale is only its proof: a word is a deed not yet done." }
      ]
    },

    7: {
      n: 7, teller: "Saturn", title: "One Blow and the Year Between",
      frame: "The Exchange of Blows", model: "hand-authored", createdAt: "2026-06-02T00:00:00.000Z",
      movements: [
        { title: "I. How it stood at the dark farms of the North",
          body: "All things come to the scythe; even this tale, even this long night. I have numbered a great many of these, and here is another, the one blow and the year stood between the giving and the taking of it back, a Finnic telling with the Arabian worked in, out of the days when a song could hammer iron or sink a boat. I have the beats of it here in my ledger, though not in the order the year first laid them down, and I will read them as they fall, for time scrambles its own accounts and I only keep them. In the dark farms of the North there dwelt Yunan, born upon the knee of the air, and the days were good while they lasted; and a death lay unpaid in the account of that place, an old blood owed." },
        { title: "II. The hook in the bargain",
          body: "Not long thereafter Väinämöinen the Reckless, the worker of the harm to come, came in fair clothing to the dark farms of the North and asked a boon before he would name it, which is the oldest snare there is. And Yunan signed the soft bargain unread, the way a tale needs someone to. For the harm wore a kinsman's face, this Väinämöinen being of Yunan's own blood, which is the worst door that harm ever comes in by." },
        { title: "III. The word laid down",
          body: "It was Joukahainen the Eternal Sage, the old master of those farms, who forbade the one thing, as elders will: touch not the mill that ground out salt and grain and gold for ever, and ask not after its name. And of all who went where that grinding was, Marjatta the Ill-Fated alone came back out of it to tell the thing, which is the only reason you have it now to hear." },
        { title: "IV. Toward the rapids of the great pike",
          body: "And first Yunan took up the helm, and then the ringed shirt, and then the blade that had a name, and last of all the shield; and so was made ready piece by piece, the way the old tellings always arm a man before they spend him. Then he set out from the dark farms of the North with little but a name and a need, and the road took the rest. And on that road stood Aino, the Mistress of the North, the keeper of the way, who set him a small strange test before any gift was named; and Yunan answered as a man ought, sparing the small beast, sharing the last of the bread, keeping the hard word, and so he passed. For a roc that darkened the very noon had held the rapids of the great pike in fear past the reach of any living memory." },
        { title: "V. The struggle at the ford",
          body: "Then Yunan and Väinämöinen met at the ford, and there were no more words left to spend between them. Only the year was up, and the blow was owed, and the water waited to see it paid." },
        { title: "VI. The recognition",
          body: "And it so befell that there they knew Yunan at last: by the mark, by the token, by the very face of the father looking out of the son. For he had given where there was nothing at all to be got by the giving, and the giving came back to him tenfold, as it does in the old tales and so seldom does anywhere else." },
        { title: "VII. The wound that told the tale",
          body: "Now here the tale slips its hand for the grim joke of it. For the mark, the branding that should have fallen on the hero to tell him out ever after, landed instead on the wrong person entirely, on some bystander who had only come to watch, and who wore the scar the rest of his days and dined out on the story of it for years. Believe it as you list. And the harvest came, as the harvest comes, for the corn and the crown alike." },
        { title: "VIII. The true name spoken",
          body: "Ere the week was out the road's grime washed off Yunan, and something kingly stood up underneath it, as if it had been standing there the whole long walk. And the old blood was answered at the last, life for life, by the old reckoning; and where another year would have taken him too, it would not, for Yunan had done at the water the thing that none could do. So they wore their days away, as the old song says they do. It ended, as all the reels end, and I have numbered it and set it by: tale the seventh of the endless night; which is the seventh part of nothing, against the length of the dark." }
      ]
    }

  };

  // tale 1 alias — kept for the prompt's finish reference and back-compat.
  B.exemplar = B.exemplars[1];

  // The hand-authored banter for tale № 1 — the lead-in scene before the telling,
  // matching the deterministic frame spec for n = 1: waxing phase, the watch's
  // tension between Luna ☽ (this watch's teller, the dreamer who loses the thread)
  // and Mercury ☿ (the runner who finishes it for her), glancing at the tale to
  // come and ending with Luna taking up the watch. Same two uses as the telling
  // exemplar: a few-shot quality target for the live banter pass, and the seeded
  // record served for /t/1 before any live render. Attaches to BORGES.exemplarBanter.
  B.exemplarBanter = {
    n: 1, phase: "waxing", pair: ["Luna", "Mercury"], model: "hand-authored",
    createdAt: "2026-06-01T00:00:00.000Z",
    lines: [
      { speaker: "Mercury", line: "Sister, you have the watch, and already you are three turns behind your own thought. Shall I run ahead and finish it, the way I do?" },
      { speaker: "Luna", line: "I had it. A slaying at the water, and a boat that goes by singing, and the rest of it is in the wane somewhere. I set it down a moment ago." },
      { speaker: "Mercury", line: "You set everything down a moment ago. The thread is plain: a kinsman takes what was wanted, the false one steals the boast, the true one comes home grey with road-dust and says nothing. I have it cold. I have them all cold." },
      { speaker: "Luna", line: "That is the trouble with you, runner. You have them cold. I would rather lose the thread and find it again warm; and I am never quite sure whether to thank you for the catch." },
      { speaker: "Mercury", line: "Thank me by telling it slow. There is more night than there is anything else, and we have counted most of it. Spend a little." },
      { speaker: "Luna", line: "Then sit, and mind the chronometer for once. I will tell it as I dreamed it, or the wane of it: Yemelya, at the river of the dead, and the kinsman's face that the trouble wore." }
    ]
  };
})();
