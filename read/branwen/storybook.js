/* Branwen ferch Llŷr — a faithful retelling for readers ~8 and up, the whole
   Second Branch across paged spreads. It is a tragedy, and the hardest beats
   (the blow to Branwen, the child in the fire, the battle) are handled with
   folktale tact — named, not shown graphically. Each spread carries an `illus`
   brief — an art note for the illustration pass; it is not shown to the reader.

   SKELETON IN PROGRESS. The cover and the marriage (Movement I) are seeded so
   the Storybook view and the illustration pipeline run from the start; the
   spreads grow movement by movement. Attaches to window.BRANWEN. */
window.BRANWEN = window.BRANWEN || {};
window.BRANWEN.book = {
  meta: {
    kicker: "The Second Branch of the Mabinogi",
    note: "A faithful retelling for readers 8 and up — Branwen daughter of Llŷr, page by page. A great old Welsh story, and a sad one, told with care. More spreads to follow; illustrations to follow.",
  },
  spreads: [
    { title: "Branwen ferch Llŷr",
      sub: "The Second Branch of the Mabinogi — a tale of a marriage between two islands, a quarrel that could not be mended, a cauldron that gave back the dead, and a giant king whose head went on speaking long after he was gone",
      text: "Long ago, when a giant was king of the Island of Britain, his sister Branwen was married across the sea to the king of Ireland, to make the two islands friends. But a cruel trick spoiled the peace before it began — and from that one unkindness grew a war that emptied both lands. This is her story.",
      illus: "Cover: Bendigeidfran, an immense, noble bearded giant-king in a deep-blue and gold royal mantle with a simple gold crown, seated on a great grey sea-cliff (the rock of Harlech) and gazing out over a grey-green sea; he dwarfs the people around him. Beside him a fair young woman with long dark hair (Branwen) in a green gown. Far out on the water, thirteen ships with bright satin sails approach. Warm gouache-and-watercolour in the Howard Pyle / Edmund Dulac tradition; earthy Welsh palette — slate-greys, sea-greens, ambers, with quiet gold — a mythic, faintly sorrowful grandeur; child-friendly." },

    { title: "The King on the Rock of Harlech",
      text: "Bendigeidfran — which means Brân the Blessed — was so vast a king that no house could hold him. One afternoon he sat on the great rock of Harlech above the sea, with his brother Manawydan and his two half-brothers: gentle Nisien, who could make peace between enemies, and Efnisien, who could start a quarrel between the best of friends. As they sat, they saw thirteen ships come speeding from Ireland, a shield held point-upward on the foremost — the sign that they came in peace.",
      illus: "On a vast grey sea-cliff at Harlech, the giant king Bendigeidfran (immense, bearded, blue-and-gold mantle, gold crown) seated and looking out to sea, with three much smaller men standing near him: Manawydan, and the half-brothers Nisien (kind-faced) and Efnisien (sharp, sullen-faced). Below on the grey-green water, thirteen fine ships with satin flags approach, a round shield raised point-up above the lead ship. Earthy Welsh palette, sea-light, painterly, child-friendly." },

    { title: "The Wedding at Aberffraw",
      text: "The ships carried Matholwch, king of Ireland. He had come to ask for Branwen — one of the three chief ladies of Britain, and the fairest maiden in the world — so that the two islands might be joined and made stronger together. The king agreed, and at Aberffraw they held the wedding feast. But because no house could ever contain the giant Bendigeidfran, the whole feast was held outdoors, under great tents. There Branwen was married to Matholwch, and for a little while there was nothing but gladness.",
      illus: "A great open-air wedding feast under huge bright tents by the sea at Aberffraw. The giant king Bendigeidfran (too large for any building) seated at the head with his brother Manawydan; opposite, Matholwch king of Ireland (a dignified red-haired king in green and gold) with the fair dark-haired Branwen beside him in a fine gown. Long tables, candle-light and daylight, banners; joyful but with a faint air of foreboding. Earthy Welsh palette with gold, painterly, child-friendly." },

    { title: "The Quarrel and the Magic Cauldron",
      text: "All might have been well — but Efnisien, the brother who loved to make trouble, was angry that no one had asked his leave before his sister was married away. In spite, he spoiled Matholwch's fine horses, and the king of Ireland was so insulted that he made for his ships in anger. To mend the quarrel, Brân gave Matholwch new horses, a staff of silver and a plate of gold — and last of all a wonder, a great old cauldron with a terrible magic in it: any man slain in battle, if he were laid inside it, would rise next morning as strong as ever — but he would never be able to speak again. Matholwch was glad of the gift, and sailed home to Ireland with Branwen; and for a while there was peace.",
      illus: "At the tented feast at Aberffraw by the sea, the giant king Bendigeidfran gestures toward a huge, ancient dark-bronze cauldron (the Cauldron of Rebirth) standing on a low fire, its rim worked with old spiralling Celtic ornament; Matholwch, the red-haired king of Ireland in green and gold, regards it with wonder and unease. Warm hall-light under the great tents; earthy Welsh palette with gold and a cold gleam off the cauldron; painterly, child-friendly, a sense of uncanny power." },

    { title: "Branwen and the Starling",
      text: "In Ireland, the king's men were still so angry about the spoiled horses that they took it out on Branwen. They sent her out of the king's hall to work in the kitchen, and forbade any ship to cross to Britain, so that her brother would never learn how she was treated. But Branwen was patient, and clever. Beside her kneading-trough she raised a little starling, and taught it to speak, and taught it what her brother looked like. Then she wrote down all her sorrows in a letter, tied it carefully under the bird's wing, and sent it flying out over the sea. And the starling found Bendigeidfran far away in Wales, and landed on his great shoulder; and when he read her letter, he wept.",
      illus: "Branwen, now in plain grey wool, sad but dignified, kneeling by a kitchen kneading-trough beside a small window that looks out over a grey sea; she gently cups a small speckled starling, a tiny folded letter bound under one of its wings. Soft, tender light; earthy muted Welsh palette; hopeful amid sorrow; painterly, child-friendly, handled with folktale gentleness." },

    { title: "He Who Would Be a Leader, Let Him Be a Bridge",
      text: "When word of Branwen's suffering reached him, Bendigeidfran was filled with grief and anger. He gathered the men of all Britain and crossed the sea to Ireland — and because he was a giant, he simply waded through the water while his ships sailed beside him. The Irish were so afraid that they fled across a deep river and broke down its only bridge. But Brân said, \"He who would be a leader, let him be a bridge.\" And he lay down across the river with his own great body, and his whole army laid down hurdles upon him and walked over him, safe and dry, to the far side.",
      illus: "The giant king Bendigeidfran lying face-down across a wide deep river to make a living bridge of his own body, long hurdles and planks laid along his broad back; his armed host of Welsh warriors walking across him to the far bank. Beyond, the sea and the masts of ships. A scene of awe and sombre grandeur; earthy Welsh palette, cold river-light; painterly, child-friendly." },

    { title: "The Feast that Turned to Fire",
      text: "In the great house the two peoples sat down to feast, and the boy Gwern was made king of Ireland, and passed from one loving uncle to the next. But when he came to Efnisien, that cruel man did a terrible thing, and the little boy was lost in the fire; and Branwen would have thrown herself in after her son had her brother Brân not held her fast. In an instant the whole hall was at war. The Irish had the magic cauldron, and cast their fallen into it, so that each dawn their dead rose to fight again, and the men of Britain could not win. Then Efnisien, sick with grief for the ruin he had made, hid among the Irish dead; and when they threw him into the cauldron, he stretched and strained with all his might until the great cauldron burst into four pieces — and his own heart broke with it. He gave his life to undo his worst deed.",
      illus: "Inside a great firelit hall in uproar, the huge ancient bronze Cauldron of Rebirth splitting apart into four pieces in a burst of sparks and cold light; the lean dark figure of Efnisien straining inside it with his last strength. Dim, armoured figures struggle in the smoky background — suggested, not graphic. Dramatic chiaroscuro, cold cauldron-gleam against fire-orange; earthy palette; sombre, painterly, child-friendly, no gore." },
  ],
};
