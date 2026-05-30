/* Owain, neu Iarlles y Ffynnon — a faithful middle-grade retelling
   (ages ~8-12), the whole romance across paged spreads. Plot, names, the
   storm-fountain, the won bride, the broken term, the madness, the lion,
   and the rescues kept faithful. The combats and the spell of madness are
   handled with folktale tact — described, not shown graphically. Each
   spread carries an `illus` brief — an art note for the illustration pass;
   it is not shown to the reader.

   SKELETON IN PROGRESS. The cover and the court frame (Movement I) are
   seeded so the Storybook view and the illustration pipeline run from the
   start; the spreads grow movement by movement as the translation proceeds.
   Attaches to window.OWAIN. */
window.OWAIN = window.OWAIN || {};
window.OWAIN.book = {
  meta: {
    kicker: "One of the Three Welsh Romances",
    note: "A faithful retelling for readers 8 and up — Owain, or the Lady of the Fountain, page by page. More spreads to follow as the tale is told; illustrations to follow.",
  },
  spreads: [
    { title: "Owain, or the Lady of the Fountain",
      sub: "One of the Three Welsh Romances — a knight of Arthur's court who rode to a magic fountain, won and lost a lady, ran mad in the wild, and was saved by the friendship of a lion",
      text: "A story of a storm called up from a silver bowl, a black knight who guarded a spring, a maid whose cleverness turned an enemy into a husband, a promise broken by a day, and a lion who never broke faith.",
      illus: "Cover: Owain, a young Welsh knight in his mid-twenties — dark hair to the shoulder, a gold torc at his neck, a deep-blue surcoat over mail — standing in a forest clearing with one hand resting on the mane of a great tawny lion that sits at his side like a loyal hound; behind them, softly painterly, the suggestion of a great tree over a stone-rimmed fountain and a coming storm-light in the sky. Warm gouache-and-watercolour in the Howard Pyle / Edmund Dulac tradition; earthy Welsh palette — mossy greens, ambers, peat-browns — with quiet gold accents and a single cool storm-grey note; Welsh medieval atmosphere, romance not myth." },

    { title: "Arthur's Court at Caerleon",
      text: "Long ago the emperor Arthur held court at Caerleon upon Usk. One day he sat in his chamber with three of his knights — Owain son of Urien, Cynon son of Clydno, and sharp-tongued Cei — while Queen Gwenhwyfar and her maids sewed by the window. “If you will not think the worse of me,” said Arthur, “I will sleep a little while I wait for my meal. Talk among yourselves, and Cei will fetch you mead and meat.” And the emperor closed his eyes and slept.",
      illus: "Interior of a great Welsh medieval hall-chamber at Caerleon, warm afternoon light. King Arthur — a mature, dignified emperor with a slim gold circlet and a deep-red mantle — reclining and dozing on a low dais spread with fresh green rushes and flame-coloured cloth, a red cushion under his elbow. Nearby, three young Welsh knights sit talking quietly: Owain (dark-haired, blue surcoat, gold torc), Cynon, and Cei. At a sunlit window, Queen Gwenhwyfar and her handmaids at needlework. Earthy palette, painterly, child-friendly." },

    { title: "A Tale for Cei",
      text: "Cei went down to the kitchen and the mead-cellar, and came back with a flagon of mead, a golden cup, and a fistful of skewers heaped with roast meat. When they had eaten and begun to drink, Cei said, “Now — someone owes me a story.” “Cynon,” said Owain, “pay Cei the tale he is owed.” “You are the elder and the better teller,” said Cynon, “and you have seen stranger things than I. But — very well. I will tell you of the most shameful day of my life.” And so Cynon began.",
      illus: "The same warm Caerleon hall-chamber. Cei (a broad young steward) setting down a flagon of mead, a golden goblet, and a fistful of skewers of roast meat on a carved oak table; Owain and Cynon leaning in to listen, cups in hand; Arthur still asleep on his dais in the background. Cynon beginning to speak, one hand raised. Firelit, intimate, earthy Welsh medieval palette, painterly, child-friendly." },

    { title: "The Keeper of Beasts",
      text: "“In my younger days,” said Cynon, “I rode out looking for adventure, and came to a shining castle where I was made wonderfully welcome. The lord there sent me on to a strange guardian of the forest. In a wide green clearing I found him: a huge black man on a mound, with one foot and one eye in the middle of his forehead, leaning on a great iron staff. He was lord of all the wild animals. When he struck a stag, every beast of the wood came running and bowed its head to him. ‘Go to the fountain,’ he told me, ‘if it is trouble you are looking for.’”",
      illus: "A wide green forest clearing. The keeper of beasts — an enormous black-skinned wild herdsman seated on a grassy mound, ONE-eyed and ONE-footed, leaning on a great iron club — with wild deer, boar, a stag and other animals gathered and bowing around him. A small armoured knight (Cynon) on horseback at the clearing's edge, looking up in awe. Earthy Welsh palette, painterly, a marvel of the Otherworld, not horror; child-friendly." },

    { title: "The Storm and the Black Knight",
      text: "Cynon told how he poured a bowlful of water on a marble slab beneath a great green tree — and a storm of thunder and hail crashed down, stripping every leaf. Then a knight all in black came thundering up the valley, and with one charge knocked Cynon from his saddle and rode away, leaving him ashamed. When Cynon finished, young Owain said nothing — but the next morning he armed himself in secret and rode the very same road. He reached the fountain, raised the storm, and when the Black Knight came, Owain did not fall: he struck so hard that the knight, mortally wounded, turned and fled.",
      illus: "Beneath a great green tree by a stone-rimmed fountain, a sudden violent tempest of black cloud, white lightning and hail stripping the leaves from the tree — cool storm-grey cutting across the earthy palette. In the foreground two knights clashing on horseback: Owain (dark hair, deep-blue surcoat over mail) driving his sword against the Black Knight (all in black armour on a black horse). Dramatic, painterly, child-friendly, no gore." },

    { title: "The Falling Gate",
      text: "Owain chased the dying knight all the way to a great shining castle. The black knight was let in through the gate — but as Owain galloped after him, a heavy iron portcullis came crashing down. It cut his horse clean in two behind the saddle and trapped Owain between the inner and outer gates, with no way out. Then, through a chink in the gate, a clever bright-eyed maiden appeared. Her name was Luned. “I will help you,” she said, and passed him a gold ring. “Turn the stone into your palm and close your hand: as long as you hide it, it will hide you.”",
      illus: "A castle gatehouse with a heavy iron portcullis crashed down to the ground, trapping a knight (Owain, deep-blue surcoat) between two gates in the gloom; the front half of a horse on the far side. At a small barred opening in the gate, Luned — a clever bright-eyed young maid with dark plaited hair in a blue-grey gown — reaching through to hand him a small gold ring with a dark stone. Tense, painterly, child-friendly, no gore." },

    { title: "The Lady of the Fountain",
      text: "Hidden by the magic ring, Owain watched from a window as the castle buried its lord with a vast crowd, ringing bells, and burning candles. And there, behind the bier, walked the most beautiful woman he had ever seen — the dead knight's widow, her golden hair loose, weeping. In that moment Owain loved her with his whole heart. “Who is she?” he asked. “My mistress,” said Luned — “the Countess of the Fountain, the wife of the man you killed yesterday.” “She is the woman I love best in the world,” said Owain. “Then,” said Luned, “she shall love you too.”",
      illus: "Owain (deep-blue surcoat) standing hidden at a high window of a richly painted chamber, looking down at a great funeral procession in the street below: a white-draped bier carried by nobles, burning wax tapers, singing clergy, a vast armed crowd. At the centre, the Countess of the Fountain — a beautiful noblewoman with loose golden-auburn hair and a torn gold-shot crimson gown — weeping. Solemn, painterly, earthy palette with candle-gold, child-friendly." },

    { title: "How Luned Won the Countess",
      text: "Luned was the cleverest person in the whole story. She went to the grieving Countess and spoke plainly: “Your land can only be kept by a brave defender for the fountain — and the strongest knight of all is the very man who beat your husband.” Little by little, the Countess saw she was right. She called her people together, and they agreed; and bishops came, and the Countess married Owain. The men of the land knelt and pledged him their loyalty. And for three years Owain guarded the fountain so well, and shared everything he won so generously, that no lord in the world was more loved by his people.",
      illus: "A bright Welsh castle hall. A wedding: Owain (now in a fine yellow-and-gold mantle over mail, gold clasps on his shoes) beside the Countess of the Fountain (golden-auburn hair bound in gold, a gold-shot crimson gown), a bishop joining their hands; the clever maid Luned smiling nearby; kneeling barons doing homage. Joyful, warm, painterly, earthy palette with gold accents, child-friendly." },
  ],
};
