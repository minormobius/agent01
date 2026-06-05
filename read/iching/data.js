// ─────────────────────────────────────────────────────────────────────────────
// data.js — an original, openly-licensed translation of the Zhouyi (周易), the
// base text of the Yijing: each hexagram's Judgment (卦辭) and line texts (爻辭).
//
// This is the canonical home of the translation. The Chinese shown is the
// RECEIVED text (the transmitted Wang Bi recension). The English is ours. Notes
// mark graph readings, textual cruxes, and Mawangdui variants. It is a
// transparent WORKING translation — corrections welcome — not a claim to be
// definitive. Licensed CC BY-SA 4.0; the source text is ancient / public domain.
//
// Pilot: Hexagram 1 (乾 Qián) only — the template. 63 to come.
// Shape mirrors read/'s tale data: passages → segments {z, py, e, n}.
// ─────────────────────────────────────────────────────────────────────────────

export const ZHOUYI = {
  meta: {
    title: 'Zhouyi 周易 — an open translation',
    license: 'CC BY-SA 4.0',
    method: "Original translation. The Chinese is the received (Wang Bi) recension; the English is ours. "+
      "Notes flag graph readings, cruxes, and where the Mawangdui silk manuscript differs. A transparent "+
      "working translation, openly licensed — not a claim to definitiveness.",
    sources: [
      { label: 'Zhouyi 周易 · 乾 — received text', url: 'https://ctext.org/book-of-changes/qian', host: 'Chinese Text Project (ctext.org)' },
      { label: 'James Legge, The Yî King (Sacred Books of the East XVI, 1882) — reference', url: 'https://sacred-texts.com/ich/index.htm', host: 'sacred-texts.com (public domain)' },
      { label: 'Mawangdui silk Yijing — variants', url: 'https://en.wikipedia.org/wiki/Mawangdui_Silk_Texts', host: 'Wikipedia' },
    ],
  },

  hexagrams: {
    1: {
      no: 1,
      name: { zh: '乾', py: 'Qián', en: 'The Creative · Force' },
      figure: '111111',                   // bottom→top, 1 = yang
      judgment: {
        z: '元亨利貞', py: 'yuán hēng lì zhēn',
        e: 'The Creative. From the origin it flows through to success; it furthers, and it rewards the steadfast.',
        n: '元亨利貞 — read by the Confucian Wings as four cardinal virtues: 元 origin/sublimity, 亨 success '+
           '(originally 享, an offering “accepted”), 利 benefit/furthering, 貞 steadfast correctness. The oldest '+
           'layer reads more plainly as an omen — “a great offering; favourable to divine” — since 貞 in Shang '+
           'oracle-bone use means “to put a question to the oracle.” We render the received virtue-sense and flag '+
           'the divinatory root. In the Mawangdui silk text the hexagram is written 鍵 (jiàn), not 乾.',
      },
      lines: [
        { pos: 1, name: '初九', z: '潛龍勿用', py: 'qián lóng wù yòng',
          e: 'Nine at the beginning: a dragon lies hidden. Do not act.',
          n: '潛龍, the submerged dragon — power present but not yet to be used. The lowest place: the time of '+
             'concealment. 勿用, “do not employ it.”' },
        { pos: 2, name: '九二', z: '見龍在田，利見大人', py: 'xiàn lóng zài tián, lì jiàn dàrén',
          e: 'Nine in the second place: the dragon appears in the field. It furthers one to see the great person.',
          n: 'The graph 見 turns twice: first as xiàn, “appears,” then as jiàn, “to see” — a deliberate pivot. '+
             '在田, “in the field”: emerged, but still on the ground. 大人, the great person — one of standing whose '+
             'help now counts; the second place answers to the fifth, the throne.' },
        { pos: 3, name: '九三', z: '君子終日乾乾，夕惕若厲，无咎', py: 'jūnzǐ zhōngrì qián-qián, xī tì ruò lì, wú jiù',
          e: 'Nine in the third place: the noble one is tireless the whole day through, and at nightfall still wary, as though in danger. No blame.',
          n: '乾乾 reduplicates the hexagram’s own name as a verb — “strong-and-strong,” ceaselessly diligent. '+
             '惕 wary/anxious; 若厲, “as if there were danger.” The third place is the exposed top of the lower '+
             'trigram, a place of risk; vigilance there earns 无咎, “no blame.”' },
        { pos: 4, name: '九四', z: '或躍在淵，无咎', py: 'huò yuè zài yuān, wú jiù',
          e: 'Nine in the fourth place: now it leaps up, now it stays in the deep. No blame.',
          n: '或, “at times / perhaps”; 躍, to leap; 淵, the abyss-pool. The dragon hesitates at the threshold '+
             'between depth and flight — the fourth place, just below the throne, is a place of testing. Either '+
             'way, rightly taken, is blameless.' },
        { pos: 5, name: '九五', z: '飛龍在天，利見大人', py: 'fēi lóng zài tiān, lì jiàn dàrén',
          e: 'Nine in the fifth place: the dragon flies in heaven. It furthers one to see the great person.',
          n: 'The ruling line: a firm line in the honoured, central fifth place — its proper seat. 飛龍在天 is '+
             'power fully come into its own.' },
        { pos: 6, name: '上九', z: '亢龍有悔', py: 'kàng lóng yǒu huǐ',
          e: 'Nine at the top: the dragon overreaches; there is regret.',
          n: '亢 (kàng), strained too high, overweening (the graph also means “throat”). Past the fifth there is '+
             'nowhere left to climb; force pressed beyond its peak brings 悔, “regret.”' },
      ],
      useLine: {
        name: '用九', z: '見群龍无首，吉', py: 'jiàn qún lóng wú shǒu, jí',
        e: 'Using the nines: a host of dragons appears, none of them foremost. Auspicious.',
        n: 'Read only when all six lines are old yang (all changing). 群龍无首, “a flock of dragons without a '+
           'head” — strength that does not insist on leading. Hexagrams 1 and 2 alone carry such an all-lines '+
           'text (here 用九; in Kūn, 用六).',
      },
      note: 'The six lines trace one image through six stages — the dragon hidden, appearing, toiling, poised, '+
            'soaring, overreaching: the life-curve of any rising force, and the warning folded into its peak.',
    },

    2: {
      no: 2,
      name: { zh: '坤', py: 'Kūn', en: 'The Receptive · Field' },
      figure: '000000',
      judgment: {
        z: '元亨，利牝馬之貞。君子有攸往，先迷後得主，利。西南得朋，東北喪朋。安貞吉。',
        py: 'yuán hēng, lì pìnmǎ zhī zhēn. jūnzǐ yǒu yōu wǎng, xiān mí hòu dé zhǔ, lì. xīnán dé péng, dōngběi sàng péng. ān zhēn jí.',
        e: 'The Receptive. From the origin, success; favourable is the steadfastness of a mare. The noble one has somewhere to go: at first he loses the way, but later finds a master. Favourable. In the southwest he gains companions; in the northeast he loses companions. In quiet steadfastness, good fortune.',
        n: 'Earth to Heaven’s heaven — yielding strength. The 牝馬 “mare” is receptive yet tireless; she follows, and following finds her lord (先迷後得主). The directions are the trigram’s placements — Kūn’s home is the southwest; she gains her own kind there and parts from companions in the northeast. 朋 “companions” also named a unit of paired cowries, so a faint sense of “gains/loses wealth” shadows the line.',
      },
      lines: [
        { pos: 1, name: '初六', z: '履霜，堅冰至', py: 'lǚ shuāng, jiān bīng zhì',
          e: 'Six at the beginning: treading on hoarfrost — the hard ice is coming.',
          n: 'The first sign read for what it foretells: frost underfoot means the ice is on its way. Small beginnings accumulate; the yielding power, just stirring, already implies its full winter.' },
        { pos: 2, name: '六二', z: '直方大，不習无不利', py: 'zhí fāng dà, bù xí wú bù lì',
          e: 'Six in the second place: straight, square, vast. Without effort, nothing is unfavourable.',
          n: '直方大 — upright, four-square, broad: the virtues of earth itself. 不習, “without rehearsal”: earth’s rectitude is natural, not learned. The central, correct line of the Receptive needs no contrivance.' },
        { pos: 3, name: '六三', z: '含章可貞，或從王事，无成有終', py: 'hán zhāng kě zhēn, huò cóng wáng shì, wú chéng yǒu zhōng',
          e: 'Six in the third place: holding hidden brilliance, one may stay steadfast. Should you enter the king’s service, claim no completion of your own — yet there is a good end.',
          n: '含章, to “contain the pattern” — keep your brightness veiled. 无成有終: take no credit (无成), and the work still comes to a good close (有終). Serving from the third place, the way of the Receptive is to finish the task without owning it.' },
        { pos: 4, name: '六四', z: '括囊，无咎无譽', py: 'kuò náng, wú jiù wú yù',
          e: 'Six in the fourth place: a tied-up sack. No blame, no praise.',
          n: '括囊, to draw the mouth of the bag shut — prudent reticence near the throne. Say and risk nothing: you earn neither fault nor fame. Safe, and unremarkable.' },
        { pos: 5, name: '六五', z: '黃裳，元吉', py: 'huáng cháng, yuán jí',
          e: 'Six in the fifth place: a yellow lower-garment. Supreme good fortune.',
          n: 'The famous line. 黃 yellow is earth’s colour and the colour of the centre/mean; 裳 is the lower skirt, the garment of the subordinate. Adornment worn humbly and below — sovereignty exercised in the yielding mode. The ruler-place of the Receptive, doing right by staying low.' },
        { pos: 6, name: '上六', z: '龍戰于野，其血玄黃', py: 'lóng zhàn yú yě, qí xiě xuán huáng',
          e: 'Six at the top: dragons battle in the wilds; their blood is black and yellow.',
          n: 'Yielding grown to its extreme contends with the firm: 龍戰于野, dragons at war in the open field. 玄黃 — “black and yellow,” the colours of Heaven (玄) and Earth (黃): cosmic blood. The overreach of the Receptive when it forgets to follow.' },
      ],
      useLine: {
        name: '用六', z: '利永貞', py: 'lì yǒng zhēn',
        e: 'Using the sixes: favourable is lasting steadfastness.',
        n: 'Read when all six lines are old yin (all changing). The yielding’s whole virtue, distilled: not a single act but 永貞 — constancy held for the long term. Kūn’s all-lines text, the counterpart to Qián’s 用九.',
      },
      note: 'From frost underfoot to dragons warring in the field, the six lines trace the rise of the yielding power — and its one danger: that following, grown to extremity, forgets it was meant to follow.',
    },

    11: {
      no: 11,
      name: { zh: '泰', py: 'Tài', en: 'Peace · Pervading' },
      figure: '111000',
      judgment: {
        z: '小往大來，吉亨。', py: 'xiǎo wǎng dà lái, jí hēng.',
        e: 'Peace. The small departs, the great approaches. Good fortune, success.',
        n: 'Heaven (Qián) below, Earth (Kūn) above — and so the light, rising, and the heavy, sinking, move toward each other and interpenetrate. 小 (the yielding) goes, 大 (the firm) comes: the favourable exchange. The season when high and low actually meet.',
      },
      lines: [
        { pos: 1, name: '初九', z: '拔茅茹，以其彙，征吉', py: 'bá máo rú, yǐ qí huì, zhēng jí',
          e: 'Nine at the beginning: pulling up the cogon-grass, its roots come tangled together, each with its kind. To set forth: good fortune.',
          n: '拔茅茹 — tug one reed and its matted roots come with it. 以其彙, “with its kind”: a worthy man drawn into office draws his fellows after him. In the rising season, to advance (征) is right.' },
        { pos: 2, name: '九二', z: '包荒，用馮河，不遐遺，朋亡，得尚于中行', py: 'bāo huāng, yòng píng hé, bù xiá yí, péng wáng, dé shàng yú zhōng háng',
          e: 'Nine in the second place: embracing the wasteland; fording the river on foot; not abandoning the far-off; partisanship gone — thus he wins esteem by the middle course.',
          n: 'A minister of great compass: 包荒, take in even the wild and waste; 馮河, ford the He bare-legged (boldness); 不遐遺, neglect nothing distant; 朋亡, let faction fall away. By 中行, the central path, he is upheld.' },
        { pos: 3, name: '九三', z: '无平不陂，无往不復，艱貞无咎，勿恤其孚，于食有福', py: 'wú píng bù pō, wú wǎng bù fù, jiān zhēn wú jiù, wù xù qí fú, yú shí yǒu fú',
          e: 'Nine in the third place: no plain without a slope, no going without a return. Steadfast through hardship — no blame. Do not fret over your good faith; in your sustenance there is blessing.',
          n: 'The turn, set at the top of the lower trigram: every level ground tilts (无平不陂), every departure circles back (无往不復). Peace already contains its reversal, so hold constant in the hard stretch. 孚, good faith, need not be anxiously guarded; daily bread will not fail.' },
        { pos: 4, name: '六四', z: '翩翩不富，以其鄰，不戒以孚', py: 'piānpiān bù fù, yǐ qí lín, bù jiè yǐ fú',
          e: 'Six in the fourth place: fluttering down, not rich, together with its neighbours — not on guard, but in good faith.',
          n: '翩翩, lightly descending; 不富, the empty yin lines have no wealth to hoard. The upper, yielding lines come down to meet the firm below 以其鄰 (with their neighbours), 不戒以孚 — without suspicion, through trust. High condescends to low, and is believed.' },
        { pos: 5, name: '六五', z: '帝乙歸妹，以祉元吉', py: 'dì yǐ guī mèi, yǐ zhǐ yuán jí',
          e: 'Six in the fifth place: King Yi gives his younger sister in marriage; thereby blessing, and supreme good fortune.',
          n: '帝乙歸妹 — a historical allusion: the Shang king Di Yi marrying off a royal woman (the same event named at Hexagram 54). The sovereign, in the yielding fifth place, condescends in alliance: rank that lowers itself to join brings 祉, blessing.' },
        { pos: 6, name: '上六', z: '城復于隍，勿用師，自邑告命，貞吝', py: 'chéng fù yú huáng, wù yòng shī, zì yì gào mìng, zhēn lìn',
          e: 'Six at the top: the city wall falls back into the moat. Do not use the army. From your own town, proclaim the command. Steadfast — yet remorse.',
          n: '城復于隍 — the rampart crumbles back into the dry ditch it was dug from: Peace, at its limit, collapses into Standstill. 勿用師, do not fight it; 自邑告命, retrench and govern your own. Even constancy (貞) now meets 吝, regret. Every Tài carries its Pǐ.' },
      ],
      note: 'Heaven below and Earth above, the two at last meeting — yet the sixth line warns the wall returns to the ditch. Peace is the season in which its own reversal is already growing.',
    },

    12: {
      no: 12,
      name: { zh: '否', py: 'Pǐ', en: 'Standstill · Obstruction' },
      figure: '000111',
      judgment: {
        z: '否之匪人，不利君子貞，大往小來。', py: 'pǐ zhī fěi rén, bù lì jūnzǐ zhēn, dà wǎng xiǎo lái.',
        e: 'Standstill. It is the work of the wrong people; it does not further the noble one’s steadfastness. The great departs and the small approaches.',
        n: 'Earth below, Heaven above — each withdraws to its own side and they do not meet: stagnation, the exact mirror of Tài. 否之匪人 is a knot: literally “standstill — not [the right] people,” which we read as “the doing of the wrong sort.” 大往小來: now the firm (大) goes and the yielding (小) comes — the unfavourable exchange.',
      },
      lines: [
        { pos: 1, name: '初六', z: '拔茅茹，以其彙，貞吉亨', py: 'bá máo rú, yǐ qí huì, zhēn jí hēng',
          e: 'Six at the beginning: pulling up the cogon-grass, its roots tangled, each with its kind. Steadfast: good fortune, success.',
          n: 'The same uprooted reeds as Tài’s first line, but read in reverse: in Standstill the worthy withdraw together, as a body. To hold firm (and lie low) is auspicious — the retreat is principled, not a rout.' },
        { pos: 2, name: '六二', z: '包承，小人吉，大人否亨', py: 'bāo chéng, xiǎo rén jí, dàrén pǐ hēng',
          e: 'Six in the second place: bearing it with submission. For the small person, good fortune; for the great person, standstill — and so, success.',
          n: 'A debated line. 包承, to take it and serve/submit. In a stagnant time petty men thrive (小人吉); the great person accepts the standstill (大人否) rather than collude, and that acceptance is itself the way through (亨).' },
        { pos: 3, name: '六三', z: '包羞', py: 'bāo xiū',
          e: 'Six in the third place: harbouring shame.',
          n: 'Two characters only. 包羞 — to swallow disgrace: a yielding line wrongly placed, holding in a shame it cannot yet voice.' },
        { pos: 4, name: '九四', z: '有命无咎，疇離祉', py: 'yǒu mìng wú jiù, chóu lí zhǐ',
          e: 'Nine in the fourth place: there is a mandate; no blame. Those of his kind partake of the blessing.',
          n: 'The turn begins as the firm lines arrive above. 有命, a charge from on high, makes action blameless; 疇 (“fellows, his sort”) 離 (cleave to / share in) 祉 (blessing) — and his companions share what comes.' },
        { pos: 5, name: '九五', z: '休否，大人吉。其亡其亡，繫于苞桑', py: 'xiū pǐ, dàrén jí. qí wáng qí wáng, xì yú bāo sāng',
          e: 'Nine in the fifth place: bringing the standstill to rest. For the great person, good fortune. “Lest it perish! lest it perish!” — bind it to a cluster of mulberry roots.',
          n: 'The famous caution. 休否, the ruler halts the stagnation; but security is held only by vigilance — 其亡其亡, “it may fall, it may fall,” and so 繫于苞桑, lash it to the deep-rooted mulberry. The Xici singles this line out: the wise keep danger in mind even when safe.' },
        { pos: 6, name: '上九', z: '傾否，先否後喜', py: 'qīng pǐ, xiān pǐ hòu xǐ',
          e: 'Nine at the top: the standstill tips over. First standstill, then joy.',
          n: '傾否 — stagnation, top-heavy, overturns of itself. Unlike a mountain, Standstill does not last; pushed to its limit it ends, and what follows the obstruction is gladness.' },
      ],
      note: 'Heaven and Earth draw apart and the world stalls — but Standstill is a season, not a fate. Its final line tips it over: first obstruction, then joy.',
    },

    63: {
      no: 63,
      name: { zh: '既濟', py: 'Jì Jì', en: 'After Completion' },
      figure: '101010',
      judgment: {
        z: '亨小，利貞，初吉終亂。', py: 'hēng xiǎo, lì zhēn, chū jí zhōng luàn.',
        e: 'After Completion. Success in small things; it furthers to be steadfast. At first, good fortune; in the end, disorder.',
        n: 'Water over fire — and every one of the six lines stands in its proper place (firm in the odd seats, yielding in the even): the one figure of perfect order. 既濟, “already forded.” Yet order at its peak is exactly where the slide begins: 初吉終亂.',
      },
      lines: [
        { pos: 1, name: '初九', z: '曳其輪，濡其尾，无咎', py: 'yè qí lún, rú qí wěi, wú jiù',
          e: 'Nine at the beginning: he drags his wheels, he wets his tail. No blame.',
          n: 'Restraint at the outset: 曳其輪, braking the cart-wheels; 濡其尾, the animal fording wets its tail and so goes slowly. Holding back at the start of completion — no blame.' },
        { pos: 2, name: '六二', z: '婦喪其茀，勿逐，七日得', py: 'fù sàng qí fú, wù zhú, qī rì dé',
          e: 'Six in the second place: the wife loses the screen of her carriage. Do not chase it; in seven days she gets it back.',
          n: '茀, the curtain that screens a woman’s carriage — her seemly conveyance. Lost, it should not be pursued; the cycle restores it 七日 (the recurring “seven days,” the turn of a small period). Wait, and what is proper returns.' },
        { pos: 3, name: '九三', z: '高宗伐鬼方，三年克之，小人勿用', py: 'gāo zōng fá guǐ fāng, sān nián kè zhī, xiǎo rén wù yòng',
          e: 'Nine in the third place: Gao Zong attacks the Demon Territory; in three years he subdues it. Do not employ petty people.',
          n: 'History again: 高宗 is the Shang king Wu Ding; 鬼方, the Guifang, a frontier people. A great undertaking that costs three years — 小人勿用, no work for small men. Completion won by long and disciplined effort.' },
        { pos: 4, name: '六四', z: '繻有衣袽，終日戒', py: 'rú yǒu yī rú, zhōng rì jiè',
          e: 'Six in the fourth place: the finest silk will have its rags; all day be on guard.',
          n: 'A textually hard line. The plainest sense keeps the boat-image of the hexagram: hold rags (衣袽) ready to plug the leaks even in fine cloth (繻); stay watchful 終日, all day long. After the crossing is made, decay seeps in at the seams.' },
        { pos: 5, name: '九五', z: '東鄰殺牛，不如西鄰之禴祭，實受其福', py: 'dōng lín shā niú, bù rú xī lín zhī yuè jì, shí shòu qí fú',
          e: 'Nine in the fifth place: the eastern neighbour slaughters an ox, but it does not match the western neighbour’s small spring offering, which truly receives the blessing.',
          n: 'Lavishness against sincerity. The 殺牛 ox-sacrifice of the east is outweighed by the modest 禴 (spring) offering of the west, because the latter 實受其福 — really receives the blessing. At completion’s height, what counts is the timely and the heartfelt, not the grand.' },
        { pos: 6, name: '上六', z: '濡其首，厲', py: 'rú qí shǒu, lì',
          e: 'Six at the top: he wets his head. Danger.',
          n: 'The ford overreaches at the very end: the animal that wet only its tail at the start (line 1) now goes in over its head (濡其首). 厲, danger — completion pressed one step too far comes undone.' },
      ],
      note: 'The single figure where every line sits correctly — perfect order — and precisely there the warning is written: order completed is order beginning to come apart.',
    },

    64: {
      no: 64,
      name: { zh: '未濟', py: 'Wèi Jì', en: 'Before Completion' },
      figure: '010101',
      judgment: {
        z: '亨，小狐汔濟，濡其尾，无攸利。', py: 'hēng, xiǎo hú qì jì, rú qí wěi, wú yōu lì.',
        e: 'Before Completion. Success. The little fox, all but across, wets its tail. Nothing is favourable [if it falters].',
        n: 'Fire over water — and now every line is out of its proper place: the figure of the not-yet-finished. 未濟, “not yet forded.” The 小狐 little fox 汔 (almost) makes the crossing, then wets its tail at the last step. The book closes not on completion but on the threshold — change goes on.',
      },
      lines: [
        { pos: 1, name: '初六', z: '濡其尾，吝', py: 'rú qí wěi, lìn',
          e: 'Six at the beginning: he wets his tail. Remorse.',
          n: 'Rushing the crossing from the lowest place, the tail dips at once. 吝, cause for regret: an over-eager start before completion.' },
        { pos: 2, name: '九二', z: '曳其輪，貞吉', py: 'yè qí lún, zhēn jí',
          e: 'Nine in the second place: he drags his wheels. Steadfast: good fortune.',
          n: '曳其輪, braking the wheels — patience and restraint in the central second place. To hold steady (貞) rather than push is auspicious.' },
        { pos: 3, name: '六三', z: '未濟，征凶，利涉大川', py: 'wèi jì, zhēng xiōng, lì shè dà chuān',
          e: 'Six in the third place: before completion; to set forth brings misfortune — yet it furthers to cross the great water.',
          n: 'A real crux: 征凶 (advancing now is ominous, you are not ready) sits oddly beside 利涉大川 (it furthers to cross the great stream). Many take the second clause as the goal one must eventually face; some editions read 不利涉大川, “it does not further to cross.” We give the received text and flag the tension.' },
        { pos: 4, name: '九四', z: '貞吉，悔亡，震用伐鬼方，三年有賞于大國', py: 'zhēn jí, huǐ wáng, zhèn yòng fá guǐ fāng, sān nián yǒu shǎng yú dà guó',
          e: 'Nine in the fourth place: steadfast, good fortune; regret vanishes. With rousing force he attacks the Demon Territory; in three years there are rewards from the great state.',
          n: '震, thunderous energy, thrown into the same frontier war (伐鬼方) named at Hexagram 63. Sustained effort across the threshold is, after three years, 有賞于大國 — rewarded by the great kingdom. The push that finishes the crossing.' },
        { pos: 5, name: '六五', z: '貞吉，无悔，君子之光，有孚吉', py: 'zhēn jí, wú huǐ, jūnzǐ zhī guāng, yǒu fú jí',
          e: 'Six in the fifth place: steadfast, good fortune, no regret. The light of the noble one; there is good faith — good fortune.',
          n: '君子之光, the radiance of the noble one, near the completion; 有孚, sincerity that shines and is trusted. The ruling place of Before Completion, lit from within.' },
        { pos: 6, name: '上九', z: '有孚于飲酒，无咎，濡其首，有孚失是', py: 'yǒu fú yú yǐn jiǔ, wú jiù, rú qí shǒu, yǒu fú shī shì',
          e: 'Nine at the top: there is good faith in the drinking of wine. No blame. But should he wet his head, his good faith loses what is right.',
          n: 'The last line of the book. To celebrate at the brink with confidence (有孚于飲酒) is blameless — but 濡其首, to wet one’s head in the cup, and the very sincerity 失是, loses the mark. The Zhouyi ends not on triumph but on a caution against losing measure on the threshold of completion.' },
      ],
      note: 'Fire above water, every line out of place: the unfinished crossing. The classic ends with the little fox at the brink and a last warning — change is never finished, and measure must hold to the final step.',
    },
  },
};

if (typeof window !== 'undefined') window.ZHOUYI = ZHOUYI;
